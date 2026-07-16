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
