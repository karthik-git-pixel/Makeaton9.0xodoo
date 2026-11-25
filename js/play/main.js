/**
 * Run-A-Ton · main.js
 * Boots the game: renderer, hall, mascot, track, input, and the loop.
 *
 * An endless run. The speed rises with the distance; every few hundred
 * metres a new level raises the score multiplier and may bring in a new bug,
 * a chair trick or a Make-A-Ton board (see progress.js); themed events break
 * up the rhythm; the hall goes round the hackathon's day and night.
 *
 * Score: 1 point per metre, plus sparkles and bonuses, all times the
 * multiplier (the level, doubled while the pizza lasts).
 *
 * Leaderboard and sign-in (to come): when a run ends the game fires
 *   window.dispatchEvent(new CustomEvent('runaton:gameover', { detail }))
 * with detail = { score, distance, sparkles, level, squashed, nearMisses,
 * seconds, cause, best, newBest }. The game-over card has an empty
 * #overlaySlot for a leaderboard or a sign-in button.
 */
import * as THREE from 'three';
import { Mascot } from './mascot.js';
import { World, LANES } from './world.js';
import { Obstacles, FLY_Y, duckGeometry, rocketGeometry } from './obstacles.js';
import { UI, bindInput, formatScore, formatDistance } from './ui.js';
import { Quality } from './quality.js';
import {
  setResolution, shared, ComicPopups, shieldMaterial, Particles, tintToonMaterial, outlineMaterial, addOutline, keepNote,
} from './fx.js';
import { PostFX } from './post.js';
import { SPEED, speedAt, levelAt, multiplierFor, dayHourAt, phaseAt, CATALOG, EVENTS, DAY_HOURS } from './progress.js';
import { Menu } from './menu.js';
import { online } from './online.js';

/* ---------------------------------------------------------------------------
   Tuning (speeds, levels and the day are in progress.js)
   --------------------------------------------------------------------------- */
export const TUNING = {
  jumpHeight: 1.05,    // m (low bugs and the floor sign are lower; chairs are higher)
  airTime0: 0.62,      // s in the air at the start...
  airTime1: 0.5,       // ...and at SPEED.ref and above
  slideTime: 0.62,     // s
  laneRate: 20,        // how fast the star moves to a new lane (1/s)
  buffer: 0.12,        // s an input is remembered if it can't happen yet
  flipFrom: 0.55,      // jumps do a spin flip above this speed (0..1)
  mascotScale: 0.5,
  player: { w: 0.76, h: 1.05, hSlide: 0.48, d: 0.6 },
  power: { coffee: 3, magnet: 9, duck: 9, pizza: 10, rocket: 4.5 }, // seconds each lasts
  coffeeExtra: 0.45,   // +45% speed at the peak of the coffee rush
  shieldGrace: 0.6,    // s of safety after the firewall blocks a hit
  landGrace: 0.8,      // s of safety after the rocket drops you off
  slowTime: 0.38,      // s (real time) of slow motion on a near miss
  slowScale: 0.3,      // game speed during it
  nearGap: 2.5,        // s between two near-miss moments
  points: { sparkle: 10, near: 100, squash: 150, smash: 50, power: 50 }, // all times the multiplier
};

const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture'); // tests step the clock by hand
const DEBUG = params.has('debug');
const REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const CONFETTI = ['#FCC230', '#EF4225', '#4080FB', '#AD69FF', '#F57EB4', '#22AC5F', '#FFE23A', '#FFFFFF'];
const INTRO_TIME = REDUCED_MOTION ? 1.0 : 2.6; // opening camera move, seconds
const TITLE_HOUR = 22.7;  // the start screen is at demo time: spotlights, cheering, confetti
const DAY_BLEND = 1.6;    // s the hall takes to go from there into the run's morning
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const approach = (v, target, rate, dt) => v + (target - v) * (1 - Math.exp(-rate * dt));

/* What the game-over card says, by what ended the run */
const DEATH = {
  beetle: ['BUGGED OUT!', 'A Syntax Error got you.'],
  firefly: ['BUGGED OUT!', 'A Null Pointer got you.'],
  ant: ['BUGGED OUT!', 'You lost the Race Condition.'],
  roly: ['BUGGED OUT!', 'Caught in an Infinite Loop.'],
  hopper: ['BUGGED OUT!', 'Off by one lane!'],
  stack: ['BUGGED OUT!', 'Stack Overflow!'],
  chair: ['CRASH!', 'Ran into an office chair.'],
  board: ['BONK!', 'Bonked by a Make-A-Ton board.'],
  hurdle: ['OOPS!', 'Tripped on a Make-A-Ton sign.'],
  standee: ['BONK!', 'Ran into a Make-A-Ton standee.'],
};
const POWER_POPUP = { coffee: 'COFFEE RUSH!', shield: 'FIREWALL!', magnet: 'WI-FI MAGNET!', duck: 'DEBUG MODE!', pizza: 'DOUBLE POINTS!', rocket: 'SHIP IT!' };
const SMASH_WORDS = ['BONK!', 'POW!', 'WHAM!'];
const SQUASH_WORDS = ['SQUASHED!', 'FIXED!', 'PATCHED!'];
const TIMED = ['rocket', 'coffee', 'duck', 'magnet', 'pizza'];

/* ---------------------------------------------------------------------------
   Storage (best score, which tips have been shown); every access is wrapped
   --------------------------------------------------------------------------- */
const store = {
  get(key, fallback) {
    try { const v = window.localStorage.getItem('mat9-24h-' + key); return v === null ? fallback : v; } catch (e) { return fallback; }
  },
  set(key, value) {
    try { window.localStorage.setItem('mat9-24h-' + key, String(value)); } catch (e) { /* no storage: fine */ }
  },
};
const seen = (() => {
  try { return JSON.parse(store.get('seen', '{}')) || {}; } catch (e) { return {}; }
})();

/* ---------------------------------------------------------------------------
   Setup
   --------------------------------------------------------------------------- */
const app = document.getElementById('app');
const stageEl = document.getElementById('stage');
const canvas = document.getElementById('game');

function webgl2Available() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch (e) {
    return false;
  }
}

if (!webgl2Available()) {
  app.classList.add('no-webgl');
  document.getElementById('fallback').hidden = false;
} else {
  start();
}

function start() {
  const quality = new Quality('medium');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(quality.pixelRatio());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.info.autoReset = false; // count every pass of a frame (reset in render())

  const FOG = new THREE.Color('#E9D3AE');
  const scene = new THREE.Scene();
  scene.background = FOG;
  scene.fog = new THREE.Fog(FOG, 55, 240);

  const camera = new THREE.PerspectiveCamera(66, 9 / 16, 0.1, 220);

  const world = new World(scene, { quality: quality.level, anisotropy: Math.min(4, renderer.capabilities.getMaxAnisotropy()) });
  const obstacles = new Obstacles(scene);
  const mascot = new Mascot({ detail: 'medium' });
  mascot.root.scale.setScalar(TUNING.mascotScale);
  mascot.debrisParent = scene;
  scene.add(mascot.root);

  const ui = new UI(app);
  const popups = new ComicPopups(scene, { max: 6, reducedMotion: REDUCED_MOTION });
  const menu = new Menu({
    root: app,
    onPlay: () => { if (G.state === 'title' || G.state === 'dead') startRun(); },
    onMenu: () => toTitle(),
  });

  // Full-screen effects, and particles: dust/steam/confetti, and glowing sparkles/shards/flames
  const post = new PostFX(renderer, { samples: quality.level.samples });
  const puffs = new Particles(scene, { max: 280 });
  const glints = new Particles(scene, { max: 200, glow: true });
  const gl = renderer.getContext();
  const maxPoint = Math.min(256, gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] || 64);
  mascot.setOutlineScale(0.75);

  function applyQuality() {
    const L = quality.level;
    post.configure({ samples: L.samples, glow: L.glow, halftone: L.halftone });
    world.applyQuality(L);
    puffs.setBudget(L.particles);
    glints.setBudget(L.particles);
  }
  applyQuality();

  // A bubble around the star: yellow during the coffee rush, blue for the firewall
  const shield = new THREE.Mesh(new THREE.SphereGeometry(0.95, 24, 16), shieldMaterial('#FFE23A'));
  shield.visible = false;
  shield.renderOrder = 10;
  scene.add(shield);

  // Debug mode: a rubber duck rides on the star's head (facing you)
  const duckHat = new THREE.Mesh(duckGeometry(), tintToonMaterial({ tint: 'char' }));
  duckHat.position.set(0.04, 0.78, 0.02);
  duckHat.rotation.set(-0.1, Math.PI, 0.08);
  duckHat.scale.setScalar(0.95);
  duckHat.visible = false;
  addOutline(duckHat, outlineMaterial(0.02, 1.2));
  mascot.body.add(duckHat);

  // Ship it: a rocket strapped to the star's back (which is what the camera sees)
  const rocketRide = new THREE.Mesh(rocketGeometry(), tintToonMaterial({ tint: 'char' }));
  rocketRide.position.set(0, -0.62, -0.42);
  rocketRide.rotation.x = -0.22; // nozzle tucked back and down
  rocketRide.scale.setScalar(1.6);
  rocketRide.visible = false;
  addOutline(rocketRide, outlineMaterial(0.022, 1.3));
  mascot.body.add(rocketRide);

  // Wi-Fi magnet: rings on the floor, drawing in towards the star
  const magnetFx = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4).rotateX(-Math.PI / 2), keepNote(new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uColor: { value: new THREE.Color('#C493FF') }, uOn: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOn;
      varying vec2 vUv;
      void main() {
        float r = length(vUv);
        float w = fract(r * 2.4 + uTime * 1.7);
        float ring = smoothstep(0.0, 0.06, w) * (1.0 - smoothstep(0.1, 0.22, w));
        float a = ring * (1.0 - smoothstep(0.55, 1.0, r)) * smoothstep(0.12, 0.3, r) * uOn * 0.75;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
  }), true));
  magnetFx.visible = false;
  magnetFx.renderOrder = 3;
  scene.add(magnetFx);

  /* Game state ------------------------------------------------------------ */
  const freshPowers = () => ({ coffee: 0, magnet: 0, duck: 0, pizza: 0, rocket: 0 });
  const G = {
    state: 'title', // title | run | dead
    paused: false,
    distance: 0,
    speed: 0,
    score: 0,
    level: 1,
    day: 0,           // hour of the hall's day (0..25), from the distance
    phase: '',
    lane: 1,
    x: 0,
    vx: 0,
    y: 0,
    vy: 0,
    gravity: 0,
    airborne: false,
    slideLeft: 0,
    slideOnLand: false,
    pending: [],
    now: 0,           // seconds since load, real time
    stateTime: 0,     // seconds in the current state
    runTime: 0,
    best: parseInt(store.get('best-score', '0'), 10) || 0,
    newBest: false,
    shake: 0,
    sparkles: 0,
    squashed: 0,      // bugs fixed (squashed, smashed or blocked)
    nearMisses: 0,
    power: freshPowers(), // seconds left of each timed power-up
    shield: false,    // firewall up
    flying: false,    // riding the rocket
    flyAmt: 0,        // camera: 0 on the ground, 1 in the air
    grace: 0,         // s of safety (after the firewall, the rush or a landing)
    timeScale: 1,     // < 1 during a near-miss slow motion
    slowLeft: 0,
    nearCooldown: 0,
    introT: 0,        // opening camera move
    steamT: 0,
    cannonT: 0,
    flameT: 0,
    checkT: 0,
    scoreT: 0,
    wordN: 0,
    lastHit: null,
    cause: null,
    god: false,       // tests only: obstacles don't end the run
  };
  const introduced = new Set(); // what has had its tip this run

  const speed01 = () => clamp((G.speed - SPEED.v0) / (SPEED.ref - SPEED.v0), 0, 1);
  /* Coffee rush envelope: up fast, hold, ease off over the last half second */
  const boostEnv = () => {
    const left = G.power.coffee;
    return left <= 0 ? 0 : Math.min(1, (TUNING.power.coffee - left) / 0.15, left / 0.5);
  };
  const mult = () => multiplierFor(G.level) * (G.power.pizza > 0 ? 2 : 1);
  const popupAt = (dy = 1.7, dz = -0.6) => new THREE.Vector3(G.x, G.y + dy, dz);

  /** Adds points (times the multiplier); with a label, they float up by the score. */
  function award(points, label) {
    const p = Math.round(points * mult());
    G.score += p;
    if (label) {
      ui.gain(`+${formatScore(p)} ${label}`);
      G.scoreT = 0; // show a bonus straight away
    }
    return p;
  }

  /* The start screen: demo time in the hall, the star turning on the spot,
     and some of the cast hanging about behind it. */
  const parade = { items: [], hopT: 0 };
  function titleParade() {
    obstacles.auto = false;
    obstacles.reset(0, 99);
    const add = (type, x, at, opts = {}) => { const it = obstacles.add(type, 1, at, opts); it.x = x; it.roll = false; return it; };
    parade.items = [
      add('firefly', -1.45, 4.6),
      add('beetle', -2.3, 8.5),
      add('stack', 2.35, 10),
      add('roly', -0.9, 13),
      add('duck', 1.95, 5.2, { y: 1.0 }),
    ];
    parade.hopper = add('hopper', 1.7, 6.2, { hopTo: 0 });
    parade.hopper.lane = 2;
    parade.ant = add('ant', -3.6, 3.4);
    parade.ant.vx = 1.35;
    for (let i = 0; i < 5; i++) add('sparkle', -1.6 + i * 0.8, 11, { y: 2.3 + 0.5 * Math.sin((i / 4) * Math.PI) });
    parade.hopT = 1.5;
  }
  function tickParade(dt) {
    if (parade.ant && parade.ant.x > 3.6) parade.ant.x = -3.6;
    parade.hopT -= dt;
    const h = parade.hopper;
    if (h && parade.hopT <= 0) {
      // the Off-By-One hops from one side lane to the other every few seconds
      parade.hopT = 3.2;
      h.lane = h.hopT >= 0 ? h.hopTo : h.lane;
      h.hopTo = h.lane === 2 ? 0 : 2;
      h.hopT = 0;
      h.look = 0.01;
    }
  }

  function toTitle() {
    G.state = 'title';
    G.stateTime = 0;
    G.paused = false;
    Object.assign(G, { lane: 1, x: 0, vx: 0, y: 0, vy: 0, airborne: false, flying: false, slideLeft: 0, speed: 0, power: freshPowers(), shield: false });
    mascot.reset();
    mascot.setMode('title');
    mascot.root.rotation.y = 0;
    duckHat.visible = false;
    rocketRide.visible = false;
    titleParade();
    popups.clear();
    G.day = TITLE_HOUR;
    world.setTime(G.day);
    ui.hide();
    ui.clearMessages();
    ui.setHudVisible(false);
    menu.showTitle(G.best);
  }

  /** A new run. opts.distance starts it further along (tests and captures). */
  function startRun(seed, opts = {}) {
    const d0 = opts.distance || 0;
    // from the start screen (or a retry) the hall winds on into the run's morning
    const dayFrom = G.day;
    const blend = (G.state === 'title' || G.state === 'dead') && opts.distance === undefined;
    menu.hideTitle();
    Object.assign(G, {
      state: 'run', stateTime: 0, runTime: 0, distance: d0, speed: speedAt(d0), score: 0,
      level: levelAt(d0), day: dayHourAt(d0), phase: phaseAt(dayHourAt(d0)).name,
      lane: 1, x: 0, vx: 0, y: 0, vy: 0, airborne: false, slideLeft: 0, slideOnLand: false, pending: [],
      sparkles: 0, squashed: 0, nearMisses: 0, newBest: false, power: freshPowers(), shield: false, flying: false, grace: 0,
      timeScale: 1, slowLeft: 0, nearCooldown: 0, lastHit: null, cause: null, god: false,
      dayFrom, dayBlend: blend ? 0 : 1,
    });
    if (blend) G.day = dayFrom;
    obstacles.auto = true;
    obstacles.reset(d0, seed ?? (CAPTURE ? 7 : undefined));
    introduced.clear();
    announcements.length = 0;
    announceGap = 0;
    popups.clear();
    puffs.clear();
    glints.clear();
    ui.clearMessages();
    ui.setSparkles(0);
    ui.setScore(0);
    ui.setMultiplier(mult());
    mascot.reset();
    mascot.setMode('run');
    duckHat.visible = false;
    rocketRide.visible = false;
    ui.hide();
    ui.setHudVisible(true);
    quality.resetProbe();
  }

  function die(item) {
    G.state = 'dead';
    G.stateTime = 0;
    G.slideLeft = 0;
    G.speed = -4;   // bounce back off what was hit, then stop
    G.power = freshPowers();
    G.flying = false;
    G.slowLeft = 0;
    G.timeScale = 1;
    mascot.slide(false);
    mascot.hit();
    duckHat.visible = false;
    rocketRide.visible = false;
    G.shake = REDUCED_MOTION ? 0.12 : 0.35;
    G.cause = item ? item.type : null;
    ui.setPowers([]);
    const score = Math.floor(G.score);
    const newBest = score > G.best;
    if (newBest) {
      G.best = score;
      store.set('best-score', String(score));
    }
    // For the leaderboard and sign-in to hook into later
    const detail = {
      score, distance: Math.floor(G.distance), sparkles: G.sparkles, level: G.level, squashed: G.squashed,
      nearMisses: G.nearMisses, seconds: +G.runTime.toFixed(1), cause: G.cause, best: G.best, newBest,
    };
    G.lastRun = detail;
    try { window.dispatchEvent(new CustomEvent('runaton:gameover', { detail })); } catch (e) { /* old browser: fine */ }
  }

  function showGameOver() {
    const r = G.lastRun;
    const [title, line] = DEATH[r.cause] || ['GAME OVER', ''];
    ui.setHudVisible(false);
    ui.show({
      title,
      badge: r.newBest && r.score > 0 ? 'NEW BEST!' : '',
      score: r.score,
      text: r.newBest ? line : `${line} Best: ${formatScore(r.best)}`,
      stats: [[formatDistance(r.distance), 'Distance'], [String(r.sparkles), 'Sparkles'], [String(r.squashed), 'Bugs fixed']],
      button: 'Run again',
      place: 'top',
    });
    // your place on the leaderboard (signed in), or a nudge to sign up
    menu.gameOver({ score: r.score, distance: r.distance, sparkles: r.sparkles, level: r.level, seconds: r.seconds }, ui.overlaySlot);
  }

  /* Input ------------------------------------------------------------------ */
  function onAction(name) {
    if (G.paused || menu.blocking) return;
    if (G.state === 'title') {
      if (name === 'tap' || name === 'jump') startRun();
      return;
    }
    if (G.state === 'dead') {
      if (G.stateTime > 0.45 && (name === 'tap' || name === 'jump')) startRun();
      return;
    }
    if (G.state !== 'run') return;
    G.pending.push({ name: name === 'tap' ? 'jump' : name, t: G.now });
  }
  bindInput(stageEl, { action: onAction });

  function setPaused(on) {
    if (on === G.paused) return;
    if (on && G.state !== 'run') return;
    G.paused = on;
    ui.pauseBtn.setAttribute('aria-pressed', String(on));
    ui.pauseBtn.setAttribute('aria-label', on ? 'Resume' : 'Pause');
    if (on) ui.show({ title: 'Paused', text: `Score ${formatScore(G.score)} · ${formatDistance(G.distance)}`, button: 'Resume' });
    else { ui.hide(); last = performance.now(); }
  }

  // Buttons handle their own clicks; they must not also count as a tap on the game
  for (const b of [ui.overlayBtn, ui.pauseBtn]) b.addEventListener('pointerdown', (e) => e.stopPropagation());
  ui.overlayBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (G.paused) setPaused(false);
    else onAction('tap');
  });
  ui.pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); setPaused(!G.paused); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
  window.addEventListener('pagehide', () => setPaused(true));

  /* Moves ------------------------------------------------------------------- */
  function tryAction(a) {
    switch (a.name) {
      case 'left':
      case 'right': {
        G.lane = clamp(G.lane + (a.name === 'left' ? -1 : 1), 0, 2);
        return true;
      }
      case 'jump': {
        if (G.flying) return true; // nothing to jump up there
        if (G.airborne) return false;
        const T = TUNING.airTime0 + (TUNING.airTime1 - TUNING.airTime0) * speed01();
        G.gravity = (8 * TUNING.jumpHeight) / (T * T);
        G.vy = (4 * TUNING.jumpHeight) / T;
        G.airborne = true;
        if (G.slideLeft > 0) { G.slideLeft = 0; mascot.slide(false); }
        mascot.jump({ airTime: T, flip: speed01() > TUNING.flipFrom });
        return true;
      }
      case 'slide': {
        if (G.flying) return true;
        if (G.airborne) {
          G.vy = Math.min(G.vy, -16); // dive down, then slide on landing
          G.slideOnLand = true;
          return true;
        }
        G.slideLeft = TUNING.slideTime;
        mascot.slide(true);
        return true;
      }
      default:
        return true;
    }
  }

  function processInput() {
    const keep = [];
    for (const a of G.pending) {
      if (G.now - a.t > TUNING.buffer) continue; // too old: forget it
      if (!tryAction(a)) keep.push(a);
    }
    G.pending = keep;
  }

  /* Particles --------------------------------------------------------------- */
  function sparkleBurst(x, y, z, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(0, 0.4);
      const v = rand(1.6, 2.8);
      glints.spawn({ x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 0.8, vz: rand(-0.5, 0.5), color: i % 3 ? '#FADD02' : '#FFFFFF', size: rand(0.16, 0.26), life: rand(0.4, 0.6), shape: 1, drag: 3.5, spin: rand(-5, 5) });
    }
  }
  function glitchShards(x, y, z, n = 14) {
    const cols = ['#4FF7FF', '#FF4FE0', '#FFFFFF', '#22AC5F'];
    for (let i = 0; i < n; i++) {
      glints.spawn({ x, y, z, vx: rand(-3.5, 3.5), vy: rand(1.5, 5.5), vz: rand(-1, 3), color: cols[i % cols.length], size: rand(0.09, 0.16), life: rand(0.5, 0.8), shape: 2, gravity: 10, spin: rand(-14, 14) });
    }
  }
  function dust(x, z, n = 2, strength = 1) {
    for (let i = 0; i < n; i++) {
      // a small puff that's left behind and fades before it gets near the camera
      puffs.spawn({ x: x + rand(-0.1, 0.1), y: 0.06, z: z + rand(-0.05, 0.1), vx: rand(-0.6, 0.6) * strength, vy: rand(0.3, 0.7) * strength, vz: G.speed * 0.45, color: '#EFE6D6', size: rand(0.1, 0.15) * strength, life: rand(0.22, 0.32), grow: 1.3, drag: 3, fade: 0.7 });
    }
  }
  function confetti(n, at) {
    for (let i = 0; i < n; i++) {
      puffs.spawn({ x: at.x + rand(-2.5, 2.5), y: at.y + rand(-0.5, 1), z: at.z + rand(-2, 2), vx: rand(-2.5, 2.5), vy: rand(0, 3), vz: rand(-0.5, 0.5) + Math.max(0, G.speed) * 0.2, color: CONFETTI[i % CONFETTI.length], size: rand(0.1, 0.15), life: rand(1.8, 2.8), shape: 2, gravity: 4.5, drag: 1.2, spin: rand(-9, 9), fade: 0.25 });
    }
  }
  function cannons() {
    // Demo time: confetti cannons either side of the aisle, just ahead
    for (const s of [-1, 1]) {
      for (let i = 0; i < 22; i++) {
        puffs.spawn({ x: s * 2.7, y: 0.4, z: -9, vx: -s * rand(1.5, 4), vy: rand(6, 10), vz: G.speed * 0.35 + rand(-1, 1), color: CONFETTI[(i + (s > 0 ? 3 : 0)) % CONFETTI.length], size: rand(0.1, 0.15), life: rand(1.8, 2.6), shape: 2, gravity: 7, drag: 1.3, spin: rand(-10, 10), fade: 0.25 });
      }
    }
  }
  /** Something knocked flying: shards for a bug, a sparkle pop for anything else. */
  function impactFx(it) {
    if (it.T.bug) glitchShards(it.x, 0.4 + it.lift, 0);
    else sparkleBurst(it.x, 0.8, 0, 8);
  }
  /** A comic word where something was hit (BONK!, SQUASHED!...), beside the star on the side it went. */
  function word(list, side) {
    popups.show(list[G.wordN++ % list.length], { position: new THREE.Vector3(G.x + side * 1.0, 0.75 + G.y, 0.2), size: 0.5, life: 0.7, tilt: side > 0 ? 0.14 : -0.14, rise: 0.6 });
  }

  /* Power-ups ----------------------------------------------------------------- */
  function collectPower(kind, it) {
    award(TUNING.points.power);
    sparkleBurst(it.x, it.y + 0.4, 0, 12);
    popups.show(POWER_POPUP[kind], { position: popupAt(1.65), size: 0.72, life: 1.0 });
    switch (kind) {
      case 'coffee':
        if (!G.flying) G.power.coffee = TUNING.power.coffee;
        break;
      case 'shield':
        G.shield = true;
        break;
      case 'magnet':
        G.power.magnet = TUNING.power.magnet;
        break;
      case 'duck':
        G.power.duck = TUNING.power.duck;
        break;
      case 'pizza':
        G.power.pizza = TUNING.power.pizza;
        break;
      case 'rocket':
        startFlight();
        break;
      default:
        break;
    }
  }

  function startFlight() {
    G.power.rocket = TUNING.power.rocket;
    G.power.coffee = 0; // the rocket takes over from a rush
    G.flying = true;
    G.airborne = true;
    G.vy = 0;
    G.slideLeft = 0;
    G.slideOnLand = false;
    G.pending = [];
    mascot.slide(false);
    mascot.jump({ airTime: 0.9, flip: !REDUCED_MOTION });
    rocketRide.visible = true;
    const v = speedAt(G.distance);
    obstacles.startFlight(G.distance, G.distance + v * (TUNING.power.rocket + 0.6), G.lane, G.distance + v * 0.8);
  }

  /** The rocket's done: it zooms off, the star drops back to the floor. */
  function endFlight() {
    G.flying = false;
    rocketRide.visible = false;
    const T = TUNING.airTime0 + (TUNING.airTime1 - TUNING.airTime0) * speed01();
    G.gravity = (8 * TUNING.jumpHeight) / (T * T);
    G.vy = 1.5;
    G.airborne = true;
    G.grace = Math.max(G.grace, TUNING.landGrace);
    for (let i = 0; i < 14; i++) {
      puffs.spawn({ x: G.x + rand(-0.3, 0.3), y: G.y - 0.1, z: rand(-0.2, 0.6), vx: rand(-1.5, 1.5), vy: rand(-0.5, 1), vz: rand(0, 2), color: '#FFFFFF', size: rand(0.18, 0.28), life: rand(0.4, 0.7), grow: 1.5, drag: 2.5, fade: 0.6 });
    }
  }

  function tickPowers(dt) {
    const P = G.power;
    for (const k of TIMED) {
      if (P[k] <= 0) continue;
      P[k] = Math.max(0, P[k] - dt);
      if (P[k] > 0) continue;
      if (k === 'rocket') endFlight();
      if (k === 'coffee') G.grace = Math.max(G.grace, 0.5);
      if (k === 'duck') sparkleBurst(G.x, G.y + 1.3, 0, 8);
    }
  }

  /* Big announcements (a level-up, BUG SWARM!, DEMO TIME!...) take turns, so
     two never land on top of each other. Each waits for the one before. */
  const announcements = [];
  let announceGap = 0;
  function announce(a) {
    if (announcements.length < 4) announcements.push(a);
  }
  function burst(text, size = 1.5, conf = 0) {
    announce({ text, size, conf });
  }
  function tickAnnouncements(dt) {
    announceGap -= dt;
    if (announceGap > 0 || !announcements.length) return;
    const a = announcements.shift();
    if (a.level) {
      ui.levelUp(a.level, multiplierFor(a.level));
      confetti(30, { x: G.x * 0.5, y: 3.6, z: -4 });
      announceGap = 1.45;
    } else {
      popups.show(a.text, { position: new THREE.Vector3(G.x * 0.4, 3.3, -3.6), style: 'burst', size: a.size, life: 1.6, rise: 0.3, tilt: announceGap > -2 ? 0.07 : -0.06 });
      if (a.conf) confetti(a.conf, { x: G.x * 0.5, y: 3.9, z: -4 });
      announceGap = 1.25;
    }
  }

  /* Progress: levels, events, the day, a new best, tips ---------------------- */
  function checkProgress(dt) {
    const L = levelAt(G.distance);
    if (L > G.level) {
      G.level = L;
      announce({ level: L });
    }

    for (const ev of obstacles.events) {
      if (!ev.announced && G.distance >= ev.startAt - G.speed * 1.9) {
        ev.announced = true;
        burst(EVENTS[ev.type].text, 1.55);
      }
      if (ev.announced && !ev.done && G.distance >= ev.endAt + 4) {
        ev.done = true;
        const bonus = EVENTS[ev.type].bonus;
        if (bonus) {
          award(bonus, 'CLEARED');
          burst('CLEARED!', 1.2, 35);
        }
      }
    }
    obstacles.events = obstacles.events.filter((e) => !e.done);

    // the hall's hour: the run's own, after winding on from the start screen's (or the last run's)
    const runHour = dayHourAt(G.distance);
    if (G.dayBlend < 1) {
      G.dayBlend = Math.min(1, G.dayBlend + dt / DAY_BLEND);
      const k = G.dayBlend * G.dayBlend * (3 - 2 * G.dayBlend);
      const to = G.dayFrom > 12 ? DAY_HOURS + runHour : runHour; // late: on through the night to morning
      const h = G.dayFrom + (to - G.dayFrom) * k;
      G.day = h >= DAY_HOURS ? h - DAY_HOURS : h;
    } else {
      G.day = runHour;
    }
    const phase = phaseAt(runHour).name;
    if (phase !== G.phase) {
      if (phase === 'Dead of night') burst('BUG BASH!');
      else if (phase === 'Demo time') burst('DEMO TIME!', 1.5, 50);
      else if (phase === 'Afternoon' && G.phase === 'Demo time') burst('NEW DAY!');
      G.phase = phase;
    }

    if (!G.newBest && G.best > 0 && G.score > G.best) {
      G.newBest = true;
      burst('NEW BEST!', 1.3, 50);
    }
    tickAnnouncements(dt);

    // a tip the first couple of times each new thing comes down the aisle
    G.checkT -= dt;
    if (G.checkT <= 0) {
      G.checkT = 0.1;
      for (const it of obstacles.items) {
        if (it.gone >= 0 || introduced.has(it.type) || it.at - G.distance > 48 || !CATALOG[it.type]) continue;
        introduced.add(it.type);
        if ((seen[it.type] || 0) >= 2) continue;
        seen[it.type] = (seen[it.type] || 0) + 1;
        store.set('seen', JSON.stringify(seen));
        ui.toast(CATALOG[it.type]);
      }
    }
  }

  /* Update ------------------------------------------------------------------ */
  const camState = { x: 0, y: 2.2, z: 5.2, lx: 0, ly: 1.0, lz: 0, fov: 60 };

  function update(realDt) {
    // Near-miss slow motion: the game runs slower for a moment (input stays live)
    if (G.slowLeft > 0) {
      G.slowLeft -= realDt;
      G.timeScale = approach(G.timeScale, REDUCED_MOTION ? 0.75 : TUNING.slowScale, 30, realDt);
    } else {
      G.timeScale = approach(G.timeScale, 1, 7, realDt);
    }
    const dt = realDt * G.timeScale;
    G.now += realDt;
    G.stateTime += dt;
    shared.uTime.value += dt;
    const prevDistance = G.distance;

    if (G.state === 'run') {
      processInput();
      G.runTime += dt;
      tickPowers(dt);
      if (G.grace > 0) G.grace -= dt;
      if (G.nearCooldown > 0) G.nearCooldown -= dt;
      G.speed = speedAt(G.distance) * (1 + TUNING.coffeeExtra * boostEnv());
      const step = G.speed * dt;
      G.distance += step;
      G.score += step * mult();
      checkProgress(realDt);
    } else if (G.state === 'dead') {
      G.speed *= Math.exp(-9 * dt);
      G.distance += G.speed * dt;
      if (G.stateTime > 0.95 && ui.overlay.hidden) showGameOver();
    } else {
      G.speed = 0;
    }

    // Vertical: rocket flight, jump arc, dive, landing
    if (G.flying) {
      G.y = approach(G.y, FLY_Y + 0.12 * Math.sin(G.now * 2.6), 4.5, dt);
      G.vy = 0;
    } else if (G.airborne) {
      G.vy -= G.gravity * dt;
      G.y += G.vy * dt;
      if (G.y <= 0) {
        G.y = 0;
        G.airborne = false;
        const impact = Math.min(1.3, Math.abs(G.vy) / 7);
        G.vy = 0;
        mascot.land(impact);
        G.shake = Math.max(G.shake, (REDUCED_MOTION ? 0.03 : 0.08) * impact);
        if (G.state === 'run') dust(G.x, 0.05, 6, 1.2);
        if (G.slideOnLand && G.state === 'run') {
          G.slideOnLand = false;
          G.slideLeft = TUNING.slideTime;
          mascot.slide(true);
        }
      }
    }
    if (G.slideLeft > 0) {
      G.slideLeft -= dt;
      if (G.slideLeft <= 0) mascot.slide(false);
    }

    // Sideways: ease into the chosen lane
    const tx = LANES[G.lane];
    const nx = approach(G.x, tx, TUNING.laneRate, dt);
    G.vx = (nx - G.x) / Math.max(dt, 1e-4);
    G.x = nx;

    obstacles.magnet = G.state === 'run' && G.power.magnet > 0 ? { x: G.x, y: G.y + 0.45 } : null;
    if (G.state === 'run' || G.state === 'dead') obstacles.update(dt, G.distance, Math.max(Math.abs(G.speed), SPEED.v0));
    else if (G.state === 'title') { obstacles.update(dt, 0, 1); tickParade(dt); }
    if (G.state === 'run') {
      const P = TUNING.player;
      const box = { x: G.x, y: G.y, w: P.w, h: G.slideLeft > 0 ? P.hSlide : P.h, d: P.d };
      for (const e of obstacles.check(box, prevDistance, G.distance, G.speed)) {
        handleEvent(e);
        if (G.state !== 'run') break;
      }
    }
    world.update(G.distance);
    world.setTime(G.day);
    obstacles.tintFaces(shared.uCharTint.value);

    // Mascot
    mascot.root.position.set(G.x, 0, 0);
    if (G.state === 'run' || G.state === 'dead') mascot.root.rotation.y = approach(mascot.root.rotation.y, Math.PI, 10, dt);
    mascot.update(dt, {
      speed: speed01(),
      height: G.y / TUNING.mascotScale,
      lateral: G.vx / TUNING.mascotScale,
    });
    duckHat.visible = G.state === 'run' && G.power.duck > 0 && (G.power.duck > 1.5 || Math.floor(G.now * 8) % 2 === 0);

    // Particles: dust from the boots, steam from coffee, rocket flame, confetti cannons at demo time
    if (G.state === 'run') {
      if (mascot.footstep && G.y <= 0) dust(G.x + mascot.footstep * 0.12, 0.08, 2);
      G.steamT -= dt;
      if (G.steamT <= 0) {
        G.steamT = 0.09;
        for (const it of obstacles.items) {
          if (it.type !== 'coffee' || it.gone >= 0) continue;
          const z = -(it.at - G.distance);
          if (z < -45) continue;
          puffs.spawn({ x: it.x + rand(-0.08, 0.08), y: it.y + 0.72, z, vx: rand(-0.1, 0.1), vy: rand(0.4, 0.7), vz: G.speed, color: '#FFFFFF', size: rand(0.12, 0.18), life: rand(0.7, 1.0), grow: 1.6, drag: 0.6, fade: 0.6 });
        }
      }
      if (G.flying) {
        // flame from the rocket's nozzle, down and back
        G.flameT -= dt;
        while (G.flameT <= 0) {
          G.flameT += 0.02;
          glints.spawn({ x: G.x + rand(-0.05, 0.05), y: G.y + 0.36 + rand(-0.04, 0.04), z: 0.3, vx: rand(-0.4, 0.4), vy: rand(-5, -3), vz: rand(2.5, 4.5), color: Math.random() < 0.5 ? '#FFE23A' : '#FF8A3D', size: rand(0.15, 0.26), life: rand(0.16, 0.26), shape: 0, drag: 2.5 });
        }
      }
      if (world.lights.cheer > 0.5) {
        G.cannonT -= dt;
        if (G.cannonT <= 0) { G.cannonT = 2.2; cannons(); }
      }
    } else if (G.state === 'title' && G.introT >= INTRO_TIME * 0.7) {
      // the start screen: a burst of confetti as the logo lands, then the cannons now and then
      if (!G.titleConfetti) { G.titleConfetti = true; confetti(80, { x: 0, y: 3.4, z: -1.5 }); G.cannonT = 1.2; }
      G.cannonT -= dt;
      if (G.cannonT <= 0) { G.cannonT = 3.4; cannons(); }
    }
    puffs.update(dt);
    glints.update(dt);
    world.animate(G.now);
    obstacles.glow.value = 0.3 + 0.45 * world.glow.bulbs.value;
    obstacles.lamp.value = 0.4 + 0.55 * Math.max(world.glow.bulbs.value, world.glow.screens.value / 0.9);

    // The bubble: coffee rush (yellow) or firewall (blue)
    const rush = G.power.coffee > 0;
    shield.visible = G.state === 'run' && (rush || G.shield);
    if (shield.visible) {
      const pulse = 1 + 0.04 * Math.sin(G.now * 7);
      shield.position.set(G.x, G.y + 0.62, 0);
      shield.scale.set(0.72 * pulse, (G.slideLeft > 0 ? 0.5 : 0.78) * pulse, 0.72 * pulse);
      shield.material.uniforms.uColor.value.set(rush ? '#FFE23A' : '#6FB0FF');
    }
    magnetFx.visible = G.state === 'run' && G.power.magnet > 0;
    if (magnetFx.visible) {
      magnetFx.position.set(G.x, 0.02, 0);
      magnetFx.material.uniforms.uOn.value = Math.min(1, G.power.magnet / 0.4);
    }
    popups.update(realDt);

    updateCamera(realDt);

    if (G.state === 'run') {
      // the score's text is redrawn about 12 times a second (every frame cost a lot on slow phones)
      G.scoreT -= realDt;
      if (G.scoreT <= 0) { G.scoreT = 0.08; ui.setScore(G.score); }
      ui.setMultiplier(mult(), G.power.pizza > 0);
      const list = [];
      for (const k of TIMED) if (G.power[k] > 0) list.push({ kind: k, left: G.power[k] / TUNING.power[k], ending: G.power[k] < 1.5 });
      if (G.shield) list.push({ kind: 'shield', left: 1, ending: false });
      ui.setPowers(list);
    }
    ui.update(realDt);
  }

  /** What happens when the star meets something on the track. */
  function handleEvent(e) {
    const it = e.item;
    switch (e.kind) {
      case 'sparkle':
        G.sparkles++;
        ui.setSparkles(G.sparkles);
        award(TUNING.points.sparkle);
        sparkleBurst(it.x, it.y + 0.3, 0, it.mag ? 5 : 10);
        break;
      case 'coffee':
      case 'shield':
      case 'magnet':
      case 'duck':
      case 'pizza':
      case 'rocket':
        collectPower(e.kind, it);
        break;
      case 'hit':
        hit(it);
        break;
      case 'near':
        if (G.flying || G.nearCooldown > 0) break;
        G.nearCooldown = TUNING.nearGap;
        G.slowLeft = REDUCED_MOTION ? 0.18 : TUNING.slowTime;
        G.nearMisses++;
        award(TUNING.points.near, 'CLOSE ONE');
        popups.show('CLOSE ONE!', { position: popupAt(1.75), size: 0.8, life: 1.0 });
        break;
      default:
        break;
    }
  }

  function hit(it) {
    G.lastHit = it.type;
    const side = it.x > G.x + 0.1 ? 1 : it.x < G.x - 0.1 ? -1 : (G.wordN % 2 ? 1 : -1);
    if (G.flying) return; // up on the rocket: nothing touches you
    if (G.power.coffee > 0) {
      // coffee rush: smash straight through
      obstacles.knockAway(it, side);
      impactFx(it);
      if (it.T.bug) G.squashed++;
      award(TUNING.points.smash, 'SMASH');
      word(SMASH_WORDS, side);
      G.shake = Math.max(G.shake, REDUCED_MOTION ? 0.06 : 0.16);
      return;
    }
    if (G.power.duck > 0 && it.T.bug) {
      // debug mode: bugs get squashed
      obstacles.squash(it);
      glitchShards(it.x, 0.3 + it.lift, 0, 18);
      G.squashed++;
      award(TUNING.points.squash, 'BUG FIXED');
      word(SQUASH_WORDS, side);
      G.shake = Math.max(G.shake, REDUCED_MOTION ? 0.04 : 0.1);
      return;
    }
    if (G.grace > 0 || G.god) return;
    if (G.shield) {
      // the firewall takes the hit: the obstacle is knocked out of the way
      G.shield = false;
      G.grace = TUNING.shieldGrace;
      obstacles.knockAway(it, side);
      impactFx(it);
      if (it.T.bug) G.squashed++;
      G.shake = Math.max(G.shake, REDUCED_MOTION ? 0.08 : 0.22);
      popups.show('BLOCKED!', { position: popupAt(1.6), size: 0.75, life: 0.9 });
      return;
    }
    if (it.T.bug) glitchShards(it.x, 0.4 + it.lift, 0);
    die(it);
  }

  /* Opening move: starts on a wide shot of the stage from mid-hall, flies back
     high over the star, then comes down behind it (a curve, so it never passes
     through the star). Each key is [start, via, end] of a quadratic curve. */
  const INTRO_PATH = {
    x: [0, 0, 0], y: [9.5, 9.0, 1.4], z: [-42, 12, 4.2],
    lx: [0, 0, 0], ly: [6, 3, 0.95], lz: [-100, -45, 0], fov: [50, 58, 56],
  };
  const TITLE_VIEW = { x: 0, y: 1.4, z: 4.2, lx: 0, ly: 0.95, lz: 0, fov: 56 };

  function updateCamera(dt) {
    // Opening move: a wide shot of the stage, then pull back and down to the star
    if (G.state === 'title' && G.introT < INTRO_TIME) {
      G.introT += dt;
      const k = easeInOut(Math.min(1, G.introT / INTRO_TIME));
      for (const key in INTRO_PATH) {
        const [a, b, c] = INTRO_PATH[key];
        camState[key] = (1 - k) * (1 - k) * a + 2 * k * (1 - k) * b + k * k * c;
      }
      applyCamera(0);
      return;
    }
    const running = G.state === 'run' || G.state === 'dead';
    G.flyAmt = approach(G.flyAmt, G.flying ? 1 : 0, 2.6, dt);
    const f = G.flyAmt;
    const t = running
      ? { x: G.x * 0.5, y: 3.3 + G.y * (0.3 + 0.5 * f) + 0.4 * f, z: 6.2 + 0.8 * f, lx: G.x * 0.8, ly: 0.85 + G.y * 0.62 * f, lz: -10, fov: 66 + 10 * boostEnv() + 4 * f }
      : TITLE_VIEW;
    const rate = running && G.stateTime > 0.8 ? 7 : 3.2;
    for (const k in t) camState[k] = approach(camState[k], t[k], k === 'x' || k === 'lx' ? 6 : rate, dt);
    applyCamera(dt);
  }

  function applyCamera(dt) {
    G.shake = Math.max(0, G.shake - dt * 1.6);
    const s = G.shake * G.shake;
    camera.position.set(camState.x + (Math.random() - 0.5) * s, camState.y + (Math.random() - 0.5) * s, camState.z);
    camera.lookAt(camState.lx, camState.ly, camState.lz);
    if (Math.abs(camera.fov - camState.fov) > 0.01) {
      camera.fov = camState.fov;
      camera.updateProjectionMatrix();
      puffs.setView(renderer.domElement.height, camera.fov, maxPoint);
      glints.setView(renderer.domElement.height, camera.fov, maxPoint);
    }
  }

  /** Draws a frame: through the full-screen effects, or straight to the screen on low. */
  function render() {
    renderer.info.reset();
    if (quality.level.post) {
      post.setTime(G.day);
      post.render(scene, camera, { boost: boostEnv(), time: REDUCED_MOTION ? 0 : G.now });
    } else {
      renderer.render(scene, camera);
    }
  }

  /* Render loop -------------------------------------------------------------- */
  function resize() {
    const r = stageEl.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    renderer.setPixelRatio(quality.pixelRatio());
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    setResolution(renderer.domElement.height);
    post.setSize(renderer.domElement.width, renderer.domElement.height, renderer.getPixelRatio());
    puffs.setView(renderer.domElement.height, camera.fov, maxPoint);
    glints.setView(renderer.domElement.height, camera.fov, maxPoint);
  }
  new ResizeObserver(resize).observe(stageEl);
  quality.onChange(() => { applyQuality(); resize(); });

  let last = performance.now();
  let running = true;
  let fpsFrames = 0;
  let fpsTime = 0;
  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const real = Math.min((now - last) / 1000, 0.25);
    last = now;
    if (G.paused) return;
    const dt = Math.min(real, 1 / 20);
    update(dt);
    render();
    if (G.state === 'run') quality.sample(real);
    if (DEBUG) {
      fpsFrames++; fpsTime += real;
      if (fpsTime > 0.5) {
        const i = renderer.info.render;
        ui.setDebug(`${(fpsFrames / fpsTime).toFixed(0)} fps · ${i.calls} calls · ${(i.triangles / 1000).toFixed(0)}k tris · ${quality.name} · ${G.speed.toFixed(1)} m/s · L${G.level} · ${Math.floor(G.distance)} m`);
        fpsFrames = 0; fpsTime = 0;
      }
    }
  }

  /* Lost graphics context: stop, wait for it to come back, carry on */
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    running = false;
    if (G.state === 'run') { G.paused = true; ui.show({ title: 'Paused', text: 'Graphics are restarting…', button: 'Resume' }); }
  });
  canvas.addEventListener('webglcontextrestored', () => {
    running = true;
    last = performance.now();
    resize();
    if (!CAPTURE) requestAnimationFrame(frame);
  });

  resize();
  toTitle();
  updateCamera(0);
  if (!CAPTURE) requestAnimationFrame(frame);
  else render();

  /* Accounts and the leaderboard: picks up a saved sign-in, or the one from an
     email link (confirming a sign-up, or resetting a password). Never blocks play. */
  if (!params.has('offline')) {
    online.init().then((link) => {
      if (!link) return;
      if (link.error) menu.notice(link.error);
      else if (link.type === 'recovery') menu.open('profile', { mode: 'recovery' });
      else if (link.type === 'google' && online.signedIn && online.needsName) {
        // a new Google player: pick the name and mascot that go on the leaderboard
        menu.open('profile');
        menu.notice('Signed in with Google. Pick your name for the leaderboard.', 6000);
      } else if (online.signedIn) menu.notice(link.type === 'signup' ? "Email confirmed: you're on the leaderboard!" : link.type === 'google' ? 'Signed in with Google.' : 'Signed in.');
    }).catch(() => {});
  }

  /* Hooks for automated tests (screenshots, scripted runs) */
  window.__game = {
    G, TUNING, renderer, scene, camera, mascot, world, obstacles, quality, post, puffs, glints, ui, popups, menu, online,
    toTitle,
    setQuality(name) { quality.forced = true; quality.set(name); },
    render,
    start: startRun,
    input: onAction,
    /** Advances the game without drawing (for simulated test runs). */
    tick(dt) { update(dt); },
    step(seconds, fps = 60) {
      const n = Math.max(1, Math.round(seconds * fps));
      for (let i = 0; i < n; i++) update(1 / fps);
      render();
      return { state: G.state, distance: G.distance, score: G.score, level: G.level, speed: G.speed, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    },
    measure(ms = 3000) {
      return new Promise((res) => {
        let n = 0;
        const t0 = performance.now();
        const times = [];
        let prev = t0;
        (function tick(t) {
          n++; times.push(t - prev); prev = t;
          if (t - t0 < ms) requestAnimationFrame(tick);
          else {
            times.sort((a, b) => a - b);
            res({ fps: (n * 1000) / (t - t0), p95ms: times[Math.floor(times.length * 0.95)], calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, quality: quality.name, pixelRatio: renderer.getPixelRatio() });
          }
        })(t0);
      });
    },
  };
  document.documentElement.dataset.ready = '1';
}
