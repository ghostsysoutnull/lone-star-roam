# Aviation observability & NPC chatter — spec

Candidate spec, scope approved by Bruno 2026-07-12 (all four pieces +
medical-heli pad stops). Not yet implemented — present the wave plan and
get a go-ahead before coding, per CLAUDE.md session workflow. Ships as
two waves: **A** (HUD + radio + pad stops) and **B** (NPCs + chatter).

## Goal

The aviation layer works but is illegible: fixed-wing traffic flies real
airport-to-airport routes and the tower narrates it, yet every aircraft
is a generic "Lone Star N"; helis have four distinct jobs
(medical/news/coast guard/army) but no voice at all; airports have
official names, codes, and facts that surface only in the collectible
stamp; and no NPC anywhere acknowledges any of it. Make the existing
simulation *observable* — named places, distinct voices, people who talk
about what's actually overhead — rather than adding new traffic.

Explicit non-goal: helis do **not** start flying airport-to-airport.
Their scenario-based ops (hospital / downtown orbit / coastal patrol /
Killeen corridor) are more realistic than airport hops; the fix is
legibility, plus one flourish (medical pad stops, below).

## Wave A — observability core

### A1. Airport identity on the HUD (`hud.js`, `airports.js`)

- New pure query in airports.js: `fieldNear(x, z)` → the airport whose
  footprint contains the point, else null (same footprint math as
  `airportClear` — that function only answers "clear or not", it never
  says *which* field; keep both, one delegating to the other).
- hud.js 12 Hz location line: when `fieldNear` hits, show
  `🛫 Dallas Love Field (DAL) — Dallas` instead of the city-distance
  line. 20 fields, trivial loop at 12 Hz — no grid needed.

### A2. Per-type callsigns (`aviation.js`, `radio.js`, `military.js`)

- Schedule slots gain a `cs` callsign at `daySchedule` time: jets keep
  `Lone Star N` (existing flight number); GA slots get a seeded tail
  number (`N` + 2–3 digits + 2 letters) from a **new** seed stream
  `tail:${slot key}` — existing seed strings untouched, and the same
  day always yields the same tail.
- `radio.js` `narrateOps` speaks `m.sl.cs` instead of hardcoding
  "Lone Star" — one substitution, tower phraseology otherwise
  unchanged (the tower stays clipped and professional; casual talk
  lives in A3's chatter engine, on other "frequencies").
- Military gets voiced at the field it touches: NASA arrival into
  Ellington as `NASA 9-0-1`; the low-level pair is out in the
  Trans-Pecos far from any towered field and stays silent (realistic —
  they're not talking to anyone the player can hear).

### A3. Chatter engine — helis *and* planes (`chatter.js` new,
`radio.js`, `hud.js`, `audio.js`)

Design settled with Bruno 2026-07-12 (label format, cadence, player
refs, per-type voice — see settled calls at the bottom). The realism
frame: the player's radio is a *scanner*. Tower/UNICOM keeps strict
phraseology (A2); casual talk is what you overhear on the other
channels — medical↔hospital dispatch, news↔station producer, army
inter-flight, coast guard crew, airline enroute ride reports, folksy
GA on CTAF. That frame licenses varied/natural/fun without ever making
the tower unprofessional.

- **Engine**: new `chatter.js` — pure line-pool tables keyed by
  (source type × event) with placeholders filled from live context at
  transmit time: `{dest}`/`{origin}` from the real schedule slot,
  `{city}` from `nearestCity`, weather from `ATMOS`/`sky.forecast`,
  `{rwy}` from `runwayInUse`, time of day. Lines are **factual by
  construction** — a template only fires when its context is live.
  Seeded picks (new `chatter:` stream) for determinism. No scene deps;
  `radio.js` stays the sole transmitter and consumes it.
- **Kind-distinct callsigns**: medical `Lifeguard 3`, news `Chopper
  5`, coast guard `Rescue 6-0`, army `Hood 2-1, flight of two`
  (generic-but-flavored, not real operator brands — open call 2).
- **Voice registers per type**: Lifeguard↔dispatch (lifting, ETA to
  scene/pad, fuel; tasteful — never patient details); Chopper 5↔
  station (what's actually below: real interstate, city, incoming
  weather, "thirty seconds to the top of the hour"); Rescue 6-0
  (search legs, gulf weather, dry shrimp-boat banter); Hood flight
  (terse lead/wingman two-ship — "Two." — occasional deadpan);
  Lone Star jets (enroute position + destination, ride reports,
  handoffs); GA tails (folksiest — student pilots, full-stop calls,
  the café at the field). Humor rationed to ~1-in-4 lines.
- **Transmit triggers**: state edges (lift / on-station / return /
  touchdown / roll / final — `knownPh` dedup idiom) *plus* seeded
  mid-phase enroute rolls, all behind a **global chatter budget**:
  minimum gap ~25–45 s between lines (moderate cadence), priority
  ordering (tower ops and safety calls always preempt casual), and
  only the nearest 1–2 sources ever talk.
- **Player references, rare**: delight lines gated on *real* player
  behavior near the source — Chopper 5 mentioning "some pickup
  hauling down I-10" only when the player is actually speeding on a
  motorway within its view. Seeded + hard-throttled (at most ~one per
  session-hour), never hostile.
- **Reception**: existing `receivable` rules (tuned field or avionics
  perk) plus a ~60-unit direct-range window to any airborne source —
  line-of-sight VHF, and the only way the coast guard (nowhere near a
  towered field) ever gets heard.
- **HUD label** (`hud.js`): subtitle gains a header line above the
  quote — `📻 LONE STAR 23 · AUS → LBB` / `📻 LIFEGUARD 3 · Houston`
  (route arrow when a schedule slot applies, operating city for
  helis). Rem-based sizing per the UI-scale rule.
- **Audio** (`audio.js`): every line still runs the radio synth;
  `radio(text, opts)` gains per-type voice character (pitch/rate —
  dispatch calm, news quick, army clipped) so types are audibly
  distinct, not just textually.
- Same `tx`/`lastTx` structured shape, extended: `{kind, cs, route,
  phase, casual: bool, voice}` — checks stay string-light. `radio.js`
  keeps its standalone pattern; `aviation.update`'s signature is
  untouched — radio reads `helis` via a new optional param or setter,
  decided at implementation to match how it already receives
  `aviation`.

### A4. Medical pad stops (`rotors.js`, `airports.js`)

- `airportLayout` already computes pads; export a pure
  `padAt(airportId)` (position + surface y) for consumers.
- Medical candidates only: some sorties, rolled seeded-per-day+sortie
  (`padstop:${key}:${day}` — new stream), target the home city's
  airport pad instead of the hospital base: transit → descend →
  touchdown on the pad (AGL → 0) → dwell 20–40 s → lift → resume.
  All four heli cities (Dallas, Houston, Austin, San Antonio) are
  tier-1 fields, so every medical candidate has a pad.
- Cap/weight accounting unchanged — a pad stop happens *inside* a
  sortie that already holds its slot. Radio: the touchdown/lift edges
  feed A3 ("Lifeguard 3, on the pad at Love Field").

### A5. Visual identity (`hud.js`, `airports.js`) — added 2026-07-12

Radio covers the ears; these three cover the eyes, at each distance a
player meets the aviation layer: in the sky, on the ground, on the map.

- **Aircraft tags** (`hud.js`): a small screen-projected label over any
  airborne source within the same ~60-unit window the scanner hears,
  fading with distance, updated at the HUD's 12 Hz: helis
  `LIFEGUARD 3 · Medical`, jets `LONE STAR 23 · AUS → LBB`, GA tails
  `N42TX`, military `NASA 9-0-1`. Enumerates the *same* source list
  the chatter engine scans (aviation flights + helis + military) — one
  enumeration, two consumers. Rem-based sizing per the UI-scale rule.
  This **supersedes open call 3** ("GA tails radio-only") — no look-at
  picker needed, proximity does the job.
- **Airport gate signs** (`airports.js`): an entrance sign board at
  each tier-1/2 field's gate (16 fields) with name + code, real
  airport-monument style. Text via one shared canvas atlas (all signs
  in one texture, one draw call — a 9th global mesh alongside the
  existing 8). Modestly emissive after dark, night-gated on
  `ATMOS.night` exactly like the beacons (sky.js still owns all
  lights). Tier-3 ranch strips stay unsigned — a dirt strip with a
  monument sign would be wrong.
- **Map codes** (`hud.js`): airport codes next to the ✈ icons, drawn
  in `drawBig` at draw time (20 labels, map redraws are occasional) —
  *not* baked into the shared offscreen layer, so the minimap stays
  uncluttered.

### A6. Airlines & operators (`aviation.js`, `chatter.js`) — added
2026-07-12

The game's one sanctioned exception to "real places, no real brands":
fictional carriers *loosely homaging* the real Texas airlines (settled
call 6). Five-carrier roster in an `AIRLINES` table (name, callsign
word, hubs, tail tint, weight):

- **Heart of Texas Air** — callsign SWEETHEART, hubs DAL + HOU, warm
  red tail (→ Southwest: LUV, hearts, Love Field).
- **Texan Airways** — callsign TEXAN, hub DFW, silver/blue (→
  American).
- **Intercontinental Airways** — callsign INTERCON, hub IAH (→
  Continental/United; the airport already carries the name).
- **Bravo Air** — callsign BRAVO, rare (low weight), *varied* bright
  tail tints per aircraft (→ Braniff and its rainbow fleet).
- **Lone Star** — the state flag carrier, neutral livery; existing
  radio lines and checks survive unchanged, it just becomes one of
  five instead of all of them.

Mechanics:
- **Assignment** at `daySchedule` time, seeded (new `airline:` stream)
  and **hub-weighted**: a carrier's weight is boosted on slots
  touching its hub, so Sweetheart dominates Love Field and Texan
  dominates DFW — factual-by-construction mirroring of real Texas
  aviation. GA slots get no airline (tails only).
- **Callsigns** become `<CALLSIGN WORD> <n>` (`SWEETHEART 41`),
  flowing automatically into A2's tower phraseology, A3's chatter, and
  A5's tags — one assignment, every channel.
- **Livery**: per-airline tail tint on the jet `InstancedMesh` via the
  existing per-instance-tint-on-white-bodywork idiom (traffic.js
  precedent). Bravo rolls a seeded bright tint per aircraft.
- **Chatter personality**: one register note per carrier in the A3
  pools — Sweetheart folksy ("y'all have a good one"), Texan
  corporate-crisp, Intercon long-haul-tired, Bravo a little
  flamboyant ("the orange one"), Lone Star neutral.
- **Heli operators — names, not callsigns**: medical flies for
  **StarCare Flight** (→ CareFlite/STAR Flight), the news chopper
  belongs to station **KTX News 5** (so "Chopper 5" means something).
  Radio callsigns stay Lifeguard/Chopper — that's how it really works
  (operator brand ≠ radio callsign). Coast guard and army stay
  government, unbranded, correctly. Operator names surface in chatter
  lines, A5 tags (`LIFEGUARD 3 · StarCare Flight`), and Wave B NPC
  dialog.
- **Deferred**: named GA/charter outfits (Hill Country Charter etc.)
  in chatter and charter jobs — Bruno scoped to airlines + heli
  operators for now; see open calls.

## Wave B — people

### B1. Airport bystanders (`npcs.js`, `airports.js`)

- 2–3 figures at tier-1/2 field gates (airports.js already exports
  per-site `gate`), proximity-spawned within ~500 units like
  `spawnTownsfolk`, reusing the townsfolk body builds — no new meshes.
- Three roles with line pools: **spotter** (talks planes/runways),
  **waiting relative** (talks arrivals), **off-duty pilot** (talks
  weather/flying). Lines assembled at interact time from live context,
  same idiom as the named characters:
  - next real arrival/departure for *this* field (origin/destination
    city from `aviation.flights` / `daySchedule`) — "waiting on my
    sister, coming in from El Paso";
  - `runwayInUse(field, day)` — the spotter names the active runway;
  - the field's `fact` as the fallback/closer line.
- Night: hidden after dark like townsfolk (fields are dark except
  beacons; a night-shift variant is open call 1).

### B2. City heli lines + general chatter enrichment (`npcs.js`)

- Townsfolk and named characters gain aviation-aware openers gated on
  a *live* heli: `getContext` grows a `heli` field (nearest airborne
  kind + distance, queried from `HeliSystem.candidates`) — "that news
  chopper's been circling all morning" only when a news heli is
  actually airborne within ~150 units of the city.
- General enrichment, same mechanism: context lines for the current
  forecast (radio-perk flavor), the player's active delivery/charter
  job ("heard you're hauling for the Alamo City"), and total progress
  milestones. Assembled in `interact()`, not new per-character
  hand-written sets — the 12 named characters keep their existing
  voices and just gain shared context pulls.

## What doesn't change

- No existing `seededRand` seed strings; new streams only (`tail:`,
  `padstop:`, `chatter:`, `airline:`).
- `radio.js` standalone; `aviation.update` signature; sky.js owns all
  lights; heli cap/weight logic; save format (no new keys — airport
  stamps already exist).
- HUD map rendering — A1 touches only the location text line.
- No new NPC meshes — bystanders reuse townsfolk builds.

## Verify plan

No SHOT blocks — nothing here is a visual judgment; it's all strings,
positions, and state edges. Extend existing suites (aviation/radio/
heli/npcs), no new throwaway scripts. Test at natural values per the
standing rule (parked at the far end of a runway, not on the anchor;
mid-transit helis, not conveniently on-station).

- **A1**: teleport inside DAL's footprint but *off* the anchor (far
  runway end) → location line contains "Love Field (DAL)"; 5 units
  outside the footprint → city-distance line again.
- **A2**: force a departure → `lastTx` text contains the slot's `cs`;
  GA slot's tail matches `/^N\d{2,3}[A-Z]{2}$/`; same game-day rebuild
  yields the same tail (determinism).
- **A3**: `force('medical')` + step → structured `lastTx` with
  `kind:'heli'` and "Lifeguard"; a second step in the same phase emits
  no duplicate (edge dedup); coast guard heard via the direct-range
  window with no field tuned. Chatter engine: template fill is factual
  (a jet's enroute line contains its slot's *actual* destination
  city); determinism (same day + same event → same line); budget (two
  eligible sources, assert ≥ min-gap between their `tx` timestamps);
  priority (a tower ops call and a casual line eligible in the same
  window → ops wins); player-ref gating (the speeding line fires only
  above the speed threshold on a motorway near the news heli, never
  below it); per-type `voice` present on `lastTx`.
- **A4**: seeded day where the pad-stop rolls true → `t.step` the heli
  until AGL < `TD_AGL` *and* distance-to-pad < pad radius, held for
  the dwell, then AGL rising again — position-over-time, not a
  snapshot. Regression: airborne cap still holds at 2 with a stopped
  heli holding its slot.
- **A5**: force a heli, park inside the tag window → tag DOM node
  exists and its text carries the kind; teleport beyond the window →
  gone; a forced jet's tag contains its slot's real route. Signs:
  exactly one sign per tier-1/2 field (count = 16), each within a few
  units of its field's `gate`, none at tier-3. Map codes: assert the
  label list `drawBig` consumes (data, not pixels).
- **A6**: determinism (same day → same carrier per slot); hub
  weighting (over one seeded day's schedule, the majority of DAL
  slots are SWEETHEART and DFW slots TEXAN — the schedule is
  deterministic, so this is an exact assertion, not statistical);
  `lastTx`/tag carry the carrier callsign; per-airline instance tint
  applied (color numbers, not pixels); GA slots carry no airline.
- **B1**: force an arrival into a field, interact with the waiting
  bystander → dialog mentions the flight's origin city; empty sky →
  no aviation line; bystanders hidden at `ATMOS.night > 0.6`.
- **B2**: with a forced news heli airborne near the city, interact →
  heli line present; despawned → absent on next interact.
- Real-loop sentinels: existing per-system sentinels already cover
  player/traffic/flares/sky; A4's pad stop gets its edge asserted
  through `t.step` on the heli system, with the existing heli `simT`
  sentinel confirming main.js wiring.

## Settled calls — 2026-07-12 (chatter design, with Bruno)

1. **Label format**: callsign + route header line above the quoted
   text (`📻 LONE STAR 23 · AUS → LBB`), operating city for helis.
2. **Cadence**: moderate — a line every ~25–45 s when sources are
   nearby; tower ops always preempt.
3. **Player references**: yes, rarely — gated on real player
   behavior, seeded + hard-throttled, never hostile.
4. **Audio**: per-type synth voice character (pitch/rate), every line
   voiced.
5. **Visual identity — all three** (2026-07-12): aircraft proximity
   tags, tier-1/2 gate signs, big-map airport codes (A5). Supersedes
   open call 3.
6. **Airlines** (2026-07-12): loose-homage naming (recognizable winks
   at the real carriers, the game's sole real-brand exception), scope
   = airlines + heli operator names; GA/charter outfit names deferred
   (open call 5). Also settles open call 2 (callsign flavor) in the
   same spirit.

## Open calls

1. **Airport NPCs at night** — proposal: hidden like townsfolk (v1);
   a single night-shift character at tier-1 hubs is a cheap follow-up
   if the fields feel dead after dark.
2. ~~**Callsign flavor**~~ — settled by call 6: loose-homage carriers
   for jets; helis keep FAA-style callsigns (Lifeguard/Chopper) with
   operator *names* (StarCare Flight, KTX News 5) as flavor.
3. ~~**GA tails beyond the radio**~~ — superseded by settled call 5:
   proximity tags (A5) show tails visually, no look-at picker needed.
4. **Pad stops for other kinds** — proposal: medical only; news
   refueling stops are plausible but add nothing observably new once
   medical demonstrates the mechanic.
5. **Named GA/charter outfits** (deferred from A6) — Hill Country
   Charter / Big Bend Air style names in GA chatter, charter jobs,
   and NPC dialog; scoped out 2026-07-12, revisit after Wave B.
