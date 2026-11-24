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

  // Nav: show after the hero (on pages without one, e.g. /team, it is always
  // shown), mobile menu toggle
  const nav = document.querySelector('[data-nav]');
  const hero = document.querySelector('.hero');
  if (nav) {
    if (hero) {
      new IntersectionObserver(([entry]) => {
        nav.classList.toggle('is-visible', !entry.isIntersecting);
      }, { rootMargin: '-80px 0px 0px 0px' }).observe(hero);
    } else {
      nav.classList.add('is-visible');
    }

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
        setLabel('Virtual round results are out');
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

  // Desk buddy: the hero mascot (css/hero.css, .desk-pet). Its eyes follow the
  // pointer and it blinks now and then. Point anywhere on the art panel (or
  // tap it) and it walks along the desk to you, then strolls back to its spot
  // once you leave. Pointing at it gets a hop and a little dance; clicking it
  // makes it leap, then opens the arcade. With reduced motion it stands still
  // and a click opens the arcade straight away.
  function initDeskPet() {
    const pet = document.querySelector('[data-desk-pet]');
    if (!pet) return;
    const hit = pet.querySelector('.desk-pet__hit');
    const eye = pet.querySelector('.desk-pet__eye');
    const panel = pet.closest('.hero-art') || pet.parentElement;
    const stage = pet.offsetParent || pet.parentElement;
    const still = reduceMotion.matches;
    const sound = (name) => { if (window.MakeatonSound) window.MakeatonSound.play(name, {}); };

    // Walking: css/hero.css swings the legs while [data-gait] is set; one
    // 0.48s stride sweeps 0.62 body widths, hence this speed.
    const SPEED = 1.3; // body widths per second
    let x = 0; // px along the desk from the home spot
    let target = 0;
    let facing = 1;
    let walking = null;
    let last = 0;
    let hovered = false;
    let leaping = false;
    let visible = true;
    let homeTimer = null;
    let pointer = null;
    let lastMove = 0;

    const setGaze = (gx, gy) => {
      pet.style.setProperty('--gx', gx.toFixed(2));
      pet.style.setProperty('--gy', gy.toFixed(2));
    };
    // Gaze toward the pointer, in the mascot's own facing (+x is where it faces)
    const look = () => {
      if (walking) {
        setGaze(0.85, 0.1); // eyes on the road ahead
        return;
      }
      if (!pointer) return;
      // Measured from between the two eyes, at (137.4, 130.5) of the 242x325 body
      const r = eye.getBoundingClientRect();
      const ex = r.left + r.width * (facing > 0 ? 137.4 / 242 : 1 - 137.4 / 242);
      const ey = r.top + r.height * (130.5 / 325);
      const dx = pointer.x - ex;
      const dy = pointer.y - ey;
      const dist = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, dist / (r.width * 1.2));
      setGaze((dx / dist) * reach * facing, (dy / dist) * reach);
    };

    const place = () => { pet.style.transform = x ? `translateX(${x.toFixed(1)}px)` : ''; };
    const face = (dir) => {
      if (!dir || dir === facing) return;
      facing = dir;
      pet.classList.toggle('is-facing-left', dir < 0);
    };
    const halt = () => {
      if (walking) cancelAnimationFrame(walking);
      walking = null;
      target = x;
      delete pet.dataset.gait;
    };
    const stride = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const ahead = target - x;
      const move = SPEED * pet.offsetWidth * dt;
      face(Math.sign(ahead));
      if (Math.abs(ahead) <= move) {
        x = target;
        place();
        halt();
        if (x === 0) face(1); // back home: facing the screen again
        look();
        return;
      }
      x += Math.sign(ahead) * move;
      place();
      walking = requestAnimationFrame(stride);
    };
    const start = () => {
      if (walking || Math.abs(target - x) < 1) return;
      pet.dataset.gait = 'walk';
      last = performance.now();
      walking = requestAnimationFrame(stride);
      look();
    };
    // Walk so the mascot's middle ends up under clientX, staying on the desk
    const walkTo = (clientX) => {
      const s = stage.getBoundingClientRect();
      const w = pet.offsetWidth;
      const home = pet.offsetLeft;
      const spot = clientX - s.left - home - w / 2;
      const next = Math.round(Math.min(s.width * 0.97 - w - home, Math.max(s.width * 0.01 - home, spot)));
      if (!walking && Math.abs(next - x) < w * 0.15) return; // near enough: no shuffling on the spot
      target = next;
      start();
    };
    const goHome = () => {
      target = 0;
      start();
    };

    hit.addEventListener('click', () => {
      if (leaping) return;
      if (still) {
        openArcade('red');
        return;
      }
      leaping = true;
      halt();
      pet.classList.add('is-leaping');
      sound('boing');
      setTimeout(() => {
        pet.classList.remove('is-leaping');
        leaping = false;
        openArcade('red');
      }, 640);
    });
    if (still) return;

    hit.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse') return;
      hovered = true;
      clearTimeout(homeTimer);
      halt();
      look();
      sound('pop');
    });
    hit.addEventListener('pointerleave', (event) => {
      if (event.pointerType === 'mouse') hovered = false;
    });

    // Mouse: follow the pointer around the panel; head home after it leaves
    panel.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse' || hovered || leaping) return;
      clearTimeout(homeTimer);
      walkTo(event.clientX);
    });
    panel.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'mouse') return;
      clearTimeout(homeTimer);
      homeTimer = setTimeout(goHome, 1600);
    });
    // A tap (or click) on the scene: walk over there, and home again later
    panel.addEventListener('click', (event) => {
      if (hit.contains(event.target) || leaping) return;
      pointer = { x: event.clientX, y: event.clientY };
      clearTimeout(homeTimer);
      walkTo(event.clientX);
      if (event.pointerType !== 'mouse') homeTimer = setTimeout(goHome, 6000);
    });

    // The eyes follow the pointer anywhere on the page while the hero is in view
    let gazeFrame = null;
    document.addEventListener('pointermove', (event) => {
      if (!visible) return;
      pointer = { x: event.clientX, y: event.clientY };
      lastMove = performance.now();
      if (!gazeFrame) {
        gazeFrame = requestAnimationFrame(() => {
          gazeFrame = null;
          look();
        });
      }
    }, { passive: true });
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(pet);

    // Blinks (sometimes a double), and when nobody's pointing, it looks around
    const blink = () => {
      pet.classList.add('is-blinking');
      setTimeout(() => pet.classList.remove('is-blinking'), 110);
    };
    const blinkLater = () => {
      setTimeout(() => {
        if (visible && !leaping) {
          blink();
          if (Math.random() < 0.25) setTimeout(blink, 240);
        }
        blinkLater();
      }, 2200 + Math.random() * 3200);
    };
    blinkLater();
    const GLANCES = [[0.9, 0.1], [0, 0], [-0.8, -0.5], [0.5, 0.9], [0.6, -0.8]];
    setInterval(() => {
      if (!visible || walking || hovered || leaping || performance.now() - lastMove < 4000) return;
      const [gx, gy] = GLANCES[Math.floor(Math.random() * GLANCES.length)];
      setGaze(gx, gy);
    }, 2600);

    // The desk is sized in cqw: after a width change, start again from home
    let width = window.innerWidth;
    window.addEventListener('resize', () => {
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      halt();
      x = 0;
      target = 0;
      place();
      face(1);
    });
  }

  // Crew call: the mascot with the "Meet the organizers" sign above the footer
  // (css/sections.css). The first time the end of the FAQ comes into view it
  // runs in and skids to a stop; then, on a loop, it presents (the sign
  // spins), strolls off to the right and back in from the left.
  // Its legs swing only while it travels ([data-gait]), and it travels as fast
  // as its feet sweep, so it walks rather than skates. Hovering or focusing
  // it, or scrolling it away, freezes the whole show mid-step.
  function initCrewCall() {
    const call = document.querySelector('[data-crew-call]');
    if (!call) return;
    const group = call.querySelector('.crew-call__group');
    const link = call.querySelector('.crew-call__link');
    if (!group || !link) return;
    if (reduceMotion.matches || !group.animate || !('IntersectionObserver' in window)) {
      call.classList.add('is-standing');
      return;
    }

    // stride: one full step cycle in seconds (matches --stride in the CSS);
    // speed: how far a planted foot sweeps per half stride, in em per second
    const GAITS = { walk: { stride: 0.56, speed: 6.2 }, run: { stride: 0.28, speed: 15 } };
    const em = () => parseFloat(getComputedStyle(call).fontSize) || 16;
    let visible = false;
    let pointerOver = false;
    let focused = false;
    let started = false;
    let travel = null;
    const frozen = () => !visible || pointerOver || focused;

    const syncFreeze = () => {
      call.classList.toggle('is-frozen', frozen());
      if (!travel) return;
      if (frozen()) travel.pause();
      else travel.play();
    };

    // A timeout that stands still while the show is frozen
    const hold = (ms) => new Promise((resolve) => {
      let left = ms;
      let last = performance.now();
      const tick = (now) => {
        if (!frozen()) left -= now - last;
        last = now;
        if (left <= 0) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    // Offsets that put the whole parade just off the left or right edge
    const edges = () => {
      const rest = link.getBoundingClientRect();
      const trail = em() * 4; // the speed lines and the skid text trail behind it
      return { left: -(rest.right + trail), right: window.innerWidth - rest.left + trail };
    };

    // Travel with the legs going. It lasts a whole number of strides plus a
    // quarter, which ends with both legs hanging straight, so stopping doesn't
    // snap them. Returns once arrived; `travel` is set as soon as it starts.
    const go = async (from, to, gait, keyframes) => {
      const { stride, speed } = GAITS[gait];
      const strides = Math.max(1, Math.round(Math.abs(to - from) / em() / speed / stride)) + 0.25;
      call.dataset.gait = gait;
      travel = group.animate(keyframes || [
        { transform: `translateX(${from}px)` },
        { transform: `translateX(${to}px)` },
      ], { duration: strides * stride * 1000, easing: 'linear', fill: 'forwards' });
      syncFreeze();
      await travel.finished;
      travel.commitStyles();
      travel.cancel();
      travel = null;
      delete call.dataset.gait;
    };

    const show = async () => {
      started = true;
      call.classList.add('is-started', 'is-entering');
      const k = em();
      let edge = edges();
      // The first entrance is a run, leaning back into a skid at the end
      const arrived = go(edge.left, 0, 'run', [
        { transform: `translateX(${edge.left}px)` },
        { transform: `translateX(${k * 1.4}px) rotate(-6deg)`, offset: 0.88, easing: 'ease-out' },
        { transform: `translateX(${-k * 0.4}px) rotate(2deg)`, offset: 0.95 },
        { transform: 'none' },
      ]);
      hold(travel.effect.getTiming().duration * 0.86).then(() => {
        call.classList.remove('is-entering');
        call.classList.add('is-skidding');
        return hold(1300);
      }).then(() => call.classList.remove('is-skidding'));
      await arrived;
      for (;;) {
        call.classList.add('is-presenting');
        await hold(4800);
        call.classList.remove('is-presenting');
        edge = edges();
        await go(0, edge.right, 'walk');
        await hold(1200);
        edge = edges();
        await go(edge.left, 0, 'walk');
      }
    };

    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncFreeze();
      if (visible && !started) show();
    }, { threshold: 0.3 }).observe(call);

    link.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse') return;
      pointerOver = true;
      syncFreeze();
      if (window.MakeatonSound) window.MakeatonSound.play('pop', {});
    });
    link.addEventListener('pointerleave', () => { pointerOver = false; syncFreeze(); });
    link.addEventListener('focus', () => { focused = true; syncFreeze(); });
    link.addEventListener('blur', () => { focused = false; syncFreeze(); });
  }

  initCountdown();
  initRegister();
  initHero();
  initTerminal();
  initDeskPet();
  initCrewCall();
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
