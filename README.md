# Realmfront

A browser-based RTS skirmish game built with HTML, CSS, JavaScript, and Canvas.

## Play locally

Open `index.html` in a modern browser. No installation, build step, or server is required.
The previous entry point, `realmfront_rts.html`, has been renamed to `index.html`.

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

On phones and tablets, rotate to **landscape**. Portrait mode holds the battle until you turn the device. Use **Fullscreen** to expand the game; orientation locking is attempted when the browser supports it. If fullscreen is unavailable, landscape browser play still works.

The touch toolbar provides **Pan**, **Select**, and **Order** modes. Drag in Pan to move the camera; drag in Select to box-select or tap friendly units to add/remove them. Order taps issue movement, attacks, worker jobs, or rally points. Pinch to zoom, or use **+ / −**. **Army**, **Attack**, **Stop**, **Build**, **Repeat build**, **Cancel**, **Base**, and **Minimap** provide the remaining controls. Upgrade and Sell appear in the selection panel. Swipe the toolbar or construction cards horizontally to reach more options. Tap a unit/building twice quickly to select matching entities.

| Input                          | Action                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------- |
| Left-click                     | Select one unit or building                                                       |
| Shift-click / Shift-right-drag | Add units to the selection                                                        |
| Right-click                    | Move or attack; workers gather resources or repair damaged friendly buildings     |
| Left-drag / middle-drag        | Pan the camera                                                                    |
| Right-drag                     | Select multiple units with a selection box                                        |
| Arrow keys                     | Pan the camera (A attacks; S sells)                                               |
| Scroll                         | Zoom                                                                              |
| Q                              | Select all soldiers                                                               |
| A, then click                  | Attack-move: fight nearby enemies, then continue toward the destination           |
| Stop button                    | Stop and hold position                                                            |
| Ctrl+1–9 / 1–9                 | Save / recall a group of living units                                             |
| H                              | Center on the starting base                                                       |
| M                              | Fit the entire island and decorative sea border in the view                       |
| Double-click                   | Select all living units or buildings of the same type and kingdom, across the map |
| Ctrl-click while placing       | Place multiple buildings; each click charges the normal price                     |
| U                              | Upgrade affordable eligible selected units/buildings, up to level 3               |
| S                              | Sell selected owned units/buildings; Town Halls are protected                     |
| Space / Esc                    | Pause or resume / cancel placement or targeting                                   |

Select a recruitment building and right-click ground to set a rally point. Training queues hold up to five units and reserve population slots. Cancel Last Recruit refunds its resource cost.

Quick right-clicks tolerate a small drag and still issue movement or attack orders. A held drag starts a small selection box; larger drags select immediately. Once box selection starts, shrinking the box does not accidentally issue movement. Touch Select mode keeps its explicit drag behavior.

The cursor reflects the action under the pointer: select, move, attack, rally, construction, or blocked terrain. With workers selected, trees show an axe, gold deposits a pickaxe, and damaged friendly buildings a hammer. Cursor hints explain the corresponding command. Workers carry and swing the matching tool when chopping, mining, or repairing, and their selection panel shows their current task. Resource quantities, gathering rates, and repair costs are unchanged.

Purchase cards, placement previews, and single or group selections show unit/building descriptions. Hold Ctrl during each placement click to keep the building type active; release it for the last placement, or press Esc to cancel. Shift-click placement also remains supported.

Individual upgrades are separate from faction research. Units gain health, damage and movement speed; upgraded workers gather faster and healers restore more health. Economic buildings produce more, recruitment buildings train faster, houses and Town Halls add population capacity, and defenses gain health and attack power. Upgrade prices and combined selection costs appear in the selection panel. Batch upgrades skip maximum-level or unaffordable items. Selling returns 50% of purchase and upgrade costs, with full refunds for queued recruits. Units and capacity are removed immediately.

The playable island is **6,600 × 4,900**, twice the original width and height (four times the area), with resources grouped into forests and mining areas. An additional 420-unit sea border surrounds it for scenery. Units, buildings, and rally destinations stay on land. Scroll can zoom out to fit the full island and border; **M** fits it immediately, and **H** returns to a close view of your base. The minimap uses the same sea-aware coordinate mapping.

Choose **2–9 enemy kingdoms**, for up to ten participants with distinct faction colors. Long, narrow ridges and rocky hollows create branching valleys and flanking routes, with open settlement clearings and woodland along the foothills. Terrain rebuilds for the active kingdom count: three kingdoms receive nine longer ranges; ten kingdoms receive twelve shorter ranges. Most formations are at least 2.5 times longer than they are wide. Crowded matches have less blocked area and shorter detours, with at least 160 units between separate landforms, 650 units of clearance around active settlements, and 300 units around crossings.

Pixel Frog's old CC0 terrain tiles match the existing sprites; see [terrain art credits](assets/terrain/CREDITS.md). Edit terrain anchors, orientations, and length scaling in `js/terrain.js`; artwork and collision share the resulting footprints. Navigation is rebuilt before roads and resource placement at the start of each match. Tile compositions use a weak cache, allowing images from previous match layouts to be released.

Units use cached visibility-graph routes around obstacles; collision and troop separation keep them on walkable ground. Buildings and resource deposits cannot spawn on obstacles. All settlements and crossings are connected by passable routes, with routed roads and obstacle markings on the minimap. Terrain blocks movement and construction; ranged attacks can travel across it. Elevation adds no combat bonus. Clicks inside obstacles are moved to nearby walkable ground. The layout takes the general direction of natural RTS terrain requested by the user; no Battle Realms artwork or maps are copied.

Pine trees and depleted rock rubble use Pixel Frog artwork from the old CC0 Tiny Swords release. Active gold deposits use a separate, original generated atlas with four fully golden, faceted boulder variants. Pines animate, react to chopping, and become stumps; gold rocks show mining sparkles, then become plain rubble. Visual resource bounds support clicking the tree canopy or gold rocks to assign workers. See [resource art credits](assets/resources/CREDITS.md).

Resource placement is configured in `js/resource-layout.js`. Every active kingdom receives a nearby 12-tree starter grove and two 1,200-gold deposits. Neutral forests contain 18 trees each, with just one outlying tree per forest; there are 6 + ceil(kingdoms / 2) neutral forests in authored woodland regions. Trees draw from back to front, with distinct trunks and overlapping crowns.

Gold expansions are deliberate three-deposit veins, each deposit holding 2,400 gold. Three veins lie near the crossings, outside their capture circles. A minimum spanning tree of active settlements adds one frontier vein per neighboring-kingdom connection, near the midpoint of the passable route and roughly equidistant from the two kingdoms. Empty starting positions receive no starter reserves. Total deposits are **5 × kingdoms + 6** (21 for two enemies; 56 for nine). Gold remains available to any worker; defend access to a vein to control it. Placement searches keep resources off cliffs, starting buildings, roads, and capture circles, with gaps between distinct forests and veins. Starting reserves have equal quantities, while forest shape varies slightly each match.

Town Halls research weapons, armor, and economy tools, with three levels each and one research project per faction at a time. Spearmen counter cavalry; siege engines deal extra damage to buildings; raiders are effective against workers. Workers repair 25 HP per second for 0.12 wood per HP.

Military units capture crossings by remaining within the marked circle for 12 seconds; additional troops speed up capture, up to twice the rate. Workers cannot capture. Each controlled crossing provides 1.4 gold and 0.8 food per second. Multiple factions in the circle contest it, stopping both capture and income. Rivals research upgrades and send troops to contest crossings.

## Cheats

The **Cheats** button starts hidden. Click the **Realmfront title five times**, then the **Time card once**, then **Realmfront once more**. Repeat that exact sequence to hide it and close the panel. Other clicks reset the sequence; no rapid clicking or time limit is required. The title remains available in the mobile header, which can be swiped horizontally.

Open Cheats, enter an amount, and choose **Add gold**, **Add lumber**, or **Add food**. Amounts must be whole numbers from 1 to 1,000,000,000. Resources go to the player only and can be added while paused. **Fast training (20×)** speeds up every player recruitment building, including stables; enemies keep normal training speed. Costs, five-unit queues, housing, and the 100-unit ceiling still apply.

**Add 10 army slots** increases your population capacity without houses, up to the existing limit of 100. It does not spawn free units: recruit them normally, or enable fast training. Added capacity remains if houses are sold or destroyed.

Hiding the button preserves resources, added army slots, and fast-training settings for the current match. New skirmishes restore normal starting resources/capacity and turn fast training off. Button visibility lasts until hidden by the sequence or the page reloads. The cheat panel does not pause the battle.

## Verification

With Node.js installed, run `npm test`. No packages need to be installed. Tests cover recruitment, population limits, rally orders, refunds, attack-move, gathering, repair, research, capture, pause, controls, a ten-faction simulation, maze connectivity and collision safety, and resource sprite frames.
