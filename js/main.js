// Make-A-Ton 9.0 · tapes, nav, prize counters, registration countdown
(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Tapes: build a seamless marquee from data-tape (two identical groups, slide by -50%)
  const tapes = [...document.querySelectorAll('.tape[data-tape]')];
  tapes.forEach((tape) => {
    const group = document.createElement('div');
    group.className = 'tape__group';
    for (let i = 0; i < 8; i++) {
      const item = document.createElement('span');
      item.className = 'tape__item';
      item.textContent = tape.dataset.tape;
      group.append(item);
    }
    const track = document.createElement('div');
    track.className = 'tape__track';
    track.append(group, group.cloneNode(true));
    tape.setAttribute('aria-hidden', 'true');
    tape.append(track);
  });
  // Same speed (px/s) for every tape, whatever its text length
  document.fonts.ready.then(() => {
    tapes.forEach((tape) => {
      const track = tape.querySelector('.tape__track');
      track.style.setProperty('--tape-speed', `${track.offsetWidth / 2 / 45}s`);
    });
  });

  // Nav: show after the hero, mobile menu toggle
  const nav = document.querySelector('[data-nav]');
  const hero = document.querySelector('.hero');
  if (nav && hero) {
    new IntersectionObserver(([entry]) => {
      nav.classList.toggle('is-visible', !entry.isIntersecting);
    }, { rootMargin: '-80px 0px 0px 0px' }).observe(hero);

    const toggle = nav.querySelector('.site-nav__toggle');
    const setOpen = (open) => {
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Close' : 'Menu';
    };
    toggle.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
    nav.querySelectorAll('.site-nav__menu a').forEach((link) => link.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && nav.classList.contains('is-open')) {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  // Prizes: count up when the podium scrolls into view
  const rupees = new Intl.NumberFormat('en-IN');
  if (!reduceMotion.matches) {
    const counter = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        counter.unobserve(entry.target);
        const el = entry.target;
        const end = Number(el.dataset.count);
        const start = performance.now();
        const tick = (now) => {
          const t = Math.min((now - start) / 1400, 1);
          el.textContent = rupees.format(Math.round(end * (1 - (1 - t) ** 3)));
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.6 });
    document.querySelectorAll('[data-count]').forEach((el) => counter.observe(el));
  }

  // Registration: countdown to open, then to close
  const reg = document.querySelector('[data-register]');
  if (reg) {
    const opens = new Date(reg.dataset.opens);
    const closes = new Date(reg.dataset.closes);
    const url = (reg.dataset.registerUrl || '').trim();
    const status = reg.querySelector('[data-register-status]');
    const button = reg.querySelector('[data-register-button]');
    const units = {};
    reg.querySelectorAll('[data-unit]').forEach((el) => { units[el.dataset.unit] = el; });
    const longDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
    const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
    const pad = (n) => String(n).padStart(2, '0');
    // Hero button: tag shows the date, links straight to the form once it's live, hides when closed
    const heroCta = document.querySelector('[data-hero-cta]');
    const heroTag = heroCta && heroCta.querySelector('[data-hero-cta-tag]');
    const linkToForm = (link) => {
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
    };

    const setState = (state) => {
      if (reg.dataset.state === state) return;
      reg.dataset.state = state;
      if (state === 'soon') {
        status.textContent = `Registrations open on ${longDate.format(opens)}`;
        button.textContent = `Link drops ${shortDate.format(opens)}`;
        if (heroCta) heroTag.textContent = `Opens ${shortDate.format(opens)}`;
      } else if (state === 'open') {
        status.textContent = `Registrations are open until ${longDate.format(closes)}`;
        button.textContent = url ? 'Register now' : 'Link coming soon';
        if (heroCta) heroTag.textContent = url ? `Open till ${shortDate.format(closes)}` : 'Link coming soon';
        if (url) {
          linkToForm(button);
          button.removeAttribute('aria-disabled');
          if (heroCta) linkToForm(heroCta);
        }
      } else {
        status.textContent = 'Registrations are closed. See you at the final!';
        if (heroCta) heroCta.hidden = true;
      }
    };

    const render = () => {
      const now = Date.now();
      const state = now < opens ? 'soon' : now <= closes ? 'open' : 'closed';
      setState(state);
      if (state === 'closed') return;
      const secs = Math.max(0, Math.floor(((state === 'soon' ? opens : closes) - now) / 1000));
      units.d.textContent = pad(Math.floor(secs / 86400));
      units.h.textContent = pad(Math.floor(secs / 3600) % 24);
      units.m.textContent = pad(Math.floor(secs / 60) % 60);
      units.s.textContent = pad(secs % 60);
    };
    render();
    setInterval(render, 1000);
  }
})();
