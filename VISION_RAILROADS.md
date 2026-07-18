# Vision — Railroads Realism

Macro vision only; the spec session does the wave split. Umbrella:
`VISION_2026H2.md`. Build order across the four 2026-H2 visions: **rails →
water vehicles → sea-industry → Mexico shoulder** (Mexico's data scout may
run early in parallel).

## Goal

Surface the real Texas rail network the game already ships: operator
identity (UP/BNSF/CPKC), subdivision names, and live cross-border rail
crossings at Laredo and Eagle Pass.

## Player payoff

- Freight consists wear their real operator's livery (UP armour yellow,
  BNSF orange) — you can tell whose track you're near.
- Subdivision name on the HUD when near track (announcer idiom): "BNSF
  Madill Subdivision".
- Rail presence on the HUD/maps — folds in the backlogged "shields for
  railways" playtest item.
- Live border crossings at Laredo (the #1 US rail gateway to Mexico;
  operator Tex-Mex/CPKC) and Eagle Pass: watch a train cross the river.
- A small set of *named* trains (scheduled crossing events, maybe one named
  intermodal) with a visibly distinct build.

## Existing assets

- `data/rails.json`: 560 real OSM polylines **already carrying `operator`
  and subdivision `name`** — `trains.js` never reads either field. Half the
  track is surfacing baked data.
- `trains.js`: arc-length consists, hold-at-end-while-watched law,
  never-despawn-in-sight law.
- `tools/build-rails.mjs`: the bake, rerunnable.
- Backlog riders: "shields for railways", "band railroads" (deferred from
  Band Parity), lights-suite `until(trains>0)` forcing hook.

## Decided calls (2026-07-18)

- **Convert, don't duplicate**: existing impromptu consists gain the livery
  their polyline's `operator` field names — one train system. The distinct
  design belongs only to the small named/scheduled set.

## Data needs

- Mostly in repo. Border-crossing spurs need rail geometry south of the
  river: small independent Overpass GET bake, or sequence after the Mexico
  scout.

## Open calls (for the spec session)

- HUD form for rail identity: announcer line vs shield-style glyph vs both.
- Crossing schedule: seeded per-day stream (`windFrom` idiom) vs pure
  probability.
- Does the "band railroads" backlog item fold in here or stay deferred?
- Livery palette approval (one staged shot).

## Rough size

2–3 waves. No hard dependencies.
