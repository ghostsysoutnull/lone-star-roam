// HUD: minimap + fullscreen map (border/highways pre-rendered once), text readouts, toasts, dialog.
import { Vector3 } from 'three';
import { GEO, nearestCity, inTexas, borderZoneAt, SHOULDER_U, SHELF_U, TIDELANDS_U, coastDist, borderDist } from './geo.js';
import { AIRPORTS, fieldNear } from './airports.js';
import { ATMOS } from './sky.js';
import { KEYS, slotKey } from './slots.js';

// A5 tag text: airline jets show their route, GA/military just the callsign,
// helis their operator brand (or service when unbranded — government kinds)
const KIND_LABEL = { medical: 'Medical', news: 'News', coastguard: 'Coast Guard', army: 'Army' };
function tagLabel(s) {
  if (s.kind === 'jet') return `${s.cs.toUpperCase()} · ${s.route}`;
  if (s.kind === 'ga' || s.kind === 'military') return s.cs.toUpperCase();
  return `${s.cs.toUpperCase()} · ${s.op ?? KIND_LABEL[s.kind] ?? ''}`;
}

const SHIELD_HOLD = 0.8; // seconds the road shield lingers through a nearestRoad dropout
const AMBER = '#ffb020';     // night shield: glowing outline / lattice
const AMBER_LIT = '#ffd27a'; // night shield: brighter core for the glyphs

function railLabel(rail) {
  return [rail.operator, rail.name].filter((part, index, parts) =>
    part && parts.findIndex((other) => other?.toLowerCase() === part.toLowerCase()) === index).join(' · ');
}

// Road shields: only the clean "PREFIX ###" refs get a shield (real Interstate/
// US/state formats out of tools/build-data.mjs); messy municipal names like
// "Southwest Loop 410" or unnumbered ones like "PGBT" fall through to the
// plain-text road line untouched.
function parseShield(ref) {
  if (!ref) return null;
  const s = ref.trim();
  let m;
  if ((m = /^I\s*(\d{1,3})([A-Z])?$/i.exec(s))) return { shape: 'interstate', num: m[1], tag: m[2]?.toUpperCase() ?? null };
  if ((m = /^US\s*(\d{1,3})$/i.exec(s))) return { shape: 'us', num: m[1] };
  if ((m = /^TX\s*(\d{1,3})\s+(Toll|Loop)$/i.exec(s))) return { shape: 'circle', num: m[1], label: m[2].toUpperCase() };
  if ((m = /^TX\s*(\d{1,3})$/i.exec(s))) return { shape: 'circle', num: m[1], label: null };
  if ((m = /^FM\s*(\d{1,4})$/i.exec(s))) return { shape: 'circle', num: m[1], label: 'FM' };
  if ((m = /^RM\s*(\d{1,4})$/i.exec(s))) return { shape: 'circle', num: m[1], label: 'RM' };
  if ((m = /^BW\s*(\d{1,3})$/i.exec(s))) return { shape: 'circle', num: m[1], label: 'LOOP' };
  return null;
}

export class HUD {
  constructor() {
    this.mini = document.getElementById('minimap');
    this.big = document.getElementById('bigmap');
    this.bigCanvas = document.getElementById('bigmap-canvas');
    this.els = {
      location: document.getElementById('hud-location'),
      road: document.getElementById('hud-road'),
      sky: document.getElementById('hud-sky'),
      speed: document.getElementById('hud-speed'),
      mode: document.getElementById('hud-mode'),
      stamina: document.getElementById('hud-stamina'),
      staminaFill: document.getElementById('hud-stamina-fill'),
      cities: document.getElementById('score-cities'),
      landmarks: document.getElementById('score-landmarks'),
      roses: document.getElementById('score-roses'),
      critters: document.getElementById('score-critters'),
      legends: document.getElementById('score-legends'),
      counties: document.getElementById('score-counties'),
      airports: document.getElementById('score-airports'),
      energy: document.getElementById('score-energy'),
      bank: document.getElementById('score-bank'),
      job: document.getElementById('hud-job'),
      toast: document.getElementById('toast'),
      dialog: document.getElementById('dialog'),
      interact: document.getElementById('interact-hint'),
      brandSize: document.getElementById('brand-size-hint'),
      controlsBar: document.getElementById('controls-bar'),
      natureBox: document.getElementById('hud-nature'),
      crop: document.getElementById('hud-crop'),
      wildlife: document.getElementById('hud-wildlife'),
      help: document.getElementById('help'),
      paused: document.getElementById('paused'),
      subtitle: document.getElementById('radio-subtitle'),
      subtitleHeader: document.getElementById('radio-header'),
      subtitleText: document.getElementById('radio-text'),
    };
    this.subtitleQ = [];
    this.subtitleBusy = false;
    // A5 tag pool: a handful of reusable labels is plenty — the scanner window
    // rarely holds more airborne sources than that
    const tagBox = document.getElementById('air-tags');
    this.tagPool = Array.from({ length: 6 }, () => {
      const el = document.createElement('div');
      el.className = 'tag';
      tagBox.appendChild(el);
      return el;
    });
    this.tagV = new Vector3();
    // Two offscreen layers: the minimap Law says untouched — it keeps the
    // original Texas-only bounds/scale/T exactly as before. Only the big map
    // widens to the shoulder/shelf (band cities/stars land in W2).
    const mini = this.renderMapLayer(1400, 1320, GEO.bounds);
    this.miniLayer = mini.canvas; this.miniT = mini.T; this.miniSc = mini.sc;
    const wide = this.renderMapLayer(1400, 1320, {
      minX: GEO.bounds.minX - SHOULDER_U, maxX: GEO.bounds.maxX + SHELF_U, // east = Gulf shelf too —
      minZ: GEO.bounds.minZ - SHOULDER_U, maxZ: GEO.bounds.maxZ + SHELF_U, // the coast runs SW–NE
    });
    this.mapLayer = wide.canvas; this.mapT = wide.T; this.mapSc = wide.sc;
    this.zoomLevels = [1.4, 2.4, 4.5];
    this.zoomIdx = 1;
    this.compass = document.getElementById('compass');
    if (localStorage.getItem(slotKey(KEYS.compass)) === 'off') this.compass.style.display = 'none';
    this.shield = document.getElementById('road-shield-wrap'); // outer: position/centered/perspective (static)
    this.shieldCard = document.getElementById('road-shield-card'); // inner: JS-animated sway/float transform
    this.shieldCanvas = document.getElementById('road-shield'); // innermost canvas: 2D face raster
    this.railPlacard = document.getElementById('rail-placard');
    this.railInfo = null;
    this.shieldInfo = null;
    this.shieldSway = 0;
    this.shieldNight = false;
    this._shieldRaster = 0;
    this._shieldKey = null;
    this._shieldFloat = 0;
    this._shieldHold = 0; // grace timer: keep the last shield up through brief nearestRoad dropouts
    this._lastShieldRoad = null;
    this.shield.classList.toggle('centered', this.compass.style.display === 'none');
    // UI scale: CSS is rem-based (1rem = 10px at 100%), so one root font-size drives it all
    this.ui = Math.max(0.9, Math.min(2, parseFloat(localStorage.getItem(slotKey(KEYS.uiScale))) || 1));
    this.applyUiScale();
    const s = Math.min(innerWidth, innerHeight) - 60;
    this.bigCanvas.width = s; this.bigCanvas.height = s * 0.95;
    this.toastTimer = null;
  }

  // Pre-render border + highways + cities once to an offscreen canvas.
  // `bounds` picks the world extent (Texas-only for the minimap — Law: "the
  // minimap layer stays untouched" — or the widened shoulder/shelf extent for
  // the big map, which gets the faded band backdrop the Texas fill sits atop).
  renderMapLayer(W, H, bounds) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const { minX, maxX, minZ, maxZ } = bounds;
    const pad = 20, sc = Math.min((W - 2 * pad) / (maxX - minX), (H - 2 * pad) / (maxZ - minZ));
    const T = (x, z) => [(x - minX) * sc + pad, (z - minZ) * sc + pad];
    const isWide = bounds !== GEO.bounds;
    if (isWide) {
      ctx.fillStyle = '#171a14'; // faded band backdrop, dimmer than Texas' own fill
      ctx.fillRect(0, 0, W, H);
      for (const ring of Object.values(GEO.neighborStates ?? {})) {
        ctx.beginPath();
        ring.forEach(([x, z], i) => { const [px, pz] = T(x, z); i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); });
        ctx.closePath(); ctx.fillStyle = '#242a1e'; ctx.fill();
      }
    }
    ctx.fillStyle = '#20261c';
    ctx.beginPath();
    GEO.border.forEach(([x, z], i) => { const [px, pz] = T(x, z); i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); });
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c8b878'; ctx.lineWidth = 2; ctx.stroke();
    // Padre's rings — the island IS Texas, so both layers draw it (same fill,
    // thinner ink; it reads as coastline, not a second border)
    for (const ring of GEO.islands ?? []) {
      ctx.beginPath();
      ring.forEach(([x, z], i) => { const [px, pz] = T(x, z); i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); });
      ctx.closePath();
      ctx.fillStyle = '#20261c'; ctx.fill();
      ctx.strokeStyle = '#c8b878'; ctx.lineWidth = 1; ctx.stroke();
    }
    // Tidelands line — big map only (the minimap Law). Marching squares on
    // the coastDist field (border-vertex normal offsets fail here: the coast
    // polygon wanders through bays, so offset points come out unordered).
    // Cell-local contour segments need no global ordering; skipping alternate
    // 80u bands gives the dashes. Two-level refinement keeps boot cheap.
    // Drawn-segment midpoints stay on `this.tidelands` for the verify suite.
    if (isWide && GEO.borderZones?.length) {
      this.tidelands = [];
      ctx.save();
      ctx.strokeStyle = '#5a86a8'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
      const FINE = 20, COARSE = 160, X0 = 1400, X1 = 5800, Z0 = 900, Z1 = 6000;
      const f = (x, z) => coastDist(x, z) - TIDELANDS_U;
      ctx.beginPath();
      for (let cx = X0; cx < X1; cx += COARSE) {
        for (let cz = Z0; cz < Z1; cz += COARSE) {
          // contour can only cross a coarse cell if a corner is within reach
          const near = [[cx, cz], [cx + COARSE, cz], [cx, cz + COARSE], [cx + COARSE, cz + COARSE]]
            .some(([x, z]) => Math.abs(f(x, z)) <= COARSE * 1.45);
          if (!near) continue;
          for (let x = cx; x < cx + COARSE; x += FINE) {
            for (let z = cz; z < cz + COARSE; z += FINE) {
              const v = [f(x, z), f(x + FINE, z), f(x + FINE, z + FINE), f(x, z + FINE)];
              // edge crossings, linearly interpolated (corner order: ccw from NW)
              const E = [[x, z, x + FINE, z, v[0], v[1]], [x + FINE, z, x + FINE, z + FINE, v[1], v[2]],
                [x + FINE, z + FINE, x, z + FINE, v[2], v[3]], [x, z + FINE, x, z, v[3], v[0]]];
              const hits = [];
              for (const [ax, az, bx, bz, fa, fb] of E) {
                if (fa < 0 === fb < 0) continue;
                const t = fa / (fa - fb);
                hits.push([ax + (bx - ax) * t, az + (bz - az) * t]);
              }
              if (hits.length < 2) continue;
              const mx = (hits[0][0] + hits[1][0]) / 2, mz = (hits[0][1] + hits[1][1]) / 2;
              // keep the offshore contour only — the same field has a twin
              // 166.7u INLAND, and arcs into Mexico water past Boca Chica
              if (inTexas(mx, mz) || borderZoneAt(mx, mz) !== 'coast') continue;
              this.tidelands.push([mx, mz]);
              if (((Math.floor(x / 80) + Math.floor(z / 80)) & 1) === 0) continue; // the dash gaps
              const [p1x, p1z] = T(hits[0][0], hits[0][1]), [p2x, p2z] = T(hits[1][0], hits[1][1]);
              ctx.moveTo(p1x, p1z); ctx.lineTo(p2x, p2z);
            }
          }
        }
      }
      ctx.stroke();
      ctx.restore();
    }
    // World-edge iso-lines (Water Vehicles W3) — big map only, the Tidelands
    // dash-pass idiom on the borderDist field: the shelf wall the boat stops
    // at (SHELF_U past the coast) and the shoulder edge on US-neighbor land
    // (SHOULDER_U; Mexico's edge is the river itself, already inked). Styled
    // fainter than the Tidelands dashes — the legal line outranks the world
    // line. Display only: the wall lives in geo.js inWorld, never here.
    // Drawn-segment midpoints stay on `this.worldEdge` for the verify suite.
    if (isWide && GEO.borderZones?.length) {
      this.worldEdge = { sea: [], land: [] };
      ctx.save();
      ctx.strokeStyle = '#47535e'; ctx.lineWidth = 1; ctx.lineCap = 'round';
      const FINE = 20, COARSE = 160;
      const X0 = minX, X1 = maxX, Z0 = minZ, Z1 = maxZ;
      const cache = new Map();
      const bd = (x, z) => {
        const k = x * 131072 + z;
        let v = cache.get(k);
        if (v === undefined) { v = borderDist(x, z); cache.set(k, v); }
        return v;
      };
      for (const [LIMIT, zone, out] of [[SHELF_U, 'coast', 'sea'], [SHOULDER_U, 'land', 'land']]) {
        const f = (x, z) => bd(x, z) - LIMIT;
        ctx.beginPath();
        for (let cx = X0; cx < X1; cx += COARSE) {
          for (let cz = Z0; cz < Z1; cz += COARSE) {
            const near = [[cx, cz], [cx + COARSE, cz], [cx, cz + COARSE], [cx + COARSE, cz + COARSE]]
              .some(([x, z]) => Math.abs(f(x, z)) <= COARSE * 1.45);
            if (!near) continue;
            for (let x = cx; x < cx + COARSE; x += FINE) {
              for (let z = cz; z < cz + COARSE; z += FINE) {
                const v = [f(x, z), f(x + FINE, z), f(x + FINE, z + FINE), f(x, z + FINE)];
                const E = [[x, z, x + FINE, z, v[0], v[1]], [x + FINE, z, x + FINE, z + FINE, v[1], v[2]],
                  [x + FINE, z + FINE, x, z + FINE, v[2], v[3]], [x, z + FINE, x, z, v[3], v[0]]];
                const hits = [];
                for (const [ax, az, bx, bz, fa, fb] of E) {
                  if (fa < 0 === fb < 0) continue;
                  const t = fa / (fa - fb);
                  hits.push([ax + (bx - ax) * t, az + (bz - az) * t]);
                }
                if (hits.length < 2) continue;
                const mx = (hits[0][0] + hits[1][0]) / 2, mz = (hits[0][1] + hits[1][1]) / 2;
                // keep the outside contour only — the field has a twin LIMIT
                // units inside Texas, and each line owns one border zone
                if (inTexas(mx, mz) || borderZoneAt(mx, mz) !== zone) continue;
                this.worldEdge[out].push([mx, mz]);
                if (((Math.floor(x / 80) + Math.floor(z / 80)) & 1) === 0) continue; // the dash gaps
                const [p1x, p1z] = T(hits[0][0], hits[0][1]), [p2x, p2z] = T(hits[1][0], hits[1][1]);
                ctx.moveTo(p1x, p1z); ctx.lineTo(p2x, p2z);
              }
            }
          }
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    // county lines beneath everything
    ctx.strokeStyle = '#3d4438';
    ctx.lineWidth = 0.7;
    for (const c of GEO.counties ?? []) {
      for (const ring of c.rings) {
        ctx.beginPath();
        ring.forEach(([x, z], i) => { const [px, pz] = T(x, z); i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); });
        ctx.closePath(); ctx.stroke();
      }
    }
    // water below roads
    ctx.strokeStyle = '#3e7aa8';
    ctx.fillStyle = '#3e7aa8';
    for (const r of GEO.rivers) {
      ctx.lineWidth = /Rio Grande|Red River/.test(r.name) ? 1.4 : 0.7;
      ctx.beginPath();
      r.pts.forEach(([x, z], i) => { const [px, pz] = T(x, z); i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); });
      ctx.stroke();
    }
    for (const l of GEO.lakes) {
      ctx.beginPath();
      l.pts.forEach(([x, z], i) => { const [px, pz] = T(x, z); i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); });
      ctx.closePath(); ctx.fill();
    }
    // rail lines under the roads — dashed, dark neutral (cartographic rail ink)
    ctx.strokeStyle = '#6a6258';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([3, 3]);
    let nRails = 0;
    for (const r of GEO.rails ?? []) {
      nRails++;
      ctx.beginPath();
      r.pts.forEach(([x, z], i) => { const [px, pz] = T(x, z); i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); });
      ctx.stroke();
    }
    // band rails — wide layer only (Law: minimap layer stays untouched), faded like band arterials
    if (isWide) {
      ctx.setLineDash([3, 3]);
      ctx.globalAlpha = 0.6;
      for (const r of GEO.bandRails ?? []) {
        nRails++;
        ctx.beginPath();
        r.pts.forEach(([x, z], i) => { const [px, pz] = T(x, z); i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); });
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.setLineDash([]);
    this.mapStats = { rails: nRails }; // numeric layer assertion for the rails suite
    const roadStyle = {
      motorway: ['#c05040', 1.6], trunk: ['#907048', 0.8],
      primary: ['#6a6a52', 0.5], street: ['#4c5258', 0.4],
    };
    for (const h of GEO.highways) {
      [ctx.strokeStyle, ctx.lineWidth] = roadStyle[h.type];
      ctx.beginPath();
      h.pts.forEach(([x, z], i) => { const [px, pz] = T(x, z); i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); });
      ctx.stroke();
    }
    // band arterials — wide layer only (Law: minimap layer stays untouched), faded vs Texas roads
    if (isWide) {
      ctx.globalAlpha = 0.6;
      for (const h of GEO.bandHighways ?? []) {
        [ctx.strokeStyle, ctx.lineWidth] = roadStyle[h.type];
        ctx.beginPath();
        h.pts.forEach(([x, z], i) => { const [px, pz] = T(x, z); i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); });
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // airfields under the city dots — ✈ small for ranch strips; band fields wide-layer only
    ctx.fillStyle = '#8fc4f0'; ctx.textAlign = 'center';
    for (const apt of AIRPORTS) {
      if (apt.band && !isWide) continue;
      ctx.font = `${apt.tier === 3 ? 10 : 14}px system-ui`;
      const [px, pz] = T(apt.at[0], apt.at[1]);
      ctx.fillText('✈', px, pz + 4);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e8e0c8';
    for (const city of GEO.cities) {
      const [px, pz] = T(city.x, city.z);
      const r = Math.max(1.2, Math.sqrt(city.pop) / 500);
      ctx.beginPath(); ctx.arc(px, pz, r, 0, Math.PI * 2); ctx.fill();
    }
    // band city stars — silver, wide layer only (Law: gold is Texas, silver is abroad)
    if (isWide) {
      ctx.fillStyle = '#c7ccd4';
      for (const city of GEO.bandCities ?? []) {
        const [px, pz] = T(city.x, city.z);
        const r = Math.max(1.0, Math.sqrt(city.pop) / 500);
        ctx.beginPath(); ctx.arc(px, pz, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.font = '17px system-ui'; ctx.fillStyle = '#fff';
    for (const city of GEO.cities) {
      if (city.pop < 190000) continue;
      const [px, pz] = T(city.x, city.z);
      ctx.fillText(city.name, px + 7, pz + 4);
    }
    if (isWide) {
      ctx.font = '15px system-ui'; ctx.fillStyle = '#b8bcc4';
      for (const city of GEO.bandCities ?? []) {
        if (city.pop < 60000) continue;
        const [px, pz] = T(city.x, city.z);
        ctx.fillText(city.name, px + 6, pz + 4);
      }
    }
    return { canvas: c, T, sc };
  }

  toggleBigMap() { this.big.style.display = this.big.style.display === 'block' ? 'none' : 'block'; }

  setPaused(on) { this.els.paused.style.display = on ? 'flex' : 'none'; }

  toggleHelp(stats, ufoCount = 0, bank = 0, jobsDone = 0) {
    const open = this.els.help.style.display !== 'block';
    if (open && stats) {
      const h = Math.floor(stats.time / 3600), m = Math.floor((stats.time % 3600) / 60);
      document.getElementById('help-stats').textContent =
        `🚗 ${Math.round(stats.dist).toLocaleString()} km traveled · ⏱ ${h ? h + ' h ' : ''}${m} min · 🏁 top ${stats.top} mph` +
        (jobsDone > 0 ? ` · 📦 ${jobsDone} hauls · 💵 $${bank.toLocaleString()}` : '') +
        (ufoCount > 0 ? ` · 👽 ${ufoCount}` : '');
    }
    this.els.help.style.display = open ? 'block' : 'none';
  }

  cycleZoom() { this.zoomIdx = (this.zoomIdx + 1) % this.zoomLevels.length; }

  applyUiScale() { document.documentElement.style.fontSize = 10 * this.ui + 'px'; }

  // step the UI scale ±10% (dir ±1), clamped to 90%–200%; returns the label for the toast
  uiScale(dir) {
    this.ui = Math.round(Math.max(0.9, Math.min(2, this.ui + dir * 0.1)) * 10) / 10;
    this.applyUiScale();
    localStorage.setItem(slotKey(KEYS.uiScale), this.ui);
    return Math.round(this.ui * 100) + '%';
  }

  toggleCompass() {
    const off = this.compass.style.display !== 'none';
    this.compass.style.display = off ? 'none' : 'block';
    this.shield.classList.toggle('centered', off);
    localStorage.setItem(slotKey(KEYS.compass), off ? 'off' : 'on');
    return !off;
  }

  // sliding compass tape: cardinals, 15° ticks, degree readout, gold nearest-city pip
  drawCompass(player, city) {
    if (this.compass.style.display === 'none') return;
    const ctx = this.compass.getContext('2d');
    const W = this.compass.width, H = this.compass.height;
    ctx.clearRect(0, 0, W, H);
    // heading: 0 = north, increases counterclockwise in game space; compass shows clockwise degrees
    const deg = ((-player.heading * 180) / Math.PI % 360 + 360) % 360;
    const PX_PER_DEG = W / 120; // 120° field of view on the tape
    const label = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    ctx.textAlign = 'center';
    // walk absolute 15° tick marks inside the visible window (not offsets from the
    // heading — those only align with the grid when the heading itself is a multiple)
    for (let td = Math.ceil((deg - 60) / 15) * 15; td <= deg + 60; td += 15) {
      const d = ((td % 360) + 360) % 360;
      const x = W / 2 + (td - deg) * PX_PER_DEG;
      const cardinal = label[d];
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = cardinal ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x, H);
      ctx.lineTo(x, H - (cardinal ? 22 : d % 45 === 0 ? 16 : 10));
      ctx.stroke();
      if (cardinal) {
        ctx.font = 'bold 26px system-ui';
        ctx.fillStyle = cardinal === 'N' ? '#ff8866' : '#fff';
        ctx.fillText(cardinal, x, H - 32);
      }
    }
    // nearest-city pip
    if (city) {
      const cityDeg = ((Math.atan2(city.x - player.pos.x, -(city.z - player.pos.z)) * 180) / Math.PI % 360 + 360) % 360;
      let rel = cityDeg - deg;
      if (rel > 180) rel -= 360;
      if (rel < -180) rel += 360;
      const x = Math.max(10, Math.min(W - 10, W / 2 + rel * PX_PER_DEG));
      ctx.fillStyle = '#ffd35c';
      ctx.beginPath();
      ctx.arc(x, 12, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    // mission target diamond (same bearing math as the city pip; clamps at the ends)
    if (this.mission?.target) {
      const [mx, mz] = this.mission.target;
      const tDeg = ((Math.atan2(mx - player.pos.x, -(mz - player.pos.z)) * 180) / Math.PI % 360 + 360) % 360;
      let rel = tDeg - deg;
      if (rel > 180) rel -= 360;
      if (rel < -180) rel += 360;
      const x = Math.max(14, Math.min(W - 14, W / 2 + rel * PX_PER_DEG));
      this.diamond(ctx, x, 13, 8);
    }
    // center caret + degree readout
    ctx.fillStyle = '#ffd35c';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 8, 0); ctx.lineTo(W / 2 + 8, 0); ctx.lineTo(W / 2, 12);
    ctx.closePath(); ctx.fill();
    ctx.font = '20px system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.round(deg)}°`, 10, 30);
  }

  // official-looking Interstate/US/state-route markers, sized for legibility
  // at HUD scale rather than strict MUTCD proportions. Face raster is cached
  // — re-rasterized only when the route ref or night-state changes; the
  // sway/float motion is a pure CSS transform on the wrap (animateShield).
  drawShield(road) {
    let info = parseShield(road?.ref);
    // Persistence: nearestRoad(6) briefly flips to a cross-street/ramp near
    // interchanges and in cities, which would strobe the shield in and out.
    // When a numbered route is present, refresh the grace timer; when it drops
    // out, keep drawing the last shield until the timer (ticked down in
    // animateShield) expires. Shield→shield swaps stay instant — only
    // shield→nothing is delayed — so the verify checks (which poll for the
    // suppressed text ref) still pass.
    if (info) { this._shieldHold = SHIELD_HOLD; this._lastShieldRoad = road; }
    else if (this._shieldHold > 0 && this._lastShieldRoad) { road = this._lastShieldRoad; info = parseShield(road.ref); }
    this.shieldInfo = info;
    const night = ATMOS.night > 0.5;
    this.shieldNight = night;
    this.shield.classList.toggle('night', night);
    const key = `${road?.ref ?? ''}|${night}`;
    if (key === this._shieldKey) return; // same ref + night-state: skip the redraw
    this._shieldKey = key;
    this._shieldRaster++;
    const ctx = this.shieldCanvas.getContext('2d');
    const W = this.shieldCanvas.width, H = this.shieldCanvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!info) return;
    const cx = W / 2, cy = H / 2 + 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    if (info.shape === 'interstate') this.drawInterstateShield(ctx, cx, cy, info, night);
    else if (info.shape === 'us') this.drawUsShield(ctx, cx, cy, info, night);
    else this.drawCircleShield(ctx, cx, cy, info, night);
  }

  drawRailPlacard(rail, player) {
    if (!rail) {
      this.railInfo = null;
      this.railPlacard.style.display = 'none';
      return;
    }
    const name = railLabel(rail);
    if (!name) {
      this.railInfo = null;
      this.railPlacard.style.display = 'none';
      return;
    }
    this.railInfo = { name, dist: rail.dist };
    this.railPlacard.textContent = `🚂 ${name}`;
    this.railPlacard.style.display = 'block';
    this.railPlacard.classList.toggle('night', this.shieldNight);
  }

  // chrome-card helpers shared by the three shield shapes: an offset dark
  // copy of the path for faked extruded thickness, a metallic gradient face,
  // a clipped diagonal specular streak, a light bevel stroke, and (night) a
  // dark warm face + amber wireframe lattice traced over the same path
  chromeExtrude(ctx, path) {
    path(3, 4);
    ctx.fillStyle = '#0a0d16';
    ctx.fill();
  }

  chromeFace(ctx, path, x, y, w, h) {
    path();
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#f4f6fa');
    g.addColorStop(0.45, '#c7ccd6');
    g.addColorStop(0.55, '#eef1f6');
    g.addColorStop(1, '#a7adb9');
    ctx.fillStyle = g;
    ctx.fill();
  }

  // night "dark mode": a near-black warm (amber-tinted) face — the glow comes
  // from the amber outline/lattice/glyphs and the CSS bloom on the wrap
  nightFace(ctx, path, x, y, w, h) {
    path();
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#2a1f12');
    g.addColorStop(0.5, '#160f08');
    g.addColorStop(1, '#0a0603');
    ctx.fillStyle = g;
    ctx.fill();
  }

  // Interstate identity in the dark theme: the top-third banner as a deep navy
  // band + dark red stripe, softly backlit at their seams (a blue and a red
  // glow line), so the shield still reads as an Interstate without leaving the
  // dark palette. Clipped to the shield path; amber outline/number drawn after.
  nightBanner(ctx, path, x, y, w, h) {
    const bandH = h * 0.24, stripeH = h * 0.09, seam = y + bandH, stripeEnd = seam + stripeH;
    ctx.save();
    path();
    ctx.clip();
    const bg = ctx.createLinearGradient(0, y, 0, seam);
    bg.addColorStop(0, '#0d1a36');
    bg.addColorStop(1, '#1b3768');
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, bandH);
    ctx.fillStyle = '#511320';
    ctx.fillRect(x, seam, w, stripeH);
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#5a86e0'; ctx.shadowColor = '#5a86e0'; ctx.shadowBlur = 6; // blue glow at the band/stripe seam
    ctx.beginPath(); ctx.moveTo(x, seam); ctx.lineTo(x + w, seam); ctx.stroke();
    ctx.strokeStyle = '#e8465a'; ctx.shadowColor = '#e8465a'; // red glow under the stripe
    ctx.beginPath(); ctx.moveTo(x, stripeEnd); ctx.lineTo(x + w, stripeEnd); ctx.stroke();
    ctx.restore();
  }

  specularStreak(ctx, x, y, w, h) {
    const g = ctx.createLinearGradient(x, y, x + w * 0.6, y + h * 0.6);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.5)');
    g.addColorStop(0.55, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }

  bevelStroke(ctx, path) {
    path();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.stroke();
  }

  nightWireframe(ctx, path, x, y, w, h) {
    ctx.save();
    path();
    ctx.clip();
    ctx.strokeStyle = AMBER;
    ctx.shadowColor = AMBER;
    ctx.shadowBlur = 7;      // glowing amber edge (inner bloom; CSS adds the outer)
    ctx.globalAlpha = 0.95;
    path();
    ctx.lineWidth = 2.8;
    ctx.stroke();
    ctx.restore();
  }

  // glowing amber glyphs for the night face (reset shadow after)
  amberText(ctx, text, x, y) {
    ctx.save();
    ctx.fillStyle = AMBER_LIT;
    ctx.shadowColor = AMBER;
    ctx.shadowBlur = 8;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  drawInterstateShield(ctx, cx, cy, { num, tag }, night) {
    const w = 86, h = 94, top = cy - h / 2;
    const path = (ox = 0, oy = 0) => {
      const X = (v) => cx + v + ox, Y = (v) => top + v + oy;
      ctx.beginPath();
      ctx.moveTo(X(-w * 0.32), Y(0));
      ctx.lineTo(X(w * 0.32), Y(0));
      ctx.quadraticCurveTo(X(w * 0.5), Y(h * 0.06), X(w * 0.5), Y(h * 0.26));
      ctx.lineTo(X(w * 0.42), Y(h * 0.52));
      ctx.quadraticCurveTo(X(w * 0.3), Y(h * 0.8), X(0), Y(h));
      ctx.quadraticCurveTo(X(-w * 0.3), Y(h * 0.8), X(-w * 0.42), Y(h * 0.52));
      ctx.lineTo(X(-w * 0.5), Y(h * 0.26));
      ctx.quadraticCurveTo(X(-w * 0.5), Y(h * 0.06), X(-w * 0.32), Y(0));
      ctx.closePath();
    };
    this.chromeExtrude(ctx, path);
    if (night) {
      this.nightFace(ctx, path, cx - w / 2, top, w, h);
      this.nightBanner(ctx, path, cx - w / 2, top, w, h); // deep navy band + dark red stripe, backlit seams
    } else {
      this.chromeFace(ctx, path, cx - w / 2, top, w, h);
      ctx.save();
      path();
      ctx.clip();
      ctx.fillStyle = '#1c3f94';
      ctx.fillRect(cx - w / 2, top, w, h * 0.24);
      ctx.fillStyle = '#c8202e';
      ctx.fillRect(cx - w / 2, top + h * 0.24, w, h * 0.09);
      this.specularStreak(ctx, cx - w / 2, top, w, h);
      ctx.restore();
      path();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#0c1e50';
      ctx.stroke();
      this.bevelStroke(ctx, path);
    }
    // 3-char refs (I 410/610/635, I 35W/35E/69E) need to shrink to fit the
    // shield's narrowing lower half — don't just test the convenient 2-digit case
    const label = num + (tag ?? '');
    let size = 42;
    ctx.font = `bold ${size}px system-ui`;
    while (ctx.measureText(label).width > w * 0.62 && size > 18) {
      size -= 3;
      ctx.font = `bold ${size}px system-ui`;
    }
    this.shieldFit = { width: ctx.measureText(label).width, max: w * 0.62 };
    if (night) { this.amberText(ctx, label, cx, top + h * 0.70); }
    else { ctx.fillStyle = '#1c3f94'; ctx.fillText(label, cx, top + h * 0.70); }
    if (night) this.nightWireframe(ctx, path, cx - w / 2, top, w, h);
  }

  drawUsShield(ctx, cx, cy, { num }, night) {
    const w = 81, h = 88, top = cy - h / 2;
    const path = (ox = 0, oy = 0) => {
      const pts = [
        [cx - w * 0.22, top], [cx + w * 0.22, top],
        [cx + w * 0.5, top + h * 0.22], [cx + w * 0.5, top + h * 0.68],
        [cx + w * 0.3, top + h], [cx - w * 0.3, top + h],
        [cx - w * 0.5, top + h * 0.68], [cx - w * 0.5, top + h * 0.22],
      ];
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + ox, y + oy) : ctx.moveTo(x + ox, y + oy)));
      ctx.closePath();
    };
    this.chromeExtrude(ctx, path);
    if (night) {
      this.nightFace(ctx, path, cx - w / 2, top, w, h);
    } else {
      this.chromeFace(ctx, path, cx - w / 2, top, w, h);
      ctx.save();
      path();
      ctx.clip();
      this.specularStreak(ctx, cx - w / 2, top, w, h);
      ctx.restore();
      path();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#111';
      ctx.stroke();
      this.bevelStroke(ctx, path);
    }
    ctx.font = 'bold 14px system-ui';
    if (night) this.amberText(ctx, 'US', cx, top + h * 0.3);
    else { ctx.fillStyle = '#111'; ctx.fillText('US', cx, top + h * 0.3); }
    ctx.font = 'bold 34px system-ui';
    if (night) this.amberText(ctx, num, cx, top + h * 0.78);
    else { ctx.fillStyle = '#111'; ctx.fillText(num, cx, top + h * 0.78); }
    if (night) this.nightWireframe(ctx, path, cx - w / 2, top, w, h);
  }

  drawCircleShield(ctx, cx, cy, { num, label }, night) {
    const r = 39;
    const path = (ox = 0, oy = 0) => {
      ctx.beginPath();
      ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
    };
    this.chromeExtrude(ctx, path);
    if (night) {
      this.nightFace(ctx, path, cx - r, cy - r, r * 2, r * 2);
    } else {
      this.chromeFace(ctx, path, cx - r, cy - r, r * 2, r * 2);
      ctx.save();
      path();
      ctx.clip();
      this.specularStreak(ctx, cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
      path();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#111';
      ctx.stroke();
      this.bevelStroke(ctx, path);
    }
    const txt = (t, x, y) => (night ? this.amberText(ctx, t, x, y) : (ctx.fillStyle = '#111', ctx.fillText(t, x, y)));
    if (label) {
      ctx.font = 'bold 14px system-ui';
      txt(label, cx, cy - 10);
      ctx.font = `bold ${num.length > 3 ? 23 : 29}px system-ui`;
      txt(num, cx, cy + 20);
    } else {
      ctx.font = `bold ${num.length > 2 ? 29 : 36}px system-ui`;
      txt(num, cx, cy + 13);
    }
    if (night) this.nightWireframe(ctx, path, cx - r, cy - r, r * 2, r * 2);
  }

  // per-render-frame (not the ~12 Hz HUD tick): steer-driven sway + an
  // always-on idle "rock" on the INNER card's CSS transform. Perspective
  // lives on the OUTER #road-shield-wrap (a self-transformed element ignores
  // its own perspective; it only foreshortens a transformed CHILD), so the
  // rotation must land on shieldCard for the lean to actually be visible.
  //   • shieldSway — the pure steering component: GAIN turns DRIVE's tiny
  //     ±0.09 tilt into a readable ~±13° lean, damped for arcade smoothness.
  //     Kept separate so the verify sign-check reads it cleanly.
  //   • idle rock — a slow left-right YAW oscillation (the axis that reads as
  //     a 3D card turning; pitch alone was near-invisible), plus a little
  //     pitch and a vertical bob on offset periods so it always looks alive
  //     even driving dead straight.
  // Total yaw = shieldSway + idle yaw. Ungated by __skipRender (ticks headless).
  animateShield(player, dt) {
    const GAIN = 150, MAX_SWAY = 40;
    const target = Math.max(-MAX_SWAY, Math.min(MAX_SWAY, (player.tilt || 0) * GAIN));
    const rate = Math.min(1, dt * 8);
    this.shieldSway += (target - this.shieldSway) * rate;
    if (this._shieldHold > 0) this._shieldHold = Math.max(0, this._shieldHold - dt); // grace timer for shield persistence
    this._shieldFloat += dt;
    const w = (Math.PI * 2) / 3.4; // ~3.4 s base period — gentle, not frantic
    const idleYaw = Math.sin(this._shieldFloat * w) * 8;              // ±8° left-right rock (the visible axis)
    const idlePitch = Math.sin(this._shieldFloat * w * 0.7 + 1) * 4;  // ±4° pitch on an offset period
    const bob = Math.sin(this._shieldFloat * w * 0.5) * 2.5;          // ±2.5px vertical bob
    const yaw = this.shieldSway + idleYaw;
    this.shieldCard.style.transform = `translateY(${bob.toFixed(2)}px) rotateY(${yaw.toFixed(2)}deg) rotateX(${idlePitch.toFixed(2)}deg)`;
  }

  toast(msg) {
    this.els.toast.textContent = msg;
    this.els.toast.style.opacity = 1;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.els.toast.style.opacity = 0), 3200);
  }

  dialog(d) {
    if (!d) { this.els.dialog.style.display = 'none'; return; }
    this.els.dialog.querySelector('.npc-name').textContent = d.name;
    const sub = this.els.dialog.querySelector('.npc-sub');
    sub.textContent = d.sub || '';
    sub.style.display = d.sub ? 'block' : 'none';
    this.els.dialog.querySelector('.npc-text').textContent = d.text;
    this.els.dialog.style.display = 'block';
  }

  // tower radio: one line at a time, ~5 s each, queued (never overlapped —
  // a busy tower shouldn't stomp its own subtitle mid-sentence). A3: an
  // optional header identifies the transmitter above the quote
  // (📻 LONE STAR 23 · AUS → LBB)
  subtitle(text, header = null) {
    this.subtitleQ.push({ text, header });
    if (!this.subtitleBusy) this.pumpSubtitle();
  }

  pumpSubtitle() {
    const item = this.subtitleQ.shift();
    if (item == null) { this.subtitleBusy = false; return; }
    this.subtitleBusy = true;
    this.els.subtitleText.textContent = item.text;
    this.els.subtitleHeader.textContent = item.header ?? '';
    this.els.subtitleHeader.style.display = item.header ? 'block' : 'none';
    this.els.subtitle.style.opacity = 1;
    clearTimeout(this.subtitleTimer);
    this.subtitleTimer = setTimeout(() => {
      this.els.subtitle.style.opacity = 0;
      setTimeout(() => this.pumpSubtitle(), 350);
    }, 5000);
  }

  // A5 aircraft proximity tags: pooled DOM labels over any airborne source in
  // the scanner's window (radio.sources — one enumeration, two consumers),
  // world→screen projected at the HUD's 12 Hz, fading with distance
  updateTags(sources, camera) {
    const pool = this.tagPool;
    let i = 0;
    for (const s of sources ?? []) {
      if (!s.air || i >= pool.length) continue;
      this.tagV.set(s.x, s.y + 2.5, s.z).project(camera);
      if (this.tagV.z > 1 || this.tagV.z < -1) continue; // behind the camera
      const el = pool[i++];
      el.textContent = tagLabel(s);
      el.style.left = `${(this.tagV.x * 0.5 + 0.5) * innerWidth}px`;
      el.style.top = `${(-this.tagV.y * 0.5 + 0.5) * innerHeight}px`;
      el.style.opacity = Math.max(0.25, 1 - s.d / 60).toFixed(2);
      el.style.display = 'block';
    }
    for (; i < pool.length; i++) pool[i].style.display = 'none';
  }

  interactHint(label) {
    if (!label) { this.els.interact.style.display = 'none'; return; }
    this.els.interact.textContent = `E — ${label}`;
    this.els.interact.style.display = 'block';
  }

  brandSizeHint(on) {
    this.els.brandSize.style.display = on ? 'block' : 'none';
  }

  controlsBar(show) {
    this.els.controlsBar.style.display = show ? 'flex' : 'none';
  }

  // Crop and wildlife each own one slot. Re-appending only on the hidden→shown edge
  // is what fixes Y by arrival order: whoever is already up keeps its place and the
  // newcomer lands below it. A slot rewriting its own text never moves, and hiding
  // one lets the survivor slide up on its own — the rows are in-flow.
  natureSlot(el, text) {
    if (!text) { el.style.display = 'none'; return; }
    const arriving = el.style.display !== 'block';
    el.textContent = text;
    if (arriving) { el.style.display = 'block'; this.els.natureBox.appendChild(el); }
  }

  natureHint(crop, wildlife) {
    this.natureSlot(this.els.crop, crop);
    this.natureSlot(this.els.wildlife, wildlife);
  }

  update(player, counts, road, rail, water, clock, weatherIcon, stats, skyLine, county, forecast) {
    this.lastDist = stats?.dist ?? this.lastDist;
    this.els.sky.textContent = skyLine || '';
    // location line: airport name/code when inside its footprint (A1), else
    // nearest city + real distance
    const { city, dist } = nearestCity(player.pos.x, player.pos.z);
    const km = (dist * 0.1).toFixed(dist < 100 ? 1 : 0);
    const dx = player.pos.x - city.x, dz = player.pos.z - city.z;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const dir = dirs[Math.round(((Math.atan2(dx, -dz) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
    const co = county ? ` · ${county} Co.` : '';
    const apt = fieldNear(player.pos.x, player.pos.z);
    this.els.location.textContent = (apt ? `🛫 ${apt.name} (${apt.id}) — ${apt.city}`
      : dist < 3 ? `📍 ${city.name}` : `📍 ${km} km ${dir} of ${city.name}`) + co;
    // road when on one; water body when over one (both can show — bridges exist).
    // Numbered routes get a shield near the compass instead, so skip the redundant
    // text ref there; unshielded roads (plain street names) still show as text.
    this.drawShield(road);
    this.drawRailPlacard(rail, player);
    this.els.road.textContent = [road && !this.shieldInfo && !rail && `🛣 ${road.ref}`, water && `🌊 ${water}`].filter(Boolean).join('   ');
    this.els.speed.innerHTML = player.mode === 'WALK' ? '🚶'
      : `${player.speedMph} <small>mph</small><div id="hud-odo">${Math.round(this.lastDist ?? 0).toLocaleString()} km</div>`;
    const icons = { DRIVE: '🚙', FLY: '✈️', WALK: '🚶', BOAT: '🚤' };
    this.els.mode.textContent = `${weatherIcon} ${clock}${forecast ? ` · ${forecast}` : ''} · ${icons[player.mode]} ${player.mode}${player.mode === 'FLY' ? ` — alt ${Math.round(player.pos.y * 100 / 1000 * 10) / 10} km · F 🧨×${player.flares?.charges ?? 0}` : ''} — V to change`;
    // stamina bar: WALK only, fades in while sprinting or below a full tank
    const showStamina = player.mode === 'WALK' && (player.sprinting || player.stamina < 1);
    this.els.stamina.style.opacity = showStamina ? 1 : 0;
    this.els.staminaFill.style.width = `${Math.round((player.stamina ?? 1) * 100)}%`;
    this.els.staminaFill.style.backgroundColor = player.sprinting ? '#ff9a4a' : '#ffd35c';
    this.els.cities.textContent = counts.cities;
    this.els.landmarks.textContent = counts.landmarks;
    this.els.roses.textContent = counts.roses;
    this.els.critters.textContent = counts.species;
    this.els.legends.textContent = counts.legends ?? 0;
    this.els.counties.textContent = counts.counties;
    this.els.airports.textContent = counts.airports ?? 0;
    this.els.energy.textContent = counts.energy ?? 0;
    this.els.bank.textContent = (counts.bank ?? 0).toLocaleString();
    // active delivery line (set by main from missions.hudInfo)
    this.els.job.textContent = this.mission?.text ?? '';
    this.els.job.style.color = this.mission?.late ? '#ff7a66' : this.mission?.urgent ? '#ffb04a' : '#ffd35c';

    this.drawMini(player);
    this.drawCompass(player, city);
    if (this.big.style.display === 'block') this.drawBig(player);
  }

  drawMini(player) {
    const ctx = this.mini.getContext('2d');
    const W = this.mini.width, H = this.mini.height;
    ctx.clearRect(0, 0, W, H);
    // zoomed window around player from the prerendered layer (Texas-only —
    // the minimap Law keeps this layer/scale untouched by the shoulder/shelf)
    const [px, pz] = this.miniT(player.pos.x, player.pos.z);
    const zoom = this.zoomLevels[this.zoomIdx], sw = W / zoom, sh = H / zoom;
    ctx.drawImage(this.miniLayer, px - sw / 2, pz - sh / 2, sw, sh, 0, 0, W, H);
    // delivery target: gold diamond, clamped to the edge as a direction pointer
    if (this.mission?.target) {
      const [tx, tz] = this.miniT(this.mission.target[0], this.mission.target[1]);
      const mx = Math.max(10, Math.min(W - 10, (tx - px + sw / 2) * zoom));
      const my = Math.max(10, Math.min(H - 10, (tz - pz + sh / 2) * zoom));
      this.diamond(ctx, mx, my, 8);
    }
    // player arrow
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-player.heading + Math.PI);
    // boat identity (W3): the marker reads water-blue while afloat, both maps
    ctx.fillStyle = player.mode === 'BOAT' ? '#5cc8ff' : '#ffd35c';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    // notched chevron: sharp nose leads the heading, concave V-cut tail
    ctx.beginPath();
    ctx.moveTo(0, 11); ctx.lineTo(7, -7); ctx.lineTo(0, -3); ctx.lineTo(-7, -7);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  drawBig(player) {
    const ctx = this.bigCanvas.getContext('2d');
    const W = this.bigCanvas.width, H = this.bigCanvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this.mapLayer, 0, 0, W, H);
    const sx = W / this.mapLayer.width, sy = H / this.mapLayer.height;
    const [px, pz] = this.mapT(player.pos.x, player.pos.z);
    if (this.mission?.target) {
      const [tx, tz] = this.mapT(this.mission.target[0], this.mission.target[1]);
      this.diamond(ctx, tx * sx, tz * sy, 9);
    }
    // A5: airport codes next to the baked ✈ glyphs — drawn here (occasional
    // full-map redraws), not on the always-live minimap layer
    ctx.font = '12px system-ui'; ctx.fillStyle = '#8fc4f0'; ctx.textAlign = 'center';
    for (const l of this.airportLabels()) {
      const [lx, lz] = this.mapT(l.x, l.z);
      ctx.fillText(l.id, lx * sx, lz * sy + 15);
    }
    ctx.fillStyle = player.mode === 'BOAT' ? '#5cc8ff' : '#ffd35c';
    ctx.strokeStyle = '#000';
    ctx.beginPath(); ctx.arc(px * sx, pz * sy, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  // A5: plain data the big map's code labels are drawn from — not baked into
  // the shared offscreen layer, so the minimap (which does use that layer)
  // stays uncluttered; only the occasional full-map draw pays for these
  airportLabels() { return AIRPORTS.map((a) => ({ id: a.id, x: a.at[0], z: a.at[1] })); }

  diamond(ctx, x, y, r) {
    ctx.fillStyle = this.mission?.late ? '#ff7a66' : '#ffd35c';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}
