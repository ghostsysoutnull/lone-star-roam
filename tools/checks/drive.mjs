// Drive/fly/walk physics at natural play values. Caps live in vehicle.js
// (DRIVE caps{}, WALK 4.5, FLY floor hAt+1.8); rain multiplies caps by
// (1 - rain*0.22), so expected values are computed from live ATMOS.rain.
// Physics runs use t.simStep (synchronous, ~instant); the walk-cap check
// deliberately stays on the real render loop (t.simWait) as the one smoke
// test that player.update still behaves inside the live frame loop.

export default async function drive(t) {
  await t.check('exposes systems on __game', async () => {
    const missing = await t.ev(`['player','gameplay','GEO','sky','missions','traffic','animals','nearestRoad','inTexas','hAt','ATMOS','clock'].filter((k) => !(k in g))`);
    t.ok(!missing.length, `missing: ${missing.join(', ')}`);
  });

  // spawn zone: I-35 south of Austin — a real motorway with curvature
  const austin = await t.ev(`(() => { const c = g.GEO.cities.find((c) => c.name === 'Austin'); return { x: c.x, z: c.z }; })()`);

  await t.check('motorway top speed ≈ cap·wet', async () => {
    // I-10 west of Fort Stockton (LL 30.7,-102.4) — no crossing streets to clamp
    // the cap mid-run like Austin's real arterials do
    await t.tp(-2767, 334);
    await t.ev(`(() => {
      const p = g.player, r = g.nearestRoad(p.pos.x, p.pos.z, 400, (ty) => ty === 'motorway');
      p.pos.set(r.x, 0, r.z);
      p.heading = Math.atan2(-r.tx, -r.tz);
    })()`);
    await t.hold('KeyW');
    const { maxSpeed, types } = await t.simStep(5, true);
    await t.release();
    t.ok(types.includes('motorway'), `never on a motorway (saw: ${types})`);
    const cap = 46 * (1 - Math.min(1, await t.ev('g.ATMOS.rain')) * 0.22);
    t.ok(maxSpeed <= cap + 0.5, `over cap: ${maxSpeed.toFixed(1)} > ${cap.toFixed(1)} (on ${types})`);
    t.ok(maxSpeed >= cap * 0.85, `never neared cap: ${maxSpeed.toFixed(1)} < 85% of ${cap.toFixed(1)} (on ${types})`);
  });

  await t.check('offroad crawls at ≤20', async () => {
    // open ranchland west of Austin — the bubble must stay road-free for the
    // whole run (≤20 u/s × 2.5 s ≈ 50 units), or the truck finds a faster cap
    const spot = await t.ev(`(() => {
      for (let x = ${austin.x} - 120; x > ${austin.x} - 1500; x -= 30) {
        const z = ${austin.z} - 40;
        if (!g.nearestRoad(x, z, 100) && g.inTexas(x, z)) return { x, z };
      }
      return null;
    })()`);
    t.ok(spot, 'no road-free spot found');
    await t.tp(spot.x, spot.z);
    await t.ev('g.player.heading = 3.7'); // natural value; direction deterministic inside the bubble
    await t.hold('KeyW');
    await t.simStep(2.5);
    const spd = await t.ev('g.player.speed');
    await t.release();
    const cap = 20 * (1 - Math.min(1, await t.ev('g.ATMOS.rain')) * 0.22);
    t.ok(spd <= cap + 0.5, `over offroad cap: ${spd.toFixed(1)} > ${cap.toFixed(1)}`);
    t.ok(spd >= cap * 0.8, `never neared offroad cap: ${spd.toFixed(1)}`);
  });

  await t.check('rain slows the offroad cap by 22%', async () => {
    // same road-free bubble as above; the truck barely moved during that check
    await t.setWeather('rain');
    await t.ev('(g.player.speed = 0, g.player.heading = 3.7)');
    await t.hold('KeyW');
    await t.simStep(2.5);
    const spd = await t.ev('g.player.speed');
    await t.release();
    await t.setWeather('clear');
    t.near(spd, 20 * 0.78, 1.2, 'wet offroad cap');
  });

  await t.check('steering turns at an ugly mid-drive heading', async () => {
    await t.tp(austin.x - 300, austin.z - 40);
    await t.ev('(g.player.heading = 2.37, g.player.speed = 15)'); // natural, off the tick grid
    await t.hold('KeyW');
    await t.hold('KeyA');
    await t.simStep(1);
    await t.release();
    const dh = (await t.ev('g.player.heading')) - 2.37;
    // full-rate turn is 1.9 rad/s; allow sim-step slop either side
    t.ok(dh > 1.2 && dh < 2.7, `Δheading ${dh.toFixed(2)} rad outside [1.2, 2.7]`);
  });

  await t.check('brake then reverse, floored at -8', async () => {
    await t.ev('g.player.speed = 18');
    await t.hold('KeyS');
    await t.simStep(2);
    const spd = await t.ev('g.player.speed');
    await t.release();
    t.ok(spd < 0, `still rolling forward: ${spd.toFixed(1)}`);
    t.ok(spd >= -8.01, `reverse below floor: ${spd.toFixed(1)}`);
  });

  await t.check('soft border wall pushes back into Texas', async () => {
    // due west of El Paso is New Mexico
    const ep = await t.ev(`(() => { const c = g.GEO.cities.find((c) => c.name === 'El Paso'); return { x: c.x, z: c.z }; })()`);
    await t.tp(ep.x - 60, ep.z);
    t.ok(!(await t.ev('g.inTexas(g.player.pos.x, g.player.pos.z)')), 'spot unexpectedly inside Texas');
    const d0 = await t.ev(`Math.hypot(g.player.pos.x - ${ep.x}, g.player.pos.z - ${ep.z})`);
    await t.simStep(3);
    const d1 = await t.ev(`Math.hypot(g.player.pos.x - ${ep.x}, g.player.pos.z - ${ep.z})`);
    t.ok(d1 < d0 - 5, `not pushed back: ${d0.toFixed(0)} → ${d1.toFixed(0)}`);
  });

  await t.check('walk speed caps at 4.5 (real render loop)', async () => {
    await t.tp(austin.x - 300, austin.z - 40, 'WALK');
    await t.hold('KeyW');
    await t.simWait(1.5); // deliberately NOT simStep — the frame-loop smoke test
    const spd = await t.ev('g.player.speed');
    await t.release();
    t.near(spd, 4.5, 0.2, 'walk speed');
  });

  await t.check('fly floor clamps to terrain + 1.8', async () => {
    await t.tp(austin.x - 200, austin.z - 100, 'FLY', 30);
    await t.hold('KeyW');
    await t.hold('ControlLeft'); // dive
    const { minAgl } = await t.simStep(4);
    await t.release();
    t.ok(minAgl >= 1.5, `dipped below terrain floor: agl ${minAgl.toFixed(2)}`);
    t.ok(minAgl <= 6, `never reached the floor: agl ${minAgl.toFixed(2)}`);
  });
}
