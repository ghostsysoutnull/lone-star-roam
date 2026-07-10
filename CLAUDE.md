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
- World is ~12,500 × 11,800 units. Player scale is deliberately non-realistic (truck ≈ 4 units ≈ 400 m "real") — mini-world style.

### Data flow
`tools/build-data.mjs` (offline, one-time) → `data/border.json`, `data/highways.json`, `data/cities.json` → loaded by `src/geo.js` into the `GEO` singleton at boot. All modules read `GEO`; nothing fetches at runtime except these three files. City list (names/lat-lon/population) is hardcoded in the build script, not fetched.

### Module graph
`main.js` boots everything and owns the render loop. `geo.js` is the foundation: `GEO` data, spatial grid over highway segments (`nearestRoad`), `nearestCity`, `inTexas` point-in-polygon, and `seededRand(str)` — the deterministic RNG used by *all* procedural generation (cities, scenery, NPC placement, rose scatter). Same seed string ⇒ same world every session; changing seed strings invalidates players' spatial memory of the world.

- `world.js` — static world (Texas-shaped ground from border polygon, gulf, highway ribbon meshes, mountains) + `ScenerySystem` (chunked trees/cacti by region, 260-unit chunks around player).
- `cities.js` — `CitySystem` spawns/despawns procedural downtowns within 600 units; buildings are `InstancedMesh`, height scaled by population. Exports `cityRadius(pop)` used by gameplay for visit-detection radii.
- `vehicle.js` — `Player`: one class, three modes (DRIVE/FLY/WALK) switched by rebuilding nothing — same pos/heading, different physics branch and avatar visibility. Also exports `mkStarMesh` (reused by gameplay).
- `gameplay.js` — collectibles + NPCs + progress. Landmarks live here with real lat/lon via `LL()`. Save = `localStorage['lonestar-roam-save-v1']` `{cities:[names], landmarks:[names], roses:[indices]}` — rose indices are positions in the seeded scatter, so changing the rose RNG breaks saves.
- `hud.js` — DOM overlay + minimap/bigmap. Both maps blit from **one** offscreen canvas pre-rendered at startup (`renderMapLayer`); don't redraw highways per frame.

### Performance patterns to preserve
- All roads are a handful of merged meshes (one per tier: motorway/trunk/primary/street + stripe), built once — not chunked, not per-polyline. Tiers also drive speed caps (`vehicle.js`) and map styling (`hud.js`). Cities near a `street`-tier road skip their fake procedural grid (`hasRealStreets` in `cities.js`).
- Two near-coplanar giant surfaces z-fight at this world scale — keep big planes several units apart vertically and camera `near` at 0.5.
- Proximity systems (scenery chunks, city spawn, HUD `nearestRoad`/`nearestCity`) are throttled or grid-indexed; HUD updates at ~12 Hz, not per frame.
- Per-city geometry is disposed on despawn; shared geometries (`boxGeo`, scenery prototypes) must never be disposed.
