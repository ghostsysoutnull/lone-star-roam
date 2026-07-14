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

  // --- Wave 3: livestock — census species, farm herds, feedlots, bison ---

  await t.check('new species are registered with facts (log-ready, additive)', async () => {
    const res = await t.ev(`(() => {
      const missing = ['horse', 'goat', 'sheep', 'bison', 'angus'].filter((k) => !g.SPECIES[k] || !g.SPECIES[k].fact);
      return { missing, count: Object.keys(g.SPECIES).length };
    })()`);
    t.ok(res.missing.length === 0, `species missing or factless: ${res.missing}`);
    t.ok(res.count === 20, `SPECIES_COUNT drifted: ${res.count}`);
  });

  await t.check('censusTable: Parker horses thick, Sutton goats+sheep, Dallam bare', async () => {
    const rows = await t.ev(`(() => {
      const at = (lat, lon) => g.animals.censusTable((lon + 99.5) * 954.23, -(lat - 31) * 1113.2);
      return { parker: at(32.71, -97.98), sutton: at(30.57, -100.64), dallam: at(36.06, -102.52) };
    })()`);
    const keep = (list, sp) => (list.find((r) => r[0] === sp) ?? [])[4] ?? 0;
    t.ok(keep(rows.parker, 'horse') >= 0.5, `Parker horse odds thin: ${keep(rows.parker, 'horse')}`);
    t.ok(keep(rows.sutton, 'goat') >= 0.5 && keep(rows.sutton, 'sheep') >= 0.4,
      `Sutton goat/sheep odds thin: ${JSON.stringify(rows.sutton)}`);
    t.ok(!rows.dallam.some((r) => r[0] === 'goat' || r[0] === 'sheep'),
      `Dallam should have no goat/sheep rows: ${JSON.stringify(rows.dallam)}`);
  });

  // scan the on-feed belt (Dallam..Swisher box) for pure-function feedlot sites
  const lots = await t.ev(`(() => {
    const sites = [];
    for (let cx = -14; cx <= -6; cx++)
      for (let cz = -24; cz <= -14; cz++) {
        const s = g.feedlotAt(cx, cz);
        if (s) sites.push(s);
      }
    return sites;
  })()`);

  await t.check('feedlotAt: sites exist in the on-feed belt, none below the gate, all lawful', async () => {
    t.ok(lots.length >= 1, 'no feedlot sites in the whole 99-chunk Panhandle belt — odds/legality too tight');
    const bad = await t.ev(`(() => {
      const out = [];
      for (const s of ${JSON.stringify(lots)}) {
        const road = g.nearestRoad(s.x, s.z, 6);
        if (road && road.dist < 5) out.push('road:' + s.key);
        if (!g.airportClear(s.x, s.z)) out.push('airport:' + s.key);
        if (g.brandNear(s.x, s.z, 30)) out.push('brand:' + s.key);
        if (!g.inTexas(s.x, s.z)) out.push('border:' + s.key);
        if (s.pens.length < 3) out.push('pens:' + s.key);
      }
      // below-gate control: Wilson county (onFeed 14.2/km², under the 30 gate)
      for (let i = -2; i <= 2; i++)
        for (let j = -2; j <= 2; j++) if (g.feedlotAt(4 + i, 7 + j)) out.push('gate:Wilson');
      return out;
    })()`);
    t.ok(bad.length === 0, `unlawful/gate-leaking feedlot sites: ${bad}`);
  });

  await t.check('feedlot chunk: pens + mill built, dense cattle packed and PENNED over sim time', async () => {
    const lot = lots[0];
    t.ok(lot, 'no feedlot site to drive to');
    await t.tp(lot.x + 8, lot.z + 8); // parked-truck distance off the pens
    await t.wait(0.8);
    const res = await t.ev(`(() => {
      let lotGroups = 0;
      for (const gr of g.scenery.live.values())
        for (const c of gr.children) if (c.userData.kind === 'feedlot') lotGroups++;
      const cattle = [];
      for (const { animals } of g.animals.live.values())
        for (const a of animals) if (a.species === 'angus') cattle.push(a);
      window.__pen = cattle;
      return { lotGroups, cattle: cattle.length };
    })()`);
    t.ok(res.lotGroups > 0, 'no feedlot scenery group in live chunks at a feedlotAt site');
    t.ok(res.cattle >= 8, `feedlot not dense: only ${res.cattle} cattle on feed`);
    const drift = await t.sample(
      `Math.max(...window.__pen.map((a) => Math.hypot(a.g.position.x - a.homeX, a.g.position.z - a.homeZ)))`,
      8, 300);
    t.ok(Math.max(...drift) < 3.4, `cattle escaped the pen leash: max drift ${Math.max(...drift).toFixed(1)}`);
  });

  // rural Parker county (cutting-horse capital) — census horses at natural values
  const [parkX, parkZ] = LL(32.71, -97.98);
  await t.setDay();
  await t.tp(parkX, parkZ);
  await t.wait(0.8);

  const horse = await t.ev(`(() => {
    for (const { animals } of g.animals.live.values())
      for (const a of animals)
        if (a.species === 'horse' && a.g.visible) { window.__horse = a; return { x: a.homeX, z: a.homeZ }; }
    return null;
  })()`);

  await t.check('horse country: census-spawned horses live in rural Parker chunks (and no stray bison)', async () => {
    t.ok(horse, 'no horses in 25 live chunks at 5 horses/km² — census rows not spawning');
    const bison = await t.ev(`(() => {
      let n = 0;
      for (const { animals } of g.animals.live.values())
        for (const a of animals) if (a.species === 'bison') n++;
      return n;
    })()`);
    t.ok(bison === 0, `${bison} bison grazing 400 km from Caprock Canyons`);
  });

  if (horse) {
    await t.check('scared horse RUNS AWAY (distance grows — charging-deer lesson)', async () => {
      await t.tp(horse.x + 3, horse.z, 'WALK');
      await t.ev(`g.animals.scare(${horse.x}, ${horse.z}, 30)`);
      const d = await t.sample(
        `Math.hypot(window.__horse.g.position.x - ${horse.x}, window.__horse.g.position.z - ${horse.z})`,
        8, 300);
      t.ok(d[7] > d[0] + 1.5, `horse didn't gain ground: ${d[0].toFixed(1)} → ${d[7].toFixed(1)}`);
      await t.tp(parkX, parkZ, 'DRIVE');
    });
  }

  await t.check('farm herds cluster at farmsteadAt sites (read, not respawned)', async () => {
    const res = await t.ev(`(() => {
      let farms = 0, herded = 0;
      for (const key of g.animals.live.keys()) {
        const [cx, cz] = key.split(',').map(Number);
        const site = g.farmsteadAt(cx, cz);
        if (!site) continue;
        farms++;
        const near = g.animals.live.get(key).animals.filter((a) =>
          ['longhorn', 'horse', 'goat', 'sheep'].includes(a.species) &&
          Math.hypot(a.homeX - site.x, a.homeZ - site.z) < 20);
        if (near.length >= 1) herded++;
      }
      return { farms, herded };
    })()`);
    t.ok(res.farms > 0, 'no farmstead sites among 25 live Parker chunks — herd check has nothing to bite');
    t.ok(res.herded > 0, `${res.farms} farm chunks live, none with livestock homed at the site`);
  });

  await t.check('bison graze at Caprock Canyons — and only there', async () => {
    const site = await t.ev(`g.animals.bisonSite`);
    await t.tp(site.x + 10, site.z);
    await t.wait(0.8);
    const n = await t.ev(`(() => {
      let n = 0;
      for (const { animals } of g.animals.live.values())
        for (const a of animals)
          if (a.species === 'bison' && Math.hypot(a.homeX - ${site.x}, a.homeZ - ${site.z}) < 15) n++;
      return n;
    })()`);
    t.ok(n >= 4, `expected a bison herd at Caprock, got ${n}`);
  });

  if (process.env.SHOT) { // aerial field/pivot composition read — judgment only, never pass/fail
    const y = await t.ev(`g.hAt(${haleX}, ${haleZ}) + 55`);
    await t.tp(haleX, haleZ, 'FLY', y);
    await t.wait(0.8);
    await t.shot('ag-fields-aerial');
  }

  await t.tp(haleX, haleZ, 'DRIVE'); // leave the suite grounded in DRIVE (ambient-mode convention)
}
