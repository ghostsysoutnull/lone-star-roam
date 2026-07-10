// Atmosphere: 12-minute day/night cycle + regional weather, driving one shared
// sky/sun/fog rig. Other systems read ATMOS (wind, night) instead of owning light.
// Night sky is the real one: catalog stars + constellations on a celestial sphere
// rotating for Texas latitude, moon with automatic phases, today's actual planets.
import * as THREE from 'three';
import { GEO, hAt as GEO_hAt } from './geo.js';

export const DAY_SECONDS = 720; // 12 min per full day
const FF_SPEED = 80;            // hold T

// mutable atmosphere state read by world.js (windmills), traffic, cities, gameplay
export const ATMOS = { wind: 1, night: 0, weather: 'clear', rain: 0, ufo: 0 };

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

// faint name sprite for constellations/planets
function mkTextSprite(text, size = 140) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'italic 30px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(170,190,235,0.9)';
  ctx.fillText(text, 128, 32);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, depthWrite: false, fog: false,
  }));
  sp.scale.set(size * 4, size, 1);
  return sp;
}

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

    this.buildCelestial(scene);

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

  // --- real night sky: celestial sphere for Texas latitude (~31° N) ---
  buildCelestial(scene) {
    const R = 8500, LAT = (31 * Math.PI) / 180;
    this.celestial = new THREE.Group();
    this.skyMats = []; // fade all together with night factor
    scene.add(this.celestial);
    // celestial pole in game frame (north = -z, up = +y)
    this.pole = new THREE.Vector3(0, Math.sin(LAT), -Math.cos(LAT));
    this.alignQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.pole);
    this.days = 0;

    if (GEO.sky) {
      // stars binned by magnitude (PointsMaterial has one size per object)
      const bins = [
        { max: 1.6, size: 60 },
        { max: 3.1, size: 32 },
        { max: 9, size: 15 },
      ].map((b) => ({ ...b, pos: [], col: [] }));
      for (const [x, y, z, mag, bv] of GEO.sky.stars) {
        const bin = bins.find((b) => mag <= b.max);
        bin.pos.push(x * R, y * R, z * R);
        // B-V color index -> tint; brighter stars whiter
        const warm = Math.min(1.6, Math.max(-0.2, bv));
        const int = Math.min(1, 1.25 - mag * 0.12);
        bin.col.push(
          int * (0.75 + warm * 0.16), int * (0.82 + warm * 0.04), int * (1 - warm * 0.22)
        );
      }
      for (const b of bins) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
        const m = new THREE.PointsMaterial({ size: b.size, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true, fog: false });
        this.skyMats.push(m);
        this.celestial.add(new THREE.Points(g, m));
      }
      // constellation figures
      const linePos = [];
      for (const [a, b] of GEO.sky.segs) linePos.push(a[0] * R, a[1] * R, a[2] * R, b[0] * R, b[1] * R, b[2] * R);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x8899cc, transparent: true, opacity: 0, depthWrite: false, fog: false });
      this.skyMats.push(lineMat);
      this.lineMat = lineMat;
      this.celestial.add(new THREE.LineSegments(
        new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3)), lineMat));
      // constellation names
      for (const { n, v } of GEO.sky.labels) {
        const s = mkTextSprite(n);
        s.position.set(v[0] * R, v[1] * R, v[2] * R);
        this.skyMats.push(s.material);
        this.celestial.add(s);
      }
      // numeric solve: rotation that puts Orion (RA ~88°, dec 0) due south at game midnight
      const target = new THREE.Vector3(0, Math.sin(Math.PI / 2 - LAT), Math.cos(Math.PI / 2 - LAT));
      const orion = new THREE.Vector3(Math.cos((88 * Math.PI) / 180), Math.sin((88 * Math.PI) / 180), 0);
      let best = -2;
      this.lst0 = 0;
      for (let i = 0; i < 720; i++) {
        const th = (i / 720) * Math.PI * 2;
        const q = new THREE.Quaternion().setFromAxisAngle(this.pole, th).multiply(this.alignQ);
        const d = orion.clone().applyQuaternion(q).dot(target);
        if (d > best) { best = d; this.lst0 = th; }
      }
    }

    // sun disc + glow
    const disc = (color, scale, coreStop) => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(coreStop, color);
      g.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false }));
      sp.scale.set(scale, scale, 1);
      scene.add(sp);
      return sp;
    };
    this.sunDisc = disc('rgba(255,220,120,0.9)', 1500, 0.25);
    // moon: Lambert sphere — the scene's sun light gives it real phases for free
    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(95, 14, 12),
      new THREE.MeshLambertMaterial({ color: 0xd8d8d0, emissive: 0x0a0a10, fog: false })
    );
    scene.add(this.moon);

    // planets: today's actual sky via mean circular orbits (a, L0 epoch deg, period days)
    const EPHEM = [
      ['Mercury', 0.387, 252.25, 87.969, 0xc8c0b0, 150],
      ['Venus', 0.723, 181.98, 224.701, 0xfff4d8, 300],
      ['Mars', 1.524, 355.43, 686.98, 0xff9a70, 190],
      ['Jupiter', 5.203, 34.35, 4332.59, 0xffe8c8, 260],
      ['Saturn', 9.537, 50.08, 10759.22, 0xf0d8a0, 210],
    ];
    const D = Date.now() / 86400000 - 10957.5; // days since J2000
    const lam = (L0, T) => (((L0 + (360 * D) / T) % 360) * Math.PI) / 180;
    const earth = lam(100.46, 365.256);
    const E = [Math.cos(earth), Math.sin(earth)];
    this.planets = [];
    for (const [name, a, L0, T, color, size] of EPHEM) {
      const l = lam(L0, T);
      const gx = a * Math.cos(l) - E[0], gy = a * Math.sin(l) - E[1];
      const elong = Math.atan2(gy, gx) - (earth + Math.PI); // vs the sun's geocentric direction
      const sp = disc(`#${color.toString(16).padStart(6, '0')}`, size, 0.35);
      const label = mkTextSprite(name, 90);
      scene.add(label);
      this.planets.push({ name, sp, label, elong });
    }
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
    const tAdd = (dt * (ff ? FF_SPEED : 1)) / DAY_SECONDS;
    this.t = (this.t + tAdd) % 1;
    this.days += tAdd;

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
    ATMOS.rain = mix('rain');

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

    // --- celestial sphere: diurnal rotation about the pole, faded by daylight/clouds ---
    const skyVis = ATMOS.night * (1 - mix('clouds') * 0.8);
    const lst = this.lst0 - this.t * Math.PI * 2; // westward over the day
    this.celestial.quaternion.setFromAxisAngle(this.pole, lst).multiply(this.alignQ);
    this.celestial.position.set(px, 0, pz);
    for (const m of this.skyMats) m.opacity = skyVis * (m === this.lineMat ? 0.3 : m.isSpriteMaterial ? 0.4 : 0.95);

    // sun disc rides the light direction
    const sunDir = this.sun.position.clone().normalize();
    this.sunDisc.position.set(px + sunDir.x * 8500, sunDir.y * 8500, pz + sunDir.z * 8500);
    this.sunDisc.material.opacity = elev > -0.05 ? 1 : 0;
    this.sunDisc.material.color.copy(this.sun.color);

    // moon: opposite side of the sky path, offset by phase (lunar month = 8 game days)
    const phase = ((this.days % 8) / 8) * Math.PI * 2;
    const moonAng = ang + Math.PI + phase; // full moon (phase 0) opposite the sun
    const mDir = new THREE.Vector3(-Math.cos(moonAng), Math.sin(moonAng) * 0.85 + 0.12, 0.35).normalize();
    this.moon.position.set(px + mDir.x * 8200, mDir.y * 8200, pz + mDir.z * 8200);
    this.moon.visible = mDir.y > 0.02;
    this.moonDir = mDir;
    this.skyVis = skyVis;

    // planets: fixed elongation from the sun along its path (real positions for today)
    for (const p of this.planets) {
      const a2 = ang + p.elong;
      const dir = new THREE.Vector3(-Math.cos(a2), Math.sin(a2) * 0.85 + 0.08, 0.35).normalize();
      p.dir = dir;
      p.sp.position.set(px + dir.x * 8300, dir.y * 8300, pz + dir.z * 8300);
      p.label.position.set(px + dir.x * 8300, dir.y * 8300 - 300, pz + dir.z * 8300);
      const vis = dir.y > 0.03 ? skyVis : 0;
      p.sp.material.opacity = vis;
      p.label.material.opacity = vis * 0.5;
    }

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
        if (d.y < GEO_hAt(d.x, d.z) + 0.5 || Math.abs(d.x - px) > 100 || Math.abs(d.z - pz) > 100) d.y = -1;
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
        this.onBolt?.();
        this.bolt.material.opacity = 1;
        const a2 = Math.random() * Math.PI * 2, r = 120 + Math.random() * 200;
        const bx2 = px + Math.cos(a2) * r, bz2 = pz + Math.sin(a2) * r;
        this.bolt.position.set(bx2, GEO_hAt(bx2, bz2), bz2);
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

  // What's up there right now: moon + phase, visible planets, the constellation you're facing
  skyReport(heading) {
    if (!this.celestial) return '';
    const compass = (v) => {
      const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const az = Math.atan2(v.x, -v.z);
      return dirs[Math.round(((az + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
    };
    const parts = [];

    if (this.moon.visible && ATMOS.night > 0.15) {
      const f = (this.days % 8) / 8; // 0 = full (opposite sun)
      const names = ['Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent', 'New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous'];
      const name = names[Math.round(f * 8) % 8];
      if (name !== 'New Moon') parts.push(`🌙 ${name} ${compass(this.moonDir)}`);
    }

    const SYMBOLS = { Mercury: '☿', Venus: '♀', Mars: '♂', Jupiter: '♃', Saturn: '♄' };
    for (const p of this.planets) {
      if (p.sp.material.opacity > 0.25 && p.dir) parts.push(`${SYMBOLS[p.name] ?? '·'} ${p.name} ${compass(p.dir)}`);
    }

    // constellation nearest to straight ahead (within ~30° of heading, above ~15° elevation)
    if (this.skyVis > 0.3 && GEO.sky) {
      const fx = -Math.sin(heading), fz = -Math.cos(heading);
      let best = null, bestElev = 0.25;
      for (const { n, v } of GEO.sky.labels) {
        const w = new THREE.Vector3(v[0], v[1], v[2]).applyQuaternion(this.celestial.quaternion);
        if (w.y < bestElev) continue;
        const L = Math.hypot(w.x, w.z) || 1;
        if ((w.x / L) * fx + (w.z / L) * fz > 0.87) { bestElev = w.y; best = n; }
      }
      if (best) parts.push(`✨ ${best}`);
    }

    return parts.slice(0, 4).join('  ·  ');
  }
}
