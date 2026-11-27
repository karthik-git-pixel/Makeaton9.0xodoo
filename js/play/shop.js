/**
 * Run-A-Ton · shop.js
 * The Sparkle Shop: hats, back pieces and trails for the star, paid for with
 * the sparkles grabbed on runs played signed in. It opens from the start
 * screen; the 3D star stays in view above the shelves and tries on whatever
 * is tapped (drag it to turn it round).
 *
 * The server keeps the prices and the sparkles and does the buying
 * (supabase/sparkle-shop.sql, through online.js); this is only the window.
 */
import { online } from './online.js';
import { ITEMS, RARITY, itemById, VIEW_YAW } from './cosmetics.js';
import { formatScore } from './ui.js';

const SPARK = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 4C54 34 66 46 96 50C66 54 54 66 50 96C46 66 34 54 4 50C34 46 46 34 50 4Z"/></svg>';
const BACK = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M10.6 5.4 4 12l6.6 6.6 1.6-1.6-3.9-3.9H20v-2.2H8.3l3.9-3.9z"/></svg>';
const SPIN = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 5c-4.4 0-8 1.6-8 4.5 0 2.3 2.4 3.8 6 4.3V16l3.5-3-3.5-3v1.9c-2.6-.4-4-1.5-4-2.4C6 8.3 8.4 7 12 7s6 1.3 6 2.5c0 .8-1.1 1.7-3 2.2v2c3-.6 5-2.1 5-4.2C20 6.6 16.4 5 12 5z"/></svg>';
const CONFIRM_MS = 3000;

/** Compact sparkle counts for tight spots: 950 · 12.3K · 1.2M */
export function compactSparkles(n) {
  if (n >= 1e6) return `${(Math.floor(n / 1e5) / 10).toString()}M`;
  if (n >= 1e4) return `${(Math.floor(n / 100) / 10).toString()}K`;
  return formatScore(n);
}

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}
const spark = () => { const t = document.createElement('template'); t.innerHTML = SPARK; return t.content.firstChild; };

const GROUPS = {
  looks: [['head', 'On your head'], ['back', 'On your back']],
  trails: [['trail', 'Behind you']],
};

export class Shop {
  /**
   * @param {object} o
   * @param {HTMLElement} o.root    the stage (the shop sits over the 3D view)
   * @param {object} o.stage        the game's side: open(on), preview(look, tab),
   *                                turn(yaw), spin(dx), icon(id) -> data URL, celebrate()
   * @param {(name: string, opts?: object) => void} o.openPanel  a menu panel over the shop (sign in)
   * @param {(text: string, ms?: number) => void} o.notice
   * @param {() => void} o.onClose
   */
  constructor({ root, stage, openPanel, notice, onClose }) {
    this.stage = stage;
    this.openPanel = openPanel;
    this.notice = notice;
    this.onClose = onClose;
    this.isOpen = false;
    this.tab = 'looks';
    this.selected = null;     // the item tapped last
    this.trying = { head: null, back: null, trail: null };
    this.confirm = null;      // the item waiting for a second tap to buy
    this.busy = false;
    this.error = null;        // why the shop couldn't load
    this.icons = new Map();   // id -> picture (made the first time the shop opens)

    this.walletNum = el('b', { text: '—' });
    this.wallet = el('button', { class: 'shop__wallet', type: 'button', 'aria-label': 'Your sparkles', onclick: () => { if (!online.signedIn) this.openPanel('profile'); } }, spark(), this.walletNum);
    this.tabs = el('div', { class: 'shop__tabs', role: 'tablist', 'aria-label': 'Shop sections' },
      ['looks', 'trails'].map((t) => el('button', { type: 'button', role: 'tab', 'data-tab': t, 'aria-selected': String(t === this.tab), onclick: () => this.setTab(t) }, t === 'looks' ? 'Hats & more' : 'Trails')));
    this.list = el('div', { class: 'shop__list' });
    this.info = el('div', { class: 'shop__info' });
    this.act = el('button', { class: 'btn shop__act', type: 'button', onclick: () => this.onAct() });
    this.view = el('div', { class: 'shop__view', 'aria-hidden': 'true' }, el('span', { class: 'shop__spin', html: `${SPIN}<span>Drag to spin</span>` }));
    this.el = el('section', { class: 'shop', 'data-ui': true, hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Sparkle Shop' },
      el('header', { class: 'shop__top' },
        el('button', { class: 'shop__back', type: 'button', 'aria-label': 'Back', title: 'Back', html: BACK, onclick: () => this.close() }),
        el('h2', { class: 'shop__title', text: 'Sparkle Shop' }),
        this.wallet),
      this.view,
      el('div', { class: 'shop__drawer' }, this.tabs, this.list, el('div', { class: 'shop__bar' }, this.info, this.act)));
    root.append(this.el);

    // drag the star round
    let drag = null;
    this.view.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, id: e.pointerId };
      try { this.view.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
      this.view.classList.add('is-dragging');
    });
    this.view.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      this.stage.spin(e.clientX - drag.x);
      drag.x = e.clientX;
    });
    const end = () => { drag = null; this.view.classList.remove('is-dragging'); };
    this.view.addEventListener('pointerup', end);
    this.view.addEventListener('pointercancel', end);

    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !this.isOpen || e.defaultPrevented) return; // (a panel over the shop just closed)
      const sheet = document.getElementById('sheet');
      if (sheet && !sheet.hidden) return; // the panel over the shop closes first
      e.preventDefault();
      this.close();
    });
    online.onShop(() => {
      if (!this.isOpen) return;
      // the wallet (re)loaded: wear what's saved, except in the slot being tried on
      const sel = this.selected && itemById(this.selected);
      const now = this.wearing();
      for (const slot of ['head', 'back', 'trail']) if (!sel || sel.slot !== slot) this.trying[slot] = now[slot];
      this.preview();
      this.render();
    });
  }

  /* --- open / close ------------------------------------------------------------ */
  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.returnFocus = document.activeElement;
    this.el.hidden = false;
    this.selected = null;
    this.confirm = null;
    this.trying = { ...this.wearing() };
    this.stage.open(true);
    this.preview();
    this.stage.turn(this.tab === 'trails' && this.trying.trail ? VIEW_YAW.trail : 0);
    this.render();
    this.makeIcons();
    if (!online.shop || this.error) this.load();
    else online.loadShop().catch(() => {}); // fresh sparkles (a run may have just ended)
    requestAnimationFrame(() => { if (!('ontouchstart' in window)) this.el.querySelector('.shop__back').focus({ preventScroll: true }); });
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.hidden = true;
    clearTimeout(this.confirmTimer);
    this.confirm = null;
    this.stage.open(false);
    if (this.onClose) this.onClose();
    if (this.returnFocus && this.returnFocus.focus) this.returnFocus.focus({ preventScroll: true });
  }

  async load() {
    this.error = null;
    this.render();
    try {
      await online.loadShop();
    } catch (e) {
      this.error = e;
    }
    if (this.isOpen) this.render();
  }

  /** What the player wears now (nothing when signed out). */
  wearing() {
    const s = online.shop;
    return s && s.signedIn ? s.wearing : { head: null, back: null, trail: null };
  }

  price(it) {
    const p = online.shop && online.shop.prices && online.shop.prices[it.id];
    return p > 0 ? p : it.price;
  }

  /** Item pictures: one per frame, so opening the shop never stalls. */
  makeIcons() {
    const todo = ITEMS.filter((it) => !this.icons.has(it.id));
    if (!todo.length || this.iconsRunning) return;
    this.iconsRunning = true;
    const next = () => {
      const it = todo.shift();
      if (!it) { this.iconsRunning = false; return; }
      let url = '';
      try { url = this.stage.icon(it.id); } catch (e) { /* no picture: the card shows its name */ }
      this.icons.set(it.id, url);
      for (const img of this.list.querySelectorAll(`img[data-id="${it.id}"]`)) { img.src = url; img.hidden = !url; }
      requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  }

  setTab(t) {
    if (t === this.tab) return;
    this.tab = t;
    this.confirm = null;
    for (const b of this.tabs.children) b.setAttribute('aria-selected', String(b.dataset.tab === t));
    const first = this.selected && itemById(this.selected);
    if (first && (first.slot === 'trail') !== (t === 'trails')) this.selected = null;
    this.list.scrollTop = 0;
    this.preview();
    this.stage.turn(t === 'trails' && this.trying.trail ? VIEW_YAW.trail : 0);
    this.render();
  }

  /** Shows the star in what's being tried on (the trails tab: running, trail on). */
  preview() {
    this.stage.preview({ ...this.trying }, this.tab);
  }

  select(it) {
    this.confirm = null;
    if (this.selected === it.id) {
      // tapped again: back to what you wear in that slot
      this.selected = null;
      this.trying[it.slot] = this.wearing()[it.slot];
    } else {
      this.selected = it.id;
      this.trying[it.slot] = it.id;
      this.stage.turn(VIEW_YAW[it.slot]);
    }
    this.preview();
    this.render();
  }

  /* --- drawing ------------------------------------------------------------------ */
  render() {
    const s = online.shop;
    const signedIn = online.signedIn && s && s.signedIn;
    this.walletNum.textContent = signedIn ? formatScore(s.balance) : online.signedIn ? (this.error ? '—' : '…') : 'Sign in';
    this.wallet.classList.toggle('is-guest', !online.signedIn);
    this.wallet.setAttribute('aria-label', signedIn ? `You have ${formatScore(s.balance)} sparkles` : 'Sign in to save sparkles');
    this.renderList();
    this.renderBar();
  }

  card(it) {
    const s = online.shop;
    const signedIn = online.signedIn && s && s.signedIn;
    const owned = signedIn && s.owned.has(it.id);
    const worn = signedIn && s.wearing[it.slot] === it.id;
    const price = this.price(it);
    const url = this.icons.get(it.id);
    const img = el('img', { alt: '', 'data-id': it.id, draggable: 'false', width: '84', height: '84', hidden: !url, src: url || undefined });
    let tag;
    if (worn) tag = el('span', { class: 'shop-card__state shop-card__state--on', text: 'Wearing' });
    else if (owned) tag = el('span', { class: 'shop-card__state', text: 'Owned' });
    else tag = el('span', { class: `shop-card__price${signedIn && s.balance < price ? ' is-far' : ''}` }, spark(), formatScore(price));
    const label = `${it.name}, ${RARITY[it.rarity].label}. ${worn ? 'Wearing' : owned ? 'Owned' : `${formatScore(price)} sparkles`}`;
    return el('button', { class: 'shop-card', type: 'button', 'data-rarity': it.rarity, 'aria-pressed': String(this.selected === it.id), 'aria-label': label, onclick: () => this.select(it) },
      el('span', { class: 'shop-card__pic' }, img, el('i', { class: 'shop-card__gem', 'aria-hidden': 'true' })),
      el('span', { class: 'shop-card__name', text: it.name }),
      tag);
  }

  renderList() {
    const keep = this.list.scrollTop;
    const blocks = [];
    for (const [slot, title] of GROUPS[this.tab]) {
      blocks.push(el('h3', { class: 'shop__group', text: title }));
      blocks.push(el('div', { class: 'shop__grid' }, ITEMS.filter((it) => it.slot === slot).map((it) => this.card(it))));
    }
    this.list.replaceChildren(...blocks);
    this.list.scrollTop = keep;
  }

  renderBar() {
    const s = online.shop;
    const it = this.selected && itemById(this.selected);
    this.act.classList.remove('is-confirm');
    this.act.disabled = false;
    this.act.hidden = false;
    if (!it) {
      // nothing picked: how sparkles get here
      this.info.replaceChildren(
        el('b', { class: 'shop__name', text: 'Try anything on' }),
        el('p', { class: 'shop__blurb', text: online.signedIn
          ? 'Tap an item to see it on the star. Every sparkle you grab on a run goes into your wallet.'
          : 'Tap an item to see it on the star. Sign in, and every sparkle you grab on a run is saved for the shop.' }));
      if (online.signedIn) this.act.hidden = true;
      else this.setAct('Sign in', () => this.openPanel('profile'));
      return;
    }
    const price = this.price(it);
    this.info.replaceChildren(
      el('div', { class: 'shop__line' }, el('b', { class: 'shop__name', text: it.name }), el('span', { class: 'shop__rarity', 'data-rarity': it.rarity, text: RARITY[it.rarity].label })),
      el('p', { class: 'shop__blurb', text: it.blurb }));

    if (this.error || !s) {
      const soon = this.error && this.error.kind === 'not-set-up';
      this.info.append(el('p', { class: 'shop__note', text: !this.error ? 'Opening the shop…' : soon ? 'The shop opens soon.' : "Can't reach the shop right now." }));
      if (this.error && !soon) this.setAct('Try again', () => this.load());
      else this.setAct(`${formatScore(price)}`, null, true);
      return;
    }
    if (!online.signedIn) {
      this.setAct('Sign in to buy', () => this.openPanel('profile'));
      return;
    }
    if (!s.signedIn) { this.setAct('…', null, true); return; }
    const worn = s.wearing[it.slot] === it.id;
    if (worn) { this.setAct('Take off', () => this.wear(it.slot, null)); return; }
    if (s.owned.has(it.id)) { this.setAct('Wear it', () => this.wear(it.slot, it.id)); return; }
    if (s.balance >= price) {
      if (this.confirm === it.id) {
        this.setAct(`Tap to spend ${formatScore(price)}`, () => this.buy(it));
        this.act.classList.add('is-confirm');
      } else {
        this.setAct([spark(), `Buy · ${formatScore(price)}`], () => this.askConfirm(it));
      }
      return;
    }
    // can't afford it yet: how far there is to go
    const need = price - s.balance;
    const meter = el('div', { class: 'shop__meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(price), 'aria-valuenow': String(s.balance), 'aria-label': 'Sparkles saved towards it' });
    meter.append(el('i', { style: `width:${Math.max(2, Math.min(100, (s.balance / price) * 100)).toFixed(1)}%` }));
    this.info.append(meter);
    this.setAct([spark(), `${compactSparkles(need)} to go`], null, true);
  }

  setAct(content, onClick, disabled = false) {
    this.act.replaceChildren(...[].concat(content));
    this.actHandler = onClick;
    this.act.disabled = disabled || !onClick || this.busy;
  }

  onAct() {
    if (this.actHandler && !this.busy) this.actHandler();
  }

  askConfirm(it) {
    this.confirm = it.id;
    clearTimeout(this.confirmTimer);
    this.confirmTimer = setTimeout(() => { if (this.confirm === it.id) { this.confirm = null; this.renderBar(); } }, CONFIRM_MS);
    this.renderBar();
  }

  async buy(it) {
    clearTimeout(this.confirmTimer);
    this.confirm = null;
    this.busy = true;
    this.setAct('Buying…', null, true);
    try {
      await online.buy(it.id);
      this.trying[it.slot] = it.id;
      this.preview();
      this.stage.celebrate();
      this.notice(`${it.name} is yours!`, 3200);
    } catch (e) {
      this.notice(e.message, 5000);
    } finally {
      this.busy = false;
      if (this.isOpen) this.render();
    }
  }

  async wear(slot, id) {
    this.busy = true;
    this.setAct('Saving…', null, true);
    try {
      await online.wear(slot, id);
      this.trying[slot] = id;
      this.preview();
    } catch (e) {
      this.notice(e.message, 5000);
    } finally {
      this.busy = false;
      if (this.isOpen) this.render();
    }
  }
}
