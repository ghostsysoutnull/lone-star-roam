# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: Energy (`ENERGY_SPEC.md`), wave 6 of 6 (last) —
  energy jobs: crude hauls basin→refinery, fuel runs, and wind-blade
  **oversize loads** (a slow-haul job type — staying under a speed
  cap earns the bonus, the inverse of every other haul). Track close:
  fold the whole track into one `ROADMAP.md` entry, graduate
  surviving gotchas (voltage multi-value match, farm clustering,
  flare gating) into `GOTCHAS.md`, sweep `BACKLOG.md` + doc headers,
  delete this briefing block. Wave 5 (345 kV tower corridors +
  conductor ribbon, ~600 thinned substations, 4 hero plants — South
  Texas Project + Comanche Peak nuclear, W.A. Parish, Martin Lake —
  ERCOT radio flavor via a `{grid}` chatter token) shipped 2026-07-18,
  commit `102901f` (H-frame swap + tower-rotation fix, prompted by a
  post-shot Bruno review of the tower look, in follow-up commit
  `8021248`).
- **Recommended setup**: model **Fable 5**, effort **high** — offer
  copy + rules, not plumbing. Flag it if the running model differs.
- **Budget**: code + checks, **no shots**, grep-first.
- **Then**: this is the last wave — nothing to rewrite. Delete this
  whole briefing block once the track-close commit lands.

Gotchas carried over: reference shipped sites **by id**, not name —
`HEROES` ids (`stp`, `comanchepeak`, `parish`, `martinlake`,
`shipchannel`, `baytown`, `motiva`, `corpus`, wind/gusher/tank ids)
are stable save keys; the city-rename lesson applies the same way
(resolve at use, an orphaned reference self-clears, never hardcode a
site's coords into a job — read `energy.heroes`/`GEO.energy.*` at
offer-generation time). Oversize-load bonus is a **speed-over-time**
rule (max speed under cap for the whole haul → bonus; one burst over
cap → no bonus — the charging-deer shape), belongs in
`mission-rules.js` so `tools/test.mjs rules` covers it pre-browser.
Fast-travel lock during an active haul already exists (missions.js
`job.phase === 'haul'`) — extend it, don't refork it. No new
announcer/log/light-pool machinery needed anywhere in this wave.

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
