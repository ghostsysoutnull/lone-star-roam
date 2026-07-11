// Playtest debug menu — gated behind ?debug=1 so the public build stays
// honest. The actions are always constructed (the verify suite drives them
// directly through __game.debug); only the panel and its backquote keybinding
// exist when the URL asks for them.
import { chapelSitesNear } from './world.js';
import { EROCK } from './haunts.js';

const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];
const BRIDGE = LL(30.2617, -97.7447); // Congress Ave — the bat show

export function initDebug({ player, sky, haunts, ufo, hud, aviation }) {
  const tp = (x, z, heading) => {
    player.pos.set(x, 0, z);
    player.speed = 0; player.vy = 0;
    if (heading != null) player.heading = heading;
  };
  const setWeather = (name) => { sky.weather = sky.target = name; sky.blend = 1; sky.nextPick = 120; sky.forecast = null; };

  const actions = {
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
  };
  for (const w of ['clear', 'clouds', 'rain', 'storm', 'dust']) actions[w] = () => setWeather(w);

  if (new URLSearchParams(location.search).has('debug')) {
    const rows = [
      ['day', '🌞 Day'], ['night', '🌙 Night'], ['midnight', '🕛 Midnight'],
      ['hauntCemetery', '👻 Haunt cemetery'], ['ghostFires', '🔥 Ghost fires'],
      ['saucer', '🛸 Saucer'], ['formation', '✨ Lubbock lights'], ['bats', '🦇 Bat show'],
      ['departure', '🛫 Departure'], ['arrival', '🛬 Arrival'],
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
