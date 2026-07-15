// Bottlenose dolphins bow-riding every ferry crossing (ferries.js) — real
// Bolivar Ferry behavior. Event-species shape like bats.js/turtles.js:
// instanced, gated on a condition (here "a crossing is underway") rather than
// a sky window, critter-log entry once watched from the deck.
import * as THREE from 'three';
import { seededRand } from './geo.js';

const N = 3;
const LEAD = 5;    // units ahead of the bow
const SPOT_T = 0.15; // fraction into the crossing before they're logged — a beat after departure, not the instant you board

export class DolphinSystem {
  constructor(scene, ferries, onSpotted) {
    this.ferries = ferries;
    this.onSpotted = onSpotted;
    this.spottedRoute = null; // route key already logged this crossing
    const geo = new THREE.BoxGeometry(0.9, 0.3, 0.28);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x5a6a78, flatShading: true }), N);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    const rand = seededRand('gulf-dolphins');
    this.jit = [];
    for (let i = 0; i < N; i++) this.jit.push([1 + rand() * 3, rand() * Math.PI * 2, 0.6 + rand() * 0.5]);
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.s = new THREE.Vector3(1, 1, 1);
    this.p = new THREE.Vector3();
  }

  update(dt, t) {
    const route = this.ferries.routes.find((r) => r.phase === 'crossing');
    this.mesh.visible = !!route;
    if (!route) { this.spottedRoute = null; return; }
    const h = route.boat.rotation.y;
    const fx = -Math.sin(h), fz = -Math.cos(h), px = -fz, pz = fx;
    const bx = route.boat.position.x, by = route.boat.position.y, bz = route.boat.position.z;
    for (let i = 0; i < N; i++) {
      const [lead, phase, amp] = this.jit[i];
      const wig = Math.sin(t * 1.8 + phase) * 1.4;
      const dive = Math.sin(t * 2.6 + phase * 1.7);
      this.p.set(
        bx + fx * (LEAD + lead) + px * wig,
        by - 0.3 + Math.max(0, dive) * amp,
        bz + fz * (LEAD + lead) + pz * wig
      );
      this.e.set(0, h + wig * 0.05, dive * 0.3);
      this.q.setFromEuler(this.e);
      this.m4.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m4);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.spottedRoute !== route.key && route.t > SPOT_T) {
      this.spottedRoute = route.key;
      this.onSpotted?.();
    }
  }
}
