# Terrain artwork

**Tiny Swords, old CC0 release, by Pixel Frog**

- Creator and original download: https://pixelfrog-assets.itch.io/tiny-swords
- Selected download: **TS_old version_CC0 Licensed**, archive `Tiny Swords.zip`, root `Tiny Swords (Update 010)`.
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
- `manifest.json` records original archive paths, image dimensions, and SHA-256 checksums.

These PNGs are unmodified originals. `Tilemap_Elevation.png` supplies stone surfaces and cliff faces; `Tilemap_Flat.png` supplies grass; `08.png` and `09.png` supply small plateau shrubs. The newer Free Pack and paid artwork are not used.

`js/terrain-art.js` assembles 64-pixel source tiles into cached landforms, with palette adjustments at draw time to match King of the Conqueror's Realm. Terrain silhouettes and collision share the same 96-pixel map grid in `js/terrain.js`. Soft grass patches and forest placement provide foothills and valleys.

The island layout is original to King of the Conqueror's Realm. Battle Realms supplied the user's general direction of natural highlands, wooded edges, and multiple approaches; no Battle Realms artwork, maps, or game data are included. Elevation is visual: these highlands and hollows block movement and construction, without adding height or combat bonuses.
