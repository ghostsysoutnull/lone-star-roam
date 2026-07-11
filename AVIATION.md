# Aviation roadmap — Texas by air

**Priority track as of 2026-07-11**: these waves run ahead of the remaining
ROADMAP.md candidates (including Haunted Texas wave 2 and gamepad) until
shipped or descoped. ROADMAP.md stays the historical record — fold each wave
into it as it ships. This doc is the working plan; per-wave gotchas graduate
to CLAUDE.md/MODULES.md at ship time.

## Why aviation

FLY is the least-served mode: traversal plus flares — no destinations, no
voices, no company. Texas is plane country: DFW is one of the busiest fields
on Earth, the Love–Hobby shuttle shaped an entire airline, half the Air Force
learns to fly here, and NASA's T-38s live at Ellington. Airports, air
traffic, and a live tower frequency give FLY what roads gave DRIVE: places
to go, traffic to share the world with, and a reason to look out the window.

## Design stance — realism, balanced

Real, like everything else in the game:
- Real airports at real lat/lon with **real runway orientations** — author
  headings from OSM `aeroway=runway` geometry (Overpass **GET**, per
  CLAUDE.md), never from runway numbers (numbers are magnetic; the world is
  true-north). One-time authoring, hardcoded like the city list.
- Real route pairs (Love–Hobby shuttle, DFW spokes, Panhandle feeders) and
  real phraseology ("Lone Star 1, wind 340 at 8, runway 35, cleared to land").
- **Radio chatter is diegetic and true**: every clearance you hear corresponds
  to an AI aircraft actually doing that thing on the field in front of you,
  and ATIS reads live `ATMOS` + `sky.forecast`. No canned flavor loops.

Balanced, like everything else in the game:
- Mini-world scale-up: an airliner is ~6 units long for the same reason the
  truck is 4. Tier-1 fields render 2 runways, not DFW's real 7.
- **The sky stays big and lonely.** Hard cap on airborne AI near the player
  (≤4 fixed-wing + ≤2 rotorcraft); ops thin at night to rare blinking
  red-eyes (the night sky — stars, bats, UFOs, haunts — keeps top billing);
  storms/dust ground-stop departures.
- Never hostile, never blocking: no collisions, no damage, no player physics
  changes. Landing detection is pure observation of the existing FLY state.
- No voice assets, no TTS: radio voice is synthesized squelch-and-gibberish
  in the all-WebAudio tradition; a HUD subtitle carries the actual words.
- Generic liveries. Route pairs are real; brands are not.

## What already exists (leverage, don't rebuild)

- The player already flies a **prop plane** (vehicle.js `mkWings`: nav
  lights, strobe, landing light, contrail, flares; audio.js prop AM stage).
- Mover idioms: maritime hand-laid lane + arc-length follow; trains
  never-despawn-in-sight; traffic instanced types + TTL recycle beyond 180;
  UFO rare-roll state machine with hotspot boost and `ATMOS` night gate.
- Per-day seeded rolls (`seededRand('wisp:key:day')`) for deterministic
  schedules; `LL()` inline projection per module (maritime/ufo precedent).
- Weather radio (shop.js) as the "buy a receiver, hear the invisible" model.
- sky.js owns all lights — beacons/strobes are emissive meshes, never lamps.

## Waves

Each wave is one session-sized, independently shippable, and ends with new
checks in a `tools/checks/aviation.mjs` suite (plus MODULES.md/ROADMAP.md
updates). Ship order matters: fields before traffic before radio.

### Wave 1 — Fields (static airports)

- `src/airports.js`: curated `AIRPORTS` table (~20 sites, hardcoded `LL()`),
  three tiers:
  - **Tier 1 hubs** (7): DFW, Dallas Love, Houston IAH, Houston Hobby,
    Austin, San Antonio, El Paso — 2 runways (27–41 units), terminal, tower,
    apron, hangars.
  - **Tier 2 regional** (~9): Lubbock, Amarillo, Midland, Corpus Christi,
    Harlingen, Laredo, Abilene, Waco, Tyler — 1 runway (18–30), small
    terminal, beacon.
  - **Tier 3 strips** (~4): ranch/ag strips + Terlingua's real dirt strip +
    Marfa (gliders later) — 8–12 unit strip, hangar, windsock.
- Table fields: `{ id, name, city, at: LL(), tier, rw: [{hdgTrue, len, w,
  off}], fact }`. Verify headings against OSM during authoring.
- Rendering: merge all-airport static geometry into a handful of global
  meshes by material (buildRibbons idiom — 20 unmerged prop-groups like
  ports would be ~800 draw calls; don't). Per-site dynamic bits stay cheap:
  rotating beacon (emissive, night-gated via `ATMOS.night`), windsock
  swinging with `ATMOS.wind`.
- Ground: one flat pad per site at max `hAt` over the footprint + skirt
  edges; runway/markings float a road-ribbon offset above the pad
  (z-fighting rule: big planes stay several units apart vertically).
- Export pure `airportClear(x, z)` (chapelAt lesson: data/query without
  meshes) and use it to **exclude airport footprints** from: cities.js
  building + fake-grid placement (Love Field sits inside Dallas' disc),
  ScenerySystem chunk props, chapelAt eligibility.
- HUD: ✈ glyphs on the one-time offscreen map layer (`renderMapLayer`).
- Verify: pad-vs-`hAt` bounds at all sites; determinism (same table, same
  world); building-exclusion (spawn Dallas, assert no instance matrix inside
  Love's footprint); windsock tracks a forced `ATMOS.wind` change.

### Wave 2 — Departures (fixed-wing AI)

- `src/aviation.js` `AviationSystem`: seeded per-game-day schedule
  (`seededRand('avn:APT:day:slot')` — new seed stream, never touch existing
  ones). Slots vary by tier; night keeps only sparse tier-1 red-eyes.
- Flight lifecycle: spawn at gate → taxi → hold → takeoff roll → climb →
  cruise leg toward a real destination airport → descend → land → taxi in →
  park, despawn only unwatched (trains idiom) or beyond 180 units (traffic
  idiom). Distant flights are just two waypoints + altitude profile — no
  pathfinding.
- Aircraft as InstancedMesh types (traffic idiom): airliner (~6 units,
  tier 1), regional/GA single (~3, tiers 2–3), later heli + blimp. Contrail
  puffs at cruise; nav strobes at night (emissive, no lights).
- Altitudes: pattern 8–12 AGL, regional hops 60–90, airliners ~100–120 —
  below the cloud deck (sky.js clouds ride y 130–200), below FLY's 300
  ceiling so the player can climb above traffic.
- Weather ops: `storm`/`dust` at the field = ground stop (no departures,
  arrivals divert into the fog and recycle); rain slows taxi. All read live
  `ATMOS`/weather, same as traffic.
- Runway-in-use: per-day seeded wind *direction* (direction isn't modeled in
  ATMOS — derive seeded per day, speed from `ATMOS.wind`); pick the runway
  end best aligned into wind. ATIS and AI ops share it.
- Verify: schedule determinism (two evals, same day → identical slots);
  **departure gains AGL over sim time** and arrival loses it (charging-deer
  lesson: assert measured motion, not state flags); never-despawn-in-sight;
  ground-stop under forced storm; one real-loop sentinel (`plane-moves` via
  actual rAF, like cars-move).

### Wave 3 — Tower radio (the flagship)

- audio.js `radio(text, opts)`: keyed squelch click → syllabic gibberish
  burst sized to text length (sawtooth ~120 Hz through a wobbling ~900 Hz
  bandpass, ~4 Hz syllable AM — the prop-AM/rattle idioms) → closing squelch.
  Constant volume while receivable (radios don't distance-fade); ducks under
  the engine. No TTS — it can't route through WebAudio and breaks the
  aesthetic.
- HUD subtitle line (rem-based, own element, ~5 s fade, one-line queue):
  `📻 Love Tower: Lone Star 1, wind 340 at 8, runway 31, cleared to land.`
- Receivable when: player is in FLY (you're in the plane — the ask) within
  ~250 units of a towered field, **or** anywhere/any mode with the shop's
  **aviation band radio** (~$500, weather-radio precedent → `perks.avionics`).
- Content, all event-driven off real sim state:
  - ATIS on entering tower range: wind (runway-in-use math), sky/weather
    from live `ATMOS`, forecast from `sky.forecast` (radio-perk synergy).
  - AI ops narrated as they happen: taxi, takeoff clearance, landing
    clearance, go-around on a blocked runway (player parked on it — traffic
    honk precedent, in phraseology: "traffic holding on the runway...").
  - Player flow: "radar contact" entering the ring; aligned within ±20° of
    the runway, descending, inside the approach cone → cleared to land;
    touchdown below AGL 3 at < 40 speed on the pad → "welcome to {city}" +
    **logbook stamp**.
  - UFO crossover: `ATMOS.ufo > 0` chops the radio gain (Levelland reaches
    the avionics) and fires the one spooky template ("unidentified traffic…
    say intentions").
- **Logbook = 10th collectible**: `save.airports` (additive key only), ✈️
  row in the score panel, new `stamp` chime, counts in `gameplay.counts()`.
  Landing-only on purpose — it's FLY's progression loop; drive-up visits get
  the sign and the chatter, not the stamp.
- Verify at natural values: approach flown at an ugly offset angle and a real
  parked-short distance; stamp appended exactly once; not receivable in
  DRIVE without the perk; receivable in FLY near the field; subtitle DOM
  text present; ATIS wind matches the seeded runway-in-use.

### Wave 4 — Rotors & airships

- Helicopters (instanced, ≤2 airborne near player), placed by context not
  statewide species tables:
  - **Medical**: helipad prop + parked/occasional-run at tier-1 metro
    hospitals (cities.js downtown edge).
  - **News**: slow downtown orbit over the big four at ~40 units, day only.
  - **Coast Guard**: patrols the maritime `LANE`, hovers near ships
    (orange/white; maritime crossover).
  - **Army**: pairs near Fort Cavazos/Killeen (region-box gate, animals.js
    idiom).
- Rotor audio: noise chopped at blade frequency (~12 Hz LFO — propMod
  idiom), distance-faded like `bell(d)`.
- **Exactly one blimp** (charm piece, not a fleet): fair-weather daytime
  wanderer on a seeded per-day route between AT&T Stadium, the Astrodome,
  and downtown Austin (all existing landmarks); ~10 units, ~4 u/s at ~35
  altitude; at night the side panel lights up with a scrolling LONE STAR
  sign (Reunion-ball night-glow precedent), then it moors at a tier-2 field.
- Verify: news-orbit radius over time, blimp determinism per day, rotor
  audio gain gated by distance, heli count cap.

### Wave 5 — Charter & military color (candidates, pick à la carte)

- **Charter jobs** (missions.js): ✈️ offers between airport pairs requiring a
  logged landing at both ends; separate offer type — the ground-haul ×1.5
  road bonus stays untouched; fast-travel lock reused. Gives the bankroll an
  air-side sink/source and the logbook a reason beyond completion.
- **Military flavor**: T-38 pattern circuits at Sheppard (touch-and-gos are
  great ambient), a parked B-1 at Dyess, NASA T-38 pair into Ellington,
  Randolph's "Taj Mahal" tower as a landmark-grade mesh. Rare fast low-level
  trainer pair over West Texas (UFO-roll idiom, daytime). No weapons, ever.
- **Marfa gliders**: silent soaring circles over the strip on clear
  afternoons (thermal country; pairs with the lights lore).
- **Crop duster**: dawn runs over Panhandle ag chunks from tier-3 strips
  (pumpjack/windmill regional-flavor precedent).
- A 13th bespoke NPC: a duster pilot at a tier-3 strip with weather-wise
  dialog (`getContext` already supplies weather).

## Cross-cutting rules (apply every wave)

- Expose each new system on `window.__game` at birth; add debug.js actions
  (`departure now`, `heli`, `blimp`, `test radio`) — panel stays URL-gated,
  actions always built.
- Save schema: **new keys only** (`airports`, gear id `avionics`); never
  touch rose RNG or existing seed strings.
- No new scene lights — sky.js owns light; everything glows via
  emissive/additive meshes.
- All ground contact samples `hAt`; all altitude logic uses AGL
  (`pos.y - hAt(...)`), never raw `pos.y`.
- Coordinate discipline: heading 0 = north (−z), `x -= sin(h)·spd`,
  `z -= cos(h)·spd` — runway headings authored true.
- Radio/ATIS text must derive from live sim state (`ATMOS`, `sky.forecast`,
  actual AI ops) so the harness can assert it and players can trust it.
- Keep one real-rAF sentinel for the AviationSystem in the verify suite.

## Non-goals

- Flight-model realism (FLY's arcade physics are untouched — a landing is
  detected, not simulated), crashes, damage, fuel.
- Player airliners or a second flyable aircraft (revisit only after wave 5).
- Real airline brands/logos; real-time schedules; voice acting or TTS.
- Full-fidelity fields (7-runway DFW, jet bridges, ground vehicles).
- Airspace enforcement — nothing ever scolds the player for flying anywhere.

## Decisions (settled 2026-07-11)

1. **Queue**: aviation preempts everything — all waves run before Haunted
   Texas wave 2 and gamepad (both stay next in line after this track).
2. **Logbook**: landing-only confirmed — the FLY-exclusive collectible.
3. **Military color**: in, as wave 5 (optional color after the core waves;
   no weapons, ever).
4. **Doc home**: this file at repo root; pointer lines in ROADMAP.md and
   CLAUDE.md; NEXT_SESSION.md's Task block tracks the current wave, and all
   queued non-aviation work lives in BACKLOG.md.
