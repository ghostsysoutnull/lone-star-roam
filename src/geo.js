// Loads baked geo data and provides spatial queries.
// World: 1 unit = 100 m real. +x = east, -z = north. Built from real OSM data.

export const GEO = {
  border: [],    // [[x,z], ...] Texas mainland border polygon
  islands: [],   // [[[x,z],...], ...] Padre's rings — part of Texas (inTexas), not the mainland ring
  borderZones: [], // ['land'|'coast'|'mexico', ...] parallel to `border`, one per vertex
  neighborStates: {}, // { LA: [[x,z],...], AR: [...], OK: [...], NM: [...] } mainland rings
  neighborCounties: [], // [{state, name, ring, bbox}] LA parishes + AR/OK/NM counties
  highways: [],  // [{ref, type, pts:[[x,z],...]}]
  cities: [],    // [{name, x, z, pop}]
  bandHighways: [], // [{ref, type, pts:[[x,z],...]}] shoulder through-route arterials — NEVER merge into
                     // `highways`: mkRoses draws `hws[floor(rand()*hws.length)]`, so any length change
                     // to GEO.highways reshuffles every rose, not just new ones (W2 landmine).
  bandCities: [],   // [{name, state, x, z, pop}] band-of-neighbor-states places — NEVER merge into
                     // `cities`: the 132 Texas count is hardcoded in index.html/gameplay.js.
  rivers: [],    // [{name, pts:[[x,z],...]}]
  lakes: [],     // [{name, pts:[[x,z],...]}] closed polygons
  rails: [],    // [{pts:[[x,z],...]}] real railway geometry
  bandRails: [], // [{pts:[[x,z],...], operator?, name?, band:true}] neighbor-state railway
                  // geometry — NEVER merge into `rails`: keeps the same array/file separation
                  // as bandHighways/bandCities even though (unlike those) nothing today indexes
                  // rails.json by array position. Indexed into the SAME rail spatial grid as
                  // GEO.rails (see buildRailIndex) — nearestRail is display-only, not driving
                  // physics, so the placard just works across the state line for free.
  bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
  ag: {},        // county name -> {cattle, horses, goats, sheep, onFeed, irrAcres, crops, areaKm2, dominantCrop}
  bandAg: {},    // "STATE|County Name" -> same record shape as `ag`, band counties (LA/AR/OK/NM)
  energy: { counties: {}, windFarms: [], plants: [], refineries: [], lines345: [], substations: [], platforms: [], fairways: [] },
  // energy.counties: county name -> {wells, wellKm2} (all 254, ag idiom).
  // Site lists read directly off GEO.energy (GEO.cities idiom) — no per-list
  // accessor, only energyAt() for the per-county record. tools/build-energy.mjs.
};

export async function loadGeo(onStatus) {
  const get = async (f) => (await fetch(`data/${f}`)).json();
  onStatus?.('Loading border…');
  GEO.border = await get('border.json');
  GEO.islands = await get('islands.json').catch(() => []);
  GEO.borderZones = await get('border-zones.json').catch(() => []);
  GEO.neighborStates = await get('neighbor-states.json').catch(() => ({}));
  GEO.neighborCounties = await get('neighbor-counties.json').catch(() => []);
  for (const c of GEO.neighborCounties) {
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const [x, z] of c.ring) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    c.bbox = [minX, maxX, minZ, maxZ];
  }
  onStatus?.('Loading highways…');
  GEO.highways = await get('highways.json');
  GEO.bandHighways = await get('band-highways.json').catch(() => []);
  onStatus?.('Loading cities…');
  GEO.cities = await get('cities.json');
  GEO.bandCities = await get('band-places.json').catch(() => []);
  onStatus?.('Loading rivers…');
  GEO.rivers = await get('rivers.json').catch(() => []);
  GEO.lakes = await get('lakes.json').catch(() => []);
  GEO.rails = await get('rails.json').catch(() => []);
  GEO.bandRails = await get('band-rails.json').catch(() => []);
  onStatus?.('Loading the night sky…');
  GEO.sky = await get('sky.json').catch(() => null); // real star catalog + constellations
  onStatus?.('Raising the terrain…');
  try {
    const ab = await (await fetch('data/elevation.bin')).arrayBuffer();
    ELEV.data = new Uint16Array(ab);
  } catch { ELEV.data = null; }
  // per-lake water level: lowest shoreline + LAKE_OFFSET — the single source
  // read by both the lake mesh (world.js buildWater) and boatableAt
  for (const lake of GEO.lakes)
    lake.level = Math.min(...lake.pts.map(([x, z]) => hAt(x, z))) + LAKE_OFFSET;
  onStatus?.('Drawing county lines…');
  GEO.counties = await get('counties.json').catch(() => []);
  GEO.ag = await get('agriculture.json').catch(() => ({}));
  GEO.bandAg = await get('band-agriculture.json').catch(() => ({}));
  onStatus?.('Mapping the energy grid…');
  GEO.energy = await get('energy.json').catch(() => GEO.energy);
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
  buildBandRoadIndex();
  buildRailIndex();
  buildRiverIndex();
  return GEO;
}

// The one gulf water plane's height (GOTCHAS: never a second surface) —
// world.js builds the mesh here, maritime hulls float relative to it, and
// BOAT (vehicle.js) rides it. Lakes instead sit at lowest-shoreline +
// LAKE_OFFSET, baked per lake in loadGeo (W2 retunes the look there).
export const SEA_Y = -2.5;
export const LAKE_OFFSET = 0.15;

// --- Real elevation (baked from AWS Terrarium DEM; constants mirror tools/build-elevation.mjs) ---
export const ELEV = { data: null, w: 448, h: 414, minX: -7330, maxX: 6230, minZ: -6630, maxZ: 5800 };
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
        if (d < bestD) {
          bestD = d;
          const sl = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) || 1;
          best = {
            x: p[0], z: p[1], ref: s.hw.ref, type: s.hw.type, dist: Math.sqrt(d),
            tx: (s.b[0] - s.a[0]) / sl, tz: (s.b[1] - s.a[1]) / sl, // unit tangent (roadrunners sprint along it)
          };
        }
      }
    }
  }
  return best;
}

// Separate spatial grid over band-highway segments (own index, own function —
// GEO.bandHighways must never share GEO.highways/nearestRoad's index, same
// reason it's a separate array: nothing about band roads may perturb any
// Texas-side draw or lookup).
const bandRoadGrid = new Map();
function buildBandRoadIndex() {
  for (const h of GEO.bandHighways) {
    for (let i = 1; i < h.pts.length; i++) {
      const seg = { a: h.pts[i - 1], b: h.pts[i], hw: h };
      const midX = (seg.a[0] + seg.b[0]) / 2, midZ = (seg.a[1] + seg.b[1]) / 2;
      const k = cellKey(midX, midZ);
      if (!bandRoadGrid.has(k)) bandRoadGrid.set(k, []);
      bandRoadGrid.get(k).push(seg);
    }
  }
}

export function nearestBandRoad(x, z, radius = 300, typeFilter = null) {
  let best = null, bestD = radius * radius;
  const r = Math.ceil(radius / CELL);
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let i = -r; i <= r; i++) {
    for (let j = -r; j <= r; j++) {
      const segs = bandRoadGrid.get(`${cx + i},${cz + j}`);
      if (!segs) continue;
      for (const s of segs) {
        if (typeFilter && !typeFilter(s.hw.type)) continue;
        const p = closestOnSeg(x, z, s.a, s.b);
        const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x: p[0], z: p[1], ref: s.hw.ref, type: s.hw.type, dist: Math.sqrt(d) };
        }
      }
    }
  }
  return best;
}

// Either road network, whichever has something in range. Safe because
// GEO.highways and GEO.bandHighways are geometrically disjoint except right
// at the border seam — a point is never legitimately "near" both.
export function nearestAnyRoad(x, z, radius = 300, typeFilter = null) {
  return nearestRoad(x, z, radius, typeFilter) || nearestBandRoad(x, z, radius, typeFilter);
}

// Separate rail index: tracks are display-only, never eligible for road physics.
// Band rails share this same grid (not a parallel nearestBandRail/nearestAnyRail
// pair like the road network) — the reason band roads need their own index is
// to protect nearestRoad's driving-physics lookups, which doesn't apply to a
// display-only query, so the placard reads across the state line for free.
const railGrid = new Map();
function buildRailIndex() {
  for (const rail of [...GEO.rails, ...GEO.bandRails]) {
    for (let i = 1; i < rail.pts.length; i++) {
      const seg = { a: rail.pts[i - 1], b: rail.pts[i], rail };
      const k = cellKey((seg.a[0] + seg.b[0]) / 2, (seg.a[1] + seg.b[1]) / 2);
      if (!railGrid.has(k)) railGrid.set(k, []);
      railGrid.get(k).push(seg);
    }
  }
}

export function nearestRail(x, z, radius = 300) {
  let best = null, bestD = radius * radius;
  const r = Math.ceil(radius / CELL);
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let i = -r; i <= r; i++) {
    for (let j = -r; j <= r; j++) {
      const segs = railGrid.get(`${cx + i},${cz + j}`);
      if (!segs) continue;
      for (const s of segs) {
        const p = closestOnSeg(x, z, s.a, s.b);
        const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { x: p[0], z: p[1], dist: Math.sqrt(d), operator: s.rail.operator, name: s.rail.name };
        }
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

// Nearest point on any river within `radius` (nearestRoad idiom, riverGrid
// index — a wider-radius sibling of waterAt's tight 1.4u ribbon tolerance,
// for callers that need actual clearance distance, not just "on the water").
export function nearestRiver(x, z, radius = 60) {
  let best = null, bestD = radius * radius;
  const r = Math.ceil(radius / CELL);
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let i = -r; i <= r; i++) {
    for (let j = -r; j <= r; j++) {
      const segs = riverGrid.get(`${cx + i},${cz + j}`);
      if (!segs) continue;
      for (const s of segs) {
        const p = closestOnSeg(x, z, s.a, s.b);
        const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
        if (d < bestD) { bestD = d; best = { x: p[0], z: p[1], name: s.name, dist: Math.sqrt(d) }; }
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

// Parish/county for an out-of-Texas point (HUD flavor line only — never
// counted; the 254-county tally is Texas-only, see countyAt/gameplay.enterCounty).
let lastNeighborCounty = null;
export function neighborCountyAt(x, z) {
  if (lastNeighborCounty && inPoly(x, z, lastNeighborCounty.ring)) return lastNeighborCounty;
  for (const c of GEO.neighborCounties) {
    const [minX, maxX, minZ, maxZ] = c.bbox;
    if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
    if (inPoly(x, z, c.ring)) { lastNeighborCounty = c; return c; }
  }
  return null;
}

// USDA census record for the county at (x,z), or null outside Texas
export function agAt(x, z) {
  const name = countyAt(x, z);
  return name ? (GEO.ag[name] || null) : null;
}

// Energy-track well count/density for the county at (x,z), or null outside
// Texas. Site lists (windFarms/plants/refineries/lines345/substations/
// platforms/fairways) live directly on GEO.energy — no accessor, GEO.cities
// idiom. tools/build-energy.mjs.
export function energyAt(x, z) {
  const name = countyAt(x, z);
  return name ? (GEO.energy.counties[name] || null) : null;
}

// Band counterpart — own bake (tools/build-band-ag.mjs), own file
// (band-agriculture.json), keyed `${state}|${name}` since county names can
// repeat across the four states. Never merged into GEO.ag/agAt: keeps the
// existing 254-county TX assertions untouched.
export function bandAgAt(x, z) {
  const c = neighborCountyAt(x, z);
  return c ? (GEO.bandAg[`${c.state}|${c.name}`] || null) : null;
}

export function nearestCity(x, z) {
  let best = null, bestD = Infinity;
  for (const c of GEO.cities) {
    const d = (c.x - x) ** 2 + (c.z - z) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return { city: best, dist: Math.sqrt(bestD) };
}

// Band-town counterpart to nearestCity — own linear scan over GEO.bandCities,
// same {city, dist} shape (traffic.js mixAt reads both to give real band
// towns city-appropriate traffic instead of always falling into the rural mix).
export function nearestBandCity(x, z) {
  let best = null, bestD = Infinity;
  for (const c of GEO.bandCities) {
    const d = (c.x - x) ** 2 + (c.z - z) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return { city: best, dist: Math.sqrt(bestD) };
}

function inPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// Texas = the mainland ring OR Padre's rings (the island IS Texas — Shoulder
// & Shelf Law #1). Every existing consumer keeps its current meaning for all
// pre-existing land; this only adds new `true` points over Padre.
export function inTexas(x, z) {
  return inPoly(x, z, GEO.border) || GEO.islands.some((ring) => inPoly(x, z, ring));
}

// Padre only — for consumers that must tell island from mainland (sand mesh,
// beach flora): near Port Isabel the island bboxes overlap the mainland shore.
export function onIsland(x, z) {
  return GEO.islands.some((ring) => inPoly(x, z, ring));
}

// Wet sand: within a few units of an island ring's waterline (either shore —
// the whole strand is drivable beach; the dune belt inland of it is not).
// vehicle.js reads this per frame in DRIVE, so the bbox gate must stay first.
const BEACH_W = 6;
export function beachAt(x, z) {
  for (const ring of GEO.islands) {
    const bb = ring.bbox ??= ring.reduce(
      (a, [px, pz]) => ({ minX: Math.min(a.minX, px), maxX: Math.max(a.maxX, px), minZ: Math.min(a.minZ, pz), maxZ: Math.max(a.maxZ, pz) }),
      { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
    if (x < bb.minX - BEACH_W || x > bb.maxX + BEACH_W || z < bb.minZ - BEACH_W || z > bb.maxZ + BEACH_W) continue;
    if (nearestDist(x, z, ring) < BEACH_W) return true;
  }
  return false;
}

function nearestDist(x, z, poly) {
  let bestD = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const p = closestOnSeg(x, z, poly[j], poly[i]);
    const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
    if (d < bestD) bestD = d;
  }
  return Math.sqrt(bestD);
}

// Classify an out-of-Texas point by what it's actually standing on — NOT by
// which border stretch is nearest (near El Paso the closest Texas border
// segment is the Rio Grande even for points deep in New Mexico, e.g. Las
// Cruces — a nearest-segment classifier would wrongly call that 'mexico').
// 'land' = inside a US neighbor state polygon, OR open water whose nearest
// border stretch is a US-neighbor line (the Sabine mouth — shoulder water,
// not Mexico); 'coast' = Gulf (nearest border stretch is coastal, or Gulf
// water north of the Rio Grande mouth's due-east maritime boundary);
// 'mexico' = everything else (fail-safe: no dilation).
let rgMouth = null; // the Rio Grande mouth: east-most 'mexico'-labeled border vertex
function classify(x, z) {
  if (GEO.neighborStates && Object.values(GEO.neighborStates).some((ring) => inPoly(x, z, ring))) return 'land';
  let bestD = Infinity, bestI = 0;
  const poly = GEO.border;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const p = closestOnSeg(x, z, poly[j], poly[i]);
    const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
    if (d < bestD) { bestD = d; bestI = i; }
  }
  const lab = GEO.borderZones[bestI];
  if (lab === 'coast') return 'coast';
  if (lab === 'land') return 'land';
  if (!rgMouth) {
    rgMouth = [-Infinity, 0];
    for (let i = 0; i < poly.length; i++)
      if (GEO.borderZones[i] === 'mexico' && poly[i][0] > rgMouth[0]) rgMouth = poly[i];
  }
  // the US–Mexico maritime boundary runs due east from the river mouth: Gulf
  // water north of that line is shelf; south/west of it Mexico stays out
  return x > rgMouth[0] && z < rgMouth[1] ? 'coast' : 'mexico';
}

// Shoulder & Shelf: the roamable world, distinct from `inTexas` (Law #1 — the
// wall relocates out here, Texas-ness never changes). 25mi (402u) past the
// border on US-neighbor land, ~70mi (1127u) past it on the Gulf; Mexico gets
// no dilation at all (settled as out — the wall stays at the Rio Grande).
export const SHOULDER_U = 402, SHELF_U = 1127;
export function inWorld(x, z) {
  if (inTexas(x, z)) return true;
  const zone = classify(x, z);
  if (zone === 'mexico') return false;
  return nearestDist(x, z, GEO.border) <= (zone === 'coast' ? SHELF_U : SHOULDER_U);
}

// The Tidelands line: Texas uniquely kept 3 marine leagues (10.36 mi) of Gulf
// when it joined the Union — state water reaches 166.7u offshore, then the
// federal shelf. Distance is to the nearest Texas COAST — the coastal border
// stretch plus the island rings (off Padre the line runs 166.7u from the
// island beach, not the Laguna Madre mainland). Shared by inStateWater, the
// gulf's blue-water vertex band (world.js) and the big-map dashed line (hud.js).
export const TIDELANDS_U = 166.7;
let coastSegs = null; // lazy: GEO data isn't loaded when the module evals
export function coastDist(x, z) {
  if (!coastSegs) {
    coastSegs = [];
    const B = GEO.border, zones = GEO.borderZones ?? [];
    for (let i = 0, j = B.length - 1; i < B.length; j = i++)
      if (zones[i] === 'coast' && zones[j] === 'coast') coastSegs.push([B[j], B[i]]);
    for (const ring of GEO.islands)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) coastSegs.push([ring[j], ring[i]]);
  }
  let best = Infinity;
  for (const [a, b] of coastSegs) {
    const p = closestOnSeg(x, z, a, b);
    const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}
export function inStateWater(x, z) {
  if (inTexas(x, z)) return false;
  return classify(x, z) === 'coast' && coastDist(x, z) <= TIDELANDS_U;
}

// What kind of out-of-Texas point this is — 'land'/'coast'/'mexico'.
export function borderZoneAt(x, z) {
  return classify(x, z);
}

// Navigable water for BOAT (Water Vehicles W1) — {kind:'gulf'|'lake', y} or
// null. Gulf legality is the zone classifier, NOT depth: hAt clamps at the
// DEM edge and never returns negative (the -4 offshore dip is mesh-only), so
// "over gulf water" = outside Texas ∧ classify 'coast' ∧ inside the shelf.
// The Laguna Madre sits outside both the mainland and island rings, so it
// qualifies for free; wet sand (beachAt) is shore, not water. Lakes:
// bbox-gated polygon test at the baked per-lake level (loadGeo).
export function boatableAt(x, z) {
  for (const lake of GEO.lakes) {
    const bb = lake.bbox ??= lake.pts.reduce(
      (a, [px, pz]) => ({ minX: Math.min(a.minX, px), maxX: Math.max(a.maxX, px), minZ: Math.min(a.minZ, pz), maxZ: Math.max(a.maxZ, pz) }),
      { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
    if (x < bb.minX || x > bb.maxX || z < bb.minZ || z > bb.maxZ) continue;
    if (inPoly(x, z, lake.pts)) return { kind: 'lake', y: lake.level };
  }
  if (inTexas(x, z) || beachAt(x, z)) return null; // land or wet-sand shore (islands are inTexas)
  if (classify(x, z) !== 'coast') return null;
  if (nearestDist(x, z, GEO.border) > SHELF_U) return null; // past the shelf wall
  return { kind: 'gulf', y: SEA_Y };
}

// The Band Parity "in-band land test": Texas OR standing inside one of the
// four neighbor states — land only, unlike inWorld (which also covers Gulf
// shelf water). Placement systems (crops, farmsteads, chapels) use this in
// place of a bare inTexas check to become band-eligible.
export function inTexasOrBand(x, z) {
  return inTexas(x, z) || neighborStateAt(x, z) !== null;
}

// Distance from a point to a neighbor state's ring ('LA'/'AR'/'OK'/'NM'), 0
// inside it, Infinity if that ring isn't loaded. W7's chatter engine gates its
// west-only lines on this: a template is factual by construction, so a line
// about routing around Roswell may only become eligible where New Mexico is
// genuinely next door — measured off the real ring, never a longitude guess
// (the 103°W line only bounds Texas north of 32°N; El Paso sits far west of it).
export function neighborDist(key, x, z) {
  const ring = GEO.neighborStates?.[key];
  if (!ring) return Infinity;
  return inPoly(x, z, ring) ? 0 : nearestDist(x, z, ring);
}

// Which neighbor state a point stands in ('LA'/'AR'/'OK'/'NM'), null outside
// all four (Texas, Mexico, Gulf). Ring bboxes are lazy-built once — the W3
// terrain painter asks this for every out-of-Texas DEM cell at boot.
let nsBBox = null;
export function neighborStateAt(x, z) {
  const ns = GEO.neighborStates;
  if (!ns) return null;
  if (!nsBBox) {
    nsBBox = {};
    for (const k in ns) {
      const b = [Infinity, -Infinity, Infinity, -Infinity];
      for (const [px, pz] of ns[k]) {
        if (px < b[0]) b[0] = px; if (px > b[1]) b[1] = px;
        if (pz < b[2]) b[2] = pz; if (pz > b[3]) b[3] = pz;
      }
      nsBBox[k] = b;
    }
  }
  for (const k in ns) {
    const b = nsBBox[k];
    if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) continue;
    if (inPoly(x, z, ns[k])) return k;
  }
  return null;
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
