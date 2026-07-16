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
