# Lone Star Roam — next session kickoff

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the
Three.js free-roam Texas game. Process law, commands, and architecture live in
`CLAUDE.md`; standing rules in **`GOTCHAS.md`** (grep it for the area you're
changing); per-module grep anchors in `MODULES.md`; history in `ROADMAP.md`;
queued work in `BACKLOG.md`; per-wave scoreboard in `LEDGER.md`.

## Session briefing
- **This session**: **Map W4 of 4 per `MAP_SPEC.md`** (read its W4
  sections before planning) — the context bake: `tools/build-context.mjs`
  over the 2026-07-23 scout extracts
  (`~/claude-area/devel/tx-inputs/map-context-*.json`, queries in
  `map-context-QUERIES.txt` there) → `data/context.json` (7th boot data
  file); beyond-band roads + cities muted under band ink (hierarchy
  Texas > band > context, silver-class city marks); state-name labels
  (NEW MEXICO / OKLAHOMA / ARKANSAS / LOUISIANA / MEXICO) on both
  renders; `drawMini` re-targets the wide canvas (repeals the
  minimap-untouched law — GOTCHAS entry at close). **Rider**: the
  Airports-toggle rework (MAP_SPEC W4 rider bullet — toggle becomes the
  code+tier detail layer over the base ✈, ~15 lines). Map W3 (traffic
  glyphs + waypoint + position widget) shipped 2026-07-24, the commit
  carrying this briefing; the Mexico Shoulder W0 scout memo landed the
  same session (`VISION_MEXICO_SHOULDER.md`) — Mexico spec gate is
  satisfied.
- **Recommended setup**: handoff **yes**, effort **high** — bake
  execution on the scout's numbers plus muted ink on the band-backdrop
  precedent. Plan-grill before spawn (1 round, BACKLOG token rules).
  W4's ONE open plan knob: place-population cutoffs US vs Mexico, picked
  from the scout's sweep numbers (MAP_SPEC W4) at plan time. Session
  runs Fable 5; flag it if another model is running.
- **Budget**: bake script + gate asserts (nonzero km per slab, expected
  named cities, island-aware `inTexas` classification) + draw + labels +
  minimap re-target + checks; one full verify (agent's closing run);
  ONE staged shot, Bruno-judged (`judge-shot.sh` still broken). Perf:
  +1 boot fetch, costlier layer render, no 3D delta.
- **Then**: LAST WAVE — close via `/wave-close` track-close path:
  briefing deleted, track folds into one `ROADMAP.md` entry, satellites
  swept (BACKLOG header, docs naming the track), surviving gotchas
  graduate into `GOTCHAS.md`, this file returns to kickoff-only. Slot
  export/import is next in BACKLOG after the track.

Gotchas carried over: `tools/judge-shot.sh` broken (staged shots judged
by Bruno only); context is a **map-only overlay** — never merged into
the band arrays (geo.js gameplay indexes must not move; Mexico is
non-roamable); rectangle clip stays (the Monterrey effect is a feature);
the bake classifies with island-aware `inTexas()` (the scout's
mainland-only approximation misclassified Port Aransas); shared `#toast`
interference pattern for any toast-silence assert (120u route margin,
`tools/checks/energy.mjs`); Base-resets-toggles keeps muted context
visible (base-canvas content, spec resolved call).
