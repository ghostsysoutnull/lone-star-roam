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
- **No rivers or lakes** — Rio Grande border, Colorado, Brazos, and the big
  reservoirs (Travis, Texoma) are missing.
- **Static NPCs** — 12 stationary characters; no schedules, no movement.
- **No traffic** — highways are empty except the player.
- **No audio** — no engine, wind, or music.
- **Desktop keyboard only** — no touch controls, no gamepad.
- **Gulf is a rotated rectangle** — coastline reads OK from altitude but the water
  edge doesn't precisely follow the real coast.

## Planned / candidate features

### High value, moderate effort
- [ ] **Ambient traffic** — vehicles spawned on nearby highway polylines following
  the real geometry; despawn beyond view radius (same pattern as `ScenerySystem`).
- [ ] **Rivers & lakes** — Overpass `waterway=river` for the majors + Natural Earth
  lakes; extend `tools/build-data.mjs` (a `rivers.json` alongside highways; ribbons
  rendered like roads). Rio Grande doubles as the visible SW border.
- [ ] **Day/night cycle** — sun angle + sky/fog color lerp; city buildings get
  emissive windows at night; Marfa Lights only visible after dark.
- [ ] **Audio** — WebAudio engine hum tied to speed, wind in fly mode, collect chimes.
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
- [ ] **Weather** — regional: Gulf storms, Panhandle wind, West Texas heat shimmer.

### Polish backlog (small)
- [ ] Bluebonnet patches along Hill Country roads (springtime flavor)
- [ ] More landmarks (Buc-ee's beaver, Stonehenge II, Beaumont fire hydrant…)
- [ ] Minimap zoom control; big map click-to-set-waypoint
- [ ] Odometer + total play stats on the help screen
- [ ] Mobile touch controls (virtual stick + buttons)

## Non-goals

- Multiplayer
- Realistic vehicle physics (arcade feel is intentional)
- Street-accurate rendering of every Texas town
- Interiors of any kind
