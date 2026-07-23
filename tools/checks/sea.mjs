// Sea-Industry W1 — the eight real ports + AIS-informed ship routes.
// Numbers-first: baked-layer shape, dressed-kit presence, ships advancing
// arc-length on their routes, announcer registration + toast, Ports log
// save/DOM round-trip. The corpus-route fairway join lives in energy.mjs
// (it guards GEO.energy.fairways); tour spots validate in debug.mjs.

export default async function sea(t) {
  await t.check('baked sea layer loads and maritime rides it (LANE retired)', async () => {
    const res = await t.ev(`(() => {
      const routes = g.maritime.routes;
      const trunk = g.maritime.trunk;
      const [lx, lz] = g.maritime.laneAt(g.maritime.len / 2);
      const onTrunk = Math.min(...trunk.pts.map(([px, pz], i) => {
        if (!i) return Infinity;
        const [ax, az] = trunk.pts[i - 1], dx = px - ax, dz = pz - az, L2 = dx * dx + dz * dz || 1;
        const tt = Math.max(0, Math.min(1, ((lx - ax) * dx + (lz - az) * dz) / L2));
        return Math.hypot(lx - (ax + dx * tt), lz - (az + dz * tt));
      }));
      return {
        baked: g.GEO.sea.routes.length, ports: g.GEO.sea.ports.length,
        routes: routes.length, lens: routes.every((r) => r.len > 0 && r.cum.length === r.pts.length),
        trunk: !!trunk, onTrunk, legsGone: g.maritime.fairwayLegs === undefined,
      };
    })()`);
    t.ok(res.baked === 6 && res.routes === 6, `6 baked routes expected (baked ${res.baked}, built ${res.routes})`);
    t.ok(res.ports === 8, `8 baked ports expected, got ${res.ports}`);
    t.ok(res.lens, 'every route needs a full arc-length table');
    t.ok(res.trunk, 'no trunk route — rotors.js CG patrol has nothing to ride');
    t.ok(res.onTrunk < 0.1, `laneAt(len/2) sits ${res.onTrunk.toFixed(2)}u off the trunk polyline`);
    t.ok(res.legsGone, 'fairwayLegs still present — the LANE-era leg system should be retired');
  });

  await t.check('the eight ports stand dressed: one merged kit each, work lights instanced', async () => {
    const res = await t.ev(`(() => {
      const kits = g.GEO.sea.ports.map((p) => {
        const mesh = g.scene.getObjectByName('port:' + p.id);
        if (!mesh) return { id: p.id, missing: true };
        mesh.geometry.computeBoundingBox();
        const bb = mesh.geometry.boundingBox, cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
        return { id: p.id, verts: mesh.geometry.attributes.position.count,
          off: Math.hypot(cx - p.x, cz - p.z), colored: !!mesh.geometry.attributes.color };
      });
      const glows = g.scene.children.filter((c) => c.isInstancedMesh && c.material === g.maritime.workGlow);
      return { kits, glowCounts: glows.map((i) => i.count) };
    })()`);
    for (const k of res.kits) {
      t.ok(!k.missing, `port kit missing: ${k.id}`);
      if (k.missing) continue;
      t.ok(k.verts > 200, `${k.id} kit suspiciously thin (${k.verts} verts)`);
      t.ok(k.off < 25, `${k.id} kit centered ${k.off.toFixed(1)}u from its anchor`);
      t.ok(k.colored, `${k.id} kit not vertex-colored (merged-kit contract)`);
    }
    t.ok(res.glowCounts.includes(16), `port work-light instanced mesh should carry 16 spots (got ${res.glowCounts.join(',')})`);
  });

  await t.check('seven route ships, each the right kind for its port, all under way in water', async () => {
    const before = await t.ev(`g.maritime.ships.filter((s) => s.route).map((s) => ({ id: s.route.id, type: s.type, s: s.s, len: s.route.len }))`);
    t.ok(before.length === 7, `7 route ships expected (3 trunk + 4 approaches), got ${before.length}`);
    const byRoute = {};
    for (const s of before) (byRoute[s.id] ??= []).push(s.type);
    t.ok((byRoute.houston ?? []).includes('container'), `houston approach wants a container ship (${byRoute.houston})`);
    t.ok((byRoute.sabine ?? []).includes('tanker'), `sabine approach wants a tanker (${byRoute.sabine})`);
    t.ok((byRoute.corpus ?? []).includes('tanker'), `corpus approach wants a tanker (${byRoute.corpus})`);
    t.ok((byRoute.freeport ?? []).includes('chemical'), `freeport approach wants a chemical carrier (${byRoute.freeport})`);
    t.ok((byRoute.trunk ?? []).length === 3 && byRoute.trunk.includes('bulk'), `trunk wants 3 ships incl. a bulker (${byRoute.trunk})`);
    await t.step(4, 'g.maritime.update(dt, g.clock.elapsedTime);');
    const after = await t.ev(`g.maritime.ships.filter((s) => s.route).map((s) => ({ s: s.s, len: s.route.len, x: s.g.position.x, z: s.g.position.z }))`);
    for (const [i, a] of after.entries()) {
      const moved = Math.abs(a.s - before[i].s);
      t.ok(moved > 4, `${before[i].id} ${before[i].type} barely moved: ${moved.toFixed(1)}u over 4s (speed >= 2.2 expected; pingpong turnarounds move less but never this little)`);
      t.ok(a.s >= 0 && a.s <= a.len + 0.01, `${before[i].id} ship escaped its route: s=${a.s.toFixed(1)} of ${a.len.toFixed(1)}`);
    }
    const wet = await t.ev(`g.maritime.ships.filter((s) => s.route).every((s) => g.boatableAt(s.g.position.x, s.g.position.z))`);
    t.ok(wet, 'a route ship is sitting on dry land — route/water contract broken');
  });

  await t.check('announcer: all eight ports registered, HUD toast on approach (Brownsville)', async () => {
    const reg = await t.ev(`g.GEO.sea.ports.filter((p) => g.energy.sites.some((s) => s.label.includes(p.name) && s.label.includes(p.info))).length`);
    t.ok(reg === 8, `${reg}/8 ports registered with the energy announcer`);
    // Brownsville: no baked refinery, and no marina site (its harbor is not
    // game water) — the port site can't lose the nearest-wins toast race
    const p = await t.ev(`g.GEO.sea.ports.find((p) => p.id === 'brownsville')`);
    await t.tp(p.x + 15, p.z); // inside the 25u ring, off the kit itself
    await t.wait(1.0); // energy.update runs at HUD cadence in the real loop
    const toast = await t.ev(`document.getElementById('toast').textContent`);
    t.ok(toast.includes('Port of Brownsville'), `approach toast reads "${toast}" — expected the Brownsville announce`);
  });

  await t.check('Ports log: stamps at the wharf apron, dedups, additive save key, DOM totals', async () => {
    const totals = await t.ev(`({ total: document.getElementById('total-ports').textContent, isArray: Array.isArray(g.gameplay.save.ports) })`);
    t.ok(totals.total === '8', `total-ports span reads "${totals.total}" — must be filled from GEO.sea.ports at boot`);
    t.ok(totals.isArray, 'save.ports missing — the additive key never initialized');
    const p = await t.ev(`g.GEO.sea.ports.find((p) => p.id === 'texascity')`);
    await t.tp(p.x + 12, p.z + 12);
    await t.wait(1.0);
    const logged = await t.ev(`({ has: g.gameplay.save.ports.includes('texascity'), n: g.gameplay.save.ports.length, score: document.getElementById('score-ports').textContent })`);
    t.ok(logged.has, 'parking at the wharf did not stamp the Ports log');
    t.ok(logged.score === String(logged.n), `score-ports DOM (${logged.score}) out of sync with save (${logged.n})`);
    const dedup = await t.ev(`(() => {
      const n0 = g.gameplay.save.ports.length;
      g.gameplay.logPort('texascity', 'Port of Texas City', 8, 'again');
      return { n0, n1: g.gameplay.save.ports.length };
    })()`);
    t.ok(dedup.n0 === dedup.n1, `logPort deduplication failed: ${dedup.n0} -> ${dedup.n1}`);
  });
}
