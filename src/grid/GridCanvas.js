// Renders a deck's square grid as SVG and handles pan/zoom.
//
// SVG (not <canvas>) so that later build-order steps — walls/doors as line
// segments, lights as points, component footprints as rects/polygons — can
// each be a real, individually selectable DOM node with native pointer
// events, instead of hand-rolled hit-testing on a canvas. The grid itself is
// a single tiled <pattern> fill rather than one element per cell, since
// zone-fill painting (a later step) will hit-test cells via screenToGrid()
// coordinate math anyway, not by clicking per-cell elements.
//
// One shared <g id="viewport"> transform group holds the grid background now
// and will hold every future layer later, so pan/zoom is a single transform
// that moves everything together with no per-layer logic.

const SVG_NS = "http://www.w3.org/2000/svg";
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.1;

export class GridCanvas {
  constructor(container, { widthSquares, heightSquares, pixelsPerSquare }) {
    this.container = container;
    this.widthSquares = widthSquares;
    this.heightSquares = heightSquares;
    this.pixelsPerSquare = pixelsPerSquare;

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

    this.container.appendChild(this.svg);

    this._wireEvents();
    this._render();
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
  }

  _render() {
    this.viewport.setAttribute("transform", `translate(${this.panX},${this.panY}) scale(${this.zoom})`);
  }
}
