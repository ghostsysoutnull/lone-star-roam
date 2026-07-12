# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: 3D chrome road shields, wave 1 of 1 — the arcade visual
  upgrade to the HUD route markers. Full spec in `ROAD_SHIELDS_3D_SPEC.md`
  (resolved calls locked there). The flat-canvas shields it builds on shipped
  2026-07-12, commit 6f3836c.
- **Recommended setup**: model **Sonnet 5**, effort **high** — structural
  HUD/canvas plumbing + per-frame wiring + numbers-not-pixels verify, not
  content/register writing. Flag it if the running model differs.
- **Budget**: code + the 4 verify checks (sway-sign-tracks-steering,
  night-flips-wireframe, raster-is-cached, no-compass-overlap) in
  `tools/checks/hud.mjs`. **No screenshots**, grep-first, one-paragraph doc
  updates. Two phases (A chrome face → B motion+night+verify); if B overruns,
  ship A as wave 1 and re-brief B as wave 2.
- **Then**: at session end, delete this briefing block, fold the shipped work
  into one `ROADMAP.md` entry, and rewrite the gotchas below.

Gotchas carried over (from the spec):
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
  **`node tools/verify.mjs`** (compact; `-v` for per-check lines). Add
  checks to `tools/checks/*.mjs`, never throwaway scripts.
- Verify at *natural* play values (ugly mid-drive headings, parked-truck
  distances, off-axis approaches), not convenient ones.
- If I report something broken after an update, suspect my browser cache
  first (hard refresh — python http.server sends no cache headers).
- **Ask before coding** — present an implementation plan and wait for
  the go-ahead.
