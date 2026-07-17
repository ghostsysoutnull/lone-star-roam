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
    track: 'New Player (2026-07)',
    waves: [
      { wave: 'W2 — first-run experience', spots: [
        S('🌆 New-game start — San Antonio approach', [985, 1737], { mode: 'DRIVE', heading: 1.582, note: 'the curated first view: I-35 southwest into the skyline, the Alamo minutes ahead' }),
        S('🎬 Title + intro card, first run staged', [985, 1737], { mode: 'DRIVE', act: 'firstRun', note: 'title over the live attract drift; New game → concept card (Start / Skip intro & tips), then the staged tips' }),
      ] },
    ],
  },
  {
    track: 'Band Parity (2026-07)',
    waves: [
      { wave: 'W1 — the network', spots: [
        S('🛣️ Texarkana I-30/I-49 interchange', [5206.6, -2750], { mode: 'DRIVE', note: 'two interstates cross the line within a mile of each other — each gets its own monument now, not a merged one' }),
        S('🏙️ Hobbs, NM via NM 18', [-3486, -1923.7], { mode: 'DRIVE', note: 'pop. 39,648 — the old ref-only bake never reached it; the tier fetch does' }),
        S('🏘️ Idabel, OK', [4459.1, -3230.3], { mode: 'DRIVE', note: 'McCurtain County seat, connected via a state route the ref allowlist used to skip' }),
      ] },
      { wave: 'W1 top-up — OK secondary tier', spots: [
        S('👻 Chattanooga, OK', [804.9, -3809.5], { mode: 'DRIVE', note: 'pop. 0 on the census, 213u from the nearest primary road — a secondary-tier county road reaches it now' }),
      ] },
      { wave: 'W1 top-up — LA + NM secondary tier', spots: [
        S('🌲 Pleasant Hill, LA', [5707.2, -905], { mode: 'DRIVE', note: 'pop. 611, 157u from the nearest primary road — closed by the same top-up' }),
      ] },
      { wave: 'W2 — life on the roads', spots: [
        S('🪧 I-30 control sign, Texarkana AR', [5232.8, -2652.2], { mode: 'DRIVE', note: 'Hope 32 / Magnolia 47 — the generic pass, not one of the 4 hand-authored signs' }),
        S('🚚 US 64 band traffic, OK panhandle', [-523.8, -6515.9], { mode: 'DRIVE', note: '800+u from the nearest Texas highway — every car here rides GEO.bandHighways' }),
      ] },
      { wave: 'W3 — the ground', spots: [
        S('🏜️ NM desert band over Hobbs', [-3486, -1923.7], { mode: 'FLY', time: 0.35, heading: Math.PI / 2, note: 'facing west — desert tan, but hills and the height ramp read now' }),
        S('🟥 OK red-dirt plains over Ardmore', [2281.3, -3591.2], { mode: 'FLY', time: 0.35, heading: 0, note: 'facing north — red-brown plains, distinct from the old uniform tan' }),
        S('🌲 AR pine over Texarkana', [5262.8, -2719.2], { mode: 'FLY', time: 0.35, heading: -Math.PI / 4, note: 'facing northeast — pine green continues the East Texas read across the line' }),
        S('🐊 LA swamp over Many', [5747.5, -629.7], { mode: 'FLY', time: 0.35, heading: -Math.PI / 2, note: 'facing east — dark swamp green, the wettest read of the four' }),
      ] },
      { wave: 'W4 — crops and ranches', spots: [
        S('🌾 Tillman County farmstead, OK', [780.7, -3724.7], { mode: 'DRIVE', heading: Math.PI, note: 'across the Red River from Wichita Falls — house, barn, windmill, silo, pecking chickens, drawn from real USDA census truth' }),
        S('🌱 Cotton County field, OK', [520, -3850], { mode: 'DRIVE', heading: 0, note: 'real dominant crop is cotton — the county is literally named for it' }),
        S('⛪ Cotton County chapel + cemetery, OK', [1071.7, -3801.1], { mode: 'DRIVE', heading: -Math.PI / 2, note: 'first band chapel — same site haunts.js can wisp at night' }),
      ] },
      { wave: 'W5 — wildlife', spots: [
        S('🐄 Tillman County herd, OK', [772.7, -3732.7], { mode: 'DRIVE', heading: Math.PI, note: 'census-driven cattle/horse/goat/sheep mix, same farmstead as W4 — deterministic, no forcing needed' }),
        S('🐊 LA swamp wildlife over Many', [5747.5, -629.7], { mode: 'DRIVE', act: 'bandWild', note: 'forces a gator — natural swamp draws are odds-gated' }),
        S('🌲 AR pine wildlife over Texarkana', [5262.8, -2719.2], { mode: 'DRIVE', act: 'bandWild', note: 'forces a black bear — natural pine draws are odds-gated' }),
        S('🟥 OK plains wildlife over Ardmore', [2281.3, -3591.2], { mode: 'DRIVE', act: 'bandWild', note: 'forces a coyote — natural plains draws are odds-gated' }),
        S('🏜️ NM desert wildlife over Hobbs', [-3486, -1923.7], { mode: 'DRIVE', act: 'bandWild', note: 'forces a roadrunner — natural desert draws are odds-gated' }),
      ] },
    ],
  },
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
