// Boot title screen: 3 named save slots, Continue/New game/rename/delete per
// slot, plus the one-time intro card (New Player W2). Logic is always built
// and exposed on __game.title (debug.js's "always built, only presentation
// gated" rule) — the harness auto-enters and never calls awaitChoice(), but
// the onboarding suite drives apply()/select()/newGame()/rename()/delete()
// directly without a real click.
//
// Slot switching (New Player W4) is live, never a page reload — the harness
// can't survive one (its addInitScript wipes localStorage on every
// navigation, so a reload-based select() would be untestable and the hard
// requirement puts select/newGame/rename/delete here specifically so the
// suite can drive them). select() reloads gameplay.save in place (which
// rebuilds the mesh-backed visuals — see gameplay.js loadSlot) and re-applies
// every per-slot comfort setting + shop loadout through the same functions
// their keybinds/purchases call — hud.ui/compass, brands' module-level
// SCALE, and missions.arrowOn are all read once at construction, so a bare
// key swap would leave the live UI/perks showing the previous slot's values.
import { GEO, hAt } from './geo.js';
import { LANDMARKS } from './gameplay.js';
import { SPECIES } from './animals.js';
import { SLOT_COUNT, KEYS, slotKey, setActiveSlot, readSlotSummary, deleteSlot } from './slots.js';
import { applyGear } from './shop.js';

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
  constructor(gameplay, player, sky, spawnNewGame, home, { hud, brands, missions, dog }) {
    this.gameplay = gameplay;
    this.player = player;
    this.sky = sky;
    this.spawnNewGame = spawnNewGame; // () => places a fresh-game player (main.js's curated spot)
    this.home = home; // attract drift center for a fresh save ({x,z} — the curated spot)
    this.hud = hud; this.brands = brands; this.missions = missions; this.dog = dog; // W4: re-applied on every slot switch
    this.el = document.getElementById('title');
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
    this.renderSlots();
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
    this._finish('new');
  }

  // applies a choice directly — the seam the onboarding suite drives without a click
  apply(choice) {
    if (choice === 'continue' && this.gameplay.save.at) this.gameplay.applyAt(this.player, this.sky);
    else this.spawnNewGame();
  }

  // ---- New Player W4: named save slots ----

  // Row data for all 3 slots, including the 2 not currently live in
  // Gameplay — readSlotSummary reads their storage directly rather than
  // constructing a second Gameplay instance per slot.
  slots() {
    return Array.from({ length: SLOT_COUNT }, (_, i) => {
      const slot = i + 1;
      if (slot === this.gameplay.slot) {
        const s = this.gameplay.save;
        return { slot, active: true, empty: !this.hasSave, name: s.name };
      }
      const meta = readSlotSummary(slot);
      return meta ? { slot, active: false, empty: false, name: meta.name, cities: meta.cities, landmarks: meta.landmarks, bank: meta.bank }
                   : { slot, active: false, empty: true, name: null };
    });
  }

  // Switches the live game to a different slot in place. No-ops if already
  // there — a redundant call would still pay the mesh-rebuild cost.
  select(slot) {
    if (slot === this.gameplay.slot) return;
    this.gameplay.loadSlot(slot);
    this._afterLoad(slot);
  }

  // Re-applies everything that isn't gameplay.save itself but still depends
  // on which slot is active: the 4 comfort settings, shop perks/paint/dog
  // ownership (shop.js applyGear — otherwise a purchase in one slot would
  // visibly carry into another), and the mid-haul cargo mesh.
  _afterLoad(slot) {
    const ui = parseFloat(localStorage.getItem(slotKey(KEYS.uiScale, slot)));
    this.hud.ui = Number.isFinite(ui) ? Math.max(0.9, Math.min(2, ui)) : 1;
    this.hud.applyUiScale();
    const compassOn = localStorage.getItem(slotKey(KEYS.compass, slot)) !== 'off';
    if ((this.hud.compass.style.display !== 'none') !== compassOn) this.hud.toggleCompass();
    const arrowOn = localStorage.getItem(slotKey(KEYS.arrow, slot)) !== 'off';
    if (this.missions.arrowOn !== arrowOn) this.missions.toggleArrow();
    const brand = parseFloat(localStorage.getItem(slotKey(KEYS.brandScale, slot)));
    this.brands.setScale(Number.isFinite(brand) ? brand : 0.15);
    applyGear(this.gameplay.save, this.player, this.dog);
    this.missions.crate(this.missions.job?.phase === 'haul');
  }

  // Fresh slate for `slot` — clears any existing data there first (the row
  // UI only offers this on empty rows; direct callers get "New game"
  // semantics regardless of prior contents).
  newGame(slot, name) {
    deleteSlot(slot);
    setActiveSlot(slot);
    this.gameplay.loadSlot(slot);
    this.gameplay.save.name = name;
    this._afterLoad(slot);
    this.spawnNewGame();
    this.gameplay.persist();
  }

  rename(slot, name) {
    if (slot === this.gameplay.slot) { this.gameplay.save.name = name; this.gameplay.persist(); return; }
    const raw = localStorage.getItem(slotKey(KEYS.save, slot));
    if (!raw) return;
    const save = JSON.parse(raw);
    save.name = name;
    localStorage.setItem(slotKey(KEYS.save, slot), JSON.stringify(save));
  }

  delete(slot) {
    deleteSlot(slot);
    if (slot === this.gameplay.slot) { this.gameplay.loadSlot(slot); this._afterLoad(slot); } // reloads to now-empty defaults
  }

  // ---- row rendering (presentation only — the methods above are the seam) ----

  renderSlots() {
    this.slotsEl.innerHTML = '';
    for (const s of this.slots()) {
      const row = document.createElement('div');
      row.className = 'slot' + (s.active ? ' active' : '');
      if (s.empty) {
        const label = document.createElement('span');
        label.textContent = `Slot ${s.slot} — empty`;
        const btn = document.createElement('button');
        btn.textContent = 'New game';
        btn.addEventListener('click', () => this._newGameRow(s.slot));
        row.append(label, btn);
      } else {
        const label = document.createElement('span');
        label.textContent = `${s.name || 'Slot ' + s.slot} — ${s.active ? this.summary() : `${s.cities} cities · ${s.landmarks} landmarks · $${s.bank}`}`;
        const actions = document.createElement('span');
        actions.className = 'slot-actions';
        const play = document.createElement('button');
        play.textContent = s.active ? 'Continue' : 'Play';
        play.addEventListener('click', () => this._playRow(s.slot));
        const rename = document.createElement('button');
        rename.textContent = 'Rename';
        rename.className = 'slot-action-sm';
        rename.addEventListener('click', () => this._renameRow(s.slot, s.name || `Slot ${s.slot}`));
        const del = document.createElement('button');
        del.textContent = 'Delete';
        del.className = 'slot-action-sm';
        del.addEventListener('click', () => this._deleteRow(s.slot, s.name || `Slot ${s.slot}`));
        actions.append(play, rename, del);
        row.append(label, actions);
      }
      this.slotsEl.appendChild(row);
    }
  }

  _playRow(slot) {
    this.select(slot);
    this._choose(this.gameplay.save.at ? 'continue' : 'new');
  }

  _newGameRow(slot) {
    const name = prompt('Name this save:', `Slot ${slot}`);
    if (name === null) return; // cancelled
    this.newGame(slot, name.trim() || `Slot ${slot}`);
    if (this.needsIntro) this._showIntro();
    else this._finish('new');
  }

  _renameRow(slot, currentName) {
    const name = prompt('Rename save:', currentName);
    if (name === null || !name.trim()) return;
    this.rename(slot, name.trim());
    this.renderSlots();
  }

  _deleteRow(slot, name) {
    if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
    this.delete(slot);
    this.renderSlots();
  }
}
