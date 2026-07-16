# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Lone Star Roam** — a single-page Three.js free-roam game over a 1:100-scale, geographically real Texas. Real OSM highway geometry + real border + 132 real cities; procedural downtowns, drive/fly/walk modes, collectibles, NPCs. No build step, no framework, no npm install — plain ES modules with Three.js from CDN (importmap in `index.html`).

See `ROADMAP.md` for planned work and known limitations before proposing features. No active priority track: aviation shipped 2026-07-12, Agriculture (`AGRICULTURE_SPEC.md`, all 5 waves + 4.5/5.5 follow-ons) shipped 2026-07-14 — both folded into `ROADMAP.md`. Queued work lives in `BACKLOG.md`.

## Session briefing (greeting)

On the first message of a new session — before any other work — read `NEXT_SESSION.md`. If it contains a `## Session briefing` block, greet Bruno with it: the planned wave, the **recommended model + effort** (compare against the model actually running and flag any mismatch — he must set these manually via `/model` and `/effort`), and the wave budget. Then wait for his explicit go-ahead; after it, present the implementation plan before coding as usual. At each wave's session end, rewrite the briefing block for the next wave. When an effort has no queued waves, delete the block — the greeting disappears with it until the next spec writes a new one.

## Multi-wave protocol (starting a new track)

For any effort too big for one session (precedents: `AVIATION.md`, `HELICOPTER_SPEC.md`, `CHARTER_JOBS_SPEC.md`, the NPC expansion):

1. **Spec session**: write `<NAME>_SPEC.md` — goals, the wave split, and open calls resolved *before* any wave codes. Each wave = one session's deliverable: the code + its verify checks.
2. **Per wave, recommend model + effort**: Fable 5 for content/register/pool-writing waves, Sonnet 5 for structural/table-plumbing waves; effort usually high. Also state the wave's token budget (e.g. "code + checks, no shots, grep-first").
3. **Write the first `## Session briefing` block** into `NEXT_SESSION.md` (template below). Each wave's session end rewrites it for the next wave; the *last* wave deletes it and folds the whole track into one `ROADMAP.md` entry. The spec file stays as history.
4. **Per-wave session cycle**: greeting from the briefing → Bruno's go-ahead → implementation plan → his approval → code + checks → full `node tools/verify.mjs` → **wave-end performance report** → commit → step 3's rewrite.
5. **Wave-end performance report** (in-chat, before the commit): a compact ledger, not prose —
   - **Promised vs delivered**: briefed scope/budget vs what actually shipped.
   - **Time**: session wall-clock and where it went (code / checks / verify / detours).
   - **Verify economics**: targeted runs, full runs, flakes hit — and whether each flake was reasoned through or brute-force rerun.
   - **Budget adherence** (observable proxies, not token counts): screenshots taken, whole-file reads vs greps, reruns.
   - **Detours**: each one, its cost, and whether the cost was surfaced *before* it was taken.
   - **Honest ROI verdict**: was the wave worth its actual cost — stated plainly; mislabeled value (e.g. "optimization" that was really a reliability fix) called out.
6. **Wave-end plain-language summary** (in-chat, after the performance report): a short non-technical description of what changed and why it matters.

Briefing-block template:

```markdown
## Session briefing
- **This session**: <track>, wave N of M — <one-line scope>. Wave N−1
  (<scope>) shipped <date>, commit <hash>.
- **Recommended setup**: model **X**, effort **Y** — <one-line why,
  by wave shape>. Flag it if the running model differs.
- **Budget**: <deliverables + token rules for this wave>.
- **Then**: <what the wave-end rewrite or deletion should do>.

Gotchas carried over: <only what the next wave must know>
```

## Commands

```bash
# Run (ES modules require http, not file://)
python3 -m http.server 8317    # then open http://localhost:8317

# Session status in one call: git sync + dirty tree + recent commits +
# NEXT_SESSION.md freshness + syntax check of all modules. Run at session
# start instead of separate git/node commands, and again before committing.
tools/status.sh

# Fast Node-only contracts and pure production rules: all groups, or one named group.
node tools/test.mjs [aviation|data|progress|rules]

# Rebuild geo data (only needed if changing the pipeline; inputs are NOT in the repo)
node tools/build-data.mjs <us-states.json> <tx-motorways.json> <tx-trunks.json>

# Rebuild agriculture data (only needed if the census extract changes)
node tools/build-ag.mjs <tx_county_census2022.txt.gz>
```

Headless verification: `node tools/verify.mjs [-v] [-j N] [suite…]` — checked-in harness (own static server + cached Chromium), suites in `tools/checks/*.mjs`. Runs a **pool of parallel browser workers**, each suite in its own fresh game context; the full run is ~70 s on the current development machine (`-j` sets width; use named suites while iterating and the full run before pushing). **Suites must be hermetic**: they run in isolation and interleaved, so a suite may not rely on ambient real-loop-accumulated state (townsfolk drift, day/night clock) or on another suite's leftover mutations (perks, weather) — drive to the state you assert. Compact by default (one summary line per suite + any FAILs); `-v` prints every check with durations ≥1 s. One-time setup: `cd ~/.cache/lonestar-verify && npm i playwright-core` (browser from `~/.cache/ms-playwright`). The game exposes everything on `window.__game` (player, all systems, `nearestRoad`/`inTexas`/`hAt`, `ATMOS`, `clock`) — teleport via `player.pos.set(x, 0, z)`, switch modes via `player.setMode('WALK')`.

Testing workflow: after ordinary edits, run `node tools/test.mjs` (or its smallest named group); while changing a feature, run its named browser suite; run the full `node tools/verify.mjs` before every push. Fast checks complement browser sentinels — never treat them as a substitute for boot, wiring, scene, or player-behavior coverage. `TEST_CYCLE_SPEC.md` owns the group-to-sentinel ledger and future extraction candidates.

Verification rules:
- **Assert numbers, not pixels**: positions, speeds, headings, save state, DOM text. Screenshots (`t.shot`) only for genuinely visual judgments (composition, color, animation feel), max one per judgment, never the pass/fail signal — the charging-deer bug passed screenshot review and failed a distance-over-time assertion. **Default a new suite to no `SHOT` block** — add one only when explicitly asked for visual proof; do not copy a sibling suite's SHOT block, and a mis-staged shot is not a bug to iterate on.
- **When a check flakes, reason before rerunning**: read the failing values and find the boundary (often sampling cadence missing a monotonic edge), fix every check of that class in one pass, then confirm with ≤2 reruns — don't brute-force reruns as the diagnostic, and don't declare victory after one check greens while a sibling of the same class still flakes.
- **Wait in physics time, not wall time**: headless frames run ~5–15 fps and `Player.update` clamps dt at 0.05, so wall-clock waits under-simulate 2–3×. Use `t.simWait(s)` (polls `player.simT`); expected values that depend on weather must read live `ATMOS`.
- **Sim waits are cheap — use the steppers**: `t.simStep(s[, autopilot])` steps player(+dog) physics synchronously and returns `{maxSpeed, minAgl, maxGap, types}`; `t.step(s, body[, cond])` steps any system the same way (e.g. `'g.flares.update(dt)'`, early-exit on `cond`). The harness also sets `__skipRender` at boot — main.js skips only `renderer.render` (~300 ms/frame under SwiftShader) while every system update still ticks at full rAF speed, so sim time ≈ wall time and evaluates return fast; `t.shot` re-enables drawing for its frame. **Keep one real-loop sentinel per system** — walk-cap (player), cars-move (traffic), rack-recharge (flares), `setWeather` (sky) — so broken main.js wiring can't hide behind the steppers.
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
`tools/build-data.mjs` (offline, one-time) → `data/{border,highways,cities,rivers,lakes}.json` → loaded by `src/geo.js` into the `GEO` singleton at boot. Rivers/lakes come from `--rivers=`/`--lakes=` flags (OSM named-river regex fetch + Natural Earth 10m lakes); border rivers survive clipping via a ~3.5 km dilated-border test. `tools/build-sky.mjs` bakes d3-celestial star/constellation data → `data/sky.json` (equatorial unit vectors; sky.js rotates them for 31° N latitude — Orion aligned due south at game midnight via a numeric solve). Celestial materials must set `fog: false` or scene fog erases them. `tools/build-ag.mjs` bakes the USDA 2022 Census of Agriculture county extract (`~/claude-area/devel/tx-inputs/tx_county_census2022.txt.gz`, not in the repo) → `data/agriculture.json`, joined onto `counties.json` by name (254/254 asserted at bake time); `geo.js` loads it into `GEO.ag` and exports `agAt(x,z)` = `countyAt(x,z)` → record (null outside Texas). All modules read `GEO`; nothing fetches at runtime except these four build outputs. City list (names/lat-lon/population) is hardcoded in the build script, not fetched.

### Module graph
Function-level grep anchors for every module live in `MODULES.md` — grep a name + one targeted read beats a whole-file read. This is the default even for a new system that borrows from several modules: grep the idiom, read its ~20-line neighborhood, budget ~2 full-file reads per task and make each one earn its place.

`main.js` boots everything and owns the render loop. `geo.js` is the foundation: `GEO` data, spatial grid over highway segments (`nearestRoad`), `nearestCity`, `inTexas` point-in-polygon, and `seededRand(str)` — the deterministic RNG used by *all* procedural generation (cities, scenery, NPC placement, rose scatter). Same seed string ⇒ same world every session; changing seed strings invalidates players' spatial memory of the world.

- `world.js` — static world (Texas-shaped ground from border polygon, gulf, highway/river ribbon meshes, lakes, mountains) + `ScenerySystem` (chunked regional flora/props, 260-unit chunks; animated pumpjacks/windmills/pecking-chickens registered per-chunk in `group.userData.animated`). Also the census-painted ag layer: crop field decals + center-pivot circles (`CROP_STYLE` keyed by `agAt().dominantCrop`, sampled at chunk center; pivots skip rice counties — levee flooding, not pivots) and `farmsteadAt(cx,cz)` — a `chapelAt`-pattern pure seeded site function (odds from census herd+crop density, legality: road-clear ≥5 / `airportClear` / `brandNear` / city / chapel standoff) whose sites scenery dresses with the barn/house/tank/corral/windmill/silo/chicken kit; animals.js reads the same function for wave-3 herds.
- `animals.js` — `AnimalSystem`, chunked like scenery but simulated: regional species tables + census-scaled livestock rows (20 species), graze/wander/flee/lurk/coil/circle behaviors, herds homed at world.js `farmsteadAt`/`feedlotAt` sites + the Caprock bison herd, herd startle propagation, night-gated visibility via ATMOS (coyotes nocturnal, vultures diurnal), animal voices via `onSound` (howl/rattle/gobble in audio.js), critter-log callback into `gameplay.spotSpecies` (with per-species facts). Region boxes (plains, Hill Country, coast) are duplicated between world.js and animals.js region tables — keep them consistent. Flee heading math: `atan2(-dx,-dz)` where d = animal−player is *away* — do not add π (that bug shipped once; animals charged the player and headless eyes read it as fleeing). `scare(x,z,r)` backs the Space horn.
- `bats.js` — the Austin bat emergence: instanced ribbon from Congress Ave bridge, gated by `sky.t` (dusk window), logs the bat species when watched from within 130 units.
- `turtles.js` — the bats' dawn twin: Malaquite hatchling release on seeded mornings (`seededRand('turtle:'+day)`), `sky.t` dawn window, logs the Kemp's ridley when watched from the beach. Padre itself: `geo.js` `onIsland`/`beachAt` (wet-sand drive cap in vehicle.js), `world.js` `buildIslands` (fine sand grid; the coarse DEM grid hides under it) + `buildPadreSites` (causeway/SPI/jetties, exposed as `padreSites`), island scenery branch retries placement onto the strip.
- `traffic.js` — `TrafficSystem`, 4 vehicle types as InstancedMesh with vertex-color-baked details; per-instance tint only affects white bodywork. Car count follows local road supply (candidate polylines are clipped to the spawn ring; weight = in-range length × tier density, thinned per-tier at night via ATMOS). Cars follow, brake/honk/pull around a grounded lane-blocking player (`onHonk` → audio), hop to crossing polylines at ends (never vanish mid-view), and recycle via TTL only beyond 180 units.
- `npcs.js` — `NPCSystem`: 12 bespoke named characters + proximity-spawned townsfolk per city (hidden after dark). Characters sit on road shoulders via `roadShoulder()` — buildings reject roadway samples, so shoulders are guaranteed clear. Dialog assembled at interact time from context (weather/night/progress via the `getContext` callback) + rotating lines.
- `trains.js` / `maritime.js` / `ufo.js` — movers: freight consists by arc-length along real rails (hold at end-of-line while watched, never despawn in sight); ships on a hand-laid coastal lane + port/platform props; rare night UFOs near the real Texas case hotspots (ATMOS.ufo drives engine sputter + theremin).
- `haunts.js` — Haunted Texas: campfire-spooky night legends, never hostile — everything drifts, fades when approached, and vanishes at dawn (`ATMOS.night` gate). Chapel/cemetery *sites* come from world.js `chapelAt(cx,cz)` — a **pure seeded chunk function** (own seed stream), so haunts locates sites without spawning meshes and ScenerySystem builds the same sites independently. Wisp nights roll per site+game-day (`seededRand('wisp:key:day')`) — deterministic all night. Legends log via `gameplay.spotLegend` (9th collectible, `save.legends`, additive key); midnight bell via `onBell` → `audio.bell`.
- `sky.js` — `SkySystem` owns the only scene lights, sky/fog colors, clouds, rain, lightning. Exports mutable `ATMOS` `{wind, night, weather}` read by world.js (windmill speed), vehicle.js (headlights), and via `setNight()` hooks by cities/traffic — never add a second light rig; drive everything through ATMOS or the time keyframes in `KEYS`.
- `cities.js` — `CitySystem` spawns/despawns procedural downtowns within 600 units; buildings are `InstancedMesh`, height scaled by population. Exports `cityRadius(pop)` used by gameplay for visit-detection radii.
- `airports.js` — 20 real fields (3 tiers), runway headings/lengths/offsets authored one-time from OSM `aeroway=runway` geometry (true north, never runway numbers — those are magnetic). All static geometry merges into 8 global meshes; pads sit at **max** `hAt` over the footprint with draped skirts. `airportClear(x,z)` is a pure footprint query (chapelAt pattern) consumed by cities.js placement, ScenerySystem, and `chapelAt` — so airports.js may import only geo.js/sky.js (no cycles). `windFrom(day)` is the seeded per-day wind *direction* stream (`avnwind:`); windsocks read it now and waves 2/3 (runway-in-use, ATIS) must read the same stream, never fork it. Beacons are emissive meshes night-gated on `ATMOS.night` (sky.js owns all lights).
- `vehicle.js` — `Player`: one class, three modes (DRIVE/FLY/WALK) switched by rebuilding nothing — same pos/heading, different physics branch and avatar visibility. Also exports `mkStarMesh` (reused by gameplay).
- `gameplay.js` — collectibles + progress. Landmarks live here with real lat/lon via `LL()`. Save = `localStorage['lonestar-roam-save-v1']` `{cities:[names], landmarks:[names], roses:[indices]}` — rose indices are positions in the seeded scatter, so changing the rose RNG breaks saves. Extend the save with *new* keys only (missions added `bank`/`jobsDone`/`job`).
- `missions.js` — `MissionSystem`: delivery jobs between real cities (💼 Jobs tab in the travel menu). Offers reference cities *by name* (resolved against `GEO.cities` at use — renaming a city orphans an in-flight job, which self-clears). Load at origin → timed haul → deliver; ×1.5 bonus if the player never entered FLY, half pay when late; travel.js locks fast-travel while `job.phase === 'haul'`. Crate meshes live in `truck.userData.cargo` (vehicle.js); pay/deadline knobs at the top of `genOffers()`.
- `shop.js` — 🛒 Shop tab catalog + purchases. `applyGear()` turns `save.gear` levels into `player.perks` (+ truck paint via `truck.userData.bodyMat`); vehicle.js reads `perks` (never the save) in its DRIVE branch. Index 0 of each knob array is the stock value and **must match vehicle.js/gameplay defaults**. Prices/effects all live at the top of this file. The weather radio reads `sky.forecast`: weather picks hold 25–45 s as a forecast before blending (sky.js), invisible without the radio perk — harness `t.setWeather` clears it.
- `dog.js` — Lacy the Blue Lacy (one-off shop purchase, hidden until `save.gear.dog`). Rides parented to the truck (crate perch when `cargo.visible`), `scene.attach()` reparenting for the WALK follow, 1–2 yips queued by `honked()` a beat after the Space horn (`onBark` → audio).
- `debug.js` — playtest menu behind `?debug=1` (backquote toggles): buttons for time-of-day, haunts, UFOs, bats, weather. The `actions` table is *always* built and exposed on `__game.debug` (the verify `debug` suite drives it); only the panel + keybinding are URL-gated, so the public build stays honest.
- `hud.js` — DOM overlay + minimap/bigmap. Both maps blit from **one** offscreen canvas pre-rendered at startup (`renderMapLayer`); don't redraw highways per frame. UI text/panel sizes in `index.html` are **rem-based** (1rem = 10px at 100%): the +/- UI-scale setting works by retuning the root font-size (`hud.uiScale`), so new UI styles must size fonts and panel dimensions in rem, not px (px is fine for offsets/padding/radii).

### Verification lesson (learned twice)
Headless tests keep passing at *convenient* values while play breaks at *natural* ones: the compass was only ever tested at heading 0/90 (on the tick grid), plaques only at close walk distance (inside a too-small radius). When verifying HUD/interaction features, always test at ugly mid-drive values and at the distance a player actually parks (the collect-toast radius).

### Session workflow
- Expose every new system on `window.__game` at birth (main.js) — testability is free at creation, expensive to retrofit.
- Never change `seededRand` seed strings: determinism is what makes bugs cheaply reproducible, and players' saves + spatial memory depend on it.
- **Per-wave budget, stated up front**: the code + its verify checks are the deliverable and warrant full effort; the layer around them (screenshots, redundant reads, brute-force reruns, prose) is where tokens leak. Open each wave by naming the budget — e.g. "code + checks, no shots, grep-first" — so it's an explicit contract, not a mid-flight judgment call. Doc updates match the established bar and no further: `NEXT_SESSION.md` is a one-paragraph kickoff (not a spec), `MODULES.md` is one line per module.
- **Guard the briefed plan; make detour costs explicit.** A question ("what's your take on X?") is NOT a mandate to build X. Before any work that could eat significant time or divert from the briefed wave, state the concrete cost + opportunity cost and get an explicit choice — for optimization/tooling, lead with the ROI (gain vs cost, "pays back after ~N runs"), not the mechanism. A "yes" to a plan whose cost you never surfaced is an uninformed yes. (A curiosity about test perf once consumed a whole shields session this way.)
- **Check a tool exists before building on it**: before using any non-core CLI tool (`/usr/bin/time`, `bc`, `jq`, …), verify it's installed (`command -v <tool>`, batch-probe several at once); if it's missing, ask Bruno to install it (he can run `! <cmd>` in-session) rather than working around it or letting a command fail silently. Assuming `/usr/bin/time` + `bc` were present cost wasted run cycles once.
- Session end: update `NEXT_SESSION.md` (current task + gotchas only — queued work lives in BACKLOG.md, history in ROADMAP.md) and run `node tools/verify.mjs` before the final commit.

### Performance patterns to preserve
- All roads are a handful of merged meshes (one per tier: motorway/trunk/primary/street + stripe), built once — not chunked, not per-polyline. Tiers also drive speed caps (`vehicle.js`) and map styling (`hud.js`). Cities near a `street`-tier road skip their fake procedural grid (`hasRealStreets` in `cities.js`).
- Two near-coplanar giant surfaces z-fight at this world scale — keep big planes several units apart vertically and camera `near` at 0.5.
- Proximity systems (scenery chunks, city spawn, HUD `nearestRoad`/`nearestCity`) are throttled or grid-indexed; HUD updates at ~12 Hz, not per frame.
- Per-city geometry is disposed on despawn; shared geometries (`boxGeo`, scenery prototypes) must never be disposed.
