// Timeline · turns the static chapter list into a scroll-driven page-flip book.
// The <ol class="timeline-list"> stays the single source of truth (and what screen readers get).
(() => {
  const section = document.querySelector('[data-timeline]');
  const scroller = section && section.querySelector('[data-book-scroller]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Keep the static cards when motion is reduced or the screen is too short for a book
  if (!scroller || reduceMotion.matches || window.innerHeight < 560) return;

  const esc = (s) => (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const chapters = [...section.querySelectorAll('.timeline-list > li')].map((li, i) => ({
    num: String(i + 1).padStart(2, '0'),
    short: li.dataset.short,
    title: li.dataset.title,
    panel: li.dataset.panel,
    badge: li.dataset.badge,
    dialogue: li.dataset.dialogue,
    highlight: li.dataset.highlight,
    date: li.querySelector('time').textContent.trim(),
    activity: li.querySelector('h3').textContent.trim(),
    lead: li.querySelector('.timeline-list__lead b').textContent.trim(),
    blurb: li.querySelector('p:last-of-type').textContent.trim(),
  }));
  if (!chapters.length) return;
  const last = chapters[chapters.length - 1];

  const formatDialogue = (dialogue, highlight) => {
    if (!dialogue) return '';
    const safeDialogue = esc(dialogue);
    if (!highlight) return safeDialogue;
    const safeHighlight = esc(highlight);
    return safeDialogue.replace(safeHighlight, `<strong class="page__bubble-highlight">${safeHighlight}</strong>`);
  };

  // Spread k (k ≥ 1): left = art for chapter k (back of leaf k-1), right = details (front of leaf k)
  const art = (c, folio) => `
    <div class="page page--left page--art face--back">
      <div class="page__head">
        <p class="page__kicker">Chapter ${c.num}</p>
        ${c.badge ? `<p class="page__badge">${esc(c.badge)}</p>` : ''}
      </div>
      <div class="page__panel-wrap">
        <div class="page__panel-frame">
          <img class="page__panel-img" src="assets/timeline/${esc(c.panel)}" alt="${esc(c.title)}">
        </div>
        ${c.dialogue ? `
          <div class="page__bubble">
            <p>${formatDialogue(c.dialogue, c.highlight)}</p>
          </div>
        ` : ''}
      </div>
      <div class="page__foot">
        <span class="page__stamp">${esc(c.lead)}</span>
        <p class="page__folio">${folio}</p>
      </div>
    </div>`;

  const detail = (c, folio) => `
    <div class="page page--right page--chapter">
      <div class="page__head">
        <p class="page__kicker">Chapter ${c.num}</p>
        <p class="page__date-pill">${esc(c.short)}</p>
      </div>
      <h3 class="page__title">${esc(c.title)}</h3>
      <p class="page__activity">${esc(c.activity)}</p>
      <dl class="page__meta">
        <div><dt>Date</dt><dd>${esc(c.date)}</dd></div>
        <div><dt>In charge</dt><dd class="page__stamp">${esc(c.lead)}</dd></div>
      </dl>
      <p class="page__blurb">${esc(c.blurb)}</p>
      <p class="page__folio">${folio}</p>
    </div>`;
  const cover = `
    <div class="page page--right page--cover">
      <p class="page__tag">Make-A-Ton 9.0</p>
      <p class="page__cover-title">The<br>Timeline</p>
      <p class="page__cover-sub">A story in ${chapters.length} chapters</p>
      <img class="page__cover-shape" src="assets/shapes/ring.svg" alt="">
      <p class="page__cover-hint">Scroll to open ↓</p>
    </div>`;
  const end = `
    <div class="page page--left page--end face--back">
      <p class="page__cover-title">The end?</p>
      <p class="page__blurb">Not quite. The best chapter is the one you build.</p>
      <img class="page__shape page__shape--small" src="assets/shapes/bowtie.svg" alt="">
    </div>`;

  const leaves = [cover + art(chapters[0], 2)];
  chapters.forEach((c, i) => {
    const back = i + 1 < chapters.length ? art(chapters[i + 1], 2 * (i + 2)) : end;
    leaves.push(detail(c, 2 * i + 3) + back);
  });
  const n = leaves.length;
  const tabLabels = ['Cover', ...chapters.map((c) => c.num), 'End'];

  scroller.innerHTML = `
    <div class="book-stage">
      <div class="book" aria-hidden="true">
        <div class="page page--left page--base page--contents">
          <p class="page__kicker">Make-A-Ton 9.0</p>
          <h3 class="page__title">Contents</h3>
          <ol class="page__toc">
            ${chapters.map((c) => `<li><span>${c.num}</span><span>${esc(c.title)}</span><span>${esc(c.short)}</span></li>`).join('')}
          </ol>
          <p class="page__folio">1</p>
        </div>
        <div class="page page--right page--base page--backcover">
          <img class="page__logo" src="assets/logo.svg" alt="">
          <p class="page__cover-sub">See you at the final</p>
          <p class="page__tag">${esc(last.short)} · ${esc(last.lead)}</p>
        </div>
        ${leaves.map((html) => `<div class="leaf">${html}</div>`).join('')}
      </div>
      <div class="book-tabs" role="group" aria-label="Turn to a page of the timeline">
        ${tabLabels.map((label, i) => {
          const name = i === 0 ? 'Cover' : i === tabLabels.length - 1 ? 'End' : `Chapter ${label}`;
          return `<button type="button" data-spread="${i}" aria-label="${name}">${label}</button>`;
        }).join('')}
      </div>
    </div>`;

  section.classList.add('is-book');
  scroller.hidden = false;
  scroller.removeAttribute('aria-hidden');
  scroller.style.setProperty('--leaves', n);

  const leafEls = [...scroller.querySelectorAll('.leaf')];
  const tabs = [...scroller.querySelectorAll('.book-tabs button')];
  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const range = () => ({
    top: scroller.getBoundingClientRect().top + window.scrollY,
    length: scroller.offsetHeight - window.innerHeight,
  });

  let current = -1;
  let queued = false;
  const update = () => {
    queued = false;
    const { top, length } = range();
    const progress = clamp((window.scrollY - top) / length, 0, 1) * n;
    leafEls.forEach((leaf, i) => {
      // Each leaf turns during the middle 70% of its scroll slot, so pages rest while you read
      const t = ease(clamp((progress - i - 0.15) / 0.7, 0, 1));
      leaf.style.setProperty('--t', t.toFixed(4));
      leaf.style.zIndex = t === 0 ? n - i : t === 1 ? i + 1 : n + 1;
    });
    const spread = clamp(Math.round(progress), 0, n);
    if (spread !== current) {
      current = spread;
      tabs.forEach((tab, i) => tab.setAttribute('aria-current', i === spread ? 'step' : 'false'));
    }
  };
  const requestUpdate = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(update);
    }
  };

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);
  tabs.forEach((tab) => tab.addEventListener('click', () => {
    const { top, length } = range();
    window.scrollTo({ top: top + (length * Number(tab.dataset.spread)) / n, behavior: 'smooth' });
  }));
  update();

  // Switching on reduced motion mid-visit drops back to the static cards
  reduceMotion.addEventListener('change', (event) => {
    if (!event.matches) return;
    window.removeEventListener('scroll', requestUpdate);
    window.removeEventListener('resize', requestUpdate);
    section.classList.remove('is-book');
    scroller.hidden = true;
  });
})();
