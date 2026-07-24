# Lone Star Roam — next session kickoff

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the
Three.js free-roam Texas game. Process law, commands, and architecture live in
`CLAUDE.md`; standing rules in **`GOTCHAS.md`** (grep it for the area you're
changing); per-module grep anchors in `MODULES.md`; history in `ROADMAP.md`;
queued work in `BACKLOG.md`; per-wave scoreboard in `LEDGER.md`.

## Session briefing
- **This session**: **Map W3 of 4 per `MAP_SPEC.md`** (read its W3
  sections before planning) — live traffic glyphs on the big map (trains/
  ships/planes as a sixth Traffic toggle in the W2 layer bar), click-to-
  waypoint (pin on both maps, compass tick, header distance, session-only),
  and the you-are-here widget (`#map-coords` grows Copy + Google Maps on
  the player position). W1.2's click-to-copy gesture is retired in this
  wave (spec resolved call). Map W2 + the cities-containment rider shipped
  2026-07-23 (the commit carrying this briefing).
- **Recommended setup**: handoff **yes**, effort **high** — glyph ink and
  a gesture swap on settled surfaces; single `wave-coder` (under the
  multi-chunk threshold unless the plan grows). Plan-grill runs before
  spawn (pilot verdict KEEP, now practice — BACKLOG "amendment pilots").
  Session runs Fable 5; flag it if another model is running.
- **Budget**: code + checks (waypoint numeric surface, mover-dot count vs
  system state, widget text) + debug action (force a waypoint) + tours;
  glyph table in the JSON contract file; grill = 1 round under the BACKLOG
  token rules; one full verify (the agent's closing run); no shots —
  logic/glyph work (`judge-shot.sh` still broken; Bruno judges any
  exception shot).
- **Then**: close via `/wave-close`; briefing rewrite points at Map W4
  (the context bake — last wave: briefing deleted, track folds into
  ROADMAP, minimap-untouched law repealed in GOTCHAS, W4's one open knob
  is the place-population cutoffs picked from the scout's sweep numbers).

Gotchas carried over: `tools/judge-shot.sh` broken (staged shots judged by
Bruno only); minimap stays untouched through W3 (repeal only in W4); the
shared `#toast` surface is written by maritime/trains/energy — any check
asserting toast silence must clear moving-system interference (the 120u
route-margin pattern in `tools/checks/energy.mjs`, Map W2); W3's mover
enumerations are read-only (`trains` consists, `maritime.ships` +
`shrimpers`, `radio.sources` — no new scans, `MAP_SPEC.md` W3).
