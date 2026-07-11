// UFO events: rare, nocturnal, elusive — weighted toward Texas's real UFO lore
// (Levelland 1957, Lubbock Lights 1951, Stephenville 2008, Marfa, Aurora 1897).
// Get close and your engine sputters and headlights flicker, like Levelland.
import * as THREE from 'three';
import { ATMOS } from './sky.js';
import { hAt } from './geo.js';

const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];
// the real hotspots
const HOTSPOTS = [
  LL(33.5873, -102.378),  // Levelland
  LL(33.5779, -101.8552), // Lubbock
  LL(32.2207, -98.2023),  // Stephenville
  LL(30.3095, -104.0207), // Marfa
  LL(33.058, -97.509),    // Aurora
];

export class UFOSystem {
  constructor(scene, onSighting) {
    this.scene = scene;
    this.onSighting = onSighting; // fired once per close encounter
    this.saucer = this.mkSaucer();
    this.saucer.visible = false;
    scene.add(this.saucer);
    this.formation = this.mkFormation();
    this.formation.visible = false;
    scene.add(this.formation);
    this.state = 'idle';
    this.rollT = 30;
    this.t = 0;
    this.near = 0; // 0..1 proximity factor read by audio/vehicle (engine trouble)
    this.stalkA = 0; // bearing of the hover standoff around the player
    this.tgt = new THREE.Vector3();
  }

  mkSaucer() {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.CylinderGeometry(4.2, 5.2, 1.1, 18),
      new THREE.MeshLambertMaterial({ color: 0x8a8f9a, flatShading: true })
    );
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x9ad8d0, emissive: 0x1a4a44 })
    );
    dome.position.y = 0.5;
    g.add(hull, dome);
    // rotating rim lights
    this.rim = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 5), new THREE.MeshBasicMaterial({ color: 0x7affee }));
      const a = (i / 8) * Math.PI * 2;
      l.position.set(Math.cos(a) * 4.6, -0.2, Math.sin(a) * 4.6);
      this.rim.add(l);
    }
    g.add(this.rim);
    // abduction-style ground beam
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 4.2, 1, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xaaffcc, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })
    );
    this.beam.visible = false;
    g.add(this.beam);
    return g;
  }

  mkFormation() {
    const g = new THREE.Group();
    for (let i = 0; i < 7; i++) { // the Lubbock V
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 5), new THREE.MeshBasicMaterial({ color: 0xbfffe8, transparent: true, opacity: 0.85 }));
      const k = i - 3;
      l.position.set(k * 7, -Math.abs(k) * 2, Math.abs(k) * 5);
      g.add(l);
    }
    return g;
  }

  hotspotBoost(px, pz) {
    for (const [hx, hz] of HOTSPOTS) if (Math.hypot(hx - px, hz - pz) < 350) return 3;
    return 1;
  }

  update(dt, px, pz, py) {
    this.t += dt;
    this.near = 0;

    if (this.state === 'idle') {
      if (ATMOS.night < 0.6) return;
      this.rollT -= dt;
      if (this.rollT > 0) return;
      this.rollT = 70 + Math.random() * 80;
      const roll = Math.random();
      const p = 0.12 * this.hotspotBoost(px, pz);
      if (roll < p * 0.4) this.startFormation(px, pz);
      else if (roll < p) this.startSaucer(px, pz);
      return;
    }

    if (ATMOS.night < 0.4) { this.end(); return; } // dawn banishes them

    if (this.state === 'formation') {
      this.formT += dt;
      this.formation.position.addScaledVector(this.formVel, dt);
      this.formation.position.y = 120 + Math.sin(this.formT * 0.7) * 6;
      if (this.formT > 25) this.end();
      return;
    }

    // saucer states: approach -> hover (stalking the player) -> dart
    const s = this.saucer;
    const d = Math.hypot(s.position.x - px, s.position.z - pz);
    this.rim.rotation.y = this.t * 2.2;

    // stalk target: a standoff beside the player, above THEIR ground — or just
    // above the plane in FLY. The bearing tracks the saucer's own side of the
    // player (plus a slow circle), so the chase never crosses over the player
    // and self-triggers the too-close dart.
    // low and close, like the Levelland reports — high enough to clear the
    // truck, low enough to sit inside the chase camera's view, not overhead
    this.stalkA = Math.atan2(s.position.z - pz, s.position.x - px) + dt * 0.12;
    const tx = px + Math.cos(this.stalkA) * 36, tz = pz + Math.sin(this.stalkA) * 36;
    // clear the higher of the two grounds (hillsides), or ride above the plane
    this.tgt.set(tx, Math.max(Math.max(hAt(px, pz), hAt(tx, tz)) + 13, py + 12) + Math.sin(this.t * 0.9) * 2, tz);

    if (this.state === 'approach') {
      s.position.lerp(this.tgt, Math.min(1, dt * 0.7));
      if (s.position.distanceTo(this.tgt) < 12) { this.state = 'hover'; this.hoverT = 40 + Math.random() * 30; }
    } else if (this.state === 'hover') {
      this.hoverT -= dt;
      s.position.lerp(this.tgt, Math.min(1, dt * 2.2)); // shadows the player in any mode
      s.rotation.z = Math.sin(this.t * 0.7) * 0.06;
      // the beam sweeps on and off — length measured to the real terrain,
      // and only down where the ground is close enough to reach
      const beamLen = s.position.y - hAt(s.position.x, s.position.z);
      this.beam.visible = beamLen > 2 && beamLen < 60 && Math.sin(this.t * 0.35) > 0.3;
      if (this.beam.visible) {
        this.beam.scale.set(1, beamLen, 1);
        this.beam.position.y = -beamLen / 2;
      }
      // Levelland effect: strong at the stalking standoff; sighting within 130
      if (d < 60) this.near = Math.min(1, (60 - d) / 40);
      if (d < 130 && !this.sighted) { this.sighted = true; this.onSighting?.(); }
      // pressed too close, or lingered too long: dart away
      if (d < 18 || this.hoverT <= 0) {
        this.state = 'dart';
        const a = Math.random() * Math.PI * 2;
        this.dartVel = new THREE.Vector3(Math.cos(a) * 260, 90, Math.sin(a) * 260);
        this.beam.visible = false;
      }
    } else if (this.state === 'dart') {
      s.position.addScaledVector(this.dartVel, dt);
      s.rotation.z = 0.4;
      if (d > 900) this.end();
    }
  }

  // immediate: skip the distant approach and start hovering at the standoff
  // (the debug menu wants the encounter now, not in a minute)
  startSaucer(px, pz, immediate = false) {
    this.sighted = false;
    this.stalkA = Math.random() * Math.PI * 2;
    if (immediate) {
      this.state = 'hover';
      this.hoverT = 40 + Math.random() * 30;
      const sx = px + Math.cos(this.stalkA) * 36, sz = pz + Math.sin(this.stalkA) * 36;
      this.saucer.position.set(sx, Math.max(hAt(px, pz), hAt(sx, sz)) + 13, sz);
    } else {
      this.state = 'approach';
      const a = Math.random() * Math.PI * 2;
      this.saucer.position.set(px + Math.cos(a) * 420, hAt(px, pz) + 130, pz + Math.sin(a) * 420);
    }
    this.saucer.visible = true;
    this.saucer.rotation.set(0, 0, 0);
  }

  startFormation(px, pz) {
    this.state = 'formation';
    this.formT = 0;
    const a = Math.random() * Math.PI * 2;
    this.formation.position.set(px + Math.cos(a) * 500, 120, pz + Math.sin(a) * 500);
    const b = a + Math.PI + (Math.random() - 0.5);
    this.formVel = new THREE.Vector3(Math.cos(b) * 42, 0, Math.sin(b) * 42);
    this.formation.rotation.y = -b;
    this.formation.visible = true;
  }

  end() {
    this.state = 'idle';
    this.saucer.visible = false;
    this.formation.visible = false;
    this.beam.visible = false;
    this.near = 0;
  }
}
