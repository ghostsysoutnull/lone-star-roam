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
  constructor(player, gameplay, sky, onToast) {
    this.player = player;
    this.gameplay = gameplay;
    this.sky = sky;
    this.onToast = onToast;
    this.tab = 'Cities';
    this.el = document.getElementById('travel');
    this.el.querySelector('.tabs').addEventListener('click', (e) => {
      if (e.target.dataset.tab) { this.tab = e.target.dataset.tab; this.render(); }
    });
    this.el.querySelector('.poi-list').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (b && !b.disabled) this.go(this.current[+b.dataset.i]);
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
    const visited = new Set(this.gameplay.save.cities);
    const collected = new Set(this.gameplay.save.landmarks);
    if (this.tab === 'Cities') {
      this.current = [...GEO.cities].sort((a, b) => b.pop - a.pop)
        .map((c) => ({ name: c.name, at: [c.x, c.z], drive: true, locked: !visited.has(c.name), star: visited.has(c.name) }));
    } else if (this.tab === 'Landmarks') {
      this.current = LANDMARKS.map((l) => ({ name: l.name, at: l.at, fly: 15, star: collected.has(l.name) }));
    } else if (this.tab === 'Nature') {
      this.current = NATURE;
    } else {
      this.current = ICONS;
    }
    this.el.querySelector('.poi-list').innerHTML = this.current
      .map((p, i) => `<button data-i="${i}" ${p.locked ? 'disabled' : ''}>${p.star ? '⭐ ' : ''}${p.name}${p.locked ? ' 🔒' : ''}</button>`)
      .join('');
    this.el.querySelector('.hint').textContent =
      this.tab === 'Cities' ? 'Locked cities unlock as fast-travel once you visit them.' : 'Click to travel.';
  }

  go(poi) {
    const [x, z] = poi.at;
    const p = this.player;
    if (poi.night) {
      this.sky.t = 0.9; // ~21:36 — dark enough for the lights
      this.onToast?.('🌙 Arriving after dark…');
    }
    if (poi.fly) {
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
