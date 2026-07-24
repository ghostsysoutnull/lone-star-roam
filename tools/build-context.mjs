#!/usr/bin/env node
// Build pipeline: neighbor-state (LA/AR/OK/NM) + Mexico OSM road/place extracts
// -> data/context.json — the Map W4 MAP-ONLY backdrop layer beyond the
// shoulder/shelf band. Nothing here is roamable; it never merges into
// GEO.bandHighways/bandCities/highways/cities and nothing indexes it.
// Usage: node tools/build-context.mjs [inputs-dir]  (default ~/claude-area/devel/tx-inputs)
//
// Inputs (data-scout prefetch, 2026-07-23, + the pre-existing band tier fetch):
//
//   US roads — the SAME full-state tier fetches band-highways.json already
//   consumes (see tools/build-band-roads.mjs header for the exact bboxes/
//   endpoints/query): band-la.json, band-ar.json, band-ok.json, band-nm.json.
//   Filtered here to tags.highway in {motorway, trunk} ONLY (that script's
//   primary/secondary tiers stay out of the context layer — this is a
//   backdrop, not a driveable network). map-context-la-ar-roads.json is
//   deliberately skipped: scout-flagged redundant with band-la/ar (same
//   motorway/trunk content, narrower bbox).
//
//   Mexico roads (recorded in map-context-QUERIES.txt):
//     map-context-mexico-roads-w.json:
//       [out:json][timeout:150];way["highway"~"^(motorway|trunk)$"]
//         (24.8277,-106.6457,31.9,-101.5);out geom;
//     map-context-mexico-roads-e.json:
//       [out:json][timeout:150];way["highway"~"^(motorway|trunk)$"]
//         (24.8277,-101.5,31.9,-97.0);out geom;
//     (mail.ru mirror; overpass-api.de reported "server busy" on the single
//     combined bbox — splitting E/W in two succeeded.)
//
//   Places (recorded in map-context-QUERIES.txt):
//     map-context-nm-places.json:
//       [out:json][timeout:90];(node["place"="city"](31.795,-107.067,36.862,-103.043);
//         node["place"="town"](31.795,-107.067,36.862,-103.043););out body;
//     map-context-okar-places.json:
//       [out:json][timeout:90];(node["place"="city"](33.0,-103.043,36.862,-92.335);
//         node["place"="town"](33.0,-103.043,36.862,-92.335););out body;
//     map-context-la-ar-places.json:
//       [out:json][timeout:60];(node["place"="city"](25.8401,-93.0951,36.5004,-92.3353);
//         node["place"="town"](25.8401,-93.0951,36.5004,-92.3353););out body;
//     map-context-mexico-places.json:
//       [out:json][timeout:120];(node["place"="city"](24.8277,-106.6457,31.9,-97.0);
//         node["place"="town"](24.8277,-106.6457,31.9,-97.0););out body;
//
// All GET via curl -sG --data-urlencode (POST 406s from this environment).
// No response carried a `remark` truncation warning.
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const inputsDir = process.argv[2] || join(homedir(), 'claude-area/devel/tx-inputs');
const load = (name) => JSON.parse(readFileSync(join(inputsDir, name), 'utf8')).elements;

// Same projection as tools/build-data.mjs (proj) / src/geo.js's LL() — keep in sync.
const LAT0 = 31.0, LON0 = -99.5;
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180);
const SCALE = 1 / 100;
const proj = ([lon, lat]) => [
  +((lon - LON0) * M_PER_DEG_LON * SCALE).toFixed(1),
  +(-(lat - LAT0) * M_PER_DEG_LAT * SCALE).toFixed(1),
];
const invProj = (x, z) => [x / (M_PER_DEG_LON * SCALE) + LON0, LAT0 - z / (M_PER_DEG_LAT * SCALE)];

// Douglas-Peucker simplification (DEGREES — GOTCHAS: simplify before proj,
// never after) — copied from build-data.mjs / build-band-roads.mjs.
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const sqTol = tol * tol;
  const sqSegDist = (p, a, b) => {
    let x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = b[0]; y = b[1]; }
      else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = p[0] - x; dy = p[1] - y;
    return dx * dx + dy * dy;
  };
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxD = 0, idx = 0;
    for (let i = first + 1; i < last; i++) {
      const d = sqSegDist(pts[i], pts[first], pts[last]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > sqTol) { keep[idx] = 1; stack.push([first, idx], [idx, last]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const TOL = 0.0025; // degrees — band-bake precedent

// --- geometry: border/islands (island-aware Texas union, GRILL F3) ---
const border = JSON.parse(readFileSync(join(ROOT, 'data', 'border.json'), 'utf8'));
const islands = JSON.parse(readFileSync(join(ROOT, 'data', 'islands.json'), 'utf8'));
const neighborStates = JSON.parse(readFileSync(join(ROOT, 'data', 'neighbor-states.json'), 'utf8'));
function inPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
// GRILL F3: this is the bake's OWN union test — geo.js's runtime inTexas()
// is the thing map-only checks must widen with onIsland(); the bake doesn't
// call into src/, it reimplements the union directly over the baked rings.
const inTx = (x, z) => inPoly(x, z, border) || islands.some((r) => inPoly(x, z, r));

const closestOnSeg = (x, z, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  const t = len2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / len2)) : 0;
  return [a[0] + dx * t, a[1] + dz * t];
};
const borderDistFn = (x, z) => {
  let best = Infinity;
  for (let i = 0, j = border.length - 1; i < border.length; j = i++) {
    const p = closestOnSeg(x, z, border[j], border[i]);
    const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
};
const SHOULDER_U = 402, SHELF_U = 1127; // src/geo.js constants — never hardcode the rectangle itself

// GEO.bounds — the SAME min/max-over-border.json computation src/geo.js runs at boot.
const bxs = border.map((p) => p[0]), bzs = border.map((p) => p[1]);
const bounds = {
  minX: Math.min(...bxs), maxX: Math.max(...bxs),
  minZ: Math.min(...bzs), maxZ: Math.max(...bzs),
};
// hud.js:135-137 arithmetic exactly: shoulder on the west/north US side, shelf
// (Gulf) to the east/south. Computed from the border at bake time, never hardcoded.
const rect = {
  minX: bounds.minX - SHOULDER_U, maxX: bounds.maxX + SHELF_U,
  minZ: bounds.minZ - SHOULDER_U, maxZ: bounds.maxZ + SHELF_U,
};
const insideRect = (x, z) => x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;

console.log(`Wide rectangle: x[${rect.minX.toFixed(1)}, ${rect.maxX.toFixed(1)}] z[${rect.minZ.toFixed(1)}, ${rect.maxZ.toFixed(1)}]`);

// ============================= ROADS =============================
// File order is load-bearing: US files first (band-la/ar/ok/nm), then MX
// (w, e) — a duplicate OSM way id anywhere in this combined order keeps its
// FIRST occurrence (GRILL F6: a Juárez-area way fetched by both the NM tier
// bbox and the Mexico bbox keeps its US-file copy and drops the MX dup,
// resolving the border-seam double-line risk without any geometry test).
const KEEP_TYPES = new Set(['motorway', 'trunk']);
const ROAD_FILES = [
  { file: 'band-la.json', cls: 'US', slabHint: 'LA' },
  { file: 'band-ar.json', cls: 'US', slabHint: 'AR' },
  { file: 'band-ok.json', cls: 'US', slabHint: 'OK' },
  { file: 'band-nm.json', cls: 'US', slabHint: 'NM' },
  { file: 'map-context-mexico-roads-w.json', cls: 'MX' },
  { file: 'map-context-mexico-roads-e.json', cls: 'MX' },
];

const seenWayIds = new Set();
let rawWays = 0, dupWays = 0;
const loadedWays = []; // {id, type, cls, pts:[[lon,lat],...]}
for (const { file, cls } of ROAD_FILES) {
  const elements = load(file);
  let kept = 0;
  for (const e of elements) {
    if (e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;
    const type = e.tags?.highway;
    if (!KEEP_TYPES.has(type)) continue;
    rawWays++;
    if (seenWayIds.has(e.id)) { dupWays++; continue; }
    seenWayIds.add(e.id);
    loadedWays.push({ id: e.id, type, cls, pts: e.geometry.map((g) => [g.lon, g.lat]) });
    kept++;
  }
  console.log(`  ${file}: ${kept} motorway/trunk ways kept`);
}
console.log(`Roads loaded: ${loadedWays.length} ways (${rawWays} raw motorway/trunk, ${dupWays} cross-file duplicates dropped)`);

let rawPtCount = 0, keptPtCount = 0;
const roadRuns = []; // {t, pts:[[x,z],...], cls}
for (const w of loadedWays) {
  let run = [];
  const flush = () => {
    if (run.length > 1) {
      rawPtCount += run.length;
      const s = simplify(run, TOL);
      keptPtCount += s.length;
      if (s.length > 1) roadRuns.push({ t: w.type, pts: s.map(proj), cls: w.cls });
    }
    run = [];
  };
  for (const p of w.pts) {
    const [x, z] = proj(p);
    const tx = insideRect(x, z) && inTx(x, z);
    const band = w.cls === 'US' && insideRect(x, z) && borderDistFn(x, z) <= SHOULDER_U;
    const keep = insideRect(x, z) && !tx && !band;
    if (keep) run.push(p); else flush();
  }
  flush();
}
const lenOf = (pts) => {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
};
const kmOf = (pts) => lenOf(pts) * 0.1; // 1 unit = 100 m

// Per-slab attribution (GRILL F6): geometry (neighbor-states.json polygons),
// NEVER source file — a bbox-fetch's content can geographically land in a
// neighbor slab other than the one its own tier fetch targeted.
const SLABS = ['NM', 'OK', 'AR', 'LA'];
const slabKm = { NM: 0, OK: 0, AR: 0, LA: 0 };
let unattributedKm = 0, mxKm = 0, usTotalKm = 0;
let eastStripKm = 0; // GRILL F1: LA+AR content east of lon -93.1
for (const r of roadRuns) {
  const km = kmOf(r.pts);
  if (r.cls === 'MX') { mxKm += km; continue; }
  usTotalKm += km;
  const mid = r.pts[Math.floor(r.pts.length / 2)];
  const slab = SLABS.find((s) => inPoly(mid[0], mid[1], neighborStates[s]));
  if (slab) slabKm[slab] += km; else unattributedKm += km;
  // east-strip: measured directly in degree space (pre-projection points
  // are gone by now, so re-derive lon via invProj of each segment midpoint)
  for (let i = 1; i < r.pts.length; i++) {
    const mx = (r.pts[i - 1][0] + r.pts[i][0]) / 2, mz = (r.pts[i - 1][1] + r.pts[i][1]) / 2;
    const [lon] = invProj(mx, mz);
    if (lon >= -93.1) eastStripKm += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]) * 0.1;
  }
}
console.log(`Points: ${rawPtCount} raw -> ${keptPtCount} kept after DP simplify (${(100 * keptPtCount / rawPtCount).toFixed(1)}%)`);
console.log(`Per-slab km (geometry-attributed): ${SLABS.map((s) => `${s} ${slabKm[s].toFixed(1)}`).join(', ')}, unattributed ${unattributedKm.toFixed(1)}`);
console.log(`US total: ${usTotalKm.toFixed(1)} km   MX total: ${mxKm.toFixed(1)} km`);
console.log(`East-strip (LA+AR, lon >= -93.1): ${eastStripKm.toFixed(1)} km`);

// --- coverage audit (GRILL F1): do the US tier bboxes jointly cover the
// wide rectangle's US-neighbor (LA/AR/OK/NM) portion? Restricted to points
// inside one of the neighbor-states.json rings — that IS "the US portion" by
// definition, and it cleanly excludes the Gulf/Mexico area a border-vertex
// proximity test would false-positive on (open Gulf water south of Louisiana
// resolves to the "nearest" border vertex being LA-side 'land', despite
// being nowhere near actual Arkansas/Louisiana/Oklahoma/New-Mexico land).
const US_BBOXES = [
  { lat0: 28.8, lon0: -94.4, lat1: 33.2, lon1: -91.8 }, // la
  { lat0: 32.8, lon0: -94.9, lat1: 36.7, lon1: -92.3 }, // ar
  { lat0: 33.3, lon0: -103.3, lat1: 37.2, lon1: -94.2 }, // ok
  { lat0: 31.1, lon0: -107.3, lat1: 37.2, lon1: -102.7 }, // nm
];
const coveredByUS = (lon, lat) => US_BBOXES.some((b) => lat >= b.lat0 && lat <= b.lat1 && lon >= b.lon0 && lon <= b.lon1);
const GRID = 60; // units (~6 km) — cheap, fine enough to catch a real missing-quadrant gap
let uncoveredFatal = [];
let acceptedGapSamples = 0;
for (let x = rect.minX; x <= rect.maxX; x += GRID) {
  for (let z = rect.minZ; z <= rect.maxZ; z += GRID) {
    if (inTx(x, z)) continue;
    if (!SLABS.some((s) => inPoly(x, z, neighborStates[s]))) continue;
    const [lon, lat] = invProj(x, z);
    if (coveredByUS(lon, lat)) continue;
    // Known accepted truncations (both north of the AR/LA bbox top 36.7):
    // the AR-north-of-36.7 sliver and the Missouri corner (no MO fetch).
    if (lat > 36.7) { acceptedGapSamples++; continue; }
    uncoveredFatal.push([lon.toFixed(3), lat.toFixed(3)]);
  }
}
console.log(`Coverage audit: ${acceptedGapSamples} sample points in the known-accepted north-of-36.7 sliver; ${uncoveredFatal.length} unexplained gap samples`);

// ============================= PLACES =============================
const PLACE_FILES = [
  { file: 'map-context-nm-places.json', cls: 'US' },
  { file: 'map-context-okar-places.json', cls: 'US' },
  { file: 'map-context-la-ar-places.json', cls: 'US' },
  { file: 'map-context-mexico-places.json', cls: 'MX' },
];
const CUTOFF = { US: 20000, MX: 50000 };
const seenNodeIds = new Set();
let nonNodeDropped = 0, dupNodes = 0, popParseDropped = 0, cutoffDropped = 0, noNameDropped = 0;
const bucketCounts = { US: 0, MX: 0 };
const placesRaw = [];
for (const { file, cls } of PLACE_FILES) {
  const elements = load(file);
  for (const e of elements) {
    if (e.type !== 'node') { nonNodeDropped++; continue; } // GRILL F7
    if (seenNodeIds.has(e.id)) { dupNodes++; continue; }
    seenNodeIds.add(e.id);
    if (!e.tags?.name) { noNameDropped++; continue; }
    const popStr = String(e.tags?.population ?? '').replace(/[ ,.]/g, '');
    const pop = parseInt(popStr, 10);
    if (!Number.isFinite(pop) || pop <= 0) { popParseDropped++; continue; }
    if (pop < CUTOFF[cls]) { cutoffDropped++; continue; }
    placesRaw.push({ name: e.tags.name, lon: e.lon, lat: e.lat, pop, cls });
  }
}

const places = [];
for (const p of placesRaw) {
  const [x, z] = proj([p.lon, p.lat]);
  if (!insideRect(x, z)) continue;
  if (inTx(x, z)) continue;
  if (p.cls === 'US' && borderDistFn(x, z) <= SHOULDER_U) continue; // band turf, not context
  places.push({ name: p.name, x, z, pop: p.pop });
  bucketCounts[p.cls]++;
}
places.sort((a, b) => b.pop - a.pop);
console.log(`Places: US ${bucketCounts.US} kept, MX ${bucketCounts.MX} kept (non-node dropped ${nonNodeDropped}, dup nodes ${dupNodes}, no-name dropped ${noNameDropped}, pop-parse dropped ${popParseDropped}, below cutoff ${cutoffDropped})`);

// ============================= GATES =============================
let failed = false;
const fail = (msg) => { console.error(`GATE FAIL: ${msg}`); failed = true; };

for (const s of SLABS) if (!(slabKm[s] > 300)) fail(`slab ${s} km ${slabKm[s].toFixed(1)} <= 300`);
if (!(usTotalKm > 4000)) fail(`US total km ${usTotalKm.toFixed(1)} <= 4000`);
if (!(mxKm > 3000)) fail(`MX total km ${mxKm.toFixed(1)} <= 3000`);
if (!(eastStripKm > 50)) fail(`east-strip (LA+AR, lon>=-93.1) km ${eastStripKm.toFixed(1)} <= 50`);
if (uncoveredFatal.length) fail(`coverage audit: ${uncoveredFatal.length} unexplained gaps, e.g. ${JSON.stringify(uncoveredFatal.slice(0, 5))}`);

const NAMED = {
  'Oklahoma City': false, Tulsa: false, Albuquerque: false, 'Santa Fe': false, Roswell: false,
  Monterrey: false, Chihuahua: false, 'Ciudad Juárez': false, Saltillo: false, 'Torreón': false,
};
for (const p of places) if (p.name in NAMED) NAMED[p.name] = true;
for (const [name, ok] of Object.entries(NAMED)) if (!ok) fail(`expected named place missing: ${name}`);
console.log(`Named places present: ${Object.entries(NAMED).map(([n, ok]) => `${n}:${ok ? 'Y' : 'N'}`).join(', ')}`);

let badTx = 0;
for (const r of roadRuns) for (const [x, z] of r.pts) if (inTx(x, z)) badTx++;
for (const p of places) if (inTx(p.x, p.z)) badTx++;
if (badTx) fail(`${badTx} shipped points classified inTexas (island-aware) after clipping`);

let badRect = 0;
for (const r of roadRuns) for (const [x, z] of r.pts) if (!insideRect(x, z)) badRect++;
for (const p of places) if (!insideRect(p.x, p.z)) badRect++;
if (badRect) fail(`${badRect} shipped points outside the wide rectangle`);

if (failed) { console.error('One or more gates FAILED — data/context.json NOT written.'); process.exit(1); }

// ============================= OUTPUT =============================
const out = {
  roads: roadRuns.map((r) => ({ t: r.t, pts: r.pts })),
  places: places.map((p) => ({ name: p.name, x: p.x, z: p.z, pop: p.pop })),
};
writeFileSync(join(ROOT, 'data', 'context.json'), JSON.stringify(out));
console.log(`Wrote data/context.json: ${out.roads.length} road polylines, ${out.places.length} places`);
console.log('All gates green.');
