// Texas Brands (brands.js) — Wave 1: Bucky's travel centers. Assert numbers,
// not pixels: real-loop streaming, showpiece poly floor, placement legality,
// approach-billboard road-hugging, and night-gated emissive signage (~0 by
// day). The streaming check drives the REAL loop (no manual brands.update)
// so broken main.js wiring can't hide behind it. One SHOT of the silhouette.

export default async function brands(t) {
  // Katy sits on I-10 (motorway) — ideal for the spawn + billboard road-hug.
  const katyAt = await t.ev(`({
    x: (-95.8475 + 99.5) * 111320 * Math.cos(31 * Math.PI / 180) / 100,
    z: -(29.7787 - 31) * 111320 / 100,
  })`);

  await t.check('streaming sentinel: the real loop spawns/despawns a site by distance', async () => {
    // teleport ONTO Katy and let the render loop (main.js brands.update) spawn it
    await t.tp(katyAt.x, katyAt.z + 3);
    await t.until(`g.brands.live.has('Katy')`, 8000);
    const near = await t.ev(`(() => {
      const r = g.brands.live.get('Katy');
      return { has: !!r, y: r.group.position.y, kids: r.group.children.length };
    })()`);
    t.ok(near.has && near.kids >= 3, `spawn incomplete: ${JSON.stringify(near)}`);

    // capture shared prototype geometries — they must SURVIVE despawn
    const protoBefore = await t.ev(`({
      pump: !!g.brands.pumpGeo.attributes, board: !!g.brands.billboardGeo.attributes,
    })`);
    t.ok(protoBefore.pump && protoBefore.board, 'prototypes missing before despawn');

    // drive far away — the loop must dispose the site group
    await t.tp(katyAt.x + 1200, katyAt.z);
    await t.until(`!g.brands.live.has('Katy')`, 8000);
    const after = await t.ev(`({
      live: g.brands.live.has('Katy'),
      pump: !!(g.brands.pumpGeo.attributes && g.brands.pumpGeo.attributes.position),
      board: !!(g.brands.billboardGeo.attributes && g.brands.billboardGeo.attributes.position),
    })`);
    t.ok(!after.live, 'site never despawned');
    t.ok(after.pump && after.board, `shared prototype geometry was disposed: ${JSON.stringify(after)}`);
  });

  await t.check('showpiece poly floor: hero merged triangle count beats a heli-body baseline', async () => {
    await t.tp(katyAt.x, katyAt.z + 3);
    await t.until(`g.brands.live.has('Katy')`, 8000);
    const tris = await t.ev(`(() => {
      const r = g.brands.live.get('Katy');
      const tri = (m) => m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3;
      return { staticT: tri(r.staticMesh), glowT: tri(r.glowMesh) };
    })()`);
    const total = tris.staticT + tris.glowT;
    // a heli body is ~120-260 tris; a showpiece storefront must dwarf that
    t.ok(total > 400, `hero not showpiece-tier: ${total} tris (${JSON.stringify(tris)})`);
  });

  await t.check('placement legality: no Bucky\'s sits on an airport field', async () => {
    // scan every site coord through the pure exclusion query
    const bad = await t.ev(`(() => {
      const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos(31 * Math.PI / 180) / 100, -(lat - 31) * 111320 / 100];
      const coords = [
        ['Luling',29.6507,-97.5935],['New Braunfels',29.7269,-98.0779],['Bastrop',30.1071,-97.3058],
        ['Baytown',29.8008,-94.9999],['Katy',29.7787,-95.8475],['Texas City',29.4284,-95.0632],
        ['Terrell',32.7167,-96.3212],['Temple',31.1364,-97.3293],['Denton',33.1793,-97.1026],
        ['Melissa',33.2713,-96.5923],['Royse City',32.9792,-96.2953],['Ennis',32.3232,-96.6066],
        ['Waller',30.0715,-95.9321],['Madisonville',30.9652,-95.8807],['Northlake',33.0242,-97.2784],
      ];
      return coords.filter(([n, la, lo]) => { const [x, z] = LL(la, lo); return !g.airportClear(x, z); }).map((c) => c[0]);
    })()`);
    t.ok(bad.length === 0, `sites on an airport: ${bad.join(', ')}`);
  });

  await t.check('approach billboards: 3+ posts hug the nearest motorway/trunk', async () => {
    await t.tp(katyAt.x, katyAt.z + 3);
    await t.until(`g.brands.live.has('Katy')`, 8000);
    const b = await t.ev(`(() => {
      const r = g.brands.live.get('Katy');
      const posts = r.boards.map((p) => {
        const rd = g.nearestRoad(p.wx, p.wz, 30, (ty) => ty === 'motorway' || ty === 'trunk');
        return { d: rd ? rd.dist : 999 };
      });
      // the copy must actually RENDER: each panel carries a canvas texture,
      // and the signs aren't all the same pun (varied campaign per site)
      const maps = r.boards.map((p) => !!(p.panel && p.panel.material && p.panel.material.map));
      const copies = new Set(r.boards.map((p) => p.copy));
      return { n: posts.length, maxD: Math.max(...posts.map((p) => p.d)), mapped: maps.every(Boolean), variety: copies.size };
    })()`);
    t.ok(b.n >= 3, `too few billboards: ${b.n}`);
    t.ok(b.maxD < 4, `a billboard strayed off the road: ${b.maxD.toFixed(2)} units`);
    t.ok(b.mapped, 'a billboard panel has no copy texture (blank sign)');
    t.ok(b.variety >= 2, `billboards all show the same pun: ${b.variety} distinct`);
  });

  await t.check('grounding: pad at MAX terrain height + foundation skirt reaches below the lot MIN', async () => {
    // relief over the same ±20 lot grid brands.js samples; pick the steepest site
    const pick = await t.ev(`(() => {
      const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos(31 * Math.PI / 180) / 100, -(lat - 31) * 111320 / 100];
      const coords = [['Bastrop',30.1071,-97.3058],['Temple',31.1364,-97.3293],['Denton',33.1793,-97.1026],
        ['Melissa',33.2713,-96.5923],['Terrell',32.7167,-96.3212],['Northlake',33.0242,-97.2784],
        ['New Braunfels',29.7269,-98.0779],['Waller',30.0715,-95.9321],['Luling',29.6507,-97.5935]];
      const range = (x, z) => { let mn = Infinity, mx = -Infinity;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const h = g.hAt(x + i * 20, z + j * 20); if (h < mn) mn = h; if (h > mx) mx = h; }
        return { mn, mx }; };
      let best = null;
      for (const [n, la, lo] of coords) {
        const [x, z] = LL(la, lo); const { mn, mx } = range(x, z);
        if (!best || mx - mn > best.relief) best = { n, x, z, relief: mx - mn, mn, mx };
      }
      return best;
    })()`);
    await t.tp(pick.x, pick.z + 3);
    await t.until(`g.brands.live.has('${pick.n}')`, 8000);
    const g0 = await t.ev(`(() => {
      const r = g.brands.live.get('${pick.n}');
      r.staticMesh.geometry.computeBoundingBox();
      return { padY: r.group.position.y, baseWorld: r.group.position.y + r.staticMesh.geometry.boundingBox.min.y };
    })()`);
    t.near(g0.padY, pick.mx, 0.05, `pad not at lot max (relief ${pick.relief.toFixed(2)})`);
    // the foundation must drape at or below the lowest lot terrain — no floating corner
    t.ok(g0.baseWorld <= pick.mn + 1e-3, `foundation floats above the lot min: base ${g0.baseWorld.toFixed(2)} vs min ${pick.mn.toFixed(2)} (relief ${pick.relief.toFixed(2)})`);
  });

  await t.check('night glow: signage emissive toggles with ATMOS.night and is ~0 by day', async () => {
    await t.tp(katyAt.x, katyAt.z + 3);
    await t.until(`g.brands.live.has('Katy')`, 8000);
    await t.setDay();
    await t.wait(0.4);
    const day = await t.ev(`g.brands.glowMat.emissiveIntensity`);
    t.near(day, 0, 0.001, `signage glowed by day: ${day}`);

    await t.setNight();
    await t.wait(0.4);
    const night = await t.ev(`({ warm: g.brands.glowMat.emissiveIntensity, red: g.brands.glowRedMat.emissiveIntensity })`);
    t.ok(night.warm > 0.3 && night.red > 0.3, `signage never lit at night: ${JSON.stringify(night)}`);

    // both glow materials must drive their hero meshes (not strays)
    const wired = await t.ev(`(() => { const r = g.brands.live.get('Katy');
      return r.glowMesh.material === g.brands.glowMat && r.glowRedMesh.material === g.brands.glowRedMat; })()`);
    t.ok(wired, 'a hero glow mesh is not driven by its shared glow material');
    // signage must read as clearly LIT, not a faint tint (the "just white" bug):
    // emissive high enough to push a white soffit past medium-gray into bright
    t.ok(night.warm > 1.0, `signage glow too faint to read as lit: ${night.warm}`);

    if (process.env.SHOT) {
      // stand back on the road side and look at the store so the beaver-topped
      // sign + glowing canopy actually fill the frame (the silhouette read)
      await t.ev(`(() => {
        const r = g.brands.live.get('Katy'), h = r.group.rotation.y;
        const fx = Math.sin(h), fz = Math.cos(h);       // group-front (local +z) in world
        const vx = r.group.position.x + fx * 46, vz = r.group.position.z + fz * 46;
        g.player.pos.set(vx, g.hAt(vx, vz), vz);
        g.player.heading = Math.atan2(-(r.group.position.x - vx), -(r.group.position.z - vz));
        g.player.speed = 0;
      })()`);
      await t.wait(0.5);
      await t.shot('bucky-night-silhouette');
    }
    await t.setDay();
  });
}
