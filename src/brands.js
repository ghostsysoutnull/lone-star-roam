// Texas Brands — real roadside institutions rebuilt as parody landmarks at
// their real-world coordinates, proximity-streamed like CitySystem so only
// nearby sites hold geometry. Every site table resolves through the
// placement-legality gate below (legalize/spotClear) before anything reads
// it — authored coords are anchors, not final positions. Wave 1: Bucky's (Buc-ee's) travel centers —
// showpiece storefront + beaver-topped sign pylon + instanced fuel canopy +
// highway approach billboards. Wave 2: H-E-Buddy (H-E-B) big-box stores at
// the 33 largest GEO.cities, placed on a city-edge road shoulder + instanced
// lot props. Night glow for both is REAL persistent PointLights (not
// emissive — emissive washes a colored sign toward white), gated on
// ATMOS.night. Scenery only: no gameplay.save/mission/seed-string changes —
// the player-controlled global size (`[`/`]`, main.js) owns its own
// `lonestar-brand-scale` localStorage key instead (hud.js's ui-scale idiom),
// same reasoning: a world-appearance preference, not gameplay progression.
//
// Imports geo+sky (site data + night gate), traffic (the tinted/merge
// geometry kit), and — for H-E-Buddy's placement — cities.js (cityRadius)
// and airports.js (airportClear). Cycle-safe: brands.js imports nothing that
// imports it back. Its exported groundYAt() (airport-pad idiom, so
// players/NPCs/traffic ride a brand's foundation slab instead of sinking
// through it) is read directly by vehicle.js and npcs.js (neither imports
// brands.js back); traffic.js CANNOT import it directly (brands.js already
// imports traffic.js for tinted/merge, so that would cycle) — main.js wires
// traffic.groundYAt as a callback instead, same pattern as traffic.onHonk.
// Datacenter audio (wave 3) will arrive as an onHum constructor callback,
// never an import.
import * as THREE from 'three';
import { GEO, seededRand, hAt, nearestRoad, waterAt, inTexas } from './geo.js';
import { ATMOS } from './sky.js';
import { tinted, merge } from './traffic.js';
import { cityRadius } from './cities.js';
import { airportClear } from './airports.js';

const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];

// Player-controlled global size for all three brand categories — a world-
// appearance preference (own localStorage key, ui-scale idiom in hud.js), NOT
// gameplay progression, so it never touches gameplay.save. One factor for all
// three brands (not per-category): asked for and answered by Bruno 2026-07-12.
// Every hero/prop mesh at a site is parented under a `building` sub-group that
// carries this scale (spawn()/spawnHEB()/spawnLSC()) — scaling `group` itself
// would also drag the Bucky's approach billboards, which live in WORLD space
// well off the pad and must resize IN PLACE on their own ground point instead
// (buildBillboards scales each billboard's own local group, not `group`).
// groundYAt's footprint/pad-height math reads this same module value so the
// physical floor always matches the shrunk/grown slab.
const SCALE_KEY = 'lonestar-brand-scale';
const SCALE_MIN = 0.1, SCALE_MAX = 1.25; // down to a tenth size — Bruno 2026-07-12
const clampScale = (v) => Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, v)) * 100) / 100;
let SCALE = clampScale(parseFloat(localStorage.getItem(SCALE_KEY)) || 0.15);

const SPAWN_DIST = 700;      // bigger footprints than cities — hold geometry sooner
const NIGHT_ON = 0.25;       // ATMOS.night threshold for the signage glow (airports.js)

// ------------------------------------------------------- placement legality
// Real-world coordinates put every Bucky's ON its highway at game scale (the
// road is a 3.2-unit ribbon; the store's OSM node sits 0.1–3.6 units off the
// centerline — audited 2026-07-16: 15/15 Bucky's, 5/8 LSC overlapped, and the
// H-E-Buddy search shipped Corpus Christi in the bay, El Paso across the
// border, Waco on the Brazos). legalize() keeps the authored coords as the
// anchor and slides the site off the pavement: chapelAt's reject-list idea,
// deterministic (no RNG — same input, same nudge, every session).
//
// Clearance is sized for brand scale 0.5 (REF_SCALE): the 0.15 default gets
// ~3x margin, slider sizes past 0.5 may kiss the shoulder — a player-chosen
// distortion; sites must NEVER move with the slider (spatial memory + the
// brandNear consumers below). Street-tier arterials use the default-size
// reach instead (STREET_REF): metro grids are too dense to clear a half-size
// slab from every arterial, and the 1.1-unit street ribbon reads fine beside
// a lot edge.
const REF_SCALE = 0.5, STREET_REF = 0.15;
const RIBBON_HALF = { motorway: 1.6, trunk: 1.0, primary: 0.75, street: 0.55 }; // world.js buildRibbons widths / 2
const clearNeed = (type, reach) =>
  RIBBON_HALF[type] + reach * (type === 'street' ? STREET_REF : REF_SCALE) + 1;
// One fronting-road query per brand, shared by spawn + the groundYAt footprint
// caches + legalize so heading/padY always match the rendered slab.
const BUCKY_ROAD = (x, z) => nearestRoad(x, z, 90, (t) => t === 'motorway' || t === 'trunk' || t === 'primary') || nearestRoad(x, z, 120);
const HEB_ROAD = (x, z) => nearestRoad(x, z, 90) || nearestRoad(x, z, 150);
const LSC_ROAD = (x, z) => nearestRoad(x, z, 120, (t) => t === 'motorway' || t === 'trunk' || t === 'primary') || nearestRoad(x, z, 200);

// true when (x,z) can hold a slab reaching `reach` local units: dry, in-state,
// and every road ribbon clear of it (nearest-road check against the widest
// tier's need — the 1-unit margin absorbs the rare nearer-street-masks-a-
// farther-motorway edge).
function spotClear(x, z, reach) {
  if (waterAt(x, z) || !inTexas(x, z)) return false;
  const r = nearestRoad(x, z, RIBBON_HALF.motorway + reach * REF_SCALE + 1);
  return !r || r.dist >= clearNeed(r.type, reach);
}

// Slide (x0,z0) to the nearest legal spot: scan away from the fronting road
// first (both sides), then along its tangent (both ways — junction sites like
// Madisonville are boxed in by a second road parallel to the perpendicular).
// Falls back to the authored coords when nothing within reach passes — never
// worse than the pre-legality behavior. Moves audited at 2–56 units.
function legalize(x0, z0, reach, findRoad) {
  const road = findRoad(x0, z0);
  if (!road) return [x0, z0];
  let dx = x0 - road.x, dz = z0 - road.z, d = Math.hypot(dx, dz);
  if (d < 0.3) { dx = -road.tz; dz = road.tx; d = 1; } // on the centerline — pick the left normal
  dx /= d; dz /= d;
  for (const [ux, uz] of [[dx, dz], [-dx, -dz], [road.tx, road.tz], [-road.tx, -road.tz]]) {
    for (let out = clearNeed(road.type, reach); out <= clearNeed(road.type, reach) + 60; out += 3) {
      const x = road.x + ux * out, z = road.z + uz * out;
      if (spotClear(x, z, reach) && airportClear(x, z)) return [x, z];
    }
  }
  return [x0, z0];
}

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
const SIGN_I = 5, SIGN_R = 28;   // was 16 — dropped so the warm pool grazes the pylon/beaver without fighting the neon name (Bruno, 2026-07-16)
const BUCKY_NEON_I = 1.0;        // wordmark emissiveMap magnitude at full night (LSC SIGN_GLOW_I idiom)

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

// Lone Star Compute (AI-datacenter parody) — Wave 3. 8 real Texas datacenter
// towns confirmed against 2026 news/OSM: Abilene ("Stargate", the Crusoe/
// Oracle/OpenAI flagship), Amarillo (Fermi America's 11 GW campus), San Antonio
// (Streams SA), the Abilene–Sweetwater corridor, plus Corsicana/Temple/Red Oak/
// Denton along the SA→Dallas + DFW build-out. Coords sit on each town's
// OUTSKIRTS (where the campuses actually are). Temple & Denton also carry a
// Bucky's, so their LSC coords are pulled ≥80 units off the same-town Bucky's
// (both spawn inside SPAWN_DIST at once — no interpenetration).
// `sign` = the datacenter-sign prototype (DATACENTER_SIGN_SPEC.md): an
// always-visible ID sign + an "E to read" plaque with real, sourced facts
// about the actual facility each site is modeled on. Rolled out to all 8
// sites after the San Antonio prototype read well in-game.
const LSC_SITES = [
  {
    name: 'Abilene', at: LL(32.52, -99.88),          // the real "Stargate" (Crusoe/Oracle/OpenAI)
    sign: {
      tagline: 'ABILENE — HOME OF STARGATE',
      fact: "Modeled on the real flagship next door: Crusoe's Stargate campus "
        + 'for Oracle and OpenAI spans over 1,100 acres south of Abilene. Its '
        + 'first buildings already deliver 200+ MW of IT power on the way to '
        + 'a planned 1.2 gigawatts — enough to rival a full nuclear power plant.',
    },
  },
  {
    name: 'Corsicana', at: LL(32.05, -96.50),
    sign: {
      tagline: 'CORSICANA — AI/HPC CAMPUS',
      fact: "Modeled on Riot Platforms' 858-acre Navarro County campus, "
        + 'originally built for Bitcoin mining and now converting part of its '
        + '600 MW of approved capacity to AI/HPC — AMD alone has doubled its '
        + 'contracted load here to 50 MW.',
    },
  },
  {
    name: 'San Antonio', at: LL(29.42, -98.65),      // Streams San Antonio, west side
    sign: {
      tagline: 'SAN ANTONIO — AI-READY CAMPUS',
      fact: "Modeled on the real hyperscale campuses rising on San Antonio's "
        + "west side — Stream's San Antonio III alone plans up to 200 MW of "
        + 'AI-ready capacity across five buildings, fed by its own 334 MW '
        + 'substation. A single 100 MW facility can drink 3–6 million '
        + 'gallons of water a day at peak, as much as a small city, and '
        + 'training one large model has been estimated to use around 185,000 '
        + 'gallons of water for cooling alone.',
    },
  },
  {
    name: 'Sweetwater', at: LL(32.47, -100.41),      // Abilene–Sweetwater corridor
    sign: {
      tagline: 'SWEETWATER — 2GW AI CAMPUS',
      fact: "Modeled on IREN's Sweetwater campus — 2,200 acres of West Texas "
        + 'rangeland built for 2 gigawatts of liquid-cooled AI compute, about '
        + 'as much electricity as a mid-sized American city, tied directly '
        + "into ERCOT's 345 kV transmission grid.",
    },
  },
  {
    name: 'Temple', at: LL(31.08, -97.44),           // ≥80u off Temple's Bucky's
    sign: {
      tagline: 'TEMPLE — HYPERSCALE CAMPUS',
      fact: "Modeled on Temple's real twin build-out: Meta's $800 million, "
        + '900,000-square-foot hyperscale data center sits beside Rowan\'s '
        + '300 MW Project Temple next door — together drawing nearly 2,000 '
        + 'construction workers at peak.',
    },
  },
  {
    name: 'Amarillo', at: LL(35.30, -101.70),        // Fermi America 11 GW campus
    sign: {
      tagline: 'AMARILLO — PROJECT MATADOR',
      fact: "Modeled on Fermi America's Project Matador — a planned "
        + '5,769-acre energy-and-compute campus near Pantex designed for up '
        + 'to 11 gigawatts. Natural gas turbines have already arrived, with '
        + 'up to four nuclear reactors planned for its final phase.',
    },
  },
  {
    name: 'Red Oak', at: LL(32.52, -96.80),
    sign: {
      tagline: 'RED OAK — SOUTH DALLAS AI',
      fact: "Modeled on DataBank's Red Oak campus 21 miles south of Dallas — "
        + 'a $2 billion, eight-building build-out planned for 480 megawatts, '
        + 'with Oracle signed on as the anchor tenant for the first four '
        + 'buildings.',
    },
  },
  {
    name: 'Denton', at: LL(33.24, -97.17),           // ≥80u off Denton's Bucky's
    sign: {
      tagline: 'DENTON — AI COMPUTE HUB',
      fact: "Modeled on Denton's real cluster: CoreWeave's campus alone runs "
        + 'an estimated 253,000 H100-equivalent chips on 262 MW for OpenAI '
        + "workloads, next to Core Scientific's separate 394 MW site by the "
        + 'Denton Energy Center.',
    },
  },
];

// Lone Star Compute palette — cold industrial: gunmetal sheds, pale concrete,
// galvanized steel. The cooling-vent glow is the ONE emissive exception in this
// track (a deliberate COLD cast vs. the warm Bucky's/H-E-Buddy signage LIGHTS).
// It works where the yellow-sign emissive failed because the vents' diffuse is
// DARK (0x2a3540) — emissive can't wash a dark surface toward white — and the
// glow colour is a saturated cold blue at a modest airport-sign intensity
// (emissiveIntensity, NOT the 16–30 of the warm PointLights).
const LSC_SHED = 0x6b7178, LSC_ROOF = 0x565b61, LSC_OFFICE = 0xb9bec4;
const LSC_CONCRETE = 0x9c968a, LSC_STEEL = 0x8a9099, LSC_FENCE = 0x707880;
const LSC_XFMR = 0x8f959c, LSC_DRUM = 0xcfd3d7, LSC_VENT_DIFF = 0x2a3540;
const VENT_GLOW = 0x6fb0ff;    // saturated cold blue — reads cold, not white
const VENT_I = 0.7;            // emissive magnitude (airport-sign tier, gated by night)
const SIGN_GLOW_I = 0.9;       // ID-sign emissiveMap magnitude — text/border only (dark bg emits ~0)
const LSC_SIGN_ANCHOR = [11, 3.3, 26.1]; // local: beside the entrance/gate, facing the road
const HUM_RANGE = 220;         // datacenter hum audible radius (bigger footprint than a heli)

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
    // NEON, the LSC ID-sign idiom: dark panel with the wordmark + border baked
    // into ONE canvas used as both map and emissiveMap, so at night only the
    // lettering glows with its own brightness (dark bg emits ~0). Replaces two
    // failed lit-surface looks (red-on-yellow, then dark-on-yellow) that the
    // warm sign light washed out — Bruno picked neon-on-dark 2026-07-16.
    this.buckySignGeo = new THREE.PlaneGeometry(5.0, 3.6);
    const buckyTex = mkBuckySignTex();
    this.buckySignMat = new THREE.MeshLambertMaterial({
      map: buckyTex, emissiveMap: buckyTex, emissive: 0xffffff, emissiveIntensity: 0, side: THREE.DoubleSide,
    });
    // H-E-Buddy lot-prop prototypes (cart corral, cart, light pole).
    this.corralGeo = mkCartCorral();
    this.cartGeo = mkCart();
    this.poleGeo = mkLightPole();
    // H-E-Buddy's sign panel — one shared plane + one shared canvas-texture
    // material (the name is identical at every site, unlike Bucky's per-site
    // punny billboards, so there's no need for a mat-per-copy pool).
    this.hebSignGeo = new THREE.PlaneGeometry(11.5, 2.6);
    this.hebSignMat = new THREE.MeshLambertMaterial({ map: mkHEBSignTex(), side: THREE.DoubleSide });
    // Lone Star Compute prototypes (instanced per site) — roof/side cooling-fan
    // unit, rooftop condenser drum, lattice transmission pylon.
    this.coolingGeo = mkCoolingFan();
    this.drumGeo = mkCondenserDrum();
    this.pylonGeo = mkPylon();
    // The cold cooling-vent glow — one SHARED emissive material toggled by night
    // in update() (airport-beacon idiom; the vent MESHES are per-site so they
    // dispose on despawn, but this material is shared and never disposed). Dark
    // diffuse + saturated cold emissive so it reads cold, not white.
    this.ventMat = new THREE.MeshLambertMaterial({ color: LSC_VENT_DIFF, emissive: VENT_GLOW, emissiveIntensity: 0, flatShading: true });

    // Lone Star Compute ID sign (DATACENTER_SIGN_SPEC.md prototype). NOT
    // ventMat's idiom — ventMat is a solid-color emissive with no map, so it'd
    // glow the whole panel cyan and swamp any text (the same "emissive clamps
    // signage toward white" trap Bucky's/H-E-Buddy hit, which they escaped
    // with PointLights — not an option here per "no second light rig"/no new
    // shader). Instead the sign's own canvas texture is used as BOTH `map`
    // and `emissiveMap`: dark panel diffuse with cyan glyphs/border baked in,
    // so only the text/border glows once emissiveIntensity ramps up at night
    // (toggled alongside ventMat in update()). One material per site.sign
    // (currently one: the San Antonio prototype).
    this.lscSignGeo = new THREE.PlaneGeometry(9, 3.6);
    this.lscSignMats = new Map();
    this.lscByName = new Map(getLscSites().map((s) => [s.name, s])); // lscNear's name -> site lookup
    for (const site of getLscSites()) {
      if (!site.sign) continue;
      const tex = mkLSCSignTex(site.sign.tagline);
      this.lscSignMats.set(site.name, new THREE.MeshLambertMaterial({
        map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0, side: THREE.DoubleSide,
      }));
    }

    this.shared = new Set([
      this.pumpGeo, this.billboardGeo, this.panelGeo, this.buckySignGeo,
      this.corralGeo, this.cartGeo, this.poleGeo, this.hebSignGeo,
      this.coolingGeo, this.drumGeo, this.pylonGeo, this.lscSignGeo,
    ]);

    // One canvas-texture material per copy string, built once (airports.js
    // sign-atlas pattern) — the billboards actually READ. Never disposed.
    this.billboardMats = BILLBOARD_COPY.map((txt) =>
      new THREE.MeshLambertMaterial({ map: mkSignTex(txt), side: THREE.DoubleSide }));

    // H-E-Buddy sites derive from GEO.cities (unavailable at module load —
    // GEO is loaded before BrandSystem is constructed, so this is safe here).
    // Shared with groundYAt's footprint cache below (getHebSites memoizes).
    // Bucky's/LSC resolved (legalized) tables exposed the same way so the
    // verify suite asserts placement against the coords actually in play.
    this.hebSites = getHebSites();
    this.buckySites = getBuckySites();
    this.lscSites = getLscSites();
  }

  get scale() { return SCALE; }

  // Absolute setter (not a step) — main.js computes the next step from
  // `this.scale` the same way hud.uiScale does. Despawns every live site so
  // the next real-loop tick (update()'s 4 Hz throttle) rebuilds them at the
  // new size; groundYAt reads the new SCALE immediately (pure function, no
  // dependency on `this.live`), so the physical floor never lags the visual
  // rebuild by more than that same quarter second. Returns a HUD-ready "N%".
  setScale(v) {
    SCALE = clampScale(v);
    localStorage.setItem(SCALE_KEY, SCALE);
    for (const name of [...this.live.keys()]) this.despawn(name);
    return Math.round(SCALE * 100) + '%';
  }

  // proximity spawn/despawn over the small hand-authored list (no grid needed)
  update(px, pz, dt = 0) {
    // night lighting — aim the persistent lights at the NEAREST live site OF
    // EACH BRAND (Bucky's canopy+sign vs. H-E-Buddy's sign are independent
    // pools) and fade by ATMOS.night (read internally, airports.js pattern).
    // Runs every frame (before the spawn throttle) so lights track smoothly.
    const nf = ATMOS.night > NIGHT_ON ? ATMOS.night : 0;
    let nearB = null, bestB = Infinity, nearH = null, bestH = Infinity, bestL = Infinity;
    for (const rec of this.live.values()) {
      if (rec.type === 'heb') {
        const d = (rec.lightAt.sign[0] - px) ** 2 + (rec.lightAt.sign[2] - pz) ** 2;
        if (d < bestH) { bestH = d; nearH = rec; }
      } else if (rec.type === 'lsc') {
        // no PointLight — datacenter glow is emissive; track distance for the hum
        const d = (rec.group.position.x - px) ** 2 + (rec.group.position.z - pz) ** 2;
        if (d < bestL) bestL = d;
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

    // Lone Star Compute — the ONE emissive night glow (cold cooling vents),
    // gated on night like the airport beacons, and the proximity hum via the
    // onHum callback (main.js → audio.datacenterHum). Both every frame, like the
    // signage lights above; onHum(Infinity) when no site is live so the hum fades.
    this.ventMat.emissiveIntensity = nf * VENT_I;
    for (const mat of this.lscSignMats.values()) mat.emissiveIntensity = nf * SIGN_GLOW_I;
    this.buckySignMat.emissiveIntensity = nf * BUCKY_NEON_I;
    if (this.onHum) this.onHum(bestL === Infinity ? Infinity : Math.sqrt(bestL));

    this.acc += dt;
    if (this.acc < 0.25 && dt) return; // ~4 Hz is plenty for 700-unit spawn rings
    this.acc = 0;

    for (const site of this.buckySites) {
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

    // Lone Star Compute — keyed 'lsc:<name>' (Denton/Temple collide with the
    // Bucky's + H-E-Buddy tables otherwise).
    for (const site of this.lscSites) {
      const key = 'lsc:' + site.name;
      const d = Math.hypot(site.at[0] - px, site.at[1] - pz);
      const has = this.live.has(key);
      if (d < SPAWN_DIST && !has) this.spawnLSC(site);
      else if (d > SPAWN_DIST * 1.25 && has) this.despawn(key);
    }
  }

  spawn(site) {
    const [x, z] = site.at;
    const rand = seededRand('bucky:' + site.name);
    const group = new THREE.Group();

    // Face the store toward the nearest sizeable road so it fronts the highway.
    const road = BUCKY_ROAD(x, z);
    const heading = road ? Math.atan2(road.x - x, road.z - z) : 0;

    // Pad at the MAX terrain height under the lot (airport-pad pattern) so a
    // sloped site never floats a corner; a foundation skirt drawn down below
    // the lot MIN hides the lip (brand sites aren't pad-flattened).
    const fp = footprintRange(x, z);
    const padY = fp.max;
    // Authored BEFORE `building`'s scale is applied (the slab lives inside
    // it, like everything else) — capping the TRUE relief first, then
    // dividing the result by SCALE, keeps the slab's WORLD-space reach
    // (padY - SCALE*skirt) constant at any brand size: SCALE * (min(8,
    // relief+0.4)/SCALE) == min(8, relief+0.4), same depth as uncounter-
    // scaled. Real worst case ~1.8u relief (El Paso's H-E-Buddy lot) is
    // nowhere near the 8-unit cap, so it's untouched by it at any scale down
    // to the 0.1x floor — the shrunk skirt still dips below the lot min
    // instead of floating on sloped terrain.
    const skirt = Math.min(8, padY - fp.min + 0.4) / SCALE; // cap FIRST (on true relief), then divide — dividing first would let a small SCALE undershoot the cap and clip the needed depth
    group.position.set(x, padY, z);
    group.rotation.y = heading;

    // Hero: storefront + fuel canopy + sign pylon + beaver, one static merged
    // mesh (sign yellow / roofline red / soffit white as plain diffuse — the
    // night lights below make them read, keeping colours true).
    const hero = buildBuckyHero(skirt);
    const staticMesh = new THREE.Mesh(hero.staticGeo, this.heroMat);

    // Sign panel: the readable "Bucky's" name, mounted just proud of the
    // yellow sign face baked into staticGeo.
    const signPanel = new THREE.Mesh(this.buckySignGeo, this.buckySignMat);
    signPanel.position.set(...hero.signPanelAt);

    // The pump islands under the canopy are an InstancedMesh of the prototype.
    const pumps = new THREE.InstancedMesh(this.pumpGeo, this.propMat, hero.pumpXforms.length);
    hero.pumpXforms.forEach((m, i) => pumps.setMatrixAt(i, m));
    pumps.instanceMatrix.needsUpdate = true;

    // Everything above shares the player's global brand-size scale, applied
    // about the pad origin (the SAME pivot groundYAt scales its footprint
    // about) — this sub-group is what setScale() resizes. The approach
    // billboards are NOT in here (see buildBillboards).
    const building = new THREE.Group();
    building.add(staticMesh, signPanel, pumps);
    building.scale.setScalar(SCALE);
    group.add(building);

    // World positions of the two night-light anchors. Transform the local
    // anchors by the group's Y-rotation with the SAME trig as buildBillboards
    // (also scaled, so a shrunk sign keeps its light glued to it) —
    // group.localToWorld() would read a stale matrixWorld this early (identity
    // until the first render), dropping the lights at the world origin.
    const toWorld = ([lx, ly, lz]) => [
      x + lx * SCALE * Math.cos(heading) + lz * SCALE * Math.sin(heading), padY + ly * SCALE,
      z - lx * SCALE * Math.sin(heading) + lz * SCALE * Math.cos(heading),
    ];
    const lightAt = { canopy: toWorld(CANOPY_ANCHOR), sign: toWorld(SIGN_ANCHOR) };

    // Approach billboards — placed in WORLD space along the nearest freeway,
    // then de-rotated into the group's local frame so grounding stays exact.
    const boards = this.buildBillboards(site, x, z, padY, group, rand);

    this.scene.add(group);
    this.live.set(site.name, { group, building, staticMesh, pumps, boards, signPanel, lightAt, type: 'bucky' });
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
    // step back along the road tangent from the nearest point, alternating
    // sides — then RE-SNAP each straight-line guess to the actual pavement.
    // The tangent extrapolation leaves curved roads (audited 2026-07-16:
    // boards up to 44 units off-road in fields, 10 on the pavement itself);
    // re-anchoring every guess through nearestRoad self-corrects the curve.
    for (let i = 0; i < 4; i++) {
      const back = 40 + i * 45;                     // 40..175 units up the road
      const gx = road.x + road.tx * back * (i % 2 ? -1 : 1);
      const gz = road.z + road.tz * back * (i % 2 ? -1 : 1);
      const snap = nearestRoad(gx, gz, 60, (t) => t === 'motorway' || t === 'trunk');
      if (!snap) continue;                          // guess left the network (sharp bend / end of line) — skip the board
      // shoulder offset (perpendicular to the LOCAL tangent at the snap point)
      const bx = snap.x - snap.tz * 3.5, bz = snap.z + snap.tx * 3.5;
      if (waterAt(bx, bz) || !inTexas(bx, bz)) continue;     // dry land, in-state
      const cross = nearestRoad(bx, bz, 3);                  // a second road can cross the shoulder
      if (cross && cross.dist < RIBBON_HALF[cross.type] + 0.5) continue;
      if (posts.some((p) => Math.hypot(p.wx - bx, p.wz - bz) < 12)) continue; // two guesses folded onto one bend
      const by = footprintMaxH(bx, bz, 1);
      // world position → group-local (group is at x,z,padY rotated by heading)
      const local = new THREE.Vector3(bx - x, by - padY, bz - z).applyMatrix4(inv);
      const faceWorld = Math.atan2(snap.tz, snap.tx) + Math.PI / 2; // billboard +z faces the road
      const bg = new THREE.Group();
      bg.position.copy(local);
      bg.rotation.y = faceWorld - group.rotation.y;
      // Scales about its OWN base (by, sampled from real terrain, not the
      // store's pad) — a billboard shrinks/grows in place rather than
      // sliding toward the store the way it would if `group` itself scaled.
      bg.scale.setScalar(SCALE);
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

    const road = HEB_ROAD(x, z);
    const heading = road ? Math.atan2(road.x - x, road.z - z) : 0;

    const fp = footprintRange(x, z);
    const padY = fp.max;
    const skirt = Math.min(8, padY - fp.min + 0.4) / SCALE; // see spawn()'s comment — cap BEFORE dividing by SCALE

    group.position.set(x, padY, z);
    group.rotation.y = heading;

    const hero = buildHEBHero(skirt);
    const staticMesh = new THREE.Mesh(hero.staticGeo, this.heroMat);

    // Sign panel: the readable "H-E-Buddy" name, mounted just proud of the
    // red backer baked into staticGeo (a hair further in z to avoid z-fighting).
    const signPanel = new THREE.Mesh(this.hebSignGeo, this.hebSignMat);
    signPanel.position.set(HEB_SIGN_ANCHOR[0], HEB_SIGN_ANCHOR[1], HEB_SIGN_ANCHOR[2] + 0.1);

    const lot = buildHEBLot(rand);
    const corrals = new THREE.InstancedMesh(this.corralGeo, this.propMat, lot.corralXforms.length);
    lot.corralXforms.forEach((m, i) => corrals.setMatrixAt(i, m));
    corrals.instanceMatrix.needsUpdate = true;

    const carts = new THREE.InstancedMesh(this.cartGeo, this.propMat, lot.cartXforms.length);
    lot.cartXforms.forEach((m, i) => carts.setMatrixAt(i, m));
    carts.instanceMatrix.needsUpdate = true;

    const poles = new THREE.InstancedMesh(this.poleGeo, this.propMat, lot.poleXforms.length);
    lot.poleXforms.forEach((m, i) => poles.setMatrixAt(i, m));
    poles.instanceMatrix.needsUpdate = true;

    // Global brand-size scale, same pattern as spawn() (Bucky's) — no
    // billboards here, so everything for this brand lives inside `building`.
    const building = new THREE.Group();
    building.add(staticMesh, signPanel, corrals, carts, poles);
    building.scale.setScalar(SCALE);
    group.add(building);

    // Same trig transform as Bucky's (also scaled) — group.localToWorld()
    // would read a stale matrixWorld this early and drop the light at the
    // world origin.
    const toWorld = ([lx, ly, lz]) => [
      x + lx * SCALE * Math.cos(heading) + lz * SCALE * Math.sin(heading), padY + ly * SCALE,
      z - lx * SCALE * Math.sin(heading) + lz * SCALE * Math.cos(heading),
    ];
    const lightAt = { sign: toWorld(HEB_SIGN_ANCHOR) };

    this.scene.add(group);
    this.live.set('heb:' + site.name, { group, building, staticMesh, corrals, carts, poles, signPanel, lightAt, type: 'heb' });
  }

  // Lone Star Compute site: two windowless server sheds + office + fence +
  // substation (static hero) with instanced cooling banks / condenser drums /
  // transmission pylons, plus the cold EMISSIVE cooling-vent mesh (shared
  // ventMat, toggled by night in update()). Same pad/skirt/heading pattern as
  // spawn()/spawnHEB(). No PointLight — this brand's night look is emissive.
  spawnLSC(site) {
    const [x, z] = site.at;
    const group = new THREE.Group();

    const road = LSC_ROAD(x, z);
    const heading = road ? Math.atan2(road.x - x, road.z - z) : 0;

    const fp = footprintRange(x, z);
    const padY = fp.max;
    const skirt = Math.min(8, padY - fp.min + 0.4) / SCALE; // see spawn()'s comment — cap BEFORE dividing by SCALE
    group.position.set(x, padY, z);
    group.rotation.y = heading;

    const hero = buildLoneStarHero(skirt);
    const staticMesh = new THREE.Mesh(hero.staticGeo, this.heroMat);

    // cold cooling-vent glow — own mesh, SHARED emissive material (per-site geo
    // disposes on despawn; the material is shared and toggled by night).
    const vents = new THREE.Mesh(hero.ventGeo, this.ventMat);

    const cooling = new THREE.InstancedMesh(this.coolingGeo, this.propMat, hero.coolingXforms.length);
    hero.coolingXforms.forEach((m, i) => cooling.setMatrixAt(i, m));
    cooling.instanceMatrix.needsUpdate = true;

    const drums = new THREE.InstancedMesh(this.drumGeo, this.propMat, hero.drumXforms.length);
    hero.drumXforms.forEach((m, i) => drums.setMatrixAt(i, m));
    drums.instanceMatrix.needsUpdate = true;

    const pylons = new THREE.InstancedMesh(this.pylonGeo, this.propMat, hero.pylonXforms.length);
    hero.pylonXforms.forEach((m, i) => pylons.setMatrixAt(i, m));
    pylons.instanceMatrix.needsUpdate = true;

    // ID sign (DATACENTER_SIGN_SPEC.md prototype, San Antonio only for now) —
    // two plain LSC_STEEL posts (folded into heroMat like the rest of the
    // static geometry) plus the textured, per-site readable panel on top,
    // planted beside the entrance/gate (the office glazing + front fence
    // line both sit at z≈24–25) so it faces the road like the rest of the
    // hero.
    let signMesh = null, signAt = null;
    if (site.sign) {
      // Posts stop at the panel's OWN bottom edge (anchor y 3.3 − half the
      // 3.6-tall plane = 1.5) instead of running up behind it — they used to
      // reach y=3.3, into the panel's 1.5–5.1 span, so from an angle the
      // poles visually crossed the tagline line (Bruno caught this in-game).
      const postGeo = merge([
        tinted(new THREE.CylinderGeometry(0.14, 0.14, 1.5, 6).translate(9.2, 0.75, 26), LSC_STEEL),
        tinted(new THREE.CylinderGeometry(0.14, 0.14, 1.5, 6).translate(12.8, 0.75, 26), LSC_STEEL),
      ]);
      const posts = new THREE.Mesh(postGeo, this.heroMat);
      const signPanel = new THREE.Mesh(this.lscSignGeo, this.lscSignMats.get(site.name));
      signPanel.position.set(...LSC_SIGN_ANCHOR);
      signMesh = new THREE.Group();
      signMesh.add(posts, signPanel);

      // World position of the sign (same trig as spawn()/spawnHEB()'s toWorld,
      // also scaled) — lscNear reads THIS, not the pad center, so proximity
      // detection actually centers on the sign a player would be reading, not
      // a point ~28 units inside the fence (hypot(11,26.1)≈28.3 from center,
      // just past the pad-center radius this bug shipped at first).
      signAt = [
        x + LSC_SIGN_ANCHOR[0] * SCALE * Math.cos(heading) + LSC_SIGN_ANCHOR[2] * SCALE * Math.sin(heading),
        z - LSC_SIGN_ANCHOR[0] * SCALE * Math.sin(heading) + LSC_SIGN_ANCHOR[2] * SCALE * Math.cos(heading),
      ];
    }

    // Global brand-size scale, same pattern as the other two brands — no
    // PointLight anchor to rescale here (the LSC night look is emissive-only,
    // position-independent).
    const building = new THREE.Group();
    building.add(staticMesh, vents, cooling, drums, pylons);
    if (signMesh) building.add(signMesh);
    building.scale.setScalar(SCALE);
    group.add(building);

    this.scene.add(group);
    this.live.set('lsc:' + site.name, { group, building, staticMesh, vents, cooling, drums, pylons, signMesh, signAt, type: 'lsc' });
  }

  // nearest LSC site with a sign/plaque within range, or null (mirrors
  // gameplay.landmarkNear's shape). DATACENTER_SIGN_SPEC.md. Reads `this.live`
  // (not the hand-authored table) because it needs each site's actual SIGN
  // world position — computed at spawn from heading + SCALE, same as signAt
  // above — not the pad center a landmark-style table lookup would give.
  lscNear(pos, range = 28) {
    let best = null, bd = range * range;
    for (const [key, rec] of this.live) {
      if (rec.type !== 'lsc' || !rec.signAt) continue;
      const d = (rec.signAt[0] - pos.x) ** 2 + (rec.signAt[1] - pos.z) ** 2;
      if (d < bd) { bd = d; best = this.lscByName.get(key.slice(4)); }
    }
    return best;
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

// --------------------------------------------------------- ground query (walk/drive)
// Static pad footprints for player/vehicle grounding — the airport-pad idiom
// (groundYAt in airports.js) extended to brand sites. Without this, vehicle.js
// falls back to raw hAt() under a brand's foundation slab, so the player
// walked/drove through the base instead of over it (the same bug airports.js
// already fixes for runway pads). Heading + padY here mirror spawn()/spawnHEB()
// exactly (same nearestRoad calls, same footprintRange) so the physical floor
// always matches the rendered slab. Computed once and cached: SPAWN_DIST (700)
// is far larger than any footprint, so a player standing on a pad always has
// its geometry live too — this query doesn't need to consult `this.live`.
const BUCKY_FOOT = { hx: 17, z0: -14.5, z1: 20.5 };   // matches buildBuckyHero's slab (34 wide, 35 deep @ z=3)
const HEB_FOOT = { hx: 22, z0: -14, z1: 12 };          // matches buildHEBHero's slab (44 wide, 26 deep @ z=-1)
const LSC_FOOT = { hx: 24, z0: -15, z1: 25 };          // matches buildLoneStarHero's slab (48 wide, 40 deep @ z=5)
const PAD_TOP = 0.42;  // slab's local top surface (both hero builders: -skirt/2+0.2 + (skirt+0.4)/2 = 0.4) + a hair of clearance

let hebSitesCache = null;
function getHebSites() {
  if (!hebSitesCache) hebSitesCache = buildHEBSites();
  return hebSitesCache;
}

// Bucky's/LSC site tables resolved through legalize() — memoized like
// getHebSites so spawn, the groundYAt footprint caches, and brandNear all
// read the SAME nudged coords (GEO must be loaded; first call is from the
// BrandSystem constructor, same guarantee getHebSites already relies on).
// `at` is replaced, every other field (name, sign, fact) carries through.
let buckySitesCache = null;
function getBuckySites() {
  if (!buckySitesCache) buckySitesCache = BUCKY_SITES.map((s) => (
    { ...s, at: legalize(s.at[0], s.at[1], BUCKY_FOOT.z1, BUCKY_ROAD) }));
  return buckySitesCache;
}

let lscSitesCache = null;
function getLscSites() {
  if (!lscSitesCache) lscSitesCache = LSC_SITES.map((s) => (
    { ...s, at: legalize(s.at[0], s.at[1], LSC_FOOT.z1, LSC_ROAD) }));
  return lscSitesCache;
}

function siteFootprint(x, z, road) {
  const heading = road ? Math.atan2(road.x - x, road.z - z) : 0;
  return { x, z, heading, padY: footprintRange(x, z).max };
}

let buckyFootCache = null;
function buckyFootprints() {
  if (!buckyFootCache) buckyFootCache = getBuckySites().map((site) => {
    const [x, z] = site.at;
    return siteFootprint(x, z, BUCKY_ROAD(x, z));
  });
  return buckyFootCache;
}

let hebFootCache = null;
function hebFootprints() {
  if (!hebFootCache) hebFootCache = getHebSites().map((site) => (
    siteFootprint(site.x, site.z, HEB_ROAD(site.x, site.z))));
  return hebFootCache;
}

let lscFootCache = null;
function lscFootprints() {
  if (!lscFootCache) lscFootCache = getLscSites().map((site) => {
    const [x, z] = site.at;
    return siteFootprint(x, z, LSC_ROAD(x, z)); // same query as spawnLSC so padY/heading match the slab
  });
  return lscFootCache;
}

// world (x,z) -> the pad's flat top height if inside this site's rotated
// rectangular footprint, else null. Inverse of the toWorld() transform used
// at spawn time (world = site + R(heading)·local), solved for local.
function footAt(x, z, site, foot) {
  const dx = x - site.x, dz = z - site.z;
  const c = Math.cos(site.heading), s = Math.sin(site.heading);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  // foot.hx/z0/z1 describe the slab at SCALE 1 (footprints are cached and
  // scale-independent — see buckyFootprints() etc.); scale them here by the
  // CURRENT brand size so the walkable region always matches the rendered
  // slab, which is `building`-scaled at spawn time.
  if (Math.abs(lx) > foot.hx * SCALE || lz < foot.z0 * SCALE || lz > foot.z1 * SCALE) return null;
  return site.padY + PAD_TOP * SCALE;
}

// ground height for player/vehicle placement: a brand site's flat pad top
// when (x,z) is inside its footprint, else null so vehicle.js falls back to
// raw hAt (mirrors airports.js's groundYAt so main.js can chain both).
export function groundYAt(x, z) {
  for (const site of buckyFootprints()) {
    const y = footAt(x, z, site, BUCKY_FOOT);
    if (y !== null) return y;
  }
  for (const site of hebFootprints()) {
    const y = footAt(x, z, site, HEB_FOOT);
    if (y !== null) return y;
  }
  for (const site of lscFootprints()) {
    const y = footAt(x, z, site, LSC_FOOT);
    if (y !== null) return y;
  }
  return null;
}

// true when (x,z) is within `range` of any brand site's unscaled center — for
// the "[ / ] resizes buildings" HUD hint. Deliberately SCALE-independent
// (unlike footAt/groundYAt above): at a shrunk-down size the rendered
// footprint itself gets tiny, so gating on it would make the hint nearly
// undiscoverable exactly when it's most useful. Reuses the same footprint
// caches, so no `this.live` (streaming) dependency either.
export function brandNear(x, z, range) {
  const r2 = range * range;
  for (const site of buckyFootprints()) if ((site.x - x) ** 2 + (site.z - z) ** 2 < r2) return true;
  for (const site of hebFootprints()) if ((site.x - x) ** 2 + (site.z - z) ** 2 < r2) return true;
  for (const site of lscFootprints()) if ((site.x - x) ** 2 + (site.z - z) ** 2 < r2) return true;
  return false;
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
  // Roadside NEON on a near-black board (a deliberate departure from the real
  // yellow sign — Bruno, 2026-07-16, after two lit-surface looks washed out
  // under the warm sign light). The texture doubles as the emissiveMap, so
  // everything bright here IS the night glow: brand yellow for the wordmark,
  // trim red for the border tube, glow halos baked via canvas shadowBlur
  // (reads as tube bloom — no postprocessing in the renderer).
  ctx.fillStyle = '#0b0b0f'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.shadowColor = '#e8452f'; ctx.shadowBlur = 22;                         // red tube border
  ctx.strokeStyle = '#ff5a3c'; ctx.lineWidth = 10; ctx.lineJoin = 'round';
  ctx.strokeRect(20, 20, c.width - 40, c.height - 40);
  ctx.strokeRect(20, 20, c.width - 40, c.height - 40);                       // second pass thickens the baked halo
  ctx.shadowColor = '#f2c200'; ctx.shadowBlur = 26;                          // yellow tube wordmark
  ctx.fillStyle = '#ffd83d'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = "bold italic 108px 'Georgia', serif";
  ctx.fillText("Bucky's", c.width / 2, c.height / 2);
  ctx.fillText("Bucky's", c.width / 2, c.height / 2);
  ctx.shadowBlur = 0;
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

// Lone Star Compute ID sign face (DATACENTER_SIGN_SPEC.md) — dark panel with
// a thin cyan border and the brand name + per-site tagline in cyan, baked
// into one canvas reused as BOTH the diffuse map (readable by day on
// contrast alone) and the emissiveMap (only the cyan pixels glow at night —
// see the constructor comment on why ventMat's idiom doesn't fit here).
function mkLSCSignTex(tagline) {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#12181c'; ctx.fillRect(0, 0, c.width, c.height);        // near-black panel
  ctx.strokeStyle = '#35e0ff'; ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, c.width - 20, c.height - 20);                      // cyan border
  ctx.fillStyle = '#e8fbff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.fillText('LONE STAR COMPUTE', c.width / 2, c.height / 2 - 34);
  ctx.fillStyle = '#35e0ff';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.fillText(tagline, c.width / 2, c.height / 2 + 34);
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
// road and the procedural downtown). Rejected on downtown overlap, an airport
// footprint, or a spot that fails spotClear (on a road ribbon / in water /
// out of state — the pre-legality search shipped Corpus Christi in the bay,
// El Paso across the border and Waco on the Brazos, audited 2026-07-16).
// Retries with a wider radius, matching the roadShoulder idiom in npcs.js
// (mirrored here rather than imported: that function is module-private and
// this table's shape — reject-and-retry over many sites — doesn't fit a
// single-point helper). 24 attempts: coastal/border cities need a landward
// angle (worst audited convergence: Abilene at 14).
function buildHEBSites() {
  const top = [...GEO.cities].sort((a, b) => b.pop - a.pop).slice(0, HEB_COUNT);
  const sites = [];
  for (const city of top) {
    const R = cityRadius(city.pop);
    const rand = seededRand('heb:' + city.name);
    let spot = null;
    for (let attempt = 0; attempt < 24 && !spot; attempt++) {
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
      if (!spotClear(x, z, HEB_FOOT.z1)) continue; // on a road ribbon / wet / out of state
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

// ------------------------------------------------------ Lone Star Compute (W3)
// Shared roof/side cooling-fan unit prototype — a boxy housing with a shroud
// ring + a thin blade cross. Instanced across both shed roofs.
function mkCoolingFan() {
  return merge([
    tinted(new THREE.BoxGeometry(3.2, 1.0, 3.2).translate(0, 0.5, 0), 0x555b62),               // housing
    tinted(new THREE.CylinderGeometry(1.4, 1.4, 0.2, 12).translate(0, 1.05, 0), 0x3a3f45),     // fan shroud ring
    tinted(new THREE.BoxGeometry(2.4, 0.08, 0.3).translate(0, 1.12, 0), 0x6a7078),             // blade cross
    tinted(new THREE.BoxGeometry(0.3, 0.08, 2.4).translate(0, 1.12, 0), 0x6a7078),
  ]);
}

// Shared rooftop condenser-drum prototype — a vertical galvanized cylinder with
// rims + a pipe riser greeble. Instanced along each shed roof.
function mkCondenserDrum() {
  return merge([
    tinted(new THREE.CylinderGeometry(1.1, 1.1, 3.2, 10).translate(0, 1.6, 0), LSC_DRUM),      // drum body
    tinted(new THREE.CylinderGeometry(1.2, 1.2, 0.3, 10).translate(0, 3.1, 0), 0x9aa0a6),      // top rim
    tinted(new THREE.CylinderGeometry(1.2, 1.2, 0.3, 10).translate(0, 0.2, 0), 0x9aa0a6),      // base rim
    tinted(new THREE.BoxGeometry(0.2, 3.2, 0.2).translate(1.05, 1.6, 0), LSC_STEEL),           // pipe riser
  ]);
}

// Shared lattice transmission-pylon prototype — four parallel legs, lacing
// rings at intervals, two crossarms (spanning z) near the top carrying the
// conductor lines. Instanced along the line marching out from the substation.
function mkPylon() {
  const p = [];
  const H = 13;
  for (const [lx, lz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) // legs
    p.push(tinted(new THREE.CylinderGeometry(0.09, 0.11, H, 4).translate(lx, H / 2, lz), LSC_STEEL));
  for (const ly of [3, 6, 9]) { // horizontal lacing rings
    p.push(tinted(new THREE.BoxGeometry(1.1, 0.08, 0.08).translate(0, ly, 0.5), LSC_STEEL));
    p.push(tinted(new THREE.BoxGeometry(1.1, 0.08, 0.08).translate(0, ly, -0.5), LSC_STEEL));
    p.push(tinted(new THREE.BoxGeometry(0.08, 0.08, 1.1).translate(0.5, ly, 0), LSC_STEEL));
    p.push(tinted(new THREE.BoxGeometry(0.08, 0.08, 1.1).translate(-0.5, ly, 0), LSC_STEEL));
  }
  for (const ay of [10.5, 12]) // crossarms carry the wires (span z)
    p.push(tinted(new THREE.BoxGeometry(0.4, 0.18, 6.5).translate(0, ay, 0), LSC_STEEL));
  return merge(p);
}

// Lone Star Compute hero — two long windowless server sheds with a ribbed
// (corrugated) roofline, a small office/entry block, a security-fence
// perimeter, and a back-corner substation (transformers + bushings + gantry)
// feeding a line of transmission pylons + a sagging-wire hint marching off the
// lot. One static merged mesh (the pylons/cooling/drums are instanced, the cold
// cooling vents are a separate emissive mesh). Local frame like the others: pad
// center origin, ground y=0, +z toward the road. Datacenters sit on flat graded
// pads, so the pylon line stays on the lot plane (y=0) — keeps the wire hint a
// clean horizontal. Slab dims are mirrored EXACTLY by LSC_FOOT (grounding).
function buildLoneStarHero(skirt = 0.4) {
  const s = [];       // static merged mesh
  const vents = [];   // cold EMISSIVE cooling-vent louvers (own mesh/material)

  // --- foundation slab (airport-skirt idiom): 48 wide × 40 deep @ z=5 ---
  s.push(tinted(new THREE.BoxGeometry(48, skirt + 0.4, 40).translate(0, -skirt / 2 + 0.2, 5), LSC_CONCRETE));

  // --- two long windowless server sheds with a ribbed roofline ---
  for (const bx of [-13, 13]) {
    s.push(tinted(new THREE.BoxGeometry(18, 6.5, 30).translate(bx, 3.25, 4), LSC_SHED));         // shed body
    s.push(tinted(new THREE.BoxGeometry(18.6, 0.5, 30.6).translate(bx, 6.6, 4), LSC_ROOF));      // roof cap
    for (let rz = -10; rz <= 18; rz += 2)                                                        // corrugated ribs
      s.push(tinted(new THREE.BoxGeometry(18, 0.35, 0.5).translate(bx, 6.95, rz), LSC_STEEL));
    // dark outer-wall louver band (the emissive vent strip sits just proud of it)
    s.push(tinted(new THREE.BoxGeometry(0.4, 2.0, 26).translate(bx + (bx < 0 ? -9.05 : 9.05), 3.0, 4), 0x3a4048));
  }

  // --- cold cooling-vent glow (EMISSIVE): one long outer-wall louver per shed
  // + a few roof intake grilles. Dark diffuse (LSC_VENT_DIFF) under a saturated
  // cold emissive so it reads cold, not blown-out white. ---
  // tinted() only to satisfy merge()'s color-attribute requirement — ventMat
  // drives the actual (dark) diffuse; the emissive is what reads at night.
  for (const bx of [-13, 13]) {
    vents.push(tinted(new THREE.BoxGeometry(0.3, 1.5, 24).translate(bx + (bx < 0 ? -9.25 : 9.25), 3.0, 4), LSC_VENT_DIFF));
    for (const vz of [-6, 4, 14])
      vents.push(tinted(new THREE.BoxGeometry(6, 0.25, 2.5).translate(bx, 6.86, vz), LSC_VENT_DIFF));
  }

  // --- small office / entry block at the road-facing front ---
  s.push(tinted(new THREE.BoxGeometry(14, 5, 6).translate(0, 2.5, 22), LSC_OFFICE));
  s.push(tinted(new THREE.BoxGeometry(14.4, 0.5, 6.4).translate(0, 5.0, 22), 0xdedad0));         // office roof cap
  s.push(tinted(new THREE.BoxGeometry(11, 2.4, 0.3).translate(0, 2.4, 25.05), GLASS));           // entry glazing
  for (let i = -4; i <= 4; i++)
    s.push(tinted(new THREE.BoxGeometry(0.3, 2.6, 0.34).translate(i * 1.2, 2.4, 25.06), 0x6a6660));

  // --- perimeter security-fence posts ---
  const fx = 23, fz0 = -14, fz1 = 24;
  for (let pz = fz0; pz <= fz1; pz += 4) for (const px of [-fx, fx])
    s.push(tinted(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 5).translate(px, 1.1, pz), LSC_FENCE));
  for (let px = -fx + 4; px < fx; px += 4) for (const pz of [fz0, fz1])
    s.push(tinted(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 5).translate(px, 1.1, pz), LSC_FENCE));

  // --- substation (greebled transformers + bushings + gantry) at the back-right,
  // on-slab so the "enormous power draw" story reads up close ---
  const subX = 18, subZ = -9;
  for (const dx of [-3, 0, 3]) {
    s.push(tinted(new THREE.BoxGeometry(2.4, 3.0, 2.4).translate(subX + dx, 1.5, subZ), LSC_XFMR));   // tank
    s.push(tinted(new THREE.BoxGeometry(2.6, 0.4, 2.6).translate(subX + dx, 3.1, subZ), 0x6a6f76));    // lid
    for (const bo of [-0.6, 0.6])                                                                       // bushings
      s.push(tinted(new THREE.CylinderGeometry(0.16, 0.22, 1.2, 6).translate(subX + dx + bo, 3.7, subZ), LSC_DRUM));
  }
  s.push(tinted(new THREE.BoxGeometry(9, 0.3, 0.3).translate(subX, 5.2, subZ - 1.6), LSC_STEEL));       // gantry beam
  for (const gx of [subX - 4, subX + 4])
    s.push(tinted(new THREE.BoxGeometry(0.3, 5.2, 0.3).translate(gx, 2.6, subZ - 1.6), LSC_STEEL));     // gantry posts

  // --- cooling banks (instanced fan units) in rows on each shed roof ---
  const coolingXforms = [], m4 = new THREE.Matrix4();
  for (const bx of [-13, 13]) for (let cz = -8; cz <= 16; cz += 4) for (const cx of [bx - 4, bx + 4])
    coolingXforms.push(m4.clone().makeTranslation(cx, 6.9, cz));

  // --- rooftop condenser drums (instanced) ---
  const drumXforms = [];
  for (const bx of [-13, 13]) for (const dz of [-9, 0, 12])
    drumXforms.push(m4.clone().makeTranslation(bx, 7.4, dz));

  // --- transmission pylons marching out from the substation (instanced) + a
  // sagging-wire hint (thin conductor boxes between consecutive crossarm ends,
  // with a dip box at midspan). Kept on the lot plane (y=0). ---
  const pylonXforms = [], pxs = [];
  for (let px = 27; px <= 67; px += 10) pxs.push(px);
  for (const px of pxs) pylonXforms.push(m4.clone().makeTranslation(px, 0, subZ));
  for (let i = 0; i + 1 < pxs.length; i++) {
    const x0 = pxs[i], x1 = pxs[i + 1], mx = (x0 + x1) / 2, span = x1 - x0;
    for (const wz of [-3, 3]) for (const wy of [10.5, 12]) {
      s.push(tinted(new THREE.BoxGeometry(span, 0.07, 0.07).translate(mx, wy, subZ + wz), 0x2a2e33));
      s.push(tinted(new THREE.BoxGeometry(span * 0.45, 0.07, 0.07).translate(mx, wy - 0.5, subZ + wz), 0x2a2e33)); // midspan sag
    }
  }
  // stub conductors from the substation gantry to the first pylon
  for (const wz of [-3, 3]) for (const wy of [10.5, 12])
    s.push(tinted(new THREE.BoxGeometry(27 - subX, 0.07, 0.07).translate((subX + 27) / 2, wy, subZ + wz), 0x2a2e33));

  return { staticGeo: merge(s), ventGeo: merge(vents), coolingXforms, drumXforms, pylonXforms };
}
