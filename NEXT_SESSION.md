# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: Energy (`ENERGY_SPEC.md`), wave 3 of 6 — real wind
  farms (turbine rows instanced at the baked `windFarms[]` sites,
  blades spinning with live `ATMOS.wind` — the windmill idiom), solar
  farms as panel fields at the real `plants[]` solar sites (crop-decal
  idiom from the air, rows near ground), and the W3 hero sites joining
  the Energy log (Roscoe, Horse Hollow, a coastal farm — Papalote
  Creek area) + their tables registered into the W2 announcer. Wave 2
  (well sites + scatter retirement, offshore rebase, night flares,
  Energy log + Spindletop/Midland Tank Farm, approach announcer)
  shipped 2026-07-17, commit `6463587`.
- **Recommended setup**: model **Sonnet 5**, effort **high** —
  instancing plumbing. Flag it if the running model differs.
- **Budget**: code + checks, **one shot** (turbine row at dusk),
  grep-first.
- **Then**: rewrite this briefing for W4 (refinery skylines + night
  glow + the local light pool + spill decals, Fable 5, high — two
  shots: Ship Channel night, rig water glow).

Gotchas carried over: the announcer machinery is DONE (energy.js) —
W3 only calls `energy.register(x, z, r, label)` per named site; no new
toast code. Turbines join the existing windmill animate coverage
(`userData.animated`, kind drives `ATMOS.wind` spin) — don't duplicate
the real-loop sentinel, the spec's W3 verify note says extend it. The
world wall caps the shelf at 1127u (`SHELF_U`): W2 re-anchored the Far
Rig to the farthest *reachable* (`inWorld`) real major (a Peregrine
Oil & Gas platform, 61.9 mi out) because the true farthest majors
(Gunnison Spar, 153 mi) sit beyond the wall as horizon dressing —
any future "farthest X" feature must filter on `inWorld` first.
`scenery.flareMat` is the shared night-gate for well flares; W4's
refinery flares should reuse the pattern (or the material) rather than
fork a new gate.

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
