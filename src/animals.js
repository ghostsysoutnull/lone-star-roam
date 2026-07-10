// Regional wildlife: chunked spawning like scenery, but animals near the player
// are simulated — grazers shuffle, wanderers amble, prey species flee the player.
// First close encounter with each species goes into the critter log.
import * as THREE from 'three';
import { seededRand, inTexas, nearestRoad, hAt } from './geo.js';

const CHUNK = 260, VIEW_CHUNKS = 2; // tighter ring than scenery — animals are simulated
const ACTIVE_R = 150;               // only simulate within this range

export const SPECIES = {
  deer: { name: 'White-tailed Deer', speed: 14, fleeR: 16, behavior: 'flee', bob: true },
  longhorn: { name: 'Longhorn', speed: 3, fleeR: 0, behavior: 'graze', bob: false },
  armadillo: { name: 'Armadillo', speed: 3.5, fleeR: 6, behavior: 'flee', bob: false },
  jackrabbit: { name: 'Jackrabbit', speed: 16, fleeR: 12, behavior: 'flee', bob: true },
  roadrunner: { name: 'Roadrunner', speed: 18, fleeR: 10, behavior: 'flee', bob: false },
  coyote: { name: 'Coyote', speed: 12, fleeR: 14, behavior: 'wander', bob: false },
  hog: { name: 'Wild Hog', speed: 8, fleeR: 10, behavior: 'flee', bob: false },
  vulture: { name: 'Turkey Vulture', speed: 8, fleeR: 0, behavior: 'circle', bob: false },
};
export const SPECIES_COUNT = Object.keys(SPECIES).length;

// regional spawn tables: [species, herd min, herd max, groups per chunk]
function regionTable(x, z) {
  if (x < -2200) return [['jackrabbit', 1, 2, 1], ['roadrunner', 1, 1, 1], ['coyote', 1, 2, 1], ['vulture', 2, 4, 1]];
  if (x > 3400) return [['deer', 2, 4, 1], ['hog', 2, 5, 1]];
  if (z > 2600) return [['longhorn', 3, 6, 1], ['hog', 2, 4, 1], ['armadillo', 1, 2, 1]];
  return [['deer', 2, 4, 1], ['longhorn', 3, 7, 1], ['armadillo', 1, 2, 1]];
}

export class AnimalSystem {
  constructor(scene, onSpotted) {
    this.scene = scene;
    this.onSpotted = onSpotted; // (speciesKey) => void
    this.live = new Map(); // chunk key -> { group, animals: [] }
    this.t = 0;
  }

  update(dt, px, pz, py = 0) {
    this.py = py;
    this.t += dt;
    const cx = Math.floor(px / CHUNK), cz = Math.floor(pz / CHUNK);
    const want = new Set();
    for (let i = -VIEW_CHUNKS; i <= VIEW_CHUNKS; i++)
      for (let j = -VIEW_CHUNKS; j <= VIEW_CHUNKS; j++) want.add(`${cx + i},${cz + j}`);
    for (const [k, entry] of this.live) {
      if (want.has(k)) continue;
      this.scene.remove(entry.group);
      entry.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      this.live.delete(k);
    }
    for (const k of want) if (!this.live.has(k)) this.spawn(k);

    for (const { animals } of this.live.values()) {
      for (const a of animals) this.step(a, dt, px, pz);
    }
  }

  step(a, dt, px, pz) {
    const dx = a.g.position.x - px, dz = a.g.position.z - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 > ACTIVE_R * ACTIVE_R) return;
    const spec = SPECIES[a.species];

    // critter log — close encounter at ground-ish level (no spotting from altitude)
    if (d2 < 24 * 24 && this.py < 15) this.onSpotted?.(a.species);

    if (spec.behavior === 'circle') { // vultures orbit their home point, high up
      a.phase += dt * 0.5;
      a.g.position.set(a.homeX + Math.cos(a.phase) * 12, hAt(a.homeX, a.homeZ) + 16 + Math.sin(a.phase * 2.3) * 1.5, a.homeZ + Math.sin(a.phase) * 12);
      a.g.rotation.y = -a.phase - Math.PI / 2;
      return;
    }

    let moving = false;
    const dist = Math.sqrt(d2);
    if (spec.fleeR && dist < spec.fleeR) {
      // bolt directly away from the player
      a.state = 'flee';
      a.stateT = 1.5 + Math.random();
      a.heading = Math.atan2(-dx, -dz) + Math.PI; // away
    }
    if (a.state === 'flee') {
      a.stateT -= dt;
      if (a.stateT <= 0) a.state = 'idle';
      moving = true;
      this.move(a, spec.speed, dt);
    } else {
      // idle/wander: occasionally pick a new direction and amble
      a.stateT -= dt;
      if (a.stateT <= 0) {
        a.stateT = 2 + Math.random() * 4;
        a.ambling = Math.random() < (spec.behavior === 'graze' ? 0.3 : 0.6);
        a.heading = Math.random() * Math.PI * 2;
      }
      if (a.ambling) {
        moving = true;
        this.move(a, spec.speed * (spec.behavior === 'graze' ? 1 : 0.35), dt);
      }
    }
    a.g.rotation.y = a.heading;
    // hop/bound bob for deer & rabbits while moving
    a.g.position.y = hAt(a.g.position.x, a.g.position.z) + (moving && spec.bob ? Math.abs(Math.sin(this.t * 9 + a.phase)) * 0.35 : 0);
  }

  move(a, speed, dt) {
    const nx = a.g.position.x - Math.sin(a.heading) * speed * dt;
    const nz = a.g.position.z - Math.cos(a.heading) * speed * dt;
    // stay in Texas, off roads, and near home (leash)
    if (!inTexas(nx, nz)) { a.heading += Math.PI; return; }
    if (Math.hypot(nx - a.homeX, nz - a.homeZ) > 45) { a.heading += Math.PI / 2; return; }
    const road = nearestRoad(nx, nz, 3);
    if (road && a.state !== 'flee') { a.heading += Math.PI / 2; return; } // fleeing animals may cross roads
    a.g.position.x = nx;
    a.g.position.z = nz;
  }

  spawn(key) {
    const [cx, cz] = key.split(',').map(Number);
    const rand = seededRand('animals' + key);
    const group = new THREE.Group();
    const animals = [];
    const baseX = cx * CHUNK, baseZ = cz * CHUNK;
    for (const [species, lo, hi, groups] of regionTable(baseX + CHUNK / 2, baseZ + CHUNK / 2)) {
      for (let gI = 0; gI < groups; gI++) {
        if (rand() < 0.45) continue; // not every chunk has every species
        const hx = baseX + rand() * CHUNK, hz = baseZ + rand() * CHUNK;
        if (!inTexas(hx, hz)) continue;
        if (nearestRoad(hx, hz, 6)) continue; // herds keep off the highway
        const n = lo + ((rand() * (hi - lo + 1)) | 0);
        for (let i = 0; i < n; i++) {
          const g = mkAnimal(species, rand);
          const ax = hx + (rand() - 0.5) * 8, az = hz + (rand() - 0.5) * 8;
          g.position.set(ax, hAt(ax, az), az);
          g.rotation.y = rand() * Math.PI * 2;
          group.add(g);
          animals.push({
            g, species, homeX: hx, homeZ: hz,
            state: 'idle', stateT: rand() * 3, ambling: false,
            heading: rand() * Math.PI * 2, phase: rand() * Math.PI * 2,
          });
        }
      }
    }
    this.scene.add(group);
    this.live.set(key, { group, animals });
  }
}

// --- Low-poly critters (all face -z) ---
const mat = (hex) => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
const box = (g, w, h, d, x, y, z, m) => {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  g.add(b);
  return b;
};

function mkAnimal(species, rand) {
  const g = new THREE.Group();
  switch (species) {
    case 'deer': {
      const tan = mat(0xa87a4a);
      box(g, 0.5, 0.5, 1.1, 0, 0.75, 0, tan);              // body
      box(g, 0.22, 0.5, 0.25, 0, 1.15, -0.55, tan);        // neck
      box(g, 0.26, 0.24, 0.4, 0, 1.45, -0.65, tan);        // head
      for (const [x, z] of [[-0.16, -0.4], [0.16, -0.4], [-0.16, 0.4], [0.16, 0.4]])
        box(g, 0.09, 0.55, 0.09, x, 0.28, z, tan);
      if (rand() < 0.5) { // bucks get antlers
        const bone = mat(0xd8cbb0);
        box(g, 0.06, 0.3, 0.06, -0.12, 1.7, -0.6, bone);
        box(g, 0.06, 0.3, 0.06, 0.12, 1.7, -0.6, bone);
      }
      box(g, 0.12, 0.18, 0.08, 0, 0.9, 0.58, mat(0xf5f0e0)); // white tail
      break;
    }
    case 'longhorn': {
      const hide = mat(rand() < 0.4 ? 0x8a5a3a : 0xb08a62);
      box(g, 0.75, 0.65, 1.5, 0, 0.85, 0, hide);
      box(g, 0.34, 0.34, 0.45, 0, 1.15, -0.9, hide);
      const horn = mat(0xe8dcc0);
      box(g, 1.9, 0.09, 0.09, 0, 1.38, -0.9, horn);          // the famous spread
      for (const [x, z] of [[-0.26, -0.55], [0.26, -0.55], [-0.26, 0.55], [0.26, 0.55]])
        box(g, 0.13, 0.55, 0.13, x, 0.28, z, hide);
      break;
    }
    case 'armadillo': {
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.28, 7, 5), mat(0x9a9088));
      shell.scale.set(1, 0.75, 1.5);
      shell.position.y = 0.24;
      g.add(shell);
      box(g, 0.12, 0.1, 0.25, 0, 0.15, -0.45, mat(0x8a8078)); // snouty head
      box(g, 0.05, 0.05, 0.4, 0, 0.12, 0.55, mat(0x8a8078));  // tail
      break;
    }
    case 'jackrabbit': {
      const fur = mat(0xb0a088);
      box(g, 0.25, 0.3, 0.45, 0, 0.3, 0, fur);
      box(g, 0.2, 0.2, 0.2, 0, 0.55, -0.25, fur);
      box(g, 0.06, 0.4, 0.1, -0.07, 0.85, -0.25, fur);       // the ears
      box(g, 0.06, 0.4, 0.1, 0.07, 0.85, -0.25, fur);
      break;
    }
    case 'roadrunner': {
      const feathers = mat(0x6a6250);
      box(g, 0.16, 0.2, 0.4, 0, 0.35, 0, feathers);
      box(g, 0.1, 0.12, 0.16, 0, 0.55, -0.25, feathers);
      box(g, 0.04, 0.04, 0.22, 0, 0.55, -0.42, mat(0x3a3a30)); // beak
      const tail = box(g, 0.05, 0.3, 0.35, 0, 0.5, 0.3, feathers);
      tail.rotation.x = -0.7; // cocked-up tail
      box(g, 0.05, 0.25, 0.05, 0, 0.12, 0, mat(0x3a3a30));
      break;
    }
    case 'coyote': {
      const fur = mat(0x9a8a6a);
      box(g, 0.35, 0.4, 1.0, 0, 0.55, 0, fur);
      box(g, 0.24, 0.24, 0.4, 0, 0.8, -0.6, fur);
      box(g, 0.08, 0.16, 0.08, -0.07, 1.0, -0.55, fur);      // ears
      box(g, 0.08, 0.16, 0.08, 0.07, 1.0, -0.55, fur);
      const tail = box(g, 0.12, 0.12, 0.5, 0, 0.45, 0.65, fur);
      tail.rotation.x = 0.4;
      for (const [x, z] of [[-0.12, -0.35], [0.12, -0.35], [-0.12, 0.35], [0.12, 0.35]])
        box(g, 0.08, 0.4, 0.08, x, 0.2, z, fur);
      break;
    }
    case 'hog': {
      const bristle = mat(0x4a3a30);
      box(g, 0.55, 0.5, 1.1, 0, 0.5, 0, bristle);
      box(g, 0.3, 0.3, 0.4, 0, 0.55, -0.7, bristle);
      box(g, 0.14, 0.12, 0.12, 0, 0.45, -0.95, mat(0x6a5248)); // snout
      for (const [x, z] of [[-0.18, -0.35], [0.18, -0.35], [-0.18, 0.35], [0.18, 0.35]])
        box(g, 0.1, 0.3, 0.1, x, 0.14, z, bristle);
      break;
    }
    case 'vulture': {
      const dark = mat(0x2a2622);
      box(g, 0.18, 0.12, 0.5, 0, 0, 0, dark);
      const l = box(g, 1.1, 0.03, 0.3, -0.6, 0.06, 0, dark);
      const r = box(g, 1.1, 0.03, 0.3, 0.6, 0.06, 0, dark);
      l.rotation.z = 0.18; r.rotation.z = -0.18;             // shallow V — vulture glide
      box(g, 0.1, 0.08, 0.12, 0, 0.02, -0.28, mat(0x8a3a3a)); // red head
      break;
    }
  }
  return g;
}
