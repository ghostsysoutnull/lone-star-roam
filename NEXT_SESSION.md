# Lone Star Roam — next session kickoff

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the
Three.js free-roam Texas game. Process law, commands, and architecture live in
`CLAUDE.md`; standing rules in **`GOTCHAS.md`** (grep it for the area you're
changing); per-module grep anchors in `MODULES.md`; history in `ROADMAP.md`;
queued work in `BACKLOG.md`; per-wave scoreboard in `LEDGER.md`.

Active track: **Sea-Industry Realism** (`SEA_INDUSTRY_SPEC.md`, W2 of 3).
Sea W1 (ports + AIS routes + Ports log) shipped 2026-07-23, commit eeca211;
the Verify Ops interstitial (runner single-instance lock + load warning +
toast-class fix, `VERIFY_OPS_SPEC.md`) shipped 2026-07-23.

## Session briefing
- **This session**: Sea-Industry Realism, wave 2 of 3 — named ships (seeded
  `shipid:` identity + approach placard, trains' idiom), VHF channel-16
  chatter near ships and ports, Coast Guard cutters on patrol + joint
  moments with the CG helicopter, shrimp fleet working real grounds on a
  dawn/dusk cycle, life offshore (5 water-gated species in the critter log,
  gulls trailing live shrimpers). Wave 1 (ports + AIS routes + Ports log)
  shipped 2026-07-23, commit eeca211.
- **Recommended setup**: handoff **no**, effort **high** — chatter register,
  new behaviors, and wildlife feel are the wave's risk; mechanical chunks
  delegate per chunk mode. Session runs Fable 5; flag it if another model
  is running.
- **Budget**: code + checks + tours + one staged shot (spec: suite checks +
  one shot), grep-first, one full run at close per the launch-discipline
  law. Perf: within caps (instanced fleets + species rows).
- **Then**: rewrite this block for Sea-Industry W3 (sea cargo jobs + boat
  shop) — W3 closes the track: fold into ROADMAP, sweep satellite docs,
  graduate surviving gotchas.

Gotchas carried over (Sea W1 → W2): ships
pingpong routes — never wrap (never-vanish law); `maritime.force(x,z)` /
`shipHere` is the ship-forcing pattern — W2's shrimper cycle and chatter
need their own forcing actions per the tour law; W2 cutters ride
`maritime.routes` (`routeAt`) — never a new lane; Beaumont/Port Arthur/
Brownsville harbors are NOT game water (roadsteads only — no water content
at their anchors); announcer toasts race nearest-wins — test at Brownsville
(no competing sites).
