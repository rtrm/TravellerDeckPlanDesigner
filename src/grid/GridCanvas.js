// Renders a deck's square grid as SVG, handles pan/zoom, is the drop
// target for catalog-mode component placement (build-order step 3), and
// (step 4) hosts zone-fill painting for pools with no fixed room shape.
//
// SVG (not <canvas>) so that later build-order steps — walls/doors as line
// segments, lights as points, component footprints as rects/polygons — can
// each be a real, individually selectable DOM node with native pointer
// events, instead of hand-rolled hit-testing on a canvas. The grid itself is
// a single tiled <pattern> fill rather than one element per cell, since
// zone-fill painting hit-tests cells via screenToGrid() coordinate math
// anyway, not by clicking per-cell elements.
//
// One shared <g id="viewport"> transform group holds every other layer, so
// pan/zoom is a single transform that moves everything together with no
// per-layer logic. Layer order (bottom to top): zonesLayer (painted cell
// fills), gridRect (grid lines only — its pattern cells have no fill, so
// lines render on top of zone paint but the zone colors show through
// between them), componentsLayer, ghostLayer.
import { footprintFor, isWithinBounds, findCollision } from "./snapping.js";
import { cellKey, parseCellKey } from "./zonePaint.js";

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

const ZONE_COLORS = ["#e76f51", "#2a9d8f", "#e9c46a", "#264653", "#f4a261", "#8ab17d", "#9d4edd", "#457b9d"];

export class GridCanvas {
  constructor(container, { widthSquares, heightSquares, pixelsPerSquare, componentLibrary = [] }) {
    this.container = container;
    this.widthSquares = widthSquares;
    this.heightSquares = heightSquares;
    this.pixelsPerSquare = pixelsPerSquare;

    this.library = new Map(componentLibrary.map((type) => [type.id, type]));
    this.components = []; // PlacedComponent[]
    this.selectedId = null;

    this.zones = new Map(); // poolKey -> { squares: Set<"x,y"> }
    this.paintPools = new Map(); // poolKey -> { key, label, totalSquares }
    this.poolColors = new Map(); // poolKey -> color, assigned on first sight
    this.activePoolKey = null;
    this.isPainting = false;
    this.paintErasing = false;
    this.onZoneChange = null; // set by ZonePalette to refresh usage counts

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

    this.zonesLayer = document.createElementNS(SVG_NS, "g");
    this.zonesLayer.setAttribute("id", "zones-layer");
    this.zonesLayer.setAttribute("pointer-events", "none");
    this.viewport.appendChild(this.zonesLayer);

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

    this.ghostLayer = document.createElementNS(SVG_NS, "g");
    this.ghostLayer.setAttribute("id", "placement-ghost");
    this.ghostLayer.setAttribute("pointer-events", "none");
    this.viewport.appendChild(this.ghostLayer);

    this.container.appendChild(this.svg);

    this._wireEvents();
    this._render();
    this._renderComponents();
    this._renderZones();
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
      if (this.activePoolKey && e.button !== 1) {
        // Zone-paint mode: left paints, right erases (middle still pans).
        e.preventDefault();
        this.isPainting = true;
        this.paintErasing = e.button === 2;
        this.svg.setPointerCapture(e.pointerId);
        this._paintAt(e.clientX, e.clientY, this.paintErasing);
        return;
      }

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
      if (this.isPainting) {
        this._paintAt(e.clientX, e.clientY, this.paintErasing);
        return;
      }
      if (!this.isDragging) return;
      this.panX = this.dragStart.panX + (e.clientX - this.dragStart.x);
      this.panY = this.dragStart.panY + (e.clientY - this.dragStart.y);
      this._render();
    });

    const endDrag = (e) => {
      this.isPainting = false;
      if (this.isDragging) {
        this.isDragging = false;
        this.svg.classList.remove("dragging");
      }
      if (e.pointerId !== undefined) {
        try { this.svg.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
      }
    };
    this.svg.addEventListener("pointerup", endDrag);
    this.svg.addEventListener("pointercancel", endDrag);

    this.svg.addEventListener("contextmenu", (e) => {
      if (this.activePoolKey) e.preventDefault(); // right-drag erases, no browser menu
    });

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

  // Public placement API, driven by ComponentPalette's pointer-based drag
  // (see its own header comment for why it's pointer events, not native
  // HTML5 drag-and-drop).
  containsPoint(clientX, clientY) {
    const rect = this.svg.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right &&
      clientY >= rect.top && clientY <= rect.bottom;
  }

  previewPlacement(clientX, clientY, type, rotation) {
    const placementRect = this._snappedRect(clientX, clientY, type, rotation);
    const valid = isWithinBounds(placementRect, this.widthSquares, this.heightSquares) &&
      !findCollision(placementRect, this.components, this.library);
    this._renderGhost(placementRect, valid);
    return valid;
  }

  commitPlacement(clientX, clientY, type, rotation) {
    const placementRect = this._snappedRect(clientX, clientY, type, rotation);
    this.clearGhost();

    if (!isWithinBounds(placementRect, this.widthSquares, this.heightSquares)) {
      console.warn(`Cannot place ${type.label}: outside deck bounds`);
      return false;
    }
    if (findCollision(placementRect, this.components, this.library)) {
      console.warn(`Cannot place ${type.label}: collides with an existing component`);
      return false;
    }

    const placed = {
      id: crypto.randomUUID(),
      typeId: type.id,
      x: placementRect.x,
      y: placementRect.y,
      rotation
    };
    this.components.push(placed);
    this.selectedId = placed.id;
    this._renderComponents();
    return true;
  }

  clearGhost() {
    while (this.ghostLayer.firstChild) {
      this.ghostLayer.removeChild(this.ghostLayer.firstChild);
    }
  }

  // Snapped grid rect a ComponentType would occupy if placed at this
  // screen point, at the given rotation.
  _snappedRect(clientX, clientY, type, rotation) {
    const rect = this.svg.getBoundingClientRect();
    const { col, row } = this.screenToGrid(clientX - rect.left, clientY - rect.top);
    const footprint = footprintFor(type, rotation);
    return { x: Math.floor(col), y: Math.floor(row), w: footprint.w, h: footprint.h };
  }

  _renderGhost(rect, valid) {
    while (this.ghostLayer.firstChild) {
      this.ghostLayer.removeChild(this.ghostLayer.firstChild);
    }
    const el = document.createElementNS(SVG_NS, "rect");
    el.setAttribute("x", rect.x * this.pixelsPerSquare);
    el.setAttribute("y", rect.y * this.pixelsPerSquare);
    el.setAttribute("width", rect.w * this.pixelsPerSquare);
    el.setAttribute("height", rect.h * this.pixelsPerSquare);
    el.setAttribute("fill", valid ? "#2a9d8f" : "#e63946");
    el.setAttribute("fill-opacity", "0.35");
    el.setAttribute("stroke", valid ? "#2a9d8f" : "#e63946");
    el.setAttribute("stroke-width", "2");
    el.setAttribute("stroke-dasharray", "6,4");
    el.setAttribute("vector-effect", "non-scaling-stroke");
    this.ghostLayer.appendChild(el);
  }

  // Public zone-fill API, driven by ZonePalette.
  setPaintPools(pools) {
    this.paintPools = new Map(pools.map((p) => [p.key, p]));
    for (const pool of pools) {
      if (!this.poolColors.has(pool.key)) {
        this.poolColors.set(pool.key, ZONE_COLORS[this.poolColors.size % ZONE_COLORS.length]);
      }
    }
    this._renderZones();
  }

  setActivePool(poolKey) {
    this.activePoolKey = poolKey;
    this.svg.classList.toggle("painting", poolKey !== null);
  }

  getZoneUsage(poolKey) {
    return this.zones.get(poolKey)?.squares.size ?? 0;
  }

  getPoolColor(poolKey) {
    return this.poolColors.get(poolKey) ?? "#999999";
  }

  _paintAt(clientX, clientY, erase) {
    if (!this.activePoolKey) return;
    const rect = this.svg.getBoundingClientRect();
    const { col, row } = this.screenToGrid(clientX - rect.left, clientY - rect.top);
    const x = Math.floor(col);
    const y = Math.floor(row);
    if (x < 0 || y < 0 || x >= this.widthSquares || y >= this.heightSquares) return;
    const key = cellKey(x, y);

    if (erase) {
      let changed = false;
      for (const zone of this.zones.values()) {
        if (zone.squares.delete(key)) changed = true;
      }
      if (!changed) return;
      this._renderZones();
      this.onZoneChange?.();
      return;
    }

    if (this._cellOccupiedByComponent(x, y)) return;

    const pool = this.paintPools.get(this.activePoolKey);
    if (!pool) return;

    const zone = this._zoneFor(this.activePoolKey);
    if (zone.squares.has(key)) return; // already painted for this pool

    if (zone.squares.size >= pool.totalSquares) {
      console.warn(`Cannot paint: ${pool.label} budget (${pool.totalSquares} squares) already used`);
      return;
    }

    // A cell belongs to at most one pool - reassign it from any other.
    for (const [poolKey, otherZone] of this.zones) {
      if (poolKey !== this.activePoolKey) otherZone.squares.delete(key);
    }

    zone.squares.add(key);
    this._renderZones();
    this.onZoneChange?.();
  }

  _zoneFor(poolKey) {
    if (!this.zones.has(poolKey)) {
      this.zones.set(poolKey, { squares: new Set() });
    }
    return this.zones.get(poolKey);
  }

  _cellOccupiedByComponent(x, y) {
    return this.components.some((pc) => {
      const type = this.library.get(pc.typeId);
      if (!type) return false;
      const footprint = footprintFor(type, pc.rotation);
      return x >= pc.x && x < pc.x + footprint.w && y >= pc.y && y < pc.y + footprint.h;
    });
  }

  _renderZones() {
    while (this.zonesLayer.firstChild) {
      this.zonesLayer.removeChild(this.zonesLayer.firstChild);
    }

    for (const [poolKey, zone] of this.zones) {
      const color = this.getPoolColor(poolKey);
      for (const key of zone.squares) {
        const { x, y } = parseCellKey(key);
        const rect = document.createElementNS(SVG_NS, "rect");
        rect.setAttribute("x", x * this.pixelsPerSquare);
        rect.setAttribute("y", y * this.pixelsPerSquare);
        rect.setAttribute("width", this.pixelsPerSquare);
        rect.setAttribute("height", this.pixelsPerSquare);
        rect.setAttribute("fill", color);
        rect.setAttribute("fill-opacity", "0.55");
        this.zonesLayer.appendChild(rect);
      }
    }
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
