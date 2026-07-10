// Procedural cities: street grids + skylines scaled by real population,
// spawned/despawned by distance. Deterministic per city name.
import * as THREE from 'three';
import { GEO, seededRand, nearestRoad, hAt } from './geo.js';

const SPAWN_DIST = 600;

// city footprint scale from population (game units; 1 = 100 m)
export function cityRadius(pop) {
  return Math.min(90, 6 + Math.pow(pop, 0.38) / 9);
}

export class CitySystem {
  constructor(scene) {
    this.scene = scene;
    this.live = new Map(); // name -> group
    const { dayTex, nightTex } = mkFacadeTextures();
    this.buildingMat = new THREE.MeshLambertMaterial({
      color: 0xffffff, flatShading: true, map: dayTex,
      emissive: 0xffffff, emissiveMap: nightTex, emissiveIntensity: 0,
    });
    this.boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.boxGeo.translate(0, 0.5, 0); // scale from ground up
    remapRoofUVs(this.boxGeo);
  }

  // after dark the window grid lights up (emissiveMap = lit windows, walls stay dark)
  setNight(f) {
    this.buildingMat.emissiveIntensity = f * 0.9;
  }

  update(px, pz) {
    for (const c of GEO.cities) {
      const d = Math.hypot(c.x - px, c.z - pz);
      const has = this.live.has(c.name);
      if (d < SPAWN_DIST && !has) this.spawn(c);
      else if (d > SPAWN_DIST * 1.25 && has) {
        const g = this.live.get(c.name);
        this.scene.remove(g);
        g.traverse((o) => { if (o.geometry && o.geometry !== this.boxGeo) o.geometry.dispose(); });
        this.live.delete(c.name);
      }
    }
  }

  spawn(city) {
    const rand = seededRand('city:' + city.name);
    const group = new THREE.Group();
    const R = cityRadius(city.pop);
    const padY = hAt(city.x, city.z); // terrain is pad-flattened here by the pipeline
    const big = city.pop > 400000, mid = city.pop > 80000;

    // Metros with real OSM arterials ('street' tier) skip the fake grid entirely
    const hasRealStreets = !!nearestRoad(city.x, city.z, 15, (t) => t === 'street');

    // Street grid — dark quads on the ground, slight random rotation per city
    const rot = rand() * Math.PI * 0.5;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const streetMat = new THREE.MeshLambertMaterial({ color: 0x4a484f });
    const blockSize = big ? 6 : 8;
    const nStreets = Math.max(3, Math.floor((R * 1.4) / blockSize));
    const streetGeoms = [];
    for (let axis = 0; axis < (hasRealStreets ? 0 : 2); axis++) {
      for (let i = -nStreets; i <= nStreets; i++) {
        const off = i * blockSize;
        if (Math.abs(off) > R * 1.15) continue;
        const len = 2 * Math.sqrt(Math.max(0, R * R * 1.3 - off * off));
        if (len < blockSize) continue;
        const g = new THREE.PlaneGeometry(axis ? 1.1 : len, axis ? len : 1.1);
        g.rotateX(-Math.PI / 2);
        g.rotateY(rot);
        // offset perpendicular to street direction, in city-rotated frame
        g.translate(axis ? cos * off : sin * off, 0.16, axis ? -sin * off : cos * off);
        streetGeoms.push(g);
      }
    }
    for (const g of streetGeoms) {
      const m = new THREE.Mesh(g, streetMat);
      m.position.set(city.x, padY, city.z);
      group.add(m);
    }

    // Buildings — instanced boxes; height falls off from center, scaled by population
    const maxH = big ? 8 + Math.pow(city.pop, 0.3) / 4 : mid ? 6 : 2.5; // Houston ~20 units (2 km real!) — mini-world exaggeration reads well
    const count = Math.min(420, Math.floor(12 + city.pop / 4500));
    const inst = new THREE.InstancedMesh(this.boxGeo, this.buildingMat, count);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    const colors = [0xd8d2c4, 0xbfb8a8, 0xa8b0b8, 0x8f9aa5, 0xcfc4ae, 0x9aa5ad];
    let placed = 0;
    for (let i = 0; i < count * 3 && placed < count; i++) {
      // sample in disc, snap to block grid so buildings sit between streets
      const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * R;
      let lx = Math.cos(a) * rr, lz = Math.sin(a) * rr;
      if (!hasRealStreets) {
        const bx = Math.round(lx / blockSize) * blockSize, bz = Math.round(lz / blockSize) * blockSize;
        lx = bx + (rand() - 0.5) * (blockSize - 2.2);
        lz = bz + (rand() - 0.5) * (blockSize - 2.2);
      } else if (nearestRoad(city.x + lx * cos + lz * sin, city.z - lx * sin + lz * cos, 2)?.dist < 1.3) {
        continue; // real streets: reject building samples that sit on any road
      }
      const distFrac = Math.hypot(lx, lz) / R;
      const falloff = Math.max(0.06, Math.pow(1 - distFrac, 2.2));
      const h = Math.max(0.6, maxH * falloff * (0.35 + rand() * 0.9));
      const w = 0.9 + rand() * 1.6, dep = 0.9 + rand() * 1.6;
      // world position: rotate local by city rot
      const wx = city.x + lx * cos + lz * sin, wz = city.z - lx * sin + lz * cos;
      m4.compose(new THREE.Vector3(wx, hAt(wx, wz) + 0.1, wz), q, new THREE.Vector3(w, h, dep));
      inst.setMatrixAt(placed, m4);
      inst.setColorAt(placed, new THREE.Color(colors[Math.floor(rand() * colors.length)]));
      placed++;
    }
    inst.count = placed;
    group.add(inst);

    // City label — canvas sprite floating above downtown
    group.add(mkLabel(city.name, city.x, padY + maxH + 6, city.z, big ? 1.6 : 1));

    this.scene.add(group);
    this.live.set(city.name, group);
  }
}

// One window pattern painted into two textures: a diffuse facade (light walls,
// cool glass — visible by day, tinted by instance color) and an emissive map
// (black walls, warm lit subset — visible by night). Canvas row 0 is reserved
// for roofs: plain wall in the day map, black in the night map.
function mkFacadeTextures() {
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 128;
    return [c, c.getContext('2d')];
  };
  const [dayC, day] = mk(), [nightC, night] = mk();
  day.fillStyle = '#e8e6e0'; day.fillRect(0, 0, 64, 128);   // wall (takes instance tint)
  night.fillStyle = '#000'; night.fillRect(0, 0, 64, 128);
  const cols = 8, rows = 16;
  for (let y = 1; y < rows; y++) { // row 0 stays plain for roofs
    for (let x = 0; x < cols; x++) {
      const lit = Math.random() > 0.35;
      // day: every window is dark glass
      day.fillStyle = `rgb(${100 + Math.random() * 25},${115 + Math.random() * 25},${135 + Math.random() * 25})`;
      day.fillRect(x * 8 + 2, y * 8 + 2, 4, 4);
      if (!lit) continue;
      // night: the lit subset glows warm
      const warm = 0.55 + Math.random() * 0.45;
      night.fillStyle = `rgb(${Math.round(255 * warm)},${Math.round(205 * warm)},${Math.round(120 * warm)})`;
      night.fillRect(x * 8 + 2, y * 8 + 2, 4, 4);
    }
  }
  const tex = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    return t;
  };
  return { dayTex: tex(dayC), nightTex: tex(nightC) };
}

// BoxGeometry face order: +x -x +y -y +z -z, 4 verts each. Point the top/bottom
// faces (verts 8-15) at the reserved black row so roofs don't glow.
function remapRoofUVs(geo) {
  const uv = geo.attributes.uv;
  for (let i = 8; i < 16; i++) uv.setXY(i, 0.02, 0.99);
  uv.needsUpdate = true;
}

function mkLabel(text, x, y, z, scale) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 7;
  ctx.strokeText(text, 256, 48);
  ctx.fillStyle = '#fff';
  ctx.fillText(text, 256, 48);
  const tex = new THREE.CanvasTexture(c);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.position.set(x, y + 4, z);
  sprite.scale.set(13 * scale, 2.4 * scale, 1);
  return sprite;
}
