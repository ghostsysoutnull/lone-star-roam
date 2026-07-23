# Lone Star Roam — next session kickoff

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the
Three.js free-roam Texas game. Process law, commands, and architecture live in
`CLAUDE.md`; standing rules in **`GOTCHAS.md`** (grep it for the area you're
changing); per-module grep anchors in `MODULES.md`; history in `ROADMAP.md`;
queued work in `BACKLOG.md`; per-wave scoreboard in `LEDGER.md`.

Active track: **Sea-Industry Realism** — `SEA_INDUSTRY_SPEC.md` (3 waves:
ports + AIS routes / the working Gulf + life offshore / sea economy + boat
shop). W1 shipped 2026-07-23: `data/sea.json` (6th boot data file — AIS-traced
routes + 8 port records), 8 dressed ports, 7 route ships, Ports log (12th
collectible), `LANE`/`fairwayLegs` retired.

## Session briefing
- **This session**: Sea-Industry, wave 2 of 3 — named ships (seeded `shipid:`
  identity + placard toast), VHF channel-16 chatter, Coast Guard cutters +
  the rotors.js joint moment, the shrimp fleet on a dawn/dusk cycle, life
  offshore (5 water-gated species). W1 (ports + AIS routes) shipped
  2026-07-23.
- **Recommended setup**: handoff **no**, effort **high** — chatter register +
  new behaviors + wildlife feel (spec's suggested setup). Session runs
  Fable 5; flag it if another model is running.
- **Budget**: code + checks, one staged shot (the working Gulf surface —
  cutters/shrimpers), grep-first; chunk-mode delegation for settled-contract
  suites per the Map-session rule.
- **Then**: rewrite this block for Sea-Industry W3 (sea economy + boat shop,
  handoff **yes**).

Gotchas carried over: ships pingpong routes — never wrap (a teleport can pop
in view; the never-vanish law); `maritime.force(x,z)` is the ship-forcing
debug action (`shipHere`) — W2's shrimper cycle and chatter need their own
forcing actions per the tour law; W2 cutters patrol route legs — ride
`maritime.routes` (`routeAt`), never a new lane; Beaumont/Port Arthur/
Brownsville harbors are NOT game water (ships hold roadsteads; quays have no
adjacent water — don't spawn water content at their anchors); the announcer
nearest-wins race — Beaumont port toast can lose to the Exxon refinery site,
test toasts at Brownsville (no competing sites).
