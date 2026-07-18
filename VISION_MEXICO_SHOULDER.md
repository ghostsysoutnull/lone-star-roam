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

Scout session + 4–6 waves. Codes last; scout runs whenever convenient.
