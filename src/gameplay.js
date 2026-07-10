// Gameplay: city visits, landmarks, yellow roses, critter log. Progress in localStorage.
// (NPCs live in npcs.js.)
import * as THREE from 'three';
import { GEO, seededRand, nearestCity } from './geo.js';
import { mkStarMesh } from './vehicle.js';
import { cityRadius } from './cities.js';
import { merge, tinted } from './traffic.js';

const SAVE_KEY = 'lonestar-roam-save-v1';

// Real landmarks at real coordinates (projected same as pipeline: 1u=100m, center 31N 99.5W)
const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];
export const LANDMARKS = [
  { name: 'The Alamo', at: LL(29.4260, -98.4861), kind: 'alamo', fact: 'Built 1718; site of the 1836 battle for Texas independence.' },
  { name: 'Texas State Capitol', at: LL(30.2747, -97.7404), kind: 'capitol', fact: 'Taller than the US Capitol — of course it is.' },
  { name: 'Reunion Tower', at: LL(32.7756, -96.8089), kind: 'tower', fact: 'Dallas’ glowing ball, 561 ft up.' },
  { name: 'San Jacinto Monument', at: LL(29.7497, -95.0806), kind: 'obelisk', fact: 'World’s tallest war memorial — where Texas won independence in 18 minutes.' },
  { name: 'Space Center Houston', at: LL(29.5519, -95.0970), kind: 'rocket', fact: '"Houston" was the first word spoken from the Moon.' },
  { name: 'Cadillac Ranch', at: LL(35.1872, -101.9871), kind: 'cadillac', fact: 'Ten Cadillacs nose-down in a Panhandle field since 1974.' },
  { name: 'Big Bend', at: LL(29.2498, -103.2502), kind: 'canyon', fact: 'The Rio Grande’s great curve; darkest night skies in the lower 48.' },
  { name: 'Palo Duro Canyon', at: LL(34.9372, -101.6589), kind: 'canyon', fact: 'Second-largest canyon in the USA, hiding in the flat Panhandle.' },
  { name: 'Enchanted Rock', at: LL(30.5064, -98.8198), kind: 'dome', fact: 'A giant pink granite dome that creaks and groans at night.' },
  { name: 'Marfa Lights', at: LL(30.2892, -103.8543), kind: 'lights', fact: 'Mysterious orbs seen over the desert since the 1880s.' },
  { name: 'Fort Worth Stockyards', at: LL(32.7893, -97.3465), kind: 'longhorn', fact: 'Twice-daily longhorn cattle drive, every day since 1999.' },
  { name: 'Galveston Pleasure Pier', at: LL(29.2854, -94.7905), kind: 'ferris', fact: 'A ferris wheel over the Gulf of Mexico.' },
  { name: 'Padre Island', at: LL(26.5940, -97.2780), kind: 'beach', fact: 'Longest undeveloped barrier island in the world.' },
  { name: 'El Paso Star', at: LL(31.8046, -106.4820), kind: 'star', fact: 'A 459-ft lit star on the Franklin Mountains.' },
  { name: 'Buc-ee’s New Braunfels', at: LL(29.7377, -98.0857), kind: 'beaver', fact: 'World’s largest convenience store — and famously spotless restrooms.' },
  { name: 'Stonehenge II', at: LL(30.0772, -99.3005), kind: 'henge', fact: 'A Hill Country Stonehenge replica, built on a whim in 1989.' },
  { name: 'World’s Largest Fire Hydrant', at: LL(30.0860, -94.1018), kind: 'hydrant', fact: '24 feet of Dalmatian-spotted hydrant outside Beaumont’s Fire Museum.' },
  { name: 'Paisano Pete', at: LL(30.8940, -102.8720), kind: 'pete', fact: 'An 11-ft roadrunner, greeting Fort Stockton travelers since 1979.' },
];
export const LANDMARK_COUNT = LANDMARKS.length;

export class Gameplay {
  constructor(scene) {
    this.scene = scene;
    this.save = JSON.parse(localStorage.getItem(SAVE_KEY) || '{"cities":[],"landmarks":[],"roses":[]}');
    this.save.species ??= []; // added later — default for older saves
    this.save.stats ??= { dist: 0, time: 0, top: 0 }; // km real, seconds, mph
    this.saveTimer = 0;
    this.onToast = null;

    this.cityStars = this.mkCityStars();
    this.roseSystem = this.mkRoses();
    this.landmarkGroup = this.mkLandmarks();
    this.t = 0;
  }

  counts() {
    return {
      cities: this.save.cities.length, landmarks: this.save.landmarks.length,
      roses: this.save.roses.length, species: this.save.species.length,
    };
  }

  spotSpecies(key, label, total) {
    if (this.save.species.includes(key)) return;
    this.save.species.push(key);
    this.persist();
    this.onToast?.(`🦌 ${label} spotted! (${this.save.species.length}/${total})`);
    this.onCollect?.('species');
  }

  persist() { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); }

  // --- City stars: golden star + glow halo hovering over each unvisited downtown ---
  mkCityStars() {
    const group = new THREE.Group();
    const haloTex = mkHaloTexture();
    for (const c of GEO.cities) {
      if (this.save.cities.includes(c.name)) continue;
      const star = mkStarMesh(2.2, 0xffd35c);
      star.position.set(c.x, 14 + cityRadius(c.pop) * 0.15, c.z);
      star.userData.city = c.name;
      star.userData.baseY = star.position.y;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: haloTex, color: 0xffd35c, transparent: true, opacity: 0.5, depthWrite: false,
      }));
      halo.scale.set(9, 9, 1);
      star.add(halo);
      group.add(star);
    }
    this.scene.add(group);
    return group;
  }

  // --- Yellow roses scattered along real highways ---
  mkRoses() {
    const rand = seededRand('yellow-rose');
    const spots = [];
    // motorway/trunk only — scatter must stay identical across data updates or saved rose indices break
    const hws = GEO.highways.filter((h) => (h.type === 'motorway' || h.type === 'trunk') && h.pts.length > 4);
    while (spots.length < 300) {
      const h = hws[Math.floor(rand() * hws.length)];
      const i = 1 + Math.floor(rand() * (h.pts.length - 1));
      const [x, z] = h.pts[i];
      spots.push([x + (rand() - 0.5) * 3, z + (rand() - 0.5) * 3]);
    }
    // an actual rose: stem + leaf + layered bloom (one merged vertex-colored geometry)
    const geo = merge([
      tinted(new THREE.CylinderGeometry(0.05, 0.07, 1.0, 5).translate(0, 0.5, 0), 0x3a7a3a),
      tinted(new THREE.BoxGeometry(0.3, 0.04, 0.14).translate(0.18, 0.55, 0), 0x4a8a45),
      tinted(new THREE.IcosahedronGeometry(0.42, 0).translate(0, 1.15, 0), 0xffdf3c),
      tinted(new THREE.IcosahedronGeometry(0.22, 0).translate(0, 1.42, 0), 0xffb820),
    ]);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x403000, flatShading: true });
    const inst = new THREE.InstancedMesh(geo, mat, spots.length);
    // soft glow layer sharing the same matrices
    const glow = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.62, 8, 6).translate(0, 1.2, 0),
      new THREE.MeshBasicMaterial({ color: 0xffe36a, transparent: true, opacity: 0.22, depthWrite: false }),
      spots.length
    );
    const m = new THREE.Matrix4();
    this.roseSpots = spots.map(([x, z], i) => {
      const taken = this.save.roses.includes(i);
      m.makeScale(taken ? 0.001 : 1, taken ? 0.001 : 1, taken ? 0.001 : 1).setPosition(x, 0, z);
      inst.setMatrixAt(i, m);
      glow.setMatrixAt(i, m);
      return { x, z, i, taken, phase: (x * 7 + z * 3) % 6.28 };
    });
    this.scene.add(inst, glow);
    this.roseGlow = glow;
    return inst;
  }

  // --- Landmark monuments — distinctive low-poly shapes + beacons ---
  mkLandmarks() {
    const group = new THREE.Group();
    for (const lm of LANDMARKS) {
      const g = mkLandmarkMesh(lm.kind);
      g.position.set(lm.at[0], 0, lm.at[1]);
      // beacon: tall thin light column, dimmed if collected
      const done = this.save.landmarks.includes(lm.name);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 120, 6, 1, true),
        new THREE.MeshBasicMaterial({ color: done ? 0x557755 : 0x66ddff, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
      );
      beam.position.y = 60;
      g.add(beam);
      (this.beams ??= []).push(beam);
      g.userData.lm = lm;
      if (lm.kind === 'lights') this.marfa = g; // the orbs only show after dark
      group.add(g);
    }
    this.scene.add(group);
    return group;
  }

  // quick expanding golden ring at a collect point
  burst(x, y, z) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.85, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffd35c, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.position.set(x, y, z);
    this.scene.add(ring);
    (this.bursts ??= []).push({ ring, age: 0 });
  }

  update(dt, pos, night = 0, speed = 0) {
    this.t += dt;

    // play stats (1 game unit = 100 m real; speed*2.4 matches the HUD mph)
    const st = this.save.stats;
    st.time += dt;
    st.dist += Math.abs(speed) * dt * 0.1;
    st.top = Math.max(st.top, Math.abs(Math.round(speed * 2.4)));
    this.saveTimer += dt;
    if (this.saveTimer > 20) { this.saveTimer = 0; this.persist(); }

    // collect bursts: expand and fade
    if (this.bursts) {
      for (const b of this.bursts) {
        b.age += dt;
        const s = 1 + b.age * 14;
        b.ring.scale.set(s, 1, s);
        b.ring.material.opacity = Math.max(0, 0.85 * (1 - b.age / 0.7));
        if (b.age > 0.7) { this.scene.remove(b.ring); b.ring.geometry.dispose(); b.ring.material.dispose(); }
      }
      this.bursts = this.bursts.filter((b) => b.age <= 0.7);
    }

    // landmark beacons pulse
    if (this.beams) this.beams.forEach((b, i) => (b.material.opacity = 0.18 + 0.1 * Math.sin(this.t * 2 + i)));

    // roses near the player bob and spin (matrices touched only within range)
    const m4 = this.tmpM4 ??= new THREE.Matrix4();
    const q4 = this.tmpQ4 ??= new THREE.Quaternion();
    const up = this.tmpUp ??= new THREE.Vector3(0, 1, 0);
    let roseDirty = false;
    for (const r of this.roseSpots) {
      if (r.taken) continue;
      const d2 = (r.x - pos.x) ** 2 + (r.z - pos.z) ** 2;
      if (d2 > 200 * 200) continue;
      q4.setFromAxisAngle(up, this.t * 1.6 + r.phase);
      m4.compose(
        new THREE.Vector3(r.x, Math.sin(this.t * 2 + r.phase) * 0.12, r.z),
        q4, new THREE.Vector3(1, 1, 1)
      );
      this.roseSystem.setMatrixAt(r.i, m4);
      this.roseGlow.setMatrixAt(r.i, m4);
      roseDirty = true;
    }
    if (roseDirty) {
      this.roseSystem.instanceMatrix.needsUpdate = true;
      this.roseGlow.instanceMatrix.needsUpdate = true;
    }
    // stars spin and bob
    for (const s of this.cityStars.children) {
      s.rotation.y = this.t * 1.2;
      s.position.y = s.userData.baseY + Math.sin(this.t * 1.4 + s.userData.baseY) * 0.8;
    }

    // Marfa Lights: mysterious orbs, night only, gently drifting
    if (this.marfa) {
      const orbsOn = night > 0.55;
      for (let i = 0; i < 3; i++) {
        const orb = this.marfa.children[i];
        orb.visible = orbsOn;
        if (orbsOn) orb.position.y = 3 + i + Math.sin(this.t * 0.8 + i * 2.1) * 1.2;
      }
    }

    // city visit check (must be near ground level)
    if (pos.y < 12) {
      const { city, dist } = nearestCity(pos.x, pos.z);
      if (city && dist < Math.max(6, cityRadius(city.pop) * 0.5) && !this.save.cities.includes(city.name)) {
        this.save.cities.push(city.name);
        this.persist();
        const star = this.cityStars.children.find((s) => s.userData.city === city.name);
        if (star) this.cityStars.remove(star);
        this.onToast?.(`⭐ ${city.name} visited! (${this.save.cities.length}/132)`);
        this.onCollect?.('city');
        this.burst(pos.x, pos.y + 1.5, pos.z);
      }
    }

    // roses
    const m = new THREE.Matrix4();
    for (const r of this.roseSpots) {
      if (r.taken) continue;
      const d = (r.x - pos.x) ** 2 + (r.z - pos.z) ** 2;
      if (d < 9 && pos.y < 6) {
        r.taken = true;
        this.save.roses.push(r.i);
        this.persist();
        m.makeScale(0.001, 0.001, 0.001).setPosition(r.x, 0, r.z);
        this.roseSystem.setMatrixAt(r.i, m);
        this.roseGlow.setMatrixAt(r.i, m);
        this.roseSystem.instanceMatrix.needsUpdate = true;
        this.roseGlow.instanceMatrix.needsUpdate = true;
        this.onToast?.(`🌹 Yellow rose (${this.save.roses.length}/300)`);
        this.onCollect?.('rose');
        this.burst(r.x, 1.2, r.z);
      }
    }

    // landmarks
    for (const g of this.landmarkGroup.children) {
      const lm = g.userData.lm;
      if (this.save.landmarks.includes(lm.name)) continue;
      const d = (g.position.x - pos.x) ** 2 + (g.position.z - pos.z) ** 2;
      if (d < 20 * 20 && pos.y < 25) {
        this.save.landmarks.push(lm.name);
        this.persist();
        g.children[g.children.length - 1].material.color.set(0x557755);
        this.onToast?.(`🏛 ${lm.name} — ${lm.fact}`);
        this.onCollect?.('landmark');
        this.burst(g.position.x, 2, g.position.z);
      }
    }

  }
}

// radial-gradient glow sprite texture (shared by all star halos)
function mkHaloTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,220,110,0.9)');
  g.addColorStop(0.4, 'rgba(255,210,92,0.28)');
  g.addColorStop(1, 'rgba(255,210,92,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function mkLandmarkMesh(kind) {
  const g = new THREE.Group();
  const stone = new THREE.MeshLambertMaterial({ color: 0xd8cbb0, flatShading: true });
  const add = (mesh) => (g.add(mesh), mesh);
  switch (kind) {
    case 'alamo': {
      const front = add(new THREE.Mesh(new THREE.BoxGeometry(6, 4, 1), stone));
      front.position.y = 2;
      const hump = add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1, 12, 1, false, 0, Math.PI), stone));
      hump.rotation.z = Math.PI / 2; hump.rotation.y = Math.PI / 2;
      hump.position.set(0, 4, 0);
      break;
    }
    case 'capitol': {
      const base = add(new THREE.Mesh(new THREE.BoxGeometry(8, 3, 4), new THREE.MeshLambertMaterial({ color: 0xd8a8a0 })));
      base.position.y = 1.5;
      const dome = add(new THREE.Mesh(new THREE.SphereGeometry(1.8, 10, 8), new THREE.MeshLambertMaterial({ color: 0xd8a8a0 })));
      dome.position.y = 4.5;
      break;
    }
    case 'tower': {
      const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 14, 8), stone));
      pole.position.y = 7;
      const ball = add(new THREE.Mesh(new THREE.SphereGeometry(1.7, 8, 6), new THREE.MeshLambertMaterial({ color: 0x88ddff, emissive: 0x2266aa })));
      ball.position.y = 14.5;
      break;
    }
    case 'obelisk': {
      const shaft = add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 17, 1.2), stone));
      shaft.position.y = 8.5;
      const star = mkStarMesh(1.2, 0xffd35c);
      star.position.y = 17.8; g.add(star);
      break;
    }
    case 'rocket': {
      const body = add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 10, 10), new THREE.MeshLambertMaterial({ color: 0xeeeeee })));
      body.position.y = 5;
      const nose = add(new THREE.Mesh(new THREE.ConeGeometry(0.9, 2, 10), new THREE.MeshLambertMaterial({ color: 0xcc3333 })));
      nose.position.y = 11;
      break;
    }
    case 'cadillac': {
      for (let i = 0; i < 5; i++) {
        const car = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.6, 0.5), new THREE.MeshLambertMaterial({ color: [0xcc4444, 0x44cc88, 0x4488cc, 0xcccc44, 0xcc44cc][i] })));
        car.position.set(i * 1.6 - 3.2, 1.1, 0);
        car.rotation.x = -0.5;
      }
      break;
    }
    case 'canyon': {
      const mat = new THREE.MeshLambertMaterial({ color: 0xb5643c, flatShading: true });
      for (let i = 0; i < 4; i++) {
        const mesa = add(new THREE.Mesh(new THREE.CylinderGeometry(2 + i, 2.8 + i, 3 + (i % 2) * 2, 7), mat));
        mesa.position.set(i * 5 - 8, (3 + (i % 2) * 2) / 2, (i % 2) * 4 - 2);
      }
      break;
    }
    case 'dome': {
      const dome = add(new THREE.Mesh(new THREE.SphereGeometry(6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xd88a80, flatShading: true })));
      dome.position.y = 0;
      break;
    }
    case 'lights': {
      for (let i = 0; i < 3; i++) {
        const orb = add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xaaffee })));
        orb.position.set(i * 2 - 2, 3 + i, 0);
      }
      break;
    }
    case 'longhorn': {
      const body = add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 1), new THREE.MeshLambertMaterial({ color: 0x8a5a3a })));
      body.position.y = 1.1;
      const horns = add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 3.4, 6), stone));
      horns.rotation.z = Math.PI / 2;
      horns.position.set(-1.3, 1.9, 0);
      break;
    }
    case 'ferris': {
      const wheel = add(new THREE.Mesh(new THREE.TorusGeometry(4, 0.25, 8, 18), new THREE.MeshLambertMaterial({ color: 0xdd5588 })));
      wheel.position.y = 5;
      break;
    }
    case 'beach': {
      const sand = add(new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.4, 12), new THREE.MeshLambertMaterial({ color: 0xe8d8a8 })));
      sand.position.y = 0.2;
      const palm = mkPalm(); palm.position.set(2, 0, 1); g.add(palm);
      break;
    }
    case 'star': {
      const star = mkStarMesh(3, 0xffee88);
      star.position.y = 8; g.add(star);
      const hill = add(new THREE.Mesh(new THREE.ConeGeometry(9, 7, 7), new THREE.MeshLambertMaterial({ color: 0x9a7a58, flatShading: true })));
      hill.position.y = 3.5;
      break;
    }
    case 'beaver': {
      const fur = new THREE.MeshLambertMaterial({ color: 0x8a5a30, flatShading: true });
      const belly = add(new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), fur));
      belly.position.y = 1.8; belly.scale.set(1, 1.25, 0.8);
      const head = add(new THREE.Mesh(new THREE.SphereGeometry(1.0, 8, 6), fur));
      head.position.y = 4.0;
      const teeth = add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.15), new THREE.MeshLambertMaterial({ color: 0xfff8e0 })));
      teeth.position.set(0, 3.55, -0.85);
      const cap = add(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.4, 10), new THREE.MeshLambertMaterial({ color: 0xcc2222 })));
      cap.position.y = 4.85;
      // the roadside sign
      const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8, 6), stone));
      pole.position.set(3, 4, 0);
      const disc = add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.2, 12).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xffd35c })));
      disc.position.set(3, 8.2, 0);
      break;
    }
    case 'henge': {
      const rock = new THREE.MeshLambertMaterial({ color: 0x9a9288, flatShading: true });
      const R = 5.5, n = 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const slab = add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.2, 0.7), rock));
        slab.position.set(Math.cos(a) * R, 1.6, Math.sin(a) * R);
        slab.rotation.y = -a;
        if (i % 2 === 0) { // lintels across alternating pairs
          const lin = add(new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.6, 0.8), rock));
          const a2 = a + Math.PI / n;
          lin.position.set(Math.cos(a2) * R, 3.5, Math.sin(a2) * R);
          lin.rotation.y = -a2;
        }
      }
      break;
    }
    case 'hydrant': {
      const white = new THREE.MeshLambertMaterial({ color: 0xf2f2f0, flatShading: true });
      const black = new THREE.MeshLambertMaterial({ color: 0x222222 });
      const body = add(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 5, 10), white));
      body.position.y = 2.5;
      const dome = add(new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), white));
      dome.position.y = 5;
      const cap = add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 8), black));
      cap.position.y = 5.9;
      for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { // side nozzles
        const noz = add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.9, 8).rotateZ(Math.PI / 2), black));
        noz.position.set(Math.cos(a) * 1.35, 3.4, Math.sin(a) * 1.35);
        noz.rotation.y = -a;
      }
      break;
    }
    case 'pete': {
      // giant roadrunner statue — Fort Stockton's finest
      const feathers = new THREE.MeshLambertMaterial({ color: 0x6a6250, flatShading: true });
      const body = add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 2, 4), feathers));
      body.position.y = 3.2;
      const neckHead = add(new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 1.6), feathers));
      neckHead.position.set(0, 5.2, -2.4);
      const beak = add(new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.6, 6).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3a3a30 })));
      beak.position.set(0, 5.2, -3.9);
      const tail = add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 3, 3.4), feathers));
      tail.position.set(0, 4.6, 2.8);
      tail.rotation.x = -0.65;
      for (const x of [-0.5, 0.5]) {
        const leg = add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.4, 6), new THREE.MeshLambertMaterial({ color: 0x3a3a30 })));
        leg.position.set(x, 1.1, 0);
      }
      break;
    }
  }
  return g;
}

function mkPalm() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 3.4, 6), new THREE.MeshLambertMaterial({ color: 0x9a7a4a }));
  trunk.position.y = 1.7;
  g.add(trunk);
  for (let i = 0; i < 5; i++) {
    const frond = new THREE.Mesh(new THREE.BoxGeometry(2, 0.06, 0.5), new THREE.MeshLambertMaterial({ color: 0x3a8a3a }));
    frond.position.y = 3.4;
    frond.rotation.y = (i / 5) * Math.PI * 2;
    frond.translateX(0.8);
    frond.rotation.z = -0.35;
    g.add(frond);
  }
  return g;
}

