// Wildlife behavior at natural values. The load-bearing check is flee =
// distance INCREASES over time — the inverted-heading bug shipped once and
// looked right in screenshots. Species specs come from g.SPECIES
// (fleeR = skittish, nightMin/nightMax = nocturnal/diurnal hours).

// find a sky.t where pred(ATMOS.night) holds — KEYS are keyframed, so probe
async function findTime(t, pred, candidates) {
  for (const v of candidates) {
    await t.setTime(v);
    await t.wait(0.25);
    if (pred(await t.ev('g.ATMOS.night'))) return v;
  }
  throw new Error(`no sky.t in [${candidates}] satisfied the light condition`);
}

export default async function wildlife(t) {
  // rural Hill Country west of Austin: deer herds, daytime species
  const austin = await t.ev(`(() => { const c = g.GEO.cities.find((c) => c.name === 'Austin'); return { x: c.x, z: c.z }; })()`);
  const day = (n) => n < 0.1, night = (n) => n > 0.7;
  await findTime(t, day, [0.3, 0.35, 0.45, 0.25]);
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
    await findTime(t, night, [0.98, 0.02, 0.95, 0.05, 0.0]);
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
    await findTime(t, day, [0.3, 0.35, 0.45, 0.25]); // leave the world in daylight
  });
}
