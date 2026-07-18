# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: Energy (`ENERGY_SPEC.md`), wave 1 of 6 — OSM fetch +
  `tools/build-energy.mjs` bake + `data/energy.json` (county wells, wind
  farms, plants, refineries, 345 kV lines, **offshore `platforms[]` +
  fairway snap-points**, `name`/`operator`/`ref` strings for the W2
  approach announcer) + geo.js `energyAt`/site lists +
  `tools/checks/energy.mjs` data truths + the **save-reference grep**
  clearing W2's retirements (old scatter + hand-laid platforms retire —
  realism-first decision in the spec). Spec shipped 2026-07-17.
- **Recommended setup**: model **Sonnet 5**, effort **high** — pure
  fetch/bake/table plumbing, no content work. Flag it if the running
  model differs.
- **Budget**: code + checks, no shots, grep-first. Overpass **GET** only
  (mirror `maps.mail.ru/osm/tools/overpass` when overpass-api.de is
  busy); raw fetches to `~/claude-area/devel/tx-inputs/`, queries
  recorded in the script header (band-roads idiom).
- **Then**: rewrite this briefing for W2 (extraction country, Fable 5,
  high — one staged shot: Permian flares at night).

Gotchas carried over: OSM `voltage` is multi-value (`345000;138000`) —
match anywhere, never `split(';')[0]` (the band-roads concurrency
defect's idiom); assert the county join at bake (ag 254/254 idiom);
W1 must measure the filtered 345 kV volume before committing to it.

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture +
commands + gotchas) and grep **`GOTCHAS.md`** — the law book — for the area
you're changing. `MODULES.md` has per-module grep anchors — prefer grep + a
targeted read over whole-file reads. `ROADMAP.md` is history; `BACKLOG.md` holds
queued work and pending playtests; `LEDGER.md` is the per-wave scoreboard.

Key facts:
- **Repo is public and GitHub Pages is live** — pushes deploy to
  https://ghostsysoutnull.github.io/lone-star-roam/. Full verify before
  every code push is mandatory (doc-only diffs skip tests); commits and
  pushes always wait for Bruno's explicit go-ahead.
- Local dev: `python3 -m http.server 8317`; verify headlessly with
  **`node tools/verify.mjs`** (parallel pool, full run ~70 s on this machine;
  use named suites while iterating, then the full run before pushing; compact;
  `-v` per-check, `-j N` sets width). Add checks to `tools/checks/*.mjs`,
  never throwaway scripts.
- Verify at *natural* play values (ugly mid-drive headings, parked-truck
  distances, off-axis approaches), not convenient ones.
- If Bruno reports something broken after an update, suspect browser cache
  first (hard refresh — python http.server sends no cache headers).
- **Ask before coding** — present an implementation plan and wait for the
  go-ahead.
