"use strict";

window.RealmfrontResourceLayout = (() => {
  const terrain = window.RealmfrontTerrain;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function segmentDistance(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1,
      ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  }
  function routeDistance(a, b) {
    const path = terrain.findPath(a, b);
    if (!path) return Infinity;
    let length = 0, previous = a;
    for (const p of path) { length += distance(previous, p); previous = p; }
    return length;
  }
  function balanced(center, a, b, tolerance = 220) {
    if (Math.abs(distance(center, a) - distance(center, b)) > 450) return false;
    const left = routeDistance(a, center), right = routeDistance(b, center);
    return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
  }
  function generate({ factions, buildings, outposts, roads, random = Math.random }) {
    const houseRadius = window.RealmfrontData.economyRules.houseRadius;
    const nodes = [], miningSites = [], forests = [], fields = [];
    const rand = (min, max) => min + random() * (max - min);
    const supported = (points, owner, type) => {
      const house = buildings.find((b) => b.f === owner && b.type === type && b.hp > 0);
      return house && points.every((p) => distance(p, house) <= houseRadius);
    };
    const roadEdges = roads.flatMap((route) => route.slice(1).map((p, i) => [route[i], p]));
    function free(p, type) {
      return terrain.isWalkable(p.x, p.y, type === "field" ? 64 : 55) &&
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
          if (terrain.isWalkable(center.x, center.y, 55) &&
            points.every((p) => free(p, type) && terrain.clearLine(center, p, 30)) && allowed(center, points)) return { center, points };
        }
      }
      throw new Error(`No safe ${type} site near ${anchor.x}, ${anchor.y}`);
    }
    function addNodes(points, type, amount, group, area) {
      for (const p of points) nodes.push({ ...p, type, amount, max: amount,
        r: type === "ore" ? 20 : type === "field" ? 34 : rand(16, 20), group, area });
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
      (center, points) => distance(center, f) < 490 && supported(points, f.id, "mine") && points.every((p) =>
        factions.every((other) => other === f || distance(p, f) < distance(p, other))), f.id,
    );
    const vein = [{ x: -95, y: 40 }, { x: 0, y: -65 }, { x: 95, y: 40 }];
    const contested = (center, points) => points.every((p) => factions.every((f) => distance(p, f) >= 600));
    // The coastal ring gives every kingdom two shared frontier expansions.
    for (const frontier of terrain.landforms.filter((f) => f.role === "frontier")) {
      const [a, b] = frontier.between.map((id) => factions.find((f) => f.id === id));
      gold(frontier.gate, vein, "Frontier gold", "frontier",
        (center, points) => contested(center, points) && balanced(center, a, b), null, [a.id, b.id]);
    }
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
    function forest(anchor, count, area, allowed, owner = null, neighbors = []) {
      const grove = pack(anchor, treeOffsets(count), "tree", (center, points) =>
        forests.every((f) => distance(f, center) > (area === "woodland" ? 340 : 390)) && allowed(center, points), 1536);
      const id = `forest-${forests.length}`;
      addNodes(grove.points, "tree", 1200, id, area);
      forests.push({ ...grove.center, id, area, owner, neighbors });
    }
    for (const f of factions) forest({ x: f.x + 260, y: f.y - 100 }, 12, "starter",
      (center, points) => distance(center, f) < 550 && supported(points, f.id, "lumber"), f.id);
    for (const site of miningSites.filter((site) => site.area === "frontier")) {
      const [a, b] = site.neighbors.map((id) => factions.find((f) => f.id === id));
      const frontier = terrain.landforms.find((form) => form.role === "frontier" && form.between.every((id) => site.neighbors.includes(id)));
      forest(frontier.forestAnchor, 18, "woodland",
        (center) => factions.every((f) => distance(center, f) > 650) && balanced(center, a, b, 320), null, site.neighbors);
    }
    // Flexible central resources follow the equal frontier gold and woodland.
    outposts.forEach((o, i) => gold(
      { x: o.x + (i === 0 ? -280 : 280), y: o.y + (i === 1 ? -240 : 240) },
      vein, `${o.name} gold`, "crossing", (center, points) =>
        distance(center, o) <= 650 && contested(center, points),
    ));
    for (const crossing of outposts) forest({ x: crossing.x - 240, y: crossing.y - 320 }, 18, "woodland",
      (center) => distance(center, crossing) <= 850 && factions.every((f) => distance(center, f) > 650));
    // One outlying tree per woodland, rather than a uniform scatter over the map.
    for (const grove of forests.filter((f) => f.area === "woodland")) {
      const solo = pack({ x: grove.x + 265, y: grove.y - 180 }, [{ x: 0, y: 0 }], "tree",
        (center) => forests.every((f) => distance(center, f) >= 230), 512);
      addNodes(solo.points, "tree", 1000, `outlier-${grove.id}`, "outlier");
    }
    function field(anchor, area, allowed, owner = null, neighbors = []) {
      const site = pack(anchor, [{ x: -48, y: 0 }, { x: 48, y: 0 }], "field", allowed, 1408);
      const id = `field-${fields.length}`;
      addNodes(site.points, "field", area === "starter" ? 1200 : 2400, id, area);
      fields.push({ ...site.center, id, area, owner, neighbors });
    }
    // Every kingdom gets equal farmland; shared frontier plots reward expansion.
    for (const f of factions) field({ x: f.x - 170, y: f.y - 180 }, "starter",
      (center, points) => distance(center, f) < 520 && supported(points, f.id, "farm") && points.every((p) =>
        factions.every((other) => other === f || distance(p, f) < distance(p, other))), f.id);
    for (const frontier of terrain.landforms.filter((form) => form.role === "frontier")) {
      const [a, b] = frontier.between.map((id) => factions.find((f) => f.id === id));
      field({ x: frontier.gate.x + 160, y: frontier.gate.y + 180 }, "frontier",
        (center, points) => contested(center, points) && balanced(center, a, b, 320), null, [a.id, b.id]);
    }
    for (const o of outposts) field({ x: o.x + 170, y: o.y - 170 }, "crossing",
      (center, points) => distance(center, o) < 700 && contested(center, points));
    // Back-to-front drawing lets neighboring crowns overlap naturally.
    nodes.sort((a, b) => a.y - b.y || a.x - b.x);
    return { nodes, miningSites, forests, fields };
  }
  return { generate };
})();
