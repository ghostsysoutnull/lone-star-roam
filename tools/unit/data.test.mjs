import assert from 'node:assert/strict';
import test from 'node:test';
import { finite, json, unique } from './helpers.mjs';

const ROAD_TYPES = new Set(['motorway', 'trunk', 'primary', 'street']);
const BAND_ROAD_TYPES = new Set(['motorway', 'trunk', 'primary']);

function checkPlaces(places, label, expectedCount, band = false) {
  assert.equal(places.length, expectedCount, `${label} count`);
  unique(places.map(({ name }) => name), `${label} names`);
  for (const [index, place] of places.entries()) {
    assert.equal(typeof place.name, 'string', `${label}[${index}].name`);
    if (band) assert.equal(typeof place.state, 'string', `${label}[${index}].state`);
    for (const key of ['x', 'z', 'pop']) finite(place[key], `${label}[${index}].${key}`);
  }
}

function checkRoads(roads, label, expectedCount, types) {
  assert.equal(roads.length, expectedCount, `${label} count`);
  for (const [index, road] of roads.entries()) {
    assert.equal(typeof road.ref, 'string', `${label}[${index}].ref`);
    assert.equal(types.has(road.type), true, `${label}[${index}].type (${road.type})`);
    assert.equal(road.pts.length >= 2, true, `${label}[${index}].pts needs two coordinates`);
    for (const [point, [x, z]] of road.pts.entries()) {
      finite(x, `${label}[${index}].pts[${point}][0]`);
      finite(z, `${label}[${index}].pts[${point}][1]`);
    }
  }
}

test('cities and band places retain their identity and coordinates', async () => {
  checkPlaces(await json('cities.json'), 'cities', 132);
  checkPlaces(await json('band-places.json'), 'band places', 177, true);
});

test('highway data retains valid tiers and geometry', async () => {
  checkRoads(await json('highways.json'), 'highways', 14923, ROAD_TYPES);
  checkRoads(await json('band-highways.json'), 'band highways', 1269, BAND_ROAD_TYPES);
});

test('rail data retains valid geometry and OSM identity when available', async () => {
  const rails = await json('rails.json');
  // W2's defrag bake chains reversed/head-side ways too: 560 fragments → ~187 real polylines
  assert.equal(rails.length > 150, true, 'rail count');
  const spurs = rails.filter((rail) => rail.spur);
  assert.equal(spurs.map((s) => s.spur).sort().join(), 'eaglepass,laredo', 'both border spurs baked');
  for (const s of spurs) {
    finite(s.bridge?.x, `${s.spur} bridge.x`);
    finite(s.bridge?.z, `${s.spur} bridge.z`);
    finite(s.bridge?.ang, `${s.spur} bridge.ang`);
  }
  for (const [index, rail] of rails.entries()) {
    assert.equal(rail.pts.length >= 2, true, `rails[${index}].pts needs two coordinates`);
    for (const [point, [x, z]] of rail.pts.entries()) {
      finite(x, `rails[${index}].pts[${point}][0]`);
      finite(z, `rails[${index}].pts[${point}][1]`);
    }
    if (rail.operator != null) assert.equal(typeof rail.operator, 'string', `rails[${index}].operator`);
    if (rail.name != null) assert.equal(typeof rail.name, 'string', `rails[${index}].name`);
  }
  assert.equal(rails.some((rail) => rail.operator || rail.name), true, 'at least one rail identity');
});

test('siding spans (Rails Ops W3) are valid arc-length windows on non-spur rails', async () => {
  const rails = await json('rails.json');
  const sided = rails.filter((rail) => rail.sd);
  // the 2026-07-19 sidings bake: 719 merged spans on 98 rails — floors, not exact
  assert.equal(sided.length >= 60, true, `sided rail count ${sided.length}`);
  const spans = sided.reduce((n, rail) => n + rail.sd.length, 0);
  assert.equal(spans >= 500, true, `siding span count ${spans}`);
  for (const [index, rail] of rails.entries()) {
    if (!rail.sd) continue;
    assert.equal(rail.spur == null, true, `rails[${index}] is a spur with sidings — spurs are named-train turf`);
    let len = 0;
    for (let i = 1; i < rail.pts.length; i++) {
      len += Math.hypot(rail.pts[i][0] - rail.pts[i - 1][0], rail.pts[i][1] - rail.pts[i - 1][1]);
    }
    for (const [j, { s0, s1, side }] of rail.sd.entries()) {
      finite(s0, `rails[${index}].sd[${j}].s0`);
      finite(s1, `rails[${index}].sd[${j}].s1`);
      assert.equal(s0 >= 0 && s0 < s1 && s1 <= len + 0.5, true, `rails[${index}].sd[${j}] span ${s0}–${s1} outside 0–${len.toFixed(1)}`);
      assert.equal(Math.abs(side), 1, `rails[${index}].sd[${j}].side ${side}`);
    }
  }
});

test('band rail data retains valid geometry and OSM identity', async () => {
  const bandRails = await json('band-rails.json');
  // 2026-07-19 bake: 38 polylines across the 4 neighbor-state strips
  assert.equal(bandRails.length > 30, true, 'band rail count');
  for (const [index, rail] of bandRails.entries()) {
    assert.equal(rail.band, true, `band-rails[${index}].band`);
    assert.equal(rail.pts.length >= 2, true, `band-rails[${index}].pts needs two coordinates`);
    for (const [point, [x, z]] of rail.pts.entries()) {
      finite(x, `band-rails[${index}].pts[${point}][0]`);
      finite(z, `band-rails[${index}].pts[${point}][1]`);
    }
    if (rail.operator != null) assert.equal(typeof rail.operator, 'string', `band-rails[${index}].operator`);
    if (rail.name != null) assert.equal(typeof rail.name, 'string', `band-rails[${index}].name`);
  }
  assert.equal(bandRails.some((rail) => rail.operator || rail.name), true, 'at least one band rail identity');
});

test('county agriculture records resolve one-to-one', async () => {
  const counties = await json('counties.json');
  const agriculture = await json('agriculture.json');
  assert.equal(counties.length, 254, 'county count');
  assert.equal(Object.keys(agriculture).length, 254, 'agriculture record count');
  unique(counties.map(({ name }) => name), 'county names');

  for (const [index, county] of counties.entries()) {
    assert.equal(typeof county.name, 'string', `counties[${index}].name`);
    assert.equal(Array.isArray(county.rings) && county.rings.length > 0, true, `counties[${index}].rings`);
    const record = agriculture[county.name];
    assert.ok(record, `agriculture missing county ${county.name}`);
    finite(record.areaKm2, `agriculture.${county.name}.areaKm2`);
    assert.equal(record.areaKm2 > 0, true, `agriculture.${county.name}.areaKm2 must be positive`);
  }
});
