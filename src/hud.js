// HUD: minimap + fullscreen map (border/highways pre-rendered once), text readouts, toasts, dialog.
import { Vector3 } from 'three';
import { GEO, nearestCity, inTexas, borderZoneAt, SHOULDER_U, SHELF_U, TIDELANDS_U, coastDist, borderDist, toLatLon } from './geo.js';
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

// Map W2: overlay layer tables — the big-map toggle bar. Fixed display order
// (button bar) is separate from the composite DRAW order (crops under
// everything, airports on top) applied in drawBig. Map W3 adds 'traffic' —
// it has NO lazy canvas (live movers, not baked ink), so it joins the
// button-bar list only, never LAYER_COMPOSITE_ORDER.
const LAYER_LIST = ['rails', 'energy', 'airports', 'counties', 'crops', 'traffic'];
const LAYER_COMPOSITE_ORDER = ['crops', 'counties', 'rails', 'energy', 'airports'];

// Map W3: live traffic glyphs + waypoint — shared constants (contract-fixed
// ink/sizes). WIND8 is the hud location-line 8-wind idiom, reused for the
// waypoint pill/toast/compass tick (bearing FROM player TO the waypoint —
// same convention as the mission diamond/compass-tick math, not the
// location line's city-relative-to-player sign).
const WIND8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function cardinalOf(dx, dz) {
  return WIND8[Math.round(((Math.atan2(dx, -dz) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
}
const TRAFFIC_GLYPH = {
  train: { shape: 'square', size: 6, fill: '#e8a33d', stroke: 'rgba(0,0,0,0.6)', lineWidth: 1 },
  ship: { shape: 'circle', size: 5, fill: '#5cb8e8', stroke: 'rgba(0,0,0,0.6)', lineWidth: 1 },
  shrimper: { shape: 'circle', size: 3.5, fill: '#8fd4ec', stroke: 'rgba(0,0,0,0.5)', lineWidth: 1 },
  aircraft: { shape: 'plane', size: 13, fill: '#eceff4', stroke: 'rgba(0,0,0,0.6)', lineWidth: 2 },
};
const WAYPOINT_INK = '#5ce0d8';
const CLEAR_PX = 14; // canvas px: re-click within this of the pin clears the waypoint
// same 11 dominant-crop ground colors as world.js CROP_STYLE — kept as its
// own table (2D canvas ink, not a THREE material) rather than importing
// world.js into hud.js (would cycle: world.js doesn't import hud.js today,
// but the ag/crop constants are cheap enough to duplicate here).
const CROP_LAYER_INK = {
  cotton: '#9fa878', rice: '#41704d', sorghum: '#a5673c', corn: '#5e7f3d', wheat: '#c7a44e',
  hay: '#99a057', peanuts: '#6e7f48', citrus: '#8a7a55', pecans: '#857550', sugarcane: '#4f8a3e',
  soybeans: '#6b8a4a',
};

// Map W4: hand-authored state/country labels over the baked context slabs —
// anchors chosen off-Texas/off-band by construction, drawn last in the layer.
// Nudging for the staged shot is expected; keep every label on-canvas.
const STATE_LABELS = [
  { name: 'NEW MEXICO', x: -5534, z: -3562 },
  { name: 'OKLAHOMA', x: 954, z: -5121 },
  { name: 'ARKANSAS', x: 5821, z: -4341 },
  { name: 'LOUISIANA', x: 6012, z: -334 },
  { name: 'MEXICO', x: -2863, z: 3896 },
];

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
      ports: document.getElementById('score-ports'),
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
    // Map W4: ONE offscreen layer serves both maps now — the old "minimap Law"
    // (separate Texas-only canvas, its own decoupled scale) is retired: the
    // Mexico/OK/AR/LA/NM context needs to show up on the minimap too (GRILL
    // F8). sc0 is the OLD Texas-only target scale (1360x1280 over GEO.bounds,
    // pad=20 baked into renderMapLayer); W/H are computed so the WIDENED
    // shoulder/shelf bounds render at that same sc0 — sharpness parity with
    // the pre-W4 Texas render. Integer W/H (Math.ceil) drift the actual sc a
    // few 1e-5 off sc0 — never assert exact equality against sc0 itself,
    // only miniSc === mapSc (same object) and |miniSc - sc0|/sc0 < 0.01.
    const b = GEO.bounds;
    const sc0 = Math.min(1360 / (b.maxX - b.minX), 1280 / (b.maxZ - b.minZ));
    const wideBounds = {
      minX: b.minX - SHOULDER_U, maxX: b.maxX + SHELF_U, // east = Gulf shelf too —
      minZ: b.minZ - SHOULDER_U, maxZ: b.maxZ + SHELF_U, // the coast runs SW–NE
    };
    const PAD2 = 40; // renderMapLayer's own pad=20, both axes
    const W = Math.ceil(sc0 * (wideBounds.maxX - wideBounds.minX) + PAD2);
    const H = Math.ceil(sc0 * (wideBounds.maxZ - wideBounds.minZ) + PAD2);
    const wideT0 = performance.now();
    const wide = this.renderMapLayer(W, H, wideBounds);
    // Boot-cost surface (always built, not URL-gated — the debug-suite idiom):
    // the wide layer's world-edge iso-lines sample borderDist ~258k times.
    this.wideLayerMs = performance.now() - wideT0;
    this.mapLayer = wide.canvas; this.mapT = wide.T; this.mapSc = wide.sc; this.mapInv = wide.inv;
    // miniLayer/miniT/miniSc are now plain aliases — drawMini and the
    // padre.mjs probes need no math change.
    this.miniLayer = this.mapLayer; this.miniT = this.mapT; this.miniSc = this.mapSc;
    // Map W2: overlay layer canvases — same size/transform as the wide layer,
    // rendered lazily (layerCanvas) so a persisted toggle costs nothing at
    // boot; only the first drawBig that needs a layer pays to build it.
    this.layerList = LAYER_LIST;
    this.layersOn = new Set();
    this.layerCanvases = {};
    try {
      const raw = localStorage.getItem(slotKey(KEYS.mapLayers));
      if (raw) for (const name of JSON.parse(raw)) if (this.layerList.includes(name)) this.layersOn.add(name);
    } catch { /* malformed/missing storage — start with all layers off */ }
    this.layerButtons = {};
    const layersBox = document.getElementById('map-layers');
    for (const btn of layersBox.querySelectorAll('button[data-layer]')) {
      const name = btn.dataset.layer;
      this.layerButtons[name] = btn;
      btn.addEventListener('click', () => this.toggleLayer(name));
    }
    document.getElementById('map-layers-base').addEventListener('click', () => this.clearLayers());
    this._syncLayerButtons();
    this.zoomLevels = [1.4, 2.4, 4.5];
    this.zoomIdx = 1;
    // big-map zoom (Map W1): level 0 is the classic full-extent view; deeper
    // levels window the same pre-rendered layer around the player
    this.bigZoomLevels = [1, 2, 4];
    this.bigZoomIdx = 0;
    // coordinate readout (W1.1): real lat/lon is a player feature — this is a
    // real-geography game; raw x/z rides along only under ?debug
    this.coordsEl = document.getElementById('map-coords');
    this.coordsText = document.getElementById('map-coords-text');
    this.showXZ = new URLSearchParams(location.search).has('debug');
    this.cursorPx = null; // big-canvas px under the mouse; null = follow the player
    this.bigCanvas.addEventListener('mousemove', (e) => { this.cursorPx = [e.offsetX, e.offsetY]; });
    this.bigCanvas.addEventListener('mouseleave', () => { this.cursorPx = null; });
    // Map W3: click sets/clears the waypoint — the sole big-map click gesture
    // now (W1.2's click-to-copy retired; copyCoords deleted). #map-coords
    // grows Copy/Maps buttons for the player's own position instead.
    this.bigCanvas.addEventListener('click', (e) => this.mapClick(e.offsetX, e.offsetY));
    this.waypoint = null; // { x, z } | null — session-only, no save key
    this.movers = null; // { trains, maritime, radio } — wired by main.js after construction
    this.trafficDrawn = { trains: 0, ships: 0, aircraft: 0 };
    this._player = null; // cached each update() tick — mapClick/copy/maps need it outside the draw loop
    document.getElementById('map-coords-copy').addEventListener('click', () => this.copyPlayerCoords());
    document.getElementById('map-coords-maps').addEventListener('click', () => this.openPlayerMaps());
    this.waypointEl = document.getElementById('map-waypoint');
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
    const inv = (px, pz) => [(px - pad) / sc + minX, (pz - pad) / sc + minZ]; // W1.1: layer px → world
    const isWide = bounds !== GEO.bounds;
    if (isWide) {
      ctx.fillStyle = '#171a14'; // faded band backdrop, dimmer than Texas' own fill
      ctx.fillRect(0, 0, W, H);
      for (const ring of Object.values(GEO.neighborStates ?? {})) {
        ctx.beginPath();
        ring.forEach(([x, z], i) => { const [px, pz] = T(x, z); i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); });
        ctx.closePath(); ctx.fillStyle = '#242a1e'; ctx.fill();
      }
      // Map W4.1: state lines — a second stroke-only pass (stroking inside
      // the fill loop would let a later state's fill half-cover the shared
      // edge). NM's south edge doubles as the US–Mexico border west of El
      // Paso; Texas' own gold border draws later and stays on top.
      ctx.strokeStyle = '#5d6452'; ctx.lineWidth = 1;
      for (const ring of Object.values(GEO.neighborStates ?? {})) {
        ctx.beginPath();
        ring.forEach(([x, z], i) => { const [px, pz] = T(x, z); i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); });
        ctx.closePath(); ctx.stroke();
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
    // Dash bands are measured ALONG the contour, not by cell checkerboard
    // (Map W1.1): a line riding a checkerboard diagonal stays on one color —
    // the bishop rule — and the old `(⌊x/80⌋+⌊z/80⌋)&1` skip left a 215u hole
    // in the shelf line off Lake Jackson, where the contour parallels the
    // coast diagonal. Project the cell midpoint onto the contour tangent
    // (perpendicular of the field gradient from the cell's corner values —
    // sign-stable, the gradient always points outward) and alternate 80u
    // bands of that arc-length-ish parameter instead.
    const dashOn = (v, mx, mz) => {
      const gx = v[1] + v[2] - v[0] - v[3], gz = v[2] + v[3] - v[0] - v[1];
      const L = Math.hypot(gx, gz) || 1;
      return (Math.floor((mz * gx - mx * gz) / (L * 80)) & 1) === 1;
    };
    // Tidelands line — big map only (the minimap Law). Marching squares on
    // the coastDist field (border-vertex normal offsets fail here: the coast
    // polygon wanders through bays, so offset points come out unordered).
    // Cell-local contour segments need no global ordering; skipping alternate
    // 80u bands gives the dashes. Two-level refinement keeps boot cheap.
    // Drawn-segment midpoints stay on `this.tidelands` for the verify suite.
    if (isWide && GEO.borderZones?.length) {
      this.tidelands = [];
      this.tidelandsDrawn = []; // dash midpoints only — the gap-regression surface
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
              if (!dashOn(v, mx, mz)) continue; // the dash gaps
              this.tidelandsDrawn.push([mx, mz]);
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
    // (SHOULDER_U; Mexico's edge is the river itself, already inked). Map W1
    // brightened the ink — the original #47535e "fainter than Tidelands" call
    // was unreadable in play; hue keeps it slate vs the Tidelands blue.
    // Display only: the wall lives in geo.js inWorld, never here.
    // Drawn-segment midpoints stay on `this.worldEdge` for the verify suite.
    if (isWide && GEO.borderZones?.length) {
      this.worldEdge = { sea: [], land: [] };
      this.worldEdgeDrawn = { sea: [], land: [] }; // dash midpoints only — gap regression
      ctx.save();
      ctx.strokeStyle = '#90a0b0'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
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
                if (!dashOn(v, mx, mz)) continue; // the dash gaps
                this.worldEdgeDrawn[out].push([mx, mz]);
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
    // World-edge seams (Map W1.2): where the dilation limit steps — the coast
    // shelf (1127u) meets the neighbor shoulder (402u) off the Sabine mouth,
    // the shelf meets Mexico's zero past the Rio Grande mouth, the shoulder
    // meets zero at the NM corner — the world boundary runs along the zone
    // divide between the two radii, and W3 never inked those stretches (Bruno
    // hit the Sabine one at 29.06° N). Marching squares on the per-zone limit
    // step function; dashes band on borderDist, which runs monotonically
    // along these radial seams (dashOn's tangent projection would freeze —
    // seams run along the gradient, not across it).
    // Boot-cost follow-up (Map W1.2 chunk): the coarse scan used to walk the
    // WHOLE wide extent (7,392 cells) for only ~105 non-uniform ones — the
    // seam only exists near the three real border corners where the dilation
    // radius steps. Gated to padded (+~400u) bounding boxes of the real seam
    // extents, recorded by a one-off full-scan probe. NOT derived from
    // borderZones flip vertices — those don't localize where the OFFSET
    // curves diverge (the El Paso seam's divide sits ~3,800u west of its
    // border-vertex anchor at (−3401,−1114), not at the map corner).
    if (isWide && GEO.borderZones?.length) {
      this.worldEdgeSeam = [];
      this.worldEdgeSeamDrawn = [];
      ctx.save();
      ctx.strokeStyle = '#90a0b0'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      const FINE = 20, COARSE = 160;
      const LIMITS = { coast: SHELF_U, land: SHOULDER_U, mexico: 0 };
      const zcache = new Map();
      const lim = (x, z) => {
        const k = x * 131072 + z;
        let v = zcache.get(k);
        if (v === undefined) { v = LIMITS[borderZoneAt(x, z)]; zcache.set(k, v); }
        return v;
      };
      const SEAM_GATES = [
        { minX: -7620, maxX: -6400, minZ: -1280, maxZ: -470 }, // El Paso NM/Mexico corner
        { minX: 1900, maxX: 3780, minZ: 5200, maxZ: 6010 },    // Rio Grande mouth
        { minX: 4940, maxX: 5840, minZ: 1480, maxZ: 3010 },    // Sabine mouth
      ];
      ctx.beginPath();
      for (const gate of SEAM_GATES) {
        const gMinX = Math.max(minX, gate.minX), gMaxX = Math.min(maxX, gate.maxX);
        const gMinZ = Math.max(minZ, gate.minZ), gMaxZ = Math.min(maxZ, gate.maxZ);
        for (let cx = gMinX; cx < gMaxX; cx += COARSE) {
          for (let cz = gMinZ; cz < gMaxZ; cz += COARSE) {
            const cs = [lim(cx, cz), lim(cx + COARSE, cz), lim(cx + COARSE, cz + COARSE), lim(cx, cz + COARSE)];
            if (cs[0] === cs[1] && cs[1] === cs[2] && cs[2] === cs[3]) continue;
            if (borderDist(cx + COARSE / 2, cz + COARSE / 2) > SHELF_U + 250) continue;
            for (let x = cx; x < cx + COARSE; x += FINE) {
              for (let z = cz; z < cz + COARSE; z += FINE) {
                const u = [lim(x, z), lim(x + FINE, z), lim(x + FINE, z + FINE), lim(x, z + FINE)];
                const E = [[x, z, x + FINE, z, u[0], u[1]], [x + FINE, z, x + FINE, z + FINE, u[1], u[2]],
                  [x + FINE, z + FINE, x, z + FINE, u[2], u[3]], [x, z + FINE, x, z, u[3], u[0]]];
                const hits = [];
                for (const [ax, az, bx, bz, ua, ub] of E)
                  if (ua !== ub) hits.push([(ax + bx) / 2, (az + bz) / 2]);
                if (hits.length < 2) continue;
                const mx = (hits[0][0] + hits[1][0]) / 2, mz = (hits[0][1] + hits[1][1]) / 2;
                const bd = borderDist(mx, mz);
                // the divide continues past both radii (inland below the small
                // limit, offshore beyond the large) — the seam is only between.
                // Below 50u the divide hugs the border polygon and the world
                // edge IS the border, already inked gold — no seam there.
                if (inTexas(mx, mz) || bd < Math.max(50, Math.min(...u) - 10) || bd > Math.max(...u) + 10) continue;
                this.worldEdgeSeam.push([mx, mz]);
                if ((Math.floor((bd - 50) / 80) & 1) === 1) continue; // dashes march down the radius, first band drawn
                this.worldEdgeSeamDrawn.push([mx, mz]);
                const [p1x, p1z] = T(hits[0][0], hits[0][1]), [p2x, p2z] = T(hits[1][0], hits[1][1]);
                ctx.moveTo(p1x, p1z); ctx.lineTo(p2x, p2z);
              }
            }
          }
        }
      }
      ctx.stroke();
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
    // Map W4: context — real US/Mexico roads+places beyond the shoulder/shelf
    // band (GEO.context, map-only overlay, never merged into gameplay arrays).
    // Spatially disjoint from Texas/band (clipped at the band seam at bake
    // time), so no isWide gate is needed — dimmer than band by alpha alone:
    // Texas 1.0 > band 0.6 > context 0.32, same hue family per tier.
    let nCtxRoads = 0, nCtxPlaces = 0, nCtxLabels = 0;
    ctx.globalAlpha = 0.32;
    for (const r of GEO.context?.roads ?? []) {
      nCtxRoads++;
      [ctx.strokeStyle, ctx.lineWidth] = roadStyle[r.t];
      ctx.beginPath();
      r.pts.forEach(([x, z], i) => { const [px, pz] = T(x, z); i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); });
      ctx.stroke();
    }
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#9aa2ac';
    for (const p of GEO.context?.places ?? []) {
      nCtxPlaces++;
      const [px, pz] = T(p.x, p.z);
      const r = Math.max(0.9, Math.sqrt(p.pop) / 550);
      ctx.beginPath(); ctx.arc(px, pz, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 0.8;
    ctx.font = '13px system-ui'; ctx.fillStyle = '#878e99'; ctx.textAlign = 'left';
    for (const p of GEO.context?.places ?? []) {
      if (!(p.pop >= 80000 || p.name === 'Roswell')) continue; // UFO-lore exception
      nCtxLabels++;
      const [px, pz] = T(p.x, p.z);
      ctx.fillText(p.name, px + 6, pz + 4);
    }
    ctx.globalAlpha = 1;
    this.contextDrawn = { roads: nCtxRoads, places: nCtxPlaces, labels: nCtxLabels };
    // Map W4: hand-authored state/country labels — drawn last in the layer
    this.stateLabels = STATE_LABELS.map(({ name, x, z }) => ({ name, x, z }));
    ctx.textAlign = 'center'; ctx.fillStyle = '#7e846f';
    for (const { name, x, z } of STATE_LABELS) {
      const [px, pz] = T(x, z);
      if (name === 'MEXICO') { ctx.font = '600 18px system-ui'; ctx.letterSpacing = '8px'; ctx.globalAlpha = 0.5; }
      else { ctx.font = '600 15px system-ui'; ctx.letterSpacing = '5px'; ctx.globalAlpha = 0.55; }
      ctx.fillText(name, px, pz);
    }
    ctx.globalAlpha = 1; ctx.letterSpacing = '0px'; ctx.textAlign = 'left';
    return { canvas: c, T, sc, inv };
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

  cycleBigZoom() { this.bigZoomIdx = (this.bigZoomIdx + 1) % this.bigZoomLevels.length; }

  // Map W3: click sets the waypoint at the clicked world point (same
  // bigWindow + mapInv math the retired copyCoords used); re-clicking within
  // CLEAR_PX of the current pin's own canvas px clears it instead — no
  // separate Clear button (the header pill text explains the gesture).
  mapClick(cx, cz) {
    if (!this.bigWindow || !this._player) return;
    const { x: wx, z: wz, w: sw, h: sh } = this.bigWindow;
    const [x, z] = this.mapInv(wx + cx * (sw / this.bigCanvas.width), wz + cz * (sh / this.bigCanvas.height));
    if (this.waypoint) {
      const [lx, lz] = this.mapT(this.waypoint.x, this.waypoint.z);
      const pcx = (lx - wx) * (this.bigCanvas.width / sw), pcz = (lz - wz) * (this.bigCanvas.height / sh);
      if (Math.hypot(cx - pcx, cz - pcz) <= CLEAR_PX) {
        this.waypoint = null;
        this.toast('⚑ Waypoint cleared');
        return;
      }
    }
    this.waypoint = { x, z };
    const dx = x - this._player.pos.x, dz = z - this._player.pos.z;
    const km = Math.round(Math.hypot(dx, dz) * 0.1);
    this.toast(`⚑ Waypoint set — ${km} km ${cardinalOf(dx, dz)}`);
  }

  // player-position widget (#map-coords): ALWAYS the player, never the
  // cursor (spec-resolved call) — toLatLon at 4 decimals for both actions.
  copyPlayerCoords() {
    if (!this._player) return;
    const [lat, lon] = toLatLon(this._player.pos.x, this._player.pos.z);
    const s = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    navigator.clipboard?.writeText(s).catch(() => {});
    // W3.1: success feedback — the icon-only button swaps 📋 → ✓ for a beat
    // (the :active push says "pressed", this says "it worked")
    const btn = document.getElementById('map-coords-copy');
    btn.textContent = '✓';
    clearTimeout(this._copyFlashT);
    this._copyFlashT = setTimeout(() => { btn.textContent = '📋'; }, 1000);
    this.toast(`Copied ${s}`);
  }

  openPlayerMaps() {
    if (!this._player) return;
    const [lat, lon] = toLatLon(this._player.pos.x, this._player.pos.z);
    window.open(`https://maps.google.com/?q=${lat.toFixed(4)},${lon.toFixed(4)}`);
  }

  // waypoint pin: teal flag (2px pole 10px tall + solid pennant), identical
  // size on both maps — per-blit ink like the player marker, drawn only
  // when the caller has already confirmed the point is inside the window.
  drawWaypointFlag(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = WAYPOINT_INK; ctx.fillStyle = WAYPOINT_INK; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x, y - 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - 10); ctx.lineTo(x + 8, y - 7); ctx.lineTo(x, y - 4);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // one glyph shape from the contract table, canvas px, world->px already applied by the caller
  drawTrafficGlyph(ctx, x, y, spec) {
    ctx.save();
    ctx.fillStyle = spec.fill; ctx.strokeStyle = spec.stroke; ctx.lineWidth = spec.lineWidth;
    const r = spec.size;
    // W3.1: aircraft use the base map's ✈ text idiom (silver + dark outline
    // vs the airports' static blue) — reads "plane" where a triangle didn't
    if (spec.shape === 'plane') {
      ctx.font = `${r}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeText('✈', x, y); ctx.fillText('✈', x, y);
      ctx.restore();
      return;
    }
    ctx.beginPath();
    if (spec.shape === 'square') ctx.rect(x - r, y - r, r * 2, r * 2);
    else if (spec.shape === 'circle') ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

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
    // Map W3: waypoint tick — same bearing math as the city pip / mission
    // diamond, clamped at the tape ends like the diamond
    if (this.waypoint) {
      const wDeg = ((Math.atan2(this.waypoint.x - player.pos.x, -(this.waypoint.z - player.pos.z)) * 180) / Math.PI % 360 + 360) % 360;
      let rel = wDeg - deg;
      if (rel > 180) rel -= 360;
      if (rel < -180) rel += 360;
      const x = Math.max(14, Math.min(W - 14, W / 2 + rel * PX_PER_DEG));
      ctx.fillStyle = WAYPOINT_INK;
      ctx.beginPath();
      ctx.moveTo(x - 7, 13 - 7); ctx.lineTo(x + 7, 13); ctx.lineTo(x - 7, 13 + 7);
      ctx.closePath(); ctx.fill();
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
    // Map W3: cached for mapClick/copyPlayerCoords/openPlayerMaps, which fire
    // outside the draw loop (DOM click handlers) and need the live player
    this._player = player;
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
    this.els.ports.textContent = counts.ports ?? 0;
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
    // Map W3: waypoint pin — own window math (this.miniT/px/pz/sw/sh above,
    // NOT the bigWindow/mapT/mapInv used by the big map), drawn only when
    // inside the current window, no edge clamping (unlike the mission diamond)
    if (this.waypoint) {
      const [wtx, wtz] = this.miniT(this.waypoint.x, this.waypoint.z);
      const mx = (wtx - px + sw / 2) * zoom, my = (wtz - pz + sh / 2) * zoom;
      if (mx >= 0 && mx <= W && my >= 0 && my <= H) this.drawWaypointFlag(ctx, mx, my);
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

  // ---- Map W2: overlay layers ------------------------------------------
  _persistLayers() {
    localStorage.setItem(slotKey(KEYS.mapLayers), JSON.stringify(this.layerList.filter((n) => this.layersOn.has(n))));
  }

  _syncLayerButtons() {
    for (const [name, btn] of Object.entries(this.layerButtons)) btn.classList.toggle('on', this.layersOn.has(name));
  }

  toggleLayer(name) {
    if (!this.layerList.includes(name)) return;
    if (this.layersOn.has(name)) this.layersOn.delete(name); else this.layersOn.add(name);
    this._persistLayers();
    this._syncLayerButtons();
  }

  clearLayers() {
    this.layersOn.clear();
    this._persistLayers();
    this._syncLayerButtons();
  }

  // Lazily renders + caches an offscreen canvas for one overlay layer, at the
  // wide map layer's exact size/transform (this.mapT/this.mapSc) so drawBig
  // can composite it with the same source-window args as the base layer.
  layerCanvas(name) {
    let c = this.layerCanvases[name];
    if (c) return c;
    c = document.createElement('canvas');
    c.width = this.mapLayer.width; c.height = this.mapLayer.height;
    this._drawLayer(name, c.getContext('2d'));
    this.layerCanvases[name] = c;
    return c;
  }

  _drawLayer(name, ctx) {
    if (name === 'rails') return this._drawRailsLayer(ctx);
    if (name === 'energy') return this._drawEnergyLayer(ctx);
    if (name === 'airports') return this._drawAirportsLayer(ctx);
    if (name === 'counties') return this._drawCountiesLayer(ctx);
    if (name === 'crops') return this._drawCropsLayer(ctx);
  }

  _strokeLine(ctx, pts) {
    if (!pts?.length) return;
    ctx.beginPath();
    pts.forEach(([x, z], i) => { const [px, pz] = this.mapT(x, z); i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); });
    ctx.stroke();
  }

  _strokeRing(ctx, ring) {
    if (!ring?.length) return;
    ctx.beginPath();
    ring.forEach(([x, z], i) => { const [px, pz] = this.mapT(x, z); i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); });
    ctx.closePath(); ctx.stroke();
  }

  _fillRing(ctx, ring) {
    if (!ring?.length) return;
    ctx.beginPath();
    ring.forEach(([x, z], i) => { const [px, pz] = this.mapT(x, z); i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); });
    ctx.closePath(); ctx.fill();
  }

  _drawRailsLayer(ctx) {
    ctx.save();
    ctx.strokeStyle = '#d8b97e'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = 1.0;
    for (const rail of GEO.rails) this._strokeLine(ctx, rail.pts);
    ctx.globalAlpha = 0.55;
    for (const rail of GEO.bandRails) this._strokeLine(ctx, rail.pts);
    ctx.restore();
  }

  _drawEnergyLayer(ctx) {
    const E = GEO.energy;
    ctx.save();
    ctx.strokeStyle = '#ffb64d'; ctx.fillStyle = '#ffb64d'; ctx.lineCap = 'round';
    ctx.lineWidth = 0.8; ctx.globalAlpha = 0.75;
    for (const l of E.lines345 ?? []) this._strokeLine(ctx, l.pts);
    ctx.lineWidth = 1.0; ctx.globalAlpha = 0.9;
    for (const f of E.windFarms ?? []) {
      const [px, pz] = this.mapT(f.x, f.z);
      const r = Math.max(2, Math.min(12, f.r * this.mapSc));
      ctx.beginPath(); ctx.arc(px, pz, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 0.9;
    for (const p of E.plants ?? []) {
      const [px, pz] = this.mapT(p.x, p.z);
      ctx.beginPath(); ctx.arc(px, pz, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1.0;
    for (const r of E.refineries ?? []) {
      const [px, pz] = this.mapT(r.x, r.z);
      ctx.fillRect(px - 1.5, pz - 1.5, 3.0, 3.0);
    }
    ctx.globalAlpha = 0.45;
    for (const s of E.substations ?? []) {
      const [px, pz] = this.mapT(s.x, s.z);
      ctx.beginPath(); ctx.arc(px, pz, 0.9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 0.8;
    for (const p of E.platforms ?? []) {
      const [px, pz] = this.mapT(p.x, p.z);
      ctx.beginPath(); ctx.arc(px, pz, 1.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  _drawAirportsLayer(ctx) {
    const TIER = { 1: { r: 5.0, lw: 1.4 }, 2: { r: 3.5, lw: 1.2 }, 3: { r: 2.5, lw: 1.0 } };
    ctx.save();
    ctx.strokeStyle = '#7ec8f0';
    for (const a of AIRPORTS) {
      const t = TIER[a.tier];
      if (!t) continue;
      ctx.lineWidth = t.lw;
      ctx.globalAlpha = a.band ? 0.55 : 1.0;
      const [px, pz] = this.mapT(a.at[0], a.at[1]);
      ctx.beginPath(); ctx.arc(px, pz, t.r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  _drawCountiesLayer(ctx) {
    ctx.save();
    ctx.strokeStyle = '#a8b890'; ctx.lineWidth = 0.9;
    ctx.globalAlpha = 0.95;
    for (const c of GEO.counties) for (const ring of c.rings) this._strokeRing(ctx, ring);
    ctx.globalAlpha = 0.5;
    for (const c of GEO.neighborCounties) this._strokeRing(ctx, c.ring);
    ctx.restore();
  }

  _drawCropsLayer(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    for (const c of GEO.counties) {
      const crop = GEO.ag?.[c.name]?.dominantCrop;
      const ink = crop && CROP_LAYER_INK[crop];
      if (!ink) continue;
      ctx.fillStyle = ink;
      for (const ring of c.rings) this._fillRing(ctx, ring);
    }
    ctx.globalAlpha = 0.2;
    for (const c of GEO.neighborCounties) {
      const crop = GEO.bandAg?.[`${c.state}|${c.name}`]?.dominantCrop;
      const ink = crop && CROP_LAYER_INK[crop];
      if (!ink) continue;
      ctx.fillStyle = ink;
      this._fillRing(ctx, c.ring);
    }
    ctx.restore();
  }

  drawBig(player) {
    const ctx = this.bigCanvas.getContext('2d');
    const W = this.bigCanvas.width, H = this.bigCanvas.height;
    ctx.clearRect(0, 0, W, H);
    // Map W1: source window on the pre-rendered layer — full extent at 1×,
    // else centered on the player and clamped inside the layer so the canvas
    // stays full at the edges. `bigWindow` is the numeric assertion surface.
    const LW = this.mapLayer.width, LH = this.mapLayer.height;
    const zoom = this.bigZoomLevels[this.bigZoomIdx];
    const sw = LW / zoom, sh = LH / zoom;
    const [px, pz] = this.mapT(player.pos.x, player.pos.z);
    const wx = Math.max(0, Math.min(LW - sw, px - sw / 2));
    const wz = Math.max(0, Math.min(LH - sh, pz - sh / 2));
    this.bigWindow = { x: wx, z: wz, w: sw, h: sh };
    ctx.drawImage(this.mapLayer, wx, wz, sw, sh, 0, 0, W, H);
    // Map W2: overlay layers, composited right after the base layer and
    // before the mission/label/marker draws — same source window as the base.
    for (const name of LAYER_COMPOSITE_ORDER) {
      if (this.layersOn.has(name)) ctx.drawImage(this.layerCanvas(name), wx, wz, sw, sh, 0, 0, W, H);
    }
    // coordinate readout: cursor position while the mouse roams the map, the
    // player otherwise (12 Hz with the rest of the draw)
    const [rx, rz] = this.cursorPx
      ? this.mapInv(wx + this.cursorPx[0] * (sw / W), wz + this.cursorPx[1] * (sh / H))
      : [player.pos.x, player.pos.z];
    const [lat, lon] = toLatLon(rx, rz);
    this.coordsText.textContent = `${this.cursorPx ? '⌖' : '➤'} ${lat.toFixed(2)}° N · ${(-lon).toFixed(2)}° W`
      + (this.showXZ ? `  ·  x ${rx.toFixed(0)} z ${rz.toFixed(0)}` : '');
    // one shared window transform: world coords → big-canvas px
    const Tw = (x, z) => { const [lx, lz] = this.mapT(x, z); return [(lx - wx) * (W / sw), (lz - wz) * (H / sh)]; };
    if (this.mission?.target) {
      const [tx, tz] = Tw(this.mission.target[0], this.mission.target[1]);
      // clamped to the edge as a direction pointer when zoom pushes it off-window
      this.diamond(ctx, Math.max(12, Math.min(W - 12, tx)), Math.max(12, Math.min(H - 12, tz)), 9);
    }
    // A5: airport codes next to the baked ✈ glyphs — drawn here (occasional
    // full-map redraws), not on the always-live minimap layer. Map W4: gated
    // on the airports overlay toggle like every other layer (was always-on).
    this.airportCodesDrawn = 0;
    if (this.layersOn.has('airports')) {
      ctx.font = '12px system-ui'; ctx.fillStyle = '#8fc4f0'; ctx.textAlign = 'center';
      for (const l of this.airportLabels()) {
        const [lx, lz] = Tw(l.x, l.z);
        ctx.fillText(l.id, lx, lz + 15);
        this.airportCodesDrawn++;
      }
    }
    // zoomed-in city names: the layer bakes only the ≥190k names — 2× adds
    // the mid-size towns in view, 4× names everything (live draw, map-open
    // only). Pop-priority collision skip: metro suburbs yield rather than
    // overlap (the Houston-crowding shot finding); the baked big-city names
    // seed the rect list so live labels dodge them too.
    if (zoom >= 2) {
      ctx.font = '13px system-ui'; ctx.fillStyle = '#e8e0c8'; ctx.textAlign = 'left';
      const minPop = zoom >= 4 ? 0 : 60000;
      const rect = (cx, cz, w) => ({ x0: cx + 6, x1: cx + 6 + w, z0: cz - 8, z1: cz + 8 });
      const hits = (r, list) => list.some((d) => r.x0 < d.x1 && r.x1 > d.x0 && r.z0 < d.z1 && r.z1 > d.z0);
      const drawn = [];
      for (const c of GEO.cities) {
        if (c.pop < 190000) continue; // baked at 17 layer-px, scaled by the window
        const [cx, cz] = Tw(c.x, c.z);
        drawn.push(rect(cx, cz, ctx.measureText(c.name).width * (17 / 13) * (W / sw)));
      }
      const live = GEO.cities.filter((c) => c.pop < 190000 && c.pop >= minPop).sort((a, b) => b.pop - a.pop);
      for (const c of live) {
        const [cx, cz] = Tw(c.x, c.z);
        if (cx < -40 || cx > W + 10 || cz < 0 || cz > H) continue;
        const r = rect(cx, cz, ctx.measureText(c.name).width);
        if (hits(r, drawn)) continue;
        drawn.push(r);
        ctx.fillText(c.name, cx + 6, cz + 4);
      }
      ctx.textAlign = 'center';
    }
    // scale bar (miles) + zoom factor, bottom-left; `scaleBar` for the checks
    const miles = [100, 50, 25][this.bigZoomIdx];
    const barPx = miles * 16.093 * this.mapSc * (W / sw);
    this.scaleBar = { miles, px: barPx };
    ctx.strokeStyle = '#e8e0c8'; ctx.fillStyle = '#e8e0c8'; ctx.lineWidth = 2; ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(16, H - 18); ctx.lineTo(16 + barPx, H - 18);
    ctx.moveTo(16, H - 23); ctx.lineTo(16, H - 13);
    ctx.moveTo(16 + barPx, H - 23); ctx.lineTo(16 + barPx, H - 13);
    ctx.stroke();
    ctx.font = '12px system-ui'; ctx.textAlign = 'left';
    ctx.fillText(`${miles} mi`, 16 + barPx + 8, H - 14);
    ctx.fillText(`${zoom}×`, 16, H - 30);
    // Map W3: live traffic glyphs — read-only enumerations off the already-
    // live mover systems (no new scans), redrawn every blit since movers
    // keep moving; off-window glyphs are skipped, no edge clamping.
    // trafficDrawn is the check surface, always present after this runs.
    if (this.layersOn.has('traffic') && this.movers) {
      const { trains, maritime, radio } = this.movers;
      const counts = { trains: 0, ships: 0, aircraft: 0 };
      const inWin = (x, z) => x >= 0 && x <= W && z >= 0 && z <= H;
      if (trains) for (const tr of trains.trains) {
        const [tx0, tz0] = trains.at(tr.rail, tr.s);
        const [gx, gz] = Tw(tx0, tz0);
        if (!inWin(gx, gz)) continue;
        this.drawTrafficGlyph(ctx, gx, gz, TRAFFIC_GLYPH.train);
        counts.trains++;
      }
      if (maritime) {
        for (const s of maritime.ships) {
          const [gx, gz] = Tw(s.g.position.x, s.g.position.z);
          if (!inWin(gx, gz)) continue;
          this.drawTrafficGlyph(ctx, gx, gz, TRAFFIC_GLYPH.ship);
          counts.ships++;
        }
        for (const s of maritime.shrimpers) {
          const [gx, gz] = Tw(s.g.position.x, s.g.position.z);
          if (!inWin(gx, gz)) continue;
          this.drawTrafficGlyph(ctx, gx, gz, TRAFFIC_GLYPH.shrimper);
          counts.ships++;
        }
      }
      if (radio) for (const s of radio.sources) {
        if (!s.air) continue;
        const [gx, gz] = Tw(s.x, s.z);
        if (!inWin(gx, gz)) continue;
        this.drawTrafficGlyph(ctx, gx, gz, TRAFFIC_GLYPH.aircraft);
        counts.aircraft++;
      }
      this.trafficDrawn = counts;
    } else {
      this.trafficDrawn = { trains: 0, ships: 0, aircraft: 0 };
    }
    // Map W3: waypoint pin + header pill — per-blit ink like the player
    // marker; distance/cardinal are always player->waypoint, recomputed live.
    if (this.waypoint) {
      const [wgx, wgz] = Tw(this.waypoint.x, this.waypoint.z);
      if (wgx >= 0 && wgx <= W && wgz >= 0 && wgz <= H) this.drawWaypointFlag(ctx, wgx, wgz);
      const dx = this.waypoint.x - player.pos.x, dz = this.waypoint.z - player.pos.z;
      const km = Math.round(Math.hypot(dx, dz) * 0.1);
      this.waypointEl.textContent = `⚑ Waypoint · ${km} km ${cardinalOf(dx, dz)} — click the pin to clear`;
      this.waypointEl.style.display = 'block';
    } else {
      this.waypointEl.style.display = 'none';
    }
    // player marker: the minimap's heading chevron, sized up — not a dot
    const [ax, az] = Tw(player.pos.x, player.pos.z);
    ctx.save();
    ctx.translate(ax, az);
    ctx.rotate(-player.heading + Math.PI);
    ctx.fillStyle = player.mode === 'BOAT' ? '#5cc8ff' : '#ffd35c';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, 14); ctx.lineTo(9, -9); ctx.lineTo(0, -4); ctx.lineTo(-9, -9);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
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
