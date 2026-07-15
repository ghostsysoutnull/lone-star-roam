# Lone Star Roam — next session kickoff

No active track. **The Shoulder and the Shelf closed 2026-07-15** (7 waves, all
folded into one `ROADMAP.md` entry; `SHOULDER_SHELF_SPEC.md` stays as history).
Queued work and every owed playtest live in `BACKLOG.md` — the Shoulder & Shelf
playtest list is long and entirely unspent, so a play session is the highest-value
next move, not more code.

**Band roads rebaked and played, 2026-07-15 (`8398546`)** — settled, no action.
The bake had been applying a *degree* tolerance in game units (~1000× too
tight), so band roads shipped unsimplified at 2.2 u/pt against Texas's 34.6 and
read dense and rough the moment you crossed the line; fixed to simplify before
projecting (6830 pts → 340). The rebake also moved the road set (81 → 76
polylines, +478u primary, −173u motorway); **Bruno drove the band and passed
it**, so that shift is verified play-side as well as by the suite. The band is
now a clean baseline: the `BACKLOG.md` concurrency fix is the *next* road-set
shift and lands against this, unstacked.

---

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture +
commands + gotchas). `MODULES.md` has per-module grep anchors — prefer grep + a
targeted read over whole-file reads. `ROADMAP.md` is history; `BACKLOG.md` holds
queued work and pending playtests.

Key facts:
- **Repo is private, GitHub Pages is deleted** (intentional) — the game is not
  currently live/public. Verify locally only.
- Local dev: `python3 -m http.server 8317`; verify headlessly with
  **`node tools/verify.mjs`** (parallel pool, full run ~30 s; compact; `-v`
  per-check, `-j N` sets width). Add checks to `tools/checks/*.mjs`, never
  throwaway scripts.
- Verify at *natural* play values (ugly mid-drive headings, parked-truck
  distances, off-axis approaches), not convenient ones.
- If I report something broken after an update, suspect my browser cache first
  (hard refresh — python http.server sends no cache headers).
- **Ask before coding** — present an implementation plan and wait for the go-ahead.

---

## Standing gotchas (survived the track — these are laws, not history)

**Sacred counts & saves**
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
  suite, the crossing monuments read band endpoints.
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

**The law of Texas**
- Agriculture/chapel/farmstead/brand generators stay `inTexas`-gated. The
  shoulder gets none of them. Padre being `inTexas` means it legitimately gets
  scenery/animal chunks — do not gate the island out.
- Named NPCs, landmarks, brands and haunts stay Texan. SPI is scenery, not a
  133rd city. Road-job endpoints stay Texan (`GEO.cities` by name); **charters
  may cross** (airport-id resolution). Flavor text is the only place that names
  the world across the line — `CARGO.note` exists exactly for that, and
  `missions.mjs` asserts every `from`/`to` resolves, because an unresolvable name
  fails silently.
- **Glenrio and Whites City are NOT in `GEO.bandCities`** (both unincorporated) —
  hand-built vignettes. Never resolve them by city name anywhere.

**Geo & classification**
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

**Rendering & systems**
- **Decks are not roads** — the causeway, the Carlsbad park road, Anthony's Main
  St and the Texhoma line: `nearestRoad` is null on them, traffic never drives
  them, and the drive cap there is the offroad/beach path.
- **Gulf is ONE vertex-colored plane** (`name: 'gulf'`) — never add a second
  near-coplanar water plane. THREE.Color stores linear-sRGB: checks compare
  linear values, not the hex you typed.
- **sky.js owns every light.** Night glows are shared materials with `fog: false`
  and opacity driven off `ATMOS.night` — reuse them, never mint per-prop glow mats.
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
- **A new chatter kind needs THREE rows, not two**: a `POOLS` pool, a `VOICES`
  entry, *and* a `ROLL_OK` row in radio.js. Miss the last one and the aircraft
  enters `radio.sources`, fills lines on demand, and is never picked — silent,
  with nothing failing. (Cost W7 a real bug; the wiring sentinel caught it.)

**Verification**
- **Aviation.mjs flakes under any parallel `-j`** (real-loop-timing checks; seen
  at -j4 and -j6, always clean standalone) — one standalone rerun before assuming
  a regression. Same policy for the shop suite's Lacy-yip check.
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
