# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Lone Star Roam** — a single-page Three.js free-roam game over a 1:100-scale, geographically real Texas. Real OSM highway geometry + real border + 132 real cities; procedural downtowns, drive/fly/walk modes, collectibles, NPCs. No build step, no framework, no npm install — plain ES modules with Three.js from CDN (importmap in `index.html`).

See `ROADMAP.md` for planned work and known limitations before proposing features.

## Commands

```bash
# Run (ES modules require http, not file://)
python3 -m http.server 8317    # then open http://localhost:8317

# Session status in one call: git sync + dirty tree + recent commits +
# NEXT_SESSION.md freshness + syntax check of all modules. Run at session
# start instead of separate git/node commands, and again before committing.
tools/status.sh

# Rebuild geo data (only needed if changing the pipeline; inputs are NOT in the repo)
node tools/build-data.mjs <us-states.json> <tx-motorways.json> <tx-trunks.json>
```

Headless verification: `node tools/verify.mjs [suite…]` — checked-in harness (own static server + cached Chromium), suites in `tools/checks/*.mjs`, one PASS/FAIL line per check. One-time setup: `cd ~/.cache/lonestar-verify && npm i playwright-core` (browser from `~/.cache/ms-playwright`). The game exposes everything on `window.__game` (player, all systems, `nearestRoad`/`inTexas`/`hAt`, `ATMOS`, `clock`) — teleport via `player.pos.set(x, 0, z)`, switch modes via `player.setMode('WALK')`.

Verification rules:
- **Assert numbers, not pixels**: positions, speeds, headings, save state, DOM text. Screenshots (`t.shot`) only for genuinely visual judgments (composition, color, animation feel), max one per judgment, never the pass/fail signal — the charging-deer bug passed screenshot review and failed a distance-over-time assertion.
- **Wait in physics time, not wall time**: headless frames run ~5–15 fps and `Player.update` clamps dt at 0.05, so wall-clock waits under-simulate 2–3×. Use `t.simWait(s)` (polls `player.simT`); expected values that depend on weather must read live `ATMOS`.
- **Player-physics runs are ~instant with `t.simStep(s[, autopilot])`** — it steps `player.update` (+ dog) synchronously in one evaluate and returns `{maxSpeed, minAgl, maxGap, types}`; `autopilot: true` keeps the truck aimed down the nearest motorway. It does **not** advance render-loop systems (missions clock, sky/weather blends, traffic, animals, flares) — those need `t.simWait`. Keep the drive suite's walk-cap check on `simWait`: it's the deliberate frame-loop smoke test.
- **Location matters**: caps/behaviors change when the player strays within 4 units of any road — pick test spots with a road-free bubble covering the whole run, and use the empty I-10 west stretch (≈ x −2767, z 334) for clean motorway runs; Austin's real arterials clamp speed mid-run.
- New feature → add checks to an existing suite (or a new `tools/checks/<suite>.mjs`), don't write throwaway scripts. Run the full suite before committing — pushes deploy to GitHub Pages.

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
- `animals.js` — `AnimalSystem`, chunked like scenery but simulated: regional species tables (15 species), graze/wander/flee/lurk/coil/circle behaviors, herd startle propagation, night-gated visibility via ATMOS (coyotes nocturnal, vultures diurnal), animal voices via `onSound` (howl/rattle/gobble in audio.js), critter-log callback into `gameplay.spotSpecies` (with per-species facts). Region boxes (plains, Hill Country, coast) are duplicated between world.js and animals.js region tables — keep them consistent. Flee heading math: `atan2(-dx,-dz)` where d = animal−player is *away* — do not add π (that bug shipped once; animals charged the player and headless eyes read it as fleeing). `scare(x,z,r)` backs the Space horn.
- `bats.js` — the Austin bat emergence: instanced ribbon from Congress Ave bridge, gated by `sky.t` (dusk window), logs the 15th species when watched from within 130 units.
- `traffic.js` — `TrafficSystem`, 4 vehicle types as InstancedMesh with vertex-color-baked details; per-instance tint only affects white bodywork. Car count follows local road supply (candidate polylines are clipped to the spawn ring; weight = in-range length × tier density, thinned per-tier at night via ATMOS). Cars follow, brake/honk/pull around a grounded lane-blocking player (`onHonk` → audio), hop to crossing polylines at ends (never vanish mid-view), and recycle via TTL only beyond 180 units.
- `npcs.js` — `NPCSystem`: 12 bespoke named characters + proximity-spawned townsfolk per city (hidden after dark). Characters sit on road shoulders via `roadShoulder()` — buildings reject roadway samples, so shoulders are guaranteed clear. Dialog assembled at interact time from context (weather/night/progress via the `getContext` callback) + rotating lines.
- `trains.js` / `maritime.js` / `ufo.js` — movers: freight consists by arc-length along real rails (hold at end-of-line while watched, never despawn in sight); ships on a hand-laid coastal lane + port/platform props; rare night UFOs near the real Texas case hotspots (ATMOS.ufo drives engine sputter + theremin).
- `sky.js` — `SkySystem` owns the only scene lights, sky/fog colors, clouds, rain, lightning. Exports mutable `ATMOS` `{wind, night, weather}` read by world.js (windmill speed), vehicle.js (headlights), and via `setNight()` hooks by cities/traffic — never add a second light rig; drive everything through ATMOS or the time keyframes in `KEYS`.
- `cities.js` — `CitySystem` spawns/despawns procedural downtowns within 600 units; buildings are `InstancedMesh`, height scaled by population. Exports `cityRadius(pop)` used by gameplay for visit-detection radii.
- `vehicle.js` — `Player`: one class, three modes (DRIVE/FLY/WALK) switched by rebuilding nothing — same pos/heading, different physics branch and avatar visibility. Also exports `mkStarMesh` (reused by gameplay).
- `gameplay.js` — collectibles + progress. Landmarks live here with real lat/lon via `LL()`. Save = `localStorage['lonestar-roam-save-v1']` `{cities:[names], landmarks:[names], roses:[indices]}` — rose indices are positions in the seeded scatter, so changing the rose RNG breaks saves. Extend the save with *new* keys only (missions added `bank`/`jobsDone`/`job`).
- `missions.js` — `MissionSystem`: delivery jobs between real cities (💼 Jobs tab in the travel menu). Offers reference cities *by name* (resolved against `GEO.cities` at use — renaming a city orphans an in-flight job, which self-clears). Load at origin → timed haul → deliver; ×1.5 bonus if the player never entered FLY, half pay when late; travel.js locks fast-travel while `job.phase === 'haul'`. Crate meshes live in `truck.userData.cargo` (vehicle.js); pay/deadline knobs at the top of `genOffers()`.
- `shop.js` — 🛒 Shop tab catalog + purchases. `applyGear()` turns `save.gear` levels into `player.perks` (+ truck paint via `truck.userData.bodyMat`); vehicle.js reads `perks` (never the save) in its DRIVE branch. Index 0 of each knob array is the stock value and **must match vehicle.js/gameplay defaults**. Prices/effects all live at the top of this file. The weather radio reads `sky.forecast`: weather picks hold 25–45 s as a forecast before blending (sky.js), invisible without the radio perk — harness `t.setWeather` clears it.
- `dog.js` — Lacy the Blue Lacy (one-off shop purchase, hidden until `save.gear.dog`). Rides parented to the truck (crate perch when `cargo.visible`), `scene.attach()` reparenting for the WALK follow, 1–2 yips queued by `honked()` a beat after the Space horn (`onBark` → audio).
- `hud.js` — DOM overlay + minimap/bigmap. Both maps blit from **one** offscreen canvas pre-rendered at startup (`renderMapLayer`); don't redraw highways per frame. UI text/panel sizes in `index.html` are **rem-based** (1rem = 10px at 100%): the +/- UI-scale setting works by retuning the root font-size (`hud.uiScale`), so new UI styles must size fonts and panel dimensions in rem, not px (px is fine for offsets/padding/radii).

### Verification lesson (learned twice)
Headless tests keep passing at *convenient* values while play breaks at *natural* ones: the compass was only ever tested at heading 0/90 (on the tick grid), plaques only at close walk distance (inside a too-small radius). When verifying HUD/interaction features, always test at ugly mid-drive values and at the distance a player actually parks (the collect-toast radius).

### Session workflow
- Expose every new system on `window.__game` at birth (main.js) — testability is free at creation, expensive to retrofit.
- Never change `seededRand` seed strings: determinism is what makes bugs cheaply reproducible, and players' saves + spatial memory depend on it.
- Session end: update `NEXT_SESSION.md` (candidates + gotchas only — ROADMAP.md holds history) and run `node tools/verify.mjs` before the final commit.

### Performance patterns to preserve
- All roads are a handful of merged meshes (one per tier: motorway/trunk/primary/street + stripe), built once — not chunked, not per-polyline. Tiers also drive speed caps (`vehicle.js`) and map styling (`hud.js`). Cities near a `street`-tier road skip their fake procedural grid (`hasRealStreets` in `cities.js`).
- Two near-coplanar giant surfaces z-fight at this world scale — keep big planes several units apart vertically and camera `near` at 0.5.
- Proximity systems (scenery chunks, city spawn, HUD `nearestRoad`/`nearestCity`) are throttled or grid-indexed; HUD updates at ~12 Hz, not per frame.
- Per-city geometry is disposed on despawn; shared geometries (`boxGeo`, scenery prototypes) must never be disposed.
