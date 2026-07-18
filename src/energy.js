// Energy — the announcer + the Energy log (11th collectible). W2 ships the
// machinery; later waves only register their site tables here (spec: no new
// announcer code after W2). Announcer: nearing a *named* site fires a HUD
// toast with its real name + one info fragment, every approach (ufoSighting
// cadence — armed per site, re-arms on exit, unnamed sites silent, no
// invented names). The log stays the once-per-save layer on hero sites.
import * as THREE from 'three';
import { GEO, hAt, nearestAnyRoad, nearestRiver, seededRand } from './geo.js';
import { mkTurbineBodyGeo, mkTurbineBladeGeo, TURBINE_HUB_Y, mergeGeoms } from './world.js';
import { ATMOS } from './sky.js';
import { fadeDisc } from './maritime.js';

const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];

// Hero sites — hand-authored real places (airports idiom), grown per wave.
// id is the save key (save.energy) — never rename a shipped id.
export const HEROES = [
  {
    // real Spindletop is LL(30.024, -94.053) — that lands ON a road here;
    // shoved 12u to the probed clear plot (road ≥9, city/airport clear)
    id: 'spindletop', name: 'Spindletop', at: [5191.6, 1096.9], kind: 'gusher',
    fact: 'the 1901 Lucas Gusher blew 100,000 barrels a day and started the oil age',
    info: 'where the oil age began, 1901',
  },
  {
    id: 'midland-tanks', name: 'Midland Tank Farm', at: LL(31.943, -102.03), kind: 'tankfarm',
    fact: 'Permian crude stages in these tanks before the pipelines carry it east',
    info: 'crude storage for the Permian Basin',
  },
  // W3 wind heroes — anchored inside their real baked windFarms[] cluster
  // (aggregate-only data, no per-turbine names), nudged off any road the
  // Spindletop way; the real spinning fleet surrounds each marker.
  {
    id: 'roscoe', name: 'Roscoe Wind Farm', at: [-998.5, -1792.7], kind: 'windfarm',
    fact: "627 turbines across five West Texas counties made this the world's largest wind farm at its 2009 completion",
    info: "Nolan County's cotton-field turbines",
  },
  {
    id: 'horsehollow', name: 'Horse Hollow Wind Energy Center', at: [-524.8, -1324.7], kind: 'windfarm',
    fact: '421 turbines across Taylor and Nolan counties made this one of the largest wind farms on Earth at its 2006 completion',
    info: 'a record-setting wind farm, 2006',
  },
  {
    id: 'papalote', name: 'Papalote Creek Wind Farm', at: [1664.7, 3380.0], kind: 'windfarm',
    fact: "San Patricio County's Gulf breeze blows almost every afternoon — ideal, steady wind for a coastal farm",
    info: 'coastal wind, San Patricio County',
  },
  // W4 refinery heroes — anchored beside their baked refineries[] record
  // (the skyline itself is the site's hero kit; the marker is the parking
  // spot), nudged off any road the Spindletop way. `site` names the baked
  // record so buildRefineries upgrades it to the hero dressing.
  {
    id: 'shipchannel', name: 'Deer Park Refinery', at: [4174.9, 1421.1], kind: 'refinery',
    site: 'PEMEX Deer Park Refinery',
    fact: 'a century of crude on the Houston Ship Channel — Mexico bought the whole 340,000-barrel-a-day refinery outright in 2022',
    info: "the Ship Channel's century-old giant",
  },
  {
    id: 'baytown', name: 'Baytown Refinery', at: [4285.7, 1390.3], kind: 'refinery',
    site: 'ExxonMobil Baytown Refinery',
    fact: 'refining on Galveston Bay since 1920 — one of the largest industrial complexes in the country at 560,000 barrels a day',
    info: 'refining Galveston Bay crude since 1920',
  },
  {
    id: 'motiva', name: 'Motiva Port Arthur Refinery', at: [5289.6, 1240.8], kind: 'refinery',
    site: 'Motiva Port Arthur Refinery',
    fact: 'the largest refinery in North America — 630,000 barrels of crude a day, a city of steel where Texaco started in 1902',
    info: 'the largest refinery in North America',
  },
  {
    id: 'corpus', name: 'Corpus Christi Refinery Row', at: [1956.1, 3546.7], kind: 'refinery',
    site: 'Valero Refinery Corpus Christi East',
    fact: "refinery row lines the Corpus ship channel — Valero runs its hometown plants a short drive from its headquarters",
    info: "Valero's hometown refinery row",
  },
  // W5 hero plants — baked plants[] coords (already road-clear >=24u, no shove
  // needed, unlike Spindletop); `look` picks the buildHeroes model branch.
  {
    id: 'stp', name: 'South Texas Project Electric Generating Station', at: [3298.2, 2451.7], kind: 'plant', look: 'nuclear',
    fact: 'two reactors generate 2,700 megawatts, cooled by a dedicated 7,000-acre reservoir built just for the plant — no river runs through it',
    info: 'twin reactors, a lake built to cool them',
  },
  {
    id: 'comanchepeak', name: 'Comanche Peak Nuclear Power Plant', at: [1637.3, -1443.7], kind: 'plant', look: 'nuclear',
    fact: 'two reactors on Comanche Creek Reservoir have run since 1990 and 1993, together good for about 2,400 megawatts',
    info: 'nuclear power on a lake near Glen Rose',
  },
  {
    id: 'parish', name: 'W. A. Parish Electric Generating Station', at: [3687.7, 1693.6], kind: 'plant', look: 'coal',
    fact: "NRG's 3.65-gigawatt coal-and-gas giant once captured a third of one boiler's carbon dioxide and piped it 82 miles to an oil field — the country's largest carbon-capture retrofit, running again since 2023",
    info: 'coal, gas, and for a while, captured carbon',
  },
  {
    id: 'martinlake', name: 'Martin Lake Power Plant', at: [4694.6, -1401.8], kind: 'plant', look: 'coal',
    fact: 'three lignite units running since the late 1970s make this the largest coal plant in Texas and the fifth-largest in the country, burning coal dug from the ground around it',
    info: "Texas's biggest coal plant",
  },
];
export const ENERGY_TOTAL = HEROES.length;

// W5: legible corridor spacing at game scale, not real 300-500m tower
// spacing — every corridor still gets >=2 towers regardless of length.
const TOWER_SPACING = 40;
const SUBSTATION_THIN = 15; // runtime dedup before drawing (735 baked -> ~600)

export class EnergySystem {
  constructor(scene, gameplay, sky, scenery) {
    this.gameplay = gameplay;
    this.sky = sky;         // W4: refinery flares/columns register glow anchors
    this.scenery = scenery; // W4: refinery flames share ScenerySystem.flareMat
    this.onToast = null; // wired by main.js -> hud.toast
    this.heroes = HEROES; // exposed for the verify road-clearance sweep
    this.sites = [];     // announcer registry: {x, z, r, label, armed}
    this.acc = 0;        // HUD-cadence throttle
    this.cooldown = 0;   // one active toast — nearest named site wins
    this.flames = [];    // refinery flare flames, scale-flickered in update
    this.buildHeroes(scene);
    this.buildRefineries(scene);
    this.buildTowers(scene);
    this.buildSubstations(scene); // sets this.subSites (thinned) for the register loop below
    // W2 site tables: heroes + offshore platforms (name → operator → silent;
    // `ref` is baked but essentially never present — do not design around it)
    for (const h of HEROES)
      this.register(h.at[0], h.at[1], 25, `${h.kind === 'windfarm' ? '💨' : h.kind === 'refinery' ? '🏭' : h.kind === 'plant' ? '⚡' : '🛢'} ${h.name} — ${h.info}`);
    for (const p of GEO.energy.platforms) {
      const label = p.name ? `🛢 ${p.name} — ${p.operator ?? 'offshore platform'}`
        : p.operator ? `🛢 ${p.operator} platform` : null;
      if (label) this.register(p.x, p.z, p.tier === 'major' ? 22 : 14, label);
    }
    // W3: named solar plants (matches what this wave renders — unnamed solar
    // sites, and every other plant source, stay silent until their wave ships)
    for (const p of GEO.energy.plants) {
      if (p.source !== 'solar' || !p.name) continue;
      this.register(p.x, p.z, Math.max(10, p.r + 6), `☀️ ${p.name} — ${p.operator ?? 'solar farm'}`);
    }
    // W4: named refineries — heroes already registered their own labels above,
    // so a baked record claimed by a hero stays out (two toasts 6 s apart on
    // one driveway otherwise)
    const heroSites = new Set(HEROES.map((h) => h.site).filter(Boolean));
    for (const r of GEO.energy.refineries) {
      if (!r.name || heroSites.has(r.name)) continue;
      this.register(r.x, r.z, 20, `🏭 ${r.name}${r.operator ? ` — ${r.operator}` : ''}`);
    }
    // W5: named substations from the thinned draw list, further separated so
    // a metro cluster doesn't fire toasts back to back, and kept off any hero
    // plant's own substation (Parish's sits 10.6u from the Parish marker)
    const subAnnounced = [];
    for (const s of this.subSites) {
      if (!s.name) continue;
      if (HEROES.some((h) => Math.hypot(h.at[0] - s.x, h.at[1] - s.z) < 20)) continue;
      if (subAnnounced.some((p) => Math.hypot(p.x - s.x, p.z - s.z) < 20)) continue;
      subAnnounced.push(s);
      this.register(s.x, s.z, 16, `⚡ ${s.name}`);
    }
    // W4 brass at the hero skylines — main.js's unified plaqueNear merges this
    // list (maritime idiom: append a source, never a branch)
    this.plaques = [
      {
        name: 'Deer Park Refinery', at: HEROES.find((h) => h.id === 'shipchannel').at, hint: 'read the marker', sub: 'the Houston Ship Channel',
        text: 'Fifty miles of docks, tanks, and towers, and no dark hours. The Ship Channel was dredged deep in 1914, and the refineries grew along it like cane along a bayou — Deer Park has run crude here for over a century, and since 2022 it has run it for Mexico, whose national oil company bought the whole plant. Park at dusk. The flare stacks light before the streetlamps do.',
      },
      {
        name: 'Baytown Refinery', at: HEROES.find((h) => h.id === 'baytown').at, hint: 'read the marker', sub: 'since 1920',
        text: "Humble Oil broke ground on a mosquito flat in 1920, and Baytown has not stopped growing since — refinery, chemical plant, olefins plant, a wharf line of its own on Galveston Bay. Half a million barrels of crude move through here every day. The town grew up around the plant, and at night the plant returns the favor and lights the town.",
      },
      {
        name: 'Motiva Port Arthur Refinery', at: HEROES.find((h) => h.id === 'motiva').at, hint: 'read the marker', sub: 'largest in North America',
        text: "The biggest refinery on the continent sits at the end of a Gulf Coast farm road. Texaco started refining Spindletop crude on this spot in 1902; today Motiva runs 630,000 barrels a day through a plant you can see from the causeway. Port Arthur calls itself the town that oils the world, and nobody has stepped up to argue.",
      },
      {
        name: 'Corpus Christi Refinery Row', at: HEROES.find((h) => h.id === 'corpus').at, hint: 'read the marker', sub: 'refinery row',
        text: "Corpus keeps its industry in a row — refineries shoulder to shoulder along the ship channel, tank farms behind them, tankers nosing up the basin in front. Valero was born here and never left; its headquarters sit up the road in San Antonio, but the crude runs through its hometown first. The row glows sodium-orange all night, every night.",
      },
      {
        name: 'South Texas Project Electric Generating Station', at: HEROES.find((h) => h.id === 'stp').at, hint: 'read the marker', sub: 'twin reactors, Matagorda County',
        text: "Two Westinghouse reactors on the Colorado River, on line since 1988 and 1989, turning out 2,700 megawatts around the clock. There's no river cooling tower here — the plant built its own lake instead, a 7,000-acre reservoir dug just to carry the heat away. Texas keeps its nuclear power quiet and out of the way; this is where the quiet happens.",
      },
      {
        name: 'Comanche Peak Nuclear Power Plant', at: HEROES.find((h) => h.id === 'comanchepeak').at, hint: 'read the marker', sub: 'Glen Rose, since 1990',
        text: "Two reactors on Comanche Creek Reservoir, forty miles southwest of Fort Worth, together good for about 2,400 megawatts since the early '90s. Luminant runs it now; the lake that cools it doubles as a fishery, which is either reassuring or isn't, depending on how you think about it.",
      },
      {
        name: 'W. A. Parish Electric Generating Station', at: HEROES.find((h) => h.id === 'parish').at, hint: 'read the marker', sub: 'coal and gas, Fort Bend County',
        text: "NRG's 3.65-gigawatt giant southwest of Houston burns coal in one plant and gas in the other, side by side since 1977. For a few years one boiler ran the country's largest carbon-capture retrofit, piping CO2 eighty-two miles to an oil field before the economics soured — it's running again since 2023.",
      },
      {
        name: 'Martin Lake Power Plant', at: HEROES.find((h) => h.id === 'martinlake').at, hint: 'read the marker', sub: "Texas's biggest coal plant",
        text: 'Three lignite units on their own East Texas lake, burning coal strip-mined from the ground around the plant since the late 1970s. Martin Lake is the largest coal-fired plant in Texas and the fifth-largest in the country — the biggest taxpayer in two counties, and the reason the lights stay on for a long way in every direction.',
      },
    ];
  }

  // main.js's unified plaque lookup consults this (maritime.plaqueNear idiom)
  plaqueNear(pos, range) {
    for (const p of this.plaques) {
      if (Math.hypot(p.at[0] - pos.x, p.at[1] - pos.z) < range) return p;
    }
    return null;
  }

  // later waves call this with their site tables as they ship
  register(x, z, r, label) {
    this.sites.push({ x, z, r, label, armed: true });
  }

  update(dt, px, pz) {
    // flare flames: ragged scale flicker, night-gated for free by the shared
    // scenery.flareMat (its opacity rides ATMOS.night in ScenerySystem.update)
    this.flameT = (this.flameT || 0) + dt;
    for (const f of this.flames) {
      const v = 0.8 + 0.3 * Math.abs(Math.sin(this.flameT * 9 + f.phase)) + 0.1 * Math.sin(this.flameT * 23 + f.phase);
      f.obj.scale.set(v, v * 1.6, v); // tall ragged flame, not a dot
    }
    if (this.spillMat) this.spillMat.opacity = ATMOS.night * 0.3;
    this.acc += dt;
    if (this.acc < 0.4) return;
    const step = this.acc;
    this.acc = 0;
    if (this.cooldown > 0) this.cooldown -= step;
    let best = null, bd = Infinity;
    for (const s of this.sites) {
      const d = Math.hypot(s.x - px, s.z - pz);
      if (!s.armed) { if (d > s.r * 1.6) s.armed = true; continue; } // hysteresis re-arm
      if (d < s.r && d < bd) { bd = d; best = s; }
    }
    if (best && this.cooldown <= 0) {
      best.armed = false;
      this.cooldown = 6; // spam guard for dense rows — one toast, then quiet
      this.onToast?.(best.label);
    }
    // hero log — once per save, at parked-truck distance (inside the announce ring)
    for (const h of HEROES) {
      if (Math.hypot(h.at[0] - px, h.at[1] - pz) < 12) this.gameplay.logEnergy(h.id, h.name, ENERGY_TOTAL, h.fact);
    }
  }

  buildHeroes(scene) {
    const granite = new THREE.MeshLambertMaterial({ color: 0x8a8894, flatShading: true });
    const timber = new THREE.MeshLambertMaterial({ color: 0x6a5138, flatShading: true });
    const steel = new THREE.MeshLambertMaterial({ color: 0xc8ccd2, flatShading: true });
    const rust = new THREE.MeshLambertMaterial({ color: 0x9a5a30, flatShading: true });
    for (const h of HEROES) {
      const [x, z] = h.at;
      const y = hAt(x, z);
      const g = new THREE.Group();
      if (h.kind === 'gusher') {
        // the Lucas Gusher Monument — a granite obelisk — beside a wooden derrick replica
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.7, 5.4, 4), granite);
        shaft.rotation.y = Math.PI / 4;
        shaft.position.set(-2.5, 2.9, 0);
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 2.2), granite);
        plinth.position.set(-2.5, 0.25, 0);
        g.add(shaft, plinth);
        // 4-legged timber derrick, boomtown pattern
        for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 6.4, 0.22), timber);
          leg.position.set(2.5 + lx * 1.1, 3.2, lz * 1.1);
          leg.rotation.set(lz * 0.16, 0, -lx * 0.16);
          g.add(leg);
        }
        for (let b = 0; b < 3; b++) {
          const w = 2.5 - b * 0.55;
          const band = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, w), timber);
          band.position.set(2.5, 1.3 + b * 2.0, 0);
          g.add(band);
        }
        const crown = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.1), timber);
        crown.position.set(2.5, 6.5, 0);
        g.add(crown);
      } else if (h.kind === 'tankfarm') {
        // rows of big crude tanks inside berms — the Permian staging read
        const rnd = (i) => ((i * 73) % 17) / 17; // tiny fixed jitter, no RNG stream
        for (let i = 0; i < 9; i++) {
          const tx = (i % 3 - 1) * 5.2, tz = (Math.floor(i / 3) - 1) * 5.2;
          const r = 1.7 + rnd(i) * 0.5;
          const tank = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1.6, 12), i % 3 ? steel : rust);
          tank.position.set(tx, 0.8, tz);
          const berm = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.3, 4.6), new THREE.MeshLambertMaterial({ color: 0xa08a66, flatShading: true }));
          berm.position.set(tx, 0.1, tz);
          g.add(tank, berm);
        }
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 15, 8).rotateZ(Math.PI / 2), steel);
        pipe.position.set(0, 0.5, 8.2);
        g.add(pipe);
      } else if (h.kind === 'refinery') {
        // the skyline is the site's hero kit (buildRefineries); the hero plot
        // is just the parking spot — granite marker + plinth, windfarm idiom
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 2.0), granite);
        plinth.position.set(0, 0.25, 0);
        const marker = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.15), granite);
        marker.position.set(0, 1.05, 0);
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.04), rust);
        plate.position.set(0, 1.15, 0.08);
        g.add(plinth, marker, plate);
      } else if (h.kind === 'windfarm') {
        // three static hero turbines (the ScenerySystem kit, un-instanced —
        // only 3, no per-frame spin needed) beside a granite marker; the
        // real spinning fleet from windTurbinesAt surrounds this plot
        const bodyGeo = mkTurbineBodyGeo(), bladeGeo = mkTurbineBladeGeo();
        const white = new THREE.MeshLambertMaterial({ color: 0xe4e6ea, flatShading: true });
        const light = new THREE.MeshLambertMaterial({ color: 0xd0d4d8, flatShading: true });
        for (const [tx, tz, rot] of [[4, -3, 0.4], [7.5, 1.5, 0.9], [3, 5, -0.5]]) {
          const body = new THREE.Mesh(bodyGeo, white);
          body.position.set(tx, 0, tz);
          body.rotation.y = rot;
          const blade = new THREE.Mesh(bladeGeo, light);
          blade.position.set(tx, TURBINE_HUB_Y, tz);
          blade.rotation.y = rot;
          g.add(body, blade);
        }
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 2.0), granite);
        plinth.position.set(-2.5, 0.25, 0);
        const marker = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.15), granite);
        marker.position.set(-2.5, 1.05, 0);
        g.add(plinth, marker);
      } else if (h.kind === 'plant') {
        // W5: nuclear reads round (hero tier, 12-14 seg per the poly bar) — a
        // waisted cooling-tower silhouette + reactor dome; coal/gas reads
        // boxy — boiler block + a round stack (the refinery idiom)
        let topY = 8;
        if (h.look === 'nuclear') {
          const shell = new THREE.MeshLambertMaterial({ color: 0xd8dade, flatShading: true, side: THREE.DoubleSide });
          const low = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.2, 5, 14, 1, true), shell);
          low.position.set(0, 2.5, 0);
          const high = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.2, 4, 14, 1, true), shell);
          high.position.set(0, 7, 0);
          const domeMat = new THREE.MeshLambertMaterial({ color: 0xc8ccd2, flatShading: true });
          const dome = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
          dome.position.set(7, 1.6, 0);
          const domeBase = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 2.2, 12), domeMat);
          domeBase.position.set(7, 1.1, 0);
          g.add(low, high, dome, domeBase);
          topY = 9;
        } else {
          const boiler = new THREE.Mesh(new THREE.BoxGeometry(5.5, 7, 4.5), new THREE.MeshLambertMaterial({ color: 0x5c5c64, flatShading: true }));
          boiler.position.set(-1, 3.5, 0);
          const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 11, 12), new THREE.MeshLambertMaterial({ color: 0xb8bcc2, flatShading: true }));
          stack.position.set(4, 5.5, 0);
          g.add(boiler, stack);
          topY = 11;
        }
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 2.0), granite);
        plinth.position.set(-7, 0.25, 0);
        const marker = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.15), granite);
        marker.position.set(-7, 1.05, 0);
        g.add(plinth, marker);
        this.sky?.registerGlowAnchor({ x, z, y: y + topY, kind: 'plant' });
      }
      g.position.set(x, y, z);
      scene.add(g);
    }
  }

  // ===================================================================
  // W4: the refinery kit — every baked refineries[] site gets a merged
  // static skyline (airports idiom: all 33 sites collapse into 4 global
  // meshes, one per material); the 4 hero sites get the upgraded dressing.
  // Chunky proportions throughout (the W3 turbine legibility lesson — a
  // realistic taper reads as toothpicks at highway range); round forms
  // 10–12 radial segments per the poly bar. Every prop checks its own
  // road/river clearance before joining the merge (the Blue Wing law:
  // a real baked point never excuses an unchecked footprint), and each
  // prop sits at its own hAt. Flare flames are individual meshes on the
  // shared scenery.flareMat (night gate + flicker); flare tips and column
  // clusters register glow anchors into sky's W4 light pool.
  // ===================================================================
  buildRefineries(scene) {
    const parts = { steel: [], dark: [], tank: [], rust: [] };
    const spillParts = [];
    const heroBySite = new Map(HEROES.filter((h) => h.site).map((h) => [h.site, h]));
    const clear = (wx, wz) => Math.min(
      nearestAnyRoad(wx, wz, 12)?.dist ?? 99,
      nearestRiver(wx, wz, 12)?.dist ?? 99);
    // a part placer: geometry in site-local frame -> world, or null if the
    // spot fails clearance (props hug roads in real refineries; 4.5u keeps
    // the roadway + shoulder open at game scale)
    for (const site of GEO.energy.refineries) {
      const hero = heroBySite.get(site.name);
      const rnd = seededRand(`refinery:${site.x},${site.z}`);
      const rot = rnd() * Math.PI * 2, cr = Math.cos(rot), sr = Math.sin(rot);
      const s = hero ? 1.7 : 1;
      // ext = the prop's own half-extent: required clearance grows with the
      // prop so tank rims and pipe ends never overhang a road (the sampled
      // vertex sweep in energy.mjs enforces this). The authored spot is tried
      // first; a site hemmed in by metro streets retries seeded alternates
      // around the pad so its skyline lands on whatever ground is clear.
      const put = (geo, mat, lx, lz, ext = 1.2, ry = 0) => {
        for (let tryi = 0; tryi < 7; tryi++) {
          const ax = tryi === 0 ? lx : (rnd() - 0.5) * 22;
          const az = tryi === 0 ? lz : (rnd() - 0.5) * 22;
          const wx = site.x + (ax * cr + az * sr) * s, wz = site.z + (-ax * sr + az * cr) * s;
          if (clear(wx, wz) < 3.2 + ext * s) continue;
          const y = hAt(wx, wz) - 0.12; // bedded slightly so bases never hover on a slope
          geo.scale(s, s, s).rotateY(ry + rot).translate(wx, y, wz);
          parts[mat].push(geo);
          return { x: wx, z: wz, y };
        }
        return null;
      };
      // distillation columns — the skyline read
      const nCol = hero ? 5 : 3;
      let colAt = null;
      for (let i = 0; i < nCol; i++) {
        const h = (hero ? 9 : 7) + rnd() * 3, r = 0.9 + rnd() * 0.35;
        const p = put(new THREE.CylinderGeometry(r, r * 1.08, h, 10).translate(0, h / 2, 0).toNonIndexed(),
          'steel', -4 + (i % 3) * 2.2, -2 + Math.floor(i / 3) * 2.4, r + 0.2);
        if (p) colAt = { ...p, y: p.y + h * 0.7 };
      }
      // cracker: heroes get one extra-tall column pair
      if (hero) {
        put(new THREE.CylinderGeometry(1.15, 1.3, 13, 10).translate(0, 6.5, 0).toNonIndexed(), 'steel', -7.5, 1.5, 1.5);
        put(new THREE.CylinderGeometry(0.7, 0.7, 11, 10).translate(0, 5.5, 0).toNonIndexed(), 'steel', -7.5, 3.6, 0.9);
      }
      // process block + pipe rack (boxes are the correct silhouette here)
      put(new THREE.BoxGeometry(3.4, 2.6, 4.2).translate(0, 1.3, 0).toNonIndexed(), 'dark', -0.8, 3.2, 2.8, rnd() * 0.4);
      for (let i = 0; i < 3; i++) {
        put(new THREE.CylinderGeometry(0.24, 0.24, 11, 8).rotateZ(Math.PI / 2).translate(0, 0.6 + i * 0.45, 0).toNonIndexed(), 'steel', 0.5, -5.6, 5.7);
      }
      // tank farm — crude tanks, alternating white/rust (Midland idiom)
      const nTank = hero ? 6 : 2;
      for (let i = 0; i < nTank; i++) {
        const r = 2.1 + rnd() * 0.5;
        put(new THREE.CylinderGeometry(r, r, 2.1, 12).translate(0, 1.05, 0).toNonIndexed(),
          i % 3 === 2 ? 'rust' : 'tank', 5.5 + (i % 2) * 5, -3 + Math.floor(i / 2) * 5.2, r + 0.2);
      }
      // flare stacks — chunky mast + flame on the shared night-gated mat
      const nFlare = hero ? 2 : 1;
      for (let i = 0; i < nFlare; i++) {
        const fh = (hero ? 11 : 9) + rnd() * 2;
        const p = put(new THREE.CylinderGeometry(0.3, 0.42, fh, 8).translate(0, fh / 2, 0).toNonIndexed(), 'dark', 1.5 + i * 3, -8.5, 0.7);
        if (p && this.scenery?.flareMat) {
          // bulked well past a realistic flame (W3 turbine lesson — a small
          // sphere reads as an unlit stack tip at highway range)
          const flame = new THREE.Mesh(new THREE.SphereGeometry(1.05 * s, 8, 6), this.scenery.flareMat);
          flame.position.set(p.x, p.y + fh * s + 0.1, p.z); // seated on the tip, not hovering
          scene.add(flame);
          this.flames.push({ obj: flame, phase: rnd() * Math.PI * 2 });
          this.sky?.registerGlowAnchor({ x: p.x, z: p.z, y: p.y + fh * s, kind: 'flare' });
        }
      }
      // sodium-orange site light over the column cluster
      if (colAt) this.sky?.registerGlowAnchor({ x: colAt.x, z: colAt.z, y: colAt.y, kind: 'refinery' });
      // ground spill decal — clamped to real clearance, skipped below the
      // floor rather than shrunk to nothing (the solar-decal law)
      const cc = clear(site.x, site.z);
      const sr2 = Math.min(hero ? 15 : 10, cc - 1);
      if (sr2 >= 5) {
        const disc = fadeDisc(new THREE.CircleGeometry(sr2, 20).rotateX(-Math.PI / 2), sr2);
        const pos = disc.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const vx = pos.getX(i) + site.x, vz = pos.getZ(i) + site.z;
          pos.setXYZ(i, vx, hAt(vx, vz) + 0.14, vz); // draped, riding above terrain
        }
        spillParts.push(disc.toNonIndexed());
      }
    }
    const mats = {
      steel: new THREE.MeshLambertMaterial({ color: 0xc4c8ce, flatShading: true }),
      dark: new THREE.MeshLambertMaterial({ color: 0x4c4c54, flatShading: true }),
      tank: new THREE.MeshLambertMaterial({ color: 0xd8d4c6, flatShading: true }),
      rust: new THREE.MeshLambertMaterial({ color: 0x9a5a30, flatShading: true }),
    };
    this.refineryMeshes = {};
    for (const [k, list] of Object.entries(parts)) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(mergeGeoms(list), mats[k]);
      mesh.name = `refinery-${k}`;
      scene.add(mesh);
      this.refineryMeshes[k] = mesh;
    }
    if (spillParts.length) {
      this.spillMat = new THREE.MeshBasicMaterial({ color: 0xffa050, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, vertexColors: true });
      const spill = new THREE.Mesh(mergeGeoms(spillParts), this.spillMat);
      spill.name = 'refinery-spill';
      scene.add(spill);
    }
  }

  // ===================================================================
  // W5: the ERCOT spine — box-built H-frame structures (poly-bar law:
  // boxy subjects stay box-built) instanced along each baked lines345
  // corridor by arc length (trains.js arcInit/at idiom, reimplemented
  // locally — corridors are static, walked once at boot, never per frame),
  // plus a thin instanced conductor ribbon so the corridor reads as a
  // followable line from a distance, not just a dashed trail of poles.
  // A tower landing within 3u of a road/river nudges sideways rather than
  // clipping through it (the wire orientation is recomputed from the
  // actual placed points, so a nudge never kinks the conductor visibly).
  // ===================================================================
  buildTowers(scene) {
    // Bruno call (2026-07-18, post-shot): the 4-leg lattice read as too tall
    // and too busy for a repeated background element — swapped for a 2-pole
    // H-frame, which is also the more common real 345 kV structure on the
    // Texas plains (lattice towers are the exception: river crossings, dense
    // corridors). Fewer, bolder members hold a readable silhouette at range
    // where the lattice collapsed to a blur regardless of member thickness.
    // crossbar shortened (post-shot, 2026-07-18): a real corridor bends a few
    // degrees every ~40u span, so a rigid crossbar can only ever bisect its
    // two neighbor directions, not sit dead-parallel to both — the residual
    // jog at the tip scales with crossbar half-length, so a shorter arm keeps
    // that jog visually small without changing the underlying angle math.
    const parts = [];
    for (const lx of [-1.3, 1.3]) // 2 straight poles, no lean — an H-frame stands upright
      parts.push(new THREE.BoxGeometry(0.32, 8, 0.32).translate(lx, 4, 0).toNonIndexed());
    for (const y of [5.6, 7.0]) // double-circuit crossbars — the "H" rungs, and the conductor mounts
      parts.push(new THREE.BoxGeometry(2.8, 0.26, 0.26).translate(0, y, 0).toNonIndexed());
    const towerGeo = mergeGeoms(parts);
    const towerMat = new THREE.MeshLambertMaterial({ color: 0x686c74, flatShading: true });
    const wireGeo = new THREE.BoxGeometry(1, 1, 1); // unit box, scaled per-instance to the span
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x2c2c30 });

    const towerM = [], wireM = [];
    const towerRanges = []; // {len, count} per lines345 entry, same order — verify's corridor-math check
    const up = new THREE.Vector3(0, 1, 0), unitScale = new THREE.Vector3(1, 1, 1);
    for (const line of GEO.energy.lines345) {
      const pts = line.pts;
      if (pts.length < 2) { towerRanges.push({ len: 0, count: 0 }); continue; }
      const cum = [0];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
      }
      const len = cum[cum.length - 1];
      if (len <= 0) { towerRanges.push({ len: 0, count: 0 }); continue; }
      const at = (s) => {
        let lo = 0, hi = cum.length - 1;
        while (lo < hi - 1) { const mid = (lo + hi) >> 1; (cum[mid] <= s ? (lo = mid) : (hi = mid)); }
        const a = pts[lo], b = pts[lo + 1];
        const seg = cum[lo + 1] - cum[lo] || 1;
        const t = (s - cum[lo]) / seg;
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (b[0] - a[0]) / seg, (b[1] - a[1]) / seg];
      };
      const n = Math.max(1, Math.round(len / TOWER_SPACING));
      // pass 1: place points (nudged off roads/rivers) before any rotation is
      // decided, so a tower's own orientation can be derived from its ACTUAL
      // neighbors rather than the raw polyline's local tangent — the two
      // diverge wherever the corridor curves between samples or a nudge
      // fires, which read as the crossbar sitting off-axis from the wire.
      const placed = [];
      for (let i = 0; i <= n; i++) {
        const [ax, az, tx, tz] = at((len * i) / n);
        let x = ax, z = az;
        const rd = Math.min(nearestAnyRoad(x, z, 6)?.dist ?? 99, nearestRiver(x, z, 6)?.dist ?? 99);
        if (rd < 3) {
          const nx = x - tz * 4, nz = z + tx * 4; // sideways off the tangent
          const rd2 = Math.min(nearestAnyRoad(nx, nz, 6)?.dist ?? 99, nearestRiver(nx, nz, 6)?.dist ?? 99);
          if (rd2 > rd) { x = nx; z = nz; }
        }
        placed.push({ x, z, y: hAt(x, z) });
      }
      // pass 2: each tower's rotation is the (summed, unnormalized) direction
      // to its neighbor(s) — exactly what the wire segments on either side
      // use, so crossbar and conductor always stay parallel.
      const startCount = towerM.length;
      for (let i = 0; i < placed.length; i++) {
        const cur = placed[i], prv = placed[i - 1], nxt = placed[i + 1];
        let dx = 0, dz = 0;
        if (prv) { dx += cur.x - prv.x; dz += cur.z - prv.z; }
        if (nxt) { dx += nxt.x - cur.x; dz += nxt.z - cur.z; }
        const q = new THREE.Quaternion().setFromAxisAngle(up, Math.atan2(dx, dz));
        towerM.push(new THREE.Matrix4().compose(new THREE.Vector3(cur.x, cur.y, cur.z), q, unitScale));
        if (prv) {
          const segLen = Math.hypot(cur.x - prv.x, cur.z - prv.z);
          if (segLen > 0.5) {
            const wq = new THREE.Quaternion().setFromAxisAngle(up, Math.atan2(cur.x - prv.x, cur.z - prv.z));
            wireM.push(new THREE.Matrix4().compose(
              new THREE.Vector3((prv.x + cur.x) / 2, (prv.y + cur.y) / 2 + 6.3, (prv.z + cur.z) / 2),
              wq, new THREE.Vector3(0.1, 0.1, segLen)));
          }
        }
      }
      towerRanges.push({ len, count: towerM.length - startCount });
    }
    this.towerRanges = towerRanges;
    if (!towerM.length) return;
    const towers = new THREE.InstancedMesh(towerGeo, towerMat, towerM.length);
    towerM.forEach((m, i) => towers.setMatrixAt(i, m));
    towers.instanceMatrix.needsUpdate = true;
    towers.name = 'transmission-towers';
    scene.add(towers);
    this.towerMesh = towers; // exposed for the verify corridor-math check
    if (wireM.length) {
      const wires = new THREE.InstancedMesh(wireGeo, wireMat, wireM.length);
      wireM.forEach((m, i) => wires.setMatrixAt(i, m));
      wires.instanceMatrix.needsUpdate = true;
      wires.name = 'transmission-wires';
      scene.add(wires);
    }
  }

  // ===================================================================
  // W5: 735 baked >=345kV majors, runtime-thinned to a minimum separation
  // (735 -> ~600) before drawing — one vertex-color-baked box-built kit
  // (gravel pad + transformer boxes + a gantry, traffic.js's tinted-box
  // idiom) instanced once. this.subSites is the thinned list the
  // constructor's announcer loop reads right after this call returns.
  // ===================================================================
  buildSubstations(scene) {
    const kept = [];
    for (const s of GEO.energy.substations) {
      if (kept.some((k) => Math.hypot(k.x - s.x, k.z - s.z) < SUBSTATION_THIN)) continue;
      kept.push(s);
    }
    this.subSites = kept;

    const tinted = (geo, hex) => {
      const c = new THREE.Color(hex);
      const n = geo.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return geo;
    };
    const parts = [
      tinted(new THREE.BoxGeometry(4.4, 0.06, 4.4).translate(0, 0.03, 0).toNonIndexed(), 0x8a8a82), // gravel pad
      tinted(new THREE.BoxGeometry(0.9, 1.6, 1.3).translate(-1.2, 0.8, -1.2).toNonIndexed(), 0xc8ccd2), // transformer
      tinted(new THREE.BoxGeometry(0.9, 1.6, 1.3).translate(0.6, 0.8, -1.2).toNonIndexed(), 0xb8bcc2),
      tinted(new THREE.BoxGeometry(0.14, 2.2, 0.14).translate(-1.2, 1.1, 1.2).toNonIndexed(), 0x9498a0), // gantry posts
      tinted(new THREE.BoxGeometry(0.14, 2.2, 0.14).translate(1.2, 1.1, 1.2).toNonIndexed(), 0x9498a0),
      tinted(new THREE.BoxGeometry(2.6, 0.1, 0.1).translate(0, 2.2, 1.2).toNonIndexed(), 0x9498a0), // gantry crossbar
    ];
    const subGeo = mergeGeoms(parts);
    const subMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const inst = new THREE.InstancedMesh(subGeo, subMat, kept.length);
    const up = new THREE.Vector3(0, 1, 0), unitScale = new THREE.Vector3(1, 1, 1);
    kept.forEach((s, i) => {
      const rnd = seededRand(`substation:${s.x},${s.z}`);
      const q = new THREE.Quaternion().setFromAxisAngle(up, rnd() * Math.PI * 2);
      inst.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(s.x, hAt(s.x, s.z), s.z), q, unitScale));
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.name = 'substations';
    scene.add(inst);
    this.subMesh = inst; // exposed for the verify count-matches-thin check
  }
}
