"use strict";

window.RealmfrontWorld = (() => {
  // Twice the original width and height. The sea is scenery outside playable land.
  const width = 6600,
    height = 4900,
    sea = 420;
  const totalWidth = width + sea * 2,
    totalHeight = height + sea * 2;
  const contains = (x, y, margin = 0) =>
    x >= margin && y >= margin && x <= width - margin && y <= height - margin;
  const fitZoom = (viewport) =>
    Math.min(1.55, viewport.w / totalWidth, viewport.h / totalHeight);
  const mapPoint = (x, y) => ({
    x: ((x + sea) / totalWidth) * 300,
    y: ((y + sea) / totalHeight) * 182,
  });
  const fromMap = (x, y) => ({
    x: (x / 300) * totalWidth - sea,
    y: (y / 182) * totalHeight - sea,
  });
  function clampCamera(camera, viewport) {
    for (const [axis, size, dimension] of [
      ["x", viewport.w, width],
      ["y", viewport.h, height],
    ]) {
      const visible = size / camera.z;
      camera[axis] =
        visible >= dimension + sea * 2
          ? (dimension - visible) / 2
          : Math.max(-sea, Math.min(dimension + sea - visible, camera[axis]));
    }
  }
  function draw(ctx, time) {
    ctx.fillStyle = "#174453";
    ctx.fillRect(-sea, -sea, totalWidth, totalHeight);
    ctx.strokeStyle = "#276374";
    ctx.lineWidth = 3;
    // Restrict wave marks to water, with a slow tide animation.
    for (let x = -sea + 30; x < width + sea; x += 150) {
      for (let y = -sea + 40; y < height + sea; y += 130) {
        if (x > -70 && x < width + 70 && y > -70 && y < height + 70) continue;
        const offset = Math.sin(time * 0.5 + x * 0.03 + y) * 7;
        ctx.beginPath();
        ctx.moveTo(x - 18, y + offset);
        ctx.quadraticCurveTo(x, y + offset + 8, x + 18, y + offset);
        ctx.stroke();
      }
    }
    ctx.fillStyle = "#b6a378";
    ctx.fillRect(-28, -28, width + 56, height + 56);
    ctx.strokeStyle = "#65a9ac";
    ctx.lineWidth = 16;
    ctx.strokeRect(-40, -40, width + 80, height + 80);
    ctx.strokeStyle = "#a1ccc0";
    ctx.lineWidth = 5;
    ctx.strokeRect(-32, -32, width + 64, height + 64);
    ctx.fillStyle = "#304b39";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#405b3d";
    ctx.lineWidth = 18;
    ctx.strokeRect(10, 10, width - 20, height - 20);
    ctx.fillStyle = "#77a7ac";
    ctx.font = "24px Georgia";
    ctx.textAlign = "center";
    ctx.fillText("T H E   O U T E R   S E A", width / 2, -210);
    ctx.fillText("UNREACHABLE WATERS", width / 2, height + 245);
    // Coastal rocks provide detail at both normal and overview zoom levels.
    for (let i = 70; i < width; i += 210) {
      const r = 10 + Math.abs(Math.sin(i)) * 10;
      ctx.fillStyle = "#576d69";
      for (const y of [-62, height + 62]) {
        ctx.beginPath();
        ctx.ellipse(i, y, r * 1.6, r, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (let i = 80; i < height; i += 210) {
      ctx.fillStyle = "#576d69";
      for (const x of [-62, width + 62]) {
        ctx.beginPath();
        ctx.ellipse(x, i, 12, 20, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  return {
    width,
    height,
    sea,
    totalWidth,
    totalHeight,
    contains,
    fitZoom,
    clampCamera,
    mapPoint,
    fromMap,
    draw,
  };
})();
