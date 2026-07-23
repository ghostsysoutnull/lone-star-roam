# Lone Star Roam — next session kickoff

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the
Three.js free-roam Texas game. Process law, commands, and architecture live in
`CLAUDE.md`; standing rules in **`GOTCHAS.md`** (grep it for the area you're
changing); per-module grep anchors in `MODULES.md`; history in `ROADMAP.md`;
queued work in `BACKLOG.md`; per-wave scoreboard in `LEDGER.md`.

Active track: **Verify Ops** (interstitial, 1 wave — `VERIFY_OPS_SPEC.md`),
then back to **Sea-Industry Realism** (`SEA_INDUSTRY_SPEC.md`, W2 of 3).
Sea W1 (ports + AIS routes + Ports log) shipped 2026-07-23, commit eeca211.

## Session briefing
- **This session**: Verify Ops, wave 1 of 1 — verify single-instance lock
  (exit 3 refusal + stale reclaim), startup load warning, toast-assertion
  class fixed via `t.until` (band + sea + mandatory class sweep), launch-
  discipline law in GOTCHAS. Full contracts settled in `VERIFY_OPS_SPEC.md`
  (lock path/content/messages verbatim, selftest cases, sweep recipe).
  Born from the Sea W1 wave-close incident (3-run pile-up, load 33,
  20 solo-green flakes — incident record in the spec).
- **Recommended setup**: handoff **yes** (wave-coder — settled-design
  execution; the runner selftest is the safety net), effort **high**.
  Session runs Fable 5; flag it if another model is running.
- **Budget**: code + selftest + named suites (band, sea) + one full run at
  close, no shots, no tours, grep-first. Perf: none (no game code).
- **Then**: rewrite this block for Sea-Industry W2 — named ships (seeded
  `shipid:` identity + placard), VHF chatter, CG cutters + rotors joint
  moment, shrimp fleet dawn/dusk, life offshore (5 species); handoff no,
  effort high (chatter register + wildlife feel).

Gotchas carried over (Sea W1 → W2, keep through the interstitial): ships
pingpong routes — never wrap (never-vanish law); `maritime.force(x,z)` /
`shipHere` is the ship-forcing pattern — W2's shrimper cycle and chatter
need their own forcing actions per the tour law; W2 cutters ride
`maritime.routes` (`routeAt`) — never a new lane; Beaumont/Port Arthur/
Brownsville harbors are NOT game water (roadsteads only — no water content
at their anchors); announcer toasts race nearest-wins — test at Brownsville
(no competing sites).
