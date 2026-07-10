// Freight trains: locomotive + long consists of instanced cars following the
// real rail network near the player. Horns blast when one passes close.
import * as THREE from 'three';
import { GEO, hAt } from './geo.js';
import { merge, tinted } from './traffic.js';

const MAX_TRAINS = 3;
const SPAWN_R = 350, DESPAWN_R = 500;
const CAR_LEN = 3.3, SPEED = 16;

// --- rolling stock (face -z; BODY-white takes instance tint where used) ---
const DARK = 0x2a2a30;
const wheelPair = (z) => tinted(new THREE.BoxGeometry(1.1, 0.5, 0.8).translate(0, 0.25, z), 0x1e1e22);
function mkLoco() {
  return merge([
    tinted(new THREE.BoxGeometry(1.6, 1.5, 2.9).translate(0, 1.15, 0.1), 0xffffff),   // long hood (tinted)
    tinted(new THREE.BoxGeometry(1.7, 1.1, 0.9).translate(0, 1.9, -1.05), 0xffffff),  // cab
    tinted(new THREE.BoxGeometry(1.5, 0.5, 0.6), 0x8fa8bc).translate(0, 2.05, -1.05), // windows... (kept simple)
    tinted(new THREE.BoxGeometry(1.8, 0.5, 3.2).translate(0, 0.55, 0), DARK),         // frame
    wheelPair(-1.1), wheelPair(1.1),
  ]);
}
const mkBoxcar = () => merge([
  tinted(new THREE.BoxGeometry(1.7, 1.5, 3.0).translate(0, 1.3, 0), 0xffffff),
  tinted(new THREE.BoxGeometry(1.8, 0.35, 3.1).translate(0, 0.5, 0), DARK),
  wheelPair(-1.1), wheelPair(1.1),
]);
const mkHopper = () => merge([
  tinted(new THREE.BoxGeometry(1.7, 1.2, 2.9).translate(0, 1.35, 0), 0xffffff),
  tinted(new THREE.BoxGeometry(1.3, 0.5, 2.4).translate(0, 0.7, 0), 0xffffff),
  wheelPair(-1.1), wheelPair(1.1),
]);
const mkTanker = () => merge([
  tinted(new THREE.CylinderGeometry(0.75, 0.75, 2.9, 10).rotateX(Math.PI / 2).translate(0, 1.35, 0), 0xffffff),
  tinted(new THREE.BoxGeometry(1.8, 0.35, 3.1).translate(0, 0.5, 0), DARK),
  wheelPair(-1.1), wheelPair(1.1),
]);

const LOCO_COLORS = [0xd8a13b, 0x3b62c2, 0xc23b3b, 0x3f7a3f];
const CAR_COLORS = [0x8a5a3a, 0x5a6a72, 0x7a3b3b, 0x4a6a4a, 0x9a8a4a, 0x555a66, 0xb05a2a];

export class TrainSystem {
  constructor(scene) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const POOL = MAX_TRAINS * 30;
    this.meshes = {
      loco: new THREE.InstancedMesh(mkLoco(), mat, MAX_TRAINS),
      boxcar: new THREE.InstancedMesh(mkBoxcar(), mat, POOL),
      hopper: new THREE.InstancedMesh(mkHopper(), mat, POOL),
      tanker: new THREE.InstancedMesh(mkTanker(), mat, POOL),
    };
    for (const m of Object.values(this.meshes)) {
      m.frustumCulled = false;
      scene.add(m);
    }
    // rails with bbox + lazy cumulative arc lengths
    this.rails = GEO.rails.map((r) => {
      let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      for (const [x, z] of r.pts) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      return { pts: r.pts, minX, maxX, minZ, maxZ, cum: null, len: 0 };
    });
    this.trains = [];
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
    this.col = new THREE.Color();
    this.spawnT = 0;
    this.onHorn = null;
    this.hornT = 0;
  }

  arcInit(rail) {
    if (rail.cum) return;
    rail.cum = [0];
    for (let i = 1; i < rail.pts.length; i++) {
      const a = rail.pts[i - 1], b = rail.pts[i];
      rail.cum.push(rail.cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    rail.len = rail.cum[rail.cum.length - 1];
  }

  // position + direction at arc distance s along the rail
  at(rail, s) {
    const cum = rail.cum;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) { const mid = (lo + hi) >> 1; (cum[mid] <= s ? (lo = mid) : (hi = mid)); }
    const a = rail.pts[lo], b = rail.pts[lo + 1];
    const seg = cum[lo + 1] - cum[lo] || 1;
    const t = (s - cum[lo]) / seg;
    const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
    return [x, z, (b[0] - a[0]) / seg, (b[1] - a[1]) / seg];
  }

  spawn(px, pz) {
    const near = this.rails.filter((r) =>
      px > r.minX - SPAWN_R && px < r.maxX + SPAWN_R && pz > r.minZ - SPAWN_R && pz < r.maxZ + SPAWN_R);
    if (!near.length) return;
    const rail = near[(Math.random() * near.length) | 0];
    this.arcInit(rail);
    const nCars = 14 + ((Math.random() * 14) | 0);
    if (rail.len < nCars * CAR_LEN + 60) return;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const s0 = Math.random() * rail.len;
    // don't spawn right on top of the player
    const [sx, , , ] = this.at(rail, s0), [, sz2] = this.at(rail, s0);
    if (Math.hypot(sx - px, sz2 - pz) < 80) return;
    const types = ['boxcar', 'hopper', 'tanker'];
    this.trains.push({
      rail, s: s0, dir,
      locoColor: LOCO_COLORS[(Math.random() * LOCO_COLORS.length) | 0],
      cars: Array.from({ length: nCars }, () => ({
        type: types[(Math.random() * types.length) | 0],
        color: CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0],
      })),
    });
  }

  update(dt, px, pz) {
    this.spawnT -= dt;
    this.hornT -= dt;
    if (this.trains.length < MAX_TRAINS && this.spawnT <= 0) {
      this.spawnT = 4;
      this.spawn(px, pz);
    }

    const counts = { loco: 0, boxcar: 0, hopper: 0, tanker: 0 };
    for (const tr of this.trains) {
      tr.s += SPEED * tr.dir * dt;
      const total = (tr.cars.length + 1) * CAR_LEN;
      // wrap at rail ends (train "loops" its line)
      if (tr.dir > 0 && tr.s > tr.rail.len) tr.s = total;
      if (tr.dir < 0 && tr.s < total) tr.s = tr.rail.len;
      tr.dead = true;
      for (let c = 0; c <= tr.cars.length; c++) {
        const s = tr.s - tr.dir * c * CAR_LEN;
        if (s < 0 || s > tr.rail.len) continue;
        const [x, z, dx, dz] = this.at(tr.rail, s);
        const d = Math.hypot(x - px, z - pz);
        if (d < DESPAWN_R) tr.dead = false;
        // horn when the locomotive passes near
        if (c === 0 && d < 55 && this.hornT <= 0) { this.hornT = 25; this.onHorn?.(); }
        const type = c === 0 ? 'loco' : tr.cars[c - 1].type;
        const mesh = this.meshes[type];
        const i = counts[type]++;
        if (i >= mesh.count) continue;
        this.q.setFromAxisAngle(this.up, Math.atan2(-dx * tr.dir, -dz * tr.dir));
        this.m4.compose(
          new THREE.Vector3(x, hAt(x, z) + 0.1, z), this.q, new THREE.Vector3(1, 1, 1)
        );
        mesh.setMatrixAt(i, this.m4);
        mesh.setColorAt(i, this.col.set(c === 0 ? tr.locoColor : tr.cars[c - 1].color));
      }
    }
    this.trains = this.trains.filter((t) => !t.dead);

    this.m4.makeScale(0, 0, 0);
    for (const [type, mesh] of Object.entries(this.meshes)) {
      for (let j = counts[type]; j < mesh.instanceMatrix.count; j++) mesh.setMatrixAt(j, this.m4);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
