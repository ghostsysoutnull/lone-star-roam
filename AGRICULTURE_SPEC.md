# Agriculture — spec

Farms, ranches, crops, and livestock across rural Texas, driven by **real
USDA 2022 Census of Agriculture county data** — feedlot country in the
Panhandle, goats on the Edwards Plateau, cotton around Lubbock and the
Coastal Bend, rice on the coastal prairie, citrus in the Rio Grande
Valley. The space between cities becomes *working land*, painted by
census truth instead of hand-tuned odds.

Multi-wave track per CLAUDE.md. Present each wave's plan and get a
go-ahead before coding.

## Goal

Four layers, all keyed off one baked per-county dataset:

1. **Crops** — decal field patches + sparse instanced rows in ag-heavy
   counties, center-pivot irrigation circles where irrigation is real.
2. **Farmsteads** — seeded chunk sites (barn, house, stock tank, corral,
   windmill, silos in crop counties, chickens pecking) via the `chapelAt`
   pure-function pattern.
3. **Livestock** — horses/goats/sheep join the critter log; ambient
   longhorn odds scale with census density; ranch herds cluster at
   farmsteads; **feedlot** pens in the top on-feed counties; **bison**
   at the real Caprock Canyons State Bison Herd site.
4. **Named ranches** — King Ranch, Four Sixes, Waggoner, YO as
   gate-arch landmarks (existing plaque machinery) with boosted herd
   density nearby.

## Decisions resolved (interview, 2026-07-13)

- **Cattle model**: ambient longhorns STAY (established feel + log);
  census density scales their regional odds; clustered herds spawn at
  farmstead sites; distinct feedlot props in the top on-feed counties.
- **Crops rendering**: ground decals (aerial read) + sparse instanced
  3D rows near ground + center-pivot circles. Full-3D-only and
  decal-only were considered and dropped.
- **Named ranches**: gate-arch landmark plaques + locally boosted herds;
  King Ranch alone gets extra dressing (its real footprint is ~35×50
  units — a region, not a point). Bespoke compounds dropped from the
  core track — then revived (2026-07-13) as **optional wave 5**,
  decision-gated on a wave-4 playtest (see below).
- **Extras**: BOTH bison (Caprock Canyons special site, log-worthy) and
  farmstead chickens (ambience prop-critters, NOT log-worthy).
- **Plumbing**: per-county records joined to the repo's existing
  `data/counties.json` polygons; runtime lookup is `countyAt(x,z)` (already
  bbox-prefiltered + cached) → record. No new grid, no new inputs beyond
  the census extract. The world.js/animals.js region-box refactor is
  **out of scope** for this track.

## Data (verified 2026-07-13)

- **Source**: NASS Quick Stats bulk dump `qs.census2022.txt.gz`
  (https://www.nass.usda.gov/datasets/, keyless, 309 MB gz). The TX
  county-level extract is stashed at
  **`~/claude-area/devel/tx-inputs/tx_county_census2022.txt.gz`**
  (9 MB gz, 254,570 rows + header) — the bake's only input. Re-create by
  streaming the dump through
  `awk -F'\t' 'NR==1 || ($16=="TX" && $13=="COUNTY")'`.
- **Format**: tab-delimited. Columns that matter (1-indexed):
  10 `SHORT_DESC` (the measure), 11 `DOMAIN_DESC` (**filter to
  `TOTAL`** — other domains are demographic breakdowns), 22
  `COUNTY_NAME` (UPPERCASE), 38 `VALUE` (comma-grouped digits, or
  `(D)` = privacy-suppressed, `(Z)` = rounds to zero).
- **Verified measures** (all with `DOMAIN_DESC=TOTAL`):
  - `CATTLE, INCL CALVES - INVENTORY` — 254/254 counties, **0
    suppressed** (top: Deaf Smith 700,069; Castro; Hartley; Dallam;
    Parmer — the real feedlot belt).
  - `EQUINE, HORSES & PONIES - INVENTORY` — 254/254, 0 suppressed.
  - `GOATS - INVENTORY` — 251 counties, 10 `(D)`.
    `SHEEP, INCL LAMBS - INVENTORY` — 243 counties, 19 `(D)`.
  - `CATTLE, ON FEED - INVENTORY` — 120 counties → the **feedlot flag**
    (top: Deaf Smith 364k, Castro, Hartley, Hansford, Parmer).
  - `AG LAND, IRRIGATED - ACRES` — 253 counties, 240 with >0 →
    **pivot gating**.
  - Crop `ACRES HARVESTED`: `COTTON`, `RICE`, `SORGHUM, GRAIN`,
    `CORN, GRAIN`, `WHEAT` (+ `WHEAT, WINTER`), `HAY`, `PEANUTS`; citrus
    is `ORANGES / GRAPEFRUIT - ACRES BEARING & NON-BEARING`. Regional
    signal confirmed: rice = Wharton/Colorado/Chambers, citrus =
    Hidalgo/Cameron, cotton = Nueces/Hale/Gaines, peanuts = Gaines.
    Pecans/sugarcane exist under different `SHORT_DESC` labels — wave 1
    greps the extract before hardcoding its measure list.
- **Join**: `data/counties.json` names are mixed-case ("DeWitt",
  "El Paso"); census names are uppercase ("DE WITT"). Normalize
  (strip spaces/case) and **assert 254/254 joined** at bake time —
  a silent miss paints a county empty. `(D)`/`(Z)` → 0 (log the count).
- **Density**: normalize inventory by county area computed at bake time
  from the projected `counties.json` rings (shoelace) — no new input.

## Architecture

- **`tools/build-ag.mjs`** (offline, input = extract path) →
  **`data/agriculture.json`**: 254 records keyed by county name —
  `{ cattle, horses, goats, sheep, onFeed, irrAcres, crops: {cotton: N,
  rice: N, …}, areaKm2 }` plus bake-derived `density` fields. Target
  ≲100 KB (round aggressively).
- **`geo.js`** loads it at boot into `GEO.ag` (4th data fetch — update
  CLAUDE.md's "three files" note when it ships) and exports
  **`agAt(x,z)`** = `countyAt(x,z)` → record (null outside Texas).
  Exposed on `__game` at birth.
- **Consumers pull, data never pushes**: ScenerySystem chunks and
  animals.js spawn tables call `agAt` at chunk center (26-unit chunks vs
  county-sized polygons — center sampling is fine; straddle error is
  invisible).
- **`farmsteadAt(cx,cz)` / `feedlotAt(cx,cz)`** — pure seeded chunk
  functions in world.js (the `chapelAt` pattern, own seed streams,
  e.g. `farm:x,z`): scenery builds the props, animals.js reads the same
  function to place herds — no cross-module spawn coupling. Both gate
  their odds on `agAt` (feedlots additionally on the onFeed flag and a
  near-road test; both must respect `airportClear` + brand footprints +
  the ≥5-unit road-clear rule like chapels).
- **Crops** live in ScenerySystem chunks: decal quads vertex-draped to
  `hAt` and raised enough to dodge the z-fight gotcha (river-ribbon
  precedent); pivot circles are just round decals (4–8 units ≈ real
  400–800 m pivots) in high-`irrAcres` counties; sparse instanced row
  geometry only near ground level. Crop *type* (color/texture pick) =
  county's dominant crop.
- **Livestock** extends animals.js `SPECIES` + region tables: horses
  (graze, statewide, thicker near farmsteads), goats + sheep (graze,
  Edwards Plateau via census), bison (graze, big, single special site
  ~34.41 N −101.06 W, Caprock Canyons — confirm in-wave). New species
  log via the existing `spotSpecies` path with real facts — additive,
  save-safe. Chickens are scenery props at farmsteads (tiny seeded
  scatter, optional bob via `userData.animated`), not animals.js agents.
- **Named ranches** (wave 4) join the `gameplay.js` LANDMARKS table
  (kind: `rancharch` — a classic wrought-iron entrance arch + cattle
  guard): King Ranch (~27.52 N −97.88 W), Four Sixes/Guthrie (~33.62
  −100.32), Waggoner/Vernon (~33.84 −99.12), YO/Mountain Home (~30.13
  −99.55) — all coords confirmed in-wave. Collect + plaque come free via
  the existing landmark machinery (`plaqueNear`, don't add a state var).
  animals.js boosts herd odds within a radius of each arch; King Ranch
  gets a bigger radius + a couple of extra props.

## Wave split

Each wave = one session: code + verify checks.

| Wave | Deliverable | Recommended model + effort | Budget |
|------|-------------|---------------------------|--------|
| **1** | `tools/build-ag.mjs` + `data/agriculture.json` + `geo.js` `agAt` + `__game` wiring + `tools/checks/ag.mjs` | **Sonnet 5, high** — pure table plumbing, no content/register work | code + checks, **no shots**, grep-first |
| **2** | Crops (decals + pivots + instanced rows) + farmsteads (`farmsteadAt`, props, chickens) + checks | **Fable 5, high** — content + spatial composition | code + checks, **one `t.shot`** for the aerial field/pivot read (visual-judgment exception), grep-first |
| **3** | Livestock: horses/goats/sheep species + census-scaled tables + farmstead herds + feedlots (`feedlotAt`, pens, dense cattle) + bison site + log facts + checks | **Fable 5, high** — species content + behavior reuse | code + checks, no shots, grep-first |
| **4** | Named-ranch gate arches (4 landmarks, real coords + plaque facts) + herd boost + King Ranch dressing + polish + ROADMAP fold-in | **Fable 5, high** — content/register (plaque copy) | code + checks, one `t.shot` (arch silhouette), grep-first |

The track's last wave (4, or 5 if it runs) deletes the `## Session
briefing` block and folds the track into one `ROADMAP.md` entry; this
spec stays as history.

### Optional wave 5 — ranch compounds (decision-gated)

Upgrade the four arches from marker to destination: a shared compound
prop kit (HQ house, barns, pens, water tower — brands-track idiom:
showpiece + heli-tier props) with a **per-ranch signature** doing the
recognition work:

- **King** — scale + Santa Gertrudis cattle (deep-red tint; the first
  American cattle breed, developed there — the plaque fact).
- **Four Sixes** — quarter-horse barns + horse-heavy pens.
- **Waggoner** — pumpjacks *inside* the ranch among cattle (oil hit
  1902; props already exist).
- **YO** — exotic game: axis deer + blackbuck as YO-local species
  (log-worthy or scenery-tier — decide in-wave).

**Gate**: decided at wave-4 end after driving up to an arch — if
arch + boosted herds already satisfies, this wave dies and the track
folds at 4; if the arch feels like a door to nothing, this is
pre-designed. Fable 5, high; code + checks, one `t.shot` (compound
silhouette), grep-first.

## Verify plan

New suite `tools/checks/ag.mjs`, grown per wave (assert numbers, not
pixels; hermetic — drive to state, no ambient accumulation):

- **W1 — data truth**: `agAt` at Deaf Smith centroid → cattle > 500k
  AND onFeed flag; Hidalgo → dominant crop citrus; Wharton → rice;
  a Trans-Pecos county → near-zero crops; outside Texas → null. Bake
  asserts 254/254 join internally (a check re-asserts
  `GEO.ag` size === 254).
- **W2 — placement legality**: sample spawned chunks in a known ag
  county → field decals exist, sit within ε of `hAt`, and no farmstead
  violates the road-clear/airport/brand exclusions (placement math, not
  screenshots). Pivot circles only in high-`irrAcres` counties.
- **W3 — behavior sentinels**: new species spawn in their census
  regions (goats near Edwards Plateau spot, not in Dallam); flee/graze
  reuse the existing `atan2(-dx,-dz)` idiom (assert distance-over-time
  *increases* on scare — the charging-deer lesson); feedlot chunk in
  Deaf Smith spawns pens + dense cattle; bison exist only at Caprock.
  Keep one real-loop sentinel (animals system already has one —
  extend, don't duplicate).
- **W4 — landmark plumbing**: arches collect + plaque at parked-truck
  distance and ugly approach headings (the compass/plaque lesson);
  herd-boost radius measurably raises spawn odds vs a control point.

## What doesn't change

- **No save-format breaks**: new species/landmarks are additive keys;
  rose/city RNG streams untouched.
- **`seededRand` seed strings unchanged** — all new streams are new
  strings (`farm:`, `feedlot:`, `agchick:` …).
- **No new scene lights** — farmsteads are unlit at night (or emissive
  window quads gated on `ATMOS.night`, beacon precedent) — sky.js owns
  lighting.
- **No runtime fetch beyond boot** — `agriculture.json` loads once at
  boot alongside the existing data files.
- Shared prototype geometries (barn, silo, pivot, animal bodies) built
  once, disposed never; per-chunk instances disposed with the chunk.

## Open calls — resolved unless noted

1. **New module vs fold-in**: NO new module — crops/farmsteads extend
   ScenerySystem (chunked procedural content is exactly its shape;
   `chapelAt` precedent), livestock extends animals.js, arches extend
   gameplay.js landmarks. The track's "new thing" is the data layer
   (`build-ag.mjs` + `agAt`), not a system.
2. **Dominant-crop granularity**: one dominant crop per county (plus
   pivot overlay). Per-chunk crop mixing considered and dropped — county
   resolution is the data's honest resolution.
3. **Feedlot count**: gate on `onFeed` inventory threshold tuned in
   wave 3 so roughly the top ~10 counties qualify. *Adjustable.*
4. **Chicken animation**: static scatter vs `userData.animated` peck —
   wave 2's call, whichever reads better at walk height for near-zero
   cost.
