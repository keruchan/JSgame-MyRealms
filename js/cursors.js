"use strict";

window.RealmfrontCursors = (() => {
  // Hotspots follow each tool's working tip, not the corner of its image.
  const cursors = {
    default: { x: 5, y: 3, fallback: "default" },
    select: { x: 20, y: 20, fallback: "pointer" },
    move: { x: 20, y: 20, fallback: "crosshair" },
    attack: { x: 6, y: 4, fallback: "crosshair" },
    chop: { x: 18, y: 3, fallback: "pointer" },
    mine: { x: 3, y: 22, fallback: "pointer" },
    farm: { x: 8, y: 5, fallback: "pointer" },
    repair: { x: 7, y: 6, fallback: "pointer" },
    build: { x: 7, y: 6, fallback: "crosshair" },
    rally: { x: 9, y: 4, fallback: "crosshair" },
    blocked: { x: 20, y: 20, fallback: "not-allowed" },
    box: { x: 20, y: 20, fallback: "crosshair" },
    pan: { x: 20, y: 20, fallback: "grabbing" },
  };
  function apply(canvas, hint, action, point) {
    const kind = Object.hasOwn(cursors, action.kind) ? action.kind : "default";
    if (canvas.dataset.cursor !== kind) {
      canvas.dataset.cursor = kind;
      const { x, y, fallback } = cursors[kind];
      canvas.style.cursor = `url("assets/cursors/${kind}.svg") ${x} ${y}, ${fallback}`;
    }
    const show = !!action.label && point.inside && action.kind !== "pan";
    hint.classList.toggle("hidden", !show);
    if (!show) return;
    hint.textContent = action.label;
    hint.style.left =
      Math.max(4, Math.min(point.x + 20, point.width - 190)) + "px";
    hint.style.top =
      Math.max(4, Math.min(point.y + 22, point.height - 28)) + "px";
  }
  return { apply, cursors };
})();
