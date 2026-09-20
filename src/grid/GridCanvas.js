// Renders a deck's square grid as SVG, handles pan/zoom, and (build-order
// step 3) is the drop target for catalog-mode component placement.
//
// SVG (not <canvas>) so that later build-order steps — walls/doors as line
// segments, lights as points, component footprints as rects/polygons — can
// each be a real, individually selectable DOM node with native pointer
// events, instead of hand-rolled hit-testing on a canvas. The grid itself is
// a single tiled <pattern> fill rather than one element per cell, since
// zone-fill painting (a later step) hit-tests cells via screenToGrid()
// coordinate math anyway, not by clicking per-cell elements.
//
// One shared <g id="viewport"> transform group holds the grid background and
// the components layer, so pan/zoom is a single transform that moves
// everything together with no per-layer logic.

import { footprintFor, isWithinBounds, findCollision } from "./snapping.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.1;

const CATEGORY_COLORS = {
  accommodation: "#8ecae6",
  common: "#ffb703",
  operations: "#219ebc",
  engineering: "#fb8500",
  weapons: "#e63946",
  access: "#adb5bd"
};

export class GridCanvas {
  constructor(container, { widthSquares, heightSquares, pixelsPerSquare, componentLibrary = [] }) {
    this.container = container;
    this.widthSquares = widthSquares;
    this.heightSquares = heightSquares;
    this.pixelsPerSquare = pixelsPerSquare;

    this.library = new Map(componentLibrary.map((type) => [type.id, type]));
    this.components = []; // PlacedComponent[]
    this.selectedId = null;

    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;

    this.isDragging = false;
    this.dragStart = null; // {x, y, panX, panY}
  }

  init() {
    this.svg = document.createElementNS(SVG_NS, "svg");
    this.svg.setAttribute("id", "stage");

    const defs = document.createElementNS(SVG_NS, "defs");
    const pattern = document.createElementNS(SVG_NS, "pattern");
    pattern.setAttribute("id", "grid-cell");
    pattern.setAttribute("width", this.pixelsPerSquare);
    pattern.setAttribute("height", this.pixelsPerSquare);
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    const cellRect = document.createElementNS(SVG_NS, "rect");
    cellRect.setAttribute("width", this.pixelsPerSquare);
    cellRect.setAttribute("height", this.pixelsPerSquare);
    cellRect.setAttribute("fill", "none");
    cellRect.setAttribute("stroke", "#888");
    cellRect.setAttribute("stroke-width", "1");
    cellRect.setAttribute("vector-effect", "non-scaling-stroke");
    pattern.appendChild(cellRect);
    defs.appendChild(pattern);
    this.svg.appendChild(defs);

    this.viewport = document.createElementNS(SVG_NS, "g");
    this.viewport.setAttribute("id", "viewport");
    this.svg.appendChild(this.viewport);

    this.gridRect = document.createElementNS(SVG_NS, "rect");
    this.gridRect.setAttribute("x", "0");
    this.gridRect.setAttribute("y", "0");
    this.gridRect.setAttribute("width", this.widthSquares * this.pixelsPerSquare);
    this.gridRect.setAttribute("height", this.heightSquares * this.pixelsPerSquare);
    this.gridRect.setAttribute("fill", "url(#grid-cell)");
    this.viewport.appendChild(this.gridRect);

    this.componentsLayer = document.createElementNS(SVG_NS, "g");
    this.componentsLayer.setAttribute("id", "components-layer");
    this.viewport.appendChild(this.componentsLayer);

    this.container.appendChild(this.svg);

    this._wireEvents();
    this._render();
    this._renderComponents();
  }

  // Converts a screen-pixel coordinate (e.g. from a PointerEvent's
  // clientX/clientY, adjusted for the SVG's own bounding rect) into grid-
  // square coordinates. Nothing in Step 1 consumes this yet, but later
  // steps (component placement, zone-fill painting) will need exactly this
  // conversion, so it's established now against the same pan/zoom state
  // the renderer itself uses.
  screenToGrid(screenX, screenY) {
    const worldX = (screenX - this.panX) / this.zoom;
    const worldY = (screenY - this.panY) / this.zoom;
    return {
      col: worldX / this.pixelsPerSquare,
      row: worldY / this.pixelsPerSquare
    };
  }

  _wireEvents() {
    this.svg.addEventListener("pointerdown", (e) => {
      const componentEl = e.target.closest("[data-component-id]");
      if (componentEl) {
        this.selectedId = componentEl.dataset.componentId;
        this._renderComponents();
        return; // grabbing a placed component — don't start panning
      }
      if (this.selectedId !== null) {
        this.selectedId = null;
        this._renderComponents();
      }

      this.isDragging = true;
      this.svg.classList.add("dragging");
      this.svg.setPointerCapture(e.pointerId);
      this.dragStart = { x: e.clientX, y: e.clientY, panX: this.panX, panY: this.panY };
    });

    this.svg.addEventListener("pointermove", (e) => {
      if (!this.isDragging) return;
      this.panX = this.dragStart.panX + (e.clientX - this.dragStart.x);
      this.panY = this.dragStart.panY + (e.clientY - this.dragStart.y);
      this._render();
    });

    const endDrag = (e) => {
      if (!this.isDragging) return;
      this.isDragging = false;
      this.svg.classList.remove("dragging");
      if (e.pointerId !== undefined) {
        try { this.svg.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
      }
    };
    this.svg.addEventListener("pointerup", endDrag);
    this.svg.addEventListener("pointercancel", endDrag);

    this.svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = this.svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // World point currently under the cursor, before the zoom changes.
      const worldX = (mouseX - this.panX) / this.zoom;
      const worldY = (mouseY - this.panY) / this.zoom;

      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));

      // Re-solve pan so that same world point stays pinned under the cursor.
      this.panX = mouseX - worldX * newZoom;
      this.panY = mouseY - worldY * newZoom;
      this.zoom = newZoom;
      this._render();
    }, { passive: false });

    this.svg.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    });

    this.svg.addEventListener("drop", (e) => {
      e.preventDefault();
      const typeId = e.dataTransfer.getData("text/component-type-id");
      const type = this.library.get(typeId);
      if (!type) return;

      const rect = this.svg.getBoundingClientRect();
      const { col, row } = this.screenToGrid(e.clientX - rect.left, e.clientY - rect.top);
      const x = Math.floor(col);
      const y = Math.floor(row);
      const footprint = footprintFor(type, 0);
      const placementRect = { x, y, w: footprint.w, h: footprint.h };

      if (!isWithinBounds(placementRect, this.widthSquares, this.heightSquares)) {
        console.warn(`Cannot place ${type.label}: outside deck bounds`);
        return;
      }
      if (findCollision(placementRect, this.components, this.library)) {
        console.warn(`Cannot place ${type.label}: collides with an existing component`);
        return;
      }

      this.components.push({
        id: crypto.randomUUID(),
        typeId,
        x, y,
        rotation: 0
      });
      this._renderComponents();
    });

    window.addEventListener("keydown", (e) => {
      if (this.selectedId === null) return;
      const active = document.activeElement;
      if (active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        this.components = this.components.filter((c) => c.id !== this.selectedId);
        this.selectedId = null;
        this._renderComponents();
      } else if (e.key === "r" || e.key === "R") {
        this._rotateSelected();
      }
    });
  }

  _rotateSelected() {
    const pc = this.components.find((c) => c.id === this.selectedId);
    if (!pc) return;
    const type = this.library.get(pc.typeId);
    const newRotation = (pc.rotation + 90) % 360;
    const footprint = footprintFor(type, newRotation);
    const rect = { x: pc.x, y: pc.y, w: footprint.w, h: footprint.h };

    if (!isWithinBounds(rect, this.widthSquares, this.heightSquares)) {
      console.warn(`Cannot rotate ${type.label}: would extend past deck bounds`);
      return;
    }
    if (findCollision(rect, this.components, this.library, pc.id)) {
      console.warn(`Cannot rotate ${type.label}: would collide with another component`);
      return;
    }
    pc.rotation = newRotation;
    this._renderComponents();
  }

  _render() {
    this.viewport.setAttribute("transform", `translate(${this.panX},${this.panY}) scale(${this.zoom})`);
  }

  _renderComponents() {
    while (this.componentsLayer.firstChild) {
      this.componentsLayer.removeChild(this.componentsLayer.firstChild);
    }

    for (const pc of this.components) {
      const type = this.library.get(pc.typeId);
      if (!type) continue;
      const footprint = footprintFor(type, pc.rotation);
      const selected = pc.id === this.selectedId;

      const g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", "placed-component");
      g.dataset.componentId = pc.id;

      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", pc.x * this.pixelsPerSquare);
      rect.setAttribute("y", pc.y * this.pixelsPerSquare);
      rect.setAttribute("width", footprint.w * this.pixelsPerSquare);
      rect.setAttribute("height", footprint.h * this.pixelsPerSquare);
      rect.setAttribute("fill", CATEGORY_COLORS[type.category] ?? "#ccc");
      rect.setAttribute("fill-opacity", "0.85");
      rect.setAttribute("stroke", selected ? "#000000" : "#333333");
      rect.setAttribute("stroke-width", selected ? "3" : "1");
      rect.setAttribute("vector-effect", "non-scaling-stroke");
      g.appendChild(rect);

      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", (pc.x + footprint.w / 2) * this.pixelsPerSquare);
      label.setAttribute("y", (pc.y + footprint.h / 2) * this.pixelsPerSquare);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("dominant-baseline", "middle");
      label.setAttribute("font-size", "12");
      label.setAttribute("pointer-events", "none");
      label.textContent = pc.label || type.label;
      g.appendChild(label);

      this.componentsLayer.appendChild(g);
    }
  }
}
