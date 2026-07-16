// Travel menu (P): teleport to cities (fast-travel unlocks on first visit),
// landmarks, nature sights, and curated Texas icons. Each POI defines its
// arrival: cities land you on a road in drive mode, sights hover in fly mode.
import { GEO, nearestRoad } from './geo.js';
import { LANDMARKS } from './gameplay.js';
import { SHOP, ROMAN, PAINTS, PAINT_PRICE, buy, buyPaint, applyGear, gearLevel } from './shop.js';
import { TOWERED } from './radio.js';

// same projection as the data pipeline
const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];

const fmtPop = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : `${n}`;

const NATURE = [
  { name: 'Big Bend — Rio Grande canyon', at: LL(29.25, -103.25), fly: 45 },
  { name: 'Palo Duro Canyon rim', at: LL(34.94, -101.66), fly: 30 },
  { name: 'Enchanted Rock', at: LL(30.506, -98.82), fly: 18 },
  { name: 'Guadalupe Mountains', at: LL(31.9, -104.86), fly: 45 },
  { name: 'Lake Texoma', at: LL(33.9, -96.6), fly: 40 },
  { name: 'Amistad Reservoir', at: LL(29.5, -101.1), fly: 40 },
  { name: 'Toledo Bend Reservoir', at: LL(31.5, -93.75), fly: 40 },
  // W3: arrives ON the sand at Malaquite in DRIVE (the old coord flew you to
  // open water east of the island, which wasn't drawn as land yet anyway)
  { name: 'Gulf Coast — Padre Island', at: LL(27.4326, -97.2988), drive: true },
  { name: 'Galveston Bay', at: LL(29.35, -94.85), fly: 35 },
  { name: 'Piney Woods', at: LL(31.5, -94.4), drive: true },
];

const ICONS = [
  { name: '🛢 Pumpjack country (Permian Basin)', at: LL(31.85, -102.25), fly: 12 },
  { name: '🌀 Windmill plains (Panhandle)', at: LL(34.2, -101.6), drive: true },
  { name: '🌸 Bluebonnet roads (Hill Country)', at: LL(30.28, -98.85), drive: true },
  { name: '🐂 Longhorn ranchland', at: LL(31.0, -98.4), drive: true },
  { name: '🌵 Chihuahuan Desert drive', at: LL(30.6, -103.9), drive: true },
  { name: '🌉 Border river at Laredo', at: LL(27.55, -99.5), fly: 25 },
  { name: '👻 Marfa at night', at: LL(30.3095, -104.0207), drive: true, night: true },
  { name: '🏙 DFW Metroplex from above', at: LL(32.8, -97.05), fly: 90 },
  { name: '🛣 I-10 west — the long empty', at: LL(30.7, -102.4), drive: true },
];

export class TravelMenu {
  constructor(player, gameplay, sky, npcs, missions, dog, onToast, onChime, onFreeze) {
    this.player = player;
    this.gameplay = gameplay;
    this.sky = sky;
    this.npcs = npcs;
    this.missions = missions;
    this.dog = dog;
    this.onToast = onToast;
    this.onChime = onChime;
    this.onFreeze = onFreeze;
    this.tab = 'Cities';
    this.citySearch = '';
    this.citySort = 'pop';
    this.airportSearch = '';
    this.airportSort = 'dist';
    this.el = document.getElementById('travel');
    this.toolbar = this.el.querySelector('.poi-toolbar');
    this.searchInput = this.el.querySelector('#city-search');
    this.el.querySelector('.tabs').addEventListener('click', (e) => {
      if (e.target.dataset.tab) { this.tab = e.target.dataset.tab; this.render(); }
    });
    // The global hotkeys are window-level keydown listeners, so a keystroke in
    // this field bubbles up to them: typing "Paris" toggled this very menu shut,
    // "Fort Worth" fired a flare, "Amarillo" steered the truck. Swallow the lot
    // here — Escape alone keeps bubbling, so it still closes the menu. Relies on
    // every hotkey listener being bubble-phase; a capture-phase one would slip past.
    this.searchInput.addEventListener('keydown', (e) => { if (e.code !== 'Escape') e.stopPropagation(); });
    this.searchInput.addEventListener('input', () => {
      if (this.tab === 'Cities') this.citySearch = this.searchInput.value;
      else if (this.tab === 'Airports') this.airportSearch = this.searchInput.value;
      this.render();
    });
    this.toolbar.querySelector('.sort-btns').addEventListener('click', (e) => {
      if (!e.target.dataset.sort) return;
      if (this.tab === 'Cities') this.citySort = e.target.dataset.sort;
      else if (this.tab === 'Airports') this.airportSort = e.target.dataset.sort;
      this.render();
    });
    this.el.querySelector('.poi-list').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b || b.disabled) return;
      if (this.tab === 'Jobs') this.jobClick(b.dataset.i);
      else if (this.tab === 'Shop') this.buyItem(b.dataset.i);
      else this.go(this.current[+b.dataset.i]);
    });
  }

  // Opening freezes the world (main.js setPause('menu')) so the truck doesn't
  // keep rolling while you browse; every close path unfreezes, which is why the
  // freeze lives here and not at the P-key handler — fast travel closes the menu
  // from execute() below, and would otherwise leave the world frozen.
  toggle() {
    const open = this.el.style.display !== 'flex';
    this.el.style.display = open ? 'flex' : 'none';
    if (open) this.render();
    this.onFreeze?.(open);
    return open;
  }

  close() { this.el.style.display = 'none'; this.onFreeze?.(false); }

  render() {
    for (const t of this.el.querySelectorAll('.tabs button'))
      t.classList.toggle('active', t.dataset.tab === this.tab);
    const poiTab = this.tab === 'Cities' || this.tab === 'Airports';
    this.toolbar.style.display = poiTab ? 'flex' : 'none';
    if (poiTab) {
      const activeSearch = this.tab === 'Cities' ? this.citySearch : this.airportSearch;
      if (this.searchInput.value !== activeSearch) this.searchInput.value = activeSearch;
      this.searchInput.placeholder = this.tab === 'Cities' ? 'Search cities…' : 'Search your logbook…';
      const activeSort = this.tab === 'Cities' ? this.citySort : this.airportSort;
      const sortOpts = this.tab === 'Cities'
        ? [['pop', 'Population'], ['dist', 'Nearest'], ['az', 'A–Z']]
        : [['dist', 'Nearest'], ['az', 'A–Z']];
      this.toolbar.querySelector('.sort-btns').innerHTML = sortOpts
        .map(([k, label]) => `<button data-sort="${k}" class="${k === activeSort ? 'active' : ''}">${label}</button>`)
        .join('');
    }
    if (this.tab === 'Jobs') { this.renderJobs(); return; }
    if (this.tab === 'Shop') { this.renderShop(); return; }
    // teleporting with cargo aboard would gut the missions — lock travel mid-haul;
    // teleporting off a ferry mid-crossing would be worse — you'd leave the truck behind
    const hauling = this.missions?.job?.phase === 'haul' || this.player.aboardFerry;
    const visited = new Set(this.gameplay.save.cities);
    const collected = new Set(this.gameplay.save.landmarks);
    let cityFilterEmpty = false;
    let airportFilterEmpty = false;
    let airportLoggedCount = 0;
    if (this.tab === 'Cities') {
      const px = this.player.pos.x, pz = this.player.pos.z;
      const dist = (c) => Math.hypot(c.x - px, c.z - pz) * 0.1; // km — 1 game unit = 100 m
      const q = this.citySearch.trim().toLowerCase();
      let list = GEO.cities.filter((c) => !q || c.name.toLowerCase().includes(q));
      cityFilterEmpty = q && list.length === 0;
      if (this.citySort === 'dist') list = [...list].sort((a, b) => dist(a) - dist(b));
      else if (this.citySort === 'az') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
      else list = [...list].sort((a, b) => b.pop - a.pop);
      this.current = list.map((c) => ({
        name: c.name, at: [c.x, c.z], drive: true, locked: !visited.has(c.name), star: visited.has(c.name),
        meta: `${fmtPop(c.pop)} · ${dist(c).toFixed(0)} km`,
      }));
    } else if (this.tab === 'Airports') {
      const px = this.player.pos.x, pz = this.player.pos.z;
      const dist = (a) => Math.hypot(a.at[0] - px, a.at[1] - pz) * 0.1; // km
      const loggedIds = new Set(this.gameplay.save.airports);
      const logged = TOWERED.filter((a) => loggedIds.has(a.id));
      airportLoggedCount = logged.length;
      const q = this.airportSearch.trim().toLowerCase();
      let list = logged.filter((a) => !q || a.name.toLowerCase().includes(q));
      airportFilterEmpty = q && list.length === 0 && logged.length > 0;
      if (this.airportSort === 'az') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
      else list = [...list].sort((a, b) => dist(a) - dist(b));
      this.current = list.map((a) => ({ name: a.name, at: a.at, fly: 35, meta: `${a.city} · ${dist(a).toFixed(0)} km` }));
    } else if (this.tab === 'Landmarks') {
      this.current = LANDMARKS.map((l) => ({ name: l.name, at: l.at, fly: 15, star: collected.has(l.name) }));
    } else if (this.tab === 'Nature') {
      this.current = NATURE;
    } else if (this.tab === 'Folks') {
      // meet a character once you've visited their town
      const cityOf = (name) => GEO.cities.find((c) => Math.hypot(c.x - name.g.position.x, c.z - name.g.position.z) < 100)?.name ?? '';
      this.current = this.npcs.named.map((n) => {
        const city = cityOf(n);
        return {
          name: `${n.name} — ${city}`, at: [n.g.position.x, n.g.position.z],
          walkTo: n, locked: !visited.has(city),
        };
      });
    } else {
      this.current = ICONS;
    }
    const airportsSummary = this.tab === 'Airports'
      ? `<div style="grid-column:1/-1;font-size:1.3rem;opacity:.85;padding:2px 2px 4px">✈️ ${airportLoggedCount}/7 towered fields logged</div>`
      : '';
    this.el.querySelector('.poi-list').innerHTML = airportsSummary + this.current
      .map((p, i) => `<button data-i="${i}" ${p.locked || hauling ? 'disabled' : ''}>${p.star ? '⭐ ' : ''}${p.name}${p.locked ? ' 🔒' : ''}${p.meta ? `<br><small style="opacity:.7">${p.meta}</small>` : ''}</button>`)
      .join('');
    this.el.querySelector('.hint').textContent =
      this.player.aboardFerry ? '⛴️ Mid-crossing — fast travel again once you make land.'
      : hauling ? '📦 Cargo aboard — finish (or abandon) your delivery before fast-traveling.'
      : cityFilterEmpty ? `No cities match "${this.citySearch.trim()}".`
      : airportFilterEmpty ? `No logged airports match "${this.airportSearch.trim()}".`
      : this.tab === 'Airports' && airportLoggedCount === 0 ? 'Your logbook is empty — tune in and land at a towered field to stamp it.'
      : this.tab === 'Cities' ? 'Locked cities unlock as fast-travel once you visit them.'
      : this.tab === 'Folks' ? 'Meet the locals — you can drop in on anyone whose town you’ve visited.'
      : 'Click to travel.';
  }

  renderJobs() {
    const m = this.missions;
    const j = m.job;
    const money = `💵 $${(this.gameplay.save.bank ?? 0).toLocaleString()} · ${this.gameplay.save.jobsDone ?? 0} deliveries`;
    let html = `<div style="grid-column:1/-1;font-size:1.3rem;opacity:.85;padding:2px 2px 4px">${money}</div>`;
    if (j) {
      const label = j.kind === 'charter' ? j.manifest : j.cargo;
      const step = j.kind === 'charter'
        ? `land at <b>${j.phase === 'pickup' ? j.from : j.to}</b>`
        : j.phase === 'pickup' ? `load in <b>${j.from}</b>` : `deliver to <b>${j.to}</b>`;
      html += `<div style="grid-column:1/-1;background:#243046;border:1px solid rgba(255,211,92,.4);border-radius:8px;padding:10px 12px;font-size:1.3rem">
        ${j.icon} <b>${label}</b> — ${j.from} → ${j.to} · ${j.km} km · $${j.pay}${j.rush ? ' · 🔥 RUSH' : ''}<br>
        <span style="opacity:.75">Now: ${step}</span></div>`;
      html += `<button data-i="abandon" style="grid-column:1/-1">✖ Abandon this job</button>`;
    }
    html += m.offers
      .map((o, i) => {
        const label = o.kind === 'charter' ? o.manifest : o.cargo;
        return `<button data-i="${i}" ${j ? 'disabled' : ''}>${o.icon} <b>${label}</b> — ${o.from} → ${o.to}<br>
        <small style="opacity:.75">${o.km} km · $${o.pay}${o.rush ? ' · 🔥 RUSH (tight clock, +40% pay)' : ''}</small>${o.note ? `<br><small style="opacity:.55;font-style:italic">${o.note}</small>` : ''}</button>`;
      })
      .join('');
    this.el.querySelector('.poi-list').innerHTML = html;
    this.el.querySelector('.hint').textContent = j
      ? 'One haul at a time — deliver it or abandon it to take another.'
      : 'Take a job, load up at the origin, beat the clock. Road jobs pay a ×1.5 bonus for staying grounded; charter jobs need a real landing at both ends.';
  }

  jobClick(i) {
    if (i === 'abandon') this.missions.abandon();
    else this.missions.accept(this.missions.offers[+i]);
    this.render();
  }

  renderShop() {
    const save = this.gameplay.save;
    let html = `<div style="grid-column:1/-1;font-size:1.3rem;opacity:.85;padding:2px 2px 4px">💵 $${(save.bank ?? 0).toLocaleString()}</div>`;
    html += SHOP.map((item) => {
      const lvl = gearLevel(save, item.id);
      const maxed = lvl >= item.prices.length;
      const multi = item.prices.length > 1;
      const owned = !lvl ? '' : multi ? ` ${ROMAN[lvl - 1]}` : ' ✔';
      const line = maxed ? (item.done ?? 'Fully upgraded') : item.tiers[lvl];
      const price = maxed ? '' : ` · $${item.prices[lvl]}`;
      const cant = maxed || save.bank < item.prices[lvl];
      return `<button data-i="${item.id}" ${cant ? 'disabled' : ''}>${item.icon} <b>${item.name}</b>${owned}<br>
        <small style="opacity:.75">${line}${price}</small></button>`;
    }).join('');
    // paint shop: repeatable — swatch row, the worn coat outlined
    const cur = save.gear.paint ?? 0;
    html += `<div style="grid-column:1/-1;background:#243046;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:8px 12px;font-size:1.3rem">
      🎨 <b>Paint shop</b> — $${PAINT_PRICE} a coat · wearing ${PAINTS[cur].name}<br>
      <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">${PAINTS.map((p, i) =>
        `<button data-i="paint:${i}" title="${p.name}" ${i === cur || save.bank < PAINT_PRICE ? 'disabled' : ''}
          style="width:2.8rem;height:2rem;padding:0;border-radius:5px;background:#${p.hex.toString(16).padStart(6, '0')};${i === cur ? 'outline:2px solid #ffd35c' : ''}"></button>`).join('')}
      </div></div>`;
    this.el.querySelector('.poi-list').innerHTML = html;
    this.el.querySelector('.hint').textContent =
      'Deliveries pay for upgrades — effects apply instantly and persist with your save.';
  }

  buyItem(id) {
    if (id.startsWith('paint:')) {
      const r = buyPaint(this.gameplay.save, +id.slice(6));
      if (!r) return;
      this.onToast?.(`🎨 Fresh coat of ${r.name} (−$${r.price})`);
    } else {
      const r = buy(this.gameplay.save, id);
      if (!r) return;
      const tier = r.item.prices.length > 1 ? ` ${ROMAN[r.lvl - 1]}` : '';
      this.onToast?.(id === 'dog'
        ? `🐕 Lacy hops in the bed — she's your dog now (−$${r.price})`
        : `${r.item.icon} ${r.item.name}${tier} installed (−$${r.price})`);
    }
    this.gameplay.persist();
    applyGear(this.gameplay.save, this.player, this.dog);
    this.onChime?.('buy');
    this.render();
  }

  go(poi) {
    const [x, z] = poi.at;
    const p = this.player;
    if (poi.night) {
      this.sky.t = 0.9; // ~21:36 — dark enough for the lights
      this.onToast?.('🌙 Arriving after dark…');
    }
    if (poi.walkTo) {
      // arrive on foot facing the character. Characters stand on road shoulders,
      // so the road itself is the guaranteed-clear spot to appear on.
      const n = poi.walkTo;
      const r = nearestRoad(n.g.position.x, n.g.position.z, 30);
      const stand = 2.6 + (n.g.scale.x - 1) * 1.8;
      let sx, sz;
      if (r) {
        // stand between the road point and the NPC, `stand` away from the NPC
        const dx = r.x - n.g.position.x, dz = r.z - n.g.position.z;
        const L = Math.hypot(dx, dz) || 1;
        sx = n.g.position.x + (dx / L) * stand;
        sz = n.g.position.z + (dz / L) * stand;
      } else {
        sx = n.g.position.x + stand * 0.7;
        sz = n.g.position.z + stand * 0.7;
      }
      p.setMode('WALK');
      p.pos.set(sx, 0, sz);
      p.heading = Math.atan2(sx - n.g.position.x, n.g.position.z - sz) + Math.PI;
      p.speed = 0;
    } else if (poi.fly) {
      p.setMode('FLY');
      p.pos.set(x, poi.fly, z + poi.fly * 1.2); // stand off south, looking north at the sight
      p.heading = 0;
      p.speed = 8;
    } else {
      p.setMode('DRIVE');
      const r = nearestRoad(x, z, 60);
      p.pos.set(r ? r.x : x, 0, r ? r.z : z);
      p.heading = Math.atan2(p.pos.x - x, z - p.pos.z) + Math.PI; // face the destination
      p.speed = 0;
    }
    this.close();
    if (!poi.night) this.onToast?.(`📍 ${poi.name.replace(/^[^\w]*\s/, '')}`);
  }
}
