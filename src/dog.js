// Lacy — a Blue Lacy, the state dog of Texas, bought once in the shop.
// Rides in the truck bed (perched on the cargo crates mid-haul), hops out to
// trail the cowboy in WALK, and yips a beat after the horn. She can't follow
// a jetpack liftoff, so she stays grounded, yips at the moment of liftoff, and
// just keeps tracking x/z underneath — which reads as waiting/rejoining, no
// extra state needed. Hidden until save.gear.dog is set (shop.js applyGear →
// setOwned).
import * as THREE from 'three';
import { hAt } from './geo.js';
import { groundYAt } from './airports.js';

const FOLLOW_D = 2.6; // trail distance behind the cowboy
const CATCHUP = 2.2;  // speed per unit of gap
const MAX_SPD = 15;   // flat out — a Lacy outruns any cowboy, even a sprinting one (vehicle.js SPRINT_SPEED)

export class DogSystem {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
    this.owned = false;
    const { g, legs, tail } = mkDog();
    this.g = g;
    this.legs = legs;
    this.tail = tail;
    this.g.visible = false;
    scene.add(this.g);
    this.t = 0;
    this.phase = 0;
    this.barks = 0;
    this.barkT = 0;
    this.onBark = null;
    this._hoveringPrev = false; // jetpack liftoff edge (she's grounded, but reacts)
  }

  setOwned(on) {
    this.owned = !!on;
    this.g.visible = this.owned;
  }

  // the horn winds her up: 1–2 yips shortly after
  honked() {
    if (!this.owned) return;
    this.barks = 1 + (Math.random() < 0.5 ? 1 : 0);
    this.barkT = 0.45 + Math.random() * 0.35;
  }

  update(dt) {
    if (!this.owned) return;
    this.t += dt;
    if (this.barks > 0) {
      this.barkT -= dt;
      if (this.barkT <= 0) {
        this.onBark?.();
        this.barks--;
        this.barkT = 0.5 + Math.random() * 0.3;
      }
    }
    const p = this.player;
    const hovering = p.mode === 'WALK' && p.hovering;
    if (hovering && !this._hoveringPrev) this.honked(); // liftoff — she stays grounded but yips
    this._hoveringPrev = hovering;
    if (p.mode !== 'WALK') {
      // ride in the bed facing backward; mid-haul she sits up on the crates.
      // BOAT (Water Vehicles W3): bow perch on the foredeck, nose to the wind
      const boat = p.mode === 'BOAT';
      const mount = boat ? p.skiff : p.truck;
      if (this.g.parent !== mount) {
        mount.add(this.g);
        this.g.rotation.set(0, boat ? 0 : Math.PI, 0);
      }
      if (boat) {
        this.g.position.set(0, 0.55, -1.5);
      } else {
        const crates = p.truck.userData.cargo.visible;
        this.g.position.set(crates ? -0.35 : 0, crates ? 1.48 : 0.93, crates ? 1.27 : 1.3);
      }
      for (const l of this.legs) l.rotation.x *= Math.pow(0.005, dt);
    } else {
      // hops out where the bed was (attach keeps the world transform) and follows
      if (this.g.parent !== this.scene) this.scene.attach(this.g);
      const tx = p.pos.x + Math.sin(p.heading) * FOLLOW_D;
      const tz = p.pos.z + Math.cos(p.heading) * FOLLOW_D;
      const dx = tx - this.g.position.x, dz = tz - this.g.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 40) {
        this.g.position.set(tx, 0, tz); // fast travel — she keeps up, somehow
      } else if (d > 0.35) {
        const spd = Math.min(MAX_SPD, d * CATCHUP);
        this.g.position.x += (dx / d) * spd * dt;
        this.g.position.z += (dz / d) * spd * dt;
        this.g.rotation.set(0, Math.atan2(-dx, -dz), 0); // face travel dir (0 = -z)
        this.phase += dt * (4 + spd * 1.6);
        const s = Math.sin(this.phase) * 0.6;
        for (let i = 0; i < this.legs.length; i++)
          this.legs[i].rotation.x = i === 0 || i === 3 ? s : -s; // diagonal gait
      } else {
        // settled: face the cowboy, legs come to rest
        this.g.rotation.set(0, Math.atan2(-(p.pos.x - this.g.position.x), -(p.pos.z - this.g.position.z)), 0);
        for (const l of this.legs) l.rotation.x *= Math.pow(0.005, dt);
      }
      this.g.position.y = groundYAt(this.g.position.x, this.g.position.z) ?? hAt(this.g.position.x, this.g.position.z);
    }
    this.tail.rotation.y = Math.sin(this.t * 9) * 0.35; // the tail never stops
  }
}

function mkDog() {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const box = (w, h, d, x, y, z, m) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    g.add(b);
    return b;
  };
  const coat = mat(0x8a93a0); // the "blue" — gunmetal gray
  box(0.34, 0.36, 0.9, 0, 0.52, 0, coat);                 // body
  box(0.2, 0.16, 0.06, 0, 0.44, -0.46, mat(0xd8d2c4));    // white chest patch
  box(0.22, 0.22, 0.34, 0, 0.78, -0.5, coat);             // head
  box(0.12, 0.1, 0.18, 0, 0.72, -0.74, coat);             // muzzle
  for (const x of [-0.1, 0.1]) {
    const ear = box(0.05, 0.16, 0.1, x, 0.9, -0.44, coat); // drop ears
    ear.rotation.z = x < 0 ? 0.35 : -0.35;
  }
  // tail pivots at its base so the wag reads
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.36).translate(0, 0, 0.18), coat);
  tail.position.set(0, 0.58, 0.44);
  tail.rotation.x = 0.35;
  g.add(tail);
  // legs pivot at the hip for the trot swing
  const legs = [];
  for (const [x, z] of [[-0.11, -0.3], [0.11, -0.3], [-0.11, 0.3], [0.11, 0.3]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.08).translate(0, -0.19, 0), coat);
    leg.position.set(x, 0.42, z);
    g.add(leg);
    legs.push(leg);
  }
  return { g, legs, tail };
}
