# Lone Star Roam — next session kickoff

No active track. **The Shoulder and the Shelf closed 2026-07-15** (7 waves, all
folded into one `ROADMAP.md` entry; `SHOULDER_SHELF_SPEC.md` stays as history).
Queued work and every owed playtest live in `BACKLOG.md`; owed playtests are
also loaded as teleport spots in the debug menu's **Tours tab** (`?debug=1`,
backquote), so a play session is menu-driven — and it remains the
highest-value next move, not more code.

**Band roads rebaked and played, 2026-07-15 (`8398546`)** — settled, no action.
The band is a clean baseline: the `BACKLOG.md` concurrency fix is the *next*
road-set shift and lands against this, unstacked.

---

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture +
commands + gotchas) and grep **`GOTCHAS.md`** — the law book — for the area
you're changing. `MODULES.md` has per-module grep anchors — prefer grep + a
targeted read over whole-file reads. `ROADMAP.md` is history; `BACKLOG.md` holds
queued work and pending playtests; `LEDGER.md` is the per-wave scoreboard.

Key facts:
- **Repo is private, GitHub Pages is deleted** (intentional) — the game is not
  currently live/public. Verify locally only.
- Local dev: `python3 -m http.server 8317`; verify headlessly with
  **`node tools/verify.mjs`** (parallel pool, full run ~70 s on this machine;
  use named suites while iterating, then the full run before pushing; compact;
  `-v` per-check, `-j N` sets width). Add checks to `tools/checks/*.mjs`,
  never throwaway scripts.
- Verify at *natural* play values (ugly mid-drive headings, parked-truck
  distances, off-axis approaches), not convenient ones.
- If I report something broken after an update, suspect my browser cache first
  (hard refresh — python http.server sends no cache headers).
- **Ask before coding** — present an implementation plan and wait for the go-ahead.
