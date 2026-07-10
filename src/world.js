// Static world: Texas-shaped ground, gulf, highway ribbons, regional scenery chunks.
import * as THREE from 'three';
import { GEO, seededRand, inTexas } from './geo.js';

export function buildWorld(scene) {
  buildGround(scene);
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
  outside.position.y = -0.6;
  scene.add(outside);

  // Gulf of Mexico — big water plane hugging the SE coast
  const gulf = new THREE.Mesh(
    new THREE.PlaneGeometry(14000, 9000),
    new THREE.MeshLambertMaterial({ color: 0x2e6f9e })
  );
  gulf.rotation.x = -Math.PI / 2;
  gulf.rotation.z = -0.62; // align with coastline (runs SW–NE)
  // centered offshore of the real coast
  gulf.position.set(6500, -0.3, 5800);
  scene.add(gulf);

  // Texas itself — ground built from the real border polygon
  const shape = new THREE.Shape();
  GEO.border.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2); // (x, y) -> (x, 0, -y) => back to our x,z
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x9aa568 }));
  ground.position.y = 0;
  scene.add(ground);

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

// Highways as flat ribbons — real OSM geometry, merged into two meshes
function buildHighways(scene) {
  const build = (type, width, color, y) => {
    const pos = [], idx = [];
    for (const h of GEO.highways) {
      if (h.type !== type) continue;
      const pts = h.pts;
      const base = () => pos.length / 3;
      for (let i = 0; i < pts.length; i++) {
        // direction = average of adjacent segments
        const p = pts[i];
        const pPrev = pts[Math.max(0, i - 1)], pNext = pts[Math.min(pts.length - 1, i + 1)];
        let dx = pNext[0] - pPrev[0], dz = pNext[1] - pPrev[1];
        const L = Math.hypot(dx, dz) || 1;
        dx /= L; dz /= L;
        const nx = -dz * width / 2, nz = dx * width / 2; // left normal
        if (i === 0) var start = base();
        pos.push(p[0] + nx, y, p[1] + nz, p[0] - nx, y, p[1] - nz);
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const a = start + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color }));
    scene.add(mesh);
  };
  build('motorway', 3.2, 0x3d3d46, 0.12); // interstates — wide dark asphalt
  build('trunk', 2.0, 0x55534e, 0.1);     // US highways — narrower, lighter
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

// --- Chunked scenery: trees / cacti / brush spawned near the player ---
const CHUNK = 260, VIEW_CHUNKS = 3;

class ScenerySystem {
  constructor(scene) {
    this.scene = scene;
    this.live = new Map(); // "cx,cz" -> THREE.Group
    // shared geometries/materials by region
    this.protoPine = mkTree(0x2e5d34, 4.4, 0.9);   // east piney woods
    this.protoOak = mkTree(0x55763c, 2.6, 1.6);    // hill country oak
    this.protoCactus = mkCactus();                  // west desert
    this.protoBrush = mkTree(0x6d7a45, 1.2, 1.1);  // south brush
  }

  update(px, pz) {
    const cx = Math.floor(px / CHUNK), cz = Math.floor(pz / CHUNK);
    const want = new Set();
    for (let i = -VIEW_CHUNKS; i <= VIEW_CHUNKS; i++)
      for (let j = -VIEW_CHUNKS; j <= VIEW_CHUNKS; j++) want.add(`${cx + i},${cz + j}`);
    for (const [k, g] of this.live) if (!want.has(k)) { this.scene.remove(g); disposeGroup(g); this.live.delete(k); }
    for (const k of want) if (!this.live.has(k)) this.spawn(k);
  }

  spawn(key) {
    const [cx, cz] = key.split(',').map(Number);
    const rand = seededRand('scenery' + key);
    const group = new THREE.Group();
    const baseX = cx * CHUNK, baseZ = cz * CHUNK;
    const midX = baseX + CHUNK / 2;
    // region pick: west = cactus, east = pine, south = brush, else oak
    let proto = this.protoOak, n = 9;
    if (midX < -2200) { proto = this.protoCactus; n = 7; }
    else if (midX > 3400) { proto = this.protoPine; n = 14; }
    else if (baseZ + CHUNK / 2 > 2600) { proto = this.protoBrush; n = 8; }
    for (let i = 0; i < n; i++) {
      const x = baseX + rand() * CHUNK, z = baseZ + rand() * CHUNK;
      if (!inTexas(x, z)) continue;
      const t = proto.clone();
      const s = 0.7 + rand() * 0.8;
      t.scale.setScalar(s);
      t.position.set(x, 0, z);
      t.rotation.y = rand() * Math.PI * 2;
      group.add(t);
    }
    this.scene.add(group);
    this.live.set(key, group);
  }
}

function mkTree(color, h, crownR) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.18, h * 0.45, 5),
    new THREE.MeshLambertMaterial({ color: 0x6b4a2f })
  );
  trunk.position.y = h * 0.22;
  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(crownR, h * 0.75, 6),
    new THREE.MeshLambertMaterial({ color, flatShading: true })
  );
  crown.position.y = h * 0.45 + h * 0.3;
  g.add(trunk, crown);
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

function disposeGroup(g) {
  g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
}
