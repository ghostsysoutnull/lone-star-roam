// Aviation wave 4 — rotors & airships. Two small movers layered onto the
// fixed-wing world: helicopters placed by real-world context (not a species
// table) and exactly one blimp. Both follow the chapelAt/aviation lesson —
// pure math first, meshes second — so the verify suite can assert numbers
// (orbit radius, cap counts, gain-by-distance, day-seeded position) instead
// of pixels. Helicopters share the aviation cap idiom: airborne only counts
// while actually flying (parked-on-the-pad instances render but don't spend
// the budget), and the Army pair is gated as ONE two-instance unit so it can
// never coexist with anything else at the ≤2 rotorcraft ceiling.
import * as THREE from 'three';
import { GEO, hAt, seededRand } from './geo.js';
import { ATMOS } from './sky.js';
import { merge, tinted } from './traffic.js';

const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];

// ---------------------------------------------------------------- helicopters
const CAP = 2;              // hard cap on airborne rotorcraft near the player (AVIATION.md)
const MAT_R = 450;          // materialize distance
const AIR_FAR = 900;        // far despawn for an in-progress flight (aviation.js idiom) — frees the cap slot
// real top-4 Texas metros by population (Houston/San Antonio/Dallas/Austin;
// Fort Worth is 5th and not close enough to edge out Austin)
const BIG_FOUR = ['Houston', 'San Antonio', 'Dallas', 'Austin'];
const KILLEEN = LL(31.1379, -97.7048); // Fort Cavazos
const NEWS_R = 40, NEWS_ALT = 55, NEWS_OMEGA = (2 * Math.PI) / 40; // one lap ~40s; NEWS_ALT is AGL over the downtown center
const CG_ALT = 30, CG_SPD = 5; // CG_ALT is AGL over the current lane point
const TINT = { medical: 0xd8203a, news: 0x2a5ea8, coastguard: 0xd88a1a, army: 0x4a5a30 };
const UP = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);

// Per-kind detail pass (HELICOPTER_SPEC.md): each kind gets its own body
// geometry + rotor blade count/diameter instead of one shared chassis +
// tint. BODY_POOL matches mkCandidates()'s natural per-kind instance count
// (army renders 2 body instances per 1 weight-2 candidate — see render()).
// ROTOR_POOL is body count × blade count since each blade is now its own
// InstancedMesh instance (so "how many rotor instances rendered" is a real,
// countable proxy for blade count — see rotorCount below).
const KINDS = ['medical', 'news', 'coastguard', 'army'];
const HELI_CONFIG = {
  medical: { blades: 2, rotorR: 1.7 },   // standard diameter
  news: { blades: 2, rotorR: 1.4 },      // lightest airframe, smallest disc
  coastguard: { blades: 2, rotorR: 1.9 }, // medium diameter
  army: { blades: 4, rotorR: 2.3 },      // 4-blade cross, largest — the at-a-distance tell
};
const BODY_POOL = { medical: 4, news: 4, coastguard: 1, army: 2 };
const ROTOR_POOL = Object.fromEntries(KINDS.map((k) => [k, BODY_POOL[k] * HELI_CONFIG[k].blades]));

const W = 0xf2f0ea, GLASS = 0x8fa8bc, DARK = 0x2a2a30, RED = 0xcc2222;

function mkMedicalBody() {
  // Airbus H135 / Bell 407 ref: tapered nose cone, red-cross panel, short hoist arm.
  return merge([
    tinted(new THREE.BoxGeometry(0.95, 0.85, 1.6).translate(0, 0.7, 0.1), W),
    tinted(new THREE.ConeGeometry(0.48, 0.9, 8).rotateX(Math.PI / 2).translate(0, 0.72, -0.95), W),
    tinted(new THREE.BoxGeometry(0.7, 0.55, 0.6).translate(0, 0.85, -0.55), GLASS),
    tinted(new THREE.CylinderGeometry(0.16, 0.1, 2.1, 8).rotateX(Math.PI / 2).translate(0, 0.6, 1.55), W),
    tinted(new THREE.BoxGeometry(0.05, 0.5, 0.42).translate(0, 0.95, 2.55), 0xffffff), // fin — full tint (livery)
    tinted(new THREE.BoxGeometry(0.04, 0.04, 0.42).translate(0.24, 0.8, 2.5), DARK),   // tail rotor
    tinted(new THREE.CylinderGeometry(0.05, 0.06, 0.55, 8).translate(-0.32, 0.18, 0.5), DARK),
    tinted(new THREE.CylinderGeometry(0.05, 0.06, 0.55, 8).translate(0.32, 0.18, 0.5), DARK),
    tinted(new THREE.BoxGeometry(0.75, 0.05, 0.1).translate(0, 0.14, 0.5), DARK),
    tinted(new THREE.BoxGeometry(0.5, 0.28, 0.02).translate(0.48, 0.7, 0.15), RED),   // cross panel, bar 1
    tinted(new THREE.BoxGeometry(0.16, 0.5, 0.02).translate(0.48, 0.7, 0.15), RED),   // cross panel, bar 2
    tinted(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6).rotateZ(Math.PI / 2).translate(0, 1.15, -0.2), DARK), // hoist arm
  ]);
}

function mkNewsBody() {
  // Smallest/lightest of the four; nose camera ball is the signature tell.
  return merge([
    tinted(new THREE.BoxGeometry(0.8, 0.7, 1.5).translate(0, 0.65, 0.1), W),
    tinted(new THREE.BoxGeometry(0.6, 0.5, 0.55).translate(0, 0.8, -0.5), GLASS),
    tinted(new THREE.CylinderGeometry(0.14, 0.09, 1.9, 8).rotateX(Math.PI / 2).translate(0, 0.55, 1.4), W),
    tinted(new THREE.BoxGeometry(0.04, 0.32, 0.3).translate(0, 0.85, 2.3), 0xffffff), // simplified fin
    tinted(new THREE.BoxGeometry(0.03, 0.03, 0.3).translate(0.2, 0.72, 2.28), DARK),  // tail rotor
    tinted(new THREE.CylinderGeometry(0.045, 0.055, 0.5, 8).translate(-0.28, 0.16, 0.45), DARK),
    tinted(new THREE.CylinderGeometry(0.045, 0.055, 0.5, 8).translate(0.28, 0.16, 0.45), DARK),
    tinted(new THREE.BoxGeometry(0.65, 0.05, 0.1).translate(0, 0.12, 0.45), DARK),
    tinted(new THREE.SphereGeometry(0.13, 8, 6).translate(0, 0.55, -1.15), DARK),      // camera ball
    tinted(new THREE.CylinderGeometry(0.03, 0.03, 0.25, 6).translate(0, 0.68, -1.05), DARK), // camera mount
  ]);
}

function mkCoastGuardBody() {
  // MH-65 Dolphin ref: bigger cabin, hemisphere nose, rescue hoist boom + basket.
  return merge([
    tinted(new THREE.BoxGeometry(1.1, 0.95, 1.85).translate(0, 0.75, 0.15), W),
    tinted(new THREE.SphereGeometry(0.55, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).translate(0, 0.75, -0.9), W), // hemisphere nose
    tinted(new THREE.BoxGeometry(0.85, 0.62, 0.7).translate(0, 0.92, -0.4), GLASS),
    tinted(new THREE.CylinderGeometry(0.18, 0.11, 2.3, 8).rotateX(Math.PI / 2).translate(0, 0.65, 1.7), W),
    tinted(new THREE.BoxGeometry(0.05, 0.55, 0.46).translate(0, 1.0, 2.8), 0xffffff), // fin
    tinted(new THREE.BoxGeometry(0.04, 0.04, 0.46).translate(0.26, 0.85, 2.75), DARK), // tail rotor
    tinted(new THREE.CylinderGeometry(0.06, 0.07, 0.6, 8).translate(-0.36, 0.2, 0.55), DARK),
    tinted(new THREE.CylinderGeometry(0.06, 0.07, 0.6, 8).translate(0.36, 0.2, 0.55), DARK),
    tinted(new THREE.BoxGeometry(0.85, 0.05, 0.1).translate(0, 0.15, 0.55), DARK),
    tinted(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6).rotateZ(Math.PI / 2).translate(0.65, 0.85, 0.2), DARK), // hoist boom
    tinted(new THREE.BoxGeometry(0.18, 0.22, 0.18).translate(0.9, 0.55, 0.2), DARK),   // hoist basket
  ]);
}

function mkArmyBody() {
  // UH-60 ref: boxiest/largest cabin, stub-wing fuel tanks, portholes (no glass canopy), tail wheel.
  return merge([
    tinted(new THREE.BoxGeometry(1.15, 0.95, 1.9).translate(0, 0.72, 0.1), W),
    tinted(new THREE.CylinderGeometry(0.1, 0.1, 0.35, 8).rotateZ(Math.PI / 2).translate(-0.45, 0.9, -0.45), DARK), // porthole L
    tinted(new THREE.CylinderGeometry(0.1, 0.1, 0.35, 8).rotateZ(Math.PI / 2).translate(0.45, 0.9, -0.45), DARK),  // porthole R
    tinted(new THREE.CylinderGeometry(0.2, 0.13, 2.2, 8).rotateX(Math.PI / 2).translate(0, 0.62, 1.65), W),
    tinted(new THREE.BoxGeometry(0.06, 0.6, 0.5).translate(0, 1.0, 2.7), 0xffffff), // fin
    tinted(new THREE.BoxGeometry(0.05, 0.05, 0.5).translate(0.28, 0.85, 2.65), DARK), // tail rotor
    tinted(new THREE.CylinderGeometry(0.06, 0.07, 0.6, 8).translate(-0.38, 0.2, 0.5), DARK),
    tinted(new THREE.CylinderGeometry(0.06, 0.07, 0.6, 8).translate(0.38, 0.2, 0.5), DARK),
    tinted(new THREE.BoxGeometry(0.9, 0.05, 0.1).translate(0, 0.15, 0.5), DARK),
    tinted(new THREE.BoxGeometry(0.1, 0.35, 0.35).translate(-0.7, 0.55, 0), DARK),   // wing stub L
    tinted(new THREE.BoxGeometry(0.32, 0.28, 0.7).translate(-0.85, 0.5, 0), DARK),   // fuel tank L
    tinted(new THREE.BoxGeometry(0.1, 0.35, 0.35).translate(0.7, 0.55, 0), DARK),    // wing stub R
    tinted(new THREE.BoxGeometry(0.32, 0.28, 0.7).translate(0.85, 0.5, 0), DARK),    // fuel tank R
    tinted(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 8).rotateZ(Math.PI / 2).translate(0, 0.1, 2.9), DARK), // tail wheel
  ]);
}

const BODY_GEO = { medical: mkMedicalBody, news: mkNewsBody, coastguard: mkCoastGuardBody, army: mkArmyBody };

// A single hub-to-tip blade, shared per kind at that kind's rotorR. Rendered
// as `blades` separate instances spaced evenly around the hub — so "how many
// rotor instances are live" is a real per-kind count (army 4, others 2), not
// baked into one merged disc.
function mkHeliRotorBlade(radius) {
  return tinted(new THREE.BoxGeometry(radius, 0.03, 0.14).translate(radius / 2, 0, 0), 0x303030);
}

function advanceMedical(c, dt) {
  if (!c.flying) {
    c.x = c.baseX; c.z = c.baseZ; c.y = hAt(c.baseX, c.baseZ) + 0.05; c.heading = 0;
    return;
  }
  c.flightT += dt;
  const DUR = 18, f = Math.min(1, c.flightT / DUR), out = f < 0.5 ? f * 2 : (1 - f) * 2;
  c.x = c.baseX + Math.cos(c.bearing) * 40 * out;
  c.z = c.baseZ + Math.sin(c.bearing) * 40 * out;
  c.y = hAt(c.baseX, c.baseZ) + 4 + 14 * Math.sin(Math.PI * Math.min(1, f * 1.2));
  c.heading = c.bearing + (f < 0.5 ? 0 : Math.PI);
  if (f >= 1) { c.flying = false; c.flightT = 0; }
}

function advanceArmy(c, dt) {
  if (!c.flying) {
    c.x = c.baseX; c.z = c.baseZ; c.y = hAt(c.baseX, c.baseZ) + 0.05; c.heading = 0;
    return;
  }
  c.flightT += dt;
  const DUR = 25, f = Math.min(1, c.flightT / DUR), ang = c.flightT * 0.3, R = 25;
  c.x = c.baseX + Math.cos(ang) * R;
  c.z = c.baseZ + Math.sin(ang) * R;
  c.y = hAt(c.baseX, c.baseZ) + 12;
  c.heading = ang + Math.PI / 2;
  if (f >= 1) { c.flying = false; c.flightT = 0; }
}

function advanceNews(c, dt) {
  c.angle += dt * NEWS_OMEGA;
  c.x = c.baseX + Math.cos(c.angle) * NEWS_R;
  c.z = c.baseZ + Math.sin(c.angle) * NEWS_R;
  c.y = hAt(c.baseX, c.baseZ) + NEWS_ALT;
  c.heading = c.angle + Math.PI / 2;
}

function advanceCoastGuard(c, dt, maritime) {
  if (c.hoverT > 0) { c.hoverT -= dt; return; }
  c.s += dt * CG_SPD;
  const [lx, lz, dx, dz] = maritime.laneAt(c.s);
  c.x = lx; c.z = lz; c.y = hAt(lx, lz) + CG_ALT; c.heading = Math.atan2(-dx, -dz);
  let nd = Infinity;
  for (const s of maritime.ships) nd = Math.min(nd, Math.hypot(s.g.position.x - c.x, s.g.position.z - c.z));
  if (nd < 60 && Math.random() < 0.01) c.hoverT = 8 + Math.random() * 6;
}

export class HeliSystem {
  constructor(scene, maritime) {
    this.maritime = maritime;
    this.candidates = mkCandidates(maritime);
    this.t = 0;
    this.simT = 0; // accumulates in the real loop — wiring sentinel
    this.meshes = {};
    this.rotorCount = {};
    for (const kind of KINDS) {
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
      const rotorMat = new THREE.MeshBasicMaterial({ vertexColors: true });
      const body = new THREE.InstancedMesh(BODY_GEO[kind](), mat, BODY_POOL[kind]);
      const rotor = new THREE.InstancedMesh(mkHeliRotorBlade(HELI_CONFIG[kind].rotorR), rotorMat, ROTOR_POOL[kind]);
      body.frustumCulled = false;
      rotor.frustumCulled = false;
      scene.add(body, rotor);
      this.meshes[kind] = { body, rotor };
      this.rotorCount[kind] = 0;
    }
    this.m4 = new THREE.Matrix4();
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.q = new THREE.Quaternion();
    this.col = new THREE.Color();
  }

  // debug/test hook: force a parked candidate of `kind` airborne right now,
  // respecting the cap — mirrors aviation.force(). Returns success.
  force(kind) {
    const c = this.candidates.find((x) => x.kind === kind && !x.flying);
    if (!c) return false;
    const w = c.weight ?? 1;
    let used = 0;
    for (const o of this.candidates) if (o.flying) used += o.weight ?? 1;
    if (used + w > CAP) return false;
    c.flying = true; c.flightT = 0; c.active = true;
    return true;
  }

  despawnAll() { for (const c of this.candidates) { c.flying = false; c.active = false; } }

  airborneCount() { return this.candidates.reduce((s, c) => s + (c.flying ? (c.weight ?? 1) : 0), 0); }

  nearestAirborneDist(px, pz) {
    let best = Infinity;
    for (const c of this.candidates) if (c.flying) best = Math.min(best, Math.hypot(c.x - px, c.z - pz));
    return best;
  }

  update(dt, px, pz) {
    this.t += dt;
    this.simT += dt;

    // a flight keeps updating past MAT_R so a local hop completes instead of
    // freezing mid-air, but continuous kinds (news/coastguard) have no
    // natural end — without a far despawn they'd fly on invisibly forever,
    // permanently spending a cap slot after the player drives away (aviation's
    // AIR_FAR idiom, applied here)
    for (const c of this.candidates) {
      const d = Math.hypot(c.baseX - px, c.baseZ - pz);
      c.inRange = c.flying ? d < AIR_FAR : d < MAT_R;
    }

    let used = 0;
    for (const c of this.candidates) if (c.flying) used += c.weight ?? 1;

    for (const c of this.candidates) {
      if (!c.inRange) { c.active = false; c.flying = false; continue; }

      if (c.kind === 'news') {
        if (ATMOS.night > 0.4) { c.active = false; c.flying = false; continue; }
        if (!c.flying) {
          if (used + 1 > CAP) { c.active = false; continue; }
          c.flying = true; used += 1;
        }
        advanceNews(c, dt);
        c.active = true;
        continue;
      }

      if (c.kind === 'coastguard') {
        if (!c.flying) {
          if (used + 1 > CAP) { c.active = false; continue; }
          c.flying = true; used += 1;
        }
        advanceCoastGuard(c, dt, this.maritime);
        c.active = true;
        continue;
      }

      const weight = c.weight ?? 1;
      if (!c.flying) {
        c.runT -= dt;
        if (c.runT <= 0) {
          c.runT = c.kind === 'medical' ? 45 + Math.random() * 60 : 40 + Math.random() * 50;
          const odds = c.kind === 'medical' ? 0.35 : 0.4;
          if (Math.random() < odds && used + weight <= CAP) { c.flying = true; c.flightT = 0; used += weight; }
        }
      }
      if (c.kind === 'medical') advanceMedical(c, dt); else advanceArmy(c, dt);
      c.active = true;
    }

    this.render();
  }

  render() {
    const lists = { medical: [], news: [], coastguard: [], army: [] };
    for (const c of this.candidates) {
      if (!c.active) continue;
      if (c.kind === 'army') {
        const perp = c.heading + Math.PI / 2, ox = Math.cos(perp) * 8, oz = Math.sin(perp) * 8;
        lists.army.push({ x: c.x - ox, y: c.y, z: c.z - oz, heading: c.heading });
        lists.army.push({ x: c.x + ox, y: c.y, z: c.z + oz, heading: c.heading });
      } else lists[c.kind].push({ x: c.x, y: c.y, z: c.z, heading: c.heading });
    }
    for (const kind of KINDS) {
      const { body, rotor } = this.meshes[kind];
      const list = lists[kind], blades = HELI_CONFIG[kind].blades, tint = TINT[kind];
      let bi = 0, ri = 0;
      for (; bi < list.length && bi < BODY_POOL[kind]; bi++) {
        const it = list[bi];
        this.m4.compose(new THREE.Vector3(it.x, it.y, it.z), this.q.setFromAxisAngle(UP, it.heading), ONE);
        body.setMatrixAt(bi, this.m4);
        body.setColorAt(bi, this.col.set(tint));
        for (let b = 0; b < blades && ri < ROTOR_POOL[kind]; b++, ri++) {
          const bladeAng = this.t * 22 + (2 * Math.PI * b) / blades;
          this.m4.compose(new THREE.Vector3(it.x, it.y + 0.42, it.z), this.q.setFromAxisAngle(UP, bladeAng), ONE);
          rotor.setMatrixAt(ri, this.m4);
        }
      }
      this.rotorCount[kind] = ri;
      for (; bi < BODY_POOL[kind]; bi++) body.setMatrixAt(bi, this.zero);
      for (; ri < ROTOR_POOL[kind]; ri++) rotor.setMatrixAt(ri, this.zero);
      body.instanceMatrix.needsUpdate = true;
      rotor.instanceMatrix.needsUpdate = true;
      if (body.instanceColor) body.instanceColor.needsUpdate = true;
    }
  }
}

function mkCandidates(maritime) {
  const cands = [];
  for (const name of BIG_FOUR) {
    const city = GEO.cities.find((c) => c.name === name);
    if (!city) continue;
    const r1 = seededRand('heli:medical:' + name);
    const a1 = r1() * Math.PI * 2, R1 = 14 + r1() * 6;
    cands.push({ kind: 'medical', baseX: city.x + Math.cos(a1) * R1, baseZ: city.z + Math.sin(a1) * R1,
      bearing: r1() * Math.PI * 2, tint: TINT.medical,
      runT: 20 + Math.random() * 40, flying: false, flightT: 0, active: false, x: 0, y: 0, z: 0, heading: 0 });
    const r2 = seededRand('heli:news:' + name);
    cands.push({ kind: 'news', baseX: city.x, baseZ: city.z, tint: TINT.news,
      angle: r2() * Math.PI * 2, flying: false, active: false, x: 0, y: 0, z: 0, heading: 0 });
  }
  const [cgx, cgz] = maritime.laneAt(maritime.len / 2); // mid-lane anchor, purely for the materialize distance check
  cands.push({ kind: 'coastguard', baseX: cgx, baseZ: cgz, tint: TINT.coastguard,
    s: 0, hoverT: 0, flying: false, active: false, x: 0, y: 0, z: 0, heading: 0 });
  cands.push({ kind: 'army', weight: 2, baseX: KILLEEN[0], baseZ: KILLEEN[1], tint: TINT.army,
    runT: 20 + Math.random() * 30, flying: false, flightT: 0, active: false, x: 0, y: 0, z: 0, heading: 0 });
  return cands;
}

// ---------------------------------------------------------------------- blimp
// A charm piece, not a fleet: one seeded-per-day loiter near a real landmark
// (the full triangle is too big to traverse at a charming speed — see
// AVIATION.md wave 4), mooring at a tier-2 field after dark or in bad weather.
const ANCHORS = [
  LL(32.7473, -97.0945), // AT&T Stadium
  LL(29.6847, -95.4107), // The Astrodome
  LL(30.2747, -97.7404), // Texas State Capitol (downtown Austin)
];
const LOITER_ALT = 35, LOITER_SPD = 4; // u/s, per AVIATION.md
const TRANSIT_SPD = 20;                // faster point-to-point so a moor completes within one night
const NIGHT_GATE = 0.45;               // matches aviation's lampsOn threshold
const WACO = LL(31.612, -97.2309);     // moors at Waco Regional (ACT) — roughly equidistant from all three anchors

export class BlimpSystem {
  constructor(scene) {
    this.group = mkBlimpMesh();
    this.signMat = this.group.userData.signMat;
    this.signTex = this.group.userData.signTex;
    scene.add(this.group);
    this.t = 0;
    this.simT = 0;
    this.day = -1;
    this.state = 'moored';
    this.u = 0;
    this.pos = new THREE.Vector3(WACO[0], hAt(WACO[0], WACO[1]) + 4, WACO[1]);
    this.heading = 0;
  }

  // pure per-day rolls — never touch existing seed streams
  loiterAnchor(day) {
    const r = seededRand('blimp:anchor:' + day);
    return ANCHORS[Math.floor(r() * ANCHORS.length)];
  }
  loiterParams(day) {
    const r = seededRand('blimp:orbit:' + day);
    return { radius: 8 + r() * 4, phase: r() * Math.PI * 2, dir: r() < 0.5 ? 1 : -1 };
  }
  // pure position query for a given day + angle progressed (radians) — the
  // determinism check calls this directly, independent of live ATMOS/weather
  positionAt(day, u) {
    const a = this.loiterAnchor(day), p = this.loiterParams(day);
    const ang = p.phase + u * p.dir;
    return { x: a[0] + Math.cos(ang) * p.radius, y: hAt(a[0], a[1]) + LOITER_ALT, z: a[1] + Math.sin(ang) * p.radius };
  }

  update(dt, days) {
    this.t += dt;
    this.simT += dt;
    const day = Math.floor(days);
    if (day !== this.day) {
      this.day = day;
      this.anchor = this.loiterAnchor(day);
      this.params = this.loiterParams(day);
      this.loiterY = hAt(this.anchor[0], this.anchor[1]) + LOITER_ALT; // AGL over the day's anchor
    }
    const flyOk = ATMOS.night < NIGHT_GATE && ATMOS.weather !== 'storm' && ATMOS.weather !== 'dust';

    if (this.state === 'loiter' && !flyOk) { this.state = 'transit'; this.target = { x: WACO[0], y: hAt(WACO[0], WACO[1]) + 4, z: WACO[1] }; this.after = 'moored'; }
    if (this.state === 'moored' && flyOk) { this.state = 'transit'; this.target = null; this.after = 'loiter'; }

    if (this.state === 'loiter') {
      this.u += (LOITER_SPD / this.params.radius) * dt;
      const ang = this.params.phase + this.u * this.params.dir;
      const nx = this.anchor[0] + Math.cos(ang) * this.params.radius, nz = this.anchor[1] + Math.sin(ang) * this.params.radius;
      this.heading = Math.atan2(-(nx - this.pos.x), -(nz - this.pos.z));
      this.pos.set(nx, this.loiterY, nz);
    } else if (this.state === 'transit') {
      const tgt = this.target ?? (() => {
        const ang = this.params.phase; // heading back to the day's loiter start point
        return { x: this.anchor[0] + Math.cos(ang) * this.params.radius, y: this.loiterY, z: this.anchor[1] + Math.sin(ang) * this.params.radius };
      })();
      const dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 3) {
        this.state = this.after;
        if (this.after === 'loiter') this.u = 0;
        this.pos.set(tgt.x, tgt.y, tgt.z);
      } else {
        this.heading = Math.atan2(-dx, -dz);
        const step = Math.min(d, TRANSIT_SPD * dt);
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
        this.pos.y += (tgt.y - this.pos.y) * Math.min(1, dt * 0.5);
      }
    }
    // moored: this.pos stays put

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    const night = ATMOS.night;
    this.signMat.emissiveIntensity = night;
    this.signTex.offset.x = (this.t * 0.12) % 1;
  }
}

function mkSignTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 32;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 256, 32);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('LONE STAR   LONE STAR   ', 0, 17);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function mkBlimpMesh() {
  const g = new THREE.Group();
  const envelope = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 8),
    new THREE.MeshLambertMaterial({ color: 0xd8d4c8, flatShading: true }));
  envelope.scale.set(1.6, 1.6, 5);
  g.add(envelope);
  const fin = (x, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 1.4), new THREE.MeshLambertMaterial({ color: 0xa83030 }));
    m.position.set(x, y, -4);
    return m;
  };
  g.add(fin(0, 1.4), fin(0, -1.4));
  const finH = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 0.12), new THREE.MeshLambertMaterial({ color: 0xa83030 }));
  finH.position.set(0, 0, -4);
  g.add(finH);
  const gondola = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 1.6), new THREE.MeshLambertMaterial({ color: 0x3a3a40 }));
  gondola.position.set(0, -1.7, 0.4);
  g.add(gondola);
  const tex = mkSignTexture();
  // day legibility: the panel's diffuse color IS the text color where the
  // texture is white (background stays black regardless, since it multiplies
  // to zero there) — a dark base color here reads as dim gray-on-black by
  // day no matter how bright the sun is. Bright base + the same emissiveMap
  // at night keeps the scrolling glow on top.
  const signMat = new THREE.MeshLambertMaterial({ color: 0xf2f0ea, map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 0.9), signMat);
  sign.position.set(1.62, 0, 0);
  sign.rotation.y = Math.PI / 2;
  g.add(sign);
  const sign2 = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 0.9), signMat);
  sign2.position.set(-1.62, 0, 0);
  sign2.rotation.y = -Math.PI / 2;
  g.add(sign2);
  g.userData.signMat = signMat;
  g.userData.signTex = tex;
  return g;
}
