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

**Turtle release legibility shipped and play-confirmed 2026-07-16 (`7e1c31f`)**
— and the procedure is now reusable: `/legibility-pass <subject>` (project
skill, works with cheaper models too) with a candidate queue in `BACKLOG.md`
(bats, dolphins, and a Tours-tab audit sweep that should run first).

**Placement legality shipped 2026-07-16** — all 56 brand sites now resolve
through a `legalize()` gate (off road ribbons at reference brand scale 0.5,
dry, in-state), the H-E-Buddy search rejects wet/out-of-state/on-road spots
(Corpus bay / El Paso border / Waco Brazos fixed), Bucky's billboards re-snap
to real pavement on curves, and 5 landmarks stepped off their ribbons.
GOTCHAS has the standing rule; `brands.mjs` asserts it all. Play-confirmed
same day, including the Tours group. Same session: the Bucky's pylon sign
went neon (tube-trace wordmark on a dark board, sign light 16→5, LSC
emissive idiom) — play-confirmed; `SHOT=1` now stages a pylon close-up.

---

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture +
commands + gotchas) and grep **`GOTCHAS.md`** — the law book — for the area
you're changing. `MODULES.md` has per-module grep anchors — prefer grep + a
targeted read over whole-file reads. `ROADMAP.md` is history; `BACKLOG.md` holds
queued work and pending playtests; `LEDGER.md` is the per-wave scoreboard.

Key facts:
- **Repo is public again and GitHub Pages is live** (confirmed with Bruno
  2026-07-16) — pushes deploy to
  https://ghostsysoutnull.github.io/lone-star-roam/. Full verify before
  every push is mandatory again.
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
