// Ambient traffic: pooled low-poly vehicles following real highway polylines
// near the player. Both directions, right-hand lane offset. Density follows
// local road supply (length-weighted, freeways densest) so deserts stay lonely
// and I-35 stays busy. Cars brake/honk/pull around a player blocking the lane,
// keep following distance, and turn onto crossing roads at polyline ends
// instead of vanishing mid-view. Night thins traffic toward interstate semis;
// rain slows everyone and turns lamps on.
// Four vehicle types (sedan/pickup/suv/semi) as instanced merged geometries;
// vertex colors bake wheels/windows dark so per-instance color tints only bodywork.
import * as THREE from 'three';
import { GEO, hAt, nearestCity } from './geo.js';
import { ATMOS } from './sky.js';
import { cityRadius } from './cities.js';

const POOL = 70;
const SPAWN_MIN = 60, SPAWN_MAX = 300; // ring around player
const DESPAWN = 340;
const DENSITY_DIVISOR = 190; // weighted road-length units per alive car
const ACCEL = 7, DECEL = 22; // units/s^2
const JUNCTION_R = 1.4; // how close two polylines must pass to count as an intersection

// weight = cars per unit of road length (relative); nightCut = fraction of that
// tier's traffic that goes home after dark (interstates keep most of theirs)
const TIER = {
  motorway: { weight: 5, nightCut: 0.35, speed: 30, lane: 1.0, mix: { sedan: 0.38, suv: 0.2, pickup: 0.22, semi: 0.2 } },
  trunk: { weight: 2.4, nightCut: 0.5, speed: 24, lane: 0.65, mix: { sedan: 0.42, suv: 0.2, pickup: 0.28, semi: 0.1 } },
  primary: { weight: 1.1, nightCut: 0.65, speed: 20, lane: 0.5, mix: { sedan: 0.4, suv: 0.18, pickup: 0.34, semi: 0.08 } },
  street: { weight: 0.8, nightCut: 0.75, speed: 11, lane: 0.38, mix: { sedan: 0.5, suv: 0.24, pickup: 0.24, semi: 0.02 } },
};
// after dark the interstates belong to the long-haul semis
const NIGHT_MOTORWAY_MIX = { sedan: 0.22, suv: 0.08, pickup: 0.2, semi: 0.5 };
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

// out in the country everybody drives a pickup (off the interstates, anyway)
function mixAt(tier, tierName, x, z) {
  if (tierName === 'motorway') {
    return ATMOS.night > 0.5 ? NIGHT_MOTORWAY_MIX : tier.mix;
  }
  const { city, dist } = nearestCity(x, z);
  if (dist < cityRadius(city.pop) * 2.5 + 15) return tier.mix;
  const m = { ...tier.mix };
  const bump = Math.min(0.18, m.sedan - 0.1);
  m.pickup += bump; m.sedan -= bump;
  return m;
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

    // per-polyline bbox + length for candidate filtering and length-weighted spawn
    this.polys = GEO.highways.map((h) => {
      let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, len = 0;
      for (let i = 0; i < h.pts.length; i++) {
        const [x, z] = h.pts[i];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        if (i) len += Math.hypot(x - h.pts[i - 1][0], z - h.pts[i - 1][1]);
      }
      return { h, minX, maxX, minZ, maxZ, len };
    });

    this.cars = Array.from({ length: POOL }, () => ({ alive: false }));
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
    this.tmpColor = new THREE.Color();
    this.candidates = []; // poly records near the player
    this.candCum = []; // cumulative length-x-tier weights, parallel to candidates
    this.candTotal = 0;
    this.targetAlive = 0;
    this.candTimer = 0;
    this.nightF = 0;
    this.onHonk = null; // (type) => void, wired by main
  }

  // Body paint at night: boost the material color multiplier above 1 so the
  // dim moonlight still reveals each instance's color (uniform emissive can't
  // do this — it ignores instance colors and goes flat beige). Lamp visibility
  // lives in update() because rain turns them on too.
  setNight(f) {
    this.nightF = f;
    this.mat.color.setScalar(1 + f * 2.4);
  }

  // refresh candidate polylines around the player (cheap, but not every frame).
  // Each polyline is clipped to the spawn ring so only the *in-range* length
  // counts: weight = in-range length x tier density (thinned per-tier at night).
  // The total weighted supply caps how many cars exist here — one road through
  // the desert supports a trickle, a metro fills the pool — and [sMin, sMax]
  // records the in-range arc span so spawns don't land 1,000 units away on a
  // long chained highway.
  refreshCandidates(px, pz) {
    this.candidates.length = 0;
    this.candCum.length = 0;
    const R2 = SPAWN_MAX * SPAWN_MAX;
    let cum = 0;
    for (const p of this.polys) {
      if (px < p.minX - SPAWN_MAX || px > p.maxX + SPAWN_MAX || pz < p.minZ - SPAWN_MAX || pz > p.maxZ + SPAWN_MAX) continue;
      // walk segments, clip each against the ring circle (quadratic in t)
      const pts = p.h.pts;
      let s = 0, effLen = 0, sMin = -1, sMax = -1;
      for (let i = 1; i < pts.length; i++) {
        const ax = pts[i - 1][0], az = pts[i - 1][1];
        const dx = pts[i][0] - ax, dz = pts[i][1] - az;
        const segLen = Math.hypot(dx, dz);
        const fx = ax - px, fz = az - pz;
        const A = dx * dx + dz * dz;
        if (A > 0) {
          const B = fx * dx + fz * dz, C = fx * fx + fz * fz - R2;
          const disc = B * B - A * C;
          if (disc > 0) {
            const sq = Math.sqrt(disc);
            const t0 = Math.max(0, (-B - sq) / A), t1 = Math.min(1, (-B + sq) / A);
            if (t1 > t0) {
              effLen += (t1 - t0) * segLen;
              if (sMin < 0) sMin = s + t0 * segLen;
              sMax = s + t1 * segLen;
            }
          }
        }
        s += segLen;
      }
      if (effLen < 0.5) continue;
      const tier = TIER[p.h.type];
      cum += effLen * tier.weight * (1 - this.nightF * tier.nightCut);
      this.candidates.push({ p, sMin, sMax });
      this.candCum.push(cum);
    }
    this.candTotal = cum;
    this.targetAlive = Math.min(POOL, Math.round(cum / DENSITY_DIVISOR));
  }

  // binary search the cumulative weights: longer/busier-tier roads spawn more
  pickPoly() {
    const r = Math.random() * this.candTotal;
    let lo = 0, hi = this.candCum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.candCum[mid] < r) lo = mid + 1; else hi = mid;
    }
    return this.candidates[lo];
  }

  spawn(car, px, pz) {
    if (!this.candidates.length) return;
    for (let attempt = 0; attempt < 8; attempt++) {
      const { p, sMin, sMax } = this.pickPoly();
      const h = p.h;
      if (!h || h.pts.length < 2) return;
      // uniform position along the in-range arc span, not per-vertex
      let s = sMin + Math.random() * (sMax - sMin), seg = 0, t = 0;
      for (let i = 1; i < h.pts.length; i++) {
        const segLen = Math.hypot(h.pts[i][0] - h.pts[i - 1][0], h.pts[i][1] - h.pts[i - 1][1]);
        if (s <= segLen || i === h.pts.length - 1) { seg = i - 1; t = Math.min(1, s / (segLen || 1)); break; }
        s -= segLen;
      }
      const a = h.pts[seg], b = h.pts[seg + 1];
      const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < SPAWN_MIN || d > SPAWN_MAX) continue;
      const tier = TIER[h.type];
      const type = pickType(mixAt(tier, h.type, x, z));
      const semi = type === 'semi';
      const jitter = 0.8 + Math.random() * 0.4;
      const cruise = tier.speed * (semi ? 0.85 : 1) * jitter;
      Object.assign(car, {
        alive: true, h, seg, t, type, jitter, prevH: null,
        dir: Math.random() < 0.5 ? 1 : -1,
        // TTL recycles far-away cars: slow street wanderers hop junctions locally
        // forever and would otherwise squat the pool while fast interstate cars
        // drive out and die — the mix would drift away from the tier weights
        ttl: 20 + Math.random() * 20,
        cruise, curSpeed: cruise,
        laneOff: tier.lane, passing: 0, blockedT: 0, honkT: 0,
        color: (semi ? SEMI_COLORS : COLORS)[(Math.random() * (semi ? SEMI_COLORS : COLORS).length) | 0],
        scale: semi ? 0.95 + Math.random() * 0.15 : 0.85 + Math.random() * 0.35,
      });
      return;
    }
  }

  // end of polyline: hop onto a crossing road (looks like turning at the
  // intersection); dead end with no crossing -> U-turn. Never vanish mid-view.
  // Matches against segments, not vertices — simplification drops interior
  // vertices, so a T-junction onto a long straight has no nearby vertex.
  junctionHop(car) {
    const pts = car.h.pts;
    const atEnd = car.seg >= pts.length - 1;
    const [ex, ez] = atEnd ? pts[pts.length - 1] : pts[0];
    const r2 = JUNCTION_R * JUNCTION_R;
    const options = [];
    for (const { p } of this.candidates) {
      if (p.h === car.h || p.h === car.prevH) continue; // no instant turn-back
      if (ex < p.minX - JUNCTION_R || ex > p.maxX + JUNCTION_R || ez < p.minZ - JUNCTION_R || ez > p.maxZ + JUNCTION_R) continue;
      const hp = p.h.pts;
      for (let j = 0; j < hp.length - 1; j++) {
        const ax = hp[j][0], az = hp[j][1];
        const bx = hp[j + 1][0], bz = hp[j + 1][1];
        const dx = bx - ax, dz = bz - az;
        const L2 = dx * dx + dz * dz || 1e-6;
        const u = Math.max(0, Math.min(1, ((ex - ax) * dx + (ez - az) * dz) / L2));
        const qx = ax + dx * u - ex, qz = az + dz * u - ez;
        if (qx * qx + qz * qz < r2) { options.push({ h: p.h, seg: j, u }); break; }
      }
    }
    if (options.length) {
      const { h, seg, u } = options[(Math.random() * options.length) | 0];
      // land exactly at the junction; mostly keep the same heading, sometimes turn hard
      const fwd = [h.pts[seg + 1][0] - h.pts[seg][0], h.pts[seg + 1][1] - h.pts[seg][1]];
      const dot = fwd[0] * (car.hx || 0) + fwd[1] * (car.hz || 0);
      let dir = Math.random() < 0.25 ? (Math.random() < 0.5 ? 1 : -1) : dot >= 0 ? 1 : -1;
      // don't drive straight off the new polyline's end
      if (seg === 0 && u < 0.02) dir = 1;
      if (seg === h.pts.length - 2 && u > 0.98) dir = -1;
      car.prevH = car.h;
      car.h = h;
      car.seg = seg;
      car.t = u;
      car.dir = dir;
      const tier = TIER[h.type];
      car.cruise = tier.speed * (car.type === 'semi' ? 0.85 : 1) * car.jitter;
    } else {
      // U-turn at the dead end
      car.dir = -car.dir;
      if (atEnd) { car.seg = pts.length - 2; car.t = 1; }
      else { car.seg = 0; car.t = 0; }
    }
  }

  update(dt, px, pz, py = 0) {
    this.candTimer -= dt;
    if (this.candTimer <= 0) { this.candTimer = 2; this.refreshCandidates(px, pz); }

    const wx = 1 - (ATMOS.rain || 0) * 0.35; // everyone slows in the rain
    const lampsOn = this.nightF > 0.45 || (ATMOS.rain || 0) > 0.15;
    for (const lm of Object.values(this.lampMeshes)) lm.visible = lampsOn;
    // only a grounded player blocks traffic; the plane overhead doesn't
    const playerGrounded = py - hAt(px, pz) < 2.5;

    let alive = 0;
    for (const car of this.cars) if (car.alive) alive++;

    // --- pass 1: spawn up to the local supply target, advance, hop junctions ---
    for (const car of this.cars) {
      if (!car.alive && alive < this.targetAlive) { this.spawn(car, px, pz); if (car.alive) alive++; }
      if (!car.alive) continue;

      // advance along the polyline (dir: +1 forward through pts, -1 backward);
      // re-read pts each step — junctionHop may switch car.h mid-advance
      let remaining = car.curSpeed * wx * dt;
      let guard = 0;
      while (remaining > 0 && guard++ < 24) {
        const pts = car.h.pts;
        const a = pts[car.seg], b = pts[car.seg + 1];
        const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]) || 0.001;
        const tStep = remaining / segLen;
        if (car.dir > 0) {
          car.t += tStep;
          if (car.t < 1) break;
          remaining = (car.t - 1) * segLen;
          car.seg++; car.t = 0;
          if (car.seg >= pts.length - 1) this.junctionHop(car);
        } else {
          car.t -= tStep;
          if (car.t > 0) break;
          remaining = -car.t * segLen;
          car.seg--; car.t = 1;
          if (car.seg < 0) this.junctionHop(car);
        }
      }

      const cpts = car.h.pts;
      const a = cpts[car.seg], b = cpts[car.seg + 1];
      let dx = (b[0] - a[0]) * car.dir, dz = (b[1] - a[1]) * car.dir;
      const L = Math.hypot(dx, dz) || 1;
      car.hx = dx / L; car.hz = dz / L;
      car.cx = a[0] + (b[0] - a[0]) * car.t; // centerline; lane offset applied in pass 2
      car.cz = a[1] + (b[1] - a[1]) * car.t;
      const d = Math.hypot(car.cx - px, car.cz - pz);
      car.ttl -= dt;
      if (d > DESPAWN || (car.ttl <= 0 && d > 180)) car.alive = false; // never recycle in close view
    }

    // --- pass 2: behavior (follow, brake for the player, honk, pull around) ---
    const counts = { sedan: 0, pickup: 0, suv: 0, semi: 0 };
    for (const car of this.cars) {
      if (!car.alive) continue;
      const { hx, hz } = car;
      const tier = TIER[car.h.type];
      const ax = car.cx - hz * car.laneOff, az = car.cz + hx * car.laneOff;
      let desired = car.cruise;

      // following distance: don't rear-end the car ahead on the same road
      for (const o of this.cars) {
        if (o === car || !o.alive || o.h !== car.h || o.dir !== car.dir) continue;
        if ((o.seg + o.t - car.seg - car.t) * car.dir <= 0) continue; // o is behind
        const gap = Math.hypot(o.cx - car.cx, o.cz - car.cz);
        if (gap < 7) desired = Math.min(desired, o.curSpeed * (gap < 3.5 ? 0.6 : 0.95));
      }

      // player blocking the lane ahead
      const relX = px - ax, relZ = pz - az;
      const ahead = relX * hx + relZ * hz;
      const lat = Math.abs(relX * hz - relZ * hx);
      const blocking = playerGrounded && ahead > 0 && ahead < 4 + car.curSpeed * 1.4 && lat < 2.3;
      if (blocking && !car.passing) {
        if (car.blockedT === 0) car.honkT = 0.7; // first honk shortly after stopping
        car.blockedT += dt;
        // physical braking envelope: sqrt curve stays within DECEL capacity
        // (a linear ramp demands more deceleration than DECEL at high speed —
        // fast cars would overshoot and ghost through the player);
        // the linear term handles the final creep to a stop
        const room = Math.max(0, ahead - 3.2);
        desired = Math.min(desired, room * 1.4, 0.85 * Math.sqrt(2 * DECEL * room));
        if (car.curSpeed < 2.5) {
          car.honkT -= dt;
          if (car.honkT <= 0) { this.onHonk?.(car.type); car.honkT = 4 + Math.random() * 3; }
        }
        if (car.blockedT > 2.8) { car.passing = 1; this.onHonk?.(car.type); } // enough waiting — go around
      } else if (!blocking) {
        car.blockedT = 0;
      }
      if (car.passing) {
        desired = Math.min(desired, car.cruise * 0.55);
        if (ahead < -2 || !playerGrounded) { car.passing = 0; car.blockedT = 0; } // player cleared
      }

      // accel-limited speed and lane changes (swing wide while passing)
      const dv = desired * wx - car.curSpeed;
      car.curSpeed += Math.max(-DECEL * dt, Math.min(ACCEL * dt, dv));
      const laneTarget = tier.lane + (car.passing ? 2.4 : 0);
      const dl = laneTarget - car.laneOff;
      car.laneOff += Math.max(-3 * dt, Math.min(3 * dt, dl));

      const x = car.cx - hz * car.laneOff, z = car.cz + hx * car.laneOff;
      const mesh = this.meshes[car.type];
      const i = counts[car.type]++;
      this.q.setFromAxisAngle(this.up, Math.atan2(-hx, -hz));
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
