# Lone Star Roam — next session kickoff

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture +
commands + gotchas) and grep **`GOTCHAS.md`** — the law book — for the area
you're changing. `MODULES.md` has per-module grep anchors — prefer grep + a
targeted read over whole-file reads. `ROADMAP.md` is history; `BACKLOG.md` holds
queued work and pending playtests; `LEDGER.md` is the per-wave scoreboard.

Active track: **Rails Operations** (`RAILS_OPS_SPEC.md`, 3 waves) — spec
written 2026-07-19, slotted before sea-industry. Wave 1 (identity + chatter)
shipped 2026-07-19. Water Vehicles shipped in full 2026-07-19 (folded into
`ROADMAP.md`).

## Session briefing
- **This session**: Rails Operations, wave 2 of 3 — journeys. Generalize
  the named-train junction hop (`hopAt`) to every train instead of braking
  dead at a polyline end; spawn exclusivity so opposing trains stop
  spawning onto a collision course; `dest`/trip line updates live on each
  hop. Wave 1 (identity + chatter) shipped 2026-07-19, commit pending push
  this session.
- **Recommended setup**: model **Fable 5**, effort **high** — new-system
  architecture (generalizing a single-train mechanism to the whole roster,
  spawn-exclusivity logic) carries real design risk despite being mostly
  plumbing. Flag it if the running model differs.
- **Budget**: code + checks + tours, logic-only, no shots, grep-first.
  Perf: none.
- **Then**: rewrite this briefing for W3 (meets — real siding holds,
  Fable 5 high, includes a bake step + one Copilot-judged shot).

Gotchas carried over: `hopAt`'s turn-angle/`minRun` guards stand — reuse,
don't rewrite. Spur rails stay named-train turf; band rails join like
mainlines (existing law). `id.dest`/`id.sym` must update in place on hop
(same `tr.id` object — don't rebuild identity mid-life, only `trainid:`
spawn-time fields are meant to be stable-for-life; dest is the one field
W2 explicitly makes live). Chatter/identity toast logic (W1) reads
`tr.rail`/`tr.dir` on every frame already, so a hop that swaps `tr.rail`
mid-life needs no changes there. `trainid:` seed stream — never rename.

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
