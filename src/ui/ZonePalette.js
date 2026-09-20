// Zone-fill pool selector (build-order step 4). Lists the paintable pools
// computed from the input sheet's budget (sheetToBudget.js's
// paintablePools()) and lets the user pick which one is "active" for
// painting on GridCanvas - left-drag paints, right-drag erases, per
// GridCanvas's own header comment.
export class ZonePalette {
  constructor(container, gridCanvas) {
    this.container = container;
    this.gridCanvas = gridCanvas;
    this.pools = [];
  }

  init() {
    this.root = document.createElement("div");
    this.root.className = "zone-palette";

    const heading = document.createElement("h3");
    heading.textContent = "Paint Zones";
    this.root.appendChild(heading);

    const hint = document.createElement("p");
    hint.className = "palette-hint";
    hint.textContent = "Pick a zone, then left-drag the grid to paint, right-drag to erase.";
    this.root.appendChild(hint);

    this.listEl = document.createElement("div");
    this.root.appendChild(this.listEl);

    this.container.appendChild(this.root);

    this.gridCanvas.onZoneChange = () => this._renderList();
    this._renderList();
  }

  // Called whenever SheetEntryForm recomputes the budget.
  setPools(pools) {
    this.pools = pools;
    if (this.gridCanvas.activePoolKey && !pools.some((p) => p.key === this.gridCanvas.activePoolKey)) {
      this.gridCanvas.setActivePool(null);
    }
    this.gridCanvas.setPaintPools(pools);
    this._renderList();
  }

  _renderList() {
    this.listEl.innerHTML = "";

    const noneBtn = document.createElement("button");
    noneBtn.type = "button";
    noneBtn.className = "zone-item" + (this.gridCanvas.activePoolKey === null ? " active" : "");
    noneBtn.textContent = "None (pan grid)";
    noneBtn.addEventListener("click", () => {
      this.gridCanvas.setActivePool(null);
      this._renderList();
    });
    this.listEl.appendChild(noneBtn);

    for (const pool of this.pools) {
      this.listEl.appendChild(this._zoneItem(pool));
    }

    if (this.pools.length === 0) {
      const empty = document.createElement("p");
      empty.className = "palette-hint";
      empty.textContent = "Compute a budget on the sheet to see paintable zones here.";
      this.listEl.appendChild(empty);
    }
  }

  _zoneItem(pool) {
    const used = this.gridCanvas.getZoneUsage(pool.key);
    const active = this.gridCanvas.activePoolKey === pool.key;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "zone-item" + (active ? " active" : "");
    btn.style.setProperty("--zone-color", this.gridCanvas.getPoolColor(pool.key));

    const swatch = document.createElement("span");
    swatch.className = "zone-swatch";

    const label = document.createElement("span");
    label.className = "zone-label";
    label.textContent = pool.label;

    const usage = document.createElement("span");
    usage.className = "zone-usage";
    usage.textContent = `${used}/${formatSquares(pool.totalSquares)}`;

    btn.appendChild(swatch);
    btn.appendChild(label);
    btn.appendChild(usage);

    btn.addEventListener("click", () => {
      this.gridCanvas.setActivePool(active ? null : pool.key);
      this._renderList();
    });

    return btn;
  }
}

function formatSquares(n) {
  return (Math.round(n * 100) / 100).toString();
}
