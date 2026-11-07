"use strict";

// Original, unmodified Pixel Frog sheets. See assets/characters/CREDITS.md.
// The CC0 release uses 192px cells with transparent space around each character.
window.RealmfrontSprites = (() => {
  const cell = 192;
  const sheets = new Map();
  const factionSheets = [
    "Blue",
    "Red",
    "Purple",
    "Yellow",
    "Blue",
    "Red",
    "Red",
    "Purple",
    "Blue",
    "Yellow",
  ];
  const factionFilters = {
    4: "hue-rotate(270deg)",
    5: "hue-rotate(175deg)",
    6: "hue-rotate(30deg)",
    7: "hue-rotate(55deg)",
    8: "hue-rotate(40deg)",
    9: "grayscale(1) brightness(1.2)",
  };
  const roles = {
    worker: "Pawn",
    sword: "Warrior",
    spear: "Warrior",
    guard: "Warrior",
    archer: "Archer",
    crossbow: "Archer",
    healer: "Pawn",
    cavalry: "Warrior",
    raider: "Warrior",
  };
  for (const role of ["Pawn", "Warrior", "Archer"]) {
    for (const color of ["Blue", "Red", "Purple", "Yellow"]) {
      const img = new Image();
      const entry = { image: img, ready: false, failed: false };
      img.onload = () => {
        entry.ready = true;
      };
      img.onerror = () => {
        entry.failed = true;
      };
      img.src = `assets/characters/${role}_${color}.png`;
      sheets.set(`${role}_${color}`, entry);
    }
  }

  function frameFor(u, time) {
    const role = roles[u.type];
    let row = 0,
      count = 6;
    if (time - (u.movedAt ?? -1) < 0.12) row = 1;
    const acting = u.actionTime > 0;
    if (acting) {
      const t = u.job?.target || u.target;
      const dy = t ? t.y - u.y : 0,
        dx = t ? Math.abs(t.x - u.x) : 1;
      if (role === "Pawn") row = workerTask(u) ? 0 : 2;
      else if (role === "Archer") {
        row =
          dy < -dx
            ? 2
            : dy > dx
              ? 6
              : dy < -dx * 0.4
                ? 3
                : dy > dx * 0.4
                  ? 5
                  : 4;
        count = 8;
      } else row = dy < -dx ? 6 : dy > dx ? 4 : 2;
    }
    // Offset each unit slightly so an army does not march in perfect sync.
    const frame =
      acting && !u.job
        ? Math.min(
            count - 1,
            Math.floor(((u.actionDuration || 0.6) - u.actionTime) * 10),
          )
        : Math.floor(time * 10 + u.id * 0.37) % count;
    return { row, frame };
  }

  function draw(ctx, u, time, color) {
    const role = roles[u.type];
    if (!role) return false;
    const sheet = sheets.get(`${role}_${factionSheets[u.f]}`);
    if (!sheet?.ready) return false;
    const { row, frame } = frameFor(u, time);
    const mounted = u.type === "cavalry" || u.type === "raider";
    ctx.save();
    ctx.translate(u.x, u.y);
    ctx.fillStyle = color + "85";
    ctx.beginPath();
    ctx.ellipse(0, 3, mounted ? 19 : 14, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    if (mounted) {
      // Mounted units retain a distinct horse silhouette under the shared rider art.
      const step =
        time - (u.movedAt ?? -1) < 0.12 ? Math.sin(u.anim * 2) * 4 : 0;
      ctx.fillStyle = "#755340";
      ctx.fillRect(-14, -2, 28, 13);
      ctx.fillRect(u.facing < 0 ? -20 : 12, -11, 9, 17);
      ctx.strokeStyle = "#b0936b";
      ctx.lineWidth = 4;
      for (const x of [-10, 10]) {
        ctx.beginPath();
        ctx.moveTo(x, 8);
        ctx.lineTo(x + step, 17);
        ctx.stroke();
      }
    }
    if (u.facing < 0) ctx.scale(-1, 1);
    if (factionFilters[u.f]) ctx.filter = factionFilters[u.f];
    ctx.imageSmoothingEnabled = false;
    const size = u.type === "guard" ? 108 : mounted ? 98 : 96;
    ctx.drawImage(
      sheet.image,
      frame * cell,
      row * cell,
      cell,
      cell,
      -size / 2,
      -size * 0.61 - (mounted ? 9 : 0),
      size,
      size,
    );
    ctx.filter = "none";
    if (u.type === "worker") drawWorkerTool(ctx, u, time);
    if (u.type === "healer") {
      ctx.fillStyle = "#b7f1ae";
      ctx.fillRect(-3, -30, 6, 17);
      ctx.fillRect(-8, -25, 16, 6);
    } else if (u.type === "spear") {
      ctx.strokeStyle = "#c9b184";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(14, 9);
      ctx.lineTo(20, -32);
      ctx.stroke();
      ctx.fillStyle = "#e6e6c9";
      ctx.beginPath();
      ctx.moveTo(20, -39);
      ctx.lineTo(16, -29);
      ctx.lineTo(23, -28);
      ctx.fill();
    } else if (u.type === "crossbow") {
      ctx.fillStyle = "#efcc73";
      ctx.fillRect(9, -14, 16, 3);
      ctx.fillRect(17, -19, 3, 12);
    }
    ctx.restore();
    return true;
  }
  function workerTask(u) {
    if (u.type !== "worker" || !u.job) return null;
    return u.job.kind === "repair"
      ? "repair"
      : u.job.kind === "gather"
        ? u.job.target.type === "ore"
          ? "mine"
          : "chop"
        : null;
  }
  function drawWorkerTool(ctx, u, time) {
    const task = workerTask(u);
    if (!task) return;
    ctx.save();
    ctx.translate(8, -10);
    const swing =
      u.actionTime > 0 ? Math.sin(time * 11 + u.id * 0.3) * 0.8 - 0.55 : -0.4;
    ctx.rotate(swing);
    ctx.strokeStyle = "#67452e";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-1, 6);
    ctx.lineTo(10, -17);
    ctx.stroke();
    ctx.strokeStyle = "#d2aa70";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-1, 6);
    ctx.lineTo(10, -17);
    ctx.stroke();
    ctx.strokeStyle = "#314d48";
    ctx.lineWidth = 2;
    ctx.fillStyle = "#c5d7d2";
    if (task === "mine") {
      ctx.beginPath();
      ctx.moveTo(-2, -15);
      ctx.quadraticCurveTo(8, -29, 22, -13);
      ctx.lineTo(12, -18);
      ctx.lineTo(6, -19);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#f1dfa3";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(1, -17);
      ctx.quadraticCurveTo(9, -24, 19, -16);
      ctx.stroke();
    } else if (task === "chop") {
      ctx.beginPath();
      ctx.moveTo(9, -21);
      ctx.lineTo(1, -24);
      ctx.lineTo(-5, -16);
      ctx.lineTo(5, -10);
      ctx.lineTo(12, -15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#eef3d9";
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.lineTo(-4, -16);
      ctx.lineTo(4, -11);
      ctx.stroke();
    } else {
      ctx.fillRect(3, -24, 17, 9);
      ctx.strokeRect(3, -24, 17, 9);
      ctx.fillStyle = "#f0d5a2";
      ctx.fillRect(17, -22, 4, 5);
    }
    ctx.restore();
  }
  return { draw, frameFor, sheets, workerTask };
})();
