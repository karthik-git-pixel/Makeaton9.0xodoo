/* ==========================================================================
   Make-A-Ton 9.0 · Organizing team (/team)
   Reads data/organizers.json, builds one OrganizerCard per organizer and
   plays them as a deck: the deck is placed on the table, a tap shuffles it
   and deals every card face-up into its team's column, with sound.

   GSAP + Flip (js/vendor) move the cards. Every destination is measured from
   the layout, never hard-coded. The cards themselves are HTML and CSS
   (css/team.css), sized in cqw of the card, so they stay crisp at any size.

   Once dealt, a card opens in a focused view (a modal dialog) at the front.

   States, mirrored on .crew-table[data-state]:
     loading → placing → stacked → dealing → dealt → gathering → stacked …
   With reduced motion (or without GSAP) the table opens straight on "dealt".
   ========================================================================== */
(() => {
  'use strict';

  const DATA_URL = 'data/organizers.json';
  const table = document.querySelector('[data-crew-table]');
  const surface = document.querySelector('[data-crew-surface]');
  const captionEl = document.querySelector('[data-crew-caption]');
  const live = document.querySelector('[data-crew-live]');
  const soundBtn = document.querySelector('[data-crew-sound]');
  const soundLabel = document.querySelector('[data-crew-sound-label]');
  const reshuffleBtn = document.querySelector('[data-crew-reshuffle]');
  if (!table || !surface) return;

  const gsap = window.gsap;
  const Flip = window.Flip;
  const sfx = window.MakeatonSound;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (gsap && Flip) gsap.registerPlugin(Flip);
  const canAnimate = () => Boolean(gsap && Flip) && !reduceMotion.matches;

  /**
   * One organizer, as written in data/organizers.json (schema: data/organizers.schema.json).
   * A card shows the position, the name, the photo and LinkedIn; nothing else.
   * `team` and `position` are shown exactly as written.
   * @typedef {'orange'|'yellow'|'blue'|'pink'} Theme
   * @typedef {{ id: string, name: string, team: string, position: string, photo: string,
   *   linkedin: string, theme?: Theme }} Organizer
   * Once loaded, each also carries `teamKey` (the team as a slug: "PR" → "pr"),
   * and its `theme` and badge `mascot` are filled in.
   */

  /* Team looks, keyed by the slug of the team's name without a trailing
     "team" ("Finance Team" → finance): the card colour and the mascot in the
     name plate's badge (the emblem on the column's empty slot is the
     oc-em-<key> symbol in team.html). A team not listed here still gets its
     own column: a colour by its place in the row, the cheering mascot and a
     generic emblem. A card's own `theme` overrides the colour. */
  const TEAM_LOOKS = {
    core: { theme: 'orange', mascot: 'red-cheer' },
    finance: { theme: 'yellow', mascot: 'green-star-eyes' },
    tech: { theme: 'blue', mascot: 'red-cool' },
    design: { theme: 'pink', mascot: 'red-star-eyes' },
    events: { theme: 'yellow', mascot: 'red-excited' },
    outreach: { theme: 'pink', mascot: 'green-excited' },
    content: { theme: 'blue', mascot: 'red-curious' },
    pr: { theme: 'pink', mascot: 'red-curious' },
    faculty: { theme: 'yellow', mascot: 'green-cool' },
  };
  const THEMES = ['orange', 'yellow', 'blue', 'pink'];
  const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'team';

  /** A team's look; `place` is its column's position, which colours an unlisted team */
  function teamLook(key, place) {
    const name = key.replace(/-team$/, '');
    const known = TEAM_LOOKS[name];
    return {
      theme: known ? known.theme : THEMES[place % THEMES.length],
      mascot: known ? known.mascot : 'red-cheer',
      emblem: document.getElementById(`oc-em-${name}`) ? `oc-em-${name}` : 'oc-em-team',
    };
  }

  /* Card geometry, in card widths: a card is 1.4 tall (5:7), and in a column
     each card shows the top 0.31 of the one under it (its name plate). A
     stack keeps 0.44 free below it to open into on hover (css/team.css), and
     a tableau row is a card plus about 0.3 for its team's tab and the gaps. */
  const CARD_RATIO = 1.4;
  const PEEK = 0.31;
  const STACK_ROOM = 0.44;
  const ROW_EXTRA = 0.3;

  /* Helpers ---------------------------------------------------------------- */
  const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const rnd = (lo, hi) => lo + Math.random() * (hi - lo);
  const use = (id, cls = '') => `<svg${cls ? ` class="${cls}"` : ''} aria-hidden="true" focusable="false"><use href="#${id}"/></svg>`;
  const shuffled = (list) => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const flipOf = (card) => card.querySelector('.ocard__flip');
  const openerOf = (card) => card.querySelector('.ocard__open');
  const announce = (text) => {
    if (!live) return;
    live.textContent = '';
    // A fresh node each time, so a repeated message is still read out
    requestAnimationFrame(() => { live.textContent = text; });
  };

  /* Sound ------------------------------------------------------------------
     Every effect goes through the site's engine (js/sound.js), so the mute
     setting is shared with the rest of the site and remembered. */
  const play = (name, options) => { if (sfx) sfx.play(name, options || {}); };
  let audioWaiters = [];
  if (sfx && sfx.supported) {
    sfx.onChange((s) => {
      if (!s.unlocked || !audioWaiters.length) return;
      audioWaiters.forEach((resolve) => resolve());
      audioWaiters = [];
    });
  }
  /** Wakes the audio context (it needs a gesture); resolves once it runs, or soon anyway. */
  function audioReady(timeout = 200) {
    if (!sfx || !sfx.supported) return Promise.resolve();
    sfx.unlock();
    if (sfx.state().unlocked) return Promise.resolve();
    return new Promise((resolve) => {
      audioWaiters.push(resolve);
      setTimeout(resolve, timeout);
    });
  }

  function initSoundToggle() {
    if (!soundBtn || !sfx || !sfx.supported) return;
    soundBtn.hidden = false;
    sfx.onChange((s) => {
      soundBtn.setAttribute('aria-pressed', String(!s.muted));
      if (soundLabel) soundLabel.textContent = s.muted ? 'Sound off' : 'Sound on';
    });
    soundBtn.addEventListener('click', () => {
      sfx.unlock();
      sfx.toggle();
    });
  }

  /* Data ------------------------------------------------------------------- */

  /** Checks one entry, fills in defaults; returns null (with a console hint) if unusable. */
  function normalise(raw, index, seen) {
    const text = (v) => typeof v === 'string' && v.trim() !== '';
    const problems = [];
    if (!raw || typeof raw !== 'object') problems.push('entry');
    else {
      ['id', 'name', 'team', 'position', 'photo'].forEach((key) => { if (!text(raw[key])) problems.push(key); });
      if (text(raw.id) && seen.has(raw.id.trim())) problems.push('id (duplicate)');
    }
    if (problems.length) {
      console.warn(`[team] Skipped organizers[${index}]${raw && raw.id ? ` "${raw.id}"` : ''}: check ${problems.join(', ')}.`);
      return null;
    }
    seen.add(raw.id.trim());
    const linkedin = /^https:\/\//i.test(raw.linkedin || '') ? raw.linkedin.trim() : '';
    if (!linkedin) console.warn(`[team] "${raw.id}" has no https LinkedIn URL, so its card has no LinkedIn sticker.`);
    const team = raw.team.trim();
    return {
      id: raw.id.trim(),
      name: raw.name.trim(),
      team,
      teamKey: slug(team),
      position: raw.position.trim(),
      photo: raw.photo.trim(),
      linkedin,
      theme: THEMES.includes(raw.theme) ? raw.theme : '',
    };
  }

  /** @returns {Promise<Organizer[]>} one column per team, in the order the teams
      first appear in the file; within a team, in file order */
  async function loadOrganizers() {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`${DATA_URL}: HTTP ${response.status}`);
    const json = await response.json();
    const list = Array.isArray(json) ? json : json.organizers;
    if (!Array.isArray(list)) throw new Error(`${DATA_URL}: expected an array of organizers`);
    const seen = new Set();
    const organizers = list.map((raw, i) => normalise(raw, i, seen)).filter(Boolean);
    const teamOrder = [...new Set(organizers.map((org) => org.teamKey))];
    return organizers
      .sort((a, b) => teamOrder.indexOf(a.teamKey) - teamOrder.indexOf(b.teamKey))
      .map((org) => {
        const look = teamLook(org.teamKey, teamOrder.indexOf(org.teamKey));
        return { ...org, theme: org.theme || look.theme, mascot: look.mascot };
      });
  }

  /* Name plate fit --------------------------------------------------------
     Names are set in one line; a long one shrinks instead of wrapping. The
     plate leaves about 5 em of the base size for the name. Estimated from the
     length first, then measured with the real font once it has loaded. */
  const NAME_ROOM_EM = 5.05;
  const NAME_TRACKING_EM = 0.035;
  let measureCtx = null;

  function nameFit(name) {
    const text = name.toUpperCase();
    let widthEm = text.length * 0.5;
    if (measureCtx) widthEm = measureCtx.measureText(text).width / 100 + NAME_TRACKING_EM * text.length;
    return Math.min(1, NAME_ROOM_EM / widthEm).toFixed(3);
  }

  function refitNames(root = document) {
    root.querySelectorAll('.ocard__name').forEach((el) => {
      el.style.setProperty('--fit', nameFit(el.textContent));
    });
  }

  function whenDisplayFontReady() {
    if (!document.fonts || !document.fonts.load) return;
    document.fonts.load('400 100px Bangers').then((faces) => {
      if (!faces.length) return;
      measureCtx = document.createElement('canvas').getContext('2d');
      measureCtx.font = '400 100px Bangers';
      refitNames();
    }).catch(() => {});
  }

  /* OrganizerCard ----------------------------------------------------------
     OrganizerCard(org, { index, face, full })
       face  "front" | "back": the side showing; flips in 3D when changed
       full  false: a card for the deck and tableau, with a button over its
                    face (it picks the card) and the LinkedIn link on top
             true:  an <article> with the name as a heading, for the focused view
     The front shows only the position, the name, the photo and LinkedIn.
     Returns the element; set el.dataset.face to flip it. */

  const BACK_HTML = `
    <span class="ocard__face ocard__back" aria-hidden="true">
      <span class="ocard__back-inner">
        ${['tl', 'tr', 'bl', 'br'].map((corner) => use('oc-sparkle', `ocard__back-star ocard__back-star--${corner}`)).join('')}
        <img class="ocard__back-logo" src="assets/mat9logo.webp" alt="" width="2160" height="728" decoding="async">
        <span class="ocard__back-pill">Organizing team</span>
        <img class="ocard__back-mascot" src="assets/mascot/mascot-red-cheer.svg" alt="" width="242" height="325" decoding="async">
      </span>
    </span>`;

  function frontHTML(org, full) {
    const nameTag = full ? 'h2' : 'span';
    // On the table the card's button already names the card, so the visible
    // position and name are not read out a second time
    const quiet = full ? '' : ' aria-hidden="true"';
    const linkedin = org.linkedin
      ? `<a class="ocard__in" href="${esc(org.linkedin)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(org.name)} on LinkedIn">${use('oc-linkedin')}</a>`
      : '';
    const opener = full
      ? ''
      : `<button class="ocard__open" type="button" aria-haspopup="dialog" aria-label="${esc(org.name)}, ${esc(org.position)}"></button>`;

    // The button comes first so each card tabs as: the card, then its LinkedIn
    return `
    <span class="ocard__face ocard__front">
      ${opener}
      <span class="ocard__frame">
        <span class="ocard__role"${quiet}>${esc(org.position)}</span>
        <span class="ocard__plate">
          <span class="ocard__badge" aria-hidden="true"><img src="assets/mascot/mascot-${org.mascot}.svg" alt="" width="242" height="325" decoding="async"></span>
          <${nameTag} class="ocard__name" style="--fit:${nameFit(org.name)}"${quiet}>${esc(org.name)}</${nameTag}>
          ${linkedin}
        </span>
        <span class="ocard__window">
          <span class="ocard__scene" aria-hidden="true">
            ${use('oc-sparkle', 'ocard__doodle ocard__doodle--a')}
            ${use('oc-star', 'ocard__doodle ocard__doodle--b')}
            ${use('oc-sparkle', 'ocard__doodle ocard__doodle--c')}
          </span>
          <span class="ocard__cutout"><img class="ocard__photo" src="${esc(org.photo)}" alt="${esc(org.name)}, ${esc(org.position)}" width="800" height="1000" loading="lazy" decoding="async"></span>
        </span>
      </span>
      <span class="ocard__shine" aria-hidden="true"><i></i></span>
    </span>`;
  }

  /**
   * @param {Organizer} org
   * @param {{ index?: number, face?: 'front'|'back', full?: boolean }} [options]
   */
  function OrganizerCard(org, { index = 0, face = 'front', full = false } = {}) {
    const el = document.createElement(full ? 'article' : 'div');
    el.className = `ocard${index % 2 ? ' ocard--alt' : ''}`;
    el.dataset.id = org.id;
    el.dataset.team = org.teamKey;
    el.dataset.theme = org.theme;
    el.dataset.face = face;
    el.innerHTML = `<span class="ocard__flip">${frontHTML(org, full)}${BACK_HTML}</span>`;
    return el;
  }

  /* The table --------------------------------------------------------------- */
  const crew = {
    state: 'loading',
    cards: [], // tile cards, in data order (grouped by team)
    columns: [], // { team, el, tab, slot, cardsEl, cards[] }
    tableau: null,
    deck: null,
    pile: null,
    hit: null,
    say: null,
    glow: null,
    burst: null,
  };
  const ORG = new WeakMap(); // card → organizer
  const SEAT = new WeakMap(); // card → { column, slot }

  const HOW = {
    deal: '<span class="crew-say--mouse">Click</span><span class="crew-say--touch">Tap</span> the deck to deal the crew',
    open: '<span class="crew-say--mouse">Click</span><span class="crew-say--touch">Tap</span> a card to see it up close',
  };

  function setState(next) {
    crew.state = next;
    table.dataset.state = next;
  }

  function setCaption(html, isError = false) {
    if (!captionEl) return;
    captionEl.innerHTML = html;
    captionEl.classList.toggle('is-error', isError);
  }

  function dealtCaption() {
    return `<b>${crew.cards.length}</b> organizers &middot; <b>${crew.columns.length}</b> teams &middot; ${HOW.open}`;
  }

  function buildTable(organizers) {
    // Organizers arrive grouped by team, in column order
    const keys = [...new Set(organizers.map((org) => org.teamKey))];

    const tableau = document.createElement('div');
    tableau.className = 'crew-tableau';
    crew.columns = keys.map((key, place) => {
      const members = organizers.filter((org) => org.teamKey === key);
      const label = members[0].team; // the team's name as written in the data
      const look = teamLook(key, place);
      const count = members.length;
      // A stack is taller than a single card, so it spans more than one
      // tableau row and the single cards fill in beside it
      const height = CARD_RATIO + (count - 1) * PEEK + (count > 1 ? STACK_ROOM : 0);
      const span = Math.max(1, Math.ceil(height / (CARD_RATIO + ROW_EXTRA)));
      const col = document.createElement('section');
      col.className = 'crew-col';
      col.dataset.team = key;
      col.dataset.theme = look.theme;
      col.dataset.count = String(count);
      col.style.setProperty('--span', String(span));
      col.setAttribute('aria-labelledby', `crew-tab-${key}`);
      col.innerHTML = `
        <h2 class="crew-tab" id="crew-tab-${key}">${esc(label)}<span class="crew-tab__count"><span class="sr-only">, </span>${count}<span class="sr-only"> ${count === 1 ? 'card' : 'cards'}</span></span></h2>
        <div class="crew-col__cards" style="aspect-ratio: 1 / ${(CARD_RATIO + (count - 1) * PEEK).toFixed(3)}">
          <span class="crew-col__slot" aria-hidden="true">${use(look.emblem)}</span>
        </div>`;
      tableau.append(col);
      return {
        team: key,
        label,
        span,
        el: col,
        tab: col.querySelector('.crew-tab'),
        slot: col.querySelector('.crew-col__slot'),
        cardsEl: col.querySelector('.crew-col__cards'),
        cards: [],
      };
    });

    crew.cards = organizers.map((org, index) => {
      const card = OrganizerCard(org, { index, face: 'back' });
      const column = crew.columns.find((c) => c.team === org.teamKey);
      ORG.set(card, org);
      SEAT.set(card, { column, slot: column.cards.length });
      column.cards.push(card);
      card.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'mouse' && crew.state === 'dealt') play('pop', { volume: 0.5 });
      });
      // The LinkedIn sticker is a plain link; only the card's own button picks the card
      openerOf(card).addEventListener('click', () => onCardClick(card));
      return card;
    });

    const deck = document.createElement('div');
    deck.className = 'crew-deck';
    deck.innerHTML = `
      <div class="crew-deck__spot">
        <span class="crew-deck__glow" aria-hidden="true"></span>
        <span class="crew-deck__burst" aria-hidden="true"></span>
        <button class="crew-deck__hit" type="button" aria-label="Deal organizer cards" aria-describedby="crew-caption"></button>
        <div class="crew-deck__float"><div class="crew-deck__lift"><div class="crew-deck__pile" inert></div></div></div>
        <div class="crew-deck__say" aria-hidden="true" hidden>
          <p class="crew-deck__bubble"><span class="crew-say--mouse">Click to deal!</span><span class="crew-say--touch">Tap to deal!</span></p>
        </div>
      </div>`;
    crew.tableau = tableau;
    crew.deck = deck;
    crew.pile = deck.querySelector('.crew-deck__pile');
    crew.hit = deck.querySelector('.crew-deck__hit');
    crew.say = deck.querySelector('.crew-deck__say');
    crew.glow = deck.querySelector('.crew-deck__glow');
    crew.burst = deck.querySelector('.crew-deck__burst');

    crew.hit.addEventListener('click', (event) => deal(event.detail === 0));
    crew.hit.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse') return;
      play('pop', { volume: 0.6 });
      fanTopCard(true);
    });
    crew.hit.addEventListener('pointerleave', () => fanTopCard(false));
    crew.hit.addEventListener('focus', () => { if (crew.hit.matches(':focus-visible')) fanTopCard(true); });
    crew.hit.addEventListener('blur', () => fanTopCard(false));

    surface.replaceChildren(tableau, deck);
    surface.classList.add('is-built');
  }

  /* Columns: up to five teams side by side on desktop; more teams share two
     rows (a stack counts once per row it spans), so the cards stay big
     enough to read. Two columns on tablets and phones. */
  function columnCount() {
    const n = crew.columns.length;
    if (window.innerWidth < 1024) return Math.min(n, 2);
    if (n <= 5) return n;
    const cells = crew.columns.reduce((sum, column) => sum + column.span, 0);
    return Math.ceil(cells / 2);
  }

  const narrow = () => window.matchMedia('(max-width: 760px)').matches;

  /** Sets the column count, then hands the deck the measured card size and
      the first slot's height on the table, so the deck matches the seats. The
      folded table (before a deal) is just tall enough for the deck, plus the
      bubble where it sits under the deck. */
  function layout() {
    table.style.setProperty('--cols', String(columnCount()));
    const first = crew.columns[0];
    if (!first) return;
    const seat = first.cardsEl.getBoundingClientRect();
    const deckTop = seat.top - surface.getBoundingClientRect().top;
    surface.style.setProperty('--card-w', `${seat.width}px`);
    surface.style.setProperty('--deck-top', `${deckTop}px`);
    surface.style.setProperty('--stack-h', `${Math.ceil(deckTop + seat.width * CARD_RATIO + (narrow() ? 96 : 30))}px`);
  }

  /* The deck --------------------------------------------------------------- */
  const POSE = new WeakMap(); // card → its resting pose in the pile

  /** A card's messy resting place in the pile, kept so the top card can fan and settle back */
  function setPose(card, i) {
    const pose = { x: rnd(-5, 5), y: rnd(-4, 4) - i * 0.9, rotation: rnd(-4, 4) };
    POSE.set(card, pose);
    gsap.set(card, pose);
  }

  /** Puts cards (bottom → top) face-down in a messy pile */
  function stackPile(cards) {
    cards.forEach((card, i) => {
      crew.pile.append(card);
      card.dataset.face = 'back';
      card.classList.remove('is-lifted');
      card.style.zIndex = '';
      setPose(card, i);
      gsap.set(flipOf(card), { rotationY: 180, rotation: 0, y: 0, scale: 1 });
    });
  }

  /** Hovering the deck slides the top card up and out a little, like a dealer's thumb */
  function fanTopCard(out) {
    if (crew.state !== 'stacked' || !crew.pile) return;
    const top = crew.pile.lastElementChild;
    const pose = top && POSE.get(top);
    if (!pose) return;
    gsap.to(top, out
      ? { x: pose.x + 8, y: pose.y - 16, rotation: pose.rotation + 6, duration: 0.32, ease: 'back.out(2.2)', overwrite: 'auto' }
      : { x: pose.x, y: pose.y, rotation: pose.rotation, duration: 0.25, ease: 'power2.out', overwrite: 'auto' });
  }

  function showBubble() {
    crew.say.hidden = false;
    gsap.fromTo(crew.say,
      { scale: 0, opacity: 0, rotation: -10 },
      { scale: 1, opacity: 1, rotation: 0, duration: 0.5, ease: 'back.out(2.2)', transformOrigin: narrow() ? '50% 100%' : '0% 50%' });
  }

  function hideBubble() {
    gsap.to(crew.say, {
      scale: 0,
      opacity: 0,
      duration: 0.2,
      ease: 'power2.in',
      onComplete: () => { crew.say.hidden = true; },
    });
  }

  /** Intro: the cards drop onto the table one by one into a messy pile */
  function placeDeck() {
    setState('placing');
    crew.pile.style.visibility = '';
    const cards = [...crew.pile.children];
    const tl = gsap.timeline({
      onComplete: () => {
        setState('stacked');
        setCaption(HOW.deal);
        showBubble();
        announce(`A deck of ${crew.cards.length} organizer cards is on the table. Press the deck to deal.`);
      },
    });
    tl.fromTo([crew.glow, crew.burst], { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.9, ease: 'power2.out' }, 0);
    tl.from(cards, {
      y: (i) => -280 - i * 10,
      x: () => rnd(-90, 90),
      rotation: () => rnd(-38, 38),
      opacity: 0,
      duration: 0.55,
      ease: 'back.out(1.3)',
      stagger: 0.05,
    }, 0.12);
  }

  /** Starts the intro once the table is on screen (or after a moment regardless) */
  function whenTableVisible(start) {
    let started = false;
    let observer = null;
    const go = () => {
      if (started) return;
      started = true;
      if (observer) observer.disconnect();
      start();
    };
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) go();
      }, { threshold: 0.25 });
      observer.observe(crew.pile.parentElement);
    }
    setTimeout(go, 2500);
  }

  /* Dealing ----------------------------------------------------------------- */

  /** A random deal: any column may be next, but each column fills top to bottom */
  function dealOrder() {
    const queues = crew.columns.map((column) => [...column.cards]);
    const order = [];
    while (queues.some((queue) => queue.length)) {
      const open = queues.filter((queue) => queue.length);
      order.push(open[Math.floor(Math.random() * open.length)].shift());
    }
    return order;
  }

  /** Scrolls just enough for the whole table to be on screen (under the nav),
      counting `grow` px the table is about to unfold by */
  function scrollTableIntoView(grow = 0) {
    const rect = table.getBoundingClientRect();
    const nav = document.querySelector('.site-nav');
    const top = (nav ? nav.getBoundingClientRect().bottom : 0) + 12;
    const below = rect.bottom + grow - window.innerHeight + 16;
    const delta = rect.top < top ? rect.top - top : Math.min(rect.top - top, Math.max(0, below));
    if (Math.abs(delta) > 4) {
      window.scrollTo({ top: window.scrollY + delta, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    }
  }

  /** Riffle shuffle: the pile splits in two and riffles back together. The
      cards fall back in reverse deal order, so the first to deal ends on top. */
  function shuffleFlourish(order) {
    const pileCards = [...crew.pile.children];
    const w = crew.pile.getBoundingClientRect().width;
    const half = Math.ceil(pileCards.length / 2);
    const lower = pileCards.slice(0, half);
    const upper = pileCards.slice(half);
    const back = [...order].reverse();
    const step = Math.min(0.034, 0.44 / back.length);
    const start = 0.34;

    const tl = gsap.timeline();
    tl.to(crew.burst, { rotation: '+=70', duration: 1.2, ease: 'power2.inOut' }, 0);
    tl.to(upper, {
      x: (i) => w * 0.6 + i * 1.2,
      y: (i) => -8 - i * 0.6,
      rotation: () => 7 + rnd(-1.5, 1.5),
      duration: 0.26,
      ease: 'power2.out',
      stagger: 0.012,
    }, 0);
    tl.to(lower, {
      x: (i) => -w * 0.6 - i * 1.2,
      y: (i) => -i * 0.6,
      rotation: () => -7 + rnd(-1.5, 1.5),
      duration: 0.26,
      ease: 'power2.out',
      stagger: 0.012,
    }, 0.02);
    tl.add(() => play('riffle', { duration: back.length * step + 0.12 }), start - 0.02);
    back.forEach((card, k) => {
      const at = start + k * step;
      tl.add(() => { card.style.zIndex = String(10 + k); }, at);
      tl.to(card, { x: rnd(-4, 4), y: -k * 0.9, rotation: rnd(-3.5, 3.5), duration: 0.2, ease: 'power3.out' }, at);
    });
    tl.add(() => play('snap', { volume: 0.8 }), '>-0.04');
    tl.to(crew.pile, { scale: 0.965, duration: 0.07, yoyo: true, repeat: 1, ease: 'power1.inOut' }, '<');
    return tl;
  }

  /** Flies every card from the deck to its seat, flipping it face-up on the way */
  function dealCards(order) {
    const total = order.length;
    const stagger = clamp(1 / total, 0.045, 0.085);
    const D = 0.8;
    const tabs = crew.columns.map((column) => column.tab);
    const slots = crew.columns.map((column) => column.slot);

    // Record where each card sits in the deck, seat it in its column, then let
    // Flip animate it from the deck to wherever the layout put it
    const state = Flip.getState(crew.cards);
    crew.columns.forEach((column) => column.cards.forEach((card) => column.cardsEl.append(card)));
    gsap.set(crew.cards, { x: 0, y: 0, rotation: 0 });
    // Cards waiting their turn stay stacked as the deck, the next one on top
    order.forEach((card, i) => { card.style.zIndex = String(600 + total - i); });

    let landed = 0;
    const tl = gsap.timeline();
    tl.to([crew.glow, crew.burst], { scale: 0.5, opacity: 0, duration: 0.5, ease: 'power2.in' }, 0);
    tl.fromTo(slots, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.35, ease: 'power2.out', stagger: 0.05 }, 0);
    tl.fromTo(tabs, { opacity: 0, y: -14, scale: 0.6 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(2.4)', stagger: 0.07 }, 0.05);

    order.forEach((card, i) => {
      const t = 0.15 + i * stagger;
      const flipEl = flipOf(card);
      const { slot } = SEAT.get(card);

      tl.add(() => {
        card.style.zIndex = String(1000 + i);
        play('thwip', { rate: 0.85 + Math.random() * 0.35, volume: 0.9 });
      }, t);
      tl.add(Flip.from(state, { targets: card, duration: D, ease: 'power3.out', scale: true }), t);
      // Tossed: up off the deck and down onto the table
      tl.fromTo(flipEl, { y: 0, scale: 1 }, { y: -34, scale: 1.1, duration: D * 0.36, ease: 'power2.out', immediateRender: false }, t);
      tl.to(flipEl, { y: 0, scale: 1, duration: D * 0.46, ease: 'power2.in' }, t + D * 0.36);
      // Turned face-up in the air, overshooting a little as it lands
      tl.fromTo(flipEl, { rotationY: 180 }, { rotationY: 0, duration: D * 0.7, ease: 'back.out(1.6)', immediateRender: false }, t + D * 0.14);
      // A spin that settles back to straight
      tl.fromTo(flipEl, { rotation: rnd(-14, 14) }, { rotation: 0, duration: D * 0.95, ease: 'back.out(2.5)', immediateRender: false }, t);
      tl.add(() => {
        card.style.zIndex = String(200 + slot);
        card.dataset.face = 'front';
        landed += 1;
        setCaption(`Dealing&hellip; <b>${landed}</b> / ${total}`);
        play('snap', { volume: 0.85 });
      }, t + D * 0.82);
    });
    return tl;
  }

  /** The reveal: fanfare, the team tabs hop, a gloss sweeps every card */
  function revealCrew() {
    play('fanfare');
    const tabs = crew.columns.map((column) => column.tab);
    const shines = crew.cards.map((card) => card.querySelector('.ocard__shine i'));
    const tl = gsap.timeline();
    tl.to(tabs, { y: -10, duration: 0.16, ease: 'power2.out', yoyo: true, repeat: 1, stagger: 0.07 }, 0);
    tl.fromTo(shines, { xPercent: -160, rotation: 18, opacity: 1 }, { xPercent: 420, duration: 0.9, ease: 'power2.inOut', stagger: 0.03 }, 0.05);
    tl.set(shines, { opacity: 0 });
  }

  function finishDeal(viaKeyboard) {
    crew.cards.forEach((card) => { card.style.zIndex = ''; });
    gsap.set(crew.cards, { clearProps: 'transform' });
    gsap.set(crew.cards.map(flipOf), { clearProps: 'transform' });
    table.classList.remove('is-animating');
    crew.tableau.inert = false;
    setState('dealt');
    revealCrew();
    setCaption(dealtCaption());
    if (reshuffleBtn) {
      reshuffleBtn.hidden = false;
      gsap.fromTo(reshuffleBtn, { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(2.4)', clearProps: 'transform,opacity' });
    }
    const teams = crew.columns.map((column) => `${column.label}, ${column.cards.length}`).join('; ');
    announce(`All ${crew.cards.length} cards dealt. ${teams}. Open a card to see it up close.`);
    if (viaKeyboard && crew.cards[0]) openerOf(crew.cards[0]).focus();
  }

  async function deal(viaKeyboard) {
    if (crew.state !== 'stacked' || !canAnimate()) return;
    const tabs = crew.columns.map((column) => column.tab);
    const slots = crew.columns.map((column) => column.slot);
    const foldedH = surface.offsetHeight;
    const fullH = crew.tableau.offsetHeight;
    // The top card may still be fanned from the hover: the shuffle takes over
    gsap.killTweensOf(crew.cards);
    gsap.set([...tabs, ...slots], { opacity: 0 });
    gsap.set(surface, { height: foldedH });
    // Cards in flight can't be clicked or tabbed to (their links included)
    crew.tableau.inert = true;
    setState('dealing');
    // The table unfolds to make room for the columns while the deck is shuffled
    gsap.to(surface, {
      height: fullH,
      duration: 0.6,
      ease: 'power2.inOut',
      onComplete: () => gsap.set(surface, { clearProps: 'height' }),
    });
    table.classList.add('is-animating');
    audioReady();
    announce(`Shuffling, then dealing ${crew.cards.length} cards into ${crew.columns.length} teams.`);
    setCaption('Shuffling&hellip;');
    const order = dealOrder();
    scrollTableIntoView(fullH - foldedH);
    hideBubble();
    await shuffleFlourish(order);
    setCaption(`Dealing&hellip; <b>0</b> / ${order.length}`);
    await dealCards(order);
    finishDeal(viaKeyboard);
  }

  /* Focused view --------------------------------------------------------------
     Clicking (or tapping) a dealt card lifts it out of its stack and brings it
     to the front, about 1.5x, over a dimmed table: a modal <dialog> holding
     the full card (an article, the name as its heading). It tilts toward the
     mouse with a glare. Prev / next (buttons, arrow keys or a swipe) stay in
     that card's team, top of the stack to bottom, and stop at either end:
     there the arrow dims and the card only nudges. Another team is picked on
     the table, so the close button, Esc or a click outside puts the card
     back. The stacks never change size: the lifted card just leaves a gap. */
  const view = {
    dialog: null,
    dim: null,
    stage: null,
    tilt: null,
    glare: null,
    bar: null,
    count: null,
    prev: null,
    next: null,
    close: null,
    live: null,
    card: null,
    team: null, // the open card's column: its cards, in stack order
    index: -1, // the open card's place in team.cards
    busy: false,
    closing: false,
    tl: null,
    nudge: null,
    tiltTo: null,
  };
  const icon = (d) => `<svg class="crew-btn__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;

  function buildFocus() {
    const dialog = document.createElement('dialog');
    dialog.className = 'crew-focus';
    dialog.setAttribute('aria-labelledby', 'crew-focus-name');
    dialog.innerHTML = `
      <div class="crew-focus__dim" data-focus-close></div>
      <div class="crew-focus__stage">
        <div class="crew-focus__tilt"><span class="crew-focus__glare" aria-hidden="true"></span></div>
        <div class="crew-focus__bar">
          <button class="crew-btn crew-focus__nav" type="button" aria-label="Previous organizer" data-focus-step="-1">${icon('M15 5l-7 7 7 7')}</button>
          <p class="crew-focus__count" aria-hidden="true"></p>
          <button class="crew-btn crew-focus__nav" type="button" aria-label="Next organizer" data-focus-step="1">${icon('M9 5l7 7-7 7')}</button>
        </div>
      </div>
      <button class="crew-btn crew-focus__close" type="button" aria-label="Close" data-focus-close>${icon('M6 6l12 12M18 6 6 18')}</button>
      <p class="sr-only" aria-live="polite" data-focus-live></p>`;
    document.body.append(dialog);
    Object.assign(view, {
      dialog,
      dim: dialog.querySelector('.crew-focus__dim'),
      stage: dialog.querySelector('.crew-focus__stage'),
      tilt: dialog.querySelector('.crew-focus__tilt'),
      glare: dialog.querySelector('.crew-focus__glare'),
      bar: dialog.querySelector('.crew-focus__bar'),
      count: dialog.querySelector('.crew-focus__count'),
      prev: dialog.querySelector('[data-focus-step="-1"]'),
      next: dialog.querySelector('[data-focus-step="1"]'),
      close: dialog.querySelector('.crew-focus__close'),
      live: dialog.querySelector('[data-focus-live]'),
    });

    dialog.querySelectorAll('[data-focus-close]').forEach((el) => el.addEventListener('click', closeFocus));
    dialog.querySelectorAll('[data-focus-step]').forEach((button) => {
      button.addEventListener('click', () => step(Number(button.dataset.focusStep)));
    });
    // Esc: fly the card home instead of vanishing
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeFocus();
    });
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        step(event.key === 'ArrowLeft' ? -1 : 1);
      } else if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); // the page behind stays put
      }
    });
    dialog.addEventListener('wheel', (event) => event.preventDefault(), { passive: false });

    // A swipe on the card (touch or pen) goes to the next or previous organizer in the team
    let swipe = null;
    view.tilt.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'mouse') swipe = { x: event.clientX, y: event.clientY };
    });
    view.tilt.addEventListener('pointerup', (event) => {
      if (!swipe) return;
      const dx = event.clientX - swipe.x;
      const dy = event.clientY - swipe.y;
      swipe = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1);
    });
    view.tilt.addEventListener('pointercancel', () => { swipe = null; });

    // Tilt and glare follow the mouse (max 8°, the side under the pointer dips)
    if (gsap) {
      const rx = gsap.quickTo(view.tilt, 'rotationX', { duration: 0.5, ease: 'power3' });
      const ry = gsap.quickTo(view.tilt, 'rotationY', { duration: 0.5, ease: 'power3' });
      view.tiltTo = (x, y) => { rx(x); ry(y); };
      view.tilt.addEventListener('pointermove', (event) => {
        if (event.pointerType !== 'mouse' || !canAnimate() || view.busy || view.closing) return;
        const r = view.tilt.getBoundingClientRect();
        const px = clamp((event.clientX - r.left) / r.width, 0, 1);
        const py = clamp((event.clientY - r.top) / r.height, 0, 1);
        view.tiltTo((0.5 - py) * 16, (px - 0.5) * 16);
        view.glare.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
        view.glare.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
        view.tilt.classList.add('is-tilting');
      });
      view.tilt.addEventListener('pointerleave', () => {
        view.tiltTo(0, 0);
        view.tilt.classList.remove('is-tilting');
      });
    }
  }

  function say(text) {
    view.live.textContent = '';
    requestAnimationFrame(() => { view.live.textContent = text; });
  }

  const tileOfView = () => view.team.cards[view.index];

  /** "Name, Position. 2 of 3 in Core." for screen readers */
  const sayCard = (org) => say(`${org.name}, ${org.position}. ${view.index + 1} of ${view.team.cards.length} in ${org.team}.`);

  /** Puts the open team's card at view.index in the focused view, as a full
      card, and sets the bar: the place in the team, an arrow dimmed at either
      end of the team, and no arrows at all for a team of one */
  function showFocusCard() {
    const tile = tileOfView();
    const org = ORG.get(tile);
    const last = view.team.cards.length - 1;
    // The tile's own index, so the doodles sit where they do on the table
    const card = OrganizerCard(org, { index: crew.cards.indexOf(tile), face: 'front', full: true });
    card.querySelector('.ocard__name').id = 'crew-focus-name';
    card.querySelector('.ocard__photo').loading = 'eager';
    if (view.card) view.card.remove();
    view.tilt.prepend(card);
    view.card = card;
    view.count.innerHTML = `<b>${view.index + 1}</b> / ${last + 1}<span class="crew-focus__team">${esc(org.team)}</span>`;
    view.bar.classList.toggle('is-solo', last === 0);
    // aria-disabled, not disabled: a focused arrow keeps focus when it dims
    view.prev.setAttribute('aria-disabled', String(view.index === 0));
    view.next.setAttribute('aria-disabled', String(view.index === last));
    return org;
  }

  /** The move that takes the focused card (at rest, centred) onto a tile on the table */
  function flightTo(tile) {
    const a = tile.getBoundingClientRect();
    const s = view.stage.getBoundingClientRect();
    const w = view.tilt.offsetWidth;
    const h = view.tilt.offsetHeight;
    return {
      x: a.left + a.width / 2 - (s.left + view.tilt.offsetLeft + w / 2),
      y: a.top + a.height / 2 - (s.top + view.tilt.offsetTop + h / 2),
      scale: a.width / w,
    };
  }

  function sweepShine(card) {
    const shine = card.querySelector('.ocard__shine i');
    return gsap.fromTo(shine,
      { xPercent: -160, rotation: 18, opacity: 1 },
      { xPercent: 420, duration: 0.8, ease: 'power2.inOut', onComplete: () => gsap.set(shine, { opacity: 0 }) });
  }

  function openFocus(tile) {
    if (crew.state !== 'dealt' || view.dialog.open) return;
    view.team = SEAT.get(tile).column;
    view.index = view.team.cards.indexOf(tile);
    const org = showFocusCard();
    view.dialog.showModal();
    tile.classList.add('is-lifted');
    view.close.focus();
    play('thwip', { rate: 0.9, volume: 0.8 });
    if (!canAnimate()) return;

    view.busy = true;
    gsap.set(view.tilt, { transformPerspective: 900, rotationX: 0, rotationY: 0 });
    const from = flightTo(tile);
    view.tl = gsap.timeline({ onComplete: () => { view.busy = false; } });
    view.tl.fromTo(view.dim, { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power1.out' }, 0);
    view.tl.fromTo(view.tilt,
      { ...from, rotation: rnd(-7, 7) },
      { x: 0, y: 0, scale: 1, rotation: 0, duration: 0.6, ease: 'back.out(1.25)' }, 0);
    view.tl.fromTo(view.bar, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }, 0.25);
    view.tl.fromTo(view.close, { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.25);
    view.tl.add(() => play('pop'), 0.48);
    view.tl.add(sweepShine(view.card), 0.42);
    // Landed: prev / next work from here, while the gloss finishes its sweep
    view.tl.add(() => { view.busy = false; }, 0.6);
    sayCard(org);
  }

  function closeFocus() {
    if (!view.dialog.open || view.closing) return;
    if (view.tl) view.tl.kill();
    if (view.nudge) view.nudge.kill();
    view.busy = false;
    const tile = tileOfView();
    const done = () => {
      tile.classList.remove('is-lifted');
      view.dialog.close();
      view.closing = false;
      view.tilt.classList.remove('is-tilting');
      if (gsap) gsap.set([view.tilt, view.dim, view.bar, view.close], { clearProps: 'transform,opacity' });
      // Back to the card on the table, which opens its stack for keyboard users
      openerOf(tile).focus();
    };
    if (!canAnimate()) {
      done();
      return;
    }
    view.closing = true;
    // A card further down a tall stack may be off screen: bring it in under the dim
    const r = tile.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) tile.scrollIntoView({ block: 'center', behavior: 'instant' });
    const to = flightTo(tile);
    view.tl = gsap.timeline({ onComplete: done });
    view.tl.to([view.bar, view.close], { opacity: 0, duration: 0.18 }, 0);
    view.tl.to(view.tilt, { ...to, rotation: 0, rotationX: 0, rotationY: 0, duration: 0.45, ease: 'power3.inOut' }, 0);
    view.tl.to(view.dim, { opacity: 0, duration: 0.4, ease: 'power1.in' }, 0.05);
    view.tl.add(() => play('snap', { volume: 0.7 }), 0.4);
  }

  /** Next (+1) or previous (-1) organizer in the open card's team. It never
      leaves the team: past the first or last card the card only nudges. */
  function step(dir) {
    if (!view.dialog.open || view.busy || view.closing) return;
    const to = view.index + dir;
    if (to < 0 || to >= view.team.cards.length) {
      nudge(dir);
      return;
    }
    if (view.nudge) view.nudge.kill();
    tileOfView().classList.remove('is-lifted');
    view.index = to;
    tileOfView().classList.add('is-lifted');
    play('thwip', { rate: 1 + Math.random() * 0.2, volume: 0.8 });
    if (!canAnimate()) {
      sayCard(showFocusCard());
      return;
    }
    view.busy = true;
    view.tiltTo(0, 0);
    view.tl = gsap.timeline({ onComplete: () => { view.busy = false; } });
    view.tl.to(view.tilt, { x: -dir * 150, rotation: -dir * 12, opacity: 0, duration: 0.18, ease: 'power2.in' });
    view.tl.add(() => sayCard(showFocusCard()));
    view.tl.fromTo(view.tilt,
      { x: dir * 150, rotation: dir * 12, opacity: 0 },
      { x: 0, rotation: 0, opacity: 1, duration: 0.42, ease: 'back.out(1.5)' });
  }

  /** The end of the team: the card starts off the way a step would send it,
      then springs back, so a press or swipe there still answers */
  function nudge(dir) {
    play('pop', { volume: 0.7 });
    if (!canAnimate()) return;
    if (view.nudge) view.nudge.kill();
    view.nudge = gsap.timeline()
      .to(view.tilt, { x: -dir * 26, rotation: -dir * 3, duration: 0.12, ease: 'power2.out' })
      .to(view.tilt, { x: 0, rotation: 0, duration: 0.6, ease: 'elastic.out(1, 0.45)' });
  }

  /* Dealt: opening a card, reshuffling --------------------------------------- */
  function onCardClick(card) {
    if (crew.state !== 'dealt') return;
    openFocus(card);
  }

  /** The bottom cards first, across the columns, so the stacks are lifted off top-down */
  function gatherOrder() {
    const order = [];
    const depth = Math.max(...crew.columns.map((column) => column.cards.length));
    for (let slot = depth - 1; slot >= 0; slot--) {
      crew.columns.forEach((column) => { if (column.cards[slot]) order.push(column.cards[slot]); });
    }
    return order;
  }

  async function reshuffle(viaKeyboard) {
    if (crew.state !== 'dealt' || !canAnimate()) return;
    crew.tableau.inert = true;
    setState('gathering');
    table.classList.add('is-animating');
    audioReady();
    setCaption('Gathering the crew&hellip;');
    announce('Gathering the cards back into the deck.');
    if (reshuffleBtn) {
      gsap.to(reshuffleBtn, {
        scale: 0.5,
        opacity: 0,
        duration: 0.2,
        ease: 'power2.in',
        onComplete: () => {
          reshuffleBtn.hidden = true;
          gsap.set(reshuffleBtn, { clearProps: 'transform,opacity' });
        },
      });
    }
    play('whoosh');

    const order = gatherOrder();
    const tabs = crew.columns.map((column) => column.tab);
    const slots = crew.columns.map((column) => column.slot);
    const state = Flip.getState(crew.cards);
    order.forEach((card, i) => {
      crew.pile.append(card);
      setPose(card, i);
    });

    const stagger = Math.min(0.045, 0.55 / order.length);
    const tl = gsap.timeline();
    order.forEach((card, i) => {
      const t = i * stagger;
      tl.add(Flip.from(state, { targets: card, duration: 0.6, ease: 'power3.inOut', scale: true }), t);
      tl.to(flipOf(card), { rotationY: 180, duration: 0.5, ease: 'power2.inOut' }, t + 0.04);
      if (i % 3 === 0) tl.add(() => play('thwip', { rate: 1.15 + Math.random() * 0.2, volume: 0.55 }), t);
      tl.add(() => { card.dataset.face = 'back'; }, t + 0.55);
    });
    tl.to(tabs, { opacity: 0, y: -8, scale: 0.85, duration: 0.3, stagger: 0.04, ease: 'power2.in' }, 0.1);
    tl.to(slots, { opacity: 0, duration: 0.35 }, 0.15);
    tl.fromTo([crew.glow, crew.burst], { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, ease: 'power2.out' }, '>-0.3');
    // With every card home, the table folds back to the deck's height
    tl.to(surface, {
      height: () => parseFloat(surface.style.getPropertyValue('--stack-h')) || surface.offsetHeight,
      duration: 0.5,
      ease: 'power2.inOut',
    }, '<');
    tl.add(() => play('riffle', { duration: 0.42 }), '<');
    tl.to(crew.pile, { scale: 0.965, duration: 0.07, yoyo: true, repeat: 1, ease: 'power1.inOut' }, '>-0.1');
    tl.add(() => play('snap'), '<');
    await tl;

    table.classList.remove('is-animating');
    setState('stacked');
    gsap.set(surface, { clearProps: 'height' });
    gsap.set([...tabs, ...slots], { clearProps: 'opacity,transform' });
    setCaption(HOW.deal);
    showBubble();
    announce('The cards are back in the deck. Press the deck to deal again.');
    if (viaKeyboard) crew.hit.focus();
  }

  /** Reduced motion, or no GSAP: the crew is simply on the table, faded in */
  function dealInstantly() {
    crew.columns.forEach((column) => column.cards.forEach((card) => {
      column.cardsEl.append(card);
      card.dataset.face = 'front';
    }));
    setState('dealt');
    setCaption(dealtCaption());
    if (gsap) gsap.from(crew.cards, { opacity: 0, duration: 0.5, stagger: 0.025, clearProps: 'opacity' });
    announce(`${crew.cards.length} organizer cards in ${crew.columns.length} teams.`);
  }

  /* Start ------------------------------------------------------------------ */
  whenDisplayFontReady();
  initSoundToggle();
  buildFocus();
  if (reshuffleBtn) reshuffleBtn.addEventListener('click', (event) => reshuffle(event.detail === 0));

  loadOrganizers()
    .then((organizers) => {
      if (!organizers.length) throw new Error('no organizers to show');
      buildTable(organizers);
      layout();
      let frame = 0;
      window.addEventListener('resize', () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(layout);
      });
      if (canAnimate()) {
        stackPile(shuffled(crew.cards));
        crew.pile.style.visibility = 'hidden';
        gsap.set([crew.glow, crew.burst], { opacity: 0 });
        whenTableVisible(placeDeck);
      } else {
        dealInstantly();
      }
    })
    .catch((error) => {
      console.error('[team]', error);
      setCaption('Couldn’t load the crew. Refresh to try again.', true);
    });
})();
