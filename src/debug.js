// Playtest debug menu — gated behind ?debug=1 so the public build stays
// honest. The actions are always constructed (the verify suite drives them
// directly through __game.debug); only the panel and its backquote keybinding
// exist when the URL asks for them.
import { chapelSitesNear } from './world.js';
import { EROCK } from './haunts.js';
import { hAt, neighborStateAt } from './geo.js';
import { releaseOn } from './turtles.js';
import { TOURS } from './tours.js';
import { AIRPORTS } from './airports.js';
import { KEYS, slotKey } from './slots.js';

const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];
const BRIDGE = LL(30.2617, -97.7447); // Congress Ave — the bat show

// Hand-authored orientation tags for the airport picker, display-only (not
// game data — never read outside this menu): a compass region for every
// field (Texas fields relative to the state, band fields relative to
// Texas), plus a real neighbor-state code for the 6 band fields.
const AIRPORT_TAG = {
  DFW: 'N', DAL: 'N', IAH: 'SE', HOU: 'SE', AUS: 'S', SAT: 'S', ELP: 'W',
  LBB: 'W', AMA: 'NW', MAF: 'W', CRP: 'SE', HRL: 'S', LRD: 'S', ABI: 'W', ACT: 'N', TYR: 'NE',
  MRF: 'W', TRL: 'SW', SSS: 'NW', ARM: 'S', LBJ: 'S',
  SHV: 'E', TXK: 'NE', CVN: 'W', HOB: 'W', CVS: 'W', BAD: 'E',
};
const AIRPORT_STATE = { SHV: 'LA', TXK: 'AR', CVN: 'NM', HOB: 'NM', CVS: 'NM', BAD: 'LA' };

export function initDebug({ player, sky, haunts, ufo, hud, aviation, radio, heli, blimp, military, missions, animals, gameplay, title, tutorial, perf }) {
  const tp = (x, z, heading) => {
    player.pos.set(x, 0, z);
    player.speed = 0; player.vy = 0;
    if (heading != null) player.heading = heading;
  };
  const setWeather = (name) => { sky.weather = sky.target = name; sky.blend = 1; sky.nextPick = 120; sky.forecast = null; };

  const actions = {
    _heliIdx: 0, // cycles medical→news→coastguard→army→… on repeated 🚁 Heli presses, instead of a random pick
    day() { sky.t = 0.35; haunts.force = false; },
    // stages the true first-run path: empty seen flags + the title over the
    // attract drift — New game then walks the real card → tips sequence
    firstRun() {
      gameplay.save.seen = {};
      gameplay.persist();
      tutorial.active = false;
      title.show();
      hud.toast('🌱 First run staged — choose New game');
    },
    // W3: stage the hint path in-game — fresh seen flags + armed tutorial, no
    // title round-trip (firstRun is the card path; this is the hint path).
    // Tour spots chain it so every hint spot guarantees its subject fires.
    hintsReset() {
      gameplay.save.seen = {};
      gameplay.persist();
      tutorial.begin();
      hud.toast('🌱 Hints re-armed — approach the subject');
    },
    // W4: seeds slot 2 occupied + slot 3 empty so the Tours spot shows every
    // row kind at once — active/occupied, other-occupied, empty — without
    // touching the real (active) save.
    slotsPreview() {
      localStorage.setItem(slotKey(KEYS.save, 2), JSON.stringify({
        name: 'Playtest', cities: ['Austin', 'Waco'], landmarks: ['The Alamo'], roses: [], bank: 40, seen: { all: true },
      }));
      for (const base of Object.values(KEYS)) localStorage.removeItem(slotKey(base, 3));
      title.show();
      hud.toast('💾 Slots staged — slot 2 occupied, slot 3 empty');
    },
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
    // tour-spot forcers: guarantee probability-gated events on arrival
    turtleMorning() {
      // jump the date to the next seeded release day — moon phase rides along,
      // world generation and saves never read the day counter
      let d = Math.floor(sky.days) + 1;
      const stop = d + 100; // ODDS 0.45 → expected ~2 tries; cap is pure paranoia
      while (!releaseOn(d) && d < stop) d++;
      sky.days = d;
      sky.t = 0.26; // inside the release window
      hud.toast('🐢 Jumped to the next release morning');
    },
    treasureNight() {
      haunts.force = true; // the treasure gate honors force (haunts.js); day() clears it
      actions.night();
      hud.toast('✨ The gold light rides the swell tonight');
    },
    bear() {
      // debug-only conjure through the real animal machinery — the natural
      // 12%-per-chunk rarity is untouched
      animals.forceSpawn('blackbear', player.pos.x + 30, player.pos.z);
      hud.toast('🐻 A bear in the pines — he spooks inside 26 units');
    },
    bandWild() {
      // one action, four Tours spots — the species follows whichever
      // neighbor state the player is actually standing in
      const ns = neighborStateAt(player.pos.x, player.pos.z);
      const species = { LA: 'gator', AR: 'blackbear', OK: 'coyote', NM: 'roadrunner' }[ns] ?? 'deer';
      animals.forceSpawn(species, player.pos.x + 20, player.pos.z);
      hud.toast(`🐾 Band wildlife forced — ${species} (${ns ?? 'TX'})`);
    },
    gotoAirport(id) {
      const a = AIRPORTS.find((x) => x.id === id);
      if (!a) return;
      player.setMode('FLY');
      tp(a.gate[0], a.gate[1]);
      player.pos.y = Math.max(hAt(a.gate[0], a.gate[1]) + 6, 6);
      hud.toast(`✈️ ${a.name}${a.band ? ' — band' : ''}${a.military ? ' (military)' : ''}`);
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
    // Energy W6: inject a pinned energy run (forceEnergy clears any active
    // job first, so Tours spots can always chain these)
    crudeJob() { missions.forceEnergy('crude'); },
    fuelJob() { missions.forceEnergy('fuel'); },
    bladeJob() { missions.forceEnergy('blade'); },
    saveQuitToTitle() {
      gameplay.snapshotAt(player, sky);
      gameplay.persist();
      location.reload();
    },
  };
  for (const w of ['clear', 'clouds', 'rain', 'storm', 'dust']) actions[w] = () => setWeather(w);

  // Tours: teleport + staging for one tours.js spot. Always constructed (the
  // verify suite validates the data and drives visit()); the panel below stays
  // URL-gated. Staging order matters: mode/time/weather first, then the
  // teleport, then any chained action — an action that teleports (cemetery,
  // ghost fires) gets the last word on position.
  const visit = (s) => {
    if (s.mode) player.setMode(s.mode);
    if (s.time != null) sky.t = s.time;
    if (s.weather) setWeather(s.weather);
    tp(s.x, s.z, s.heading);
    if (s.mode === 'FLY') player.pos.y = Math.max(hAt(s.x, s.z) + 6, 6);
    if (s.act) actions[s.act]();
    hud.toast(`${s.label}${s.note ? ' — ' + s.note : ''}`);
  };

  if (new URLSearchParams(location.search).has('debug')) {
    const sections = [
      ['Time', [['day', '🌞 Day'], ['night', '🌙 Night'], ['midnight', '🕛 Midnight']]],
      ['Haunts', [['hauntCemetery', '👻 Cemetery'], ['ghostFires', '🔥 Ghost fires'],
        ['saucer', '🛸 Saucer'], ['formation', '✨ Lubbock lights'], ['bats', '🦇 Bats']]],
      ['Aircraft', [['departure', '🛫 Departure'], ['arrival', '🛬 Arrival'],
        ['testRadio', '📻 Test radio'], ['charter', '✈️ Charter'],
        ['heli', '🚁 Heli'], ['blimp', '🎈 Blimp'],
        ['nasa', '✈️ NASA T-38'], ['lowlevel', '✈️ Low-level']]],
      ['Weather', [['clear', '☀️ Clear'], ['clouds', '☁️ Clouds'], ['rain', '🌧 Rain'],
        ['storm', '⛈ Storm'], ['dust', '🌪 Dust']]],
      ['Energy jobs', [['crudeJob', '🛢 Crude haul'], ['fuelJob', '⛽ Fuel run'], ['bladeJob', '🌀 Blade load']]],
      ['Boot', [['saveQuitToTitle', '🚪 Save & quit to title']]],
    ];
    const actionsHtml = sections.map(([title, rows]) =>
      `<div class="debug-section"><h3>${title}</h3><div class="debug-rows">` +
      rows.map(([k, label]) => `<button data-act="${k}">${label}</button>`).join('') +
      '</div></div>').join('');
    // Airports: jump to any of the 27 fields (Texas + band, incl. military)
    // by gate — a flat dropdown reads better than 27 individual buttons.
    const airportGroups = [['Texas', AIRPORTS.filter((a) => !a.band)], ['Band', AIRPORTS.filter((a) => a.band)]];
    const airportsHtml = '<div class="debug-section"><h3>Airports</h3>' +
      '<select id="debug-airport"><option value="">✈️ Jump to airport…</option>' +
      airportGroups.map(([label, list]) =>
        `<optgroup label="${label}">` +
        list.map((a) => {
          const tag = AIRPORT_TAG[a.id] ?? '?';
          const suffix = AIRPORT_STATE[a.id] ? `${tag} · ${AIRPORT_STATE[a.id]}` : tag;
          return `<option value="${a.id}">${a.name} (${suffix})${a.military ? ' · mil' : ''}</option>`;
        }).join('') +
        '</optgroup>').join('') +
      '</select></div>';
    // Tours tab: one <details> per track (newest first), one nested per wave.
    // The list only grows track by track, so everything starts collapsed and
    // the panel scrolls; generic actions keep their own tab for instant access.
    const toursHtml = TOURS.map((tr, ti) =>
      `<details class="debug-track"><summary>${tr.track}</summary>` +
      tr.waves.map((w, wi) =>
        `<details class="debug-wave"><summary>${w.wave}</summary><div class="debug-rows">` +
        w.spots.map((s, si) =>
          `<button data-tour="${ti}.${wi}.${si}" title="${(s.note ?? '').replace(/"/g, '&quot;')}">${s.label}</button>`).join('') +
        '</div></details>').join('') +
      '</details>').join('');
    const el = document.createElement('div');
    el.id = 'debug';
    el.innerHTML = '<h2>🔧 Debug</h2><div id="debug-state"></div>' +
      '<div id="debug-tabs"><button class="active" data-tab="actions">⚡ Actions</button><button data-tab="tours">🗺️ Tours</button><button data-tab="perf">📈 Perf</button></div>' +
      `<div data-pane="actions">${actionsHtml}${airportsHtml}</div><div data-pane="tours" style="display:none">${toursHtml}</div>` +
      '<div data-pane="perf" style="display:none"><div id="debug-perf"></div><button id="debug-perf-reset">↺ Reset max</button></div>';
    el.style.display = 'none';
    document.body.appendChild(el);
    const stateEl = el.querySelector('#debug-state');
    const refreshState = () => {
      if (el.style.display === 'none') return;
      stateEl.textContent = `${sky.clockString()} · ${sky.weatherName()} · ${player.mode}`;
    };
    el.addEventListener('click', (e) => {
      const d = e.target.dataset ?? {};
      if (d.act) { actions[d.act](); refreshState(); }
      else if (d.tour) {
        const [ti, wi, si] = d.tour.split('.').map(Number);
        visit(TOURS[ti].waves[wi].spots[si]);
        refreshState();
      } else if (d.tab) {
        for (const b of el.querySelectorAll('#debug-tabs button')) b.classList.toggle('active', b === e.target);
        for (const p of el.querySelectorAll('[data-pane]')) p.style.display = p.dataset.pane === d.tab ? '' : 'none';
      }
    });
    el.querySelector('#debug-airport').addEventListener('change', (e) => {
      if (!e.target.value) return;
      actions.gotoAirport(e.target.value);
      e.target.value = '';
      refreshState();
    });
    addEventListener('keydown', (e) => {
      if (e.code === 'Backquote') { el.style.display = el.style.display === 'none' ? 'grid' : 'none'; refreshState(); }
    });
    // Perf tab: live snapshot at 2 Hz while the pane is showing. Systems sorted
    // by avg cost; ms are meaningless under the harness fake clock (see perf.js)
    // — this readout is for a real browser, the suite asserts the data layer.
    const perfEl = el.querySelector('#debug-perf');
    const perfPane = el.querySelector('[data-pane="perf"]');
    const refreshPerf = () => {
      if (el.style.display === 'none' || perfPane.style.display === 'none') return;
      const s = perf.snapshot();
      const rows = Object.entries(s.laps).sort((a, b) => b[1].avg - a[1].avg)
        .map(([k, L]) => `<tr><td>${k}</td><td>${L.avg.toFixed(2)}</td><td>${L.max.toFixed(1)}</td></tr>`).join('');
      perfEl.innerHTML =
        `<div>${s.fps.toFixed(0)} fps · frame ${s.frameMs.avg.toFixed(1)} ms avg / ${s.frameMs.max.toFixed(0)} max` +
        (s.memoryMB != null ? ` · heap ${s.memoryMB} MB` : '') + '</div>' +
        `<div>draws ${s.render.calls} · tris ${(s.render.triangles / 1000).toFixed(0)}k · geo ${s.render.geometries} · tex ${s.render.textures} · prog ${s.render.programs}</div>` +
        `<table><tr><th>system</th><th>avg ms</th><th>max</th></tr>${rows}</table>`;
    };
    el.querySelector('#debug-perf-reset').addEventListener('click', () => { perf.resetMax(); refreshPerf(); });
    setInterval(refreshPerf, 500);
    setInterval(refreshState, 500);
  }

  return { actions, tours: TOURS, visit, airportTags: AIRPORT_TAG, airportStates: AIRPORT_STATE };
}
