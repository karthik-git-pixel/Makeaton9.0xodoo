/**
 * Run-A-Ton · online.js
 * Accounts and the leaderboard, on Supabase. It talks to Supabase's REST APIs
 * directly (auth: /auth/v1, data: /rest/v1) instead of loading the SDK, to
 * keep the download small.
 *
 * Playing never needs an account: signing up puts your name and mascot on the
 * leaderboard. Only the public "anon" key is in here. What it can do is set by
 * the database's row-level security (see supabase/schema.sql). Never put the
 * service-role key in the game.
 */
const SUPABASE_URL = 'https://daucloimixgmojzqcrvw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhdWNsb2ltaXhnbW9qenFjcnZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU1ODYxMDgsImV4cCI6MjExMTE2MjEwOH0.zC6toIH76n6_n0OYqbmbyATzLHvniqHwWuT-4Ld9Npw';

const KEY_SESSION = 'mat9-24h-auth';
const KEY_BEST_RUN = 'mat9-24h-best-run';   // this device's best run, sent in once you sign in
const KEY_SENT = 'mat9-24h-best-sent';      // the best score already sent
const KEY_OAUTH = 'mat9-24h-oauth';         // set while away at Google, so the return reads as a Google sign-in
// An account made here that still waits for its email to be confirmed. The
// confirmation link often opens in another browser (Gmail, or Chrome rather
// than Instagram's), so this browser stays signed out: the game then asks the
// player to sign in here, which sends this device's best run.
const KEY_PENDING = 'mat9-24h-pending-email';

/**
 * Apps' built-in browsers (Instagram's, Facebook's, LinkedIn's, Android web
 * views). Google refuses to sign anyone in there ("403 disallowed_useragent"),
 * so the game offers email instead and says how to open a real browser.
 */
export function inAppBrowser() {
  return /Instagram|FBAN|FBAV|FB_IAB|LinkedInApp|Snapchat|Line\/|; wv\)/i.test(navigator.userAgent || '');
}

/** The mascots you can pick as your icon (cells of assets/play/avatars.webp, in this order). */
export const MASCOTS = [
  { id: 'red-cool', name: 'Cool' }, { id: 'red-cheer', name: 'Cheer' }, { id: 'red-excited', name: 'Hyped' },
  { id: 'red-curious', name: 'Curious' }, { id: 'red-star-eyes', name: 'Starstruck' }, { id: 'red-pet', name: 'Chill' },
  { id: 'green-cool', name: 'Green cool' }, { id: 'green-cheer', name: 'Green cheer' }, { id: 'green-excited', name: 'Green hyped' },
  { id: 'green-curious', name: 'Green curious' }, { id: 'green-star-eyes', name: 'Green starstruck' }, { id: 'yellow-wink', name: 'Wink' },
];
export const mascotIndex = (id) => Math.max(0, MASCOTS.findIndex((m) => m.id === id));

/** Rules for names (the database checks them too). */
export function checkName(name) {
  const n = (name || '').trim().replace(/\s+/g, ' ');
  if (n.length < 3) return { ok: false, name: n, why: 'At least 3 characters.' };
  if (n.length > 16) return { ok: false, name: n, why: 'At most 16 characters.' };
  if (!/^[A-Za-z0-9_.-]+( [A-Za-z0-9_.-]+)*$/.test(n)) return { ok: false, name: n, why: 'Letters, numbers, spaces, . _ and - only.' };
  return { ok: true, name: n };
}

const store = {
  get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { if (v === null) window.localStorage.removeItem(k); else window.localStorage.setItem(k, v); } catch (e) { /* no storage */ } },
};

/** An error with a message fit to show players. kind: offline | not-set-up | auth | input | server */
export class OnlineError extends Error {
  constructor(kind, message, code = '') {
    super(message);
    this.kind = kind;
    this.code = code;
  }
}

function toError(status, data) {
  const code = String((data && (data.error_code || data.code || data.error)) || status);
  const raw = String((data && (data.msg || data.message || data.error_description || data.error)) || '');
  const map = {
    invalid_credentials: 'Wrong email or password.',
    invalid_grant: 'Wrong email or password.',
    email_not_confirmed: 'Confirm your email first: the link is in your inbox.',
    user_already_exists: 'That email already has an account. Sign in instead.',
    email_exists: 'That email already has an account. Sign in instead.',
    weak_password: 'Pick a longer password (at least 6 characters).',
    over_email_send_rate_limit: "Too many sign-ups right now. Try again in a little while.",
    over_request_rate_limit: 'Too many tries. Wait a minute and try again.',
    email_address_invalid: "That email address doesn't look right.",
    validation_failed: "That email address doesn't look right.",
    signup_disabled: 'Sign-ups are closed right now.',
    anonymous_provider_disabled: 'Joining with a name isn’t switched on yet. Try again soon.',
    same_password: "That's the password you already have.",
    23505: 'That name is taken. Try another.',
    23514: 'Names: 3–16 letters, numbers, spaces, . _ or -.',
    22023: "That score couldn't be accepted.",
    54000: 'Slow down a little and try again.',
    PGRST301: 'Please sign in again.',
  };
  if (status === 404 || code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42883') {
    return new OnlineError('not-set-up', 'The leaderboard opens soon.', code);
  }
  if (map[code]) return new OnlineError(/^2|^5/.test(code) ? 'input' : 'auth', map[code], code);
  if (/password/i.test(raw) && /characters|short|weak/i.test(raw)) return new OnlineError('input', map.weak_password, code);
  if (/rate limit/i.test(raw)) return new OnlineError('auth', map.over_request_rate_limit, code);
  if (status === 401 || status === 403) return new OnlineError('auth', 'Please sign in again.', code);
  if (status === 400 || status === 422) return new OnlineError('input', raw || 'Please check the details and try again.', code);
  return new OnlineError('server', 'Something went wrong. Try again in a moment.', code);
}

class Online {
  constructor() {
    this.session = null;  // { access_token, refresh_token, expires_at, user: { id, email } }
    this.profile = null;  // { username, mascot }
    this.status = 'unknown'; // unknown | ok | offline | not-set-up
    this.listeners = [];
    this.refreshing = null;
  }

  get signedIn() { return !!(this.session && this.session.user); }

  onChange(fn) { this.listeners.push(fn); }

  emit() {
    for (const fn of this.listeners) { try { fn(this); } catch (e) { /* a listener's problem */ } }
  }

  /** One request to Supabase. auth: send the player's token if signed in. */
  async request(path, { method = 'GET', body, auth = false, prefer = '', timeout = 9000, retry = true } = {}) {
    if (auth && this.session) await this.freshen().catch(() => {});
    const token = auth && this.session ? this.session.access_token : SUPABASE_ANON_KEY;
    const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    if (prefer) headers.Prefer = prefer;
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : 0;
    let res;
    try {
      res = await fetch(SUPABASE_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined });
    } catch (e) {
      this.status = 'offline';
      throw new OnlineError('offline', "Can't reach the leaderboard right now. Check your connection.");
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = { message: text }; }
    if (res.status === 401 && auth && this.session && retry) {
      // the token ran out early: refresh once and try again
      await this.refresh().catch(() => {});
      if (this.session) return this.request(path, { method, body, auth, prefer, timeout, retry: false });
    }
    if (!res.ok) {
      const err = toError(res.status, data);
      if (err.kind === 'not-set-up') this.status = 'not-set-up';
      throw err;
    }
    if (path.startsWith('/rest/')) this.status = 'ok';
    return data;
  }

  /* --- session ---------------------------------------------------------- */
  setSession(data) {
    const now = Math.floor(Date.now() / 1000);
    const user = data.user ? { id: data.user.id, email: data.user.email } : (this.session && this.session.user) || null;
    this.session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at ? +data.expires_at : now + (+data.expires_in || 3600),
      user,
    };
    store.set(KEY_SESSION, JSON.stringify(this.session));
    store.set(KEY_PENDING, null);
  }

  /** The email of an account made here that hasn't been signed into yet ('' otherwise). */
  get pendingEmail() {
    return this.signedIn ? '' : store.get(KEY_PENDING) || '';
  }

  clearSession() {
    this.session = null;
    this.profile = null;
    store.set(KEY_SESSION, null);
  }

  /** Keeps the access token fresh (it lasts an hour). */
  freshen() {
    if (!this.session || this.session.expires_at - Date.now() / 1000 > 90) return Promise.resolve();
    return this.refresh();
  }

  refresh() {
    if (!this.session) return Promise.resolve();
    if (!this.refreshing) {
      this.refreshing = this.request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: this.session.refresh_token } })
        .then((data) => this.setSession(data))
        .catch((e) => { if (e.kind !== 'offline') { this.clearSession(); this.emit(); } throw e; })
        .finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  }

  /**
   * Picks up a session from the address after an email link (confirming the
   * sign-up, or resetting the password), and the saved one otherwise.
   * Returns { type } for a link that worked, { error } for one that didn't.
   */
  async init() {
    let link = null;
    const hash = (location.hash || '').replace(/^#/, '');
    if (/access_token=|error=/.test(hash)) {
      const h = new URLSearchParams(hash);
      let viaGoogle = false;
      try { viaGoogle = window.sessionStorage.getItem(KEY_OAUTH) === 'google'; window.sessionStorage.removeItem(KEY_OAUTH); } catch (e) { /* no storage */ }
      if (h.get('access_token') && h.get('refresh_token')) {
        this.setSession({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), expires_in: h.get('expires_in'), expires_at: h.get('expires_at') });
        link = { type: h.get('type') || (viaGoogle ? 'google' : 'signin') };
      } else if (h.get('error')) {
        link = { error: (h.get('error_description') || 'That link has expired.').replace(/\+/g, ' ') };
      }
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* fine */ }
    } else {
      try { this.session = JSON.parse(store.get(KEY_SESSION) || 'null'); } catch (e) { this.session = null; }
    }
    if (this.session) {
      try {
        await this.freshen();
        if (this.session && !this.session.user) {
          const u = await this.request('/auth/v1/user', { auth: true });
          this.session.user = { id: u.id, email: u.email };
          store.set(KEY_SESSION, JSON.stringify(this.session));
        }
        if (this.session) await this.loadProfile();
      } catch (e) {
        if (e.kind === 'auth') this.clearSession();
      }
    }
    this.emit();
    if (this.signedIn) this.sendDeviceBest().catch(() => {});
    return link;
  }

  async loadProfile() {
    if (!this.signedIn) return null;
    const rows = await this.request(`/rest/v1/profiles?id=eq.${this.session.user.id}&select=username,mascot`, { auth: true });
    this.profile = rows && rows[0] ? rows[0] : null;
    if (!this.profile) {
      // an account from before the database was set up: make its profile now
      const tag = this.session.user.id.replace(/-/g, '').slice(0, 4);
      const made = await this.request('/rest/v1/profiles', { method: 'POST', auth: true, prefer: 'return=representation', body: { id: this.session.user.id, username: `Player-${tag}`, mascot: 'red-cool' } });
      this.profile = made && made[0] ? made[0] : null;
    }
    return this.profile;
  }

  /* --- accounts --------------------------------------------------------- */
  /** Returns { signedIn: true } or { confirm: true } (a confirmation email was sent). */
  async signUp({ email, password, username, mascot }) {
    const back = encodeURIComponent(location.origin + location.pathname);
    const data = await this.request(`/auth/v1/signup?redirect_to=${back}`, { method: 'POST', body: { email, password, data: { username, mascot } } });
    if (data && data.access_token) {
      this.setSession(data);
      await this.loadProfile().catch(() => {});
      this.emit();
      this.sendDeviceBest().catch(() => {});
      return { signedIn: true };
    }
    store.set(KEY_PENDING, email);
    this.emit();
    return { confirm: true };
  }

  /**
   * Joins the leaderboard with just a name and a mascot: no email, no password,
   * nothing to confirm. It is an anonymous Supabase account kept in this
   * browser (needs Authentication → "Allow anonymous sign-ins" on in Supabase).
   * Clearing the browser's data loses it, and the name stays with the old one.
   */
  async joinWithName({ username, mascot }) {
    const data = await this.request('/auth/v1/signup', { method: 'POST', body: { data: { username, mascot } } });
    if (!data || !data.access_token) throw new OnlineError('server', 'Something went wrong. Try again in a moment.');
    this.setSession(data);
    await this.loadProfile().catch(() => {});
    // if the database made no profile from the name (or a stand-in one), set it now
    if (!this.profile || this.profile.username !== username || this.profile.mascot !== mascot) {
      await this.updateProfile({ username, mascot }).catch(() => {});
    }
    this.emit();
    this.sendDeviceBest().catch(() => {});
  }

  /** Joined with just a name (no email, no Google): signing out can't be undone. */
  get anonymous() {
    return !!(this.session && this.session.user && !this.session.user.email);
  }

  async signIn({ email, password }) {
    const data = await this.request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
    this.setSession(data);
    await this.loadProfile().catch(() => {});
    this.emit();
    this.sendDeviceBest().catch(() => {});
  }

  /**
   * Google sign-in. The Google client ID and secret live in Supabase
   * (Authentication → Providers → Google), never in this file. The browser
   * goes to Google and comes back to this page with the session in the
   * address, which init() picks up like an email link. New Google players get
   * an automatic "Player-xxxx" name (loadProfile) until they pick one.
   */
  signInWithGoogle() {
    try { window.sessionStorage.setItem(KEY_OAUTH, 'google'); } catch (e) { /* no storage */ }
    const back = encodeURIComponent(location.origin + location.pathname);
    location.assign(`${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${back}`);
  }

  /** True while the player still has the automatic name new Google accounts get. */
  get needsName() {
    return !!(this.profile && /^Player-[0-9a-f]{4}$/.test(this.profile.username));
  }

  async signOut() {
    if (this.session) await this.request('/auth/v1/logout', { method: 'POST', auth: true }).catch(() => {});
    this.clearSession();
    store.set(KEY_SENT, null);
    this.emit();
  }

  async resetPassword(email) {
    const back = encodeURIComponent(location.origin + location.pathname);
    await this.request(`/auth/v1/recover?redirect_to=${back}`, { method: 'POST', body: { email } });
  }

  async setPassword(password) {
    await this.request('/auth/v1/user', { method: 'PUT', auth: true, body: { password } });
  }

  async usernameAvailable(name) {
    return !!(await this.request('/rest/v1/rpc/username_available', { method: 'POST', body: { name } }));
  }

  async updateProfile({ username, mascot }) {
    if (!this.signedIn) throw new OnlineError('auth', 'Sign in first.');
    const body = { updated_at: new Date().toISOString() };
    if (username !== undefined) body.username = username;
    if (mascot !== undefined) body.mascot = mascot;
    const rows = await this.request(`/rest/v1/profiles?id=eq.${this.session.user.id}`, { method: 'PATCH', auth: true, prefer: 'return=representation', body });
    if (rows && rows[0]) this.profile = rows[0];
    this.emit();
    return this.profile;
  }

  /* --- scores ------------------------------------------------------------- */
  /** Remembers this device's best run, so it can be sent in after signing up. */
  noteRun(run) {
    let best = null;
    try { best = JSON.parse(store.get(KEY_BEST_RUN) || 'null'); } catch (e) { best = null; }
    if (!best || run.score > best.score) store.set(KEY_BEST_RUN, JSON.stringify(run));
  }

  /** Sends a finished run. Returns { best, rank }, or null when signed out. */
  async submitRun(run) {
    this.noteRun(run);
    if (!this.signedIn) return null;
    const res = await this.request('/rest/v1/rpc/submit_score', {
      method: 'POST', auth: true,
      body: { p_score: Math.floor(run.score), p_distance: Math.floor(run.distance), p_sparkles: run.sparkles | 0, p_level: run.level | 0, p_seconds: Math.max(0.1, +run.seconds || 0) },
    });
    if (res && res.best >= run.score) store.set(KEY_SENT, String(Math.floor(run.score)));
    return res;
  }

  /** After signing in: sends this device's best run if it hasn't gone in yet. */
  async sendDeviceBest() {
    let best = null;
    try { best = JSON.parse(store.get(KEY_BEST_RUN) || 'null'); } catch (e) { best = null; }
    const sent = +(store.get(KEY_SENT) || 0);
    if (!best || !this.signedIn || best.score <= sent) return null;
    const res = await this.request('/rest/v1/rpc/submit_score', {
      method: 'POST', auth: true,
      body: { p_score: Math.floor(best.score), p_distance: Math.floor(best.distance), p_sparkles: best.sparkles | 0, p_level: best.level | 0, p_seconds: Math.max(0.1, +best.seconds || 0) },
    });
    store.set(KEY_SENT, String(Math.floor(best.score)));
    return res;
  }

  /** The top of the leaderboard: [{ rank, username, mascot, score, distance, is_me }] */
  async leaderboard(limit = 50) {
    return (await this.request('/rest/v1/rpc/leaderboard', { method: 'POST', auth: this.signedIn, body: { lim: limit } })) || [];
  }

  /** { rank, score, distance } for the signed-in player, or null before their first score. */
  async myRank() {
    if (!this.signedIn) return null;
    return this.request('/rest/v1/rpc/my_rank', { method: 'POST', auth: true, body: {} });
  }
}

export const online = new Online();
