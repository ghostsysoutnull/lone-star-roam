// UFO events: rare, nocturnal, elusive — weighted toward Texas's real UFO lore
// (Levelland 1957, Lubbock Lights 1951, Stephenville 2008, Marfa, Aurora 1897).
// Get close and your engine sputters and headlights flicker, like Levelland.
import * as THREE from 'three';
import { ATMOS } from './sky.js';

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

    // saucer states: approach -> hover -> dart
    const s = this.saucer;
    const d = Math.hypot(s.position.x - px, s.position.z - pz);
    this.rim.rotation.y = this.t * 2.2;

    if (this.state === 'approach') {
      s.position.lerp(this.hoverPos, Math.min(1, dt * 0.7));
      if (s.position.distanceTo(this.hoverPos) < 6) { this.state = 'hover'; this.hoverT = 18 + Math.random() * 20; }
    } else if (this.state === 'hover') {
      this.hoverT -= dt;
      s.position.y = this.hoverPos.y + Math.sin(this.t * 0.9) * 2.5;
      s.rotation.z = Math.sin(this.t * 0.7) * 0.06;
      // the beam sweeps on and off
      this.beam.visible = Math.sin(this.t * 0.35) > 0.3;
      if (this.beam.visible) {
        const len = s.position.y;
        this.beam.scale.set(1, len, 1);
        this.beam.position.y = -len / 2;
      }
      // Levelland effect within 90 units; sighting registered within 130
      if (d < 90) this.near = Math.min(1, (90 - d) / 60);
      if (d < 130 && !this.sighted) { this.sighted = true; this.onSighting?.(); }
      // approached too close, or lingered too long: dart away
      if (d < 42 || this.hoverT <= 0) {
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

  startSaucer(px, pz) {
    this.state = 'approach';
    this.sighted = false;
    const a = Math.random() * Math.PI * 2;
    this.saucer.position.set(px + Math.cos(a) * 420, 150, pz + Math.sin(a) * 420);
    // hover near (but not over) the player
    const b = Math.random() * Math.PI * 2;
    this.hoverPos = new THREE.Vector3(px + Math.cos(b) * 90, 45 + Math.random() * 25, pz + Math.sin(b) * 90);
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
