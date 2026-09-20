// Drag-source UI listing catalog ComponentTypes (DeckDesigner.md section 2).
// Each entry is a native HTML5 drag source carrying its typeId; GridCanvas
// is the drop target that turns a drop into a PlacedComponent.
export class ComponentPalette {
  constructor(container, library) {
    this.container = container;
    this.library = library; // ComponentType[]
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
    item.title = `${type.label} (${type.footprintSquares.w}×${type.footprintSquares.h} squares)`;

    const icon = document.createElement("span");
    icon.className = "palette-icon";
    icon.textContent = type.icon;

    const label = document.createElement("span");
    label.className = "palette-label";
    label.textContent = type.label;

    const footprint = document.createElement("span");
    footprint.className = "palette-footprint";
    footprint.textContent = `${type.footprintSquares.w}×${type.footprintSquares.h}`;

    item.appendChild(icon);
    item.appendChild(label);
    item.appendChild(footprint);

    item.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/component-type-id", type.id);
      e.dataTransfer.effectAllowed = "copy";
    });

    return item;
  }
}
