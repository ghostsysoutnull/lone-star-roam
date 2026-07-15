// The Gulf's first verb: rideable car ferries. Board in DRIVE and the crossing
// departs on the spot (no schedule, can't skip) — ~25s with the engine cut,
// the slow-TV verb the shoulder-and-shelf track's water half needed. Player
// position is driven directly along the crossing line (see vehicle.js's
// aboardFerry guard) rather than true scene-graph reparenting — this.pos is
// the single source of truth for camera/HUD/nearestRoad everywhere else in
// the codebase, so a maritime.js-style lane-lerp fits without touching those.
// Only one route can ever be mid-crossing (single player), so state is plain
// per-route fields, no pooling.
import * as THREE from 'three';
import { hAt } from './geo.js';

const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];
const SEA = -2.1;            // matches maritime.js's gulf water plane + freeboard
const DECK_Y = SEA + 0.85;   // low, flat, drive-on car-ferry deck
const CROSS_S = 25;          // fixed crossing duration — arcade pacing, not real distance
const BOARD_R = 6;           // dock-proximity boarding trigger
const BUOY_R = 60;           // bell-buoy hearing range
const BELL_EVERY = 9;        // seconds between tolls while in range

// Real terminals, same coordinate precision as gameplay.js's LANDMARKS. The
// Port Aransas mainland point is nudged inland along FM 361/Ferry Rd — the
// real channel crossing is only ~870 units-equivalent (a few hundred real
// meters), too short at this boat's scale for a fixed 25s ride (the 15-unit
// hull would already span both docks). Widened to ~82 units, Bolivar's order
// of magnitude, rather than shortening the crossing per-route (the spec locks
// "~25s, no schedule" for every ferry, not a distance-proportional ride).
const ROUTES_DEF = [
  { key: 'bolivar', name: 'Bolivar Ferry', a: LL(29.3103, -94.7924), b: LL(29.3606, -94.7573) },
  { key: 'portaransas', name: 'Port Aransas Ferry', a: LL(27.8180, -97.1480), b: LL(27.8398, -97.0658) },
];

// same convention as bats.js/maritime.js: heading 0 = north (-z), so travel
// direction (dx,dz) needs sin(h)=-dx/len, cos(h)=-dz/len → atan2(-dx,-dz)
function headingOf(from, to) {
  return Math.atan2(-(to[0] - from[0]), -(to[1] - from[1]));
}

function mkBoat() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(7, 1.1, 15), new THREE.MeshLambertMaterial({ color: 0xc23b3b, flatShading: true }));
  hull.position.y = -0.3;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.2, 14.6), new THREE.MeshLambertMaterial({ color: 0x8a8f98 }));
  deck.position.y = 0.4;
  g.add(hull, deck);
  const railMat = new THREE.MeshLambertMaterial({ color: 0xe8e4d8 });
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 14.6), railMat);
    rail.position.set(3.35 * side, 0.75, 0);
    g.add(rail);
  }
  // double-ended real ferries still carry one pilothouse, off to a side
  const house = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 2), railMat);
  house.position.set(0, 1.4, -5.5);
  g.add(house);
  return g;
}

function mkDock(x, z, heading) {
  const g = new THREE.Group();
  const y = hAt(x, z);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 5), new THREE.MeshLambertMaterial({ color: 0x8a8a82 }));
  pad.position.set(x, y + 0.1, z);
  pad.rotation.y = heading;
  g.add(pad);
  const pilingMat = new THREE.MeshLambertMaterial({ color: 0x5a5248, flatShading: true });
  for (const side of [-1, 1]) {
    const piling = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3, 0.4), pilingMat);
    piling.position.set(x + Math.cos(heading) * 3.2 * side, y - 1, z - Math.sin(heading) * 3.2 * side);
    g.add(piling);
  }
  return g;
}

function mkBuoy() {
  const g = new THREE.Group();
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 1.6, 8), new THREE.MeshLambertMaterial({ color: 0xd03030, flatShading: true }));
  can.position.y = 0.7;
  const topper = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.4, 6), new THREE.MeshLambertMaterial({ color: 0x2a2a2a }));
  topper.position.y = 1.6;
  g.add(can, topper);
  return g;
}

export class FerrySystem {
  constructor(scene, player) {
    this.player = player;
    this.onBoard = null; // (routeName) => toast/chime
    this.onBell = null;  // (dist) => audio.bell
    this.crossing = false;
    this.routes = ROUTES_DEF.map((def) => {
      const heading = headingOf(def.a, def.b);
      const boat = mkBoat();
      boat.rotation.y = heading;
      boat.position.set(def.a[0], DECK_Y, def.a[1]);
      scene.add(boat);
      scene.add(mkDock(def.a[0], def.a[1], heading));
      scene.add(mkDock(def.b[0], def.b[1], heading));
      const buoyX = (def.a[0] + def.b[0]) / 2 + Math.cos(heading) * 5;
      const buoyZ = (def.a[1] + def.b[1]) / 2 - Math.sin(heading) * 5;
      const buoy = mkBuoy();
      buoy.position.set(buoyX, SEA, buoyZ);
      scene.add(buoy);
      return {
        key: def.key, name: def.name, a: def.a, b: def.b,
        side: 'a', phase: 'docked', t: 0, dir: 1, armed: true,
        boat, buoy, buoyX, buoyZ, bellCd: 0,
      };
    });
  }

  // force-board a route regardless of proximity — used by the verify suite
  board(key) {
    const r = this.routes.find((r) => r.key === key);
    if (!r || r.phase !== 'docked' || this.player.aboardFerry) return false;
    r.phase = 'crossing'; r.t = 0; r.dir = r.side === 'a' ? 1 : -1;
    this.player.aboardFerry = true; this.player.speed = 0; this.player.tilt = 0;
    this.onBoard?.(r.name);
    return true;
  }

  update(dt, simT) {
    const p = this.player;
    let anyCrossing = false;
    for (const r of this.routes) {
      if (r.phase === 'docked') {
        const dock = r.side === 'a' ? r.a : r.b;
        const dx = dock[0] - p.pos.x, dz = dock[1] - p.pos.z;
        const inRange = dx * dx + dz * dz < BOARD_R * BOARD_R;
        // just-arrived boats disarm until the player actually leaves the ramp —
        // otherwise arrival re-triggers boarding on the very next tick (you're
        // still standing on the trigger point) and the ferry ping-pongs forever
        if (!r.armed) { if (!inRange) r.armed = true; }
        else if (p.mode === 'DRIVE' && !p.aboardFerry && inRange) this.board(r.key);
      } else {
        anyCrossing = true;
        r.t = Math.min(1, r.t + dt / CROSS_S);
        const from = r.dir === 1 ? r.a : r.b, to = r.dir === 1 ? r.b : r.a;
        const x = from[0] + (to[0] - from[0]) * r.t, z = from[1] + (to[1] - from[1]) * r.t;
        const bob = Math.sin(simT * 0.7) * 0.05;
        p.pos.x = x; p.pos.z = z; p.pos.y = DECK_Y + bob;
        p.heading = headingOf(from, to);
        r.boat.position.set(x, DECK_Y + bob, z);
        r.boat.rotation.y = p.heading;
        if (r.t >= 1) {
          r.phase = 'docked';
          r.side = r.side === 'a' ? 'b' : 'a';
          r.armed = false;
          p.aboardFerry = false; p.speed = 0;
        }
      }
      if (r.phase === 'docked') {
        const at = r.side === 'a' ? r.a : r.b;
        r.boat.position.set(at[0], DECK_Y + Math.sin(simT * 0.9) * 0.04, at[1]);
      }
      r.buoy.position.y = SEA + Math.sin(simT * 1.1 + r.buoyX) * 0.15;
      r.bellCd -= dt;
      const bdx = r.buoyX - p.pos.x, bdz = r.buoyZ - p.pos.z;
      const bd2 = bdx * bdx + bdz * bdz;
      if (bd2 < BUOY_R * BUOY_R && r.bellCd <= 0) {
        r.bellCd = BELL_EVERY;
        this.onBell?.(Math.sqrt(bd2));
      }
    }
    this.crossing = anyCrossing;
  }
}
