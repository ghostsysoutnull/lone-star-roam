// Sky — an English Springer Spaniel who lives around Cedar Park. Notices the
// player, trots over, and stays happily nearby, but never strays past a
// fixed radius of home no matter how far the player wanders off. One-off
// character (own module, not gear-gated like Lacy in dog.js, not a species
// in animals.js) — the most detailed dog in the game.
import * as THREE from 'three';
import { GEO, nearestRoad, hAt } from './geo.js';
import { groundYAt } from './airports.js';
import { groundYAt as brandGroundYAt } from './brands.js';

const ROAM_R = 70;       // leash radius around HOME — never exceeded
const APPROACH_R = 45;   // notices + approaches once player is within ROAM_R + this
const PET_R = 4;         // close enough to pet, and how near she settles when approaching
const CATCHUP = 2.0, MAX_SPD = 10; // dog.js-style approach speed
const WANDER_SPD = 3;

// layered ground sampling like npcs.js's gY — a brand slab or airport pad
// could land inside her roam disc; raw hAt would sink/float her there
const gY = (x, z) => groundYAt(x, z) ?? brandGroundYAt(x, z) ?? hAt(x, z);

export class SpringerSystem {
  constructor(scene) {
    this.scene = scene;
    this.onBark = null;
    // GEO.cities is populated by loadGeo() before boot() constructs systems,
    // but not at module-import time — must be read here, not at module scope
    this.home = GEO.cities.find((c) => c.name === 'Cedar Park');
    const [sx, sz] = roadShoulder(this.home.x, this.home.z, ROAM_R);
    const { g, legs, tail } = mkSpringer();
    this.g = g;
    this.legs = legs;
    this.tail = tail;
    this.g.position.set(sx, gY(sx, sz), sz);
    scene.add(this.g);
    this.state = 'wander';
    this.heading = Math.random() * Math.PI * 2;
    this.stateT = 0;
    this.wandering = false;
    this.t = 0;
    this.phase = 0;
    this.barkT = 1 + Math.random() * 2;
    this.hop = 0;
  }

  update(dt, playerPos) {
    this.t += dt;
    const dxHome = playerPos.x - this.home.x, dzHome = playerPos.z - this.home.z;
    const homeD = Math.hypot(dxHome, dzHome);
    // hysteresis: a wider band to stay engaged than to first notice, so she
    // doesn't flicker in and out right at the boundary
    const engageR = ROAM_R + (this.state === 'approach' ? APPROACH_R * 1.3 : APPROACH_R);
    this.state = homeD < engageR ? 'approach' : 'wander';

    let moving = false;
    if (this.state === 'approach') {
      // target is the player, clamped to the leash disc — if the player is
      // themselves outside it, she heads for the fence point nearest them
      // and waits there instead of crossing it
      let tx = playerPos.x, tz = playerPos.z;
      if (homeD > ROAM_R) {
        tx = this.home.x + (dxHome / homeD) * ROAM_R;
        tz = this.home.z + (dzHome / homeD) * ROAM_R;
      }
      const dx = tx - this.g.position.x, dz = tz - this.g.position.z;
      const d = Math.hypot(dx, dz);
      if (d > PET_R) {
        moving = true;
        const spd = Math.min(MAX_SPD, d * CATCHUP);
        this.g.position.x += (dx / d) * spd * dt;
        this.g.position.z += (dz / d) * spd * dt;
        this.heading = Math.atan2(-dx, -dz);
      } else {
        // settled near the player (or the fence line): happy — face them,
        // wag hard, bark on a cooldown
        const fx = playerPos.x - this.g.position.x, fz = playerPos.z - this.g.position.z;
        if (Math.hypot(fx, fz) > 0.2) this.heading = Math.atan2(-fx, -fz);
        this.barkT -= dt;
        if (this.barkT <= 0) {
          this.onBark?.();
          this.barkT = 3 + Math.random() * 3;
        }
      }
    } else {
      this.stateT -= dt;
      if (this.stateT <= 0) {
        this.stateT = 2 + Math.random() * 4;
        this.wandering = Math.random() < 0.5;
        this.heading = Math.random() * Math.PI * 2;
      }
      if (this.wandering) {
        const nx = this.g.position.x - Math.sin(this.heading) * WANDER_SPD * dt;
        const nz = this.g.position.z - Math.cos(this.heading) * WANDER_SPD * dt;
        if (Math.hypot(nx - this.home.x, nz - this.home.z) > ROAM_R) this.heading += Math.PI;
        else if (nearestRoad(nx, nz, 3)) this.heading += Math.PI / 2;
        else { this.g.position.x = nx; this.g.position.z = nz; moving = true; }
      }
    }

    this.g.rotation.y = this.heading;
    if (this.hop > 0) this.hop -= dt;
    this.g.position.y = gY(this.g.position.x, this.g.position.z) + (this.hop > 0 ? Math.abs(Math.sin(this.hop * 15)) * 0.25 : 0);

    this.phase += dt * (4 + (moving ? 6 : 0));
    const s = moving ? Math.sin(this.phase) * 0.5 : 0;
    for (let i = 0; i < this.legs.length; i++)
      this.legs[i].rotation.x = moving ? (i === 0 || i === 3 ? s : -s) : this.legs[i].rotation.x * Math.pow(0.005, dt);
    const settledHappy = this.state === 'approach' && !moving;
    this.tail.rotation.y = Math.sin(this.t * (settledHappy ? 16 : 6)) * (settledHappy ? 0.5 : 0.3);
  }

  nearHint(pos) {
    const d = Math.hypot(this.g.position.x - pos.x, this.g.position.z - pos.z);
    return d < PET_R ? 'pet Sky' : null;
  }

  interact(pos) {
    const d = Math.hypot(this.g.position.x - pos.x, this.g.position.z - pos.z);
    if (d >= PET_R) return false;
    this.onBark?.();
    this.barkT = 3 + Math.random() * 3;
    this.hop = 0.4;
    return true;
  }
}

// place her on the shoulder of the nearest road — same idiom as npcs.js's
// roadShoulder (not exported there, so replicated here)
function roadShoulder(x, z, searchR) {
  const r = nearestRoad(x, z, searchR);
  if (!r) return [x, z];
  const d = Math.max(r.dist, 0.001);
  const ox = (x - r.x) / d, oz = (z - r.z) / d;
  return [r.x + ox * 2.1, r.z + oz * 2.1];
}

// --- geometry: box/cylinder primitives, more detailed than Lacy (dog.js) ---
function mkSpringer() {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const box = (w, h, d, x, y, z, m, parent = g) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    parent.add(b);
    return b;
  };
  const white = mat(0xece4d0);
  const liver = mat(0x7a4a2c);
  const darkLiver = mat(0x5a3620);

  box(0.36, 0.4, 1.0, 0, 0.54, 0, white);                    // body
  box(0.3, 0.16, 0.4, 0, 0.36, 0.1, liver);                  // saddle patch
  box(0.22, 0.2, 0.24, -0.09, 0.42, -0.32, liver);           // shoulder patch
  box(0.2, 0.18, 0.22, 0.1, 0.36, 0.4, liver);                // hip patch
  box(0.24, 0.24, 0.36, 0, 0.82, -0.5, liver);                // head
  box(0.14, 0.12, 0.22, 0, 0.72, -0.76, white);               // muzzle
  box(0.05, 0.05, 0.05, 0, 0.7, -0.87, darkLiver);            // nose tip
  for (const x of [-0.11, 0.11]) {
    const ear = box(0.07, 0.32, 0.14, x, 0.82, -0.4, liver);  // long floppy ears
    ear.rotation.z = x < 0 ? 0.55 : -0.55;
    ear.rotation.x = 0.15;
  }
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 6, 12).rotateX(Math.PI / 2), mat(0xaa3a3a));
  collar.position.set(0, 0.68, -0.36);
  g.add(collar);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.3).translate(0, 0, 0.15), white);
  tail.position.set(0, 0.62, 0.5);
  tail.rotation.x = 0.4;
  box(0.16, 0.03, 0.22, 0, 0.03, 0.32, liver, tail);          // feathered tip, wags with the tail
  g.add(tail);
  const legs = [];
  for (const [x, z, front] of [[-0.13, -0.32, true], [0.13, -0.32, true], [-0.13, 0.32, false], [0.13, 0.32, false]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.44, 0.09).translate(0, -0.2, 0), front ? white : liver);
    leg.position.set(x, 0.44, z);
    g.add(leg);
    if (front) box(0.1, 0.14, 0.1, 0, -0.36, 0, white, leg);  // white sock overlay
    legs.push(leg);
  }
  return { g, legs, tail };
}
