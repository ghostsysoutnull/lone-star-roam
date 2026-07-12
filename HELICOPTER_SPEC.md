# Helicopter detail pass — spec

Candidate spec for a follow-on polish pass to `src/rotors.js`'s
`HeliSystem` (shipped wave 4, 2026-07-11). Not yet implemented — present
this plan and get a go-ahead before coding, per CLAUDE.md session
workflow.

## Goal

Two asks: more detail on the helicopter meshes, and real shape-based
differentiation between the four kinds (medical / news / coast guard /
army) — today they're one shared low-poly body distinguished only by a
color tint.

## Current state (read from `src/rotors.js`)

All four kinds share exactly one geometry: `mkHeliBody()` — 8 flat
primitives (box fuselage, box canopy, 6-segment cylinder tail boom, box
fin, box tail rotor, 2 cylinder skid struts, 1 box skid bar) — plus one
shared rotor blade (`mkHeliRotor()`, a single spinning box that reads as
a blur disc). Rendered off two shared `InstancedMesh`es sized `POOL = 6`.
Differentiation is purely `TINT` (medical red / news blue / coast guard
orange / army olive). A pre-existing quirk: `render()` builds one merged
visibility list across all kinds and truncates it to 6 — if every
candidate were simultaneously active (4 medical + 4 news + 1 coast guard
+ 2 army = 11), some would silently not render. The per-kind split below
resolves this as a side effect, not a new goal in itself.

## Per-kind design

Each kind gets its own geometry — not full bespoke models, but the
current shared chassis plus 1–2 signature "tells" that read clearly even
at low poly, matching the flat-shaded aesthetic used everywhere else in
the game (landmarks, traffic, vehicle.js) rather than going smooth/
realistic. Reference: the B-1/Randolph landmark meshes (`gameplay.js`)
are the codebase's existing precedent for "bump the segment count and add
greebles for something that invites a closer look" — 12–20 segment
cylinders/spheres, still `flatShading: true`.

- **Medical** (ref: Airbus H135, Bell 407) — sleeker tapered nose (angled
  box or a low cone instead of the flat box), a red-cross panel (two
  thin overlapping boxes tinted red, mounted flat on the cabin side —
  matches the low-poly box idiom, no texture needed), optional short
  hoist arm. Rotor: keep the 2-blade blur-disc look, standard diameter.
- **News** — smallest/lightest of the four; the signature tell is a
  nose-mounted camera ball (a small 8-segment sphere on a thin mount
  under the nose) — no other kind has anything like it, reads instantly
  even in silhouette. Simplify the tail fin (news choppers are visually
  minimal). Rotor: 2-blade, slightly smaller diameter (lighter aircraft).
- **Coast Guard** (ref: MH-65 Dolphin) — larger cabin, a rescue hoist
  boom + basket on one side door (thin cylinder arm + small box
  "basket"), a bigger rounded nose (hemisphere instead of flat box),
  larger tinted glass side panel. Rotor: 2–3 blade, medium diameter.
- **Army / utility** (ref: UH-60 Black Hawk) — boxiest and largest
  cabin, external stub-wing fuel tanks (two short boxes on small wing
  stubs, one per side), small round portholes instead of a big glass
  canopy, visible tail wheel. Rotor: **4-blade cross** at a larger
  diameter — the single biggest at-a-distance differentiator, since real
  Black Hawks are recognizably 4-bladed and every other kind here reads
  as 2. Implemented as `mkHeliRotor(bladeCount, radius)` — a small
  parameterization, not a new mesh system.

## Architecture

Split the two shared `InstancedMesh`es (`this.body`/`this.rotor`,
`POOL = 6`) into four kind-scoped body+rotor pairs, each sized to that
kind's own natural candidate count (medical 4, news 4, coast guard 1,
army 2 — matching `mkCandidates()`'s existing per-kind counts, so no
capacity is invented). `render()`'s single merged visibility list becomes
four small per-kind lists, one per mesh pair. Everything else in
`HeliSystem` — the cap/weight logic in `update()`, `force()`,
`despawnAll()`, `airborneCount()`, `nearestAirborneDist()` — is
unaffected; this is a rendering-layer change only, no behavior change.

Rotor blade count becomes per-kind data (a `blades`/`rotorR` field
alongside the existing `tint` in each candidate/kind config), consumed by
`render()` when placing rotor instances in a cross pattern instead of the
current single spinning box.

## What doesn't change

- Cap/weight/materialize/despawn logic in `update()` — untouched.
- `TINT` stays (liveries still need a base color per kind; it now
  layers with shape instead of being the only signal).
- No new scene lights (sky.js still owns all lighting) — greebles are
  plain tinted geometry, not emissive.
- Debug hooks (`force(kind)`, `despawnAll()`) keep their existing
  signatures.

## Verify plan

Behavioral regressions (must still pass unchanged, since this is a
rendering-layer change):
- News-orbit radius over time, blimp untouched (out of scope but shares
  the file — confirm no accidental edits), rotor audio gain vs. distance,
  airborne cap holding at 2, the real-rAF `simT` sentinel.

New checks — this is one of the few genuinely visual changes in the
project, so it gets numbers where possible and screenshots where it
can't:
- **Poly count increased**: assert each kind's body geometry has more
  triangles than the current shared `mkHeliBody()` baseline (a real
  number, not a vibe).
- **Four distinct geometries**: assert the four kinds' body geometries
  are not the same object (today they all are).
- **Army rotor blade count**: assert 4 rotor instances render for an
  active army candidate vs. fewer for the other kinds (a countable,
  non-visual proxy for "the differentiation is real").
- **One `t.shot`** of all four kinds forced airborne together (via
  `force(kind)` ×4, capped/staged since only 2 can fly at once — force
  one, shot, despawn, repeat, or park the non-flying ones in frame) for
  a genuine visual gut-check that the silhouettes read as different.
  This is the exception to the "no SHOT by default" rule, since "do they
  look different" is exactly the kind of judgment CLAUDE.md reserves
  screenshots for.

## Open calls — resolved 2026-07-12

1. **Poly budget: ~3×** the current 8-primitive body (between the
   moderate 1.5–2× baseline and a full landmark-tier rebuild) — more
   segment headroom on cylinders/spheres (8–12) and a fuller greeble set
   per kind than the minimum "one tell," while still short of the
   B-1/Randolph showpiece bar (those are static and seen up close; these
   are instanced and moving).
2. **Rotor blade count is a real mechanic**: army gets a 4-blade cross at
   a larger diameter; the other three kinds keep the 2-blade blur-disc
   look at kind-appropriate diameters (news smallest, coast guard
   medium, medical standard). `mkHeliRotor(bladeCount, radius)`.
3. **Scope: all four kinds this session** — medical, news, coast guard,
   army all get their per-kind geometry + greebles in one pass.
4. **Coast Guard hoist basket** — static for v1 (zero extra code); a
   gentle sway on `this.t` is a cheap follow-up if it reads too stiff in
   the `t.shot` review.
