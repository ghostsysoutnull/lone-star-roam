# Where things live — grep anchors per module

One line per module: key exports / methods / knob sites by *name* (grep these;
line numbers rot, names don't). Architecture & gotchas stay in CLAUDE.md.

## src/

- `geo.js` — `GEO` singleton, `hAt` (terrain height, `ELEV` grid consts), `nearestRoad` (spatial grid, optional type filter), `nearestCity`, `inTexas`, `countyAt`, `waterAt`, `seededRand` (never change seed strings).
- `world.js` — `buildWorld` → `buildTerrain`/`buildHighways`/`buildWater`/`buildCountyLines`/`buildRibbons` (all roads = merged meshes per tier); `ScenerySystem` inside `buildWorld` return (chunked flora/props, `group.userData.animated`); `chapelAt`/`chapelSitesNear` (pure seeded chapel+cemetery sites, `mkChapel`/`mkCemetery`).
- `vehicle.js` — `Player`: `update` (physics branches; DRIVE `caps{}`, offroad/rain via `this.perks`), `animate` (lights/particles; headlight intensity/lead knobs), `setMode`, `resetToRoad`; `mkTruck` (`userData`: headlights/wheels/brakes/cargo/beams/bodyMat), `mkWings`, `mkCowboy`, `mkStarMesh`.
- `sky.js` — `ATMOS` (mutable: wind/night/weather/rain/ufo), `SkySystem.update` (weather state machine: `nextPick`, `forecast`/`forecastT` radio window, `blend`; time keyframes `KEYS`), `WEATHER`/`ODDS` tables, `forecastLine`, `weatherIcon`, `skyReport`, `buildCelestial`, `DAY_SECONDS`.
- `gameplay.js` — `Gameplay`: save load/`persist` (keys: cities/landmarks/roses/species/stats/counties/ufo/bank/jobsDone/job/gear/legends), `LANDMARKS` (+`LL` projection), `enterCounty`, `spotSpecies`, `spotLegend`, `ufoSighting`, `landmarkNear`, `mkRoses` (rose RNG — never touch).
- `missions.js` — `MissionSystem`: `genOffers` (pay/deadline knobs at top), `accept`/`load`/`deliver` (payout multipliers), `abandon`, `hudInfo`, `CARGO` table, guide arrow in `update`/`toggleArrow`.
- `shop.js` — `SHOP` catalog, knob arrays (`ENGINE_CAP`/`TIRE_*`/`LIGHT_I` — index 0 = stock, match vehicle.js), `PAINTS`/`PAINT_PRICE`, `buy`/`buyPaint`/`gearLevel`, `applyGear` (→ `player.perks` + bodyMat + dog).
- `dog.js` — `DogSystem`: `update` (bed perch vs WALK follow; `FOLLOW_D`/`MAX_SPD` knobs), `honked` (delayed yips), `setOwned`, `mkDog`.
- `travel.js` — `TravelMenu`: `render` (tab dispatch), `renderJobs`, `renderShop`, `buyItem`, `jobClick`, `go` (arrival modes), `NATURE`/`ICONS` POI tables.
- `hud.js` — `HUD`: `update` (12 Hz; location/road/speed/mode/forecast lines), `renderMapLayer` (one offscreen canvas), `drawMini`/`drawBig`/`drawCompass`, `uiScale` (rem root), `toast`/`dialog`/`interactHint`, `toggleBigMap`/`toggleHelp`/`cycleZoom`.
- `audio.js` — `AudioSystem`: `update` (engine/wind/rain/crickets/theremin), `chime` (`SONGS` table), `honk`/`bark`/`howl`/`rattle`/`gobble`/`trainHorn`/`thunder`/`flare`/`step`, `toggleMute`.
- `traffic.js` — `TrafficSystem`: `update` (follow/brake/honk/pull-around; `DENSITY_DIVISOR` etc. at top), `refreshCandidates` (supply-based density), `junctionHop`, `spawn`/`pickType`/`mixAt`, vehicle builders `mkSedan`/`mkPickup`/`mkSuv`/`mkSemi`.
- `animals.js` — `SPECIES` table (speeds/behaviors/night gates/facts), `regionTable` (boxes mirror world.js), `AnimalSystem`: `update`/`flee` (heading: away = atan2(-dx,-dz))/`scare`/`sound`, `mkAnimal`.
- `npcs.js` — `NPCSystem`: `interact` (dialog assembly), `startle`, `spawnTownsfolk`, `roadShoulder`, `mkCharacter`.
- `cities.js` — `CitySystem`: `spawn` (InstancedMesh buildings, `hasRealStreets`), `setNight` (window glow), `cityRadius` (visit radii).
- `airports.js` — `AIRPORTS` table (true headings from OSM; `RW_W`/`MARGIN` tier knobs; pure per-site `anchor`/`gate` computed at module load), `airportClear` (pure footprint exclusion — called by cities.js/ScenerySystem/`chapelAt`), `airportLayout` (pure, pads at max `hAt`), `windFrom` (per-day seeded wind direction), `runwayInUse` (pure argmax end into `windFrom` — AI ops + wave-3 ATIS must share it), `AirportSystem` (8 merged meshes in `this.group`; beacon spin + windsock droop in `update`).
- `aviation.js` — `daySchedule` (pure seeded departures; `SLOTS`/`REDEYE_MAX`/night-u window consts), `AviationSystem`: `buildRaw` (closed-form trajectory legs; speed/altitude knobs in `TYPES`/`SLOPE`/`CEIL`), `evalFlight`, `update` (materialize scan within `MAT_R`, `MAX_AIR` cap, storm/dust ground stop + `divert` go-around, dt-vs-days delay model), `force('departure'|'arrival')`, `despawnAll`, `ROUTES` (real weighted pairs), `mkJet`/`mkGa`, `simT` (real-loop sentinel).
- `flares.js` — `FlareSystem`: `fire`/`snuff`/`update` (ballistic→chute phases; `LIGHT_I`/`BURN`/`CHUTE_FALL`/recharge knobs at top).
- `trains.js` / `maritime.js` / `ufo.js` / `bats.js` — `TrainSystem` (`arcInit`/`at` arc-length follow, `mkLoco`), `MaritimeSystem` (`laneAt`, `buildPorts`/`buildPlatforms`/`buildShips`), `UFOSystem` (`hotspotBoost`, `startSaucer(px,pz,immediate)`/`startFormation`; hover *stalks* the player — standoff/height/orbit knobs in the `tgt` block, `near` ramp drives the Levelland flicker), `BatSystem` (dusk window on `sky.t`).
- `haunts.js` — `LEGENDS`/`LEGEND_COUNT`/`EROCK`, `HauntSystem.update` (wisp arm/fade, ghost fires, midnight bell via `lastBell`, debug `force` flag; gates/radii knobs at top: `WISP_ODDS`/`NIGHT_MIN`/`FADE_*`/`WATCH_*`/`BELL_R`); chapel sites come from world.js `chapelAt`/`chapelSitesNear`.
- `debug.js` — `initDebug` playtest menu (`?debug=1` + backquote): `actions` table (day/night/midnight, `hauntCemetery`, `ghostFires`, `saucer`/`formation`, `bats`, weather picks) always on `__game.debug`; only the panel is URL-gated.
- `main.js` — `boot`: system construction order, keydown map (horn/interact/travel/…), render loop (update call order, 12 Hz `hudTick` block, `__skipRender` gate), `window.__game` exposure.

## tools/

- `verify.mjs` — harness: `check`, `t.ev/tp/wait/simWait/simStep/step/hold/release/key/until/setTime/setDay/setNight/setWeather/sample/shot/stubGamepad`; compact output default, `-v` verbose; `__skipRender` set at boot.
- `checks/*.mjs` — suites: debug/drive/haunts/hud/lights/missions/shop/traffic/wildlife (one default-export async fn each; debug runs first alphabetically and must restore daylight/clear weather).
- `build-data.mjs` (`proj` — duplicated as `LL` in gameplay.js/travel.js), `build-elevation.mjs` (grid consts ↔ `ELEV`), `build-sky.mjs`, `add-metro-streets.mjs` (append-only), `status.sh`.
