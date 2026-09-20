import { sheetToBudget } from "./sheetToBudget.js";

// UI for transcribing a ship's design-sequence output sheet (the tonnage
// sheet - hull, staterooms, common areas, cargo, etc.) into a ShipInputSheet
// (DeckDesigner.md section 2), and displaying the resulting per-line square
// budgets computed by sheetToBudget.js. Nothing here feeds the grid/deck
// yet - that link (deck dimensions driven by the budget) is a later build-
// order step; this step just has to get the input form and the tons-to-
// squares math right.
export class SheetEntryForm {
  constructor(container) {
    this.container = container;
    this.lineItems = [{ label: "Common Areas", tons: 5.5, placementMode: "zoneFill" }];
  }

  init() {
    this.root = document.createElement("div");
    this.root.className = "sheet-form";
    this.container.appendChild(this.root);
    this._render();
  }

  _render() {
    this.root.innerHTML = "";
    this.root.appendChild(this._buildForm());
    if (this.lastBudget) {
      this.root.appendChild(this._buildResults(this.lastBudget));
    }
  }

  _buildForm() {
    const form = document.createElement("form");

    form.appendChild(this._field("Ship name", "text", "name", "Subsidised Merchant"));
    form.appendChild(this._field("Hull tons (Dtons)", "number", "hullTons", 400, { min: 0, step: "any" }));

    form.appendChild(this._sectionHeading("Staterooms"));
    form.appendChild(this._field("Count", "number", "staterooms.count", 19, { min: 0, step: 1 }));
    form.appendChild(this._field("Tons each", "number", "staterooms.tonsEach", 4, { min: 0, step: "any" }));
    form.appendChild(this._select("Occupancy (informational only)", "staterooms.occupancy", [
      ["double", "Double"],
      ["single", "Single"]
    ]));
    form.appendChild(this._select("Stateroom mode", "stateroomMode", [
      ["splitCommonArea", "Split 25% to common areas (default)"],
      ["literal", "Literal - full footprint, no split"]
    ]));

    form.appendChild(this._sectionHeading("Low berths"));
    form.appendChild(this._field("Count", "number", "lowBerths.count", 0, { min: 0, step: 1 }));
    form.appendChild(this._field("Tons each", "number", "lowBerths.tonsEach", 0.5, { min: 0, step: "any" }));

    form.appendChild(this._sectionHeading("Other line items"));
    form.appendChild(this._buildLineItemsTable());

    const addRowBtn = document.createElement("button");
    addRowBtn.type = "button";
    addRowBtn.textContent = "+ Add line item";
    addRowBtn.addEventListener("click", () => {
      this.lineItems.push({ label: "", tons: 0, placementMode: "zoneFill" });
      this._render();
    });
    form.appendChild(addRowBtn);

    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.className = "primary";
    submitBtn.textContent = "Compute budget";
    form.appendChild(submitBtn);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.lastBudget = sheetToBudget(this._readSheet(form));
      this._render();
    });

    this._form = form;
    return form;
  }

  _buildLineItemsTable() {
    const table = document.createElement("table");
    table.className = "line-items";

    const head = document.createElement("tr");
    head.innerHTML = "<th>Label</th><th>Tons</th><th>Placement</th><th></th>";
    table.appendChild(head);

    this.lineItems.forEach((item, index) => {
      const row = document.createElement("tr");

      const labelInput = document.createElement("input");
      labelInput.type = "text";
      labelInput.value = item.label;
      labelInput.dataset.lineIndex = index;
      labelInput.dataset.lineField = "label";
      const labelCell = document.createElement("td");
      labelCell.appendChild(labelInput);

      const tonsInput = document.createElement("input");
      tonsInput.type = "number";
      tonsInput.step = "any";
      tonsInput.min = "0";
      tonsInput.value = item.tons;
      tonsInput.dataset.lineIndex = index;
      tonsInput.dataset.lineField = "tons";
      const tonsCell = document.createElement("td");
      tonsCell.appendChild(tonsInput);

      const modeSelect = document.createElement("select");
      modeSelect.dataset.lineIndex = index;
      modeSelect.dataset.lineField = "placementMode";
      for (const [value, text] of [["zoneFill", "Zone-fill"], ["catalog", "Catalog"]]) {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = text;
        if (item.placementMode === value) opt.selected = true;
        modeSelect.appendChild(opt);
      }
      const modeCell = document.createElement("td");
      modeCell.appendChild(modeSelect);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "✕";
      removeBtn.title = "Remove line item";
      removeBtn.addEventListener("click", () => {
        this.lineItems.splice(index, 1);
        this._render();
      });
      const removeCell = document.createElement("td");
      removeCell.appendChild(removeBtn);

      row.appendChild(labelCell);
      row.appendChild(tonsCell);
      row.appendChild(modeCell);
      row.appendChild(removeCell);
      table.appendChild(row);
    });

    return table;
  }

  _readSheet(form) {
    const get = (name) => form.querySelector(`[name="${name}"]`);
    const num = (name) => parseFloat(get(name).value) || 0;

    for (const input of form.querySelectorAll("[data-line-index]")) {
      const item = this.lineItems[Number(input.dataset.lineIndex)];
      const field = input.dataset.lineField;
      item[field] = field === "tons" ? (parseFloat(input.value) || 0) : input.value;
    }

    return {
      name: get("name").value,
      hullTons: num("hullTons"),
      staterooms: {
        count: num("staterooms.count"),
        tonsEach: num("staterooms.tonsEach"),
        occupancy: get("staterooms.occupancy").value
      },
      lowBerths: {
        count: num("lowBerths.count"),
        tonsEach: num("lowBerths.tonsEach")
      },
      stateroomMode: get("stateroomMode").value,
      lineItems: this.lineItems.filter((item) => item.label.trim() !== "")
    };
  }

  _buildResults(budget) {
    const wrap = document.createElement("div");
    wrap.className = "budget-results";

    const summary = document.createElement("p");
    summary.innerHTML = `<strong>${fmt(budget.totalSquares)}</strong> total squares &mdash; ` +
      `<strong>${fmt(budget.allocatedSquares)}</strong> allocated, ` +
      `<strong>${fmt(budget.remainingSquares)}</strong> remaining`;
    wrap.appendChild(summary);

    const table = document.createElement("table");
    table.className = "budget-table";
    const head = document.createElement("tr");
    head.innerHTML = "<th>Pool</th><th>Tons</th><th>Squares</th>";
    table.appendChild(head);

    for (const group of budget.groups) {
      const row = document.createElement("tr");
      row.innerHTML = `<td>${escapeHtml(group.label)}</td><td>${fmt(group.tons)}</td><td>${fmt(group.squares)}</td>`;
      table.appendChild(row);
    }
    wrap.appendChild(table);

    return wrap;
  }

  _field(labelText, type, name, defaultValue, attrs = {}) {
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = type;
    input.name = name;
    input.value = defaultValue;
    for (const [k, v] of Object.entries(attrs)) input.setAttribute(k, v);
    label.appendChild(input);
    return label;
  }

  _select(labelText, name, options) {
    const label = document.createElement("label");
    label.textContent = labelText;
    const select = document.createElement("select");
    select.name = name;
    for (const [value, text] of options) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = text;
      select.appendChild(opt);
    }
    label.appendChild(select);
    return label;
  }

  _sectionHeading(text) {
    const h = document.createElement("h3");
    h.textContent = text;
    return h;
  }
}

function fmt(n) {
  const rounded = Math.round(n * 100) / 100;
  return rounded.toString();
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}
