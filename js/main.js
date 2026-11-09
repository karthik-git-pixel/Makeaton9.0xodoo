// Make-A-Ton 9.0 · tapes, nav, prize counters, registration countdown, hero
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

  // Registration countdown (IST). Before data-countdown-open it counts down to
  // the opening, then to data-countdown-deadline.
  function initCountdown() {
    const root = document.querySelector('[data-countdown-deadline]');
    if (!root) return;

    const deadline = new Date(root.dataset.countdownDeadline);
    if (Number.isNaN(deadline.getTime())) return;
    const opens = new Date(root.dataset.countdownOpen || '');

    const fields = {};
    root.querySelectorAll('[data-countdown-unit]').forEach((el) => {
      fields[el.dataset.countdownUnit] = el;
    });
    const label = root.querySelector('.countdown__label');
    const setLabel = (text) => {
      if (label && label.textContent !== text) label.textContent = text;
    };
    const pad = (n) => String(n).padStart(2, '0');

    let timer = null;
    const tick = () => {
      const now = Date.now();
      if (now >= deadline) {
        root.classList.add('is-over');
        setLabel('Registrations are closed');
        clearInterval(timer);
        return;
      }
      const upcoming = now < opens;
      setLabel(upcoming ? 'Registration opens in' : 'Registration ends in');
      const seconds = Math.floor(((upcoming ? opens : deadline) - now) / 1000);
      if (fields.days) fields.days.textContent = pad(Math.floor(seconds / 86400));
      if (fields.hours) fields.hours.textContent = pad(Math.floor(seconds / 3600) % 24);
      if (fields.minutes) fields.minutes.textContent = pad(Math.floor(seconds / 60) % 60);
      if (fields.seconds) fields.seconds.textContent = pad(seconds % 60);
    };

    tick();
    timer = setInterval(tick, 1000);
  }

  // Register buttons: open data-register-url in a new tab once it is filled in
  function initRegister() {
    document.querySelectorAll('button[data-register-url]').forEach((button) => {
      button.addEventListener('click', () => {
        const url = button.dataset.registerUrl;
        if (url) window.open(url, '_blank', 'noopener');
      });
    });
  }

  // Hero: the art panel's layers drift with the pointer. Only --px / --py
  // (-1 to 1) are written here; css/hero.css sets each layer's depth.
  function initHero() {
    const stage = document.querySelector('[data-hero]');
    if (!stage || reduceMotion.matches) return;

    let pending = null;
    stage.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'touch') return;
      const rect = stage.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      if (pending) cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        pending = null;
        stage.style.setProperty('--px', x.toFixed(3));
        stage.style.setProperty('--py', y.toFixed(3));
      });
    });

    stage.addEventListener('pointerleave', () => {
      stage.style.setProperty('--px', '0');
      stage.style.setProperty('--py', '0');
    });
  }

  // Hero terminal: types its lines one after another, holds, then starts over.
  // The markup already shows every line, so without JS or with reduced motion
  // the screen just stays full. Typing pauses while the hero is off screen.
  function initTerminal() {
    const list = document.querySelector('[data-terminal]');
    if (!list || reduceMotion.matches) return;

    const lines = [...list.children].map((li) => ({ li, text: li.textContent }));
    const TYPE_MS = 55;
    const LINE_MS = 420;
    const HOLD_MS = 3200;
    let line = 0;
    let char = 0;
    let timer = null;
    let visible = false;

    const clear = () => {
      lines.forEach(({ li }) => {
        li.textContent = '';
        li.hidden = true;
        li.classList.remove('is-active');
      });
      line = 0;
      char = 0;
    };

    const step = () => {
      timer = null;
      if (!visible) return;
      if (line >= lines.length) {
        clear();
        timer = setTimeout(step, LINE_MS);
        return;
      }
      const { li, text } = lines[line];
      if (char === 0) {
        lines.forEach(({ li: other }) => other.classList.remove('is-active'));
        li.hidden = false;
        li.classList.add('is-active');
      }
      char += 1;
      li.textContent = text.slice(0, char);
      if (char < text.length) {
        timer = setTimeout(step, TYPE_MS);
        return;
      }
      line += 1;
      char = 0;
      timer = setTimeout(step, line >= lines.length ? HOLD_MS : LINE_MS);
    };

    list.classList.add('is-live');
    clear();
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !timer) step();
    }).observe(list);
  }

  // Arcade easter egg: js/games.js and css/games.css load on first use only
  let arcadeReady = null;
  function openArcade(color) {
    if (!arcadeReady) {
      const load = (el) => new Promise((resolve, reject) => {
        el.onload = resolve;
        el.onerror = reject;
        document.head.append(el);
      });
      const style = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'css/games.css' });
      const script = Object.assign(document.createElement('script'), { src: 'js/games.js' });
      arcadeReady = Promise.all([load(style), load(script)]).catch((error) => {
        arcadeReady = null;
        throw error;
      });
    }
    arcadeReady.then(() => window.MakeatonArcade.open({ color })).catch(() => {});
  }

  // Mascot Rapid Expression Animator & Interactive Peeker
  function initMascots() {
    const MASCOT_SETS = {
      red: [
        'assets/mascot/mascot-red-cheer.svg',
        'assets/mascot/mascot-red-excited.svg',
        'assets/mascot/mascot-red-star-eyes.svg',
        'assets/mascot/mascot-red-cool.svg',
        'assets/mascot/mascot-red-curious.svg'
      ],
      green: [
        'assets/mascot/mascot-green-cheer.svg',
        'assets/mascot/mascot-green-excited.svg',
        'assets/mascot/mascot-green-star-eyes.svg',
        'assets/mascot/mascot-green-cool.svg',
        'assets/mascot/mascot-green-curious.svg'
      ]
    };

    // Preload SVGs for instantaneous zero-flicker transitions
    Object.values(MASCOT_SETS).flat().forEach((src) => {
      const img = new Image();
      img.src = src;
    });

    const bindMascot = (mascot) => {
      if (mascot.dataset.mascotBound === 'true') return;
      mascot.dataset.mascotBound = 'true';

      const img = mascot.querySelector('.mascot-img, .page__mascot-img');
      if (!img) return;

      const color = mascot.dataset.mascotColor || (img.src.includes('red') ? 'red' : 'green');
      let baseSrc = img.getAttribute('src');
      let cycleInterval = null;
      let currentIndex = 0;
      if (!mascot.title) mascot.title = 'Tap me to play';

      const getSet = () => MASCOT_SETS[color] || MASCOT_SETS.green;

      // Rapid Comic Flipbook Cycle
      const startCycling = (speedMs = 105) => {
        if (cycleInterval) clearInterval(cycleInterval);
        const set = getSet();
        cycleInterval = setInterval(() => {
          currentIndex = (currentIndex + 1) % set.length;
          img.src = set[currentIndex];
        }, speedMs);
      };

      const stopCycling = (landOnIndex = null) => {
        if (cycleInterval) {
          clearInterval(cycleInterval);
          cycleInterval = null;
        }
        const set = getSet();
        if (landOnIndex !== null && set[landOnIndex]) {
          img.src = set[landOnIndex];
        } else {
          img.src = baseSrc;
        }
      };

      // Hover Interaction: Rapid Expression Reel!
      mascot.addEventListener('mouseenter', () => {
        startCycling(95);
      });

      mascot.addEventListener('mouseleave', () => {
        stopCycling(0); // Settles cleanly on cheer/main pose
      });

      // A tap bursts the mascot and opens the arcade, playing as that mascot
      mascot.addEventListener('click', () => {
        mascot.classList.remove('is-bursting');
        void mascot.offsetWidth; // Trigger reflow for restart
        mascot.classList.add('is-bursting');
        stopCycling(0);
        openArcade(color);
      });
    };

    const scanAndBind = () => {
      document.querySelectorAll('.mascot-peeker, .mascot-corner, .page__mascot-wrap').forEach(bindMascot);
    };

    scanAndBind();
    window.addEventListener('timeline-book-ready', scanAndBind);

    // Idle Subtle Double-Take: every 4.5s, a visible mascot briefly blinks an expression
    if (!reduceMotion.matches) {
      setInterval(() => {
        const visibleMascots = [...document.querySelectorAll('.mascot-peeker, .mascot-corner, .page__mascot-wrap')].filter((m) => {
          const rect = m.getBoundingClientRect();
          return rect.top < window.innerHeight && rect.bottom > 0;
        });
        if (visibleMascots.length === 0) return;
        const target = visibleMascots[Math.floor(Math.random() * visibleMascots.length)];
        const img = target.querySelector('.mascot-img, .page__mascot-img');
        if (!img) return;

        const color = target.dataset.mascotColor || (img.src.includes('red') ? 'red' : 'green');
        const set = MASCOT_SETS[color] || MASCOT_SETS.green;
        const orig = img.getAttribute('src');
        const flipPose = set[Math.floor(Math.random() * set.length)];

        img.src = flipPose;
        setTimeout(() => {
          if (!target.matches(':hover')) {
            img.src = orig;
          }
        }, 550);
      }, 4500);
    }
  }

  initCountdown();
  initRegister();
  initHero();
  initTerminal();
  initMascots();
})();


/* ==========================================================================
   SOUND
   ========================================================================== */
const sfx = window.MakeatonSound;

function initAudioUnlock() {
  if (!sfx || !sfx.supported) return;
  const events = ['pointerdown', 'keydown', 'touchstart'];
  function wake() {
    sfx.unlock();
    events.forEach(type => document.removeEventListener(type, wake));
  }
  events.forEach(type => document.addEventListener(type, wake, { passive: true }));
}

function initHeroSounds() {
  if (!sfx) return;
  const heroImages = document.querySelectorAll('.hero img');
  if (heroImages.length > 0) {
    heroImages[0].addEventListener('click', () => sfx.play('boing', {}));
  }
  document.querySelectorAll('.caution-tape, .tape').forEach(tape => {
    tape.addEventListener('click', () => sfx.play('zip', {}));
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initAudioUnlock();
  initHeroSounds();
});
