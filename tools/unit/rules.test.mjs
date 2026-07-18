import assert from 'node:assert/strict';
import test from 'node:test';
import { pickRoute, routeProblems, scheduleAirport } from '../../src/aviation-rules.js';
import { charterOfferTerms, groundOfferTerms, missionPayout, OVERSIZE_CAP, oversizeBonus, oversizeOfferTerms } from '../../src/mission-rules.js';

test('aviation route helpers reject unresolved routes and select by weight', () => {
  const airports = [{ id: 'AAA' }, { id: 'BBB' }, { id: 'MIL', military: true }];
  assert.deepEqual(routeProblems(airports, { AAA: [['BBB', 2]], BBB: [['AAA', 1]] }), []);
  assert.deepEqual(routeProblems(airports, { AAA: [['ZZZ', 0]], BBB: [], ZZZ: [['AAA', 1]] }), [
    'routes from unknown ZZZ',
    'AAA routes to unknown ZZZ',
    'AAA has invalid weight for ZZZ',
    'missing routes for BBB',
  ]);
  assert.equal(pickRoute([['AAA', 3], ['BBB', 1]], 0.74), 'AAA');
  assert.equal(pickRoute([['AAA', 3], ['BBB', 1]], 0.751), 'BBB');
});

test('airport schedule keeps daytime slots and tier-one red-eyes deterministic', () => {
  const random = (key) => {
    const values = {
      'AAA:2:0': [0.2, 0.1, 0.8],
      'AAA:2:1': [0.6, 0.9, 0.2],
      'AAA:2:redeye': [0.99, 0.5, 0.4, 0.1, 0.7],
    };
    let index = 0;
    return () => values[key][index++];
  };
  const makeSlot = (airport, day, slot, u, dest) => ({ airport: airport.id, day, slot, u, dest });
  const schedule = scheduleAirport({
    airport: { id: 'AAA', tier: 1 }, day: 2, routes: { AAA: [['BBB', 3], ['CCC', 1]] },
    slotsByTier: [0, 2, 1, 1], redeyeMax: 2, nightStart: 0.4, nightEnd: 0.8, random, makeSlot,
  });
  assert.deepEqual(schedule.map(({ slot, dest }) => [slot, dest]), [[0, 'BBB'], [100, 'BBB'], [101, 'BBB'], [1, 'CCC']]);
  assert.equal(schedule.filter(({ slot }) => slot < 100).every(({ u }) => u < 0.4 || u > 0.8), true);
  assert.equal(schedule.filter(({ slot }) => slot >= 100).every(({ u }) => u >= 0.4 && u <= 0.8), true);
});

test('mission offer terms and payout modifiers retain their shared rounding rules', () => {
  assert.deepEqual(groundOfferTerms(1000, false), { km: 100, pay: 170, deadline: 102 });
  assert.deepEqual(groundOfferTerms(1000, true), { km: 100, pay: 220, deadline: 76 });
  assert.deepEqual(charterOfferTerms(1000, false), { km: 100, pay: 220, deadline: 103 });
  assert.deepEqual(charterOfferTerms(1000, true), { km: 100, pay: 285, deadline: 78 });
  assert.equal(missionPayout(175, 1.2, false, true), 315);
  assert.equal(missionPayout(175, 1.2, true, true), 160);
  assert.equal(missionPayout(175, 1.2, true), 105);
});

test('oversize offer terms and the steady-haul bonus follow the speed-over-time cap rule', () => {
  assert.equal(OVERSIZE_CAP, 30); // ≈72 mph shown, under the 46 motorway cap
  assert.deepEqual(oversizeOfferTerms(6000), { km: 600, pay: 1050, deadline: 525 });
  assert.deepEqual(oversizeOfferTerms(336), { km: 34, pay: 145, deadline: 171 });
  assert.equal(oversizeBonus(22, OVERSIZE_CAP, false), true);
  assert.equal(oversizeBonus(30, OVERSIZE_CAP, false), true); // at the cap is still under it
  assert.equal(oversizeBonus(30.01, OVERSIZE_CAP, false), false); // one burst kills it
  assert.equal(oversizeBonus(12, OVERSIZE_CAP, true), false); // going airborne kills it too
});
