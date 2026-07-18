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
];
export const ENERGY_TOTAL = HEROES.length;

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
    // W2 site tables: heroes + offshore platforms (name → operator → silent;
    // `ref` is baked but essentially never present — do not design around it)
    for (const h of HEROES)
      this.register(h.at[0], h.at[1], 25, `${h.kind === 'windfarm' ? '💨' : h.kind === 'refinery' ? '🏭' : '🛢'} ${h.name} — ${h.info}`);
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
}
