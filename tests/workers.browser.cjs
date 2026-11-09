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
      const enter = async (workerId, type) => {
        await page.evaluate((id) => {
          const g = workersTest, u = g.state.units.find((u) => u.id === id);
          u.job = null; u.hold = true;
          g.state.selected = [u];
          document.body.classList.remove("panel-open", "map-open", "actions-open", "rail-info", "rail-build", "rail-roster");
          g.updateUI();
        }, workerId);
        await activate(page.getByRole("button", { name: "Enter building", exact: true }));
        const b = await building(type);
        await clickWorld(b.x, b.y);
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
      const farm = await enter(workerId, "farm");
      assert((await page.locator("#details").innerText()).includes("2.00 food/s"));
      assert((await page.locator("#details").innerText()).includes("Workers inside: 1/1"));
      await activate(page.getByRole("button", { name: "Release workers", exact: true }));
      assert(await page.evaluate((id) => workersTest.state.units.some((u) => u.id === id), workerId));
      assert((await page.locator("#details").innerText()).includes("1.00 food/s"));
      const house = await building("house");
      await clickWorld(house.x, house.y);
      const pop = await page.evaluate(() => workersTest.state.factions[0].pop);
      const workerCostBefore = await page.evaluate(() => ({ ...workersTest.state.factions[0].resources }));
      await activate(page.getByRole("button", { name: "Worker", exact: true }));
      await activate(page.getByRole("button", { name: "Worker", exact: true }));
      assert.equal(await page.evaluate(() => workersTest.state.buildings.find(b=>b.f===0&&b.type==="house").train.length),0,"card clicks only inspect the worker");
      assert.deepEqual(await page.evaluate(() => ({ ...workersTest.state.factions[0].resources })),workerCostBefore,"viewing details never spends resources");
      assert((await page.locator("#details").innerText()).includes("Gathers wild resources"));
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
      assert.deepEqual(errors, []);
      console.log(`PASS ${mobile ? "mobile" : "desktop"}: inspection never purchases, explicit Train recruits/retrains, affordability/population/queue/pause limits, staffing and construction`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
