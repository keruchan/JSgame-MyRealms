"use strict";

window.RealmfrontTerrain = (() => {
  const world = window.RealmfrontWorld,
    clearance = 30;
  // Long, thin ridges shape routes without consuming large building areas.
  // Crowded matches add more ranges and deeper coast-connected frontiers.
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
    { name: "Valley Divide", cx: 2400, cy: 2016, axis: "vertical", kind: "pit" },
    { name: "Copper Spine", cx: 4224, cy: 3360, axis: "vertical", kind: "cliff" },
    { name: "Southern Rise", cx: 3552, cy: 4128, axis: "horizontal", kind: "cliff" },
    { name: "Eastern Steps", cx: 5680, cy: 1728, axis: "horizontal", kind: "cliff" },
  ];
  let landforms = [], obstacles = [], nodes = [], links = [], playerCount = 0;
  function rectangles(form) {
    let row = 0;
    const size = form.tileSize || tileSize;
    return form.rows.map(([inset, width, depth]) => {
      const rectangle = { x: form.x + inset * size, y: form.y + row * size,
        w: width * size, h: depth * size, kind: form.kind };
      row += depth;
      return rectangle;
    });
  }
  function configure(count, settlements, outposts) {
    playerCount = Math.max(3, Math.min(10, Math.floor(count)));
    landforms = [];
    obstacles = [];
    const amount = 9 + Math.ceil((playerCount - 3) * 4 / 7);
    const length = 17 - (playerCount - 3);
    const circleGap = (o, p) => Math.hypot(
      Math.max(o.x - p.x, 0, p.x - o.x - o.w),
      Math.max(o.y - p.y, 0, p.y - o.y - o.h));
    // Bisect each neighboring pair at the actual shoreline. These frontiers
    // touch the sea, so walking along the border cannot bypass them.
    const shore = [...settlements].sort((a, b) => world.perimeterPosition(a) - world.perimeterPosition(b));
    const span = 10 + Math.ceil((playerCount - 3) / 2), depth = span * tileSize;
    for (let i = 0; i < shore.length; i++) {
      const a = shore[i], b = shore[(i + 1) % shore.length];
      let low = world.perimeterPosition(a), high = world.perimeterPosition(b);
      if (high <= low) high += world.perimeterLength();
      for (let step = 0; step < 40; step++) {
        const mid = (low + high) / 2, p = world.perimeterPoint(mid);
        if (Math.hypot(p.x - a.x, p.y - a.y) < Math.hypot(p.x - b.x, p.y - b.y)) low = mid;
        else high = mid;
      }
      const anchor = world.perimeterPoint((low + high) / 2);
      const edge = anchor.y === 0 ? "north" : anchor.x === world.width ? "east" : anchor.y === world.height ? "south" : "west";
      const separation = Math.hypot(b.x - a.x, b.y - a.y);
      let dx = -(b.y - a.y) / separation, dy = (b.x - a.x) / separation;
      if (dx * (world.width / 2 - anchor.x) + dy * (world.height / 2 - anchor.y) < 0) { dx = -dx; dy = -dy; }
      const length = depth / Math.max(Math.abs(dx), Math.abs(dy)), size = tileSize / (separation < 1600 ? 3 : 2);
      const cells = new Map();
      for (let distance = 0; distance <= length + 1; distance += size / 4) {
        const x = Math.floor((anchor.x + dx * Math.min(length, distance)) / size);
        const y = Math.floor((anchor.y + dy * Math.min(length, distance)) / size);
        if (!cells.has(y)) cells.set(y, new Set());
        cells.get(y).add(x);
      }
      const xs = [...cells.values()].flatMap((row) => [...row]), ys = [...cells.keys()];
      const minX = Math.min(...xs), minY = Math.min(...ys), rows = [];
      for (let y = minY; y <= Math.max(...ys); y++) {
        const row = [...cells.get(y)], inset = Math.min(...row) - minX, width = Math.max(...row) - minX - inset + 1;
        const previous = rows.at(-1);
        if (previous && previous[0] === inset && previous[1] === width) previous[2]++;
        else rows.push([inset, width, 1]);
      }
      const form = { name: `Frontier ${i + 1}`, role: "frontier", kind: "cliff", between: [a.id, b.id], edge, anchor,
        gate: { x: anchor.x + dx * (length + 220), y: anchor.y + dy * (length + 220) },
        forestAnchor: { x: anchor.x + dx * (length + 560), y: anchor.y + dy * (length + 560) },
        resourceClearing: { x: anchor.x + dx * (length + 390), y: anchor.y + dy * (length + 390) },
        axis: Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical", rows, tileSize: size, x: minX * size, y: minY * size };
      const rects = rectangles(form);
      if (!rects.every((o) => settlements.every((p) => circleGap(o, p) >= 650) && outposts.every((p) => circleGap(o, p) >= 300)))
        throw new Error("Frontier overlaps a protected clearing: " + form.name);
      landforms.push(form);
      obstacles.push(...rects);
    }
    const sharedClearings = [
      ...landforms.map((f) => ({ ...f.resourceClearing, radius: 400 })),
      ...outposts.map((p) => ({ x: p.x - 240, y: p.y - 320, radius: 230 })),
    ];
    const approaches = landforms.flatMap((form) => form.between.map((id) => ({
      from: settlements.find((p) => p.id === id), to: form.gate,
    })));
    function fits(rects) {
      return rects.every((o) => world.contains(o.x, o.y, 96) &&
        world.contains(o.x + o.w, o.y + o.h, 96) &&
        settlements.every((p) => circleGap(o, p) >= 650) &&
        outposts.every((p) => circleGap(o, p) >= 300) &&
        sharedClearings.every((p) => circleGap(o, p) >= p.radius) &&
        approaches.every((path) => !intersects(path.from, path.to, o, 128)) &&
        obstacles.every((other) => o.x >= other.x + other.w + 128 ||
          o.x + o.w <= other.x - 128 || o.y >= other.y + other.h + 128 ||
          o.y + o.h <= other.y - 128));
    }
    templates.slice(0, amount).forEach((template, index) => {
      const desired = Math.max(8, length - (template.kind === "pit" ? 3 : index % 3));
      let placed = false;
      for (let span = desired; span >= Math.max(7, desired - 4) && !placed; span--) {
        const part = Math.floor(span / 3);
        const rows = template.axis === "horizontal"
          ? [[0, span - 2, 1], [1, span - 1, 1]]
          : [[0, 1, part], [1, 1, part], [0, 1, span - part * 2]];
        for (let radius = 0; radius <= 3072 && !placed; radius += 96) {
          const samples = radius ? Math.ceil(radius / 30) : 1;
          for (let i = 0; i < samples; i++) {
            const angle = i / samples * Math.PI * 2;
            const form = { name: template.name, role: "interior", kind: template.kind, axis: template.axis, rows,
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
      if (!placed) {
        // A slim spur fills remaining valleys in crowded matches without
        // sacrificing the protected starting circles or army-width passages.
        const candidates = [];
        for (let y = 192; y < world.height - 192; y += 128)
          for (let x = 192; x < world.width - 192; x += 128) candidates.push({ x, y });
        candidates.sort((a, b) => Math.hypot(a.x - template.cx, a.y - template.cy) - Math.hypot(b.x - template.cx, b.y - template.cy));
        for (let span = Math.max(6, desired - 4); span >= 3 && !placed; span--)
          for (const p of candidates) {
            for (const axis of [template.axis, template.axis === "horizontal" ? "vertical" : "horizontal"]) {
              const form = { name: template.name, role: "interior", kind: template.kind, axis,
                x: p.x, y: p.y, rows: axis === "horizontal" ? [[0, span, 1]] : [[0, 1, span]] };
              const rects = rectangles(form);
              if (!fits(rects)) continue;
              landforms.push(form); obstacles.push(...rects); placed = true; break;
            }
            if (placed) break;
          }
      }
      // Protected starts and shared expansion sites take priority over a hill.
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
