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
  the `window.__game` debug hook (player/gameplay/sky/npcs/trains/ufo/animals/GEO).
- When I report something broken after an update, suspect my browser cache first
  (hard refresh) — python http.server sends no cache headers.
- Verification lesson from last session: test at *natural* play values (ugly
  mid-drive headings, parked-truck distances), not convenient ones.

Everything through 2026-07-10 is shipped: real roads/rivers/terrain/counties/rails,
the real night sky, traffic, trains, ships, wildlife, weather, day/night, audio,
NPCs + townsfolk, UFOs, 24 landmarks with markers, travel menu, compass.

Today I want to work on: **[PICK ONE]**
1. **Missions** — the last big build: delivery jobs between real cities (job board
   in the travel menu, cargo with deadlines, weather/night as obstacles, pay →
   maybe truck upgrades). Turns the sandbox into a game.
2. **Gamepad support** — analog steering via the Gamepad API; biggest driving-feel
   win for an hour of work.
3. **Tuning pass from my play notes** — [list your gripes: steering feel, camera
   distances, audio mix levels, collectible density, etc.]
4. **Polish backlog** — big-map click-to-teleport/waypoint, mobile touch controls,
   real arterials for mid-size cities (El Paso, Corpus, Lubbock…).

---

## Notes for me (the human)

- Saves are per-browser (localStorage): localhost and the public URL have separate
  progress.
- N mutes audio; C toggles compass; the 👽 counter only appears on H after a
  first sighting (hunt near Lubbock/Marfa past midnight, clear weather).
- If a session needs the raw OSM/DEM source data again, it's re-fetchable — the
  pipeline commands are in CLAUDE.md; use Overpass **GET** (POST is blocked) and
  the maps.mail.ru mirror for big queries.
