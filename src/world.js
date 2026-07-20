// Static world: Texas-shaped ground, gulf, highway ribbons, regional scenery chunks.
import * as THREE from 'three';
import { GEO, seededRand, inTexas, onIsland, nearestRoad, nearestCity, hAt, outsideAt, ELEV, agAt, bandAgAt, TIDELANDS_U, coastDist, neighborStateAt, inTexasOrBand, nearestAnyRoad, nearestRiver, energyAt, SEA_Y } from './geo.js';
import { ATMOS } from './sky.js';
import { cityRadius, cityClear } from './cities.js';
import { airportClear } from './airports.js';
import { brandNear } from './brands.js';

export function buildWorld(scene) {
  buildGround(scene);
  buildWater(scene);
  buildHighways(scene);
  buildBandHighways(scene);
  buildBandRails(scene);
  if (!ELEV.data) buildMountains(scene); // decorative cones only when no real terrain
  const sys = new ScenerySystem(scene);
  if (ELEV.data) sys.massif = buildGuadalupes(scene); // hero ridge over the smoothed DEM
  return sys;
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

  // Gulf of Mexico — big water plane hugging the SE coast. Vertex-colored on
  // the ONE mesh: state water (inside the 166.7u Tidelands line) keeps the
  // old teal, the federal shelf beyond blends to deep blue — a second
  // near-coplanar giant plane would z-fight at this world scale.
  const gulfGeom = new THREE.PlaneGeometry(14000, 9000, 140, 90);
  const gulf = new THREE.Mesh(
    gulfGeom,
    new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, transparent: true })
  );
  gulf.rotation.x = -Math.PI / 2;
  gulf.rotation.z = -0.62; // align with coastline (runs SW–NE)
  // centered offshore of the real coast; between outside plane and ground
  gulf.position.set(6500, SEA_Y, 5800);
  gulf.name = 'gulf';
  gulf.updateMatrixWorld();
  // one boot-time pass over ~13k verts against geo.js's shared coast field.
  // RGBA: alpha fades the plane out where it pokes past the DEM rectangle —
  // beyond it there is no -4 seafloor dip, so open water would float over the
  // outside plane with nothing under it ("ocean after dry land" bug).
  const stateWater = new THREE.Color(0x2e6f9e), blueWater = new THREE.Color(0x1c4a74);
  const gp = gulfGeom.attributes.position, gc = new Float32Array(gp.count * 4);
  const gv = new THREE.Vector3(), col = new THREE.Color();
  for (let i = 0; i < gp.count; i++) {
    gv.fromBufferAttribute(gp, i).applyMatrix4(gulf.matrixWorld);
    col.copy(stateWater).lerp(blueWater, Math.max(0, Math.min(1, (coastDist(gv.x, gv.z) - TIDELANDS_U) / 30)));
    const over = Math.max(gv.x - ELEV.maxX, ELEV.minX - gv.x, gv.z - ELEV.maxZ, ELEV.minZ - gv.z);
    gc[i * 4] = col.r; gc[i * 4 + 1] = col.g; gc[i * 4 + 2] = col.b;
    gc[i * 4 + 3] = Math.max(0, Math.min(1, 1 - over / 280)); // ~3 verts of feather past the grid edge
  }
  gulfGeom.setAttribute('color', new THREE.BufferAttribute(gc, 4));
  scene.add(gulf);

  buildTerrain(scene);
  buildIslands(scene);

  buildCountyLines(scene);
  buildBorderLine(scene);
}

// Padre's sand — a fine grid per island ring (the main terrain grid is too
// coarse for a barrier island and dips these cells underwater). Land verts sit
// just under hAt so wheels ride the height field; water verts drop below the
// gulf plane, and the interpolation between them is the sloping shoreline.
function buildIslands(scene) {
  const CELL = 6;
  const cDry = new THREE.Color(0xd9c79c), cWet = new THREE.Color(0xb5a07c);
  for (const ring of GEO.islands) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [px, pz] of ring) {
      minX = Math.min(minX, px); maxX = Math.max(maxX, px);
      minZ = Math.min(minZ, pz); maxZ = Math.max(maxZ, pz);
    }
    minX -= CELL; maxX += CELL; minZ -= CELL; maxZ += CELL;
    const W = Math.ceil((maxX - minX) / CELL) + 1, H = Math.ceil((maxZ - minZ) / CELL) + 1;
    const pos = new Float32Array(W * H * 3);
    const col = new Float32Array(W * H * 3);
    const c = new THREE.Color();
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const x = minX + ((maxX - minX) * i) / (W - 1);
        const z = minZ + ((maxZ - minZ) * j) / (H - 1);
        const land = onIsland(x, z);
        const y = land ? hAt(x, z) - 0.08 : -3.5; // just under the wheels; well above the -2.5 water
        const k = (j * W + i) * 3;
        pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
        // wet sand at the waterline, dry above
        c.lerpColors(cWet, cDry, Math.min(1, Math.max(0, (y + 1.5) / 1.6)));
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
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    scene.add(mesh);
    (padreSites.islands ??= []).push(mesh);
  }
  buildPadreSites(scene);
}

// One-time hand-flagged Padre content: the Queen Isabella Causeway, the SPI
// mini-town (scenery, never a 133rd city), and the Mansfield Cut jetties.
// Coordinates validated against the island rings offline — nudge with care.
export const CAUSEWAY = { x1: 2187.5, z1: 5478.6, x2: 2227, z2: 5468 }; // Port Isabel → SPI
export const padreSites = {}; // filled at build; __game exposes it for the verify suite
function buildPadreSites(scene) {
  const rand = seededRand('padresites');
  // --- causeway: flat drivable deck just above the water, pylons, rails ---
  const cw = new THREE.Group();
  cw.userData.kind = 'causeway';
  const dx = CAUSEWAY.x2 - CAUSEWAY.x1, dz = CAUSEWAY.z2 - CAUSEWAY.z1;
  const len = Math.hypot(dx, dz), ang = Math.atan2(dx, dz);
  const midX = (CAUSEWAY.x1 + CAUSEWAY.x2) / 2, midZ = (CAUSEWAY.z1 + CAUSEWAY.z2) / 2;
  const deckMat = new THREE.MeshLambertMaterial({ color: 0x9a9a92 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.22, len + 2), deckMat);
  deck.position.set(midX, 0.02, midZ); // top ~0.13 — same wheels-in-surface tolerance as road ribbons
  deck.rotation.y = ang;
  cw.add(deck);
  const railMat = new THREE.MeshLambertMaterial({ color: 0xb8bcc0 });
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.3, len + 2), railMat);
    rail.position.set(midX + Math.cos(ang) * 1.55 * side, 0.28, midZ - Math.sin(ang) * 1.55 * side);
    rail.rotation.y = ang;
    cw.add(rail);
  }
  const pylonMat = new THREE.MeshLambertMaterial({ color: 0x8a8a82 });
  const nPy = Math.floor(len / 6);
  for (let i = 1; i < nPy; i++) {
    const t = i / nPy;
    const py = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.4, 1.6), pylonMat);
    py.position.set(CAUSEWAY.x1 + dx * t, -2.2, CAUSEWAY.z1 + dz * t);
    py.rotation.y = ang;
    cw.add(py);
  }
  scene.add(cw);
  padreSites.causeway = cw;

  // --- SPI mini-town: pastel condo towers along the south spit ---
  const spi = new THREE.Group();
  spi.userData.kind = 'spitown';
  const pastels = [0xf2dfc4, 0xcfe6dd, 0xefd2d8, 0xe6e2f0, 0xf4e8d0, 0xd8e8f0, 0xf0e0c8];
  const TOWERS = [
    [2227, 5465, 6.5], [2231, 5472, 5.2], [2229, 5480, 7.2], [2233, 5484, 4.6],
    [2224, 5455, 5.8], [2224, 5448, 4.2], [2226, 5440, 3.6],
  ];
  TOWERS.forEach(([x, z, h], i) => {
    const w = 1.6 + rand() * 0.8;
    const tw = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.3 + rand() * 0.6), leaf(pastels[i % pastels.length]));
    tw.position.set(x, hAt(x, z) + h / 2, z);
    tw.rotation.y = rand() * 0.5 - 0.25;
    tw.userData.prop = 'spitower';
    spi.add(tw);
  });
  scene.add(spi);
  padreSites.spi = spi;

  // --- Mansfield Cut jetties: granite riprap flanking the real gap ---
  const jetty = new THREE.Group();
  jetty.userData.kind = 'jetty';
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x7a7570, flatShading: true });
  for (const [tx, tz, dzj] of [[2091.3, 4936.5, -0.12], [2121.6, 4941.7, 0.12]]) {
    for (let i = 0; i < 14; i++) {
      const rock = new THREE.Mesh(new THREE.BoxGeometry(1 + rand(), 1.6 + rand(), 1 + rand()), rockMat);
      rock.position.set(tx + i * 1.4 + (rand() - 0.5) * 0.5, -1.6 + rand() * 0.3, tz + i * dzj * 1.4 + (rand() - 0.5) * 0.5);
      rock.rotation.set(rand() * 0.4, rand() * Math.PI, rand() * 0.4);
      jetty.add(rock);
    }
  }
  scene.add(jetty);
  padreSites.jetty = jetty;
}

// W3: per-neighbor band paint. The old uniform 0.75 tan wash flattened every
// out-of-state cell to one color — DEM relief and the cPine bleed vanished on
// roamable shoulder land. Neighbor land now keeps a regional read at a
// strength the height ramp survives; Mexico and open coast keep the full
// wash (the Rio Grande contrast is deliberate — Mexico is out).
const BAND_TINT = {
  NM: { c: new THREE.Color(0xc2a76b), k: 0.35 }, // desert (shares cDry)
  OK: { c: new THREE.Color(0x8d4038), k: 0.5 },  // red-dirt plains (brick tint — the olive base ramp eats half the red)
  AR: { c: new THREE.Color(0x5f8a4a), k: 0.4 },  // pine (shares cPine)
  LA: { c: new THREE.Color(0x4f6b40), k: 0.45 }, // swamp
};
export function bandTint(x, z) {
  const s = neighborStateAt(x, z);
  return s ? BAND_TINT[s] : null;
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
      // Padre bbox: the 30-unit grid can't resolve a 10–40-unit island — hide
      // these cells under water and let buildIslands' fine sand mesh own it
      const padre = x > 2000 && x < 2350 && z > 3510 && z < 5500;
      if (out && (m <= 2 || padre)) y = -4; // offshore: dip *below* the gulf water plane (-2.5) — geo.js terrainMeshY duplicates this rule (boat legality); change one, change both
      const k = (j * W + i) * 3;
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      // color: height ramp, then region/outside tint
      const t = Math.min(1, m / 2200);
      if (t < 0.35) c.lerpColors(cLow, cMid, t / 0.35);
      else c.lerpColors(cMid, cHigh, (t - 0.35) / 0.65);
      if (x < -2200) c.lerp(cDry, 0.5);          // Trans-Pecos / far west
      else if (x > 3400 && m < 200) c.lerp(cPine, 0.45); // piney east lowlands
      if (out) {
        const bt = bandTint(x, z);
        c.lerp(bt ? bt.c : cOut, bt ? bt.k : 0.75);
      }
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
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color }));
  scene.add(mesh);
  return mesh;
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
  buildSidings(scene);
  buildRailBridges(scene);
}

// Passing sidings (Rails Ops W3): one merged steel band per baked `sd` span,
// offset SIDING_OFF to the span's `side` (+1 = buildRibbons' left normal of
// increasing arc — the same convention trains.js hold offsets use), with short
// end tapers angling back toward the main. yOff 0.15 keeps the taper mouths
// layered above the main steel band (0.11) instead of z-fighting it.
// 3.0: rolling stock is ~1.8 wide — 2.0 cleared physically but the two
// consists read as one blob during a pass; 3.0 keeps visible daylight.
export const SIDING_OFF = 3.0, SIDING_TAPER = 4;
function buildSidings(scene) {
  const lines = [];
  for (const r of GEO.rails) {
    if (!r.sd) continue;
    const cum = [0];
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const len = cum[cum.length - 1];
    // point + left normal at arc s
    const at = (s) => {
      let lo = 0, hi = cum.length - 1;
      while (lo < hi - 1) { const mid = (lo + hi) >> 1; (cum[mid] <= s ? (lo = mid) : (hi = mid)); }
      const a = r.pts[lo], b = r.pts[lo + 1];
      const seg = cum[lo + 1] - cum[lo] || 1;
      const t = (s - cum[lo]) / seg;
      const dx = (b[0] - a[0]) / seg, dz = (b[1] - a[1]) / seg;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, -dz, dx]; // x, z, left normal
    };
    for (const { s0, s1, side } of r.sd) {
      const pts = [];
      const push = (s, off) => {
        const [x, z, nx, nz] = at(Math.max(0, Math.min(len, s)));
        pts.push([x + nx * off * side, z + nz * off * side]);
      };
      push(s0 - SIDING_TAPER, 0);
      // interior samples follow the parent's own vertices so curves track
      push(s0, SIDING_OFF);
      for (let i = 0; i < cum.length; i++) if (cum[i] > s0 + 1 && cum[i] < s1 - 1) push(cum[i], SIDING_OFF);
      push(s1, SIDING_OFF);
      push(s1 + SIDING_TAPER, 0);
      lines.push(pts);
    }
  }
  if (!lines.length) return;
  const mesh = buildRibbons(scene, lines, 0.55, 0x8a8a90, 0.15);
  mesh.name = 'sidings';
}

// International rail bridges (Rails W2): one merged steel through-truss per
// baked spur crossing (`bridge: {x, z, ang}` in rails.json). Deck top sits at
// the *lowest* rail height across the span so the draped rail ribbon and the
// train always ride above it — the channel dip is shallow at this scale.
function buildRailBridges(scene) {
  const mat = new THREE.MeshLambertMaterial({ color: 0x2f3338, flatShading: true });
  const L = 14, W = 3.4, H = 3.0; // wide enough that a curving consist clears the trusses
  for (const r of GEO.rails) {
    if (!r.bridge) continue;
    const { x, z, ang } = r.bridge;
    let minH = Infinity;
    for (let i = -4; i <= 4; i++) {
      const t = (i / 8) * L;
      minH = Math.min(minH, hAt(x + Math.sin(ang) * t, z + Math.cos(ang) * t));
    }
    const parts = [];
    const box = (w, h, d, bx, by, bz) => parts.push(new THREE.BoxGeometry(w, h, d).translate(bx, by, bz).toNonIndexed());
    box(W, 0.25, L, 0, -0.125, 0);                       // deck — top flush with the lowest rail point
    for (const side of [-1, 1]) {
      box(0.16, 0.16, L, side * W / 2, 0.1, 0);          // bottom chord
      box(0.16, 0.16, L, side * W / 2, H, 0);            // top chord
      for (let i = -2; i <= 2; i++) box(0.13, H, 0.13, side * W / 2, H / 2, i * (L / 4)); // verticals
      for (let i = -2; i < 2; i++) {                      // diagonals
        const d = new THREE.BoxGeometry(0.1, Math.hypot(H, L / 4), 0.1)
          .rotateX((i % 2 ? -1 : 1) * Math.atan2(L / 4, H))
          .translate(side * W / 2, H / 2, (i + 0.5) * (L / 4));
        parts.push(d.toNonIndexed());
      }
      box(0.6, 3, 0.9, side * (W / 2 - 0.2), -1.6, 0);   // piers under midspan
    }
    for (let i = -2; i <= 2; i++) box(W, 0.14, 0.14, 0, H, i * (L / 4)); // portal cross-beams
    const mesh = new THREE.Mesh(mergeGeoms(parts), mat);
    mesh.position.set(x, minH, z);
    mesh.rotation.y = ang;
    scene.add(mesh);
  }
}

// Band highways — the shoulder's through-route arterials, real OSM geometry,
// same tier styling as Texas roads (Law: data-driven systems visually
// continue the world). Own array/mesh, never GEO.highways (rose-scatter
// determinism — see GEO.bandHighways comment in geo.js).
function buildBandHighways(scene) {
  const ofType = (t) => GEO.bandHighways.filter((h) => h.type === t).map((h) => h.pts);
  buildRibbons(scene, ofType('motorway'), 3.2, 0x33333c, 0.12);
  buildRibbons(scene, ofType('trunk'), 2.0, 0x4a4843, 0.1);
  buildRibbons(scene, ofType('primary'), 1.5, 0x5c584e, 0.09);
  buildRibbons(scene, ofType('motorway'), 0.25, 0xd8c860, 0.16);
}

// Band rails — the shoulder's real railway geometry, same gravel+steel ribbon
// idiom and colors as Texas rails (Rails W3; band roads carry no in-world
// tint either — fading is a map-only treatment). Own array, never GEO.rails
// (see GEO.bandRails comment in geo.js). No bridge props: bridge{} only
// exists on the W2 border spurs, which live in GEO.rails.
function buildBandRails(scene) {
  const railPts = GEO.bandRails.map((r) => r.pts);
  buildRibbons(scene, railPts, 1.5, 0x4a4440, 0.07);
  buildRibbons(scene, railPts, 0.55, 0x8a8a90, 0.11);
}

// Rivers as blue ribbons, lakes as polygons — real geometry. Ribbons ride
// hAt + RIVER_OFFSET — retuned by the W2 look-pass (0.07 read sunken where
// bank terrain crossed the ribbon); boat.mjs asserts the value.
export const RIVER_OFFSET = 0.12;
function buildWater(scene) {
  const WATER = 0x2e6f9e;
  const major = /Rio Grande|Red River/;
  buildRibbons(scene, GEO.rivers.filter((r) => major.test(r.name)).map((r) => r.pts), 2.4, WATER, RIVER_OFFSET);
  buildRibbons(scene, GEO.rivers.filter((r) => !major.test(r.name)).map((r) => r.pts), 1.3, WATER, RIVER_OFFSET);
  for (const lake of GEO.lakes) {
    const shape = new THREE.Shape();
    lake.pts.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: WATER }));
    // flat water at the baked per-lake level (geo.js loadGeo: lowest shoreline
    // + LAKE_OFFSET) — one source shared with boatableAt
    mesh.position.y = lake.level;
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

// West Texas massifs (2026-07): the 30u elevation grid rounds El Capitan's
// 300 m cliff into a smooth ramp, so the range gets hero ridge meshes over
// the real terrain — Texas escarpment, the Brokeoff ridge into NM, and the
// reef arm toward Carlsbad. Anchors are real coordinates; heights are above
// local hAt. The saddle at Guadalupe Peak's true summit (31.8914, −104.8607)
// stays mesh-free — gameplay.js parks the summit landmark there.
const GLL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];
// [lat, lon, height, along-ridge length, across width, yaw rad (0 = ridge runs north)]
const GUADALUPE_SPINE = [
  [31.876, -104.860, 22, 10, 6, 0.10],  // El Capitan — the sheer prow
  [31.902, -104.864, 26, 18, 10, 0.15], // Guadalupe Peak massif — tallest tent
  [31.917, -104.874, 20, 20, 11, 0.30], // Shumard/Bartlett
  [31.937, -104.890, 18, 20, 11, 0.45], // Bush Mountain
  [31.962, -104.908, 15, 22, 10, 0.40], // Blue Ridge
  [31.990, -104.925, 13, 20, 9, 0.35],  // state-line ridge
  [32.025, -104.945, 12, 22, 9, 0.35],  // Brokeoff Mountains — NM
  [32.060, -104.970, 10, 20, 8, 0.40],  // NM
  [32.095, -104.995, 8, 18, 8, 0.45],   // NM taper
  [31.899, -104.838, 14, 12, 7, -0.35], // Hunter Peak — reef arm starts
  [31.940, -104.800, 11, 22, 8, -0.70],
  [31.985, -104.755, 9, 24, 8, -0.75],
  [32.030, -104.710, 8, 22, 7, -0.80],  // NM — Guadalupe Ridge toward the Caverns
  [32.080, -104.650, 7, 20, 7, -0.85],  // NM taper at Carlsbad's doorstep
];

// deterministic per-position jitter — duplicated (non-indexed) vertices at
// the same position hash alike, so craggy displacement never tears a face
const vjit = (vx, vy, vz, salt) => {
  const s = Math.sin(vx * 127.1 + vy * 311.7 + vz * 74.7 + salt * 53.1) * 43758.5453;
  return (s - Math.floor(s)) - 0.5; // -0.5..0.5
};

function buildGuadalupes(scene) {
  const mat = new THREE.MeshLambertMaterial({ color: 0x9d8a6e, flatShading: true }); // pale limestone
  const spine = [];
  const parts = [];
  // one craggy tent: 10 radial × 4 height segments, jittered above the base
  // ring (the skirt stays put so grounding holds); apex duplicates share one
  // hash. Base sinks to the LOWEST terrain sample around the rotated base
  // ring, not the center — slopes here drop several units across a footprint
  const tent = (x, z, h, len, w, yaw, salt) => {
    let base = hAt(x, z);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const lx = Math.cos(a) * w, lz = Math.sin(a) * len;
      const rx = x + lx * Math.cos(yaw) + lz * Math.sin(yaw);
      const rz = z - lx * Math.sin(yaw) + lz * Math.cos(yaw);
      base = Math.min(base, hAt(rx, rz));
    }
    base -= 0.5;
    const geo = new THREE.ConeGeometry(1, 1, 10, 4, true).toNonIndexed();
    const pos = geo.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const vx = pos.getX(v), vy = pos.getY(v), vz = pos.getZ(v);
      const t = vy + 0.5; // 0 at base ring, 1 at apex
      if (t < 0.05) continue;
      pos.setX(v, vx + vjit(vx, vy, vz, salt) * 0.5 * t);
      pos.setZ(v, vz + vjit(vx, vy, vz, salt + 40) * 0.5 * t);
      pos.setY(v, vy + vjit(vx, vy, vz, salt + 80) * 0.28 * t);
    }
    geo.scale(w, h, len);
    geo.rotateY(yaw);
    geo.translate(x, base + h / 2, z);
    geo.computeVertexNormals();
    parts.push(geo);
    return base;
  };
  // sync with gameplay.js's Guadalupe Peak landmark — the saddle stays clear
  const SUMMIT = GLL(31.8914, -104.8607);
  const knobs = [];
  GUADALUPE_SPINE.forEach(([lat, lon, h, len, w, yaw], i) => {
    const [x, z] = GLL(lat, lon);
    const base = tent(x, z, h, len, w, yaw, i);
    spine.push({ x, z, h, len, w, yaw, baseY: base, apexY: base + h });
    // satellite knobs break the one-apex-per-tent silhouette: two smaller
    // peaks offset along the ridge axis (seeded — same range every session).
    // rand() draws stay unconditional so the stream never shifts under skips
    const rand = seededRand('guadalupe:' + i);
    for (let sk = 0; sk < 2; sk++) {
      const along = (sk === 0 ? 1 : -1) * (0.35 + rand() * 0.25) * len;
      const across = (rand() - 0.5) * 0.5 * w;
      const kh = h * (0.45 + rand() * 0.25), kl = len * 0.45, kw = w * (0.55 + rand() * 0.2);
      const kyaw = yaw + (rand() - 0.5) * 0.6;
      const kx = x + across * Math.cos(yaw) + along * Math.sin(yaw);
      const kz = z - across * Math.sin(yaw) + along * Math.cos(yaw);
      const foot = Math.max(kl, kw) / 2;
      if (Math.hypot(kx - SUMMIT[0], kz - SUMMIT[1]) < foot + 8) continue; // marker saddle stays walkable
      if ((nearestAnyRoad(kx, kz, 30)?.dist ?? 99) < foot + 4) continue;   // US 62/180 threads the pass
      const kBase = tent(kx, kz, kh, kl, kw, kyaw, i * 7 + sk + 200);
      knobs.push({ x: kx, z: kz, h: kh, len: kl, w: kw, yaw: kyaw, baseY: kBase, apexY: kBase + kh });
    }
  });
  const mesh = new THREE.Mesh(mergeGeoms(parts), mat);
  mesh.name = 'guadalupes';
  mesh.userData.spine = spine; // checks sample these against hAt/nearestRoad
  mesh.userData.knobs = knobs; // satellite peaks — same ground/clearance laws
  scene.add(mesh);
  return mesh;
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
    const road = nearestAnyRoad(sx, sz, 25);
    if (!road || road.dist < 0.5) continue;
    const away = 7 + rand() * 2; // set back from the shoulder
    const x = road.x + ((sx - road.x) / road.dist) * away;
    const z = road.z + ((sz - road.z) / road.dist) * away;
    if (!inTexasOrBand(x, z) || !airportClear(x, z)) continue;
    const near = nearestAnyRoad(x, z, 6); // a second road may pass closer than the one we anchored to
    if (near && near.dist < 5) continue;
    if (!cityClear(x, z, 20)) continue;
    const rot = Math.atan2(-(road.x - x), -(road.z - z)); // door faces the road
    // the cemetery sits beside the chapel, along the road — pick the clear side
    for (const side of [1, -1]) {
      const cemX = x + Math.cos(rot) * 7 * side, cemZ = z - Math.sin(rot) * 7 * side;
      if (inTexasOrBand(cemX, cemZ) && !nearestAnyRoad(cemX, cemZ, 5)) return { x, z, rot, cemX, cemZ, key: `${cx},${cz}` };
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
// read: cotton puffs, grain stalks, wheat tufts, orchard rows. `stripe`
// (light/dark furrow-band pair) is bespoke only where the signature demands
// it (rice's levee/water read, hay's mowed windrows) — everyone else gets an
// auto-derived tint of `ground` via defaultStripe(), no hand-authored pair.
const CROP_STYLE = {
  cotton:    { ground: 0x9fa878, row: { kind: 'puff', color: 0xeae6da } },
  rice:      { ground: 0x41704d, row: null, // flooded paddies read flat and dark
    stripe: { a: 0x8a7550, b: 0x35625c, band: 2.1, snake: 1.0 } }, // tan levee ridge vs blue-green flooded sheen
  sorghum:   { ground: 0xa5673c, row: { kind: 'stalk', color: 0x8f5530, h: 0.85 } },
  corn:      { ground: 0x5e7f3d, row: { kind: 'stalk', color: 0x4c7433, h: 1.1 } },
  wheat:     { ground: 0xc7a44e, row: { kind: 'tuft', color: 0xd6b258 } },
  hay:       { ground: 0x99a057, row: null, // gets extra bales instead
    stripe: { a: 0xb9c179, b: 0x737a41, band: 2.6 } }, // broad mowed-windrow swaths
  peanuts:   { ground: 0x6e7f48, row: { kind: 'tuft', color: 0x53703a } },
  citrus:    { ground: 0x8a7a55, row: { kind: 'tree', color: 0x2f6b36 } },
  pecans:    { ground: 0x857550, row: { kind: 'tree', color: 0x49682f } },
  sugarcane: { ground: 0x4f8a3e, row: { kind: 'stalk', color: 0x55a041, h: 1.5 } },
  soybeans:  { ground: 0x6b8a4a, row: { kind: 'tuft', color: 0x3f6b2e } }, // band-only (AR/OK/LA bottomlands) — no TX county leads on it
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
// One shared vertex-color material for every striped field decal — the
// pigment comes entirely from the per-vertex color attribute, so unlike
// lamb() there's nothing to key by hex; own matCache slot, never a tint of
// the shared plain-color entries.
function lambVC() {
  let m = matCache.get('vc');
  if (!m) matCache.set('vc', (m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  return m;
}
function shade(hex, f) {
  const r = Math.min(255, ((hex >> 16) & 255) * f) | 0;
  const g = Math.min(255, ((hex >> 8) & 255) * f) | 0;
  const b = Math.min(255, (hex & 255) * f) | 0;
  return (r << 16) | (g << 8) | b;
}
function defaultStripe(ground) {
  return { a: shade(ground, 1.18), b: shade(ground, 0.82), band: 1.6 };
}

// A field decal: subdivided quad vertex-draped to hAt and raised off the
// terrain (rivers sit at +0.07 — fields ride above both). `round` pulls
// outside-the-rim grid points onto the rim, so one drape serves pivots too.
// `stripe` ({a, b, band, snake?}) paints alternating furrow/windrow/levee
// bands along the local depth axis (aligned with `rot`, matching row
// direction) via vertex colors — no extra geometry, no new randomness.
function mkFieldPatch(fx, fz, w, d, rot, color, round, raise, stripe) {
  const segX = Math.max(2, Math.ceil(w / 3)), segZ = Math.max(2, Math.ceil(d / 3));
  const pos = [], idx = [], col = [];
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const colA = stripe && new THREE.Color(stripe.a), colB = stripe && new THREE.Color(stripe.b);
  for (let j = 0; j <= segZ; j++)
    for (let i = 0; i <= segX; i++) {
      let lx = (i / segX - 0.5) * w, lz = (j / segZ - 0.5) * d;
      if (round) {
        const r = Math.hypot(lx / (w / 2), lz / (d / 2));
        if (r > 1) { lx /= r; lz /= r; }
      }
      const x = fx + lx * cr + lz * sr, z = fz - lx * sr + lz * cr;
      pos.push(x, hAt(x, z) + raise, z);
      if (stripe) {
        const wobble = stripe.snake ? Math.sin(lx * 0.6) * stripe.snake : 0;
        const c = Math.floor((lz + wobble) / stripe.band) % 2 === 0 ? colA : colB;
        col.push(c.r, c.g, c.b);
      }
    }
  for (let j = 0; j < segZ; j++)
    for (let i = 0; i < segX; i++) {
      const a = j * (segX + 1) + i;
      idx.push(a, a + segX + 1, a + 1, a + 1, a + segX + 1, a + segX + 2);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (stripe) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, stripe ? lambVC() : lamb(color));
}

// A darker "freshly watered" wedge trailing the pivot arm's angle — static
// polish only (the arm itself stays unanimated this wave, in-wave scope
// call). Own drape loop (CircleGeometry's local XZ, not mkFieldPatch's
// rotated grid) since it's a sector, not a rect/round quad.
function mkPivotWedge(fx, fz, r, armRot, raise) {
  const span = Math.PI * 0.55;
  const geo = new THREE.CircleGeometry(r * 0.96, 12, armRot + Math.PI - span / 2, span);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position.array;
  for (let i = 0; i < pos.length; i += 3) {
    const x = fx + pos[i], z = fz + pos[i + 2];
    pos[i] = x; pos[i + 1] = hAt(x, z) + raise; pos[i + 2] = z;
  }
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, lamb(shade(PIVOT_GREEN, 0.6)));
}

// Near-ground crop rows: one InstancedMesh per patch (geometry is per-chunk,
// so disposeGroup stays safe). Element style comes from CROP_STYLE.row.
// Sizes ~1.6x over the original + a raised cap so standing crop registers at
// highway speed; orchards (`tree`) get tight jitter so the grid reads as
// planted, not scattered. `rand` is always the crops2 stream (see spawn()) —
// never crops, so instance jitter/scale can't perturb field placement.
function mkCropRows(rand, fx, fz, w, d, rot, row) {
  const MUL = 1.6;
  const spacing = row.kind === 'tree' ? 2.0 : 1.15, step = row.kind === 'tree' ? 2.0 : 0.9;
  const jitter = row.kind === 'tree' ? 0.06 : 0.2;
  const rows = Math.max(1, Math.floor(d / spacing) - 1);
  const per = Math.max(2, Math.floor(w / step) - 1);
  const count = Math.min(420, rows * per);
  let geo, y0;
  if (row.kind === 'puff') { geo = new THREE.IcosahedronGeometry(0.09 * MUL, 0); y0 = 0.14 * MUL; }
  else if (row.kind === 'tuft') { geo = new THREE.ConeGeometry(0.1 * MUL, 0.34 * MUL, 4); y0 = 0.17 * MUL; }
  else if (row.kind === 'tree') { geo = new THREE.IcosahedronGeometry(0.42 * MUL, 0); y0 = 0.38 * MUL; }
  else { geo = new THREE.BoxGeometry(0.07 * MUL, row.h, 0.07 * MUL); y0 = row.h / 2; }
  const inst = new THREE.InstancedMesh(geo, lamb(row.color), count);
  const m4 = new THREE.Matrix4();
  const cr = Math.cos(rot), sr = Math.sin(rot);
  let n = 0;
  for (let r = 0; r < rows && n < count; r++) {
    const lz = ((r + 1) / (rows + 1) - 0.5) * d;
    for (let i = 0; i < per && n < count; i++) {
      const lx = ((i + 1) / (per + 1) - 0.5) * w + (rand() - 0.5) * jitter;
      const x = fx + lx * cr + lz * sr, z = fz - lx * sr + lz * cr;
      const s = 0.8 + rand() * 0.45;
      m4.makeScale(s, s, s).setPosition(x, hAt(x, z) + y0 * s, z);
      inst.setMatrixAt(n++, m4);
    }
  }
  inst.count = n;
  return inst;
}

// Solar panel array — Energy W4.5 rework (Bruno, 2026-07-18): real panel
// silhouette instead of flat crop-row boxes. One merged prototype (tilted
// slab + two legs, ~28° facing south) instanced over the block; NO site
// rotation ever — south-facing tilt is what makes a solar farm read from
// the air, so rows always run east-west and every panel tips toward +z.
function mkSolarPanels(rand, fx, fz, w, d) {
  const slab = new THREE.BoxGeometry(1.5, 0.07, 1.0).rotateX(-0.49).translate(0, 0.68, 0).toNonIndexed();
  const legGeo = new THREE.BoxGeometry(0.09, 0.58, 0.09);
  const proto = mergeGeoms([
    slab,
    legGeo.clone().translate(-0.5, 0.29, 0).toNonIndexed(),
    legGeo.clone().translate(0.5, 0.29, 0).toNonIndexed(),
  ]);
  const rows = Math.max(1, Math.floor(d / 1.7));
  const per = Math.max(2, Math.floor(w / 1.8));
  const count = Math.min(360, rows * per);
  const inst = new THREE.InstancedMesh(proto, lamb(0x1e3252), count);
  const m4 = new THREE.Matrix4();
  let n = 0;
  for (let r = 0; r < rows && n < count; r++) {
    const lz = ((r + 0.5) / rows - 0.5) * d;
    for (let i = 0; i < per && n < count; i++) {
      const lx = ((i + 0.5) / per - 0.5) * w + (rand() - 0.5) * 0.12;
      const x = fx + lx, z = fz + lz;
      m4.makeTranslation(x, hAt(x, z), z);
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
  const ag = agAt(midX, midZ) || bandAgAt(midX, midZ);
  if (!ag) return null;
  const herd = (ag.cattle + 2 * ag.horses + ag.goats + ag.sheep) / ag.areaKm2; // head/km²
  const crop = Object.values(ag.crops).reduce((a, b) => a + b, 0) / ag.areaKm2; // acres/km²
  const odds = Math.min(0.35, herd / 80 + crop / 160);
  const rand = seededRand(`farm${cx},${cz}`);
  if (rand() >= odds) return null;
  for (let i = 0; i < 4; i++) { // a few tries for a lawful spot
    const sx = cx * CHUNK + rand() * CHUNK, sz = cz * CHUNK + rand() * CHUNK;
    const road = nearestAnyRoad(sx, sz, 25);
    if (!road || road.dist < 0.5) continue;
    const away = 8 + rand() * 3; // gate up by the road, buildings set back
    const x = road.x + ((sx - road.x) / road.dist) * away;
    const z = road.z + ((sz - road.z) / road.dist) * away;
    if (!inTexasOrBand(x, z) || !airportClear(x, z) || brandNear(x, z, 30)) continue;
    const near = nearestAnyRoad(x, z, 6); // a second road may pass closer than the anchor
    if (near && near.dist < 5) continue;
    if (!cityClear(x, z, 20)) continue;
    const ch = chapelAt(cx, cz); // don't crowd the chunk's chapel plot
    if (ch && Math.hypot(ch.x - x, ch.z - z) < 15) continue;
    const rot = Math.atan2(-(road.x - x), -(road.z - z)); // house faces its road
    const silos = crop > 10 ? 1 + ((rand() * 3) | 0) : 0; // grain country gets silos
    return { x, z, rot, silos, key: `${cx},${cz}` };
  }
  return null;
}

// A commercial feedlot for the Panhandle cattle-on-feed belt — same pure
// seeded pattern as farmsteadAt, own stream. The onFeed-density gate (≥30
// head/km²) admits exactly the top nine on-feed counties (Deaf Smith 89.9
// down to Dallam 36.9; next is Wilson at 14.2). Returns pen world centers so
// ScenerySystem (fences/bunks/mill) and animals.js (dense cattle) share one
// layout without cross-module coupling.
export function feedlotAt(cx, cz) {
  const midX = cx * CHUNK + CHUNK / 2, midZ = cz * CHUNK + CHUNK / 2;
  const ag = agAt(midX, midZ) || bandAgAt(midX, midZ);
  if (!ag || ag.onFeed / ag.areaKm2 < 30) return null;
  const rand = seededRand(`feedlot${cx},${cz}`);
  if (rand() >= Math.min(0.3, ag.onFeed / ag.areaKm2 / 300)) return null;
  for (let i = 0; i < 4; i++) {
    const sx = cx * CHUNK + rand() * CHUNK, sz = cz * CHUNK + rand() * CHUNK;
    const nPens = 3 + ((rand() * 3) | 0); // drawn every try — failures can't shift the stream
    const road = nearestAnyRoad(sx, sz, 25);
    if (!road || road.dist < 0.5) continue;
    const away = 12 + rand() * 4; // pens sprawl, so a deeper setback than a farmstead
    const x = road.x + ((sx - road.x) / road.dist) * away;
    const z = road.z + ((sz - road.z) / road.dist) * away;
    if (!inTexasOrBand(x, z) || !airportClear(x, z) || brandNear(x, z, 30)) continue;
    const near = nearestAnyRoad(x, z, 6);
    if (near && near.dist < 5) continue;
    if (!cityClear(x, z, 20)) continue;
    const ch = chapelAt(cx, cz);
    if (ch && Math.hypot(ch.x - x, ch.z - z) < 20) continue;
    const farm = farmsteadAt(cx, cz); // don't crowd the chunk's farmstead either
    if (farm && Math.hypot(farm.x - x, farm.z - z) < 25) continue;
    const rot = Math.atan2(-(road.x - x), -(road.z - z)); // -z faces the road
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const pens = [];
    for (let p = 0; p < nPens; p++) { // one row of pens along local +x
      const lx = (p - (nPens - 1) / 2) * 5.6, lz = 2.5;
      pens.push({ x: x + lx * cr + lz * sr, z: z - lx * sr + lz * cr });
    }
    return { x, z, rot, pens, key: `${cx},${cz}` };
  }
  return null;
}

// Well sites — Energy W2. Pure seeded chunk function (chapelAt pattern, own
// `well:` stream): odds come straight from the county's real OSM well density
// (energyAt), so the Permian runs thick, Eagle Ford/Barnett/East Texas appear,
// and zero-well counties stay empty — the old uniform Permian scatter is
// retired (realism-first), never re-keyed. Returns an array (dense counties
// pack several pads per chunk); scenery dresses each site with the
// pumpjack/tank-battery/derrick kit, night flares included.
export function wellSiteAt(cx, cz) {
  const midX = cx * CHUNK + CHUNK / 2, midZ = cz * CHUNK + CHUNK / 2;
  const en = energyAt(midX, midZ);
  if (!en || !en.wellKm2) return [];
  const rand = seededRand(`well:${cx},${cz}`);
  const sites = [];
  for (let s = 0; s < 3; s++) { // up to 3 pads/chunk — Loving-county density saturates this
    const roll = rand();                       // drawn every slot — failures can't shift the stream
    const sx = cx * CHUNK + rand() * CHUNK, sz = cz * CHUNK + rand() * CHUNK;
    const jacks = 1 + ((rand() * 3) | 0);      // 1–3 jacks on the pad
    const tanks = 2 + ((rand() * 3) | 0);      // tank battery, 2–4 tanks
    const rig = rand() < 0.18;                 // the odd workover derrick
    const flare = rand() < 0.4;                // basin gas flare, night-gated
    const rot = rand() * Math.PI * 2;
    if (roll >= Math.min(0.85, en.wellKm2 * 1.1)) continue;
    if (!inTexas(sx, sz) || !airportClear(sx, sz) || brandNear(sx, sz, 30)) continue;
    const near = nearestAnyRoad(sx, sz, 6);    // pads keep the farmstead road clearance
    if (near && near.dist < 5) continue;
    if (!cityClear(sx, sz, 20)) continue;
    const ch = chapelAt(cx, cz);
    if (ch && Math.hypot(ch.x - sx, ch.z - sz) < 15) continue;
    const farm = farmsteadAt(cx, cz);
    if (farm && Math.hypot(farm.x - sx, farm.z - sz) < 15) continue;
    if (sites.some((o) => Math.hypot(o.x - sx, o.z - sz) < 18)) continue; // pads don't overlap
    sites.push({ x: sx, z: sz, rot, jacks, tanks, rig, flare, key: `${cx},${cz}` });
  }
  return sites;
}

// Wind turbines — Energy W3. windFarms[] only bakes cluster aggregates
// ({x, z, count, r} — cell-binned, no individual turbine coords, "keeps the
// fleet honest"), so per-chunk turbine slots are derived: density =
// count/(π·r²), expected slots = density·CHUNK², candidates drawn uniformly
// in the chunk and rejected if outside the farm's circle — that rejection
// alone handles farm-edge chunks correctly (no separate overlap-fraction
// math). Own `turbine:` stream. Capped per chunk (dense Sweetwater-corridor
// farms would otherwise draw hundreds in one chunk).
const TURBINE_CAP = 32;
export function windTurbinesAt(cx, cz) {
  const baseX = cx * CHUNK, baseZ = cz * CHUNK, midX = baseX + CHUNK / 2, midZ = baseZ + CHUNK / 2;
  const out = [];
  for (const f of GEO.energy.windFarms) {
    if (Math.hypot(f.x - midX, f.z - midZ) > f.r + CHUNK * 0.75) continue; // cheap farm-overlap reject
    const density = f.count / (Math.PI * f.r * f.r);
    const expect = Math.min(TURBINE_CAP, density * CHUNK * CHUNK);
    if (expect < 0.05) continue;
    const rand = seededRand(`turbine:${cx},${cz},${f.x.toFixed(1)},${f.z.toFixed(1)}`);
    const draws = Math.ceil(expect) + 3; // a few extra draws — edge chunks reject some to the circle test
    for (let i = 0; i < draws && out.length < TURBINE_CAP; i++) {
      const x = baseX + rand() * CHUNK, z = baseZ + rand() * CHUNK, rot = rand() * Math.PI * 2;
      if (Math.hypot(x - f.x, z - f.z) > f.r) continue;
      if (!inTexas(x, z)) continue;
      const road = nearestAnyRoad(x, z, 3);
      if (road && road.dist < 3) continue;
      if (!airportClear(x, z)) continue;
      out.push({ x, z, rot });
    }
  }
  return out;
}

// Solar farms — Energy W3. plants[] bakes exact real coords + footprint
// radius for solar polygons (unlike turbines, no generation needed — direct
// per-chunk filter of the baked list, farmsteadAt-adjacent but no RNG).
const SOLAR_CLEAR = 1.5; // min road/river clearance the rendered decal must keep (see spawn()'s clamp)
export function solarSitesAt(cx, cz) {
  return GEO.energy.plants.filter(
    (p) => p.source === 'solar' && Math.floor(p.x / CHUNK) === cx && Math.floor(p.z / CHUNK) === cz
  );
}

// Ranch headquarters compounds — wave 5. One per named gate arch (gameplay.js
// LANDMARKS 'rancharch' / animals.js RANCH_ARCHES — same LL projections, keep
// all three in sync). Pure seeded site pattern (chapelAt precedent): scenery
// dresses the compound and animals.js homes each ranch's signature herds at
// the exact same site, no cross-module spawn coupling. sig picks the dressing.
const RANCH_HQ = [
  { name: 'King Ranch', ax: 1538.2, az: 3870.1, sig: 'king' },
  { name: 'Four Sixes Ranch', ax: -781.1, az: -2917.3, sig: 'foursixes' },
  { name: 'Waggoner Ranch', ax: 209.9, az: -3261.7, sig: 'waggoner' },
  { name: 'Y.O. Ranch', ax: -119.3, az: 1025.3, sig: 'yo' },
  // wave 5b — the historic second four (appended; indices 0–3 stay stable)
  { name: 'JA Ranch', ax: -1717.6, az: -4252.4, sig: 'ja' },
  { name: 'XIT Ranch', ax: -2714.7, az: -5214.2, sig: 'xit' },
  { name: 'Matador Ranch', ax: -1278.6, az: -3328.5, sig: 'matador' },
  { name: 'LBJ Ranch', ax: 830.2, az: 847.1, sig: 'lbj' },
];
const hqSites = [];
export function ranchHQSite(i) {
  if (i in hqSites) return hqSites[i];
  const r = RANCH_HQ[i];
  const rand = seededRand('ranchhq:' + r.sig);
  let site = null;
  for (let t = 0; t < 24 && !site; t++) {
    const ang = rand() * Math.PI * 2, d = 32 + rand() * 10; // set back off the gate
    const x = r.ax + Math.cos(ang) * d, z = r.az + Math.sin(ang) * d;
    if (!inTexas(x, z) || !airportClear(x, z) || brandNear(x, z, 30)) continue;
    const road = nearestRoad(x, z, 12); // compounds sprawl — deeper clearance than a farmstead
    if (road && road.dist < 10) continue;
    const { city, dist } = nearestCity(x, z);
    if (city && dist < cityRadius(city.pop) + 12) continue;
    const rot = Math.atan2(-(r.ax - x), -(r.az - z)); // HQ house faces its gate
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const pens = [];
    for (let p = 0; p < 3; p++) { // working pens along local +x, gate side open
      const lx = 4.5 + p * 5.6, lz = 5.5;
      pens.push({ x: x + lx * cr + lz * sr, z: z - lx * sr + lz * cr });
    }
    site = { ...r, x, z, rot, pens };
  }
  return (hqSites[i] = site); // null = every try unlawful; verify asserts all four resolve
}
export function ranchHQAt(cx, cz) {
  for (let i = 0; i < RANCH_HQ.length; i++) {
    const s = ranchHQSite(i);
    if (s && Math.floor(s.x / CHUNK) === cx && Math.floor(s.z / CHUNK) === cz) return s;
  }
  return null;
}

// Pure query: is (x,z) standing inside a rendered field/pivot decal? Replays
// the exact same 'crops'+key draw sequence and filters as spawn() (world.js
// field/pivot loop) — must stay in lockstep with that code or this reports
// crops that were never actually placed (or misses ones that were).
export function fieldAt(x, z) {
  const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
  const key = `${cx},${cz}`;
  const baseX = cx * CHUNK, baseZ = cz * CHUNK;
  const midX = baseX + CHUNK / 2, midZ = baseZ + CHUNK / 2;
  const ag = agAt(midX, midZ) || bandAgAt(midX, midZ);
  if (!ag) return null;
  const crand = seededRand('crops' + key);
  const style = CROP_STYLE[ag.dominantCrop];
  const cropAcres = Object.values(ag.crops).reduce((a, b) => a + b, 0);
  const fields = style ? Math.min(8, (cropAcres / ag.areaKm2 / 6) | 0) : 0;
  const pivots = ag.dominantCrop === 'rice' ? 0 : Math.min(4, (ag.irrAcres / ag.areaKm2 / 7) | 0);
  for (let i = 0; i < fields; i++) {
    const fx = baseX + crand() * CHUNK, fz = baseZ + crand() * CHUNK;
    const w = 9 + crand() * 9, d = 7 + crand() * 7, rot = crand() * Math.PI;
    crand(); // rowRoll — unused here, must still consume the draw to stay in lockstep
    const clear = Math.hypot(w, d) / 2 + 2;
    if (!inTexasOrBand(fx, fz) || !airportClear(fx, fz)) continue;
    if (nearestAnyRoad(fx, fz, clear)) continue;
    if (!cityClear(fx, fz, clear)) continue;
    const dx = x - fx, dz = z - fz;
    const c = Math.cos(-rot), s = Math.sin(-rot);
    const lx = dx * c - dz * s, lz = dx * s + dz * c; // into field-local frame
    if (Math.abs(lx) <= w / 2 && Math.abs(lz) <= d / 2) return { crop: ag.dominantCrop, kind: 'field' };
  }
  for (let i = 0; i < pivots; i++) {
    const fx = baseX + crand() * CHUNK, fz = baseZ + crand() * CHUNK;
    const r = 2 + crand() * 2;
    crand(); // armRot — unused here, must still consume the draw
    if (!inTexasOrBand(fx, fz) || !airportClear(fx, fz)) continue;
    if (nearestAnyRoad(fx, fz, r + 2)) continue;
    if (!cityClear(fx, fz, r + 2)) continue;
    if (Math.hypot(x - fx, z - fz) <= r) return { crop: ag.dominantCrop, kind: 'pivot' };
  }
  return null;
}

// Reused per-frame scratch objects for the turbine blade matrix rebuild —
// one instance for the whole system (ScenerySystem is a singleton), avoids
// per-instance-per-frame allocation.
const _tQYaw = new THREE.Quaternion(), _tQSpin = new THREE.Quaternion(), _tQ = new THREE.Quaternion();
const _tM4 = new THREE.Matrix4(), _tV = new THREE.Vector3(), _tOne = new THREE.Vector3(1, 1, 1);
const _tYAxis = new THREE.Vector3(0, 1, 0), _tZAxis = new THREE.Vector3(0, 0, 1);

class ScenerySystem {
  constructor(scene) {
    this.scene = scene;
    this.live = new Map(); // "cx,cz" -> THREE.Group
    this.t = 0;
    this.animated = []; // {obj, kind, phase} — pumpjack arms, windmill fans
    // shared gas-flare flame material — one material for every well-site flare,
    // opacity gated on ATMOS.night in update (maritime rigGlow idiom); the
    // per-flare flicker is a scale pulse via the animated registry
    this.flareMat = new THREE.MeshBasicMaterial({ color: 0xff9030, transparent: true, opacity: 0, fog: false, blending: THREE.AdditiveBlending, depthWrite: false });
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
    this.flareMat.opacity = 0.3 + 0.7 * ATMOS.night; // flares burn 24/7 — faint by day, punching through after dark (Energy W4, Bruno's call)
    for (const a of this.animated) {
      if (a.kind === 'pumpjack') a.obj.rotation.x = Math.sin(this.t * 1.4 + a.phase) * 0.22; // beam nods across its x pivot
      else if (a.kind === 'chicken') a.obj.rotation.x = -Math.max(0, Math.sin(this.t * 2.6 + a.phase)) * 0.5; // beak-to-dirt peck bursts
      else if (a.kind === 'gasflare') a.obj.scale.setScalar(0.8 + 0.3 * Math.abs(Math.sin(this.t * 9 + a.phase)) + 0.1 * Math.sin(this.t * 23 + a.phase)); // ragged flame flicker
      else if (a.kind === 'turbine') { // a.obj is {mesh, sites, spin} — not an Object3D, must not fall into the windmill else below
        a.obj.spin += dt * (1.6 + a.phase * 0.1) * ATMOS.wind; // identical response curve to windmills — same real-loop sentinel covers both
        const { mesh, sites, spin } = a.obj;
        _tQSpin.setFromAxisAngle(_tZAxis, spin);
        for (let i = 0; i < sites.length; i++) {
          const s = sites[i];
          _tQYaw.setFromAxisAngle(_tYAxis, s.rot);
          _tQ.multiplyQuaternions(_tQYaw, _tQSpin);
          _tM4.compose(_tV.set(s.x, s.y, s.z), _tQ, _tOne);
          mesh.setMatrixAt(i, _tM4);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
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
    // Padre first: any chunk touching an island ring grows beach, not brush.
    // Placement stays island-only (mainland slivers of mixed chunks draw
    // nothing — a bare shore, never mesquite-on-the-beach).
    const islandChunk = chunkOnIsland(baseX, baseZ);
    if (islandChunk) {
      table.push([mkDune, 6], [mkSeaOats, 8], [mkDriftwood, 3], [mkBeachSign, 1]);
    } else if (inPermian(midX, midZ)) {
      // Energy W2: the uniform pumpjack stream retired (realism-first) — jacks
      // now come only from wellSiteAt's real county density, below
      table.push([mkYucca, 3], [mkRock, 2], [mkMesquite, 2]);
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
        if (islandChunk) {
          // the strip is a sliver of most chunks it crosses — retry onto the
          // sand so beach density follows the island, not the overlap fraction
          for (let tr = 0; tr < 9 && !onIsland(x, z); tr++) { x = baseX + rand() * CHUNK; z = baseZ + rand() * CHUNK; }
          if (!onIsland(x, z)) continue;
        }
        if (!inTexasOrBand(x, z)) continue;
        // bluebonnets grow along roads; everything else stays off them
        const road = nearestAnyRoad(x, z, 8);
        if (maker === mkBluebonnets) {
          if (!road) continue;
          const away = Math.max(3.5, road.dist); // just off the shoulder
          x = road.x + ((x - road.x) / (road.dist || 1)) * away;
          z = road.z + ((z - road.z) / (road.dist || 1)) * away;
        } else if (road && road.dist < 3) continue;
        if (!airportClear(x, z)) continue; // fields keep their footprints bare
        const obj = maker(rand);
        obj.userData.kind ??= maker.name; // drawAudit attribution — animated makers already set their own
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
      oak.userData.kind = 'mkLiveOak'; // chapel/cemetery self-tag in their makers
      group.add(chapel, cem, oak);
    }

    // census-painted working land: crop decals + pivots + the odd farmstead.
    // Own seed streams — the pre-ag scenery stream above stays untouched, so
    // the existing world is byte-identical. agAt sampled at chunk center
    // (county polygons dwarf 260-unit chunks; straddle error is invisible).
    const ag = agAt(midX, midZ) || bandAgAt(midX, midZ);
    if (ag) {
      const crand = seededRand('crops' + key); // placement only — exactly 6 draws/field, 4 draws/pivot
      const crand2 = seededRand('crops2' + key); // all wave-4.5 visual randomness (rows, bales) — never touches crand
      const cropAcres = Object.values(ag.crops).reduce((a, b) => a + b, 0);
      const style = CROP_STYLE[ag.dominantCrop];
      const stripe = style && (style.stripe || defaultStripe(style.ground));
      const fields = style ? Math.min(8, (cropAcres / ag.areaKm2 / 6) | 0) : 0;
      // rice country floods levee paddies, not pivots — the dark decals do the read
      const pivots = ag.dominantCrop === 'rice' ? 0 : Math.min(4, (ag.irrAcres / ag.areaKm2 / 7) | 0);
      let deck = 0; // tiny y stagger — two overlapping coplanar decals would z-fight
      for (let i = 0; i < fields; i++) {
        const fx = baseX + crand() * CHUNK, fz = baseZ + crand() * CHUNK;
        const w = 9 + crand() * 9, d = 7 + crand() * 7, rot = crand() * Math.PI;
        const rowRoll = crand(); // drawn every iteration — placement failures can't shift the stream
        const clear = Math.hypot(w, d) / 2 + 2;
        if (!inTexasOrBand(fx, fz) || !airportClear(fx, fz)) continue;
        if (nearestAnyRoad(fx, fz, clear)) continue; // fields never swallow a road
        if (!cityClear(fx, fz, clear)) continue;
        const patch = mkFieldPatch(fx, fz, w, d, rot, style.ground, false, 0.12 + deck++ * 0.015, stripe);
        patch.userData.crop = ag.dominantCrop;
        patch.userData.kind = 'cropfield';
        group.add(patch);
        if (style.row) {
          const rows = mkCropRows(crand2, fx, fz, w * 0.9, d * 0.9, rot, style.row);
          rows.userData.kind = 'croprows';
          group.add(rows);
        } else if (ag.dominantCrop === 'hay')
          for (let k = 0, kn = 2 + ((rowRoll * 3) | 0); k < kn; k++) {
            const bale = mkHayBale(crand2);
            bale.userData.kind = 'mkHayBale';
            const bx = fx + (crand2() - 0.5) * w * 0.7, bz = fz + (crand2() - 0.5) * d * 0.7;
            bale.position.set(bx, hAt(bx, bz), bz);
            group.add(bale);
          }
      }
      for (let i = 0; i < pivots; i++) {
        const fx = baseX + crand() * CHUNK, fz = baseZ + crand() * CHUNK;
        const r = 2 + crand() * 2, armRot = crand() * Math.PI * 2; // 4–8 unit circles ≈ real pivots
        if (!inTexasOrBand(fx, fz) || !airportClear(fx, fz)) continue;
        if (nearestAnyRoad(fx, fz, r + 2)) continue;
        if (!cityClear(fx, fz, r + 2)) continue;
        const disc = mkFieldPatch(fx, fz, r * 2, r * 2, 0, PIVOT_GREEN, true, 0.12 + deck++ * 0.015);
        disc.userData.pivot = true;
        const armG = new THREE.CylinderGeometry(0.05, 0.05, r * 0.94, 4);
        armG.rotateX(Math.PI / 2).translate(0, 0, -r * 0.47); // spans hub to rim
        const arm = new THREE.Mesh(armG, lamb(0xc4c8cc));
        arm.position.set(fx, hAt(fx, fz) + 0.35, fz);
        arm.rotation.y = armRot;
        const wedge = mkPivotWedge(fx, fz, r, armRot, 0.12 + deck++ * 0.015);
        disc.userData.kind = arm.userData.kind = wedge.userData.kind = 'pivot';
        group.add(disc, arm, wedge);
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

      // on-feed belt: the chunk's feedlot (site + pen centers from feedlotAt;
      // animals.js packs the same pens with cattle)
      const lot = feedlotAt(cx, cz);
      if (lot) {
        const lr = seededRand('feedprops' + key);
        const lg = new THREE.Group();
        lg.userData.kind = 'feedlot';
        for (const p of lot.pens) {
          const pen = mkFeedPen(lr);
          pen.position.set(p.x, hAt(p.x, p.z), p.z);
          pen.rotation.y = lot.rot;
          lg.add(pen);
        }
        const cr = Math.cos(lot.rot), sr = Math.sin(lot.rot);
        const millLx = -(lot.pens.length - 1) / 2 * 5.6 - 4.4; // off the row's west end
        const mx = lot.x + millLx * cr + 3.6 * sr, mz = lot.z - millLx * sr + 3.6 * cr;
        const mill = mkFeedMill();
        mill.position.set(mx, hAt(mx, mz), mz);
        mill.rotation.y = lot.rot + (lr() - 0.5) * 0.3;
        lg.add(mill);
        group.add(lg);
      }
    }

    // ranch HQ compound behind a named gate arch (wave 5) — the shared kit
    // plus a per-ranch signature; animals.js homes the signature herds at
    // this same ranchHQAt site. Own stream; outside the ag gate on purpose.
    const hq = ranchHQAt(cx, cz);
    if (hq) {
      const hr = seededRand('hqprops' + key);
      const hg = new THREE.Group();
      hg.userData.kind = 'ranchhq';
      const cr = Math.cos(hq.rot), sr = Math.sin(hq.rot);
      const at = (obj, prop, lx, lz, ry = 0, s = 1) => { // site frame: -z faces the gate
        const x = hq.x + lx * cr + lz * sr, z = hq.z - lx * sr + lz * cr;
        obj.position.set(x, hAt(x, z), z);
        obj.rotation.y = hq.rot + ry;
        if (s !== 1) obj.scale.setScalar(s);
        obj.userData.prop = prop;
        hg.add(obj);
        return obj;
      };
      const anim = (obj) => {
        const entry = { obj: obj.userData.animate, kind: obj.userData.kind, phase: hr() * Math.PI * 2 };
        this.animated.push(entry);
        group.userData.animated.push(entry);
      };
      at(mkHQHouse(), 'hqhouse', -6, 1);
      at(mkWaterTower(hq.sig), 'watertower', -11, 6);
      anim(at(mkWindmill(hr), 'windmill', -8.5, 9.2));
      at(mkStockTank(), 'stocktank', -7.1, 9.8);
      const barn = hq.sig === 'foursixes' ? mkHorseBarn : mkBarn; // quarter-horse stables at the 6666
      const bProp = hq.sig === 'foursixes' ? 'horsebarn' : 'barn';
      at(barn(), bProp, 1.5, 11.5, (hr() - 0.5) * 0.3, 1.4);
      at(barn(), bProp, 9, 12.5, (hr() - 0.5) * 0.3, 1.4);
      if (hq.sig === 'king') at(mkBarn(), 'barn', -3.5, 15, (hr() - 0.5) * 0.3, 1.4); // the King scale read
      for (const p of hq.pens) {
        const pen = mkCorral(hr);
        pen.position.set(p.x, hAt(p.x, p.z), p.z);
        pen.rotation.y = hq.rot;
        pen.userData.prop = 'pen';
        hg.add(pen);
      }
      if (hq.sig === 'waggoner') // oil hit drilling for water in 1902 — jacks among the cattle
        for (const [lx, lz] of [[-13, 13], [12, 17]]) anim(at(mkPumpjack(hr), 'pumpjack', lx, lz, hr() * Math.PI * 2));
      if (hq.sig === 'xit') // XIT watered 3M acres with windmills — a working row of them
        for (const [lx, lz] of [[-14, 12], [13, 15], [-2, 18]]) anim(at(mkWindmill(hr), 'windmill', lx, lz));
      if (hq.sig === 'lbj') at(mkFlagpole(), 'flagpole', -2.5, -2); // the Texas White House lawn
      for (let c = 0, cn = 3 + ((hr() * 3) | 0); c < cn; c++)
        anim(at(mkChicken(), 'chicken', -4.5 + (hr() - 0.5) * 4, 3.2 + (hr() - 0.5) * 3, hr() * Math.PI * 2));
      group.add(hg);
    }

    // well pads — Energy W2: sites from wellSiteAt (real county density), each
    // dressed with pumpjacks + tank battery + the odd derrick; gas flares are
    // night-gated site props on the shared flareMat. Own `wellprops` stream.
    for (const well of wellSiteAt(cx, cz)) {
      const wr = seededRand(`wellprops${well.x.toFixed(0)},${well.z.toFixed(0)}`);
      const wg = new THREE.Group();
      wg.userData.kind = 'wellsite';
      const cr = Math.cos(well.rot), sr = Math.sin(well.rot);
      const at = (obj, lx, lz, ry = 0) => {
        const x = well.x + lx * cr + lz * sr, z = well.z - lx * sr + lz * cr;
        obj.position.set(x, hAt(x, z), z);
        obj.rotation.y = well.rot + ry;
        wg.add(obj);
        return obj;
      };
      at(mkWellPad(), 0, 0);
      for (let j = 0; j < well.jacks; j++) {
        const jack = at(mkPumpjack(wr), -3 + j * 3.2, -1.5 + (wr() - 0.5), (wr() - 0.5) * 0.5);
        const entry = { obj: jack.userData.animate, kind: 'pumpjack', phase: wr() * Math.PI * 2 };
        this.animated.push(entry);
        group.userData.animated.push(entry);
      }
      at(mkTankBattery(wr, well.tanks), 2.5, 3.2);
      if (well.rig) at(mkDerrick(), -4.2, 3.5, wr() * 0.4);
      if (well.flare) {
        const stack = at(mkFlareStack(this.flareMat), 5.8, -2.2);
        const flame = { obj: stack.userData.animate, kind: 'gasflare', phase: wr() * Math.PI * 2 };
        this.animated.push(flame);
        group.userData.animated.push(flame);
      }
      group.add(wg);
    }

    // wind turbines — Energy W3: sites from windTurbinesAt (density-scattered
    // within the baked farm circle). Tower+nacelle instanced once (static);
    // the blade hub is a second InstancedMesh whose per-instance matrix is
    // rebuilt every frame in update() (kind 'turbine') — spin lives on the
    // wrapper object, not the mesh, so it tracks live ATMOS.wind changes.
    const turbines = windTurbinesAt(cx, cz);
    if (turbines.length) {
      const bodyI = new THREE.InstancedMesh(mkTurbineBodyGeo(), lamb(0xe4e6ea), turbines.length);
      const bladeI = new THREE.InstancedMesh(mkTurbineBladeGeo(), lamb(0xd0d4d8), turbines.length);
      bodyI.userData.kind = 'turbinetower';
      bladeI.userData.kind = 'turbineblade';
      bladeI.frustumCulled = false; // per-instance matrices change every frame — a stale bbox would cull live blades
      const sites = [];
      turbines.forEach((tb, i) => {
        const y = hAt(tb.x, tb.z);
        _tQYaw.setFromAxisAngle(_tYAxis, tb.rot);
        _tM4.compose(_tV.set(tb.x, y, tb.z), _tQYaw, _tOne);
        bodyI.setMatrixAt(i, _tM4);
        sites.push({ x: tb.x, y: y + TURBINE_HUB_Y, z: tb.z, rot: tb.rot });
      });
      group.add(bodyI, bladeI);
      const entry = { obj: { mesh: bladeI, sites, spin: 0 }, kind: 'turbine', phase: rand() * Math.PI * 2 };
      this.animated.push(entry);
      group.userData.animated.push(entry);
    }

    // solar farms — Energy W3: real plants[] sites (footprint radius baked at
    // W1). Dark decal for the from-the-air read (mkFieldPatch, pivot-decal
    // idiom) + near-ground rows (mkCropRows, crop-row idiom) — no new
    // geometry maker needed.
    for (const solar of solarSitesAt(cx, cz)) {
      // the baked footprint is an aggregate radius, not the real polygon.
      // W4.5 rework: the site splits into a 2x2 grid of rectangular blocks
      // (solar farms are gridded rectangles, not crop circles), and the
      // clearance law applies PER BLOCK — each block draws only if its whole
      // rectangle clears every road/river (skip, never shrink), so a site
      // beside I-37 (Blue Wing) keeps its far-side blocks and drops the near
      // ones instead of vanishing or spilling. Panels are the tilted
      // south-facing instanced kit — never rotated (the aerial read).
      const baseR = Math.max(1.5, solar.r);
      const srand = seededRand(`solarrows${solar.x.toFixed(1)},${solar.z.toFixed(1)}`);
      const sg = new THREE.Group();
      sg.userData.kind = 'solarfield';
      sg.userData.site = { x: solar.x, z: solar.z };
      for (const [qx, qz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const hb = baseR * (0.38 + srand() * 0.06); // block half-size
        const bx = solar.x + qx * baseR * 0.52, bz = solar.z + qz * baseR * 0.52;
        const need = hb * Math.SQRT2 + SOLAR_CLEAR; // corner reach + margin
        const road = nearestAnyRoad(bx, bz, need + 10);
        const riv = nearestRiver(bx, bz, need + 10);
        if ((road && road.dist < need) || (riv && riv.dist < need)) continue;
        sg.add(mkFieldPatch(bx, bz, hb * 2, hb * 2, 0, 0x76684e, false, 0.17)); // graded dirt pad — panels read dark against it, not into it
        sg.add(mkSolarPanels(srand, bx, bz, hb * 2 * 0.9, hb * 2 * 0.9));
      }
      if (sg.children.length) group.add(sg);
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

// Does this scenery chunk touch a Padre ring? Sampled at center/corners/edge
// mids — cheap, and mixed shore chunks classify as island (their mainland
// slivers then draw nothing; see the table comment).
// Does an island ring actually cross this chunk? Segment-bbox vs chunk-rect —
// never point sampling (the 10–40-unit ribbon slips between coarse samples)
// and never the whole ring bbox (ring 1's diagonal bbox spans the laguna AND
// a long mainland strip, which must keep its brush).
function chunkOnIsland(baseX, baseZ) {
  const x1 = baseX - 8, x2 = baseX + CHUNK + 8, z1 = baseZ - 8, z2 = baseZ + CHUNK + 8;
  for (const ring of GEO.islands) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (Math.max(a[0], b[0]) < x1 || Math.min(a[0], b[0]) > x2) continue;
      if (Math.max(a[1], b[1]) < z1 || Math.min(a[1], b[1]) > z2) continue;
      return true;
    }
  }
  return false;
}

const sandMat = new THREE.MeshLambertMaterial({ color: 0xe0cda2, flatShading: true });
const oatsMat = new THREE.MeshLambertMaterial({ color: 0xc9bd8a, flatShading: true });
const driftMat = new THREE.MeshLambertMaterial({ color: 0x9c8d76, flatShading: true });

function mkDune(rand) {
  const g = new THREE.Group();
  g.userData.kind = 'dune';
  const n = 1 + (rand() * 2 | 0);
  for (let i = 0; i < n; i++) {
    const mound = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4 + rand() * 1.2, 0), sandMat);
    mound.position.set((rand() - 0.5) * 2.5, -0.4, (rand() - 0.5) * 2.5);
    mound.scale.y = 0.28 + rand() * 0.12;
    g.add(mound);
  }
  return g;
}

function mkSeaOats(rand) {
  const g = new THREE.Group();
  g.userData.kind = 'seaoats';
  const n = 4 + (rand() * 4 | 0);
  for (let i = 0; i < n; i++) {
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.9 + rand() * 0.5, 3), oatsMat);
    blade.position.set((rand() - 0.5) * 1.4, 0.45, (rand() - 0.5) * 1.4);
    blade.rotation.set((rand() - 0.5) * 0.5, rand() * Math.PI, (rand() - 0.5) * 0.5);
    g.add(blade);
  }
  return g;
}

function mkDriftwood(rand) {
  const g = new THREE.Group();
  g.userData.kind = 'driftwood';
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.12 + rand() * 0.08, 0.2 + rand() * 0.1, 2 + rand() * 1.5, 5), driftMat);
  log.rotation.set(Math.PI / 2 + (rand() - 0.5) * 0.3, rand() * Math.PI, 0);
  log.position.y = 0.18;
  g.add(log);
  return g;
}

// The posted beach speed limit — carved into a driftwood plank, per spec.
// Number must match vehicle.js's wet-sand cap (33, the primary-road tier).
let beachSignTex = null;
function mkBeachSign(rand) {
  if (!beachSignTex) {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 64;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#8a7a60'; cx.fillRect(0, 0, 128, 64);
    cx.fillStyle = '#3d3428';
    cx.font = 'bold 22px Georgia';
    cx.textAlign = 'center';
    cx.fillText('WET SAND', 64, 26);
    cx.fillText('SPEED 33', 64, 52);
    beachSignTex = new THREE.CanvasTexture(cv);
  }
  const g = new THREE.Group();
  for (const px of [-0.55, 0.55]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.2, 5), driftMat);
    post.position.set(px, 0.6, 0);
    post.rotation.z = (rand() - 0.5) * 0.12;
    g.add(post);
  }
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.75, 0.08),
    [driftMat, driftMat, driftMat, driftMat, new THREE.MeshLambertMaterial({ map: beachSignTex }), driftMat]
  );
  board.position.y = 1.05;
  g.add(board);
  g.userData.kind = 'beachsign';
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

// --- Energy W2 well-site kit (poly bar: round forms 8+ radial segments) ---

function mkWellPad() {
  // bare caliche pad under the equipment — reads as worked ground
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 0.08, 10), new THREE.MeshLambertMaterial({ color: 0xb5a684, flatShading: true }));
  pad.position.y = 0.08;
  g.add(pad);
  return g;
}

function mkTankBattery(rand, n) {
  // the row of stock tanks every producing lease has
  const g = new THREE.Group();
  const shell = new THREE.MeshLambertMaterial({ color: 0x9aa4a8, flatShading: true });
  const rusted = new THREE.MeshLambertMaterial({ color: 0x8a5a34, flatShading: true });
  for (let i = 0; i < n; i++) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.5, 10), rand() < 0.3 ? rusted : shell);
    tank.position.set(i * 1.7, 0.75, 0);
    g.add(tank);
  }
  const manifold = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, n * 1.7, 6).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3a3a40 }));
  manifold.position.set((n - 1) * 0.85, 0.25, 0.8);
  g.add(manifold);
  return g;
}

function mkDerrick() {
  // steel workover derrick — tapered lattice read, solid at mini-world scale
  const g = new THREE.Group();
  const steel = new THREE.MeshLambertMaterial({ color: 0x8a8f98, flatShading: true });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.85, 7, 8), steel);
  mast.position.y = 3.5;
  const crown = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.7), steel);
  crown.position.y = 7.1;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 2.2), new THREE.MeshLambertMaterial({ color: 0x4a4a52, flatShading: true }));
  floor.position.y = 0.25;
  g.add(mast, crown, floor);
  return g;
}

function mkFlareStack(flameMat) {
  // basin gas flare: dark stack, additive flame ball on the shared night-gated
  // material — the flame is the animate target (gasflare scale flicker)
  const g = new THREE.Group();
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 3.4, 8), new THREE.MeshLambertMaterial({ color: 0x3a3a40, flatShading: true }));
  stack.position.y = 1.7;
  // scene lights don't reach a Lambert stack at night — the top segment is
  // basic-material "flame-lit" steel so the tongue visibly connects to a stack
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.2, 8), new THREE.MeshBasicMaterial({ color: 0x6a4026 }));
  tip.position.y = 2.9;
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6).scale(1, 1.6, 1), flameMat); // stretched — a tongue of flame, not a ball
  flame.position.y = 3.4; // seated on the stack tip
  g.add(tip);
  g.add(stack, flame);
  g.userData.animate = flame;
  g.userData.kind = 'gasflare';
  return g;
}

// --- Energy W3 turbine kit (mkHatchGeo merge idiom — merged raw geometry for
// an InstancedMesh, built fresh per chunk so disposeGroup's per-instance
// dispose never churns a shared prototype). Two pieces: a static tower+
// nacelle body (instanced once, never touched again) and a hub+blade
// assembly kept centered at its OWN local origin (never pre-translated to
// hub height) so the per-frame spin quaternion rotates it in place around
// its own axle — the instance's translation carries it up to hub height.
// Poly bar: 8-seg cylinders, the chunked-scatter floor.
// Deliberately chunky, not scale-real: a hairline tower/blade read as bare
// toothpicks at normal play distance (staged-shot lesson, Energy W3) — bulked
// well past a realistic taper so the silhouette carries at highway range,
// same "legibility over realism" call as the poly-bar rule.
export function mkTurbineBodyGeo() {
  const parts = [
    new THREE.CylinderGeometry(0.26, 0.5, 10.5, 8).translate(0, 5.25, 0).toNonIndexed(),
    new THREE.BoxGeometry(0.9, 0.75, 1.9).translate(0, 10.8, -0.35).toNonIndexed(),
  ];
  return mergeGeoms(parts);
}
export const TURBINE_HUB_Y = 10.8;
export function mkTurbineBladeGeo() {
  const parts = [new THREE.CylinderGeometry(0.32, 0.32, 0.7, 8).rotateX(Math.PI / 2).translate(0, 0, -0.35).toNonIndexed()];
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.BoxGeometry(0.22, 2.8, 0.1).translate(0, 1.42, -0.35);
    blade.rotateZ((i / 3) * Math.PI * 2);
    parts.push(blade.toNonIndexed());
  }
  return mergeGeoms(parts);
}
// position+normal concat, no vertex color — every part shares one flat material
export function mergeGeoms(parts) { // exported for energy.js's merged refinery kit
  const g = new THREE.BufferGeometry();
  const total = parts.reduce((s, p) => s + p.attributes.position.count, 0);
  const names = parts[0].attributes.color ? ['position', 'normal', 'color'] : ['position', 'normal'];
  for (const name of names) {
    const arr = new Float32Array(total * 3);
    let o = 0;
    for (const p of parts) { arr.set(p.attributes[name].array, o); o += p.attributes[name].array.length; }
    g.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
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

// A feedlot pen: a corral-sized steel-pipe square with a feed bunk (long low
// trough) along the road-facing rail — the cattle side of the layout that
// feedlotAt hands to both scenery and animals.js.
function mkFeedPen(rand) {
  const g = new THREE.Group();
  const pipe = lamb(0x8a8f94);
  const W = 5;
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.48, 0.08), pipe, 16);
  const m4 = new THREE.Matrix4();
  let n = 0;
  for (let s = 0; s < 4; s++)
    for (let i = 0; i < 4; i++) {
      const f = i / 4 - 0.5;
      const [x, z] = s === 0 ? [f * W, -W / 2] : s === 1 ? [W / 2, f * W] : s === 2 ? [-f * W, W / 2] : [-W / 2, -f * W];
      m4.makeRotationY((rand() - 0.5) * 0.1).setPosition(x, 0.24, z);
      posts.setMatrixAt(n++, m4);
    }
  g.add(posts);
  for (const y of [0.2, 0.4])
    for (const [w, d, x, z] of [[W, 0.05, 0, -W / 2], [W, 0.05, 0, W / 2], [0.05, W, -W / 2, 0], [0.05, W, W / 2, 0]]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.045, d), pipe);
      rail.position.set(x, y, z);
      g.add(rail);
    }
  const bunk = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.16, 0.4), lamb(0xb8b4a8));
  bunk.position.set(0, 0.1, -W / 2 + 0.35);
  g.add(bunk);
  return g;
}

// The feed mill that anchors a lot: a tight silo trio + boxy elevator tower.
function mkFeedMill() {
  const g = new THREE.Group();
  const steel = lamb(0xc4c8cc);
  for (let i = 0; i < 3; i++) {
    const s = mkSilo();
    s.scale.setScalar(1.4);
    s.position.set(i * 1.3 - 1.3, 0, 0);
    g.add(s);
  }
  const tower = new THREE.Mesh(new THREE.BoxGeometry(0.7, 4.6, 0.7), steel);
  tower.position.set(2.2, 2.3, 0.2);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 0.8), lamb(0x9aa0a6));
  head.position.set(2.2, 4.8, 0.2);
  g.add(tower, head);
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

// Ranch HQ main house (wave 5): two-story with a full front porch — reads
// "headquarters" where mkFarmhouse reads "homestead".
function mkHQHouse() {
  const g = new THREE.Group();
  const walls = lamb(0xf2efe6);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.9, 2.0), walls);
  body.position.y = 0.95;
  const roofG = new THREE.CylinderGeometry(1.7, 1.7, 2.2, 3, 1);
  roofG.rotateX(-Math.PI / 2);
  const roof = new THREE.Mesh(roofG, lamb(0x5a5450));
  roof.position.y = 2.6;
  const porch = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.07, 0.75), lamb(0x9a8a72));
  porch.position.set(0, 1.02, -1.35);
  g.add(body, roof, porch);
  for (const px of [-1.25, -0.42, 0.42, 1.25]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.0, 0.07), walls);
    post.position.set(px, 0.5, -1.6);
    g.add(post);
  }
  const pane = lamb(0x4a4440);
  for (const [wx, wy] of [[-0.8, 1.4], [0, 1.4], [0.8, 1.4], [-0.8, 0.55], [0.8, 0.55]]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.04), pane);
    win.position.set(wx, wy, -1.01);
    g.add(win);
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.7, 0.05), lamb(0x6a5238));
  door.position.set(0, 0.35, -1.01);
  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.2, 0.22), lamb(0x8a4a3a));
  chim.position.set(1.0, 2.6, 0.4);
  g.add(door, chim);
  return g;
}

// Water tower — the compound showpiece: red tank on splayed legs, ranch name
// banded on the gate side. Sign materials cached per ranch (4 total, shared
// across respawns — never disposed, shared-prototype precedent).
const towerSigns = new Map();
function towerSignMat(sig) {
  let m = towerSigns.get(sig);
  if (!m) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 40;
    const cx = c.getContext('2d');
    cx.fillStyle = '#e8e2d4'; cx.fillRect(0, 0, 128, 40);
    cx.fillStyle = '#5a2018'; cx.font = 'bold 24px Georgia';
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText({ king: 'KING', foursixes: '6666', waggoner: 'W', yo: 'Y·O' }[sig] ?? '', 64, 21);
    towerSigns.set(sig, (m = new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(c) })));
  }
  return m;
}
function mkWaterTower(sig) {
  const g = new THREE.Group();
  const steel = lamb(0xb8bcc2);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.8, 0.12), steel);
    leg.position.set(sx * 0.75, 2.4, sz * 0.75);
    leg.rotation.z = sx * 0.09;  // splay: tops lean in to carry the tank
    leg.rotation.x = -sz * 0.09;
    g.add(leg);
  }
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.4, 10), lamb(0x8f2f24));
  tank.position.y = 5.2;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.55, 10), lamb(0x6b6560));
  cap.position.y = 6.15;
  const sign = towerSignMat(sig);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 0.06), [steel, steel, steel, steel, sign, sign]);
  plate.position.set(0, 5.2, -1.14);
  g.add(tank, cap, plate);
  return g;
}

// Flagpole with the colors flying (LBJ signature — the Texas White House lawn)
function mkFlagpole() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 3.6, 6), lamb(0xd8dce0));
  pole.position.y = 1.8;
  const canton = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.03), lamb(0x24365e));
  canton.position.set(0.17, 3.35, 0);
  const stripes = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.28, 0.03), lamb(0xb43a34));
  stripes.position.set(0.62, 3.34, 0);
  const white = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.1, 0.03), lamb(0xf0ece4));
  white.position.set(0.62, 3.33, 0.005);
  g.add(pole, canton, stripes, white);
  return g;
}

// Quarter-horse stable (Four Sixes signature): long, low, dark-roofed, a run
// of stall doors down the yard side.
function mkHorseBarn() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.2, 5.4), lamb(0x8a6a48));
  body.position.y = 0.6;
  const roofG = new THREE.CylinderGeometry(1.3, 1.3, 5.6, 3, 1);
  roofG.rotateX(-Math.PI / 2);
  const roof = new THREE.Mesh(roofG, lamb(0x33363c));
  roof.position.y = 1.72;
  g.add(body, roof);
  const dark = lamb(0x2e2824);
  for (let i = 0; i < 5; i++) {
    const stall = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.55), dark);
    stall.position.set(-1.02, 0.42, -2.1 + i * 1.05);
    g.add(stall);
  }
  return g;
}

function disposeGroup(g) {
  g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
}
