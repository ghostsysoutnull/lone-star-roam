#!/usr/bin/env node
// Build pipeline: 8 Overpass GET extracts -> data/energy.json
// Usage: node tools/build-energy.mjs [inputs-dir]  (default ~/claude-area/devel/tx-inputs)
// See ENERGY_SPEC.md "Data" section for the source counts this was verified
// against (2026-07-17). Overpass POST 406s from this environment — GET only.
// Mirror maps.mail.ru/osm/tools/overpass handles the heavy layers (wells,
// turbines); overpass-api.de is the fallback (band-roads idiom).
//
// TX bbox 25.6,-107.0,36.8,-93.2; Gulf bbox 25.8,-97.6,29.9,-93.2 (offshore
// platforms + fairways only — never the TX bbox for those two).
//
// Recorded queries (curl -sG <endpoint> --data-urlencode "data=<query>"):
//
//   wells        (node["man_made"="petroleum_well"](TXBBOX);
//                 way["man_made"="petroleum_well"](TXBBOX););out center;
//   turbines     node["power"="generator"]["generator:source"="wind"](TXBBOX);out;
//   plants       (way["power"="plant"](TXBBOX);
//                 relation["power"="plant"](TXBBOX););out tags geom;
//   refineries   (way["industrial"="refinery"](TXBBOX);
//                 relation["industrial"="refinery"](TXBBOX);
//                 way["man_made"="works"]["product"~"oil|petroleum|fuel"](TXBBOX);
//                 relation["man_made"="works"]["product"~"oil|petroleum|fuel"](TXBBOX);
//                );out center tags;
//   lines345     way["power"="line"]["voltage"~"(^|;)345000(;|$)"](TXBBOX);
//                out tags geom;
//   substations  (node["power"="substation"]["voltage"](TXBBOX);
//                 way["power"="substation"]["voltage"](TXBBOX););out center tags;
//   platforms    (node["man_made"="offshore_platform"](GULFBBOX);
//                 way["man_made"="offshore_platform"](GULFBBOX););out center tags;
//   fairways     (way["seamark:type"="fairway"](GULFBBOX);
//                 way["waterway"="fairway"](GULFBBOX););out geom;
//
// voltage["voltage"~"(^|;)345000(;|$)"] matches 345000 as one whole
// semicolon-delimited token — never split(';')[0] (the band-roads
// concurrency defect's idiom; OSM voltage is multi-value, e.g.
// "345000;138000", and the first value is not always the highest).
//
// Raw fetches stash in ~/claude-area/devel/tx-inputs/energy-<layer>.json, not
// the repo (same convention as band-*.json / tx_county_census2022.txt.gz).
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const inputsDir = process.argv[2] || join(homedir(), 'claude-area/devel/tx-inputs');
const load = (name) => JSON.parse(readFileSync(join(inputsDir, `energy-${name}.json`), 'utf8')).elements;

// --- projection (must match tools/build-data.mjs's `proj` / src/geo.js's LL) ---
const LAT0 = 31.0, LON0 = -99.5;
const M_PER_DEG_LAT = 111320, M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180);
const proj = (lon, lat) => [
  +((lon - LON0) * M_PER_DEG_LON / 100).toFixed(1),
  +(-(lat - LAT0) * M_PER_DEG_LAT / 100).toFixed(1),
];

// element -> [lon,lat] centroid: node direct, way/relation `center`, or the
// mean of `geometry`/member geometry when only "out geom" was fetched.
function centroidOf(el) {
  if (el.type === 'node' && el.lat != null) return [el.lon, el.lat];
  if (el.center) return [el.center.lon, el.center.lat];
  const pts = [];
  if (el.geometry) for (const p of el.geometry) if (p) pts.push(p);
  if (el.members) for (const m of el.members) {
    if (m.type === 'node' && m.lat != null) pts.push({ lon: m.lon, lat: m.lat });
    else if (m.geometry) for (const p of m.geometry) if (p) pts.push(p);
  }
  if (!pts.length) return null;
  return [pts.reduce((s, p) => s + p.lon, 0) / pts.length, pts.reduce((s, p) => s + p.lat, 0) / pts.length];
}

// --- point-in-county (offline copy of geo.js's countyAt — tools scripts
// never import src/, band-roads/rails idiom) ---
const counties = JSON.parse(readFileSync(join(ROOT, 'data', 'counties.json'), 'utf8'));
for (const c of counties) {
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const ring of c.rings) for (const [x, z] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  c.bbox = [minX, maxX, minZ, maxZ];
}
function inRings(x, z, rings) {
  for (const poly of rings) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i], [xj, zj] = poly[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}
function countyAt(x, z) {
  for (const c of counties) {
    const [minX, maxX, minZ, maxZ] = c.bbox;
    if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
    if (inRings(x, z, c.rings)) return c.name;
  }
  return null;
}
const ringArea = (ring) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(a) / 2;
};

// --- Ramer-Douglas-Peucker simplify, GAME UNITS this time (already
// projected) — tolerance is in units, not degrees (unlike build-data.mjs's
// pre-proj degree tolerance; keep straight, the sacred-counts gotcha is
// about NOT reversing that order, not about a fixed number). ---
function simplify(pts, tol = 1.5) {
  if (pts.length < 3) return pts;
  const sqTol = tol * tol;
  const sqSegDist = (p, a, b) => {
    let [x, y] = a;
    let dx = b[0] - x, dy = b[1] - y;
    if (dx || dy) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { [x, y] = b; }
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
    let maxD = 0, index = first;
    for (let i = first + 1; i < last; i++) {
      const d = sqSegDist(pts[i], pts[first], pts[last]);
      if (d > maxD) { maxD = d; index = i; }
    }
    if (maxD > sqTol) { keep[index] = 1; stack.push([first, index], [index, last]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// --- cell-bin + flood-fill clustering (turbine idiom, reused for offshore
// platform tiering) ---
function clusterPoints(points, cell) {
  const cellKey = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  const cells = new Map();
  for (const p of points) {
    const k = cellKey(p.x, p.z);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(p);
  }
  const visited = new Set();
  const clusters = [];
  for (const k of cells.keys()) {
    if (visited.has(k)) continue;
    const stack = [k]; visited.add(k);
    const group = [];
    while (stack.length) {
      const ck = stack.pop();
      group.push(...cells.get(ck));
      const [cx, cz] = ck.split(',').map(Number);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const nk = `${cx + dx},${cz + dz}`;
        if (cells.has(nk) && !visited.has(nk)) { visited.add(nk); stack.push(nk); }
      }
    }
    clusters.push(group);
  }
  return clusters;
}

// =================================================================
// Wells — per-county count + density (ag idiom: all 254 counties always
// present, most legitimately at wells:0; the integrity signal is the
// ORPHAN count — wells landing in no county polygon — not a match tally).
// =================================================================
const wellsRaw = load('wells');
const countyRec = {};
for (const c of counties) countyRec[c.name] = { wells: 0 };
let wellOrphans = 0;
for (const el of wellsRaw) {
  const c = centroidOf(el);
  if (!c) { wellOrphans++; continue; }
  const [x, z] = proj(c[0], c[1]);
  const name = countyAt(x, z);
  if (name) countyRec[name].wells++;
  else wellOrphans++;
}
for (const c of counties) {
  const areaKm2 = c.rings.reduce((s, r) => s + ringArea(r), 0) * 0.01;
  countyRec[c.name].wellKm2 = areaKm2 > 0 ? +(countyRec[c.name].wells / areaKm2).toFixed(3) : 0;
}
console.log(`wells: ${wellsRaw.length} raw, ${wellOrphans} orphans (${(100 * wellOrphans / wellsRaw.length).toFixed(1)}%), 254 counties in output`);

// =================================================================
// Turbines — cell-bin (20u ~= 2km) + flood-fill cluster into farms.
// =================================================================
const turbRaw = load('turbines');
const turbPts = [];
for (const el of turbRaw) {
  if (el.type !== 'node') continue;
  const [x, z] = proj(el.lon, el.lat);
  turbPts.push({ x, z });
}
const windFarms = clusterPoints(turbPts, 20).map((group) => {
  const cx = group.reduce((s, p) => s + p.x, 0) / group.length;
  const cz = group.reduce((s, p) => s + p.z, 0) / group.length;
  const r = Math.max(...group.map((p) => Math.hypot(p.x - cx, p.z - cz)), 20);
  return { x: +cx.toFixed(1), z: +cz.toFixed(1), count: group.length, r: +r.toFixed(1) };
});
console.log(`turbines: ${turbRaw.length} raw -> ${windFarms.length} farm clusters`);

// =================================================================
// Plants — kept individual (1,422 is small). Solar polygons additionally
// keep a footprint radius from their raw geometry extent.
// =================================================================
const plantsRaw = load('plants');
const plants = [];
let solarCount = 0;
for (const el of plantsRaw) {
  const c = centroidOf(el);
  if (!c) continue;
  const [x, z] = proj(c[0], c[1]);
  const tags = el.tags || {};
  const source = tags['plant:source'] || tags['generator:source'] || null;
  const rec = { x: +x.toFixed(1), z: +z.toFixed(1), source };
  if (tags.name) rec.name = tags.name;
  if (tags.operator) rec.operator = tags.operator;
  if (source === 'solar') {
    solarCount++;
    const geomPts = (el.geometry || []).filter(Boolean).map((p) => proj(p.lon, p.lat));
    if (geomPts.length > 1) {
      let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      for (const [px, pz] of geomPts) { if (px < minX) minX = px; if (px > maxX) maxX = px; if (pz < minZ) minZ = pz; if (pz > maxZ) maxZ = pz; }
      rec.r = +(Math.max(maxX - minX, maxZ - minZ) / 2).toFixed(1);
    }
  }
  plants.push(rec);
}
console.log(`plants: ${plantsRaw.length} raw -> ${plants.length} kept, ${solarCount} solar (${plants.filter((p) => p.name).length} named)`);

// =================================================================
// Refineries — industrial=refinery + man_made=works w/ oil product tags.
// =================================================================
const refRaw = load('refineries');
const refineries = [];
for (const el of refRaw) {
  const c = centroidOf(el);
  if (!c) continue;
  const [x, z] = proj(c[0], c[1]);
  const tags = el.tags || {};
  const rec = { x: +x.toFixed(1), z: +z.toFixed(1) };
  if (tags.name) rec.name = tags.name;
  if (tags.operator) rec.operator = tags.operator;
  refineries.push(rec);
}
console.log(`refineries: ${refRaw.length} raw -> ${refineries.length} kept`);

// =================================================================
// Transmission — 345 kV only (pre-filtered server-side by the token-anchored
// voltage regex). Stitch touching way endpoints into corridors: BIDIRECTIONAL
// (grid segment ways alternate direction along a corridor, unlike the rails
// idiom's single-direction chaining — matching starts-only left 75% of ways
// unmerged) — an endpoint index keyed by either end, walked outward from
// both the tail and the head of the growing chain, reversing a candidate's
// points when it joins reversed. Then simplify.
// =================================================================
const linesRaw = load('lines345').filter((el) => el.type === 'way' && el.geometry);
const llKey = (p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`;
const endpointMap = new Map(); // key -> [{i, end: 'start'|'end'}]
const addEndpoint = (k, i, end) => {
  if (!endpointMap.has(k)) endpointMap.set(k, []);
  endpointMap.get(k).push({ i, end });
};
for (let i = 0; i < linesRaw.length; i++) {
  const g = linesRaw[i].geometry.filter(Boolean);
  if (g.length < 2) continue;
  addEndpoint(llKey(g[0]), i, 'start');
  addEndpoint(llKey(g[g.length - 1]), i, 'end');
}
const usedLine = new Set();
const corridorsRaw = [];
for (let i = 0; i < linesRaw.length; i++) {
  if (usedLine.has(i)) continue;
  usedLine.add(i);
  let pts = linesRaw[i].geometry.filter(Boolean);
  // extend the tail forward
  for (;;) {
    const k = llKey(pts[pts.length - 1]);
    const cand = (endpointMap.get(k) || []).find((e) => !usedLine.has(e.i));
    if (!cand) break;
    usedLine.add(cand.i);
    let g = linesRaw[cand.i].geometry.filter(Boolean);
    if (cand.end === 'end') g = g.slice().reverse();
    pts.push(...g.slice(1));
  }
  // extend the head backward
  for (;;) {
    const k = llKey(pts[0]);
    const cand = (endpointMap.get(k) || []).find((e) => !usedLine.has(e.i));
    if (!cand) break;
    usedLine.add(cand.i);
    let g = linesRaw[cand.i].geometry.filter(Boolean);
    if (cand.end === 'start') g = g.slice().reverse();
    pts.unshift(...g.slice(0, -1));
  }
  corridorsRaw.push(pts);
}
const projected = corridorsRaw.map((pts) => simplify(pts.map((p) => proj(p.lon, p.lat)))).filter((pts) => pts.length > 1);
// Drop sub-500m 2-point leftovers: measured 89% of them sit within 300u of a
// baked substation — internal busbar/jumper wiring inside the yard fence,
// not corridor geometry a player would ever follow. Real long-haul spans
// stitch to >2 points already; this only prunes yard noise (logged, not
// silent — the drop count is part of the bake's console report).
const droppedJumpers = projected.filter((pts) => pts.length === 2 && Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) < 5).length;
const lines345 = projected
  .filter((pts) => !(pts.length === 2 && Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) < 5))
  .map((pts) => ({ pts }));
console.log(`lines345: ${linesRaw.length} raw ways -> ${projected.length} stitched corridors, ${droppedJumpers} sub-500m substation-yard jumpers dropped -> ${lines345.length} kept`);

// =================================================================
// Substations — voltage-tagged (any value); keep only >=345 kV majors.
// Multi-value voltage: parse every ';'-split token, keep if the MAX
// numeric token clears the floor (never split(';')[0]).
// =================================================================
const subRaw = load('substations');
const substations = [];
for (const el of subRaw) {
  const c = centroidOf(el);
  if (!c) continue;
  const tags = el.tags || {};
  const maxV = Math.max(0, ...String(tags.voltage || '').split(';').map((v) => parseInt(v, 10) || 0));
  if (maxV < 345000) continue;
  const [x, z] = proj(c[0], c[1]);
  const rec = { x: +x.toFixed(1), z: +z.toFixed(1) };
  if (tags.name) rec.name = tags.name;
  substations.push(rec);
}
console.log(`substations: ${subRaw.length} raw -> ${substations.length} >=345kV majors`);

// =================================================================
// Offshore platforms — cluster (15u ~= 1.5km) then tier: isolated points
// are majors (keep name/operator/ref — name-poor layer, per the spec),
// clustered groups merge into a lighter minor record.
// =================================================================
const platRaw = load('platforms');
const platPts = [];
for (const el of platRaw) {
  const c = centroidOf(el);
  if (!c) continue;
  const [x, z] = proj(c[0], c[1]);
  platPts.push({ x, z, tags: el.tags || {} });
}
const platClusters = clusterPoints(platPts, 15);
const platforms = [];
for (const group of platClusters) {
  if (group.length === 1) {
    const p = group[0], t = p.tags;
    const rec = { tier: 'major', x: +p.x.toFixed(1), z: +p.z.toFixed(1) };
    if (t.name) rec.name = t.name;
    if (t.operator) rec.operator = t.operator;
    if (t.ref) rec.ref = t.ref;
    platforms.push(rec);
  } else {
    const cx = group.reduce((s, p) => s + p.x, 0) / group.length;
    const cz = group.reduce((s, p) => s + p.z, 0) / group.length;
    const r = Math.max(...group.map((p) => Math.hypot(p.x - cx, p.z - cz)), 3);
    platforms.push({ tier: 'minor', x: +cx.toFixed(1), z: +cz.toFixed(1), count: group.length, r: +r.toFixed(1) });
  }
}
const namedPlatforms = platforms.filter((p) => p.name).length;
console.log(`platforms: ${platRaw.length} raw -> ${platforms.length} sites (${platforms.filter((p) => p.tier === 'major').length} major, ${namedPlatforms} named)`);

// =================================================================
// Fairways — 8 ways, kept as separate simplified polylines (snap-points
// for the hand-laid ship lane's port-approach legs; scarcity exception).
// =================================================================
const fairRaw = load('fairways').filter((el) => el.type === 'way' && el.geometry);
const fairways = fairRaw
  .map((el) => simplify(el.geometry.filter(Boolean).map((p) => proj(p.lon, p.lat))))
  .filter((pts) => pts.length > 0)
  .map((pts) => ({ pts }));
console.log(`fairways: ${fairRaw.length} raw ways -> ${fairways.length} kept`);

// =================================================================
// Write
// =================================================================
const out = { counties: countyRec, windFarms, plants, refineries, lines345, substations, platforms, fairways };
const json = JSON.stringify(out);
writeFileSync(join(ROOT, 'data', 'energy.json'), json);
console.log(`Wrote data/energy.json (${(json.length / 1024).toFixed(1)} KB)`);
