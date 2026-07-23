# Sea-Industry Realism — track spec

Second half of the sea program (`VISION_SEA_INDUSTRY.md`, umbrella
`VISION_2026H2.md`); lands on top of the shipped Water Vehicles boat.
Both first-class axes apply in full: the working Gulf is diorama value on
its own, and the sea economy gets the same investment (the two-axis
principle, Bruno 2026-07-18).

## Executive summary

**Goal**: a working Gulf — eight real named ports, real ship traffic on
AIS-informed routes, named vessels with VHF radio chatter, Coast Guard
patrols, the shrimp fleet, life offshore, and a sea economy where hauling
cargo between ports pays for boat upgrades.

**Wave 1 — the player gets:**
- eight real named Texas ports as dressed, visitable sites: Houston (the
  #1 US port by tonnage), Corpus Christi, Galveston, Beaumont, Port
  Arthur, Texas City, Freeport, Brownsville — names on the HUD on
  approach
- ship traffic on real AIS-informed routes instead of the single hand-laid
  lane — tankers, container ships, bulkers, chemical carriers, each the
  right kind for its port
- a Ports log: the 12th collectible, one entry per port visited

*Expected result: the route scout produces numbers before any lane ships
(median lateral offset vs the AIS density ridge, approaches joining the 8
baked fairways); `PORTS` grows 5 → 8, each dressed with a merged port kit
at the W6b poly bar; the hand-laid `LANE` retires (the scarcity
exception's planned end); announcer via the existing `energy.register`
idiom; `save.ports` is a new additive key. Suite checks + one staged
shot.*
*Suggested setup: **handoff no** (new bake + new visible surface + route
judgment), effort high.*

**Wave 2 — the player gets:**
- named ships: every vessel carries a name, type, and origin → destination
  on its approach placard
- VHF channel-16 radio chatter near ships and ports
- Coast Guard cutters on patrol, with joint moments alongside the shipped
  CG helicopter
- the shrimp fleet working real grounds — out at dawn, home by dusk
- life offshore, all in the critter log: offshore dolphin pods, sea
  turtles surfacing, rays in the flats, rolling tarpon, gull flocks
  trailing the shrimpers

*Expected result: seeded `shipid:` per-vessel identity (trains' placard
idiom); token-gated VHF pools in the chatter.js pattern; cutters patrol
route legs; shrimpers homed at the 5 fishing ports on a dawn/dusk cycle;
5 new water-gated species rows via existing animals.js behaviors, gulls
keyed to live shrimper positions. Suite checks + one staged shot.*
*Suggested setup: **handoff no** (chatter register + new behaviors +
wildlife feel), effort high.*

**Wave 3 — the player gets:**
- sea cargo jobs between ports — containers out of Houston, crude to the
  refinery ports, shrimp catch to market — with their own pay and
  deadline character
- the boat shop, six upgrades: outboard tiers, hull paint, VHF handheld,
  running lights, shrimp rig (small catch income on the grounds), depth/
  fish finder (sonar pings the offshore wildlife from the boat)

*Expected result: missions kind `'sea'` (the charter precedent — pure
terms in mission-rules.js, ×1.5 never-flew parity, fast-travel lock
parity, dock pickup/delivery by boat); shop slate priced against
water-haul pay so the earn/spend loop closes in one wave; `applyGear`
extends `player.perks` with the new ids. Checks only, no shots.*
*Suggested setup: **handoff yes** (wave-coder; settled-design execution),
effort high.*

## Decisions (Bruno, 2026-07-22)

- **Routes**: AIS-informed hand lanes — one small marinecadastre.gov AIS
  sample read once offline to shape waypoints, kept only if they pass the
  numeric gate (W1). The full track-data bake is the fallback, approved
  only on numeric failure. The backlog's "AIS-based real ship routes"
  entry graduates into this track.
- **Fishing depth**: ambient fleet + the lean shrimp-rig income. No
  minigame; player fishing gameplay is excluded (its own later track if
  ever).
- **Ports collectible**: own `save.ports` key, 12th collectible — never
  folded into the Energy log.
- **Boat-upgrade slate**: six — outboard tiers, hull paint, VHF handheld,
  running lights, shrimp rig, depth/fish finder. Trim tabs deferred to
  `BACKLOG.md` (feel-tuning risk inside a handoff wave).
- **Ship naming**: per-vessel seeded identity from curated per-type name
  pools — never an AIS-names bake.
- **Sea wildlife**: the "life offshore" rider ships in W2 (the open Gulf
  is currently empty of animals); the fish finder pairs with it in W3.

## Hard requirements (all waves)

- **Seed streams**: `shipid:`, shrimper/ground streams, and any port-site
  stream are named once and never renamed (blanket seed-string law).
- **Save extends with new keys only**: `save.ports` (W1), new `save.gear`
  ids (W3). No existing key changes shape.
- **Announcer**: ports register through `energy.register()` — no new
  announcer machinery (the Energy track law).
- **Plaque law**: any new maritime brass joins the unified main.js lookup;
  maritime plaques are NOT landmarks.
- **One gulf plane**: everything floats on the y-stagger above the single
  vertex-colored plane; the `boat.mjs` edge-fade assertion must survive.
- **Boat legality**: water placement uses `boatableAt`/`coastDist` — the
  visible waterline, not the border polygon (W3.1 law).
- **Overpass is GET** from this environment, never POST.
- Every wave ships its Tours entries; schedule-gated content (shrimper
  cycle, chatter, wildlife encounters) gets a forcing debug action —
  no "maybe" buttons.
- Suites stay hermetic: drive to the asserted state (stage clock/weather,
  force spawns); no reliance on ambient accumulation.

## Waves

### W1 — Real routes + the eight ports (Fable in-loop, high)

**Scout (opens the wave, before any code)**: one marinecadastre.gov AIS
daily extract, clipped to the Texas Gulf bbox, reduced offline to a
density grid. Inputs land in `~/claude-area/devel/tx-inputs` (not in the
repo), reduction script in `tools/`. Gate, in numbers: hand-lane
waypoints within ~20 u median lateral offset of the density ridge; every
port approach joins one of the 8 baked fairways. Pass → AIS-informed
hand lanes are final. Fail → stop and report; the full bake needs its own
approval.

**Design settled:**
- Bake: `tools/build-sea.mjs` → `data/sea.json` (6th boot data file; the
  `/new-bake` pipeline): route polylines with per-type weights + port
  records (name, quay polylines/berth point from OSM via Overpass GET,
  character: container/tanker/bulk/chemical/fishing). Loaded into
  `GEO.sea` in geo.js.
- maritime.js: `buildShips` rides `GEO.sea.routes` (type per route
  character); `PORTS` table replaced by the baked records; per-port
  merged dressing kit (cranes/container stacks/tank rows/warehouses/
  wharf) scaled by port character, W6b poly bar; `LANE` deleted;
  `fairwayLegs` become the port-approach segments of the new routes —
  one route system, not two.
- Ports log: `gameplay.logPort` (the `logAirport` idiom, dedup by port
  id), `save.ports`, progress row in the travel menu.
- Tours: one spot per new port (Beaumont, Texas City, Freeport) + one
  route-watching spot; ports are static — teleport + staged time only.

Perf: ~+10 draw calls (merged port kits); ship count unchanged. Budget:
scout + bake + code + checks, one staged shot (dressed port), grep-first.

### W2 — The working Gulf (Fable in-loop, high)

**Design settled:**
- Identity: `shipid:` seeded stream — name from curated per-type pools,
  type, origin → destination resolved from `GEO.sea` ports; placard toast
  on approach (trains' `onNamed` 60-u idiom, re-arms on exit).
- VHF: chatter.js-pattern pools, `{token}`-gated factual (pilot boarding,
  traffic calls, port ops, rationed CG securité); audible near ships/
  ports and in BOAT; W3's VHF handheld extends it aboard anywhere (the
  avionics-radio idiom).
- Cutters: small CAP patrolling route legs; joint moment = the rotors.js
  coastguard heli anchors a hover near a cutter (candidates exposed the
  `ph`/`city` way).
- Shrimp fleet: homed at the 5 fishing ports (Brownsville, Port Isabel,
  Aransas Pass, Palacios, Galveston); hand-laid ground polygons over the
  bays/nearshore shelf; dawn-out/dusk-home on the game clock; outrigger
  silhouette at the W6b bar.
- Life offshore: 5 species rows on existing animals.js behaviors, water-
  gated (`boatableAt` gulf / `coastDist`): offshore dolphin pod, sea
  turtle surfacing, rays (flats), rolling tarpon (jetties), gulls
  following shrimpers (maritime exposes live shrimper positions; main.js
  wires the bridge — no animals→maritime import). All log via
  `spotSpecies` with facts.
- Tours: cutter patrol, shrimper + gull flock (forcing action), offshore
  pod, VHF listen spot.

Perf: instanced fleets + birds, ~+6 draw calls. Budget: code + checks,
one staged shot (cutter/shrimper silhouette), grep-first.

### W3 — Sea economy: water hauls + the boat shop (wave-coder, high)

**Design settled:**
- Missions: kind `'sea'` alongside ground/charter/energy — `SEA_CARGO`
  table keyed by port ids (containers out of Houston, crude to the
  refinery ports — Corpus/Port Arthur/Texas City, chemicals Freeport,
  shrimp catch fishing port → market); `seaOfferTerms` in
  mission-rules.js (higher pay/km than ground — the boat is slower;
  generous deadlines; half pay late; ×1.5 never-flew parity); pickup/
  delivery inside a dock radius at the berth point, in BOAT; travel.js
  lock parity during haul.
- Shop: six catalog entries, prices sized against `seaOfferTerms` pay.
  `outboard` tiers (knob array, index 0 = stock `BOAT_*` — the index-0
  law); `hullpaint` via `skiff.userData` hull material (the `bodyMat`
  idiom — mkSkiff exposes it); `vhf` perk (chatter aboard anywhere);
  `boatlights` (running lights, night meshes + emissive, headlight
  idiom); `shrimprig` perk (slow trolling over a W2 ground accrues
  catch, landed at a fishing-port dock for pay); `fishfinder` perk
  (sonar ping toast + marker when a W2 wildlife spot is near, BOAT
  only).
- `applyGear` extends `player.perks`; vehicle.js BOAT branch reads perks,
  never the save. All new `save.gear` ids additive.
- The handoff plan is the full contract: every player-visible string
  verbatim, all knob values stated.
- Tours: a haul pickup dock, a shrimp-rig ground, a fish-finder ping spot
  (forcing actions where gated).

Perf: none (logic + catalog + small light meshes). Budget: code + checks,
no shots.

## Track close

Fold into ROADMAP.md; graduate surviving gotchas (route/LANE retirement,
`shipid:` stream, ports-log key, VHF register rules) into GOTCHAS.md;
sweep BACKLOG.md (trim-tabs deferral entry; strike graduated items);
delete the briefing block.
