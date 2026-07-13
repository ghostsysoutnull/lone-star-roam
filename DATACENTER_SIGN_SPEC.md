# Datacenter Sign — spec (prototype)

Follow-on to the shipped `BRANDS_SPEC.md` track: Lone Star Compute (the
AI-datacenter parody in `brands.js`) has architecture, hum, and cold
cooling-vent glow, but nothing tells the player what it is. This adds an
identity sign plus a real-world-facts plaque, **prototyped at the San
Antonio site only** — full 8-site rollout is a separate decision after
this reads well in-game.

Deliberate deviation from BRANDS_SPEC's "no gameplay change" stance: this
adds one interaction (a plaque). Scoped narrowly — no save key, no
collectible, no progress hook, just a read-and-close popup like the
historical-marker plaques already in `gameplay.js`.

## Design

### Sign prop — always visible, no interaction needed
- New static mesh at the site entrance/fence facing the road, same
  canvas-texture idiom as Bucky's/H-E-Buddy name signs (`brands.js`
  `SIGN_ANCHOR`/`HEB_SIGN_ANCHOR` precedent — a mounted panel, texture
  baked once at construction).
- Copy: identity only, baked into the texture — "LONE STAR COMPUTE" /
  "SAN ANTONIO — AI-READY CAMPUS". Cold sci-fi treatment achieved in the
  texture itself (dark panel background, thin cyan border/accent line
  drawn into the same canvas) — no new shader.
- Emissive: **needs its own material**, not literally `ventMat` —
  `ventMat` is a solid-color Lambert with uniform `emissive` and no
  `map`, so it can't carry text and would glow the whole panel cyan,
  swamping any baked text (the same "emissive clamps signage toward
  white" trap Bucky's hit, which they escaped with PointLights — not an
  option here per "no second light rig"). Instead: a new
  `MeshLambertMaterial` using the sign canvas texture as **both** `map`
  and `emissiveMap` (dark panel diffuse, cyan glyphs/border baked into
  the same texture), `emissiveIntensity` night-gated on `ATMOS.night`
  exactly like the vents are — so only the text/border glows at night,
  which reads as *more* sci-fi than a uniformly-lit slab. Still no
  shader work, still the same night-gate idiom — the budget call holds,
  just not via the literal existing material instance.
- **Daytime legibility**: emissive is ~0 in daylight, so by day the sign
  is dark-panel + cyan text on diffuse alone. Confirm once in-game that
  the contrast still reads at driving distance — this is an always-
  visible sign, not a night-only effect.

**Implementation note (shipped)**: the sign's local anchor `(11, 3.3,
26.1)` is `hypot(11, 26.1) ≈ 28.3` units from the pad center — just
outside a naive `range=28` query centered on `site.at`. `lscNear` reads
the sign's actual **world** position instead (stashed as `signAt` on the
site's live record at spawn time, via the same heading+`SCALE` trig as
`spawn()`/`spawnHEB()`'s `toWorld`), not the hand-authored table. A
rollout to the other 7 sites must keep using `signAt`, not `site.at` —
the discriminating regression check ("resolves at the SIGN, not the pad
center") is in `tools/checks/brands.mjs` to catch a repeat.

### Plaque — "E to read", real facts played straight
- Mirrors `gameplay.js`'s landmark plaque exactly: `hud.dialog({name,
  sub, text})`, opened on E within range, closed on walk-away or
  re-press. Wired into `main.js`'s existing E-key chain (after
  `npcs.interact` / `springer.interact` / `gameplay.landmarkNear`, add a
  `brands.lscNear(player.pos, range)` check) and into the per-frame
  `interactHint`/close-on-walk-away block the same way `landmarkNear` is
  today.
- New helper in `brands.js`: `lscNear(pos, range = 28)`, same shape as
  `gameplay.landmarkNear` — returns the nearest LSC site within range or
  `null`.
- **Shared plaque state**: `main.js`'s `plaqueOpen` is a single name
  shared across sources, and the close-on-walk-away check currently only
  calls `gameplay.landmarkNear`. Both the E-key open branch *and* the
  per-frame close check must be extended to also check `brands.lscNear`
  — e.g. resolve "what's near" once per frame/keypress as
  `lmNear || lscNear`, and close whichever is open when neither is in
  range. Don't just add a parallel independent state var — a landmark
  plaque and an LSC plaque must not both be able to stay open at once,
  and walking from one straight to the other must close-then-open
  cleanly.
- Content (real, sourced — see Sources below):
  - `name`: `'🖥️ Lone Star Compute — San Antonio'`
  - `text`: *"Modeled on the real hyperscale campuses rising on San
    Antonio's west side — Stream's San Antonio III alone plans up to 200
    MW of AI-ready capacity across five buildings, fed by its own 334 MW
    substation. A single 100 MW facility can drink 3–6 million gallons
    of water a day at peak, as much as a small city, and training one
    large model has been estimated to use around 185,000 gallons of
    water for cooling alone."*
  - Fits `#dialog`'s existing `max-width: 56rem` comfortably (NPC dialog
    already runs comparable lengths).

## Sources (for the plaque copy)
- Stream Data Centers, San Antonio III groundbreaking — 135 acres, up to
  200 MW IT capacity across 5 buildings, on-site 334 MW substation, $400M
  investment. streamdatacenters.com/news/breaks-ground-hyperscale-campus-san-antonio/
- Water: a 100 MW hyperscale facility can consume 3–6 million gallons/day
  at peak (EESI; MOST Policy Initiative science note on data center
  water use).
- Training-run water estimate (~185,000 gal / 700,000 L for a GPT-4-scale
  model): UC Riverside 2024 study, widely cited (e.g. AMPAC Water
  Systems' 2026 summary).

## Verify plan
- Add to `tools/checks/brands.mjs` (existing LSC section):
  - Sign mesh exists at the San Antonio site and sits within the site's
    footprint (`LSC_FOOT` pattern).
  - `brands.lscNear(pos, range)` returns the San Antonio site within
    range and `null` outside it.
  - Night-gate: sign material has an `emissiveMap`, panel diffuse is
    dark, `emissiveIntensity` ~0 in daytime and > 0 at night (mirrors the
    existing vent-glow night-gate check). This asserts the *mechanism*,
    not "readable" — no `t.shot` as the pass/fail signal.
  - E-key plaque open/close, asserting `hud`'s dialog text matches
    expected content — a text/DOM assertion per CLAUDE.md's "assert
    numbers, not pixels" rule.
  - Shared-state regression: open the LSC plaque, walk to a landmark
    within its range, confirm the LSC plaque closed and the landmark
    plaque opened (and vice versa) — covers the `plaqueOpen`/`lscNear`
    wiring above.
- No new suite file — folds into the existing `brands` suite.
- Budget: code + checks, no shots, grep-first (per CLAUDE.md default).

## Open calls
1. **Full rollout timing** — after this prototype ships and reads well,
   decide whether all 8 sites get sign + plaque with per-site real facts
   researched the same way, or whether San Antonio stays the only one
   (e.g. if 8 near-identical plaques feel repetitive rather than
   informative). *Your call after playtesting the prototype.*
2. **Sign-only vs sign+plaque for the other 7 sites** — could ship the
   always-visible identity sign everywhere cheaply while reserving the
   researched-facts plaque for a subset. *Deferred to the rollout
   decision.*
