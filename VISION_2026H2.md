# Vision 2026-H2 — the umbrella

Ties the four track visions written 2026-07-18. Each has its own macro doc;
each gets its own spec session before any wave codes. Wave counts and
model/effort below are **estimates** — the per-track spec sessions own the
real split and may change them.

## The four tracks

| Order | Track | Vision doc | One line |
|---|---|---|---|
| 1 | Railroads Realism | `VISION_RAILROADS.md` | Surface the real rail network already baked: liveries, subdivision names, Laredo/Eagle Pass live crossings |
| 2 | Water Vehicles | `VISION_WATER_VEHICLES.md` | BOAT as the 4th player mode — Gulf, big lakes, Intracoastal; light dynamics |
| 3 | Sea-Industry Realism | `VISION_SEA_INDUSTRY.md` | Real ports, AIS ship routes, transport/fishing/patrol fleets, VHF chatter |
| 4 | Mexico Shoulder | `VISION_MEXICO_SHOULDER.md` | Real 25-mi strip south of the Rio Grande; twin cities the payoff; sets the data bar for all shoulders |

## Structure and dependencies

- **Sea program**: tracks 2 and 3 are two specs, one program — boat first
  (small, derisks water physics), industry lands on top of it.
- **Mexico codes last, scouts early**: its data-scout session (OSM vs
  INEGI) is read-only research, gates its spec, and can run between any
  other tracks' waves.
- **Rails ↔ Mexico touchpoint**: the Laredo/Eagle Pass rail crossings want
  geometry south of the river — either a small independent spur bake in
  the rails track, or coordinate with the Mexico scout.
- **Standing decisions** (2026-07-18): impromptu trains are converted (one
  system), not duplicated. No river navigation for boats. Mexico
  artificial-fill policy: real-or-absent identity, shipped procedural
  idioms, baked provenance, fill permanent once shipped (skeleton must be
  real before W1).
- **Umbrella review decisions** (2026-07-18): **the diorama is the point**
  — ambient, watchable realism is first-class value in this game (Bruno's
  standing design principle); sea-industry earns its waves as a working
  Gulf you watch and roam. **Gameplay is the other first-class axis**:
  creative cargo jobs are part of the game's spirit — water hauls get full
  investment; neither axis justifies, caps, or goes light because of the
  other. Sea's default route source is
  AIS-informed hand lanes, full bake only on scout numbers. Mexico carries
  a dedicated **south-side visual register wave** (building
  kit/palette/plaza layout) so the twin cities don't read as recolored
  Texas. No interludes: the program runs track to track; backlog items
  stay queued in `BACKLOG.md` as usual.

## Estimated waves — model/effort

Estimates only; each spec session re-plans its own track. Model split per
the standing rule: Fable 5 for content/register/pool waves, Sonnet 5 for
structural/plumbing waves; effort high unless noted.

| # | Track | Wave | Shape | Model | Effort |
|---|---|---|---|---|---|
| 1 | Rails | W1 — liveries + operator surfacing (trains.js reads baked fields) | structural | Sonnet 5 | high |
| 1 | Rails | W2 — rail identity on HUD/maps (announcer + shields item) | structural | Sonnet 5 | high |
| 1 | Rails | W3 — border crossings + named trains + chatter | content | Fable 5 | high |
| 2 | Boat | W1 — BOAT mode: physics branch, avatar, transitions, docks | structural | Sonnet 5 | high |
| 2 | Boat | W2 — water feel: chop/wake/ambience + lakes/Intracoastal scope | content | Fable 5 | high |
| 2 | Boat | W3 — announcer wiring, marina dressing, polish + close | content | Fable 5 | high |
| 3 | Sea | W1 — route lanes (AIS-informed, scout-gated) + lane retirement | structural | Sonnet 5 | high |
| 3 | Sea | W2 — the eight ports as dressed named sites + water hauls (missions) | content | Fable 5 | high |
| 3 | Sea | W3 — fleets (transport/fishing/patrol) + VHF chatter + close | content | Fable 5 | high |
| 4 | Mexico | W0 — data scout: OSM vs INEGI memo + sample bake (gates spec) | research | Sonnet 5 | medium |
| 4 | Mexico | W1 — bake + ground/tint + the law-repeal sweep | structural | Sonnet 5 | high |
| 4 | Mexico | W2 — roads + international bridges as crossing monuments | structural | Sonnet 5 | high |
| 4 | Mexico | W3 — south-side visual register: building kit, palette, plaza layout | content | Fable 5 | high |
| 4 | Mexico | W4 — the six twin cities (on the W3 register) | content | Fable 5 | high |
| 4 | Mexico | W5 — artificial-fill application + scenery south of the line | content | Fable 5 | high |
| 4 | Mexico | W6 — NPC/radio flavor, passport extension + track close | content | Fable 5 | high |

**Total: 16 waves ≈ 17–18 sessions.** The wave count says 16; history says
plan for the higher number — Energy ran 6 waves + a W4.5 rework, Shoulder
& Shelf ran 7 waves in 8 sessions. The 17–18 figure *is* the plan, not the
overrun. Backlog riders folded in along the way: shields
for railways (Rails W2), band railroads (Rails spec call), water
offsets/ambience + gulf-plane-beyond-DEM (Boat W2 or earlier), the AIS
"Later" item (Sea W1, scout-gated).
