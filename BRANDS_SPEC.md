# Texas Brands — spec

A scenery-only track adding three real, beloved Texas roadside institutions
as higher-poly parody landmarks at their **real-world locations**: a
Buc-ee's ("**Bucky's**"), H-E-B ("**H-E-Buddy**"), and the new-wave AI
datacenters ("**Lone Star Compute**"). No gameplay change — these exist
to make Texas feel like Texas.

Multi-wave track per CLAUDE.md. Present each wave's plan and get a
go-ahead before coding.

## Goal

Three branded structures, each built as a **showpiece hero structure**
(landmark-tier — you drive right up to them) surrounded by **heli-tier
ancillary props** (~3× base primitive density, 8–12 seg cylinders/
spheres, `flatShading`, per CLAUDE.md's "bump segment count + greebles"
idiom — ref `mkMedicalBody`/`mkArmyBody` in `rotors.js` and the B-1/
Randolph landmarks in `gameplay.js`). Parody names + a signature mascot/
silhouette do the recognition work.

All placed at **hand-authored real-world coordinates** via `LL(lat,lon)`
(the `gameplay.js` landmark pattern), **proximity-streamed** like
`CitySystem` so only nearby sites hold geometry.

## Decisions resolved (interview, 2026-07-12)

- **Placement**: all real anchors, hand-authored lat/lon lists (no
  procedural sprinkling).
- **Counts**: Bucky's **~15**, Lone Star Compute **~8**, H-E-Buddy **33**.
  (56 total; only the handful within the spawn ring are ever built.)
- **Fidelity**: **Mixed** — showpiece hero + heli-tier props.
- **Names**: **Bucky's** (beaver mascot), **H-E-Buddy** (sign reads
  "H-E-Buddy", red livery, 3-initial cadence), **Lone Star Compute**
  (data-ranch aesthetic).
- **Flourishes** (chosen): Bucky's highway **approach billboards**;
  datacenter **hum + cooling glow**; datacenter **transmission
  infrastructure** (substation + pylon line).
- **Night lighting** (revised 2026-07-12): Bucky's and H-E-Buddy are
  **lit at night** via emissive meshes gated on `ATMOS.night` — no new
  light rig (the airport-beacon pattern). Scope = **signs + canopy**:
  Bucky's emissive sign + beaver + glowing white fuel-canopy soffit;
  H-E-Buddy emissive red sign band only. (Ambient lot-pole glow was
  considered and dropped.) The datacenter cooling-vent glow is
  *additional*, and its cold cast is a deliberate contrast to the warm
  store glow.

## Placement & data

- Each brand is a hand-authored table of `{ name, at: LL(lat,lon) }` in
  `brands.js`. Real coordinates sourced at build time from known
  locations / OSM (`node`/`way` `brand=` or `shop=`/`amenity=` tags where
  available) — same discipline as the city/airport tables.
- Target sites (final coords confirmed during each wave):
  - **Bucky's (~15)**: Luling, New Braunfels (the original), Bastrop,
    Baytown, Katy, Texas City, Terrell, Temple, Denton, Melissa, Royse
    City, Ennis, Waller, Madisonville, Fort Worth-area.
  - **Lone Star Compute (~8)**: Abilene (the real "Stargate" site),
    Corsicana, San Antonio, Sweetwater, Temple, Amarillo, Red Oak,
    Denton.
  - **H-E-Buddy (33)**: the 33 largest cities in `GEO.cities` (reuse the
    existing city list — one store per city, placed on a road shoulder
    via the `roadShoulder`/`airportClear`-style clear-spot query so it
    never overlaps a downtown building or runway).
- **Overlap discipline**: sites must dodge airports (`airportClear`),
  runways (`onRunway`), and — for H-E-Buddy — the procedural downtown
  footprint. Reuse existing pure footprint queries; do not invent a new
  exclusion system.

## Architecture

New module **`src/brands.js`** — `BrandSystem`, booted in `main.js` and
exposed on `window.__game.brands` at birth.

- **Streaming** mirrors `CitySystem` (`cities.js:7,33`): `SPAWN_DIST`
  (~700 for the bigger footprints), `update(px, pz)` throttled/grid-free
  over the ~56-entry list (small enough to scan directly), `spawn(site)`
  builds the hero + props group and `despawn` disposes per-site geometry
  while **never disposing shared prototype geometries** (beaver mesh,
  pump prototype, cooling-unit prototype, pylon prototype — built once,
  reused across sites, disposed never).
- **Imports only `geo.js` + `sky.js`** (`ATMOS` for the night glow gate),
  matching the `airports.js` no-cycle rule. Audio (datacenter hum) is a
  **constructor callback** (`onHum(dist)`), wired by `main.js` to
  `audio.datacenterHum` — no import into audio.
- Per-brand mesh builders are module functions (`mkBucky`, `mkHEBuddy`,
  `mkLoneStar`, plus prop builders) following the `rotors.js`
  `mk*Body()` idiom: arrays of `tinted(new THREE.<Geo>(...).translate(...))`
  primitives merged per site, `MeshLambertMaterial({ flatShading: true })`.
- Shared prop prototypes (pumps, carts, cooling banks, pylons) are
  `InstancedMesh` where a site repeats them many times (fuel canopy = N
  pumps; transmission line = N pylons) — instancing keeps the heli-tier
  repeats cheap.

## Per-brand design

### Bucky's (Buc-ee's) — the flagship, Wave 1
- **Hero**: long low storefront (showpiece box-loft with a pitched
  canopy roof), a **tall roadside sign pylon** topped by the **beaver
  mascot** — a greebled low-poly beaver head (sphere head, two box buck
  teeth, box cap, disc eyes) that is the at-a-distance recognizer.
- **Props (heli-tier, instanced)**: a wide **fuel canopy** over a row of
  ~12–16 pump islands (canopy = merged beam grid; pumps = instanced
  prototype), cart corrals, a couple of parked-truck boxes.
- **Flourish — approach billboards**: 3–5 roadside sign props placed back
  along the nearest motorway/trunk polyline (`nearestRoad` → walk the
  polyline outward) carrying a rotating pool of punny copy
  ("You can hold it — Bucky's ahead", mileage countdowns). Signs face
  the road; copy is a seeded pick per site so it's stable.
- **Night glow** (emissive, `ATMOS.night`): the sign face + beaver + the
  underside of the fuel canopy (soffit) glow warm-white — the signature
  "visible from the interstate" look. Emissive-only, no light rig.

### H-E-Buddy (H-E-B) — Wave 2
- **Hero**: a big-box storefront (wide showpiece box with a raised
  entry parapet), the **red "H-E-Buddy" sign band** across the front
  (tinted box lettering block — no texture, reads by color + proportion),
  a curved entry canopy.
- **Props (heli-tier, instanced)**: parking-lot cart corrals, a row of
  carts (instanced), lot light poles, a loading dock on the back.
- **Night glow** (emissive, `ATMOS.night`): the red sign band glows —
  the recognizer in the dark. Emissive-only, no light rig.
- Placed on a city-edge road shoulder (33 largest cities), disposed with
  distance like the hero.

### Lone Star Compute (AI datacenter) — Wave 3
- **Hero**: one or two long **windowless server sheds** (showpiece
  low-slung boxes with a ribbed roofline), a small entry/office block,
  perimeter fence posts.
- **Props (heli-tier, instanced)**: **cooling banks** (rows of instanced
  fan units on the roof/side), rooftop condenser drums.
- **Flourish — transmission infrastructure**: a **substation** (greebled
  transformer boxes + bushings) and a **pylon line** (instanced lattice
  pylons with a catenary wire hint) marching toward the shed — sells the
  "enormous power draw" story.
- **Flourish — hum + glow**:
  - `audio.datacenterHum(dist)` — new method mirroring `heli(dist)`
    (`audio.js:171`): low-frequency filtered-noise bed, proximity gain,
    `datacenterTarget` exposed for tests. `main.js` calls it each frame
    with the nearest active site distance.
  - **Cooling-vent glow** — emissive vent meshes gated on `ATMOS.night`
    (the airport-beacon precedent; sky.js still owns all real lights).
    Its cold cast is a deliberate contrast to the warm Bucky's/H-E-Buddy
    signage glow (those are lit too — see their sections).

## Wave split

Each wave = one session: code + verify checks + real coords for that
brand. Wave 1 also builds the shared `BrandSystem` scaffold (streaming,
`__game` wiring, prop-prototype pattern, one real-loop sentinel).

| Wave | Deliverable | Recommended model + effort | Budget |
|------|-------------|---------------------------|--------|
| **1** | `brands.js` scaffold + streaming + `main.js`/`__game` wiring + **Bucky's** (hero, beaver, fuel canopy, approach billboards, night glow: sign+beaver+canopy soffit) + checks | **Opus 4.8, high** — most structural (new system) *and* the beaver/canopy silhouette needs spatial care; Sonnet 5 high also fine if you prefer | code + checks, grep-first, **one `t.shot`** of Bucky's for the silhouette read (the visual-judgment exception), no other shots |
| **2** | **H-E-Buddy** (storefront hero + red sign band + lot props + night glow: red band) + 33 real coords + checks | **Opus 4.8** or **Sonnet 5**, high — mesh + table plumbing | code + checks, one `t.shot`, grep-first |
| **3** | **Lone Star Compute** (sheds + cooling + substation + pylon line) + `audio.datacenterHum` + night glow + 8 coords + checks | **Opus 4.8, high** — most systems touched (audio + emissive + instanced infra) | code + checks, one `t.shot`, grep-first |

Last wave (3) deletes the `## Session briefing` block and folds the whole
track into one `ROADMAP.md` entry; `BRANDS_SPEC.md` stays as history.

## Verify plan

New suite `tools/checks/brands.mjs` (assert numbers, not pixels):
- **Streaming sentinel** (one per wave): teleport to a real site coord,
  `brands.update(px,pz)` → assert a group exists within `SPAWN_DIST`;
  teleport far → assert it's disposed and shared prototype geometries
  survive (`.geometry` of the instanced props still defined). This is the
  real-loop sentinel — broken `main.js` wiring can't hide behind it.
- **Poly floor**: assert each hero group's merged triangle count exceeds
  a heli-body baseline (a real number — "showpiece tier" made countable).
- **Placement legality**: for a sample of sites assert `airportClear` /
  `onRunway` / (H-E-Buddy) not-inside-a-downtown-building at the chosen
  spot — placement math, not a screenshot.
- **Billboards** (W1): assert N approach-sign props exist and sit within
  ~4 units of a motorway/trunk polyline on the site's road side.
- **Hum** (W3): step `audio.datacenterHum(dist)` across distances, assert
  `datacenterTarget` rises as distance shrinks and is 0 out of range
  (the `heliTarget` test pattern).
- **Night glow**: set `ATMOS.night` true/false, assert emissive intensity
  toggles — Bucky's sign+beaver+canopy soffit (W1), H-E-Buddy red band
  (W2), datacenter cooling vents (W3). Assert **daytime** emissive is ~0
  for all of these (night-gated, not always-on).
- **One `t.shot` per wave** of the hero + props for the "does it read"
  gut-check — the CLAUDE.md visual-judgment exception, never the pass/
  fail signal.

## What doesn't change

- No gameplay: no collectible, no save keys, no missions, no fuel
  mechanic. Pure scenery.
- No new scene lights — sky.js owns lighting; all night glow (store
  signage + datacenter cooling) is emissive geometry gated on
  `ATMOS.night` (beacon precedent).
- No new fetch at runtime; coords are hand-authored constants.
- Shared prototype geometries built once, disposed never (perf pattern).
- `seededRand` seed strings unchanged (billboard copy uses a new
  `brandsign:<site>` stream — additive, doesn't touch existing streams).

## Open calls — resolved unless noted

1. **Module vs fold-in**: new `brands.js` (own system, own verify suite,
   `__game` exposure) — the three structures + streaming + audio + infra
   are too much to bolt onto ScenerySystem (chunked/procedural, wrong
   shape for authored anchors).
2. **Always-resident vs streamed**: streamed (proximity spawn/despawn) —
   56 showpieces resident would be heavy; streaming keeps a handful live.
3. **Bucky's/Lone Star counts**: ~15 / ~8 (H-E-Buddy fixed at 33).
   *Adjustable when you review — say the word.*
4. **Model for mesh waves**: recommended Opus 4.8 high for the spatial/
   silhouette work; Sonnet 5 high is a fine cheaper alternative for W2.
   *Open to your call per wave.*
