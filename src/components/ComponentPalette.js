// Drag-source UI listing catalog ComponentTypes (DeckDesigner.md section 2).
//
// Placement uses plain Pointer Events rather than native HTML5 drag-and-
// drop: a right-click mid-drag (to rotate on the fly) can't be relied on
// during a native drag gesture - browsers handle a second mouse button
// inconsistently once one is already driving the drag, and some cancel the
// drag outright. Owning the whole interaction with pointerdown/move/up (the
// same model GridCanvas already uses for panning) makes that reliable.
export class ComponentPalette {
  constructor(container, library, gridCanvas) {
    this.container = container;
    this.library = library; // ComponentType[]
    this.gridCanvas = gridCanvas;
    this.rotations = new Map(library.map((type) => [type.id, 0]));
    this.itemEls = new Map(); // typeId -> { itemEl, footprintEl }
  }

  init() {
    this.root = document.createElement("div");
    this.root.className = "component-palette";

    const heading = document.createElement("h3");
    heading.textContent = "Components";
    this.root.appendChild(heading);

    const hint = document.createElement("p");
    hint.className = "palette-hint";
    hint.textContent = "Drag onto the grid to place. Right-click while dragging to rotate.";
    this.root.appendChild(hint);

    for (const type of this.library) {
      this.root.appendChild(this._paletteItem(type));
    }

    this.container.appendChild(this.root);
  }

  _paletteItem(type) {
    const item = document.createElement("div");
    item.className = "palette-item";

    const icon = document.createElement("span");
    icon.className = "palette-icon";
    icon.textContent = type.icon;

    const label = document.createElement("span");
    label.className = "palette-label";
    label.textContent = type.label;

    const footprint = document.createElement("span");
    footprint.className = "palette-footprint";

    const rotateBtn = document.createElement("button");
    rotateBtn.type = "button";
    rotateBtn.className = "palette-rotate";
    rotateBtn.title = "Rotate before placing";
    rotateBtn.textContent = "⟳";
    rotateBtn.addEventListener("click", () => {
      this._setRotation(type, (this.rotations.get(type.id) + 90) % 360);
    });

    item.appendChild(icon);
    item.appendChild(label);
    item.appendChild(footprint);
    item.appendChild(rotateBtn);

    this.itemEls.set(type.id, { itemEl: item, footprintEl: footprint });
    this._updateFootprintLabel(type);

    item.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return; // left button starts a placement drag
      if (e.target.closest(".palette-rotate")) return; // let the button's own click handle it
      e.preventDefault();
      this._startPlacement(type, e);
    });

    return item;
  }

  _setRotation(type, rotation) {
    this.rotations.set(type.id, rotation);
    this._updateFootprintLabel(type);
  }

  _updateFootprintLabel(type) {
    const rotation = this.rotations.get(type.id);
    const { w, h } = rotation === 90 || rotation === 270
      ? { w: type.footprintSquares.h, h: type.footprintSquares.w }
      : type.footprintSquares;
    const { itemEl, footprintEl } = this.itemEls.get(type.id);
    footprintEl.textContent = `${w}×${h}`;
    itemEl.title = `${type.label} (${w}×${h} squares, rotation ${rotation}°)`;
  }

  _startPlacement(type, downEvent) {
    let rotation = this.rotations.get(type.id);
    document.body.classList.add("placing-component");

    const preview = (ev) => {
      if (this.gridCanvas.containsPoint(ev.clientX, ev.clientY)) {
        this.gridCanvas.previewPlacement(ev.clientX, ev.clientY, type, rotation);
      } else {
        this.gridCanvas.clearGhost();
      }
    };

    const onMove = (ev) => preview(ev);

    const onContextMenu = (ev) => {
      ev.preventDefault();
      rotation = (rotation + 90) % 360;
      preview(ev);
    };

    const finish = (ev, commit) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("contextmenu", onContextMenu);
      document.body.classList.remove("placing-component");

      if (commit && this.gridCanvas.containsPoint(ev.clientX, ev.clientY)) {
        this.gridCanvas.commitPlacement(ev.clientX, ev.clientY, type, rotation);
      } else {
        this.gridCanvas.clearGhost();
      }
      // The rotation chosen mid-drag (including via right-click) becomes
      // this item's starting rotation next time, so it sticks rather than
      // resetting to 0 on every pick-up.
      this._setRotation(type, rotation);
    };
    const onUp = (ev) => finish(ev, true);
    const onCancel = (ev) => finish(ev, false);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("contextmenu", onContextMenu);

    preview(downEvent);
  }
}
