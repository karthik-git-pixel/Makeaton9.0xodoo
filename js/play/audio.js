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
const GAP = { sparkle: 0.035, lane: 0.03, jump: 0.05, dive: 0.05, slide: 0.08, land: 0.07, click: 0.04, near: 0.3, smash: 0.05, squash: 0.05 };

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
    if (on) setTimeout(() => this.sfx('toggle'), 170);
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

  /** Paused: the rocket's rumble stops if flying. */
  pause(on) {
    this.paused = on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.engine) this.engine.gain.gain.setTargetAtTime(on ? 0 : 1, t, 0.05);
  }

  /** The rocket's rumble, on while flying. */
  rocket(on) {
    const ctx = this.ctx;
    if (!ctx || !this.ready) return;
    const t = ctx.currentTime;
    if (on && !this.engine) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 480;
      lp.Q.value = 2.5;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 6.5;
      const depth = ctx.createGain();
      depth.gain.value = 140;
      lfo.connect(depth);
      depth.connect(lp.frequency);
      const hum = ctx.createOscillator();
      hum.type = 'sawtooth';
      hum.frequency.value = 58;
      const humLevel = ctx.createGain();
      humLevel.gain.value = 0.18;
      hum.connect(humLevel);
      humLevel.connect(lp);
      const level = ctx.createGain();
      level.gain.value = 0.07;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.setTargetAtTime(this.paused ? 0 : 1, t + 0.25, 0.2);
      src.connect(lp);
      lp.connect(level);
      level.connect(g);
      g.connect(this.sfxBus);
      src.start(t, Math.random());
      lfo.start(t);
      hum.start(t);
      this.engine = { src, lfo, hum, gain: g };
    } else if (!on && this.engine) {
      const e = this.engine;
      this.engine = null;
      e.gain.gain.cancelScheduledValues(t);
      e.gain.gain.setValueAtTime(e.gain.gain.value, t);
      e.gain.gain.setTargetAtTime(0, t, 0.08);
      for (const n of [e.src, e.lfo, e.hum]) n.stop(t + 0.7);
    }
  }

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

  /** Jump: a little upward blip and a breath of air. */
  jump(e, t) {
    e.tone(e.sfxBus, t, { type: 'triangle', f: 300 * rand(0.96, 1.04), to: 620, glide: 0.09, a: 0.004, peak: 0.1, d: 0.12 });
    e.hiss(e.sfxBus, t, { f: 1300, to: 3200, glide: 0.08, q: 0.9, a: 0.01, peak: 0.035, d: 0.08 });
  },

  /** Dive (slide in the air): the jump's blip, falling. */
  dive(e, t) {
    e.tone(e.sfxBus, t, { type: 'triangle', f: 640, to: 190, glide: 0.12, a: 0.004, peak: 0.07, d: 0.14 });
  },

  /** Slide: a swish along the floor. */
  slide(e, t) {
    e.hiss(e.sfxBus, t, { f: 2400, to: 650, glide: 0.2, q: 0.9, a: 0.012, peak: 0.085, d: 0.22 });
  },

  /** Lane change: a tiny puff of air, on the side the star goes. */
  lane(e, t, o) {
    e.hiss(e.sfxBus, t, { f: 1500 * rand(0.92, 1.08), to: 2700, glide: 0.06, q: 0.8, a: 0.006, peak: 0.13, d: 0.08, pan: (o.dir || 0) * 0.45 });
  },

  /** Landing: a soft thump, heavier after a high fall. */
  land(e, t, o) {
    const k = clamp(o.impact ?? 0.6, 0.2, 1.3);
    e.tone(e.sfxBus, t, { f: 140, to: 55, glide: 0.08, a: 0.003, peak: 0.1 * k, d: 0.12 });
    e.hiss(e.sfxBus, t, { kind: 'lowpass', f: 1500, q: 0.7, a: 0.002, peak: 0.1 * k, d: 0.05 });
  },

  /** PLAY / Run again: a whoosh up and a quick bright arpeggio. */
  start(e, t) {
    e.hiss(e.sfxBus, t, { f: 300, to: 2800, glide: 0.3, q: 1, a: 0.14, peak: 0.07, d: 0.25 });
    [72, 76, 79, 84].forEach((m, i) => {
      e.tone(e.sfxBus, t + 0.05 + i * 0.05, { type: 'triangle', f: mtof(m), a: 0.003, peak: 0.07, d: 0.2 });
    });
  },

  /** A power-up: a rising sparkle, then its own sound. */
  power(e, t, o) {
    [72, 76, 79, 84].forEach((m, i) => {
      e.tone(e.sfxBus, t + i * 0.045, { type: 'triangle', f: mtof(m), a: 0.003, peak: 0.065, d: 0.16 });
      e.tone(e.sfxBus, t + i * 0.045, { f: mtof(m + 12), a: 0.003, peak: 0.015, d: 0.1 });
    });
    const u = t + 0.06;
    switch (o.kind) {
      case 'coffee': // the rush: an engine revving up
        e.tone(e.sfxBus, u, { type: 'sawtooth', f: 90, to: 380, glide: 0.38, a: 0.02, hold: 0.18, peak: 0.055, d: 0.22, lp: 600, lpTo: 3200, lpGlide: 0.38, q: 2 });
        e.hiss(e.sfxBus, u, { f: 500, to: 2600, glide: 0.4, q: 1, a: 0.1, peak: 0.045, d: 0.3 });
        break;
      case 'shield': // the firewall: a glassy shing
        e.tone(e.sfxBus, u, { f: 1318, a: 0.004, peak: 0.035, d: 0.7, wobble: [7, 6, 0.2] });
        e.tone(e.sfxBus, u, { f: 1976, a: 0.004, peak: 0.018, d: 0.5 });
        e.hiss(e.sfxBus, u, { kind: 'highpass', f: 6000, q: 0.7, a: 0.002, peak: 0.03, d: 0.16 });
        break;
      case 'magnet': // wi-fi: a wobbly wub
        e.tone(e.sfxBus, u, { f: 220, to: 470, glide: 0.4, a: 0.02, hold: 0.22, peak: 0.065, d: 0.2, wobble: [16, 34] });
        break;
      case 'duck': // debug mode: two rubber-duck squeaks
        squeak(e, u, 1);
        squeak(e, u + 0.15, 1.18);
        break;
      case 'pizza': // double points: ding-ding
        e.tone(e.sfxBus, u, { f: mtof(79), a: 0.003, peak: 0.045, d: 0.35 });
        e.tone(e.sfxBus, u, { f: mtof(91), a: 0.003, peak: 0.011, d: 0.15 });
        e.tone(e.sfxBus, u + 0.11, { f: mtof(86), a: 0.003, peak: 0.042, d: 0.45 });
        e.tone(e.sfxBus, u + 0.11, { f: mtof(98), a: 0.003, peak: 0.009, d: 0.15 });
        break;
      case 'rocket': // ship it: ignition
        e.hiss(e.sfxBus, u, { kind: 'lowpass', f: 200, to: 3200, glide: 0.6, q: 1.5, a: 0.05, hold: 0.25, peak: 0.09, d: 0.35 });
        e.tone(e.sfxBus, u, { type: 'sawtooth', f: 70, to: 300, glide: 0.6, a: 0.04, hold: 0.25, peak: 0.045, d: 0.25, lp: 900 });
        break;
      default:
        break;
    }
  },

  /** A timed power-up has run out: a soft two-note fall. */
  powerEnd(e, t) {
    e.tone(e.sfxBus, t, { f: mtof(79), a: 0.004, peak: 0.04, d: 0.14 });
    e.tone(e.sfxBus, t + 0.09, { f: mtof(74), a: 0.004, peak: 0.04, d: 0.2 });
  },

  /** The rocket's done: a whoosh down to the floor. */
  rocketEnd(e, t) {
    e.hiss(e.sfxBus, t, { f: 2200, to: 380, glide: 0.4, q: 1.1, a: 0.03, peak: 0.06, d: 0.35 });
  },

  /** Smashing through something on the coffee rush. */
  smash(e, t, o) {
    e.tone(e.sfxBus, t, { f: 170, to: 45, glide: 0.14, a: 0.002, peak: 0.24, d: 0.2 });
    e.hiss(e.sfxBus, t, { kind: 'lowpass', f: 3000, to: 500, glide: 0.12, q: 1, a: 0.002, peak: 0.15, d: 0.15 });
    if (o.bug) glitch(e, t + 0.02, 0.035);
  },

  /** Debug mode squashes a bug: a squish and a glitchy blip. */
  squash(e, t) {
    e.hiss(e.sfxBus, t, { f: 1200, to: 280, glide: 0.12, q: 1.4, a: 0.002, peak: 0.17, d: 0.14 });
    e.tone(e.sfxBus, t, { f: 130, to: 60, glide: 0.08, a: 0.002, peak: 0.12, d: 0.1 });
    glitch(e, t + 0.03, 0.04);
  },

  /** The firewall takes a hit: a shatter and a falling ring. */
  block(e, t) {
    e.hiss(e.sfxBus, t, { kind: 'highpass', f: 4000, q: 0.7, a: 0.001, peak: 0.09, d: 0.2 });
    e.tone(e.sfxBus, t, { f: 1600, to: 480, glide: 0.18, a: 0.002, peak: 0.045, d: 0.22 });
    e.tone(e.sfxBus, t, { f: 120, to: 50, glide: 0.1, a: 0.002, peak: 0.18, d: 0.15 });
  },

  /** A near miss: air rushing past, left to right. */
  near(e, t) {
    const w = e.hiss(e.sfxBus, t, { f: 500, to: 2600, glide: 0.2, then: 700, thenAt: 0.45, q: 1.2, a: 0.12, peak: 0.12, d: 0.35, pan: -0.6 });
    if (w.panner) w.panner.pan.linearRampToValueAtTime(0.6, t + 0.42);
  },

  /** Level up: a bright fanfare with a shimmer on top. */
  levelup(e, t) {
    e.duck(0.55, 0.5);
    [72, 76, 79, 84].forEach((m, i) => {
      e.tone(e.sfxBus, t + i * 0.07, { type: 'triangle', f: mtof(m), a: 0.003, peak: 0.068, d: 0.26 });
      e.tone(e.sfxBus, t + i * 0.07, { wave: e.pulse, f: mtof(m + 12), a: 0.003, peak: 0.011, d: 0.08, lp: 4000 });
    });
    for (const m of [84, 88, 91]) e.tone(e.sfxBus, t + 0.3, { f: mtof(m), a: 0.02, hold: 0.2, peak: 0.017, d: 0.5 });
  },

  /** BUG SWARM!, DEMO TIME!...: a short brassy call. */
  alert(e, t) {
    for (const det of [-8, 8]) {
      e.tone(e.sfxBus, t, { type: 'sawtooth', f: mtof(64), detune: det, a: 0.01, hold: 0.07, peak: 0.035, d: 0.1, lp: 1500 });
      e.tone(e.sfxBus, t + 0.16, { type: 'sawtooth', f: mtof(69), detune: det, a: 0.01, hold: 0.2, peak: 0.04, d: 0.25, lp: 1800 });
    }
  },

  /** An event survived: ta-da. */
  cleared(e, t) {
    e.duck(0.6, 0.4);
    const chord = (at, notes, hold) => notes.forEach((m) => {
      e.tone(e.sfxBus, at, { type: 'sawtooth', f: mtof(m), a: 0.005, hold, peak: 0.013, d: 0.25, lp: 2400 });
      e.tone(e.sfxBus, at, { type: 'triangle', f: mtof(m), a: 0.005, hold, peak: 0.022, d: 0.25 });
    });
    chord(t, [67, 71, 74], 0.06);
    chord(t + 0.14, [72, 76, 79], 0.25);
    e.hiss(e.sfxBus, t + 0.14, { kind: 'highpass', f: 6000, q: 0.5, a: 0.002, peak: 0.02, d: 0.6 });
  },

  /** A new best: sparkles running up, and a fanfare. */
  best(e, t) {
    e.duck(0.5, 0.6);
    [84, 86, 88, 91, 93, 96].forEach((m, i) => {
      e.tone(e.sfxBus, t + i * 0.04, { f: mtof(m), a: 0.002, peak: 0.028, d: 0.2, pan: (i % 2 ? 0.3 : -0.3) });
    });
    [72, 76, 79, 84].forEach((m, i) => {
      e.tone(e.sfxBus, t + 0.22 + i * 0.08, { type: 'triangle', f: mtof(m), a: 0.003, peak: 0.068, d: i === 3 ? 0.6 : 0.24 });
    });
  },

  /** The game-over card: a gentle fall down the chord. */
  over(e, t) {
    e.duck(0.4, 0.8);
    [72, 67, 64, 60].forEach((m, i) => {
      e.tone(e.sfxBus, t + i * 0.13, { type: 'triangle', f: mtof(m), a: 0.004, peak: 0.09, d: i === 3 ? 0.9 : 0.28, wobble: i === 3 ? [5, 3, 0.3] : null });
      e.tone(e.sfxBus, t + i * 0.13, { f: mtof(m + 12), a: 0.004, peak: 0.014, d: 0.15 });
    });
  },

  /** The crash, by what was hit: a bug glitches, a board bonks, a chair clatters. */
  crash(e, t, o) {
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

  /** A button on the menus. */
  click(e, t) {
    e.tone(e.sfxBus, t, { type: 'triangle', f: 880 * rand(0.97, 1.03), to: 620, glide: 0.04, a: 0.002, peak: 0.05, d: 0.06 });
  },

  /** Sound effects switched back on. */
  toggle(e, t) {
    e.tone(e.sfxBus, t, { f: mtof(72), a: 0.003, peak: 0.05, d: 0.15 });
    e.tone(e.sfxBus, t + 0.07, { f: mtof(79), a: 0.003, peak: 0.05, d: 0.2 });
  },
};

/** A rubber duck's squeak (pitch `k` times the first). */
function squeak(e, t, k) {
  const ctx = e.ctx;
  const src = ctx.createOscillator();
  src.type = 'square';
  src.frequency.setValueAtTime(760 * k, t);
  src.frequency.exponentialRampToValueAtTime(1350 * k, t + 0.05);
  src.frequency.exponentialRampToValueAtTime(1050 * k, t + 0.12);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1700 * k;
  band.Q.value = 1.6;
  const g = ctx.createGain();
  const end = e.env(g.gain, t, { a: 0.01, hold: 0.06, peak: 0.05, d: 0.07 });
  src.connect(band);
  band.connect(g);
  g.connect(e.sfxBus);
  src.start(t);
  src.stop(end);
}

/** A few bit-crushed blips: the sound of a bug coming apart. */
function glitch(e, t, peak) {
  const notes = [523, 784, 1046, 1568, 659, 1318];
  for (let i = 0; i < 5; i++) {
    e.tone(e.sfxBus, t + i * 0.022, { type: 'square', f: notes[Math.floor(Math.random() * notes.length)], a: 0.001, peak, d: 0.02, lp: 3500, pan: rand(-0.3, 0.3) });
  }
}

export const audio = new AudioEngine();
