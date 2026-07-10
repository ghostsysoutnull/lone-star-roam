// Lone Star Roam — bootstrap & game loop
import * as THREE from 'three';
import { loadGeo, GEO, nearestRoad } from './geo.js';
import { buildWorld } from './world.js';
import { CitySystem } from './cities.js';
import { Player } from './vehicle.js';
import { Gameplay } from './gameplay.js';
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

  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 30000);

  // Golden-hour Texas light
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  sun.position.set(-800, 900, 400);
  scene.add(sun, new THREE.AmbientLight(0xc8d8e8, 0.9));

  const scenery = buildWorld(scene);
  const cities = new CitySystem(scene);
  const player = new Player(scene, camera);
  const gameplay = new Gameplay(scene);
  const hud = new HUD();

  gameplay.onToast = (m) => hud.toast(m);
  gameplay.onDialog = (d) => hud.dialog(d);

  // Spawn on I-35 just south of Austin
  const austin = GEO.cities.find((c) => c.name === 'Austin');
  player.spawnAt(austin.x, austin.z + 12);

  addEventListener('keydown', (e) => {
    if (e.code === 'KeyV') player.cycleMode();
    if (e.code === 'KeyM') hud.toggleBigMap();
    if (e.code === 'KeyH') hud.toggleHelp();
    if (e.code === 'KeyR') player.resetToRoad();
    if (e.code === 'KeyE') gameplay.interact(player.pos);
    if (e.code === 'Space') e.preventDefault();
  });
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  document.getElementById('loading').style.display = 'none';
  hud.toast('🤠 Welcome to Texas! Press H for controls.');
  window.__game = { player, gameplay, GEO }; // debug/testing hook

  const clock = new THREE.Clock();
  let hudTick = 0;
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    player.update(dt);
    scenery.update(player.pos.x, player.pos.z);
    cities.update(player.pos.x, player.pos.z);
    const npcName = gameplay.update(dt, player.pos);
    hud.interactHint(npcName);
    // HUD text/minimap at ~12 Hz — nearestCity/nearestRoad every frame is wasteful
    hudTick += dt;
    if (hudTick > 0.08) {
      hudTick = 0;
      const road = player.mode !== 'FLY' ? nearestRoad(player.pos.x, player.pos.z, 6) : null;
      hud.update(player, gameplay.counts(), road);
    }
    renderer.render(scene, camera);
  });
}

boot().catch((e) => {
  status('Failed to load: ' + e.message);
  console.error(e);
});
