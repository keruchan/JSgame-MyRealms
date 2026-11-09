const { chromium } = require(process.env.REALMFRONT_PLAYWRIGHT || "playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, "..");

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.REALMFRONT_CHROME || undefined, headless: true });
  try {
    for (const mobile of [false, true]) {
      const page = await browser.newPage({ viewport: mobile ? { width: 844, height: 390 } : { width: 1440, height: 960 }, hasTouch: mobile, isMobile: mobile });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/js/game.js", (route) => route.fulfill({ contentType: "application/javascript", body:
        fs.readFileSync(path.join(root, "js/game.js"), "utf8").replace("  // Startup",
          "window.workersTest={get state(){return S},camera,centerOn,updateUI,validPlace,simulateUnits,simulateBuildings};\n  // Startup") }));
      const activate = (locator) => mobile ? locator.tap() : locator.click();
      await page.goto(pathToFileURL(path.join(root, "index.html")).href);
      await activate(page.locator("#startGame"));
      await page.evaluate(async () => { await RealmfrontBuildings.ready; workersTest.state.speed = 0; });
      for (const type of ["farm", "lumber", "mine", "tower", "fortress", "hall", "barracks", "range", "stable", "workshop"]) {
        const name = await page.evaluate((type) => {
          const g = workersTest, d = RealmfrontData.defs[type];
          const original = g.state.buildings.find((b) => b.f === 0 && b.type === "hall");
          g.state.selected = [{ ...original, type, hp: d.hp, maxHp: d.hp, size: d.size }];
          g.state.catalogPreview = null;
          g.updateUI();
          return d.name;
        }, type);
        const recruits = ["hall", "barracks", "range", "stable", "workshop"].includes(type);
        assert.equal(await page.locator("#actionSection").isVisible(), recruits, `${name}: only recruitment buildings show the roster`);
        assert((await page.locator("#details").innerText()).includes(name));
        if (recruits) {
          assert((await page.locator("#actionTitle").textContent()).includes("Training"), `${name}: training title`);
          assert(await page.locator("#actions .action").count() > 0);
        } else {
          assert.equal(await page.locator("#actions .action").count(), 0);
          assert(await page.getByRole("button", { name: mobile ? "Upgrade" : "Upgrade [U]", exact: true }).isVisible(), "upgrades remain in the details");
          if (mobile) {
            const details = await page.locator("#details").boundingBox(), panel = await page.locator("#selectionPanel").boundingBox();
            assert(details.height > panel.height * .85, `${name}: details use the available rail height`);
            assert.equal(await page.locator("#mobileActionHost").isVisible(), false);
          }
        }
      }
      await page.evaluate(() => { workersTest.state.selected = []; workersTest.updateUI(); });
      assert(await page.locator("#actionSection").isVisible(), "deselecting restores construction");
      assert.equal(await page.locator("#actions .action").count(), 9);
      const point = (x, y) => page.evaluate(({ x, y }) => {
        const g = workersTest, r = document.getElementById("game").getBoundingClientRect();
        return { x: r.x + (x - g.camera.x) * g.camera.z, y: r.y + (y - g.camera.y) * g.camera.z };
      }, { x, y });
      const clickWorld = async (x, y) => {
        const p = await point(x, y);
        if (mobile) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
      };
      const building = (type) => page.evaluate((type) => {
        const b = workersTest.state.buildings.find((b) => b.f === 0 && b.type === type), r = RealmfrontBuildings.bounds(b);
        workersTest.centerOn(b.x, b.y);
        return { x: b.x, y: r.y + r.h * .2, id: b.id };
      }, type);
      const enter = async (workerId, type, direct = false) => {
        await page.evaluate((id) => {
          const g = workersTest, u = g.state.units.find((u) => u.id === id);
          u.job = null; u.hold = true;
          g.state.selected = [u];
          document.body.classList.remove("panel-open", "map-open", "actions-open", "rail-info", "rail-build", "rail-roster");
          g.updateUI();
        }, workerId);
        if (!direct) await activate(page.getByRole("button", { name: "Enter building", exact: true }));
        const b = await building(type);
        if (direct && !mobile) {
          const p = await point(b.x, b.y);
          await page.mouse.click(p.x, p.y, { button: "right" });
        } else await clickWorld(b.x, b.y);
        assert(await page.evaluate((id) => workersTest.state.units.find((u) => u.id === id)?.job?.kind === "enter", workerId));
        const arrived = await page.evaluate(({ id, buildingId }) => {
          const g = workersTest, b = g.state.buildings.find((b) => b.id === buildingId);
          for (let i = 0; i < 900 && !b.workers.some((u) => u.id === id); i++) g.simulateUnits(.05);
          g.updateUI();
          return b.workers.some((u) => u.id === id);
        }, { id: workerId, buildingId: b.id });
        assert(arrived);
        return b;
      };
      const workerId = await page.evaluate(() => workersTest.state.units.find((u) => u.f === 0 && u.type === "worker").id);
      for (const [houseType, nodeType, resource] of [["farm","field","food"],["mine","ore","gold"],["lumber","tree","wood"]]) {
        const site = await page.evaluate(({houseType,nodeType,id}) => {
          const g=workersTest,s=g.state,u=s.units.find(u=>u.id===id),b=s.buildings.find(b=>b.f===0&&b.type===houseType);
          const nodes=s.nodes.filter(n=>n.type===nodeType&&n.amount>0&&Math.hypot(n.x-b.x,n.y-b.y)<=600);
          const n=nodes.sort((a,c)=>Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(c.x-b.x,c.y-b.y))[0];
          if(!n)return null;
          for(const other of s.units.filter(v=>v.f===0&&v.type==="worker")){other.hold=true;other.job=null;}
          Object.assign(u,RealmfrontTerrain.nearestWalkable(n.x-72,n.y));u.hold=true;u.job=null;u.move=null;
          s.selected=[u];s.catalogPreview=null;g.centerOn(n.x,n.y);g.updateUI();return {x:n.x,y:n.y};
        },{houseType,nodeType,id:workerId});
        assert(site,"starting resource in range of its matching house");
        const p=await point(site.x,site.y);
        if(mobile)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y,{button:"right"});
        assert(await page.evaluate(id=>workersTest.state.units.find(u=>u.id===id)?.job?.kind==="gather",workerId), `${nodeType}: normal pointer order starts gathering`);
        for(const level of [1,2,3]) {
          const gain=await page.evaluate(({houseType,resource,level})=>{
            const g=workersTest,s=g.state;s.buildings.find(b=>b.f===0&&b.type===houseType).level=level;
            const before=s.factions[0].resources[resource];g.simulateUnits(1);g.simulateBuildings(1);g.updateUI();
            return s.factions[0].resources[resource]-before;
          },{houseType,resource,level});
          assert(Math.abs(gain-(1+level))<1e-6,`${resource}: fixed house income plus level-${level} outdoor worker`);
        }
        assert.equal(await page.getByRole("button",{name:mobile?"Upgrade":"Upgrade [U]",exact:true}).count(),0,"workers have no upgrade button");
        assert((await page.locator("#details").innerText()).includes("Gathering: 3/s"));
      }
      await page.evaluate(()=>{const g=workersTest;for(const u of g.state.units.filter(u=>u.f===0&&u.type==="worker")){u.job=null;u.hold=true;}g.state.selected=[];g.updateUI();});
      const hall = await building("hall");
      await clickWorld(hall.x,hall.y);
      await page.evaluate(()=>{workersTest.state.factions[0].resources={gold:5000,wood:5000,food:5000};workersTest.updateUI();});
      for(const cap of [60,100]) {
        await activate(page.getByRole("button",{name:mobile?"Upgrade":"Upgrade [U]",exact:true}));
        assert.equal(await page.evaluate(()=>workersTest.state.factions[0].cap),cap);
      }
      const pop = await page.evaluate(() => workersTest.state.factions[0].pop);
      const workerCostBefore = await page.evaluate(() => ({ ...workersTest.state.factions[0].resources }));
      await activate(page.getByRole("button", { name: "Worker", exact: true }));
      await activate(page.getByRole("button", { name: "Worker", exact: true }));
      assert.equal(await page.evaluate(() => workersTest.state.buildings.find(b=>b.f===0&&b.type==="hall").train.length),0,"card clicks only inspect the worker");
      assert.deepEqual(await page.evaluate(() => ({ ...workersTest.state.factions[0].resources })),workerCostBefore,"viewing details never spends resources");
      assert((await page.locator("#details").innerText()).includes("Harvests fields, trees, and gold deposits"));
      await activate(page.locator("#catalogTrain"));
      await page.evaluate(() => workersTest.simulateBuildings(6.1));
      assert.equal(await page.evaluate(() => workersTest.state.factions[0].pop), pop + 1);
      const recruit = await page.evaluate(() => Math.max(...workersTest.state.units.filter((u) => u.f === 0 && u.type === "worker").map((u) => u.id)));
      if (mobile) await activate(page.locator("#touchDeselect")); else await page.keyboard.press("Escape");
      await activate(page.getByRole("button", { name: "Archery Range", exact: true }));
      await page.evaluate(() => workersTest.centerOn(850, 600));
      const site = await page.evaluate(() => {
        const g = workersTest, r = document.getElementById("game").getBoundingClientRect(), sites = [];
        for (let x = 144; x < 1248; x += 24) for (let y = 180; y < 1000; y += 24) {
          const sx = (x - g.camera.x) * g.camera.z, sy = (y - g.camera.y) * g.camera.z;
          if (sx > 20 && sx < r.width - 20 && sy > 55 && sy < r.height - 145 && g.validPlace("range", x, y)) sites.push({ x, y });
        }
        return sites.sort((a, b) => Math.hypot(a.x - 800, a.y - 480) - Math.hypot(b.x - 800, b.y - 480))[0];
      });
      assert(site);
      await clickWorld(site.x, site.y);
      if (mobile) await activate(page.locator("#touchConfirmBuild"));
      assert(await page.evaluate(() => workersTest.state.buildings.some((b) => b.f === 0 && b.type === "range")));
      await enter(recruit, "range");
      const before = await page.evaluate(() => ({ pop: workersTest.state.factions[0].pop, ...workersTest.state.factions[0].resources }));
      const archer = page.getByRole("button", { name: "Archer", exact: true });
      assert((await archer.innerText()).includes("Retrain worker"));
      await activate(archer);
      assert.deepEqual(await page.evaluate(() => ({ pop: workersTest.state.factions[0].pop, ...workersTest.state.factions[0].resources })),before,"viewing retraining details does not charge or change population");
      assert.equal(await page.evaluate(()=>workersTest.state.buildings.find(b=>b.f===0&&b.type==="range").workers.length),1,"worker remains inside until Train is pressed");
      await activate(page.locator("#catalogTrain"));
      const paid = await page.evaluate(() => ({ ...workersTest.state.factions[0].resources }));
      assert(Math.abs(before.food - paid.food - 10) < 1e-6);
      assert(Math.abs(before.gold - paid.gold - 40) < 1e-6);
      await page.evaluate(() => workersTest.simulateBuildings(9.1));
      assert(await page.evaluate((id) => workersTest.state.units.some((u) => u.id === id && u.type === "archer"), recruit));
      assert.equal(await page.evaluate(() => workersTest.state.factions[0].pop), before.pop);
      await page.evaluate(()=>{workersTest.state.factions[0].resources={gold:0,food:0,wood:0};workersTest.updateUI();});
      assert.equal(await archer.isDisabled(),false,"unaffordable units can still be inspected");
      await activate(archer);assert(await page.locator("#catalogTrain").isDisabled());
      assert((await page.locator("#details").innerText()).includes("Not enough resources"));
      await page.evaluate(()=>{const g=workersTest,f=g.state.factions[0];f.resources={gold:5000,food:5000,wood:5000};f.cap=f.pop;g.updateUI();});
      await activate(archer);assert(await page.locator("#catalogTrain").isDisabled());
      assert((await page.locator("#details").innerText()).includes("Population limit reached"));
      await page.evaluate(()=>{workersTest.state.factions[0].cap=100;workersTest.updateUI();});
      for(let i=0;i<5;i++)await activate(page.locator("#catalogTrain"));
      assert(await page.locator("#catalogTrain").isDisabled());
      await activate(archer);assert((await page.locator("#details").innerText()).includes("Training queue is full"));
      assert.equal(await page.evaluate(()=>workersTest.state.buildings.find(b=>b.f===0&&b.type==="range").train.length),5);
      await page.evaluate(()=>{const g=workersTest,b=g.state.buildings.find(b=>b.f===0&&b.type==="range");b.train=[];b.queueInfo=[];g.state.paused=true;g.updateUI();});
      await activate(archer);assert(await page.locator("#catalogTrain").isDisabled());
      assert((await page.locator("#details").innerText()).includes("Resume the game"));
      const remote=await page.evaluate(()=>{
        const g=workersTest,s=g.state,builder=s.units.find(u=>u.f===0&&u.type==="worker");
        s.paused=false;s.speed=0;s.factions[0].resources={gold:5000,food:5000,wood:5000};
        s.selected=[];s.catalogPreview=null;s.catalogDismissed=false;
        for(let x=2004;x<5800;x+=120)for(let y=900;y<4100;y+=120){
          if(!RealmfrontTerrain.isWalkable(x-350,y,30)||!RealmfrontTerrain.isWalkable(x-351,y,30))continue;
          if(s.units.some(u=>u!==builder&&u.f===0&&u.type==="worker"&&Math.hypot(x-u.x,y-u.y)<=350))continue;
          builder.x=x-350;builder.y=y;
          if(g.validPlace("farm",x,y)){g.updateUI();g.centerOn(x,y);return {x,y,builder:builder.id,count:s.buildings.length};}
        }
      });assert(remote,"clear remote site in worker range");
      await activate(page.getByRole("button",{name:"Farm House",exact:true}));
      await clickWorld(remote.x,remote.y);
      if(!mobile){assert.equal(await page.evaluate(()=>workersTest.state.buildings.length),remote.count+1);}
      else{
        assert.equal(await page.evaluate(()=>workersTest.state.buildings.length),remote.count);
        await page.evaluate(p=>{const g=workersTest;g.state.units.find(u=>u.id===p.builder).x=p.x-351;g.updateUI();},remote);
        assert(await page.locator("#touchConfirmBuild").isDisabled());assert((await page.locator("#touchPlacementStatus").innerText()).includes("worker needed within 350"));
        assert.equal(await page.evaluate(()=>workersTest.state.factions[0].resources.wood),5000);
        await page.evaluate(p=>{const g=workersTest;g.state.units.find(u=>u.id===p.builder).x=p.x-350;g.updateUI();},remote);
        await activate(page.locator("#touchConfirmBuild"));
        assert.equal(await page.evaluate(()=>workersTest.state.buildings.length),remote.count+1);
      }
      assert.equal(await page.evaluate(()=>workersTest.state.factions[0].resources.wood),4925,"remote building pays exactly once");
      assert.deepEqual(errors, []);
      console.log(`PASS ${mobile ? "mobile" : "desktop"}: contextual building details/rosters, inspection/Train, worker conversion, limits, staffing, local and worker-enabled remote construction`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
