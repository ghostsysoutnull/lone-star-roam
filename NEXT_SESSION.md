# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: Agriculture track (`AGRICULTURE_SPEC.md`), wave 4 of 4
  — named-ranch gate arches as `gameplay.js` landmarks (kind `rancharch`:
  King ~27.52 −97.88, Four Sixes ~33.62 −100.32, Waggoner ~33.84 −99.12,
  YO ~30.13 −99.55 — confirm coords in-wave), herd-odds boost near each
  arch (King bigger radius + extra props), 4–6 bespoke ag NPCs with
  weather-leaning dialog, polish. Wave 3 (livestock: horse/goat/sheep/
  bison/angus species, census rows, farm herds, `feedlotAt` + pens)
  shipped 2026-07-13.
- **Recommended setup**: model **Fable 5**, effort **high** —
  content/register wave (plaque copy + dialog pools). Flag it if the
  running model differs.
- **Budget**: code + checks, **one `t.shot`** (arch silhouette), grep-first.
- **Then**: decide optional wave 5 (ranch compounds) by driving up to an
  arch at wave-4 end — if it dies, this wave folds the whole track into
  one `ROADMAP.md` entry and DELETES this briefing block; if it runs,
  rewrite this block for wave 5 instead.

Gotchas carried over (wave 4 must know):
- Arches join the LANDMARKS table via `LL()` — collect + plaque come free
  (`plaqueNear` in main.js is the single "which plaque is open" lookup;
  never add a second state var). Verify at parked-truck distance + ugly
  approach headings (compass/plaque lesson).
- Herd boost: animals.js `spawn()` already appends census rows via
  `censusTable(x,z)` — boost by adding an arch-proximity term there (or
  extra rows), NOT by touching `regionTable` (its draws must stay
  byte-identical for existing wild placements). W4 check: boosted odds
  measurably beat a control point.
- Ag NPC dialog: npcs.js assembles at interact time from the `getContext`
  callback (weather/night/progress) — the rain-leaning lines must surface
  under `t.setWeather('rain')` and assert on DOM text (existing npcs
  idiom). NPCs sit on road shoulders via `roadShoulder()`.
- `feedlotAt(cx,cz)` (world.js, on `__game`) → `{x, z, rot, pens:[{x,z}],
  key}` or null; onFeed-density ≥30 gate = exactly the top 9 counties.
  `farmsteadAt` → `{x, z, rot, silos, key}`. Both pure seeded; animals.js
  READS them for herds — never respawn or duplicate.
- New species facts ship in SPECIES (20 total incl. bat); bison herd is
  hardcoded at `BISON_SITE` (−1488.5, −3796, chunk −6,−15 — Caprock
  Canyons). Angus have `leash: 2.2` (penned); `move()` honors
  `spec.leash ?? 45`.
- Chickens are scenery props (animate-loop kind `'chicken'`), NOT
  animals.js agents — don't migrate them.
- King Ranch (27.52 N) is deep South Texas brush country — regionTable's
  south box already runs longhorn-heavy; the boost radius rides on top.

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
