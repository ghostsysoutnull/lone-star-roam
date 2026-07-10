// Travel menu (P): teleport to cities (fast-travel unlocks on first visit),
// landmarks, nature sights, and curated Texas icons. Each POI defines its
// arrival: cities land you on a road in drive mode, sights hover in fly mode.
import { GEO, nearestRoad } from './geo.js';
import { LANDMARKS } from './gameplay.js';

// same projection as the data pipeline
const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];

const NATURE = [
  { name: 'Big Bend — Rio Grande canyon', at: LL(29.25, -103.25), fly: 45 },
  { name: 'Palo Duro Canyon rim', at: LL(34.94, -101.66), fly: 30 },
  { name: 'Enchanted Rock', at: LL(30.506, -98.82), fly: 18 },
  { name: 'Guadalupe Mountains', at: LL(31.9, -104.86), fly: 45 },
  { name: 'Lake Texoma', at: LL(33.9, -96.6), fly: 40 },
  { name: 'Amistad Reservoir', at: LL(29.5, -101.1), fly: 40 },
  { name: 'Toledo Bend Reservoir', at: LL(31.5, -93.75), fly: 40 },
  { name: 'Gulf Coast — Padre Island', at: LL(26.6, -97.28), fly: 35 },
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
  constructor(player, gameplay, sky, npcs, missions, onToast) {
    this.player = player;
    this.gameplay = gameplay;
    this.sky = sky;
    this.npcs = npcs;
    this.missions = missions;
    this.onToast = onToast;
    this.tab = 'Cities';
    this.el = document.getElementById('travel');
    this.el.querySelector('.tabs').addEventListener('click', (e) => {
      if (e.target.dataset.tab) { this.tab = e.target.dataset.tab; this.render(); }
    });
    this.el.querySelector('.poi-list').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b || b.disabled) return;
      if (this.tab === 'Jobs') this.jobClick(b.dataset.i);
      else this.go(this.current[+b.dataset.i]);
    });
  }

  toggle() {
    const open = this.el.style.display !== 'flex';
    this.el.style.display = open ? 'flex' : 'none';
    if (open) this.render();
    return open;
  }

  close() { this.el.style.display = 'none'; }

  render() {
    for (const t of this.el.querySelectorAll('.tabs button'))
      t.classList.toggle('active', t.dataset.tab === this.tab);
    if (this.tab === 'Jobs') { this.renderJobs(); return; }
    // teleporting with cargo aboard would gut the missions — lock travel mid-haul
    const hauling = this.missions?.job?.phase === 'haul';
    const visited = new Set(this.gameplay.save.cities);
    const collected = new Set(this.gameplay.save.landmarks);
    if (this.tab === 'Cities') {
      this.current = [...GEO.cities].sort((a, b) => b.pop - a.pop)
        .map((c) => ({ name: c.name, at: [c.x, c.z], drive: true, locked: !visited.has(c.name), star: visited.has(c.name) }));
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
    this.el.querySelector('.poi-list').innerHTML = this.current
      .map((p, i) => `<button data-i="${i}" ${p.locked || hauling ? 'disabled' : ''}>${p.star ? '⭐ ' : ''}${p.name}${p.locked ? ' 🔒' : ''}</button>`)
      .join('');
    this.el.querySelector('.hint').textContent =
      hauling ? '📦 Cargo aboard — finish (or abandon) your delivery before fast-traveling.'
      : this.tab === 'Cities' ? 'Locked cities unlock as fast-travel once you visit them.'
      : this.tab === 'Folks' ? 'Meet the locals — you can drop in on anyone whose town you’ve visited.'
      : 'Click to travel.';
  }

  renderJobs() {
    const m = this.missions;
    const j = m.job;
    const money = `💵 $${(this.gameplay.save.bank ?? 0).toLocaleString()} · ${this.gameplay.save.jobsDone ?? 0} deliveries`;
    let html = `<div style="grid-column:1/-1;font-size:13px;opacity:.85;padding:2px 2px 4px">${money}</div>`;
    if (j) {
      const step = j.phase === 'pickup' ? `load in <b>${j.from}</b>` : `deliver to <b>${j.to}</b>`;
      html += `<div style="grid-column:1/-1;background:#243046;border:1px solid rgba(255,211,92,.4);border-radius:8px;padding:10px 12px;font-size:13px">
        ${j.icon} <b>${j.cargo}</b> — ${j.from} → ${j.to} · ${j.km} km · $${j.pay}${j.rush ? ' · 🔥 RUSH' : ''}<br>
        <span style="opacity:.75">Now: ${step}</span></div>`;
      html += `<button data-i="abandon" style="grid-column:1/-1">✖ Abandon this job</button>`;
    }
    html += m.offers
      .map((o, i) => `<button data-i="${i}" ${j ? 'disabled' : ''}>${o.icon} <b>${o.cargo}</b> — ${o.from} → ${o.to}<br>
        <small style="opacity:.75">${o.km} km · $${o.pay}${o.rush ? ' · 🔥 RUSH (tight clock, +40% pay)' : ''}</small></button>`)
      .join('');
    this.el.querySelector('.poi-list').innerHTML = html;
    this.el.querySelector('.hint').textContent = j
      ? 'One haul at a time — deliver it or abandon it to take another.'
      : 'Take a job, load up at the origin, beat the clock. Stay out of the air for a ×1.5 road bonus; late pays half.';
  }

  jobClick(i) {
    if (i === 'abandon') this.missions.abandon();
    else this.missions.accept(this.missions.offers[+i]);
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
