# Backlog — queued behind the aviation track

Everything here is on hold until the `AVIATION.md` waves ship (decided
2026-07-11). NEXT_SESSION.md stays aviation-only; when the track ends, pull
the next item from here back into it.

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
4. **Helicopter detail pass** (spec ready, scope approved 2026-07-12 — full
   plan in `HELICOPTER_SPEC.md`): the four `rotors.js` `HeliSystem` kinds
   (medical/news/coast guard/army) currently share one low-poly body,
   differentiated only by tint. Give each its own geometry (~3× the current
   poly count) plus a signature "tell" — medical red-cross panel, news nose
   camera ball, coast guard hoist basket + bigger radome, army stub-wing
   tanks + boxier cabin — and split the shared `InstancedMesh` pair into
   four kind-scoped pairs. Army also gets a real 4-blade rotor
   (`mkHeliRotor(bladeCount, radius)`) vs. 2-blade elsewhere — the biggest
   at-a-distance differentiator. Rendering-layer only; cap/weight/despawn
   logic in `update()` is untouched. Verify: poly-count-increased +
   four-distinct-geometries + rotor-blade-count assertions, all existing
   heli behavioral checks as regressions, one `t.shot` of all four kinds
   for a visual gut-check (explicit exception to the no-screenshots
   default — this is a genuinely visual change).

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
  `src/sky.js` (`forecastT`) / `src/audio.js`.
- Also still pending: traffic honk chorus on I-35, flares at night, headlight
  throw, wildlife voices mix, UI scale at 170%+ on 1080p.
