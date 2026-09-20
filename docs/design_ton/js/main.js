/**
 * MAKEATON 9.0 - Main Script
 * Lightweight script for subtle 3D tilt, marquee initialization,
 * comic page-flip reveals and the sound effects that go with them.
 */

const sfx = window.MakeatonSound;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

document.addEventListener('DOMContentLoaded', () => {
  initAudioUnlock();
  initSoundToggle();
  initCenterTitleTilt();
  initMarqueeTracks();
  initHeroSounds();
  initTimelinePageFlips();
});

/**
 * Subtle 3D Tilt on Pointer Movement for the Center Title
 */
function initCenterTitleTilt() {
  const stage = document.getElementById('viewportStage');
  const titleImg = document.getElementById('centerTitleImg');

  if (!stage || !titleImg) return;

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

/**
 * Ensure Marquee tracks are seamlessly populated
 */
function initMarqueeTracks() {
  const tracks = document.querySelectorAll('.marquee-track');
  tracks.forEach(track => {
    // If track doesn't have enough clones, duplicate for 100% gapless continuous marquee
    if (track.children.length < 8) {
      const content = track.innerHTML;
      track.innerHTML = content + content;
    }
  });
}

/* ==========================================================================
   SOUND
   ========================================================================== */

/**
 * Browsers block audio until the visitor interacts, so the very first real
 * gesture wakes the AudioContext up. Once awake, the listeners retire.
 */
function initAudioUnlock() {
  if (!sfx || !sfx.supported) return;

  const events = ['pointerdown', 'keydown', 'touchstart'];

  function wake() {
    sfx.unlock();
    events.forEach(type => document.removeEventListener(type, wake));
  }

  events.forEach(type => document.addEventListener(type, wake, { passive: true }));
}

/**
 * Floating comic-style speaker button: mute state is remembered between
 * visits, and it pulses until audio has actually been unlocked.
 */
function initSoundToggle() {
  if (!sfx || !sfx.supported) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sound-toggle is-pending';
  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" class="sound-icon">
      <path class="sound-body" d="M4 9h3.5L12 4.8v14.4L7.5 15H4z"/>
      <path class="sound-wave sound-wave-1" d="M15.2 9.4a3.6 3.6 0 0 1 0 5.2"/>
      <path class="sound-wave sound-wave-2" d="M17.8 6.9a7.2 7.2 0 0 1 0 10.2"/>
      <path class="sound-slash" d="M15.6 9.2l5.2 5.6M20.8 9.2l-5.2 5.6"/>
    </svg>
  `;

  sfx.onChange(state => {
    button.classList.toggle('is-muted', state.muted);
    button.classList.toggle('is-pending', !state.unlocked && !state.muted);
    button.setAttribute('aria-pressed', String(!state.muted));
    button.setAttribute(
      'aria-label',
      state.muted ? 'Turn sound effects on' : 'Turn sound effects off'
    );
    button.title = state.muted ? 'Sound off' : 'Sound on';
  });

  button.addEventListener('click', () => {
    sfx.unlock();
    sfx.toggle();
  });

  document.body.appendChild(button);
}

/**
 * Hero flourishes: a cartoon boing on the title, a tape ratchet on the tickers.
 */
function initHeroSounds() {
  if (!sfx) return;

  const titleImg = document.getElementById('centerTitleImg');
  if (titleImg) {
    titleImg.addEventListener('click', () => sfx.play('boing', {}));
  }

  document.querySelectorAll('.caution-tape').forEach(tape => {
    tape.addEventListener('click', () => sfx.play('zip', {}));
  });
}

/* ==========================================================================
   TIMELINE PAGE FLIPS
   ========================================================================== */

/**
 * The four comic panels turn in like pages of a book the first time the
 * timeline scrolls into view, each one a beat behind the last and pitched a
 * little higher, so the cascade reads as a riffle rather than four copies of
 * one sound. Clicking a panel flips it again on demand.
 */
function initTimelinePageFlips() {
  const panels = Array.from(document.querySelectorAll('.comic-panel'));
  const section = document.getElementById('timeline');

  if (!panels.length) return;

  panels.forEach(panel => {
    panel.addEventListener('pointerenter', () => {
      if (sfx) sfx.play('pop', { volume: 0.8 });
    });

    panel.addEventListener('click', () => flipPanel(panel, 1));

    // Panels are cards, so keyboard users get the same flip.
    panel.tabIndex = 0;
    panel.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        flipPanel(panel, 1);
      }
    });
  });

  if (!('IntersectionObserver' in window)) {
    panels.forEach(panel => panel.classList.add('is-revealed'));
    return;
  }

  // Sweep of air as the timeline arrives, just before the pages turn.
  if (section) {
    const sectionObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        if (sfx) sfx.play('whoosh', {});
        observer.disconnect();
      });
    }, { threshold: 0.25 });

    sectionObserver.observe(section);
  }

  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;

      const panel = entry.target;
      const index = panels.indexOf(panel);

      observer.unobserve(panel);
      window.setTimeout(() => {
        // Later pages sit higher in pitch, like thumbing through a stack.
        flipPanel(panel, 1 + index * 0.07);
      }, index * 130);
    });
  }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });

  panels.forEach(panel => revealObserver.observe(panel));
}

/**
 * Runs one page-turn: restart the CSS animation, play the paper sweep, and
 * land it with a soft impact as the panel slaps back down.
 */
function flipPanel(panel, rate) {
  panel.classList.add('is-revealed');

  if (sfx) {
    sfx.play('pageFlip', { rate: rate });
    sfx.play('pow', { volume: 0.32, delay: 0.3 });
  }

  if (prefersReducedMotion) return;

  panel.classList.remove('is-flipping');
  void panel.offsetWidth; // force reflow so the animation restarts
  panel.classList.add('is-flipping');

  panel.addEventListener('animationend', function done() {
    panel.classList.remove('is-flipping');
    panel.removeEventListener('animationend', done);
  });
}
