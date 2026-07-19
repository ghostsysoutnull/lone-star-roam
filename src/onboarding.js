// Staged first-run tutorial tips (New Player W2) + contextual first-encounter
// hints and the Guide (W3). One Tutorial instance,
// ticked from main.js's loop; every tip fires once per save via save.seen
// keys, and save.seen.all (the intro card's Skip, or the pause screen's skip
// button) silences the whole stream. begin() arms it at game entry via
// title.onEnter — the harness never arms it, so suites drive update()
// explicitly. TIPS order is priority, not chronology: one tip per fire,
// spaced by a cooldown, first eligible wins.
export const TIPS = [
  { key: 'tipV', when: (t) => t > 10,
    msg: '💡 Press V to change how you travel — Drive, Fly, Walk' },
  { key: 'tipMap', when: (t, c) => c.cities > 0,
    msg: '💡 First city! Press M for the map — every visit earns a star' },
  { key: 'tipCollect', when: (t, c) => c.landmarks + c.roses + c.species > 0,
    msg: '💡 First find! Press P — travel, jobs and the shop live there' },
  { key: 'tipHelp', when: (t) => t > 120,
    msg: '💡 Press H anytime for the full controls and your scorecard' },
  // repeats (Controls Bar wave): same lesson, once more, later — for players
  // who missed or ignored the first showing
  { key: 'tipCollect2', when: (t, c) => t > 240 && c.landmarks + c.roses + c.species > 0,
    msg: '💡 Reminder: press P for travel, jobs and the shop' },
  { key: 'tipHelp2', when: (t) => t > 480,
    msg: '💡 Still finding your way? Press H for the full controls and your scorecard' },
];

// Contextual first-encounter hints (W3): event-driven where TIPS are
// time/count-driven, same seen keys + cooldown, evaluated before TIPS so the
// contextual moment wins over a generic timer. Signals arrive from main.js
// (npc/dusk/apron per frame, cityEdge/band from the 12 Hz hud block).
// hintCity absorbs tipMap (`also`): both teach M, one lesson, at the earlier
// city-edge moment — and the edge signal covers every path into a city, so
// tipMap can never fire first.
export const HINTS = [
  { key: 'hintNpc', when: (s) => s.npc,
    msg: "💡 Someone's out here — walk up and press E to say howdy" },
  { key: 'hintCity', when: (s) => s.cityEdge, also: ['tipMap'],
    msg: '💡 First city ahead — press M for the map; every city visited earns a star' },
  { key: 'hintDusk', when: (s) => s.dusk,
    msg: '💡 Dusk settles. Texas legends wake after dark — mind the roadside' },
  // band above airport: a state-line crossing is the rarer moment, and band
  // towns like Hobbs sit on airfield footprints — the crossing hint wins the tie
  { key: 'hintBand', when: (s) => s.band,
    msg: "💡 You've crossed the state line — your progress out here lives in the Passport" },
  { key: 'hintAirport', when: (s) => s.apron,
    msg: '💡 An airfield — press V to take to the sky; a runway makes the smoothest start' },
  { key: 'hintBoat', when: (s) => s.water,
    msg: "💡 That's open water ahead — press V and the truck becomes a boat" },
];

export class Tutorial {
  constructor(gameplay, toast) {
    this.gameplay = gameplay;
    this.toast = toast;
    this.t = 0;
    this.cd = 0;
    this.active = false;
    this.fired = []; // keys fired this session, in order (the onboarding suite asserts order)
    this.TIPS = TIPS; this.HINTS = HINTS; // the live tables, for the suite + debug
  }

  get seen() { return this.gameplay.save.seen; }
  get pending() {
    return this.active && !this.seen.all
      && [...HINTS, ...TIPS].some((x) => !this.seen[x.key]);
  }

  begin() { this.active = true; this.t = 0; this.cd = 0; }

  skip() {
    this.seen.all = true;
    this.gameplay.persist();
  }

  fire(entry) {
    this.seen[entry.key] = true;
    for (const k of entry.also || []) this.seen[k] = true;
    this.gameplay.persist();
    this.fired.push(entry.key);
    this.toast(entry.msg);
    this.cd = 4;
  }

  update(dt, sig = null) {
    if (!this.active || this.seen.all) return;
    this.t += dt;
    this.cd -= dt;
    if (this.cd > 0) return;
    if (sig) {
      for (const h of HINTS) {
        if (this.seen[h.key] || !h.when(sig)) continue;
        return this.fire(h);
      }
    }
    const c = this.gameplay.counts();
    for (const tip of TIPS) {
      if (this.seen[tip.key] || !tip.when(this.t, c)) continue;
      return this.fire(tip);
    }
  }
}

const BAR_STARTS_MAX = 6;   // shows on this many game starts, then never again
const BAR_SECONDS = 180;    // visible for this long into each of those sessions

// Controls bar: a bottom-center Esc/P/H legend for a player's first few
// sessions — separate from Tutorial above since it's session-count/real-time
// driven chrome, not a one-shot per-save tip. begin() arms it at the same
// title.onEnter site as Tutorial.begin(); update() ticks alongside
// tutorial.update() in main.js's loop. Dismiss is session-only: closing it
// still counts that start toward BAR_STARTS_MAX, so it returns next session.
export class ControlsBar {
  constructor(gameplay, hud) {
    this.gameplay = gameplay;
    this.hud = hud;
    this.t = 0;
    this.dismissed = false;
  }

  get save() { return this.gameplay.save.seen; }
  get eligible() { return (this.save.barStarts ?? 0) <= BAR_STARTS_MAX; }

  begin() {
    this.save.barStarts = (this.save.barStarts ?? 0) + 1;
    this.gameplay.persist();
    this.t = 0;
    this.dismissed = false;
    this.hud.controlsBar(this.eligible);
  }

  dismiss() {
    this.dismissed = true;
    this.hud.controlsBar(false);
  }

  update(dt) {
    if (this.dismissed || !this.eligible) return;
    this.t += dt;
    if (this.t > BAR_SECONDS) { this.dismissed = true; this.hud.controlsBar(false); }
  }
}

// Guide (W3): read-only replay of everything first-run teaches, inside the
// help panel. The card copy is cloned from #intro-card (one source of truth,
// minus its buttons) and the tip/hint lists come from the live tables above —
// the Guide can never drift from what actually fires. Re-presents, never
// re-arms: no save.seen access anywhere here.
export function buildGuide() {
  const list = document.getElementById('guide-list');
  const card = document.getElementById('intro-card').cloneNode(true);
  card.removeAttribute('id');
  card.className = 'guide-card';
  card.querySelector('.row').remove();
  card.style.display = 'block';
  list.appendChild(card);
  for (const { msg } of [...TIPS, ...HINTS]) {
    const div = document.createElement('div');
    div.textContent = msg;
    list.appendChild(div);
  }
  const btn = document.getElementById('guide-toggle');
  btn.addEventListener('click', () => {
    const open = list.style.display !== 'block';
    list.style.display = open ? 'block' : 'none';
    btn.textContent = (open ? '📖 Guide ▾' : '📖 Guide ▸') + ' — the intro & every tip, re-readable';
  });
}
