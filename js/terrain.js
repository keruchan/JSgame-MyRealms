"use strict";

window.RealmfrontTerrain = (() => {
  const world = window.RealmfrontWorld,
    clearance = 30;
  // Long, thin ridges shape routes without consuming large building areas.
  // Fewer kingdoms get longer ranges; crowded matches get more, shorter ranges.
  const tileSize = 96;
  const templates = [
    { name: "West Bluff", cx: 1488, cy: 2352, axis: "vertical", kind: "cliff" },
    { name: "Pinecrest", cx: 1344, cy: 1248, axis: "horizontal", kind: "cliff" },
    { name: "Dawn Ridge", cx: 5088, cy: 1056, axis: "vertical", kind: "cliff" },
    { name: "Crown Highlands", cx: 3360, cy: 1536, axis: "horizontal", kind: "cliff" },
    { name: "Broken Hills", cx: 3360, cy: 3216, axis: "horizontal", kind: "cliff" },
    { name: "Fern Heights", cx: 1248, cy: 3696, axis: "horizontal", kind: "cliff" },
    { name: "Amber Uplands", cx: 4704, cy: 3744, axis: "horizontal", kind: "cliff" },
    { name: "Dawn Hollow", cx: 4320, cy: 2112, axis: "horizontal", kind: "pit" },
    { name: "Willow Hollow", cx: 2304, cy: 3072, axis: "vertical", kind: "pit" },
    { name: "North Steps", cx: 2880, cy: 864, axis: "horizontal", kind: "cliff" },
    { name: "East Spur", cx: 5376, cy: 2496, axis: "vertical", kind: "cliff" },
    { name: "South Shelf", cx: 2208, cy: 4224, axis: "horizontal", kind: "cliff" },
  ];
  let landforms = [], obstacles = [], nodes = [], links = [], playerCount = 0;
  function rectangles(form) {
    let row = 0;
    return form.rows.map(([inset, width, depth]) => {
      const rectangle = { x: form.x + inset * tileSize, y: form.y + row * tileSize,
        w: width * tileSize, h: depth * tileSize, kind: form.kind };
      row += depth;
      return rectangle;
    });
  }
  function configure(count, settlements, outposts) {
    playerCount = Math.max(3, Math.min(10, Math.floor(count)));
    landforms = [];
    obstacles = [];
    const amount = 9 + Math.round((playerCount - 3) * 3 / 7);
    const length = 17 - (playerCount - 3);
    const circleGap = (o, p) => Math.hypot(
      Math.max(o.x - p.x, 0, p.x - o.x - o.w),
      Math.max(o.y - p.y, 0, p.y - o.y - o.h));
    function fits(rects) {
      return rects.every((o) => world.contains(o.x, o.y, 96) &&
        world.contains(o.x + o.w, o.y + o.h, 96) &&
        settlements.every((p) => circleGap(o, p) >= 650) &&
        outposts.every((p) => circleGap(o, p) >= 300) &&
        obstacles.every((other) => o.x >= other.x + other.w + 160 ||
          o.x + o.w <= other.x - 160 || o.y >= other.y + other.h + 160 ||
          o.y + o.h <= other.y - 160));
    }
    templates.slice(0, amount).forEach((template, index) => {
      const desired = Math.max(8, length - (template.kind === "pit" ? 3 : index % 3));
      let placed = false;
      for (let span = desired; span >= Math.max(7, desired - 4) && !placed; span--) {
        const part = Math.floor(span / 3);
        const rows = template.axis === "horizontal"
          ? [[0, span - 2, 1], [1, span - 1, 1], [span - 3, 2, 1]]
          : [[0, 2, part], [1, 2, part], [0, 2, span - part * 2]];
        for (let radius = 0; radius <= 768 && !placed; radius += 96) {
          const samples = radius ? Math.ceil(radius / 30) : 1;
          for (let i = 0; i < samples; i++) {
            const angle = i / samples * Math.PI * 2;
            const form = { name: template.name, kind: template.kind, axis: template.axis, rows,
              x: Math.round((template.cx + Math.cos(angle) * radius) / tileSize -
                (template.axis === "horizontal" ? span : 3) / 2) * tileSize,
              y: Math.round((template.cy + Math.sin(angle) * radius) / tileSize -
                (template.axis === "vertical" ? span : 3) / 2) * tileSize };
            const rects = rectangles(form);
            if (!fits(rects)) continue;
            landforms.push(form);
            obstacles.push(...rects);
            placed = true;
            break;
          }
        }
      }
      if (!placed) throw new Error("No safe terrain position for " + template.name);
    });
    rebuildNavigation();
  }
  function isWalkable(x, y, radius = 0) {
    return (
      world.contains(x, y, radius) &&
      obstacles.every(
        (o) =>
          x < o.x - radius ||
          x > o.x + o.w + radius ||
          y < o.y - radius ||
          y > o.y + o.h + radius,
      )
    );
  }
  function intersects(a, b, o, radius = 0) {
    let low = 0,
      high = 1;
    for (const [start, end, min, max] of [
      [a.x, b.x, o.x - radius, o.x + o.w + radius],
      [a.y, b.y, o.y - radius, o.y + o.h + radius],
    ]) {
      const delta = end - start;
      if (Math.abs(delta) < 1e-9) {
        if (start < min || start > max) return false;
        continue;
      }
      let t1 = (min - start) / delta,
        t2 = (max - start) / delta;
      if (t1 > t2) [t1, t2] = [t2, t1];
      low = Math.max(low, t1);
      high = Math.min(high, t2);
      if (low > high) return false;
    }
    return true;
  }
  const clearLine = (a, b, radius = 0) =>
    obstacles.every((o) => !intersects(a, b, o, radius));
  function nearestWalkable(x, y, radius = clearance) {
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    x = clamp(x, radius + 1, world.width - radius - 1);
    y = clamp(y, radius + 1, world.height - radius - 1);
    if (isWalkable(x, y, radius)) return { x, y };
    const candidates = [];
    for (const o of obstacles) {
      const left = o.x - radius - 2,
        right = o.x + o.w + radius + 2,
        top = o.y - radius - 2,
        bottom = o.y + o.h + radius + 2;
      candidates.push(
        { x: left, y: clamp(y, top, bottom) },
        { x: right, y: clamp(y, top, bottom) },
        { x: clamp(x, left, right), y: top },
        { x: clamp(x, left, right), y: bottom },
      );
      for (const px of [left, right])
        for (const py of [top, bottom]) candidates.push({ x: px, y: py });
    }
    return (
      candidates
        .filter((p) => isWalkable(p.x, p.y, radius))
        .sort(
          (a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y),
        )[0] || null
    );
  }
  // A small visibility graph keeps routing affordable even with ten armies.
  function rebuildNavigation() {
    nodes = [];
    for (const o of obstacles)
      for (const x of [o.x - clearance - 2, o.x + o.w + clearance + 2])
        for (const y of [o.y - clearance - 2, o.y + o.h + clearance + 2])
          if (isWalkable(x, y, clearance)) nodes.push({ x, y });
    links = nodes.map(() => []);
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++)
        if (clearLine(nodes[i], nodes[j], clearance)) {
          const distance = Math.hypot(
            nodes[i].x - nodes[j].x,
            nodes[i].y - nodes[j].y,
          );
          links[i].push({ to: j, distance });
          links[j].push({ to: i, distance });
        }
  }
  function findPath(start, destination) {
    const goal = nearestWalkable(destination.x, destination.y);
    if (!goal) return null;
    if (clearLine(start, goal, clearance)) return [goal];
    const count = nodes.length,
      points = [...nodes, start, goal],
      startId = count,
      endId = count + 1;
    const graph = links.map((list) => [...list]);
    graph.push([], []);
    for (let i = 0; i < count; i++)
      for (const id of [startId, endId])
        if (clearLine(points[i], points[id], clearance)) {
          const distance = Math.hypot(
            points[i].x - points[id].x,
            points[i].y - points[id].y,
          );
          graph[i].push({ to: id, distance });
          graph[id].push({ to: i, distance });
        }
    const costs = new Array(count + 2).fill(Infinity),
      previous = new Array(count + 2).fill(-1),
      closed = new Set();
    costs[startId] = 0;
    for (let step = 0; step < count + 2; step++) {
      let current = -1,
        best = Infinity;
      for (let i = 0; i < costs.length; i++) {
        const score =
          costs[i] + Math.hypot(points[i].x - goal.x, points[i].y - goal.y);
        if (!closed.has(i) && score < best) {
          best = score;
          current = i;
        }
      }
      if (current < 0) return null;
      if (current === endId) {
        const path = [];
        for (let i = endId; i !== startId; i = previous[i])
          path.unshift({ ...points[i] });
        return path;
      }
      closed.add(current);
      for (const edge of graph[current])
        if (costs[current] + edge.distance < costs[edge.to]) {
          costs[edge.to] = costs[current] + edge.distance;
          previous[edge.to] = current;
        }
    }
    return null;
  }
  function draw(ctx) {
    if (window.RealmfrontTerrainArt?.draw(ctx, landforms, tileSize)) return;
    for (const o of obstacles) {
      ctx.fillStyle = "#15221ca0";
      ctx.fillRect(o.x - 8, o.y - 6, o.w + 16, o.h + 20);
      ctx.fillStyle = o.kind === "pit" ? "#8c795b" : "#76806a";
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = o.kind === "pit" ? "#101b20" : "#465346";
      ctx.fillRect(o.x + 10, o.y + 12, o.w - 20, o.h - 24);
      if (o.kind === "cliff") {
        ctx.fillStyle = "#68735d";
        ctx.fillRect(o.x + 10, o.y + 12, o.w - 20, o.h - 45);
        ctx.strokeStyle = "#8f987a";
        ctx.lineWidth = 3;
        for (let y = o.y + 30; y < o.y + o.h - 25; y += 65) {
          ctx.beginPath();
          ctx.moveTo(o.x + 12, y);
          ctx.lineTo(o.x + o.w - 12, y + 8);
          ctx.stroke();
        }
        ctx.fillStyle = "#a6a17a";
        ctx.fillRect(o.x + 4, o.y, o.w - 8, 7);
      } else {
        ctx.fillStyle = "#223331";
        ctx.fillRect(o.x + 16, o.y + 15, o.w - 32, 15);
        ctx.strokeStyle = "#384740";
        ctx.lineWidth = 3;
        for (let x = o.x + 35; x < o.x + o.w - 20; x += 70) {
          ctx.beginPath();
          ctx.moveTo(x, o.y + o.h - 16);
          ctx.lineTo(x + 12, o.y + o.h - 48);
          ctx.lineTo(x + 5, o.y + o.h - 66);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = "#b1a987";
      ctx.lineWidth = 3;
      ctx.strokeRect(o.x + 2, o.y + 2, o.w - 4, o.h - 4);
      for (let y = o.y + 14; y < o.y + o.h; y += 54) {
        ctx.fillStyle = "#8b8d70";
        ctx.fillRect(o.x - 5, y, 12, 22);
        ctx.fillRect(o.x + o.w - 7, y + 9, 12, 18);
      }
    }
  }
  function drawMini(ctx) {
    for (const o of obstacles) {
      const a = world.mapPoint(o.x, o.y),
        b = world.mapPoint(o.x + o.w, o.y + o.h);
      ctx.fillStyle = o.kind === "pit" ? "#111d23" : "#a09b7c";
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    }
  }
  return {
    configure,
    get playerCount() { return playerCount; },
    get landforms() { return landforms; },
    tileSize,
    get obstacles() { return obstacles; },
    clearance,
    isWalkable,
    clearLine,
    nearestWalkable,
    findPath,
    draw,
    drawMini,
  };
})();
