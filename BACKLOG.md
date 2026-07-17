# Backlog — queued work

Queued behind whatever track is active (currently **Band Parity**, opened
2026-07-16 — `BAND_PARITY_SPEC.md`, 6 waves); when a track ends, pull the
next item from here into `NEXT_SESSION.md`. Direction-level ideas that aren't actionable yet
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
- ~~**The band is always desert**~~ → **Shipped by Band Parity W3**
  (2026-07-16): per-neighbor `BAND_TINT` in world.js (`bandTint(x,z)` via
  geo.js `neighborStateAt`), strengths ≤0.5 so the height ramp reads; Mexico
  keeps the full 0.75 `cOut` wash deliberately. Verified by `band.mjs` +
  Bruno-approved screenshot batch.
- **NM band mountain silhouettes read flat** (found in W3, 2026-07-16): the
  Brokeoff/Guadalupe NM side has real 780 m local DEM gradients but at 30u
  grid cells that's ~3° of apparent slope — no paint change can dramatize it
  (true inside Texas too). Texas's dramatic peaks are hand-built mountain
  meshes in world.js; extending that kit to the Guadalupes' NM side is the
  fix if wanted. Visual judgment — Bruno's call whether it's worth a slot.
- **Band roads: the concurrency defect** (diagnosed 2026-07-15) — distinct
  from the known "arterials only" scope limit below. A route is only matched
  when it's listed FIRST: the bake's Overpass regex is `^(<routes>)($|;)` and
  the script then takes `(ref).split(';')[0]`. OSM tags concurrencies as
  `US 60;US 84`, so **every** US 84 way from Clovis to Farwell (216 ways:
  `US 60;US 84`, `US 60;US 70;US 84`, `US 70;US 84`) is invisible to both —
  US 84's closest approach in the baked data is 305u, it never reaches Texas.
  That's why Clovis sits 145u from the line unroaded. Predates the
  2026-07-15 rebake (old data has the same gap; the rebake reproduced the
  idiom faithfully). **Only US 84 was checked — assume other routes are hit.**
  Fix: match the ref anywhere (`(^|;)(<routes>)($|;)`) AND pick the *matching*
  ref, not `[0]`; re-fetch all four states (queries/endpoints/bboxes are now
  recorded in `tools/build-band-roads.mjs`'s header), rebake, re-verify the
  shoulder suite (crossing monuments read band endpoints). Shifts the road set
  again — land it on its own, not stacked on another band change.
  → **Superseded by Band Parity W1** (2026-07-16): the tier-based fetch has
  no ref regex at all, so the defect disappears structurally.
- **Band scope call (decide BEFORE the concurrency fix codes)**: 147 of 177
  band cities have no road within 25u, and the concurrency fix won't change
  that — only 11 through-routes were ever queried (I-10/20/30/35/40, US
  62/71/84/87/180/287). That's the W2 design: Texas's highways continuing
  across the line, not the road network *of* the neighbors. Connecting the
  band towns is a scope expansion (more refs? a real network fetch?), not a
  bug fix — needs Bruno's call on how far the shoulder is meant to go.
  → **Resolved 2026-07-16**: Bruno called full parity — Band Parity track
  opened (`BAND_PARITY_SPEC.md`); W1 is the tier-based network fetch.
- **Brand buildings positioning review** (Bucky's / H-E-Buddy / Lone Star
  Compute): review all sites' placement against roads/downtowns — Bruno
  flags it wholesale; ranches and chapel–cemetery pairs confirmed good.
- **Roads, railroads, rivers visual pass**: "make them better" — ribbon
  width/color/texture upgrade candidates; no direction settled yet.
- **Band railroads** (deferred from Band Parity, 2026-07-16): OSM rail fetch
  for the 4 neighbor strips + trains.js extension — own bake, build-rails
  idiom. Queued behind the track's close.
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
4. **`nearestBandRoad`'s grid indexes each segment by its midpoint cell only**
   (found during Band Parity W2, 2026-07-16): a query point near one END of a
   long unsplit band-highway segment (US 270 west of the OK panhandle border
   measured 488u in one piece) can land several cells from that midpoint and
   read back `null` at a small search radius, even though the point sits
   exactly on the road. No current consumer breaks on it (traffic.js
   interpolates `h.pts` directly, never calls `nearestBandRoad`) — fix
   direction: index by every cell each segment's bbox spans, not just the
   midpoint, mirroring the Texas `nearestRoad` grid if it already does this.

## Legibility passes (`/legibility-pass <subject>` — skill in `.claude/skills/`)

Procedure proven on the Malaquite turtle release (`7e1c31f`): silhouette +
per-occurrence HUD announcement + suite checks. Known same-class candidates
(all `spotSpecies`-only, i.e. silent after the first log — announcement axis
confirmed; silhouette axis needs the audit step):

- **Bats** (`bats.js`) — Congress Ave emergence: no per-dusk announcement.
  Ribbon flecks may be fine as silhouette; audit will say.
- **Dolphins** (`dolphins.js`) — ferry-crossing companions: no per-encounter
  announcement.
- **Haunts legends** (`haunts.js`) — deliberately subtle; audit only, may be
  exempt by design.
- **General audit sweep** — buildings/props (procedural downtowns, farmstead
  kit, ports): one session walking the Tours tab judging both axes, output =
  more entries here. Do this before queueing individual passes.

## Later

Placement audit follow-on (2026-07-16): coastal city-building scatter vs
water is unaudited — `cities.js` rejects roads (<1.3u) but never `waterAt`,
so Corpus/Galveston-class downtowns may push procedural buildings into the
bay. The offline audit mirror in the placement-legality session's scratchpad
pattern (data JSONs + projection) makes this a cheap check before any fix.

Haunted Texas wave 3: San Antonio ghost tracks push (~29.34 N,
−98.44 W — only event touching player physics; strict no-push-by-day check),
town churches in `cities.js` (reuse `mkChapel`), USS Lexington "Blue Ghost"
landmark with night glow, painted-church landmark (St. Mary's High Hill).

## Pending human playtests — the Shoulder & the Shelf (track closed 2026-07-15)

Owed since the ranch compounds; the track shipped headless-verified, so this
is the whole of its human judgment in one list. Nothing here is a known bug.

- **The eight ranch compounds** (waves 5/5b): the original four plus JA, XIT,
  Matador and LBJ — including landing at the new LBJ strip.
- **Padre** (W3): the causeway arrival, the beach drive, a dawn turtle release
  at Malaquite.
- **The Shelf** (W5): the rig skyline from Malaquite at night, the buoy and Far
  Rig plaques, the treasure light on a new-moon night, the Aransas birds.
- **The Shoulder east** (W6a): the I-10 crossing both ways (monument, leaving
  murmur, homecoming chime), a Vinton dusk (frogs, fireworks barns, Neutral
  Ground marker), the Texarkana straddle, the WinBig lot read from I-35, one
  Corner Stone hunt, a bear in the Sabine pines.
- **The Shoulder west** (W6b): the Texola wall read, the Glenrio sign from both
  directions of I-40, the Texhoma painted line, Anthony's banner, and the
  Carlsbad doorstep climb to the turnaround.
- **W7's people and board**: the Turtle Lady at SPI, a Passport progress line
  after a few crossings, the job-board notes (do they read as flavor or as
  instructions?), and the located radio winks. The B-52 and the shelf lines have
  reachability sentinels, so those are proven live — judge the *register*, not
  whether they fire. **The Roswell wink is the one unproven piece**: it needs a
  GA slot routed within `NM_NEAR` (500u) of the New Mexico ring, and GA traffic
  rides schedule slots with no `force()` hook, so it has no sentinel. If a west
  Texas flight never gets close enough, that line is dead content and the gate
  needs loosening — listen for it near El Paso.

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
