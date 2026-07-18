# Vision — Sea-Industry Realism

Macro vision only; the spec session does the wave split. Umbrella:
`VISION_2026H2.md`. Second half of the **sea program**:
`VISION_WATER_VEHICLES.md` ships first; this track lands on top of the
boat. Build order across the four 2026-H2 visions: rails → water
vehicles → **sea-industry** → Mexico shoulder.

This is the track the backlog predicted: the AIS-based real ship routes item
("Later" section) carries the condition *"revisit only if maritime gets its
own track"* — condition now met; the heavy input pipeline becomes this
track's opening bake.

## Goal

A working Gulf: real named Texas ports, real ship traffic, transport ships,
sea patrol, and the Gulf fishing fleet.

**Design principle — the diorama is the point** (Bruno, 2026-07-18):
ambient, watchable realism is first-class value in this game, not filler
awaiting gameplay justification — the shipped identity is exactly this
(freight consists, lane ships, the bat emergence, haunts, the rig skyline).
A working Gulf you watch and roam earns its waves on its own. Water hauls
through the existing missions pipeline (port-to-port cargo, the
charter-jobs precedent) ship as a **complement** — ports become
destinations too — not as the track's justification.

## Player payoff

- Real ports as dressed, named sites: Houston (the #1 US port by tonnage),
  Corpus Christi, Galveston, Beaumont, Port Arthur, Texas City, Freeport,
  Brownsville — names on the HUD (announcer idiom).
- Ship traffic on real routes (AIS-derived) instead of the hand-laid lane:
  tankers, container ships, bulkers, each the right kind for its port.
- Sea patrol: Coast Guard cutters on the water, complementing the shipped
  CG helicopter that already patrols the lane and hovers near ships.
- Gulf fishing fleet: shrimpers working real grounds, back to port.
- Radio chatter where it makes sense — VHF channel-16 flavor; the aviation
  chatter and ERCOT radio are the shipped register precedents.

## Existing assets

- `maritime.js`: lane ships, port props, 227 real platforms, 8 real
  fairways with fairway-snapped port-approach legs, Far Rig.
- `rotors.js`: the CG heli patrol (joint patrol moments come free).
- `energy.js` announcer idiom; plaque law (maritime plaques are NOT
  landmarks — GOTCHAS).
- The hand-laid coastal `LANE` shipped under a scarcity exception (0 OSM
  separation lanes off Texas) — this track is the exception's planned
  retirement path.

## Data needs

- Routes: **default is AIS-informed hand lanes** — a small AIS sample read
  once to shape waypoints, not a full track-data pipeline. Likely ~80% of
  the visible value at ~20% of the cost. The full marinecadastre.gov bake
  is the *fallback*, adopted only if the spec's scout shows the cheap
  version reads wrong (ships off the shelf, implausible port approaches) —
  the scout must produce numbers, not vibes, before the heavy pipeline is
  approved.
- Port geometry/berths: OSM (Overpass GET, per the standing rule).

## Open calls (for the spec session)

- Scout verdict: AIS-informed lanes (default) vs the full bake (fallback,
  needs numbers).
- Water-haul shape: cargo types per port, pay/deadline knobs, FLY-lockout
  parity with truck hauls.
- Collectible surface: a Ports log vs folding into `save.energy` /
  `save.passport` (new keys only, by law).
- Fishing depth: ambient fleet only (lean) vs player fishing gameplay
  (likely its own later track if ever).
- Whether ship names announce per vessel (AIS carries names) or per
  route/port only.

## Rough size

3 waves. Depends on the boat track (program order); the route scout can
start as soon as the spec opens.
