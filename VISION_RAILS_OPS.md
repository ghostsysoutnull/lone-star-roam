# Vision — Rails Operations

Macro vision only; the spec session does the wave split. Successor to
`VISION_RAILROADS.md` (shipped as Railroads Realism, 2026-07-19). Source:
Bruno's 2026-07-19 playtest of the Rails tours. Where it slots in the
2026-H2 build order (`VISION_2026H2.md`) is an open call.

## Goal

Make every train a *journey*, not a fragment: full courses across the
network, per-train identity on the HUD (who it is, what it hauls, where
it's going), radio chatter, and no two trains rolling through each other.

## Playtest findings driving this (2026-07-19)

- **Short trips that suddenly stop**: a train runs one baked polyline and
  brakes dead at its end. Only the three named trains hop junctions
  (`hopAt`); random and tour-forced freight never hops. The end-of-line
  hold law then parks the consist at the buffer in plain sight — reads
  broken, not respectful.
- **No individual identity**: the only surfaces are the named-train 60-u
  toast and the 🚂 nearest-subdivision placard. No train states what it
  is, what it hauls, or where it's going; no radio traffic.
- **Trains pass through each other**: no occupancy model — two consists
  on one polyline in opposite directions interpenetrate on the shared
  centerline.

## Player payoff

- Follow any train as long as you care to: it rolls junction to junction
  across subdivisions on a real course instead of dying at a polyline end.
- Approach a train and the HUD identifies it: operator, train symbol,
  consist read ("22 cars, grain"), current trip ("Temple → Fort Worth,
  Fort Worth Sub") — announcer idiom, seeded per train.
- Radio chatter via `audio.radio`: defect detectors, dispatcher calls,
  meet instructions — ambient, distance-gated.
- Meets: on single track one train takes a siding and holds while the
  opposing train passes — watchable dispatching (diorama value).

## Existing assets

- `hopAt(rail, dir, minRun)` (trains.js) — junction continuation already
  works for named trains; journeys generalize it, they don't invent it.
- Baked polylines carry `operator` + subdivision `name` — trip vocabulary
  ("off the Laredo Sub onto the Glidden Sub") is free.
- `audio.radio(text, opts)` synth with per-voice pitch/rate; energy.js
  approach-announcer pattern; the `onNamed` toast surface.
- `seededRand` — per-train symbol/consist/cargo can be seeded and stable.
- `crossingTimes` seeded-schedule idiom, extendable to line timetables.

## Open calls (for the spec session)

- **Meet fidelity ladder**: (a) per-direction lateral offset — implied
  double track, cheap, fake for single-track Texas subs; (b) one train
  per polyline at spawn — honest, lowers density; (c) real meets with
  siding holds + chatter — dear, highest diorama value. Which rung, or
  (b) early with (c) as the marquee wave?
- Journey scope: every train journeys, or random freight stays local
  while a promoted scheduled set (one per operator) runs full courses?
- Sidings are likely absent from the bake (`usage=main` filter) — real
  meets may need a small re-bake or synthetic sidings at seeded spots.
- Chatter density and gating (weather-radio perk? proximity only?).
- Slot in the 2026-H2 build order (currently rails → water vehicles →
  sea-industry → Mexico shoulder).

## Rough size

3 waves (identity + chatter / journeys / meets). Fable-heavy: journeys
and meets are new-system architecture; identity is a visible surface.
