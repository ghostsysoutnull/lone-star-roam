# Lone Star Roam — next session kickoff

Copy-paste this prompt to start the next session:

---

We're continuing work on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Read `CLAUDE.md` (architecture + commands + gotchas) and
`ROADMAP.md` (what's done / what's left) before touching code.

Key facts:
- **Live & public**: https://ghostsysoutnull.github.io/lone-star-roam/ — every push
  to `main` deploys there within ~2 min, so verify before committing.
- Local dev: `python3 -m http.server 8317`; verify headlessly with Playwright from
  the scratchpad (`--no-sandbox --enable-unsafe-swiftshader`), driving the game via
  the `window.__game` debug hook (player/gameplay/sky/npcs/trains/ufo/animals/
  traffic/missions/GEO).
- When I report something broken after an update, suspect my browser cache first
  (hard refresh) — python http.server sends no cache headers.
- Verify at *natural* play values (ugly mid-drive headings, parked-truck
  distances, long-idle traffic mixes), not convenient ones — several bugs only
  showed up there.

Everything through 2026-07-10 is shipped, including **missions**: a 💼 Jobs tab
in the travel menu (P) offers delivery hauls between real cities — load at the
origin (crates ride in the truck bed), beat a distance-scaled deadline, earn a
bankroll. ×1.5 road bonus for never flying, half pay when late, fast travel
locked mid-haul, 🔥 rush jobs, rain slows the player 22%.

Today's candidates (my pick order):

1. **Gamepad analog steering** (~1 hour, biggest driving-feel win) — Gamepad API
   axes/buttons alongside the keyboard: left stick steer, triggers throttle/brake,
   buttons for mode/interact/map. Poll in `Player.update`; keep keyboard working.
2. **Truck upgrades** — something to spend the mission bankroll on: top speed /
   acceleration / better headlights tiers, bought from the Jobs tab. Save under
   new keys; apply as multipliers in the DRIVE branch of `vehicle.js`.
3. **Big-map click-to-set-waypoint** — click on M-map → gold marker + compass pip
   (the missions diamond in `hud.js` already does the marker pattern; generalize it).

If those finish early: real highway A* routing (route lines on the map,
road-distance mission pay), or mission variety (multi-stop hauls, fragile-cargo
jobs that punish offroading).

---

## Notes for me (the human)

- **Playtest the missions loop**: take a short haul and a 🔥 rush job. Do
  deadlines feel fair in rain/at night? Knobs in `src/missions.js` `genOffers()`:
  deadline `dist / 24 + 60` (higher divisor = tighter), pay `50 + km × 1.2`,
  rush odds 0.25. Payout multipliers live in `deliver()`.
- Also still pending playtest: park on I-35 in Austin and judge the traffic honk
  chorus — knobs in `src/traffic.js` (`DENSITY_DIVISOR` 190, honk fuse times,
  2.8 s pull-around patience).
- Saves are per-browser (localStorage): localhost and the public URL have
  separate progress. Mission bankroll shows in the score panel (💵) and on H.
- N mutes audio; C toggles compass; the 👽 counter only appears on H after a
  first sighting (hunt near Lubbock/Marfa past midnight, clear weather).
- Adding real arterials to more cities (Waco, Laredo, Midland/Odessa…) is a
  two-command job: bbox + `tools/add-metro-streets.mjs` (header documents the
  pattern; Overpass **GET** only, maps.mail.ru mirror for big queries).
