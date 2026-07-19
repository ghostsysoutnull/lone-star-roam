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
        expected: Math.min(...falcon.pts.map(([x, z]) => g.hAt(x, z))) + 0.15,
      };
    })()`);
    t.ok(res.gulf?.kind === 'gulf', `open Gulf not boatable: ${JSON.stringify(res.gulf)}`);
    t.near(res.gulf.y, await t.ev('g.SEA_Y'), 0.001, 'gulf boat level is not the one water plane');
    t.ok(res.laguna?.kind === 'gulf', 'Laguna Madre not navigable — the coast classifier should cover it for free');
    t.ok(res.lake?.kind === 'lake', 'Falcon Lake interior not boatable');
    t.ok(res.inland === null, 'downtown Austin reads as navigable water');
    t.ok(res.lakeLevels === res.nLakes && res.nLakes >= 6, `baked lake levels missing: ${res.lakeLevels}/${res.nLakes}`);
    t.near(res.falconLevel, res.expected, 0.001, 'Falcon level drifted from the lowest-shoreline formula');
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
    await t.ev(`g.player.heading = 0.6`); // up the long axis, natural value
    await t.hold('KeyW');
    await t.simStep(3);
    await t.release();
    const res = await t.ev(`({ y: g.player.pos.y, v: g.player.speed, kind: g.boatableAt(g.player.pos.x, g.player.pos.z)?.kind })`);
    t.ok(res.kind === 'lake', `left the lake mid-run (kind ${res.kind})`);
    t.near(res.y, level, 0.01, 'boat not riding the baked lake level');
    t.ok(res.v > 8, `lake boating never got under way: ${res.v.toFixed(1)}`);
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
