"use strict";

// Build reference entries from the same balance data used by the simulation.
window.RealmfrontHelp = (() => {
  const { defs, udefs, unitByBuilding, research, combatRules, buildRules, economyRules } = window.RealmfrontData;
  const dialog = document.getElementById("helpDialog");
  const content = document.getElementById("helpContent");
  let hooks = {},
    built = false;
  const cost = (values) =>
    Object.entries(values)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => `${value} ${name}`)
      .join(" · ") || "Free";
  const stat = (name, value) => `<span><b>${name}</b> ${value}</span>`;
  const buildingIcon = (type, d) =>
    `<canvas class="guide-icon" width="64" height="64" data-building-icon="${type}" role="img" aria-label="${d.name} icon"></canvas>`;
  const entry = (icon, name, description, stats, extra = "") =>
    `<article class="guide-entry">${icon}<div class="guide-entry-copy"><p class="guide-description"><strong>${name}</strong> — ${description}</p><div class="guide-stats">${stats}</div>${extra ? `<p class="guide-extra">${extra}</p>` : ""}</div></article>`;
  const mechanics = [
    ["Win", "Destroy every rival Town Hall and protect your own. Choose 2–9 rivals; difficulty changes their training and activity."],
    ["Income", "Farm Houses, Lumber Houses, and Mining Houses each produce a fixed 1 resource/s. Workers stay outside and harvest fields, trees, or deposits. Each worker earns 1/s, or 2/s or 3/s near a matching level-2 or level-3 house. The highest friendly house level within 600 units of the resource applies; houses do not stack."],
    ["Gathering", "Select workers, then tap/right-click fields for food, trees for wood, or deposits for gold. Several workers can share a source; resources deplete. Idle workers seek nearby sources and switch to the same resource type when a source runs out. No carrying or drop-off trips."],
    ["Staffing", "Only military training buildings accept workers: five waiting/retraining spaces each. Resource houses never take workers inside. Release workers sends waiting recruits outside. Occupants still count toward your army."],
    ["Repairs", "Workers repair damaged friendly buildings for 25 HP/s each, costing 0.12 wood per HP. Improved Tools adds 25% repair speed per level. Repairs stop when complete or wood runs out. Use Enter building to enter a damaged military building instead."],
    ["Construction", `Build anywhere on clear land within ${buildRules.workerRadius} units of a living friendly worker. The worker can keep working and need not be selected; workers inside buildings do not provide build range. Placement shows their build circles. Keep clear of terrain, resources, buildings, and crossing circles. See your device controls for placement and cancellation.`],
    ["Training", "Select a training building, inspect a unit card, then press Train. Inspecting never buys a unit, even when Train is unavailable. Each building trains one at a time and queues up to five. Cancel Last Recruit refunds the last queued recruit. Only Town Halls train workers."],
    ["Worker retraining", "With a worker inside a military building, Train converts that worker first. Pay only the price difference from a worker; training time stays the same. Its level, health percentage, and population slot are preserved. Canceling returns it to the waiting staff."],
    ["Army capacity", "Workers and fighters share a 100-unit limit. Upgrade your Town Hall for 20 / 60 / 100 army slots at levels 1 / 2 / 3; there is no House building. New recruits reserve slots; retraining reuses existing slots."],
    ["Combat", "Attack-move fights enemies along the route, then continues. Ranged units stand and fire without retreating automatically. Stop cancels current orders; nearby attacks can trigger local defense. Herbalists heal allies. Spearmen deal +80% damage to cavalry, raiders +40% to workers, and catapults +60% to buildings with splash damage. Enemy kills award gold."],
    ["Detection and defense", `Fighters in every kingdom share ${combatRules.detectionRange}-unit enemy detection; weapon reach stays different for each unit. Workers never detect, attack, or retaliate against enemies. When an ally or building is hit, military units within ${combatRules.defenseRadius} units respond locally. Distant battles do not call home defenders. Workers keep working; interrupted military orders resume afterward.`],
    ["Rally points", "Select a training building and order a ground destination, or use Set Rally Point. New recruits go there automatically; fighters use attack-move. Clear Rally removes the destination."],
    ["Crossings", "Military units, including healers, capture crossings; workers cannot. Capture takes 12 seconds with one unit, up to twice as fast with support. Each held crossing earns 1.4 gold and 0.8 food/s. Rival units inside the circle stop capture and income."],
    ["Upgrades", "Use Upgrade to improve selected fighters or buildings, up to level 3. Workers cannot level up; retrain them at a military building before upgrading the fighter. Batch upgrades affect affordable, eligible selections. Prices appear in the details panel; exact bonuses and costs are below."],
    ["Selling and losses", "Sell returns 50% of purchase and upgrade costs, plus all paid queue costs. Occupants leave safely. Town Halls cannot be sold. Destruction also releases occupants, but queued costs are lost. Mobile selling asks for confirmation."],
    ["Terrain and expansion", "Starts and terrain scale with player count. Coastal barriers force armies inland; paths to every kingdom and crossing stay open. Cliffs block movement and building, but give no height bonus; ranged shots can cross them. The sea is impassable and the map has no fog of war."],
    ["Fair resources", "Each kingdom starts with 12 trees and two 1,200-gold deposits. Each neighboring pair shares an 18-tree forest and three 2,400-gold deposits, with similar walking distances from both starts. Three central crossings offer more neutral resources. Expand and defend workers; capturing a crossing does not claim its deposits."],
    ["Pause and speed", "Pause stops the battle, orders, and purchases. Speed cycles through 1×, 2×, and 3×. Help pauses a running battle and restores its previous pause state when closed."],
  ];
  const advancedMechanics = [
    ["Unit levels", "Fighter levels add 25% base HP, 20% base damage, and 5% base speed per level. Healers gain 20% healing per level. Workers stay level 1 and use nearby resource-house levels for gathering."],
    ["Building levels", "Most buildings gain 25% base HP per level. Resource houses set nearby matching worker output to their level (1 / 2 / 3 per second), while their own income stays 1/s. Training speed gains 15% per level. Town Hall capacity is 20 / 60 / 100. Watchtowers and Keeps instead gain 250 HP, 25 range, and stronger, faster shots per level. Upgrades preserve damage already taken."],
    ["Upgrade prices", "Most upgrades cost 60% of the base price × current level, rounded up. Town Halls: (200 gold + 200 wood) × level. Defenses: (100 gold + 80 wood) × level. Sell refunds round down."],
    ["Income bonuses", "A worker uses the highest matching house level within 600 units of its resource: 1 / 2 / 3 per second. Without a house the worker earns 1/s. Distance, ownership, destruction, and upgrades take effect immediately. Research and worker levels do not multiply resource income."],
    ["Capture support", "Each extra military unit adds 15% capture speed, capped at 2×."],
  ];
  const mobileControls = [
    ["Select", "Tap a unit or building. Hold for 0.3 seconds, then drag a box to select several friendly units."],
    ["Pan / zoom", "Swipe to pan. Use two fingers to pan or pinch to zoom."],
    ["Give orders", "With units selected, tap ground to move or an enemy to attack. Workers tap fields/trees/ore to gather, or military buildings to enter. Damaged friendly buildings are repaired first."],
    ["Build", "Choose a building card, tap land to preview, then Build here to confirm. Cancel or Deselect exits placement."],
    ["Train", "Select a training building, tap a unit card to inspect it, then press Train."],
    ["Attack / Stop", "Attack, then tap ground for attack-move. Stop holds selected units in place."],
    ["More commands", "Scroll selection details for Upgrade, Sell, Enter building, and rally commands. Building info & commands returns from a recruit preview."],
    ["Deselect", "Clear selection and targeting; return to construction. Existing orders continue."],
  ];
  const desktopControls = [
    ["Left-click", "Select one unit/building, or place a chosen building."],
    ["Train", "Select a training building, click a unit card to inspect it, then press Train."],
    ["Left / middle drag", "Pan the map."],
    ["Right-click", "Move, attack, gather, repair, enter a building, or set a rally point."],
    ["Right-drag", "Box-select friendly units. A quick click gives an order even with slight movement."],
    ["Shift + selection", "Add units with Shift-click or Shift-right-drag."],
    ["Ctrl / Shift + placement", "Keep placing the same building; each placement pays its cost."],
    ["Scroll / arrow keys", "Zoom / pan the camera."],
    ["A, then click ground", "Attack-move: engage enemies along the route."],
    ["S / U / L", "Stop / upgrade / sell selected owned units or buildings."],
    ["Q", "Select all your deployed fighters, excluding workers."],
    ["M / H", "Show the full map / return to your base."],
    ["Ctrl+1–9 / 1–9", "Save / recall a group of living units."],
    ["Space / Esc", "Pause or resume / deselect and cancel targeting. Esc closes Help first when open."],
  ];
  const selectionControls = [
    ["Double-click/tap a fighter", "Select deployed fighters of the same type and kingdom; workers excluded."],
    ["Triple or more on a fighter", "Select all deployed fighters of that kingdom; workers always excluded."],
    ["Double or more on a worker", "Select all deployed workers of that kingdom; fighters always excluded."],
    ["Double-click/tap a building", "Select buildings of the same type and kingdom."],
  ];

  const summaries = {
    worker: "Noncombat worker: farms, chops, mines, repairs, or retrains. No direct upgrades.",
    raider: "Fast cavalry; +40% damage to workers.",
    hall: "Recruits workers and researches upgrades. Upgrade for 20 / 60 / 100 army slots. Protect it.",
    farm: "Fixed 1 food/s; its level sets nearby field workers to 1 / 2 / 3 food/s each.",
    lumber: "Fixed 1 wood/s; its level sets nearby lumber workers to 1 / 2 / 3 wood/s each.",
    mine: "Fixed 1 gold/s; its level sets nearby miners to 1 / 2 / 3 gold/s each.",
  };
  const controlList = (rows) => `<dl class="guide-controls">${rows.map(([key, desc]) => `<div><dt>${key}</dt><dd>${desc}</dd></div>`).join("")}</dl>`;
  function controlsHtml() {
    const mobile = { id: "mobile", name: "Phone & tablet", rows: mobileControls,
      note: "Landscape required. Fullscreen expands the view; returning from another app requires Resume." };
    const desktop = { id: "desktop", name: "Desktop", rows: desktopControls, note: "The cursor shows your action: axe for wood, pickaxe for gold, hoe for farming, hammer for repairs, sword for attack." };
    const groups = window.RealmfrontMobile?.touch ? [mobile, desktop] : [desktop, mobile];
    return `<h3>Controls</h3><p class="guide-note">Full Map / Base switches between the whole island and your home base.</p>${groups.map((group, index) => `<details class="guide-control-group" data-control-device="${group.id}"${index === 0 ? " open" : ""}><summary>${group.name}</summary><p class="guide-note">${group.note}</p>${controlList(group.rows)}</details>`).join("")}<h4>Multi-selection · both devices</h4>${controlList(selectionControls)}`;
  }

  function build() {
    const units = Object.entries(udefs)
      .map(([type, d]) => {
        const producer = Object.entries(unitByBuilding).filter(([, types]) => types.includes(type))
          .map(([building]) => defs[building].name).join(", ");
        const stats = [
          stat("Cost", cost(d.cost)),
          stat("HP", d.hp),
          ...(type === "worker" ? [] : [stat(d.kind === "healer" ? "Heal" : "Damage", d.kind === "healer" ? "27 HP" : d.damage), stat("Range", d.range)]),
          stat("Speed", `${d.speed}/s`),
          stat("Train", `${d.time}s`),
          ...(type === "worker" ? [] : [stat("Cooldown", `${d.cool}s`)]),
          ...(d.armor ? [stat("Armor", `${Math.round(d.armor * 100)}%`)] : []),
        ].join("");
        return entry(
          `<canvas class="guide-icon" width="64" height="64" data-unit-icon="${type}" role="img" aria-label="${d.name} icon"></canvas>`,
          d.name,
          summaries[type] || d.desc,
          stats,
          `Train at: ${producer}.`,
        );
      })
      .join("");
    const buildings = Object.entries(defs)
      .map(([type, d]) => {
        const stats = [
          stat(
            "Cost",
            type === "hall" ? "Starting only" : cost(d.cost),
          ),
          stat("HP", d.hp),
        ];
        if (d.cap) stats.push(stat("Capacity", economyRules.hallCapacity.join(" / ")));
        if (d.workerSlots) stats.push(stat("Workers", d.workerSlots));
        if (d.rate)
          for (const [resource, rate] of Object.entries(d.rate))
            stats.push(stat("Income", `${rate} ${resource}/s`));
        if (d.damage)
          stats.push(
            stat("Damage", d.damage),
            stat("Range", d.range),
            stat("Cooldown", `${d.cool}s`),
          );
        let extra = unitByBuilding[type]
          ? `Trains: ${unitByBuilding[type].map((t) => udefs[t].name).join(", ")}.`
          : "";
        if (type === "hall")
          extra += " Cannot be bought or sold.";
        return entry(
          buildingIcon(type, d),
          d.name,
          summaries[type] || d.desc,
          stats.join(""),
          extra,
        );
      })
      .join("");
    const upgrades = Object.entries(research)
      .map(([key, d]) =>
        entry(
          '<span class="guide-icon guide-research-icon" aria-hidden="true">✦</span>',
          d.name,
          key === "armor" ? "+10 percentage points of armor per level." : d.desc,
          stat("Level 1", cost(d.cost)) + stat("Time", `${d.time}s`),
        ),
      )
      .join("");
    content.innerHTML = `<section id="guide-basics"><h3>Mechanics</h3><div class="guide-mechanics">${mechanics.map(([name, desc]) => `<p><strong>${name}</strong> — ${desc}</p>`).join("")}</div><details class="guide-advanced"><summary>Exact upgrade bonuses &amp; costs</summary><div class="guide-mechanics">${advancedMechanics.map(([name, desc]) => `<p><strong>${name}</strong> — ${desc}</p>`).join("")}</div></details></section>
      <section id="guide-units"><h3>Units <small>${Object.keys(udefs).length} types</small></h3><p class="guide-note">Level-1 stats before upgrades and research.</p><div class="guide-grid">${units}</div></section>
      <section id="guide-buildings"><h3>Buildings <small>${Object.keys(defs).length} types</small></h3><p class="guide-note">Level-1 stats; income is per game second.</p><div class="guide-grid">${buildings}</div></section>
      <section id="guide-research"><h3>Town Hall research</h3><p class="guide-note">Select a Town Hall, then choose a research card. Three levels each; one project per kingdom at a time. Costs are ×1, ×2, then ×3; duration stays the same. Bonuses affect existing and future units/buildings. Armor caps at 65% damage reduction.</p><div class="guide-grid">${upgrades}</div></section>
      <section id="guide-controls">${controlsHtml()}</section>`;
    built = true;
    drawIcons();
    window.RealmfrontBuildings?.ready.then(drawIcons);
    const sheets = window.RealmfrontSprites?.sheets;
    if (sheets)
      Promise.allSettled(
        [...sheets.values()].map((s) => s.image.decode()),
      ).then(drawIcons);
  }
  function drawIcons() {
    window.RealmfrontBuildings?.paintIcons(content);
    for (const canvas of content.querySelectorAll("[data-unit-icon]")) {
      const ctx = canvas.getContext("2d"),
        type = canvas.dataset.unitIcon;
      ctx.clearRect(0, 0, 64, 64);
      ctx.fillStyle = "#122322";
      ctx.fillRect(0, 0, 64, 64);
      if (type === "catapult") {
        ctx.strokeStyle = "#c8ac7b";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(18, 45);
        ctx.lineTo(32, 22);
        ctx.lineTo(44, 44);
        ctx.moveTo(29, 39);
        ctx.lineTo(46, 12);
        ctx.stroke();
        ctx.fillStyle = "#8c7554";
        ctx.fillRect(12, 40, 42, 9);
        ctx.fillStyle = "#c4d0c4";
        for (const x of [20, 46]) {
          ctx.beginPath();
          ctx.arc(x, 51, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const u = {
          type,
          id: 1,
          f: 0,
          x: 32,
          y: 43,
          facing: 1,
          anim: 0,
          actionTime: 0,
          movedAt: -1,
        };
        if (!window.RealmfrontSprites?.draw(ctx, u, 0, "#77b9e5")) {
          ctx.fillStyle = "#e9d9ac";
          ctx.font = "30px Georgia";
          ctx.textAlign = "center";
          ctx.fillText("♟", 32, 43);
        }
      }
    }
  }
  function open() {
    if (dialog.open) return;
    if (!built) build();
    else document.getElementById("guide-controls").innerHTML = controlsHtml();
    hooks.onOpen?.();
    dialog.showModal();
    content.scrollTop = 0;
  }
  function close() {
    if (dialog.open) dialog.close();
  }
  document.getElementById("help").onclick = open;
  document.getElementById("startHelp").onclick = open;
  document.getElementById("closeHelp").onclick = close;
  dialog.addEventListener("close", () => {
    hooks.onClose?.();
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        close();
    }
  });
  document
    .querySelectorAll("[data-guide-section]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        document
          .getElementById(`guide-${button.dataset.guideSection}`)
          .scrollIntoView({ block: "start" }),
      ),
    );
  return {
    open,
    close,
    get isOpen() {
      return dialog.open;
    },
    setup(value) {
      hooks = value;
    },
  };
})();
