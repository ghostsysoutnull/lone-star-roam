#!/usr/bin/env node
// Append metro arterials ('street' tier) to data/highways.json without a full
// build-data.mjs rebuild (whose statewide inputs are not in the repo, and
// re-fetching motorway/trunk could shift the rose scatter and break saves).
// Existing polylines are left byte-identical; new highway=secondary OSM files
// are chained/simplified/clipped/projected exactly like the main pipeline.
//
// Usage: node tools/add-metro-streets.mjs <secondary-1.json> [secondary-2.json ...]
//
// Fetch inputs with Overpass GET (POST is blocked from this environment), e.g.:
//   curl -sG 'https://overpass-api.de/api/interpreter' --data-urlencode \
//     'data=[out:json][timeout:120];way[highway=secondary](31.58,-106.65,31.95,-106.15);out geom;' \
//     -o elpaso.json
// 2026-07-10 mid-size city bboxes (south,west,north,east):
//   El Paso        31.58,-106.65,31.95,-106.15
//   Corpus Christi 27.60,-97.65,27.90,-97.20
//   Lubbock        33.45,-102.05,33.70,-101.70
//   Amarillo       35.05,-102.05,35.35,-101.65
//   McAllen/RGV    26.10,-98.45,26.45,-98.05   (also covers Edinburg/Mission/Pharr)
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error('Usage: node tools/add-metro-streets.mjs <secondary.json> [...]');
  process.exit(1);
}

// --- Projection (must match build-data.mjs `proj`) ---
const LAT0 = 31.0, LON0 = -99.5;
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180);
const SCALE = 1 / 100;
const proj = ([lon, lat]) => [
  +((lon - LON0) * M_PER_DEG_LON * SCALE).toFixed(1),
  +(-(lat - LAT0) * M_PER_DEG_LAT * SCALE).toFixed(1),
];
const unproj = ([x, z]) => [x / SCALE / M_PER_DEG_LON + LON0, -(z / SCALE / M_PER_DEG_LAT) + LAT0];

// --- Douglas-Peucker (same as build-data.mjs) ---
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
    if (maxD > sqTol) {
      keep[idx] = 1;
      stack.push([first, idx], [idx, last]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function inPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

// Clip against the shipped (simplified) border so streets end exactly where the
// rendered world does — matters at El Paso and the RGV, where the bbox spills
// into Mexico/New Mexico.
const borderDeg = JSON.parse(readFileSync(join(ROOT, 'data', 'border.json'), 'utf8')).map(unproj);

// --- Load + chain ways by ref/name (same as build-data.mjs) ---
function loadWays(path) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  return data.elements
    .filter((e) => e.type === 'way' && e.geometry && e.geometry.length > 1)
    .map((e) => ({
      ref: (e.tags?.ref || e.tags?.name || '?').split(';')[0].trim(),
      type: 'street',
      pts: e.geometry.map((g) => [g.lon, g.lat]),
    }));
}
const ways = inputs.flatMap(loadWays);
console.log(`Ways loaded: ${ways.length}`);

const key = (p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
const byGroup = new Map();
for (const w of ways) {
  const g = `${w.type}|${w.ref}`;
  if (!byGroup.has(g)) byGroup.set(g, []);
  byGroup.get(g).push(w);
}
const chains = [];
for (const [, group] of byGroup) {
  const used = new Set();
  const startMap = new Map();
  for (let i = 0; i < group.length; i++) {
    const k = key(group[i].pts[0]);
    if (!startMap.has(k)) startMap.set(k, []);
    startMap.get(k).push(i);
  }
  for (let i = 0; i < group.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const chain = { ref: group[i].ref, type: group[i].type, pts: [...group[i].pts] };
    for (;;) {
      const k = key(chain.pts[chain.pts.length - 1]);
      const nexts = (startMap.get(k) || []).filter((j) => !used.has(j));
      if (!nexts.length) break;
      const j = nexts[0];
      used.add(j);
      chain.pts.push(...group[j].pts.slice(1));
    }
    chains.push(chain);
  }
}
console.log(`Chains: ${chains.length}`);

// --- Clip, simplify, project ('street' tier: tol 0.0008, minLen 4) ---
const TOL = 0.0008, MIN_LEN = 4;
const lenOf = (pts) => {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
};
const fresh = [];
for (const c of chains) {
  let run = [];
  const flush = () => {
    if (run.length > 1) {
      const s = simplify(run, TOL);
      if (s.length > 1) {
        const pts = s.map(proj);
        if (lenOf(pts) > MIN_LEN) fresh.push({ ref: c.ref, type: 'street', pts });
      }
    }
    run = [];
  };
  for (const p of c.pts) (inPoly(p, borderDeg) ? run.push(p) : flush());
  flush();
}
console.log(`New street polylines: ${fresh.length}, ${fresh.reduce((s, h) => s + h.pts.length, 0)} pts`);

// --- Merge (skip polylines already present, so re-runs are idempotent) ---
const outPath = join(ROOT, 'data', 'highways.json');
const existing = JSON.parse(readFileSync(outPath, 'utf8'));
const seen = new Set(existing.map((h) => JSON.stringify(h.pts)));
const added = fresh.filter((h) => !seen.has(JSON.stringify(h.pts)));
writeFileSync(outPath, JSON.stringify([...existing, ...added]));
console.log(`highways.json: ${existing.length} -> ${existing.length + added.length} polylines, ${(JSON.stringify([...existing, ...added]).length / 1024).toFixed(0)} KB`);
