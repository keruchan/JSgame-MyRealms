"use strict";

window.RealmfrontResourceLayout = (() => {
  const terrain = window.RealmfrontTerrain;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // Authored woodland locations leave substantial open valleys between groves.
  const woodland = [
    { x: 1900, y: 1400 }, { x: 5500, y: 1550 },
    { x: 850, y: 2850 }, { x: 3850, y: 3550 },
    { x: 4400, y: 950 }, { x: 1600, y: 4100 },
    { x: 4900, y: 3150 }, { x: 2100, y: 850 },
    { x: 5620, y: 3930 }, { x: 2700, y: 3600 },
    { x: 3900, y: 650 },
  ];
  function segmentDistance(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1,
      ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  }
  function routeMidpoint(a, b) {
    const points = [a, ...(terrain.findPath(a, b) || [b])];
    const lengths = points.slice(1).map((p, i) => distance(points[i], p));
    let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
    for (let i = 0; i < lengths.length; i++) {
      if (remaining <= lengths[i]) {
        const t = remaining / lengths[i];
        return { x: points[i].x + (points[i + 1].x - points[i].x) * t,
          y: points[i].y + (points[i + 1].y - points[i].y) * t };
      }
      remaining -= lengths[i];
    }
    return points.at(-1);
  }
  // A minimum spanning tree identifies actual neighboring kingdoms, so an
  // empty starting position does not receive a speculative gold expansion.
  function borders(factions) {
    const connected = new Set([0]), edges = [];
    while (connected.size < factions.length) {
      let best;
      for (const i of connected)
        for (let j = 0; j < factions.length; j++) {
          if (connected.has(j)) continue;
          const length = distance(factions[i], factions[j]);
          if (!best || length < best.length) best = { a: factions[i], b: factions[j], j, length };
        }
      connected.add(best.j);
      edges.push(best);
    }
    return edges;
  }
  function generate({ factions, buildings, outposts, roads, random = Math.random }) {
    const nodes = [], miningSites = [], forests = [];
    const rand = (min, max) => min + random() * (max - min);
    const roadEdges = roads.flatMap((route) => route.slice(1).map((p, i) => [route[i], p]));
    function free(p, type) {
      return terrain.isWalkable(p.x, p.y, 55) &&
        buildings.every((b) => distance(p, b) > b.size * 0.72 + 46) &&
        outposts.every((o) => distance(p, o) > 180) &&
        roadEdges.every(([a, b]) => segmentDistance(p, a, b) > 65) &&
        nodes.every((n) => distance(p, n) >= (type === "tree" && n.type === "tree" ? 44 : 95));
    }
    function pack(anchor, offsets, type, allowed, maxRadius = 960) {
      for (let radius = 0; radius <= maxRadius; radius += 64) {
        const samples = radius ? Math.ceil(radius / 14) : 1;
        for (let i = 0; i < samples; i++) {
          const angle = i / samples * Math.PI * 2 + 0.37;
          const center = { x: anchor.x + Math.cos(angle) * radius,
            y: anchor.y + Math.sin(angle) * radius };
          const points = offsets.map((p) => ({ x: center.x + p.x, y: center.y + p.y }));
          if (terrain.isWalkable(center.x, center.y, 55) && allowed(center, points) &&
            points.every((p) => free(p, type) && terrain.clearLine(center, p, 30))) return { center, points };
        }
      }
      throw new Error(`No safe ${type} site near ${anchor.x}, ${anchor.y}`);
    }
    function addNodes(points, type, amount, group, area) {
      for (const p of points) nodes.push({ ...p, type, amount, max: amount,
        r: type === "ore" ? 20 : rand(16, 20), group, area });
    }
    function gold(anchor, offsets, name, area, allowed, owner = null, neighbors = []) {
      const site = pack(anchor, offsets, "ore", (center, points) =>
        miningSites.every((s) => distance(s, center) >= 480) && allowed(center, points));
      const id = `gold-${miningSites.length}`;
      addNodes(site.points, "ore", area === "starter" ? 1200 : 2400, id, area);
      miningSites.push({ ...site.center, id, name, area, owner, neighbors });
    }
    // Equal opening reserves. Limited starter gold makes expansion worthwhile.
    for (const f of factions) gold(
      { x: f.x - 250, y: f.y + 100 }, [{ x: -60, y: 25 }, { x: 60, y: -25 }],
      `${f.name} deposits`, "starter",
      (center, points) => distance(center, f) < 490 && points.every((p) =>
        factions.every((other) => other === f || distance(p, f) < distance(p, other))), f.id,
    );
    const vein = [{ x: -95, y: 40 }, { x: 0, y: -65 }, { x: 95, y: 40 }];
    const contested = (center, points) => points.every((p) => factions.every((f) => distance(p, f) >= 600));
    // Crossing veins are always present; the capture circle itself stays clear.
    outposts.forEach((o, i) => gold(
      { x: o.x + (i === 0 ? -280 : 280), y: o.y + (i === 1 ? -240 : 240) },
      vein, `${o.name} gold`, "crossing", (center, points) =>
        distance(center, o) <= 650 && contested(center, points),
    ));
    for (const { a, b } of borders(factions)) gold(
      routeMidpoint(a, b), vein, "Frontier gold", "frontier",
      (center, points) => contested(center, points) &&
        Math.abs(distance(center, a) - distance(center, b)) <= 450,
      null, [a.id, b.id],
    );
    function treeOffsets(count) {
      const phase = rand(0, Math.PI * 2), offsets = [{ x: 0, y: 0 }];
      for (let ring = 1; offsets.length < count; ring++) {
        const steps = ring * 6;
        for (let i = 0; i < steps && offsets.length < count; i++) {
          const angle = phase + i / steps * Math.PI * 2;
          offsets.push({ x: Math.cos(angle) * ring * 57 + rand(-4, 4),
            y: Math.sin(angle) * ring * 57 + rand(-4, 4) });
        }
      }
      return offsets;
    }
    function forest(anchor, count, area, allowed, owner = null) {
      const grove = pack(anchor, treeOffsets(count), "tree", (center, points) =>
        forests.every((f) => distance(f, center) > 390) && allowed(center, points));
      const id = `forest-${forests.length}`;
      addNodes(grove.points, "tree", 1200, id, area);
      forests.push({ ...grove.center, id, area, owner });
    }
    for (const f of factions) forest({ x: f.x + 260, y: f.y - 100 }, 12, "starter",
      (center) => distance(center, f) < 550, f.id);
    const groveCount = 6 + Math.ceil(factions.length / 2);
    for (const anchor of woodland.slice(0, groveCount)) forest(anchor, 18, "woodland",
      (center) => factions.every((f) => distance(center, f) > 650));
    // One outlying tree per woodland, rather than a uniform scatter over the map.
    for (const grove of forests.filter((f) => f.area === "woodland")) {
      const solo = pack({ x: grove.x + 265, y: grove.y - 180 }, [{ x: 0, y: 0 }], "tree",
        (center) => forests.every((f) => distance(center, f) >= 230), 512);
      addNodes(solo.points, "tree", 1000, `outlier-${grove.id}`, "outlier");
    }
    // Back-to-front drawing lets neighboring crowns overlap naturally.
    nodes.sort((a, b) => a.y - b.y || a.x - b.x);
    return { nodes, miningSites, forests };
  }
  return { generate };
})();
