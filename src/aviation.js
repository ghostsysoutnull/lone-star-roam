// Aviation wave 2 — departures. The flight schedule is a PURE seeded function
// of the game day (`avn:` stream — new, never touches existing streams); the
// live system materializes flights within radius of the player as instanced
// meshes and lets everything else exist only as math (the chapelAt lesson,
// applied to movers). Slots are departures only: arrivals emerge from another
// field's departed flight reaching its destination, so schedules stay
// consistent statewide and a distant flight is just waypoints + an altitude
// profile. A materialized flight advances by dt (stepper-testable, pausable);
// the parametric scan advances by sky.days — any difference is exactly the
// delay a ground stop or a slow rain taxi accumulated, and it evaporates
// unobserved when the flight dematerializes far away. Runway-in-use comes from
// airports.js windFrom via runwayInUse, so the windsock, the AI and (wave 3)
// ATIS can never disagree. No scene lights: strobes are unlit vertex-colored
// lamps (traffic idiom) gated on ATMOS.
import * as THREE from 'three';
import { seededRand, hAt } from './geo.js';
import { ATMOS } from './sky.js';
import { AIRPORTS, runwayInUse } from './airports.js';
import { merge, tinted } from './traffic.js';

const DAY_S = 720;                      // mirrors sky.js DAY_SECONDS
const SLOTS = [0, 12, 5, 2];            // daytime departures per field by tier
const REDEYE_MAX = 2;                   // tier-1-only night slots, 0..2 seeded
// night in day-fraction u-space: sky.days starts at 9 am (t 0.375), dark runs
// t 0.78–1 and 0–0.22, so u = t − 0.375 (mod 1) makes night one contiguous span
const NIGHT_U0 = 0.405, NIGHT_U1 = 0.845;
const MAT_R = 380;                      // materialize flights within this range
const AIR_FAR = 900, GROUND_FAR = 300;  // dematerialize distances — never in plain sight
export const MAX_AIR = 4;               // hard cap on airborne fixed-wing near the player
const POOL = 6;                         // instances per aircraft type
const TAXI_SPD = 3, HOLD_S = 4, PARK_S = 25, FIX_D = 50;
const SLOPE = 0.13;                     // climb/descent gradient (alt per unit forward)
const CEIL = 125;                       // stay under the cloud deck (sky.js clouds ride y 130–200)
const TYPES = {
  jet: { vr: 30, accel: 24, cruise: 60, band: 85, floor: 100 },  // airliner: tier-1 pairs
  ga: { vr: 14, accel: 10, cruise: 32, band: 45, floor: 60 },    // regional/GA single
};
const TINTS = [0xc23b3b, 0x3b62c2, 0xd8a13b, 0x3f7a3f, 0x5e3b7a, 0x2f6f7a, 0xb05a2a, 0x777d88];
const AIR = new Set(['climb', 'cruise', 'descend', 'final', 'divert']);

// real route pairs, weighted: the Love–Hobby shuttle, DFW spokes, hub feeders,
// GA hops between the strips and their nearest big fields. Generic liveries —
// the pairs are real, the brands are not.
const ROUTES = {
  DFW: [['HOU', 3], ['AUS', 3], ['SAT', 3], ['ELP', 2], ['IAH', 2], ['LBB', 2], ['AMA', 2], ['MAF', 2], ['CRP', 2], ['HRL', 1], ['ABI', 1], ['ACT', 1], ['TYR', 1], ['LRD', 1]],
  DAL: [['HOU', 5], ['AUS', 2], ['SAT', 2], ['ELP', 2], ['LBB', 2], ['MAF', 1], ['AMA', 1], ['HRL', 1]],
  IAH: [['DFW', 3], ['AUS', 2], ['SAT', 2], ['ELP', 2], ['LRD', 1], ['CRP', 1], ['HRL', 1], ['MAF', 1], ['LBB', 1]],
  HOU: [['DAL', 5], ['AUS', 2], ['SAT', 2], ['ELP', 1], ['CRP', 1], ['HRL', 1], ['LBB', 1]],
  AUS: [['DFW', 3], ['DAL', 2], ['IAH', 2], ['HOU', 2], ['ELP', 1], ['LBB', 1]],
  SAT: [['DFW', 3], ['DAL', 2], ['IAH', 2], ['HOU', 2], ['ELP', 1], ['HRL', 1]],
  ELP: [['DFW', 3], ['DAL', 2], ['IAH', 1], ['HOU', 1], ['AUS', 1], ['SAT', 1]],
  LBB: [['DFW', 3], ['DAL', 2], ['HOU', 1], ['AUS', 1]],
  AMA: [['DFW', 3], ['DAL', 2]],
  MAF: [['DFW', 2], ['DAL', 2], ['IAH', 1], ['HOU', 1]],
  CRP: [['DFW', 2], ['IAH', 2], ['HOU', 1], ['DAL', 1]],
  HRL: [['IAH', 2], ['HOU', 2], ['DFW', 1], ['DAL', 1], ['AUS', 1]],
  LRD: [['IAH', 2], ['DFW', 1], ['SAT', 1]],
  ABI: [['DFW', 3], ['DAL', 1]],
  ACT: [['DFW', 3], ['DAL', 1]],
  TYR: [['DFW', 3], ['DAL', 1]],
  MRF: [['ELP', 2], ['MAF', 1], ['TRL', 1]],
  TRL: [['MRF', 2], ['ELP', 1], ['MAF', 1]],
  SSS: [['LBB', 2], ['ABI', 1], ['DAL', 1]],
  ARM: [['CRP', 2], ['HRL', 1], ['SAT', 1]],
};

const byId = Object.fromEntries(AIRPORTS.map((a) => [a.id, a]));

function mkSlot(a, day, k, u, dest, r) {
  const type = a.tier === 1 && byId[dest].tier === 1 ? 'jet' : 'ga';
  return { key: `${a.id}:${day}:${k}`, from: a.id, dest, u, day, type,
    n: 1 + Math.floor(r() * 98), // "Lone Star N" — wave-3 radio reads this
    jit: 0.9 + r() * 0.2, band: r(), tint: TINTS[Math.floor(r() * TINTS.length)] };
}

// one game day's departures for every field — pure and deterministic per
// (airport, day, slot). Stratified slot times keep departures spread and
// sorted; the day window skips the night span so after dark only tier-1
// red-eyes fly and the night sky keeps top billing.
export function daySchedule(day) {
  return AIRPORTS.map((a) => {
    const routes = ROUTES[a.id];
    const total = routes.reduce((s, [, w]) => s + w, 0);
    const pick = (v) => { let x = v * total; for (const [id, w] of routes) { x -= w; if (x <= 0) return id; } return routes[0][0]; };
    const slots = [];
    const n = SLOTS[a.tier], dayW = 1 - (NIGHT_U1 - NIGHT_U0);
    for (let k = 0; k < n; k++) {
      const r = seededRand(`avn:${a.id}:${day}:${k}`);
      const w = dayW * (k + r()) / n;
      slots.push(mkSlot(a, day, k, w < NIGHT_U0 ? w : w + (NIGHT_U1 - NIGHT_U0), pick(r()), r));
    }
    if (a.tier === 1) {
      const r = seededRand(`avn:${a.id}:${day}:redeye`);
      const m = Math.floor(r() * (REDEYE_MAX + 1));
      for (let k = 0; k < m; k++)
        slots.push(mkSlot(a, day, 100 + k, NIGHT_U0 + ((k + r()) / m) * (NIGHT_U1 - NIGHT_U0), pick(r()), r));
    }
    slots.sort((x, y) => x.u - y.u);
    return { id: a.id, slots };
  });
}

// closed-form position/phase at `e` seconds after pushback. The takeoff roll
// is the one accelerating piece (s ∝ t², so measured speed really grows); the
// course leg carries the climb/cruise/descend altitude profile by distance.
function evalFlight(fl, e) {
  const done = e >= fl.dur - 0.01;
  e = Math.min(Math.max(e, 0.001), fl.dur - 0.01);
  let lg = fl.legs[fl.legs.length - 1];
  for (const l of fl.legs) if (e < l.t1) { lg = l; break; }
  let f = (e - lg.t0) / (lg.t1 - lg.t0), ph = lg.ph;
  let speed = Math.hypot(lg.x1 - lg.x0, lg.z1 - lg.z0) / (lg.t1 - lg.t0);
  let y = lg.y0 + (lg.y1 - lg.y0) * f;
  if (lg.ph === 'roll') { f = f * f; speed = fl.T.accel * (e - lg.t0); }
  else if (lg.ph === 'rollout') speed = fl.T.vr * 1.15 + (TAXI_SPD - fl.T.vr * 1.15) * f;
  else if (lg.pr) {
    const s = f * lg.pr.len;
    y = s < lg.pr.climbD ? lg.pr.c0Y + s * SLOPE
      : s > lg.pr.len - lg.pr.descD ? lg.pr.fY + (lg.pr.len - s) * SLOPE
      : lg.pr.cY;
    ph = s < lg.pr.climbD ? 'climb' : s > lg.pr.len - lg.pr.descD ? 'descend' : 'cruise';
  }
  return { x: lg.x0 + (lg.x1 - lg.x0) * f, z: lg.z0 + (lg.z1 - lg.z0) * f, y,
    hx: lg.hx, hz: lg.hz, speed, ph: done ? 'done' : ph };
}

// --- aircraft (face -z, origin at the wheels; near-white bodywork washes the
// instance tint to pastel, the pure-white fin takes it fully — semi-trailer trick)
const W = 0xf2f0ea, GLASS = 0x8fa8bc, DARK = 0x2a2a30;
const strut = (x, z, h) => tinted(new THREE.BoxGeometry(0.09, h, 0.09).translate(x, h / 2, z), DARK);
function mkJet() {
  return merge([
    tinted(new THREE.CylinderGeometry(0.42, 0.42, 5.2, 10).rotateX(Math.PI / 2).translate(0, 1.0, 0.1), W),
    tinted(new THREE.SphereGeometry(0.42, 8, 6).translate(0, 1.0, -2.5), W),
    tinted(new THREE.BoxGeometry(6.2, 0.1, 1.6).translate(0, 0.9, 0.5), W),        // wing
    tinted(new THREE.BoxGeometry(2.4, 0.08, 0.9).translate(0, 1.8, 2.6), W),       // tailplane
    tinted(new THREE.BoxGeometry(0.09, 1.2, 1.0).translate(0, 1.75, 2.8), 0xffffff), // fin — full tint
    tinted(new THREE.CylinderGeometry(0.18, 0.18, 0.8, 8).rotateX(Math.PI / 2).translate(-1.5, 0.6, 0.15), DARK),
    tinted(new THREE.CylinderGeometry(0.18, 0.18, 0.8, 8).rotateX(Math.PI / 2).translate(1.5, 0.6, 0.15), DARK),
    strut(0, -2.0, 0.6), strut(-0.7, 0.6, 0.5), strut(0.7, 0.6, 0.5),
  ]);
}
function mkGa() {
  return merge([
    tinted(new THREE.BoxGeometry(0.5, 0.55, 2.7).translate(0, 0.75, 0.1), W),
    tinted(new THREE.BoxGeometry(0.46, 0.3, 0.8).translate(0, 1.05, -0.5), GLASS),
    tinted(new THREE.BoxGeometry(3.2, 0.08, 0.75).translate(0, 1.06, -0.35), W),   // high wing
    tinted(new THREE.BoxGeometry(1.2, 0.06, 0.4).translate(0, 0.8, 1.35), W),
    tinted(new THREE.BoxGeometry(0.06, 0.65, 0.5).translate(0, 1.05, 1.35), 0xffffff), // fin — full tint
    tinted(new THREE.BoxGeometry(0.95, 0.09, 0.07).translate(0, 0.75, -1.48), DARK),  // prop
    strut(-0.35, -0.2, 0.48), strut(0.35, -0.2, 0.48), strut(0, 1.1, 0.4),
  ]);
}
const mkLamps = (wx, wy, wz, ty, tz, s) => merge([
  tinted(new THREE.BoxGeometry(s, s, s).translate(-wx, wy, wz), 0xff2020),  // port red
  tinted(new THREE.BoxGeometry(s, s, s).translate(wx, wy, wz), 0x20d050),   // starboard green
  tinted(new THREE.BoxGeometry(s, s, s).translate(0, ty, tz), 0xffffff),    // tail white
]);

export class AviationSystem {
  constructor(scene, airports) {
    this.layoutById = Object.fromEntries(airports.layout.map((L) => [L.id, L]));
    this.flights = [];        // materialized views of the schedule (+ forced ones)
    this.spent = new Set();   // slot keys that finished or diverted
    this.cache = new Map();   // slot key → built trajectory
    this.sched = new Map();   // day → daySchedule(day)
    this.scanT = 0;
    this.simT = 0;            // accumulates in the real loop — wiring sentinel
    this.day = 0;
    this.seq = 0;
    this.px = 0; this.pz = 0;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.meshes = { jet: new THREE.InstancedMesh(mkJet(), mat, POOL), ga: new THREE.InstancedMesh(mkGa(), mat, POOL) };
    this.lamps = { jet: new THREE.InstancedMesh(mkLamps(3.1, 0.9, 0.5, 2.4, 2.8, 0.16), lampMat, POOL),
      ga: new THREE.InstancedMesh(mkLamps(1.6, 1.06, -0.35, 1.42, 1.35, 0.12), lampMat, POOL) };
    for (const k of ['jet', 'ga']) {
      this.meshes[k].frustumCulled = false;
      this.lamps[k].frustumCulled = false;
      scene.add(this.meshes[k], this.lamps[k]);
    }
    // contrail puffs (vehicle.js pool idiom; shared geometry, never disposed)
    const pg = new THREE.SphereGeometry(0.16, 5, 4);
    this.puffs = Array.from({ length: 20 }, () => {
      const m = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      return { m, age: 1, life: 1 };
    });
    this.m4 = new THREE.Matrix4();
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.q = new THREE.Quaternion();
    this.eu = new THREE.Euler();
    this.col = new THREE.Color();
    this.one = new THREE.Vector3(1, 1, 1);
  }

  schedule(day) {
    let s = this.sched.get(day);
    if (!s) this.sched.set(day, (s = daySchedule(day)));
    return s;
  }

  build(sl) {
    let fl = this.cache.get(sl.key);
    if (!fl) this.cache.set(sl.key, (fl = this.buildRaw(sl)));
    return fl;
  }

  // trajectory: gate → hold-short abeam the in-use threshold → roll → straight
  // climb-out → profiled course leg to the destination's approach fix → final
  // → rollout → taxi to the gate → park. Pure given the slot (runwayInUse +
  // hAt are deterministic), so a rematerialized flight is where it should be.
  buildRaw(sl) {
    const o = byId[sl.from], d = byId[sl.dest], T = TYPES[sl.type];
    const yo = this.layoutById[sl.from].padY + 0.14, yd = this.layoutById[sl.dest].padY + 0.14;
    const uo = runwayInUse(o, sl.day), ud = runwayInUse(d, sl.day);
    const spd = T.cruise * sl.jit;
    const legs = [];
    let tt = 0;
    const leg = (x0, z0, x1, z1, y0, y1, dur, ph, ex) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      legs.push({ x0, z0, x1, z1, y0, y1, t0: tt, t1: (tt += Math.max(dur, 0.01)), ph,
        hx: len > 0.01 ? (x1 - x0) / len : (ex?.hx ?? uo.dx),
        hz: len > 0.01 ? (z1 - z0) / len : (ex?.hz ?? uo.dz), ...ex });
    };
    const side = Math.sign((o.gate[0] - uo.tx) * -uo.dz + (o.gate[1] - uo.tz) * uo.dx) || 1;
    const hx2 = uo.tx - uo.dz * (uo.r.w / 2 + 1.8) * side, hz2 = uo.tz + uo.dx * (uo.r.w / 2 + 1.8) * side;
    leg(o.gate[0], o.gate[1], hx2, hz2, yo, yo, Math.hypot(hx2 - o.gate[0], hz2 - o.gate[1]) / TAXI_SPD, 'taxi');
    leg(hx2, hz2, uo.tx, uo.tz, yo, yo, Math.hypot(uo.tx - hx2, uo.tz - hz2) / TAXI_SPD, 'taxi');
    leg(uo.tx, uo.tz, uo.tx, uo.tz, yo, yo, HOLD_S, 'hold');
    const rollLen = (T.vr * T.vr) / (2 * T.accel);
    const lx = uo.tx + uo.dx * rollLen, lz = uo.tz + uo.dz * rollLen;
    leg(uo.tx, uo.tz, lx, lz, yo, yo, T.vr / T.accel, 'roll');
    const c0x = lx + uo.dx * 60, c0z = lz + uo.dz * 60, c0Y = yo + 25;
    leg(lx, lz, c0x, c0z, yo, c0Y, 60 / (T.vr + 12), 'climb');
    const fx = ud.tx - ud.dx * FIX_D, fz = ud.tz - ud.dz * FIX_D, fY = yd + 10;
    const len = Math.hypot(fx - c0x, fz - c0z);
    let cY = Math.min(CEIL, Math.max(T.floor, Math.max(yo, yd) + T.band + sl.band * 20));
    for (let i = 0; i <= 8; i++) // one-time terrain scan (hAt is deterministic)
      cY = Math.max(cY, hAt(c0x + ((fx - c0x) * i) / 8, c0z + ((fz - c0z) * i) / 8) + 25);
    cY = Math.min(cY, CEIL + 6, (0.75 * len * SLOPE + c0Y + fY) / 2); // fit short hops
    cY = Math.max(cY, Math.max(c0Y, fY) + 6);
    const pr = { c0Y, cY, fY, climbD: (cY - c0Y) / SLOPE, descD: (cY - fY) / SLOPE, len };
    leg(c0x, c0z, fx, fz, c0Y, fY, len / spd, 'cruise', { pr });
    const tdx = ud.tx + ud.dx * ud.r.hl * 0.24, tdz = ud.tz + ud.dz * ud.r.hl * 0.24;
    leg(fx, fz, tdx, tdz, fY, yd, Math.hypot(tdx - fx, tdz - fz) / (T.vr * 1.15), 'final');
    const spx = ud.tx + ud.dx * ud.r.hl * 1.2, spz = ud.tz + ud.dz * ud.r.hl * 1.2;
    leg(tdx, tdz, spx, spz, yd, yd, Math.hypot(spx - tdx, spz - tdz) / ((T.vr * 1.15 + TAXI_SPD) / 2), 'rollout');
    leg(spx, spz, d.gate[0], d.gate[1], yd, yd, Math.hypot(d.gate[0] - spx, d.gate[1] - spz) / TAXI_SPD, 'taxiin');
    leg(d.gate[0], d.gate[1], d.gate[0], d.gate[1], yd, yd, PARK_S, 'park', { hx: ud.dx, hz: ud.dz });
    return { sl, T, legs, dur: tt };
  }

  // debug/test hook: immediate departure from (or arrival into) a field —
  // bypasses the schedule, still respects the airborne cap
  force(kind, aptId) {
    let apt = byId[aptId];
    if (!apt) {
      let bd = 1e9;
      for (const a of AIRPORTS) {
        const d = Math.hypot(a.at[0] - this.px, a.at[1] - this.pz);
        if (d < bd) { bd = d; apt = a; }
      }
      if (bd > MAT_R) return null;
    }
    const routes = ROUTES[apt.id];
    const [pid] = routes[(Math.random() * routes.length) | 0];
    const from = kind === 'arrival' ? pid : apt.id, dest = kind === 'arrival' ? apt.id : pid;
    const sl = { key: 'F:' + this.seq++, from, dest, u: 0, day: this.day,
      type: byId[from].tier === 1 && byId[dest].tier === 1 ? 'jet' : 'ga',
      n: 1 + ((Math.random() * 98) | 0), jit: 0.9 + Math.random() * 0.2, band: Math.random(),
      tint: TINTS[(Math.random() * TINTS.length) | 0] };
    const fl = this.buildRaw(sl);
    let age = 0.001;
    if (kind === 'arrival') {
      if (this.flights.filter((m) => AIR.has(m.st.ph)).length >= MAX_AIR) return null;
      const lg = fl.legs.find((l) => l.pr);
      const s = Math.max(lg.pr.len - lg.pr.descD * 0.55, lg.pr.len * 0.5);
      age = lg.t0 + (s / lg.pr.len) * (lg.t1 - lg.t0);
    }
    const m = { sl, fl, age, st: evalFlight(fl, age), yaw: null, vy: 0, puffT: 0 };
    this.flights.push(m);
    return m;
  }

  despawnAll() { this.flights.length = 0; }

  // shared with military.js so its two flavor pairs never push the sky past
  // MAX_AIR total — mirrors HeliSystem.airborneCount()
  airborneCount() { return this.flights.filter((m) => AIR.has(m.st.ph)).length; }

  // go-around: the flight climbs out live and recycles in the murk. Storm
  // weather triggers this above (update); wave-3 tower radio triggers it too,
  // when the player is parked on the runway a flight is inbound to.
  divert(m) {
    const st = m.st;
    const s = Math.max(st.speed, m.fl.T.cruise * 0.8);
    m.divert = { x: st.x, z: st.z, y: st.y, vx: st.hx * s, vz: st.hz * s, hx: st.hx, hz: st.hz };
    this.spent.add(m.sl.key);
  }

  update(dt, px, pz, days) {
    this.simT += dt;
    this.px = px; this.pz = pz;
    const day = Math.floor(days);
    if (day !== this.day) {
      this.day = day;
      for (const k of this.spent) { const p = k.split(':'); if (p[0] !== 'F' && +p[1] < day - 1) this.spent.delete(k); }
      for (const k of [...this.sched.keys()]) if (k < day - 1) this.sched.delete(k);
      for (const [k, v] of [...this.cache]) if (v.sl.day < day - 1) this.cache.delete(k);
    }
    const stop = ATMOS.weather === 'storm' || ATMOS.weather === 'dust';
    const slow = (ATMOS.rain || 0) > 0.15 ? 0.6 : 1;

    for (const m of this.flights) {
      if (m.divert) { // weather go-around: climb out live, recycle in the murk
        m.divert.y = Math.min(m.divert.y + 6 * dt, CEIL);
        m.divert.x += m.divert.vx * dt;
        m.divert.z += m.divert.vz * dt;
        m.st = { x: m.divert.x, z: m.divert.z, y: m.divert.y, hx: m.divert.hx, hz: m.divert.hz,
          speed: Math.hypot(m.divert.vx, m.divert.vz), ph: 'divert' };
        continue;
      }
      const st = (m.st = evalFlight(m.fl, m.age));
      const held = st.ph === 'taxi' || st.ph === 'hold' || st.ph === 'park';
      if (stop && held) continue; // ground stop: age freezes, delay accumulates
      if (stop && (st.ph === 'descend' || st.ph === 'final')
        && Math.hypot(st.x - byId[m.sl.dest].at[0], st.z - byId[m.sl.dest].at[1]) < 320) {
        this.divert(m);
        continue;
      }
      m.age += dt * (st.ph === 'taxi' || st.ph === 'taxiin' ? slow : 1);
    }

    this.flights = this.flights.filter((m) => {
      const dd = Math.hypot(m.st.x - px, m.st.z - pz);
      if (m.st.ph === 'done') { // parked & finished: retire only unwatched (trains idiom)
        if (dd > GROUND_FAR) { this.spent.add(m.sl.key); return false; }
        return true;
      }
      return dd <= (AIR.has(m.st.ph) ? AIR_FAR : GROUND_FAR); // far only; the schedule flies on
    });

    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 1.2;
      const T = days * DAY_S;
      let air = this.flights.filter((m) => AIR.has(m.st.ph)).length;
      for (const dy of [day - 1, day]) {
        if (dy < 0) continue;
        for (const ap of this.schedule(dy)) {
          for (const sl of ap.slots) {
            if (this.spent.has(sl.key) || this.flights.some((m) => m.sl.key === sl.key)) continue;
            const e = T - (dy + sl.u) * DAY_S;
            if (e < 0) continue;
            const fl = this.build(sl);
            if (e >= fl.dur) { this.spent.add(sl.key); continue; }
            const st = evalFlight(fl, e);
            if ((st.x - px) ** 2 + (st.z - pz) ** 2 > MAT_R * MAT_R) continue;
            if (AIR.has(st.ph)) { if (air >= MAX_AIR) continue; air++; }
            this.flights.push({ sl, fl, age: e, st, yaw: null, vy: 0, puffT: 0 });
          }
        }
      }
    }
    this.render(dt);
  }

  render(dt) {
    const counts = { jet: 0, ga: 0 };
    const lampsOn = ATMOS.night > 0.45 || (ATMOS.rain || 0) > 0.15;
    let li = 0;
    for (const m of this.flights) {
      const st = m.st, i = counts[m.sl.type]++;
      if (i >= POOL) continue;
      const tyaw = Math.atan2(-st.hx, -st.hz);
      if (m.yaw == null) m.yaw = tyaw;
      const dy = ((tyaw - m.yaw) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
      m.yaw += Math.max(-1.4 * dt, Math.min(1.4 * dt, dy)); // visual-only heading ease
      const vy = (st.y - (m.prevY ?? st.y)) / Math.max(dt, 0.001);
      m.prevY = st.y;
      m.vy += (vy - m.vy) * Math.min(1, dt * 4);
      const pitch = THREE.MathUtils.clamp(-m.vy * 0.035, -0.32, 0.32);
      this.m4.compose(new THREE.Vector3(st.x, st.y, st.z),
        this.q.setFromEuler(this.eu.set(pitch, m.yaw, 0, 'YXZ')), this.one);
      this.meshes[m.sl.type].setMatrixAt(i, this.m4);
      this.meshes[m.sl.type].setColorAt(i, this.col.set(m.sl.tint));
      const blink = lampsOn && (this.simT * 1.3 + li++ * 0.41) % 1 < 0.5;
      this.lamps[m.sl.type].setMatrixAt(i, blink ? this.m4 : this.zero);
      if (m.sl.type === 'jet' && st.ph === 'cruise' && st.y > 60 && (m.puffT -= dt) <= 0) {
        m.puffT = 0.22;
        this.puff(st.x - st.hx * 3.2, st.y + 0.9, st.z - st.hz * 3.2);
      }
    }
    for (const k of ['jet', 'ga']) {
      for (let j = Math.min(counts[k], POOL); j < POOL; j++) {
        this.meshes[k].setMatrixAt(j, this.zero);
        this.lamps[k].setMatrixAt(j, this.zero);
      }
      this.meshes[k].instanceMatrix.needsUpdate = true;
      this.lamps[k].instanceMatrix.needsUpdate = true;
      if (this.meshes[k].instanceColor) this.meshes[k].instanceColor.needsUpdate = true;
    }
    for (const p of this.puffs) {
      if (p.age >= p.life) { p.m.visible = false; continue; }
      p.age += dt;
      p.m.position.y += dt * 0.25;
      const f = p.age / p.life;
      p.m.material.opacity = 0.5 * (1 - f);
      p.m.scale.setScalar(2.4 * (0.7 + f));
    }
  }

  puff(x, y, z) {
    const p = this.puffs.find((p) => p.age >= p.life);
    if (!p) return;
    p.age = 0;
    p.life = 1.6;
    p.m.visible = true;
    p.m.position.set(x, y, z);
  }
}
