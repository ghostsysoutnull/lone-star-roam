# Lone Star Roam — next session kickoff

## Session briefing

*(Auto-greeting per CLAUDE.md — present this at session start, then wait
for Bruno's go-ahead. No copy-paste needed; any first message triggers
it.)*

- **This session**: Aviation observability, **implementation session 2
  of 3 — "chatter + visuals"**: A3 the chatter engine (new `chatter.js`
  — helis and planes, per-type voice registers, factual-by-construction
  templates, ~25–45s budget, rare player-ref delight lines), A5's live
  half (aircraft proximity tags in `hud.js`, sharing the chatter
  scanner's source enumeration), and A4 medical pad stops (new
  `padstop:` stream). Session 1 shipped 2026-07-12: A1 HUD airport
  line, A2 callsigns, A6 airlines + hub-weighted assignment + tail
  tints, A5's static half (gate signs, map codes) — see ROADMAP.md.
  Full spec: `AVIATION_OBSERVABILITY_SPEC.md`.
- **Recommended setup**: model **Fable 5**, effort **high** — this is
  the session's real design work (voice registers, template pools,
  budget/priority ordering), unlike session 1's table-plumbing. Flag
  it if the running model differs.
- **Budget**: code + checks, no shots, grep-first (MODULES.md
  anchors). No known visual-proof exception this session (tags are
  DOM text, not new geometry).
- **Then**: session 3 (Wave B: airport NPCs + chatter enrichment,
  model per session-2 experience). Update this block at each wave's
  session end; delete it when the spec fully ships.

---

Background context for the session:

We're continuing work on **Lone Star Roam** (`~/claude-area/devel/tx`), the
Three.js free-roam Texas game, on the **aviation priority track**. Before
touching code read `CLAUDE.md` (architecture + commands + gotchas) and
**`AVIATION.md`** (the full 5-wave plan + design stance + cross-cutting
rules; all open calls settled 2026-07-11). `MODULES.md` has per-module grep
anchors — prefer grep + a targeted read over whole-file reads. `ROADMAP.md`
is history; `BACKLOG.md` holds all queued non-aviation work.

Key facts:
- **Repo is private, GitHub Pages is deleted** (intentional, as of
  2026-07-12) — the game is not currently live/public. Verify locally only.
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

Task: **Aviation observability wave A, session 2 of 3 — "chatter +
visuals"** (full spec in `AVIATION_OBSERVABILITY_SPEC.md`; waves 1–5 of
the original 5-wave aviation track, plus charter jobs and the helicopter
detail/loft passes, all shipped 2026-07-11/12 — see ROADMAP.md). Session 1
shipped 2026-07-12: A1 HUD airport line (`airports.js` `fieldNear`), A2
per-type callsigns + A6 airlines (`aviation.js` `AIRLINES` table,
hub-weighted `identityFor()` shared by `mkSlot` and `force()`, new
`airline:`/`tail:` streams), A5's static half (gate sign boards — 9th
global mesh, one canvas atlas — and big-map codes in `hud.js drawBig`).
This session: **A3 the chatter engine** (new `chatter.js` — scanner frame,
per-type voice registers for all 4 heli kinds + jets + GA, template pools
filled from live context so lines are factual by construction, ~25–45s
budget with ops preempting casual, rare player-reference delight lines,
callsign+route subtitle header, per-type synth voice — design settled
with Bruno 2026-07-12), **A5's live half** (aircraft proximity tags in
`hud.js` sharing the chatter scanner's ~60-unit source enumeration — one
enumeration, two consumers), and **A4 medical pad stops** (`rotors.js`/
`airports.js` — new `padstop:${key}:${day}` stream, transit→descend→
touchdown→dwell→lift at the home city's pad, cap accounting unchanged).
Wave B (airport bystander NPCs + heli-aware/context-enriched townsfolk
chatter) is session 3, queued behind this one in the same spec.

Notes carried from wave 5 (still relevant if this session's movers need
anything new): `src/rotors.js` has `HeliSystem`/`BlimpSystem` (four
kind-scoped `{body, rotor}` InstancedMesh pairs in `this.meshes`, reuse
this per-kind-mesh-pool pattern) and `src/military.js` has
`MilitaryAirSystem` (candidates array, `force(kind)`/`despawnAll`, global
airborne cap idiom with per-kind `weight` — its `nasa` candidate now
carries `cs: 'NASA 9-0-1'`, ready for A3 to voice via the direct-range
window, deferred from session 1 since Ellington isn't in `AIRPORTS`).
`radio.js` stays standalone, never breaks `aviation.update`'s signature —
A3 needs a new optional param or setter for `helis`, decided at
implementation to match how `radio.js` already receives `aviation`.
Other à-la-carte candidates already scoped in with Bruno, not part of this
spec: Sheppard T-38 touch-and-go pattern circuits (own session — needs
real new closed-pattern design), Marfa gliders. Still deferred/unscoped:
crop duster dawn runs, a 13th bespoke NPC — confirm scope before picking
these up.

Session end (per wave): fold the shipped wave into ROADMAP.md, advance the
Task block above to the next wave, run `node tools/verify.mjs`, then commit.

---

## Notes for me (the human)

- Debug menu: http://localhost:8317/?debug=1 + backquote — aviation buttons
  (departure / arrival / test radio / heli / blimp all shipped).
- Saves are per-browser (localStorage): localhost and the public URL keep
  separate progress. N mutes audio.
- Pending playtests from pre-aviation features are listed in `BACKLOG.md`.
