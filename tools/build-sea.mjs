// Bakes data/sea.json — AIS-informed ship routes + the eight real Texas ports.
// usage (from repo root): node tools/build-sea.mjs
//   inputs (not in the repo):
//     ~/claude-area/devel/tx-inputs/ais-density.json   (node tools/reduce-ais.mjs <AIS zip>;
//         source zip: marinecadastre.gov AIS_2024_03_15.zip, national daily CSV)
//     ~/claude-area/devel/tx-inputs/sea-quays.json     (Overpass, 2026-07-23, 57 ways)
//     ~/claude-area/devel/tx-inputs/sea-cranes.json    (Overpass, 2026-07-23, 11 elements)
//
// Recorded queries (curl -sG https://maps.mail.ru/osm/tools/overpass/api/interpreter --data-urlencode "data=<query>"):
//   quays   [out:json][timeout:120];(way["man_made"="quay"](25.8,-97.7,30.2,-93.7);
//           way["industrial"="port"](25.8,-97.7,30.2,-93.7);way["waterway"="dock"](25.8,-97.7,30.2,-93.7);
//           way["landuse"="harbour"](25.8,-97.7,30.2,-93.7););out geom;
//   cranes  [out:json][timeout:120];(node["man_made"="crane"](25.8,-97.7,30.2,-93.7);
//           way["man_made"="crane"](25.8,-97.7,30.2,-93.7););out center;
//
// Route pipeline (the W1 scout, 2026-07-23): march corridor guides along the
// AIS unique-vessel density ridge (cargo classes 70-89 primary, tug 31/32/52
// corroboration), clamp to in-game navigable water (boatableAt + inWorld,
// 12u hull clearance), weld junctions, then GATE loudly:
//   - median lateral offset of evidence-snapped waypoints vs the ridge <= 20u
//   - zero waypoints / zero 10u-sampled segments outside navigable water
// Hand-laid corridors (straits + world-edge compressions, no evidence gate):
//   houston-roads (Bolivar Roads), corpus-harbor (the game's Aransas strait,
//   ~60-100u NW of the real pass), sabine-approach (real channel rides the
//   TX/LA line beyond the world edge; Port Arthur roadstead in Sabine Lake).
// Brownsville is gulf-side only — the game's barrier island has no Brazos
// Santiago cut, so deep-draft ships hold the roadstead (as in life).
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

const IN = `${homedir()}/claude-area/devel/tx-inputs`;

// node-side GEO: file-backed fetch shim (script runs from repo root)
globalThis.fetch = async (path) => {
  const buf = readFileSync(path);
  return { json: async () => JSON.parse(buf.toString()), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), ok: true };
};
const { loadGeo, boatableAt, inWorld } = await import('../src/geo.js');
await loadGeo();

// same equirectangular projection as tools/build-data.mjs `proj`
const proj = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];

const D = JSON.parse(readFileSync(`${IN}/ais-density.json`));

const mkField = (cells) => {
  const F = new Float32Array(D.w * D.h);
  for (const [ix, iz, u] of cells) F[iz * D.w + ix] = u;
  return (x, z) => {
    const gx = (x - D.x0) / D.cell - 0.5, gz = (z - D.z0) / D.cell - 0.5;
    const ix = Math.floor(gx), iz = Math.floor(gz);
    if (ix < 0 || iz < 0 || ix >= D.w - 1 || iz >= D.h - 1) return 0;
    const fx = gx - ix, fz = gz - iz, i = iz * D.w + ix;
    return F[i] * (1 - fx) * (1 - fz) + F[i + 1] * fx * (1 - fz) + F[i + D.w] * (1 - fx) * fz + F[i + D.w + 1] * fx * fz;
  };
};
const cargo = mkField(D.cells), tug = mkField(D.tugCells);

const nav = (x, z, r = 12) => {
  if (!inWorld(x, z) || !boatableAt(x, z)) return false;
  for (let a = 0; a < 8; a++) if (!boatableAt(x + r * Math.cos(a * Math.PI / 4), z + r * Math.sin(a * Math.PI / 4))) return false;
  return true;
};
const clamp = (x, z) => {
  if (nav(x, z)) return null;
  for (let r = 15; r <= 400; r += 15) {
    for (let a = 0; a < 24; a++) {
      const cx = x + r * Math.cos(a * Math.PI / 12), cz = z + r * Math.sin(a * Math.PI / 12);
      if (nav(cx, cz)) return [cx, cz];
    }
  }
  return null;
};

// corridor guides: rough centerlines read off the density heatmap; the tracer
// owns precision for evidence corridors, HAND guides are final geometry
const HAND = new Set(['houston-roads', 'corpus-harbor', 'sabine-approach']);
const CORRIDORS = {
  'houston-approach':   [[4284, 1408], [4400, 1690], [4450, 1795]],
  'houston-roads':      [[4450, 1795], [4450, 1815], [4490, 1824], [4505, 1830], [4560, 1836], [4620, 1856], [4620, 1880]],
  'houston-fan':        [[4620, 1880], [4750, 1990], [4900, 2100]],
  'sabine-approach':    [[5320, 1500], [5330, 1750], [5330, 2000], [5335, 2150], [5338, 2280], [5380, 2403]],
  'freeport-approach':  [[3960, 2282], [4013, 2296], [4150, 2400]],
  'corpus-harbor':      [[2034, 3549], [2140, 3546], [2200, 3548], [2225, 3535], [2230, 3520], [2238, 3505], [2260, 3496], [2300, 3492], [2350, 3494], [2380, 3500]],
  'corpus-approach':    [[2380, 3500], [2450, 3545], [2700, 3560], [2966, 3564]],
  'brownsville-approach':[[2262, 5472], [2320, 5450], [2380, 5430]],
  'trunk-south':        [[2380, 5430], [2440, 4800], [2480, 4200], [2600, 3800], [2950, 3550]],
  'trunk-mid':          [[2950, 3550], [3300, 3150], [3700, 2800], [4050, 2500], [4230, 2450]],
  'trunk-north':        [[4230, 2450], [4500, 2400], [4800, 2250], [4950, 2150]],
  'trunk-ne':           [[4950, 2150], [5200, 2350], [5450, 2400], [5620, 2300]],
};

const STEP = 30, HALF = 80, DO = 2.5;
function trace(guide) {
  const pts = [];
  for (let i = 1; i < guide.length; i++) {
    const [ax, az] = guide[i - 1], [bx, bz] = guide[i];
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / STEP));
    for (let k = (i === 1 ? 0 : 1); k <= n; k++) {
      const t = k / n;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const dx = (bx - ax) / len, dz = (bz - az) / len, nx = -dz, nz = dx;
      const centroid = (field) => {
        let sw = 0, so = 0, peak = 0;
        for (let o = -HALF; o <= HALF; o += DO) {
          const w = field(x + nx * o, z + nz * o) ** 2;
          sw += w; so += w * o; peak = Math.max(peak, w);
        }
        return { o: sw ? so / sw : 0, peak };
      };
      const c = centroid(cargo);
      if (c.peak >= 0.8) { pts.push({ x: x + nx * c.o, z: z + nz * c.o, src: 'cargo' }); continue; }
      const g = centroid(tug);
      if (g.peak >= 0.8) { pts.push({ x: x + nx * g.o, z: z + nz * g.o, src: 'tug' }); continue; }
      pts.push({ x, z, src: 'none' });
    }
  }
  return pts;
}

function simplify(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const A = pts[a], B = pts[b];
    const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz) || 1;
    let mi = -1, md = 0;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i].x - A.x) * dz - (pts[i].z - A.z) * dx) / L;
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

function segmentRepair(pts) {
  let inserts = 0;
  for (let pass = 0; pass < 6; pass++) {
    let fixed = 0;
    for (let i = 1; i < pts.length; i++) {
      const A = pts[i - 1], B = pts[i];
      if (A.gap || B.gap) continue;
      const L = Math.hypot(B.x - A.x, B.z - A.z);
      if (L <= 12) continue;
      const n = Math.ceil(L / 10);
      for (let k = 1; k < n; k++) {
        const t = k / n, x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t;
        if (nav(x, z)) continue;
        const c = clamp(x, z);
        const stuck = !c || Math.min(Math.hypot(c[0] - A.x, c[1] - A.z), Math.hypot(c[0] - B.x, c[1] - B.z)) < 8 || inserts >= 40;
        pts.splice(i, 0, stuck ? { gap: true } : { x: c[0], z: c[1], src: 'none', clamped: true });
        if (!stuck) inserts++;
        fixed++;
        break;
      }
    }
    if (!fixed) return pts;
  }
  return pts;
}
function longestRun(pts) {
  let best = [], cur = [];
  for (const p of pts) {
    if (p.gap) { if (cur.length > best.length) best = cur; cur = []; continue; }
    cur.push(p);
  }
  return cur.length > best.length ? cur : best;
}
const smoothPts = (pts) => pts.map((p, i) => {
  if (i === 0 || i === pts.length - 1 || !p.clamped) return p;
  const a = pts[i - 1], b = pts[i + 1];
  return { ...p, x: (a.x + p.x * 2 + b.x) / 4, z: (a.z + p.z * 2 + b.z) / 4 };
});
const distToPolyline = (p, pts) => {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const A = pts[i - 1], B = pts[i];
    const dx = B.x - A.x, dz = B.z - A.z, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p.x - A.x) * dx + (p.z - A.z) * dz) / L2));
    best = Math.min(best, Math.hypot(p.x - (A.x + dx * t), p.z - (A.z + dz * t)));
  }
  return best;
};

const corridors = {};
const gateOffsets = [];
for (const [name, guide] of Object.entries(CORRIDORS)) {
  if (HAND.has(name)) { corridors[name] = guide.map((p) => [...p]); continue; }
  const ridge = trace(guide);
  const evidence = ridge.filter((p) => p.src !== 'none');
  let wet = [];
  for (const p of ridge) {
    if (nav(p.x, p.z)) { wet.push(p); continue; }
    const c = clamp(p.x, p.z);
    wet.push(c ? { x: c[0], z: c[1], src: p.src, clamped: true } : { gap: true });
  }
  wet = smoothPts(smoothPts(longestRun(segmentRepair(wet))));
  const wps = simplify(wet, 12);
  if (evidence.length) gateOffsets.push(...wps.filter((p) => !p.clamped).map((p) => distToPolyline(p, evidence)));
  corridors[name] = wps.map((p) => [p.x, p.z]);
}

// junctions: first member anchors when marked (hand/strait endpoints are fixed)
const JUNCTIONS = [
  ['J-brownsville', [['brownsville-approach', -1], ['trunk-south', 0]], false],
  ['J-corpus', [['corpus-approach', -1], ['trunk-south', -1], ['trunk-mid', 0]], false],
  ['J-cc-harbor', [['corpus-harbor', -1], ['corpus-approach', 0]], true],
  ['J-freeportN', [['trunk-mid', -1], ['trunk-north', 0]], false],
  ['J-galveston', [['trunk-north', -1], ['trunk-ne', 0], ['houston-fan', -1]], false],
  ['J-hou-bay', [['houston-roads', 0], ['houston-approach', -1]], true],
  ['J-hou-roads', [['houston-roads', -1], ['houston-fan', 0]], true],
  ['J-sabine', [['sabine-approach', -1], ['trunk-ne', -1]], true],
];
for (const [, members, anchored] of JUNCTIONS) {
  const ends = members.map(([n, i]) => corridors[n].at(i));
  let mx, mz;
  if (anchored) [mx, mz] = ends[0];
  else {
    mx = ends.reduce((a, p) => a + p[0], 0) / ends.length;
    mz = ends.reduce((a, p) => a + p[1], 0) / ends.length;
    if (!nav(mx, mz)) { const c = clamp(mx, mz); if (c) [mx, mz] = c; }
  }
  for (const [n, i] of members) corridors[n][i === -1 ? corridors[n].length - 1 : i] = [mx, mz];
}
// freeport joins the trunk at the nearest trunk vertex
{
  const fa = corridors['freeport-approach'];
  const trunk = [...corridors['trunk-mid'], ...corridors['trunk-north']];
  const end = fa[fa.length - 1];
  fa.push([...trunk.reduce((b, p) => (!b || Math.hypot(p[0] - end[0], p[1] - end[1]) < Math.hypot(b[0] - end[0], b[1] - end[1]) ? p : b), null)]);
}
// post-weld repair (no longestRun — a residual gap must fail the gate, never amputate)
for (const [name, wps] of Object.entries(corridors)) {
  if (HAND.has(name)) continue;
  let pts = wps.map(([x, z]) => {
    if (nav(x, z)) return { x, z };
    const c = clamp(x, z);
    return c ? { x: c[0], z: c[1], clamped: true } : { gap: true };
  });
  pts = simplify(segmentRepair(pts).filter((p) => !p.gap), 6);
  corridors[name] = pts.map((p) => [p.x, p.z]);
}

// ---- GATE (loud) ----
gateOffsets.sort((a, b) => a - b);
const gateMed = gateOffsets[Math.floor(gateOffsets.length / 2)];
let badWp = 0, badSeg = 0;
for (const wps of Object.values(corridors)) {
  for (const [x, z] of wps) if (!nav(x, z)) badWp++;
  for (let i = 1; i < wps.length; i++) {
    const L = Math.hypot(wps[i][0] - wps[i - 1][0], wps[i][1] - wps[i - 1][1]);
    const n = Math.ceil(L / 10);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (!nav(wps[i - 1][0] + (wps[i][0] - wps[i - 1][0]) * t, wps[i - 1][1] + (wps[i][1] - wps[i - 1][1]) * t)) { badSeg++; break; }
    }
  }
}
console.log(`gate: median wp-vs-ridge ${gateMed.toFixed(1)}u (n=${gateOffsets.length})  nav failures: ${badWp} wps, ${badSeg} segments`);
if (gateMed > 20) throw new Error(`GATE FAIL: median offset ${gateMed.toFixed(1)}u > 20u`);
if (badWp || badSeg) throw new Error(`GATE FAIL: ${badWp} waypoints / ${badSeg} segments outside navigable water`);

// ---- routes: corridors concatenated into sailable lines ----
const cat = (...names) => {
  const pts = [];
  for (const n of names) {
    for (const p of corridors[n]) {
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 1) pts.push([Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
    }
  }
  return pts;
};
const routes = [
  { id: 'trunk', kind: 'trunk', types: { container: 0.3, tanker: 0.4, bulk: 0.2, chemical: 0.1 }, pts: cat('trunk-south', 'trunk-mid', 'trunk-north', 'trunk-ne') },
  { id: 'houston', kind: 'approach', port: 'houston', types: { container: 0.5, tanker: 0.2, bulk: 0.2, chemical: 0.1 }, pts: cat('houston-approach', 'houston-roads', 'houston-fan') },
  { id: 'sabine', kind: 'approach', port: 'portarthur', types: { tanker: 0.6, chemical: 0.3, bulk: 0.1 }, pts: cat('sabine-approach') },
  { id: 'freeport', kind: 'approach', port: 'freeport', types: { chemical: 0.5, container: 0.3, tanker: 0.2 }, pts: cat('freeport-approach') },
  { id: 'corpus', kind: 'approach', port: 'corpus', types: { tanker: 0.7, bulk: 0.3 }, pts: cat('corpus-harbor', 'corpus-approach') },
  { id: 'brownsville', kind: 'approach', port: 'brownsville', types: { bulk: 0.7, tanker: 0.3 }, pts: cat('brownsville-approach') },
];

// ---- the eight ports (anchors + character authored; quays/berth from OSM where mapped) ----
const PORT_TABLE = [
  { id: 'houston', name: 'Port of Houston', ll: [29.735, -95.01], character: 'container', info: '#1 U.S. port by tonnage', route: 'houston' },
  { id: 'corpus', name: 'Port of Corpus Christi', ll: [27.815, -97.40], character: 'tanker', info: 'top U.S. crude exporter', route: 'corpus' },
  { id: 'galveston', name: 'Port of Galveston', ll: [29.31, -94.79], character: 'container', info: 'cruise and cargo since 1825', route: 'houston' },
  { id: 'beaumont', name: 'Port of Beaumont', ll: [30.08, -94.09], character: 'bulk', info: 'busiest U.S. military outload port', route: 'sabine' },
  { id: 'portarthur', name: 'Port of Port Arthur', ll: [29.83, -93.93], character: 'tanker', info: 'refinery row on the Sabine-Neches', route: 'sabine' },
  { id: 'texascity', name: 'Port of Texas City', ll: [29.38, -94.90], character: 'chemical', info: 'petrochemical wharves on the bay', route: 'houston' },
  { id: 'freeport', name: 'Port Freeport', ll: [28.95, -95.35], character: 'chemical', info: 'chemistry on the Brazos mouth', route: 'freeport' },
  { id: 'brownsville', name: 'Port of Brownsville', ll: [25.95, -97.40], character: 'bulk', info: 'the border deep-water port', route: 'brownsville' },
];
const Q = JSON.parse(readFileSync(`${IN}/sea-quays.json`)).elements;
const C = JSON.parse(readFileSync(`${IN}/sea-cranes.json`)).elements;
let osmJoined = 0;
const ports = PORT_TABLE.map((p) => {
  const [x, z] = proj(...p.ll);
  const quays = [];
  for (const w of Q) {
    if (!w.geometry) continue;
    const pts = w.geometry.map((g) => proj(g.lat, g.lon).map((v) => Math.round(v * 10) / 10));
    if (Math.min(...pts.map(([qx, qz]) => Math.hypot(qx - x, qz - z))) < 80) quays.push(pts);
  }
  const cranes = C.filter((c) => {
    const ll = c.center ?? c;
    const [cx, cz] = proj(ll.lat, ll.lon);
    return Math.hypot(cx - x, cz - z) < 80;
  }).length;
  if (quays.length) osmJoined++;
  // berth: nearest boatable point to the anchor (null when the harbor is not
  // game water — Beaumont / Port Arthur / Brownsville; ships use the roadstead)
  let berth = null;
  outer: for (let r = 5; r <= 120; r += 5) {
    for (let a = 0; a < 16; a++) {
      const bx = x + r * Math.cos(a * Math.PI / 8), bz = z + r * Math.sin(a * Math.PI / 8);
      if (boatableAt(bx, bz)) { berth = [Math.round(bx * 10) / 10, Math.round(bz * 10) / 10]; break outer; }
    }
  }
  // roadstead: nearest point of the port's route — always exists
  const route = routes.find((r) => r.id === p.route);
  const road = route.pts.reduce((b, q) => (!b || Math.hypot(q[0] - x, q[1] - z) < Math.hypot(b[0] - x, b[1] - z) ? q : b), null);
  return { id: p.id, name: p.name, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, character: p.character, info: p.info, route: p.route, quays, cranes, berth, roadstead: [...road] };
});
console.log(`ports: ${ports.length} (OSM quays joined at ${osmJoined} — Brownsville + Texas City have no OSM dock mapped, authored kits only)`);
if (ports.length !== 8) throw new Error(`expected 8 ports, built ${ports.length}`);
if (osmJoined < 6) throw new Error(`OSM quay join regressed: ${osmJoined}/8 (expected 6/8 as of 2026-07-23)`);
for (const p of ports) {
  if (!p.roadstead) throw new Error(`${p.id}: no roadstead`);
  console.log(`  ${p.id.padEnd(12)} ${p.character.padEnd(9)} quays ${String(p.quays.length).padStart(2)}  cranes ${p.cranes}  berth ${p.berth ? 'yes' : 'roadstead-only'}`);
}

const out = { routes, ports };
writeFileSync('data/sea.json', JSON.stringify(out));
const bytes = JSON.stringify(out).length;
console.log(`routes: ${routes.map((r) => `${r.id}(${r.pts.length})`).join(' ')}  total pts ${routes.reduce((a, r) => a + r.pts.length, 0)}`);
console.log(`wrote data/sea.json (${(bytes / 1024).toFixed(1)} KB)`);
