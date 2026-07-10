// Gameplay: city visits, landmarks, yellow roses, NPCs with dialog. Progress in localStorage.
import * as THREE from 'three';
import { GEO, seededRand, nearestCity } from './geo.js';
import { mkStarMesh } from './vehicle.js';
import { cityRadius } from './cities.js';

const SAVE_KEY = 'lonestar-roam-save-v1';

// Real landmarks at real coordinates (projected same as pipeline: 1u=100m, center 31N 99.5W)
const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];
const LANDMARKS = [
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
];

const NPC_DATA = [
  ['Austin', 'Willie', 'Welcome to Austin! Keep it weird, partner. Try the breakfast tacos before you fly off.', 'Austin is the live music capital of the world — 250+ venues.'],
  ['Houston', 'Rosa', 'This here’s the biggest city in Texas. NASA’s just down the road — you can’t miss the rocket.', 'Houston is home to the largest medical center on Earth.'],
  ['Dallas', 'Big Tex', 'Howdy folks! You look like you could use some state fair corny dogs.', 'The frozen margarita machine was invented in Dallas in 1971.'],
  ['San Antonio', 'Elena', 'Remember the Alamo? It’s right in the middle of downtown. The river walk’s prettier at truck-height.', 'San Antonio’s missions are a UNESCO World Heritage site.'],
  ['Fort Worth', 'Hank', 'Cowtown, they call it. Real cowboys drive the herd through twice a day at the Stockyards.', 'Fort Worth is where the West begins, so they say.'],
  ['El Paso', 'Marisol', 'You made it all the way out west! We’re closer to Los Angeles than to Houston out here.', 'El Paso sits in Mountain Time — the rest of Texas is Central.'],
  ['Amarillo', 'Dusty', 'Panhandle wind’ll knock your hat off. Spray-paint a Cadillac while you’re here — everyone does.', 'Amarillo means "yellow" in Spanish, for the local soil.'],
  ['Corpus Christi', 'Gully', 'Sparkling city by the sea! Watch for the shrimp boats off Padre Island.', 'Selena, the Queen of Tejano, called Corpus home.'],
  ['Lubbock', 'Peggy Sue', 'Buddy Holly grew up right here. Flat? Sure. But you can see tomorrow from here.', 'Lubbock is the world’s largest cottonseed processing region.'],
  ['Laredo', 'Chuy', 'Bienvenido to the border! I-35 starts right here and runs clear to Minnesota.', 'Laredo has flown seven flags, one more than the rest of Texas.'],
  ['Marfa', 'Quill', 'Artists, antelope, and lights nobody can explain. Stick around till dark.', 'Marfa’s mystery lights have been reported since 1883.'],
  ['Galveston', 'Cap’n Sal', 'This island was once the biggest city in Texas, before the 1900 storm.', 'The 1900 Galveston hurricane is still the deadliest US natural disaster.'],
];

export class Gameplay {
  constructor(scene) {
    this.scene = scene;
    this.save = JSON.parse(localStorage.getItem(SAVE_KEY) || '{"cities":[],"landmarks":[],"roses":[]}');
    this.save.species ??= []; // added later — default for older saves
    this.onToast = null;
    this.onDialog = null;
    this.activeNPC = null;
    this.dialogStep = 0;

    this.cityStars = this.mkCityStars();
    this.roseSystem = this.mkRoses();
    this.landmarkGroup = this.mkLandmarks();
    this.npcs = this.mkNPCs();
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
  }

  persist() { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); }

  // --- City stars: golden star hovering over each unvisited downtown ---
  mkCityStars() {
    const group = new THREE.Group();
    for (const c of GEO.cities) {
      if (this.save.cities.includes(c.name)) continue;
      const star = mkStarMesh(2.2, 0xffd35c);
      star.position.set(c.x, 14 + cityRadius(c.pop) * 0.15, c.z);
      star.userData.city = c.name;
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
    const geo = new THREE.IcosahedronGeometry(0.55, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffdf3c, emissive: 0xbb9a00, emissiveIntensity: 0.5 });
    const inst = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4();
    this.roseSpots = spots.map(([x, z], i) => {
      const taken = this.save.roses.includes(i);
      m.makeScale(taken ? 0.001 : 1, taken ? 0.001 : 1, taken ? 0.001 : 1).setPosition(x, 1.2, z);
      inst.setMatrixAt(i, m);
      return { x, z, i, taken };
    });
    this.scene.add(inst);
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
      g.userData.lm = lm;
      if (lm.kind === 'lights') this.marfa = g; // the orbs only show after dark
      group.add(g);
    }
    this.scene.add(group);
    return group;
  }

  // --- NPCs — placed at their home city downtown edge ---
  mkNPCs() {
    const npcs = [];
    for (const [cityName, name, line1, fact] of NPC_DATA) {
      const c = GEO.cities.find((c) => c.name === cityName);
      if (!c) continue;
      const rand = seededRand('npc:' + name);
      const g = mkNPCMesh(rand);
      const R = cityRadius(c.pop);
      const a = rand() * Math.PI * 2;
      g.position.set(c.x + Math.cos(a) * R * 0.45, 0, c.z + Math.sin(a) * R * 0.45);
      g.userData = { npc: { name, lines: [line1, '📌 ' + fact] } };
      this.scene.add(g);
      npcs.push(g);
    }
    return npcs;
  }

  // Nearest interactable NPC within range
  npcNear(pos, range = 6) {
    let best = null, bd = range * range;
    for (const n of this.npcs) {
      const d = (n.position.x - pos.x) ** 2 + (n.position.z - pos.z) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  interact(pos) {
    if (this.activeNPC) { // advance / close dialog
      this.dialogStep++;
      const lines = this.activeNPC.userData.npc.lines;
      if (this.dialogStep >= lines.length) { this.activeNPC = null; this.onDialog?.(null); }
      else this.onDialog?.({ name: this.activeNPC.userData.npc.name, text: lines[this.dialogStep] });
      return;
    }
    const n = this.npcNear(pos);
    if (n) {
      this.activeNPC = n;
      this.dialogStep = 0;
      this.onDialog?.({ name: n.userData.npc.name, text: n.userData.npc.lines[0] });
    }
  }

  update(dt, pos, night = 0) {
    this.t += dt;
    // spin stars & bob roses
    for (const s of this.cityStars.children) s.rotation.y = this.t * 1.2;

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
        m.makeScale(0.001, 0.001, 0.001).setPosition(r.x, 1.2, r.z);
        this.roseSystem.setMatrixAt(r.i, m);
        this.roseSystem.instanceMatrix.needsUpdate = true;
        this.onToast?.(`🌹 Yellow rose (${this.save.roses.length}/300)`);
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
      }
    }

    // NPC proximity hint
    const near = this.npcNear(pos);
    return near && !this.activeNPC ? near.userData.npc.name : null;
  }
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

function mkNPCMesh(rand) {
  const g = new THREE.Group();
  const colors = [0x8a2f2f, 0x2f5a8a, 0x3f7a3f, 0x7a5a2f, 0x6a3f7a];
  const shirt = new THREE.MeshLambertMaterial({ color: colors[Math.floor(rand() * colors.length)] });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.8, 3, 8), shirt);
  body.position.y = 0.9;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), new THREE.MeshLambertMaterial({ color: 0xd9a066 }));
  head.position.y = 1.75;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 10), new THREE.MeshLambertMaterial({ color: 0x8a6f4d }));
  brim.position.y = 1.95;
  const marker = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 4), new THREE.MeshBasicMaterial({ color: 0xffd35c }));
  marker.position.y = 2.9;
  marker.rotation.x = Math.PI;
  g.add(body, head, brim, marker);
  return g;
}
