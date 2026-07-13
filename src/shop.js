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
const FLY_CAP = [150, 165, 180, 195];        // FLY cruise speed cap (+10/20/30%)
const FLY_CLIMB = [60, 69, 78, 87];          // FLY climb rate (+15/30/45%)
const CARGO_PAY = [1, 1.15, 1.3, 1.45];      // mission payout multiplier

export const ROMAN = ['I', 'II', 'III'];

export const SHOP = [
  { id: 'engine', icon: '🔧', name: 'Engine tune', prices: [350, 900, 1800],
    tiers: ['+8% top speed on any road', '+16% top speed on any road', '+24% top speed on any road'] },
  { id: 'tires', icon: '🛞', name: 'Ranch tires', prices: [350, 900, 1800],
    tiers: ['faster offroad, less rain drag', 'ranch roads like highways', 'mud, caliche, downpours — all the same'] },
  { id: 'lights', icon: '💡', name: 'Headlights', prices: [350, 900, 1800],
    tiers: ['brighter beam', 'much brighter beam', 'the full Marfa searchlight'] },
  { id: 'airframe', icon: '🛩️', name: 'Aviation tune', prices: [350, 900, 1800],
    tiers: ['+10% cruise, faster climb', '+20% cruise, quicker climb', '+30% cruise, mountain-goat climb'] },
  { id: 'cargo', icon: '📦', name: 'Cargo rig', prices: [350, 900, 1800],
    tiers: ['+15% haul pay', '+30% haul pay', '+45% haul pay'] },
  { id: 'dog', icon: '🐕', name: 'Lacy the Blue Lacy', prices: [750],
    tiers: ['the state dog of Texas — rides in the bed, follows you on foot'],
    done: 'She rides with you' },
  { id: 'radio', icon: '📻', name: 'Weather radio', prices: [400],
    tiers: ['hear the weather coming before it hits'],
    done: 'Crackling on the dash' },
  { id: 'avionics', icon: '🎙️', name: 'Aviation band radio', prices: [500],
    tiers: ['dial into any towered field, any mode, any distance'],
    done: 'Scanning the tower frequencies' },
];

// paint shop: a fresh coat any time, index 0 is the factory blue (vehicle.js)
export const PAINT_PRICE = 250;
export const PAINTS = [
  { name: 'Factory blue', hex: 0x2563b0 },
  { name: 'Burnt orange', hex: 0xbf5700 },
  { name: 'Aggie maroon', hex: 0x6a1f2a },
  { name: 'Rodeo red', hex: 0xb3202a },
  { name: 'Ranch white', hex: 0xe8e4da },
  { name: 'Midnight black', hex: 0x23262c },
  { name: 'Lone Star silver', hex: 0x9aa0a8 },
];

// repaint: repeatable, rejected when broke or already wearing that color
export function buyPaint(save, idx) {
  const paint = PAINTS[idx];
  if (!paint || idx === (save.gear.paint ?? 0) || save.bank < PAINT_PRICE) return null;
  save.bank -= PAINT_PRICE;
  save.gear.paint = idx;
  return { name: paint.name, price: PAINT_PRICE };
}

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
    flyCap: FLY_CAP[lvl('airframe')],
    flyClimb: FLY_CLIMB[lvl('airframe')],
    cargoPay: CARGO_PAY[lvl('cargo')],
    radio: lvl('radio') > 0,
    avionics: lvl('avionics') > 0,
  };
  player.truck.userData.bodyMat.color.setHex(PAINTS[save.gear?.paint ?? 0].hex);
  dog?.setOwned(lvl('dog') > 0);
}
