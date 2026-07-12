# Lone Star Roam — next session kickoff

*(No session briefing block: the aviation observability spec shipped in
full on 2026-07-12 — waves A and B are folded into ROADMAP.md and the
spec file is deleted. No wave is queued; the next session starts with
Bruno picking direction.)*

Background context for the session:

We're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture
+ commands + gotchas). `MODULES.md` has per-module grep anchors — prefer
grep + a targeted read over whole-file reads. `ROADMAP.md` is history;
`BACKLOG.md` holds all queued work and pending playtests.

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
- **Ask before coding** — present an implementation plan and wait for
  the go-ahead.

The aviation priority track (AVIATION.md's 5 waves + the observability
spec's waves A/B) is **fully shipped**. Candidate next steps, all needing
Bruno's call first:
- À-la-carte aviation extras (Sheppard T-38 pattern, Marfa gliders,
  named GA/charter outfits) — explicitly parked pending a fresh scope
  check.
- Non-aviation queued work + pending playtests in `BACKLOG.md`.

---

## Notes for me (the human)

- Debug menu: http://localhost:8317/?debug=1 + backquote — aviation
  buttons (departure / arrival / test radio / heli / blimp all shipped).
- New this session (Wave B): tier-1/2 airports have 2–3 folks waiting at
  the gate (spotter / relative / off-duty pilot — talk to them; their
  lines track the real schedule, runway, and wind); city NPCs comment on
  a heli overhead, your active job, and the forecast (radio perk).
- Saves are per-browser (localStorage): localhost and the public URL keep
  separate progress. N mutes audio.
- Pending playtests from pre-aviation features are listed in `BACKLOG.md`.
