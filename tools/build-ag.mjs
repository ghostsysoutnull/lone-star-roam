#!/usr/bin/env node
// Build pipeline: USDA NASS Quick Stats county extract -> data/agriculture.json
// Usage: node tools/build-ag.mjs <tx_county_census2022.txt.gz>
// See AGRICULTURE_SPEC.md "Data" section for column layout + measure notes.
import { readFileSync, writeFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [extractPath] = process.argv.slice(2);
if (!extractPath) {
  console.error('Usage: node tools/build-ag.mjs <tx_county_census2022.txt.gz>');
  process.exit(1);
}

// column indices (0-based) per the verified extract layout
const COL = { SHORT_DESC: 9, DOMAIN_DESC: 10, COUNTY_NAME: 21, VALUE: 37 };

// inventory/land measures -> record field name
const SIMPLE_MEASURES = {
  'CATTLE, INCL CALVES - INVENTORY': 'cattle',
  'EQUINE, HORSES & PONIES - INVENTORY': 'horses',
  'GOATS - INVENTORY': 'goats',
  'SHEEP, INCL LAMBS - INVENTORY': 'sheep',
  'CATTLE, ON FEED - INVENTORY': 'onFeed',
  'AG LAND, IRRIGATED - ACRES': 'irrAcres',
};

// crop acreage measures -> crops.<key>. Plain totals only (never the
// class/irrigation sub-breakdowns, which double-count against the total —
// e.g. Hidalgo COTTON = COTTON,UPLAND + COTTON,PIMA).
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
};
// WHEAT total is a same-value superset of WHEAT, WINTER in every county
// checked — only used as a fallback when the plain WHEAT row is missing.
const WHEAT_FALLBACK = 'WHEAT, WINTER - ACRES HARVESTED';

const CROP_KEYS = Object.values(CROP_MEASURES);
const norm = (s) => s.toUpperCase().replace(/[\s.]/g, '');

// --- parse the extract ---
const text = gunzipSync(readFileSync(extractPath)).toString('utf8');
const lines = text.split('\n');
const raw = new Map(); // normalized county name -> partial record
const wheatFallback = new Map();
const suppressed = {};

const parseValue = (v) => {
  if (v === '(D)' || v === '(Z)' || v === '') return 0;
  return +v.replace(/,/g, '') || 0;
};

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

for (const [key, rec] of raw) {
  if (rec.crops.wheat === 0 && wheatFallback.has(key)) rec.crops.wheat = wheatFallback.get(key);
}

console.log(`Parsed ${raw.size} counties from the extract.`);
for (const [desc, count] of Object.entries(suppressed)) console.log(`  suppressed (D)/(Z): ${desc} x${count}`);

// --- join to counties.json (mixed-case names, shoelace area) ---
const counties = JSON.parse(readFileSync(join(ROOT, 'data', 'counties.json'), 'utf8'));

const ringArea = (ring) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(a) / 2;
};

// dominantCrop = the crop where this county holds the largest SHARE of the
// crop's statewide total, not raw acreage — cotton/corn/wheat/hay are grown
// nearly everywhere and would win almost every county on raw acreage alone,
// burying the geographically-concentrated specialty crops (citrus, rice,
// peanuts, sugarcane) the track is themed around. Confirmed against real
// fixtures: Hidalgo -> citrus (86% of state total), Wharton -> rice (32%),
// Gaines -> peanuts (42%). A MIN_ACRES floor keeps a stray few-acre value in
// a small-total crop (sugarcane, citrus) from posting a noise-driven share.
const MIN_ACRES = 50;
const stateTotals = Object.fromEntries(CROP_KEYS.map((k) => [k, 0]));
for (const rec of raw.values()) for (const k of CROP_KEYS) stateTotals[k] += rec.crops[k];

const out = {};
let joined = 0;
for (const c of counties) {
  const key = norm(c.name);
  const rec = raw.get(key);
  if (!rec) { console.error(`No census match for county "${c.name}" (key ${key})`); continue; }
  joined++;
  const areaUnits2 = c.rings.reduce((s, r) => s + ringArea(r), 0);
  const areaKm2 = +(areaUnits2 * 0.01).toFixed(1); // 1 unit = 100 m -> 1 unit^2 = 0.01 km^2

  let dominantCrop = null, bestShare = 0;
  for (const [k, v] of Object.entries(rec.crops)) {
    if (v < MIN_ACRES || stateTotals[k] === 0) continue;
    const share = v / stateTotals[k];
    if (share > bestShare) { bestShare = share; dominantCrop = k; }
  }

  out[c.name] = { ...rec, areaKm2, dominantCrop };
}

if (joined !== 254) {
  console.error(`Join failed: ${joined}/254 counties matched. Aborting.`);
  process.exit(1);
}
console.log(`Joined ${joined}/254 counties.`);

const json = JSON.stringify(out);
writeFileSync(join(ROOT, 'data', 'agriculture.json'), json);
console.log(`Wrote data/agriculture.json (${(json.length / 1024).toFixed(1)} KB)`);
