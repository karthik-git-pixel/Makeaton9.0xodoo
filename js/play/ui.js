/**
 * Run-A-Ton · ui.js
 * The page around the 3D view: HUD (score, multiplier, sparkles, power-up
 * timers, pause), tips the first times something new turns up, the level-up
 * banner, overlays, and input.
 *
 * Input, one thumb: swipe left/right = change lane, tap or swipe up = jump,
 * swipe down = slide. A swipe is recognised as soon as the finger has moved
 * far enough (it doesn't wait for the finger to lift). Desktop: arrow keys,
 * WASD and space.
 */

/** "12,340" (one formatter, made once: building one per call is slow) */
const NUMBER = new Intl.NumberFormat('en-US');
export const formatScore = (n) => NUMBER.format(Math.max(0, Math.floor(n)));

/** "1.2 km" or "850 m" */
export const formatDistance = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.floor(m)} m`);

/* Power-up icons for the HUD (24 x 24, drawn in the HUD's ink style). */
const ICONS = {
  coffee: '<path d="M5 8h12v5.5A5.5 5.5 0 0 1 11.5 19h-1A5.5 5.5 0 0 1 5 13.5z"/><path class="i-line" d="M17 10h1.2a2.4 2.4 0 0 1 0 4.8H17"/><path class="i-line" d="M9 2.5c-1 1.2 1 1.8 0 3M13 2.5c-1 1.2 1 1.8 0 3"/>',
  shield: '<path d="M12 2.5l7.5 2.8v5.6c0 4.8-3.2 8.6-7.5 10.6-4.3-2-7.5-5.8-7.5-10.6V5.3z"/><path class="i-dot" d="M12 7c.5 2.4 1.3 3.2 3.5 3.6-2.2.4-3 1.2-3.5 3.6-.5-2.4-1.3-3.2-3.5-3.6C10.7 10.2 11.5 9.4 12 7z"/>',
  magnet: '<path class="i-line i-thick" d="M3.5 9.5a12 12 0 0 1 17 0M7 13a7 7 0 0 1 10 0M10.2 16.4a2.6 2.6 0 0 1 3.6 0"/><circle cx="12" cy="19.6" r="1.7"/>',
  duck: '<path d="M3.5 13.5c0 3.8 3.3 6.5 8.3 6.5 4.6 0 8.2-2.2 8.2-6 0-1.6-1-2.6-2.6-2.6h-1.8a4.6 4.6 0 1 0-8.2-2.8c0 .9.2 1.7.6 2.4H5.6c-1.3 0-2.1.9-2.1 2.5z"/><path class="i-dot" d="M15.8 7.3l3.7.9-3.6 1.2z"/><circle class="i-ink" cx="12.6" cy="6.9" r="0.9"/>',
  pizza: '<path d="M12 21.5L3.2 5.6C8.9 2.6 15.1 2.6 20.8 5.6z"/><circle class="i-dot" cx="10" cy="9" r="1.6"/><circle class="i-dot" cx="14.2" cy="10.4" r="1.4"/><circle class="i-dot" cx="12" cy="14.6" r="1.3"/>',
  rocket: '<path d="M12 2c3.2 2.6 4.6 6.2 4.6 10.2l-1.6 4.3H9l-1.6-4.3C7.4 8.2 8.8 4.6 12 2z"/><path class="i-dot" d="M7.6 12.6L4.5 16v3l3.6-2.2zM16.4 12.6l3.1 3.4v3l-3.6-2.2z"/><circle class="i-win" cx="12" cy="9" r="1.8"/>',
};
const POWER_ORDER = ['rocket', 'coffee', 'duck', 'magnet', 'pizza', 'shield'];

/* Small icons for the card's buttons */
export const BUTTON_ICONS = {
  home: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3.2 2.8 11h2.7v9.3h5V15h3v5.3h5V11h2.7z"/></svg>',
  restart: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 4.5a7.5 7.5 0 1 1-7.1 9.9l2.6-.9A4.8 4.8 0 1 0 12 7.2c-1.4 0-2.6.6-3.5 1.5L11 11.2H3.8V4l2.8 2.8A7.4 7.4 0 0 1 12 4.5z"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3V3zm0 4H6v1a2 2 0 0 0 1.1 1.8A5 5 0 0 1 7 9V7zm10 0v2a5 5 0 0 1-.1.8A2 2 0 0 0 18 8V7h-1z"/></svg>',
  user: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-4.4 0-8 2.3-8 5.2V21h16v-1.8c0-2.9-3.6-5.2-8-5.2z"/></svg>',
};

export class UI {
  constructor(root) {
    this.root = root;
    const $ = (s) => root.querySelector(s);
    this.score = $('#score');
    this.mult = $('#mult');
    this.sparkles = $('#sparkles');
    this.powers = $('#powers');
    this.gainEl = $('#gain');
    this.pauseBtn = $('#pauseBtn');
    this.toastEl = $('#toast');
    this.levelEl = $('#levelup');
    this.overlay = $('#overlay');
    this.overlayBadge = $('#overlayBadge');
    this.overlayTitle = $('#overlayTitle');
    this.overlayScore = $('#overlayScore');
    this.overlayText = $('#overlayText');
    this.overlayStats = $('#overlayStats');
    this.overlayBtn = $('#overlayBtn');
    this.overlaySlot = $('#overlaySlot');
    this.debug = $('#debug');
    this.lastScore = -1;
    this.lastMult = '';
    this.lastScoreText = '0';
    this.powerEls = new Map();
    this.toasts = [];      // queued tips
    this.toastT = 0;       // seconds the current tip has been up (0: none)
    this.levelT = 0;
  }

  setScore(n) {
    const v = Math.floor(n);
    if (v === this.lastScore) return;
    this.lastScore = v;
    this.lastScoreText = formatScore(v);
    this.score.textContent = this.lastScoreText;
  }

  /** The score multiplier; `doubled` while the pizza is on. */
  setMultiplier(m, doubled = false) {
    const key = m + (doubled ? 'p' : '');
    if (key === this.lastMult) return;
    const up = this.lastMult && parseInt(this.lastMult, 10) < m;
    this.lastMult = key;
    this.mult.textContent = `×${m}`;
    this.mult.classList.toggle('is-doubled', doubled);
    if (up) this.bump(this.mult);
  }

  /** The sparkle count; `pop` gives the chip a little bounce (one was just collected). */
  setSparkles(n, pop = false) {
    this.sparkles.textContent = String(n);
    if (pop) this.bump(this.sparkles.parentElement, 'is-pop');
  }

  /** "+150 SQUASHED" floating up beside the score. */
  gain(text) {
    this.gainEl.textContent = text;
    this.bump(this.gainEl, 'is-on');
  }

  /** Restarts a CSS animation on an element. */
  bump(el, cls = 'is-bump') {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /**
   * Active power-ups with how much time is left (0..1); `ending` makes it blink.
   * @param {Array<{kind:string, left:number, ending:boolean}>} list
   */
  setPowers(list) {
    const seen = new Set();
    for (const p of list) {
      seen.add(p.kind);
      let el = this.powerEls.get(p.kind);
      if (!el) {
        el = document.createElement('div');
        el.className = 'power';
        el.dataset.kind = p.kind;
        el.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${ICONS[p.kind] || ''}</svg><span class="power__bar"><i></i></span>`;
        el.bar = el.querySelector('i');
        el.left = -1;
        this.powerEls.set(p.kind, el);
        // keep a steady order
        const after = [...this.powers.children].find((c) => POWER_ORDER.indexOf(c.dataset.kind) > POWER_ORDER.indexOf(p.kind));
        this.powers.insertBefore(el, after || null);
      }
      if (Math.abs(el.left - p.left) > 0.004) {
        el.left = p.left;
        el.bar.style.transform = `scaleX(${Math.max(0, Math.min(1, p.left)).toFixed(3)})`;
      }
      el.classList.toggle('is-ending', !!p.ending);
    }
    for (const [kind, el] of this.powerEls) {
      if (!seen.has(kind)) { el.remove(); this.powerEls.delete(kind); }
    }
  }

  /** A tip card the first times something new comes down the aisle. */
  toast(entry) {
    if (this.toasts.length < 3) this.toasts.push(entry);
  }

  /** "LEVEL 3 · ×3 POINTS" banner. */
  levelUp(level, mult) {
    this.levelEl.querySelector('b').textContent = `LEVEL ${level}`;
    this.levelEl.querySelector('span').textContent = `×${mult} points`;
    this.levelEl.hidden = false;
    this.bump(this.levelEl, 'is-on');
    this.levelT = 1.7;
  }

  /** Timers for the tips and the banner (game time, so tests can step them). */
  update(dt) {
    if (this.levelT > 0) {
      this.levelT -= dt;
      if (this.levelT <= 0) this.levelEl.hidden = true;
    }
    if (this.toastT > 0) {
      this.toastT += dt;
      if (this.toastT > 2.6 && !this.toastEl.classList.contains('is-out')) this.toastEl.classList.add('is-out');
      if (this.toastT > 2.9) { this.toastEl.hidden = true; this.toastT = 0; }
    } else if (this.toasts.length) {
      const e = this.toasts.shift();
      const el = this.toastEl;
      el.querySelector('.toast__tag').textContent = e.tag;
      el.querySelector('.toast__name').textContent = e.name;
      el.querySelector('.toast__hint').textContent = e.hint;
      const c = e.color || '#FCC230';
      const lum = (parseInt(c.slice(1, 3), 16) * 0.299 + parseInt(c.slice(3, 5), 16) * 0.587 + parseInt(c.slice(5, 7), 16) * 0.114) / 255;
      el.style.setProperty('--accent', c);
      el.style.setProperty('--accent-ink', lum > 0.62 ? '#0C0E0F' : '#FFF8EE');
      el.classList.remove('is-out');
      el.hidden = false;
      this.bump(el, 'is-in');
      this.toastT = 1e-4;
    }
  }

  /** Clears the tips and the banner (a new run). */
  clearMessages() {
    this.toasts.length = 0;
    this.toastT = 0;
    this.toastEl.hidden = true;
    this.levelT = 0;
    this.levelEl.hidden = true;
    this.setPowers([]);
  }

  setHudVisible(on) {
    this.root.classList.toggle('is-running', on);
  }

  /**
   * Shows the overlay card; `button` is the label of its one action.
   * place: 'center' | 'top' | 'bottom' (keeps the card off the star).
   * score: a big number under the title; badge: a sticker above it;
   * stats: [[value, label], ...] in a row.
   */
  show({ title, text = '', button, place = 'center', score = null, badge = '', stats = null }) {
    this.overlayTitle.textContent = title;
    this.overlayText.textContent = text;
    this.overlayText.hidden = !text;
    this.overlayBtn.textContent = button;
    this.overlayBadge.textContent = badge;
    this.overlayBadge.hidden = !badge;
    this.overlayScore.textContent = score === null ? '' : formatScore(score);
    this.overlayScore.hidden = score === null;
    this.overlayStats.replaceChildren();
    if (stats) {
      for (const [value, label] of stats) {
        const d = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = label;
        dd.textContent = value;
        d.append(dd, dt);
        this.overlayStats.append(d);
      }
    }
    this.overlayStats.hidden = !stats;
    this.overlaySlot.replaceChildren();
    this.overlay.dataset.place = place;
    this.overlay.hidden = false;
  }

  /**
   * A row of small buttons under the card's main one (Restart, Home...).
   * @param {Array<{label:string, icon?:string, onClick:() => void}>} list
   */
  actions(list) {
    const row = document.createElement('div');
    row.className = 'card__actions';
    for (const a of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn--ghost btn--sm';
      b.innerHTML = `${a.icon && BUTTON_ICONS[a.icon] ? BUTTON_ICONS[a.icon] : ''}<span>${a.label}</span>`;
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => { e.stopPropagation(); a.onClick(); });
      row.append(b);
    }
    this.overlaySlot.replaceChildren(row);
  }

  hide() {
    this.overlay.hidden = true;
  }

  setDebug(text) {
    if (this.debug) this.debug.textContent = text;
  }
}

/**
 * Binds touch/mouse gestures on `surface` and keys on the window.
 * handlers: { action(name) } where name is 'left' | 'right' | 'jump' | 'slide' | 'tap'.
 * 'tap' (a tap, space, up arrow or W) jumps during a run; on menus it starts or retries.
 * Taps on the menus (anything marked data-ui) and typing in a form are left alone.
 */
export function bindInput(surface, { action }) {
  let start = null;

  const threshold = () => Math.max(22, surface.clientWidth * 0.045);
  const onMenu = (t) => !!(t && t.closest && t.closest('[data-ui], button, a, input, textarea, select'));

  surface.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (onMenu(e.target)) { start = null; return; }
    start = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, done: false };
    try { surface.setPointerCapture(e.pointerId); } catch (err) { /* not supported: fine */ }
  });

  surface.addEventListener('pointermove', (e) => {
    if (!start || start.done || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const th = threshold();
    if (Math.abs(dx) < th && Math.abs(dy) < th) return;
    start.done = true;
    if (Math.abs(dx) > Math.abs(dy)) action(dx < 0 ? 'left' : 'right');
    else action(dy < 0 ? 'jump' : 'slide');
  });

  const end = (e) => {
    if (!start || e.pointerId !== start.id) return;
    if (!start.done && performance.now() - start.t < 450) action('tap');
    start = null;
  };
  surface.addEventListener('pointerup', end);
  surface.addEventListener('pointercancel', () => { start = null; });

  // Long-press menus and double-tap zoom off on the play surface
  surface.addEventListener('contextmenu', (e) => e.preventDefault());

  const KEYS = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
    ArrowDown: 'slide', KeyS: 'slide',
  };
  window.addEventListener('keydown', (e) => {
    const name = KEYS[e.code];
    if (!name) return;
    if (e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return; // typing
    if (e.target && e.target.closest && e.target.closest('button') && (e.code === 'Space')) return; // let buttons click
    e.preventDefault();
    if (e.repeat && (name === 'left' || name === 'right')) return;
    action(name === 'jump' ? 'tap' : name);
  });
}
