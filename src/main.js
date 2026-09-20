import { GridCanvas } from "./grid/GridCanvas.js";
import { SheetEntryForm } from "./input/SheetEntryForm.js";

// TEMP placeholder — a later build-order step drives deck dimensions from
// the input sheet's budget instead of this fixed size. Deliberately
// non-square (20x14) so any width/height mixup in the grid math would be
// visually obvious. pixelsPerSquare is an arbitrary round number for now;
// matching a Foundry scene's grid.size is a concern for the eventual
// Foundry-export step, not this one.
const placeholderDeck = {
  widthSquares: 20,
  heightSquares: 14,
  pixelsPerSquare: 40
};

const app = document.getElementById("app");

const sheetPanel = document.createElement("div");
sheetPanel.id = "sheet-panel";
app.appendChild(sheetPanel);

const gridPanel = document.createElement("div");
gridPanel.id = "grid-panel";
app.appendChild(gridPanel);

new SheetEntryForm(sheetPanel).init();
new GridCanvas(gridPanel, placeholderDeck).init();
