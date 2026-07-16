// Delivery missions: a job board in the travel menu offers hauls between real
// cities. Drive to the origin to load, then beat the deadline to the destination.
// Cargo rides visibly in the truck bed; staying out of the air the whole haul
// pays a x1.5 road bonus, blowing the deadline halves the payout. Bankroll and
// the active job live in the save (new keys only — rose RNG untouched).
// Guidance: a diamond on the compass tape (hud.js) + a floating 3D arrow (G toggles).
import * as THREE from 'three';
import { GEO } from './geo.js';
import { cityRadius } from './cities.js';
import { AIRPORTS, onRunway, TD_AGL, TD_SPD } from './airports.js';
import { charterOfferTerms, groundOfferTerms, missionPayout } from './mission-rules.js';

const CHARTER_LIVERY = 0xe8a33d; // air-taxi accent, swapped in over the wings' stock color

// Texas-flavored cargo; `from` lists preferred origins and `to` preferred
// destinations — BOTH must be real GEO city names (settled call 2: the board
// points home, and an unresolvable name would orphan the job). `note` is the
// flavor line: Shoulder & Shelf W7 names the world across the line HERE and
// only here, so the endpoints stay Texan while the cargo remembers where it
// came from. Neither field is required; an absent `to` takes any city in band.
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
  { name: 'Bluebonnet honey', icon: '🍯' },
  // W7 — the board learns the Shoulder. Fireworks gained an origin this wave:
  // the Vinton stands are ten minutes over the Sabine precisely because Texas
  // cities won't sell them, so the cargo has a real home now.
  { name: 'Fireworks', icon: '🎆', from: ['Orange', 'Beaumont'],
    note: 'Bought at the Vinton stands, ten minutes over the Sabine — Texas towns won’t sell ’em. Drive it carefully.' },
  { name: 'Live crawfish', icon: '🦞', from: ['Orange', 'Beaumont', 'Port Arthur'],
    note: 'Sacked live out of the basin across the line. Keep the tarp damp — they ride angry.' },
  { name: 'Hatch chile', icon: '🌶', from: ['El Paso'],
    note: 'Roast season up the valley in Hatch. The whole trailer smells like September, and H-E-Buddy wanted it yesterday.' },
  { name: 'Turtle patrol volunteers', icon: '🐢', from: ['Houston', 'San Antonio', 'Austin'], to: ['Corpus Christi'],
    note: 'Dawn shift for the Malaquite nest walk. They have to be standing on the sand before first light.' },
  { name: 'Ferry gearbox', icon: '⚙️', from: ['Houston', 'Beaumont'], to: ['Galveston'],
    note: 'The Bolivar boat is running on one engine until this reaches the landing.' },
  { name: 'Far Rig crew change', icon: '👷', from: ['Houston', 'Beaumont'], to: ['Port Arthur'],
    note: 'Fourteen days out on the Far Rig. The crew boat leaves Sabine Pass on schedule, with them aboard or without.' },
];

// Charter manifests; `tier` restricts eligible origin airports (1/2 hubs vs
// the tier-3 strips) the same way CARGO's `from` biases ground-job origins.
const MANIFEST = [
  { name: 'Oil execs', icon: '🛢️' },
  { name: 'Wildcat drilling crew', icon: '⛽' },
  { name: 'Rodeo team & gear', icon: '🤠', tier: [1, 2] },
  { name: 'Show cattle for the state fair', icon: '🐄' },
  { name: 'Storm-chase photographers', icon: '📷' },
  { name: 'Marching band, championship bound', icon: '🎺' },
  { name: 'Marfa-Lights tourists', icon: '👽' },
  { name: 'Newlyweds eloping to Marfa', icon: '💍' },
  { name: 'Vet supplies for the ranch', icon: '💉', tier: [3] },
  { name: 'Line-camp grocery run', icon: '🛒', tier: [3] },
  { name: 'Ranch hand headed home', icon: '🤠', tier: [2, 3] },
];

// hand-curated real short-hop routes (AVIATION.md design stance); a small
// chance to appear in the wildcard band instead of a procedural pair
const REAL_ROUTES = [
  { a: 'DAL', b: 'HOU', manifest: 'Love–Hobby shuttle passengers', icon: '💼' },
  { a: 'DFW', b: 'LBB', manifest: 'Panhandle-bound passengers', icon: '💼' },
  { a: 'DFW', b: 'AMA', manifest: 'Panhandle-bound passengers', icon: '💼' },
  // W7 — the charters cross (settled call 2: airport-id resolution, Passport
  // stamp on the band landing). Curated because each pair is a real economic
  // tie the line runs straight through, not a procedural coincidence: the
  // Permian straddles the NM line, Shreveport's casinos were built for Texans,
  // Lubbock and Clovis share the Llano Estacado, and Texarkana's fair is
  // literally the Four States Fair. Band fields only — the military pair
  // (Cannon/Barksdale) stays flavor-only and takes no cargo.
  { a: 'MAF', b: 'HOB', manifest: 'Permian roughnecks, shift change', icon: '⛽' },
  { a: 'DAL', b: 'SHV', manifest: 'Casino-bound weekenders', icon: '🎰' },
  { a: 'LBB', b: 'CVN', manifest: 'Cotton buyers, Llano Estacado circuit', icon: '🌾' },
  { a: 'DFW', b: 'TXK', manifest: 'Four States Fair livestock judges', icon: '🐄' },
];
const CHARTER_BANDS = [[300, 1200], [1200, 3200], [3200, 8500], [300, 8500]];

// the npcs.js POOLS idiom — the board's content tables, exposed so the checks
// can assert every city/airport name resolves instead of trusting the spelling
export const POOLS = { CARGO, MANIFEST, REAL_ROUTES };

const fmt = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

export class MissionSystem {
  constructor(scene, gameplay, player, onToast, onChime) {
    this.gp = gameplay;
    this.save = gameplay.save;
    this.player = player;
    this.onToast = onToast;
    this.onChime = onChime;
    this.checkT = 0;
    this.t = 0;
    this.offers = this.genOffers();
    // restore a mid-haul crate after reload
    this.crate(this.job?.phase === 'haul');

    // floating guide arrow over the player, pointing at the current target
    this.arrowOn = localStorage.getItem('lonestar-arrow') !== 'off';
    this.arrowMat = new THREE.MeshLambertMaterial({ color: 0xffd35c, emissive: 0xbb8a1a, emissiveIntensity: 0.7, flatShading: true });
    this.arrow = new THREE.Group();
    this.arrow.add(
      new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.6, 8).rotateX(-Math.PI / 2), this.arrowMat),
      new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.0, 6).rotateX(Math.PI / 2).translate(0, 0, 1.2), this.arrowMat)
    );
    this.arrow.visible = false;
    scene.add(this.arrow);
  }

  toggleArrow() {
    this.arrowOn = !this.arrowOn;
    localStorage.setItem('lonestar-arrow', this.arrowOn ? 'on' : 'off');
    if (!this.arrowOn) this.arrow.visible = false;
    return this.arrowOn;
  }

  get job() { return this.save.job; }
  city(name) { return GEO.cities.find((c) => c.name === name); }
  field(id) { const a = AIRPORTS.find((x) => x.id === id); return a && { x: a.at[0], z: a.at[1], a }; }
  crate(on) { this.player.truck.userData.cargo.visible = !!on; }
  setLivery(on) {
    const w = this.player.wings.userData;
    w.mat.color.setHex(on ? CHARTER_LIVERY : w.stockColor);
  }

  // the job's current waypoint: a city for ground hauls, an airport for
  // charters — both shapes carry x/z so update()/hudInfo() stay kind-agnostic
  target(j) {
    return j.kind === 'charter' ? this.field(j.phase === 'pickup' ? j.fromId : j.toId)
      : this.city(j.phase === 'pickup' ? j.from : j.to);
  }

  genOffers() { return [...this.genGroundOffers(), ...this.genCharterOffers()]; }

  // 4 offers: short / medium / long haul + a wildcard. Regenerated per delivery.
  genGroundOffers() {
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
        const inBand = (list) => list.filter((c) => {
          const d = Math.hypot(c.x - from.x, c.z - from.z);
          return c !== from && d >= lo && d <= hi;
        });
        // A cargo that names its destination KEEPS it — falling back to a random
        // city would leave the note talking about the Malaquite nest walk on a
        // Houston→Beaumont run. Out of band ⇒ retry with another cargo (the loop
        // re-rolls), never break the fiction. Only preference-less cargo roams.
        const dests = inBand(cargo.to ? cargo.to.map((n) => this.city(n)).filter(Boolean) : GEO.cities);
        if (!dests.length) continue;
        const to = dests[Math.floor(Math.random() * dests.length)];
        if (offers.some((o) => o.from === from.name && o.to === to.name)) continue;
        const dist = Math.hypot(to.x - from.x, to.z - from.z);
        const rush = Math.random() < 0.25;
        offers.push({
          cargo: cargo.name, icon: cargo.icon, note: cargo.note ?? null, from: from.name, to: to.name,
          rush, ...groundOfferTerms(dist, rush),
        });
        break;
      }
    }
    return offers;
  }

  // 4 offers between airport pairs: short / medium / long / wildcard, same
  // shape as genGroundOffers(). The wildcard band occasionally hands out one
  // of the hand-curated real routes instead of a procedural pair.
  genCharterOffers() {
    const offers = [];
    for (let b = 0; b < CHARTER_BANDS.length; b++) {
      const [lo, hi] = CHARTER_BANDS[b];
      const curated = b === CHARTER_BANDS.length - 1 && Math.random() < 0.35;
      for (let tries = 0; tries < 30; tries++) {
        let from, to, manifest, icon;
        if (curated) {
          const r = REAL_ROUTES[Math.floor(Math.random() * REAL_ROUTES.length)];
          const [aid, bid] = Math.random() < 0.5 ? [r.a, r.b] : [r.b, r.a];
          from = AIRPORTS.find((x) => x.id === aid);
          to = AIRPORTS.find((x) => x.id === bid);
          manifest = r.manifest; icon = r.icon;
        } else {
          const m = MANIFEST[Math.floor(Math.random() * MANIFEST.length)];
          // military:true fields (Cannon/Barksdale) fly flavor only — no charter cargo
          const pool = (m.tier ? AIRPORTS.filter((a) => m.tier.includes(a.tier)) : AIRPORTS).filter((a) => !a.military);
          from = pool[Math.floor(Math.random() * pool.length)];
          const dests = AIRPORTS.filter((a) => {
            if (a.military) return false;
            const d = Math.hypot(a.at[0] - from.at[0], a.at[1] - from.at[1]);
            return a !== from && d >= lo && d <= hi;
          });
          if (!dests.length) continue;
          to = dests[Math.floor(Math.random() * dests.length)];
          manifest = m.name; icon = m.icon;
        }
        if (offers.some((o) => o.fromId === from.id && o.toId === to.id)) continue;
        const dist = Math.hypot(to.at[0] - from.at[0], to.at[1] - from.at[1]);
        const rush = Math.random() < 0.25;
        offers.push({
          kind: 'charter', manifest, icon, fromId: from.id, toId: to.id, from: from.name, to: to.name,
          rush, ...charterOfferTerms(dist, rush),
        });
        break;
      }
    }
    return offers;
  }

  // debug/test hook: inject a charter job for a specific airport pair
  // directly, bypassing genOffers()'s randomness — mirrors military.js's
  // force()/despawnAll idiom. Always built (not URL-gated); verify.mjs and
  // the debug menu both drive it the same way.
  force(fromId, toId) {
    if (this.job) return null;
    const from = AIRPORTS.find((a) => a.id === fromId), to = AIRPORTS.find((a) => a.id === toId);
    if (!from || !to) return null;
    const dist = Math.hypot(to.at[0] - from.at[0], to.at[1] - from.at[1]);
    const offer = {
      kind: 'charter', manifest: 'Test charter', icon: '✈️', fromId, toId, from: from.name, to: to.name,
      rush: false, ...charterOfferTerms(dist, false),
    };
    this.accept(offer);
    return offer;
  }

  accept(offer) {
    if (this.job) return;
    this.save.job = { ...offer, phase: 'pickup', left: offer.deadline, flew: false };
    this.gp.persist();
    if (offer.kind === 'charter') {
      this.setLivery(true);
      this.onToast?.(`✈️ Charter taken — fly to ${offer.from} and land to pick up ${offer.icon} ${offer.manifest}`);
    } else {
      this.onToast?.(`📦 Job taken — load ${offer.icon} ${offer.cargo} in ${offer.from}`);
    }
  }

  abandon() {
    if (!this.job) return;
    const j = this.job;
    this.save.job = null;
    if (j.kind === 'charter') this.setLivery(false); else this.crate(false);
    this.arrow.visible = false;
    this.gp.persist();
    this.offers = this.genOffers();
    const label = j.kind === 'charter' ? j.manifest : j.cargo;
    this.onToast?.(`${j.kind === 'charter' ? '✈️' : '📦'} ${label} job abandoned`);
  }

  update(dt, pos, mode, agl) {
    const j = this.job;
    if (!j) { this.arrow.visible = false; return; }
    const tgt = this.target(j);
    if (!tgt) { this.save.job = null; this.arrow.visible = false; return; } // stale save from a renamed city
    if (j.phase === 'haul') {
      if (j.kind !== 'charter' && mode === 'FLY' && !j.flew) {
        j.flew = true;
        this.onToast?.('✈️ Cargo went airborne — road bonus lost');
      }
      const wasLate = j.left <= 0;
      j.left -= dt;
      if (!wasLate && j.left <= 0) this.onToast?.('⏱ Deadline blown — delivery pays half now');
    }
    // guide arrow: hover over the player, yaw toward the target, bob gently
    this.t += dt;
    this.arrow.visible = this.arrowOn;
    if (this.arrowOn) {
      this.arrow.position.set(pos.x, pos.y + (mode === 'WALK' ? 3.2 : 4.6) + Math.sin(this.t * 2.2) * 0.25, pos.z);
      this.arrow.rotation.y = Math.atan2(-(tgt.x - pos.x), -(tgt.z - pos.z)); // heading convention: -z fwd
      this.arrowMat.color.setHex(j.phase === 'haul' && j.left <= 0 ? 0xff7a66 : 0xffd35c);
    }
    // arrival checks a few times a second are plenty
    this.checkT += dt;
    if (this.checkT < 0.25) return;
    this.checkT = 0;
    if (j.kind === 'charter') {
      // arrival = an actual touchdown (radio.js's own landing test), not
      // proximity — works at every field, unlike the towered-only save.airports
      // logbook, and "can't land a plane you aren't flying" (radio.js precedent)
      if (mode !== 'FLY' || agl >= TD_AGL || Math.abs(this.player.speed) >= TD_SPD || !onRunway(tgt.a, pos.x, pos.z, 1.5)) return;
      if (j.phase === 'pickup') this.load(j);
      else this.deliver(j);
      return;
    }
    if (agl > 12) return; // must be on (or near) the ground, same as city visits
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
    this.gp.persist();
    if (j.kind === 'charter') {
      this.onToast?.(`✈️ ${j.icon} ${j.manifest} aboard — logged in at ${j.from}. Next stop ${j.to} in ⏱ ${fmt(j.deadline)}${j.rush ? ' — 🔥 rush job' : ''}`);
    } else {
      this.crate(true);
      this.onToast?.(`${j.icon} ${j.cargo} loaded! ${j.to} in ⏱ ${fmt(j.deadline)}${j.rush ? ' — 🔥 rush job' : ''}`);
    }
    this.onChime?.('load');
  }

  // shared tail for both job kinds: pay out, bump the tally, clear the slot,
  // regenerate offers
  finishJob(payout, msg) {
    this.save.bank += payout;
    this.save.jobsDone += 1;
    this.save.job = null;
    this.arrow.visible = false;
    this.gp.persist();
    this.offers = this.genOffers();
    this.onToast?.(msg);
    this.onChime?.('cash');
  }

  deliver(j) {
    const late = j.left <= 0;
    const rig = this.player.perks?.cargoPay ?? 1; // Cargo rig upgrade, applied at payout
    if (j.kind === 'charter') {
      const payout = missionPayout(j.pay, rig, late);
      this.setLivery(false);
      const toField = AIRPORTS.find((a) => a.id === j.toId);
      if (toField?.band) this.gp.stampLanding(toField.id, toField.name);
      this.finishJob(payout, `💵 ${j.manifest} delivered to ${j.to}! +$${payout}${late ? ' (late — half pay)' : ''}`);
      return;
    }
    const bonus = !j.flew;
    const payout = missionPayout(j.pay, rig, late, bonus);
    this.crate(false);
    const notes = [bonus && '×1.5 road bonus', late && 'late — half pay'].filter(Boolean).join(', ');
    this.finishJob(payout, `💵 ${j.cargo} delivered! +$${payout}${notes ? ` (${notes})` : ''}`);
  }

  // one line + map target for the HUD (null when idle)
  hudInfo(pos) {
    const j = this.job;
    if (!j) return null;
    const tgt = this.target(j);
    if (!tgt) return null;
    const km = Math.round(Math.hypot(tgt.x - pos.x, tgt.z - pos.z) * 0.1);
    const label = j.kind === 'charter' ? j.manifest : j.cargo;
    if (j.phase === 'pickup')
      return {
        text: j.kind === 'charter' ? `${j.icon} land at ${j.from} to pick up ${label} · ${km} km` : `📦 load ${j.icon} ${label} in ${j.from} · ${km} km`,
        late: false, target: [tgt.x, tgt.z],
      };
    const late = j.left <= 0;
    return {
      text: j.kind === 'charter'
        ? `${j.icon} ${label} → land at ${j.to} · ${km} km · ${late ? '⏱ LATE' : '⏱ ' + fmt(j.left)}${j.rush ? ' 🔥' : ''}`
        : `${j.icon} ${label} → ${j.to} · ${km} km · ${late ? '⏱ LATE' : '⏱ ' + fmt(j.left)}${j.rush ? ' 🔥' : ''}`,
      late, urgent: !late && j.left < 45, target: [tgt.x, tgt.z],
    };
  }
}
