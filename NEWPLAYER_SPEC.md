# New Player Experience — track spec

## Executive summary

**Goal**: make the first ten minutes self-explanatory and the game restartable
like a real save — today a new player gets one vanishing toast, a hidden
wall-of-keys help panel, and every session restarts from scratch.

**Wave 1 — the player gets:**
- a title screen on every boot: Continue (resume exactly where you were —
  position, mode, time of day) / New game
- Esc → Save & quit to title
- (mostly under the hood: the game's boot rebuilt around the screen)

*Expected result: boot lands on a title screen, not in the game. Continue
restores position, heading, mode, altitude, clock; Save & quit returns to
title with state written. Session close loses nothing. All existing verify
suites keep passing via the harness bypass. Presentation is a plain
skeleton — polish comes in W2.*
*Suggested setup: Sonnet 5, effort high.*

**Wave 2 — the player gets:**
- a one-time intro card explaining the game, with a skip for experienced
  players
- a few staged tips during the first minutes of play
- a hand-picked exciting starting spot for new games
- the title screen dressed up: slow aerial view of the live world, rotating
  Texas fact

*Expected result: new game: intro card (skippable), curated start, staged
tips, none of it shown twice per slot. Title screen sits over the live-world
drift with a rotating fact.*
*Suggested setup: Fable 5, effort high.*

**Wave 3 — the player gets:**
- one-time hints the first time something is encountered (an NPC, a city,
  dusk, an airport, the state line)
- a reorganized help menu, sectioned by topic
- a Guide in the menu that re-shows the intro and every tip, anytime
- a visible Settings panel (sound, text size, compass, guide arrow, building
  size) on pause and title

*Expected result: every feature announces itself on first encounter, once per
save. All taught content stays readable in the Guide. All five settings
visible and labeled; no unlabeled keybinds left.*
*Suggested setup: Fable 5, effort high.*

**Wave 4 — the player gets:**
- three save slots with names, progress summaries, rename and delete
- settings that belong to each slot, so people sharing the machine don't
  disturb each other
- backup a slot to a file and restore it

*Expected result: three named, isolated slots — saves and settings both
per-slot; writing to one never touches another. Legacy save migrates to
slot 1. Any slot exports to a file and restores from one.*
*Suggested setup: Sonnet 5, effort high.*

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
- **Skip**: the concept card offers **Skip intro & tips** for experienced
  players — marks all of `save.seen` at once for that slot (no card, no
  toasts, no hints, ever); skipping mid-tutorial has the same total effect.
  Per-slot only, never remembered across slots. The Guide keeps everything
  skipped readable, so the skip is never a trap.
- **Back to title**: the pause screen (Esc) gains one action — **Save & quit
  to title**: writes the resume state and re-shows the title screen (slots,
  rename, delete, new game, Continue). Never loses anything — same state a
  browser close preserves. Ships in W1 with the title screen; its full
  purpose (slot switching) arrives with W4.
- **Title presentation**: the title screen sits over a slow aerial drift of
  the live world (attract mode — the game sells itself before a key is
  pressed) and rotates one "Did you know" line drawn from the existing fact
  pools (landmarks, critters, agriculture). No new fact writing.
- **New-game start**: a fresh slot starts at a curated iconic, dense spot
  (candidate: San Antonio approach, Alamo minutes away) so the first city,
  first landmark, and first collectible happen naturally inside the
  tutorial's first minutes. Exact spot chosen in W2.
- **Settings panel**: the five hidden keybind settings (mute, UI text size,
  compass, guide arrow, brand-building size) become a visible labeled
  Settings section on the pause and title screens. Panel ships in W3
  (storage-agnostic); W4 slots the storage underneath it.
- **Export/import**: back up a slot to a file / restore from file, on the
  title screen — insurance against browser-data loss. First candidate to
  push to BACKLOG.md if W4 runs long.
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

### W1 — Boot plumbing (Sonnet 5, high)
- Title screen skeleton every boot: game name, Continue (with progress
  summary) / New game. Plain presentation — W2 dresses it.
- **Resume**: Continue restores last position, heading, mode, altitude,
  clock (`save.at`, written on a slow interval + pagehide).
- **Save & quit to title** on the pause overlay (writes `save.at`, re-shows
  the title screen — respects the GOTCHAS pause/menu freeze law).
- **Harness bypass** built and proven here: all existing suites keep passing;
  new `tools/checks/onboarding.mjs` drives the screen explicitly.
- Slot UI is not in this wave — single-save until W4, layout reserves the
  slot rows.
Budget: code + checks, no shots, grep-first.

### W2 — First-run experience (Fable 5, high)
- Concept card on first boot — 1:100 real Texas, V cycles Drive/Fly/Walk,
  what to collect, "H for help anytime" — with Start / **Skip intro & tips**
  actions.
- 3–4 staged tutorial toasts in play (try V; first city visit; first
  collectible; press P), skippable mid-stream.
- Curated new-game starting spot (exact spot chosen in-wave; candidate:
  San Antonio approach).
- Title screen dressing: live-world attract drift + rotating Texas fact
  (existing fact pools, no new writing).
Budget: code + checks in onboarding suite, **one** staged shot of the title
screen (legibility judgment via Copilot + Bruno), grep-first.

### W3 — Contextual hints, help restructure, Guide, Settings (Fable 5, high)
- One-time first-encounter hints via `save.seen`: first NPC in range (E),
  first city edge (M/map), first dusk (legends), first airport apron (fly
  hint), first band crossing (passport). Reuse the existing
  `interactHint`/toast surfaces — no new DOM system.
- Help panel sectioned (Driving / Flying / Menus / Goals).
- **Guide**: a help-panel section that replays the concept card and lists
  every tutorial toast + hint in one browsable place.
- **Settings panel** on pause + title: the five hidden toggles, visible and
  labeled (storage-agnostic — W4 slots the keys underneath).
Budget: code + checks in onboarding suite, no shots, grep-first.

### W4 — Named save slots + per-slot settings (Sonnet 5, high)
- 3 slots on the boot screen, each row showing name + summary
  (cities/landmarks/bank) or "empty"; New game asks the name; rename and
  delete (confirm) on the row.
- Storage: save + the four settings keys become per-slot; `lonestar-slot` is
  the only global key; legacy keys migrate to slot 1 once.
- shop/missions already read the save object, so the blast radius is
  gameplay.js + hud.js/brands.js settings reads + main.js boot order.
- **Export/import**: slot → file / file → slot on the title screen (backlog
  candidate if the wave runs long).
Budget: code + checks (slot isolation: write in slot 2, assert slot 1
untouched; settings isolation; migration check), no shots, grep-first.

## Track close
Fold into ROADMAP.md, graduate surviving gotchas (harness-bypass rule, slot
key scheme, resume-write cadence) into GOTCHAS.md, sweep BACKLOG.md, delete
the briefing block.
