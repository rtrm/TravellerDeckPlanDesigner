// Shared in-page state bridging ComponentPalette (drag source) and
// GridCanvas (drop target). Native HTML5 drag-and-drop only reliably
// exposes dataTransfer.getData() at drop time - not during dragover, where
// browsers restrict it to protect cross-origin drags - so the type and
// rotation being dragged are tracked here instead, since both sides live on
// the same page.
export const dragState = {
  typeId: null,
  rotation: 0
};
