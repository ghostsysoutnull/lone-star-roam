// Cities tab UX: search filter, 3-way sort (population/nearest/A–Z), and the
// distance+population subline — all scoped to the Cities tab; other tabs
// (Jobs/Shop/...) must render unaffected by city search/sort state. Airports
// tab: same search/sort/distance treatment, but scoped to only the towered
// fields actually logged in save.airports (radio.js's playerFlow only stamps
// tier-1 fields) — no population-equivalent sort, and an empty logbook is
// the common case that needs its own hint.
// Also the menu's two input laws: keystrokes in the search field never reach the
// window-level hotkeys (typing a city name used to fire them), and an open menu
// freezes the world — via every close path, fast travel's included.

const cityTab = (t) => t.ev(`(g.travel.tab = 'Cities', g.travel.render(), true)`);
const airportTab = (t) => t.ev(`(g.travel.tab = 'Airports', g.travel.render(), true)`);

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

  await t.check('non-poi tabs: toolbar hidden, city filter state does not leak in', async () => {
    const r = await t.ev(`(() => {
      g.travel.citySearch = 'Austin';
      g.travel.tab = 'Jobs';
      g.travel.render();
      const jobsHidden = document.querySelector('#travel .poi-toolbar').style.display === 'none';
      g.travel.tab = 'Shop';
      g.travel.render();
      const shopHidden = document.querySelector('#travel .poi-toolbar').style.display === 'none';
      g.travel.tab = 'Airports';
      g.travel.render();
      const airportsVisible = document.querySelector('#travel .poi-toolbar').style.display === 'flex';
      return { jobsHidden, shopHidden, airportsVisible };
    })()`);
    t.ok(r.jobsHidden, 'toolbar visible on the Jobs tab');
    t.ok(r.shopHidden, 'toolbar visible on the Shop tab');
    t.ok(r.airportsVisible, 'toolbar hidden on the Airports tab');
    await t.ev(`(g.travel.citySearch = '', g.travel.tab = 'Cities', g.travel.render())`);
  });

  await t.check('airports: empty logbook shows nothing and a how-to hint', async () => {
    await t.ev(`(g.gameplay.save.airports = [], true)`);
    await airportTab(t);
    const r = await t.ev(`(() => ({
      n: g.travel.current.length,
      hint: document.querySelector('#travel .hint').textContent,
      summary: document.querySelector('#travel .poi-list').firstElementChild?.textContent ?? '',
    }))()`);
    t.ok(r.n === 0, `${r.n} airports rendered with an empty logbook, expected 0`);
    t.ok(r.hint.includes('logbook'), `hint text: "${r.hint}"`);
    t.ok(r.summary.includes('0/7'), `summary line: "${r.summary}"`);
  });

  await t.check('airports: only logged towered fields appear, never a regional/small field', async () => {
    await t.ev(`(g.gameplay.save.airports = ['DFW', 'AUS'], true)`);
    await airportTab(t);
    const r = await t.ev(`(() => {
      const names = g.travel.current.map((a) => a.name).sort();
      const expect = g.AIRPORTS.filter((a) => ['DFW', 'AUS'].includes(a.id)).map((a) => a.name).sort();
      const allTier1 = g.travel.current.every((a) => g.AIRPORTS.find((x) => x.name === a.name)?.tier === 1);
      return { n: g.travel.current.length, names, expect, allTier1 };
    })()`);
    t.ok(r.n === 2, `${r.n} airports rendered for 2 logged ids, expected 2`);
    t.ok(JSON.stringify(r.names) === JSON.stringify(r.expect), `names ${JSON.stringify(r.names)} != ${JSON.stringify(r.expect)}`);
    t.ok(r.allTier1, 'a non-towered field slipped into the Airports tab');
  });

  await t.check('airports: sort — nearest ascending and A–Z, scoped to logged fields only', async () => {
    await t.tp(-2767, 334); // empty I-10 west stretch — deterministic reference point
    await t.ev(`(g.gameplay.save.airports = ['DFW', 'AUS', 'ELP', 'SAT'], true)`);
    await airportTab(t);
    const r = await t.ev(`(() => {
      g.travel.airportSort = 'dist';
      g.travel.render();
      const dist = g.travel.current.map((a) => Math.hypot(a.at[0] - g.player.pos.x, a.at[1] - g.player.pos.z));
      let distOk = true;
      for (let i = 1; i < dist.length; i++) if (dist[i - 1] - dist[i] > 1e-6) distOk = false;

      g.travel.airportSort = 'az';
      g.travel.render();
      const az = g.travel.current.map((a) => a.name);
      let azOk = true;
      for (let i = 1; i < az.length; i++) if (az[i - 1].localeCompare(az[i]) > 0) azOk = false;

      return { n: g.travel.current.length, distOk, azOk };
    })()`);
    t.ok(r.n === 4, `${r.n} logged airports rendered, expected 4`);
    t.ok(r.distOk, 'dist sort is not distance-ascending from the player');
    t.ok(r.azOk, 'az sort is not alphabetically ascending');
    await t.ev(`(g.travel.airportSort = 'dist', g.travel.render())`);
  });

  await t.check('airport button shows a city + distance subline', async () => {
    await t.tp(-2767, 334);
    await t.ev(`(g.gameplay.save.airports = ['ELP'], true)`); // sole logged field — current[0] is guaranteed ELP
    await airportTab(t);
    const r = await t.ev(`(() => {
      g.travel.render();
      const a = g.travel.current[0];
      const expectKm = Math.hypot(a.at[0] - g.player.pos.x, a.at[1] - g.player.pos.z) * 0.1;
      return { meta: a.meta, expectKm };
    })()`);
    const parts = r.meta.split(' · ');
    t.ok(parts.length === 2, `subline malformed: "${r.meta}"`);
    t.ok(parts[0] === 'El Paso', `city figure malformed: "${parts[0]}"`);
    t.ok(/^\d+(\.\d+)?\s*km$/.test(parts[1]), `distance figure malformed: "${parts[1]}"`);
    const shownKm = parseFloat(parts[1]);
    t.near(shownKm, r.expectKm, 1, 'displayed distance vs. straight-line distance');
  });

  await t.check('airports: search filters the logged set by name, empty query restores it', async () => {
    await t.ev(`(g.gameplay.save.airports = ['DFW', 'DAL', 'AUS'], true)`);
    await airportTab(t);
    const total = await t.ev('g.travel.current.length');
    t.ok(total === 3, `${total} logged airports rendered, expected 3`);
    const r = await t.ev(`(() => {
      g.travel.airportSearch = 'Dallas';
      g.travel.render();
      const names = g.travel.current.map((a) => a.name);
      return { n: names.length, allMatch: names.every((n) => n.toLowerCase().includes('dallas')) };
    })()`); // DFW ("Dallas–Fort Worth Intl") + DAL ("Dallas Love Field")
    t.ok(r.n === 2 && r.allMatch, `search "Dallas" returned ${r.n} rows, allMatch=${r.allMatch}`);
    const restored = await t.ev(`(() => { g.travel.airportSearch = ''; g.travel.render(); return g.travel.current.length; })()`);
    t.ok(restored === 3, `clearing search left ${restored} rows, expected 3`);
  });

  await t.check('airports: no match on a non-empty logbook uses the search hint, not the empty-logbook one', async () => {
    await t.ev(`(g.gameplay.save.airports = ['DFW'], true)`);
    await airportTab(t);
    const r = await t.ev(`(() => {
      g.travel.airportSearch = 'zzzznotanairport';
      g.travel.render();
      return { n: g.travel.current.length, hint: document.querySelector('#travel .hint').textContent };
    })()`);
    t.ok(r.n === 0, `${r.n} rows matched a nonsense query, expected 0`);
    t.ok(r.hint.includes('No logged airports match'), `hint text: "${r.hint}"`);
    await t.ev(`(g.travel.airportSearch = '', g.travel.render())`);
  });

  await t.check('cross-tab: airport search/sort do not leak into Cities and vice versa', async () => {
    const r = await t.ev(`(() => {
      g.gameplay.save.airports = ['DFW', 'DAL'];
      g.travel.citySearch = 'Austin';
      g.travel.citySort = 'az';
      g.travel.airportSearch = 'Love';
      g.travel.airportSort = 'az';

      g.travel.tab = 'Cities';
      g.travel.render();
      const cityNames = g.travel.current.map((c) => c.name);
      const cityUnaffected = cityNames.length >= 1 && cityNames.every((n) => n.toLowerCase().includes('austin'));

      g.travel.tab = 'Airports';
      g.travel.render();
      const airportNames = g.travel.current.map((a) => a.name);
      const airportFiltered = airportNames.length === 1 && airportNames[0].toLowerCase().includes('love');

      return { cityUnaffected, airportFiltered };
    })()`);
    t.ok(r.cityUnaffected, 'airport search leaked into the Cities list');
    t.ok(r.airportFiltered, 'airport search/sort not applied on the Airports tab');
    await t.ev(`(g.travel.citySearch = '', g.travel.airportSearch = '', g.travel.tab = 'Cities', g.gameplay.save.airports = [], g.travel.render())`);
  });

  // The hotkeys are window-level keydown listeners, so keystrokes in the search
  // field bubbled straight into them: typing "Paris" toggled the menu shut,
  // "Amarillo" steered the truck, "Vega" cycled drive mode. travel.js stops
  // propagation at the field — Escape alone still bubbles, so it closes the menu.
  await t.check('search field swallows the hotkeys — typing a city name is inert', async () => {
    await t.tp(-2767, 334); // empty I-10 stretch: nothing ambient to perturb the truck
    await t.key('KeyP');
    t.ok((await t.ev(`g.travel.el.style.display`)) === 'flex', 'travel menu did not open');
    // "Vega, TX" spells three hotkeys on its own: V (mode), E (interact), A (steer)
    const r = await t.ev(`(() => {
      const el = g.travel.searchInput, mode0 = g.player.mode;
      el.focus();
      for (const code of ['KeyP', 'KeyV', 'KeyM', 'KeyA'])
        el.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
      return { disp: g.travel.el.style.display, mode: g.player.mode, mode0,
               map: g.hud.big.style.display, steer: !!g.player.keys['KeyA'] };
    })()`);
    t.ok(r.disp === 'flex', 'typing P in the search field closed the menu');
    t.ok(r.mode === r.mode0, `typing V in the search field cycled mode to ${r.mode}`);
    t.ok(r.map !== 'block', 'typing M in the search field opened the big map');
    t.ok(r.steer === false, 'typing A in the search field steered the truck');
    // Escape is the deliberate exception: it must still reach main.js and close
    await t.ev(`(() => { const el = g.travel.searchInput; el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true })); })()`);
    t.ok((await t.ev(`g.travel.el.style.display`)) === 'none', 'Escape in the search field did not close the menu');
    // sentinel: the fix is scoped to the field — P on the window still toggles
    await t.key('KeyP');
    t.ok((await t.ev(`g.travel.el.style.display`)) === 'flex', 'global P hotkey no longer opens the menu');
    await t.key('KeyP');
    t.ok((await t.ev(`g.travel.el.style.display`)) === 'none', 'global P hotkey no longer closes the menu');
  });

  // Real-loop sentinel: player.simT is Σ dt inside player.update, which the main
  // loop skips while frozen. The menu freeze is silent — no PAUSED banner, and
  // isPaused() keeps meaning the Esc pause screen, not any frozen world.
  await t.check('open menu freezes the world, closing it resumes', async () => {
    await t.tp(-2767, 334);
    await t.key('KeyP');
    t.ok((await t.ev('g.isFrozen()')) === true, 'travel menu did not freeze the world');
    t.ok((await t.ev('g.isPaused()')) === false, 'travel menu raised the Esc pause state');
    t.ok((await t.ev(`g.hud.els.paused.style.display`)) === 'none', 'travel menu showed the PAUSED banner');
    const before = await t.ev('g.player.simT');
    await t.wait(1.5);
    const after = await t.ev('g.player.simT');
    t.near(after, before, 0.02, `simT advanced ${(after - before).toFixed(3)} while the menu was open`);
    // P reaches the handler despite the freeze — that is why pause carries a reason
    await t.key('KeyP');
    t.ok((await t.ev('g.isFrozen()')) === false, 'closing the menu left the world frozen');
    const runBefore = await t.ev('g.player.simT');
    await t.wait(1.5);
    t.ok((await t.ev('g.player.simT')) - runBefore > 0.1, 'loop still frozen after the menu closed');
  });

  // travel.go() closes the menu itself, so the freeze has to live in close(), not
  // at the P-key handler — otherwise fast travel strands you in a frozen world.
  await t.check('fast travel from the open menu leaves the world running', async () => {
    await t.tp(-2767, 334);
    await t.key('KeyP');
    t.ok((await t.ev('g.isFrozen()')) === true, 'travel menu did not freeze the world');
    await cityTab(t);
    await t.ev(`g.travel.go(g.travel.current.find((c) => c.name === 'Austin'))`);
    t.ok((await t.ev(`g.travel.el.style.display`)) === 'none', 'fast travel left the menu open');
    t.ok((await t.ev('g.isFrozen()')) === false, 'fast travel left the world frozen');
    const before = await t.ev('g.player.simT');
    await t.wait(1.5);
    t.ok((await t.ev('g.player.simT')) - before > 0.1, 'loop still frozen after fast travel');
  });
}
