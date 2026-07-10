// The Austin bat emergence: every evening at dusk, a serpentine ribbon of
// Mexican free-tailed bats pours out from the Congress Avenue bridge and snakes
// east over Lady Bird Lake — the largest urban bat colony on Earth, as a
// scheduled spectacle (like the Marfa Lights, but with wings). Instanced,
// time-gated by the sky clock, and a critter-log entry when watched up close.
import * as THREE from 'three';
import { seededRand, hAt } from './geo.js';

// Congress Ave bridge (30.2617 N, 97.7447 W), same projection as the pipeline
const BX = (-97.7447 + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100;
const BZ = -(30.2617 - 31) * 111320 / 100;
const N = 640;
const WINDOW = [0.775, 0.845]; // sky.t — roughly 18:36 to 20:16, while the sky still glows
const LEN = 200;               // stream length in units
const DIR = { x: 0.86, z: 0.5 }; // east-southeast, along the river
const NORM = Math.hypot(DIR.x, DIR.z);
DIR.x /= NORM; DIR.z /= NORM;
const PERP = { x: -DIR.z, z: DIR.x };

export class BatSystem {
  constructor(scene, onSpotted) {
    this.onSpotted = onSpotted;
    this.t = 0;
    this.groundY = null; // sampled lazily — terrain loads before systems boot, but be safe
    const geo = new THREE.BoxGeometry(0.7, 0.04, 0.2);
    // lighter than true black — reads as a silhouette against the dusk, not a hole
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x3a323e }), N);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false; // the stream is 260 units long; cheap enough to always draw
    scene.add(this.mesh);
    // per-bat static jitter so the ribbon has body
    const rand = seededRand('congress-bats');
    this.jit = [];
    for (let i = 0; i < N; i++) this.jit.push([(rand() - 0.5) * 3.5, (rand() - 0.5) * 2.2, (rand() - 0.5) * 3.5, rand() * Math.PI * 2]);
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.s = new THREE.Vector3(1, 1, 1);
    this.p = new THREE.Vector3();
  }

  update(dt, px, pz, skyT) {
    const active = skyT >= WINDOW[0] && skyT <= WINDOW[1];
    // only animate when the show could plausibly be on screen
    const near = (px - BX) ** 2 + (pz - BZ) ** 2 < 600 * 600;
    this.mesh.visible = active && near;
    if (!this.mesh.visible) return;
    this.t += dt;
    this.groundY ??= hAt(BX, BZ);
    // stream progress: bats emerge staggered, cycle along the path for the whole window
    const flow = (skyT - WINDOW[0]) / (WINDOW[1] - WINDOW[0]); // 0..1 over the show
    for (let i = 0; i < N; i++) {
      const [jx, jy, jz, jp] = this.jit[i];
      let u = flow * 3 - i / N; // three full waves over the show
      u -= Math.floor(u);      // wrap: continuous ribbon
      const ramp = Math.min(1, flow * 8) * Math.min(1, (1 - flow) * 8); // fade the colony in/out
      const wig = Math.sin(u * 6.0 + jp);
      this.p.set(
        BX + DIR.x * u * LEN + PERP.x * wig * 14 + jx,
        this.groundY + 2.5 + u * 20 + Math.sin(u * 9 + jp) * 2 + jy,
        BZ + DIR.z * u * LEN + PERP.z * wig * 14 + jz
      );
      // face along the flow, flap by rolling
      this.e.set(0, Math.atan2(-DIR.x, -DIR.z), Math.sin(this.t * 18 + jp) * 0.6);
      this.q.setFromEuler(this.e);
      this.s.setScalar(ramp < 0.02 ? 0.001 : ramp);
      this.m4.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    // watched from the bridge area → into the critter log
    if ((px - BX) ** 2 + (pz - BZ) ** 2 < 130 * 130) this.onSpotted?.();
  }
}
