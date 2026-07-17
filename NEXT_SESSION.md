# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: New Player Experience (`NEWPLAYER_SPEC.md`), wave 4 of 4 —
  named save slots + per-slot settings: three named slots on the title screen
  (name asked at New game, rename, delete with confirm), legacy
  `lonestar-roam-save-v1` migrates to slot 1, the four comfort keys
  (`lonestar-arrow`/`-compass`/`-ui-scale`/`-brand-scale`) become per-slot
  (only the active-slot pointer stays global), slot export/import to file
  (first candidate for BACKLOG.md if the wave runs long). Wave 3 (hints,
  help sections, Guide, Settings panel) shipped 2026-07-17.
- **Recommended setup**: model **Sonnet 5**, effort **high** — structural
  storage-plumbing wave (slot table, key migration, no new copy). Flag it if
  the running model differs.
- **Budget**: code + checks in `tools/checks/onboarding.mjs`, grep-first;
  shots per policy — the reworked title slot row is the one visible surface.
- **Then**: W4 is the last wave. Its session end deletes this block, folds the
  track into one `ROADMAP.md` entry, graduates surviving gotchas into
  `GOTCHAS.md`, and sweeps `BACKLOG.md` + any doc naming the track.

Gotchas carried over:
- **Slot storage goes UNDER the five functions, never beside them.** The W3
  Settings panel and the keybinds both call `audio.toggleMute` /
  `hud.uiScale` / `hud.toggleCompass` / `missions.toggleArrow` /
  `brands.setScale` and read live state back — reroute those functions'
  storage and every surface follows; `settings.js` itself needs no change.
- Switching slots after boot must run the *apply* paths, not just swap keys:
  `hud.ui`/compass are read from localStorage at construction,
  brands' `SCALE` is a module-level let applied at spawn (go through
  `setScale`), `missions.arrowOn` at construction.
- Save law: additive keys only (`save.name` is new); rose indices/gear
  untouched; `save.seen` (incl. `all`) is per-slot — the Skip promise never
  crosses slots. Veteran grandfathering (`intro=all=true` for non-empty
  saves) must survive migration to slot 1.
- Harness bypass: auto-enter must select the active slot; slot logic
  (`select`/`newGame`/`rename`/`delete`) lives on `__game.title` for the
  suite (hard requirement in the spec).
- The title screen's `.slots` DOM has two `— reserved —` placeholders waiting
  to become slots 2/3; the Settings panel is mounted into `#title` (and
  `#paused`) at boot and `title.onShow` refreshes its labels.
- `tools/stage-shot.mjs` auto-enters (`__harness`) and takes
  `--eval '<js>'` for UI staging — stage the title explicitly via
  `--eval "__game.title.show()"`.

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
