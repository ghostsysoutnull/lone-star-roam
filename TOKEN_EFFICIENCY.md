# Token-Efficiency Roadmap — development & testing

Goal: make each dev session spend tokens on *building*, not on re-authoring test
scripts, re-reading files, and re-describing output. Five problem areas, phased
so each milestone pays off on its own.

Status 2026-07-11: **all milestones done.** M1–M3, M5 (2026-07-10):
`tools/verify.mjs` + suites, input stubs (`t.stubGamepad`, `t.key`),
screenshot policy + `t.shot`, CLAUDE.md session-workflow section. M4
(2026-07-11): `MODULES.md` — per-module grep anchors, pointed to from
CLAUDE.md's module graph. Same day, beyond the original plan:
- **Compact verify output** (M1's ≤40-line acceptance re-met at 53 checks):
  one summary line per suite + FAIL detail; `-v` for per-check lines with
  durations ≥1 s — profiling is free, no more timestamp pipelines.
- **Steppers + render skip**: `t.simStep`/`t.step` run physics synchronously
  in-page; `__skipRender` skips only the ~300 ms SwiftShader draw while every
  system still ticks at full rAF speed. Full verify: 6 min → ~25 s wall.
  Rule: one real-loop sentinel per system (CLAUDE.md "Verification rules").
- **NEXT_SESSION.md dieted** to its own rule (candidates + gotchas, no
  session-history paragraphs — ROADMAP.md holds history).

Hard-won harness lessons (already codified in CLAUDE.md): wait in physics time
(`player.simT`), not wall time — headless runs 2–3× slower than the wall clock;
compute expected values from live `ATMOS` (weather is random per boot); keep a
road-free bubble around offroad tests covering the *whole* run distance.

## Addendum 2026-07-22 — cost is turns × context, not printed lines

Session cost scales with **main-session turn count × conversation length**:
every tool call re-sends the whole conversation as input (cache-discounted,
not free), so `| tail -8` on a long command trims almost nothing — the 8
lines are noise next to the context replay carrying them. Observed on the
border-index wave: a 145-tool-call chunk cost its agent ~180k tokens against
its *own* small transcript; the same steps in-loop would have replayed the
full session per call. Levers, in order: (1) fewer main-session turns;
(2) multi-step runs (full verifies, measurement loops, flake confirms)
execute inside agents — including post-review confirm runs after in-loop
edits, sent back to the same agent via SendMessage; (3) batch independent
commands into one call; (4) tee long output to a log and read the tail —
real but the smaller half of the win. Enforcement lines live in CLAUDE.md
(multi-wave protocol step 4, per-wave budget bullet).

---

## M1 — Persistent verification harness (`tools/verify.mjs`)  [item 1 — biggest win]

One checked-in harness replaces the per-session throwaway Playwright scripts.

**Deliverables**
- `tools/verify.mjs` — CLI: `node tools/verify.mjs [suite…]` (no args = all suites).
  - Starts `python3 -m http.server` on a free port, launches headless Chromium
    (`--no-sandbox --enable-unsafe-swiftshader`), waits for `window.__game`.
  - One browser boot per run; suites share the page (teleport between scenarios).
- Core helpers (in the harness, reused by every suite):
  - `check(name, fn)` — runs an assertion, prints exactly one line: `PASS name`
    or `FAIL name — <one-line detail>`. Non-zero exit code on any FAIL.
  - `tp(x, z, mode)` — teleport + settle; `frames(n)` / `wait(s)` — let the sim run;
    `sample(expr, n, dtMs)` — time series of a game value (the pattern that caught
    the charging-deer bug: assert on trends, not snapshots).
  - `setTime(t)` — jump `sky.t` (dusk for bats, night for coyotes/UFO gates).
- Suite registry: `tools/checks/<suite>.mjs`, each exporting named checks.

**Acceptance**
- A full run prints ≤ ~40 lines total for all suites.
- A session verifying a change types one command and reads PASS/FAIL lines —
  zero script authoring for covered areas.

**Effort**: ~1 session to scaffold + first suite.

## M2 — Suite coverage + input stubs  [items 1, 4]

**Deliverables**
- Suites for the shipped systems, asserting *numbers at natural values*
  (mid-drive headings, parked-truck distances, per CLAUDE.md's verification lesson):
  - `drive` — speed caps per road tier, rain slowdown, offroad accel, soft border wall.
  - `missions` — accept→load→haul→deliver round trip, deadline halving, fly-bonus
    loss, fast-travel lock during haul, save keys intact after reload.
  - `wildlife` — flee *increases* distance over time, nocturnal/diurnal gating,
    herd startle propagation, bat window (sky.t 0.775–0.845).
  - `traffic` — density follows road supply, night thinning, honk/pull-around timing.
  - `hud` — compass at ugly headings (e.g. 137°), mission diamond, county line.
- Input stubs living in the harness (written once, reused forever):
  - `stubGamepad(page)` — mock `navigator.getGamepads()` with mutable axes/buttons
    (ready for the gamepad feature).
  - `key(code, downMs)` — synthetic keydown/keyup for action keys.
- Output convention enforced by the helpers: one line per check, numbers rounded,
  never dump objects or per-frame logs.

**Acceptance**
- The three NEXT_SESSION candidates (gamepad, upgrades, waypoint) can each be
  verified by adding checks to an existing suite, not a new script.

**Effort**: ~1 session, incremental after that (each new feature adds its checks).

## M3 — Screenshot policy  [item 2]

Assertions are ~100× cheaper than screenshots and (per the deer bug) more reliable.

**Deliverables**
- Policy line in CLAUDE.md: *verify with numeric/DOM assertions by default;
  screenshot only for genuinely visual judgments (composition, color, animation
  feel), max 1 per judgment, never as the primary pass/fail signal.*
- `shot(name)` helper in the harness so the rare screenshot is one call, saved to
  the scratchpad, taken deliberately.

**Acceptance**: a typical feature-verification turn contains 0 images.

**Effort**: trivial once M1 exists — it's a doc edit + 5-line helper.

## M4 — Grep-first navigation: module index  [item 3]

Stop paying for 500-line file reads to touch 40 lines.

**Deliverables**
- "Where things live" index in CLAUDE.md (or `MODULES.md` if it crowds CLAUDE.md):
  one line per module listing its key functions/knobs by *name* (grep anchors,
  not line numbers — names don't rot): e.g.
  `vehicle.js — Player.update (physics branches: caps/accel knobs), mkTruck
  (userData: headlights/wheels/brakes/cargo), animate (lights/particles)`.
- Keep growing the existing "knobs live in X()" pointers with every feature —
  they're what makes grep-first work.

**Acceptance**: planning a change to a known system needs grep + one targeted
offset/limit read, not a whole-file read.

**Effort**: ~half a session to write the index; a one-line habit per feature after.

## M5 — Keep & formalize what already works  [item 5]

**Deliverables**
- Session-workflow section in CLAUDE.md codifying the habits:
  - Update `NEXT_SESSION.md` at session end (cheap boot beats re-deriving state).
  - Expose every new system on `window.__game` at birth (testability is free at
    creation time, expensive to retrofit).
  - Never change `seededRand` seed strings (determinism = cheap reproduction —
    and players' saves/spatial memory depend on it anyway).
  - End-of-session: run the full verify suite before commit (pushes deploy!).
- Keep NEXT_SESSION.md lean: candidates + gotchas, not history (ROADMAP.md holds history).

**Effort**: doc-only, fold into M3's CLAUDE.md edit.

---

## Suggested order & payoff

| Milestone | Cost | Recurring saving |
|---|---|---|
| M1 harness | ~1 session | Largest: no more per-session test authoring/debugging |
| M2 suites + stubs | ~1 session | Regressions caught for free; new features verify by addition |
| M3 screenshot policy | minutes | ~1k+ tokens per avoided image |
| M4 module index | ~half session | 5–10× cheaper code navigation per task |
| M5 formalized habits | minutes | Keeps boot cost low; protects determinism |

M1+M2 are the real investment; M3–M5 are mostly documentation and ride along.
A reasonable plan: dedicate one session to M1+M3+M5 (harness + doc edits), let
M2 grow a suite per feature session, and write M4's index whenever CLAUDE.md is
next touched.
