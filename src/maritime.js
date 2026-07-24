// The working Gulf: container ports at real locations, cargo ships and tankers
// on coastal lanes, shrimp boats off Padre, oil platforms offshore.
import * as THREE from 'three';
import { GEO, hAt, coastDist, seededRand, inWorld, SEA_Y, nearestRoad, boatableAt } from './geo.js';
import { ATMOS } from './sky.js';
import { mergeGeoms } from './world.js';
import { airportClear } from './airports.js';

const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];
const SEA = SEA_Y + 0.4; // hulls sit slightly proud of the gulf water plane

// radial vertex-color falloff for glow discs (center white -> black rim);
// black + AdditiveBlending contributes nothing, so the edge dissolves
export function fadeDisc(geo, r = 1) {
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const d = Math.hypot(pos.getX(i), pos.getZ(i)) / r;
    const c = Math.max(0, 1 - d * d);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// Sea-Industry W1: ports + routes are baked data (GEO.sea, tools/build-sea.mjs)
// — 8 real ports with OSM quays/character, ship lanes traced from a real AIS
// day and clamped to in-game navigable water. The old hand-laid LANE (the
// scarcity exception) retired here as planned; the trunk route is its heir,
// and laneAt()/len stay as the trunk accessor (rotors.js CG patrol, W2 cutters).

// Tidelands buoy — ON the line (coastDist ≈ 166.7u, converged against
// border + island rings offline), off the Bolivar Roads entrance channel
const BUOY_AT = [4762.2, 1851.5];

// Gulf Intracoastal Waterway through the Laguna Madre — hand-laid (the lane's
// scarcity exception), Brownsville channel → Port Isabel → the Land Cut.
// Lagoon-only scope (W3 call): the marker line stops at Baffin Bay's mouth.
const ICW = [
  LL(25.96, -97.33), LL(25.97, -97.24), LL(26.06, -97.21), LL(26.26, -97.28),
  LL(26.56, -97.34), LL(26.84, -97.43), LL(27.06, -97.45), LL(27.28, -97.42),
];

// --- Sea-Industry W2: per-vessel identity -----------------------------------
// Seeded `shipid:` stream (never rename — blanket seed-string law). Names are
// curated per-type pools, invented-but-flavored, never real operators (the
// chatter law); trip ends resolve from GEO.sea.ports at build time. The
// placard rides the trains 60-u toast idiom via onIdentity, re-arms on exit.
const SHIP_NAMES = {
  container: ['Gulf Palmetto', 'Bluebonnet Star', 'San Jacinto', 'Yellow Rose', 'Copano Bay', 'Matagorda Trader'],
  tanker: ['Sabine Spirit', 'Permian Dawn', 'Neches Voyager', 'Llano Estacado', 'Aransas Pioneer', 'Big Thicket'],
  bulk: ['Brazos Harvest', 'Panhandle Grain', 'Rio Bravo', 'Caprock Ridge'],
  chemical: ['Bay Chemist', 'Clear Lake', 'Pelican Point', 'Ship Channel Star'],
  shrimp: ['Miss Amelia', 'Lady Grace', 'Miss Lupita', 'Sea Darlin’', 'Gulf Pearl', 'Lady Aransas', 'Miss Carmen', 'Bayou Belle', 'Miss Palacios', 'Capt. Delgado'],
  cutter: ['Skimmer', 'Sabal'],
};
const SHIP_PREFIX = { container: 'MV', bulk: 'MV', tanker: 'MT', chemical: 'MT', shrimp: '', cutter: 'USCGC' };
const TYPE_LABEL = { container: 'container ship', tanker: 'tanker', bulk: 'bulker', chemical: 'chemical carrier', shrimp: 'shrimp boat', cutter: 'Coast Guard cutter' };
const SHIP_TOAST_R = 60, SHIP_REARM_R = 90;

// VHF channel 16 — the scanner frame (chatter.js pattern): {token}-gated
// pools, so a line only plays when every token is live; nothing is invented.
// maritime owns its transmitter (the trains onChatter idiom) — radio.js stays
// aviation-scoped. Humor rationed ~1-in-4 (the chatter law).
const VHF_GAP_MIN = 25, VHF_GAP_VAR = 35, VHF_FLOOR = 14;
const VHF_R = 90, VHF_BOAT_R = 220; // audible near vessels/ports; BOAT extends the ear (W3 handheld lifts it entirely)
const VHF_POOLS = {
  pilot: [ // big ship with a port close aboard — boarding + berth work
    { t: '{port} traffic, {ship}, pilot aboard, commencing the inbound run.' },
    { t: '{port} pilots, {ship}, off the station, ready for boarding.' },
    { t: '{ship}, tug alongside — we have your lines when you’re at the wall.' },
    { t: '{port} ops, {ship}, berth is clear, bring her in on the flood.' },
    { t: '{ship}, {port} harbormaster — hold for the outbound tow, then she’s all yours.' },
  ],
  traffic: [ // big ship out on the trunk / mid-approach
    { t: 'All stations, {ship}, coastwise en route {dest}, standing by one-six.' },
    { t: '{ship}, steady on, {wx} out here, seas easy.' },
    { t: '{ship} — engine room answers all bells. {dest} on schedule.' },
    { t: '{ship}, watch change on the hour. Coffee’s gone again.', funny: true },
  ],
  fleet: [ // shrimpers, only while working the grounds
    { t: '{ship}, try net’s comin’ up. Decent count this drag.' },
    { t: '{ship} here — good water, keepin’ the rigs down a while yet.' },
    { t: '{ship} — gulls found us again. No secrets out here.', funny: true },
    { t: '{ship}, we’ll head the fleet home ’fore the light goes.' },
  ],
  patrol: [ // cutters — routine traffic + the rationed securité
    { t: '{ship}, underway on routine patrol, out.' },
    { t: '{ship} to {port} traffic — maintain your interval in the channel, thank you kindly.' },
    { t: 'Sécurité, sécurité — all stations, this is {ship}: shrimp fleet working {port} grounds, give the tows a wide berth. Out.' },
    { t: 'Sécurité — all stations, {ship}: {wx} over the gulf this afternoon. Small craft, mind the weather. Out.' },
  ],
};
const VHF_TOKEN = /\{(\w+)\}/g;
const vhfTokens = (t) => [...t.matchAll(VHF_TOKEN)].map((m) => m[1]);
const vhfFill = (t, ctx) => t.replace(VHF_TOKEN, (_, k) => ctx[k]);
const nextVhfCooldown = (name, n) => VHF_GAP_MIN + seededRand(`shipid:chat:${name}:${n}`)() * VHF_GAP_VAR;

// The shrimp fleet — 5 real fishing ports, 2 boats each. Hand-laid transit
// paths (harbor → pass → ground disc): straight lines would cross the barrier
// islands, so each path threads its real pass. Brownsville's harbor is NOT
// game water (roadstead law) — its pair homes at the baked roadstead.
// Dawn-out / dusk-home on the game clock (sky.t), per-boat seeded offsets.
const DAWN_T = 0.24, DUSK_T = 0.72;
// Every point below is probe-verified boatableAt gulf water (2026-07-23) —
// hand-laid literals where the raw LL projection landed dry (harbor shorelines
// render land at this scale; the first Brownsville ground sat south of the
// Rio Grande, outside the world).
const FISHING = [
  { id: 'galveston', name: 'Galveston', pts: [[4512.8, 1889], LL(29.33, -94.7), LL(29.21, -94.52)] }, // home = the baked port berth in the channel
  { id: 'palacios', name: 'Palacios', pts: [LL(28.68, -96.22), LL(28.52, -96.3), LL(28.36, -96.32), LL(28.26, -96.2)] },
  { id: 'aransaspass', name: 'Aransas Pass', pts: [LL(27.9, -97.12), LL(27.838, -97.035), LL(27.72, -96.88)] },
  { id: 'portisabel', name: 'Port Isabel', pts: [[2204.2, 5482.5], [2251.9, 5488.1], LL(26.15, -97.03)] }, // waterfront + Brazos Santiago pass (≈26.075/-97.19, 26.07/-97.14)
  { id: 'brownsville', name: 'Brownsville', pts: [[2262, 5472], [2337.8, 5566]] }, // roadstead home (harbor is not game water) → ground ≈26.0/-97.05, north of the border
];

export class MaritimeSystem {
  constructor(scene, sky, landmarks = []) {
    this.landmarks = landmarks; // W3 marina standoff (passed in — importing gameplay.js here would cycle via vehicle.js)
    this.sky = sky; // Energy W4: rig decks register into sky's local light pool
    // emissive glow materials (rig flares, work lights, buoy lamp) — opacity
    // driven by ATMOS.night in update; fog:false so the horizon skyline
    // survives scene fog (sky.js owns all real lights, these are just glow)
    const mkGlow = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, fog: false, blending: THREE.AdditiveBlending, depthWrite: false });
    this.rigGlow = mkGlow(0xffa848);
    this.workGlow = mkGlow(0xfff0c0);
    // Energy W2 offshore rebase: platforms are the 227 real baked sites (153
    // majors, 74 minor clusters); the hand-laid seven retired (realism-first).
    // The Far Rig re-anchors to the farthest real major the player can reach —
    // the world wall caps the shelf at 1127u (~70 mi); deepwater spars beyond
    // it still render as horizon dressing but can't carry the brass.
    this.farSite = GEO.energy.platforms
      .filter((p) => p.tier === 'major' && inWorld(p.x, p.z))
      .reduce((b, p) => (!b || coastDist(p.x, p.z) > coastDist(b.x, b.z) ? p : b), null);
    this.farMiles = this.farSite ? coastDist(this.farSite.x, this.farSite.z) / 16.09 : 0;
    // routes first: arc-length tables for ships + the trunk accessor
    this.routes = GEO.sea.routes.map((r) => {
      const cum = [0];
      for (let i = 1; i < r.pts.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]));
      }
      return { ...r, cum, len: cum[cum.length - 1] };
    });
    this.trunk = this.routes.find((r) => r.kind === 'trunk');
    this.len = this.trunk?.len ?? 1; // laneAt() domain (rotors.js CG patrol)
    this.buildPorts(scene);
    this.buildPlatforms(scene);
    this.usedNames = new Set(); // per-boot placard dedup — linear probe keeps the pick seeded
    this.ships = this.buildShips(scene);
    // Sea W2: cutters + the shrimp fleet + VHF transmitter state
    this.cutters = this.buildCutters(scene);
    this.shrimpers = this.buildShrimpers(scene);
    this.updateShrimpers(0, 0); // fleet stands at its moorings before frame one
    this.onIdentity = null; // (text) => placard toast (trains idiom)
    this.onChatter = null;  // (text, voice) => audio.radio + hud.subtitle
    this.vhfFloor = 0;      // global floor between any two channel-16 lines
    // Sea-Industry W3: shrimp rig hold — crate count is the check surface,
    // catchT is the trolling accumulator (paused, never reset, on a brief gap)
    this.catch = 0;
    this.catchT = 0;
    this.onCatch = null;    // (pay, msg) => toast (+bank when pay > 0)
    this.buoy = this.buildBuoy(scene);
    // Water Vehicles W3: small-craft marinas + ICW channel markers
    this.marinas = this.buildMarinas(scene);
    this.icw = this.buildICW(scene);
    // shelf plaques — readable brass, NOT landmarks (the counters stay sacred);
    // main.js's unified plaqueNear consults this list as its third source
    const fs = this.farSite;
    this.plaques = [
      {
        name: 'Tidelands Buoy', at: BUOY_AT, hint: 'read the channel buoy', sub: 'Three marine leagues',
        text: 'A republic drives a hard bargain. When Texas traded its flag for a star in 1845, it kept what no other Gulf state was given: three marine leagues of open sea — 10.36 miles of water, bed, and everything beneath it. You are floating on the line. Landward of this buoy, Texas. Seaward, the federal shelf and the deep blue.',
      },
      {
        name: 'The Far Rig', at: fs ? [fs.x, fs.z] : BUOY_AT, hint: 'read the brass plate', sub: `${this.farMiles.toFixed(1)} miles out`,
        text: `${fs?.name ?? 'The farthest platform'} — the farthest platform off this coast, ${Math.round(this.farMiles)} miles from the sand, long past the blue line, alone.${fs?.operator ? ` ${fs.operator} crews` : ' Crews'} rotate out by helicopter, two weeks at a stretch. At night her flare is the only thing on the whole horizon that stays put, and the shrimpers steer home by her like a lit porch.`,
      },
    ];
  }

  // position + tangent at arc-length s along a route polyline
  routeAt(route, s) {
    let lo = 0;
    while (lo < route.cum.length - 2 && route.cum[lo + 1] <= s) lo++;
    const a = route.pts[lo], b = route.pts[lo + 1];
    const seg = route.cum[lo + 1] - route.cum[lo] || 1;
    const t = (s - route.cum[lo]) / seg;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (b[0] - a[0]) / seg, (b[1] - a[1]) / seg];
  }

  // trunk-route accessor, wrap-around — the old LANE's contract (rotors.js)
  laneAt(s) {
    s = ((s % this.len) + this.len) % this.len;
    return this.routeAt(this.trunk, s);
  }

  // debug/tour forcing (trains.force idiom): jump the nearest-route ship to
  // the route arc-length closest to (x,z) — deterministic, no spawn
  force(x, z) {
    let best = null;
    for (const s of this.ships) {
      if (!s.route) continue;
      for (let i = 0; i < s.route.pts.length; i++) {
        const [px, pz] = s.route.pts[i];
        const d = Math.hypot(px - x, pz - z);
        if (!best || d < best.d) best = { d, ship: s, s: s.route.cum[i] };
      }
    }
    if (!best) return null;
    best.ship.s = Math.min(best.ship.route.len, Math.max(0, best.s));
    return best.ship;
  }

  // Sea W2 identity — one per vessel, built at construction, stable for life.
  // seedKey names the stream slot; homeId (shrimpers) fixes the "out of" port.
  buildShipId(type, seedKey, homeName = null) {
    const rnd = seededRand('shipid:' + seedKey);
    const pool = SHIP_NAMES[type];
    let pick = (rnd() * pool.length) | 0;
    for (let probe = 0; probe < pool.length && this.usedNames.has(type + pool[pick]); probe++) pick = (pick + 1) % pool.length;
    this.usedNames.add(type + pool[pick]);
    const name = (SHIP_PREFIX[type] ? SHIP_PREFIX[type] + ' ' : '') + pool[pick];
    const voice = { p: 0.8 + rnd() * 0.35, r: 0.85 + rnd() * 0.3 };
    // trip ends from the baked ports — character-matched where possible
    let orig = null, dest = null;
    if (type !== 'shrimp' && type !== 'cutter') {
      const ports = GEO.sea.ports;
      const match = ports.filter((p) => p.character === type);
      const a = (match.length ? match : ports)[(rnd() * (match.length ? match.length : ports.length)) | 0];
      const rest = ports.filter((p) => p !== a);
      const b = rest[(rnd() * rest.length) | 0];
      [orig, dest] = rnd() < 0.5 ? [a.name, b.name] : [b.name, a.name];
    }
    return { name, orig, dest, home: homeName, voice, toasted: false, chatN: 1, chatT: nextVhfCooldown(name, 0) };
  }

  // the ⚓ placard — every vessel announces itself once per approach
  shipText(s) {
    const id = s.id;
    if (s.type === 'cutter') return `🛥️ ${id.name} — Coast Guard cutter · on patrol`;
    if (s.type === 'shrimp') return `🚤 ${id.name} — shrimp boat · out of ${id.home}`;
    return `🚢 ${id.name} — ${TYPE_LABEL[s.type]} · ${id.orig} → ${id.dest}`;
  }

  // arc-length on the trunk nearest (x,z) — the CG-heli joint stage needs it
  trunkS(x, z) {
    let bs = 0, bd = Infinity;
    for (let i = 0; i < this.trunk.pts.length; i++) {
      const d = Math.hypot(this.trunk.pts[i][0] - x, this.trunk.pts[i][1] - z);
      if (d < bd) { bd = d; bs = this.trunk.cum[i]; }
    }
    return bs;
  }

  // tours/harness: jump the nearest cutter to the route point closest to (x,z)
  forceCutter(x, z) {
    let best = null;
    for (const c of this.cutters) {
      for (let i = 0; i < c.route.pts.length; i++) {
        const d = Math.hypot(c.route.pts[i][0] - x, c.route.pts[i][1] - z);
        if (!best || d < best.d) best = { d, c, s: c.route.cum[i] };
      }
    }
    if (!best) return null;
    best.c.s = Math.min(best.c.route.len, Math.max(0, best.s));
    return best.c;
  }

  // tours/harness: key channel 16 right now — nearest vessel to (x,z) speaks
  // its seeded next line, cooldowns bypassed. Returns the line (null = nobody).
  forceChatter(x, z) {
    let best = null;
    for (const s of [...this.ships, ...this.shrimpers]) {
      const d = Math.hypot(s.g.position.x - x, s.g.position.z - z);
      if (!best || d < best.d) best = { d, s };
    }
    if (!best) return null;
    const line = this.vhfLine(best.s);
    if (!line) return null;
    this.onChatter?.(line, best.s.id.voice);
    best.s.id.chatT = nextVhfCooldown(best.s.id.name, best.s.id.chatN++);
    this.vhfFloor = VHF_FLOOR;
    return line;
  }

  // tours/harness: the whole fleet snapped to its grounds in working trim
  forceShrimpDay() {
    for (const b of this.shrimpers) { b.p = 1; b.r = b.trawlR; b.working = true; }
    return this.shrimpers.length;
  }

  // live positions of boats working a ground — animals.js gulls ride these
  // (main.js wires the bridge; no animals→maritime import)
  workingShrimpers() {
    const out = [];
    for (const b of this.shrimpers) if (b.working) out.push({ x: b.g.position.x, z: b.g.position.z });
    return out;
  }

  // seeded next channel-16 line for a vessel, token-gated (null = nothing live)
  vhfLine(s) {
    const id = s.id;
    let port = null, pd = Infinity;
    for (const p of GEO.sea.ports) {
      const d = Math.hypot(p.x - s.g.position.x, p.z - s.g.position.z);
      if (d < pd) { pd = d; port = p; }
    }
    const ctx = {
      ship: id.name,
      dest: id.dest,
      wx: ATMOS.weather,
      port: s.type === 'shrimp' ? id.home : pd < 150 ? port.name : s.type === 'cutter' && pd < 400 ? port.name : null,
    };
    const event = s.type === 'cutter' ? 'patrol'
      : s.type === 'shrimp' ? (s.working ? 'fleet' : null)
        : pd < 120 ? 'pilot' : 'traffic';
    if (!event) return null;
    const ok = (VHF_POOLS[event] ?? []).filter((l) => vhfTokens(l.t).every((k) => ctx[k] != null));
    if (!ok.length) return null;
    const r = seededRand(`shipid:line:${id.name}:${id.chatN}`);
    const funny = ok.filter((l) => l.funny), plain = ok.filter((l) => !l.funny);
    const set = r() < 0.25 && funny.length ? funny : plain.length ? plain : funny;
    return vhfFill(set[Math.floor(r() * set.length)].t, ctx);
  }

  buildPorts(scene) {
    // Sea W1: one merged vertex-colored mesh per port (8 draws), kit picked by
    // baked character, W6b poly bar (10-12 radial segments on tanks/silos).
    // Local frame: wharf long axis on x, open water toward +z; the whole kit
    // rotates to face the port's berth (or roadstead when the harbor is not
    // game water — Beaumont / Port Arthur / Brownsville).
    const tint = (geo, hex) => {
      const g = geo.toNonIndexed(), c = new THREE.Color(hex);
      const n = g.attributes.position.count, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      return g;
    };
    const COL = {
      crane: 0xc85a28, steel: 0x8a8f98, shed: 0xb0a890, dark: 0x4a4a52,
      tankA: 0xe8e5dc, tankB: 0xd8d0c0, silo: 0xcfc8b8,
      boxes: [0xc23b3b, 0x3b62c2, 0x3f7a3f, 0xd8a13b, 0x5e8a8a],
    };
    this.portGlowSpots = []; // night work-lights, one instanced mesh below
    for (const port of GEO.sea.ports) {
      const y = hAt(port.x, port.z);
      const parts = [];
      const add = (geo, hex, x, py, z, ry = 0) => {
        if (ry) geo.rotateY(ry);
        geo.translate(x, py, z);
        parts.push(tint(geo, hex));
      };
      // wharf apron + a warehouse — every character
      add(new THREE.BoxGeometry(42, 0.8, 11), COL.steel, 0, 0.4, 0);
      add(new THREE.BoxGeometry(9, 2.8, 5.5), COL.shed, -14, 2.2, -2);
      const ch = port.character;
      if (ch === 'container') {
        // gantry silhouette needs the boom to READ (the port-shot judgment:
        // thin poles don't) — sturdy A-legs, long boom over the water with a
        // counterweight tail and a trolley cab mid-boom
        const nCranes = port.id === 'houston' ? 4 : 3;
        for (let i = 0; i < nCranes; i++) {
          const cx = -9 + i * (port.id === 'houston' ? 7 : 8);
          for (const lx of [-1.7, 1.7]) add(new THREE.BoxGeometry(0.8, 7.5, 0.8), COL.crane, cx + lx, 4.55, 2);
          add(new THREE.BoxGeometry(4.2, 0.6, 0.8), COL.crane, cx, 8, 2); // portal cross-beam
          add(new THREE.BoxGeometry(0.8, 0.8, 14), COL.crane, cx, 8.9, 4.5); // boom, water-reaching
          add(new THREE.BoxGeometry(1.6, 1.6, 1.6), COL.dark, cx, 8.9, -2.2); // counterweight tail
          add(new THREE.BoxGeometry(1.4, 1.2, 1.4), COL.steel, cx, 7.9, 6.5); // trolley cab
        }
        const rows = port.id === 'houston' ? 20 : 12;
        for (let i = 0; i < rows; i++) {
          add(new THREE.BoxGeometry(1.2, 1.1, 2.6), COL.boxes[i % 5],
            -12 + (i % 5) * 3.4, 1.35 + Math.floor(i / 10) * 1.15, -3.5 - Math.floor((i % 10) / 5) * 3);
        }
      } else if (ch === 'tanker') {
        for (let i = 0; i < 5; i++) {
          add(new THREE.CylinderGeometry(2.3, 2.3, 2.4, 12), i === 2 ? COL.tankB : COL.tankA, -13 + i * 6.5, 2, -4);
        }
        add(new THREE.BoxGeometry(26, 0.5, 1), COL.dark, -1, 2.2, 0.5); // pipe rack
        add(new THREE.BoxGeometry(0.7, 5.5, 0.7), COL.crane, 14, 3.55, 3); // loading arm mast
        add(new THREE.BoxGeometry(0.5, 0.5, 4.5), COL.crane, 14, 6, 5);
      } else if (ch === 'chemical') {
        for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(1.8, 1.8, 3.2, 12), COL.tankA, -12 + i * 5, 2.4, -4);
        for (let i = 0; i < 2; i++) add(new THREE.SphereGeometry(1.9, 10, 8), COL.tankB, 6 + i * 5.5, 2.7, -4);
        add(new THREE.CylinderGeometry(0.4, 0.45, 7, 10), COL.steel, 15, 4.3, -4); // process stack
      } else { // bulk
        add(new THREE.BoxGeometry(11, 3.2, 6), COL.shed, 8, 2.4, -3);
        for (let i = 0; i < 5; i++) add(new THREE.CylinderGeometry(1.5, 1.5, 5, 10), COL.silo, -12 + i * 3.4, 3.3, -4);
        const belt = new THREE.BoxGeometry(15, 0.5, 1.2);
        belt.rotateZ(0.32);
        add(belt, COL.dark, -4, 4.2, -1.5); // conveyor up to the silo tops
      }
      // face the water: +z_local -> berth (or roadstead)
      const [wx, wz] = port.berth ?? port.roadstead;
      const heading = Math.atan2(wx - port.x, wz - port.z);
      const merged = mergeGeoms(parts);
      merged.rotateY(heading);
      merged.translate(port.x, y, port.z);
      const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
      mesh.name = `port:${port.id}`; // sea suite anchor
      scene.add(mesh);
      // two night work-lights over the wharf
      for (const lx of [-14, 14]) {
        this.portGlowSpots.push([port.x + Math.cos(heading) * lx, y + 7, port.z - Math.sin(heading) * lx]);
      }
    }
    const glowI = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 6, 5), this.workGlow, this.portGlowSpots.length);
    const m = new THREE.Matrix4();
    this.portGlowSpots.forEach((p, i) => glowI.setMatrixAt(i, m.makeTranslation(...p)));
    scene.add(glowI);
  }

  buildPlatforms(scene) {
    // The 227 real baked sites, instanced per component (traffic idiom — a
    // group per rig would cost ~2000 draw calls). Majors get the full rig
    // silhouette; minor clusters a lighter, lower build scaled down. The Far
    // Rig alone stays a bespoke group — bigger everything, helipad, its brass.
    const steel = new THREE.MeshLambertMaterial({ color: 0xb0a020, flatShading: true });
    const dark = new THREE.MeshLambertMaterial({ color: 0x4a4a52, flatShading: true });
    const flareMat = new THREE.MeshBasicMaterial({ color: 0xff8830 });
    this.platforms = GEO.energy.platforms; // site records — data, not groups
    const rest = this.platforms.filter((p) => p !== this.farSite);
    const nLegs = rest.length * 4;
    const legI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.35, 6, 8), dark, nLegs);
    const deckI = new THREE.InstancedMesh(new THREE.BoxGeometry(6.5, 0.7, 6.5), steel, rest.length);
    const modI = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 1.8, 2.4), dark, rest.length);
    const majors = rest.filter((p) => p.tier === 'major');
    const derrickI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.7, 5, 8), steel, majors.length);
    const flareI = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 6, 5), flareMat, majors.length);
    const glowI = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), this.rigGlow, rest.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const rnd = seededRand('rig:rebase');
    let li = 0, mi = 0;
    rest.forEach((p, i) => {
      const major = p.tier === 'major';
      const s = major ? 1 : 0.62;         // minor clusters read lower and lighter
      const deckY = major ? SEA + 5 : SEA + 3.6;
      const legS = (deckY - SEA + 1) / 6; // legs run seabed-side to deck (6-unit prototype)
      const rot = rnd() * Math.PI * 2;
      q.setFromAxisAngle(v.set(0, 1, 0), rot);
      const cr = Math.cos(rot), sr = Math.sin(rot);
      const at = (lx, ly, lz, sx = s, sy = s, sz = s) =>
        m.compose(v.set(p.x + (lx * cr + lz * sr) * s, ly, p.z + (-lx * sr + lz * cr) * s), q, sc.set(sx, sy, sz));
      for (const [lx, lz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
        legI.setMatrixAt(li++, at(lx, deckY - 3 * legS, lz, s, legS, s));
      }
      deckI.setMatrixAt(i, at(0, deckY, 0));
      modI.setMatrixAt(i, at(-1, deckY + 1.3 * s, -1));
      if (major) {
        derrickI.setMatrixAt(mi, at(1.8, deckY + 0.35 + 2.5, 1.5));
        flareI.setMatrixAt(mi, at(1.8, deckY + 0.35 + 5.4, 1.5));
        mi++;
      }
      // night glow at the top of the structure — from Malaquite the horizon
      // gets a skyline; minors glow smaller and lower
      glowI.setMatrixAt(i, major
        ? at(1.8, deckY + 0.35 + 5.4, 1.5, 1.5, 1.5, 1.5)
        : at(0, deckY + 0.8, 0, 0.9, 0.9, 0.9));
    });
    // W4 spill decals: warm glow pooled on the water under every platform —
    // flat circles floating above the one gulf plane (deck y-stagger, never a
    // second water plane); opacity rides ATMOS.night in update via spillMat.
    // vertex-colored radial falloff: rim fades to black, which under additive
    // blending IS transparent — soft pool edge with no extra material
    this.spillMat = new THREE.MeshBasicMaterial({ color: 0xff9040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, vertexColors: true });
    const spillGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
    fadeDisc(spillGeo);
    const spillI = new THREE.InstancedMesh(spillGeo, this.spillMat, rest.length);
    rest.forEach((p, i) => {
      const r = p.tier === 'major' ? 7 : 4;
      m.compose(v.set(p.x, -2.28, p.z), q.identity(), sc.set(r, 1, r));
      spillI.setMatrixAt(i, m);
    });
    for (const inst of [legI, deckI, modI, derrickI, flareI, glowI, spillI]) scene.add(inst);
    // W4 light pool: major work decks put real light on the water/deck at
    // close range (warm white); flare tips flicker orange. Minors stay
    // emissive-only — the pool only ever serves the nearest ~6 anchors.
    for (const p of rest) {
      if (p.tier !== 'major') continue;
      this.sky?.registerGlowAnchor({ x: p.x, z: p.z, y: SEA + 7, kind: 'rig' });
    }

    // the Far Rig — bespoke, upgraded: the farthest real major off the coast
    if (this.farSite) {
      const g = new THREE.Group();
      const s = 1.5;
      for (const [lx, lz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * s, 0.35 * s, 6, 8), dark);
        leg.position.set(lx * s, SEA + 2, lz * s);
        g.add(leg);
      }
      const deck = new THREE.Mesh(new THREE.BoxGeometry(6.5 * s, 0.7, 6.5 * s), steel);
      deck.position.y = SEA + 5;
      const mod = new THREE.Mesh(new THREE.BoxGeometry(3, 1.8, 2.4), dark);
      mod.position.set(-1 * s, SEA + 6.3, -1 * s);
      const derrick = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.7, 5 * s, 8), steel);
      derrick.position.set(1.8 * s, SEA + 5.35 + 2.5 * s, 1.5 * s);
      const flare = new THREE.Mesh(new THREE.SphereGeometry(0.3 * s, 6, 5), flareMat);
      flare.position.set(1.8 * s, SEA + 5.35 + 5 * s + 0.4, 1.5 * s);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 6), this.rigGlow);
      glow.position.copy(flare.position);
      const mod2 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 2.2), new THREE.MeshLambertMaterial({ color: 0xd8d0c0, flatShading: true }));
      mod2.position.set(-2.2, SEA + 6.7, 2.4);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.25, 8), dark);
      pad.position.set(3.6, SEA + 6.2, -3.4);
      const padLight = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 5), this.workGlow);
      padLight.position.set(3.6, SEA + 6.8, -3.4);
      g.add(deck, mod, derrick, flare, glow, mod2, pad, padLight);
      g.position.set(this.farSite.x, 0, this.farSite.z);
      g.userData.far = true;
      scene.add(g);
      this.farRig = g;
      // Far Rig: bigger spill + a flare-kind anchor at the flame itself
      const spill = new THREE.Mesh(fadeDisc(new THREE.CircleGeometry(11, 24).rotateX(-Math.PI / 2), 11), this.spillMat);
      spill.position.set(this.farSite.x, -2.26, this.farSite.z);
      scene.add(spill);
      this.sky?.registerGlowAnchor({ x: this.farSite.x + 1.8 * 1.5, z: this.farSite.z + 1.5 * 1.5, y: SEA + 5.35 + 5 * 1.5, kind: 'flare' });
    }
  }

  buildBuoy(scene) {
    // red nun buoy bobbing on the Tidelands line itself
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, 1.6, 8), new THREE.MeshLambertMaterial({ color: 0xc23b30, flatShading: true }));
    body.position.y = SEA + 0.7;
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.3, 5), new THREE.MeshLambertMaterial({ color: 0x4a4a52, flatShading: true }));
    cage.position.y = SEA + 2.1;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 6, 5), this.workGlow);
    lamp.position.y = SEA + 2.9;
    g.add(body, cage, lamp);
    g.position.set(BUOY_AT[0], 0, BUOY_AT[1]);
    scene.add(g);
    return g;
  }

  // Water Vehicles W3: small-craft marinas — dock dressing at the real ports
  // and one seeded shoreline site per baked lake. Flavor sites, never gates
  // (the V cycle stays position-gated). One merged vertex-colored mesh for all
  // sites; decks float above the water plane on a y-stagger (one-gulf-plane
  // law — never a second water surface).
  buildMarinas(scene) {
    const sites = [];
    // 32u landmark standoff — the Galveston south march once parked the docks
    // under the Pleasure Pier wheel and the kit read as ride clutter
    const lmClear = (x, z) => this.landmarks.every((l) => Math.hypot(l.at[0] - x, l.at[1] - z) > 32);
    // ports: march the compass out from the wharf until open water takes over.
    // 30u minimum standoff — closer in, the kit merges into the crane/wharf
    // dressing and reads as port clutter, not its own small-craft site
    for (const port of GEO.sea.ports) {
      const px = port.x, pz = port.z;
      let best = null;
      for (let a = 0; a < 16; a++) {
        const dx = Math.sin((a / 16) * Math.PI * 2), dz = Math.cos((a / 16) * Math.PI * 2);
        for (let d = 30; d <= 60; d += 2) {
          const x = px + dx * d, z = pz + dz * d;
          if (!boatableAt(x, z) || !boatableAt(x + dx * 5, z + dz * 5)) continue;
          if (!lmClear(x + dx * 5, z + dz * 5)) break; // this radial ends at a landmark — try the next
          if (!best || d < best.d) best = { d, x: x + dx * 5, z: z + dz * 5, dx, dz };
          break;
        }
      }
      if (best) sites.push({ name: `${port.name} marina`, x: best.x, z: best.z, y: SEA_Y, heading: Math.atan2(-best.dx, -best.dz), kind: 'port' });
    }
    // lakes: seeded shore vertex, chapelAt-pattern legality (road-clear ≥5,
    // airport-clear), nudged inward until the pier head floats over water
    for (const lake of GEO.lakes) {
      const rnd = seededRand('marina:' + lake.name);
      const n = lake.pts.length, start = Math.floor(rnd() * n);
      let cx = 0, cz = 0;
      for (const [x, z] of lake.pts) { cx += x / n; cz += z / n; }
      for (let i = 0; i < n; i++) {
        const [sx, sz] = lake.pts[(start + i) % n];
        if (nearestRoad(sx, sz, 5) || !airportClear(sx, sz) || !lmClear(sx, sz)) continue;
        const dd = Math.hypot(cx - sx, cz - sz) || 1;
        const dx = (cx - sx) / dd, dz = (cz - sz) / dd;
        const x = sx + dx * 3.5, z = sz + dz * 3.5;
        if (!boatableAt(x, z) || !boatableAt(x + dx * 5, z + dz * 5)) continue;
        sites.push({ name: `${lake.name} marina`, x, z, y: lake.level, heading: Math.atan2(-dx, -dz), kind: 'lake' });
        break;
      }
    }
    // the kit: pier + T-head + finger slips, pilings, moored hulls, bait shack
    const tint = (geo, hex) => {
      const g = geo.toNonIndexed(), c = new THREE.Color(hex);
      const m = g.attributes.position.count, arr = new Float32Array(m * 3);
      for (let i = 0; i < m; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      return g;
    };
    const parts = [];
    const KIT = [
      // [w, h, d, x, y, z, color] — local frame: -z seaward, y 0 at water level
      [1.1, 0.22, 7.6, 0, 0.42, 0, 0x9a7a55],       // main pier (reaches the shore platform)
      [4.6, 0.22, 1.1, 0, 0.42, -3.9, 0x9a7a55],    // T-head
      [1.6, 0.18, 0.5, -1.35, 0.40, -1.2, 0x9a7a55], // finger slips
      [1.6, 0.18, 0.5, 1.35, 0.40, -1.2, 0x9a7a55],
      [1.6, 0.18, 0.5, -1.35, 0.40, 0.8, 0x9a7a55],
      [1.6, 0.18, 0.5, 1.35, 0.40, 0.8, 0x9a7a55],
      // pilings poke above the deck so the pier reads as standing on posts
      [0.22, 1.0, 0.22, -2.2, 0.35, -3.9, 0x4a4038],
      [0.22, 1.0, 0.22, 2.2, 0.35, -3.9, 0x4a4038],
      [0.22, 1.0, 0.22, -0.66, 0.35, -1.2, 0x4a4038],
      [0.22, 1.0, 0.22, 0.66, 0.35, 0.8, 0x4a4038],
      [0.22, 1.0, 0.22, -0.66, 0.35, 3.3, 0x4a4038],
      [0.22, 1.0, 0.22, 0.66, 0.35, 3.3, 0x4a4038],
      [0.7, 0.3, 1.7, -1.15, 0.18, -0.2, 0xeef0ea],  // moored small craft
      [0.7, 0.3, 1.7, 1.15, 0.18, -0.2, 0xeef0ea],
      [0.7, 0.3, 1.7, -1.15, 0.18, 1.8, 0xeef0ea],
      [0.5, 0.35, 0.6, -1.15, 0.45, -0.4, 0x2563b0], // a cabin or two
      [0.5, 0.35, 0.6, 1.15, 0.45, 1.6, 0x3f7a3f],
      [0.7, 0.3, 1.7, 1.15, 0.18, 1.8, 0xeef0ea],
      [1.8, 0.26, 2.0, 0, 0.36, 4.3, 0x8a6c49],      // shore platform — a step below the pier deck (no coplanar tops)
      [1.3, 0.9, 1.0, 0, 0.94, 4.3, 0xe8e0cc],       // bait shack
      [1.5, 0.2, 1.2, 0, 1.46, 4.3, 0x8a3b2e],       // its red roof
    ];
    for (const s of sites) {
      for (const [w, h, d, x, y, z, col] of KIT) {
        const g = tint(new THREE.BoxGeometry(w, h, d), col);
        g.translate(x, y, z);
        g.rotateY(s.heading);
        g.translate(s.x, s.y, s.z);
        parts.push(g);
      }
    }
    if (parts.length) {
      const mesh = new THREE.Mesh(mergeGeoms(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
      scene.add(mesh);
    }
    return sites;
  }

  // Water Vehicles W3: ICW channel markers — red/green pairs every ~25u down
  // the lagoon, instanced (2 draw calls). Red rides the mainland (west) side,
  // "red right returning"; pairs that would sit on land or spoil drop out.
  buildICW(scene) {
    const spots = [];
    for (let i = 1; i < ICW.length; i++) {
      const [ax, az] = ICW[i - 1], [bx, bz] = ICW[i];
      const len = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / len, tz = (bz - az) / len;
      for (let s = i === 1 ? 0 : 12.5; s < len; s += 25) {
        const x = ax + tx * s, z = az + tz * s;
        const l = { x: x + tz * 1.6, z: z - tx * 1.6 }, r = { x: x - tz * 1.6, z: z + tx * 1.6 };
        const red = l.x < r.x ? l : r, green = l.x < r.x ? r : l;
        if (boatableAt(red.x, red.z) && boatableAt(green.x, green.z)) spots.push({ red, green });
      }
    }
    const mk = (geo, color) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color, flatShading: true }), spots.length);
      m.frustumCulled = false; // one instance run spans the whole lagoon
      scene.add(m);
      return m;
    };
    const nuns = mk(new THREE.ConeGeometry(0.28, 0.8, 6), 0xc23b30);
    const cans = mk(new THREE.CylinderGeometry(0.26, 0.26, 0.65, 6), 0x2f8a4a);
    const M = new THREE.Matrix4();
    spots.forEach(({ red, green }, i) => {
      nuns.setMatrixAt(i, M.makeTranslation(red.x, SEA_Y + 0.38, red.z));
      cans.setMatrixAt(i, M.makeTranslation(green.x, SEA_Y + 0.35, green.z));
    });
    return { pairs: spots.length, spots, pts: ICW };
  }

  // shelf plaques (buoy + Far Rig) for main.js's unified plaque lookup
  plaqueNear(pos, range) {
    for (const p of this.plaques)
      if (Math.hypot(pos.x - p.at[0], pos.z - p.at[1]) < range) return p;
    return null;
  }

  buildShips(scene) {
    const ships = [];
    const mkCargo = (tint) => {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 13), new THREE.MeshLambertMaterial({ color: tint, flatShading: true }));
      hull.position.y = SEA + 0.5;
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 1.6), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
      bridge.position.set(0, SEA + 2.4, 5);
      g.add(hull, bridge);
      const cols = [0xc23b3b, 0x3b62c2, 0x3f7a3f, 0xd8a13b];
      for (let i = 0; i < 8; i++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.2), new THREE.MeshLambertMaterial({ color: cols[i % 4] }));
        c.position.set(0, SEA + 1.8 + (i % 2) * 0.95, -4.5 + Math.floor(i / 2) * 2.4);
        g.add(c);
      }
      return g;
    };
    const mkTanker = () => {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.5, 14), new THREE.MeshLambertMaterial({ color: 0x8a3a3a, flatShading: true }));
      hull.position.y = SEA + 0.45;
      const deckTank = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 9, 8).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xd8d0c0 }));
      deckTank.position.set(0, SEA + 1.7, -1.5);
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 1.6), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
      bridge.position.set(0, SEA + 2.3, 5.5);
      g.add(hull, deckTank, bridge);
      return g;
    };
    const mkBulker = () => {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 13.5), new THREE.MeshLambertMaterial({ color: 0x5a4a42, flatShading: true }));
      hull.position.y = SEA + 0.5;
      g.add(hull);
      // hatch covers down the deck, low derrick posts between them
      const hatchMat = new THREE.MeshLambertMaterial({ color: 0x9a4a3a });
      const postMat = new THREE.MeshLambertMaterial({ color: 0xd8d0c0 });
      for (let i = 0; i < 4; i++) {
        const hatch = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 2.2), hatchMat);
        hatch.position.set(0, SEA + 1.5, -4.5 + i * 2.9);
        g.add(hatch);
        if (i < 3) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.6, 0.35), postMat);
          post.position.set(0.9, SEA + 2.6, -3 + i * 2.9);
          g.add(post);
        }
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 1.6), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
      bridge.position.set(0, SEA + 2.4, 5.4);
      g.add(bridge);
      return g;
    };
    const mkChemical = () => {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 12.5), new THREE.MeshLambertMaterial({ color: 0xc8c4b8, flatShading: true }));
      hull.position.y = SEA + 0.45;
      g.add(hull);
      // round deck tanks — the chemical carrier's silhouette
      const tankMat = new THREE.MeshLambertMaterial({ color: 0xe8e5dc });
      for (let i = 0; i < 3; i++) {
        const tank = new THREE.Mesh(new THREE.SphereGeometry(1.15, 10, 8), tankMat);
        tank.position.set(0, SEA + 1.7, -3.8 + i * 3.1);
        g.add(tank);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 1.5), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
      bridge.position.set(0, SEA + 2.3, 5);
      g.add(bridge);
      return g;
    };
    // ships ride the baked routes, each the right kind for its port: the trunk
    // carries three (its top type weights — tanker/container/bulker), every
    // approach >=200u carries one of its dominant type. 7 big ships total —
    // the pre-rework count (perf line: ship count unchanged). All pingpong;
    // a wrap teleport could pop in view at a route end (never-vanish law).
    const mkByType = {
      container: (i) => mkCargo([0x3a5a3a, 0x3a4a6a, 0x6a4a3a][i % 3]),
      tanker: () => mkTanker(),
      bulk: () => mkBulker(),
      chemical: () => mkChemical(),
    };
    for (const route of this.routes) {
      const rnd = seededRand('seaship:' + route.id);
      const n = route.kind === 'trunk' ? 3 : route.len >= 200 ? 1 : 0;
      const types = Object.entries(route.types).sort((a, b) => b[1] - a[1]).map(([k]) => k);
      for (let i = 0; i < n; i++) {
        const type = types[i % types.length];
        const g = mkByType[type](i);
        scene.add(g);
        // Sea W2: every vessel carries an identity (the seaship: motion stream
        // is untouched — shipid: is its own stream, seed law)
        ships.push({ g, route, s: rnd() * route.len, dir: rnd() < 0.5 ? -1 : 1, speed: 2.2 + rnd() * 0.9, type, id: this.buildShipId(type, route.id + ':' + i) });
      }
    }
    return ships;
  }

  // Sea W2: two cutters on patrol — the trunk + the longest approach. They
  // ride routeAt/pingpong like any ship (never a new lane); one merged
  // vertex-colored mesh each (the port-kit idiom), boxy subject so box-built.
  buildCutters(scene) {
    const tint = (geo, hex) => {
      const g = geo.toNonIndexed(), c = new THREE.Color(hex);
      const n = g.attributes.position.count, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      return g;
    };
    const mkCutter = () => {
      const parts = [];
      const add = (geo, hex, x, y, z) => { geo.translate(x, y, z); parts.push(tint(geo, hex)); };
      add(new THREE.BoxGeometry(1.8, 0.9, 6.5), 0xf0efe8, 0, SEA + 0.35, 0);            // white hull
      add(new THREE.BoxGeometry(1.85, 0.55, 0.6), 0xe8501e, 0, SEA + 0.55, -2.2);       // the racing stripe pair
      add(new THREE.BoxGeometry(1.85, 0.55, 0.18), 0x1e3a5e, 0, SEA + 0.55, -1.75);
      add(new THREE.BoxGeometry(1.4, 0.9, 2.4), 0xdddbd2, 0, SEA + 1.25, 0.4);          // deckhouse
      add(new THREE.BoxGeometry(1.15, 0.7, 1.1), 0xdddbd2, 0, SEA + 2.05, -0.2);        // bridge
      add(new THREE.BoxGeometry(0.12, 1.5, 0.12), 0x4a4a52, 0, SEA + 3.1, 0.1);         // mast
      add(new THREE.BoxGeometry(0.7, 0.08, 0.08), 0x4a4a52, 0, SEA + 3.4, 0.1);         // yard
      add(new THREE.CylinderGeometry(0.28, 0.34, 0.4, 8), 0x4a4a52, 0, SEA + 1, -2.6);  // gun mount
      add(new THREE.BoxGeometry(0.08, 0.08, 0.9), 0x4a4a52, 0, SEA + 1.15, -3.1);       // barrel
      const mesh = new THREE.Mesh(mergeGeoms(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
      scene.add(mesh);
      return mesh;
    };
    const longest = this.routes.filter((r) => r.kind !== 'trunk').reduce((b, r) => (!b || r.len > b.len ? r : b), null);
    const cutters = [];
    [this.trunk, longest ?? this.trunk].forEach((route, i) => {
      const rnd = seededRand('shipid:cutter:' + i);
      cutters.push({
        g: mkCutter(), route, s: rnd() * route.len, dir: rnd() < 0.5 ? -1 : 1,
        speed: 3.4, type: 'cutter', cutter: true, id: this.buildShipId('cutter', 'cutter:' + i),
      });
    });
    this.ships.push(...cutters); // motion/force/placard/VHF all see them as ships
    return cutters;
  }

  // Sea W2: the shrimp fleet — 2 boats per fishing port, instanced components
  // (hull/cabin/mast/outriggers/lights ≈ 5 draws for all 10 boats, replacing
  // the four W1-era per-mesh groups). Outriggers swing down while working.
  buildShrimpers(scene) {
    const boats = [];
    for (const port of FISHING) {
      // transit path arc-length table (routeAt-compatible shape)
      const cum = [0];
      for (let i = 1; i < port.pts.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(port.pts[i][0] - port.pts[i - 1][0], port.pts[i][1] - port.pts[i - 1][1]));
      }
      const path = { pts: port.pts, cum, len: cum[cum.length - 1] };
      for (let i = 0; i < 2; i++) {
        const rnd = seededRand(`shrimper:${port.id}:${i}`);
        const ma = rnd() * Math.PI * 2, md = 1.5 + rnd() * 2.5; // seeded mooring spot off the harbor anchor
        const g = new THREE.Group();
        g.position.set(port.pts[0][0] + Math.cos(ma) * md, 0, port.pts[0][1] + Math.sin(ma) * md);
        boats.push({
          g, port, path, // g is the invisible position carrier — placard/VHF/gulls read it
          moorX: g.position.x, moorZ: g.position.z,
          moorHdg: rnd() * Math.PI * 2,
          dawnOff: rnd() * 0.03, speed: 2.6 + rnd() * 0.6,
          trawlR: 6 + rnd() * 6, trawlA: rnd() * Math.PI * 2, trawlW: 0.04 + rnd() * 0.03,
          p: 0, r: 0, working: false, heading: 0,
          id: this.buildShipId('shrimp', `shrimper:${port.id}:${i}`, port.name),
        });
      }
    }
    // instanced fleet — one mesh per component, matrices composed in update
    const lam = (hex) => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
    // geometries are origin-centered — the FULL local offset lives in the
    // instance matrix (updateShrimpers `at()`); the one exception is the rig
    // boom, whose baked +y shift puts its rotation pivot at the boom base.
    // (Baking an offset AND offsetting the instance double-translates — the
    // W2 staged shot caught exactly that on the cabin/mast.)
    this.shrimpMeshes = {
      hull: new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.7, 3.2), lam(0xe8e4d8), boats.length),
      cabin: new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.8, 1), lam(0x4a6a8a), boats.length),
      mast: new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 1.8, 0.1), lam(0x6a5a3a), boats.length),
      rig: new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 2.4, 0.07).translate(0, 1.2, 0), lam(0x6a5a3a), boats.length * 2),
      glow: new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 6, 5), this.workGlow, boats.length * 2),
    };
    for (const m of Object.values(this.shrimpMeshes)) { m.frustumCulled = false; scene.add(m); }
    return boats;
  }

  update(dt, t, player = null) {
    // night gate for every glow (rig flares, work lights, buoy lamp)
    this.rigGlow.opacity = ATMOS.night;
    this.workGlow.opacity = ATMOS.night;
    this.spillMat.opacity = ATMOS.night * 0.32;
    // the buoy bobs on the line
    this.buoy.position.y = Math.sin(t * 0.8) * 0.12;
    this.buoy.rotation.z = Math.sin(t * 0.55) * 0.06;
    for (const s of this.ships) {
      // pingpong the route — never leaves the channel, never wrap-teleports
      s.s += s.speed * s.dir * dt;
      if (s.s >= s.route.len) { s.s = s.route.len; s.dir = -1; }
      else if (s.s <= 0) { s.s = 0; s.dir = 1; }
      const [x, z, dx, dz] = this.routeAt(s.route, s.s);
      s.g.position.set(x, Math.sin(t * 0.6 + s.s) * 0.06, z);
      s.g.rotation.y = Math.atan2(-dx * s.dir, -dz * s.dir);
    }
    this.updateShrimpers(dt, t);
    if (!player) return;
    // Sea W2: placard on approach — every vessel, once, re-arms on exit
    const px = player.pos.x, pz = player.pos.z;
    this.vhfFloor -= dt;
    let chatFired = false;
    const vhfRange = player.perks?.vhf ? Infinity : player.mode === 'BOAT' ? VHF_BOAT_R : VHF_R;
    const vessels = (fn) => { for (const s of this.ships) fn(s); for (const b of this.shrimpers) fn(b); };
    vessels((s) => {
      const d = Math.hypot(s.g.position.x - px, s.g.position.z - pz);
      if (d < SHIP_TOAST_R && !s.id.toasted) { s.id.toasted = true; this.onIdentity?.(this.shipText(s)); }
      else if (d > SHIP_REARM_R) s.id.toasted = false;
      // channel 16 — seeded per-vessel cooldowns, global floor, one line max
      s.id.chatT -= dt;
      if (chatFired || this.vhfFloor > 0 || s.id.chatT > 0 || d > vhfRange) return;
      const line = this.vhfLine(s);
      s.id.chatT = nextVhfCooldown(s.id.name, s.id.chatN++); // rolls even on a quiet vessel — no per-frame retry
      if (!line) return;
      chatFired = true;
      this.onChatter?.(line, s.id.voice);
      this.vhfFloor = VHF_FLOOR;
    });
    if (player.perks?.shrimprig) this.updateShrimpRig(dt, player);
  }

  // Sea-Industry W3: the shrimp rig perk — troll a fishing port's ground
  // slow and steady, then run the hold to that port's home dock for pay.
  updateShrimpRig(dt, player) {
    const px = player.pos.x, pz = player.pos.z, spd = Math.abs(player.speed);
    if (player.mode === 'BOAT' && spd >= 1.5 && spd <= 6 && this.catch < 6) {
      const onGround = FISHING.some((port) => {
        const [gx, gz] = port.pts[port.pts.length - 1];
        return Math.hypot(gx - px, gz - pz) < 60;
      });
      if (onGround) {
        this.catchT += dt;
        if (this.catchT >= 12) {
          this.catchT -= 12;
          this.catch++;
          if (this.catch === 1) this.onCatch?.(0, '🦐 First crate iced down — troll the ground for more');
          else if (this.catch === 6) this.onCatch?.(0, '🦐 Hold full (6 crates) — run it to a fishing-port dock');
        }
      }
    }
    if (player.mode === 'BOAT' && spd < 3 && this.catch > 0) {
      const home = FISHING.some((port) => {
        const [hx, hz] = port.pts[0];
        return Math.hypot(hx - px, hz - pz) < 30;
      });
      if (home) {
        const n = this.catch, pay = n * 40;
        this.catch = 0;
        this.catchT = 0;
        this.onCatch?.(pay, `💵 Shrimp landed — ${n} crate${n === 1 ? '' : 's'}, +$${pay}`);
      }
    }
  }

  // the fleet's day: moored (night) → outbound at dawn → trawling the ground
  // (outriggers down, gulls find them) → home by dusk. All on sky.t; per-boat
  // seeded offsets stagger the fleet so it never moves as one block.
  updateShrimpers(dt, t) {
    const dayT = this.sky?.t ?? 0.5;
    const m4 = this.m4 ??= new THREE.Matrix4();
    const q = this.q ??= new THREE.Quaternion();
    const e = this.e ??= new THREE.Euler();
    const v = this.v ??= new THREE.Vector3();
    const one = this.one ??= new THREE.Vector3(1, 1, 1);
    let ri = 0, gi = 0;
    this.shrimpers.forEach((b, i) => {
      const out = dayT >= DAWN_T + b.dawnOff && dayT < DUSK_T + b.dawnOff;
      let x, z, vx = 0, vz = 0;
      if (b.p >= 1) {
        // on the ground: circle grows outward from the path end (no snap),
        // shrinks back before the run home
        if (out) { b.r = Math.min(b.trawlR, b.r + dt * 1.2); b.trawlA += b.trawlW * dt; } // trawlW is rad/s — a lap in ~2 min, the W1 circling feel
        else { b.r -= dt * 1.5; if (b.r <= 0) { b.r = 0; b.p = 0.999; } }
        const [gx, gz] = b.path.pts[b.path.pts.length - 1];
        x = gx + Math.cos(b.trawlA) * b.r;
        z = gz + Math.sin(b.trawlA) * b.r;
        vx = -Math.sin(b.trawlA); vz = Math.cos(b.trawlA);
        b.working = out && b.r > b.trawlR * 0.5;
      } else {
        b.working = false;
        const step = (b.speed * dt) / b.path.len;
        b.p = out ? Math.min(1, b.p + step) : Math.max(0, b.p - step);
        const [rx, rz, dx, dz] = this.routeAt(b.path, b.p * b.path.len);
        const sgn = out ? 1 : -1;
        if (b.p <= 0) { // alongside — ease onto the seeded mooring spot, no snap
          const k = Math.min(1, dt * 0.8);
          x = b.g.position.x + (b.moorX - b.g.position.x) * k;
          z = b.g.position.z + (b.moorZ - b.g.position.z) * k;
        } else { x = rx; z = rz; vx = dx * sgn; vz = dz * sgn; }
      }
      const y = SEA - 0.1 + Math.sin(t * 0.9 + i * 1.7) * 0.06;
      b.heading = (vx || vz) ? Math.atan2(-vx, -vz) : b.p <= 0 ? b.moorHdg : b.heading;
      b.g.position.set(x, y, z); // invisible carrier — placard/VHF/gull range all read g.position
      const cr = Math.cos(b.heading), sr = Math.sin(b.heading);
      const at = (lx, ly, lz) => v.set(x + lx * cr + lz * sr, y + ly, z - lx * sr + lz * cr);
      e.set(0, b.heading, 0); q.setFromEuler(e);
      this.shrimpMeshes.hull.setMatrixAt(i, m4.compose(at(0, 0.3, 0), q, one));
      this.shrimpMeshes.cabin.setMatrixAt(i, m4.compose(at(0, 1, -0.5), q, one));
      this.shrimpMeshes.mast.setMatrixAt(i, m4.compose(at(0, 1.5, 0.4), q, one));
      // outriggers swing down and out while the boat works its ground
      const tilt = b.working ? 1.15 : 0.35;
      for (const side of [-1, 1]) {
        e.set(0, b.heading, side * tilt); q.setFromEuler(e);
        this.shrimpMeshes.rig.setMatrixAt(ri++, m4.compose(at(side * 0.45, 0.6, 0.3), q, one));
      }
      e.set(0, b.heading, 0); q.setFromEuler(e);
      this.shrimpMeshes.glow.setMatrixAt(gi++, m4.compose(at(0.4, 1.9, 0.6), q, one));
      this.shrimpMeshes.glow.setMatrixAt(gi++, m4.compose(at(-0.4, 1.4, -0.5), q, one));
    });
    for (const mesh of Object.values(this.shrimpMeshes)) mesh.instanceMatrix.needsUpdate = true;
  }
}
