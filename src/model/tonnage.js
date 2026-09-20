// 1 displacement ton (Dton) = 14 m^3 (Mongoose 2e's stated figure). Standard
// deck-plan grid square = 1.5m x 1.5m with a 3m deck height, which gives
// 2 grid squares per Dton. This is the single master conversion constant
// every tons-to-squares conversion in the app goes through. See
// DeckDesigner.md section 1.
export const SQUARES_PER_DTON = 2;

export function tonsToSquares(tons) {
  return tons * SQUARES_PER_DTON;
}
