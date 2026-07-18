// Energy — Wave 1: 8-layer Overpass bake (build-energy.mjs -> data/energy.json)
// + geo.js energyAt accessor. Pure data-truth checks, no player movement —
// assert numbers straight out of GEO.energy/energyAt, not pixels.

const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos(31 * Math.PI / 180) / 100, -(lat - 31) * 111320 / 100];

export default async function energy(t) {
  await t.check('bake join: GEO.energy.counties has exactly 254 counties (ag idiom, all present even at wells:0)', async () => {
    const n = await t.ev(`Object.keys(g.GEO.energy.counties).length`);
    t.ok(n === 254, `expected 254 counties, got ${n}`);
  });

  await t.check('Permian Basin: Midland county reads dense well density', async () => {
    const [x, z] = LL(31.9973, -102.0779); // Midland, TX — Midland county seat
    const rec = await t.ev(`g.energyAt(${x}, ${z})`);
    t.ok(rec && rec.wellKm2 > 0.5, `Midland wellKm2 not dense: ${JSON.stringify(rec)}`);
  });

  await t.check('Trans-Pecos: Terrell county (Sanderson) has zero wells', async () => {
    const [x, z] = LL(30.1421, -102.4088); // Sanderson, TX — Terrell county seat
    const rec = await t.ev(`g.energyAt(${x}, ${z})`);
    t.ok(rec && rec.wells === 0 && rec.wellKm2 === 0, `Terrell not near-zero: ${JSON.stringify(rec)}`);
  });

  await t.check('outside Texas: energyAt returns null far off the border (New Orleans)', async () => {
    const [x, z] = LL(29.9511, -90.0715); // New Orleans, LA
    const rec = await t.ev(`g.energyAt(${x}, ${z})`);
    t.ok(rec === null, `expected null outside Texas, got ${JSON.stringify(rec)}`);
  });

  await t.check('wind: Roscoe and Horse Hollow both survive clustering into a real wind farm', async () => {
    const [rx, rz] = LL(32.45, -100.54); // Roscoe
    const [hx, hz] = LL(32.19, -100.05); // Horse Hollow
    const near = await t.ev(`(() => {
      const nearest = (x, z) => g.GEO.energy.windFarms.reduce((best, f) => {
        const d = Math.hypot(f.x - x, f.z - z);
        return (!best || d < best.d) ? { d, f } : best;
      }, null);
      const r = nearest(${rx}, ${rz});
      const h = nearest(${hx}, ${hz});
      return { rd: r.d, rr: r.f.r, rcount: r.f.count, hd: h.d, hr: h.f.r, hcount: h.f.count };
    })()`);
    t.ok(near.rd < near.rr, `Roscoe point (${near.rd.toFixed(1)}u away) falls outside its nearest farm's radius (${near.rr})`);
    t.ok(near.rcount > 100, `Roscoe's nearest farm cluster too small: ${near.rcount} turbines`);
    t.ok(near.hd < near.hr, `Horse Hollow point (${near.hd.toFixed(1)}u away) falls outside its nearest farm's radius (${near.hr})`);
    t.ok(near.hcount > 100, `Horse Hollow's nearest farm cluster too small: ${near.hcount} turbines`);
  });

  await t.check('refineries: all 22 real Texas refineries baked', async () => {
    const n = await t.ev(`g.GEO.energy.refineries.length`);
    t.ok(n === 22, `expected 22 refineries, got ${n}`);
  });

  await t.check('offshore: platforms[] has a beyond-state-waters major (inStateWater, not longitude)', async () => {
    const found = await t.ev(`(() => {
      const majors = g.GEO.energy.platforms.filter((p) => p.tier === 'major');
      const far = majors.find((p) => !g.inStateWater(p.x, p.z));
      return { majorCount: majors.length, far: far ? { x: far.x, z: far.z, operator: far.operator || null } : null };
    })()`);
    t.ok(found.majorCount > 0, 'no major-tier platforms baked');
    t.ok(found.far, 'no major platform sits beyond state waters');
  });

  await t.check('fairways: snap-points present for the hand-laid lane\'s port approaches', async () => {
    const fairways = await t.ev(`g.GEO.energy.fairways`);
    t.ok(fairways.length > 0, 'no fairways baked');
    t.ok(fairways.every((f) => f.pts && f.pts.length > 0), 'a fairway has no points');
  });

  await t.check('transmission: lines345 non-empty with a corridor reaching the Panhandle', async () => {
    const found = await t.ev(`(() => {
      const n = g.GEO.energy.lines345.length;
      const reachesPanhandle = g.GEO.energy.lines345.some((l) => l.pts.some((p) => p[1] < -4000));
      return { n, reachesPanhandle };
    })()`);
    t.ok(found.n > 0, 'no 345kV corridors baked');
    t.ok(found.reachesPanhandle, 'no corridor reaches the Panhandle (z < -4000)');
  });
}
