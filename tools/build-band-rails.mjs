#!/usr/bin/env node
// Band railroads (Rails W3): real railway=rail/usage=main geometry in the four
// neighbor-state strips -> data/band-rails.json. Own file, own array
// (GEO.bandRails, never merged into GEO.rails — nothing indexes rails.json by
// array position today, but keeping the same separation band-roads/band-ag/
// band-cities use keeps the law consistent and the data trivially rebakeable
// in isolation). geo.js appends this array's segments into the *same* rail
// spatial index as GEO.rails (display-only, no physics), so nearestRail's
// placard crosses the state line for free — the reason band ROADS need a
// separate index (protecting nearestRoad's driving-physics lookups and the
// rose-scatter array-length dependency on GEO.highways) doesn't apply here.
//
// Usage: node tools/build-band-rails.mjs <la.json> <ar.json> <ok.json> <nm.json>
//   Argument ORDER IS LOAD-BEARING (band-roads precedent): dedup-by-way-id is
//   greedy over file order, so a different order re-splits chains at the
//   overlapping-bbox seams.
//
// Inputs — same 4 band bboxes as tools/build-band-roads.mjs, Overpass GET
// (POST 406s from this environment):
//   curl -sG https://maps.mail.ru/osm/tools/overpass/api/interpreter \
//     --data-urlencode 'data=[out:json][timeout:150];
//       way["railway"="rail"]["usage"="main"](<bbox>);out tags geom;'
//   la  28.8,-94.4,33.2,-91.8     ar  32.8,-94.9,36.7,-92.3
//   ok  33.3,-103.3,37.2,-94.2    nm  31.1,-107.3,37.2,-102.7
// All four served fine from maps.mail.ru at this data volume (rail ways are
// far sparser than the full motorway/trunk/primary band-roads fetch that
// needed overpass-api.de for nm) — 2026-07-19 bake: la 1035 elements/28s,
// ar 716/3s, ok 3039/7s, nm 1975/4s.
//
// Chaining reuses tools/build-rails.mjs's turn-angle-guarded, gap-bridging
// chain() verbatim (ways group by operator+name identity first, so a chain
// never welds two different railroads' track). Clipping to the band strip
// reuses tools/build-band-roads.mjs's distToBorder/inNeighborState/
// isMexicoSeam block verbatim (same El Paso/Juárez seam hazard applies to
// any band bbox that reaches NM's west edge). Rebaking shifts band rail
// geometry — rerun the rails suite and the data unit test after.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const paths = process.argv.slice(2);
if (paths.length !== 4) {
  console.error('Usage: node tools/build-band-rails.mjs <la.json> <ar.json> <ok.json> <nm.json>');
  process.exit(1);
}

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

// --- load + cross-bbox dedup (band-roads precedent: first file a way id
// appears in wins — the 4 band bboxes overlap on purpose at the seams) ---
const seenIds = new Set();
const ways = [];
let rawCount = 0, dupCount = 0;
for (const p of paths) {
  const data = JSON.parse(readFileSync(p, 'utf8'));
  for (const e of data.elements) {
    if (e.type !== 'way' || e.tags?.railway !== 'rail' || e.tags?.usage !== 'main' || !e.geometry || e.geometry.length < 2) continue;
    rawCount++;
    if (seenIds.has(e.id)) { dupCount++; continue; }
    seenIds.add(e.id);
    ways.push({
      operator: e.tags.operator || e.tags.owner || null,
      name: e.tags.name || null,
      pts: e.geometry.map(({ lon, lat }) => [lon, lat]),
    });
  }
}
console.log(`Ways loaded: ${ways.length} (${rawCount} raw, ${dupCount} cross-bbox duplicates dropped)`);

// --- chain ways within an identity group (tools/build-rails.mjs, verbatim) ---
const bearing = (a, b) => Math.atan2(b[0] - a[0], b[1] - a[1]);
const turnOK = (pts, add) => {
  const h1 = bearing(pts[pts.length - 2], pts[pts.length - 1]);
  const h2 = bearing(add[0], add[1]);
  let d = Math.abs(h1 - h2) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d < Math.PI / 2;
};
// Returns chains as {pts, votes} — votes tallies point-count per constituent
// way name, so a chain spanning multiple source ways (routine once grouping
// is operator-only, see below) can still report its most-represented name
// instead of an arbitrary first-way label.
function chain(group) {
  const ends = new Map();
  const at = (k, e) => { if (!ends.has(k)) ends.set(k, []); ends.get(k).push(e); };
  for (let i = 0; i < group.length; i++) {
    at(key(group[i].pts[0]), { i, rev: false });
    at(key(group[i].pts[group[i].pts.length - 1]), { i, rev: true });
  }
  const vote = (votes, i) => { votes[group[i].name ?? ''] = (votes[group[i].name ?? ''] || 0) + group[i].pts.length; };
  const used = new Set();
  const chains = [];
  for (let i = 0; i < group.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    let pts = [...group[i].pts];
    const votes = {};
    vote(votes, i);
    for (let flipped = 0; ; ) {
      const cand = (ends.get(key(pts[pts.length - 1])) ?? []).filter((e) => !used.has(e.i));
      let hit = null;
      for (const e of cand) {
        const add = e.rev ? [...group[e.i].pts].reverse() : group[e.i].pts;
        if (turnOK(pts, add)) { hit = add; used.add(e.i); vote(votes, e.i); break; }
      }
      if (hit) { pts.push(...hit.slice(1)); continue; }
      if (flipped++) break;
      pts.reverse();
    }
    chains.push({ pts, votes });
  }
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
          const A = flipA ? [...chains[i].pts].reverse() : chains[i].pts;
          const B = flipB ? [...chains[j].pts].reverse() : chains[j].pts;
          if (distM(A[A.length - 1], B[0]) > GAP_M) continue;
          const [ax, ay] = tan(A, true), [bx, by] = tan(B, false);
          if (ax * bx + ay * by < 0.5) continue;
          const votes = chains[i].votes;
          for (const [n, c] of Object.entries(chains[j].votes)) votes[n] = (votes[n] || 0) + c;
          chains[i] = { pts: A.concat(B), votes };
          chains.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return chains;
}
const topName = (votes) => {
  let best = null, bestN = 0;
  for (const [n, c] of Object.entries(votes)) if (n && c > bestN) { best = n; bestN = c; }
  return best;
};

// Group by operator only, not name: the band fetch's subdivision names carry
// an inconsistent operator prefix across ways of the same real line ("UP
// Little Rock Subdivision" vs "Little Rock Subdivision", "CPKC Shreveport
// Subdivision" vs "Shreveport Subdivision") — grouping by name too shredded
// every band mainline at each prefix inconsistency. turnOK's <90° guard in
// chain() is what actually prevents welding unrelated branches, same as it
// does for Texas's junction nodes, so dropping name from the identity is
// safe. Each merged chain reports whichever constituent way's name covers
// the most points (topName()) — display only, no check asserts an exact
// band rail name.
const groups = new Map();
for (const way of ways) {
  const identity = way.operator ?? '';
  if (!groups.has(identity)) groups.set(identity, []);
  groups.get(identity).push(way);
}
const chained = [];
for (const [, group] of groups) {
  const operator = group[0].operator;
  for (const { pts, votes } of chain(group)) chained.push({ operator, name: topName(votes), pts });
}
console.log(`Chains: ${chained.length}`);

// --- clip to the band strip (tools/build-band-roads.mjs, verbatim) ---
const border = JSON.parse(readFileSync(join(ROOT, 'data', 'border.json'), 'utf8'));
const islands = JSON.parse(readFileSync(join(ROOT, 'data', 'islands.json'), 'utf8'));
const SHOULDER_U = 402;
const SEAM_MARGIN = 3;
const inTx = (x, z) => inPoly([x, z], border) || islands.some((r) => inPoly([x, z], r));
const neighborCounties = JSON.parse(readFileSync(join(ROOT, 'data', 'neighbor-counties.json'), 'utf8'));
const inNeighborState = (x, z) => neighborCounties.some((c) => inPoly([x, z], c.ring));
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
const borderZones = JSON.parse(readFileSync(join(ROOT, 'data', 'border-zones.json'), 'utf8'));
const isMexicoSeam = (x, z) => {
  let bestD = Infinity, bestI = 0;
  for (let i = 0, j = border.length - 1; i < border.length; j = i++) {
    const p = closestOnSeg(x, z, border[j], border[i]);
    const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
    if (d < bestD) { bestD = d; bestI = i; }
  }
  return borderZones[bestI] === 'mexico';
};

const MIN_LEN = 15;
const lenOf = (pts) => {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
};

const bandRails = [];
for (const c of chained) {
  let run = [];
  const flush = () => {
    if (run.length > 1) {
      const s = simplify(run);
      if (s.length > 1) bandRails.push({ operator: c.operator, name: c.name, pts: s.map(proj) });
    }
    run = [];
  };
  for (const p of c.pts) {
    const [x, z] = proj(p);
    const d = distToBorder(x, z);
    const keep = inTx(x, z)
      ? d <= SEAM_MARGIN && !isMexicoSeam(x, z)
      : d <= SHOULDER_U && inNeighborState(x, z);
    if (keep) run.push(p); else flush();
  }
  flush();
}
const kept = bandRails
  .filter((r) => lenOf(r.pts) > MIN_LEN)
  .map((r) => ({ pts: r.pts, ...(r.operator && { operator: r.operator }), ...(r.name && { name: r.name }), band: true }));
console.log(`Band rails kept: ${kept.length} polylines, ${kept.reduce((s, r) => s + r.pts.length, 0)} pts`);
const labeled = kept.filter((r) => r.operator || r.name).length;
console.log(`  labeled: ${labeled}/${kept.length}`);
const byOperator = [...new Set(kept.map((r) => r.operator).filter(Boolean))].sort();
console.log(`  operators: ${byOperator.join(', ')}`);

writeFileSync(join(ROOT, 'data', 'band-rails.json'), JSON.stringify(kept));
