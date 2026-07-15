// The working Gulf: container ports at real locations, cargo ships and tankers
// on coastal lanes, shrimp boats off Padre, oil platforms offshore.
import * as THREE from 'three';
import { hAt } from './geo.js';
import { ATMOS } from './sky.js';

const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];
const SEA = -2.1; // gulf water plane is at -2.5; hulls sit slightly proud

// real port locations
const PORTS = [
  { name: 'Port of Houston', at: LL(29.735, -95.01), cranes: 4 },
  { name: 'Port of Galveston', at: LL(29.31, -94.79), cranes: 2 },
  { name: 'Port of Corpus Christi', at: LL(27.815, -97.40), cranes: 3 },
  { name: 'Port Arthur', at: LL(29.83, -93.93), cranes: 2 },
  { name: 'Port of Brownsville', at: LL(25.95, -97.40), cranes: 2 },
];

// hand-laid shipping lane hugging the coast, Brownsville -> Sabine (offshore)
const LANE = [
  LL(25.9, -96.9), LL(26.6, -96.9), LL(27.5, -96.7), LL(28.2, -96.2),
  LL(28.8, -95.5), LL(29.2, -94.8), LL(29.4, -94.2), LL(29.55, -93.7),
];

// Tidelands buoy — ON the line (coastDist ≈ 166.7u, converged against
// border + island rings offline), off the Bolivar Roads entrance channel
const BUOY_AT = [4762.2, 1851.5];
// the real 64.1-mi platform off Matagorda — the Far Rig, alone past the blue line
const FAR_RIG = LL(28.0, -95.0);

export class MaritimeSystem {
  constructor(scene) {
    // emissive glow materials (rig flares, work lights, buoy lamp) — opacity
    // driven by ATMOS.night in update; fog:false so the horizon skyline
    // survives scene fog (sky.js owns all real lights, these are just glow)
    const mkGlow = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, fog: false, blending: THREE.AdditiveBlending, depthWrite: false });
    this.rigGlow = mkGlow(0xffa848);
    this.workGlow = mkGlow(0xfff0c0);
    this.buildPorts(scene);
    this.buildPlatforms(scene);
    this.ships = this.buildShips(scene);
    this.buoy = this.buildBuoy(scene);
    // shelf plaques — readable brass, NOT landmarks (the counters stay sacred);
    // main.js's unified plaqueNear consults this list as its third source
    this.plaques = [
      {
        name: 'Tidelands Buoy', at: BUOY_AT, hint: 'read the channel buoy', sub: 'Three marine leagues',
        text: 'A republic drives a hard bargain. When Texas traded its flag for a star in 1845, it kept what no other Gulf state was given: three marine leagues of open sea — 10.36 miles of water, bed, and everything beneath it. You are floating on the line. Landward of this buoy, Texas. Seaward, the federal shelf and the deep blue.',
      },
      {
        name: 'The Far Rig', at: FAR_RIG, hint: 'read the brass plate', sub: '64.1 miles out',
        text: 'The farthest platform off this coast — sixty-four miles from the sand, long past the blue line, alone. Crews rotate out by helicopter, two weeks at a stretch. At night her flare is the only thing on the whole horizon that stays put, and the shrimpers steer home by her like a lit porch.',
      },
    ];
    // lane cumulative lengths
    this.cum = [0];
    for (let i = 1; i < LANE.length; i++) {
      this.cum.push(this.cum[i - 1] + Math.hypot(LANE[i][0] - LANE[i - 1][0], LANE[i][1] - LANE[i - 1][1]));
    }
    this.len = this.cum[this.cum.length - 1];
  }

  laneAt(s) {
    s = ((s % this.len) + this.len) % this.len;
    let lo = 0;
    while (lo < this.cum.length - 2 && this.cum[lo + 1] <= s) lo++;
    const a = LANE[lo], b = LANE[lo + 1];
    const seg = this.cum[lo + 1] - this.cum[lo] || 1;
    const t = (s - this.cum[lo]) / seg;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (b[0] - a[0]) / seg, (b[1] - a[1]) / seg];
  }

  buildPorts(scene) {
    const steel = new THREE.MeshLambertMaterial({ color: 0xc85a28, flatShading: true }); // port crane orange
    const grey = new THREE.MeshLambertMaterial({ color: 0x8a8f98, flatShading: true });
    const boxColors = [0xc23b3b, 0x3b62c2, 0x3f7a3f, 0xd8a13b, 0x5e8a8a].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    for (const port of PORTS) {
      const [px, pz] = port.at;
      const g = new THREE.Group();
      const y = hAt(px, pz);
      // wharf pad
      const pad = new THREE.Mesh(new THREE.BoxGeometry(26, 0.6, 12), grey);
      pad.position.set(0, y + 0.3, 0);
      g.add(pad);
      // gantry cranes
      for (let i = 0; i < port.cranes; i++) {
        const cx = -10 + i * (22 / Math.max(1, port.cranes - 1) || 0);
        for (const lx of [-1.6, 1.6]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), steel);
          leg.position.set(cx + lx, y + 4, -3);
          g.add(leg);
        }
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 10), steel);
        beam.position.set(cx, y + 7.4, -6);
        beam.rotation.x = 0.06;
        g.add(beam);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 1.2), grey);
        cab.position.set(cx, y + 6.6, -4);
        g.add(cab);
      }
      // container stacks
      for (let i = 0; i < 14; i++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 2.4), boxColors[i % boxColors.length]);
        c.position.set(-11 + (i % 7) * 3.6, y + 0.6 + Math.floor(i / 7) * 1.05, 2.5 + (i % 2) * 2.6);
        g.add(c);
      }
      // warehouse
      const wh = new THREE.Mesh(new THREE.BoxGeometry(9, 2.6, 5), new THREE.MeshLambertMaterial({ color: 0xb0a890 }));
      wh.position.set(8, y + 1.6, 3);
      g.add(wh);
      g.position.set(px, 0, pz);
      scene.add(g);
    }
  }

  buildPlatforms(scene) {
    // offshore oil platforms, roughly along the real OCS fields; the last
    // entry is the Far Rig (64.1 mi) — bigger everything, helipad, twin flare
    const spots = [
      LL(28.9, -94.7), LL(28.4, -95.3), LL(29.3, -93.9), LL(27.9, -96.3),
      FAR_RIG, LL(29.0, -93.6), LL(27.2, -96.9),
    ];
    const steel = new THREE.MeshLambertMaterial({ color: 0xb0a020, flatShading: true });
    const dark = new THREE.MeshLambertMaterial({ color: 0x4a4a52, flatShading: true });
    this.platforms = [];
    for (const [x, z] of spots) {
      const far = x === FAR_RIG[0] && z === FAR_RIG[1];
      const g = new THREE.Group();
      const s = far ? 1.5 : 1; // Far Rig reads bigger from the water
      for (const [lx, lz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * s, 0.35 * s, 6, 6), dark);
        leg.position.set(lx * s, SEA + 2, lz * s);
        g.add(leg);
      }
      const deck = new THREE.Mesh(new THREE.BoxGeometry(6.5 * s, 0.7, 6.5 * s), steel);
      deck.position.y = SEA + 5;
      const mod = new THREE.Mesh(new THREE.BoxGeometry(3, 1.8, 2.4), dark);
      mod.position.set(-1 * s, SEA + 6.3, -1 * s);
      const derrick = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.7, 5 * s, 4), steel);
      derrick.position.set(1.8 * s, SEA + 5.35 + 2.5 * s, 1.5 * s);
      const flare = new THREE.Mesh(new THREE.SphereGeometry(0.3 * s, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff8830 }));
      flare.position.set(1.8 * s, SEA + 5.35 + 5 * s + 0.4, 1.5 * s);
      // night glow around the flare tip — from Malaquite the horizon gets a skyline
      const glow = new THREE.Mesh(new THREE.SphereGeometry(far ? 2.4 : 1.5, 8, 6), this.rigGlow);
      glow.position.copy(flare.position);
      g.add(deck, mod, derrick, flare, glow);
      if (far) {
        // second crew module + helipad on the seaward corner
        const mod2 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 2.2), new THREE.MeshLambertMaterial({ color: 0xd8d0c0, flatShading: true }));
        mod2.position.set(-2.2, SEA + 6.7, 2.4);
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.25, 8), dark);
        pad.position.set(3.6, SEA + 6.2, -3.4);
        const padLight = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 5), this.workGlow);
        padLight.position.set(3.6, SEA + 6.8, -3.4);
        g.add(mod2, pad, padLight);
      }
      g.position.set(x, 0, z);
      g.userData.far = far;
      scene.add(g);
      this.platforms.push(g);
    }
  }

  buildBuoy(scene) {
    // red nun buoy bobbing on the Tidelands line itself
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, 1.6, 8), new THREE.MeshLambertMaterial({ color: 0xc23b30, flatShading: true }));
    body.position.y = SEA + 0.7;
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.3, 5), new THREE.MeshLambertMaterial({ color: 0x4a4a52, flatShading: true }));
    cage.position.y = SEA + 2.1;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 6, 5), this.workGlow);
    lamp.position.y = SEA + 2.9;
    g.add(body, cage, lamp);
    g.position.set(BUOY_AT[0], 0, BUOY_AT[1]);
    scene.add(g);
    return g;
  }

  // shelf plaques (buoy + Far Rig) for main.js's unified plaque lookup
  plaqueNear(pos, range) {
    for (const p of this.plaques)
      if (Math.hypot(pos.x - p.at[0], pos.z - p.at[1]) < range) return p;
    return null;
  }

  buildShips(scene) {
    const ships = [];
    const mkCargo = (tint) => {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 13), new THREE.MeshLambertMaterial({ color: tint, flatShading: true }));
      hull.position.y = SEA + 0.5;
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 1.6), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
      bridge.position.set(0, SEA + 2.4, 5);
      g.add(hull, bridge);
      const cols = [0xc23b3b, 0x3b62c2, 0x3f7a3f, 0xd8a13b];
      for (let i = 0; i < 8; i++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.2), new THREE.MeshLambertMaterial({ color: cols[i % 4] }));
        c.position.set(0, SEA + 1.8 + (i % 2) * 0.95, -4.5 + Math.floor(i / 2) * 2.4);
        g.add(c);
      }
      return g;
    };
    const mkTanker = () => {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.5, 14), new THREE.MeshLambertMaterial({ color: 0x8a3a3a, flatShading: true }));
      hull.position.y = SEA + 0.45;
      const deckTank = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 9, 8).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xd8d0c0 }));
      deckTank.position.set(0, SEA + 1.7, -1.5);
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 1.6), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
      bridge.position.set(0, SEA + 2.3, 5.5);
      g.add(hull, deckTank, bridge);
      return g;
    };
    const mkShrimper = () => {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 3.2), new THREE.MeshLambertMaterial({ color: 0xe8e4d8, flatShading: true }));
      hull.position.y = SEA + 0.3;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 1), new THREE.MeshLambertMaterial({ color: 0x4a6a8a }));
      cabin.position.set(0, SEA + 1, -0.5);
      const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 4), new THREE.MeshLambertMaterial({ color: 0x6a5a3a }));
      boom.position.set(0, SEA + 1.6, 0.6);
      boom.rotation.z = 0.7;
      // night work-lights — shrimpers fish after dark, decks lit up
      const l1 = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 5), this.workGlow);
      l1.position.set(0.8, SEA + 2.4, 1.2);
      const l2 = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 5), this.workGlow);
      l2.position.set(0, SEA + 1.5, -0.5);
      g.add(hull, cabin, boom, l1, l2);
      return g;
    };

    // 6 big ships on the lane
    for (let i = 0; i < 6; i++) {
      const g = i % 2 ? mkTanker() : mkCargo([0x3a5a3a, 0x3a4a6a, 0x6a4a3a][i % 3]);
      scene.add(g);
      ships.push({ g, s: (i / 6) * 99999, dir: i % 2 ? 1 : -1, speed: 2.6 + Math.random(), lane: true });
    }
    // shrimp boats off Padre / Galveston
    for (const [x, z] of [LL(26.7, -97.1), LL(26.3, -97.0), LL(29.25, -94.6), LL(27.6, -96.9)]) {
      const g = mkShrimper();
      g.position.set(x, 0, z);
      scene.add(g);
      ships.push({ g, x, z, a: Math.random() * 6.28, lane: false });
    }
    return ships;
  }

  update(dt, t) {
    // night gate for every glow (rig flares, work lights, buoy lamp)
    this.rigGlow.opacity = ATMOS.night;
    this.workGlow.opacity = ATMOS.night;
    // the buoy bobs on the line
    this.buoy.position.y = Math.sin(t * 0.8) * 0.12;
    this.buoy.rotation.z = Math.sin(t * 0.55) * 0.06;
    for (const s of this.ships) {
      if (s.lane) {
        s.s += s.speed * s.dir * dt;
        const [x, z, dx, dz] = this.laneAt(s.s);
        s.g.position.set(x, Math.sin(t * 0.6 + s.s) * 0.06, z);
        s.g.rotation.y = Math.atan2(-dx * s.dir, -dz * s.dir);
      } else {
        // shrimpers circle their grounds slowly, bobbing
        s.a += dt * 0.05;
        s.g.position.set(s.x + Math.cos(s.a) * 6, Math.sin(t * 0.9 + s.a * 7) * 0.08, s.z + Math.sin(s.a) * 6);
        s.g.rotation.y = -s.a - Math.PI / 2;
      }
    }
  }
}
