// The working Gulf: container ports at real locations, cargo ships and tankers
// on coastal lanes, shrimp boats off Padre, oil platforms offshore.
import * as THREE from 'three';
import { GEO, hAt, coastDist, seededRand, inWorld, SEA_Y } from './geo.js';
import { ATMOS } from './sky.js';

const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];
const SEA = SEA_Y + 0.4; // hulls sit slightly proud of the gulf water plane

// radial vertex-color falloff for glow discs (center white -> black rim);
// black + AdditiveBlending contributes nothing, so the edge dissolves
export function fadeDisc(geo, r = 1) {
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const d = Math.hypot(pos.getX(i), pos.getZ(i)) / r;
    const c = Math.max(0, 1 - d * d);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

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

export class MaritimeSystem {
  constructor(scene, sky) {
    this.sky = sky; // Energy W4: rig decks register into sky's local light pool
    // emissive glow materials (rig flares, work lights, buoy lamp) — opacity
    // driven by ATMOS.night in update; fog:false so the horizon skyline
    // survives scene fog (sky.js owns all real lights, these are just glow)
    const mkGlow = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, fog: false, blending: THREE.AdditiveBlending, depthWrite: false });
    this.rigGlow = mkGlow(0xffa848);
    this.workGlow = mkGlow(0xfff0c0);
    // Energy W2 offshore rebase: platforms are the 227 real baked sites (153
    // majors, 74 minor clusters); the hand-laid seven retired (realism-first).
    // The Far Rig re-anchors to the farthest real major the player can reach —
    // the world wall caps the shelf at 1127u (~70 mi); deepwater spars beyond
    // it still render as horizon dressing but can't carry the brass.
    this.farSite = GEO.energy.platforms
      .filter((p) => p.tier === 'major' && inWorld(p.x, p.z))
      .reduce((b, p) => (!b || coastDist(p.x, p.z) > coastDist(b.x, b.z) ? p : b), null);
    this.farMiles = this.farSite ? coastDist(this.farSite.x, this.farSite.z) / 16.09 : 0;
    this.buildPorts(scene);
    this.buildPlatforms(scene);
    // Energy W2: the lane itself keeps the scarcity exception (hand-laid), but
    // its port-approach legs snap to the 8 real baked fairways (buildShips
    // routes a tanker on one, so legs must exist first)
    this.fairwayLegs = this.buildFairwayLegs();
    this.ships = this.buildShips(scene);
    this.buoy = this.buildBuoy(scene);
    // shelf plaques — readable brass, NOT landmarks (the counters stay sacred);
    // main.js's unified plaqueNear consults this list as its third source
    const fs = this.farSite;
    this.plaques = [
      {
        name: 'Tidelands Buoy', at: BUOY_AT, hint: 'read the channel buoy', sub: 'Three marine leagues',
        text: 'A republic drives a hard bargain. When Texas traded its flag for a star in 1845, it kept what no other Gulf state was given: three marine leagues of open sea — 10.36 miles of water, bed, and everything beneath it. You are floating on the line. Landward of this buoy, Texas. Seaward, the federal shelf and the deep blue.',
      },
      {
        name: 'The Far Rig', at: fs ? [fs.x, fs.z] : BUOY_AT, hint: 'read the brass plate', sub: `${this.farMiles.toFixed(1)} miles out`,
        text: `${fs?.name ?? 'The farthest platform'} — the farthest platform off this coast, ${Math.round(this.farMiles)} miles from the sand, long past the blue line, alone.${fs?.operator ? ` ${fs.operator} crews` : ' Crews'} rotate out by helicopter, two weeks at a stretch. At night her flare is the only thing on the whole horizon that stays put, and the shrimpers steer home by her like a lit porch.`,
      },
    ];
    // lane cumulative lengths
    this.cum = [0];
    for (let i = 1; i < LANE.length; i++) {
      this.cum.push(this.cum[i - 1] + Math.hypot(LANE[i][0] - LANE[i - 1][0], LANE[i][1] - LANE[i - 1][1]));
    }
    this.len = this.cum[this.cum.length - 1];
  }

  // each leg: the real fairway points ordered sea→port, joined to the nearest
  // hand-laid lane vertex; a dedicated tanker works the longest leg in and out
  buildFairwayLegs() {
    const pts = GEO.energy.fairways.flatMap((f) => f.pts);
    const clusters = [];
    for (const p of pts) {
      const c = clusters.find((cl) => cl.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 150));
      if (c) c.push(p); else clusters.push([p]);
    }
    return clusters.map((c) => {
      c.sort((a, b) => coastDist(b[0], b[1]) - coastDist(a[0], a[1])); // seaward end first
      const out = c[0];
      const lv = LANE.reduce((b, v) =>
        (!b || Math.hypot(v[0] - out[0], v[1] - out[1]) < Math.hypot(b[0] - out[0], b[1] - out[1]) ? v : b), null);
      return [lv, ...c];
    });
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
    // The 227 real baked sites, instanced per component (traffic idiom — a
    // group per rig would cost ~2000 draw calls). Majors get the full rig
    // silhouette; minor clusters a lighter, lower build scaled down. The Far
    // Rig alone stays a bespoke group — bigger everything, helipad, its brass.
    const steel = new THREE.MeshLambertMaterial({ color: 0xb0a020, flatShading: true });
    const dark = new THREE.MeshLambertMaterial({ color: 0x4a4a52, flatShading: true });
    const flareMat = new THREE.MeshBasicMaterial({ color: 0xff8830 });
    this.platforms = GEO.energy.platforms; // site records — data, not groups
    const rest = this.platforms.filter((p) => p !== this.farSite);
    const nLegs = rest.length * 4;
    const legI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.35, 6, 8), dark, nLegs);
    const deckI = new THREE.InstancedMesh(new THREE.BoxGeometry(6.5, 0.7, 6.5), steel, rest.length);
    const modI = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 1.8, 2.4), dark, rest.length);
    const majors = rest.filter((p) => p.tier === 'major');
    const derrickI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.7, 5, 8), steel, majors.length);
    const flareI = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 6, 5), flareMat, majors.length);
    const glowI = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), this.rigGlow, rest.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const rnd = seededRand('rig:rebase');
    let li = 0, mi = 0;
    rest.forEach((p, i) => {
      const major = p.tier === 'major';
      const s = major ? 1 : 0.62;         // minor clusters read lower and lighter
      const deckY = major ? SEA + 5 : SEA + 3.6;
      const legS = (deckY - SEA + 1) / 6; // legs run seabed-side to deck (6-unit prototype)
      const rot = rnd() * Math.PI * 2;
      q.setFromAxisAngle(v.set(0, 1, 0), rot);
      const cr = Math.cos(rot), sr = Math.sin(rot);
      const at = (lx, ly, lz, sx = s, sy = s, sz = s) =>
        m.compose(v.set(p.x + (lx * cr + lz * sr) * s, ly, p.z + (-lx * sr + lz * cr) * s), q, sc.set(sx, sy, sz));
      for (const [lx, lz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
        legI.setMatrixAt(li++, at(lx, deckY - 3 * legS, lz, s, legS, s));
      }
      deckI.setMatrixAt(i, at(0, deckY, 0));
      modI.setMatrixAt(i, at(-1, deckY + 1.3 * s, -1));
      if (major) {
        derrickI.setMatrixAt(mi, at(1.8, deckY + 0.35 + 2.5, 1.5));
        flareI.setMatrixAt(mi, at(1.8, deckY + 0.35 + 5.4, 1.5));
        mi++;
      }
      // night glow at the top of the structure — from Malaquite the horizon
      // gets a skyline; minors glow smaller and lower
      glowI.setMatrixAt(i, major
        ? at(1.8, deckY + 0.35 + 5.4, 1.5, 1.5, 1.5, 1.5)
        : at(0, deckY + 0.8, 0, 0.9, 0.9, 0.9));
    });
    // W4 spill decals: warm glow pooled on the water under every platform —
    // flat circles floating above the one gulf plane (deck y-stagger, never a
    // second water plane); opacity rides ATMOS.night in update via spillMat.
    // vertex-colored radial falloff: rim fades to black, which under additive
    // blending IS transparent — soft pool edge with no extra material
    this.spillMat = new THREE.MeshBasicMaterial({ color: 0xff9040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, vertexColors: true });
    const spillGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
    fadeDisc(spillGeo);
    const spillI = new THREE.InstancedMesh(spillGeo, this.spillMat, rest.length);
    rest.forEach((p, i) => {
      const r = p.tier === 'major' ? 7 : 4;
      m.compose(v.set(p.x, -2.28, p.z), q.identity(), sc.set(r, 1, r));
      spillI.setMatrixAt(i, m);
    });
    for (const inst of [legI, deckI, modI, derrickI, flareI, glowI, spillI]) scene.add(inst);
    // W4 light pool: major work decks put real light on the water/deck at
    // close range (warm white); flare tips flicker orange. Minors stay
    // emissive-only — the pool only ever serves the nearest ~6 anchors.
    for (const p of rest) {
      if (p.tier !== 'major') continue;
      this.sky?.registerGlowAnchor({ x: p.x, z: p.z, y: SEA + 7, kind: 'rig' });
    }

    // the Far Rig — bespoke, upgraded: the farthest real major off the coast
    if (this.farSite) {
      const g = new THREE.Group();
      const s = 1.5;
      for (const [lx, lz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * s, 0.35 * s, 6, 8), dark);
        leg.position.set(lx * s, SEA + 2, lz * s);
        g.add(leg);
      }
      const deck = new THREE.Mesh(new THREE.BoxGeometry(6.5 * s, 0.7, 6.5 * s), steel);
      deck.position.y = SEA + 5;
      const mod = new THREE.Mesh(new THREE.BoxGeometry(3, 1.8, 2.4), dark);
      mod.position.set(-1 * s, SEA + 6.3, -1 * s);
      const derrick = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.7, 5 * s, 8), steel);
      derrick.position.set(1.8 * s, SEA + 5.35 + 2.5 * s, 1.5 * s);
      const flare = new THREE.Mesh(new THREE.SphereGeometry(0.3 * s, 6, 5), flareMat);
      flare.position.set(1.8 * s, SEA + 5.35 + 5 * s + 0.4, 1.5 * s);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 6), this.rigGlow);
      glow.position.copy(flare.position);
      const mod2 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 2.2), new THREE.MeshLambertMaterial({ color: 0xd8d0c0, flatShading: true }));
      mod2.position.set(-2.2, SEA + 6.7, 2.4);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.25, 8), dark);
      pad.position.set(3.6, SEA + 6.2, -3.4);
      const padLight = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 5), this.workGlow);
      padLight.position.set(3.6, SEA + 6.8, -3.4);
      g.add(deck, mod, derrick, flare, glow, mod2, pad, padLight);
      g.position.set(this.farSite.x, 0, this.farSite.z);
      g.userData.far = true;
      scene.add(g);
      this.farRig = g;
      // Far Rig: bigger spill + a flare-kind anchor at the flame itself
      const spill = new THREE.Mesh(fadeDisc(new THREE.CircleGeometry(11, 24).rotateX(-Math.PI / 2), 11), this.spillMat);
      spill.position.set(this.farSite.x, -2.26, this.farSite.z);
      scene.add(spill);
      this.sky?.registerGlowAnchor({ x: this.farSite.x + 1.8 * 1.5, z: this.farSite.z + 1.5 * 1.5, y: SEA + 5.35 + 5 * 1.5, kind: 'flare' });
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
    // port-approach tanker — works the longest fairway leg in and out
    const leg = this.fairwayLegs.reduce((b, l) => {
      const len = l.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - l[i - 1][0], p[1] - l[i - 1][1]) : 0), 0);
      return (!b || len > b.len) ? { pts: l, len } : b;
    }, null);
    if (leg) {
      const cum = [0];
      for (let i = 1; i < leg.pts.length; i++)
        cum.push(cum[i - 1] + Math.hypot(leg.pts[i][0] - leg.pts[i - 1][0], leg.pts[i][1] - leg.pts[i - 1][1]));
      const g = mkTanker();
      scene.add(g);
      ships.push({ g, leg: leg.pts, cum, len: leg.len, s: 0, dir: 1, speed: 2.2, lane: false });
    }
    return ships;
  }

  update(dt, t) {
    // night gate for every glow (rig flares, work lights, buoy lamp)
    this.rigGlow.opacity = ATMOS.night;
    this.workGlow.opacity = ATMOS.night;
    this.spillMat.opacity = ATMOS.night * 0.32;
    // the buoy bobs on the line
    this.buoy.position.y = Math.sin(t * 0.8) * 0.12;
    this.buoy.rotation.z = Math.sin(t * 0.55) * 0.06;
    for (const s of this.ships) {
      if (s.lane) {
        s.s += s.speed * s.dir * dt;
        const [x, z, dx, dz] = this.laneAt(s.s);
        s.g.position.set(x, Math.sin(t * 0.6 + s.s) * 0.06, z);
        s.g.rotation.y = Math.atan2(-dx * s.dir, -dz * s.dir);
      } else if (s.leg) {
        // approach tanker pingpongs its fairway leg — never leaves the channel
        s.s += s.speed * s.dir * dt;
        if (s.s >= s.len) { s.s = s.len; s.dir = -1; }
        if (s.s <= 0) { s.s = 0; s.dir = 1; }
        let lo = 0;
        while (lo < s.cum.length - 2 && s.cum[lo + 1] <= s.s) lo++;
        const a = s.leg[lo], b = s.leg[lo + 1];
        const seg = s.cum[lo + 1] - s.cum[lo] || 1;
        const f = (s.s - s.cum[lo]) / seg;
        const dx = (b[0] - a[0]) / seg, dz = (b[1] - a[1]) / seg;
        s.g.position.set(a[0] + (b[0] - a[0]) * f, Math.sin(t * 0.6 + s.s) * 0.06, a[1] + (b[1] - a[1]) * f);
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
