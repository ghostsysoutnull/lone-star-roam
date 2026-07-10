// Ambient traffic: pooled low-poly vehicles following real highway polylines
// near the player. Both directions, right-hand lane offset, density by tier.
// Four vehicle types (sedan/pickup/suv/semi) as instanced merged geometries;
// vertex colors bake wheels/windows dark so per-instance color tints only bodywork.
import * as THREE from 'three';
import { GEO, hAt } from './geo.js';

const POOL = 70;
const SPAWN_MIN = 60, SPAWN_MAX = 300; // ring around player
const DESPAWN = 340;

const TIER = {
  motorway: { weight: 5, speed: 30, lane: 1.0, mix: { sedan: 0.38, suv: 0.2, pickup: 0.22, semi: 0.2 } },
  trunk: { weight: 2.5, speed: 24, lane: 0.65, mix: { sedan: 0.42, suv: 0.2, pickup: 0.28, semi: 0.1 } },
  primary: { weight: 1.2, speed: 20, lane: 0.5, mix: { sedan: 0.4, suv: 0.18, pickup: 0.34, semi: 0.08 } },
  street: { weight: 2, speed: 11, lane: 0.38, mix: { sedan: 0.5, suv: 0.24, pickup: 0.24, semi: 0.02 } },
};
const COLORS = [0xc23b3b, 0xd8d8d8, 0x3b62c2, 0x3f3f46, 0xc2953b, 0x4e7a4e, 0x8a8f98, 0x6b4a2f, 0xa8b8c8, 0x7a3b5e];
const SEMI_COLORS = [0xc23b3b, 0x3b62c2, 0x3f7a3f, 0xd8a13b, 0x5e3b7a, 0xdddddd]; // cab colors; trailer baked near-white

// --- tiny geometry kit: transformed, vertex-colored boxes/cylinders merged into one indexed geometry ---
export const tinted = (geo, hex) => {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
};
const box = (w, h, d, x, y, z, hex) => tinted(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
const wheel = (r, x, z) => tinted(new THREE.CylinderGeometry(r, r, 0.26, 8).rotateZ(Math.PI / 2).translate(x, r, z), 0x1e1e22);

export function merge(geos) {
  const pos = [], nor = [], col = [], idx = [];
  for (const g of geos) {
    const base = pos.length / 3;
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    col.push(...g.attributes.color.array);
    if (g.index) {
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) idx.push(gi[i] + base);
    } else {
      // non-indexed (e.g. IcosahedronGeometry) — vertices are already triangle-ordered
      const n = g.attributes.position.count;
      for (let i = 0; i < n; i++) idx.push(base + i);
    }
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  return out;
}

// vehicles face -z (game convention). Bodywork is white -> takes per-instance tint;
// wheels/windows/details are dark so the tint barely shows on them.
const BODY = 0xffffff, GLASS = 0x8fa8bc, DARK = 0x2a2a30;
function mkSedan() {
  return merge([
    box(1.4, 0.5, 3.0, 0, 0.48, 0, BODY),
    box(1.24, 0.42, 1.5, 0, 0.92, 0.12, GLASS),
    wheel(0.22, -0.72, -0.95), wheel(0.22, 0.72, -0.95), wheel(0.22, -0.72, 0.95), wheel(0.22, 0.72, 0.95),
  ]);
}
function mkPickup() {
  return merge([
    box(1.5, 0.55, 3.4, 0, 0.55, 0, BODY),
    box(1.36, 0.55, 1.2, 0, 1.05, -0.45, GLASS),
    box(1.5, 0.18, 1.5, 0, 0.9, 0.9, DARK), // open bed rim
    wheel(0.26, -0.78, -1.05), wheel(0.26, 0.78, -1.05), wheel(0.26, -0.78, 1.05), wheel(0.26, 0.78, 1.05),
  ]);
}
function mkSuv() {
  return merge([
    box(1.5, 0.72, 3.1, 0, 0.62, 0, BODY),
    box(1.38, 0.5, 2.0, 0, 1.2, 0.12, GLASS),
    wheel(0.26, -0.78, -1.0), wheel(0.26, 0.78, -1.0), wheel(0.26, -0.78, 1.0), wheel(0.26, 0.78, 1.0),
  ]);
}
function mkSemi() {
  return merge([
    box(1.6, 1.15, 1.7, 0, 0.95, -2.35, BODY),           // tractor cab — takes the tint
    box(1.44, 0.5, 0.5, 0, 1.62, -2.6, GLASS),           // windshield band
    box(1.7, 1.65, 4.7, 0, 1.28, 0.75, 0xf2f0ea),        // trailer — near-white, tint washes to pastel
    box(0.4, 0.25, 0.5, 0, 0.35, -3.25, DARK),           // bumper
    wheel(0.3, -0.82, -2.6), wheel(0.3, 0.82, -2.6),
    wheel(0.3, -0.82, -0.6), wheel(0.3, 0.82, -0.6),
    wheel(0.3, -0.82, 2.3), wheel(0.3, 0.82, 2.3),
    wheel(0.3, -0.82, 2.95), wheel(0.3, 0.82, 2.95),
  ]);
}

// lamp clusters per type: unlit vertex-colored boxes (white head, red tail),
// shown only at night, sharing each car's instance matrix
const HEAD = 0xfff2c0, TAIL = 0xff2a20;
const lamp = (w, h, d, x, y, z, hex) => tinted(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
const LAMPS = {
  sedan: () => merge([
    lamp(0.24, 0.12, 0.06, -0.5, 0.55, -1.52, HEAD), lamp(0.24, 0.12, 0.06, 0.5, 0.55, -1.52, HEAD),
    lamp(0.24, 0.1, 0.06, -0.5, 0.55, 1.52, TAIL), lamp(0.24, 0.1, 0.06, 0.5, 0.55, 1.52, TAIL),
  ]),
  pickup: () => merge([
    lamp(0.26, 0.14, 0.06, -0.54, 0.62, -1.72, HEAD), lamp(0.26, 0.14, 0.06, 0.54, 0.62, -1.72, HEAD),
    lamp(0.26, 0.12, 0.06, -0.54, 0.62, 1.72, TAIL), lamp(0.26, 0.12, 0.06, 0.54, 0.62, 1.72, TAIL),
  ]),
  suv: () => merge([
    lamp(0.26, 0.14, 0.06, -0.54, 0.7, -1.57, HEAD), lamp(0.26, 0.14, 0.06, 0.54, 0.7, -1.57, HEAD),
    lamp(0.26, 0.12, 0.06, -0.54, 0.7, 1.57, TAIL), lamp(0.26, 0.12, 0.06, 0.54, 0.7, 1.57, TAIL),
  ]),
  semi: () => merge([
    lamp(0.28, 0.16, 0.06, -0.56, 0.75, -3.22, HEAD), lamp(0.28, 0.16, 0.06, 0.56, 0.75, -3.22, HEAD),
    lamp(0.3, 0.14, 0.06, -0.6, 0.6, 3.12, TAIL), lamp(0.3, 0.14, 0.06, 0.6, 0.6, 3.12, TAIL),
  ]),
};

function pickType(mix) {
  let r = Math.random();
  for (const [type, p] of Object.entries(mix)) { r -= p; if (r <= 0) return type; }
  return 'sedan';
}

export class TrafficSystem {
  constructor(scene) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.mat = mat;
    this.meshes = {
      sedan: new THREE.InstancedMesh(mkSedan(), mat, POOL),
      pickup: new THREE.InstancedMesh(mkPickup(), mat, POOL),
      suv: new THREE.InstancedMesh(mkSuv(), mat, POOL),
      semi: new THREE.InstancedMesh(mkSemi(), mat, POOL),
    };
    const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true }); // unlit — lamps glow at night
    this.lampMeshes = {};
    for (const [type, m] of Object.entries(this.meshes)) {
      m.frustumCulled = false; // instances move every frame; skip stale-bounds culling
      scene.add(m);
      const lm = new THREE.InstancedMesh(LAMPS[type](), lampMat, POOL);
      lm.frustumCulled = false;
      lm.visible = false;
      scene.add(lm);
      this.lampMeshes[type] = lm;
    }

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
    this.tmpColor = new THREE.Color();
    this.candidates = [];
    this.candTimer = 0;
  }

  // lamps on after dark. Body paint: boost the material color multiplier above 1
  // at night so the dim moonlight still reveals each instance's color (uniform
  // emissive can't do this — it ignores instance colors and goes flat beige).
  setNight(f) {
    const on = f > 0.45;
    for (const lm of Object.values(this.lampMeshes)) lm.visible = on;
    this.mat.color.setScalar(1 + f * 2.4);
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
      const tier = TIER[h.type];
      const type = pickType(tier.mix);
      const semi = type === 'semi';
      Object.assign(car, {
        alive: true, h, seg, t, type,
        dir: Math.random() < 0.5 ? 1 : -1,
        speed: tier.speed * (semi ? 0.85 : 1) * (0.8 + Math.random() * 0.4),
        color: (semi ? SEMI_COLORS : COLORS)[(Math.random() * (semi ? SEMI_COLORS : COLORS).length) | 0],
        scale: semi ? 0.95 + Math.random() * 0.15 : 0.85 + Math.random() * 0.35,
      });
      return;
    }
  }

  update(dt, px, pz) {
    this.candTimer -= dt;
    if (this.candTimer <= 0) { this.candTimer = 2; this.refreshCandidates(px, pz); }

    const counts = { sedan: 0, pickup: 0, suv: 0, semi: 0 };
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

      const mesh = this.meshes[car.type];
      const i = counts[car.type]++;
      this.q.setFromAxisAngle(this.up, Math.atan2(-dx, -dz));
      this.m4.compose(
        new THREE.Vector3(x, hAt(x, z) + 0.12, z), this.q,
        new THREE.Vector3(car.scale, car.scale, car.scale)
      );
      mesh.setMatrixAt(i, this.m4);
      this.lampMeshes[car.type].setMatrixAt(i, this.m4);
      mesh.setColorAt(i, this.tmpColor.set(car.color));
    }
    // park unused instances at zero scale
    this.m4.makeScale(0, 0, 0);
    for (const [type, mesh] of Object.entries(this.meshes)) {
      const lamps = this.lampMeshes[type];
      for (let j = counts[type]; j < POOL; j++) { mesh.setMatrixAt(j, this.m4); lamps.setMatrixAt(j, this.m4); }
      mesh.instanceMatrix.needsUpdate = true;
      lamps.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
