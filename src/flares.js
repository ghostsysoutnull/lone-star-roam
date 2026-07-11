// Aircraft illumination flares (F in FLY): a rack of 3 charges that recharges
// over time. Launch inherits the plane's velocity plus a forward/up kick and
// flies a ballistic arc as a tracer; at apex the chute pops and it ignites,
// sinking slowly while drifting with the wind (same direction the cloud layer
// uses in sky.js) and swinging under the canopy. A grounded flare keeps
// burning where it lands until its charge runs out.
// Lights are a fixed pool created at boot and only intensity-modulated, so the
// scene's light count (and compiled shader programs) never changes mid-game.
import * as THREE from 'three';
import { hAt } from './geo.js';
import { ATMOS } from './sky.js';

const RACK = 3; // charges = max concurrent flares = pooled lights
const RECHARGE = 10; // s per charge
const G = 12; // gravity, mini-world scale (real 0.098 units/s² is unplayably floaty)
const LAUNCH_VY = 11;
const LAUNCH_BOOST = 12; // forward kick past plane speed
const CHUTE_FALL = 2.1; // parachute sink rate
const BURN = 14; // s of light from ignition
const LIGHT_I = 55; // the headlight runs 30; flares own the night
const LIGHT_R = 70;
const WIND_DRIFT = 0.5; // units/s per ATMOS.wind
const WX = 1 / Math.hypot(1, 0.3), WZ = 0.3 / Math.hypot(1, 0.3); // cloud-drift direction

export class FlareSystem {
  constructor(scene, player) {
    this.player = player;
    this.charges = RACK;
    this.recharge = 0;
    this.onSound = null;
    this.flares = [];
    const coreGeo = new THREE.SphereGeometry(0.22, 8, 6);
    const glowGeo = new THREE.SphereGeometry(1, 10, 8);
    this.pool = Array.from({ length: RACK }, () => {
      const light = new THREE.PointLight(0xffb469, 0, LIGHT_R, 1.4);
      const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: 0xfff0d0, fog: false }));
      const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
        color: 0xffa050, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
      core.visible = glow.visible = false;
      scene.add(light, core, glow);
      return { light, core, glow, used: false };
    });
    addEventListener('keydown', (e) => { if (e.code === 'KeyF' && !e.repeat) this.fire(); });
  }

  fire() {
    const p = this.player;
    if (p.mode !== 'FLY' || this.charges < 1) return false;
    let slot = this.pool.find((s) => !s.used);
    if (!slot) { // all three burning: the oldest dies for the new one
      const oldest = this.flares.shift();
      this.snuff(oldest.slot);
      slot = oldest.slot;
    }
    this.charges -= 1;
    slot.used = true;
    const fx = -Math.sin(p.heading), fz = -Math.cos(p.heading);
    this.flares.push({
      slot, t: 0, burn: 0, phase: 'ballistic',
      x: p.pos.x + fx * 3, y: p.pos.y + 0.5, z: p.pos.z + fz * 3,
      vx: fx * (p.speed + LAUNCH_BOOST), vz: fz * (p.speed + LAUNCH_BOOST),
      vy: p.vy * 0.5 + LAUNCH_VY,
    });
    this.onSound?.('launch');
    return true;
  }

  snuff(slot) {
    slot.light.intensity = 0;
    slot.core.visible = slot.glow.visible = false;
    slot.used = false;
  }

  update(dt) {
    dt = Math.min(dt, 0.05); // same clamp as Player.update — stable at headless fps
    if (this.charges < RACK) {
      this.recharge += dt;
      if (this.recharge >= RECHARGE) { this.recharge = 0; this.charges += 1; }
    } else this.recharge = 0;

    for (const f of this.flares) {
      f.t += dt;
      if (f.phase === 'ballistic') {
        f.vy -= G * dt;
        f.vx *= Math.pow(0.35, dt); f.vz *= Math.pow(0.35, dt); // launch kick bleeds off
        f.x += f.vx * dt; f.z += f.vz * dt; f.y += f.vy * dt;
        // apex (or the ground, if fired in a dive): chute pops, flare ignites
        if (f.vy <= 0 || f.y <= hAt(f.x, f.z) + 0.5) { f.phase = 'chute'; this.onSound?.('ignite'); }
      } else {
        f.burn += dt;
        if (f.burn >= BURN) { this.snuff(f.slot); f.dead = true; continue; }
        const ground = hAt(f.x, f.z) + 0.4;
        if (f.y > ground) { // still hanging: sink slowly, ride the wind
          f.y = Math.max(ground, f.y - CHUTE_FALL * dt);
          const w = ATMOS.wind * WIND_DRIFT * dt;
          f.x += WX * w; f.z += WZ * w;
        }
      }

      const s = f.slot, lit = f.phase === 'chute';
      const grounded = f.y - hAt(f.x, f.z) < 0.6;
      const swx = lit && !grounded ? Math.sin(f.t * 1.6) * 0.5 : 0;
      const swz = lit && !grounded ? Math.cos(f.t * 1.3) * 0.5 : 0;
      s.core.visible = true;
      s.core.position.set(f.x + swx, f.y, f.z + swz);
      if (lit) {
        // fade in fast on ignition, gutter out over the last 2 s, flicker always
        const fade = Math.min(1, f.burn * 3) * Math.min(1, (BURN - f.burn) / 2);
        const flick = 0.86 + 0.14 * Math.sin(f.t * 13 + Math.sin(f.t * 31) * 2);
        s.light.position.copy(s.core.position);
        s.light.intensity = LIGHT_I * fade * flick;
        s.glow.visible = true;
        s.glow.position.copy(s.core.position);
        s.glow.scale.setScalar(0.9 + 0.3 * flick);
        s.glow.material.opacity = 0.35 * fade;
      }
    }
    this.flares = this.flares.filter((f) => !f.dead);
  }
}
