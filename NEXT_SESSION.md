# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: the Shoulder & the Shelf (`SHOULDER_SHELF_SPEC.md`),
  wave 4 of 7 — "Ferries & the working water" (machinery). Rideable
  Bolivar + Port Aransas ferries: drive aboard in DRIVE, boat departs on
  boarding (no schedule waits), ~25 s crossing, engine cut, can't skip —
  the slow-TV verb; player/truck parented to the deck (`scene.attach`
  precedent in dog.js); **bottlenose dolphins** bow-ride every crossing
  (species +1, logged from the deck); SS Selma plaque wreck off
  Galveston; bell buoys on the channel (bell synth exists in audio.js).
  Checks: crossing position-over-time, aboard-parenting, dolphin
  proximity + log, return trip, fast-travel/job interaction while
  aboard. W3 (Padre & the coast road) shipped 2026-07-15, commit <fill
  in after commit>.
- **Recommended setup**: model **Sonnet 5**, effort **high** — machinery
  wave (deck parenting, crossing state machine, physics interactions),
  per the spec's model table. Flag it if the running model differs.
- **Budget**: code + checks, no shots — EXCEPT one sanctioned SHOT for
  the deck composition judgment only (spec grants it).
- **Then**: rewrite this block for wave 5 (The Shelf, content, Fable 5).

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
  tier / 22 gate signs (`aviation.mjs`, `hud.mjs`), species 25
  (`ag.mjs`, `padre.mjs`), landmarks 37 (`padre.mjs`).
- **`save.passport`** is additive `{stamps, towns, landings, stones}`;
  `stones` stays empty until W6. State stamps gate on `inWorld`.
- **Aviation.mjs flakes under heavy `-j`** (real-loop-timing checks;
  confirmed again this session at `-j6`, clean standalone and at
  `-j4`) — rerun lower before assuming a regression.
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
and now Padre: causeway arrival, beach drive, dawn turtle release.

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
