// NPCs: 12 bespoke named characters in the major cities + procedural townsfolk
// wandering every downtown. They face you, wave hello, gesture while talking,
// and their dialog reacts to weather, the hour, and your progress.
import * as THREE from 'three';
import { GEO, seededRand, nearestRoad, hAt } from './geo.js';
import { cityRadius } from './cities.js';
import { ATMOS } from './sky.js';
import { AIRPORTS, runwayInUse, rwyLabel, windFrom, groundYAt } from './airports.js';
import { groundYAt as brandGroundYAt } from './brands.js';

// ground height for NPC placement: airport pad plateau when inside a
// footprint (bystanders spawn at the terminal gate), else a brand site's
// foundation slab (roadShoulder can park a named character right at a
// Bucky's/H-E-Buddy lot edge), else raw terrain — without the brand fallback
// an NPC standing at a lot edge would sink to the terrain under the slab.
// Exported (unused internally as an import) so tests can call it directly,
// same dynamic-import pattern already used for POOLS.
export const gY = (x, z) => groundYAt(x, z) ?? brandGroundYAt(x, z) ?? hAt(x, z);

const TALK_R = 6, FACE_R = 10;

// dialog subtitle for NPCs carrying age/profession (bystanders, townsfolk, named)
const npcSub = (n) => (n.age && n.profession ? `Age ${n.age} · ${n.profession}` : null);

// name, city, look config, main lines (rotate per visit), fact, age, profession
const NAMED = [
  ['Willie', 'Austin', { hat: 'stetson', hatC: 0x22201c, braids: true, shirt: 0x2a2a2a, prop: 'guitar' },
    ['Welcome to Austin! Keep it weird, partner.', 'Wrote a song about that highway you came in on.', 'Best breakfast tacos are wherever you are at sunrise.', 'Stick around till sundown — the bridge breathes bats.',
      'Sixth Street’s loud, Barton Springs is cold, and both are exactly right.', 'This guitar’s older than half the town. Sounds better than all of it.', 'They paved paradise and put up a food truck. Honestly? Pretty good tacos.', 'Everything’s a song if you hum it right, friend.'],
    'Austin is the live music capital of the world — 250+ venues.', 58, 'musician'],
  ['Rosa', 'Houston', { dress: 0x1f7a72, hair: 0x2a2018, bun: true },
    ['Biggest city in Texas, and we still say howdy.', 'NASA’s just down the road — you can’t miss the rocket.', 'Try the kolaches. Trust me.',
      'Twelve-hour shift and I still love this town. That’s Houston.', 'The bayou’s slow and the traffic’s slower. Plan accordingly, mijo.', 'Half the world lives here, and you can eat all of it on one street.', 'Hurricane season we board up, then we throw a block party. Both matter.', 'You want culture? We got a rodeo AND an opera. Same weekend, sometimes.'],
    'Houston is home to the largest medical center on Earth.', 37, 'nurse'],
  ['Big Tex', 'Dallas', { scale: 2.6, hat: 'stetson', hatC: 0xe8e0d0, shirt: 0xaa2222, wave: true },
    ['HOWDY, FOLKS! Welcome to Big D!', 'You look like you could use some state fair corny dogs.', 'Everything’s bigger here. Case in point.',
      'FOLKS, the fair runs twenty-four days and I stand for EVERY one of ’em.', 'I’ve said a million howdys and I meant every single one.', 'My boots are size seventy. STILL hand-tooled.', 'A corny dog and a cold lemonade — now THAT’S livin’, friend.'],
    'The frozen margarita machine was invented in Dallas in 1971.', 74, 'State Fair icon'],
  ['Elena', 'San Antonio', { dress: 0x6a3f8a, hair: 0x1a1410, flower: 0xe86a9a },
    ['Remember the Alamo? It’s right downtown.', 'The river walk is prettier than any highway.', 'Mi casa es su casa, traveler.',
      'Get a raspa by the river and watch the barges go by. That’s a whole afternoon.', 'Fiesta lasts ten days. The confetti in my hair lasts all year.', 'The missions are older than the country, y aquí siguen.', 'Everyone falls in the river once. Locals just don’t tell.'],
    'San Antonio’s missions are a UNESCO World Heritage site.', 29, 'river walk guide'],
  ['Hank', 'Fort Worth', { hat: 'stetson', hatC: 0x7a5c38, vest: 0x5a4028, prop: 'lasso' },
    ['Cowtown, they call it. Real cowboys drive cattle here twice a day.', 'That lasso ain’t for show. Well, mostly.', 'Fort Worth is where the West begins.',
      'Billy Bob’s has indoor bull riding. Indoor. Bull riding.', 'Dallas wears the suit. We wear the boots that paid for it.', 'Longhorns have the right of way here, and don’t you forget it.', 'A good rope, a good horse, and a bad idea — that’s how rodeo got invented.'],
    'The Stockyards run a longhorn cattle drive every single day.', 45, 'cattle drover'],
  ['Marisol', 'El Paso', { dress: 0xd8a832, hair: 0x201810 },
    ['You made it all the way out west!', 'We’re closer to Los Angeles than to Houston out here.', 'Watch the star on the mountain light up tonight.',
      'Two countries, three states, one sunset. Best corner of the map.', 'The Franklin Mountains keep this town in line. Somebody has to.', 'We make the best chile relleno in Texas. Fight me, Houston.', 'It’s a desert, sí, but it blooms if you know where to look.'],
    'El Paso sits in Mountain Time — the rest of Texas is Central.', 33, 'shop owner'],
  ['Dusty', 'Amarillo', { hat: 'stetson', hatC: 0x8a7050, shirt: 0xb09a70, kerchief: 0xaa4a2a },
    ['Panhandle wind’ll knock your hat off.', 'Spray-paint a Cadillac while you’re here — everyone does.', 'Flat? Sure. But you can see tomorrow from here.',
      'The 72-ounce steak is free if you finish it. Nobody talks about the after.', 'Route 66 came through here when it meant something. Still does, to me.', 'More cattle than people out here, and the cattle gossip less.', 'A storm rolls in, you can watch it coming for two whole days.'],
    'Amarillo means "yellow" in Spanish, for the local soil.', 50, 'ranch hand'],
  ['Gully', 'Corpus Christi', { hat: 'bucket', hatC: 0x4a6a4a, shirt: 0x3a6a8a, prop: 'rod' },
    ['Sparkling city by the sea!', 'Redfish are running today, I can feel it.', 'Watch for shrimp boats off Padre Island.',
      'The Lexington’s parked in the bay — a whole aircraft carrier, just sittin’ there.', 'Wind never quits here. Kitesurfers love it. My hat don’t.', 'Cast off the jetty at dawn and you’ll believe in something.', 'Salt air fixes most things. The rest, tacos.'],
    'Selena, the Queen of Tejano, called Corpus home.', 47, 'fishing guide'],
  ['Peggy Sue', 'Lubbock', { dress: 0x3a9a9a, hair: 0xd8b860, glasses: true },
    ['Buddy Holly grew up right here.', 'That’ll be the day, sugar!', 'Stick around for the world’s flattest sunset.',
      'The wind farm past the loop looks like the horizon doing a slow wave.', 'Prairie dog town has more drama than my whole radio show.', 'We invented the crop circle out here. It’s called a center pivot, sugar.', 'Every star you can name, you can see from my porch.'],
    'Lubbock is the world’s largest cottonseed processing region.', 26, 'radio DJ'],
  ['Chuy', 'Laredo', { hat: 'wide', hatC: 0xd8c8a0, shirt: 0xf0ead8 },
    ['Bienvenido to the border!', 'I-35 starts right here and runs clear to Minnesota.', 'Two countries, one street. That’s Laredo.',
      'Trucks line up for miles at the bridge. Half of what America buys rolls past my window.', 'A hundred and five in the shade, and we call it a dry heat like that helps.', 'George Washington’s birthday? Biggest party of the year here. Since 1898.', 'On this street you’ll hear four languages before lunch.'],
    'Laredo has flown seven flags — one more than the rest of Texas.', 52, 'customs broker'],
  ['Quill', 'Marfa', { hat: 'beret', hatC: 0x1a1a1a, shirt: 0x1a1a1a, prop: 'brush' },
    ['Artists, antelope, and lights nobody can explain.', 'The desert is the canvas. I just sign it.', 'Stick around till dark. You’ll see.',
      'There’s a Prada store in the desert an hour out. It’s art. Don’t ask.', 'Judd came for the light. The light stayed. So did we.', 'I paint the horizon every day. It never repeats itself.', 'The quiet out here is so loud it keeps some folks up at night.'],
    'Marfa’s mystery lights have been reported since 1883.', 39, 'painter'],
  ['Cap’n Sal', 'Galveston', { hat: 'captain', hatC: 0xf0f0f0, coat: 0x24365a, beard: 0xd8d8d8 },
    ['This island was the biggest city in Texas once, before the 1900 storm.', 'The Gulf gives and the Gulf takes, friend.', 'Steady as she goes, landlubber.',
      'The seawall’s ten miles long, and I’ve walked every foot of it cursing the wind.', 'Jean Lafitte buried treasure here, they say. Sixty years I’ve said keep digging.', 'The pier lights come on at dusk — prettiest thing this side of a green flash.', 'A ship in port is safe, but that ain’t what ships are for.'],
    'The 1900 Galveston hurricane is still the deadliest US natural disaster.', 63, 'charter boat captain'],
  // ag characters (AGRICULTURE_SPEC wave 4): placed at real rural spots, not
  // cities — the second field is baked game units (LL comments), and
  // `ag: true` in the look swaps their weather openers to the farm register.
  ['Boone', [-2764.4, -4247.3], { hat: 'stetson', hatC: 0x3a2e22, shirt: 0x7a4a2a, kerchief: 0x8a3a2a, ag: true }, // Hereford (34.8154 −102.3971), feedlot belt
    ['Forty thousand head out there, and every one of ’em’s got an opinion at feeding time.', 'Folks smell the yards and wrinkle up. I smell a paycheck.', 'Corn goes up a nickel, my whole year changes. I watch Chicago closer than church.', 'A wet spring pen is worse than any blizzard. Give me frozen ground over mud.',
      'We doctor cattle in weather that’d close a school.', 'Deaf Smith County feeds more people before breakfast than most states do all day.', 'You can hear the feed trucks from here at dawn. Prettiest sound there is, if you’re owed money.'],
    'The Panhandle feedlot belt finishes a huge share of America’s beef — Deaf Smith county alone runs hundreds of thousands of head.', 61, 'feedlot operator'],
  ['Thuy', [3241.7, 1879.5], { hat: 'wide', hatC: 0xd8c8a0, shirt: 0x4a7a5a, ag: true }, // Wharton (29.3116 −96.1027), rice prairie
    ['Rice wants its feet wet. Everything else on this prairie can complain.', 'We flood the fields on purpose. First-timers always ask if something broke.', 'Second cutting’s the gamble — the ratoon crop. Some years it pays for Christmas.', 'The egrets work my levees harder than I do.',
      'Papa grew rice on the Mekong. Same water, different birds.', 'Duck hunters lease the stubble come winter. The rice pays twice if you’re smart.', 'A dry June scares me more than any hurricane.'],
    'Texas coastal-prairie rice ships worldwide — and the flooded winter stubble doubles as habitat for millions of ducks and geese.', 44, 'rice farmer'],
  ['Greta', [238.6, 1046.4], { hat: 'bucket', hatC: 0x7a6a4a, shirt: 0x8a7a9a, glasses: true, ag: true }, // W of Kerrville (30.06 −99.25), Edwards Plateau
    ['Angoras. The goats with the good hair — mohair, hon, and don’t call it wool.', 'A goat looks at a fence like it’s a suggestion.', 'Shearing twice a year, and they act brand-new surprised every time.', 'Cedar takes the water, goats take the cedar. That’s the whole plateau economy.',
      'My rain gauge is the most-read publication in this county.', 'Kids in February, shorn in March — pray the northers are done by then.', 'A good livestock dog is worth three hired hands and half a husband.'],
    'The Edwards Plateau is America’s mohair capital — Texas once grew about 90% of the US clip.', 57, 'Angora goat rancher'],
  ['Cy', [1546, 3874], { hat: 'stetson', hatC: 0x6a2020, shirt: 0xd8d0c0, vest: 0x4a3a2a, ag: true }, // King Ranch gate (27.52 −97.89)
    ['This gate’s just the front porch. The ranch runs clean past the horizon — all four of ’em.', 'Santa Gertrudis — the deep red ones. First breed ever made in America, made right here.', 'The Running W is on everything here. Cattle, gates, my paycheck.', 'Takes the better part of a week to ride the whole spread. I’ve done it. Once.',
      'Wild turkeys under the mesquite, nilgai in the brush — half my job is just counting things.', 'Captain King bought this grass in 1853 with steamboat money. Smartest trade in Texas.', 'The Gulf breeze quits about ten a.m. After that it’s just you and the humidity.'],
    'King Ranch sprawls across 825,000 acres — its Running W brand has been registered since the 1860s.', 34, 'King Ranch hand'],
  ['Jolene', [-2051.5, -2716.2], { hair: 0xc86a30, bun: true, shirt: 0x3a5a8a, ag: true }, // Slaton gin country, S of Lubbock (33.44 −101.65)
    ['Gin season, this whole county hums till two in the morning. I run the hum.', 'Those round module bales on the trucks? Eight thousand pounds of somebody’s whole year.', 'Hail insurance is the only lottery ticket a farmer buys twice.', 'Dryland cotton is a prayer. Pivot cotton is a mortgage. Pick your religion.',
      'Come October the fields look like snow that pays.', 'One bale clothes two hundred people. You’re welcome, world.', 'The gin scale never lies, which makes it the most honest thing in three counties.'],
    'The High Plains around Lubbock are the largest contiguous cotton patch on Earth.', 48, 'cotton gin manager'],
];

// context openers — checked in order at interact time
const OPENERS = {
  storm: ['Whoa there — this one’s a real frog-strangler!', 'Lightning like that, you’d best keep moving.', 'That anvil cloud means business — I’d go find a roof.', 'Count the seconds after the flash. Then don’t dawdle.'],
  rain: ['Wet enough for ya?', 'Good day for ducks, not much else.', 'Smell that? Creosote and wet caliche. Best smell there is.', 'The land drinks first. We complain second.'],
  dust: ['Cover your eyes — West Texas is relocating today.', 'This dust’ll paint your truck for free.', 'Keep your windows up till the sky turns back on.', 'That’s half of New Mexico blowing through. No charge.'],
  night: ['You’re out late, partner.', 'Fine night for it, whatever it is you’re doing.', 'Stars put on a show out here once the sun clocks out.', 'Night driving’s for coyotes and truckers. Which are you?'],
};
// the same weather slots in the farm register — ag characters draw from these
// instead of OPENERS (farmers are what the weather context was born for)
const AG_OPENERS = {
  storm: ['There’s hail in that cloud — I can smell it. Pray it passes over the crop.', 'A storm like this can make my year or break it in ten minutes flat.', 'That sky means business. Everything I own is standing out in it.'],
  rain: ['This rain’s worth a dollar an inch, easy.', 'Best sound in the world — rain on a thirsty field.', 'The stock tank’s catching every drop of this. Let it pour.', 'Don’t you go complaining about this rain where I can hear you.'],
  dust: ['That’s my topsoil headed for Oklahoma.', 'Wind like this sandblasts the seedlings flat.', 'Dry year. The dirt gets restless when it’s thirsty.'],
  night: ['Stock’s bedded down. Quietest hour on the place.', 'Coyotes get bold after dark — I sleep with one ear open.', 'I’m up before the sun anyway. Always am.'],
};
const PROGRESS_LINES = [
  [(c) => c.species >= 8, 'Eight critters spotted? You’re a regular naturalist!'],
  [(c) => c.cities >= 50, 'Fifty towns and counting — you’ve seen more of Texas than most Texans.'],
  [(c) => c.landmarks >= 10, 'Heard you’ve been collecting landmarks. The big hydrant too?'],
  [(c) => c.roses >= 50, 'Yellow roses in your truck bed? Somebody’s sweet on Texas.'],
  [(c) => c.airports >= 10, 'Ten airfields stamped? You’ve got avgas in your veins, friend.'],
];

// B2 — aviation-aware openers, gated on a live heli near the city (ctx.heli
// from HeliSystem.candidates via getContext — only fires while it's airborne)
const HELI_OPENERS = {
  news: ['That news chopper’s been circling all morning. Somebody’s day got interesting.', 'News chopper overhead again. Wave — you might make the six o’clock.', 'When the news bird hovers, somebody’s front lawn is on TV.'],
  medical: ['Med-flight went over a bit ago. Say a little prayer for whoever that’s for.', 'That’s the Lifeguard bird up there. Hope it’s just a training run.', 'That’s the fastest anybody moves in this county, right up there.'],
  coastguard: ['Coast Guard’s working the water today. Somebody’ll be glad to see that orange.', 'That orange chopper out there means the Gulf’s earning its keep.', 'Sleep easy on this coast — that rotor noise is why.'],
  army: ['Army birds out of Hood again. You feel that thump before you hear it.', 'Them Army helicopters rattle my windows every time over.', 'Fort Hood’s birds fly low enough to wave back. Don’t, though.'],
};
const JOB_LINES = [
  (to) => `Heard you’re hauling for ${to}. Don’t let it spoil.`,
  (to) => `Word travels — folks say you’ve got a load bound for ${to}.`,
  (to) => `That crate bound for ${to}? Roads are long and the coffee’s cheap. Git.`,
  (to) => `${to}, huh? Tell ’em hello from out here.`,
];
const FORECAST_LINES = [
  (fc) => `Radio’s calling ${fc} later on. Plan around it.`,
  (fc) => `They say ${fc}’s coming. Radio’s wrong half the time — but which half?`,
  (fc) => `${fc} in the forecast. My knee already agrees.`,
];

const TOWNSFOLK_LINES = [
  'Howdy!', 'Fine day, ain’t it?', 'Y’all come back now.', 'New in town?', 'Good roads out there today.',
  'Best pie in the county, right up the street.', 'Seen any deer on the way in?', 'Don’t miss the high school game Friday.',
  'That your truck? Nice one.', 'Sure could use some rain.', 'Hot enough for ya?', 'Tell ’em Marge sent you.',
  'You ever seen them lights out by Levelland? Me neither. Officially.',
  'My cousin swears the sky stalled his truck once, out west. He don’t drive at night no more.',
  'Seen the bats pour outta that Austin bridge at sundown? River turns to smoke.',
  'Rattlers out west been noisy this year. Mind where you park.',
  'Old cemetery down the farm road glows some nights. Ain’t nobody mows it after dark.',
  'They say Enchanted Rock groans when it cools at night. The Tonkawa saw fires up top, too.',
  'My meemaw won’t drive past that old fort at Goliad after sundown. Won’t say why, neither.',
  'Y’all lost, or just wandering? Both’s fine here.',
  'Take it slow through town — the dog sleeps in the road.',
  'Feed store’s got coffee if the diner line’s too long.',
  'We wave at every truck here. You ain’t special. But howdy.',
  'Church supper Sunday. Bring an appetite and a folding chair.',
  'You picked a fine day to be somewhere.',
  'This bench has heard forty years of my opinions.',
  'Watch the caliche roads after a rain. Slicker’n owl grease.',
  'Fireflies been thick down by the creek this week.',
  'Need directions? Ask twice. The first answer’s always past the gas station that burned down.',
  'It ain’t the heat, it’s the hundred straight days of it.',
  'Somebody’s smoking brisket. Follow your nose — you can’t miss it.',
  'That water tower’s been leaning since ’94. We like it that way.',
  'High school got a new scoreboard this year. Whole town chipped in.',
  'Sky’s been promising rain all week. All hat, no cattle.',
  'Norther’s coming — you can smell it. Forty degrees by supper.',
  'Come spring, this whole stretch turns bluebonnet blue.',
  'Watch for hogs after dark. They don’t watch for you.',
  'Creek’s up. Turn around, don’t drown — that ain’t a suggestion.',
  'Hail took my windshield last spring. Left the mesquite alone, naturally.',
  'Rained two inches Tuesday. Gauge says one, my boots say two.',
  'The kolache place sells out by nine. You’ve been warned.',
  'Gas station tamales here beat my cousin’s. Don’t tell her.',
  'Brisket’s ready when it’s ready. Pitmaster don’t take questions.',
  'Big Red and barbacoa on Sunday. That’s tradition, not a suggestion.',
  'They say a lady in white walks the low-water crossing on full moons. My uncle honks, just to be polite.',
  'That highway hums some nights. Old-timers say it’s singing back to the trains.',
  'Weather balloon, they told us. Sure flew funny for a balloon.',
  'Don’t count the crows on the courthouse. Meemaw says it’s bad luck to finish.',
  'Courthouse clock runs four minutes fast. Town voted to leave it.',
  'They filmed a movie here in ’79. Nobody’s been allowed to forget it.',
  'Population sign says 1,200. The mayor counts the dogs.',
  'Six-man football Friday night — loudest two hundred people in Texas.',
  'The old drive-in still runs Fridays. Bring your own speakers now.',
  'Everything worth knowing gets decided at the coffee shop by 7 a.m.',
  'Can’t buy beer past midnight, but you can buy a saddle any hour. Priorities.',
  'Main Street’s three blocks. Takes an hour if you know everybody.',
  'My tomatoes won at the county fair. The secret’s spite.',
  'Them vultures on the cell tower? Neighborhood watch.',
  'Slow down and see something. That advice is free.',
  'Half this town’s related to the other half. Choose your gossip careful.',
  'Train still blows through at 2 a.m. You quit hearing it after a year. Visitors don’t.',
];
// first names ride the shared spawn stream (exactly one draw — position-safe);
// surnames + professions come from the independent per-NPC stream (see spawn*)
const TOWNSFOLK_FIRST = [
  'Earl', 'Ruby', 'Cole', 'June', 'Wade', 'Dolly', 'Buck', 'Lupe', 'Roy', 'Faye', 'Cash', 'Ida', 'Slim', 'Pearl',
  'Ada', 'Amos', 'Beau', 'Birdie', 'Boone', 'Bonnie', 'Calvin', 'Clara', 'Clay', 'Clint', 'Darla', 'Dale', 'Delia',
  'Dixie', 'Doyle', 'Duane', 'Elmer', 'Estela', 'Flor', 'Floyd', 'Gus', 'Hattie', 'Hoyt', 'Imogene', 'Inés', 'J.D.',
  'Jewel', 'Joaquín', 'Lela', 'Leon', 'Lonnie', 'Loretta', 'Mack', 'Mae', 'Marcelo', 'Mavis', 'Merle', 'Nadine',
  'Nita', 'Odell', 'Opal', 'Orville', 'Otis', 'Paz', 'Quincy', 'Ramona', 'Reba', 'Rex', 'Rosalinda', 'Rufus',
  'Sadie', 'Santos', 'Sissy', 'Sonny', 'Tavo', 'Tess', 'Travis', 'Vera', 'Virgil', 'Wanda', 'Wilma', 'Woody', 'Yolanda', 'Zeke',
];
const TOWNSFOLK_SURNAMES = [
  'Hodges', 'Pruitt', 'Vasquez', 'Cantu', 'Whitley', 'Boggs', 'Treviño', 'McAllister', 'Stubbs', 'Ozuna', 'Pickens',
  'LaRue', 'Guzmán', 'Tatum', 'Culpepper', 'Reyna', 'Dunlap', 'Sikes', 'Mendoza', 'Crabtree', 'Hollis', 'Zamora',
  'Prescott', 'Gaines', 'Villarreal', 'Ledbetter', 'Cisneros', 'Rankin', 'Duffey', 'Salinas', 'Whitworth', 'Ybarra',
  'Purdy', 'Kuykendall', 'Ochoa', 'Braddock', 'Elizondo', 'Montez', 'Slocum', 'Barrera', 'Hearn', 'Tidwell',
];
// disjoint on purpose — the npcs verify suite asserts big-city and small-town
// professions never overlap (that's how it proves the split without pool access)
const PROFESSIONS_TOWN = [
  'rancher', 'mechanic', 'shop owner', 'teacher', 'waitress', 'roughneck', 'feed store clerk', 'brand inspector',
  'farrier', 'water-well driller', 'county clerk', 'BBQ pitmaster', 'propane dealer', 'quilter', 'rodeo clown',
  'school bus driver', 'pecan farmer', 'taxidermist', 'fence builder', 'windmill repairman', 'cotton gin operator',
  'deputy sheriff', 'hairdresser', 'peach grower',
];
const PROFESSIONS_CITY = [
  'barista', 'paramedic', 'museum docent', 'food truck owner', 'real estate agent', 'session musician', 'oil trader',
  'ER nurse', 'line cook', 'rideshare driver', 'architect', 'TV weatherman', 'yoga instructor', 'bartender',
  'bike courier', 'art dealer', 'window washer', 'sports radio host', 'tattoo artist', 'food critic',
];
// profession-flavored smalltalk — keys must match the pool strings exactly;
// professions without an entry fall back to the generic pool
const PROFESSION_LINES = {
  'rancher': ['Calving season — I sleep in the truck more than the house.', 'Fence don’t care what day it is. It breaks when it breaks.', 'Cattle prices are up. Won’t last. Never does.'],
  'mechanic': ['Whatever that rattle is, it ain’t gonna fix itself.', 'Your truck sounds healthy. Rare thing around here.', 'Parts truck comes Thursday. Everything in this town breaks Friday.'],
  'shop owner': ['Sign says open when I’m here, closed when I’m fishing.', 'Tourists buy the bluebonnet postcards. Locals buy shells and duct tape.'],
  'teacher': ['Twenty-two kids, and every one of ’em is somebody’s whole world.', 'Summer break is a myth. I repaint the classroom myself.'],
  'waitress': ['Pie today is pecan. Pie tomorrow is also pecan. It’s a pecan town.', 'Coffee’s always fresh if you time it right. I’ll tell you when.', 'My regulars order by nodding. Took years to learn the nods.'],
  'roughneck': ['Two weeks on, one off. The rig don’t know it’s Christmas.', 'You can hear the pumpjack from my porch. Sounds like a paycheck.'],
  'feed store clerk': ['Spring means chicks in the tank by the register. Try leaving without one.', 'I can tell your acreage by your boot mud.'],
  'farrier': ['Horses are honest. It’s the owners you gotta gentle.', 'Bad back, good hands, full book — that’s the trade.'],
  'BBQ pitmaster': ['Lit the pit at three this morning. It’s a calling, not a job.', 'Post oak, salt, pepper, patience. Anything else is decoration.'],
  'deputy sheriff': ['Quietest county in Texas, and I aim to keep it boring.', 'Mostly I unlock cars and escort funerals. Proud of both.'],
  'school bus driver': ['Forty miles of dirt road every morning. I know every dog by name.', 'The kids think the bus can’t hear them. The bus hears everything.'],
  'pecan farmer': ['Good year for pecans. The squirrels agree, unfortunately.', 'You don’t pick pecans. You negotiate with the tree.'],
  'barista': ['Oat milk finally made it out here. Took a while. So did I.', 'Morning rush talks crude prices and cold brew in the same breath.'],
  'paramedic': ['A slow shift is a good shift. Knock on wood.', 'I know every farm-to-market road by its worst curve.'],
  'food truck owner': ['Brisket tacos at the brewery on Thursdays. That’s the whole business plan.', 'The truck’s AC died in June. We call it a sauna menu now.'],
  'rideshare driver': ['Airport, rodeo, honky-tonk, repeat. I could drive it blindfolded.', 'Five stars if you don’t mention the check-engine light.'],
  'sports radio host': ['Football season, my phone lines melt. Offseason, they melt different.', 'I’ve been taking calls about the same fumble for eleven years.'],
  'ER nurse': ['Night shift teaches you the town’s secrets. Day shift teaches patience.', 'Wash your hands and wear your seatbelt. That’s the whole sermon.'],
};
// per-role profession variants; the variant picks first, then age draws inside
// its band (so a 'retired airline captain' can't come out 25)
const BYSTANDER_ROLE_INFO = {
  spotter: [
    { p: 'plane spotter', lo: 16, hi: 72 }, { p: 'aviation photographer', lo: 19, hi: 66 },
    { p: 'retired air-traffic controller', lo: 57, hi: 78 }, { p: 'model-kit builder', lo: 16, hi: 70 },
  ],
  relative: [
    { p: 'family member', lo: 25, hi: 75 }, { p: 'pilot’s spouse', lo: 26, hi: 68 },
    { p: 'proud parent', lo: 42, hi: 78 }, { p: 'welcome-sign holder', lo: 16, hi: 70 },
  ],
  pilot: [
    { p: 'off-duty pilot', lo: 25, hi: 58 }, { p: 'crop-duster pilot', lo: 24, hi: 61 },
    { p: 'retired airline captain', lo: 58, hi: 79 }, { p: 'student pilot', lo: 17, hi: 44 }, { p: 'flight instructor', lo: 26, hi: 63 },
  ],
};

// B1 — airport bystanders: figures waiting at tier-1/2 field gates, townsfolk
// builds, dialog assembled at interact time from live aviation state
// tier-3 fields get bystanders too where they're public (Marfa Municipal,
// Terlingua Ranch's ghost-town strip) — the two private ranch strips
// (6666 Ranch, Armstrong Ranch) stay empty, matching their own flavor text.
const GATE_FIELDS = AIRPORTS.filter((a) => a.tier <= 2 || a.id === 'MRF' || a.id === 'TRL');
const ROLE_SMALLTALK = {
  spotter: [
    'Logged forty tails from this fence last month. Well. Fourteen.', 'You can tell the type by the engine note before you ever see it.', 'Best bench in Texas, right here by the fence.',
    'Tail numbers are like license plates, except interesting.', 'I had this same spot at the old fence line, before they moved the gate.', 'Rain or shine. Mostly shine. This is Texas.',
    'My logbook goes back nine years. My thermos goes back further.', 'One day something rare diverts in here. That’s the whole hobby — one day.',
  ],
  relative: [
    'Airport coffee’s terrible everywhere. Comforting, really.', 'I always come out too early. Can’t help it.', 'They always walk out last. Every single time.',
    'You can spot family at an airport fence a mile off. We all stand the same.', 'Brought the truck so there’s room for the bags. There’s never room for the bags.', 'One bar of signal out here, so I just watch the sky like the old days.',
    'Last time I waited here it rained. They still talk about my sign running.', 'You’d think the waiting gets easier after all these years. It don’t.',
  ],
  pilot: [
    'Day off. Can’t stay away from the field, though.', 'Twelve years in the left seat and I still watch every takeoff.', 'Ground’s fine. Sky’s better.',
    'Everybody watches the landing. Pilots watch the wind sock.', 'Flew freight out of here for a spell. The coffee hasn’t improved.', 'You never really log out of the sky. You just file it away.',
    'Crosswind days are free entertainment, fence-side.', 'The pattern here is friendly. The density altitude ain’t, come August.',
  ],
};
const PILOT_WX = {
  clear: ['Good day to be up there. Shame I’m down here.', 'CAVU. That’s pilot for "wish I was working."', 'Not a cloud worth naming. Somebody’s logging hours today.'],
  clouds: ['Ceiling’s workable. I’d file and go.', 'Scattered layer, decent gaps. VFR with manners.', 'Ceiling like that, you fly the plan, not the view.'],
  rain: ['Soft ceiling today — instrument weather.', 'Good day to stay current on paperwork instead.', 'Wet runway, long rollout. Respect it.'],
  storm: ['Nobody with sense is flying through that.', 'That cell would eat a Cessna for breakfast.', 'Tie-your-airplane-down weather, that is.'],
  dust: ['That brown-out would sand a windscreen clean off.', 'Visibility’s measured in guesses right now.', 'I’ve seen that wall eat a whole horizon in ten minutes.'],
};
// verify-only surface — tools/checks/npcs.mjs imports the live module in-page
// and asserts pool sizes/disjointness here instead of scraping source text
export const POOLS = { NAMED, TOWNSFOLK_LINES, TOWNSFOLK_FIRST, TOWNSFOLK_SURNAMES, PROFESSIONS_TOWN, PROFESSIONS_CITY, PROFESSION_LINES, ROLE_SMALLTALK, BYSTANDER_ROLE_INFO, OPENERS, AG_OPENERS, HELI_OPENERS, JOB_LINES, FORECAST_LINES, PILOT_WX };

const WIND_NAMES = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
const windName = (deg) => WIND_NAMES[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

// next remaining departure slot today matching `test`, across every field
function nextSlot(avn, days, test) {
  if (!avn || days == null) return null;
  const day = Math.floor(days);
  let best = null;
  for (const ap of avn.schedule(day)) for (const sl of ap.slots) {
    if (!test(sl) || day + sl.u <= days) continue;
    if (!best || sl.u < best.u) best = sl;
  }
  return best;
}

export class NPCSystem {
  constructor(scene, getContext) {
    this.scene = scene;
    this.getContext = getContext; // () => ({ night, weather, counts })
    this.onDialog = null;
    this.onTalk = null;
    this.activeNPC = null;
    this.dialogStep = 0;
    this.convo = [];
    this.t = 0;

    // named 12 — always present
    this.named = [];
    for (const [name, where, look, lines, fact, age, profession] of NAMED) {
      const rand = seededRand('npc:' + name);
      const g = mkCharacter(look, rand);
      let px, pz;
      if (Array.isArray(where)) {
        // rural ag characters: baked game-unit coords, shoulder of whatever
        // road is near (roadShoulder falls back to the point itself)
        [px, pz] = roadShoulder(where[0], where[1], 30);
      } else {
        const c = GEO.cities.find((c) => c.name === where);
        if (!c) continue;
        const R = cityRadius(c.pop);
        const a = rand() * Math.PI * 2;
        [px, pz] = roadShoulder(c.x + Math.cos(a) * R * 0.45, c.z + Math.sin(a) * R * 0.45, R);
      }
      g.position.set(px, gY(px, pz), pz);
      g.rotation.y = rand() * Math.PI * 2;
      addMarker(g, look.scale || 1);
      scene.add(g);
      this.named.push({ g, name, lines, fact, age, profession, ag: !!look.ag, visit: 0, baseRotY: g.rotation.y, wave: 0, townsfolk: false });
    }

    // townsfolk — spawned per city by proximity
    this.townByCity = new Map();

    // airport bystanders — spawned per field by proximity; aviation is
    // assigned by main.js (property pattern, like radio.helis)
    this.byField = new Map();
    this.aviation = null;
  }

  // a horn blast nearby: folks jump and wave
  startle(pos, r = 15) {
    for (const n of this.all()) {
      if (!n.g.visible) continue;
      const d2 = (n.g.position.x - pos.x) ** 2 + (n.g.position.z - pos.z) ** 2;
      if (d2 > r * r) continue;
      n.wave = 0.9;
      n.hop = 0.4;
    }
  }

  // all interactable NPCs currently live
  all() {
    let list = this.named;
    for (const folk of this.townByCity.values()) list = list.concat(folk);
    for (const folk of this.byField.values()) list = list.concat(folk);
    return list;
  }

  npcNear(pos, range = TALK_R) {
    let best = null, bd = range * range;
    for (const n of this.all()) {
      if (!n.g.visible) continue;
      const d = (n.g.position.x - pos.x) ** 2 + (n.g.position.z - pos.z) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  interact(pos) {
    if (this.activeNPC) { // advance / close
      this.dialogStep++;
      if (this.dialogStep >= this.convo.length) { this.activeNPC = null; this.onDialog?.(null); }
      else this.onDialog?.({ name: this.activeNPC.name, sub: npcSub(this.activeNPC), text: this.convo[this.dialogStep] });
      return true;
    }
    const n = this.npcNear(pos);
    if (!n) return false;
    this.activeNPC = n;
    this.dialogStep = 0;
    n.wave = 1; // greet
    const ctx = this.getContext();
    const heliLine = ctx.heli && ctx.heli.d < 150 ? pick(HELI_OPENERS[ctx.heli.kind] ?? ['Busy sky today.']) : null;
    if (n.bystander) {
      this.convo = this.bystanderConvo(n, ctx);
      n.visit++;
    } else if (n.townsfolk) {
      const prof = PROFESSION_LINES[n.profession];
      this.convo = [
        ...(heliLine ? [heliLine] : []),
        prof && Math.random() < 0.45 ? pick(prof) : pick(TOWNSFOLK_LINES),
      ];
    } else {
      const O = n.ag ? AG_OPENERS : OPENERS;
      const opener =
        (ATMOS.weather === 'storm' && pick(O.storm)) ||
        (ATMOS.weather === 'rain' && pick(O.rain)) ||
        (ATMOS.weather === 'dust' && pick(O.dust)) ||
        heliLine ||
        (ctx.night > 0.6 && pick(O.night)) || null;
      const progress = PROGRESS_LINES.find(([test]) => test(ctx.counts) && Math.random() < 0.5);
      const pulls = []; // shared context, not per-character sets — voices untouched
      if (ctx.job && Math.random() < 0.5) pulls.push(pick(JOB_LINES)(ctx.job.to));
      if (ctx.fc && Math.random() < 0.4) pulls.push(pick(FORECAST_LINES)(ctx.fc));
      this.convo = [
        opener ?? n.lines[n.visit % n.lines.length],
        ...(opener ? [n.lines[n.visit % n.lines.length]] : []),
        ...pulls,
        ...(progress ? [progress[1]] : []),
        '📌 ' + n.fact,
      ];
      n.visit++;
    }
    this.onTalk?.();
    this.onDialog?.({ name: n.name, sub: npcSub(n), text: this.convo[0] });
    return true;
  }

  update(dt, pos) {
    this.t += dt;
    const night = ATMOS.night > 0.6;

    // townsfolk spawn/despawn by city proximity (Texas + band, own key namespace)
    this._streamFolk(pos, GEO.cities, false);
    this._streamFolk(pos, GEO.bandCities, true);

    // bystanders spawn/despawn by airport-gate proximity (same hysteresis)
    for (const a of GATE_FIELDS) {
      const d = Math.hypot(a.gate[0] - pos.x, a.gate[1] - pos.z);
      const has = this.byField.has(a.id);
      if (d < 500 && !has) this.spawnBystanders(a);
      else if (d > 650 && has) {
        for (const f of this.byField.get(a.id)) {
          this.scene.remove(f.g);
          f.g.traverse((o) => o.geometry?.dispose());
        }
        this.byField.delete(a.id);
      }
    }

    let hint = null;
    for (const n of this.all()) {
      const g = n.g;
      // townsfolk and gate bystanders head home after dark
      if (n.townsfolk || n.bystander) g.visible = n.bigCity || !night;
      if (!g.visible) continue;

      const dx = pos.x - g.position.x, dz = pos.z - g.position.z;
      const d2 = dx * dx + dz * dz;

      if (d2 < FACE_R * FACE_R) {
        // face the player
        const want = Math.atan2(dx, dz);
        g.rotation.y += shortestArc(g.rotation.y, want) * Math.min(1, dt * 6);
        if (d2 < TALK_R * TALK_R && !this.activeNPC) hint = n.name;
      } else if (n.townsfolk) {
        // wander: amble between points near home
        n.walkT -= dt;
        if (n.walkT <= 0) { n.walkT = 3 + Math.random() * 5; n.walking = Math.random() < 0.6; n.dir = Math.random() * Math.PI * 2; }
        if (n.walking) {
          const nx = g.position.x - Math.sin(n.dir) * 1.1 * dt;
          const nz = g.position.z - Math.cos(n.dir) * 1.1 * dt;
          if (Math.hypot(nx - n.homeX, nz - n.homeZ) < 14 && !nearestRoad(nx, nz, 1.5)) {
            g.position.x = nx; g.position.z = nz;
            g.position.y = gY(nx, nz);
            g.rotation.y = n.dir;
          } else n.dir += Math.PI / 2;
        }
      } else {
        // drift back to their spot's facing
        g.rotation.y += shortestArc(g.rotation.y, n.baseRotY) * Math.min(1, dt * 1.5);
      }

      // limbs: wave on greet, gesture while talking, leg swing while walking, idle sway
      const u = g.userData;
      const talking = this.activeNPC === n;
      if (n.wave > 0) {
        n.wave -= dt;
        u.ra.rotation.z = -2.4 + Math.sin(this.t * 14) * 0.35; // arm up, waving
      } else if (talking) {
        u.ra.rotation.z = -0.5 + Math.sin(this.t * 3.2) * 0.25;
        u.la.rotation.z = 0.3 + Math.sin(this.t * 2.6 + 1) * 0.18;
      } else if (n.townsfolk && n.walking && d2 >= FACE_R * FACE_R) {
        const s = Math.sin(this.t * 5 + (n.phase || 0)) * 0.4;
        u.ll.rotation.x = s; u.rl.rotation.x = -s;
        u.la.rotation.x = -s * 0.7; u.ra.rotation.x = s * 0.7;
        u.ra.rotation.z *= 0.8;
      } else {
        u.ra.rotation.z += (0 - u.ra.rotation.z) * Math.min(1, dt * 4);
        u.la.rotation.z += (0.06 * Math.sin(this.t * 1.2 + (n.phase || 0)) - u.la.rotation.z) * Math.min(1, dt * 4);
        u.ll.rotation.x *= 0.9; u.rl.rotation.x *= 0.9;
        u.la.rotation.x *= 0.9; u.ra.rotation.x *= 0.9;
      }
      if (u.marker) u.marker.position.y = u.markerY + Math.sin(this.t * 3 + (n.phase || 0)) * 0.2;

      // startled hop (horn) — a quick jump, then settle back onto the terrain
      if (n.hop > 0) {
        n.hop -= dt;
        const gy = gY(g.position.x, g.position.z);
        g.position.y = gy + (n.hop > 0 ? Math.abs(Math.sin(n.hop * 15)) * 0.3 : 0);
      }

      // walked away mid-conversation
      if (talking && d2 > TALK_R * TALK_R * 4) { this.activeNPC = null; this.onDialog?.(null); }
    }
    return hint;
  }

  // Shared proximity streaming for GEO.cities and GEO.bandCities — band
  // entries live under a `'band:'+name` townByCity key (no named NPCs, so no
  // collision risk with the Texas roster; separate namespace kept anyway for
  // consistency with cities.js's own city/band key split).
  _streamFolk(pos, list, band) {
    for (const c of list) {
      const key = band ? 'band:' + c.name : c.name;
      const d = Math.hypot(c.x - pos.x, c.z - pos.z);
      const has = this.townByCity.has(key);
      if (d < 500 && !has) this.spawnTownsfolk(c, band);
      else if (d > 650 && has) {
        for (const f of this.townByCity.get(key)) {
          this.scene.remove(f.g);
          f.g.traverse((o) => o.geometry?.dispose());
        }
        this.townByCity.delete(key);
      }
    }
  }

  spawnTownsfolk(city, band = false) {
    const rand = seededRand((band ? 'bandfolk:' : 'folk:') + city.name);
    const n = city.pop > 400000 ? 5 : city.pop > 80000 ? 3 : 2;
    const R = cityRadius(city.pop);
    // same 400,000 "big city" threshold as cities.js:52 — mirrored here
    // (not exported there); keep the two in sync if it ever changes.
    const bigCity = city.pop > 400000;
    const folk = [];
    for (let i = 0; i < n; i++) {
      const g = mkCharacter(randomLook(rand), rand);
      const a = rand() * Math.PI * 2, r = R * (0.2 + rand() * 0.5);
      const [x, z] = roadShoulder(city.x + Math.cos(a) * r, city.z + Math.sin(a) * r, R);
      g.position.set(x, gY(x, z), z);
      g.rotation.y = rand() * Math.PI * 2;
      this.scene.add(g);
      // independent stream (keyed by index, not drawn from `rand`) so adding
      // age/profession/surname never shifts the shared stream's later look/position draws
      const ar = seededRand((band ? 'bandage:' : 'age:') + city.name + ':' + i);
      const pool = bigCity ? PROFESSIONS_CITY : PROFESSIONS_TOWN;
      const age = 20 + ((ar() * 55) | 0), profession = pool[(ar() * pool.length) | 0];
      folk.push({
        g, name: TOWNSFOLK_FIRST[(rand() * TOWNSFOLK_FIRST.length) | 0] + ' ' + TOWNSFOLK_SURNAMES[(ar() * TOWNSFOLK_SURNAMES.length) | 0],
        age, profession,
        townsfolk: true, bigCity, homeX: x, homeZ: z, walkT: rand() * 3, walking: false,
        dir: 0, wave: 0, phase: rand() * 6.28, baseRotY: g.rotation.y,
      });
    }
    this.townByCity.set(band ? 'band:' + city.name : city.name, folk);
  }

  spawnBystanders(a) {
    const rand = seededRand('gatefolk:' + a.id);
    const n = a.tier === 1 ? 3 : 2;
    const roles = ['spotter', 'relative', 'pilot'];
    const [gx, gz] = a.gate;
    // same 400,000 "big city" threshold as cities.js:52 — mirrored here
    const bigCity = (GEO.cities.find((c) => c.name === a.city)?.pop ?? 0) > 400000;
    const folk = [];
    for (let i = 0; i < n; i++) {
      const g = mkCharacter(randomLook(rand), rand);
      const ang = rand() * Math.PI * 2, r = 1.4 + rand() * 2.2;
      const x = gx + Math.cos(ang) * r, z = gz + Math.sin(ang) * r;
      g.position.set(x, gY(x, z), z);
      g.rotation.y = rand() * Math.PI * 2;
      this.scene.add(g);
      const role = roles.splice((rand() * roles.length) | 0, 1)[0];
      // independent stream (keyed by index, not drawn from `rand`) so adding
      // variant/age/surname never shifts the shared stream's later look/position draws
      const ar = seededRand('age:' + a.id + ':' + i);
      const variants = BYSTANDER_ROLE_INFO[role];
      const v = variants[(ar() * variants.length) | 0];
      folk.push({
        g, name: TOWNSFOLK_FIRST[(rand() * TOWNSFOLK_FIRST.length) | 0] + ' ' + TOWNSFOLK_SURNAMES[(ar() * TOWNSFOLK_SURNAMES.length) | 0],
        age: v.lo + ((ar() * (v.hi - v.lo)) | 0), profession: v.p,
        bystander: true, bigCity, field: a, role,
        visit: 0, wave: 0, phase: rand() * 6.28, baseRotY: g.rotation.y,
      });
    }
    this.byField.set(a.id, folk);
  }

  // role dialog from live aviation state — a factual claim (origin city,
  // runway, next departure) only when the schedule actually backs it
  bystanderConvo(n, ctx) {
    const a = n.field, day = Math.floor(ctx.day ?? 0), avn = this.aviation;
    const idCity = (id) => AIRPORTS.find((x) => x.id === id)?.city ?? id;
    const lines = [];
    if (n.role === 'relative') {
      const live = avn?.flights.find((m) => m.sl.dest === a.id && m.st.ph !== 'done');
      const next = live ? null : nextSlot(avn, ctx.day, (sl) => sl.dest === a.id);
      if (live) lines.push(`That’s them now, coming in from ${idCity(live.sl.from)} — I’d know that speck anywhere.`);
      else if (next) lines.push(`Waiting on family — they’re coming in from ${idCity(next.from)}.`);
      else lines.push('Came out to meet somebody, but the board’s gone quiet for the day.');
    } else if (n.role === 'spotter') {
      lines.push(`They’re running runway ${rwyLabel(runwayInUse(a, day))} today. Wind says so.`);
      const next = nextSlot(avn, ctx.day, (sl) => sl.from === a.id);
      if (next) lines.push(`Next one out is ${next.cs}, bound for ${idCity(next.dest)}.`);
    } else {
      lines.push(`Wind’s out of the ${windName(windFrom(day))} today. ${pick(PILOT_WX[ATMOS.weather] ?? PILOT_WX.clear)}`);
      if (ctx.fc) lines.push(`Radio says ${ctx.fc}’s coming. I’d believe it.`);
    }
    lines.push(pick(ROLE_SMALLTALK[n.role]));
    lines.push('📌 ' + a.fact);
    return lines;
  }
}

const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// place a character on the shoulder of the nearest road — clear of buildings,
// since building placement rejects anything on the roadway
function roadShoulder(x, z, searchR) {
  const r = nearestRoad(x, z, searchR);
  if (!r) return [x, z];
  const d = Math.max(r.dist, 0.001);
  const ox = (x - r.x) / d, oz = (z - r.z) / d;
  return [r.x + ox * 2.1, r.z + oz * 2.1];
}
const shortestArc = (from, to) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

function randomLook(rand) {
  const skins = [0xd9a066, 0xb5875a, 0x8a5c3c, 0xe8b880];
  const colors = [0x8a2f2f, 0x2f5a8a, 0x3f7a3f, 0x7a5a2f, 0x6a3f7a, 0x9a8a4a, 0x4a7a8a];
  const look = { skin: skins[(rand() * skins.length) | 0], shirt: colors[(rand() * colors.length) | 0] };
  if (rand() < 0.4) look.dress = colors[(rand() * colors.length) | 0];
  if (rand() < 0.55) { look.hat = rand() < 0.7 ? 'stetson' : 'cap'; look.hatC = 0x6a5638 + ((rand() * 0x202020) | 0); }
  else look.hair = [0x2a2018, 0x4a3020, 0xd8b860, 0x888888][(rand() * 4) | 0];
  return look;
}

// --- character kit: articulated box people with looks ---
function mkCharacter(look, rand) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const skin = mat(look.skin ?? 0xd9a066);
  const bottom = mat(look.dress ?? 0x3a5077);

  // legs (pivots) — dress gets a skirt instead
  const mkLeg = (x) => {
    const p = new THREE.Group();
    p.position.set(x, 0.75, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.22), look.dress ? skin : bottom);
    leg.position.y = -0.35;
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.28), mat(0x3a2c22));
    shoe.position.set(0, -0.68, -0.03);
    p.add(leg, shoe);
    g.add(p);
    return p;
  };
  const ll = mkLeg(-0.14), rl = mkLeg(0.14);
  if (look.dress) {
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.42, 0.65, 8), mat(look.dress));
    skirt.position.y = 0.62;
    g.add(skirt);
  }

  // torso (+ vest/coat), arms with hands
  const torsoC = look.coat ?? look.dress ?? look.shirt ?? 0x8a2f2f;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.56, 0.32), mat(torsoC));
  torso.position.y = 1.06;
  g.add(torso);
  if (look.vest) {
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.44, 0.36), mat(look.vest));
    vest.position.y = 1.1;
    g.add(vest);
  }
  if (look.kerchief) {
    const k = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.3), mat(look.kerchief));
    k.position.y = 1.38;
    k.rotation.y = Math.PI / 4;
    g.add(k);
  }
  const mkArm = (x) => {
    const p = new THREE.Group();
    p.position.set(x, 1.3, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.56, 0.18), mat(torsoC));
    arm.position.y = -0.28;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), skin);
    hand.position.y = -0.6;
    p.add(arm, hand);
    g.add(p);
    return p;
  };
  const la = mkArm(-0.36), ra = mkArm(0.36);

  // head, hair/hat, extras
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.3), skin);
  head.position.y = 1.56;
  g.add(head);
  if (look.beard) {
    const beard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.1), mat(look.beard));
    beard.position.set(0, 1.46, -0.14);
    g.add(beard);
  }
  if (look.glasses) {
    for (const x of [-0.08, 0.08]) {
      const lens = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.03), mat(0x222222));
      lens.position.set(x, 1.58, -0.16);
      g.add(lens);
    }
  }
  if (look.hair && !look.hat) {
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.32), mat(look.hair));
    hair.position.y = 1.74;
    g.add(hair);
    if (look.bun) {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), mat(look.hair));
      bun.position.set(0, 1.76, 0.18);
      g.add(bun);
    }
  }
  if (look.braids) {
    for (const x of [-0.16, 0.16]) {
      const braid = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.07), mat(0x5a4530));
      braid.position.set(x, 1.36, 0.1);
      g.add(braid);
    }
  }
  if (look.flower) {
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), mat(look.flower));
    f.position.set(0.14, 1.72, -0.08);
    g.add(f);
  }
  const hatC = mat(look.hatC ?? 0x8a6f4d);
  if (look.hat === 'stetson' || look.hat === 'wide') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(look.hat === 'wide' ? 0.5 : 0.38, look.hat === 'wide' ? 0.5 : 0.38, 0.05, 10), hatC);
    brim.position.y = 1.74;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.22, 8), hatC);
    crown.position.y = 1.86;
    g.add(brim, crown);
  } else if (look.hat === 'cap') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), hatC);
    cap.position.y = 1.7;
    const bill = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.16), hatC);
    bill.position.set(0, 1.72, -0.22);
    g.add(cap, bill);
  } else if (look.hat === 'beret') {
    const beret = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.09, 8), hatC);
    beret.position.set(0.05, 1.75, 0);
    beret.rotation.z = -0.15;
    g.add(beret);
  } else if (look.hat === 'bucket') {
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.16, 8), hatC);
    bucket.position.y = 1.76;
    g.add(bucket);
  } else if (look.hat === 'captain') {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 8), mat(0x1a1a2a));
    band.position.y = 1.73;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.07, 8), hatC);
    top.position.y = 1.8;
    g.add(band, top);
  }

  // props in the left hand
  if (look.prop === 'guitar') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.1, 8).rotateX(Math.PI / 2), mat(0x8a5c2a));
    body.position.set(-0.5, 0.95, -0.1);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.05), mat(0x3a2c1a));
    neck.position.set(-0.5, 1.35, -0.1);
    g.add(body, neck);
  } else if (look.prop === 'lasso') {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 6, 12), mat(0xc2a95a));
    coil.position.set(-0.42, 0.9, 0.05);
    g.add(coil);
  } else if (look.prop === 'rod') {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.5, 5), mat(0x6a5a3a));
    rod.position.set(-0.48, 1.2, 0);
    rod.rotation.z = 0.4;
    g.add(rod);
  } else if (look.prop === 'brush') {
    const brush = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 5), mat(0xaa7a3a));
    brush.position.set(-0.45, 0.85, 0);
    g.add(brush);
  }

  if (look.scale) g.scale.setScalar(look.scale);
  g.userData = { ll, rl, la, ra };
  return g;
}

function addMarker(g, scale) {
  const marker = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 4), new THREE.MeshBasicMaterial({ color: 0xffd35c }));
  marker.position.y = 2.5 / (scale || 1) + 0.4;
  marker.rotation.x = Math.PI;
  g.add(marker);
  g.userData.marker = marker;
  g.userData.markerY = marker.position.y;
}
