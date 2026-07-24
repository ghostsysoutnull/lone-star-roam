// Lone Star Roam — bootstrap & game loop
import * as THREE from 'three';
import { loadGeo, GEO, nearestRoad, nearestBandRoad, nearestAnyRoad, nearestRiver, nearestRail, nearestCity, waterAt, countyAt, neighborCountyAt, hAt, inTexas, onIsland, beachAt, inWorld, borderZoneAt, outsideAt, seededRand, agAt, bandAgAt, energyAt, inStateWater, coastDist, TIDELANDS_U, neighborStateAt, inTexasOrBand, boatableAt, borderDist, terrainMeshY, ELEV, SEA_Y, LAKE_OFFSET, toLatLon } from './geo.js';

const NEIGHBOR_STATE_NAME = { LA: 'Louisiana', AR: 'Arkansas', OK: 'Oklahoma', NM: 'New Mexico' };
import { buildWorld, chapelSitesNear, farmsteadAt, feedlotAt, fieldAt, ranchHQSite, ranchHQAt, wellSiteAt, windTurbinesAt, solarSitesAt, CAUSEWAY, padreSites, bandTint, RIVER_OFFSET } from './world.js';
import { HauntSystem, LEGENDS, LEGEND_COUNT } from './haunts.js';
import { initDebug } from './debug.js';
import { PerfMonitor } from './perf.js';
import { CitySystem, cityClear, cityRadius } from './cities.js';
import { BrandSystem, groundYAt as brandGroundYAt, brandNear } from './brands.js';
import { Player } from './vehicle.js';
import { Gameplay, LANDMARK_COUNT, LANDMARKS } from './gameplay.js';
import { TurtleSystem } from './turtles.js';
import { TrafficSystem } from './traffic.js';
import { AnimalSystem, SPECIES, SPECIES_COUNT } from './animals.js';
import { BatSystem } from './bats.js';
import { FerrySystem } from './ferries.js';
import { DolphinSystem } from './dolphins.js';
import { SkySystem, ATMOS } from './sky.js';
import { TravelMenu } from './travel.js';
import { MissionSystem } from './missions.js';
import { AudioSystem } from './audio.js';
import { NPCSystem } from './npcs.js';
import { TrainSystem } from './trains.js';
import { MaritimeSystem } from './maritime.js';
import { EnergySystem, ENERGY_TOTAL } from './energy.js';
import { ShoulderSystem, swampAt, shoulderClear } from './shoulder.js';
import { UFOSystem } from './ufo.js';
import { FlareSystem } from './flares.js';
import { DogSystem } from './dog.js';
import { SpringerSystem } from './springer.js';
import { RabbitSystem } from './rabbits.js';
import { AirportSystem, AIRPORTS, airportClear, fieldNear, airportLayout, windFrom, runwayInUse, padAt, groundYAt } from './airports.js';
import { AviationSystem, daySchedule, AIRLINES } from './aviation.js';
import { TowerRadio } from './radio.js';
import { VOICES as chatterVoices, chatterLine, HELI_ID } from './chatter.js';
import { HeliSystem, BlimpSystem } from './rotors.js';
import { MilitaryAirSystem } from './military.js';
import { applyGear } from './shop.js';
import { HUD } from './hud.js';
import { TitleScreen } from './title.js';
import { Tutorial, buildGuide, ControlsBar } from './onboarding.js';
import { initSettings } from './settings.js';
import * as slots from './slots.js';

const status = (t) => (document.getElementById('loading-status').textContent = t);

async function boot() {
  await loadGeo(status);
  status('Building world…');

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.getElementById('app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fc8e8);
  scene.fog = new THREE.Fog(0x9fc8e8, 250, 1400);

  // near=0.5: depth precision matters more than close-ups at this world scale (z-fighting)
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.5, 30000);

  const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  sun.position.set(-800, 900, 400);
  const ambient = new THREE.AmbientLight(0xc8d8e8, 0.9);
  scene.add(sun, ambient);

  const sky = new SkySystem(scene, sun, ambient);
  const scenery = buildWorld(scene);
  const airports = new AirportSystem(scene);
  const aviation = new AviationSystem(scene, airports);
  const cities = new CitySystem(scene);
  const brands = new BrandSystem(scene);
  const player = new Player(scene, camera);
  const gameplay = new Gameplay(scene);
  const traffic = new TrafficSystem(scene);
  const animals = new AnimalSystem(scene, (key) => gameplay.spotSpecies(key, SPECIES[key].name, SPECIES_COUNT, SPECIES[key].fact));
  const bats = new BatSystem(scene, () => gameplay.spotSpecies('bat', SPECIES.bat.name, SPECIES_COUNT, SPECIES.bat.fact));
  const turtles = new TurtleSystem(scene, () => gameplay.spotSpecies('kempsridley', SPECIES.kempsridley.name, SPECIES_COUNT, SPECIES.kempsridley.fact));
  const ferries = new FerrySystem(scene, player);
  const dolphins = new DolphinSystem(scene, ferries, () => gameplay.spotSpecies('dolphin', SPECIES.dolphin.name, SPECIES_COUNT, SPECIES.dolphin.fact));
  const hud = new HUD();
  // collectible totals in the score panel/help come from the real tables —
  // the old static copies (26/15/2) had quietly rotted
  document.getElementById('total-landmarks').textContent = LANDMARK_COUNT;
  document.getElementById('total-critters').textContent = SPECIES_COUNT;
  document.getElementById('total-legends').textContent = LEGEND_COUNT;
  document.getElementById('total-energy').textContent = ENERGY_TOTAL;
  document.getElementById('total-ports').textContent = GEO.sea.ports.length;

  gameplay.onToast = (m) => hud.toast(m);
  turtles.onEvent = (m) => hud.toast(m);
  const audio = new AudioSystem();
  const radio = new TowerRadio();
  radio.onRadio = (text, meta) => { audio.radio(text, { ufo: ATMOS.ufo, voice: chatterVoices[meta?.voice] }); hud.subtitle(text, meta?.header); };
  radio.onStamp = (id, name) => gameplay.logAirport(id, name);
  // B2: nearest airborne heli for NPC context — heli/missions/sky are consts
  // below in this scope; the arrows only run at interact time, well after boot
  const nearestHeli = () => {
    let best = null;
    for (const c of heli.candidates) {
      if (!c.flying) continue;
      const d = Math.hypot(c.x - player.pos.x, c.z - player.pos.z);
      if (!best || d < best.d) best = { kind: c.kind, d };
    }
    return best;
  };
  const npcs = new NPCSystem(scene, () => ({
    night: ATMOS.night, weather: ATMOS.weather, counts: gameplay.counts(),
    day: sky.days, heli: nearestHeli(), job: missions.job,
    fc: player.perks.radio && sky.forecast ? sky.forecastName() : null,
  }));
  npcs.aviation = aviation; // B1 bystander schedule/flight queries (property pattern)
  const missions = new MissionSystem(scene, gameplay, player, (m) => hud.toast(m), (k) => audio.chime(k));
  const dog = new DogSystem(scene, player);
  dog.onBark = () => audio.bark();
  const springer = new SpringerSystem(scene);
  springer.onBark = () => audio.bark();
  const rabbits = new RabbitSystem(scene);
  brands.onHum = (d) => audio.datacenterHum(d); // Lone Star Compute proximity hum (audio built at line 70)
  applyGear(gameplay.save, player, dog); // saved shop upgrades take effect at boot
  const travel = new TravelMenu(player, gameplay, sky, npcs, missions, dog, (m) => hud.toast(m), (k) => audio.chime(k),
    (on) => setPause(on ? 'menu' : null));
  const trains = new TrainSystem(scene);
  const maritime = new MaritimeSystem(scene, sky, LANDMARKS);
  const energy = new EnergySystem(scene, gameplay, sky, scenery);
  energy.onToast = (m) => hud.toast(m); // approach announcer — real names on the HUD
  // Water Vehicles W3: marina sites join the announcer (register() only — law)
  for (const m of maritime.marinas) energy.register(m.x, m.z, 14, `⚓ ${m.name}`);
  const shoulder = new ShoulderSystem(scene);
  shoulder.onToast = (m) => hud.toast(m);
  shoulder.onStone = (key, label) => gameplay.stampStone(key, label);
  const heli = new HeliSystem(scene, maritime);
  const blimp = new BlimpSystem(scene);
  const military = new MilitaryAirSystem(scene);
  radio.helis = heli; radio.militaryAir = military; // A3 scanner sources (property pattern, like onRadio)
  trains.onHorn = () => audio.trainHorn();
  trains.onIdentity = (text) => hud.toast(text);
  trains.onChatter = (text, voice) => { audio.radio(text, { voice }); hud.subtitle(text, `📻 rail radio`); };
  // Sea W2: vessel placards + channel 16 (the trains idiom, sea register)
  maritime.onIdentity = (text) => hud.toast(text);
  maritime.onChatter = (text, voice) => { audio.radio(text, { voice }); hud.subtitle(text, `📻 channel 16`); };
  // Sea-Industry W3: shrimp rig payout + fish finder sonar toasts
  maritime.onCatch = (pay, msg) => {
    if (pay > 0) { gameplay.save.bank += pay; gameplay.persist(); audio.chime('cash'); }
    hud.toast(msg);
  };
  animals.onSonar = (msg) => hud.toast(msg);
  traffic.onHonk = (type) => audio.honk(type);
  traffic.groundYAt = (x, z) => groundYAt(x, z) ?? brandGroundYAt(x, z);
  animals.onSound = (kind) => audio[kind]?.();
  const ufo = new UFOSystem(scene, () => gameplay.ufoSighting());
  const haunts = new HauntSystem(scene,
    (k) => gameplay.spotLegend(k, LEGENDS[k].name, LEGEND_COUNT, LEGENDS[k].fact),
    (d) => audio.bell(d));
  ferries.onBoard = (name) => hud.toast(`⛴️ ${name} — no schedule, no rush`);
  ferries.onBell = (d) => audio.bell(d);
  npcs.onDialog = (d) => hud.dialog(d);
  npcs.onTalk = () => audio.chime('dialog');
  sky.onBolt = () => audio.thunder();
  gameplay.onCollect = (kind) => audio.chime(kind);
  player.onStep = () => audio.step();
  player.onThrust = () => audio.jetWhomp();
  player.onWorldEdge = (m) => hud.toast(m);
  const flares = new FlareSystem(scene, player);
  flares.onSound = (kind) => audio.flare(kind);
  // Curated new-game start (New Player W2): interpolated onto the I-35
  // New Braunfels→San Antonio approach — skyline ahead, the Alamo minutes
  // down the road. Heading runs the road southwest into town.
  const SA_START = { x: 985, z: 1737, heading: 1.582 };
  // Title screen: logic always built (debug.js's "always built, presentation
  // gated" rule) — window.__harness (tools/verify.mjs) never shows it, so
  // every suite keeps its current boot behavior. Real boots show it over the
  // live attract drift (the loop's title branch below) until Continue/New game.
  const title = new TitleScreen(gameplay, player, sky, () => {
    player.spawnAt(SA_START.x, SA_START.z);
    player.heading = SA_START.heading;
    player.setMode('DRIVE');
    player.speed = 0; player.vy = 0;
  }, SA_START, { hud, brands, missions, dog });
  const tutorial = new Tutorial(gameplay, (m) => hud.toast(m));
  const controlsBar = new ControlsBar(gameplay, hud);
  document.getElementById('controls-bar-close').addEventListener('click', () => controlsBar.dismiss());
  // W3: Settings panel (pause + title) drives the same functions the keybinds
  // call; Guide (inside help) replays the intro card + every tip and hint.
  const settings = initSettings({ audio, hud, missions, brands });
  settings.mount(document.getElementById('paused'));
  settings.mount(document.getElementById('title'));
  title.onShow = () => settings.refresh();
  buildGuide();
  const perf = new PerfMonitor(); // lap timing for every system in the render loop below
  const debug = initDebug({ player, sky, haunts, ufo, hud, aviation, radio, heli, blimp, military, missions, animals, gameplay, title, tutorial, perf, trains, dog, maritime }); // panel only with ?debug=1; actions drive the verify suite
  player.flares = flares; // hud reads the rack count off the player

  // Harness/boot spawn on I-35 just south of Austin (suites depend on it);
  // a real New game re-spawns at SA_START via the title callback above.
  const austin = GEO.cities.find((c) => c.name === 'Austin');
  player.spawnAt(austin.x, austin.z + 12);
  // building meshes near the player, for camera occlusion
  player.getObstacles = () =>
    [...cities.live.values()].map((g) => g.children.find((c) => c.isInstancedMesh)).filter(Boolean);

  let plaqueOpen = false;
  // Unifies gameplay's historical-marker plaques with brands' LSC ID-sign
  // plaque (DATACENTER_SIGN_SPEC.md) behind one shape/one `plaqueOpen` name,
  // so only one plaque source is ever open at a time and walking from one
  // straight to the other closes-then-opens cleanly.
  const plaqueNear = (pos, range) => {
    const lm = gameplay.landmarkNear(pos, range);
    if (lm) return { name: lm.name, hint: 'read the historical marker', dialog: { name: '\u{1F4DC} ' + lm.name, text: lm.fact } };
    const lsc = brands.lscNear(pos, range);
    if (lsc) return { name: lsc.name, hint: 'read the datacenter sign', dialog: { name: '\u{1F5A5}\uFE0F Lone Star Compute — ' + lsc.name, sub: lsc.sign.tagline, text: lsc.sign.fact } };
    const sea = maritime.plaqueNear(pos, range); // shelf plaques: Tidelands buoy + the Far Rig
    if (sea) return { name: sea.name, hint: sea.hint, dialog: { name: '⚓ ' + sea.name, sub: sea.sub, text: sea.text } };
    const ln = shoulder.plaqueNear(pos, range); // W6a line plaques: Neutral Ground, straddle, WinBig, Corner Stones
    if (ln) return { name: ln.name, hint: ln.hint, dialog: { name: ln.icon + ' ' + ln.name, sub: ln.sub, text: ln.text } };
    const en = energy.plaqueNear(pos, range); // Energy W4 hero-skyline brass
    if (en) return { name: en.name, hint: en.hint, dialog: { name: '🏭 ' + en.name, sub: en.sub, text: en.text } };
    return null;
  };
  let hornCd = 0;
  // Pause: the render loop freezes every system update (see setAnimationLoop) and
  // audio suspends; Esc is context-aware — it dismisses an open menu first, and
  // only toggles pause when nothing else is showing.
  // Two things freeze the world, so this is a reason and not a boolean: 'esc' is
  // the pause screen (banner + swallows every key but Esc), 'menu' is the travel
  // menu freezing the world silently while you browse. A boolean can't tell them
  // apart, and 'menu' must NOT swallow keys — P and Esc are how the menu closes.
  let pauseReason = null; // 'esc' | 'menu' | null
  const skipTipsBtn = document.getElementById('paused-skiptips');
  skipTipsBtn.addEventListener('click', () => {
    tutorial.skip();
    skipTipsBtn.style.display = 'none';
    hud.toast('💡 Tips off for this save');
  });
  const setPause = (reason) => {
    pauseReason = reason;
    hud.setPaused(reason === 'esc');
    // mid-stream tips skip (spec: same total effect as the card's Skip) —
    // only offered while tips are still pending
    if (reason === 'esc') { skipTipsBtn.style.display = tutorial.pending ? '' : 'none'; settings.refresh(); }
    if (reason) audio.freeze(); else audio.unfreeze();
  };
  const setPaused = (on) => setPause(on ? 'esc' : null);
  // Save & quit to title: write the resume snapshot then reload — a reload
  // lands back on the genuine pre-loop title screen (Continue populated),
  // which is exactly the state a browser close/reopen already preserves.
  document.getElementById('paused-quit').addEventListener('click', () => {
    gameplay.snapshotAt(player, sky);
    gameplay.persist();
    location.reload();
  });
  addEventListener('keydown', (e) => {
    // Title screen (and intro card) swallow everything — buttons are the only
    // way in, and no game key may mutate state while the attract drift runs.
    if (title.active) return;
    // The pause screen swallows every key but Esc, so nothing sneaks through while
    // paused. A travel-menu freeze deliberately doesn't — P and Esc must reach the
    // handlers below that close it (and P can't escape an Esc pause: no menu open).
    if (pauseReason === 'esc' && e.code !== 'Escape') return;
    // Space is the horn in DRIVE (climb in FLY): scatters critters, startles townsfolk
    if (e.code === 'Space' && player.mode === 'DRIVE' && !e.repeat && performance.now() > hornCd) {
      hornCd = performance.now() + 400;
      audio.honk('player');
      animals.scare(player.pos.x, player.pos.z, 26);
      npcs.startle(player.pos, 15);
      dog.honked();
    }
    if (e.code === 'KeyV') player.cycleMode();
    if (e.code === 'KeyM') hud.toggleBigMap();
    if (e.code === 'KeyH') hud.toggleHelp(gameplay.save.stats, gameplay.save.ufo, gameplay.save.bank, gameplay.save.jobsDone);
    if (e.code === 'KeyZ') hud.big.style.display === 'block' ? hud.cycleBigZoom() : hud.cycleZoom();
    if (e.code === 'KeyC') hud.toggleCompass();
    if (e.code === 'KeyG') hud.toast(missions.toggleArrow() ? '🧭 Guide arrow on' : '🧭 Guide arrow off');
    if (e.code === 'KeyL' && !e.repeat) hud.toast(player.toggleFlashlight() ? '🔦 Flashlight on' : '🔦 Flashlight off');
    if (e.code === 'KeyP') travel.toggle();
    if (e.code === 'Escape') {
      if (travel.el.style.display === 'flex') travel.close();
      else if (hud.els.help.style.display === 'block') hud.toggleHelp();
      else if (hud.big.style.display === 'block') hud.toggleBigMap();
      else setPaused(!pauseReason);
    }
    if (e.code === 'KeyN') hud.toast(audio.toggleMute() ? '🔇 Muted' : '🔊 Sound on');
    if (e.code === 'Equal' || e.code === 'NumpadAdd') hud.toast(`🔍 UI size ${hud.uiScale(1)}`);
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') hud.toast(`🔍 UI size ${hud.uiScale(-1)}`);
    if (e.code === 'BracketRight') hud.toast(`🏪 Brand size ${brands.setScale(brands.scale + 0.05)}`);
    if (e.code === 'BracketLeft') hud.toast(`🏪 Brand size ${brands.setScale(brands.scale - 0.05)}`);
    if (e.code === 'KeyR') player.resetToRoad();
    if (e.code === 'KeyE') {
      if (!npcs.interact(player.pos) && !springer.interact(player.pos)) {
        const near = plaqueNear(player.pos, 28);
        if (near && near.name !== plaqueOpen) {
          // open (or switch straight to) this plaque
          hud.dialog(near.dialog);
          plaqueOpen = near.name;
        } else if (plaqueOpen) {
          hud.dialog(null);
          plaqueOpen = false;
        }
      } else plaqueOpen = false;
    }
    if (e.code === 'Space') e.preventDefault();
  });
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  document.getElementById('loading').style.display = 'none';
  // Entry: onEnter fires on every title dismissal — the real boot and any
  // debug firstRun replay — so the welcome + tip arming can't be missed.
  // Harness bypass: the title never shows, the loop below never takes the
  // attract branch, and the toast fires pre-loop exactly as before — every
  // existing suite keeps passing unmodified. (W1's literal pre-loop await
  // gave way to the attract branch: the world now runs behind the title.)
  title.onEnter = () => {
    hud.toast('🤠 Welcome to Texas! Press H for controls.');
    tutorial.begin();
    controlsBar.begin();
  };
  if (!window.__harness) title.awaitChoice();
  else hud.toast('🤠 Welcome to Texas! Press H for controls.');
  const clock = new THREE.Clock();
  // debug/testing hook — tools/verify.mjs drives the game through this; expose every new system here
  // (clock gives tests sim time: headless frames run slow, wall-clock waits mislead)
  // W3 hint signals: npc/dusk are cheap and set per frame; cityEdge/band/apron
  // ride the 12 Hz hud block (their inputs live there). Stale-by-80ms is fine —
  // every trigger is a lingering state, not an edge.
  const hintSig = { npc: false, cityEdge: false, dusk: false, apron: false, band: false, water: false };
  window.__game = { player, gameplay, GEO, scene, animals, bats, turtles, ferries, dolphins, sky, npcs, trains, ufo, haunts, traffic, missions, travel, dog, springer, rabbits, flares, scenery, cities, brands, airports, aviation, radio, heli, blimp, military, maritime, energy, shoulder, swampAt, shoulderClear, audio, AIRPORTS, airportClear, fieldNear, airportLayout, windFrom, runwayInUse, padAt, groundYAt, brandGroundYAt, daySchedule, AIRLINES, chatterLine, HELI_ID, chatterVoices, debug, hud, perf, nearestRoad, nearestBandRoad, nearestAnyRoad, nearestRiver, nearestCity, inTexas, inTexasOrBand, onIsland, beachAt, boatableAt, borderDist, terrainMeshY, toLatLon, ELEV, SEA_Y, LAKE_OFFSET, RIVER_OFFSET, CAUSEWAY, padreSites, inWorld, borderZoneAt, outsideAt, inStateWater, coastDist, TIDELANDS_U, hAt, seededRand, neighborStateAt, bandTint, neighborCountyAt, agAt, bandAgAt, energyAt, countyAt, chapelSitesNear, farmsteadAt, feedlotAt, fieldAt, ranchHQSite, ranchHQAt, wellSiteAt, windTurbinesAt, solarSitesAt, brandNear, cityClear, waterAt, LANDMARKS, ATMOS, clock, SPECIES, LEGENDS, title, tutorial, controlsBar, settings, slots, hintSig, setPaused, isPaused: () => pauseReason === 'esc', isFrozen: () => !!pauseReason };

  let hudTick = 0;
  let lastForecast = null; // weather-radio announcement edge detector
  let lastCauseway = -Infinity; // causeway ceremony cooldown (sim seconds)
  // crossing ceremony (W6a): which land the player last stood on ('tx'/'band');
  // water and the shelf are null so ferries and the Gulf never trigger it
  let lastSide = 'tx', lastCrossT = -Infinity, returnCount = 0;
  perf.drawFrame = () => { renderer.render(scene, camera); perf.captureRender(renderer); }; // renderProbe: one true frame even under __skipRender
  perf.auditPlan = () => { // drawAudit (W3) sources — disjoint groups + the per-kind scenery split
    const detail = {};
    for (const g of scenery.live.values())
      for (const c of g.children) (detail[c.userData.kind ?? 'untagged'] ??= []).push(c);
    return {
      groups: {
        scenery: [...scenery.live.values()],
        cities: [...cities.live.values()],
        traffic: [...Object.values(traffic.meshes), ...Object.values(traffic.lampMeshes)],
        animals: [...animals.live.values()].map((e) => e.group),
      },
      detail,
    };
  };
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    // Title/attract: the world lives, the player doesn't. Camera drifts around
    // the resume (or curated) spot; the proximity systems that take explicit
    // coords feed on the drift position so clouds roll, traffic drives and
    // windmills spin behind the title. No player.update, no key handling
    // (guarded above), no save writes.
    if (title.active) {
      const a = title.attract(dt, camera);
      sky.update(dt, false, a.x, a.z, camera.position.y);
      scenery.update(dt, a.x, a.z);
      cities.update(a.x, a.z);
      cities.setNight(ATMOS.night);
      traffic.update(dt, a.x, a.z, 0);
      traffic.setNight(ATMOS.night);
      if (!window.__skipRender) renderer.render(scene, camera);
      return;
    }
    // Paused: keep draining the clock every frame (so resume gets a normal ~16 ms
    // dt, never a pause-long jump — clock.elapsedTime stays honest & monotonic) and
    // re-draw the frozen frame, but skip every system update below. The only system
    // reading elapsedTime (maritime's ±0.06-unit ship bob) merely snaps phase on
    // resume; its lane travel is dt-integrated, so nothing teleports.
    if (pauseReason) {
      if (!window.__skipRender) renderer.render(scene, camera);
      return;
    }
    perf.frame(); // each perf.lap(name) below charges the span since the previous lap to that system
    // ferries drive player.pos/heading directly while aboard — must run before
    // player.update() so its avatar/camera stamp picks up the fresh position
    ferries.update(dt, clock.elapsedTime); perf.lap('ferries');
    dolphins.update(dt, clock.elapsedTime); perf.lap('dolphins');
    player.update(dt); perf.lap('player');
    sky.update(dt, player.keys['KeyT'], player.pos.x, player.pos.z, player.pos.y); perf.lap('sky');
    scenery.update(dt, player.pos.x, player.pos.z); perf.lap('scenery');
    airports.update(dt, sky.days); perf.lap('airports');
    aviation.update(dt, player.pos.x, player.pos.z, sky.days); perf.lap('aviation');
    cities.update(player.pos.x, player.pos.z);
    cities.setNight(ATMOS.night); perf.lap('cities');
    brands.update(player.pos.x, player.pos.z, dt); perf.lap('brands');
    traffic.update(dt, player.pos.x, player.pos.z, player.pos.y);
    traffic.setNight(ATMOS.night); perf.lap('traffic');
    trains.update(dt, player.pos.x, player.pos.z, sky.days, player.perks.radio); perf.lap('trains');
    maritime.update(dt, clock.elapsedTime, player);
    animals.seaFlocks = maritime.workingShrimpers(); // Sea W2 gull bridge — no animals→maritime import
    perf.lap('maritime');
    energy.update(dt, player.pos.x, player.pos.z); perf.lap('energy');
    heli.update(dt, player.pos.x, player.pos.z, sky.days); perf.lap('heli');
    blimp.update(dt, sky.days); perf.lap('blimp');
    military.update(dt, player.pos.x, player.pos.z, aviation);
    audio.heli(heli.nearestAirborneDist(player.pos.x, player.pos.z)); perf.lap('military');
    ufo.update(dt, player.pos.x, player.pos.z, player.pos.y); perf.lap('ufo');
    haunts.update(dt, player.pos.x, player.pos.z, sky.t, sky.days); perf.lap('haunts');
    shoulder.update(dt, player.pos.x, player.pos.z); perf.lap('shoulder');
    flares.update(dt); perf.lap('flares');
    dog.update(dt); perf.lap('dog');
    springer.update(dt, player.pos); perf.lap('springer');
    rabbits.update(dt, player.pos, player.mode); perf.lap('rabbits');
    ATMOS.ufo = ufo.near;
    radio.update(dt, player, aviation, sky); perf.lap('radio');
    animals.update(dt, player.pos.x, player.pos.z, player.pos.y - hAt(player.pos.x, player.pos.z));
    animals.sonar(player, dt); perf.lap('animals');
    bats.update(dt, player.pos.x, player.pos.z, sky.t); perf.lap('bats');
    turtles.update(dt, player.pos.x, player.pos.z, sky.t, sky.days); perf.lap('turtles');
    audio.lap(beachAt(player.pos.x, player.pos.z) ? 1 : 0); // shore-lap term (W2)
    audio.update(player, ATMOS); perf.lap('audio');
    gameplay.update(dt, player.pos, ATMOS.night, player.speed, player, sky);
    gameplay.checkTouchdown(player, missions.job?.kind === 'charter'); perf.lap('gameplay');
    missions.update(dt, player.pos, player.mode, player.pos.y - hAt(player.pos.x, player.pos.z)); perf.lap('missions');
    hud.animateShield(player, dt); // per-frame sway/float — headless too, not gated by __skipRender
    const npcName = npcs.update(dt, player.pos); perf.lap('npcs');
    hintSig.npc = !!npcName;
    hintSig.dusk = ATMOS.night >= 0.5;
    hintSig.water = player.atWaterline; // lingering while parked facing water, not an edge
    tutorial.update(dt, hintSig);
    controlsBar.update(dt);
    const skyHint = npcName ? null : springer.nearHint(player.pos);
    const pNear = (npcName || skyHint) ? null : plaqueNear(player.pos, 28);
    hud.interactHint(npcName ? `talk to ${npcName}` : skyHint ? skyHint
      : pNear && pNear.name !== plaqueOpen ? pNear.hint : null);
    hud.brandSizeHint(player.mode !== 'FLY' && brandNear(player.pos.x, player.pos.z, 60));
    // ground-level nature readout — crop underfoot and nearest wildlife each own a
    // slot and never suppress each other; both are suppressed in FLY.
    const ground = player.mode !== 'FLY';
    const field = ground ? fieldAt(player.pos.x, player.pos.z) : null;
    hud.natureHint(
      field ? `🌾 ${field.crop[0].toUpperCase()}${field.crop.slice(1)}` : null,
      ground && animals.nearby ? `🐾 ${SPECIES[animals.nearby.species].name}` : null);
    // walked away from an open plaque (either source): close it
    if (plaqueOpen && (!pNear || pNear.name !== plaqueOpen) && !plaqueNear(player.pos, 40)) {
      hud.dialog(null);
      plaqueOpen = false;
    }
    perf.lap('hints'); // tutorial + controls bar + interact/nature hint scans since the npcs lap
    // HUD text/minimap at ~12 Hz — nearestCity/nearestRoad every frame is wasteful
    hudTick += dt;
    if (hudTick > 0.08) {
      const county = countyAt(player.pos.x, player.pos.z);
      gameplay.enterCounty(county, hudTick);
      let ncNow = null;
      if (!county) {
        const nc = neighborCountyAt(player.pos.x, player.pos.z);
        ncNow = nc;
        gameplay.enterBandCounty(nc ? `${nc.name}, ${NEIGHBOR_STATE_NAME[nc.state]}` : null, hudTick);
        // inWorld-gated: a point past the shoulder is the soft wall's territory,
        // not a place you can linger — no Passport stamp (and no toast race
        // against the wall's own push-back message) for a spot you're being
        // actively rejected from.
        if (nc && inWorld(player.pos.x, player.pos.z)) gameplay.stampState(nc.state, NEIGHBOR_STATE_NAME[nc.state]);
      }
      // crossing ceremony (W6a): leaving is a murmur, coming home is a chime.
      // Land-to-land transitions only — river/water gaps pass through as null,
      // and the 8 s cooldown swallows boundary zigzag.
      const side = county ? 'tx' : ncNow ? 'band' : null;
      if (side && side !== lastSide && clock.elapsedTime - lastCrossT > 8) {
        lastCrossT = clock.elapsedTime;
        if (side === 'band') hud.toast("You're leaving Texas. It'll be here.");
        else {
          audio.chime('texas');
          // occasional, seeded on the return count — new stream, never rename
          if (seededRand('missus:' + ++returnCount)() < 0.3) hud.toast('Miss us? 🤠');
        }
      }
      if (side) lastSide = side;
      // W3 hint signals that need this block's county work (guarded: veterans
      // are seen.all and skip the nearestCity/airportClear cost entirely)
      if (tutorial.active && !gameplay.save.seen.all) {
        const { city, dist } = nearestCity(player.pos.x, player.pos.z);
        hintSig.cityEdge = !!city && dist < cityRadius(city.pop);
        hintSig.band = !county && !!ncNow;
        hintSig.apron = player.mode !== 'FLY' && !!airportClear(player.pos.x, player.pos.z);
      } else {
        // never let a signal go stale across an inactive stretch — a re-arm
        // must read this tick's world, not the last armed one's
        hintSig.cityEdge = hintSig.band = hintSig.apron = false;
      }
      audio.swamp = swampAt(player.pos.x, player.pos.z); // frog country factor
      const road = player.mode !== 'FLY' ? nearestRoad(player.pos.x, player.pos.z, 6) : null;
      const rail = player.mode !== 'FLY' ? nearestRail(player.pos.x, player.pos.z, 12) : null;
      // Queen Isabella Causeway ceremony — a crossing, not a collectible
      if (player.mode === 'DRIVE' && clock.elapsedTime - lastCauseway > 120) {
        const cdx = CAUSEWAY.x2 - CAUSEWAY.x1, cdz = CAUSEWAY.z2 - CAUSEWAY.z1;
        const t = Math.max(0, Math.min(1, ((player.pos.x - CAUSEWAY.x1) * cdx + (player.pos.z - CAUSEWAY.z1) * cdz) / (cdx * cdx + cdz * cdz)));
        if (Math.hypot(CAUSEWAY.x1 + cdx * t - player.pos.x, CAUSEWAY.z1 + cdz * t - player.pos.z) < 4) {
          lastCauseway = clock.elapsedTime;
          hud.toast('🌉 Queen Isabella Causeway — the only road to South Padre Island');
          audio.chime('county');
        }
      }
      hud.mission = missions.hudInfo(player.pos);
      if (sky.forecast !== lastForecast) { // weather radio breaks in on a fresh forecast
        if (sky.forecast && player.perks.radio) hud.toast(`📻 Weather radio: ${sky.forecastName()} rolling in`);
        lastForecast = sky.forecast;
      }
      hud.update(player, gameplay.counts(), road, rail, waterAt(player.pos.x, player.pos.z), sky.clockString(), sky.weatherIcon(), gameplay.save.stats, sky.skyReport(player.heading), county, player.perks.radio ? sky.forecastLine() : null);
      hud.updateTags(radio.sources, camera); // A5: aircraft tags share the scanner's enumeration
      hudTick = 0;
      perf.lap('hud'); // 12 Hz block only — n ticks slower than per-frame laps by design
    }
    // headless verify sets __skipRender: every system above still ticks at full
    // rAF speed, only the SwiftShader draw (~300 ms/frame) is skipped; t.shot
    // clears it for one frame when a screenshot genuinely needs pixels
    if (!window.__skipRender) { renderer.render(scene, camera); perf.captureRender(renderer); perf.lap('render'); }
  });
}

boot().catch((e) => {
  status('Failed to load: ' + e.message);
  console.error(e);
});
