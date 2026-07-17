# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: New Player Experience (`NEWPLAYER_SPEC.md`), wave 1 of 3 —
  boot/title screen (Continue / New game) + first-run concept card + staged
  tutorial toasts, `save.seen` added. Spec written 2026-07-17.
- **Recommended setup**: model **Fable 5**, effort **high** — content/copy +
  UI wave. Flag it if the running model differs.
- **Budget**: code + checks (new `tools/checks/onboarding.mjs`), one staged
  title-card shot (Copilot + Bruno judge), grep-first. Harness bypass is a
  hard requirement — see spec.
- **Then**: rewrite this block for W2 (contextual hints + help restructure,
  Fable 5 high).

Gotchas carried over: boot screen must auto-enter under the harness flag and
expose its controls on `__game`; `save.seen` is additive-key-only.

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture +
commands + gotchas) and grep **`GOTCHAS.md`** — the law book — for the area
you're changing. `MODULES.md` has per-module grep anchors — prefer grep + a
targeted read over whole-file reads. `ROADMAP.md` is history; `BACKLOG.md` holds
queued work and pending playtests; `LEDGER.md` is the per-wave scoreboard.

Key facts:
- **Repo is public and GitHub Pages is live** — pushes deploy to
  https://ghostsysoutnull.github.io/lone-star-roam/. Full verify before
  every push is mandatory.
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
