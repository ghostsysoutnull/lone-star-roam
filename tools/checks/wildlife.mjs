// Wildlife behavior at natural values. The load-bearing check is flee =
// distance INCREASES over time — the inverted-heading bug shipped once and
// looked right in screenshots. Species specs come from g.SPECIES
// (fleeR = skittish, nightMin/nightMax = nocturnal/diurnal hours).

export default async function wildlife(t) {
  // rural Hill Country west of Austin: deer herds, daytime species
  const austin = await t.ev(`(() => { const c = g.GEO.cities.find((c) => c.name === 'Austin'); return { x: c.x, z: c.z }; })()`);
  await t.setDay();
  await t.tp(austin.x - 300, austin.z - 40);
  await t.wait(0.5); // chunks spawn on the next update

  await t.check('animals spawn and honor their hours (day)', async () => {
    const { total, wrong } = await t.ev(`(() => {
      const night = g.ATMOS.night;
      let total = 0, wrong = 0;
      for (const { animals } of g.animals.live.values())
        for (const a of animals) {
          total++;
          const s = g.SPECIES[a.species];
          const want = s.nightMin != null ? night >= s.nightMin : s.nightMax != null ? night <= s.nightMax : true;
          if (a.g.visible !== want) wrong++;
        }
      return { total, wrong };
    })()`);
    t.ok(total > 0, 'no animals spawned');
    t.ok(wrong === 0, `${wrong}/${total} animals ignore their hours`);
  });

  // find a skittish herd (≥2 fleeR members sharing a home) and stash it
  const herd = await t.ev(`(() => {
    const groups = new Map();
    for (const { animals } of g.animals.live.values())
      for (const a of animals) {
        if (!g.SPECIES[a.species].fleeR || !a.g.visible) continue;
        const k = a.homeX + ',' + a.homeZ;
        (groups.get(k) ?? groups.set(k, []).get(k)).push(a);
      }
    for (const [, m] of groups)
      if (m.length >= 2) { window.__herd = m; return { x: m[0].homeX, z: m[0].homeZ, n: m.length, species: m[0].species }; }
    return null;
  })()`);

  await t.check('a skittish herd exists nearby', async () => {
    t.ok(herd, 'no multi-member skittish herd in live chunks');
  });
  if (!herd) return;

  await t.check(`scare startles the herd (${herd.species} ×${herd.n})`, async () => {
    await t.tp(herd.x + 3, herd.z, 'WALK');
    await t.ev(`g.animals.scare(${herd.x}, ${herd.z}, 30)`);
    const fleeing = await t.ev(`window.__herd.filter((a) => a.state === 'flee').length`);
    t.ok(fleeing >= 2, `only ${fleeing}/${herd.n} fleeing`);
  });

  await t.check('fleeing animals RUN AWAY (distance grows, never shrinks)', async () => {
    const d = await t.sample(
      `Math.hypot(window.__herd[0].g.position.x - ${herd.x}, window.__herd[0].g.position.z - ${herd.z})`,
      8, 300);
    t.ok(d[7] > d[0] + 1.5, `didn't gain ground: ${d[0].toFixed(1)} → ${d[7].toFixed(1)}`);
    t.ok(Math.min(...d) >= d[0] - 0.8, `closed in mid-flight: min ${Math.min(...d).toFixed(1)} vs start ${d[0].toFixed(1)}`);
  });

  await t.check('close encounter logs the species', async () => {
    const pos = await t.ev('({ x: window.__herd[0].g.position.x, z: window.__herd[0].g.position.z })');
    await t.tp(pos.x + 4, pos.z, 'WALK');
    await t.until(`g.gameplay.save.species.includes('${herd.species}')`, 10000);
  });

  await t.check('animals honor their hours (night)', async () => {
    await t.setNight();
    await t.wait(0.4);
    const { total, wrong } = await t.ev(`(() => {
      const night = g.ATMOS.night;
      let total = 0, wrong = 0;
      for (const { animals } of g.animals.live.values())
        for (const a of animals) {
          total++;
          const s = g.SPECIES[a.species];
          const want = s.nightMin != null ? night >= s.nightMin : s.nightMax != null ? night <= s.nightMax : true;
          if (a.g.visible !== want) wrong++;
        }
      return { total, wrong };
    })()`);
    t.ok(wrong === 0, `${wrong}/${total} animals ignore their hours at night`);
    await t.setDay(); // leave the world in daylight
  });

  // rattlesnake (Trans-Pecos) and gator (Piney Woods) were 0.15 keep-odds
  // outliers vs. 0.3-0.55 everywhere else — pin the retuned values directly
  // via g.animals.regionTable rather than resampling chunks statistically
  await t.check('rattlesnake and gator keep-odds match the retuned values', async () => {
    const snakeOdds = await t.ev(`g.animals.regionTable(-2700, 600).find((e) => e[0] === 'rattlesnake')[4]`);
    const gatorOdds = await t.ev(`g.animals.regionTable(4000, 0).find((e) => e[0] === 'gator')[4]`);
    t.near(snakeOdds, 0.35, 0.001, 'rattlesnake keep-odds');
    t.near(gatorOdds, 0.3, 0.001, 'Piney Woods gator keep-odds');
  });

  await t.check('rattle warning carries to 16 units, not just 9', async () => {
    await t.tp(-2700, 600, 'WALK');
    await t.wait(0.5); // chunks spawn on the next update
    const snake = await t.ev(`(() => {
      for (const { animals } of g.animals.live.values())
        for (const a of animals)
          if (a.species === 'rattlesnake') return { x: a.g.position.x, z: a.g.position.z };
      return null;
    })()`);
    t.ok(snake, 'no rattlesnake spawned near the Trans-Pecos test spot');
    if (!snake) return;

    await t.ev(`(window.__rattleSpy = [], window.__origOnSound = g.animals.onSound,
      g.animals.onSound = (k) => { window.__rattleSpy.push(k); window.__origOnSound?.(k); })`);

    await t.tp(snake.x + 30, snake.z, 'WALK');
    await t.wait(0.4);
    t.ok(!(await t.ev(`window.__rattleSpy.includes('rattle')`)), 'rattle audible from 30 units away');

    await t.ev(`window.__rattleSpy = []`);
    await t.tp(snake.x + 13, snake.z, 'WALK'); // between the old 9-unit cutoff and the new 16-unit one
    await t.wait(0.4);
    t.ok(await t.ev(`window.__rattleSpy.includes('rattle')`), 'rattle silent at 13 units — still gated at the old 9-unit radius?');

    await t.ev(`g.animals.onSound = window.__origOnSound`);
  });
}
