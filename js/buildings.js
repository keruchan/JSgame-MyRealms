"use strict";

// Original PNGs from Pixel Frog's old CC0 Tiny Swords release.
// Transparent margins are cropped at draw time; source images are unmodified.
window.RealmfrontBuildings = (() => {
  const atlas = {
    "GoldMine_Active.png": [12, 5, 169, 121, 1, 192],
    "Wood_Tower_Blue.png": [63, 16, 130, 155, 4, 256],
    "Wood_Tower_Red.png": [63, 16, 130, 155, 4, 256],
    "Wood_Tower_Purple.png": [63, 16, 130, 155, 4, 256],
    "Wood_Tower_Yellow.png": [63, 16, 130, 155, 4, 256],
    "Goblin_House.png": [7, 26, 113, 145, 1, 128],
    "Tower_Yellow.png": [7, 52, 114, 183, 1, 128],
    "Tower_Red.png": [7, 52, 114, 183, 1, 128],
    "Tower_Purple.png": [7, 52, 114, 183, 1, 128],
    "Tower_Blue.png": [7, 52, 114, 183, 1, 128],
    "House_Blue.png": [10, 24, 108, 148, 1, 128],
    "House_Purple.png": [10, 24, 108, 148, 1, 128],
    "House_Red.png": [10, 24, 108, 148, 1, 128],
    "House_Yellow.png": [10, 24, 108, 148, 1, 128],
    "Castle_Yellow.png": [12, 45, 296, 205, 1, 320],
    "Castle_Blue.png": [12, 45, 296, 205, 1, 320],
    "Castle_Purple.png": [12, 45, 296, 205, 1, 320],
    "Castle_Red.png": [12, 45, 296, 205, 1, 320],
  };
  const images = new Map();
  const palettes = [
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
  const ready = Promise.allSettled(
    Object.keys(atlas).map(
      (file) =>
        new Promise((resolve) => {
          const image = new Image(),
            entry = { image, ready: false };
          images.set(file, entry);
          image.onload = () => {
            entry.ready = true;
            resolve();
          };
          image.onerror = resolve;
          image.src = `assets/buildings/${file}`;
        }),
    ),
  );
  const sources = {
    hall: "Castle",
    tower: "Tower",
    fortress: "Castle",
    farm: "House",
    range: "Wood_Tower",
    barracks: "Castle",
    lumber: "Goblin_House",
    stable: "Goblin_House",
    workshop: "Goblin_House",
    mine: "GoldMine_Active",
  };
  const heights = {
    hall: 1.04,
    tower: 1.55,
    fortress: 1.1,
    farm: 1.1,
    range: 1.35,
    barracks: 1.18,
    lumber: 1.2,
    stable: 1.3,
    workshop: 1.3,
    mine: 0.9,
  };
  function bounds(b) {
    return {
      x: b.x - b.size * 0.72,
      y: b.y + b.size * 0.4 - b.size * (heights[b.type] || 1.3),
      w: b.size * 1.56,
      h: b.size * ((heights[b.type] || 1.3) + 0.15),
    };
  }
  function filename(type, faction) {
    const base = sources[type];
    return ["Goblin_House", "GoldMine_Active"].includes(base)
      ? base + ".png"
      : `${base}_${palettes[faction] || "Blue"}.png`;
  }
  function imagePart(ctx, file, x, bottom, width, time) {
    const entry = images.get(file);
    if (!entry?.ready) return false;
    const [sx, sy, sw, sh, frames, frameWidth] = atlas[file];
    const frame = frames > 1 ? Math.floor(time * 6) % frames : 0;
    const height = (width * sh) / sw;
    ctx.drawImage(
      entry.image,
      sx + frame * frameWidth,
      sy,
      sw,
      sh,
      x - width / 2,
      bottom - height,
      width,
      height,
    );
    return true;
  }
  function flag(ctx, x, y, size, color) {
    ctx.strokeStyle = "#79664e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - size);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size * 0.65, y - size * 0.8);
    ctx.lineTo(x, y - size * 0.53);
    ctx.fill();
  }
  function target(ctx, x, y, r) {
    for (const [scale, color] of [
      [1, "#d9c595"],
      [0.7, "#b86855"],
      [0.4, "#e6d6aa"],
      [0.15, "#68452d"],
    ]) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r * scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function fence(ctx, x, y, width) {
    ctx.strokeStyle = "#b8a078";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - width / 2, y);
    ctx.lineTo(x + width / 2, y);
    ctx.stroke();
    for (let i = -2; i <= 2; i++) {
      ctx.fillStyle = "#dcc399";
      ctx.fillRect(x + (i * width) / 4 - 1.5, y - 5, 3, 12);
    }
  }
  function draw(ctx, b, color = "#77b9e5", time = 0) {
    const file = filename(b.type, b.f);
    if (!images.get(file)?.ready) return false;
    const s = b.size,
      x = b.x,
      y = b.y,
      bottom = y + s * 0.4;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#111e1a45";
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.28, s * 0.63, s * 0.27, 0, 0, Math.PI * 2);
    ctx.fill();
    if (factionFilters[b.f]) ctx.filter = factionFilters[b.f];
    const colored = ctx.filter;
    if (b.type === "farm") {
      imagePart(ctx, file, x, bottom, s * .92, time);
      ctx.filter = "none";
      fence(ctx, x, bottom, s * 1.12);
    } else if (b.type === "fortress") {
      const tower = `Tower_${palettes[b.f]}.png`;
      imagePart(ctx, tower, x - s * 0.42, bottom - s * 0.04, s * 0.55, time);
      imagePart(ctx, tower, x + s * 0.42, bottom - s * 0.04, s * 0.55, time);
      imagePart(ctx, file, x, bottom, s * 1.12, time);
    } else {
      const widths = {
        hall: 1.35,
        tower: 0.9,
        range: 1,
        barracks: 1.32,
        lumber: 0.82,
        stable: 0.95,
        workshop: 0.9,
        mine: 1.16,
      };
      imagePart(ctx, file, x, bottom, s * widths[b.type], time);
    }
    ctx.filter = "none";
    if (b.type === "lumber") {
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = "#775638";
        ctx.fillRect(x + s * 0.05, y + s * (0.1 + i * 0.1), s * 0.53, s * 0.1);
        ctx.fillStyle = "#c59b61";
        ctx.beginPath();
        ctx.ellipse(
          x + s * 0.58,
          y + s * (0.15 + i * 0.1),
          s * 0.06,
          s * 0.05,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    } else if (b.type === "range") {
      target(ctx, x + s * 0.4, y + s * 0.24, s * 0.18);
      fence(ctx, x - s * 0.18, bottom, s * 0.58);
    } else if (b.type === "barracks") {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.14, y - s * 0.24);
      ctx.lineTo(x + s * 0.14, y - s * 0.24);
      ctx.lineTo(x + s * 0.1, y + s * 0.05);
      ctx.lineTo(x, y + s * 0.15);
      ctx.lineTo(x - s * 0.1, y + s * 0.05);
      ctx.fill();
      ctx.strokeStyle = "#ecdbaf";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.08, y - s * 0.18);
      ctx.lineTo(x + s * 0.08, y + s * 0.02);
      ctx.moveTo(x + s * 0.08, y - s * 0.18);
      ctx.lineTo(x - s * 0.08, y + s * 0.02);
      ctx.stroke();
    } else if (b.type === "stable") {
      fence(ctx, x + s * 0.2, bottom, s * 0.82);
      ctx.fillStyle = "#694938";
      ctx.fillRect(x + s * 0.12, y + s * 0.05, s * 0.3, s * 0.16);
      ctx.fillRect(x + s * 0.34, y - s * 0.05, s * 0.1, s * 0.2);
      for (const dx of [0.15, 0.34])
        ctx.fillRect(x + s * dx, y + s * 0.18, s * 0.04, s * 0.13);
    } else if (b.type === "workshop") {
      ctx.fillStyle = "#6c7779";
      ctx.strokeStyle = "#c5b07c";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x + s * 0.35, y + s * 0.17, s * 0.19, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(
          x + s * 0.35 + Math.cos(a) * s * 0.08,
          y + s * 0.17 + Math.sin(a) * s * 0.08,
        );
        ctx.lineTo(
          x + s * 0.35 + Math.cos(a) * s * 0.24,
          y + s * 0.17 + Math.sin(a) * s * 0.24,
        );
        ctx.stroke();
      }
      ctx.fillStyle = "#d5bb86";
      ctx.fillRect(x - s * 0.47, y + s * 0.31, s * 0.5, s * 0.08);
    }
    flag(ctx, x + s * 0.56, bottom, s * 0.4, color);
    ctx.restore();
    return true;
  }
  function paintIcon(canvas, type, faction = 0) {
    const ctx = canvas.getContext("2d"),
      size = 64;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#122322";
    ctx.fillRect(0, 0, size, size);
    const b = { type, f: faction, x: 0, y: 0, size: 80 };
    const r = bounds(b);
    const scale = Math.min(54 / r.w, 54 / r.h);
    ctx.save();
    ctx.translate(32, 32);
    ctx.scale(scale, scale);
    ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2));
    draw(ctx, b);
    ctx.restore();
  }
  function paintIcons(root) {
    for (const canvas of root.querySelectorAll("[data-building-icon]"))
      paintIcon(canvas, canvas.dataset.buildingIcon);
  }
  return { draw, bounds, images, ready, paintIcon, paintIcons };
})();
