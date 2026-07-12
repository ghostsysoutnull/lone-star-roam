# ROAD_SHIELDS_3D_SPEC.md

3D "chrome card" road shields — an arcade-style visual upgrade to the HUD
route markers shipped 2026-07-12. Shinier metallic face, a bit larger,
faked 3D depth via CSS perspective, a smooth steer-driven sway + idle
float, and a night amber-wireframe treatment.

Status: **spec** (no code yet). Supersedes the flat-canvas shields only in
appearance — the `parseShield` grammar and the "clean PREFIX ### only" rule
are unchanged.

## Goals

- **Shinier**: metallic gradient face, beveled/embossed edge, a baked
  specular streak that reads as chrome — replacing the current flat fills.
- **A bit larger**: ~30% bigger box, without colliding with the compass.
- **3D-modeled feel** without a second renderer: a CSS `perspective`
  container + a faked extruded thickness edge on the canvas, so the marker
  looks like a physical card with depth even head-on.
- **Motion**: a small left/right sway as the truck leans into turns, plus a
  slow idle float so it always feels alive. Arcade, but smooth (damped, no
  jitter).
- **Night treatment**: clean chrome by day; at night an **amber wireframe
  lattice** (tron-style glowing edge/diagonal lines) traces the face, with a
  soft amber bloom + gentle pulse.

## Non-goals

- No second WebGL renderer, no shield mesh in the Three.js scene. This is a
  DOM overlay per the HUD architecture; the "3D" is CSS perspective + a
  canvas-baked face, nothing more.
- No change to `parseShield` — messy municipal names ("Southwest Loop 410")
  and unnumbered refs (PGBT) still fall through to the plain text line.
- No new save keys, no gameplay effect. Purely presentational.
- No screenshots in verification (standing rule). The sway is asserted as a
  signed number, not a rendered image.

## Resolved calls (locked before any code)

These were decided in the spec session; do not re-litigate mid-build.

1. **Architecture — CSS-3D chrome card.** Keep the shield *face* on the
   existing `<canvas id="road-shield">`. Wrap it in a `#road-shield-wrap`
   with `perspective`. Drive `rotateY`/`rotateX` on the wrap per-frame. The
   canvas re-rasterizes only when its content changes; the motion is a pure
   CSS transform (compositor thread — cheap, smooth). Rejected: putting the
   shield in the 3D scene / a second renderer (fights the overlay
   architecture + merged-mesh perf patterns).

2. **Motion source — `player.tilt`, gained + damped.** `player.tilt` is the
   steering body-roll already computed in vehicle.js (DRIVE caps ±0.09, FLY
   ±0.5). Map `swayTarget = player.tilt * GAIN` (GAIN chosen so DRIVE's
   ±0.09 → a tasteful ~±13° lean), then **critically-damped lerp** toward
   target each frame (this is the "arcade but smooth"). Chosen motion set:
   **steer sway + a slow idle float** (a low-amplitude sine on `rotateX` +
   a tiny `translateY`, always on). No speed-bank.

3. **Night effect — amber wireframe overlay.** Not a neon edge-trace, not
   CRT scanlines. Thin **amber lines tracing the shield's shape edges +
   interior diagonals** (a lattice over the face), drawn on the canvas, with
   a CSS `drop-shadow` amber bloom + a subtle opacity pulse. Gated on
   `ATMOS.night` (imported from sky.js — cycle-safe, sky.js does not import
   hud).

4. **Verification philosophy — numbers, not pixels.** Expose the smoothed
   sway as `hud.shieldSway` (degrees) and `hud.shieldNight` (bool) on the
   live objects (already reachable via `__game.hud`). Assert the sway's
   *sign tracks a real steering input* (charging-deer discipline), night
   flips the amber state, the face raster is cached (not redrawn every
   tick), and the enlarged shield never overlaps the compass. No SHOT block.

## Per-frame vs per-tick (the smoothness split)

The HUD text updates at ~12 Hz (choppy for motion). The shield **motion**
must run at full rAF. Split the work:

- **`hud.drawShield(road)`** (existing, per HUD tick): re-rasterizes the
  canvas face **only when `ref` or night-state changes** (cache key
  `ref + '|' + nightState`; bump `hud._shieldRaster` on each real raster so
  the verify can prove caching). Draws chrome face by day, chrome + amber
  wireframe by night.
- **`hud.animateShield(player, dt)`** (new, per render frame in main.js,
  **ungated by `__skipRender`** so it ticks headless): damped sway + idle
  float → one `transform` on `#road-shield-wrap`; stores `hud.shieldSway`.

## Files touched

- `index.html` — `#road-shield-wrap` (perspective) around the canvas;
  enlarge canvas dims + rem box; `.night` bloom/pulse CSS. **rem for
  box/font, px only for radii/offsets** (hard rule); preserve `.centered`.
- `src/hud.js` — `import { ATMOS } from './sky.js'`; upgrade the three
  draw methods (gradient, bevel, specular, thickness edge); add the amber
  wireframe overlay; raster caching + `_shieldRaster`; new `animateShield`;
  expose `shieldSway` / `shieldNight`.
- `src/main.js` — call `hud.animateShield(player, dt)` each frame in the
  render loop, outside the render-skip guard.
- `tools/checks/hud.mjs` — the four checks below.
- Docs — `MODULES.md` hud line if the summary changes; `ROADMAP.md` entry
  + `NEXT_SESSION.md` at session end.

## Verification (add to `tools/checks/hud.mjs`, no SHOT)

1. **Sway tracks steering.** Park on the clean I-10 west stretch (≈ x −2767,
   z 334), `t.hold('KeyW')` + `t.hold('KeyA')`, step; assert
   `sign(hud.shieldSway) === sign(player.tilt)` and `|shieldSway|` is
   non-trivial. Steer the other way (`KeyD`) → sign flips. Assert at an ugly
   mid-drive heading, not on the tick grid.
2. **Night flips the wireframe.** Force night via the debug/time hook;
   assert `hud.shieldNight === true` and `.night` class present on the wrap;
   force day → `false`. Confirm a `_shieldRaster` bump happened across the
   day→night transition (the face genuinely re-drew).
3. **Raster is cached.** Same `ref` + same night-state across several HUD
   `update()` ticks → `hud._shieldRaster` does **not** climb (motion is CSS,
   not re-raster).
4. **No compass overlap at the larger size.** Extend the existing overlap
   check: the enlarged shield's box does not intersect the compass box (test
   at default and a high UI scale — perspective rotate + growth can drift).

## Sizing / tuning defaults (author's picks, tune in-build)

- Canvas `92×80` → ~`120×104`; rem box scaled to match.
- GAIN ≈ 150 (DRIVE ±0.09 tilt → ~±13° lean); damping rate ≈ `dt*8`.
- Idle float: ~±2° on `rotateX`, ~±1px `translateY`, period ~3–4 s.
- Amber wireframe: `#ffb020`-ish lines, ~1.2px, bloom via CSS drop-shadow,
  opacity pulse ~0.75↔1.0 over ~2 s.

## Wave split

Small enough for **one session** (recommended). Phases within it:

- **Phase A — chrome face**: gradient/bevel/specular/thickness upgrade to
  the three draw methods + enlarge + perspective wrap. Checks: existing
  shield checks still green at the new size + no-overlap.
- **Phase B — motion + night + verify**: `animateShield` + main.js hook +
  amber wireframe + the four new checks.

If Phase B overruns, split there: Phase A ships as wave 1 (static shinier
larger 3D-look shields), Phase B as wave 2 (motion + night). The briefing
block in `NEXT_SESSION.md` would then carry wave 2.

## Recommended setup

- **Model**: **Sonnet 5** — this is structural HUD/canvas plumbing +
  verify wiring, not content/register writing.
- **Effort**: **high** — canvas draw math, per-frame wiring, and the
  numbers-not-pixels verify all reward care.
- **Budget**: code + the four checks, **no screenshots**, grep-first,
  `MODULES.md`/`NEXT_SESSION.md` one-paragraph updates only.

## Gotchas carried forward

- Enlarge + rotate can push the shield into the compass — the
  "never overlaps" check is mandatory, at high UI scale too.
- `player.tilt` is tiny in DRIVE (±0.09) — without GAIN the sway is
  invisible. Verify the *sign*; tune the *magnitude*.
- Put `animateShield` outside main.js's render-skip guard, or it won't tick
  headless (and the sway check will read a frozen value).
- Keep `parseShield` and its "clean refs only" fall-through untouched — the
  three existing shield checks must stay green unchanged.
