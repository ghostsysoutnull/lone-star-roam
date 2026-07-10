# Roadmap — Lone Star Roam

Status as of 2026-07-10. v1 is playable: real-geography Texas, drive/fly/walk,
132 city stars, 14 landmarks, 300 roses, 12 NPCs, persistent progress.

## Known limitations (v1)

- **Procedural downtowns outside the nine arterial metros** — Houston/DFW/SA/Austin
  plus El Paso, Corpus, Lubbock, Amarillo, and McAllen/RGV have real OSM arterials
  (fake grids removed there); all other cities keep seeded-procedural grids.
  Buildings everywhere are procedural. Full street-level precision statewide
  would be gigabytes of data.
- **Terrain resolution ~3 km/cell** — hills roll and ranges rise, but canyon
  walls (Palo Duro) read as steep slopes, not cliffs; a finer local grid or LOD
  would be needed for crisp canyons.
- **Only the biggest lakes** — Natural Earth 10m has just 6 reservoirs; mid-size
  lakes (Travis, Sam Rayburn, Livingston, Whitney) are missing. Rivers have no
  width variation along their course.
- **Static NPCs** — 12 stationary characters; no schedules, no movement.
- **No traffic** — highways are empty except the player.
- **No audio** — no engine, wind, or music.
- **Desktop keyboard only** — no touch controls, no gamepad.
- **Gulf is a rotated rectangle** — coastline reads OK from altitude but the water
  edge doesn't precisely follow the real coast.

## Planned / candidate features

### High value, moderate effort
- [x] ~~Ambient traffic~~ — done 2026-07-10: 70 pooled instanced vehicles on real
  highways, both directions, tier-weighted density/speed. Four vehicle types
  (sedan/pickup/SUV/semi) with tier-dependent mix — semis haunt the interstates.
  Polish pass later that day: density now follows local road supply (in-ring
  length x tier weight — deserts get a trickle, metros fill the pool), cars keep
  following distance, brake/honk/pull around a lane-blocking player (sqrt braking
  envelope; still no hard collision — deliberate), turn onto crossing roads at
  polyline ends instead of vanishing (U-turn at dead ends), far-away cars recycle
  on a TTL so the mix doesn't drift, night thins traffic toward ~50%-semi
  interstates, rain slows everyone 35% and lights lamps, and rural off-interstate
  traffic skews pickup.
- [x] ~~Rivers & lakes~~ — done 2026-07-10: 26 major named rivers (436 polylines) +
  6 big reservoirs (Amistad, Falcon, Texoma, Meredith, Red Bluff, Toledo Bend).
  Rio Grande/Red River render wide; border-river clipping uses a ~3.5 km dilation.
- [x] ~~Higher-resolution state border~~ — done 2026-07-10: Census 500k boundary,
  1,517 in-game points; Texoma-area land and river clipping fixed.
- [x] ~~Day/night cycle~~ — done 2026-07-10: 12-min days (hold T to fast-forward),
  keyframed sun/sky/fog palette, stars, city windows glow at night, headlights,
  Marfa Lights orbs only appear after dark. HUD clock + weather icon.
- [x] ~~Audio~~ — done 2026-07-10: all-synthesized WebAudio (no files): engine
  pitched to speed (car growl / prop drone), wind by speed+weather, rain patter,
  thunder synced to lightning with distance delay, per-category collect chimes,
  NPC blip, night crickets (silenced by rain). N mutes. Mix levels untuned by ear —
  gather feedback.
- [ ] **Gamepad support** — map Gamepad API axes/buttons alongside the keyboard.

- [x] ~~Freight & harbor~~ — done 2026-07-10: real OSM main-line rail network
  (512 polylines, 64 KB) as draped gravel+steel ribbons; freight trains
  (loco + 14–28 instanced cars, three car types) following the real geometry
  with a synthesized K5LA-style horn on close passes; container ports with
  cranes/stacks at 5 real port sites; cargo ships and tankers on a coastal
  lane, shrimp boats off Padre, 7 offshore oil platforms with flares.

- [x] ~~UFO events~~ — done 2026-07-10: rare deep-night sightings, 3× more likely
  near the real Texas cases (Levelland '57, Lubbock Lights '51, Stephenville '08,
  Marfa, Aurora 1897). Light formations + a hovering saucer with rim lights and
  ground beam that darts away when approached; engine sputter + headlight flicker
  nearby (the Levelland effect); theremin proximity tone; secret 👽 counter on
  the help screen; townsfolk rumor lines.

- [x] ~~UFO events~~ (see above) · ~~Landmark pass~~ — done 2026-07-10: 24 landmarks
  (added Prada Marfa, Paris TX Eiffel + hat, Dinosaur Valley, AT&T Stadium,
  Astrodome, Giant Boots), 10 meshes reworked, E-readable historical markers,
  rotating ferris wheel, night-lit Reunion ball / El Paso star / Prada windows.
- [x] ~~Compass~~ — done 2026-07-10: sliding tape top-center with cardinals,
  degree readout, nearest-city pip; C toggles, preference persisted.

### Larger bets
- [x] ~~Terrain elevation~~ — done 2026-07-10: real AWS Terrarium DEM baked to a
  420×400 grid (328 KB, city-pad flattening + outside-Texas mask baked in),
  2.5× vertical exaggeration at runtime; displaced vertex-colored terrain,
  draped roads/rivers/county lines, valley-height lakes, slope-pitched driving,
  fly soft clamp, everything samples hAt(). Verified against real elevations
  (El Paso 1130 m, Palo Duro floor 919 m vs rim).
- [x] ~~Real arterial roads in major metros~~ — done 2026-07-10: `primary` statewide
  + `secondary` in the four big metro bboxes; four road tiers with per-tier speed caps.
- [x] ~~Real arterials in mid-size cities~~ — done 2026-07-10: `secondary` fetched
  for El Paso, Corpus, Lubbock, Amarillo, McAllen/RGV bboxes (+ Edinburg/Pharr for
  free) via `tools/add-metro-streets.mjs`, which appends to `data/highways.json`
  without rebuilding the statewide tiers (rose indices untouched). +1,157 polylines,
  +75 KB. Mission stays procedural — its nearest OSM secondary is outside its whole
  building disc, so the fake grid is the better render there.
- [ ] **Missions/delivery gameplay** — "haul BBQ from Lockhart to Amarillo"-style
  jobs using the real highway routing.
- [x] ~~County system~~ — done 2026-07-10: all 254 real county boundaries (Census
  500k, 143 KB), county in the HUD location line, crossing toasts + chime with
  zigzag debounce, collect-all-254 counter, faint ground lines + map lines.
- [x] ~~Weather~~ — done 2026-07-10: region-weighted states (Gulf rain, Panhandle
  thunderstorms with lightning, West Texas dust storms) with ~9 s crossfades,
  drifting instanced cloud layer, rain streaks, windmills spin up with the wind.

- [x] ~~Wildlife & nature pass~~ — done 2026-07-10: 8 regional species (deer,
  longhorn, armadillo, jackrabbit, roadrunner, coyote, hog, vulture) with
  graze/wander/flee/circle behaviors + critter log (8th collectible category);
  flora variance (multi-blob live oaks, tiered pines, mesquite, yucca), rocks,
  hay bales, animated Permian Basin pumpjacks and plains windmills.

- [x] ~~Travel menu~~ — done 2026-07-10: P-key overlay; landmarks/nature/Texas-icon
  sights always available with smart arrivals (drive on road vs. fly at altitude,
  Marfa auto-arrives at night); cities unlock as fast-travel after first visit.

- [x] ~~Real night sky~~ — done 2026-07-10: 1,627 catalog stars (d3-celestial,
  mag ≤ 5) with B-V colors, 46 constellation figures + 15 labels, celestial sphere
  rotating for 31° N (verified: Betelgeuse culminates due south at midnight at the
  theoretically exact 66.4°), sun disc, Lambert moon with automatic phases
  (8-game-day lunar month), and today's real planet positions via mean orbits.

### Polish backlog (small)
- [x] ~~Bluebonnet patches along Hill Country roads~~ — done with the nature pass
- [x] ~~More landmarks~~ — done 2026-07-10: Buc-ee's beaver, Stonehenge II,
  Beaumont fire hydrant, Paisano Pete (14 → 18)
- [x] ~~Minimap zoom control~~ — done: Z cycles 3 levels. Big map
  click-to-set-waypoint still open.
- [x] ~~Odometer + play stats~~ — done: live odometer under the speedo;
  distance/time/top-speed on the help screen, persisted with the save
- [ ] Mobile touch controls (virtual stick + buttons)

## Non-goals

- Multiplayer
- Realistic vehicle physics (arcade feel is intentional)
- Street-accurate rendering of every Texas town
- Interiors of any kind
