"use strict";

// CC0 Tiny Swords trees/rubble plus an original generated golden-deposit atlas.
window.RealmfrontResources = (() => {
  const atlas = {
      "Gold_Deposits.png": [
        {
          x: 110,
          y: 208,
          w: 412,
          h: 291,
        },
        {
          x: 719,
          y: 156,
          w: 446,
          h: 342,
        },
        {
          x: 154,
          y: 743,
          w: 326,
          h: 386,
        },
        {
          x: 719,
          y: 845,
          w: 445,
          h: 268,
        },
      ],
      "Tree.png": [
        {
          x: 43,
          y: 4,
          w: 111,
          h: 174,
        },
        {
          x: 236,
          y: 4,
          w: 110,
          h: 174,
        },
        {
          x: 427,
          y: 4,
          w: 111,
          h: 174,
        },
        {
          x: 618,
          y: 4,
          w: 111,
          h: 174,
        },
        {
          x: 39,
          y: 197,
          w: 106,
          h: 173,
        },
        {
          x: 235,
          y: 199,
          w: 109,
          h: 171,
        },
        {
          x: 79,
          y: 530,
          w: 36,
          h: 30,
        },
      ],
      "Rock_Small.png": [
        {
          x: 18,
          y: 18,
          w: 29,
          h: 22,
        },
      ],
      "Rock_Medium.png": [
        {
          x: 12,
          y: 15,
          w: 44,
          h: 34,
        },
      ],
      "Rock_Large.png": [
        {
          x: 16,
          y: 21,
          w: 31,
          h: 22,
        },
      ],
    },
    images = new Map();
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
          image.src = `assets/resources/${file}`;
        }),
    ),
  );
  function part(ctx, file, frame, x, bottom, width) {
    const entry = images.get(file);
    if (!entry?.ready) return false;
    const r = atlas[file][frame];
    const height = (width * r.h) / r.w;
    ctx.drawImage(
      entry.image,
      r.x,
      r.y,
      r.w,
      r.h,
      x - width / 2,
      bottom - height,
      width,
      height,
    );
    return true;
  }
  function draw(ctx, node, time) {
    const file =
      node.type === "tree"
        ? "Tree.png"
        : node.amount > 0
          ? "Gold_Deposits.png"
          : "Rock_Large.png";
    if (!images.get(file)?.ready) return false;
    const { x, y, r } = node;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (node.type === "tree") {
      const depleted = node.amount <= 0,
        cutting = !depleted && time - (node.lastHarvest ?? -100) < 0.25;
      const frame = depleted
        ? 6
        : cutting
          ? 4 + (Math.floor(time * 8) % 2)
          : Math.floor(time * 4 + x * 0.01) % 4;
      const width = depleted
        ? r * 1.25
        : r * (2.7 + (Math.floor(x + y) % 3) * 0.18);
      part(ctx, file, frame, x, y + r * 0.4, width);
    } else {
      const width = r * 2.8;
      ctx.fillStyle = "#10201c55";
      ctx.beginPath();
      ctx.ellipse(x, y + r * 0.3, r * 1.7, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      if (node.amount > 0) {
        ctx.imageSmoothingEnabled = true;
        part(
          ctx,
          "Gold_Deposits.png",
          oreVariant(node),
          x,
          y + r * 0.4,
          r * 3.2,
        );
        if (time - (node.lastHarvest ?? -100) < 0.25) {
          ctx.strokeStyle = "#fff0a6";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x + r * 0.85, y - r * 1.1);
          ctx.lineTo(x + r * 1.15, y - r * 1.1);
          ctx.moveTo(x + r, y - r * 1.25);
          ctx.lineTo(x + r, y - r * 0.95);
          ctx.stroke();
        }
      } else {
        part(ctx, "Rock_Medium.png", 0, x - r * 0.7, y + r * 0.35, r * 1.65);
        part(ctx, "Rock_Large.png", 0, x + r * 0.15, y + r * 0.4, width);
      }
    }
    ctx.restore();
    return true;
  }
  function oreVariant(node) {
    return Math.abs(Math.floor(node.x * 0.17 + node.y * 0.11)) % 4;
  }
  function bounds(node) {
    if (node.type === "ore") {
      const frame = atlas["Gold_Deposits.png"][oreVariant(node)],
        height = (node.r * 3.2 * frame.h) / frame.w;
      return {
        x: node.x - node.r * 1.75,
        y: node.y + node.r * 0.4 - Math.max(height, node.r * 2.7),
        w: node.r * 3.5,
        h: Math.max(height, node.r * 2.7) + node.r * 0.2,
      };
    }
    const width = node.r * (2.7 + (Math.floor(node.x + node.y) % 3) * 0.18),
      frame = atlas["Tree.png"][0],
      height = (width * frame.h) / frame.w;
    return {
      x: node.x - width / 2,
      y: node.y + node.r * 0.4 - height,
      w: width,
      h: height,
    };
  }
  return { images, ready, draw, bounds };
})();
