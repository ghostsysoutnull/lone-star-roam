# Lone Star Roam — next session kickoff

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the
Three.js free-roam Texas game. Process law, commands, and architecture live in
`CLAUDE.md`; standing rules in **`GOTCHAS.md`** (grep it for the area you're
changing); per-module grep anchors in `MODULES.md`; history in `ROADMAP.md`;
queued work in `BACKLOG.md`; per-wave scoreboard in `LEDGER.md`.

Active track: **Sea-Industry Realism** (`SEA_INDUSTRY_SPEC.md`, W3 of 3).
Sea W2 (named ships + VHF + cutters + shrimp fleet + life offshore) shipped
2026-07-23; Sea W1 (ports + AIS routes + Ports log) shipped 2026-07-23,
commit eeca211.

## Session briefing
- **This session**: Sea-Industry Realism, wave 3 of 3 — sea cargo jobs
  between ports (kind `'sea'`, the charter precedent) + the boat shop
  (six upgrades: outboard tiers, hull paint, VHF handheld, running
  lights, shrimp rig, fish finder). Wave 2 (the working Gulf) shipped
  2026-07-23, the commit before this file's.
- **Recommended setup**: handoff **yes** (wave-coder), effort **high** —
  settled-design execution: pure terms in mission-rules.js, catalog +
  applyGear plumbing; the handoff plan must be the full contract (every
  player-visible string verbatim, all knob values stated). Session runs
  Fable 5; flag it if another model is running.
- **Budget**: code + checks, no shots, grep-first, one full run at close
  (launch-discipline law). Perf: none (logic + catalog + small light
  meshes).
- **Then**: W3 closes the track — fold Sea-Industry into `ROADMAP.md`,
  sweep satellite docs (`BACKLOG.md` header, anything naming the active
  track), graduate surviving gotchas into `GOTCHAS.md`, delete this
  briefing block (this file returns to kickoff-only).

Gotchas carried over (Sea W2 → W3): `shipid:` / `shrimper:` seed streams
are shipped — never rename; three ports have `berth: null` (Beaumont /
Port Arthur / Brownsville — roadstead law), so W3 dock pickup/delivery
must resolve `berth ?? roadstead` and only fishing ports host shrimp-rig
landings; `FISHING` path points in maritime.js are probe-verified water
literals — never "simplify" them back to raw LL projections (harbor
shorelines render land at this scale); outboard knob arrays follow the
index-0-is-stock law against `BOAT_*` in vehicle.js; the W3 VHF handheld
extends the existing maritime `onChatter` range gate (`VHF_R`/
`VHF_BOAT_R`), not a new transmitter; W2's shot lesson is now a check —
instanced-component geometries stay origin-centered (offsets live in the
instance matrix, rig boom's base-pivot translate is the one exception);
sea-surface legibility law from the W2.1 playtest rounds — a waterline
subject reads only by proud silhouette + motion cue + mini-world scale
(turtle dome / dolphin arc / ray wingtips / tarpon leap — Bruno's eye
caught all three misses); **`tools/judge-shot.sh` is broken** (Copilot CLI
rejects the zero-tools lockdown — BACKLOG "Test harness follow-ups" entry;
until fixed, staged shots are judged by Bruno only, which W3 sidesteps —
its budget is no-shots).
