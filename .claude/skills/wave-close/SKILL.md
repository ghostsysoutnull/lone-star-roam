---
name: wave-close
description: Close a Lone Star Roam wave — the fixed wave-end checklist (performance report, LEDGER line, executive summary, commit gate, briefing rewrite / track-close sweep). Invoke at every wave end, after the closer's full verify is green.
---

# Wave close — the fixed end-of-wave checklist

Run the steps in order. Source of law: `CLAUDE.md` multi-wave protocol steps 3, 5, 6 — this skill is the checklist, not a replacement; on conflict, CLAUDE.md wins.

## 0. Preconditions — do not start the close without all three
- The wave's **single full verify** is green (the closer agent's run; log at `/tmp/lonestar-verify.log`), and `tools/status.sh` is clean.
- Every agent report's `deviations:`/`challenges:`/`open:` lines are triaged (resolve in-wave / escalated to Bruno / BACKLOG with provenance) — no line silently dropped.
- Tours entries for everything the wave added or changed are in `src/tours.js`, each spot guaranteeing its subject.

## 1. Prepare the docs (before the report, folded into the wave commit)
- **LEDGER.md** — append one line: `date | track wave | model | promised vs shipped | full-runs/flakes | ROI`. Model column: `fable` (in-loop) / `fable+sonnet-agent` (handoff) / `fable+sonnet×N` (multi-chunk, N agents). **Row cap ≤300 chars, one clause per cell** — scoreboard, not report.
- **NEXT_SESSION.md** — rewrite the `## Session briefing` block for the next wave (template in CLAUDE.md). **Last wave of a track instead**: delete the block, fold the track into one `ROADMAP.md` entry (spec file stays as history), and sweep the satellites — `BACKLOG.md` header, any doc naming the active track, graduate surviving gotchas into `GOTCHAS.md`, `NEXT_SESSION.md` back to kickoff-only.

## 2. Wave-end performance report (in-chat)
- **Always**: promised vs delivered (briefed scope/budget vs shipped) + the honest ROI verdict (worth its actual cost, stated plainly; mislabeled value called out).
- **Only when anomalous** (deviated from the briefed budget or a standing rule): time breakdown, verify economics (runs/flakes, reasoned vs brute-forced), budget adherence (shots, whole-file reads, reruns), detours (cost + whether surfaced first). A clean wave says "no anomalies".
- **If pilots rode the wave** (grill, hooks, multi-chunk, scout): one keep/kill verdict each, with the deciding evidence.

## 3. Executive summary — the message's last block
Non-technical, feature/result-driven, stoic labeled lines (Result / Open). What changed in the game and why it matters. Nothing technical below it.

## 4. Commit gate
Report first; **commit and push only on Bruno's explicit go-ahead** — plan approval is not commit approval. The wave commit carries code + checks + tours + the step-1 docs together. Trailer: `Co-Authored-By:` line per the running model — verify the model before writing the trailer (the 2026-07-21 attribution erratum).
