// Static world: Texas-shaped ground, gulf, highway ribbons, regional scenery chunks.
import * as THREE from 'three';
import { GEO, seededRand, inTexas, nearestRoad } from './geo.js';
import { ATMOS } from './sky.js';

export function buildWorld(scene) {
  buildGround(scene);
  buildWater(scene);
  buildHighways(scene);
  buildMountains(scene);
  return new ScenerySystem(scene);
}

function buildGround(scene) {
  // "Rest of the world" plane, faded
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

  // Texas itself — ground built from the real border polygon
  const shape = new THREE.Shape();
  GEO.border.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2); // (x, y) -> (x, 0, -y) => back to our x,z
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x9aa568 }));
  ground.position.y = 0;
  scene.add(ground);

  // County lines — faint ground lines you cross on the highway
  if (GEO.counties?.length) {
    const pos = [];
    for (const c of GEO.counties) {
      for (const ring of c.rings) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i], b = ring[(i + 1) % ring.length];
          pos.push(a[0], 0.14, a[1], b[0], 0.14, b[1]);
        }
      }
    }
    const seg = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)),
      new THREE.LineBasicMaterial({ color: 0x77775e, transparent: true, opacity: 0.35 })
    );
    scene.add(seg);
  }

  // Border outline — subtle dark ridge so the state edge reads from the air
  const borderPts = GEO.border.map(([x, z]) => new THREE.Vector3(x, 0.4, z));
  borderPts.push(borderPts[0].clone());
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(borderPts),
    new THREE.LineBasicMaterial({ color: 0x5c5138 })
  );
  scene.add(line);

  // West Texas tint — dry overlay patch (approximate Trans-Pecos / Panhandle west)
  const dry = new THREE.Mesh(
    new THREE.PlaneGeometry(5200, 11000),
    new THREE.MeshLambertMaterial({ color: 0xc2a76b, transparent: true, opacity: 0.55 })
  );
  dry.rotation.x = -Math.PI / 2;
  dry.position.set(-4400, 0.05, -800);
  scene.add(dry);
  // East Texas piney green tint
  const piney = new THREE.Mesh(
    new THREE.PlaneGeometry(2600, 5200),
    new THREE.MeshLambertMaterial({ color: 0x5f8a4a, transparent: true, opacity: 0.45 })
  );
  piney.rotation.x = -Math.PI / 2;
  piney.position.set(4600, 0.05, -1400);
  scene.add(piney);
}

// Flat ribbon mesh from an array of polylines (roads, rivers)
function buildRibbons(scene, polylines, width, color, y) {
  const pos = [], idx = [];
  for (const pts of polylines) {
      const base = () => pos.length / 3;
    const start = pos.length / 3;
    for (let i = 0; i < pts.length; i++) {
      // direction = average of adjacent segments
      const p = pts[i];
      const pPrev = pts[Math.max(0, i - 1)], pNext = pts[Math.min(pts.length - 1, i + 1)];
      let dx = pNext[0] - pPrev[0], dz = pNext[1] - pPrev[1];
      const L = Math.hypot(dx, dz) || 1;
      dx /= L; dz /= L;
      const nx = -dz * width / 2, nz = dx * width / 2; // left normal
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
    mesh.position.y = 0.08;
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

    // animate pumpjacks (nodding) and windmills (spinning)
    this.t += dt;
    for (const a of this.animated) {
      if (a.kind === 'pumpjack') a.obj.rotation.x = Math.sin(this.t * 1.4 + a.phase) * 0.22; // beam nods across its x pivot
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
        const obj = maker(rand);
        const s = 0.75 + rand() * 0.6;
        obj.scale.setScalar(s);
        obj.position.set(x, 0, z);
        obj.rotation.y = rand() * Math.PI * 2;
        group.add(obj);
        if (obj.userData.animate) {
          const entry = { obj: obj.userData.animate, kind: obj.userData.kind, phase: rand() * Math.PI * 2 };
          this.animated.push(entry);
          group.userData.animated.push(entry);
        }
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

function disposeGroup(g) {
  g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
}
