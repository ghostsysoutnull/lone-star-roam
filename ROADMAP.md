# Roadmap — Lone Star Roam

Status as of 2026-07-10. v1 is playable: real-geography Texas, drive/fly/walk,
132 city stars, 14 landmarks, 300 roses, 12 NPCs, persistent progress.

**Active priority track: `AVIATION.md`** — airports, AI air traffic, tower
radio, rotorcraft, in 5 waves. Runs ahead of every candidate below until
shipped or descoped (decided 2026-07-11); fold waves into this file as they
ship.

- [x] ~~Aviation wave 1 — Fields~~ — done 2026-07-11: 20 real airports
  (7 hubs / 9 regional / 4 strips incl. Terlingua's dirt strip and the 6666 +
  Armstrong ranch strips) with true runway headings/lengths/offsets authored
  from OSM `aeroway=runway` geometry. All static geometry in 8 global meshes
  (merged pads/skirts/runways/markings + one buildings InstancedMesh);
  terrain-topping pads with draped skirts; night-gated rotating beacons;
  windsocks on live `ATMOS.wind` + seeded per-day direction (`avnwind:` — the
  stream waves 2/3 must reuse for runway-in-use/ATIS). Pure `airportClear(x,z)`
  excludes footprints from city buildings/fake grids, scenery chunks, and
  chapel sites (Love Field sits clean inside Dallas). ✈ glyphs on the map
  layer. `tools/checks/aviation.mjs`: 11 checks incl. per-runway raycast and
  a real-rAF beacon sentinel.

- [x] ~~Aviation wave 2 — Departures~~ — done 2026-07-11: `src/aviation.js`
  `AviationSystem`. The schedule is a pure seeded function of the game day
  (`avn:` stream; 12/5/2 daytime slots by tier + 0–2 tier-1 night red-eyes),
  departures only — arrivals emerge from other fields' flights arriving, and
  the live system just *materializes* flights within 380 units of the player
  (≤4 airborne fixed-wing) as two InstancedMesh types (airliner ~6 u for
  tier-1 pairs, GA single ~3 u otherwise) over real weighted route pairs
  (Love–Hobby shuttle, DFW spokes, feeders, strip hops). Full lifecycle
  gate→taxi→hold→roll→climb→cruise→final→rollout→park; closed-form
  trajectories (quadratic roll, distance-based climb/cruise/descend profile,
  cruise capped under the y-130 cloud deck, terrain-scanned); materialized
  flights advance by dt so ground stops (storm/dust hold departures, arrivals
  go around + recycle) and rain-slow taxi accumulate as pure delay.
  Runway-in-use = `runwayInUse(a, day)` (airports.js, argmax into
  `windFrom`); parked flights retire only unwatched (trains idiom), airborne
  despawn beyond 900 (the schedule flies on parametrically). Night strobes
  are unlit vertex-color lamps; contrail puffs at jet cruise. Debug
  🛫/🛬 actions; 9 new checks (schedule purity/shape, into-wind argmax,
  measured roll acceleration + monotone climb, measured descent to an
  on-runway touchdown, ground stop + go-around, watched-park persistence,
  airborne cap, real-rAF plane-moves sentinel).

- [x] ~~Aviation wave 3 — Tower radio~~ — done 2026-07-11: `src/radio.js`
  `TowerRadio`, a standalone narration layer (not folded into
  `AviationSystem` — keeps aviation.js's `update(dt, px, pz, days)` signature
  and construction order intact, avoids an import cycle) that reads live
  `aviation.flights` phase edges, `airports.js` runway-in-use/wind, and the
  player, and turns them into transmissions. `audio.js` `radio(text, opts)`:
  sawtooth-through-wobbling-bandpass gibberish burst (~4 Hz syllable AM)
  between squelch clicks, sized to text length, no TTS; a new `radioDuck`
  gain node (separate from the per-frame `engineGain` automation) ducks the
  engine under a transmission; `opts.ufo` chops the gain with random dropouts
  (the Levelland effect reaching the avionics). HUD subtitle (`hud.subtitle`,
  rem-based, ~5 s fade, one-line queue). Receivable in FLY within 250 units
  of a towered (tier-1) field, or anywhere/any mode with the new shop item
  (`perks.avionics`, $500). ATIS fires on tuning in, reading `windFrom`/
  `runwayInUse` (never re-derived) + live `ATMOS`/`sky.forecast`; AI ops
  narrated off `flights[i].st.ph` phase edges (roll → cleared for takeoff,
  final → cleared to land, divert → go-around); player's own flow (FLY-only,
  independent of the perk) — radar contact → cleared to land (±20° aligned,
  descending, inside the approach cone) → touchdown (AGL < 3, speed < 40, on
  the pavement) → "welcome to {city}" + logbook stamp. A blocked-runway
  go-around is a physical check run every frame for all 7 towered fields
  regardless of radio reception (real safety behavior doesn't need a
  listener) and reuses wave 2's go-around machinery via a new
  `aviation.divert(m)` (factored out of the storm-diversion branch).
  Logbook = 10th collectible (`save.airports`, additive, dedup by field id,
  ✈️ row `/7`, new `stamp` chime). Debug `📻 Test radio` action. 9 new
  checks: reception gating (FLY/DRIVE/perk), a real-rAF wiring sentinel (only
  the main loop can tune a field in — every other check drives `radio.update`
  manually, so this is the one that would have caught a dropped wire), the
  UFO spooky template, ATIS content vs. seeded wind/runway + subtitle DOM
  text, an off-axis approach that stays at "contact" while misaligned and
  reaches "cleared"/a single stamp once corrected, the touchdown gate
  rejecting too-fast/too-high/off-pavement, landing-twice dedup, the physical
  go-around, and the real WebAudio synth path running error-free.

- [x] ~~Tower radio: UNICOM at tier-2 fields~~ — done 2026-07-11, same day
  as wave 3: a report that Waco and Laredo were silent surfaced that
  by-design tier-1-only reception reads as broken at a non-hub field.
  `src/radio.js` now has a second frequency: `UNICOM` (the 9 tier-2 fields),
  120-unit range (vs. 250 for a tower), `awos()` (automated weather, a real
  transmission) instead of `atis()` on tuning in, self-announce phrasing
  ("Waco traffic, Lone Star N, departing runway 14, Waco traffic") instead
  of controller clearances in AI ops narration, no player approach flow, no
  logbook stamp (stays towered-only, `/7`). `receivable()` now returns
  `{a, kind}`; the nearer field wins when both a tower and a UNICOM field
  would be in range. The blocked-runway go-around now runs over all 20
  fields (was 7) — a hazard regardless of tier. 3 new checks incl. one that
  reproduces the exact report: an unforced flyby of Waco, no debug button,
  no forced flight, must produce audio through the real loop.

- [x] ~~Aviation wave 4 — Rotors & airships~~ — done 2026-07-11: `src/rotors.js`
  `HeliSystem` + `BlimpSystem`. Helicopters are placed by real-world context,
  not a species table: medical (helipad near each big-four downtown edge,
  occasional out-and-back run), news (continuous slow orbit at 40u/55 altitude
  over Houston/San Antonio/Dallas/Austin — the real top-4 by population —
  day-gated), Coast Guard (patrols the maritime `LANE`, occasionally hovers
  near a ship), Army (a pair near Fort Cavazos/Killeen, occasional joint
  patrol). All four share one instanced body+rotor mesh pair (livery via the
  aviation pastel-wash tint trick) and a single global cap of 2 airborne
  (parked/grounded instances render but don't spend the budget — the aviation
  `AIR`-set idiom); the Army pair is gated as one two-instance unit (`weight:
  2`) so it can never coexist with anything else at the ceiling. Rotor audio:
  a new `audio.js` ambient channel (noise through a 130 Hz bandpass, chopped
  by a 12 Hz LFO) gain-faded by distance to the nearest airborne heli,
  exposed as a plain `heliTarget` field so tests don't have to read the
  ramping AudioParam. One blimp, a charm piece not a fleet: the literal
  AT&T Stadium/Astrodome/downtown-Austin triangle measures ~8900 units at the
  spec's ~4 u/s (a 37-minute lap vs. a 12-minute game day), so it instead
  rolls a `seededRand('blimp:…:day')` per-day anchor and loiters a small
  circle near it (`positionAt(day, u)` is a pure query, independent of live
  ATMOS — the determinism hook for tests), mooring at Waco Regional (roughly
  equidistant from all three) after dark or in storm/dust and flying back out
  once conditions clear. LONE STAR side panel scrolls via a canvas-texture
  emissive map gated on `ATMOS.night` (no new scene light). Continuous kinds
  (news/coastguard) get an `AIR_FAR`-style far despawn (aviation.js idiom) so
  a slot activated near the player doesn't stay spent forever once they drive
  away — the local hop kinds (medical/army) don't need it, but share the same
  guard. 6 new checks: news-orbit radius held over time, a freed cap slot
  after the player leaves, blimp day-determinism, rotor gain vs. distance
  (incl. silence with none in range), the airborne cap holding at 2 across
  all four kinds forced at once, and a real-rAF sentinel for both systems'
  `simT`. Debug 🚁/🎈 actions.

- [x] ~~Aviation wave 5 — Military color (partial)~~ — done 2026-07-12: two
  static landmarks (`gameplay.js` `LANDMARKS`/`mkLandmarkMesh`) — a parked
  B-1 gate guardian at Dyess AFB and Randolph AFB's "Taj Mahal" tower — built
  noticeably higher-poly than the rest of the landmark set (12–20-segment
  cylinders/spheres, twin tails/nacelles/landing gear on the B-1, a ribbed
  cupola dome on the tower) since both invite a close look. New
  `src/military.js` `MilitaryAirSystem` adds two rare fixed-wing flavor
  pairs on the rotors.js candidate idiom: a NASA T-38 pair that rolls in
  near Ellington Field and flies a straight inbound leg to a landing (not a
  loiter — it goes quiet once down), and a fast low-level trainer pair that
  only rolls over the Trans-Pecos (`x < -2200`, the same desert box
  `animals.js` uses) on clear days. Both share `aviation.js`'s `MAX_AIR`
  fixed-wing ceiling via a new `aviation.airborneCount()` (mirrors
  `heli.airborneCount()`) — the pair's own `PAIR_W=2` weight is checked
  against remaining headroom before either launches, so the sky-density
  design stance holds even with a third fixed-wing source in play. No
  weapons on anything. 4 new checks: cap-sharing at the MAX_AIR boundary,
  the NASA pair's distance-over-time closure + touchdown, the low-level
  pair's region+day gate (Math.random stubbed to force the roll, tested
  east/west and day/night), and a real-rAF `simT` sentinel folded into the
  existing rotors sentinel check. Debug ✈️ NASA/Low-level actions. Deferred:
  Sheppard T-38 touch-and-go pattern circuits (needs its own closed-pattern
  state machine, not a copy of an existing idiom — see `AVIATION.md`),
  Marfa gliders, crop dusters, the 13th NPC.

- [x] ~~Aviation wave 5 — Charter jobs~~ — done 2026-07-12: a second job type
  in `missions.js`'s existing single-slot job system (`kind: 'charter'`),
  offers between airport pairs instead of cities. Arrival is an actual
  touchdown — the exact physical test `radio.js` already uses for its own
  landing narration (`onRunway` + AGL/speed thresholds, now promoted to
  `airports.js` exports `TD_AGL`/`TD_SPD` so both systems share one
  definition of "landed") — gated on FLY mode, deliberately independent of
  the towered-only `save.airports` logbook so charter jobs work at all 20
  fields, including the 4 tier-3 strips (their first real reason to visit).
  Landing at a towered field for a charter still fires the logbook stamp for
  free, since both checks are physically identical. Offers: a new `MANIFEST`
  table (Texas-flavored, some tier-biased toward the strips or the hubs) plus
  3 hand-curated real routes (Love Field–Hobby shuttle, DFW–Lubbock,
  DFW–Amarillo) with a small chance to appear over a procedural pair. No
  ground-haul ×1.5 bonus (flying is mandatory); pays a higher per-km rate
  than road jobs, half on a late delivery. While a charter is active the
  plane wears a distinct livery — `vehicle.js`'s `mkWings` now exposes its
  shared airframe material (`userData.mat`/`stockColor`), swapped by
  `missions.js`'s `setLivery()` on accept/abandon/deliver, no new geometry.
  `missions.force(fromId, toId)` injects a specific-airport-pair charter
  directly (bypassing offer randomness) for deterministic testing — mirrors
  `military.js`'s `force()`/`despawnAll` idiom, doubles as a debug-menu
  button (✈️ Charter job). 7 new checks: real-landing-vs-proximity, the
  DRIVE-mode gate, a full cycle at the shortest tier-3 strip (Armstrong
  Ranch), livery apply/revert, the fast-travel lock (regression), late-pay
  math, and the debug action wired through the real loop. Full spec in
  `CHARTER_JOBS_SPEC.md`. Still open from wave 5: Sheppard T-38 touch-and-go
  pattern circuits, Marfa gliders, crop dusters, the 13th NPC.

- [x] ~~Helicopter detail pass~~ — done 2026-07-12: `src/rotors.js`'s
  `HeliSystem` split its one shared body + one shared rotor geometry (tint
  was the only per-kind signal) into four real bespoke bodies —
  `mkMedicalBody`/`mkNewsBody`/`mkCoastGuardBody`/`mkArmyBody` — each with
  1-2 signature tells (medical: tapered nose + red-cross panel + hoist arm;
  news: nose camera ball + simplified fin; coast guard: hemisphere nose +
  rescue hoist boom/basket + bigger cabin; army: stub-wing fuel tanks +
  portholes instead of a glass canopy + tail wheel), ~3× the old 132-tri
  baseline. Rotor blade count became a real per-kind mechanic:
  `mkHeliRotorBlade(radius)` is one hub-to-tip blade instanced `blades`
  times per aircraft (2 for medical/news/coastguard, 4 for army in a cross —
  the single biggest at-a-distance tell). `HeliSystem` now keeps four
  kind-scoped `{body, rotor}` InstancedMesh pairs (`this.meshes`, pool sized
  to each kind's real candidate count) instead of one shared pair truncated
  at `POOL=6` — fixes a latent bug where all four kinds simultaneously
  active (11 instances) would silently drop some. Cap/weight/force/
  despawnAll/airborneCount logic untouched (rendering-layer change only).
  4 new checks: per-kind triangle count > the old shared baseline, four
  distinct geometry objects, army rendering 8 rotor-blade instances (2
  aircraft × 4 blades) vs 2 for other kinds, plus one gated `SHOT` gut-check
  (all four kinds forced airborne one at a time) per `HELICOPTER_SPEC.md`'s
  sanctioned exception to the no-screenshots-by-default rule. Full spec in
  `HELICOPTER_SPEC.md`.

- [x] ~~Helicopter fuselage — lofted rebuild~~ — done 2026-07-12, same day
  follow-up: the four bodies' main cabins were still flat `BoxGeometry`
  slabs under the greebles from the detail pass above — read as an
  elongated cube regardless of tint/tells. Replaced with a genuinely
  different technique: `mkLoft()` chains 3 tapered-cylinder frustums along
  the fuselage's Z axis (nose→tail), each segment's radii matching its
  neighbor at the seam for a continuous taper — the same trick the tail
  boom already used, chained instead of single, `openEnded` on every
  segment so the two coincident end caps at each internal seam don't
  z-fight. `mkWedge()` replaces the flat glass box with a two-panel
  canted/splayed windscreen; `mkMastFairing()` gives the rotor hub a roof
  fairing instead of floating disconnected. Medical/news/coastguard get
  smooth 8–10-sided lofts with kind-specific bulge/taper profiles; army
  gets a deliberately 6-sided *faceted* loft with minimal taper (round vs.
  faceted is now itself a differentiator, protecting its "boxiest cabin"
  tell instead of smoothing it away) — coast guard's hemisphere nose folded
  into the loft's own blunt radius, one fewer bolted-on primitive. Real
  triangle counts roughly doubled again over the already-tripled detail
  pass (132 baseline → 284/308/284/368 for medical/news/coastguard/army).
  Root-caused and fixed the rotor mast height along the way: it was still
  a hand-tuned per-kind constant, and once a body's real bounding box
  changed the mast could bury itself in the fuselage — now `this.rotorY`
  is derived per kind from the actual body's bounding box + a margin at
  construction time, so a future reshape can't silently repeat that bug.
  Also: the 🚁 Heli debug action now cycles medical→news→coastguard→army
  deterministically (was a random pick) so playtesting can hit every kind
  on demand, with a check covering the cycle order.

- [x] ~~Aviation observability wave A, session 1 — identity foundations~~ —
  done 2026-07-12: the aviation layer works but was illegible (generic
  "Lone Star N" for everyone, no airport names on the HUD, no visible
  identity anywhere). **A1** `airports.js` exports `fieldNear(x,z)` (pure
  footprint query returning the field, not just a boolean — `airportClear`
  now delegates to it); `hud.js`'s location line shows `🛫 Dallas Love
  Field (DAL) — Dallas` inside a footprint instead of the city-distance
  line. **A2+A6** (built together — callsign assembly depends on airline):
  a new `AIRLINES` table in `aviation.js` (Heart of Texas Air/SWEETHEART,
  Texan Airways/TEXAN, Intercontinental Airways/INTERCON, Bravo Air/BRAVO,
  Lone Star — the game's one sanctioned real-brand wink) assigns jets a
  hub-weighted carrier (new `airline:${slot key}` stream, `HUB_BOOST=12`
  makes a carrier's own hub decisively — not just statistically —
  majority) with a matching tail tint (Bravo rolls a bright tint from a
  small seeded palette); GA gets a seeded FAA-shaped tail number (new
  `tail:${slot key}` stream, `/^N\d{2,3}[A-Z]{2}$/`) and no airline. Both
  live in a shared `identityFor()` called by `mkSlot` (seeded) *and*
  `force()` (Math.random) so every forced flight — what the whole verify
  suite actually exercises — carries the same real fields a scheduled one
  would. `radio.js narrateOps` speaks `m.sl.cs` at all five sites (tower
  takeoff/land/divert + both UNICOM self-announces) instead of a
  hardcoded "Lone Star". NASA's T-38 pair gets `cs: 'NASA 9-0-1'` as data
  only — voicing it on radio needs session 2's chatter-engine direct-range
  window, since Ellington isn't in the `AIRPORTS` table. **A5 (static
  half)**: tier-1/2 fields (16) get a gate sign board — one shared canvas
  atlas (name + code per cell) baked into one merged UV'd quad mesh (a 9th
  global mesh alongside the existing 8), standing at each field's `gate`,
  modestly emissive after dark via `material.emissiveIntensity` on the
  same `ATMOS.night` gate as the beacons; tier-3 ranch strips stay
  unsigned. Big-map airport codes draw next to the ✈ glyphs in `drawBig`
  at draw time (not baked into the shared minimap layer) from a plain
  `hud.airportLabels()` data method. 9 new checks across `aviation.mjs`/
  `hud.mjs`: HUD footprint-in/out, GA tail shape + determinism, exact
  hub-majority + tint-matches-airline + GA-carries-no-airline, forced-
  flight callsign structure, gate-sign count/position/tier exclusion,
  sign-mesh night-gating, map-label completeness. No SHOT blocks — all
  strings/positions/state, per the spec's verify plan. Full spec in
  `AVIATION_OBSERVABILITY_SPEC.md`. Session 2 (chatter engine, aircraft
  tags, medical pad stops) and session 3 (Wave B: airport NPCs + chatter
  enrichment) still queued.

- [x] ~~Aviation observability wave A, session 2 — chatter + visuals~~ —
  done 2026-07-12. **A3** new `chatter.js`: the player's radio is a
  *scanner* — tower keeps strict phraseology, casual talk is what you
  overhear on the other channels (medical↔dispatch, news↔station, coast
  guard crew, terse army two-ship, airline enroute with per-carrier
  registers, folksy GA, NASA into Ellington). Pure line-pool tables keyed
  kind×event; a template is eligible only when every `{token}` it uses is
  live in ctx — factual by construction; seeded picks (new `chatter:`
  stream) make same-day+event lines deterministic; humor rationed ~1-in-4.
  `radio.js` stays the sole transmitter: a new `scan()` enumerates airborne
  sources within a 60u direct-range window (line-of-sight VHF — how the
  coast guard gets heard with no field tuned) into `radio.sources`, ONE
  list consumed by both chatter and the A5 tags. Heli/military phase edges
  (`EDGE_EV`, knownPh idiom) + seeded mid-phase enroute rolls (`ROLL_OK`
  phases only), all behind a global budget: 25–45 s seeded min-gap, ops
  transmissions bump the hold (always preempt casual). Player-ref delight
  line: news chopper only, gated on genuinely speeding (>34) on a motorway
  in its window, armed only when it actually airs, then throttled ~1/hour.
  `lastTx` extended `{at, src, cs, route, phase, casual, voice, header}`;
  every subtitle now carries a `📻 CALLSIGN · route/city` header line
  (`hud.js` `#radio-header`), and `audio.radio` takes `opts.voice` {p,r}
  pitch/rate so dispatch/news/army are audibly distinct. **A4** medical
  pad stops: `airports.js` exports pure `padAt(id)` (apron spot beside the
  anchor, clear of runways, single-site `padYOf` shared with
  `airportLayout`); medical sorties roll a new `padstop:${city}:${day}:${sortie}`
  stream (odds 0.4) and when it hits fly transit→descend→touchdown→dwell
  20–40 s→lift→return to the home city's nearest tier-1 field (central
  Dallas medical lands at Love Field, not DFW) — all inside the sortie's
  existing cap slot; heli candidates now expose `ph` for the chatter
  edges, and `HeliSystem.update` takes an optional `days` 4th param.
  **A5 (live half)** aircraft proximity tags: `hud.updateTags(radio.sources,
  camera)` at the 12 Hz hudTick projects pooled DOM labels over airborne
  sources, fading with distance (`LIFEGUARD 3 · StarCare Flight`,
  `SWEETHEART 41 · DAL → HOU`, `N42TX`, `NASA 9-0-1`), rem-sized. 10 new
  aviation.mjs checks: chatterLine determinism/fill/context-gating, lift-
  edge structured tx + dedup + budget hold, two-source min-gap over 70 s,
  ops-preempts-casual, coast-guard direct-range untuned, player-ref
  speed gating both sides + throttle, pad-stop position-over-time (AGL +
  on-spot + dwell + climb-out) with cap held, padstop-stream determinism,
  heli tag DOM lifecycle through the real loop, forced-jet scanner
  identity. No SHOT blocks. Session 3 (Wave B) queued.

- [x] ~~Aviation observability wave B — people~~ — done 2026-07-12; the
  observability spec is fully shipped and folded in (spec file deleted).
  **B1** airport bystanders: tier-1/2 fields (16) get 2–3 townsfolk-build
  figures (new `gatefolk:<id>` stream) scattered a few units around the
  field's `gate`, spawn <500 / despawn >650 like townsfolk, hidden after
  dark on the same `night > 0.6` gate (open call 1 settled: v1 hides them,
  no night-shift variant). Three roles — spotter / waiting relative /
  off-duty pilot — with dialog assembled at interact time from live
  aviation state, factual by construction: the relative names a live
  inbound's origin city (`aviation.flights`, dest == field) or the next
  scheduled arrival today (`nextSlot` scan over `aviation.schedule(day)`),
  and says a quiet-board line when neither exists; the spotter names the
  active runway via `runwayInUse` + the next departure's callsign and
  destination; the pilot talks `windFrom(day)` wind + weather/forecast.
  Field `fact` is every role's 📌 closer. `rwyLabel` moved from radio.js
  into airports.js (exported beside `runwayInUse`) so ATIS and the spotter
  name runways from one source. `npcs.aviation` assigned by main.js
  (property pattern, like `radio.helis`); npcs.js imports airports.js only
  (no cycle — airports imports geo/sky). **B2** aviation-aware NPC context:
  `getContext` grows `heli` (nearest *airborne* kind + distance from
  `HeliSystem.candidates`, read directly — not via radio), `day`, `job`
  (active mission), and `fc` (forecast name, radio perk only). Townsfolk
  and the 12 named characters gain per-kind heli openers (news/medical/
  coastguard/army), gated `d < 150` and deterministic while the heli is
  up; named characters also gain shared context pulls — active-job line,
  forecast line, and an airports-progress milestone — slotted into the
  existing opener/progress assembly, voices untouched. 3 new aviation.mjs
  checks: gate spawn/roles/despawn + night hide; relative-names-origin +
  quiet-board-no-claim (clock pinned past the day's last inbound slot) +
  spotter-runway against an independent oracle, all interacted at natural
  parked distances; heli opener present for townsfolk *and* named while
  airborne nearby, gone after despawn. No SHOT blocks. À-la-carte aviation
  extras (Sheppard T-38 pattern, Marfa gliders, named GA/charter outfits —
  open call 5) need a fresh scope check before any further aviation work.

- [x] ~~NPC expansion (waves 1–2)~~ — done 2026-07-12 (wave 1 structural
  de339c1, wave 2 content same day). **Wave 1**: tier-3 bystanders at the
  two public fields (Marfa Municipal, Terlingua Ranch; the private ranch
  strips SSS/ARM stay empty per their own flavor text), night visibility
  gated by the nearby city's real population (>400k stays out after dark —
  threshold mirrored at cities.js:52 + twice in npcs.js), age/profession as
  real fields surfaced in the dialog subtitle. **Wave 2**: townsfolk get
  full names (76 first × 42 surnames), professions split into *disjoint*
  small-town (24) / big-city (20) pools picked by the same >400k flag,
  generic line pool 19→55, and ~18 professions carry 2–3 flavored lines
  mixed in at 45% (`PROFESSION_LINES`); bystander roles carry 4–5
  profession variants each with per-variant age bands (variant draws first,
  age inside its band — no 25-year-old retired captains), role smalltalk
  3→8; the 12 named characters grow to 7–8 rotating lines each, voices
  intact; context pools bumped (weather/night openers 2→4, heli +1 each,
  job 2→4, pilot-weather 1→3 per state, 3 forecast templates). Stream
  safety: first name is the single position-safe draw on the shared spawn
  stream; surname/profession/variant all ride the independent `age:`
  stream. New `POOLS` export is the verify surface. New
  `tools/checks/npcs.mjs` (6 checks): degenerate-pool guard via in-page
  module import, spawn-signature baseline pinned *pre-expansion*
  (positions/rotations/look colors byte-equal at El Paso/Waco/ACT),
  observed variety across 30 cities (distinct names/professions,
  pool-correct by city size), 40-chat flavored/generic mix, full
  named-line rotation, bystander variant bands. No SHOT blocks.

## Known limitations (v1)

- **Procedural downtowns outside the nine arterial metros** — Houston/DFW/SA/Austin
  plus El Paso, Corpus, Lubbock, Amarillo, and McAllen/RGV have real OSM arterials
  (fake grids removed there); all other cities keep seeded-procedural grids.
  Buildings everywhere are procedural. Full street-level precision statewide
  would be gigabytes of data.
- **Terrain resolution ~3 km/cell** — hills roll and ranges rise, but canyon
  walls (Palo Duro) read as steep slopes, not cliffs; a finer local grid or LOD
  would be needed for crisp canyons.
- **Only the biggest lakes** — Natural Earth 10m has just 6 reservoirs; mid-size
  lakes (Travis, Sam Rayburn, Livingston, Whitney) are missing. Rivers have no
  width variation along their course.
- **Static NPCs** — 12 stationary characters; no schedules, no movement.
- **No traffic** — highways are empty except the player.
- **No audio** — no engine, wind, or music.
- **Desktop keyboard only** — no touch controls, no gamepad.
- **Gulf is a rotated rectangle** — coastline reads OK from altitude but the water
  edge doesn't precisely follow the real coast.

## Planned / candidate features

### High value, moderate effort
- [x] ~~Ambient traffic~~ — done 2026-07-10: 70 pooled instanced vehicles on real
  highways, both directions, tier-weighted density/speed. Four vehicle types
  (sedan/pickup/SUV/semi) with tier-dependent mix — semis haunt the interstates.
  Polish pass later that day: density now follows local road supply (in-ring
  length x tier weight — deserts get a trickle, metros fill the pool), cars keep
  following distance, brake/honk/pull around a lane-blocking player (sqrt braking
  envelope; still no hard collision — deliberate), turn onto crossing roads at
  polyline ends instead of vanishing (U-turn at dead ends), far-away cars recycle
  on a TTL so the mix doesn't drift, night thins traffic toward ~50%-semi
  interstates, rain slows everyone 35% and lights lamps, and rural off-interstate
  traffic skews pickup.
- [x] ~~Rivers & lakes~~ — done 2026-07-10: 26 major named rivers (436 polylines) +
  6 big reservoirs (Amistad, Falcon, Texoma, Meredith, Red Bluff, Toledo Bend).
  Rio Grande/Red River render wide; border-river clipping uses a ~3.5 km dilation.
- [x] ~~Higher-resolution state border~~ — done 2026-07-10: Census 500k boundary,
  1,517 in-game points; Texoma-area land and river clipping fixed.
- [x] ~~Day/night cycle~~ — done 2026-07-10: 12-min days (hold T to fast-forward),
  keyframed sun/sky/fog palette, stars, city windows glow at night, headlights,
  Marfa Lights orbs only appear after dark. HUD clock + weather icon.
- [x] ~~Audio~~ — done 2026-07-10: all-synthesized WebAudio (no files): engine
  pitched to speed (car growl / prop drone), wind by speed+weather, rain patter,
  thunder synced to lightning with distance delay, per-category collect chimes,
  NPC blip, night crickets (silenced by rain). N mutes. Mix levels untuned by ear —
  gather feedback.
- [ ] **Gamepad support** — map Gamepad API axes/buttons alongside the keyboard.

- [x] ~~Freight & harbor~~ — done 2026-07-10: real OSM main-line rail network
  (512 polylines, 64 KB) as draped gravel+steel ribbons; freight trains
  (loco + 14–28 instanced cars, three car types) following the real geometry
  with a synthesized K5LA-style horn on close passes; container ports with
  cranes/stacks at 5 real port sites; cargo ships and tankers on a coastal
  lane, shrimp boats off Padre, 7 offshore oil platforms with flares.

- [x] ~~UFO events~~ — done 2026-07-10: rare deep-night sightings, 3× more likely
  near the real Texas cases (Levelland '57, Lubbock Lights '51, Stephenville '08,
  Marfa, Aurora 1897). Light formations + a hovering saucer with rim lights and
  ground beam that darts away when approached; engine sputter + headlight flicker
  nearby (the Levelland effect); theremin proximity tone; secret 👽 counter on
  the help screen; townsfolk rumor lines. Encounter rework 2026-07-11: the
  saucer now *stalks* the player in every mode (36-unit standoff, low over the
  road like the real Levelland reports, terrain-aware height), hovers 40–70 s,
  and the flicker actually fires at the standoff — plus it now reaches the
  walk lantern and the plane's nav lights/engine. Debug menu starts it
  in-hover instantly.

- [x] ~~UFO events~~ (see above) · ~~Landmark pass~~ — done 2026-07-10: 24 landmarks
  (added Prada Marfa, Paris TX Eiffel + hat, Dinosaur Valley, AT&T Stadium,
  Astrodome, Giant Boots), 10 meshes reworked, E-readable historical markers,
  rotating ferris wheel, night-lit Reunion ball / El Paso star / Prada windows.
- [x] ~~Compass~~ — done 2026-07-10: sliding tape top-center with cardinals,
  degree readout, nearest-city pip; C toggles, preference persisted.

### Larger bets
- [x] ~~Terrain elevation~~ — done 2026-07-10: real AWS Terrarium DEM baked to a
  420×400 grid (328 KB, city-pad flattening + outside-Texas mask baked in),
  2.5× vertical exaggeration at runtime; displaced vertex-colored terrain,
  draped roads/rivers/county lines, valley-height lakes, slope-pitched driving,
  fly soft clamp, everything samples hAt(). Verified against real elevations
  (El Paso 1130 m, Palo Duro floor 919 m vs rim).
- [x] ~~Real arterial roads in major metros~~ — done 2026-07-10: `primary` statewide
  + `secondary` in the four big metro bboxes; four road tiers with per-tier speed caps.
- [x] ~~Real arterials in mid-size cities~~ — done 2026-07-10: `secondary` fetched
  for El Paso, Corpus, Lubbock, Amarillo, McAllen/RGV bboxes (+ Edinburg/Pharr for
  free) via `tools/add-metro-streets.mjs`, which appends to `data/highways.json`
  without rebuilding the statewide tiers (rose indices untouched). +1,157 polylines,
  +75 KB. Mission stays procedural — its nearest OSM secondary is outside its whole
  building disc, so the fake grid is the better render there.
- [x] ~~Missions/delivery gameplay~~ — done 2026-07-10: 💼 Jobs tab in the travel
  menu offers 4 hauls between real cities (Texas-flavored cargo with themed
  origins — brisket from Llano, boots from El Paso; 25% are 🔥 rush jobs at
  +40% pay on a tighter clock). Drive to the origin to load (crates visible in
  the truck bed), beat a distance-scaled deadline to the destination. Staying
  out of the air all haul pays a ×1.5 road bonus; blowing the deadline halves
  the payout; fast travel is locked while cargo is aboard. Bankroll is pure
  score for now (HUD + help stats), saved under new keys (`bank`, `jobsDone`,
  `job`) — rose RNG untouched. Rain now slows the player 22% like it slows
  traffic. Guidance: target diamond on the compass tape + a floating 3D guide
  arrow over the player (G toggles, preference persisted); both turn red when
  late. Deadline/pay knobs live at the top of `genOffers()` in
  `src/missions.js`. Next: real highway routing for route lines +
  road-distance pay.
- [x] ~~Shop: truck upgrades + Lacy~~ — done 2026-07-11: 🛒 Shop tab in the
  travel menu spends the mission bankroll. Three 3-tier upgrade lines at
  $350/$900/$1800 — engine (+8/16/24% road top speed), ranch tires (offroad
  cap 20→32, rain drag 22%→8%), headlights (real-lamp intensity 30→80) —
  applied as `player.perks` (vehicle.js reads perks, never the save; balance
  knobs atop `src/shop.js`). Plus **Lacy the Blue Lacy** ($750, the state dog
  of Texas, `src/dog.js`): rides the truck bed facing backward, perches on the
  cargo crates mid-haul, hops out and heels to the cowboy in WALK, tail never
  stops, and yips a beat after the horn. Purchase levels in `save.gear`
  (new key only). 9-check `shop` verify suite measures the upgrades as
  driven speeds, not stat reads. Wave 2 (same day): **weather radio** ($400)
  — weather picks now hold as a 25–45 s `sky.forecast` before blending in
  (invisible without the radio); owners get a 📻 HUD countdown + a toast when
  the forecast breaks. And the **paint shop** ($250 a coat, repeatable):
  7 Texas-flavored truck colors as a swatch row in the Shop tab, worn coat
  in `save.gear.paint`, applied to the shared body material
  (`truck.userData.bodyMat`).
- [x] ~~Haunted Texas, wave 1~~ — done 2026-07-11: country chapels + fenced
  cemeteries seeded through ranch country (`chapelAt` in world.js — pure chunk
  function, ~6–10% of eligible chunks, always ≥5 units off the road and outside
  town footprints). At deep night, ~half of cemetery-nights (seeded per
  site+day) grow drifting **cemetery lights** that fade as you approach;
  **Enchanted Rock's ghost fires** (real Tonkawa legend) flicker on the dome;
  the nearest chapel **bell tolls at midnight** (new synth). Legends are the
  visible **9th collectible** (`save.legends`, 👻 HUD row, minor-key chime),
  witnessed via `haunts.js` → `gameplay.spotLegend`. Two new landmarks
  (Terlingua Ghost Town, Presidio La Bahía — 24 → 26) + three townsfolk rumor
  lines that hint at the haunts. Waves 2–3 planned (see BACKLOG.md):
  the storm-gated Ghost Stampede at Stampede Mesa, El Muerto, La Llorona,
  chupacabra, ghost tracks, town churches, the Blue Ghost.
- [x] ~~County system~~ — done 2026-07-10: all 254 real county boundaries (Census
  500k, 143 KB), county in the HUD location line, crossing toasts + chime with
  zigzag debounce, collect-all-254 counter, faint ground lines + map lines.
- [x] ~~Weather~~ — done 2026-07-10: region-weighted states (Gulf rain, Panhandle
  thunderstorms with lightning, West Texas dust storms) with ~9 s crossfades,
  drifting instanced cloud layer, rain streaks, windmills spin up with the wind.

- [x] ~~Wildlife & nature pass~~ — done 2026-07-10: 8 regional species (deer,
  longhorn, armadillo, jackrabbit, roadrunner, coyote, hog, vulture) with
  graze/wander/flee/circle behaviors + critter log (8th collectible category);
  flora variance (multi-blob live oaks, tiered pines, mesquite, yucca), rocks,
  hay bales, animated Permian Basin pumpjacks and plains windmills.
- [x] ~~Wildlife variety & polish~~ — done 2026-07-10 (same day, later): 15
  species — added javelina, pronghorn (Panhandle), wild turkey (Hill Country),
  alligator (east/coast, prefers riverbanks), rattlesnake (rare, west, rattles
  when you get close), brown pelican (coast), and the **Austin bat emergence**
  (`bats.js`): a 640-bat instanced ribbon pours from Congress Ave bridge every
  dusk (sky.t 0.775–0.845). Region tables now match world.js boxes (plains/Hill
  Country/coast get their own mixes). Behavior polish: **fixed a real bug where
  fleeing animals charged the player** (heading was inverted), herd startle
  ripples, jackrabbits zigzag, roadrunners sprint down highways (road tangent
  from `nearestRoad`), legs animate, coyotes are nocturnal + howl (synth),
  vultures/turkeys/pelicans are diurnal, deer rush at dusk. Player horn on
  Space in DRIVE scatters critters and startles townsfolk. Critter-log toasts
  now teach a fact per species. Counter 8 → 15 (additive save keys only).

- [x] ~~Travel menu~~ — done 2026-07-10: P-key overlay; landmarks/nature/Texas-icon
  sights always available with smart arrivals (drive on road vs. fly at altitude,
  Marfa auto-arrives at night); cities unlock as fast-travel after first visit.

- [x] ~~Real night sky~~ — done 2026-07-10: 1,627 catalog stars (d3-celestial,
  mag ≤ 5) with B-V colors, 46 constellation figures + 15 labels, celestial sphere
  rotating for 31° N (verified: Betelgeuse culminates due south at midnight at the
  theoretically exact 66.4°), sun disc, Lambert moon with automatic phases
  (8-game-day lunar month), and today's real planet positions via mean orbits.

### Polish backlog (small)
- [x] ~~Bluebonnet patches along Hill Country roads~~ — done with the nature pass
- [x] ~~More landmarks~~ — done 2026-07-10: Buc-ee's beaver, Stonehenge II,
  Beaumont fire hydrant, Paisano Pete (14 → 18)
- [x] ~~Minimap zoom control~~ — done: Z cycles 3 levels. Big map
  click-to-set-waypoint still open.
- [x] ~~Odometer + play stats~~ — done: live odometer under the speedo;
  distance/time/top-speed on the help screen, persisted with the save
- [x] ~~Night vehicle lights~~ — done 2026-07-10: truck beam cones (brighter in
  rain) + brake glow decal, plane landing light gated on height above ground,
  freight loco headlight beams. All follow ATMOS and inherit the UFO Levelland
  flicker via headlights.visible. The truck's decal ground pool read flat in
  play and was replaced 2026-07-10 by a real PointLight ahead of the nose
  (lantern precedent; DRIVE/WALK exclusive keeps it one dynamic light).
- [x] ~~Plane illumination flares~~ — done 2026-07-10: F in FLY fires from a
  recharging 3-flare rack; ballistic tracer arc, ignites at apex, sinks under a
  parachute drifting with the wind, real pooled PointLights (fixed count — no
  shader recompiles) sweep the terrain for ~14 s; burns out where it lands.
- [x] ~~UI text size setting~~ — done 2026-07-10: +/- steps all HUD/menu text
  ±10% (90%–200%), persisted (`lonestar-ui-scale`, separate from the save).
  One root font-size drives it: all UI CSS is rem-based (1rem = 10px at 100%),
  minimap/compass/dialog/travel panels sized in rem so they grow with their
  text. Compass tape crowds the top corners at 170%+ on 1080p — cap it if
  playtest says so.
- [ ] Mobile touch controls (virtual stick + buttons)

## Non-goals

- Multiplayer
- Realistic vehicle physics (arcade feel is intentional)
- Street-accurate rendering of every Texas town
- Interiors of any kind
