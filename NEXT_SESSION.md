# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: the Shoulder & the Shelf (`SHOULDER_SHELF_SPEC.md`),
  wave 2 of 7 — "The Neighbors": band cities live through the existing
  city machinery on fresh additive seed streams (buildings scaled by real
  pop from `data/band-places.json`, partial edge-cities render whatever
  falls inside); silver stars (world prop + map, gold-vs-silver Law);
  Passport save/HUD (`save.passport`: state stamps, band towns, Corner
  Stones land in W6, away landings); townsfolk from existing pools by
  pop (named NPCs stay Texan); band fields join AIRPORTS + ROUTES + the
  schedule (spokes at SHV/TXK/CVN/HOB — **band roads/airport runway data
  were NOT baked in W1**, see gotchas); Cannon + Barksdale military
  flavor pairs; charter offers may draw TX↔band pairs. W1 (ground/bounds/
  data pipeline) shipped 2026-07-14, commit TBD (see `git log`).
- **Recommended setup**: model **Sonnet 5**, effort **high** — still
  structural (city/save/aviation-table plumbing), no register writing yet
  (that's W7). Flag it if the running model differs.
- **Budget**: code + checks, no shots, grep-first. Checks: band city
  renders + silver star + Passport town tick; Texas counters byte-still
  after a full band visit; no travel-menu entry / fast-travel lock;
  townsfolk spawn + night gate at a band city; `daySchedule` runs clean
  over the full field table (ROUTES-completeness — the LBJ-crash class of
  bug); a TX↔band charter full cycle + Passport landing stamp.
- **Then**: rewrite this block for wave 3 (Padre & the coast road,
  content, Fable 5).

Gotchas from W1 (whoever touches band cities/aviation/the map next must know):
- **Band roads and band airport runway geometry were never baked** — W1's
  budget ran out on places+population (Bruno: "do it right") and the
  runtime core (inWorld/soft wall/terrain/map/HUD), all of which W1's own
  checks require; roads/airports are pure W2 inputs with no W1 check
  depending on them, so they were explicitly slipped. **W2 needs to bake
  them first**: Overpass GET refetch for through-stubs (I-10 E/W, I-20,
  I-30, I-35, I-40, US-287/87/84/62-180/71) + primaries around band
  cities, and `aeroway=runway` geometry for SHV/TXK/CVN/HOB + Cannon/
  Barksdale + curated tier-3 strips (406s on POST here — GET only,
  `maps.mail.ru/osm/tools/overpass` mirror for big bboxes).
- **`data/band-places.json`** (177 rows: LA 39, AR 15, OK 104, NM 19) has
  `{name, state, pop, x, z}`, sorted by pop desc — built by
  `tools/build-band.mjs` from Census cartographic boundary + Population
  Estimates Program files (see below). **Hochatown, OK has no population
  row at all** in the 2022 vintage (checked: no STATE=40/PLACE=35030 row) —
  a genuine data gap, not a bug; it's in-band by distance but was dropped
  from the join. If W2 wants Hochatown rendered, it needs a manual
  population override, not a re-run of the join. Chattanooga, OK
  legitimately reports **pop 0** — a real Census value, not a bug either.
- **Classify by what a point is standing on, not by nearest border
  segment** (`src/geo.js` `classify()`/`inWorld`/`borderZoneAt`): near El
  Paso the closest Texas border stretch is the Rio Grande even for points
  deep in New Mexico (Las Cruces) — a nearest-segment classifier wrongly
  calls that 'mexico'. The fix tests point-in-neighbor-state-polygon
  (`GEO.neighborStates`) first; only falls back to nearest-border-zone
  ('coast' vs 'mexico') for points outside every neighbor state too (open
  Gulf water or actually-Mexico). Any new geo classification must follow
  the same "what are you standing in" pattern, not nearest-line-distance.
- **The whole band data pipeline is `tools/build-band.mjs`**, not
  `build-data.mjs` — inputs are Census cartographic boundary shapefiles
  (`.shp`+`.dbf`, parsed by the new no-deps `tools/shp2geojson.mjs`, no
  ogr2ogr/mapshaper needed) + the Population Estimates Program CSV.
  Re-fetch commands (all confirmed working from this environment):
  `curl -sS -o cb_2022_us_state_500k.zip https://www2.census.gov/geo/tiger/GENZ2022/shp/cb_2022_us_state_500k.zip`
  (same pattern for `_county_500k` and `_place_500k`), and
  `curl -sS -o sub-est2022.csv https://www2.census.gov/programs-surveys/popest/datasets/2020-2022/cities/totals/sub-est2022.csv`.
  Unzip each, then: `node tools/build-band.mjs <state-base> <county-base> [<place-base> <pop-csv>]`
  (place/pop args optional — omitting them skips `band-places.json`).
  Raw shapefiles/CSV are scratchpad-only (not committed), same convention
  as OSM downloads — re-fetch, don't hunt for a cached copy.
- **`tools/build-elevation.mjs`'s CLI signature changed**: it now takes a
  Census state-shapefile *base path* (parsed via `shp2geojson.mjs`), not
  the old GeoJSON `us-states.json`. `GRID` widened to
  `{w:448,h:414,minX:-7330,maxX:6230,minZ:-6630,maxZ:5800}` (+~430u land
  sides; south/Gulf unchanged — mirrored in `src/geo.js` `ELEV`).
- **The minimap and big map are now two separate offscreen layers**
  (`hud.js` `renderMapLayer(W,H,bounds)` takes explicit bounds and returns
  `{canvas,T,sc}`): `hud.miniLayer`/`miniT`/`miniSc` stay pinned to the
  original Texas-only `GEO.bounds` (Law: "minimap layer untouched" — CLAUDE.md
  said both maps blit from *one* shared canvas, which the widened big map
  would have silently broken); `hud.mapLayer`/`mapT`/`mapSc` are the widened
  shoulder/shelf layer, used by the big map and mission-target math only.
  `drawMini` must keep using the mini* fields — don't let it drift back to
  the shared ones.
- **`GEO.border`/`inTexas` stayed additive, not reshaped**: `GEO.border`
  is still the exact flat mainland ring it always was; Padre's two rings
  live in new `GEO.islands` (`data/islands.json`), OR'd in by `inTexas`.
  Any code that iterates `GEO.border` expecting "all of Texas" (e.g. a
  new ground-mesh or ink-line consumer) must explicitly opt into
  `GEO.islands` too, the way `world.js`'s terrain rasterization and
  `hud.js`'s map layer do NOT yet (Padre isn't drawn as land in-world or
  on the map — that's W3/content, not W1's job; W1 only had to make
  `inTexas`/gameplay-legality true there).
- **Aviation.mjs suite is flaky under heavy `-j` parallelism** on this
  machine (2 different real-loop-timing checks failed once each across 3
  full `-j6` runs, both clean standalone and at `-j2`) — pre-existing,
  unrelated to this session's changes. If it flakes again, rerun at a
  lower `-j` before assuming a regression.
- Agriculture/chapel/farmstead/brand generators stay `inTexas`-gated by
  law (spec Laws) — the shoulder gets none of them. Padre joining
  `inTexas` legitimately creates NEW scenery/animal chunks on the island
  (existing chunks stay byte-identical — the W1 baseline check proves it,
  see `tools/checks/band.mjs`). Do not "fix" that by gating the island out.

Playtest still owed (pre-track): the EIGHT ranch compounds (wave 5's four
+ 5b's JA/XIT/Matador/LBJ, incl. landing at the new LBJ strip).

Gotchas from waves 5/5b (whoever touches the ranch compounds, `world.js`
sites, `airports.js`, or `animals.js` next must know):
- **Any new airport MUST get a `ROUTES` entry in aviation.js** — the field
  table and route table are separate, and `daySchedule` crashes the whole
  main loop at boot on a missing entry (found the hard way adding LBJ; the
  crash cascades into ~56 unrelated check failures that all read as "loop
  dead": weather stuck, cities never spawn, animals starve).
- **Neighboring ranches can have two compounds live at once** — 6666 and
  Matador sit ~645 units apart, inside the 780-unit chunk view radius. Any
  check (or gameplay feature) that scans live scenery for a `ranchhq` group
  must pick the one nearest its target site, never the first in Map order.
- A check that stashes a live animal reference must re-grab it after any
  teleport chain — chunks despawn and the reference points at a disposed
  object that never moves (the axis-deer scare check does this right now).
- LBJ's compound coexists with its own tier-3 airstrip: the site fn's
  `airportClear` legality already handles the standoff; don't move the arch
  (830.2, 847.1) closer to the strip center at LL(30.2518, −98.6226).
- `ranchHQSite(i)`/`ranchHQAt(cx,cz)` (world.js) are the pure seeded site
  functions for the four compounds — arch coords are duplicated in
  gameplay.js `LANDMARKS` and animals.js `RANCH_ARCHES`; keep all three in
  sync. animals.js homes the signature herds (`SIG` table in `spawn()`) at
  the exact same sites — never re-derive or hand-place them.
- Compound props are tagged `userData.prop` (`hqhouse`/`watertower`/`barn`/
  `horsebarn`/`pen`/…) and the group is `userData.kind === 'ranchhq'` — the
  ag.mjs wave-5 checks tally these; keep the tags if you rearrange the kit.
- Water-tower sign materials are cached per ranch in a module-level Map
  (`towerSigns`) and never disposed (shared-prototype precedent) — don't
  create canvases inside `mkWaterTower` per spawn.
- `RANCH_ARCHES` wave-5 rows (King santagertrudis, Y.O. axisdeer/blackbuck)
  are APPENDED to each arch's rows so pre-wave-5 chunk draws stay identical.
  Any future row must also append, never insert.
- The "Cy NPC rain register" check no longer waits out townsfolk drift — it
  now *displaces* any non-Cy NPC out of talk range (position + home) before
  polling. Townsfolk positions are real-loop-accumulated (they walk), so any
  check near a city that needs a specific NPC nearest must drive to that
  state the same way, not extend timeouts.

Gotchas carried over from wave 4.5 (crops/pivots):
- Field decals carry an optional vertex-color `stripe` on `mkFieldPatch`
  (own `lambVC()` material, `'vc'` matCache key). Don't add a second
  vertex-color material; extend `CROP_STYLE[...].stripe` or
  `defaultStripe()` instead.
- **Two seeded streams per ag chunk**: `'crops'+key` (placement — exactly 6
  draws/field, 4/pivot, never touched by visual code) and `'crops2'+key`
  (row/bale visual jitter, free to consume anything). Never let visual code
  read from `crand`.
- `tools/checks/ag.mjs` (37 checks) hardcodes a known Hale chunk's first
  field centroid (x≈-2147.501, z≈-3607.705) as the placement-frozen
  baseline. If a future wave deliberately moves fields, recapture the real
  baseline (git stash, read live centroid, hardcode) — don't hand-wave it.
- `fieldAt(x,z)` (world.js) replays the `'crops'+key` draw sequence — if you
  change field/pivot placement, update `fieldAt` in the same edit.
- Pivot arm is static by scope call; if a wave wants the sweep, register it
  in `group.userData.animated` (pumpjack idiom).

Gotchas from the wave-5.5 HUD session (`main.js`/`hud.js`):
- `main.js` per-frame nature-hint block: wildlife (`animals.nearby`, set in
  the per-frame step loop, `SPOT_R` 24) beats crop (`fieldAt`); both
  suppressed in FLY. The brand-resize hint is also FLY-gated.
- `#nature-hint` / `hud.natureHint(text)` uses the interactHint
  show/hide-by-textContent pattern.

Gotchas for whoever touches the jetpack (`vehicle.js`/`shop.js`/`dog.js`/
`audio.js`) next:
- `hovering` is a WALK-only sub-state (`GRAV=45`, `AIRDAMP=0.25`) — thrust
  XOR gravity, no stable hover point by design. The ground-clamp guard is
  `if (this.mode !== 'FLY' && !this.hovering)`; don't drop the second half.
- `shop.js`: `applyGear` always writes `jetThrust`/`jetAlt`/`jetSpeed`;
  only `jetpack: lvl>0` gates whether Space does anything airborne.
- Flame prop + jet whoosh key off **active thrust** (`hovering &&
  keys['Space']`), not merely `hovering` — don't loosen either gate.
- `audio.jetTarget` is computed before the `!ctx || muted` early return;
  verify reads this field, never the ramping AudioParam.
- `player.onThrust` edge-fires once per liftoff; a check that spies on it
  must restore the real callback. Any check leaving the player airborne or
  non-DRIVE must restore DRIVE at its end.

Gotchas for whoever touches `brands.js` next:
- Hero/props split across `building` sub-group (scales with `SCALE`) vs
  `group` (billboards, own terrain-sampled scale) — new props must pick the
  right parent.
- Foundation skirt depth: cap the TRUE relief FIRST, then divide by SCALE
  (`Math.min(8, relief + 0.4) / SCALE`). Scale range 0.1–1.25.
- `footAt` scales half-extents/`PAD_TOP` by live `SCALE`; footprint caches
  only hold scale-independent geometry.
- `brands.lscNear` triggers off each LSC site's **sign** world position
  (`signAt`), not `site.at`; `plaqueOpen` in main.js is shared via one
  `plaqueNear()` lookup — extend it, don't add a second state var.

Gotchas for whoever touches `hud.js` next:
- Road shield: `this.shield` (wrap div, transformed per frame by
  `animateShield`) vs `this.shieldCanvas` (2D face raster, drawn by
  `drawShield`, cached on `ref+night`). Don't add per-frame canvas work.
- `parseShield` only swallows clean "PREFIX ###" refs; messy municipal
  names fall through to the text line on purpose.
- `#hud-speed`/`#hud-mode` offsets are rem-based; if either block grows,
  bump the other's `bottom` in rem and rerun the hud overlap check.

---

Background context for the session:

We're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture
+ commands + gotchas). `MODULES.md` has per-module grep anchors — prefer
grep + a targeted read over whole-file reads. `ROADMAP.md` is history;
`BACKLOG.md` holds all other queued work and pending playtests.

Key facts:
- **Repo is private, GitHub Pages is deleted** (intentional) — the game is
  not currently live/public. Verify locally only.
- Local dev: `python3 -m http.server 8317`; verify headlessly with
  **`node tools/verify.mjs`** (parallel pool, full run ~24 s; compact; `-v`
  per-check, `-j N` sets width). Add checks to `tools/checks/*.mjs`, never
  throwaway scripts.
- Verify at *natural* play values (ugly mid-drive headings, parked-truck
  distances, off-axis approaches), not convenient ones.
- If I report something broken after an update, suspect my browser cache
  first (hard refresh — python http.server sends no cache headers).
- **Ask before coding** — present an implementation plan and wait for
  the go-ahead.
