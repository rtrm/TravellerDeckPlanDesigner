import { dragState } from "./dragState.js";

// Drag-source UI listing catalog ComponentTypes (DeckDesigner.md section 2).
// Each entry is a native HTML5 drag source; the type and rotation being
// dragged are written to dragState.js rather than dataTransfer, since
// GridCanvas needs to read them while hovering (for the placement-preview
// ghost), not just at drop.
export class ComponentPalette {
  constructor(container, library) {
    this.container = container;
    this.library = library; // ComponentType[]
    this.rotations = new Map(library.map((type) => [type.id, 0]));
  }

  init() {
    this.root = document.createElement("div");
    this.root.className = "component-palette";

    const heading = document.createElement("h3");
    heading.textContent = "Components";
    this.root.appendChild(heading);

    for (const type of this.library) {
      this.root.appendChild(this._paletteItem(type));
    }

    this.container.appendChild(this.root);
  }

  _paletteItem(type) {
    const item = document.createElement("div");
    item.className = "palette-item";
    item.draggable = true;

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
      const next = (this.rotations.get(type.id) + 90) % 360;
      this.rotations.set(type.id, next);
      updateFootprintText();
    });

    const updateFootprintText = () => {
      const rotation = this.rotations.get(type.id);
      const { w, h } = rotation === 90 || rotation === 270
        ? { w: type.footprintSquares.h, h: type.footprintSquares.w }
        : type.footprintSquares;
      footprint.textContent = `${w}×${h}`;
      item.title = `${type.label} (${w}×${h} squares, rotation ${rotation}°)`;
    };
    updateFootprintText();

    item.appendChild(icon);
    item.appendChild(label);
    item.appendChild(footprint);
    item.appendChild(rotateBtn);

    item.addEventListener("dragstart", (e) => {
      const rotation = this.rotations.get(type.id);
      dragState.typeId = type.id;
      dragState.rotation = rotation;
      e.dataTransfer.setData("text/component-type-id", type.id);
      e.dataTransfer.effectAllowed = "copy";
    });

    item.addEventListener("dragend", () => {
      dragState.typeId = null;
      dragState.rotation = 0;
    });

    return item;
  }
}
