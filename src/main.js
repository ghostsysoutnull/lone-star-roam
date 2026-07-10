// Lone Star Roam — bootstrap & game loop
import * as THREE from 'three';
import { loadGeo, GEO, nearestRoad, waterAt, countyAt, hAt } from './geo.js';
import { buildWorld } from './world.js';
import { CitySystem } from './cities.js';
import { Player } from './vehicle.js';
import { Gameplay } from './gameplay.js';
import { TrafficSystem } from './traffic.js';
import { AnimalSystem, SPECIES, SPECIES_COUNT } from './animals.js';
import { SkySystem, ATMOS } from './sky.js';
import { TravelMenu } from './travel.js';
import { AudioSystem } from './audio.js';
import { NPCSystem } from './npcs.js';
import { TrainSystem } from './trains.js';
import { MaritimeSystem } from './maritime.js';
import { UFOSystem } from './ufo.js';
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
  const animals = new AnimalSystem(scene, (key) => gameplay.spotSpecies(key, SPECIES[key].name, SPECIES_COUNT));
  const hud = new HUD();

  gameplay.onToast = (m) => hud.toast(m);
  const audio = new AudioSystem();
  const npcs = new NPCSystem(scene, () => ({ night: ATMOS.night, weather: ATMOS.weather, counts: gameplay.counts() }));
  const travel = new TravelMenu(player, gameplay, sky, npcs, (m) => hud.toast(m));
  const trains = new TrainSystem(scene);
  const maritime = new MaritimeSystem(scene);
  trains.onHorn = () => audio.trainHorn();
  const ufo = new UFOSystem(scene, () => gameplay.ufoSighting());
  npcs.onDialog = (d) => hud.dialog(d);
  npcs.onTalk = () => audio.chime('dialog');
  sky.onBolt = () => audio.thunder();
  gameplay.onCollect = (kind) => audio.chime(kind);
  player.onStep = () => audio.step();

  // Spawn on I-35 just south of Austin
  const austin = GEO.cities.find((c) => c.name === 'Austin');
  player.spawnAt(austin.x, austin.z + 12);
  // building meshes near the player, for camera occlusion
  player.getObstacles = () =>
    [...cities.live.values()].map((g) => g.children.find((c) => c.isInstancedMesh)).filter(Boolean);

  addEventListener('keydown', (e) => {
    if (e.code === 'KeyV') player.cycleMode();
    if (e.code === 'KeyM') hud.toggleBigMap();
    if (e.code === 'KeyH') hud.toggleHelp(gameplay.save.stats, gameplay.save.ufo);
    if (e.code === 'KeyZ') hud.cycleZoom();
    if (e.code === 'KeyP') travel.toggle();
    if (e.code === 'Escape') travel.close();
    if (e.code === 'KeyN') hud.toast(audio.toggleMute() ? '🔇 Muted' : '🔊 Sound on');
    if (e.code === 'KeyR') player.resetToRoad();
    if (e.code === 'KeyE') npcs.interact(player.pos);
    if (e.code === 'Space') e.preventDefault();
  });
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  document.getElementById('loading').style.display = 'none';
  hud.toast('🤠 Welcome to Texas! Press H for controls.');
  window.__game = { player, gameplay, GEO, animals, sky, npcs, trains, ufo }; // debug/testing hook

  const clock = new THREE.Clock();
  let hudTick = 0;
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    player.update(dt);
    sky.update(dt, player.keys['KeyT'], player.pos.x, player.pos.z, player.pos.y);
    scenery.update(dt, player.pos.x, player.pos.z);
    cities.update(player.pos.x, player.pos.z);
    cities.setNight(ATMOS.night);
    traffic.update(dt, player.pos.x, player.pos.z);
    traffic.setNight(ATMOS.night);
    trains.update(dt, player.pos.x, player.pos.z);
    maritime.update(dt, clock.elapsedTime);
    ufo.update(dt, player.pos.x, player.pos.z, player.pos.y);
    ATMOS.ufo = ufo.near;
    animals.update(dt, player.pos.x, player.pos.z, player.pos.y - hAt(player.pos.x, player.pos.z));
    audio.update(player, ATMOS);
    gameplay.update(dt, player.pos, ATMOS.night, player.speed);
    hud.interactHint(npcs.update(dt, player.pos));
    // HUD text/minimap at ~12 Hz — nearestCity/nearestRoad every frame is wasteful
    hudTick += dt;
    if (hudTick > 0.08) {
      const county = countyAt(player.pos.x, player.pos.z);
      gameplay.enterCounty(county, hudTick);
      const road = player.mode !== 'FLY' ? nearestRoad(player.pos.x, player.pos.z, 6) : null;
      hud.update(player, gameplay.counts(), road, waterAt(player.pos.x, player.pos.z), sky.clockString(), sky.weatherIcon(), gameplay.save.stats, sky.skyReport(player.heading), county);
      hudTick = 0;
    }
    renderer.render(scene, camera);
  });
}

boot().catch((e) => {
  status('Failed to load: ' + e.message);
  console.error(e);
});
