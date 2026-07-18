# Vision — Water Vehicles

Macro vision only; the spec session does the wave split. Umbrella:
`VISION_2026H2.md`. First half of the **sea program**: two specs, one
program — this track ships first, then `VISION_SEA_INDUSTRY.md` lands on
top of it. Build order across the four
2026-H2 visions: rails → **water vehicles** → sea-industry → Mexico shoulder.

## Goal

A 4th player mode — BOAT — on the Gulf, the big lakes, and the Intracoastal
Waterway, with light water dynamics.

## Player payoff

- Drive a boat: Gulf open water, big lakes, and an Intracoastal lane along
  the coast.
- Shipped offshore content becomes reachable at sea level and the right
  pace: the 227 platforms, Far Rig, the fairways, the treasure light, the
  shelf rig skyline — all currently fly-only.
- Light dynamics: wave bob, wake, chop driven by the existing `ATMOS.wind`.
  No buoyancy sim.
- Real names on the HUD via the `energy.js` approach-announcer idiom
  (platforms and fairways already carry real names).

## Scope exclusion

- **No river navigation** (Rio Grande included): river ribbons are ~1–3
  units wide against a 4-unit truck scale and are decals on terrain with no
  channel — a boat overhangs the river. Gulf + lakes + Intracoastal only.

## Existing assets

- `vehicle.js`: one class, physics-branch-per-mode architecture built
  exactly for a 4th branch — same pos/heading, new physics + avatar.
- `geo.js` zone classifier (coast/shelf/mexico), `beachAt`/`onIsland`,
  lake polygons.
- Ferries: `player.aboardFerry` is the shipped player-on-water precedent.
- One-gulf-plane law (GOTCHAS) — the boat reads the existing plane, never
  adds water surfaces.
- Backlog riders that likely fold in: water offsets/ambience/ripple item;
  the gulf-plane-beyond-DEM bug (fix before or within — open water with no
  seafloor is where a boat will actually go).

## Data needs

None new.

## Open calls (for the spec session)

- How the player gets the boat: shop purchase (dog idiom) vs free at marina
  sites vs mode-switch anywhere on water.
- Boarding/transition rules: dock sites, what happens driving the truck
  into water, where the truck waits.
- Which lakes qualify (all polygons vs a named big-lake list).
- Whether missions/jobs touch water this track (lean: no — sea-industry's
  business).

## Rough size

2–3 waves. No dependencies; derisks water physics for sea-industry.
