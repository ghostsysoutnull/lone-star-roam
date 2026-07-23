# Lone Star Roam — next session kickoff

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the
Three.js free-roam Texas game. Process law, commands, and architecture live in
`CLAUDE.md`; standing rules in **`GOTCHAS.md`** (grep it for the area you're
changing); per-module grep anchors in `MODULES.md`; history in `ROADMAP.md`;
queued work in `BACKLOG.md`; per-wave scoreboard in `LEDGER.md`.

Active track: **Sea-Industry Realism** — `SEA_INDUSTRY_SPEC.md` (3 waves:
ports + AIS-informed routes / the working Gulf + life offshore / sea
economy + boat shop; all open calls resolved, per-wave design-settled
sections in the spec). No sea code exists yet. The wind-farm bake-clip
rebake and the solar-decal re-check shipped 2026-07-22.

## Session briefing
- **This session**: Sea-Industry, wave 1 of 3 — eight real named ports
  (dressed, visitable, HUD announce), ship traffic on AIS-informed routes
  replacing the hand-laid `LANE`, Ports log (12th collectible,
  `save.ports`). The wind-farm bake-clip rebake (queue predecessor)
  shipped 2026-07-22.
- **Recommended setup**: handoff **no**, effort **high** — new bake + new
  visible surface + route judgment (spec's suggested setup). Session runs
  Fable 5; flag it if another model is running.
- **Budget**: route scout numbers before any lane ships, code + checks,
  one staged shot (new visible surface: the dressed ports), grep-first.
  Perf: port kits must fit the caps in `tools/checks/perf.mjs` (spec's
  W6b poly bar).
- **Then**: rewrite this block for Sea-Industry W2 (working Gulf + life
  offshore).

**W1 prerequisite (ask first thing if absent)**: one AIS daily extract in
`~/claude-area/devel/tx-inputs/` — marinecadastre.gov → AIS Vessel
Traffic Data → any recent day's national CSV zip (~0.5–1 GB). One day is
enough; the scout clips it to the Texas Gulf bbox offline.

Gotchas carried over: the W1 scout produces numbers (median lateral
offset vs the AIS density ridge, approaches joining the 8 baked fairways)
*before* any lane ships; retiring the hand-laid `LANE` is the scarcity
exception's planned end — grep `GOTCHAS.md` for the maritime/lane rules
before touching `maritime.js`; Overpass from this environment is GET,
never POST (`curl -sG --data-urlencode`).
