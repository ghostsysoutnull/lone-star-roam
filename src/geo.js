// Loads baked geo data and provides spatial queries.
// World: 1 unit = 100 m real. +x = east, -z = north. Built from real OSM data.

export const GEO = {
  border: [],    // [[x,z], ...] Texas border polygon
  highways: [],  // [{ref, type, pts:[[x,z],...]}]
  cities: [],    // [{name, x, z, pop}]
  rivers: [],    // [{name, pts:[[x,z],...]}]
  lakes: [],     // [{name, pts:[[x,z],...]}] closed polygons
  bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
};

export async function loadGeo(onStatus) {
  const get = async (f) => (await fetch(`data/${f}`)).json();
  onStatus?.('Loading border…');
  GEO.border = await get('border.json');
  onStatus?.('Loading highways…');
  GEO.highways = await get('highways.json');
  onStatus?.('Loading cities…');
  GEO.cities = await get('cities.json');
  onStatus?.('Loading rivers…');
  GEO.rivers = await get('rivers.json').catch(() => []);
  GEO.lakes = await get('lakes.json').catch(() => []);
  onStatus?.('Loading the night sky…');
  GEO.sky = await get('sky.json').catch(() => null); // real star catalog + constellations
  onStatus?.('Raising the terrain…');
  try {
    const ab = await (await fetch('data/elevation.bin')).arrayBuffer();
    ELEV.data = new Uint16Array(ab);
  } catch { ELEV.data = null; }
  onStatus?.('Drawing county lines…');
  GEO.counties = await get('counties.json').catch(() => []);
  for (const c of GEO.counties) {
    // bbox per county for cheap point-in-county prefiltering
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const ring of c.rings) for (const [x, z] of ring) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    c.bbox = [minX, maxX, minZ, maxZ];
  }

  const xs = GEO.border.map((p) => p[0]);
  const zs = GEO.border.map((p) => p[1]);
  GEO.bounds = {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minZ: Math.min(...zs), maxZ: Math.max(...zs),
  };

  buildRoadIndex();
  buildRiverIndex();
  return GEO;
}

// --- Real elevation (baked from AWS Terrarium DEM; constants mirror tools/build-elevation.mjs) ---
export const ELEV = { data: null, w: 420, h: 400, minX: -6900, maxX: 5800, minZ: -6200, maxZ: 5800 };
const VSCALE = 0.01 * 2.5; // 1:100 horizontal, 2.5x vertical exaggeration

// terrain height in game units at (x,z) — bilinear over the baked grid
export function hAt(x, z) {
  const e = ELEV;
  if (!e.data) return 0;
  const fx = ((x - e.minX) / (e.maxX - e.minX)) * (e.w - 1);
  const fz = ((z - e.minZ) / (e.maxZ - e.minZ)) * (e.h - 1);
  const i = Math.max(0, Math.min(e.w - 2, Math.floor(fx)));
  const j = Math.max(0, Math.min(e.h - 2, Math.floor(fz)));
  const dx = Math.max(0, Math.min(1, fx - i)), dz = Math.max(0, Math.min(1, fz - j));
  const m = (jj, ii) => e.data[jj * e.w + ii] & 0x7fff;
  const v =
    m(j, i) * (1 - dx) * (1 - dz) + m(j, i + 1) * dx * (1 - dz) +
    m(j + 1, i) * (1 - dx) * dz + m(j + 1, i + 1) * dx * dz;
  return v * VSCALE;
}

// outside-Texas mask at grid nodes (nearest neighbour is fine for tinting)
export function outsideAt(x, z) {
  const e = ELEV;
  if (!e.data) return false;
  const i = Math.round(((x - e.minX) / (e.maxX - e.minX)) * (e.w - 1));
  const j = Math.round(((z - e.minZ) / (e.maxZ - e.minZ)) * (e.h - 1));
  if (i < 0 || j < 0 || i >= e.w || j >= e.h) return true;
  return !!(e.data[j * e.w + i] & 0x8000);
}

// --- Spatial grid over highway segments for nearest-road queries ---
const CELL = 100;
const roadGrid = new Map();
const cellKey = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;

function buildRoadIndex() {
  for (const h of GEO.highways) {
    for (let i = 1; i < h.pts.length; i++) {
      const seg = { a: h.pts[i - 1], b: h.pts[i], hw: h };
      const midX = (seg.a[0] + seg.b[0]) / 2, midZ = (seg.a[1] + seg.b[1]) / 2;
      const k = cellKey(midX, midZ);
      if (!roadGrid.has(k)) roadGrid.set(k, []);
      roadGrid.get(k).push(seg);
    }
  }
}

// Nearest point on any highway within `radius` (default 300 units = 30 km real).
// Optional typeFilter: (type) => boolean, e.g. only streets.
export function nearestRoad(x, z, radius = 300, typeFilter = null) {
  let best = null, bestD = radius * radius;
  const r = Math.ceil(radius / CELL);
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let i = -r; i <= r; i++) {
    for (let j = -r; j <= r; j++) {
      const segs = roadGrid.get(`${cx + i},${cz + j}`);
      if (!segs) continue;
      for (const s of segs) {
        if (typeFilter && !typeFilter(s.hw.type)) continue;
        const p = closestOnSeg(x, z, s.a, s.b);
        const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
        if (d < bestD) { bestD = d; best = { x: p[0], z: p[1], ref: s.hw.ref, type: s.hw.type, dist: Math.sqrt(d) }; }
      }
    }
  }
  return best;
}

function closestOnSeg(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const L = dx * dx + dz * dz;
  const t = L ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / L)) : 0;
  return [a[0] + dx * t, a[1] + dz * t];
}

// --- Water: separate grid so rivers never count as roads for driving physics ---
const riverGrid = new Map();
function buildRiverIndex() {
  for (const r of GEO.rivers) {
    for (let i = 1; i < r.pts.length; i++) {
      const seg = { a: r.pts[i - 1], b: r.pts[i], name: r.name };
      const k = cellKey((seg.a[0] + seg.b[0]) / 2, (seg.a[1] + seg.b[1]) / 2);
      if (!riverGrid.has(k)) riverGrid.set(k, []);
      riverGrid.get(k).push(seg);
    }
  }
}

// Name of the water body at (x,z), or null. Lakes win over rivers (rivers feed lakes).
export function waterAt(x, z) {
  for (const lake of GEO.lakes) {
    let inside = false;
    const poly = lake.pts;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i], [xj, zj] = poly[j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    if (inside) return lake.name;
  }
  const HALF = 1.4; // a bit over the widest river ribbon's half-width
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  let best = null, bestD = HALF * HALF;
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const segs = riverGrid.get(`${cx + i},${cz + j}`);
      if (!segs) continue;
      for (const s of segs) {
        const p = closestOnSeg(x, z, s.a, s.b);
        const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
        if (d < bestD) { bestD = d; best = s.name; }
      }
    }
  }
  return best;
}

// Which county is (x,z) in? Cached: the answer rarely changes between calls.
let lastCounty = null;
const inRings = (x, z, rings) => {
  for (const poly of rings) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i], [xj, zj] = poly[j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
};
export function countyAt(x, z) {
  if (lastCounty && inRings(x, z, lastCounty.rings)) return lastCounty.name;
  for (const c of GEO.counties) {
    const [minX, maxX, minZ, maxZ] = c.bbox;
    if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
    if (inRings(x, z, c.rings)) { lastCounty = c; return c.name; }
  }
  return null;
}

export function nearestCity(x, z) {
  let best = null, bestD = Infinity;
  for (const c of GEO.cities) {
    const d = (c.x - x) ** 2 + (c.z - z) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return { city: best, dist: Math.sqrt(bestD) };
}

export function inTexas(x, z) {
  const poly = GEO.border;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// Deterministic RNG seeded by string — used for procedural cities/scatter
export function seededRand(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
