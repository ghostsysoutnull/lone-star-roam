// Airports: ~20 real Texas fields with true runway headings authored from OSM
// aeroway=runway geometry (2026-07; numbers are magnetic, geometry is truth).
// All static geometry merges into 8 global meshes; the only per-frame work is
// beacon spin + windsock swing. airportClear(x,z) is the pure exclusion query
// (chapelAt lesson) used by cities.js, ScenerySystem and chapelAt — it needs
// no meshes and no elevation, so it works from module load.
import * as THREE from 'three';
import { seededRand, hAt } from './geo.js';
import { ATMOS } from './sky.js';

const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];
const D2R = Math.PI / 180;

// rw: hdg = TRUE degrees (0-180, a runway is bidirectional), len in units
// (real meters / 100), off = runway-center offset from `at` in units — all
// three measured from OSM way geometry. Width is mini-world exaggerated per
// tier (real ~45-60 m would be an invisible thread next to 3.2-wide motorways).
export const AIRPORTS = [
  { id: 'DFW', name: 'Dallas–Fort Worth Intl', city: 'Dallas', tier: 1, at: LL(32.8989, -97.0345),
    rw: [{ hdg: 0.3, len: 40.9, off: [4.3, 1.8] }, { hdg: 0.2, len: 40.9, off: [-15.6, 1.7] }],
    fact: 'Bigger than Manhattan, with its own ZIP code and mayor.' },
  { id: 'DAL', name: 'Dallas Love Field', city: 'Dallas', tier: 1, at: LL(32.8498, -96.8549),
    rw: [{ hdg: 135.7, len: 25.3, off: [1.9, 8.5] }, { hdg: 135.8, len: 22.4, off: [7.1, 0.6] }],
    fact: 'Love Field — the ten-minute turnaround and the Love–Hobby shuttle were invented here.' },
  { id: 'IAH', name: 'Houston Intercontinental', city: 'Houston', tier: 1, at: LL(29.9854, -95.3412),
    rw: [{ hdg: 152.1, len: 36.7, off: [-7.4, 13.5] }, { hdg: 90.0, len: 28.6, off: [1.0, -8.9] }],
    fact: 'The Gulf Coast’s gateway to everywhere.' },
  { id: 'HOU', name: 'Houston Hobby', city: 'Houston', tier: 1, at: LL(29.6467, -95.2788),
    rw: [{ hdg: 43.8, len: 23.2, off: [1.7, 0.1] }, { hdg: 134.1, len: 20.0, off: [2.9, 4.5] }],
    fact: 'Houston’s original airport — flying since 1927.' },
  { id: 'AUS', name: 'Austin–Bergstrom Intl', city: 'Austin', tier: 1, at: LL(30.1941, -97.6683),
    rw: [{ hdg: 178.7, len: 37.4, off: [-10.2, -3.0] }, { hdg: 178.7, len: 27.4, off: [10.2, 3.0] }],
    fact: 'Built on the runways of the old Bergstrom Air Force Base.' },
  { id: 'SAT', name: 'San Antonio Intl', city: 'San Antonio', tier: 1, at: LL(29.5355, -98.4724),
    rw: [{ hdg: 131.8, len: 20.7, off: [-1.1, 2.3] }, { hdg: 40.7, len: 26.0, off: [10.7, 3.8] }],
    fact: 'Short final over the Hill Country oaks.' },
  { id: 'ELP', name: 'El Paso Intl', city: 'El Paso', tier: 1, at: LL(31.8049, -106.3798),
    rw: [{ hdg: 49.8, len: 36.6, off: [-5.0, -8.1] }, { hdg: 93.3, len: 27.3, off: [5.4, 3.9] }],
    fact: 'Desert jets under the Franklin Mountains, at the state’s far west tip.' },
  { id: 'LBB', name: 'Lubbock Preston Smith Intl', city: 'Lubbock', tier: 2, at: LL(33.6615, -101.8186),
    rw: [{ hdg: 179.7, len: 35.2, off: [-9.8, -5.6] }], fact: 'Buddy Holly’s hometown field, flat as the Caprock.' },
  { id: 'AMA', name: 'Amarillo Rick Husband Intl', city: 'Amarillo', tier: 2, at: LL(35.2199, -101.7022),
    rw: [{ hdg: 45.8, len: 41.1, off: [-13.6, 2.1] }], fact: '13,502 ft of concrete — built for B-52s, listed as a shuttle abort site.' },
  { id: 'MAF', name: 'Midland Intl', city: 'Midland', tier: 2, at: LL(31.9413, -102.2008),
    rw: [{ hdg: 175.1, len: 29.0, off: [-3.2, -5.6] }], fact: 'Oil-patch aviation hub and longtime home of the Commemorative Air Force.' },
  { id: 'CRP', name: 'Corpus Christi Intl', city: 'Corpus Christi', tier: 2, at: LL(27.7714, -97.5013),
    rw: [{ hdg: 135.9, len: 27.1, off: [-4.9, 0.8] }], fact: 'Sea breeze on final; half the pattern is Navy trainers.' },
  { id: 'HRL', name: 'Valley Intl', city: 'Harlingen', tier: 2, at: LL(26.2271, -97.6547),
    rw: [{ hdg: 0.6, len: 25.3, off: [-3.8, -2.1] }], fact: 'The Rio Grande Valley’s front door.' },
  { id: 'LRD', name: 'Laredo Intl', city: 'Laredo', tier: 2, at: LL(27.5441, -99.4616),
    rw: [{ hdg: 2.5, len: 26.1, off: [-1.4, -0.6] }], fact: 'Border cargo hub — freighters cross the river all night.' },
  { id: 'ABI', name: 'Abilene Regional', city: 'Abilene', tier: 2, at: LL(32.4132, -99.6832),
    rw: [{ hdg: 179.7, len: 22.0, off: [-1.6, -5.5] }], fact: 'B-1s from Dyess share the pattern.' },
  { id: 'ACT', name: 'Waco Regional', city: 'Waco', tier: 2, at: LL(31.6120, -97.2309),
    rw: [{ hdg: 14.2, len: 21.7, off: [3.6, -1.1] }], fact: 'Air Force One drops in whenever the ranch calls.' },
  { id: 'TYR', name: 'Tyler Pounds Regional', city: 'Tyler', tier: 2, at: LL(32.3546, -95.4022),
    rw: [{ hdg: 44.9, len: 25.3, off: [-1.5, 3.0] }], fact: 'A piney-woods field named for a WWII flyer.' },
  { id: 'MRF', name: 'Marfa Municipal', city: 'Marfa', tier: 3, at: LL(30.3714, -104.0166),
    rw: [{ hdg: 135.4, len: 18.9, off: [-2.0, -0.7] }], fact: 'High-desert thermals — glider country. The Lights sit just east.' },
  { id: 'TRL', name: 'Terlingua Ranch', city: 'Terlingua', tier: 3, at: LL(29.4514, -103.3976), dirt: true,
    rw: [{ hdg: 29.0, len: 14.4, off: [0, 0] }], fact: 'A dirt strip for the ghost town. Check for javelinas on the roll.' },
  { id: 'SSS', name: '6666 Ranch Airstrip', city: 'Guthrie', tier: 3, at: LL(33.6427, -100.3472),
    rw: [{ hdg: 18.4, len: 18.0, off: [0, 0] }], fact: 'The Four Sixes — won, the legend says, on four sixes in a poker hand.' },
  { id: 'ARM', name: 'Armstrong Ranch Airstrip', city: 'Armstrong', tier: 3, at: LL(26.9327, -97.7611),
    rw: [{ hdg: 121.7, len: 12.0, off: [0, 0] }], fact: 'A private strip on one of the great South Texas ranches.' },
];

const RW_W = [0, 3.0, 2.2, 1.4];   // runway width by tier (mini-world)
const MARGIN = [0, 9, 7, 3.5];     // footprint apron margin by tier

// --- pure layout math (no meshes, no elevation — safe at module load) ---
for (const a of AIRPORTS) {
  a.rws = a.rw.map((r) => {
    const dx = Math.sin(r.hdg * D2R), dz = -Math.cos(r.hdg * D2R); // true heading → world dir
    return { cx: a.at[0] + r.off[0], cz: a.at[1] + r.off[1], dx, dz, hl: r.len / 2, w: RW_W[a.tier], hdg: r.hdg };
  });
  // footprint: rectangle in the primary (longest) runway's frame, covering all
  // runway endpoints plus an apron margin — this is the exclusion shape
  const p = a.rws.reduce((x, y) => (y.hl > x.hl ? y : x));
  a.ax = p.dx; a.az = p.dz;                    // frame U axis (along primary)
  const px = -p.dz, pz = p.dx;                 // frame V axis (perp)
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  for (const r of a.rws) {
    for (const s of [-1, 1]) {
      const ex = r.cx + r.dx * r.hl * s - a.at[0], ez = r.cz + r.dz * r.hl * s - a.at[1];
      const u = ex * a.ax + ez * a.az, v = ex * px + ez * pz;
      u0 = Math.min(u0, u - r.w); u1 = Math.max(u1, u + r.w);
      v0 = Math.min(v0, v - r.w); v1 = Math.max(v1, v + r.w);
    }
  }
  const M = MARGIN[a.tier];
  a.foot = { u0: u0 - M, u1: u1 + M, v0: v0 - M, v1: v1 + M };
  a.maxR = Math.hypot(Math.max(-a.foot.u0, a.foot.u1), Math.max(-a.foot.v0, a.foot.v1));
}

// true when (x,z) is outside every airport footprint — placement systems call
// this in their seeded loops, so it must stay pure and cheap
export function airportClear(x, z) {
  for (const a of AIRPORTS) {
    const ex = x - a.at[0], ez = z - a.at[1];
    if (ex * ex + ez * ez > a.maxR * a.maxR) continue;
    const u = ex * a.ax + ez * a.az, v = ex * -a.az + ez * a.ax;
    if (u >= a.foot.u0 && u <= a.foot.u1 && v >= a.foot.v0 && v <= a.foot.v1) return false;
  }
  return true;
}

// world-space footprint corner / interior-point helpers (verify + mesh builder)
const fpPoint = (a, u, v) => [a.at[0] + a.ax * u - a.az * v, a.at[1] + a.az * u + a.ax * v];

// full site layout with elevation — pure given the table + hAt, recomputed on
// call (the determinism check evaluates it twice and compares)
export function airportLayout() {
  return AIRPORTS.map((a) => {
    const { u0, u1, v0, v1 } = a.foot;
    let maxH = -1e9;
    const su = Math.max(1.5, (u1 - u0) / 28), sv = Math.max(1.5, (v1 - v0) / 28);
    for (let u = u0; u <= u1; u += su)
      for (let v = v0; v <= v1; v += sv) {
        const [x, z] = fpPoint(a, u, v);
        maxH = Math.max(maxH, hAt(x, z));
      }
    const padY = maxH + 0.06;
    const corners = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => fpPoint(a, u, v));
    return {
      id: a.id, tier: a.tier, padY, corners,
      rws: a.rws.map((r) => ({ x1: r.cx - r.dx * r.hl, z1: r.cz - r.dz * r.hl, x2: r.cx + r.dx * r.hl, z2: r.cz + r.dz * r.hl, w: r.w, hdg: r.hdg })),
    };
  });
}

// seeded per-game-day wind direction (degrees true, wind blows FROM this) —
// ATMOS has speed but no direction; waves 2/3 (runway-in-use, ATIS) must read
// this same stream so the windsock never disagrees with the tower
export const windFrom = (day) => Math.floor(seededRand('avnwind:' + Math.floor(day))() * 36) * 10;

// a point is clear of every runway corridor by `rad` (keeps our own terminal
// and hangars off the pavement, crossing-runway fields included)
function clearOfRunways(a, x, z, rad) {
  for (const r of a.rws) {
    const ex = x - r.cx, ez = z - r.cz;
    const u = ex * r.dx + ez * r.dz, v = ex * -r.dz + ez * r.dx;
    if (Math.abs(v) < r.w / 2 + rad && Math.abs(u) < r.hl + rad) return false;
  }
  return true;
}

export class AirportSystem {
  constructor(scene) {
    this.layout = airportLayout();
    this.beaconAngle = 0;
    this.day = -1;
    this.windDeg = 0;   // degrees true, FROM
    this.droop = 1.1;   // windsock angle below horizontal (rad); eased toward wind
    const flats = { pad: [], skirt: [], rwy: [], dirt: [], mark: [] };
    const boxes = [];   // {x,z,y,rot,sx,sy,sz,color}
    this.beacons = [];  // {x,z,y,phase}
    this.socks = [];    // {x,z,y}

    for (let i = 0; i < AIRPORTS.length; i++) {
      const a = AIRPORTS[i], L = this.layout[i], y = L.padY;
      const { u0, u1, v0, v1 } = a.foot;
      const P = (u, v, yy) => { const [x, z] = fpPoint(a, u, v); return [x, yy, z]; };

      // pad + skirt draping to terrain (a low mesa; outer ring dips under ground)
      quad(flats.pad, P(u0, v0, y), P(u0, v1, y), P(u1, v1, y), P(u1, v0, y));
      const inner = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
      const outer = inner.map(([u, v]) => {
        const [x, z] = fpPoint(a, u + Math.sign(u - (u0 + u1) / 2) * 4, v + Math.sign(v - (v0 + v1) / 2) * 4);
        return [x, hAt(x, z) - 0.8, z];
      });
      for (let k = 0; k < 4; k++) {
        const [ua, va] = inner[k], [ub, vb] = inner[(k + 1) % 4];
        quad(flats.skirt, P(ua, va, y), P(ub, vb, y), outer[(k + 1) % 4], outer[k]);
      }

      // runways float a ribbon offset above the pad, markings above the runway
      for (const r of a.rws) {
        rect(a.dirt ? flats.dirt : flats.rwy, r, 0, 0, r.hl * 2, r.w, y + 0.1);
        if (a.dirt) continue;
        for (let u = -r.hl + 2.5; u < r.hl - 2.5; u += 2.8) rect(flats.mark, r, u + 0.7, 0, 1.4, 0.18, y + 0.16); // centerline dashes
        for (const e of [-1, 1]) for (const s of [-0.34, -0.15, 0.15, 0.34])
          rect(flats.mark, r, e * (r.hl - 1.2), s * r.w, 1.7, 0.2, y + 0.16); // threshold bars
      }

      // apron anchor: between the runways where there are two, pushed off the
      // pavement where there's one; scan across V for a clear terminal spot
      const prim = a.rws.reduce((x, r) => (r.hl > x.hl ? r : x));
      const mean = a.rws.reduce((m, r) => [m[0] + r.cx / a.rws.length, m[1] + r.cz / a.rws.length], [0, 0]);
      const pvx = -a.az, pvz = a.ax;
      let anchor = null;
      for (const k of [0, 6, -6, 10, -10, 14, -14, 18, -18]) {
        const x = mean[0] + pvx * k + (a.rws.length === 1 ? pvx * (prim.w / 2 + 5) : 0);
        const z = mean[1] + pvz * k + (a.rws.length === 1 ? pvz * (prim.w / 2 + 5) : 0);
        if (clearOfRunways(a, x, z, 3.5)) { anchor = [x, z]; break; }
      }
      anchor ??= [mean[0] + pvx * (prim.w / 2 + 6), mean[1] + pvz * (prim.w / 2 + 6)];
      const rot = Math.atan2(-a.az, a.ax); // boxes align to the primary runway
      const B = (du, dv, sx, sy, sz, color, yBase = 0) => {
        const x = anchor[0] + a.ax * du + pvx * dv, z = anchor[1] + a.az * du + pvz * dv;
        if (!clearOfRunways(a, x, z, Math.max(sx, sz) / 2 + 0.6)) return;
        boxes.push({ x, z, y: y + yBase, rot, sx, sy, sz, color });
      };
      if (a.tier === 1) {
        B(0, 0, 12, 2.1, 4, 0xd8d2c4);                       // terminal
        B(7.5, 2.5, 1.1, 6.4, 1.1, 0xcfd4da); B(7.5, 2.5, 2.1, 1.2, 2.1, 0x2f4c66, 6.4); // tower + cab
        B(-10.5, 0, 5, 2.3, 5.5, 0x9aa0a8); B(11.5, 0, 5, 2.3, 5.5, 0x9aa0a8); B(16, 1.5, 4, 2, 4.5, 0xa8a49a);
      } else if (a.tier === 2) {
        B(0, 0, 6, 1.5, 2.8, 0xd8d2c4);
        B(5.5, 0.5, 4, 1.8, 4.5, 0x9aa0a8);
      } else {
        B(0, 0, 3, 1.4, 3.5, 0x8f6e4a);                      // lone hangar
      }
      if (a.tier <= 2) { // rotating night beacon atop its own mast
        B(-5.5, 2, 0.45, 4.4, 0.45, 0xc8ccd2);
        const bx = anchor[0] + a.ax * -5.5 + pvx * 2, bz = anchor[1] + a.az * -5.5 + pvz * 2;
        this.beacons.push({ x: bx, z: bz, y: y + 4.6, phase: i * 0.7 });
      }
      // windsock near the primary threshold (flip sides if the pole would sit on a crossing runway)
      for (const s of [1, -1]) {
        const sx2 = prim.cx + prim.dx * prim.hl * 0.72 + -prim.dz * (prim.w / 2 + 2.2) * s;
        const sz2 = prim.cz + prim.dz * prim.hl * 0.72 + prim.dx * (prim.w / 2 + 2.2) * s;
        if (s === -1 || clearOfRunways(a, sx2, sz2, 0.4)) {
          boxes.push({ x: sx2, z: sz2, y, rot, sx: 0.12, sy: 2.1, sz: 0.12, color: 0xe8e8e2 });
          this.socks.push({ x: sx2, z: sz2, y: y + 2.05 });
          break;
        }
      }
    }

    const mesh = (tris, color) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
      g.computeVertexNormals();
      return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color }));
    };
    this.group = new THREE.Group(); // one handle over all airport meshes (verify raycasts against it)
    this.group.add(mesh(flats.pad, 0x77746c), mesh(flats.skirt, 0x7a6c52), mesh(flats.rwy, 0x2e2f35),
      mesh(flats.dirt, 0x8a7350), mesh(flats.mark, 0xe9e9df));

    const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.bld = new THREE.InstancedMesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), boxes.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    boxes.forEach((b, k) => {
      m4.compose(new THREE.Vector3(b.x, b.y, b.z), q.setFromAxisAngle(up, b.rot), new THREE.Vector3(b.sx, b.sy, b.sz));
      this.bld.setMatrixAt(k, m4);
      this.bld.setColorAt(k, new THREE.Color(b.color));
    });
    this.group.add(this.bld);

    // dynamic bits: one InstancedMesh each for every beacon head and windsock
    const headGeo = new THREE.BoxGeometry(1.5, 0.3, 0.34);
    this.heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xeafff0 }), this.beacons.length);
    this.heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const sockGeo = new THREE.ConeGeometry(0.3, 1.3, 6, 1, true).rotateZ(-Math.PI / 2).translate(0.65, 0, 0);
    this.sockMesh = new THREE.InstancedMesh(sockGeo,
      new THREE.MeshLambertMaterial({ color: 0xff7a2a, emissive: 0x2a1200, side: THREE.DoubleSide }), this.socks.length);
    this.sockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.heads, this.sockMesh);
    scene.add(this.group);
    this.update(0, 0);
  }

  update(dt, days) {
    this.beaconAngle += dt * 1.35; // accumulates in any light — the suite's real-loop sentinel
    if (Math.floor(days) !== this.day) { this.day = Math.floor(days); this.windDeg = windFrom(this.day); }
    // sock points downwind, drooping when ATMOS.wind is light (1 calm → 3 storm)
    const target = 1.15 - THREE.MathUtils.clamp((ATMOS.wind - 1) / 2, 0, 1) * 1.05;
    this.droop += (target - this.droop) * Math.min(1, dt * 2);
    const toDeg = (this.windDeg + 180) * D2R;
    const yaw = Math.atan2(Math.cos(toDeg), Math.sin(toDeg));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
    this.heads.visible = ATMOS.night > 0.25;
    if (this.heads.visible) {
      this.beacons.forEach((b, k) => {
        m4.compose(new THREE.Vector3(b.x, b.y, b.z), q.setFromEuler(e.set(0, this.beaconAngle + b.phase, 0)), one);
        this.heads.setMatrixAt(k, m4);
      });
      this.heads.instanceMatrix.needsUpdate = true;
    }
    this.socks.forEach((s, k) => {
      m4.compose(new THREE.Vector3(s.x, s.y, s.z), q.setFromEuler(e.set(0, yaw, -this.droop, 'YZX')), one);
      this.sockMesh.setMatrixAt(k, m4);
    });
    this.sockMesh.instanceMatrix.needsUpdate = true;
  }
}

// --- merged-geometry helpers ---
function quad(arr, a, b, c, d) { // 4 corners, CCW seen from outside
  arr.push(...a, ...b, ...c, ...a, ...c, ...d);
}
function rect(arr, r, u, v, lenU, lenV, y) { // axis-aligned rect in runway r's frame
  const px = -r.dz, pz = r.dx, hu = lenU / 2, hv = lenV / 2;
  const C = (su, sv) => [r.cx + r.dx * (u + su * hu) + px * (v + sv * hv), y, r.cz + r.dz * (u + su * hu) + pz * (v + sv * hv)];
  quad(arr, C(-1, -1), C(-1, 1), C(1, 1), C(1, -1));
}
