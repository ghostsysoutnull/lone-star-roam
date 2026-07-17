// Boot title screen: Continue / New game over a live attract drift, plus the
// one-time intro card (New Player W2). Logic is always built and exposed on
// __game.title (debug.js's "always built, only presentation gated" rule) —
// the harness auto-enters and never calls awaitChoice(), but the onboarding
// suite drives apply()/finishIntro()/show() directly without a real click.
import { GEO, hAt } from './geo.js';
import { LANDMARKS } from './gameplay.js';
import { SPECIES } from './animals.js';

// Rotating "Did you know" pool — existing landmark/critter facts verbatim,
// plus census-derived county leaders (data does the talking; the only
// authored text is the two templates).
function buildFacts() {
  const facts = [
    ...LANDMARKS.map((l) => `${l.name} — ${l.fact}`),
    ...Object.values(SPECIES).filter((s) => s.fact).map((s) => `${s.name} — ${s.fact}`),
  ];
  const rows = Object.entries(GEO.ag || {});
  if (rows.length) {
    const top = (fn) => rows.reduce((a, b) => (fn(b[1]) > fn(a[1]) ? b : a));
    const [cattleCo, c] = top((r) => r.cattle);
    facts.push(`${cattleCo} County ran ${c.cattle.toLocaleString('en-US')} head of cattle in the 2022 census — the most in Texas.`);
    for (const crop of ['cotton', 'rice', 'corn', 'wheat', 'pecans']) {
      const [name, r] = top((x) => x.crops[crop]);
      if (r.crops[crop] > 0) facts.push(`${name} County led Texas in ${crop} — ${r.crops[crop].toLocaleString('en-US')} acres in the 2022 census.`);
    }
  }
  return facts;
}

export class TitleScreen {
  constructor(gameplay, player, sky, spawnNewGame, home) {
    this.gameplay = gameplay;
    this.player = player;
    this.sky = sky;
    this.spawnNewGame = spawnNewGame; // () => places a fresh-game player (main.js's curated spot)
    this.home = home; // attract drift center for a fresh save ({x,z} — the curated spot)
    this.el = document.getElementById('title');
    this.continueBtn = document.getElementById('title-continue');
    this.newGameBtn = document.getElementById('title-newgame');
    this.summaryEl = document.getElementById('title-summary');
    this.slotsEl = this.el.querySelector('.slots');
    this.introEl = document.getElementById('intro-card');
    this.factEl = document.getElementById('title-fact');
    this.onEnter = null; // main.js: welcome toast + tutorial.begin() — fires on every dismissal (boot and firstRun replays)
    this.onShow = null; // main.js: settings.refresh() — panel labels re-read live state each time the title comes up
    this.active = false; // main.js's loop runs the attract branch while true
    this.angle = 0;
    this.facts = buildFacts();
    this.factI = Math.floor(Math.random() * this.facts.length);
    this.factT = 0;
    this._resolve = null;
    this.continueBtn.addEventListener('click', () => this._choose('continue'));
    this.newGameBtn.addEventListener('click', () => this._choose('new'));
    document.getElementById('intro-start').addEventListener('click', () => this.finishIntro(false));
    document.getElementById('intro-skip').addEventListener('click', () => this.finishIntro(true));
  }

  get hasSave() {
    const s = this.gameplay.save;
    return !!(s.at || s.cities.length || s.landmarks.length || s.roses.length || s.bank);
  }

  get needsIntro() { return !this.gameplay.save.seen.intro; }

  summary() {
    const s = this.gameplay.save;
    return `${s.cities.length} cities · ${s.landmarks.length} landmarks · $${s.bank}`;
  }

  show() {
    this.continueBtn.style.display = this.hasSave ? '' : 'none';
    this.summaryEl.textContent = this.hasSave ? this.summary() : 'New save';
    this.factEl.textContent = '💡 ' + this.facts[this.factI];
    this.el.style.display = 'flex';
    document.body.classList.add('title-up'); // hides the HUD chrome (index.html rule)
    this.active = true;
    this.onShow?.();
  }

  hide() {
    this.el.style.display = 'none';
    document.body.classList.remove('title-up');
    this.active = false;
  }

  // Attract drift: slow aerial orbit around the resume spot (or the curated
  // home for a fresh save). Called from main.js's loop while active; returns
  // the coords the live-world systems (sky/scenery/cities/traffic) feed on.
  attract(dt, camera) {
    const c = this.gameplay.save.at ?? this.home;
    this.angle += dt * 0.02;
    const x = c.x + Math.sin(this.angle) * 55;
    const z = c.z + Math.cos(this.angle) * 55;
    const gy = hAt(c.x, c.z);
    camera.position.set(x, Math.max(gy, hAt(x, z)) + 32, z);
    camera.lookAt(c.x, gy + 6, c.z);
    this.factT += dt;
    if (this.factT > 9) { this.factT = 0; this.rotateFact(); }
    return { x, z };
  }

  rotateFact() {
    this.factI = (this.factI + 1) % this.facts.length;
    this.factEl.textContent = '💡 ' + this.facts[this.factI];
  }

  // resolves with the applied choice ('continue' | 'new') once the flow ends
  awaitChoice() {
    this.show();
    return new Promise((resolve) => { this._resolve = resolve; });
  }

  _choose(choice) {
    this.apply(choice);
    if (choice === 'new' && this.needsIntro) return this._showIntro();
    this._finish(choice);
  }

  _finish(choice) {
    this.hide();
    this.onEnter?.();
    this._resolve?.(choice);
    this._resolve = null;
  }

  // Concept card replaces the slot rows; the attract drift keeps running behind
  _showIntro() {
    this.slotsEl.style.display = 'none';
    this.newGameBtn.style.display = 'none';
    this.introEl.style.display = 'block';
  }

  // Start (skip=false): intro seen, tips stay armed. Skip intro & tips
  // (skip=true): seen.all silences every tip and future first-encounter hint
  // for this save — the W3 Guide keeps it all readable, so it's never a trap.
  finishIntro(skip) {
    const seen = this.gameplay.save.seen;
    seen.intro = true;
    if (skip) seen.all = true;
    this.gameplay.persist();
    this.introEl.style.display = 'none';
    this.slotsEl.style.display = '';
    this.newGameBtn.style.display = '';
    this._finish('new');
  }

  // applies a choice directly — the seam the onboarding suite drives without a click
  apply(choice) {
    if (choice === 'continue' && this.gameplay.save.at) this.gameplay.applyAt(this.player, this.sky);
    else this.spawnNewGame();
  }
}
