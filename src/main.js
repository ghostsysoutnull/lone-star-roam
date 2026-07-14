// Lone Star Roam — bootstrap & game loop
import * as THREE from 'three';
import { loadGeo, GEO, nearestRoad, waterAt, countyAt, hAt, inTexas, seededRand, agAt } from './geo.js';
import { buildWorld, chapelSitesNear, farmsteadAt, feedlotAt, fieldAt } from './world.js';
import { HauntSystem, LEGENDS, LEGEND_COUNT } from './haunts.js';
import { initDebug } from './debug.js';
import { CitySystem } from './cities.js';
import { BrandSystem, groundYAt as brandGroundYAt, brandNear } from './brands.js';
import { Player } from './vehicle.js';
import { Gameplay } from './gameplay.js';
import { TrafficSystem } from './traffic.js';
import { AnimalSystem, SPECIES, SPECIES_COUNT } from './animals.js';
import { BatSystem } from './bats.js';
import { SkySystem, ATMOS } from './sky.js';
import { TravelMenu } from './travel.js';
import { MissionSystem } from './missions.js';
import { AudioSystem } from './audio.js';
import { NPCSystem } from './npcs.js';
import { TrainSystem } from './trains.js';
import { MaritimeSystem } from './maritime.js';
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
  const hud = new HUD();

  gameplay.onToast = (m) => hud.toast(m);
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
  const travel = new TravelMenu(player, gameplay, sky, npcs, missions, dog, (m) => hud.toast(m), (k) => audio.chime(k));
  const trains = new TrainSystem(scene);
  const maritime = new MaritimeSystem(scene);
  const heli = new HeliSystem(scene, maritime);
  const blimp = new BlimpSystem(scene);
  const military = new MilitaryAirSystem(scene);
  radio.helis = heli; radio.militaryAir = military; // A3 scanner sources (property pattern, like onRadio)
  trains.onHorn = () => audio.trainHorn();
  traffic.onHonk = (type) => audio.honk(type);
  traffic.groundYAt = (x, z) => groundYAt(x, z) ?? brandGroundYAt(x, z);
  animals.onSound = (kind) => audio[kind]?.();
  const ufo = new UFOSystem(scene, () => gameplay.ufoSighting());
  const haunts = new HauntSystem(scene,
    (k) => gameplay.spotLegend(k, LEGENDS[k].name, LEGEND_COUNT, LEGENDS[k].fact),
    (d) => audio.bell(d));
  npcs.onDialog = (d) => hud.dialog(d);
  npcs.onTalk = () => audio.chime('dialog');
  sky.onBolt = () => audio.thunder();
  gameplay.onCollect = (kind) => audio.chime(kind);
  player.onStep = () => audio.step();
  player.onThrust = () => audio.jetWhomp();
  const flares = new FlareSystem(scene, player);
  flares.onSound = (kind) => audio.flare(kind);
  const debug = initDebug({ player, sky, haunts, ufo, hud, aviation, radio, heli, blimp, military, missions }); // panel only with ?debug=1; actions drive the verify suite
  player.flares = flares; // hud reads the rack count off the player

  // Spawn on I-35 just south of Austin
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
    return null;
  };
  let hornCd = 0;
  // Pause: the render loop freezes every system update (see setAnimationLoop) and
  // audio suspends; Esc is context-aware — it dismisses an open menu first, and
  // only toggles pause when nothing else is showing.
  let paused = false;
  const setPaused = (on) => {
    paused = on;
    hud.setPaused(on);
    if (on) audio.freeze(); else audio.unfreeze();
  };
  addEventListener('keydown', (e) => {
    // Frozen world swallows every key but Esc, so nothing sneaks through while paused
    if (paused && e.code !== 'Escape') return;
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
    if (e.code === 'KeyZ') hud.cycleZoom();
    if (e.code === 'KeyC') hud.toggleCompass();
    if (e.code === 'KeyG') hud.toast(missions.toggleArrow() ? '🧭 Guide arrow on' : '🧭 Guide arrow off');
    if (e.code === 'KeyL' && !e.repeat) hud.toast(player.toggleFlashlight() ? '🔦 Flashlight on' : '🔦 Flashlight off');
    if (e.code === 'KeyP') travel.toggle();
    if (e.code === 'Escape') {
      if (travel.el.style.display === 'flex') travel.close();
      else if (hud.els.help.style.display === 'block') hud.toggleHelp();
      else if (hud.big.style.display === 'block') hud.toggleBigMap();
      else setPaused(!paused);
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
  hud.toast('🤠 Welcome to Texas! Press H for controls.');
  const clock = new THREE.Clock();
  // debug/testing hook — tools/verify.mjs drives the game through this; expose every new system here
  // (clock gives tests sim time: headless frames run slow, wall-clock waits mislead)
  window.__game = { player, gameplay, GEO, animals, bats, sky, npcs, trains, ufo, haunts, traffic, missions, travel, dog, springer, rabbits, flares, scenery, cities, brands, airports, aviation, radio, heli, blimp, military, maritime, audio, AIRPORTS, airportClear, fieldNear, airportLayout, windFrom, runwayInUse, padAt, groundYAt, brandGroundYAt, daySchedule, AIRLINES, chatterLine, HELI_ID, chatterVoices, debug, hud, nearestRoad, inTexas, hAt, seededRand, agAt, countyAt, chapelSitesNear, farmsteadAt, feedlotAt, fieldAt, brandNear, ATMOS, clock, SPECIES, LEGENDS, setPaused, isPaused: () => paused };

  let hudTick = 0;
  let lastForecast = null; // weather-radio announcement edge detector
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    // Paused: keep draining the clock every frame (so resume gets a normal ~16 ms
    // dt, never a pause-long jump — clock.elapsedTime stays honest & monotonic) and
    // re-draw the frozen frame, but skip every system update below. The only system
    // reading elapsedTime (maritime's ±0.06-unit ship bob) merely snaps phase on
    // resume; its lane travel is dt-integrated, so nothing teleports.
    if (paused) {
      if (!window.__skipRender) renderer.render(scene, camera);
      return;
    }
    player.update(dt);
    sky.update(dt, player.keys['KeyT'], player.pos.x, player.pos.z, player.pos.y);
    scenery.update(dt, player.pos.x, player.pos.z);
    airports.update(dt, sky.days);
    aviation.update(dt, player.pos.x, player.pos.z, sky.days);
    cities.update(player.pos.x, player.pos.z);
    cities.setNight(ATMOS.night);
    brands.update(player.pos.x, player.pos.z, dt);
    traffic.update(dt, player.pos.x, player.pos.z, player.pos.y);
    traffic.setNight(ATMOS.night);
    trains.update(dt, player.pos.x, player.pos.z);
    maritime.update(dt, clock.elapsedTime);
    heli.update(dt, player.pos.x, player.pos.z, sky.days);
    blimp.update(dt, sky.days);
    military.update(dt, player.pos.x, player.pos.z, aviation);
    audio.heli(heli.nearestAirborneDist(player.pos.x, player.pos.z));
    ufo.update(dt, player.pos.x, player.pos.z, player.pos.y);
    haunts.update(dt, player.pos.x, player.pos.z, sky.t, sky.days);
    flares.update(dt);
    dog.update(dt);
    springer.update(dt, player.pos);
    rabbits.update(dt, player.pos, player.mode);
    ATMOS.ufo = ufo.near;
    radio.update(dt, player, aviation, sky);
    animals.update(dt, player.pos.x, player.pos.z, player.pos.y - hAt(player.pos.x, player.pos.z));
    bats.update(dt, player.pos.x, player.pos.z, sky.t);
    audio.update(player, ATMOS);
    gameplay.update(dt, player.pos, ATMOS.night, player.speed);
    gameplay.checkTouchdown(player, missions.job?.kind === 'charter');
    missions.update(dt, player.pos, player.mode, player.pos.y - hAt(player.pos.x, player.pos.z));
    hud.animateShield(player, dt); // per-frame sway/float — headless too, not gated by __skipRender
    const npcName = npcs.update(dt, player.pos);
    const skyHint = npcName ? null : springer.nearHint(player.pos);
    const pNear = (npcName || skyHint) ? null : plaqueNear(player.pos, 28);
    hud.interactHint(npcName ? `talk to ${npcName}` : skyHint ? skyHint
      : pNear && pNear.name !== plaqueOpen ? pNear.hint : null);
    hud.brandSizeHint(player.mode !== 'FLY' && brandNear(player.pos.x, player.pos.z, 60));
    // ground-level nature readout — wildlife beats crop/pivot, both suppressed in FLY
    if (player.mode === 'FLY') hud.natureHint(null);
    else if (animals.nearby) hud.natureHint(`🐾 ${SPECIES[animals.nearby.species].name}`);
    else {
      const field = fieldAt(player.pos.x, player.pos.z);
      hud.natureHint(field ? `🌾 ${field.crop[0].toUpperCase()}${field.crop.slice(1)}` : null);
    }
    // walked away from an open plaque (either source): close it
    if (plaqueOpen && (!pNear || pNear.name !== plaqueOpen) && !plaqueNear(player.pos, 40)) {
      hud.dialog(null);
      plaqueOpen = false;
    }
    // HUD text/minimap at ~12 Hz — nearestCity/nearestRoad every frame is wasteful
    hudTick += dt;
    if (hudTick > 0.08) {
      const county = countyAt(player.pos.x, player.pos.z);
      gameplay.enterCounty(county, hudTick);
      const road = player.mode !== 'FLY' ? nearestRoad(player.pos.x, player.pos.z, 6) : null;
      hud.mission = missions.hudInfo(player.pos);
      if (sky.forecast !== lastForecast) { // weather radio breaks in on a fresh forecast
        if (sky.forecast && player.perks.radio) hud.toast(`📻 Weather radio: ${sky.forecastName()} rolling in`);
        lastForecast = sky.forecast;
      }
      hud.update(player, gameplay.counts(), road, waterAt(player.pos.x, player.pos.z), sky.clockString(), sky.weatherIcon(), gameplay.save.stats, sky.skyReport(player.heading), county, player.perks.radio ? sky.forecastLine() : null);
      hud.updateTags(radio.sources, camera); // A5: aircraft tags share the scanner's enumeration
      hudTick = 0;
    }
    // headless verify sets __skipRender: every system above still ticks at full
    // rAF speed, only the SwiftShader draw (~300 ms/frame) is skipped; t.shot
    // clears it for one frame when a screenshot genuinely needs pixels
    if (!window.__skipRender) renderer.render(scene, camera);
  });
}

boot().catch((e) => {
  status('Failed to load: ' + e.message);
  console.error(e);
});
