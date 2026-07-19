# Rails Operations — track spec

## Executive summary

**Goal**: make every train a *journey*, not a fragment — full courses across
the real network, per-train identity on the HUD, radio chatter, and no two
trains rolling through each other. Successor to Railroads Realism
(2026-07-19); driven by Bruno's playtest of the Rails tours the same day.

**Wave 1 — the player gets:**
- every train identifies itself on approach: symbol, consist read
  ("24 cars, grain"), trip ("Temple → Fort Worth · Fort Worth Sub")
- train radio: defect detectors, dispatcher calls, crew acknowledgments —
  ambient, heard near any train, no purchase needed
- the weather radio perk extends listening range as a bonus

*Expected result: approach any train and a toast states who it is, what it
hauls, where it's going — seeded, stable, deterministic under force().
Radio lines play near trains on seeded cooldowns via audio.radio. No new
HUD machinery; the toast surface and announcer idiom are reused. Perf
delta: none.*
*Suggested setup: Sonnet 5, effort high.*

**Wave 2 — the player gets:**
- trains that go somewhere: every consist rolls junction to junction
  across subdivisions instead of braking dead at a polyline end
- follow any train as long as you care to; it arrives, it doesn't stall
- opposing trains no longer spawn onto a collision course (interpenetration
  mostly gone; fully gone in W3)
- the W1 trip line becomes literally true — destination matches the course

*Expected result: all trains hop junctions (the named-train mechanism
generalized); spawn skips polylines occupied by opposing traffic; arrival =
decelerate, hold while watched, recycle unwatched (existing laws). Spur and
band laws intact. Perf delta: none.*
*Suggested setup: Fable 5, effort high.*

**Wave 3 — the player gets (marquee):**
- real meets: on single track one train pulls into a real siding, holds,
  the opposing train rolls past, and both talk it through on the radio
- 878 real OSM sidings baked alongside the mainlines they serve

*Expected result: sidings re-baked from OSM (real-or-absent: rails without
a real siding get no meets — spawn exclusivity covers them). Opposing
pairs resolve to a siding hold + meet chatter; a debug action stages a
meet on demand for the tour. Perf delta: +1 merged mesh (~1 draw call).*
*Suggested setup: Fable 5, effort high.*

## Decisions (Bruno, 2026-07-19)

- **Meet ladder**: rung (b) now — no co-spawning on an occupied polyline
  (ships in W2) — with rung (c) real siding meets as the W3 marquee. Rung
  (a) lateral offset rejected: fakes double track on single-track subs.
- **Journey scope**: *all* trains journey. The playtest finding was random
  freight dying at buffers; a promoted-set fix would leave the broken read.
- **Sidings source**: scout ran in the spec session (2026-07-19) and
  settled it — **re-bake from OSM**. Numbers: 2,497 `service=siding` ways
  in the Texas bbox; 878 within 300 m of baked mainlines; median length
  825 m; 65 of 171 baked rails carry ≥1 usable (≥400 m) siding, led by
  exactly the subs that matter (Palestine 65, Baird 32, Toyah 30, Del Rio
  29, Galveston 28, Lampasas 27, Glidden 27). Rails without a real siding
  get no meets — real-or-absent, per the standing Mexico-policy principle.
- **Chatter gating**: proximity ambient for everyone; the weather-radio
  perk extends range (×2), never gates.
- **Build-order slot**: rails-ops runs now, before sea-industry;
  sea-industry then Mexico shoulder unchanged (`VISION_2026H2.md`).

## Wave 1 — identity + chatter (design settled)

Sonnet executes; decisions below are final.

**Identity contract** (`trains.js`):
- Built once at spawn/force/startNamed, stored on the train object as
  `id: {sym, cargo, cars, orig, dest, sub}`. Seed stream
  **`trainid:<railIdx>:<seq>`** (`seededRand`; `seq` = lifetime spawn
  counter) — stable for the train's life, deterministic under `force()`
  from a fresh boot. Never rename the stream.
- `cargo` from one weighted table: manifest ×3, grain ×2, intermodal ×2,
  tank (crude) ×2, autoracks ×1, coal ×1, aggregate ×1. `cars` 15–40
  (commuter sets: fixed "commuter coaches", their real length).
- `sym` template: `<L>-<ORIG><DEST><d>` — L from cargo
  (M/G/S/O/A/C/B), ORIG/DEST = first 3 letters uppercased of origin/dest
  city, d = game day mod 31. Example: `G-TEMFOR-19`.
- `orig`/`dest` = `nearestCity` of the rail's two endpoints,
  direction-aware (dest is the end the train travels toward); `sub` =
  rail `name`, operator fallback. W2 updates `dest` live as courses hop.
- Named trains keep their bespoke names/toasts; identity line appends
  consist + trip.

**HUD surface**: the existing `onNamed` toast surface generalized to all
trains — armed per train at 60 u, re-arms on exit past 90 u. Line format:
`⟨sym⟩ — ⟨cars⟩ cars, ⟨cargo⟩ · ⟨orig⟩ → ⟨dest⟩ · ⟨sub⟩`. The 🚂
placard is unchanged. No new announcer machinery (the energy.js law).

**Chatter contract** (`trains.js` fires, `audio.radio` voices):
- Trigger: any train within `CHAT_R = 40` u (×2 with `save.gear.radio`);
  per-train cooldown seeded 25–60 s, global floor 12 s between lines.
- Line templates (seeded pick, weights in parens):
  - detector (3): `"⟨operator⟩ detector, milepost ⟨mp⟩, ⟨sub⟩. Speed
    five five. No defects. Total axles ⟨4·cars+12⟩. Detector out."`
    (`mp` seeded 10–450 per train)
  - dispatcher (2): `"⟨operator⟩ dispatcher to ⟨sym⟩ — proceed on main,
    ⟨sub⟩, no opposing traffic."`
  - crew (2): `"⟨sym⟩ copies. Proceeding on main."`
  - highball (1): `"⟨sym⟩, highball ⟨dest⟩."`
- Per-train voice: pitch/rate seeded from the identity stream.

**Checks** (extend `tools/checks/` rails suite): identity fields present +
deterministic across two `force()` boots; toast fires on a natural
drive-by approach (ugly heading, parked distance); no `undefined`/empty
slot in any rendered template; chatter fires within a sim window at
CHAT_R; cars-move sentinel untouched. Tours: identity toast spot +
chatter spot (both `force`-chained — guaranteed subjects).

**Budget**: code + checks + tours, no shots (text on an existing toast
surface), grep-first. Perf: none.

## Wave 2 — journeys (Fable; contract sketch, wave refines)

- Generalize `hopAt` to every train at end-of-line (drop the named-only
  branch in `update`); `chain()` turn-angle and `minRun` guards stand;
  spur rails stay named-train turf, band rails join like mainlines
  (existing laws, `GOTCHAS.md`).
- Spawn exclusivity (rung b): candidate rail rejected when an
  opposing-direction train occupies it; hop prefers an unoccupied
  connection.
- Arrival (no hop available): existing behavior — brake, hold while
  watched, recycle beyond 180 u. Now rare.
- Identity sync: `dest` (and toast) update on hop; the trip line always
  names the course's true current end.
- Checks: a forced train crosses ≥2 rails in one sim run; no two opposing
  trains share a rail after a spawn burst; dest matches course end after
  a hop. Tour: junction watch spot.
- **Budget**: code + checks + tours, logic-only, no shots, grep-first.
  Perf: none.

## Wave 3 — meets (Fable; contract sketch, wave refines)

- **Bake**: extend `tools/build-rails.mjs` — `service=siding` ways ≥400 m
  within 300 m of a kept mainline attach to their parent rail as
  `sd: [{s0, s1, side}]` (arc-length span + side sign). Overpass GET
  query recorded in the script header; input
  `tx-inputs/tx-sidings.json` (fetched 2026-07-19, 2.9 MB). Scout
  analysis script: scratchpad `siding-scout.mjs` (re-derivable).
- **Runtime**: siding ribbons drawn parallel at ~1.2 u offset, merged
  into the rail mesh build (+1 draw call). Occupancy registry per rail;
  an opposing pair resolves: train nearer a siding decelerates onto the
  offset span, holds, opposer passes, 3 s, resume. Meets only on rails
  with `sd`; spawn exclusivity keeps covering the rest.
- **Meet chatter** (extends W1 templates): dispatcher
  `"⟨sym A⟩, take the siding at ⟨nearest city⟩, meet ⟨sym B⟩."` — crew
  `"⟨sym A⟩ copies, in the clear."` — on pass: `"⟨sym B⟩, highball."`
- Debug action `meet` stages an opposing pair at the nearest sided rail
  (tour guarantee — the `turtleMorning` forcing pattern).
- Checks: staged meet resolves (holder speed 0 while opposer passes; both
  moving after), no interpenetration (min pairwise distance over the
  meet), siding mesh present, chatter fired. Tour: meet spot chained to
  the debug action. One Copilot-judged shot (new visible geometry).
- **Budget**: bake + code + checks + tours + one shot. Perf: +1 merged
  mesh / +1 draw call (report against `tools/checks/perf.mjs` caps).

## Notes

- Meets are Texas-bbox only for now: the siding scout bbox excluded most
  band-rail territory; band rails simply have no `sd` and fall under
  spawn exclusivity. Extend later only if a playtest asks.
- No timetables in this track: `crossingTimes` stays the named-train
  schedule idiom; journeys are continuous-spawn, not scheduled. A
  timetable layer is FUTURE.md material.
