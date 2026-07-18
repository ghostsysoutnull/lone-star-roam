# Energy — track spec

## Executive summary

**Goal**: give Texas its energy dimension — oil and gas country, wind and
solar farms, refinery skylines, and the ERCOT transmission spine — all
placed from **real OSM data** (76,654 mapped wells, 27,644 individual
turbines, 1,422 power plants, 22 refineries, the 345 kV grid), the way
Agriculture painted the land from census truth.

**Wave 1 — the player gets:**
- (under the hood: the whole track's data — county well density, wind-farm
  sites, plants, refineries, 345 kV lines — fetched, baked, and queryable)

*Expected result: `tools/build-energy.mjs` bakes `data/energy.json` from
recorded Overpass queries; `geo.js` loads it and exports `energyAt(x,z)` +
site lists on `__game`. `tools/checks/energy.mjs` asserts data truths:
Permian counties dense, Roscoe wind farm present, 22 refineries, a
Panhandle-to-metro 345 kV corridor. No visible change in game.*
*Suggested setup: Sonnet 5, effort high.*

**Wave 2 — the player gets:**
- oil country that reads where it really is: pumpjack density driven by the
  county's real well count (Permian, Eagle Ford, Barnett, Panhandle, East
  Texas field), not one uniform region
- tank batteries and drilling rigs at seeded well sites
- night gas flares flickering across the basins after dark
- the first hero energy sites + the new **Energy log** (11th collectible)
  — starting with Spindletop

*Expected result: driving the Permian at night reads as working oil
country; a low-well county spawns almost nothing. Flares are night-gated
emissive (no new lights). `save.energy` is a new additive key; the pause
screen shows the Energy line.*
*Suggested setup: Fable 5, effort high.*

**Wave 3 — the player gets:**
- real wind farms — turbine rows spinning with the live wind at their true
  sites (Roscoe, Horse Hollow, the Panhandle and coastal fleets)
- solar farms as panel fields in the real spots
- wind/solar hero sites join the Energy log

*Expected result: the 27k-turbine fleet appears clustered into its real
farms; blades spin from `ATMOS.wind` (windmill idiom). Solar reads as
dark panel fields from the air and rows near ground (crop idiom).*
*Suggested setup: Sonnet 5, effort high.*

**Wave 4 — the player gets:**
- refinery skylines at all 22 real refineries — columns, tank farms, flare
  stacks; the Houston Ship Channel, Baytown, Port Arthur and Corpus as
  hero industrial landscapes glowing at night
- **real light at close range**: park under a flare stack and your truck
  catches the orange; the water under the offshore rigs glows — the
  existing Shelf platforms upgrade for free
- distant sites spill light onto ground and water via night glow decals
- refinery heroes join the Energy log with plaque facts

*Expected result: the Ship Channel at night is a destination. Far glow is
`ATMOS.night`-gated emissive + spill decals; close glow is a sky.js-owned
**fixed-size pool of real lights** (~6, created at boot — light count
never changes, so no shader recompiles) assigned to the nearest
registered anchors at night, intensity 0 by day. Sodium orange for
refineries, flicker orange at flares, warm white on rig decks. Geometry
merges like airports; poly-budgeted.*
*Suggested setup: Fable 5, effort high.*

**Wave 5 — the player gets:**
- the ERCOT spine: 345 kV lattice-tower corridors crossing the state on
  their real routes
- hero power plants as landmarks — South Texas Project and Comanche Peak
  nuclear, W.A. Parish, Martin Lake — with plaques + Energy log entries
- ERCOT flavor on the radio (the grid island)

*Expected result: long-haul tower lines are followable across the state;
hero plants collect + plaque at parked-truck distance. No lower-voltage
web — the spine only.*
*Suggested setup: Sonnet 5, effort high.*

**Wave 6 — the player gets:**
- energy jobs: crude hauls from the basins to the refineries, fuel runs,
  and wind-blade **oversize loads** — a slow-haul job type where keeping
  under a speed cap earns the bonus
- track close: ROADMAP fold-in, gotchas graduated, briefing deleted

*Expected result: the 💼 Jobs tab offers energy runs referencing real
shipped sites; oversize loads invert the usual race (bonus for staying
slow and steady, verified as a speed-over-time assertion). Save keys
extend additively.*
*Suggested setup: Fable 5, effort high.*

## Decisions (Bruno, 2026-07-17)

- **Track opened** with the grid/transmission layer included.
- **Energy log**: hero sites are the **11th collectible** (`logAirport`
  pattern — visit logs the site + real fact, pause-screen progress line,
  additive `save.energy` key). ~15–20 sites across waves 2–5; candidate
  list below, confirmed per wave.
- **Jobs**: **in-track** as wave 6 (not backlogged) — the track closes
  with energy work, not just energy scenery.
- **Grid depth**: **345 kV spine only**. No 230/138 kV regional layer —
  revisit post-track only if the spine reads too sparse.
- **Real lights** (added 2026-07-17, folded into W4): night industrial
  sites get true illumination via a sky.js-owned pooled system (design
  in Architecture) — the one sanctioned extension of the one-light-rig
  law. Turbine aviation beacons stay pure emissive (unison blink, W3).

## Data (verified 2026-07-17, Overpass GET, TX bbox 25.6,-107.0,36.8,-93.2)

All from OSM — one source, no EIA/RRC inputs. `overpass-api.de` timed out
on the heavy counts; the `maps.mail.ru/osm/tools/overpass` mirror answered
everything (law book: GET only, POST 406s). W1 records every query +
endpoint in the `build-energy.mjs` header (band-roads idiom); raw fetches
stash in `~/claude-area/devel/tx-inputs/`, not the repo.

- **Petroleum wells** — 76,654 (`man_made=petroleum_well`, nodes+ways).
  Aggregated **per county at bake** → well count + density (ag idiom:
  join onto `counties.json`, shoelace area already proven). Drives
  pumpjack/tank-battery/flare scatter odds. Never placed individually.
- **Wind turbines** — 27,644 (`power=generator` +
  `generator:source=wind`, individual nodes). Bake **clusters into
  farms** (cell-binned) → `{x, z, count, r}` per farm; scenery instances
  turbines inside the radius from a seeded stream. Keeps the JSON small
  and the fleet honest. W1 asserts Roscoe (~32.45 −100.54) and Horse
  Hollow (~32.19 −100.05) survive clustering.
- **Power plants** — 1,422 polygons (`power=plant`, 547 solar). Bake
  keeps source-tagged plants as `{x, z, source, name?}`; solar polygons
  additionally keep a footprint radius for the panel-field decal. Hero
  set hand-authored with real coords (airports idiom).
- **Refineries** — 22 (`industrial=refinery` + `man_made=works` with
  oil/petroleum/fuel product tags). All 22 get skylines; 4 heroes
  (Ship Channel, Baytown, Port Arthur, Corpus) get extra dressing.
- **Transmission** — 42,881 `power=line` ways total; bake filters to
  **345 kV**. OSM `voltage` is multi-value (`345000;138000`) — **match
  the value anywhere in the list, never `split(';')[0]`** (the band-roads
  concurrency defect, same idiom, learned already). W1 measures the
  filtered set before committing to volume; polylines stitched and
  simplified like rails.
- **Substations** — 9,427 total; keep only voltage-tagged ≥345 kV majors,
  as dressing at line endpoints/plant sites. Not a standalone layer.

## Architecture

- **`tools/build-energy.mjs`** (offline) → **`data/energy.json`**
  (target ≲150 KB, round aggressively): per-county `{wells, wellKm2}`,
  `windFarms[]`, `plants[]`, `refineries[]`, `lines345[]` (polylines).
- **`geo.js`** loads it into `GEO.energy` (5th boot data file — update
  CLAUDE.md's data-flow note in W1) and exports **`energyAt(x,z)`** =
  `countyAt` → well record, plus the site lists. On `__game` at birth.
- **`wellSiteAt(cx,cz)`** — pure seeded chunk function in world.js
  (`chapelAt`/`farmsteadAt` pattern, new stream `well:x,z`): odds from
  county well density; legality = road-clear ≥5, `airportClear`,
  `brandNear`, city, chapel + farmstead standoffs. Scenery dresses sites
  with the pump/tank-battery/rig kit; flares are site props.
- **No new scenery module**: extraction + wind + solar props extend
  ScenerySystem chunks (turbines/solar keyed off baked farm sites
  intersecting the chunk, dressing draws from new seeded streams).
  Refineries + hero plants + towers are built-once merged global meshes
  (airports idiom — poly-budgeted, drape skirts on `hAt`). Towers
  instance along `lines345` arc-length (rails idiom); conductor wires
  are an in-wave judgment (thin merged segments vs none).
- **Existing pumpjack scatter untouched** — its seed stream and placement
  ship as-is; the *added* density comes from new streams gated on
  `energyAt`. Nothing shipped moves (the crops-4.5 law).
- **Lights**: every glow (flares, refinery, turbine beacons, plant
  windows) is emissive, `ATMOS.night`-gated, `fog: false` where it must
  punch through — sky.js stays the only light rig. Flicker via the
  animate-loop kind registry (`userData.animated`, pumpjack idiom).
- **Local light pool** (W4): sky.js gains a **fixed-size pool** of
  PointLights (~6, built at boot — count is constant forever; adding or
  removing lights recompiles every lit shader, so the pool only ever
  changes *intensity/position*). Systems register **glow anchors**
  (`{x, z, y, kind}` — refinery flare stacks, rig decks in maritime.js,
  hero plant floods in W5); each night frame-throttled sky.js assigns
  the pool to the nearest anchors, 0-intensity by day. Colors by kind:
  sodium orange (refinery), flicker orange (flare), warm white (rig
  deck), cool flood (plant). **Spill decals** carry the far read: warm
  night-gated decals on ground/water under anchor clusters (z-fight law
  — join the deck y-stagger; the gulf stays one plane, decals float
  above it). Existing Shelf platforms + Far Rig register anchors in
  this wave.
- **Poly bar**: every kit in this track (well site, turbine, solar,
  refinery, tower) ships at the W6b bar per the GOTCHAS standing rule —
  round forms 8–14 radial segments (turbine towers, tanks, columns are
  exactly the shapes a 6-seg cylinder betrays), heroes merged
  vertex-colored, lattice towers box-built.
- **Energy log**: `gameplay.js` grows `logEnergy(site)` + `save.energy`
  (additive key, site-id array) + pause-screen line; machinery ships in
  W2 with the first sites, later waves append site tables only.
- **Jobs (W6)**: `missions.js` `genOffers` grows energy offer types
  referencing shipped sites *by id* (city-rename lesson — resolve at
  use, orphan self-clears). Oversize load: speed-cap bonus rule lives in
  `mission-rules.js` (pure, `tools/test.mjs rules`-coverable).

### Energy log — candidate sites (confirm per wave)

W2: Spindletop (Beaumont — the 1901 gusher), a Permian hero tank farm.
W3: Roscoe, Horse Hollow, a coastal farm (Papalote Creek area).
W4: Baytown, Port Arthur (Motiva — largest US refinery), Ship Channel,
Corpus.
W5: South Texas Project, Comanche Peak, W.A. Parish, Martin Lake, the
ERCOT control room (Taylor).

## Wave split

| Wave | Deliverable | Model + effort | Budget |
|------|-------------|----------------|--------|
| **1** | Fetch + `build-energy.mjs` + `data/energy.json` + `energyAt` + `__game` wiring + data-truth checks | **Sonnet 5, high** — pure fetch/bake plumbing | code + checks, **no shots**, grep-first |
| **2** | Well sites (`wellSiteAt` + kit), density scatter, night flares, Energy log machinery + first sites | **Fable 5, high** — content + composition | code + checks, **one shot** (Permian flares at night), grep-first |
| **3** | Wind farms (instanced turbines, `ATMOS.wind` spin) + solar fields + log sites | **Sonnet 5, high** — instancing plumbing | code + checks, **one shot** (turbine row at dusk), grep-first |
| **4** | Refinery kit at all 22 + 4 hero skylines + night glow + **local light pool + spill decals** (rigs included) + plaques + log sites | **Fable 5, high** — hero composition + plaque copy | code + checks, **two shots** (Ship Channel night; rig water glow), grep-first |
| **5** | 345 kV tower corridors + major substations + hero plant landmarks + ERCOT radio flavor | **Sonnet 5, high** — polyline/instancing plumbing | code + checks, **one shot** (tower corridor read), grep-first |
| **6** | Energy job types + oversize-load rule + balance + **track close** (ROADMAP fold-in, gotchas, briefing deletion) | **Fable 5, high** — offer copy + rules | code + checks, no shots, grep-first |

Every wave ships its Tours entries (spots must guarantee their subject:
flares/glow chain staged night; jobs chain a forcing debug action).

## Verify plan

New suite `tools/checks/energy.mjs`, grown per wave (numbers not pixels;
hermetic — drive to state):

- **W1 — data truth**: `energyAt` in a Permian county → high `wellKm2`;
  a Trans-Pecos/piney-woods low county → near zero; Roscoe + Horse
  Hollow in `windFarms`; `refineries.length === 22`; `lines345`
  non-empty with a corridor reaching the Panhandle; outside Texas →
  null. Bake asserts county join internally.
- **W2 — placement legality + gating**: seeded well sites respect
  road-clear/`airportClear`/brand/chapel/farmstead standoffs (placement
  math); flare emissive opacity tracks `ATMOS.night` (0 by day); a
  high-density chunk spawns sites, a zero-well chunk spawns none;
  `logEnergy` dedups + persists; pause line updates.
- **W3 — behavior sentinels**: a known farm chunk instances >N turbines,
  a farm-free chunk none; blade rotation rate follows `t`-driven
  `ATMOS.wind` change (real-loop sentinel — turbines join the existing
  windmill animate coverage, don't duplicate it); solar decals sit
  within ε of `hAt`.
- **W4 — sites as numbers**: all 22 refineries have geometry at their
  baked coords; hero plaques read at parked-truck distance + ugly
  headings (compass/plaque lesson); glow gated on night. **Light pool**:
  scene light count identical before/after night falls and while driving
  between two sites (the recompile guard as an assertion); pool
  intensities 0 by day, >0 near an anchor at night; nearest-assignment
  flips to the closer site mid-drive; spill decal opacity tracks
  `ATMOS.night`.
- **W5 — corridor math**: tower spacing along a sampled `lines345`
  polyline within tolerance; towers sit on `hAt`; hero plants collect +
  plaque; radio wink line present in the pool.
- **W6 — rules + integration**: energy offers generate and reference
  live site ids; oversize-load bonus asserted as **speed-over-time**
  (max speed under cap for the whole haul → bonus; one burst → no
  bonus — the charging-deer lesson shape); pure rule covered in
  `tools/test.mjs rules`; fast-travel lock respected during haul.

## What doesn't change

- **No save-format breaks**: `save.energy` + job keys are additive;
  rose/city RNG streams untouched.
- **`seededRand` strings unchanged** — all new draws from new streams
  (`well:`, `energy:` …). The shipped pumpjack scatter does not move.
- **No new scene lights** — sky.js owns lighting; everything here is
  night-gated emissive.
- **No runtime fetch beyond boot** — `energy.json` is one more boot
  file.
- Shared prototype geometries built once, never disposed; per-chunk
  instances die with the chunk; global merged meshes are permanent like
  airports.

## Track close (W6)

Fold the track into one `ROADMAP.md` entry, graduate surviving gotchas
(voltage multi-value match, farm clustering, flare gating) into
`GOTCHAS.md`, sweep `BACKLOG.md` + doc headers, delete the briefing
block. This spec stays as history.
