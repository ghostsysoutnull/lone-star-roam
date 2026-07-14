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
}
