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

  // Prizes: podium spring fan-out reveal & count up when scrolling into view
  const podium = document.querySelector('.podium');
  if (podium) {
    if (reduceMotion.matches) {
      podium.classList.add('is-visible');
    } else {
      const podiumObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          podium.classList.add('is-visible');
          podiumObserver.unobserve(entry.target);
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
      podiumObserver.observe(podium);
    }
  }

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
    }, { threshold: 0.4 });
    document.querySelectorAll('[data-count]').forEach((el) => counter.observe(el));
  }
})();
