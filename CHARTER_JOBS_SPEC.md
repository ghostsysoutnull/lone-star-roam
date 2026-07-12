# Charter jobs — spec

**Shipped 2026-07-12** — see ROADMAP.md for the ship summary. This doc is
kept as the design record; implementation notes below mark where the code
diverged slightly from the original plan. Task tracking stays in
`NEXT_SESSION.md`.

## Player experience

A new job type in the existing Jobs tab, alongside the truck delivery
gigs: instead of hauling cargo by road, fly passengers or freight between
two airports.

1. Pick up a charter offer — e.g. "Fly a wildcat drilling crew from
   Midland to Dallas–Fort Worth." Pay and a time limit are shown up
   front, same as the truck jobs.
2. Fly to the origin airport and **land the plane** there — a real
   touchdown, not just showing up nearby. That starts the job and the
   clock.
3. Fly to the destination airport and land there too, before the
   deadline. That's the delivery.
4. Get paid — full price on time, half if late. No "stayed off the road"
   bonus like the truck jobs (flying the whole way is the point), but
   rush jobs still pay a premium for a tighter deadline, same pattern as
   ground jobs.

What makes it feel different from driving jobs:
- Charter jobs can start and end at *any* of the 20 airports — hubs,
  regional fields, and the small dirt ranch strips out west. The strips
  have never had a real reason to visit before; this is their moment.
- Landing counts as landing — flying low over the runway or hovering
  nearby doesn't trigger anything, and driving the truck onto the tarmac
  doesn't either. You have to actually put the plane down.
- Landing at one of the seven towered airports to complete a charter job
  also earns the pilot's logbook stamp you'd get anyway from visiting —
  charter work and logbook completion reinforce each other instead of
  being separate chores.
- Manifests are Texas-flavored and vary by airport size: big fields get
  oil execs, rodeo teams, storm-chase crews; the small strips get things
  like vet supplies or a ranch hand headed home.
- A few routes are drawn from real short-hop flights Texans actually
  take (e.g. the old Love Field–Hobby shuttle), mixed with procedural
  ones.
- While a charter job is active, the plane wears a distinct livery — see
  "Charter livery" below.

What stays the same: one job (truck or charter) active at a time, shared
bank balance and job-count tally, fast-travel still locks once cargo/
passengers are aboard.

## Mechanics

### Phase machine
Charter jobs live in the existing single job slot (`save.job`), extended
with `kind: 'charter'`. Same phase names as ground jobs, different
arrival test:

```
accept → 'pickup' (fly to origin, LAND) → 'haul' (fly to destination, LAND) → deliver
```

### Landing detection — the one genuinely new piece
Arrival = an actual touchdown, not proximity. Reuses the exact physical
test `radio.js` already uses for its own landing narration:
`onRunway(field, x, z, 1.5)` + AGL < touchdown threshold + speed below
touchdown threshold + `player.mode === 'FLY'`. It does **not** reuse
`save.airports` (the logbook), which stays towered-only per the wave-3
rule and would silently exclude the 9 unicom + 4 strip fields — exactly
the fields that are supposed to get their moment here.

Running the same physical test independently in `missions.js` means
charter works at all 20 fields, and *incidentally* still fires the radio
stamp at towered fields, since both checks are physically identical and
trigger at the same instant. No coupling between the two systems needed.

**Small shared refactor**: promote the touchdown thresholds (currently
local consts in `radio.js`) to exports of `airports.js`, next to
`onRunway` — that module already owns "what counts as being on the
pavement," and both `radio.js` and `missions.js` should import the same
definition of "landed" rather than each rolling their own.

### Data model
No new save keys. `save.job` gains `kind: 'charter'`, plus `fromId`/
`toId` (airport ids — city name alone doesn't disambiguate DFW vs Love
Field). `accept()`/`abandon()` need no changes; they already operate on
whatever offer shape they're handed.

Offer shape:
```js
{ kind: 'charter', icon, manifest: 'Wildcat drilling crew', fromId: 'MAF', toId: 'DFW',
  from: 'Midland Intl', to: 'Dallas–Fort Worth Intl', km, rush, pay, deadline }
```

### Offer generation
New `MANIFEST` table (mirrors `CARGO`'s structure): oil execs, rodeo
team, wildcatters, show cattle for the state fair, storm-chase
photographers, a band headed to a championship game, vet supplies /
ranch-hand swap for the strips, Marfa-Lights tourists. Optional `tier`
bias (vet supplies favors tier-3 strips, execs favor tier-1/2), same
mechanism as `CARGO`'s `from`-city bias.

Airport pool: all 20 fields, distance-banded like ground jobs (short/
medium/long/wildcard) but bands scaled up since airports are sparser
than cities. Small chance to roll one of 3–4 hand-curated real pairs
(Love↔Hobby, DFW↔Lubbock, DFW↔Amarillo) per AVIATION.md's "real route
pairs" design stance; rest procedural.

### Pay/deadline
No ×1.5 road-avoidance bonus (flying is mandatory). Payout = base pay,
halved if late, same ~25%-roll rush multiplier (tighter deadline, +40%
pay) as ground jobs. Deadline clock starts at pickup landing, same as
ground. Pace constant needs its own tuning vs. FLY's cruise/top speed,
targeting roughly the same slack ratio the ground formula already uses
against the motorway cap.

### UI (travel.js)
No structural change — the Jobs tab already renders offers by index and
locks fast-travel via `job.phase === 'haul'`, which is kind-agnostic
already. Only the button/card templates need a small branch for a
✈️-flavored line (airport names instead of city names, no road-bonus
copy).

## Charter livery

While a charter job is active (`'pickup'` or `'haul'` phase), the plane
wears a distinct paint scheme; reverts to the stock color on completion
or abandonment.

- `mkWings` (vehicle.js) already builds every airframe surface — wing,
  wingtips, struts, tail, fin — off one shared material object (not yet
  exposed the way the truck body's paint material is via
  `userData.bodyMat`). Exposing it the same way makes a livery swap a
  same-pattern extension of the existing `shop.js` truck-repaint idiom —
  no new geometry, no new physics.
- Single accent-color swap (e.g. a contrasting band along the fuselage
  line), not a logo/decal system — matches the flat-shaded low-poly
  aesthetic and avoids scope creep into texture work the engine doesn't
  do anywhere else.
- Automatic, not a shop purchase — it's the plane visibly "in charter
  service" for the duration of the job, a diegetic touch rather than
  another unlock. No progression hook intended here.

**As shipped**: every airframe surface shares *one* material (confirmed
during implementation, not just "not yet exposed" as assumed above) — so
"contrasting band" wasn't buildable without splitting materials, which
would have been scope creep for a flavor feature. Shipped as a single
flat color swap instead (`missions.js` `CHARTER_LIVERY`, `0xe8a33d`) —
still reads clearly as "a different plane" against the stock primer
color, just not two-tone. `mkWings`'s `userData` gained both `mat` and
`stockColor` (the latter read off the material at construction, so
missions.js never hardcodes the stock hex).

## Verify plan (`tools/checks/missions.mjs`)

### Test setup — `missions.force()` hook (decided 2026-07-12)
`genOffers()` is random, so checks can't reliably land on "a charter
offer from Armstrong Ranch to DFW" without a dedicated setup path.
Add `missions.force(fromId, toId, kind)` mirroring `military.js`'s
`force(kind)`/`despawnAll` idiom: always built (not URL-gated, same as
every other debug.js action), injects a charter job with the given
airport pair directly into `save.job`, exposed on `__game.missions` for
`verify.mjs` to drive. Also add it as a debug-menu action (free
manual-playtest button, consistent with the existing `departure now` /
`heli` / `blimp` buttons) — testability and a playtest convenience from
the same piece of code.

### Checks
- Accept a charter offer, `missions.force()` a job with a known
  origin/destination, teleport+FLY to the origin field's runway
  threshold at low AGL/speed → `pickup` fires, state updates correctly.
- Arrival does **not** fire from proximity alone (parked nearby but
  airborne, or on the ground off the runway centerline) — the
  natural-values verification lesson applies directly here.
- Arrival does **not** fire in DRIVE mode even if physically on the
  runway pavement (the "can't land a plane you aren't flying" gate).
- Full pickup→deliver cycle at a **tier-3 strip** specifically (forced
  via the hook, e.g. Armstrong Ranch → a tier-1 field), since that case
  must not depend on `save.airports`. Short-strip touchdown envelope
  gets checked by teleporting onto final approach and simulating just
  the touchdown, not a full autopilot flight down an 12-unit runway.
- Fast-travel lock still holds during `'haul'` (regression check, since
  travel.js is otherwise unchanged).
- Late-delivery half-pay path.
- Livery swap applies on `'pickup'`/`'haul'` and reverts on completion/
  abandonment.

## Open calls — resolved as shipped

1. **MANIFEST flavor list** — shipped with 11 entries (`src/missions.js`),
   3 tier-biased toward the strips, 2 toward the hubs.
2. **Curated real-route pairs** — shipped: 3 routes (`REAL_ROUTES`), 35%
   chance to appear in the wildcard band.
3. **`TD_AGL`/`TD_SPD` export refactor** — shipped as-is: promoted to
   `airports.js` exports next to `onRunway`; `radio.js` now imports them
   instead of defining its own copies.
4. **Charter livery** — shipped as the automatic swap-during-job approach
   (see "As shipped" note above), not a shop purchase.

`missions.force(fromId, toId)` shipped without the generic `kind` param
floated during design — only charter needs deterministic offer injection
(ground jobs already had `offers[0]`-based test coverage), so a
charter-only signature avoided a dead parameter.
