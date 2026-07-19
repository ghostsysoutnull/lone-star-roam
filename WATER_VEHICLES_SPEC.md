# Water Vehicles — track spec

**Shipped in full 2026-07-19** (3 waves; folded into `ROADMAP.md` — this
file stays as history). Second track of the 2026-H2 program
(`VISION_2026H2.md`; macro vision `VISION_WATER_VEHICLES.md`). Spec session
2026-07-19. First half of the sea program: this track ships the boat and
the water it rides on; `VISION_SEA_INDUSTRY.md` lands on top of it.

## Executive summary

**Goal**: BOAT as the 4th player mode — Gulf, the six big lakes, and the
Intracoastal — with light water dynamics, so the shipped offshore world
(227 platforms, Far Rig, the fairways, the shelf skyline) becomes a place
you can be *on*, not just over.

**Wave 1 — the player gets:**
- a boat: press V over water and the truck becomes a skiff — Gulf open
  water, all six big lakes, the Laguna Madre behind Padre
- honest edges: the truck stops at the waterline with a "switch to boat"
  hint; the boat beaches at the shore; flying out is always allowed
- the bottomless-ocean bug fixed — no more open water past the map's edge
  with no seafloor under it

*Expected result: `MODES` gains BOAT; the V cycle offers it only over
navigable water (`boatableAt` in geo.js: gulf by zone classifier, lakes by
polygon + baked level). Skiff avatar in vehicle.js, water-level y, boat
physics branch (momentum, speed-coupled turn). DRIVE stops at the
waterline; exiting BOAT to DRIVE/WALK only near shore, FLY anywhere. Gulf
plane clipped/faded at the DEM edge; navigation bounded by `inWorld`. New
`tools/checks/boat.mjs` suite; one staged skiff shot judged before commit.*
*Suggested setup: Fable 5, effort high.*

**Wave 2 — the player gets:**
- water that feels like water: bob and chop that grow with the wind and
  storms, a wake trailing the boat, engine and lapping-water sound
- rivers and lakes that sit right in their banks instead of sunken, plus a
  cheap sparkle on the water surface

*Expected result: chop amplitude/attitude driven by live `ATMOS.wind` +
weather; wake as a capped instanced fade pool (maritime `fadeDisc` idiom,
above the one gulf plane, never a second surface); water ambience + boat
engine in audio.js; river/lake ribbon offsets retuned (closes the
water-offsets backlog item). Chop asserted over sim time against staged
wind; one staged water-surface shot judged before commit.*
*Suggested setup: Fable 5, effort high.*

**Wave 3 — the player gets:**
- the sea opens up: fairway names on the HUD as you cross them, marinas at
  the ports and lakes, channel markers down the Laguna Madre
- Lacy rides the bow
- cruise hold: release the throttle and the boat keeps way on — set a
  course and watch the coast; brake to drift down and stop
- the big map shows where the world ends — a boundary line at sea (the
  shelf edge the boat stops at) and one on land (the shoulder edge)
- first-boat hint, boat HUD/map identity, and the track closed out

*Expected result: fairways + marinas join the energy.js announcer via
`register()` only (platforms already announce — no new machinery). Marina
dressing at the 8 ports + one per lake; ICW channel-marker buoys
(instanced). Dog bow perch (crate-perch idiom). World-edge iso-lines
(SHELF_U / SHOULDER_U) drawn on the big map via the Tidelands dash-pass
idiom — boot-time only. New Player `save.seen` hint + mode icon on
HUD/maps. Tours, one staged marina shot, track close (ROADMAP fold,
BACKLOG/GOTCHAS/CLAUDE sweep, briefing delete).*
*Suggested setup: Fable 5, effort high.*

## Decisions (Bruno, 2026-07-19)

- **Acquisition — free core mode**: BOAT joins the V cycle like FLY; no
  purchase, no unlock. Boat *upgrades* are shop material for a later track
  (sea-industry's business).
- **Transitions — position-gated switch**: the cycle enters BOAT only over
  navigable water; switching out over open water offers FLY only;
  DRIVE/WALK come back near shore (beaching). Docks/marinas are flavor
  sites, never gates — same fiction as the truck sprouting wings.
- **Lake scope — all six baked lakes**: Toledo Bend, Falcon, Texoma,
  Amistad, Meredith, Red Bluff. All are large; no exclusion list to
  maintain.
- **Missions — no water hauls this track**: sea-industry W2's business, on
  top of this track's physics.
- **No river navigation** (vision, standing): ribbons are 1–3 units wide
  against a 4-unit-scale boat and have no channel. Gulf + lakes +
  Intracoastal only.

## Hard requirements (all waves)

- **One-gulf-plane law** (GOTCHAS): the boat reads the existing plane at
  y −2.5; every effect (wake, sparkle, chop) floats above it with a
  y-stagger (the spill-decal precedent). Never a second water surface.
- **Gulf legality comes from the zone classifier, not depth**: `hAt`
  clamps at the DEM edge and never returns negative (the −4 offshore dip
  is a mesh-only edit in `buildTerrain`), so "over gulf water" =
  `classify` ∈ {coast, shelf} — which also makes the Laguna Madre (outside
  both the mainland and island rings) navigable for free. Lakes: polygon
  test + a per-lake level geo.js computes at load (lowest-shoreline
  formula moves out of `buildWater`; world.js reads it — one source).
- **Save extends with new keys only**: BOAT adds none — `save.at.mode`
  simply gains a legal value; resume must restore a mid-water BOAT
  session correctly.
- **Steppers must cover BOAT**: the physics branch runs under
  `t.simStep`; keep the walk-cap real-loop sentinel pattern — one
  real-loop boat check so main.js wiring can't hide behind the steppers.
- **Verify at natural values**: mid-bay headings, the distance a player
  actually beaches at, chop measured over sim time with live `ATMOS` —
  never convenient calm-water constants.
- **Ferries unchanged**: boarding stays `p.mode === 'DRIVE'` + armed
  gate; the boat ignores ferry docks and vice versa (a `ferries.mjs`
  non-interference check).
- Every wave ships its Tours entries (mode `'BOAT'` spots must guarantee
  water under the player) + forcing for anything gated, and states its
  perf delta against the 1600-call cap.

## Waves

### W1 — BOAT mode (Fable 5, high)

Design settled:
- `geo.js` exports `boatableAt(x, z)` → `{kind: 'gulf'|'lake', y}` or
  null. Gulf: `classify` coast/shelf ∩ `inWorld`, y = −2.5 (one shared
  constant with world.js/maritime's SEA). Lake: polygon + baked level.
  Wet-sand band (`beachAt`) counts as shore, not water.
- `vehicle.js`: `MODES` = `['DRIVE','FLY','WALK','BOAT']`; `cycleMode`
  skips ineligible modes by position (BOAT needs `boatableAt`; DRIVE/WALK
  from BOAT need shore within a small radius); `setMode('BOAT')` snaps y
  to the water level. Skiff avatar (hull + console + outboard) built like
  the truck, vertex-colored, no new materials class.
- Boat physics: momentum-heavy DRIVE variant — slower accel, longer
  coast, turn authority scales with speed, modest cap between WALK and
  DRIVE tiers; exact numbers are in-wave feel work (why this wave is
  Fable).
- DRIVE at the waterline: soft stop + one-time "switch to boat (V)" toast
  (hint idiom); no drowning, no seafloor driving on the mainland coast.
- Gulf-plane-beyond-DEM fix (backlog fold-in): clip or fade the plane
  outside the terrain grid per the 2026-07-15 diagnosis; boat navigation
  additionally bounded by `inWorld`.
- Verify (`boat.mjs`): cycle skips BOAT inland at a natural spot; enters
  on Galveston Bay water; speed cap + momentum over `t.simStep`; y rides
  the water level; beaching stops at the shore; DRIVE waterline stop;
  lake entry at Falcon; one real-loop boat sentinel; plane-edge probe.
- Perf: ~+5 draw calls (avatar); no chunked systems touched.

Budget: code + checks + **one** staged skiff shot (Copilot + Bruno
gate), grep-first.

### W2 — water feel (Fable 5, high)

Design settled:
- Chop: avatar pitch/roll + small y oscillation, amplitude =
  f(`ATMOS.wind`, weather); storm multiplies. Attitude flattens as speed
  rises (planing). All read live `ATMOS` — never cached.
- Wake: capped instanced pool of fading quads/discs behind the stern
  (`fadeDisc` idiom), y-staggered above the plane; pool size fixed at
  birth, zero steady-state allocation.
- Sparkle/ripple: one cheap player-local effect on the water surface
  (instanced sprites or a small animated patch); must obey the one-plane
  law and the fog/light rules (sky.js owns lights).
- Audio: water-lap loop when idle/slow, engine hum scaling with throttle,
  shore lap near beaches (audio.js patterns; `onSound`-class hooks).
- River/lake offset look-pass (backlog fold-in): retune river `hAt +
  0.07` and lake `+0.15` so banks read right; assert the new offsets.
- Verify: chop amplitude tracks staged wind over sim time (calm vs storm
  measured, not eyeballed); wake pool never exceeds its cap; offsets
  asserted; ambience hooks fire.
- Perf: +≤20 draw calls (wake + sparkle pools); caps hold at the three
  baseline tour spots.

Budget: code + checks + **one** staged water-surface shot (Copilot +
Bruno gate), grep-first.

### W3 — the sea opens up (Fable 5, high)

Design settled:
- Announcer: `energy.js` `register()` calls only — fairway entries
  (⚓ real names, radius sized to boat speed) and marina sites. Platforms
  already registered; no new announcer machinery (standing Energy law).
- Marinas: small-craft dock dressing at the 8 `PORTS` + one per lake at a
  seeded shoreline site (chapelAt-pattern legality: road-clear,
  airport-clear, on the lake's shore). Flavor sites, not gates.
- ICW: red/green channel-marker buoys instanced along the Laguna Madre
  lane (Brownsville → Port Isabel → Land Cut); scope beyond the lagoon is
  an in-wave call.
- Lacy: bow perch when `gear.dog` (crate-perch idiom, dog.js).
- Identity: HUD mode icon, boat marker on both maps, first-boat
  `save.seen` hint (New Player idiom).
- Cruise hold (rider, Bruno 2026-07-19, W2 session): hands-off cruising
  like the plane, but NOT the plane's min-speed clamp (a floor fights
  beaching's hard stop, the idle chop/lap ambience, and the momentum
  identity). Settled design: above ~2 u/s the glide stops decaying
  (`BOAT_COAST` → 1.0 in that band) — release W and she holds way on; S
  bleeds speed to a stop; beaching still hard-stops; below the band the
  old decay reclaims the drift-to-rest feel. Check updates: the W1
  coast-retention assertion inverts (speed holds ≥0.95 over 2 s), wake/
  audio idle checks already stage speed directly. No new visible
  surface — shot-free.
- World-edge map lines (rider, Bruno 2026-07-19): two iso-lines on the
  big map — the sea world edge (`SHELF_U` from the coastal border, where
  W1's boat wall is) and the land world edge (`SHOULDER_U` from the
  US-neighbor stretches; Mexico's edge is the river itself, already
  inked). Same technique as the Tidelands dashed line in
  `renderMapLayer` (distance-field sampling, 80u bands, two-level
  refinement), rendered once at boot, styled fainter than the Tidelands
  dashes so the legal line outranks the world line. Big map only — the
  minimap stays clean.
- Track close: ROADMAP fold-in, BACKLOG sweep (gulf-plane + water-offsets
  items marked shipped), GOTCHAS graduation, CLAUDE.md header, briefing
  delete, LEDGER line.
- Verify: fairway announce fires crossing a real fairway by boat; marina
  sites legal + present; buoy count/perf; dog perch; hint once per slot;
  world-edge lines present on the wide layer only (canvas-pixel probe at
  a known edge coordinate, the rail-ink check idiom).
- Perf: marina/buoy dressing instanced or merged — +≤30 draw calls
  coastal, ~0 inland.

Budget: code + checks + **one** staged marina shot (Copilot + Bruno
gate) + the track-close doc sweep, grep-first.

## Track close

W3 closes the track: all three waves folded into one `ROADMAP.md` entry,
spec stays as history, satellite docs swept (BACKLOG header + folded
items, CLAUDE.md active-track line, NEXT_SESSION.md back to
kickoff-only), surviving gotchas graduated into `GOTCHAS.md`. Sea-industry
(`VISION_SEA_INDUSTRY.md`) opens next on top of the boat.
