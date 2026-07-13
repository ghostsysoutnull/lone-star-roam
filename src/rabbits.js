// Maggy & Chowns — a pair of named rabbits who live around Georgetown. They
// only notice the player on foot (a truck or plane doesn't draw them out —
// no flee behavior either, they simply ignore vehicles), hop over and frolic
// in a little orbit near the player, and never stray past a fixed radius of
// home. Sibling to springer.js (Sky) — same leash-clamp idiom, replicated
// locally rather than shared, since the trigger (WALK-only) and the
// near-player behavior (continuous frolic loop, not settle-and-wag) differ
// enough that a shared state machine would just be parameterized around two
// call sites.
import * as THREE from 'three';
import { GEO, nearestRoad, hAt } from './geo.js';
import { groundYAt } from './airports.js';
import { groundYAt as brandGroundYAt } from './brands.js';

const ROAM_R = 30;      // leash radius around HOME — never exceeded (3km: they stay near town center)
const APPROACH_R = 20;  // notices + frolics once player is within ROAM_R + this, WALK mode only
const CATCHUP = 2.2, MAX_SPD = 9;
const WANDER_SPD = 2;

const gY = (x, z) => groundYAt(x, z) ?? brandGroundYAt(x, z) ?? hAt(x, z);

const RABBITS = [
  { name: 'Maggy', fur: 0xb8935a, chest: 0xece4d0, ear: 0xd8ab7a },
  { name: 'Chowns', fur: 0x7a746a, chest: 0xc8c4ba, ear: 0x5a564c },
];

export class RabbitSystem {
  constructor(scene) {
    this.scene = scene;
    // GEO.cities is populated by loadGeo() before boot() constructs systems,
    // but not at module-import time — must be read here, not at module scope
    this.home = GEO.cities.find((c) => c.name === 'Georgetown');
    this.rabbits = RABBITS.map((look, i) => {
      const a = (i / RABBITS.length) * Math.PI * 2;
      const [sx, sz] = roadShoulder(this.home.x + Math.cos(a) * 4, this.home.z + Math.sin(a) * 4, ROAM_R);
      const { g, tail } = mkRabbit(look);
      g.position.set(sx, gY(sx, sz), sz);
      scene.add(g);
      return {
        name: look.name, g, tail, state: 'wander',
        heading: Math.random() * Math.PI * 2, stateT: 0, wandering: false,
        orbitPhase: Math.random() * Math.PI * 2, orbitR: 1.4 + Math.random() * 1.2,
        orbitSpd: 0.9 + Math.random() * 0.4, t: Math.random() * 10, hopPhase: 0,
      };
    });
  }

  update(dt, playerPos, playerMode) {
    for (const r of this.rabbits) this.updateOne(r, dt, playerPos, playerMode);
  }

  updateOne(r, dt, playerPos, playerMode) {
    r.t += dt;
    const dxHome = playerPos.x - this.home.x, dzHome = playerPos.z - this.home.z;
    const homeD = Math.hypot(dxHome, dzHome);
    // hysteresis: a wider band to stay engaged than to first notice
    const engageR = ROAM_R + (r.state === 'frolic' ? APPROACH_R * 1.3 : APPROACH_R);
    r.state = playerMode === 'WALK' && homeD < engageR ? 'frolic' : 'wander';

    let moving = false;
    if (r.state === 'frolic') {
      // clamp the player to the leash disc, same idiom as springer.js — if
      // they're outside it, the fence point nearest them is the anchor
      let tx = playerPos.x, tz = playerPos.z;
      if (homeD > ROAM_R) {
        tx = this.home.x + (dxHome / homeD) * ROAM_R;
        tz = this.home.z + (dzHome / homeD) * ROAM_R;
      }
      // orbit that anchor at a small radius — never settles still, always
      // frolicking. Re-clamp the orbit point itself: when the anchor is
      // already sitting on the fence, the orbit offset alone could otherwise
      // push the actual target past ROAM_R
      r.orbitPhase += dt * r.orbitSpd;
      let ox = tx + Math.cos(r.orbitPhase) * r.orbitR;
      let oz = tz + Math.sin(r.orbitPhase) * r.orbitR;
      const od = Math.hypot(ox - this.home.x, oz - this.home.z);
      if (od > ROAM_R) {
        ox = this.home.x + ((ox - this.home.x) / od) * ROAM_R;
        oz = this.home.z + ((oz - this.home.z) / od) * ROAM_R;
      }
      const dx = ox - r.g.position.x, dz = oz - r.g.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.15) {
        moving = true;
        const spd = Math.min(MAX_SPD, d * CATCHUP);
        r.g.position.x += (dx / d) * spd * dt;
        r.g.position.z += (dz / d) * spd * dt;
        r.heading = Math.atan2(-dx, -dz);
      }
    } else {
      r.stateT -= dt;
      if (r.stateT <= 0) {
        r.stateT = 1.5 + Math.random() * 3;
        r.wandering = Math.random() < 0.5;
        r.heading = Math.random() * Math.PI * 2;
      }
      if (r.wandering) {
        const nx = r.g.position.x - Math.sin(r.heading) * WANDER_SPD * dt;
        const nz = r.g.position.z - Math.cos(r.heading) * WANDER_SPD * dt;
        if (Math.hypot(nx - this.home.x, nz - this.home.z) > ROAM_R) r.heading += Math.PI;
        else if (nearestRoad(nx, nz, 3)) r.heading += Math.PI / 2;
        else { r.g.position.x = nx; r.g.position.z = nz; moving = true; }
      }
    }

    r.g.rotation.y = r.heading;
    // hop bob — rabbits hop rather than trot, no leg-swing needed
    r.hopPhase += dt * (moving ? (r.state === 'frolic' ? 11 : 7) : 0);
    const hop = moving ? Math.abs(Math.sin(r.hopPhase)) * (r.state === 'frolic' ? 0.32 : 0.2) : 0;
    r.g.position.y = gY(r.g.position.x, r.g.position.z) + hop;
    r.g.rotation.x = moving ? -Math.sin(r.hopPhase) * 0.15 : 0; // little forward hunch mid-hop
    r.tail.rotation.x = Math.sin(r.t * 5) * 0.1;
  }
}

// place a rabbit on the shoulder of the nearest road — same idiom as
// npcs.js's roadShoulder (not exported there, so replicated here)
function roadShoulder(x, z, searchR) {
  const r = nearestRoad(x, z, searchR);
  if (!r) return [x, z];
  const d = Math.max(r.dist, 0.001);
  const ox = (x - r.x) / d, oz = (z - r.z) / d;
  return [r.x + ox * 2.1, r.z + oz * 2.1];
}

// --- geometry: compact box/cylinder rabbit, distinct fur per name ---
function mkRabbit(look) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const box = (w, h, d, x, y, z, m, parent = g) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    parent.add(b);
    return b;
  };
  const fur = mat(look.fur);
  box(0.26, 0.3, 0.42, 0, 0.28, 0, fur);                     // body
  box(0.16, 0.14, 0.1, 0, 0.24, -0.19, mat(look.chest));     // chest patch
  box(0.2, 0.2, 0.2, 0, 0.42, -0.24, fur);                   // head
  const earC = mat(look.ear);
  for (const x of [-0.06, 0.06]) {
    const ear = box(0.05, 0.28, 0.06, x, 0.62, -0.24, fur);  // tall alert ears
    box(0.03, 0.2, 0.02, 0, 0.1, 0.005, earC, ear);          // inner-ear tint
    ear.rotation.x = -0.1;
  }
  box(0.16, 0.16, 0.18, -0.11, 0.2, 0.16, fur);              // haunch (rabbits sit rump-high)
  box(0.16, 0.16, 0.18, 0.11, 0.2, 0.16, fur);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), mat(0xece4d0));
  tail.position.set(0, 0.28, 0.22);
  g.add(tail);
  g.scale.setScalar(1.35); // a little bigger than a common wild jackrabbit — these two are special
  return { g, tail };
}
