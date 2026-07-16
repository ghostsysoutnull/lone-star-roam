#!/usr/bin/env node
// Rebuild real Texas mainline rail geometry and its OSM identity tags.
// Usage: node tools/build-rails.mjs <osm-rails.json>
// Fetch a fresh input with Overpass GET (POST is rejected in this environment):
// curl -sG --data-urlencode 'data=[out:json][timeout:300];way["railway"="rail"]["usage"="main"](25.8,-106.7,36.6,-93.5);out tags geom;'
//   https://maps.mail.ru/osm/tools/overpass/api/interpreter -o texas-main-rails-osm.json
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv[2];
if (!source) throw new Error('Usage: node tools/build-rails.mjs <osm-rails.json>');

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

const rails = [];
for (const group of groups.values()) {
  const used = new Set();
  const starts = new Map();
  for (let i = 0; i < group.length; i++) {
    const k = key(group[i].pts[0]);
    if (!starts.has(k)) starts.set(k, []);
    starts.get(k).push(i);
  }
  for (let i = 0; i < group.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const way = group[i];
    const pts = [...way.pts];
    for (;;) {
      const candidates = (starts.get(key(pts[pts.length - 1])) ?? []).filter((j) => !used.has(j));
      if (!candidates.length) break;
      const next = candidates[0];
      used.add(next);
      pts.push(...group[next].pts.slice(1));
    }
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

writeFileSync(join(ROOT, 'data', 'rails.json'), JSON.stringify(rails));
const labeled = rails.filter((rail) => rail.operator || rail.name).length;
console.log(`Rails: ${rails.length} polylines (${labeled} labeled), ${rails.reduce((sum, rail) => sum + rail.pts.length, 0)} points`);
