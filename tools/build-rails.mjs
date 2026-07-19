#!/usr/bin/env node
// Rebuild real Texas mainline rail geometry and its OSM identity tags, plus
// the two border-gateway spurs (Rails W2): cross-river routes at Laredo and
// Eagle Pass that skip the Texas border clip and carry a `spur` tag + baked
// `bridge` crossing point. Spur routes are chained identity-free (operator
// spelling flips at the river: CPKC / Canadian Pacific Kansas City, UP /
// Ferromex) and only the longest river-spanning chain per gateway ships.
// Usage: node tools/build-rails.mjs <osm-rails.json> [--spur=<site>:<file>]…
// Fetch fresh inputs with Overpass GET (POST is rejected in this environment):
// curl -sG --data-urlencode 'data=[out:json][timeout:300];way["railway"="rail"]["usage"="main"](25.8,-106.7,36.6,-93.5);out tags geom;'
//   https://maps.mail.ru/osm/tools/overpass/api/interpreter -o texas-main-rails-osm.json
// curl -sG --data-urlencode 'data=[out:json][timeout:120];way["railway"="rail"][!"service"](27.35,-99.65,27.62,-99.35);out tags geom;'
//   https://maps.mail.ru/osm/tools/overpass/api/interpreter -o rails-spur-laredo.json
// curl -sG --data-urlencode 'data=[out:json][timeout:120];way["railway"="rail"][!"service"](28.55,-100.65,28.83,-100.35);out tags geom;'
//   https://maps.mail.ru/osm/tools/overpass/api/interpreter -o rails-spur-eaglepass.json
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2];
if (!source) throw new Error('Usage: node tools/build-rails.mjs <osm-rails.json> [--spur=<site>:<file>]…');
const spurArgs = process.argv.slice(3)
  .filter((a) => a.startsWith('--spur='))
  .map((a) => { const [site, file] = a.slice(7).split(':'); return { site, file }; });
// the Texas-side operator names the route (livery + placard); the Mexican-side
// spelling never reaches the game
const SPUR_OPERATOR = { laredo: 'CPKC', eaglepass: 'Union Pacific Railroad' };
const SPUR_TAIL = 150; // units kept south of the river — enough run-up, no long float over the outside plane

const LAT0 = 31.0, LON0 = -99.5;
const M_PER_DEG = 111320, M_PER_DEG_LON = M_PER_DEG * Math.cos((LAT0 * Math.PI) / 180);
const proj = ([lon, lat]) => [
  +((lon - LON0) * M_PER_DEG_LON / 100).toFixed(1),
  +(-(lat - LAT0) * M_PER_DEG / 100).toFixed(1),
];
const key = (p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;

function inPoly([x, z], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function simplify(pts, tol = 0.002) {
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
    if (maxD > sqTol) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

const border = JSON.parse(readFileSync(join(ROOT, 'data', 'border.json'), 'utf8'));
const input = JSON.parse(readFileSync(source, 'utf8'));
const ways = input.elements
  .filter((e) => e.type === 'way' && e.tags?.railway === 'rail' && e.tags?.usage === 'main' && e.geometry?.length > 1)
  .map((e) => ({
    operator: e.tags.operator || e.tags.owner || null,
    name: e.tags.name || null,
    pts: e.geometry.map(({ lon, lat }) => [lon, lat]),
  }));

const groups = new Map();
for (const way of ways) {
  const identity = `${way.operator ?? ''}\0${way.name ?? ''}`;
  if (!groups.has(identity)) groups.set(identity, []);
  groups.get(identity).push(way);
}

// Chain ways within an identity group into maximal polylines. Extends at both
// ends and accepts reversed ways (OSM digitization direction is arbitrary —
// forward-only tail chaining shredded TRE into 17 pieces). A turn-angle guard
// (< 90°) keeps junction nodes from chaining a line into its own parallel
// track as a hairpin.
const bearing = (a, b) => Math.atan2(b[0] - a[0], b[1] - a[1]);
const turnOK = (pts, add) => {
  const h1 = bearing(pts[pts.length - 2], pts[pts.length - 1]);
  const h2 = bearing(add[0], add[1]);
  let d = Math.abs(h1 - h2) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d < Math.PI / 2;
};
function chain(group) {
  const ends = new Map(); // endpoint key -> [{i, rev}] (rev: way must be reversed to *start* here)
  const at = (k, e) => { if (!ends.has(k)) ends.set(k, []); ends.get(k).push(e); };
  for (let i = 0; i < group.length; i++) {
    at(key(group[i].pts[0]), { i, rev: false });
    at(key(group[i].pts[group[i].pts.length - 1]), { i, rev: true });
  }
  const used = new Set();
  const chains = [];
  for (let i = 0; i < group.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    let pts = [...group[i].pts];
    for (let flipped = 0; ; ) { // grow the tail; flip once to grow the head the same way
      const cand = (ends.get(key(pts[pts.length - 1])) ?? []).filter((e) => !used.has(e.i));
      let hit = null;
      for (const e of cand) {
        const add = e.rev ? [...group[e.i].pts].reverse() : group[e.i].pts;
        if (turnOK(pts, add)) { hit = add; used.add(e.i); break; }
      }
      if (hit) { pts.push(...hit.slice(1)); continue; }
      if (flipped++) break;
      pts.reverse();
    }
    chains.push(pts);
  }
  // pass 2: bridge real OSM data holes between chain endpoints — the UP Eagle
  // Pass Sub ships split by 140 m and 910 m gaps the exact-key pass can't
  // touch. Tangent continuity (< ~60°) guards against welding parallel tracks
  // into hairpins; the seam is drawn straight across the gap.
  const GAP_M = 1000;
  const distM = (a, b) => Math.hypot((a[0] - b[0]) * M_PER_DEG_LON, (a[1] - b[1]) * M_PER_DEG);
  const tan = (pts, atEnd) => {
    const [p, q] = atEnd ? [pts[pts.length - 2], pts[pts.length - 1]] : [pts[0], pts[1]];
    const dx = (q[0] - p[0]) * M_PER_DEG_LON, dy = (q[1] - p[1]) * M_PER_DEG;
    const L = Math.hypot(dx, dy) || 1;
    return [dx / L, dy / L];
  };
  for (let merged = true; merged; ) {
    merged = false;
    outer: for (let i = 0; i < chains.length; i++) {
      for (let j = i + 1; j < chains.length; j++) {
        for (const [flipA, flipB] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
          const A = flipA ? [...chains[i]].reverse() : chains[i];
          const B = flipB ? [...chains[j]].reverse() : chains[j];
          if (distM(A[A.length - 1], B[0]) > GAP_M) continue;
          const [ax, ay] = tan(A, true), [bx, by] = tan(B, false);
          if (ax * bx + ay * by < 0.5) continue;
          chains[i] = A.concat(B);
          chains.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return chains;
}

const rails = [];
for (const group of groups.values()) {
  const way = group[0];
  for (const pts of chain(group)) {
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        const simple = simplify(run);
        const projected = simple.map(proj);
        const length = projected.reduce((sum, point, i) => i ? sum + Math.hypot(point[0] - projected[i - 1][0], point[1] - projected[i - 1][1]) : sum, 0);
        if (projected.length > 1 && length > 10) rails.push({ pts: projected, ...(way.operator && { operator: way.operator }), ...(way.name && { name: way.name }) });
      }
      run = [];
    };
    for (const point of pts) (inPoly(proj(point), border) ? run.push(point) : flush());
    flush();
  }
}

// --- border-gateway spurs: chain identity-free, keep the longest chain that
// spans the river, trim the Mexican tail, bake the bridge crossing point ---
for (const { site, file } of spurArgs) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const ways = raw.elements
    .filter((e) => e.type === 'way' && e.tags?.railway === 'rail' && e.geometry?.length > 1)
    .map((e) => ({ pts: e.geometry.map(({ lon, lat }) => [lon, lat]) }));
  let best = null, bestLen = 0;
  for (const pts of chain(ways)) {
    const proj2 = pts.map(proj);
    const inside = proj2.map((p) => inPoly(p, border));
    if (!inside.some(Boolean) || !inside.some((v) => !v)) continue; // must span the river
    const len = proj2.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - proj2[i - 1][0], p[1] - proj2[i - 1][1]) : 0), 0);
    if (len > bestLen) { bestLen = len; best = { proj2, inside }; }
  }
  if (!best) throw new Error(`spur ${site}: no river-spanning chain found`);
  // orient south→north (Texas end last), find the crossing, trim the south tail
  let { proj2, inside } = best;
  if (!inside[inside.length - 1]) { proj2 = [...proj2].reverse(); inside = [...inside].reverse(); }
  const cross = inside.findIndex(Boolean); // first in-Texas point; segment cross-1→cross straddles the river
  // bridge axis = chord over ±7 u of arc around the crossing, not one segment's
  // angle — the Laredo spur bends hard just past the river and a segment-angle
  // bridge overhung the curve with the track clipping its trusses
  const walk = (from, step) => {
    let acc = 0, i = from;
    while (i + step >= 0 && i + step < proj2.length && acc < 7) {
      acc += Math.hypot(proj2[i + step][0] - proj2[i][0], proj2[i + step][1] - proj2[i][1]);
      i += step;
    }
    return proj2[i];
  };
  const a = walk(cross - 1, -1), b = walk(cross, 1);
  const bridge = {
    x: +((a[0] + b[0]) / 2).toFixed(1), z: +((a[1] + b[1]) / 2).toFixed(1),
    ang: +Math.atan2(b[0] - a[0], b[1] - a[1]).toFixed(3),
  };
  let tail = 0, from = 0;
  for (let i = cross - 1; i > 0; i--) {
    tail += Math.hypot(proj2[i][0] - proj2[i - 1][0], proj2[i][1] - proj2[i - 1][1]);
    if (tail > SPUR_TAIL) { from = i; break; }
  }
  const pts = simplify(proj2.slice(from), 0.5); // input already projected — tol in game units
  rails.push({ pts, operator: SPUR_OPERATOR[site], name: `${site === 'laredo' ? 'Tex-Mex' : 'Eagle Pass'} International Bridge`, spur: site, bridge });
  console.log(`Spur ${site}: ${pts.length} pts, ${bestLen.toFixed(0)} u chained, bridge at ${bridge.x},${bridge.z}`);
}

writeFileSync(join(ROOT, 'data', 'rails.json'), JSON.stringify(rails));
const labeled = rails.filter((rail) => rail.operator || rail.name).length;
console.log(`Rails: ${rails.length} polylines (${labeled} labeled), ${rails.reduce((sum, rail) => sum + rail.pts.length, 0)} points`);
