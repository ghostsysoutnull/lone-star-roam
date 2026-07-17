// Gameplay: city visits, landmarks, yellow roses, critter log. Progress in localStorage.
// (NPCs live in npcs.js.)
import * as THREE from 'three';
import { GEO, seededRand, nearestCity, hAt } from './geo.js';
import { mkStarMesh } from './vehicle.js';
import { cityRadius } from './cities.js';
import { merge, tinted } from './traffic.js';
import { fieldNear, onRunway, TD_AGL, TD_SPD } from './airports.js';

const SAVE_KEY = 'lonestar-roam-save-v1';
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// flavor only, every field (unlike the towered-only save.airports logbook in radio.js)
const WELCOME_LINES = [
  (n) => `🛬 Touchdown at ${n}.`,
  (n) => `🛬 Wheels down — welcome to ${n}.`,
  (n) => `🛬 You've made it to ${n}. Boots on the ground.`,
  (n) => `🛬 Nice landing! Welcome to ${n}.`,
];

// Real landmarks at real coordinates (projected same as pipeline: 1u=100m, center 31N 99.5W)
const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];
export const LANDMARKS = [
  { name: 'The Alamo', at: LL(29.4260, -98.4861), kind: 'alamo', fact: 'Built 1718; site of the 1836 battle for Texas independence.' },
  { name: 'Texas State Capitol', at: LL(30.2747, -97.7404), kind: 'capitol', fact: 'Taller than the US Capitol — of course it is.' },
  { name: 'Reunion Tower', at: LL(32.7756, -96.8089), kind: 'tower', fact: 'Dallas’ glowing ball, 561 ft up.' },
  { name: 'San Jacinto Monument', at: LL(29.7497, -95.0806), kind: 'obelisk', fact: 'World’s tallest war memorial — where Texas won independence in 18 minutes.' },
  { name: 'Space Center Houston', at: LL(29.5519, -95.0970), kind: 'rocket', fact: '"Houston" was the first word spoken from the Moon.' },
  { name: 'Cadillac Ranch', at: LL(35.1836, -101.9871), kind: 'cadillac', fact: 'Ten Cadillacs nose-down in a Panhandle field since 1974.' }, // true coord straddles I-40's ribbon at game scale — held 4u south of it
  { name: 'Big Bend', at: LL(29.2498, -103.2502), kind: 'canyon', fact: 'The Rio Grande’s great curve; darkest night skies in the lower 48.' },
  { name: 'Palo Duro Canyon', at: LL(34.9372, -101.6589), kind: 'hoodoo', fact: 'Second-largest canyon in the USA, hiding in the flat Panhandle.' },
  { name: 'Enchanted Rock', at: LL(30.5064, -98.8198), kind: 'dome', fact: 'A giant pink granite dome that creaks and groans at night.' },
  { name: 'Marfa Lights', at: LL(30.2892, -103.8543), kind: 'lights', fact: 'Mysterious orbs seen over the desert since the 1880s.' },
  { name: 'Fort Worth Stockyards', at: LL(32.7893, -97.3465), kind: 'longhorn', fact: 'Twice-daily longhorn cattle drive, every day since 1999.' },
  { name: 'Galveston Pleasure Pier', at: LL(29.2854, -94.7905), kind: 'ferris', fact: 'A ferris wheel over the Gulf of Mexico.' },
  { name: 'SS Selma', at: LL(29.3275, -94.7880), kind: 'wreck', fact: 'A WWI concrete-hulled tanker, scuttled off Pelican Island in 1922 after a collision cracked her stern — still broken-backed in the shallows.' },
  // nudged 2026-07-14 (W3): the old lon sat in open Gulf water once the island
  // became real land — now on the sand (save is by name, so nothing breaks)
  { name: 'Padre Island', at: LL(26.5940, -97.2940), kind: 'beach', fact: 'Longest undeveloped barrier island in the world.' },
  { name: 'Port Isabel Lighthouse', at: LL(26.0776, -97.2095), kind: 'lighthouse', fact: 'Lit in 1852 to guide ships through Brazos Santiago Pass — the only Texas lighthouse you can still climb.' },
  { name: 'El Paso Star', at: LL(31.8046, -106.4820), kind: 'star', fact: 'A 459-ft lit star on the Franklin Mountains.' },
  { name: 'Buc-ee’s New Braunfels', at: LL(29.7377, -98.0857), kind: 'beaver', fact: 'World’s largest convenience store — and famously spotless restrooms.' },
  { name: 'Stonehenge II', at: LL(30.0772, -99.3005), kind: 'henge', fact: 'A Hill Country Stonehenge replica, built on a whim in 1989.' },
  { name: 'World’s Largest Fire Hydrant', at: LL(30.0860, -94.1018), kind: 'hydrant', fact: '24 feet of Dalmatian-spotted hydrant outside Beaumont’s Fire Museum.' },
  { name: 'Paisano Pete', at: LL(30.8959, -102.8742), kind: 'pete', fact: 'An 11-ft roadrunner, greeting Fort Stockton travelers since 1979.' }, // held 3u off US-290's ribbon
  { name: 'Prada Marfa', at: LL(30.6039, -104.7367), kind: 'prada', fact: 'A fake Prada boutique alone in the desert since 2005. Art, not retail — the door never opens.' },
  { name: 'Eiffel Tower of Paris, TX', at: LL(33.6642, -95.5471), kind: 'eiffel', fact: 'Paris, Texas built its own Eiffel Tower — and topped it with a red cowboy hat.' }, // held 4u off the crossing state highways' ribbons
  { name: 'Dinosaur Valley', at: LL(32.2465, -97.8130), kind: 'dino', fact: '113-million-year-old dinosaur tracks in the Paluxy riverbed at Glen Rose.' },
  { name: 'AT&T Stadium', at: LL(32.7473, -97.0945), kind: 'stadium', fact: 'Jerry World — its arches are among the longest single-span roofs on Earth.' },
  { name: 'The Astrodome', at: LL(29.6847, -95.4107), kind: 'astrodome', fact: 'The Eighth Wonder of the World — first domed stadium, birthplace of AstroTurf.' },
  { name: 'World’s Largest Cowboy Boots', at: LL(29.6042, -98.4919), kind: 'boots', fact: '35-foot ostrich-skin boots guarding a San Antonio mall since 1979.' },
  { name: 'Terlingua Ghost Town', at: LL(29.3211, -103.6158), kind: 'terlingua', fact: 'A quicksilver boomtown gone quiet near Big Bend; its old cemetery still hosts a Día de los Muertos every fall.' },
  { name: 'Presidio La Bahía', at: LL(28.6470, -97.3802), kind: 'presidio', fact: 'Spanish fort at Goliad, 1749. After the massacre of Fannin’s men here in 1836, many say the garrison never mustered out.' }, // held 4u off US-183's ribbon (and clear of the San Antonio River)
  { name: 'B-1 Gate Guardian, Dyess AFB', at: LL(32.4207, -99.8547), kind: 'b1', fact: 'Dyess is a B-1B Lancer base — the swing-wing bomber has called Abilene home since 1985.' },
  { name: 'Randolph AFB Taj Mahal', at: LL(29.5292, -98.2783), kind: 'randolph', fact: 'Pilots have trained under this Spanish Colonial tower since 1931 — its water tower still doubles as base ops.' },
  // named-ranch gate arches (AGRICULTURE_SPEC wave 4) — animals.js RANCH_ARCHES
  // boosts herd odds around these coords; keep the two files in sync
  { name: 'King Ranch', at: LL(27.5236, -97.8880), kind: 'rancharch', fact: '825,000 acres — bigger than Rhode Island. Birthplace of American ranching and the Santa Gertrudis, the first cattle breed developed in the USA.' },
  { name: 'Four Sixes Ranch', at: LL(33.6206, -100.3186), kind: 'rancharch', fact: 'The 6666 has run cattle and champion quarter horses out of Guthrie since 1870 — legend says Burnett won it with four sixes in a poker hand.' },
  { name: 'Waggoner Ranch', at: LL(33.9300, -99.2800), kind: 'rancharch', fact: 'The largest US ranch inside one fence — about 510,000 acres. Drilling for water in 1902, the Waggoners hit oil instead.' },
  { name: 'Y.O. Ranch', at: LL(30.0790, -99.6250), kind: 'rancharch', fact: 'Schreiner cattle country since 1880 — and the pioneer of Texas exotics: axis deer and blackbuck have roamed these Hill Country pastures since the 1950s.' },
  // historic-ranch second wave (wave 5b) — coords sync with animals.js RANCH_ARCHES + world.js RANCH_HQ
  { name: 'JA Ranch', at: LL(34.82, -101.30), kind: 'rancharch', fact: 'Goodnight and Adair drove cattle into Palo Duro Canyon in 1876 — and the buffalo Goodnight saved here became the State Bison Herd at Caprock Canyons.' },
  { name: 'XIT Ranch', at: LL(35.684, -102.345), kind: 'rancharch', fact: 'Three million acres traded for building the Texas Capitol — 6,000 miles of barbed wire around the biggest fenced range on Earth.' },
  { name: 'Matador Ranch', at: LL(33.99, -100.84), kind: 'rancharch', fact: 'Founded 1879, run for decades from Dundee, Scotland — Scottish money, Texas grass, and Herefords by the tens of thousands.' },
  { name: 'LBJ Ranch', at: LL(30.2431, -98.6320), kind: 'rancharch', fact: 'The Texas White House — LBJ ran the country from the Pedernales, landing on his own strip. The Park Service still runs his registered Herefords.' }, // held 5u off the Pedernales ribbon
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
    this.save.legends ??= [];  // haunts witnessed (haunts.js LEGENDS keys)
    this.save.airports ??= []; // logbook: towered fields actually landed at (radio.js)
    // Passport: the shoulder's own progress container — NEVER folds into the
    // Texas tallies above (Law). stamps = neighbor states first-crossed,
    // towns = band cities visited (silver stars), landings = band airports
    // landed at, stones = Corner Stones (W6's job — reserved empty here).
    this.save.passport ??= { stamps: [], towns: [], landings: [], stones: [] };
    this.save.at ??= null; // resume snapshot: {x,z,y,heading,mode,skyT} (title.js)
    this.save.seen ??= {}; // first-run flags: intro card + per-tip/hint keys; 'all' = Skip intro & tips (onboarding.js)
    // pre-W2 saves with progress never see the intro or tips — grandfather them as veterans
    if (!this.save.seen.intro && (this.save.cities.length || this.save.landmarks.length || this.save.at)) {
      this.save.seen.intro = this.save.seen.all = true;
    }
    this.saveTimer = 0;
    this.countyNow = null;
    this.countyToastT = 0;
    this.onToast = null;

    this.cityStars = this.mkCityStars();
    this.bandCityStars = this.mkBandCityStars();
    this.roseSystem = this.mkRoses();
    this.landmarkGroup = this.mkLandmarks();
    this.t = 0;
  }

  counts() {
    return {
      cities: this.save.cities.length, landmarks: this.save.landmarks.length,
      roses: this.save.roses.length, species: this.save.species.length,
      counties: this.save.counties.length, bank: this.save.bank,
      legends: this.save.legends.length, airports: this.save.airports.length,
      passportStamps: this.save.passport.stamps.length, passportTowns: this.save.passport.towns.length,
      passportLandings: this.save.passport.landings.length, passportStones: this.save.passport.stones.length,
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

  // Out-of-Texas parish/county crossing — flavor toast only, debounced against
  // boundary zigzag like enterCounty, but never persisted/tallied (Law: nothing
  // outside the state competes with the 254-county count).
  enterBandCounty(label, dt) {
    this.bandCountyToastT = (this.bandCountyToastT ?? 0) - dt;
    if (!label || label === this.bandCountyNow) return;
    this.bandCountyNow = label;
    if (this.bandCountyToastT > 0) return;
    this.bandCountyToastT = 6;
    this.onToast?.(`🗺 ${label}`);
  }

  // First crossing into a neighbor state — Passport stamp (Law: never a Texas tally).
  stampState(state, label) {
    if (!state || this.save.passport.stamps.includes(state)) return;
    this.save.passport.stamps.push(state);
    this.persist();
    this.onToast?.(`🛂 Passport stamped: ${label} (${this.save.passport.stamps.length}/4)`);
    this.onCollect?.('passport');
  }

  // Corner Stone reached — Passport (Law: the line's own subject, never a Texas tally).
  stampStone(key, label) {
    if (!key || this.save.passport.stones.includes(key)) return;
    this.save.passport.stones.push(key);
    this.persist();
    this.onToast?.(`🪨 Corner Stone: ${label} (${this.save.passport.stones.length}/7)`);
    this.onCollect?.('passport');
  }

  // Charter landing at a band airport — Passport stamp (missions.js finishJob).
  stampLanding(id, name) {
    if (this.save.passport.landings.includes(id)) return;
    this.save.passport.landings.push(id);
    this.persist();
    this.onToast?.(`🛂 Passport: landed at ${name} (${this.save.passport.landings.length})`);
    this.onCollect?.('passport');
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

  spotLegend(key, label, total, fact) {
    if (this.save.legends.includes(key)) return;
    this.save.legends.push(key);
    this.persist();
    this.onToast?.(`👻 ${label} (${this.save.legends.length}/${total})${fact ? ` — ${fact}` : ''}`);
    this.onCollect?.('legend');
  }

  // logbook stamp — landing-only (radio.js), the 10th collectible
  logAirport(id, name) {
    if (this.save.airports.includes(id)) return;
    this.save.airports.push(id);
    this.persist();
    this.onToast?.(`✈️ ${name} — logbook stamped (${this.save.airports.length}/7)`);
    this.onCollect?.('stamp');
  }

  // touchdown greeting + auto-walk — every field (ranch strips included), no
  // save state touched. Self-resets: setMode('WALK') takes mode off 'FLY',
  // so the guard below can't refire until the player flies and lands again.
  // `duringCharter` is true while an active charter job owns this landing
  // (its own pickup/deliver flow drives the field, and haul legs need the
  // player to stay in FLY) — skip so we don't yank the mode out from under it.
  checkTouchdown(player, duringCharter = false) {
    if (duringCharter || player.mode !== 'FLY') return;
    const agl = player.pos.y - hAt(player.pos.x, player.pos.z);
    if (agl >= TD_AGL || Math.abs(player.speed) >= TD_SPD) return;
    const a = fieldNear(player.pos.x, player.pos.z);
    if (!a || !onRunway(a, player.pos.x, player.pos.z, 1.5)) return;
    this.onToast?.(pick(WELCOME_LINES)(a.name));
    player.setMode('WALK');
  }

  persist() { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); }

  // resume snapshot — position/heading/mode/altitude/clock (title.js Continue)
  snapshotAt(player, sky) {
    this.save.at = { x: player.pos.x, z: player.pos.z, y: player.pos.y, heading: player.heading, mode: player.mode, skyT: sky.t };
  }

  // setMode first: it forces pos.y=0 on every non-FLY branch (vehicle.js), so
  // FLY altitude must be restored after mode switch (gotoAirport precedent, debug.js).
  applyAt(player, sky) {
    const at = this.save.at;
    if (!at) return;
    player.pos.x = at.x;
    player.pos.z = at.z;
    player.heading = at.heading;
    player.setMode(at.mode);
    if (at.mode === 'FLY') player.pos.y = at.y;
    sky.t = at.skyT;
  }

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

  // --- Band city stars: silver, not gold (Law: at a glance distinct from Texas) ---
  mkBandCityStars() {
    const group = new THREE.Group();
    const haloTex = mkHaloTexture();
    const SILVER = 0xc7ccd4;
    for (const c of GEO.bandCities) {
      if (this.save.passport.towns.includes(c.name)) continue;
      const star = mkStarMesh(2.2, SILVER);
      star.position.set(c.x, hAt(c.x, c.z) + 14 + cityRadius(c.pop) * 0.15, c.z);
      star.userData.city = c.name;
      star.userData.baseY = star.position.y;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: haloTex, color: SILVER, transparent: true, opacity: 0.5, depthWrite: false,
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
      const g = mkLandmarkMesh(lm.kind, lm.name);
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

  update(dt, pos, night = 0, speed = 0, player = null, sky = null) {
    const agl = pos.y - hAt(pos.x, pos.z); // height above ground, not sea level
    this.t += dt;

    // play stats (1 game unit = 100 m real; speed*2.4 matches the HUD mph)
    const st = this.save.stats;
    st.time += dt;
    st.dist += Math.abs(speed) * dt * 0.1;
    st.top = Math.max(st.top, Math.abs(Math.round(speed * 2.4)));
    this.saveTimer += dt;
    if (this.saveTimer > 20) {
      this.saveTimer = 0;
      if (player && sky) this.snapshotAt(player, sky);
      this.persist();
    }

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
    // stars spin and bob (gold Texas + silver band, same motion)
    for (const s of this.cityStars.children) {
      s.rotation.y = this.t * 1.2;
      s.position.y = s.userData.baseY + Math.sin(this.t * 1.4 + s.userData.baseY) * 0.8;
    }
    for (const s of this.bandCityStars.children) {
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
      // band city visit — Passport town tick, never the 132 (Law)
      if (GEO.bandCities.length) {
        let bc = null, bd = Infinity;
        for (const c of GEO.bandCities) {
          const d = (c.x - pos.x) ** 2 + (c.z - pos.z) ** 2;
          if (d < bd) { bd = d; bc = c; }
        }
        if (bc && Math.sqrt(bd) < Math.max(6, cityRadius(bc.pop) * 0.5) && !this.save.passport.towns.includes(bc.name)) {
          this.save.passport.towns.push(bc.name);
          this.persist();
          const star = this.bandCityStars.children.find((s) => s.userData.city === bc.name);
          if (star) this.bandCityStars.remove(star);
          this.onToast?.(`🛂 ${bc.name} — Passport stamped (${this.save.passport.towns.length}/${GEO.bandCities.length})`);
          this.onCollect?.('passport');
          this.burst(pos.x, pos.y + 1.5, pos.z);
        }
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

function mkLandmarkMesh(kind, name) {
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
    case 'lighthouse': {
      const white = new THREE.MeshLambertMaterial({ color: 0xf2ede2, flatShading: true });
      const tower = add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.95, 6.5, 10), white));
      tower.position.y = 3.25;
      const gallery = add(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.18, 10), new THREE.MeshLambertMaterial({ color: 0x2a2d33 })));
      gallery.position.y = 6.6;
      const lampMat = new THREE.MeshLambertMaterial({ color: 0x555044, emissive: 0xffe9a8, emissiveIntensity: 0.2, flatShading: true });
      const lamp = add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.85, 8), lampMat));
      lamp.position.y = 7.1;
      const cap = add(new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.7, 10), new THREE.MeshLambertMaterial({ color: 0x2a2d33 })));
      cap.position.y = 7.85;
      box(1.8, 1, 1.4, 1.5, 0.5, 0, stone); // keeper's cottage
      g.userData.nightMats = [lampMat];     // the light earns its name after dark
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
    case 'terlingua': {
      // roofless adobe ruins at odd heights, and the famous little graveyard
      const adobe = new THREE.MeshLambertMaterial({ color: 0xc2a582, flatShading: true });
      box(3, 1.2, 0.25, -2.5, 0.6, -1, adobe);
      box(0.25, 0.9, 2.2, -4, 0.45, 0, adobe);
      box(2.2, 0.7, 0.25, -2.2, 0.35, 1.4, adobe);
      box(0.25, 1.4, 1.8, -1.2, 0.7, -0.2, adobe);
      box(2.6, 1.0, 0.25, 2.2, 0.5, -2.2, adobe);
      box(0.25, 0.8, 1.6, 3.4, 0.4, -1.2, adobe);
      const wood = new THREE.MeshLambertMaterial({ color: 0x6a5a42 });
      for (const [x, z, r] of [[1.2, 2.2, 0.2], [2.4, 2.8, -0.15], [3.2, 1.8, 0.1], [1.8, 3.4, -0.25], [4, 2.6, 0.3]]) {
        box(0.1, 0.8, 0.1, x, 0.4, z, wood).rotation.z = r;   // weathered crosses
        box(0.45, 0.09, 0.1, x, 0.62, z, wood).rotation.z = r;
      }
      for (const [x, z] of [[0.8, 3], [2.9, 3.6]]) {          // rock cairn graves
        const cairn = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshLambertMaterial({ color: 0x8a8378, flatShading: true })));
        cairn.position.set(x, 0.15, z);
        cairn.scale.y = 0.6;
      }
      break;
    }
    case 'rancharch': {
      // classic ranch entrance: stone gate posts, wrought-iron arc carrying the
      // ranch sign, a cattle guard, and fence wings. King Ranch alone reads as
      // a region, not a point — longer wings plus windmill + stock tank.
      const king = name === 'King Ranch';
      const post = new THREE.MeshLambertMaterial({ color: 0xb8a488, flatShading: true });
      const iron = new THREE.MeshLambertMaterial({ color: 0x2c2824, flatShading: true });
      const wood = new THREE.MeshLambertMaterial({ color: 0x6a5238, flatShading: true });
      box(0.7, 3.0, 0.7, -2.6, 1.5, 0, post);
      box(0.7, 3.0, 0.7, 2.6, 1.5, 0, post);
      box(0.9, 0.25, 0.9, -2.6, 3.1, 0, post);              // post caps
      box(0.9, 0.25, 0.9, 2.6, 3.1, 0, post);
      const span = add(new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.09, 6, 20, Math.PI), iron));
      span.position.y = 3.1;                                 // the arc itself
      // ranch sign: name canvas on both faces of a plate hung from the arc
      const c = document.createElement('canvas');
      c.width = 256; c.height = 48;
      const cx = c.getContext('2d');
      cx.fillStyle = '#241f18'; cx.fillRect(0, 0, 256, 48);
      cx.fillStyle = '#e8d8a8'; cx.font = 'bold 30px Georgia';
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      const SIGNS = { 'King Ranch': 'KING RANCH', 'Four Sixes Ranch': '6 6 6 6', 'Waggoner Ranch': 'WAGGONER', 'Y.O. Ranch': 'Y · O',
        'JA Ranch': 'J A', 'XIT Ranch': 'XIT', 'Matador Ranch': 'MATADOR', 'LBJ Ranch': 'LBJ RANCH' };
      cx.fillText(SIGNS[name] ?? String(name).toUpperCase(), 128, 26);
      const plateM = new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(c) });
      add(new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.82, 0.08), [iron, iron, iron, iron, plateM, plateM])).position.y = 3.5;
      for (let i = 0; i < 6; i++)                            // cattle guard between the posts
        box(4.4, 0.05, 0.16, 0, 0.03, -0.75 + i * 0.3, iron);
      const wing = king ? 13 : 6;                            // fence wings, both sides
      for (const s of [-1, 1]) {
        for (let x = 3.6; x <= 3.6 + wing; x += 1.6) box(0.14, 1.0, 0.14, s * x, 0.5, 0, wood);
        box(wing + 0.8, 0.07, 0.08, s * (3.6 + wing / 2), 0.82, 0, wood);
        box(wing + 0.8, 0.07, 0.08, s * (3.6 + wing / 2), 0.45, 0, wood);
      }
      if (king) {
        const steel = new THREE.MeshLambertMaterial({ color: 0x9aa0a4, flatShading: true });
        const mill = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 4.2, 6), steel));
        mill.position.set(8.5, 2.1, -4);
        const fan = add(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.07, 12).rotateX(Math.PI / 2), steel));
        fan.position.set(8.5, 4.2, -4.15);
        box(0.7, 0.4, 0.06, 8.5, 4.0, -3.3, steel);          // tail vane
        const tank = add(new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.5, 14), steel));
        tank.position.set(10.6, 0.25, -3.4);                 // stock tank
      }
      break;
    }
    case 'presidio': {
      // the Goliad quadrangle and the chapel of Our Lady of Loreto
      const lime = new THREE.MeshLambertMaterial({ color: 0xe0d6bc, flatShading: true });
      box(9, 1.5, 0.5, 0, 0.75, -4.5, lime);                  // curtain walls
      box(9, 1.5, 0.5, 0, 0.75, 4.5, lime);
      box(0.5, 1.5, 9, -4.5, 0.75, 0, lime);
      box(0.5, 1.5, 9, 4.5, 0.75, 0, lime);
      const bastion = add(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 2.2, 8), lime));
      bastion.position.set(-4.5, 1.1, -4.5);
      box(2.4, 2.2, 3.6, 1.5, 1.1, 0, lime);                  // the chapel
      box(2.4, 1.3, 0.3, 1.5, 2.85, -1.65, lime);             // espadaña bell wall
      const bell = add(new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.32, 8), new THREE.MeshLambertMaterial({ color: 0x8a7a30 })));
      bell.position.set(1.5, 2.9, -1.65);
      box(0.06, 0.5, 0.06, 1.5, 3.7, -1.65, lime);            // cross
      box(0.28, 0.06, 0.06, 1.5, 3.8, -1.65, lime);
      break;
    }
    case 'b1': {
      // static display B-1B — unarmed gate guardian, higher-poly than the rest
      // of the landmark set (this one's meant to be looked at up close)
      const grey = new THREE.MeshLambertMaterial({ color: 0x53585c, flatShading: true });
      const dark = new THREE.MeshLambertMaterial({ color: 0x2a2c2e, flatShading: true });
      const glass = new THREE.MeshLambertMaterial({ color: 0x333a42 });
      const fuse = add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 8.6, 16).rotateZ(Math.PI / 2), grey));
      fuse.position.set(0, 2.4, 0);
      const nose = add(new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 16).rotateZ(Math.PI / 2), grey));
      nose.position.set(-5.5, 2.4, 0);
      const canopy = add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass));
      canopy.position.set(-3.6, 2.85, 0);
      canopy.scale.set(1.5, 0.7, 0.9);
      for (const s of [-1, 1]) {                                   // swept wings (static ground sweep)
        const root = add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 1.3), dark));
        root.position.set(0.6, 2.15, s * 1.1);
        const wing = add(new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.14, 1.7), grey));
        wing.position.set(1.6, 2.15, s * 2.1);
        wing.rotation.y = s * 0.95;
        for (const dz of [0.75, 1.55]) {                           // paired engine nacelles
          const nac = add(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.8, 12).rotateZ(Math.PI / 2), dark));
          nac.position.set(1.5, 1.5, s * dz);
        }
        const fin = add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.9, 0.14), grey));   // twin tail
        fin.position.set(4.1, 3.4, s * 0.55);
        fin.rotation.z = -0.12 * s;
      }
      for (const [x, z] of [[-3.2, 0], [1.5, -1.15], [1.5, 1.15]]) { // landing gear
        const strut = add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8), dark));
        strut.position.set(x, 1.1, z);
        const wheel = add(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.14, 8, 14), dark));
        wheel.position.set(x, 0.05, z);
        wheel.rotation.x = Math.PI / 2;
      }
      break;
    }
    case 'randolph': {
      // the "Taj Mahal" administration tower — ribbed cupola dome, higher
      // segment counts than the rest of the landmark set
      const cream = new THREE.MeshLambertMaterial({ color: 0xe8dcc0, flatShading: true });
      const terracotta = new THREE.MeshLambertMaterial({ color: 0xb5643c, flatShading: true });
      const gold = new THREE.MeshLambertMaterial({ color: 0xc9a227, emissive: 0x2a2000, emissiveIntensity: 0.08 });
      box(4.2, 3.2, 4.2, 0, 1.6, 0, cream);
      box(3.4, 3.0, 3.4, 0, 4.6, 0, cream);
      box(2.6, 2.6, 2.6, 0, 7.4, 0, cream);
      const windowMat = new THREE.MeshLambertMaterial({ color: 0x334455, emissive: 0xfff4d8, emissiveIntensity: 0.1 });
      for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const win = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.1), windowMat));
        win.position.set(Math.sin(a) * 1.32, 7.6, Math.cos(a) * 1.32);
        win.rotation.y = a;
      }
      const dome = add(new THREE.Mesh(new THREE.SphereGeometry(1.7, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), terracotta));
      dome.position.y = 8.7;
      const lantern = add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 1.4, 16), cream));
      lantern.position.y = 10.4;
      const spire = add(new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.1, 10), gold));
      spire.position.y = 11.6;
      g.userData.nightMats = [windowMat, gold];
      break;
    }
    case 'wreck': {
      // broken-backed concrete hull, half-swallowed by the shallows
      const concrete = new THREE.MeshLambertMaterial({ color: 0x8a8578, flatShading: true });
      const rust = new THREE.MeshLambertMaterial({ color: 0x6b4a3a, flatShading: true });
      const hullA = add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 6), concrete));
      hullA.position.set(-1.6, 0.35, 0);
      hullA.rotation.z = 0.18;
      const hullB = add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 1, 5), concrete));
      hullB.position.set(2.6, 0.1, 0.6);
      hullB.rotation.set(0.05, 0.5, -0.22); // the two halves no longer align
      const rib = add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 0.15), rust));
      rib.position.set(-1.2, 0.9, 1.8);
      rib.rotation.z = -0.3;
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

