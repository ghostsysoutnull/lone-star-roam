// Playtest debug menu — gated behind ?debug=1 so the public build stays
// honest. The actions are always constructed (the verify suite drives them
// directly through __game.debug); only the panel and its backquote keybinding
// exist when the URL asks for them.
import { chapelSitesNear } from './world.js';
import { EROCK } from './haunts.js';

const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];
const BRIDGE = LL(30.2617, -97.7447); // Congress Ave — the bat show

export function initDebug({ player, sky, haunts, ufo, hud, aviation, radio, heli, blimp, military, missions }) {
  const tp = (x, z, heading) => {
    player.pos.set(x, 0, z);
    player.speed = 0; player.vy = 0;
    if (heading != null) player.heading = heading;
  };
  const setWeather = (name) => { sky.weather = sky.target = name; sky.blend = 1; sky.nextPick = 120; sky.forecast = null; };

  const actions = {
    _heliIdx: 0, // cycles medical→news→coastguard→army→… on repeated 🚁 Heli presses, instead of a random pick
    day() { sky.t = 0.35; haunts.force = false; },
    night() { sky.t = 0.98; },
    midnight() { sky.t = 0.998; }, // the bell tolls on the wrap — park near a chapel first
    hauntCemetery() {
      let best = null, bd = Infinity;
      for (const s of chapelSitesNear(player.pos.x, player.pos.z, 8)) {
        const d = Math.hypot(s.cemX - player.pos.x, s.cemZ - player.pos.z);
        if (d < bd) { bd = d; best = s; }
      }
      if (!best) return hud.toast('👻 No chapel within 8 chunks — drive to ranch country');
      haunts.force = true; // override tonight's seeded roll
      actions.night();
      tp(best.cemX + 20, best.cemZ, Math.PI / 2); // parked distance, facing the plot
      hud.toast('👻 Haunting the nearest cemetery');
    },
    ghostFires() { actions.night(); tp(EROCK[0] + 30, EROCK[1], Math.PI / 2); },
    saucer() { actions.night(); ufo.startSaucer(player.pos.x, player.pos.z, true); }, // immediate: hovers at the standoff now
    formation() { actions.night(); ufo.startFormation(player.pos.x, player.pos.z); },
    bats() { sky.t = 0.79; tp(BRIDGE[0] - 40, BRIDGE[1], -Math.PI / 2); },
    departure() {
      const f = aviation.force('departure');
      hud.toast(f ? `🛫 ${f.sl.from} departure, Lone Star ${f.sl.n} to ${f.sl.dest}` : '🛫 No field in range');
    },
    arrival() {
      const f = aviation.force('arrival');
      hud.toast(f ? `🛬 Lone Star ${f.sl.n} inbound from ${f.sl.from}` : '🛬 No field in range / sky full');
    },
    heli() {
      const kinds = ['medical', 'news', 'coastguard', 'army'];
      const k = kinds[actions._heliIdx % kinds.length];
      actions._heliIdx++;
      const ok = heli.force(k);
      if (!ok) return hud.toast('🚁 Sky already at the rotorcraft cap');
      const c = heli.candidates.find((x) => x.kind === k && x.flying);
      tp(c.baseX + 20, c.baseZ, Math.PI / 2);
      hud.toast(`🚁 ${k} run`);
    },
    blimp() {
      tp(blimp.pos.x + 20, blimp.pos.z, Math.PI / 2);
      hud.toast(`🎈 Blimp: ${blimp.state}`);
    },
    nasa() {
      const c = military.candidates.find((x) => x.kind === 'nasa');
      tp(c.baseX + 30, c.baseZ, Math.PI / 2);
      const ok = military.force('nasa', aviation);
      hud.toast(ok ? '✈️ NASA T-38 pair inbound to Ellington' : '✈️ Sky already at the fixed-wing cap');
    },
    lowlevel() {
      tp(-2600, 300, 0);
      const ok = military.force('lowlevel', aviation, -2600, 300); // explicit — see military.js force() comment
      hud.toast(ok ? '✈️ Low-level trainer pair, West Texas' : '✈️ Sky already at the fixed-wing cap');
    },
    charter() {
      const offer = missions.force('MRF', 'DFW'); // Marfa strip → DFW: the tier-3 strip's moment
      hud.toast(offer ? `✈️ Charter forced: ${offer.from} → ${offer.to} — go land it` : '✈️ Job already active — finish or abandon it first');
    },
    testRadio() {
      const tw = radio.nearestTowered(player.pos.x, player.pos.z);
      const un = radio.nearestUnicom(player.pos.x, player.pos.z);
      const useUnicom = un.a && (!tw.a || un.d < tw.d);
      const a = useUnicom ? un.a : tw.a;
      if (!a) return hud.toast('📻 No field found');
      const text = useUnicom
        ? `${a.city} traffic, testing, ${a.city} traffic.`
        : `${a.city} Tower testing, one two three.`;
      radio.tx(a, text, 'test');
      hud.toast(`📻 Test transmission — ${a.city} ${useUnicom ? 'traffic' : 'Tower'}`);
    },
  };
  for (const w of ['clear', 'clouds', 'rain', 'storm', 'dust']) actions[w] = () => setWeather(w);

  if (new URLSearchParams(location.search).has('debug')) {
    const rows = [
      ['day', '🌞 Day'], ['night', '🌙 Night'], ['midnight', '🕛 Midnight'],
      ['hauntCemetery', '👻 Haunt cemetery'], ['ghostFires', '🔥 Ghost fires'],
      ['saucer', '🛸 Saucer'], ['formation', '✨ Lubbock lights'], ['bats', '🦇 Bat show'],
      ['departure', '🛫 Departure'], ['arrival', '🛬 Arrival'], ['testRadio', '📻 Test radio'], ['charter', '✈️ Charter job'],
      ['heli', '🚁 Heli'], ['blimp', '🎈 Blimp'], ['nasa', '✈️ NASA T-38'], ['lowlevel', '✈️ Low-level pair'],
      ['clear', '☀️ Clear'], ['clouds', '☁️ Clouds'], ['rain', '🌧 Rain'], ['storm', '⛈ Storm'], ['dust', '🌪 Dust'],
    ];
    const el = document.createElement('div');
    el.id = 'debug';
    el.innerHTML = '<h2>🔧 Debug</h2>' + rows.map(([k, label]) => `<button data-act="${k}">${label}</button>`).join('');
    el.style.display = 'none';
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { const a = e.target.dataset?.act; if (a) actions[a](); });
    addEventListener('keydown', (e) => {
      if (e.code === 'Backquote') el.style.display = el.style.display === 'none' ? 'grid' : 'none';
    });
  }

  return { actions };
}
