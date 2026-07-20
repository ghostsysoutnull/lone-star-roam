# Lone Star Roam — next session kickoff

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture +
commands + gotchas) and grep **`GOTCHAS.md`** — the law book — for the area
you're changing. `MODULES.md` has per-module grep anchors — prefer grep + a
targeted read over whole-file reads. `ROADMAP.md` is history; `BACKLOG.md` holds
queued work and pending playtests; `LEDGER.md` is the per-wave scoreboard.

Active track: **Rails Operations** (`RAILS_OPS_SPEC.md`, 3 waves) — spec
written 2026-07-19, slotted before sea-industry. Waves 1 (identity +
chatter) and 2 (journeys) shipped 2026-07-19. Water Vehicles shipped in
full 2026-07-19 (folded into `ROADMAP.md`).

## Session briefing
- **This session**: Rails Operations, wave 3 of 3 — meets (the track
  marquee). Bake 878 real OSM sidings onto their parent rails
  (`tools/build-rails.mjs` + `sd: [{s0, s1, side}]` spans; input
  `~/claude-area/devel/tx-inputs/tx-sidings.json`, fetched 2026-07-19);
  draw siding ribbons merged into the rail mesh; opposing pairs resolve —
  one train pulls into a real siding, holds, the opposer passes, meet
  chatter voices it; `meet` debug action stages one on demand. Waves 1+2
  shipped 2026-07-19 (W2 commit pending push this session; W1 commit
  4418062 may still be unpushed too — check `tools/status.sh`).
- **Recommended setup**: model **Fable 5**, effort **high** — new visible
  surface (siding geometry) + new-system architecture (occupancy registry,
  meet resolution) + a bake step. Flag it if the running model differs.
- **Budget**: bake + code + checks + tours + one Copilot-judged shot (new
  visible geometry). Perf: +1 merged mesh / +1 draw call — report against
  `tools/checks/perf.mjs` caps.
- **Then**: this is the last wave — delete this briefing block, fold the
  track into `ROADMAP.md`, sweep satellite docs (`BACKLOG.md` header, any
  doc naming the active track), graduate surviving gotchas into
  `GOTCHAS.md`, and return this file to kickoff-only.

Gotchas carried over: `hopAt` now returns the best *unoccupied* connection
first (`clean ?? best`) — the W3 meet layer sits above it and only ever
applies on rails with baked `sd`; rails without a real siding keep spawn
exclusivity as their only protection (real-or-absent, settled). `syncTrip`
mutates `dest`/`sym`/`sub` in place on the same `tr.id` object after every
hop — spawn-time `trainid:` fields (cargo, cars, mp, voice, orig) stay
stable for life; never rebuild the id object mid-life and never rename the
`trainid:` stream. Commuter sets terminate at end-of-line by design
(`!tr.id.commuter` gates the hop) — don't "fix" a held TRE set at its
terminus. `spawn()` direction-locks to a rail's occupant and enforces
arc-length separation; `force()` deliberately bypasses exclusivity
(deterministic harness/tour tool — leave it). Spur rails stay named-train
turf; band rails join like mainlines and have no `sd` (siding scout bbox
was Texas-only). W3 meet checks: stage state directly (the rails suite's
synthetic-rail idiom) and assert positions over time, not snapshots.

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
