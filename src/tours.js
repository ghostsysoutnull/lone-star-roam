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
    track: 'Water Vehicles (2026-07)',
    waves: [
      { wave: 'W1 — BOAT mode', spots: [
        S('🚤 Gulf skiff — off Galveston', [4700, 2150], { heading: Math.PI, mode: 'BOAT', time: 0.35, note: 'the fourth mode — open Gulf southeast of Galveston; W to throttle, boats coast long and only steer with way on' }),
        S('🚤 Falcon Lake', [224, 4649], { mode: 'BOAT', time: 0.35, note: 'lake boating — the border reservoir; the boat rides the baked lake level, and beaches at the banks' }),
        S('🚤 Laguna Madre', [2100, 4500], { mode: 'BOAT', time: 0.35, note: 'the lagoon behind Padre — navigable water between the mainland and the island' }),
        S('🛻 waterline stop — Galveston shore', [4470, 1891], { heading: -Math.PI / 2, mode: 'DRIVE', time: 0.35, note: 'drive east toward the Gulf: the truck soft-stops at the waterline and hints the boat (V)' }),
      ] },
    ],
  },
  {
    track: 'Railroads (2026-07)',
    waves: [
      { wave: 'W3 — band railroads', spots: [
        S('🚂 UP armour yellow — Lordsburg Sub, New Mexico', [-6811, -916], { mode: 'DRIVE', time: 0.35, act: 'trainHere', note: 'the shoulder runs real track too — a Union Pacific freight forced onto the Lordsburg Sub west of El Paso, same armour yellow as the Brownsville Sub back in Texas' }),
        S('🚂 CPKC red — Shreveport Sub, Arkansas', [4883, -3195], { mode: 'DRIVE', time: 0.35, act: 'trainHere', note: 'the Louisiana/Arkansas corner — CPKC red, the livery comes straight off the real OSM operator tag, same as in Texas' }),
        S('🚂 UP armour yellow — Shreveport Sub, Louisiana', [5533, -1997], { mode: 'DRIVE', time: 0.35, act: 'trainHere', note: 'east Texas\'s neighbor strip — the placard reads across the line too, no gap at the border' }),
        S('🚂 BNSF orange — Red Rock Sub, Oklahoma', [2262, -3382], { mode: 'DRIVE', time: 0.35, act: 'trainHere', note: 'Panhandle BNSF country keeps going north of the line — same orange' }),
      ] },
      { wave: 'W2 — the border show', spots: [
        S('🌉 Laredo gateway — Tex-Mex Interchange', [-5.5, 3897], { heading: Math.PI / 2, mode: 'DRIVE', time: 0.35, act: 'railCrossing:laredo', note: 'the international rail bridge over the Rio Grande — the Tex-Mex Interchange (CPKC, 2 locos) is forced onto the approach and crosses into Texas in a few seconds; it also runs on its own seeded schedule, 3 crossings a game day' }),
        S('🌉 Eagle Pass gateway — the Manifest', [-962, 2554], { heading: Math.PI, mode: 'DRIVE', time: 0.35, act: 'railCrossing:eaglepass', note: 'the UP bridge from Piedras Negras — the Eagle Pass Manifest forced onto the approach, crossing north; same seeded 3-a-day schedule as Laredo' }),
        S('📦 the Z — Red River Valley Sub', [-892, -3981], { mode: 'DRIVE', time: 0.35, act: 'ztrain', note: 'the BNSF hotshot intermodal forced in next to you — double-stack well cars, a silhouette no other train has; watch the two-tone container stacks' }),
      ] },
      { wave: 'W1 — liveries + commuter sets', spots: [
        S('🚂 UP armour yellow — Brownsville Sub', [1797.6, 3498.7], { mode: 'DRIVE', time: 0.35, act: 'trainHere', note: 'a Union Pacific freight forced onto the sub next to you — the loco wears armour yellow; the mixed car colors are real interchange practice' }),
        S('🚂 BNSF orange — Dalhart Sub', [-2465.3, -4942.9], { mode: 'DRIVE', time: 0.35, act: 'trainHere', note: 'BNSF Panhandle country — the loco comes up in BNSF orange' }),
        S('🚂 CPKC red — Laredo Sub', [843.2, 4097.7], { mode: 'DRIVE', time: 0.35, act: 'trainHere', note: 'the #1 US–Mexico rail gateway line, CPKC red — W2 stages the actual river crossing at Laredo' }),
        S('🚆 TRE commuter — DFW Subdivision', [2413.1, -2020.9], { mode: 'DRIVE', time: 0.35, act: 'trainHere', note: 'a short Trinity Railway Express passenger set (loco + coaches) instead of freight — commuter lines run commuter trains now' }),
      ] },
    ],
  },
  {
    track: 'Performance (2026-07)',
    waves: [
      { wave: 'W1 — instrumentation + baseline', spots: [
        S('📈 Worst case — downtown Houston, night storm', LL(29.7604, -95.3698), { mode: 'DRIVE', time: 0.98, weather: 'storm', note: 'the heaviest honest frame: downtown instancing + rain + lightning + headlights + night traffic — open the Perf tab (backquote) and read frame avg/max and the top systems' }),
        S('📈 Floor — empty I-10 west, clear day', [-2767, 334], { heading: Math.PI / 2, mode: 'DRIVE', time: 0.35, weather: 'clear', note: 'the cheapest honest frame: open desert, no city, no weather — the baseline floor for the spec table' }),
        S('📈 Dense ambient — Sweetwater wind corridor, dusk', [-650, -1430], { mode: 'FLY', time: 0.79, note: 'the instancing-heavy middle case: the densest turbine cluster spinning — compare draws/tris against the floor spot' }),
      ] },
      { wave: 'W3 — draw audit + fog-wall gate', spots: [
        S('🔎 Draw audit — the desert floor, dissected', [-2767, 334], { mode: 'DRIVE', time: 0.35, weather: 'clear', note: 'Perf tab → 🔎 Audit: per-source draw-call breakdown. With the fog-wall gate, far border vignettes / landmarks / city stars submit ~0 calls here — shoulder was 566 before' }),
        S('🔎 Gate boundary — Texarkana State Line', LL(33.425, -94.043), { mode: 'DRIVE', time: 0.35, weather: 'clear', note: 'a border vignette inside the fog wall: fully visible up close (audit shows shoulder > 0 here) — drive 15+ units west and the far vignettes behind you stop drawing' }),
      ] },
    ],
  },
  {
    track: 'West Texas massifs (2026-07)',
    waves: [
      { wave: 'W1 — the Guadalupe wall', spots: [
        S('🏔 El Capitan wall — US 62/180 approach', LL(31.860, -104.808), { heading: 1.2, mode: 'DRIVE', time: 0.35, note: 'the sheer prow rising over the salt flat — the missing far-west skyline, now a wall on the horizon all the way from the basin floor' }),
        S('🏔 Guadalupe Peak — top of Texas', LL(31.8914, -104.8607), { mode: 'WALK', time: 0.35, note: 'the summit saddle: cairn, stainless pyramid, historical marker — collect the landmark on foot at 8,751 ft' }),
        S('🏔 Brokeoff ridge — the range crosses into NM', LL(32.050, -105.020), { heading: -1.2, mode: 'FLY', time: 0.35, note: 'the escarpment does not stop at the state line: Brokeoff tents taper north while the reef arm runs toward Carlsbad' }),
      ] },
    ],
  },
  {
    track: 'Energy (2026-07)',
    waves: [
      { wave: 'W6 — energy jobs: crude, fuel, oversize blades', spots: [
        S('🛢 Crude haul — Midland tanks to Baytown', LL(31.943, -102.03), { mode: 'DRIVE', act: 'crudeJob', note: 'a crude run injected and auto-loaded at the tank farm; the arrow points at the Baytown refinery gate — an ordinary clock, ×1.5 for staying grounded' }),
        S('⛽ Fuel run — Motiva gate to Austin', [5289.6, 1240.8], { mode: 'DRIVE', act: 'fuelJob', note: 'loads at the Motiva gate, delivers downtown Austin — refinery-to-city with the usual city-arrival radius' }),
        S('🌀 Oversize blade — Corpus docks to Roscoe', LL(27.8006, -97.3964), { mode: 'DRIVE', act: 'bladeJob', note: 'the slow haul: loads in Corpus, pays ×1.5 only if the whole run stays under 72 mph — one burst over (or going airborne) and the HUD flips to 🐢 bonus lost' }),
      ] },
      { wave: 'W5 — 345 kV tower corridors, substations, hero plants, ERCOT radio', spots: [
        S('⚡ ERCOT tower corridor — Hill Country spine', [-128.4, 179.5], { mode: 'DRIVE', time: 0.35, note: 'a real 345 kV corridor, box-built H-frame poles instanced along its arc length every ~40u, conductor ribbon strung between them' }),
        S('⚡ South Texas Project — Energy log hero', [3298.2, 2451.7], { mode: 'DRIVE', time: 0.35, note: 'twin reactors, waisted cooling-tower silhouette + reactor dome; drive in and the log stamps' }),
        S('⚡ Comanche Peak Nuclear Power Plant — Energy log hero', [1637.3, -1443.7], { mode: 'DRIVE', time: 0.35, note: 'the second nuclear hero, Comanche Creek Reservoir near Glen Rose' }),
        S('⚡ W. A. Parish Electric Generating Station — Energy log hero', [3687.7, 1693.6], { mode: 'DRIVE', time: 0.35, note: 'coal/gas boiler-and-stack hero; a real 345 kV corridor passes within 2u of the plant — its own substation sits 11u away (hero-excluded from the announcer, no double toast)' }),
        S('⚡ Martin Lake Power Plant — Energy log hero', [4694.6, -1401.8], { mode: 'DRIVE', time: 0.35, note: "Texas's biggest coal plant, East Texas lignite country" }),
        S('⚡ Substation kit — a thinned, named 345 kV major', [1479.2, 1366.3], { mode: 'DRIVE', note: 'Zorn Substation: gravel pad, transformer boxes, gantry — one of ~600 kept after the runtime thin (735 baked majors); named and far from any hero, so it joins the announcer' }),
        S('📻 ERCOT grid wink — DFW scanner', [2393.1, -2123.9], { mode: 'FLY', note: "watch: tune the scanner near DFW traffic — an enroute GA or jet source passing within 35u of the substation below may roll the ERCOT-island line (position/odds vary with boot time)" }),
      ] },
      { wave: 'W4 — refineries, hero skylines, light pool, spill decals', spots: [
        S('🏭 Ship Channel at night — Deer Park hero', [4174.9, 1421.1], { mode: 'DRIVE', time: 0.98, note: 'the hero skyline glowing: cracker towers, tank farm, twin flares; park under a flare and the truck catches real orange light (the W4 pool)' }),
        S('🏭 Baytown Refinery — hero + log', [4285.7, 1390.3], { mode: 'DRIVE', time: 0.98, note: 'hand-placed at the real ExxonMobil complex (OSM has no polygon — scarcity exception); the log stamps, brass at the marker' }),
        S('🏭 Motiva Port Arthur — largest in North America', [5289.6, 1240.8], { mode: 'DRIVE', time: 0.98, note: 'hero skyline beside Valero + Total — the Port Arthur refinery row lights the whole horizon after dark' }),
        S('🏭 Corpus Christi Refinery Row — hero + plaque', [1956.1, 3546.7], { mode: 'DRIVE', time: 0.98, note: 'refinery row on the Corpus ship channel; sodium-orange spill decals under the lit clusters' }),
        S('🛢️ Rig water glow — offshore at night', [4542, 3160.6], { mode: 'FLY', time: 0.98, note: 'the Far Rig: flare-lit deck, warm spill on the water under the fleet (majors get real deck light from the pool)' }),
        S('🏭 A working refinery by day — Big Spring', [-1828.2, -1415.4], { mode: 'DRIVE', time: 0.35, note: 'the generic kit at a W4-recovered site (the old bake missed it): columns, tanks, pipe rack — and the flare burning faint even in daylight (flares run 24/7)' }),
      ] },
      { wave: 'W3 — wind farms, solar fields, log', spots: [
        S('💨 Wind farm — Sweetwater/Nolan corridor', [-650, -1430], { mode: 'FLY', time: 0.79, note: 'the densest baked cluster (1336 real turbines): instanced towers, blades spinning live with ATMOS.wind' }),
        S('💨 Roscoe Wind Farm — Energy log hero', [-998.5, -1792.7], { mode: 'DRIVE', note: "once the world's largest wind farm at completion (2009); drive in and the log stamps" }),
        S('💨 Horse Hollow Wind Energy Center — Energy log hero', [-524.8, -1324.7], { mode: 'DRIVE', note: '421 turbines, one of the largest wind farms on Earth at its 2006 completion' }),
        S('💨 Papalote Creek Wind Farm — Energy log hero', [1664.7, 3380.0], { mode: 'DRIVE', note: 'the coastal wind farm — steady Gulf breeze, San Patricio County' }),
        S('☀️ Blue Wing Solar Farm — panel field', [1047.4, 1886.4], { mode: 'FLY', note: 'W4.5 rework: rectangular blocks of tilted south-facing panels on legs over dirt pads (crop circles retired); road-side blocks drop per-block, the rest stay; the announcer fires its real name' }),
      ] },
      { wave: 'W2 — wells, offshore rebase, log, announcer', spots: [
        S('🔥 Permian night flares — Loving county pad', [-4042.1, -355.1], { mode: 'DRIVE', time: 0.98, note: 'a real-density well site: pumpjack, 4-tank battery, workover derrick, gas flare flickering after dark' }),
        S('🛢️ Spindletop — Energy log hero', [5191.6, 1096.9], { mode: 'DRIVE', note: 'the 1901 gusher: granite obelisk + timber derrick; drive in and the log stamps (11th collectible)' }),
        S('🛢️ Midland Tank Farm — Energy log hero', LL(31.943, -102.03), { mode: 'DRIVE', note: 'Permian crude staging — nine bermed tanks; the log stamps on arrival' }),
        S('📣 Approach announcer — NANSEN platform', [4801.7, 4043.8], { mode: 'FLY', note: 'fly the offshore row: every named/operated platform announces itself on approach, every visit; unnamed sites stay silent' }),
        S('⚓ Corpus fairway leg — approach tanker', [2057.9, 3551.4], { mode: 'FLY', note: 'watch: a tanker works the real Aransas Pass fairway points in and out (position varies with boot time)' }),
      ] },
    ],
  },
  {
    track: 'New Player (2026-07)',
    waves: [
      { wave: 'W4 — named save slots', spots: [
        S('💾 Save slots — title screen', [985, 1737], { mode: 'DRIVE', act: 'slotsPreview', note: 'slot 1 active, slot 2 seeded occupied, slot 3 empty — rename/delete/new game all live on the rows' }),
      ] },
      { wave: 'W3 — hints, Guide, Settings', spots: [
        S('💬 First-NPC hint — Greta near Kerrville', [242, 1046.4], { mode: 'WALK', heading: Math.PI / 2, act: 'hintsReset', note: 'hints re-armed — the E-to-talk hint fires as she comes in range' }),
        S('🌆 First-city hint — Austin edge', LL(30.2672, -97.7431), { mode: 'DRIVE', act: 'hintsReset', note: 'inside the city radius — the map hint fires (and absorbs the W2 map tip)' }),
        S('🌇 First-dusk hint — legends warning', [985, 1737], { mode: 'DRIVE', time: 0.79, act: 'hintsReset', note: 'dusk staged — the after-dark legends hint fires as night settles' }),
        S('🛫 First-apron hint — Dallas Love Field', LL(32.8498, -96.8549), { mode: 'DRIVE', act: 'hintsReset', note: 'on the field footprint — the press-V-to-fly hint fires' }),
        S('🛂 First-crossing hint — Hobbs, NM', [-3486, -1923.7], { mode: 'DRIVE', act: 'hintsReset', note: 'across the state line — the Passport hint fires' }),
        S('⚙️ Settings & Guide', [985, 1737], { mode: 'DRIVE', note: 'press Esc for the Settings panel (also on the title screen); press H, then the Guide button, to re-read the intro and every tip' }),
      ] },
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
        S('🛢️ The Far Rig plaque', [4542, 3160.6], { mode: 'FLY', note: 're-anchored (Energy W2) to the farthest reachable real major (Peregrine Oil & Gas) — 61.9 miles out, brass on the platform' }),
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
