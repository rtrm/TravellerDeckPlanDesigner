// Pure grid-snap + collision math for catalog-mode placement (no DOM).
// Kept separate from GridCanvas.js so the placement rules are unit-testable
// independent of rendering.

// A component's footprint as drawn, accounting for 90/270 rotations
// swapping width and height.
export function footprintFor(componentType, rotation) {
  const { w, h } = componentType.footprintSquares;
  return rotation === 90 || rotation === 270 ? { w: h, h: w } : { w, h };
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
    a.y < b.y + b.h && a.y + a.h > b.y;
}

export function isWithinBounds(rect, widthSquares, heightSquares) {
  return rect.x >= 0 && rect.y >= 0 &&
    rect.x + rect.w <= widthSquares && rect.y + rect.h <= heightSquares;
}

// Returns the first placed component that overlaps `rect`, or undefined.
// `excludeId` skips a component against itself (used when rotating in
// place).
export function findCollision(rect, placedComponents, library, excludeId) {
  return placedComponents.find((pc) => {
    if (pc.id === excludeId) return false;
    const type = library.get(pc.typeId);
    if (!type) return false;
    const footprint = footprintFor(type, pc.rotation);
    return rectsOverlap(rect, { x: pc.x, y: pc.y, w: footprint.w, h: footprint.h });
  });
}
