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
const JET_THRUST = [0, 55, 70, 85];          // jetpack ascent thrust (0 = not owned)
const JET_ALT = [0, 40, 55, 70];             // jetpack max AGL cap
const JET_SPEED = [0, 9, 12, 15];            // jetpack horizontal air speed
const OUTBOARD_CAP = [24, 28, 32];           // BOAT top speed (index 0 = vehicle.js stock BOAT_SPEED)
const OUTBOARD_ACCEL = [10, 12.5, 15];       // BOAT accel (index 0 = vehicle.js stock BOAT_ACCEL)

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
  { id: 'jetpack', icon: '🚀', name: 'Jetpack', prices: [900, 1800, 3200],
    tiers: ['hover up to 40u, on foot', 'higher and quicker: 55u', 'top tier: 70u, fastest climb and drift'] },
  { id: 'dog', icon: '🐕', name: 'Lacy the Blue Lacy', prices: [750],
    tiers: ['the state dog of Texas — rides in the bed, follows you on foot'],
    done: 'She rides with you' },
  { id: 'radio', icon: '📻', name: 'Weather radio', prices: [400],
    tiers: ['hear the weather coming before it hits'],
    done: 'Crackling on the dash' },
  { id: 'avionics', icon: '🎙️', name: 'Aviation band radio', prices: [500],
    tiers: ['dial into any towered field, any mode, any distance'],
    done: 'Scanning the tower frequencies' },
  { id: 'outboard', icon: '🚤', name: 'Outboard upgrade', prices: [500, 1200],
    tiers: ['+17% top speed on the water, quicker spool-up', 'a third over stock — the Gulf gets small'],
    done: 'Wide open at the helm' },
  { id: 'vhf', icon: '📻', name: 'VHF handheld', prices: [350],
    tiers: ['channel 16 anywhere — every working boat in the Gulf'],
    done: 'Squawking on 16' },
  { id: 'boatlights', icon: '🏮', name: 'Running lights', prices: [300],
    tiers: ['red over port, green over starboard — legal after dark'],
    done: 'Burning after dark' },
  { id: 'shrimprig', icon: '🦐', name: 'Shrimp rig', prices: [600],
    tiers: ['troll the fleet’s grounds, land the catch for pay'],
    done: 'Outriggers rigged' },
  { id: 'fishfinder', icon: '🐟', name: 'Fish finder', prices: [450],
    tiers: ['sonar pings the life under the boat'],
    done: 'Screen glowing at the helm' },
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

// boatyard: same repeatable-coat idiom as the truck paint shop, own save key
export const BOAT_PAINT_PRICE = 200;
export const BOAT_PAINTS = [
  { name: 'Skiff white', hex: 0xdde4e8 },
  { name: 'Bay teal', hex: 0x2f8f8f },
  { name: 'Hull red', hex: 0xa8352e },
  { name: 'Storm gray', hex: 0x5b6570 },
  { name: 'Baywater green', hex: 0x4a7a5a },
  { name: 'Midnight blue', hex: 0x243a5e },
];

export function buyBoatPaint(save, idx) {
  const paint = BOAT_PAINTS[idx];
  if (!paint || idx === (save.gear.hullpaint ?? 0) || save.bank < BOAT_PAINT_PRICE) return null;
  save.bank -= BOAT_PAINT_PRICE;
  save.gear.hullpaint = idx;
  return { name: paint.name, price: BOAT_PAINT_PRICE };
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
    jetpack: lvl('jetpack') > 0,
    jetThrust: JET_THRUST[lvl('jetpack')],
    jetAlt: JET_ALT[lvl('jetpack')],
    jetSpeed: JET_SPEED[lvl('jetpack')],
    radio: lvl('radio') > 0,
    avionics: lvl('avionics') > 0,
    boatCap: OUTBOARD_CAP[lvl('outboard')],
    boatAccel: OUTBOARD_ACCEL[lvl('outboard')],
    vhf: lvl('vhf') > 0,
    boatlights: lvl('boatlights') > 0,
    shrimprig: lvl('shrimprig') > 0,
    fishfinder: lvl('fishfinder') > 0,
  };
  player.truck.userData.bodyMat.color.setHex(PAINTS[save.gear?.paint ?? 0].hex);
  player.skiff.userData.hullMat.color.setHex(BOAT_PAINTS[save.gear?.hullpaint ?? 0].hex);
  dog?.setOwned(lvl('dog') > 0);
}
