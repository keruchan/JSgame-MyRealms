
const { chromium } = require(process.env.REALMFRONT_PLAYWRIGHT || "playwright");
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, "..");
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.REALMFRONT_CHROME || undefined, headless: true });
  const errors = [];
  try {
    for (const [width, height, mobile] of [[568,320,true],[667,375,true],[844,390,true],[1024,768,true],[1440,960,false]]) {
      const page = await browser.newPage({ viewport: { width, height }, hasTouch: mobile, isMobile: mobile });
      page.on("pageerror", e => errors.push(e.message));
      await page.route("**/js/game.js", route => route.fulfill({ contentType: "application/javascript", body:
        fs.readFileSync(path.join(root,"js/game.js"),"utf8").replace("  // Startup", "window.mobileTest={get state(){return S},camera,viewport,world,validPlace,updateUI,init,addUnit};\n  // Startup") }));
      await page.goto(pathToFileURL(path.join(root,"index.html")).href);
      const gameName = "King of the Conqueror's Realm";
      assert.equal(await page.title(), `${gameName} \u2014 RTS Skirmish`);
      assert.equal(await page.locator("#startOverlay h1").textContent(), gameName);
      assert.equal(await page.locator("#gameTitle").getAttribute("aria-label"), gameName);
      assert.equal((await page.locator("#gameTitle .logo-name").innerText()).replace(/\s+/g, " ").trim(), gameName);
      const activate = locator => mobile ? locator.tap() : locator.click();
      await activate(page.locator("#startGame"));
      await page.evaluate(() => { const g=mobileTest; g.state.speed=0;const fighter=g.state.units.find(u=>u.f===0&&u.type==="sword");g.addUnit(0,"sword",fighter.x+50,fighter.y,true);for(const u of g.state.units){u.hold=true;u.job=null;u.think=1;} g.state.nodes=[{x:890,y:670,r:18,type:"tree",amount:1000,max:1000},{x:940,y:720,r:20,type:"ore",amount:1000,max:1000}];g.updateUI(); });
      await page.waitForTimeout(60);
      const point = (x,y) => page.evaluate(({x,y})=>{const c=mobileTest.camera,b=document.getElementById("game").getBoundingClientRect();return {x:b.x+(x-c.x)*c.z,y:b.y+(y-c.y)*c.z}}, {x,y});
      const tap = async (x,y) => {const p=await point(x,y);if(mobile)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);};
      const own = await page.evaluate(()=>mobileTest.state.units.filter(u=>u.f===0).map(u=>({id:u.id,type:u.type,x:u.x,y:u.y})));
      const fighter=own.find(u=>u.type!=="worker"),worker=own.find(u=>u.type==="worker");
      const ids = () => page.evaluate(()=>mobileTest.state.selected.map(u=>u.id));
      const canvas=await page.locator("#game").boundingBox();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      if(mobile){
        const top=await page.locator(".top").boundingBox();
        assert(canvas.height>=height-top.height-17 && canvas.width>=width*.58 && canvas.width<width*.8);
        assert.equal(await page.locator("#touchControls").isVisible(),false);
        assert.equal(await page.locator(".bottom").isVisible(),false);
        for(const id of ["gameTitle","touchDeselect","fitMap","speed","pause","fullscreen","help"]){const b=await page.locator("#"+id).boundingBox();assert(b&&b.width>=44&&b.height>=(id==="touchDeselect"?38:44)&&b.x+b.width<=width+1,id);}
        assert.equal(await page.locator("#touchDetailsTab, #touchBuild, #mobileMenuToggle, #touchMore, #touchMap, #touchMorePanel, .mobile-reports").count(),0,"Menu, minimap toggle and extra controls removed");
        const toolbar=await page.locator("#gameToolbar").boundingBox(),stats=await page.locator(".stats").boundingBox();
        assert(toolbar.y>=top.y&&toolbar.y+toolbar.height<=top.y+top.height+1&&toolbar.x>=0&&toolbar.x+toolbar.width<=width,"toolbar fits inside the top bar");
        const controls=await page.locator("#gameToolbar > button:visible").evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return {x:r.x,right:r.right};}));
        assert(controls.every((r,i)=>!i||r.x>=controls[i-1].right),"top buttons do not overlap");
        const title=await page.locator(".top > #gameTitle").boundingBox(),time=await page.locator("#timeStat").boundingBox();
        assert(title&&title.y>=top.y&&title.y+title.height<=top.y+top.height+1&&title.x+title.width<=stats.x&&time.x+time.width<=width,"the full game title remains visible beside the resources");
        const details=await page.locator("#details").boundingBox(),heading=await page.locator("#selectionHeading").boundingBox();
        assert(details.y<=canvas.y+(heading?.height||0)+2,"right panel starts with details instead of a tab row");
        const rivals=page.locator(".worldwrap > #factionsAlive"),rivalBounds=await rivals.boundingBox(),tip=await page.locator("#tip").boundingBox();
        assert(rivalBounds&&rivalBounds.x+rivalBounds.width<=canvas.x+canvas.width&&rivalBounds.x+rivalBounds.width>=canvas.x+canvas.width-10&&rivalBounds.y>=canvas.y&&rivalBounds.y<canvas.y+12,"rivals counter stays in the battlefield's upper-right corner");
        assert(tip.x+tip.width<=rivalBounds.x,"instructions leave room for the rivals counter");
        assert.equal(await page.locator("#gameToolbar #factionsAlive").count(),0);
        assert.equal(await rivals.evaluate(el=>getComputedStyle(el).pointerEvents),"none","counter does not block battlefield gestures");
      } else {assert(await page.locator("#actions").isVisible());assert.equal(await page.locator("#touchDeselect").isVisible(),false);}
      const titleButton=page.locator("#gameTitle"),timeButton=page.locator("#timeStat"),cheatButton=page.locator("#cheatButton");
      const unlock=async()=>{for(let i=0;i<5;i++)await activate(titleButton);await activate(timeButton);await activate(titleButton);};
      assert.equal(await cheatButton.isVisible(),false);
      await activate(titleButton);await activate(timeButton);await activate(titleButton);
      assert.equal(await page.evaluate(()=>RealmfrontCheats.visible),false,"incomplete sequence does not unlock cheats");
      // Reset the incomplete sequence with an unrelated control.
      await activate(page.locator("#pause"));await activate(page.locator("#pause"));
      for(let i=0;i<5;i++)await activate(titleButton);
      assert.equal(await page.evaluate(()=>RealmfrontCheats.visible),false,"five taps count once each and wait for Time");
      await activate(timeButton);assert.equal(await page.evaluate(()=>RealmfrontCheats.visible),false);
      await activate(titleButton);assert(await cheatButton.isVisible(),"unlock reveals Cheats immediately");
      if(mobile){
        const toolbar=await page.locator("#gameToolbar").boundingBox(),cheat=await cheatButton.boundingBox();
        assert(cheat.x+cheat.width<=width&&cheat.y>=toolbar.y&&cheat.y+cheat.height<=toolbar.y+toolbar.height+1,"Cheats fits in the top toolbar");
        assert(await page.locator("#gameToolbar > button:last-child").evaluate(el=>el.id==="cheatButton"),"Cheats is the last/right button");
      }
      await activate(cheatButton);assert(await page.locator("#cheatPanel").isVisible());
      const resources=await page.evaluate(()=>({...mobileTest.state.factions[0].resources}));
      await page.locator("#cheatAmount").fill("25");
      for(const resource of ["gold","wood","food"])await activate(page.locator(`[data-cheat-resource="${resource}"]`));
      for(const resource of ["gold","wood","food"])assert.equal(await page.evaluate(k=>mobileTest.state.factions[0].resources[k],resource),resources[resource]+25);
      await page.locator("#fastTraining").check();assert(await page.evaluate(()=>mobileTest.state.cheats.fastTraining));
      await page.locator("#fastTraining").uncheck();assert.equal(await page.evaluate(()=>mobileTest.state.cheats.fastTraining),false);
      const capacity=await page.evaluate(()=>mobileTest.state.factions[0].cap);
      await activate(page.locator("#cheatArmySlots"));assert.equal(await page.evaluate(()=>mobileTest.state.factions[0].cap),capacity+10);
      await activate(page.locator("#closeCheats"));await unlock();
      assert.equal(await page.evaluate(()=>RealmfrontCheats.visible),false,"same sequence hides cheats again");
      assert.equal(await cheatButton.isVisible(),false);assert.equal(await page.locator("#cheatPanel").isVisible(),false);
      console.log("PASS "+(mobile?width+"x"+height:"desktop")+": cheat unlock/hide, visible button, resources, fast training and army slots");
      await tap(fighter.x,fighter.y);assert.deepEqual(await ids(),[fighter.id]);
      await tap(fighter.x,fighter.y);assert.equal((await ids()).length,own.filter(u=>u.type===fighter.type).length);
      await tap(fighter.x,fighter.y);assert.equal((await ids()).length,own.filter(u=>u.type!=="worker").length);
      await tap(fighter.x,fighter.y);assert.equal((await ids()).length,own.filter(u=>u.type!=="worker").length);
      await tap(worker.x,worker.y);assert.deepEqual(await ids(),[worker.id]);
      await tap(worker.x,worker.y);assert.equal((await ids()).length,own.filter(u=>u.type==="worker").length);
      for(let i=0;i<3;i++){await tap(worker.x,worker.y);assert.equal((await ids()).length,own.filter(u=>u.type==="worker").length);}
      assert((await page.locator("#details").innerText()).includes("Worker"));
      assert.equal(await page.locator("#detailCommands button").filter({hasText:/^Attack/}).count(),0,"worker details have no attack command");
      if(mobile)assert.equal(await page.locator("#touchAttack").isVisible(),false);else assert(await page.locator("#attackMove").isDisabled());
      if(!mobile){await page.keyboard.press("Escape");assert.equal((await ids()).length,0);await page.close();console.log("PASS desktop single/double/triple selection and unchanged desktop panels");continue;}
      const deselect=()=>activate(page.locator("#touchDeselect"));
      await deselect();assert.equal((await ids()).length,0);
      await tap(worker.x,worker.y);await tap(890,670);
      assert.equal(await page.evaluate(id=>mobileTest.state.units.find(u=>u.id===id).job?.target.type,worker.id),"tree");
      await tap(940,720);assert.equal(await page.evaluate(id=>mobileTest.state.units.find(u=>u.id===id).job?.target.type,worker.id),"ore");
      await deselect();await tap(fighter.x,fighter.y);await tap(910,830);
      assert(await page.evaluate(id=>!!mobileTest.state.units.find(u=>u.id===id).move,fighter.id));
      const cdp=await page.context().newCDPSession(page);
      const drag=async(a,b,hold=0)=>{await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...a,id:1}]});if(hold)await page.waitForTimeout(hold);for(let i=1;i<=8;i++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:a.x+(b.x-a.x)*i/8,y:a.y+(b.y-a.y)*i/8,id:1}]});await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});};
      const troops=own.filter(u=>u.type!=="worker");
      await drag(await point(Math.min(...troops.map(u=>u.x))-22,Math.min(...troops.map(u=>u.y))-22),await point(Math.max(...troops.map(u=>u.x))+22,Math.max(...troops.map(u=>u.y))+22),340);
      assert.equal((await ids()).length,troops.length);
      const beforePan=await page.evaluate(()=>mobileTest.camera.x),selected=await ids();
      await drag({x:canvas.x+canvas.width*.5,y:canvas.y+canvas.height*.5},{x:canvas.x+canvas.width*.5+25,y:canvas.y+canvas.height*.5+10});
      assert.notEqual(await page.evaluate(()=>mobileTest.camera.x),beforePan);assert.deepEqual(await ids(),selected);
      const oldZoom=await page.evaluate(()=>mobileTest.camera.z),mx=canvas.x+canvas.width*.5,my=canvas.y+canvas.height*.5;
      await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:mx-30,y:my,id:1},{x:mx+30,y:my,id:2}]});await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:mx-50,y:my,id:1},{x:mx+50,y:my,id:2}]});await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
      assert((await page.evaluate(()=>mobileTest.camera.z))>oldZoom);assert.deepEqual(await ids(),selected);
      await deselect();
      await page.evaluate(()=>{window.card=document.querySelector("#actions button");document.getElementById("actions").scrollTop=180;});const scroll=await page.locator("#actions").evaluate(e=>e.scrollTop);await page.waitForTimeout(400);assert(await page.evaluate(()=>card===document.querySelector("#actions button")));assert.equal(await page.locator("#actions").evaluate(e=>e.scrollTop),scroll);
      const sizes=await page.locator("#actions .action").evaluateAll(cards=>cards.map(card=>({height:card.getBoundingClientRect().height,summary:card.querySelector(".action-description").textContent,lines:card.querySelector(".action-description").getBoundingClientRect().height})));
      assert(sizes.every(card=>card.height===72&&card.summary.length<=24&&card.lines<=17),"uniform compact cards with single-line summaries");
      assert((await page.locator("#details").innerText()).includes("Produces a fixed 1 food/s."));
      await activate(page.getByRole("button",{name:"Farm House",exact:true}));
      assert((await page.locator("#details").innerText()).includes("Produces a fixed 1 food/s."));
      await page.evaluate(()=>{const g=mobileTest;g.camera.z=.7;g.camera.x=620-g.viewport.w/(2*g.camera.z);g.camera.y=480-g.viewport.h/(2*g.camera.z);});
      const count=await page.evaluate(()=>mobileTest.state.buildings.filter(b=>b.f===0).length);
      const site=await page.evaluate(()=>{const g=mobileTest,sites=[];for(let x=120;x<1300;x+=24)for(let y=180;y<1000;y+=24){const sx=(x-g.camera.x)*g.camera.z,sy=(y-g.camera.y)*g.camera.z;if(sx>20&&sx<g.viewport.w-20&&sy>45&&sy<g.viewport.h-140&&g.validPlace("farm",x,y))sites.push({x,y});}return sites.sort((a,b)=>Math.hypot(a.x-750,a.y-430)-Math.hypot(b.x-750,b.y-430))[0];});assert(site,"reachable build site");
      await tap(site.x,site.y);assert.equal(await page.evaluate(()=>mobileTest.state.buildings.filter(b=>b.f===0).length),count);await activate(page.locator("#touchConfirmBuild"));assert.equal(await page.evaluate(()=>mobileTest.state.buildings.filter(b=>b.f===0).length),count+1);
      await activate(page.locator("#detailCommands button").filter({hasText:/^Sell/}));await activate(page.getByRole("button",{name:"Keep selection",exact:true}));await activate(page.locator("#detailCommands button").filter({hasText:/^Sell/}));await activate(page.getByRole("button",{name:"Sell selected",exact:true}));await page.waitForFunction(n=>mobileTest.state.buildings.filter(b=>b.f===0).length===n,count);
      await activate(page.locator("#fitMap"));assert(await page.evaluate(()=>Math.abs(mobileTest.camera.z-mobileTest.world.fitZoom(mobileTest.viewport))<1e-6),"Full Map fits the battlefield");
      assert.equal((await page.locator("#fitMap").innerText()).trim(),"Base");
      await page.setViewportSize({width:width+6,height});await page.setViewportSize({width,height});
      assert.equal((await page.locator("#fitMap").innerText()).trim(),"Base","resize preserves the Base action");
      await activate(page.locator("#fitMap"));assert.equal((await page.locator("#fitMap").innerText()).trim(),"Full Map");
      assert(await page.evaluate(()=>{const g=mobileTest,b=g.state.factions[0];return g.camera.z>g.world.fitZoom(g.viewport)&&b.x>=g.camera.x&&b.x<=g.camera.x+g.viewport.w/g.camera.z&&b.y>=g.camera.y&&b.y<=g.camera.y+g.viewport.h/g.camera.z;}),"Base restores local zoom with the home base visible");
      assert.equal(await page.locator("#minimap").isVisible(),false);assert(await page.locator("#actions").isVisible());
      for(const expected of [1,2,3,1]){await activate(page.locator("#speed"));assert.equal(await page.evaluate(()=>mobileTest.state.speed),expected);}await page.evaluate(()=>mobileTest.state.speed=0);
      await activate(page.locator("#help"));await page.locator("#helpDialog").waitFor({state:"visible"});await activate(page.locator("#closeHelp"));
      await activate(page.locator("#pause"));await page.waitForFunction(()=>mobileTest.state.paused);await page.setViewportSize({width:height,height:width});await page.locator("#landscapePrompt").waitFor({state:"visible"});await page.setViewportSize({width,height});await page.locator("#landscapePrompt").waitFor({state:"hidden"});assert(await page.evaluate(()=>mobileTest.state.paused));
      console.log("PASS "+width+"x"+height+": top toolbar, Full Map, speed, help, fixed right rail, gestures, build/sell and portrait safety");await page.close();
    }
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
