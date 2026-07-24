---
name: waves
description: Show the queue of remaining waves for the active Lone Star Roam track — one table (wave, model, effort, ≤10-word summary) plus a riders line. Read-only lookup; invoke any time Bruno asks what's coming.
---

# Waves — the remaining-waves table

Read-only, fixed-cost lookup. Budget: grep-first, at most 2 file reads, no
`src/` reads, no edits, no agents — the whole answer is one table.

## Steps

1. **Find the active track**: read `NEXT_SESSION.md`. Its `## Session
   briefing` block names the next wave and the track's spec file (e.g.
   "Map W2 of 4 per `MAP_SPEC.md`").
2. **Read the spec's wave sections** — the *Suggested setup* line per wave
   (handoff yes/no + effort) and the wave's player-facing bullet list.
   Waves before the briefing's "next wave" are shipped; list only the next
   wave and later ones.
3. **No briefing block** (no active track): say so, and render the table
   from `VISION_2026H2.md`'s estimated-waves table for the next queued
   track instead, labeled as estimates.

## Output format (nothing else)

| Wave | Model | Effort | Summary |
|---|---|---|---|

- **Model column convention**: handoff waves → `Fable 5 + Sonnet 5
  wave-coder` (append `2 chunks` / `single` / `bake` when the spec says);
  in-loop waves → `Fable 5 (in-loop)`. The session model is always
  Fable 5; this column shows where the typing happens.
- **Summary**: ≤10 words, player-facing, from the spec's "the player
  gets" bullets — feature words, no module names.
- **Riders line** (one short paragraph after the table): anything riding a
  listed session without being the wave — fix chunks, scout sidecars,
  pilots — pulled from the briefing block and `BACKLOG.md` rider notes.
  Omit the paragraph if there are none.
