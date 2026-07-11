# Lone Star Roam — next session kickoff

Copy-paste this prompt to start the next session:

---

We're continuing work on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Read `CLAUDE.md` (architecture + commands + gotchas) and
`ROADMAP.md` (what's done / what's left) before touching code.

Key facts:
- **Live & public**: https://ghostsysoutnull.github.io/lone-star-roam/ — every push
  to `main` deploys there within ~2 min, so verify before committing.
- Local dev: `python3 -m http.server 8317`; verify headlessly with
  **`node tools/verify.mjs [suite…]`** (checked-in harness; deps persist in
  `~/.cache/lonestar-verify`). Add checks to `tools/checks/*.mjs`, never write
  throwaway Playwright scripts. Wait in physics time (`t.simWait`), assert
  numbers not screenshots — full rules in CLAUDE.md "Verification rules".
- When I report something broken after an update, suspect my browser cache first
  (hard refresh) — python http.server sends no cache headers.
- Verify at *natural* play values (ugly mid-drive headings, parked-truck
  distances, long-idle traffic mixes), not convenient ones — several bugs only
  showed up there.

Everything through 2026-07-10 is shipped, including **missions**: a 💼 Jobs tab
in the travel menu (P) offers delivery hauls between real cities — load at the
origin (crates ride in the truck bed), beat a distance-scaled deadline, earn a
bankroll. ×1.5 road bonus for never flying, half pay when late, fast travel
locked mid-haul, 🔥 rush jobs, rain slows the player 22%. Guidance: compass-tape
diamond + G-toggled 3D guide arrow (both red when late). Wildlife got a variety
pass: 15 species (pronghorn/javelina/turkey/gator/rattlesnake/pelican + the
Austin bat emergence at dusk), nocturnal/diurnal hours, herd startles, coyote
howls, Space horn in DRIVE. A real bug fell out: fleeing animals had an
inverted heading and were charging the player — distance-over-time assertions
caught it where screenshots hadn't.

Session 4 (2026-07-10, later) shipped the **token-efficiency pass** instead of
features: `tools/verify.mjs` harness + 5 suites (drive/hud/missions/traffic/
wildlife — 34 checks green, including the full mission payout loop and the
flee-distance regression), `t.stubGamepad`/`t.key` input stubs ready for the
gamepad feature, screenshot policy + session-workflow rules in CLAUDE.md,
plan + status in `TOKEN_EFFICIENCY.md` (only M4, the module index, remains).
Also shipped: **night vehicle lights** with a `lights` suite and
`t.setWeather`/`setDay`/`setNight` harness helpers. The truck's decal ground
pool read flat in play, so DRIVE now runs a **real PointLight** ahead of the
nose (`player.headLight`, lantern-style — DRIVE/WALK are exclusive so it's
still one dynamic light total), rain-boosted, plus the fake beam cones; knobs
(intensity/height/lead) in vehicle.js `animate()` DRIVE branch. FLY keeps the
decal landing pool (under 16 AGL); freight locos keep beam cones. The plane
also got **illumination flares** (F in FLY): a recharging 3-flare rack,
ballistic tracer → chute pops at apex → slow wind-drifting descent, real
pooled PointLights (fixed count, no shader recompiles) lighting the terrain
~14 s; knobs at the top of `src/flares.js`. Session boot/pre-commit status is
one command now: **`tools/status.sh`** (git sync + dirty tree + NEXT_SESSION
freshness + syntax). **Ask before coding** — present the plan and wait for
the go-ahead.

Session 5 (2026-07-10, later still) shipped the **UI text size setting** (QoL):
+/- (or numpad) steps all HUD/menu text ±10% from 90% to 200%, persisted in
`lonestar-ui-scale` (separate from the save). Mechanism: all UI CSS in
`index.html` is now **rem-based** (1rem = 10px at 100%) and `hud.uiScale`
retunes the root font-size — so any new UI styles must use rem for font sizes
and panel dimensions (rule recorded in CLAUDE.md's hud.js bullet). Minimap/
compass/dialog/travel panels grow with the text (canvas labels scale sharply
for free — they render at 2× and are displayed via CSS size). Pushed live.

Session 6 (2026-07-11) shipped the **Shop** — the bankroll finally buys things.
🛒 Shop tab in the travel menu (P): three 3-tier upgrade lines at $350/900/1800
(engine +8/16/24% road top speed; ranch tires offroad 20→32 + rain drag
22%→8%; headlights 30→80 lamp intensity) and **Lacy the Blue Lacy** ($750) —
rides the truck bed, perches on the cargo crates mid-haul, heels to the cowboy
in WALK, yips a beat after the Space horn. Mechanism: `save.gear` (new save
key) → `applyGear()` in `src/shop.js` → `player.perks` multipliers read by
vehicle.js's DRIVE branch; all price/effect knobs at the top of `shop.js`.
New modules `shop.js`/`dog.js` (both in CLAUDE.md's module graph), `dog` on
`__game`, `shop` verify suite (upgrades asserted as *driven* speeds
over sim time, dog follow as distance-over-time). Wave 2 (same session):
**weather radio** ($400) — weather picks now hold as `sky.forecast` for
25–45 s before blending (no visible change without the radio); owners get a
📻 countdown on the HUD clock line + a toast when the forecast breaks. And
the **paint shop** ($250 a coat): 7 truck colors as a swatch row, worn coat
in `save.gear.paint`, recolors `truck.userData.bodyMat`. 53 checks green.
Also a verify-speed pass: new `t.simStep(s[, autopilot])` harness helper steps
player physics synchronously (player-physics only — render-loop systems still
need `t.simWait`); full run dropped from ~6 min to ~2 min of checks, with the
drive suite's walk-cap check kept on `simWait` as the frame-loop smoke test.

Today's candidates (my pick order):

1. **Gamepad analog steering** (~1 hour, biggest driving-feel win) — Gamepad API
   axes/buttons alongside the keyboard: left stick steer, triggers throttle/brake,
   buttons for mode/interact/map. Poll in `Player.update`; keep keyboard working.
   `t.stubGamepad` is already in the harness waiting.
2. **Big-map click-to-set-waypoint** — click on M-map → target marker. The whole
   rendering stack already exists for missions (map diamond + compass-tape diamond
   in `hud.js` via `hud.mission`, 3D guide arrow in `missions.js`); generalize
   "current target" so a map click feeds the same pipeline.
3. **Mission variety** — multi-stop hauls, fragile-cargo jobs that punish
   offroading; with upgrades in, the economy can support bigger payouts.

If those finish early: real highway A* routing (route lines on the map,
road-distance mission pay), or more shop lines (rose dowser that pings near
uncollected roses was the brainstorm favorite).

---

## Notes for me (the human)

- **Playtest the shop loop**: earn a few hauls, buy engine I and tires I —
  does the speed gain *feel* worth $350? Prices/effects are knob arrays at the
  top of `src/shop.js`. Buy Lacy, honk at a herd, then park, walk (V) and watch
  her hop out and heel; judge the yip mix level (`bark()` in `src/audio.js`)
  and the crate perch during a haul.
- **Playtest wave 2**: buy the radio and drive the Gulf coast (weather flips
  often there) — is the 25–45 s warning window (`forecastT` in sky.js) long
  enough to be useful mid-haul? Try a couple of paint coats; judge the maroon
  and black in daylight vs. night (hexes in `PAINTS`, `src/shop.js`).
- **Playtest the wildlife pass**: honk (Space) at a longhorn herd vs. a deer
  herd; hunt the dusk bats in Austin (~18:40–20:15 game time, P → Cities →
  Austin then fly east along the river); listen for the coyote howl at night in
  the west; find the rattlesnake (rare, Trans-Pecos — it rattles first). Judge
  the howl/rattle/gobble mix levels in `src/audio.js`.
- **Playtest the missions loop**: take a short haul and a 🔥 rush job. Do
  deadlines feel fair in rain/at night? Knobs in `src/missions.js` `genOffers()`:
  deadline `dist / 24 + 60` (higher divisor = tighter), pay `50 + km × 1.2`,
  rush odds 0.25. Payout multipliers live in `deliver()`.
- Also still pending playtest: park on I-35 in Austin and judge the traffic honk
  chorus — knobs in `src/traffic.js` (`DENSITY_DIVISOR` 190, honk fuse times,
  2.8 s pull-around patience).
- **Playtest the flares**: fly low at night, fire (F) over dark country and
  over a town; judge brightness/burn time/sink rate (knobs atop
  `src/flares.js`: `LIGHT_I` 55, `BURN` 14, `CHUTE_FALL` 2.1, rack recharge
  10 s) and the launch thump / ignite spark mix (`audio.js` `flare()`). Also
  judge the new truck headlight throw at night (intensity 30 in vehicle.js
  `animate()` DRIVE branch).
- **Playtest the UI scale**: tap +/- through the range; at 170%+ on 1080p the
  compass tape starts crowding the top-left location text and the score panel —
  decide whether to cap the compass width (slight text stretch) or stop panel
  growth past ~150% while fonts keep growing.
- Saves are per-browser (localStorage): localhost and the public URL have
  separate progress. Mission bankroll shows in the score panel (💵) and on H.
- N mutes audio; C toggles compass; the 👽 counter only appears on H after a
  first sighting (hunt near Lubbock/Marfa past midnight, clear weather).
- Adding real arterials to more cities (Waco, Laredo, Midland/Odessa…) is a
  two-command job: bbox + `tools/add-metro-streets.mjs` (header documents the
  pattern; Overpass **GET** only, maps.mail.ru mirror for big queries).
