# Lone Star Roam — next session kickoff

Copy-paste this prompt to start the next session:

---

We're continuing work on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Read `CLAUDE.md` (architecture + commands + gotchas) and
`ROADMAP.md` (what's done / what's left) before touching code; `MODULES.md` has
per-module grep anchors — prefer grep + a targeted read over whole-file reads.

Key facts:
- **Live & public**: https://ghostsysoutnull.github.io/lone-star-roam/ — every push
  to `main` deploys there within ~2 min, so verify before committing.
- Local dev: `python3 -m http.server 8317`; verify headlessly with
  **`node tools/verify.mjs`** — full run ~25 s for all 53 checks, compact
  output (`-v` for per-check lines with durations). Add checks to
  `tools/checks/*.mjs`, never throwaway scripts. Sim waits are cheap:
  `t.simStep` (player physics) / `t.step` (any system) run synchronously, and
  the harness skips rendering (`__skipRender`) — full rules incl. the
  one-real-loop-sentinel-per-system requirement in CLAUDE.md
  "Verification rules".
- When I report something broken after an update, suspect my browser cache first
  (hard refresh — python http.server sends no cache headers).
- Verify at *natural* play values (ugly mid-drive headings, parked-truck
  distances, long-idle traffic mixes), not convenient ones — several bugs only
  showed up there.
- **Ask before coding** — present the plan and wait for the go-ahead.

State: everything through 2026-07-11 is shipped — ROADMAP.md holds the full
list. Latest additions: the **🛒 Shop** (3-tier engine/tires/headlights
upgrades as `player.perks`, Lacy the Blue Lacy truck dog, weather radio with a
25–45 s `sky.forecast` window, paint shop with 7 truck colors) and a verify
harness speed pass (steppers + `__skipRender` + compact output: 6 min → ~25 s).

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
- **Playtest shop wave 2**: buy the radio and drive the Gulf coast (weather
  flips often there) — is the 25–45 s warning window (`forecastT` in sky.js)
  long enough to be useful mid-haul? Try a couple of paint coats; judge the
  maroon and black in daylight vs. night (hexes in `PAINTS`, `src/shop.js`).
- **Playtest the missions loop**: deadlines fair in rain/at night? Knobs in
  `src/missions.js` `genOffers()`: deadline `dist / 24 + 60`, pay `50 + km × 1.2`,
  rush odds 0.25; payout multipliers in `deliver()`.
- Still pending playtest: traffic honk chorus parked on I-35 in Austin
  (`src/traffic.js` knobs); flares at night over dark country (`src/flares.js`
  knobs + `audio.js` `flare()`); truck headlight throw (intensity in vehicle.js
  `animate()` DRIVE branch); wildlife voices mix (`howl`/`rattle`/`gobble` in
  `src/audio.js`); UI scale at 170%+ on 1080p (compass tape may crowd the top —
  cap it if playtest says so).
- Saves are per-browser (localStorage): localhost and the public URL have
  separate progress. Mission bankroll shows in the score panel (💵) and on H.
- N mutes audio; C toggles compass; the 👽 counter only appears on H after a
  first sighting (hunt near Lubbock/Marfa past midnight, clear weather).
- Adding real arterials to more cities (Waco, Laredo, Midland/Odessa…) is a
  two-command job: bbox + `tools/add-metro-streets.mjs` (header documents the
  pattern; Overpass **GET** only, maps.mail.ru mirror for big queries).
