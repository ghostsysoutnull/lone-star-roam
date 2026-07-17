# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: New Player Experience (`NEWPLAYER_SPEC.md`), wave 3 of 4 —
  contextual hints + help restructure + Guide + Settings: one-time
  first-encounter hints via `save.seen` (first NPC in range → E, first city
  edge → M/map, first dusk → legends, first airport apron → fly hint, first
  band crossing → passport), help panel sectioned (Driving / Flying / Menus /
  Goals), a Guide section replaying the concept card + every tip and hint
  read-only, and a visible labeled Settings panel (mute, UI size, compass,
  guide arrow, brand size) on pause + title. Wave 2 (concept card, staged
  tips, curated SA start, attract drift + rotating fact) shipped 2026-07-17.
- **Recommended setup**: model **Fable 5**, effort **high** — content/register
  wave (hint copy, help/Guide restructure). Flag it if the running model
  differs.
- **Budget**: code + checks in `tools/checks/onboarding.mjs`, grep-first;
  shots per the 2026-07-17 policy — one Copilot-analyzed shot per new visible
  surface (Settings panel, Guide, sectioned help), judged before commit.
- **Then**: rewrite this block for W4 (named save slots + per-slot settings —
  Sonnet 5 high). W4 is the last wave: its session end deletes this block,
  folds the track into `ROADMAP.md`, graduates surviving gotchas into
  `GOTCHAS.md`, and sweeps `BACKLOG.md`.

Gotchas carried over:
- Hints reuse the existing `interactHint`/toast surfaces — no new DOM system
  (spec W3). Follow onboarding.js's pattern: check `seen.all || seen[key]`,
  mark + persist at fire time. `seen.all` (the card's Skip / pause-screen
  skip) must silence W3 hints too — the Skip promise is "no card, no toasts,
  no hints, ever" (spec Decisions).
- The Guide re-presents, never re-arms: card + tips + hints stay readable,
  seen flags untouched.
- Settings panel is storage-agnostic in W3: drive the existing keys
  (`lonestar-arrow`/`-compass`/`-ui-scale`/`-brand-scale` + mute) through the
  same functions the keybinds call; W4 slots the storage underneath.
- The title screen runs a live attract branch in main.js's loop
  (`title.active` gates it; keydown handler swallows all keys while up).
  Anything added to the title (the Settings entry point) is DOM over the
  drift and must not tick game systems. HUD chrome hides via `body.title-up`
  (index.html rule) — new HUD elements should join that selector list.
- `save.seen` is additive-key-only (same law as `save.at`); veteran saves are
  grandfathered `intro=all=true` in gameplay.js's constructor — W3 hints will
  therefore never fire for pre-W2 saves. That is the spec'd behavior.

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
