# Lone Star Roam — next session kickoff

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the
Three.js free-roam Texas game. Process law, commands, and architecture live in
`CLAUDE.md`; standing rules in **`GOTCHAS.md`** (grep it for the area you're
changing); per-module grep anchors in `MODULES.md`; history in `ROADMAP.md`;
queued work in `BACKLOG.md`; per-wave scoreboard in `LEDGER.md`.

## Session briefing
- **This session**: Map W2 (single wave, no spec file — shape settled in the
  W1 discussion) — toggleable big-map overlay layers (rails, energy,
  airports, counties, ag, collectibles found/unfound; one pre-rendered
  canvas per layer composited in `drawBig`) + click-to-set-waypoint. Also
  the **shakedown wave for the 2026-07-23 wave-protocol amendment**: JSON
  contract file, multi-chunk wave-coder + single closer, plan-grill pilot,
  challenge triage (CLAUDE.md step 4; pilots in BACKLOG "amendment
  pilots"). Bruno approved jumping it ahead of slot export/import
  (2026-07-23). Sea-Industry closed 2026-07-23 (`d66360f`); amendment
  shipped `184a10e`..`58628d6`.
- **Recommended setup**: handoff **yes**, effort **high** — settled design,
  no feel kernel (canvas compositing follows the existing map-layer
  pattern); split 2–3 chunks with disjoint files, last agent is the closer.
  Session runs Fable 5; flag it if another model is running.
- **Budget**: code + checks + tours; layer tables go in the JSON contract
  file, not the plan message; grill = 1 round under the BACKLOG token
  rules; one full verify (the closer's); no shots unless a layer looks
  wrong — then 1 staged shot, Bruno-judged (`judge-shot.sh` still broken).
  **Sidecar**: `data-scout` first mission — coastal city-building scatter
  vs water audit (BACKLOG "Later" entry; findings-only, disjoint from the
  wave, may run in parallel).
- **Then**: close via the **`/wave-close` skill** (first exercise —
  shipped 2026-07-23); its report carries the pilot verdicts (grill
  keep/kill, multi-chunk economics, scout, and the skill itself) and the
  `fable+sonnet×N` ledger convention if multi-chunk ran; briefing rewrite
  puts slot export/import back at queue head.

Gotchas carried over: `tools/judge-shot.sh` broken (Copilot rejects the
zero-tools lockdown — staged shots judged by Bruno only); verify
single-instance lock means exactly one closer runs the wave's full verify.
