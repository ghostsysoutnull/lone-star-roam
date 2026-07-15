// Aviation wave 5 — military color (partial: the two flavor movers). Both
// pairs share the ≤4 fixed-wing budget aviation.js already enforces
// (MAX_AIR) — this system just asks aviation.airborneCount() for headroom
// before it spends any, so the sky never gets busier than the design stance
// allows. No weapons on anything here, ever: these are training/liaison
// aircraft doing exactly what their real counterparts do and nothing else.
import * as THREE from 'three';
import { hAt } from './geo.js';
import { ATMOS } from './sky.js';
import { merge, tinted } from './traffic.js';
import { MAX_AIR } from './aviation.js';

const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];

const ELLINGTON = LL(29.6072, -95.1587); // Ellington Field / NASA JSC's T-38 base
const PAIR_W = 2;          // both candidates are two-ship formations — one weight unit each aircraft
const MAT_R = 450, AIR_FAR = 900; // aviation.js/rotors.js materialize idiom
const NASA_SPD = 46;       // u/s closure on the inbound leg
const LOW_SPD = 78;        // u/s — visibly faster than a scheduled jet's 60 cruise ("fast" per AVIATION.md)
const LOW_ALT = 16;        // AGL on the low-level pass
const WEST_TEXAS_X = -2200; // Trans-Pecos gate — mirrors animals.js regionTable's desert box

// Shoulder & Shelf W2 — Cannon AFB / Barksdale AFB flavor pair (Dyess's
// counterpart per the spec: "military flavor, not schedule" — these fly no
// aviation.js ROUTES entry, just an occasional clear-day sighting near
// either base). Real Cannon->Barksdale bearing, so a triggered pass is a
// local segment of the actual corridor, not a random heading.
const CANNON = LL(34.3819, -103.3221), BARKSDALE = LL(32.5019, -93.6624);
const B52_SPD = 62;        // u/s cruise — close to a scheduled jet's 60
const B52_ALT = 95;        // AGL — high cruise, not a low pass
const B52_MAT_R = 600;     // materialize near either base
const CORRIDOR = (() => {
  const dx = BARKSDALE[0] - CANNON[0], dz = BARKSDALE[1] - CANNON[1], len = Math.hypot(dx, dz);
  return { ux: dx / len, uz: dz / len };
})();

function advanceNasa(c, dt) {
  if (!c.flying) return;
  c.t += dt;
  const dx = ELLINGTON[0] - c.x0, dz = ELLINGTON[1] - c.z0, len = Math.hypot(dx, dz);
  const f = Math.min(1, (c.t * NASA_SPD) / Math.max(len, 0.01));
  c.x = c.x0 + dx * f;
  c.z = c.z0 + dz * f;
  c.y = hAt(c.x, c.z) + 55 * (1 - f) + 0.5 * f; // descends to the deck on arrival
  c.heading = Math.atan2(-dx, -dz);
  if (f >= 1) c.flying = false;
}

function advanceLowlevel(c, dt) {
  if (!c.flying) return;
  c.t += dt;
  const dx = c.x1 - c.x0, dz = c.z1 - c.z0, len = Math.hypot(dx, dz);
  const f = Math.min(1, (c.t * LOW_SPD) / Math.max(len, 0.01));
  c.x = c.x0 + dx * f;
  c.z = c.z0 + dz * f;
  c.y = hAt(c.x, c.z) + LOW_ALT;
  c.heading = Math.atan2(-dx, -dz);
  if (f >= 1) c.flying = false;
}

function advanceB52(c, dt) {
  if (!c.flying) return;
  c.t += dt;
  const dx = c.x1 - c.x0, dz = c.z1 - c.z0, len = Math.hypot(dx, dz);
  const f = Math.min(1, (c.t * B52_SPD) / Math.max(len, 0.01));
  c.x = c.x0 + dx * f;
  c.z = c.z0 + dz * f;
  c.y = hAt(c.x, c.z) + B52_ALT;
  c.heading = Math.atan2(-dx, -dz);
  if (f >= 1) c.flying = false;
}

const W = 0xd8dade;
function mkTrainerBody() {
  return merge([
    tinted(new THREE.CylinderGeometry(0.28, 0.32, 3.4, 10).rotateX(Math.PI / 2).translate(0, 0.6, 0.2), W),
    tinted(new THREE.ConeGeometry(0.28, 0.7, 10).rotateX(-Math.PI / 2).translate(0, 0.6, -1.85), W),
    tinted(new THREE.BoxGeometry(0.32, 0.26, 0.9).translate(0, 0.82, -0.8), 0x556070), // canopy
    tinted(new THREE.BoxGeometry(2.6, 0.07, 0.7).translate(0, 0.5, 0.3), W),           // wing
    tinted(new THREE.BoxGeometry(0.9, 0.06, 0.36).translate(0, 0.95, 1.55), W),        // tailplane
    tinted(new THREE.BoxGeometry(0.05, 0.55, 0.5).translate(0.22, 0.95, 1.55), 0xffffff),
    tinted(new THREE.BoxGeometry(0.05, 0.55, 0.5).translate(-0.22, 0.95, 1.55), 0xffffff), // twin tail
  ]);
}
const UP = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);

export class MilitaryAirSystem {
  constructor(scene) {
    this.candidates = [
      // cs: A2 identity data only this session — voicing it on radio needs
      // A3's direct-range window (Ellington has no tower/AIRPORTS entry)
      { kind: 'nasa', baseX: ELLINGTON[0], baseZ: ELLINGTON[1], tint: 0xf2f0ea, cs: 'NASA 9-0-1',
        runT: 60 + Math.random() * 60, flying: false, active: false, t: 0, x: 0, y: 0, z: 0, heading: 0 },
      { kind: 'lowlevel', tint: 0x8a8f96,
        rollT: 90 + Math.random() * 90, flying: false, active: false, t: 0, x: 0, y: 0, z: 0, heading: 0 },
      // W7: the heavy gets a callsign, so radio.js's direct-range window lets it
      // onto the scanner. Its own chatter kind — the `military` pool is NASA's
      // procedural register and a Barksdale crew does not sound like that.
      { kind: 'b52', tint: 0x4a4d42, cs: 'Buff 2-1',
        rollT: 140 + Math.random() * 160, flying: false, active: false, t: 0, x: 0, y: 0, z: 0, heading: 0 },
    ];
    this.t = 0;
    this.simT = 0; // accumulates in the real loop — wiring sentinel
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.pool = 4; // two pairs' worth, though only one pair ever flies at once
    this.body = new THREE.InstancedMesh(mkTrainerBody(), mat, this.pool);
    this.body.frustumCulled = false;
    scene.add(this.body);
    this.m4 = new THREE.Matrix4();
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.q = new THREE.Quaternion();
    this.col = new THREE.Color();
  }

  // debug/test hook: force a parked pair airborne now, respecting the shared
  // fixed-wing cap — mirrors heli.force()/aviation.force(). px/pz default to
  // the last update() position but take an explicit override: a debug
  // teleport calls force() in the same tick as tp(), before the next real
  // update() refreshes this.px/this.pz, so a stale fallback would roll the
  // low-level pass around the player's pre-teleport spot instead of the new one.
  force(kind, aviation, px = this.px, pz = this.pz) {
    const c = this.candidates.find((x) => x.kind === kind && !x.flying);
    if (!c) return false;
    if (this.candidates.some((x) => x.flying)) return false; // one pair at a time
    if (aviation.airborneCount() + PAIR_W > MAX_AIR) return false;
    c.flying = true; c.active = true; c.t = 0;
    if (kind === 'nasa') {
      const a = Math.random() * Math.PI * 2;
      c.x0 = ELLINGTON[0] + Math.cos(a) * 280; c.z0 = ELLINGTON[1] + Math.sin(a) * 280;
    } else if (kind === 'b52') {
      this.rollB52(c, px ?? CANNON[0], pz ?? CANNON[1]);
    } else {
      this.rollLowlevel(c, px ?? WEST_TEXAS_X - 100, pz ?? 300);
    }
    return true;
  }

  despawnAll() { for (const c of this.candidates) { c.flying = false; c.active = false; } }

  airborneCount() { return this.candidates.some((c) => c.flying) ? PAIR_W : 0; }

  nearestAirborneDist(px, pz) {
    let best = Infinity;
    for (const c of this.candidates) if (c.flying) best = Math.min(best, Math.hypot(c.x - px, c.z - pz));
    return best;
  }

  rollLowlevel(c, px, pz) {
    const a = Math.random() * Math.PI * 2;
    c.x0 = px + Math.cos(a) * 380; c.z0 = pz + Math.sin(a) * 380;
    c.x1 = px - Math.cos(a) * 380; c.z1 = pz - Math.sin(a) * 380;
  }

  // a local segment along the real Cannon->Barksdale bearing, centered on
  // whichever base is nearest px/pz — direction (which base is "from") is random
  rollB52(c, px, pz) {
    const { ux, uz } = CORRIDOR;
    const fwd = Math.random() < 0.5;
    const dx = fwd ? ux : -ux, dz = fwd ? uz : -uz;
    c.x0 = px - dx * 380; c.z0 = pz - dz * 380;
    c.x1 = px + dx * 380; c.z1 = pz + dz * 380;
  }

  update(dt, px, pz, aviation) {
    this.t += dt;
    this.simT += dt;
    this.px = px; this.pz = pz;
    const anyFlying = this.candidates.some((c) => c.flying);
    const budgetOk = () => aviation.airborneCount() + PAIR_W <= MAX_AIR;

    const nasa = this.candidates[0];
    const dNasa = Math.hypot(nasa.baseX - px, nasa.baseZ - pz);
    const nasaInRange = nasa.flying ? dNasa < AIR_FAR : dNasa < MAT_R;
    if (!nasaInRange) { nasa.active = false; nasa.flying = false; }
    else if (!nasa.flying) {
      nasa.active = false;
      nasa.runT -= dt;
      if (nasa.runT <= 0) {
        nasa.runT = 90 + Math.random() * 120;
        if (!anyFlying && Math.random() < 0.4 && budgetOk()) {
          nasa.flying = true; nasa.t = 0;
          const a = Math.random() * Math.PI * 2;
          nasa.x0 = ELLINGTON[0] + Math.cos(a) * 280; nasa.z0 = ELLINGTON[1] + Math.sin(a) * 280;
        }
      }
    }
    if (nasa.flying) { advanceNasa(nasa, dt); nasa.active = true; }

    const low = this.candidates[1];
    if (!low.flying) {
      low.active = false;
      const west = px < WEST_TEXAS_X, day = ATMOS.night < 0.35 && ATMOS.weather !== 'storm' && ATMOS.weather !== 'dust';
      if (west && day) {
        low.rollT -= dt;
        if (low.rollT <= 0) {
          low.rollT = 100 + Math.random() * 160;
          if (!anyFlying && Math.random() < 0.5 && budgetOk()) { low.flying = true; low.t = 0; this.rollLowlevel(low, px, pz); }
        }
      }
    } else { advanceLowlevel(low, dt); low.active = true; }

    const b52 = this.candidates[2];
    const dCannon = Math.hypot(CANNON[0] - px, CANNON[1] - pz), dBarksdale = Math.hypot(BARKSDALE[0] - px, BARKSDALE[1] - pz);
    const nearBase = Math.min(dCannon, dBarksdale) < B52_MAT_R;
    if (!b52.flying) {
      b52.active = false;
      const clearDay = ATMOS.night < 0.35 && ATMOS.weather === 'clear';
      if (nearBase && clearDay) {
        b52.rollT -= dt;
        if (b52.rollT <= 0) {
          b52.rollT = 140 + Math.random() * 200;
          if (!anyFlying && Math.random() < 0.4 && budgetOk()) {
            b52.flying = true; b52.t = 0;
            this.rollB52(b52, dCannon < dBarksdale ? CANNON[0] : BARKSDALE[0], dCannon < dBarksdale ? CANNON[1] : BARKSDALE[1]);
          }
        }
      }
    } else { advanceB52(b52, dt); b52.active = true; }

    this.render();
  }

  render() {
    const list = [];
    for (const c of this.candidates) {
      if (!c.active) continue;
      const perp = c.heading + Math.PI / 2, ox = Math.cos(perp) * 5, oz = Math.sin(perp) * 5;
      list.push({ x: c.x - ox, y: c.y, z: c.z - oz, heading: c.heading, tint: c.tint });
      list.push({ x: c.x + ox, y: c.y, z: c.z + oz, heading: c.heading, tint: c.tint });
    }
    let i = 0;
    for (; i < list.length && i < this.pool; i++) {
      const it = list[i];
      this.m4.compose(new THREE.Vector3(it.x, it.y, it.z), this.q.setFromAxisAngle(UP, it.heading), ONE);
      this.body.setMatrixAt(i, this.m4);
      this.body.setColorAt(i, this.col.set(it.tint));
    }
    for (; i < this.pool; i++) this.body.setMatrixAt(i, this.zero);
    this.body.instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
  }
}
