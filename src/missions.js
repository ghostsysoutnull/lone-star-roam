// Delivery missions: a job board in the travel menu offers hauls between real
// cities. Drive to the origin to load, then beat the deadline to the destination.
// Cargo rides visibly in the truck bed; staying out of the air the whole haul
// pays a x1.5 road bonus, blowing the deadline halves the payout. Bankroll and
// the active job live in the save (new keys only — rose RNG untouched).
import { GEO } from './geo.js';
import { cityRadius } from './cities.js';

// Texas-flavored cargo; `from` lists preferred origins (must be real GEO city names)
const CARGO = [
  { name: 'Smoked brisket', icon: '🍖', from: ['Llano', 'Austin', 'Temple'] },
  { name: 'Cowboy boots', icon: '👢', from: ['El Paso', 'Fort Worth'] },
  { name: 'Drilling pipe', icon: '🛢', from: ['Midland', 'Odessa', 'Houston'] },
  { name: 'Longhorn cattle', icon: '🐂', from: ['Fort Worth', 'San Angelo', 'Amarillo'] },
  { name: 'Ruby red grapefruit', icon: '🍊', from: ['McAllen', 'Harlingen', 'Mission'] },
  { name: 'Gulf shrimp on ice', icon: '🦐', from: ['Galveston', 'Corpus Christi', 'Port Arthur'] },
  { name: 'Server racks', icon: '🖥', from: ['Austin', 'Dallas', 'Plano'] },
  { name: 'Rodeo gear', icon: '🤠', from: ['Fort Worth', 'San Antonio'] },
  { name: 'Hill Country peaches', icon: '🍑', from: ['Fredericksburg'] },
  { name: 'Hot sauce pallets', icon: '🌶', from: ['San Antonio', 'Austin'] },
  { name: 'Turbine blades', icon: '🌀', from: ['Sweetwater', 'Lubbock', 'Abilene'] },
  { name: 'Pecan sacks', icon: '🥧', from: ['Waco', 'Brownwood'] },
  { name: 'Hay bales', icon: '🌾' },
  { name: 'Watermelons', icon: '🍉' },
  { name: 'Fireworks', icon: '🎆' },
  { name: 'Bluebonnet honey', icon: '🍯' },
];

const fmt = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

export class MissionSystem {
  constructor(gameplay, player, onToast, onChime) {
    this.gp = gameplay;
    this.save = gameplay.save;
    this.player = player;
    this.onToast = onToast;
    this.onChime = onChime;
    this.checkT = 0;
    this.offers = this.genOffers();
    // restore a mid-haul crate after reload
    this.crate(this.job?.phase === 'haul');
  }

  get job() { return this.save.job; }
  city(name) { return GEO.cities.find((c) => c.name === name); }
  crate(on) { this.player.truck.userData.cargo.visible = !!on; }

  // 4 offers: short / medium / long haul + a wildcard. Regenerated per delivery.
  genOffers() {
    const bands = [[250, 1000], [1000, 2800], [2800, 7000], [250, 7000]];
    const offers = [];
    for (const [lo, hi] of bands) {
      for (let tries = 0; tries < 30; tries++) {
        const cargo = CARGO[Math.floor(Math.random() * CARGO.length)];
        // preferred origins when the cargo has them; otherwise bias near the player
        let pool = (cargo.from ?? []).map((n) => this.city(n)).filter(Boolean);
        if (!pool.length)
          pool = [...GEO.cities]
            .sort((a, b) => Math.hypot(a.x - this.player.pos.x, a.z - this.player.pos.z) - Math.hypot(b.x - this.player.pos.x, b.z - this.player.pos.z))
            .slice(0, 15);
        const from = pool[Math.floor(Math.random() * pool.length)];
        const dests = GEO.cities.filter((c) => {
          const d = Math.hypot(c.x - from.x, c.z - from.z);
          return c !== from && d >= lo && d <= hi;
        });
        if (!dests.length) continue;
        const to = dests[Math.floor(Math.random() * dests.length)];
        if (offers.some((o) => o.from === from.name && o.to === to.name)) continue;
        const dist = Math.hypot(to.x - from.x, to.z - from.z);
        const rush = Math.random() < 0.25;
        offers.push({
          cargo: cargo.name, icon: cargo.icon, from: from.name, to: to.name,
          km: Math.round(dist * 0.1), rush,
          pay: Math.round((50 + dist * 0.1 * 1.2 * (rush ? 1.4 : 1)) / 5) * 5,
          // tuned for driving: ~20% slack over a motorway pace, tighter on rush jobs
          deadline: Math.round((dist / 24 + 60) * (rush ? 0.75 : 1)),
        });
        break;
      }
    }
    return offers;
  }

  accept(offer) {
    if (this.job) return;
    this.save.job = { ...offer, phase: 'pickup', left: offer.deadline, flew: false };
    this.gp.persist();
    this.onToast?.(`📦 Job taken — load ${offer.icon} ${offer.cargo} in ${offer.from}`);
  }

  abandon() {
    if (!this.job) return;
    const j = this.job;
    this.save.job = null;
    this.crate(false);
    this.gp.persist();
    this.offers = this.genOffers();
    this.onToast?.(`📦 ${j.cargo} job abandoned`);
  }

  update(dt, pos, mode, agl) {
    const j = this.job;
    if (!j) return;
    if (j.phase === 'haul') {
      if (mode === 'FLY' && !j.flew) {
        j.flew = true;
        this.onToast?.('✈️ Cargo went airborne — road bonus lost');
      }
      const wasLate = j.left <= 0;
      j.left -= dt;
      if (!wasLate && j.left <= 0) this.onToast?.('⏱ Deadline blown — delivery pays half now');
    }
    // arrival checks a few times a second are plenty
    this.checkT += dt;
    if (this.checkT < 0.25) return;
    this.checkT = 0;
    if (agl > 12) return; // must be on (or near) the ground, same as city visits
    const tgt = this.city(j.phase === 'pickup' ? j.from : j.to);
    if (!tgt) { this.save.job = null; return; } // stale save from a renamed city
    const d = Math.hypot(tgt.x - pos.x, tgt.z - pos.z);
    if (d < Math.max(6, cityRadius(tgt.pop) * 0.5)) {
      if (j.phase === 'pickup') this.load(j);
      else this.deliver(j);
    }
  }

  load(j) {
    j.phase = 'haul';
    j.left = j.deadline;
    j.flew = false;
    this.crate(true);
    this.gp.persist();
    this.onToast?.(`${j.icon} ${j.cargo} loaded! ${j.to} in ⏱ ${fmt(j.deadline)}${j.rush ? ' — 🔥 rush job' : ''}`);
    this.onChime?.('load');
  }

  deliver(j) {
    const late = j.left <= 0;
    const bonus = !j.flew;
    const payout = Math.round((j.pay * (late ? 0.5 : 1) * (bonus ? 1.5 : 1)) / 5) * 5;
    this.save.bank += payout;
    this.save.jobsDone += 1;
    this.save.job = null;
    this.crate(false);
    this.gp.persist();
    this.offers = this.genOffers();
    const notes = [bonus && '×1.5 road bonus', late && 'late — half pay'].filter(Boolean).join(', ');
    this.onToast?.(`💵 ${j.cargo} delivered! +$${payout}${notes ? ` (${notes})` : ''}`);
    this.onChime?.('cash');
  }

  // one line + map target for the HUD (null when idle)
  hudInfo(pos) {
    const j = this.job;
    if (!j) return null;
    const tgt = this.city(j.phase === 'pickup' ? j.from : j.to);
    if (!tgt) return null;
    const km = Math.round(Math.hypot(tgt.x - pos.x, tgt.z - pos.z) * 0.1);
    if (j.phase === 'pickup')
      return { text: `📦 load ${j.icon} ${j.cargo} in ${j.from} · ${km} km`, late: false, target: [tgt.x, tgt.z] };
    const late = j.left <= 0;
    return {
      text: `${j.icon} ${j.cargo} → ${j.to} · ${km} km · ${late ? '⏱ LATE' : '⏱ ' + fmt(j.left)}${j.rush ? ' 🔥' : ''}`,
      late, urgent: !late && j.left < 45, target: [tgt.x, tgt.z],
    };
  }
}
