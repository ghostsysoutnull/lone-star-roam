# Lone Star Roam — next session kickoff

No queued wave — NPC expansion shipped in full 2026-07-12 (wave 1 structural
de339c1, wave 2 content the same day; details in ROADMAP.md). Pick the next
effort from `BACKLOG.md` (queued work + pending playtests).

Gotchas for whoever touches `npcs.js` next:
- `spawnTownsfolk`/`spawnBystanders`: the shared seeded stream (`rand`) owns
  position/look and exactly ONE name draw per NPC — any new per-NPC random
  content must ride the independent `seededRand('age:'…)` stream or it shifts
  every later NPC's position (breaks players' spatial memory).
- The npcs verify suite pins a pre-expansion spawn-signature baseline
  (`tools/checks/npcs.mjs` `BASELINE`) — if it ever fails, positions drifted;
  don't re-capture it to make the check pass without understanding why.
- Night-gate threshold (pop > 400,000) is mirrored in `cities.js:52` and twice
  in `npcs.js`; the same flag also picks the big-city vs small-town profession
  pool (kept disjoint on purpose — a check asserts it).

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
