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

Task: **Aviation wave 3 — Tower radio, the flagship** (full spec in
`AVIATION.md`; waves 1–2 shipped 2026-07-11). Summary: audio.js
`radio(text, opts)` — squelch click + syllabic gibberish burst (sawtooth
~120 Hz through a wobbling ~900 Hz bandpass, ~4 Hz syllable AM), constant
volume while receivable, ducks under the engine, **no TTS**. HUD subtitle
line (rem-based, ~5 s fade, one-line queue). Receivable in FLY within ~250 u
of a towered field, or anywhere with the shop's aviation band radio (~$500
→ `perks.avionics`). Content is all true sim state: ATIS from
`runwayInUse`/`windFrom` + live `ATMOS`/`sky.forecast`; AI ops narrated off
`aviation.flights` phase edges (slots carry `n` for "Lone Star N"
callsigns); player flow radar-contact → cleared-to-land → touchdown →
**logbook stamp** (`save.airports`, additive key — the 10th collectible, ✈️
row + counts); go-around when the player parks on the runway (reuse the
wave-2 `divert` machinery); `ATMOS.ufo` chops radio gain + one spooky
template. Verify at natural values: ugly off-axis approach, parked-short
distance, stamp exactly once, not receivable in DRIVE without the perk,
subtitle DOM text, ATIS wind matches the seeded runway-in-use.

Session end (per wave): fold the shipped wave into ROADMAP.md, advance the
Task block above to the next wave, run `node tools/verify.mjs`, then commit.

---

## Notes for me (the human)

- Debug menu: http://localhost:8317/?debug=1 + backquote — aviation buttons
  (departure / heli / blimp / test radio) get added as their waves ship.
- Saves are per-browser (localStorage): localhost and the public URL keep
  separate progress. N mutes audio.
- Pending playtests from pre-aviation features are listed in `BACKLOG.md`.
