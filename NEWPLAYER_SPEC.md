# New Player Experience — track spec

Goal: make the first ten minutes self-explanatory. Today a new player gets one
vanishing boot toast and a hidden wall-of-keys help panel; there is no concept
intro, no first-encounter guidance, and one anonymous save.

Decided with Bruno 2026-07-17 (before any wave codes):

- **Intro style**: one blocking title/concept card at first boot, then
  non-blocking staged tutorial toasts during play. Never a card sequence.
- **Boot screen**: appears **every** session (Continue / New game) — permanent
  home for save slots. One keypress/click to enter the game.
- **Save slots**: **3 slots + delete** (with confirm). Existing
  `lonestar-roam-save-v1` migrates to slot 1. No rename.
- Resolved by spec (defaults): returning players (non-empty save) never see the
  intro card or tutorial toasts; hints fire once per save; device preferences
  (`lonestar-arrow`, `lonestar-compass`, `lonestar-ui-scale`,
  `lonestar-brand-scale`) stay **global**, not per-slot — only the progress
  save is slotted.

## Hard requirements (all waves)

- **Harness bypass**: the verify harness boots fresh contexts; a blocking boot
  screen would hang every suite. main.js must auto-enter (skip the title
  screen, select the active slot) when the harness flag is present, and the
  boot screen object must live on `__game` so the `debug`/onboarding suite can
  drive it explicitly (`select`, `newGame`, `delete`). Same honesty rule as
  debug.js: logic always built, only presentation gated.
- **Save extends with new keys only** (GOTCHAS law). Tutorial/hint state is one
  additive key: `save.seen = { intro, hintE, hintTravel, ... }`. No existing
  key changes shape; rose indices and gear levels untouched.
- **Freeze semantics**: the boot screen shows before the sim starts — it is
  pre-loop, not the `'menu'` freeze; Esc/pause law in GOTCHAS applies only
  after entry.
- Every wave ships its Tours entries + a forcing debug action for anything
  gated (first-run state is save-gated → the action resets `save.seen` /
  stages the empty-save path).

## Waves

### W1 — Boot screen + first-run intro (Fable 5, high)
Title screen every boot: game name, Continue (default, shows progress summary)
/ New game; first boot instead shows the concept card — 1:100 real Texas,
V cycles Drive/Fly/Walk, what to collect, "H for help anytime" — then drops
into the game and runs 3–4 staged tutorial toasts (try V; first city visit;
first collectible; press P for travel/jobs). `save.seen` added. Slot UI is
**not** in this wave — the screen is single-save until W3, but its layout
reserves the slot rows.
Budget: code + checks (new `tools/checks/onboarding.mjs`), **one** staged shot
of the title card (legibility judgment via Copilot + Bruno), grep-first.

### W2 — Contextual hints + help restructure (Fable 5, high)
One-time first-encounter hints via `save.seen`: first NPC in range (E), first
city edge (M/map), first dusk (legends), first airport apron (fly hint), first
band crossing (passport). Reuse the existing `interactHint`/toast surfaces —
no new DOM system. Help panel sectioned (Driving / Flying / Menus / Goals),
still one H keypress, rem-based sizing.
Budget: code + checks in onboarding suite, no shots, grep-first.

### W3 — Save slots (Sonnet 5, high)
3 slots on the boot screen, each row showing summary (cities/landmarks/bank) or
"empty"; delete with confirm. Storage: `lonestar-roam-save-v1` becomes
per-slot (`…-s1/-s2/-s3`) + `lonestar-slot` active pointer; legacy key
migrates to slot 1 once. gameplay.js `SAVE_KEY` becomes a resolved value at
boot — shop/missions read the save object, not the key, so the blast radius is
gameplay.js + main.js boot order. Prefs stay global (decided above).
Budget: code + checks (slot isolation: write in slot 2, assert slot 1
untouched; migration check), no shots, grep-first.

## Track close
Fold into ROADMAP.md, graduate surviving gotchas (harness-bypass rule, slot
key scheme) into GOTCHAS.md, sweep BACKLOG.md, delete the briefing block.
