// NPCs: 12 bespoke named characters in the major cities + procedural townsfolk
// wandering every downtown. They face you, wave hello, gesture while talking,
// and their dialog reacts to weather, the hour, and your progress.
import * as THREE from 'three';
import { GEO, seededRand, nearestRoad, hAt } from './geo.js';
import { cityRadius } from './cities.js';
import { ATMOS } from './sky.js';

const TALK_R = 6, FACE_R = 10;

// name, city, look config, main lines (rotate per visit), fact
const NAMED = [
  ['Willie', 'Austin', { hat: 'stetson', hatC: 0x22201c, braids: true, shirt: 0x2a2a2a, prop: 'guitar' },
    ['Welcome to Austin! Keep it weird, partner.', 'Wrote a song about that highway you came in on.', 'Best breakfast tacos are wherever you are at sunrise.'],
    'Austin is the live music capital of the world — 250+ venues.'],
  ['Rosa', 'Houston', { dress: 0x1f7a72, hair: 0x2a2018, bun: true },
    ['Biggest city in Texas, and we still say howdy.', 'NASA’s just down the road — you can’t miss the rocket.', 'Try the kolaches. Trust me.'],
    'Houston is home to the largest medical center on Earth.'],
  ['Big Tex', 'Dallas', { scale: 2.6, hat: 'stetson', hatC: 0xe8e0d0, shirt: 0xaa2222, wave: true },
    ['HOWDY, FOLKS! Welcome to Big D!', 'You look like you could use some state fair corny dogs.', 'Everything’s bigger here. Case in point.'],
    'The frozen margarita machine was invented in Dallas in 1971.'],
  ['Elena', 'San Antonio', { dress: 0x6a3f8a, hair: 0x1a1410, flower: 0xe86a9a },
    ['Remember the Alamo? It’s right downtown.', 'The river walk is prettier than any highway.', 'Mi casa es su casa, traveler.'],
    'San Antonio’s missions are a UNESCO World Heritage site.'],
  ['Hank', 'Fort Worth', { hat: 'stetson', hatC: 0x7a5c38, vest: 0x5a4028, prop: 'lasso' },
    ['Cowtown, they call it. Real cowboys drive cattle here twice a day.', 'That lasso ain’t for show. Well, mostly.', 'Fort Worth is where the West begins.'],
    'The Stockyards run a longhorn cattle drive every single day.'],
  ['Marisol', 'El Paso', { dress: 0xd8a832, hair: 0x201810 },
    ['You made it all the way out west!', 'We’re closer to Los Angeles than to Houston out here.', 'Watch the star on the mountain light up tonight.'],
    'El Paso sits in Mountain Time — the rest of Texas is Central.'],
  ['Dusty', 'Amarillo', { hat: 'stetson', hatC: 0x8a7050, shirt: 0xb09a70, kerchief: 0xaa4a2a },
    ['Panhandle wind’ll knock your hat off.', 'Spray-paint a Cadillac while you’re here — everyone does.', 'Flat? Sure. But you can see tomorrow from here.'],
    'Amarillo means "yellow" in Spanish, for the local soil.'],
  ['Gully', 'Corpus Christi', { hat: 'bucket', hatC: 0x4a6a4a, shirt: 0x3a6a8a, prop: 'rod' },
    ['Sparkling city by the sea!', 'Redfish are running today, I can feel it.', 'Watch for shrimp boats off Padre Island.'],
    'Selena, the Queen of Tejano, called Corpus home.'],
  ['Peggy Sue', 'Lubbock', { dress: 0x3a9a9a, hair: 0xd8b860, glasses: true },
    ['Buddy Holly grew up right here.', 'That’ll be the day, sugar!', 'Stick around for the world’s flattest sunset.'],
    'Lubbock is the world’s largest cottonseed processing region.'],
  ['Chuy', 'Laredo', { hat: 'wide', hatC: 0xd8c8a0, shirt: 0xf0ead8 },
    ['Bienvenido to the border!', 'I-35 starts right here and runs clear to Minnesota.', 'Two countries, one street. That’s Laredo.'],
    'Laredo has flown seven flags — one more than the rest of Texas.'],
  ['Quill', 'Marfa', { hat: 'beret', hatC: 0x1a1a1a, shirt: 0x1a1a1a, prop: 'brush' },
    ['Artists, antelope, and lights nobody can explain.', 'The desert is the canvas. I just sign it.', 'Stick around till dark. You’ll see.'],
    'Marfa’s mystery lights have been reported since 1883.'],
  ['Cap’n Sal', 'Galveston', { hat: 'captain', hatC: 0xf0f0f0, coat: 0x24365a, beard: 0xd8d8d8 },
    ['This island was the biggest city in Texas once, before the 1900 storm.', 'The Gulf gives and the Gulf takes, friend.', 'Steady as she goes, landlubber.'],
    'The 1900 Galveston hurricane is still the deadliest US natural disaster.'],
];

// context openers — checked in order at interact time
const OPENERS = {
  storm: ['Whoa there — this one’s a real frog-strangler!', 'Lightning like that, you’d best keep moving.'],
  rain: ['Wet enough for ya?', 'Good day for ducks, not much else.'],
  dust: ['Cover your eyes — West Texas is relocating today.', 'This dust’ll paint your truck for free.'],
  night: ['You’re out late, partner.', 'Fine night for it, whatever it is you’re doing.'],
};
const PROGRESS_LINES = [
  [(c) => c.species >= 8, 'Eight critters spotted? You’re a regular naturalist!'],
  [(c) => c.cities >= 50, 'Fifty towns and counting — you’ve seen more of Texas than most Texans.'],
  [(c) => c.landmarks >= 10, 'Heard you’ve been collecting landmarks. The big hydrant too?'],
  [(c) => c.roses >= 50, 'Yellow roses in your truck bed? Somebody’s sweet on Texas.'],
];

const TOWNSFOLK_LINES = [
  'Howdy!', 'Fine day, ain’t it?', 'Y’all come back now.', 'New in town?', 'Good roads out there today.',
  'Best pie in the county, right up the street.', 'Seen any deer on the way in?', 'Don’t miss the high school game Friday.',
  'That your truck? Nice one.', 'Sure could use some rain.', 'Hot enough for ya?', 'Tell ’em Marge sent you.',
  'You ever seen them lights out by Levelland? Me neither. Officially.',
  'My cousin swears the sky stalled his truck once, out west. He don’t drive at night no more.',
];
const TOWNSFOLK_NAMES = ['Earl', 'Ruby', 'Cole', 'June', 'Wade', 'Dolly', 'Buck', 'Lupe', 'Roy', 'Faye', 'Cash', 'Ida', 'Slim', 'Pearl'];

export class NPCSystem {
  constructor(scene, getContext) {
    this.scene = scene;
    this.getContext = getContext; // () => ({ night, weather, counts })
    this.onDialog = null;
    this.onTalk = null;
    this.activeNPC = null;
    this.dialogStep = 0;
    this.convo = [];
    this.t = 0;

    // named 12 — always present
    this.named = [];
    for (const [name, cityName, look, lines, fact] of NAMED) {
      const c = GEO.cities.find((c) => c.name === cityName);
      if (!c) continue;
      const rand = seededRand('npc:' + name);
      const g = mkCharacter(look, rand);
      const R = cityRadius(c.pop);
      const a = rand() * Math.PI * 2;
      const [px, pz] = roadShoulder(c.x + Math.cos(a) * R * 0.45, c.z + Math.sin(a) * R * 0.45, R);
      g.position.set(px, hAt(px, pz), pz);
      g.rotation.y = rand() * Math.PI * 2;
      addMarker(g, look.scale || 1);
      scene.add(g);
      this.named.push({ g, name, lines, fact, visit: 0, baseRotY: g.rotation.y, wave: 0, townsfolk: false });
    }

    // townsfolk — spawned per city by proximity
    this.townByCity = new Map();
  }

  // all interactable NPCs currently live
  all() {
    let list = this.named;
    for (const folk of this.townByCity.values()) list = list.concat(folk);
    return list;
  }

  npcNear(pos, range = TALK_R) {
    let best = null, bd = range * range;
    for (const n of this.all()) {
      if (!n.g.visible) continue;
      const d = (n.g.position.x - pos.x) ** 2 + (n.g.position.z - pos.z) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  interact(pos) {
    if (this.activeNPC) { // advance / close
      this.dialogStep++;
      if (this.dialogStep >= this.convo.length) { this.activeNPC = null; this.onDialog?.(null); }
      else this.onDialog?.({ name: this.activeNPC.name, text: this.convo[this.dialogStep] });
      return;
    }
    const n = this.npcNear(pos);
    if (!n) return;
    this.activeNPC = n;
    this.dialogStep = 0;
    n.wave = 1; // greet
    const ctx = this.getContext();
    if (n.townsfolk) {
      this.convo = [TOWNSFOLK_LINES[(Math.random() * TOWNSFOLK_LINES.length) | 0]];
    } else {
      const opener =
        (ATMOS.weather === 'storm' && pick(OPENERS.storm)) ||
        (ATMOS.weather === 'rain' && pick(OPENERS.rain)) ||
        (ATMOS.weather === 'dust' && pick(OPENERS.dust)) ||
        (ctx.night > 0.6 && pick(OPENERS.night)) || null;
      const progress = PROGRESS_LINES.find(([test]) => test(ctx.counts) && Math.random() < 0.5);
      this.convo = [
        opener ?? n.lines[n.visit % n.lines.length],
        ...(opener ? [n.lines[n.visit % n.lines.length]] : []),
        ...(progress ? [progress[1]] : []),
        '📌 ' + n.fact,
      ];
      n.visit++;
    }
    this.onTalk?.();
    this.onDialog?.({ name: n.name, text: this.convo[0] });
  }

  update(dt, pos) {
    this.t += dt;
    const night = ATMOS.night > 0.6;

    // townsfolk spawn/despawn by city proximity
    for (const c of GEO.cities) {
      const d = Math.hypot(c.x - pos.x, c.z - pos.z);
      const has = this.townByCity.has(c.name);
      if (d < 500 && !has) this.spawnTownsfolk(c);
      else if (d > 650 && has) {
        for (const f of this.townByCity.get(c.name)) {
          this.scene.remove(f.g);
          f.g.traverse((o) => o.geometry?.dispose());
        }
        this.townByCity.delete(c.name);
      }
    }

    let hint = null;
    for (const n of this.all()) {
      const g = n.g;
      // townsfolk head home after dark
      if (n.townsfolk) g.visible = !night;
      if (!g.visible) continue;

      const dx = pos.x - g.position.x, dz = pos.z - g.position.z;
      const d2 = dx * dx + dz * dz;

      if (d2 < FACE_R * FACE_R) {
        // face the player
        const want = Math.atan2(dx, dz);
        g.rotation.y += shortestArc(g.rotation.y, want) * Math.min(1, dt * 6);
        if (d2 < TALK_R * TALK_R && !this.activeNPC) hint = n.name;
      } else if (n.townsfolk) {
        // wander: amble between points near home
        n.walkT -= dt;
        if (n.walkT <= 0) { n.walkT = 3 + Math.random() * 5; n.walking = Math.random() < 0.6; n.dir = Math.random() * Math.PI * 2; }
        if (n.walking) {
          const nx = g.position.x - Math.sin(n.dir) * 1.1 * dt;
          const nz = g.position.z - Math.cos(n.dir) * 1.1 * dt;
          if (Math.hypot(nx - n.homeX, nz - n.homeZ) < 14 && !nearestRoad(nx, nz, 1.5)) {
            g.position.x = nx; g.position.z = nz;
            g.position.y = hAt(nx, nz);
            g.rotation.y = n.dir;
          } else n.dir += Math.PI / 2;
        }
      } else {
        // drift back to their spot's facing
        g.rotation.y += shortestArc(g.rotation.y, n.baseRotY) * Math.min(1, dt * 1.5);
      }

      // limbs: wave on greet, gesture while talking, leg swing while walking, idle sway
      const u = g.userData;
      const talking = this.activeNPC === n;
      if (n.wave > 0) {
        n.wave -= dt;
        u.ra.rotation.z = -2.4 + Math.sin(this.t * 14) * 0.35; // arm up, waving
      } else if (talking) {
        u.ra.rotation.z = -0.5 + Math.sin(this.t * 3.2) * 0.25;
        u.la.rotation.z = 0.3 + Math.sin(this.t * 2.6 + 1) * 0.18;
      } else if (n.townsfolk && n.walking && d2 >= FACE_R * FACE_R) {
        const s = Math.sin(this.t * 5 + (n.phase || 0)) * 0.4;
        u.ll.rotation.x = s; u.rl.rotation.x = -s;
        u.la.rotation.x = -s * 0.7; u.ra.rotation.x = s * 0.7;
        u.ra.rotation.z *= 0.8;
      } else {
        u.ra.rotation.z += (0 - u.ra.rotation.z) * Math.min(1, dt * 4);
        u.la.rotation.z += (0.06 * Math.sin(this.t * 1.2 + (n.phase || 0)) - u.la.rotation.z) * Math.min(1, dt * 4);
        u.ll.rotation.x *= 0.9; u.rl.rotation.x *= 0.9;
        u.la.rotation.x *= 0.9; u.ra.rotation.x *= 0.9;
      }
      if (u.marker) u.marker.position.y = u.markerY + Math.sin(this.t * 3 + (n.phase || 0)) * 0.2;

      // walked away mid-conversation
      if (talking && d2 > TALK_R * TALK_R * 4) { this.activeNPC = null; this.onDialog?.(null); }
    }
    return hint;
  }

  spawnTownsfolk(city) {
    const rand = seededRand('folk:' + city.name);
    const n = city.pop > 400000 ? 5 : city.pop > 80000 ? 3 : 2;
    const R = cityRadius(city.pop);
    const folk = [];
    for (let i = 0; i < n; i++) {
      const g = mkCharacter(randomLook(rand), rand);
      const a = rand() * Math.PI * 2, r = R * (0.2 + rand() * 0.5);
      const [x, z] = roadShoulder(city.x + Math.cos(a) * r, city.z + Math.sin(a) * r, R);
      g.position.set(x, hAt(x, z), z);
      g.rotation.y = rand() * Math.PI * 2;
      this.scene.add(g);
      folk.push({
        g, name: TOWNSFOLK_NAMES[(rand() * TOWNSFOLK_NAMES.length) | 0],
        townsfolk: true, homeX: x, homeZ: z, walkT: rand() * 3, walking: false,
        dir: 0, wave: 0, phase: rand() * 6.28, baseRotY: g.rotation.y,
      });
    }
    this.townByCity.set(city.name, folk);
  }
}

const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// place a character on the shoulder of the nearest road — clear of buildings,
// since building placement rejects anything on the roadway
function roadShoulder(x, z, searchR) {
  const r = nearestRoad(x, z, searchR);
  if (!r) return [x, z];
  const d = Math.max(r.dist, 0.001);
  const ox = (x - r.x) / d, oz = (z - r.z) / d;
  return [r.x + ox * 2.1, r.z + oz * 2.1];
}
const shortestArc = (from, to) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

function randomLook(rand) {
  const skins = [0xd9a066, 0xb5875a, 0x8a5c3c, 0xe8b880];
  const colors = [0x8a2f2f, 0x2f5a8a, 0x3f7a3f, 0x7a5a2f, 0x6a3f7a, 0x9a8a4a, 0x4a7a8a];
  const look = { skin: skins[(rand() * skins.length) | 0], shirt: colors[(rand() * colors.length) | 0] };
  if (rand() < 0.4) look.dress = colors[(rand() * colors.length) | 0];
  if (rand() < 0.55) { look.hat = rand() < 0.7 ? 'stetson' : 'cap'; look.hatC = 0x6a5638 + ((rand() * 0x202020) | 0); }
  else look.hair = [0x2a2018, 0x4a3020, 0xd8b860, 0x888888][(rand() * 4) | 0];
  return look;
}

// --- character kit: articulated box people with looks ---
function mkCharacter(look, rand) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const skin = mat(look.skin ?? 0xd9a066);
  const bottom = mat(look.dress ?? 0x3a5077);

  // legs (pivots) — dress gets a skirt instead
  const mkLeg = (x) => {
    const p = new THREE.Group();
    p.position.set(x, 0.75, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.22), look.dress ? skin : bottom);
    leg.position.y = -0.35;
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.28), mat(0x3a2c22));
    shoe.position.set(0, -0.68, -0.03);
    p.add(leg, shoe);
    g.add(p);
    return p;
  };
  const ll = mkLeg(-0.14), rl = mkLeg(0.14);
  if (look.dress) {
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.42, 0.65, 8), mat(look.dress));
    skirt.position.y = 0.62;
    g.add(skirt);
  }

  // torso (+ vest/coat), arms with hands
  const torsoC = look.coat ?? look.dress ?? look.shirt ?? 0x8a2f2f;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.56, 0.32), mat(torsoC));
  torso.position.y = 1.06;
  g.add(torso);
  if (look.vest) {
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.44, 0.36), mat(look.vest));
    vest.position.y = 1.1;
    g.add(vest);
  }
  if (look.kerchief) {
    const k = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.3), mat(look.kerchief));
    k.position.y = 1.38;
    k.rotation.y = Math.PI / 4;
    g.add(k);
  }
  const mkArm = (x) => {
    const p = new THREE.Group();
    p.position.set(x, 1.3, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.56, 0.18), mat(torsoC));
    arm.position.y = -0.28;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), skin);
    hand.position.y = -0.6;
    p.add(arm, hand);
    g.add(p);
    return p;
  };
  const la = mkArm(-0.36), ra = mkArm(0.36);

  // head, hair/hat, extras
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.3), skin);
  head.position.y = 1.56;
  g.add(head);
  if (look.beard) {
    const beard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.1), mat(look.beard));
    beard.position.set(0, 1.46, -0.14);
    g.add(beard);
  }
  if (look.glasses) {
    for (const x of [-0.08, 0.08]) {
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.03), mat(0x222222));
      lens.position.set(x, 1.58, -0.16);
      g.add(lens);
    }
  }
  if (look.hair && !look.hat) {
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.32), mat(look.hair));
    hair.position.y = 1.74;
    g.add(hair);
    if (look.bun) {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), mat(look.hair));
      bun.position.set(0, 1.76, 0.18);
      g.add(bun);
    }
  }
  if (look.braids) {
    for (const x of [-0.16, 0.16]) {
      const braid = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.07), mat(0x5a4530));
      braid.position.set(x, 1.36, 0.1);
      g.add(braid);
    }
  }
  if (look.flower) {
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), mat(look.flower));
    f.position.set(0.14, 1.72, -0.08);
    g.add(f);
  }
  const hatC = mat(look.hatC ?? 0x8a6f4d);
  if (look.hat === 'stetson' || look.hat === 'wide') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(look.hat === 'wide' ? 0.5 : 0.38, look.hat === 'wide' ? 0.5 : 0.38, 0.05, 10), hatC);
    brim.position.y = 1.74;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.22, 8), hatC);
    crown.position.y = 1.86;
    g.add(brim, crown);
  } else if (look.hat === 'cap') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), hatC);
    cap.position.y = 1.7;
    const bill = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.16), hatC);
    bill.position.set(0, 1.72, -0.22);
    g.add(cap, bill);
  } else if (look.hat === 'beret') {
    const beret = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.09, 8), hatC);
    beret.position.set(0.05, 1.75, 0);
    beret.rotation.z = -0.15;
    g.add(beret);
  } else if (look.hat === 'bucket') {
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.16, 8), hatC);
    bucket.position.y = 1.76;
    g.add(bucket);
  } else if (look.hat === 'captain') {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 8), mat(0x1a1a2a));
    band.position.y = 1.73;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.07, 8), hatC);
    top.position.y = 1.8;
    g.add(band, top);
  }

  // props in the left hand
  if (look.prop === 'guitar') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.1, 8).rotateX(Math.PI / 2), mat(0x8a5c2a));
    body.position.set(-0.5, 0.95, -0.1);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.05), mat(0x3a2c1a));
    neck.position.set(-0.5, 1.35, -0.1);
    g.add(body, neck);
  } else if (look.prop === 'lasso') {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 6, 12), mat(0xc2a95a));
    coil.position.set(-0.42, 0.9, 0.05);
    g.add(coil);
  } else if (look.prop === 'rod') {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.5, 5), mat(0x6a5a3a));
    rod.position.set(-0.48, 1.2, 0);
    rod.rotation.z = 0.4;
    g.add(rod);
  } else if (look.prop === 'brush') {
    const brush = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 5), mat(0xaa7a3a));
    brush.position.set(-0.45, 0.85, 0);
    g.add(brush);
  }

  if (look.scale) g.scale.setScalar(look.scale);
  g.userData = { ll, rl, la, ra };
  return g;
}

function addMarker(g, scale) {
  const marker = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 4), new THREE.MeshBasicMaterial({ color: 0xffd35c }));
  marker.position.y = 2.5 / (scale || 1) + 0.4;
  marker.rotation.x = Math.PI;
  g.add(marker);
  g.userData.marker = marker;
  g.userData.markerY = marker.position.y;
}
