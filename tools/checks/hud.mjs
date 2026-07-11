// HUD/DOM at natural play values (the compass-only-tested-at-0/90 lesson).
// HUD text updates at ~12 Hz — allow a tick via t.until. One-shot keys go
// through real KeyboardEvents (t.key), the same path a player's keys take.

export default async function hud(t) {
  const austin = await t.ev(`(() => { const c = g.GEO.cities.find((c) => c.name === 'Austin'); return { x: c.x, z: c.z }; })()`);

  await t.check('location line: distance, direction, county', async () => {
    await t.tp(austin.x + 18, austin.z - 18); // 25.5 units NE, mid-block nowhere special
    await t.until(`g.hud.els.location.textContent.includes('of Austin')`, 8000);
    const loc = await t.ev('g.hud.els.location.textContent');
    t.ok(/2\.[45] km NE of Austin/.test(loc), `bad distance/direction: "${loc}"`);
    t.ok(loc.includes('Travis Co.'), `county missing: "${loc}"`);
  });

  await t.check('road ref shows when parked on the interstate', async () => {
    await t.tp(austin.x, austin.z + 12);
    await t.ev(`(() => {
      const r = g.nearestRoad(g.player.pos.x, g.player.pos.z, 400, (ty) => ty === 'motorway');
      g.player.pos.set(r.x, 0, r.z);
    })()`);
    await t.until(`g.hud.els.road.textContent.includes('🛣')`, 8000);
    const road = await t.ev('g.hud.els.road.textContent');
    t.ok(!road.includes('undefined') && road.length > 3, `bad road line: "${road}"`);
  });

  await t.check('speed readout tracks mph = |speed|·2.4', async () => {
    await t.until(`g.hud.els.speed.textContent.includes('0')`, 8000); // parked
    await t.hold('KeyW');
    await t.simWait(1.5);
    const { txt, spd } = await t.ev(`({ txt: g.hud.els.speed.textContent, spd: g.player.speed })`);
    await t.release();
    const shown = parseInt(txt.match(/\d+/)?.[0] ?? '-1', 10);
    // HUD lags up to a 12 Hz tick behind the live speed — generous band
    t.ok(shown > 0 && Math.abs(shown - Math.abs(spd) * 2.4) < 25, `shows ${shown} mph at speed ${spd.toFixed(1)}`);
  });

  await t.check('M toggles the big map (real key event)', async () => {
    const d0 = await t.ev(`g.hud.big.style.display`);
    await t.key('KeyM');
    const d1 = await t.ev(`g.hud.big.style.display`);
    await t.key('KeyM');
    const d2 = await t.ev(`g.hud.big.style.display`);
    t.ok(d1 !== d0 && d1 !== 'none', `map did not open (${d0} → ${d1})`);
    t.ok(d2 === 'none', `map did not close (${d1} → ${d2})`);
  });

  await t.check('C toggles the compass and persists the preference', async () => {
    await t.key('KeyC');
    const off = await t.ev(`({ disp: g.hud.compass.style.display, pref: localStorage['lonestar-compass'] })`);
    await t.key('KeyC');
    const on = await t.ev(`({ disp: g.hud.compass.style.display, pref: localStorage['lonestar-compass'] })`);
    t.ok(off.disp === 'none' && off.pref === 'off', `off state: ${JSON.stringify(off)}`);
    t.ok(on.disp !== 'none' && on.pref === 'on', `on state: ${JSON.stringify(on)}`);
  });

  await t.check('H shows help; money appears once hauling starts', async () => {
    await t.key('KeyH');
    const { disp, stats, jobsDone } = await t.ev(
      `({ disp: g.hud.els.help.style.display, stats: document.getElementById('help-stats').textContent, jobsDone: g.gameplay.save.jobsDone })`);
    await t.key('KeyH');
    t.ok(disp === 'block', 'help not shown');
    t.ok(stats.includes('traveled'), `no base stats: "${stats}"`);
    // the 💵 segment is gated on jobsDone > 0 by design
    t.ok(stats.includes('$') === jobsDone > 0, `money/jobsDone mismatch (jobsDone ${jobsDone}): "${stats}"`);
  });
}
