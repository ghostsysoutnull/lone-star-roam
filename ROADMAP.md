# Roadmap — Lone Star Roam

Status as of 2026-07-10. v1 is playable: real-geography Texas, drive/fly/walk,
132 city stars, 14 landmarks, 300 roses, 12 NPCs, persistent progress.

## Known limitations (v1)

- **Procedural downtowns outside the big four metros** — Houston/DFW/SA/Austin have
  real OSM arterials (fake grids removed there); all other cities keep seeded-procedural
  grids. Buildings everywhere are procedural. Full street-level precision statewide
  would be gigabytes of data.
- **Flat terrain** — no elevation; the Hill Country is flat, mountains in the
  Trans-Pecos are decorative cones, no Palo Duro depth.
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
  No player collision yet.
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

### Larger bets
- [ ] **Terrain elevation** — heightmap sampled from real DEM (e.g., AWS Terrain
  Tiles), roads draped onto it. Touches roads, physics, cities, scenery — the
  biggest structural change on this list.
- [x] ~~Real arterial roads in major metros~~ — done 2026-07-10: `primary` statewide
  + `secondary` in the four big metro bboxes; four road tiers with per-tier speed caps.
- [ ] **Real arterials in mid-size cities** — extend the metro `secondary` fetch to
  El Paso, Corpus, Lubbock, Amarillo, McAllen bboxes (same pipeline).
- [ ] **Missions/delivery gameplay** — "haul BBQ from Lockhart to Amarillo"-style
  jobs using the real highway routing.
- [ ] **County system** — all 254 county lines + name toast on crossing
  (TIGER data; adds a collect-all-counties meta-goal).
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
