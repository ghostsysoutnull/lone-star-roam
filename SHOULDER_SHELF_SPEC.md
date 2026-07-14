# The Shoulder and the Shelf — world expansion spec

Locked 2026-07-14. Design doc: the in-chat proposal of the same date ("The
Shoulder and the Shelf"); this file is the buildable translation. Scope
approved by Bruno: land opens a **20-mile shoulder**, the Gulf opens
**~70 miles** (corrected from the proposal's 50 — see Settled call #1).
Ferry-first on water (player skiff deferred to a future track). US only;
Mexico settled as out.

## Goals

1. Pay the Padre debt: the island the game already believes in (landmark,
   travel entry, shrimp boats, Gully's lines) becomes real, drivable land.
2. Turn the state line from an invisible wall into a place: crossings with
   ceremony, border towns made whole, the world visibly continuing.
3. Make the Gulf inhabited: everything the maritime layer animates becomes
   somewhere you can be; the Tidelands line is the one visible offshore
   boundary; the ferries are this track's water verb.
4. Do all of it without dissolving the silhouette (see Laws).

## Laws (identity rules — every wave obeys, every check may assert)

- **`inTexas` keeps meaning Texas.** The new roamable bounds get their own
  predicate (`inWorld`); every existing consumer of `inTexas` (county
  counter, ag, animals legality, scenery legality, placement fns) keeps its
  current meaning. Padre's rings JOIN `inTexas` (the island IS Texas — its
  counties are real); the shoulder and shelf never do.
- **Counters stay sacred**: 254 counties, 132 cities. Nothing outside the
  line gets a city star, downtown, fast travel, townsfolk, or a collectible
  — except the Corner Stones, which sit ON the line, and in-Texas additions
  (landmarks, species, legends).
- **Everything in the shoulder faces Texas**: signs, glow, jobs, jokes.
  Leaving is muted, returning is celebrated.
- **The big map keeps its ink line**: shoulder/shelf render as faded margin;
  the Texas silhouette stays the icon. Minimap layer untouched.
- **No seeded stream renames, ever.** New streams get new names. Existing
  chunk keys must produce byte-identical draws inside Texas (W1 check pins
  a scenery chunk + rose positions as a frozen baseline).
- **No new light rigs** (sky.js owns lights); rig flares/horizon glows are
  emissive + `ATMOS.night` gates, brand-light precedent only if playtest
  demands it.
- Tone: affectionate, family-friendly, nothing hostile. Neighbor ribbing
  stays gentle (the casino joke is the parking lot, not the gamblers).

## Verified data facts (2026-07-14, this session)

- **Platform distances** (measured against `border.json`, 16.09 u/mi):
  25.0 / 31.4 / 26.1 / 34.0 / **64.1** / 49.1 / 31.2 mi. Shipping lane max
  35.6 mi. The 64.1-mi platform (LL 28.0, −95.0, off Matagorda) becomes the
  Far Rig.
- **Padre was dropped by the pipeline**, not the source: `build-data.mjs`
  takes the largest ring ("ignore tiny islands"). The Census 500k source
  has the barrier islands; restore Padre's ring(s) as additional border
  polygons. Needs the `us-states.json` input again (not in repo) or a
  refetch.
- **Elevation grid is too small for the shoulder**: `ELEV` spans x −6900…
  5800, z −6200…5800 — only ~70–200 units past the line where the shoulder
  needs ~322 (20 mi). W1 rebakes the DEM on a wider grid (+~350 units on
  land sides; south stays water). Grid constants are duplicated in
  `build-elevation.mjs` and geo.js `ELEV` — change both.
- **Highways are clipped at the border**: through-route stubs into the
  shoulder need an Overpass refetch (GET, not POST — 406 here; maps.mail.ru
  mirror for big bboxes).

## The numbers

- Shoulder: 20 mi = **322 units** past the border polygon, land only.
  Uniform geometry, asymmetric attention (LA > OK ≈ NM > AR).
- Shelf: **~1,127 units** (70 mi) off the coast — one horizon past the Far
  Rig at 64.1 mi. Soft wall relocates to these edges, message rephrased
  per edge (water: "That's blue water, partner. Texas is the other way.").
- Tidelands line: **166.7 units** (10.36 mi) offshore — dashed on the big
  map, plaque on a channel buoy, blue-water color band starts beyond it.

## Wave split (each wave = one session: code + checks + full verify)

**W1 — The ground stops ending** (structural + pipeline).
Rebake DEM wider (both constant sites); restore Padre rings into
`border.json`/`inTexas`; new `inWorld` bounds (shoulder dilation + shelf
fan); move the soft wall + per-edge messages; stretch/re-fit the gulf
plane; band terrain renders (neighbor ground tint, no Texas county lines);
big-map faded margin; HUD location line outside Texas (state name; band
counties/parishes baked from the Census national file in the same pass —
"Caddo Parish, Louisiana" toasts once, never counts); through-highway
stubs refetched and clipped to the band (I-10 E/W, I-20, I-30, I-35, I-40,
I-30's US-71 pair, US-287, US-87, US-84, US-62/180 — the real crossings).
Frozen-baseline checks: in-Texas scenery/rose determinism byte-identical;
`inTexas` semantics unchanged; county counter silent outside; soft wall
measured at all four compass edges + offshore.
*Model Sonnet 5, effort high. Budget: pipeline rebakes + boundary code +
checks; no shots; grep-first; ≤2 full-file reads; Overpass via GET.*

**W2 — Padre and the coast road** (content).
The island as land: beach-as-road along the seaward edge (drive cap ≈
road-tier on wet sand strip, posted on driftwood), dunes/sea oats scenery
rows, Laguna Madre between island and mainland; Queen Isabella Causeway
(arrival ceremony, not a collectible); SPI mini-town (hand-flagged towers,
scenery not a city); Port Isabel Lighthouse **landmark** (+1); Malaquite
dawn turtle release (seeded release mornings; watching logs the **Kemp's
ridley**, species +1); Mansfield Cut jetties; travel entry "Gulf Coast —
Padre Island" arrives on the sand in DRIVE.
*Model Fable 5, effort high. Budget: code + checks, no shots, grep-first.*

**W3 — Ferries and the working water** (machinery).
Rideable Bolivar + Port Aransas ferries: drive aboard in DRIVE, boat
departs on boarding (no schedule waits), ~25 s crossing, engine cut, can't
skip — the slow-TV verb; player/truck parented to the deck
(`scene.attach` precedent); **bottlenose dolphins** bow-ride every
crossing (species +1, logged from the deck); SS Selma plaque wreck off
Galveston; bell buoys on the channel (bell synth exists). Checks:
crossing position-over-time, aboard-parenting, dolphin proximity + log,
return trip, fast-travel/job interaction while aboard.
*Model Sonnet 5, effort high. Budget: code + checks, no shots; one SHOT
sanctioned for the deck composition judgment only.*

**W4 — The Shelf** (content).
Tidelands dashed line on the big map + buoy plaque ("A republic drives a
hard bargain…"); blue-water band beyond it; rig night presence (emissive
flares, night-gated — from Malaquite the horizon has a skyline); the
**Far Rig** (the real 64.1-mi platform, upgraded prop + plaque, alone past
the blue line); the **1554 treasure light** legend off the Mansfield Cut —
new-moon nights only, inside state water (the ghost stays in Texas),
drifts away, gone by dawn (legends +1); shrimp fleet night work-lights;
**roseate spoonbill** + **whooping crane** at Aransas (species +2, crane
fact mentions wintering; birds present year-round — the game has no
seasons yet).
*Model Fable 5, effort high. Budget: code + checks, no shots, grep-first.*

**W5 — The Shoulder** (content; pre-split 5a east / 5b west, ag precedent).
*5a east*: the Neutral Ground (cypress/moss flora rows, frogs-over-
crickets ambience, crawfish ponds off the rice prairie, Vinton fireworks
barns, Neutral Ground plaque); Texarkana whole (State Line Ave, the
two-state federal building + straddle spot); Toledo Bend / Texoma far
shores; Red River crossings + **WinBig World Casino** parody (the sign
brags WORLD'S BIGGEST, the joke is the Texas plates); Hochatown sign
(CABINS · BIGFOOT · NO VACANCY) + Sunday kayak pickups southbound;
Shreveport/New Orleans as glow + control-city signs; **black bear** in the
Sabine pines (species +1, rare, flees).
*5b west*: Texola ruins; Glenrio with the two-faced FIRST/LAST IN TEXAS
motel sign; Texico/Farwell; Anthony's leap-year banner; Sunland Park under
the Franklins; **the Carlsbad seam** — control-city sign + haze, nothing
else reserved: the coming caves track plugs in here (deferred hook, NOT a
keep-out; do not build cave content in this track); Roswell stays a radio
wink only. Crossing ceremony ships with 5a: granite WELCOME TO TEXAS —
DRIVE FRIENDLY, THE TEXAS WAY monuments + bluebonnet beds at the major
crossings, muted leaving toast ("You're leaving Texas. It'll be here."),
warm return chime + occasional "Miss us?". **Corner Stones** collectible
(7 real survey points: NW tripoint 36.5°N/103°W; NE Panhandle corner
100°W/36.5°N; TX/NM corner 32°N/103°W; Boundary Marker No. 1, 1855, El
Paso; TX/AR/OK tripoint on the Red; Sabine Pass mouth; Boca Chica tip —
new save key, additive).
*Model Fable 5, effort high, both halves. Budget: code + checks, no
shots, grep-first; 5b rewrites the briefing for W6.*

**W6 — People and the board** (content, closes the track).
**The Turtle Lady**, 13th named NPC at SPI (homage register — "Every one
of these hatchlings knows the way home. My job's just the traffic.");
new rotating lines for Cap'n Sal (ferry/Selma), Gully (turtles/rig
skyline), Chuy (the river crossing), Marisol (Sunland Park), Boone
(topsoil, arriving), Thuy (crawfish rotation); ~6 new jobs — **endpoints
stay Texas cities, flavor text names the outside** (crawfish to Houston
"they ride angry"; Vinton fireworks "carefully"; seasonal Hatch chile to
H-E-Buddy; turtle-patrol volunteers to Malaquite by dawn; ferry gearbox to
Bolivar landing; Far Rig crew change to the Sabine Pass dock); radio
chatter winks (a GA pilot deviating around Roswell "no reason, just — no
reason"; Coast Guard shelf lines); plaque copy pass. Session end: fold the
track into ROADMAP.md, delete the briefing block, spec stays as history.
*Model Fable 5, effort high. Budget: pool-writing + checks, no shots.*

## Settled open calls

1. **Shelf radius 70 mi, not the proposal's 50.** Measured platforms reach
   64.1 mi; Bruno's rule ("the boundary moves with the rigs") applied
   outward. The rule is "one horizon past the last rig"; the number follows
   the world, never the reverse. Hand-laid platforms are NOT moved to fit
   round numbers.
2. Job endpoints stay Texan (offers resolve against `GEO.cities` by name —
   out-of-state endpoints would orphan; also the board points home by law).
3. Out-of-state ground collects nothing; Corner Stones sit on the line and
   are the only border collectible. Landmark list grows only inside Texas
   (Port Isabel Lighthouse; Far Rig and Glenrio and the federal building
   are plaques, not landmarks).
4. Ferries: no schedules, no skip, ~25 s, depart on boarding. Dolphins on
   every crossing (that's real Bolivar behavior).
5. Species +5 total (ridley W2, dolphin W3, spoonbill + crane W4, bear W5)
   → log 24 → 29. All year-round; facts may mention seasons.
6. SPI is scenery, not a 133rd city. No stars, no fast travel, no
   townsfolk outside the line; the shoulder is quiet by design (through
   traffic on the highway stubs is the life out there).
7. Casino parody name: **WinBig World Casino**, exterior + lot only (no
   interiors anywhere, no gambling verb; the plates are the joke).
8. Parish/county names in the band come from one Census clip in W1; they
   toast once, never count, and read "X Parish/County, {State}".
9. Carlsbad seam per Bruno 2026-07-14: sign + haze in 5b, zero cave
   content, nothing else reserved — the caves track claims it later.
10. Terrain in the band uses the real DEM (it's real geography, same as
    Texas); no county lines, no ag paint, no chapels/farmsteads/brands —
    those generators stay gated on `inTexas`.

## Risk & rollback

The tracked risk is silhouette dissolution ("the detailed part of a map").
Guards are the Laws above. If playtest after W5 says the shoulder reads as
unfinished rather than deliberate, the rollback is content-side, not
geometry-side: more crossing ceremony and glow, not more neighbor content.
The Gulf's version (bigger blue rectangle) is answered by W2+W3 shipping
before W4 — the beach and the ferry are verbs; if either lands weakly, W4
is the wave to trim, never W2/W3.
