# Lone Star Roam — next session kickoff

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the
Three.js free-roam Texas game. Process law, commands, and architecture live in
`CLAUDE.md`; standing rules in **`GOTCHAS.md`** (grep it for the area you're
changing); per-module grep anchors in `MODULES.md`; history in `ROADMAP.md`;
queued work in `BACKLOG.md`; per-wave scoreboard in `LEDGER.md`.

## Session briefing
- **This session**: **Map W2 of 4 per `MAP_SPEC.md`** (spec written
  2026-07-23 — read its W2 sections before planning) — big-map overlay
  layers (Rails/Energy/Airports/Counties/Crops toggles + Base reset,
  lazily-rendered canvases composited in `drawBig`, persisted). Scope
  changed from the old one-wave shape in Bruno's spec review: waypoint +
  widgets moved to W3, collectibles layer dropped, beyond-band context
  bake is W4. Still the **shakedown wave for the 2026-07-23
  wave-protocol amendment**: JSON contract file, multi-chunk wave-coder +
  single closer, plan-grill pilot, challenge triage (pilots in BACKLOG
  "amendment pilots").
- **Recommended setup**: handoff **yes**, effort **high** — settled canvas
  pattern, no feel kernel; 2 chunks with disjoint files (spec names them),
  second agent is the closer. Session runs Fable 5; flag it if another
  model is running.
- **Budget**: code + checks + debug action + tours; style tables go in the
  JSON contract file, not the plan message; grill = 1 round under the
  BACKLOG token rules; one full verify (the closer's); no shots unless a
  layer looks wrong — then 1 staged shot, Bruno-judged (`judge-shot.sh`
  still broken).
- **Rider chunk** (Bruno approved 2026-07-23, from the coastal audit):
  the `cities.js` building-containment fix — third file-disjoint
  `wave-coder` chunk (`src/cities.js` + checks; contract with the audit
  numbers in BACKLOG's "Placement audit follow-on" entry). Not part of
  the Map wave itself; rides the session.
- **Scout still out**: beyond-band map-context prefetch (launched
  2026-07-23) — its numbers gate the W4 plan, not W2. The coastal audit
  landed 2026-07-23 (findings in BACKLOG).
- **Then**: close via the **`/wave-close` skill**; its report carries the
  pilot verdicts (grill keep/kill, multi-chunk economics, scout, the skill
  itself) and the `fable+sonnet×N` ledger convention; briefing rewrite
  points at Map W3 (slot export/import queues after the track — Bruno
  approved 2026-07-23).

Gotchas carried over: `tools/judge-shot.sh` broken (Copilot rejects the
zero-tools lockdown — staged shots judged by Bruno only); verify
single-instance lock means exactly one closer runs the wave's full verify;
minimap stays untouched through W2–W3 (the law is repealed only in W4).
