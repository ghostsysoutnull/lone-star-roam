// Shop: the mission bankroll buys truck upgrades and a dog (🛒 tab in the
// travel menu, rendered by travel.js). Purchase levels live in save.gear —
// a new save key, additive only. applyGear() turns levels into player.perks;
// vehicle.js reads perks and never touches the save. Balance knobs below:
// index = owned level, 0 = stock (must match vehicle.js stock values).
const ENGINE_CAP = [1, 1.08, 1.16, 1.24];    // road speed-cap multiplier
const TIRE_CAP = [20, 24, 28, 32];           // offroad speed cap
const TIRE_ACCEL = [14, 17, 20, 23];         // offroad accel
const TIRE_RAIN = [0.22, 0.16, 0.12, 0.08];  // rain slowdown fraction
const LIGHT_I = [30, 45, 62, 80];            // headlight PointLight intensity

export const ROMAN = ['I', 'II', 'III'];

export const SHOP = [
  { id: 'engine', icon: '🔧', name: 'Engine tune', prices: [350, 900, 1800],
    tiers: ['+8% top speed on any road', '+16% top speed on any road', '+24% top speed on any road'] },
  { id: 'tires', icon: '🛞', name: 'Ranch tires', prices: [350, 900, 1800],
    tiers: ['faster offroad, less rain drag', 'ranch roads like highways', 'mud, caliche, downpours — all the same'] },
  { id: 'lights', icon: '💡', name: 'Headlights', prices: [350, 900, 1800],
    tiers: ['brighter beam', 'much brighter beam', 'the full Marfa searchlight'] },
  { id: 'dog', icon: '🐕', name: 'Lacy the Blue Lacy', prices: [750],
    tiers: ['the state dog of Texas — rides in the bed, follows you on foot'] },
];

export const gearLevel = (save, id) => save.gear?.[id] ?? 0;

// null if maxed or unaffordable; otherwise deducts and returns the receipt
export function buy(save, id) {
  const item = SHOP.find((i) => i.id === id);
  if (!item) return null;
  const lvl = gearLevel(save, id);
  if (lvl >= item.prices.length) return null;
  const price = item.prices[lvl];
  if (save.bank < price) return null;
  save.bank -= price;
  save.gear[id] = lvl + 1;
  return { item, lvl: lvl + 1, price };
}

export function applyGear(save, player, dog) {
  const lvl = (id) => gearLevel(save, id);
  player.perks = {
    engineCap: ENGINE_CAP[lvl('engine')],
    offroadCap: TIRE_CAP[lvl('tires')],
    offroadAccel: TIRE_ACCEL[lvl('tires')],
    rainDrag: TIRE_RAIN[lvl('tires')],
    lightI: LIGHT_I[lvl('lights')],
  };
  dog?.setOwned(lvl('dog') > 0);
}
