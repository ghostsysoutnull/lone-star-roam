// Aviation observability A3 — the chatter engine. The realism frame: the
// player's radio is a *scanner*. Tower/UNICOM keeps strict phraseology
// (radio.js); this module is everything overheard on the OTHER channels —
// medical↔hospital dispatch, news↔station producer, coast guard crew, army
// inter-flight, airline enroute ride reports, folksy GA. Pure line-pool
// tables + a seeded pick: no scene deps, no transmitter of its own (radio.js
// stays the sole transmitter and consumes chatterLine). A template only
// enters the eligible set when every {token} it uses is live in ctx — lines
// are factual by construction, never invented. Humor is rationed to ~1-in-4.
import { seededRand } from './geo.js';

// per-type synth voice character, consumed by audio.radio(text, {voice}):
// p multiplies the oscillator/bandpass pitch, r the syllable rate (and
// shortens the burst) — so a dispatch drawl and a clipped two-ship are
// audibly distinct even though the synth never says real words
export const VOICES = {
  dispatch: { p: 0.85, r: 0.85 },  // medical: calm, unhurried
  news: { p: 1.18, r: 1.3 },       // quick, bright, always mid-broadcast
  coastguard: { p: 0.95, r: 1.0 },
  army: { p: 0.88, r: 1.45 },      // low and clipped
  jet: { p: 1.0, r: 1.0 },
  ga: { p: 1.08, r: 0.9 },         // easygoing
  military: { p: 0.92, r: 1.2 },   // NASA: procedural, unhurried-but-crisp
  tower: { p: 1.0, r: 1.1 },       // the existing controller register
};

// kind-distinct callsigns + operator brands (A6: operator name ≠ radio
// callsign, which is how it really works — StarCare flies as Lifeguard).
// Generic-but-flavored, never real operators.
export const HELI_ID = {
  medical: { cs: 'Lifeguard 3', op: 'StarCare Flight', voice: 'dispatch' },
  news: { cs: 'Chopper 5', op: 'KTX News 5', voice: 'news' },
  coastguard: { cs: 'Rescue 6-0', op: null, voice: 'coastguard' },
  army: { cs: 'Hood 2-1', op: null, voice: 'army' },
};

// ctx tokens a template may use — filled by radio.js at transmit time, only
// from live state: city (nearestCity to the source), dest/origin (real
// schedule slot, city names), field (pad-stop airport name), wx (current
// weather name), fc (forecast name, only while one is live), tod
// (morning/afternoon/evening), cs (the source's callsign)
const POOLS = {
  medical: {
    lift: [
      { t: 'Dispatch, {cs}, lifting {city}, three souls, two hours fuel.' },
      { t: '{cs} is up at {city}, en route to the scene.' },
      { t: 'Dispatch, {cs} off the pad, winds are easy.' },
    ],
    enroute: [
      { t: 'Dispatch, {cs}, about six minutes out.' },
      { t: '{cs}, level and smooth over {city}.' },
      { t: 'Dispatch, {cs}, {wx} along the route, no factor.' },
      { t: 'Dispatch, {cs} — tell the pad crew the coffee better be on.', funny: true },
    ],
    padDown: [
      { t: 'Dispatch, {cs}, on the pad at {field}.' },
      { t: '{cs} down at {field}, rotors turning.' },
    ],
    padLift: [
      { t: 'Dispatch, {cs}, lifting off {field}, returning to base.' },
      { t: '{cs} off {field}, homebound.' },
    ],
    touchdown: [
      { t: 'Dispatch, {cs}, back at base. Shutting down.' },
      { t: '{cs} on the pad at base — somebody owes me a late lunch.', funny: true },
    ],
  },
  news: {
    enroute: [
      { t: 'Station, Five — over {city}, traffic is moving fine down there.' },
      { t: 'Five here, give me thirty seconds, coming up on the top of the hour.' },
      { t: 'Station, Five — {fc} building on the horizon, want a live shot of it?' },
      { t: 'Five has a pretty {tod} over {city}, rolling tape.' },
      { t: 'Station, Five — the anchor still owes me for Tuesday. Over.', funny: true },
    ],
    playerRef: [
      { t: 'Whoa — Station, Five, some pickup absolutely hauling down the highway under us. Y’all seeing this?' },
      { t: 'Five here — got a truck flying low on the interstate below us. Might make the six o’clock.' },
    ],
  },
  coastguard: {
    enroute: [
      { t: '{cs}, marking the leg down the coast, sea state is easy.' },
      { t: '{cs}, on the search leg, {wx} over the gulf.' },
      { t: '{cs} — nothing out here but shrimp boats and sunburn.', funny: true },
    ],
    hover: [
      { t: '{cs}, coming to a hover, checking a vessel below.' },
      { t: '{cs}, holding hover — all well, resuming the leg.' },
    ],
  },
  army: {
    lift: [
      { t: '{cs}, flight of two, lifting Cavazos.' },
      { t: '{cs} up, two abreast, corridor south.' },
    ],
    enroute: [
      { t: 'Two.', funny: true },
      { t: 'Lead, Two — in position.' },
      { t: '{cs}, flight check. ...Two’s up.' },
      { t: 'Lead, Two — your rotor wash, my windscreen. ...Copy.', funny: true },
    ],
    touchdown: [
      { t: '{cs}, flight of two, down at Cavazos.' },
    ],
  },
  jet: {
    enroute: [
      { t: 'Center, {cs}, level cruise, direct {dest}.' },
      { t: '{cs}, smooth ride up here, {dest} before long.' },
      { t: 'Center, {cs}, any ride reports on the way into {dest}?' },
      { t: 'Center, {cs}, out of {origin}, looking direct {dest}.' },
      { t: 'Center, {cs}, painting {fc} on the radar ahead.' },
      { t: 'Center, {cs} — folks, if you look out the right side, that’s Texas. All of it.', funny: true },
    ],
  },
  military: {
    // the NASA arrival into Ellington, voiced via the direct-range window
    // (deferred from session 1 — Ellington isn't in AIRPORTS, so the tower
    // never covers it). The low-level pair carries no callsign and stays out
    // of the scanner entirely.
    enroute: [
      { t: 'Houston, {cs}, field in sight.' },
      { t: '{cs}, with you out of altitude, inbound Ellington.' },
    ],
  },
  ga: {
    enroute: [
      { t: 'Anybody readin’ — {cs}, over {city}, pretty as a picture.' },
      { t: '{cs}, smooth air out here, {wx} and not a bump.' },
      { t: '{cs}, headed over to {dest} for the hundred-dollar hamburger.', funny: true },
      { t: '{cs}, student pilot aboard, doin’ our best out here.', funny: true },
      { t: '{cs}, droppin’ into {dest} ’fore the café closes.' },
    ],
  },
};

// A6 carrier registers — extra enroute lines mixed into the jet pool by
// airline key: Sweetheart folksy, Texan corporate-crisp, Intercon long-haul
// tired, Bravo a little flamboyant, Lone Star neutral (base pool only)
const AIRLINE_POOLS = {
  sweetheart: [
    { t: 'Center, {cs}, direct {dest} when able — y’all have a good one.' },
    { t: 'Center, {cs} — cabin reports the pretzels are gone. Declaring nothing.', funny: true },
  ],
  texan: [
    { t: 'Center, {cs}, on profile, direct {dest}, thank you.' },
  ],
  intercon: [
    { t: 'Center, {cs}, been level a long while — any shortcut to {dest} appreciated.' },
    { t: 'Center, {cs}, long haul into {dest}, ride is fine.' },
  ],
  bravo: [
    { t: 'Center, {cs} — yes, the bright one — direct {dest}, thanks.', funny: true },
    { t: '{cs}, colors on and level, {dest} bound.' },
  ],
};

const TOKEN = /\{(\w+)\}/g;
const tokensOf = (t) => [...t.matchAll(TOKEN)].map((m) => m[1]);
const fill = (t, ctx) => t.replace(TOKEN, (_, k) => ctx[k]);

// pick a line for (kind × event) given live ctx. Seeded on the caller's key
// (chatter: stream) so the same day + same event yields the same line. Null
// when nothing in the pool has its context live — the source just stays
// quiet rather than inventing.
export function chatterLine(kind, event, ctx, seed) {
  let pool = POOLS[kind]?.[event] ?? [];
  if (kind === 'jet' && ctx.airline && AIRLINE_POOLS[ctx.airline] && event === 'enroute')
    pool = pool.concat(AIRLINE_POOLS[ctx.airline]);
  const ok = pool.filter((l) => tokensOf(l.t).every((k) => ctx[k] != null));
  if (!ok.length) return null;
  const r = seededRand('chatter:' + seed);
  const funny = ok.filter((l) => l.funny), plain = ok.filter((l) => !l.funny);
  const set = r() < 0.25 && funny.length ? funny : plain.length ? plain : funny;
  const line = set[Math.floor(r() * set.length)];
  return { text: fill(line.t, ctx), voice: HELI_ID[kind]?.voice ?? kind, casual: true };
}
