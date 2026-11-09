# Resource artwork

## Farm fields

`Farm_Tiles.png` is the unmodified `Tilemap/tilemap_packed.png` from **Tiny Farm 1.0 by Kenney**: https://kenney.nl/assets/tiny-farm . Downloaded November 9, 2026 from the creator's signed download endpoint. The archive's CC0 license is preserved as `Farm_License.txt`.

SHA-256: `0c4b3b4058cacf6a9bf021666838156d46da9ce27500d4c13e30cd5a92b722f4`.

King of the Conqueror's Realm draws the wheat crop at source rectangle `(112, 80, 16, 16)` in rows over original soil shapes. Harvesting adds a small sway; depleted fields show bare soil. These are separate harvestable food nodes, not buildings.

**Tiny Swords, old CC0 release, by Pixel Frog**

- Creator and original download: https://pixelfrog-assets.itch.io/tiny-swords
- Selected archive: **TS_old version_CC0 Licensed**, `Tiny Swords.zip` containing `Tiny Swords (Update 010)`.
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
- Original archive paths, dimensions, checksums, and draw-time frame crops are recorded in `manifest.json`.

The Pixel Frog PNGs are unmodified originals: `Resources/Trees/Tree.png` and the three stones from `Deco/05.png`, `Deco/06.png`, and `Deco/07.png`, renamed for clarity. The tree sheet includes idle, chopping, and stump frames. The stones are used as depleted ore rubble. Newer Free Pack and paid content are not included.

## Original golden deposits

`Gold_Deposits.png` is a separate, original four-variant sprite atlas generated for King of the Conqueror's Realm using the built-in `image_gen` tool on November 7, 2026. It is not part of the CC0 Tiny Swords pack and is not included in that pack's manifest or license claim. The user's reference supplied the general direction of angular, faceted golden rocks; the stock image and its watermark were not copied into the game.

The final prompt is saved in `Gold_Deposits.prompt.txt`. Actual dimensions, alpha-bound crop rectangles, and the SHA-256 checksum are in `gold-deposits.json`. The generated transparent PNG is preserved without image edits. King of the Conqueror's Realm chooses a stable shape variant per deposit and adds mining sparkles at runtime. Mining rules, amounts, and yields are unchanged.
