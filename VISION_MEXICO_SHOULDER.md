# Vision — the Mexico Shoulder

Macro vision only; the spec session does the wave split. Umbrella:
`VISION_2026H2.md`. Build order across the four 2026-H2 visions: rails →
water vehicles → sea-industry → **Mexico shoulder** — last to code, but its
**data-scout session can run early** (it is read-only research and gates
the spec).

## Goal

A real 25-mile strip south of the Rio Grande — the same shoulder treatment
the US neighbors got — with the twin border cities as the payoff. The track
also sets the data bar for all shoulders: authoritative sources where they
exist, researched gap-fill where they don't.

## Player payoff

- Six twin-city pairs, real geography both sides of the river:
  Juárez–El Paso (Juárez outweighs El Paso), Nuevo Laredo–Laredo,
  Piedras Negras–Eagle Pass, Ciudad Acuña–Del Rio, Reynosa–McAllen,
  Matamoros–Brownsville.
- International bridges as the crossing moments — the Shoulder & Shelf
  monument/murmur/homecoming-chime idiom, applied to the river.
- Band-style ground, tint, and road parity south of the line.
- Passport progress extends across the river (additive, new keys only).

**Named risk — the recolored-Texas trap** (umbrella review, 2026-07-18):
the payoff is Juárez and Nuevo Laredo, but the shipped procedural
downtowns are generic Texas blocks — the same grid across the river reads
as more Texas and the track falls emotionally flat. Making the south side
*read as Mexico* is therefore a **first-class wave, not polish**: a
distinct south-side build register (building kit, palette, plaza-centered
layout instead of the courthouse-square grid, scenery kit). Counted in
the wave table below and in the umbrella.

## This repeals shipped law — count it in the budget

"Mexico is out" is deliberate in at least four places; reversing it is a
spec-level decision with suite updates as first-class deliverables:

- `geo.js`: `inTexasOrBand` returns false for zone `'mexico'`; the
  zone classifier and `rgMouth` maritime-boundary split.
- `world.js`: the full 0.75 `cOut` wash — "the Rio Grande contrast is
  deliberate — Mexico is out" (Band Parity W3, Bruno-approved shots).
- `band.mjs` (and possibly `shoulder`/`brands` suites): Mexico-exclusion
  assertions.
- GOTCHAS entries encoding the above; brands law (no stores across the
  El Paso border) — decide per-law what *stays* (brands plausibly remains
  US-only by design).

## Data needs — research first (the scout session)

Mandate: a data-scout session **before** the spec, Band-Parity style.

- Candidates: **OSM** (northern Mexico coverage is good; the whole pipeline
  is already Overpass-GET-shaped) vs **INEGI** (Red Nacional de Caminos for
  roads, Marco Geoestadístico for localities — authoritative, new pipeline).
- Lean going in: OSM for road geometry, INEGI for the city list +
  populations (the city table is hand-authored anyway; INEGI makes it
  authoritative). The scout confirms or overturns.
- Scout deliverable: a data memo + a sample bake of one border segment.
- **Artificial-fill policy** (decided 2026-07-18): where public data runs
  out, fill procedurally — under three rules. (1) **Identity is real or
  absent, never invented**: names, populations, and HUD announcements come
  only from real sources (the `energy.js` unnamed-silent law); geometry may
  be synthetic, a *named* thing may not. (2) **Fill uses the shipped
  idioms**: seeded and deterministic (`seededRand` law), regional
  plausibility via the procedural-downtown / scenery-chunk machinery —
  `cities.js`'s `hasRealStreets` fallback grid is the precedent pattern.
  (3) **Provenance is baked**: every synthetic element tagged in the bake
  output. Fill is **permanent once shipped** — replacing it with real data
  later moves world content and breaks spatial memory — so the scout must
  land the real *skeleton* (highways, twin cities, bridges) before W1;
  fill is flesh only.
- "Same treatment to other shoulders": US band road parity already shipped;
  the real US-side gaps are the backlogged **band railroads** and **band
  airports** items — they ride along or follow at this track's data bar.

## W0 scout memo (landed 2026-07-24, data-scout sidecar on the Map W3 session)

Gate deliverable per "Data needs" above. Raw inputs:
`~/claude-area/devel/tx-inputs/mexico-w0-*.json` (10 strip segments +
7 twin-city POI passes + DP sample, 206 MB), queries recorded in
`mexico-w0-QUERIES.txt` there.

- **Source verdict — the lean is partially overturned: OSM for
  everything.** Roads: OSM as planned. City list + populations: OSM too —
  INEGI's WFS is auth-gated (HTTP 401 on every tested layer, anonymous),
  its bulk shapefiles are nationwide-only ZIPs (~3 GB, no bbox scoping,
  needs a local GIS clip step our pipeline lacks) behind a JS-only portal
  with historically unstable URLs. OSM `place` population tags sit within
  2–6 % of the 2020 census on every twin city checked (Reynosa −1.9 %,
  Nuevo Laredo −2.1 %, Matamoros −5.8 %) — authoritative enough without a
  net-new pipeline. INEGI license itself is fine (Términos de Libre Uso);
  access, not license, is the blocker.
- **Coverage**: 25-mi strip corpus is 70,996 km across all six tiers
  (motorway 1,749 / trunk 2,531 / primary 3,349 / secondary 5,332 /
  tertiary 7,437 / residential 50,599 — 71 % is twin-city street grid,
  real block patterns for the south-side visual-register wave). No
  missing skeleton anywhere: all 7 twin cities present with plazas and
  named international bridges; MEX 2 runs unbroken through the sparse
  Acuña→Ojinaga desert stretch. Genuine fill-policy territory is flesh
  only (ranchitos, unnamed tracks between MEX 2 and the river).
- **Sample bake**: DP at the band-precedent 0.0025° transfers cleanly to
  Mexican OSM data (Juárez segment: 18–37 % point retention, <4 % length
  loss on every tier).
- **Bonus skeleton**: three extra crossings beyond the six pairs —
  Rio Grande City–Camargo, Roma–Cd. Miguel Alemán, La Linda.
- **Plaza tagging**: plazas are `leisure=park` with a `Plaza …`/`Zócalo`
  name pattern, NOT a tag key (`landuse=square` = 0 hits) — bakes need a
  name-regex pass.
- **Open (spec-session inputs, provenance: data-scout, unverified)**:
  Bridge of the Americas (El Paso–Juárez) not found by name — needs one
  tight follow-up query before any bridge-list commitment; INEGI WFS
  behind free registration unprobed (moot unless the OSM call is
  overturned); Ciudad Acuña shows no tagged cathedral — untagged vs
  absent undetermined.

## Open calls (for the spec session, informed by the scout)

- Content depth south of the line: Shoulder-style (monuments + towns +
  flavor) vs Band-Parity-style (full road network parity).
- Save shape: Mexican cities into `save.passport.towns` vs a new key.
- Spanish-language flavor in NPC lines/radio winks near the border.
- Far-content policy: does the Roswell-wink exclusion idiom apply to e.g.
  Monterrey (glow + wink only, never real)?
- Synergy with the rails track: the Laredo/Eagle Pass rail crossings want
  geometry south of the river — coordinate the bakes.

## Rough size

Scout session + 5–6 waves, one of them the dedicated south-side visual
register wave (see the named risk above). Codes last; scout runs whenever
convenient.
