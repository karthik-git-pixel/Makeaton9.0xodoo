/**
 * Run-A-Ton · obstacles.js
 * Everything that comes down the aisle: bugs, chairs, Make-A-Ton boards,
 * sparkles and power-ups; the spawner that places them in fair patterns;
 * collisions and near misses.
 *
 * Bugs (original designs, cute rather than scary). Each one behaves
 * differently, and all of them have the glitchy pixel shimmer:
 *   beetle   Syntax Error    sits in a lane                              -> jump (or switch)
 *   firefly  Null Pointer    hovers at head height, lantern glowing      -> slide (or switch)
 *   ant      Race Condition  waits at the edge, then dashes across       -> jump, timed
 *   roly     Infinite Loop   curls into a ball and rolls straight at you -> jump (or switch)
 *   hopper   Off-By-One      looks at the next lane, then hops into it   -> read it
 *   stack    Stack Overflow  a wobbling tower of four bugs               -> switch lanes
 * Furniture and Make-A-Ton boards:
 *   chair    office chair; from level 4 some roll at you                 -> switch lanes
 *   board    hanging board with the logo                                 -> slide
 *   hurdle   low floor sign with the logo                                -> jump
 *   standee  big standee across two lanes                                -> switch lanes
 * Pickups: sparkles (points) and six power-ups:
 *   coffee (rush: sprint, smash through everything), shield (firewall: blocks
 *   one hit), magnet (Wi-Fi: pulls sparkles in), duck (debug mode: squash
 *   bugs), pizza (double points), rocket (ship it: fly over everything).
 *
 * Each kind is one InstancedMesh (one draw call, plus one for its ink line),
 * drawn only while one is on the track. Track space: an item sits at
 * distance `at` along the aisle; the player is always at z = 0, so its world
 * z is -(at - distance).
 */
import * as THREE from 'three';
import { LANES } from './world.js';
import {
  toonMaterial, tintToonMaterial, mergeColored, sparkleShape, weld, outlineMaterial, instancedOutline,
  uniform, keepNote, blobShadowTexture,
} from './fx.js';
import { levelAt, difficultyAt, lateAt, dayHourAt, phaseAt, UNLOCK, EVENTS, MAD, madAt, runSpeedAt } from './progress.js';

/** Hitboxes in metres (a little smaller than the drawings, to be fair). */
export const TYPES = {
  beetle: { span: 1, w: 0.82, h: 0.58, y0: 0, d: 0.76, avoid: 'jump', bug: true },
  firefly: { span: 1, w: 0.86, h: 0.58, y0: 0.66, d: 0.56, avoid: 'slide', bug: true },
  ant: { span: 1, w: 0.86, h: 0.45, y0: 0, d: 0.5, avoid: 'jump', bug: true },
  roly: { span: 1, w: 0.62, h: 0.56, y0: 0, d: 0.62, avoid: 'jump', bug: true },
  hopper: { span: 1, w: 0.78, h: 0.6, y0: 0, d: 0.72, avoid: 'jump', bug: true },
  stack: { span: 1, w: 0.86, h: 1.42, y0: 0, d: 0.74, avoid: 'lane', bug: true },
  chair: { span: 1, w: 0.95, h: 1.4, y0: 0, d: 0.85, avoid: 'lane' },
  board: { span: 1, w: 1.45, h: 2.4, y0: 0.72, d: 0.2, avoid: 'slide' },
  hurdle: { span: 1, w: 1.3, h: 0.52, y0: 0, d: 0.34, avoid: 'jump' },
  standee: { span: 2, w: 3.15, h: 1.85, y0: 0, d: 0.36, avoid: 'lane' },
};
export const POWERS = ['coffee', 'shield', 'magnet', 'duck', 'pizza', 'rocket'];

export const SPAWN_AHEAD = 82;  // metres ahead where things appear (the stage is at 100; MAD.ahead at mad speed)
const BEHIND = 8;               // metres behind the player where they are recycled
const APPEAR = 10;              // metres over which they pop up
const ROLL_FROM = 34;           // a chair starts rolling when this close...
const ROLL_SPEED = 3.6;         // ...at this many m/s on top of the run speed
const ROLY_FROM = 42;           // the Infinite Loop starts rolling when this close...
const ROLY_SPEED = 6.5;         // ...this fast
const ROLY_R = 0.33;            // its radius
const ANT_GO = 1.45;            // s before you arrive that a Race Condition sets off
const ANT_EDGE = 2.55;          // where it waits, just off the lanes
export const HOP = { look: 1.75, go: 1.02, time: 0.36, height: 0.85 }; // Off-By-One: s before contact; hop length; peak
const MAGNET_RANGE = 28;        // metres ahead the Wi-Fi magnet reaches
const MAGNET_FRONT = 0.8;       // the magnet pulls sparkles to this far in front of the star (never into it)
const POP_FRONT = 0.6;          // a collected pickup pops up at least this far in front of the star...
const POP_TIME = 0.3;           // ...over this many seconds, rising above its head
const TOUCH_GAP = 0.03;         // after a hit, the star and the obstacle are set this far apart (just touching)
// how close a pickup must come to be collected: half its width plus the star's (x), how far
// in front/behind (z), and how far its shape reaches below and above its position (y)
const PICK = { x: 0.65, z: 0.7, below: -0.38, above: 0.6 };
export const FLY_Y = 2.5;       // the rocket's cruising height (feet), m

const COL = {
  green: '#22AC5F', greenDark: '#147A43', navy: '#283046', ink: '#0C0E0F', white: '#FFFFFF',
  yellow: '#FCC230', tape: '#FFE23A', blue: '#4080FB', blueDark: '#2C5BC2', blueLight: '#A9C8FF',
  red: '#EF4225', pink: '#F57EB4', pinkDark: '#C7488A', blush: '#FF8FB8', grey: '#8A93A3', dark: '#2B303B',
  cream: '#FFF8EE', brown: '#4A2E22', sparkle: '#FADD02', orange: '#FF8A3D', orangeDark: '#C85A1A',
  purple: '#AD69FF', purpleDark: '#7B4FC2', lilac: '#D9B8FF', plum: '#5B3A8C', lamp: '#E9FF6B', wing: '#CDEBFF', wingBack: '#A9D6F5',
  duck: '#FFE23A', duckShade: '#F2C200', cheese: '#FFC23D', crust: '#D9893B', sky: '#8FD3FF',
};
const CHAIR_COLORS = ['#4080FB', '#EF4225', '#22AC5F', '#AD69FF', '#F57EB4'];
const TAU = Math.PI * 2;

/** Small seeded random number generator (mulberry32), so test runs repeat. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------------------------------------------------------------------
   Geometry helpers
   --------------------------------------------------------------------------- */
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

function ellipsoid(rx, ry, rz, x, y, z, flatY = -Infinity, ws = 16, hs = 10) {
  const g = new THREE.SphereGeometry(1, ws, hs).scale(rx, ry, rz).translate(x, y, z);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < flatY) p.setY(i, flatY);
  return weld(g, 1e-5);
}
const ball = (r, x, y, z, seg = 10) => weld(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 3)).translate(x, y, z), 1e-5);

/** A thin cylinder between two points. */
function rod(a, b, r, seg = 6) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const g = new THREE.CylinderGeometry(r, r, A.distanceTo(B), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
  const m = A.add(B).multiplyScalar(0.5);
  return g.translate(m.x, m.y, m.z);
}

function canvasTexture(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  return t;
}

/* The real Make-A-Ton 9.0 logo, loaded once; textures redraw when it arrives. */
const LOGO_SRC = 'assets/play/logo-640.webp';
let logoImage = null;
const logoWaiting = [];
function whenLogo(fn) {
  if (logoImage && logoImage.complete && logoImage.naturalWidth) { fn(logoImage); return; }
  logoWaiting.push(fn);
  if (logoImage) return;
  logoImage = new Image();
  logoImage.onload = () => { for (const f of logoWaiting.splice(0)) f(logoImage); };
  logoImage.src = LOGO_SRC;
}
/** A texture drawn now without the logo, and again with it once it has loaded. */
function logoTexture(w, h, draw) {
  const t = canvasTexture(w, h, (g) => draw(g, w, h, null));
  whenLogo((img) => {
    const g = t.image.getContext('2d');
    g.clearRect(0, 0, w, h);
    draw(g, w, h, img);
    t.needsUpdate = true;
  });
  return t;
}
function fitLogo(g, logo, x, y, w, h) {
  const k = Math.min(w / logo.width, h / logo.height);
  g.drawImage(logo, x + (w - logo.width * k) / 2, y + (h - logo.height * k) / 2, logo.width * k, logo.height * k);
}
function sparkleDecal(g, x, y, r, fill = '#FFFFFF') {
  const p = r * 0.16;
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x + p, y - p, x + r * 0.75, y);
  g.quadraticCurveTo(x + p, y + p, x, y + r);
  g.quadraticCurveTo(x - p, y + p, x - r * 0.75, y);
  g.quadraticCurveTo(x - p, y - p, x, y - r);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = Math.max(3, r * 0.12);
  g.strokeStyle = COL.ink;
  g.stroke();
}

/* ---------------------------------------------------------------------------
   The designs (local space: base on y = 0, facing +z, towards the camera)
   --------------------------------------------------------------------------- */

/** Syntax Error: a round, friendly beetle. Its shell carries the glitch shimmer. */
function beetleParts(shell = COL.green, dark = COL.greenDark, seg = 16) {
  const parts = [
    { geometry: ellipsoid(0.34, 0.27, 0.34, 0, 0.2, -0.03, 0.07, seg, Math.round(seg * 0.62)), color: shell, flag: 1 },
    { geometry: ellipsoid(0.03, 0.276, 0.345, 0, 0.2, -0.03, 0.07, 8, Math.round(seg * 0.62)), color: dark, flag: 1 },
    { geometry: ball(0.16, 0, 0.2, 0.3, 12), color: COL.navy },
    { geometry: ball(0.075, -0.075, 0.27, 0.42), color: COL.white },
    { geometry: ball(0.075, 0.075, 0.27, 0.42), color: COL.white },
    { geometry: ball(0.04, -0.075, 0.28, 0.485, 8), color: COL.ink },
    { geometry: ball(0.04, 0.075, 0.28, 0.485, 8), color: COL.ink },
    { geometry: ellipsoid(0.04, 0.025, 0.02, -0.125, 0.18, 0.43, -Infinity, 8, 6), color: COL.blush },
    { geometry: ellipsoid(0.04, 0.025, 0.02, 0.125, 0.18, 0.43, -Infinity, 8, 6), color: COL.blush },
    { geometry: rod([-0.05, 0.32, 0.36], [-0.15, 0.5, 0.46], 0.014, 5), color: COL.navy },
    { geometry: rod([0.05, 0.32, 0.36], [0.15, 0.5, 0.46], 0.014, 5), color: COL.navy },
    { geometry: ball(0.035, -0.15, 0.5, 0.46, 8), color: COL.yellow },
    { geometry: ball(0.035, 0.15, 0.5, 0.46, 8), color: COL.yellow },
  ];
  for (const s of [-1, 1]) {
    for (const z of [-0.18, 0.0, 0.18]) {
      parts.push({ geometry: rod([s * 0.22, 0.12, z], [s * 0.38, 0.0, z + 0.04], 0.026, 5), color: COL.navy });
    }
  }
  return parts;
}
const beetleGeometry = () => mergeColored(beetleParts()).scale(1.3, 1.3, 1.3);

/** Stack Overflow: four beetles piled up, each a different colour, each a bit smaller. */
function stackGeometry() {
  const layers = [
    { shell: COL.green, dark: COL.greenDark, s: 1.25, y: 0, ry: 0 },
    { shell: COL.orange, dark: COL.orangeDark, s: 1.1, y: 0.42, ry: 0.5 },
    { shell: COL.purple, dark: COL.purpleDark, s: 0.95, y: 0.8, ry: -0.45 },
    { shell: COL.pink, dark: COL.pinkDark, s: 0.8, y: 1.12, ry: 0.3 },
  ];
  const parts = [];
  for (const L of layers) {
    for (const p of beetleParts(L.shell, L.dark, 12)) {
      p.geometry.scale(L.s, L.s, L.s).rotateY(L.ry).translate(0, L.y, 0);
      parts.push(p);
    }
  }
  return mergeColored(parts);
}

/** Null Pointer: a firefly with a glowing lantern; its wings beat (and have no ink line). */
const FF_Y = 0.96;              // body centre height
const FF_WING_Y = FF_Y + 0.16;  // where the wings join
function fireflyParts(wings) {
  const Y = FF_Y;
  const parts = [
    { geometry: ellipsoid(0.2, 0.18, 0.22, 0, Y, 0.02), color: COL.plum, flag: 1 },
    { geometry: ellipsoid(0.19, 0.17, 0.21, 0, Y - 0.05, -0.28), color: COL.lamp, lamp: 1 },
    { geometry: ball(0.15, 0, Y + 0.03, 0.24, 12), color: COL.navy },
    { geometry: ball(0.068, -0.07, Y + 0.08, 0.35), color: COL.white },
    { geometry: ball(0.068, 0.07, Y + 0.08, 0.35), color: COL.white },
    { geometry: ball(0.036, -0.07, Y + 0.09, 0.41, 8), color: COL.ink },
    { geometry: ball(0.036, 0.07, Y + 0.09, 0.41, 8), color: COL.ink },
    { geometry: ellipsoid(0.034, 0.02, 0.016, -0.11, Y - 0.01, 0.36, -Infinity, 8, 6), color: COL.blush },
    { geometry: ellipsoid(0.034, 0.02, 0.016, 0.11, Y - 0.01, 0.36, -Infinity, 8, 6), color: COL.blush },
    { geometry: rod([-0.04, Y + 0.15, 0.3], [-0.13, Y + 0.34, 0.38], 0.012, 5), color: COL.navy },
    { geometry: rod([0.04, Y + 0.15, 0.3], [0.13, Y + 0.34, 0.38], 0.012, 5), color: COL.navy },
    { geometry: ball(0.032, -0.13, Y + 0.34, 0.38, 8), color: COL.lamp, lamp: 1 },
    { geometry: ball(0.032, 0.13, Y + 0.34, 0.38, 8), color: COL.lamp, lamp: 1 },
  ];
  for (const s of [-1, 1]) {
    for (const z of [-0.07, 0.06]) parts.push({ geometry: rod([s * 0.07, Y - 0.13, z], [s * 0.12, Y - 0.27, z + 0.05], 0.018, 5), color: COL.navy });
  }
  if (wings) {
    // two rounded wings each side (a big one and a small one behind it), pale blue
    for (const s of [-1, 1]) {
      const big = new THREE.SphereGeometry(1, 16, 8).scale(0.25, 0.02, 0.17).rotateY(s * 0.45).rotateZ(s * 0.12)
        .translate(s * 0.25, FF_WING_Y + 0.04, -0.04);
      const small = new THREE.SphereGeometry(1, 14, 8).scale(0.18, 0.02, 0.12).rotateY(s * 0.95).rotateZ(s * 0.08)
        .translate(s * 0.19, FF_WING_Y + 0.02, -0.2);
      parts.push({ geometry: big, color: COL.wing, wing: s }, { geometry: small, color: COL.wingBack, wing: s });
    }
  }
  return parts;
}

/** Race Condition: a racing ant (orange, with a stripe); its legs scurry. */
function antParts(legs) {
  const parts = [
    { geometry: ellipsoid(0.19, 0.16, 0.24, 0, 0.26, -0.28), color: COL.orange, flag: 1 },
    { geometry: ellipsoid(0.196, 0.166, 0.045, 0, 0.26, -0.2), color: COL.white },
    { geometry: ellipsoid(0.1, 0.09, 0.13, 0, 0.24, 0.0), color: COL.orangeDark },
    { geometry: ball(0.14, 0, 0.29, 0.21, 12), color: COL.orange },
    { geometry: ball(0.062, -0.065, 0.33, 0.31), color: COL.white },
    { geometry: ball(0.062, 0.065, 0.33, 0.31), color: COL.white },
    { geometry: ball(0.033, -0.065, 0.335, 0.365, 8), color: COL.ink },
    { geometry: ball(0.033, 0.065, 0.335, 0.365, 8), color: COL.ink },
    { geometry: rod([-0.05, 0.4, 0.26], [-0.16, 0.58, 0.36], 0.013, 5), color: COL.navy },
    { geometry: rod([0.05, 0.4, 0.26], [0.16, 0.58, 0.36], 0.013, 5), color: COL.navy },
    { geometry: ball(0.03, -0.16, 0.58, 0.36, 8), color: COL.orangeDark },
    { geometry: ball(0.03, 0.16, 0.58, 0.36, 8), color: COL.orangeDark },
  ];
  if (legs) {
    for (const s of [-1, 1]) {
      for (const z of [-0.1, 0.0, 0.1]) parts.push({ geometry: rod([s * 0.07, 0.22, z], [s * 0.3, 0.0, z * 2.2], 0.02, 5), color: COL.navy, wing: s });
    }
  }
  return parts;
}

/** Infinite Loop: a pill bug curled into a ball (centred on the origin: it rolls about its centre). */
function rolyGeometry() {
  const parts = [];
  const plates = 10;
  for (let i = 0; i < plates; i++) {
    // plates run from side to side over the top, so they turn as it rolls
    const g = new THREE.SphereGeometry(ROLY_R, 3, 14, (i / plates) * TAU, TAU / plates).rotateZ(-Math.PI / 2);
    parts.push({ geometry: g, color: i % 2 ? COL.purple : COL.lilac, flag: i % 2 });
  }
  for (const s of [-1, 1]) {
    parts.push({ geometry: ball(0.07, s * 0.085, 0.06, ROLY_R - 0.025), color: COL.white });
    parts.push({ geometry: ball(0.037, s * 0.085, 0.065, ROLY_R + 0.035, 8), color: COL.ink });
    parts.push({ geometry: rod([s * 0.05, 0.19, 0.25], [s * 0.13, 0.36, 0.31], 0.014, 5), color: COL.navy });
    parts.push({ geometry: ball(0.03, s * 0.13, 0.36, 0.31, 8), color: COL.yellow });
  }
  return mergeColored(parts);
}

/** Off-By-One: a blue grasshopper with big folded hind legs. */
function hopperGeometry() {
  const parts = [
    { geometry: ellipsoid(0.16, 0.15, 0.33, 0, 0.3, -0.05), color: COL.blue, flag: 1 },
    { geometry: ellipsoid(0.12, 0.06, 0.26, 0, 0.21, -0.03), color: COL.blueLight },
    { geometry: ball(0.16, 0, 0.37, 0.28, 12), color: COL.blue },
  ];
  for (const s of [-1, 1]) {
    parts.push(
      { geometry: ball(0.072, s * 0.08, 0.43, 0.39), color: COL.white },
      { geometry: ball(0.038, s * 0.08, 0.44, 0.455, 8), color: COL.ink },
      { geometry: ellipsoid(0.035, 0.022, 0.02, s * 0.12, 0.33, 0.4, -Infinity, 8, 6), color: COL.blush },
      { geometry: rod([s * 0.05, 0.5, 0.33], [s * 0.13, 0.8, 0.12], 0.012, 5), color: COL.navy },
      { geometry: ball(0.03, s * 0.13, 0.8, 0.12, 8), color: COL.yellow },
      // the big hind leg: thigh up to the knee, shin down to the floor
      { geometry: rod([s * 0.15, 0.32, -0.12], [s * 0.22, 0.62, -0.3], 0.04, 6), color: COL.blueDark },
      { geometry: ball(0.046, s * 0.22, 0.62, -0.3, 8), color: COL.blueDark },
      { geometry: rod([s * 0.22, 0.62, -0.3], [s * 0.24, 0.02, -0.45], 0.026, 5), color: COL.navy },
      { geometry: rod([s * 0.09, 0.22, 0.12], [s * 0.18, 0.0, 0.22], 0.02, 5), color: COL.navy },
      { geometry: rod([s * 0.1, 0.22, 0.0], [s * 0.2, 0.0, 0.02], 0.02, 5), color: COL.navy },
    );
  }
  return mergeColored(parts);
}

/** An office chair on casters. White parts take the chair's own colour (per instance). */
function chairGeometry() {
  const parts = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    const c = Math.cos(a), s = Math.sin(a);
    parts.push({ geometry: rod([0, 0.12, 0], [c * 0.34, 0.08, s * 0.34], 0.03, 5), color: COL.dark });
    parts.push({ geometry: ball(0.055, c * 0.34, 0.055, s * 0.34, 8), color: COL.ink });
  }
  parts.push({ geometry: new THREE.CylinderGeometry(0.035, 0.035, 0.42, 8).translate(0, 0.33, 0), color: COL.grey });
  parts.push({ geometry: box(0.62, 0.13, 0.58, 0, 0.56, -0.02), color: COL.white });
  parts.push({ geometry: box(0.07, 0.34, 0.05, 0, 0.72, 0.27), color: COL.dark });
  parts.push({ geometry: box(0.58, 0.58, 0.1, 0, 0.98, 0.29), color: COL.white });
  for (const s of [-1, 1]) {
    parts.push({ geometry: box(0.05, 0.2, 0.05, s * 0.33, 0.68, 0.0), color: COL.dark });
    parts.push({ geometry: box(0.09, 0.045, 0.32, s * 0.33, 0.79, -0.02), color: COL.dark });
  }
  return mergeColored(parts).scale(1.15, 1.15, 1.15);
}

/** Hanging board: rod, strings and weight (the cloth is a separate textured mesh).
    The strings go all the way up into the roof (the vault's crown is 19.4 m up). */
const BOARD_TOP = 2.16;
const BOARD_ANCHOR = 19.6;
function boardFrameGeometry() {
  return mergeColored([
    { geometry: rod([-0.8, BOARD_TOP, 0], [0.8, BOARD_TOP, 0], 0.035, 6), color: COL.brown },
    { geometry: rod([-0.72, BOARD_TOP, 0], [-0.3, BOARD_ANCHOR, 0], 0.012, 4), color: COL.dark },
    { geometry: rod([0.72, BOARD_TOP, 0], [0.3, BOARD_ANCHOR, 0], 0.012, 4), color: COL.dark },
    { geometry: rod([-0.76, 0.74, 0], [0.76, 0.74, 0], 0.025, 6), color: COL.brown },
  ]);
}
/** Navy cloth with the real Make-A-Ton 9.0 logo. */
function boardClothTexture() {
  return logoTexture(512, 480, (g, w, h, logo) => {
    g.fillStyle = COL.navy;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = COL.tape;
    g.lineWidth = 12;
    g.strokeRect(22, 22, w - 44, h - 44);
    if (logo) fitLogo(g, logo, w * 0.08, 0, w * 0.84, h);
  });
}

/** Standee: a big board on two posts, across two lanes. */
const STANDEE_Y = 1.12; // centre of the board
function standeeFrameGeometry() {
  return mergeColored([
    { geometry: box(0.18, 0.08, 0.72, -1.42, 0.04, 0), color: COL.dark },
    { geometry: box(0.18, 0.08, 0.72, 1.42, 0.04, 0), color: COL.dark },
    { geometry: box(0.08, 0.48, 0.08, -1.42, 0.3, 0), color: COL.grey },
    { geometry: box(0.08, 0.48, 0.08, 1.42, 0.3, 0), color: COL.grey },
    { geometry: box(3.34, 1.5, 0.1, 0, STANDEE_Y, 0), color: COL.ink },
  ]);
}
/** Brand yellow with halftone corners, the logo on a navy panel, and sparkles. */
function standeeFaceTexture() {
  return logoTexture(1024, 440, (g, w, h, logo) => {
    g.fillStyle = COL.yellow;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(200, 120, 10, 0.4)';
    for (let y = 12, row = 0; y < h; y += 22, row++) {
      for (let x = 12 + (row % 2) * 11; x < w; x += 22) {
        const k = Math.hypot((x - w / 2) / (w / 2), (y - h / 2) / (h / 2)) - 0.62;
        if (k > 0) { g.beginPath(); g.arc(x, y, Math.min(8, k * 22), 0, TAU); g.fill(); }
      }
    }
    g.fillStyle = COL.navy;
    g.strokeStyle = COL.ink;
    g.lineWidth = 10;
    g.beginPath();
    g.roundRect(w * 0.15, h * 0.12, w * 0.7, h * 0.6, 26);
    g.fill();
    g.stroke();
    if (logo) fitLogo(g, logo, w * 0.18, h * 0.15, w * 0.64, h * 0.54);
    g.fillStyle = COL.ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '62px Bangers, Impact, "Arial Black", sans-serif';
    g.fillText('24-HOUR HACKATHON', w / 2, h * 0.85);
    sparkleDecal(g, w * 0.075, h * 0.36, 44);
    sparkleDecal(g, w * 0.925, h * 0.36, 44);
    sparkleDecal(g, w * 0.1, h * 0.72, 24, COL.tape);
    sparkleDecal(g, w * 0.9, h * 0.72, 24, COL.tape);
    g.lineWidth = 16;
    g.strokeRect(8, 8, w - 16, h - 16);
  });
}

/** Floor sign: a low board on two little A-frames. */
const HURDLE_Y = 0.34; // centre of the board
function hurdleFrameGeometry() {
  const parts = [{ geometry: box(1.42, 0.38, 0.06, 0, HURDLE_Y, 0), color: COL.cream }];
  for (const s of [-1, 1]) {
    parts.push({ geometry: rod([s * 0.62, 0.0, 0.17], [s * 0.62, 0.52, 0.0], 0.025, 6), color: COL.dark });
    parts.push({ geometry: rod([s * 0.62, 0.0, -0.17], [s * 0.62, 0.52, 0.0], 0.025, 6), color: COL.dark });
  }
  return mergeColored(parts);
}
/** Red and white hazard stripes either side of a navy strip with the logo. */
function hurdleFaceTexture() {
  return logoTexture(1024, 256, (g, w, h, logo) => {
    g.fillStyle = COL.cream;
    g.fillRect(0, 0, w, h);
    g.save();
    g.beginPath();
    g.rect(0, 0, w * 0.2, h);
    g.rect(w * 0.8, 0, w * 0.2, h);
    g.clip();
    g.fillStyle = COL.red;
    for (let x = -h; x < w + h; x += 72) {
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x + 36, h);
      g.lineTo(x + 36 + h, 0);
      g.lineTo(x + h, 0);
      g.closePath();
      g.fill();
    }
    g.restore();
    g.fillStyle = COL.navy;
    g.fillRect(w * 0.2, 0, w * 0.6, h);
    if (logo) fitLogo(g, logo, w * 0.23, h * 0.08, w * 0.54, h * 0.84);
    g.strokeStyle = COL.ink;
    g.lineWidth = 14;
    g.strokeRect(7, 7, w - 14, h - 14);
  });
}

function sparkleGeometry() {
  const g = new THREE.ExtrudeGeometry(sparkleShape(0.42, 0.6, 0.05), {
    depth: 0.05, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.006, bevelSegments: 2, curveSegments: 8,
  }).translate(0, 0, -0.025);
  return mergeColored([{ geometry: weld(g, 1e-4), color: '#FFFFFF' }]).scale(1.25, 1.25, 1.25);
}

/** Coffee: a takeaway cup (cream cup, red sleeve, dark lid). */
function coffeeGeometry() {
  return mergeColored([
    { geometry: new THREE.CylinderGeometry(0.17, 0.13, 0.36, 16).translate(0, 0.18, 0), color: COL.cream },
    { geometry: new THREE.CylinderGeometry(0.172, 0.152, 0.14, 16).translate(0, 0.17, 0), color: COL.red },
    { geometry: new THREE.CylinderGeometry(0.188, 0.188, 0.045, 16).translate(0, 0.38, 0), color: COL.brown },
    { geometry: new THREE.CylinderGeometry(0.11, 0.16, 0.05, 16).translate(0, 0.425, 0), color: COL.brown },
  ]).scale(1.4, 1.4, 1.4);
}

/** Firewall: a blue shield with the brand's sparkle on both faces. */
function shieldGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.3);
  s.lineTo(0.2, 0.3);
  s.quadraticCurveTo(0.26, 0.3, 0.26, 0.24);
  s.lineTo(0.26, 0.04);
  s.quadraticCurveTo(0.24, -0.2, 0, -0.32);
  s.quadraticCurveTo(-0.24, -0.2, -0.26, 0.04);
  s.lineTo(-0.26, 0.24);
  s.quadraticCurveTo(-0.26, 0.3, -0.2, 0.3);
  s.closePath();
  const body = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 2, curveSegments: 10 }).translate(0, 0, -0.035);
  const mark = (z) => new THREE.ExtrudeGeometry(sparkleShape(0.26, 0.34, 0.035), { depth: 0.03, bevelEnabled: false, curveSegments: 8 }).translate(0, 0, z);
  return mergeColored([
    { geometry: body, color: COL.blue },
    { geometry: mark(0.064), color: COL.tape },
    { geometry: mark(-0.094), color: COL.tape },
  ]).scale(1.15, 1.15, 1.15).translate(0, 0.4, 0);
}

/** Wi-Fi magnet: three arcs and a dot. */
function wifiGeometry() {
  const parts = [];
  for (const r of [0.13, 0.25, 0.37]) {
    parts.push({ geometry: new THREE.TorusGeometry(r, 0.048, 8, 18, Math.PI / 2).rotateZ(Math.PI / 4), color: COL.purple });
    for (const a of [Math.PI / 4, (3 * Math.PI) / 4]) parts.push({ geometry: ball(0.048, Math.cos(a) * r, Math.sin(a) * r, 0, 8), color: COL.purple });
  }
  parts.push({ geometry: ball(0.075, 0, 0, 0, 12), color: COL.pink });
  return mergeColored(parts).scale(1.25, 1.25, 1.25).translate(0, 0.2, 0);
}

/** Rubber duck (rubber duck debugging). Also worn by the star in debug mode. */
function duckParts() {
  const parts = [
    { geometry: ellipsoid(0.26, 0.19, 0.3, 0, 0.19, -0.02, 0.02), color: COL.duck },
    { geometry: ellipsoid(0.1, 0.09, 0.12, 0, 0.3, -0.27), color: COL.duck },
    { geometry: ball(0.16, 0, 0.44, 0.12, 14), color: COL.duck },
    { geometry: ellipsoid(0.1, 0.035, 0.085, 0, 0.41, 0.27, -Infinity, 12, 6), color: COL.orange },
  ];
  for (const s of [-1, 1]) {
    parts.push(
      { geometry: ellipsoid(0.07, 0.11, 0.17, s * 0.24, 0.23, -0.04, -Infinity, 10, 8), color: COL.duckShade },
      { geometry: ball(0.03, s * 0.07, 0.49, 0.25, 8), color: COL.ink },
      { geometry: ellipsoid(0.035, 0.02, 0.015, s * 0.11, 0.42, 0.23, -Infinity, 8, 6), color: COL.blush },
    );
  }
  return parts;
}
export const duckGeometry = () => mergeColored(duckParts());

/** Pizza slice, tip down: cheese, crust, pepperoni on both faces. */
function pizzaGeometry() {
  const tri = new THREE.Shape();
  tri.moveTo(0, -0.3);
  tri.lineTo(0.25, 0.22);
  tri.lineTo(-0.25, 0.22);
  tri.closePath();
  const parts = [
    { geometry: new THREE.ExtrudeGeometry(tri, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1 }).translate(0, 0, -0.025), color: COL.cheese },
    { geometry: new THREE.CapsuleGeometry(0.055, 0.46, 4, 10).rotateZ(Math.PI / 2).translate(0, 0.25, 0), color: COL.crust },
  ];
  for (const [x, y] of [[0.07, 0.1], [-0.08, 0.07], [0, -0.08]]) {
    parts.push({ geometry: new THREE.CylinderGeometry(0.055, 0.055, 0.086, 14).rotateX(Math.PI / 2).translate(x, y, 0), color: COL.red });
  }
  return mergeColored(parts).scale(1.2, 1.2, 1.2).translate(0, 0.42, 0);
}

/** Ship it: a little rocket (also ridden by the star in flight). */
function rocketParts() {
  const parts = [
    { geometry: new THREE.CylinderGeometry(0.12, 0.13, 0.4, 16).translate(0, 0.32, 0), color: COL.white },
    { geometry: new THREE.ConeGeometry(0.12, 0.24, 16).translate(0, 0.64, 0), color: COL.red },
    { geometry: new THREE.CylinderGeometry(0.133, 0.133, 0.05, 16).translate(0, 0.18, 0), color: COL.red },
    { geometry: new THREE.CylinderGeometry(0.075, 0.095, 0.08, 12).translate(0, 0.08, 0), color: COL.dark },
    { geometry: ellipsoid(0.066, 0.066, 0.03, 0, 0.39, 0.112, -Infinity, 12, 8), color: COL.sky },
  ];
  for (let k = 0; k < 3; k++) parts.push({ geometry: box(0.03, 0.2, 0.15).translate(0, 0.17, 0.17).rotateY((k / 3) * TAU), color: COL.red });
  return parts;
}
export const rocketGeometry = () => mergeColored(rocketParts());

/* ---------------------------------------------------------------------------
   Patterns: each one places a "row" at distance `at` and always leaves a way
   through. `c.d` is the difficulty (0..1), `c.L` the level. Groups:
     jump  static and low (beetle, floor sign)       slide  high (board, firefly)
     block tall: switch lanes (chair, Stack Overflow)
   Never a lane change and a jump or slide due at the same spot.
   --------------------------------------------------------------------------- */
const GROUP = {
  jump: ['beetle', 'hurdle'],
  slide: ['board', 'firefly'],
  block: ['chair', 'stack'],
};
const shuffle = (list, r) => {
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
};
const ALL = ['jump', 'slide', 'block'];

export const PATTERNS = [
  {
    name: 'single', level: 1, weight: (d) => 1.3 - 0.95 * d,
    ok: (c) => c.any(ALL),
    make(c) {
      const type = c.pickAny(ALL);
      const lane = c.lane();
      if (type === 'chair' && c.has('rollingChair') && c.r() < 0.55) c.add('chair', lane, 0, { roll: true });
      else c.add(type, lane, 0);
      if (GROUP.jump.includes(type) && c.r() < 0.6) c.sparkleArc(lane);
      else c.sparkleLine((lane + 1 + Math.floor(c.r() * 2)) % 3);
      return 0;
    },
  },
  {
    name: 'pair', level: 1, from: 140, weight: (d) => 0.35 + 0.7 * d,
    ok: (c) => c.any(ALL),
    make(c) {
      const free = c.lane();
      for (let l = 0; l < 3; l++) if (l !== free) c.add(c.pickAny(ALL), l, 0);
      c.sparkleLine(free);
      return 0.05;
    },
  },
  {
    name: 'wall', level: 1, from: 280, weight: (d) => 0.15 + 0.3 * d,
    ok: (c) => c.any(['jump']) || c.any(['slide']),
    make(c) {
      // all three lanes need the same move: jump them, or slide under them
      const g = c.any(['jump']) && (!c.any(['slide']) || c.r() < 0.5) ? 'jump' : 'slide';
      for (let l = 0; l < 3; l++) c.add(c.pick(g), l, 0);
      if (g === 'jump') c.sparkleArc(c.lane());
      return 0.1;
    },
  },
  {
    name: 'mixed', level: 2, weight: (d) => 0.08 + 0.4 * d,
    ok: (c) => c.any(['jump']) && c.any(['slide']),
    make(c) {
      // read your lane: each lane needs one move, at least one jump and one slide
      const order = shuffle([c.pick('jump'), c.pick('slide'), c.r() < 0.5 ? c.pick('jump') : c.pick('slide')], c.r);
      order.forEach((type, l) => c.add(type, l, 0));
      return 0.15;
    },
  },
  {
    name: 'combo', level: 2, from: 420, weight: (d) => 0.06 + 0.4 * d,
    ok: (c) => c.any(['jump']) && c.any(['slide']),
    make(c) {
      // the same lane asks for two moves in a row, quicker later on
      const lane = c.lane();
      const seq = c.r() < 0.5 ? [c.pick('slide'), c.pick('jump')] : [c.pick('jump'), c.pick('slide')];
      c.add(seq[0], lane, 0);
      const gap = c.speed * (0.72 - 0.14 * c.d);
      c.add(seq[1], lane, gap);
      c.sparkleLine((lane + 1) % 3, gap / 2, 3);
      return gap / c.speed;
    },
  },
  {
    name: 'standee', level: 3, weight: (d) => 0.18 + 0.3 * d, boost: { meeting: 2.2 },
    ok: (c) => c.has('standee'),
    make(c) {
      const left = c.r() < 0.5 ? 0 : 1; // blocks lanes left and left + 1
      const free = left === 0 ? 2 : 0;
      // a quarter second more room before it: it's the one that may need two swipes
      const lead = c.speed * 0.25;
      c.add('standee', left, lead);
      // later on, the free lane sometimes has something to jump just after it
      if (c.d > 0.5 && c.r() < 0.45 && c.any(['jump'])) { c.add(c.pick('jump'), free, lead + c.speed * (0.6 - 0.1 * c.d)); return 0.75; }
      c.sparkleLine(free, lead);
      return 0.35;
    },
  },
  {
    name: 'crossing', level: 3, weight: () => 0.2, boost: { swarm: 2.2 },
    ok: (c) => c.has('ant'),
    make(c) {
      // one ant (later sometimes two, from opposite sides) races across the aisle,
      // timed to be in its target lane just as you get there: jump it, or be elsewhere
      const two = c.d > 0.45 && c.r() < 0.4;
      const side = c.r() < 0.5 ? -1 : 1;
      const target = (s) => (s < 0 ? (c.r() < 0.5 ? 1 : 2) : (c.r() < 0.5 ? 1 : 0));
      const t1 = target(side);
      c.add('ant', t1, 0, { dash: t1, side });
      if (two) {
        let t2 = target(-side);
        if (t2 === t1) t2 = -side > 0 ? 0 : 2; // both can't end up in the middle: the far lane instead
        c.add('ant', t2, c.speed * 0.12, { dash: t2, side: -side });
      }
      c.sparkleArc(t1);
      return 0.3;
    },
  },
  {
    name: 'roller', level: 4, weight: (d) => 0.18 + 0.2 * d, boost: { swarm: 1.6 },
    ok: (c) => c.has('roly'),
    make(c) {
      const lane = c.lane();
      c.add('roly', lane, 0);
      if (c.r() < 0.3 + 0.4 * c.d) {
        // a second one, in another lane, half a second later (less, later on)
        const l2 = (lane + 1 + Math.floor(c.r() * 2)) % 3;
        const gap = 0.55 - 0.1 * c.d;
        c.add('roly', l2, c.speed * gap);
        return gap;
      }
      c.sparkleArc(lane);
      return 0.1;
    },
  },
  {
    name: 'stampede', level: 4, weight: (d) => 0.1 + 0.2 * d, boost: { stampede: 3 },
    ok: (c) => c.has('rollingChair'),
    make(c) {
      // two chairs roll at you, the second three-quarters of a second after the
      // first (0.6 s later on): dodge into the lane the first one has just
      // left, or go round both early
      const free = c.lane();
      const lanes = shuffle([0, 1, 2].filter((l) => l !== free), c.r);
      const secs = 0.75 - 0.15 * c.d;
      c.add('chair', lanes[0], 0, { roll: true });
      c.add('chair', lanes[1], c.speed * secs, { roll: true });
      c.sparkleLine(free, 0, 5);
      return secs;
    },
  },
  {
    name: 'hopper', level: 5, weight: () => 0.24, boost: { swarm: 1.8 },
    ok: (c) => c.has('hopper'),
    make(c) {
      // it looks at the next lane, then hops into it; sparkles in the lane it leaves
      const lane = c.lane();
      const to = lane === 1 ? (c.r() < 0.5 ? 0 : 2) : 1;
      c.add('hopper', lane, 0, { hopTo: to });
      c.sparkleLine(lane, c.speed * 0.15, 4);
      return 0.2;
    },
  },
  {
    name: 'zigzag', level: 4, weight: (d) => 0.42 * d, boost: { stampede: 2 },
    ok: (c) => c.any(['block']),
    make(c) {
      // two rows of tall things: the gap swaps sides, so it's two quick swipes
      const first = c.r() < 0.5 ? 0 : 2;
      const second = 2 - first;
      for (let l = 0; l < 3; l++) if (l !== first) c.add(c.pick('block'), l, 0);
      const gap = c.speed * (0.7 - 0.14 * c.d);
      for (let l = 0; l < 3; l++) if (l !== second) c.add(c.pick('block'), l, gap);
      c.sparkleLine(first, 0, 3);
      return 0.25 + gap / c.speed;
    },
  },
  {
    name: 'breather', level: 1, from: 180, weight: (d) => 0.16 - 0.1 * d, boost: { rush: 50 },
    ok: () => true,
    make(c) {
      c.sparkleWave();
      return -0.2;
    },
  },
];

/* ---------------------------------------------------------------------------
   The track
   --------------------------------------------------------------------------- */
const CAPACITY = {
  beetle: 18, firefly: 12, ant: 8, roly: 8, hopper: 6, stack: 8, chair: 16, board: 12, hurdle: 12, standee: 6,
  sparkle: 120, coffee: 3, shield: 3, magnet: 3, duck: 3, pizza: 3, rocket: 3,
};
const SHADOWED = new Set(['firefly', ...POWERS]);

export class Obstacles {
  constructor(scene) {
    this.items = [];
    this.meshes = {};
    this.events = [];       // themed stretches laid out ahead (main.js announces them)
    // Sparkles and power-ups glow a little (more at night), and so do the fireflies' lanterns
    this.glow = uniform(0.35);
    this.lamp = uniform(0.55);
    const charMat = tintToonMaterial({ tint: 'char' });
    const bugMat = tintToonMaterial({ tint: 'char', glitch: true });
    const fireflyMat = tintToonMaterial({ tint: 'char', glitch: true, lamp: this.lamp, flap: { pivot: [0.07, FF_WING_Y], amp: 0.5, rate: 13, bias: 0.45 } });
    const antMat = tintToonMaterial({ tint: 'char', glitch: true, flap: { pivot: [0.07, 0.22], amp: 0.32, rate: 7.5, bias: 0 } });
    const sparkleMat = toonMaterial({ mid: COL.sparkle, shade: '#E5B400', lit: '#FFF07A', t1: 0.75, t2: -0.1, vertexColors: true, glow: this.glow });
    const powerMat = tintToonMaterial({ tint: 'char', glow: this.glow });
    const kinds = {
      beetle: [beetleGeometry(), bugMat],
      firefly: [mergeColored(fireflyParts(true)), fireflyMat, mergeColored(fireflyParts(false))],
      ant: [mergeColored(antParts(true)), antMat, mergeColored(antParts(false))],
      roly: [rolyGeometry(), bugMat],
      hopper: [hopperGeometry(), bugMat],
      stack: [stackGeometry(), bugMat],
      chair: [chairGeometry(), charMat],
      board: [boardFrameGeometry(), charMat],
      hurdle: [hurdleFrameGeometry(), charMat],
      standee: [standeeFrameGeometry(), charMat],
      sparkle: [sparkleGeometry(), sparkleMat],
      coffee: [coffeeGeometry(), powerMat],
      shield: [shieldGeometry(), powerMat],
      magnet: [wifiGeometry(), powerMat],
      duck: [duckGeometry(), powerMat],
      pizza: [pizzaGeometry(), powerMat],
      rocket: [rocketGeometry(), powerMat],
    };
    // Ink outlines: one more draw call per kind, sharing the instances
    const ink = outlineMaterial(0.035, 1.2);
    const inkSmall = outlineMaterial(0.025, 1.0);
    const thin = new Set(['board', 'hurdle', 'standee', 'ant']);
    for (const [kind, [geo, mat, hull]] of Object.entries(kinds)) {
      this.meshes[kind] = this.instanced(scene, kind, geo, mat, CAPACITY[kind]);
      scene.add(instancedOutline(this.meshes[kind], thin.has(kind) ? inkSmall : ink, hull || null));
    }
    // Each chair has its own colour (per instance, set every frame with its matrix)
    this.chairColor = new THREE.Color();
    for (let i = 0; i < CAPACITY.chair; i++) this.meshes.chair.setColorAt(i, this.chairColor.set(COL.white));

    // Textured faces: the boards' logos
    const face = (name, geo, texture, cap, double = false) => this.instanced(scene, name, geo,
      new THREE.MeshBasicMaterial({ map: texture, side: double ? THREE.DoubleSide : THREE.FrontSide }), cap);
    this.extra = {
      board: face('boardCloth', new THREE.PlaneGeometry(1.5, 1.42).translate(0, 0.74 + 0.71, 0.02), boardClothTexture(), CAPACITY.board, true),
      standee: face('standeeFace', new THREE.PlaneGeometry(3.22, 1.38).translate(0, STANDEE_Y, 0.056), standeeFaceTexture(), CAPACITY.standee),
      hurdle: face('hurdleFace', new THREE.PlaneGeometry(1.36, 0.34).translate(0, HURDLE_Y, 0.034), hurdleFaceTexture(), CAPACITY.hurdle),
    };

    // Soft shadows under things that float (fireflies, power-ups): one draw call
    this.shadows = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      keepNote(new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, opacity: 0.32, depthWrite: false })),
      32,
    );
    this.shadows.count = 0;
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = -1;
    this.shadows.name = 'track:shadows';
    scene.add(this.shadows);

    this.tmp = new THREE.Object3D();
    this.auto = true;      // tests turn the spawner off and place items by hand
    this.magnet = null;    // { x, y } while the Wi-Fi magnet is on (set by the game)
    this.frozen = false;   // after a crash nothing moves on its own (so nothing rolls or hops into the star)
    this.player = null;    // the star's box and the distance at the last check (to place knocked items)
    this.time = 0;
    this.reset(0);
  }

  instanced(scene, name, geo, mat, cap) {
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.name = 'track:' + name;
    scene.add(mesh);
    return mesh;
  }

  /** Clears the aisle. The first row comes after a short run-up. */
  reset(distance, seed = (Math.random() * 1e9) | 0) {
    this.items.length = 0;
    this.events.length = 0;
    this.random = rng(seed);
    this.nextAt = distance + 38;
    this.nextPowerAt = distance + 105;   // the first power-up comes early...
    this.firstPower = distance < 50;     // ...and on a fresh run it's a coffee
    this.lastPower = '';
    this.forcePower = '';
    this.nextEventAt = 0;                // set when level 3 is reached
    this.event = null;
    this.lastEventType = '';
    this.flight = null;
    this.skyLane = 1;
    this.lastPattern = '';
    this.madFrom = Infinity;             // where mad speed starts (main.js sets it with goMad)
    this.ahead = SPAWN_AHEAD;
    for (const k in this.meshes) { this.meshes[k].count = 0; this.meshes[k].userData.hull.count = 0; }
    for (const k in this.extra) this.extra[k].count = 0;
    this.shadows.count = 0;
  }

  /** Adds one item. lane: 0..2 (for the 2-lane standee, the left lane of the pair). */
  add(type, lane, at, opts = {}) {
    const T = TYPES[type];
    let x = T && T.span === 2 ? (LANES[lane] + LANES[lane + 1]) / 2 : LANES[lane];
    if (opts.side) x = opts.side * ANT_EDGE; // an ant waits at the edge of the aisle
    const it = {
      kind: T ? 'obstacle' : 'pickup', type, T, lane, at, atPrev: at, x, y: opts.y ?? 0,
      vx: opts.vx || 0, roll: !!opts.roll || type === 'roly', vz: 0, spin: 0, lift: 0,
      dash: opts.dash ?? -1, hopTo: opts.hopTo ?? -1, hopT: -1, look: 0,
      color: CHAIR_COLORS[Math.floor(this.random() * CHAIR_COLORS.length)],
      seed: this.random(), passed: false, threat: false, gone: -1, side: 0, squash: false, mag: false,
    };
    this.items.push(it);
    return it;
  }

  /** The themed stretch (if any) that the row at `at` belongs to; may start a new one. */
  eventAt(at, L, speed) {
    if (this.event && at >= this.event.endAt) this.event = null;
    if (L < 3) return null;
    if (!this.nextEventAt) this.nextEventAt = at + speed * 6;
    if (!this.event && at >= this.nextEventAt) {
      const r = this.random;
      const list = Object.entries(EVENTS).filter(([, e]) => L >= e.level);
      const weight = ([k, e]) => e.weight * (k === this.lastEventType ? 0.2 : 1);
      let roll = r() * list.reduce((s, e) => s + weight(e), 0);
      let type = list[0][0];
      for (const e of list) { roll -= weight(e); if (roll <= 0) { type = e[0]; break; } }
      const E = EVENTS[type];
      this.event = { type, startAt: at, endAt: at + speed * E.seconds, announced: false, done: false };
      this.events.push(this.event);
      this.lastEventType = type;
      this.nextEventAt = this.event.endAt + speed * (24 + r() * 14);
      // a bug swarm usually comes with a rubber duck just before it
      if (type === 'swarm' && L >= UNLOCK.duck && r() < 0.75) this.add('duck', Math.floor(r() * 3), at - speed * 0.55, { y: 0.5 });
    }
    return this.event;
  }

  /** Helpers the patterns place things with. */
  context(at, L, d, phase, ev, speed) {
    const r = this.random;
    const self = this;
    const allow = ev ? EVENTS[ev.type].allow : null;
    const allowed = (type) => (UNLOCK[type] ?? 1) <= L && (!allow || allow.includes(type === 'rollingChair' ? 'chair' : type));
    // more bugs in the dead of night, more fireflies at dusk
    const weightOf = (type) => (TYPES[type]?.bug && phase === 'Dead of night' ? 1.8 : 1) * (type === 'firefly' && phase === 'Dusk' ? 1.8 : 1);
    const pickFrom = (list) => {
      const ok = list.filter(allowed);
      if (!ok.length) return null;
      let roll = r() * ok.reduce((s, t) => s + weightOf(t), 0);
      for (const t of ok) { roll -= weightOf(t); if (roll <= 0) return t; }
      return ok[ok.length - 1];
    };
    const c = {
      r, d, L, speed, phase, ev, extent: 0,
      has: (type) => allowed(type),
      any: (groups) => groups.some((g) => GROUP[g].some(allowed)),
      pick: (group) => pickFrom(GROUP[group]),
      pickAny: (groups) => pickFrom(groups.flatMap((g) => GROUP[g])),
      lane: () => Math.floor(r() * 3),
      add(type, lane, dz = 0, opts = {}) {
        // things that roll at you close faster, so they start further out to arrive on time
        let extra = 0;
        if (type === 'roly') extra = ROLY_FROM * (ROLY_SPEED / (speed + ROLY_SPEED));
        else if (opts.roll) extra = ROLL_FROM * (ROLL_SPEED / (speed + ROLL_SPEED));
        c.extent = Math.max(c.extent, dz);
        return self.add(type, lane, at + dz + extra, opts);
      },
      sparkleLine(lane, dz = 0, n = 4 + Math.floor(r() * 3)) {
        if (r() < 0.25) return;
        const mid = at + dz - speed * 0.5;
        for (let i = 0; i < n; i++) self.add('sparkle', lane, mid + (i - (n - 1) / 2) * 1.7, { y: 0.55 });
      },
      sparkleArc(lane, dz = 0) {
        // follows the jump, so jumping the obstacle collects them
        for (let i = 0; i < 5; i++) {
          const u = (i - 2) / 2.5;
          self.add('sparkle', lane, at + dz + u * speed * 0.26, { y: 0.55 + 0.75 * (1 - u * u) });
        }
      },
      sparkleWave() {
        const phase0 = r() * TAU;
        for (let i = 0; i < 9; i++) self.add('sparkle', Math.round(1 + Math.sin(phase0 + i * 0.7)), at + i * 2, { y: 0.55 });
        c.extent = 16;
      },
    };
    return c;
  }

  /**
   * Mad speed: whatever is laid out already is passed at the old speed, then
   * a short clear run-up while the speed climbs. Returns where it starts.
   */
  goMad() {
    this.madFrom = this.nextAt;
    this.nextAt += MAD.breather;
    return this.madFrom;
  }

  /** Places the next row (and now and then a power-up) according to the patterns. */
  spawnNext(speed) {
    const r = this.random;
    const at = this.nextAt;
    // past the start of mad speed, space things for the speed the star will have there
    const mad = at > this.madFrom;
    if (mad) speed = Math.max(speed, runSpeedAt(at, this.madFrom));

    // Flying with the rocket: sparkles up in the air, then a clear landing strip
    if (this.flight && at < this.flight.clearTo) {
      if (at < this.flight.landAt - 8) this.skyRow(at);
      else this.nextAt = at + 6;
      return;
    }

    const L = levelAt(at);
    const d = difficultyAt(at);
    const phase = phaseAt(dayHourAt(at)).name;
    const ev = this.eventAt(at, L, speed);
    const c = this.context(at, L, d, phase, ev, speed);
    const weight = (p) => Math.max(0, p.weight(d)) * (ev && p.boost ? p.boost[ev.type] || 1 : 1) * (p.name === this.lastPattern && p.name !== 'single' ? 0.3 : 1);
    const options = PATTERNS.filter((p) => L >= p.level && at >= (p.from || 0) && p.ok(c));
    let total = 0;
    for (const p of options) total += weight(p);
    let roll = r() * total;
    let pattern = options[options.length - 1];
    for (const p of options) { roll -= weight(p); if (roll <= 0) { pattern = p; break; } }
    const extraGap = pattern.make(c) || 0;

    // Seconds to the next row: 1 s at the start, 0.56 s from 1 km (about 45 s
    // in), 0.46 s from 4 km. Every move still fits: a lane change takes under
    // 0.1 s, a jump 0.5 s (jump again the moment you land), and sliding in the
    // air dives you straight down.
    const base = (1.0 + (0.56 - 1.0) * d) * (1 - 0.18 * lateAt(at));
    let gapSeconds = Math.max(mad ? MAD.gapFloor : 0.42, base + r() * 0.22 * (1 - 0.6 * d) + extraGap);
    if (ev && ev.type === 'rush') gapSeconds = Math.max(0.5, gapSeconds * 0.55);
    const next = at + speed * gapSeconds;

    // A power-up now and then, in the clear stretch between this row and the next
    const end = at + c.extent;
    if (at >= this.nextPowerAt && next - end > speed * 0.45) {
      const type = this.pickPower(L, phase);
      if (type) {
        this.add(type, Math.floor(r() * 3), (end + next) / 2, { y: 0.5 });
        this.nextPowerAt = at + speed * (9 + r() * 6) * (phase === 'Dawn' ? 0.7 : 1);
      }
    }
    this.nextAt = next;
    this.lastPattern = pattern.name;
  }

  pickPower(L, phase) {
    if (this.firstPower) { this.firstPower = false; this.lastPower = 'coffee'; return 'coffee'; }
    const w = { coffee: 1, shield: 0.9, magnet: 1, duck: phase === 'Dead of night' ? 1.4 : 0.8, pizza: 0.8, rocket: 1.5 };
    const list = POWERS.filter((p) => UNLOCK[p] <= L && p !== this.lastPower);
    if (!list.length) return null;
    let roll = this.random() * list.reduce((s, p) => s + w[p], 0);
    let pick = list[list.length - 1];
    for (const p of list) { roll -= w[p]; if (roll <= 0) { pick = p; break; } }
    this.lastPower = pick;
    return pick;
  }

  /** A line of sparkles high up where the rocket flies, weaving between lanes. */
  skyRow(at, stay = false) {
    const r = this.random;
    if (!stay && r() < 0.6) this.skyLane = Math.min(2, Math.max(0, this.skyLane + (r() < 0.5 ? -1 : 1)));
    for (let i = 0; i < 5; i++) this.add('sparkle', this.skyLane, at + i * 2.4, { y: FLY_Y + 0.42 });
    this.nextAt = at + 5 * 2.4 + 2.5;
  }

  /**
   * The rocket takes off: whatever lies around the landing spot is cleared
   * away (it is far ahead, in the haze), and a trail of sparkles is laid out
   * in the air up to there, starting in the star's lane.
   */
  startFlight(distance, landAt, lane = 1, trailFrom = distance + 12) {
    const clearTo = landAt + 36;
    this.flight = { landAt, clearTo };
    this.items = this.items.filter((it) => it.kind !== 'obstacle' || it.at < landAt - 14 || it.at > clearTo);
    this.skyLane = lane;
    const resume = this.nextAt; // where the spawner had got to
    let at = trailFrom;
    let first = true;
    while (at < Math.min(resume, landAt - 8)) {
      this.skyRow(at, first);
      first = false;
      at = this.nextAt;
    }
    this.nextAt = Math.max(resume, at);
  }

  /**
   * Moves, spawns and recycles; updates the instances.
   * @param {number} dt game seconds
   * @param {number} distance metres run
   * @param {number} speed m/s
   */
  update(dt, distance, speed) {
    this.time += dt;
    // at mad speed things appear further ahead, so there's still time to read them
    this.ahead = SPAWN_AHEAD + (MAD.ahead - SPAWN_AHEAD) * madAt(distance, this.madFrom);
    while (this.auto && this.nextAt < distance + this.ahead) this.spawnNext(speed);
    if (this.flight && distance > this.flight.clearTo) this.flight = null;

    const keep = [];
    for (const it of this.items) {
      it.atPrev = it.at;
      if (it.at < distance - BEHIND) continue;
      if (it.gone >= 0) {
        it.gone += dt;
        if (it.gone > (it.kind === 'pickup' ? POP_TIME : 0.9)) continue;
        // knocked flying: it sails off ahead of the star, down the aisle;
        // squashed: it stays just in front of the star's boots while it splats;
        // collected: it keeps pace in front of the star while it pops (never through it)
        if (it.kind === 'obstacle') it.at += (it.squash ? speed : speed + 7) * dt;
        else it.at = distance - it.popZ;
      } else if (it.kind === 'obstacle') {
        if (!this.frozen) this.move(it, distance, speed, dt);
      } else if (it.mag && this.magnet) {
        // pulled in by the Wi-Fi magnet: flies to just in front of the star
        const k = 1 - Math.exp(-11 * dt);
        it.x += (this.magnet.x - it.x) * k;
        it.y += (this.magnet.y - it.y) * k;
        const front = distance + MAGNET_FRONT;
        if (it.at > front) it.at -= Math.min(it.at - front, 30 * dt);
      } else if (this.magnet && it.type === 'sparkle' && it.at - distance < MAGNET_RANGE && it.at - distance > -0.5) {
        it.mag = true;
      }
      keep.push(it);
    }
    this.items = keep;
    this.writeInstances(distance);
  }

  /** How each obstacle moves. */
  move(it, distance, speed, dt) {
    const dz = it.at - distance;
    const ttc = dz / Math.max(1, speed + it.vz); // seconds until it reaches the star
    // Race Condition: sets off so as to be in its target lane as you arrive
    if (it.dash >= 0 && !it.vx && ttc < ANT_GO) it.vx = (LANES[it.dash] - it.x) / Math.max(0.35, ttc);
    if (it.vx) it.x += it.vx * dt;
    // Rolling chairs and the Infinite Loop come at you
    if (it.roll) {
      const roly = it.type === 'roly';
      if (dz < (roly ? ROLY_FROM : ROLL_FROM)) {
        const v = roly ? ROLY_SPEED : ROLL_SPEED;
        it.vz = v;
        it.at -= v * dt;
        it.spin += dt * (roly ? v / ROLY_R : 2.6);
      }
    }
    // Off-By-One: looks at the next lane, then hops into it
    if (it.hopTo >= 0) {
      if (!it.look && ttc < HOP.look) it.look = 1e-4;
      if (it.look) it.look += dt;
      if (it.hopT < 0 && ttc < HOP.go) it.hopT = 0;
      if (it.hopT >= 0 && it.hopT < HOP.time) {
        it.hopT = Math.min(HOP.time, it.hopT + dt);
        const u = it.hopT / HOP.time;
        it.x = LANES[it.lane] + (LANES[it.hopTo] - LANES[it.lane]) * (u * u * (3 - 2 * u));
        it.lift = HOP.height * 4 * u * (1 - u);
      }
    }
  }

  writeInstances(distance) {
    const counts = {};
    for (const k in this.meshes) counts[k] = 0;
    const o = this.tmp;
    const t = this.time;
    let shadows = 0;
    for (const it of this.items) {
      const i = counts[it.type];
      if (i >= CAPACITY[it.type]) continue;
      counts[it.type]++;
      const dz = it.at - distance;
      const a = Math.min(1, Math.max(0, (this.ahead - dz) / APPEAR));
      const pop = a < 1 ? 1 + 2.4 * (a - 1) ** 3 + 1.4 * (a - 1) ** 2 : 1; // ease out, small overshoot
      o.position.set(it.x, it.y, -dz);
      o.rotation.set(0, 0, 0);
      let s = pop;
      let sy = 1;
      let sxz = 1;
      switch (it.type) {
        case 'beetle':
          o.rotation.y = 0.25 * Math.sin(t * 3 + it.seed * 9);
          o.position.y += Math.abs(Math.sin(t * 6 + it.seed * 5)) * 0.03;
          break;
        case 'firefly':
          o.position.y += 0.07 * Math.sin(t * 3.2 + it.seed * 7);
          o.rotation.y = 0.3 * Math.sin(t * 1.3 + it.seed * 5);
          o.rotation.z = 0.08 * Math.sin(t * 2.1 + it.seed * 3);
          break;
        case 'ant':
          if (it.vx) {
            o.rotation.y = Math.sign(it.vx) * Math.PI / 2;
            o.position.y += Math.abs(Math.sin(t * 22 + it.seed * 5)) * 0.03;
          } else {
            o.rotation.y = 0.35 * Math.sin(t * 4 + it.seed * 9) - Math.sign(it.x) * 0.5; // waiting, looking about
          }
          break;
        case 'roly':
          o.position.y += ROLY_R + (it.vz ? Math.abs(Math.sin(it.spin * 0.5)) * 0.06 : 0);
          o.rotation.x = it.spin;
          if (!it.vz) o.rotation.z = 0.1 * Math.sin(t * 2.5 + it.seed * 6); // rocking, about to go
          break;
        case 'hopper': {
          const turn = it.hopTo >= 0 ? Math.sign(LANES[it.hopTo] - LANES[it.lane]) : 0;
          if (it.hopT >= HOP.time) {
            o.rotation.y = turn * 0.7 * Math.max(0, 1 - (it.hopT - HOP.time) * 4); // landed: faces you again
          } else if (it.hopT >= 0) {
            const u = it.hopT / HOP.time;
            o.rotation.y = turn * 0.7;
            o.rotation.x = -0.35 * (1 - 2 * u); // nose up, then down
            o.position.y += it.lift;
          } else if (it.look) {
            o.rotation.y = turn * 0.7 * Math.min(1, it.look / 0.18);   // looks where it's going...
            const crouch = Math.min(1, it.look / 0.5);
            sy = 1 - 0.14 * crouch;                                     // ...and crouches
            sxz = 1 + 0.05 * crouch;
            o.position.x += turn * 0.03 * Math.sin(t * 40);             // twitching
          } else {
            o.rotation.y = 0.2 * Math.sin(t * 2 + it.seed * 6);
          }
          break;
        }
        case 'stack':
          o.rotation.z = 0.07 * Math.sin(t * 2.4 + it.seed * 6);
          o.rotation.x = 0.04 * Math.sin(t * 1.9 + it.seed * 4);
          break;
        case 'chair':
          o.rotation.y = it.spin;
          break;
        case 'board': {
          // hangs from its strings in the roof: drops in from above, sways a little about the anchor
          const sway = 0.008 * Math.sin(t * 1.1 + it.seed * 6);
          o.rotation.x = sway;
          o.position.y += (1 - Math.min(1, pop)) * 3 + BOARD_ANCHOR * (1 - Math.cos(sway));
          o.position.z -= BOARD_ANCHOR * Math.sin(sway);
          s = 1;
          break;
        }
        case 'standee':
        case 'hurdle':
          break;
        case 'sparkle':
          o.rotation.y = t * 3 + it.seed * 6;
          o.position.y += it.mag ? 0 : 0.08 * Math.sin(t * 3 + it.seed * 10);
          break;
        default: // power-ups: turn and bob
          o.rotation.y = t * 1.6 + it.seed * 6;
          o.rotation.z = 0.12 * Math.sin(t * 2.2 + it.seed * 3);
          o.position.y += 0.1 * Math.sin(t * 2.5 + it.seed * 5);
          break;
      }
      if (it.gone >= 0) {
        const g = it.gone;
        if (it.kind === 'pickup') {
          // collected: pops up out of the front of the star to above its head, turning
          // to face you, swells a little and shrinks away. It stays in front of the star.
          const u = Math.min(1, g / POP_TIME);
          const e = 1 - (1 - u) * (1 - u);
          o.position.set(it.x, it.popY + (it.popTop - it.popY) * e, it.popZ);
          if (it.type === 'sparkle') o.rotation.set(0, 0, u * 5);
          s *= u < 0.55 ? 1 + 0.3 * (u / 0.55) : 1.3 * Math.max(0, 1 - (u - 0.55) / 0.45);
        } else if (it.squash) {
          // squashed in debug mode: splats flat, then vanishes (before it reaches the camera)
          const k = Math.min(1, g / 0.06);
          sy *= 1 - 0.85 * k;
          sxz *= 1 + 0.45 * k;
          o.position.y = Math.min(o.position.y, 0.02);
          o.rotation.x = 0;
          s *= g > 0.14 ? Math.max(0, 1 - (g - 0.14) / 0.16) : 1;
        } else {
          // knocked flying (firewall, coffee rush): off to the side and up, tumbling
          o.position.x += it.side * 3.2 * g;
          o.position.y += 7 * g - 7.5 * g * g;
          o.rotation.x -= g * 9;
          o.rotation.z += it.side * g * 6;
          s *= g > 0.6 ? Math.max(0, 1 - (g - 0.6) / 0.3) : 1;
        }
      }
      o.scale.set(Math.max(0.001, s * sxz), Math.max(0.001, s * sy), Math.max(0.001, s * sxz));
      o.updateMatrix();
      this.meshes[it.type].setMatrixAt(i, o.matrix);
      if (this.extra[it.type]) this.extra[it.type].setMatrixAt(i, o.matrix);
      if (it.type === 'chair') this.meshes.chair.setColorAt(i, this.chairColor.set(it.color));

      // a soft shadow on the floor under things that float
      if (SHADOWED.has(it.type) && shadows < 32 && it.gone < 0) {
        const h = it.type === 'firefly' ? FF_Y + o.position.y : 0.3 + o.position.y;
        const k = (it.type === 'firefly' ? 1.1 : 0.85) * pop / (1 + h * 0.5);
        o.position.set(it.x, 0.012, -dz);
        o.rotation.set(0, 0, 0);
        o.scale.set(k, 1, k * 0.8);
        o.updateMatrix();
        this.shadows.setMatrixAt(shadows++, o.matrix);
      }
    }
    for (const k in this.meshes) {
      // kinds with nothing on the track are skipped entirely (no empty draw calls)
      const n = counts[k];
      const mesh = this.meshes[k];
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.userData.hull.count = n;
      mesh.userData.hull.visible = n > 0;
      if (n > 0) mesh.instanceMatrix.needsUpdate = true;
      if (this.extra[k]) {
        this.extra[k].count = n;
        this.extra[k].visible = n > 0;
        if (n > 0) this.extra[k].instanceMatrix.needsUpdate = true;
      }
    }
    if (counts.chair > 0) this.meshes.chair.instanceColor.needsUpdate = true;
    this.shadows.count = shadows;
    this.shadows.visible = shadows > 0;
    if (shadows > 0) this.shadows.instanceMatrix.needsUpdate = true;
  }

  /**
   * Collisions, pickups and near misses for the frame in which the aisle
   * moved from prevDistance to distance (a swept test, so fast runs at low
   * frame rates can't tunnel through thin boards).
   * @param {{x:number, y:number, w:number, h:number, d:number}} p player box:
   *        centre x, bottom y, full width, height, depth
   * @param {number} speed run speed, m/s
   * @returns {Array<{kind:string, item:object}>} events: hit, near, sparkle, or a power-up's name
   */
  check(p, prevDistance, distance, speed) {
    const events = [];
    this.player = { ...p, distance };
    for (const it of this.items) {
      if (it.gone >= 0) continue;
      const zNow = -(it.at - distance);
      if (it.kind === 'pickup') {
        // Anything that would touch the star is collected: the test is swept along the
        // aisle (a slow frame can't skip past it) and covers the pickup's whole height
        // (so a sparkle can't pass through the star's head).
        const zPrev = -(it.atPrev - prevDistance);
        const alongside = zPrev < PICK.z && zNow > -PICK.z;
        const touch = alongside && Math.abs(p.x - it.x) < PICK.x && it.y + PICK.below < p.y + p.h + 0.05 && it.y + PICK.above > p.y - 0.05;
        if (touch || (it.mag && zNow > -1.5)) {
          it.gone = 0;
          // where it pops from: in front of the star, rising to above its head (see writeInstances)
          it.popZ = Math.min(zNow, -POP_FRONT);
          it.popY = it.y;
          it.popTop = Math.max(it.y, p.y + p.h) + 0.45;
          events.push({ kind: it.type, item: it });
        }
        continue;
      }
      const T = it.T;
      const y0 = T.y0 + it.lift;
      const zPrev = -(it.atPrev - prevDistance);
      const overlapX = Math.abs(p.x - it.x) < (p.w + T.w) / 2;
      const overlapY = !(p.y > y0 + T.h || p.y + p.h < y0);
      const swept = !(zPrev - T.d / 2 > p.d / 2 || zNow + T.d / 2 < -p.d / 2);
      if (swept && overlapX && overlapY) {
        it.threat = false; // a hit is never a near miss
        it.passed = true;
        events.push({ kind: 'hit', item: it, ...this.overlap(it, p, zNow) });
        continue;
      }
      // Near miss: still on a collision course a moment before contact, yet got past
      const closing = speed + it.vz;
      const gap = -zNow - T.d / 2 - p.d / 2;
      if (gap > 0 && closing > 0 && gap / closing < 0.17 && overlapX && overlapY) it.threat = true;
      if (!it.passed && zNow - T.d / 2 > p.d / 2) {
        it.passed = true;
        if (it.threat) events.push({ kind: 'near', item: it });
      }
    }
    return events;
  }

  /** Time-of-day tint for the textured faces (the cartoon materials get it from a shared uniform). */
  tintFaces(color) {
    for (const k in this.extra) this.extra[k].material.color.copy(color);
  }

  /**
   * How far the star and an obstacle overlap: needZ is how far to back off down
   * the aisle (the obstacle then sits just in front of the star), needX how far
   * to step aside. A hit is only found once they overlap, by up to a frame's run.
   */
  overlap(it, p, zNow = -(it.at - p.distance)) {
    const T = it.T;
    return {
      needZ: zNow + (p.d + T.d) / 2 + TOUCH_GAP,
      needX: (p.w + T.w) / 2 + TOUCH_GAP - Math.abs(p.x - it.x),
    };
  }

  /** Moves an obstacle that was hit out of the star, the shorter way: ahead of it, or beside it. */
  unsink(it) {
    const p = this.player;
    if (!p) return;
    const { needZ, needX } = this.overlap(it, p);
    if (needZ <= 0 || needX <= 0) return;
    if (needX < needZ) it.x += (Math.sign(it.x - p.x) || it.side || 1) * needX;
    else it.at += needZ;
  }

  /** Shield or coffee rush: the obstacle is knocked out of the way. */
  knockAway(it, side) {
    it.gone = 0;
    it.side = side || (Math.random() < 0.5 ? -1 : 1);
    this.unsink(it);
  }

  /** Debug mode: the bug is squashed flat, just in front of the star. */
  squash(it) {
    it.gone = 0;
    it.squash = true;
    this.unsink(it);
  }
}
