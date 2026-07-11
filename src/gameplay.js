// Gameplay: city visits, landmarks, yellow roses, critter log. Progress in localStorage.
// (NPCs live in npcs.js.)
import * as THREE from 'three';
import { GEO, seededRand, nearestCity, hAt } from './geo.js';
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
  { name: 'Palo Duro Canyon', at: LL(34.9372, -101.6589), kind: 'hoodoo', fact: 'Second-largest canyon in the USA, hiding in the flat Panhandle.' },
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
  { name: 'Prada Marfa', at: LL(30.6039, -104.7367), kind: 'prada', fact: 'A fake Prada boutique alone in the desert since 2005. Art, not retail — the door never opens.' },
  { name: 'Eiffel Tower of Paris, TX', at: LL(33.6609, -95.5455), kind: 'eiffel', fact: 'Paris, Texas built its own Eiffel Tower — and topped it with a red cowboy hat.' },
  { name: 'Dinosaur Valley', at: LL(32.2465, -97.8130), kind: 'dino', fact: '113-million-year-old dinosaur tracks in the Paluxy riverbed at Glen Rose.' },
  { name: 'AT&T Stadium', at: LL(32.7473, -97.0945), kind: 'stadium', fact: 'Jerry World — its arches are among the longest single-span roofs on Earth.' },
  { name: 'The Astrodome', at: LL(29.6847, -95.4107), kind: 'astrodome', fact: 'The Eighth Wonder of the World — first domed stadium, birthplace of AstroTurf.' },
  { name: 'World’s Largest Cowboy Boots', at: LL(29.6042, -98.4919), kind: 'boots', fact: '35-foot ostrich-skin boots guarding a San Antonio mall since 1979.' },
];
export const LANDMARK_COUNT = LANDMARKS.length;

export class Gameplay {
  constructor(scene) {
    this.scene = scene;
    this.save = JSON.parse(localStorage.getItem(SAVE_KEY) || '{"cities":[],"landmarks":[],"roses":[]}');
    this.save.species ??= []; // added later — default for older saves
    this.save.stats ??= { dist: 0, time: 0, top: 0 }; // km real, seconds, mph
    this.save.counties ??= [];
    this.save.ufo ??= 0;
    this.save.bank ??= 0;      // delivery earnings — pure score for now
    this.save.jobsDone ??= 0;
    this.save.job ??= null;    // active delivery, serialized by missions.js
    this.save.gear ??= {};     // shop purchase levels by item id (shop.js)
    this.saveTimer = 0;
    this.countyNow = null;
    this.countyToastT = 0;
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
      counties: this.save.counties.length, bank: this.save.bank,
    };
  }

  // called at HUD rate with the current county name (or null outside Texas)
  enterCounty(name, dt) {
    this.countyToastT -= dt;
    if (!name || name === this.countyNow) return;
    this.countyNow = name;
    if (this.save.counties.includes(name)) return;
    this.save.counties.push(name); // always counts —
    this.persist();
    if (this.countyToastT > 0) return; // — but boundary zigzags only toast once
    this.countyToastT = 6;
    this.onToast?.(`🗺 ${name} County (${this.save.counties.length}/254)`);
    this.onCollect?.('county');
  }

  ufoSighting() {
    this.save.ufo++;
    this.persist();
    this.onToast?.(this.save.ufo === 1 ? '\u{1F47D} You saw something out there\u2026' : `\u{1F47D} Another sighting\u2026 (${this.save.ufo})`);
    this.onCollect?.('species');
  }

  spotSpecies(key, label, total, fact) {
    if (this.save.species.includes(key)) return;
    this.save.species.push(key);
    this.persist();
    this.onToast?.(`🦌 ${label} (${this.save.species.length}/${total})${fact ? ` — ${fact}` : ''}`);
    this.onCollect?.('species');
  }

  persist() { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); }

  // nearest landmark within range — for reading its historical marker (E)
  landmarkNear(pos, range = 16) {
    let best = null, bd = range * range;
    for (const g of this.landmarkGroup.children) {
      const d = (g.position.x - pos.x) ** 2 + (g.position.z - pos.z) ** 2;
      if (d < bd) { bd = d; best = g.userData.lm; }
    }
    return best;
  }

  // --- City stars: golden star + glow halo hovering over each unvisited downtown ---
  mkCityStars() {
    const group = new THREE.Group();
    const haloTex = mkHaloTexture();
    for (const c of GEO.cities) {
      if (this.save.cities.includes(c.name)) continue;
      const star = mkStarMesh(2.2, 0xffd35c);
      star.position.set(c.x, hAt(c.x, c.z) + 14 + cityRadius(c.pop) * 0.15, c.z);
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
      const gy = hAt(x, z);
      m.makeScale(taken ? 0.001 : 1, taken ? 0.001 : 1, taken ? 0.001 : 1).setPosition(x, gy, z);
      inst.setMatrixAt(i, m);
      glow.setMatrixAt(i, m);
      return { x, z, i, taken, gy, phase: (x * 7 + z * 3) % 6.28 };
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
      g.position.set(lm.at[0], hAt(lm.at[0], lm.at[1]), lm.at[1]);
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
      if (g.userData.spin) (this.lmSpins ??= []).push(g.userData.spin);
      if (g.userData.nightMats) (this.lmNightMats ??= []).push(...g.userData.nightMats);
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
    const agl = pos.y - hAt(pos.x, pos.z); // height above ground, not sea level
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
    if (this.lmSpins) for (const w of this.lmSpins) w.rotation.z = this.t * 0.35; // the ferris wheel turns
    if (this.lmNightMats) for (const m of this.lmNightMats) m.emissiveIntensity = 0.1 + night * 0.9;

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
        new THREE.Vector3(r.x, r.gy + Math.sin(this.t * 2 + r.phase) * 0.12, r.z),
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
    if (agl < 12) {
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
      if (d < 9 && agl < 6) {
        r.taken = true;
        this.save.roses.push(r.i);
        this.persist();
        m.makeScale(0.001, 0.001, 0.001).setPosition(r.x, r.gy, r.z);
        this.roseSystem.setMatrixAt(r.i, m);
        this.roseGlow.setMatrixAt(r.i, m);
        this.roseSystem.instanceMatrix.needsUpdate = true;
        this.roseGlow.instanceMatrix.needsUpdate = true;
        this.onToast?.(`🌹 Yellow rose (${this.save.roses.length}/300)`);
        this.onCollect?.('rose');
        this.burst(r.x, r.gy + 1.2, r.z);
      }
    }

    // landmarks
    for (const g of this.landmarkGroup.children) {
      const lm = g.userData.lm;
      if (this.save.landmarks.includes(lm.name)) continue;
      const d = (g.position.x - pos.x) ** 2 + (g.position.z - pos.z) ** 2;
      if (d < 20 * 20 && agl < 25) {
        this.save.landmarks.push(lm.name);
        this.persist();
        g.children[g.children.length - 1].material.color.set(0x557755);
        this.onToast?.(`🏛 ${lm.name} — ${lm.fact}`);
        this.onCollect?.('landmark');
        this.burst(g.position.x, g.position.y + 2, g.position.z);
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
  const box = (w, h, d, x, y, z, m) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    g.add(b);
    return b;
  };
  switch (kind) {
    case 'alamo': {
      const lime = new THREE.MeshLambertMaterial({ color: 0xd8c9a8, flatShading: true });
      box(4.2, 3.6, 1.2, 0, 1.8, 0, lime);                       // chapel front
      // the famous curved gable
      const hump = add(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.15, 14, 1, false, 0, Math.PI), lime));
      hump.rotation.z = Math.PI / 2; hump.rotation.y = Math.PI / 2;
      hump.position.set(0, 3.6, 0);
      box(1.1, 1.8, 0.3, 0, 0.9, -0.65, new THREE.MeshLambertMaterial({ color: 0x4a3828 })); // door
      box(2.6, 2.4, 5, -3.3, 1.2, 1.6, lime);                    // side wings
      box(2.6, 2.4, 5, 3.3, 1.2, 1.6, lime);
      box(9, 1.2, 0.4, 0, 0.6, 3.8, lime);                       // courtyard wall
      break;
    }
    case 'capitol': {
      const granite = new THREE.MeshLambertMaterial({ color: 0xd8a8a0, flatShading: true });
      box(11, 2.6, 4, 0, 1.3, 0, granite);                        // main bar
      box(3.6, 2.6, 8, 0, 1.3, 0, granite);                       // cross wing
      for (const x of [-1.1, -0.55, 0, 0.55, 1.1]) {              // portico columns
        const col = add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.2, 6), stone));
        col.position.set(x, 1.1, -4.1);
      }
      const drum = add(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 1.6, 12), granite));
      drum.position.y = 3.4;
      const dome = add(new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), granite));
      dome.position.y = 4.2;
      const gl = add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), new THREE.MeshLambertMaterial({ color: 0xf0e8d8 })));
      gl.position.y = 5.9;                                        // Goddess of Liberty
      break;
    }
    case 'tower': {
      for (const a of [0, 2.09, 4.19]) {                          // three support columns
        const leg = add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 14, 6), stone));
        leg.position.set(Math.cos(a) * 0.8, 7, Math.sin(a) * 0.8);
      }
      const ballMat = new THREE.MeshLambertMaterial({ color: 0x445566, emissive: 0x66ddff, emissiveIntensity: 0.15, flatShading: true });
      const ball = add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 1), ballMat));
      ball.position.y = 14.8;
      g.userData.nightMats = [ballMat];                           // sparkles after dark
      break;
    }
    case 'obelisk': {
      // reflecting pool — the monument's mirror
      const pool = add(new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.15, 14), new THREE.MeshLambertMaterial({ color: 0x2e6f9e })));
      pool.position.set(0, 0.12, 9.5);
      const shaft = add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.05, 17, 4), stone));
      shaft.position.y = 8.5;
      shaft.rotation.y = Math.PI / 4;
      box(2.6, 1.4, 2.6, 0, 0.7, 0, stone);                        // base
      const star = mkStarMesh(1.2, 0xffd35c);
      star.position.y = 17.8; g.add(star);
      break;
    }
    case 'rocket': {
      // the Saturn V lies on its side at Rocket Park
      const white = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
      const black = new THREE.MeshLambertMaterial({ color: 0x222222 });
      const body = add(new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 14, 12).rotateZ(Math.PI / 2), white));
      body.position.set(0, 1.6, 0);
      for (const x of [-4.6, 0.4, 4.2]) {                          // interstage rings
        const ring = add(new THREE.Mesh(new THREE.CylinderGeometry(0.98, 0.98, 0.5, 12).rotateZ(Math.PI / 2), black));
        ring.position.set(x, 1.6, 0);
      }
      const nose = add(new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 10).rotateZ(-Math.PI / 2), black));
      nose.position.set(8.2, 1.6, 0);
      for (const x of [-3.4, 0, 3.4]) box(0.5, 1.2, 0.5, x, 0.6, 0.9, stone); // display cradles
      for (let i = 0; i < 4; i++) {                                // F-1 engine bells
        const a = (i / 4) * Math.PI * 2;
        const bell = add(new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 8).rotateZ(Math.PI / 2), black));
        bell.position.set(-7.6, 1.6 + Math.sin(a) * 0.55, Math.cos(a) * 0.55);
      }
      break;
    }
    case 'cadillac': {
      for (let i = 0; i < 5; i++) {
        const car = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.8, 0.5), new THREE.MeshLambertMaterial({ color: [0xcc4444, 0x44cc88, 0x4488cc, 0xcccc44, 0xcc44cc][i] })));
        car.position.set(i * 1.6 - 3.2, 1.0, 0);
        car.rotation.x = -0.62;                                    // half-buried nose-down
        const blot = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshLambertMaterial({ color: [0xffffff, 0x222222, 0xff8800][i % 3] })));
        blot.position.set(i * 1.6 - 3.2, 1.6, -0.3);
      }
      break;
    }
    case 'canyon': {
      // Santa Elena: two sheer walls with the river slipping between
      const rock = new THREE.MeshLambertMaterial({ color: 0xb5643c, flatShading: true });
      box(7, 9, 2.4, -4.6, 4.5, 0, rock);
      box(7, 8.4, 2.4, 4.6, 4.2, 0, rock);
      const river = add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 12), new THREE.MeshLambertMaterial({ color: 0x2e6f9e })));
      river.position.set(0, 0.1, 0);
      break;
    }
    case 'hoodoo': {
      // the Palo Duro Lighthouse
      const rock = new THREE.MeshLambertMaterial({ color: 0xc27a4a, flatShading: true });
      const spire = add(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.9, 7, 7), rock));
      spire.position.y = 3.5;
      const cap = add(new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.3, 1.6, 7), rock));
      cap.position.y = 7.8;
      const base = add(new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.6, 2.4, 8), new THREE.MeshLambertMaterial({ color: 0xa5643c, flatShading: true })));
      base.position.y = 1.2;
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
      // a small drive behind fencing
      const bone = new THREE.MeshLambertMaterial({ color: 0xe8dcc0 });
      for (let i = 0; i < 3; i++) {
        const hide = new THREE.MeshLambertMaterial({ color: [0x8a5a3a, 0xb08a62, 0x6a4a32][i] });
        const ox = i * 2.6 - 2.6, oz = (i % 2) * 1.6;
        box(1.1, 0.9, 2.2, ox, 1.15, oz, hide);
        box(0.5, 0.5, 0.65, ox, 1.55, oz - 1.3, hide);
        const horns = add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 2.6, 6).rotateZ(Math.PI / 2), bone));
        horns.position.set(ox, 1.9, oz - 1.3);
        for (const [lx, lz] of [[-0.35, -0.7], [0.35, -0.7], [-0.35, 0.7], [0.35, 0.7]])
          box(0.16, 0.75, 0.16, ox + lx, 0.4, oz + lz, hide);
      }
      const rail = new THREE.MeshLambertMaterial({ color: 0x6a4a2f });
      for (const z of [-2.6, 2.9]) { box(9, 0.12, 0.12, 0, 1.0, z, rail); box(9, 0.12, 0.12, 0, 0.5, z, rail); }
      break;
    }
    case 'ferris': {
      // proper wheel: spokes, gondolas, A-frame, pier deck
      const deck = add(new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 5), new THREE.MeshLambertMaterial({ color: 0x8a6f4d })));
      deck.position.y = 1.6;
      for (const [x, z] of [[-4, -2], [4, -2], [-4, 2], [4, 2]]) box(0.35, 1.8, 0.35, x, 0.7, z, stone);
      const wheel = new THREE.Group();
      const pink = new THREE.MeshLambertMaterial({ color: 0xdd5588 });
      wheel.add(new THREE.Mesh(new THREE.TorusGeometry(4, 0.18, 8, 24), pink));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4, 0.1), pink);
        spoke.position.set(Math.cos(a) * 2, Math.sin(a) * 2, 0);
        spoke.rotation.z = a + Math.PI / 2;
        wheel.add(spoke);
        const gondola = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.5), new THREE.MeshLambertMaterial({ color: [0xffd35c, 0x66aadd, 0x88cc66, 0xdd6666][i % 4] }));
        gondola.position.set(Math.cos(a) * 4, Math.sin(a) * 4 - 0.35, 0);
        wheel.add(gondola);
      }
      wheel.position.y = 6.2;
      g.add(wheel);
      g.userData.spin = wheel;                                     // it turns
      for (const x of [-1.6, 1.6]) {                               // A-frame
        const leg = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.2, 0.3), stone));
        leg.position.set(x, 3.9, 0);
        leg.rotation.z = x > 0 ? -0.3 : 0.3;
      }
      break;
    }
    case 'beach': {
      const sand = add(new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.4, 12), new THREE.MeshLambertMaterial({ color: 0xe8d8a8 })));
      sand.position.y = 0.2;
      for (const [dx, dz, sc] of [[-3, 2, 1.4], [4, -1, 1], [1, 4, 0.8]]) {   // dunes
        const dune = add(new THREE.Mesh(new THREE.SphereGeometry(1.6 * sc, 8, 5), new THREE.MeshLambertMaterial({ color: 0xf0e0b8 })));
        dune.position.set(dx, 0.1, dz);
        dune.scale.y = 0.35;
      }
      for (const [dx, dz] of [[2, 1], [-2, -2], [0, -4]]) {
        const palm = mkPalm(); palm.position.set(dx, 0.3, dz); g.add(palm);
      }
      break;
    }
    case 'star': {
      // the Franklin Mountains star is an outline of lights — bright after dark
      const dotMat = new THREE.MeshLambertMaterial({ color: 0x888888, emissive: 0xffee88, emissiveIntensity: 0.1 });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? 3.2 : 1.4;
        const dot = add(new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 5), dotMat));
        dot.position.set(Math.cos(a) * r, 6.4 + Math.sin(a) * r, 0);
      }
      g.userData.nightMats = [dotMat];
      const hill = add(new THREE.Mesh(new THREE.ConeGeometry(9, 7, 7), new THREE.MeshLambertMaterial({ color: 0x9a7a58, flatShading: true })));
      hill.position.y = 2.5;
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
        if (i % 2 === 0) {
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
      for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const noz = add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.9, 8).rotateZ(Math.PI / 2), black));
        noz.position.set(Math.cos(a) * 1.35, 3.4, Math.sin(a) * 1.35);
        noz.rotation.y = -a;
      }
      break;
    }
    case 'pete': {
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
    case 'prada': {
      // the loneliest boutique on Earth
      const shell = new THREE.MeshLambertMaterial({ color: 0xe8e2d6, flatShading: true });
      box(5, 2.6, 3, 0, 1.3, 0, shell);
      box(5.2, 0.3, 3.2, 0, 2.75, 0, new THREE.MeshLambertMaterial({ color: 0xc8c2b6 })); // parapet
      const glassMat = new THREE.MeshLambertMaterial({ color: 0x445566, emissive: 0xfff4d8, emissiveIntensity: 0.08 });
      box(1.4, 1.4, 0.1, -1.4, 1.2, -1.52, glassMat); // display windows
      box(1.4, 1.4, 0.1, 1.4, 1.2, -1.52, glassMat);
      box(0.9, 1.8, 0.1, 0, 1.0, -1.52, new THREE.MeshLambertMaterial({ color: 0x333944 })); // the door that never opens
      g.userData.nightMats = [glassMat];              // window displays glow at night
      break;
    }
    case 'eiffel': {
      const iron = new THREE.MeshLambertMaterial({ color: 0x5a5f6a, flatShading: true });
      const s1 = add(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 3.2, 5, 4), iron));
      s1.position.y = 2.5; s1.rotation.y = Math.PI / 4;
      const s2 = add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, 4.5, 4), iron));
      s2.position.y = 7.2; s2.rotation.y = Math.PI / 4;
      const s3 = add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.6, 4, 4), iron));
      s3.position.y = 11.4; s3.rotation.y = Math.PI / 4;
      // the red cowboy hat
      const red = new THREE.MeshLambertMaterial({ color: 0xcc2222, flatShading: true });
      const brim = add(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.22, 12), red));
      brim.position.y = 13.5;
      const crown = add(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 1.1, 10), red));
      crown.position.y = 14.15;
      break;
    }
    case 'dino': {
      const hide = new THREE.MeshLambertMaterial({ color: 0x4a7a4a, flatShading: true });
      // big theropod
      box(1.4, 2, 3.4, 0, 3.2, 0, hide);
      const neck = add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 1), hide));
      neck.position.set(0, 4.8, -1.8); neck.rotation.x = 0.4;
      box(1, 0.9, 1.7, 0, 5.7, -2.6, hide);                        // head
      const tail = add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 3.6), hide));
      tail.position.set(0, 2.9, 3.2); tail.rotation.x = -0.25;
      for (const x of [-0.6, 0.6]) box(0.5, 2.6, 0.7, x, 1.3, 0.4, hide);
      // sauropod friend
      const grey = new THREE.MeshLambertMaterial({ color: 0x7a8a6a, flatShading: true });
      box(1.6, 1.6, 3.2, 6, 2.2, 1, grey);
      const lneck = add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.4, 0.7), grey));
      lneck.position.set(6, 4.4, -0.6); lneck.rotation.x = 0.25;
      box(0.7, 0.5, 1, 6, 6, -1.1, grey);
      for (const [lx, lz] of [[5.4, -0.2], [6.6, -0.2], [5.4, 2.2], [6.6, 2.2]]) box(0.45, 1.6, 0.5, lx, 0.8, lz, grey);
      // the trackway
      for (let i = 0; i < 5; i++) box(0.5, 0.05, 0.7, -3 - i * 0.9, 0.1, i * 1.2 - 2, new THREE.MeshLambertMaterial({ color: 0x6a6a55 }));
      break;
    }
    case 'stadium': {
      const shell = new THREE.MeshLambertMaterial({ color: 0xb8bcc4, flatShading: true });
      const bowl = add(new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 3.6, 16), shell));
      bowl.position.y = 1.8;
      bowl.scale.z = 0.75;
      const glass = add(new THREE.Mesh(new THREE.CylinderGeometry(6.2, 7, 1, 16), new THREE.MeshLambertMaterial({ color: 0x556677 })));
      glass.position.y = 4;
      glass.scale.z = 0.75;
      // the great arches
      for (const z of [-1.6, 1.6]) {
        const arch = add(new THREE.Mesh(new THREE.TorusGeometry(7.6, 0.28, 8, 24, Math.PI), shell));
        arch.position.set(0, 0.4, z);
      }
      break;
    }
    case 'astrodome': {
      const shell = new THREE.MeshLambertMaterial({ color: 0xc8c4b8, flatShading: true });
      const wall = add(new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.8, 2.6, 18), shell));
      wall.position.y = 1.3;
      const dome = add(new THREE.Mesh(new THREE.SphereGeometry(7.5, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xd8d4c8, flatShading: true })));
      dome.position.y = 2.6;
      dome.scale.y = 0.45;
      break;
    }
    case 'boots': {
      const leather = new THREE.MeshLambertMaterial({ color: 0x8a5a30, flatShading: true });
      const trim = new THREE.MeshLambertMaterial({ color: 0xd8cbb0, flatShading: true });
      for (const x of [-1.6, 1.6]) {
        const shaft = add(new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.85, 3.6, 10), leather));
        shaft.position.set(x, 2.6, 0);
        const foot = add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 2.6), leather));
        foot.position.set(x, 0.45, -0.7);
        const toe = add(new THREE.Mesh(new THREE.SphereGeometry(0.72, 8, 6), leather));
        toe.position.set(x, 0.5, -1.9);
        const band = add(new THREE.Mesh(new THREE.CylinderGeometry(0.98, 0.98, 0.35, 10), trim));
        band.position.set(x, 4.2, 0);
      }
      break;
    }
  }
  // every landmark gets its Texas historical marker
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 5), new THREE.MeshLambertMaterial({ color: 0x555555 }));
  post.position.set(5.5, 0.65, 5.5);
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.06), new THREE.MeshLambertMaterial({ color: 0x6a4a2f }));
  plaque.position.set(5.5, 1.5, 5.5);
  g.add(post, plaque);
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

