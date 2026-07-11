# Lone Star Roam — next session kickoff

Copy-paste this prompt to start the next session:

---

We're continuing work on **Lone Star Roam** (`~/claude-area/devel/tx`), the
Three.js free-roam Texas game, on the **aviation priority track**. Before
touching code read `CLAUDE.md` (architecture + commands + gotchas) and
**`AVIATION.md`** (the full 5-wave plan + design stance + cross-cutting
rules; all open calls settled 2026-07-11). `MODULES.md` has per-module grep
anchors — prefer grep + a targeted read over whole-file reads. `ROADMAP.md`
is history; `BACKLOG.md` holds all queued non-aviation work.

Key facts:
- **Live & public**: https://ghostsysoutnull.github.io/lone-star-roam/ —
  every push to `main` deploys there within ~2 min, so verify before
  committing.
- Local dev: `python3 -m http.server 8317`; verify headlessly with
  **`node tools/verify.mjs`** (compact; `-v` for per-check lines). Add
  checks to `tools/checks/*.mjs`, never throwaway scripts. Sim waits are
  cheap (`t.simStep` / `t.step`); full rules incl. the
  one-real-loop-sentinel-per-system requirement in CLAUDE.md
  "Verification rules".
- Verify at *natural* play values (ugly mid-drive headings, parked-truck
  distances, off-axis approaches), not convenient ones.
- If I report something broken after an update, suspect my browser cache
  first (hard refresh — python http.server sends no cache headers).
- **Ask before coding** — present the wave's implementation plan and wait
  for the go-ahead.

Task: **Aviation wave 2 — Departures** (full spec in `AVIATION.md`; wave 1
Fields shipped 2026-07-11). Summary: `src/aviation.js` `AviationSystem` —
seeded per-game-day flight schedule (`seededRand('avn:APT:day:slot')`, new
stream), gate→taxi→takeoff→cruise→land lifecycle between real airport pairs,
aircraft as InstancedMesh types (airliner ~6 u tier 1, GA single ~3 u tiers
2–3), altitudes below the cloud deck, ≤4 fixed-wing near the player, night
thins to rare red-eyes, storm/dust ground stops from live `ATMOS`.
Runway-in-use must come from the existing `windFrom(day)` stream
(airports.js) + `ATMOS.wind` speed. Verify: schedule determinism, departure
*gains* AGL over sim time / arrival loses it, never-despawn-in-sight,
ground-stop under forced storm, `plane-moves` real-rAF sentinel. Debug
action: `departure now`.

Session end (per wave): fold the shipped wave into ROADMAP.md, advance the
Task block above to the next wave, run `node tools/verify.mjs`, then commit.

---

## Notes for me (the human)

- Debug menu: http://localhost:8317/?debug=1 + backquote — aviation buttons
  (departure / heli / blimp / test radio) get added as their waves ship.
- Saves are per-browser (localStorage): localhost and the public URL keep
  separate progress. N mutes audio.
- Pending playtests from pre-aviation features are listed in `BACKLOG.md`.
