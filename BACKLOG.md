# Backlog — queued work

No active track. Rails Operations shipped in full 2026-07-19 (folded into
`ROADMAP.md`); next up per the 2026-H2 program is sea-industry
(`VISION_SEA_INDUSTRY.md`), which needs its spec session first.
Items below are the queue.
Direction-level ideas that aren't actionable yet live in `FUTURE.md`.
Parked dev-process strategy: external-model agents (codex/agy as
independent reviewers) — assessment + retake plan in
`VISION_EXTERNAL_AGENTS.md` (2026-07-21).

## Bugs (live in shipped code)

**Standing rule for this section (set 2026-07-21).** The external-agents
effort **files bugs, it does not fix them.** Every defect it surfaces lands
here with full provenance and waits for a future wave to schedule it.
Nothing found by an external reviewer is fixed in the same session it is
found — the finder's job ends at a verified, written-down entry.

**Provenance required per entry**: how it was found, which external model
found it, whether the claim was independently verified in-session, and the
Claude session model that ran the effort. External findings are claims
until a probe confirms them.

- **15 real wind farms render zero turbines; 5 render more turbines than
  exist.** `windTurbinesAt` (world.js ~980) draws candidates across the
  whole 260-unit chunk and rejects them against the farm circle, but
  derives the draw count from an *already-capped* expectation:
  `expect = Math.min(TURBINE_CAP, density * CHUNK²)`, then
  `draws = Math.ceil(expect) + 3`. Two independent failures follow:
  - **Compact farms vanish.** A compact farm covers ~2% of a chunk, so
    nearly every draw lands outside the circle and is discarded. 15 farms
    render nothing at all — including a real 17-turbine farm at r 20.
  - **Interior chunks over-populate.** A chunk lying fully inside a farm
    accepts *every* candidate, so the `+3` becomes pure surplus (expect
    6.6 → 10 turbines). 5 farms render above their baked count.

  **Not to be confused with intentional thinning.** `TURBINE_CAP = 32` per
  chunk is a deliberate density limiter and the game was never meant to
  draw all 27,644 baked turbines — **do not treat 1:1 as the fix target.**
  The defect is that the sampler is unfaithful *underneath* the cap, in
  both directions. The distinguishing evidence: a density limiter yields
  fewer-but-present, never zero, and can never exceed the real count.
  `ENERGY_SPEC.md`'s expected result is "the 27k-turbine fleet appears
  **clustered into its real farms**", and both spec and `GOTCHAS.md`
  describe the seeded-stream design as keeping the JSON small "and the
  fleet **honest**" — proportional representation under the cap, which is
  exactly what is broken.

  *Context only, not a target*: statewide the replay renders ~5,175 of
  27,644 (an upper bound — geometry only, before the `inTexas`/road/airport
  gates, and using a per-farm rather than the game's shared per-chunk cap).
  213 farms render under their baked count. The correct fix target is
  proportionality and non-vanishing, **not** a percentage.

  Fix direction: draw from the *uncapped* chunk expectation and stop after
  `TURBINE_CAP` **accepted** sites, so the cap bounds output rather than
  input; drop or rethink the `+3` surplus. Note the seed-string law —
  changing `turbine:` stream inputs moves every turbine in the world;
  prefer a fix that keeps the stream shape (more draws from the same
  stream) over one that re-keys it. Needs a `tools/checks/energy.mjs`
  guard asserting no baked farm renders zero and none exceeds its count.
- **Turbines skip the city-clearance gate — contradicts written law.**
  `windTurbinesAt` checks `nearestAnyRoad` and `airportClear` but not
  `cityClear`, so turbines can stand inside procedural downtowns.
  `GOTCHAS.md` (Rendering & systems) states the opposite as settled law:
  "every other site-placement function (`wellSiteAt`, `windTurbinesAt`)
  checks road/city/airport clearance before drawing". Code violates a
  documented rule — not a design choice. Omission confirmed by inspection;
  a specific instance (Snyder) was reported but not verified. Fold into the
  same wave as the sampler fix.

- **Solar field decals ignore road/river/city clearance at render time.**
  The ScenerySystem solar branch draws an `r*2 × r*2` field patch plus crop
  rows at the baked aggregate radius **unconditionally**, while the turbine
  branch a few lines away gates on road and airport. Fixed once already for
  roads/rivers by `68aec12`, then restructured by the W4.5 rework
  (`9b32732`) into per-block clearance — **status at HEAD unverified**, this
  entry is a re-check item, not a confirmed live bug. Confirm before
  scheduling.

  **Provenance (all three entries above).**
  - *Found*: 2026-07-21, external-agents gate run. Turbine defects from
    `codex review --commit 5f560fe` (Energy W3) against a leak-proofed
    depth-2 clone with the fix commit unreachable; the over-population
    variant from the text-only round-A rerun of the same diff.
  - *External model*: **`gpt-5.6-sol`** (OpenAI, via `codex` 0.144.5,
    reasoning effort high). The cap defect was reproduced by the same model
    with **no tool access at all**, from diff text alone.
  - *Independently verified in-session*: yes — by replaying the real
    `seededRand` stream against `data/energy.json`. An earlier area-ratio
    proxy gave a wrong figure ("21 render zero"); the deterministic replay
    gives 15. Trust the replay, not the proxy.
  - *Not found by*: **`gemini-3.1-pro-high`** (Google, via `agy` 1.1.5) on
    the identical diff — it returned "No defects found" and explicitly
    certified the broken cap logic as correct.
  - *Claude session model*: **Opus 4.8 (1M context)** (`claude-opus-4-8[1m]`).
  - *Also note*: all three defects survived the original Fable review, the
    Sonnet review, and the full verify suite.
  - *Attribution erratum*: commits `94c8fc5`, `87554e8` and `77768eb`
    (2026-07-21) carry `Co-Authored-By: Claude Fable 5`. That trailer is
    **wrong** — the session ran Opus 4.8. The convention was copied from
    prior commits without checking the running model. Corrected here rather
    than by rewriting pushed history.

  Full method, scoring and the model comparison: `VISION_EXTERNAL_AGENTS.md`
  → Gate result and Round A.

## Map follow-ups (Map W1 — readable big map — shipped 2026-07-20)

- **Seam-pass boot cost (wave-coder chunk) — shipped-pending-commit.** Fixed:
  `classify()` (geo.js) now bbox-gates each neighbor-state ring before its
  `inPoly` scan (the `beachAt` idiom), and the W1.2 seam pass (hud.js) is
  gated to 3 padded rectangles around the real seam extents (recorded by a
  one-off full-scan probe — not derived from borderZones flip vertices; the
  El Paso seam's divide sits ~3,800u west of its border-vertex anchor at
  (−3401,−1114)). Measured: wide `renderMapLayer` 11.2s → ~4.4s per boot
  (`classify()`'s bbox gate is the whole win, 385µs/call → ~150µs; the seam
  gate cut its call count but landed on already-cheap calls, so it barely
  moves `wideLayerMs` further — shelf suite confirms the seams are unchanged
  and still span-check clean, including El Paso). Full verify: 564 passed, 0
  failed, 1 unrelated flake (aviation A3, solo-confirmed, no shared code
  path). **Residual, NOT fixed by this chunk**: ~4.4s of the 11.2s remains,
  dominated by the pre-existing Water Vehicles W3 "World-edge iso-lines"
  block (hud.js ~249–299, separate from the W1.2 seam block) — instrumented
  at 258k `borderDist` calls per wide boot vs the seam pass's 8k
  `borderZoneAt` calls. That block scans the full coast + land border
  perimeter (not 3 localizable points like the seam), so it needs a
  different fix (tighter near-band, a border spatial index, or a cached
  static line) — open follow-up, out of this chunk's authorized scope.

- **Map layers wave (W2)**: toggleable big-map overlays — rails, energy
  sites, airports, counties, ag, collectibles found/unfound. Shape settled
  in the W1 discussion: one pre-rendered canvas per layer composited in
  `drawBig`, so toggles cost nothing at runtime and every future track can
  register a layer. Plus click-to-set-waypoint on the big map (compass +
  minimap pointer to it; reuse the travel menu's haul-lock rule if it ever
  fast-travels). Candidates from the same discussion: visited-vs-unvisited
  city tint, mission origin→target route hint.
- **Mexico 25-mi band** — Bruno wants a follow-up conversation (2026-07-20,
  post-Map-W1) before anything is queued: it reopens the settled
  Shoulder & Shelf call (`geo.js`: "Mexico gets no dilation at all — the
  wall stays at the Rio Grande") and done right is track-sized (Band-Parity
  treatment: border cities, crossings, scenery), not a map wave.

## Test harness follow-ups (verify.mjs is now a parallel pool, 2026-07-12)

- ~~Auto-confirm flaked suites in verify.mjs~~ — shipped 2026-07-20; rules
  in `GOTCHAS.md` → Verification.

- **Split `aviation.mjs` into wave-shards** (~30 s → ~20 s): export
  `shards = [{name, run}]` (wrap each wave's checks in an in-place arrow fn,
  re-declare `const aus` per shard) + a back-compat serial `default`; teach the
  runner to schedule a sharded suite as N queue units. Breaks the aviation
  pole. Re-run 15× co-scheduled stress after (chatter checks land in higher
  concurrency). Design settled; **evaluated and skipped 2026-07-12 on ROI** —
  measured full run ~24 s (aviation pole 17.4 s, next pole lights 12.0 s), so
  sharding recovers only ~8–10 s/run vs a ~30-min session (~300-run payback).
  Revisit only if aviation grows substantially or concurrency flakes appear.
## Playtest findings 2026-07-15 (Bruno's tx-urgent notes; ocean-zone fix
already shipped as `54b3511` — these are the remaining items)

- ~~Gulf plane pokes past the terrain grid~~ — shipped by Water Vehicles W1
  (2026-07-19); see `ROADMAP.md`.
- ~~Water sits a touch below terrain + wants effects and sound~~ — shipped
  by Water Vehicles W2 (2026-07-19); see `ROADMAP.md`.
- ~~The band is always desert~~ — shipped by Band Parity W3 (2026-07-16);
  see `ROADMAP.md`.
- ~~NM band mountain silhouettes read flat~~ — shipped by West Texas massifs
  (2026-07-18); see `ROADMAP.md`.
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
- **Band airports beyond the 25-mile line** (deferred from Band Parity W6,
  2026-07-17): Roswell/Lawton/Lake Charles (and Carlsbad/Alamogordo) are
  currently glow + radio-wink only — GOTCHAS' exclusion law, `band.mjs`
  asserts they never appear as real content. Bruno may want one or more as
  landable fields later. Needs: an explicit call on relaxing that exclusion
  for the airport point specifically (not the whole town), real OSM
  `aeroway=runway` fetch per field, ROUTES entries (aviation.js — a missing
  one crashes boot), and the 27-field/7-15-5-tier/22-gate-sign table-size
  bumps across `tools/checks/aviation.mjs`.
- **Poly review of pre-6b props**: W6b shipped the curvier kit (8–14 seg
  turnings); review the Shelf (W5) and Shoulder-east (6a) heroes — rigs,
  buoy, monuments, WinBig, fed building — plus older landmarks for the
  same treatment.

## Rails Operations (vision: `VISION_RAILS_OPS.md`, 2026-07-19)

Bruno's playtest of the Rails tours: trains run one polyline and stop dead
at its end (only named trains hop junctions), no per-train HUD identity or
trip info, no radio chatter, and opposing trains on one line pass through
each other (no occupancy model). Full courses + identity + chatter + meets
— ~3 waves, spec session when the track opens; open calls listed in the
vision doc. W1 (identity + chatter) and W2 (journeys) shipped 2026-07-19.

- **Operator-aware hop preference** (Bruno approved backlog 2026-07-19,
  post-W2 — *only if a playtest notices*): at a junction, a train prefers
  a connecting rail owned by its own operator, falling back to any (the
  existing clean/any two-tier in `hopAt` gains a same-operator tier).
  Closes the one perceivable journey-realism gap — a BNSF loco announcing
  UP subs for the rest of its life — without a route planner. The fallback
  must stay soft: a hard operator filter would re-create the dead-end
  stalls W2 removed on sparse operator networks. ~30 min in `trains.js`
  `hopAt` + one check. Everything beyond this (planned yard-to-yard trips,
  fixed symbols, timetables) is imperceptible at roadside-encounter scale
  — settled as not worth a wave (W2 session verdict); timetable layer
  stays `FUTURE.md` material.

## Next in line (in order)

1. **Slot export/import** (deferred from New Player W4, 2026-07-17): back up
   a save slot to a file and restore it from one, on the title screen —
   insurance against browser-data loss (`NEWPLAYER_SPEC.md` W4's own
   pre-authorized drop-to-backlog candidate). W4 shipped 3 named slots +
   per-slot settings without it; storage scheme is `src/slots.js`
   (`KEYS`/`slotKey`/`SLOT_COUNT`) — export should serialize a slot's save
   key plus its 4 settings keys as one JSON file; import writes them back
   under the target slot's keys and (if it's the active slot) goes through
   `gameplay.loadSlot`/`title._afterLoad` so the live game reflects it
   immediately, not just storage.
2. **Haunted Texas wave 2 — the apparitions** (planned & approved 2026-07-11;
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
3. **Gamepad analog steering** (~1 hour, biggest driving-feel win) — Gamepad
   API axes/buttons alongside keyboard; poll in `Player.update`;
   `t.stubGamepad` is already in the harness waiting.
4. **Big-map click-to-set-waypoint** — generalize the mission target pipeline
   (map diamond + compass diamond + guide arrow) to a map click.
5. **`nearestBandRoad`'s grid indexes each segment by its midpoint cell only**
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

AIS-based real ship routes (marinecadastre.gov track data): the
full-realism alternative to the hand-laid coastal lane. The Energy track
kept the lane under its scarcity exception (0 OSM separation lanes off
Texas; port legs snap to the 8 real fairways) — revisit only if maritime
gets its own track; heavy input pipeline, poor ROI standalone.

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
