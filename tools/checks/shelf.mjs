// Shoulder & Shelf, wave 5 — The Shelf: the Tidelands line (state-water
// predicate, big-map dashed overlay, vertex-colored blue-water band), the
// Tidelands buoy + Far Rig plaques (maritime brass, NOT landmarks — the
// counters stay sacred), night-gated rig flares / shrimper work-lights /
// buoy lamp, the 1554 treasure light legend (new-moon nights off the
// Mansfield Cut, always inside state water), and the Aransas birds
// (roseate spoonbill + whooping crane, species 26 → 28).

export default async function shelf(t) {
  await t.check('inStateWater: island-aware straddle points around the 166.7u line', async () => {
    const res = await t.ev(`({
      buoy: g.inStateWater(4762.2, 1851.5),          // ON the line (166.66u)
      pastBuoy: g.inStateWater(4802.2, 1851.5),      // ~40u seaward — federal shelf
      mansfield: g.inStateWater(2227.9, 4942.6),     // 99u from PADRE's shore, 220u from the mainland
      mansfieldD: g.coastDist(2227.9, 4942.6),
      land: g.inStateWater(830.2, 847.1),            // LBJ ranch — Texas, not water
      farRig: g.inStateWater(4293.9, 3339.6),        // 64.1 mi out — long past the line
    })`);
    t.ok(res.buoy, 'the buoy point (coastDist 166.66) should be state water');
    t.ok(!res.pastBuoy, '40u seaward of the buoy should be federal shelf');
    t.ok(res.mansfield, 'off the Mansfield Cut should be state water — is coastDist island-aware?');
    t.ok(res.mansfieldD < 120, `Mansfield point coastDist ${res.mansfieldD.toFixed(1)} — islands not in the field (mainland-only would read ~220)`);
    t.ok(!res.land, 'a dry-land Texas point must never read as state water');
    t.ok(!res.farRig, 'the Far Rig sits in federal water');
  });

  await t.check('big map: dashed tidelands overlay hugs the line; minimap untouched', async () => {
    const res = await t.ev(`(() => {
      const line = g.hud.tidelands ?? [];
      const dists = [];
      for (let i = 0; i < line.length; i += 5) dists.push(g.coastDist(line[i][0], line[i][1]));
      return { n: line.length, min: Math.min(...dists), max: Math.max(...dists) };
    })()`);
    t.ok(res.n > 30, `tidelands polyline has only ${res.n} points`);
    // marching-squares midpoints carry ~a cell of interpolation error
    t.ok(Math.abs(res.min - 166.7) < 5 && Math.abs(res.max - 166.7) < 5,
      `line points stray off the 166.7u distance: ${res.min.toFixed(1)}..${res.max.toFixed(1)}`);
  });

  await t.check('gulf plane: state water keeps the teal, blue water past the line reads darker', async () => {
    const res = await t.ev(`(() => {
      const gulf = g.maritime.buoy.parent.getObjectByName('gulf');
      if (!gulf) return { missing: true };
      const p = gulf.geometry.attributes.position, c = gulf.geometry.attributes.color;
      const e = gulf.matrixWorld.elements;
      let near = null, far = null;
      for (let i = 0; i < p.count && !(near && far); i += 17) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
        const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
        const d = g.coastDist(wx, wz);
        if (d < 130 && !near) near = { g: c.getY(i) };
        if (d > 260 && !far) far = { g: c.getY(i) };
      }
      return { near, far };
    })()`);
    t.ok(!res.missing && res.near && res.far, 'gulf mesh, or vertices on both sides of the line, not found');
    // THREE.Color stores linear-sRGB: teal 0x2e6f9e green 0.435 → ~0.158 linear
    t.ok(res.near.g > 0.12, `state-water vertex lost its teal (linear green ${res.near.g.toFixed(3)}, expected ~0.158)`);
    t.ok(res.near.g - res.far.g > 0.05, `blue water not darker than state water: ${res.near.g.toFixed(3)} vs ${res.far.g.toFixed(3)}`);
  });

  await t.check('tidelands buoy plaque: hint at parked distance, E reads the hard bargain', async () => {
    await t.tp(4762.2 + 12, 1851.5); // parked-truck distance, not touching the buoy
    await t.wait(0.4); // hint lives in the ~12 Hz hud tick
    const hint = await t.ev('g.hud.els.interact.textContent');
    t.ok(hint === 'E — read the channel buoy', `expected the buoy hint, got "${hint}"`);
    await t.key('KeyE');
    const dlg = await t.ev(`({
      name: g.hud.els.dialog.querySelector('.npc-name').textContent,
      text: g.hud.els.dialog.querySelector('.npc-text').textContent,
      shown: g.hud.els.dialog.style.display,
    })`);
    t.ok(dlg.shown === 'block', 'dialog not shown after E');
    t.ok(dlg.name.includes('Tidelands'), `dialog name is "${dlg.name}"`);
    t.ok(dlg.text.includes('republic drives a hard bargain') && dlg.text.includes('marine leagues'),
      `buoy plaque copy drifted: "${dlg.text.slice(0, 60)}…"`);
    await t.key('KeyE'); // close it — later checks share the session
  });

  await t.check('the Far Rig: farthest platform, upgraded prop, its own plaque', async () => {
    const res = await t.ev(`(() => {
      const rigs = g.maritime.platforms.map((p) => ({
        far: !!p.userData.far, kids: p.children.length,
        d: g.coastDist(p.position.x, p.position.z),
      }));
      const far = rigs.find((r) => r.far);
      return { far, maxD: Math.max(...rigs.map((r) => r.d)), others: rigs.filter((r) => !r.far) };
    })()`);
    t.ok(res.far, 'no platform flagged as the Far Rig');
    t.near(res.far.d / 16.09, 64.1, 0.5, 'Far Rig is not 64.1 mi off the coast');
    t.ok(res.far.d === res.maxD, 'the Far Rig must be the farthest platform out');
    t.ok(res.others.every((r) => r.kids < res.far.kids), 'Far Rig prop not visibly upgraded (needs more parts than its siblings)');
    await t.tp(4293.9 + 10, 3339.6);
    const plq = await t.ev('g.maritime.plaqueNear(g.player.pos, 28)?.name');
    t.ok(plq === 'The Far Rig', `Far Rig plaque not readable from parked distance: ${plq}`);
  });

  await t.check('night presence: rig flares, work lights and the buoy lamp gate on ATMOS.night', async () => {
    await t.setDay();
    await t.wait(0.3); // maritime.update runs in the real loop
    const day = await t.ev('({ rig: g.maritime.rigGlow.opacity, work: g.maritime.workGlow.opacity })');
    t.ok(day.rig < 0.15 && day.work < 0.15, `glows lit in daylight: rig ${day.rig}, work ${day.work}`);
    await t.setNight();
    await t.wait(0.3);
    const night = await t.ev('({ rig: g.maritime.rigGlow.opacity, work: g.maritime.workGlow.opacity, fog: g.maritime.rigGlow.fog })');
    t.ok(night.rig > 0.6 && night.work > 0.6, `glows dark at night: rig ${night.rig}, work ${night.work}`);
    t.ok(night.fog === false, 'rig glow must ignore scene fog or the horizon skyline dies');
  });

  await t.check('1554 treasure light: appears on the sky\'s own new moon, watching logs the legend', async () => {
    await t.ev('g.sky.days = 4.0'); // round(4 % 8) === 4 — the label sky.js calls New Moon
    await t.setNight();
    const at = await t.ev('({ x: g.haunts.tPos.x, z: g.haunts.tPos.z })');
    await t.tp(at.x - 45, at.z); // outside the 60u flee ring, inside the 80u watch ring
    await t.until('g.haunts.treasure.visible && g.haunts.tMat.opacity > 0.15', 8000);
    await t.until(`g.gameplay.save.legends.includes('treasure')`, 8000);
    const total = await t.ev('document.getElementById(\'total-legends\').textContent');
    t.ok(total === '3', `legend total in HUD is ${total}, expected 3 (wisps + ghost fires + treasure)`);
  });

  await t.check('treasure light recedes from a pursuer and never leaves state water', async () => {
    const before = await t.ev('({ x: g.haunts.tPos.x, z: g.haunts.tPos.z })');
    await t.tp(before.x - 25, before.z); // press inside the flee ring
    await t.wait(2.5); // ~6 u/s recede pace → expect ~15u of drift
    const after = await t.ev(`({
      x: g.haunts.tPos.x, z: g.haunts.tPos.z,
      d: Math.hypot(g.haunts.tPos.x - g.player.pos.x, g.haunts.tPos.z - g.player.pos.z),
      sw: g.inStateWater(g.haunts.tPos.x, g.haunts.tPos.z),
    })`);
    const drifted = Math.hypot(after.x - before.x, after.z - before.z);
    t.ok(drifted > 4, `light barely drifted under pursuit: ${drifted.toFixed(1)}u in 2.5s`);
    t.ok(after.d > 25, `distance to a parked pursuer should GROW (charging-deer class): ${after.d.toFixed(1)}`);
    t.ok(after.sw, 'the ghost left Texas water');
  });

  await t.check('treasure light: dark on a crescent night, gone by dawn', async () => {
    await t.ev('g.sky.days = 1.0'); // waning gibbous — no ghost
    await t.until('!g.haunts.treasure.visible', 6000);
    await t.ev('g.sky.days = 4.0');
    await t.until('g.haunts.treasure.visible', 6000);
    await t.setDay(); // dawn banishes it even on the right day
    await t.until('!g.haunts.treasure.visible', 6000);
  });

  await t.check('Aransas: spoonbill flock + crane pair at Blackjack Peninsula, both logged from the truck', async () => {
    await t.setDay(); // diurnal birds (nightMax 0.6)
    const site = await t.ev('g.animals.aransasSite');
    await t.tp(site.x + 4, site.z + 1); // between the two homes — inside SPOT_R of both
    await t.wait(1.2); // chunk spawn
    const res = await t.ev(`(() => {
      const kinds = { spoonbill: 0, crane: 0 };
      for (const c of g.animals.live.values())
        for (const a of c.animals) if (kinds[a.species] !== undefined) kinds[a.species]++;
      return kinds;
    })()`);
    t.ok(res.spoonbill >= 4, `expected a spoonbill flock, found ${res.spoonbill}`);
    t.ok(res.crane >= 3, `expected the crane family, found ${res.crane}`);
    await t.until(`g.gameplay.save.species.includes('spoonbill') && g.gameplay.save.species.includes('crane')`, 10000);
    const facts = await t.ev(`({ s: g.SPECIES.spoonbill.fact, c: g.SPECIES.crane.fact })`);
    t.ok(facts.c.includes('winters at Aransas'), `crane fact must mention wintering: "${facts.c}"`);
    t.ok(facts.s.length > 20, 'spoonbill fact missing');
  });
}
