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
    // radio duck: a separate multiplier so a transmission can dip the engine
    // without fighting the per-frame engineGain automation in update()
    this.radioDuck = ctx.createGain();
    this.radioDuck.gain.value = 1;
    this.engineFilter.connect(this.propMod).connect(this.radioDuck).connect(this.engineGain);
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

    // --- rotor thump: noise chopped at blade frequency, gain fades by distance ---
    this.heliGain = chan();
    this.heliTarget = 0; // last commanded gain target (verify reads this, not the ramping AudioParam)
    const heliChop = ctx.createGain();
    heliChop.gain.value = 1;
    noiseSrc('bandpass', 130, 1.1).connect(heliChop).connect(this.heliGain);
    const heliLfo = ctx.createOscillator();
    heliLfo.type = 'square';
    heliLfo.frequency.value = 12;
    const heliDepth = ctx.createGain();
    heliDepth.gain.value = 0.85;
    heliLfo.connect(heliDepth).connect(heliChop.gain);
    heliLfo.start();

    // --- datacenter hum: a low-frequency filtered-noise bed + a faint
    // transformer whine, gain fades by distance (mirrors the heli bed). ---
    this.datacenterGain = chan();
    this.datacenterTarget = 0; // last commanded gain target (verify reads this, not the ramping param)
    noiseSrc('lowpass', 90, 0.7).connect(this.datacenterGain);
    const dcWhine = ctx.createOscillator();
    dcWhine.type = 'sawtooth';
    dcWhine.frequency.value = 60; // mains-frequency transformer whine
    const dcWhineGain = ctx.createGain();
    dcWhineGain.gain.value = 0.14;
    dcWhine.connect(dcWhineGain).connect(this.datacenterGain);
    dcWhine.start();

    // --- jetpack whoosh: bright filtered noise, gain follows active thrust ---
    this.jetGain = chan();
    this.jetTarget = 0; // last commanded gain target (verify reads this, not the ramping param)
    noiseSrc('bandpass', 1400, 0.9).connect(this.jetGain);

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

  // pause: freeze the whole audio graph (oscillators, scheduled envelopes) so a
  // paused world falls silent and resumes exactly where it left off. Orthogonal
  // to mute (which is gain-based) — suspend/resume just stops/starts the clock.
  freeze() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  unfreeze() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  // called every frame from the game loop
  update(player, atmos) {
    // computed unconditionally (heli()/datacenterHum() pattern) so verify can
    // read the commanded target even before the AudioContext exists
    this.jetTarget = player.mode === 'WALK' && player.hovering && !!player.keys['Space'] ? 0.09 : 0;
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const spd = Math.abs(player.speed);
    const set = (param, v, tc = 0.08) => param.setTargetAtTime(v, t, tc);
    set(this.jetGain.gain, this.jetTarget, 0.12);

    // near a UFO: engine sputters (the Levelland effect) and the theremin swells
    const ufo = atmos.ufo || 0;
    set(this.ufoGain.gain, ufo * 0.045, 0.3);
    const sputter = ufo > 0 && Math.random() < ufo * 0.4 ? 0.12 : 1;

    if (player.mode === 'DRIVE' && player.aboardFerry) {
      set(this.engineGain.gain, 0); // engine cut for the crossing — the boat does the work
    } else if (player.mode === 'DRIVE') {
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
      set(this.engineGain.gain, (0.07 + (spd / 150) * 0.05) * sputter, 0.03); // the Levelland effect grounds planes too
    } else {
      set(this.engineGain.gain, 0);
    }

    const windSpd = player.mode === 'FLY' ? spd / 150 : spd / 60;
    set(this.windGain.gain, Math.min(0.14, windSpd * 0.1 + (atmos.wind - 1) * 0.02), 0.3);
    set(this.rainGain.gain, (atmos.rain || 0) * 0.05, 0.5);
    set(this.cricketGain.gain, atmos.night * (1 - Math.min(1, atmos.rain || 0)) * 0.012, 0.5);
  }

  // rotorcraft ambience: nearest-airborne-heli distance -> gain, faded like
  // bell(d). Called every frame from main.js with rotors.nearestAirborneDist().
  heli(dist = Infinity) {
    this.heliTarget = Math.max(0, 0.05 * (1 - dist / 140));
    if (!this.ctx || this.muted) return;
    this.heliGain.gain.setTargetAtTime(this.heliTarget, this.ctx.currentTime, 0.25);
  }

  // datacenter ambience: nearest live Lone Star Compute distance -> gain, faded
  // like heli(). Called every frame via brands.onHum (main.js wires it).
  datacenterHum(dist = Infinity) {
    this.datacenterTarget = Math.max(0, 0.04 * (1 - dist / 220));
    if (!this.ctx || this.muted) return;
    this.datacenterGain.gain.setTargetAtTime(this.datacenterTarget, this.ctx.currentTime, 0.3);
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
      buy: [[659, 0, 0.1, 0.07], [880, 0.09, 0.12, 0.08], [1319, 0.18, 0.35, 0.09]],
      legend: [[392, 0, 0.55, 0.06], [466, 0.18, 0.55, 0.06], [587, 0.36, 1.0, 0.07]], // minor rise — something's out there
      stamp: [[660, 0, 0.12, 0.07], [880, 0.09, 0.14, 0.08], [1320, 0.18, 0.4, 0.09]], // logbook stamped
    };
    for (const [f, w, d, g] of SONGS[kind] || []) this.note(f, w, d, g ?? 0.1, 'triangle');
  }

  // tower radio: squelch click → syllabic gibberish burst (no TTS, no words —
  // sawtooth through a wobbling bandpass, chopped at ~4 Hz to read as speech
  // cadence) → closing squelch. Duration follows text length so a longer
  // clearance reads longer than "radar contact." Ducks the engine under the
  // transmission (radioDuck, not engineGain — that's rewritten every frame).
  // opts.ufo (0..~1, ATMOS.ufo) chops the gain with random dropouts — the
  // Levelland effect reaching the avionics. opts.voice {p, r} (chatter.js
  // VOICES) retunes pitch and syllable rate so a calm dispatcher, a quick
  // news pilot and a clipped two-ship are audibly distinct voices.
  radio(text, opts = {}) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const vp = opts.voice?.p ?? 1, vr = opts.voice?.r ?? 1;
    const dur = Math.min(4.2, Math.max(0.9, text.length * 0.045)) / vr;
    const t0 = ctx.currentTime + 0.02;

    this.note(1800, 0, 0.02, 0.05, 'square'); // squelch open

    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(120 * vp, t0);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(900 * vp, t0);
    f.Q.value = 3.2;
    const wob = ctx.createOscillator(); // wobbling center frequency
    wob.frequency.value = 5.3;
    const wobAmt = ctx.createGain();
    wobAmt.gain.value = 220;
    wob.connect(wobAmt).connect(f.frequency);
    const syl = ctx.createOscillator(); // ~4 Hz syllable AM
    syl.type = 'square';
    syl.frequency.value = (3.6 + Math.random() * 0.8) * vr;
    const sylAmt = ctx.createGain();
    sylAmt.gain.value = 0.05;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.05, t0 + 0.04);
    g.gain.setValueAtTime(0.05, t0 + dur - 0.06);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    syl.connect(sylAmt).connect(g.gain);

    const ufo = opts.ufo || 0;
    if (ufo > 0) {
      const drops = 1 + Math.floor(ufo * 4);
      for (let i = 0; i < drops; i++) {
        const dt2 = t0 + 0.1 + Math.random() * Math.max(0.1, dur - 0.3);
        g.gain.setTargetAtTime(0.005, dt2, 0.015);
        g.gain.setTargetAtTime(0.05, dt2 + 0.08, 0.02);
      }
    }

    o.connect(f).connect(g).connect(this.sfx);
    o.start(t0); wob.start(t0); syl.start(t0);
    o.stop(t0 + dur + 0.05); wob.stop(t0 + dur + 0.05); syl.stop(t0 + dur + 0.05);

    this.note(1500, dur + 0.03, 0.02, 0.045, 'square'); // squelch close

    const d = this.radioDuck.gain;
    d.cancelScheduledValues(t0);
    d.setValueAtTime(1, t0);
    d.linearRampToValueAtTime(0.35, t0 + 0.05);
    d.setValueAtTime(0.35, t0 + dur - 0.08);
    d.linearRampToValueAtTime(1, t0 + dur);
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

  // flare rack: hollow launch thump, then a bright little spark when the
  // chute pops and the charge ignites
  flare(kind) {
    if (!this.ctx || this.muted) return;
    if (kind === 'launch') {
      this.note(110, 0, 0.18, 0.09, 'sine');
      this.note(55, 0, 0.28, 0.06, 'sine');
    } else {
      this.note(1560, 0, 0.06, 0.022, 'triangle');
      this.note(2090, 0.04, 0.05, 0.016, 'triangle');
    }
  }

  // jetpack liftoff: a soft low thump (backpack firing) under a quick rising whoosh
  jetWhomp() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    this.note(85, 0, 0.22, 0.1, 'sine');
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const t0 = ctx.currentTime;
    o.frequency.setValueAtTime(200, t0);
    o.frequency.exponentialRampToValueAtTime(650, t0 + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.05, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.28);
    o.connect(g).connect(this.sfx);
    o.start(t0); o.stop(t0 + 0.3);
  }

  // Lacy: a bright little double-yip — pitch whips up then falls back
  bark() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    for (const start of [0, 0.19]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      const t0 = ctx.currentTime + start;
      o.frequency.setValueAtTime(480, t0);
      o.frequency.exponentialRampToValueAtTime(920, t0 + 0.05);
      o.frequency.exponentialRampToValueAtTime(560, t0 + 0.11);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.038, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.13);
      o.connect(g).connect(this.sfx);
      o.start(t0); o.stop(t0 + 0.15);
      // a low chesty "ruff" under the yip
      this.note(170, start, 0.09, 0.03, 'sine');
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

  // country chapel bell at midnight: hum + prime + minor-third tierce
  // partials with long decays, tolled three times, faded by distance
  bell(dist = 0) {
    if (!this.ctx || this.muted) return;
    const v = Math.max(0.012, 0.08 * (1 - dist / 220));
    for (const start of [0, 1.7, 3.4]) {
      this.note(220, start, 2.8, v, 'sine');                  // prime
      this.note(110, start, 3.4, v * 0.6, 'sine');            // hum
      this.note(262, start + 0.01, 1.6, v * 0.35, 'sine');    // tierce — the churchy shimmer
      this.note(524, start + 0.01, 0.4, v * 0.18, 'triangle'); // clapper strike
    }
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
