// Regional wildlife: chunked spawning like scenery, but animals near the player
// are simulated — grazers shuffle, herds startle together, prey species flee
// (rabbits zigzag, roadrunners sprint down the highway), coyotes come out at
// night and howl. First close encounter with each species goes into the
// critter log with a fact. Region boxes mirror world.js scenery — keep in sync.
// Band land (LA/AR/OK/NM) gets its own flavor per neighbor state instead —
// see regionTable's band branch.
import * as THREE from 'three';
import { seededRand, inTexas, inTexasOrBand, nearestRoad, nearestAnyRoad, neighborStateAt, hAt, waterAt, agAt, bandAgAt, SEA_Y, boatableAt, coastDist } from './geo.js';
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
  spoonbill: { name: 'Roseate Spoonbill', speed: 7, fleeR: 8, behavior: 'graze', bob: false, nightMax: 0.6,
    fact: 'Not a flamingo — the pink comes from the same shrimp diet. Sweeps that spoon of a bill through the shallows like a metal detector.' },
  crane: { name: 'Whooping Crane', speed: 8, fleeR: 14, behavior: 'graze', bob: false, nightMax: 0.6,
    fact: 'The tallest bird in America, and nearly lost — the whole wild flock winters at Aransas, and every one of them gets counted.' },
  blackbear: { name: 'Black Bear', speed: 16, fleeR: 26, behavior: 'flee', bob: true,
    fact: 'Louisiana bears have been walking back into the Sabine pines for years — quiet, shy, and gone the moment they smell a truck.' },
  // Sea-Industry W2 — life offshore: sea rows spawn on gulf water (boatableAt,
  // never the land legality), ride SEA_Y instead of terrain (seaOff = resting
  // depth around the waterline), and ignore roads. bob on a sea species is the
  // porpoising arc.
  spotteddolphin: { name: 'Atlantic Spotted Dolphin', speed: 6, fleeR: 0, behavior: 'graze', bob: true, sea: true, seaOff: -0.12, leash: 30, cruise: true, // always under way — the porpoise arc is the read
    fact: 'The offshore pod — spots come with age, and the blue-water crowd rarely follows the ferries inshore.' },
  greenturtle: { name: 'Green Sea Turtle', speed: 1.2, fleeR: 0, behavior: 'lurk', bob: false, sea: true, seaOff: 0.02,
    fact: 'Grazes the Laguna Madre seagrass meadows — the shell breaks the surface like a slow stone.' },
  cownose: { name: 'Cownose Ray', speed: 2.5, fleeR: 6, behavior: 'graze', bob: false, sea: true, seaOff: 0.02,
    fact: 'Schools glide the flats like slow brown kites, wingtips breaking the surface.' },
  tarpon: { name: 'Tarpon', speed: 0, fleeR: 0, behavior: 'coil', bob: false, sea: true, seaOff: -0.05, roll: true,
    fact: 'The Silver King rolls off the jetties for a gulp of air — Port Aransas was named Tarpon before the fish moved on.' },
  gull: { name: 'Laughing Gull', event: true, sea: true, // trails the working shrimp fleet (maritime bridge)
    fact: 'Finds every working shrimp boat on the coast — the try net never lifts unwatched.' },
  bat: { name: 'Mexican Free-tailed Bat', event: true,
    fact: 'Austin hosts the largest urban bat colony on Earth.' },
  kempsridley: { name: 'Kemp’s Ridley Sea Turtle', event: true, // turtles.js dawn release at Malaquite
    fact: 'The world’s most endangered sea turtle — hatchlings released at Padre Island every summer dawn find their way back years later to nest.' },
  dolphin: { name: 'Bottlenose Dolphin', event: true, // dolphins.js bow-rides every ferry crossing
    fact: 'Bolivar Ferry riders see them almost every crossing — they ride the bow wake for the free push.' },
};
export const SPECIES_COUNT = Object.keys(SPECIES).length;

// Sea-Industry W2: jetty tarpon sites — hand-laid LL projections at the real
// passes (RANCH_ARCHES pattern, chunk-mid radii). Galveston south jetty,
// Port Aransas jetties, Brazos Santiago, Mansfield Cut.
const SEA_SITES = [
  { x: 4580.2, z: 1859.0, r: 200, rows: [['tarpon', 2, 4, 1, 0.6]] },
  { x: 2352.1, z: 3519.9, r: 200, rows: [['tarpon', 2, 4, 1, 0.6]] },
  { x: 2240.5, z: 5490.3, r: 200, rows: [['tarpon', 2, 4, 1, 0.6]] },
  { x: 2127.9, z: 4942.6, r: 200, rows: [['tarpon', 2, 4, 1, 0.6]] },
];

// Sea-Industry W2: the open gulf gets its own table — checked FIRST, since
// water is neither Texas nor band land. Flats species inshore, the pod
// offshore; the coastDist split keys rays/turtles to the shallows.
function seaTable(x, z) {
  const w = boatableAt(x, z);
  if (!w || w.kind !== 'gulf') return null; // lakes stay wild-row-free
  const d = coastDist(x, z);
  const rows = [];
  if (d > 25) rows.push(['spotteddolphin', 3, 5, 1, 0.3], ['greenturtle', 1, 1, 1, 0.12]);
  else rows.push(['cownose', 3, 6, 1, 0.3], ['greenturtle', 1, 2, 1, 0.25]);
  for (const s of SEA_SITES)
    if ((x - s.x) ** 2 + (z - s.z) ** 2 < s.r * s.r) rows.push(...s.rows);
  return rows;
}

// regional spawn tables: [species, herd min, herd max, groups per chunk, keep odds]
// boxes mirror world.js (plains/Hill Country) — keep the two files consistent
function regionTable(x, z) {
  const sea = seaTable(x, z);
  if (sea) return sea;
  if (!inTexas(x, z)) { // band land: one flavor per neighbor state, the same four the W3 ground tints paint
    const ns = neighborStateAt(x, z);
    if (ns === 'LA') return [['gator', 1, 2, 1, 0.35], ['deer', 2, 4, 1, 0.5], ['hog', 2, 4, 1, 0.5], ['armadillo', 1, 2, 1, 0.45]];
    if (ns === 'AR') return [['deer', 2, 4, 1, 0.55], ['hog', 2, 4, 1, 0.5], ['turkey', 2, 5, 1, 0.4], ['blackbear', 1, 1, 1, 0.1]];
    if (ns === 'OK') return [['deer', 2, 4, 1, 0.5], ['coyote', 1, 2, 1, 0.5], ['armadillo', 1, 2, 1, 0.45], ['jackrabbit', 1, 2, 1, 0.5]];
    if (ns === 'NM') return [['jackrabbit', 1, 2, 1, 0.55], ['roadrunner', 1, 1, 1, 0.5], ['coyote', 1, 2, 1, 0.5], ['vulture', 2, 4, 1, 0.5], ['javelina', 1, 3, 1, 0.35]];
    return []; // outside all four rings — shouldn't be reached once callers gate on inTexasOrBand
  }
  if (x > 1800 && x + z > 5200) // Gulf coast & RGV marsh
    return [['pelican', 2, 5, 1, 0.5], ['gator', 1, 2, 1, 0.3], ['longhorn', 3, 6, 1, 0.5], ['armadillo', 1, 2, 1, 0.5]];
  if (z < -2300 && x > -3300 && x < 1600) // High Plains / Panhandle
    return [['pronghorn', 3, 6, 1, 0.5], ['jackrabbit', 1, 2, 1, 0.55], ['coyote', 1, 2, 1, 0.5], ['vulture', 2, 4, 1, 0.5]];
  if (x < -2200) // Trans-Pecos desert
    return [['jackrabbit', 1, 2, 1, 0.55], ['roadrunner', 1, 1, 1, 0.55], ['coyote', 1, 2, 1, 0.55], ['vulture', 2, 4, 1, 0.55], ['javelina', 2, 5, 1, 0.4], ['rattlesnake', 1, 1, 1, 0.35]];
  if (x > 3400) { // Piney Woods
    const rows = [['deer', 2, 4, 1, 0.55], ['hog', 2, 5, 1, 0.55], ['turkey', 3, 7, 1, 0.4], ['gator', 1, 2, 1, 0.3]];
    // the Sabine strip only, APPENDED so western Piney Woods draws are untouched:
    // a rare lone bear working its way back over from Louisiana (W6a, species 29)
    if (x > 4400) rows.push(['blackbear', 1, 1, 1, 0.12]);
    return rows;
  }
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

// Aransas NWR, Blackjack Peninsula (28.26 N −96.83 W) — the wintering
// whooping cranes and their pink neighbors; one curated site, bison pattern
const ARANSAS_SITE = { x: 2547.7, z: 3050.2, cx: 9, cz: 11 };

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
    this.aransasSite = ARANSAS_SITE;
    this.ranchArches = RANCH_ARCHES; // ditto for the wave-4 arch herd boost
    this.nearby = null; // {species, d2} — nearest visible animal within NEARBY_R, for the HUD readout
    // Sea-Industry W2: gull flock anchors — live working-shrimper positions,
    // written by main.js each frame from maritime (no maritime import here)
    this.seaFlocks = [];
    this.gullGroup = null; // lazy pool, built on first working shrimper in range
    this.gulls = [];
    // Sea-Industry W3: fish finder — one reused ping ring, lazy-built
    this.onSonar = null;   // (msg) => toast
    this.sonarCd = 0;
    this.sonarRing = null;
    this.sonarFade = 0;
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

    this.updateGulls(dt, px, pz);

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

  // Sea-Industry W2: laughing gulls wheel over the nearest working shrimper.
  // Event species (bats pattern): a 4-bird pool follows the closest anchor
  // within range; no anchor, no gulls. Logged like any close encounter.
  updateGulls(dt, px, pz) {
    let anchor = null, ad = Infinity;
    for (const f of this.seaFlocks) {
      const d = Math.hypot(f.x - px, f.z - pz);
      if (d < 260 && d < ad) { ad = d; anchor = f; }
    }
    if (!anchor) { if (this.gullGroup) this.gullGroup.visible = false; return; }
    if (!this.gullGroup) {
      this.gullGroup = new THREE.Group();
      const rand = seededRand('gullflock');
      for (let i = 0; i < 4; i++) {
        const { g } = mkAnimal('gull', rand);
        this.gullGroup.add(g);
        this.gulls.push({ g, phase: rand() * Math.PI * 2, r: 5 + rand() * 5, h: 2.5 + rand() * 3, spd: 0.55 + rand() * 0.3 });
      }
      this.scene.add(this.gullGroup);
    }
    this.gullGroup.visible = true;
    for (const b of this.gulls) {
      b.phase += dt * b.spd;
      b.g.position.set(
        anchor.x + Math.cos(b.phase) * b.r,
        SEA_Y + b.h + Math.sin(b.phase * 2.1) * 0.8,
        anchor.z + Math.sin(b.phase) * b.r
      );
      b.g.rotation.y = -b.phase - Math.PI / 2;
      b.g.rotation.z = 0.2; // banked into the wheel
    }
    if (ad < SPOT_R && this.py < 15) this.onSpotted?.('gull');
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
      const r = nearestAnyRoad(a.g.position.x, a.g.position.z, 20);
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
    if (spec.behavior === 'coil') { // rattlesnakes (and tarpon) hold their ground
      if (spec.roll) {
        // Sea W2.1 tarpon: calm lurk broken by the Silver King leap. The first
        // cut was a stationary ±52° z-rock — it read as a small submarine
        // (Bruno, 2026-07-23). Now: mostly under with dorsal/tail showing and
        // a gentle sway, and every 8–18 s a ~1.2 s clear-of-the-water leap
        // with the nose pitching through the arc. First leap comes early so
        // the tour spot (and the wildlife check) see one within seconds.
        const base = SEA_Y + (spec.seaOff ?? 0);
        if (a.leap != null) {
          a.leap += dt / 1.2;
          if (a.leap >= 1) {
            a.leap = null;
            a.leapT = 8 + Math.random() * 10;
            a.g.rotation.x = 0;
          } else {
            const ph = a.leap;
            a.g.position.x -= Math.sin(a.heading) * (2.2 / 1.2) * dt; // short hop along the heading
            a.g.position.z -= Math.cos(a.heading) * (2.2 / 1.2) * dt;
            a.g.position.y = base + Math.sin(ph * Math.PI) * 1.3;    // clears the water
            a.g.rotation.y = a.heading;
            a.g.rotation.x = (ph - 0.5) * 1.6; // nose up on the rise, over and down into the dive
            a.g.rotation.z = 0;
          }
        } else {
          a.leapT = (a.leapT ?? 1 + Math.random() * 3) - dt;
          if (a.leapT <= 0) {
            a.heading = Math.random() * Math.PI * 2;
            const lx = a.g.position.x - Math.sin(a.heading) * 2.4, lz = a.g.position.z - Math.cos(a.heading) * 2.4;
            // only leap toward legal water inside the leash — else re-roll shortly
            if (boatableAt(lx, lz)?.kind === 'gulf' && Math.hypot(lx - a.homeX, lz - a.homeZ) < (spec.leash ?? 45)) a.leap = 0;
            else a.leapT = 0.5;
          }
          // between leaps: dorsal and tail tip showing, gentle breathing sway
          a.g.position.y = base - 0.06 + Math.sin(this.t * 0.7 + a.phase) * 0.08;
          a.g.rotation.z = Math.sin(this.t * 0.9 + a.phase) * 0.17;
          a.g.rotation.x = Math.sin(this.t * 0.7 + a.phase + 1.2) * 0.12; // pitch follows the bob
        }
      }
      return;
    }

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
      const onRoad = spec.roadSprint && nearestAnyRoad(a.g.position.x, a.g.position.z, 3);
      this.move(a, spec.speed * (onRoad ? 1.3 : 1), dt);
    } else {
      // idle/wander: occasionally pick a new direction and amble
      a.stateT -= dt;
      if (a.stateT <= 0) {
        a.stateT = 2 + Math.random() * 4;
        let p = spec.cruise ? 1 : spec.behavior === 'graze' ? 0.3 : spec.behavior === 'lurk' ? 0.12 : 0.6; // cruisers never idle — motion is their silhouette
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
    // sea species ride the waterline, never the terrain; a sea bob is the
    // porpoising arc — slower and taller than a land bound, so it clears water
    const baseY = spec.sea ? SEA_Y + (spec.seaOff ?? 0) : hAt(a.g.position.x, a.g.position.z);
    a.g.position.y = baseY + (moving && spec.bob ? Math.abs(Math.sin(this.t * (spec.sea ? 3 : 9) + a.phase)) * (spec.sea ? 0.45 : 0.35) : 0);
    // cownose wingtips lift clear of the surface on a slow beat
    const wings = a.g.userData.wings;
    if (wings) {
      const f = Math.sin(this.t * 2.1 + a.phase) * 0.3;
      wings[0].rotation.z = -0.12 - f;
      wings[1].rotation.z = 0.12 + f;
    }
  }

  sound(kind, cooldown) {
    if ((this.sndCd[kind] ?? 0) > 0) return;
    this.sndCd[kind] = cooldown;
    this.onSound?.(kind);
  }

  move(a, speed, dt) {
    const nx = a.g.position.x - Math.sin(a.heading) * speed * dt;
    const nz = a.g.position.z - Math.cos(a.heading) * speed * dt;
    const spec = SPECIES[a.species];
    // stay in legal water (sea) or in Texas/band land, off roads, near home
    if (spec.sea ? boatableAt(nx, nz)?.kind !== 'gulf' : !inTexasOrBand(nx, nz)) { a.heading += Math.PI; return; }
    if (Math.hypot(nx - a.homeX, nz - a.homeZ) > (spec.leash ?? 45)) { a.heading += Math.PI / 2; return; } // feedlot cattle stay penned
    if (!spec.roadSprint && !spec.sea) { // roadrunners own the road; the gulf has none
      const road = nearestAnyRoad(nx, nz, 3);
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
        const wet = SPECIES[species].sea;
        if (wet) { // sea rows want open gulf under the home — the gator search, at sea
          let found = false;
          for (let tries = 0; tries < 8; tries++) {
            const wx = baseX + rand() * CHUNK, wz = baseZ + rand() * CHUNK;
            if (boatableAt(wx, wz)?.kind === 'gulf') { hx = wx; hz = wz; found = true; break; }
          }
          if (!found) continue;
        } else {
          if (!inTexasOrBand(hx, hz)) continue;
          if (nearestAnyRoad(hx, hz, 6)) continue; // herds keep off the highway
        }
        const n = lo + ((rand() * (hi - lo + 1)) | 0);
        for (let i = 0; i < n; i++) {
          const { g, legs } = mkAnimal(species, rand);
          const ax = hx + (rand() - 0.5) * 8, az = hz + (rand() - 0.5) * 8;
          g.position.set(ax, wet ? SEA_Y + (SPECIES[species].seaOff ?? 0) : hAt(ax, az), az);
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

    // Band Parity W4 made farmsteadAt band-capable (buildings only); W5 wires
    // the census herd to band farmsteads too — same agAt||bandAgAt fallback
    // farmsteadAt/feedlotAt already use (world.js), so a band site's county
    // inventory drives the mix instead of crashing on a TX-only agAt read.
    const farm = farmsteadAt(cx, cz);
    if (farm) {
      const fr = seededRand('farmherd' + key);
      const ag = agAt(farm.x, farm.z) || bandAgAt(farm.x, farm.z);
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
        if (!inTexasOrBand(hx, hz) || nearestAnyRoad(hx, hz, 6)) continue;
        home(fr, species, hx, hz, size);
        break;
      }
      // and a horse or two by the corral — farms read as horse places
      const cr = Math.cos(farm.rot), sr = Math.sin(farm.rot);
      const px = farm.x - 3.6 * cr + 10.5 * sr, pz = farm.z + 3.6 * sr + 10.5 * cr;
      if (inTexasOrBand(px, pz) && !nearestAnyRoad(px, pz, 6)) home(fr, 'horse', px, pz, 1 + ((fr() * 2) | 0), 3);
    }

    const lot = feedlotAt(cx, cz);
    if (lot) {
      const lr = seededRand('feedcattle' + key);
      for (const p of lot.pens) home(lr, 'angus', p.x, p.z, 4 + ((lr() * 3) | 0), 3); // leash 2.2 keeps them penned
    }

    if (cx === BISON_SITE.cx && cz === BISON_SITE.cz)
      home(seededRand('bisonherd'), 'bison', BISON_SITE.x, BISON_SITE.z, 6, 12);

    if (cx === ARANSAS_SITE.cx && cz === ARANSAS_SITE.cz) {
      const ar = seededRand('aransasflock');
      home(ar, 'spoonbill', ARANSAS_SITE.x - 6, ARANSAS_SITE.z + 10, 4, 7);
      home(ar, 'crane', ARANSAS_SITE.x + 14, ARANSAS_SITE.z - 8, 3, 9);
    }

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

  // Sea-Industry W3: fish finder — BOAT + perk only, 60u scan of live `sea`
  // rows (skips event-only rows like the gull), 20s cooldown, a fading ring
  // on the water at the contact. Ring fade drives every frame regardless of
  // gate state so a live ping still dies out if the perk/mode drops mid-fade.
  sonar(player, dt) {
    if (this.sonarRing) {
      this.sonarFade = Math.max(0, this.sonarFade - dt / 6);
      this.sonarRing.material.opacity = this.sonarFade * 0.6;
      this.sonarRing.visible = this.sonarFade > 0;
    }
    this.sonarCd -= dt;
    if (player.mode !== 'BOAT' || !player.perks?.fishfinder || this.sonarCd > 0) return;
    const px = player.pos.x, pz = player.pos.z;
    let best = null, bd = 60;
    for (const { animals } of this.live.values())
      for (const a of animals) {
        const spec = SPECIES[a.species];
        if (!spec?.sea || spec.event) continue;
        const d = Math.hypot(a.g.position.x - px, a.g.position.z - pz);
        if (d < bd) { bd = d; best = a; }
      }
    if (!best) return;
    this.sonarCd = 20;
    this.onSonar?.(`🐟 Sonar contact — ${SPECIES[best.species].name}`);
    if (!this.sonarRing) {
      this.sonarRing = new THREE.Mesh(
        new THREE.RingGeometry(1.2, 1.6, 24),
        new THREE.MeshBasicMaterial({ color: 0x6ad8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })
      );
      this.sonarRing.rotation.x = -Math.PI / 2;
      this.scene.add(this.sonarRing);
    }
    this.sonarRing.position.set(best.g.position.x, SEA_Y + 0.05, best.g.position.z);
    this.sonarFade = 1;
    this.sonarRing.visible = true;
  }

  // Debug-only lever (the tours 🐻 button): conjure one animal near (x,z)
  // through the real build path — same mesh kit, behavior table, voices and
  // critter log. Natural spawn odds are untouched. Spawns the chunk first if
  // the player just teleported and update() hasn't run yet; the forced animal
  // despawns with its chunk like any other.
  forceSpawn(species, x, z) {
    const key = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
    if (!this.live.has(key)) this.spawn(key);
    const rec = this.live.get(key);
    const rand = seededRand(`force:${species}:${key}`);
    const { g, legs } = mkAnimal(species, rand);
    const spec = SPECIES[species];
    g.position.set(x, spec.sea ? SEA_Y + (spec.seaOff ?? 0) : hAt(x, z), z);
    rec.group.add(g);
    const a = {
      g, legs, species, homeX: x, homeZ: z,
      state: 'idle', stateT: 0, ambling: false, zigT: 0,
      heading: rand() * Math.PI * 2, phase: rand() * Math.PI * 2,
    };
    rec.animals.push(a);
    return a;
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
    case 'blackbear': {
      const fur = mat(0x2a221c);
      box(g, 0.7, 0.7, 1.3, 0, 0.75, 0, fur);                  // heavy body
      box(g, 0.34, 0.3, 0.3, 0, 1.15, -0.55, fur);             // shoulder hump
      box(g, 0.36, 0.34, 0.45, 0, 1.05, -0.85, fur);           // head
      box(g, 0.16, 0.12, 0.14, 0, 0.95, -1.12, mat(0x6a5a48)); // tan muzzle
      box(g, 0.1, 0.14, 0.06, -0.14, 1.28, -0.85, fur);        // round ears
      box(g, 0.1, 0.14, 0.06, 0.14, 1.28, -0.85, fur);
      quadLegs([[-0.24, -0.45], [0.24, -0.45], [-0.24, 0.45], [0.24, 0.45]], 0.16, 0.45, fur);
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
    // --- Sea-Industry W2: life offshore (y = waterline, set by the caller).
    // Round-bodied swimmers get curved geometry (the turtle-shell precedent —
    // boxes are not their correct silhouette; W6b scatter tier, 8–10 segs) ---
    case 'spotteddolphin': {
      const gray = mat(0x7a8898);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), gray);
      body.scale.set(0.32, 0.3, 1.15);                        // sleek tapered body
      g.add(body);
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), mat(0xb8c0c8));
      belly.scale.set(0.28, 0.24, 1.02);
      belly.position.y = -0.07;                               // pale underside
      g.add(belly);
      const beak = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), gray);
      beak.scale.set(0.11, 0.09, 0.3);
      beak.position.set(0, 0.02, -0.55);
      g.add(beak);
      const fin = box(g, 0.05, 0.3, 0.2, 0, 0.28, 0.05, gray); // taller raked dorsal — the surface cue
      fin.rotation.x = 0.4;
      box(g, 0.42, 0.04, 0.18, 0, 0.02, 0.58, gray);          // flukes
      box(g, 0.26, 0.03, 0.14, 0, -0.08, -0.25, gray);        // pectorals
      g.scale.setScalar(1.9); // mini-world legibility: reads from the boat, like the pelican's span
      break;
    }
    case 'greenturtle': {
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), mat(0x5a6a3a));
      shell.scale.set(1, 0.42, 1.25);
      shell.position.y = 0.1;
      g.add(shell);
      box(g, 0.14, 0.1, 0.2, 0, 0.06, -0.46, mat(0x6a7a4a));  // head, up for a breath
      const flip = mat(0x4a5a32);
      for (const [fx, fz, r] of [[-0.3, -0.2, 0.6], [0.3, -0.2, -0.6], [-0.26, 0.28, 0.9], [0.26, 0.28, -0.9]]) {
        const f = box(g, 0.3, 0.04, 0.14, fx, 0.04, fz, flip);
        f.rotation.y = r;
      }
      break;
    }
    case 'cownose': {
      const brown = mat(0x6a5038);
      const disc = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6), brown);
      disc.scale.set(0.5, 0.09, 0.62);                        // smooth disc body
      g.add(disc);
      const wings = [];
      for (const side of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 5), brown);
        w.scale.set(0.46, 0.05, 0.44);
        w.position.set(side * 0.4, 0.02, 0);
        w.rotation.z = side * 0.12; // tips rest lifted; step() beats them clear of the water
        g.add(w);
        wings.push(w);
      }
      g.userData.wings = wings;                               // step() flaps these — tips flash above water
      const nose = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 5), mat(0x5a4430));
      nose.scale.set(0.16, 0.06, 0.16);
      nose.position.set(0, 0, -0.32);
      g.add(nose);
      box(g, 0.03, 0.03, 0.5, 0, 0.02, 0.5, mat(0x4a3a2a));   // whip tail
      g.scale.setScalar(1.6); // mini-world legibility
      break;
    }
    case 'tarpon': {
      const silver = mat(0xb8c2ca);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), silver);
      body.scale.set(0.2, 0.36, 1.08);                        // deep laterally-flat body
      g.add(body);
      const back = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6), mat(0x4a5a66));
      back.scale.set(0.21, 0.16, 0.98);
      back.position.y = 0.11;                                 // dark dorsal shading
      g.add(back);
      box(g, 0.04, 0.2, 0.14, 0, 0.32, 0.18, mat(0x5a6a76));  // dorsal
      box(g, 0.05, 0.36, 0.22, 0, 0, 0.58, mat(0x8a98a2));    // forked tail (read as one)
      g.scale.setScalar(1.9); // mini-world legibility
      break;
    }
    case 'gull': {
      const white = mat(0xeeeae2);
      const grey = mat(0xa8b0b4);
      box(g, 0.16, 0.1, 0.34, 0, 0, 0, white);                // body
      const l = box(g, 0.55, 0.02, 0.2, -0.32, 0.04, 0, grey);
      const r = box(g, 0.55, 0.02, 0.2, 0.32, 0.04, 0, grey);
      l.rotation.z = 0.2; r.rotation.z = -0.2;
      box(g, 0.14, 0.02, 0.2, -0.58, 0.1, 0, mat(0x2a2622));  // black wingtips
      box(g, 0.14, 0.02, 0.2, 0.58, 0.1, 0, mat(0x2a2622));
      box(g, 0.09, 0.09, 0.11, 0, 0.06, -0.2, mat(0x30302c)); // the black hood
      box(g, 0.03, 0.03, 0.12, 0, 0.05, -0.3, mat(0xb03a30)); // red bill
      break;
    }
    case 'spoonbill': {
      const pink = mat(0xe89aa8);
      const pale = mat(0xf0e8e0);
      const bill = mat(0x8a8a80);
      box(g, 0.26, 0.24, 0.5, 0, 0.62, 0, pink);              // body
      box(g, 0.28, 0.05, 0.34, 0, 0.75, 0.04, mat(0xd06a80)); // folded wings, deeper pink
      box(g, 0.07, 0.32, 0.07, 0, 0.88, -0.24, pale);         // neck
      box(g, 0.09, 0.09, 0.13, 0, 1.05, -0.29, pale);         // head
      box(g, 0.05, 0.03, 0.28, 0, 1.02, -0.48, bill);         // the bill...
      box(g, 0.1, 0.04, 0.1, 0, 1.02, -0.64, bill);           // ...and the spoon
      box(g, 0.035, 0.5, 0.035, -0.07, 0.25, 0.04, mat(0xc05a60)); // stilt legs
      box(g, 0.035, 0.5, 0.035, 0.07, 0.25, 0.04, mat(0xc05a60));
      break;
    }
    case 'crane': {
      const white = mat(0xf2efe8);
      const dark = mat(0x2a2622);
      box(g, 0.3, 0.3, 0.6, 0, 0.95, 0, white);               // body
      box(g, 0.26, 0.06, 0.3, 0, 1.1, 0.24, mat(0x1e1c1a));   // black primaries at the tail
      const neck = box(g, 0.08, 0.55, 0.08, 0, 1.35, -0.28, white);
      neck.rotation.x = 0.18;
      box(g, 0.1, 0.1, 0.16, 0, 1.64, -0.38, white);          // head
      box(g, 0.08, 0.04, 0.07, 0, 1.7, -0.36, mat(0xb03028)); // the red crown
      box(g, 0.04, 0.04, 0.22, 0, 1.62, -0.53, mat(0x3a352e)); // spear of a bill
      box(g, 0.04, 0.85, 0.04, -0.09, 0.45, 0.04, dark);      // long legs
      box(g, 0.04, 0.85, 0.04, 0.09, 0.45, 0.04, dark);
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
