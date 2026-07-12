# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: verify-harness Phase 2 — split `aviation.mjs` (1627 lines,
  67 checks across waves 1–5 + A/B) into per-wave shards so it stops being the
  ~24.5 s pole of the new parallel pool. Target full run **~30 s → ~20 s**.
  Phase 1 (the pool itself, `-j` worker fan-out + fresh-context isolation)
  shipped 2026-07-12, commit 4d88588.
- **Recommended setup**: model **Sonnet 5**, effort **high** — structural
  runner + suite-file plumbing (shard export + queue-unit scheduling), no
  content/register writing. Flag it if the running model differs.
- **Budget**: code only, no new game features. `aviation.mjs` exports
  `shards = [{name, run}]` (wrap each wave's checks in an in-place arrow fn +
  a back-compat serial `default` that runs them in order); teach `verify.mjs`
  to schedule a sharded suite as N queue units, each with its own WEIGHTS
  entry. Then **15× co-scheduled stress at the default `-j`, zero flakes** —
  the wave-A/B chatter checks land in higher concurrency. Grep-first, no
  screenshots.
- **Then**: at session end delete this block and resume the **3D chrome road
  shields** wave (deferred briefing below; spec `ROAD_SHIELDS_3D_SPEC.md` still
  valid — only pushed behind this tooling task).

Gotchas carried over:
- Fresh-context-per-suite is load-bearing (suites must stay hermetic). Each
  shard gets its own fresh game, so re-do per-wave setup (`aviation.despawnAll`,
  `setDay`/`setWeather('clear')`) at the top of each shard's `run`.
- The only cross-wave binding is `const aus` (was ~line 206); re-declare it in
  each shard that references it (waves 2–5 do).
- Keep the back-compat `default` so `node tools/verify.mjs aviation` still runs
  all 67 checks as one serial unit.
- RAM is the harness ceiling, not cores — more shards = more concurrent boots;
  the default already caps `-j` at cores/2 ∧ free-RAM. Confirm all 159 green +
  the 18-run stress bar before commit. Phase 2 design notes live in BACKLOG.md.

---

## Deferred wave: 3D chrome road shields (resume after Phase 2)
- **Scope**: the arcade visual upgrade to the HUD route markers — turn the
  flat-canvas shields (shipped 2026-07-12, commit 6f3836c) into 3D chrome.
  Full spec in `ROAD_SHIELDS_3D_SPEC.md` (resolved calls locked there).
- **Recommended setup**: model **Sonnet 5**, effort **high** — structural
  HUD/canvas plumbing + per-frame wiring + numbers-not-pixels verify.
- **Budget**: code + the 4 verify checks (sway-sign-tracks-steering,
  night-flips-wireframe, raster-is-cached, no-compass-overlap) in
  `tools/checks/hud.mjs`. No screenshots, grep-first. Two phases
  (A chrome face → B motion+night+verify); ship A as wave 1 if B overruns.

Gotchas (from the shields spec):
- `player.tilt` is tiny in DRIVE (±0.09) — GAIN it or the sway is invisible;
  verify the *sign*, tune the *magnitude*.
- Put `animateShield` outside main.js's `__skipRender` guard or it won't tick
  headless (sway check reads a frozen value).
- Enlarge + perspective rotate can drift into the compass — the "never
  overlaps" check is mandatory, at high UI scale too.
- Leave `parseShield` and its clean-refs-only fall-through untouched; the 3
  existing shield checks must stay green.

---

Gotchas for whoever touches `hud.js` next:
- Road shields only parse clean "PREFIX ###" refs (`parseShield`) — messy
  municipal names like "Southwest Loop 410" intentionally fall through to
  the plain text line; don't try to make the regex swallow those.
- `#hud-speed`/`#hud-mode` offsets (index.html) are rem-based on purpose so
  their gap scales with UI-scale text growth — if either block grows taller,
  bump the other's `bottom` in rem too, and rerun the "never overlaps" hud
  check before shipping.

---

Background context for the session:

We're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture
+ commands + gotchas). `MODULES.md` has per-module grep anchors — prefer
grep + a targeted read over whole-file reads. `ROADMAP.md` is history;
`BACKLOG.md` holds all other queued work and pending playtests.

Key facts:
- **Repo is private, GitHub Pages is deleted** (intentional) — the game is
  not currently live/public. Verify locally only.
- Local dev: `python3 -m http.server 8317`; verify headlessly with
  **`node tools/verify.mjs`** (now a parallel pool; compact; `-v` per-check,
  `-j N` sets width). Add checks to `tools/checks/*.mjs`, never throwaway
  scripts.
- Verify at *natural* play values (ugly mid-drive headings, parked-truck
  distances, off-axis approaches), not convenient ones.
- If I report something broken after an update, suspect my browser cache
  first (hard refresh — python http.server sends no cache headers).
- **Ask before coding** — present an implementation plan and wait for
  the go-ahead.
