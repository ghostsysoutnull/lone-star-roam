# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Lone Star Roam** — a single-page Three.js free-roam game over a 1:100-scale, geographically real Texas. Real OSM highway geometry + real border + 132 real cities; procedural downtowns, drive/fly/walk modes, collectibles, NPCs. No build step, no framework, no npm install — plain ES modules with Three.js from CDN (importmap in `index.html`).

See `ROADMAP.md` for planned work and known limitations before proposing features.

## Commands

```bash
# Run (ES modules require http, not file://)
python3 -m http.server 8317    # then open http://localhost:8317

# Syntax-check all modules (no test suite exists)
for f in src/*.js tools/*.mjs; do node --check "$f"; done

# Rebuild geo data (only needed if changing the pipeline; inputs are NOT in the repo)
node tools/build-data.mjs <us-states.json> <tx-motorways.json> <tx-trunks.json>
```

Headless verification (no system browser here): `npm install playwright` in a scratch dir, `npx playwright install chromium`, launch with `--no-sandbox --enable-unsafe-swiftshader` for WebGL. The game exposes `window.__game = { player, gameplay, GEO }` for test scripts — teleport via `player.pos.set(x, 0, z)`, switch modes via `player.setMode('WALK')`.

Re-downloading OSM inputs: Overpass **POST fails (406) from this environment — use GET** (`curl -sG --data-urlencode 'data=…'`). The `maps.mail.ru/osm/tools/overpass` mirror handles the large bbox queries when `overpass-api.de` is busy.

## Architecture

### Coordinate system (everything depends on this)
- 1 game unit = 100 m real. +x = east, **north = −z** (matches Three.js camera convention).
- Projection: equirectangular centered at 31°N, 99.5°W. Defined **twice**: in `tools/build-data.mjs` (`proj`) and inlined as `LL()` in `src/gameplay.js` (for landmark coordinates). If you change one, change both.
- Heading 0 = north (−z); movement is `x -= sin(heading)·speed`, `z -= cos(heading)·speed`.
- **Terrain**: real DEM in `data/elevation.bin` (uint16 meters, high bit = outside-Texas; grid constants duplicated between `tools/build-elevation.mjs` and `ELEV` in geo.js — keep in sync). `hAt(x,z)` (geo.js) is the single height source; vertical exaggeration (2.5×) is runtime-only in `VSCALE`, so retuning it needs no rebake. Everything that touches the ground must sample `hAt` — and altitude gameplay checks must use height *above ground* (`pos.y - hAt(...)`), not raw `pos.y`.
- World is ~12,500 × 11,800 units. Player scale is deliberately non-realistic (truck ≈ 4 units ≈ 400 m "real") — mini-world style.

### Data flow
`tools/build-data.mjs` (offline, one-time) → `data/{border,highways,cities,rivers,lakes}.json` → loaded by `src/geo.js` into the `GEO` singleton at boot. Rivers/lakes come from `--rivers=`/`--lakes=` flags (OSM named-river regex fetch + Natural Earth 10m lakes); border rivers survive clipping via a ~3.5 km dilated-border test. `tools/build-sky.mjs` bakes d3-celestial star/constellation data → `data/sky.json` (equatorial unit vectors; sky.js rotates them for 31° N latitude — Orion aligned due south at game midnight via a numeric solve). Celestial materials must set `fog: false` or scene fog erases them. All modules read `GEO`; nothing fetches at runtime except these three files. City list (names/lat-lon/population) is hardcoded in the build script, not fetched.

### Module graph
`main.js` boots everything and owns the render loop. `geo.js` is the foundation: `GEO` data, spatial grid over highway segments (`nearestRoad`), `nearestCity`, `inTexas` point-in-polygon, and `seededRand(str)` — the deterministic RNG used by *all* procedural generation (cities, scenery, NPC placement, rose scatter). Same seed string ⇒ same world every session; changing seed strings invalidates players' spatial memory of the world.

- `world.js` — static world (Texas-shaped ground from border polygon, gulf, highway/river ribbon meshes, lakes, mountains) + `ScenerySystem` (chunked regional flora/props, 260-unit chunks; animated pumpjacks/windmills registered per-chunk in `group.userData.animated`).
- `animals.js` — `AnimalSystem`, chunked like scenery but simulated: regional species tables, graze/wander/flee/circle behaviors, critter-log callback into `gameplay.spotSpecies`. Region boxes (Permian, plains, Hill Country) are duplicated between world.js and animals.js region tables — keep them consistent.
- `traffic.js` — `TrafficSystem`, 4 vehicle types as InstancedMesh with vertex-color-baked details; per-instance tint only affects white bodywork.
- `npcs.js` — `NPCSystem`: 12 bespoke named characters + proximity-spawned townsfolk per city (hidden after dark). Characters sit on road shoulders via `roadShoulder()` — buildings reject roadway samples, so shoulders are guaranteed clear. Dialog assembled at interact time from context (weather/night/progress via the `getContext` callback) + rotating lines.
- `trains.js` / `maritime.js` / `ufo.js` — movers: freight consists by arc-length along real rails (hold at end-of-line while watched, never despawn in sight); ships on a hand-laid coastal lane + port/platform props; rare night UFOs near the real Texas case hotspots (ATMOS.ufo drives engine sputter + theremin).
- `sky.js` — `SkySystem` owns the only scene lights, sky/fog colors, clouds, rain, lightning. Exports mutable `ATMOS` `{wind, night, weather}` read by world.js (windmill speed), vehicle.js (headlights), and via `setNight()` hooks by cities/traffic — never add a second light rig; drive everything through ATMOS or the time keyframes in `KEYS`.
- `cities.js` — `CitySystem` spawns/despawns procedural downtowns within 600 units; buildings are `InstancedMesh`, height scaled by population. Exports `cityRadius(pop)` used by gameplay for visit-detection radii.
- `vehicle.js` — `Player`: one class, three modes (DRIVE/FLY/WALK) switched by rebuilding nothing — same pos/heading, different physics branch and avatar visibility. Also exports `mkStarMesh` (reused by gameplay).
- `gameplay.js` — collectibles + progress. Landmarks live here with real lat/lon via `LL()`. Save = `localStorage['lonestar-roam-save-v1']` `{cities:[names], landmarks:[names], roses:[indices]}` — rose indices are positions in the seeded scatter, so changing the rose RNG breaks saves.
- `hud.js` — DOM overlay + minimap/bigmap. Both maps blit from **one** offscreen canvas pre-rendered at startup (`renderMapLayer`); don't redraw highways per frame.

### Verification lesson (learned twice)
Headless tests keep passing at *convenient* values while play breaks at *natural* ones: the compass was only ever tested at heading 0/90 (on the tick grid), plaques only at close walk distance (inside a too-small radius). When verifying HUD/interaction features, always test at ugly mid-drive values and at the distance a player actually parks (the collect-toast radius).

### Performance patterns to preserve
- All roads are a handful of merged meshes (one per tier: motorway/trunk/primary/street + stripe), built once — not chunked, not per-polyline. Tiers also drive speed caps (`vehicle.js`) and map styling (`hud.js`). Cities near a `street`-tier road skip their fake procedural grid (`hasRealStreets` in `cities.js`).
- Two near-coplanar giant surfaces z-fight at this world scale — keep big planes several units apart vertically and camera `near` at 0.5.
- Proximity systems (scenery chunks, city spawn, HUD `nearestRoad`/`nearestCity`) are throttled or grid-indexed; HUD updates at ~12 Hz, not per frame.
- Per-city geometry is disposed on despawn; shared geometries (`boxGeo`, scenery prototypes) must never be disposed.
