"use strict";

window.RealmfrontCursors = (() => {
  const labels = {
    default: "default",
    select: "pointer",
    move: "crosshair",
    attack: "crosshair",
    chop: "pointer",
    mine: "pointer",
    repair: "pointer",
    build: "crosshair",
    rally: "crosshair",
    blocked: "not-allowed",
    box: "crosshair",
  };
  function apply(canvas, hint, action, point) {
    if (canvas.dataset.cursor !== action.kind) {
      canvas.dataset.cursor = action.kind;
      canvas.style.cursor =
        action.kind === "pan"
          ? "grabbing"
          : `url("assets/cursors/${action.kind}.svg") 3 2, ${labels[action.kind] || "default"}`;
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
  return { apply };
})();
