# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: Energy (`ENERGY_SPEC.md`), wave 2 of 6 — well sites
  (`wellSiteAt` + pump/tank-battery/rig kit), scatter **replacement**
  (old uniform Permian stream retired, never re-keyed), the **offshore
  rebase** (real `platforms[]` replace the 7 hand-laid Shelf platforms;
  Far Rig + the Malaquite-skyline sentinel **re-anchor**, not delete),
  night gas flares, the **Energy log** (11th collectible) + first hero
  sites (Spindletop, a Permian tank farm), and the **approach
  announcer** (real name + info fragment on HUD proximity, armed/re-arm
  per site, unnamed sites silent). Wave 1 (fetch + bake + `geo.js`
  wiring + `energy.mjs` checks) shipped 2026-07-17, commit `<fill in
  after commit>`.
- **Recommended setup**: model **Fable 5**, effort **high** — content +
  composition. Flag it if the running model differs.
- **Budget**: code + checks, **one shot** (Permian flares at night),
  grep-first.
- **Then**: rewrite this briefing for W3 (wind farms + solar, Sonnet 5,
  high — one staged shot: turbine row at dusk).

Gotchas carried over: offshore `platforms[]` (227 sites: 153 major / 74
minor clusters) is name-poor by real data — only 10/153 majors carry a
real `name`, 151/153 carry `operator`, **none carry `ref`** — so the
announcer's real fallback chain is name → operator → silent, `ref`
essentially never fires despite being baked; design the announcer/log
label around that, not around `ref` showing up. Far Rig
(`maritime.js`'s `FAR_RIG` constant) and the Malaquite-skyline sentinel
re-anchor to the **farthest real major** among those 153, not deleted.
`wellSiteAt` reads `GEO.energy.counties[name].wellKm2` directly — county
records are all-254-present (ag idiom); no join gotcha to carry, wells
outside Texas were already excluded at bake.

Background: we're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture +
commands + gotchas) and grep **`GOTCHAS.md`** — the law book — for the area
you're changing. `MODULES.md` has per-module grep anchors — prefer grep + a
targeted read over whole-file reads. `ROADMAP.md` is history; `BACKLOG.md` holds
queued work and pending playtests; `LEDGER.md` is the per-wave scoreboard.

Key facts:
- **Repo is public and GitHub Pages is live** — pushes deploy to
  https://ghostsysoutnull.github.io/lone-star-roam/. Full verify before
  every code push is mandatory (doc-only diffs skip tests); commits and
  pushes always wait for Bruno's explicit go-ahead.
- Local dev: `python3 -m http.server 8317`; verify headlessly with
  **`node tools/verify.mjs`** (parallel pool, full run ~70 s on this machine;
  use named suites while iterating, then the full run before pushing; compact;
  `-v` per-check, `-j N` sets width). Add checks to `tools/checks/*.mjs`,
  never throwaway scripts.
- Verify at *natural* play values (ugly mid-drive headings, parked-truck
  distances, off-axis approaches), not convenient ones.
- If Bruno reports something broken after an update, suspect browser cache
  first (hard refresh — python http.server sends no cache headers).
- **Ask before coding** — present an implementation plan and wait for the
  go-ahead.
