#!/usr/bin/env node
// Build pipeline: raw OSM way JSON (Overpass "out geom") for the named
// through-route arterials -> data/band-highways.json. Kept fully separate
// from highways.json/GEO.highways on purpose: the 300-rose seeded scatter
// draws `hws[floor(rand()*hws.length)]` against GEO.highways, so ANY change
// to that array's length reshuffles every rose (not just new ones) — band
// roads must never be merged in.
// Usage: node tools/build-band-roads.mjs <la.json> <ar.json> <ok.json> <nm.json>
//   Argument ORDER IS LOAD-BEARING: chaining is greedy over file order, so a
//   different order re-splits the polylines.
//
// Inputs — the exact queries, recorded 2026-07-15 after the originals were lost
// (the first bake left only a `<routes>`/`(bbox)` template behind, so the data
// could not be regenerated). Overpass POST 406s from here — always GET:
//
//   REFS='I 10|I 20|I 30|I 35|I 40|US 62|US 71|US 84|US 87|US 180|US 287'
//   curl -sG <endpoint> --data-urlencode \
//     "data=[out:json][timeout:280];way[\"highway\"~\"motorway|trunk|primary\"]
//      [\"ref\"~\"^($REFS)($|;)\"](<bbox>);out geom;"
//
//   la  28.8,-94.4,33.2,-91.8     ar  32.8,-94.9,36.7,-92.3
//   ok  33.3,-103.3,37.2,-94.2    nm  31.1,-107.3,37.2,-102.7
//
// Endpoints: maps.mail.ru/osm/tools/overpass/api/interpreter handles the big
// bboxes (la/ar/ok); it 504s on nm — overpass-api.de/api/interpreter serves that
// one in ~2 min. Add `[date:"<iso>"]` after [out:json] for a pinned attic query;
// both endpoints honour it (verified against 2015 data).
//
// The bboxes are RECONSTRUCTED, not the originals: they reproduce the 2026-07-14
// trunk tier exactly (23 polylines, 4133u) but not motorway/primary, so the
// road set moved slightly on the 2026-07-15 rebake. Rebaking shifts band
// geometry — check the shoulder suite (crossing monuments read these endpoints).
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const paths = process.argv.slice(2);
if (!paths.length) {
  console.error('Usage: node tools/build-band-roads.mjs <osm-ways.json> [...]');
  process.exit(1);
}

// Same projection as build-data.mjs (proj) / build-band.mjs / LL() in src/*.js — keep in sync.
const LAT0 = 31.0, LON0 = -99.5;
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180);
const SCALE = 1 / 100;
const proj = ([lon, lat]) => [
  +((lon - LON0) * M_PER_DEG_LON * SCALE).toFixed(1),
  +(-(lat - LAT0) * M_PER_DEG_LAT * SCALE).toFixed(1),
];

// Douglas-Peucker simplification (degrees) — copied from build-data.mjs
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

// --- load + chain ways by ref+type sharing endpoints (same idiom as build-data.mjs) ---
const KEEP_TYPES = new Set(['motorway', 'trunk', 'primary']); // drop *_link ramps
const ways = [];
for (const p of paths) {
  const data = JSON.parse(readFileSync(p, 'utf8'));
  for (const e of data.elements) {
    if (e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue;
    const type = e.tags?.highway;
    if (!KEEP_TYPES.has(type)) continue;
    const ref = (e.tags?.ref || e.tags?.name || '?').split(';')[0].trim();
    ways.push({ ref, type, pts: e.geometry.map((g) => [g.lon, g.lat]) });
  }
}
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

// --- clip to the land shoulder (never the shelf — these are all land routes) ---
const border = JSON.parse(readFileSync(join(ROOT, 'data', 'border.json'), 'utf8'));
const islands = JSON.parse(readFileSync(join(ROOT, 'data', 'islands.json'), 'utf8'));
const SHOULDER_U = 402;
const SEAM_MARGIN = 3; // small inside-Texas overlap so the band road visually meets highways.json at the border, not a gap
function inPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
const inTx = (x, z) => inPoly(x, z, border) || islands.some((r) => inPoly(x, z, r));
const closestOnSeg = (x, z, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  const t = len2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / len2)) : 0;
  return [a[0] + dx * t, a[1] + dz * t];
};
const distToBorder = (x, z) => {
  let best = Infinity;
  for (let i = 0, j = border.length - 1; i < border.length; j = i++) {
    const p = closestOnSeg(x, z, border[j], border[i]);
    const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
};

const TIER = {
  motorway: { tol: 0.0025, minLen: 15 },
  trunk: { tol: 0.0025, minLen: 15 },
  primary: { tol: 0.002, minLen: 8 },
};
const lenOf = (pts) => {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
};

const bandHighways = [];
for (const c of chains) {
  const { tol } = TIER[c.type];
  let run = [];
  // TIER.tol is in DEGREES, so simplify runs on the lon/lat points and only the
  // survivors get projected — same order as build-data.mjs. (Projecting first
  // and simplifying in game units reads the tolerance ~1000x too tight: 0.0025
  // deg is ~2.6 units, but 0.0025 units is 25 cm, under proj's own 10 m
  // rounding, so nothing is dropped and every raw OSM vertex ships.)
  const flush = () => {
    if (run.length > 1) {
      const s = simplify(run, tol);
      if (s.length > 1) bandHighways.push({ ref: c.ref, type: c.type, pts: s.map(proj) });
    }
    run = [];
  };
  // the band is a game-unit distance, so the clip test still runs on projected
  // coords — but `run` collects the degree points that feed simplify.
  for (const p of c.pts) {
    const [x, z] = proj(p);
    const d = distToBorder(x, z);
    const keep = inTx(x, z) ? d <= SEAM_MARGIN : d <= SHOULDER_U;
    if (keep) run.push(p); else flush();
  }
  flush();
}
const kept = bandHighways.filter((h) => lenOf(h.pts) > TIER[h.type].minLen);
kept.sort((a, b) => lenOf(b.pts) - lenOf(a.pts));
const totalPts = kept.reduce((s, h) => s + h.pts.length, 0);
console.log(`Band highways kept: ${kept.length} polylines, ${totalPts} pts`);
const byType = kept.reduce((a, h) => ((a[h.type] = (a[h.type] || 0) + 1), a), {});
console.log(`  by type: ${JSON.stringify(byType)}`);
const byRef = [...new Set(kept.map((h) => h.ref))].sort();
console.log(`  refs: ${byRef.join(', ')}`);

writeFileSync(join(ROOT, 'data', 'band-highways.json'), JSON.stringify(kept));
