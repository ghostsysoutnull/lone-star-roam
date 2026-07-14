// Static world: Texas-shaped ground, gulf, highway ribbons, regional scenery chunks.
import * as THREE from 'three';
import { GEO, seededRand, inTexas, nearestRoad, nearestCity, hAt, outsideAt, ELEV, agAt } from './geo.js';
import { ATMOS } from './sky.js';
import { cityRadius } from './cities.js';
import { airportClear } from './airports.js';
import { brandNear } from './brands.js';

export function buildWorld(scene) {
  buildGround(scene);
  buildWater(scene);
  buildHighways(scene);
  if (!ELEV.data) buildMountains(scene); // decorative cones only when no real terrain
  return new ScenerySystem(scene);
}

function buildGround(scene) {
  // "Rest of the world" plane, faded — backup beyond the elevation grid
  const outside = new THREE.Mesh(
    new THREE.PlaneGeometry(60000, 60000),
    new THREE.MeshLambertMaterial({ color: 0xb8a888 })
  );
  outside.rotation.x = -Math.PI / 2;
  outside.position.y = -5; // well below ground — near-coplanar giant planes z-fight at this world scale
  scene.add(outside);

  // Gulf of Mexico — big water plane hugging the SE coast
  const gulf = new THREE.Mesh(
    new THREE.PlaneGeometry(14000, 9000),
    new THREE.MeshLambertMaterial({ color: 0x2e6f9e })
  );
  gulf.rotation.x = -Math.PI / 2;
  gulf.rotation.z = -0.62; // align with coastline (runs SW–NE)
  // centered offshore of the real coast; between outside plane and ground
  gulf.position.set(6500, -2.5, 5800);
  scene.add(gulf);

  buildTerrain(scene);

  buildCountyLines(scene);
  buildBorderLine(scene);
}

// Real elevation terrain — one displaced grid, vertex-colored by height/region
function buildTerrain(scene) {
  const e = ELEV;
  if (!e.data) { // no elevation data: fall back to the flat polygon
    const shape = new THREE.Shape();
    GEO.border.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
    const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x9aa568 })));
    return;
  }
  const W = e.w, H = e.h;
  const pos = new Float32Array(W * H * 3);
  const col = new Float32Array(W * H * 3);
  const cLow = new THREE.Color(0x9aa568), cMid = new THREE.Color(0xa89a62), cHigh = new THREE.Color(0x8a6f52);
  const cDry = new THREE.Color(0xc2a76b), cPine = new THREE.Color(0x5f8a4a), cOut = new THREE.Color(0xb8a888);
  const c = new THREE.Color();
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = e.minX + ((e.maxX - e.minX) * i) / (W - 1);
      const z = e.minZ + ((e.maxZ - e.minZ) * j) / (H - 1);
      const raw = e.data[j * W + i];
      const m = raw & 0x7fff;
      const out = !!(raw & 0x8000);
      let y = m * 0.025;
      if (out && m <= 2) y = -4; // offshore: dip *below* the gulf water plane (-2.5)
      const k = (j * W + i) * 3;
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      // color: height ramp, then region/outside tint
      const t = Math.min(1, m / 2200);
      if (t < 0.35) c.lerpColors(cLow, cMid, t / 0.35);
      else c.lerpColors(cMid, cHigh, (t - 0.35) / 0.65);
      if (x < -2200) c.lerp(cDry, 0.5);          // Trans-Pecos / far west
      else if (x > 3400 && m < 200) c.lerp(cPine, 0.45); // piney east lowlands
      if (out) c.lerp(cOut, 0.75);
      col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
    }
  }
  const idx = [];
  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      const a = j * W + i;
      idx.push(a, a + W, a + 1, a + 1, a + W, a + W + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })));
}

function buildCountyLines(scene) {
  // County lines — faint ground lines you cross on the highway
  if (GEO.counties?.length) {
    const pos = [];
    for (const c of GEO.counties) {
      for (const ring of c.rings) {
        for (let i = 0; i < ring.length; i++) {
          // subdivide + drape over the terrain
          const a = ring[i], b = ring[(i + 1) % ring.length];
          for (const [p, q] of subdivide(a, b, 25)) {
            pos.push(p[0], hAt(p[0], p[1]) + 0.2, p[1], q[0], hAt(q[0], q[1]) + 0.2, q[1]);
          }
        }
      }
    }
    const seg = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)),
      new THREE.LineBasicMaterial({ color: 0x77775e, transparent: true, opacity: 0.35 })
    );
    scene.add(seg);
  }
}

function buildBorderLine(scene) {
  // Border outline — subtle dark ridge so the state edge reads from the air
  const borderPts = [];
  const b = GEO.border;
  for (let i = 0; i < b.length; i++) {
    for (const [p] of subdivide(b[i], b[(i + 1) % b.length], 25)) {
      borderPts.push(new THREE.Vector3(p[0], hAt(p[0], p[1]) + 0.45, p[1]));
    }
  }
  borderPts.push(borderPts[0].clone());
  scene.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(borderPts),
    new THREE.LineBasicMaterial({ color: 0x5c5138 })
  ));
}

// split segment a->b into steps of at most `maxLen`, yielding [p,q] pairs
function* subdivide(a, b, maxLen) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(L / maxLen));
  for (let k = 0; k < n; k++) {
    const p = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
    const q = [a[0] + ((b[0] - a[0]) * (k + 1)) / n, a[1] + ((b[1] - a[1]) * (k + 1)) / n];
    yield [p, q];
  }
}

// Ribbon mesh draped over the terrain (roads, rivers). `yOff` keeps tier layering.
function buildRibbons(scene, polylines, width, color, yOff) {
  const pos = [], idx = [];
  for (const rawPts of polylines) {
    // subdivide long segments so ribbons follow the terrain between data points
    const pts = [rawPts[0]];
    for (let i = 1; i < rawPts.length; i++) {
      for (const [, q] of subdivide(rawPts[i - 1], rawPts[i], 12)) pts.push(q);
    }
    const start = pos.length / 3;
    for (let i = 0; i < pts.length; i++) {
      // direction = average of adjacent segments
      const p = pts[i];
      const pPrev = pts[Math.max(0, i - 1)], pNext = pts[Math.min(pts.length - 1, i + 1)];
      let dx = pNext[0] - pPrev[0], dz = pNext[1] - pPrev[1];
      const L = Math.hypot(dx, dz) || 1;
      dx /= L; dz /= L;
      const nx = -dz * width / 2, nz = dx * width / 2; // left normal
      const y = hAt(p[0], p[1]) + yOff;
      pos.push(p[0] + nx, y, p[1] + nz, p[0] - nx, y, p[1] - nz);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = start + i * 2;
      // wound counter-clockwise viewed from +y so normals face up (front side)
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color })));
}

// Highways — real OSM geometry, one merged mesh per tier
function buildHighways(scene) {
  const ofType = (t) => GEO.highways.filter((h) => h.type === t).map((h) => h.pts);
  buildRibbons(scene, ofType('motorway'), 3.2, 0x33333c, 0.12); // interstates — wide dark asphalt
  buildRibbons(scene, ofType('trunk'), 2.0, 0x4a4843, 0.1);     // US highways — narrower
  buildRibbons(scene, ofType('primary'), 1.5, 0x5c584e, 0.09);  // state highways / FM connectors
  buildRibbons(scene, ofType('street'), 1.1, 0x565460, 0.14);   // real metro arterials — above city street quads
  // center stripes on interstates so roads read clearly at driving height
  buildRibbons(scene, ofType('motorway'), 0.25, 0xd8c860, 0.16);
  // rail lines: gravel bed + steel band
  const railPts = GEO.rails.map((r) => r.pts);
  buildRibbons(scene, railPts, 1.5, 0x4a4440, 0.07);
  buildRibbons(scene, railPts, 0.55, 0x8a8a90, 0.11);
}

// Rivers as blue ribbons, lakes as polygons — real geometry
function buildWater(scene) {
  const WATER = 0x2e6f9e;
  const major = /Rio Grande|Red River/;
  buildRibbons(scene, GEO.rivers.filter((r) => major.test(r.name)).map((r) => r.pts), 2.4, WATER, 0.07);
  buildRibbons(scene, GEO.rivers.filter((r) => !major.test(r.name)).map((r) => r.pts), 1.3, WATER, 0.07);
  for (const lake of GEO.lakes) {
    const shape = new THREE.Shape();
    lake.pts.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: WATER }));
    // flat water at the lowest shoreline point (lakes sit in valleys)
    mesh.position.y = Math.min(...lake.pts.map(([x, z]) => hAt(x, z))) + 0.15;
    scene.add(mesh);
  }
}

// Far-west mountain ranges (Guadalupe, Davis, Chisos) — decorative cones
function buildMountains(scene) {
  const ranges = [
    { x: -5600, z: -900, n: 14, s: 1.2, name: 'Guadalupe' }, // near El Paso/NM line
    { x: -4900, z: 700, n: 12, s: 1.0, name: 'Davis' },
    { x: -4300, z: 2600, n: 10, s: 1.1, name: 'Chisos' },    // Big Bend
  ];
  const mat = new THREE.MeshLambertMaterial({ color: 0x8a6f52, flatShading: true });
  const geo = new THREE.ConeGeometry(1, 1, 6);
  const mesh = new THREE.InstancedMesh(geo, mat, ranges.reduce((s, r) => s + r.n, 0));
  const m = new THREE.Matrix4();
  let i = 0;
  for (const r of ranges) {
    const rand = seededRand(r.name);
    for (let k = 0; k < r.n; k++) {
      const x = r.x + (rand() - 0.5) * 520, z = r.z + (rand() - 0.5) * 380;
      if (!inTexas(x, z)) continue;
      const h = (14 + rand() * 26) * r.s, rad = h * (1.5 + rand());
      m.makeScale(rad, h, rad).setPosition(x, h / 2 - 0.5, z);
      mesh.setMatrixAt(i++, m);
    }
  }
  mesh.count = i;
  scene.add(mesh);
}

// --- Chunked scenery: regional flora + props spawned near the player ---
const CHUNK = 260, VIEW_CHUNKS = 3;

// Permian Basin — pumpjack country (around Midland/Odessa, real coords)
const inPermian = (x, z) => x > -3100 && x < -1800 && z > -1700 && z < -400;
// High plains / Panhandle — windmill + hay country
const inPlains = (x, z) => z < -2300 && x > -3300 && x < 1600;
// Hill Country — live oaks + bluebonnets
const inHillCountry = (x, z) => x > -900 && x < 1100 && z > -400 && z < 1500;

const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
const leaf = (hex) => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });

// A country chapel + fenced cemetery for the occasional lucky chunk. Pure
// function of the chunk key (its own seed stream — the scenery RNG order is
// untouched), so haunts.js can locate sites without spawning any meshes.
// Sites sit just off a farm road (≥5 units clear — driving caps change within
// 4 of any road) and never inside a town footprint.
export function chapelAt(cx, cz) {
  const midX = cx * CHUNK + CHUNK / 2, midZ = cz * CHUNK + CHUNK / 2;
  let odds = 0.1; // central ranchland / Hill Country
  if (inPermian(midX, midZ) || midX < -2200) odds = 0;      // oil patch & far-west desert
  else if (midX > 3400 || inPlains(midX, midZ)) odds = 0.08; // piney woods, high plains
  else if (midZ > 2600) odds = 0.06;                         // south brush country
  const rand = seededRand(`chapel${cx},${cz}`);
  if (rand() >= odds) return null;
  for (let i = 0; i < 4; i++) { // a few tries for a lawful spot
    const sx = cx * CHUNK + rand() * CHUNK, sz = cz * CHUNK + rand() * CHUNK;
    const road = nearestRoad(sx, sz, 25);
    if (!road || road.dist < 0.5) continue;
    const away = 7 + rand() * 2; // set back from the shoulder
    const x = road.x + ((sx - road.x) / road.dist) * away;
    const z = road.z + ((sz - road.z) / road.dist) * away;
    if (!inTexas(x, z) || !airportClear(x, z)) continue;
    const near = nearestRoad(x, z, 6); // a second road may pass closer than the one we anchored to
    if (near && near.dist < 5) continue;
    const { city, dist } = nearestCity(x, z);
    if (city && dist < cityRadius(city.pop) + 20) continue;
    const rot = Math.atan2(-(road.x - x), -(road.z - z)); // door faces the road
    // the cemetery sits beside the chapel, along the road — pick the clear side
    for (const side of [1, -1]) {
      const cemX = x + Math.cos(rot) * 7 * side, cemZ = z - Math.sin(rot) * 7 * side;
      if (inTexas(cemX, cemZ) && !nearestRoad(cemX, cemZ, 5)) return { x, z, rot, cemX, cemZ, key: `${cx},${cz}` };
    }
  }
  return null;
}

// every chapel/cemetery site within `range` chunks of a point — for haunts.js
export function chapelSitesNear(px, pz, range = 2) {
  const cx = Math.floor(px / CHUNK), cz = Math.floor(pz / CHUNK);
  const out = [];
  for (let i = -range; i <= range; i++)
    for (let j = -range; j <= range; j++) {
      const s = chapelAt(cx + i, cz + j);
      if (s) out.push(s);
    }
  return out;
}

// --- Agriculture: census-painted working land (crops + farmsteads) ---
// Ground styles per county-dominant crop (agAt's statewide-share pick —
// consumed as-is, never re-derived). `row` drives the near-ground instanced
// read: cotton puffs, grain stalks, wheat tufts, orchard rows.
const CROP_STYLE = {
  cotton:    { ground: 0x9fa878, row: { kind: 'puff', color: 0xeae6da } },
  rice:      { ground: 0x41704d, row: null }, // flooded paddies read flat and dark
  sorghum:   { ground: 0xa5673c, row: { kind: 'stalk', color: 0x8f5530, h: 0.6 } },
  corn:      { ground: 0x5e7f3d, row: { kind: 'stalk', color: 0x4c7433, h: 0.85 } },
  wheat:     { ground: 0xc7a44e, row: { kind: 'tuft', color: 0xd6b258 } },
  hay:       { ground: 0x99a057, row: null }, // gets extra bales instead
  peanuts:   { ground: 0x6e7f48, row: { kind: 'tuft', color: 0x53703a } },
  citrus:    { ground: 0x8a7a55, row: { kind: 'tree', color: 0x2f6b36 } },
  pecans:    { ground: 0x857550, row: { kind: 'tree', color: 0x49682f } },
  sugarcane: { ground: 0x4f8a3e, row: { kind: 'stalk', color: 0x55a041, h: 1.15 } },
};
const PIVOT_GREEN = 0x4f7c37; // the classic irrigated circle, whatever the crop

// Shared cached materials for ag content (disposeGroup only disposes geometry,
// so cache hits are safe across chunk churn).
const matCache = new Map();
function lamb(hex) {
  let m = matCache.get(hex);
  if (!m) matCache.set(hex, (m = new THREE.MeshLambertMaterial({ color: hex, flatShading: true })));
  return m;
}

// A field decal: subdivided quad vertex-draped to hAt and raised off the
// terrain (rivers sit at +0.07 — fields ride above both). `round` pulls
// outside-the-rim grid points onto the rim, so one drape serves pivots too.
function mkFieldPatch(fx, fz, w, d, rot, color, round, raise) {
  const segX = Math.max(2, Math.ceil(w / 3)), segZ = Math.max(2, Math.ceil(d / 3));
  const pos = [], idx = [];
  const cr = Math.cos(rot), sr = Math.sin(rot);
  for (let j = 0; j <= segZ; j++)
    for (let i = 0; i <= segX; i++) {
      let lx = (i / segX - 0.5) * w, lz = (j / segZ - 0.5) * d;
      if (round) {
        const r = Math.hypot(lx / (w / 2), lz / (d / 2));
        if (r > 1) { lx /= r; lz /= r; }
      }
      const x = fx + lx * cr + lz * sr, z = fz - lx * sr + lz * cr;
      pos.push(x, hAt(x, z) + raise, z);
    }
  for (let j = 0; j < segZ; j++)
    for (let i = 0; i < segX; i++) {
      const a = j * (segX + 1) + i;
      idx.push(a, a + segX + 1, a + 1, a + 1, a + segX + 1, a + segX + 2);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, lamb(color));
}

// Near-ground crop rows: one InstancedMesh per patch (geometry is per-chunk,
// so disposeGroup stays safe). Element style comes from CROP_STYLE.row.
function mkCropRows(rand, fx, fz, w, d, rot, row) {
  const spacing = row.kind === 'tree' ? 2.4 : 1.4, step = row.kind === 'tree' ? 2.4 : 1.1;
  const rows = Math.max(1, Math.floor(d / spacing) - 1);
  const per = Math.max(2, Math.floor(w / step) - 1);
  const count = Math.min(240, rows * per);
  let geo, y0;
  if (row.kind === 'puff') { geo = new THREE.IcosahedronGeometry(0.09, 0); y0 = 0.14; }
  else if (row.kind === 'tuft') { geo = new THREE.ConeGeometry(0.1, 0.34, 4); y0 = 0.17; }
  else if (row.kind === 'tree') { geo = new THREE.IcosahedronGeometry(0.42, 0); y0 = 0.38; }
  else { geo = new THREE.BoxGeometry(0.07, row.h, 0.07); y0 = row.h / 2; }
  const inst = new THREE.InstancedMesh(geo, lamb(row.color), count);
  const m4 = new THREE.Matrix4();
  const cr = Math.cos(rot), sr = Math.sin(rot);
  let n = 0;
  for (let r = 0; r < rows && n < count; r++) {
    const lz = ((r + 1) / (rows + 1) - 0.5) * d;
    for (let i = 0; i < per && n < count; i++) {
      const lx = ((i + 1) / (per + 1) - 0.5) * w + (rand() - 0.5) * 0.2;
      const x = fx + lx * cr + lz * sr, z = fz - lx * sr + lz * cr;
      const s = 0.8 + rand() * 0.45;
      m4.makeScale(s, s, s).setPosition(x, hAt(x, z) + y0 * s, z);
      inst.setMatrixAt(n++, m4);
    }
  }
  inst.count = n;
  return inst;
}

// A working farmstead for ag-country chunks — the chapelAt pattern: a pure
// function of the chunk key on its own seed stream, so animals.js (wave 3)
// can cluster herds at the same sites without any cross-module spawn coupling.
// Odds come straight from the county census, so the Panhandle runs thick with
// them and the Trans-Pecos sits nearly empty — no hand-tuned region boxes.
export function farmsteadAt(cx, cz) {
  const midX = cx * CHUNK + CHUNK / 2, midZ = cz * CHUNK + CHUNK / 2;
  const ag = agAt(midX, midZ);
  if (!ag) return null;
  const herd = (ag.cattle + 2 * ag.horses + ag.goats + ag.sheep) / ag.areaKm2; // head/km²
  const crop = Object.values(ag.crops).reduce((a, b) => a + b, 0) / ag.areaKm2; // acres/km²
  const odds = Math.min(0.35, herd / 80 + crop / 160);
  const rand = seededRand(`farm${cx},${cz}`);
  if (rand() >= odds) return null;
  for (let i = 0; i < 4; i++) { // a few tries for a lawful spot
    const sx = cx * CHUNK + rand() * CHUNK, sz = cz * CHUNK + rand() * CHUNK;
    const road = nearestRoad(sx, sz, 25);
    if (!road || road.dist < 0.5) continue;
    const away = 8 + rand() * 3; // gate up by the road, buildings set back
    const x = road.x + ((sx - road.x) / road.dist) * away;
    const z = road.z + ((sz - road.z) / road.dist) * away;
    if (!inTexas(x, z) || !airportClear(x, z) || brandNear(x, z, 30)) continue;
    const near = nearestRoad(x, z, 6); // a second road may pass closer than the anchor
    if (near && near.dist < 5) continue;
    const { city, dist } = nearestCity(x, z);
    if (city && dist < cityRadius(city.pop) + 20) continue;
    const ch = chapelAt(cx, cz); // don't crowd the chunk's chapel plot
    if (ch && Math.hypot(ch.x - x, ch.z - z) < 15) continue;
    const rot = Math.atan2(-(road.x - x), -(road.z - z)); // house faces its road
    const silos = crop > 10 ? 1 + ((rand() * 3) | 0) : 0; // grain country gets silos
    return { x, z, rot, silos, key: `${cx},${cz}` };
  }
  return null;
}

class ScenerySystem {
  constructor(scene) {
    this.scene = scene;
    this.live = new Map(); // "cx,cz" -> THREE.Group
    this.t = 0;
    this.animated = []; // {obj, kind, phase} — pumpjack arms, windmill fans
  }

  update(dt, px, pz) {
    const cx = Math.floor(px / CHUNK), cz = Math.floor(pz / CHUNK);
    const want = new Set();
    for (let i = -VIEW_CHUNKS; i <= VIEW_CHUNKS; i++)
      for (let j = -VIEW_CHUNKS; j <= VIEW_CHUNKS; j++) want.add(`${cx + i},${cz + j}`);
    for (const [k, g] of this.live) {
      if (want.has(k)) continue;
      this.scene.remove(g);
      disposeGroup(g);
      this.animated = this.animated.filter((a) => !g.userData.animated.includes(a));
      this.live.delete(k);
    }
    for (const k of want) if (!this.live.has(k)) this.spawn(k);

    // animate pumpjacks (nodding), windmills (spinning), chickens (pecking)
    this.t += dt;
    for (const a of this.animated) {
      if (a.kind === 'pumpjack') a.obj.rotation.x = Math.sin(this.t * 1.4 + a.phase) * 0.22; // beam nods across its x pivot
      else if (a.kind === 'chicken') a.obj.rotation.x = -Math.max(0, Math.sin(this.t * 2.6 + a.phase)) * 0.5; // beak-to-dirt peck bursts
      else a.obj.rotation.z += dt * (1.6 + a.phase * 0.1) * ATMOS.wind; // windmills spin up when weather turns
    }
  }

  spawn(key) {
    const [cx, cz] = key.split(',').map(Number);
    const rand = seededRand('scenery' + key);
    const group = new THREE.Group();
    group.userData.animated = [];
    const baseX = cx * CHUNK, baseZ = cz * CHUNK;
    const midX = baseX + CHUNK / 2, midZ = baseZ + CHUNK / 2;

    // regional spawn table: [maker, count]
    const table = [];
    if (inPermian(midX, midZ)) {
      table.push([mkPumpjack, 5], [mkYucca, 3], [mkRock, 2], [mkMesquite, 2]);
    } else if (midX < -2200) { // far west desert
      table.push([mkCactus, 4], [mkYucca, 4], [mkRock, 4], [mkMesquite, 2]);
    } else if (midX > 3400) { // east piney woods
      table.push([mkPine, 11], [mkLiveOak, 4], [mkRock, 1]);
    } else if (midZ > 2600) { // south brush country
      table.push([mkMesquite, 6], [mkBrush, 4], [mkCactus, 1], [mkRock, 1]);
    } else if (inPlains(midX, midZ)) {
      table.push([mkBrush, 4], [mkWindmill, 2], [mkHayBale, 3], [mkMesquite, 2]);
    } else if (inHillCountry(midX, midZ)) {
      table.push([mkLiveOak, 7], [mkRock, 3], [mkBluebonnets, 3], [mkHayBale, 1]);
    } else { // central ranchland
      table.push([mkLiveOak, 5], [mkMesquite, 3], [mkHayBale, 2], [mkBrush, 2]);
    }

    for (const [maker, count] of table) {
      for (let i = 0; i < count; i++) {
        let x = baseX + rand() * CHUNK, z = baseZ + rand() * CHUNK;
        if (!inTexas(x, z)) continue;
        // bluebonnets grow along roads; everything else stays off them
        const road = nearestRoad(x, z, 8);
        if (maker === mkBluebonnets) {
          if (!road) continue;
          const away = Math.max(3.5, road.dist); // just off the shoulder
          x = road.x + ((x - road.x) / (road.dist || 1)) * away;
          z = road.z + ((z - road.z) / (road.dist || 1)) * away;
        } else if (road && road.dist < 3) continue;
        if (!airportClear(x, z)) continue; // fields keep their footprints bare
        const obj = maker(rand);
        const s = 0.75 + rand() * 0.6;
        obj.scale.setScalar(s);
        obj.position.set(x, hAt(x, z), z);
        obj.rotation.y = rand() * Math.PI * 2;
        group.add(obj);
        if (obj.userData.animate) {
          const entry = { obj: obj.userData.animate, kind: obj.userData.kind, phase: rand() * Math.PI * 2 };
          this.animated.push(entry);
          group.userData.animated.push(entry);
        }
      }
    }

    // the occasional country chapel + cemetery (site is chunk-seeded — chapelAt)
    const site = chapelAt(cx, cz);
    if (site) {
      const chapel = mkChapel();
      chapel.scale.setScalar(1.5); // mini-world church, not a shed
      chapel.position.set(site.x, hAt(site.x, site.z), site.z);
      chapel.rotation.y = site.rot;
      const cem = mkCemetery(rand);
      cem.position.set(site.cemX, hAt(site.cemX, site.cemZ), site.cemZ);
      cem.rotation.y = site.rot;
      const oak = mkLiveOak(rand); // a shade tree between them
      oak.position.set((site.x + site.cemX) / 2, hAt(site.x, site.z), (site.z + site.cemZ) / 2 + 4);
      group.add(chapel, cem, oak);
    }

    // census-painted working land: crop decals + pivots + the odd farmstead.
    // Own seed streams — the pre-ag scenery stream above stays untouched, so
    // the existing world is byte-identical. agAt sampled at chunk center
    // (county polygons dwarf 260-unit chunks; straddle error is invisible).
    const ag = agAt(midX, midZ);
    if (ag) {
      const crand = seededRand('crops' + key);
      const cropAcres = Object.values(ag.crops).reduce((a, b) => a + b, 0);
      const style = CROP_STYLE[ag.dominantCrop];
      const fields = style ? Math.min(8, (cropAcres / ag.areaKm2 / 6) | 0) : 0;
      // rice country floods levee paddies, not pivots — the dark decals do the read
      const pivots = ag.dominantCrop === 'rice' ? 0 : Math.min(4, (ag.irrAcres / ag.areaKm2 / 7) | 0);
      let deck = 0; // tiny y stagger — two overlapping coplanar decals would z-fight
      for (let i = 0; i < fields; i++) {
        const fx = baseX + crand() * CHUNK, fz = baseZ + crand() * CHUNK;
        const w = 9 + crand() * 9, d = 7 + crand() * 7, rot = crand() * Math.PI;
        const rowRoll = crand(); // drawn every iteration — placement failures can't shift the stream
        const clear = Math.hypot(w, d) / 2 + 2;
        if (!inTexas(fx, fz) || !airportClear(fx, fz)) continue;
        if (nearestRoad(fx, fz, clear)) continue; // fields never swallow a road
        const { city, dist } = nearestCity(fx, fz);
        if (city && dist < cityRadius(city.pop) + clear) continue;
        const patch = mkFieldPatch(fx, fz, w, d, rot, style.ground, false, 0.12 + deck++ * 0.015);
        patch.userData.crop = ag.dominantCrop;
        group.add(patch);
        if (style.row && rowRoll < 0.45) group.add(mkCropRows(crand, fx, fz, w * 0.9, d * 0.9, rot, style.row));
        else if (ag.dominantCrop === 'hay')
          for (let k = 0, kn = 2 + ((rowRoll * 3) | 0); k < kn; k++) {
            const bale = mkHayBale(crand);
            const bx = fx + (crand() - 0.5) * w * 0.7, bz = fz + (crand() - 0.5) * d * 0.7;
            bale.position.set(bx, hAt(bx, bz), bz);
            group.add(bale);
          }
      }
      for (let i = 0; i < pivots; i++) {
        const fx = baseX + crand() * CHUNK, fz = baseZ + crand() * CHUNK;
        const r = 2 + crand() * 2, armRot = crand() * Math.PI * 2; // 4–8 unit circles ≈ real pivots
        if (!inTexas(fx, fz) || !airportClear(fx, fz)) continue;
        if (nearestRoad(fx, fz, r + 2)) continue;
        const { city, dist } = nearestCity(fx, fz);
        if (city && dist < cityRadius(city.pop) + r + 2) continue;
        const disc = mkFieldPatch(fx, fz, r * 2, r * 2, 0, PIVOT_GREEN, true, 0.12 + deck++ * 0.015);
        disc.userData.pivot = true;
        const armG = new THREE.CylinderGeometry(0.05, 0.05, r * 0.94, 4);
        armG.rotateX(Math.PI / 2).translate(0, 0, -r * 0.47); // spans hub to rim
        const arm = new THREE.Mesh(armG, lamb(0xc4c8cc));
        arm.position.set(fx, hAt(fx, fz) + 0.35, fz);
        arm.rotation.y = armRot;
        group.add(disc, arm);
      }

      const farm = farmsteadAt(cx, cz);
      if (farm) {
        const fr = seededRand('farmprops' + key);
        const fg = new THREE.Group();
        fg.userData.kind = 'farmstead';
        const cr = Math.cos(farm.rot), sr = Math.sin(farm.rot);
        const at = (obj, lx, lz, ry = 0) => { // site frame: -z faces the road
          const x = farm.x + lx * cr + lz * sr, z = farm.z - lx * sr + lz * cr;
          obj.position.set(x, hAt(x, z), z);
          obj.rotation.y = farm.rot + ry;
          fg.add(obj);
        };
        at(mkFarmhouse(), 2.8, 1.5);
        at(mkBarn(), -3.2, 2.5, (fr() - 0.5) * 0.4);
        const wm = mkWindmill(fr);
        at(wm, 5.2, 4.2);
        const entry = { obj: wm.userData.animate, kind: 'windmill', phase: fr() * Math.PI * 2 };
        this.animated.push(entry);
        group.userData.animated.push(entry);
        at(mkStockTank(), 4.0, 4.8);
        at(mkCorral(fr), -3.6, 7.6, fr() * 0.3);
        for (let s = 0; s < farm.silos; s++) at(mkSilo(), -5.4 - s * 1.1, 3.6);
        for (let c = 0, cn = 3 + ((fr() * 3) | 0); c < cn; c++) {
          const hen = mkChicken();
          at(hen, 0.5 + (fr() - 0.5) * 4, 3 + (fr() - 0.5) * 3, fr() * Math.PI * 2);
          const peck = { obj: hen.userData.animate, kind: 'chicken', phase: fr() * Math.PI * 2 };
          this.animated.push(peck);
          group.userData.animated.push(peck);
        }
        group.add(fg);
      }
    }
    this.scene.add(group);
    this.live.set(key, group);
  }
}

// --- Flora makers (each takes the chunk RNG for per-instance variance) ---
const GREENS = [0x55763c, 0x4a6b38, 0x627e40, 0x3f6634, 0x6d8a4a];
const pick = (rand, arr) => arr[(rand() * arr.length) | 0];

function mkLiveOak(rand) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 1.1, 5), trunkMat);
  trunk.position.y = 0.55;
  g.add(trunk);
  // 2-3 canopy blobs, wide and low — the live oak look
  const n = 2 + ((rand() * 2) | 0);
  const mat = leaf(pick(rand, GREENS));
  for (let i = 0; i < n; i++) {
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 + rand() * 0.7, 0), mat);
    blob.position.set((rand() - 0.5) * 1.6, 1.4 + rand() * 0.5, (rand() - 0.5) * 1.6);
    blob.scale.y = 0.6 + rand() * 0.25;
    g.add(blob);
  }
  return g;
}

function mkPine(rand) {
  const g = new THREE.Group();
  const h = 3.6 + rand() * 2.6;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, h * 0.5, 5), trunkMat);
  trunk.position.y = h * 0.25;
  g.add(trunk);
  const mat = leaf(pick(rand, [0x2e5d34, 0x28532e, 0x39683c]));
  const tiers = 2 + ((rand() * 2) | 0);
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.15 * (1 - f * 0.45), h * 0.42, 6), mat);
    cone.position.y = h * (0.42 + f * 0.3);
    g.add(cone);
  }
  return g;
}

function mkMesquite(rand) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.8, 5), trunkMat);
  trunk.position.y = 0.4;
  trunk.rotation.z = (rand() - 0.5) * 0.5; // scraggly lean
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), leaf(0x7d8a52));
  crown.position.y = 1.1;
  crown.scale.set(1.3, 0.45, 1.3); // flat-topped
  g.add(trunk, crown);
  return g;
}

function mkBrush(rand) {
  const g = new THREE.Group();
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7 + rand() * 0.4, 0), leaf(pick(rand, [0x6d7a45, 0x7d8552, 0x5f7040])));
  crown.position.y = 0.5;
  crown.scale.y = 0.7;
  g.add(crown);
  return g;
}

function mkCactus() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x4c7a3d });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 2.4, 6), mat);
  body.position.y = 1.2;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 1.1, 6), mat);
  arm.position.set(0.55, 1.5, 0);
  arm.rotation.z = -0.25;
  g.add(body, arm);
  return g;
}

function mkYucca(rand) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 1 + rand(), 5), trunkMat);
  trunk.position.y = 0.5;
  g.add(trunk);
  const spikes = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), leaf(0x5f7d4a));
  spikes.position.y = 1.2 + rand() * 0.6;
  spikes.scale.y = 1.4; // spiky ball
  g.add(spikes);
  return g;
}

function mkRock(rand) {
  const rock = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.5 + rand() * 0.9, 0),
    new THREE.MeshLambertMaterial({ color: pick(rand, [0x8a8378, 0x9a9288, 0x7a7268]), flatShading: true })
  );
  rock.scale.y = 0.55;
  rock.position.y = 0.2;
  const g = new THREE.Group();
  g.add(rock);
  return g;
}

function mkHayBale(rand) {
  const g = new THREE.Group();
  const bale = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 0.9, 10),
    new THREE.MeshLambertMaterial({ color: 0xc2a95a })
  );
  bale.rotation.x = Math.PI / 2;
  bale.rotation.z = rand() * Math.PI;
  bale.position.y = 0.55;
  g.add(bale);
  return g;
}

function mkBluebonnets(rand) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x3a55c2, emissive: 0x101c50 });
  for (let i = 0; i < 8 + rand() * 8; i++) {
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09 + rand() * 0.07, 0), mat);
    const a = rand() * Math.PI * 2, r = rand() * 1.6;
    f.position.set(Math.cos(a) * r, 0.12, Math.sin(a) * r * 0.7);
    g.add(f);
  }
  return g;
}

function mkWindmill(rand) {
  const g = new THREE.Group();
  const steel = new THREE.MeshLambertMaterial({ color: 0xb8bcc2, flatShading: true });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.28, 4.6, 4), steel);
  tower.position.y = 2.3;
  g.add(tower);
  const fan = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.0, 0.03), steel);
    blade.position.y = 0.55;
    const holder = new THREE.Group();
    holder.rotation.z = (i / 8) * Math.PI * 2;
    holder.add(blade);
    fan.add(holder);
  }
  fan.position.set(0, 4.7, -0.25);
  const vane = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 1.0), steel);
  vane.position.set(0, 4.7, 0.9);
  g.add(fan, vane);
  g.userData.animate = fan;
  g.userData.kind = 'windmill';
  return g;
}

function mkPumpjack(rand) {
  const g = new THREE.Group();
  const steel = new THREE.MeshLambertMaterial({ color: 0x3a3a40, flatShading: true });
  const rust = new THREE.MeshLambertMaterial({ color: 0x8a4a2a, flatShading: true });
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.25, 1.0), steel);
  base.position.y = 0.12;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.9, 0.6), steel);
  post.position.y = 1.05;
  g.add(base, post);
  // walking beam pivots on the post; horse head at the front
  const beam = new THREE.Group();
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.3, 3.2), rust);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.5), rust);
  head.position.set(0, -0.2, -1.7);
  const counter = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 8).rotateZ(Math.PI / 2), steel);
  counter.position.set(0, 0, 1.5);
  beam.add(arm, head, counter);
  beam.position.y = 2.05;
  g.add(beam);
  g.userData.animate = beam;
  g.userData.kind = 'pumpjack';
  return g;
}

// Little white country church: gabled nave, steeple, cross — door on local -z
function mkChapel() {
  const g = new THREE.Group();
  g.userData.kind = 'chapel';
  const white = new THREE.MeshLambertMaterial({ color: 0xf2efe6, flatShading: true });
  const shingle = new THREE.MeshLambertMaterial({ color: 0x5a5450, flatShading: true });
  const nave = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 3.4), white);
  nave.position.y = 0.8;
  // gable roof: a 3-sided prism laid on its side, one edge up — eaves sit just
  // below the wall tops so the white walls stay visible
  const roofG = new THREE.CylinderGeometry(1.35, 1.35, 3.7, 3, 1);
  roofG.rotateX(-Math.PI / 2);
  const roof = new THREE.Mesh(roofG, shingle);
  roof.position.y = 2.15;
  const tower = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.6, 0.6), white);
  tower.position.set(0, 1.8, -1.55); // steeple clears the ridge
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.0, 4), shingle);
  spire.position.set(0, 4.1, -1.55);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.06), white);
  crossV.position.set(0, 4.85, -1.55);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.06), white);
  crossH.position.set(0, 4.95, -1.55);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.08), new THREE.MeshLambertMaterial({ color: 0x4a3828 }));
  door.position.set(0, 0.45, -1.88);
  g.add(nave, roof, tower, spire, crossV, crossH, door);
  return g;
}

// Fenced family cemetery: leaning headstones and the founder's obelisk
function mkCemetery(rand) {
  const g = new THREE.Group();
  g.userData.kind = 'cemetery';
  const iron = new THREE.MeshLambertMaterial({ color: 0x3a3a40 });
  const W = 5.5, D = 4.5;
  // the plot itself — dry-grass ground so the graveyard reads from the road
  const plot = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.8, D + 0.8), new THREE.MeshLambertMaterial({ color: 0x8f8668 }));
  plot.rotation.x = -Math.PI / 2;
  plot.position.y = 0.06;
  g.add(plot);
  for (const [w, d, x, z] of [[W, 0.08, 0, -D / 2], [W, 0.08, 0, D / 2], [0.08, D, -W / 2, 0], [0.08, D, W / 2, 0]]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), iron);
    rail.position.set(x, 0.42, z);
    g.add(rail);
  }
  for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.1), iron);
    post.position.set(x, 0.28, z);
    g.add(post);
  }
  const n = 8 + ((rand() * 9) | 0);
  const stones = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.36, 0.62, 0.1),
    new THREE.MeshLambertMaterial({ color: 0xb8b2a4, flatShading: true }), n);
  const m4 = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion();
  const v = new THREE.Vector3(), s = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const col = i % 4, row = (i / 4) | 0;
    v.set(-1.6 + col * 1.05 + (rand() - 0.5) * 0.3, 0.26, -1.4 + row * 0.95 + (rand() - 0.5) * 0.25);
    e.set((rand() - 0.5) * 0.16, (rand() - 0.5) * 0.2, (rand() - 0.5) * 0.22); // a century of lean
    q.setFromEuler(e);
    s.set(1, 0.7 + rand() * 0.6, 1);
    m4.compose(v, q, s);
    stones.setMatrixAt(i, m4);
  }
  g.add(stones);
  const obelisk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 1.1, 4), new THREE.MeshLambertMaterial({ color: 0xcac4b6, flatShading: true }));
  obelisk.position.set(1.9, 0.55, 1.6);
  g.add(obelisk);
  return g;
}

// --- Farmstead makers (chapel-scale kit; shared cached lamb() materials) ---
function mkBarn() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 3.2), lamb(0x8f2f24));
  body.position.y = 0.7;
  const roofG = new THREE.CylinderGeometry(1.55, 1.55, 3.4, 3, 1); // chapel gable idiom
  roofG.rotateX(-Math.PI / 2);
  const roof = new THREE.Mesh(roofG, lamb(0x6b6560));
  roof.position.y = 2.05;
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.1, 0.08), lamb(0xf2efe6));
  door.position.set(0, 0.55, -1.62);
  const loft = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.08), lamb(0xf2efe6));
  loft.position.set(0, 1.5, -1.62);
  g.add(body, roof, door, loft);
  return g;
}

function mkFarmhouse() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 1.7), lamb(0xf2efe6));
  body.position.y = 0.5;
  const roofG = new THREE.CylinderGeometry(0.85, 0.85, 1.9, 3, 1);
  roofG.rotateX(-Math.PI / 2);
  const roof = new THREE.Mesh(roofG, lamb(0x5a5450));
  roof.position.y = 1.32;
  const porch = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.55), lamb(0x9a8a72));
  porch.position.set(0, 0.88, -1.1);
  g.add(body, roof, porch);
  for (const px of [-0.45, 0.45]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.85, 0.06), lamb(0xf2efe6));
    post.position.set(px, 0.45, -1.3);
    g.add(post);
  }
  return g;
}

function mkStockTank() {
  const g = new THREE.Group();
  const ringG = new THREE.CylinderGeometry(0.95, 0.95, 0.32, 12, 1, true);
  const ring = new THREE.Mesh(ringG, new THREE.MeshLambertMaterial({ color: 0xb0b4ba, side: THREE.DoubleSide, flatShading: true }));
  ring.position.y = 0.16;
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.9, 12), lamb(0x4a7d92));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.26;
  g.add(ring, water);
  return g;
}

function mkCorral(rand) {
  const g = new THREE.Group();
  const wood = lamb(0x77593a);
  const W = 4.2;
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.5, 0.09), wood, 12);
  const m4 = new THREE.Matrix4();
  let n = 0;
  for (let s = 0; s < 4; s++) // 3 posts per side, corners shared
    for (let i = 0; i < 3; i++) {
      const f = i / 3 - 0.5;
      const [x, z] = s === 0 ? [f * W, -W / 2] : s === 1 ? [W / 2, f * W] : s === 2 ? [-f * W, W / 2] : [-W / 2, -f * W];
      m4.makeRotationY((rand() - 0.5) * 0.15).setPosition(x, 0.25, z);
      posts.setMatrixAt(n++, m4);
    }
  g.add(posts);
  for (const y of [0.22, 0.42])
    for (const [w, d, x, z] of [[W, 0.06, 0, -W / 2], [W, 0.06, 0, W / 2], [0.06, W, -W / 2, 0], [0.06, W, W / 2, 0]]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), wood);
      rail.position.set(x, y, z);
      g.add(rail);
    }
  return g;
}

function mkSilo() {
  const g = new THREE.Group();
  const steel = lamb(0xc4c8cc);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 2.6, 10), steel);
  tube.position.y = 1.3;
  const dome = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.5, 10), steel);
  dome.position.y = 2.85;
  g.add(tube, dome);
  return g;
}

// A pecking hen: the bird pivots at ground level so the animated tip-forward
// reads as a beak-to-dirt peck (kind 'chicken' in the scenery animate loop).
function mkChicken() {
  const g = new THREE.Group();
  const bird = new THREE.Group();
  const white = lamb(0xf0ede4);
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), white);
  body.position.y = 0.16;
  body.scale.set(1, 0.85, 1.25);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), white);
  head.position.set(0, 0.3, -0.14);
  const comb = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.06), lamb(0xb42c22));
  comb.position.set(0, 0.36, -0.14);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 4), lamb(0xd08a2e));
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, 0.29, -0.21);
  bird.add(body, head, comb, beak);
  g.add(bird);
  g.userData.animate = bird;
  g.userData.kind = 'chicken';
  return g;
}

function disposeGroup(g) {
  g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
}
