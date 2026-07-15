#!/usr/bin/env node
// Bake real elevation: AWS Terrarium DEM tiles -> data/elevation.bin (uint16 LE meters,
// high bit = outside Texas) + constants that must match src/geo.js.
// Usage: node tools/build-elevation.mjs <cb_..._state_500k-shapefile-base> [tileCacheDir]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { inflateSync } from 'zlib';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readShapefile } from './shp2geojson.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [statesPath, cacheDir = '/tmp/terrarium'] = process.argv.slice(2);
mkdirSync(cacheDir, { recursive: true });

// --- grid constants (mirrored in src/geo.js) ---
// Shoulder & Shelf W1: widened +~430u on the land sides (west/north/east) so
// the 25-mi (402u) shoulder sits fully inside the DEM; south (Gulf) stays put
// — the shelf is water, not real-DEM land.
const LAT0 = 31.0, LON0 = -99.5;
const M_LAT = 111320, M_LON = M_LAT * Math.cos((LAT0 * Math.PI) / 180);
const SCALE = 1 / 100;
export const GRID = { w: 448, h: 414, minX: -7330, maxX: 6230, minZ: -6630, maxZ: 5800 };

const Z = 7; // terrarium zoom (~1.2 km/px)
const lon2tx = (lon) => ((lon + 180) / 360) * 2 ** Z;
const lat2ty = (lat) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** Z;

// --- minimal PNG decoder (8-bit RGB / RGBA) ---
function decodePNG(buf) {
  let off = 8;
  let w, h, colorType, data = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = body.readUInt32BE(0); h = body.readUInt32BE(4);
      if (body[8] !== 8) throw new Error('bit depth ' + body[8]);
      colorType = body[9];
    } else if (type === 'IDAT') data.push(body);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(data));
  const bpp = colorType === 6 ? 4 : 3;
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1; else if (f === 4) v += paeth(a, b, c);
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h, bpp, px: out };
}

// --- fetch the tile set covering the game bounds ---
const g2lon = (x) => (x / SCALE / M_LON) + LON0;
const g2lat = (z) => -(z / SCALE / M_LAT) + LAT0;
const txMin = Math.floor(lon2tx(g2lon(GRID.minX))), txMax = Math.floor(lon2tx(g2lon(GRID.maxX)));
const tyMin = Math.floor(lat2ty(g2lat(GRID.minZ))), tyMax = Math.floor(lat2ty(g2lat(GRID.maxZ)));
console.log(`tiles z${Z}: x ${txMin}-${txMax}, y ${tyMin}-${tyMax} (${(txMax - txMin + 1) * (tyMax - tyMin + 1)})`);
const tiles = new Map();
for (let tx = txMin; tx <= txMax; tx++) {
  for (let ty = tyMin; ty <= tyMax; ty++) {
    const f = join(cacheDir, `${Z}-${tx}-${ty}.png`);
    if (!existsSync(f)) {
      execSync(`curl -s --max-time 60 -o ${f} https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${tx}/${ty}.png`);
      process.stdout.write('.');
    }
    tiles.set(`${tx},${ty}`, decodePNG(readFileSync(f)));
  }
}
console.log('\ntiles decoded');

// elevation (m) at lon/lat via bilinear over the tile mosaic
function elevAt(lon, lat) {
  const fx = lon2tx(lon), fy = lat2ty(lat);
  const sample = (px, py) => {
    const tx = Math.floor(px / 256), ty = Math.floor(py / 256);
    const t = tiles.get(`${tx},${ty}`);
    if (!t) return 0;
    const ix = Math.min(255, Math.max(0, Math.floor(px - tx * 256)));
    const iy = Math.min(255, Math.max(0, Math.floor(py - ty * 256)));
    const o = (iy * 256 + ix) * t.bpp;
    return t.px[o] * 256 + t.px[o + 1] + t.px[o + 2] / 256 - 32768;
  };
  const px = fx * 256, py = fy * 256;
  const x0 = Math.floor(px), y0 = Math.floor(py);
  const dx = px - x0, dy = py - y0;
  return (
    sample(x0, y0) * (1 - dx) * (1 - dy) + sample(x0 + 1, y0) * dx * (1 - dy) +
    sample(x0, y0 + 1) * (1 - dx) * dy + sample(x0 + 1, y0 + 1) * dx * dy
  );
}

// --- Texas border (mainland + Padre's rings) for the outside mask ---
// statesPath is a Census cartographic boundary shapefile base path (parsed by
// tools/shp2geojson.mjs — same file tools/build-band.mjs reads for Padre).
const tx = readShapefile(statesPath).find((f) => f.properties.STUSPS === 'TX');
const ranked = [...tx.rings].sort((a, b) => b.length - a.length);
const border = ranked[0]; // mainland
const inPadreWindow = (ring) => ring.some(([lon, lat]) => lon < -96.9 && lon > -97.6 && lat > 25.9 && lat < 28.0);
const padreRings = ranked.slice(1).filter((r) => r.length >= 100 && inPadreWindow(r));
const inPolyLL = (lon, lat, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inTexasLL = (lon, lat) => inPolyLL(lon, lat, border) || padreRings.some((r) => inPolyLL(lon, lat, r));

// --- city pads: flatten toward each city's center height (cities table from build-data) ---
const cities = JSON.parse(readFileSync(join(ROOT, 'data', 'cities.json'), 'utf8'));
const cityRadius = (pop) => Math.min(90, 6 + Math.pow(pop, 0.38) / 9);

// --- sample the grid ---
const { w, h, minX, maxX, minZ, maxZ } = GRID;
const out = new Uint16Array(w * h);
let peak = 0;
for (let j = 0; j < h; j++) {
  for (let i = 0; i < w; i++) {
    const x = minX + ((maxX - minX) * i) / (w - 1);
    const z = minZ + ((maxZ - minZ) * j) / (h - 1);
    const lon = g2lon(x), lat = g2lat(z);
    let m = Math.max(0, elevAt(lon, lat));
    // pads: blend toward the city's center elevation inside its radius
    for (const c of cities) {
      const R = cityRadius(c.pop) * 1.25;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < R) {
        c._h ??= Math.max(0, elevAt(g2lon(c.x), g2lat(c.z)));
        const k = 1 - d / R; // 1 at center
        m = m * (1 - k) + c._h * k;
      }
    }
    peak = Math.max(peak, m);
    out[j * w + i] = Math.min(32767, Math.round(m)) | (inTexasLL(lon, lat) ? 0 : 0x8000);
  }
  if (j % 50 === 0) process.stdout.write('#');
}
console.log(`\npeak elevation in grid: ${Math.round(peak)} m`);
writeFileSync(join(ROOT, 'data', 'elevation.bin'), Buffer.from(out.buffer));
console.log(`data/elevation.bin: ${((w * h * 2) / 1024).toFixed(0)} KB (${w}x${h})`);
