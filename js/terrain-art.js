"use strict";

// Unmodified Pixel Frog CC0 tiles, assembled at draw time. See assets/terrain/CREDITS.md.
window.RealmfrontTerrainArt = (() => {
  const images = new Map();
  const ready = Promise.all(["Tilemap_Elevation.png", "Tilemap_Flat.png", "08.png", "09.png"].map((name) =>
    new Promise((resolve) => {
      const image = new Image();
      const entry = { image, ready: false };
      images.set(name, entry);
      image.onload = () => { entry.ready = true; resolve(true); };
      image.onerror = () => resolve(false);
      image.src = `assets/terrain/${name}`;
    }),
  ));
  const cache = new WeakMap();
  let meadow;
  function ground(ctx, landforms) {
    if (!images.get("Tilemap_Flat.png").ready) return;
    if (!meadow) {
      meadow = document.createElement("canvas");
      meadow.width = 640;
      meadow.height = 400;
      const g = meadow.getContext("2d");
      g.imageSmoothingEnabled = false;
      for (let y = 0; y < 400; y += 96)
        for (let x = 0; x < 640; x += 96)
          g.drawImage(images.get("Tilemap_Flat.png").image, 64, 64, 64, 64, x, y, 96, 96);
      g.globalCompositeOperation = "destination-in";
      // Fade to zero at all four edges, including the shorter canvas axis.
      g.translate(320, 200);
      g.scale(320, 200);
      const fade = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      fade.addColorStop(0, "#ffffff");
      fade.addColorStop(1, "#ffffff00");
      g.fillStyle = fade;
      g.fillRect(-1, -1, 2, 2);
    }
    ctx.save();
    ctx.globalAlpha = 0.24;
    for (const f of landforms)
      ctx.drawImage(meadow, f.x - 270, f.y - 210, 1200, 880);
    for (const [x, y] of [[650, 650], [2350, 2050], [3600, 2400], [4950, 3000], [5600, 4050]])
      ctx.drawImage(meadow, x - 320, y - 200, 900, 600);
    ctx.restore();
  }
  function build(form, size) {
    const cells = new Set();
    let row = 0, width = 0;
    for (const [inset, count, depth] of form.rows) {
      for (let y = row; y < row + depth; y++)
        for (let x = inset; x < inset + count; x++) cells.add(`${x},${y}`);
      row += depth;
      width = Math.max(width, inset + count);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width * size + 32;
    canvas.height = row * size + 32;
    const g = canvas.getContext("2d"), has = (x, y) => cells.has(`${x},${y}`);
    g.translate(16, 8);
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#10251a55";
    g.beginPath();
    for (const cell of cells) {
      const [x, y] = cell.split(",").map(Number);
      g.rect(x * size - 5, y * size + 8, size + 10, size + 9);
    }
    g.fill();
    const stone = images.get("Tilemap_Elevation.png").image;
    const grass = images.get("Tilemap_Flat.png").image;
    for (const cell of cells) {
      const [x, y] = cell.split(",").map(Number);
      const left = has(x - 1, y), right = has(x + 1, y), up = has(x, y - 1), down = has(x, y + 1);
      const sx = !left ? 0 : !right ? 128 : 64;
      const sy = !up ? 0 : !down ? 128 : 64;
      const px = x * size, py = y * size;
      g.filter = "saturate(0.65) brightness(0.8)";
      g.drawImage(stone, sx, sy, 64, 64, px, py, size, size);
      g.filter = "none";
      if (form.kind === "pit") {
        // An inset rocky basin: the tile rim follows the same blocked footprint.
        const l = left ? 0 : 18, t = up ? 0 : 20;
        g.fillStyle = "#172e30";
        g.fillRect(px + l, py + t, size - l - (right ? 0 : 18), size - t - (down ? 0 : 22));
        g.fillStyle = "#284340";
        if (!up) g.fillRect(px + l, py + t, size - l - (right ? 0 : 18), 7);
      } else {
        // Grassy cap and a visible rock face on the southern, downhill edge.
        g.globalAlpha = 0.84;
        g.filter = "saturate(0.65) brightness(0.68)";
        g.drawImage(grass, sx, sy, 64, 64, px, py, size, size);
        g.globalAlpha = 1;
        if (!down) g.drawImage(stone, sx, 192, 64, 64, px, py + size - 38, size, 38);
        g.filter = "none";
        // Small shrubs belong to the inaccessible plateau, not worker resources.
        if (left && right && up && (x * 7 + y * 11) % 5 === 0) {
          const shrub = images.get((x + y) % 2 ? "08.png" : "09.png");
          if (shrub.ready) g.drawImage(shrub.image, px + 20, py + 15, 55, 55);
        }
      }
    }
    return canvas;
  }
  function draw(ctx, landforms, size) {
    if (!images.get("Tilemap_Elevation.png").ready || !images.get("Tilemap_Flat.png").ready) return false;
    // Wait for small decorations too, so a slow load cannot create a partial cache.
    if (!images.get("08.png").ready || !images.get("09.png").ready) return false;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (const form of landforms) {
      if (!cache.has(form)) cache.set(form, build(form, form.tileSize || size));
      ctx.drawImage(cache.get(form), form.x - 16, form.y - 8);
    }
    ctx.restore();
    return true;
  }
  return { ready, images, ground, draw };
})();
