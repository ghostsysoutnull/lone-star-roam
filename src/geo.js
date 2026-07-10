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
