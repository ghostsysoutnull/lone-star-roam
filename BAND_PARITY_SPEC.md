# Band Parity — track spec (2026-07-16)

Goal: promote the out-of-state band (the 402u / 25mi neighbor-land shoulder,
NM/OK/AR/LA) from drivable backdrop to a first-class world — the same
treatment Texas gets, per Bruno's directive 2026-07-16: real road network
connecting the band towns (to Texas and to each other), distance signs at
every outward road end (the San Jon pattern generalized), and parity in
ground/crops/wildlife/ranches/chapels/airport traffic. Band city buildings
already scale by population (identical `spawn()` path — the band just has no
400k+ city, so no skylines); band elevation is already the real DEM (the tan
wash hides it — W3 fixes the paint, not the data).

## Resolved calls (Bruno, 2026-07-16 — settled before any wave codes)

- **Network depth**: fetch by tier — `motorway|trunk|primary` — clipped to
  the 402u strip. NOT by route ref: tier fetch connects the towns and makes
  the ref-concurrency defect (`US 60;US 84` invisible to the regex)
  structurally moot. Secondary tier excluded; W1 measures coverage and only
  escalates to Bruno with numbers if primary leaves big gaps.
- **Band visits**: tracked in a separate tally — new additive save key
  (`bandTowns`), own HUD counter. The 132 Texas counter never changes (law).
  **Correction (W2, 2026-07-16)**: this was already shipped, a day earlier,
  as `save.passport.towns` (Shoulder & Shelf track) — same GEO.bandCities
  source, same detection/toast/HUD-counter shape this bullet asks for. W2c is
  a no-op; don't add a second `bandTowns` key for the same visits.
- **Airports**: a few real band fields — 2–4 landable tier-3s (Roswell /
  Lawton / Texarkana / Lake Charles class) with traffic and charter reach.
- **Rails**: deferred to `BACKLOG.md` — not in this track.
- **Ag data**: real USDA 2022 census for the band counties (true source,
  same pipeline as Texas). Prereq: state extracts downloaded to
  `~/claude-area/devel/tx-inputs/` before W4 (Bruno runs or approves the
  fetch; Overpass-style GET rule does not apply — this is USDA QuickStats).

## Laws that bound every wave

- `GEO.highways`/`GEO.cities` never change length; band data stays in
  `GEO.bandHighways`/`GEO.bandCities`/band files. Rose indices, the 132/254
  counters, and saves depend on it.
- New seed streams only — never repurpose an existing `seededRand` string.
- Save extends with new keys only (`bandTowns`).
- One light rig (sky.js); night gating via `ATMOS`.
- Everything grounded samples `hAt`; altitude checks use height above ground.
- Suites stay hermetic; new checks join existing suites or a new
  `tools/checks/<suite>.mjs`; assert numbers, not pixels; every wave ships
  its Tours entries with guaranteed subjects.
- Any band-road rebake shifts geometry: re-verify the shoulder suite
  (crossing monuments read band endpoints) and `band.mjs` guards.

## Waves (each = one session: code + checks + Tours + full verify)

- **W1 — the network** (Sonnet 5, high). Rework `tools/build-band-roads.mjs`
  to a tier fetch (`motorway|trunk|primary`, 4 state bboxes from the file
  header, GET, clip to the 402u strip at bake), keeping per-way `ref` where
  tagged (signs/shields read it). Rebake, report the coverage number (how
  many of the 177 places now have a road within 25u), re-verify shoulder +
  band guards, add a connectivity check (coverage floor asserted at the
  measured value, so regressions can't hide). Budget: code + checks +
  Overpass fetches, no shots, grep-first.
- **W2 — life on the roads** (Sonnet 5, high). (a) Control-city distance
  signs at EVERY outward stub end — `deriveCrossings` idiom over the new
  endpoint set, each sign naming the next 1–2 real beyond-map cities with
  true distances (authored from lat/lon at bake or via `LL()`); reuse the
  shoulder.js sign meshes. (b) Traffic on band roads — extend TrafficSystem's
  candidate polylines to `GEO.bandHighways` when the spawn ring reaches the
  band. (c) The `bandTowns` visit tally (save key + HUD counter + toast).
- **W3 — the ground** (Fable 5, high, screenshots ON — visual judgment,
  Bruno's eye required). Retune `world.js:220`'s 0.75 out-of-state tan lerp;
  per-neighbor regional tints (LA swamp, AR pine, OK plains, NM desert) so
  the real DEM relief and `cPine` read again. Closes the BACKLOG "band is
  always desert" item.
- **W4 — crops and ranches** (Sonnet 5, high; prereq: USDA extracts in
  tx-inputs). Extend the ag bake to band counties (`neighbor-counties.json`
  already joins), teach `agAt` the band, then swap the `inTexas` gates in
  world.js placement (flora, crop decals, pivots, `farmsteadAt`, `chapelAt`
  + cemeteries) for the in-band land test with band legality
  (`nearestBandRoad`, `shoulderClear`, existing standoffs).
- **W5 — wildlife** (Sonnet 5, high). Band region boxes in the
  animals/world tables (swamp / pine / plains / desert), species rows,
  census herds homed at band farmsteads, wander/flee clamp widened from
  `inTexas` to the band land test (Mexico stays out).
- **W6 — band fields + track close** (Sonnet 5, high). 2–4 real band
  airports (OSM runway geometry, true-north headings, tier-3 kit), traffic +
  charter reach, `airportClear` coverage for band placement. Then the close:
  fold the track into one `ROADMAP.md` entry, graduate surviving gotchas
  into `GOTCHAS.md`, sweep `BACKLOG.md`/satellite docs, delete the briefing
  block.

Dependencies: W1 first (every later wave reads the road set). W3 is
independent (any time). W4 blocks W5's herds. W2/W6 read W1's endpoints.

## Tier-expansion playbook (learned the hard way, W1's two secondary-tier
top-ups, 2026-07-16 — read this BEFORE fetching a deeper tier for any state)

Going from primary to secondary tier (or secondary to tertiary, if that's
ever asked) hits the same handful of traps every time. All were rediscovered
live, at real cost — one cost an 18-minute rebake and 3 killed background
runs before it was profiled instead of guessed at.

- **Dedupe by OSM way id across all input files, keep the first file's
  copy.** The 4 state bboxes overlap on purpose (no seam gaps at the state
  lines), so a wider highway regex pulls the same way into two files near
  every shared edge — unfixed, it bakes as two near-identical polylines
  drawn on top of each other (denser/rougher exactly at the overlap).
- **A road that touches the border isn't necessarily a crossing.** Any
  wider tier pulls in roads that run roughly PARALLEL to a dead-straight
  survey-line border for real distance (an FM/county road tracking the NM
  103°W line, sometimes for 100+ units) without ever crossing it. Neither a
  short-stub-length cutoff nor "chain isn't 100% inside Texas" catches this
  reliably by itself — the only test that held: **distance-to-border must
  grow substantially (≥8u) over ~30u of outward travel** from the endpoint.
  Real crossings (I-10, I-30, LA 1, US 62, ...) measured 9-30u of growth;
  every parallel-runner measured under 5u, most under 0.5u.
- **El Paso/Juárez is a known-hard spot — border.json's raw
  point-in-polygon test misreads points essentially ON the line there** (a
  Ciudad Juárez street tested "inside Texas" at 17cm from the border).
  `border-zones.json` has the fix already (per-border-vertex 'land'/
  'coast'/'mexico' labels, same data `geo.js`'s `classify()` uses) — mirror
  that, not a bare `inTx()`/distance check, for any point this close to the
  line. **Check `inNeighborState` (or the neighbor-states ring equivalent)
  FIRST**, same as `geo.js`'s `classify()` does: the nearest border SEGMENT
  to a point deep in New Mexico (Las Cruces, Mesilla) is the Rio Grande —
  skip that first check and you'll misclassify real US towns as Mexico.
- **Never run an expensive per-point check unconditionally in the bake
  loop.** The clip loop runs over every raw OSM point before simplification
  — hundreds of thousands of them for a state-wide secondary-tier fetch.
  Anything that scans the border polygon (1,517 vertices) or the county
  list (249 rings) must be the LAST term in a `&&` chain, after the cheap
  distance test already rejected most points, and must not be called twice
  redundantly (a Mexico check that re-ran `inNeighborState` after the outer
  clip condition had already confirmed it turned an 8-minute bake into an
  18-minute one).
- **Texas has no rendered "secondary" tier** — fold OSM `secondary` (or
  whatever deeper tier) into `type: 'primary'` at load rather than inventing
  a new ribbon tier `world.js` doesn't draw.
- **Every rebake needs the same 3 numbers re-measured and re-asserted**:
  the coverage floor and cross-bbox-duplicate check in `tools/checks/
  band.mjs`, the crossing-monument count range in `tools/checks/
  shoulder.mjs`, and the band-highway polyline count in `tools/unit/
  data.test.mjs`. All three WILL fail after a real rebake — that's the
  check catching real geometry drift, not a false alarm to silence.
