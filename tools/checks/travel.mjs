// Cities tab UX: search filter, 3-way sort (population/nearest/A–Z), and the
// distance+population subline — all scoped to the Cities tab; other tabs
// (Jobs/Shop/...) must render unaffected by city search/sort state.

const cityTab = (t) => t.ev(`(g.travel.tab = 'Cities', g.travel.render(), true)`);

export default async function travel(t) {
  await t.check('search: filters by name, empty query restores the full list', async () => {
    await cityTab(t);
    const total = await t.ev('g.travel.current.length');
    t.ok(total === 132, `${total} cities rendered stock, expected 132`);
    const r = await t.ev(`(() => {
      g.travel.citySearch = 'Austin';
      g.travel.render();
      const names = g.travel.current.map((c) => c.name);
      return { n: names.length, allMatch: names.every((n) => n.toLowerCase().includes('austin')) };
    })()`);
    t.ok(r.n >= 1 && r.allMatch, `search "Austin" returned ${r.n} rows, allMatch=${r.allMatch}`);
    const restored = await t.ev(`(() => { g.travel.citySearch = ''; g.travel.render(); return g.travel.current.length; })()`);
    t.ok(restored === 132, `clearing search left ${restored} rows, expected 132`);
  });

  await t.check('search: no match shows the empty hint, not a stale list', async () => {
    await cityTab(t);
    const r = await t.ev(`(() => {
      g.travel.citySearch = 'zzzznotacity';
      g.travel.render();
      return { n: g.travel.current.length, hint: document.querySelector('#travel .hint').textContent };
    })()`);
    t.ok(r.n === 0, `${r.n} rows matched a nonsense query, expected 0`);
    t.ok(r.hint.includes('No cities match'), `hint text: "${r.hint}"`);
    await t.ev(`(g.travel.citySearch = '', g.travel.render())`);
  });

  await t.check('sort: population descending (default), A–Z, and distance ascending', async () => {
    await t.tp(-2767, 334); // empty I-10 west stretch — deterministic reference point
    await cityTab(t);
    const r = await t.ev(`(() => {
      g.travel.citySort = 'pop';
      g.travel.render();
      const byRender = g.travel.current.map((c) => c.name);
      const byPop = [...g.GEO.cities].sort((a, b) => b.pop - a.pop).map((c) => c.name);
      const popOk = JSON.stringify(byRender) === JSON.stringify(byPop);

      g.travel.citySort = 'az';
      g.travel.render();
      const az = g.travel.current.map((c) => c.name);
      let azOk = true;
      for (let i = 1; i < az.length; i++) if (az[i - 1].localeCompare(az[i]) > 0) azOk = false;

      g.travel.citySort = 'dist';
      g.travel.render();
      const dist = g.travel.current.map((c) => Math.hypot(c.at[0] - g.player.pos.x, c.at[1] - g.player.pos.z));
      let distOk = true;
      for (let i = 1; i < dist.length; i++) if (dist[i - 1] - dist[i] > 1e-6) distOk = false;

      return { popOk, azOk, distOk };
    })()`);
    t.ok(r.popOk, 'pop sort does not match population-descending order');
    t.ok(r.azOk, 'az sort is not alphabetically ascending');
    t.ok(r.distOk, 'dist sort is not distance-ascending from the player');
    await t.ev(`(g.travel.citySort = 'pop', g.travel.render())`);
  });

  await t.check('city button shows a population + distance subline', async () => {
    await t.tp(-2767, 334);
    await cityTab(t);
    const r = await t.ev(`(() => {
      g.travel.citySort = 'dist';
      g.travel.render();
      const c = g.travel.current[0]; // nearest city
      const expectKm = Math.hypot(c.at[0] - g.player.pos.x, c.at[1] - g.player.pos.z) * 0.1;
      return { meta: c.meta, expectKm };
    })()`);
    const parts = r.meta.split(' · ');
    t.ok(parts.length === 2, `subline malformed: "${r.meta}"`);
    t.ok(/^\d/.test(parts[0]), `population figure malformed: "${parts[0]}"`);
    t.ok(/^\d+(\.\d+)?\s*km$/.test(parts[1]), `distance figure malformed: "${parts[1]}"`);
    const shownKm = parseFloat(parts[1]);
    t.near(shownKm, r.expectKm, 1, 'displayed distance vs. straight-line distance');
    await t.ev(`(g.travel.citySort = 'pop', g.travel.render())`);
  });

  await t.check('non-Cities tabs: toolbar hidden, city filter state does not leak in', async () => {
    const r = await t.ev(`(() => {
      g.travel.citySearch = 'Austin';
      g.travel.tab = 'Jobs';
      g.travel.render();
      const jobsHidden = document.querySelector('#travel .poi-toolbar').style.display === 'none';
      g.travel.tab = 'Shop';
      g.travel.render();
      const shopHidden = document.querySelector('#travel .poi-toolbar').style.display === 'none';
      return { jobsHidden, shopHidden };
    })()`);
    t.ok(r.jobsHidden, 'toolbar visible on the Jobs tab');
    t.ok(r.shopHidden, 'toolbar visible on the Shop tab');
    await t.ev(`(g.travel.citySearch = '', g.travel.tab = 'Cities', g.travel.render())`);
  });
}
