// The Shoulder (SHOULDER_SHELF_SPEC.md W6a east + W6b west): the state line
// as a place. East: Neutral Ground swamp vignettes off I-10, the Texarkana
// straddle, the WinBig lot full of Texas plates, granite welcome monuments
// at every derived road crossing, and the seven Corner Stones. West: the
// Texola ruins, Glenrio's two-faced motel sign, the Texhoma elevators,
// Anthony's leap-year banner, and the Carlsbad doorstep (zero cave content).
// Everything is static, built once at boot (airports.js idiom) from
// GEO.border + GEO.bandHighways — no streaming, no per-frame geometry.
import * as THREE from 'three';
import { GEO, hAt, inTexas, neighborCountyAt, seededRand } from './geo.js';
import { ATMOS } from './sky.js';

const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];

const matCache = new Map();
function lamb(hex) {
  let m = matCache.get(hex);
  if (!m) matCache.set(hex, (m = new THREE.MeshLambertMaterial({ color: hex, flatShading: true })));
  return m;
}

// --- fixed sites (real coordinates) ---
const [, FED_Z] = LL(33.4183, -94.0429);    // Texarkana's two-state federal building
const AVE_X = LL(33.42, -94.0433)[0];       // State Line Ave rides the 94°02.6'W line
const CASINO = LL(33.756, -97.128);         // WinBig World — three minutes past the Red
const GLOWS = [                             // beyond-band horizon glow (night-gated); east 6a, west 6b
  { name: 'Lake Charles', at: LL(30.226, -93.217) },
  { name: 'Natchitoches', at: LL(31.76, -93.086) },
  { name: 'Lawton', at: LL(34.6036, -98.3959) },      // rides I-44, not in the arterial bake — glow only
  { name: 'Alamogordo', at: LL(32.8995, -105.9603) }, // rides US 54, same story
];

// --- 6b fixed sites, the west line (real coordinates) ---
const TEXOLA = LL(35.2211, -99.9925);   // OK side of the 100th meridian, on old 66
const GLENRIO = LL(35.1786, -103.0345); // the Texas side of the line; the motel IS the town
const TEXHOMA = LL(36.5, -101.7855);    // z IS the line — the town straddles 36.5°N
const ANTHONY = LL(32.0, -106.6014);    // z IS the line — Main St crosses 32°N here
const WHITES = LL(32.1751, -104.3794);  // Whites City — the Carlsbad doorstep

// The seven Corner Stones — real survey points, snapped onto the nearest
// border-polygon vertex at build time so each stone provably sits ON the line.
const STONES = [
  { key: 'nw', label: 'TX·NM·OK Tripoint', at: LL(36.5, -103.042), sub: '36°30′N 103°02′W',
    text: 'Three states meet under this cap: Texas, New Mexico, Oklahoma. Surveyors chased this corner for sixty years, and New Mexico still holds the line sits a few hundred feet too far east. The stone stays.' },
  { key: 'ne', label: 'Panhandle NE Corner', at: LL(36.5, -100.0), sub: 'The 100th meridian',
    text: 'The Panhandle’s top-right corner, where Texas quits going north. East of the 100th meridian was Indian Territory; for a generation this line was the legal edge of everything.' },
  { key: 'nm32', label: 'TX·NM 32nd Parallel', at: LL(32.0, -103.06), sub: 'Set 1859',
    text: 'The 32nd parallel corner. The crew that ran this line worked half a desert summer without reliable water, and the line wobbles a little. So would you.' },
  { key: 'marker1', label: 'Boundary Marker No. 1', at: LL(31.7837, -106.5287), sub: 'El Paso, 1855',
    text: 'The first monument of the U.S.–Mexico boundary survey — set in 1855 where the land border leaves the Rio Grande and strikes out west across the desert. Every marker after it is numbered from this one.' },
  // nominal point sits NORTH of the corner on purpose: the snap then lands on
  // the border's own turn from meridian to river — the actual tripoint vertex
  { key: 'redriver', label: 'TX·AR·OK Tripoint', at: LL(34.2, -94.043), sub: 'On the Red',
    text: 'Texas, Arkansas, and Oklahoma meet in the middle of the Red River. The stone keeps to the dry side; the river moves, and the lawyers follow it.' },
  { key: 'sabinepass', label: 'Sabine Pass', at: LL(29.69, -93.84), sub: 'Mouth of the Sabine',
    text: 'Where the Sabine gives up on being a border and becomes the Gulf. The treaty of 1819 drew the line down this channel, and Texas and Louisiana kept arguing about which half of the water was whose until 1958.' },
  { key: 'bocachica', label: 'Boca Chica', at: LL(25.997, -97.146), sub: 'The bottom of Texas',
    text: 'The bottom of Texas. South of this stone the Rio Grande meets the Gulf, and past that is another country. Every acre of the state is behind you — act accordingly.' },
];

// Pure footprint standoff (airportClear pattern) — cities.js consults this so
// Texarkana's procedural downtown can't drop a tower through the federal
// building, and the band machinery keeps clear of the WinBig lot.
const CLEAR_BOXES = [
  [AVE_X - 6, AVE_X + 6, FED_Z - 8, FED_Z + 82],        // fed building + avenue deck
  [CASINO[0] - 12, CASINO[0] + 42, CASINO[1] - 22, CASINO[1] + 22], // casino + lot
  [TEXOLA[0] - 12, TEXOLA[0] + 12, TEXOLA[1] - 8, TEXOLA[1] + 13],   // Texola ruins
  [GLENRIO[0] - 20, GLENRIO[0] + 20, GLENRIO[1] - 4, GLENRIO[1] + 8], // Glenrio ghost strip
  [TEXHOMA[0] - 16, TEXHOMA[0] + 16, TEXHOMA[1] - 9, TEXHOMA[1] + 4], // Texhoma elevators + line
  [ANTHONY[0] - 7, ANTHONY[0] + 7, ANTHONY[1] - 11, ANTHONY[1] + 11], // Anthony banner + Main St
  [WHITES[0] - 16, WHITES[0] + 13, WHITES[1] - 14, WHITES[1] + 14],   // Whites City strip + road mouth
];
export function shoulderClear(x, z) {
  for (const [x0, x1, z0, z1] of CLEAR_BOXES)
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return false;
  return true;
}

// Frog country: the Neutral Ground strip east of the Sabine (I-10 corridor).
// 0..1 with feathered edges; main.js feeds it to audio.swamp at HUD rate so
// the night chorus crossfades frogs-over-crickets only out there.
export function swampAt(x, z) {
  const f = (v, lo, hi, e) => Math.max(0, Math.min(1, Math.min(v - lo, hi - v) / e));
  return f(x, 5530, 5930, 60) * f(z, 680, 1150, 60);
}

// point→segment distance against the whole border ring (one-time build cost)
function borderDist(x, z) {
  const B = GEO.border;
  let best = Infinity;
  for (let i = 0; i < B.length; i++) {
    const [ax, az] = B[i], [bx, bz] = B[(i + 1) % B.length];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    const d = (x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// walk a band stub outward from its border end; returns point + outward tangent
function along(poly, fromStart, dist) {
  const pts = fromStart ? poly : [...poly].reverse();
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc + seg >= dist) {
      const t = (dist - acc) / seg;
      const tx = (pts[i][0] - pts[i - 1][0]) / seg, tz = (pts[i][1] - pts[i - 1][1]) / seg;
      return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, z: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t, tx, tz };
    }
    acc += seg;
  }
  const n = pts.length - 1;
  const seg = Math.hypot(pts[n][0] - pts[n - 1][0], pts[n][1] - pts[n - 1][1]) || 1;
  return { x: pts[n][0], z: pts[n][1], tx: (pts[n][0] - pts[n - 1][0]) / seg, tz: (pts[n][1] - pts[n - 1][1]) / seg };
}

function stubLength(poly) {
  let acc = 0;
  for (let i = 1; i < poly.length; i++) acc += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
  return acc;
}

// every band-stub endpoint sitting on the border IS a road crossing — the
// stubs were clipped at the line by the bake. Motorways claim clusters first
// so an interstate monument never gets labeled by a frontage US route.
function deriveCrossings() {
  const cands = [];
  for (const h of GEO.bandHighways) {
    for (const fromStart of [true, false]) {
      const end = fromStart ? h.pts[0] : h.pts[h.pts.length - 1];
      if (borderDist(end[0], end[1]) > 15) continue;
      const a = along(h.pts, fromStart, 0.1); // outward tangent at the line
      // a crossing must lead to a NEIGHBOR — I-10 hugging the Rio Grande in
      // El Paso grazes the border too, but that's Mexico (settled call: out)
      if (!neighborCountyAt(end[0] + a.tx * 10, end[1] + a.tz * 10)) continue;
      cands.push({ x: end[0], z: end[1], ox: a.tx, oz: a.tz, ref: h.ref, type: h.type, poly: h.pts, fromStart });
    }
  }
  cands.sort((a, b) => (a.type === 'motorway' ? 0 : 1) - (b.type === 'motorway' ? 0 : 1));
  const sites = [];
  for (const c of cands) {
    if (sites.some((s) => (s.x - c.x) ** 2 + (s.z - c.z) ** 2 < 60 * 60)) continue;
    sites.push(c);
  }
  return sites;
}

// hAt-draped ground plane (deck/lot surfaces — a flat plane this size would
// clip through terrain undulation; big-coplanar-plane law says drape, not stack)
function drapedPlane(cx, cz, w, len, y0, mat, seg = 12) {
  const geo = new THREE.PlaneGeometry(w, len, 1, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const wx = cx + pos.getX(i), wz = cz + pos.getZ(i);
    pos.setX(i, wx); pos.setZ(i, wz);
    pos.setY(i, hAt(wx, wz) + y0);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

// hAt-draped ribbon between two world points — drapedPlane is axis-aligned;
// switchback legs and painted lines need arbitrary bearings
function ribbon(x0, z0, x1, z1, w, mat, seg = 10) {
  const len = Math.hypot(x1 - x0, z1 - z0) || 1;
  const dx = (x1 - x0) / len, dz = (z1 - z0) / len;
  const geo = new THREE.PlaneGeometry(w, len, 1, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const a = pos.getZ(i) + len / 2, c = pos.getX(i);
    const wx = x0 + dx * a - dz * c, wz = z0 + dz * a + dx * c;
    pos.setX(i, wx); pos.setZ(i, wz);
    pos.setY(i, hAt(wx, wz) + 0.07);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

function mkTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'));
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

// one shared granite face for every welcome monument
function monumentTex() {
  return mkTex(512, 352, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, 0, 352);
    grad.addColorStop(0, '#7a746e'); grad.addColorStop(1, '#5e5954');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 512, 352);
    ctx.strokeStyle = '#4a4540'; ctx.lineWidth = 10; ctx.strokeRect(14, 14, 484, 324);
    ctx.fillStyle = '#f0e9da'; ctx.textAlign = 'center';
    ctx.font = 'bold 30px Georgia';
    ctx.fillText('WELCOME TO', 256, 88);
    ctx.font = 'bold 92px Georgia';
    ctx.fillText('TEXAS', 256, 178);
    ctx.font = '26px Georgia';
    ctx.fillText('★', 256, 226);
    ctx.font = 'bold 28px Georgia';
    ctx.fillText('DRIVE FRIENDLY', 256, 276);
    ctx.fillText('— THE TEXAS WAY —', 256, 312);
  });
}

function controlSignTex(lines) {
  return mkTex(512, 192, (ctx) => {
    ctx.fillStyle = '#1e6b3c'; ctx.fillRect(0, 0, 512, 192);
    ctx.strokeStyle = '#e8e8e0'; ctx.lineWidth = 6; ctx.strokeRect(8, 8, 496, 176);
    ctx.fillStyle = '#f4f4ec'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 44px system-ui, sans-serif';
    const y0 = 96 - (lines.length - 1) * 34;
    lines.forEach((ln, i) => {
      ctx.fillText(ln[0], 36, y0 + i * 68);
      ctx.textAlign = 'right'; ctx.fillText(ln[1], 476, y0 + i * 68); ctx.textAlign = 'left';
    });
  });
}

export class ShoulderSystem {
  constructor(scene) {
    this.t = 0;
    this.scanT = 0;
    this.straddleCd = -Infinity;
    this.onToast = null;
    this.onStone = null;
    // beyond-band glow: ONE shared additive material, opacity = ATMOS.night in
    // update (maritime rigGlow rules — fog:false or the horizon eats it)
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, fog: false, blending: THREE.AdditiveBlending, depthWrite: false });
    const g = new THREE.Group();
    g.name = 'shoulder';
    this.crossings = deriveCrossings();
    this.monuments = this.buildMonuments(g);
    this.stones = this.buildStones(g);
    this.buildNeutralGround(g);
    this.buildTexarkana(g);
    this.casino = this.buildCasino(g);
    this.buildWest(g);
    this.buildGlows(g);
    scene.add(g);
    this.group = g;

    this.plaques = [
      { icon: '📜', name: 'The Neutral Ground', at: this.ngPlaqueAt, hint: 'read the Neutral Ground marker', sub: 'No man’s land, 1806–1821',
        text: 'For fifteen years the strip between the Sabine and the Calcasieu belonged to nobody — Spain and the United States both claimed it, neither would police it, and every outlaw on two continents heard about it. They called it the Neutral Ground. It was anything but. When the treaty line finally settled on the Sabine, the neighbors had already learned the border habit that never left: wave, trade, and argue about football.' },
      { icon: '📸', name: 'The Straddle Spot', at: [AVE_X, FED_Z + 7], hint: 'stand on the line', sub: 'Texarkana, USA',
        text: 'The only federal building in America that sits in two states at once — the post office needs both ZIP codes to be safe. Stand on the brass line out front: left boot Texas, right boot Arkansas. The photograph is mandatory.' },
      { icon: '🎰', name: 'WinBig World Casino', at: [CASINO[0] + 14, CASINO[1] + 14], hint: 'read the marquee', sub: 'WORLD’S BIGGEST — FREE PARKING',
        text: 'The sign says WORLD’S BIGGEST and for once a sign is being modest: the floor is measured in acres and the lot in time zones. Read the plates on your way in — Texas, Texas, Texas, Texas. Oklahoma built it three minutes past the river for a reason, and y’all keep proving the reason.' },
      ...this.stones.map((s) => ({ icon: '🪨', name: `Corner Stone — ${s.label}`, at: [s.x, s.z], hint: 'read the survey cap', sub: s.sub, text: s.text })),
      { icon: '🪦', name: 'Texola', at: this.texolaAt, hint: 'read the wall', sub: 'Population 42 and holding',
        text: 'Surveyed into Texas twice and Oklahoma three times — the 100th meridian kept wandering underfoot, and folks here went to bed in one state and woke up in the other without moving. Route 66 kept Texola alive; the interstate let it go. The bar wall got the last word, and it’s still right: there’s no other place like this place anywhere near this place. So this must be the place.' },
      { icon: '🛏️', name: 'Glenrio', at: this.glenrioAt, hint: 'read the motel sign', sub: 'FIRST IN TEXAS — LAST IN TEXAS',
        text: 'One sign, two faces, both honest: FIRST MOTEL IN TEXAS if you’re arriving, LAST MOTEL IN TEXAS if you’re leaving. The gas pumps stood on the Texas side because New Mexico taxed fuel harder; the bar never got built because this end of Texas was dry. When I-40 opened in 1973 the town emptied in a season — but nobody took the sign down, so Glenrio still says hello and goodbye all day to people doing eighty.' },
      { icon: '🌾', name: 'Texhoma', at: this.texhomaAt, hint: 'read the painted line', sub: 'One town, two states',
        text: 'The name does the math: TEXas plus oklaHOMA. The line runs straight down the middle of town, and Texhoma decided not to care — one water tower, one elevator row, and the only school district in America that ignores a state line: grade school in Oklahoma, high school in Texas, every kid graduates by crossing a border their parents stopped noticing. The wheat never noticed it at all.' },
      { icon: '🎂', name: 'Anthony', at: this.anthonyAt, hint: 'read the banner', sub: 'Leap Year Capital of the World',
        text: 'In 1988 a leap-day baby named Mary Ann Brown decided her town should throw the birthday party the calendar kept stealing, and both legislatures — Texas and New Mexico, in rare agreement — proclaimed it. Every February 29, people born on the day come from all over the world to blow out candles on the correct date at last, half the party in each state. Three years out of four, the banner just hangs here. Waiting is most of the job.' },
      { icon: '🚪', name: 'The Carlsbad Doorstep', at: this.doorstepAt, hint: 'read the park sign', sub: 'Carlsbad Caverns National Park',
        text: 'The road switchbacks up the old reef — this whole ridge was the floor of a sea once, and the sea left its rooms behind. Seven hundred and fifty feet under that ridge is one of the great caves of the world; at dusk the swallows pour out of its mouth like smoke running backwards. The door is up there. It isn’t open yet. Some places you don’t rush.' },
    ];
  }

  plaqueNear(pos, range) {
    for (const p of this.plaques)
      if (Math.hypot(pos.x - p.at[0], pos.z - p.at[1]) < range) return p;
    return null;
  }

  // granite WELCOME TO TEXAS + bluebonnet bed at every derived crossing —
  // sits just inside the line, facing inbound traffic, right shoulder
  buildMonuments(g) {
    const faceTex = monumentTex();
    const faceMat = new THREE.MeshLambertMaterial({ map: faceTex });
    const granite = lamb(0x6a6560), base = lamb(0x57534e);
    const slabGeo = new THREE.BoxGeometry(2.3, 1.5, 0.28);
    const baseGeo = new THREE.BoxGeometry(2.7, 0.35, 0.9);
    const sites = [];
    const bloomP = [], rand = seededRand('bluebonnet'); // new stream — never rename
    for (const c of this.crossings) {
      // 7 units into Texas, 5 to the right of inbound traffic
      const px = c.x - c.ox * 7 - c.oz * 5, pz = c.z - c.oz * 7 + c.ox * 5;
      if (!inTexas(px, pz)) continue; // river crossings: skip if the shoulder point is wet
      const y = hAt(px, pz);
      const yaw = Math.atan2(c.ox, c.oz); // plate normal faces outward = at inbound drivers
      const m = new THREE.Group();
      m.position.set(px, y, pz);
      m.rotation.y = yaw;
      const b = new THREE.Mesh(baseGeo, base); b.position.y = 0.18; m.add(b);
      const slab = new THREE.Mesh(slabGeo, [granite, granite, granite, granite, faceMat, granite]);
      slab.position.y = 1.1; m.add(slab);
      g.add(m);
      // bluebonnet bed scattered on the Texas side of the slab
      for (let i = 0; i < 24; i++) {
        const lx = (rand() - 0.5) * 3.2, lz = 0.8 + rand() * 1.6;
        const wx = px + Math.sin(yaw) * lz + Math.cos(yaw) * lx;
        const wz = pz + Math.cos(yaw) * lz - Math.sin(yaw) * lx;
        bloomP.push([wx, hAt(wx, wz), wz]);
      }
      sites.push({ x: px, z: pz, ox: c.ox, oz: c.oz, ref: c.ref, type: c.type });
    }
    const bloom = new THREE.InstancedMesh(new THREE.ConeGeometry(0.05, 0.24, 5), lamb(0x3355cc), bloomP.length);
    const tip = new THREE.InstancedMesh(new THREE.SphereGeometry(0.025, 5, 4), lamb(0xf0f0e8), bloomP.length);
    const d = new THREE.Object3D();
    bloomP.forEach(([x, y, z], i) => {
      d.position.set(x, y + 0.12, z); d.updateMatrix(); bloom.setMatrixAt(i, d.matrix);
      d.position.y = y + 0.25; d.updateMatrix(); tip.setMatrixAt(i, d.matrix);
    });
    g.add(bloom, tip);
    return sites;
  }

  // the seven Corner Stones, snapped onto the nearest border vertex
  buildStones(g) {
    const granite = lamb(0x77726c), brass = lamb(0xc8a848);
    const baseGeo = new THREE.BoxGeometry(0.8, 0.3, 0.8);
    const shaftGeo = new THREE.CylinderGeometry(0.1, 0.26, 1.5, 4);
    const capGeo = new THREE.ConeGeometry(0.12, 0.22, 4);
    const out = [];
    for (const s of STONES) {
      let best = Infinity, bx = s.at[0], bz = s.at[1];
      for (const [vx, vz] of GEO.border) {
        const d = (vx - s.at[0]) ** 2 + (vz - s.at[1]) ** 2;
        if (d < best) { best = d; bx = vx; bz = vz; }
      }
      const y = hAt(bx, bz);
      const grp = new THREE.Group();
      grp.position.set(bx, y, bz);
      const b = new THREE.Mesh(baseGeo, granite); b.position.y = 0.15; grp.add(b);
      const sh = new THREE.Mesh(shaftGeo, granite); sh.position.y = 1.02; grp.add(sh);
      const cap = new THREE.Mesh(capGeo, brass); cap.position.y = 1.88; grp.add(cap);
      g.add(grp);
      out.push({ key: s.key, label: s.label, sub: s.sub, text: s.text, x: bx, z: bz });
    }
    return out;
  }

  // The Neutral Ground: everything hangs off the I-10 east stub so it hugs
  // the real road — cypress/moss rows on the Sabine banks, crawfish ponds off
  // the rice prairie, the Vinton fireworks barns, and the marker itself.
  buildNeutralGround(g) {
    const i10 = this.crossings.find((c) => c.ref === 'I 10' && c.x > 4500);
    this.ngStub = i10 || null;
    if (!i10) { this.ngPlaqueAt = [5560, 930]; return; } // band data missing: degrade quietly
    const at = (dist, lat) => { // point at arc length, offset laterally (right of outbound = +)
      const a = along(i10.poly, i10.fromStart, dist);
      return { x: a.x - a.tz * lat, z: a.z + a.tx * lat, tx: a.tx, tz: a.tz };
    };

    // marker: 30 units into Louisiana, right shoulder eastbound
    const pm = at(30, 6);
    this.ngPlaqueAt = [pm.x, pm.z];
    const marker = new THREE.Group();
    marker.position.set(pm.x, hAt(pm.x, pm.z), pm.z);
    marker.rotation.y = Math.atan2(-pm.tx, -pm.tz); // face back at the road
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 5), lamb(0x4a4038));
    post.position.y = 0.65; marker.add(post);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.06), lamb(0x3d5a45));
    plate.position.y = 1.5; marker.add(plate);
    g.add(marker);

    // cypress + moss on the Sabine banks: border vertices along the river by
    // I-10, trees on the Louisiana side (Texas-side flora is ScenerySystem's)
    const rand = seededRand('cypress'); // new stream — never rename
    const trunkP = [], mossP = [];
    for (const [vx, vz] of GEO.border) {
      if (vx < 5350 || vz < 600 || vz > 1250) continue;
      for (let k = 0; k < 2; k++) {
        if (rand() < 0.35) continue;
        let ox = 2 + rand() * 10, oz = (rand() - 0.5) * 8;
        let tx = vx + ox, tz = vz + oz;
        if (inTexas(tx, tz)) { tx = vx - ox; tz = vz - oz; } // keep to the far bank
        if (inTexas(tx, tz)) continue;
        trunkP.push([tx, hAt(tx, tz), tz, 0.8 + rand() * 0.5]);
        if (rand() < 0.7) mossP.push(trunkP.length - 1);
      }
    }
    const d = new THREE.Object3D();
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.16, 1.6, 5), lamb(0x5a4a3a), trunkP.length);
    const canopy = new THREE.InstancedMesh(new THREE.ConeGeometry(0.75, 1.7, 6), lamb(0x3e5230), trunkP.length);
    const moss = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.05, 0.7, 3), lamb(0x8a9a7a), mossP.length);
    trunkP.forEach(([x, y, z, s], i) => {
      d.rotation.set(0, 0, 0);
      d.position.set(x, y + 0.8 * s, z); d.scale.setScalar(s); d.updateMatrix(); trunks.setMatrixAt(i, d.matrix);
      d.position.set(x, y + (1.6 + 0.6) * s, z); d.updateMatrix(); canopy.setMatrixAt(i, d.matrix);
    });
    mossP.forEach((ti, i) => {
      const [x, y, z, s] = trunkP[ti];
      d.position.set(x + 0.45 * s, y + 1.7 * s, z + 0.2 * s); d.scale.setScalar(s); d.updateMatrix(); moss.setMatrixAt(i, d.matrix);
    });
    g.add(trunks, canopy, moss);
    this.cypress = trunks;

    // crawfish ponds south of the interstate, between Vinton and Sulphur —
    // levee rectangles of dark water with trap-buoy rows (rice-prairie kit)
    const water = new THREE.MeshLambertMaterial({ color: 0x2e3a30 });
    const levee = lamb(0x6a5c48);
    const buoyP = [];
    for (let p = 0; p < 3; p++) {
      const anchor = at(120 + p * 65, 28 + (p % 2) * 16);
      const py = hAt(anchor.x, anchor.z);
      const pond = new THREE.Mesh(new THREE.PlaneGeometry(13, 8), water);
      pond.rotation.x = -Math.PI / 2;
      pond.position.set(anchor.x, py + 0.14, anchor.z);
      g.add(pond);
      for (const [w, hh, px, pz] of [[13.6, 0.35, 0, 4.15], [13.6, 0.35, 0, -4.15], [0.35, 8.6, 6.95, 0], [0.35, 8.6, -6.95, 0]]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, hh), levee);
        wall.position.set(anchor.x + px, py + 0.2, anchor.z + pz);
        g.add(wall);
      }
      for (let r = 0; r < 8; r++) buoyP.push([anchor.x - 5 + (r % 4) * 3.2, py + 0.22, anchor.z - 1.6 + Math.floor(r / 4) * 3.2]);
    }
    const buoys = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 5, 4), lamb(0xc84838), buoyP.length);
    buoyP.forEach(([x, y, z], i) => { d.scale.setScalar(1); d.position.set(x, y, z); d.updateMatrix(); buoys.setMatrixAt(i, d.matrix); });
    g.add(buoys);
    this.ponds = 3;

    // Vinton fireworks barns — gaudy, right where the eastbound money stops
    const barnTex = mkTex(512, 256, (ctx) => {
      ctx.fillStyle = '#c8332a'; ctx.fillRect(0, 0, 512, 256);
      ctx.fillStyle = '#f2d23a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 88px system-ui, sans-serif';
      ctx.fillText('FIREWORKS', 256, 92);
      ctx.font = 'bold 40px system-ui, sans-serif';
      ctx.fillText('LAST CHANCE ★ FIRST CHANCE', 256, 186);
    });
    const barnFace = new THREE.MeshLambertMaterial({ map: barnTex });
    const barnSide = lamb(0xa8342c);
    const vintonD = this.arcNearest(i10, GEO.bandCities?.find?.((c) => c.name === 'Vinton') ?? { x: 5644.9, z: 907.1 });
    for (const [dd, lat] of [[vintonD - 14, 11], [vintonD + 6, 15]]) {
      const p = at(dd, lat);
      const barn = new THREE.Group();
      barn.position.set(p.x, hAt(p.x, p.z), p.z);
      barn.rotation.y = Math.atan2(-p.tx, -p.tz);
      const body = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 3), [barnSide, barnSide, barnSide, barnSide, barnFace, barnSide]);
      body.position.y = 1.1; barn.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.1, 4), lamb(0x8a8a90));
      roof.position.y = 2.75; roof.rotation.y = Math.PI / 4; roof.scale.set(1.25, 1, 0.8); barn.add(roof);
      g.add(barn);
    }

    // control cities east: the world keeps going past the band edge
    const L = stubLength(i10.poly);
    this.buildControlSign(g, at(L - 8, 7), controlSignTex([['Lake Charles', '25'], ['New Orleans', '290']]));
    const us71 = GEO.bandHighways.filter((h) => h.ref === 'US 71');
    if (us71.length) {
      // southernmost US-71 point — the Natchitoches road out of Shreveport
      let poly = us71[0].pts, mz = -Infinity;
      for (const h of us71) for (const p of h.pts) if (p[1] > mz) { mz = p[1]; poly = h.pts; }
      const endFirst = poly[0][1] >= poly[poly.length - 1][1];
      const p = along(poly, endFirst, 2); // walk from the southern tip; tangent points back north
      this.buildControlSign(g, { x: p.x - p.tz * -7, z: p.z + p.tx * -7, tx: -p.tx, tz: -p.tz }, controlSignTex([['Natchitoches', '42'], ['Alexandria', '95']]));
    }
  }

  arcNearest(stub, target) { // arc length along a stub of the point nearest a target
    const pts = stub.fromStart ? stub.poly : [...stub.poly].reverse();
    let acc = 0, best = Infinity, bestD = 0;
    for (let i = 1; i < pts.length; i++) {
      acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const dd = (pts[i][0] - target.x) ** 2 + (pts[i][1] - target.z) ** 2;
      if (dd < best) { best = dd; bestD = acc; }
    }
    return bestD;
  }

  buildControlSign(g, p, tex) {
    const sign = new THREE.Group();
    sign.position.set(p.x, hAt(p.x, p.z), p.z);
    sign.rotation.y = Math.atan2(-p.tx, -p.tz); // face oncoming (outbound) traffic
    const postMat = lamb(0x707880);
    for (const px of [-2, 2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.6, 5), postMat);
      post.position.set(px, 1.8, 0); sign.add(post);
    }
    const board = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.7, 0.1), new THREE.MeshLambertMaterial({ map: tex }));
    board.position.y = 3.2; sign.add(board);
    g.add(sign);
    (this.signs ??= []).push(sign);
  }

  // Texarkana: State Line Ave, the two-state federal building, the straddle
  buildTexarkana(g) {
    // avenue deck runs south from the federal plaza: NOT a road (causeway
    // precedent — nearestRoad stays null on it, traffic never drives it)
    g.add(drapedPlane(AVE_X, FED_Z + 42, 3.4, 74, 0.07, lamb(0x35353a), 24));  // the avenue
    g.add(drapedPlane(AVE_X, FED_Z + 42, 0.14, 74, 0.1, lamb(0xd8c890), 24));  // the brass line down its middle
    // the federal building, half in each state
    const fed = new THREE.Group();
    fed.position.set(AVE_X, hAt(AVE_X, FED_Z), FED_Z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(7, 4.2, 5.2), lamb(0xcbc4b4));
    body.position.y = 2.1; fed.add(body);
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.5, 5.7), lamb(0xb8b0a0));
    cornice.position.y = 4.45; fed.add(cornice);
    for (const [px, hex] of [[-2.4, 0x1f3f8f], [2.4, 0x9a2c2c]]) { // TX blue west, AR red east
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 5), lamb(0xd0d0d0));
      pole.position.set(px, 1.7, 3.1); fed.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshLambertMaterial({ color: hex, side: THREE.DoubleSide }));
      flag.position.set(px + 0.45, 3.1, 3.1); fed.add(flag);
    }
    g.add(fed);
    this.fed = fed;
    // the straddle spot: brass stripe + plinth on the plaza out front
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 3), lamb(0xd8c890));
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(AVE_X, hAt(AVE_X, FED_Z + 7) + 0.11, FED_Z + 7);
    g.add(stripe);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), lamb(0x77726c));
    plinth.position.set(AVE_X + 1.6, hAt(AVE_X + 1.6, FED_Z + 7) + 0.3, FED_Z + 7);
    g.add(plinth);
    this.straddle = [AVE_X, FED_Z + 7];
  }

  // WinBig World Casino — exterior + lot only; the plates are the joke
  buildCasino(g) {
    const c = new THREE.Group();
    const [cx, cz] = CASINO;
    const y = hAt(cx + 32, cz); // building-cluster ground; the lot drapes itself
    // the lot fronting I-35: acres of asphalt, nose-in rows, every rear plate
    // facing the interstate
    c.add(drapedPlane(cx + 14, cz, 24, 34, 0.1, lamb(0x2c2c30), 10));
    // the long cream box with the gold band
    const hall = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 30), lamb(0xf0e8d8));
    hall.position.set(cx + 32, y + 2.5, cz);
    c.add(hall);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.6, 30.4), lamb(0xc8a848));
    trim.position.set(cx + 32, y + 4.6, cz);
    c.add(trim);
    const portico = new THREE.Mesh(new THREE.BoxGeometry(4, 3.2, 8), lamb(0xe8ddc8));
    portico.position.set(cx + 25, y + 1.6, cz);
    c.add(portico);
    // marquee pylon by the road
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, 0.6), lamb(0x8a8580));
    pylon.position.set(cx + 3, y + 3.5, cz + 12);
    c.add(pylon);
    const marqueeTex = mkTex(512, 256, (ctx) => {
      ctx.fillStyle = '#20122e'; ctx.fillRect(0, 0, 512, 256);
      ctx.fillStyle = '#f2c200'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 84px Georgia'; ctx.fillText('WinBig', 256, 66);
      ctx.font = 'bold 56px Georgia'; ctx.fillText('WORLD CASINO', 256, 140);
      ctx.fillStyle = '#f4f4ec'; ctx.font = 'bold 30px system-ui, sans-serif';
      ctx.fillText("WORLD'S BIGGEST ★ FREE PARKING", 256, 212);
    });
    const marquee = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.2, 0.3), new THREE.MeshLambertMaterial({ map: marqueeTex }));
    marquee.position.set(cx + 3, y + 7.8, cz + 12);
    c.add(marquee);
    // the joke: rows of parked cars, noses at the hall, plates at the highway
    const rand = seededRand('winbig'); // new stream — never rename
    const cars = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.55, 0.75), new THREE.MeshLambertMaterial({ flatShading: true }), 36);
    const plateTex = mkTex(128, 64, (ctx) => {
      ctx.fillStyle = '#f4f4ec'; ctx.fillRect(0, 0, 128, 64);
      ctx.fillStyle = '#1f3f8f'; ctx.textAlign = 'center';
      ctx.font = 'bold 26px system-ui, sans-serif'; ctx.fillText('TEXAS', 64, 26);
      ctx.fillStyle = '#3a3a40'; ctx.font = 'bold 24px monospace'; ctx.fillText('LSR·6A', 64, 54);
    });
    const plates = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.34, 0.16), new THREE.MeshLambertMaterial({ map: plateTex }), 36);
    const dm = new THREE.Object3D();
    const palette = [0x8a8a92, 0x3a3a40, 0x7a2c2c, 0x2c4a7a, 0xd8d8d0, 0x4a4238];
    for (let i = 0; i < 36; i++) {
      const row = Math.floor(i / 9), col = i % 9;
      const px = cx + 7 + row * 5 + (rand() - 0.5) * 0.4;
      const pz = cz - 15 + col * 3.6 + (rand() - 0.5) * 0.5;
      const cy = hAt(px, pz);
      dm.rotation.set(0, 0, 0);
      dm.position.set(px, cy + 0.42, pz); dm.updateMatrix();
      cars.setMatrixAt(i, dm.matrix);
      cars.setColorAt(i, new THREE.Color(palette[Math.floor(rand() * palette.length)]));
      dm.position.set(px - 0.78, cy + 0.44, pz);
      dm.rotation.y = -Math.PI / 2; dm.updateMatrix(); // rear plate faces I-35
      plates.setMatrixAt(i, dm.matrix);
    }
    plates.userData.plates = 'TEXAS';
    c.add(cars, plates);
    c.userData.kind = 'winbig';
    g.add(c);
    return c;
  }

  // --- 6b: the west line (curvier kit — 8–14 segment turnings, sagged cloth) ---
  buildWest(g) {
    this.buildTexola(g);
    this.buildGlenrio(g);
    this.buildTexhoma(g);
    this.buildAnthony(g);
    this.buildDoorstep(g);
    // control cities west: the interstates keep going past the band edge.
    // Lawton and Alamogordo ride I-44 / US 54 — not in the arterial bake —
    // so the spec's named pair get glows; signs go on the stubs that exist.
    for (const [pick, lines] of [
      [(c) => c.ref === 'I 40' && c.x < -3000, [['Tucumcari', '16'], ['Albuquerque', '191']]],
      [(c) => c.ref === 'I 10' && c.x < 0, [['Deming', '52'], ['Tucson', '267']]],
    ]) {
      const stub = this.crossings.find(pick);
      if (!stub) continue;
      const L = stubLength(stub.poly);
      const a = along(stub.poly, stub.fromStart, Math.max(4, L - 8));
      this.buildControlSign(g, { x: a.x - a.tz * 7, z: a.z + a.tx * 7, tx: a.tx, tz: a.tz }, controlSignTex(lines));
    }
  }

  // Texola, Oklahoma — population 42 and holding. Route 66 kept it alive,
  // I-40 let it go; the shells hold the line's east end and the bar wall
  // gets the last word.
  buildTexola(g) {
    const cx = TEXOLA[0], cz = TEXOLA[1] + 2; // I-40 runs ~7u north — stay off its 4u bubble
    const grp = new THREE.Group();
    grp.userData.kind = 'texola';
    const adobe = lamb(0xb3a48a), stone = lamb(0x8f8478), rust = lamb(0x8a4a38);
    const rand = seededRand('texola'); // new stream — never rename
    this.texolaWalls = 0;
    const shell = (sx, sz, w, d, yaw) => {
      const s = new THREE.Group();
      s.position.set(sx, hAt(sx, sz), sz);
      s.rotation.y = yaw;
      const sides = [[0, -d / 2, w, 0, true], [0, d / 2, w, 0, false], [-w / 2, 0, d, Math.PI / 2, false], [w / 2, 0, d, Math.PI / 2, false]];
      for (const [ox, oz, len, wy, door] of sides) {
        const segs = 2 + Math.floor(rand() * 2);
        for (let i = 0; i < segs; i++) {
          const h = 0.7 + rand() * 1.5; // draw first — the doorway must not skip a draw
          if (door && i === Math.floor(segs / 2)) continue;
          const segLen = len / segs;
          const wall = new THREE.Mesh(new THREE.BoxGeometry(segLen * 0.94, h, 0.22), adobe);
          const off = -len / 2 + segLen * (i + 0.5);
          wall.position.set(ox + Math.cos(wy) * off, h / 2, oz + Math.sin(wy) * off);
          wall.rotation.y = wy;
          s.add(wall);
          this.texolaWalls++;
        }
      }
      grp.add(s);
    };
    shell(cx - 6, cz + 1, 5, 3.4, 0.12);
    shell(cx + 7, cz + 3, 4, 3, -0.2);
    shell(cx + 1, cz + 6, 3.4, 2.8, 0.05);
    // the territorial jail — one room, walls two feet thick, still standing
    const jail = new THREE.Group();
    jail.position.set(cx - 2, hAt(cx - 2, cz - 2), cz - 2);
    const jbody = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.5, 1.5), stone);
    jbody.position.y = 0.75; jail.add(jbody);
    const jroof = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.14, 1.7), lamb(0x6a6258));
    jroof.position.y = 1.57; jail.add(jroof);
    for (const bx of [-0.22, 0, 0.22]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), lamb(0x3a3a40));
      bar.position.set(bx, 1.0, 0.76); jail.add(bar);
    }
    grp.add(jail);
    // the Magnolia station: a rusted pump under a leaning canopy
    const mag = new THREE.Group();
    mag.position.set(cx + 3.5, hAt(cx + 3.5, cz - 1), cz - 1);
    mag.rotation.z = 0.05; // years of wind
    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.95, 10), rust);
    pump.position.y = 0.48; mag.add(pump);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), lamb(0xe8dfc4));
    globe.position.y = 1.1; mag.add(globe);
    for (const px of [-1.2, 1.2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.2, 10), rust);
      post.position.set(px, 1.1, 0.8); mag.add(post);
    }
    const cRoof = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 2.2), lamb(0x9a8a6a));
    cRoof.position.set(0, 2.22, 0.8); cRoof.rotation.z = 0.04; mag.add(cRoof);
    grp.add(mag);
    // the wall with the last word, facing the road to the north
    const wordTex = mkTex(512, 256, (ctx) => {
      ctx.fillStyle = '#ddd6c2'; ctx.fillRect(0, 0, 512, 256);
      ctx.fillStyle = '#2e2c28'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 33px Georgia';
      ["THERE'S NO OTHER PLACE", 'LIKE THIS PLACE', 'ANYWHERE NEAR THIS PLACE', 'SO THIS MUST BE', 'THE PLACE'].forEach((ln, i) => ctx.fillText(ln, 256, 46 + i * 42));
    });
    const word = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.2, 0.24),
      [adobe, adobe, adobe, adobe, adobe, new THREE.MeshLambertMaterial({ map: wordTex })]);
    word.position.set(cx - 1, hAt(cx - 1, cz + 9) + 1.1, cz + 9);
    grp.add(word);
    g.add(grp);
    this.texolaAt = [cx - 1, cz + 9]; // the plaque reads at the wall
  }

  // Glenrio — the ghost town ON the line; one sign, two faces, both honest.
  // Gas stood on the Texas side (New Mexico taxed fuel harder); the bar never
  // got built (this end of Texas was dry). I-40 opened 1973; everyone left.
  buildGlenrio(g) {
    const [cx, cz] = GLENRIO;
    const grp = new THREE.Group();
    grp.userData.kind = 'glenrio';
    const stucco = lamb(0xcfc6b0), dark = lamb(0x1c1c20);
    // old 66 through town, south of and parallel to I-40
    grp.add(ribbon(cx - 18, cz + 5, cx + 18, cz + 5, 2.4, lamb(0x565250), 16));
    // the motel: office + room row; the diner shell; every doorway dark
    const bld = (bx, bz, w, h, d) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stucco);
      m.position.set(bx, hAt(bx, bz) + h / 2, bz);
      grp.add(m);
    };
    bld(cx + 2, cz + 0.8, 3, 2.3, 2.6);   // the office
    bld(cx + 8.5, cz + 0.8, 9, 1.9, 2.4); // the room row
    bld(cx - 5, cz + 0.8, 2.8, 1.9, 2.2); // the diner
    for (const dx of [5.2, 6.8, 8.4, 10, 11.6, -5]) {
      const door = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.1), dark);
      door.position.set(cx + dx, hAt(cx + dx, cz + 2.05) + 0.6, cz + 2.05);
      grp.add(door);
    }
    // THE sign: a rusted pylon with a face for each direction of travel.
    // +x is east — the west face greets you FIRST, the east face waves LAST.
    const sx = cx - 1, sz = cz + 3.6;
    const sign = new THREE.Group();
    sign.position.set(sx, hAt(sx, sz), sz);
    sign.userData.kind = 'glenriosign';
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 6.8, 12), lamb(0x7a6a58));
    pylon.position.y = 3.4; sign.add(pylon);
    const faceTex = (word) => mkTex(288, 448, (ctx) => {
      ctx.fillStyle = '#efe7d2'; ctx.fillRect(0, 0, 288, 448);
      ctx.strokeStyle = '#8a4a38'; ctx.lineWidth = 12; ctx.strokeRect(10, 10, 268, 428);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#a03028'; ctx.font = 'bold 72px Georgia'; ctx.fillText(word, 144, 92);
      ctx.fillStyle = '#2e3a56'; ctx.font = 'bold 66px Georgia'; ctx.fillText('MOTEL', 144, 218);
      ctx.fillStyle = '#2e2c28'; ctx.font = 'bold 44px Georgia'; ctx.fillText('IN TEXAS', 144, 330);
      ctx.font = '30px Georgia'; ctx.fillText('VACANCY', 144, 398);
    });
    for (const [word, yaw] of [['FIRST', -Math.PI / 2], ['LAST', Math.PI / 2]]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.8), new THREE.MeshLambertMaterial({ map: faceTex(word) }));
      b.position.set(yaw < 0 ? -0.18 : 0.18, 5.2, 0);
      b.rotation.y = yaw;
      b.userData.reads = `${word} MOTEL IN TEXAS`;
      sign.add(b);
    }
    grp.add(sign);
    this.glenrioSign = sign;
    g.add(grp);
    this.glenrioAt = [sx, sz];
  }

  // Texhoma — the name does the math. One elevator row, one painted line,
  // one school district that ignores the border.
  buildTexhoma(g) {
    const [cx, cz] = TEXHOMA;
    const grp = new THREE.Group();
    grp.userData.kind = 'texhoma';
    const concrete = lamb(0xd6d1c6);
    // the painted line, dead on 36.5°N through the townsite
    grp.add(ribbon(cx - 15, cz, cx + 15, cz, 0.35, lamb(0xe9e6da), 20));
    // the elevators on the Oklahoma side, by where the rails ran
    const silos = new THREE.Group();
    const ex = cx + 2, ez = cz - 5;
    silos.position.set(ex, hAt(ex, ez), ez);
    this.texhomaSilos = 0;
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 7, 14), concrete);
      s.position.set(-4 + i * 1.6, 3.5, 0);
      silos.add(s); this.texhomaSilos++;
    }
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 4.4, 14), concrete);
      s.position.set(-2.4 + i * 1.6, 2.2, -1.9);
      silos.add(s); this.texhomaSilos++;
    }
    const nameTex = mkTex(512, 128, (ctx) => {
      ctx.fillStyle = '#c8c3b8'; ctx.fillRect(0, 0, 512, 128);
      ctx.fillStyle = '#3a3a40'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 72px system-ui, sans-serif'; ctx.fillText('TEXHOMA', 256, 64);
    });
    const head = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 1.8),
      [concrete, concrete, concrete, concrete, new THREE.MeshLambertMaterial({ map: nameTex }), concrete]);
    head.position.set(0, 8, 0); // headhouse; the name reads from the Texas side
    silos.add(head);
    grp.add(silos);
    g.add(grp);
    this.texhomaAt = [ex, cz]; // the plaque reads at the line, below the name
  }

  // Anthony — Leap Year Capital of the World (both legislatures agreed).
  // The banner hangs over Main St ON the line and waits; waiting is most
  // of the job.
  buildAnthony(g) {
    const [cx, cz] = ANTHONY;
    const grp = new THREE.Group();
    grp.userData.kind = 'anthony';
    // Main St crossing the line (causeway precedent — a deck, not a road)
    grp.add(ribbon(cx, cz - 9, cx, cz + 9, 2.8, lamb(0x3a3a3e), 12));
    for (const px of [-2.6, 2.6]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.6, 10), lamb(0xb8b4ac));
      pole.position.set(cx + px, hAt(cx + px, cz) + 2.3, cz);
      grp.add(pole);
    }
    const tex = mkTex(1024, 128, (ctx) => {
      ctx.fillStyle = '#c8332e'; ctx.fillRect(0, 0, 1024, 128);
      ctx.strokeStyle = '#f7f3e8'; ctx.lineWidth = 6; ctx.setLineDash([22, 14]); ctx.strokeRect(10, 10, 1004, 108);
      ctx.fillStyle = '#f7f3e8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 50px Georgia';
      ctx.fillText('★ ANTHONY — LEAP YEAR CAPITAL OF THE WORLD ★', 512, 64);
    });
    this.anthonyBanner = [];
    const bh = hAt(cx, cz) + 4.05;
    for (const yaw of [0, Math.PI]) { // a front face for each direction of travel
      const geo = new THREE.PlaneGeometry(5.2, 0.8, 16, 1);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const t = pos.getX(i) / 2.6;
        pos.setY(i, pos.getY(i) - 0.3 * (1 - t * t)); // the sag
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
      m.position.set(cx, bh, cz + (yaw === 0 ? 0.02 : -0.02));
      m.rotation.y = yaw;
      this.anthonyBanner.push(m);
      grp.add(m);
    }
    g.add(grp);
    this.anthonyAt = [cx, cz];
  }

  // The Carlsbad doorstep (settled call #9): Whites City off US 62, the park
  // road switchbacking up the old reef, and the entrance sign. ZERO cave
  // content — the caves track inherits a place, not a promise.
  buildDoorstep(g) {
    const [cx, cz] = WHITES;
    const grp = new THREE.Group();
    grp.userData.kind = 'doorstep';
    // anchor on the real US 62 stub (Neutral Ground idiom) — the strip sits
    // east of the road, the park road climbs away west
    const us62 = this.crossings.find((c) => c.ref === 'US 62' && c.x < -4000);
    let rd = { x: cx, z: cz, tx: 0, tz: -1 };
    if (us62) rd = along(us62.poly, us62.fromStart, this.arcNearest(us62, { x: cx, z: cz }));
    const s = -rd.tz >= 0 ? 1 : -1; // lateral direction with an east (+x) component
    const lat = (d) => ({ x: rd.x - rd.tz * d * s, z: rd.z + rd.tx * d * s });
    const E = lat(7); // strip anchor, east of the road
    const strip = new THREE.Group();
    strip.position.set(E.x, hAt(E.x, E.z), E.z);
    strip.rotation.y = Math.atan2(rd.tx, rd.tz); // long axis parallel to US 62
    const white = lamb(0xf2ecdc), red = lamb(0x9a3c30), stone = lamb(0x8a7a64);
    const bld = (ox, oz, w, h, d) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), white);
      m.position.set(ox, h / 2, oz);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.22, d + 0.3), red);
      cap.position.set(ox, h + 0.11, oz);
      strip.add(m, cap);
    };
    bld(0, -4, 3.4, 2.4, 2.8); // the gift shop (everything cavern-shaped)
    bld(0.4, 2.5, 2.6, 2, 7);  // the motor court, long side on the road
    // WHITES CITY — the sign taller than everything it advertises
    const wcTex = mkTex(384, 256, (ctx) => {
      ctx.fillStyle = '#f2ecdc'; ctx.fillRect(0, 0, 384, 256);
      ctx.strokeStyle = '#9a3c30'; ctx.lineWidth = 10; ctx.strokeRect(8, 8, 368, 240);
      ctx.fillStyle = '#9a3c30'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 64px Georgia'; ctx.fillText('WHITES', 192, 84);
      ctx.fillText('CITY', 192, 160);
      ctx.fillStyle = '#2e2c28'; ctx.font = '26px Georgia'; ctx.fillText('GAS · CURIOS · BEDS', 192, 222);
    });
    const wcPole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.2, 12), lamb(0x8a8580));
    wcPole.position.set(-0.6, 2.6, -7.2); strip.add(wcPole);
    const wcBoard = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.8, 0.14), new THREE.MeshLambertMaterial({ map: wcTex }));
    wcBoard.position.set(-0.6, 4.6, -7.2); strip.add(wcBoard);
    grp.add(strip);
    // the park road: hand-laid switchback legs climbing west into the reef
    const M = lat(-5); // the mouth, west of the road
    const W = [[0, 0], [-10, -2], [-16, 5], [-27, 2], [-33, 10], [-45, 7], [-51, 14], [-61, 11]];
    const road = lamb(0x565250);
    this.parkRoad = [];
    for (let i = 1; i < W.length; i++) {
      const leg = ribbon(M.x + W[i - 1][0], M.z + W[i - 1][1], M.x + W[i][0], M.z + W[i][1], 1.5, road, 10);
      this.parkRoad.push(leg);
      grp.add(leg);
    }
    const top = [M.x + W[W.length - 1][0], M.z + W[W.length - 1][1]];
    grp.add(drapedPlane(top[0], top[1], 7, 7, 0.06, lamb(0x4e4a48), 6)); // the turnaround
    this.doorstepTop = top;
    // the entrance sign at the mouth: two stone piers, one timber board
    const sign = new THREE.Group();
    sign.position.set(M.x - 2, hAt(M.x - 2, M.z - 3), M.z - 3);
    sign.rotation.y = Math.atan2(E.x - (M.x - 2), E.z - (M.z - 3)); // face the highway
    for (const px of [-2, 2]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.5, 0.55), stone);
      pier.position.set(px, 0.75, 0); sign.add(pier);
    }
    const npsTex = mkTex(512, 160, (ctx) => {
      ctx.fillStyle = '#4a3a26'; ctx.fillRect(0, 0, 512, 160);
      ctx.strokeStyle = '#d8cfae'; ctx.lineWidth = 5; ctx.strokeRect(7, 7, 498, 146);
      ctx.fillStyle = '#e8dfc0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 50px Georgia'; ctx.fillText('CARLSBAD CAVERNS', 256, 58);
      ctx.font = 'bold 38px Georgia'; ctx.fillText('NATIONAL PARK', 256, 116);
    });
    const board = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.2, 0.16), new THREE.MeshLambertMaterial({ map: npsTex }));
    board.position.y = 1.45; sign.add(board);
    grp.add(sign);
    this.doorstepSign = sign;
    g.add(grp);
    this.doorstepAt = [M.x - 2, M.z - 3];
  }

  buildGlows(g) {
    const geo = new THREE.SphereGeometry(34, 10, 7);
    for (const gl of GLOWS) {
      const m = new THREE.Mesh(geo, this.glowMat);
      m.position.set(gl.at[0], hAt(gl.at[0], gl.at[1]) + 2, gl.at[1]);
      m.scale.set(1, 0.22, 1);
      g.add(m);
      (this.glows ??= []).push(m);
    }
  }

  update(dt, px, pz) {
    this.t += dt;
    this.glowMat.opacity = ATMOS.night * 0.16;
    this.scanT += dt;
    if (this.scanT < 0.5) return;
    this.scanT = 0;
    for (const s of this.stones) {
      if ((px - s.x) ** 2 + (pz - s.z) ** 2 < 9 * 9) this.onStone?.(s.key, s.label);
    }
    if (this.t - this.straddleCd > 120 && Math.hypot(px - this.straddle[0], pz - this.straddle[1]) < 3.5) {
      this.straddleCd = this.t;
      this.onToast?.('📸 One boot in Texas, one in Arkansas');
    }
  }
}
