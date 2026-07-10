// Atmosphere: 12-minute day/night cycle + regional weather, driving one shared
// sky/sun/fog rig. Other systems read ATMOS (wind, night) instead of owning light.
import * as THREE from 'three';

export const DAY_SECONDS = 720; // 12 min per full day
const FF_SPEED = 80;            // hold T

// mutable atmosphere state read by world.js (windmills), traffic, cities, gameplay
export const ATMOS = { wind: 1, night: 0, weather: 'clear' };

// time-of-day keyframes (t: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset)
const KEYS = [
  { t: 0.0, sky: 0x0a1228, sunC: 0x9aa8cc, sunI: 0.22, ambC: 0x2a3a55, ambI: 0.5 },
  { t: 0.22, sky: 0x1a2038, sunC: 0xbb9988, sunI: 0.3, ambC: 0x3a4055, ambI: 0.55 },
  { t: 0.27, sky: 0xe89a6a, sunC: 0xff9955, sunI: 1.4, ambC: 0x886655, ambI: 0.7 },
  { t: 0.35, sky: 0x9fc8e8, sunC: 0xfff0d8, sunI: 2.4, ambC: 0xc8d8e8, ambI: 0.9 },
  { t: 0.65, sky: 0x9fc8e8, sunC: 0xfff0d8, sunI: 2.4, ambC: 0xc8d8e8, ambI: 0.9 },
  { t: 0.73, sky: 0xd8845a, sunC: 0xff8844, sunI: 1.3, ambC: 0x886050, ambI: 0.68 },
  { t: 0.78, sky: 0x2a2040, sunC: 0xbb9988, sunI: 0.3, ambC: 0x3a3550, ambI: 0.55 },
  { t: 1.0, sky: 0x0a1228, sunC: 0x9aa8cc, sunI: 0.22, ambC: 0x2a3a55, ambI: 0.5 },
];

// weather archetypes: cloud coverage, fog range multiplier, fog/sky tint + strength, wind, rain, lightning
const WEATHER = {
  clear: { clouds: 0.12, fogMul: 1.0, tint: 0x9fc8e8, tintK: 0, wind: 1, rain: 0, bolts: false, icon: '☀️' },
  clouds: { clouds: 0.7, fogMul: 0.85, tint: 0x9aa5b0, tintK: 0.35, wind: 1.6, rain: 0, bolts: false, icon: '⛅' },
  rain: { clouds: 0.95, fogMul: 0.5, tint: 0x707a85, tintK: 0.65, wind: 2.2, rain: 1, bolts: false, icon: '🌧️' },
  storm: { clouds: 1, fogMul: 0.38, tint: 0x555a66, tintK: 0.8, wind: 3, rain: 1.6, bolts: true, icon: '⛈️' },
  dust: { clouds: 0.25, fogMul: 0.22, tint: 0xc29a5a, tintK: 0.85, wind: 2.6, rain: 0, bolts: false, icon: '🌪️' },
};
// regional weather odds — Gulf drizzle, Panhandle storms, West Texas dust
const ODDS = {
  west: [['clear', 0.5], ['dust', 0.22], ['clouds', 0.23], ['rain', 0.05]],
  panhandle: [['clear', 0.38], ['clouds', 0.3], ['storm', 0.22], ['rain', 0.1]],
  gulf: [['clear', 0.28], ['clouds', 0.35], ['rain', 0.27], ['storm', 0.1]],
  central: [['clear', 0.45], ['clouds', 0.3], ['rain', 0.15], ['storm', 0.1]],
};
const regionOf = (x, z) => (x < -2200 ? 'west' : z < -2200 ? 'panhandle' : x > 3000 || z > 2400 ? 'gulf' : 'central');

const RAIN_N = 340, CLOUD_N = 44;

export class SkySystem {
  constructor(scene, sun, ambient) {
    this.scene = scene;
    this.sun = sun;
    this.ambient = ambient;
    this.t = 0.375; // start ~9 am
    this.cA = new THREE.Color(); this.cB = new THREE.Color(); this.cT = new THREE.Color();

    // weather state machine with crossfade
    this.weather = 'clear';
    this.target = 'clear';
    this.blend = 1;       // 1 = fully at target
    this.nextPick = 60;
    this.boltT = 5;
    this.flash = 0;

    // stars — points on a dome that follows the player
    const starPos = [];
    for (let i = 0; i < 700; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI * 0.48 + 0.05;
      const r = 9000;
      starPos.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
    }
    this.stars = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3)),
      new THREE.PointsMaterial({ color: 0xffffff, size: 18, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false })
    );
    scene.add(this.stars);

    // cloud layer — instanced flattened blobs drifting with the wind
    this.clouds = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, flatShading: true }),
      CLOUD_N
    );
    this.clouds.frustumCulled = false;
    this.cloudState = Array.from({ length: CLOUD_N }, () => ({
      ox: (Math.random() - 0.5) * 1600, oz: (Math.random() - 0.5) * 1600,
      y: 130 + Math.random() * 70, s: 18 + Math.random() * 30, sy: 0.3 + Math.random() * 0.15,
    }));
    this.cloudDrift = 0;
    scene.add(this.clouds);

    // rain — instanced streaks recycled around the camera
    this.rain = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.03, 1.4, 0.03),
      new THREE.MeshBasicMaterial({ color: 0x9ab0c8, transparent: true, opacity: 0.5 }),
      RAIN_N
    );
    this.rain.frustumCulled = false;
    this.drops = Array.from({ length: RAIN_N }, () => ({
      x: 0, y: -1, z: 0, // y<0 = inactive
    }));
    scene.add(this.rain);

    // lightning bolt — jagged line, flashed briefly
    const boltPts = [];
    let bx = 0, by = 90;
    boltPts.push(new THREE.Vector3(bx, by, 0));
    while (by > 0) { bx += (Math.random() - 0.5) * 14; by -= 12 + Math.random() * 10; boltPts.push(new THREE.Vector3(bx, Math.max(0, by), 0)); }
    this.bolt = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(boltPts),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })
    );
    scene.add(this.bolt);

    this.m4 = new THREE.Matrix4();
  }

  // interpolate time-of-day keyframes
  frame(t) {
    let a = KEYS[0], b = KEYS[KEYS.length - 1];
    for (let i = 0; i < KEYS.length - 1; i++)
      if (t >= KEYS[i].t && t <= KEYS[i + 1].t) { a = KEYS[i]; b = KEYS[i + 1]; break; }
    const k = (t - a.t) / (b.t - a.t || 1);
    return { a, b, k };
  }

  update(dt, ff, px, pz, py) {
    this.t = (this.t + (dt * (ff ? FF_SPEED : 1)) / DAY_SECONDS) % 1;

    // --- weather state machine ---
    this.nextPick -= dt;
    if (this.nextPick <= 0) {
      this.nextPick = 90 + Math.random() * 90;
      const odds = ODDS[regionOf(px, pz)];
      let r = Math.random();
      for (const [w, p] of odds) { r -= p; if (r <= 0) { this.target = w; break; } }
      if (this.target !== this.weather) this.blend = 0;
    }
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 9); // ~9 s crossfade
      if (this.blend >= 1) this.weather = this.target;
    }
    const wa = WEATHER[this.weather], wb = WEATHER[this.target];
    const mix = (p) => wa[p] + (wb[p] - wa[p]) * this.blend;
    ATMOS.weather = this.target;
    ATMOS.wind = mix('wind');

    // --- sun + sky + fog from time keyframes, modulated by weather ---
    const { a, b, k } = this.frame(this.t);
    const sunI = (a.sunI + (b.sunI - a.sunI) * k) * (1 - 0.55 * mix('tintK')) + this.flash * 3;
    this.sun.intensity = sunI;
    this.sun.color.lerpColors(this.cA.setHex(a.sunC), this.cB.setHex(b.sunC), k);
    this.ambient.intensity = (a.ambI + (b.ambI - a.ambI) * k) * (1 - 0.3 * mix('tintK')) + this.flash;
    this.ambient.color.lerpColors(this.cA.setHex(a.ambC), this.cB.setHex(b.ambC), k);

    // sun swings east -> west; below horizon at night it becomes dim "moonlight" from above
    const ang = (this.t - 0.25) * Math.PI * 2;
    const elev = Math.sin(ang);
    this.sun.position.set(-Math.cos(ang) * 1200, Math.max(0.15, elev) * 1000, 400);

    // sky/fog: time color mixed toward the weather tint (tints lerped in RGB, not hex)
    this.cT.lerpColors(this.cA.setHex(a.sky), this.cB.setHex(b.sky), k);
    this.cA.setHex(wa.tint).lerp(this.cB.setHex(wb.tint), this.blend);
    this.cT.lerp(this.cA, mix('tintK') * 0.8);
    this.scene.background.copy(this.cT);
    this.scene.fog.color.copy(this.cT);
    const day = THREE.MathUtils.clamp(elev * 2 + 0.4, 0.25, 1);
    this.scene.fog.far = 1400 * day * mix('fogMul');
    this.scene.fog.near = Math.min(250, this.scene.fog.far * 0.18);

    // night factor for other systems (0 day .. 1 deep night)
    ATMOS.night = THREE.MathUtils.clamp(1 - (elev + 0.15) * 3, 0, 1);
    this.stars.material.opacity = ATMOS.night * (1 - mix('clouds') * 0.8) * 0.9;
    this.stars.position.set(px, 0, pz);

    // --- clouds drift with wind ---
    this.cloudDrift += dt * ATMOS.wind * 4;
    const coverage = mix('clouds');
    const nShow = Math.round(CLOUD_N * coverage);
    const cloudTone = 1 - mix('tintK') * 0.55 - ATMOS.night * 0.75;
    this.clouds.material.color.setScalar(Math.max(0.12, cloudTone));
    for (let i = 0; i < CLOUD_N; i++) {
      const c = this.cloudState[i];
      if (i >= nShow) { this.m4.makeScale(0, 0, 0); this.clouds.setMatrixAt(i, this.m4); continue; }
      // wrap in a 1600-unit box around the player
      const wx = ((c.ox + this.cloudDrift) % 1600 + 2400) % 1600 - 800 + px;
      const wz = ((c.oz + this.cloudDrift * 0.3) % 1600 + 2400) % 1600 - 800 + pz;
      this.m4.makeScale(c.s, c.s * c.sy, c.s * 0.8).setPosition(wx, c.y, wz);
      this.clouds.setMatrixAt(i, this.m4);
    }
    this.clouds.instanceMatrix.needsUpdate = true;

    // --- rain streaks around the camera ---
    const rainRate = mix('rain');
    let active = 0;
    for (const d of this.drops) {
      if (d.y < 0) {
        if (active / RAIN_N < rainRate && Math.random() < rainRate * 0.4) {
          d.x = px + (Math.random() - 0.5) * 90;
          d.z = pz + (Math.random() - 0.5) * 90;
          d.y = py + 25 + Math.random() * 30;
        }
      } else {
        d.y -= dt * 55;
        if (d.y < 0.5 || Math.abs(d.x - px) > 100 || Math.abs(d.z - pz) > 100) d.y = -1;
      }
      if (d.y >= 0) {
        active++;
        this.m4.makeTranslation(d.x, d.y, d.z);
      } else this.m4.makeScale(0, 0, 0);
      this.rain.setMatrixAt(this.drops.indexOf(d), this.m4);
    }
    this.rain.instanceMatrix.needsUpdate = true;

    // --- lightning ---
    this.flash = Math.max(0, this.flash - dt * 8);
    this.bolt.material.opacity = Math.max(0, this.bolt.material.opacity - dt * 6);
    if (mix('bolts') > 0.5 || (wb.bolts && this.blend > 0.5)) {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = 4 + Math.random() * 9;
        this.flash = 0.8;
        this.bolt.material.opacity = 1;
        const a2 = Math.random() * Math.PI * 2, r = 120 + Math.random() * 200;
        this.bolt.position.set(px + Math.cos(a2) * r, 0, pz + Math.sin(a2) * r);
        this.bolt.rotation.y = Math.random() * Math.PI;
      }
    }
  }

  clockString() {
    const h24 = this.t * 24;
    const h = Math.floor(h24), m = Math.floor((h24 - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  weatherIcon() {
    if (ATMOS.night > 0.6 && this.target === 'clear') return '🌙';
    return WEATHER[this.target].icon;
  }
}
