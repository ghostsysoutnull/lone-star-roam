# Backlog — queued work

Active track: **none** — the Map planning-tool track closed 2026-07-24
(W2 layer bar; W3 traffic/waypoint/position widget; W4 neighbor-context
bake + single-render minimap + airports-toggle rework — folded into
`ROADMAP.md`, `MAP_SPEC.md` kept as history).
Items below are the queue; **slot export/import queues first** (Map-close
note), the next track is otherwise an open pick.
Direction-level ideas that aren't actionable yet live in `FUTURE.md`.

## Bugs (live in shipped code)

**Standing rule for this section (set 2026-07-21).** The external-agents
effort **files bugs, it does not fix them.** Every defect it surfaces lands
here with full provenance and waits for a future wave to schedule it.
Nothing found by an external reviewer is fixed in the same session it is
found — the finder's job ends at a verified, written-down entry.

**Provenance required per entry**: how it was found, which external model
found it, whether the claim was independently verified in-session, and the
Claude session model that ran the effort. External findings are claims
until a probe confirms them.

- ~~The Sea-Industry W3 `vhf` perk lifted the channel-16 range gate to
  `Infinity`, keying Gulf ship chatter every ~14 s (the global `VHF_FLOOR`)
  anywhere in Texas~~ — shipped 2026-07-24, VHF retune wave: replaced with a
  finite `VHF_HAND_R` (700u ≈ 70 km coastal reach, `src/maritime.js`), shop
  tier text retuned to match ("channel 16 up and down the coast — every
  working boat in the Gulf"). *Provenance*: found by an external session
  report 2026-07-24, verified in-session same day (gate-constant read at
  `src/maritime.js:873`, distance measurement Austin↔routes), session model
  Fable 5, fixed same-session on Bruno's explicit overrule of the
  file-don't-fix rule.

- ~~The `seaGear` debug action (and the `sonar`/`handheld16` tour acts that
  chain it) permanently wrote boat gear into the player's save via
  `gameplay.persist()`~~ — shipped 2026-07-24, VHF retune wave: the grant is
  now transient (the `lacy` pattern) — `applyGear` runs against a spread
  copy of the save, no `save.gear` mutation, no persist call.
  *Provenance*: found by an external session report 2026-07-24, verified
  in-session same day (call-graph read confirmed `gameplay.persist()` at
  `src/debug.js:125`), session model Fable 5, fixed same-session on Bruno's
  explicit overrule of the file-don't-fix rule.

- ~~83 baked wind farms have centers outside the Texas border polygon~~ —
  shipped 2026-07-22, bake-clip rebake wave: shipped `energy.json`
  reproduced byte-identical from raw inputs first (bbox-binning cause
  confirmed), then `build-energy.mjs` clips turbine points to
  `data/border.json` before clustering — farms 225 → 145 (140 byte-identical,
  2 border-straddlers reshaped to their Texas-side turbines, 83 phantoms
  gone), 8,569 out-of-state turbine points dropped. Farm-fidelity check
  drops the scope-out and asserts every baked center passes `inTexas`.
  *Provenance*: found 2026-07-22 by the `wave-coder` agent's farm-sweep
  measurement during the turbine-sampler wave (session model Fable 5).

- ~~15 real wind farms render zero turbines; 5 render more turbines than
  exist~~ — shipped 2026-07-22, commit `3172eb3`: sampler draws from the
  uncapped chunk expectation, `TURBINE_CAP` bounds *accepted* sites,
  farm totals hard-bounded (zero-rendering farms 18→1, the one an evidenced
  legality-exhausted exception); guards live in `tools/checks/energy.mjs`
  (no in-Texas-centered farm renders zero, none exceeds its baked count).
  Strike recorded at the runner-telemetry wave close — the shipping
  session's sweep missed it. Provenance in the block below.
- ~~Turbines skip the city-clearance gate — contradicts written law~~ —
  shipped 2026-07-22 in the same commit (`3172eb3`, `cityClear` gate
  added). Strike recorded at the runner-telemetry wave close.

- ~~Solar field decals ignore road/river/city clearance at render time~~ —
  re-checked 2026-07-22 (bake-clip rebake wave), **not a live bug**:
  the W4.5 per-block restructure kept road+river clearance (each block
  draws only if its whole rectangle clears, `src/world.js` solar branch;
  the energy suite's "per-block clearance law" check covers it). City
  clearance is genuinely absent from the branch but provably vacuous:
  an offline envelope probe found 0 of 547 baked solar sites whose
  farthest block corner can reach any of the 132 city radii
  (`cityRadius(pop)`). No code change; re-open only if a rebake moves
  solar sites or city radii grow.

  **Provenance (all three entries above).**
  - *Found*: 2026-07-21, external-agents gate run. Turbine defects from
    `codex review --commit 5f560fe` (Energy W3) against a leak-proofed
    depth-2 clone with the fix commit unreachable; the over-population
    variant from the text-only round-A rerun of the same diff.
  - *External model*: **`gpt-5.6-sol`** (OpenAI, via `codex` 0.144.5,
    reasoning effort high). The cap defect was reproduced by the same model
    with **no tool access at all**, from diff text alone.
  - *Independently verified in-session*: yes — by replaying the real
    `seededRand` stream against `data/energy.json`. An earlier area-ratio
    proxy gave a wrong figure ("21 render zero"); the deterministic replay
    gives 15. Trust the replay, not the proxy.
  - *Not found by*: **`gemini-3.1-pro-high`** (Google, via `agy` 1.1.5) on
    the identical diff — it returned "No defects found" and explicitly
    certified the broken cap logic as correct.
  - *Claude session model*: **Opus 4.8 (1M context)** (`claude-opus-4-8[1m]`).
  - *Also note*: all three defects survived the original Fable review, the
    Sonnet review, and the full verify suite.
  - *Attribution erratum*: commits `94c8fc5`, `87554e8` and `77768eb`
    (2026-07-21) carry `Co-Authored-By: Claude Fable 5`. That trailer is
    **wrong** — the session ran Opus 4.8. The convention was copied from
    prior commits without checking the running model. Corrected here rather
    than by rewriting pushed history.

  Full method, scoring and the model comparison: `VISION_EXTERNAL_AGENTS.md`
  → Gate result and Round A.

## Dev-process — wave-protocol amendment pilots (queued 2026-07-23)

The amendment itself shipped 2026-07-23 (CLAUDE.md: risk-kernel grading,
JSON contract files, multi-chunk wave-coder with a single closer, challenge
triage; new `data-scout` agent definition). These two ride the **next
handoff wave** as measured pilots, not law:

- **Plan-grill pilot**: before spawning `wave-coder`, one adversarial review
  of the plan + contract file by a strong-model subagent (**pinned Fable 5**,
  effort high — the griller must sit at or above the plan author, and the
  author is Fable; Opus is the fallback only if the pilot's ledger shows the
  grill cost outrunning its findings. One round, structured output: holes /
  ambiguities / unverified assumptions — never a dialogue; Bruno pinned the
  model 2026-07-23). Token rules (Bruno approved 2026-07-23):
  the spawn prompt is the wave-coder spawn text reused verbatim (plan +
  contract-file path — no hand-crafted grill briefing); input budget =
  `tools/law.sh` sweeps for the plan's touched areas + ~2 targeted file
  reads, no repo wandering (contract holes, not code audit); output capped
  ~10 findings, one line each (claim + where it bites), **no proposed
  fixes** (triage and fixes are Fable's); findings-only return — nothing
  restated, no affirmations (an all-clear is zero-weight by law, so
  positive commentary is dead tokens). Handoff waves only; the plan is the full
  contract there, so contract holes are the dominant failure mode. Keep only
  if it finds a real hole; an all-clear carries no evidential weight (the
  Gemini false-all-clear precedent, `VISION_EXTERNAL_AGENTS.md`).
  **Verdict (Map W2 pilot, 2026-07-23): KEEP — now practice for handoff
  waves.** 8 findings: 2 real contract holes (band-city collapse under the
  rider's `inTexas` gate; count-preservation check unsatisfiable off the
  shared RNG stream — each worth a mid-chunk triage round), 5 smaller
  defects, 1 false positive (a "phantom" function that exists —
  `hud.js:1173`). ~63k subagent tokens, ~3 min. Findings verified
  in-session before triage per the external-agents law.
- **Law-enforcing hooks pilot**: one PreToolUse hook blocking
  `verify.mjs`/`status.sh`/`verify-selftest.mjs` piped through `tail`/`head`
  (the 2026-07-22 law) as the trial. If it holds without friction, consider
  a commit-guard hook (block `git commit` absent an explicit go-ahead
  marker) as the second.
- ~~`/wave-close` skill~~ — shipped 2026-07-23 same day it was queued
  (Bruno pulled it forward so Map W2 exercises it rather than creates it):
  `.claude/skills/wave-close/SKILL.md`, the fixed wave-end checklist with
  the `fable+sonnet×N` ledger convention baked in. Still queued:
  **`/wave-plan`** (plan template + contract-file scaffold, lower
  priority — build when a spec session next wants it).

## Dev-process — external-agents retake (parked 2026-07-21, queued 2026-07-22)

- **External-model review lane (codex)** — assessment done, no integration
  built; full strategy, gate/round-A results, probed flags and standing
  constraints in `VISION_EXTERNAL_AGENTS.md`. Settled so far: codex
  (`gpt-5.6-sol`) is the one reviewer (`agy`/Gemini rejected on a false
  all-clear); high precision, poor recall — findings count only after
  in-session verification, an all-clear carries no evidential weight.
  Queued work when retaken, in order: rounds B (breadth backtest outside
  the Energy track) and C (live audit of HEAD, bug-hunting not evaluation),
  then the `tools/review-diff.sh` lockdown wrapper if the profile holds.
  Follows the multi-wave protocol; the vision doc's standing rules (files
  bugs, never fixes; provenance per entry; pin + assert the model family)
  bind any retake. Retake triggers listed in the vision doc.

## Map follow-ups (Map W1 — readable big map — shipped 2026-07-20)

- ~~Seam-pass boot cost (wave-coder chunk)~~ — shipped in `137056b`:
  `classify()` (geo.js) bbox-gates each neighbor-state ring before its
  `inPoly` scan (the `beachAt` idiom), and the W1.2 seam pass (hud.js) is
  gated to 3 padded rectangles around the real seam extents (recorded by a
  one-off full-scan probe — not derived from borderZones flip vertices; the
  El Paso seam's divide sits ~3,800u west of its border-vertex anchor at
  (−3401,−1114)). Measured: wide `renderMapLayer` 11.2s → ~4.4s per boot
  (`classify()`'s bbox gate is the whole win, 385µs/call → ~150µs).
  The residual ~4.4s is its own queued entry below.

- ~~Wide-layer boot cost, residual~~ — shipped 2026-07-22 (wave-coder
  chunk): border segment grid in geo.js (500u cells, bbox-overlap indexing,
  expanding-ring query), `borderDist` + the two internal `nearestDist`
  callers switched; ~10× per call, wide layer 3.3s → ~1.8s solo (pristine
  measure was 3.3s, not the earlier instrumented 4.4s estimate). Guarded in
  shelf.mjs: 300-point equivalence vs brute force + contention-proof
  brute/indexed ratio check (>3×; an absolute wall-clock ceiling flaked
  under `-j4` and was restructured in-loop). New `hud.wideLayerMs` surface.
  **Remaining ~1.8s is NOT borderDist**: ~520ms Tidelands `coastDist`
  field + base layer drawing — separate follow-up if ever worth it, no
  longer the dominant tax.

- **Traffic layer: scheduled aircraft statewide** (filed 2026-07-24,
  Bruno-ratified from a map-review question): the Traffic toggle draws
  ships from the always-live fleet (statewide, ~19 vessels) but aircraft
  only from materialized `radio.sources` near the player (`MAX_AIR` 4) —
  zoomed out, the sky reads empty while the sea reads busy. Fix shape:
  `daySchedule`/`evalFlight` (aviation.js) are pure, so the per-blit
  traffic pass can evaluate every airborne scheduled flight statewide and
  draw its ✈ from closed-form positions — no meshes, no radio sources,
  just math per glyph. Small map-polish wave; extends `trafficDrawn`
  coverage.
- ~~**Map layers wave (W2)** — **scheduled next** (2026-07-23)~~ —
  shipped 2026-07-23 as Map W2, commit `1a55e21` (stale "scheduled next"
  caught 2026-07-24; the track-close sweep missed striking this entry):
  jumped the
  queue ahead of slot export/import (Bruno's call) as the shakedown wave
  for the wave-protocol amendment; briefing in `NEXT_SESSION.md`.
  Toggleable big-map overlays — rails, energy
  sites, airports, counties, ag, collectibles found/unfound. Shape settled
  in the W1 discussion: one pre-rendered canvas per layer composited in
  `drawBig`, so toggles cost nothing at runtime and every future track can
  register a layer. Plus click-to-set-waypoint on the big map (compass +
  minimap pointer to it; reuse the travel menu's haul-lock rule if it ever
  fast-travels). Candidates from the same discussion: visited-vs-unvisited
  city tint, mission origin→target route hint.
- ~~Mexico 25-mi band conversation~~ — discarded 2026-07-22: the topic is
  already covered by `VISION_MEXICO_SHOULDER.md` (vision + future spec); no
  separate conversation needed before that track is scheduled.

## Test harness follow-ups (verify.mjs is now a parallel pool, 2026-07-12)

- **Fix the `tools/judge-shot.sh` Copilot lockdown** (broke mid-Sea-W2,
  2026-07-23): the CLI now rejects the bogus `--available-tools ask_user`
  name ("Unknown tool name") and in that mode announces its FULL default
  tool loadout — the zero-tools trick no longer pins it, intermittently at
  first, then persistently. Find the currently-supported way to run Copilot
  with no tools at all; if none exists, the wrapper must refuse to run
  rather than run unlocked (it must never be able to read repo files —
  GOTCHAS → Verification law). Until fixed, staged shots are judged by
  Bruno's eye only. Provenance: three consecutive failed invocations during
  the Sea W2 legibility rounds; two shots (sealife, shrimper-fixed) shipped
  eye-judged.

- ~~Auto-confirm flaked suites in verify.mjs~~ — shipped 2026-07-20; rules
  in `GOTCHAS.md` → Verification.

- **Split `aviation.mjs` into wave-shards** (~30 s → ~20 s): export
  `shards = [{name, run}]` (wrap each wave's checks in an in-place arrow fn,
  re-declare `const aus` per shard) + a back-compat serial `default`; teach the
  runner to schedule a sharded suite as N queue units. Breaks the aviation
  pole. Re-run 15× co-scheduled stress after (chatter checks land in higher
  concurrency). Design settled; **evaluated and skipped 2026-07-12 on ROI** —
  measured full run ~24 s (aviation pole 17.4 s, next pole lights 12.0 s), so
  sharding recovers only ~8–10 s/run vs a ~30-min session (~300-run payback).
  Revisit only if aviation grows substantially or concurrency flakes appear.
  **Re-measured 2026-07-22** (post border-index, `-j4` full run): aviation
  17.2 s and no longer the pole — perf 30.2 s, ag 20.0 s, hud 18.2 s sit
  above it. The headline's ~30 s premise is obsolete; skip verdict stands,
  and any future suite-time work should start at perf/ag, not aviation.
  Full-run wall time now prints in the verify summary line (`Ns wall`).

- **Startup optimization: terrain neighbor-state classification** (evidence
  recorded 2026-07-22, hardening wave). `bandTint` (`world.js:203`) →
  `neighborStateAt` (`geo.js:727`) owns ~69 % of `inPoly` boot cost (~2.8 s
  of a ~6.75 s boot, paid by every player start and all 29 suite boots);
  full caller table in `TESTING_ASSESSMENT.md` → Addendum. Implementation
  shape deliberately undecided (runtime scanline vs baked mask vs spatial
  index — trade-offs in `TESTING_ASSESSMENT_COUNTER.md`). Gate: accumulated
  verify history confirming the payoff (durable only after the
  runner-telemetry wave below ships — the sidecar overwrites today), then a
  spec'd wave; replacement must match the current classifier at every
  elevation-grid point before the old path is removed. When this opens,
  consider a scoped **Chrome DevTools MCP** trial for the perf-trace work
  (CDP tracing first-class vs the hand-rolled profiling scripts); two
  standing rules pinned now: never a substitute for `verify.mjs`, and no
  screenshots into Claude's context (Copilot-judged path regardless of
  capture tool). Not wired into `wave-coder` by default.

- **Flake policy redesign** (queued 2026-07-22 — this entry backs the
  **temporary** solo-green exit-zero label in the verify summary; if this
  rots, the temporary policy silently becomes permanent). Design from
  recorded JSON history: which failure signatures auto-confirm, flake
  budget/expiry, whether one solo-green rerun is sufficient evidence, exit
  status for unknown intermittents, escalation of repeat flakes into
  defects. Contract questions listed in `TESTING_ASSESSMENT_COUNTER.md`.

- **Scheduler weights from telemetry** (2026-07-22): `WEIGHTS` in
  `verify.mjs` omits boat/energy/massif/onboarding/perf/rails (perf is the
  measured pole) and guesses body time only. Replace with measured
  end-to-end attempt cost (boot + settle + body + cleanup) from the JSON
  sidecar; keep per-worker page counts balanced — boot cost is large and
  near-uniform, so body-only ordering can still strand a worker on an
  extra boot wave.

- ~~Runner infra-failure normalization~~ — shipped 2026-07-22 (folded into
  and shipped as part of the runner-telemetry wave below); rules in
  `GOTCHAS.md` → Verification.

- ~~Runner telemetry + durable history wave~~ — shipped 2026-07-22: history
  retention (`~/.cache/lonestar-verify/history/`, atomic latest-run
  pointer, age+count prune), structured failure signatures
  (`assertion`/`pageerror`/`runner`, `failed === failures.length`), the
  per-phase infra failure matrix (workers never reject; browser-crash
  casualties get `outcome:'infra'`, never a failure signature; exit 3 =
  infra-incomplete), start/end machine snapshots, and `t.shot()`
  instrumentation (schema 2). Self-test expanded to 9 fixtures / 6 child
  runs (`tools/verify-selftest.mjs`). Rules in `GOTCHAS.md` → Verification
  and `tools/verify.mjs`'s header comment. *Provenance*: doc by the codex
  lane (`gpt-5.6-sol`); four central claims (single-file overwrite + silent
  write catch, `{name,ms,status}`-only check records, missing `t.near`/
  solo-green fixtures, post-teardown machine block) verified in-session at
  HEAD `09941ed` by Fable 5.

## Playtest findings 2026-07-15 (Bruno's tx-urgent notes; ocean-zone fix
already shipped as `54b3511` — these are the remaining items)

- ~~Gulf plane pokes past the terrain grid~~ — shipped by Water Vehicles W1
  (2026-07-19); see `ROADMAP.md`.
- ~~Water sits a touch below terrain + wants effects and sound~~ — shipped
  by Water Vehicles W2 (2026-07-19); see `ROADMAP.md`.
- ~~The band is always desert~~ — shipped by Band Parity W3 (2026-07-16);
  see `ROADMAP.md`.
- ~~NM band mountain silhouettes read flat~~ — shipped by West Texas massifs
  (2026-07-18); see `ROADMAP.md`.
- **Band roads: the concurrency defect** (diagnosed 2026-07-15) — distinct
  from the known "arterials only" scope limit below. A route is only matched
  when it's listed FIRST: the bake's Overpass regex is `^(<routes>)($|;)` and
  the script then takes `(ref).split(';')[0]`. OSM tags concurrencies as
  `US 60;US 84`, so **every** US 84 way from Clovis to Farwell (216 ways:
  `US 60;US 84`, `US 60;US 70;US 84`, `US 70;US 84`) is invisible to both —
  US 84's closest approach in the baked data is 305u, it never reaches Texas.
  That's why Clovis sits 145u from the line unroaded. Predates the
  2026-07-15 rebake (old data has the same gap; the rebake reproduced the
  idiom faithfully). **Only US 84 was checked — assume other routes are hit.**
  Fix: match the ref anywhere (`(^|;)(<routes>)($|;)`) AND pick the *matching*
  ref, not `[0]`; re-fetch all four states (queries/endpoints/bboxes are now
  recorded in `tools/build-band-roads.mjs`'s header), rebake, re-verify the
  shoulder suite (crossing monuments read band endpoints). Shifts the road set
  again — land it on its own, not stacked on another band change.
  → **Superseded by Band Parity W1** (2026-07-16): the tier-based fetch has
  no ref regex at all, so the defect disappears structurally.
- **Band scope call (decide BEFORE the concurrency fix codes)**: 147 of 177
  band cities have no road within 25u, and the concurrency fix won't change
  that — only 11 through-routes were ever queried (I-10/20/30/35/40, US
  62/71/84/87/180/287). That's the W2 design: Texas's highways continuing
  across the line, not the road network *of* the neighbors. Connecting the
  band towns is a scope expansion (more refs? a real network fetch?), not a
  bug fix — needs Bruno's call on how far the shoulder is meant to go.
  → **Resolved 2026-07-16**: Bruno called full parity — Band Parity track
  opened (`BAND_PARITY_SPEC.md`); W1 is the tier-based network fetch.
- **Brand buildings positioning review** (Bucky's / H-E-Buddy / Lone Star
  Compute): review all sites' placement against roads/downtowns — Bruno
  flags it wholesale; ranches and chapel–cemetery pairs confirmed good.
- **Roads, railroads, rivers visual pass**: "make them better" — ribbon
  width/color/texture upgrade candidates; no direction settled yet.
- **Band airports beyond the 25-mile line** (deferred from Band Parity W6,
  2026-07-17): Roswell/Lawton/Lake Charles (and Carlsbad/Alamogordo) are
  currently glow + radio-wink only — GOTCHAS' exclusion law, `band.mjs`
  asserts they never appear as real content. Bruno may want one or more as
  landable fields later. Needs: an explicit call on relaxing that exclusion
  for the airport point specifically (not the whole town), real OSM
  `aeroway=runway` fetch per field, ROUTES entries (aviation.js — a missing
  one crashes boot), and the 27-field/7-15-5-tier/22-gate-sign table-size
  bumps across `tools/checks/aviation.mjs`.
- **Poly review of pre-6b props**: W6b shipped the curvier kit (8–14 seg
  turnings); review the Shelf (W5) and Shoulder-east (6a) heroes — rigs,
  buoy, monuments, WinBig, fed building — plus older landmarks for the
  same treatment.

## Rails Operations (vision: `VISION_RAILS_OPS.md`, 2026-07-19)

Bruno's playtest of the Rails tours: trains run one polyline and stop dead
at its end (only named trains hop junctions), no per-train HUD identity or
trip info, no radio chatter, and opposing trains on one line pass through
each other (no occupancy model). Full courses + identity + chatter + meets
— ~3 waves, spec session when the track opens; open calls listed in the
vision doc. W1 (identity + chatter) and W2 (journeys) shipped 2026-07-19.

- **Operator-aware hop preference** (Bruno approved backlog 2026-07-19,
  post-W2 — *only if a playtest notices*): at a junction, a train prefers
  a connecting rail owned by its own operator, falling back to any (the
  existing clean/any two-tier in `hopAt` gains a same-operator tier).
  Closes the one perceivable journey-realism gap — a BNSF loco announcing
  UP subs for the rest of its life — without a route planner. The fallback
  must stay soft: a hard operator filter would re-create the dead-end
  stalls W2 removed on sparse operator networks. ~30 min in `trains.js`
  `hopAt` + one check. Everything beyond this (planned yard-to-yard trips,
  fixed symbols, timetables) is imperceptible at roadside-encounter scale
  — settled as not worth a wave (W2 session verdict); timetable layer
  stays `FUTURE.md` material.

## Next in line (in order)

~~Rider: Mexico Shoulder W0 — early scout~~ — **landed 2026-07-24** as
the `data-scout` sidecar on the Map W3 session. Memo filed in
`VISION_MEXICO_SHOULDER.md` ("W0 scout memo"); verdict: OSM for roads
AND city list/populations (INEGI access-blocked: WFS 401, nationwide-only
bulk ZIPs); no missing skeleton in the 25-mi strip; DP 0.0025° transfers
cleanly. The Mexico spec session's W0 gate is now satisfied.

1. **Slot export/import** (deferred from New Player W4, 2026-07-17;
   queues after the Map track 2026-07-23 — W2–W4 per `MAP_SPEC.md`,
   Bruno's call): back up
   a save slot to a file and restore it from one, on the title screen —
   insurance against browser-data loss (`NEWPLAYER_SPEC.md` W4's own
   pre-authorized drop-to-backlog candidate). W4 shipped 3 named slots +
   per-slot settings without it; storage scheme is `src/slots.js`
   (`KEYS`/`slotKey`/`SLOT_COUNT`) — export should serialize a slot's save
   key plus its 4 settings keys as one JSON file; import writes them back
   under the target slot's keys and (if it's the active slot) goes through
   `gameplay.loadSlot`/`title._afterLoad` so the live game reflects it
   immediately, not just storage.
2. **Haunted Texas wave 2 — the apparitions** (planned & approved 2026-07-11;
   follow wave-1 patterns in haunts.js, +4 legends → 6):
   - **Ghost Stampede at Stampede Mesa** (~33.55 N, −101.17 W caprock rim near
     Crosbyton — the legend behind "Ghost Riders in the Sky"). Gate on
     **storm weather + deep night**: translucent emissive longhorns
     (~24, instanced) + a rider looping a hand-laid rim path (maritime-lane
     idiom), `fog: false` to punch through storm fog, opacity pulses with
     sky.js lightning. The marquee event.
   - **El Muerto** — headless-rider *silhouette* in the south brush country,
     UFO-style rare rolls with a hotspot near San Diego/Ben Bolt (~27.7 N,
     −98.2 W); gallops parallel at 60–90 units, darts away if pressed (saucer
     state machine on a horse); synth hoofbeats by distance.
   - **La Llorona** — white figure + synth wail at hand-laid riverbank anchors
     (Rio Grande, San Antonio River, Woman Hollering Creek I-10 crossing
     ~29.56 N, −98.06 W); vanishes on approach.
   - **Chupacabra** — night lurker near the real Cuero/Elmendorf sightings;
     mangy hairless-coyote build, flees the horn (`scare` idiom). Fact:
     every confirmed one was a coyote with mange. So far.
   - Verify: parallel-heading + distance-band over time (El Muerto), rim
     displacement (stampede), vanish-on-approach opacity curves, horn-flee.
3. **Gamepad analog steering** (~1 hour, biggest driving-feel win) — Gamepad
   API axes/buttons alongside keyboard; poll in `Player.update`;
   `t.stubGamepad` is already in the harness waiting.
4. **Big-map click-to-set-waypoint** — generalize the mission target pipeline
   (map diamond + compass diamond + guide arrow) to a map click.
5. **`nearestBandRoad`'s grid indexes each segment by its midpoint cell only**
   (found during Band Parity W2, 2026-07-16): a query point near one END of a
   long unsplit band-highway segment (US 270 west of the OK panhandle border
   measured 488u in one piece) can land several cells from that midpoint and
   read back `null` at a small search radius, even though the point sits
   exactly on the road. No current consumer breaks on it (traffic.js
   interpolates `h.pts` directly, never calls `nearestBandRoad`) — fix
   direction: index by every cell each segment's bbox spans, not just the
   midpoint, mirroring the Texas `nearestRoad` grid if it already does this.

## Legibility passes (`/legibility-pass <subject>` — skill in `.claude/skills/`)

Procedure proven on the Malaquite turtle release (`7e1c31f`): silhouette +
per-occurrence HUD announcement + suite checks. Known same-class candidates
(all `spotSpecies`-only, i.e. silent after the first log — announcement axis
confirmed; silhouette axis needs the audit step):

- **Bats** (`bats.js`) — Congress Ave emergence: no per-dusk announcement.
  Ribbon flecks may be fine as silhouette; audit will say.
- **Dolphins** (`dolphins.js`) — ferry-crossing companions: no per-encounter
  announcement.
- **Haunts legends** (`haunts.js`) — deliberately subtle; audit only, may be
  exempt by design.
- **General audit sweep** — buildings/props (procedural downtowns, farmstead
  kit, ports): one session walking the Tours tab judging both axes, output =
  more entries here. Do this before queueing individual passes.

## Later

~~AIS-based real ship routes (marinecadastre.gov track data)~~ —
graduated into Sea-Industry W1 (2026-07-22, `SEA_INDUSTRY_SPEC.md`): the
condition "revisit only if maritime gets its own track" is met.
AIS-informed hand lanes are the decided default (small sample, numeric
gate); the full track-data bake survives only as the gate's fallback.

Boat trim tabs (handling character, planing feel): deferred from the
Sea-Industry W3 shop slate (Bruno, 2026-07-22) — feel-tuning risk inside
a handoff wave. Revisit as a small Fable in-loop tune if boat handling
ever gets a pass.

Placement audit follow-on (2026-07-16; **audited 2026-07-23** by the
`data-scout` agent's first mission — offline seeded mirror of the
`cities.js:121-143` building loop, run twice byte-identical, Monte-Carlo
cross-checked; **fix approved by Bruno 2026-07-23**, rides the Map W2
session as a third file-disjoint `wave-coder` chunk): the placement loop
tests only `airportClear`/`shoulderClear` — never `inTexas` or water.
Findings: Corpus Christi 52/82 downtown buildings in bay water (worst
13.6u offshore; the real-street filter rejects only land candidates, so it
*worsens* the water fraction), Rockport 3/14, Port Lavaca 2/14; the same
gap fires on land borders — El Paso 87/162 buildings across the Rio
Grande, Texarkana 3/20, Orange 1/16. Galveston, Beaumont, Port Arthur,
Kingsville structurally clean (footprints never reach water at
border.json resolution); zero lake intrusions in all 132 cities. **Fix
contract**: containment test in the loop with **reject-and-resample**
(retry the candidate roll, capped — preserves downtown building counts;
Bruno's call, else El Paso loses half its skyline); buildings are not
save-coupled, so layout change is safe. Checks: zero in-water /
cross-border buildings for the six flagged cities + building-count
preservation. Caveat from the audit: detection is bounded by
border.json's coastline resolution.

Haunted Texas wave 3: San Antonio ghost tracks push (~29.34 N,
−98.44 W — only event touching player physics; strict no-push-by-day check),
town churches in `cities.js` (reuse `mkChapel`), USS Lexington "Blue Ghost"
landmark with night glow, painted-church landmark (St. Mary's High Hill).

## Pending human playtests — the Shoulder & the Shelf (track closed 2026-07-15)

Owed since the ranch compounds; the track shipped headless-verified, so this
is the whole of its human judgment in one list. Nothing here is a known bug.

- **The eight ranch compounds** (waves 5/5b): the original four plus JA, XIT,
  Matador and LBJ — including landing at the new LBJ strip.
- **Padre** (W3): the causeway arrival, the beach drive, a dawn turtle release
  at Malaquite.
- **The Shelf** (W5): the rig skyline from Malaquite at night, the buoy and Far
  Rig plaques, the treasure light on a new-moon night, the Aransas birds.
- **The Shoulder east** (W6a): the I-10 crossing both ways (monument, leaving
  murmur, homecoming chime), a Vinton dusk (frogs, fireworks barns, Neutral
  Ground marker), the Texarkana straddle, the WinBig lot read from I-35, one
  Corner Stone hunt, a bear in the Sabine pines.
- **The Shoulder west** (W6b): the Texola wall read, the Glenrio sign from both
  directions of I-40, the Texhoma painted line, Anthony's banner, and the
  Carlsbad doorstep climb to the turnaround.
- **W7's people and board**: the Turtle Lady at SPI, a Passport progress line
  after a few crossings, the job-board notes (do they read as flavor or as
  instructions?), and the located radio winks. The B-52 and the shelf lines have
  reachability sentinels, so those are proven live — judge the *register*, not
  whether they fire. **The Roswell wink is the one unproven piece**: it needs a
  GA slot routed within `NM_NEAR` (500u) of the New Mexico ring, and GA traffic
  rides schedule slots with no `force()` hook, so it has no sentinel. If a west
  Texas flight never gets close enough, that line is dead content and the gate
  needs loosening — listen for it near El Paso.

## Pending human playtests (pre-aviation features)

- **Reworked UFO encounter** (debug 🛸 button starts it instantly): the
  saucer shadows you low and close in all three modes for 120–210 s — judge
  the standoff/height (the `tgt` block in `src/ufo.js`: 36 units out, 13
  above ground) and whether the headlight/lantern flicker reads. Try it
  walking (lantern), driving (headlights + engine sputter), and flying
  (nav lights + prop sputter).
- **Haunted Texas wave 1**: drive ranch roads west of Llano at night till you
  find a glowing cemetery (roughly 1 chapel per 10 chunks; visible by day —
  white steeple by the road), or use the debug menu. Judge: wisp
  size/brightness at parked distance (`SphereGeometry(0.26…)` + opacity 0.85
  in `src/haunts.js`), the approach-fade feel (`FADE_NEAR/FADE_FULL`), the
  midnight bell mix (`bell()` in `src/audio.js`), and whether ~50% haunted
  nights (`WISP_ODDS`) feels right. Enchanted Rock fires: fly there after
  dark, watch from the base. Terlingua + Presidio La Bahía are in the travel
  menu Landmarks tab.
- **Shop loop**: engine I + tires I worth $350? Lacy's yips, crate perch,
  weather-radio window, paint colors at night — knobs in `src/shop.js` /
  `src/sky.js` (`forecastT`) / `src/audio.js`. New items to balance-check:
  **Aviation tune** (climb/cruise, `FLY_CAP`/`FLY_CLIMB`) — do +10/20/30%
  cruise and +15/30/45% climb feel worth it in the air? **Cargo rig**
  (`CARGO_PAY` payout ×) — does +15/30/45% haul pay change which jobs you take?
- Also still pending: traffic honk chorus on I-35, flares at night, headlight
  throw, wildlife voices mix, UI scale at 170%+ on 1080p.
