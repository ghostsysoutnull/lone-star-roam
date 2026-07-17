# New Player Experience — track spec

## Executive summary

- **Goal**: make the first ten minutes self-explanatory and the game restartable
  like a real save — today a new player gets one vanishing toast and a hidden
  wall-of-keys help panel, and every session restarts from scratch at the
  default spawn.
- **Features (10 total)**: title screen every boot · first-run concept card ·
  staged tutorial toasts · resume at last position/mode/time · one-time
  contextual hints · sectioned help panel · in-menu Guide (re-view the intro
  card and every tip anytime) · three save slots · slot naming + delete ·
  per-slot settings.
- **Plan**: 3 waves — W1 boot screen + intro + resume; W2 hints + help + Guide;
  W3 named slots + per-slot settings.

## Decisions (Bruno, 2026-07-17)

- **Intro style**: one blocking title/concept card at first boot, then
  non-blocking staged tutorial toasts during play. Never a card sequence.
- **Boot screen**: appears **every** session — permanent home for save slots.
  One keypress/click to enter the game.
- **Resume**: the game restarts at the last position and locomotion mode used
  (plus heading, altitude when flying, and time of day — a flight resumes
  mid-air, a sunset resumes at sunset). `R` remains the failsafe reset.
- **Slots**: 3, **named** (asked at New game, renameable), delete with confirm.
  Existing `lonestar-roam-save-v1` migrates to slot 1.
- **Per-slot settings**: `lonestar-arrow`, `lonestar-compass`,
  `lonestar-ui-scale`, `lonestar-brand-scale` are **slotted**, not global —
  slots model different people sharing the machine, so comfort settings belong
  to the slot. Nothing stays global except the active-slot pointer.
- **Guide**: the menu re-presents everything a first-time player is shown —
  the concept card plus the full tip list, browsable anytime (not re-armed).
- Returning players (non-empty slot) never see the intro card or tutorial
  toasts; hints fire once per slot.

## Hard requirements (all waves)

- **Harness bypass**: the verify harness boots fresh contexts; a blocking boot
  screen would hang every suite. main.js must auto-enter (skip the title
  screen, select the active slot) when the harness flag is present, and the
  boot screen object must live on `__game` so the onboarding suite can drive
  it explicitly (`select`, `newGame`, `rename`, `delete`). Same honesty rule
  as debug.js: logic always built, only presentation gated.
- **Save extends with new keys only** (GOTCHAS law). New additive keys:
  `save.seen` (intro + per-hint flags), `save.at` (resume position/heading/
  mode/altitude/clock), `save.name` (slot name). No existing key changes
  shape; rose indices and gear levels untouched.
- **Freeze semantics**: the boot screen shows before the sim starts — it is
  pre-loop, not the `'menu'` freeze; Esc/pause law in GOTCHAS applies only
  after entry.
- Every wave ships its Tours entries + a forcing debug action for anything
  gated (first-run state is save-gated → the action stages the empty-save
  path / resets `save.seen`).

## Waves

### W1 — Boot screen, first-run intro, resume (Fable 5, high)
Features: title screen every boot (name, Continue with progress summary /
New game); first boot shows the concept card — 1:100 real Texas, V cycles
Drive/Fly/Walk, what to collect, "H for help anytime" — then 3–4 staged
tutorial toasts in play (try V; first city visit; first collectible; press P).
**Resume**: Continue restores last position, heading, mode, altitude, clock
(`save.at`, written on a slow interval + pagehide). Slot UI is not in this
wave — single-save until W3, layout reserves the slot rows.
Budget: code + checks (new `tools/checks/onboarding.mjs`), **one** staged shot
of the title card (legibility judgment via Copilot + Bruno), grep-first.

### W2 — Contextual hints, help restructure, Guide (Fable 5, high)
Features: one-time first-encounter hints via `save.seen` — first NPC in range
(E), first city edge (M/map), first dusk (legends), first airport apron (fly
hint), first band crossing (passport). Reuse the existing `interactHint`/toast
surfaces — no new DOM system. Help panel sectioned (Driving / Flying / Menus /
Goals). **Guide**: a help-panel section that replays the concept card and
lists every tutorial toast + hint in one browsable place.
Budget: code + checks in onboarding suite, no shots, grep-first.

### W3 — Named save slots + per-slot settings (Sonnet 5, high)
Features: 3 slots on the boot screen, each row showing name + summary
(cities/landmarks/bank) or "empty"; New game asks the name; rename and delete
(confirm) on the row. Storage: save + the four settings keys become per-slot;
`lonestar-slot` is the only global key; legacy keys migrate to slot 1 once.
shop/missions already read the save object, so the blast radius is gameplay.js
+ hud.js/brands.js settings reads + main.js boot order.
Budget: code + checks (slot isolation: write in slot 2, assert slot 1
untouched; settings isolation; migration check), no shots, grep-first.

## Track close
Fold into ROADMAP.md, graduate surviving gotchas (harness-bypass rule, slot
key scheme, resume-write cadence) into GOTCHAS.md, sweep BACKLOG.md, delete
the briefing block.
