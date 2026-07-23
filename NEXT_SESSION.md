# Lone Star Roam — next session kickoff

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the
Three.js free-roam Texas game. Process law, commands, and architecture live in
`CLAUDE.md`; standing rules in **`GOTCHAS.md`** (grep it for the area you're
changing); per-module grep anchors in `MODULES.md`; history in `ROADMAP.md`;
queued work in `BACKLOG.md`; per-wave scoreboard in `LEDGER.md`.

Active track: **Sea-Industry Realism** — `SEA_INDUSTRY_SPEC.md` written
2026-07-22 (3 waves: ports + AIS-informed routes / the working Gulf +
life offshore / sea economy + boat shop; all open calls resolved, per-wave
design-settled sections in the spec). No sea code exists yet. Queue order:
the **wind-farm bake-clip rebake** ships first (`BACKLOG.md` → Bugs; the
solar-decal re-check may fold in), then sea W1.

## Session briefing
- **This session**: wind-farm bake-clip rebake — 83 baked wind-farm
  centers sit outside the Texas border polygon (`tools/build-energy.mjs`
  bins over the raw Overpass bbox without clipping); clip farm cells to
  the border and rebake `data/energy.json`. Full entry with provenance in
  `BACKLOG.md` → Bugs. The solar-decal re-check may fold in. Sea-industry
  spec session shipped 2026-07-22 (the commit carrying this briefing).
- **Recommended setup**: handoff **no**, effort **high** — bake-pipeline
  work with a reproduce-first gate needs in-loop judgment; the diff is
  small but the verification is the wave. Session runs Fable 5; flag it if
  another model is running.
- **Budget**: reproduce + clip + rebake + checks (energy suite + affected
  fast groups), no shots; grep-first. Perf: none (data-only rebake).
- **Then**: rewrite this block for Sea-Industry W1 (ports + routes; the
  W1 scout's AIS sample download can be requested from Bruno early —
  marinecadastre.gov daily extract).

Sea W1 prerequisite (Bruno self-serve, any time before W1): download one
AIS daily extract — marinecadastre.gov → AIS Vessel Traffic Data → any
recent day's national CSV zip (~0.5–1 GB) — into
`~/claude-area/devel/tx-inputs/`. One day is enough; the scout clips it
to the Texas Gulf bbox offline. If absent when W1 opens, that session
asks for it first thing.

Gotchas carried over: the rebake must reproduce the shipped
`data/energy.json` unfixed from raw inputs *before* applying the border
clip (prefer-true-source rule); Overpass from this environment is GET,
never POST (`curl -sG --data-urlencode`); wind-farm records feed
`GEO.energy.windFarms` — turbine *candidates* already gate on `inTexas`,
so the visible change is announcer/HUD-side only.
