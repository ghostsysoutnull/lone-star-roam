// Agriculture — Wave 1: USDA census bake (build-ag.mjs -> data/agriculture.json)
// + geo.js agAt accessor. Pure data-truth checks, no player movement — assert
// numbers straight out of GEO.ag/agAt, not pixels.

const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos(31 * Math.PI / 180) / 100, -(lat - 31) * 111320 / 100];

export default async function ag(t) {
  await t.check('bake join: GEO.ag has exactly 254 counties (full join, no silent misses)', async () => {
    const n = await t.ev(`Object.keys(g.GEO.ag).length`);
    t.ok(n === 254, `expected 254 joined counties, got ${n}`);
  });

  await t.check('feedlot belt: Deaf Smith (Hereford) has a huge cattle inventory and a real on-feed count', async () => {
    const [x, z] = LL(34.8154, -102.3971); // Hereford, TX — Deaf Smith county seat
    const rec = await t.ev(`g.agAt(${x}, ${z})`);
    t.ok(rec && rec.cattle > 500000, `Deaf Smith cattle not > 500k: ${JSON.stringify(rec)}`);
    t.ok(rec && rec.onFeed > 0, `Deaf Smith missing an on-feed count: ${JSON.stringify(rec)}`);
  });

  await t.check('Rio Grande Valley: Hidalgo (McAllen) dominant crop is citrus', async () => {
    const [x, z] = LL(26.2034, -98.2300); // McAllen, TX — Hidalgo county
    const rec = await t.ev(`g.agAt(${x}, ${z})`);
    t.ok(rec && rec.dominantCrop === 'citrus', `Hidalgo dominant crop not citrus: ${JSON.stringify(rec)}`);
  });

  await t.check('coastal prairie: Wharton (Wharton) dominant crop is rice', async () => {
    const [x, z] = LL(29.3116, -96.1027); // Wharton, TX — Wharton county seat
    const rec = await t.ev(`g.agAt(${x}, ${z})`);
    t.ok(rec && rec.dominantCrop === 'rice', `Wharton dominant crop not rice: ${JSON.stringify(rec)}`);
  });

  await t.check('Trans-Pecos: Terrell county (Sanderson) has near-zero crop acreage', async () => {
    const [x, z] = LL(30.1421, -102.4088); // Sanderson, TX — Terrell county seat
    const rec = await t.ev(`g.agAt(${x}, ${z})`);
    const total = await t.ev(`(() => { const r = g.agAt(${x}, ${z}); return r ? Object.values(r.crops).reduce((a, b) => a + b, 0) : -1; })()`);
    t.ok(rec !== null, 'Terrell county did not resolve');
    t.ok(total >= 0 && total < 6000, `Terrell crop acreage not near-zero: ${total}`);
  });

  await t.check('outside Texas: agAt returns null far off the border (New Orleans)', async () => {
    const [x, z] = LL(29.9511, -90.0715); // New Orleans, LA
    const rec = await t.ev(`g.agAt(${x}, ${z})`);
    t.ok(rec === null, `expected null outside Texas, got ${JSON.stringify(rec)}`);
  });

  // --- Wave 2: crops + farmsteads — placement math, not screenshots ---

  const [haleX, haleZ] = LL(34.05, -101.90); // open plains SW of Plainview — Hale county (cotton, heavy irrigation)

  await t.check('cotton country: rural Hale chunks spawn draped field decals + pivot circles', async () => {
    await t.tp(haleX, haleZ);
    await t.wait(0.8); // chunks spawn on the next scenery update
    const res = await t.ev(`(() => {
      let crops = 0, pivots = 0; const kinds = new Set(), bad = [];
      for (const gr of g.scenery.live.values())
        gr.traverse((o) => {
          if (o.userData.crop) {
            crops++; kinds.add(o.userData.crop);
            const p = o.geometry.attributes.position.array;
            for (const i of [0, 3 * ((p.length / 6) | 0), p.length - 3]) {
              const dy = p[i + 1] - g.hAt(p[i], p[i + 2]);
              if (dy < 0.05 || dy > 0.5) bad.push(dy.toFixed(3));
            }
          }
          if (o.userData.pivot) pivots++;
        });
      return { crops, pivots, kinds: [...kinds], bad };
    })()`);
    t.ok(res.crops > 0, 'no crop field decals in live Hale chunks');
    t.ok(res.kinds.includes('cotton'), `Hale fields not cotton: ${res.kinds}`);
    t.ok(res.bad.length === 0, `decal vertices off the terrain drape: dy=${res.bad}`);
    t.ok(res.pivots > 0, 'no pivot circles in Hale (47 irrigated acres/km²)');
  });

  let agCount = 0; // shared with the desert-gradient check below
  await t.check('farmstead legality sweep: every site road-clear ≥5 / airport / brand / border lawful', async () => {
    const [x, z] = LL(34.8154, -102.3971); // Hereford — Deaf Smith, feedlot-belt ag country
    const res = await t.ev(`(() => {
      const cx = Math.floor(${x} / 260), cz = Math.floor(${z} / 260);
      let count = 0; const bad = [];
      for (let i = -10; i <= 10; i++)
        for (let j = -10; j <= 10; j++) {
          const s = g.farmsteadAt(cx + i, cz + j);
          if (!s) continue;
          count++;
          if (!g.inTexas(s.x, s.z)) bad.push(s.key + ':tx');
          if (!g.airportClear(s.x, s.z)) bad.push(s.key + ':apt');
          if (g.brandNear(s.x, s.z, 30)) bad.push(s.key + ':brand');
          const r = g.nearestRoad(s.x, s.z, 6);
          if (r && r.dist < 5) bad.push(s.key + ':road' + r.dist.toFixed(1));
        }
      return { count, bad };
    })()`);
    agCount = res.count;
    t.ok(res.count > 5, `ag country too empty: ${res.count} sites in 441 chunks`);
    t.ok(res.bad.length === 0, `unlawful farmstead sites: ${res.bad.join(' ')}`);
  });

  await t.check('census gradient: Trans-Pecos is nearly farmstead-free and grows nothing', async () => {
    const [x, z] = LL(30.588, -103.895); // Fort Davis — Jeff Davis county (0.0 crop acres/km²)
    const count = await t.ev(`(() => {
      const cx = Math.floor(${x} / 260), cz = Math.floor(${z} / 260);
      let n = 0;
      for (let i = -10; i <= 10; i++)
        for (let j = -10; j <= 10; j++) if (g.farmsteadAt(cx + i, cz + j)) n++;
      return n;
    })()`);
    t.ok(count < agCount / 3, `desert not sparser than ag country: ${count} vs ${agCount} sites per 441 chunks`);
    await t.tp(x, z);
    await t.wait(0.8);
    const meshes = await t.ev(`(() => {
      let n = 0;
      for (const gr of g.scenery.live.values())
        gr.traverse((o) => { if (o.userData.crop || o.userData.pivot) n++; });
      return n;
    })()`);
    t.ok(meshes === 0, `crop/pivot meshes in the desert: ${meshes}`);
  });

  await t.check('farmstead chunk builds the kit and its chickens peck via the animate loop', async () => {
    // nearest pure-function site to rural Hale, then drive scenery onto it
    const site = await t.ev(`(() => {
      const cx = Math.floor(${haleX} / 260), cz = Math.floor(${haleZ} / 260);
      for (let r = 0; r <= 12; r++)
        for (let i = -r; i <= r; i++)
          for (let j = -r; j <= r; j++) {
            if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
            const s = g.farmsteadAt(cx + i, cz + j);
            if (s) return s;
          }
      return null;
    })()`);
    t.ok(site, 'no farmstead site within 12 chunks of rural Hale — odds/legality too tight');
    await t.tp(site.x + 6, site.z + 6); // parked-truck distance, not on top of the house
    await t.wait(0.8);
    const res = await t.ev(`(() => {
      let farm = 0;
      for (const gr of g.scenery.live.values())
        for (const c of gr.children) if (c.userData.kind === 'farmstead') farm++;
      const hens = g.scenery.animated.filter((a) => a.kind === 'chicken').length;
      return { farm, hens };
    })()`);
    t.ok(res.farm > 0, 'no farmstead group in live chunks at a farmsteadAt site');
    t.ok(res.hens >= 3, `expected ≥3 pecking chickens in the animate loop, got ${res.hens}`);
  });

  if (process.env.SHOT) { // aerial field/pivot composition read — judgment only, never pass/fail
    const y = await t.ev(`g.hAt(${haleX}, ${haleZ}) + 55`);
    await t.tp(haleX, haleZ, 'FLY', y);
    await t.wait(0.8);
    await t.shot('ag-fields-aerial');
  }

  await t.tp(haleX, haleZ, 'DRIVE'); // leave the suite grounded in DRIVE (ambient-mode convention)
}
