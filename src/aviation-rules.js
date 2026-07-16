// Dependency-free scheduling rules shared by aviation.js and fast Node checks.
export function routeProblems(airports, routes) {
  const known = new Set(airports.map((airport) => airport.id));
  const problems = [];
  for (const id of Object.keys(routes))
    if (!known.has(id)) problems.push(`routes from unknown ${id}`);
  for (const airport of airports) {
    if (airport.military) continue;
    const destinations = routes[airport.id];
    if (!destinations?.length) {
      problems.push(`missing routes for ${airport.id}`);
      continue;
    }
    for (const [id, weight] of destinations) {
      if (!known.has(id)) problems.push(`${airport.id} routes to unknown ${id}`);
      if (!(weight > 0)) problems.push(`${airport.id} has invalid weight for ${id}`);
    }
  }
  return problems;
}

export function pickRoute(routes, value) {
  const total = routes.reduce((sum, [, weight]) => sum + weight, 0);
  let remaining = value * total;
  for (const [id, weight] of routes) {
    remaining -= weight;
    if (remaining <= 0) return id;
  }
  return routes[0][0];
}

export function scheduleAirport({
  airport, day, routes, slotsByTier, redeyeMax, nightStart, nightEnd, random, makeSlot,
}) {
  const destinations = routes[airport.id];
  if (!destinations?.length) throw new Error(`missing routes for ${airport.id}`);
  const pick = (value) => pickRoute(destinations, value);
  const slots = [];
  const count = slotsByTier[airport.tier];
  const dayWidth = 1 - (nightEnd - nightStart);
  for (let slot = 0; slot < count; slot++) {
    const rand = random(`${airport.id}:${day}:${slot}`);
    const window = dayWidth * (slot + rand()) / count;
    slots.push(makeSlot(
      airport, day, slot, window < nightStart ? window : window + (nightEnd - nightStart), pick(rand()), rand,
    ));
  }
  if (airport.tier === 1) {
    const rand = random(`${airport.id}:${day}:redeye`);
    const count = Math.floor(rand() * (redeyeMax + 1));
    for (let slot = 0; slot < count; slot++)
      slots.push(makeSlot(
        airport, day, 100 + slot, nightStart + ((slot + rand()) / count) * (nightEnd - nightStart), pick(rand()), rand,
      ));
  }
  return slots.sort((a, b) => a.u - b.u);
}
