// Make-A-Ton Arcade · the mascot easter egg.
// Tap any mascot and js/main.js loads this file (with css/games.css), then
// calls MakeatonArcade.open({ color }). Two canvas games share one dialog:
//   Flap-a-Ton  · flap a winged star through the caution-tape pillars
//   Whack-a-Ton · tap mascots as they pop up, leave the bombs alone, 30 seconds
// Both are drawn on a logical canvas 360 wide and 540 to 720 tall (taller on
// phones, so the board fills the screen), scaled to fit.
(() => {
  if (window.MakeatonArcade) return;

  const W = 360;
  let H = 540; // set per game from the stage's shape, see play()
  const C = {
    ink: '#0C0E0F',
    yellow: '#FFE23A',
    red: '#EF4225',
    blue: '#4080FB',
    blueDeep: '#2F63D6',
    pink: '#F57EB4',
    green: '#22AC5F',
    greenDeep: '#1B8A4C',
    paper: '#FFF8EE',
    white: '#FFFFFF',
  };
  const FONT_DISPLAY = '"Bangers", Impact, "Arial Narrow", sans-serif';
  const FONT_TAPE = '"Titan One", "Arial Black", system-ui, sans-serif';
  const FACES = ['cheer', 'excited', 'star-eyes', 'cool', 'curious'];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  // Best scores live in this browser only; private mode just forgets them
  const store = {
    get(key) {
      try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; }
    },
    set(key, value) {
      try { localStorage.setItem(key, String(value)); } catch { /* storage blocked */ }
    },
  };

  // Sound · tiny synth blips, so there are no audio files to load ------------
  const sound = {
    ctx: null,
    muted: store.get('mat9-arcade-muted') === 1,
    unlock() {
      if (this.muted) return;
      try {
        this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch { this.ctx = null; }
    },
    tone(from, to, dur, type = 'square', gain = 0.05, delay = 0) {
      if (this.muted || !this.ctx) return;
      const t = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const amp = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(to, t + dur);
      amp.gain.setValueAtTime(gain, t);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(amp).connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    },
    flap() { this.tone(420, 760, 0.09, 'square', 0.035); },
    point() { this.tone(880, 880, 0.06, 'square', 0.035); this.tone(1320, 1320, 0.1, 'square', 0.035, 0.06); },
    boop() { this.tone(700, 240, 0.12, 'triangle', 0.1); },
    bonus() { [660, 880, 1100, 1320].forEach((f, i) => this.tone(f, f, 0.07, 'square', 0.03, i * 0.05)); },
    bust() { this.tone(240, 50, 0.45, 'sawtooth', 0.07); },
    tick() { this.tone(1250, 1250, 0.035, 'square', 0.025); },
    fanfare() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.12, 'square', 0.035, i * 0.09)); },
  };

  // Sprites · each face is rasterised once, with an ink silhouette for the
  // hard shadow. Drawing a bitmap each frame is far cheaper than an SVG. ------
  const SPRITE_H = 256;
  const SPRITE_W = Math.round((SPRITE_H * 242) / 325);
  const sprites = { red: {}, green: {} };
  let spritesReady = null;

  function loadSprites() {
    if (spritesReady) return spritesReady;
    const jobs = [];
    Object.keys(sprites).forEach((color) => {
      FACES.forEach((face) => {
        const img = new Image();
        img.src = `assets/mascot/mascot-${color}-${face}.svg`;
        jobs.push(img.decode().then(() => {
          const art = document.createElement('canvas');
          art.width = SPRITE_W;
          art.height = SPRITE_H;
          art.getContext('2d').drawImage(img, 0, 0, SPRITE_W, SPRITE_H);
          const shade = document.createElement('canvas');
          shade.width = SPRITE_W;
          shade.height = SPRITE_H;
          const s = shade.getContext('2d');
          s.drawImage(art, 0, 0);
          s.globalCompositeOperation = 'source-in';
          s.fillStyle = C.ink;
          s.fillRect(0, 0, SPRITE_W, SPRITE_H);
          sprites[color][face] = { art, shade };
        }).catch(() => { /* a missing face is skipped, not fatal */ }));
      });
    });
    spritesReady = Promise.all(jobs);
    return spritesReady;
  }

  // (x, y) is the middle of the mascot's body, not of the image
  function drawMascot(ctx, color, face, x, y, h, { rot = 0, sx = 1, sy = 1, shadow = 4 } = {}) {
    const sprite = sprites[color][face] || sprites[color].cheer;
    if (!sprite) return;
    const w = (h * SPRITE_W) / SPRITE_H;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(sx, sy);
    if (shadow) ctx.drawImage(sprite.shade, -w / 2 + shadow, -h * 0.45 + shadow, w, h);
    ctx.drawImage(sprite.art, -w / 2, -h * 0.45, w, h);
    ctx.restore();
  }

  // Flap-a-Ton's flyer · a round-cornered star with two little wings, in the
  // mascot's red or green. Drawn here rather than taken from the mascot art,
  // so its wings can beat. (x, y) is the star's centre.
  const FLYER_FILL = { red: '#EF0808', green: '#22AC5F' };

  function starShape(g, r) {
    const pts = [];
    for (let i = 0; i < 10; i += 1) {
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const d = i % 2 ? r * 0.56 : r;
      pts.push([Math.cos(a) * d, Math.sin(a) * d]);
    }
    g.beginPath();
    g.moveTo((pts[9][0] + pts[0][0]) / 2, (pts[9][1] + pts[0][1]) / 2);
    pts.forEach((pt, i) => {
      const next = pts[(i + 1) % 10];
      g.arcTo(pt[0], pt[1], next[0], next[1], i % 2 ? r * 0.12 : r * 0.26);
    });
    g.closePath();
  }

  // One wing, root at the origin, reaching out to +x with a scalloped edge
  function wing(g, side, angle) {
    g.save();
    g.scale(side, 1);
    g.translate(13, -3);
    g.rotate(angle);
    g.beginPath();
    g.moveTo(0, 3);
    g.quadraticCurveTo(9, -19, 29, -18);
    g.quadraticCurveTo(38, -17, 34, -9);
    g.quadraticCurveTo(36, -2, 27, -2);
    g.quadraticCurveTo(29, 5, 19, 4);
    g.quadraticCurveTo(18, 11, 8, 8);
    g.quadraticCurveTo(2, 8, 0, 3);
    g.closePath();
    g.fillStyle = C.white;
    g.fill();
    g.lineWidth = 2.5;
    g.lineJoin = 'round';
    g.strokeStyle = C.ink;
    g.stroke();
    g.restore();
  }

  function drawFlyer(g, x, y, { fill, rot = 0, flap = 0, face = 'happy', sx = 1, sy = 1 } = {}) {
    const r = 22;
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.scale(sx, sy);
    wing(g, -1, flap);
    wing(g, 1, flap);

    g.lineJoin = 'round';
    starShape(g, r);
    g.save();
    g.translate(3, 3);
    g.fillStyle = C.ink;
    g.fill();
    g.restore();
    starShape(g, r);
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = C.ink;
    g.stroke();

    // Shine and cheeks
    g.fillStyle = 'rgba(255, 255, 255, 0.55)';
    g.beginPath();
    g.ellipse(-8, -11, 3.2, 1.8, -0.7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(245, 126, 180, 0.8)';
    [-11, 11].forEach((cx) => { g.beginPath(); g.ellipse(cx, 5, 3, 2, 0, 0, Math.PI * 2); g.fill(); });

    g.strokeStyle = C.ink;
    g.fillStyle = C.ink;
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    if (face === 'flap') {
      // Squeezed-shut eyes and an open mouth, like the excited mascot
      g.beginPath();
      g.moveTo(-10, -6); g.lineTo(-5, -3); g.lineTo(-10, 0);
      g.moveTo(10, -6); g.lineTo(5, -3); g.lineTo(10, 0);
      g.stroke();
      g.beginPath();
      g.ellipse(0, 5.5, 3.4, 3, 0, 0, Math.PI * 2);
      g.fill();
    } else if (face === 'dead') {
      g.beginPath();
      [-7, 7].forEach((ex) => {
        g.moveTo(ex - 3, -6); g.lineTo(ex + 3, 0);
        g.moveTo(ex + 3, -6); g.lineTo(ex - 3, 0);
      });
      g.moveTo(-4, 6); g.quadraticCurveTo(-2, 4, 0, 6); g.quadraticCurveTo(2, 8, 4, 6);
      g.stroke();
    } else {
      [-7, 7].forEach((ex) => {
        g.fillStyle = C.white;
        g.beginPath();
        g.ellipse(ex, -3, 4.2, 5.2, 0, 0, Math.PI * 2);
        g.fill();
        g.lineWidth = 2;
        g.stroke();
        g.fillStyle = C.ink;
        g.beginPath();
        g.arc(ex + 1.3, -2.4, 2.3, 0, Math.PI * 2);
        g.fill();
      });
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(-4, 4.5);
      g.quadraticCurveTo(0, 8.5, 4, 4.5);
      g.stroke();
    }
    g.restore();
  }

  // Drawing helpers · the site's look: ink outlines, hard shadows ------------
  function path(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function panel(ctx, x, y, w, h, fill, { r = 14, shadow = 5, line = 3 } = {}) {
    if (shadow) {
      ctx.fillStyle = C.ink;
      path(ctx, x + shadow, y + shadow, w, h, r);
      ctx.fill();
    }
    ctx.fillStyle = fill;
    path(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.lineWidth = line;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
  }

  function inkText(ctx, text, x, y, { size = 40, fill = C.yellow, rot = 0, font = FONT_DISPLAY, drop = true } = {}) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.font = `${size}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * 0.16);
    ctx.strokeStyle = C.ink;
    if (drop) {
      const d = Math.max(2, size * 0.07);
      ctx.fillStyle = C.ink;
      ctx.strokeText(text, d, d);
      ctx.fillText(text, d, d);
    }
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = fill;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function label(ctx, text, x, y, { size = 14, fill = C.ink, align = 'center', font = FONT_TAPE } = {}) {
    ctx.font = `${size}px ${font}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  function pill(ctx, text, x, y, { size = 13, fill = C.ink, color = C.white, rot = 0 } = {}) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.font = `${size}px ${FONT_TAPE}`;
    const w = ctx.measureText(text).width + size * 1.6;
    const h = size * 2;
    panel(ctx, -w / 2, -h / 2, w, h, fill, { r: h / 2, shadow: fill === C.ink ? 0 : 3, line: 2.5 });
    label(ctx, text, 0, 1, { size, fill: color });
    ctx.restore();
  }

  function starPath(ctx, x, y, r, points, inner) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i += 1) {
      const a = (i * Math.PI) / points - Math.PI / 2;
      const d = i % 2 ? r * inner : r;
      ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    ctx.closePath();
  }

  function sparkle(ctx, x, y, r, fill) {
    starPath(ctx, x, y, r, 4, 0.32);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function dots(ctx, color, gap = 10, r = 1.35) {
    ctx.fillStyle = color;
    for (let y = gap / 2, row = 0; y < H; y += gap, row += 1) {
      for (let x = row % 2 ? gap : gap / 2; x < W; x += gap) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Static backgrounds, painted once per canvas size
  const BACKDROPS = {
    flap(b) {
      b.fillStyle = C.blue;
      b.fillRect(0, 0, W, H);
      const glow = b.createRadialGradient(W / 2, 150, 20, W / 2, 150, 380);
      glow.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
      glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
      b.fillStyle = glow;
      b.fillRect(0, 0, W, H);
      dots(b, 'rgba(255, 255, 255, 0.16)');
      [[40, 190, 7, C.yellow], [318, 110, 9, C.white], [290, 300, 6, C.yellow], [70, 360, 5, C.white], [190, 44, 6, C.pink]]
        .forEach(([x, y, r, fill]) => sparkle(b, x, y, r, fill));
    },
    whack(b) {
      b.fillStyle = C.green;
      b.fillRect(0, 0, W, H);
      const glow = b.createRadialGradient(W / 2, 320, 30, W / 2, 320, 400);
      glow.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
      glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
      b.fillStyle = glow;
      b.fillRect(0, 0, W, H);
      dots(b, 'rgba(12, 14, 15, 0.14)');
    },
  };

  // Shell · dialog, canvas, loop, input -----------------------------------------
  let dialog;
  let menu;
  let stage;
  let canvas;
  let ctx;
  let backButton;
  let muteButton;
  let title;
  let live;
  let color = 'red';
  let game = null;
  let raf = 0;
  let last = 0;
  let shakeAmp = 0;
  let pops = [];
  const backdrops = {};

  const ICON_SOUND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path class="arcade__waves" d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/><path class="arcade__slash" d="m16 9 6 6m0-6-6 6"/></svg>';
  const ICON_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  function build() {
    dialog = document.createElement('dialog');
    dialog.className = 'arcade';
    dialog.setAttribute('aria-labelledby', 'arcade-title');
    dialog.innerHTML = `
      <div class="arcade__frame">
        <header class="arcade__bar">
          <button class="arcade__back" type="button" hidden>&larr; Games</button>
          <h2 class="arcade__title" id="arcade-title">Make-A-Ton Arcade</h2>
          <button class="arcade__icon" type="button" data-arcade-mute aria-pressed="false">${ICON_SOUND}<span class="sr-only">Mute sound</span></button>
          <button class="arcade__icon" type="button" data-arcade-close>${ICON_CLOSE}<span class="sr-only">Close the arcade</span></button>
        </header>
        <div class="arcade__body">
          <section class="arcade__menu" aria-label="Pick a game">
            <p class="arcade__intro"><b>You found the secret arcade!</b> Pick a mascot, pick a game.</p>
            <fieldset class="arcade__pick">
              <legend>Play as</legend>
              <label><input type="radio" name="arcade-color" value="red"><img src="assets/mascot/mascot-red-cheer.svg" alt="" width="242" height="325"><span>Red</span></label>
              <label><input type="radio" name="arcade-color" value="green"><img src="assets/mascot/mascot-green-cheer.svg" alt="" width="242" height="325"><span>Green</span></label>
            </fieldset>
            <div class="arcade__cards">
              <button class="arcade-card arcade-card--flap" type="button" data-game="flap">
                <canvas class="arcade-card__art" data-art="flyer" width="120" height="104"></canvas>
                <span class="arcade-card__name">Flap-a-Ton</span>
                <span class="arcade-card__how">Tap, click or Space to flap through the caution tape.</span>
                <span class="arcade-card__best" data-best="mat9-flap-best"></span>
              </button>
              <button class="arcade-card arcade-card--whack" type="button" data-game="whack">
                <img class="arcade-card__art" data-face="cool" alt="" width="242" height="325">
                <span class="arcade-card__name">Whack-a-Ton</span>
                <span class="arcade-card__how">Tap the mascots, leave the bombs. 30 seconds.</span>
                <span class="arcade-card__best" data-best="mat9-whack-best"></span>
              </button>
            </div>
          </section>
          <section class="arcade__stage" hidden>
            <div class="arcade__screen"><canvas class="arcade__canvas" tabindex="0" role="img"></canvas></div>
          </section>
        </div>
        <p class="sr-only" aria-live="polite" data-arcade-live></p>
      </div>`;
    document.body.append(dialog);

    menu = dialog.querySelector('.arcade__menu');
    stage = dialog.querySelector('.arcade__stage');
    canvas = dialog.querySelector('.arcade__canvas');
    ctx = canvas.getContext('2d');
    backButton = dialog.querySelector('.arcade__back');
    muteButton = dialog.querySelector('[data-arcade-mute]');
    title = dialog.querySelector('.arcade__title');
    live = dialog.querySelector('[data-arcade-live]');

    dialog.querySelector('[data-arcade-close]').addEventListener('click', () => dialog.close());
    // A click on the dimmed page around the frame closes it too
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => {
      stop();
      document.documentElement.classList.remove('arcade-open');
    });
    backButton.addEventListener('click', showMenu);
    muteButton.addEventListener('click', () => {
      sound.muted = !sound.muted;
      store.set('mat9-arcade-muted', sound.muted ? 1 : 0);
      syncMute();
      if (!sound.muted) sound.unlock();
    });
    dialog.querySelectorAll('input[name="arcade-color"]').forEach((input) => {
      input.addEventListener('change', () => { color = input.value; syncColor(); });
    });
    dialog.querySelectorAll('[data-game]').forEach((card) => {
      card.addEventListener('click', () => { sound.unlock(); play(card.dataset.game); });
    });

    canvas.addEventListener('pointerdown', (event) => {
      if (!game) return;
      event.preventDefault();
      canvas.focus({ preventScroll: true });
      sound.unlock();
      const p = toLocal(event);
      game.press(p.x, p.y);
    });
    canvas.addEventListener('keydown', (event) => {
      if (!game || event.repeat) return;
      sound.unlock();
      if (game.key(event.code)) event.preventDefault();
    });

    new ResizeObserver(fit).observe(stage);
    syncMute();
  }

  function toLocal(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * W,
      y: ((event.clientY - rect.top) / rect.height) * H,
    };
  }

  function syncMute() {
    muteButton.setAttribute('aria-pressed', String(sound.muted));
  }

  function syncColor() {
    dialog.querySelectorAll('input[name="arcade-color"]').forEach((input) => { input.checked = input.value === color; });
    dialog.querySelectorAll('img.arcade-card__art').forEach((img) => {
      img.src = `assets/mascot/mascot-${color}-${img.dataset.face}.svg`;
    });
    const art = dialog.querySelector('[data-art="flyer"]');
    const k = Math.min(window.devicePixelRatio || 1, 2);
    art.width = 120 * k;
    art.height = 104 * k;
    const g = art.getContext('2d');
    g.setTransform(1.12 * k, 0, 0, 1.12 * k, 60 * k, 56 * k);
    drawFlyer(g, 0, 0, { fill: FLYER_FILL[color], flap: -0.3, face: 'flap' });
  }

  function syncBest() {
    dialog.querySelectorAll('[data-best]').forEach((el) => {
      const best = store.get(el.dataset.best);
      el.textContent = best ? `Best ${best}` : 'New game';
    });
  }

  // Scale the board to the room the stage has, crisp on any screen
  function fit() {
    if (!stage || stage.hidden) return;
    const box = stage.getBoundingClientRect();
    // The screen's border and hard shadow take 12px
    const scale = Math.max(0.2, Math.min((box.width - 12) / W, (box.height - 12) / H));
    const cssW = Math.floor(W * scale);
    const cssH = Math.floor(H * scale);
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  function backdrop(name) {
    const key = `${canvas.width}x${canvas.height}`;
    const cached = backdrops[name];
    if (cached && cached.key === key) return cached.canvas;
    const art = document.createElement('canvas');
    art.width = canvas.width;
    art.height = canvas.height;
    const b = art.getContext('2d');
    b.setTransform(art.width / W, 0, 0, art.height / H, 0, 0);
    BACKDROPS[name](b);
    backdrops[name] = { key, canvas: art };
    return art;
  }

  function shake(amount) {
    if (!reduceMotion.matches) shakeAmp = Math.max(shakeAmp, amount);
  }

  // Floating comic words: "+1", "POW!", "COMBO x2"
  function pop(text, x, y, { fill = C.yellow, size = 30 } = {}) {
    pops.push({ text, x, y, fill, size, t: 0, rot: rand(-0.18, 0.18) });
  }

  function drawPops(dt) {
    pops = pops.filter((p) => (p.t += dt) < 0.8);
    pops.forEach((p) => {
      const grow = p.t < 0.12 ? (p.t / 0.12) * 1.25 : 1.25 - Math.min(0.25, (p.t - 0.12) * 1.5);
      ctx.save();
      ctx.globalAlpha = 1 - clamp((p.t - 0.5) / 0.3, 0, 1);
      ctx.translate(p.x, p.y - p.t * 46);
      ctx.scale(grow, grow);
      inkText(ctx, p.text, 0, 0, { size: p.size, fill: p.fill, rot: p.rot });
      ctx.restore();
    });
  }

  function announce(text) {
    live.textContent = text;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    // Capped, so a background tab or a long frame never teleports anything
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    game.update(dt);
    shakeAmp = Math.max(0, shakeAmp - 50 * dt);

    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 0, W, H);
    if (shakeAmp) ctx.translate(rand(-1, 1) * shakeAmp, rand(-1, 1) * shakeAmp);
    game.draw(ctx);
    drawPops(dt);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    game = null;
    pops = [];
  }

  async function play(name) {
    stop();
    menu.hidden = true;
    stage.hidden = false;
    backButton.hidden = false;
    title.textContent = name === 'flap' ? 'Flap-a-Ton' : 'Whack-a-Ton';
    // Tall screens get a taller board rather than empty space around it
    const room = stage.getBoundingClientRect();
    H = Math.round(clamp((W * (room.height - 12)) / Math.max(1, room.width - 12), 540, 720));
    canvas.setAttribute('aria-label', name === 'flap'
      ? 'Flap-a-Ton. Press Space, click or tap to flap.'
      : 'Whack-a-Ton. Tap or click the mascots as they pop up, or press 1 to 9 for the holes. Avoid the bombs.');
    fit();
    await Promise.all([loadSprites(), document.fonts.load(`40px ${FONT_DISPLAY}`), document.fonts.load(`14px ${FONT_TAPE}`)]).catch(() => {});
    if (stage.hidden || !dialog.open) return;
    game = name === 'flap' ? createFlap() : createWhack();
    canvas.focus({ preventScroll: true });
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function showMenu() {
    stop();
    stage.hidden = true;
    menu.hidden = false;
    backButton.hidden = true;
    title.textContent = 'Make-A-Ton Arcade';
    syncBest();
    const first = dialog.querySelector('[data-game]');
    if (dialog.open) first.focus();
  }

  function open(options = {}) {
    if (!dialog) build();
    color = options.color === 'green' ? 'green' : 'red';
    syncColor();
    showMenu();
    if (!dialog.open) {
      dialog.showModal();
      document.documentElement.classList.add('arcade-open');
    }
    dialog.querySelector('[data-game]').focus();
    loadSprites();
  }

  // Flap-a-Ton ------------------------------------------------------------------
  function createFlap() {
    const KEY = 'mat9-flap-best';
    const GROUND = H - 70;
    const START = Math.round(H * 0.44);
    const X = 100;
    const R = 16;          // hitbox radius, a little under the drawn star
    const PW = 56;         // pillar width
    const CAP_W = 72;
    const CAP_H = 22;
    const SPACING = 196;   // distance between pillars
    const GRAVITY = 1500;
    const FLAP = -440;
    const QUIPS = ['Build failed!', 'Segfault!', 'Merge conflict!', 'Rate limited!', 'Stack overflow!', 'Wings not found'];
    const clouds = [
      { x: 30, y: 96, s: 1 },
      { x: 250, y: 160, s: 0.7 },
      { x: 330, y: 62, s: 0.85 },
      { x: 150, y: 256, s: 0.6 },
    ];
    let state;
    let bird;
    let pillars;
    let score;
    let speed;
    let best;
    let isNewBest;
    let quip;
    let faceTimer;
    let overAt;
    let wingT = 0;
    let t = 0;
    let groundX = 0;
    let cloudX = 0;

    function reset() {
      state = 'ready';
      bird = { y: START, vy: 0, rot: 0 };
      pillars = [];
      score = 0;
      speed = 150;
      best = store.get(KEY);
      isNewBest = false;
      faceTimer = 0;
    }

    function spawn(x) {
      const gap = Math.max(126, 170 - score * 2);
      const prev = pillars.length ? pillars[pillars.length - 1].y : START;
      // Keep each gap within reach of the one before
      const y = clamp(prev + rand(-150, 150), 56 + gap / 2, GROUND - 56 - gap / 2);
      pillars.push({ x, y, gap, passed: false });
    }

    function crash() {
      state = 'over';
      overAt = t;
      quip = pick(QUIPS).toUpperCase();
      sound.bust();
      shake(9);
      if (score > best) {
        best = score;
        isNewBest = true;
        store.set(KEY, best);
      }
      announce(`Flap-a-Ton over. Score ${score}. Best ${best}.`);
    }

    function hits(p) {
      const top = p.y - p.gap / 2;
      const bottom = p.y + p.gap / 2;
      const rects = [
        [p.x - PW / 2, -60, PW, top - CAP_H + 60],
        [p.x - CAP_W / 2, top - CAP_H, CAP_W, CAP_H],
        [p.x - CAP_W / 2, bottom, CAP_W, CAP_H],
        [p.x - PW / 2, bottom + CAP_H, PW, GROUND],
      ];
      return rects.some(([rx, ry, rw, rh]) => {
        const nx = clamp(X, rx, rx + rw);
        const ny = clamp(bird.y, ry, ry + rh);
        return (X - nx) ** 2 + (bird.y - ny) ** 2 < R * R;
      });
    }

    function press() {
      if (state === 'over') {
        if (t - overAt > 0.55) reset();
        return;
      }
      if (state === 'ready') {
        state = 'play';
        spawn(W + 40);
      }
      bird.vy = FLAP;
      faceTimer = 0.2;
      sound.flap();
    }

    function key(code) {
      if (['Space', 'ArrowUp', 'KeyW', 'Enter'].includes(code)) {
        press();
        return true;
      }
      return false;
    }

    function update(dt) {
      t += dt;
      faceTimer -= dt;
      // Wings flutter, and beat hard for a moment after each flap
      wingT += dt * (faceTimer > 0 ? 30 : 12);
      if (state !== 'over') {
        groundX = (groundX + speed * dt) % 28;
        cloudX += speed * 0.2 * dt;
      }

      if (state === 'ready') {
        bird.y = START + Math.sin(t * 3.2) * 9;
        bird.rot = 0;
        return;
      }

      if (state === 'play') {
        bird.vy = Math.min(bird.vy + GRAVITY * dt, 760);
        bird.y += bird.vy * dt;
        if (bird.y < R) {
          bird.y = R;
          bird.vy = 0;
        }
        bird.rot = clamp(bird.vy / 900, -0.4, 1.1);

        pillars.forEach((p) => { p.x -= speed * dt; });
        if (pillars[0].x < -CAP_W) pillars.shift();
        const lastPillar = pillars[pillars.length - 1];
        if (lastPillar.x < W + 40 - SPACING) spawn(lastPillar.x + SPACING);

        pillars.forEach((p) => {
          if (p.passed || p.x + PW / 2 > X - R) return;
          p.passed = true;
          score += 1;
          speed = Math.min(235, 150 + score * 3);
          sound.point();
          if (score % 10 === 0) pop(pick(['POW!', 'ZAP!', 'BOOM!', 'WHAM!']), X + 40, bird.y - 46, { fill: C.pink, size: 36 });
        });

        if (bird.y + R > GROUND || pillars.some(hits)) crash();
        return;
      }

      // Over: tumble down onto the desk
      bird.vy = Math.min(bird.vy + GRAVITY * dt, 900);
      bird.y = Math.min(bird.y + bird.vy * dt, GROUND - R + 2);
      bird.rot = Math.min(bird.rot + 6 * dt, 1.6);
    }

    function cloud(g, x, y, s) {
      const puffs = [[-26, 6, 17], [0, -4, 23], [26, 6, 17], [2, 10, 18]];
      g.save();
      g.translate(x, y);
      g.scale(s, s);
      g.fillStyle = C.ink;
      puffs.forEach(([px, py, r]) => { g.beginPath(); g.arc(px + 4, py + 4, r + 3, 0, Math.PI * 2); g.fill(); });
      puffs.forEach(([px, py, r]) => { g.beginPath(); g.arc(px, py, r + 3, 0, Math.PI * 2); g.fill(); });
      g.fillStyle = C.white;
      puffs.forEach(([px, py, r]) => { g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill(); });
      g.restore();
    }

    function column(g, x, y, w, h) {
      if (h <= 0) return;
      g.fillStyle = C.ink;
      g.fillRect(x + 5, y, w, h);
      g.fillStyle = C.yellow;
      g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255, 255, 255, 0.5)';
      g.fillRect(x + 8, y, 7, h);
      g.fillStyle = 'rgba(12, 14, 15, 0.12)';
      g.fillRect(x + w - 14, y, 14, h);
      g.lineWidth = 3;
      g.strokeStyle = C.ink;
      g.strokeRect(x, y, w, h);
    }

    // The pillar ends are caution tape, like the site's tickers
    function cap(g, x, y, w, h) {
      g.fillStyle = C.ink;
      g.fillRect(x + 5, y + 4, w, h);
      g.save();
      g.beginPath();
      g.rect(x, y, w, h);
      g.clip();
      g.fillStyle = C.yellow;
      g.fillRect(x, y, w, h);
      g.strokeStyle = C.ink;
      g.lineWidth = 7;
      for (let s = x - h; s < x + w + h; s += 18) {
        g.beginPath();
        g.moveTo(s, y + h);
        g.lineTo(s + h, y);
        g.stroke();
      }
      g.restore();
      g.lineWidth = 3;
      g.strokeStyle = C.ink;
      g.strokeRect(x, y, w, h);
    }

    function draw(g) {
      g.drawImage(backdrop('flap'), 0, 0, W, H);
      clouds.forEach((c) => {
        const span = W + 140;
        const x = ((((c.x - cloudX * c.s) % span) + span) % span) - 70;
        cloud(g, x, c.y, c.s);
      });

      pillars.forEach((p) => {
        const top = p.y - p.gap / 2;
        const bottom = p.y + p.gap / 2;
        column(g, p.x - PW / 2, -10, PW, top - CAP_H + 10);
        column(g, p.x - PW / 2, bottom + CAP_H, PW, GROUND - bottom - CAP_H + 4);
        cap(g, p.x - CAP_W / 2, top - CAP_H, CAP_W, CAP_H);
        cap(g, p.x - CAP_W / 2, bottom, CAP_W, CAP_H);
      });

      // The desk
      g.fillStyle = C.blueDeep;
      g.fillRect(0, GROUND, W, H - GROUND);
      g.fillStyle = 'rgba(12, 14, 15, 0.16)';
      for (let x = -groundX; x < W; x += 28) g.fillRect(x, GROUND, 3, H - GROUND);
      g.fillStyle = 'rgba(255, 255, 255, 0.2)';
      g.fillRect(0, GROUND + 3, W, 4);
      g.fillStyle = C.ink;
      g.fillRect(0, GROUND - 1.5, W, 3);

      let face = faceTimer > 0 ? 'flap' : 'happy';
      if (state === 'over') face = isNewBest ? 'flap' : 'dead';
      const squash = faceTimer > 0.1 ? 1 + (faceTimer - 0.1) * 1.2 : 1;
      drawFlyer(g, X, bird.y, {
        fill: FLYER_FILL[color],
        rot: bird.rot,
        flap: state === 'over' ? 0.8 : Math.sin(wingT) * 0.6 - 0.1,
        face,
        sx: 1.15 / squash,
        sy: 1.15 * squash,
      });

      if (state === 'ready') {
        inkText(g, 'FLAP-A-TON', W / 2, 108, { size: 58, rot: -0.05 });
        pill(g, 'TAP, CLICK OR SPACE TO FLAP', W / 2, 166, { size: 12 });
        if (best) pill(g, `BEST ${best}`, W / 2, START + 100, { size: 14, fill: C.yellow, color: C.ink, rot: 0.04 });
        return;
      }

      inkText(g, String(score), W / 2, 66, { size: 64 });

      if (state === 'over') {
        const top = H / 2 - 120;
        panel(g, 50, top, 260, 212, C.paper, { r: 16, shadow: 6 });
        inkText(g, quip, W / 2, top, { size: 34, fill: C.pink, rot: -0.04 });
        label(g, 'SCORE', W / 2, top + 46, { size: 13 });
        inkText(g, String(score), W / 2, top + 86, { size: 54, drop: false });
        label(g, `BEST ${best}`, W / 2, top + 134, { size: 15 });
        if (isNewBest) pill(g, 'NEW BEST!', W / 2 + 84, top + 46, { size: 12, fill: C.pink, color: C.ink, rot: 0.18 });
        if (t - overAt > 0.55 && Math.floor(t * 2.2) % 2 === 0) label(g, 'TAP TO GO AGAIN', W / 2, top + 180, { size: 15, fill: C.red });
      }
    }

    reset();
    return { press, key, update, draw };
  }

  // Whack-a-Ton -----------------------------------------------------------------
  function createWhack() {
    const KEY = 'mat9-whack-best';
    const ROUND = 30;
    const COLS = [66, 180, 294];
    const ROWS = [0.41, 0.63, 0.85].map((f) => Math.round(H * f));
    const HOLES = ROWS.flatMap((y) => COLS.map((x) => ({ x, y })));
    const RX = 46;
    const RY = 14;
    const SIZE = 94;
    // Numpad keys follow the grid: 7 8 9 on top, 1 2 3 at the bottom
    const NUMPAD = { 7: 0, 8: 1, 9: 2, 4: 3, 5: 4, 6: 5, 1: 6, 2: 7, 3: 8 };
    let state;
    let time;
    let score;
    let combo;
    let moles;
    let spawnIn;
    let best;
    let isNewBest;
    let overAt;
    let tickAt;
    let t = 0;

    function reset() {
      state = 'ready';
      time = ROUND;
      score = 0;
      combo = 0;
      moles = [];
      spawnIn = 0.4;
      best = store.get(KEY);
      isNewBest = false;
      tickAt = 5;
    }

    const multiplier = () => Math.min(3, 1 + Math.floor(combo / 5));
    const other = () => (color === 'red' ? 'green' : 'red');

    function spawn() {
      const free = HOLES.map((_, i) => i).filter((i) => !moles.some((m) => m.hole === i));
      if (!free.length) return;
      const progress = 1 - time / ROUND;
      const roll = Math.random();
      let kind = 'mate';
      if (progress > 0.08 && roll < 0.17) kind = 'bomb';
      else if (roll < 0.3) kind = 'cool';
      const up = lerp(1.1, 0.6, progress) * (kind === 'cool' ? 0.7 : 1) * rand(0.85, 1.15);
      moles.push({ hole: pick(free), kind, phase: 'rise', vis: 0, t: 0, up, hitT: 0 });
    }

    function finish() {
      state = 'over';
      overAt = t;
      sound.fanfare();
      if (score > best) {
        best = score;
        isNewBest = true;
        store.set(KEY, best);
      }
      announce(`Whack-a-Ton over. Score ${score}. Best ${best}.`);
    }

    function start() {
      reset();
      state = 'play';
    }

    function inside(m, x, y) {
      const h = HOLES[m.hole];
      const top = h.y - 78 * m.vis - 34;
      return Math.abs(x - h.x) < 44 && y > top && y < h.y + RY + 8;
    }

    function whack(m) {
      const h = HOLES[m.hole];
      m.phase = 'hit';
      m.hitT = 0;
      if (m.kind === 'bomb') {
        combo = 0;
        score = Math.max(0, score - 3);
        sound.bust();
        shake(12);
        pop('-3', h.x, h.y - 84, { fill: C.red, size: 34 });
        return;
      }
      combo += 1;
      const gain = (m.kind === 'cool' ? 3 : 1) * multiplier();
      score += gain;
      if (m.kind === 'cool') sound.bonus();
      else sound.boop();
      pop(`+${gain}`, h.x, h.y - 88, { fill: m.kind === 'cool' ? C.pink : C.yellow, size: 32 });
      if (combo % 5 === 0) pop(`COMBO x${multiplier()}`, W / 2, 132, { fill: C.pink, size: 34 });
    }

    function press(x, y) {
      if (state === 'ready') {
        start();
        return;
      }
      if (state === 'over') {
        if (t - overAt > 0.7) start();
        return;
      }
      const target = moles.find((m) => m.phase !== 'hit' && m.vis > 0.3 && inside(m, x, y));
      if (target) whack(target);
    }

    function key(code) {
      const digit = /^(Digit|Numpad)([1-9])$/.exec(code);
      if (digit) {
        const n = Number(digit[2]);
        const i = digit[1] === 'Numpad' ? NUMPAD[n] : n - 1;
        press(HOLES[i].x, HOLES[i].y - 30);
        return true;
      }
      if (state !== 'play' && (code === 'Space' || code === 'Enter')) {
        press(W / 2, H / 2);
        return true;
      }
      return false;
    }

    function update(dt) {
      t += dt;

      if (state === 'play') {
        time -= dt;
        if (time <= tickAt && time > 0) {
          sound.tick();
          tickAt -= 1;
        }
        if (time <= 0) {
          time = 0;
          finish();
        }
        const progress = 1 - time / ROUND;
        spawnIn -= dt;
        const active = moles.filter((m) => m.phase !== 'hit').length;
        if (state === 'play' && spawnIn <= 0 && active < (progress < 0.35 ? 2 : 3)) {
          spawn();
          spawnIn = lerp(0.7, 0.36, progress) * rand(0.75, 1.25);
        }
      }

      moles.forEach((m) => {
        if (m.phase === 'rise') {
          m.vis = Math.min(1, m.vis + dt / 0.13);
          if (m.vis === 1) m.phase = 'up';
        } else if (m.phase === 'up') {
          m.t += dt;
          if (m.t >= m.up || state !== 'play') m.phase = 'sink';
        } else if (m.phase === 'sink') {
          m.vis = Math.max(0, m.vis - dt / 0.15);
          if (m.vis === 0) {
            m.gone = true;
            // Letting a mascot get away breaks the combo
            if (m.kind !== 'bomb' && state === 'play') combo = 0;
          }
        } else {
          m.hitT += dt;
          if (m.hitT > 0.24) m.vis = Math.max(0, m.vis - dt / 0.18);
          if (m.vis === 0) m.gone = true;
        }
      });
      moles = moles.filter((m) => !m.gone);
    }

    function holeBack(g, h) {
      // Drop shadow — only the bottom half so it never floats above the hole rim
      g.fillStyle = C.greenDeep;
      g.beginPath();
      g.ellipse(h.x + 4, h.y + 8, RX + 12, RY + 9, 0, 0, Math.PI);
      g.fill();
      // Dark hole interior — bottom half only so it stays below the mascot
      g.fillStyle = C.ink;
      g.beginPath();
      g.ellipse(h.x, h.y, RX, RY, 0, 0, Math.PI);
      g.fill();
      g.fillStyle = '#1D2A24';
      g.beginPath();
      g.ellipse(h.x, h.y + 3, RX - 9, RY - 5, 0, 0, Math.PI);
      g.fill();
    }

    // The near lip of the hole, drawn over whatever is climbing out of it
    function holeFront(g, h) {
      // Fill the bottom semicircle (near lip) over the mascot
      g.fillStyle = C.ink;
      g.beginPath();
      g.ellipse(h.x, h.y, RX, RY, 0, 0, Math.PI);
      g.fill();
      // Stroke only the bottom half of the rim — keeps the ring from appearing over the mascot
      g.strokeStyle = C.ink;
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(h.x, h.y, RX + 1, RY + 1, 0, 0, Math.PI);
      g.stroke();
      g.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(h.x, h.y + 3, RX + 4, RY + 4, 0, 0.35, Math.PI - 0.35);
      g.stroke();
    }

    function bomb(g, x, y) {
      g.save();
      g.translate(x, y);
      g.fillStyle = C.ink;
      g.beginPath();
      g.arc(4, 4, 25, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2A2F33';
      g.beginPath();
      g.arc(0, 0, 25, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = C.ink;
      g.stroke();
      g.fillStyle = 'rgba(255, 255, 255, 0.4)';
      g.beginPath();
      g.ellipse(-9, -10, 7, 4, -0.7, 0, Math.PI * 2);
      g.fill();
      panel(g, -8, -33, 16, 10, '#5A6066', { r: 3, shadow: 0, line: 2.5 });
      g.beginPath();
      g.moveTo(0, -33);
      g.quadraticCurveTo(8, -48, 19, -42);
      g.lineWidth = 3;
      g.strokeStyle = C.ink;
      g.stroke();
      const flicker = 1 + Math.sin(t * 38) * 0.25;
      starPath(g, 19, -42, 9 * flicker, 7, 0.45);
      g.fillStyle = C.yellow;
      g.fill();
      g.lineWidth = 2;
      g.stroke();
      g.restore();
    }

    function boom(g, x, y, k) {
      const r = lerp(18, 56, Math.min(1, k * 4));
      g.save();
      g.globalAlpha = 1 - clamp((k - 0.25) / 0.2, 0, 1);
      starPath(g, x, y, r, 12, 0.6);
      g.fillStyle = C.yellow;
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = C.ink;
      g.stroke();
      starPath(g, x, y, r * 0.58, 10, 0.6);
      g.fillStyle = C.red;
      g.fill();
      g.restore();
    }

    function drawMole(g, m) {
      const h = HOLES[m.hole];
      // Only what is above the hole's centre line shows
      g.save();
      g.beginPath();
      g.rect(h.x - 70, h.y - 160, 140, 160);
      g.clip();
      if (m.kind === 'bomb') {
        if (m.phase !== 'hit') bomb(g, h.x, h.y + 40 - 68 * m.vis);
      } else {
        const face = m.phase === 'hit' ? 'excited' : m.kind === 'cool' ? 'cool' : 'cheer';
        const who = m.kind === 'cool' ? other() : color;
        drawMascot(g, who, face, h.x, h.y + 58 - 76 * m.vis, SIZE);
      }
      g.restore();
    }

    function drawRules(g) {
      const top = H / 2 - 120;
      g.fillStyle = 'rgba(12, 14, 15, 0.5)';
      g.fillRect(0, 0, W, H);
      inkText(g, 'WHACK-A-TON', W / 2, top - 54, { size: 54, rot: -0.04 });
      panel(g, 36, top, 288, 236, C.paper, { r: 16, shadow: 6 });
      const rows = [
        { y: top + 46, label: 'TAP A MASCOT', score: '+1', draw: () => drawMascot(g, color, 'cheer', 78, top + 48, 50, { shadow: 3 }) },
        { y: top + 106, label: 'COOL ONES', score: '+3', draw: () => drawMascot(g, other(), 'cool', 78, top + 108, 50, { shadow: 3 }) },
        { y: top + 166, label: 'BOMBS', score: '-3', draw: () => { g.save(); g.translate(78, top + 170); g.scale(0.72, 0.72); bomb(g, 0, 0); g.restore(); } },
      ];
      rows.forEach((row) => {
        row.draw();
        label(g, row.label, 112, row.y, { size: 14, align: 'left' });
        label(g, row.score, 302, row.y, { size: 20, align: 'right', fill: row.score === '-3' ? C.red : C.ink });
      });
      label(g, '5 IN A ROW = COMBO  ·  30 SECONDS', W / 2, top + 210, { size: 11, fill: '#5A6066' });
      if (Math.floor(t * 2.2) % 2 === 0) pill(g, 'TAP TO START', W / 2, top + 282, { size: 16, fill: C.yellow, color: C.ink });
    }

    function draw(g) {
      g.drawImage(backdrop('whack'), 0, 0, W, H);

      // Timer bar
      panel(g, 16, 16, W - 32, 22, C.paper, { r: 11, shadow: 4 });
      const left = time / ROUND;
      if (left > 0) {
        const hurry = time <= 5 && Math.floor(t * 4) % 2 === 0;
        g.fillStyle = hurry ? C.red : time <= 5 ? C.pink : C.yellow;
        path(g, 19, 19, (W - 38) * left, 16, 8);
        g.fill();
      }
      label(g, `${Math.ceil(time)}s`, W - 28, 28, { size: 11, align: 'right' });

      inkText(g, String(score), W / 2, 84, { size: 52 });
      if (best) pill(g, `BEST ${best}`, 64, 74, { size: 11, fill: C.paper, color: C.ink });
      if (multiplier() > 1 && state === 'play') pill(g, `COMBO x${multiplier()}`, W - 70, 74, { size: 11, fill: C.pink, color: C.ink, rot: 0.06 });

      HOLES.forEach((h, i) => {
        holeBack(g, h);
        moles.filter((m) => m.hole === i).forEach((m) => drawMole(g, m));
        holeFront(g, h);
        moles.filter((m) => m.hole === i && m.kind === 'bomb' && m.phase === 'hit').forEach((m) => boom(g, h.x, h.y - 30, m.hitT));
      });

      if (state === 'ready') drawRules(g);
      if (state === 'over') {
        g.fillStyle = 'rgba(12, 14, 15, 0.45)';
        g.fillRect(0, 0, W, H);
        const top = H / 2 - 100;
        panel(g, 50, top, 260, 212, C.paper, { r: 16, shadow: 6 });
        inkText(g, 'TIME’S UP!', W / 2, top, { size: 40, fill: C.pink, rot: -0.04 });
        label(g, 'SCORE', W / 2, top + 48, { size: 13 });
        inkText(g, String(score), W / 2, top + 88, { size: 54, drop: false });
        label(g, `BEST ${best}`, W / 2, top + 136, { size: 15 });
        if (isNewBest) {
          pill(g, 'NEW BEST!', W / 2 + 84, top + 48, { size: 12, fill: C.pink, color: C.ink, rot: 0.18 });
          drawMascot(g, color, 'star-eyes', 292, top + 230, 70);
        }
        if (t - overAt > 0.7 && Math.floor(t * 2.2) % 2 === 0) label(g, 'TAP TO PLAY AGAIN', W / 2, top + 180, { size: 15, fill: C.red });
      }
    }

    reset();
    return { press, key, update, draw };
  }

  window.MakeatonArcade = { open };
})();
