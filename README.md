# 🤠 Lone Star Roam

**▶ Play it: https://ghostsysoutnull.github.io/lone-star-roam/**

A single-page free-roam game set in a scaled-down but **geographically real Texas** —
built from actual OpenStreetMap geometry, real census data, and the real state border.

- **Real geography**: four tiers of real OSM roads — interstates, US highways, state
  highways statewide, real arterial streets in nine metros — 26 major rivers (the Rio
  Grande traces the whole border), 6 big reservoirs, 132 real cities at their true
  locations sized by real population, and a 25-mile band of New Mexico, Oklahoma,
  Arkansas, Louisiana (and the Gulf) beyond every border, with its own real roads,
  rails, and towns.
- **Scale**: 1 game unit = 100 m. Texas is ~125 km of drivable world, ~10 min border to border.
- **Modes**: 🚙 drive a pickup, 🛶 helm a skiff on the Gulf and the lakes, ✈️ fly
  (the truck sprouts wings; 20 real airports with true runway headings), 🚶 walk as
  a cowboy — one key (<kbd>V</kbd>) cycles them. A shop jetpack opens a fifth way up.
- **Collect**: visit all 132 cities and 254 counties, find 39 real landmarks
  (🏛 the Alamo, Cadillac Ranch, Marfa Lights, Guadalupe Peak…), gather 300 yellow
  roses, spot 29 wildlife species, log ghost legends and energy heritage sites.
  Progress saves to localStorage across multiple save slots.
- **Working Texas**: mile-long freight in real operator liveries (UP, BNSF, CPKC)
  meeting on real sidings, commuter trains in DFW, named border trains at Laredo and
  Eagle Pass; ships, 227 real offshore platforms, and marked fairways on the Gulf;
  wind farms, refineries, and pumpjack fields where the real ones stand; crops,
  farmsteads, and cattle herds painted from the county-level 2022 Census of
  Agriculture.
- **Living world**: ambient traffic that brakes and honks, regional wildlife that
  flees you, helicopters and blimps overhead, a 12-minute day/night cycle, and
  region-weighted weather — Gulf rain, Panhandle lightning, West Texas dust. After
  dark: the Austin bat emergence, drifting ghost lights, and the occasional UFO.
- **Things to do**: delivery jobs between real cities build a bankroll; a shop
  spends it on truck upgrades, a weather radio, the jetpack, and Lacy the Blue Lacy
  truck dog. 12 named locals (plus townsfolk) talk Texas.
- **The real night sky**: 1,600 catalog stars with true positions/colors, 46
  constellation figures, the celestial sphere rotating for Texas latitude (Polaris
  due north at 31°), a moon with automatic phases, and today's actual planet positions.
- **Real terrain**: USGS/Terrarium elevation baked into the world (2.5× vertical) —
  the Hill Country rolls, the Guadalupes rise, roads and rivers drape the relief,
  and the county lines follow the ground.

## Run

Any static server (ES modules need http, not file://):

```bash
python3 -m http.server 8317
# open http://localhost:8317
```

Three.js loads from CDN; the geo data in `data/` is baked in and works offline.

## Controls

| Key | Action |
|---|---|
| W/S, A/D | throttle/brake, steer (all modes) |
| V | cycle Drive → Boat → Fly → Walk |
| Space / Ctrl | horn (drive) · climb / descend (fly) |
| E | talk to NPCs / advance dialog |
| P | travel menu — fast-travel, job board, shop |
| M | fullscreen map (Z zoom) · H help · R reset to nearest road |
| T | hold to fast-forward time |

Full list on the in-game help (<kbd>H</kbd>).

## Rebuilding the geo data

`data/*.json` is baked offline by the `tools/build-*.mjs` scripts from OSM Overpass
extracts (roads, rails, energy sites), US Census geography, the USDA 2022 Census of
Agriculture, Terrarium elevation tiles, and the d3-celestial star catalog. The raw
inputs are not in the repo; each script's header documents its query. Map data
© OpenStreetMap contributors, ODbL.

## Roadmap

Known limitations and planned features: see [ROADMAP.md](ROADMAP.md).
