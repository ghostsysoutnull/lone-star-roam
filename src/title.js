// Boot title screen: Continue / New game. Logic is always built and exposed
// on __game.title (debug.js's "always built, only presentation gated" rule) —
// the harness auto-enters and never calls awaitChoice(), but the onboarding
// suite drives apply()/hasSave directly without a real click.
export class TitleScreen {
  constructor(gameplay, player, sky, spawnNewGame) {
    this.gameplay = gameplay;
    this.player = player;
    this.sky = sky;
    this.spawnNewGame = spawnNewGame; // () => places a fresh-game player (main.js's Austin spawn)
    this.el = document.getElementById('title');
    this.continueBtn = document.getElementById('title-continue');
    this.newGameBtn = document.getElementById('title-newgame');
    this.summaryEl = document.getElementById('title-summary');
    this._resolve = null;
    this.continueBtn.addEventListener('click', () => this._choose('continue'));
    this.newGameBtn.addEventListener('click', () => this._choose('new'));
  }

  get hasSave() {
    const s = this.gameplay.save;
    return !!(s.at || s.cities.length || s.landmarks.length || s.roses.length || s.bank);
  }

  summary() {
    const s = this.gameplay.save;
    return `${s.cities.length} cities · ${s.landmarks.length} landmarks · $${s.bank}`;
  }

  show() {
    this.continueBtn.style.display = this.hasSave ? '' : 'none';
    this.summaryEl.textContent = this.hasSave ? this.summary() : 'New save';
    this.el.style.display = 'flex';
  }

  hide() { this.el.style.display = 'none'; }

  // resolves with the applied choice ('continue' | 'new') once a button fires
  awaitChoice() {
    this.show();
    return new Promise((resolve) => { this._resolve = resolve; });
  }

  _choose(choice) {
    this.apply(choice);
    this.hide();
    this._resolve?.(choice);
    this._resolve = null;
  }

  // applies a choice directly — the seam the onboarding suite drives without a click
  apply(choice) {
    if (choice === 'continue' && this.gameplay.save.at) this.gameplay.applyAt(this.player, this.sky);
    else this.spawnNewGame();
  }
}
