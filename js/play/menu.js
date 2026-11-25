/**
 * Run-A-Ton · menu.js
 * The start screen and the panels over it: the leaderboard, signing up / in
 * with a mascot for your icon, and how to play. Also the online part of the
 * game-over card (your place on the leaderboard, or a nudge to sign up).
 *
 * Playing never needs an account; the panels are for the leaderboard only.
 */
import { online, MASCOTS, mascotIndex, checkName } from './online.js';
import { formatScore } from './ui.js';
import { CATALOG } from './progress.js';

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
const TROPHY = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3V3zm0 4H6v1a2 2 0 0 0 1.1 1.8A5 5 0 0 1 7 9V7zm10 0v2a5 5 0 0 1-.1.8A2 2 0 0 0 18 8V7h-1z"/></svg>';
const svg = (markup) => { const t = document.createElement('template'); t.innerHTML = markup; return t.content.firstChild; };

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
    this.noticeEl = $('#notice');
    this.current = null;   // the open panel
    this.returnFocus = null;

    $('#playBtn').addEventListener('click', () => this.onPlay());
    $('#boardBtn').addEventListener('click', () => this.open('leaderboard'));
    $('#howBtn').addEventListener('click', () => this.open('how'));
    this.sheet.querySelector('.sheet__close').addEventListener('click', () => this.close());
    this.sheet.addEventListener('click', (e) => { if (e.target === this.sheet) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.current) { e.preventDefault(); this.close(); } });

    this.drawBurst();
    online.onChange(() => {
      if (this.current === 'profile' && !this.busy) this.renderProfile();
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
  }

  /** Fades the start screen out (when a run starts). */
  hideTitle() {
    this.noticeEl.hidden = true;
    if (this.title.hidden) return;
    this.close();
    this.title.classList.add('is-leaving');
    clearTimeout(this.leaveTimer);
    this.leaveTimer = setTimeout(() => { this.title.hidden = true; this.title.classList.remove('is-leaving'); }, 340);
  }

  setBest(best) {
    this.bestEl.hidden = !(best > 0);
    this.bestEl.querySelector('b').textContent = formatScore(best);
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
    this.sheet.hidden = false;
    this.sheetCard.scrollTop = 0;
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
    this.current = null;
    this.sheet.hidden = true;
    this.sheetBody.replaceChildren();
    if (this.returnFocus && this.returnFocus.focus) this.returnFocus.focus({ preventScroll: true });
  }

  setPanel(title, ...content) {
    this.sheetTitle.textContent = title;
    this.sheetBody.replaceChildren(...content.flat().filter(Boolean));
  }

  /* Leaderboard */
  async renderLeaderboard() {
    const list = el('ol', { class: 'lb', 'aria-busy': 'true' }, ...Array.from({ length: 6 }, () => el('li', { class: 'lb__skeleton' })));
    const foot = el('div');
    this.setPanel('Leaderboard', list, foot);
    let rows;
    try {
      rows = await online.leaderboard(50);
    } catch (e) {
      if (this.current !== 'leaderboard') return;
      list.replaceWith(el('p', { class: 'lb__empty', text: e.message }));
      foot.replaceChildren(this.signUpNudge());
      return;
    }
    if (this.current !== 'leaderboard') return;
    list.removeAttribute('aria-busy');
    if (!rows.length) {
      list.replaceWith(el('p', { class: 'lb__empty' }, 'No scores yet. ', el('b', { text: 'Be the first on the board!' })));
    } else {
      list.replaceChildren(...rows.map((r) => el('li', { class: `lb__row${r.is_me ? ' is-me' : ''}` },
        el('span', { class: `lb__rank${r.rank <= 3 ? ` lb__rank--${r.rank}` : ''}`, text: String(r.rank) }),
        avatar(r.mascot, 40),
        el('span', { class: 'lb__name', text: r.username }),
        el('span', { class: 'lb__score', text: formatScore(r.score) }))));
    }
    if (online.signedIn) {
      if (!rows.some((r) => r.is_me)) {
        const me = await online.myRank().catch(() => null);
        if (this.current !== 'leaderboard') return;
        foot.replaceChildren(el('p', { class: 'lb__me' }, me
          ? ['You: ', el('b', { text: `#${me.rank}` }), ` · best ${formatScore(me.score)}`]
          : 'Your best run will show here after your next game.'));
      }
    } else {
      foot.replaceChildren(this.signUpNudge());
    }
  }

  signUpNudge() {
    return el('div', { class: 'lb__me' },
      el('p', { text: 'Want your name and mascot up here?' }),
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => this.open('profile') }, 'Sign up, it takes a minute'));
  }

  /* Profile: sign up / sign in, or your name and icon */
  renderProfile(mode) {
    if (mode === 'recovery') { this.renderNewPassword(); return; }
    if (online.signedIn) this.renderMe();
    else this.renderAuth(mode === 'signin' ? 'signin' : this.authTab || 'signup');
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

  renderAuth(tab) {
    this.authTab = tab;
    const tabs = el('div', { class: 'tabs', role: 'tablist' },
      el('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === 'signup'), onclick: () => this.renderAuth('signup') }, 'Sign up'),
      el('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === 'signin'), onclick: () => this.renderAuth('signin') }, 'Sign in'));
    const msg = el('p', { class: 'msg', role: 'status' });
    const say = (text, kind = '') => { msg.className = `msg${kind ? ' msg--' + kind : ''}`; msg.textContent = text; };

    if (tab === 'signup') {
      let mascot = this.pickedMascot || MASCOTS[Math.floor(Math.random() * MASCOTS.length)].id;
      this.pickedMascot = mascot;
      const name = this.field('Your name on the leaderboard', { type: 'text', maxlength: '16', autocomplete: 'nickname', autocapitalize: 'words', spellcheck: 'false', placeholder: 'e.g. Bug Squasher' }, '3–16 letters, numbers, spaces, . _ -');
      const email = this.field('Email', { type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'you@example.com' });
      const pass = this.field('Password', { type: 'password', autocomplete: 'new-password', minlength: '6', placeholder: 'At least 6 characters' });
      const go = el('button', { class: 'btn', type: 'submit' }, 'Create account');
      const form = el('form', { class: 'form', novalidate: true }, name.node, el('div', { class: 'field' }, el('span', { text: 'Pick your mascot' }), this.mascotPicker(mascot, (id) => { mascot = id; this.pickedMascot = id; })), email.node, pass.node, go, msg,
        el('p', { class: 'muted', text: 'Playing needs no account. Your name and mascot show on the leaderboard; your email stays private.' }));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const n = checkName(name.input.value);
        if (!n.ok) { say(n.why, 'bad'); name.input.focus(); return; }
        if (!EMAIL.test(email.input.value.trim())) { say("That email address doesn't look right.", 'bad'); email.input.focus(); return; }
        if (pass.input.value.length < 6) { say('Pick a password of at least 6 characters.', 'bad'); pass.input.focus(); return; }
        go.disabled = true;
        this.busy = true;
        say('Creating your account…');
        try {
          if (!(await online.usernameAvailable(n.name))) { say('That name is taken. Try another.', 'bad'); name.input.focus(); return; }
          const res = await online.signUp({ email: email.input.value.trim(), password: pass.input.value, username: n.name, mascot });
          if (res.signedIn) {
            this.busy = false;
            this.renderMe();
            this.notice(`Welcome, ${n.name}! You're on the leaderboard.`);
          } else {
            this.setPanel('Check your inbox',
              el('p', {}, 'We sent a link to ', el('b', { text: email.input.value.trim() }), '. Tap it to confirm your account, then come back here: your scores will go on the leaderboard.'),
              el('p', { class: 'muted', text: "No email? Check your spam folder, or try signing in after a few minutes." }),
              el('button', { class: 'btn btn--ghost', type: 'button', onclick: () => this.close() }, 'Keep playing'));
          }
        } catch (err) {
          say(err.message, 'bad');
        } finally {
          go.disabled = false;
          this.busy = false;
        }
      });
      this.setPanel('Join the leaderboard', tabs, form);
    } else {
      const email = this.field('Email', { type: 'email', autocomplete: 'email', inputmode: 'email' });
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
      this.setPanel('Welcome back', tabs, form);
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
      el('button', { class: 'btn btn--ghost', type: 'button', onclick: async () => { await online.signOut(); this.renderAuth('signin'); this.notice('Signed out.'); } }, 'Sign out'));
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
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => this.open('leaderboard') }, svg(TROPHY), 'Leaderboard'),
      !online.signedIn && el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => this.open('profile') }, 'Sign up'),
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => this.onMenu() }, 'Menu'));
    slot.replaceChildren(el('div', { class: 'result' }, line, row));
    if (!online.signedIn) {
      online.noteRun(run);
      line.textContent = 'Sign up to put your name on the leaderboard. This run counts too!';
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
