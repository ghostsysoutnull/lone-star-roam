// Freight trains: locomotive + long consists of instanced cars following the
// real rail network near the player. Horns blast when one passes close.
// Rails W2: named border crossings — on a seeded daily schedule the Tex-Mex
// Interchange (Laredo) and Eagle Pass Manifest cross the Rio Grande on their
// baked spur routes, and the Z double-stack runs the longest BNSF line.
import * as THREE from 'three';
import { GEO, hAt, seededRand } from './geo.js';
import { merge, tinted } from './traffic.js';
import { ATMOS, DAY_SECONDS } from './sky.js';

const MAX_TRAINS = 3;
const SPAWN_R = 350, DESPAWN_R = 1200; // despawn only beyond fog — never in plain sight
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
// double-stack well car: lower container baked weathered brown, upper takes
// the instance tint — one tint, two-tone stack, silhouette taller than anything
const mkWellCar = () => merge([
  tinted(new THREE.BoxGeometry(1.7, 1.1, 2.9).translate(0, 1.0, 0), 0x8a5a3a),
  tinted(new THREE.BoxGeometry(1.7, 1.1, 2.6).translate(0, 2.1, 0), 0xffffff),
  tinted(new THREE.BoxGeometry(1.85, 0.3, 3.1).translate(0, 0.45, 0), DARK),
  wheelPair(-1.15), wheelPair(1.15),
]);
const mkCoach = () => merge([
  tinted(new THREE.BoxGeometry(1.7, 1.3, 3.1).translate(0, 1.15, 0), 0xffffff),
  tinted(new THREE.BoxGeometry(1.74, 0.4, 2.5).translate(0, 1.45, 0), 0x2e3640), // window band
  tinted(new THREE.BoxGeometry(1.8, 0.35, 3.1).translate(0, 0.5, 0), DARK),
  wheelPair(-1.1), wheelPair(1.1),
]);

const LOCO_COLORS = [0xd8a13b, 0x3b62c2, 0xc23b3b, 0x3f7a3f];
const CAR_COLORS = [0x8a5a3a, 0x5a6a72, 0x7a3b3b, 0x4a6a4a, 0x9a8a4a, 0x555a66, 0xb05a2a];

// Real operator liveries: instance tint on the white bodywork only — the
// frame stays baked DARK. Both UP spellings appear in the OSM bake. DART is
// deliberately absent (light rail, near-absent from the usage=main bake —
// real-or-absent). Freight cars stay CAR_COLORS: interchange practice.
const LIVERY = {
  'Union Pacific Railroad': 0xffc21e, 'Union Pacific': 0xffc21e,
  'BNSF Railway': 0xff5a14,
  'CPKC': 0xcc1f33,
  'Rio Grande Pacific Corporation': 0x6e3042,
  'Trinity Railway Express': 0xe8eaf0,
  'TEXRail': 0xc9ced6,
};
const COMMUTER = new Set(['Trinity Railway Express', 'TEXRail']);
// Commuter sets are short (loco + 3–5 coaches ≈ 20 units), so they accept the
// short urban lines the freight mainline filter exists to reject.
const FREIGHT_EXT = 350, FREIGHT_LEN = 500, COMMUTER_EXT = 40, COMMUTER_LEN = 60;

// Named trains (Rails W2). Border crossings run their baked spur route; the Z
// runs the longest BNSF mainline. 3 runs per site per game day, times from the
// railxing: seed streams (forever once shipped) — one per third of the day.
// A run only spawns if the player is inside the ring when its window is open.
const NAMED = {
  laredo: { name: 'the Tex-Mex Interchange', operator: 'CPKC', wagons: 'mixed' },
  eaglepass: { name: 'the Eagle Pass Manifest', operator: 'Union Pacific Railroad', wagons: 'mixed' },
  ztrain: { name: 'the Z', operator: 'BNSF Railway', wagons: 'well' },
};
const NAMED_CARS = 18, NAMED_LOCOS = 2, TOAST_R = 60, TOAST_REARM_R = 90;
export const crossingTimes = (site, day) => {
  const rnd = seededRand(`railxing:${site}:${Math.floor(day)}`);
  return Array.from({ length: 3 }, (_, i) => (i + rnd()) / 3);
};

export class TrainSystem {
  constructor(scene) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    // pools cover MAX_TRAINS random consists + all three named trains at once
    const POOL = (MAX_TRAINS + 2) * 30;
    this.meshes = {
      loco: new THREE.InstancedMesh(mkLoco(), mat, MAX_TRAINS + 3 * NAMED_LOCOS),
      boxcar: new THREE.InstancedMesh(mkBoxcar(), mat, POOL),
      hopper: new THREE.InstancedMesh(mkHopper(), mat, POOL),
      tanker: new THREE.InstancedMesh(mkTanker(), mat, POOL),
      coach: new THREE.InstancedMesh(mkCoach(), mat, MAX_TRAINS * 6),
      well: new THREE.InstancedMesh(mkWellCar(), mat, NAMED_CARS + 2),
    };
    for (const m of Object.values(this.meshes)) {
      m.frustumCulled = false;
      scene.add(m);
    }
    // loco headlight beams at night — same fake-cone trick as the truck (vehicle.js)
    const beamGeo = new THREE.ConeGeometry(1.0, 10, 10, 1, true).rotateX(Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xfff3cc, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    });
    this.beams = Array.from({ length: this.meshes.loco.count }, () => {
      const b = new THREE.Mesh(beamGeo, beamMat);
      b.visible = false;
      scene.add(b);
      return b;
    });
    // rails with bbox + lazy cumulative arc lengths
    this.rails = GEO.rails.map((r) => {
      let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      for (const [x, z] of r.pts) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      return {
        pts: r.pts, minX, maxX, minZ, maxZ, cum: null, len: 0,
        operator: r.operator ?? null,
        livery: LIVERY[r.operator] ?? null,
        commuter: COMMUTER.has(r.operator),
        spur: r.spur ?? null, // border spurs: scheduled named trains only, never random spawn
        bridge: r.bridge ?? null,
      };
    });
    this.LIVERY = LIVERY; // checks assert chosen colors against the same table
    this.crossingTimes = crossingTimes; // checks assert schedule determinism against the same stream
    // named-train routes: the two baked spurs + the longest BNSF mainline (the Z)
    this.namedRails = {};
    for (const r of this.rails) if (r.spur) this.namedRails[r.spur] = r;
    let z = null, zd = 0;
    for (const r of this.rails) {
      if (r.spur || r.operator !== 'BNSF Railway') continue;
      const d = Math.hypot(r.maxX - r.minX, r.maxZ - r.minZ);
      if (d > zd) { zd = d; z = r; }
    }
    this.namedRails.ztrain = z;
    this.crossingsRun = new Set(); // one spawn per (site, day, slot)
    this.trains = [];
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
    this.col = new THREE.Color();
    this.spawnT = 0;
    this.onHorn = null;
    this.onNamed = null;
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
    const near = this.rails.filter((r) => !r.spur &&
      px > r.minX - SPAWN_R && px < r.maxX + SPAWN_R && pz > r.minZ - SPAWN_R && pz < r.maxZ + SPAWN_R &&
      // freight mainlines only — no 14-car trains on 200-unit yard spurs;
      // short commuter sets accept the short urban lines
      Math.max(r.maxX - r.minX, r.maxZ - r.minZ) > (r.commuter ? COMMUTER_EXT : FREIGHT_EXT));
    if (!near.length) return;
    const rail = near[(Math.random() * near.length) | 0];
    this.arcInit(rail);
    if (rail.len < (rail.commuter ? COMMUTER_LEN : FREIGHT_LEN)) return;
    const nCars = rail.commuter ? 3 + ((Math.random() * 3) | 0) : 14 + ((Math.random() * 14) | 0);
    if (rail.len < nCars * CAR_LEN + (rail.commuter ? 20 : 60)) return;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const s0 = Math.random() * rail.len;
    // don't spawn right on top of the player
    const [sx, , , ] = this.at(rail, s0), [, sz2] = this.at(rail, s0);
    if (Math.hypot(sx - px, sz2 - pz) < 80) return;
    const types = ['boxcar', 'hopper', 'tanker'];
    this.trains.push({
      rail, s: s0, dir,
      locoColor: rail.livery ?? LOCO_COLORS[(Math.random() * LOCO_COLORS.length) | 0],
      cars: Array.from({ length: nCars }, () => (rail.commuter
        ? { type: 'coach', color: rail.livery }
        : {
          type: types[(Math.random() * types.length) | 0],
          color: CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0],
        })),
    });
  }

  // Deterministic spawn for the harness and tour spots: nearest eligible rail,
  // consist placed at the arc point nearest (x,z), no Math.random on any path.
  // Evicts the oldest train when the roster is full. Returns the train.
  force(x, z) {
    let best = null, bestD = Infinity;
    for (const r of this.rails) {
      if (r.spur) continue; // border spurs are the named trains' turf
      if (Math.max(r.maxX - r.minX, r.maxZ - r.minZ) <= (r.commuter ? COMMUTER_EXT : FREIGHT_EXT)) continue;
      this.arcInit(r);
      if (r.len < (r.commuter ? COMMUTER_LEN : FREIGHT_LEN)) continue;
      for (let i = 0; i < r.pts.length; i++) {
        const d = Math.hypot(r.pts[i][0] - x, r.pts[i][1] - z);
        if (d < bestD) { bestD = d; best = { rail: r, s: r.cum[i] }; }
      }
    }
    if (!best) return null;
    const { rail } = best;
    const nCars = rail.commuter ? 4 : 18;
    const total = (nCars + 1) * CAR_LEN;
    if (rail.len < total + 4) return null;
    if (this.trains.length >= MAX_TRAINS) this.trains.shift();
    const types = ['boxcar', 'hopper', 'tanker'];
    const tr = {
      rail, dir: 1, s: Math.min(Math.max(best.s, total + 2), rail.len - 2),
      locoColor: rail.livery ?? LOCO_COLORS[0],
      cars: Array.from({ length: nCars }, (_, i) => (rail.commuter
        ? { type: 'coach', color: rail.livery }
        : { type: types[i % types.length], color: CAR_COLORS[i % CAR_COLORS.length] })),
    };
    this.trains.push(tr);
    return tr;
  }

  // Deterministic named-train spawn on its route (debug actions + the daily
  // schedule). sOffset places a mid-window arrival mid-run; (nx, nz) instead
  // starts the run at the arc point nearest that spot (the Z's mainline is
  // long — the forced Z appears where the player is). One instance per name;
  // no Math.random on any path. Returns the train.
  startNamed(key, sOffset = 0, nx, nz) {
    const def = NAMED[key], rail = this.namedRails[key];
    if (!def || !rail) return null;
    this.arcInit(rail);
    this.trains = this.trains.filter((t) => t.named !== def.name);
    const types = ['boxcar', 'hopper', 'tanker'];
    const cars = [];
    for (let i = 1; i < NAMED_LOCOS; i++) cars.push({ type: 'loco', color: LIVERY[def.operator] });
    for (let i = 0; i < NAMED_CARS; i++) cars.push(def.wagons === 'well'
      ? { type: 'well', color: CAR_COLORS[i % CAR_COLORS.length] }
      : { type: types[i % types.length], color: CAR_COLORS[i % CAR_COLORS.length] });
    const total = (cars.length + 1) * CAR_LEN;
    let s = total + 2 + sOffset;
    if (nx !== undefined) {
      let bd = Infinity;
      for (let i = 0; i < rail.pts.length; i++) {
        const d = Math.hypot(rail.pts[i][0] - nx, rail.pts[i][1] - nz);
        if (d < bd) { bd = d; s = rail.cum[i]; }
      }
    }
    const tr = {
      rail, dir: 1, named: def.name,
      s: Math.min(Math.max(s, total + 2), rail.len - 2),
      locoColor: LIVERY[def.operator],
      cars,
    };
    this.trains.push(tr);
    return tr;
  }

  // Named trains don't brake at a junction: find the connecting rail at this
  // one's outbound end and keep rolling into the network — the spur is only
  // the border approach, and a through train stopping dead in Laredo reads
  // broken. Picks the candidate whose tangent best continues the heading
  // (≥ ~72° cone); returns null at a true dead end (the hold law applies).
  hopAt(rail, dir, minRun = 0) {
    const [ex, ez] = rail.pts[dir > 0 ? rail.pts.length - 1 : 0];
    const [, , tdx, tdz] = this.at(rail, dir > 0 ? rail.len : 0);
    const fx = tdx * dir, fz = tdz * dir;
    let best = null, bestDot = 0.3;
    for (const r of this.rails) {
      if (r === rail || r.spur) continue;
      if (ex < r.minX - 17 || ex > r.maxX + 17 || ez < r.minZ - 17 || ez > r.maxZ + 17) continue;
      let bd = 1e9, bi = 0;
      for (let i = 0; i < r.pts.length; i++) {
        const d = Math.hypot(r.pts[i][0] - ex, r.pts[i][1] - ez);
        if (d < bd) { bd = d; bi = i; }
      }
      // 15 u ≈ 1.5 km: junction nodes in the bake sit up to ~1 km off the
      // connecting sub's nearest vertex (Eagle Pass → Del Rio Sub is 10.4)
      if (bd > 15) continue;
      this.arcInit(r);
      const s0 = r.cum[bi];
      const [, , dx2, dz2] = this.at(r, s0);
      const dot = fx * dx2 + fz * dz2;
      const dir2 = dot >= 0 ? 1 : -1;
      // a hop must buy real onward track — landing a train-length from the
      // target's own end ping-pongs at the junction instead of rolling on
      if ((dir2 > 0 ? r.len - s0 : s0) < minRun) continue;
      if (Math.abs(dot) > bestDot) { bestDot = Math.abs(dot); best = { rail: r, s: s0, dir: dir2 }; }
    }
    return best;
  }

  // seeded daily crossing schedule — spawn only while the player is inside the
  // ring, mid-window arrivals join mid-run, one run per (site, day, slot).
  // A slot never replaces a still-running train of the same name (a window
  // opening mid-watch must not teleport the one the player is following).
  updateCrossings(px, pz, day) {
    const d = Math.floor(day), f = day - d;
    for (const key of Object.keys(NAMED)) {
      const rail = this.namedRails[key];
      if (!rail) continue;
      if (this.trains.some((t) => t.named === NAMED[key].name)) continue;
      if (px < rail.minX - SPAWN_R || px > rail.maxX + SPAWN_R ||
          pz < rail.minZ - SPAWN_R || pz > rail.maxZ + SPAWN_R) continue;
      this.arcInit(rail);
      const dur = rail.len / SPEED / DAY_SECONDS; // window length as a day fraction
      const times = crossingTimes(key, d);
      for (let slot = 0; slot < times.length; slot++) {
        if (f < times[slot] || f > times[slot] + dur) continue;
        const id = `${key}:${d}:${slot}`;
        if (this.crossingsRun.has(id)) continue;
        this.crossingsRun.add(id);
        this.startNamed(key, (f - times[slot]) * DAY_SECONDS * SPEED);
      }
    }
  }

  update(dt, px, pz, day) {
    this.spawnT -= dt;
    this.hornT -= dt;
    if (this.trains.filter((t) => !t.named).length < MAX_TRAINS && this.spawnT <= 0) {
      this.spawnT = 4;
      this.spawn(px, pz);
    }
    if (day !== undefined) this.updateCrossings(px, pz, day);

    const counts = { loco: 0, boxcar: 0, hopper: 0, tanker: 0, coach: 0, well: 0 };
    let beamI = 0; // beams belong to lead locos only — trailing units hold no light
    for (const tr of this.trains) {
      const total = (tr.cars.length + 1) * CAR_LEN;
      // end of line: hold at the buffer if the player is watching, retire otherwise
      let atEnd = (tr.dir > 0 && tr.s >= tr.rail.len) || (tr.dir < 0 && tr.s <= total);
      if (atEnd && tr.named) {
        const hop = this.hopAt(tr.rail, tr.dir, total + 20);
        if (hop) { tr.rail = hop.rail; tr.s = hop.s; tr.dir = hop.dir; atEnd = false; }
      }
      if (!atEnd) tr.s += SPEED * tr.dir * dt;
      else {
        tr.s = tr.dir > 0 ? tr.rail.len : total;
        const [hx, hz] = this.at(tr.rail, tr.s);
        if (Math.hypot(hx - px, hz - pz) > 300) { tr.dead = true; continue; }
      }
      tr.dead = true;
      for (let c = 0; c <= tr.cars.length; c++) {
        const s = tr.s - tr.dir * c * CAR_LEN;
        if (s < 0 || s > tr.rail.len) continue;
        const [x, z, dx, dz] = this.at(tr.rail, s);
        const d = Math.hypot(x - px, z - pz);
        if (d < DESPAWN_R) tr.dead = false;
        // horn when the locomotive passes near
        if (c === 0 && d < 55 && this.hornT <= 0) { this.hornT = 25; this.onHorn?.(); }
        // named train announces itself once per approach, re-arms on exit
        if (c === 0 && tr.named) {
          if (d < TOAST_R && !tr.toasted) { tr.toasted = true; this.onNamed?.(tr.named); }
          else if (d > TOAST_REARM_R) tr.toasted = false;
        }
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
        // loco headlight: beam cone ahead of the nose after dark
        if (c === 0) {
          const beam = this.beams[beamI++];
          beam.visible = ATMOS.night > 0.45;
          if (beam.visible) {
            const L = Math.hypot(dx, dz) || 1;
            const fx = (dx * tr.dir) / L, fz = (dz * tr.dir) / L;
            beam.position.set(x + fx * 7.6, hAt(x, z) + 1.4, z + fz * 7.6);
            beam.rotation.y = Math.atan2(-fx, -fz);
          }
        }
      }
    }
    this.trains = this.trains.filter((t) => !t.dead);

    for (let j = beamI; j < this.beams.length; j++) this.beams[j].visible = false;
    this.m4.makeScale(0, 0, 0);
    for (const [type, mesh] of Object.entries(this.meshes)) {
      for (let j = counts[type]; j < mesh.instanceMatrix.count; j++) mesh.setMatrixAt(j, this.m4);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
