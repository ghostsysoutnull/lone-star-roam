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

  // ---- wave 4: named-ranch gate arches + herd boost + ag NPCs ----

  await t.check('ranch arches: four rancharch landmarks, right counties, grounded at hAt', async () => {
    const r = await t.ev(`g.gameplay.landmarkGroup.children
      .filter((c) => c.userData.lm?.kind === 'rancharch')
      .map((c) => ({ name: c.userData.lm.name, x: c.position.x, z: c.position.z,
        dy: Math.abs(c.position.y - g.hAt(c.position.x, c.position.z)),
        county: g.countyAt(c.position.x, c.position.z) }))`);
    t.ok(r.length === 4, `expected 4 rancharch landmarks, got ${r.length}`);
    const want = { 'King Ranch': 'Kleberg', 'Four Sixes Ranch': 'King', 'Waggoner Ranch': 'Wilbarger', 'Y.O. Ranch': 'Kerr' };
    for (const a of r) {
      t.ok(a.dy < 0.01, `${a.name} floats ${a.dy.toFixed(3)} off hAt`);
      t.ok(a.county === want[a.name], `${a.name} sits in ${a.county} county, wanted ${want[a.name]}`);
    }
  });

  const wagg = await t.ev(`(() => {
    const c = g.gameplay.landmarkGroup.children.find((c) => c.userData.lm?.name === 'Waggoner Ranch');
    return { x: c.position.x, z: c.position.z };
  })()`);

  await t.check('arch collect: parked-truck distance on an ugly off-axis heading (Waggoner)', async () => {
    await t.tp(wagg.x + 9.3, wagg.z - 11.1, 'DRIVE'); // ~14.6 units out, off both axes
    await t.ev(`g.player.heading = 2.13`);
    await t.wait(0.6);
    const got = await t.ev(`g.gameplay.save.landmarks.includes('Waggoner Ranch')`);
    t.ok(got, 'Waggoner arch did not collect at parked-truck distance');
  });

  await t.check('arch plaque: E reads the historical marker on DOM, E again closes (Waggoner — no NPC shadow)', async () => {
    await t.tp(wagg.x + 9.3, wagg.z - 11.1, 'WALK');
    await t.wait(0.3);
    const hint = await t.ev('g.hud.els.interact.textContent');
    t.ok(hint === 'E — read the historical marker', `expected the marker hint, got "${hint}"`);
    await t.key('KeyE');
    const dlg = await t.ev(`({
      name: g.hud.els.dialog.querySelector('.npc-name').textContent,
      text: g.hud.els.dialog.querySelector('.npc-text').textContent,
      shown: g.hud.els.dialog.style.display,
    })`);
    t.ok(dlg.name.includes('Waggoner Ranch'), `plaque name wrong: "${dlg.name}"`);
    t.ok(dlg.text.includes('510,000') && dlg.text.includes('oil'), `plaque fact wrong: "${dlg.text}"`);
    t.ok(dlg.shown === 'block', 'plaque dialog not shown after E');
    await t.key('KeyE');
    const closed = await t.ev('g.hud.els.dialog.style.display');
    t.ok(closed === 'none', 'second E did not close the plaque');
    await t.tp(wagg.x + 9.3, wagg.z - 11.1, 'DRIVE');
  });

  await t.check('herd boost: censusTable adds each arch’s rows at the gate, none at a control point', async () => {
    const r = await t.ev(`g.animals.ranchArches.map((a) => {
      const key = (row) => row.join('|');
      const at = new Set(g.animals.censusTable(a.x, a.z).map(key));
      const ctrl = new Set(g.animals.censusTable(a.x - a.r - 200, a.z).map(key)); // west: inland at every arch
      return a.rows.map((row) => ({ row: key(row), boosted: at.has(key(row)), leaked: ctrl.has(key(row)) }));
    }).flat()`);
    for (const { row, boosted, leaked } of r) {
      t.ok(boosted, `arch row missing at the gate: ${row}`);
      t.ok(!leaked, `arch row leaked to the control point: ${row}`);
    }
  });

  await t.check('King arch: boosted herds actually spawn thick at the gate (seeded draw)', async () => {
    const a = await t.ev(`g.animals.ranchArches[0]`);
    await t.tp(a.x, a.z, 'DRIVE');
    await t.wait(0.8);
    const n = await t.ev(`(() => {
      let n = 0;
      for (const key of g.animals.live.keys()) {
        const [cx, cz] = key.split(',').map(Number);
        if ((cx * 260 + 130 - ${a.x}) ** 2 + (cz * 260 + 130 - ${a.z}) ** 2 >= ${a.r * a.r}) continue;
        for (const an of g.animals.live.get(key).animals)
          if (an.species === 'longhorn' || an.species === 'horse') n++;
      }
      return n;
    })()`);
    t.ok(n >= 8, `King gate country too thin: ${n} longhorn/horse homed in boosted chunks`);
  });

  await t.check('ag NPCs: five rural characters placed, flagged ag, with age/profession', async () => {
    const r = await t.ev(`g.npcs.named.filter((n) => n.ag)
      .map((n) => ({ name: n.name, y: n.g.position.y, lines: n.lines.length, age: n.age, prof: n.profession }))`);
    t.ok(r.length === 5, `expected 5 ag NPCs, got ${r.length}: ${r.map((n) => n.name).join(',')}`);
    for (const n of r) {
      t.ok(Number.isFinite(n.y), `${n.name} has a bad ground height`);
      t.ok(n.lines >= 6, `${n.name} has only ${n.lines} rotating lines (want ≥6)`);
      t.ok(Number.isInteger(n.age) && n.prof, `${n.name} missing age/profession subtitle data`);
    }
  });

  await t.check('ag NPC rain register: Cy’s opener comes from AG_OPENERS.rain and lands on DOM (parked-truck distance)', async () => {
    await t.setDay();
    await t.setWeather('rain');
    await t.ev(`(() => {
      const n = g.npcs.named.find((x) => x.name === 'Cy');
      g.player.setMode('WALK');
      g.player.pos.set(n.g.position.x + 2.5, 0, n.g.position.z);
      g.npcs.activeNPC = null;
    })()`);
    // Cy sits ~23 units from Kingsville — inside its townsfolk spawn radius,
    // and the King-arch check two steps up also parks near Kingsville. A
    // real wait lets npcs.update() tick at least once at Cy's position so
    // any spawn/despawn hysteresis left over from that earlier position
    // settles before the synchronous npcNear() snapshot below — skipping it
    // raced under heavier chunk-build load (wave 4.5's denser crop
    // geometry) and intermittently missed Cy.
    await t.wait(0.3);
    const r = await t.ev(`(async () => {
      const { POOLS: P } = await import('/src/npcs.js');
      const n = g.npcs.named.find((x) => x.name === 'Cy');
      const near = g.npcs.npcNear(g.player.pos);
      if (near !== n) return { err: 'Cy not the nearest NPC at 2.5 units' };
      g.npcs.interact(g.player.pos);
      const dom = g.hud.els.dialog.querySelector('.npc-text').textContent;
      const sub = g.hud.els.dialog.querySelector('.npc-sub').textContent;
      const opener = g.npcs.convo[0];
      const inPool = P.AG_OPENERS.rain.includes(opener), domMatch = dom === opener;
      const willie = g.npcs.named.find((x) => x.name === 'Willie');
      g.npcs.activeNPC = null;
      g.hud.dialog(null);
      return { inPool, domMatch, opener, dom, sub, willieAg: !!willie.ag };
    })()`);
    t.ok(!r.err, r.err ?? 'Cy reachable');
    t.ok(r.inPool, `opener not from AG_OPENERS.rain: "${r.opener}"`);
    t.ok(r.domMatch, `DOM text is not the opener: "${r.dom}"`);
    t.ok(r.sub.includes('King Ranch hand'), `subtitle missing profession: "${r.sub}"`);
    t.ok(!r.willieAg, 'Willie got flagged ag — city characters must keep the generic openers');
    await t.setWeather('clear');
  });

  // ---- wave 4.5: crop visual upgrade — visuals as numbers, placement frozen ----

  await t.tp(haleX, haleZ);
  await t.wait(0.8);

  await t.check('placement frozen: known Hale chunk\'s first field decal sits at its pre-wave-4.5 coords', async () => {
    const res = await t.ev(`(() => {
      const cx = Math.floor(${haleX} / 260), cz = Math.floor(${haleZ} / 260);
      const gr = g.scenery.live.get(cx + ',' + cz);
      if (!gr) return null;
      const patch = gr.children.find((c) => c.userData.crop);
      if (!patch) return null;
      const p = patch.geometry.attributes.position.array;
      let sx = 0, sz = 0, n = p.length / 3;
      for (let i = 0; i < p.length; i += 3) { sx += p[i]; sz += p[i + 2]; }
      return { x: sx / n, z: sz / n, crop: patch.userData.crop };
    })()`);
    t.ok(res, 'no crop field decal in the known Hale chunk (-9,-14)');
    t.ok(res.crop === 'cotton', `Hale chunk crop drifted from cotton: ${res.crop}`);
    t.ok(Math.abs(res.x - -2147.5011160714284) < 0.001, `field x moved: ${res.x}`);
    t.ok(Math.abs(res.z - -3607.7045340401787) < 0.001, `field z moved: ${res.z}`);
  });

  await t.check('furrow striping: field decals carry ≥2 distinct vertex-color tones', async () => {
    const res = await t.ev(`(() => {
      let n = 0; const bad = [];
      for (const gr of g.scenery.live.values())
        gr.traverse((o) => {
          if (!o.userData.crop) return;
          n++;
          const c = o.geometry.attributes.color;
          if (!c) { bad.push(o.userData.crop + ':no-color'); return; }
          const tones = new Set();
          for (let i = 0; i < c.array.length; i += 3) tones.add(c.array[i] + ',' + c.array[i + 1] + ',' + c.array[i + 2]);
          if (tones.size < 2) bad.push(o.userData.crop + ':' + tones.size + '-tone');
        });
      return { n, bad };
    })()`);
    t.ok(res.n > 0, 'no crop field decals in live Hale chunks to check striping on');
    t.ok(res.bad.length === 0, `field decals missing 2-tone striping: ${res.bad}`);
  });

  const [whartonX, whartonZ] = LL(29.3116, -96.1027); // Wharton, TX — rice country
  await t.check('rice signature: levee/water two-tone stripe on Wharton paddies', async () => {
    await t.tp(whartonX, whartonZ);
    await t.wait(0.8);
    const res = await t.ev(`(() => {
      const tones = new Set(); let rice = 0;
      for (const gr of g.scenery.live.values())
        gr.traverse((o) => {
          if (o.userData.crop !== 'rice') return;
          rice++;
          const c = o.geometry.attributes.color;
          for (let i = 0; i < c.array.length; i += 3) tones.add(c.array[i].toFixed(3) + ',' + c.array[i + 1].toFixed(3) + ',' + c.array[i + 2].toFixed(3));
        });
      return { rice, tones: tones.size };
    })()`);
    t.ok(res.rice > 0, 'no rice field decals in live Wharton chunks');
    t.ok(res.tones >= 2, `rice paddies not two-toned: ${res.tones} distinct colors`);
  });

  const [canadianX, canadianZ] = LL(35.9128, -100.3820); // Canadian, TX — Hemphill county, dominant crop hay
  await t.check('hay signature: windrow striping + guaranteed bales in every hay field', async () => {
    await t.tp(canadianX, canadianZ);
    await t.wait(0.8);
    const res = await t.ev(`(() => {
      const fields = []; let bales = 0;
      for (const gr of g.scenery.live.values())
        gr.traverse((o) => {
          if (o.userData.crop === 'hay') fields.push(o);
          if (o.geometry?.type === 'CylinderGeometry' && o.parent?.children.length === 1 && o.rotation.x === Math.PI / 2) bales++;
        });
      return { fields: fields.length, bales };
    })()`);
    t.ok(res.fields > 0, 'no hay field decals in live Hemphill chunks');
    t.ok(res.bales >= res.fields * 2, `hay fields not carrying guaranteed bales: ${res.bales} bales for ${res.fields} fields`);
  });

  await t.check('row coverage: cotton row-instance count up vs the pre-wave density (was 84 max at Hale)', async () => {
    await t.tp(haleX, haleZ);
    await t.wait(0.8);
    const max = await t.ev(`(() => {
      let max = 0;
      for (const gr of g.scenery.live.values())
        gr.traverse((o) => { if (o.isInstancedMesh && o.geometry.type === 'IcosahedronGeometry') max = Math.max(max, o.count); });
      return max;
    })()`);
    t.ok(max > 100, `cotton row instance count didn't raise vs the pre-wave 84 max: ${max}`);
  });

  if (process.env.SHOT) { // aerial field/pivot composition read — judgment only, never pass/fail
    const y = await t.ev(`g.hAt(${haleX}, ${haleZ}) + 55`);
    await t.tp(haleX, haleZ, 'FLY', y);
    await t.wait(0.8);
    await t.shot('ag-fields-aerial');
    const king = await t.ev(`g.animals.ranchArches[0]`);
    await t.tp(king.x, king.z + 14, 'WALK'); // arch silhouette from the drive-up (wave-4 budgeted shot)
    await t.ev(`g.player.heading = 0`);
    await t.wait(0.5);
    await t.shot('ag-king-arch');
  }

  await t.tp(haleX, haleZ, 'DRIVE'); // leave the suite grounded in DRIVE (ambient-mode convention)
}
