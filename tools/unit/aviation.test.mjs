import assert from 'node:assert/strict';
import test from 'node:test';
import { source, unique } from './helpers.mjs';

function airportRows(text) {
  return [...text.matchAll(/^\s*\{ id: '([A-Z0-9]+)',[\s\S]*?tier: ([123]),[\s\S]*?at: LL\(([^)]+)\),[\s\S]*?rw: \[([\s\S]*?)\],\s*fact:/gm)]
    .map(([, id, tier, at, runways]) => ({ id, tier: Number(tier), at, runways }));
}

function routeRows(text) {
  const block = text.match(/const ROUTES = \{([\s\S]*?)^\};/m);
  assert.ok(block, 'aviation ROUTES table not found');
  return [...block[1].matchAll(/^\s*([A-Z0-9]+): \[([^\n]+)\],/gm)]
    .map(([, id, destinations]) => ({
      id,
      destinations: [...destinations.matchAll(/\['([A-Z0-9]+)', (\d+)\]/g)]
        .map(([, destination, weight]) => ({ destination, weight: Number(weight) })),
    }));
}

test('airport records have unique IDs, valid tiers, coordinates, and runway data', async () => {
  const rows = airportRows(await source('airports.js'));
  assert.equal(rows.length, 27, 'airport count');
  unique(rows.map(({ id }) => id), 'airport IDs');
  assert.deepEqual(
    [1, 2, 3].map((tier) => rows.filter((airport) => airport.tier === tier).length),
    [7, 15, 5],
    'airport tier counts',
  );

  for (const airport of rows) {
    const coordinates = airport.at.split(',').map(Number);
    assert.equal(coordinates.length, 2, `${airport.id}.at must have two coordinates`);
    assert.equal(coordinates.every(Number.isFinite), true, `${airport.id}.at must be finite`);
    const runways = [...airport.runways.matchAll(/hdg: ([\d.]+), len: ([\d.]+), off: \[([-\d.]+), ([-\d.]+)\]/g)];
    assert.equal(runways.length > 0, true, `${airport.id} must have a runway`);
    for (const [, heading, length, x, z] of runways) {
      assert.equal(Number(heading) >= 0 && Number(heading) <= 180, true, `${airport.id} runway heading`);
      assert.equal(Number(length) > 0, true, `${airport.id} runway length`);
      assert.equal(Number.isFinite(Number(x)) && Number.isFinite(Number(z)), true, `${airport.id} runway offset`);
    }
  }
});

test('civilian airport routes resolve to known fields with positive weights', async () => {
  const airportSource = await source('airports.js');
  const airports = airportRows(airportSource);
  const military = new Set([...airportSource.matchAll(/^\s*\{ id: '([A-Z0-9]+)'[^\n]*military: true/gm)].map(([, id]) => id));
  const routes = routeRows(await source('aviation.js'));
  const airportIds = new Set(airports.map(({ id }) => id));
  const routeIds = new Set(routes.map(({ id }) => id));

  for (const airport of airports.filter(({ id }) => !military.has(id))) {
    assert.equal(routeIds.has(airport.id), true, `ROUTES missing civilian airport ${airport.id}`);
  }
  for (const route of routes) {
    assert.equal(airportIds.has(route.id), true, `ROUTES has unknown origin ${route.id}`);
    assert.equal(route.destinations.length > 0, true, `ROUTES.${route.id} needs a destination`);
    for (const { destination, weight } of route.destinations) {
      assert.equal(airportIds.has(destination), true, `ROUTES.${route.id} references unknown destination ${destination}`);
      assert.equal(weight > 0, true, `ROUTES.${route.id} weight for ${destination} must be positive`);
    }
  }
});
