// Energy — the announcer + the Energy log (11th collectible). W2 ships the
// machinery; later waves only register their site tables here (spec: no new
// announcer code after W2). Announcer: nearing a *named* site fires a HUD
// toast with its real name + one info fragment, every approach (ufoSighting
// cadence — armed per site, re-arms on exit, unnamed sites silent, no
// invented names). The log stays the once-per-save layer on hero sites.
import * as THREE from 'three';
import { GEO, hAt } from './geo.js';
import { mkTurbineBodyGeo, mkTurbineBladeGeo, TURBINE_HUB_Y } from './world.js';

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
];
export const ENERGY_TOTAL = HEROES.length;

export class EnergySystem {
  constructor(scene, gameplay) {
    this.gameplay = gameplay;
    this.onToast = null; // wired by main.js -> hud.toast
    this.heroes = HEROES; // exposed for the verify road-clearance sweep
    this.sites = [];     // announcer registry: {x, z, r, label, armed}
    this.acc = 0;        // HUD-cadence throttle
    this.cooldown = 0;   // one active toast — nearest named site wins
    this.buildHeroes(scene);
    // W2 site tables: heroes + offshore platforms (name → operator → silent;
    // `ref` is baked but essentially never present — do not design around it)
    for (const h of HEROES)
      this.register(h.at[0], h.at[1], 25, `${h.kind === 'windfarm' ? '💨' : '🛢'} ${h.name} — ${h.info}`);
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
  }

  // later waves call this with their site tables as they ship
  register(x, z, r, label) {
    this.sites.push({ x, z, r, label, armed: true });
  }

  update(dt, px, pz) {
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
}
