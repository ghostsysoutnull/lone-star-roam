// Player controller: DRIVE (pickup truck), FLY (truck sprouts wings), WALK (cowboy).
// Arcade physics, third-person chase camera.
import * as THREE from 'three';
import { nearestRoad, nearestCity, inTexas } from './geo.js';

export const MODES = ['DRIVE', 'FLY', 'WALK'];

export class Player {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.mode = 'DRIVE';
    this.pos = new THREE.Vector3(0, 0, 0);
    this.heading = 0;      // radians, 0 = -z (north)
    this.speed = 0;        // units/s
    this.vy = 0;           // vertical speed (fly)
    this.keys = {};

    this.truck = mkTruck();
    this.wings = mkWings();
    this.wings.visible = false;
    this.truck.add(this.wings);
    this.cowboy = mkCowboy();
    this.cowboy.visible = false;
    scene.add(this.truck, this.cowboy);

    this.camPos = new THREE.Vector3(0, 8, 12);
    addEventListener('keydown', (e) => (this.keys[e.code] = true));
    addEventListener('keyup', (e) => (this.keys[e.code] = false));
  }

  // Start on I-35 near Austin
  spawnAt(x, z) {
    const r = nearestRoad(x, z, 400);
    this.pos.set(r ? r.x : x, 0, r ? r.z : z);
    this.camPos.copy(this.pos).add(new THREE.Vector3(0, 8, 12));
  }

  cycleMode() {
    const i = (MODES.indexOf(this.mode) + 1) % MODES.length;
    this.setMode(MODES[i]);
  }

  setMode(m) {
    this.mode = m;
    this.wings.visible = m === 'FLY';
    this.cowboy.visible = m === 'WALK';
    this.truck.visible = m !== 'WALK';
    if (m !== 'FLY') { this.pos.y = 0; this.vy = 0; }
    if (m === 'WALK') this.speed = Math.min(this.speed, 2);
  }

  resetToRoad() {
    const r = nearestRoad(this.pos.x, this.pos.z, 500);
    if (r) { this.pos.set(r.x, this.mode === 'FLY' ? this.pos.y : 0, r.z); this.speed = 0; }
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    const k = this.keys;
    const fwd = k['KeyW'] || k['ArrowUp'], back = k['KeyS'] || k['ArrowDown'];
    const left = k['KeyA'] || k['ArrowLeft'], right = k['KeyD'] || k['ArrowRight'];

    if (this.mode === 'DRIVE') {
      const onRoad = !!nearestRoad(this.pos.x, this.pos.z, 4);
      const maxSpd = onRoad ? 46 : 20; // ~460 km/h scaled feel; offroad slower
      const accel = onRoad ? 26 : 14;
      if (fwd) this.speed += accel * dt;
      else if (back) this.speed -= (this.speed > 0 ? 40 : 12) * dt;
      else this.speed *= Math.pow(0.35, dt); // coast friction
      this.speed = THREE.MathUtils.clamp(this.speed, -8, maxSpd);
      const steer = (left ? 1 : 0) - (right ? 1 : 0);
      this.heading += steer * dt * 1.9 * Math.min(1, Math.abs(this.speed) / 9) * Math.sign(this.speed || 1);
      this.pos.x -= Math.sin(this.heading) * this.speed * dt;
      this.pos.z -= Math.cos(this.heading) * this.speed * dt;
      this.tilt = steer * Math.min(1, Math.abs(this.speed) / 25) * 0.09;
    } else if (this.mode === 'FLY') {
      if (fwd) this.speed += 40 * dt;
      else if (back) this.speed -= 50 * dt;
      this.speed = THREE.MathUtils.clamp(this.speed, 6, 150); // planes don't hover
      const steer = (left ? 1 : 0) - (right ? 1 : 0);
      this.heading += steer * dt * 1.35;
      if (k['Space']) this.vy += 60 * dt;
      if (k['ControlLeft'] || k['ControlRight'] || k['ShiftLeft']) this.vy -= 60 * dt;
      this.vy *= Math.pow(0.2, dt);
      this.pos.y = THREE.MathUtils.clamp(this.pos.y + this.vy * dt, 1.5, 280);
      this.pos.x -= Math.sin(this.heading) * this.speed * dt;
      this.pos.z -= Math.cos(this.heading) * this.speed * dt;
      this.tilt = steer * 0.5;
    } else { // WALK
      const maxSpd = 4.5;
      if (fwd) this.speed += 18 * dt;
      else if (back) this.speed -= 18 * dt;
      else this.speed *= Math.pow(0.02, dt);
      this.speed = THREE.MathUtils.clamp(this.speed, -2.5, maxSpd);
      const steer = (left ? 1 : 0) - (right ? 1 : 0);
      this.heading += steer * dt * 2.6;
      this.pos.x -= Math.sin(this.heading) * this.speed * dt;
      this.pos.z -= Math.cos(this.heading) * this.speed * dt;
      this.tilt = 0;
    }

    // Soft wall at the state line — you roam Texas, not New Mexico
    if (!inTexas(this.pos.x, this.pos.z)) {
      const c = nearestCity(this.pos.x, this.pos.z).city;
      const dx = c.x - this.pos.x, dz = c.z - this.pos.z;
      const L = Math.hypot(dx, dz) || 1;
      this.pos.x += (dx / L) * Math.max(10, Math.abs(this.speed)) * dt * 2;
      this.pos.z += (dz / L) * Math.max(10, Math.abs(this.speed)) * dt * 2;
      this.speed *= Math.pow(0.1, dt);
    }

    // Place avatar
    const avatar = this.mode === 'WALK' ? this.cowboy : this.truck;
    avatar.position.copy(this.pos);
    avatar.rotation.set(0, this.heading, 0);
    avatar.rotateZ(this.tilt || 0);
    if (this.mode === 'FLY') avatar.rotateX(THREE.MathUtils.clamp(-this.vy * 0.012, -0.35, 0.35));

    // Chase camera
    const back2 = this.mode === 'FLY' ? 16 : this.mode === 'WALK' ? 7 : 11;
    const up = this.mode === 'FLY' ? 7 : this.mode === 'WALK' ? 3.2 : 5;
    const target = new THREE.Vector3(
      this.pos.x + Math.sin(this.heading) * back2,
      this.pos.y + up,
      this.pos.z + Math.cos(this.heading) * back2
    );
    this.camPos.lerp(target, 1 - Math.pow(0.001, dt));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.pos.x, this.pos.y + 1.5, this.pos.z);
  }

  get speedMph() {
    // 1 unit = 100 m real; show "real-world" mph for flavor (speed*100 m/s -> mph), capped for sanity
    return Math.abs(Math.round(this.speed * 2.4));
  }
}

// --- Low-poly models ---
function mkTruck() {
  const g = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: 0x2563b0, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x22262e });
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 3.6), body);
  bed.position.y = 0.65;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.62, 1.5), new THREE.MeshLambertMaterial({ color: 0x9fc4e8 }));
  cab.position.set(0, 1.2, 0.1);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.85, 1.15], [0.85, 1.15], [-0.85, -1.25], [0.85, -1.25]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(x, 0.36, z);
    g.add(w);
  }
  // lone star on the hood
  const star = mkStarMesh(0.34, 0xffd35c);
  star.rotation.x = -Math.PI / 2;
  star.position.set(0, 0.94, -1.35);
  g.add(bed, cab, star);
  return g;
}

function mkWings() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xd8d2c4, flatShading: true });
  const wing = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.12, 1.3), mat);
  wing.position.set(0, 1.0, 0.2);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.7), mat);
  tail.position.set(0, 1.5, 1.9);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.7), mat);
  fin.position.set(0, 1.6, 1.9);
  g.add(wing, tail, fin);
  return g;
}

function mkCowboy() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x8a2f2f });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x3a5077 });
  const hat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.3), jeans);
  legs.position.y = 0.38;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.35), shirt);
  torso.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), skin);
  head.position.y = 1.55;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 10), hat);
  brim.position.y = 1.74;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.22, 8), hat);
  crown.position.y = 1.86;
  g.add(legs, torso, head, brim, crown);
  return g;
}

export function mkStarMesh(r, color) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.42;
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: r * 0.25, bevelEnabled: false });
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35 }));
}
