// NPC content pools (expansion wave 2). Spatial determinism is the hard
// guarantee: pool growth must never move or restyle a spawned figure, so the
// baseline check pins pre-expansion positions/rotations/look colors captured
// on 2026-07-12 at commit d800b81 (before the pools grew). Variety checks
// assert observed behavior (distinct names/professions/lines across spawns),
// not just pool constants — plus one degenerate-pool guard via the POOLS
// export imported live in-page.

// spawn signature: pos.x|pos.z|baseRotY|material-colors — captured pre-expansion
const BASELINE = {
  'El Paso': ['-6662.132|-862.447|1.146|3a5077.3a2c22.3a5077.3a2c22.4a7a8a.4a7a8a.8a5c3c.4a7a8a.8a5c3c.8a5c3c.718329.718329', '-6655.107|-862.446|3.715|8a5c3c.3a2c22.8a5c3c.3a2c22.2f5a8a.2f5a8a.2f5a8a.8a5c3c.2f5a8a.8a5c3c.8a5c3c.8101b5.8101b5', '-6657.617|-858.816|5.575|3a5077.3a2c22.3a5077.3a2c22.8a2f2f.8a2f2f.8a5c3c.8a2f2f.8a5c3c.8a5c3c.2a2018', '-6660.820|-851.969|0.798|b5875a.3a2c22.b5875a.3a2c22.8a2f2f.8a2f2f.8a2f2f.b5875a.8a2f2f.b5875a.b5875a.6d38d5.6d38d5', '-6670.930|-864.566|2.829|b5875a.3a2c22.b5875a.3a2c22.6a3f7a.6a3f7a.6a3f7a.b5875a.6a3f7a.b5875a.b5875a.d8b860'],
  'Waco': ['2237.277|-605.368|3.021|3a5077.3a2c22.3a5077.3a2c22.6a3f7a.6a3f7a.d9a066.6a3f7a.d9a066.d9a066.74148d.74148d', '2243.112|-616.880|2.867|e8b880.3a2c22.e8b880.3a2c22.7a5a2f.7a5a2f.7a5a2f.e8b880.7a5a2f.e8b880.e8b880.888888', '2247.088|-617.219|2.815|3a5077.3a2c22.3a5077.3a2c22.8a2f2f.8a2f2f.8a5c3c.8a2f2f.8a5c3c.8a5c3c.744516.744516'],
  'ACT': ['2176.470|-680.590|4.093|8a5c3c.3a2c22.8a5c3c.3a2c22.9a8a4a.9a8a4a.9a8a4a.8a5c3c.9a8a4a.8a5c3c.8a5c3c.7f9b32.7f9b32', '2176.459|-678.794|4.884|b5875a.3a2c22.b5875a.3a2c22.2f5a8a.2f5a8a.2f5a8a.b5875a.2f5a8a.b5875a.b5875a.8020cc.8020cc'],
};

export default async function npcs(t) {
  await t.check('grounding: NPC ground height (gY) rides a brand pad, not raw terrain underneath it', async () => {
    // Katy's Bucky's pad — same wiring bug as vehicle.js/traffic.js: without
    // the brandGroundYAt fallback, an NPC placed at a lot edge (roadShoulder)
    // would sink to the terrain under the slab instead of standing on it.
    const katy = await t.ev(`({
      x: (-95.8475 + 99.5) * 111320 * Math.cos(31 * Math.PI / 180) / 100,
      z: -(29.7787 - 31) * 111320 / 100,
    })`);
    await t.ev(`g.brands.setScale(1)`); // pad-clearance margin below assumes unscaled geometry
    const r = await t.ev(`(async () => {
      const { gY } = await import('/src/npcs.js');
      return { gy: gY(${katy.x}, ${katy.z}), padTop: g.brandGroundYAt(${katy.x}, ${katy.z}), raw: g.hAt(${katy.x}, ${katy.z}) };
    })()`);
    t.ok(r.padTop !== null, "brandGroundYAt returned null standing on Bucky's own pad at Katy");
    t.ok(r.padTop > r.raw + 0.3, `pad top barely clears raw terrain: ${JSON.stringify(r)}`);
    t.near(r.gy, r.padTop, 0.001, `npcs.js gY sank through the pad: ${JSON.stringify(r)}`);
  });

  await t.check('pools are not degenerate (sizes, disjoint city/town professions, flavored keys resolve)', async () => {
    const r = await t.ev(`(async () => {
      const { POOLS: P } = await import('/src/npcs.js');
      const townSet = new Set(P.PROFESSIONS_TOWN), citySet = new Set(P.PROFESSIONS_CITY);
      return {
        first: P.TOWNSFOLK_FIRST.length, sur: P.TOWNSFOLK_SURNAMES.length, lines: P.TOWNSFOLK_LINES.length,
        town: P.PROFESSIONS_TOWN.length, city: P.PROFESSIONS_CITY.length,
        overlap: P.PROFESSIONS_TOWN.filter((p) => citySet.has(p)),
        namedShort: P.NAMED.filter((n) => n[3].length < 7).map((n) => n[0]),
        smalltalk: Object.entries(P.ROLE_SMALLTALK).map(([k, v]) => k + ':' + v.length),
        variants: Object.entries(P.BYSTANDER_ROLE_INFO).map(([k, v]) => k + ':' + v.length),
        badBand: Object.values(P.BYSTANDER_ROLE_INFO).flat().filter((v) => !(v.lo < v.hi)).map((v) => v.p),
        orphanKeys: Object.keys(P.PROFESSION_LINES).filter((k) => !townSet.has(k) && !citySet.has(k)),
        thinFlavor: Object.entries(P.PROFESSION_LINES).filter(([, v]) => v.length < 2).map(([k]) => k),
        wx: Object.entries(P.PILOT_WX).map(([k, v]) => k + ':' + v.length),
      };
    })()`);
    t.ok(r.first >= 60, `${r.first} first names (want ≥60)`);
    t.ok(r.sur >= 40, `${r.sur} surnames (want ≥40)`);
    t.ok(r.lines >= 55, `${r.lines} townsfolk lines (want ≥55)`);
    t.ok(r.town >= 20 && r.city >= 16, `professions town ${r.town} / city ${r.city}`);
    t.ok(r.overlap.length === 0, `town/city profession pools overlap: ${r.overlap.join(',')}`);
    t.ok(r.namedShort.length === 0, `named characters below 7 lines: ${r.namedShort.join(',')}`);
    t.ok(r.smalltalk.every((s) => +s.split(':')[1] >= 8), `role smalltalk ${r.smalltalk.join(' ')} (want ≥8 each)`);
    t.ok(r.variants.every((s) => +s.split(':')[1] >= 3), `role variants ${r.variants.join(' ')} (want ≥3 each)`);
    t.ok(r.badBand.length === 0, `inverted age bands: ${r.badBand.join(',')}`);
    t.ok(r.orphanKeys.length === 0, `PROFESSION_LINES keys not in any pool: ${r.orphanKeys.join(',')}`);
    t.ok(r.thinFlavor.length === 0, `flavored professions with <2 lines: ${r.thinFlavor.join(',')}`);
    t.ok(r.wx.every((s) => +s.split(':')[1] >= 2), `pilot weather lines ${r.wx.join(' ')} (want ≥2 each)`);
  });

  await t.check('spatial determinism: spawn positions/rotations/looks match the pre-expansion baseline', async () => {
    await t.setDay();
    const r = await t.ev(`(() => {
      g.radio.chatterT = 999;
      g.player.setMode('WALK');
      const sig = (folk) => folk.map((f) => {
        const cols = [];
        f.g.traverse((o) => { if (o.material?.color) cols.push(o.material.color.getHexString()); });
        return [f.g.position.x.toFixed(3), f.g.position.z.toFixed(3), (f.baseRotY ?? 0).toFixed(3), cols.join('.')].join('|');
      });
      const out = {};
      for (const cityName of ['El Paso', 'Waco']) {
        const c = g.GEO.cities.find((x) => x.name === cityName);
        g.player.pos.set(c.x, 0, c.z);
        g.npcs.update(0.05, g.player.pos);
        out[cityName] = sig(g.npcs.townByCity.get(cityName) ?? []);
        g.player.pos.set(c.x + 900, 0, c.z);
        g.npcs.update(0.05, g.player.pos);
      }
      const a = g.AIRPORTS.find((x) => x.id === 'ACT');
      g.player.pos.set(a.gate[0] + 4, 0, a.gate[1]);
      g.npcs.update(0.05, g.player.pos);
      out.ACT = sig(g.npcs.byField.get('ACT') ?? []);
      g.player.pos.set(a.gate[0] + 900, 0, a.gate[1]);
      g.npcs.update(0.05, g.player.pos);
      return out;
    })()`);
    for (const key of Object.keys(BASELINE))
      t.ok(JSON.stringify(r[key]) === JSON.stringify(BASELINE[key]), `${key} spawn signature drifted from pre-expansion baseline`);
  });

  await t.check('observed variety: townsfolk across 30 cities get distinct two-part names + pool-correct professions', async () => {
    const r = await t.ev(`(async () => {
      const { POOLS: P } = await import('/src/npcs.js');
      const big = g.GEO.cities.filter((c) => c.pop > 400000);
      const small = g.GEO.cities.filter((c) => c.pop <= 400000).filter((_, i) => i % 5 === 0).slice(0, 24);
      const folks = [];
      for (const c of [...big, ...small]) {
        g.player.pos.set(c.x, 0, c.z);
        g.npcs.update(0.05, g.player.pos);
        for (const f of g.npcs.townByCity.get(c.name) ?? []) folks.push({ name: f.name, profession: f.profession, big: f.bigCity, age: f.age });
        g.player.pos.set(c.x + 900, 0, c.z);
        g.npcs.update(0.05, g.player.pos);
      }
      const townSet = new Set(P.PROFESSIONS_TOWN), citySet = new Set(P.PROFESSIONS_CITY);
      return {
        n: folks.length,
        badNames: folks.filter((f) => f.name.split(' ').length < 2).map((f) => f.name),
        distinctFirst: new Set(folks.map((f) => f.name.split(' ')[0])).size,
        distinctSur: new Set(folks.map((f) => f.name.split(' ').slice(1).join(' '))).size,
        distinctProf: new Set(folks.map((f) => f.profession)).size,
        wrongPool: folks.filter((f) => (f.big ? !citySet.has(f.profession) : !townSet.has(f.profession))).map((f) => f.name + ':' + f.profession),
        badAges: folks.filter((f) => !Number.isInteger(f.age) || f.age < 14 || f.age > 80).length,
      };
    })()`);
    t.ok(r.n >= 60, `${r.n} townsfolk sampled (want ≥60)`);
    t.ok(r.badNames.length === 0, `one-part names: ${r.badNames.join(',')}`);
    t.ok(r.distinctFirst >= 25, `${r.distinctFirst} distinct first names over ${r.n} folk (want ≥25)`);
    t.ok(r.distinctSur >= 20, `${r.distinctSur} distinct surnames (want ≥20)`);
    t.ok(r.distinctProf >= 12, `${r.distinctProf} distinct professions (want ≥12)`);
    t.ok(r.wrongPool.length === 0, `professions from the wrong city-size pool: ${r.wrongPool.slice(0, 4).join(' ')}`);
    t.ok(r.badAges === 0, `${r.badAges} folk with out-of-band ages`);
  });

  await t.check('townsfolk dialog: 40 chats mix generic pool with profession-flavored lines', async () => {
    await t.setDay();
    await t.setWeather('clear');
    const r = await t.ev(`(async () => {
      const { POOLS: P } = await import('/src/npcs.js');
      const c = g.GEO.cities.find((x) => x.name === 'Waco');
      g.player.setMode('WALK');
      g.player.pos.set(c.x, 0, c.z);
      g.npcs.update(0.05, g.player.pos);
      const f = g.npcs.townByCity.get('Waco')[0];
      f.profession = 'waitress'; // force a flavored profession — tests the mix mechanism
      g.player.pos.set(f.g.position.x + 2.5, 0, f.g.position.z); // parked-truck distance
      const seen = [];
      for (let i = 0; i < 40; i++) {
        g.npcs.activeNPC = null;
        if (g.npcs.npcNear(g.player.pos) !== f) return { err: 'wrong npc nearest' };
        g.npcs.interact(g.player.pos);
        seen.push(g.npcs.convo[g.npcs.convo.length - 1]);
      }
      g.npcs.activeNPC = null;
      const flavored = new Set(P.PROFESSION_LINES['waitress']);
      return {
        distinct: new Set(seen).size,
        nFlavored: seen.filter((l) => flavored.has(l)).length,
        nGeneric: seen.filter((l) => P.TOWNSFOLK_LINES.includes(l)).length,
        stray: seen.filter((l) => !flavored.has(l) && !P.TOWNSFOLK_LINES.includes(l)),
      };
    })()`);
    t.ok(!r.err, r.err ?? 'npc reachable');
    t.ok(r.distinct >= 12, `${r.distinct} distinct lines in 40 chats (want ≥12)`);
    t.ok(r.nFlavored >= 1, `${r.nFlavored}/40 profession-flavored lines (want ≥1)`);
    t.ok(r.nGeneric >= 1, `${r.nGeneric}/40 generic lines (want ≥1)`);
    t.ok(r.stray.length === 0, `lines from no known pool: ${r.stray.slice(0, 2).join(' | ')}`);
  });

  await t.check('named characters rotate through the full expanded line set (Willie, 8 visits)', async () => {
    await t.setDay();
    await t.setWeather('clear');
    const r = await t.ev(`(() => {
      const n = g.npcs.named.find((x) => x.name === 'Willie');
      g.player.setMode('WALK');
      g.player.pos.set(n.g.position.x + 2.5, 0, n.g.position.z);
      const seen = new Set();
      for (let i = 0; i < n.lines.length; i++) {
        g.npcs.activeNPC = null;
        if (g.npcs.npcNear(g.player.pos) !== n) return { err: 'Willie not nearest' };
        g.npcs.interact(g.player.pos);
        // the rotating main line is whichever convo entry comes from his set
        // (an opener/heli line may sit in front of it at natural weather)
        const line = g.npcs.convo.find((x) => n.lines.includes(x));
        if (line) seen.add(line);
      }
      g.npcs.activeNPC = null;
      return { seen: seen.size, pool: n.lines.length };
    })()`);
    t.ok(!r.err, r.err ?? 'Willie reachable');
    t.ok(r.pool >= 8, `Willie has ${r.pool} lines (want ≥8)`);
    t.ok(r.seen === r.pool, `${r.seen}/${r.pool} distinct lines over ${r.pool} visits — rotation skipped some`);
  });

  await t.check('bystander variants: roles carry varied professions with ages inside each variant band', async () => {
    await t.setDay();
    const r = await t.ev(`(async () => {
      const { POOLS: P } = await import('/src/npcs.js');
      g.player.setMode('WALK');
      const fields = g.AIRPORTS.filter((a) => a.tier <= 2 || a.id === 'MRF' || a.id === 'TRL');
      const byRole = { spotter: new Set(), relative: new Set(), pilot: new Set() };
      const bad = [];
      let n = 0;
      for (const a of fields) {
        g.player.pos.set(a.gate[0] + 4, 0, a.gate[1]);
        g.npcs.update(0.05, g.player.pos);
        for (const f of g.npcs.byField.get(a.id) ?? []) {
          n++;
          byRole[f.role].add(f.profession);
          const v = P.BYSTANDER_ROLE_INFO[f.role].find((x) => x.p === f.profession);
          if (!v) bad.push(a.id + ':' + f.profession + ':unknown-variant');
          else if (f.age < v.lo || f.age > v.hi) bad.push(a.id + ':' + f.profession + ':age' + f.age);
          if (f.name.split(' ').length < 2) bad.push(a.id + ':one-part-name:' + f.name);
        }
        g.player.pos.set(a.gate[0] + 900, 0, a.gate[1]);
        g.npcs.update(0.05, g.player.pos);
      }
      return { n, bad, roles: Object.fromEntries(Object.entries(byRole).map(([k, v]) => [k, v.size])) };
    })()`);
    t.ok(r.n >= 20, `${r.n} bystanders sampled across gate fields`);
    t.ok(r.bad.length === 0, `variant violations: ${r.bad.slice(0, 4).join(' ')}`);
    for (const [role, k] of Object.entries(r.roles))
      t.ok(k >= 2, `${role}: ${k} distinct professions across fields (want ≥2)`);
  });

  // W7 — SPI is scenery, never a 133rd city, so the Turtle Lady takes the ag
  // characters' coord form. A hand-placed coastal coordinate is exactly the
  // thing that reads fine and lands in the Laguna Madre (the W4 ferry-terminal
  // lesson), so assert the island underfoot rather than trusting the numbers.
  await t.check('the Turtle Lady stands on Padre itself, not in the bay beside it', async () => {
    const r = await t.ev(`(async () => {
      const { POOLS } = await import('/src/npcs.js');
      const row = POOLS.NAMED.find((n) => n[0] === 'The Turtle Lady');
      if (!row) return { missing: true };
      const [x, z] = row[1];
      return {
        coordForm: Array.isArray(row[1]), x, z,
        island: g.onIsland(x, z), texas: g.inTexas(x, z),
        lines: row[3].length, age: row[5], profession: row[6],
        live: g.npcs.named.some((n) => n.name === 'The Turtle Lady'),
      };
    })()`);
    t.ok(!r.missing, 'the Turtle Lady is not in the NAMED table');
    t.ok(r.coordForm, 'the Turtle Lady resolves by city name — SPI is not a GEO city (settled call 6)');
    t.ok(r.island, `the Turtle Lady is off the island at ${r.x},${r.z} — onIsland false (bay or open water)`);
    t.ok(r.texas, `the Turtle Lady is outside Texas at ${r.x},${r.z}`);
    t.ok(r.lines >= 7, `the Turtle Lady carries ${r.lines} lines (want ≥7)`);
    t.ok(r.age > 0 && !!r.profession, `no age/profession — npcSub would render no subtitle: ${r.age}/${r.profession}`);
  });

  // The Passport rows lead PROGRESS_LINES on purpose: find() takes the first
  // match that also wins a coin flip, so behind the five always-eligible Texas
  // rows a passport-carrying player would reach them ~1 talk in 32. Assert the
  // ordering behaviorally — a pool edit that appends them would pass a mere
  // "the lines exist" check while burying them in play.
  await t.check('Passport progress lines gate on leaving Texas and outrank the Texas tallies', async () => {
    const r = await t.ev(`(async () => {
      const { POOLS } = await import('/src/npcs.js');
      const P = POOLS.PROGRESS_LINES;
      const zero = { species: 0, cities: 0, landmarks: 0, roses: 0, airports: 0,
        passportStones: 0, passportStamps: 0, passportLandings: 0, passportTowns: 0 };
      // a maxed-out Texas player who has ALSO been across the line
      const both = { species: 99, cities: 99, landmarks: 99, roses: 99, airports: 99,
        passportStones: 9, passportStamps: 9, passportLandings: 9, passportTowns: 9 };
      const idx = (c) => P.findIndex(([test]) => test(c));
      return {
        homebody: P.filter(([test]) => test(zero)).length,
        firstWithBoth: idx(both),
        firstPassportOnly: idx({ ...zero, passportStones: 3 }),
        texasIdx: idx({ ...zero, species: 8 }),
        keys: P.map(([, line]) => line.slice(0, 24)),
      };
    })()`);
    t.ok(r.homebody === 0, `${r.homebody} progress lines fire for a player with nothing logged`);
    t.ok(r.firstPassportOnly >= 0, 'three Corner Stones fires no progress line');
    t.ok(r.firstWithBoth === r.firstPassportOnly,
      `a passport-carrying player hits "${r.keys[r.firstWithBoth]}" first — the Passport rows must lead, or find() buries them`);
    t.ok(r.firstPassportOnly < r.texasIdx,
      `Passport row at ${r.firstPassportOnly} sits behind the Texas row at ${r.texasIdx}`);
  });
}
