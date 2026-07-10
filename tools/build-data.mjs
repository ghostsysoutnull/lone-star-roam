#!/usr/bin/env node
// Build pipeline: raw OSM/GeoJSON -> compact game data (data/*.json)
// Usage: node tools/build-data.mjs <us-states.json> <motorways.json> <trunks.json> [primary.json] [metro-streets.json ...]
//        [--rivers=osm-rivers.json] [--lakes=ne_10m_lakes.json]
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [statesPath, motorwaysPath, trunksPath, primaryPath, ...metroPaths] = positional;

// --- Projection: local equirectangular centered on Texas, 1 game unit = 100 m real ---
const LAT0 = 31.0, LON0 = -99.5; // approx center of Texas
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((LAT0 * Math.PI) / 180);
const SCALE = 1 / 100; // 1:100 -> Texas ~13 km across in game
const proj = ([lon, lat]) => [
  +((lon - LON0) * M_PER_DEG_LON * SCALE).toFixed(1),
  +(-(lat - LAT0) * M_PER_DEG_LAT * SCALE).toFixed(1), // north = -z
];

// --- Douglas-Peucker simplification (in degrees) ---
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

// --- Point-in-polygon (ray cast) ---
function inPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

// --- 1. Texas border ---
const states = JSON.parse(readFileSync(statesPath, 'utf8'));
const tx = states.features.find((f) => (f.properties.name || f.properties.NAME) === 'Texas');
if (!tx) throw new Error('Texas not found in states file');
// Take largest ring (mainland; ignore tiny islands)
let rings = tx.geometry.type === 'Polygon' ? [tx.geometry.coordinates[0]] : tx.geometry.coordinates.map((p) => p[0]);
rings.sort((a, b) => b.length - a.length);
const borderDeg = rings[0]; // [lon,lat]
console.log(`Border: ${borderDeg.length} pts raw`);
const borderSimple = simplify(borderDeg, 0.0035); // keep the Red River wiggles at Texoma
console.log(`Border: ${borderSimple.length} pts simplified`);

// --- 2. Highways: chain OSM ways by ref + shared endpoints, simplify, clip ---
function loadWays(path, type) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  return data.elements
    .filter((e) => e.type === 'way' && e.geometry && e.geometry.length > 1)
    .map((e) => ({
      ref: (e.tags?.ref || e.tags?.name || '?').split(';')[0].trim(),
      type,
      pts: e.geometry.map((g) => [g.lon, g.lat]),
    }));
}
const ways = [...loadWays(motorwaysPath, 'motorway'), ...loadWays(trunksPath, 'trunk')];
if (primaryPath) ways.push(...loadWays(primaryPath, 'primary'));
for (const mp of metroPaths) ways.push(...loadWays(mp, 'street'));
console.log(`Ways loaded: ${ways.length}`);

// Chain ways sharing endpoints (same ref+type) into longer polylines
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
    // extend forward
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

// Clip to Texas border (with small buffer via bbox pre-check), simplify, project
// Per-tier simplification tolerance (deg) and minimum kept length (game units)
const TIER = {
  motorway: { tol: 0.0025, minLen: 15 },
  trunk: { tol: 0.0025, minLen: 15 },
  primary: { tol: 0.002, minLen: 8 },
  street: { tol: 0.0008, minLen: 4 }, // metro arterials — keep short blocks and curves
};
const highways = [];
for (const c of chains) {
  const { tol } = TIER[c.type];
  // split chain into runs of points inside Texas
  let run = [];
  const flush = () => {
    if (run.length > 1) {
      const s = simplify(run, tol);
      if (s.length > 1) highways.push({ ref: c.ref, type: c.type, pts: s.map(proj) });
    }
    run = [];
  };
  for (const p of c.pts) (inPoly(p, borderDeg) ? run.push(p) : flush());
  flush();
}
const lenOf = (pts) => {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
};
const kept = highways.filter((h) => lenOf(h.pts) > TIER[h.type].minLen);
kept.sort((a, b) => lenOf(b.pts) - lenOf(a.pts));
const totalPts = kept.reduce((s, h) => s + h.pts.length, 0);
console.log(`Highways kept: ${kept.length} polylines, ${totalPts} pts`);

// --- 3. Cities: real coordinates + 2020-ish population ---
const cities = [
  ['Houston', 29.7604, -95.3698, 2304580], ['San Antonio', 29.4241, -98.4936, 1434625],
  ['Dallas', 32.7767, -96.797, 1304379], ['Austin', 30.2672, -97.7431, 961855],
  ['Fort Worth', 32.7555, -97.3308, 918915], ['El Paso', 31.7619, -106.485, 678815],
  ['Arlington', 32.7357, -97.1081, 394266], ['Corpus Christi', 27.8006, -97.3964, 317863],
  ['Plano', 33.0198, -96.6989, 285494], ['Laredo', 27.5306, -99.4803, 255205],
  ['Lubbock', 33.5779, -101.8552, 257141], ['Garland', 32.9126, -96.6389, 246018],
  ['Irving', 32.814, -96.9489, 256684], ['Amarillo', 35.1991, -101.8313, 200393],
  ['Grand Prairie', 32.7459, -96.9978, 196100], ['Brownsville', 25.9017, -97.4975, 186738],
  ['McKinney', 33.1972, -96.6398, 195308], ['Frisco', 33.1507, -96.8236, 200509],
  ['Pasadena', 29.6911, -95.2091, 151950], ['Mesquite', 32.7668, -96.5992, 150108],
  ['Killeen', 31.1171, -97.7278, 153095], ['McAllen', 26.2034, -98.23, 142210],
  ['Waco', 31.5493, -97.1467, 138486], ['Carrollton', 32.9756, -96.89, 133434],
  ['Denton', 33.2148, -97.1331, 139869], ['Midland', 31.9973, -102.0779, 132524],
  ['Abilene', 32.4487, -99.7331, 125182], ['Beaumont', 30.0802, -94.1266, 115282],
  ['Round Rock', 30.5083, -97.6789, 119468], ['Odessa', 31.8457, -102.3676, 114428],
  ['Wichita Falls', 33.9137, -98.4934, 102316], ['Richardson', 32.9483, -96.7299, 119469],
  ['Lewisville', 33.0462, -96.9942, 111822], ['Tyler', 32.3513, -95.3011, 105995],
  ['College Station', 30.628, -96.3344, 120511], ['Pearland', 29.5636, -95.2861, 125828],
  ['San Angelo', 31.4638, -100.437, 99893], ['Allen', 33.1032, -96.6706, 104627],
  ['League City', 29.5075, -95.0949, 114392], ['Sugar Land', 29.6197, -95.6349, 111026],
  ['Longview', 32.5007, -94.7405, 81638], ['Edinburg', 26.3017, -98.1633, 100243],
  ['Mission', 26.2159, -98.3253, 85778], ['Bryan', 30.6744, -96.37, 83980],
  ['Baytown', 29.7355, -94.9774, 83701], ['Pharr', 26.1948, -98.1836, 79715],
  ['Temple', 31.0982, -97.3428, 82073], ['Missouri City', 29.6186, -95.5377, 74259],
  ['Flower Mound', 33.0146, -97.097, 75956], ['Harlingen', 26.1906, -97.6961, 71829],
  ['North Richland Hills', 32.8343, -97.2289, 69917], ['Victoria', 28.8053, -97.0036, 65534],
  ['Conroe', 30.3119, -95.4561, 89956], ['New Braunfels', 29.703, -98.1245, 90403],
  ['Cedar Park', 30.5052, -97.8203, 77595], ['Mansfield', 32.5632, -97.1417, 72602],
  ['Rowlett', 32.9029, -96.5639, 62535], ['Port Arthur', 29.885, -93.94, 56039],
  ['Euless', 32.8371, -97.082, 61032], ['Georgetown', 30.6333, -97.6779, 75420],
  ['Pflugerville', 30.4394, -97.62, 65191], ['DeSoto', 32.5896, -96.857, 56145],
  ['San Marcos', 29.8833, -97.9414, 67553], ['Grapevine', 32.9343, -97.0781, 50631],
  ['Galveston', 29.3013, -94.7977, 53695], ['Texarkana', 33.4251, -94.0477, 36193],
  ['Del Rio', 29.3709, -100.8959, 34673], ['Eagle Pass', 28.7091, -100.4995, 28130],
  ['Nacogdoches', 31.6035, -94.6549, 32147], ['Lufkin', 31.3382, -94.729, 34143],
  ['Sherman', 33.6357, -96.6089, 43645], ['Paris', 33.6609, -95.5555, 24171],
  ['Big Spring', 32.2504, -101.4787, 26144], ['Alpine', 30.3585, -103.661, 5905],
  ['Marfa', 30.3095, -104.0207, 1788], ['Fort Stockton', 30.894, -102.8794, 8283],
  ['Pecos', 31.4229, -103.4932, 12916], ['Van Horn', 31.0399, -104.8308, 1941],
  ['Uvalde', 29.2097, -99.7862, 15217], ['Kerrville', 30.0474, -99.1403, 24278],
  ['Fredericksburg', 30.2752, -98.872, 10875], ['Brownwood', 31.7093, -98.9912, 18813],
  ['Stephenville', 32.2207, -98.2023, 20897], ['Waxahachie', 32.3865, -96.8483, 41140],
  ['Corsicana', 32.0954, -96.4689, 25109], ['Palestine', 31.7621, -95.6308, 18544],
  ['Huntsville', 30.7235, -95.5508, 45941], ['Lake Jackson', 29.0339, -95.4344, 28177],
  ['Bay City', 28.9828, -95.9694, 17614], ['Kingsville', 27.5159, -97.8561, 25402],
  ['Alice', 27.7522, -98.0697, 17891], ['Beeville', 28.4009, -97.7486, 13543],
  ['Childress', 34.4265, -100.204, 5737], ['Dalhart', 36.0598, -102.5138, 8420],
  ['Dumas', 35.8656, -101.9732, 14501], ['Pampa', 35.5362, -100.9599, 16867],
  ['Plainview', 34.1848, -101.7068, 20187], ['Snyder', 32.7179, -100.9176, 11438],
  ['Sweetwater', 32.4709, -100.4059, 10622], ['Vernon', 34.1554, -99.2662, 10078],
  ['Denison', 33.7557, -96.5367, 24479], ['Greenville', 33.1385, -96.1108, 28164],
  ['Athens', 32.2049, -95.8555, 12857], ['Marshall', 32.5449, -94.3674, 23392],
  ['Orange', 30.0938, -93.7366, 19324], ['Jacksonville', 31.9638, -95.2705, 13856],
  ['Cleburne', 32.3476, -97.3867, 31352], ['Weatherford', 32.7593, -97.7972, 30854],
  ['Mineral Wells', 32.8085, -98.1128, 14868], ['Gainesville', 33.6262, -97.1333, 17394],
  ['Borger', 35.6678, -101.3974, 12551], ['Hereford', 34.8153, -102.3977, 14972],
  ['Levelland', 33.5873, -102.378, 12652], ['Brenham', 30.1669, -96.3977, 17369],
  ['Seguin', 29.5688, -97.9647, 29433], ['Gonzales', 29.5016, -97.4525, 7165],
  ['Port Lavaca', 28.615, -96.6261, 11557], ['Rockport', 28.0206, -97.0544, 10077],
  ['Raymondville', 26.4815, -97.7831, 10768], ['Falfurrias', 27.2267, -98.144, 4589],
  ['Zapata', 26.9073, -99.2717, 5089], ['Rio Grande City', 26.3798, -98.8203, 15317],
  ['Presidio', 29.5607, -104.3719, 3874], ['Sanderson', 30.1424, -102.3946, 681],
  ['Ozona', 30.7102, -101.2004, 2749], ['Sonora', 30.5669, -100.6437, 2643],
  ['Junction', 30.4894, -99.7726, 2504], ['Llano', 30.7594, -98.675, 3325],
  ['Lampasas', 31.0638, -98.1817, 7291], ['Brady', 31.1352, -99.3351, 5164],
  ['Coleman', 31.8274, -99.4265, 4083], ['Ballinger', 31.7385, -99.9462, 3446],
].map(([name, lat, lon, pop]) => {
  const [x, z] = proj([lon, lat]);
  return { name, x, z, pop };
});
console.log(`Cities: ${cities.length}`);

// --- 4. Rivers: chain by name, clip to *dilated* border (Rio Grande/Red River ARE the border) ---
// distance (deg, approx) from point to border polyline
function distToBorder(p) {
  let best = Infinity;
  for (let i = 0; i < borderDeg.length; i++) {
    const a = borderDeg[i], b = borderDeg[(i + 1) % borderDeg.length];
    let x = a[0], y = a[1];
    const dx = b[0] - x, dy = b[1] - y, L = dx * dx + dy * dy;
    if (L) {
      const t = Math.max(0, Math.min(1, ((p[0] - x) * dx + (p[1] - y) * dy) / L));
      x += dx * t; y += dy * t;
    }
    best = Math.min(best, (p[0] - x) ** 2 + (p[1] - y) ** 2);
  }
  return Math.sqrt(best);
}
const inDilatedTexas = (p) => inPoly(p, borderDeg) || distToBorder(p) < 0.035; // ~3.5 km buffer

let rivers = [];
if (flags.rivers) {
  const riverWays = loadWays(flags.rivers, 'river').map((w) => ({ ...w, ref: w.ref.replace(/^\?$/, 'River') }));
  // chain by name (same algorithm as roads)
  const byName = new Map();
  for (const w of riverWays) {
    if (!byName.has(w.ref)) byName.set(w.ref, []);
    byName.get(w.ref).push(w);
  }
  for (const [name, group] of byName) {
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
      const pts = [...group[i].pts];
      for (;;) {
        const nexts = (startMap.get(key(pts[pts.length - 1])) || []).filter((j) => !used.has(j));
        if (!nexts.length) break;
        used.add(nexts[0]);
        pts.push(...group[nexts[0]].pts.slice(1));
      }
      // clip to dilated Texas, simplify, project
      let run = [];
      const flush = () => {
        if (run.length > 1) {
          const s = simplify(run, 0.002);
          if (s.length > 1 && lenOf(s.map(proj)) > 8) rivers.push({ name, pts: s.map(proj) });
        }
        run = [];
      };
      for (const p of pts) (inDilatedTexas(p) ? run.push(p) : flush());
      flush();
    }
  }
  console.log(`Rivers: ${rivers.length} polylines, ${rivers.reduce((s, r) => s + r.pts.length, 0)} pts`);
}

// --- 5. Lakes: Natural Earth polygons with any point in dilated Texas ---
let lakes = [];
if (flags.lakes) {
  const ne = JSON.parse(readFileSync(flags.lakes, 'utf8'));
  for (const f of ne.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      const ring = poly[0]; // outer ring only
      if (!ring.some((p) => p[1] > 25.8 && p[1] < 36.6 && p[0] > -106.7 && p[0] < -93.5)) continue;
      if (!ring.some(inDilatedTexas)) continue;
      const s = simplify(ring, 0.002);
      if (s.length > 3) lakes.push({ name: f.properties.name || 'Lake', pts: s.map(proj) });
    }
  }
  console.log(`Lakes: ${lakes.map((l) => l.name).join(', ')}`);
}

// --- Write outputs ---
mkdirSync(join(ROOT, 'data'), { recursive: true });
const border = borderSimple.map(proj);
writeFileSync(join(ROOT, 'data', 'border.json'), JSON.stringify(border));
writeFileSync(join(ROOT, 'data', 'highways.json'), JSON.stringify(kept));
writeFileSync(join(ROOT, 'data', 'cities.json'), JSON.stringify(cities));
if (flags.rivers) writeFileSync(join(ROOT, 'data', 'rivers.json'), JSON.stringify(rivers));
if (flags.lakes) writeFileSync(join(ROOT, 'data', 'lakes.json'), JSON.stringify(lakes));
for (const f of ['border.json', 'highways.json', 'cities.json', 'rivers.json', 'lakes.json']) {
  const { statSync } = await import('fs');
  console.log(`data/${f}: ${(statSync(join(ROOT, 'data', f)).size / 1024).toFixed(0)} KB`);
}
