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
  **`node tools/verify.mjs`** — full run ~35 s for all 63 checks, compact
  output (`-v` for per-check lines). Add checks to `tools/checks/*.mjs`,
  never throwaway scripts. Sim waits are cheap: `t.simStep` / `t.step` run
  synchronously and the harness skips rendering — full rules incl. the
  one-real-loop-sentinel-per-system requirement in CLAUDE.md
  "Verification rules".
- When I report something broken after an update, suspect my browser cache first
  (hard refresh — python http.server sends no cache headers).
- Verify at *natural* play values (ugly mid-drive headings, parked-truck
  distances), not convenient ones — several bugs only showed up there.
- **Ask before coding** — present the plan and wait for the go-ahead.

State: everything through 2026-07-11 is shipped — ROADMAP.md holds the full
list. Latest: **Haunted Texas wave 1** (`src/haunts.js`) — seeded country
chapels + cemeteries (`chapelAt` in world.js), night cemetery lights with
approach-fade, Enchanted Rock ghost fires, midnight chapel bell, 👻 Legends as
the visible 9th collectible (`save.legends`), Terlingua + Presidio La Bahía
landmarks (26 total), rumor lines.

Today's candidates (my pick order):

1. **Aviation wave 1 — Fields** (`AVIATION.md` is the new priority track,
   all open calls decided 2026-07-11 — **read that doc before coding**; it
   preempts everything below): static airports — curated ~20-site table with
   real runway headings authored from OSM `aeroway=runway` geometry
   (Overpass **GET**, not runway numbers), all-airport static geometry
   merged by material (not per-site prop groups), pad-at-max-hAt + skirts +
   ribbon-offset markings, night beacon + `ATMOS.wind` windsock, pure
   `airportClear(x,z)` exclusions wired into cities.js placement /
   ScenerySystem / `chapelAt`, ✈ glyphs on `renderMapLayer`, new
   `tools/checks/aviation.mjs` suite (pad bounds, determinism,
   building-exclusion, windsock).
2. **Haunted Texas wave 2 — the apparitions** (planned & approved 2026-07-11;
   follow wave-1 patterns in haunts.js, +4 legends → 6):
   - **Ghost Stampede at Stampede Mesa** (~33.55 N, −101.17 W caprock rim near
     Crosbyton — the legend behind "Ghost Riders in the Sky"). Gate on
     **storm weather + deep night**: translucent emissive longhorns
     (~24, instanced) + a rider looping a hand-laid rim path (maritime-lane
     idiom), `fog: false` to punch through storm fog, opacity pulses with
     sky.js lightning. The marquee event.
   - **El Muerto** — headless-rider *silhouette* in the south brush country,
     UFO-style rare rolls with a hotspot near San Diego/Ben Bolt (~27.7 N,
     −98.2 W); gallops parallel at 60–90 units, darts away if pressed (saucer
     state machine on a horse); synth hoofbeats by distance.
   - **La Llorona** — white figure + synth wail at hand-laid riverbank anchors
     (Rio Grande, San Antonio River, Woman Hollering Creek I-10 crossing
     ~29.56 N, −98.06 W); vanishes on approach.
   - **Chupacabra** — night lurker near the real Cuero/Elmendorf sightings;
     mangy hairless-coyote build, flees the horn (`scare` idiom). Fact:
     every confirmed one was a coyote with mange. So far.
   - Verify: parallel-heading + distance-band over time (El Muerto), rim
     displacement (stampede), vanish-on-approach opacity curves, horn-flee.
3. **Gamepad analog steering** (~1 hour, biggest driving-feel win) — Gamepad
   API axes/buttons alongside keyboard; poll in `Player.update`;
   `t.stubGamepad` is already in the harness waiting.
4. **Big-map click-to-set-waypoint** — generalize the mission target pipeline
   (map diamond + compass diamond + guide arrow) to a map click.

Haunted Texas wave 3 (later): San Antonio ghost tracks push (~29.34 N,
−98.44 W — only event touching player physics; strict no-push-by-day check),
town churches in `cities.js` (reuse `mkChapel`), USS Lexington "Blue Ghost"
landmark with night glow, painted-church landmark (St. Mary's High Hill).

---

## Notes for me (the human)

- **Debug menu for playtesting**: open http://localhost:8317/?debug=1 and press
  `` ` `` (backquote) — buttons for day/night/midnight, haunt the nearest
  cemetery, ghost fires, saucer/Lubbock lights, the bat show, and weather picks.
  Not available without the URL param (public build stays honest).
- **Playtest the reworked UFO encounter** (debug 🛸 button starts it instantly):
  the saucer now shadows you low and close in all three modes for 40–70 s —
  judge the standoff/height (the `tgt` block in `src/ufo.js`: 36 units out,
  13 above ground) and whether the headlight/lantern flicker reads. Try it
  walking (lantern), driving (headlights + engine sputter), and flying
  (nav lights + prop sputter).
- **Playtest Haunted Texas**: drive ranch roads west of Llano at night till you
  find a glowing cemetery (roughly 1 chapel per 10 chunks; they also show by
  day — white steeple by the road), or just use the debug menu. Judge: wisp size/brightness at parked
  distance (`SphereGeometry(0.26…)` + opacity 0.85 in `src/haunts.js`), the
  approach-fade feel (`FADE_NEAR/FADE_FULL`), the midnight bell mix
  (`bell()` in `src/audio.js`), and whether ~50% haunted nights (`WISP_ODDS`)
  feels right. Enchanted Rock fires: fly there after dark, watch from the base.
- Terlingua + Presidio La Bahía are in the travel menu Landmarks tab if you
  don't want to drive to Big Bend.
- **Playtest the shop loop** (still pending): engine I + tires I worth $350?
  Lacy's yips, crate perch, weather-radio window, paint colors at night —
  knobs in `src/shop.js` / `src/sky.js` (`forecastT`) / `src/audio.js`.
- Still pending playtest: traffic honk chorus on I-35, flares at night,
  headlight throw, wildlife voices mix, UI scale at 170%+ on 1080p.
- Saves are per-browser (localStorage): localhost and the public URL have
  separate progress. 👻 Legends row is always visible in the score panel.
- N mutes audio; the 👽 counter appears on H after a first sighting.
