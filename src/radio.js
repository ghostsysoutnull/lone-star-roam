// Aviation wave 3 — tower radio. Pure narration layer over already-true
// state: it invents nothing, it reads aviation.js flight phases, airports.js
// runway-in-use/wind, ATMOS/sky.forecast, and the player, and turns phase
// EDGES into transmissions (audio.js radio() synth + a HUD subtitle). No
// meshes, no simulation of its own — a standalone system (not folded into
// AviationSystem) so it can read the player without breaking aviation.js's
// existing update(dt, px, pz, days) signature or import cycle rules
// (airports.js may only be imported by geo.js/sky.js-adjacent modules).
// Landing detection here writes the logbook (10th collectible, save.airports)
// — towered (tier-1) fields only, on purpose: the flow described below
// ("radar contact" → "cleared to land" → "welcome to {city}") only makes
// sense where there's a tower. Towerless strips still get the sign and the
// scenery; they don't get a stamp.
import { hAt } from './geo.js';
import { AIRPORTS, runwayInUse, windFrom, onRunway } from './airports.js';
import { ATMOS } from './sky.js';

export const TOWERED = AIRPORTS.filter((a) => a.tier === 1); // the 7 hubs with a tower mesh (airports.js)
export const TOWERED_COUNT = TOWERED.length;

const RANGE = 250;      // FLY reception ring around a towered field, no perk
const CLEAR_DEG = 20;   // alignment cone for "cleared to land"
const TD_AGL = 3, TD_SPD = 40; // touchdown thresholds

const rwyLabel = (u) => {
  let n = Math.round((((u.hdg % 360) + 360) % 360) / 10);
  if (n === 0) n = 36;
  return String(n).padStart(2, '0');
};
const windKt = () => Math.round(3 + Math.max(0, ATMOS.wind - 1) * 11);

export class TowerRadio {
  constructor() {
    this.tunedField = null;        // id of the towered field currently tuned in, or null
    this.flow = 'none';            // player's own approach: none → contact → cleared → landed
    this.knownPh = new Map();      // flight key → last narrated phase (edge detector)
    this.ufoWas = false;
    this.lastTx = null;            // { text, field, kind, ... } — structured, for tests
    this.onRadio = null;           // (text) => audio.radio + hud.subtitle
    this.onStamp = null;           // (id, name) => gameplay.logAirport
  }

  nearestTowered(px, pz) {
    let best = null, bd = Infinity;
    for (const a of TOWERED) {
      const d = Math.hypot(a.at[0] - px, a.at[1] - pz);
      if (d < bd) { bd = d; best = a; }
    }
    return { a: best, d: bd };
  }

  // the field currently receivable, or null — FLY within range, or anywhere
  // with the shop's aviation-band radio (weather-radio precedent)
  receivable(player) {
    const { a, d } = this.nearestTowered(player.pos.x, player.pos.z);
    if (!a) return null;
    if (player.perks?.avionics) return a;
    if (player.mode === 'FLY' && d < RANGE) return a;
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

  // AI ops: narrate phase edges for traffic at the tuned field only —
  // departure clearance on roll, landing clearance on final, go-around
  // (weather- or player-triggered) on the transition into 'divert'
  narrateOps(field, aviation, day) {
    const rwy = rwyLabel(runwayInUse(field, day));
    const live = new Set();
    for (const m of aviation.flights) {
      if (m.sl.from !== field.id && m.sl.dest !== field.id) continue;
      live.add(m.sl.key);
      const ph = m.st.ph;
      if (this.knownPh.get(m.sl.key) === ph) continue;
      this.knownPh.set(m.sl.key, ph);
      if (m.sl.from === field.id && ph === 'roll')
        this.tx(field, `Lone Star ${m.sl.n}, cleared for takeoff, runway ${rwy}.`, 'ops');
      else if (m.sl.dest === field.id && ph === 'final')
        this.tx(field, `Lone Star ${m.sl.n}, cleared to land, runway ${rwy}.`, 'ops');
      else if (m.sl.dest === field.id && ph === 'divert')
        this.tx(field, `Lone Star ${m.sl.n}, traffic holding on the runway, go around.`, 'divert');
    }
    for (const k of [...this.knownPh.keys()]) if (!live.has(k)) this.knownPh.delete(k);
  }

  // player parked on the active runway with traffic on final: reuse the
  // wave-2 go-around machinery instead of weather triggering it
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
    const field = this.receivable(player);

    const ufoNow = (ATMOS.ufo || 0) > 0;
    if (field && ufoNow && !this.ufoWas) this.tx(field, 'Unidentified traffic in your vicinity... say intentions.', 'ufo');
    this.ufoWas = ufoNow;

    // a blocked runway forces a go-around whether or not anyone's listening —
    // it's a physical safety behavior, not a radio one. Cheap: 7 fields.
    for (const a of TOWERED) this.checkBlock(a, player, aviation, day);

    let justTuned = false;
    if ((field?.id ?? null) !== this.tunedField) {
      this.tunedField = field?.id ?? null;
      this.flow = 'none';
      if (field) { this.atis(field, day, sky); justTuned = true; }
    }
    if (!field) return;

    this.narrateOps(field, aviation, day);
    // stagger "radar contact" one frame past ATIS so the two transmissions
    // (both one-shot tx() calls) don't overwrite each other's lastTx
    if (player.mode === 'FLY' && !justTuned) this.playerFlow(field, player, day);
    else if (player.mode !== 'FLY') this.flow = 'none';
  }
}
