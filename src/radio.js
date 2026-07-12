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
import { hAt } from './geo.js';
import { AIRPORTS, runwayInUse, windFrom, onRunway, TD_AGL, TD_SPD } from './airports.js';
import { ATMOS } from './sky.js';

export const TOWERED = AIRPORTS.filter((a) => a.tier === 1); // the 7 hubs with a tower mesh
export const TOWERED_COUNT = TOWERED.length;
export const UNICOM = AIRPORTS.filter((a) => a.tier === 2);  // the 9 regional fields, self-announce only

const RANGE = 250;         // FLY reception ring around a towered field, no perk
const UNICOM_RANGE = 120;  // CTAF is a shorter-range, quieter frequency
const CLEAR_DEG = 20;      // alignment cone for "cleared to land"

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
    this.lastTx = null;            // { text, field, kind, ... } — structured, for tests
    this.onRadio = null;           // (text) => audio.radio + hud.subtitle
    this.onStamp = null;           // (id, name) => gameplay.logAirport
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
    this.lastTx = { text, field: field.id, kind, ...extra };
    this.onRadio?.(text);
  }

  atis(field, day, sky) {
    const u = runwayInUse(field, day);
    const wDeg = windFrom(day), wKt = windKt(), rwy = rwyLabel(u);
    const fc = sky.forecast ? `, ${sky.forecastName()} moving in` : '';
    const text = `${field.city} Tower: wind ${wDeg} at ${wKt}, runway ${rwy}, ${sky.weatherName()}${fc}.`;
    this.tx(field, text, 'atis', { wind: wDeg, rwy });
  }

  // UNICOM fields have no controller to give ATIS, but a real one still runs
  // automated weather (AWOS/ASOS) — an actual transmission you'd hear on
  // frequency, unlike "monitoring" (that's something a pilot keys up and
  // says, not something silence produces). No runway/forecast: it's a
  // simpler broadcast than tower ATIS by design.
  awos(field, day, sky) {
    const wDeg = windFrom(day), wKt = windKt();
    const text = `${field.city} automated weather: wind ${wDeg} at ${wKt}, ${sky.weatherName()}.`;
    this.tx(field, text, 'awos', { wind: wDeg });
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
      if (kind === 'tower') {
        if (m.sl.from === field.id && ph === 'roll')
          this.tx(field, `Lone Star ${m.sl.n}, cleared for takeoff, runway ${rwy}.`, 'ops');
        else if (m.sl.dest === field.id && ph === 'final')
          this.tx(field, `Lone Star ${m.sl.n}, cleared to land, runway ${rwy}.`, 'ops');
        else if (m.sl.dest === field.id && ph === 'divert')
          this.tx(field, `Lone Star ${m.sl.n}, traffic holding on the runway, go around.`, 'divert');
      } else {
        if (m.sl.from === field.id && ph === 'roll')
          this.tx(field, `${field.city} traffic, Lone Star ${m.sl.n}, departing runway ${rwy}, ${field.city} traffic.`, 'ops');
        else if (m.sl.dest === field.id && ph === 'final')
          this.tx(field, `${field.city} traffic, Lone Star ${m.sl.n}, on final runway ${rwy}, ${field.city} traffic.`, 'ops');
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
    if (dist > RANGE) { this.flow = 'none'; return; }
    if (this.flow === 'none') { this.flow = 'contact'; this.tx(field, 'Lone Star traffic, radar contact.', 'contact'); }

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
        this.tx(field, `Lone Star, wind ${windFrom(day)} at ${windKt()}, runway ${rwyLabel(u)}, cleared to land.`, 'cleared');
      }
    }
    if (this.flow !== 'landed' && agl < TD_AGL && Math.abs(player.speed) < TD_SPD && onRunway(field, player.pos.x, player.pos.z, 1.5)) {
      this.flow = 'landed';
      this.tx(field, `Welcome to ${field.city}.`, 'landed');
      this.onStamp?.(field.id, field.name);
    }
  }

  update(dt, player, aviation, sky) {
    const day = Math.floor(sky.days);
    const r = this.receivable(player);
    const field = r?.a ?? null, kind = r?.kind ?? null;

    const ufoNow = (ATMOS.ufo || 0) > 0;
    if (field && ufoNow && !this.ufoWas) this.tx(field, 'Unidentified traffic in your vicinity... say intentions.', 'ufo');
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
    if (!field) return;

    this.narrateOps(field, kind, aviation, day);
    // stagger "radar contact" one frame past ATIS so the two transmissions
    // (both one-shot tx() calls) don't overwrite each other's lastTx. Only
    // towered fields get a player approach flow — no controller, no clearance.
    if (kind === 'tower' && player.mode === 'FLY' && !justTuned) this.playerFlow(field, player, day);
    else if (player.mode !== 'FLY') this.flow = 'none';
  }
}
