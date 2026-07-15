# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: the Shoulder & the Shelf (`SHOULDER_SHELF_SPEC.md`),
  wave 6a of 7 — "The Shoulder east" (content) + the crossing ceremony.
  The Neutral Ground: cypress/moss flora rows, frogs-over-crickets
  ambience, crawfish ponds off the rice prairie, Vinton fireworks barns,
  Neutral Ground plaque. Texarkana: State Line Ave, the two-state federal
  building, the straddle spot. **WinBig World Casino** parody at the Red
  River (exterior + lot only; the Texas plates are the joke). **Black
  bear** in the Sabine pines (species +1, 28→29, rare, flees).
  Beyond-band glow + control-city signs east (Lake Charles, New Orleans,
  Natchitoches). Ceremony ships with 6a: granite WELCOME TO TEXAS —
  DRIVE FRIENDLY monuments + bluebonnet beds at the major crossings,
  muted leaving toast ("You're leaving Texas. It'll be here."), warm
  return chime + occasional "Miss us?", state-stamp Passport wiring, and
  the 7 **Corner Stones** → `save.passport.stones`. W5 (The Shelf)
  shipped 2026-07-15, commit `TBD`.
- **Recommended setup**: model **Fable 5**, effort **high** — content/
  register wave (vignettes, plaque copy, ceremony), per the spec's model
  table. Flag it if the running model differs.
- **Budget**: code + checks, no shots, grep-first.
- **Then**: rewrite this block for wave 6b (The Shoulder west, Fable 5;
  6b rewrites for W7).

Gotchas from W5 (whoever touches the Gulf, the map layers, legends,
species counts, or offshore anything next must know):
- **New seed streams** (never reuse/rename): `treasure-drift` (light
  jitter), `aransasflock` (Blackjack Peninsula birds).
- **Table-size checks after W5**: species **28** (`ag.mjs`, `padre.mjs`)
  — W6a's bear bumps both to 29; legends **3** and `shelf.mjs` hardcodes
  the '3' in its treasure check (same class as the species literals —
  a 4th legend must bump it).
- **`coastDist(x,z)` (geo.js) is the ONE coastal distance field** —
  coastal border stretch + island rings, shared by `inStateWater`, the
  gulf's vertex-colored blue-water band (world.js `buildWater`) and the
  big-map dashed Tidelands contour (hud.js). Off Padre the line runs
  166.7u from the *island* beach, not the Laguna Madre mainland — any
  new offshore consumer uses `coastDist`, never distance-to-`GEO.border`.
- **The map contour is marching squares, not offset border vertices** —
  the coast polygon wanders through bays (Galveston), so normal-offset
  points come out unordered garbage; the field contour needs no ordering.
  Big map only (minimap Law); segment midpoints on `hud.tidelands`.
- **Gulf plane is ONE vertex-colored mesh now** (`name: 'gulf'`) — never
  add a second near-coplanar water plane (z-fight); recolor via the
  vertex loop. THREE.Color stores linear-sRGB: teal 0x2e6f9e reads
  ~0.158 green in the attribute, not 0.435 — checks compare linear.
- **Maritime plaques are NOT landmarks** (counters sacred — landmark
  table stays 38): `maritime.plaques` + `plaqueNear` is the third branch
  in main.js's unified lookup. New offshore brass = append to that list.
- **Night glows**: `maritime.rigGlow`/`workGlow` are shared materials,
  `fog: false` (horizon skyline dies without it), opacity = ATMOS.night
  each update — reuse them, don't mint per-prop glow mats.
- **Treasure light gate matches sky.js's New Moon label** —
  `round(days % 8) === 4`, driven by `sky.days`. It recedes via
  `haunts.tPos` but only onto points passing `inStateWater`; `T_*` knobs
  at the top of haunts.js.
- **Aviation flaked at `-j4` this session** (A3 medical dedup — clean
  standalone). The old "clean at -j4" note is dead: any aviation FAIL in
  a parallel run gets one standalone rerun before investigation.

Gotchas from W4 (whoever touches ferries, the Gulf, species/landmark
counts, or vehicle.js's per-mode physics next must know):
- **Aboard-riding is position-driven, not scene-graph reparenting.**
  `vehicle.js`'s `avatar.position.copy(this.pos)` runs unconditionally
  every frame off `this.pos` (world-space) — camera/HUD/nearestRoad all
  key off it too. True `scene.attach()` of the truck under a moving deck
  would fight that. Instead `player.aboardFerry` (vehicle.js) gates the
  DRIVE/FLY/WALK input branch, the soft-wall block, and the ground-clamp
  line off; `ferries.js` drives `player.pos`/`heading` directly each
  frame (maritime.js's `laneAt` lane-lerp pattern, not a new technique).
  Bruno approved this substitution over the spec's literal "scene.attach
  precedent" wording before coding — if another wave wants a player to
  ride a moving object, follow this pattern, not dog.js's (that one
  really does reparent, but only a rider *on* the always-position-synced
  truck, never the truck itself).
- **Ferry docking needs an arm/disarm gate or it ping-pongs.** The
  instant a boat docks the player is standing exactly on the boarding
  trigger point — a plain proximity check reboards it on the very next
  tick, forever, with the player still parked. `ferries.js`'s `r.armed`
  flag disarms on arrival and only re-arms once the player's measured
  distance from that dock exceeds `BOARD_R` at least once. Any future
  proximity-triggered vehicle takeover (this track has no more planned,
  but flagging for the pattern) needs the same guard. `ferries.board(key)`
  is a force-board bypass for tests/debug — it skips `armed` on purpose.
- **Hand-placed coastal terminal pairs must be sanity-checked against
  prop size before locking coordinates.** The real Port Aransas ferry
  crossing is genuinely short (~870 units-equivalent); the boat hull is
  15 units long. First-pass real-world coordinates put the docks closer
  together than the boat itself. Fixed by nudging the mainland terminal
  inland along FM 361 to ~82 units, Bolivar's order of magnitude — the
  spec locks a flat ~25s crossing for every route, so route-specific
  duration wasn't the right fix. `tools/checks/ferries.mjs` now asserts
  the gap directly (`gap > 20`) as a regression guard; any new
  hand-placed pair (W6's line vignettes, etc.) should get the same kind
  of check before trusting the numbers.
- **Table-size checks bumped this wave**: species 25→26 (dolphin) in
  `ag.mjs` and `padre.mjs`; landmarks 37→38 (SS Selma) in `padre.mjs`
  (the DOM totals are dynamic — only the *check's* hardcoded expectation
  needed the bump, easy to miss since it's a different file than the one
  you're adding content to).
- **`ferries`/`dolphins` are exposed on `__game`** alongside the other
  systems; `ferries.update(dt, simT)` must run *before* `player.update(dt)`
  in main.js's loop (aboard-riding needs a fresh `player.pos` before the
  avatar/camera stamp reads it).
- **Untested on purpose, low risk**: the bell buoys (`ferries.js`, reuse
  of `audio.bell` — no dedicated numeric check this wave, plain reuse of
  an already-tested synth). Playtest note, not a blocker.

Gotchas from W3 (whoever touches Padre, the map, species counts, or
world.js placement next must know):
- **New seed streams** (never reuse/rename): `turtle:<day>` (release
  mornings), `malaquite-hatch` (hatchling jitter), `padresites` (SPI/
  jetty dressing). Island scenery uses the existing `scenery<key>`
  streams — but island chunks now consume MORE draws (placement retries
  onto the strip, up to 9 per prop); non-island chunks are draw-for-draw
  identical to before (band.mjs frozen baseline proves it).
- **Species table is 25 and two checks hardcode it**: `ag.mjs` (the
  additive-registration check) and `padre.mjs` (DOM totals). W4's
  dolphin → bump both to 26, same class as aviation's 27-airport count.
- **Collectible totals in the DOM are now dynamic** (`total-landmarks`/
  `total-critters`/`total-legends` spans in index.html, filled at boot in
  main.js from LANDMARK_COUNT/SPECIES_COUNT/LEGEND_COUNT). The old
  static copies had rotted to 26/15/2 (real: 37/25/9). Never hardcode a
  collectible total in index.html again — add a span.
- **`onIsland(x,z)` vs `inTexas(x,z)`** (geo.js): island bboxes overlap
  the Port Isabel mainland — anything that must tell island from
  mainland (sand mesh, beach flora, beach cap) uses `onIsland`, never
  `inTexas`. `beachAt(x,z)` = within 6 units of an island ring
  (either shore); vehicle.js DRIVE reads it per frame — its bbox gate
  must stay first.
- **The island is drawn by `buildIslands`' fine sand grid** (6-unit
  cells, land verts at `hAt−0.08`, water at −3.5 → interpolated
  shoreline). The coarse DEM grid can't resolve the island and is
  force-dipped to −4 inside a hardcoded Padre bbox in `buildTerrain`
  (x 2000–2350, z 3510–5500) — if the island data ever changes, update
  that bbox too. `hAt` needed no change (out-bit cells store real
  heights; the mask ignores the bit).
- **The causeway deck is NOT a road** — `nearestRoad` is null on it, the
  drive cap there is the offroad/beach path, and traffic will never
  drive it. Ceremony toast lives in main.js's hudTick block
  (`CAUSEWAY` segment distance < 4, DRIVE, 120 s cooldown on
  `clock.elapsedTime`).
- **`padreSites`** (world.js export, on `__game`): `{causeway, spi,
  jetty, islands[]}` groups for checks. SPI is scenery with 7 towers —
  if anyone ever asks to make it a city, the answer is the Law (132).
- The travel NATURE entry "Gulf Coast — Padre Island" is now
  `drive: true` onto Malaquite sand; the 'Padre Island' **landmark**
  was nudged from open water onto the sand (saves key by name — no
  break). Landmark table is 37 with the Port Isabel Lighthouse.
- W1's "island legally Texas but visually absent" gotcha is **resolved**
  — terrain, both map layers, and scenery all draw Padre now.

Carried over (evergreen until the track closes):
- **Never change the length of `GEO.highways`/`GEO.cities`** (or merge
  the band arrays into them) — rose indices and the 132/254 counters
  depend on them. Band data lives in `GEO.bandHighways`/`GEO.bandCities`.
- **Table-size checks to bump on any addition**: 27 airports / 7-15-5 by
  tier / 22 gate signs (`aviation.mjs`, `hud.mjs`), species 28
  (`ag.mjs`, `padre.mjs`), landmarks 38 (`padre.mjs`), legends 3
  (`shelf.mjs`).
- **`save.passport`** is additive `{stamps, towns, landings, stones}`;
  `stones` stays empty until W6. State stamps gate on `inWorld`.
- **Aviation.mjs flakes under any parallel `-j`** (real-loop-timing
  checks; W5 saw it at `-j4`, clean standalone) — one standalone rerun
  before assuming a regression.
- Agriculture/chapel/farmstead/brand generators stay `inTexas`-gated by
  law; the shoulder gets none of them. Padre being `inTexas` means it
  legitimately gets scenery/animal chunks — do not gate the island out.

Gotchas from W2 still standing (band cities/aviation/military/the map):
- **Band roads baked, arterials only** — no metro-street tier for any band
  city (`build-band-roads.mjs`, GET via the `maps.mail.ru` mirror;
  `overpass-api.de` 406s even on GET here). Every band city uses the
  procedural grid; real streets for a band metro is future polish, not a gap.
- **Silver vs gold**: `mkBandCityStars()` ticks `save.passport.towns`,
  never `save.cities`; `renderMapLayer` draws band dots/labels only on the
  wide layer — the minimap stays Texas-only by Law.
- **`military: true` is the pattern for flavor-only fields** (Cannon,
  Barksdale): real AIRPORTS entries but filtered from `daySchedule`,
  `UNICOM`, and charter pools. All new band-field entries also carry
  `band: true` (Passport landing stamp + map glyph gating).
- **Seed streams `bandcity:`/`bandfolk:`/`bandage:`** — never reuse or
  rename; `live`/`townByCity` maps key band entries as `'band:'+name`.

Gotchas from W1 still standing (geo/map plumbing):
- **Classify by what a point is standing on, not nearest border segment**
  (`classify()`/`inWorld`/`borderZoneAt`): point-in-neighbor-state-polygon
  first, nearest-zone only for open water/actually-Mexico. Any new geo
  classification follows the same pattern.
- **Two separate offscreen map layers**: `hud.miniLayer`/`miniT`/`miniSc`
  pinned to Texas-only `GEO.bounds`; `mapLayer`/`mapT`/`mapSc` are the
  widened layer. `drawMini` must keep using the mini* fields.
- **`GEO.border` stays the flat mainland ring**; Padre's rings live in
  `GEO.islands`, OR'd in by `inTexas`. Any consumer iterating `GEO.border`
  expecting "all of Texas" must opt into `GEO.islands` explicitly (world
  terrain/sand, hud map layers, and scenery placement all do now).
- Band pipeline: `tools/build-band.mjs` (+ `shp2geojson.mjs`, no-deps) from
  Census cartographic boundary shapefiles + PEP CSV; refetch commands in
  the spec + git history. Raw inputs are scratchpad-only, never committed.
- `tools/build-elevation.mjs` takes a Census state-shapefile base path;
  `GRID` widened to `{w:448,h:414,minX:-7330,maxX:6230,minZ:-6630,
  maxZ:5800}` — mirrored in `src/geo.js` `ELEV`, change both.

Playtest still owed (pre-track): the EIGHT ranch compounds (wave 5's
four + 5b's JA/XIT/Matador/LBJ, incl. landing at the new LBJ strip) —
and now Padre: causeway arrival, beach drive, dawn turtle release — and
the Shelf: the rig skyline from Malaquite at night, the buoy + Far Rig
plaques, the treasure light on a new-moon night, the Aransas birds.

Gotchas from waves 5/5b (ranch compounds, `world.js` sites,
`airports.js`, `animals.js`):
- **Any new airport MUST get a `ROUTES` entry in aviation.js** — a missing
  entry crashes the whole main loop at boot and cascades into ~56
  unrelated check failures that all read as "loop dead".
- **Neighboring ranches can have two compounds live at once** (6666 and
  Matador sit ~645 units apart) — any scan for a `ranchhq` group must pick
  the one nearest its target site, never the first in Map order.
- A check that stashes a live animal reference must re-grab it after any
  teleport chain — chunks despawn and the reference points at a disposed
  object that never moves.
- LBJ's compound coexists with its own tier-3 strip: `airportClear`
  handles the standoff; don't move the arch (830.2, 847.1) closer to the
  strip at LL(30.2518, −98.6226).
- `ranchHQSite(i)`/`ranchHQAt(cx,cz)` are pure seeded site functions;
  arch coords duplicated in gameplay.js `LANDMARKS` and animals.js
  `RANCH_ARCHES` — keep all three in sync; animals.js homes the signature
  herds (`SIG`) at the same sites.
- Compound props tagged `userData.prop`, group `userData.kind==='ranchhq'`
  — ag.mjs tallies them; keep tags if rearranging the kit.
- Water-tower sign materials cached per ranch in module-level `towerSigns`,
  never disposed; don't create canvases per spawn.
- `RANCH_ARCHES` rows are APPENDED per arch so pre-wave-5 draws stay
  identical — future rows must also append, never insert.
- The "Cy NPC rain register" check *displaces* non-Cy NPCs out of talk
  range (position + home) before polling — townsfolk walk; any check
  needing a specific NPC nearest must drive to that state, not extend
  timeouts.

Gotchas from wave 4.5 (crops/pivots):
- Field decals: one vertex-color material (`lambVC()`, `'vc'` matCache
  key) — extend `CROP_STYLE[...].stripe`/`defaultStripe()`, never add a
  second VC material.
- **Two seeded streams per ag chunk**: `'crops'+key` (placement — exactly
  6 draws/field, 4/pivot) and `'crops2'+key` (visual jitter, free).
  Visual code never reads from `crand`.
- `ag.mjs` hardcodes a Hale chunk's first field centroid (x≈-2147.501,
  z≈-3607.705) as the placement-frozen baseline — if a wave deliberately
  moves fields, recapture the real baseline, don't hand-wave it.
- `fieldAt(x,z)` replays the `'crops'+key` draw sequence — changing
  placement means updating `fieldAt` in the same edit.
- Pivot arm is static by scope call; a sweep wants
  `group.userData.animated` (pumpjack idiom).

Gotchas from the wave-5.5 HUD session (`main.js`/`hud.js`):
- Per-frame nature-hint block: wildlife (`animals.nearby`, `SPOT_R` 24)
  beats crop (`fieldAt`); both suppressed in FLY; brand-resize hint also
  FLY-gated.
- `#nature-hint` / `hud.natureHint(text)` uses the interactHint
  show/hide-by-textContent pattern.

Gotchas for whoever touches the jetpack (`vehicle.js`/`shop.js`/`dog.js`/
`audio.js`) next:
- `hovering` is a WALK-only sub-state (`GRAV=45`, `AIRDAMP=0.25`) — thrust
  XOR gravity, no stable hover by design. Ground-clamp guard is
  `if (this.mode !== 'FLY' && !this.hovering)`; don't drop the second half.
- `shop.js`: `applyGear` always writes `jetThrust`/`jetAlt`/`jetSpeed`;
  only `jetpack: lvl>0` gates whether Space does anything airborne.
- Flame prop + jet whoosh key off **active thrust** (`hovering &&
  keys['Space']`), not merely `hovering`.
- `audio.jetTarget` is computed before the `!ctx || muted` early return;
  verify reads this field, never the ramping AudioParam.
- `player.onThrust` edge-fires once per liftoff; a check that spies on it
  must restore the real callback, and any check leaving the player
  airborne/non-DRIVE must restore DRIVE at its end.

Gotchas for whoever touches `brands.js` next:
- Hero/props split across `building` sub-group (scales with `SCALE`) vs
  `group` (billboards, own terrain-sampled scale) — new props must pick
  the right parent.
- Foundation skirt: cap TRUE relief FIRST, then divide by SCALE
  (`Math.min(8, relief + 0.4) / SCALE`). Scale range 0.1–1.25.
- `footAt` scales half-extents/`PAD_TOP` by live `SCALE`; footprint
  caches only hold scale-independent geometry.
- `brands.lscNear` triggers off each LSC site's **sign** world position
  (`signAt`), not `site.at`; `plaqueOpen` in main.js is shared via one
  `plaqueNear()` lookup — extend it, don't add a second state var.

Gotchas for whoever touches `hud.js` next:
- Road shield: `this.shield` (wrap div, transformed per frame by
  `animateShield`) vs `this.shieldCanvas` (2D face raster, drawn by
  `drawShield`, cached on `ref+night`). No per-frame canvas work.
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
