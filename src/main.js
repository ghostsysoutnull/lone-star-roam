// Lone Star Roam — bootstrap & game loop
import * as THREE from 'three';
import { loadGeo, GEO, nearestRoad, waterAt, countyAt, hAt, inTexas, seededRand } from './geo.js';
import { buildWorld, chapelSitesNear } from './world.js';
import { HauntSystem, LEGENDS, LEGEND_COUNT } from './haunts.js';
import { CitySystem } from './cities.js';
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
  const cities = new CitySystem(scene);
  const player = new Player(scene, camera);
  const gameplay = new Gameplay(scene);
  const traffic = new TrafficSystem(scene);
  const animals = new AnimalSystem(scene, (key) => gameplay.spotSpecies(key, SPECIES[key].name, SPECIES_COUNT, SPECIES[key].fact));
  const bats = new BatSystem(scene, () => gameplay.spotSpecies('bat', SPECIES.bat.name, SPECIES_COUNT, SPECIES.bat.fact));
  const hud = new HUD();

  gameplay.onToast = (m) => hud.toast(m);
  const audio = new AudioSystem();
  const npcs = new NPCSystem(scene, () => ({ night: ATMOS.night, weather: ATMOS.weather, counts: gameplay.counts() }));
  const missions = new MissionSystem(scene, gameplay, player, (m) => hud.toast(m), (k) => audio.chime(k));
  const dog = new DogSystem(scene, player);
  dog.onBark = () => audio.bark();
  applyGear(gameplay.save, player, dog); // saved shop upgrades take effect at boot
  const travel = new TravelMenu(player, gameplay, sky, npcs, missions, dog, (m) => hud.toast(m), (k) => audio.chime(k));
  const trains = new TrainSystem(scene);
  const maritime = new MaritimeSystem(scene);
  trains.onHorn = () => audio.trainHorn();
  traffic.onHonk = (type) => audio.honk(type);
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
  const flares = new FlareSystem(scene, player);
  flares.onSound = (kind) => audio.flare(kind);
  player.flares = flares; // hud reads the rack count off the player

  // Spawn on I-35 just south of Austin
  const austin = GEO.cities.find((c) => c.name === 'Austin');
  player.spawnAt(austin.x, austin.z + 12);
  // building meshes near the player, for camera occlusion
  player.getObstacles = () =>
    [...cities.live.values()].map((g) => g.children.find((c) => c.isInstancedMesh)).filter(Boolean);

  let plaqueOpen = false;
  let hornCd = 0;
  addEventListener('keydown', (e) => {
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
    if (e.code === 'KeyP') travel.toggle();
    if (e.code === 'Escape') travel.close();
    if (e.code === 'KeyN') hud.toast(audio.toggleMute() ? '🔇 Muted' : '🔊 Sound on');
    if (e.code === 'Equal' || e.code === 'NumpadAdd') hud.toast(`🔍 UI size ${hud.uiScale(1)}`);
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') hud.toast(`🔍 UI size ${hud.uiScale(-1)}`);
    if (e.code === 'KeyR') player.resetToRoad();
    if (e.code === 'KeyE') {
      if (!npcs.interact(player.pos)) {
        const lm = gameplay.landmarkNear(player.pos, 28);
        if (lm && lm.name !== plaqueOpen) {
          // open (or switch straight to) this landmark's marker
          hud.dialog({ name: '\u{1F4DC} ' + lm.name, text: lm.fact });
          plaqueOpen = lm.name;
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
  window.__game = { player, gameplay, GEO, animals, bats, sky, npcs, trains, ufo, haunts, traffic, missions, travel, dog, flares, scenery, hud, nearestRoad, inTexas, hAt, seededRand, chapelSitesNear, ATMOS, clock, SPECIES, LEGENDS };

  let hudTick = 0;
  let lastForecast = null; // weather-radio announcement edge detector
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    player.update(dt);
    sky.update(dt, player.keys['KeyT'], player.pos.x, player.pos.z, player.pos.y);
    scenery.update(dt, player.pos.x, player.pos.z);
    cities.update(player.pos.x, player.pos.z);
    cities.setNight(ATMOS.night);
    traffic.update(dt, player.pos.x, player.pos.z, player.pos.y);
    traffic.setNight(ATMOS.night);
    trains.update(dt, player.pos.x, player.pos.z);
    maritime.update(dt, clock.elapsedTime);
    ufo.update(dt, player.pos.x, player.pos.z, player.pos.y);
    haunts.update(dt, player.pos.x, player.pos.z, sky.t, sky.days);
    flares.update(dt);
    dog.update(dt);
    ATMOS.ufo = ufo.near;
    animals.update(dt, player.pos.x, player.pos.z, player.pos.y - hAt(player.pos.x, player.pos.z));
    bats.update(dt, player.pos.x, player.pos.z, sky.t);
    audio.update(player, ATMOS);
    gameplay.update(dt, player.pos, ATMOS.night, player.speed);
    missions.update(dt, player.pos, player.mode, player.pos.y - hAt(player.pos.x, player.pos.z));
    const npcName = npcs.update(dt, player.pos);
    const lmNear = npcName ? null : gameplay.landmarkNear(player.pos, 28);
    hud.interactHint(npcName ? `talk to ${npcName}` : lmNear && lmNear.name !== plaqueOpen ? 'read the historical marker' : null);
    // walked away from an open plaque: close it
    if (plaqueOpen && (!lmNear || lmNear.name !== plaqueOpen) && !gameplay.landmarkNear(player.pos, 40)) {
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
