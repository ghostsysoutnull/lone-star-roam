#!/usr/bin/env node
// Bake d3-celestial star/constellation data -> data/sky.json
// Usage: node tools/build-sky.mjs <stars.6.json> <constellations.lines.json> <constellations.json>
import { readFileSync, writeFileSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [starsPath, linesPath, namesPath] = process.argv.slice(2);

// RA/Dec (deg) -> unit vector, equatorial frame (z = celestial north pole)
const vec = ([ra, dec]) => {
  const r = (ra * Math.PI) / 180, d = (dec * Math.PI) / 180;
  return [
    +(Math.cos(d) * Math.cos(r)).toFixed(4),
    +(Math.cos(d) * Math.sin(r)).toFixed(4),
    +Math.sin(d).toFixed(4),
  ];
};

// stars: mag <= 5.0 (naked eye under decent skies), keep mag + B-V color index
const starsIn = JSON.parse(readFileSync(starsPath, 'utf8'));
const stars = [];
for (const f of starsIn.features) {
  const mag = f.properties.mag;
  if (mag > 5.0) continue;
  const bv = parseFloat(f.properties.bv) || 0.5;
  stars.push([...vec(f.geometry.coordinates), +mag.toFixed(1), +bv.toFixed(2)]);
}
console.log(`stars kept: ${stars.length}`);

// constellation lines: keep prominent ones (rank 1-2), as flat segment pairs
const linesIn = JSON.parse(readFileSync(linesPath, 'utf8'));
const segs = [];
let kept = 0;
for (const f of linesIn.features) {
  if (+f.properties.rank > 2) continue;
  kept++;
  for (const line of f.geometry.coordinates) {
    for (let i = 1; i < line.length; i++) segs.push([vec(line[i - 1]), vec(line[i])]);
  }
}
console.log(`constellations kept: ${kept}, segments: ${segs.length}`);

// labels: famous constellations only
const FAMOUS = new Set(['Ori', 'UMa', 'Cas', 'Cyg', 'Sco', 'Tau', 'Leo', 'Gem', 'CMa', 'Lyr', 'Aql', 'Peg', 'Boo', 'Vir', 'Sgr']);
const namesIn = JSON.parse(readFileSync(namesPath, 'utf8'));
const labels = [];
for (const f of namesIn.features) {
  if (!FAMOUS.has(f.id)) continue;
  labels.push({ n: f.properties.name, v: vec(f.geometry.coordinates) });
}
console.log(`labels: ${labels.map((l) => l.n).join(', ')}`);

writeFileSync(join(ROOT, 'data', 'sky.json'), JSON.stringify({ stars, segs, labels }));
console.log(`data/sky.json: ${(statSync(join(ROOT, 'data', 'sky.json')).size / 1024).toFixed(0)} KB`);
