# Gotchas — the law book

Standing rules that survived their tracks. These are laws, not history: violating
one reintroduces a shipped bug or breaks a save. Before coding in an area, grep
this file for its section. At track close, gotchas that must outlive the track
graduate here (and out of `NEXT_SESSION.md`).

## Sacred counts & saves

- **Never change the length of `GEO.highways`/`GEO.cities`** (or merge the band
  arrays into them) — rose indices and the 132/254 counters depend on them. Band
  data lives in `GEO.bandHighways`/`GEO.bandCities`.
- **`band-highways.json` is rebakeable again** — inputs in
  `tx-inputs/band-{la,ar,ok,nm}.json`, exact queries/endpoints/bboxes in
  `tools/build-band-roads.mjs`'s header (the first bake left only a
  `<routes>`/`(bbox)` template, so nobody could regenerate it). The bboxes are
  **reconstructed**: they reproduce the trunk tier exactly (23 polylines,
  4133u) but not motorway/primary. Arg order is load-bearing (chaining is
  greedy over file order). Any rebake shifts band geometry — run the shoulder
  suite (the crossing monuments read band endpoints), `band.mjs`'s guards,
  and `traffic.mjs`'s band-road check.
- **`GEO.rails`/`GEO.bandRails` follow the same never-merge separation as
  highways/cities** even though nothing today indexes `rails.json` by array
  position — keeps the rebake/law surface consistent (`tools/build-rails.mjs`
  vs `tools/build-band-rails.mjs`, own file, own bboxes). `band-rails.json` is
  rebakeable from `tx-inputs/band-rails-{la,ar,ok,nm}.json` (script header has
  the exact Overpass GET queries/bboxes/arg order). **Group chains by
  operator only, never operator+name**: the OSM band fetch tags the same
  physical line with an inconsistent operator prefix ("UP Little Rock
  Subdivision" vs "Little Rock Subdivision") — name-grouping shredded every
  band mainline at that seam and left Arkansas with nothing long enough to
  force a train. `chain()`'s turn-angle guard is what actually prevents
  welding unrelated branches, so dropping name from the identity is safe;
  each merged chain reports whichever constituent way's name covers the most
  points (`topName()`), not an arbitrary first pick.
- **Simplification tolerances are in DEGREES** — simplify before `proj`, never
  after (`build-data.mjs` is the reference). Reversed, 0.0025 reads as 25 cm
  instead of ~260 m and nothing gets dropped; `band.mjs` guards the ratio now.
- **Never change `seededRand` seed strings** — determinism is what makes bugs
  cheaply reproducible, and players' saves + spatial memory depend on it. Every
  stream ever minted is still live; add new ones, never rename.
- Saves extend with **new keys only**. `save.passport` is additive
  `{stamps, towns, landings, stones}`; it has its own HUD row and never folds
  into the Texas tallies. Collectible totals in the DOM are dynamic spans filled
  at boot — never hardcode a total in `index.html` again.
- **Table-size checks to bump on any addition**: 27 airports / 7-15-5 by tier /
  22 gate signs (`aviation.mjs`, `hud.mjs`), species **29** (`ag.mjs`,
  `padre.mjs`), landmarks **38** (`padre.mjs`), legends **3** (`shelf.mjs`),
  stones 7 + monuments 10–15 + plaques **15** + signs 4 + glows 4
  (`shoulder.mjs`).
- **Any new airport MUST get a `ROUTES` entry in aviation.js** — a missing entry
  crashes the main loop at boot and cascades into ~56 unrelated failures that all
  read as "loop dead".
- **Save slots (`src/slots.js`, New Player W4)**: every localStorage base key
  name lives in `KEYS` there — never hardcode a `'lonestar-…'` string
  elsewhere. `slotKey(base, slot = activeSlot())` builds the real key
  (`base:slot`); `lonestar-slot` is the only key that stays global. New
  per-slot settings follow the same pattern (hud.js/brands.js/missions.js
  are the reference — read the key at construction, write it through
  `slotKey()` on every change). `gameplay.save.name` is additive (slot
  display name, `null` = unnamed). Resume writes on a 20 s interval
  (`gameplay.update`'s `saveTimer`) plus the pause screen's Save & quit
  button — there is no `pagehide`/`visibilitychange` listener, so a hard tab
  close between those can lose up to 20 s.
- **Energy `HEROES` ids are stable save keys AND job references**
  (`energy.js`): `save.energy` entries and energy-job `siteFrom`/`siteTo`
  fields store them. Never rename or re-key a shipped id. Jobs resolve ids
  at use (`missions.site(id)`) and an orphaned id self-clears through
  `target()` — the city-rename lesson; never hardcode a site's coords into
  a job.
- **Slot switching is live, never a page reload** — the verify harness's
  context wipes localStorage on every navigation, so a reload-based switch
  is untestable and the hard requirement puts `select`/`newGame`/`rename`/
  `delete` on `__game.title` specifically so the suite can drive them.
  `gameplay.loadSlot()` disposes and rebuilds the mesh-backed visuals
  (city/band-city stars, roses, landmarks — `mkCityStars` etc. bake
  visited/collected state at construction and only ever *remove* a star
  during play) and `title._afterLoad()` re-applies the 4 settings +
  `applyGear` (shop perks/paint/dog) + the mid-haul cargo mesh. Any module
  that caches `gameplay.save` in a field instead of reading it live through
  a getter will go stale on a switch — `missions.js` shipped that bug once
  (fixed to `get save() { return this.gp.save; }`).

## The law of Texas

- **Amended (Band Parity W4, 2026-07-17)**: crop decals/pivots/`farmsteadAt`/
  `feedlotAt`/`chapelAt`+cemeteries and the flora scatter loop are now
  `inTexasOrBand`-gated (`geo.js`) — real band land (LA/AR/OK/NM) legitimately
  grows these too, painted from `GEO.bandAg` (own bake, `tools/build-band-ag.mjs`,
  never merged into `GEO.ag`/the 254-county tally). Road/city standoffs use
  `nearestAnyRoad`/`cityClear` so band-side legality checks the right network.
  `feedlotAt` is band-capable but real 2022 census data never crosses its 30
  head/km² gate there (OK Texas County tops out ~23.6) — dormant by data, not
  a bug. Brand generators and `ranchHQSite`/`ranchHQAt` (named real Texas
  ranches, fixed lat/lon) stay `inTexas`-only — never widen those to
  `inTexasOrBand`. Animal herds at band farmsteads/feedlots are NOT yet
  wired (`animals.js` guards `farmsteadAt` herds on `inTexas` on purpose) —
  that's Band Parity W5. Padre being `inTexas` means it legitimately gets
  scenery/animal chunks — do not gate the island out.
- **Amended (Band Parity W5, 2026-07-17)**: `animals.js` region tables now
  flavor band land by `neighborStateAt` (LA swamp / AR pine / OK plains / NM
  desert — mirrors W3's ground tints); census herds spawn at band farmsteads
  via the same `agAt || bandAgAt` fallback world.js's `farmsteadAt`/
  `feedlotAt` already use; the wander/flee clamp and road-avoidance are
  `inTexasOrBand`/`nearestAnyRoad` throughout. `ranchHQAt`'s compound-herd
  gate stays `inTexas`-only on purpose (named real Texas ranches) — never
  widen it to the band.
- **Roswell/Lawton/Lake Charles/Carlsbad/Alamogordo sit just past the
  25-mile band edge** (measured in `SHOULDER_SHELF_SPEC.md`) — beyond-band
  glow + radio-wink treatment only (`shoulder.js`), never landable content;
  `band.mjs` asserts they never leak into `GEO.bandCities`/`bandHighways`.
  Band Parity W6 nearly re-added them as landable airports because the
  spec's example class named them — don't repeat that: adding them as real
  band fields needs an explicit call on relaxing this exclusion for the
  airport point specifically (tracked in `BACKLOG.md`), not a silent
  table addition.
- Named NPCs, landmarks, brands and haunts stay Texan. SPI is scenery, not a
  133rd city. Road-job endpoints stay Texan (`GEO.cities` by name); **charters
  may cross** (airport-id resolution). Flavor text is the only place that names
  the world across the line — `CARGO.note` exists exactly for that, and
  `missions.mjs` asserts every `from`/`to` resolves, because an unresolvable name
  fails silently.
- **Glenrio and Whites City are NOT in `GEO.bandCities`** (both unincorporated) —
  hand-built vignettes. Never resolve them by city name anywhere.
- **Never trust a real-world coordinate as a final building position** — at
  1:100 scale the highway is a 3.2-unit ribbon and the real thing usually sits
  ON it (2026-07-16 audit: 15/15 Bucky's straddled their road; the H-E-Buddy
  search shipped stores in the Corpus bay, across the El Paso border, on the
  Brazos). Authored coords are anchors: every brand table resolves through
  `legalize()`/`spotClear()` (brands.js — road-ribbon clearance at reference
  brand scale 0.5, street tier at the 0.15 default, dry, in-state,
  airport-clear; `brands.mjs` asserts all 56 resolved sites + the five nudged
  landmarks). New placed structures go through that gate or a `chapelAt`-style
  seeded search with the same rejects.

## Geo & classification

- **Classify by what a point is standing on, not nearest border segment**
  (`classify`/`inWorld`/`borderZoneAt`): point-in-neighbor-state-polygon first,
  nearest-zone only for open water/actually-Mexico. Open water nearest a
  US-neighbor stretch is 'land'; Gulf water east of the Rio Grande mouth vertex
  and north of its latitude is 'coast' — Mexico stays out SW of that line.
- **`coastDist(x,z)` is the ONE coastal distance field**; `neighborDist(key,x,z)`
  is the one neighbor-state distance. New consumers use them, never
  distance-to-`GEO.border` and never a longitude guess.
- **Border checks use SEGMENT distance, not vertex distance** — surveyed straight
  lines run 1300+ units between vertices. (Corner Stones snap to vertices on
  purpose; the corners ARE vertices.)
- **`GEO.border` is the flat mainland ring**; Padre's rings live in `GEO.islands`,
  OR'd in by `inTexas`. Anything iterating `GEO.border` expecting "all of Texas"
  must opt into `GEO.islands`. `onIsland` ≠ `inTexas` — island bboxes overlap the
  Port Isabel mainland.
- The coarse DEM is force-dipped inside a hardcoded Padre bbox in `buildTerrain`
  (x 2000–2350, z 3510–5500) — if island data changes, update that bbox too.
- **OSM `voltage` is multi-value** (`345000;138000`) — match the target value
  anywhere in the list, never `split(';')[0]` (`build-energy.mjs`; same
  defect class as the band-roads concurrency refs).
- **Wind turbines bake as clustered farms** (`{x, z, count, r}`), never as
  27k individual nodes — scenery instances the fleet from a seeded stream
  inside each radius, and the bake asserts Roscoe + Horse Hollow survive
  clustering. Keeps the boot JSON small and the fleet honest.

## Rendering & systems

- **Gated UI is always built, only presentation is gated** (debug.js's
  panel, title.js's boot screen) — the object and every method it needs
  exist unconditionally on `__game`; only a DOM element's visibility or a
  URL flag decides whether a human ever sees it. This is what lets the
  verify harness drive a "hidden" screen's real logic (`title.select()`,
  `debug.actions.firstRun()`) without a click. Never special-case behavior
  behind `window.__harness` beyond skipping the initial reveal.
- **Decks are not roads** — the causeway, the Carlsbad park road, Anthony's Main
  St and the Texhoma line: `nearestRoad` is null on them, traffic never drives
  them, and the drive cap there is the offroad/beach path.
- **Gulf is ONE vertex-colored plane** (`name: 'gulf'`) — never add a second
  near-coplanar water plane. THREE.Color stores linear-sRGB: checks compare
  linear values, not the hex you typed.
- **sky.js owns every light.** Night glows are shared materials with `fog: false`
  and opacity driven off `ATMOS.night` — reuse them, never mint per-prop glow mats.
- **Every gas/refinery flame shares ScenerySystem's one `flareMat`** — its
  opacity rides `ATMOS.night` (flares burn 24/7: faint by day, punching
  through after dark — Bruno's call, Energy W4); flicker is a per-flame
  scale pulse via the animated registry. New flame props reuse the material
  — the gate and the day/night look live in exactly one place.
- **The oversize-load bonus is speed-over-time** (Energy W6): `j.maxSpd` is
  tracked EVERY frame in `missions.update`, never sampled at arrival — a
  burst over the cap must not be able to slip between checks (the
  charging-deer lesson applied to a game rule). The terms + verdict
  (`oversizeOfferTerms`/`oversizeBonus`) are pure in `mission-rules.js` so
  `tools/test.mjs rules` covers them without a browser.
- **Plaques are one unified lookup in main.js** (brands / maritime / shoulder,
  each with an `icon` field). New brass appends to a list; it never adds a branch
  or a second state var. Maritime plaques are NOT landmarks.
- **`ribbon(x0,z0,x1,z1,w,mat,seg)`** (shoulder.js) is the arbitrary-bearing
  draped strip — reuse it; don't add a third drape helper. New buildings near a
  band town need a `CLEAR_BOXES` entry (`shoulderClear`, airportClear idiom).
- **Aboard-riding is position-driven, not reparenting**: `player.aboardFerry`
  gates the input branch and ferries.js drives `player.pos` directly. Any
  proximity-triggered vehicle takeover also needs ferries.js's `armed`
  arm/disarm gate or it ping-pongs forever.
- **The hotkeys are window-level and bubble-phase — that is load-bearing.**
  `#city-search` (travel.js) is the game's only text input and defends itself by
  stopping keydown propagation; a capture-phase window listener would slip past
  it and put the hotkeys back in the search box. Escape is the deliberate
  exception (it still bubbles, and closes the menu).
- **Pause carries a reason, not a boolean** — `'esc'` (banner + swallows every
  key) vs `'menu'` (travel menu, silent freeze that must NOT swallow keys, since
  P/Esc are how it closes). `isPaused()` still means the Esc screen; `isFrozen()`
  means the loop is skipping updates. The menu freeze lives in travel.js's
  `toggle()`/`close()` so fast travel's own `close()` unfreezes too.
- **A new chatter kind needs THREE rows, not two**: a `POOLS` pool, a `VOICES`
  entry, *and* a `ROLL_OK` row in radio.js. Miss the last one and the aircraft
  enters `radio.sources`, fills lines on demand, and is never picked — silent,
  with nothing failing. (Cost W7 a real bug; the wiring sentinel caught it.)
- **`FogGate` (sky.js) is the one way to hide world-spanning boot decoration
  beyond the fog wall** — wired into shoulder.js and gameplay.js (Performance
  W3). Hides a root's direct children once their whole world footprint sits
  beyond `GATE_R` (1500 = max fog.far 1400 + margin). Children with any
  `fog: false` material are auto-exempt (horizon glows are designed to beat
  fog). Pure visibility — interaction logic must stay distance-based and
  never read `.visible`. A rebuilt root (e.g. a gameplay save-slot switch)
  needs a fresh gate.
- **New props/buildings ship at the W6b poly bar** (standing rule, Bruno
  2026-07-17). Round/turned forms use 8–14 radial segments — hero/landmark
  one-offs at the top (12–14, merged vertex-colored geometry per the
  legibility-pass skill / `mkHatchGeo` idiom), chunked instanced scatter
  never below 8 and per-instance vertex counts in the low hundreds.
  A 6-segment cylinder reads hexagonal at parked-truck distance — that's
  the failure this rule exists to prevent. Boxy/lattice subjects (barns,
  transmission towers) stay box-built; boxes are their correct silhouette.
  Retrofit of pre-W6b props is the queued BACKLOG review, one
  legibility-pass per subject — not license to rework shipped meshes
  mid-track.

- **`trains.js` rail laws** (Railroads Realism, all 3 waves): a rail with
  `spur` set is scheduled-named-train turf only — `spawn()`/`force()` must
  keep excluding it from random/forced spawn, or a 14-car freight shows up on
  a 200-unit border approach. Band rails (`band: true`) are NOT spurs — they
  join random spawn, forcing, and junction-hop (`hopAt`) like any other
  mainline, liveries free from their OSM `operator` tag; the dormant
  random-livery `LOCO_COLORS` fallback (every Texas rail passing the freight
  filter already carries a real UP/BNSF/CPKC tag) wakes for real once band
  operators outside the `LIVERY` table show up — that's by design, not a bug
  to fix by growing the table. `LIVERY` lookups must stay normalized for both
  UP spellings (`Union Pacific Railroad`/`Union Pacific`). The Z's "longest
  BNSF mainline" search must skip `r.band` — a long band BNSF line can
  otherwise win "longest" and silently move the Z off its tour spot; the
  same guard pattern applies to any future named-train route picked by a
  live search over `this.rails` rather than a fixed key. `railxing:<site>:
  <day>` (laredo/eaglepass/ztrain) are seed streams — never rename, per the
  blanket seed-string law above.

## Verification

- **Tour spots guarantee their subject** (`src/tours.js`): static/ambient
  content — teleport + staged time suffices. Schedule- or probability-gated
  content — chain a forcing debug action (`turtleMorning`, `treasureNight`,
  `bear` via `animals.forceSpawn` are the patterns; forcing is debug-only and
  never changes natural odds). A "maybe you'll see it" button is allowed only
  when its note explicitly labels it a watch (the Roswell wink). Audit lesson
  2026-07-16: 6 of the first 30 spots violated this — three needed forcing,
  two needed staged time (night thins traffic; cranes dim after dark), one
  staged the wrong mode entirely (flares fire only in FLY).
- **Real-loop-timing checks flake as a CLASS under any parallel `-j`, not as a
  fixed list** — each loaded full run flakes a *different* random 2–5 of them
  (2026-07-19, four runs: aviation, shop's Lacy-yip, springer's hint/hop,
  lights' flashlight-timer + Levelland flicker, ferries' ramp-arrival ±0.6u,
  onboarding's tip order — all clean standalone). Policy: one standalone rerun
  before assuming a regression, and never treat "a new suite flaked" as news.
- **Full-verify run discipline** (2026-07-19 — a quarter of a wave session went
  to avoidable reruns): (1) *capture-once* — pipe every full run to a file
  (`node tools/verify.mjs > /tmp/verify-run.log 2>&1`), then `tail`/`rg FAIL`
  the file; NEVER re-run the suite just to re-see failures that scrolled past a
  `| tail`. (2) *batch the flake tax* — collect flaked suites across the
  session and confirm them in ONE `-j 1` pass at the end, not one confirm
  cycle per full run. (3) full runs are for the protocol points (wave end,
  pre-push); mid-wave iteration stays on named suites.
- **Score-row DOM reads must `until()` the DOM, not race it** — the score spans
  ride the 12 Hz HUD tick.
- **The ceremony state machine is land-to-land** with an 8 s cooldown on
  `clock.elapsedTime` — any check crossing the line twice must wait 8.2 s or the
  second transition is swallowed.
- **A check that stashes a live animal reference must re-grab it after any
  teleport chain** — chunks despawn and the reference points at a disposed object.
- **Hand-placed coordinate pairs get a check before you trust them.** Real-world
  coordinates once put two ferry docks closer together than the boat was long.
  `ferries.mjs` asserts the gap; the Turtle Lady's SPI spot asserts `onIsland`.
- **A real baked coordinate is not a real footprint — check the rendered
  geometry, not just the point.** Every other site-placement function
  (`wellSiteAt`, `windTurbinesAt`) checks road/city/airport clearance before
  drawing; `solarSitesAt` skipped it on the reasoning "exact real coordinates
  need no generation checks" — true for the point, false for the footprint
  drawn around it. Blue Wing Solar Farm's baked center sits 2.8u from I-37;
  its unclamped decal (an aggregate radius, not the real polygon) drew
  straight across the highway, and a neighbor did the same to the San
  Antonio River (Bruno caught both by eye, Energy W3 post-ship). Any object
  rendered at a real coordinate *with a footprint radius* must clamp that
  radius to actual clearance (`nearestAnyRoad`/`nearestRiver`/etc.) and skip
  drawing below a floor rather than shrink to nothing — a real point doesn't
  excuse an unchecked footprint. `nearestRiver(x, z, radius)` (geo.js,
  `nearestRoad` idiom) is the sibling query for river clearance.
- **Screenshot analysis goes to Copilot CLI, never into Claude's context**
  (validated 2026-07-16 on a real band shot). Stage with
  `node tools/stage-shot.mjs <out.png> <x> <z> [heading°] [mode] [agl] [skyT]`,
  then ask a targeted, word-capped question answerable from the image alone:
  `copilot -p "<question>" --attachment <shot.png> --model <m> [--effort low]
  --available-tools ask_user --no-ask-user`. The bogus `--available-tools`
  name disables ALL of Copilot's tools — never pass `--allow-all-tools` (with
  it, Copilot autonomously reads repo files). Tiers: factual reads →
  `gemini-3.5-flash --effort low`; judgment reads → `claude-sonnet-5`. Image
  input is `--attachment`, not `@path`; output reports no model line — wrong
  slugs fail loudly, so trust the flag. Copilot reports what it sees; spec and
  register comparisons are Claude's, and final aesthetic judgment is Bruno's
  (shots still go to his eye — Copilot is the pre-check gate). Copilot's
  read is not authoritative for anything measurable: it twice misjudged
  save-slot row heights as "still inconsistent" (New Player W4, 2026-07-17)
  when `getBoundingClientRect()` on the live DOM showed all three rows at
  the same 94px — a quick playwright script that queries real layout numbers
  settles a metric dispute a screenshot can't. Budget
  (2026-07-17): one shot per new or changed visible surface by default,
  judged before commit; logic/data/physics work stays shot-free; never the
  pass/fail signal.
- **The harness fake clock zeroes lap ms** (`perf.mjs`'s `PerfMonitor`
  timing) — `performance.now()` doesn't advance under it, so real
  millisecond values only exist on Bruno's browser. Checks assert structure,
  tick counts, and draw/triangle counts (`renderProbe()`), never ms
  thresholds.
- **Draw-call probes run hot for ~0.6 s after a teleport** (Performance W3
  Finding 8): the prior spot's scenery chunks are still live in the camera
  wedge, reading ~+300 calls over the settled value. The W2 guardrail probes
  at that cadence, so its cap (1600 draws) is pinned against that hot
  context — never re-tune it from a settled-state number, and state which
  context (settled vs post-teleport) any new draw-call reading came from.
- **The band suite's frozen chunk baseline counts flora, not just
  buildings** (Performance W3 tagged every scenery prop with
  `userData.kind` for the draw audit) — a new prop kind or a tag rename
  re-pins the three chunks the band suite freezes.
