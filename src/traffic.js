// Ambient traffic: pooled low-poly vehicles following real highway polylines
// near the player. Both directions, right-hand lane offset, density by tier.
import * as THREE from 'three';
import { GEO } from './geo.js';

const POOL = 70;
const SPAWN_MIN = 60, SPAWN_MAX = 300; // ring around player
const DESPAWN = 340;

const TIER = {
  motorway: { weight: 5, speed: 30, lane: 1.0 },
  trunk: { weight: 2.5, speed: 24, lane: 0.65 },
  primary: { weight: 1.2, speed: 20, lane: 0.5 },
  street: { weight: 2, speed: 11, lane: 0.38 },
};
const COLORS = [0xc23b3b, 0xd8d8d8, 0x3b62c2, 0x3f3f46, 0xc2953b, 0x4e7a4e, 0x8a8f98, 0x6b4a2f];

export class TrafficSystem {
  constructor(scene) {
    // one box per car reads fine at this scale; cab tint via a second instanced mesh would be overkill
    const geo = new THREE.BoxGeometry(1.4, 0.8, 2.9);
    geo.translate(0, 0.55, 0);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ flatShading: true }), POOL);
    this.mesh.frustumCulled = false; // instances move every frame; skip stale-bounds culling
    scene.add(this.mesh);

    // per-polyline bbox for cheap "near player" candidate filtering
    this.polys = GEO.highways.map((h) => {
      let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      for (const [x, z] of h.pts) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      return { h, minX, maxX, minZ, maxZ };
    });

    this.cars = Array.from({ length: POOL }, () => ({ alive: false }));
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
    this.candidates = [];
    this.candTimer = 0;
  }

  // refresh candidate polylines around the player (cheap, but not every frame)
  refreshCandidates(px, pz) {
    this.candidates.length = 0;
    for (const p of this.polys) {
      if (px < p.minX - SPAWN_MAX || px > p.maxX + SPAWN_MAX || pz < p.minZ - SPAWN_MAX || pz > p.maxZ + SPAWN_MAX) continue;
      const w = TIER[p.h.type].weight;
      for (let k = 0; k < w * 2; k++) this.candidates.push(p.h); // weighted pick pool
    }
  }

  spawn(car, px, pz) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const h = this.candidates[(Math.random() * this.candidates.length) | 0];
      if (!h || h.pts.length < 2) return;
      const seg = (Math.random() * (h.pts.length - 1)) | 0;
      const t = Math.random();
      const a = h.pts[seg], b = h.pts[seg + 1];
      const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < SPAWN_MIN || d > SPAWN_MAX) continue;
      Object.assign(car, {
        alive: true, h, seg, t,
        dir: Math.random() < 0.5 ? 1 : -1,
        speed: TIER[h.type].speed * (0.8 + Math.random() * 0.4),
        color: COLORS[(Math.random() * COLORS.length) | 0],
        scale: 0.85 + Math.random() * 0.35,
      });
      return;
    }
  }

  update(dt, px, pz) {
    this.candTimer -= dt;
    if (this.candTimer <= 0) { this.candTimer = 2; this.refreshCandidates(px, pz); }

    let i = 0;
    for (const car of this.cars) {
      if (!car.alive) this.spawn(car, px, pz);
      if (!car.alive) continue;

      // advance along the polyline (dir: +1 forward through pts, -1 backward)
      const pts = car.h.pts;
      let remaining = car.speed * dt;
      while (remaining > 0) {
        const a = pts[car.seg], b = pts[car.seg + 1];
        const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]) || 0.001;
        const tStep = remaining / segLen;
        if (car.dir > 0) {
          car.t += tStep;
          if (car.t < 1) break;
          remaining = (car.t - 1) * segLen;
          car.seg++; car.t = 0;
          if (car.seg >= pts.length - 1) { car.alive = false; break; }
        } else {
          car.t -= tStep;
          if (car.t > 0) break;
          remaining = -car.t * segLen;
          car.seg--; car.t = 1;
          if (car.seg < 0) { car.alive = false; break; }
        }
      }
      if (!car.alive) continue;

      const a = pts[car.seg], b = pts[car.seg + 1];
      let dx = (b[0] - a[0]) * car.dir, dz = (b[1] - a[1]) * car.dir;
      const L = Math.hypot(dx, dz) || 1;
      dx /= L; dz /= L;
      // right-hand lane offset relative to travel direction
      const lane = TIER[car.h.type].lane;
      const x = a[0] + (b[0] - a[0]) * car.t - dz * lane;
      const z = a[1] + (b[1] - a[1]) * car.t + dx * lane;

      if (Math.hypot(x - px, z - pz) > DESPAWN) { car.alive = false; continue; }

      this.q.setFromAxisAngle(this.up, Math.atan2(-dx, -dz));
      this.m4.compose(
        new THREE.Vector3(x, 0.12, z), this.q,
        new THREE.Vector3(car.scale, car.scale, car.scale)
      );
      this.mesh.setMatrixAt(i, this.m4);
      this.mesh.setColorAt(i, new THREE.Color(car.color));
      i++;
    }
    // park unused instances at zero scale
    this.m4.makeScale(0, 0, 0);
    for (let j = i; j < POOL; j++) this.mesh.setMatrixAt(j, this.m4);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
