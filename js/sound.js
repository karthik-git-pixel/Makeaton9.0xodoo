/**
 * MAKEATON 9.0 - Comic Sound Engine
 *
 * Every effect is synthesized live with the Web Audio API, so the site ships
 * zero audio files: no extra downloads, works offline, and each play-through
 * is slightly randomized so a repeated sound never feels like a looped sample.
 *
 * Public API (window.MakeatonSound):
 *   play(name, options)  -> fire an effect: 'pageFlip' | 'pop' | 'pow' |
 *                           'boing' | 'whoosh' | 'zip' | 'chime', and for the
 *                           team page's card deck: 'riffle' | 'thwip' |
 *                           'snap' | 'fanfare'
 *   unlock()             -> resume the AudioContext (needs a user gesture)
 *   toggle()             -> mute / unmute, remembered in localStorage
 */

window.MakeatonSound = (function () {
  'use strict';

  const STORAGE_KEY = 'makeaton-sound-muted';
  const MASTER_VOLUME = 0.5;

  /* Minimum gap between two plays of the same effect (ms), so rapid hovering
     or scrolling can never machine-gun the speakers. */
  const THROTTLE_MS = {
    pop: 60,
    pageFlip: 45,
    pow: 90,
    boing: 220,
    whoosh: 600,
    zip: 260,
    chime: 120,
    riffle: 350,
    thwip: 28,
    snap: 28,
    fanfare: 600
  };

  const AudioCtor = window.AudioContext || window.webkitAudioContext;

  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let unlocked = false;
  let muted = readMutedPreference();
  const lastPlayed = {};
  const changeHandlers = [];

  /* --------------------------------------------------------------------
     Context lifecycle
     -------------------------------------------------------------------- */

  function readMutedPreference() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch (err) {
      return false;
    }
  }

  function saveMutedPreference() {
    try {
      window.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    } catch (err) {
      /* Private mode or blocked storage: the preference just won't persist. */
    }
  }

  function ensureContext() {
    if (ctx || !AudioCtor) return ctx;

    ctx = new AudioCtor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOLUME;
    master.connect(ctx.destination);
    noiseBuffer = buildNoiseBuffer(2);
    return ctx;
  }

  /**
   * Browsers keep audio suspended until the visitor interacts with the page,
   * so this runs off any real gesture to wake the context up.
   */
  function unlock() {
    if (!AudioCtor) return;
    ensureContext();

    if (ctx.state === 'suspended') {
      ctx.resume().then(markUnlocked, function () { /* stays locked */ });
    } else {
      markUnlocked();
    }
  }

  function markUnlocked() {
    if (unlocked) return;
    unlocked = true;
    notifyChange();
  }

  function isReady() {
    return Boolean(ctx) && unlocked && !muted && ctx.state === 'running';
  }

  /* --------------------------------------------------------------------
     Synthesis helpers
     -------------------------------------------------------------------- */

  /** A reusable buffer of white noise: raw material for paper and for air. */
  function buildNoiseBuffer(seconds) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  function noiseSource(rate) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.playbackRate.value = rate || 1;
    return src;
  }

  /** Plays a slice of the noise buffer from a random point, so grains vary. */
  function startNoise(src, at, duration) {
    const span = noiseBuffer.duration - duration - 0.05;
    const offset = span > 0 ? Math.random() * span : 0;

    src.start(at, offset, duration);
    src.stop(at + duration);
  }

  /** Percussive envelope: silence -> peak -> silence, exponential decay. */
  function shape(gainNode, at, attack, peak, decay) {
    const g = gainNode.gain;
    const safePeak = Math.max(peak, 0.0005);

    g.setValueAtTime(0.0005, at);
    g.exponentialRampToValueAtTime(safePeak, at + attack);
    g.exponentialRampToValueAtTime(0.0005, at + attack + decay);
    g.setValueAtTime(0, at + attack + decay + 0.01);
  }

  function tone(type, at, freqFrom, freqTo, duration, peak) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqFrom, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqTo, 1), at + duration);

    shape(gain, at, Math.min(0.012, duration * 0.2), peak, duration);
    osc.connect(gain).connect(master);

    osc.start(at);
    osc.stop(at + duration + 0.05);
  }

  function vary(amount) {
    return 1 + (Math.random() * 2 - 1) * amount;
  }

  function levelOf(options) {
    return options.volume === undefined ? 1 : options.volume;
  }

  /* --------------------------------------------------------------------
     The effects
     -------------------------------------------------------------------- */

  const effects = {
    /**
     * Page flip: band-passed noise that rises as the sheet lifts and falls as
     * it lands, capped by a soft paper tap. `rate` pitches the whole gesture
     * up, which is what turns a staggered cascade into a riffle.
     */
    pageFlip: function (at, options) {
      const rate = (options.rate || 1) * vary(0.04);
      const level = levelOf(options);

      const src = noiseSource(0.85 * rate);
      const band = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      band.type = 'bandpass';
      band.Q.value = 1.1;
      band.frequency.setValueAtTime(520 * rate, at);
      band.frequency.exponentialRampToValueAtTime(2900 * rate, at + 0.085);
      band.frequency.exponentialRampToValueAtTime(760 * rate, at + 0.3);

      shape(gain, at, 0.055, 0.42 * level, 0.26);
      src.connect(band).connect(gain).connect(master);
      startNoise(src, at, 0.36);

      /* The sheet settling back against the stack. */
      const tap = noiseSource(1);
      const tapFilter = ctx.createBiquadFilter();
      const tapGain = ctx.createGain();

      tapFilter.type = 'lowpass';
      tapFilter.frequency.value = 1500 * rate;
      shape(tapGain, at + 0.26, 0.004, 0.2 * level, 0.07);
      tap.connect(tapFilter).connect(tapGain).connect(master);
      startNoise(tap, at + 0.26, 0.09);
    },

    /** Tiny tick for hovers: a wooden blip, never louder than a keystroke. */
    pop: function (at, options) {
      tone('triangle', at, 980 * vary(0.08), 620, 0.055, 0.1 * levelOf(options));
    },

    /** Comic impact: low thump, wet splat, and a crunchy square-wave edge. */
    pow: function (at, options) {
      const level = levelOf(options);

      tone('sine', at, 190 * vary(0.06), 48, 0.17, 0.42 * level);
      tone('square', at, 280, 110, 0.09, 0.07 * level);

      const splat = noiseSource(1);
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      filter.type = 'lowpass';
      filter.Q.value = 3;
      filter.frequency.setValueAtTime(2600, at);
      filter.frequency.exponentialRampToValueAtTime(380, at + 0.18);

      shape(gain, at, 0.006, 0.3 * level, 0.18);
      splat.connect(filter).connect(gain).connect(master);
      startNoise(splat, at, 0.2);
    },

    /** Cartoon boing: a falling tone wobbled by a fast, decaying LFO. */
    boing: function (at, options) {
      const level = levelOf(options);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoDepth = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(560 * vary(0.05), at);
      osc.frequency.exponentialRampToValueAtTime(130, at + 0.42);

      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(26, at);
      lfo.frequency.exponentialRampToValueAtTime(7, at + 0.42);
      lfoDepth.gain.setValueAtTime(90, at);
      lfoDepth.gain.exponentialRampToValueAtTime(6, at + 0.42);
      lfo.connect(lfoDepth).connect(osc.frequency);

      shape(gain, at, 0.01, 0.26 * level, 0.44);
      osc.connect(gain).connect(master);

      osc.start(at);
      lfo.start(at);
      osc.stop(at + 0.5);
      lfo.stop(at + 0.5);
    },

    /** Airy sweep for arriving at a new section. */
    whoosh: function (at, options) {
      const level = levelOf(options);

      const src = noiseSource(1);
      const band = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      band.type = 'bandpass';
      band.Q.value = 0.8;
      band.frequency.setValueAtTime(240, at);
      band.frequency.exponentialRampToValueAtTime(2200, at + 0.32);
      band.frequency.exponentialRampToValueAtTime(420, at + 0.75);

      shape(gain, at, 0.22, 0.22 * level, 0.5);
      src.connect(band).connect(gain).connect(master);
      startNoise(src, at, 0.8);
    },

    /** Ratchet: a burst of clicks that accelerates and thins out, like tape. */
    zip: function (at, options) {
      const level = levelOf(options);
      const clicks = 16;
      let offset = 0;

      for (let i = 0; i < clicks; i++) {
        const progress = i / clicks;
        const click = noiseSource(1);
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        filter.type = 'highpass';
        filter.frequency.value = 1400 + progress * 2200;

        shape(gain, at + offset, 0.002, 0.13 * level * (1 - progress * 0.55), 0.018);
        click.connect(filter).connect(gain).connect(master);
        startNoise(click, at + offset, 0.025);

        offset += 0.016 + progress * 0.014;
      }
    },

    /** Three-note arpeggio confirming the sound toggle. */
    chime: function (at, options) {
      const level = levelOf(options);
      const notes = options.down ? [1320, 880, 620] : [660, 990, 1320];

      notes.forEach(function (freq, i) {
        tone('sine', at + i * 0.065, freq, freq, 0.16, 0.16 * level);
      });
    },

    /**
     * Riffle shuffle: a run of card clicks that starts slow, rushes through
     * the middle and settles, over a soft bed of air. `duration` stretches it.
     */
    riffle: function (at, options) {
      const level = levelOf(options);
      const duration = options.duration || 0.6;
      const count = options.count || 26;

      for (let i = 0; i < count; i++) {
        const p = i / (count - 1);
        const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        // Jitter only forwards: on a fresh context `at` is ~0, and a click
        // scheduled before time 0 throws, which would silence the whole riffle
        const t = at + eased * duration + Math.random() * 0.006;

        const click = noiseSource(1.3);
        const band = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        band.type = 'bandpass';
        band.Q.value = 3;
        band.frequency.value = 2400 + Math.random() * 2200;

        shape(gain, t, 0.0015, (0.2 + Math.random() * 0.12) * level, 0.022);
        click.connect(band).connect(gain).connect(master);
        startNoise(click, t, 0.03);
      }

      const air = noiseSource(0.9);
      const airBand = ctx.createBiquadFilter();
      const airGain = ctx.createGain();

      airBand.type = 'bandpass';
      airBand.Q.value = 0.8;
      airBand.frequency.value = 1700;

      shape(airGain, at, 0.12, 0.08 * level, duration);
      air.connect(airBand).connect(airGain).connect(master);
      startNoise(air, at, duration + 0.15);
    },

    /** Card flick: a short airy swish as a card leaves the deck. `rate` pitches it. */
    thwip: function (at, options) {
      const level = levelOf(options);
      const rate = (options.rate || 1) * vary(0.06);

      const src = noiseSource(1);
      const band = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      band.type = 'bandpass';
      band.Q.value = 1.4;
      band.frequency.setValueAtTime(1100 * rate, at);
      band.frequency.exponentialRampToValueAtTime(5200 * rate, at + 0.06);
      band.frequency.exponentialRampToValueAtTime(2600 * rate, at + 0.13);

      shape(gain, at, 0.018, 0.3 * level, 0.11);
      src.connect(band).connect(gain).connect(master);
      startNoise(src, at, 0.15);
    },

    /** A card landing on the table: a dry paper slap over a soft thud. */
    snap: function (at, options) {
      const level = levelOf(options);

      const slap = noiseSource(1);
      const high = ctx.createBiquadFilter();
      const slapGain = ctx.createGain();

      high.type = 'highpass';
      high.frequency.value = 1500 * vary(0.1);

      shape(slapGain, at, 0.002, 0.3 * level, 0.04);
      slap.connect(high).connect(slapGain).connect(master);
      startNoise(slap, at, 0.06);

      tone('sine', at, 180 * vary(0.08), 70, 0.08, 0.14 * level);
    },

    /** The reveal: a rising arpeggio with a bright edge, then a held shimmer. */
    fanfare: function (at, options) {
      const level = levelOf(options);
      const notes = [523.25, 659.25, 783.99, 1046.5];

      notes.forEach(function (freq, i) {
        tone('triangle', at + i * 0.08, freq, freq, 0.2, 0.14 * level);
        tone('square', at + i * 0.08, freq * 2, freq * 2, 0.05, 0.02 * level);
      });
      [1046.5, 1318.51, 1567.98].forEach(function (freq) {
        tone('sine', at + 0.34, freq, freq * 1.002, 0.6, 0.06 * level);
      });
    }
  };

  /* --------------------------------------------------------------------
     Public surface
     -------------------------------------------------------------------- */

  function play(name, options) {
    const effect = effects[name];
    if (!effect || !isReady()) return;

    const opts = options || {};
    const now = performance.now();
    const gap = THROTTLE_MS[name] || 0;

    if (lastPlayed[name] && now - lastPlayed[name] < gap) return;
    lastPlayed[name] = now;

    try {
      effect(ctx.currentTime + (opts.delay || 0), opts);
    } catch (err) {
      /* A dropped sound must never break the page. */
    }
  }

  function toggle() {
    muted = !muted;
    saveMutedPreference();

    if (master) {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(muted ? 0 : MASTER_VOLUME, now + 0.12);
    }

    notifyChange();

    /* Confirm the new state audibly, once the fade has settled. */
    if (!muted) {
      window.setTimeout(function () { play('chime', {}); }, 140);
    }
    return muted;
  }

  function state() {
    return { muted: muted, unlocked: unlocked, supported: Boolean(AudioCtor) };
  }

  function onChange(handler) {
    changeHandlers.push(handler);
    handler(state());
  }

  function notifyChange() {
    const snapshot = state();
    changeHandlers.forEach(function (handler) { handler(snapshot); });
  }

  return {
    play: play,
    unlock: unlock,
    toggle: toggle,
    onChange: onChange,
    state: state,
    supported: Boolean(AudioCtor)
  };
})();
