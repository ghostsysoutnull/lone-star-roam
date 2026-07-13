# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: Jetpack track, wave 2 of 2 (final) — feel: VFX + audio +
  camera + dog for the WALK-mode jetpack. Wave 1 (physics + shop + verify)
  shipped 2026-07-13, commit (pending). It flies, is fully tested, and
  measurably correct (AGL/cap/land/tiers) — it just doesn't *look* like
  anything yet: no backpack prop, no flame, no sound, camera doesn't
  react to altitude. Spec: `JETPACK_SPEC.md`.
- **Recommended setup**: model **Sonnet 5**, effort **high** — content/feel
  wave (avatar prop + flame VFX, audio hook, camera lerp, dog behavior),
  but still touches real physics/render wiring, so keep the structural bar.
  Flag it if the running model differs.
- **Budget**: code + checks, at most **one** flame-feel screenshot and only
  on request. Resolve W2's open calls first (see below), then plan before
  coding.
- **Then**: this is the last wave — the session-end rewrite deletes this
  briefing block and folds the whole Jetpack track into one `ROADMAP.md`
  entry; `JETPACK_SPEC.md` stays as history.

Open calls to resolve at the top of this session (`JETPACK_SPEC.md` §"Open
calls for W2"):
- Lacy's airborne behavior — spec recommends: stays grounded, waits below,
  yips at liftoff (reuse `honked()` bark queue), rejoins the follow on
  landing. Confirm with Bruno before implementing.
- Whether a HUD AGL readout is worth the rem-based UI work.
- Camera feel: fixed higher framing vs. AGL-proportional lerp.

Gotchas carried over from W1:
- `vehicle.js`: `hovering` is a WALK-only sub-state (`GRAV=45`,
  `AIRDAMP=0.25`, module constants) — thrust XOR gravity each frame, no
  stable hover point by design (see spec's physics tuning notes). The
  ground-clamp guard is `if (this.mode !== 'FLY' && !this.hovering)`; don't
  remove the `!this.hovering` half or WALK re-pins to terrain every frame.
- `shop.js`: `jetpack` perk gates capability at level 0 (index 0 of
  `JET_THRUST`/`JET_ALT`/`JET_SPEED` = 0/unowned) — `applyGear` always
  writes `jetThrust`/`jetAlt`/`jetSpeed` regardless of ownership, only
  `jetpack: lvl>0` gates whether Space does anything airborne.
- Any verify check that leaves the player airborne or in a non-DRIVE mode
  must restore DRIVE at its end — the horn/Lacy checks depend on ambient
  DRIVE mode (the aviation-tune check learned this the hard way; jetpack.mjs
  follows it too).
- `dog.js` needs no change for hovering to be *safe* (she grounds her own y
  independent of the player's), but W2 is where her behavior should become
  *intentional* per the open call above.

**No other active priority track.** The Texas Brands track (Bucky's,
H-E-Buddy, Lone Star Compute — 3 waves) shipped 2026-07-12 and is folded into
`ROADMAP.md`; `BRANDS_SPEC.md` stays as history. A follow-up player-controlled
brand-size feature (`[`/`]`, own `lonestar-brand-scale` localStorage key) also
shipped 2026-07-12 on top of it — see the `brands.js` gotcha below. A second
follow-on, the datacenter ID sign + real-facts plaque (all 8 Lone Star Compute
sites), shipped 2026-07-13 (`DATACENTER_SIGN_SPEC.md`) — see the new
`lscNear`/`plaqueOpen` gotcha below. Queued work lives in `BACKLOG.md`;
pending playtests are there too.

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
