const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

function game() {
  const elements = new Map();
  const listeners = {};
  const context = new Proxy({}, { get: (o, k) => o[k] ?? (() => {}) });
  function element(id = "") {
    return {
      value: id === "enemyCount" ? "2" : "1",
      textContent: "",
      children: [],
      listeners: {},
      classList: { add() {}, remove() {}, toggle() {} },
      getContext: () => context,
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 1000,
        height: 650,
      }),
      addEventListener(k, fn) {
        this.listeners[k] = fn;
      },
      append(...items) {
        this.children.push(...items);
      },
      appendChild(item) {
        this.children.push(item);
      },
      setPointerCapture() {},
      setAttribute() {},
    };
  }
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element(id));
      return elements.get(id);
    },
    createElement: () => element(),
    activeElement: { tagName: "BODY" },
  };
  let seed = 1,
    now = 0;
  const math = Object.create(Math);
  math.random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const sandbox = {
    document,
    Math: math,
    devicePixelRatio: 1,
    window: {
      addEventListener(k, fn) {
        listeners[k] = fn;
      },
    },
    requestAnimationFrame() {},
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    performance: { now: () => now },
  };
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(root, "js/data.js"), "utf8"),
    sandbox,
  );
  vm.runInContext(
    fs.readFileSync(path.join(root, "js/world.js"), "utf8"),
    sandbox,
  );
  vm.runInContext(
    fs.readFileSync(path.join(root, "js/terrain.js"), "utf8"),
    sandbox,
  );
  vm.runInContext(
    fs.readFileSync(path.join(root, "js/resource-layout.js"), "utf8"),
    sandbox,
  );
  // Expose internals only in this in-memory test copy; production has no debug globals.
  let source = fs.readFileSync(path.join(root, "js/game.js"), "utf8");
  source = source.replace(
    "  // Startup",
    `window.testGame = { get state(){return S}, init, tick, simulateUnits, simulateBuildings, simulateShots, seekTarget, simulateStrategy, issueMove, startResearch, train, cancelTraining, combatDamage, addUnit, addBuilding, updateUI, drawWorld, drawMini, frame, camera, mouse, stopSelected, togglePause, selectSameType, selectClicked, upgradeSelected, sellSelected, placeBuilding, upgradeCost, sellValue, capacity, buildingIncome, enterBuilding, releaseWorker, trainingCost, pendingPop, hit, fitMap, viewport, world, terrain, validPlace, moveToward, grantArmySlots, cursorAction, resourceAt };\n  // Startup`,
  );
  vm.runInContext(source, sandbox);
  const api = sandbox.window.testGame;
  api.init();
  return {
    ...api,
    get state() {
      return api.state;
    },
    document,
    listeners,
    api,
    data: sandbox.window.RealmfrontData,
    advanceTime(ms) {
      now += ms;
    },
  };
}

function combatGame() {
  const g = game();
  g.state.units = []; g.state.buildings = []; g.state.nodes = []; g.state.selected = [];
  for (const faction of g.state.factions) { faction.pop = 0; faction.cap = 100; }
  return g;
}

test("live HUD updates preserve action and selection command buttons", () => {
  const g = game(), actions = g.document.getElementById("actions");
  const first = actions._actionRows[0].btn;
  g.state.factions[0].resources.wood = 0;
  g.updateUI();
  assert.equal(actions._actionRows[0].btn, first);
  assert.equal(first.disabled, true);
  g.state.selected = [g.state.units.find((u) => u.f === 0 && u.type === "sword")];
  g.updateUI();
  const commands = g.document.getElementById("detailCommands"), count = commands._commandRows.length;
  const command = commands._commandRows[0];
  for (let i = 0; i < 4; i++) g.updateUI();
  assert.equal(commands._commandRows.length, count);
  assert.equal(commands._commandRows[0], command);
  g.togglePause();
  assert(actions._actionRows.every((row) => row.btn.disabled));
  assert(commands._commandRows.every((button) => button.disabled));
});

test("resource buildings produce exactly one per second without staff, even after upgrades", () => {
  const g = game(), s = g.state, f = s.factions[0];
  for (const b of s.buildings.filter((b) => b.f === 0)) b.level = 3;
  f.tech.economy = 3;
  s.difficulty = 2;
  const before = { ...f.resources }, rival = { ...s.factions[1].resources };
  g.simulateBuildings(1);
  for (const resource of ["food", "wood", "gold"]) {
    assert.equal(f.resources[resource] - before[resource], 1);
    assert.equal(s.factions[1].resources[resource] - rival[resource], 1);
  }
});

test("resource houses never accept workers; outdoor gathering scales by matching house level", () => {
  for (const [houseType, nodeType, resource] of [["farm", "field", "food"], ["mine", "ore", "gold"], ["lumber", "tree", "wood"]]) {
    const g = combatGame(), s = g.state, f = s.factions[0];
    const b = g.addBuilding(0, houseType, 650, 650, true);
    const u = g.addUnit(0, "worker", 780, 650, true);
    const node = {type:nodeType, x:800, y:650, r:34, amount:1000, max:1000};
    s.nodes = [node];
    assert.equal(g.enterBuilding(u,b), false, "workers cannot enter resource houses");
    assert.equal(b.workers.length,0);
    for (let level=1;level<=3;level++) {
      b.level=level; s.selected=[u]; g.issueMove(node.x,node.y);
      assert.equal(u.job.kind,"gather");
      const before=f.resources[resource], left=node.amount;
      g.simulateUnits(1); g.simulateBuildings(1);
      assert.equal(f.resources[resource]-before,1+level, resource+" passive plus outdoor gathering");
      assert.equal(left-node.amount,level);
      assert(s.units.includes(u));
    }
    f.tech.economy=3;
    const before=f.resources[resource]; g.simulateUnits(1); g.simulateBuildings(1);
    assert.equal(f.resources[resource]-before,4,"research never changes the exact level-based output");
  }
});

test("gathering uses the highest nearby owned matching house, without stacking, and falls back after loss", () => {
  const g=combatGame(),s=g.state,f=s.factions[0];
  const worker=g.addUnit(0,"worker",880,650,true);
  const node={type:"ore",x:900,y:650,r:20,amount:100,max:100}; s.nodes=[node];
  const own=g.addBuilding(0,"mine",300,650,true); own.level=2;
  const duplicate=g.addBuilding(0,"mine",450,650,true); duplicate.level=3;
  const wrong=g.addBuilding(0,"lumber",800,650,true);wrong.level=3;
  const enemy=g.addBuilding(1,"mine",900,720,true);enemy.level=3;
  const far=g.addBuilding(0,"mine",1501,650,true);far.level=3;
  s.selected=[worker];g.issueMove(node.x,node.y);
  const gather=(expected)=>{const before=f.resources.gold;g.simulateUnits(1);assert.equal(f.resources.gold-before,expected);};
  gather(3); duplicate.hp=0;gather(2); // exact 600-unit boundary
  own.x=299;gather(1);own.x=300;own.level=3;gather(3);
  own.f=1;gather(1);
  node.amount=.5;gather(.5);assert.equal(node.amount,0,"finite nodes cannot be overdrawn");
});

test("each outdoor worker earns the matching house level while its base income stays one", () => {
  const g=combatGame(),s=g.state,f=s.factions[0];
  const house=g.addBuilding(0,"farm",650,650,true);house.level=2;
  const a=g.addUnit(0,"worker",780,650,true),b=g.addUnit(0,"worker",820,650,true);
  const field={type:"field",x:800,y:650,r:34,amount:100,max:100};s.nodes=[field];
  s.selected=[a,b];g.issueMove(field.x,field.y);
  const before=f.resources.food;g.simulateUnits(1);g.simulateBuildings(1);
  assert.equal(f.resources.food-before,5,"1 passive + 2 from each of two farmers");
  assert.equal(field.amount,96);assert.equal(house.workers.length,0);
});

test("Town Halls alone recruit workers and upgrade capacity to 20, 60, and 100", () => {
  const g=game(),s=g.state,f=s.factions[0],hall=s.buildings.find(b=>b.f===0&&b.type==="hall");
  assert.equal(g.data.defs.house,undefined);assert(!s.buildings.some(b=>b.type==="house"));
  assert.equal(f.cap,20);
  f.resources={gold:10000,wood:10000,food:10000};
  for(const cap of [60,100]) {s.selected=[hall];g.upgradeSelected();assert.equal(f.cap,cap);assert.equal(g.capacity(hall),cap);}
  const before={...f.resources};s.selected=[hall];g.upgradeSelected();assert.deepEqual({...f.resources},before);
  hall.rally={x:800,y:700};const pop=f.pop;
  g.train(hall,"worker");assert.equal(hall.train.length,1);assert.equal(g.pendingPop(0),1);
  g.simulateBuildings(6.1);assert.equal(f.pop,pop+1);assert.equal(s.units.at(-1).move.x,800);
});

test("workers cannot level up, but military retraining unlocks fighter upgrades", () => {
  const g=game(),s=g.state,f=s.factions[0],u=s.units.find(u=>u.f===0&&u.type==="worker");
  f.resources={gold:10000,wood:10000,food:10000};const before={...f.resources};
  s.selected=[u];g.upgradeSelected();assert.equal(u.level,1);assert.deepEqual({...f.resources},before);
  const b=s.buildings.find(b=>b.f===0&&b.type==="barracks");u.x=b.x;u.y=b.y;
  assert(g.enterBuilding(u,b));g.train(b,"sword");g.simulateBuildings(8.1);
  assert.equal(u.type,"sword");assert.equal(u.level,1);
  s.selected=[u];g.upgradeSelected();assert.equal(u.level,2);
});

test("workers retrain into archers at full population using their existing slots and cost credit", () => {
  const g = game(), s = g.state, f = s.factions[0], b = g.addBuilding(0, "range", 1000, 750, true);
  f.resources = { food: 10000, gold: 10000, wood: 10000 };
  const workers = s.units.filter((u) => u.f === 0 && u.type === "worker"), pop = f.pop;
  for (const worker of workers) { worker.x = b.x; worker.y = b.y; assert(g.enterBuilding(worker, b)); }
  const worker = workers[0], id = worker.id;
  worker.hp = worker.maxHp / 2;
  f.cap = pop;
  b.rally = { x: 1100, y: 700 };
  const before = { ...f.resources };
  g.train(b, "archer");
  assert.equal(b.train[0], "archer");
  assert.equal(b.queueInfo[0].worker, worker);
  assert.equal(f.resources.food, before.food - 10);
  assert.equal(f.resources.gold, before.gold - 40);
  assert.equal(g.pendingPop(0), 0);
  g.simulateBuildings(9.1);
  assert.equal(worker.type, "archer");
  assert.equal(worker.id, id);
  assert.equal(worker.hp, 41);
  assert.equal(f.pop, pop);
  assert.equal(s.units.filter((u) => u.id === id).length, 1);
  assert.equal(worker.move.x, 1100);
  assert.equal(worker.attackMove, true);
  g.train(b, "spear");
  assert.equal(b.train.length, 0, "unsupported roles cannot be trained");
  g.train(b, "archer");
  assert.equal(b.train.length, 1);
  g.train(b, "archer");
  assert.equal(b.train.length, 1, "ordinary recruitment still obeys capacity once waiting workers run out");
});

test("mixed training queues reserve only new units and retraining keeps the 100-unit ceiling", () => {
  const g = game(), s = g.state, f = s.factions[0], b = g.addBuilding(0, "range", 1000, 750, true);
  f.resources = { food: 10000, gold: 10000, wood: 10000 };
  f.cap = 500; f.pop = 99;
  g.train(b, "archer");
  const worker = s.units.find((u) => u.f === 0 && u.type === "worker");
  worker.x = b.x; worker.y = b.y; g.enterBuilding(worker, b);
  g.train(b, "archer");
  assert.equal(b.train.length, 2);
  assert.equal(g.pendingPop(0), 1);
  g.train(b, "archer");
  assert.equal(b.train.length, 2);
  s.cheats.fastTraining = true;
  g.simulateBuildings(1);
  assert.equal(f.pop, 100);
  assert.equal(b.queueInfo[0].worker, worker);
  g.simulateBuildings(1);
  assert.equal(f.pop, 100);
  assert.equal(worker.type, "archer");
  assert.equal(b.train.length, 0);
  assert.equal(g.pendingPop(0), 0);
});

test("canceling worker retraining refunds only its paid cost; selling releases waiting workers", () => {
  const g = game(), s = g.state, f = s.factions[0], b = g.addBuilding(0, "range", 1000, 750, true);
  f.resources = { food: 10000, gold: 10000, wood: 10000 };
  const worker = s.units.find((u) => u.f === 0 && u.type === "worker"), pop = f.pop;
  worker.x = b.x; worker.y = b.y; g.enterBuilding(worker, b);
  const before = { ...f.resources };
  g.train(b, "archer");
  g.cancelTraining(b);
  assert.equal(f.resources.food, before.food);
  assert.equal(f.resources.gold, before.gold);
  assert.equal(b.workers[0], worker);
  assert.equal(f.pop, pop);
  g.releaseWorker(b, worker);
  g.train(b, "archer"); // ordinary recruit ahead of a worker conversion
  worker.x = b.x; worker.y = b.y; g.enterBuilding(worker, b);
  g.train(b, "archer");
  assert.equal(g.pendingPop(0), 1);
  b.progress = 3;
  const refund = g.sellValue(b);
  s.selected = [b];
  g.sellSelected();
  assert.equal(f.resources.food, before.food + (refund.food || 0));
  assert.equal(f.resources.gold, before.gold + refund.gold);
  assert.equal(f.resources.wood, before.wood + refund.wood);
  assert.equal(f.pop, pop);
  assert(s.units.includes(worker));
  assert.equal(b.train.length, 0);
  assert.equal(b.queueInfo.length, 0);
});

test("destroyed training buildings release workers without refunding lost training", () => {
  const g = game(), s = g.state, f = s.factions[0], b = g.addBuilding(0, "range", 1000, 750, true);
  const worker = s.units.find((u) => u.f === 0 && u.type === "worker"), pop = f.pop;
  worker.x = b.x; worker.y = b.y; g.enterBuilding(worker, b);
  g.train(b, "archer");
  const gold = f.resources.gold;
  g.hit(b, b.maxHp + 1, 1);
  assert.equal(f.resources.gold, gold);
  assert.equal(f.pop, pop);
  assert(s.units.includes(worker));
  assert.equal(worker.type, "worker");
  assert.equal(b.queueInfo.length, 0);
  g.simulateBuildings(.1);
  assert.equal(s.units.filter((u) => u.id === worker.id).length, 1);
});

test("recruitment refund, queue limit, population reservation, and rally orders", () => {
  const g = game(),
    s = g.state,
    f = s.factions[0],
    hall = s.buildings.find((b) => b.f === 0 && b.type === "hall");
  f.resources = { gold: 10000, food: 10000, wood: 10000 };
  hall.rally = { x: 800, y: 800 };
  const before = f.resources.gold;
  g.train(hall, "worker");
  g.cancelTraining(hall);
  assert.equal(f.resources.gold, before);
  assert.equal(hall.train.length, 0);
  for (let i = 0; i < 7; i++) g.train(hall, "worker");
  assert.equal(hall.train.length, 5);
  const unitCount = s.units.length;
  g.simulateBuildings(6.1);
  assert.equal(s.units.length, unitCount + 1);
  assert.equal(s.units.at(-1).move.x, 800);
  f.cap =
    f.pop +
    g.state.buildings
      .filter((b) => b.f === 0)
      .reduce((n, b) => n + b.train.length, 0);
  const food = f.resources.food;
  g.train(hall, "worker");
  assert.equal(f.resources.food, food);
});

test("fast-training cheat accelerates player stables while rivals keep normal training speed", () => {
  const g = game(),
    s = g.state;
  s.factions[0].resources = { gold: 10000, food: 10000, wood: 10000 };
  const stable = g.addBuilding(0, "stable", 900, 900, true),
    enemy = g.addBuilding(1, "stable", 2500, 900, true);
  g.train(stable, "cavalry");
  enemy.train.push("cavalry");
  s.cheats.fastTraining = true;
  g.simulateBuildings(0.5);
  assert.equal(stable.progress, 10);
  assert(enemy.progress < 1);
  assert.equal(stable.train.length, 1);
  g.simulateBuildings(0.31);
  assert.equal(stable.train.length, 0);
  assert(s.units.some((u) => u.f === 0 && u.type === "cavalry"));
  assert.equal(enemy.train.length, 1);
  g.train(stable, "cavalry");
  s.cheats.fastTraining = false;
  g.simulateBuildings(0.5);
  assert.equal(stable.progress, 0.5);
  g.init();
  assert.equal(g.state.cheats.fastTraining, false);
});

test("fast training keeps the 100-unit ceiling and reserves population for queued recruits", () => {
  const g = game(),
    s = g.state,
    f = s.factions[0];
  f.resources = { gold: 10000, food: 10000, wood: 10000 };
  f.cap = 500;
  f.pop = 99;
  s.cheats.fastTraining = true;
  const stable = g.addBuilding(0, "stable", 900, 900, true);
  g.train(stable, "cavalry");
  const gold = f.resources.gold;
  g.train(stable, "cavalry");
  assert.equal(stable.train.length, 1);
  assert.equal(f.resources.gold, gold);
  g.simulateBuildings(1);
  assert.equal(f.pop, 100);
  g.train(stable, "cavalry");
  assert.equal(stable.train.length, 0);
});

test("cheat army slots unlock recruitment without houses, cap at 100, and reset with a new match", () => {
  const g = game(),
    s = g.state,
    f = s.factions[0],
    hall = s.buildings.find((b) => b.f === 0 && b.type === "hall");
  assert.equal(f.cap, 20);
  f.pop = f.cap;
  g.train(hall, "worker");
  assert.equal(hall.train.length, 0);
  const buildings = s.buildings.length;
  assert.equal(g.grantArmySlots(), 10);
  assert.equal(f.cap, 30);
  assert.equal(s.buildings.length, buildings);
  g.train(hall, "worker");
  assert.equal(hall.train.length, 1);
  for (let i = 0; i < 20; i++) g.grantArmySlots();
  assert.equal(f.cap, 100);
  assert.equal(g.grantArmySlots(), 0);
  g.init();
  assert.equal(g.state.factions[0].cap, 20);
  assert.equal(g.state.cheats.armySlots, 0);
});

test("archers and crossbowmen stand and fire instead of retreating from nearby enemies", () => {
  for (const type of ["archer", "crossbow"]) {
    const g = game();
    const position = { x: g.state.factions[0].x + 350, y: g.state.factions[0].y - 250 };
    const unit = g.addUnit(0, type, position.x, position.y, true);
    const enemy = g.addUnit(1, "worker", position.x + 50, position.y, true);
    enemy.hold = true;
    unit.target = enemy;
    unit.attackTimer = 0;
    for (let i = 0; i < 10; i++) g.simulateUnits(0.05);
    assert.equal(unit.x, position.x);
    assert.equal(unit.y, position.y);
    assert(g.state.shots.some((shot) => shot.f === 0 && shot.to === enemy));
  }
});

test("all combat units and factions share detection for enemies and structures without changing weapon ranges", () => {
  const g = combatGame(), s = g.state;
  const ranges = {worker:0,sword:25,spear:39,guard:26,archer:225,crossbow:240,healer:180,cavalry:31,raider:30,catapult:330};
  for (const [type, range] of Object.entries(ranges)) assert.equal(g.data.udefs[type].range,range);
  assert.equal(g.data.combatRules.detectionRange,450);
  for (const f of [0,1,2]) for (const type of Object.keys(ranges).filter(t=>t!=="healer"&&t!=="worker")) {
    s.units = []; s.buildings = [];
    const unit=g.addUnit(f,type,550,650,true),enemyFaction=(f+1)%3;
    unit.hold=true;
    const enemy=g.addUnit(enemyFaction,"worker",999,650,true);
    g.seekTarget(unit);assert.equal(unit.target,enemy,`${type} in faction ${f} detects within 450`);
    enemy.x=1001;unit.target=null;g.seekTarget(unit);assert.equal(unit.target,null,"outside shared detection");
    s.units=[unit];const building=g.addBuilding(enemyFaction,"farm",999,650,true);
    g.seekTarget(unit);assert.equal(unit.target,building,"structures use the same detection distance");
    building.x=1001;unit.target=null;g.seekTarget(unit);assert.equal(unit.target,null);
  }
});

test("melee troops identify the actual ranged attacker and close in after a projectile hit", () => {
  const g=combatGame(),s=g.state,soldier=g.addUnit(0,"sword",600,650,true),archer=g.addUnit(1,"archer",825,650,true);
  for(const u of s.units){u.hold=true;u.think=1000;u.attackTimer=1000;}
  archer.target=soldier;archer.attackTimer=0;
  g.simulateUnits(.01);assert.equal(s.shots.length,1);assert.equal(s.shots[0].source,archer);
  assert.equal(soldier.target,null);g.simulateShots(1);
  assert.equal(soldier.target,archer);assert(soldier.defense);assert.equal(soldier.hold,false);
  const oldX=soldier.x;g.simulateUnits(.25);
  assert(soldier.x>oldX,"melee closes the gap instead of ignoring the archer");
  assert.equal(archer.x,825,"archer does not retreat automatically");assert.equal(archer.hp,archer.maxHp,"melee still must reach its own weapon range");
});

test("defense alarms have a wider local radius, work for every faction and fire even on a lethal hit", () => {
  const g=combatGame(),s=g.state;
  for(const owner of [0,1,2]){
    s.units=[];s.buildings=[];
    const enemy=(owner+1)%3, victim=g.addBuilding(owner,"farm",650,650,true),guard=g.addUnit(owner,"sword",1200,650,true),far=g.addUnit(owner,"sword",2000,650,true),attacker=g.addUnit(enemy,"archer",450,650,true);
    for(const u of s.units){u.hold=true;u.think=1000;u.attackTimer=1000;}
    g.seekTarget(guard);assert.equal(guard.target,null,"attacker is outside personal detection");
    victim.hp=1;g.hit(victim,2,enemy,attacker);
    assert.equal(victim.hp,0);assert.equal(guard.target,attacker,"nearby allies defend the destroyed building too");
    assert.equal(far.target,null);assert.equal(far.defense,null,"distant units receive no alarm");
    g.simulateUnits(.1);assert.equal(guard.target,attacker,"an assisted target beyond personal detection is retained");
  }
});

test("attacking a distant enemy base does not summon home defenders, including during enemy retaliation", () => {
  const g=combatGame(),home=g.addUnit(0,"sword",700,650,true),army=g.addUnit(0,"sword",5920,1260,true),base=g.addBuilding(1,"farm",5950,1283,true),defender=g.addUnit(1,"sword",6000,1283,true);
  for(const u of g.state.units){u.hold=true;u.think=1000;u.attackTimer=1000;}
  army.hold=false;army.target=base;army.attackTimer=0;
  g.simulateUnits(.05);
  assert(base.hp<base.maxHp);assert.equal(defender.target,army,"the attacked kingdom defends locally");
  assert.equal(home.defense,null);assert.equal(home.target,null);assert.equal(home.move,null);
  g.hit(army,1,1,defender);
  assert.equal(home.defense,null,"counterattacks far from home do not alert the home army");
  assert.equal(home.target,null);assert.equal(home.move,null);
});

test("workers keep working during attacks while nearby fighters defend; troops resume movement after defense", () => {
  const g=combatGame(),s=g.state,worker=g.addUnit(0,"worker",600,650,true),enemy=g.addUnit(1,"archer",800,650,true),guard=g.addUnit(0,"sword",1000,650,true);
  enemy.hold=true;enemy.think=1000;enemy.attackTimer=1000;
  const tree={x:600,y:680,r:18,type:"tree",amount:100,max:100};s.nodes=[tree];
  const job={kind:"gather",target:tree};worker.job=job;
  g.hit(worker,1,1,enemy);assert.equal(worker.job,job);assert.equal(worker.target,null);assert.equal(worker.defense,null);assert.equal(guard.target,enemy);
  const wood=s.factions[0].resources.wood;g.simulateUnits(.1);
  assert.equal(worker.job,job);assert(s.factions[0].resources.wood>wood,"gathering continues under attack");
  s.units=[];s.nodes=[];const soldier=g.addUnit(0,"sword",600,650,true),attacker=g.addUnit(1,"archer",800,650,true),goal={x:1050,y:650};
  attacker.hold=true;attacker.think=1000;attacker.attackTimer=1000;soldier.move=goal;
  g.hit(soldier,1,1,attacker);assert.equal(soldier.move,null);attacker.x=2000;g.simulateUnits(.1);
  assert.equal(soldier.move,goal,"movement resumes when the attacker leaves the local defense area");
  attacker.x=800;g.hit(soldier,1,1,attacker);assert(soldier.defense);
  s.selected=[soldier];g.issueMove(475,900);assert.equal(soldier.defense,null);
  attacker.hp=0;g.simulateUnits(.1);assert.equal(soldier.move.x,475);assert.equal(soldier.move.y,900,"new order takes priority over pre-defense movement");
});

test("workers never detect enemies or accept attack orders, including in mixed selections", () => {
  const g=combatGame(),s=g.state,worker=g.addUnit(0,"worker",600,650,true),enemy=g.addUnit(1,"archer",800,650,true),fighter=g.addUnit(0,"sword",650,700,true);
  for(const u of s.units){u.think=1000;u.attackTimer=1000;u.hold=true;}
  const tree={x:600,y:680,r:18,type:"tree",amount:100,max:100},job={kind:"gather",target:tree};s.nodes=[tree];worker.job=job;
  assert.equal(g.data.udefs.worker.damage,0);assert.equal(g.data.udefs.worker.range,0);
  for(const faction of [0,1,2]){worker.f=faction;g.seekTarget(worker);assert.equal(worker.target,null,"workers in every kingdom ignore enemies");}worker.f=0;
  s.selected=[worker];g.updateUI();assert(g.document.getElementById("attackMove").disabled);
  assert(!g.document.getElementById("detailCommands")._commandRows.some(b=>b.textContent.startsWith("Attack")));
  g.document.getElementById("attackMove").onclick();assert.equal(s.command,null);
  g.issueMove(enemy.x,enemy.y);assert.equal(worker.job,job);assert.equal(worker.target,null);assert.equal(worker.move,null);
  s.selected=[worker,fighter];g.issueMove(enemy.x,enemy.y);assert.equal(fighter.target,enemy);assert.equal(worker.job,job);assert.equal(worker.target,null);
  g.issueMove(1050,650,true);assert(fighter.attackMove);assert.equal(worker.attackMove,false);assert.equal(worker.job,job);
  worker.target=enemy;worker.attackTimer=0;const hp=enemy.hp;g.simulateUnits(.1);
  assert.equal(worker.target,null);assert.equal(worker.defense,null);assert.equal(worker.job,job);assert.equal(enemy.hp,hp);
});

test("healers support attacked allies without attacking, and towers keep their weapon range", () => {
  const g=combatGame(),s=g.state,patient=g.addUnit(0,"worker",650,650,true),healer=g.addUnit(0,"healer",1200,650,true),enemy=g.addUnit(1,"archer",450,650,true);
  for(const u of s.units){u.think=1000;u.hold=true;u.attackTimer=1000;}
  g.hit(patient,1,1,enemy);assert.equal(healer.target,patient);const x=healer.x;g.simulateUnits(.1);
  assert(healer.x<x);assert.equal(healer.target,patient);assert.equal(enemy.hp,enemy.maxHp);
  s.units=[];s.buildings=[];const tower=g.addBuilding(0,"tower",650,650,true),target=g.addUnit(1,"archer",950,650,true);
  tower.attackTimer=0;g.simulateBuildings(.1);assert.equal(s.shots.length,0,"detection does not extend tower fire");
  target.x=850;g.simulateBuildings(.1);assert.equal(s.shots.length,1);assert.equal(s.shots[0].source,tower);
  assert.equal(g.data.defs.tower.range,250);assert.equal(g.data.defs.fortress.range,285);
});

test("idle defenders return to their post instead of extending a chase beyond the local defense area", () => {
  const g=combatGame(),guard=g.addUnit(0,"sword",600,650,true),attacker=g.addUnit(1,"archer",800,650,true);
  guard.hold=true;attacker.hold=true;attacker.think=1000;attacker.attackTimer=1000;
  g.hit(guard,1,1,attacker);guard.x=1550;attacker.x=1600;
  g.simulateUnits(.1);
  assert.equal(guard.defense,null);assert.equal(guard.target,null);assert(guard.defenseReturn);
  assert.equal(guard.move.x,600);assert(guard.x<1550,"returns toward its post despite the attacker still being nearby");
  for(let i=0;i<250&&guard.move;i++)g.simulateUnits(.05);
  assert.equal(guard.move,null);assert.equal(guard.hold,true);assert.equal(guard.defenseReturn,null);
});

test("siege splash alerts each victim's allies to the real attacker in multi-kingdom combat", () => {
  const g=combatGame(),s=g.state,catapult=g.addUnit(2,"catapult",900,650,true),target=g.addUnit(1,"worker",650,650,true),victim=g.addUnit(0,"sword",680,650,true),guard=g.addUnit(0,"sword",1100,650,true);
  for(const u of s.units){u.think=1000;u.hold=true;u.attackTimer=1000;}
  catapult.target=target;catapult.attackTimer=0;g.simulateUnits(.01);assert.equal(s.shots[0].source,catapult);
  g.simulateShots(2);assert(victim.hp<victim.maxHp);assert.equal(guard.target,catapult);assert.equal(guard.defense.attacker,catapult);
});

test("A arms attack-move, a ground click issues it, and A does not pan the camera", () => {
  const g = game(),
    s = g.state;
  const unit = s.units.find((u) => u.f === 0 && u.type === "sword");
  s.selected = [unit];
  const x = g.camera.x,
    y = g.camera.y;
  g.listeners.keydown({ key: "a", preventDefault() {} });
  assert.equal(s.command, "attack");
  g.frame(16);
  assert.equal(g.camera.x, x);
  assert.equal(g.camera.y, y);
  const event = {
    clientX: (900 - g.camera.x) * g.camera.z,
    clientY: (750 - g.camera.y) * g.camera.z,
    button: 0,
    pointerId: 1,
  };
  const canvas = g.document.getElementById("game");
  canvas.listeners.pointerdown(event);
  canvas.listeners.pointerup(event);
  assert.equal(s.command, null);
  assert.equal(unit.attackMove, true);
  assert.equal(unit.move.x, 900);
  assert.equal(unit.move.y, 750);
  g.listeners.keydown({ key: "a", ctrlKey: true, preventDefault() {} });
  assert.equal(s.command, null);
});

test("W, D, and X have no gameplay action while arrows and the Stop button still work", () => {
  const g = game(),
    unit = g.state.units.find((u) => u.f === 0 && u.type === "sword");
  g.state.selected = [unit];
  g.issueMove(900, 750);
  const before = { x: g.camera.x, y: g.camera.y };
  for (const key of ["w", "d", "x"])
    g.listeners.keydown({ key, preventDefault() {} });
  g.frame(16);
  assert.equal(g.camera.x, before.x);
  assert.equal(g.camera.y, before.y);
  assert(unit.move);
  assert.equal(unit.hold, false);
  g.listeners.keydown({ key: "ArrowRight", preventDefault() {} });
  g.frame(32);
  assert(g.camera.x > before.x);
  g.document.getElementById("stopUnits").onclick();
  assert.equal(unit.move, null);
  assert.equal(unit.hold, true);
});

test("quick right-clicks tolerate a little drag and retain the selected troops", () => {
  for (const [duration, slip] of [
    [100, 18],
    [170, 24],
    [500, 6],
  ]) {
    const g = game(),
      u = g.state.units.find((u) => u.f === 0 && u.type === "sword");
    g.state.selected = [u];
    const canvas = g.document.getElementById("game"),
      event = { pointerId: 1, button: 2, clientX: 650, clientY: 300 };
    canvas.listeners.pointerdown(event);
    g.advanceTime(duration);
    const end = { ...event, clientX: event.clientX + slip };
    canvas.listeners.pointermove(end);
    canvas.listeners.pointerup(end);
    assert.equal(g.state.selected[0], u);
    assert(u.move, `${duration}ms / ${slip}px issues a movement order`);
  }
});

test("held right-drags select units and large quick drags stay selection gestures", () => {
  for (const [duration, size] of [
    [220, 12],
    [50, 80],
  ]) {
    const g = game(),
      u = g.state.units.find((u) => u.f === 0 && u.type === "sword");
    g.state.selected = [];
    const canvas = g.document.getElementById("game"),
      px = (u.x - g.camera.x) * g.camera.z,
      py = (u.y - g.camera.y) * g.camera.z;
    const event = {
      pointerId: 1,
      button: 2,
      clientX: px - size / 2,
      clientY: py - size / 2,
    };
    canvas.listeners.pointerdown(event);
    g.advanceTime(duration);
    const end = { ...event, clientX: px + size / 2, clientY: py + size / 2 };
    canvas.listeners.pointermove(end);
    canvas.listeners.pointerup(end);
    assert(g.state.selected.includes(u));
    assert.equal(u.move, null);
  }
  const g = game(),
    u = g.state.units.find((u) => u.f === 0 && u.type === "sword");
  g.state.selected = [u];
  const canvas = g.document.getElementById("game"),
    event = { pointerId: 1, button: 2, clientX: 650, clientY: 300 };
  canvas.listeners.pointerdown(event);
  g.advanceTime(50);
  canvas.listeners.pointermove({ ...event, clientX: 750 });
  canvas.listeners.pointerup({ ...event, clientX: 662 });
  assert.equal(
    u.move,
    null,
    "shrinking an established selection box does not issue movement",
  );
});

test("attack-move engages enemies and resumes its destination after combat", () => {
  const g = game(),
    s = g.state;
  const u = s.units.find((u) => u.f === 0 && u.type === "sword");
  u.x = 1200;
  u.y = 700;
  const enemy = g.addUnit(1, "worker", 1260, 700, true);
  enemy.hp = 1;
  s.selected = [u];
  g.issueMove(1500, 700, true);
  for (let i = 0; i < 100; i++) g.simulateUnits(0.05);
  assert.equal(enemy.hp, 0);
  assert(u.x > 1300, "unit resumes route");
});

test("workers receive gathering and repair orders; repair spends wood", () => {
  const g = game(),
    s = g.state,
    f = s.factions[0];
  const u = s.units.find((u) => u.f === 0 && u.type === "worker");
  const node = s.nodes.find((n) => n.type === "tree");
  u.x = node.x;
  u.y = node.y + node.r + 10;
  s.selected = [u];
  const wood = f.resources.wood;
  g.issueMove(node.x, node.y);
  g.simulateUnits(1);
  assert(f.resources.wood > wood);
  const hall = s.buildings.find((b) => b.f === 0 && b.type === "hall");
  hall.hp -= 100;
  u.x = hall.x + hall.size * 0.6 + 10;
  u.y = hall.y;
  g.issueMove(hall.x, hall.y);
  const spent = f.resources.wood;
  g.simulateUnits(1);
  assert(hall.hp > hall.maxHp - 100);
  assert(f.resources.wood < spent);
  g.stopSelected();
  assert.equal(u.job, null);
});

test("research costs once, takes time, and changes actual combat damage", () => {
  const g = game(),
    s = g.state,
    f = s.factions[0];
  const u = s.units.find((u) => u.type === "sword" && u.f === 0),
    target = s.units.find((u) => u.f === 1);
  const damage = g.combatDamage(u, target);
  g.startResearch(0, "weapons");
  const gold = f.resources.gold;
  g.startResearch(0, "armor");
  assert.equal(f.resources.gold, gold);
  g.simulateStrategy(27);
  assert.equal(f.tech.weapons, 0);
  g.simulateStrategy(1);
  assert.equal(f.tech.weapons, 1);
  assert.equal(g.combatDamage(u, target), damage * 1.2);
});

test("crossings require troops, stop capture and income while contested, and change hands", () => {
  const g = game(),
    s = g.state,
    p = s.outposts[0];
  const worker = s.units.find((u) => u.f === 0 && u.type === "worker");
  worker.x = p.x;
  worker.y = p.y;
  g.simulateStrategy(13);
  assert.equal(p.owner, -1);
  const soldier = s.units.find((u) => u.f === 0 && u.type === "sword");
  soldier.x = p.x;
  soldier.y = p.y;
  g.simulateStrategy(12);
  assert.equal(p.owner, 0);
  const enemy = s.units.find((u) => u.f === 1 && u.type === "sword");
  enemy.x = p.x;
  enemy.y = p.y;
  const gold = s.factions[0].resources.gold;
  g.simulateStrategy(10);
  assert.equal(p.owner, 0);
  assert.equal(s.factions[0].resources.gold, gold);
  soldier.x = 0;
  worker.x = 0;
  g.simulateStrategy(12);
  assert.equal(p.owner, 1);
});

test("pause blocks orders, recruitment, and research; restart resets match state", () => {
  const g = game(),
    s = g.state,
    f = s.factions[0],
    u = s.units.find((u) => u.f === 0);
  const hall = s.buildings.find((b) => b.f === 0 && b.type === "hall");
  s.selected = [u];
  g.togglePause();
  const gold = f.resources.gold;
  g.issueMove(900, 900);
  g.train(hall, "worker");
  g.startResearch(0, "weapons");
  assert.equal(u.move, null);
  assert.equal(hall.train.length, 0);
  assert.equal(f.resources.gold, gold);
  s.groups["1"] = [u.id];
  s.command = "attack";
  g.init();
  assert.equal(g.api.state.paused, false);
  assert.equal(Object.keys(g.api.state.groups).length, 0);
  assert.equal(g.api.state.command, null);
});

test("control groups preserve living units without changing the current selection", () => {
  const g = game(),
    s = g.state,
    u = s.units.find((u) => u.f === 0);
  const key = (key, ctrlKey = false) =>
    g.listeners.keydown({ key, ctrlKey, preventDefault() {} });
  s.selected = [u];
  key("1", true);
  s.selected = [];
  key("1");
  assert.equal(s.selected[0].id, u.id);
  key("a");
  assert.equal(s.selected[0].id, u.id);
  u.hp = 0;
  key("1");
  assert.equal(s.selected.length, 0);
});

test("extended ten-faction simulation renders with finite resources and positions", () => {
  const g = game();
  g.document.getElementById("enemyCount").value = "9";
  g.init();
  for (let i = 0; i < 2400; i++) g.tick(0.05);
  for (const u of g.api.state.units)
    assert(Number.isFinite(u.x) && Number.isFinite(u.y));
  for (const f of g.api.state.factions)
    for (const value of Object.values(f.resources))
      assert(Number.isFinite(value) && value >= 0);
  g.updateUI();
  g.drawWorld();
  g.drawMini();
});

test("downloaded sprite checksums and animation crops match every faction and role", () => {
  const { createHash } = require("node:crypto");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "assets/characters/manifest.json")),
  );
  const dimensions = new Map();
  for (const file of manifest.files) {
    const bytes = fs.readFileSync(
      path.join(root, "assets/characters", file.file),
    );
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
    dimensions.set(file.file, [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]);
  }
  class LoadedImage {
    set src(value) {
      this.url = value;
      this.onload();
    }
  }
  const sandbox = { window: {}, Image: LoadedImage };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "js/sprites.js"), "utf8"),
    sandbox,
  );
  const sprites = sandbox.window.RealmfrontSprites;
  const ctx = new Proxy(
    {
      drawImage(image, x, y, w, h) {
        const [width, height] = dimensions.get(path.basename(image.url));
        assert(x >= 0 && y >= 0 && x + w <= width && y + h <= height);
      },
    },
    { get: (o, k) => o[k] ?? (() => {}) },
  );
  for (const f of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    for (const type of [
      "worker",
      "sword",
      "spear",
      "guard",
      "archer",
      "crossbow",
      "healer",
      "cavalry",
      "raider",
    ]) {
      for (const dy of [-100, 0, 100]) {
        for (const time of [0, 0.15, 0.6, 1, 4, 20]) {
          const u = {
            id: 1,
            x: 0,
            y: 0,
            type,
            f,
            anim: time,
            facing: -1,
            movedAt: time,
            actionTime: 0.4,
            actionDuration: 0.8,
            target: { x: 20, y: dy },
          };
          assert(sprites.draw(ctx, u, time, "#77b9e5"));
          u.actionTime = 0;
          assert(sprites.draw(ctx, u, time, "#77b9e5"));
        }
      }
    }
  }
  sprites.sheets.get("Pawn_Blue").ready = false;
  assert.equal(
    sprites.draw(ctx, { type: "worker", f: 0 }, 0, "#77b9e5"),
    false,
  );
  assert.equal(
    sprites.draw(ctx, { type: "catapult", f: 0 }, 0, "#77b9e5"),
    false,
  );
});

test("unit multi-clicks select matching fighters then all fighters, while worker multi-clicks always exclude fighters", () => {
  const g = game(), s = g.state;
  const fighter = s.units.find((u) => u.f === 0 && u.type === "sword");
  g.addUnit(0, "guard", 900, 700, true);
  g.addUnit(0, "sword", 850, 700, true);
  const enemy = g.addUnit(1, "sword", 1000, 700, true);
  const dead = g.addUnit(0, "archer", 950, 700, true); dead.hp = 0;
  g.selectClicked(fighter);
  assert.equal(s.selected.length, 1);
  assert.equal(s.selected[0], fighter);
  g.advanceTime(120); g.selectClicked(fighter);
  assert.equal(s.selected.length, s.units.filter((u) => u.f === 0 && u.hp > 0 && u.type === fighter.type).length);
  assert(s.selected.every((u) => u.type === fighter.type && u !== enemy && u !== dead));
  g.advanceTime(120); g.selectClicked(fighter);
  assert.equal(s.selected.length, s.units.filter((u) => u.f === 0 && u.hp > 0 && u.type !== "worker").length);
  assert(s.selected.every((u) => u.type !== "worker"));
  for(let i=0;i<3;i++){g.advanceTime(120);g.selectClicked(fighter);assert(s.selected.every(u=>u.type!=="worker"));}
  g.advanceTime(600); g.selectClicked(fighter);
  assert.equal(s.selected.length, 1);
  const worker = s.units.find((u) => u.f === 0 && u.type === "worker");
  g.selectClicked(worker);
  assert.equal(s.selected.length, 1);
  g.advanceTime(120); g.selectClicked(worker);
  assert.equal(s.selected.length, s.units.filter((u) => u.f === 0 && u.type === "worker" && u.hp > 0).length);
  assert(s.selected.every((u) => u.type === "worker"));
  for(let i=0;i<4;i++){g.advanceTime(120);g.selectClicked(worker);assert(s.selected.every(u=>u.type==="worker"));assert.equal(s.selected.length,s.units.filter(u=>u.f===0&&u.type==="worker"&&u.hp>0).length);}
  g.document.getElementById("touchDeselect").onclick();
  assert.equal(s.selected.length, 0);
});

test("same-type building selection preserves ownership and entity kind across the map", () => {
  const g = game(),
    s = g.state;
  const u = s.units.find((o) => o.f === 0 && o.type === "sword");
  const distant = g.addUnit(0, "sword", 6100, 4400, true);
  g.selectSameType(u);
  assert.equal(s.selected.length, 2);
  assert(s.selected.includes(distant));
  const barracks = s.buildings.find((o) => o.f === 0 && o.type === "barracks");
  const other = g.addBuilding(0, "barracks", 1000, 1000, true);
  g.selectSameType(barracks);
  assert.equal(s.selected.length, 2);
  assert(s.selected.includes(other));
  assert(
    s.selected.every(
      (o) => o.f === 0 && o.type === "barracks" && o.size !== undefined,
    ),
  );
});

test("batch upgrade charges each eligible item and respects budgets and maximum levels", () => {
  const g = game(),
    s = g.state,
    f = s.factions[0],
    u = s.units.find((o) => o.f === 0 && o.type === "sword");
  const other = g.addUnit(0, "sword", 800, 800, true),
    enemy = s.units.find((o) => o.f === 1);
  const cost = g.upgradeCost(u);
  f.resources = { gold: cost.gold, food: cost.food, wood: 0 };
  s.selected = [u, other, enemy];
  const hp = u.maxHp,
    damage = g.combatDamage(u, {});
  g.upgradeSelected();
  assert.equal(u.level, 2);
  assert.equal(other.level, 1);
  assert.equal(enemy.level, 1);
  assert(u.maxHp > hp);
  assert(g.combatDamage(u, {}) > damage);
  assert.equal(f.resources.gold, 0);
  f.resources = { gold: 10000, food: 10000, wood: 10000 };
  s.selected = [u];
  g.upgradeSelected();
  assert.equal(u.level, 3);
  const gold = f.resources.gold;
  g.upgradeSelected();
  assert.equal(f.resources.gold, gold);
});

test("selling upgraded buildings removes exact capacity and refunds queued recruits", () => {
  const g = game(),
    s = g.state,
    f = s.factions[0];
  f.resources = { gold: 10000, food: 10000, wood: 10000 };
  const house = s.buildings.find((o) => o.f === 0 && o.type === "farm"),
    hall = s.buildings.find((o) => o.f === 0 && o.type === "hall");
  const barracks = s.buildings.find((o) => o.f === 0 && o.type === "barracks");
  const oldCap = f.cap;
  s.selected = [hall];
  g.upgradeSelected();
  assert.equal(f.cap, 60);
  g.train(barracks, "sword");
  const refund = g.sellValue(barracks),
    gold = f.resources.gold,
    food = f.resources.food;
  s.selected = [house, barracks, hall];
  g.sellSelected();
  assert.equal(f.cap, 60, "selling resource/training buildings does not remove Town Hall capacity");
  assert.equal(hall.hp, hall.maxHp);
  assert.equal(s.selected.length, 1);
  assert.equal(f.resources.gold, gold + (refund.gold || 0) + 35);
  assert.equal(f.resources.food, food + 45);
  const after = f.resources.gold;
  g.sellSelected();
  assert.equal(f.resources.gold, after);
});

test("S stops without selling; L sells; U upgrades; shortcuts ignore text fields", () => {
  const g = game(),
    s = g.state,
    u = s.units.find((o) => o.f === 0 && o.type === "sword");
  s.selected = [u];
  const key = (k) => g.listeners.keydown({ key: k, preventDefault() {} });
  const resources = { ...s.factions[0].resources }, camera = { ...g.camera };
  g.issueMove(900, 750);
  assert(u.move);
  key("s");
  assert.equal(u.move, null);
  assert.equal(u.hold, true);
  assert(u.hp > 0 && s.units.includes(u));
  assert.deepEqual({ ...s.factions[0].resources }, resources);
  assert.equal(g.camera.x, camera.x);
  assert.equal(g.camera.y, camera.y);
  key("u");
  assert.equal(u.level, 2);
  g.issueMove(900, 750);
  g.document.activeElement.tagName = "INPUT";
  key("s");
  key("l");
  assert(u.hp > 0 && u.move);
  g.document.activeElement.tagName = "BODY";
  key("S");
  assert.equal(u.move, null);
  assert(u.hp > 0);
  key("L");
  assert.equal(u.hp, 0);
  assert(!s.units.includes(u));
});

test("Escape deselects and cancels targeting/placement without stopping orders or deleting groups", () => {
  const g = game(), s = g.state, u = s.units.find((o) => o.f === 0 && o.type === "sword");
  s.selected = [u];
  g.issueMove(900, 750);
  const destination = u.move;
  s.groups[1] = [u.id];
  s.command = "attack";
  g.listeners.keydown({ key: "Escape", preventDefault() {} });
  assert.equal(s.selected.length, 0);
  assert.equal(s.command, null);
  assert.equal(u.move, destination);
  assert.equal(s.groups[1][0], u.id);
  s.selected = [s.buildings.find((b) => b.f === 0)];
  s.placement = "farm";
  s.paused = true;
  g.listeners.keydown({ key: "Escape", preventDefault() {} });
  assert.equal(s.selected.length, 0);
  assert.equal(s.placement, null);
  assert.equal(s.paused, true);
});

test("repeat placement keeps its type, each click pays, and sea/invalid clicks never charge", () => {
  const g = game(),
    s = g.state,
    f = s.factions[0];
  f.resources = { gold: 10000, food: 10000, wood: 10000 };
  s.placement = "farm";
  const spots = [];
  for (let x = 150; x < 1200; x += 96)
    for (let y = 150; y < 1100; y += 96)
      if (g.validPlace("farm", x, y)) spots.push({ x, y });
  const first = spots[0],
    wood = f.resources.wood;
  assert(g.placeBuilding(first.x, first.y, true));
  assert.equal(s.placement, "farm");
  assert.equal(f.resources.wood, wood - 75);
  assert.equal(g.placeBuilding(first.x, first.y, true), null);
  assert.equal(f.resources.wood, wood - 75);
  assert.equal(g.placeBuilding(-100, 100, true), null);
  assert.equal(f.resources.wood, wood - 75);
  const second = spots.find((p) => g.validPlace("farm", p.x, p.y));
  assert(g.placeBuilding(second.x, second.y, false));
  assert.equal(s.placement, null);
  assert.equal(f.resources.wood, wood - 150);
});

test("all purchasable buildings can be placed far from base around a friendly worker", () => {
  const g=game(),s=g.state,builder=s.units.find(u=>u.f===0&&u.type==="worker");
  s.units=s.units.filter(u=>u.f!==0||u.type!=="worker"||u===builder);
  const types=Object.keys(g.data.defs).filter(type=>type!=="hall");
  let site;
  for(let x=2004;x<5800&&!site;x+=120)for(let y=900;y<4100&&!site;y+=120){
    if(!g.terrain.isWalkable(x-120,y,30))continue;
    builder.x=x-120;builder.y=y;
    if(types.every(type=>g.validPlace(type,x,y)))site={x,y};
  }
  assert(site,"remote construction clearing");
  assert(Math.hypot(site.x-s.factions[0].x,site.y-s.factions[0].y)>850,"not limited to the starting base");
  builder.job={kind:"gather",target:{x:builder.x,y:builder.y,r:18,type:"tree",amount:100}};
  s.selected=[];
  for(const type of types)assert(g.validPlace(type,site.x,site.y),type+" can be built with an unselected working builder");
  const wood=s.factions[0].resources.wood,count=s.buildings.length;
  s.placement="farm";assert(g.placeBuilding(site.x,site.y));
  assert.equal(s.buildings.length,count+1);assert.equal(s.factions[0].resources.wood,wood-75);
  assert(s.units.includes(builder));assert.equal(builder.type,"worker");assert(builder.job,"building does not consume the worker or stop its work");
});

test("construction requires a living deployed worker of the owner and rechecks the radius before charging", () => {
  const g=game(),s=g.state,builder=s.units.find(u=>u.f===0&&u.type==="worker");
  s.units=[builder];s.buildings=[];s.nodes=[];s.selected=[];
  const site={x:1008,y:648};builder.x=658;builder.y=648;
  assert.equal(g.data.buildRules.workerRadius,350);assert(g.validPlace("farm",site.x,site.y),"350 units is inside build range");
  builder.x=657;assert(!g.validPlace("farm",site.x,site.y),"351 units is outside build range");
  g.addUnit(0,"sword",site.x,site.y,true);g.addUnit(1,"worker",site.x,site.y,true);
  assert(!g.validPlace("farm",site.x,site.y),"fighters and rival workers cannot enable player construction");
  assert(g.validPlace("farm",site.x,site.y,1),"the rival can build around its own worker, away from its original base");
  const wood=s.factions[0].resources.wood,count=s.buildings.length;s.placement="farm";
  assert.equal(g.placeBuilding(site.x,site.y),null);assert.equal(s.factions[0].resources.wood,wood);assert.equal(s.buildings.length,count);
  builder.x=658;builder.hp=0;assert(!g.validPlace("farm",site.x,site.y),"dead workers do not count");
  builder.hp=builder.maxHp;assert(g.validPlace("farm",site.x,site.y));
  const farm=g.addBuilding(0,"barracks",builder.x,builder.y,true);assert(g.enterBuilding(builder,farm));
  assert(!g.validPlace("farm",site.x,site.y),"staff inside a building do not provide construction range");
  g.releaseWorker(farm,builder);builder.x=658;builder.y=648;
  assert(g.placeBuilding(site.x,site.y));assert.equal(s.factions[0].resources.wood,wood-75);
  assert(!g.validPlace("farm",site.x,site.y),"an existing building still blocks overlapping placement");
  assert(!g.validPlace("farm",-24,648),"workers never enable building in the sea");
});

test("doubled island fits completely, camera centers letterboxing, and sea rejects orders", () => {
  const g = game(),
    s = g.state,
    w = g.world;
  assert.equal(w.width, 6600);
  assert.equal(w.height, 4900);
  for (const [width, height] of [
    [1200, 700],
    [300, 500],
    [1600, 300],
  ]) {
    g.viewport.w = width;
    g.viewport.h = height;
    g.fitMap();
    assert(g.camera.x <= -w.sea + 0.0001);
    assert(g.camera.y <= -w.sea + 0.0001);
    assert(g.camera.x + width / g.camera.z >= w.width + w.sea - 0.0001);
    assert(g.camera.y + height / g.camera.z >= w.height + w.sea - 0.0001);
    const mapButton = g.document.getElementById("fitMap");
    assert.equal(mapButton.textContent, "Base [H]");
    mapButton.onclick();
    assert.equal(mapButton.textContent, "Full Map [M]");
    assert(g.camera.z >= 0.9, "Base restores a useful local zoom");
    const base = s.factions[0];
    assert(base.x >= g.camera.x && base.x <= g.camera.x + width / g.camera.z);
    assert(base.y >= g.camera.y && base.y <= g.camera.y + height / g.camera.z);
    mapButton.onclick();
    assert.equal(mapButton.textContent, "Base [H]");
    assert(Math.abs(g.camera.z - w.fitZoom(g.viewport)) < 1e-6);
    const p = w.mapPoint(1234, 456),
      q = w.fromMap(p.x, p.y);
    assert(Math.abs(q.x - 1234) < 0.0001 && Math.abs(q.y - 456) < 0.0001);
  }
  const u = s.units.find((o) => o.f === 0);
  s.selected = [u];
  g.issueMove(-100, 500);
  assert.equal(u.move, null);
  for (let i = 0; i < 10; i++) g.moveToward(u, -1000, -1000, 1, 0);
  assert(w.contains(u.x, u.y, 10));
});

test("purchase cards use brief summaries and put full descriptions in the details panel", () => {
  const g = game(),
    s = g.state;
  const cards = g.document.getElementById("actions").children;
  assert(g.document.getElementById("details").innerHTML.includes("Produces a fixed 1 food/s. Workers harvest fields"));
  assert(
    cards.some((card) =>
      card.children.some(
        (child) =>
          child.className === "action-description" &&
          child.textContent.includes("1 food/s"),
      ),
    ),
  );
  s.placement = "farm";
  g.updateUI();
  assert(
    g.document
      .getElementById("details")
      .innerHTML.includes("Produces a fixed 1 food/s."),
  );
  const hall = s.buildings.find((o) => o.f === 0 && o.type === "hall");
  s.placement = null;
  s.selected = [hall];
  g.updateUI();
  assert(
    g.document
      .getElementById("actions")
      .children.some((card) =>
        card.children.some(
          (child) =>
            child.className === "action-description" &&
            child.textContent.includes("Gathers resources"),
        ),
      ),
  );
  const workerCard = g.document.getElementById("actions")._actionRows[0];
  assert(workerCard.description.textContent.length <= 24);
  const resources = { ...s.factions[0].resources }, queueLength = hall.train.length;
  workerCard.btn.onclick();
  assert(g.document.getElementById("details").innerHTML.includes("Harvests fields, trees, and gold deposits."));
  assert.equal(hall.train.length, queueLength, "inspecting a unit does not queue it");
  assert.deepEqual({ ...s.factions[0].resources }, resources, "inspecting a unit does not spend resources");
  assert(g.document.getElementById("details").innerHTML.includes('id="catalogTrain"'));
  g.document.getElementById("catalogTrain").onclick();
  assert.equal(hall.train.length, queueLength + 1, "the separate Train button queues the inspected unit");
});

test("building artwork preserves original assets and draws valid crops for every type and faction", () => {
  const { createHash } = require("node:crypto");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "assets/buildings/manifest.json"), "utf8"),
  );
  const dimensions = new Map();
  for (const file of manifest.files) {
    const bytes = fs.readFileSync(
      path.join(root, "assets/buildings", file.file),
    );
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
    dimensions.set(file.file, [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]);
  }
  class LoadedImage {
    set src(value) {
      this.url = value;
      this.onload();
    }
  }
  const sandbox = { window: {}, Image: LoadedImage };
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(root, "js/data.js"), "utf8"),
    sandbox,
  );
  vm.runInContext(
    fs.readFileSync(path.join(root, "js/buildings.js"), "utf8"),
    sandbox,
  );
  const art = sandbox.window.RealmfrontBuildings;
  const ctx = new Proxy(
    {
      drawImage(image, x, y, w, h, dx, dy, dw, dh) {
        const [width, height] = dimensions.get(path.basename(image.url));
        assert(x >= 0 && y >= 0 && x + w <= width && y + h <= height);
        assert([dx, dy, dw, dh].every(Number.isFinite));
        assert(dw > 0 && dh > 0);
      },
    },
    { get: (o, k) => o[k] ?? (() => {}) },
  );
  for (const [type, def] of Object.entries(
    sandbox.window.RealmfrontData.defs,
  )) {
    for (let f = 0; f < 10; f++)
      for (const time of [0, 0.2, 0.5, 1, 3]) {
        const b = { type, f, x: 100, y: 100, size: def.size };
        assert(art.draw(ctx, b, "#77b9e5", time));
        const r = art.bounds(b);
        assert(r.w > 0 && r.h > 0);
        assert(r.x < 100 && r.x + r.w > 100 && r.y < 100 && r.y + r.h > 100);
      }
    art.paintIcon({ getContext: () => ctx }, type);
  }
  art.images.get("Castle_Blue.png").ready = false;
  assert.equal(
    art.draw(ctx, { type: "hall", f: 0, x: 0, y: 0, size: 100 }),
    false,
  );
});

test("terrain art preserves source files, draws valid crops, and reuses landform caches", () => {
  const { createHash } = require("node:crypto");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "assets/terrain/manifest.json"), "utf8"));
  const dimensions = new Map();
  for (const entry of manifest.files) {
    const buffer = fs.readFileSync(path.join(root, "assets/terrain", entry.file));
    assert.equal(createHash("sha256").update(buffer).digest("hex"), entry.sha256);
    assert.equal(buffer.readUInt32BE(16), entry.width);
    assert.equal(buffer.readUInt32BE(20), entry.height);
    dimensions.set(entry.file, entry);
  }
  let draws = 0;
  const context = new Proxy({
    createRadialGradient: () => ({ addColorStop() {} }),
    drawImage(image, ...args) {
      draws++;
      if (args.length === 8) {
        const [x, y, w, h] = args;
        assert(x >= 0 && y >= 0 && w > 0 && h > 0);
        assert(x + w <= image.width && y + h <= image.height);
      }
    },
  }, { get: (o, k) => o[k] ?? (() => {}) });
  class Image {
    set src(value) {
      const entry = dimensions.get(path.basename(value));
      this.width = entry.width;
      this.height = entry.height;
      this.onload();
    }
  }
  const sandbox = { window: {}, Image, document: {
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
  } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "js/terrain-art.js"), "utf8"), sandbox);
  const art = sandbox.window.RealmfrontTerrainArt, terrain = game().terrain;
  assert(art.draw(context, terrain.landforms, terrain.tileSize));
  const initial = draws;
  assert(initial > terrain.landforms.length);
  assert(art.draw(context, terrain.landforms, terrain.tileSize));
  assert.equal(draws - initial, terrain.landforms.length);
  art.ground(context, terrain.landforms);
});

test("resources scale with kingdoms and form safe starter groves and contested gold veins", () => {
  const g = game();
  const routeLength = (a, b) => {
    const path = g.terrain.findPath(a, b); assert(path);
    let length = 0, previous = a;
    for (const p of path) { length += Math.hypot(p.x - previous.x, p.y - previous.y); previous = p; }
    return length;
  };
  for (let enemies = 2; enemies <= 9; enemies++) {
    g.document.getElementById("enemyCount").value = String(enemies);
    g.init();
    const s = g.state, kingdoms = enemies + 1;
    const ores = s.nodes.filter((n) => n.type === "ore");
    assert.equal(ores.length, 5 * kingdoms + 9);
    assert.equal(s.miningSites.filter((site) => site.area === "crossing").length, 3);
    assert.equal(s.miningSites.filter((site) => site.area === "frontier").length, kingdoms);
    assert.equal(s.fields.filter((site) => site.area === "starter").length, kingdoms);
    assert.equal(s.fields.filter((site) => site.area === "frontier").length, kingdoms);
    assert.equal(s.fields.filter((site) => site.area === "crossing").length, 3);
    for (const f of s.factions) {
      const site = s.miningSites.find((site) => site.owner === f.id);
      const grove = s.forests.find((grove) => grove.owner === f.id);
      const field = s.fields.find((field) => field.owner === f.id);
      const crops = s.nodes.filter((n) => n.group === field.id);
      assert.equal(crops.length, 2);
      assert(crops.every((n) => n.type === "field" && n.amount === 1200));
      assert(Math.hypot(field.x - f.x, field.y - f.y) < 520);
      assert.equal(s.fields.filter((field) => field.neighbors.includes(f.id)).length, 2);
      const starter = ores.filter((n) => n.group === site.id);
      assert.equal(starter.length, 2);
      assert.equal(starter.reduce((sum, n) => sum + n.amount, 0), 2400);
      assert.equal(s.nodes.filter((n) => n.group === grove.id).length, 12);
      assert(Math.hypot(site.x - f.x, site.y - f.y) < 490);
      assert(Math.hypot(grove.x - f.x, grove.y - f.y) < 550);
      assert.equal(s.miningSites.filter((site) => site.neighbors.includes(f.id)).length, 2, "each kingdom shares two gold expansions");
      assert.equal(s.forests.filter((site) => site.neighbors.includes(f.id)).length, 2, "each kingdom shares two forest expansions");
    }
    for (const site of s.miningSites.filter((site) => site.area !== "starter")) {
      const vein = ores.filter((n) => n.group === site.id);
      assert.equal(vein.length, 3);
      assert(vein.every((n) => n.amount === 2400));
      for (const n of vein)
        assert(s.factions.every((f) => Math.hypot(n.x - f.x, n.y - f.y) >= 600));
      for (const id of site.neighbors) assert(g.terrain.findPath(s.factions[id], site)?.length);
      if (site.neighbors.length) {
        const [a, b] = site.neighbors.map((id) => s.factions[id]);
        assert(Math.abs(routeLength(a, site) - routeLength(b, site)) <= 220.001, "shared gold has similar walking distance for both neighbors");
      }
    }
    for (const field of s.fields.filter((field) => field.area === "frontier")) {
      const [a,b] = field.neighbors.map((id) => s.factions[id]);
      assert(Math.abs(routeLength(a,field)-routeLength(b,field)) <= 320.001, "shared fields have similar walking distance for both neighbors");
    }
    const trees = s.nodes.filter((n) => n.type === "tree");
    assert(trees.filter((n) => n.area === "outlier").length < trees.length * 0.1);
    for (const grove of s.forests) {
      const members = trees.filter((n) => n.group === grove.id);
      assert(members.every((n) => Math.hypot(n.x - grove.x, n.y - grove.y) < 125));
      assert.equal(members.length, grove.area === "starter" ? 12 : 18);
      if (grove.neighbors.length) {
        const [a, b] = grove.neighbors.map((id) => s.factions[id]);
        assert(Math.abs(routeLength(a, grove) - routeLength(b, grove)) <= 320.001, "shared woodland has similar walking distance for both neighbors");
      }
    }
    for (const n of s.nodes) {
      assert(g.terrain.isWalkable(n.x, n.y, 55));
      assert(s.outposts.every((o) => Math.hypot(n.x - o.x, n.y - o.y) > 180));
      assert(s.buildings.every((b) => Math.hypot(n.x - b.x, n.y - b.y) > b.size * 0.72 + 46));
      for (const route of s.roads) for (let i = 1; i < route.length; i++) {
        const a = route[i - 1], b = route[i], dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((n.x - a.x) * dx + (n.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
        assert(Math.hypot(n.x - a.x - t * dx, n.y - a.y - t * dy) > 65);
      }
    }
    for (let i = 0; i < s.nodes.length; i++) for (let j = i + 1; j < s.nodes.length; j++) {
      const a = s.nodes[i], b = s.nodes[j];
      const gap = a.type === "tree" && b.type === "tree" ? 44 : 95;
      assert(Math.hypot(a.x - b.x, a.y - b.y) >= gap);
    }
  }
});

test("terrain rebuilds for every player count with elongated ridges and connected routes", () => {
  const g = game();
  const averages = [], amounts = [], ridgeLengths = [];
  let previous;
  for (let enemies = 2; enemies <= 9; enemies++) {
    g.document.getElementById("enemyCount").value = String(enemies);
    g.init();
    const t = g.terrain, s = g.state, kingdoms = enemies + 1;
    assert.equal(t.playerCount, kingdoms);
    assert.equal(t.landforms.filter((form) => form.role === "frontier").length, kingdoms);
    assert(t.landforms.filter((form) => form.role === "interior").length >= 9);
    assert.notEqual(t.obstacles, previous, "restart replaces collision footprints");
    previous = t.obstacles;
    const lengths = [];
    let elongated = 0;
    for (const form of t.landforms.filter((form) => form.role === "interior")) {
      const width = Math.max(...form.rows.map(([inset, width]) => inset + width)) * t.tileSize;
      const height = form.rows.reduce((sum, [, , depth]) => sum + depth, 0) * t.tileSize;
      lengths.push(Math.max(width, height));
      if (Math.max(width, height) / Math.min(width, height) >= 2.5) elongated++;
    }
    assert(elongated >= Math.ceil(lengths.length * 0.8));
    averages.push(lengths.reduce((sum, length) => sum + length, 0) / lengths.length);
    amounts.push(t.landforms.length);
    ridgeLengths.push(lengths.reduce((sum, length) => sum + length, 0) + t.landforms.filter((form) => form.role === "frontier").reduce((sum, form) => sum + Math.hypot(form.gate.x - form.anchor.x, form.gate.y - form.anchor.y) - 220, 0));
    for (const form of t.landforms.filter((form) => form.role === "frontier")) {
      const [a, b] = form.between.map((id) => s.factions[id]);
      assert(Math.abs(Math.hypot(a.x - form.anchor.x, a.y - form.anchor.y) - Math.hypot(b.x - form.anchor.x, b.y - form.anchor.y)) < 0.001, "frontier starts equally far from its neighbors");
      assert(t.clearLine(a, form.gate, 30) && t.clearLine(b, form.gate, 30), "both neighbors have a clear approach to their frontier pass");
      const position = g.world.perimeterPosition(form.anchor);
      const coastPoint = (offset) => {
        const p = g.world.perimeterPoint(position + offset);
        return t.nearestWalkable(Math.max(64, Math.min(g.world.width - 64, p.x)), Math.max(64, Math.min(g.world.height - 64, p.y)));
      };
      const from = coastPoint(-180), to = coastPoint(180);
      assert(!t.clearLine(from, to, 30), "frontier blocks the direct coastal shortcut");
      const route = t.findPath(from, to); assert(route);
      const depth = (p) => Math.min(p.x, p.y, g.world.width - p.x, g.world.height - p.y);
      assert(route.some((p) => depth(p) >= (10 + Math.ceil((kingdoms - 3) / 2)) * 96 - 96), "coastal routes must go inland around the barrier");
    }
    for (const o of t.obstacles) {
      assert(t.isWalkable(o.x + o.w / 2, o.y + o.h / 2, 0) === false);
      for (const f of s.factions) {
        const dx = Math.max(o.x - f.x, 0, f.x - o.x - o.w);
        const dy = Math.max(o.y - f.y, 0, f.y - o.y - o.h);
        assert(Math.hypot(dx, dy) >= 650, "settlement clearing remains open");
      }
    }
    for (const f of s.factions) for (const crossing of s.outposts) {
      const route = t.findPath(f, crossing);
      assert(route?.length, `kingdom ${f.id} reaches ${crossing.name} with ${enemies} enemies`);
      let previousPoint = f;
      for (const p of route) {
        assert(t.clearLine(previousPoint, p, 30));
        previousPoint = p;
      }
      assert(Math.hypot(previousPoint.x - crossing.x, previousPoint.y - crossing.y) < 1);
    }
  }
  assert(averages[0] > averages.at(-1) * 1.4, "crowded matches use more, shorter interior ranges");
  assert(amounts.at(-1) > amounts[0] * 1.5 && ridgeLengths.at(-1) > ridgeLengths[0] * 1.2, "large matches add more formations and more total barrier length");
});

test("starting positions balance all player counts around the island", () => {
  const w = game().world;
  for (let count = 3; count <= 10; count++) {
    const starts = w.startingPositions(count), step = w.perimeterLength(650) / count;
    for (let i = 0; i < count; i++) {
      const p = starts[i]; assert(w.contains(p.x, p.y, 650));
      const position = w.perimeterPosition(p, 650);
      assert(Math.abs(position - i * step) < 0.001, "equal spacing along the inset coast");
      for (const other of starts.slice(i + 1)) assert(Math.hypot(p.x - other.x, p.y - other.y) >= 1390);
      if (count % 2 === 0) {
        const opposite = starts[(i + count / 2) % count];
        assert(Math.abs(p.x + opposite.x - w.width) < 0.001 && Math.abs(p.y + opposite.y - w.height) < 0.001, "even-sized matches have opposite mirrored starts");
      }
    }
    const upper = starts.filter((p) => p.y < w.height / 2).length, lower = starts.filter((p) => p.y > w.height / 2).length;
    assert(Math.abs(upper - lower) <= 1, "starts are not concentrated in the lower half");
  }
});

test("nine enemies have safe settlements, unique colors, and reachable crossings", () => {
  const g = game();
  g.document.getElementById("enemyCount").value = "9";
  g.init();
  const s = g.state,
    t = g.terrain;
  assert.equal(s.enemyCount, 9);
  assert.equal(s.factions.length, 10);
  assert.equal(s.buildings.length, 50);
  assert.equal(new Set(s.factions.map((f) => f.color)).size, 10);
  assert(s.factions.every((f) => /^#[0-9a-f]{6}$/i.test(f.color)));
  for (const b of s.buildings)
    assert(t.isWalkable(b.x, b.y, b.size * 0.72 + 8));
  for (const n of s.nodes) assert(t.isWalkable(n.x, n.y, n.r + 30));
  for (const f of s.factions)
    for (const p of s.outposts) {
      const route = t.findPath(f, p);
      assert(route?.length, `Kingdom ${f.id} can reach ${p.name}`);
      let previous = f;
      for (const point of route) {
        assert(t.clearLine(previous, point, 30));
        previous = point;
      }
      assert(Math.hypot(previous.x - p.x, previous.y - p.y) < 1);
    }
});

test("units route around stepped highlands without cutting corners or crossing hollows", () => {
  const g = game(), t = g.terrain, frontier = t.landforms.find((f) => f.role === "frontier" && f.edge === "north");
  const start = t.nearestWalkable(frontier.anchor.x - 180, 64), goal = t.nearestWalkable(frontier.anchor.x + 180, 64);
  const u = g.addUnit(0, "cavalry", start.x, start.y, true);
  assert.equal(t.clearLine(u, goal, 30), false);
  let arrived = false,
    detour = 0;
  for (let i = 0; i < 1500 && !arrived; i++) {
    const previous = { x: u.x, y: u.y };
    arrived = g.moveToward(u, goal.x, goal.y, 0.05, 4);
    assert(t.isWalkable(u.x, u.y, 30));
    assert(t.clearLine(previous, u, 30));
    detour = Math.max(detour, Math.abs(u.y - start.y));
  }
  assert(arrived, "unit reaches the destination after navigating the ridge");
  assert(detour > 800);
});

test("orders snap off cliffs, construction rejects obstacles, and separation stays on land", () => {
  const g = game(),
    s = g.state,
    t = g.terrain,
    u = s.units.find((u) => u.f === 0 && u.type === "sword");
  s.selected = [u];
  g.issueMove(1500, 2350);
  assert(t.isWalkable(u.move.x, u.move.y, 30));
  assert.equal(g.validPlace("farm", 1500, 2350), false);
  const a = g.addUnit(0, "sword", 1216, 2300, true),
    b = g.addUnit(0, "sword", 1216, 2300, true);
  a.hold = b.hold = true;
  for (let i = 0; i < 20; i++) g.simulateUnits(0.05);
  assert(t.isWalkable(a.x, a.y, 30));
  assert(t.isWalkable(b.x, b.y, 30));
});

test("resource sprite crops remain valid through idle, harvesting, and depleted states", () => {
  const { createHash } = require("node:crypto"),
    m = JSON.parse(
      fs.readFileSync(
        path.join(root, "assets/resources/manifest.json"),
        "utf8",
      ),
    ),
    dimensions = new Map();
  m.files.push(
    JSON.parse(
      fs.readFileSync(
        path.join(root, "assets/resources/gold-deposits.json"),
        "utf8",
      ),
    ),
  );
  m.files.push(JSON.parse(fs.readFileSync(path.join(root, "assets/resources/farm-fields.json"), "utf8")));
  for (const f of m.files) {
    const bytes = fs.readFileSync(path.join(root, "assets/resources", f.file));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), f.sha256);
    dimensions.set(f.file, [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]);
  }
  class LoadedImage {
    set src(value) {
      this.url = value;
      this.onload();
    }
  }
  const sandbox = { window: {}, Image: LoadedImage };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "js/resources.js"), "utf8"),
    sandbox,
  );
  const art = sandbox.window.RealmfrontResources,
    ctx = new Proxy(
      {
        drawImage(image, x, y, w, h, dx, dy, dw, dh) {
          const [width, height] = dimensions.get(path.basename(image.url));
          assert(x >= 0 && y >= 0 && x + w <= width && y + h <= height);
          assert([dx, dy, dw, dh].every(Number.isFinite));
        },
      },
      { get: (o, k) => o[k] ?? (() => {}) },
    );
  for (const type of ["tree", "ore", "field"])
    for (const x of [500, 506, 512, 518])
      for (const amount of [0, 100, 1400])
        for (const time of [0, 0.1, 0.3, 0.6, 1, 3])
          assert(
            art.draw(
              ctx,
              {
                type,
                x,
                y: 500,
                r: 18,
                amount,
                max: 1400,
                lastHarvest: time,
              },
              time,
            ),
          );
  art.images.get("Tree.png").ready = false;
  assert.equal(art.draw(ctx, { type: "tree" }, 0), false);
});

test("action cursors load distinct full-size artwork with valid tool hotspots", () => {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, "js/cursors.js"), "utf8"), sandbox);
  const { apply, cursors } = sandbox.window.RealmfrontCursors;
  const canvas = { dataset: {}, style: {} }, hint = {
    classList: { toggle() {} }, style: {}, textContent: "",
  };
  const point = { inside: true, x: 50, y: 50, width: 500, height: 300 };
  assert.equal(Object.keys(cursors).length, 13);
  for (const [kind, cursor] of Object.entries(cursors)) {
    const svg = fs.readFileSync(path.join(root, "assets/cursors", `${kind}.svg`), "utf8");
    const width = Number(svg.match(/width="(\d+)"/)[1]);
    const height = Number(svg.match(/height="(\d+)"/)[1]);
    assert.equal(width, 40);
    assert.equal(height, 40);
    assert(cursor.x >= 0 && cursor.x < width && cursor.y >= 0 && cursor.y < height);
    assert(!svg.includes("M3 2 4 24 10 19"), "old shared arrow is removed");
    apply(canvas, hint, { kind, label: kind }, point);
    assert.equal(canvas.dataset.cursor, kind);
    assert.equal(canvas.style.cursor, `url("assets/cursors/${kind}.svg") ${cursor.x} ${cursor.y}, ${cursor.fallback}`);
  }
  apply(canvas, hint, { kind: "unknown", label: "" }, point);
  assert.equal(canvas.dataset.cursor, "default");
});

test("cursor intent follows selection, lumber, mining, repair, attack, and blocked ground", () => {
  const g = game(),
    s = g.state,
    worker = s.units.find((u) => u.f === 0 && u.type === "worker"),
    soldier = s.units.find((u) => u.f === 0 && u.type === "sword");
  const tree = { x: 900, y: 800, r: 18, type: "tree", amount: 100, max: 100 },
    ore = { x: 1000, y: 800, r: 18, type: "ore", amount: 100, max: 100 };
  s.nodes = [tree, ore];
  g.mouse.inside = true;
  g.mouse.wx = tree.x;
  g.mouse.wy = tree.y;
  s.selected = [worker];
  assert.equal(g.cursorAction().kind, "chop");
  g.mouse.wx = ore.x;
  assert.equal(g.cursorAction().kind, "mine");
  ore.amount = 0;
  assert.equal(g.cursorAction().kind, "move");
  const building = s.buildings.find((b) => b.f === 0 && b.type === "farm");
  building.hp -= 50;
  g.mouse.wx = building.x;
  g.mouse.wy = building.y;
  assert.equal(g.cursorAction().kind, "repair");
  const enemy = g.addUnit(1, "sword", 1100, 800, true);
  g.mouse.wx = enemy.x;
  g.mouse.wy = enemy.y;
  assert.equal(g.cursorAction().kind, "blocked", "workers cannot attack enemies");
  s.selected = [soldier];
  assert.equal(g.cursorAction().kind, "attack");
  s.selected = [];
  assert.equal(g.cursorAction().kind, "select");
  s.selected = [soldier];
  g.mouse.wx = 900;
  g.mouse.wy = 800;
  assert.equal(g.cursorAction().kind, "move");
  const obstacle = g.terrain.obstacles.find((o) => o.x > 500 && o.y > 500);
  g.mouse.wx = obstacle.x + obstacle.w / 2;
  g.mouse.wy = obstacle.y + obstacle.h / 2;
  assert.equal(g.cursorAction().kind, "blocked");
  s.command = "attack";
  assert.equal(g.cursorAction().kind, "attack");
  s.command = null;
  g.mouse.wx = -50;
  assert.equal(g.cursorAction().kind, "blocked");
  s.paused = true;
  assert.equal(g.cursorAction().kind, "blocked");
});

test("worker sprites use distinct axe, pickaxe, and repair tools while retaining walking frames", () => {
  const sandbox = {
    window: {},
    Image: class {
      set src(value) {}
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "js/sprites.js"), "utf8"),
    sandbox,
  );
  const art = sandbox.window.RealmfrontSprites,
    u = {
      id: 1,
      type: "worker",
      actionTime: 0.25,
      movedAt: -1,
      job: { kind: "gather", target: { type: "tree" } },
    };
  assert.equal(art.workerTask(u), "chop");
  assert.equal(art.frameFor(u, 1).row, 0);
  u.job.target.type = "ore";
  assert.equal(art.workerTask(u), "mine");
  u.job.kind = "repair";
  assert.equal(art.workerTask(u), "repair");
  u.actionTime = 0;
  u.movedAt = 1;
  assert.equal(art.frameFor(u, 1).row, 1);
  u.job = null;
  assert.equal(art.workerTask(u), null);
  u.actionTime = 0.5;
  u.actionDuration = 0.6;
  assert.equal(art.frameFor(u, 1).row, 2);
});
