// Regional wildlife: chunked spawning like scenery, but animals near the player
// are simulated — grazers shuffle, herds startle together, prey species flee
// (rabbits zigzag, roadrunners sprint down the highway), coyotes come out at
// night and howl. First close encounter with each species goes into the
// critter log with a fact. Region boxes mirror world.js scenery — keep in sync.
import * as THREE from 'three';
import { seededRand, inTexas, nearestRoad, hAt, waterAt, agAt } from './geo.js';
import { farmsteadAt, feedlotAt, ranchHQAt } from './world.js';
import { ATMOS } from './sky.js';

const CHUNK = 260, VIEW_CHUNKS = 2; // tighter ring than scenery — animals are simulated
const ACTIVE_R = 150;               // only simulate within this range
const SPOT_R = 24;                  // close-encounter range: critter log + HUD nearby readout

// nightMin/nightMax gate visibility by ATMOS.night (nocturnal / diurnal species).
// 'bat' is spawned by the dusk event in bats.js, never by region tables.
export const SPECIES = {
  deer: { name: 'White-tailed Deer', speed: 14, fleeR: 16, behavior: 'flee', bob: true,
    fact: 'Texas has more whitetails than any other state.' },
  longhorn: { name: 'Longhorn', speed: 3, fleeR: 0, behavior: 'graze', bob: false,
    fact: 'Horns can span over 8 feet tip to tip.' },
  armadillo: { name: 'Armadillo', speed: 3.5, fleeR: 6, behavior: 'flee', bob: false,
    fact: 'The state small mammal — always births quadruplets.' },
  jackrabbit: { name: 'Jackrabbit', speed: 16, fleeR: 12, behavior: 'flee', bob: true, zigzag: true,
    fact: 'Not a rabbit — a hare, hitting 40 mph.' },
  roadrunner: { name: 'Roadrunner', speed: 18, fleeR: 10, behavior: 'flee', bob: false, roadSprint: true,
    fact: 'Prefers sprinting to flying. Beep beep.' },
  coyote: { name: 'Coyote', speed: 12, fleeR: 14, behavior: 'wander', bob: false, nightMin: 0.25,
    fact: 'Their night chorus carries for miles.' },
  hog: { name: 'Wild Hog', speed: 8, fleeR: 10, behavior: 'flee', bob: false,
    fact: 'Millions roam Texas — brush country bulldozers.' },
  vulture: { name: 'Turkey Vulture', speed: 8, fleeR: 0, behavior: 'circle', bob: false, nightMax: 0.55, orbitR: 12, orbitH: 16, orbitSpd: 0.5,
    fact: 'Rides thermals for hours without a flap.' },
  javelina: { name: 'Javelina', speed: 9, fleeR: 9, behavior: 'flee', bob: false,
    fact: 'Not a pig — a collared peccary.' },
  pronghorn: { name: 'Pronghorn', speed: 21, fleeR: 20, behavior: 'flee', bob: false,
    fact: 'Fastest land animal in the Americas — 55 mph.' },
  turkey: { name: 'Wild Turkey', speed: 7, fleeR: 9, behavior: 'flee', bob: false, nightMax: 0.6,
    fact: 'Rio Grande turkeys roost in Hill Country oaks.' },
  gator: { name: 'Alligator', speed: 1.5, fleeR: 0, behavior: 'lurk', bob: false,
    fact: 'East Texas swamps hold half a million gators.' },
  rattlesnake: { name: 'Rattlesnake', speed: 0, fleeR: 0, behavior: 'coil', bob: false,
    fact: 'The rattle is a courtesy. Heed it.' },
  pelican: { name: 'Brown Pelican', speed: 8, fleeR: 0, behavior: 'circle', bob: false, nightMax: 0.6, orbitR: 18, orbitH: 7, orbitSpd: 0.35,
    fact: 'Plunge-dives with a stretchy pouch beak.' },
  horse: { name: 'Quarter Horse', speed: 16, fleeR: 12, behavior: 'graze', bob: false,
    fact: 'More horses than any other state — bred to turn on a dime around cattle.' },
  goat: { name: 'Angora Goat', speed: 7, fleeR: 8, behavior: 'graze', bob: false,
    fact: 'Edwards Plateau goats made Texas the mohair capital of America.' },
  sheep: { name: 'Rambouillet Sheep', speed: 6, fleeR: 8, behavior: 'graze', bob: false,
    fact: 'Top sheep state since the 1880s — wool built San Angelo.' },
  bison: { name: 'Bison', speed: 6, fleeR: 0, behavior: 'graze', bob: false,
    fact: 'The State Bison Herd, saved by Charles Goodnight in 1878, roams Caprock Canyons.' },
  angus: { name: 'Black Angus', speed: 3, fleeR: 0, behavior: 'graze', bob: false, leash: 2.2,
    fact: 'More cattle feed in the Panhandle than people live in it — Hereford is the Beef Capital of the World.' },
  santagertrudis: { name: 'Santa Gertrudis', speed: 3, fleeR: 0, behavior: 'graze', bob: false,
    fact: 'Bred on King Ranch — the first American cattle breed, cherry-red and built for Texas heat.' },
  axisdeer: { name: 'Axis Deer', speed: 15, fleeR: 15, behavior: 'flee', bob: true,
    fact: 'Spotted for life — Y.O. Ranch pioneered Texas exotics with chital from India in the 1950s.' },
  blackbuck: { name: 'Blackbuck', speed: 19, fleeR: 16, behavior: 'flee', bob: true,
    fact: 'An Indian antelope with corkscrew horns — more live on Texas ranches than in much of its native range.' },
  hereford: { name: 'Hereford', speed: 3, fleeR: 0, behavior: 'graze', bob: false,
    fact: 'Red coat, white face — the breed that restocked the Panhandle after the longhorn era.' },
  bat: { name: 'Mexican Free-tailed Bat', event: true,
    fact: 'Austin hosts the largest urban bat colony on Earth.' },
  kempsridley: { name: 'Kemp’s Ridley Sea Turtle', event: true, // turtles.js dawn release at Malaquite
    fact: 'The world’s most endangered sea turtle — hatchlings released at Padre Island every summer dawn find their way back years later to nest.' },
};
export const SPECIES_COUNT = Object.keys(SPECIES).length;

// regional spawn tables: [species, herd min, herd max, groups per chunk, keep odds]
// boxes mirror world.js (plains/Hill Country) — keep the two files consistent
function regionTable(x, z) {
  if (x > 1800 && x + z > 5200) // Gulf coast & RGV marsh
    return [['pelican', 2, 5, 1, 0.5], ['gator', 1, 2, 1, 0.3], ['longhorn', 3, 6, 1, 0.5], ['armadillo', 1, 2, 1, 0.5]];
  if (z < -2300 && x > -3300 && x < 1600) // High Plains / Panhandle
    return [['pronghorn', 3, 6, 1, 0.5], ['jackrabbit', 1, 2, 1, 0.55], ['coyote', 1, 2, 1, 0.5], ['vulture', 2, 4, 1, 0.5]];
  if (x < -2200) // Trans-Pecos desert
    return [['jackrabbit', 1, 2, 1, 0.55], ['roadrunner', 1, 1, 1, 0.55], ['coyote', 1, 2, 1, 0.55], ['vulture', 2, 4, 1, 0.55], ['javelina', 2, 5, 1, 0.4], ['rattlesnake', 1, 1, 1, 0.35]];
  if (x > 3400) // Piney Woods
    return [['deer', 2, 4, 1, 0.55], ['hog', 2, 5, 1, 0.55], ['turkey', 3, 7, 1, 0.4], ['gator', 1, 2, 1, 0.3]];
  if (x > -900 && x < 1100 && z > -400 && z < 1500) // Hill Country
    return [['deer', 2, 4, 1, 0.55], ['turkey', 3, 6, 1, 0.45], ['armadillo', 1, 2, 1, 0.5], ['longhorn', 3, 6, 1, 0.5]];
  if (z > 2600) // South Texas brush
    return [['longhorn', 3, 6, 1, 0.55], ['hog', 2, 4, 1, 0.55], ['armadillo', 1, 2, 1, 0.5], ['javelina', 2, 5, 1, 0.4]];
  return [['deer', 2, 4, 1, 0.55], ['longhorn', 3, 7, 1, 0.55], ['armadillo', 1, 2, 1, 0.5], ['coyote', 1, 1, 1, 0.4]];
}

// census-scaled livestock rows layered onto the wild regionTable — odds come
// straight from county head-per-km² (agAt), so horses run statewide and
// goats/sheep light up the Edwards Plateau with no hand-tuned boxes.
// Calibration (2022 census): horse density median 0.29/km², 90th pct 1.0;
// goat+sheep 75th pct ≈ 2/km² (Sutton 14, Mills 23, Dallam 0).
function censusTable(x, z) {
  const ag = agAt(x, z);
  if (!ag) return [];
  const rows = [];
  const horses = ag.horses / ag.areaKm2, goats = ag.goats / ag.areaKm2, sheep = ag.sheep / ag.areaKm2;
  if (horses > 0.05) rows.push(['horse', 2, 4, 1, Math.min(0.5, horses * 0.55)]);
  if (goats > 2) rows.push(['goat', 3, 7, 1, Math.min(0.55, goats / 8)]);
  if (sheep > 2) rows.push(['sheep', 4, 8, 1, Math.min(0.55, sheep / 8)]);
  for (const a of RANCH_ARCHES)
    if ((x - a.x) ** 2 + (z - a.z) ** 2 < a.r * a.r) rows.push(...a.rows);
  return rows;
}

// named-ranch gate arches (gameplay.js LANDMARKS, kind 'rancharch') boost herd
// odds nearby — coords are the same LL projections, keep the two files in
// sync. censusTable is sampled at CHUNK midpoints (260-unit grid), so radii
// are in chunk-mid space: 200 always reaches the nearest midpoint (max gap
// √2·130 ≈ 184); King's real footprint is a region, not a point, so it gets
// a wider ring. Rows ride censusTable so regionTable stays byte-identical.
// wave-5 rows are APPENDED to each arch's list — they draw after the wave-4
// rows in the chunk stream, so pre-wave-5 placements keep their exact draws
const RANCH_ARCHES = [
  { x: 1538.2, z: 3870.1, r: 300, rows: [['longhorn', 4, 8, 1, 0.7], ['horse', 2, 5, 1, 0.5], ['santagertrudis', 4, 8, 1, 0.6]] },  // King Ranch (27.5236 −97.8880)
  { x: -781.1, z: -2917.3, r: 200, rows: [['horse', 3, 6, 1, 0.7], ['angus', 3, 6, 1, 0.45]] },                         // Four Sixes (33.6206 −100.3186)
  { x: 209.9, z: -3261.7, r: 200, rows: [['angus', 4, 8, 1, 0.6], ['horse', 2, 4, 1, 0.5]] },                           // Waggoner (33.9300 −99.2800)
  { x: -119.3, z: 1025.3, r: 200, rows: [['goat', 4, 8, 1, 0.6], ['sheep', 4, 8, 1, 0.5], ['deer', 2, 4, 1, 0.5], ['axisdeer', 3, 6, 1, 0.5], ['blackbuck', 2, 4, 1, 0.45]] },    // Y.O. (30.0790 −99.6250)
  // wave-5b historic-ranch arches — appended AFTER the wave-4/5 entries so
  // existing chunks keep their exact draws (new arches only add rows in
  // chunks that previously had none)
  { x: -1717.6, z: -4252.4, r: 200, rows: [['longhorn', 4, 8, 1, 0.6], ['horse', 2, 4, 1, 0.5]] },                       // JA Ranch (34.82 −101.30)
  { x: -2714.7, z: -5214.2, r: 200, rows: [['longhorn', 4, 8, 1, 0.65], ['angus', 3, 6, 1, 0.45]] },                     // XIT (35.684 −102.345)
  { x: -1278.6, z: -3328.5, r: 200, rows: [['hereford', 4, 8, 1, 0.6], ['horse', 2, 4, 1, 0.5]] },                       // Matador (33.99 −100.84)
  { x: 830.2, z: 847.1, r: 200, rows: [['hereford', 3, 6, 1, 0.55], ['deer', 2, 4, 1, 0.5]] },                           // LBJ (30.239 −98.630)
];

// the Texas State Bison Herd — one curated site, Caprock Canyons SP
// (34.41 N −101.06 W through the gameplay LL projection)
const BISON_SITE = { x: -1488.5, z: -3796, cx: -6, cz: -15 };

export class AnimalSystem {
  constructor(scene, onSpotted) {
    this.scene = scene;
    this.onSpotted = onSpotted; // (speciesKey) => void
    this.onSound = null;        // (kind) => void — 'howl' | 'rattle' | 'gobble'
    this.sndCd = {};            // per-kind cooldowns
    this.live = new Map(); // chunk key -> { group, animals: [] }
    this.t = 0;
    this.regionTable = regionTable; // exposed for verify — reads spawn odds without resampling chunks
    this.censusTable = censusTable; // ditto for the census-scaled livestock rows
    this.bisonSite = BISON_SITE;
    this.ranchArches = RANCH_ARCHES; // ditto for the wave-4 arch herd boost
    this.nearby = null; // {species, d2} — nearest visible animal within NEARBY_R, for the HUD readout
  }

  update(dt, px, pz, py = 0) {
    this.py = py;
    this.t += dt;
    for (const k of Object.keys(this.sndCd)) this.sndCd[k] -= dt;
    const cx = Math.floor(px / CHUNK), cz = Math.floor(pz / CHUNK);
    const want = new Set();
    for (let i = -VIEW_CHUNKS; i <= VIEW_CHUNKS; i++)
      for (let j = -VIEW_CHUNKS; j <= VIEW_CHUNKS; j++) want.add(`${cx + i},${cz + j}`);
    for (const [k, entry] of this.live) {
      if (want.has(k)) continue;
      this.scene.remove(entry.group);
      entry.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      this.live.delete(k);
    }
    for (const k of want) if (!this.live.has(k)) this.spawn(k);

    this.nearby = null;
    const night = ATMOS.night;
    for (const { animals } of this.live.values()) {
      for (const a of animals) {
        // nocturnal/diurnal species keep their hours
        const spec = SPECIES[a.species];
        const vis = spec.nightMin != null ? night >= spec.nightMin
          : spec.nightMax != null ? night <= spec.nightMax : true;
        a.g.visible = vis;
        if (vis) this.step(a, animals, dt, px, pz);
      }
    }
  }

  // player honked (or similar scare) at (px,pz): everything skittish bolts
  scare(px, pz, r = 26) {
    for (const { animals } of this.live.values()) {
      for (const a of animals) {
        if (!a.g.visible || !SPECIES[a.species].fleeR) continue; // longhorns are unimpressed
        const dx = a.g.position.x - px, dz = a.g.position.z - pz;
        if (dx * dx + dz * dz > r * r) continue;
        this.flee(a, dx, dz, 0.4);
      }
    }
  }

  // put one animal to flight, directly away from (source at animal - d)
  flee(a, dx, dz, jitter = 0) {
    a.state = 'flee';
    a.stateT = (SPECIES[a.species].roadSprint ? 2.5 : 1.5) + Math.random();
    a.heading = Math.atan2(-dx, -dz) + (jitter ? (Math.random() - 0.5) * jitter : 0); // away
    a.zigT = 0;
    // roadrunner: make for the road and sprint along it, away from the threat
    if (SPECIES[a.species].roadSprint) {
      const r = nearestRoad(a.g.position.x, a.g.position.z, 20);
      if (r) {
        if (r.dist > 2) {
          a.heading = Math.atan2(-(r.x - a.g.position.x), -(r.z - a.g.position.z)); // dash to the shoulder
        } else {
          const sgn = r.tx * dx + r.tz * dz >= 0 ? 1 : -1; // tangent half that leads away
          a.heading = Math.atan2(-r.tx * sgn, -r.tz * sgn);
        }
      }
    }
  }

  step(a, herd, dt, px, pz) {
    const dx = a.g.position.x - px, dz = a.g.position.z - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 > ACTIVE_R * ACTIVE_R) return;
    const spec = SPECIES[a.species];

    // critter log — close encounter at ground-ish level (no spotting from altitude)
    if (d2 < SPOT_R * SPOT_R && this.py < 15) this.onSpotted?.(a.species);
    // HUD nearby readout — same range/altitude gate, keeps the nearest if several qualify
    if (d2 < SPOT_R * SPOT_R && this.py < 15 && (!this.nearby || d2 < this.nearby.d2))
      this.nearby = { species: a.species, d2 };

    // voices: lonesome howls at night, a rattle warning underfoot, distant gobbles
    if (a.species === 'coyote' && ATMOS.night > 0.3 && d2 < 140 * 140) this.sound('howl', 22 + Math.random() * 20);
    if (a.species === 'rattlesnake' && d2 < 16 * 16) this.sound('rattle', 2.5);
    if (a.species === 'turkey' && d2 < 30 * 30) this.sound('gobble', 9 + Math.random() * 14);

    if (spec.behavior === 'circle') { // vultures ride thermals, pelicans patrol low
      a.phase += dt * spec.orbitSpd;
      a.g.position.set(
        a.homeX + Math.cos(a.phase) * spec.orbitR,
        hAt(a.homeX, a.homeZ) + spec.orbitH + Math.sin(a.phase * 2.3) * 1.5,
        a.homeZ + Math.sin(a.phase) * spec.orbitR
      );
      a.g.rotation.y = -a.phase - Math.PI / 2;
      a.g.rotation.z = 0.18; // banked into the turn
      return;
    }
    if (spec.behavior === 'coil') return; // rattlesnakes hold their ground

    let moving = false;
    const dist = Math.sqrt(d2);
    if (spec.fleeR && dist < spec.fleeR && a.state !== 'flee') {
      this.flee(a, dx, dz);
      // startle ripples through the herd
      for (const b of herd) {
        if (b === a || b.homeX !== a.homeX || b.state === 'flee' || !SPECIES[b.species].fleeR) continue;
        const bd = (b.g.position.x - a.g.position.x) ** 2 + (b.g.position.z - a.g.position.z) ** 2;
        if (bd < 25 * 25) this.flee(b, b.g.position.x - px, b.g.position.z - pz, 0.6);
      }
    }
    if (a.state === 'flee') {
      a.stateT -= dt;
      if (a.stateT <= 0) a.state = 'idle';
      moving = true;
      if (spec.zigzag) { // hares jink as they run
        a.zigT -= dt;
        if (a.zigT <= 0) { a.zigT = 0.3 + Math.random() * 0.25; a.heading += (Math.random() - 0.5) * 1.4; }
      }
      const onRoad = spec.roadSprint && nearestRoad(a.g.position.x, a.g.position.z, 3);
      this.move(a, spec.speed * (onRoad ? 1.3 : 1), dt);
    } else {
      // idle/wander: occasionally pick a new direction and amble
      a.stateT -= dt;
      if (a.stateT <= 0) {
        a.stateT = 2 + Math.random() * 4;
        let p = spec.behavior === 'graze' ? 0.3 : spec.behavior === 'lurk' ? 0.12 : 0.6;
        if (a.species === 'deer' && ATMOS.night > 0.15 && ATMOS.night < 0.6) p = 0.85; // crepuscular rush
        a.ambling = Math.random() < p;
        a.heading = Math.random() * Math.PI * 2;
      }
      if (a.ambling) {
        moving = true;
        this.move(a, spec.speed * (spec.behavior === 'graze' || spec.behavior === 'lurk' ? 1 : 0.35), dt);
      }
    }
    a.g.rotation.y = a.heading;
    // legs swing while moving; hop/bound bob for deer & rabbits
    if (a.legs) {
      const rate = 4 + spec.speed * 0.6;
      for (let i = 0; i < a.legs.length; i++) {
        a.legs[i].rotation.x = moving
          ? Math.sin(this.t * rate + a.phase + (i % 2) * Math.PI) * 0.45
          : a.legs[i].rotation.x * Math.pow(0.005, dt);
      }
    }
    a.g.position.y = hAt(a.g.position.x, a.g.position.z) + (moving && spec.bob ? Math.abs(Math.sin(this.t * 9 + a.phase)) * 0.35 : 0);
  }

  sound(kind, cooldown) {
    if ((this.sndCd[kind] ?? 0) > 0) return;
    this.sndCd[kind] = cooldown;
    this.onSound?.(kind);
  }

  move(a, speed, dt) {
    const nx = a.g.position.x - Math.sin(a.heading) * speed * dt;
    const nz = a.g.position.z - Math.cos(a.heading) * speed * dt;
    // stay in Texas, off roads, and near home (leash)
    if (!inTexas(nx, nz)) { a.heading += Math.PI; return; }
    const spec = SPECIES[a.species];
    if (Math.hypot(nx - a.homeX, nz - a.homeZ) > (spec.leash ?? 45)) { a.heading += Math.PI / 2; return; } // feedlot cattle stay penned
    if (!spec.roadSprint) { // roadrunners own the road
      const road = nearestRoad(nx, nz, 3);
      if (road && a.state !== 'flee') { a.heading += Math.PI / 2; return; } // fleeing animals may cross roads
    }
    a.g.position.x = nx;
    a.g.position.z = nz;
  }

  spawn(key) {
    const [cx, cz] = key.split(',').map(Number);
    const rand = seededRand('animals' + key);
    const group = new THREE.Group();
    const animals = [];
    const baseX = cx * CHUNK, baseZ = cz * CHUNK;
    const midX = baseX + CHUNK / 2, midZ = baseZ + CHUNK / 2;
    // census rows draw AFTER the regional rows — existing wild placements
    // keep their exact pre-wave-3 seed draws
    for (const [species, lo, hi, groups, keep] of [...regionTable(midX, midZ), ...censusTable(midX, midZ)]) {
      for (let gI = 0; gI < groups; gI++) {
        if (rand() > keep) continue; // not every chunk has every species
        let hx = baseX + rand() * CHUNK, hz = baseZ + rand() * CHUNK;
        if (species === 'gator') { // gators want water — try a few spots for a riverbank
          for (let tries = 0; tries < 6; tries++) {
            const wx = baseX + rand() * CHUNK, wz = baseZ + rand() * CHUNK;
            if (waterAt(wx + 1.8, wz)) { hx = wx; hz = wz; break; }
          }
        }
        if (!inTexas(hx, hz)) continue;
        if (nearestRoad(hx, hz, 6)) continue; // herds keep off the highway
        const n = lo + ((rand() * (hi - lo + 1)) | 0);
        for (let i = 0; i < n; i++) {
          const { g, legs } = mkAnimal(species, rand);
          const ax = hx + (rand() - 0.5) * 8, az = hz + (rand() - 0.5) * 8;
          g.position.set(ax, hAt(ax, az), az);
          g.rotation.y = rand() * Math.PI * 2;
          group.add(g);
          animals.push({
            g, legs, species, homeX: hx, homeZ: hz,
            state: 'idle', stateT: rand() * 3, ambling: false, zigT: 0,
            heading: rand() * Math.PI * 2, phase: rand() * Math.PI * 2,
          });
        }
      }
    }

    // worked livestock clusters — read the same pure site functions scenery
    // dresses (farmsteadAt/feedlotAt), never respawn or re-derive them
    const home = (rand, species, hx, hz, n, spread = 6) => {
      for (let i = 0; i < n; i++) {
        const { g, legs } = mkAnimal(species, rand);
        const ax = hx + (rand() - 0.5) * spread, az = hz + (rand() - 0.5) * spread;
        g.position.set(ax, hAt(ax, az), az);
        g.rotation.y = rand() * Math.PI * 2;
        group.add(g);
        animals.push({
          g, legs, species, homeX: hx, homeZ: hz,
          state: 'idle', stateT: rand() * 3, ambling: false, zigT: 0,
          heading: rand() * Math.PI * 2, phase: rand() * Math.PI * 2,
        });
      }
    };

    const farm = farmsteadAt(cx, cz);
    if (farm) {
      const fr = seededRand('farmherd' + key);
      const ag = agAt(farm.x, farm.z);
      // main herd species rolled from the county's own inventory mix; horse
      // counts are working-animal counts (tiny next to cattle inventories),
      // so they're weighted up to read as the horse country they are
      const mix = [['longhorn', ag.cattle], ['horse', ag.horses * 30], ['goat', ag.goats * 3], ['sheep', ag.sheep * 3]];
      const total = mix.reduce((s, [, w]) => s + w, 0);
      let roll = fr() * total, species = 'longhorn';
      for (const [sp, w] of mix) { roll -= w; if (roll <= 0) { species = sp; break; } }
      const size = species === 'horse' ? 2 + ((fr() * 3) | 0) : species === 'longhorn' ? 4 + ((fr() * 4) | 0) : 5 + ((fr() * 5) | 0);
      for (let tries = 0; tries < 4; tries++) { // pasture off the buildings, off the road
        const ang = fr() * Math.PI * 2, d = 12 + fr() * 6;
        const hx = farm.x + Math.cos(ang) * d, hz = farm.z + Math.sin(ang) * d;
        if (!inTexas(hx, hz) || nearestRoad(hx, hz, 6)) continue;
        home(fr, species, hx, hz, size);
        break;
      }
      // and a horse or two by the corral — farms read as horse places
      const cr = Math.cos(farm.rot), sr = Math.sin(farm.rot);
      const px = farm.x - 3.6 * cr + 10.5 * sr, pz = farm.z + 3.6 * sr + 10.5 * cr;
      if (inTexas(px, pz) && !nearestRoad(px, pz, 6)) home(fr, 'horse', px, pz, 1 + ((fr() * 2) | 0), 3);
    }

    const lot = feedlotAt(cx, cz);
    if (lot) {
      const lr = seededRand('feedcattle' + key);
      for (const p of lot.pens) home(lr, 'angus', p.x, p.z, 4 + ((lr() * 3) | 0), 3); // leash 2.2 keeps them penned
    }

    if (cx === BISON_SITE.cx && cz === BISON_SITE.cz)
      home(seededRand('bisonherd'), 'bison', BISON_SITE.x, BISON_SITE.z, 6, 12);

    // wave-5 ranch HQ compounds — signature herds at the same ranchHQAt site
    // scenery dresses; own stream, drawn after everything above
    const hq = ranchHQAt(cx, cz);
    if (hq) {
      const qr = seededRand('hqherd' + key);
      const SIG = { // [species, head, spread, 'pen' homes one bunch per corral]
        king: [['santagertrudis', 8, 7], ['santagertrudis', 6, 7], ['horse', 2, 3]],
        foursixes: [['horse', 2, 3, 'pen'], ['horse', 5, 8], ['angus', 3, 6]],
        waggoner: [['angus', 6, 7], ['longhorn', 4, 6]],
        yo: [['axisdeer', 5, 8], ['blackbuck', 4, 7]],
        ja: [['bison', 6, 8], ['longhorn', 4, 6]],           // Goodnight's other herd
        xit: [['longhorn', 8, 8], ['longhorn', 5, 7], ['horse', 2, 3]],
        matador: [['hereford', 7, 7], ['hereford', 5, 6], ['horse', 2, 3]],
        lbj: [['hereford', 5, 6], ['deer', 3, 6]],           // the NPS registered Herefords
      };
      for (const [sp, n, spread, where] of SIG[hq.sig]) {
        if (where === 'pen') { for (const p of hq.pens) home(qr, sp, p.x, p.z, n, spread); continue; }
        for (let tries = 0; tries < 4; tries++) { // pasture off the buildings, off the road
          const ang = qr() * Math.PI * 2, d = 16 + qr() * 10;
          const hx = hq.x + Math.cos(ang) * d, hz = hq.z + Math.sin(ang) * d;
          if (!inTexas(hx, hz) || nearestRoad(hx, hz, 6)) continue;
          home(qr, sp, hx, hz, n, spread);
          break;
        }
      }
    }

    this.scene.add(group);
    this.live.set(key, { group, animals });
  }
}

// --- Low-poly critters (all face -z) ---
const mat = (hex) => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
const box = (g, w, h, d, x, y, z, m) => {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  g.add(b);
  return b;
};

function mkAnimal(species, rand) {
  const g = new THREE.Group();
  const legs = [];
  const quadLegs = (positions, w, h, m) => {
    for (const [x, z] of positions) legs.push(box(g, w, h, w, x, h / 2 + 0.02, z, m));
  };
  switch (species) {
    case 'deer': {
      const tan = mat(0xa87a4a);
      box(g, 0.5, 0.5, 1.1, 0, 0.75, 0, tan);              // body
      box(g, 0.22, 0.5, 0.25, 0, 1.15, -0.55, tan);        // neck
      box(g, 0.26, 0.24, 0.4, 0, 1.45, -0.65, tan);        // head
      quadLegs([[-0.16, -0.4], [0.16, -0.4], [-0.16, 0.4], [0.16, 0.4]], 0.09, 0.55, tan);
      if (rand() < 0.5) { // bucks get antlers
        const bone = mat(0xd8cbb0);
        box(g, 0.06, 0.3, 0.06, -0.12, 1.7, -0.6, bone);
        box(g, 0.06, 0.3, 0.06, 0.12, 1.7, -0.6, bone);
      }
      box(g, 0.12, 0.18, 0.08, 0, 0.9, 0.58, mat(0xf5f0e0)); // white tail
      break;
    }
    case 'longhorn': {
      const hide = mat(rand() < 0.4 ? 0x8a5a3a : 0xb08a62);
      box(g, 0.75, 0.65, 1.5, 0, 0.85, 0, hide);
      box(g, 0.34, 0.34, 0.45, 0, 1.15, -0.9, hide);
      const horn = mat(0xe8dcc0);
      box(g, 1.9, 0.09, 0.09, 0, 1.38, -0.9, horn);          // the famous spread
      quadLegs([[-0.26, -0.55], [0.26, -0.55], [-0.26, 0.55], [0.26, 0.55]], 0.13, 0.55, hide);
      break;
    }
    case 'armadillo': {
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.28, 7, 5), mat(0x9a9088));
      shell.scale.set(1, 0.75, 1.5);
      shell.position.y = 0.24;
      g.add(shell);
      box(g, 0.12, 0.1, 0.25, 0, 0.15, -0.45, mat(0x8a8078)); // snouty head
      box(g, 0.05, 0.05, 0.4, 0, 0.12, 0.55, mat(0x8a8078));  // tail
      break;
    }
    case 'jackrabbit': {
      const fur = mat(0xb0a088);
      box(g, 0.25, 0.3, 0.45, 0, 0.3, 0, fur);
      box(g, 0.2, 0.2, 0.2, 0, 0.55, -0.25, fur);
      box(g, 0.06, 0.4, 0.1, -0.07, 0.85, -0.25, fur);       // the ears
      box(g, 0.06, 0.4, 0.1, 0.07, 0.85, -0.25, fur);
      break;
    }
    case 'roadrunner': {
      const feathers = mat(0x6a6250);
      box(g, 0.16, 0.2, 0.4, 0, 0.35, 0, feathers);
      box(g, 0.1, 0.12, 0.16, 0, 0.55, -0.25, feathers);
      box(g, 0.04, 0.04, 0.22, 0, 0.55, -0.42, mat(0x3a3a30)); // beak
      const tail = box(g, 0.05, 0.3, 0.35, 0, 0.5, 0.3, feathers);
      tail.rotation.x = -0.7; // cocked-up tail
      legs.push(box(g, 0.05, 0.25, 0.05, 0, 0.12, 0, mat(0x3a3a30)));
      break;
    }
    case 'coyote': {
      const fur = mat(0x9a8a6a);
      box(g, 0.35, 0.4, 1.0, 0, 0.55, 0, fur);
      box(g, 0.24, 0.24, 0.4, 0, 0.8, -0.6, fur);
      box(g, 0.08, 0.16, 0.08, -0.07, 1.0, -0.55, fur);      // ears
      box(g, 0.08, 0.16, 0.08, 0.07, 1.0, -0.55, fur);
      const tail = box(g, 0.12, 0.12, 0.5, 0, 0.45, 0.65, fur);
      tail.rotation.x = 0.4;
      quadLegs([[-0.12, -0.35], [0.12, -0.35], [-0.12, 0.35], [0.12, 0.35]], 0.08, 0.4, fur);
      break;
    }
    case 'hog': {
      const bristle = mat(0x4a3a30);
      box(g, 0.55, 0.5, 1.1, 0, 0.5, 0, bristle);
      box(g, 0.3, 0.3, 0.4, 0, 0.55, -0.7, bristle);
      box(g, 0.14, 0.12, 0.12, 0, 0.45, -0.95, mat(0x6a5248)); // snout
      quadLegs([[-0.18, -0.35], [0.18, -0.35], [-0.18, 0.35], [0.18, 0.35]], 0.1, 0.3, bristle);
      break;
    }
    case 'vulture': {
      const dark = mat(0x2a2622);
      box(g, 0.18, 0.12, 0.5, 0, 0, 0, dark);
      const l = box(g, 1.1, 0.03, 0.3, -0.6, 0.06, 0, dark);
      const r = box(g, 1.1, 0.03, 0.3, 0.6, 0.06, 0, dark);
      l.rotation.z = 0.18; r.rotation.z = -0.18;             // shallow V — vulture glide
      box(g, 0.1, 0.08, 0.12, 0, 0.02, -0.28, mat(0x8a3a3a)); // red head
      break;
    }
    case 'javelina': {
      const bristle = mat(0x585048);
      box(g, 0.42, 0.4, 0.8, 0, 0.42, 0, bristle);
      box(g, 0.28, 0.3, 0.35, 0, 0.45, -0.5, bristle);        // big wedge head
      box(g, 0.1, 0.1, 0.1, 0, 0.35, -0.72, mat(0x3a342e));   // snout
      box(g, 0.46, 0.12, 0.14, 0, 0.55, -0.32, mat(0x9a9080)); // the white collar
      quadLegs([[-0.14, -0.25], [0.14, -0.25], [-0.14, 0.25], [0.14, 0.25]], 0.08, 0.24, bristle);
      break;
    }
    case 'pronghorn': {
      const tan = mat(0xc28a52);
      box(g, 0.45, 0.45, 1.0, 0, 0.78, 0, tan);
      box(g, 0.4, 0.2, 0.9, 0, 0.55, 0, mat(0xf0e8d8));       // white belly band
      box(g, 0.2, 0.45, 0.22, 0, 1.12, -0.5, tan);            // neck
      box(g, 0.22, 0.22, 0.35, 0, 1.4, -0.58, tan);           // head
      box(g, 0.05, 0.22, 0.08, -0.08, 1.6, -0.52, mat(0x2a241e)); // pronged horns
      box(g, 0.05, 0.22, 0.08, 0.08, 1.6, -0.52, mat(0x2a241e));
      box(g, 0.3, 0.25, 0.12, 0, 0.85, 0.52, mat(0xf5f0e0));  // white rump patch
      quadLegs([[-0.15, -0.35], [0.15, -0.35], [-0.15, 0.35], [0.15, 0.35]], 0.08, 0.58, tan);
      break;
    }
    case 'turkey': {
      const bronze = mat(0x4a3a28);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 7, 5), bronze);
      body.scale.set(0.9, 1, 1.2);
      body.position.y = 0.45;
      g.add(body);
      box(g, 0.09, 0.3, 0.09, 0, 0.75, -0.2, bronze);         // neck
      box(g, 0.12, 0.12, 0.16, 0, 0.95, -0.26, mat(0x7a8a9a)); // bald blue-grey head
      box(g, 0.05, 0.1, 0.05, 0, 0.85, -0.3, mat(0xaa3a3a));  // wattle
      const fan = box(g, 0.7, 0.55, 0.06, 0, 0.65, 0.35, mat(0x5a4430)); // tail fan
      fan.rotation.x = -0.5;
      legs.push(
        box(g, 0.05, 0.28, 0.05, -0.08, 0.15, 0, mat(0x8a6a4a)),
        box(g, 0.05, 0.28, 0.05, 0.08, 0.15, 0, mat(0x8a6a4a))
      );
      break;
    }
    case 'gator': {
      const scale = mat(0x3a5038);
      box(g, 0.4, 0.22, 1.3, 0, 0.18, 0, scale);              // low-slung body
      box(g, 0.26, 0.14, 0.7, 0, 0.14, -0.9, scale);          // flat snout
      const tail = box(g, 0.22, 0.16, 0.9, 0, 0.16, 1.05, mat(0x32462f));
      tail.rotation.y = 0.12;
      for (const z of [-0.3, 0.1, 0.5]) box(g, 0.1, 0.08, 0.2, 0, 0.32, z, mat(0x2e4030)); // back ridge
      box(g, 0.05, 0.06, 0.05, -0.09, 0.26, -0.75, mat(0xe8e0c0)); // eyes above the waterline
      box(g, 0.05, 0.06, 0.05, 0.09, 0.26, -0.75, mat(0xe8e0c0));
      quadLegs([[-0.24, -0.35], [0.24, -0.35], [-0.24, 0.55], [0.24, 0.55]], 0.09, 0.14, scale);
      break;
    }
    case 'rattlesnake': {
      const diamond = mat(0x8a7248);
      const coil1 = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.08, 6, 12).rotateX(Math.PI / 2), diamond);
      coil1.position.y = 0.08;
      const coil2 = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.07, 6, 10).rotateX(Math.PI / 2), diamond);
      coil2.position.y = 0.2;
      g.add(coil1, coil2);
      box(g, 0.12, 0.1, 0.18, 0, 0.36, -0.14, mat(0x7a6238)); // raised head
      box(g, 0.06, 0.14, 0.06, 0.24, 0.2, 0.18, mat(0xd8cba8)); // the rattle, up and ready
      break;
    }
    case 'pelican': {
      const white = mat(0xe8e4da);
      box(g, 0.24, 0.18, 0.6, 0, 0, 0, white);                // body
      const l = box(g, 1.3, 0.03, 0.34, -0.7, 0.06, 0, white);
      const r = box(g, 1.3, 0.03, 0.34, 0.7, 0.06, 0, white);
      l.rotation.z = 0.12; r.rotation.z = -0.12;
      box(g, 0.3, 0.03, 0.34, -1.32, 0.13, 0, mat(0x2a2622)); // dark wingtips
      box(g, 0.3, 0.03, 0.34, 1.32, 0.13, 0, mat(0x2a2622));
      box(g, 0.14, 0.14, 0.18, 0, 0.08, -0.36, white);        // head
      box(g, 0.06, 0.05, 0.34, 0, 0.02, -0.58, mat(0xd8a04a)); // the famous beak
      break;
    }
    case 'horse': {
      const coat = mat([0x6a4226, 0x4a3220, 0x2e2824, 0xb08a5a][(rand() * 4) | 0]); // chestnut/bay/black/palomino
      box(g, 0.45, 0.5, 1.25, 0, 0.95, 0, coat);              // body
      const neck = box(g, 0.2, 0.55, 0.28, 0, 1.35, -0.55, coat);
      neck.rotation.x = 0.35;
      box(g, 0.2, 0.22, 0.48, 0, 1.6, -0.72, coat);           // head
      const dark = mat(0x2a221c);
      box(g, 0.08, 0.45, 0.12, 0, 1.42, -0.44, dark);         // mane
      const tail = box(g, 0.1, 0.5, 0.1, 0, 0.85, 0.66, dark);
      tail.rotation.x = 0.25;
      quadLegs([[-0.16, -0.45], [0.16, -0.45], [-0.16, 0.45], [0.16, 0.45]], 0.09, 0.7, coat);
      break;
    }
    case 'goat': {
      const mohair = mat(0xe4ddcc);
      box(g, 0.3, 0.34, 0.62, 0, 0.48, 0, mohair);
      box(g, 0.16, 0.2, 0.26, 0, 0.72, -0.36, mohair);        // head
      const horn = mat(0x9a8a70);
      const h1 = box(g, 0.05, 0.05, 0.2, -0.07, 0.84, -0.28, horn);
      const h2 = box(g, 0.05, 0.05, 0.2, 0.07, 0.84, -0.28, horn);
      h1.rotation.x = h2.rotation.x = -0.9;                   // swept back
      box(g, 0.06, 0.12, 0.06, 0, 0.58, -0.44, mohair);       // beard
      quadLegs([[-0.1, -0.2], [0.1, -0.2], [-0.1, 0.2], [0.1, 0.2]], 0.07, 0.3, mohair);
      break;
    }
    case 'sheep': {
      const wool = mat(0xece6d8);
      const face = mat(0x5a5048);
      box(g, 0.4, 0.4, 0.72, 0, 0.52, 0, wool);
      box(g, 0.16, 0.18, 0.24, 0, 0.66, -0.44, face);
      quadLegs([[-0.12, -0.24], [0.12, -0.24], [-0.12, 0.24], [0.12, 0.24]], 0.07, 0.3, face);
      break;
    }
    case 'bison': {
      const shag = mat(0x4a3626);
      const dark = mat(0x352820);
      box(g, 0.85, 0.75, 1.05, 0, 0.95, -0.25, shag);         // massive front + hump
      box(g, 0.6, 0.55, 0.8, 0, 0.8, 0.55, dark);             // lower hindquarters
      box(g, 0.4, 0.42, 0.45, 0, 0.72, -0.85, shag);          // low-slung head
      box(g, 0.34, 0.2, 0.2, 0, 0.5, -0.9, dark);             // beard
      const horn = mat(0xd8cbb0);
      box(g, 0.24, 0.06, 0.06, -0.26, 0.95, -0.82, horn);
      box(g, 0.24, 0.06, 0.06, 0.26, 0.95, -0.82, horn);
      quadLegs([[-0.24, -0.5], [0.24, -0.5], [-0.22, 0.6], [0.22, 0.6]], 0.12, 0.55, dark);
      break;
    }
    case 'angus': {
      const hide = mat(rand() < 0.85 ? 0x1e1a18 : 0x2e2420);  // feedlot black, no horns
      box(g, 0.7, 0.6, 1.35, 0, 0.78, 0, hide);
      box(g, 0.3, 0.3, 0.42, 0, 1.0, -0.85, hide);
      if (rand() < 0.25) box(g, 0.26, 0.18, 0.16, 0, 1.02, -1.02, mat(0xe8e0d4)); // the odd baldy face
      quadLegs([[-0.24, -0.5], [0.24, -0.5], [-0.24, 0.5], [0.24, 0.5]], 0.12, 0.5, hide);
      break;
    }
    case 'santagertrudis': {
      const hide = mat(0x7a2e1e);                             // the cherry-red breed color
      box(g, 0.72, 0.62, 1.4, 0, 0.8, 0, hide);
      box(g, 0.3, 0.3, 0.44, 0, 1.02, -0.88, hide);
      box(g, 0.26, 0.16, 0.3, 0, 0.55, -0.9, mat(0x6a2818));  // the Brahman dewlap
      quadLegs([[-0.24, -0.5], [0.24, -0.5], [-0.24, 0.5], [0.24, 0.5]], 0.12, 0.5, hide);
      break;
    }
    case 'axisdeer': {
      const rust = mat(0xb5713a);                             // brighter rusty coat than a whitetail
      box(g, 0.5, 0.5, 1.1, 0, 0.75, 0, rust);
      box(g, 0.22, 0.5, 0.25, 0, 1.15, -0.55, rust);
      box(g, 0.26, 0.24, 0.4, 0, 1.45, -0.65, rust);
      const spot = mat(0xf5f0e0);
      for (const [sx, sy, sz] of [[-0.26, 0.85, -0.3], [0.26, 0.8, 0.1], [-0.26, 0.7, 0.35], [0.26, 0.92, -0.15]])
        box(g, 0.05, 0.05, 0.05, sx, sy, sz, spot);           // the lifelong spots
      if (rand() < 0.5) {                                     // tall lyre antlers
        const bone = mat(0xd8cbb0);
        box(g, 0.06, 0.55, 0.06, -0.12, 1.85, -0.6, bone);
        box(g, 0.06, 0.55, 0.06, 0.12, 1.85, -0.6, bone);
      }
      quadLegs([[-0.16, -0.4], [0.16, -0.4], [-0.16, 0.4], [0.16, 0.4]], 0.09, 0.55, rust);
      break;
    }
    case 'hereford': {
      const hide = mat(0x8a4028), face = mat(0xf0ece0);       // red coat, the famous white face
      box(g, 0.7, 0.6, 1.35, 0, 0.78, 0, hide);
      box(g, 0.3, 0.3, 0.42, 0, 1.0, -0.85, face);
      box(g, 0.72, 0.16, 1.0, 0, 0.52, 0, face);              // white underline
      quadLegs([[-0.24, -0.5], [0.24, -0.5], [-0.24, 0.5], [0.24, 0.5]], 0.12, 0.5, hide);
      break;
    }
    case 'blackbuck': {
      const dark = mat(0x2e2a26), white = mat(0xf0ead8);
      box(g, 0.4, 0.42, 0.9, 0, 0.62, 0, dark);               // near-black back
      box(g, 0.38, 0.18, 0.88, 0, 0.42, 0, white);            // white belly
      box(g, 0.18, 0.4, 0.2, 0, 0.95, -0.45, dark);           // neck
      box(g, 0.2, 0.2, 0.32, 0, 1.2, -0.52, dark);            // head
      box(g, 0.1, 0.08, 0.1, 0, 1.18, -0.68, white);          // white muzzle
      const horn = mat(0x1e1a16);
      const h1 = box(g, 0.05, 0.6, 0.05, -0.08, 1.55, -0.45, horn);
      const h2 = box(g, 0.05, 0.6, 0.05, 0.08, 1.55, -0.45, horn);
      h1.rotation.z = 0.12; h2.rotation.z = -0.12;            // the corkscrew V
      quadLegs([[-0.13, -0.32], [0.13, -0.32], [-0.13, 0.32], [0.13, 0.32]], 0.07, 0.42, white);
      break;
    }
  }
  return { g, legs: legs.length ? legs : null };
}
