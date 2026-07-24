// Dependency-free offer and payout rules shared by missions.js and fast Node checks.
const roundMoney = (value) => Math.round(value / 5) * 5;

export function groundOfferTerms(dist, rush) {
  return {
    km: Math.round(dist * 0.1),
    pay: roundMoney(50 + dist * 0.1 * 1.2 * (rush ? 1.4 : 1)),
    deadline: Math.round((dist / 24 + 60) * (rush ? 0.75 : 1)),
  };
}

export function charterOfferTerms(dist, rush) {
  return {
    km: Math.round(dist * 0.1),
    pay: roundMoney(60 + dist * 0.1 * 1.6 * (rush ? 1.4 : 1)),
    deadline: Math.round((dist / 75 + 90) * (rush ? 0.75 : 1)),
  };
}

export function missionPayout(pay, rig = 1, late = false, roadBonus = false) {
  return roundMoney(pay * rig * (late ? 0.5 : 1) * (roadBonus ? 1.5 : 1));
}

// Energy W6 — the oversize (wind-blade) slow haul. The cap is in game
// units/s (30 ≈ 72 mph on the HUD, under the 46 motorway cap); the deadline
// is generous because the challenge is restraint, not the clock.
export const OVERSIZE_CAP = 30;

export function oversizeOfferTerms(dist) {
  return {
    km: Math.round(dist * 0.1),
    pay: roundMoney(90 + dist * 0.1 * 1.6),
    deadline: Math.round(dist / 16 + 150),
  };
}

// Speed-over-time verdict: the bonus survives only a WHOLE haul spent at or
// under the cap on the ground — one burst over (or going airborne) kills it.
export function oversizeBonus(maxSpd, cap, flew) {
  return !flew && maxSpd <= cap;
}

// Sea-Industry W3 — the shrimp/cargo dock haul. Pays a touch more per km than
// a ground job (water miles are the whole pitch) with a generous deadline
// (12 u/s cruise assumption, slower than a road haul's).
export function seaOfferTerms(dist, rush) {
  return {
    km: Math.round(dist * 0.1),
    pay: roundMoney(70 + dist * 0.1 * 2.2 * (rush ? 1.4 : 1)),
    deadline: Math.round((dist / 12 + 150) * (rush ? 0.75 : 1)),
  };
}
