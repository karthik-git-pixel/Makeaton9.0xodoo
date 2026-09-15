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

  // Hero Section (design_ton model): 3D tilt & Marquee track initialization
  function initCenterTitleTilt() {
    const stage = document.getElementById('top') || document.querySelector('.hero');
    const titleImg = document.getElementById('centerTitleImg');
    if (!stage || !titleImg || reduceMotion.matches) return;

    let mouseX = 0;
    let mouseY = 0;
    let currentX = 0;
    let currentY = 0;
    let isHovering = false;
    let rafId = null;

    function onPointerMove(e) {
      const rect = stage.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      mouseX = (e.clientX - centerX) / (rect.width / 2);
      mouseY = (e.clientY - centerY) / (rect.height / 2);

      mouseX = Math.max(-1, Math.min(1, mouseX));
      mouseY = Math.max(-1, Math.min(1, mouseY));

      if (!isHovering) {
        isHovering = true;
        startLoop();
      }
    }

    function onPointerLeave() {
      mouseX = 0;
      mouseY = 0;
    }

    function startLoop() {
      function animate() {
        currentX += (mouseX - currentX) * 0.08;
        currentY += (mouseY - currentY) * 0.08;

        const rotateX = -currentY * 7;
        const rotateY = currentX * 9;

        titleImg.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;

        if (Math.abs(mouseX - currentX) > 0.001 || Math.abs(mouseY - currentY) > 0.001) {
          rafId = requestAnimationFrame(animate);
        } else {
          isHovering = false;
        }
      }
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(animate);
    }

    stage.addEventListener('pointermove', onPointerMove, { passive: true });
    stage.addEventListener('pointerleave', onPointerLeave, { passive: true });
  }

  function initMarqueeTracks() {
    const tracks = document.querySelectorAll('.marquee-track');
    tracks.forEach(track => {
      if (track.children.length < 8) {
        const content = track.innerHTML;
        track.innerHTML = content + content;
      }
    });
  }

  initCenterTitleTilt();
  initMarqueeTracks();
})();

