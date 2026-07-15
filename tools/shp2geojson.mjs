#!/usr/bin/env node
// Minimal ESRI Shapefile (Polygon, type 5) + dbf reader -> plain JS records.
// No npm deps (project convention). Handles the Census cartographic boundary
// files (states/counties/places) used by tools/build-band.mjs.
// CLI usage: node tools/shp2geojson.mjs <base-path-without-extension> > out.json
import { readFileSync } from 'fs';

export function readShapefile(base) {
  const shp = readFileSync(base + '.shp');
  const dbf = readFileSync(base + '.dbf');

  const headerSize = dbf.readUInt16LE(8);
  const recordSize = dbf.readUInt16LE(10);
  const numRecords = dbf.readUInt32LE(4);
  const fields = [];
  let off = 32;
  while (dbf[off] !== 0x0d) {
    const name = dbf.toString('ascii', off, off + 11).replace(/\0.*$/, '');
    fields.push({ name, length: dbf[off + 16] });
    off += 32;
  }
  const records = [];
  for (let r = 0; r < numRecords; r++) {
    let ro = headerSize + r * recordSize + 1; // skip deletion flag
    const rec = {};
    for (const f of fields) { rec[f.name] = dbf.toString('ascii', ro, ro + f.length).trim(); ro += f.length; }
    records.push(rec);
  }

  let so = 100; // past 100-byte file header
  const shapes = [];
  while (so < shp.length) {
    so += 4; // record number (BE, unused)
    const contentBytes = shp.readInt32BE(so) * 2; so += 4;
    const recEnd = so + contentBytes;
    const shapeType = shp.readInt32LE(so);
    if (shapeType === 0) { shapes.push([]); so = recEnd; continue; }
    let p = so + 4 + 32; // shapeType(4) + box(32)
    const numParts = shp.readInt32LE(p); p += 4;
    const numPoints = shp.readInt32LE(p); p += 4;
    const parts = [];
    for (let i = 0; i < numParts; i++) { parts.push(shp.readInt32LE(p)); p += 4; }
    const pts = [];
    for (let i = 0; i < numPoints; i++) { pts.push([shp.readDoubleLE(p), shp.readDoubleLE(p + 8)]); p += 16; }
    shapes.push(parts.map((start, i) => pts.slice(start, i + 1 < parts.length ? parts[i + 1] : numPoints)));
    so = recEnd;
  }

  return records.map((properties, i) => ({ properties, rings: shapes[i] || [] }));
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  process.stdout.write(JSON.stringify(readShapefile(process.argv[2])));
}
