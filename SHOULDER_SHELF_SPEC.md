# The Shoulder and the Shelf — world expansion spec

Locked 2026-07-14; **land half re-specced same day** (Bruno's amendment:
the shoulder gets real, data-driven map presence — cities, stars,
buildings, air traffic, collectibles — not hand-placed scenery). Design
doc: the in-chat proposal + amendment conversation of the same date; this
file is the buildable translation. Scope: land opens a **25-mile
shoulder** (amended from 20 — the shared-metro width, settled call #1b),
the Gulf opens **~70 miles** (settled call #1). Ferry-first on water
(player skiff deferred to a future track). US only; Mexico settled as out.

## Goals

1. Pay the Padre debt: the island the game already believes in (landmark,
   travel entry, shrimp boats, Gully's lines) becomes real, drivable land.
2. Turn the state line from an invisible wall into a place: crossings with
   ceremony, border towns made whole, the world visibly continuing.
3. Give the shoulder real presence, data-driven: whatever Census/OSM says
   is there — cities with buildings, stars, airfields, air traffic —
   renders where it really is, partial edge-cities included.
4. Make the Gulf inhabited: everything the maritime layer animates becomes
   somewhere you can be; the Tidelands line is the one visible offshore
   boundary; the ferries are this track's water verb.
5. Do all of it without dissolving the silhouette (see Laws).

## Laws (identity rules — every wave obeys, every check may assert)

- **`inTexas` keeps meaning Texas.** The roamable bounds get their own
  predicate (`inWorld`); every existing consumer of `inTexas` (county
  counter, ag, animals legality, scenery legality, placement fns) keeps
  its current meaning. Padre's rings JOIN `inTexas` (the island IS Texas);
  the shoulder and shelf never do.
- **Data-driven systems cross the line; hand-authored love stays home —
  except where the line itself is the subject.** Crosses: cities +
  buildings, map stars, townsfolk, traffic, county/parish names, airports
  + air traffic, terrain, highways. Stays home: named NPCs, landmarks,
  brands, ag paint, chapels/farmsteads, haunts. Line-subject exceptions:
  the W6 vignettes (Glenrio, Texola, State Line Ave, WinBig, welcome
  monuments, Corner Stones) and the sanctioned Carlsbad doorstep (#9).
- **Counters stay sacred**: 254 counties, 132 cities, towered-Texas
  logbook. Nothing in the shoulder increments a Texas tally, ever.
  Shoulder progress lives ONLY in the **Passport** (own save area, own
  HUD row — see Systems).
- **Day-trip rule**: no fast travel to band cities; they stay off the
  travel menu. Out there is windshield-only.
- **Gold is Texas, silver is abroad**: band city stars (map + world prop)
  render silver, at a glance distinct from the Texas gold.
- **The big map keeps its ink line**: band terrain renders as faded
  margin; band cities draw silver stars + labels on it; the Texas
  silhouette stays the icon. Minimap layer untouched.
- **No seeded stream renames, ever.** New streams get new names (band
  cities et al. on a fresh `band:`-style prefix). Existing chunk keys must
  produce byte-identical draws inside Texas (W1 pins a frozen baseline).
- **No new light rigs** (sky.js owns lights); rig flares/horizon glows are
  emissive + `ATMOS.night` gates.
- Tone: affectionate, family-friendly, nothing hostile. Neighbor ribbing
  stays gentle (the casino joke is the parking lot, not the gamblers).

## Systems added by the amendment

- **The Passport** — the shoulder's own progress container, never folded
  into Texas counts (`save.passport`, new additive key): 4 **state
  stamps** (first crossing per neighbor), **band towns** visited (silver
  stars), the 7 **Corner Stones** (they sit ON the line — the Passport's
  whole subject), and **away landings** (band airfields; the Texas
  logbook stays towered-Texas /7). Own HUD row + help-screen block.
  Parish/county crossing toasts stay flavor-only — no tally competes
  with the 254.
- **Band aviation** — fields authored from OSM like the Texas 21.
  Scheduled civilian spokes: Shreveport Regional, Texarkana Regional (the
  town's own airport, 3.1 mi into Arkansas), Clovis Municipal, Hobbs/Lea
  County. Military flavor (not schedule): Cannon AFB, Barksdale AFB — a
  rare clear-day B-52 pair, Dyess's counterpart. Curated tier-3 GA strips
  where OSM has them. **Every field gets a ROUTES entry** (LBJ boot-crash
  gotcha). **Charters may cross the line** (airport-id resolution, no
  orphan risk; landing stamps the Passport); **road jobs stay
  Texas-endpoint** (name resolution + the board points home).

## Verified data facts (2026-07-14, this session)

- **Platform distances** (vs `border.json`, 16.09 u/mi): 25.0 / 26.1 /
  31.2 / 31.4 / 34.0 / 49.1 / **64.1** mi; lane max 35.6. The 64.1-mi
  platform (LL 28.0, −95.0, off Matagorda) becomes the Far Rig.
- **Band contents, measured** (miles from the border polygon):
  - In at 20: Shreveport 17.3 + Bossier 18.4 (partial), Sulphur 19.5,
    DeRidder 15.3, Leesville/Ft Johnson 16.4, Vinton 7.2, Texarkana AR
    1.4 + TXK 3.1, Idabel 8.1, Broken Bow 17.9, Durant 14.6, Ardmore
    17.9, WinStar 2.5, Altus 12.7 + AFB 15.6, Guymon 12.7, Texhoma 0.5,
    Clovis 9.6 + Cannon 16.5, Portales 17.2, Hobbs 4.2, Lovington 16.9,
    Carlsbad Caverns surface 12.1, Anthony 0.5, Sunland Park 1.0, Santa
    Teresa jetport 3.7.
  - Added by 25: **Barksdale AFB 22.5, Las Cruces 23.6, Hochatown 24.9**,
    Sayre 21.4.
  - Kept out at 25: Hope 28.0, Lake Charles 28.5, Carlsbad city 29.1,
    **Lawton 30.9** (a 30-mi band would slice it — the deciding argument
    for 25), Elk City 35.4, Natchitoches 41.7, Alamogordo 62, Roswell
    86.9 (radio wink only). Beyond-band presence = horizon glow +
    control-city signs.
- **Padre was dropped by the pipeline**, not the source: `build-data.mjs`
  takes the largest ring ("ignore tiny islands"). Census 500k has the
  barrier islands; restore Padre's ring(s). Needs `us-states.json` again
  (not in repo) or a refetch.
- **Elevation grid is too small for the shoulder**: `ELEV` spans x −6900…
  5800, z −6200…5800 — ~70–200 units past the line where the 25-mi
  shoulder needs ~402. W1 rebakes wider (+~430 units on land sides; south
  stays water; DEM file ~330 KB → ~500 KB). Grid constants duplicated in
  `build-elevation.mjs` and geo.js `ELEV` — change both.
- **Highways are clipped at the border**: band roads (through-routes +
  primaries around band cities) need an Overpass refetch (GET, not POST —
  406 here; maps.mail.ru mirror for big bboxes).

## The numbers

- Shoulder: 25 mi = **402 units** past the border polygon, land only.
  Uniform geometry; the asymmetric attention now emerges from the data
  itself. Principle: complete every metro Texas shares (Texarkana,
  Shreveport–Bossier–Barksdale, El Paso–Sunland Park–Santa Teresa–Las
  Cruces), stop before importing ones it doesn't (Lawton, Lake Charles).
- Shelf: **~1,127 units** (70 mi) off the coast — one horizon past the
  Far Rig at 64.1 mi. Soft wall relocates to these edges, message
  rephrased per edge (water: "That's blue water, partner. Texas is the
  other way.").
- Tidelands line: **166.7 units** (10.36 mi) offshore — dashed on the big
  map, plaque on a channel buoy, blue-water band starts beyond it.

## Wave split (each wave = one session: code + checks + full verify)

| Wave | Scope (one line) | Model | Effort |
|------|------------------|-------|--------|
| W1 — The ground stops ending | pipeline + bounds + band data | Sonnet 5 | high |
| W2 — The Neighbors | band cities/stars/townsfolk/aviation/Passport | Sonnet 5 | high |
| W3 — Padre & the coast road | island content | Fable 5 | high |
| W4 — Ferries & the working water | rideable-ferry machinery | Sonnet 5 | high |
| W5 — The Shelf | offshore content | Fable 5 | high |
| W6a/6b — The Shoulder east/west | line vignettes + ceremony | Fable 5 | high |
| W7 — People & the board | NPC/job/radio pools, track close | Fable 5 | high |

**W1 — The ground stops ending** (structural + pipeline; grown ~⅓ by the
amendment). Rebake DEM wider (both constant sites); restore Padre rings
into `border.json`/`inTexas`; new `inWorld` bounds (402-unit shoulder
dilation + shelf fan); move the soft wall + per-edge messages;
stretch/re-fit the gulf plane; band terrain renders (neighbor ground
tint, no Texas county lines); big-map faded margin; HUD location line
outside Texas (state + county/parish from a Census national clip —
"Caddo Parish, Louisiana" toasts once, never counts). **Band data bakes**:
Census places clip (band cities + pops), band roads (through-stubs I-10
E/W, I-20, I-30, I-35, I-40, US-287/87/84/62-180/71 + primaries around
band cities), band airport runway geometry authored from OSM
`aeroway=runway` (true headings, one-time), neighbor-state polygons for
the margin/HUD. Frozen-baseline checks: in-Texas scenery/rose determinism
byte-identical; `inTexas` semantics unchanged; county counter silent
outside; soft wall measured at all four compass edges + offshore; band
data joined (place count > 0 per state, parish lookup at a known LA
point).
*Budget: pipeline rebakes + boundary code + checks; no shots; grep-first;
≤2 full-file reads; Overpass via GET.*

**W2 — The Neighbors** (structural; NEW — the amendment's wave). Band
cities live through the existing city machinery on fresh additive seed
streams (buildings scaled by real pop, partial edge-cities render
whatever falls inside, `hasRealStreets` same rule as Texas); **silver
stars** (world prop + map) and Passport save/HUD (`save.passport`: state
stamps, band towns, stones, landings; Corner Stones land here in W6);
townsfolk from the existing big-city/small-town pools by pop (named NPCs
stay Texan); band fields join AIRPORTS + ROUTES + the schedule (spokes at
SHV/TXK/CVN/HOB; gate signs, ATIS per tier rules); Cannon + Barksdale
military flavor pairs; charter offers may draw TX↔band pairs. Checks:
band city renders + silver star + Passport town tick; Texas counters
byte-still after a full band visit; no travel-menu entry / fast-travel
lock; townsfolk spawn + night gate at a band city; `daySchedule` runs
clean over the full field table (the ROUTES-completeness check the LBJ
crash begged for); a TX↔band charter full cycle + Passport landing stamp.
*Budget: code + checks, no shots, grep-first.*

**W3 — Padre and the coast road** (content). The island as land:
beach-as-road along the seaward edge (drive cap ≈ road-tier on wet sand,
posted on driftwood), dunes/sea oats scenery rows, Laguna Madre between
island and mainland; Queen Isabella Causeway (arrival ceremony, not a
collectible); SPI mini-town (hand-flagged towers, scenery not a city);
Port Isabel Lighthouse **landmark** (+1); Malaquite dawn turtle release
(seeded mornings; watching logs the **Kemp's ridley**, species +1);
Mansfield Cut jetties; travel entry "Gulf Coast — Padre Island" arrives
on the sand in DRIVE.
*Budget: code + checks, no shots, grep-first.*

**W4 — Ferries and the working water** (machinery). Rideable Bolivar +
Port Aransas ferries: drive aboard in DRIVE, boat departs on boarding (no
schedule waits), ~25 s crossing, engine cut, can't skip — the slow-TV
verb; player/truck parented to the deck (`scene.attach` precedent);
**bottlenose dolphins** bow-ride every crossing (species +1, logged from
the deck); SS Selma plaque wreck off Galveston; bell buoys on the channel
(bell synth exists). Checks: crossing position-over-time,
aboard-parenting, dolphin proximity + log, return trip, fast-travel/job
interaction while aboard.
*Budget: code + checks, no shots; one SHOT sanctioned for the deck
composition judgment only.*

**W5 — The Shelf** (content). Tidelands dashed line on the big map + buoy
plaque ("A republic drives a hard bargain…"); blue-water band beyond it;
rig night presence (emissive flares, night-gated — from Malaquite the
horizon has a skyline); the **Far Rig** (the real 64.1-mi platform,
upgraded prop + plaque, alone past the blue line); the **1554 treasure
light** legend off the Mansfield Cut — new-moon nights only, inside state
water (the ghost stays in Texas), drifts away, gone by dawn (legends +1);
shrimp fleet night work-lights; **roseate spoonbill** + **whooping
crane** at Aransas (species +2, crane fact mentions wintering; birds
present year-round — no seasons yet).
*Budget: code + checks, no shots, grep-first.*

**W6 — The Shoulder** (content; pre-split 6a east / 6b west, ag
precedent). The line vignettes and the ceremony — the neighbors
themselves render in W2; this wave is about the border as a place.
*6a east*: the Neutral Ground (cypress/moss flora rows,
frogs-over-crickets ambience, crawfish ponds off the rice prairie,
Vinton fireworks barns, Neutral Ground plaque); Texarkana's State Line
Ave + the two-state federal building + straddle spot; **WinBig World
Casino** parody at the Red River (the sign brags WORLD'S BIGGEST, the
joke is the Texas plates); **black bear** in the Sabine pines (species
+1, rare, flees); beyond-band glow + control-city signs east (Lake
Charles, New Orleans, Natchitoches).
*6b west*: Texola ruins; Glenrio with the two-faced FIRST/LAST IN TEXAS
motel sign; Texhoma line vignette; Anthony's leap-year banner; **the
Carlsbad doorstep** (#9 — Whites City renders as a band town in W2; 6b
adds the park road switchbacks + entrance sign, ZERO cave content — the
caves track inherits a place, not a promise); beyond-band glow west
(Lawton, Alamogordo; Roswell stays a radio wink). Ceremony ships with
6a: granite WELCOME TO TEXAS — DRIVE FRIENDLY, THE TEXAS WAY monuments +
bluebonnet beds at the major crossings, muted leaving toast ("You're
leaving Texas. It'll be here."), warm return chime + occasional "Miss
us?", state-stamp Passport wiring. **Corner Stones** (7 real survey
points: NW tripoint 36.5°N/103°W; NE Panhandle corner 100°W/36.5°N;
TX/NM corner 32°N/103°W; Boundary Marker No. 1, 1855, El Paso; TX/AR/OK
tripoint on the Red; Sabine Pass mouth; Boca Chica tip) → Passport.
*Budget: code + checks, no shots, grep-first; 6b rewrites the briefing
for W7.*

**W7 — People and the board** (content, closes the track). **The Turtle
Lady**, 13th named NPC at SPI (homage register — "Every one of these
hatchlings knows the way home. My job's just the traffic."); new
rotating lines for Cap'n Sal (ferry/Selma), Gully (turtles/rig skyline),
Chuy (the river crossing), Marisol (Sunland Park + Las Cruces next
door), Boone (topsoil, arriving), Thuy (crawfish rotation);
Passport-aware progress lines; ~6 new jobs — **endpoints stay Texas
cities, flavor text names the outside** (crawfish to Houston "they ride
angry"; Vinton fireworks "carefully"; seasonal Hatch chile to H-E-Buddy;
turtle-patrol volunteers to Malaquite by dawn; ferry gearbox to Bolivar
landing; Far Rig crew change to the Sabine Pass dock); band-charter
manifest flavor; radio chatter winks (a GA pilot deviating around
Roswell "no reason, just — no reason"; Coast Guard shelf lines; Barksdale
heavies checking in); plaque copy pass. Session end: fold the track into
ROADMAP.md, delete the briefing block, spec stays as history.
*Budget: pool-writing + checks, no shots.*

## Settled open calls

1. **Shelf radius 70 mi, not the proposal's 50.** Measured platforms
   reach 64.1 mi; the boundary follows the rigs, outward. Rule: one
   horizon past the last rig; the number follows the world, never the
   reverse. Hand-laid platforms are NOT moved to fit round numbers.
1b. **Shoulder width 25 mi, not 20/30** (Bruno, 2026-07-14, D1): the
   shared-metro width — completes Texarkana, Shreveport–Barksdale, and
   El Paso–Las Cruces, catches Hochatown at 24.9, and stops before a
   30-mi edge would slice Lawton/Ft Sill (30.9).
2. Road-job endpoints stay Texan (offers resolve against `GEO.cities` by
   name; the board points home). **Charters may cross** — airport-id
   resolution, Passport stamp on the band landing.
3. Shoulder progress = **the Passport only** (D2): state stamps, band
   towns (silver stars), Corner Stones, away landings. Own save area +
   HUD row; never folds into Texas tallies. Parishes toast, never count.
4. Ferries: no schedules, no skip, ~25 s, depart on boarding. Dolphins
   on every crossing (that's real Bolivar behavior).
5. Species +5 total (ridley W3, dolphin W4, spoonbill + crane W5, bear
   W6) → log 24 → 29. All year-round; facts may mention seasons.
6. **Day-trip rule** (D3): band cities render fully (buildings, silver
   stars, townsfolk by pop) but get no fast travel and no travel-menu
   entry; discovery is windshield-only. SPI stays scenery, not a 133rd
   city (it's Texas — the 132 is sacred the other way too). Named NPCs,
   landmarks, brands, haunts stay Texan.
7. Casino parody name: **WinBig World Casino**, exterior + lot only (no
   interiors anywhere, no gambling verb; the plates are the joke).
8. Parish/county names in the band come from one Census clip in W1; they
   toast once, never count, and read "X Parish/County, {State}".
9. **The Carlsbad doorstep** (Bruno 2026-07-14, amended from "seam"):
   the caverns' surface measures 12.1 mi — inside the band, so the
   data-driven rule renders Whites City and 6b adds the park road +
   entrance sign. ZERO cave content; the underground belongs to the
   coming caves track, which plugs into a real doorstep with a locked
   door.
10. Terrain in the band uses the real DEM (real geography, same as
    Texas); no Texas county lines, no ag paint, no chapels/farmsteads/
    brands — those generators stay gated on `inTexas`.
11. Amendment price (D4, accepted): +1 session flat (7 waves / 8
    sessions) + W1 grown ~⅓. Width moves bytes only, never sessions.

## Risk & rollback

The tracked risk is silhouette dissolution ("the detailed part of a
map"). The amendment raises the stakes — the band now has real gravity
(Shreveport, Las Cruces) — and the guards are the Laws: gold vs silver,
Passport-not-logbook, day-trip rule, ink-line map, hand-authored love
stays home. If playtest after W6 says the shoulder competes instead of
framing, the rollback is presence-side, not geometry-side: dim the
silver (fewer stars, smaller pops rendered), never redraw the boundary.
The Gulf's version (bigger blue rectangle) is answered by W3+W4 shipping
before W5 — the beach and the ferry are verbs; if either lands weakly,
W5 is the wave to trim, never W3/W4.
