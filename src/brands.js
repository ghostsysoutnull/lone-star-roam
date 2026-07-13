// Texas Brands — real roadside institutions rebuilt as parody landmarks at
// their real-world coordinates, proximity-streamed like CitySystem so only
// nearby sites hold geometry. Wave 1: Bucky's (Buc-ee's) travel centers —
// showpiece storefront + beaver-topped sign pylon + instanced fuel canopy +
// highway approach billboards. Wave 2: H-E-Buddy (H-E-B) big-box stores at
// the 33 largest GEO.cities, placed on a city-edge road shoulder + instanced
// lot props. Night glow for both is REAL persistent PointLights (not
// emissive — emissive washes a colored sign toward white), gated on
// ATMOS.night. Scenery only: no gameplay/save/mission/seed-string changes.
//
// Imports geo+sky (site data + night gate), traffic (the tinted/merge
// geometry kit), and — for H-E-Buddy's placement — cities.js (cityRadius)
// and airports.js (airportClear). Cycle-safe: nothing imports brands.js.
// Datacenter audio (wave 3) will arrive as an onHum constructor callback,
// never an import.
import * as THREE from 'three';
import { GEO, seededRand, hAt, nearestRoad } from './geo.js';
import { ATMOS } from './sky.js';
import { tinted, merge } from './traffic.js';
import { cityRadius } from './cities.js';
import { airportClear } from './airports.js';

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
// Night lighting — REAL light sources, not emissive. Emissive glow washes a
// yellow sign to white (it can't stay yellow), so per Bruno's directive
// (2026-07-12) Bucky's is lit at night by a couple of warm PointLights that
// actually illuminate the geometry, keeping colours true. This is the
// walk-mode lantern / truck-headlight precedent (localized dynamic lights the
// player already owns) — NOT a second ambient/sun rig (sky.js still owns
// those). Two lights only, created ONCE and repositioned to the nearest live
// site (adding/removing scene lights at runtime recompiles shaders — the real
// reason for the "no light rig" rule; a persistent pool sidesteps it).
const LIGHT_COLOR = 0xffdca8;                       // warm canopy/sign light
// local (x, y, z) anchors within a site group; transformed to world at spawn
const CANOPY_ANCHOR = [0, 5.6, 9];                  // under the canopy: pumps, soffit, storefront
const SIGN_ANCHOR = [15.5, 14, 18.5];               // in front of the pylon sign face + beaver
const CANOPY_I = 30, CANOPY_R = 50;                 // intensity / range (lantern is 14 @ 22)
const SIGN_I = 16, SIGN_R = 28;

// H-E-Buddy (H-E-B parody) — Wave 2. Palette distinct from Bucky's: cream
// big-box + H-E-B red, not yellow/red.
const HEB_WALL = 0xf0ece0, HEB_RED = 0xc0272d, HEB_RED_DARK = 0x8a1e22;
const HEB_GLASS = 0x8fb0c2, HEB_CANOPY = 0xf7f4ec, HEB_DOCK = 0x55555c;
const HEB_CART = 0xb9bcc0, HEB_CORRAL = 0x707078;
// Same real-light approach as Bucky's (one persistent PointLight, no emissive)
const HEB_SIGN_ANCHOR = [0, 10.0, 9.5];              // the red sign band on the parapet face
const HEB_SIGN_I = 18, HEB_SIGN_R = 30;
// Placement: 33 largest GEO.cities, snapped to the nearest real road just
// outside the downtown footprint (cityRadius) via a seeded angle+radius
// search, then offset further from the road away from downtown so the lot
// clears both the road and the procedural buildings. Dry-run against real
// data (2026-07-12) converges all 33 on the first attempt; the retry loop is
// a safety net for the live airportClear check it can't rehearse offline.
const HEB_COUNT = 33, HEB_MARGIN = 8, HEB_OFF = 24;

export class BrandSystem {
  constructor(scene, { onHum } = {}) {
    this.scene = scene;
    this.onHum = onHum || null; // wave 3 datacenter hum — unused this wave
    this.live = new Map();      // name -> { group, ... }
    this.acc = 0;               // update throttle accumulator

    // Shared materials (one instance across all sites, mirroring cities.js
    // buildingMat). No emissive glow material — night lighting is real lights.
    this.heroMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.propMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

    // Two persistent warm lights (lantern/headlight precedent): created and
    // added ONCE, then repositioned to the nearest live site + faded by night
    // in update(). Never add/remove at runtime (shader recompile hitch).
    this.canopyLight = new THREE.PointLight(LIGHT_COLOR, 0, CANOPY_R, 1.5);
    this.signLight = new THREE.PointLight(LIGHT_COLOR, 0, SIGN_R, 1.5);
    // H-E-Buddy's own persistent light (the red sign band) — same pool, same
    // rule: created once here, repositioned/faded in update(), never added
    // or removed per spawn.
    this.hebSignLight = new THREE.PointLight(LIGHT_COLOR, 0, HEB_SIGN_R, 1.5);
    scene.add(this.canopyLight, this.signLight, this.hebSignLight);

    // Shared prototype geometries (built once, disposed NEVER) — the pump
    // island (instanced per site), the billboard post/frame, and the flat
    // panel each billboard hangs its punny copy on.
    this.pumpGeo = mkPump();
    this.billboardGeo = mkBillboard();
    this.panelGeo = new THREE.PlaneGeometry(5.0, 2.4);
    // Bucky's sign panel — one shared plane + canvas-texture material (the
    // name is identical at all 15 sites, unlike the per-site punny billboards).
    this.buckySignGeo = new THREE.PlaneGeometry(5.0, 3.6);
    this.buckySignMat = new THREE.MeshLambertMaterial({ map: mkBuckySignTex(), side: THREE.DoubleSide });
    // H-E-Buddy lot-prop prototypes (cart corral, cart, light pole).
    this.corralGeo = mkCartCorral();
    this.cartGeo = mkCart();
    this.poleGeo = mkLightPole();
    // H-E-Buddy's sign panel — one shared plane + one shared canvas-texture
    // material (the name is identical at every site, unlike Bucky's per-site
    // punny billboards, so there's no need for a mat-per-copy pool).
    this.hebSignGeo = new THREE.PlaneGeometry(11.5, 2.6);
    this.hebSignMat = new THREE.MeshLambertMaterial({ map: mkHEBSignTex(), side: THREE.DoubleSide });
    this.shared = new Set([
      this.pumpGeo, this.billboardGeo, this.panelGeo, this.buckySignGeo,
      this.corralGeo, this.cartGeo, this.poleGeo, this.hebSignGeo,
    ]);

    // One canvas-texture material per copy string, built once (airports.js
    // sign-atlas pattern) — the billboards actually READ. Never disposed.
    this.billboardMats = BILLBOARD_COPY.map((txt) =>
      new THREE.MeshLambertMaterial({ map: mkSignTex(txt), side: THREE.DoubleSide }));

    // H-E-Buddy sites derive from GEO.cities (unavailable at module load —
    // GEO is loaded before BrandSystem is constructed, so this is safe here).
    this.hebSites = buildHEBSites();
  }

  // proximity spawn/despawn over the small hand-authored list (no grid needed)
  update(px, pz, dt = 0) {
    // night lighting — aim the persistent lights at the NEAREST live site OF
    // EACH BRAND (Bucky's canopy+sign vs. H-E-Buddy's sign are independent
    // pools) and fade by ATMOS.night (read internally, airports.js pattern).
    // Runs every frame (before the spawn throttle) so lights track smoothly.
    const nf = ATMOS.night > NIGHT_ON ? ATMOS.night : 0;
    let nearB = null, bestB = Infinity, nearH = null, bestH = Infinity;
    for (const rec of this.live.values()) {
      if (rec.type === 'heb') {
        const d = (rec.lightAt.sign[0] - px) ** 2 + (rec.lightAt.sign[2] - pz) ** 2;
        if (d < bestH) { bestH = d; nearH = rec; }
      } else {
        const d = (rec.lightAt.canopy[0] - px) ** 2 + (rec.lightAt.canopy[2] - pz) ** 2;
        if (d < bestB) { bestB = d; nearB = rec; }
      }
    }
    if (nearB && nf > 0) {
      this.canopyLight.position.set(...nearB.lightAt.canopy);
      this.signLight.position.set(...nearB.lightAt.sign);
      this.canopyLight.intensity = nf * CANOPY_I;
      this.signLight.intensity = nf * SIGN_I;
    } else {
      this.canopyLight.intensity = 0;
      this.signLight.intensity = 0;
    }
    if (nearH && nf > 0) {
      this.hebSignLight.position.set(...nearH.lightAt.sign);
      this.hebSignLight.intensity = nf * HEB_SIGN_I;
    } else {
      this.hebSignLight.intensity = 0;
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

    // H-E-Buddy sites are keyed 'heb:<name>' — Denton/Temple etc. appear in
    // BOTH tables, so a bare name would collide in `this.live`.
    for (const site of this.hebSites) {
      const key = 'heb:' + site.name;
      const d = Math.hypot(site.x - px, site.z - pz);
      const has = this.live.has(key);
      if (d < SPAWN_DIST && !has) this.spawnHEB(site);
      else if (d > SPAWN_DIST * 1.25 && has) this.despawn(key);
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

    // Hero: storefront + fuel canopy + sign pylon + beaver, one static merged
    // mesh (sign yellow / roofline red / soffit white as plain diffuse — the
    // night lights below make them read, keeping colours true).
    const hero = buildBuckyHero(skirt);
    const staticMesh = new THREE.Mesh(hero.staticGeo, this.heroMat);
    group.add(staticMesh);

    // World positions of the two night-light anchors. Transform the local
    // anchors by the group's Y-rotation with the SAME trig as buildBillboards —
    // group.localToWorld() would read a stale matrixWorld this early (identity
    // until the first render), dropping the lights at the world origin.
    const toWorld = ([lx, ly, lz]) => [
      x + lx * Math.cos(heading) + lz * Math.sin(heading), padY + ly,
      z - lx * Math.sin(heading) + lz * Math.cos(heading),
    ];
    const lightAt = { canopy: toWorld(CANOPY_ANCHOR), sign: toWorld(SIGN_ANCHOR) };

    // Sign panel: the readable "Bucky's" name, mounted just proud of the
    // yellow sign face baked into staticGeo.
    const signPanel = new THREE.Mesh(this.buckySignGeo, this.buckySignMat);
    signPanel.position.set(...hero.signPanelAt);
    group.add(signPanel);

    // The pump islands under the canopy are an InstancedMesh of the prototype.
    const pumps = new THREE.InstancedMesh(this.pumpGeo, this.propMat, hero.pumpXforms.length);
    hero.pumpXforms.forEach((m, i) => pumps.setMatrixAt(i, m));
    pumps.instanceMatrix.needsUpdate = true;
    group.add(pumps);

    // Approach billboards — placed in WORLD space along the nearest freeway,
    // then de-rotated into the group's local frame so grounding stays exact.
    const boards = this.buildBillboards(site, x, z, padY, group, rand);

    this.scene.add(group);
    this.live.set(site.name, { group, staticMesh, pumps, boards, signPanel, lightAt, type: 'bucky' });
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

  // H-E-Buddy site: big-box hero (storefront + red sign band + curved entry
  // canopy + back dock) + instanced lot props (cart corrals, carts, light
  // poles). Same pad/skirt/heading pattern as spawn() (buildBuckyHero).
  spawnHEB(site) {
    const { x, z } = site;
    const rand = seededRand('heblot:' + site.name); // independent of the placement-search stream
    const group = new THREE.Group();

    const road = nearestRoad(x, z, 90) || nearestRoad(x, z, 150);
    const heading = road ? Math.atan2(road.x - x, road.z - z) : 0;

    const fp = footprintRange(x, z);
    const padY = fp.max;
    const skirt = Math.min(8, padY - fp.min + 0.4);
    group.position.set(x, padY, z);
    group.rotation.y = heading;

    const hero = buildHEBHero(skirt);
    const staticMesh = new THREE.Mesh(hero.staticGeo, this.heroMat);
    group.add(staticMesh);

    // Same trig transform as Bucky's — group.localToWorld() would read a
    // stale matrixWorld this early and drop the light at the world origin.
    const toWorld = ([lx, ly, lz]) => [
      x + lx * Math.cos(heading) + lz * Math.sin(heading), padY + ly,
      z - lx * Math.sin(heading) + lz * Math.cos(heading),
    ];
    const lightAt = { sign: toWorld(HEB_SIGN_ANCHOR) };

    // Sign panel: the readable "H-E-Buddy" name, mounted just proud of the
    // red backer baked into staticGeo (a hair further in z to avoid z-fighting).
    const signPanel = new THREE.Mesh(this.hebSignGeo, this.hebSignMat);
    signPanel.position.set(HEB_SIGN_ANCHOR[0], HEB_SIGN_ANCHOR[1], HEB_SIGN_ANCHOR[2] + 0.1);
    group.add(signPanel);

    const lot = buildHEBLot(rand);
    const corrals = new THREE.InstancedMesh(this.corralGeo, this.propMat, lot.corralXforms.length);
    lot.corralXforms.forEach((m, i) => corrals.setMatrixAt(i, m));
    corrals.instanceMatrix.needsUpdate = true;
    group.add(corrals);

    const carts = new THREE.InstancedMesh(this.cartGeo, this.propMat, lot.cartXforms.length);
    lot.cartXforms.forEach((m, i) => carts.setMatrixAt(i, m));
    carts.instanceMatrix.needsUpdate = true;
    group.add(carts);

    const poles = new THREE.InstancedMesh(this.poleGeo, this.propMat, lot.poleXforms.length);
    lot.poleXforms.forEach((m, i) => poles.setMatrixAt(i, m));
    poles.instanceMatrix.needsUpdate = true;
    group.add(poles);

    this.scene.add(group);
    this.live.set('heb:' + site.name, { group, staticMesh, corrals, carts, poles, signPanel, lightAt, type: 'heb' });
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

// Bucky's roadside sign face — the readable name atop the pylon, below the
// beaver. Identical at all 15 sites, so this is built ONCE in the
// constructor (mirrors the billboard atlas idiom, one texture per string —
// here there's only ever one string).
function mkBuckySignTex() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 384;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2c200'; ctx.fillRect(0, 0, c.width, c.height);         // yellow, matches SIGN
  ctx.fillStyle = '#c0392b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = "bold italic 108px 'Georgia', serif";
  ctx.fillText("Bucky's", c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

// H-E-Buddy's sign face — the readable name, identical at every site (unlike
// Bucky's per-site punny copy), so this is built ONCE in the constructor and
// shared across all 33 sites via a single material.
function mkHEBSignTex() {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 144;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c0272d'; ctx.fillRect(0, 0, c.width, c.height);        // H-E-B red
  ctx.strokeStyle = '#f0ece0'; ctx.lineWidth = 10;
  ctx.strokeRect(6, 6, c.width - 12, c.height - 12);                        // cream border
  ctx.fillStyle = '#f7f4ec'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.fillText('H-E-Buddy', c.width / 2, c.height / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

// A greebled low-poly beaver head — the at-a-distance recognizer atop the sign
// pylon. Sphere head, box cap/muzzle, two box buck teeth, disc eyes + nose.
// cx/cy/cz = head center; parts face +z (toward the road, the group's front).
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

// Bucky's hero — long storefront + red roofline + storefront windows, a wide
// fuel canopy (white soffit + red fascia) over N pump islands, and a tall
// roadside sign pylon topped by the beaver. One static merged geometry (plain
// diffuse colours — the two night PointLights illuminate it) plus the pump
// transforms. Built in the group's LOCAL frame: origin at pad center, ground
// y = 0, +z = toward the road (the group is rotated so its front faces it).
function buildBuckyHero(skirt = 0.4) {
  const s = []; // all parts merge into one static mesh

  // --- foundation lot slab: a raised concrete pad drawn DOWN to below the lot
  // terrain minimum so no corner floats on real relief (the airport skirt) ---
  s.push(tinted(new THREE.BoxGeometry(34, skirt + 0.4, 35).translate(0, -skirt / 2 + 0.2, 3), 0x9c968a));

  // --- storefront (set back from the road, long axis along local x) ---
  s.push(tinted(new THREE.BoxGeometry(26, 5.2, 11).translate(0, 2.6, -7), WALL));         // main box
  s.push(tinted(new THREE.BoxGeometry(27, 0.6, 12).translate(0, 5.2, -7), 0xdedad0));     // roof slab
  s.push(tinted(new THREE.BoxGeometry(27.2, 0.8, 0.6).translate(0, 4.9, -1.3), TRIM));   // red roofline band (glows red)
  s.push(tinted(new THREE.BoxGeometry(24, 2.6, 0.3).translate(0, 1.9, -1.35), 0xffe6b8)); // lit storefront windows
  for (let i = -5; i <= 5; i++) // window mullions break up the band so it reads as windows
    s.push(tinted(new THREE.BoxGeometry(0.35, 2.8, 0.36).translate(i * 2.3, 1.9, -1.33), 0x6a6660));
  // entry parapet — the raised centerpiece, with a lit sign band
  s.push(tinted(new THREE.BoxGeometry(7, 2.2, 1.4).translate(0, 6.0, -1.6), WALL));
  s.push(tinted(new THREE.BoxGeometry(7.4, 0.5, 1.6).translate(0, 7.2, -1.6), TRIM));    // parapet cap (glows red)
  s.push(tinted(new THREE.BoxGeometry(5.6, 1.1, 0.3).translate(0, 6.1, -0.85), 0xffe6b8)); // lit entry sign band
  // a couple of side pilasters for greeble
  for (const px of [-12.6, 12.6]) s.push(tinted(new THREE.BoxGeometry(0.9, 5.2, 0.9).translate(px, 2.6, -1.4), 0xcfc8ba));

  // --- fuel canopy (toward the road): glowing white soffit + red fascia ---
  const CZ = 12, CW = 30, CD = 13; // canopy center-z, width(x), depth(z)
  s.push(tinted(new THREE.BoxGeometry(CW, 0.7, CD).translate(0, 6.3, CZ), CANOPY));        // canopy deck
  s.push(tinted(new THREE.BoxGeometry(CW + 0.6, 0.5, CD + 0.6).translate(0, 6.7, CZ), TRIM)); // red fascia band (glows red)
  s.push(tinted(new THREE.BoxGeometry(CW - 0.6, 0.14, CD - 0.6).translate(0, 5.9, CZ), 0xfff4e2)); // glowing white soffit
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
  s.push(tinted(new THREE.BoxGeometry(5.6, 4.2, 0.5).translate(SX, 14.6, SZ + 0.65), SIGN)); // glowing yellow sign face
  s.push(tinted(new THREE.BoxGeometry(5.6, 0.6, 0.55).translate(SX, 12.6, SZ + 0.66), TRIM)); // sign underline (glows red)
  for (const p of beaverParts(SX, 18.4, SZ + 0.2)) s.push(p);

  // the readable name is a textured panel mounted just proud of the yellow
  // face (spawn() places it — same pattern as H-E-Buddy's sign panel).
  const signPanelAt = [SX, 14.6, SZ + 0.95];

  return { staticGeo: merge(s), pumpXforms, signPanelAt };
}

// ----------------------------------------------------------- H-E-Buddy (W2)
// Site table: 33 largest GEO.cities, each snapped to the nearest real road
// just outside its downtown footprint. A seeded angle + growing radius picks
// a candidate direction; nearestRoad snaps it to pavement; the final spot is
// offset further from the road AWAY from the city center (clears both the
// road and the procedural downtown). Rejected on either downtown overlap or
// an airport footprint — retries with a wider radius, matching the roadShoulder
// idiom in npcs.js (mirrored here rather than imported: that function is
// module-private and this table's shape — reject-and-retry over many sites —
// doesn't fit a single-point helper).
function buildHEBSites() {
  const top = [...GEO.cities].sort((a, b) => b.pop - a.pop).slice(0, HEB_COUNT);
  const sites = [];
  for (const city of top) {
    const R = cityRadius(city.pop);
    const rand = seededRand('heb:' + city.name);
    let spot = null;
    for (let attempt = 0; attempt < 12 && !spot; attempt++) {
      const a = rand() * Math.PI * 2;
      const rr = R + 40 + attempt * 20; // push further out each retry
      const cx = city.x + Math.cos(a) * rr, cz = city.z + Math.sin(a) * rr;
      const road = nearestRoad(cx, cz, 300);
      if (!road) continue;
      const awayX = road.x - city.x, awayZ = road.z - city.z; // road point, relative to downtown
      const dAway = Math.hypot(awayX, awayZ) || 1;
      const ox = awayX / dAway, oz = awayZ / dAway;
      const x = road.x + ox * HEB_OFF, z = road.z + oz * HEB_OFF; // set back from the road, away from downtown
      if (Math.hypot(x - city.x, z - city.z) < R + HEB_MARGIN) continue; // still overlaps downtown
      if (!airportClear(x, z)) continue;
      spot = { x, z };
    }
    if (spot) sites.push({ name: city.name, x: spot.x, z: spot.z });
  }
  return sites;
}

// Shared cart-corral prototype — 4 posts + top/bottom rail, a low fenced
// rectangle carts get parked inside. Built once, instanced per site.
function mkCartCorral() {
  const hw = 1.6, hd = 0.8, ph = 0.9; // half-width, half-depth, post height
  const parts = [];
  for (const [px, pz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]])
    parts.push(tinted(new THREE.CylinderGeometry(0.05, 0.05, ph, 6).translate(px, ph / 2, pz), HEB_CORRAL));
  parts.push(tinted(new THREE.BoxGeometry(hw * 2 + 0.1, 0.06, 0.06).translate(0, ph, -hd), HEB_CORRAL));
  parts.push(tinted(new THREE.BoxGeometry(hw * 2 + 0.1, 0.06, 0.06).translate(0, ph, hd), HEB_CORRAL));
  parts.push(tinted(new THREE.BoxGeometry(0.06, 0.06, hd * 2 + 0.1).translate(-hw, ph, 0), HEB_CORRAL));
  parts.push(tinted(new THREE.BoxGeometry(0.06, 0.06, hd * 2 + 0.1).translate(hw, ph, 0), HEB_CORRAL));
  return merge(parts);
}

// Shared cart prototype — abstracted low-poly shopping cart: basket box,
// handle bar, two wheels. Instanced in small clusters inside each corral.
function mkCart() {
  return merge([
    tinted(new THREE.BoxGeometry(0.5, 0.5, 0.85).translate(0, 0.5, 0), HEB_CART),        // basket
    tinted(new THREE.BoxGeometry(0.5, 0.06, 0.06).translate(0, 0.78, -0.46), HEB_CORRAL), // handle bar
    tinted(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 8).rotateZ(Math.PI / 2).translate(-0.2, 0.1, 0.38), 0x2a2a30), // wheel L
    tinted(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 8).rotateZ(Math.PI / 2).translate(0.2, 0.1, 0.38), 0x2a2a30),  // wheel R
  ]);
}

// Shared lot light-pole prototype — tall pole + a boxy fixture head.
function mkLightPole() {
  return merge([
    tinted(new THREE.CylinderGeometry(0.1, 0.13, 6.0, 6).translate(0, 3.0, 0), POLE),
    tinted(new THREE.BoxGeometry(0.6, 0.3, 0.6).translate(0, 6.05, 0), 0xdddddd),
  ]);
}

// Per-site lot layout: 3 cart corrals (each with a small cluster of carts)
// scattered across the parking apron, 6 light poles around its perimeter.
// Seeded off `rand` (heblot:<name>, independent of the placement-search
// stream so retries there never reshuffle this layout).
function buildHEBLot(rand) {
  const corralXforms = [], cartXforms = [], poleXforms = [];
  const m4 = new THREE.Matrix4();
  const corralSpots = [[-14, 16], [14, 16], [0, 20]]; // front apron, toward the road (+z)
  for (const [cx, cz] of corralSpots) {
    const rot = rand() * 0.6 - 0.3;
    corralXforms.push(m4.clone().makeRotationY(rot).setPosition(cx, 0, cz));
    for (let i = 0; i < 4; i++) {
      const jx = (rand() - 0.5) * 2.0, jz = (rand() - 0.5) * 0.8;
      cartXforms.push(m4.clone().makeRotationY(rand() * Math.PI * 2).setPosition(cx + jx, 0, cz + jz));
    }
  }
  const poleSpots = [[-18, 10], [18, 10], [-18, 22], [18, 22], [-9, 24], [9, 24]];
  for (const [px, pz] of poleSpots) poleXforms.push(m4.clone().makeTranslation(px, 0, pz));
  return { corralXforms, cartXforms, poleXforms };
}

// H-E-Buddy hero — big-box storefront with a raised entry parapet carrying
// the red "H-E-Buddy" sign band (a red backer frame baked into the merged
// static geo, with the readable name itself a canvas-texture panel mounted
// in spawnHEB — see hebSignGeo/hebSignMat), a curved quarter-round entry
// canopy, and a back loading dock. Local frame matches Bucky's: pad center
// origin, +z toward the road.
function buildHEBHero(skirt = 0.4) {
  const s = [];

  // --- foundation slab, drawn down to the lot minimum (airport-skirt idiom) ---
  s.push(tinted(new THREE.BoxGeometry(44, skirt + 0.4, 26).translate(0, -skirt / 2 + 0.2, -1), 0x9c968a));

  // --- main big-box (wide, set back from the road at local -z..+z) ---
  s.push(tinted(new THREE.BoxGeometry(38, 8.5, 20).translate(0, 4.25, -2), HEB_WALL));       // main box
  s.push(tinted(new THREE.BoxGeometry(38.6, 0.6, 20.6).translate(0, 8.5, -2), 0xdedad0));    // roof cap
  s.push(tinted(new THREE.BoxGeometry(38.8, 0.7, 0.5).translate(0, 8.1, 8.05), HEB_RED));    // red roofline band (lit at night)
  s.push(tinted(new THREE.BoxGeometry(30, 3.0, 0.3).translate(0, 2.4, 8.05), HEB_GLASS));    // storefront glazing
  for (let i = -6; i <= 6; i++) // mullions break the glazing band up so it reads as windows
    s.push(tinted(new THREE.BoxGeometry(0.32, 3.2, 0.34).translate(i * 2.3, 2.4, 8.06), 0x6a6660));

  // --- entry parapet: the raised centerpiece carrying the sign band ---
  s.push(tinted(new THREE.BoxGeometry(16, 3.0, 1.6).translate(0, 10.0, 8.4), HEB_WALL));
  s.push(tinted(new THREE.BoxGeometry(16.4, 0.4, 1.8).translate(0, 11.7, 8.4), HEB_RED));    // parapet cap (lit at night)

  // sign band: red backer frame — the readable name is a textured panel
  // mounted on top of this in spawnHEB (this.hebSignGeo/hebSignMat).
  s.push(tinted(new THREE.BoxGeometry(13, 3.0, 0.35).translate(0, 10.0, 9.25), HEB_RED_DARK)); // backer (lit at night)
  s.push(tinted(new THREE.BoxGeometry(13.4, 0.3, 0.18).translate(0, 8.05, 9.2), HEB_RED));   // sign underline (lit at night)

  // --- curved entry canopy: quarter-round barrel over the entrance doors
  // (the glazing band, y 0.9-3.9), well BELOW the parapet/sign band (y
  // 8.5-11.5) — a taller mountY/R here reaches up into the sign band's own
  // space and visually blocks it (shipped-then-caught regression: mountY=6.6,
  // R=4.0 put the canopy's peak at y=10.6, cutting right through the sign).
  // CylinderGeometry's axis is Y by default; rotateZ(90°) maps it to local X
  // (canopy spans the entrance width), and thetaStart=0/thetaLength=PI/2
  // keeps only the arc quadrant from "straight up at the wall" to "level,
  // projecting outward" — the scoop. ---
  const R = 3.4, mountY = 3.6, wallZ = 8.05; // top reach = mountY+R = 7.0, clear of the sign at y >= 8.5
  const canopyGeo = new THREE.CylinderGeometry(R, R, 11, 12, 1, true, 0, Math.PI / 2).rotateZ(Math.PI / 2);
  canopyGeo.translate(0, mountY, wallZ);
  s.push(tinted(canopyGeo, HEB_CANOPY));
  s.push(tinted(new THREE.BoxGeometry(11, 0.2, 0.2).translate(0, mountY + R, wallZ), HEB_RED)); // canopy edge trim at the wall

  // --- back loading dock (opposite the road-facing side) ---
  s.push(tinted(new THREE.BoxGeometry(10, 1.2, 3).translate(0, 0.6, -13.5), 0x9c968a));       // dock platform
  s.push(tinted(new THREE.BoxGeometry(11, 0.3, 4).translate(0, 3.4, -13.5), HEB_DOCK));       // dock canopy
  for (const dx of [-4, 0, 4])
    s.push(tinted(new THREE.BoxGeometry(2.6, 3.0, 0.25).translate(dx, 1.5, -12.05), HEB_DOCK)); // roll-up doors

  return { staticGeo: merge(s) };
}
