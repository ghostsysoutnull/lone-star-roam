# JETPACK_SPEC.md — the Lone Star jetpack

A shop-bought jetpack for WALK mode: GTA San Andreas-style unlimited hover.
Hold **Space** on foot to lift off, WASD to drift, release to settle back
down. Not a fourth mode — an *airborne sub-state of WALK*, gated on a
purchased perk. Two waves: physics/economy first (playtestable), feel second.

## Goals

- Give WALK its own vertical toy — climb a mesa, hover over Enchanted Rock,
  peek a downtown rooftop. Complements the plane (fast cruise + runways),
  never duplicates it (jetpack = slow, precise, low).
- Reuse what exists: FLY's `vy` integration pattern, the WALK avatar, the
  tiered-shop knob/`applyGear`/`perks` contract, the dog-style "hidden until
  owned" purchase. **No new mode, no new light rig, no new save top-level.**

## Resolved calls (decided in the spec session, 2026-07-13)

- **Unlimited hover** — thrust as long as Space is held, no fuel gauge. Zero
  HUD infrastructure; right register for a chill free-roam game.
- **3-tier thrust upgrade** — sold like engine/tires. Each level raises max
  altitude, ascent rate, and horizontal air speed. Level 0 = not owned (Space
  does nothing airborne); levels 1–3 = increasing thrust.
- **Control scheme is unambiguous**: `Space` is *free* in WALK today — the
  horn handler (`main.js:159`) gates on `mode === 'DRIVE'`, and `k['Space']`
  is only read in the FLY branch (`vehicle.js:158`). So hold-Space-to-thrust
  has no conflict. Descent is gravity (release Space); `Ctrl`/`Shift` give a
  faster controlled descent, mirroring FLY.
- **Two waves.** W1 = physics + shop + verify. W2 = VFX + audio + camera + dog.

## Architecture

### The airborne sub-state (`vehicle.js`, WALK branch + ground clamp)

- New instance flag `this.hovering` (default false). It is a sub-state of
  WALK only — you cannot blast off from DRIVE or FLY (get out of the truck
  first). `setMode` must clear it (`this.hovering = false`) on every switch.
- **Enter**: in the WALK branch, if `perks.jetpack` and `Space` is held while
  grounded → `hovering = true`.
- **While hovering** (reuse FLY's `vy` field):
  - `vy += (Space ? jetThrust : -GRAV) * dt` — thrust up, else gravity down.
  - `if (Ctrl||Shift) vy -= GRAV * dt` — optional faster descent.
  - `vy *= Math.pow(AIRDAMP, dt)` — air resistance → terminal velocity (same
    damping trick as FLY's `0.2`; jetpack uses a gentler value so it floats).
  - Integrate `pos.y`, clamp to `[ground, ground + jetAlt]`; a hit on the
    ceiling zeroes upward `vy` (soft bonk).
  - Horizontal: WASD steer as in WALK but `this.speed` clamps to `jetSpeed`
    (walk is 4.5; jetpack is precise, not fast).
- **Exit / land**: when the integrated `pos.y` reaches the ground *and* thrust
  is off (descending), snap `pos.y = ground`, `vy = 0`, `hovering = false`.
- **The ground clamp** at `vehicle.js:191`
  (`if (this.mode !== 'FLY') this.pos.y = ground`) must also skip when
  `this.hovering` — otherwise WALK re-pins you to the terrain every frame.
  New guard: `if (this.mode !== 'FLY' && !this.hovering)`.

### Shop + perks (`shop.js`)

- Knob arrays, **index 0 = not owned** (the perk boolean gates capability):
  - `JET_THRUST = [0, 55, 70, 85]` — ascent thrust.
  - `JET_ALT    = [0, 40, 55, 70]` — max AGL cap (units above ground).
  - `JET_SPEED  = [0,  9, 12, 15]` — horizontal air speed.
  - `GRAV` / `AIRDAMP` are **not tiered** — module constants in vehicle.js,
    tuned once in W1.
- `SHOP` entry `{ id: 'jetpack', icon: '🚀', name: 'Jetpack', prices: [900,
  1800, 3200], tiers: [...] }` — pricier than the truck lines; it's a flight
  capability worth earning toward (tunable in W1 playtest).
- `applyGear`: `jetpack: lvl('jetpack') > 0`, plus
  `jetThrust/jetAlt/jetSpeed` from the level. vehicle.js reads `perks`, never
  the save (the established contract).

### Untouched by design

- No `main.js` keybinding change — the physics loop reads `k['Space']`
  directly; the horn handler already ignores WALK.
- No HUD change in W1 (an optional AGL readout is a W2 call).
- Dog: W1 leaves Lacy's existing WALK-follow untouched. **Verified safe** —
  `dog.js:87` grounds her y every frame via `groundYAt ?? hAt`, independent of
  the player's y, so lifting off leaves her running on the ground below,
  tracking your x/z (no floating dog). Her liftoff reaction is a W2 decision.

## Wave split

### Wave 1 — Physics + shop + verify  *(Sonnet 5, high effort)*

Deliverable: the jetpack flies and is fully tested; no VFX/audio yet.

- `vehicle.js`: `hovering` sub-state, `vy` thrust/gravity/damp/alt-cap/land,
  `jetSpeed` horizontal clamp, ground-clamp guard, `setMode` reset. Module
  constants `GRAV`, `AIRDAMP`.
- `shop.js`: three knob arrays, `jetpack` SHOP entry, `applyGear` perks.
- Verify (`tools/checks/jetpack.mjs`, new suite — or extend `shop.mjs`):
  - **no perk**: holding Space in WALK never leaves the ground (AGL ≈ 0).
  - **liftoff**: with the perk, holding Space gains AGL over sim time.
  - **ceiling**: AGL caps at `jetAlt` (tier III ≈ 70), doesn't overshoot.
  - **descent + land**: release Space → AGL falls monotonically → returns to
    ground, `hovering` clears.
  - **tiers**: tier III climbs higher/faster than tier I (measured).
  - **horizontal**: airborne WASD reaches ~`jetSpeed`, not the 4.5 walk cap.
  - **real-loop sentinel**: Space held through the *real* rAF loop (`t.wait`,
    not just `simStep`) lifts the player off the ground — proves main.js
    wiring, not just the stepper.
  - Assert **AGL** (`pos.y - hAt`), never raw `pos.y`; pick a road-free,
    flat-ish bubble; no screenshots.
- Budget: **code + checks, no shots, grep-first.**
- Gotcha to carry: hermeticity — any check that leaves the player airborne or
  in a non-DRIVE mode must restore DRIVE at its end (the aviation-tune check
  already learned this; the horn/Lacy checks depend on DRIVE).

### Wave 2 — Feel: VFX + audio + camera + dog  *(Sonnet 5, high effort)*

Deliverable: the jetpack looks and sounds like one; the camera and Lacy
respond.

- Avatar: a jetpack backpack prop on the cowboy + two thruster flame cones,
  visible/flickering only while `Space` thrust is active (toggle off the
  instant thrust cuts).
- Audio (`audio.js`): a jet whoosh loop that starts on liftoff and stops on
  land/cut, plus a liftoff whomp. Route via an `onThrust`-style hook.
- Camera: raise/pull the WALK framing as AGL grows (lerp `up`/`back2` toward
  a higher vantage), so high hovers read.
- Dog (`dog.js`): decide Lacy's behavior — **recommended**: she stays
  grounded, waits below, yips at liftoff (reuse the `honked()` bark queue),
  rejoins the follow on landing.
- Optional: a small AGL readout on the HUD while hovering.
- Verify: VFX toggle sentinels (flame `visible` iff thrusting), audio
  start/stop, camera height rises with AGL, dog stays grounded + barks on
  liftoff. Numeric asserts; **one optional shot** for the flame look only if
  Bruno asks.
- Budget: code + checks, at most one flame-feel shot on request.

## Open calls for W2 (resolve at the top of the W2 session)

- Lacy's airborne behavior (recommended above — confirm).
- Whether a HUD AGL readout is worth the rem-based UI work.
- Camera feel: fixed higher framing vs. AGL-proportional lerp.

## Physics tuning notes (W1)

- Terminal ascent ≈ `jetThrust · dt · d / (1 − d)` where `d = AIRDAMP^dt`
  (dt = 0.05). With `AIRDAMP = 0.2`, `d ≈ 0.923`, so a thrust of 70 gives a
  terminal climb ≈ 42 u/s — start there and tune for feel.
- `GRAV` sets the fall rate. Note the model is a ternary (Space → thrust
  only; released → gravity only), so there is **no stable equilibrium** where
  thrust cancels gravity — holding always rises to the ceiling, releasing
  always falls. A held altitude comes from *feathering*: tapping Space
  produces a small rise/fall oscillation whose net holds a level (the SA
  feel). Don't implement a hover force looking for a balance point the
  formula can't produce. Too high `GRAV` = twitchy, too low = floaty. Start
  `GRAV ≈ 45`, tune in playtest.
- Cap `jetAlt` well under the plane's 300 so the two toys stay distinct.
