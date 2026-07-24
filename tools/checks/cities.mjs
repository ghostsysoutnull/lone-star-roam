// Map W2 rider — building containment fix (src/cities.js). Audit (2026-07-23)
// found downtown InstancedMesh buildings landing off the mainland: Corpus
// Christi 52/82 in the bay, El Paso 87/162 across the Rio Grande, plus
// Rockport, Port Lavaca, Texarkana, Orange. The spawn loop now gates every
// candidate on `inTexas` and reject-and-resamples off a dedicated
// `contain:<city>` side stream, so building counts stay exactly the pre-fix
// totals while every building lands on the mainland.
//
// Caveat: containment detection is bounded by border.json's coastline
// resolution — a building can sit legitimately close to shore without being
// a false negative/positive here, but the six audited cities below were
// measured directly against the shipped mesh, not estimated.

const CITIES = [
  { name: 'Corpus Christi', count: 82 },
  { name: 'Rockport', count: 14 },
  { name: 'Port Lavaca', count: 14 },
  { name: 'El Paso', count: 162 },
  { name: 'Texarkana', count: 20 },
  { name: 'Orange', count: 16 },
];

export default async function cities(t) {
  for (const { name, count } of CITIES) {
    await t.check(`${name}: downtown spawns fully inside Texas, count preserved at ${count}`, async () => {
      const c = await t.ev(`g.GEO.cities.find((c) => c.name === '${name}')`);
      t.ok(c, `${name} missing from GEO.cities`);
      t.ok(await t.ev(`g.inTexas(${c.x}, ${c.z})`), `${name} city center itself is not inTexas — fallback premise broken`);

      await t.tp(c.x, c.z);
      await t.until(`g.cities.live.has('${name}')`, 10000);
      const d = await t.ev(`(() => {
        const b = g.cities.live.get('${name}').userData.buildings;
        return { n: b.length, outside: b.filter(([x, z]) => !g.inTexas(x, z)).length };
      })()`);
      t.ok(d.outside === 0, `${name}: ${d.outside}/${d.n} buildings still fail inTexas`);
      t.ok(d.n === count, `${name}: building count ${d.n} != audited total ${count} — resample changed the count`);
    });
  }
}
