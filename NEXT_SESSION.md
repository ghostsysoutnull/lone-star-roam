# Lone Star Roam — next session kickoff

## Session briefing

*(Auto-greeting per CLAUDE.md — present this at session start, then wait
for Bruno's go-ahead. No copy-paste needed; any first message triggers
it.)*

- **This session**: NPC expansion, **wave 2 of 2 — content authoring**:
  much larger name pools, more profession variety, and more message/
  dialogue variety across gate bystanders, city townsfolk, and the 12
  named characters. Wave 1 (structural: tier-3 bystanders at the two
  public fields, night visibility gated by the nearby city's real
  population, age/profession as real fields wired into the dialog
  subtitle) shipped 2026-07-12, commit de339c1.
- **Recommended setup**: model **Fable 5**, effort **high** — this is
  pool-writing/register-design work, the same shape as the aviation
  chatter waves where Fable 5 was the right call over Sonnet 5's
  table-plumbing sessions. Flag it if the running model differs.
- **Budget**: content pools + checks asserting real variety (e.g. no
  degenerate small pools, spot-check a few generated lines/professions
  read naturally), no shots, grep-first (MODULES.md anchors). The
  plumbing (fields, dialog subtitle, night-gate) is done — this session's
  cost should be almost entirely the pools themselves.
- **Then**: fold this NPC-expansion note into ROADMAP.md and delete this
  briefing block once wave 2 ships.

Gotchas carried over from wave 1 (read before touching `npcs.js`):
- `spawnTownsfolk`/`spawnBystanders` draw look + position from one shared
  seeded stream (`rand`) per city/field — any *new* draw added into that
  loop shifts every later NPC's position/look (breaks the "same seed →
  same world" guarantee players' spatial memory depends on). Wave 1 hit
  this for age and fixed it by giving age its own independent stream
  (`seededRand('age:' + city.name/a.id + ':' + i)`). Do the same for any
  new per-NPC random content in wave 2 — never draw it from `rand`.
- Night-gate threshold (pop > 400,000 = "big city") is mirrored in three
  places: `cities.js:52`, and twice in `npcs.js` (`spawnTownsfolk`,
  `spawnBystanders`) — not exported, keep them in sync if it ever changes.
- Tier-3 bystanders: only Marfa Municipal (`MRF`) and Terlingua Ranch
  (`TRL`) spawn folks — the two private ranch strips (`SSS`, `ARM`) stay
  empty on purpose (their own flavor text calls them private).

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

Non-aviation queued work + pending playtests are in `BACKLOG.md`.
