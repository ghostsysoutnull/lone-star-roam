// Staged first-run tutorial tips (New Player W2). One Tutorial instance,
// ticked from main.js's loop; every tip fires once per save via save.seen
// keys, and save.seen.all (the intro card's Skip, or the pause screen's skip
// button) silences the whole stream. begin() arms it at game entry via
// title.onEnter — the harness never arms it, so suites drive update()
// explicitly. TIPS order is priority, not chronology: one tip per fire,
// spaced by a cooldown, first eligible wins.
const TIPS = [
  { key: 'tipV', when: (t) => t > 10,
    msg: '💡 Press V to change how you travel — Drive, Fly, Walk' },
  { key: 'tipMap', when: (t, c) => c.cities > 0,
    msg: '💡 First city! Press M for the map — every visit earns a star' },
  { key: 'tipCollect', when: (t, c) => c.landmarks + c.roses + c.species > 0,
    msg: '💡 First find! Press P — travel, jobs and the shop live there' },
  { key: 'tipHelp', when: (t) => t > 120,
    msg: '💡 Press H anytime for the full controls and your scorecard' },
];

export class Tutorial {
  constructor(gameplay, toast) {
    this.gameplay = gameplay;
    this.toast = toast;
    this.t = 0;
    this.cd = 0;
    this.active = false;
    this.fired = []; // keys fired this session, in order (the onboarding suite asserts order)
  }

  get seen() { return this.gameplay.save.seen; }
  get pending() { return this.active && !this.seen.all && TIPS.some((tip) => !this.seen[tip.key]); }

  begin() { this.active = true; this.t = 0; this.cd = 0; }

  skip() {
    this.seen.all = true;
    this.gameplay.persist();
  }

  update(dt) {
    if (!this.active || this.seen.all) return;
    this.t += dt;
    this.cd -= dt;
    if (this.cd > 0) return;
    const c = this.gameplay.counts();
    for (const tip of TIPS) {
      if (this.seen[tip.key] || !tip.when(this.t, c)) continue;
      this.seen[tip.key] = true;
      this.gameplay.persist();
      this.fired.push(tip.key);
      this.toast(tip.msg);
      this.cd = 8;
      return;
    }
  }
}
