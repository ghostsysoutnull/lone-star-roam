// All-synthesized WebAudio: engine, wind, rain, thunder, collect chimes,
// night crickets. No audio files. Context starts lazily on the first
// keypress (browser autoplay policy). N toggles mute.
export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.muted = false;
    const boot = () => { this.init(); removeEventListener('keydown', boot); };
    addEventListener('keydown', boot);
  }

  init() {
    if (this.ctx) return;
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    const chan = () => { const g = ctx.createGain(); g.gain.value = 0; g.connect(this.master); return g; };

    // --- engine: saw + sub through a lowpass, pitch tracks speed ---
    this.engineGain = chan();
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    // prop AM stage: an LFO chops the engine tone at blade frequency in FLY mode
    this.propMod = ctx.createGain();
    this.propMod.gain.value = 1;
    this.engineFilter.connect(this.propMod).connect(this.engineGain);
    this.propLfo = ctx.createOscillator();
    this.propLfo.type = 'sine';
    this.propLfo.frequency.value = 18;
    this.propDepth = ctx.createGain();
    this.propDepth.gain.value = 0; // 0 in drive; ~0.45 in fly
    this.propLfo.connect(this.propDepth).connect(this.propMod.gain);
    this.propLfo.start();
    this.engOsc = ctx.createOscillator();
    this.engOsc.type = 'sawtooth';
    this.engOsc.frequency.value = 50;
    this.engSub = ctx.createOscillator();
    this.engSub.type = 'square';
    this.engSub.frequency.value = 25;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.5;
    this.engOsc.connect(this.engineFilter);
    this.engSub.connect(subGain).connect(this.engineFilter);
    this.engOsc.start(); this.engSub.start();

    // --- shared looping noise buffer for wind & rain ---
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noiseSrc = (filterType, freq, q) => {
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = filterType; f.frequency.value = freq; f.Q.value = q;
      src.connect(f); src.start();
      return f;
    };
    this.windGain = chan();
    noiseSrc('bandpass', 500, 0.6).connect(this.windGain);
    this.rainGain = chan();
    noiseSrc('highpass', 1900, 0.4).connect(this.rainGain);

    // --- crickets: pulsed high tone at night ---
    this.cricketGain = chan();
    const cricket = ctx.createOscillator();
    cricket.type = 'square';
    cricket.frequency.value = 4300;
    const pulse = ctx.createGain();
    pulse.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 13;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.5;
    lfo.connect(lfoAmt).connect(pulse.gain);
    cricket.connect(pulse).connect(this.cricketGain);
    cricket.start(); lfo.start();

    // --- theremin: eerie wavering tone, fades in near a UFO ---
    this.ufoGain = chan();
    const ufoOsc = ctx.createOscillator();
    ufoOsc.type = 'sine';
    ufoOsc.frequency.value = 620;
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vibAmt = ctx.createGain();
    vibAmt.gain.value = 40;
    vib.connect(vibAmt).connect(ufoOsc.frequency);
    ufoOsc.connect(this.ufoGain);
    ufoOsc.start(); vib.start();

    this.sfx = ctx.createGain();
    this.sfx.gain.value = 1;
    this.sfx.connect(this.master);
  }

  toggleMute() {
    if (!this.ctx) return false;
    this.muted = !this.muted;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  // called every frame from the game loop
  update(player, atmos) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const spd = Math.abs(player.speed);
    const set = (param, v, tc = 0.08) => param.setTargetAtTime(v, t, tc);

    // near a UFO: engine sputters (the Levelland effect) and the theremin swells
    const ufo = atmos.ufo || 0;
    set(this.ufoGain.gain, ufo * 0.045, 0.3);
    const sputter = ufo > 0 && Math.random() < ufo * 0.4 ? 0.12 : 1;

    if (player.mode === 'DRIVE') {
      if (this.engOsc.type !== 'sawtooth') this.engOsc.type = 'sawtooth';
      set(this.propDepth.gain, 0, 0.15); // no prop chop in the truck
      set(this.engOsc.frequency, 42 + spd * 2.3);
      set(this.engSub.frequency, 21 + spd * 1.15);
      set(this.engineFilter.frequency, 260 + spd * 10);
      set(this.engineGain.gain, (spd > 0.5 ? 0.05 + (spd / 46) * 0.075 : 0.03) * sputter, 0.03);
    } else if (player.mode === 'FLY') {
      // prop plane: rounder tone chopped by blade-frequency AM ("putt-putt")
      if (this.engOsc.type !== 'triangle') this.engOsc.type = 'triangle';
      set(this.propDepth.gain, 0.45, 0.15);
      set(this.propLfo.frequency, 13 + spd * 0.14); // blades speed up with throttle
      set(this.engOsc.frequency, 95 + spd * 0.5);
      set(this.engSub.frequency, 47 + spd * 0.25);
      set(this.engineFilter.frequency, 500 + spd * 3);
      set(this.engineGain.gain, 0.07 + (spd / 150) * 0.05);
    } else {
      set(this.engineGain.gain, 0);
    }

    const windSpd = player.mode === 'FLY' ? spd / 150 : spd / 60;
    set(this.windGain.gain, Math.min(0.14, windSpd * 0.1 + (atmos.wind - 1) * 0.02), 0.3);
    set(this.rainGain.gain, (atmos.rain || 0) * 0.05, 0.5);
    set(this.cricketGain.gain, atmos.night * (1 - Math.min(1, atmos.rain || 0)) * 0.012, 0.5);
  }

  // one-shot helpers ---------------------------------------------------------
  note(freq, when, dur, gain = 0.12, type = 'sine') {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    const t0 = ctx.currentTime + when;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(this.sfx);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  chime(kind) {
    if (!this.ctx || this.muted) return;
    const SONGS = {
      city: [[523, 0, 0.35], [659, 0.09, 0.35], [784, 0.18, 0.4], [1047, 0.27, 0.6]],
      landmark: [[392, 0, 0.5], [523, 0.14, 0.5], [659, 0.28, 0.5], [784, 0.42, 0.9]],
      rose: [[1319, 0, 0.18, 0.07], [1760, 0.07, 0.25, 0.07]],
      species: [[587, 0, 0.25], [740, 0.1, 0.25], [880, 0.2, 0.45]],
      dialog: [[660, 0, 0.1, 0.06]],
      county: [[784, 0, 0.15, 0.06], [988, 0.08, 0.22, 0.06]],
      load: [[220, 0, 0.12, 0.12], [330, 0.1, 0.2, 0.08], [440, 0.2, 0.3, 0.08]],
      cash: [[880, 0, 0.1, 0.08], [1109, 0.08, 0.1, 0.08], [1319, 0.16, 0.12, 0.09], [1760, 0.24, 0.45, 0.1]],
    };
    for (const [f, w, d, g] of SONGS[kind] || []) this.note(f, w, d, g ?? 0.1, 'triangle');
  }

  // footstep: soft thump + spur jingle every other stride
  step() {
    if (!this.ctx || this.muted) return;
    this.note(75, 0, 0.07, 0.09, 'sine');
    this.stepAlt = !this.stepAlt;
    if (this.stepAlt) {
      this.note(5400, 0.015, 0.05, 0.018, 'square');
      this.note(6700, 0.03, 0.04, 0.012, 'square');
    }
  }

  // traffic honk: cars give a friendly double-beep dyad; semis lean on the air
  // horn; the player's own horn is a brighter major-third tap
  honk(type) {
    if (!this.ctx || this.muted) return;
    if (type === 'semi') {
      for (const f of [220, 277]) this.note(f, 0, 0.65, 0.05, 'sawtooth');
    } else if (type === 'player') {
      for (const start of [0, 0.14]) {
        this.note(392, start, 0.12, 0.06, 'sawtooth');
        this.note(494, start, 0.12, 0.05, 'sawtooth');
      }
    } else {
      for (const start of [0, 0.16]) {
        this.note(345, start, 0.11, 0.045, 'sawtooth');
        this.note(435, start, 0.11, 0.035, 'sawtooth');
      }
    }
  }

  // lonesome coyote: swoop up, quavering hold, fall away into the dark
  howl() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const t0 = ctx.currentTime + 0.05;
    o.frequency.setValueAtTime(340, t0);
    o.frequency.exponentialRampToValueAtTime(680, t0 + 0.45);
    o.frequency.setValueAtTime(680, t0 + 0.95);
    o.frequency.exponentialRampToValueAtTime(420, t0 + 1.8);
    const vib = ctx.createOscillator(); // the quaver
    vib.frequency.value = 6.5;
    const vibG = ctx.createGain();
    vibG.gain.value = 14;
    vib.connect(vibG).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.035, t0 + 0.3);
    g.gain.setValueAtTime(0.035, t0 + 1.2);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 2.0);
    o.connect(g).connect(this.sfx);
    o.start(t0); vib.start(t0);
    o.stop(t0 + 2.1); vib.stop(t0 + 2.1);
  }

  // rattlesnake: pulsed high-frequency shaker — noise chopped at ~22 Hz
  rattle() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.02;
    const len = ctx.sampleRate * 1.3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 4400; f.Q.value = 0.8;
    const chop = ctx.createOscillator(); // amplitude chop = the rattle pulse
    chop.type = 'square'; chop.frequency.value = 22;
    const chopG = ctx.createGain();
    chopG.gain.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.045, t0 + 0.1);
    g.gain.setValueAtTime(0.045, t0 + 1.0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.3);
    chop.connect(chopG).connect(g.gain);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t0); chop.start(t0);
    src.stop(t0 + 1.35); chop.stop(t0 + 1.35);
  }

  // wild turkey: a quick descending warble
  gobble() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    const t0 = ctx.currentTime + 0.02;
    const steps = [300, 210, 320, 190, 280, 170, 240];
    steps.forEach((f, i) => o.frequency.setValueAtTime(f, t0 + i * 0.075));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.05, t0 + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6);
    o.connect(g).connect(this.sfx);
    o.start(t0); o.stop(t0 + 0.65);
  }

  // freight horn: two-note minor chord, long-long blast
  trainHorn() {
    if (!this.ctx || this.muted) return;
    for (const start of [0, 1.1]) {
      for (const f of [311, 370, 466]) { // Eb-F#-Bb — the classic K5LA-ish chord
        this.note(f, start, 0.85, 0.045, 'sawtooth');
      }
    }
  }

  thunder() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const delay = 0.15 + Math.random() * 1.4; // distance
    // rumble: noise burst through a closing lowpass
    const src = ctx.createBufferSource();
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    const t0 = ctx.currentTime + delay;
    f.frequency.setValueAtTime(160, t0);
    f.frequency.exponentialRampToValueAtTime(45, t0 + 2.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.4, t0 + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 3);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t0); src.stop(t0 + 3.2);
  }
}
