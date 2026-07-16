// Playtest tours — pure data for the debug menu's Tours tab. debug.js renders
// it and owns visit(); the verify debug suite validates every spot. One entry
// per track (newest first), one group per wave; each wave end appends its
// spots here (CLAUDE.md protocol step 4). Spot fields: label, x, z, then
// optional heading (radians, 0 = north, -PI/2 = east, PI/2 = west), mode
// ('DRIVE'|'FLY'|'WALK'), time (sky.t: 0.25 dawn, 0.35 day, 0.79 dusk,
// 0.98 night), weather, act (chains a debug action after the teleport),
// note (appended to the arrival toast and shown as the button tooltip).
const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];
const S = (label, [x, z], extra = {}) => ({ label, x, z, ...extra });

const TXK = LL(33.4183, -94.0429); // Texarkana federal building — straddle is 7 units up the avenue

export const TOURS = [
  {
    track: 'Placement legality (2026-07)',
    waves: [
      { wave: 'Brands & landmarks off the ribbons', spots: [
        S('🏪 Ennis Bucky’s off the ribbon', [2774.3, -1481.6], { mode: 'DRIVE', note: 'was straddling the I-45 centerline — now fronts it from a legal lot' }),
        S('🪧 Luling billboards on the bend', [1826.9, 1545.4], { mode: 'DRIVE', note: 'boards re-snap to the curved I-10 shoulder — none on the pavement' }),
        S('🛒 Corpus H-E-Buddy on dry land', [1946.8, 3643.9], { mode: 'DRIVE', note: 'the old placement search dropped this store in the bay' }),
        S('🛒 Waco H-E-Buddy off the Brazos', [2302.3, -548.2], { mode: 'DRIVE', note: 'was standing in the river' }),
        S('🚗 Cadillac Ranch clear of I-40', LL(35.1836, -101.9871), { mode: 'DRIVE', note: 'held 4 units south of the ribbon — still against the freeway' }),
      ] },
    ],
  },
  {
    track: 'The Shoulder & the Shelf (2026-07)',
    waves: [
      { wave: 'W3 — Padre', spots: [
        S('🌉 Causeway arrival', [2180, 5481], { mode: 'DRIVE', heading: -1.31, note: 'a deck, not a road — ride it onto the island' }),
        S('🏖️ Beach drive', LL(27.5, -97.29), { mode: 'DRIVE', note: 'wet sand caps the speed — follow the surf line' }),
        S('🐢 Malaquite turtle release', LL(27.4326, -97.2968), { mode: 'WALK', heading: -Math.PI / 2, act: 'turtleMorning', note: 'the clock jumps to the next release morning' }),
      ] },
      { wave: 'W5 — the Shelf', spots: [
        S('🌃 Rig skyline from Malaquite', LL(27.4326, -97.2968), { mode: 'WALK', time: 0.98, heading: -Math.PI / 2, note: 'look east over the water' }),
        S('🛟 Tidelands Buoy plaque', [4762.2, 1851.5], { mode: 'FLY', note: 'settle by the red nun — the plaque reads afloat' }),
        S('🛢️ The Far Rig plaque', LL(28.0, -95.0), { mode: 'FLY', note: '64.1 miles out — brass on the platform' }),
        S('✨ 1554 treasure light', [2130, 4942.6], { mode: 'WALK', heading: -Math.PI / 2, act: 'treasureNight', note: 'forced for tonight — naturally a new-moon event, off the Mansfield Cut' }),
        S('🐦 Aransas whooping cranes', LL(28.26, -96.83), { mode: 'DRIVE', time: 0.35, note: 'the wintering flock on Blackjack Peninsula' }),
      ] },
      { wave: 'W5/5b — the eight ranches', spots: [
        S('🐂 King Ranch', [1558, 3870.1], { mode: 'DRIVE', heading: Math.PI / 2 }),
        S('🐎 Four Sixes', [-761, -2917.3], { mode: 'DRIVE', heading: Math.PI / 2 }),
        S('🐄 Waggoner', [230, -3261.7], { mode: 'DRIVE', heading: Math.PI / 2 }),
        S('🐐 Y.O. Ranch', [-99, 1025.3], { mode: 'DRIVE', heading: Math.PI / 2 }),
        S('🤠 JA Ranch', [-1697, -4252.4], { mode: 'DRIVE', heading: Math.PI / 2 }),
        S('🧱 XIT Ranch', [-2695, -5214.2], { mode: 'DRIVE', heading: Math.PI / 2 }),
        S('🏴 Matador Ranch', [-1258, -3328.5], { mode: 'DRIVE', heading: Math.PI / 2 }),
        S('🇺🇸 LBJ Ranch', [850, 847.1], { mode: 'DRIVE', heading: Math.PI / 2 }),
        S('🛬 LBJ strip landing', LL(30.30, -98.6226), { mode: 'FLY', heading: Math.PI, note: 'land the ranch strip' }),
      ] },
      { wave: 'W6a — the Shoulder east', spots: [
        S('🪧 I-10 crossing east', LL(30.08, -93.79), { mode: 'DRIVE', heading: -Math.PI / 2, note: 'cross into Louisiana, then come home for the chime' }),
        S('🐸 Vinton at dusk', LL(30.19, -93.581), { mode: 'DRIVE', time: 0.79, note: 'frogs, fireworks barns, the Neutral Ground marker' }),
        S('📸 Texarkana straddle', [TXK[0], TXK[1] + 7], { mode: 'WALK', note: 'stand the brass line at the federal building' }),
        S('🎰 WinBig from I-35', LL(33.71, -97.13), { mode: 'DRIVE', heading: 0, note: 'read the marquee doing seventy north' }),
        S('🪨 Corner Stone — the tripoint', LL(36.5, -103.042), { mode: 'WALK', note: 'one of seven survey caps; the rest are a hunt' }),
        S('🐻 Sabine pines bear', LL(31.3, -93.9), { mode: 'DRIVE', act: 'bear', note: 'a debug bear ambles ahead — wild ones stay rare' }),
      ] },
      { wave: 'W6b — the Shoulder west', spots: [
        S('🪦 Texola wall', LL(35.2211, -99.9925), { mode: 'WALK', note: 'no other place like this place anywhere near this place' }),
        S('🛏️ Glenrio sign', LL(35.1786, -103.0345), { mode: 'DRIVE', note: 'read it from both directions of I-40' }),
        S('🌾 Texhoma painted line', LL(36.5, -101.7855), { mode: 'WALK', note: 'one town, two states' }),
        S('🎉 Anthony banner', LL(32.0, -106.6014), { mode: 'WALK', note: 'Main St crosses 32°N under the leap-year banner' }),
        S('🚪 Carlsbad doorstep', LL(32.1751, -104.3794), { mode: 'DRIVE', note: 'climb the park road to the turnaround — a deck, not a road' }),
      ] },
      { wave: 'W7 — people & board', spots: [
        S('🐢 The Turtle Lady', [2224, 5418], { mode: 'WALK', note: 'SPI, north of the condo strip' }),
        S('📻 Roswell wink watch', LL(31.9, -106.2), { mode: 'FLY', time: 0.35, note: 'unproven line — listen for GA traffic near the New Mexico ring' }),
      ] },
    ],
  },
  {
    track: 'Pre-aviation playtests',
    waves: [
      { wave: 'Encounters', spots: [
        S('🛸 Saucer shadow', [100, 550], { act: 'saucer', note: 'judge the standoff in all three modes — it stays 120–210 s' }),
        S('👻 Haunted cemetery', [100, 550], { act: 'hauntCemetery', note: 'judge wisp size, approach fade, midnight bell' }),
        S('🔥 Enchanted Rock fires', [100, 550], { act: 'ghostFires' }),
        S('⛪ Terlingua Ghost Town', LL(29.3211, -103.6158), { mode: 'DRIVE' }),
        S('🏰 Presidio La Bahía', LL(28.6470, -97.3844), { mode: 'DRIVE' }),
      ] },
      { wave: 'Sound & light', spots: [
        S('📯 Honk chorus on I-35', LL(30.30, -97.72), { mode: 'DRIVE', time: 0.35, note: 'park across a lane and wait for the pile-up' }),
        S('🎇 Flares at night', [100, 550], { mode: 'FLY', time: 0.98, note: 'press F — a rack of three, they own the night' }),
        S('💡 Headlight throw', [-2767, 334], { mode: 'DRIVE', time: 0.98, heading: Math.PI / 2, note: 'empty I-10 west — judge the beam' }),
        S('🦉 Wildlife voices', [100, 550], { mode: 'WALK', time: 0.98, note: 'stand still and listen — coyotes, owls, the mix' }),
      ] },
    ],
  },
];
