// Sea-Industry W1 route scout, step 1: AIS daily extract -> Texas Gulf density grid.
// usage: node tools/reduce-ais.mjs ~/claude-area/devel/tx-inputs/AIS_2024_03_15.zip
//
// Streams the marinecadastre.gov national daily CSV (never unpacked to disk),
// clips to the Texas Gulf bbox, keeps moving commercial traffic only
// (SOG >= 2 kn so anchorages don't read as routes) and bins positions into a
// 5-unit grid — two class buckets: cargo (VesselType 70-89, the classes the
// W1 routes carry — the route gate) and tug (31/32/52, the tug-and-barge
// trade that corroborates the thin nearshore trunk). Density = unique vessels
// per cell (a loitering ship counts once), raw point count kept alongside.
// Output: tx-inputs/ais-density.json (not in the repo, like every bake input).
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// same equirectangular projection as tools/build-data.mjs `proj` / geo.js LL()
const proj = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];

const BBOX = { latMin: 25.5, latMax: 30.1, lonMin: -97.9, lonMax: -93.4 };
const CELL = 5; // game units (500 m real)
const [x0] = proj(BBOX.latMax, BBOX.lonMin), [x1] = proj(BBOX.latMin, BBOX.lonMax);
const [, z0] = proj(BBOX.latMax, BBOX.lonMin), [, z1] = proj(BBOX.latMin, BBOX.lonMax);
const W = Math.ceil((x1 - x0) / CELL), H = Math.ceil((z1 - z0) / CELL);

const zip = process.argv[2];
if (!zip) { console.error('usage: node tools/reduce-ais.mjs <AIS zip>'); process.exit(1); }

const buckets = { cargo: new Map(), tug: new Map() }; // idx -> { m: Set<mmsi>, n: points }
let rows = 0, inBox = 0;
const kept = { cargo: 0, tug: 0 };
const vessels = { cargo: new Set(), tug: new Set() };

const un = spawn('unzip', ['-p', zip]);
const rl = createInterface({ input: un.stdout, crlfDelay: Infinity });
let header = true;
rl.on('line', (line) => {
  if (header) { header = false; return; }
  rows++;
  // MMSI,BaseDateTime,LAT,LON,SOG,COG,Heading,VesselName,IMO,CallSign,VesselType,...
  const c = line.split(',');
  const lat = +c[2], lon = +c[3];
  if (lat < BBOX.latMin || lat > BBOX.latMax || lon < BBOX.lonMin || lon > BBOX.lonMax) return;
  inBox++;
  const sog = +c[4], type = +c[10];
  if (!(sog >= 2)) return;
  const cls = type >= 70 && type <= 89 ? 'cargo' : (type === 31 || type === 32 || type === 52) ? 'tug' : null;
  if (!cls) return;
  kept[cls]++;
  vessels[cls].add(c[0]);
  const [x, z] = proj(lat, lon);
  const ix = Math.floor((x - x0) / CELL), iz = Math.floor((z - z0) / CELL);
  if (ix < 0 || ix >= W || iz < 0 || iz >= H) return;
  const idx = iz * W + ix;
  const cells = buckets[cls];
  let cell = cells.get(idx);
  if (!cell) cells.set(idx, cell = { m: new Set(), n: 0 });
  cell.m.add(c[0]);
  cell.n++;
});
rl.on('close', () => {
  const dump = (cells) => [...cells.entries()].map(([idx, c]) => [idx % W, Math.floor(idx / W), c.m.size, c.n]);
  const out = {
    cell: CELL, x0, z0, w: W, h: H, bbox: BBOX,
    source: zip.replace(/.*\//, ''),
    filter: 'SOG>=2kn, unique-vessel density; cargo=type 70-89, tug=type 31/32/52',
    cells: dump(buckets.cargo), tugCells: dump(buckets.tug),
  };
  const dest = join(dirname(zip), 'ais-density.json');
  writeFileSync(dest, JSON.stringify(out));
  console.log(`rows ${rows}  in-bbox ${inBox}  cargo kept ${kept.cargo}/${vessels.cargo.size} vessels (${buckets.cargo.size} cells)  tug kept ${kept.tug}/${vessels.tug.size} vessels (${buckets.tug.size} cells)`);
  console.log(`grid ${W}x${H} @ ${CELL}u  x [${x0.toFixed(0)}..${x1.toFixed(0)}]  z [${z0.toFixed(0)}..${z1.toFixed(0)}]`);
  console.log(`wrote ${dest}`);
});
