# Lone Star Roam — next session kickoff

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the
Three.js free-roam Texas game. Process law, commands, and architecture live in
`CLAUDE.md`; standing rules in **`GOTCHAS.md`** (grep it for the area you're
changing); per-module grep anchors in `MODULES.md`; history in `ROADMAP.md`;
queued work in `BACKLOG.md`; per-wave scoreboard in `LEDGER.md`.

No active track: **the runner-telemetry + durable-history wave shipped
2026-07-22** (handoff via `wave-coder`) — every verify run now writes a
schema-2 JSON with structured failure signatures to a reboot-durable
history (`~/.cache/lonestar-verify/history/`, 180-day/keep-100 prune) plus
the atomic latest pointer (`/tmp/lonestar-verify.json`); browser crashes
are `infra` casualties (bounded relaunch, exit 3 = infra-incomplete, never
FAIL, zero signatures) so crash noise can't poison flake-policy evidence;
the runner self-test grew to 51 assertions across 6 child runs. The
wave-close full verify (572 passed, 0 failed, 0 flakes) is the first
trusted history entry. History now accumulates run over run — the
flake-policy and startup-optimization gates (`BACKLOG.md`) are unblocked
and waiting on volume.

**Queue order (corrected 2026-07-22)**: sea-industry spec session (below),
then the wind-farm bake-clip rebake (`BACKLOG.md` → Bugs; the solar-decal
re-check may fold in). The turbine-sampler + city-clearance wave had
already shipped 2026-07-22 (`3172eb3`); its stale BACKLOG entries are now
struck. Map W2 (layers + waypoint) stays queued in `BACKLOG.md`.

## Session briefing
- **This session**: sea-industry spec session — write `SEA_INDUSTRY_SPEC.md`
  from `VISION_SEA_INDUSTRY.md` (goals, wave split, open calls resolved
  before any wave codes, per-wave handoff grades + design-settled
  sections; `NEWPLAYER_SPEC.md` is the format reference). Doc-only, no
  code. Runner-telemetry wave shipped 2026-07-22 (the commit carrying this
  briefing).
- **Recommended setup**: handoff **no**, effort **high** — specs and tech
  design are always Fable 5 in-loop. Session runs Fable 5; flag it if
  another model is running.
- **Budget**: the spec doc + queue/briefing rewrite only; doc-only diff —
  no tests, no shots; grep-first for module touchpoints (maritime.js,
  world.js, geo.js are the likely borders).
- **Then**: rewrite this block for the spec's wave 1 — or, if the spec
  defers coding, for the wind-farm bake-clip rebake wave.

Gotchas carried over: the rebake wave (next coding work) must reproduce the
shipped `data/energy.json` unfixed before applying the border clip
(prefer-true-source rule); Overpass from this environment is GET, never
POST (`curl -sG --data-urlencode`).
