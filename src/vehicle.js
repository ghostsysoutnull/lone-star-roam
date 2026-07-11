// Player controller: DRIVE (pickup truck), FLY (truck sprouts wings + prop), WALK (cowboy).
// Arcade physics, third-person chase camera, per-mode animation and night lights.
import * as THREE from 'three';
import { nearestRoad, nearestCity, inTexas, hAt } from './geo.js';
import { ATMOS } from './sky.js';

export const MODES = ['DRIVE', 'FLY', 'WALK'];

export class Player {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.mode = 'DRIVE';
    this.pos = new THREE.Vector3(0, 0, 0);
    this.heading = 0;      // radians, 0 = -z (north)
    this.speed = 0;        // units/s
    this.vy = 0;           // vertical speed (fly)
    this.keys = {};
    this.onStep = null;    // footstep audio hook
    this.walkPhase = 0;
    this.steerVis = 0;
    this.prevSpeed = 0;
    this.pitchVis = 0;
    this.braking = false;
    // stock drive stats; shop.js applyGear() overwrites these with upgrade tiers
    this.perks = { engineCap: 1, offroadCap: 20, offroadAccel: 14, rainDrag: 0.22, lightI: 30 };

    this.truck = mkTruck();
    this.wings = mkWings();
    this.wings.visible = false;
    this.truck.add(this.wings);
    this.cowboy = mkCowboy();
    this.cowboy.visible = false;
    scene.add(this.truck, this.cowboy);

    // fake blob shadow — grounds the avatar in every mode
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(2.2, 18).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false })
    );
    scene.add(this.shadow);

    // real headlight (DRIVE only): one PointLight hung ahead of the nose — the
    // lantern (mkCowboy) proved a single short-range dynamic light is affordable,
    // and DRIVE/WALK are exclusive so the scene never pays for more than one.
    // Omni, so it reads as thrown light, not a beam — the beam cones sell direction.
    // Knobs: intensity/height/lead in animate()'s DRIVE branch.
    this.headLight = new THREE.PointLight(0xffe4b8, 0, 34, 1.6);
    this.headLight.visible = false;
    scene.add(this.headLight);

    // fake light decals: landing pool (fly low) + brake glow. A decal headlight
    // pool shipped once and read flat (lit nothing, buried itself on slopes —
    // terrain triangles are ~30 units); DRIVE now uses the real light above.
    const poolGeo = new THREE.CircleGeometry(1, 22).rotateX(-Math.PI / 2);
    const poolMat = (hex) => new THREE.MeshBasicMaterial({
      color: hex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.lightPool = new THREE.Mesh(poolGeo, poolMat(0xffe8b0));
    this.brakePool = new THREE.Mesh(poolGeo, poolMat(0xff2a20));
    this.lightPool.visible = this.brakePool.visible = false;
    scene.add(this.lightPool, this.brakePool);

    // shared puff pool: exhaust (drive) + contrail (fly)
    this.puffs = [];
    const puffGeo = new THREE.SphereGeometry(0.16, 5, 4);
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xbbbbbb, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      this.puffs.push({ m, age: 1, life: 1 });
    }
    this.puffTimer = 0;

    this.camPos = new THREE.Vector3(0, 8, 12);
    this.getObstacles = null; // set by main: building meshes for camera occlusion
    this.ray = new THREE.Raycaster();
    addEventListener('keydown', (e) => (this.keys[e.code] = true));
    addEventListener('keyup', (e) => (this.keys[e.code] = false));
  }

  // Start on I-35 near Austin
  spawnAt(x, z) {
    const r = nearestRoad(x, z, 400);
    this.pos.set(r ? r.x : x, 0, r ? r.z : z);
    this.camPos.copy(this.pos).add(new THREE.Vector3(0, 8, 12));
  }

  cycleMode() {
    const i = (MODES.indexOf(this.mode) + 1) % MODES.length;
    this.setMode(MODES[i]);
  }

  setMode(m) {
    this.mode = m;
    this.wings.visible = m === 'FLY';
    this.cowboy.visible = m === 'WALK';
    this.truck.visible = m !== 'WALK';
    if (m !== 'FLY') { this.pos.y = 0; this.vy = 0; }
    if (m === 'WALK') this.speed = Math.min(this.speed, 2);
  }

  resetToRoad() {
    const r = nearestRoad(this.pos.x, this.pos.z, 500);
    if (r) { this.pos.set(r.x, this.mode === 'FLY' ? this.pos.y : 0, r.z); this.speed = 0; }
  }

  spawnPuff(localX, localY, localZ, color, size, life, riseY) {
    const p = this.puffs.find((p) => p.age >= p.life);
    if (!p) return;
    const cos = Math.cos(this.heading), sin = Math.sin(this.heading);
    p.m.position.set(
      this.pos.x + localX * cos - localZ * sin,
      this.pos.y + localY,
      this.pos.z + localX * sin + localZ * cos
    );
    p.m.material.color.set(color);
    p.m.visible = true;
    p.age = 0; p.life = life; p.size = size; p.rise = riseY;
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    this.simT = (this.simT ?? 0) + dt; // physics-time for tests: headless frames run slower than the wall clock
    const k = this.keys;
    const fwd = k['KeyW'] || k['ArrowUp'], back = k['KeyS'] || k['ArrowDown'];
    const left = k['KeyA'] || k['ArrowLeft'], right = k['KeyD'] || k['ArrowRight'];
    const steer = (left ? 1 : 0) - (right ? 1 : 0);
    this.braking = false;

    if (this.mode === 'DRIVE') {
      const road = nearestRoad(this.pos.x, this.pos.z, 4);
      // top speed by road tier; offroad is slow going
      const caps = { motorway: 46, trunk: 38, primary: 33, street: 26 };
      const wet = 1 - Math.min(1, ATMOS.rain) * this.perks.rainDrag; // rain slows you like it slows traffic
      const maxSpd = (road ? caps[road.type] * this.perks.engineCap : this.perks.offroadCap) * wet;
      const accel = road ? 26 : this.perks.offroadAccel;
      if (fwd) this.speed += accel * dt;
      else if (back) { this.speed -= (this.speed > 0 ? 40 : 12) * dt; this.braking = this.speed > 0.5; }
      else this.speed *= Math.pow(0.35, dt); // coast friction
      this.speed = THREE.MathUtils.clamp(this.speed, -8, maxSpd);
      this.heading += steer * dt * 1.9 * Math.min(1, Math.abs(this.speed) / 9) * Math.sign(this.speed || 1);
      this.pos.x -= Math.sin(this.heading) * this.speed * dt;
      this.pos.z -= Math.cos(this.heading) * this.speed * dt;
      this.tilt = steer * Math.min(1, Math.abs(this.speed) / 25) * 0.09;
    } else if (this.mode === 'FLY') {
      if (fwd) this.speed += 40 * dt;
      else if (back) this.speed -= 50 * dt;
      this.speed = THREE.MathUtils.clamp(this.speed, 6, 150); // planes don't hover
      this.heading += steer * dt * 1.35;
      if (k['Space']) this.vy += 60 * dt;
      if (k['ControlLeft'] || k['ControlRight'] || k['ShiftLeft']) this.vy -= 60 * dt;
      this.vy *= Math.pow(0.2, dt);
      // soft clamp: skim the terrain, never crash into it
      const floor = hAt(this.pos.x, this.pos.z) + 1.8;
      this.pos.y = THREE.MathUtils.clamp(this.pos.y + this.vy * dt, floor, 300);
      this.pos.x -= Math.sin(this.heading) * this.speed * dt;
      this.pos.z -= Math.cos(this.heading) * this.speed * dt;
      this.tilt = steer * 0.5;
    } else { // WALK
      const maxSpd = 4.5;
      if (fwd) this.speed += 18 * dt;
      else if (back) this.speed -= 18 * dt;
      else this.speed *= Math.pow(0.02, dt);
      this.speed = THREE.MathUtils.clamp(this.speed, -2.5, maxSpd);
      this.heading += steer * dt * 2.6;
      this.pos.x -= Math.sin(this.heading) * this.speed * dt;
      this.pos.z -= Math.cos(this.heading) * this.speed * dt;
      this.tilt = 0;
    }

    // Soft wall at the state line — you roam Texas, not New Mexico
    if (!inTexas(this.pos.x, this.pos.z)) {
      const c = nearestCity(this.pos.x, this.pos.z).city;
      const dx = c.x - this.pos.x, dz = c.z - this.pos.z;
      const L = Math.hypot(dx, dz) || 1;
      this.pos.x += (dx / L) * Math.max(10, Math.abs(this.speed)) * dt * 2;
      this.pos.z += (dz / L) * Math.max(10, Math.abs(this.speed)) * dt * 2;
      this.speed *= Math.pow(0.1, dt);
    }

    // ground modes ride the terrain
    const ground = hAt(this.pos.x, this.pos.z);
    if (this.mode !== 'FLY') this.pos.y = ground;
    this.groundY = ground;

    // Place avatar
    const avatar = this.mode === 'WALK' ? this.cowboy : this.truck;
    avatar.position.copy(this.pos);
    avatar.rotation.set(0, this.heading, 0);
    avatar.rotateZ(this.tilt || 0);
    if (this.mode === 'FLY') avatar.rotateX(THREE.MathUtils.clamp(-this.vy * 0.012, -0.35, 0.35));
    else {
      // pitch with the slope (sample fore/aft along heading)
      const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
      const dh = hAt(this.pos.x + fx * 2.2, this.pos.z + fz * 2.2) - hAt(this.pos.x - fx * 2.2, this.pos.z - fz * 2.2);
      avatar.rotateX(THREE.MathUtils.clamp(Math.atan2(dh, 4.4), -0.5, 0.5) * (this.mode === 'DRIVE' ? 1 : 0.4));
    }

    this.animate(dt, avatar, fwd, steer);

    // blob shadow projects onto the terrain
    this.shadow.position.set(this.pos.x, ground + 0.08, this.pos.z);
    const alt = this.mode === 'FLY' ? Math.max(0, this.pos.y - ground) : 0;
    const shScale = (this.mode === 'WALK' ? 0.5 : this.mode === 'FLY' ? 1.4 : 1) * (1 + alt * 0.004);
    this.shadow.scale.setScalar(shScale);
    this.shadow.material.opacity = 0.26 * Math.max(0, 1 - alt / 80);

    // Chase camera
    const back2 = this.mode === 'FLY' ? 16 : this.mode === 'WALK' ? 7 : 11;
    const up = this.mode === 'FLY' ? 7 : this.mode === 'WALK' ? 3.2 : 5;
    const target = new THREE.Vector3(
      this.pos.x + Math.sin(this.heading) * back2,
      this.pos.y + up,
      this.pos.z + Math.cos(this.heading) * back2
    );
    this.camPos.lerp(target, 1 - Math.pow(0.001, dt));
    // camera occlusion: if a building blocks the view line, pull the camera in front of it
    let finalCam = this.camPos;
    if (this.mode !== 'FLY' && this.getObstacles) {
      const obstacles = this.getObstacles();
      if (obstacles.length) {
        const eye = new THREE.Vector3(this.pos.x, this.pos.y + 1.6, this.pos.z);
        const toCam = this.camPos.clone().sub(eye);
        const L = toCam.length();
        this.ray.set(eye, toCam.normalize());
        this.ray.far = L;
        const hit = this.ray.intersectObjects(obstacles, false)[0];
        if (hit && hit.distance < L) finalCam = eye.addScaledVector(toCam, Math.max(2.2, hit.distance - 0.4));
      }
    }
    this.camera.position.copy(finalCam);
    this.camera.lookAt(this.pos.x, this.pos.y + 1.5, this.pos.z);
    this.prevSpeed = this.speed;
  }

  // per-mode model animation, night lights, particles
  animate(dt, avatar, throttling, steer) {
    const night = ATMOS.night > 0.45;
    const u = this.truck.userData;

    // headlights & brake lights
    u.headlights.visible = night && this.mode !== 'WALK' && !(ATMOS.ufo > 0 && Math.random() < ATMOS.ufo * 0.35);
    for (const b of u.brakes) b.material.color.setHex(this.braking ? 0xff3322 : 0x441111);

    // fake light decals: fade in with dusk instead of popping at the night bool,
    // and follow headlights.visible so the UFO Levelland flicker kills them too
    const nf = THREE.MathUtils.smoothstep(ATMOS.night, 0.4, 0.65);
    const lightsOn = u.headlights.visible;
    const fwdX = -Math.sin(this.heading), fwdZ = -Math.cos(this.heading);
    this.lightPool.visible = this.brakePool.visible = false;
    this.headLight.visible = false;
    this.headLight.intensity = 0;
    u.beams.visible = false;
    this.wings.userData.landing.visible = false;

    if (this.mode === 'DRIVE') {
      u.beams.visible = lightsOn;
      if (lightsOn) {
        u.beams.children[0].material.opacity = 0.07 + Math.min(1, ATMOS.rain) * 0.12;
        // real headlight: leads the nose (a touch farther at speed), hovers at
        // lamp height so terrain/scenery ahead genuinely brighten
        const lead = 4.6 + Math.min(1, Math.abs(this.speed) / 24) * 2.4;
        const px = this.pos.x + fwdX * lead, pz = this.pos.z + fwdZ * lead;
        this.headLight.visible = true;
        this.headLight.position.set(px, hAt(px, pz) + 1.4, pz);
        this.headLight.intensity = (this.perks.lightI + Math.min(1, ATMOS.rain) * 12) * nf;
      }
      if (this.braking && nf > 0.02) {
        const bx = this.pos.x - fwdX * 2.6, bz = this.pos.z - fwdZ * 2.6;
        this.brakePool.visible = true;
        this.brakePool.position.set(bx, hAt(bx, bz) + 0.14, bz);
        this.brakePool.rotation.y = this.heading;
        this.brakePool.scale.set(1.5, 1, 1.0);
        this.brakePool.material.opacity = 0.22 * nf;
      }
    } else if (this.mode === 'FLY') {
      const agl = this.pos.y - this.groundY;
      const landOn = lightsOn && agl < 16;
      this.wings.userData.landing.visible = landOn;
      if (landOn) {
        const f = 1 - agl / 16;
        this.wings.userData.landing.material.opacity = (0.06 + Math.min(1, ATMOS.rain) * 0.08) * (0.4 + 0.6 * f);
        const ahead = 4 + agl * 1.1;
        const px = this.pos.x + fwdX * ahead, pz = this.pos.z + fwdZ * ahead;
        this.lightPool.visible = true;
        this.lightPool.position.set(px, hAt(px, pz) + 0.12, pz);
        this.lightPool.rotation.y = this.heading;
        this.lightPool.scale.set(2.6, 1, 3.4);
        this.lightPool.material.opacity = 0.22 * nf * f;
      }
    }

    if (this.mode === 'DRIVE') {
      // wheels spin; fronts steer
      const spin = (this.speed / 0.36) * dt;
      this.steerVis += ((steer * 0.42 * Math.sign(this.speed || 1)) - this.steerVis) * Math.min(1, dt * 8);
      for (const w of u.wheels) {
        w.mesh.rotation.x -= spin;
        if (w.front) w.mesh.rotation.y = this.steerVis;
      }
      // body pitch: rock back on throttle, dip on brake
      const accel = (this.speed - this.prevSpeed) / Math.max(dt, 0.001);
      this.pitchVis += (THREE.MathUtils.clamp(accel * 0.004, -0.06, 0.05) - this.pitchVis) * Math.min(1, dt * 5);
      avatar.rotateX(this.pitchVis);
      // exhaust puffs while accelerating
      this.puffTimer -= dt;
      if (throttling && this.speed > 1 && this.puffTimer <= 0) {
        this.puffTimer = 0.13;
        this.spawnPuff(0.55, 0.45, 2.0, 0x9a9a9a, 1.6, 0.8, 0.8);
      }
    } else if (this.mode === 'FLY') {
      const w = this.wings.userData;
      w.prop.rotation.z += dt * (14 + this.speed * 1.1);
      w.blur.visible = this.speed > 55;
      w.blur.rotation.z += dt * 3;
      const navOn = night;
      w.navL.visible = w.navR.visible = navOn;
      w.strobe.visible = navOn && (performance.now() % 1200) < 110;
      // contrail at speed/altitude
      this.puffTimer -= dt;
      if (this.speed > 70 && this.pos.y > 25 && this.puffTimer <= 0) {
        this.puffTimer = 0.06;
        this.spawnPuff(0, 0.9, 2.4, 0xffffff, 2.2, 1.4, 0.1);
      }
    } else { // WALK
      const c = this.cowboy.userData;
      const moving = Math.abs(this.speed) > 0.4;
      const prevPhase = this.walkPhase;
      this.walkPhase += dt * (3 + Math.abs(this.speed) * 2.4);
      if (moving) {
        const s = Math.sin(this.walkPhase) * Math.min(1, Math.abs(this.speed) / 3) * 0.55;
        c.ll.rotation.x = s; c.rl.rotation.x = -s;
        c.la.rotation.x = -s * 0.8; c.ra.rotation.x = s * 0.8;
        this.cowboy.position.y = this.pos.y + Math.abs(Math.sin(this.walkPhase)) * 0.05;
        // footstep on each stride crossing
        if (Math.floor(prevPhase / Math.PI) !== Math.floor(this.walkPhase / Math.PI)) this.onStep?.();
      } else {
        for (const part of [c.ll, c.rl, c.la, c.ra]) part.rotation.x *= Math.pow(0.01, dt);
        c.la.rotation.z = 0.06 * Math.sin(performance.now() * 0.0012); // idle sway
      }
      // lantern glows after dark
      c.lampGlow.visible = night;
      c.lampLight.intensity = night ? 14 + Math.sin(this.walkPhase * 2) * 1.5 : 0;
    }

    // puff pool
    for (const p of this.puffs) {
      if (p.age >= p.life) { p.m.visible = false; continue; }
      p.age += dt;
      p.m.position.y += p.rise * dt;
      const f = p.age / p.life;
      p.m.scale.setScalar(0.6 + f * p.size);
      p.m.material.opacity = 0.4 * (1 - f);
    }
  }

  get speedMph() {
    // 1 unit = 100 m real; show "real-world" mph for flavor
    return Math.abs(Math.round(this.speed * 2.4));
  }
}

// --- Low-poly models ---
function mkTruck() {
  const g = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: 0x2563b0, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x22262e });
  const chrome = new THREE.MeshLambertMaterial({ color: 0xb8bcc4, flatShading: true });
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 3.6), body);
  bed.position.y = 0.65;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.62, 1.5), new THREE.MeshLambertMaterial({ color: 0x9fc4e8 }));
  cab.position.set(0, 1.2, 0.1);
  // bed rails
  const railL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 1.6), body);
  railL.position.set(-0.8, 1.0, 1.0);
  const railR = railL.clone();
  railR.position.x = 0.8;
  // grille, bumpers, mirrors, exhaust
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.08), dark);
  grille.position.set(0, 0.62, -1.83);
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.16, 0.18), chrome);
  bumperF.position.set(0, 0.38, -1.85);
  const bumperR = bumperF.clone();
  bumperR.position.z = 1.85;
  const mirrorL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.22), dark);
  mirrorL.position.set(-0.86, 1.28, -0.5);
  const mirrorR = mirrorL.clone();
  mirrorR.position.x = 0.86;
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6).rotateX(Math.PI / 2), chrome);
  exhaust.position.set(0.55, 0.32, 1.75);
  g.add(bed, cab, railL, railR, grille, bumperF, bumperR, mirrorL, mirrorR, exhaust);

  // wheels — stored for spin/steer animation
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [x, z] of [[-0.85, -1.25], [0.85, -1.25], [-0.85, 1.15], [0.85, 1.15]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.position.set(x, 0.36, z);
    w.rotation.order = 'YXZ'; // steer (y) then spin (x)
    g.add(w);
    wheels.push({ mesh: w, front: z < 0 });
  }

  // lone star on the hood
  const star = mkStarMesh(0.34, 0xffd35c);
  star.rotation.x = -Math.PI / 2;
  star.position.set(0, 0.94, -1.35);
  g.add(star);

  // headlights (night) + always-present brake lights
  const lights = new THREE.Group();
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a20 });
  for (const x of [-0.55, 0.55]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.06), lightMat);
    beam.position.set(x, 0.68, -1.82);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.06), tailMat);
    tail.position.set(x, 0.68, 1.82);
    lights.add(beam, tail);
  }
  lights.visible = false;
  g.add(lights);
  // headlight beam cones — apex at the lamp, open base forward; barely-there
  // on clear nights, cutting through the rain when ATMOS.rain rises
  const beamGeo = new THREE.ConeGeometry(0.85, 7, 12, 1, true).rotateX(Math.PI / 2);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff3cc, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const beams = new THREE.Group();
  for (const x of [-0.55, 0.55]) {
    const b = new THREE.Mesh(beamGeo, beamMat);
    b.position.set(x, 0.66, -1.82 - 3.5);
    beams.add(b);
  }
  beams.visible = false;
  g.add(beams);
  const brakes = [];
  for (const x of [-0.72, 0.72]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.05), new THREE.MeshBasicMaterial({ color: 0x441111 }));
    b.position.set(x, 0.88, 1.83);
    g.add(b);
    brakes.push(b);
  }
  // delivery cargo: crates + strap between the bed rails, shown while hauling
  const cargo = new THREE.Group();
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x9a6a35, flatShading: true });
  const big = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 0.85), crateMat);
  big.position.set(-0.1, 1.2, 1.25); // on the bed floor, clear of the cab (rear at z≈0.85)
  const small = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.38, 0.5), new THREE.MeshLambertMaterial({ color: 0xb5854a, flatShading: true }));
  small.position.set(0.05, 1.66, 1.05); // stacked on the big crate
  const strap = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.05, 0.12), new THREE.MeshLambertMaterial({ color: 0x333944 }));
  strap.position.set(0, 1.48, 1.4); // over the big crate, rail to rail
  cargo.add(big, small, strap);
  cargo.visible = false;
  g.add(cargo);

  g.userData = { headlights: lights, wheels, brakes, cargo, beams };
  return g;
}

function mkWings() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xd8d2c4, flatShading: true });
  const wing = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.12, 1.3), mat);
  wing.position.set(0, 1.0, 0.2);
  // wingtips + struts so the wing looks attached
  const tipL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 1.0), mat);
  tipL.position.set(-3.72, 1.15, 0.2);
  const tipR = tipL.clone();
  tipR.position.x = 3.72;
  const strutGeo = new THREE.BoxGeometry(0.08, 0.9, 0.08);
  const strutL = new THREE.Mesh(strutGeo, mat);
  strutL.position.set(-1.3, 0.55, 0.2);
  strutL.rotation.z = 0.5;
  const strutR = strutL.clone();
  strutR.rotation.z = -0.5;
  strutR.position.x = 1.3;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.7), mat);
  tail.position.set(0, 1.5, 1.9);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.7), mat);
  fin.position.set(0, 1.6, 1.9);
  g.add(wing, tipL, tipR, strutL, strutR, tail, fin);

  // propeller on the nose: spinner + 2 blades, blur disc at speed
  const prop = new THREE.Group();
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.35, 8).rotateX(-Math.PI / 2), mat);
  const bladeGeo = new THREE.BoxGeometry(0.14, 2.3, 0.05);
  const blade = new THREE.Mesh(bladeGeo, new THREE.MeshLambertMaterial({ color: 0x3a3a40 }));
  prop.add(spinner, blade);
  prop.position.set(0, 0.75, -2.0);
  const blur = new THREE.Mesh(
    new THREE.CircleGeometry(1.15, 20),
    new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
  );
  blur.position.set(0, 0.75, -2.05);
  blur.visible = false;
  g.add(prop, blur);

  // navigation lights: red left, green right, white tail strobe (night)
  const nav = (hex) => new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), new THREE.MeshBasicMaterial({ color: hex }));
  const navL = nav(0xff2222); navL.position.set(-3.72, 1.35, 0.2);
  const navR = nav(0x22ff44); navR.position.set(3.72, 1.35, 0.2);
  const strobe = nav(0xffffff); strobe.position.set(0, 2.15, 1.9);
  navL.visible = navR.visible = strobe.visible = false;
  g.add(navL, navR, strobe);

  // landing light: nose cone pitched toward the strip, shown only low at night
  const landing = new THREE.Mesh(
    new THREE.ConeGeometry(1.5, 11, 12, 1, true).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0xfff3cc, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide,
    })
  );
  landing.position.set(0, 0.7, -2.0 - 5.5);
  landing.rotation.x = -0.2; // dip the far end toward the ground
  landing.visible = false;
  g.add(landing);

  g.userData = { prop, blur, navL, navR, strobe, landing };
  return g;
}

function mkCowboy() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x8a2f2f });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x3a5077 });
  const hat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
  const boot = new THREE.MeshLambertMaterial({ color: 0x4a342a });

  // articulated legs (pivot at hip) with boots
  const mkLeg = (x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.78, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.24), jeans);
    leg.position.y = -0.36;
    const bt = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.32), boot);
    bt.position.set(0, -0.71, -0.04);
    pivot.add(leg, bt);
    g.add(pivot);
    return pivot;
  };
  const ll = mkLeg(-0.15), rl = mkLeg(0.15);

  // torso, belt with buckle, bandana
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.58, 0.34), shirt);
  torso.position.y = 1.1;
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.09, 0.36), boot);
  belt.position.y = 0.84;
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.04), new THREE.MeshLambertMaterial({ color: 0xd8b84a }));
  buckle.position.set(0, 0.84, -0.19);
  const bandana = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.3), new THREE.MeshLambertMaterial({ color: 0xbb3333 }));
  bandana.position.y = 1.43;
  bandana.rotation.y = Math.PI / 4;

  // articulated arms (pivot at shoulder) with hands
  const mkArm = (x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 1.34, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.2), shirt);
    arm.position.y = -0.3;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.13), skin);
    hand.position.y = -0.65;
    pivot.add(arm, hand);
    g.add(pivot);
    return pivot;
  };
  const la = mkArm(-0.38), ra = mkArm(0.38);

  // head + hat
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), skin);
  head.position.y = 1.62;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 10), hat);
  brim.position.y = 1.81;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.22, 8), hat);
  crown.position.y = 1.93;

  // lantern in the right hand — glows (and lights the ground) after dark
  const lantern = new THREE.Group();
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.2, 6), new THREE.MeshLambertMaterial({ color: 0x333333 }));
  const lampGlow = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffc060 }));
  const lampLight = new THREE.PointLight(0xffb060, 0, 22, 1.6);
  lantern.add(cage, lampGlow, lampLight);
  lantern.position.y = -0.72;
  ra.add(lantern);
  lampGlow.visible = false;

  g.add(torso, belt, buckle, bandana, head, brim, crown);
  g.userData = { ll, rl, la, ra, lampGlow, lampLight };
  return g;
}

export function mkStarMesh(r, color) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.42;
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: r * 0.25, bevelEnabled: false });
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35 }));
}
