#!/usr/bin/env node
// Build pipeline: Census cartographic boundary files -> shoulder/shelf runtime
// data. Inputs are consumed here only — never read whole elsewhere; this
// script prints ring counts/bboxes/closure as the verification surface.
// Usage: node tools/build-band.mjs <cb_..._state_500k-base> <cb_..._county_500k-base> [cb_..._place_500k-base] [sub-est-population.csv]
import { writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readShapefile } from './shp2geojson.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [statesBase, countyBase, placesBase, popCsvPath] = process.argv.slice(2);
if (!statesBase || !countyBase) {
  console.error('Usage: node tools/build-band.mjs <state-500k-base> <county-500k-base> [place-500k-base] [pop-csv]');
  process.exit(1);
}

// Same projection as build-data.mjs (proj) / LL() in src/*.js — keep in sync.
const LAT0 = 31.0, LON0 = -99.5;
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180);
const SCALE = 1 / 100;
const proj = ([lon, lat]) => [
  +((lon - LON0) * M_PER_DEG_LON * SCALE).toFixed(1),
  +(-(lat - LAT0) * M_PER_DEG_LAT * SCALE).toFixed(1),
];

const NEIGHBORS = ['LA', 'AR', 'OK', 'NM'];

// --- Padre's rings: Texas has 32 rings in the 2022 cartographic file; rank 0
// is the mainland (~11.8k pts). Padre (26.07-27.84N) splits into two rings
// (302 + 147 pts) well clear of the next-largest non-Padre spit (73 pts) ---
const states = readShapefile(statesBase);
const tx = states.find((f) => f.properties.STUSPS === 'TX');
const ranked = [...tx.rings].sort((a, b) => b.length - a.length);
console.log(`TX rings: ${ranked.length}, top sizes ${ranked.slice(0, 6).map((r) => r.length)}`);

// pre-filter by real Padre geographic window (not just size — Galveston Island
// is also a >100pt secondary ring, at a different lon/lat entirely) then confirm
const PADRE_MIN_PTS = 100;
const inPadreWindow = (ring) => ring.some(([lon, lat]) => lon < -96.9 && lon > -97.6 && lat > 25.9 && lat < 28.0);
const padreRings = ranked.slice(1).filter((r) => r.length >= PADRE_MIN_PTS && inPadreWindow(r));
console.log(`Padre rings kept: ${padreRings.length} (sizes ${padreRings.map((r) => r.length)})`);
for (const ring of padreRings) {
  const lons = ring.map((p) => p[0]), lats = ring.map((p) => p[1]);
  const bbox = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
  const closed = ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1];
  console.log(`  n=${ring.length} bbox=[${bbox.map((v) => v.toFixed(2))}] closed=${closed}`);
  if (!closed) throw new Error('Padre ring not closed (first != last vertex)');
  if (ring.length < 100) throw new Error('Padre ring implausibly small (single-digit/degenerate)');
  // real Padre Island range: ~26.07-27.84N, -97.40..-97.04W (measured this session)
  if (bbox[0] < -97.6 || bbox[2] > -96.9 || bbox[1] < 25.9 || bbox[3] > 28.0)
    throw new Error(`Padre ring bbox outside expected real-world range: ${bbox}`);
}
if (padreRings.length < 2) throw new Error(`Expected 2 Padre rings (N/Mustang + S), got ${padreRings.length}`);
writeFileSync(join(ROOT, 'data', 'islands.json'), JSON.stringify(padreRings.map((r) => r.map(proj))));

// --- neighbor state polygons (mainland ring; margin + HUD state-name clip) ---
const neighborStates = {};
for (const abbr of NEIGHBORS) {
  const f = states.find((s) => s.properties.STUSPS === abbr);
  const largest = [...f.rings].sort((a, b) => b.length - a.length)[0];
  neighborStates[abbr] = largest.map(proj);
}
writeFileSync(join(ROOT, 'data', 'neighbor-states.json'), JSON.stringify(neighborStates));
console.log(`neighbor states: ${Object.keys(neighborStates).join(', ')}`);

// --- neighbor counties/parishes (out-of-state HUD line, toast-only) ---
const counties = readShapefile(countyBase);
const neighborCounties = counties
  .filter((f) => NEIGHBORS.includes(f.properties.STUSPS))
  .map((f) => ({
    state: f.properties.STUSPS,
    name: f.properties.NAMELSAD, // Census already spells "Caddo Parish" / "Marshall County"
    ring: [...f.rings].sort((a, b) => b.length - a.length)[0].map(proj),
  }));
writeFileSync(join(ROOT, 'data', 'neighbor-counties.json'), JSON.stringify(neighborCounties));
for (const abbr of NEIGHBORS) {
  console.log(`  ${abbr} counties/parishes: ${neighborCounties.filter((c) => c.state === abbr).length}`);
}

// --- border zone classification: each border.json vertex is 'mexico' (Rio
// Grande — no shoulder/shelf, Mexico settled as out), 'land' (US neighbor —
// 25mi/402u shoulder), or 'coast' (Gulf — ~70mi/1127u shelf), by nearest-
// distance elimination against the Rio Grande polyline and neighbor states ---
const border = JSON.parse(readFileSync(join(ROOT, 'data', 'border.json'), 'utf8'));
const rivers = JSON.parse(readFileSync(join(ROOT, 'data', 'rivers.json'), 'utf8'));
const rgPts = rivers.filter((r) => /Rio Grande|Río Bravo/i.test(r.name)).flatMap((r) => r.pts);
const neighborPts = Object.values(neighborStates).flat();
const minDist = (pt, pts) => {
  let best = Infinity;
  for (const p of pts) { const d = (p[0] - pt[0]) ** 2 + (p[1] - pt[1]) ** 2; if (d < best) best = d; }
  return Math.sqrt(best);
};
const ZONE_THRESH = 80; // units (~8km) — generous vs simplification drift between border.json and source polylines
const borderZones = border.map((pt) => {
  if (minDist(pt, rgPts) < ZONE_THRESH) return 'mexico';
  if (minDist(pt, neighborPts) < ZONE_THRESH) return 'land';
  return 'coast';
});
writeFileSync(join(ROOT, 'data', 'border-zones.json'), JSON.stringify(borderZones));
const zoneCounts = borderZones.reduce((a, z) => ((a[z] = (a[z] || 0) + 1), a), {});
console.log(`border zones: ${JSON.stringify(zoneCounts)} (of ${border.length} vertices)`);

// --- band places + population (skipped if the two extra args aren't given) ---
if (placesBase && popCsvPath) {
  // Same classification as src/geo.js's runtime inWorld/classify — keep in sync.
  // Nearest-BORDER-SEGMENT zone is not enough: near El Paso the closest Texas
  // border stretch is the Rio Grande even for points deep in New Mexico (Las
  // Cruces measures 'mexico' by nearest-segment but is plainly New Mexico
  // land) — classify by which neighbor-state polygon the point is actually
  // inside, falling back to nearest-segment only for coast-vs-mexico water.
  const SHOULDER_U = 402, SHELF_U = 1127;
  const closestOnSeg = (x, z, a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len2 = dx * dx + dz * dz;
    const t = len2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / len2)) : 0;
    return [a[0] + dx * t, a[1] + dz * t];
  };
  function inPoly(x, z, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i], [xj, zj] = poly[j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }
  const nearestDist = (x, z, poly) => {
    let bestD = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const p = closestOnSeg(x, z, poly[j], poly[i]);
      const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
      if (d < bestD) bestD = d;
    }
    return Math.sqrt(bestD);
  };
  const classify = (x, z) => {
    if (Object.values(neighborStates).some((ring) => inPoly(x, z, ring))) return 'land';
    let bestD = Infinity, bestI = 0;
    for (let i = 0, j = border.length - 1; i < border.length; j = i++) {
      const p = closestOnSeg(x, z, border[j], border[i]);
      const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
      if (d < bestD) { bestD = d; bestI = i; }
    }
    return borderZones[bestI] === 'coast' ? 'coast' : 'mexico';
  };
  const inTx = (x, z) => inPoly(x, z, border) || padreRings.some((r) => inPoly(x, z, r.map(proj)));
  const inWorldTest = (x, z) => {
    if (inTx(x, z)) return true;
    const zone = classify(x, z);
    if (zone === 'mexico') return false;
    return nearestDist(x, z, border) <= (zone === 'coast' ? SHELF_U : SHOULDER_U);
  };

  // population join key: place GEOID (STATE+PLACE, 7 digits) -> POPESTIMATE2022
  const csv = readFileSync(popCsvPath, 'utf8');
  const lines = csv.split('\n');
  const header = lines[0].replace(/^﻿/, '').split(',');
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const pop = new Map();
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i]; if (!l) continue;
    const c = l.split(',');
    if (c[idx.SUMLEV] !== '157' && c[idx.SUMLEV] !== '162') continue; // CDP + incorporated place only
    pop.set(c[idx.STATE] + c[idx.PLACE], +c[idx.POPESTIMATE2022]);
  }

  const places = readShapefile(placesBase).filter((f) => NEIGHBORS.includes(f.properties.STUSPS));
  const bandPlaces = [];
  for (const f of places) {
    const ring = [...f.rings].sort((a, b) => b.length - a.length)[0];
    if (!ring?.length) continue;
    let sx = 0, sz = 0;
    for (const p of ring) { sx += p[0]; sz += p[1]; }
    const centroidLL = [sx / ring.length, sz / ring.length];
    const [x, z] = proj(centroidLL);
    if (!inWorldTest(x, z)) continue;
    const p = pop.get(f.properties.GEOID);
    if (p === undefined) continue; // no population row (rare LSAD types) — skip rather than fake a number
    bandPlaces.push({ name: f.properties.NAME, state: f.properties.STUSPS, pop: p, x: +x.toFixed(1), z: +z.toFixed(1) });
  }
  bandPlaces.sort((a, b) => b.pop - a.pop);
  writeFileSync(join(ROOT, 'data', 'band-places.json'), JSON.stringify(bandPlaces));
  const perState = NEIGHBORS.map((s) => `${s}:${bandPlaces.filter((p) => p.state === s).length}`).join(' ');
  console.log(`band places: ${bandPlaces.length} (${perState})`);

  // cross-check vs the spec's measured "in at 25" / "kept out at 25" lists (2026-07-14 session)
  const names = new Set(bandPlaces.map((p) => p.name));
  const hasAny = (...cands) => cands.some((c) => names.has(c));
  // Hochatown OK is in-band by distance/zone but carries no population-estimate
  // row at all in sub-est2022 (checked: no PLACE=35030 row under STATE=40) — a
  // genuine data gap, not a clip bug, so it's excluded from this list on purpose.
  const KNOWN_IN = ['Shreveport', 'Texarkana', 'Las Cruces', 'Bossier City'];
  const KNOWN_OUT = ['Lawton', 'Lake Charles', 'Carlsbad', 'Roswell', 'Alamogordo'];
  const missingIn = KNOWN_IN.filter((n) => !hasAny(n));
  const wronglyIn = KNOWN_OUT.filter((n) => hasAny(n));
  console.log(`known-in check: ${missingIn.length ? 'MISSING ' + missingIn : 'ok'}`);
  console.log(`known-out check: ${wronglyIn.length ? 'WRONGLY INCLUDED ' + wronglyIn : 'ok'}`);
  if (missingIn.length) throw new Error(`band-places clip missed known-in cities: ${missingIn}`);
  if (wronglyIn.length) throw new Error(`band-places clip wrongly included known-out cities: ${wronglyIn}`);
} else {
  console.log('places/pop args not given — skipping band-places.json (W2 input, not required for W1 checks other than the join itself)');
}
