/**
 * Run-A-Ton · audio.js
 * The game's sound effects, all synthesized live with the Web Audio API:
 * nothing to download, and every effect varies a little each time, so nothing
 * sounds like one sample on repeat.
 *
 *   sfx    sparkles (a soft bell that climbs a scale along a line of them),
 *          moves, power-ups, hits, announcements, the crash, game over.
 *
 * Browsers only allow sound after the player has touched the page, so nothing
 * plays until the first tap or key press. Sound effects have an on/off switch,
 * remembered in localStorage.
 *
 * Everything goes through a gentle compressor, so stacked sounds never clip.
 */

const Ctor = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;

const STORE = { sfx: 'mat9-24h-sfx' };
const LEVEL = { master: 0.85, sfx: 0.8 };

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function readOn(key) {
  try { return window.localStorage.getItem(key) !== '0'; } catch (e) { return true; }
}
function saveOn(key, on) {
  try { window.localStorage.setItem(key, on ? '1' : '0'); } catch (e) { /* no storage: it just won't be remembered */ }
}

/* Sparkles climb this scale (C major pentatonic, D5 to E6) while they come in quick succession. */
const PENTA = [74, 76, 79, 81, 84, 86, 88];
const STREAK_GAP = 0.4; // s: a longer pause than this starts again at the bottom

/* Shortest time between two plays of an effect (s). */
const GAP = { sparkle: 0.035, crash: 0.05, block: 0.05, hit: 0.05, coin: 0.035 };

export class AudioEngine {
  constructor() {
    this.supported = !!Ctor;
    this.on = { sfx: readOn(STORE.sfx) };
    this.ctx = null;
    this.ready = false;     // the player has touched the page and sound is running
    this.paused = false;
    this.engine = null;     // the rocket's rumble, while flying
    this.last = {};
    this.streak = { at: -10, n: 0 };
    this.handlers = [];
    this.started = false;
  }

  /* --- life cycle ----------------------------------------------------------- */

  /** Waits for the first touch or key press (sound needs one). Call once. */
  init() {
    if (!this.supported || this.started) return;
    this.started = true;
    const wake = () => this.unlock();
    for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click']) {
      window.addEventListener(type, wake, { capture: true, passive: true });
    }
    // silent while the tab is hidden; back when it's shown
    const sleep = () => { if (this.ctx) this.ctx.suspend().catch(() => {}); };
    const resume = () => { if (this.ctx && this.ready && !document.hidden) this.ctx.resume().catch(() => {}); };
    document.addEventListener('visibilitychange', () => (document.hidden ? sleep() : resume()));
    window.addEventListener('pagehide', sleep);
    window.addEventListener('pageshow', resume);
  }

  /** Builds the context and the mixer, once. */
  ensure() {
    if (this.ctx) return this.ctx;
    if (!Ctor) return null;
    let ctx;
    try { ctx = new Ctor({ latencyHint: 'interactive' }); } catch (e) {
      try { ctx = new Ctor(); } catch (e2) { this.supported = false; return null; }
    }
    return this.attach(ctx);
  }

  /** The mixer, on a context (a real one, or an offline one in tests). */
  attach(ctx) {
    this.ctx = ctx;
    const gain = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };

    // everything ends in a soft compressor, so stacked sounds never clip
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -14;
    glue.knee.value = 12;
    glue.ratio.value = 3.5;
    glue.attack.value = 0.004;
    glue.release.value = 0.2;
    glue.connect(ctx.destination);
    this.master = gain(LEVEL.master);
    this.master.connect(glue);

    this.sfxBus = gain(this.on.sfx ? LEVEL.sfx : 0);
    this.sfxBus.connect(this.master);

    // raw material: white noise (hats, whooshes), and a 25% pulse for the lead
    const len = Math.floor(ctx.sampleRate * 2);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const n = 40;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
    this.pulse = ctx.createPeriodicWave(real, imag);
    return ctx;
  }

  /** On every touch or key: wake the context if it's asleep. */
  unlock() {
    if (!this.ensure()) return;
    const ctx = this.ctx;
    if (ctx.state === 'running') { this.wake(); return; }
    if (document.hidden) return;
    ctx.resume().then(() => this.wake(), () => {});
    if (!this.primed) {
      // older iOS only opens up once something has played inside the touch
      this.primed = true;
      try {
        const s = ctx.createBufferSource();
        s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        s.connect(ctx.destination);
        s.start(0);
      } catch (e) { /* fine */ }
    }
  }

  wake() {
    if (this.ready) return;
    this.ready = true;
    this.emit();
  }

  /* --- switches --------------------------------------------------------------- */

  isOn(kind = 'sfx') { return kind === 'sfx' ? !!this.on.sfx : false; }

  /** Turns sound effects on or off; returns the new state. */
  toggle(kind = 'sfx') {
    if (kind !== 'sfx') return false;
    const on = !this.on.sfx;
    this.on.sfx = on;
    saveOn(STORE.sfx, on);
    if (this.ctx) {
      const bus = this.sfxBus;
      const t = this.ctx.currentTime;
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(bus.gain.value, t);
      bus.gain.linearRampToValueAtTime(on ? LEVEL.sfx : 0, t + 0.15);
    }
    this.emit();
    return on;
  }

  onChange(fn) {
    this.handlers.push(fn);
    fn(this.state());
  }

  emit() {
    const s = this.state();
    for (const fn of this.handlers) { try { fn(s); } catch (e) { /* a listener's problem */ } }
  }

  state() {
    return { sfx: this.on.sfx, supported: this.supported, ready: this.ready };
  }

  /* --- compatibility / no-op hooks ------------------------------------------- */

  music() {}
  update() {}
  duck() {}
  slowmo() {}
  windDown() {}

  pause(on) {
    this.paused = on;
  }

  rocket() {}

  /** Plays an effect by name (see FX below); options depend on the effect. */
  sfx(name, o = {}) {
    const ctx = this.ctx;
    if (!this.on.sfx || !ctx || ctx.state !== 'running') return;
    const fx = FX[name];
    if (!fx) return;
    const now = ctx.currentTime;
    const gap = GAP[name] ?? 0.1;
    if (this.last[name] !== undefined && now - this.last[name] < gap && now >= this.last[name]) return;
    this.last[name] = now;
    try { fx(this, now + 0.006, o); } catch (e) { /* a missing sound never breaks the game */ }
  }

  /* --- building blocks -------------------------------------------------------- */

  /** A value slides exponentially to `to` over `sec`. */
  glide(param, to, sec) {
    const t = this.ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(Math.max(param.value, 1), t);
    param.exponentialRampToValueAtTime(to, t + sec);
  }

  /** Attack to `peak`, hold, then an exponential tail of about `d` seconds. Returns when it's silent. */
  env(param, t, { a = 0.004, peak = 0.1, hold = 0, d = 0.15 }) {
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + a);
    if (hold > 0) param.setValueAtTime(peak, t + a + hold);
    param.setTargetAtTime(0, t + a + hold, d / 5);
    return t + a + hold + d * 1.3 + 0.02;
  }

  /** Connects `node` to `dest` (one node or several), through a panner if `pan`. */
  route(node, dest, pan) {
    let out = node;
    let panner = null;
    if (pan && this.ctx.createStereoPanner) {
      panner = this.ctx.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      node.connect(panner);
      out = panner;
    }
    for (const d of Array.isArray(dest) ? dest : [dest]) out.connect(d);
    return panner;
  }

  /**
   * One oscillator note. o: f (Hz), type or wave, to + glide (pitch slide),
   * lp (+ lpTo, lpGlide, q) lowpass, wobble [rate, depth Hz, fade-in s],
   * detune (cents), pan, and the envelope (a, peak, hold, d).
   */
  tone(dest, t, o) {
    const ctx = this.ctx;
    const src = ctx.createOscillator();
    if (o.wave) src.setPeriodicWave(o.wave);
    else src.type = o.type || 'sine';
    src.frequency.setValueAtTime(o.f, t);
    if (o.to) src.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || 0.1));
    if (o.detune) src.detune.value = o.detune;
    let node = src;
    if (o.lp) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = o.q ?? 0.7;
      lp.frequency.setValueAtTime(o.lp, t);
      if (o.lpTo) lp.frequency.exponentialRampToValueAtTime(o.lpTo, t + (o.lpGlide || 0.2));
      src.connect(lp);
      node = lp;
    }
    const g = ctx.createGain();
    const end = this.env(g.gain, t, o);
    node.connect(g);
    const panner = this.route(g, dest, o.pan);
    if (o.wobble) {
      const [rate, depth, fade = 0.01] = o.wobble;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const amount = ctx.createGain();
      amount.gain.setValueAtTime(0, t);
      amount.gain.linearRampToValueAtTime(depth, t + fade);
      lfo.connect(amount);
      amount.connect(src.frequency);
      lfo.start(t);
      lfo.stop(end);
    }
    src.start(t);
    src.stop(end);
    return { end, panner, src };
  }

  /** A burst of filtered noise. o: kind (filter type), f, to + glide, q, rate, pan, envelope. */
  hiss(dest, t, o) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = o.rate || 1;
    const filter = ctx.createBiquadFilter();
    filter.type = o.kind || 'bandpass';
    filter.Q.value = o.q ?? 1;
    filter.frequency.setValueAtTime(o.f, t);
    if (o.to) filter.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || 0.1));
    if (o.then) filter.frequency.exponentialRampToValueAtTime(o.then, t + o.thenAt);
    const g = ctx.createGain();
    const end = this.env(g.gain, t, o);
    src.connect(filter);
    filter.connect(g);
    const panner = this.route(g, dest, o.pan);
    src.start(t, Math.random() * 1.5);
    src.stop(end);
    return { end, panner };
  }

  /** The next sparkle's note: up the scale while they keep coming, then rocking at the top. */
  streakNote() {
    const now = this.ctx.currentTime;
    const s = this.streak;
    s.n = now - s.at < STREAK_GAP ? s.n + 1 : 0;
    s.at = now;
    const top = PENTA.length - 1;
    return PENTA[s.n <= top ? s.n : top - ((s.n - top) % 2)];
  }

}

/* ---------------------------------------------------------------------------
   The effects. Each gets (engine, start time, options) and plays into the
   effects bus. Frequent ones (sparkles, moves) are short and quiet.
   --------------------------------------------------------------------------- */
const FX = {
  /**
   * A sparkle: a soft bell, a step up the scale for each one in a quick row.
   * A line of them comes in at up to 20 a second, so after the first each
   * one is quieter and shorter.
   */
  sparkle(e, t) {
    const f = mtof(e.streakNote());
    const n = e.streak.n;
    const k = n === 0 ? 1 : n < 6 ? 0.5 : 0.38;
    const d = n === 0 ? 0.22 : 0.13;
    const pan = rand(-0.15, 0.15);
    e.tone(e.sfxBus, t, { f, a: 0.002, peak: 0.085 * k, d, pan });
    e.tone(e.sfxBus, t, { f: f * 2, a: 0.002, peak: 0.016 * k, d: 0.07, pan });
  },

  coin(e, t, o) {
    this.sparkle(e, t, o);
  },

  /** The crash, by what was hit: a bug glitches, a board bonks, a chair clatters. */
  crash(e, t, o = {}) {
    e.tone(e.sfxBus, t, { f: 150, to: 40, glide: 0.25, a: 0.002, peak: 0.3, d: 0.35 });
    e.hiss(e.sfxBus, t, { kind: 'lowpass', f: 2600, to: 300, glide: 0.2, q: 0.9, a: 0.002, peak: 0.14, d: 0.25 });
    if (o.bug) {
      glitch(e, t + 0.01, 0.04);
      e.tone(e.sfxBus, t, { type: 'square', f: 1400, to: 90, glide: 0.3, a: 0.002, peak: 0.035, d: 0.3, lp: 3000 });
    } else if (o.cause === 'chair') {
      [[0, 2600], [0.06, 3600], [0.13, 1900]].forEach(([dt, f]) => {
        e.hiss(e.sfxBus, t + dt, { f, q: 4, a: 0.001, peak: 0.08, d: 0.07, pan: rand(-0.4, 0.4) });
      });
      e.tone(e.sfxBus, t + 0.05, { f: 2200, a: 0.002, peak: 0.018, d: 0.35 });
    } else {
      // bonk: a wood block
      e.tone(e.sfxBus, t, { f: 640, to: 570, glide: 0.05, a: 0.001, peak: 0.14, d: 0.16 });
      e.tone(e.sfxBus, t, { type: 'triangle', f: 320, a: 0.001, peak: 0.07, d: 0.12 });
    }
    // ...and the comic whistle of falling over
    e.tone(e.sfxBus, t + 0.1, { f: 1100, to: 260, glide: 0.5, a: 0.02, hold: 0.25, peak: 0.03, d: 0.25 });
  },

  hit(e, t, o) {
    this.crash(e, t, o);
  },

  block(e, t, o) {
    this.crash(e, t, o);
  },
};

/** A few bit-crushed blips: the sound of a bug coming apart. */
function glitch(e, t, peak) {
  const notes = [523, 784, 1046, 1568, 659, 1318];
  for (let i = 0; i < 5; i++) {
    e.tone(e.sfxBus, t + i * 0.022, { type: 'square', f: notes[Math.floor(Math.random() * notes.length)], a: 0.001, peak, d: 0.02, lp: 3500, pan: rand(-0.3, 0.3) });
  }
}

export const audio = new AudioEngine();
