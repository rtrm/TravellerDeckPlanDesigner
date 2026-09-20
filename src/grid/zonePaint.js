// Pure cell-key helpers for zone-fill painting (no DOM). Kept separate so
// the "x,y" string encoding used to key painted cells has one place to
// change, the same way snapping.js centralizes catalog-mode placement math.
export function cellKey(x, y) {
  return `${x},${y}`;
}

export function parseCellKey(key) {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}
