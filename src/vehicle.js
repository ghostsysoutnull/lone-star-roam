// Player controller: DRIVE (pickup truck), FLY (truck sprouts wings + prop), WALK (cowboy).
// Arcade physics, third-person chase camera, per-mode animation and night lights.
import * as THREE from 'three';
import { nearestRoad, nearestCity, inWorld, borderZoneAt, hAt, beachAt, boatableAt } from './geo.js';
import { ATMOS } from './sky.js';
import { groundYAt as airportGroundYAt } from './airports.js';
import { groundYAt as brandGroundYAt } from './brands.js';
import { fadeDisc } from './maritime.js';

// flat-pad ground height (airport runway pad or a Bucky's/H-E-Buddy
// foundation slab), else null so callers fall back to raw hAt — without this
// a player walks/drives through those bases instead of over them.
const groundYAt = (x, z) => airportGroundYAt(x, z) ?? brandGroundYAt(x, z);

// BOAT sits right after DRIVE so V at the waterline stop goes truck → boat in
// one press (inland it's skipped, so the classic DRIVE→FLY→WALK feel holds).
export const MODES = ['DRIVE', 'BOAT', 'FLY', 'WALK'];

// jetpack (WALK sub-state) physics constants — not tiered, tuned once here.
// No stable hover point by design (thrust XOR gravity each frame, see
// JETPACK_SPEC.md): holding Space always rises to the ceiling, releasing
// always falls. AIRDAMP is gentler than FLY's 0.2 so the climb/fall feels
// floaty rather than snappy.
const GRAV = 45;
const AIRDAMP = 0.25;

// WALK-only flashlight: max on-time per press before it auto-extinguishes
// and the ambient lantern resumes (see toggleFlashlight()).
const FLASHLIGHT_DURATION = 10;

// WALK sprint: builds up after a sustained straight-line forward walk (no
// modifier key — judged not user-friendly), drains stamina while active, and
// drops instantly on any turn/stop/back-up so careful movement near
// wildlife/plaques/dialog stays untouched. Buildup is a dedicated timer, not
// tied to the animation's `walkPhase` (which free-runs even at rest for the
// idle sway/lantern flicker) — coupling it to walkPhase let real-frame
// jitter during a pre-hold settle wait shift the footstep-crossing count.
// BOAT (Water Vehicles W1): momentum-heavy — slow spool-up, a glide that
// carries (a boat has no brakes, reverse is weak), turn authority that grows
// with way on. Cap sits just under the street tier (26): open-water legs are
// maritime distances, but roads keep the crown on pavement (Bruno, W1 tune).
// Top speed/accel are tiered (Sea-Industry W3 outboard upgrade): stock values
// live in the perks defaults below (boatCap: 24, boatAccel: 10), same idiom
// as engineCap/offroadCap — no separate top-level const to drift out of sync.
const BOAT_REV = -3.5;
const BOAT_COAST = 0.85; // per-second speed retention while coasting (DRIVE keeps 0.35)
const BOAT_HOLD = 2;     // cruise-hold band (W3): coasting above this holds way on; below it, drift-to-rest
const BOAT_TURN = 1.5;   // rad/s at full authority (DRIVE turns at 1.9)
const WAKE_N = 40;       // wake pool cap — fixed at birth, zero steady-state allocation
const SPARK_N = 48;      // sparkle pool

const WALK_SPEED = 6;
const SPRINT_SPEED = 12;
const SPRINT_BUILDUP = 0.9; // seconds of sustained straight walking before a run kicks in
const STAMINA_DRAIN = 0.18; // per second while sprinting (full tank ≈ 5.6s of sprint)
const STAMINA_REGEN = 0.25; // per second while not sprinting

export class Player {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.mode = 'DRIVE';
    this.pos = new THREE.Vector3(0, 0, 0);
    this.heading = 0;      // radians, 0 = -z (north)
    this.speed = 0;        // units/s
    this.vy = 0;           // vertical speed (fly, jetpack)
    this.hovering = false; // WALK sub-state: jetpack thrust airborne
    this.sprinting = false;  // WALK sub-state: running after a sustained straight-line approach
    this.sprintBuildup = 0;  // seconds accumulated toward SPRINT_BUILDUP
    this.stamina = 1;        // 0-1, drains while sprinting, regens otherwise
    this.keys = {};
    this.onStep = null;    // footstep audio hook
    this.onThrust = null;  // jetpack liftoff hook (fires once on the ground->hovering edge)
    this.onWorldEdge = null; // soft-wall hook: (zone: 'land'|'coast') fires once on the inWorld->!inWorld edge
    this._wasInWorld = true;
    this.aboardFerry = false; // ferries.js drives pos/heading directly while true — see vehicle.js's update() guards
    this.walkPhase = 0;
    this.steerVis = 0;
    this.prevSpeed = 0;
    this.pitchVis = 0;
    this.braking = false;
    // stock drive stats; shop.js applyGear() overwrites these with upgrade tiers
    this.perks = { engineCap: 1, offroadCap: 20, offroadAccel: 14, rainDrag: 0.22, lightI: 30, boatCap: 24, boatAccel: 10 };

    this.truck = mkTruck();
    this.wings = mkWings();
    this.wings.visible = false;
    this.truck.add(this.wings);
    this.cowboy = mkCowboy();
    this.cowboy.visible = false;
    this.skiff = mkSkiff();
    this.skiff.visible = false;
    this.atWaterline = false; // grounded mode facing navigable water (hint signal)
    this._water = null;       // BOAT: last boatableAt record (rides its y)
    scene.add(this.truck, this.cowboy, this.skiff);

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

    // WALK-only flashlight: KeyL swaps the cowboy's always-on ambient lantern
    // (mkCowboy) for a stronger forward-aimed beam, capped at
    // FLASHLIGHT_DURATION seconds (see toggleFlashlight() + animate()'s WALK
    // branch, which also resumes the lantern once this goes off). Aimed ahead
    // of heading each frame — SpotLight.target doesn't inherit a parent
    // transform, so both light and target live at scene level, not on the rig.
    this.flashlightOn = false;
    this.flashlightTimer = 0;
    this.flashLight = new THREE.SpotLight(0xfff2d0, 0, 34, 0.34, 0.4, 1.6);
    this.flashLight.visible = false;
    scene.add(this.flashLight, this.flashLight.target);

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

    // Water Vehicles W2: chop clock + player-local water effects. One-gulf-plane
    // law: both pools float ABOVE the water with a y-stagger — never a second
    // surface. Additive blending: black instanceColor contributes nothing, and
    // dead slots collapse to zero scale.
    this.chopT = 0;
    this.chopAmp = 0;   // live chop amplitude (radians) — checks read this
    this.wakeTimer = 0;
    this.sparkTimer = 0;
    const fxMat = () => new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, vertexColors: true,
    });
    this.wake = new THREE.InstancedMesh(fadeDisc(new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), 1), fxMat(), WAKE_N);
    this.sparkle = new THREE.InstancedMesh(fadeDisc(new THREE.CircleGeometry(0.22, 6).rotateX(-Math.PI / 2), 0.22), fxMat(), SPARK_N);
    this.wake.frustumCulled = this.sparkle.frustumCulled = false; // instance matrices roam; geometry bounds don't
    this.wakeSlots = Array.from({ length: WAKE_N }, () => ({ age: 1, life: 1, x: 0, y: 0, z: 0, s: 1 }));
    this.sparkSlots = Array.from({ length: SPARK_N }, () => ({ x: 0, z: 0, phase: 0, rate: 2, on: false }));
    this._fxM = new THREE.Matrix4();
    this._fxC = new THREE.Color();
    const dead = this._fxM.makeScale(0, 0, 0), black = this._fxC.setScalar(0);
    for (let i = 0; i < WAKE_N; i++) { this.wake.setMatrixAt(i, dead); this.wake.setColorAt(i, black); }
    for (let i = 0; i < SPARK_N; i++) { this.sparkle.setMatrixAt(i, dead); this.sparkle.setColorAt(i, black); }
    this.sparkle.visible = false;
    scene.add(this.wake, this.sparkle);

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

  // Position-gated V cycle (Water Vehicles W1): BOAT only at navigable water;
  // land modes only where there's ground to stand on — over open water the
  // cycle offers FLY alone until the boat noses up to a shore.
  modeLegal(m) {
    if (m === 'BOAT') return !!this.waterNear();
    if (m === 'DRIVE' || m === 'WALK') return !boatableAt(this.pos.x, this.pos.z) || this.shoreNear();
    return true; // FLY is always an out
  }

  // Water under the hull or just off the bow — the waterline stop parks the
  // truck a nose-length short of the water, so BOAT entry must accept "water
  // right there", not only "water underfoot"; entering hops the hull onto it.
  waterNear() {
    const w0 = boatableAt(this.pos.x, this.pos.z);
    if (w0) return { x: this.pos.x, z: this.pos.z, w: w0 };
    for (const r of [4, 7]) {
      for (let k = 0; k < 8; k++) { // k=0 is the bow — checked first each ring
        const a = this.heading + k * Math.PI / 4;
        const x = this.pos.x - Math.sin(a) * r, z = this.pos.z - Math.cos(a) * r;
        const w = boatableAt(x, z);
        if (w) return { x, z, w };
      }
    }
    return null;
  }

  // beaching probe: nearest in-world land point within a couple of boat
  // lengths (or null) — legality test and the step-ashore target in one
  shoreNear() {
    for (const r of [5, 9]) {
      for (let a = 0; a < 8; a++) {
        const x = this.pos.x - Math.sin(a * Math.PI / 4) * r;
        const z = this.pos.z - Math.cos(a * Math.PI / 4) * r;
        if (inWorld(x, z) && !boatableAt(x, z)) return { x, z };
      }
    }
    return null;
  }

  cycleMode() {
    let i = MODES.indexOf(this.mode);
    for (let n = 0; n < MODES.length - 1; n++) {
      i = (i + 1) % MODES.length;
      if (this.modeLegal(MODES[i])) return this.setMode(MODES[i]);
    }
  }

  setMode(m) {
    this.mode = m;
    // stepping ashore: entering a land mode while over water (beached boat,
    // any cycle path) puts the truck/cowboy on the land the probe found, not
    // on the invisible seafloor. Ferry decks keep their own position control.
    if ((m === 'DRIVE' || m === 'WALK') && !this.aboardFerry && boatableAt(this.pos.x, this.pos.z)) {
      const s = this.shoreNear();
      if (s) { this.pos.x = s.x; this.pos.z = s.z; }
    }
    this.wings.visible = m === 'FLY';
    this.cowboy.visible = m === 'WALK';
    this.skiff.visible = m === 'BOAT';
    this.truck.visible = m === 'DRIVE' || m === 'FLY';
    if (m === 'BOAT') {
      const wn = this.waterNear(); // hop onto the water if it's just off the bow
      if (wn) { this.pos.x = wn.x; this.pos.z = wn.z; this._water = wn.w; this.pos.y = wn.w.y; }
      this.vy = 0;
    } else if (m !== 'FLY') { this.pos.y = 0; this.vy = 0; }
    if (m === 'WALK') this.speed = Math.min(this.speed, 2);
    this.hovering = false; // only WALK can be airborne this way — get out of the truck first
    this.sprinting = false;
    this.sprintBuildup = 0;
  }

  toggleFlashlight() {
    this.flashlightOn = !this.flashlightOn;
    this.flashlightTimer = this.flashlightOn ? FLASHLIGHT_DURATION : 0;
    return this.flashlightOn;
  }

  resetToRoad() {
    const r = nearestRoad(this.pos.x, this.pos.z, 500);
    if (r) {
      this.pos.set(r.x, this.mode === 'FLY' ? this.pos.y : 0, r.z);
      this.speed = 0;
      if (this.mode === 'BOAT') this.setMode('DRIVE'); // rescued onto a road — back in the truck
    }
  }

  // Grounded-mode step with the waterline stop: DRIVE/WALK halt where
  // navigable water starts (the boat's domain — no seafloor driving), probing
  // a nose-length past the step so the stop lands at the water's edge and the
  // "switch to boat" hint holds while parked facing it. A vehicle already
  // over water (ferry drop-off, teleport) is never trapped: only travel
  // toward water blocks, so reversing off the edge always works.
  moveGround(dt) {
    const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
    const dir = this.speed < 0 ? -1 : 1;
    const nx = this.pos.x + fx * this.speed * dt, nz = this.pos.z + fz * this.speed * dt;
    const edge = !boatableAt(this.pos.x, this.pos.z) && !!boatableAt(nx + fx * 2.2 * dir, nz + fz * 2.2 * dir);
    if (edge) this.speed = 0;
    else { this.pos.x = nx; this.pos.z = nz; }
    this.atWaterline = edge && dir > 0;
  }

  spawnPuff(localX, localY, localZ, color, size, life, riseY) {
    const p = this.puffs.find((p) => p.age >= p.life);
    if (!p) return;
    // heading convention: forward = (-sin, -cos), so back = (+sin, +cos) and
    // right = (+cos, -sin) — the old transform mirrored the offset east/west
    // (exhaust/contrail/wash trailed off one flank at diagonal headings)
    const cos = Math.cos(this.heading), sin = Math.sin(this.heading);
    p.m.position.set(
      this.pos.x + localX * cos + localZ * sin,
      this.pos.y + localY,
      this.pos.z - localX * sin + localZ * cos
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

    if (this.aboardFerry) {
      // position/heading/speed driven externally by FerrySystem this frame
    } else if (this.mode === 'DRIVE') {
      const road = nearestRoad(this.pos.x, this.pos.z, 4);
      // top speed by road tier; offroad is slow going — except Padre's wet
      // sand, which drives like a primary road (posted 33 on the driftwood)
      const caps = { motorway: 46, trunk: 38, primary: 33, street: 26 };
      const sand = !road && beachAt(this.pos.x, this.pos.z);
      const wet = 1 - Math.min(1, ATMOS.rain) * this.perks.rainDrag; // rain slows you like it slows traffic
      const maxSpd = (road ? caps[road.type] * this.perks.engineCap
        : sand ? caps.primary * this.perks.engineCap : this.perks.offroadCap) * wet;
      const accel = road ? 26 : sand ? 24 : this.perks.offroadAccel;
      if (fwd) this.speed += accel * dt;
      else if (back) { this.speed -= (this.speed > 0 ? 40 : 12) * dt; this.braking = this.speed > 0.5; }
      else this.speed *= Math.pow(0.35, dt); // coast friction
      this.speed = THREE.MathUtils.clamp(this.speed, -8, maxSpd);
      this.heading += steer * dt * 1.9 * Math.min(1, Math.abs(this.speed) / 9) * Math.sign(this.speed || 1);
      this.moveGround(dt);
      this.tilt = steer * Math.min(1, Math.abs(this.speed) / 25) * 0.09;
    } else if (this.mode === 'BOAT') {
      // momentum-heavy: slow spool-up, a glide that carries, rudder needs way on
      if (fwd) this.speed += this.perks.boatAccel * dt;
      else if (back) this.speed -= (this.speed > 0 ? 10 : 5) * dt;
      // cruise hold (W3): above the band the glide stops decaying — release W
      // and she holds way on; below it the old decay reclaims drift-to-rest.
      // No min-speed clamp (a floor would fight beaching's hard stop).
      else if (this.speed <= BOAT_HOLD) this.speed *= Math.pow(BOAT_COAST, dt);
      this.speed = THREE.MathUtils.clamp(this.speed, BOAT_REV, this.perks.boatCap);
      this.heading += steer * dt * BOAT_TURN * Math.min(1, Math.abs(this.speed) / 8) * Math.sign(this.speed || 1);
      const nx = this.pos.x - Math.sin(this.heading) * this.speed * dt;
      const nz = this.pos.z - Math.cos(this.heading) * this.speed * dt;
      const nw = boatableAt(nx, nz);
      if (nw) { this.pos.x = nx; this.pos.z = nz; this._water = nw; }
      else this.speed = 0; // beached: the hull grounds where the water ends
      this.tilt = -steer * Math.min(1, Math.abs(this.speed) / this.perks.boatCap) * 0.13; // heel into the turn
    } else if (this.mode === 'FLY') {
      if (fwd) this.speed += 40 * dt;
      else if (back) this.speed -= 50 * dt;
      this.speed = THREE.MathUtils.clamp(this.speed, 6, this.perks.flyCap); // planes don't hover
      this.heading += steer * dt * 1.35;
      if (k['Space']) this.vy += this.perks.flyClimb * dt;
      if (k['ControlLeft'] || k['ControlRight'] || k['ShiftLeft']) this.vy -= 60 * dt;
      this.vy *= Math.pow(0.2, dt);
      // soft clamp: skim the terrain (or airport pad), never crash into it
      const floor = (groundYAt(this.pos.x, this.pos.z) ?? hAt(this.pos.x, this.pos.z)) + 1.8;
      this.pos.y = THREE.MathUtils.clamp(this.pos.y + this.vy * dt, floor, 300);
      this.pos.x -= Math.sin(this.heading) * this.speed * dt;
      this.pos.z -= Math.cos(this.heading) * this.speed * dt;
      this.tilt = steer * 0.5;
    } else { // WALK
      if (!this.hovering && this.perks.jetpack && k['Space']) { this.hovering = true; this.onThrust?.(); }

      // sprint build-up/drain — see SPRINT_* constants for the rules
      const sprintEligible = fwd && !back && steer === 0 && !this.hovering;
      if (!sprintEligible) { this.sprintBuildup = 0; this.sprinting = false; }
      else if (!this.sprinting) {
        this.sprintBuildup += dt;
        if (this.sprintBuildup >= SPRINT_BUILDUP) this.sprinting = true;
      }
      if (this.sprinting) {
        this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN * dt);
        if (this.stamina <= 0) { this.sprinting = false; this.sprintBuildup = 0; }
      } else {
        this.stamina = Math.min(1, this.stamina + STAMINA_REGEN * dt);
      }

      const maxSpd = this.hovering ? this.perks.jetSpeed : (this.sprinting ? SPRINT_SPEED : WALK_SPEED);
      if (fwd) this.speed += (this.sprinting ? 28 : 18) * dt;
      else if (back) this.speed -= 18 * dt;
      else this.speed *= Math.pow(0.02, dt);
      this.speed = THREE.MathUtils.clamp(this.speed, -2.5, maxSpd);
      this.heading += steer * dt * 2.6;
      this.moveGround(dt);
      this.tilt = 0;

      if (this.hovering) {
        // own ground sample (FLY's floor does the same) — the shared `ground`
        // clamp below runs after this branch and is skipped while hovering
        const groundHere = groundYAt(this.pos.x, this.pos.z) ?? hAt(this.pos.x, this.pos.z);
        if (k['Space']) this.vy += this.perks.jetThrust * dt; else this.vy -= GRAV * dt;
        if (k['ControlLeft'] || k['ControlRight'] || k['ShiftLeft']) this.vy -= GRAV * dt;
        this.vy *= Math.pow(AIRDAMP, dt);
        const wantY = this.pos.y + this.vy * dt;
        const cap = groundHere + this.perks.jetAlt;
        this.pos.y = THREE.MathUtils.clamp(wantY, groundHere, cap);
        if (this.pos.y !== wantY) this.vy = 0; // soft bonk: ceiling or touchdown
        if (this.pos.y <= groundHere && !k['Space']) this.hovering = false; // landed, thrust off
      }
    }

    // Soft wall at the edge of the roamable world — Texas proper plus the
    // shoulder (land) / shelf (Gulf); Mexico gets no dilation (settled as out).
    // Skipped aboard a ferry: channel crossings are well inside the shelf
    // allowance anyway, but a directly-driven pos shouldn't fight the wall.
    // Border reservoirs (Falcon, Amistad) straddle the Rio Grande: their
    // Mexico-side water is boatable but not inWorld, and the soft wall read
    // as an invisible line mid-lake (W2 playtest). Lake water counts as
    // in-world — the far bank still beaches/walls like any Mexico land, and
    // the gulf's beyond-shelf wall is untouched (kind 'gulf' stays inWorld-gated).
    const inW = this.aboardFerry || inWorld(this.pos.x, this.pos.z)
      || boatableAt(this.pos.x, this.pos.z)?.kind === 'lake';
    if (!inW) {
      if (this._wasInWorld) {
        const zone = borderZoneAt(this.pos.x, this.pos.z);
        if (zone === 'coast') this.onWorldEdge?.("That's blue water, partner. Texas is the other way.");
        else if (zone === 'land') this.onWorldEdge?.("That's about as far as this road goes.");
      }
      const c = nearestCity(this.pos.x, this.pos.z).city;
      const dx = c.x - this.pos.x, dz = c.z - this.pos.z;
      const L = Math.hypot(dx, dz) || 1;
      this.pos.x += (dx / L) * Math.max(10, Math.abs(this.speed)) * dt * 2;
      this.pos.z += (dz / L) * Math.max(10, Math.abs(this.speed)) * dt * 2;
      this.speed *= Math.pow(0.1, dt);
    }
    this._wasInWorld = inW;

    // ground modes ride the terrain (or an airport pad's flat plateau) — aboard
    // a ferry the deck height is FerrySystem's call, not the terrain's
    const ground = groundYAt(this.pos.x, this.pos.z) ?? hAt(this.pos.x, this.pos.z);
    if (this.mode === 'BOAT') this.pos.y = this._water?.y ?? ground; // ride the water level, never hAt
    else if (this.mode !== 'FLY' && !this.hovering && !this.aboardFerry) this.pos.y = ground;
    this.groundY = ground;
    if (this.mode === 'FLY' || this.mode === 'BOAT' || this.aboardFerry) this.atWaterline = false;

    // Place avatar
    const avatar = this.mode === 'WALK' ? this.cowboy : this.mode === 'BOAT' ? this.skiff : this.truck;
    avatar.position.copy(this.pos);
    avatar.rotation.set(0, this.heading, 0);
    avatar.rotateZ(this.tilt || 0);
    if (this.mode === 'FLY') avatar.rotateX(THREE.MathUtils.clamp(-this.vy * 0.012, -0.35, 0.35));
    else if (this.mode === 'BOAT') {
      // chop (W2): live ATMOS every frame — wind sets the base, rain/storm
      // multiply, planing flattens as the hull climbs onto its own wake.
      // Attitude and bob live on the avatar only: pos.y stays _water.y (the
      // legality/y source, and what the wake/sparkle pools ride).
      const planing = 1 - 0.7 * Math.min(1, Math.abs(this.speed) / this.perks.boatCap);
      this.chopAmp = 0.016 * ATMOS.wind * (1 + Math.min(1.6, ATMOS.rain) * 0.6) * planing;
      this.chopT += dt * (0.8 + ATMOS.wind * 0.5);
      avatar.rotateX(Math.sin(this.chopT * 1.7) * this.chopAmp);
      avatar.rotateZ(Math.sin(this.chopT * 1.25 + 1.1) * this.chopAmp * 0.8);
      avatar.position.y += Math.sin(this.chopT * 2.1) * this.chopAmp * 3;
    }
    else if (!this.aboardFerry) {
      // pitch with the slope (sample fore/aft along heading) — flat on the ferry deck
      const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
      const gAt = (x, z) => groundYAt(x, z) ?? hAt(x, z);
      const dh = gAt(this.pos.x + fx * 2.2, this.pos.z + fz * 2.2) - gAt(this.pos.x - fx * 2.2, this.pos.z - fz * 2.2);
      avatar.rotateX(THREE.MathUtils.clamp(Math.atan2(dh, 4.4), -0.5, 0.5) * (this.mode === 'DRIVE' ? 1 : 0.4));
    }

    this.animate(dt, avatar, fwd, steer);

    // blob shadow projects onto the terrain — or onto the water under the boat
    // (ground is hAt, which over the gulf sits above the -2.5 water plane)
    this.shadow.position.set(this.pos.x, this.mode === 'BOAT' ? this.pos.y + 0.04 : ground + 0.08, this.pos.z);
    const alt = this.mode === 'FLY' ? Math.max(0, this.pos.y - ground) : 0;
    const shScale = (this.mode === 'WALK' ? 0.5 : this.mode === 'FLY' ? 1.4 : 1) * (1 + alt * 0.004);
    this.shadow.scale.setScalar(shScale);
    this.shadow.material.opacity = 0.26 * Math.max(0, 1 - alt / 80);

    // Chase camera — jetpack hover pulls the framing up/back proportional to
    // AGL (the existing camPos.lerp below smooths the rise, no extra easing needed)
    const agl = this.hovering ? Math.max(0, this.pos.y - this.groundY) : 0;
    const sprintKick = this.mode === 'WALK' && this.sprinting ? 1.4 : 0;
    const back2 = this.mode === 'FLY' ? 16 : this.mode === 'WALK' ? 7 + agl * 0.12 + sprintKick : this.mode === 'BOAT' ? 12 : 11;
    const up = this.mode === 'FLY' ? 7 : this.mode === 'WALK' ? 3.2 + agl * 0.15 + sprintKick * 0.3 : this.mode === 'BOAT' ? 5.5 : 5;
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
    this.flashLight.visible = false;
    this.flashLight.intensity = 0;
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
      // nav lights ride headlights.visible so the UFO flicker kills them too
      w.navL.visible = w.navR.visible = lightsOn;
      w.strobe.visible = lightsOn && (performance.now() % 1200) < 110;
      // contrail at speed/altitude
      this.puffTimer -= dt;
      if (this.speed > 70 && this.pos.y > 25 && this.puffTimer <= 0) {
        this.puffTimer = 0.06;
        this.spawnPuff(0, 0.9, 2.4, 0xffffff, 2.2, 1.4, 0.1);
      }
    } else if (this.mode === 'BOAT') {
      // outboard wash while under throttle — reuses the shared puff pool
      this.puffTimer -= dt;
      if (throttling && this.speed > 2 && this.puffTimer <= 0) {
        this.puffTimer = 0.1;
        this.spawnPuff(0, 0.15, 2.4, 0xe8f2f6, 1.5, 0.7, 0.15);
      }
      // wake (W2): drop a foam disc off the stern while under way — capped
      // pool, spawn skipped when no slot is free (never grows past WAKE_N)
      this.wakeTimer -= dt;
      if (Math.abs(this.speed) > 4 && this.wakeTimer <= 0) {
        this.wakeTimer = 0.11;
        for (let i = 0; i < this.wakeSlots.length; i++) {
          const w = this.wakeSlots[i];
          if (w.age < w.life) continue;
          w.age = 0; w.life = 2.4;
          w.x = this.pos.x + Math.sin(this.heading) * 2.3;
          w.z = this.pos.z + Math.cos(this.heading) * 2.3;
          w.y = this.pos.y + 0.05 + i * 0.0015; // y-stagger above the one water plane
          w.s = 0.9 + Math.min(1, Math.abs(this.speed) / this.perks.boatCap) * 1.3;
          break;
        }
      }
      // running lights (Sea-Industry W3): same lightsOn threshold as the
      // wings' navs (the mkWings idiom) — perk-gated, no scene light added
      const sk = this.skiff.userData;
      sk.navL.visible = sk.navR.visible = sk.stern.visible = this.mode === 'BOAT' && this.perks.boatlights && lightsOn;
    } else { // WALK
      const c = this.cowboy.userData;
      const moving = Math.abs(this.speed) > 0.4;
      const prevPhase = this.walkPhase;
      this.walkPhase += dt * (3 + Math.abs(this.speed) * 2.4);
      if (moving) {
        // denominator reaches SPRINT_SPEED, not the old WALK_SPEED cap, so
        // full leg-swing keeps growing into the sprint range instead of
        // saturating at a fast walk
        const s = Math.sin(this.walkPhase) * Math.min(1, Math.abs(this.speed) / SPRINT_SPEED) * 0.55;
        c.ll.rotation.x = s; c.rl.rotation.x = -s;
        c.la.rotation.x = -s * 0.8; c.ra.rotation.x = s * 0.8;
        this.cowboy.position.y = this.pos.y + Math.abs(Math.sin(this.walkPhase)) * 0.05;
        // footstep on each stride crossing
        if (Math.floor(prevPhase / Math.PI) !== Math.floor(this.walkPhase / Math.PI)) this.onStep?.();
      } else {
        for (const part of [c.ll, c.rl, c.la, c.ra]) part.rotation.x *= Math.pow(0.01, dt);
        c.la.rotation.z = 0.06 * Math.sin(performance.now() * 0.0012); // idle sway
      }
      // flashlight: KeyL swaps the ambient lantern for a stronger forward
      // beam, capped at FLASHLIGHT_DURATION — ticks down here since this WALK
      // branch is the only place both lights are driven, and auto-off must
      // hand lighting back to the lantern the instant the beam expires.
      if (this.flashlightOn) {
        this.flashlightTimer -= dt;
        if (this.flashlightTimer <= 0) { this.flashlightOn = false; this.flashlightTimer = 0; }
      }
      // lantern glows after dark, unless the flashlight has taken over — and
      // the UFO Levelland flicker reaches it too
      const lampOn = night && !this.flashlightOn && !(ATMOS.ufo > 0 && Math.random() < ATMOS.ufo * 0.35);
      c.lampGlow.visible = lampOn;
      c.lampLight.intensity = lampOn ? 14 + Math.sin(this.walkPhase * 2) * 1.5 : 0;
      if (this.flashlightOn) {
        const fx = this.pos.x + fwdX * 0.6, fz = this.pos.z + fwdZ * 0.6;
        const fy = hAt(fx, fz) + 1.5;
        this.flashLight.visible = true;
        this.flashLight.intensity = 26;
        this.flashLight.position.set(fx, fy, fz);
        this.flashLight.target.position.set(this.pos.x + fwdX * 10, fy - 0.3, this.pos.z + fwdZ * 10);
        this.flashLight.target.updateMatrixWorld();
      }
      // jetpack flame: only while actively thrusting, cuts the instant Space releases
      const thrust = this.hovering && !!this.keys['Space'];
      c.flameL.visible = c.flameR.visible = thrust;
      if (thrust) {
        const flick = 0.75 + Math.random() * 0.5;
        c.flameL.scale.set(1, flick, 1);
        c.flameR.scale.set(1, flick, 1);
      }
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

    // wake pool (W2): expand + fade — updated in every mode so leftovers
    // dissolve after beaching or a mode switch
    const m = this._fxM, col = this._fxC;
    for (let i = 0; i < this.wakeSlots.length; i++) {
      const w = this.wakeSlots[i];
      if (w.age >= w.life) { this.wake.setMatrixAt(i, m.makeScale(0, 0, 0)); continue; }
      w.age += dt;
      const f = Math.min(1, w.age / w.life);
      const s = w.s * (0.55 + f * 1.9);
      this.wake.setMatrixAt(i, m.makeScale(s, 1, s).setPosition(w.x, w.y, w.z));
      this.wake.setColorAt(i, col.setScalar(0.5 * (1 - f)));
    }
    this.wake.instanceMatrix.needsUpdate = true;
    if (this.wake.instanceColor) this.wake.instanceColor.needsUpdate = true;

    // sparkle (W2): sun glints scattered on the water around the boat —
    // world-anchored slots re-seeded when left behind, twinkle via
    // instanceColor; daylight and clear skies drive the intensity
    this.sparkle.visible = this.mode === 'BOAT';
    if (this.sparkle.visible) {
      this.sparkTimer -= dt;
      const reseed = this.sparkTimer <= 0;
      if (reseed) this.sparkTimer = 0.12;
      const glint = (1 - ATMOS.night) * ({ clear: 1, clouds: 0.35, dust: 0.4 }[ATMOS.weather] ?? 0.12);
      const wy = this._water?.y ?? this.pos.y;
      for (let i = 0; i < this.sparkSlots.length; i++) {
        const s = this.sparkSlots[i];
        if (reseed && (!s.on || Math.hypot(s.x - this.pos.x, s.z - this.pos.z) > 30)) {
          const a = Math.random() * Math.PI * 2, r = 4 + Math.sqrt(Math.random()) * 24;
          const x = this.pos.x + Math.sin(a) * r, z = this.pos.z + Math.cos(a) * r;
          s.on = !!boatableAt(x, z); // glints stay off land near the banks
          if (s.on) { s.x = x; s.z = z; s.phase = Math.random() * 6.28; s.rate = 1.5 + Math.random() * 3; }
        }
        const tw = s.on ? Math.max(0, Math.sin(this.chopT * s.rate + s.phase)) ** 3 * glint : 0;
        this.sparkle.setMatrixAt(i, m.makeScale(1, 1, 1).setPosition(s.x, wy + 0.03 + i * 0.0008, s.z));
        this.sparkle.setColorAt(i, col.setScalar(tw * 0.9));
      }
      this.sparkle.instanceMatrix.needsUpdate = true;
      if (this.sparkle.instanceColor) this.sparkle.instanceColor.needsUpdate = true;
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

  g.userData = { headlights: lights, wheels, brakes, cargo, beams, bodyMat: body };
  return g;
}

// BOAT avatar: an aluminum skiff — hull, diamond prow, gunwale stripe,
// console, bench, outboard. Group origin sits at the waterline (pos.y = water
// level): the hull drafts slightly under, gunwales ride proud. Same boxy
// vertex-cheap style as the truck; trim reuses the truck blue.
function mkSkiff() {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xdde4e8, flatShading: true });
  const trimMat = new THREE.MeshLambertMaterial({ color: 0x2563b0, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x22262e });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 4.2), hullMat);
  hull.position.y = 0.2; // draft 0.15 under the waterline, freeboard 0.55
  const bow = new THREE.Mesh(new THREE.BoxGeometry(1.21, 0.6, 1.21), hullMat);
  bow.position.set(0, 0.25, -2.1);
  bow.rotation.y = Math.PI / 4; // diamond footprint reads as a prow at parked-truck distance
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.16, 3.6), trimMat);
  stripe.position.set(0, 0.5, 0.2); // gunwale stripe
  const console = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.5), trimMat);
  console.position.set(0, 0.85, 0.2);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.06), new THREE.MeshLambertMaterial({ color: 0x9fc4e8 }));
  screen.position.set(0, 1.18, -0.05);
  screen.rotation.x = -0.3;
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.28, 0.5), dark);
  bench.position.set(0, 0.62, 1.3);
  const motor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.5), dark);
  motor.position.set(0, 0.72, 2.25);
  const skeg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.25), dark);
  skeg.position.set(0, 0.08, 2.35);
  const star = mkStarMesh(0.3, 0xffd35c);
  star.rotation.x = -Math.PI / 2;
  star.position.set(0, 0.59, -1.2); // on the foredeck
  g.add(hull, bow, stripe, console, screen, bench, motor, skeg, star);

  // Sea-Industry W3: crate stack (shrimp/cargo hauls) — foredeck, hidden until loaded
  const cargo = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), new THREE.MeshLambertMaterial({ color: 0xa07a48, flatShading: true }));
  cargo.position.set(0, 0.85, -0.6);
  cargo.visible = false;
  g.add(cargo);

  // running lights (the mkWings navL/navR/strobe idiom): red port, green
  // starboard, white stern — MeshBasic only, never a scene light (GOTCHAS law)
  const nav = (hex) => new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: hex }));
  const navL = nav(0xff2222); navL.position.set(-0.87, 0.62, 0.2);
  const navR = nav(0x22ff44); navR.position.set(0.87, 0.62, 0.2);
  const stern = nav(0xffffff); stern.position.set(0, 1.05, 2.25);
  navL.visible = navR.visible = stern.visible = false;
  g.add(navL, navR, stern);

  g.userData = { hullMat, cargo, navL, navR, stern };
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

  g.userData = { prop, blur, navL, navR, strobe, landing, mat, stockColor: mat.color.getHex() };
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

  // jetpack backpack + thruster flames (worn on the back — local -z is the
  // avatar's facing direction after rotY(heading), so +z is behind the torso)
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.2),
    new THREE.MeshLambertMaterial({ color: 0x4a4f57 }));
  pack.position.set(0, 1.08, 0.27);
  const nozzleMat = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
  const mkNozzle = (x) => {
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 6), nozzleMat);
    n.position.set(x, 0.82, 0.27);
    return n;
  };
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa030 });
  const mkFlame = (x) => {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.32, 6), flameMat);
    f.position.set(x, 0.6, 0.27);
    f.rotation.x = Math.PI; // tip points down, away from the nozzle
    f.visible = false;
    return f;
  };
  const flameL = mkFlame(-0.09), flameR = mkFlame(0.09);

  g.add(torso, belt, buckle, bandana, head, brim, crown, pack, mkNozzle(-0.09), mkNozzle(0.09), flameL, flameR);
  g.userData = { ll, rl, la, ra, lampGlow, lampLight, flameL, flameR };
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
