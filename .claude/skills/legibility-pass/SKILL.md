---
name: legibility-pass
description: Make a game event or prop readable (silhouette) and self-announcing (HUD), the Malaquite-turtle way. Use when a subject looks like blocks or happens silently. Pass the subject as args.
---

# Legibility pass

Make one event/prop legible on two axes, in the repo's established idiom.
Precedent: the Malaquite turtle release, commit `7e1c31f` (`src/turtles.js` +
`tools/checks/padre.mjs`) — diff it when in doubt.

Model note: the judgment lives in this file and in the audit step; the
execution steps are mechanical enough for Sonnet 5. Effort high either way.

## Procedure

1. **Audit the subject on two axes** (report findings before coding — ask
   before coding is the standing rule):
   - *Silhouette*: does the mesh read as the thing at natural viewing
     distance (parked-truck range, not boots-on-subject)?
   - *Announcement*: does the HUD say what's happening **every occurrence**?
     The `spotSpecies`/`spotLegend` critter-log toast fires once per save,
     ever — after the first log the event is silent. That silence is the
     usual bug. (`ufoSighting` toasts every time; that's the healthy pattern.)

2. **Grep first**: `GOTCHAS.md` + `MODULES.md` for the subject's module; read
   only the target neighborhood. Budget: no screenshots, grep-first, ≤2
   whole-file reads.

3. **Silhouette, in-idiom** (never change `seededRand` seed strings; never
   split an InstancedMesh into per-part meshes):
   - Instanced system → one merged vertex-colored `BufferGeometry`: build
     parts (`SphereGeometry`/`BoxGeometry`, chain `.scale/.rotateY/.translate`,
     rotate before translate), `toNonIndexed()`, stamp a per-part color
     attribute, concat position/normal/color into one geometry. Material:
     `MeshLambertMaterial({ vertexColors: true })`. Pattern: `mkHatchGeo()`
     in `src/turtles.js`.
   - Group-based system → box composition, facing −z. Pattern: `mkAnimal()`
     in `src/animals.js`.
   - Keep existing animation math; a modest ~1.5× size bump for readability
     is fine, world-position and seed changes are not.

4. **Announcement, in-idiom**:
   - Add `this.onEvent = null` on the system; wire
     `<system>.onEvent = (m) => hud.toast(m)` in `main.js` *after* `hud` is
     constructed (the `shoulder.onToast` idiom).
   - Fire once per occurrence (per game day / per spawn — track e.g.
     `toastDay`), gated on the player being within natural viewing radius
     (turtles use 150u), only while the event is actually active.
   - Toast text: emoji + place + what's happening, one line.

5. **Checks** — extend the subject's existing suite in `tools/checks/`
   (never a throwaway script), asserting at natural play values:
   - Geometry: `mesh.geometry.attributes.position.count > 100` and the
     `color` attribute + `material.vertexColors` exist (i.e. not a plain box).
   - Toast cadence: wrap `onEvent` (count + capture, call through, restore —
     don't unwire the HUD), assert exactly 1 firing per occurrence, correct
     text, no re-fire later in the same occurrence, nothing outside the
     active window. Drive state directly (`system.update(...)` with staged
     time/day); suites must stay hermetic.

6. **Close out**: targeted suite → full `node tools/verify.mjs` → `LEDGER.md`
   line → commit (push only on explicit go-ahead; pushes deploy to Pages).
   If the subject is schedule-gated and lacks a Tours spot that forces it,
   add one to `src/tours.js`.
