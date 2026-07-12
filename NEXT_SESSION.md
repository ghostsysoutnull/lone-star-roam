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

Task: **Aviation wave 4 — Rotors & airships** (full spec in `AVIATION.md`;
waves 1–3 shipped 2026-07-11). Summary: helicopters (instanced, ≤2 airborne
near player) placed by context, not statewide species tables — medical
helipad/occasional-run at tier-1 metro hospitals, news downtown orbit over
the big four (day only), Coast Guard patrolling the maritime `LANE` near
ships, Army pairs near Fort Cavazos/Killeen (region-box gate, animals.js
idiom). Rotor audio: noise chopped at blade frequency (~12 Hz LFO — the
existing `propMod` idiom in audio.js), distance-faded like `bell(d)`.
**Exactly one blimp** (charm piece, not a fleet): fair-weather daytime
wanderer on a seeded per-day route between AT&T Stadium, the Astrodome, and
downtown Austin; ~10 u, ~4 u/s at ~35 altitude; night side-panel scrolling
LONE STAR sign (Reunion-ball glow precedent), moors at a tier-2 field after
dark. Verify: news-orbit radius over time, blimp determinism per day, rotor
audio gain gated by distance, heli count cap. Notes from wave 3: `radio.js`
is standalone (not folded into `AviationSystem`) — any rotor chatter should
follow the same pattern (own module or reuse `TowerRadio`, never break
`aviation.update`'s signature); `aviation.divert(m)` is public if rotor
traffic needs a forced diversion; `airports.js` `onRunway(a,x,z,rad)` is the
pavement-corridor test to reuse for helipad/hover placement.

Session end (per wave): fold the shipped wave into ROADMAP.md, advance the
Task block above to the next wave, run `node tools/verify.mjs`, then commit.

---

## Notes for me (the human)

- Debug menu: http://localhost:8317/?debug=1 + backquote — aviation buttons
  (departure / arrival / test radio shipped; heli / blimp land with wave 4).
- Saves are per-browser (localStorage): localhost and the public URL keep
  separate progress. N mutes audio.
- Pending playtests from pre-aviation features are listed in `BACKLOG.md`.
