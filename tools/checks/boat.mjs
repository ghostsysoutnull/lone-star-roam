// BOAT mode (Water Vehicles W1) at natural play values. Legality is geo.js
// boatableAt — gulf by zone classifier ∩ shelf, lakes by polygon + baked
// level — never hAt depth (it clamps and can't say "water"). Physics runs use
// t.simStep; one check stays on the real render loop (the per-system
// sentinel rule), and the ferries suite owns dock non-interference.
// Spots were probed against border/islands/lakes data (2026-07-19):
const GULF = { x: 4700, z: 2150 };   // open Gulf SE of Galveston (tours spot)
const LAGUNA = { x: 2100, z: 4500 }; // Laguna Madre behind Padre
const SHORE = { x: 4470, z: 1891 };  // Galveston island; water starts ~45u east

export default async function boat(t) {
  await t.check('boatableAt: gulf, laguna and lakes wet — inland dry', async () => {
    const res = await t.ev(`(() => {
      const austin = g.GEO.cities.find((c) => c.name === 'Austin');
      const falcon = g.GEO.lakes.find((l) => l.name === 'Falcon Lake');
      return {
        gulf: g.boatableAt(${GULF.x}, ${GULF.z}),
        laguna: g.boatableAt(${LAGUNA.x}, ${LAGUNA.z}),
        lake: g.boatableAt(224, 4649),
        inland: g.boatableAt(austin.x, austin.z),
        lakeLevels: g.GEO.lakes.map((l) => l.level).filter((v) => typeof v === 'number').length,
        nLakes: g.GEO.lakes.length,
        falconLevel: falcon.level,
        expected: Math.min(...falcon.pts.map(([x, z]) => g.hAt(x, z))) + g.LAKE_OFFSET,
        lakeOffset: g.LAKE_OFFSET, riverOffset: g.RIVER_OFFSET,
      };
    })()`);
    t.ok(res.gulf?.kind === 'gulf', `open Gulf not boatable: ${JSON.stringify(res.gulf)}`);
    t.near(res.gulf.y, await t.ev('g.SEA_Y'), 0.001, 'gulf boat level is not the one water plane');
    t.ok(res.laguna?.kind === 'gulf', 'Laguna Madre not navigable — the coast classifier should cover it for free');
    t.ok(res.lake?.kind === 'lake', 'Falcon Lake interior not boatable');
    t.ok(res.inland === null, 'downtown Austin reads as navigable water');
    t.ok(res.lakeLevels === res.nLakes && res.nLakes >= 6, `baked lake levels missing: ${res.lakeLevels}/${res.nLakes}`);
    t.near(res.falconLevel, res.expected, 0.001, 'Falcon level drifted from the lowest-shoreline formula');
    // W2 look-pass values — a retune must land here and in the source together
    t.near(res.lakeOffset, 0.3, 0.001, 'LAKE_OFFSET drifted from the W2 look-pass');
    t.near(res.riverOffset, 0.12, 0.001, 'RIVER_OFFSET drifted from the W2 look-pass');
  });

  await t.check('V cycle skips BOAT inland (I-10 west)', async () => {
    await t.tp(-2767, 334); // empty motorway stretch, no water within the probe radius
    const modes = await t.ev(`(() => {
      const seen = [];
      for (let i = 0; i < 4; i++) { g.player.cycleMode(); seen.push(g.player.mode); }
      return seen;
    })()`);
    t.ok(!modes.includes('BOAT'), `BOAT offered inland: ${modes.join('→')}`);
    t.ok(modes.join() === 'FLY,WALK,DRIVE,FLY', `cycle order drifted: ${modes.join('→')}`);
  });

  await t.check('one V at the water: DRIVE→BOAT on Galveston gulf water, y = SEA_Y', async () => {
    await t.tp(GULF.x, GULF.z); // DRIVE teleported onto open water (not trapped, and boat is one V away)
    const res = await t.ev(`(() => {
      g.player.cycleMode();
      return { mode: g.player.mode, y: g.player.pos.y, driveLegal: g.player.modeLegal('DRIVE'), walkLegal: g.player.modeLegal('WALK') };
    })()`);
    t.ok(res.mode === 'BOAT', `cycle from DRIVE over water gave ${res.mode}, expected BOAT`);
    t.near(res.y, -2.5, 0.01, 'boat not riding the gulf plane');
    t.ok(!res.driveLegal && !res.walkLegal, 'land modes stayed legal over open water (no shore in reach)');
  });

  await t.check('boat cap ≈ 24, momentum carries the glide, rudder needs way on', async () => {
    // natural mid-bay heading, aimed at open water (ESE, away from the island)
    await t.ev(`(g.player.heading = -1.97, g.player.speed = 0)`);
    const still = await t.ev(`(() => { // rudder at rest: no way on, no authority
      const h0 = g.player.heading;
      g.player.keys['KeyA'] = true;
      for (let i = 0; i < 20; i++) g.player.update(0.05);
      g.player.keys = {};
      return Math.abs(g.player.heading - h0);
    })()`);
    t.ok(still < 0.02, `boat turned ${still.toFixed(3)} rad with no way on`);
    await t.hold('KeyW');
    const { maxSpeed } = await t.simStep(5);
    await t.release();
    t.ok(maxSpeed <= 24.5, `over the boat cap: ${maxSpeed.toFixed(1)}`);
    t.ok(maxSpeed >= 20.4, `never neared the boat cap: ${maxSpeed.toFixed(1)}`);
    const v0 = await t.ev('g.player.speed');
    const turning = await t.ev(`(() => { // at speed the same rudder bites
      const h0 = g.player.heading;
      g.player.keys['KeyA'] = true;
      for (let i = 0; i < 20; i++) g.player.update(0.05);
      g.player.keys = {};
      return Math.abs(g.player.heading - h0);
    })()`);
    t.ok(turning > 0.8, `full-speed rudder barely turned: ${turning.toFixed(2)} rad`);
    await t.simStep(2); // hands off: the glide carries (DRIVE would bleed to ~12%)
    const res = await t.ev(`({ v: g.player.speed, y: g.player.pos.y })`);
    t.ok(res.v > v0 * 0.6 && res.v < v0 * 0.85, `coast retention off: ${res.v.toFixed(1)} of ${v0.toFixed(1)} after 2s`);
    t.near(res.y, -2.5, 0.01, 'y left the water plane during the run');
  });

  await t.check('beaches at the Laguna shore: stops, hull stays on water', async () => {
    await t.tp(LAGUNA.x, LAGUNA.z, 'BOAT');
    await t.ev(`g.player.heading = Math.PI / 2 + 0.15`); // west-ish, into the mainland bank
    await t.hold('KeyW');
    await t.simStep(25);
    const res = await t.ev(`(() => {
      const p = g.player, fx = -Math.sin(p.heading) * 2, fz = -Math.cos(p.heading) * 2;
      return { speed: p.speed, onWater: !!g.boatableAt(p.pos.x, p.pos.z), ahead: !!g.boatableAt(p.pos.x + fx, p.pos.z + fz), mode: p.mode };
    })()`);
    await t.release();
    t.ok(res.speed === 0, `throttle held into the bank but never grounded: speed ${res.speed}`);
    t.ok(res.onWater, 'beached hull ended up on land — the boat crossed the waterline');
    t.ok(!res.ahead, 'stopped with open water still ahead — that is a stall, not a beaching');
    t.ok(res.mode === 'BOAT', 'mode changed during the beaching run');
  });

  await t.check('beached: DRIVE is legal again and the cycle steps ashore', async () => {
    const res = await t.ev(`(() => {
      const legal = g.player.modeLegal('DRIVE');
      const seen = [];
      for (let i = 0; i < 3; i++) { g.player.cycleMode(); seen.push(g.player.mode); }
      return { legal, seen, onLand: !g.boatableAt(g.player.pos.x, g.player.pos.z) };
    })()`);
    t.ok(res.legal, 'DRIVE stayed illegal with the bow on the sand');
    t.ok(res.seen.join() === 'FLY,WALK,DRIVE', `cycle from beached BOAT ran ${res.seen.join('→')}, expected FLY→WALK→DRIVE`);
    t.ok(res.onLand, 'stepped ashore but the truck is still over navigable water');
  });

  await t.check('DRIVE soft-stops at the Galveston waterline, hint signal up, V boats', async () => {
    await t.tp(SHORE.x, SHORE.z);
    await t.ev(`g.player.heading = -Math.PI / 2 + 0.12`); // east-ish at the Gulf, natural off-axis
    await t.hold('KeyW');
    await t.simStep(8);
    await t.release();
    const res = await t.ev(`(() => {
      const p = g.player;
      return { speed: p.speed, atWaterline: p.atWaterline, onLand: !g.boatableAt(p.pos.x, p.pos.z), boatLegal: p.modeLegal('BOAT') };
    })()`);
    t.ok(res.speed === 0, `truck still rolling after 8s aimed at the Gulf: ${res.speed.toFixed(1)}`);
    t.ok(res.onLand, 'truck ended up on navigable water — the waterline stop failed');
    t.ok(res.atWaterline, 'parked facing the water but the hint signal is down');
    t.ok(res.boatLegal, 'V at the waterline stop does not offer BOAT');
    const hop = await t.ev(`(() => { g.player.cycleMode(); return { mode: g.player.mode, w: !!g.boatableAt(g.player.pos.x, g.player.pos.z), y: g.player.pos.y }; })()`);
    t.ok(hop.mode === 'BOAT', `V at the waterline gave ${hop.mode}, expected BOAT`);
    t.ok(hop.w, 'entering BOAT did not hop the hull onto the water');
    t.near(hop.y, -2.5, 0.01, 'hull not at the water level after the hop');
  });

  await t.check('Falcon Lake: boat rides the baked lake level', async () => {
    await t.tp(224, 4649, 'BOAT');
    const level = await t.ev(`g.GEO.lakes.find((l) => l.name === 'Falcon Lake').level`);
    // SE down the long axis — the spot sits ~10u off the west bank, and the
    // old world-edge wall used to mask that by dragging the boat NE (W2 fix)
    await t.ev(`g.player.heading = -2.36`);
    await t.hold('KeyW');
    await t.simStep(3);
    await t.release();
    const res = await t.ev(`({ y: g.player.pos.y, v: g.player.speed, kind: g.boatableAt(g.player.pos.x, g.player.pos.z)?.kind })`);
    t.ok(res.kind === 'lake', `left the lake mid-run (kind ${res.kind})`);
    t.near(res.y, level, 0.01, 'boat not riding the baked lake level');
    t.ok(res.v > 8, `lake boating never got under way: ${res.v.toFixed(1)}`);
  });

  await t.check('chop (W2): calm rocks a little, storm a lot, planing flattens, y pinned', async () => {
    await t.tp(GULF.x, GULF.z, 'BOAT');
    await t.ev(`(g.player.heading = -1.97, g.player.speed = 0)`);
    await t.setWeather('clear');
    // measured over sim time, not a snapshot: skiff pitch + bob range at idle
    const calm = await t.ev(`(() => {
      let pLo = Infinity, pHi = -Infinity, bLo = Infinity, bHi = -Infinity;
      for (let i = 0; i < 80; i++) {
        g.player.update(0.05);
        pLo = Math.min(pLo, g.player.skiff.rotation.x); pHi = Math.max(pHi, g.player.skiff.rotation.x);
        const b = g.player.skiff.position.y - g.player.pos.y;
        bLo = Math.min(bLo, b); bHi = Math.max(bHi, b);
      }
      return { amp: g.player.chopAmp, pitch: pHi - pLo, bob: bHi - bLo, wind: g.ATMOS.wind };
    })()`);
    t.ok(calm.amp > 0, `no chop on calm water: ${calm.amp}`);
    t.ok(calm.pitch > 0.015, `skiff never pitched at idle: range ${calm.pitch.toFixed(4)} rad`);
    t.ok(calm.bob > 0.03, `no bob at idle: range ${calm.bob.toFixed(3)}u`);
    await t.setWeather('storm');
    const storm = await t.ev(`(g.player.update(0.05), g.player.chopAmp)`);
    t.ok(storm > calm.amp * 1.8, `storm barely rocks: ${storm.toFixed(4)} vs calm ${calm.amp.toFixed(4)}`);
    await t.hold('KeyW');
    await t.simStep(4);
    await t.release();
    const res = await t.ev(`({ amp: g.player.chopAmp, y: g.player.pos.y, v: g.player.speed })`);
    t.ok(res.v > 20, `never got on plane: ${res.v.toFixed(1)}`);
    t.ok(res.amp < storm * 0.55, `planing did not flatten the chop: ${res.amp.toFixed(4)} vs idle ${storm.toFixed(4)}`);
    t.near(res.y, -2.5, 0.01, 'chop moved pos.y off the water plane');
    await t.setWeather('clear');
  });

  await t.check('wake (W2): fills behind the stern under way, capped, dissolves at idle', async () => {
    await t.tp(GULF.x, GULF.z, 'BOAT');
    await t.ev(`g.player.heading = -1.97`);
    await t.hold('KeyW');
    await t.simStep(4);
    await t.release();
    const run = await t.ev(`(() => {
      const p = g.player, alive = p.wakeSlots.filter((w) => w.age < w.life);
      return { n: alive.length, cap: p.wakeSlots.length,
               above: alive.every((w) => w.y > p._water.y + 0.03),
               near: alive.every((w) => Math.hypot(w.x - p.pos.x, w.z - p.pos.z) < 120) };
    })()`);
    t.ok(run.n >= 8, `wake thin after a 4s run: ${run.n} discs`);
    t.ok(run.n <= run.cap, `wake pool exceeded its cap: ${run.n}/${run.cap}`);
    t.ok(run.above, 'wake discs not y-staggered above the one water plane');
    t.ok(run.near, 'wake discs scattered far from the run line');
    await t.ev(`g.player.speed = 0`);
    await t.simStep(3); // life is 2.4s — everything ages out once the spawns stop
    const idle = await t.ev(`g.player.wakeSlots.filter((w) => w.age < w.life).length`);
    t.ok(idle === 0, `wake persisted at idle: ${idle} discs`);
  });

  await t.check('outboard wash trails the stern, not a flank (spawnPuff mirror regression)', async () => {
    await t.tp(GULF.x, GULF.z, 'BOAT');
    await t.ev(`g.player.heading = -1.97`); // diagonal heading — the mirror bug hid at N/S
    await t.hold('KeyW');
    await t.simStep(3);
    await t.release();
    const res = await t.ev(`(() => {
      const p = g.player, sin = Math.sin(p.heading), cos = Math.cos(p.heading);
      const rels = [];
      for (const puff of p.puffs) {
        if (puff.age >= puff.life || !puff.m.visible) continue;
        const rx = puff.m.position.x - p.pos.x, rz = puff.m.position.z - p.pos.z;
        rels.push({ along: rx * sin + rz * cos, lateral: rx * cos - rz * sin });
      }
      return rels;
    })()`);
    t.ok(res.length >= 3, `no live wash puffs after a throttle run: ${res.length}`);
    t.ok(res.every((r) => r.along > 0.5), `wash ahead of the boat: ${JSON.stringify(res.map((r) => +r.along.toFixed(1)))}`);
    t.ok(res.every((r) => Math.abs(r.lateral) < 1.2), `wash off a flank (the old mirror put it at ±1.6): ${JSON.stringify(res.map((r) => +r.lateral.toFixed(1)))}`);
  });

  await t.check('Falcon: the border channel is open water — no world-edge wall mid-lake', async () => {
    // Falcon straddles the Rio Grande: find genuinely Mexico-side lake water
    // (boatable, outside Texas AND outside inWorld) with a clear run ahead
    const spot = await t.ev(`(() => {
      const lake = g.GEO.lakes.find((l) => l.name === 'Falcon Lake');
      const bb = lake.pts.reduce((a, [px, pz]) => ({
        minX: Math.min(a.minX, px), maxX: Math.max(a.maxX, px),
        minZ: Math.min(a.minZ, pz), maxZ: Math.max(a.maxZ, pz) }),
        { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
      const fx = -Math.sin(0.6), fz = -Math.cos(0.6);
      for (let x = bb.minX; x < bb.maxX; x += 5) for (let z = bb.minZ; z < bb.maxZ; z += 5) {
        if (g.boatableAt(x, z)?.kind !== 'lake' || g.inTexas(x, z) || g.inWorld(x, z)) continue;
        if (g.boatableAt(x + fx * 8, z + fz * 8) && g.boatableAt(x + fx * 16, z + fz * 16)) return { x, z };
      }
      return null;
    })()`);
    t.ok(spot, 'no Mexico-side water found in Falcon — the straddle premise changed, re-diagnose');
    await t.tp(spot.x, spot.z, 'BOAT');
    const res = await t.ev(`(() => {
      const p = g.player;
      p.heading = 0.6; p.speed = 15;
      for (let i = 0; i < 20; i++) p.update(0.05); // 1s: the wall would crush 15 → ~1.5
      return { v: p.speed, kind: g.boatableAt(p.pos.x, p.pos.z)?.kind, y: p.pos.y,
               level: g.GEO.lakes.find((l) => l.name === 'Falcon Lake').level };
    })()`);
    t.ok(res.v > 10, `world-edge wall still active mid-lake: speed ${res.v.toFixed(1)} after 1s coast from 15`);
    t.ok(res.kind === 'lake', `ran out of lake water (kind ${res.kind}) — scan picked a bad spot`);
    t.near(res.y, res.level, 0.01, 'left the baked lake level crossing the border channel');
  });

  await t.check('sparkle (W2): glints on daylight water, dim at night, BOAT-only', async () => {
    await t.tp(GULF.x, GULF.z, 'BOAT');
    await t.setWeather('clear');
    await t.setDay();
    const day = await t.ev(`(() => {
      for (let i = 0; i < 14; i++) g.player.update(0.05); // several reseed ticks
      const s = g.player.sparkle;
      let sum = 0;
      for (let i = 0; i < g.player.sparkSlots.length; i++) sum += s.instanceColor.getX(i);
      return { visible: s.visible, sum, seeded: g.player.sparkSlots.filter((x) => x.on).length };
    })()`);
    t.ok(day.visible, 'sparkle hidden in BOAT');
    t.ok(day.seeded > 20, `few sparkle slots found water on the open Gulf: ${day.seeded}`);
    t.ok(day.sum > 1, `no daylight glint: intensity sum ${day.sum.toFixed(2)}`);
    await t.setNight();
    const night = await t.ev(`(() => {
      for (let i = 0; i < 14; i++) g.player.update(0.05);
      let sum = 0;
      for (let i = 0; i < g.player.sparkSlots.length; i++) sum += g.player.sparkle.instanceColor.getX(i);
      return sum;
    })()`);
    t.ok(night < day.sum * 0.7, `night glint too bright: ${night.toFixed(2)} vs day ${day.sum.toFixed(2)}`);
    await t.setDay();
    const fly = await t.ev(`(g.player.setMode('FLY'), g.player.update(0.05), g.player.sparkle.visible)`);
    t.ok(!fly, 'sparkle stayed visible outside BOAT');
  });

  await t.check('audio (W2): lap target — boat idle, fades with way on, shore wired', async () => {
    await t.tp(GULF.x, GULF.z, 'BOAT');
    await t.ev(`g.player.speed = 0`);
    const idle = await t.ev(`(g.audio.update(g.player, g.ATMOS), g.audio.lapTarget)`);
    t.ok(idle > 0.04, `no lap at boat idle: ${idle}`);
    await t.ev(`g.player.speed = 20`);
    const fast = await t.ev(`(g.audio.update(g.player, g.ATMOS), g.audio.lapTarget)`);
    t.ok(fast < idle, `lap did not fade with way on: ${fast} vs ${idle}`);
    t.ok(fast > 0, 'lap fully cut while under way — the hull still touches water');
    // main.js wiring: the shore term comes from beachAt on real frames
    await t.tp(2104, 3971.2, 'WALK'); // Padre wet sand (padre.mjs beachEdge)
    await t.wait(0.4);
    const shore = await t.ev(`({ fed: g.audio.lapShore, target: g.audio.lapTarget })`);
    t.ok(shore.fed === 1, `main.js shore feed not wired: lapShore ${shore.fed}`);
    t.ok(shore.target > 0.02, `beach shore-lap silent: ${shore.target}`);
  });

  await t.check('real-loop sentinel: BOAT moves under main.js frames', async () => {
    await t.tp(GULF.x, GULF.z, 'BOAT');
    await t.ev(`g.player.heading = -1.97`);
    const p0 = await t.ev(`({ x: g.player.pos.x, z: g.player.pos.z })`);
    await t.hold('KeyW');
    await t.simWait(1.5);
    await t.release();
    const res = await t.ev(`({ x: g.player.pos.x, z: g.player.pos.z, y: g.player.pos.y, v: g.player.speed })`);
    const moved = Math.hypot(res.x - p0.x, res.z - p0.z);
    t.ok(moved > 3, `barely moved under the real loop: ${moved.toFixed(1)}u`);
    t.ok(res.v > 4, `no way on under the real loop: ${res.v.toFixed(1)}`);
    t.near(res.y, -2.5, 0.01, 'real-loop y not on the water plane');
  });

  await t.check('resume restores a mid-water BOAT session', async () => {
    await t.ev(`g.gameplay.snapshotAt(g.player, g.sky)`);
    await t.tp(0, 0); // far away, back in the truck
    await t.ev(`g.gameplay.applyAt(g.player, g.sky)`);
    const res = await t.ev(`({ mode: g.player.mode, x: g.player.pos.x, y: g.player.pos.y })`);
    t.ok(res.mode === 'BOAT', `resume landed in ${res.mode}, expected BOAT`);
    t.near(res.y, -2.5, 0.01, 'resume put the boat off the water level');
    t.ok(Math.abs(res.x - GULF.x) < 60, 'resume x far from the snapshot');
  });

  await t.check('tour spots: every BOAT spot guarantees water under the hull', async () => {
    const res = await t.ev(`(() => {
      const wv = g.debug.tours.find((tr) => tr.track.startsWith('Water Vehicles'));
      const bad = [];
      for (const s of wv.waves.flatMap((w) => w.spots).filter((s) => s.mode === 'BOAT')) {
        g.debug.visit(s);
        const w = g.boatableAt(g.player.pos.x, g.player.pos.z);
        if (!w || g.player.mode !== 'BOAT' || Math.abs(g.player.pos.y - w.y) > 0.01) bad.push(s.label);
      }
      return bad;
    })()`);
    t.ok(res.length === 0, `BOAT tour spots without water/mode/level: ${res.join(', ')}`);
  });

  await t.check('gulf plane: RGBA fade past the DEM edge (bottomless-ocean fix)', async () => {
    const res = await t.ev(`(() => {
      let gulf; g.player.scene.traverse((o) => { if (o.name === 'gulf') gulf = o; });
      if (!gulf) return { err: 'no gulf mesh' };
      const c = gulf.geometry.attributes.color, p = gulf.geometry.attributes.position;
      const v = g.player.pos.clone();
      let out = null, inn = null;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i); gulf.localToWorld(v);
        const over = Math.max(v.x - g.ELEV.maxX, g.ELEV.minX - v.x, v.z - g.ELEV.maxZ, g.ELEV.minZ - v.z);
        if (over > 400 && out === null) out = c.getW(i);
        if (over < -400 && inn === null) inn = c.getW(i);
        if (out !== null && inn !== null) break;
      }
      return { itemSize: c.itemSize, out, inn, transparent: gulf.material.transparent };
    })()`);
    t.ok(!res.err, res.err);
    t.ok(res.itemSize === 4 && res.transparent, 'gulf plane is not RGBA+transparent');
    t.ok(res.out === 0, `plane still opaque past the DEM edge: alpha ${res.out}`);
    t.ok(res.inn === 1, `in-grid gulf water lost opacity: alpha ${res.inn}`);
  });
}
