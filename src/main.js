import { GridCanvas } from "./grid/GridCanvas.js";

// TEMP placeholder — build-order step 2 (the input-sheet form) replaces
// this with real values transcribed from a ship's design-sequence sheet.
// Deliberately non-square (20x14) so any width/height mixup in the grid
// math would be visually obvious. pixelsPerSquare is an arbitrary round
// number for now; matching a Foundry scene's grid.size is a concern for
// the eventual Foundry-export step, not this one.
const placeholderDeck = {
  widthSquares: 20,
  heightSquares: 14,
  pixelsPerSquare: 40
};

const container = document.getElementById("app");
new GridCanvas(container, placeholderDeck).init();
