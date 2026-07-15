// The Malaquite dawn turtle release: on seeded summer-feeling mornings a
// clutch of Kemp's ridley hatchlings scrambles from the dune line down the
// beach into the surf — the real Padre Island National Seashore ritual, as a
// scheduled spectacle (the bats' dawn twin). Instanced, time-gated by the sky
// clock, seeded per game day, and a critter-log entry when watched up close.
import * as THREE from 'three';
import { seededRand, hAt } from './geo.js';

// Malaquite Beach visitor center (27.4326 N, 97.2968 W) — on the north ring,
// nest at the dune line, surf ~10 units east (coords validated against the ring)
const NEST = { x: 2098, z: 3971.2 };
const DIR = { x: 1, z: 0.06 };       // seaward, out the ring's east edge
const NORM = Math.hypot(DIR.x, DIR.z);
DIR.x /= NORM; DIR.z /= NORM;
const PERP = { x: -DIR.z, z: DIR.x };
const N = 48;
const CRAWL = 11;                    // units from nest to surf
const WINDOW = [0.235, 0.32];        // sky.t — first light through early morning
const ODDS = 0.45;                   // seeded release mornings (~every other day)
const SPOT_R = 40;                   // parked-truck distance, not boots-on-nest

export class TurtleSystem {
  constructor(scene, onSpotted) {
    this.onSpotted = onSpotted;
    this.day = -1;
    this.releaseToday = false;
    this.groundY = null;
    const geo = new THREE.BoxGeometry(0.22, 0.07, 0.28);
    // olive-dark shells, matte — hatchlings read as moving flecks on the sand
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x4a5442 }), N);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    const rand = seededRand('malaquite-hatch');
    this.jit = [];
    for (let i = 0; i < N; i++) this.jit.push([(rand() - 0.5) * 7, rand() * 0.5, rand() * Math.PI * 2]);
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.s = new THREE.Vector3(1, 1, 1);
    this.p = new THREE.Vector3();
  }

  update(dt, px, pz, skyT, days) {
    const day = Math.floor(days);
    if (day !== this.day) { // roll this morning's release once per game day
      this.day = day;
      this.releaseToday = seededRand(`turtle:${day}`)() < ODDS;
    }
    const active = this.releaseToday && skyT >= WINDOW[0] && skyT <= WINDOW[1];
    const near = (px - NEST.x) ** 2 + (pz - NEST.z) ** 2 < 600 * 600;
    this.mesh.visible = active && near;
    if (!this.mesh.visible) return;
    this.groundY ??= hAt(NEST.x, NEST.z);
    const flow = (skyT - WINDOW[0]) / (WINDOW[1] - WINDOW[0]); // 0..1 over the morning
    for (let i = 0; i < N; i++) {
      const [jw, jd, jp] = this.jit[i];
      // staggered scramble: each hatchling starts a beat later, crawls the full run
      const u = Math.max(0, Math.min(1, flow * 1.6 - (i / N) * 0.6));
      const ramp = Math.min(1, flow * 10) * (u >= 1 ? 0 : 1); // gone once it reaches the surf
      const wig = Math.sin(u * 22 + jp) * 0.35;               // flipper waddle
      this.p.set(
        NEST.x + DIR.x * (u * CRAWL + jd) + PERP.x * (jw + wig),
        this.groundY + 0.05,
        NEST.z + DIR.z * (u * CRAWL + jd) + PERP.z * (jw + wig)
      );
      this.e.set(0, Math.atan2(-DIR.x, -DIR.z) + wig, 0);
      this.q.setFromEuler(this.e);
      this.s.setScalar(ramp < 0.02 ? 0.001 : ramp);
      this.m4.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    // watched from the beach → into the critter log
    if ((px - NEST.x) ** 2 + (pz - NEST.z) ** 2 < SPOT_R * SPOT_R) this.onSpotted?.();
  }
}
