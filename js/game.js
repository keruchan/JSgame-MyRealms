(() => {
  "use strict";

  // Canvas references and world settings
  const C = document.getElementById("game"),
    ctx = C.getContext("2d"),
    mini = document.getElementById("minimap"),
    mc = mini.getContext("2d");
  const world = window.RealmfrontWorld;
  const terrain = window.RealmfrontTerrain;
  const W = world.width,
    H = world.height,
    colors = [
      "#77b9e5",
      "#e18a7e",
      "#be92d0",
      "#dfb972",
      "#92cc9a",
      "#82cbd0",
      "#efa366",
      "#ef9fc1",
      "#9295e8",
      "#d9e0e5",
    ];

  const { defs, udefs, unitByBuilding, research, briefs } = window.RealmfrontData;

  // Shared game state
  let S = null,
    fullMapView = false,
    camera = { x: 0, y: 0, z: 1 },
    viewport = { w: 100, h: 100 },
    mouse = {
      x: 0,
      y: 0,
      wx: 0,
      wy: 0,
      down: false,
      moved: false,
      startX: 0,
      startY: 0,
      camX: 0,
      camY: 0,
      button: 0,
      startedAt: 0,
      dragDistance: 0,
      selecting: false,
      isTouch: false,
      inside: false,
    },
    keys = {},
    last = 0,
    uiTick = 0,
    lastMinimap = 0,
    toastTimer = 0,
    cursorTick = 0;

  // Utility functions, resources, and entity creation
  const rand = (a, b) => a + Math.random() * (b - a),
    clamp = (v, a, b) => Math.max(a, Math.min(b, v)),
    dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    fmt = (n) => Math.floor(n).toLocaleString();
  const occupied = (x, y, size, ignore) =>
    S.buildings.some(
      (b) =>
        b.hp > 0 &&
        b !== ignore &&
        Math.hypot(b.x - x, b.y - y) < (b.size + size) * 0.57 + 12,
    );
  function faction(id, x, y, diff) {
    return {
      id,
      color: colors[id],
      x,
      y,
      resources: {
        gold: id ? 460 : 440,
        food: id ? 375 : 340,
        wood: id ? 430 : 380,
      },
      pop: 0,
      cap: 0,
      diff,
      alive: true,
      aiTimer: rand(2, 4),
      raidTimer: rand(38, 55),
      strategy: 0,
      expansions: 0,
      tech: { weapons: 0, armor: 0, economy: 0 },
      research: null,
    };
  }
  function log(t) {
    if (!S) return;
    S.logs.unshift(t);
    S.logs.length = 5;
    document.getElementById("events").innerHTML = S.logs
      .map((v) => `<div class="event">${v}</div>`)
      .join("");
  }
  function message(t) {
    const el = document.getElementById("toast");
    el.textContent = t;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2100);
  }
  function canPay(f, c) {
    return Object.entries(c || {}).every(([k, v]) => f.resources[k] >= v);
  }
  function pay(f, c) {
    if (!canPay(f, c)) return false;
    for (const [k, v] of Object.entries(c || {})) f.resources[k] -= v;
    return true;
  }
  function addBuilding(id, type, x, y, free = false) {
    let d = defs[type],
      f = S.factions[id];
    if (!free && !pay(f, d.cost)) return null;
    let b = {
      id: S.nextId++,
      f: id,
      type,
      x,
      y,
      size: d.size,
      hp: d.hp,
      maxHp: d.hp,
      level: 1,
      attackTimer: 0,
      train: [],
      queueInfo: [],
      workers: [],
      progress: 0,
      invested: { ...d.cost },
    };
    S.buildings.push(b);
    f.cap += d.cap || 0;
    return b;
  }
  function addUnit(id, type, x, y, free = false) {
    let f = S.factions[id],
      d = udefs[type];
    if (!free && !pay(f, d.cost)) return null;
    let u = {
      id: S.nextId++,
      f: id,
      type,
      ...terrain.nearestWalkable(
        x,
        y,
        Math.max(d.radius + 4, terrain.clearance),
      ),
      hp: d.hp,
      maxHp: d.hp,
      move: null,
      target: null,
      attackTimer: rand(0, 0.4),
      think: 0,
      anim: 0,
      hold: false,
      stance: "auto",
      autoHarvest: 0,
      level: 1,
      invested: { ...d.cost },
      job: null,
      attackMove: false,
      facing: 1,
      actionTime: 0,
    };
    S.units.push(u);
    f.pop++;
    return u;
  }

  // New skirmish setup
  function init() {
    let n = clamp(
        Math.floor(+document.getElementById("enemyCount").value) || 3,
        2,
        9,
      ),
      d = +document.getElementById("difficulty").value;
    S = {
      running: true,
      cheats: { fastTraining: false, armySlots: 0 },
      paused: false,
      time: 0,
      units: [],
      buildings: [],
      shots: [],
      particles: [],
      nodes: [],
      factions: [],
      selected: [],
      placement: null,
      logs: [],
      nextId: 1,
      enemyCount: n,
      difficulty: d,
      ended: false,
      aiPower: 0,
      command: null,
      groups: {},
      orderMarkers: [],
      outposts: [
        {
          x: 2160,
          y: 2400,
          name: "West Crossing",
          owner: -1,
          claimant: -1,
          progress: 0,
        },
        {
          x: 3300,
          y: 2240,
          name: "Crown Road",
          owner: -1,
          claimant: -1,
          progress: 0,
        },
        {
          x: 4520,
          y: 2760,
          name: "East Crossing",
          owner: -1,
          claimant: -1,
          progress: 0,
        },
      ],
    };
    const locs = world.startingPositions(n + 1);
    for (let i = 0; i < n + 1; i++)
      S.factions.push(faction(i, locs[i].x, locs[i].y, d));
    terrain.configure(S.factions.length, S.factions, S.outposts);
    S.roads = S.factions.map((f) => [
      f,
      ...(terrain.findPath(f, nearest(S.outposts, f)) || []),
    ]);
    for (let i = 1; i < S.outposts.length; i++)
      S.roads.push([
        S.outposts[i - 1],
        ...(terrain.findPath(S.outposts[i - 1], S.outposts[i]) || []),
      ]);
    for (let i = 0; i < n + 1; i++) {
      let f = S.factions[i];
      addBuilding(i, "hall", f.x, f.y, true);
      let side = i % 2 ? 1 : -1;
      addBuilding(i, "farm", f.x + 118 * side, f.y - 68, true);
      addBuilding(i, "lumber", f.x + 123 * side, f.y + 68, true);
      addBuilding(i, "mine", f.x, f.y + 143, true);
      addBuilding(i, "house", f.x - 115 * side, f.y - 100, true);
      addBuilding(i, "barracks", f.x - 135 * side, f.y + 92, true);
      if (i === 0) {
        addUnit(i, "worker", f.x + 50, f.y - 116, true);
        addUnit(i, "worker", f.x + 85, f.y - 93, true);
        addUnit(i, "sword", f.x + 42, f.y + 117, true);
        addUnit(i, "archer", f.x + 10, f.y + 119, true);
      } else {
        addUnit(i, "worker", f.x + 75, f.y - 100, true);
        addUnit(i, "worker", f.x + 105, f.y - 88, true);
        addUnit(i, "sword", f.x + rand(-50, 50), f.y + 125, true);
        addUnit(i, "sword", f.x + rand(-50, 50), f.y + 125, true);
        addUnit(i, "archer", f.x + rand(-55, 55), f.y + 165, true);
      }
    }
    Object.assign(S, window.RealmfrontResourceLayout.generate({
      factions: S.factions, buildings: S.buildings, outposts: S.outposts, roads: S.roads,
    }));
    S.factions[0].resources = { gold: 410, food: 340, wood: 390 };
    keys = {};
    mouse.down = false;
    fullMapView = false;
    touchMode = "pan";
    touchPlacement = null;
    document.body?.classList.remove("actions-open", "panel-open", "map-open", "rail-info", "rail-build", "rail-roster");
    touches.clear();
    pinch = null;
    suppressTouch = false;
    lastSelectionClick = null;
    uiTick = lastMinimap = 0;
    camera.z = window.RealmfrontMobile?.touch
      ? Math.min(0.7, Math.max(0.35, viewport.h / 380))
      : 0.9;
    centerOn(
      S.factions[0].x + (window.RealmfrontMobile?.touch ? 80 : 180),
      S.factions[0].y + (window.RealmfrontMobile?.touch ? 30 : 80),
    );
    document.getElementById("startOverlay").classList.add("hidden");
    document.getElementById("endOverlay").classList.add("hidden");
    document.getElementById("pause").textContent = "Pause";
    document.getElementById("speed").textContent = "1× Speed";
    S.speed = 1;
    refreshActions();
    refreshDetails();
    log("Skirmish started. Rival kingdoms are expanding.");
    updateUI();
    drawMini();
    last = performance.now();
  }

  // Camera positioning and canvas sizing
  function centerOn(x, y) {
    camera.x = x - viewport.w / (2 * camera.z);
    camera.y = y - viewport.h / (2 * camera.z);
    fixCamera();
  }
  function focusBase() {
    if (!S) return;
    fullMapView = false;
    camera.z = window.RealmfrontMobile?.touch
      ? Math.min(0.7, Math.max(0.35, viewport.h / 380))
      : Math.max(camera.z, 0.9);
    centerOn(S.factions[0].x, S.factions[0].y);
    updateMapButton();
  }
  function fitMap() {
    if (!S) return;
    fullMapView = true;
    camera.z = world.fitZoom(viewport);
    centerOn(W / 2, H / 2);
    updateMapButton();
    drawMini();
  }
  function updateMapButton() {
    const button = document.getElementById("fitMap"), mobile = window.RealmfrontMobile?.touch;
    const label = fullMapView ? `Base${mobile ? "" : " [H]"}` : `Full Map${mobile ? "" : " [M]"}`;
    if (button.textContent !== label) button.textContent = label;
    button.title = fullMapView ? "Return to your base [H]" : "View the full island and sea border [M]";
    button.setAttribute("aria-label", fullMapView ? "Return to base" : "View full map");
  }
  function resize() {
    const center = {
      x: camera.x + viewport.w / (2 * camera.z),
      y: camera.y + viewport.h / (2 * camera.z),
    };
    const fitted = Math.abs(camera.z - world.fitZoom(viewport)) < 0.00001;
    const b = C.getBoundingClientRect(),
      dpr = Math.min(2, devicePixelRatio || 1);
    viewport.w = b.width;
    viewport.h = b.height;
    C.width = Math.round(b.width * dpr);
    C.height = Math.round(b.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    camera.z = fitted
      ? world.fitZoom(viewport)
      : Math.max(world.fitZoom(viewport), camera.z);
    centerOn(center.x, center.y);
    updateMapButton();
  }

  // Selection panels and action buttons
  const costText = (c) =>
    Object.entries(c)
      .filter((x) => x[1] > 0)
      .map(
        ([k, v]) => `${v} ${k === "gold" ? "🪙" : k === "food" ? "🌾" : "🪵"}`,
      )
      .join(" · ") || "Free";
  function refreshActions() {
    if (!S) return;
    if (S.catalogPreview?.selection !== S.selected.map((o) => o.id).join(",")) S.catalogPreview = null;
    let sel = S.selected.filter((o) => o.hp > 0),
      one = sel.length === 1 ? sel[0] : null,
      building =
        !S.placement && one && one.size !== undefined && one.f === 0
          ? one
          : null,
      options = [];
    let title = "Construction & Recruitment";
    if (building && unitByBuilding[building.type]) {
      title = `${defs[building.type].name} · Training`;
      for (let type of unitByBuilding[building.type])
        options.push({
          name: udefs[type].name,
          catalog: { kind: "unit", type, source: building.id },
          description: costText(trainingCost(building, type)),
          brief: building.workers.length && type !== "worker" ? "Retrain worker" : briefs.unit[type],
          details: udefs[type].desc,
          disabled: !!trainingBlockReason(building, type),
        });
    } else if (
      building &&
      (building.type === "tower" || building.type === "fortress")
    ) {
      title = "Defensive Building";
      options.push({
        name: "Upgrade Defense",
        catalog: { kind: "upgrade", type: building.type, source: building.id },
        brief: "Improve defenses",
        details: "Improves this building's health, attack, range, and firing speed.",
        description: costText({
          gold: 100 * building.level,
          wood: 80 * building.level,
        }),
        run: () => upgradeTower(building),
        disabled:
          building.level >= 3 ||
          !canPay(S.factions[0], {
            gold: 100 * building.level,
            wood: 80 * building.level,
          }),
      });
    } else {
      let types = [
        "farm",
        "lumber",
        "mine",
        "house",
        "barracks",
        "range",
        "stable",
        "workshop",
        "tower",
        "fortress",
      ];
      for (let type of types)
        options.push({
          name: defs[type].name,
          catalog: { kind: "building", type },
          brief: briefs.building[type],
          description: costText(defs[type].cost),
          details: defs[type].desc,
          run: () => {
            if (!canCommand()) return;
            S.command = null;
            S.placement = type;
            touchPlacement = null;
            if (window.RealmfrontMobile?.touch) {
              document.body.classList.remove("actions-open", "panel-open", "map-open");
              document.body.classList.remove("rail-build", "rail-roster");
              setTouchMode("pan");
            }
            refreshDetails();
            refreshActions();
            message(`Place ${defs[type].name} on open ground`);
          },
          disabled: !canPay(S.factions[0], defs[type].cost),
          chosen: S.placement === type,
        });
    }
    if (building?.type === "hall") {
      const f = S.factions[0];
      for (const [key, def] of Object.entries(research)) {
        const level = f.tech[key];
        const cost = researchCost(key, level);
        options.push({
          name: `${def.name} ${level}/3`,
          catalog: { kind: "research", type: key, source: building.id },
          brief: briefs.research[key],
          details: def.desc,
          description:
            f.research?.key === key
              ? `Researching ${Math.floor((f.research.progress / def.time) * 100)}%`
              : costText(cost),
          run: () => startResearch(0, key),
          disabled: level >= 3 || !!f.research || !canPay(f, cost),
        });
      }
    }
    document.getElementById("actionTitle").textContent = title;
    if (!S.placement && !S.selected.length && !S.catalogPreview && !S.catalogDismissed)
      S.catalogPreview = { kind: "building", type: "farm", selection: "" };
    let box = document.getElementById("actions");
    const context = building ? String(building.id) : "construction";
    if (box._actionContext !== context || box._actionRows?.length !== options.length) {
      box.innerHTML = "";
      box._actionContext = context;
      box._actionRows = options.map(() => {
        const btn = document.createElement("button"), strong = document.createElement("strong"),
          small = document.createElement("span"), description = document.createElement("span"), icon = document.createElement("canvas");
        icon.width = icon.height = 64;
        icon.className = "action-icon";
        icon.setAttribute("aria-hidden", "true");
        description.className = "action-description";
        btn.append(strong, small, description, icon);
        box.appendChild(btn);
        return { btn, strong, small, description, icon };
      });
      box.scrollLeft = 0;
    }
    options.forEach((o, index) => {
      const { btn, strong, small, description, icon } = box._actionRows[index];
      const previewed = o.catalog && S.catalogPreview?.kind === o.catalog.kind && S.catalogPreview?.type === o.catalog.type;
      const unit = o.catalog?.kind === "unit", unavailable = o.disabled || !canCommand();
      btn.className = "action" + (o.chosen || previewed ? " selected" : "") + (unit && unavailable ? " locked" : "");
      btn.disabled = unit ? false : unavailable;
      btn.title = [o.name, o.details, o.description].filter(Boolean).join(" - ");
      btn.setAttribute("aria-label", o.name);
      if (strong.textContent !== o.name) strong.textContent = o.name;
      if (small.textContent !== o.description) small.textContent = o.description;
      if (description.textContent !== (o.brief || "")) description.textContent = o.brief || "";
      description.hidden = !o.brief;
      paintCatalogIcon(icon, o.catalog);
      btn.onpointerenter = (event) => { if (!unit && (event.pointerType !== "touch" || btn.disabled)) previewCatalog(o.catalog); };
      btn.onfocus = () => { if (!window.RealmfrontMobile?.touch) previewCatalog(o.catalog); };
      btn.onclick = () => {
        previewCatalog(o.catalog);
        if (!unit) o.run();
        refreshDetails();
      };
    });
  }
  function previewCatalog(item) {
    if (!item || S.placement) return;
    S.catalogPreview = { ...item, selection: S.selected.map((o) => o.id).join(",") };
    S.catalogDismissed = false;
    refreshActions();
    refreshDetails();
  }
  function paintCatalogIcon(canvas, item) {
    if (!item) return;
    if (["building", "upgrade"].includes(item.kind) && window.RealmfrontBuildings) {
      window.RealmfrontBuildings.paintIcon(canvas, item.type); return;
    }
    const c = canvas.getContext("2d");
    c.clearRect(0, 0, 64, 64);
    c.fillStyle = "#172923"; c.fillRect(0, 0, 64, 64);
    if (item.kind === "unit" && window.RealmfrontSprites?.draw(c, { type: item.type, f: 0, x: 32, y: 43, facing: 1, anim: 0, actionTime: 0, movedAt: -1 }, 0, colors[0])) return;
    if (item.kind === "unit" && item.type === "catapult") {
      c.strokeStyle = "#d2b57f"; c.lineWidth = 5; c.beginPath();
      c.moveTo(17, 42); c.lineTo(30, 20); c.lineTo(45, 42); c.moveTo(28, 38); c.lineTo(46, 12); c.stroke();
      c.fillStyle = "#a18254"; c.fillRect(12, 40, 42, 8);
      c.fillStyle = "#c9d6cb";
      for (const x of [20, 46]) { c.beginPath(); c.arc(x, 51, 6, 0, Math.PI * 2); c.fill(); }
      return;
    }
    c.fillStyle = "#efd08c"; c.font = "bold 27px Georgia"; c.textAlign = "center";
    c.fillText(item.kind === "research" ? "+" : (udefs[item.type]?.name || "?")[0], 32, 42);
  }
  function catalogDetails(item, placing = false) {
    const b = S.buildings.find((b) => b.id === item.source && b.hp > 0);
    const unit = item.kind === "unit", tech = item.kind === "research", d = unit ? udefs[item.type] : tech ? research[item.type] : defs[item.type];
    if (!d) return "";
    const cost = unit && b ? trainingCost(b, item.type) : tech ? researchCost(item.type, S.factions[0].tech[item.type]) : item.kind === "upgrade" && b ? upgradeCost(b) : d.cost;
    const stats = unit ? [["Health", d.hp], ["Damage", d.damage], ["Range", d.range], ["Cooldown", `${d.cool}s`], ["Speed", `${d.speed}/s`], ["Armor", `${Math.round((d.armor || 0) * 100)}%`], ["Training", `${d.time}s`], ["Pop", b?.workers.length && item.type !== "worker" ? "Reuse" : "+1"]]
      : tech ? [["Level", `${S.factions[0].tech[item.type]}/3`], ["Time", `${d.time}s`]]
      : [["Health", d.hp],
        ...(d.rate ? [["Income", Object.values(d.rate).map((rate) => `${rate}/s`).join(", ")]] : []),
        ...(d.cap ? [["Capacity", `+${d.cap}`]] : []),
        ...(d.workerSlots ? [["Workers", d.workerSlots]] : [])];
    const blocked = unit ? trainingBlockReason(b, item.type) : "";
    const trainButton = unit ? `<button id="catalogTrain" class="catalog-train" type="button" aria-label="Train ${d.name}"${blocked ? " disabled" : ""}>Train</button>` : "";
    return `<div class="catalog-detail"><div class="catalog-heading"><canvas width="64" height="64" class="catalog-portrait" aria-hidden="true"></canvas><h3>${placing ? "Build " : item.kind === "upgrade" ? "Upgrade " : ""}${d.name}</h3>${trainButton}</div><p class="info catalog-description">${d.desc}</p><div class="catalog-cost">${costText(cost)}</div><dl class="catalog-stats">${stats.map(([label, value]) => `<div><dt>${label}:</dt><dd>${value}</dd></div>`).join("")}</dl>${blocked ? `<p class="hint">${blocked}</p>` : ""}${placing ? '<p class="hint">Tap land to preview, then Build here to confirm.</p>' : b ? `<p class="hint">${defs[b.type].name} · Queue ${b.train.length}/5${unit && b.workers.length && item.type !== "worker" ? " · Retrains a waiting worker" : ""}</p><button id="catalogBuildingInfo" class="small" type="button">Building info &amp; commands</button>` : '<p class="hint">Choose a card to start placing a building.</p>'}</div>`;
  }
  // Keep live panel nodes (and an in-progress tap/scroll) through HUD updates.
  function setDetails(box, html) {
    if (box._detailsHTML === html) return;
    box._detailsHTML = html;
    if (!box.childNodes) { box.innerHTML = html; return; }
    const template = document.createElement("template");
    template.innerHTML = html;
    function sync(parent, incoming) {
      const old = [...parent.childNodes], next = [...incoming.childNodes];
      next.forEach((node, index) => {
        const current = old[index];
        if (!current) { parent.appendChild(node.cloneNode(true)); return; }
        if (current.nodeType !== node.nodeType || current.nodeName !== node.nodeName) {
          current.replaceWith(node.cloneNode(true)); return;
        }
        if (node.nodeType === 3) { if (current.nodeValue !== node.nodeValue) current.nodeValue = node.nodeValue; return; }
        if (node.nodeType !== 1) return;
        const keepCommands = current.id === "detailCommands" && node.id === "detailCommands";
        if (current.id !== node.id && (current.id === "detailCommands" || node.id === "detailCommands")) delete current._commandRows;
        for (const attr of [...current.attributes]) if (!node.hasAttribute(attr.name)) current.removeAttribute(attr.name);
        for (const attr of [...node.attributes]) if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
        if (!keepCommands) sync(current, node);
      });
      old.slice(next.length).forEach((node) => node.remove());
    }
    sync(box, template.content);
  }
  function refreshDetails() {
    if (!S) return;
    const arr = S.selected.filter((o) => o.hp > 0),
      box = document.getElementById("details");
    if (S.catalogPreview?.selection !== S.selected.map((o) => o.id).join(",")) S.catalogPreview = null;
    if (window.RealmfrontMobile?.touch) updateTouchUI();
    const item = S.placement ? { kind: "building", type: S.placement } : S.catalogPreview;
    document.getElementById("selectionHeading").textContent = item ? item.kind === "unit" ? "Unit details" : item.kind === "research" ? "Research details" : "Building details" : "Selection";
    if (item) {
      setDetails(box, catalogDetails(item, !!S.placement));
      const portrait = box.querySelector?.(".catalog-portrait");
      if (portrait) paintCatalogIcon(portrait, item);
      const trainButton = document.getElementById("catalogTrain");
      if (trainButton && item.kind === "unit") trainButton.onclick = () => {
        const building = S.buildings.find((b) => b.id === item.source);
        train(building, item.type);
      };
      const inspect = document.getElementById("catalogBuildingInfo");
      if (inspect) inspect.onclick = () => {
        S.catalogPreview = null; S.catalogDismissed = true;
        refreshDetails();
      };
      return;
    }
    if (!arr.length) {
      setDetails(box, '<div class="muted">Tap/click one unit to select it. Double a fighter for all fighters; triple to include workers. Double a worker for all workers.</div>');
      return;
    }
    const groups = new Map();
    for (const o of arr) {
      const key = (o.size === undefined ? "unit:" : "building:") + o.type;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(o);
    }
    let html = arr.length > 1 ? `<h3>${arr.length} Selected</h3>` : "";
    for (const items of groups.values()) {
      const o = items[0],
        isB = o.size !== undefined,
        d = isB ? defs[o.type] : udefs[o.type];
      if (isB) html += '<div class="catalog-detail building-detail">';
      html += '<div class="selection-title">';
      if (isB)
        html += `<canvas width="64" height="64" class="selection-building-icon" data-building-icon="${o.type}" role="img" aria-label="${d.name} icon"></canvas>`;
      html += `<h3>${items.length > 1 ? items.length + " x " : ""}${d.name}</h3></div><p class="info selection-description">${d.desc}</p>`;
      if (items.length === 1) {
        html += `<div class="info">Level ${o.level || 1}/3 · Health ${Math.ceil(o.hp)} / ${o.maxHp}<div class="bar"><span style="width:${clamp((o.hp / o.maxHp) * 100, 0, 100)}%"></span></div>`;
        if (isB) {
          if (d.cap) html += `<br>Population capacity: +${capacity(o)}`;
          if (d.rate)
            html += `<br>Income: ${Object.entries(d.rate)
              .map(
                ([k, v]) =>
                  buildingIncome(o, k).toFixed(2) +
                  " " +
                  k +
                  "/s",
              )
              .join(", ")}`;
          if (workerSlots(o)) html += `<br>Workers inside: ${occupiedSlots(o)}/${workerSlots(o)}${d.rate ? " · One worker adds 1/s before bonuses." : " · Select a unit card to retrain a waiting worker."}`;
          if (o.train.length)
            html += `<br>Training (${o.train.length}/5): ${o.train.map((v, i) => udefs[v].name + (queueWorker(o, i) ? " (worker)" : "")).join(", ")}`;
        } else
          html += `<br>Damage ${Math.round(combatDamage(o, {}))} · Range ${d.range}<br>Speed ${Math.round(unitSpeed(o))} · Armor ${Math.round(unitArmor(o) * 100)}%`;
        if (o.type === "worker") {
          const task =
            o.job?.kind === "repair"
              ? "Repairing building"
              : o.job?.kind === "enter"
                ? `Entering ${defs[o.job.target.type].name}`
              : o.job?.kind === "gather"
                ? o.job.target.type === "tree"
                  ? "Chopping lumber"
                  : "Mining gold"
                : "Idle";
          html += `<br>Task: ${o.job && o.actionTime <= 0 ? "Moving to work - " : ""}${task}`;
        }
        html += "</div>";
      } else {
        const levels = [1, 2, 3]
          .map((level) => {
            const count = items.filter(
              (item) => (item.level || 1) === level,
            ).length;
            return count ? `${count} at level ${level}` : "";
          })
          .filter(Boolean);
        html += `<div class="info">${levels.join(" · ")}</div>`;
      }
      if (isB) html += '</div>';
    }
    const owned = arr.filter((o) => o.f === 0),
      upgradable = owned.filter((o) => (o.level || 1) < 3),
      sellable = owned.filter((o) => o.type !== "hall");
    if (owned.length) {
      html += '<div class="divider"></div>';
      html += `<div class="info">Upgrade: ${upgradable.length ? costText(totalCosts(upgradable.map(upgradeCost))) : "Maximum level reached"}</div>`;
      html +=
        '<div class="hint">' +
        (owned.some((o) => o.size === undefined)
          ? "Units gain health and damage; workers also gather faster. "
          : "") +
        (owned.some((o) => o.size !== undefined)
          ? "Buildings gain health, income, training speed, population capacity or defense power. "
          : "") +
        "Upgrades affect affordable eligible selections.</div>";
      if (sellable.length)
        html += `<div class="info">Sell ${sellable.length}: ${costText(totalCosts(sellable.map(sellValue)))}</div><div class="hint">50% of purchase and upgrade costs returned. Queued recruits are fully refunded. Town Halls cannot be sold.</div>`;
      html += '<div id="detailCommands" class="sidebuttons"></div>';
    }
    setDetails(box, html);
    window.RealmfrontBuildings?.paintIcons(box);
    if (!owned.length) return;
    const commands = document.getElementById("detailCommands");
    const rows = commands._commandRows || (commands._commandRows = []);
    let commandIndex = 0;
    const make = (text, fn, disabled = false) => {
      const b = rows[commandIndex] || document.createElement("button");
      if (!rows[commandIndex]) { rows.push(b); commands.append(b); }
      commandIndex++;
      b.className = "small";
      b.textContent = text;
      b.disabled = disabled || !canCommand();
      b.onclick = fn;
    };
    make(
      window.RealmfrontMobile?.touch ? "Upgrade" : "Upgrade [U]",
      upgradeSelected,
      !upgradable.some((o) => canPay(S.factions[0], upgradeCost(o))),
    );
    make(window.RealmfrontMobile?.touch ? "Sell…" : "Sell [L]", () => {
      if (!window.RealmfrontMobile?.touch) { sellSelected(); return; }
      const selection = [...S.selected];
      window.RealmfrontMobile.confirmSale(`Sell ${sellable.length} selected item${sellable.length === 1 ? "" : "s"}? Refund: ${costText(totalCosts(sellable.map(sellValue)))}. Queued recruits are refunded too.`, () => {
        S.selected = selection;
        sellSelected();
      });
    }, !sellable.length);
    const buildings = owned.filter(
      (o) => o.size !== undefined && unitByBuilding[o.type],
    );
    if (buildings.length) {
      make("Set Rally Point", () => {
        if (!canCommand()) return;
        S.command = "rally";
        updateUI();
        message(`${window.RealmfrontMobile?.touch ? "Tap" : "Click"} ground to set selected building rally points`);
      });
      if (buildings.some((b) => b.rally))
        make("Clear Rally", () => {
          if (!canCommand()) return;
          for (const b of buildings) b.rally = null;
          refreshDetails();
        });
      if (buildings.some((b) => b.train.length))
        make("Cancel Last Recruit", () => {
          for (const b of buildings) cancelTraining(b);
        });
    }
    if (owned.some((o) => o.size === undefined)) {
      if (owned.some((o) => o.type === "worker")) make("Enter building", () => {
        if (!canCommand()) return;
        S.command = "enter";
        S.placement = null;
        if (window.RealmfrontMobile?.touch) document.body.classList.remove("panel-open", "map-open", "actions-open", "rail-info", "rail-build", "rail-roster");
        updateUI();
        message("Choose a friendly resource or military training building");
      });
      make(window.RealmfrontMobile?.touch ? "Attack-move" : "Attack-move [A]", armAttackMove);
      make(window.RealmfrontMobile?.touch ? "Stop" : "Stop [S]", stopSelected);
    }
    const staffed = owned.filter((o) => o.size !== undefined && o.workers.length);
    if (staffed.length) make("Release workers", () => {
      if (!canCommand()) return;
      for (const b of staffed) for (const worker of [...b.workers]) releaseWorker(b, worker);
      updateUI();
    });
    while (rows.length > commandIndex) rows.pop().remove?.();
  }

  // Recruitment, upgrades, and construction
  const workerSlots = (b) => defs[b?.type]?.workerSlots || 0;
  const queueWorker = (b, index) => b.queueInfo[index]?.worker;
  function occupiedSlots(b) {
    return b.workers.length + b.queueInfo.filter((entry) => entry?.worker).length;
  }
  function canEnter(u, b) {
    return u.type === "worker" && u.hp > 0 && b?.hp > 0 && b.f === u.f && workerSlots(b) > 0 &&
      workerSlots(b) > occupiedSlots(b) + S.units.filter((other) =>
        other !== u && other.hp > 0 && other.job?.kind === "enter" && other.job.target === b).length;
  }
  function orderEnter(u, b) {
    if (!canEnter(u, b)) return false;
    u.job = { kind: "enter", target: b };
    u.target = u.move = null;
    u.route = null;
    u.attackMove = false;
    u.hold = false;
    return true;
  }
  function enterBuilding(u, b) {
    if (!canEnter(u, b) || !S.units.includes(u) || dist(u, b) > b.size * 0.6 + 13) return false;
    const wasSelected = S.selected.includes(u);
    u.job = u.target = u.move = u.route = null;
    u.hold = true;
    u.actionTime = 0;
    b.workers.push(u);
    S.units = S.units.filter((other) => other !== u);
    S.selected = S.selected.filter((other) => other !== u);
    if (wasSelected && !S.selected.length && b.f === 0) {
      S.selected = [b];
      if (window.RealmfrontMobile?.touch && unitByBuilding[b.type]) document.body.classList.add("actions-open");
    }
    for (const other of S.units) if (other.target === u) other.target = null;
    for (const shot of S.shots) if (shot.to === u) shot.life = -1;
    if (b.f === 0) {
      message(`Worker entered ${defs[b.type].name}`);
      refreshDetails();
      refreshActions();
    }
    return true;
  }
  function releaseWorker(b, worker) {
    b.workers = b.workers.filter((u) => u !== worker);
    let exit;
    for (let i = 0; i < 20; i++) {
      const angle = (worker.id + i) * 2.3999, radius = b.size * 0.65 + 35;
      exit = terrain.nearestWalkable(b.x + Math.cos(angle) * radius, b.y + Math.sin(angle) * radius);
      if (S.units.every((u) => u.hp <= 0 || dist(u, exit) > 26)) break;
    }
    Object.assign(worker, exit);
    worker.job = worker.target = worker.move = worker.route = null;
    worker.hold = true;
    worker.actionTime = 0;
    if (worker.hp > 0 && !S.units.includes(worker)) S.units.push(worker);
  }
  function evacuateWorkers(b) {
    for (const worker of [...b.workers, ...b.queueInfo.map((entry) => entry?.worker).filter(Boolean)]) releaseWorker(b, worker);
    b.workers = [];
    b.queueInfo = [];
    b.train = [];
    b.progress = 0;
  }
  function buildingIncome(b, resource) {
    const base = defs[b.type].rate?.[resource] || 0;
    const bonus = b.workers.reduce((sum, u) => sum + 1 + ((u.level || 1) - 1) * 0.2, 0);
    return base + (base ? bonus * buildingMultiplier(b) * (1 + S.factions[b.f].tech.economy * 0.25) *
      (b.f === 0 ? 1 : S.difficulty) : 0);
  }
  function trainingCost(b, type) {
    if (!b.workers.length || type === "worker") return { ...udefs[type].cost };
    return Object.fromEntries(Object.entries(udefs[type].cost).map(([key, value]) =>
      [key, Math.max(0, value - (udefs.worker.cost[key] || 0))]));
  }
  function enqueue(b, type, worker = null, cost = udefs[type].cost) {
    while (b.queueInfo.length < b.train.length) b.queueInfo.push(null);
    b.train.push(type);
    b.queueInfo.push(worker ? { worker, cost: { ...cost } } : null);
  }
  function pendingPop(id) {
    return S.buildings
      .filter((b) => b.hp > 0 && b.f === id)
      .reduce((sum, b) => sum + b.train.filter((type, index) => !queueWorker(b, index)).length, 0);
  }
  function trainingBlockReason(b, type) {
    if (!b || b.hp <= 0 || b.f !== 0 || !unitByBuilding[b.type]?.includes(type))
      return "Select a friendly training building.";
    if (!canCommand()) return S?.paused ? "Resume the game to train." : "Training is unavailable.";
    if (b.train.length >= 5) return "Training queue is full (5 units).";
    if (!(b.workers.length && type !== "worker") && S.factions[0].pop + pendingPop(0) >= Math.min(100, S.factions[0].cap))
      return "Population limit reached. Build Houses.";
    if (!canPay(S.factions[0], trainingCost(b, type))) return "Not enough resources.";
    return "";
  }
  function train(b, type) {
    const blocked = trainingBlockReason(b, type);
    if (blocked) { message(blocked); return; }
    const f = S.factions[0], worker = type !== "worker" ? b.workers[0] : null;
    const cost = trainingCost(b, type);
    if (!pay(f, cost)) {
      message("Not enough resources");
      return;
    }
    if (worker) b.workers.shift();
    enqueue(b, type, worker, cost);
    message(`${worker ? "Worker retraining as" : "Queued"} ${udefs[type].name}`);
    refreshActions();
    refreshDetails();
  }
  function totalCosts(costs) {
    const result = {};
    for (const cost of costs)
      for (const [key, value] of Object.entries(cost))
        result[key] = (result[key] || 0) + value;
    return result;
  }
  function capacity(b) {
    const base = defs[b.type]?.cap || 0;
    return base ? base + Math.ceil(base / 2) * ((b.level || 1) - 1) : 0;
  }
  function buildingMultiplier(b) {
    return 1 + ((b.level || 1) - 1) * 0.25;
  }
  function unitSpeed(u) {
    return udefs[u.type].speed * (1 + ((u.level || 1) - 1) * 0.05);
  }
  function unitArmor(u) {
    return Math.min(
      0.65,
      (udefs[u.type]?.armor || 0) + S.factions[u.f].tech.armor * 0.1,
    );
  }
  function upgradeCost(o) {
    const level = o.level || 1;
    if (o.type === "tower" || o.type === "fortress")
      return { gold: 100 * level, wood: 80 * level };
    if (o.type === "hall") return { gold: 200 * level, wood: 200 * level };
    const cost = (o.size === undefined ? udefs[o.type] : defs[o.type]).cost;
    return Object.fromEntries(
      Object.entries(cost)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => [k, Math.ceil(v * 0.6 * level)]),
    );
  }
  function upgradeEntity(o) {
    if (!canCommand() || o.f !== 0 || o.hp <= 0 || (o.level || 1) >= 3)
      return false;
    const cost = upgradeCost(o);
    if (!pay(S.factions[0], cost)) return false;
    const oldCap = o.size === undefined ? 0 : capacity(o);
    o.level = (o.level || 1) + 1;
    const oldMax = o.maxHp,
      d = o.size === undefined ? udefs[o.type] : defs[o.type];
    o.maxHp =
      o.type === "tower" || o.type === "fortress"
        ? d.hp + (o.level - 1) * 250
        : Math.round(d.hp * (1 + (o.level - 1) * 0.25));
    o.hp += o.maxHp - oldMax;
    o.invested = totalCosts([o.invested || d.cost, cost]);
    if (o.size !== undefined) S.factions[0].cap += capacity(o) - oldCap;
    return true;
  }
  function upgradeSelected() {
    if (!canCommand()) return;
    let count = 0;
    for (const o of S.selected) if (upgradeEntity(o)) count++;
    message(
      count
        ? `${count} selected upgraded`
        : "No affordable upgrades or maximum level reached",
    );
    refreshActions();
    refreshDetails();
  }
  function upgradeTower(b) {
    if (upgradeEntity(b)) {
      message("Defense upgraded");
      refreshActions();
      refreshDetails();
    }
  }
  function sellValue(o) {
    return Object.fromEntries(
      Object.entries(
        o.invested ||
          (o.size === undefined ? udefs[o.type] : defs[o.type]).cost,
      ).map(([k, v]) => [k, Math.floor(v * 0.5)]),
    );
  }
  function sellSelected() {
    if (!canCommand()) return;
    const sold = S.selected.filter(
      (o) => o.f === 0 && o.hp > 0 && o.type !== "hall",
    );
    const ids = new Set(sold.map((o) => o.id));
    for (const o of sold) {
      const f = S.factions[0];
      for (const [k, v] of Object.entries(sellValue(o))) f.resources[k] += v;
      if (o.size !== undefined) {
        f.cap -= capacity(o);
        for (const [index, type] of o.train.entries())
          for (const [k, v] of Object.entries(o.queueInfo[index]?.cost || udefs[type].cost))
            f.resources[k] += v;
        evacuateWorkers(o);
      } else f.pop = Math.max(0, f.pop - 1);
      o.hp = 0;
    }
    for (const u of S.units) {
      if (ids.has(u.target?.id)) u.target = null;
      if (u.job?.kind === "repair" && ids.has(u.job.target.id)) u.job = null;
    }
    S.units = S.units.filter((o) => o.hp > 0);
    S.buildings = S.buildings.filter((o) => o.hp > 0);
    S.selected = S.selected.filter((o) => !ids.has(o.id));
    message(
      sold.length
        ? `${sold.length} selected sold`
        : "Select owned units or buildings; Town Halls cannot be sold",
    );
    updateUI();
  }
  function selectSameType(o, add = false) {
    if (!S || !o) return;
    const pool = o.size === undefined ? S.units : S.buildings;
    const matches = pool.filter(
      (v) => v.hp > 0 && v.f === o.f && v.type === o.type,
    );
    S.selected = add ? [...new Set([...S.selected, ...matches])] : matches;
    S.placement = null;
    S.command = null;
    refreshActions();
    refreshDetails();
  }
  function selectClicked(o) {
    S.catalogPreview = null;
    S.catalogDismissed = false;
    if (window.RealmfrontMobile?.touch) document.body.classList.remove("rail-info", "rail-build", "rail-roster", "map-open");
    if (!o) { S.selected = []; lastSelectionClick = null; refreshActions(); refreshDetails(); return; }
    const now = performance.now();
    const count = lastSelectionClick?.id === o.id && now - lastSelectionClick.time < 500
      ? Math.min(3, lastSelectionClick.count + 1) : 1;
    lastSelectionClick = { id: o.id, time: now, count };
    if (count === 1) S.selected = [o];
    else if (o.size !== undefined) { selectSameType(o); return; }
    else S.selected = S.units.filter((u) => u.hp > 0 && u.f === o.f &&
      (o.type === "worker" ? u.type === "worker" : count >= 3 || u.type !== "worker"));
    refreshActions();
    refreshDetails();
  }
  function placeBuilding(x, y, repeat = false) {
    if (!canCommand() || !S.placement) return null;
    const type = S.placement,
      px = Math.round(x / 12) * 12,
      py = Math.round(y / 12) * 12;
    if (!validPlace(type, px, py) || !canPay(S.factions[0], defs[type].cost)) {
      message("Cannot build here or insufficient resources");
      return null;
    }
    const b = addBuilding(0, type, px, py);
    if (!b) return null;
    S.selected = [b];
    if (!repeat) {
      S.placement = null;
      if (window.RealmfrontMobile?.touch) document.body.classList.remove("rail-info", "rail-build", "rail-roster");
    }
    message(
      `${defs[type].name} constructed${repeat ? window.RealmfrontMobile?.touch ? " - aim and confirm another" : " - click again to keep building" : ""}`,
    );
    refreshActions();
    refreshDetails();
    return b;
  }
  function validPlace(type, x, y, owner = 0) {
    let d = defs[type],
      f = S.factions[owner];
    return (
      x > d.size &&
      y > d.size &&
      x < W - d.size &&
      y < H - d.size &&
      !occupied(x, y, d.size) &&
      terrain.isWalkable(x, y, d.size * 0.72 + 8) &&
      S.outposts.every((p) => dist(p, { x, y }) > d.size / 2 + 110) &&
      S.nodes.every(
        (n) =>
          n.amount <= 0 ||
          Math.hypot(n.x - x, n.y - y) > n.r + d.size * 0.6 + 10,
      ) &&
      S.buildings
        .filter((b) => b.hp > 0 && b.f !== owner)
        .every(
          (b) =>
            Math.hypot(b.x - x, b.y - y) > d.size * 0.6 + b.size * 0.6 + 40,
        ) &&
      Math.hypot(x - f.x, y - f.y) < 850
    );
  }

  // Targeting, movement, and combat
  function nearest(list, p, max = Infinity) {
    let best = null,
      ds = max;
    for (let o of list) {
      let d = dist(p, o);
      if (d < ds) {
        ds = d;
        best = o;
      }
    }
    return best;
  }
  function targetPoint(o) {
    return { x: o.x, y: o.y };
  }
  function seekTarget(u) {
    if (u.hold && u.move) return;
    let d = udefs[u.type];
    if (d.kind === "healer") {
      let allies = S.units.filter(
        (v) => v.f === u.f && v.hp > 0 && v.hp < v.maxHp * 0.96 && v !== u,
      );
      u.target = nearest(allies, u, 350);
      return;
    }
    let enemies = S.units.filter((v) => v.f !== u.f && v.hp > 0),
      buildings = S.buildings.filter((v) => v.f !== u.f && v.hp > 0);
    let t = nearest(enemies, u, u.f === 0 ? 205 : 260);
    if (!t) t = nearest(buildings, u, u.f === 0 ? 150 : 210);
    u.target = t;
    if (!t && !u.move && !u.hold && u.f !== 0) {
      let f = S.factions[u.f];
      if (Math.hypot(u.x - f.x, u.y - f.y) > 560)
        u.move = { x: f.x + rand(-150, 150), y: f.y + rand(-150, 150) };
    }
  }
  function moveToward(u, x, y, dt, desired) {
    const radius = Math.max(udefs[u.type].radius + 4, terrain.clearance),
      goal = terrain.nearestWalkable(x, y);
    if (!goal) return false;
    const distance = Math.hypot(goal.x - u.x, goal.y - u.y),
      direct = terrain.clearLine(u, goal, radius);
    if (distance <= desired + 1 && direct) {
      u.route = null;
      return true;
    }
    let waypoint = goal;
    if (!direct) {
      if (
        !u.route ||
        Math.hypot(u.route.goal.x - goal.x, u.route.goal.y - goal.y) > 60 ||
        u.route.index >= u.route.points.length ||
        !terrain.clearLine(u, u.route.points[u.route.index], radius)
      ) {
        const points = terrain.findPath(u, goal);
        if (!points) return false;
        u.route = { goal, points, index: 0 };
      }
      while (
        u.route.index < u.route.points.length - 1 &&
        (Math.hypot(
          u.route.points[u.route.index].x - u.x,
          u.route.points[u.route.index].y - u.y,
        ) < 0.01 ||
          terrain.clearLine(u, u.route.points[u.route.index + 1], radius))
      )
        u.route.index++;
      waypoint = u.route.points[u.route.index];
    } else u.route = null;
    const dx = waypoint.x - u.x,
      dy = waypoint.y - u.y,
      ds = Math.hypot(dx, dy);
    if (ds < 0.0001) return false;
    const step = Math.min(
      ds,
      unitSpeed(u) * dt,
      direct ? Math.max(0, distance - desired) : Infinity,
    );
    const nx = clamp(u.x + (dx / ds) * step, radius, W - radius),
      ny = clamp(u.y + (dy / ds) * step, radius, H - radius);
    if (
      !Number.isFinite(nx) ||
      !Number.isFinite(ny) ||
      !terrain.isWalkable(nx, ny, radius) ||
      !terrain.clearLine(u, { x: nx, y: ny }, radius)
    )
      return false;
    u.facing = dx < 0 ? -1 : dx > 0 ? 1 : u.facing;
    u.x = nx;
    u.y = ny;
    u.anim += dt * 8;
    u.movedAt = S.time;
    return false;
  }
  function hit(t, dmg, attacker) {
    if (!t || t.hp <= 0) return;
    let resistance = t.size === undefined ? unitArmor(t) : 0;
    t.hp -= dmg * (1 - resistance);
    if (t.hp <= 0) {
      t.hp = 0;
      for (let i = 0; i < 7; i++)
        S.particles.push({
          x: t.x,
          y: t.y,
          vx: rand(-48, 48),
          vy: rand(-45, 45),
          life: 0.55,
          color: colors[t.f],
          r: rand(2, 5),
        });
      if (t.size !== undefined) {
        S.factions[t.f].cap -= capacity(t);
        evacuateWorkers(t);
        if (t.type === "hall") {
          log(`${t.f === 0 ? "Your" : `Kingdom ${t.f}`} Town Hall has fallen!`);
          if (t.f === 0) {
            defeat();
            return;
          }
        }
      } else S.factions[t.f].pop = Math.max(0, S.factions[t.f].pop - 1);
      if (attacker === 0) {
        let reward = t.size !== undefined ? 12 : 5;
        S.factions[0].resources.gold += reward;
      }
      S.selected = S.selected.filter((o) => o !== t);
    }
  }
  function shoot(from, to, damage, kind, f) {
    S.shots.push({
      x: from.x,
      y: from.y,
      to,
      damage,
      kind,
      f,
      speed: kind === "siege" ? 195 : kind === "healer" ? 270 : 390,
      r: kind === "siege" ? 7 : 3,
    });
  }
  function attack(u, t, dt) {
    const d = udefs[u.type];
    if (!t || t.hp <= 0) return;
    let r = d.range + (t.size || udefs[t.type]?.radius || 10) * 0.42,
      ds = dist(u, t);
    if (ds > r) {
      if (!u.hold) moveToward(u, t.x, t.y, dt, Math.max(6, r * 0.8));
      return;
    }
    if (u.attackTimer <= 0) {
      u.attackTimer = d.cool;
      u.actionDuration = d.kind === "ranged" ? 0.8 : 0.6;
      u.actionTime = u.actionDuration;
      u.facing = t.x < u.x ? -1 : 1;
      const damage = combatDamage(u, t);
      if (d.kind === "melee" || d.kind === "tank" || d.kind === "worker")
        hit(t, damage, u.f);
      else if (d.kind === "healer") {
        t.hp = Math.min(t.maxHp, t.hp + 27 * (1 + ((u.level || 1) - 1) * 0.2));
        S.particles.push({
          x: t.x,
          y: t.y - 8,
          vx: 0,
          vy: -24,
          life: 0.5,
          color: "#a6e5b1",
          r: 7,
        });
      } else shoot(u, t, damage, d.kind, u.f);
    }
  }

  // Simulation: units, buildings, projectiles, and particles
  function simulateUnits(dt) {
    for (let u of S.units) {
      if (u.hp <= 0) continue;
      u.attackTimer -= dt;
      u.actionTime = Math.max(0, u.actionTime - dt);
      u.think -= dt;
      if (u.job && simulateWorkerJob(u, dt)) continue;
      if (u.think <= 0) {
        u.think = rand(0.26, 0.5);
        if (!u.move || u.attackMove || u.f !== 0) {
          if (!u.target || u.target.hp <= 0 || dist(u, u.target) > 550)
            seekTarget(u);
        } else u.target = null;
      }
      if (
        u.target &&
        (u.target.hp <= 0 ||
          (u.type === "healer" && u.target.hp >= u.target.maxHp))
      ) {
        u.target = null;
        u.think = 0;
      }
      if (u.target && (!u.move || u.attackMove || u.f !== 0)) {
        attack(u, u.target, dt);
      } else if (u.move) {
        if (moveToward(u, u.move.x, u.move.y, dt, 8)) {
          u.move = null;
          u.attackMove = false;
        }
      } else if (u.type === "worker" && !u.hold) {
        const node = nearest(
          S.nodes.filter((n) => n.amount > 0),
          u,
          300,
        );
        if (node) {
          u.job = { kind: "gather", target: node };
          simulateWorkerJob(u, dt);
        }
      }
    }
    // soft separation keeps troops animated and prevents stacked melee formations
    for (let i = 0; i < S.units.length; i++) {
      let a = S.units[i];
      if (a.hp <= 0) continue;
      for (let j = i + 1; j < S.units.length; j++) {
        let b = S.units[j];
        if (b.hp <= 0) continue;
        let dx = b.x - a.x,
          dy = b.y - a.y,
          ds = Math.hypot(dx, dy) || 0.001,
          min = (udefs[a.type].radius + udefs[b.type].radius) * 0.84;
        if (ds < min) {
          let nx = dx / ds,
            ny = dy / ds,
            p = Math.min((min - ds) * 0.32, 3);
          const ar = Math.max(udefs[a.type].radius + 4, terrain.clearance),
            br = Math.max(udefs[b.type].radius + 4, terrain.clearance);
          const ax = clamp(a.x - nx * p, ar, W - ar),
            ay = clamp(a.y - ny * p, ar, H - ar),
            bx = clamp(b.x + nx * p, br, W - br),
            by = clamp(b.y + ny * p, br, H - br);
          if (
            terrain.isWalkable(ax, ay, ar) &&
            terrain.clearLine(a, { x: ax, y: ay }, ar)
          ) {
            a.x = ax;
            a.y = ay;
          }
          if (
            terrain.isWalkable(bx, by, br) &&
            terrain.clearLine(b, { x: bx, y: by }, br)
          ) {
            b.x = bx;
            b.y = by;
          }
        }
      }
    }
    S.units = S.units.filter((u) => u.hp > 0);
  }
  function simulateBuildings(dt) {
    for (let b of S.buildings) {
      if (b.hp <= 0) { evacuateWorkers(b); continue; }
      let f = S.factions[b.f],
        d = defs[b.type];
      if (d.rate)
        for (const k of Object.keys(d.rate)) f.resources[k] += buildingIncome(b, k) * dt;
      if (b.train.length) {
        b.progress +=
          dt *
          (b.f === 0 ? 1 : 1.08 * S.difficulty) *
          (1 + (b.level - 1) * 0.15) *
          (b.f === 0 && S.cheats.fastTraining ? 20 : 1);
        let type = b.train[0];
        const retraining = b.queueInfo[0];
        if (b.progress >= udefs[type].time && (retraining?.worker || f.pop < Math.min(100, f.cap))) {
          b.progress = 0;
          b.train.shift();
          b.queueInfo.shift();
          let a = rand(0, Math.PI * 2);
          let unit;
          if (retraining?.worker) {
            unit = retraining.worker;
            const fraction = unit.hp / unit.maxHp;
            releaseWorker(b, unit);
            unit.type = type;
            unit.maxHp = Math.round(udefs[type].hp * (1 + ((unit.level || 1) - 1) * 0.25));
            unit.hp = Math.max(1, Math.round(unit.maxHp * fraction));
            unit.hold = false;
            unit.attackTimer = 0;
            unit.think = 0;
            unit.invested = totalCosts([unit.invested, retraining.cost]);
          } else unit = addUnit(
            b.f,
            type,
            b.x + Math.cos(a) * (b.size * 0.65 + 30),
            b.y + Math.sin(a) * (b.size * 0.65 + 30),
            true,
          );
          if (b.rally) {
            unit.move = { ...b.rally };
            unit.attackMove = unit.type !== "worker";
          }
          if (b.f === 0) message(`${udefs[type].name} trained`);
        }
      }
      if (d.damage) {
        b.attackTimer -= dt;
        if (b.attackTimer <= 0) {
          let target = nearest(
            S.units.filter((u) => u.hp > 0 && u.f !== b.f),
            b,
            d.range + (b.level - 1) * 25,
          );
          if (target) {
            b.attackTimer = d.cool / (1 + 0.15 * (b.level - 1));
            shoot(
              b,
              target,
              d.damage * (1 + 0.35 * (b.level - 1)),
              b.type === "fortress" ? "siege" : "ranged",
              b.f,
            );
          }
        }
      }
    }
    S.buildings = S.buildings.filter((b) => b.hp > 0);
  }
  function simulateShots(dt) {
    for (let p of S.shots) {
      if (p.life === -1) continue;
      if (!p.to || p.to.hp <= 0) {
        p.life = -1;
        continue;
      }
      let dx = p.to.x - p.x,
        dy = p.to.y - p.y,
        ds = Math.hypot(dx, dy),
        step = p.speed * dt;
      if (ds < step + 8) {
        if (p.kind === "siege") {
          for (let v of [...S.units, ...S.buildings])
            if (v.hp > 0 && v.f !== p.f && dist(v, p.to) < 70)
              hit(v, p.damage * (v === p.to ? 1 : 0.53), p.f);
          for (let i = 0; i < 10; i++)
            S.particles.push({
              x: p.to.x,
              y: p.to.y,
              vx: rand(-65, 65),
              vy: rand(-65, 65),
              life: 0.65,
              color: "#d7b477",
              r: rand(2, 5),
            });
        } else hit(p.to, p.damage, p.f);
        p.life = -1;
      } else {
        p.x += (dx / ds) * step;
        p.y += (dy / ds) * step;
      }
    }
    S.shots = S.shots.filter((p) => p.life !== -1);
    for (let p of S.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    S.particles = S.particles.filter((p) => p.life > 0);
  }

  // Enemy AI: expansion, recruitment, and raids
  function aiBuild(f, type) {
    let d = defs[type];
    if (!canPay(f, d.cost)) return false;
    for (let i = 0; i < 26; i++) {
      let t = rand(0, Math.PI * 2),
        r = rand(140, Math.min(735, 330 + f.expansions * 60)),
        x = clamp(f.x + Math.cos(t) * r, 80, W - 80),
        y = clamp(f.y + Math.sin(t) * r, 80, H - 80);
      if (validPlace(type, x, y, f.id)) {
        addBuilding(f.id, type, x, y);
        f.expansions++;
        return true;
      }
    }
    return false;
  }
  function aiTrain(f) {
    let buildings = S.buildings.filter(
        (b) => b.f === f.id && b.hp > 0 && unitByBuilding[b.type],
      ),
      opts = [];
    const workerCount = S.units.filter((u) => u.f === f.id && u.hp > 0 && u.type === "worker").length +
      S.buildings.filter((b) => b.f === f.id && b.hp > 0).reduce((sum, b) => sum + b.workers.length + b.train.filter((type) => type === "worker").length, 0);
    const desiredWorkers = Math.min(12, S.buildings.filter((b) => b.f === f.id && b.hp > 0 && defs[b.type].rate).length + 2);
    for (let b of buildings) {
      if (b.train.length >= 3) continue;
      let pool = unitByBuilding[b.type].filter((type) =>
        canPay(f, udefs[type].cost) && (type !== "worker" || workerCount < desiredWorkers),
      );
      if (!pool.length) continue;
      let type = pool[Math.floor(Math.random() * pool.length)];
      opts.push({ b, type });
    }
    if (!opts.length || f.pop + pendingPop(f.id) >= Math.min(100, f.cap))
      return;
    let choice = opts[Math.floor(Math.random() * opts.length)];
    pay(f, udefs[choice.type].cost);
    enqueue(choice.b, choice.type);
  }
  function aiRaid(f) {
    let troops = S.units.filter(
      (u) => u.f === f.id && u.hp > 0 && u.type !== "worker",
    );
    if (troops.length < 4) return;
    let enemies = S.factions.filter(
      (e) =>
        e.id !== f.id &&
        e.alive &&
        S.buildings.some((b) => b.f === e.id && b.type === "hall" && b.hp > 0),
    );
    if (!enemies.length) return;
    let target = enemies.sort((a, b) => dist(f, a) - dist(f, b))[0];
    let defensive = S.units.filter(
      (u) => u.f === f.id && u.hp > 0 && dist(u, f) < 400,
    );
    let raiders = troops
      .filter((u) => defensive.includes(u) || u.move === null)
      .slice(0, Math.max(4, Math.floor(troops.length * 0.82)));
    let targetB = nearest(
      S.buildings.filter((b) => b.f === target.id && b.hp > 0),
      f,
    ) || { x: target.x, y: target.y };
    for (let u of raiders) {
      u.move = { x: targetB.x + rand(-70, 70), y: targetB.y + rand(-70, 70) };
      u.hold = false;
      u.target = null;
    }
    if (target.id === 0)
      log(`⚠ Kingdom ${f.id} launches a raid toward your lands!`);
  }
  function aiStep(dt) {
    for (let f of S.factions) {
      if (f.id === 0 || !f.alive) continue;
      f.aiTimer -= dt;
      f.raidTimer -= dt;
      if (f.aiTimer <= 0) {
        f.aiTimer = rand(2, 3.3) / S.difficulty;
        let counts = Object.fromEntries(
          Object.keys(defs).map((k) => [
            k,
            S.buildings.filter((b) => b.f === f.id && b.type === k && b.hp > 0)
              .length,
          ]),
        );
        if (!counts.hall) {
          f.alive = false;
          continue;
        }
        for (const b of S.buildings.filter((b) => b.f === f.id && b.hp > 0 && defs[b.type].rate)
          .sort((a, b) => ["mine", "lumber", "farm"].indexOf(a.type) - ["mine", "lumber", "farm"].indexOf(b.type))) {
          const worker = nearest(S.units.filter((u) => u.f === f.id && u.hp > 0 && u.type === "worker" && u.job?.kind !== "enter" && canEnter(u, b)), b);
          if (worker) orderEnter(worker, b);
        }
        if (f.cap < 100 && f.cap - f.pop - pendingPop(f.id) < 5)
          aiBuild(f, "house");
        else if (counts.farm < 2 + S.time / 280) aiBuild(f, "farm");
        else if (counts.lumber < 2 + S.time / 330) aiBuild(f, "lumber");
        else if (counts.mine < 2 + S.time / 360) aiBuild(f, "mine");
        else if (counts.barracks < 2 && S.time > 100) aiBuild(f, "barracks");
        else if (counts.range < 1 && S.time > 45) aiBuild(f, "range");
        else if (counts.stable < 1 && S.time > 150) aiBuild(f, "stable");
        else if (counts.workshop < 1 && S.time > 270) aiBuild(f, "workshop");
        else if (counts.tower < 2 + S.time / 230 && S.time > 55)
          aiBuild(f, "tower");
        else if (Math.random() < 0.2)
          aiBuild(
            f,
            ["house", "farm", "mine", "tower"][Math.floor(rand(0, 4))],
          );
        for (let i = 0; i < Math.ceil(S.difficulty * 2); i++) aiTrain(f);
      }
      if (f.raidTimer <= 0) {
        aiRaid(f);
        f.raidTimer = rand(53, 83) / S.difficulty;
      }
    }
  }

  // Victory, defeat, and simulation tick
  function checkEnd() {
    if (S.ended) return;
    let playerHall = S.buildings.some(
      (b) => b.f === 0 && b.hp > 0 && b.type === "hall",
    );
    if (!playerHall) {
      defeat();
      return;
    }
    let remaining = S.buildings.filter(
      (b) => b.type === "hall" && b.hp > 0 && b.f !== 0,
    );
    if (!remaining.length) {
      end(true);
    }
  }
  function defeat() {
    end(false);
  }
  function end(win) {
    if (S.ended) return;
    S.ended = true;
    S.paused = true;
    document.getElementById("endTitle").textContent = win
      ? "Victory — The Realm Is Yours"
      : "Defeat — Your Kingdom Has Fallen";
    document.getElementById("endText").textContent =
      `You survived ${Math.floor(S.time / 60)} minutes and ${Math.floor(S.time % 60)} seconds against ${S.enemyCount} rival kingdoms. ${win ? "Every rival Town Hall has been destroyed." : "Your Town Hall was destroyed. Try expanding your economy and strengthening your defenses earlier."}`;
    document.getElementById("endOverlay").classList.remove("hidden");
  }
  function tick(dt) {
    S.time += dt;
    let f = S.factions[0];
    simulateBuildings(dt);
    simulateUnits(dt);
    simulateShots(dt);
    aiStep(dt);
    simulateStrategy(dt);
    for (let fac of S.factions)
      fac.alive = S.buildings.some(
        (b) => b.f === fac.id && b.type === "hall" && b.hp > 0,
      );
    if (f.pop > f.cap && S.time % 3 < dt) {
      /* existing troops remain, but cannot recruit */
    }
    checkEnd();
  }

  // Rendering: world, buildings, units, and minimap
  function drawWorld() {
    let ww = viewport.w,
      hh = viewport.h;
    ctx.fillStyle = "#123b4b";
    ctx.fillRect(0, 0, ww, hh);
    ctx.save();
    ctx.translate(-camera.x * camera.z, -camera.y * camera.z);
    ctx.scale(camera.z, camera.z);
    world.draw(ctx, S.time);
    window.RealmfrontTerrainArt?.ground(ctx, terrain.landforms);
    let left = Math.max(0, Math.floor(camera.x / 80) * 80),
      right = Math.min(W, camera.x + ww / camera.z + 90),
      top = Math.max(0, Math.floor(camera.y / 80) * 80),
      bottom = Math.min(H, camera.y + hh / camera.z + 90);
    ctx.strokeStyle = S.placement ? "#ffffff16" : "#ffffff04";
    ctx.lineWidth = 1;
    for (let x = left; x < right; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
    }
    for (let y = top; y < bottom; y += 80) {
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }
    // Roads follow the open valleys between highlands.
    ctx.strokeStyle = "#ad977147";
    ctx.lineWidth = 38;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const route of S.roads) {
      ctx.beginPath();
      route.forEach((p, i) =>
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
      );
      ctx.stroke();
    }
    terrain.draw(ctx);
    for (let n of S.nodes) {
      if (
        (n.amount <= 0 && !window.RealmfrontResources) ||
        n.x < left - 100 ||
        n.x > right + 100 ||
        n.y < top - 100 ||
        n.y > bottom + 100
      )
        continue;
      if (window.RealmfrontResources?.draw(ctx, n, S.time)) continue;
      if (n.type === "tree") {
        ctx.fillStyle = "#152d21";
        circle(n.x + 3, n.y + 5, n.r + 4);
        ctx.fillStyle = "#477a50";
        circle(n.x, n.y, n.r);
        ctx.fillStyle = "#6c9965";
        circle(n.x - 6, n.y - 5, n.r * 0.58);
      } else {
        ctx.fillStyle = "#626b6b";
        poly(n.x, n.y, n.r, 6, 0);
        ctx.fillStyle = "#c2a66b";
        poly(n.x - 3, n.y - 4, n.r * 0.48, 5, 0.3);
      }
    }
    drawStrategy();
    for (let b of S.buildings) drawBuilding(b);
    for (let u of [...S.units].sort((a, b) => a.y - b.y)) drawUnit(u);
    for (let p of S.shots) {
      ctx.fillStyle = p.kind === "siege" ? "#e6ab65" : colors[p.f];
      circle(p.x, p.y, p.r);
      if (p.kind !== "siege") {
        ctx.strokeStyle = "#ffe8b9a1";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x - 4, p.y - 4);
        ctx.lineTo(p.x + 2, p.y + 2);
        ctx.stroke();
      }
    }
    for (let p of S.particles) {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.color;
      circle(p.x, p.y, p.r);
      ctx.globalAlpha = 1;
    }
    if (S.placement) {
      let type = S.placement,
        d = defs[type],
        preview = window.RealmfrontMobile?.touch && touchPlacement ? touchPlacement : { x: mouse.wx, y: mouse.wy },
        valid =
          validPlace(type, preview.x, preview.y) && canPay(S.factions[0], d.cost);
      ctx.save();
      ctx.globalAlpha = 0.6;
      window.RealmfrontBuildings?.draw(
        ctx,
        { type, f: 0, x: preview.x, y: preview.y, size: d.size, level: 1 },
        colors[0],
        S.time,
      );
      ctx.fillStyle = valid ? "#98e7a6" : "#f58c80";
      ctx.strokeStyle = valid ? "#b5fbb6" : "#ffb1a7";
      ctx.lineWidth = 3;
      ctx.fillRect(
        preview.x - d.size / 2,
        preview.y - d.size / 2,
        d.size,
        d.size,
      );
      ctx.strokeRect(
        preview.x - d.size / 2,
        preview.y - d.size / 2,
        d.size,
        d.size,
      );
      if (d.range) {
        ctx.beginPath();
        ctx.arc(preview.x, preview.y, d.range, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
    if (
      mouse.down &&
      mouse.button === 2 &&
      !S.placement &&
      (mouse.isTouch ? mouse.moved : rightDragSelect())
    ) {
      const rect = C.getBoundingClientRect();
      ctx.fillStyle = "#b5edb322";
      ctx.strokeStyle = "#dbedb3";
      ctx.lineWidth = 1;
      ctx.fillRect(
        mouse.startX - rect.left,
        mouse.startY - rect.top,
        mouse.x - (mouse.startX - rect.left),
        mouse.y - (mouse.startY - rect.top),
      );
      ctx.strokeRect(
        mouse.startX - rect.left,
        mouse.startY - rect.top,
        mouse.x - (mouse.startX - rect.left),
        mouse.y - (mouse.startY - rect.top),
      );
    }
    if (mouse.isTouch && mouse.down && !mouse.moved && !pinch && !S.placement && !S.command && performance.now() - mouse.startedAt >= 300) {
      ctx.strokeStyle = "#e2edaa";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 17, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = "bold 12px system-ui";
      ctx.textAlign = "center";
      ctx.fillStyle = "#f5efca";
      ctx.fillText("Drag to select", clamp(mouse.x, 55, viewport.w - 55), Math.max(20, mouse.y - 25));
    }
  }
  function circle(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  function poly(x, y, r, n, angle) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      let a = angle + (i * Math.PI * 2) / n;
      if (!i) ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a));
      else ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
    }
    ctx.closePath();
    ctx.fill();
  }
  function health(x, y, w, hp, max) {
    if (hp >= max * 0.99) return;
    ctx.fillStyle = "#2b2725";
    ctx.fillRect(x - w / 2, y, w, 5);
    ctx.fillStyle = hp / max > 0.35 ? "#99d28d" : "#e17c70";
    ctx.fillRect(x - w / 2, y, w * clamp(hp / max, 0, 1), 5);
  }
  function drawBuilding(b) {
    if (b.hp <= 0) return;
    let d = defs[b.type],
      x = b.x,
      y = b.y,
      s = b.size,
      selected = S.selected.includes(b);
    if (!window.RealmfrontBuildings?.draw(ctx, b, colors[b.f], S.time)) {
      ctx.fillStyle = "#0000003b";
      ctx.fillRect(x - s / 2 + 6, y - s / 2 + 9, s, s);
      ctx.fillStyle = colors[b.f];
      ctx.fillRect(x - s / 2 - 3, y - s / 2 - 3, s + 6, s + 6);
      ctx.fillStyle = "#293b37";
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
      ctx.fillStyle = d.color;
      ctx.fillRect(x - s * 0.43, y - s * 0.39, s * 0.86, s * 0.78);
      ctx.fillStyle = "#29383a";
      ctx.fillRect(x - s * 0.13, y + s * 0.08, s * 0.26, s * 0.3);
      if (b.type === "hall") {
        ctx.fillStyle = "#556455";
        poly(x, y - s * 0.28, s * 0.52, 3, -Math.PI / 2);
        ctx.fillStyle = "#e2d7ab";
        ctx.fillRect(x - 4, y - s * 0.68, 8, 24);
      } else if (b.type === "farm") {
        ctx.strokeStyle = "#56713c";
        ctx.lineWidth = 5;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(x - s * 0.35, y + i * 9);
          ctx.lineTo(x + s * 0.35, y + i * 9);
          ctx.stroke();
        }
      } else if (b.type === "mine") {
        ctx.fillStyle = "#775f41";
        ctx.fillRect(x - s * 0.31, y - s * 0.2, s * 0.62, s * 0.37);
        ctx.fillStyle = "#efd59a";
        poly(x, y - s * 0.02, 10, 6, 0.1);
      } else if (b.type === "lumber") {
        ctx.fillStyle = "#795437";
        for (let i = -1; i <= 1; i++) ctx.fillRect(x - 16, y + i * 9, 33, 6);
      } else if (b.type === "house") {
        ctx.fillStyle = "#765c50";
        poly(x, y - s * 0.18, s * 0.49, 3, -Math.PI / 2);
      } else if (b.type === "tower" || b.type === "fortress") {
        ctx.fillStyle = "#4f6566";
        circle(x, y, s * 0.29);
        ctx.fillStyle = "#d6d2b1";
        circle(x, y, 7);
      } else {
        ctx.fillStyle = "#566a68";
        poly(x, y - s * 0.13, s * 0.37, 3, -Math.PI / 2);
        if (b.type === "range") {
          ctx.strokeStyle = "#e9d8a7";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(x, y, 12, 0, Math.PI);
          ctx.stroke();
        }
        if (b.type === "stable") {
          ctx.fillStyle = "#574732";
          ctx.fillRect(x - 18, y, 36, 12);
        }
        if (b.type === "workshop") {
          ctx.fillStyle = "#6b7777";
          circle(x, y + 6, 15);
        }
      }
    }
    if (selected) {
      ctx.strokeStyle = "#f2e8b7";
      ctx.lineWidth = 3;
      ctx.strokeRect(x - s / 2 - 8, y - s / 2 - 8, s + 16, s + 16);
      if (d.range) {
        ctx.strokeStyle = "#dbe7b86c";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, d.range + (b.level - 1) * 25, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (b.train.length) {
      ctx.fillStyle = "#131c1bd9";
      ctx.fillRect(x - s / 2, y + s / 2 + 4, s, 6);
      ctx.fillStyle = "#e7d3a1";
      ctx.fillRect(
        x - s / 2,
        y + s / 2 + 4,
        s * clamp(b.progress / udefs[b.train[0]].time, 0, 1),
        6,
      );
    }
    health(
      x,
      window.RealmfrontBuildings
        ? window.RealmfrontBuildings.bounds(b).y - 9
        : y - s / 2 - 17,
      s,
      b.hp,
      b.maxHp,
    );
    if (camera.z > 0.58) {
      ctx.font = "bold 11px system-ui";
      ctx.textAlign = "center";
      ctx.fillStyle = "#edf0d9";
      ctx.fillText(d.name, x, y + s * 0.65 + 18);
      if (occupiedSlots(b)) {
        ctx.fillStyle = "#142820e8";
        ctx.fillRect(x + s * 0.35, y - s * 0.5, 46, 16);
        ctx.fillStyle = "#f3d68d";
        ctx.font = "bold 10px system-ui";
        ctx.fillText(`W ${occupiedSlots(b)}/${workerSlots(b)}`, x + s * 0.35 + 23, y - s * 0.5 + 12);
      }
    }
  }
  function drawUnit(u) {
    if (u.hp <= 0) return;
    let d = udefs[u.type],
      r = d.radius,
      x = u.x,
      y = u.y,
      selected = S.selected.includes(u);
    if (!window.RealmfrontSprites?.draw(ctx, u, S.time, colors[u.f])) {
      ctx.fillStyle = "#111e1ac0";
      circle(x + 2, y + 3, r + 2);
      ctx.fillStyle = colors[u.f];
      circle(x, y, r);
      ctx.fillStyle = "#233432";
      circle(x, y, r * 0.66);
      ctx.fillStyle =
        u.type === "healer"
          ? "#c3e8b6"
          : u.type === "archer" || u.type === "crossbow"
            ? "#dfc788"
            : u.type === "catapult"
              ? "#a4a4a1"
              : "#dfddd0";
      if (u.type === "catapult") {
        ctx.fillRect(x - 10, y - 6, 20, 12);
        ctx.fillStyle = "#d8b379";
        circle(x + 3, y - 2, 5);
      } else if (u.type === "cavalry" || u.type === "raider") {
        ctx.fillRect(x - 6, y - 3, 12, 13);
        ctx.fillStyle = "#f5e3ab";
        circle(x, y - 5, 5);
      } else if (u.type === "archer" || u.type === "crossbow") {
        ctx.fillRect(x - 2, y - 9, 4, 18);
      } else if (u.type === "healer") {
        ctx.fillRect(x - 2, y - 7, 4, 14);
        ctx.fillRect(x - 7, y - 2, 14, 4);
      } else if (u.type === "guard") {
        ctx.fillRect(x - 6, y - 6, 12, 12);
      } else if (u.type === "worker") {
        ctx.fillRect(x - 4, y - 4, 8, 8);
      } else {
        poly(x, y, 6, 3, -Math.PI / 2);
      }
    }
    if (selected) {
      ctx.strokeStyle = "#f9e8ad";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    health(x, y - r - 23, Math.max(22, r * 2.2), u.hp, u.maxHp);
  }
  function drawMini() {
    if (!S) return;
    mc.fillStyle = "#174453";
    mc.fillRect(0, 0, 300, 182);
    const origin = world.mapPoint(0, 0),
      end = world.mapPoint(W, H);
    mc.fillStyle = "#b6a378";
    mc.fillRect(
      origin.x - 2,
      origin.y - 2,
      end.x - origin.x + 4,
      end.y - origin.y + 4,
    );
    mc.fillStyle = "#314e39";
    mc.fillRect(origin.x, origin.y, end.x - origin.x, end.y - origin.y);
    terrain.drawMini(mc);
    for (const n of S.nodes) {
      if (n.amount <= 0) continue;
      const p = world.mapPoint(n.x, n.y);
      mc.fillStyle = n.type === "ore" ? "#b9a076" : "#497d53";
      mc.fillRect(p.x, p.y, 2, 2);
    }
    for (const b of S.buildings) {
      if (b.hp <= 0) continue;
      const p = world.mapPoint(b.x, b.y);
      mc.fillStyle = colors[b.f];
      mc.fillRect(
        p.x - 2,
        p.y - 2,
        b.type === "hall" ? 6 : 3,
        b.type === "hall" ? 6 : 3,
      );
    }
    for (const u of S.units) {
      if (u.hp <= 0) continue;
      const p = world.mapPoint(u.x, u.y);
      mc.fillStyle = colors[u.f];
      mc.fillRect(p.x, p.y, 2, 2);
    }
    for (const o of S.outposts) {
      const p = world.mapPoint(o.x, o.y);
      mc.fillStyle = o.owner < 0 ? "#eee0ac" : colors[o.owner];
      mc.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    const start = world.mapPoint(camera.x, camera.y),
      finish = world.mapPoint(
        camera.x + viewport.w / camera.z,
        camera.y + viewport.h / camera.z,
      );
    const x = clamp(start.x, 0, 300),
      y = clamp(start.y, 0, 182);
    mc.strokeStyle = "#fff5ce";
    mc.lineWidth = 1.5;
    mc.strokeRect(
      x,
      y,
      clamp(finish.x, 0, 300) - x,
      clamp(finish.y, 0, 182) - y,
    );
  }

  // HUD updates and animation loop
  function updateUI() {
    if (!S) return;
    updateMapButton();
    window.RealmfrontCheats?.refresh();
    let f = S.factions[0],
      res = f.resources;
    for (let k of ["gold", "food", "wood"]) {
      const element = document.getElementById(k);
      const value = res[k];
      element.textContent = window.RealmfrontMobile?.touch && value >= 10000
        ? (value >= 1e9 ? `${Math.floor(value / 1e8) / 10}B` : value >= 1e6 ? `${Math.floor(value / 1e5) / 10}M` : `${Math.floor(value / 100) / 10}K`)
        : fmt(value);
      element.setAttribute("aria-label", `${k}: ${Math.floor(value)}`);
      element.title = String(Math.floor(value));
    }
    document.getElementById("pop").textContent =
      `${f.pop}/${Math.min(100, f.cap)}`;
    let m = Math.floor(S.time / 60),
      s = Math.floor(S.time % 60);
    document.getElementById("clock").textContent =
      `${m}:${String(s).padStart(2, "0")}`;
    document.getElementById("factionsAlive").textContent =
      `${S.factions.filter((v) => v.alive).length - 1} Rivals Remain`;
    document.getElementById("status").textContent =
      `${S.buildings.filter((b) => b.f === 0).length} buildings · ${f.pop} units (including inside) · ${S.difficulty === 1 ? "Normal" : S.difficulty < 1 ? "Casual" : "Hard"} AI`;
    const held = S.outposts.filter((p) => p.owner === 0).length;
    document.getElementById("objectives").textContent =
      `Hold crossings for bonus income · ${held}/3 held`;
    document.getElementById("commandState").textContent = S.command
      ? `${S.command === "attack" ? "Attack-move" : S.command === "enter" ? "Enter building" : "Rally point"}: click destination · Esc cancels`
      : "Ready · A attack-move · Ctrl+1–9 save group";
    document
      .getElementById("pauseState")
      .classList.toggle("hidden", !S.paused || S.ended);
    if (window.RealmfrontMobile?.touch) {
      document.getElementById("commandState").textContent = S.command
        ? `${S.command === "attack" ? "Attack" : S.command === "enter" ? "Enter building" : "Rally"}: tap destination - Cancel to stop`
        : S.placement
          ? "Tap to preview, then Build here"
          : "Hold to select · Swipe to pan · Pinch to zoom";
      updateTouchUI();
    }
    refreshActions();
    refreshDetails();
  }
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!S) {
      ctx.fillStyle = "#233d2c";
      ctx.fillRect(0, 0, viewport.w, viewport.h);
      return;
    }
    let raw = Math.min(0.05, Math.max(0, (ts - last) / 1000));
    last = ts;
    if (!S.paused && !S.ended && !window.RealmfrontMobile?.blocked) {
      let dt = raw * S.speed;
      tick(dt);
    }
    cameraMove(raw);
    drawWorld();
    cursorTick += raw;
    if (cursorTick > 0.08 || mouse.down) {
      cursorTick = 0;
      mouse.wx = camera.x + mouse.x / camera.z;
      mouse.wy = camera.y + mouse.y / camera.z;
      updateCursor();
    }
    uiTick += raw;
    lastMinimap += raw;
    if (uiTick > 0.3) {
      uiTick = 0;
      updateUI();
    }
    if (lastMinimap > 0.25) {
      lastMinimap = 0;
      drawMini();
    }
  }

  // Camera controls and player commands
  function cameraMove(dt) {
    let d = (480 * dt) / camera.z,
      dx = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0),
      dy = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
    if (dx || dy) {
      camera.x += dx * d;
      camera.y += dy * d;
      fixCamera();
    }
  }
  function fixCamera() {
    world.clampCamera(camera, viewport);
  }
  function toWorld(e) {
    let r = C.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
    mouse.wx = camera.x + mouse.x / camera.z;
    mouse.wy = camera.y + mouse.y / camera.z;
    mouse.inside =
      e.pointerType !== "touch" &&
      mouse.x >= 0 &&
      mouse.y >= 0 &&
      mouse.x <= r.width &&
      mouse.y <= r.height;
    if (e.pointerType !== "touch") updateCursor();
  }
  function pick(x, y, tolerance = 0) {
    let u = S.units.filter(
      (u) =>
        u.hp > 0 &&
        Math.hypot(u.x - x, u.y - y) <
          Math.max(13, udefs[u.type].radius + 5) + tolerance,
    );
    let closest = nearest(u, { x, y }, 25 + tolerance);
    if (closest) return closest;
    return (
      S.buildings
        .filter(
          (b) =>
            b.hp > 0 &&
            ((Math.abs(b.x - x) < b.size / 2 &&
              Math.abs(b.y - y) < b.size / 2) ||
              (window.RealmfrontBuildings &&
                (() => {
                  const r = window.RealmfrontBuildings.bounds(b);
                  return (
                    x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
                  );
                })())),
        )
        .sort((a, b) => dist(a, { x, y }) - dist(b, { x, y }))[0] || null
    );
  }
  function resourceAt(x, y) {
    return nearest(
      S.nodes.filter((n) => {
        if (n.amount <= 0) return false;
        if (Math.hypot(n.x - x, n.y - y) < Math.max(32, n.r + 10)) return true;
        const r = window.RealmfrontResources?.bounds(n);
        return r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
      }),
      { x, y },
    );
  }
  function cursorAction() {
    if (!S || !mouse.inside || mouse.isTouch)
      return { kind: "default", label: "" };
    if (!canCommand())
      return {
        kind: "blocked",
        label: S.paused ? "Battle paused" : "Commands unavailable",
      };
    if (mouse.down && mouse.button === 2 && rightDragSelect())
      return { kind: "box", label: "Drag to select units" };
    if (
      mouse.down &&
      mouse.moved &&
      (mouse.button === 0 || mouse.button === 1) &&
      !S.placement
    )
      return { kind: "pan", label: "" };
    const x = mouse.wx,
      y = mouse.wy;
    if (S.placement) {
      const px = Math.round(x / 12) * 12,
        py = Math.round(y / 12) * 12;
      return validPlace(S.placement, px, py) &&
        canPay(S.factions[0], defs[S.placement].cost)
        ? { kind: "build", label: `Place ${defs[S.placement].name}` }
        : {
            kind: "blocked",
            label: "Cannot build here or insufficient resources",
          };
    }
    if (!world.contains(x, y))
      return { kind: "blocked", label: "Sea - cannot enter" };
    if (S.command === "enter") {
      const building = pick(x, y);
      const possible = S.selected.some((u) => u.f === 0 && u.size === undefined && canEnter(u, building));
      return possible ? { kind: building.type === "lumber" ? "chop" : building.type === "mine" ? "mine" : "move",
        label: `Click to enter ${defs[building.type].name}` } : { kind: "blocked", label: "Choose a friendly resource or military building with worker spaces" };
    }
    if (S.command)
      return {
        kind: S.command === "attack" ? "attack" : S.command === "enter" ? "move" : "rally",
        label:
          S.command === "attack"
            ? "Click to attack-move"
            : S.command === "enter" ? "Click a friendly resource or military building to enter"
            : "Click to set rally point",
      };
    const owned = S.selected.filter((o) => o.f === 0 && o.hp > 0),
      troops = owned.filter((o) => o.size === undefined),
      workers = troops.filter((u) => u.type === "worker"),
      target = pick(x, y);
    if (target?.f !== undefined && target.f !== 0)
      return troops.length
        ? { kind: "attack", label: "Right-click: Attack" }
        : {
            kind: "select",
            label: `Select ${(target.size ? defs : udefs)[target.type].name}`,
          };
    if (
      workers.length &&
      target?.f === 0 &&
      target.size !== undefined &&
      target.hp < target.maxHp
    )
      return { kind: "repair", label: "Right-click: Repair building" };
    const node = workers.length ? resourceAt(x, y) : null;
    if (workers.length && target?.f === 0 && workerSlots(target))
      return workers.some((u) => canEnter(u, target))
        ? { kind: target.type === "lumber" ? "chop" : target.type === "mine" ? "mine" : "move",
          label: `Right-click: Enter ${defs[target.type].name}${defs[target.type].rate ? " (+1/s)" : " to retrain"}` }
        : { kind: "blocked", label: "Worker spaces are occupied or reserved" };
    if (node)
      return node.type === "tree"
        ? { kind: "chop", label: "Right-click: Chop lumber" }
        : { kind: "mine", label: "Right-click: Mine gold" };
    if (target)
      return {
        kind: "select",
        label: `Select ${(target.size ? defs : udefs)[target.type].name}`,
      };
    if (!terrain.isWalkable(x, y, terrain.clearance))
      return {
        kind: "blocked",
        label: "Blocked terrain - orders go to the edge",
      };
    if (!troops.length && owned.some((o) => unitByBuilding[o.type]))
      return { kind: "rally", label: "Right-click: Set rally point" };
    return troops.length
      ? { kind: "move", label: "Right-click: Move" }
      : { kind: "default", label: "" };
  }
  function updateCursor() {
    if (!window.RealmfrontCursors) return;
    window.RealmfrontCursors.apply(
      C,
      document.getElementById("cursorHint"),
      cursorAction(),
      {
        inside: mouse.inside,
        x: mouse.x,
        y: mouse.y,
        width: viewport.w,
        height: viewport.h,
      },
    );
  }

  function issueMove(x, y, attackMove = false) {
    if (!canCommand()) return;
    if (!world.contains(x, y)) {
      message("The outer sea cannot be entered or built on");
      return;
    }
    const p = pick(x, y);
    const clicked = { x, y };
    const ground = terrain.nearestWalkable(x, y);
    if (!ground) return;
    x = ground.x;
    y = ground.y;
    const buildings = S.selected.filter(
      (o) =>
        o.size !== undefined && o.f === 0 && o.hp > 0 && unitByBuilding[o.type],
    );
    const troops = S.selected.filter(
      (o) => o.size === undefined && o.f === 0 && o.hp > 0,
    );
    if (S.command === "enter") {
      let count = 0;
      for (const worker of troops.filter((u) => u.type === "worker")) if (orderEnter(worker, p)) count++;
      if (!count) { message("Choose a friendly resource or military building with room for workers"); return; }
      S.command = null;
      message(`${count} worker${count === 1 ? "" : "s"} moving inside`);
      updateUI();
      return;
    }
    if (S.command === "rally" || (!troops.length && buildings.length)) {
      for (const b of buildings) b.rally = { x, y };
      S.command = null;
      message("Rally point set");
      refreshDetails();
      return;
    }
    if (!troops.length) {
      message("Select your units first");
      return;
    }
    const node = resourceAt(clicked.x, clicked.y);
    let entering = 0, gathering = 0, repairing = 0;
    troops.forEach((u, i) => {
      u.hold = false;
      u.actionTime = 0;
      u.job = null;
      u.target = null;
      u.move = null;
      u.attackMove = attackMove;
      u.think = 0;
      if (!attackMove && p && p.f !== u.f) u.target = p;
      else if (
        !attackMove &&
        u.type === "worker" &&
        p?.f === u.f &&
        p.size &&
        p.hp < p.maxHp
      ) {
        u.job = { kind: "repair", target: p };
        repairing++;
      }
      else if (!attackMove && u.type === "worker" && p?.f === u.f && workerSlots(p)) {
        if (orderEnter(u, p)) entering++;
        else u.hold = true;
      }
      else if (!attackMove && u.type === "worker" && node) {
        u.job = { kind: "gather", target: node };
        gathering++;
      }
      else {
        const a = i * 2.3999,
          r = 23 * Math.sqrt(i);
        u.move = terrain.nearestWalkable(
          x + Math.cos(a) * r,
          y + Math.sin(a) * r,
        );
      }
    });
    S.orderMarkers.push({
      x,
      y,
      time: S.time,
      attack: attackMove || !!(p && p.f !== 0),
    });
    S.command = null;
    message(
      attackMove
        ? "Attack-move ordered"
        : entering ? `${entering} worker${entering === 1 ? "" : "s"} moving inside`
        : gathering
          ? "Workers assigned to gather"
          : repairing
            ? "Workers assigned to repair"
            : p?.f === 0 && workerSlots(p) && troops.some((u) => u.type === "worker") ? "No free worker spaces"
            : p && p.f !== 0
              ? "Attack ordered"
              : "Move ordered",
    );
  }

  // Touch controls use explicit modes so every mouse command remains accessible.
  let touchMode = "pan",
    touchPlacement = null,
    pinch = null,
    suppressTouch = false,
    lastSelectionClick = null;
  const touches = new Map();
  function setTouchMode(mode) {
    touchMode = mode;
    updateTouchUI();
  }
  function updateTouchUI() {
    for (const mode of ["pan", "select", "order"])
      document
        .getElementById("touch" + mode[0].toUpperCase() + mode.slice(1))
        .setAttribute("aria-pressed", String(touchMode === mode));
    if (window.RealmfrontMobile?.touch)
      document.getElementById("tip").textContent =
        "Hold, then drag to select · Tap targets to command · Swipe/pinch to explore";
    document.getElementById("pauseHint").textContent = window.RealmfrontMobile
      ?.touch
      ? "Tap Resume to continue"
      : "Space to resume";
    if (!window.RealmfrontMobile?.touch || !S) return;
    document.body.classList.toggle("targeting", !!S.placement || !!S.command);
    if (S.placement) document.getElementById("tip").textContent = "Tap to preview; drag to pan. Build here confirms.";
    else if (S.command) document.getElementById("tip").textContent = "Tap a destination, or Cancel to leave targeting.";
    const selected = S.selected.filter((o) => o.hp > 0), owned = selected.filter((o) => o.f === 0);
    document.body.classList.toggle("catalog-mode", !owned.some((o) => o.size === undefined));
    document.body.classList.toggle("no-selection", !selected.length && !S.placement && !S.catalogPreview);
    document.body.classList.toggle("has-troops", owned.some((o) => o.size === undefined));
    document.getElementById("touchDeselect").disabled = !selected.length && !S.placement && !S.command;
    document.getElementById("touchDeselect").textContent = selected.length ? `Deselect (${selected.length})` : "Deselect";
    const info = document.getElementById("touchInfo");
    info.classList.toggle("hidden", !selected.length && !S.placement);
    info.textContent = S.placement ? `${defs[S.placement].name} · Info` : selected.length === 1
      ? `${(selected[0].size === undefined ? udefs : defs)[selected[0].type].name} · Info`
      : `${selected.length} selected · Info`;
    info.setAttribute("aria-expanded", String(document.body.classList.contains("panel-open")));
    document.getElementById("pause").textContent = S.paused ? "Resume" : "Pause";
    document.getElementById("pause").disabled = S.ended;
    const active = canCommand(), troops = owned.some((o) => o.size === undefined);
    document.getElementById("touchOrder").disabled = !active || !(troops || owned.some((o) => o.size !== undefined && unitByBuilding[o.type]));
    document.getElementById("touchAttack").disabled = !active || !troops;
    document.getElementById("touchStop").disabled = !active || !troops;
    document.getElementById("touchArmy").disabled = !active || !S.units.some((u) => u.f === 0 && u.hp > 0 && u.type !== "worker");
    const bar = document.getElementById("touchPlacementBar"), confirm = document.getElementById("touchConfirmBuild");
    bar.classList.toggle("hidden", !S.placement && !S.command);
    confirm.classList.toggle("hidden", !S.placement);
    confirm.disabled = !active || !S.placement || !touchPlacement ||
      !validPlace(S.placement, touchPlacement.x, touchPlacement.y) || !canPay(S.factions[0], defs[S.placement].cost);
    document.getElementById("touchPlacementStatus").textContent = S.placement
      ? `${defs[S.placement].name}: ${!active ? "resume to build" : !canPay(S.factions[0], defs[S.placement].cost) ? "not enough resources" : !touchPlacement ? "tap to aim" : confirm.disabled ? "choose open land near your base" : "ready to build"}`
      : `${S.command === "attack" ? "Attack-move" : S.command === "enter" ? "Enter building" : "Rally"}: tap destination`;
    document.getElementById("touchActionsToggle").textContent = `${document.getElementById("actionTitle").textContent} ${document.body.classList.contains("rail-roster") ? "▾" : "▴"}`;
    document.getElementById("touchActionsToggle").setAttribute("aria-expanded", String(document.body.classList.contains("rail-roster")));
    const bounds = C.getBoundingClientRect();
    if (Math.abs(bounds.width - viewport.w) > 0.5 || Math.abs(bounds.height - viewport.h) > 0.5) resize();
  }
  function cancelTouchCommand() {
    S.placement = null;
    S.command = null;
    touchPlacement = null;
    lastSelectionClick = null;
    mouse.down = false;
    setTouchMode("pan");
    updateUI();
  }
  function selectBox(add = false) {
    const r = C.getBoundingClientRect(),
      x1 = camera.x + (mouse.startX - r.left) / camera.z,
      y1 = camera.y + (mouse.startY - r.top) / camera.z;
    const units = S.units.filter(
      (u) =>
        u.f === 0 &&
        u.hp > 0 &&
        u.x >= Math.min(x1, mouse.wx) &&
        u.x <= Math.max(x1, mouse.wx) &&
        u.y >= Math.min(y1, mouse.wy) &&
        u.y <= Math.max(y1, mouse.wy),
    );
    S.selected = add ? [...new Set([...S.selected, ...units])] : units;
    lastSelectionClick = null;
    refreshActions();
    refreshDetails();
  }
  function touchDown(e) {
    e.preventDefault();
    if (!canCommand()) return;
    C.setPointerCapture(e.pointerId);
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size >= 2) {
      const [a, b] = [...touches.values()],
        r = C.getBoundingClientRect(),
        x = (a.x + b.x) / 2 - r.left,
        y = (a.y + b.y) / 2 - r.top;
      pinch = {
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        zoom: camera.z,
        wx: camera.x + x / camera.z,
        wy: camera.y + y / camera.z,
      };
      suppressTouch = true;
      mouse.down = false;
      return;
    }
    if (suppressTouch) return;
    toWorld(e);
    mouse.isTouch = true;
    mouse.down = true;
    mouse.moved = false;
    mouse.startX = e.clientX;
    mouse.startY = e.clientY;
    mouse.camX = camera.x;
    mouse.camY = camera.y;
    mouse.startedAt = performance.now();
    mouse.button = 0;
  }
  function touchMove(e) {
    e.preventDefault();
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && touches.size >= 2) {
      const [a, b] = [...touches.values()],
        r = C.getBoundingClientRect(),
        x = (a.x + b.x) / 2 - r.left,
        y = (a.y + b.y) / 2 - r.top;
      camera.z = clamp(
        (pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.distance,
        world.fitZoom(viewport),
        1.55,
      );
      camera.x = pinch.wx - x / camera.z;
      camera.y = pinch.wy - y / camera.z;
      fixCamera();
      return;
    }
    if (suppressTouch || !mouse.down) return;
    toWorld(e);
    const dx = e.clientX - mouse.startX,
      dy = e.clientY - mouse.startY;
    if (!mouse.moved && performance.now() - mouse.startedAt >= 300 && !S.placement && !S.command) mouse.button = 2;
    if (Math.hypot(dx, dy) > 8) mouse.moved = true;
    if (mouse.moved && mouse.button === 0) {
      camera.x = mouse.camX - dx / camera.z;
      camera.y = mouse.camY - dy / camera.z;
      fixCamera();
      toWorld(e);
    }
  }
  function touchUp(e) {
    e.preventDefault();
    window.RealmfrontMobile?.suppressCanvasClick?.(e.pointerId);
    if (C.hasPointerCapture?.(e.pointerId)) C.releasePointerCapture(e.pointerId);
    touches.delete(e.pointerId);
    if (suppressTouch) {
      mouse.down = false;
      if (!touches.size) {
        pinch = null;
        suppressTouch = false;
      }
      return;
    }
    if (!mouse.down) return;
    mouse.down = false;
    toWorld(e);
    if (!canCommand()) return;
    if (mouse.moved) {
      if (mouse.button === 2 && !S.placement && !S.command) selectBox();
      lastSelectionClick = null;
      return;
    }
    if (S.placement) {
      touchPlacement = { x: Math.round(mouse.wx / 12) * 12, y: Math.round(mouse.wy / 12) * 12 };
      updateTouchUI();
      return;
    }
    if (S.command) {
      issueMove(mouse.wx, mouse.wy, S.command === "attack");
      return;
    }
    const obj = pick(mouse.wx, mouse.wy, 12 / camera.z);
    const selectedTroops = S.selected.filter((o) => o.f === 0 && o.hp > 0 && o.size === undefined);
    const workers = selectedTroops.some((u) => u.type === "worker");
    const friendlyUnit = obj?.f === 0 && obj.size === undefined;
    const buildingAction = obj?.f === 0 && obj.size !== undefined && workers &&
      (workerSlots(obj) > 0 || obj.hp < obj.maxHp);
    const friendlyBuilding = obj?.f === 0 && obj.size !== undefined;
    if (obj && (friendlyUnit || (friendlyBuilding && !buildingAction))) {
      selectClicked(obj);
    } else if (performance.now() - mouse.startedAt >= 300) {
      if (obj) selectClicked(obj);
    } else if (selectedTroops.length) {
      lastSelectionClick = null;
      issueMove(mouse.wx, mouse.wy);
    } else if (!obj && S.selected.some((o) => o.f === 0 && unitByBuilding[o.type])) {
      lastSelectionClick = null;
      issueMove(mouse.wx, mouse.wy);
    } else if (obj) selectClicked(obj);
    if (obj) document.body.classList.remove("rail-build", "rail-info", "map-open");
    updateTouchUI();
  }
  for (const mode of ["pan", "select", "order"])
    document.getElementById(
      "touch" + mode[0].toUpperCase() + mode.slice(1),
    ).onclick = () => setTouchMode(mode);
  document.getElementById("touchArmy").onclick = () => {
    selectArmy();
    setTouchMode("order");
  };
  document.getElementById("touchAttack").onclick = () => {
    armAttackMove();
    setTouchMode("order");
  };
  document.getElementById("touchStop").onclick = stopSelected;
  document.getElementById("touchActionsToggle").onclick = () => {
    document.body.classList.remove("rail-info", "rail-build", "map-open");
    document.body.classList.toggle("rail-roster"); updateTouchUI();
  };
  document.getElementById("touchDeselect").onclick = () => {
    if (!S) return;
    S.selected = [];
    document.body?.classList.remove("rail-info", "rail-build", "rail-roster", "map-open");
    cancelTouchCommand();
  };
  document.getElementById("touchInfo").onclick = () => {
    document.body.classList.remove("map-open");
    document.body.classList.toggle("panel-open"); updateTouchUI();
  };
  document.getElementById("touchClosePanel").onclick = () => {
    document.body.classList.remove("map-open", "panel-open"); updateTouchUI();
  };
  document.getElementById("touchCancelPlacement").onclick = () => { if (S) cancelTouchCommand(); };
  document.getElementById("touchConfirmBuild").onclick = () => {
    if (!S?.placement || !touchPlacement) return;
    if (placeBuilding(touchPlacement.x, touchPlacement.y, false)) touchPlacement = null;
    updateUI();
  };
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(resize).observe(C.parentElement);
  document.addEventListener?.("visibilitychange", () => {
    if (!document.hidden || !window.RealmfrontMobile?.touch) return;
    keys = {};
    mouse.down = false;
    touches.clear();
    pinch = null;
    suppressTouch = false;
    lastSelectionClick = null;
    if (S?.running && !S.paused && !S.ended) togglePause();
  });
  window.addEventListener("realmfront:notice", (e) => message(e.detail));
  window.RealmfrontMobile?.setup(() => {
    if (window.RealmfrontMobile.blocked) {
      keys = {};
      mouse.down = false;
      touches.clear();
      pinch = null;
      suppressTouch = false;
    }
    updateTouchUI();
  });

  // A quick right-click tolerates 24px of slip; a held drag selects from 10px.
  function rightDragSelect() {
    if (
      !mouse.selecting &&
      mouse.dragDistance >= 10 &&
      (performance.now() - mouse.startedAt >= 180 || mouse.dragDistance > 24)
    )
      mouse.selecting = true;
    return mouse.selecting;
  }

  C.addEventListener("pointerenter", (e) => {
    if (e.pointerType !== "touch") {
      mouse.isTouch = false;
      toWorld(e);
    }
  });
  C.addEventListener("pointerleave", (e) => {
    if (e.pointerType !== "touch") {
      mouse.inside = false;
      updateCursor();
    }
  });
  // Mouse, keyboard, and button event handlers
  C.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") {
      touchDown(e);
      return;
    }
    if (!canCommand()) return;
    toWorld(e);
    mouse.down = true;
    mouse.moved = false;
    mouse.isTouch = false;
    mouse.startedAt = performance.now();
    mouse.dragDistance = 0;
    mouse.selecting = false;
    mouse.startX = e.clientX;
    mouse.startY = e.clientY;
    mouse.camX = camera.x;
    mouse.camY = camera.y;
    mouse.button = e.button;
    C.setPointerCapture(e.pointerId);
  });
  C.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") {
      touchMove(e);
      return;
    }
    if (!S) return;
    toWorld(e);
    if (mouse.down) {
      let dx = e.clientX - mouse.startX,
        dy = e.clientY - mouse.startY;
      if (Math.hypot(dx, dy) > 7) mouse.moved = true;
      mouse.dragDistance = Math.hypot(dx, dy);
      if (mouse.button === 2) rightDragSelect();
      if (
        mouse.moved &&
        !S.placement &&
        (mouse.button === 1 || mouse.button === 0)
      ) {
        camera.x = mouse.camX - dx / camera.z;
        camera.y = mouse.camY - dy / camera.z;
        fixCamera();
        toWorld(e);
      }
    }
  });
  C.addEventListener("pointerup", (e) => {
    if (e.pointerType === "touch") {
      touchUp(e);
      return;
    }
    if (!S || !mouse.down) return;
    let moved = mouse.moved,
      button = mouse.button;
    toWorld(e);
    mouse.dragDistance = Math.hypot(
      e.clientX - mouse.startX,
      e.clientY - mouse.startY,
    );
    const selecting = button === 2 && rightDragSelect();
    mouse.down = false;
    if (!canCommand()) return;
    if (button === 2) {
      if (selecting) {
        if (!S.placement) selectBox(e.shiftKey);
      } else issueMove(mouse.wx, mouse.wy);
      return;
    }
    if (moved) return;
    if (button !== 0) return;
    if (S.command) {
      issueMove(mouse.wx, mouse.wy, S.command === "attack");
      return;
    }
    if (S.placement) {
      placeBuilding(mouse.wx, mouse.wy, e.ctrlKey || e.shiftKey);
      return;
    }
    let obj = pick(mouse.wx, mouse.wy);
    if (e.shiftKey && obj && obj.f === 0) {
      if (!S.selected.includes(obj)) S.selected.push(obj);
      else S.selected = S.selected.filter((v) => v !== obj);
      lastSelectionClick = null;
      refreshActions();
      refreshDetails();
    } else selectClicked(obj);
  });
  C.addEventListener("dblclick", (e) => e.preventDefault());
  C.addEventListener("pointercancel", () => {
    mouse.down = false;
    mouse.selecting = false;
    touches.clear();
    pinch = null;
    suppressTouch = false;
  });
  C.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });
  C.addEventListener(
    "wheel",
    (e) => {
      if (!S) return;
      e.preventDefault();
      toWorld(e);
      let wx = mouse.wx,
        wy = mouse.wy;
      camera.z = clamp(
        camera.z * (e.deltaY > 0 ? 0.9 : 1.1),
        world.fitZoom(viewport),
        1.55,
      );
      camera.x = wx - mouse.x / camera.z;
      camera.y = wy - mouse.y / camera.z;
      fixCamera();
    },
    { passive: false },
  );
  mini.addEventListener("click", (e) => {
    if (!S) return;
    let r = mini.getBoundingClientRect();
    centerOn(
      world.fromMap(
        ((e.clientX - r.left) / r.width) * 300,
        ((e.clientY - r.top) / r.height) * 182,
      ).x,
      world.fromMap(
        ((e.clientX - r.left) / r.width) * 300,
        ((e.clientY - r.top) / r.height) * 182,
      ).y,
    );
  });
  let miniDragging = false;
  mini.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" || !S) return;
    e.preventDefault();
    miniDragging = true;
    mini.setPointerCapture(e.pointerId);
    miniNavigate(e);
  });
  function miniNavigate(e) {
    const r = mini.getBoundingClientRect();
    const p = world.fromMap(clamp((e.clientX - r.left) / r.width, 0, 1) * 300,
      clamp((e.clientY - r.top) / r.height, 0, 1) * 182);
    centerOn(p.x, p.y);
  }
  mini.addEventListener("pointermove", (e) => { if (miniDragging) { e.preventDefault(); miniNavigate(e); } });
  mini.addEventListener("pointerup", () => { miniDragging = false; });
  mini.addEventListener("pointercancel", () => { miniDragging = false; });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") window.RealmfrontCheats?.close();
    if (window.RealmfrontHelp?.isOpen || window.RealmfrontMobile?.blocked || window.RealmfrontMobile?.confirmingSale)
      return;
    if (
      ["SELECT", "INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
    )
      return;
    const key = e.key.toLowerCase();
    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key))
      e.preventDefault();
    keys[e.key] = true;
    keys[key] = true;
    if (!S || e.repeat) return;
    if (key === " " && !S.ended) {
      togglePause();
      return;
    }
    if (key === "escape") {
      S.selected = [];
      mouse.selecting = false;
      document.body?.classList.remove("panel-open", "map-open");
      cancelTouchCommand();
      return;
    }
    if (key === "m") fitMap();
    if (key === "h") focusBase();
    if (key === "q") selectArmy();
    if (/^[1-9]$/.test(key)) {
      e.preventDefault();
      if (e.ctrlKey) {
        S.groups[key] = S.selected
          .filter((o) => o.f === 0 && o.size === undefined && o.hp > 0)
          .map((o) => o.id);
        message(`Group ${key} saved`);
      } else {
        S.selected = S.units.filter(
          (u) => u.hp > 0 && (S.groups[key] || []).includes(u.id),
        );
        refreshActions();
        refreshDetails();
      }
    }
    if (!canCommand()) return;
    if (key === "a" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      armAttackMove();
    }
    if (key === "u" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      upgradeSelected();
    }
    if (key === "s" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      stopSelected();
    }
    if (key === "l" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      sellSelected();
    }
  });
  window.addEventListener("keyup", (e) => {
    keys[e.key] = false;
    keys[e.key.toLowerCase()] = false;
  });
  window.addEventListener("blur", () => {
    keys = {};
  });
  document.getElementById("selectArmy").onclick = selectArmy;
  document.getElementById("attackMove").onclick = armAttackMove;
  document.getElementById("stopUnits").onclick = stopSelected;
  document.getElementById("centerBase").onclick = focusBase;
  document.getElementById("fitMap").onclick = () => fullMapView ? focusBase() : fitMap();
  document.getElementById("pause").onclick = togglePause;
  document.getElementById("speed").onclick = () => {
    if (!S || S.ended) return;
    S.speed = S.speed === 1 ? 2 : S.speed === 2 ? 3 : 1;
    document.getElementById("speed").textContent = `${S.speed}× Speed`;
  };
  document.getElementById("startGame").onclick = init;
  document.getElementById("again").onclick = () => {
    document.getElementById("endOverlay").classList.add("hidden");
    document.getElementById("startOverlay").classList.remove("hidden");
  };
  function grantArmySlots() {
    if (!S || S.ended || window.RealmfrontMobile?.blocked) return 0;
    const f = S.factions[0],
      added = Math.max(0, Math.min(10, 100 - f.cap));
    f.cap += added;
    S.cheats.armySlots += added;
    updateUI();
    return added;
  }
  window.RealmfrontCheats?.setup({
    getState: () => S,
    addArmySlots: grantArmySlots,
    notice: message,
    addResource(resource, amount) {
      if (
        !S ||
        S.ended ||
        window.RealmfrontMobile?.blocked ||
        !["gold", "wood", "food"].includes(resource) ||
        !Number.isSafeInteger(amount) ||
        amount < 1 ||
        amount > 1000000000
      )
        return false;
      const resources = S.factions[0].resources;
      if (resources[resource] + amount > Number.MAX_SAFE_INTEGER) return false;
      resources[resource] += amount;
      updateUI();
      return true;
    },
    setFastTraining(enabled) {
      if (!S || S.ended || window.RealmfrontMobile?.blocked) return false;
      S.cheats.fastTraining = enabled;
      return true;
    },
  });
  let helpSession = null;
  window.RealmfrontHelp?.setup({
    onOpen() {
      keys = {};
      mouse.down = false;
      helpSession = S ? { state: S, paused: S.paused } : null;
      if (S && !S.ended) {
        S.paused = true;
        document.getElementById("pause").textContent = "Resume";
        updateUI();
      }
    },
    onClose() {
      keys = {};
      if (helpSession && S === helpSession.state && !S.ended) {
        S.paused = helpSession.paused;
        document.getElementById("pause").textContent = S.paused
          ? "Resume"
          : "Pause";
        last = performance.now();
        updateUI();
      }
      helpSession = null;
    },
  });

  // Orders, worker jobs, research, and capturable crossings.
  function canCommand() {
    return (
      !!S &&
      !S.paused &&
      !S.ended &&
      !window.RealmfrontHelp?.isOpen &&
      !window.RealmfrontMobile?.confirmingSale &&
      !window.RealmfrontMobile?.blocked
    );
  }
  function togglePause() {
    if (!S || S.ended) return;
    S.paused = !S.paused;
    document.getElementById("pause").textContent = S.paused
      ? "Resume"
      : "Pause";
    updateUI();
  }
  function selectArmy() {
    if (!S) return;
    S.selected = S.units.filter(
      (u) => u.f === 0 && u.hp > 0 && u.type !== "worker",
    );
    refreshActions();
    refreshDetails();
  }
  function armAttackMove() {
    if (!canCommand()) return;
    if (
      !S.selected.some((u) => u.f === 0 && u.hp > 0 && u.size === undefined)
    ) {
      message("Select units first");
      return;
    }
    S.command = "attack";
    S.placement = null;
    updateUI();
    message(`Attack-move: ${window.RealmfrontMobile?.touch ? "tap" : "click"} a destination`);
  }
  function stopSelected() {
    if (!canCommand()) return;
    for (const u of S.selected.filter(
      (u) => u.f === 0 && u.size === undefined,
    )) {
      u.move = u.target = u.job = null;
      u.attackMove = false;
      u.hold = true;
    }
    S.command = null;
    message("Units holding position");
    refreshDetails();
  }
  function researchCost(key, level) {
    return Object.fromEntries(
      Object.entries(research[key].cost).map(([k, v]) => [k, v * (level + 1)]),
    );
  }
  function startResearch(id, key) {
    if (id === 0 && !canCommand()) return;
    const f = S.factions[id];
    if (
      f.research ||
      f.tech[key] >= 3 ||
      !S.buildings.some((b) => b.f === id && b.type === "hall" && b.hp > 0)
    )
      return;
    if (!pay(f, researchCost(key, f.tech[key]))) {
      if (id === 0) message("Not enough resources");
      return;
    }
    f.research = { key, progress: 0 };
    if (id === 0) {
      message(`${research[key].name} research started`);
      refreshActions();
    }
  }
  function cancelTraining(b) {
    if (!canCommand() || b.f !== 0 || !b.train.length) return;
    const index = b.train.length - 1, type = b.train.pop(), info = b.queueInfo[index];
    b.queueInfo.length = Math.min(b.queueInfo.length, b.train.length);
    if (info?.worker) b.workers.push(info.worker);
    for (const [k, v] of Object.entries(info?.cost || udefs[type].cost))
      S.factions[b.f].resources[k] += v;
    if (!b.train.length) b.progress = 0;
    message(`${udefs[type].name} refunded`);
    refreshActions();
    refreshDetails();
  }
  function combatDamage(u, target) {
    let amount =
      udefs[u.type].damage *
      (1 + ((u.level || 1) - 1) * 0.2) *
      (1 + (u.type === "worker" ? 0 : S.factions[u.f].tech.weapons * 0.2));
    if (u.type === "spear" && ["cavalry", "raider"].includes(target.type))
      amount *= 1.8;
    if (u.type === "catapult" && target.size !== undefined) amount *= 1.6;
    if (u.type === "raider" && target.type === "worker") amount *= 1.4;
    return amount;
  }
  function simulateWorkerJob(u, dt) {
    const job = u.job,
      t = job.target;
    if (job.kind === "enter") {
      if (!canEnter(u, t)) { u.job = null; u.hold = true; return true; }
      const reach = t.size * 0.6 + 10;
      moveToward(u, t.x, t.y, dt, reach);
      if (dist(u, t) <= reach + 3) enterBuilding(u, t);
      return true;
    }
    if (job.kind === "gather" && t.amount <= 0) {
      const next = nearest(
        S.nodes.filter((n) => n.amount > 0 && n.type === t.type),
        u,
        600,
      );
      u.job = next ? { kind: "gather", target: next } : null;
      return false;
    }
    if (
      job.kind === "repair" &&
      (t.hp <= 0 || t.hp >= t.maxHp || t.f !== u.f)
    ) {
      u.job = null;
      return false;
    }
    u.target = null;
    const reach = job.kind === "repair" ? t.size * 0.6 + 10 : t.r + 12;
    moveToward(u, t.x, t.y, dt, reach);
    if (dist(u, t) > reach + 3) return true;
    u.actionTime = 0.25;
    u.facing = t.x < u.x ? -1 : 1;
    if (job.kind === "gather") {
      const amount = Math.min(
        t.amount,
        dt *
          (t.type === "ore" ? 1.3 : 1.7) *
          (1 + S.factions[u.f].tech.economy * 0.25) *
          (1 + ((u.level || 1) - 1) * 0.2),
      );
      t.amount -= amount;
      t.lastHarvest = S.time;
      S.factions[u.f].resources[t.type === "ore" ? "gold" : "wood"] += amount;
    } else {
      const f = S.factions[u.f];
      const restored = Math.min(
        25 * dt,
        t.maxHp - t.hp,
        f.resources.wood / 0.12,
      );
      t.hp += restored;
      f.resources.wood = Math.max(0, f.resources.wood - restored * 0.12);
    }
    return true;
  }
  function simulateStrategy(dt) {
    S.orderMarkers = S.orderMarkers.filter((m) => S.time - m.time < 1.2);
    for (const f of S.factions) {
      if (!f.alive) {
        f.research = null;
        continue;
      }
      if (f.research) {
        f.research.progress += dt;
        if (f.research.progress >= research[f.research.key].time) {
          const key = f.research.key;
          f.tech[key]++;
          f.research = null;
          if (f.id === 0) {
            log(`${research[key].name} level ${f.tech[key]} completed`);
            message("Research complete");
          }
        }
      }
      if (f.id > 0 && !f.research && S.time > 90) {
        const key = ["weapons", "armor", "economy"].sort(
          (a, b) => f.tech[a] - f.tech[b],
        )[0];
        if (f.resources.gold > 350 && f.resources.wood > 350)
          startResearch(f.id, key);
      }
    }
    for (const p of S.outposts) {
      if (p.owner >= 0 && !S.factions[p.owner].alive) {
        p.owner = -1;
        p.progress = 0;
        p.claimant = -1;
      }
      const nearby = S.units.filter(
        (u) =>
          u.hp > 0 &&
          u.type !== "worker" &&
          S.factions[u.f].alive &&
          dist(u, p) < 110,
      );
      const factions = [...new Set(nearby.map((u) => u.f))];
      p.contested = factions.length > 1;
      if (factions.length === 1 && factions[0] !== p.owner) {
        const claimant = factions[0];
        if (p.claimant !== claimant) {
          p.claimant = claimant;
          p.progress = 0;
        }
        p.progress += dt * Math.min(2, 1 + (nearby.length - 1) * 0.15);
        if (p.progress >= 12) {
          const old = p.owner;
          p.owner = claimant;
          p.progress = 0;
          p.claimant = -1;
          if (claimant === 0 || old === 0)
            log(
              `${p.name} ${claimant === 0 ? "secured!" : "lost to Kingdom " + claimant + "."}`,
            );
        }
      } else if (!p.contested) p.progress = Math.max(0, p.progress - dt);
      if (p.owner >= 0 && !p.contested) {
        S.factions[p.owner].resources.gold += 1.4 * dt;
        S.factions[p.owner].resources.food += 0.8 * dt;
      }
    }
    // Rivals periodically contest the closest crossing, keeping map control active.
    for (const f of S.factions.filter((f) => f.id > 0 && f.alive)) {
      f.captureTimer = (f.captureTimer ?? 45 + f.id * 5) - dt;
      if (f.captureTimer <= 0) {
        f.captureTimer = 35;
        const p = nearest(
          S.outposts.filter((p) => p.owner !== f.id),
          f,
        );
        if (p)
          for (const u of S.units
            .filter(
              (u) =>
                u.f === f.id && u.type !== "worker" && !u.target && !u.move,
            )
            .slice(0, 3)) {
            u.move = { x: p.x + rand(-30, 30), y: p.y + rand(-30, 30) };
            u.attackMove = true;
            u.hold = false;
          }
      }
    }
  }
  function drawStrategy() {
    for (const p of S.outposts) {
      ctx.fillStyle = "#12241d77";
      circle(p.x, p.y, 110);
      ctx.strokeStyle = p.owner < 0 ? "#b9b797" : colors[p.owner];
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 110, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#a99b76";
      ctx.fillRect(p.x - 13, p.y - 8, 26, 26);
      ctx.fillStyle = p.owner < 0 ? "#b9b797" : colors[p.owner];
      ctx.fillRect(p.x - 2, p.y - 44, 4, 42);
      ctx.fillRect(p.x + 2, p.y - 44, 26, 16);
      ctx.font = "bold 12px system-ui";
      ctx.textAlign = "center";
      ctx.fillStyle = "#f0e4bc";
      ctx.fillText(p.name, p.x, p.y + 42);
      ctx.font = "10px system-ui";
      ctx.fillText(
        p.contested
          ? "CONTESTED"
          : p.owner < 0
            ? "CAPTURE WITH TROOPS"
            : "+1.4 gold / +0.8 food",
        p.x,
        p.y + 57,
      );
      if (p.progress > 0) {
        ctx.strokeStyle = colors[p.claimant];
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(
          p.x,
          p.y,
          29,
          -Math.PI / 2,
          -Math.PI / 2 + (Math.PI * 2 * p.progress) / 12,
        );
        ctx.stroke();
      }
    }
    for (const b of S.selected.filter((o) => o.f === 0 && o.rally)) {
      ctx.strokeStyle = "#ebdfa4";
      ctx.lineWidth = 1;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.rally.x, b.rally.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#ebdfa4";
      poly(b.rally.x, b.rally.y, 10, 3, -Math.PI / 2);
    }
    for (const m of S.orderMarkers) {
      ctx.strokeStyle = m.attack ? "#e9a49a" : "#e4e7a8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 12 + (S.time - m.time) * 18, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Startup
  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(frame);
})();
