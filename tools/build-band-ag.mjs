#!/usr/bin/env node
// Build pipeline: USDA NASS Quick Stats county extracts for the four band
// states -> data/band-agriculture.json. Same source/schema as build-ag.mjs
// (see AGRICULTURE_SPEC.md "Data"), kept as its own script per the Band
// Parity precedent (build-band-roads.mjs) — TX's agriculture.json/GEO.ag
// stays untouched so the existing 254-county assertions never move.
// Usage: node tools/build-band-ag.mjs <la.gz> <ar.gz> <ok.gz> <nm.gz>
//   Argument ORDER IS LOAD-BEARING: each file is filtered to its own state
//   already (see the awk extraction in NEXT_SESSION.md/BAND_PARITY_SPEC.md),
//   and this order (LA, AR, OK, NM) tags rows by position.
import { readFileSync, writeFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATES = ['LA', 'AR', 'OK', 'NM'];
const [laPath, arPath, okPath, nmPath] = process.argv.slice(2);
if (!laPath || !arPath || !okPath || !nmPath) {
  console.error('Usage: node tools/build-band-ag.mjs <la.gz> <ar.gz> <ok.gz> <nm.gz>');
  process.exit(1);
}
const PATHS = { LA: laPath, AR: arPath, OK: okPath, NM: nmPath };

// column indices (0-based) per the verified extract layout (same as build-ag.mjs)
const COL = { SHORT_DESC: 9, DOMAIN_DESC: 10, COUNTY_NAME: 21, VALUE: 37 };

const SIMPLE_MEASURES = {
  'CATTLE, INCL CALVES - INVENTORY': 'cattle',
  'EQUINE, HORSES & PONIES - INVENTORY': 'horses',
  'GOATS - INVENTORY': 'goats',
  'SHEEP, INCL LAMBS - INVENTORY': 'sheep',
  'CATTLE, ON FEED - INVENTORY': 'onFeed',
  'AG LAND, IRRIGATED - ACRES': 'irrAcres',
};

// Same crop set as TX, plus SOYBEANS — a real coverage gap in the band
// region (AR/OK/LA bottomlands) that the TX-only palette never needed.
const CROP_MEASURES = {
  'COTTON - ACRES HARVESTED': 'cotton',
  'RICE - ACRES HARVESTED': 'rice',
  'SORGHUM, GRAIN - ACRES HARVESTED': 'sorghum',
  'CORN, GRAIN - ACRES HARVESTED': 'corn',
  'WHEAT - ACRES HARVESTED': 'wheat',
  'HAY - ACRES HARVESTED': 'hay',
  'PEANUTS - ACRES HARVESTED': 'peanuts',
  'CITRUS TOTALS - ACRES BEARING & NON-BEARING': 'citrus',
  'PECANS - ACRES BEARING & NON-BEARING': 'pecans',
  'SUGARCANE, SUGAR & SEED - ACRES HARVESTED': 'sugarcane',
  'SOYBEANS - ACRES HARVESTED': 'soybeans',
};
const WHEAT_FALLBACK = 'WHEAT, WINTER - ACRES HARVESTED';
const CROP_KEYS = Object.values(CROP_MEASURES);

// neighbor-counties.json spells "St. Mary Parish"; the census extract spells
// "SAINT MARY" — an ordinary abbreviation difference, not a data error.
const norm = (s) => s.toUpperCase().replace(/^ST\./, 'SAINT').replace(/[\s.]/g, '');
const stripSuffix = (s) => s.replace(/\s+(County|Parish)$/i, '');
const parseValue = (v) => (v === '(D)' || v === '(Z)' || v === '' ? 0 : (+v.replace(/,/g, '') || 0));

// Known corrupted key in neighbor-counties.json: "Doña Ana County" ships as
// "DoC1a Ana County" — mojibake from the original TIGER shapefile ingest
// (tools/build-band.mjs), unrelated to this pipeline. Root cause is a
// BACKLOG item (re-fetch/rebuild neighbor-counties.json); scoped alias here
// so the ag join isn't blocked on unrelated geometry work.
const KEY_ALIASES = { DOC1AANA: 'DONAANA' };

const ringArea = (ring) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(a) / 2;
};

const MIN_ACRES = 50;
const out = {};
let totalJoined = 0;

const neighborCounties = JSON.parse(readFileSync(join(ROOT, 'data', 'neighbor-counties.json'), 'utf8'));

for (const state of STATES) {
  const text = gunzipSync(readFileSync(PATHS[state])).toString('utf8');
  const lines = text.split('\n');
  const raw = new Map();
  const wheatFallback = new Map();
  const suppressed = {};

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split('\t');
    if (cols[COL.DOMAIN_DESC] !== 'TOTAL') continue;
    const shortDesc = cols[COL.SHORT_DESC];
    const countyName = cols[COL.COUNTY_NAME];
    if (!countyName) continue;
    const key = norm(countyName);

    const field = SIMPLE_MEASURES[shortDesc];
    const cropField = CROP_MEASURES[shortDesc];
    if (!field && !cropField && shortDesc !== WHEAT_FALLBACK) continue;

    const raw38 = cols[COL.VALUE];
    if (raw38 === '(D)' || raw38 === '(Z)') suppressed[shortDesc] = (suppressed[shortDesc] || 0) + 1;
    const value = parseValue(raw38);

    if (!raw.has(key)) raw.set(key, { cattle: 0, horses: 0, goats: 0, sheep: 0, onFeed: 0, irrAcres: 0, crops: Object.fromEntries(CROP_KEYS.map((k) => [k, 0])) });
    const rec = raw.get(key);
    if (field) rec[field] = value;
    else if (cropField) rec.crops[cropField] = value;
    else if (shortDesc === WHEAT_FALLBACK) wheatFallback.set(key, value);
  }
  for (const [key, rec] of raw) if (rec.crops.wheat === 0 && wheatFallback.has(key)) rec.crops.wheat = wheatFallback.get(key);

  console.log(`${state}: parsed ${raw.size} counties from the extract.`);
  for (const [desc, count] of Object.entries(suppressed)) console.log(`  suppressed (D)/(Z): ${desc} x${count}`);

  // dominantCrop share is computed per-state (own statewide total), same
  // method as TX — pooling across all four states would let one state's
  // unrelated crop mix dilute another's genuinely concentrated specialty.
  const stateTotals = Object.fromEntries(CROP_KEYS.map((k) => [k, 0]));
  for (const rec of raw.values()) for (const k of CROP_KEYS) stateTotals[k] += rec.crops[k];

  const stCounties = neighborCounties.filter((c) => c.state === state);
  let joined = 0;
  for (const c of stCounties) {
    let key = norm(stripSuffix(c.name));
    key = KEY_ALIASES[key] || key;
    const rec = raw.get(key);
    if (!rec) { console.error(`No census match for ${state} county "${c.name}" (key ${key})`); continue; }
    joined++;
    const areaKm2 = +(ringArea(c.ring) * 0.01).toFixed(1); // 1 unit = 100 m -> 1 unit^2 = 0.01 km^2

    let dominantCrop = null, bestShare = 0;
    for (const [k, v] of Object.entries(rec.crops)) {
      if (v < MIN_ACRES || stateTotals[k] === 0) continue;
      const share = v / stateTotals[k];
      if (share > bestShare) { bestShare = share; dominantCrop = k; }
    }
    out[`${state}|${c.name}`] = { ...rec, areaKm2, dominantCrop };
  }
  console.log(`${state}: joined ${joined}/${stCounties.length} counties.`);
  totalJoined += joined;
}

if (totalJoined !== 249) {
  console.error(`Join failed: ${totalJoined}/249 band counties matched. Aborting.`);
  process.exit(1);
}
console.log(`Joined ${totalJoined}/249 band counties.`);

const json = JSON.stringify(out);
writeFileSync(join(ROOT, 'data', 'band-agriculture.json'), json);
console.log(`Wrote data/band-agriculture.json (${(json.length / 1024).toFixed(1)} KB)`);
