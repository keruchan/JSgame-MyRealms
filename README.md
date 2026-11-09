# King of the Conqueror's Realm

A browser-based RTS skirmish game built with HTML, CSS, JavaScript, and Canvas.

## Play locally

Open `index.html` in a modern browser. No installation, build step, or server is required.

## Project layout

```text
index.html          Page layout, HUD, menus, and canvas elements
css/styles.css      Theme, layout, buttons, overlays, and responsive styles
css/mobile.css      Landscape touch layout, safe-area spacing, and rotate prompt
js/data.js          Buildings, units, recruitment options, and research balance
js/world.js         Island dimensions, full-map camera bounds, minimap mapping, sea scenery
js/terrain.js       Highland/hollow footprints, collision checks, and unit pathfinding
js/terrain-art.js   Cached CC0 cliff/grass tiles, plateau shrubs, and meadow patches
js/game.js          Simulation, economy, orders, AI, rendering, and controls
js/sprites.js       Sprite loading, animation rows, faction colors, role markers
js/buildings.js     Building sprites, specialist variants, portraits, and placement art
js/resources.js     Animated pine trees, ore sprites, depletion states, and resource hit areas
js/resource-layout.js Starter forests, woodland groves, and strategic gold distribution
js/cursors.js       Context cursor artwork and hover action labels
js/help.js          In-game guide with unit/building icons, reference stats, and mechanics
js/mobile.js        Touch-device detection, landscape requirement, and fullscreen support
js/cheats.js        Hidden cheat-panel sequence, resource controls, and fast-training toggle
assets/characters/  Local CC0 character sheets, credits, and source checksums
assets/buildings/   Local CC0 building art, credits, and source checksums
assets/resources/   Local CC0 tree/rock art, credits, frame crops, and source checksums
assets/terrain/     Local CC0 ground/cliff tiles and shrubs, credits, and checksums
assets/cursors/     Original SVG cursor icons for movement, combat, and worker jobs
tests/game.test.cjs Deterministic mechanics tests using Node's built-in runner
```

## Making changes

- **Layout or menu text:** edit `index.html`. Preserve element IDs used by JavaScript.
- **Colors, spacing, or responsive layout:** edit `css/styles.css`. Theme variables are at the top; media queries handle smaller screens.
- **Buildings and costs:** edit `defs` in `js/data.js`.
- **Units and stats:** edit `udefs` in `js/data.js`; `unitByBuilding` determines recruitment options.
- **Research costs and duration:** edit `research` in `js/data.js`. Bonuses are applied by `combatDamage()`, `hit()`, and the economy simulation in `js/game.js`.
- **Starting resources and world setup:** edit `faction()` and `init()`.
- **Selection panels and commands:** edit `refreshActions()` and `refreshDetails()`.
- **Combat and economy:** edit the targeting/combat helpers and `simulateUnits()`, `simulateBuildings()`, and `simulateShots()`.
- **Enemy behavior:** edit `aiBuild()`, `aiTrain()`, `aiRaid()`, and `aiStep()`.
- **Graphics:** edit `drawWorld()`, `drawBuilding()`, `drawUnit()`, and `drawMini()`.
- **Character animations:** edit `js/sprites.js`; see [art credits](assets/characters/CREDITS.md) for the original source and license. The game uses the old CC0 Tiny Swords release, not the newer pack. Specialist units share base sprites with distinct role markers; siege engines retain Canvas artwork.
- **Crossings:** edit `S.outposts` in `init()`, plus `simulateStrategy()` and `drawStrategy()`.
- **Controls:** edit the event handlers near the bottom of `js/game.js`.

JavaScript sections are labeled with comments. The script retains its private function scope and loads after the HTML is parsed using `defer`.

## Controls

Help opens with mechanics; Controls is the last section. Phone/tablet and desktop controls have separate expandable groups, with your device shown first, followed by shared multi-selection gestures. Exact upgrade bonuses and prices are expandable. Unit, building, and research entries keep their icons and live definition-based stats.

On phones and tablets, rotate to **landscape**. Portrait mode holds the battle until you turn the device. Use **Fullscreen** to expand the game; orientation locking is attempted when the browser supports it. If fullscreen is unavailable, landscape browser play still works.

On touch, **hold for 0.3 seconds, then drag** to marquee-select friendly units. A quick swipe pans the camera; two fingers pan and pinch to zoom. With units selected, tap ground to move. Fighters tap enemies to attack; workers tap trees or gold to gather and cannot attack enemies. Tap a friendly unit to select that unit, or tap a friendly building to inspect it; workers can instead repair/enter an eligible friendly building. **Deselect** clears selection and cancels targeting without stopping existing orders. There are no Pan/Select/Order mode buttons.

The battlefield occupies the left pane; the fixed right rail contains selection information and a vertically scrolling construction/recruitment roster. The top bar toggles between **Full Map**, which fits the entire island, and **Base**, which returns to your starting base at local zoom. Details and the roster are available directly in the right rail; use **Deselect** to return to construction after selecting units or a training building. Purchase cards have a uniform 72-pixel height, an icon, name, cost, and one-line summary. Full descriptions and base stats appear above the roster in a compact parchment-style panel. Click or tap a unit card to inspect it; the separate **Train** button beside its name queues one unit. The icon sits beside the name, and stats use wrapping text instead of separate tiles. Inspecting units never spends resources or queues recruits, including workers and worker retraining. Unit cards stay inspectable when training is unavailable; Train shows the reason and is disabled for insufficient resources, a full queue, population limits, or pause. Building placement keeps its existing activation behavior. Use **Building info & commands** from a unit/research preview to inspect the selected training building. Scroll the details panel to reach additional stats and commands on short screens. Selected units get contextual Attack/Stop commands in the rail. Browsing position and button elements survive live HUD updates. To construct, tap land to preview, then **Build here** to confirm and pay. Cancel or Deselect exits placement without spending resources. Selling asks for confirmation on touch.

The mobile top bar displays King of the Conqueror's Realm, resources, **Full Map/Base**, speed, Pause/Resume, Fullscreen, and Help. Controls wrap onto a second row when needed to stay easy to tap. Unlocking cheats adds **Cheats** as the last/right button. The old Menu, minimap toggle, reports section, Repeat build, zoom buttons, and separate Base button are removed from mobile. The live rivals counter stays at the upper-right of the battlefield on a translucent, blurred badge; it does not intercept map gestures. Large resource values use compact counters with exact accessible labels. Backgrounding the game on touch pauses it; returning requires Resume. The portrait prompt preserves any existing manual pause. Safe-area padding and dynamic viewport sizing keep controls clear of device cutouts and browser chrome.

| Input                          | Action                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------- |
| Left-click                     | Select one unit or building                                                       |
| Shift-click / Shift-right-drag | Add units to the selection                                                        |
| Right-click                    | Move or attack; workers gather resources or repair damaged friendly buildings     |
| Left-drag / middle-drag        | Pan the camera                                                                    |
| Right-drag                     | Select multiple units with a selection box                                        |
| Arrow keys                     | Pan the camera (A attacks; S stops; L sells)                                       |
| Scroll                         | Zoom                                                                              |
| Q                              | Select all soldiers                                                               |
| A, then click                  | Attack-move: fight nearby enemies, then continue toward the destination           |
| S / Stop button                | Stop and hold position                                                            |
| Ctrl+1–9 / 1–9                 | Save / recall a group of living units                                             |
| H                              | Center on the starting base                                                       |
| M                              | Fit the entire island and decorative sea border in the view                       |
| Double-click/tap a fighter      | Select deployed fighters of the same type and kingdom             |
| Triple-click/tap a fighter      | Select all deployed fighters of that kingdom; workers excluded                      |
| Multiple-click/tap a worker       | Select all deployed workers of that kingdom                                       |
| Double-click/tap a building     | Select matching buildings of that kingdom                                         |
| Ctrl-click while placing       | Place multiple buildings; each click charges the normal price                     |
| U                              | Upgrade affordable eligible selected units/buildings, up to level 3               |
| L                              | Sell selected owned units/buildings; Town Halls are protected                     |
| Space / Esc                    | Pause or resume / deselect and cancel placement or targeting                       |

Select a recruitment building and right-click ground to set a rally point. Training queues hold up to five units and reserve population slots. Cancel Last Recruit refunds its resource cost.

Quick right-clicks tolerate a small drag and still issue movement or attack orders. A held drag starts a small selection box; larger drags select immediately. Once box selection starts, shrinking the box does not accidentally issue movement. Touch Select mode keeps its explicit drag behavior.

The actual mouse cursor changes shape for each action: a sword for attack, axe for lumber, pickaxe for gold, hammer for repair, masonry tool for construction, banner for rallying, compass for movement, and distinct selection/blocked cursors. The default cursor is an armored pointing glove; panning uses a closed glove. Tools replace the entire cursor, with hotspots aligned to their working tips. With workers selected, hover trees or gold to see the matching tool. Text hints provide supplementary instructions. See [cursor artwork](assets/cursors/README.md). Workers also carry and swing the matching tool while chopping, mining, or repairing, and their selection panel shows their current task.

Construction is enabled within **350 units of any living, deployed friendly worker**, anywhere on the playable map. The old 850-unit starting-base limit is removed. The worker need not be selected or idle and is not consumed; workers stationed inside buildings do not provide build range. Placement shows subtle worker-radius circles. Land, terrain, resource, crossing, building-overlap, enemy-structure spacing, and cost checks still apply. Worker presence is checked again when confirming, so moving out of range prevents construction without charging. Rival kingdoms use the same rule and build around their workers. Edit `buildRules.workerRadius` in `js/data.js` to adjust the radius.

Purchase cards, placement previews, and single or group selections show unit/building descriptions. Hold Ctrl during each placement click to keep the building type active; release it for the last placement, or press Esc to cancel. Shift-click placement also remains supported.

Selecting a Farm House, Lumber House, Mining House, Watchtower, or Stone Keep hides the construction/recruitment list on desktop and mobile. On mobile, details use the full rail height. Recruitment lists remain available for the Town Hall and military training buildings. Deselect to return to construction.

All fighting unit types and factions share **450-unit enemy detection**, including detection of enemy buildings. Workers have no enemy detection or combat: they only move, gather, repair, staff buildings, or retrain. Attack orders ignore workers even in a mixed selection. Weapon reach is unchanged: melee still needs to close in, and archers, siege units, and towers keep their own firing ranges. Damage to a friendly unit or building alerts allies within **700 units of that victim** to the actual attacker. Alerts stay with the attacked kingdom and do not call home defenders into a distant offensive battle. Fighters respond and healers support wounded units; workers keep their current work and never retaliate. Defensive pursuit ends when the attacker dies or leaves 900 units of the attack site; idle defenders return to their posts and interrupted military movement resumes. Fresh player orders override automatic defense. Stop holds position until a local attack triggers defense.

Individual upgrades are separate from research. Fighters gain health, damage and movement speed; healers restore more health. Workers cannot upgrade directly: retrain them in a military building, then upgrade the fighter. Resource-house levels improve nearby workers; military-building levels increase training speed. Town Hall upgrades provide **20 / 60 / 100 army slots**, replacing the removed House building. Upgrade prices appear in the details; batch upgrades skip workers and maximum-level or unaffordable items. Selling returns 50% of purchase and upgrade costs and refunds paid queue costs. The Town Hall cannot be sold.

**Farm Houses, Lumber Houses, and Mining Houses each produce a fixed 1 resource per game second**, at every level, with no occupants. Workers harvest separate finite farm fields, trees, or gold deposits outside. Each worker gathers **1/s**, increasing to **2/s or 3/s** when the resource is within **600 units** of a matching friendly level-2 or level-3 house. Only the highest house level applies; houses do not stack. No house is required for the base 1/s. Destruction, ownership, upgrades, and distance affect output immediately. Resource output does not depend on worker level, research, or AI difficulty. Improved Tools now increases repair speed by 25% per research level. No carrying or drop-off is required. Several workers can share a resource; when depleted, a worker searches within 600 units for another source of the same type. Fields have equal starter reserves per kingdom plus contested frontier and crossing plots. Farm art comes from Kenney's CC0 Tiny Farm pack; source, license, and crop coordinates are in `assets/resources/CREDITS.md`.

**Only Town Halls recruit workers** for 30 food and 15 gold in 6 seconds at base speed. Military buildings accept five workers across waiting and conversion slots. With workers inside, selecting a unit card shows conversion details; pressing Train converts a waiting worker. Without waiting workers, Train recruits normally. Conversion uses the normal unit training time and charges the difference between its base price and the worker's base price (Archer: 10 food + 40 gold). Worker identity, individual level, health proportion, invested costs, and population slot are preserved. The converted unit receives the building's rally order. Normal recruits reserve additional population; conversions do not, so they can finish at 100 population. Both share the five-entry training queue.

Canceling a conversion refunds its paid cost and returns its worker to the waiting pool. Selling a building refunds paid queue costs and ejects all workers. Destroying a building ejects workers but forfeits training costs. Exits use separate walkable positions; workers cannot become stranded inside a removed building. The normal 100-unit ceiling, capacity rules for new recruits, and fast-training cheat remain in effect.

The playable island is **6,600 × 4,900**, twice the original width and height (four times the area), with resources grouped into forests and mining areas. An additional 420-unit sea border surrounds it for scenery. Units, buildings, and rally destinations stay on land. Scroll can zoom out to fit the full island and border; **M** fits it immediately, and **H** returns to a close view of your base. The minimap uses the same sea-aware coordinate mapping.

Choose **2–9 enemy kingdoms**, for up to ten participants with distinct faction colors. Starts rebuild for each player count with equal spacing around an inset coast, 650 units from the outer boundary. Even-sized matches have mirrored opposite starts; ten-player games have five starts in each half of the island. Coastal frontiers bisect neighboring kingdoms and connect to the sea, preventing a shortcut along the border. Their inland reach grows from 960 to 1,344 units as player count increases. Interior ridges and rocky hollows add branching valleys: three-player maps have 12 formations; ten-player maps have 23, with more total barrier length. Starts keep 650-unit obstacle clearance, crossings keep 300 units, and shared resource clearings and 128-unit approach corridors remain open to both neighbors.

Pixel Frog's old CC0 terrain tiles match the existing sprites; see [terrain art credits](assets/terrain/CREDITS.md). Edit terrain anchors, orientations, and length scaling in `js/terrain.js`; artwork and collision share the resulting footprints. Navigation is rebuilt before roads and resource placement at the start of each match. Tile compositions use a weak cache, allowing images from previous match layouts to be released.

Units use cached visibility-graph routes around obstacles; collision and troop separation keep them on walkable ground. Buildings and resource deposits cannot spawn on obstacles. All settlements and crossings are connected by passable routes, with routed roads and obstacle markings on the minimap. Terrain blocks movement and construction; ranged attacks can travel across it. Elevation adds no combat bonus. Clicks inside obstacles are moved to nearby walkable ground. The layout takes the general direction of natural RTS terrain requested by the user; no Battle Realms artwork or maps are copied.

Pine trees and depleted rock rubble use Pixel Frog artwork from the old CC0 Tiny Swords release. Active gold deposits use a separate, original generated atlas with four fully golden, faceted boulder variants. Pines animate, react to chopping, and become stumps; gold rocks show mining sparkles, then become plain rubble. Visual resource bounds support clicking the tree canopy or gold rocks to assign workers. See [resource art credits](assets/resources/CREDITS.md).

Resource placement is configured in `js/resource-layout.js`. Every active kingdom receives the same nearby 12-tree starter grove and two 1,200-gold deposits. Each neighboring pair shares an 18-tree woodland at its inland frontier pass; three more woodlands surround the central crossings. One outlying tree accompanies each neutral woodland. Neutral forests contain equal quantities, while grove shape varies slightly each match. Shared woodlands stay within 320 walking units of equal travel distance from their two neighboring starts.

Gold expansions are deliberate three-deposit veins, each deposit holding 2,400 gold. Each kingdom shares two frontier veins, one with each coastal neighbor. Their placement compares actual routes around terrain and keeps the difference between the two approach distances within 220 units. Three additional veins lie near the central crossings, outside their capture circles. Total deposits are **5 × kingdoms + 9** (24 for two enemies; 59 for nine). Equal starter supplies support the opening; neutral gold and forests remain available for expansion and conquest. Resources stay off cliffs, starting buildings, roads, and capture circles, with gaps between distinct groves and veins.

Town Halls research weapons, armor, and economy tools, with three levels each and one research project per faction at a time. Spearmen counter cavalry; siege engines deal extra damage to buildings; raiders are effective against workers. Workers repair 25 HP per second for 0.12 wood per HP.

Military units capture crossings by remaining within the marked circle for 12 seconds; additional troops speed up capture, up to twice the rate. Workers cannot capture. Each controlled crossing provides 1.4 gold and 0.8 food per second. Multiple factions in the circle contest it, stopping both capture and income. Rivals research upgrades and send troops to contest crossings.

## Cheats

The **Cheats** button starts hidden. Click the **King of the Conqueror's Realm title five times**, then the **Time card once**, then **King of the Conqueror's Realm once more**. Repeat that exact sequence to hide it and close the panel. Other clicks reset the sequence; no rapid clicking or time limit is required. On mobile, use the title and Time card in the top bar. Successful unlock reveals Cheats at the far right of the top toolbar; each touch counts once. The title has no click animation or pressed styling.

Open Cheats, enter an amount, and choose **Add gold**, **Add lumber**, or **Add food**. Amounts must be whole numbers from 1 to 1,000,000,000. Resources go to the player only and can be added while paused. **Fast training (20×)** speeds up every player recruitment building, including stables; enemies keep normal training speed. Costs, five-unit queues, housing, and the 100-unit ceiling still apply.

**Add 10 army slots** increases your population capacity without a Town Hall upgrade, up to the existing limit of 100. It does not spawn free units: recruit them normally, or enable fast training. Added capacity persists alongside Town Hall upgrades, up to the 100-unit limit.

Hiding the button preserves resources, added army slots, and fast-training settings for the current match. New skirmishes restore normal starting resources/capacity and turn fast training off. Button visibility lasts until hidden by the sequence or the page reloads. The cheat panel does not pause the battle.

## Verification

With Node.js installed, run `npm test`. No packages need to be installed. Tests cover fixed resource-house income, outdoor worker gathering and house-level bonuses, Town Hall capacity/recruitment, worker retraining, queue/refund/population safety, building destruction, rally orders, combat, gathering, repair, research, capture, pause, controls, a ten-faction simulation, terrain connectivity, and artwork.

Optional browser checks: `npm run test:mobile`, with Playwright and Chromium available. `REALMFRONT_PLAYWRIGHT` can specify an existing Playwright module path and `REALMFRONT_CHROME` an existing Chrome executable. The checks exercise phone/tablet sizes from 568×320 to 1024×768, the fixed right rail, hold-and-drag selection, contextual tap commands, single/double/triple selection, panning/pinching, preview/confirm construction, selling, vertical roster scrolling, minimap navigation, portrait/pause safety, Help, and desktop selection/layout. These are browser-emulation checks, not physical-device testing.

`npm run test:workers` uses the same optional browser setup to exercise field/tree/deposit orders, house-level gathering rates, Town Hall capacity/recruitment, military entry/release, construction, cost-credit retraining, and population behavior through desktop and mobile interfaces.