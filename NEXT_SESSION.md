# Lone Star Roam — next session kickoff

## Session briefing

*(Auto-greeting per CLAUDE.md — present this at session start, then wait
for Bruno's go-ahead. No copy-paste needed; any first message triggers
it.)*

- **This session**: Aviation observability, **implementation session 3
  of 3 — Wave B, "people"**: B1 airport bystanders (2–3 townsfolk-build
  figures at tier-1/2 gates, spotter / waiting-relative / off-duty-pilot
  roles, lines pulled from live `aviation.flights`/`runwayInUse`/field
  facts) and B2 aviation-aware NPC context (`getContext` grows a `heli`
  field; townsfolk + named characters gain openers for live helis, the
  forecast, the active job, progress milestones). Sessions 1–2 shipped
  2026-07-12 — see ROADMAP.md. Full spec: `AVIATION_OBSERVABILITY_SPEC.md`
  (delete the spec + this block when B ships and the spec is folded in).
- **Recommended setup**: model **Fable 5**, effort **high** — session 2
  confirmed the fit: pool-writing and register design is where the
  session's quality lives, and the integration surface (npcs.js dialog
  assembly) is delicate about voice consistency across the 12 named
  characters.
- **Budget**: code + checks, no shots, grep-first (MODULES.md anchors).
  No visual-proof exception expected (bystanders reuse townsfolk builds;
  everything asserts through dialog strings and spawn positions).
- **Then**: the spec is done — fold it into ROADMAP.md, delete
  `AVIATION_OBSERVABILITY_SPEC.md` and this briefing block (BACKLOG.md
  still holds non-aviation queued work; the à-la-carte aviation extras —
  Sheppard T-38 pattern, Marfa gliders — need a fresh scope check with
  Bruno first).

---

Background context for the session:

We're continuing work on **Lone Star Roam** (`~/claude-area/devel/tx`), the
Three.js free-roam Texas game, on the **aviation priority track**. Before
touching code read `CLAUDE.md` (architecture + commands + gotchas) and
`AVIATION_OBSERVABILITY_SPEC.md` (Wave B section + verify plan; all calls
settled). `MODULES.md` has per-module grep anchors — prefer grep + a
targeted read over whole-file reads. `ROADMAP.md` is history; `BACKLOG.md`
holds all queued non-aviation work.

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

Task: **Aviation observability wave B — "people"** (spec §Wave B). Session
2 shipped 2026-07-12: A3 chatter engine (`chatter.js` pools + `radio.js`
scanner/budget/edges — `radio.sources` is the shared source enumeration),
A4 medical pad stops (`padAt`, `padstop:` stream, `advancePadSortie`),
A5 live half (hud `updateTags` + subtitle headers), per-type synth voices
(`audio.radio` `opts.voice`). Gotchas that carry into B:

- `npcs.js getContext` is a callback built in main.js — B2's `heli` field
  queries `HeliSystem.candidates` (airborne kind + distance); helis are on
  `radio.helis` too, but read the system directly, not radio.
- B1 bystanders: `airports.js` exports per-site `gate`; reuse
  `spawnTownsfolk` body builds, hide after dark like townsfolk
  (`ATMOS.night > 0.6` in the spec's check). Next real arrival/departure
  for a field comes from `aviation.flights` (materialized) and
  `daySchedule` (the day's full list) — resolve city names via `AIRPORTS`.
- The chatter scanner ignores NPCs entirely — no coupling; B only *reads*
  aviation/heli state at interact time, same idiom as the named
  characters' weather/night context.
- Chatter checks pin `radio.chatterT`/`srcPh` — if a B check needs a quiet
  radio, set `g.radio.chatterT = 999` rather than despawning sources.

Session end: fold Wave B into ROADMAP.md, delete
`AVIATION_OBSERVABILITY_SPEC.md` (spec fully shipped) and the briefing
block above, run `node tools/verify.mjs`, commit.

---

## Notes for me (the human)

- Debug menu: http://localhost:8317/?debug=1 + backquote — aviation buttons
  (departure / arrival / test radio / heli / blimp all shipped).
- New this session: park near any airborne aircraft (≤60 units) to hear
  scanner chatter and see its name tag; medical helis sometimes land at
  their city's airport pad; subtitles now show who's talking.
- Saves are per-browser (localStorage): localhost and the public URL keep
  separate progress. N mutes audio.
- Pending playtests from pre-aviation features are listed in `BACKLOG.md`.
