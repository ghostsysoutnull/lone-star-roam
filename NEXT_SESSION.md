# Lone Star Roam — next session kickoff

No active priority track. The Agriculture track (waves 1–5, + the 4.5 crop
visuals and 5.5 HUD follow-ons) shipped in full 2026-07-14 and is folded
into `ROADMAP.md`; `AGRICULTURE_SPEC.md` stays as history. Queued work and
pending playtests live in `BACKLOG.md`. A playtest of the wave-5 ranch
compounds (drive all four arches again) is the natural next Bruno errand.

Gotchas from wave 5 (whoever touches the ranch compounds, `world.js`
sites, or `animals.js` next must know):
- `ranchHQSite(i)`/`ranchHQAt(cx,cz)` (world.js) are the pure seeded site
  functions for the four compounds — arch coords are duplicated in
  gameplay.js `LANDMARKS` and animals.js `RANCH_ARCHES`; keep all three in
  sync. animals.js homes the signature herds (`SIG` table in `spawn()`) at
  the exact same sites — never re-derive or hand-place them.
- Compound props are tagged `userData.prop` (`hqhouse`/`watertower`/`barn`/
  `horsebarn`/`pen`/…) and the group is `userData.kind === 'ranchhq'` — the
  ag.mjs wave-5 checks tally these; keep the tags if you rearrange the kit.
- Water-tower sign materials are cached per ranch in a module-level Map
  (`towerSigns`) and never disposed (shared-prototype precedent) — don't
  create canvases inside `mkWaterTower` per spawn.
- `RANCH_ARCHES` wave-5 rows (King santagertrudis, Y.O. axisdeer/blackbuck)
  are APPENDED to each arch's rows so pre-wave-5 chunk draws stay identical.
  Any future row must also append, never insert.
- The "Cy NPC rain register" check no longer waits out townsfolk drift — it
  now *displaces* any non-Cy NPC out of talk range (position + home) before
  polling. Townsfolk positions are real-loop-accumulated (they walk), so any
  check near a city that needs a specific NPC nearest must drive to that
  state the same way, not extend timeouts.

Gotchas carried over from wave 4.5 (crops/pivots):
- Field decals carry an optional vertex-color `stripe` on `mkFieldPatch`
  (own `lambVC()` material, `'vc'` matCache key). Don't add a second
  vertex-color material; extend `CROP_STYLE[...].stripe` or
  `defaultStripe()` instead.
- **Two seeded streams per ag chunk**: `'crops'+key` (placement — exactly 6
  draws/field, 4/pivot, never touched by visual code) and `'crops2'+key`
  (row/bale visual jitter, free to consume anything). Never let visual code
  read from `crand`.
- `tools/checks/ag.mjs` (37 checks) hardcodes a known Hale chunk's first
  field centroid (x≈-2147.501, z≈-3607.705) as the placement-frozen
  baseline. If a future wave deliberately moves fields, recapture the real
  baseline (git stash, read live centroid, hardcode) — don't hand-wave it.
- `fieldAt(x,z)` (world.js) replays the `'crops'+key` draw sequence — if you
  change field/pivot placement, update `fieldAt` in the same edit.
- Pivot arm is static by scope call; if a wave wants the sweep, register it
  in `group.userData.animated` (pumpjack idiom).

Gotchas from the wave-5.5 HUD session (`main.js`/`hud.js`):
- `main.js` per-frame nature-hint block: wildlife (`animals.nearby`, set in
  the per-frame step loop, `SPOT_R` 24) beats crop (`fieldAt`); both
  suppressed in FLY. The brand-resize hint is also FLY-gated.
- `#nature-hint` / `hud.natureHint(text)` uses the interactHint
  show/hide-by-textContent pattern.

Gotchas for whoever touches the jetpack (`vehicle.js`/`shop.js`/`dog.js`/
`audio.js`) next:
- `hovering` is a WALK-only sub-state (`GRAV=45`, `AIRDAMP=0.25`) — thrust
  XOR gravity, no stable hover point by design. The ground-clamp guard is
  `if (this.mode !== 'FLY' && !this.hovering)`; don't drop the second half.
- `shop.js`: `applyGear` always writes `jetThrust`/`jetAlt`/`jetSpeed`;
  only `jetpack: lvl>0` gates whether Space does anything airborne.
- Flame prop + jet whoosh key off **active thrust** (`hovering &&
  keys['Space']`), not merely `hovering` — don't loosen either gate.
- `audio.jetTarget` is computed before the `!ctx || muted` early return;
  verify reads this field, never the ramping AudioParam.
- `player.onThrust` edge-fires once per liftoff; a check that spies on it
  must restore the real callback. Any check leaving the player airborne or
  non-DRIVE must restore DRIVE at its end.

Gotchas for whoever touches `brands.js` next:
- Hero/props split across `building` sub-group (scales with `SCALE`) vs
  `group` (billboards, own terrain-sampled scale) — new props must pick the
  right parent.
- Foundation skirt depth: cap the TRUE relief FIRST, then divide by SCALE
  (`Math.min(8, relief + 0.4) / SCALE`). Scale range 0.1–1.25.
- `footAt` scales half-extents/`PAD_TOP` by live `SCALE`; footprint caches
  only hold scale-independent geometry.
- `brands.lscNear` triggers off each LSC site's **sign** world position
  (`signAt`), not `site.at`; `plaqueOpen` in main.js is shared via one
  `plaqueNear()` lookup — extend it, don't add a second state var.

Gotchas for whoever touches `hud.js` next:
- Road shield: `this.shield` (wrap div, transformed per frame by
  `animateShield`) vs `this.shieldCanvas` (2D face raster, drawn by
  `drawShield`, cached on `ref+night`). Don't add per-frame canvas work.
- `parseShield` only swallows clean "PREFIX ###" refs; messy municipal
  names fall through to the text line on purpose.
- `#hud-speed`/`#hud-mode` offsets are rem-based; if either block grows,
  bump the other's `bottom` in rem and rerun the hud overlap check.

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
