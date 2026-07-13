// Texas Brands — real roadside institutions rebuilt as parody landmarks at
// their real-world coordinates, proximity-streamed like CitySystem so only
// nearby sites hold geometry. Wave 1: Bucky's (Buc-ee's) travel centers —
// showpiece storefront + beaver-topped sign pylon + instanced fuel canopy +
// highway approach billboards, night-lit via emissive meshes gated on
// ATMOS.night (no new light rig — the airport-beacon pattern). Scenery only:
// no gameplay/save/mission/seed-string changes.
//
// Imports geo+sky (site data + night gate) and traffic (the tinted/merge
// geometry kit) — cycle-safe because nothing imports brands, matching the
// rotors.js precedent. Datacenter audio (wave 3) will arrive as an onHum
// constructor callback, never an import.
import * as THREE from 'three';
import { seededRand, hAt, nearestRoad } from './geo.js';
import { ATMOS } from './sky.js';
import { tinted, merge } from './traffic.js';

const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];

const SPAWN_DIST = 700;      // bigger footprints than cities — hold geometry sooner
const NIGHT_ON = 0.25;       // ATMOS.night threshold for the signage glow (airports.js)

// Bucky's — 15 real Buc-ee's travel centers (OSM brand="Buc-ee's", 2026-07).
// New Braunfels uses the store's own OSM node, ~14 units off the existing
// beaver-kind collectible landmark in gameplay.js, so the two never overlap.
const BUCKY_SITES = [
  { name: 'Luling', at: LL(29.6507, -97.5935) },
  { name: 'New Braunfels', at: LL(29.7269, -98.0779) }, // the original (2003)
  { name: 'Bastrop', at: LL(30.1071, -97.3058) },
  { name: 'Baytown', at: LL(29.8008, -94.9999) },
  { name: 'Katy', at: LL(29.7787, -95.8475) },
  { name: 'Texas City', at: LL(29.4284, -95.0632) },
  { name: 'Terrell', at: LL(32.7167, -96.3212) },
  { name: 'Temple', at: LL(31.1364, -97.3293) },
  { name: 'Denton', at: LL(33.1793, -97.1026) },
  { name: 'Melissa', at: LL(33.2713, -96.5923) },
  { name: 'Royse City', at: LL(32.9792, -96.2953) },
  { name: 'Ennis', at: LL(32.3232, -96.6066) },
  { name: 'Waller', at: LL(30.0715, -95.9321) },
  { name: 'Madisonville', at: LL(30.9652, -95.8807) },
  { name: 'Northlake', at: LL(33.0242, -97.2784) }, // Fort Worth-area (Alliance)
];

// Approach-billboard copy pool — a seeded pick per site (brandsign: stream,
// additive, touches no existing RNG). Buc-ee's is famous for exactly this.
const BILLBOARD_COPY = [
  'HOLD IT.\nBucky’s ahead',
  'CLEANEST\nRESTROOMS\nin Texas',
  'BEAVER NUGGETS\nnext exit',
  '120 FUEL PUMPS\nno waiting',
  'THIS IS YOUR\nEXIT, y’all',
  'BRISKET &\nBEAVER NUGGETS',
];

// palette
const WALL = 0xe8e2d4, ROOF = 0x9a3b2e, TRIM = 0xc0392b, POLE = 0x3a3a40;
const SIGN = 0xf2c200, BEAVER = 0x8a5a34, TEETH = 0xfaf3e0, GLASS = 0x9fb8c8;
const CANOPY = 0xf4f1ea, ASPHALT = 0x3f3f46, PUMP = 0xdddddd;
// Night glow, in two colors so the store reads as actually LIT rather than a
// dark box with one faint warm patch: a bright warm-white for the big lit
// surfaces (canopy soffit, storefront windows, sign, beaver) and a saturated
// brand red for the roofline/fascia/sign trim. The red channel is what keeps
// it from washing to plain white — coverage + color together sell "lit".
const GLOW = 0xfff0d8, GLOW_RED = 0xff3a1e;
const GLOW_EI = 1.3;     // below ~1.0 the glow reads as a faint tint, not lit

export class BrandSystem {
  constructor(scene, { onHum } = {}) {
    this.scene = scene;
    this.onHum = onHum || null; // wave 3 datacenter hum — unused this wave
    this.live = new Map();      // name -> { group, ... }
    this.acc = 0;               // update throttle accumulator

    // Shared materials (one instance across all sites, mirroring cities.js
    // buildingMat) — the two glow materials' emissiveIntensity is the single
    // knob toggled by ATMOS.night in update() (warm-white + brand red).
    this.heroMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.glowMat = new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true, emissive: GLOW, emissiveIntensity: 0,
    });
    this.glowRedMat = new THREE.MeshLambertMaterial({
      vertexColors: true, flatShading: true, emissive: GLOW_RED, emissiveIntensity: 0,
    });
    this.propMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

    // Shared prototype geometries (built once, disposed NEVER) — the pump
    // island (instanced per site), the billboard post/frame, and the flat
    // panel each billboard hangs its punny copy on.
    this.pumpGeo = mkPump();
    this.billboardGeo = mkBillboard();
    this.panelGeo = new THREE.PlaneGeometry(5.0, 2.4);
    this.shared = new Set([this.pumpGeo, this.billboardGeo, this.panelGeo]);

    // One canvas-texture material per copy string, built once (airports.js
    // sign-atlas pattern) — the billboards actually READ. Never disposed.
    this.billboardMats = BILLBOARD_COPY.map((txt) =>
      new THREE.MeshLambertMaterial({ map: mkSignTex(txt), side: THREE.DoubleSide }));

    this.night = -1; // force first setNight
  }

  // proximity spawn/despawn over the small hand-authored list (no grid needed)
  update(px, pz, dt = 0) {
    // signage glow — read ATMOS internally (airports.js pattern), no main.js hook
    const lit = ATMOS.night > NIGHT_ON ? GLOW_EI : 0;
    if (lit !== this.night) {
      this.glowMat.emissiveIntensity = lit;
      this.glowRedMat.emissiveIntensity = lit;
      this.night = lit;
    }

    this.acc += dt;
    if (this.acc < 0.25 && dt) return; // ~4 Hz is plenty for 700-unit spawn rings
    this.acc = 0;

    for (const site of BUCKY_SITES) {
      const d = Math.hypot(site.at[0] - px, site.at[1] - pz);
      const has = this.live.has(site.name);
      if (d < SPAWN_DIST && !has) this.spawn(site);
      else if (d > SPAWN_DIST * 1.25 && has) this.despawn(site.name);
    }
  }

  spawn(site) {
    const [x, z] = site.at;
    const rand = seededRand('bucky:' + site.name);
    const group = new THREE.Group();

    // Face the store toward the nearest sizeable road so it fronts the highway.
    const road = nearestRoad(x, z, 90, (t) => t === 'motorway' || t === 'trunk' || t === 'primary')
      || nearestRoad(x, z, 120);
    const heading = road ? Math.atan2(road.x - x, road.z - z) : 0;

    // Pad at the MAX terrain height under the lot (airport-pad pattern) so a
    // sloped site never floats a corner; a foundation skirt drawn down below
    // the lot MIN hides the lip (brand sites aren't pad-flattened).
    const fp = footprintRange(x, z);
    const padY = fp.max;
    const skirt = Math.min(8, padY - fp.min + 0.4); // cap so steep sites don't wall up absurdly
    group.position.set(x, padY, z);
    group.rotation.y = heading;

    // Hero: storefront + sign pylon + beaver, split into three merged meshes —
    // non-glow (heroMat), warm-white glow (soffit/windows/sign/beaver), and
    // brand-red glow (roofline/fascia/sign trim).
    const hero = buildBuckyHero(skirt);
    const staticMesh = new THREE.Mesh(hero.staticGeo, this.heroMat);
    const glowMesh = new THREE.Mesh(hero.glowGeo, this.glowMat);
    const glowRedMesh = new THREE.Mesh(hero.glowRedGeo, this.glowRedMat);
    group.add(staticMesh, glowMesh, glowRedMesh);

    // Fuel canopy soffit glows too — it's part of hero.glowGeo above. The
    // pump islands under it are an InstancedMesh of the shared prototype.
    const pumps = new THREE.InstancedMesh(this.pumpGeo, this.propMat, hero.pumpXforms.length);
    hero.pumpXforms.forEach((m, i) => pumps.setMatrixAt(i, m));
    pumps.instanceMatrix.needsUpdate = true;
    group.add(pumps);

    // Approach billboards — placed in WORLD space along the nearest freeway,
    // then de-rotated into the group's local frame so grounding stays exact.
    const boards = this.buildBillboards(site, x, z, padY, group, rand);

    this.scene.add(group);
    this.live.set(site.name, { group, glowMesh, glowRedMesh, staticMesh, pumps, boards });
  }

  // Billboards live along the highway well back from the store — each samples
  // its own hAt (they spread across terrain) and faces the road. Returns the
  // count for the verify suite; posts are parented to `group` (local frame).
  buildBillboards(site, x, z, padY, group, rand) {
    const road = nearestRoad(x, z, 200, (t) => t === 'motorway' || t === 'trunk');
    if (!road) return [];
    const base = Math.floor(rand() * BILLBOARD_COPY.length); // stable seeded campaign start
    const posts = [];
    const inv = new THREE.Matrix4().makeRotationY(-group.rotation.y);
    // step back along the road tangent from the nearest point, alternating sides
    for (let i = 0; i < 4; i++) {
      const back = 40 + i * 45;                     // 40..175 units up the road
      const wx = road.x + road.tx * back * (i % 2 ? -1 : 1);
      const wz = road.z + road.tz * back * (i % 2 ? -1 : 1);
      // shoulder offset (perpendicular to the tangent)
      const ox = -road.tz * 3.5, oz = road.tx * 3.5;
      const bx = wx + ox, bz = wz + oz;
      const by = footprintMaxH(bx, bz, 1);
      // world position → group-local (group is at x,z,padY rotated by heading)
      const local = new THREE.Vector3(bx - x, by - padY, bz - z).applyMatrix4(inv);
      const faceWorld = Math.atan2(road.tz, road.tx) + Math.PI / 2; // billboard +z faces the road
      const bg = new THREE.Group();
      bg.position.copy(local);
      bg.rotation.y = faceWorld - group.rotation.y;
      const frame = new THREE.Mesh(this.billboardGeo, this.propMat);
      const copy = (base + i) % BILLBOARD_COPY.length; // each sign a different pun, stable
      const panel = new THREE.Mesh(this.panelGeo, this.billboardMats[copy]);
      panel.position.set(0, 6.0, 0.16); // just proud of the dark backer
      bg.add(frame, panel);
      group.add(bg);
      posts.push({ mesh: bg, panel, wx: bx, wz: bz, copy });
    }
    return posts;
  }

  despawn(name) {
    const rec = this.live.get(name);
    this.scene.remove(rec.group);
    rec.group.traverse((o) => {
      if (o.geometry && !this.shared.has(o.geometry)) o.geometry.dispose();
    });
    this.live.delete(name);
  }
}

// -------------------------------------------------------------- geometry kit
// Max terrain height over a square footprint (airport-pad idiom) so a sloped
// site never floats — sample center + the four corners of a `r`-radius square.
function footprintMaxH(x, z, r) {
  let y = hAt(x, z);
  for (const [dx, dz] of [[-r, -r], [r, -r], [-r, r], [r, r]]) y = Math.max(y, hAt(x + dx, z + dz));
  return y;
}

// Terrain min/max over the whole Bucky's lot (a 3×5 grid across ±hx by ±hz in
// LOCAL frame, so the +z road-facing canopy/sign side is covered too). The pad
// sits at max; the foundation skirt is drawn down to below min so no lot corner
// floats on real Hill-Country relief (brand sites are NOT pad-flattened).
function footprintRange(x, z, r = 20) {
  let min = Infinity, max = -Infinity;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const h = hAt(x + i * r, z + j * r);
    if (h < min) min = h; if (h > max) max = h;
  }
  return { min, max };
}

// Shared pump-island prototype (heli-tier greebles): base + dispenser + two
// hose bollards + topper. Built once, instanced per site, disposed never.
function mkPump() {
  return merge([
    tinted(new THREE.BoxGeometry(1.2, 0.15, 2.4).translate(0, 0.075, 0), 0x2a2a30), // island curb
    tinted(new THREE.BoxGeometry(0.5, 1.0, 0.9).translate(0, 0.65, 0), PUMP),        // dispenser
    tinted(new THREE.BoxGeometry(0.42, 0.3, 0.7).translate(0, 1.25, 0), 0x333338),   // display head
    tinted(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 6).translate(-0.35, 0.55, 0.55), 0x222226),
    tinted(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 6).translate(0.35, 0.55, -0.55), 0x222226),
  ]);
}

// Shared billboard prototype — twin posts + a dark backer + trim frame. The
// punny copy is a separate textured panel hung just in front (buildBillboards).
function mkBillboard() {
  return merge([
    tinted(new THREE.BoxGeometry(0.3, 5.5, 0.3).translate(-1.6, 2.75, 0), POLE),
    tinted(new THREE.BoxGeometry(0.3, 5.5, 0.3).translate(1.6, 2.75, 0), POLE),
    tinted(new THREE.BoxGeometry(5.4, 2.8, 0.2).translate(0, 6.0, 0), 0x222226),   // dark backer
    tinted(new THREE.BoxGeometry(5.6, 0.3, 0.28).translate(0, 7.45, 0.04), TRIM),  // top trim
    tinted(new THREE.BoxGeometry(5.6, 0.3, 0.28).translate(0, 4.55, 0.04), TRIM),  // bottom trim
  ]);
}

// A punny approach-billboard face: Buc-ee's yellow ground, red border, bold
// dark copy (multi-line on \n). Built once per copy string in the constructor.
function mkSignTex(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 246;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2c200'; ctx.fillRect(0, 0, c.width, c.height);          // yellow
  ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 16;
  ctx.strokeRect(8, 8, c.width - 16, c.height - 16);                          // red border
  ctx.fillStyle = '#1a1a1a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines = text.split('\n');
  const lh = 62, y0 = c.height / 2 - (lines.length - 1) * lh / 2;
  lines.forEach((ln, i) => {
    ctx.font = `bold ${ln.length > 12 ? 40 : 52}px system-ui, sans-serif`;
    ctx.fillText(ln, c.width / 2, y0 + i * lh);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

// A greebled low-poly beaver head — the at-a-distance recognizer atop the sign
// pylon. Sphere head, box cap/muzzle, two box buck teeth, disc eyes + nose.
// All parts return into the GLOW array (warm emissive at night). cx/cy/cz =
// head center; parts face +z (toward the road, the group's front).
function beaverParts(cx, cy, cz) {
  const s = 1.0; // overall scale
  return [
    tinted(new THREE.SphereGeometry(1.2 * s, 10, 8).translate(cx, cy, cz), BEAVER),          // head
    tinted(new THREE.BoxGeometry(1.7 * s, 0.5 * s, 1.7 * s).translate(cx, cy + 1.05 * s, cz), 0x5a3a20), // flat cap brim
    tinted(new THREE.BoxGeometry(1.0 * s, 0.7 * s, 1.0 * s).translate(cx, cy + 1.5 * s, cz), TRIM),      // red cap crown
    tinted(new THREE.BoxGeometry(1.1 * s, 0.7 * s, 0.5 * s).translate(cx, cy - 0.35 * s, cz + 1.05 * s), 0xa06a40), // muzzle
    tinted(new THREE.BoxGeometry(0.34 * s, 0.55 * s, 0.2 * s).translate(cx - 0.22 * s, cy - 0.75 * s, cz + 1.35 * s), TEETH), // tooth L
    tinted(new THREE.BoxGeometry(0.34 * s, 0.55 * s, 0.2 * s).translate(cx + 0.22 * s, cy - 0.75 * s, cz + 1.35 * s), TEETH), // tooth R
    tinted(new THREE.CylinderGeometry(0.26 * s, 0.26 * s, 0.12 * s, 8).rotateX(Math.PI / 2).translate(cx - 0.5 * s, cy + 0.25 * s, cz + 1.05 * s), 0x161616), // eye L
    tinted(new THREE.CylinderGeometry(0.26 * s, 0.26 * s, 0.12 * s, 8).rotateX(Math.PI / 2).translate(cx + 0.5 * s, cy + 0.25 * s, cz + 1.05 * s), 0x161616), // eye R
    tinted(new THREE.SphereGeometry(0.28 * s, 8, 6).translate(cx, cy - 0.1 * s, cz + 1.4 * s), 0x201010), // nose
    tinted(new THREE.CylinderGeometry(0.13 * s, 0.16 * s, 0.9 * s, 6).translate(cx - 0.9 * s, cy + 0.75 * s, cz), BEAVER),  // ear L
    tinted(new THREE.CylinderGeometry(0.13 * s, 0.16 * s, 0.9 * s, 6).translate(cx + 0.9 * s, cy + 0.75 * s, cz), BEAVER),  // ear R
  ];
}

// Bucky's hero — long storefront + lit red roofline + glowing storefront
// windows, a wide fuel canopy (glowing soffit + red fascia) over N pump
// islands, and a tall roadside sign pylon topped by the beaver. Returns three
// merged geometries — static, warm-white glow (gw: soffit, windows, sign,
// beaver), brand-red glow (gr: roofline, fascia, sign trim) — plus the pump
// transforms. Built in the group's LOCAL frame: origin at pad center, ground
// y = 0, +z = toward the road (the group is rotated so its front faces it).
function buildBuckyHero(skirt = 0.4) {
  const s = [], gw = [], gr = []; // static / warm-glow / red-glow part arrays

  // --- foundation lot slab: a raised concrete pad drawn DOWN to below the lot
  // terrain minimum so no corner floats on real relief (the airport skirt) ---
  s.push(tinted(new THREE.BoxGeometry(34, skirt + 0.4, 35).translate(0, -skirt / 2 + 0.2, 3), 0x9c968a));

  // --- storefront (set back from the road, long axis along local x) ---
  s.push(tinted(new THREE.BoxGeometry(26, 5.2, 11).translate(0, 2.6, -7), WALL));         // main box
  s.push(tinted(new THREE.BoxGeometry(27, 0.6, 12).translate(0, 5.2, -7), 0xdedad0));     // roof slab
  gr.push(tinted(new THREE.BoxGeometry(27.2, 0.8, 0.6).translate(0, 4.9, -1.3), TRIM));   // red roofline band (glows red)
  gw.push(tinted(new THREE.BoxGeometry(24, 2.6, 0.3).translate(0, 1.9, -1.35), 0xffe6b8)); // lit storefront windows
  for (let i = -5; i <= 5; i++) // window mullions break up the band so it reads as windows
    s.push(tinted(new THREE.BoxGeometry(0.35, 2.8, 0.36).translate(i * 2.3, 1.9, -1.33), 0x6a6660));
  // entry parapet — the raised centerpiece, with a lit sign band
  s.push(tinted(new THREE.BoxGeometry(7, 2.2, 1.4).translate(0, 6.0, -1.6), WALL));
  gr.push(tinted(new THREE.BoxGeometry(7.4, 0.5, 1.6).translate(0, 7.2, -1.6), TRIM));    // parapet cap (glows red)
  gw.push(tinted(new THREE.BoxGeometry(5.6, 1.1, 0.3).translate(0, 6.1, -0.85), 0xffe6b8)); // lit entry sign band
  // a couple of side pilasters for greeble
  for (const px of [-12.6, 12.6]) s.push(tinted(new THREE.BoxGeometry(0.9, 5.2, 0.9).translate(px, 2.6, -1.4), 0xcfc8ba));

  // --- fuel canopy (toward the road): glowing white soffit + red fascia ---
  const CZ = 12, CW = 30, CD = 13; // canopy center-z, width(x), depth(z)
  s.push(tinted(new THREE.BoxGeometry(CW, 0.7, CD).translate(0, 6.3, CZ), CANOPY));        // canopy deck
  gr.push(tinted(new THREE.BoxGeometry(CW + 0.6, 0.5, CD + 0.6).translate(0, 6.7, CZ), TRIM)); // red fascia band (glows red)
  gw.push(tinted(new THREE.BoxGeometry(CW - 0.6, 0.14, CD - 0.6).translate(0, 5.9, CZ), 0xfff4e2)); // glowing white soffit
  for (const cx of [-13, 0, 13]) for (const cz of [CZ - 5, CZ + 5]) // support columns
    s.push(tinted(new THREE.CylinderGeometry(0.35, 0.4, 6.0, 8).translate(cx, 3.0, cz), 0xb8b2a6));

  // --- pump islands under the canopy (instanced prototype; 2 rows × 6) ---
  const pumpXforms = [];
  const m4 = new THREE.Matrix4();
  for (const rz of [CZ - 3.2, CZ + 3.2]) for (let i = -2.5; i <= 2.5; i += 1) {
    pumpXforms.push(m4.clone().makeTranslation(i * 4.2, 0, rz));
  }

  // --- roadside sign pylon topped by the beaver ---
  const SX = 15.5, SZ = CZ + 4; // right-front, out toward the road
  s.push(tinted(new THREE.CylinderGeometry(0.45, 0.55, 15, 10).translate(SX, 7.5, SZ), POLE));
  s.push(tinted(new THREE.BoxGeometry(6.2, 0.4, 1.2).translate(SX, 13.2, SZ), 0x2a2a30));  // sign backer top
  gw.push(tinted(new THREE.BoxGeometry(5.6, 4.2, 0.5).translate(SX, 14.6, SZ + 0.65), SIGN)); // glowing yellow sign face
  gr.push(tinted(new THREE.BoxGeometry(5.6, 0.6, 0.55).translate(SX, 12.6, SZ + 0.66), TRIM)); // sign underline (glows red)
  for (const p of beaverParts(SX, 18.4, SZ + 0.2)) gw.push(p);

  return { staticGeo: merge(s), glowGeo: merge(gw), glowRedGeo: merge(gr), pumpXforms };
}
