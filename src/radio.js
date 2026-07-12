// Aviation wave 3 — tower radio (+ tier-2 UNICOM, added after wave 3
// shipped). Pure narration layer over already-true state: it invents
// nothing, it reads aviation.js flight phases, airports.js runway-in-use/
// wind, ATMOS/sky.forecast, and the player, and turns phase EDGES into
// transmissions (audio.js radio() synth + a HUD subtitle). No meshes, no
// simulation of its own — a standalone system (not folded into
// AviationSystem) so it can read the player without breaking aviation.js's
// existing update(dt, px, pz, days) signature or import cycle rules
// (airports.js may only be imported by geo.js/sky.js-adjacent modules).
//
// Two frequencies, matching real-world ATC vs. CTAF/UNICOM: the 7 tier-1
// hubs have a tower mesh (airports.js) and a controller — ATIS, "cleared for
// takeoff/to land," a player approach flow, and the logbook stamp. The 9
// tier-2 regional fields have no tower, just a beacon — an automated
// weather broadcast (AWOS) on tuning in (a real transmission, unlike
// "monitoring," which is something a pilot would key up and say, not
// something silence produces — so it can't be dropped in favor of relying
// on ambient AI traffic alone), and pilots self-announce on a common
// frequency instead ("Waco traffic, Lone Star N, departing runway 14, Waco
// traffic"). Shorter range, no controller clearances, no player approach
// flow, no stamp (the logbook stays towered-only, `/7` — towerless fields
// get the sign and the scenery, not the stamp). A blocked runway forces a
// go-around at ANY field with traffic
// (physical safety, not a radio behavior) regardless of tower or tier.
import { hAt, nearestCity, nearestRoad, seededRand } from './geo.js';
import { AIRPORTS, runwayInUse, windFrom, onRunway, TD_AGL, TD_SPD } from './airports.js';
import { ATMOS } from './sky.js';
import { chatterLine, HELI_ID } from './chatter.js';

export const TOWERED = AIRPORTS.filter((a) => a.tier === 1); // the 7 hubs with a tower mesh
export const TOWERED_COUNT = TOWERED.length;
export const UNICOM = AIRPORTS.filter((a) => a.tier === 2);  // the 9 regional fields, self-announce only

const RANGE = 250;         // FLY reception ring around a towered field, no perk
const UNICOM_RANGE = 120;  // CTAF is a shorter-range, quieter frequency
const CLEAR_DEG = 20;      // alignment cone for "cleared to land"
// A3 chatter: the scanner's direct-range window — line-of-sight VHF to any
// airborne source, tuned field or not (the only way the coast guard, nowhere
// near a towered field, ever gets heard). Same window feeds the A5 HUD tags.
const DIRECT = 60;
const AIRB = new Set(['climb', 'cruise', 'descend', 'final', 'divert']);
const OPS_HOLD = 6;        // a tower/safety tx pushes casual chatter out at least this far
const GAP_MIN = 25, GAP_VAR = 20; // seeded 25–45 s between casual lines (moderate cadence)
const REF_SPD = 34;        // player-ref gate: well past every non-motorway cap (46 is the motorway limit)
// heli/military phase → chatter event, fired on edges (knownPh idiom). A null
// (or missing) phase is deliberate silence.
const EDGE_EV = {
  medical: { out: 'lift', pad: 'padDown', lift: 'padLift', idle: 'touchdown' },
  army: { circuit: 'lift', idle: 'touchdown' },
  coastguard: { hover: 'hover' },
};
// phases where a mid-phase enroute roll is plausible — nobody makes small
// talk sitting on a pad or established on final
const ROLL_OK = {
  medical: ['out', 'return'], news: ['orbit'], coastguard: ['patrol', 'hover'],
  army: ['circuit'], jet: ['climb', 'cruise', 'descend'], ga: ['climb', 'cruise', 'descend'],
  military: ['enroute'],
};

const rwyLabel = (u) => {
  let n = Math.round((((u.hdg % 360) + 360) % 360) / 10);
  if (n === 0) n = 36;
  return String(n).padStart(2, '0');
};
const windKt = () => Math.round(3 + Math.max(0, ATMOS.wind - 1) * 11);

export class TowerRadio {
  constructor() {
    this.tunedField = null;        // id of the field currently tuned in (tower or UNICOM), or null
    this.flow = 'none';            // player's own approach: none → contact → cleared → landed
    this.knownPh = new Map();      // flight key → last narrated phase (edge detector)
    this.ufoWas = false;
    this.lastTx = null;            // { text, field, kind, at, ... } — structured, for tests
    this.onRadio = null;           // (text, meta) => audio.radio + hud.subtitle
    this.onStamp = null;           // (id, name) => gameplay.logAirport
    this.simT = 0;                 // radio's own sim clock — lastTx.at timestamps for gap checks
    this.helis = null;             // HeliSystem — assigned by main.js (property pattern, like onRadio)
    this.militaryAir = null;       // MilitaryAirSystem — same
    this.sources = [];             // airborne sources near the player: ONE enumeration, two consumers (chatter + hud tags)
    this.srcPh = new Map();        // source key → last seen phase (heli/military edge dedup)
    this.chatterT = 4;             // casual-chatter budget: seconds until the next line may fire
    this.rollN = 0;                // enroute-roll counter (chatter:roll seed stream)
    this.playerRefT = 240;         // delight-line hard throttle: first shot after ~4 min, then ~hourly
  }

  nearest(list, px, pz) {
    let best = null, bd = Infinity;
    for (const a of list) {
      const d = Math.hypot(a.at[0] - px, a.at[1] - pz);
      if (d < bd) { bd = d; best = a; }
    }
    return { a: best, d: bd };
  }

  nearestTowered(px, pz) { return this.nearest(TOWERED, px, pz); }
  nearestUnicom(px, pz) { return this.nearest(UNICOM, px, pz); }

  // the field currently receivable, or null — FLY within range (250u tower,
  // 120u UNICOM), or anywhere with the shop's aviation-band radio (a scanner
  // covers both frequencies). When both would be in range, the nearer wins.
  receivable(player) {
    const perk = !!player.perks?.avionics;
    const inFly = player.mode === 'FLY';
    const tw = this.nearest(TOWERED, player.pos.x, player.pos.z);
    const un = this.nearest(UNICOM, player.pos.x, player.pos.z);
    const twOk = tw.a && (perk || (inFly && tw.d < RANGE));
    const unOk = un.a && (perk || (inFly && un.d < UNICOM_RANGE));
    if (twOk && unOk) return tw.d <= un.d ? { a: tw.a, kind: 'tower' } : { a: un.a, kind: 'unicom' };
    if (twOk) return { a: tw.a, kind: 'tower' };
    if (unOk) return { a: un.a, kind: 'unicom' };
    return null;
  }

  tx(field, text, kind, extra = {}) {
    this.lastTx = { text, field: field?.id ?? null, kind, at: this.simT, ...extra };
    this.onRadio?.(text, { voice: extra.voice ?? 'tower', header: extra.header ?? null });
    // priority: tower ops / safety calls always preempt casual chatter
    if (kind !== 'chatter') this.chatterT = Math.max(this.chatterT, OPS_HOLD);
  }

  atis(field, day, sky) {
    const u = runwayInUse(field, day);
    const wDeg = windFrom(day), wKt = windKt(), rwy = rwyLabel(u);
    const fc = sky.forecast ? `, ${sky.forecastName()} moving in` : '';
    const text = `${field.city} Tower: wind ${wDeg} at ${wKt}, runway ${rwy}, ${sky.weatherName()}${fc}.`;
    this.tx(field, text, 'atis', { wind: wDeg, rwy, header: `📻 ${field.city.toUpperCase()} TOWER` });
  }

  // UNICOM fields have no controller to give ATIS, but a real one still runs
  // automated weather (AWOS/ASOS) — an actual transmission you'd hear on
  // frequency, unlike "monitoring" (that's something a pilot keys up and
  // says, not something silence produces). No runway/forecast: it's a
  // simpler broadcast than tower ATIS by design.
  awos(field, day, sky) {
    const wDeg = windFrom(day), wKt = windKt();
    const text = `${field.city} automated weather: wind ${wDeg} at ${wKt}, ${sky.weatherName()}.`;
    this.tx(field, text, 'awos', { wind: wDeg, header: `📻 ${field.city.toUpperCase()} AWOS` });
  }

  // AI ops: narrate phase edges for traffic at the tuned field only. Towered
  // fields get controller phraseology (a clearance); UNICOM fields get
  // self-announce phraseology (no one's granting anything, the pilot's just
  // stating it on the common frequency) — no go-around call at all on
  // UNICOM, since there's no controller to say it (the go-around still
  // physically happens; see checkBlock, which isn't gated on tower/tier).
  narrateOps(field, kind, aviation, day) {
    const rwy = rwyLabel(runwayInUse(field, day));
    const live = new Set();
    for (const m of aviation.flights) {
      if (m.sl.from !== field.id && m.sl.dest !== field.id) continue;
      live.add(m.sl.key);
      const ph = m.st.ph;
      if (this.knownPh.get(m.sl.key) === ph) continue;
      this.knownPh.set(m.sl.key, ph);
      const twrHdr = `📻 ${field.city.toUpperCase()} TOWER`;
      const selfHdr = `📻 ${m.sl.cs.toUpperCase()} · ${m.sl.from} → ${m.sl.dest}`;
      if (kind === 'tower') {
        if (m.sl.from === field.id && ph === 'roll')
          this.tx(field, `${m.sl.cs}, cleared for takeoff, runway ${rwy}.`, 'ops', { header: twrHdr });
        else if (m.sl.dest === field.id && ph === 'final')
          this.tx(field, `${m.sl.cs}, cleared to land, runway ${rwy}.`, 'ops', { header: twrHdr });
        else if (m.sl.dest === field.id && ph === 'divert')
          this.tx(field, `${m.sl.cs}, traffic holding on the runway, go around.`, 'divert', { header: twrHdr });
      } else {
        if (m.sl.from === field.id && ph === 'roll')
          this.tx(field, `${field.city} traffic, ${m.sl.cs}, departing runway ${rwy}, ${field.city} traffic.`, 'ops', { header: selfHdr });
        else if (m.sl.dest === field.id && ph === 'final')
          this.tx(field, `${field.city} traffic, ${m.sl.cs}, on final runway ${rwy}, ${field.city} traffic.`, 'ops', { header: selfHdr });
      }
    }
    for (const k of [...this.knownPh.keys()]) if (!live.has(k)) this.knownPh.delete(k);
  }

  // player parked on an active runway with traffic on final: reuse the
  // wave-2 go-around machinery instead of weather triggering it. Runs over
  // every field with traffic, tower or not — blocking a runway is a physical
  // hazard regardless of who (if anyone) is on the radio.
  checkBlock(field, player, aviation, day) {
    const agl = player.pos.y - hAt(player.pos.x, player.pos.z);
    if (agl >= TD_AGL || !onRunway(field, player.pos.x, player.pos.z, 1.5)) return;
    for (const m of aviation.flights) {
      if (m.sl.dest === field.id && m.st.ph === 'final' && !m.divert) aviation.divert(m);
    }
  }

  // the player's own approach: radar contact → cleared to land → touchdown.
  // FLY only, and only physically near the field — the perk widens ATIS/ops
  // reception, not this (you can't land a plane you aren't flying)
  playerFlow(field, player, day) {
    const dist = Math.hypot(field.at[0] - player.pos.x, field.at[1] - player.pos.z);
    const twrHdr = `📻 ${field.city.toUpperCase()} TOWER`;
    if (dist > RANGE) { this.flow = 'none'; return; }
    if (this.flow === 'none') { this.flow = 'contact'; this.tx(field, 'Lone Star traffic, radar contact.', 'contact', { header: twrHdr }); }

    const u = runwayInUse(field, day);
    const agl = player.pos.y - hAt(player.pos.x, player.pos.z);
    if (this.flow === 'contact') {
      const fx = -Math.sin(player.heading), fz = -Math.cos(player.heading);
      const align = Math.acos(Math.max(-1, Math.min(1, fx * u.dx + fz * u.dz))) * 180 / Math.PI;
      const ex = player.pos.x - u.tx, ez = player.pos.z - u.tz;
      const along = ex * u.dx + ez * u.dz, lateral = Math.abs(ex * -u.dz + ez * u.dx);
      const inCone = along < 5 && along > -220 && lateral < 12 + Math.max(0, -along) * 0.12;
      if (align < CLEAR_DEG && player.vy < 0 && inCone) {
        this.flow = 'cleared';
        this.tx(field, `Lone Star, wind ${windFrom(day)} at ${windKt()}, runway ${rwyLabel(u)}, cleared to land.`, 'cleared', { header: twrHdr });
      }
    }
    if (this.flow !== 'landed' && agl < TD_AGL && Math.abs(player.speed) < TD_SPD && onRunway(field, player.pos.x, player.pos.z, 1.5)) {
      this.flow = 'landed';
      this.tx(field, `Welcome to ${field.city}.`, 'landed', { header: twrHdr });
      this.onStamp?.(field.id, field.name);
    }
  }

  // ---- A3: scanner + casual chatter --------------------------------------

  // enumerate airborne (and parked-in-view heli) sources near the player —
  // this ONE list feeds both the chatter engine and hud.js's A5 proximity
  // tags. Parked helis are included (air:false) purely so their phase edges
  // (idle → out = lift, → idle = touchdown) are observable; tags skip them.
  scan(player, aviation) {
    const px = player.pos.x, pz = player.pos.z;
    const out = [];
    for (const m of aviation.flights) {
      if (!AIRB.has(m.st.ph)) continue;
      const d = Math.hypot(m.st.x - px, m.st.z - pz);
      if (d > DIRECT) continue;
      out.push({ kind: m.sl.type === 'jet' ? 'jet' : 'ga', cs: m.sl.cs, airline: m.sl.airline ?? null,
        from: m.sl.from, dest: m.sl.dest, route: `${m.sl.from} → ${m.sl.dest}`,
        x: m.st.x, y: m.st.y, z: m.st.z, d, ph: m.st.ph, air: true, key: 'F' + m.sl.key });
    }
    if (this.helis) for (const c of this.helis.candidates) {
      if (!c.active) continue;
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d > DIRECT) continue;
      const id = HELI_ID[c.kind];
      out.push({ kind: c.kind, cs: id.cs, op: id.op, city: c.city ?? null, fieldId: c.fieldId ?? null,
        x: c.x, y: c.y, z: c.z, d, ph: c.ph ?? 'idle', air: !!c.flying, key: 'H' + c.kind + (c.city ?? '') });
    }
    if (this.militaryAir) for (const c of this.militaryAir.candidates) {
      if (!c.flying || !c.cs) continue; // the low-level pair has no callsign and stays silent, realistically
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d > DIRECT) continue;
      out.push({ kind: 'military', cs: c.cs, x: c.x, y: c.y, z: c.z, d, ph: 'enroute', air: true, key: 'M' + c.kind });
    }
    out.sort((a, b) => a.d - b.d);
    this.sources = out;
  }

  // live context for a source — every value here is TRUE right now, which is
  // what lets templates be factual by construction
  ctxFor(s, sky) {
    const idCity = (id) => AIRPORTS.find((a) => a.id === id)?.city ?? null;
    const h = ((sky.t ?? 0) % 1) * 24;
    const ctx = {
      cs: s.cs, airline: s.airline ?? null,
      city: s.city ?? nearestCity(s.x, s.z).city?.name ?? null,
      wx: sky.weatherName?.() ?? null,
      fc: sky.forecast ? sky.forecastName() : null,
      tod: h < 5 ? null : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : null,
    };
    if (s.dest) { ctx.dest = idCity(s.dest); ctx.origin = idCity(s.from); }
    if (s.fieldId) ctx.field = AIRPORTS.find((a) => a.id === s.fieldId)?.name ?? null;
    return ctx;
  }

  // one casual line at most per call, behind the global budget: phase edges
  // first (they're events), then a seeded enroute roll among the nearest 1–2
  // sources. Ops keep priority via the chatterT bump in tx().
  chatter(dt, player, sky, day) {
    this.chatterT -= dt;
    this.playerRefT -= dt;
    const live = new Set(this.sources.map((s) => s.key));
    for (const k of [...this.srcPh.keys()]) if (!live.has(k)) this.srcPh.delete(k);

    const near = this.sources.slice(0, 2);
    let src = null, event = null;
    for (const s of near) {
      const prev = this.srcPh.get(s.key);
      this.srcPh.set(s.key, s.ph);
      if (prev === undefined || prev === s.ph) continue; // first sight = baseline, not an event
      const ev = EDGE_EV[s.kind]?.[s.ph];
      if (ev && !event) { event = ev; src = s; }
    }

    if (this.chatterT > 0) return; // budget gate — a missed edge just stays unspoken

    // player-ref delight line: the news chopper only, only when the player is
    // genuinely speeding on a motorway inside its window, hard-throttled
    if (!event && this.playerRefT <= 0) {
      const news = near.find((s) => s.kind === 'news' && s.air);
      if (news && Math.abs(player.speed) > REF_SPD && player.mode === 'DRIVE'
          && nearestRoad(player.pos.x, player.pos.z, 6, (t) => t === 'motorway')) {
        src = news; event = 'playerRef';
      }
    }
    if (!src) {
      const cands = near.filter((s) => s.air && ROLL_OK[s.kind]?.includes(s.ph));
      if (!cands.length) return;
      const r = seededRand(`chatter:roll:${day}:${this.rollN++}`)();
      src = cands[Math.floor(r * cands.length)];
      event = src.kind === 'coastguard' && src.ph === 'hover' ? 'hover' : 'enroute';
    }
    if (!src.air && event !== 'touchdown') return; // parked sources only ever report the touchdown edge

    const line = chatterLine(src.kind, event, this.ctxFor(src, sky), `${src.kind}:${event}:${day}:${src.cs}`);
    if (!line) return;
    if (event === 'playerRef') this.playerRefT = 3600; // at most ~one an hour, and only if it actually aired
    const where = src.route ?? (src.city ?? nearestCity(src.x, src.z).city?.name) ?? '';
    this.tx(null, line.text, 'chatter', {
      src: src.kind, cs: src.cs, route: src.route ?? null, phase: src.ph, casual: true,
      voice: line.voice, header: `📻 ${src.cs.toUpperCase()}${where ? ' · ' + where : ''}`,
    });
    this.chatterT = GAP_MIN + seededRand(`chatter:gap:${day}:${this.rollN++}`)() * GAP_VAR;
  }

  update(dt, player, aviation, sky) {
    const day = Math.floor(sky.days);
    this.simT += dt;
    const r = this.receivable(player);
    const field = r?.a ?? null, kind = r?.kind ?? null;

    const ufoNow = (ATMOS.ufo || 0) > 0;
    if (field && ufoNow && !this.ufoWas) this.tx(field, 'Unidentified traffic in your vicinity... say intentions.', 'ufo', { header: `📻 ${field.city.toUpperCase()} TOWER` });
    this.ufoWas = ufoNow;

    // a blocked runway forces a go-around whether or not anyone's listening —
    // it's a physical safety behavior, not a radio one. Cheap: 20 fields.
    for (const a of AIRPORTS) this.checkBlock(a, player, aviation, day);

    let justTuned = false;
    if ((field?.id ?? null) !== this.tunedField) {
      this.tunedField = field?.id ?? null;
      this.flow = 'none';
      if (field) {
        if (kind === 'tower') this.atis(field, day, sky); else this.awos(field, day, sky);
        justTuned = true;
      }
    }
    if (field) {
      this.narrateOps(field, kind, aviation, day);
      // stagger "radar contact" one frame past ATIS so the two transmissions
      // (both one-shot tx() calls) don't overwrite each other's lastTx. Only
      // towered fields get a player approach flow — no controller, no clearance.
      if (kind === 'tower' && player.mode === 'FLY' && !justTuned) this.playerFlow(field, player, day);
      else if (player.mode !== 'FLY') this.flow = 'none';
    }

    // the scanner runs tuned or not — direct-range VHF needs no field
    this.scan(player, aviation);
    this.chatter(dt, player, sky, day);
  }
}
