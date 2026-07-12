# Lone Star Roam — next session kickoff

Copy-paste this prompt to start the next session:

---

We're continuing work on **Lone Star Roam** (`~/claude-area/devel/tx`), the
Three.js free-roam Texas game, on the **aviation priority track**. Before
touching code read `CLAUDE.md` (architecture + commands + gotchas) and
**`AVIATION.md`** (the full 5-wave plan + design stance + cross-cutting
rules; all open calls settled 2026-07-11). `MODULES.md` has per-module grep
anchors — prefer grep + a targeted read over whole-file reads. `ROADMAP.md`
is history; `BACKLOG.md` holds all queued non-aviation work.

Key facts:
- **Live & public**: https://ghostsysoutnull.github.io/lone-star-roam/ —
  every push to `main` deploys there within ~2 min, so verify before
  committing.
- Local dev: `python3 -m http.server 8317`; verify headlessly with
  **`node tools/verify.mjs`** (compact; `-v` for per-check lines). Add
  checks to `tools/checks/*.mjs`, never throwaway scripts. Sim waits are
  cheap (`t.simStep` / `t.step`); full rules incl. the
  one-real-loop-sentinel-per-system requirement in CLAUDE.md
  "Verification rules".
- Verify at *natural* play values (ugly mid-drive headings, parked-truck
  distances, off-axis approaches), not convenient ones.
- If I report something broken after an update, suspect my browser cache
  first (hard refresh — python http.server sends no cache headers).
- **Ask before coding** — present the wave's implementation plan and wait
  for the go-ahead.

Task: **Aviation wave 5 — Charter & military color, continued** (full spec in
`AVIATION.md`; waves 1–4 shipped 2026-07-11; military flavor's B-1/Randolph
landmarks + NASA T-38/low-level trainer pairs shipped 2026-07-12; **charter
jobs shipped 2026-07-12** — missions.js `kind: 'charter'` offers between
airport pairs, real-touchdown detection reusing radio.js's own landing test
via new `airports.js` exports `TD_AGL`/`TD_SPD`, charter livery via
`vehicle.js` `mkWings` `userData.mat`/`stockColor`, `missions.force(fromId,
toId)` test hook + debug button — see ROADMAP.md, full spec in
`CHARTER_JOBS_SPEC.md`). Remaining à-la-carte candidates, both already
scoped in with Bruno's go-ahead: **Sheppard T-38 touch-and-go pattern
circuits** (the one piece that needs real new design — a closed traffic
pattern doesn't fit the point-to-point `AviationSystem` schedule or the
simple orbit/transit movers already built; budget it its own session), and
**Marfa gliders** (silent soaring circles over the strip on clear
afternoons). Still deferred/unscoped: crop duster dawn runs from tier-3
strips, a 13th bespoke NPC (duster pilot, weather-wise dialog) — confirm
scope with Bruno before picking these up. Notes: `src/rotors.js` has
`HeliSystem`/`BlimpSystem` and `src/military.js` has `MilitaryAirSystem`
(candidates array, `force(kind)`/`despawnAll` test hooks, global airborne
cap idiom with per-kind `weight`); reuse the same pattern for any new mover
rather than inventing one — military.js additionally shows how to share
`aviation.js`'s `MAX_AIR` budget across systems via
`aviation.airborneCount()`. `aviation.divert(m)` is public if new air
traffic needs a forced diversion; `airports.js` `onRunway(a,x,z,rad)` is the
pavement-corridor test for any new ground-contact placement (now paired with
exported `TD_AGL`/`TD_SPD` for "is this thing landed"); `radio.js` stays
standalone — Sheppard radio chatter should follow the same pattern, never
break `aviation.update`'s signature.

Session end (per wave): fold the shipped wave into ROADMAP.md, advance the
Task block above to the next wave, run `node tools/verify.mjs`, then commit.

---

## Notes for me (the human)

- Debug menu: http://localhost:8317/?debug=1 + backquote — aviation buttons
  (departure / arrival / test radio / heli / blimp all shipped).
- Saves are per-browser (localStorage): localhost and the public URL keep
  separate progress. N mutes audio.
- Pending playtests from pre-aviation features are listed in `BACKLOG.md`.
