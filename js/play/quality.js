/**
 * Run-A-Ton · quality.js
 * Three quality levels. The game starts on medium, measures the frame rate
 * for about 3 seconds of running, then moves up or down one level. After that
 * a watchdog steps down if the frame rate stays low for a few seconds.
 *
 * Levels:
 *   high:   up to 2x resolution, glow, halftone, light beams, outlines on the
 *           hall's furniture, full crowd and particles
 *   medium: up to 1.5x resolution, glow, halftone, light beams
 *   (both smooth edges with FXAA in the full-screen pass; a multisampled
 *   buffer halved the frame rate in tests)
 *   low:    1x resolution, no full-screen effects (no glow or halftone),
 *           no light beams, fewer particles and a smaller crowd
 */
export const LEVELS = {
  low: { name: 'low', maxPixelRatio: 1, post: false, samples: 0, glow: false, halftone: false, beams: false, hallOutlines: false, particles: 0.4, crowd: 0.5 },
  medium: { name: 'medium', maxPixelRatio: 1.5, post: true, samples: 0, glow: true, halftone: true, beams: true, hallOutlines: false, particles: 0.7, crowd: 0.8 },
  high: { name: 'high', maxPixelRatio: 2, post: true, samples: 0, glow: true, halftone: true, beams: true, hallOutlines: true, particles: 1, crowd: 1 },
};
const ORDER = ['low', 'medium', 'high'];

export class Quality {
  constructor(start = 'medium') {
    const forced = new URLSearchParams(location.search).get('quality');
    this.forced = ORDER.includes(forced);
    this.name = this.forced ? forced : start;
    this.listeners = [];
    this.resetProbe();
    this.settled = this.forced;
  }

  get level() {
    return LEVELS[this.name];
  }

  /** Device pixel ratio, capped by the level (never above 2). */
  pixelRatio() {
    return Math.min(window.devicePixelRatio || 1, this.level.maxPixelRatio, 2);
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  set(name) {
    if (name === this.name || !LEVELS[name]) return;
    this.name = name;
    this.listeners.forEach((fn) => fn(this.level));
  }

  resetProbe() {
    this.time = 0;
    this.frames = 0;
    this.slowTime = 0;
  }

  /**
   * Call once per frame while a run is playing, with the real frame time.
   * First ~3 s: decide the level. After that: step down if fps < 30 for 4 s.
   */
  sample(dt) {
    if (this.forced || dt <= 0 || dt > 0.5) return;
    this.time += dt;
    this.frames++;
    if (!this.settled) {
      if (this.time < 3) return;
      const fps = this.frames / this.time;
      const i = ORDER.indexOf(this.name);
      if (fps < 45 && i > 0) this.set(ORDER[i - 1]);
      else if (fps > 57 && i < ORDER.length - 1) this.set(ORDER[i + 1]);
      this.settled = true;
      this.resetProbe();
      return;
    }
    this.slowTime = dt > 1 / 30 ? this.slowTime + dt : Math.max(0, this.slowTime - dt * 0.5);
    if (this.slowTime > 4) {
      const i = ORDER.indexOf(this.name);
      if (i > 0) this.set(ORDER[i - 1]);
      this.slowTime = 0;
    }
  }
}
