"use strict";

// Build reference entries from the same balance data used by the simulation.
window.RealmfrontHelp = (() => {
  const { defs, udefs, unitByBuilding, research } = window.RealmfrontData;
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
    [
      "Building income and worker staffing",
      "Each Farm produces exactly 1 food/s, Lumber Camp 1 wood/s, and Gold Mine 1 gold/s without staff. One worker can enter each resource building to add 1/s before bonuses. Right-click a healthy friendly building with workers selected, or use Enter building and choose it; a normal right-click on a damaged building repairs it first. The bonus begins only once the worker arrives inside. Worker levels add 20% per level to the bonus; building upgrades and Improved Tools add 25% per level to the bonus, without increasing the unstaffed base. Select the building to see income and worker spaces, or use Release workers. Inside workers still count toward population. A W badge marks occupied buildings. Rivals also staff their resource buildings.",
    ],
    [
      "Workers, houses, and military retraining",
      "Both Houses and Town Halls recruit workers for 30 food and 15 gold, taking 6 seconds at base speed. Military buildings accept up to five waiting or retraining workers. Send workers inside, select the building, then choose a military unit card: a waiting worker retrains into that role first. Its existing population slot is reused, and the base worker price is credited against the new role's cost. For example, an Archer conversion costs 10 food and 40 gold and takes the usual 9 seconds. Unit level and health proportion are preserved. Empty military buildings still offer ordinary recruitment at full cost and population requirements. Conversion and normal recruitment share the five-entry queue. Cancel Last Recruit refunds the amount paid and returns a converting worker to the building's waiting workers. Release workers lets waiting workers leave. Selling or destruction returns occupants safely outside; selling refunds paid queue costs, while destruction loses them.",
    ],
    [
      "Forests and contested gold",
      "Trees grow in compact forests with a few outlying trees, leaving open valleys and clear roads. Each kingdom starts beside a 12-tree grove and two gold deposits holding 1,200 gold each. Richer veins contain three deposits of 2,400 gold each: one vein near each crossing, plus frontier veins between neighboring active kingdoms. Total gold deposits scale from 21 with two enemies to 56 with nine enemies. Expand toward these veins and defend your miners; gold deposits are shared gathering sites, and do not transfer ownership when a crossing is captured. Resources stay clear of starting buildings, roads, cliffs, and capture circles.",
    ],
    [
      "Context cursors and worker tools",
      "The cursor changes with your selection and target. With workers selected, an axe means chop lumber, a pickaxe means mine gold, and a hammer means repair a damaged friendly building. Right-click to assign the displayed job. Workers carry and swing that tool while doing the task; the selection panel reports their current work. Other cursors indicate selecting, moving, attacking, rally points, construction, or blocked terrain. Dragging the map shows a grabbing hand.",
    ],
    [
      "Ten kingdoms, highlands, and valleys",
      "Choose 2–9 rivals in the start menu, for up to ten kingdoms including you. Long, narrow ridges and rocky hollows shape branching valleys and flanking routes. The terrain adapts to the number of kingdoms: fewer kingdoms get longer ranges; crowded matches get shorter segments and more open ground around settlements. Gaps between landforms let armies pass. Cliffs and hollows block movement and construction; units automatically navigate around them. Every settlement and crossing remains reachable. Roads and the minimap show routes and obstacles. Ground orders aimed at an obstacle move to nearby passable ground. Elevation is scenery and gives no combat bonus; ranged units can fire across narrow obstacles when targets are within range.",
    ],
    [
      "Mobile, landscape, and fullscreen",
      "Phones and tablets must be in landscape. The battlefield stays on the left, with selection details and build/recruit cards on the right. Hold one finger still for 0.3 seconds, then drag a box to select friendly units. A quick drag pans the map; two fingers pan and pinch to zoom. Tap a friendly unit to select it. With units selected, tap empty ground to move, enemies to attack, or resources to gather with workers. Workers can tap friendly buildings to repair or enter them. Deselect clears the selection and targeting. Use the right panel's Attack and Stop buttons and scroll details for more commands. Deselect returns to the construction roster. Equal-sized cards show icons, costs, and brief summaries; full descriptions and base stats appear above. Tap a building card to start placement. Tap a unit card to view details without buying; press Train beside its name to queue one recruit or worker conversion. Unavailable units remain inspectable; Train shows the blocking reason. Building info & commands restores a training building's controls from a recruit preview. The top bar provides a Full Map/Base toggle, speed, Pause/Resume, Fullscreen, and Help. Full Map shows the entire island; Base returns to your home base at local zoom. Unlocking cheats adds Cheats at the far right. Construction remains tap-to-preview, then Build here to confirm. Backgrounding pauses until Resume; rotating to portrait preserves manual pause.",
    ],
    [
      "Win the skirmish",
      "Destroy every rival Town Hall. Losing your own Town Hall ends the match. Rivals build, research, raid, and fight one another as well as you. Difficulty increases enemy income and activity.",
    ],
    [
      "Resources and workers",
      "Gold, food, and wood pay for buildings, recruits, research, and upgrades. Farms, lumber camps, and mines produce automatically. Idle workers seek nearby pine trees and golden faceted rock deposits; right-click a resource to assign them directly. Trees animate while chopping and leave stumps when depleted; mined-out ore becomes ordinary rubble. Base gathering is 1.7 wood or 1.3 gold per second. Depleted deposits are replaced by nearby deposits of the same type when available. Food is a purchase cost, not ongoing upkeep.",
    ],
    [
      "Repairs",
      "Select workers and right-click a damaged friendly building. Each worker restores up to 25 HP per second, spending 0.12 wood per HP. Repairs stop when the building is restored or no wood remains.",
    ],
    [
      "Construction",
      "Click empty ground for the construction menu. Buildings appear immediately on valid land within 850 units of your starting base; no worker is required. Keep clear of buildings, resources, crossings, and hostile structures. Hold Ctrl during each placement click to buy multiple copies; release it for the last one. Shift also repeats placement; Esc cancels.",
    ],
    [
      "Army limit: 100",
      "Workers and military units, including workers inside buildings, share population capacity. The Town Hall starts with 12 slots; each House adds 8 at level 1. Housing and upgrades increase capacity, but each faction has a hard maximum of 100. Ordinary queued recruits reserve slots; worker conversions reuse existing slots and can finish at the cap. Losing or selling housing can block new recruitment until capacity recovers; existing units remain.",
    ],
    [
      "Recruitment and rally points",
      "Select a recruitment building to buy its units. Each building trains one at a time with a maximum queue of five. Cancel Last Recruit fully refunds the last queued unit. Select a recruitment building and right-click valid ground to set a rally point; recruits move there automatically, and military recruits use attack-move.",
    ],
    [
      "Combat and orders",
      "Right-click an enemy to attack or empty ground to move. A then click issues attack-move: troops engage nearby targets and continue toward the destination afterward. Ranged units stand and fire when enemies are in range; they do not automatically retreat. The Stop button stops selected units in place, where they can defend without chasing. Herbalists heal wounded allies rather than attack. Shield Guards start with 25% damage reduction.",
    ],
    [
      "Unit counters",
      "Spearmen deal 80% extra damage to cavalry and raiders. Catapults deal 60% extra damage to buildings and splash nearby enemies. Raiders deal 40% extra damage to workers. Destroyed enemies give the player a small gold bounty.",
    ],
    [
      "Capture crossings",
      "Keep military units, including healers, within a crossing's circle to capture it. One unit takes 12 seconds; each extra unit adds 15% capture speed, up to twice the base rate. Workers cannot capture. Each owned crossing produces 1.4 gold and 0.8 food per second. Multiple factions inside the circle contest it, stopping capture and income.",
    ],
    [
      "Individual upgrades: U",
      "Select units or buildings and press U, or use Upgrade. Maximum level is 3. Batch upgrades apply to affordable eligible selections. Most upgrades cost 60% of base purchase costs times the current level, rounded up; Town Halls cost 200 gold and 200 wood times the level, and defenses cost 100 gold and 80 wood times the level.",
    ],
    [
      "Upgrade effects",
      "Each unit level adds 25% of base maximum health, 20% base damage, and 5% base speed. Workers also gain 20% gathering/staffing output per level and healers restore 20% more health. Most buildings gain 25% base health per level; economic buildings improve their staffed bonus by 25% and recruitment buildings gain 15% training speed. The unstaffed resource base stays 1/s. Capacity buildings gain half their base capacity per level. Watchtowers and Keeps instead gain 250 HP, 25 range, and increased damage and firing speed per level. Upgrade health increases preserve existing damage.",
    ],
    [
      "Selection and selling: L",
      "A single tap/click selects one unit. Double a fighting unit to select all deployed fighters of that kingdom; triple it to include deployed workers. Double a worker to select all deployed workers. Double a building selects matching buildings of its kingdom. Deselect or Esc clears the selection. Sell selected owned units or buildings with L or Sell for 50% of purchase and upgrade costs, rounded down per resource. Paid queue costs are refunded and occupants released. Town Halls cannot be sold. Selling on touch asks for confirmation.",
    ],
    [
      "Map and camera",
      "The island is 6,600 × 4,900. The surrounding sea is decorative: units, buildings, and rally destinations cannot enter it. M fits the whole island and sea border; H returns to a close view of your base. Click the minimap to reposition the camera. The whole battlefield is visible; there is no fog of war.",
    ],
    [
      "Territory and expansion",
      "Starting kingdoms are evenly spaced around an inset coast for the selected player count. Even-sized matches have mirrored opposite starts. Cliffs connect to the sea between neighbors, so coastal shortcuts lead inland around a pass. Larger matches add more ridges and deeper coastal barriers. Each kingdom starts with the same 12-tree grove and two gold deposits, and shares two frontier expansions with its neighbors. Each frontier has three rich gold deposits and an 18-tree forest; placement compares actual walking routes to keep both approaches similar. Three central crossings offer more neutral gold and woodland to conquer. Starts, expansion clearings, and approaches remain open.",
    ],
    [
      "Pause and speed",
      "Space or Pause pauses the battle. The speed button cycles 1×, 2×, and 3×. Orders and purchases are blocked while paused. This guide pauses a running game and restores its previous pause state when closed.",
    ],
  ];
  const controls = [
    ["Left-click", "Select a unit or building; place a chosen building."],
    ["Left-drag / middle-drag", "Pan the map."],
    [
      "Right-drag",
      "Box-select friendly units. Quick right-clicks tolerate a little dragging and issue orders instead. Hold and drag for a small selection, or drag a larger box.",
    ],
    ["Shift-click / Shift-right-drag", "Add units to your selection."],
    ["Double-click/tap", "Fighter: all fighters. Worker: all workers. Building: matching buildings of that kingdom."],
    ["Triple-click/tap a fighter", "Select all deployed units of that kingdom, including workers."],
    ["Hold, then drag on touch", "After 0.3 seconds, drag a marquee to select friendly units. Quick swipes pan instead."],
    [
      "Right-click",
      "Move, attack, gather, repair, or set a building rally point.",
    ],
    [
      "Ctrl-click during placement",
      "Keep buying and placing the chosen building.",
    ],
    [
      "Arrow keys",
      "Pan the camera. A is reserved for attack-move, S for stop, and L for selling.",
    ],
    ["Scroll / M / H", "Zoom / full map / close view of your base."],
    [
      "Q / A then click / S",
      "Select all soldiers / attack-move / stop and hold.",
    ],
    ["U / L", "Upgrade / sell the selected owned entities."],
    ["Ctrl+1–9 / 1–9", "Save / recall groups of living units."],
    [
      "Space / Esc",
      "Pause or resume / deselect units and buildings and cancel targeting or placement. Esc closes this guide first when it is open.",
    ],
  ];

  function build() {
    const units = Object.entries(udefs)
      .map(([type, d]) => {
        const producer = Object.entries(unitByBuilding).filter(([, types]) => types.includes(type))
          .map(([building]) => defs[building].name).join(", ");
        const stats = [
          stat("Cost", cost(d.cost)),
          stat("HP", d.hp),
          stat("Damage", d.damage),
          stat("Range", d.range),
          stat("Speed", d.speed),
          stat("Train", `${d.time}s`),
          stat("Reload", `${d.cool}s`),
        ].join("");
        const special =
          type === "healer"
            ? "Restores 27 HP per heal at level 1."
            : type === "raider"
              ? "Deals 40% bonus damage to workers."
              : type === "guard"
                ? "Starts with 25% damage reduction."
                : "";
        return entry(
          `<canvas class="guide-icon" width="64" height="64" data-unit-icon="${type}" role="img" aria-label="${d.name} icon"></canvas>`,
          d.name,
          d.desc,
          stats,
          `Recruited at: ${producer}. ${special}`,
        );
      })
      .join("");
    const buildings = Object.entries(defs)
      .map(([type, d]) => {
        const stats = [
          stat(
            "Cost",
            type === "hall" ? "Starting building only" : cost(d.cost),
          ),
          stat("HP", d.hp),
        ];
        if (d.cap) stats.push(stat("Capacity", `+${d.cap}`));
        if (d.rate)
          for (const [resource, rate] of Object.entries(d.rate))
            stats.push(stat("Income", `${rate} ${resource}/s`));
        if (d.damage)
          stats.push(
            stat("Damage", d.damage),
            stat("Range", d.range),
            stat("Reload", `${d.cool}s`),
          );
        let extra = unitByBuilding[type]
          ? `Recruits: ${unitByBuilding[type].map((t) => udefs[t].name).join(", ")}.`
          : "";
        if (type === "hall")
          extra += " Researches faction upgrades. Cannot be sold or purchased.";
        return entry(
          buildingIcon(type, d),
          d.name,
          d.desc,
          stats.join(""),
          extra,
        );
      })
      .join("");
    const upgrades = Object.values(research)
      .map((d) =>
        entry(
          '<span class="guide-icon guide-research-icon" aria-hidden="true">✦</span>',
          d.name,
          d.desc,
          stat("First level", cost(d.cost)) + stat("Time", `${d.time}s`),
        ),
      )
      .join("");
    content.innerHTML = `<section id="guide-basics"><h3>Game mechanics</h3><div class="guide-mechanics">${mechanics.map(([name, desc]) => `<p><strong>${name}</strong> — ${desc}</p>`).join("")}</div></section>
      <section id="guide-units"><h3>Units <small>${Object.keys(udefs).length} types</small></h3><p class="guide-note">Base level 1 stats. Individual upgrades and faction research improve these values.</p><div class="guide-grid">${units}</div></section>
      <section id="guide-buildings"><h3>Buildings <small>${Object.keys(defs).length} types</small></h3><p class="guide-note">Base level 1 stats. Income is per game second before upgrades.</p><div class="guide-grid">${buildings}</div></section>
      <section id="guide-research"><h3>Town Hall research</h3><p class="guide-note">Three levels per technology; one project per faction at a time. Level 2 costs twice the first level, and level 3 costs three times as much. Duration stays the same. Bonuses apply to existing and future units/buildings. Armor adds 10 percentage points of unit damage reduction per level, up to 65% total reduction.</p><div class="guide-grid">${upgrades}</div></section>
      <section id="guide-controls"><h3>Controls</h3><dl class="guide-controls">${controls.map(([key, desc]) => `<div><dt>${key}</dt><dd>${desc}</dd></div>`).join("")}</dl></section>`;
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
