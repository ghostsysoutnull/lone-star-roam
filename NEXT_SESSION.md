# Lone Star Roam — next session kickoff

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture +
commands + gotchas) and grep **`GOTCHAS.md`** — the law book — for the area
you're changing. `MODULES.md` has per-module grep anchors — prefer grep + a
targeted read over whole-file reads. `ROADMAP.md` is history; `BACKLOG.md` holds
queued work and pending playtests; `LEDGER.md` is the per-wave scoreboard.

Active track: **Rails Operations** (`RAILS_OPS_SPEC.md`, 3 waves) — spec
written 2026-07-19, slotted before sea-industry. Water Vehicles shipped in
full 2026-07-19 (folded into `ROADMAP.md`).

## Session briefing
- **This session**: Rails Operations, wave 1 of 3 — per-train identity
  (symbol/consist/trip toast) + radio chatter. Spec (`RAILS_OPS_SPEC.md`)
  shipped 2026-07-19; all design settled there — templates, seed stream,
  contracts. No prior wave.
- **Recommended setup**: model **Sonnet 5**, effort **high** — pure
  execution of settled design (authored templates on existing toast +
  audio.radio surfaces). Flag it if the running model differs.
- **Budget**: code + checks + tours, no shots (text on an existing toast
  surface), grep-first. Perf: none.
- **Then**: rewrite this briefing for W2 (journeys, Fable 5 high).

Gotchas carried over: `trainid:` is a new seed stream — never rename.
Identity must be deterministic under `force()`. Chatter is proximity
ambient; the radio perk only extends range. No new announcer machinery —
generalize the `onNamed` toast.

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
