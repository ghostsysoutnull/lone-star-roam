# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: New Player Experience (`NEWPLAYER_SPEC.md`), wave 2 of 4 —
  first-run experience: one-time concept card (Start / Skip intro & tips),
  3-4 staged tutorial toasts, curated new-game starting spot (candidate: San
  Antonio approach), title screen dressing (live-world attract drift +
  rotating Texas fact). Wave 1 (boot plumbing: title screen, `save.at`
  resume, save & quit to title, harness bypass) shipped 2026-07-17.
- **Recommended setup**: model **Fable 5**, effort **high** — content/register
  wave (concept card copy, tip staging, fact rotation). Flag it if the
  running model differs.
- **Budget**: code + checks in `tools/checks/onboarding.mjs`, **one** staged
  shot of the title screen (legibility judgment via Copilot + Bruno), no
  other shots, grep-first.
- **Then**: rewrite this block for W3 (contextual hints, help restructure,
  Guide, Settings panel — Fable 5 high).

Gotchas carried over:
- Title screen freeze design (W1 call): render loop does **not** start until
  the title is dismissed (`main.js` `boot()`, `await title.awaitChoice()`
  before `renderer.setAnimationLoop`) — the literal "pre-loop" reading, no
  freeze flag. W2's live-world attract drift needs the loop running *behind*
  the title, so this is the first thing to revisit: either start the render
  loop earlier and freeze sim only (the option-A shape considered and
  deferred in W1), or find another way to render a drift shot without the
  full loop. Decide before coding.
- New-game spot: `main.js` passes `() => player.spawnAt(austin.x, austin.z +
  12)` into `new TitleScreen(...)` as the New Game callback — swap this for
  the curated spot once chosen.
- `title.js`'s `apply(choice)` is the seam for both the concept card (fires
  after `'new'`) and `onboarding.mjs`'s direct-drive tests — extend it,
  don't fork a second path.
- Harness bypass flag is `window.__harness` (set in `tools/verify.mjs`);
  `save.seen` (intro + per-hint flags) is additive-key-only, same law as
  `save.at`.

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
