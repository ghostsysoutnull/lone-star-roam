# Railroads Realism — track spec

First track of the 2026-H2 program (`VISION_2026H2.md`; macro vision
`VISION_RAILROADS.md`). Spec session 2026-07-18.

## Executive summary

**Goal**: surface the real Texas rail network the game already ships —
whose track you're near (liveries, maps), and live cross-border rail
crossings at Laredo and Eagle Pass you can come back for.

**Wave 1 — the player gets:**
- freight locomotives wearing their real operator's livery — UP armour
  yellow, BNSF orange, CPKC red — so you can tell whose track you're near
- real passenger trains on the DFW commuter lines (TRE, TEXRail, DART)
  instead of misplaced freight
- rail lines drawn on the minimap and big map

*Expected result: loco tint comes from the polyline's baked `operator`
field, freight cars stay the mixed interchange palette. Commuter operators
spawn short loco+coach sets in their own livery. Both maps show all 560
rail lines. `trains.force(x,z)` deterministic spawn hook ships; `lights.mjs`
switches to it (retires the `until(trains>0, 45000)` pole). One staged
livery-lineup shot judged (Copilot + Bruno) before commit. New
`tools/checks/rails.mjs` suite.*
*Suggested setup: Fable 5, effort high.*

**Wave 2 — the player gets:**
- live border crossings: on a seeded daily schedule, a named train crosses
  the Rio Grande rail bridge at Laredo (CPKC/Tex-Mex) and Eagle Pass (UP)
- visible international rail bridges at both gateways
- one named BNSF intermodal — double-stack well cars, a silhouette unlike
  any other train in the game

*Expected result: south-of-river spur geometry baked (small Overpass GET),
crossing times deterministic per game day (`railxing:` seed stream),
forcing debug actions + Tours spots for all three named trains. Named
trains announce via the existing toast surface when passing near. One
staged crossing shot judged before commit.*
*Suggested setup: Fable 5, effort high.*

**Wave 3 — the player gets:**
- railroads in the four neighbor-state band strips — track on the ground
  and the maps, trains running on it, placard identity across the state
  line

*Expected result: band rail bake (4 strips, band-roads precedent),
`data/band-rails.json` loaded and appended to the rail index, band
ribbons + map strokes, trains spawn on band rails, placard works across
the line. Closes the deferred Band Parity rider.*
*Suggested setup: Sonnet 5, effort high.*

## Decisions (Bruno, 2026-07-18)

- **Convert, don't duplicate** (vision, standing): existing impromptu
  consists gain the livery their polyline's `operator` names — one train
  system. Distinct builds belong only to the named/scheduled set.
- **Rail presence**: rails on both maps; **no crossbucks** at grade
  crossings. The HUD half of the "shields for railways" backlog item
  already shipped 2026-07-15 (`03fc0d7`, the 🚂 placard via `nearestRail`)
  — the vision predates noticing this; W2 of the umbrella estimate
  collapsed into W1's map item.
- **Crossing schedule**: seeded per-day stream (`windFrom` idiom), not
  probability. Deterministic times per game day; forcing action ships
  regardless.
- **Band railroads**: folds in as W3 (own wave, Sonnet 5) — one rail track
  owns all rail, `trains.js` never reopens later.
- **Commuter lines**: passenger consists (loco + coaches, operator
  livery), not freight, not silence.
- **Livery palette**: hexes settled below; the W1 staged shot + Bruno's
  eye is the approval gate before the W1 commit (Bucky's-sign pattern).
- **W1 regrade** Sonnet→Fable vs the umbrella estimate: the deliverable is
  a look (risk-based grading rule; the Energy-W3 lesson).

## Hard requirements (all waves)

- **Standing train laws** (shipped behavior, do not regress): hold at
  end-of-line while watched, never despawn in plain sight (`DESPAWN_R`
  beyond fog), mainline-extent spawn filter.
- **Seed strings are forever** once shipped: `railxing:laredo:<day>`,
  `railxing:eaglepass:<day>`, `railxing:ztrain:<day>`.
- Suites hermetic; anything scheduled gets a forcing debug action; every
  wave ships its Tours entries (spots chain the forcing actions — no
  "maybe" buttons).
- Perf: deltas stated at wave end against `tools/checks/perf.mjs` caps.
  W1 +1 InstancedMesh (coach), W2 +1 (well car) + two small merged bridge
  props, W3 a few merged band ribbons. No cap retune expected.

## Waves

### W1 — operator surfacing (Fable 5, high)

Design settled:
- **Livery = instance tint only** — `mkLoco`'s white bodywork already
  takes per-instance tint; no new loco geometry. Frame stays baked DARK.
- **Operator → livery table** (normalize both UP spellings at lookup):
  UP `0xf0b429` · BNSF `0xe4551e` · CPKC `0xc22528` · Rio Grande Pacific
  `0x6e3042` · TRE `0xe8eaf0` · TEXRail `0xc9ced6` · DART `0xeceadd` ·
  no/unknown operator → existing random `LOCO_COLORS` fallback. Hexes are
  the spec's proposal; the staged shot + Bruno may retune before commit.
- **Freight cars unchanged** — mixed `CAR_COLORS` palette is real
  interchange practice and free.
- **Commuter set** = {TRE, TEXRail, DART}: spawn loco + 3–5 `mkCoach`
  cars (new type, windows band, one new InstancedMesh pool), coach tint =
  operator hex. Same speed and spawn filter (TRE's mainline passes the
  extent filter; short yard fragments stay trainless as today).
- **Maps**: `renderMapLayer` (hud.js) strokes all rail polylines —
  dashed, dark neutral, under the road strokes; one-time offscreen draw.
  Expose `hud.mapStats.rails` (count drawn) so the check asserts a
  number, not pixels.
- **Forcing hook**: `TrainSystem.force(x,z)` — deterministic spawn on the
  nearest eligible rail (no `Math.random` path), returns the train.
  Debug action `trainHere`; `lights.mjs:144` switches to it.
- Verify (`tools/checks/rails.mjs`): force-spawn on a known UP / BNSF /
  CPKC line → assert loco instance color equals the table hex; commuter
  line → coach count > 0 and no freight types; `mapStats.rails ===
  GEO.rails.length`; keep one real-loop sentinel (trains move without
  steppers — existing lights beam check stays real-loop).
- Tours: UP mainline, BNSF mainline, CPKC Laredo Sub, TRE commuter spot —
  each chaining `trainHere`.
Budget: code + checks + **one** staged livery-lineup shot (Copilot +
Bruno gate), grep-first.

### W2 — the border show (Fable 5, high)

Design settled:
- **Spur bake**: extend `tools/build-rails.mjs` with a second input
  (`--spurs=`) — two small Overpass GET bboxes (Laredo/Nuevo Laredo,
  Eagle Pass/Piedras Negras), lines skip the Texas border clip, carry
  `spur: 'laredo'|'eaglepass'`, appended into `data/rails.json`. Raw
  fetches to `~/claude-area/devel/tx-inputs/`, queries recorded in the
  script header (energy-bake precedent). Independent of the Mexico scout
  (umbrella allows the spur-bake path).
- **Spur lines are excluded from random spawn** — scheduled trains only.
  World ribbons come free (world.js draws all `GEO.rails`).
- **Schedule**: 3 crossings per gateway per game day, times from
  `seededRand('railxing:<site>:'+day)`; a crossing runs only if the
  player is inside the spawn ring when its window opens (no cost
  otherwise; arriving mid-window spawns mid-run).
- **Named trains**: Laredo — *Tex-Mex Interchange* (CPKC livery, 2 locos,
  long mixed consist); Eagle Pass — *Eagle Pass Manifest* (UP livery,
  same build); Z-train — *the Z* (BNSF livery, double-stack `mkWellCar`
  consist, runs the longest BNSF polyline, computed at load, own
  `railxing:ztrain:` schedule). Named train within ~60 units → one-shot
  toast with its name (existing gameplay toast surface, re-arm on exit).
- **Bridges**: one small merged truss bridge per gateway where the spur
  crosses the river — the crossing needs something to cross.
- Verify: schedule determinism (same day ⇒ same times); forced crossing
  → position-over-time actually traverses the river (distance assertion,
  the charging-deer law); spur excluded from random spawn; well-car
  instances present on a forced Z.
- Debug actions: `railCrossing:laredo`, `railCrossing:eaglepass`,
  `ztrain`. Tours: both gateways + a Z-train spot, chaining them.
Budget: code + checks + the spur bake + **one** staged crossing shot
(Copilot + Bruno), grep-first.

### W3 — band railroads (Sonnet 5, high)

Design settled:
- **Bake**: band-roads precedent — fetch `railway=rail` + `usage=main`
  for the 4 neighbor strips (band bboxes from
  `tools/build-band-roads.mjs`), clip to the band polygons, output
  `data/band-rails.json` (own file, own `build-rails.mjs --band=` mode or
  sibling script — follow whichever build-band-roads did).
- **Load**: geo.js loads it, appends to the rail spatial index with
  `band: true` — the placard works across the state line for free.
- **Draw**: world.js band ribbon pass (same two-ribbon gravel+steel
  idiom, band tint laws apply); `renderMapLayer` strokes them like band
  roads; `mapStats.rails` grows accordingly.
- **Trains**: band rails join the spawn candidate list (liveries free —
  operators come from OSM tags). No band named trains.
- Verify: each strip has ≥1 band rail; placard across the line; forced
  spawn on a band rail; map count updated. Band suite untouched unless a
  band law is grazed.
- Tours: one band-rail spot per strip that has track (chain `trainHere`).
Budget: code + checks, no shots, grep-first.

## Track close

Fold into `ROADMAP.md`; graduate surviving gotchas (spur-spawn exclusion,
`railxing:` seed streams, livery-table normalization) into `GOTCHAS.md`;
sweep `BACKLOG.md` (shields-for-railways, band-railroads, lights-forcing
riders all close); delete the briefing block from `NEXT_SESSION.md`.
