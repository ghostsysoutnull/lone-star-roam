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
  traffic/GEO).
- When I report something broken after an update, suspect my browser cache first
  (hard refresh) — python http.server sends no cache headers.
- Verify at *natural* play values (ugly mid-drive headings, parked-truck
  distances, long-idle traffic mixes), not convenient ones — several bugs only
  showed up there.

Everything through 2026-07-10 is shipped: real roads (arterials in 9 metros) /
rivers/terrain/counties/rails, the real night sky, polished traffic (supply-based
density, cars that brake/honk/pull around you, junction turns, night/rain/rural
mixes), trains, ships, wildlife, weather, day/night, audio, NPCs + townsfolk,
UFOs, 24 landmarks, travel menu, compass.

Today I want to build **missions** — the last big feature, turning the sandbox
into a game:

- Delivery jobs between real cities: a job board in the travel menu (P) offering
  hauls like "BBQ from Lockhart to Amarillo" — real origin, real destination,
  distance-scaled pay and deadline.
- Cargo rides visibly in the truck bed; deadline pressure interacts with what's
  already there: night, weather (rain slows traffic and you), terrain.
- Payout on delivery + a running bankroll in the save; spend it on truck upgrades
  (top speed / acceleration / headlights?) or keep it as score at first — start
  simple, one clean loop before any economy.
- Persistence: extend the localStorage save carefully — never change the rose RNG
  or city names; add new keys rather than reshaping existing ones.
- Design for the fiction we have: NPCs could hand out flavored jobs later, but
  v1 is the job board only. Keep FLY mode allowed but pay bonus for driving?
  (decide at design time — discuss trade-offs with me before building).

If missions stall or finish early, fallbacks: gamepad analog steering (Gamepad
API, ~1 hour, biggest driving-feel win) or big-map click-to-set-waypoint.

---

## Notes for me (the human)

- Playtest request from the traffic session: park on a busy freeway (I-35 Austin)
  and judge the honk chorus — charming or annoying? Knobs: honk fuse times in the
  blocking branch of `src/traffic.js`, overall density `DENSITY_DIVISOR` (190,
  lower = busier), tier `weight`/`nightCut` table, pull-around patience (2.8 s).
- Saves are per-browser (localStorage): localhost and the public URL have separate
  progress.
- N mutes audio; C toggles compass; the 👽 counter only appears on H after a
  first sighting (hunt near Lubbock/Marfa past midnight, clear weather).
- Adding real arterials to more cities (Waco, Laredo, Midland/Odessa…) is a
  two-command job now: bbox + `tools/add-metro-streets.mjs` (header documents the
  pattern; Overpass **GET** only, maps.mail.ru mirror for big queries).
