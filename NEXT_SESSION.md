# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: the wave-5 gate decision only — no coding session
  yet. Wave 4.5 (crop visual upgrade: furrow striping, ~100% row
  coverage, rice levees/water sheen, hay windrows, denser orchards,
  pivot watered-wedge) shipped 2026-07-14. Drive up to one of the four
  ranch gate arches (King/Four Sixes/Waggoner/Y.O.) and decide: does
  the arch + boosted herds + wave-4.5 crop dressing already satisfy, or
  does optional wave 5 (ranch compounds — HQ house, barns, pens, water
  tower, per-ranch signature) still feel like a door to nothing?
- **If it dies**: fold the whole Agriculture track into one
  `ROADMAP.md` entry and delete this briefing block (greeting goes
  quiet until the next spec).
- **If it runs**: model **Fable 5**, effort **high** — content/prop-kit
  wave. Budget: code + checks, one `t.shot` (compound silhouette),
  grep-first. Full wave-5 design (per-ranch signature: King's Santa
  Gertrudis, Four Sixes' quarter-horse barns, Waggoner's in-ranch
  pumpjacks, Y.O.'s axis deer/blackbuck) is pre-designed in
  `AGRICULTURE_SPEC.md`'s "Optional wave 5" section.

Gotchas carried over from wave 4.5 (whoever does wave 5, or touches
crops/pivots again, must know):
- Field decals now carry an optional vertex-color `stripe` on
  `mkFieldPatch` (own `lambVC()` material, its own `matCache` slot,
  `'vc'` key) — furrow/windrow/levee bands computed from local `lz`
  (pre-rotation), no RNG involved. Don't add a second vertex-color
  material; extend `CROP_STYLE[...].stripe` or `defaultStripe()`
  instead.
- **Two separate seeded streams per ag chunk now**: `'crops'+key`
  (field/pivot **placement** — fx/fz/w/d/rot/rowRoll, exactly 6
  draws/field and 4/pivot, never touched by visual code) and
  `'crops2'+key` (all row-instance jitter/scale + hay-bale scatter —
  free to consume whatever it wants). Never let row/bale code read
  from `crand` again — that's what let visual branching perturb field
  positions before this wave.
- Row overlays (`mkCropRows`) always render now when `style.row` exists
  (no more 45%-chance gate); sizes are ×1.6 (`MUL` const), cap raised
  240→420, orchard (`tree`) jitter tightened for a planted-grid look.
- Pivot discs stay solid green; the new "freshly watered" wedge
  (`mkPivotWedge`) is a separate static mesh sharing the `deck`
  y-stagger — arm itself is **not** animated (in-wave scope call); if
  wave 5 or later wants the sweep, register it in
  `group.userData.animated` (pumpjack idiom).
- `tools/checks/ag.mjs` grew to 30 checks; the placement-frozen check
  hardcodes a known Hale chunk's first field centroid
  (x≈-2147.501, z≈-3607.705) — captured live before any wave-4.5 edit,
  confirmed byte-identical after. Don't hand-wave future placement
  changes past this check — recapture the real baseline the same way
  (git stash the old code, read the live centroid, hardcode it) if a
  future wave deliberately moves fields.
- The pre-existing "Cy NPC rain register" check raced under wave 4.5's
  heavier per-chunk geometry (denser crop instancing slowed frame
  throughput enough to expose a latent timing gap): it now does a real
  `t.wait(0.3)` after teleporting next to Cy, before the synchronous
  `npcNear()` snapshot, so the background NPC spawn/despawn hysteresis
  (Cy sits ~23 units from Kingsville) settles first. If any other check
  does an instant teleport + synchronous proximity/state read with no
  wait, treat it as latently racy too.

The Jetpack track (`JETPACK_SPEC.md`, 2 waves —
physics/shop, then feel) shipped 2026-07-13 and is folded into `ROADMAP.md`;
the spec file stays as history. The Texas Brands track (Bucky's, H-E-Buddy,
Lone Star Compute — 3 waves) shipped 2026-07-12 and is folded into
`ROADMAP.md`; `BRANDS_SPEC.md` stays as history. A follow-up player-controlled
brand-size feature (`[`/`]`, own `lonestar-brand-scale` localStorage key) also
shipped 2026-07-12 on top of it — see the `brands.js` gotcha below. A second
follow-on, the datacenter ID sign + real-facts plaque (all 8 Lone Star Compute
sites), shipped 2026-07-13 (`DATACENTER_SIGN_SPEC.md`) — see the new
`lscNear`/`plaqueOpen` gotcha below. Queued work lives in `BACKLOG.md`;
pending playtests are there too.

Gotchas for whoever touches the jetpack (`vehicle.js`/`shop.js`/`dog.js`/
`audio.js`) next:
- `hovering` is a WALK-only sub-state (`GRAV=45`, `AIRDAMP=0.25`, module
  constants in vehicle.js) — thrust XOR gravity each frame, no stable hover
  point by design. The ground-clamp guard is
  `if (this.mode !== 'FLY' && !this.hovering)`; don't drop the
  `!this.hovering` half or WALK re-pins to terrain every frame.
- `shop.js`: `jetpack` perk gates capability at level 0 (index 0 of
  `JET_THRUST`/`JET_ALT`/`JET_SPEED` = 0/unowned) — `applyGear` always
  writes `jetThrust`/`jetAlt`/`jetSpeed` regardless of ownership, only
  `jetpack: lvl>0` gates whether Space does anything airborne.
- The flame prop and jet-whoosh audio are both keyed off **active thrust**
  (`hovering && keys['Space']`), not merely `hovering` — falling/coasting is
  silent and dark by design, matching the spec's "cuts the instant thrust
  cuts." Don't loosen either gate to just `hovering`.
- `audio.jetTarget` is computed at the top of `update()`, before the
  `!ctx || muted` early return — same pattern as `heliTarget`/
  `datacenterTarget` — so it's always correct even pre-AudioContext-init;
  verify reads this field, never the ramping AudioParam.
- `player.onThrust` fires exactly once per liftoff (edge-triggered on the
  `!this.hovering` guard), not every frame it's held. A verify check that
  spies on it must restore the real callback afterward or later checks in
  the same suite lose the real `main.js` wiring.
- Any verify check that leaves the player airborne or in a non-DRIVE mode
  must restore DRIVE at its end — the horn/Lacy checks depend on ambient
  DRIVE mode; `jetpack.mjs` follows this throughout.

Gotchas for whoever touches `brands.js` next:
- Each spawned site's hero/props are split across TWO parents: the scalable
  `building` sub-group (holds staticMesh/signPanel/props, carries
  `.scale.setScalar(SCALE)`) and `group` itself (billboards only, at Bucky's).
  If you add a new prop, decide which one it belongs in — anything that
  should shrink/grow with the store goes in `building`; anything that must
  stay grounded on its OWN terrain sample independent of store size (like the
  approach billboards) stays a direct `group` child with its own `.scale`.
- The foundation skirt's authored depth is `Math.min(8, relief + 0.4) / SCALE`
  — cap the TRUE relief FIRST, THEN divide by SCALE, deliberately
  counter-scaled so its WORLD-space reach stays constant regardless of brand
  size (a shrunk building's shrunk skirt would otherwise float off sloped
  real terrain; El Paso's H-E-Buddy lot, ~1.8u relief, is the worst real case
  and is what the verify check exercises, now at the 0.1x floor). Dividing
  BEFORE capping (`Math.min(8, relief / SCALE)`) shipped once and undershot
  the needed depth at small scale — the cap must see the real relief, not the
  already-shrunk one. Range is 0.1–1.25 (Bruno 2026-07-12, widened from the
  original 0.5–1.25 same day).
- `footAt`'s footprint half-extents and `PAD_TOP` are also scaled by the same
  module-level `SCALE`, so the walkable pad always matches the rendered slab.
  `SCALE` is read live (not cached) — the footprint site caches
  (`buckyFootprints()` etc.) only cache the scale-INDEPENDENT geometry
  (`padY`/`heading`/`x`/`z`), never the scale factor itself.
- `brands.lscNear(pos, range)` triggers off each LSC site's **sign** world
  position (`signAt`, stashed on the live record at spawn from heading +
  `SCALE`), NOT `site.at` (the pad center) — the sign's local anchor is
  `hypot(11, 26.1) ≈ 28.3` units from center, just past a naive `range=28`
  query on the table. `main.js`'s `plaqueOpen` is shared with
  `gameplay.landmarkNear` behind one `plaqueNear()` lookup — don't add a
  second independent "which plaque is open" state var if a third plaque
  source shows up later; extend `plaqueNear` instead.

Gotchas for whoever touches `hud.js` next:
- The road shield is a CSS-3D chrome card: `this.shield` (constructor) is the
  `#road-shield-wrap` div (position/`.centered`/per-frame transform),
  `this.shieldCanvas` is the inner `<canvas id="road-shield">` (2D face
  raster). Don't conflate the two — `drawShield` draws on `shieldCanvas`,
  `animateShield` transforms `shield`.
- `drawShield`'s raster is cached on a `ref+night` key (`_shieldKey`, bumping
  `_shieldRaster` only on a real redraw) — don't add per-frame canvas work
  there; motion is a pure CSS transform via `animateShield`, called once per
  render frame from `main.js`, ungated by `__skipRender`.
- Road shields only parse clean "PREFIX ###" refs (`parseShield`) — messy
  municipal names like "Southwest Loop 410" intentionally fall through to the
  plain text line; don't try to make the regex swallow those.
- `#hud-speed`/`#hud-mode` offsets (index.html) are rem-based on purpose so
  their gap scales with UI-scale text growth — if either block grows taller,
  bump the other's `bottom` in rem too, and rerun the "never overlaps" hud
  check before shipping.

---

Background context for the session:

We're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture
+ commands + gotchas). `MODULES.md` has per-module grep anchors — prefer
grep + a targeted read over whole-file reads. `ROADMAP.md` is history;
`BACKLOG.md` holds all other queued work and pending playtests.

Key facts:
- **Repo is private, GitHub Pages is deleted** (intentional) — the game is
  not currently live/public. Verify locally only.
- Local dev: `python3 -m http.server 8317`; verify headlessly with
  **`node tools/verify.mjs`** (parallel pool, full run ~24 s; compact; `-v`
  per-check, `-j N` sets width). Add checks to `tools/checks/*.mjs`, never
  throwaway scripts.
- Verify at *natural* play values (ugly mid-drive headings, parked-truck
  distances, off-axis approaches), not convenient ones.
- If I report something broken after an update, suspect my browser cache
  first (hard refresh — python http.server sends no cache headers).
- **Ask before coding** — present an implementation plan and wait for
  the go-ahead.
