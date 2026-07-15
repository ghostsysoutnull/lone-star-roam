# Backlog — queued work

Queued behind whatever track is active (currently Agriculture,
`AGRICULTURE_SPEC.md`); when a track ends, pull the next item from here
into `NEXT_SESSION.md`. Direction-level ideas that aren't actionable yet
live in `FUTURE.md`.

## Test harness follow-ups (verify.mjs is now a parallel pool, 2026-07-12)

- **Split `aviation.mjs` into wave-shards** (~30 s → ~20 s): export
  `shards = [{name, run}]` (wrap each wave's checks in an in-place arrow fn,
  re-declare `const aus` per shard) + a back-compat serial `default`; teach the
  runner to schedule a sharded suite as N queue units. Breaks the aviation
  pole. Re-run 15× co-scheduled stress after (chatter checks land in higher
  concurrency). Design settled; **evaluated and skipped 2026-07-12 on ROI** —
  measured full run ~24 s (aviation pole 17.4 s, next pole lights 12.0 s), so
  sharding recovers only ~8–10 s/run vs a ~30-min session (~300-run payback).
  Revisit only if aviation grows substantially or concurrency flakes appear.
- **lights `until(trains>0, 45000)`**: drive/force a train to a known spot
  instead of waiting on the real spawn, so lights can't become the pole.

## Playtest findings 2026-07-15 (Bruno's tx-urgent notes; ocean-zone fix
already shipped as `54b3511` — these are the remaining items)

- **Gulf plane pokes past the terrain grid** ("ocean after dry land on the
  US states"): the 14000×9000 gulf plane (world.js `buildWater`) extends
  beyond the DEM rectangle (`ELEV` maxX 6230 / maxZ 5800), so east of the
  Louisiana band the world turns to open water with no seafloor under it.
  Fix direction: clip or fade the plane outside the terrain grid (or extend
  a dry skirt) — diagnosis in the 2026-07-15 session, geometry all in
  `buildWater`/`buildTerrain`.
- **Shields for railways**: give rail lines a presence in the HUD the way
  roads get shields (interpretation to confirm with Bruno — crossing signs
  at grade crossings vs a rail glyph/name line in the HUD when near track).
- **Water sits a touch below terrain + wants effects and sound**: river
  ribbons ride `hAt + 0.07` and lakes sit at lowest-shoreline +0.15, which
  reads sunken at some banks; wants a look at the offsets, plus water
  ambience (river/lakeshore loop in audio.js) and a cheap surface effect
  (ripple/sparkle).
- **Band land readability**: no roads connect band cities to the grid
  (known W2 limitation — arterials only; connecting stubs is polish, needs
  a re-bake), Bruno's "no elevation?" impression (the band DOES use the
  real DEM — check whether the flat `cOut` 0.75 tint is washing out relief
  cues), and "are the land colors accurate?" — a color-ramp pass on
  out-of-Texas cells in `buildTerrain`.
- **Brand buildings positioning review** (Bucky's / H-E-Buddy / Lone Star
  Compute): review all sites' placement against roads/downtowns — Bruno
  flags it wholesale; ranches and chapel–cemetery pairs confirmed good.
- **Roads, railroads, rivers visual pass**: "make them better" — ribbon
  width/color/texture upgrade candidates; no direction settled yet.
- **Poly review of pre-6b props**: W6b shipped the curvier kit (8–14 seg
  turnings); review the Shelf (W5) and Shoulder-east (6a) heroes — rigs,
  buoy, monuments, WinBig, fed building — plus older landmarks for the
  same treatment.

## Next in line (in order)

1. **Haunted Texas wave 2 — the apparitions** (planned & approved 2026-07-11;
   follow wave-1 patterns in haunts.js, +4 legends → 6):
   - **Ghost Stampede at Stampede Mesa** (~33.55 N, −101.17 W caprock rim near
     Crosbyton — the legend behind "Ghost Riders in the Sky"). Gate on
     **storm weather + deep night**: translucent emissive longhorns
     (~24, instanced) + a rider looping a hand-laid rim path (maritime-lane
     idiom), `fog: false` to punch through storm fog, opacity pulses with
     sky.js lightning. The marquee event.
   - **El Muerto** — headless-rider *silhouette* in the south brush country,
     UFO-style rare rolls with a hotspot near San Diego/Ben Bolt (~27.7 N,
     −98.2 W); gallops parallel at 60–90 units, darts away if pressed (saucer
     state machine on a horse); synth hoofbeats by distance.
   - **La Llorona** — white figure + synth wail at hand-laid riverbank anchors
     (Rio Grande, San Antonio River, Woman Hollering Creek I-10 crossing
     ~29.56 N, −98.06 W); vanishes on approach.
   - **Chupacabra** — night lurker near the real Cuero/Elmendorf sightings;
     mangy hairless-coyote build, flees the horn (`scare` idiom). Fact:
     every confirmed one was a coyote with mange. So far.
   - Verify: parallel-heading + distance-band over time (El Muerto), rim
     displacement (stampede), vanish-on-approach opacity curves, horn-flee.
2. **Gamepad analog steering** (~1 hour, biggest driving-feel win) — Gamepad
   API axes/buttons alongside keyboard; poll in `Player.update`;
   `t.stubGamepad` is already in the harness waiting.
3. **Big-map click-to-set-waypoint** — generalize the mission target pipeline
   (map diamond + compass diamond + guide arrow) to a map click.

## Later

Haunted Texas wave 3: San Antonio ghost tracks push (~29.34 N,
−98.44 W — only event touching player physics; strict no-push-by-day check),
town churches in `cities.js` (reuse `mkChapel`), USS Lexington "Blue Ghost"
landmark with night glow, painted-church landmark (St. Mary's High Hill).

## Pending human playtests (pre-aviation features)

- **Reworked UFO encounter** (debug 🛸 button starts it instantly): the
  saucer shadows you low and close in all three modes for 120–210 s — judge
  the standoff/height (the `tgt` block in `src/ufo.js`: 36 units out, 13
  above ground) and whether the headlight/lantern flicker reads. Try it
  walking (lantern), driving (headlights + engine sputter), and flying
  (nav lights + prop sputter).
- **Haunted Texas wave 1**: drive ranch roads west of Llano at night till you
  find a glowing cemetery (roughly 1 chapel per 10 chunks; visible by day —
  white steeple by the road), or use the debug menu. Judge: wisp
  size/brightness at parked distance (`SphereGeometry(0.26…)` + opacity 0.85
  in `src/haunts.js`), the approach-fade feel (`FADE_NEAR/FADE_FULL`), the
  midnight bell mix (`bell()` in `src/audio.js`), and whether ~50% haunted
  nights (`WISP_ODDS`) feels right. Enchanted Rock fires: fly there after
  dark, watch from the base. Terlingua + Presidio La Bahía are in the travel
  menu Landmarks tab.
- **Shop loop**: engine I + tires I worth $350? Lacy's yips, crate perch,
  weather-radio window, paint colors at night — knobs in `src/shop.js` /
  `src/sky.js` (`forecastT`) / `src/audio.js`. New items to balance-check:
  **Aviation tune** (climb/cruise, `FLY_CAP`/`FLY_CLIMB`) — do +10/20/30%
  cruise and +15/30/45% climb feel worth it in the air? **Cargo rig**
  (`CARGO_PAY` payout ×) — does +15/30/45% haul pay change which jobs you take?
- Also still pending: traffic honk chorus on I-35, flares at night, headlight
  throw, wildlife voices mix, UI scale at 170%+ on 1080p.
