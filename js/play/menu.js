/**
 * Run-A-Ton · menu.js
 * The start screen and the panels over it: the leaderboard, signing up / in
 * with a mascot for your icon, and how to play. Also the online part of the
 * game-over card (your place on the leaderboard, or a nudge to sign up).
 *
 * Playing never needs an account; the panels are for the leaderboard only.
 */
import { online, MASCOTS, mascotIndex, checkName, inAppBrowser } from './online.js';
import { formatScore, BUTTON_ICONS } from './ui.js';
import { CATALOG } from './progress.js';

const BOARD_REFRESH = 15000;   // ms between leaderboard updates while it's open
const TOP_STALE = 30000;       // ms before the start screen fetches the top runners again
const TICK = 2800;             // ms each top runner shows on the start screen's Leaderboard button

/** Makes an element: el('p', { class, text, onclick, ... }, ...children) */
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

/** A mascot icon (a cell of the avatars sprite). */
export function avatar(id, size = 40) {
  const i = mascotIndex(id);
  const a = el('span', { class: 'avatar', 'aria-hidden': 'true' });
  a.style.setProperty('--s', `${size}px`);
  a.style.setProperty('--col', String(i % 6));
  a.style.setProperty('--row', String(Math.floor(i / 6)));
  return a;
}

/** A thumbnail from the cast sprite (assets/play/cast.webp, 6 x 3 cells). */
function castIcon(i) {
  const c = el('span', { class: 'cast', 'aria-hidden': 'true' });
  c.style.backgroundPosition = `${-(i % 6) * 52}px ${-Math.floor(i / 6) * 52}px`;
  return c;
}

const DODGE = [['beetle', 0], ['firefly', 1], ['ant', 2], ['roly', 3], ['hopper', 4], ['stack', 5], ['chair', 6], ['board', 7], ['hurdle', 8], ['standee', 9]];
const GRAB = [['coffee', 11], ['shield', 12], ['magnet', 13], ['duck', 14], ['pizza', 15], ['rocket', 16]];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* Simple gesture pictures for "how to play" */
const SWIPE_SIDE = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="3" y="3" width="42" height="42" rx="12" fill="#FFE23A" stroke="#0C0E0F" stroke-width="3"/><path d="M9 24h30M15 18l-6 6 6 6M33 18l6 6-6 6" fill="none" stroke="#0C0E0F" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SWIPE_UP = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="3" y="3" width="42" height="42" rx="12" fill="#9EE6B8" stroke="#0C0E0F" stroke-width="3"/><path d="M24 38V12M17 19l7-7 7 7" fill="none" stroke="#0C0E0F" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="38" r="3.5" fill="#0C0E0F"/></svg>';
const SWIPE_DOWN = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="3" y="3" width="42" height="42" rx="12" fill="#B9D3FF" stroke="#0C0E0F" stroke-width="3"/><path d="M24 10v26M17 29l7 7 7-7" fill="none" stroke="#0C0E0F" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CROWN = '<svg viewBox="0 0 48 32" aria-hidden="true"><path d="M4 28 2 8l11 9 11-15 11 15 11-9-2 20z" fill="#FFD84A" stroke="#0C0E0F" stroke-width="3" stroke-linejoin="round"/><circle cx="24" cy="19" r="3.2" fill="#EF4225" stroke="#0C0E0F" stroke-width="2"/></svg>';
const svg = (markup) => { const t = document.createElement('template'); t.innerHTML = markup; return t.content.firstChild; };
const icon = (name) => svg(BUTTON_ICONS[name]);
/* Google's "G", as its sign-in button guidelines ask */
const GOOGLE_G = '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

export class Menu {
  /**
   * @param {object} o
   * @param {HTMLElement} o.root   the #app element
   * @param {() => void} o.onPlay  start a run
   * @param {() => void} o.onMenu  go back to the start screen
   */
  constructor({ root, onPlay, onMenu }) {
    this.root = root;
    this.onPlay = onPlay;
    this.onMenu = onMenu;
    const $ = (s) => root.querySelector(s);
    this.title = $('#title');
    this.sheet = $('#sheet');
    this.sheetCard = this.sheet.querySelector('.sheet__card');
    this.sheetTitle = $('#sheetTitle');
    this.sheetBody = $('#sheetBody');
    this.bestEl = $('#titleBest');
    this.tickerEl = $('#boardTicker');
    this.noticeEl = $('#notice');
    this.current = null;   // the open panel
    this.returnFocus = null;
    this.top = null;       // the top runners, for the start screen ({ rows, at })
    this.best = 0;

    $('#playBtn').addEventListener('click', () => this.onPlay());
    $('#boardBtn').addEventListener('click', () => this.open('leaderboard'));
    $('#howBtn').addEventListener('click', () => this.open('how'));
    this.sheet.querySelector('.sheet__close').addEventListener('click', () => this.close());
    this.sheet.addEventListener('click', (e) => { if (e.target === this.sheet) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.current) { e.preventDefault(); this.close(); } });

    this.drawBurst();
    online.onChange(() => {
      if (this.current === 'profile' && !this.busy) this.renderProfile();
      if (!this.title.hidden) { this.setBest(this.best); this.refreshTop(true); }
    });
  }

  /** The sunburst behind the logo, drawn once (a CSS mask on it was redrawn every frame). */
  drawBurst() {
    const burst = this.title.querySelector('.title__burst');
    if (!burst) return;
    try {
      const S = 420;
      const cv = document.createElement('canvas');
      cv.width = cv.height = S;
      const g = cv.getContext('2d');
      const c = S / 2;
      const rays = 24;
      g.fillStyle = 'rgba(255, 226, 58, 1)';
      for (let i = 0; i < rays; i++) {
        const a0 = (i / rays) * Math.PI * 2;
        const a1 = a0 + Math.PI / rays;
        g.beginPath();
        g.moveTo(c, c);
        g.arc(c, c, c, a0, a1);
        g.closePath();
        g.fill();
      }
      // fade out from the middle (what the mask did)
      g.globalCompositeOperation = 'destination-in';
      const fade = g.createRadialGradient(c, c, 0, c, c, c);
      fade.addColorStop(0, 'rgba(0,0,0,0.5)');
      fade.addColorStop(0.32, 'rgba(0,0,0,0.38)');
      fade.addColorStop(0.68, 'rgba(0,0,0,0.09)');
      fade.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = fade;
      g.fillRect(0, 0, S, S);
      burst.style.backgroundImage = `url(${cv.toDataURL('image/png')})`;
    } catch (e) {
      burst.hidden = true;
    }
  }

  /** A panel is open (the game ignores its controls meanwhile). */
  get blocking() { return !!this.current; }

  /* --- start screen ----------------------------------------------------- */
  showTitle(best) {
    this.title.classList.remove('is-leaving');
    this.title.hidden = false;
    this.setBest(best);
    this.refreshTop();
  }

  /** Fades the start screen out (when a run starts). */
  hideTitle() {
    this.noticeEl.hidden = true;
    clearInterval(this.tickTimer);
    if (this.title.hidden) return;
    this.close();
    this.title.classList.add('is-leaving');
    clearTimeout(this.leaveTimer);
    this.leaveTimer = setTimeout(() => { this.title.hidden = true; this.title.classList.remove('is-leaving'); }, 340);
  }

  /** "Your best 12,340"; signed in, with your mascot, name and place on the board. */
  setBest(best) {
    this.best = best;
    const p = online.signedIn && online.profile;
    this.bestEl.hidden = !(best > 0 || p);
    const me = p && this.top && this.top.rows.find((r) => r.is_me);
    this.bestEl.replaceChildren(...(p
      ? [avatar(p.mascot, 24), el('span', { class: 'title__me', text: p.username }), best > 0 && ' · best ', best > 0 && el('b', { text: formatScore(best) }), me && el('span', { class: 'title__rank', text: `#${me.rank}` })]
      : ['Your best ', el('b', { text: formatScore(best) })]).filter(Boolean));
  }

  /**
   * The start screen's Leaderboard button shows who's on top, one runner at a
   * time ("#1 Asha · 48,210"), so the board feels alive before you open it.
   */
  async refreshTop(force = false) {
    if (!this.tickerEl) return;
    if (force || !this.top || Date.now() - this.top.at > TOP_STALE) {
      if (!this.top) this.setTicker('Live now', true);
      try {
        this.top = { rows: await online.leaderboard(5), at: Date.now() };
      } catch (e) {
        this.top = null;
        this.setTicker(e.kind === 'not-set-up' ? 'Opens soon' : 'Top runners');
        return;
      }
      this.setBest(this.best);
    }
    const rows = this.top.rows;
    clearInterval(this.tickTimer);
    if (!rows.length) { this.setTicker('Be the first!', true); return; }
    let i = 0;
    const show = () => {
      const r = rows[i % rows.length];
      this.setTicker(`#${r.rank} ${r.username} · ${formatScore(r.score)}`, true);
      i++;
    };
    show();
    if (rows.length > 1) this.tickTimer = setInterval(() => { if (!this.title.hidden) show(); }, TICK);
  }

  setTicker(text, live = false) {
    const t = this.tickerEl;
    t.classList.toggle('is-live', live);
    const line = el('span', { class: 'ticker__line', text });
    t.replaceChildren(line);
  }

  /** A short message over the start screen. */
  notice(text, ms = 4200) {
    this.noticeEl.textContent = text;
    this.noticeEl.hidden = false;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => { this.noticeEl.hidden = true; }, ms);
  }

  /* --- panels -------------------------------------------------------------- */
  open(name, opts = {}) {
    if (!this.current) this.returnFocus = document.activeElement;
    this.current = name;
    clearInterval(this.boardTimer);
    this.sheet.hidden = false;
    this.sheetCard.scrollTop = 0;
    this.sheetCard.classList.toggle('sheet__card--board', name === 'leaderboard');
    if (name === 'leaderboard') this.renderLeaderboard();
    else if (name === 'profile') this.renderProfile(opts.mode);
    else if (name === 'how') this.renderHow();
    requestAnimationFrame(() => {
      const first = this.sheetBody.querySelector('input, button') || this.sheet.querySelector('.sheet__close');
      if (first && !('ontouchstart' in window)) first.focus({ preventScroll: true });
    });
  }

  close() {
    if (!this.current) return;
    if (this.current === 'leaderboard' && !this.title.hidden) this.refreshTop(true);
    clearInterval(this.boardTimer);
    this.current = null;
    this.sheet.hidden = true;
    this.sheetBody.replaceChildren();
    if (this.returnFocus && this.returnFocus.focus) this.returnFocus.focus({ preventScroll: true });
  }

  setPanel(title, ...content) {
    this.sheetTitle.textContent = title;
    this.sheetBody.replaceChildren(...content.flat().filter(Boolean));
  }

  /* Leaderboard: the top three on a podium, then everyone else. It updates
     itself every few seconds while it's open. */
  async renderLeaderboard(refresh = false) {
    const live = el('span', { class: 'live' }, el('i'), 'Live');
    if (!refresh) {
      const skeleton = el('div', { class: 'board', 'aria-busy': 'true' },
        el('div', { class: 'podium podium--loading' }, [2, 1, 3].map((n) => el('div', { class: `podium__spot podium__spot--${n}` }, el('span', { class: 'podium__ghost' }), el('div', { class: 'podium__block' }, el('span', { text: String(n) }))))),
        el('ol', { class: 'lb' }, Array.from({ length: 4 }, () => el('li', { class: 'lb__skeleton' }))));
      this.setPanel('Leaderboard', skeleton);
      this.sheetTitle.append(live);
    }
    let rows;
    try {
      rows = await online.leaderboard(50);
    } catch (e) {
      if (this.current !== 'leaderboard') return;
      if (refresh) return; // keep what's showing; try again next time
      this.sheetTitle.querySelector('.live')?.remove();
      this.setPanel('Leaderboard',
        el('div', { class: 'lb__empty' }, el('p', { text: e.message }),
          e.kind !== 'not-set-up' && el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => this.open('leaderboard') }, icon('restart'), 'Try again')),
        this.boardFoot(null));
      return;
    }
    if (this.current !== 'leaderboard') return;
    let me = null;
    if (online.signedIn && !rows.some((r) => r.is_me)) me = await online.myRank().catch(() => null);
    if (this.current !== 'leaderboard') return;

    const top = [1, 2, 3].map((n) => rows[n - 1] || null);
    const spot = (r, n) => el('div', { class: `podium__spot podium__spot--${n}${r && r.is_me ? ' is-me' : ''}`, style: `--i:${n}` },
      n === 1 && el('span', { class: 'podium__crown' }, svg(CROWN)),
      r ? avatar(r.mascot, n === 1 ? 62 : 50) : el('span', { class: 'avatar podium__empty', style: `--s:${n === 1 ? 62 : 50}px` }),
      el('b', { class: 'podium__name', text: r ? r.username : 'Your spot?' }),
      el('span', { class: 'podium__score', text: r ? formatScore(r.score) : '—' }),
      el('div', { class: 'podium__block' }, el('span', { text: String(n) })));
    const podium = el('div', { class: 'podium' }, spot(top[1], 2), spot(top[0], 1), spot(top[2], 3));

    const rest = rows.slice(3);
    const list = rest.length ? el('ol', { class: 'lb' }, rest.map((r, i) => el('li', { class: `lb__row${r.is_me ? ' is-me' : ''}`, style: `--i:${Math.min(i, 12)}` },
      el('span', { class: 'lb__rank', text: String(r.rank) }),
      avatar(r.mascot, 36),
      el('span', { class: 'lb__name', text: r.username }),
      el('span', { class: 'lb__score', text: formatScore(r.score) })))) : null;

    const stamp = el('p', { class: 'lb__stamp' }, rows.length
      ? `${rows.length >= 50 ? '50+' : rows.length} ${rows.length === 1 ? 'runner' : 'runners'} on the board · updates live`
      : '');
    const empty = !rows.length && el('div', { class: 'lb__empty lb__empty--first' },
      el('b', { text: 'No scores yet!' }),
      el('p', { text: 'The podium is waiting. Add your name, run, and take the crown.' }),
      el('button', { class: 'btn btn--sm', type: 'button', onclick: () => { this.close(); this.onPlay(); } }, 'Play now'));

    const scroll = this.sheetCard.scrollTop;
    this.setPanel('Leaderboard', el('div', { class: `board${refresh ? ' is-refresh' : ''}` }, podium, empty, list, rows.length ? stamp : null), this.boardFoot(rows.find((r) => r.is_me) || me));
    this.sheetTitle.append(live);
    if (refresh) this.sheetCard.scrollTop = scroll;

    clearInterval(this.boardTimer);
    this.boardTimer = setInterval(() => {
      if (this.current === 'leaderboard' && !document.hidden) this.renderLeaderboard(true);
    }, BOARD_REFRESH);
  }

  /** The bar under the board: your place (signed in), or how to get on it. */
  boardFoot(me) {
    if (online.signedIn) {
      const p = online.profile || { username: 'You', mascot: 'red-cool' };
      return el('div', { class: 'lb__foot lb__foot--me' }, avatar(p.mascot, 36),
        el('span', { class: 'lb__name', text: p.username }),
        el('span', { class: 'lb__you' }, me ? [el('b', { text: `#${me.rank}` }), ` · ${formatScore(me.score)}`] : 'Your next run counts!'));
    }
    return el('div', { class: 'lb__foot' },
      el('p', {}, el('b', { text: 'Want your name up here?' }), el('br'), 'Pick a name and a mascot. No email needed.'),
      el('button', { class: 'btn btn--sm', type: 'button', onclick: () => this.open('profile') }, 'Add your name'));
  }

  /* Profile: sign up / sign in, or your name and icon */
  renderProfile(mode) {
    if (mode === 'recovery') { this.renderNewPassword(); return; }
    if (online.signedIn) this.renderMe();
    else this.renderAuth(mode === 'signin' || online.pendingEmail ? 'signin' : this.authTab || 'signup');
  }

  mascotPicker(selected, onPick) {
    const picker = el('div', { class: 'picker', role: 'radiogroup', 'aria-label': 'Pick your mascot' });
    const buttons = MASCOTS.map((m) => {
      const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(m.id === selected), 'aria-label': m.name, title: m.name }, avatar(m.id, 44));
      b.addEventListener('click', () => {
        for (const x of buttons) x.setAttribute('aria-checked', 'false');
        b.setAttribute('aria-checked', 'true');
        onPick(m.id);
      });
      return b;
    });
    picker.append(...buttons);
    return picker;
  }

  field(label, attrs, hint = '') {
    const input = el('input', attrs);
    return { input, node: el('label', { class: 'field' }, el('span', { text: label }), input, hint && el('small', { text: hint })) };
  }

  /** "Continue with Google" above the email form; inside an app's own browser
      (where Google refuses to sign in) a note on opening a real one instead */
  googleOption() {
    if (inAppBrowser()) {
      return el('p', { class: 'msg oauth-note' }, 'Google sign-in doesn’t work inside this app. Tap ', el('b', { text: '⋯' }), ' and choose ', el('b', { text: 'Open in browser' }), ', or use your email below. New here? Just use ', el('b', { text: 'Join' }), '.');
    }
    const go = el('button', { class: 'btn btn--google', type: 'button' }, svg(GOOGLE_G), 'Continue with Google');
    go.addEventListener('click', () => {
      go.disabled = true;
      this.busy = true;
      online.signInWithGoogle();
    });
    return el('div', { class: 'oauth' }, go, el('p', { class: 'oauth__or' }, el('span', { text: 'or with email' })));
  }

  renderAuth(tab) {
    this.authTab = tab;
    const tabs = el('div', { class: 'tabs', role: 'tablist' },
      el('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === 'signup'), onclick: () => this.renderAuth('signup') }, 'Join'),
      el('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === 'signin'), onclick: () => this.renderAuth('signin') }, 'Sign in'));
    const msg = el('p', { class: 'msg', role: 'status' });
    const say = (text, kind = '') => { msg.className = `msg${kind ? ' msg--' + kind : ''}`; msg.textContent = text; };

    // Join: just a name and a mascot, straight onto the leaderboard (online.joinWithName)
    if (tab === 'signup') {
      let mascot = this.pickedMascot || MASCOTS[Math.floor(Math.random() * MASCOTS.length)].id;
      this.pickedMascot = mascot;
      const name = this.field('Your name on the leaderboard', { type: 'text', maxlength: '16', autocomplete: 'nickname', autocapitalize: 'words', spellcheck: 'false', placeholder: 'e.g. Bug Squasher' }, '3–16 letters, numbers, spaces, . _ -');
      const go = el('button', { class: 'btn', type: 'submit' }, 'Join the leaderboard');
      const form = el('form', { class: 'form', novalidate: true }, name.node, el('div', { class: 'field' }, el('span', { text: 'Pick your mascot' }), this.mascotPicker(mascot, (id) => { mascot = id; this.pickedMascot = id; })), go, msg,
        el('p', { class: 'muted', text: 'No email, no password. Your name is saved in this browser; your best run goes up straight away.' }));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const n = checkName(name.input.value);
        if (!n.ok) { say(n.why, 'bad'); name.input.focus(); return; }
        go.disabled = true;
        this.busy = true;
        say('Adding you to the leaderboard…');
        try {
          if (!(await online.usernameAvailable(n.name))) { say('That name is taken. Try another.', 'bad'); name.input.focus(); return; }
          await online.joinWithName({ username: n.name, mascot });
          this.busy = false;
          this.renderMe();
          this.notice(`Welcome, ${n.name}! You're on the leaderboard.`);
        } catch (err) {
          say(err.message, 'bad');
        } finally {
          go.disabled = false;
          this.busy = false;
        }
      });
      this.setPanel('Join the leaderboard', tabs, form);
    } else {
      const email = this.field('Email', { type: 'email', autocomplete: 'email', inputmode: 'email', value: online.pendingEmail || undefined });
      const pass = this.field('Password', { type: 'password', autocomplete: 'current-password' });
      const go = el('button', { class: 'btn', type: 'submit' }, 'Sign in');
      const forgot = el('button', { class: 'linkish', type: 'button' }, 'Forgot your password?');
      const form = el('form', { class: 'form', novalidate: true }, email.node, pass.node, go, forgot, msg);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!EMAIL.test(email.input.value.trim()) || !pass.input.value) { say('Enter your email and password.', 'bad'); return; }
        go.disabled = true;
        this.busy = true;
        say('Signing in…');
        try {
          await online.signIn({ email: email.input.value.trim(), password: pass.input.value });
          this.busy = false;
          this.renderMe();
          this.notice(`Welcome back, ${online.profile ? online.profile.username : 'player'}!`);
        } catch (err) {
          say(err.message, 'bad');
        } finally {
          go.disabled = false;
          this.busy = false;
        }
      });
      forgot.addEventListener('click', async () => {
        if (!EMAIL.test(email.input.value.trim())) { say('Type your email above first.', 'bad'); email.input.focus(); return; }
        try {
          await online.resetPassword(email.input.value.trim());
          say('Check your inbox for a link to set a new password.', 'good');
        } catch (err) { say(err.message, 'bad'); }
      });
      this.setPanel('Welcome back', tabs, this.googleOption(), form);
    }
  }

  renderMe() {
    const p = online.profile || { username: 'Player', mascot: 'red-cool' };
    let mascot = p.mascot;
    const msg = el('p', { class: 'msg', role: 'status' });
    const say = (text, kind = '') => { msg.className = `msg${kind ? ' msg--' + kind : ''}`; msg.textContent = text; };
    const big = avatar(mascot, 64);
    const rank = el('span', { class: 'muted', text: online.session && online.session.user ? online.session.user.email : '' });
    const card = el('div', { class: 'me-card' }, big, el('div', {}, el('b', { text: p.username }), rank));
    const name = this.field('Your name on the leaderboard', { type: 'text', maxlength: '16', autocomplete: 'nickname', value: p.username, spellcheck: 'false' });
    const save = el('button', { class: 'btn', type: 'submit' }, 'Save');
    const picker = this.mascotPicker(mascot, (id) => { mascot = id; });
    const form = el('form', { class: 'form', novalidate: true },
      el('div', { class: 'field' }, el('span', { text: 'Your mascot' }), picker), name.node, save, msg,
      el('button', { class: 'btn btn--ghost', type: 'button', onclick: async () => { await online.signOut(); this.renderAuth(online.pendingEmail ? 'signin' : 'signup'); this.notice('Signed out.'); } }, 'Sign out'),
      online.anonymous && el('p', { class: 'muted', text: 'You joined with just a name, so it lives in this browser: signing out (or clearing the browser) means joining again under a new name.' }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const n = checkName(name.input.value);
      if (!n.ok) { say(n.why, 'bad'); return; }
      save.disabled = true;
      this.busy = true;
      say('Saving…');
      try {
        await online.updateProfile({ username: n.name, mascot });
        say('Saved!', 'good');
        card.querySelector('b').textContent = n.name;
      } catch (err) {
        say(err.message, 'bad');
      } finally {
        save.disabled = false;
        this.busy = false;
      }
    });
    // keep the big icon in step with the picker
    picker.addEventListener('click', () => { const now = card.querySelector('.avatar'); if (now) now.replaceWith(avatar(mascot, 64)); });
    this.setPanel('Your profile', card, form);
    online.myRank().then((me) => {
      if (me && this.current === 'profile') {
        rank.textContent = `#${me.rank} on the leaderboard · best ${formatScore(me.score)}`;
      }
    }).catch(() => {});
  }

  renderNewPassword() {
    const msg = el('p', { class: 'msg', role: 'status' });
    const pass = this.field('New password', { type: 'password', autocomplete: 'new-password', minlength: '6' });
    const go = el('button', { class: 'btn', type: 'submit' }, 'Save password');
    const form = el('form', { class: 'form', novalidate: true }, pass.node, go, msg);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (pass.input.value.length < 6) { msg.className = 'msg msg--bad'; msg.textContent = 'At least 6 characters.'; return; }
      go.disabled = true;
      try {
        await online.setPassword(pass.input.value);
        this.renderMe();
        this.notice('Password changed.');
      } catch (err) {
        msg.className = 'msg msg--bad';
        msg.textContent = err.message;
      } finally {
        go.disabled = false;
      }
    });
    this.setPanel('Set a new password', form);
  }

  /* How to play */
  renderHow() {
    const move = (pic, title, text) => el('div', { class: 'howto-move' }, svg(pic), el('div', {}, el('b', { text: title }), el('div', { class: 'muted', text })));
    const item = ([type, i]) => el('div', { class: 'cast-item' }, castIcon(i), el('div', {}, el('b', { text: CATALOG[type].name }), el('small', { text: CATALOG[type].hint })));
    this.setPanel('How to play',
      el('div', { class: 'howto-moves' },
        move(SWIPE_SIDE, 'Swipe left or right', 'Switch lanes'),
        move(SWIPE_UP, 'Tap or swipe up', 'Jump'),
        move(SWIPE_DOWN, 'Swipe down', 'Slide (in the air: dive)')),
      el('p', { class: 'muted', text: 'On a keyboard: arrow keys or WASD, and space to jump.' }),
      el('h3', { text: 'Dodge these' }),
      el('div', { class: 'cast-grid' }, DODGE.map(item)),
      el('h3', { text: 'Grab these' }),
      el('div', { class: 'cast-grid' }, GRAB.map(item)),
      el('h3', { text: 'Scoring' }),
      el('p', { text: 'Points for every metre, sparkle, close call and squashed bug, times your level. Every level makes you faster and brings something new. Get through an event (BUG SWARM!) for a bonus.' }),
      el('button', { class: 'btn', type: 'button', onclick: () => { this.close(); this.onPlay(); } }, "Let's go!"));
  }

  /* --- game over ----------------------------------------------------------- */
  /** Sends the run (when signed in) and shows where it put you. */
  gameOver(run, slot) {
    const line = el('p', { class: 'result__line' });
    const row = el('div', { class: 'result__row' },
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => this.open('leaderboard') }, icon('trophy'), 'Leaderboard'),
      !online.signedIn && el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => this.open('profile', { mode: online.pendingEmail ? 'signin' : undefined }) }, icon('user'), online.pendingEmail ? 'Sign in' : 'Add your name'),
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => this.onMenu() }, icon('home'), 'Home'));
    slot.replaceChildren(el('div', { class: 'result' }, line, row));
    if (!online.signedIn) {
      online.noteRun(run);
      line.textContent = online.pendingEmail
        ? 'Confirmed your email? Sign in here to put this run on the leaderboard.'
        : 'Add your name to put this run on the leaderboard. No email needed!';
      return;
    }
    line.textContent = 'Sending your score…';
    online.submitRun(run).then((res) => {
      if (!res) return;
      line.replaceChildren(el('b', { text: `#${res.rank}` }), ` on the leaderboard · your best ${formatScore(res.best)}`);
    }).catch((err) => {
      line.textContent = err.message;
    });
  }
}
