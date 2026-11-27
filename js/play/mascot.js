/**
 * Run-A-Ton · mascot.js
 * The red star mascot, built in code (no model file).
 *
 * Sources (assets/mascot/):
 *   - Body: the rounded star outline measured from "Cool Red Star Sunglasses
 *     Mascot.png", given depth and inflated with a large round bevel like a
 *     vinyl toy. Two-tone red from mascot-red-pet.svg: #F9212E body, #E6011B
 *     for the shaded underside.
 *   - Sunglasses, glints and smile: the paths of mascot-red-cool.svg, placed
 *     where the PNG has them.
 *   - Eyes behind the glasses (seen only when they fly off): the hero desk
 *     mascot's eyes in index.html.
 *   - Legs and boots: white like mascot-leg.svg, built from smooth rounded
 *     shapes (leg, boot with a cuff, cream sole) so the ink line stays even.
 *
 * Units: 1 unit ~ half the star's width. Feet stand on y = 0, the mascot
 * faces +z. The game turns it to face down the aisle.
 */
import * as THREE from 'three';
import {
  toonMaterial, outlineMaterial, addOutline, inkMaterial,
  pathToShapes, weld, subdivide, mergeColored, makeBlobShadow,
} from './fx.js';

export const COLORS = {
  body: '#F9212E',
  bodyShade: '#E6011B',
  bodyLit: '#FF3A45',
  boot: '#FFFFFF',
  bootMid: '#F7F2EB',
  bootShade: '#DCCDBA',
  sole: '#D8C8B2',
  ink: '#0C0E0F',
  white: '#FFFFFF',
};

const TAU = Math.PI * 2;

/* Face parts keep their SVG shapes but sit where the PNG has them:
   glasses wide and a little right of centre, smile under the right lens. */
const fromGlasses = (x, y) => [(x - 48) * 0.0089 - 0.6, (96.6 - y) * 0.008 + 0.37];
const fromSmile = (x, y) => [(x - 112) * 0.0083 + 0.02, (168 - y) * 0.0066 - 0.25];

/* ---------------------------------------------------------------------------
   Body: the outline of "Cool Red Star Sunglasses Mascot.png", inflated
   --------------------------------------------------------------------------- */
/* Distance from the star's centre to the edge of its red fill, every 4 degrees
   counter-clockwise from +x, in units of half the star's width. Measured from
   the PNG (the stretch hidden behind the sparkle, 180-208 deg, is bridged). */
const OUTLINE_R = [
  0.986, 0.994, 0.992, 0.977, 0.954, 0.926, 0.894, 0.857, 0.816, 0.773, 0.737, 0.718, 0.723, 0.746, 0.779,
  0.814, 0.847, 0.876, 0.901, 0.920, 0.933, 0.941, 0.943, 0.938, 0.926, 0.909, 0.887, 0.861, 0.832, 0.802,
  0.772, 0.742, 0.714, 0.695, 0.696, 0.723, 0.770, 0.825, 0.877, 0.921, 0.956, 0.982, 0.996, 0.998, 0.988,
  0.965, 0.936, 0.903, 0.871, 0.839, 0.807, 0.774, 0.745, 0.727, 0.755, 0.833, 0.952, 1.046, 1.098, 1.100,
  1.077, 1.036, 0.981, 0.919, 0.857, 0.808, 0.784, 0.788, 0.815, 0.853, 0.892, 0.928, 0.959, 0.984, 1.003,
  1.015, 1.020, 1.018, 1.008, 0.990, 0.962, 0.922, 0.878, 0.843, 0.835, 0.850, 0.881, 0.913, 0.943, 0.968,
];

/** Edge radius at angle t, a smooth periodic (Catmull-Rom) curve through the samples. */
function outlineRadius(t) {
  const n = OUTLINE_R.length;
  const f = (((t / TAU) % 1) + 1) % 1 * n;
  const i = Math.floor(f);
  const u = f - i;
  const p0 = OUTLINE_R[(i - 1 + n) % n], p1 = OUTLINE_R[i % n], p2 = OUTLINE_R[(i + 1) % n], p3 = OUTLINE_R[(i + 2) % n];
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
}

/* The edge as a dense polygon, for distances. */
const EDGE_N = 360;
const EDGE = new Float32Array(EDGE_N * 2);
for (let j = 0; j < EDGE_N; j++) {
  const t = (j / EDGE_N) * TAU;
  const r = outlineRadius(t);
  EDGE[j * 2] = Math.cos(t) * r;
  EDGE[j * 2 + 1] = Math.sin(t) * r;
}

const EDGE_MIN_R = Math.min(...OUTLINE_R);
const DEEP = 0.26; // past this depth only "deep inside" matters (it is more than the bevel)

/**
 * Signed distance to the star's edge (negative inside). Deep inside, it only
 * reports "at least DEEP". Near the edge, the closest point is always within
 * 40 degrees of the point's own angle (radius >= 0.43 there), so only that
 * stretch of the edge is searched.
 */
function starSDF(x, y) {
  const rho = Math.hypot(x, y);
  if (rho < EDGE_MIN_R - DEEP) return -DEEP;
  const a = Math.atan2(y, x);
  const j0 = Math.round((a / TAU) * EDGE_N);
  let best = Infinity;
  for (let o = -40; o <= 40; o++) {
    const j = (((j0 + o) % EDGE_N) + EDGE_N) % EDGE_N;
    const ax = EDGE[j * 2], ay = EDGE[j * 2 + 1];
    const k = (j + 1) % EDGE_N;
    const bx = EDGE[k * 2] - ax, by = EDGE[k * 2 + 1] - ay;
    const px = x - ax, py = y - ay;
    const h = Math.max(0, Math.min(1, (px * bx + py * by) / (bx * bx + by * by)));
    const dx = px - bx * h, dy = py - by * h;
    const d = dx * dx + dy * dy;
    if (d < best) best = d;
  }
  return rho < outlineRadius(a) ? -Math.sqrt(best) : Math.sqrt(best);
}

const BEVEL = 0.25;  // radius of the rounded rim
const DOME = 0.08;    // extra puff in the middle of the face
const smooth01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

function puff(x, y, bevel, dome) {
  const s = -starSDF(x, y);
  if (s <= 0) return 0;
  const t = Math.min(s / bevel, 1);
  const rim = bevel * Math.sqrt(1 - (1 - t) * (1 - t));
  const d = dome * Math.max(0, 1 - (x * x + y * y) / 1.1) * smooth01(s / bevel);
  return rim + d;
}

/** Height of the front surface at (x, y): decals are bent onto this. */
export const frontZ = (x, y) => puff(x, y, BEVEL, DOME);
const backZ = (x, y) => -puff(x, y, BEVEL * 0.9, DOME * 0.6);

function buildBodyGeometry(N, R) {
  const radii = [];
  for (let j = 0; j < N; j++) radii.push(outlineRadius((j / N) * TAU));
  const pos = [0, 0, frontZ(0, 0)];
  const rings = [];
  for (let k = 1; k <= R; k++) rings.push({ u: 1 - (1 - k / R) ** 2, side: k === R ? 0 : 1 });
  for (let k = R - 1; k >= 1; k--) rings.push({ u: 1 - (1 - k / R) ** 2, side: -1 });
  for (const { u, side } of rings) {
    for (let j = 0; j < N; j++) {
      const t = (j / N) * TAU;
      const x = Math.cos(t) * radii[j] * u;
      const y = Math.sin(t) * radii[j] * u;
      pos.push(x, y, side === 0 ? 0 : side > 0 ? frontZ(x, y) : backZ(x, y));
    }
  }
  pos.push(0, 0, backZ(0, 0));
  const idx = [];
  for (let j = 0; j < N; j++) idx.push(0, 1 + j, 1 + ((j + 1) % N));
  for (let a = 0; a < rings.length - 1; a++) {
    const A = 1 + a * N, B = 1 + (a + 1) * N;
    for (let j = 0; j < N; j++) {
      const j2 = (j + 1) % N;
      idx.push(A + j, B + j, B + j2, A + j, B + j2, A + j2);
    }
  }
  const P = pos.length / 3 - 1, L = 1 + (rings.length - 1) * N;
  for (let j = 0; j < N; j++) idx.push(P, L + ((j + 1) % N), L + j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------------------------------------------------------------------------
   Face: paths from mascot-red-cool.svg, bent onto the front surface
   --------------------------------------------------------------------------- */
const GLASSES_D = 'M205.375 96.6199C217.25 94.9072 216.33 101.982 217.153 111.438L211.89 116.162C212.334 128.065 211.912 138.617 205.778 148.889C191.233 173.253 149.485 173.924 137.086 147.015C135.514 143.602 132.41 132.53 130.617 131.449C129.75 131.629 128.806 131.825 127.783 132.038C124.36 144.607 125.129 155.771 114.386 165.722C104.193 175.163 93.1672 176.155 80.6332 175.835C60.1229 171.444 53.6917 162.114 48.1522 142.158C45.4057 132.265 25.1482 116.667 53.6257 113.891C74.1787 111.889 96.6037 107.39 117.339 107.514C120.287 110.303 121.051 111.666 123.247 115.116L131.178 114.165C132.013 111.902 132.904 108.352 134.531 106.582C139.284 101.414 194.746 97.6401 205.375 96.6199Z';
const GLINT_R_D = 'M189.549 107.984L189.792 108.133C189.804 110.021 181.791 122.304 179.992 125.389C181.572 128.791 184.789 135.523 184.178 139.1C183.768 141.506 182.7 147.742 180.931 149.315C177.066 147.579 176.234 136.651 170.71 135.388C168.259 137.022 164.593 142.459 162.645 145.071L156.345 152.548C153.579 150.618 151.073 148.243 148.555 145.989C155.443 135.689 166.151 118.638 173.548 109.437C178.775 108.834 184.288 108.441 189.549 107.984Z';
const GLINT_L_D = 'M104.722 117.758L104.785 117.807C104.911 118.926 97.7286 131.157 96.5578 133.72C98.1598 140.068 99.6966 145.477 100.29 152.017C97.4158 155.713 94.7984 158.082 91.4399 161.261C92.1201 155.818 93.4446 151.402 90.3794 146.647C84.7124 143.465 81.0943 150.577 77.9931 154.716L72.0066 161.944C69.5346 160.344 66.0831 157.532 63.6523 155.662C71.9241 144.5 80.4644 131.419 88.2936 119.823C94.1316 118.646 98.8206 118.278 104.722 117.758Z';
const SMILE_D = 'M145.893 168.051C154.724 169.317 153.008 176.795 148.719 182.106C145.005 186.712 139.597 189.631 133.711 190.207C126.891 190.832 121.832 188.498 116.781 184.211C113.985 180.25 111.796 176.793 114.702 172.085C126.787 167.43 126.948 197.584 145.893 168.051Z';

function bendOntoFace(geometry, lift, floorZ = 0) {
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, p.getZ(i) + Math.max(frontZ(x, y), floorZ) + lift);
  }
  p.needsUpdate = true;
  geometry.computeBoundingSphere();
  return geometry;
}

const GLASSES_VERT = /* glsl */ `
#include <common>
#include <color_pars_vertex>
varying vec2 vXY;
void main() {
  #include <color_vertex>
  vXY = position.xy;
  #include <begin_vertex>
  #include <project_vertex>
}`;
const GLASSES_FRAG = /* glsl */ `
uniform float uSweep;
#include <color_pars_fragment>
varying vec2 vXY;
void main() {
  float s = dot(vXY, vec2(0.8, 0.6)) - uSweep;
  float band = smoothstep(0.075, 0.035, abs(s)) + 0.6 * smoothstep(0.03, 0.012, abs(s + 0.13));
  vec3 c = mix(vColor, vec3(1.0), clamp(band, 0.0, 1.0) * 0.9 * (1.0 - vColor.r));
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

function buildGlasses() {
  const frame = new THREE.ExtrudeGeometry(pathToShapes(GLASSES_D, fromGlasses), {
    depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01,
    bevelSegments: 1, curveSegments: 8,
  });
  const glints = new THREE.ShapeGeometry([...pathToShapes(GLINT_L_D, fromGlasses), ...pathToShapes(GLINT_R_D, fromGlasses)], 6);
  glints.translate(0, 0, 0.045);
  const geo = bendOntoFace(mergeColored([
    { geometry: subdivide(frame, 0.05), color: COLORS.ink },
    { geometry: subdivide(glints, 0.04), color: COLORS.white },
  ]), 0.012, 0.2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSweep: { value: 9 } },
    vertexShader: GLASSES_VERT,
    fragmentShader: GLASSES_FRAG,
    vertexColors: true,
  });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'glasses';
  return m;
}

function ellipseShape(cx, cy, rx, ry) {
  const s = new THREE.Shape();
  s.absellipse(cx, cy, rx, ry, 0, TAU, false, 0);
  return s;
}

/* Eyes behind the glasses (the hero desk mascot's style), seen only when they fly off. */
const EYES = [
  { x: -0.2, y: 0.03, rx: 0.16, ry: 0.18 },
  { x: 0.52, y: 0.1, rx: 0.17, ry: 0.19 },
];

function buildFace() {
  const parts = [{ geometry: subdivide(new THREE.ShapeGeometry(pathToShapes(SMILE_D, fromSmile), 10), 0.03), color: COLORS.ink }];
  const smile = new THREE.Mesh(bendOntoFace(mergeColored(parts), 0.006), inkMaterial());
  smile.name = 'smile';

  const eyeParts = [];
  for (const e of EYES) {
    const rim = subdivide(new THREE.ShapeGeometry(ellipseShape(e.x, e.y, e.rx + 0.045, e.ry + 0.045), 24), 0.04);
    const white = subdivide(new THREE.ShapeGeometry(ellipseShape(e.x, e.y, e.rx, e.ry), 24), 0.04);
    white.translate(0, 0, 0.004);
    eyeParts.push({ geometry: rim, color: COLORS.ink }, { geometry: white, color: COLORS.white });
  }
  const eyes = new THREE.Mesh(bendOntoFace(mergeColored(eyeParts), 0.006), inkMaterial());
  eyes.name = 'eyes';
  eyes.visible = false;

  const pupils = [];
  for (const e of EYES) {
    const g = new THREE.ShapeGeometry(ellipseShape(0, 0, e.rx * 0.62, e.ry * 0.66), 18);
    const p = new THREE.Mesh(mergeColored([{ geometry: g, color: COLORS.ink }]), inkMaterial());
    p.userData.home = new THREE.Vector3(e.x + 0.02, e.y - 0.01, frontZ(e.x, e.y) + 0.016);
    p.position.copy(p.userData.home);
    p.visible = false;
    pupils.push(p);
  }
  return { smile, eyes, pupils };
}

/* ---------------------------------------------------------------------------
   Legs and boots: smooth closed shapes, so the outline is clean all round
   --------------------------------------------------------------------------- */
const HIP_TO_ANKLE = 0.48;
const BOOT_SCALE = 1.18;
const ANKLE_TO_SOLE = 0.2 * BOOT_SCALE;

/** A sphere squashed into an ellipsoid, flattened below `flatY` (a sole). */
function ellipsoid(rx, ry, rz, cx, cy, cz, flatY = -Infinity) {
  const g = new THREE.SphereGeometry(1, 20, 14);
  g.scale(rx, ry, rz);
  g.translate(cx, cy, cz);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < flatY) p.setY(i, flatY);
  return weld(g, 1e-5);
}

/** The leg: a thin capsule from the hip (y = 0) down into the boot. */
function buildLegGeometry() {
  const g = new THREE.CapsuleGeometry(0.085, HIP_TO_ANKLE, 4, 14);
  g.translate(0, -HIP_TO_ANKLE / 2, 0);
  return mergeColored([{ geometry: weld(g, 1e-5), color: COLORS.boot }]);
}

/** The boot, around the ankle (y = 0): a rounded cuff, a chunky toe, a cream sole. */
function buildBootGeometry() {
  const cuff = weld(new THREE.CapsuleGeometry(0.135, 0.05, 5, 16).translate(0, 0.02, 0), 1e-5);
  const foot = ellipsoid(0.18, 0.14, 0.26, 0, -0.07, 0.07, -0.15);
  const sole = ellipsoid(0.195, 0.055, 0.275, 0, -0.155, 0.07, -0.2);
  return mergeColored([
    { geometry: cuff, color: COLORS.boot },
    { geometry: foot, color: COLORS.boot },
    { geometry: sole, color: COLORS.sole },
  ]).scale(BOOT_SCALE, BOOT_SCALE, BOOT_SCALE);
}

/* ---------------------------------------------------------------------------
   Rig and animation
   --------------------------------------------------------------------------- */
const HIP_Y = -0.7;                       // hips in body space, just inside the bottom edge
const HIP_X = 0.25;
const LEG_LEN = HIP_TO_ANKLE + ANKLE_TO_SOLE; // hip to sole
const BODY_Y = -HIP_Y + LEG_LEN;          // body centre above the floor (~1.42)
const PIVOT_Y = BODY_Y;             // flips and spins turn about the body centre

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const approach = (v, target, rate, dt) => v + (target - v) * (1 - Math.exp(-rate * dt));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class Mascot {
  /**
   * @param {object} [opts]
   * @param {'high'|'medium'|'low'} [opts.detail] geometry density
   */
  constructor({ detail = 'high' } = {}) {
    const seg = { high: [160, 20], medium: [128, 16], low: [96, 12] }[detail] || [128, 16];

    this.root = new THREE.Group();
    this.root.name = 'mascot';
    this.air = new THREE.Group();     // jump height
    this.turn = new THREE.Group();    // facing / title turntable
    this.squash = new THREE.Group();  // squash and stretch, about the feet
    this.lean = new THREE.Group();    // run lean, about the feet
    this.pivot = new THREE.Group();   // flips, spin-out, roll: about the body centre
    this.pivot.rotation.order = 'YXZ';
    this.pivot.position.y = PIVOT_Y;
    this.figure = new THREE.Group();
    this.figure.position.y = -PIVOT_Y;
    this.body = new THREE.Group();
    this.body.position.y = BODY_Y;
    this.root.add(this.air);
    this.air.add(this.turn);
    this.turn.add(this.squash);
    this.squash.add(this.lean);
    this.lean.add(this.pivot);
    this.pivot.add(this.figure);
    this.figure.add(this.body);

    this.outlineBody = outlineMaterial(0.072, 1.5);
    this.outlineBoot = outlineMaterial(0.052, 1.3);

    const bodyMesh = new THREE.Mesh(buildBodyGeometry(seg[0], seg[1]), toonMaterial({
      mid: COLORS.body, shade: COLORS.bodyShade, lit: COLORS.bodyLit, t1: 0.93, t2: 0.16,
    }));
    bodyMesh.name = 'body';
    addOutline(bodyMesh, this.outlineBody);
    this.body.add(bodyMesh);
    this.bodyMesh = bodyMesh;

    const face = buildFace();
    this.smile = face.smile;
    this.eyes = face.eyes;
    this.pupils = face.pupils;
    this.body.add(this.smile, this.eyes, ...this.pupils);

    this.glasses = buildGlasses();
    this.body.add(this.glasses);
    this.glassesHome = {
      position: this.glasses.position.clone(),
      quaternion: this.glasses.quaternion.clone(),
      scale: this.glasses.scale.clone(),
    };

    const legGeo = buildLegGeometry();
    const bootGeo = buildBootGeometry();
    const whiteMat = toonMaterial({
      mid: COLORS.bootMid, shade: COLORS.bootShade, lit: COLORS.boot, t1: 0.5, t2: -0.05, vertexColors: true,
    });
    this.ankles = [];
    this.legs = [-1, 1].map((side) => {
      const hip = new THREE.Group();
      hip.position.set(side * HIP_X, BODY_Y + HIP_Y, 0);
      const leg = new THREE.Mesh(legGeo, whiteMat);
      leg.name = side < 0 ? 'legL' : 'legR';
      addOutline(leg, this.outlineBoot);
      const ankle = new THREE.Group();
      ankle.position.y = -HIP_TO_ANKLE;
      const boot = new THREE.Mesh(bootGeo, whiteMat);
      boot.name = side < 0 ? 'bootL' : 'bootR';
      boot.rotation.y = side * 0.22; // toes turned out a little, as in the art
      addOutline(boot, this.outlineBoot);
      ankle.add(boot);
      hip.add(leg, ankle);
      this.figure.add(hip);
      this.ankles.push(ankle);
      return hip;
    });

    this.shadow = makeBlobShadow(1.05, 0.3);
    this.root.add(this.shadow);

    this.debrisParent = null; // where the glasses go when they fly off (the scene)
    this.reset();
    this.setMode('title');
  }

  /** The ink line is drawn at a fixed width; scale it with the mascot's size in the world. */
  setOutlineScale(k) {
    this.outlineBody.uniforms.uWidth.value = 0.072 * k;
    this.outlineBoot.uniforms.uWidth.value = 0.052 * k;
  }

  /** Total height (feet to top of the star), in model units at scale 1. */
  static get HEIGHT() { return BODY_Y + 0.95; }
  static get BODY_Y() { return BODY_Y; }

  reset() {
    this.time = 0;
    this.phase = 0;
    this.st = 0;          // stretch (+ taller, - squashed)
    this.stV = 0;
    this.airborne = false;
    this.flipT = 0;
    this.flipDur = 0;
    this.sliding = false;
    this.slideAmt = 0;
    this.hitT = -1;
    this.spinFrom = 0;
    this.spinTotal = 0;
    this.hopY = 0;
    this.hopV = 0;
    this.sweepClock = 0;
    this.lateral = 0;
    this.bank = 0;
    this.restoreGlasses();
    this.eyes.visible = false;
    for (const p of this.pupils) { p.visible = false; p.position.copy(p.userData.home); }
    this.turn.rotation.set(0, 0, 0);
    this.pivot.rotation.set(0, 0, 0);
    this.lean.rotation.set(0, 0, 0);
    this.figure.rotation.set(0, 0, 0);
    this.legs.forEach((l) => l.rotation.set(0, 0, 0));
    this.ankles.forEach((a) => a.rotation.set(0, 0, 0));
  }

  /** 'title' (standing still, facing the camera), 'run', or 'idle' (standing, facing +z). */
  setMode(mode) {
    this.mode = mode;
    if (mode !== 'title') this.glasses.material.uniforms.uSweep.value = 9;
  }

  /** Take off. airTime: seconds until landing (for the flip); flip: do a spin flip. */
  jump({ airTime = 0.6, flip = false } = {}) {
    if (this.hitT >= 0) return;
    this.airborne = true;
    this.sliding = false;
    this.stV = 5.5;             // stretch on take-off
    this.st = Math.max(this.st, 0.05);
    this.flipT = 0;
    this.flipDur = flip ? Math.max(0.3, airTime) : 0;
  }

  /** Touch down: squash, then spring back. */
  land(strength = 1) {
    this.airborne = false;
    this.flipDur = 0;
    this.flipT = 0;
    this.stV = -7.5 * clamp(strength, 0.4, 1.4);
  }

  slide(on) {
    if (this.hitT >= 0) return;
    if (on && !this.sliding) this.stV -= 3;
    if (!on && this.sliding) this.stV += 4;
    this.sliding = on;
  }

  /**
   * Bump: spin out, sunglasses fly off. The spin ends half a turn round, so a
   * star running away from the camera finishes facing it, dizzy.
   */
  hit({ turns = 2.5 } = {}) {
    if (this.hitT >= 0) return;
    this.hitT = 0;
    this.spinFrom = this.pivot.rotation.y;
    this.spinTotal = turns * TAU;
    this.hopV = 3.2;
    this.sliding = false;
    this.flipDur = 0;
    this.stV = -6;
    this.eyes.visible = true;
    for (const p of this.pupils) p.visible = true;
    this.launchGlasses();
  }

  launchGlasses() {
    const parent = this.debrisParent || this.root.parent;
    if (!parent) return;
    this.root.updateWorldMatrix(true, true);
    parent.attach(this.glasses);
    const side = Math.random() < 0.5 ? -1 : 1;
    const k = this.root.getWorldScale(new THREE.Vector3()).x; // fly at the mascot's own scale
    this.fly = {
      k,
      v: new THREE.Vector3(side * 1.6, 5.2, 1.4).multiplyScalar(k),
      w: new THREE.Vector3(9 + Math.random() * 5, side * 7, side * 4),
      resting: false,
    };
  }

  restoreGlasses() {
    this.fly = null;
    if (this.glasses.parent !== this.body) this.body.add(this.glasses);
    this.glasses.position.copy(this.glassesHome?.position || this.glasses.position);
    if (this.glassesHome) {
      this.glasses.quaternion.copy(this.glassesHome.quaternion);
      this.glasses.scale.copy(this.glassesHome.scale);
    }
  }

  /**
   * @param {number} dt seconds
   * @param {object} [o]
   * @param {number} [o.speed]   0..1, how fast the run is (stride rate, lean)
   * @param {number} [o.height]  jump height above the floor
   * @param {number} [o.lateral] sideways velocity (lane change), for banking
   */
  update(dt, { speed = 0, height = 0, lateral = 0 } = {}) {
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    this.footstep = 0; // -1 / +1 on the frame a boot lands (for dust puffs)
    const t = this.time;
    const sp = clamp(speed, 0, 1.8); // past 1: running flat out, strides keep quickening
    const hit = this.hitT >= 0;

    /* Squash and stretch: a damped spring */
    this.stV += (-170 * this.st - 11 * this.stV) * dt;
    this.st += this.stV * dt;
    this.slideAmt = approach(this.slideAmt, this.sliding ? 1 : 0, 16, dt);

    let sy = 1 + this.st;
    let bob = 0;
    let lean = 0;
    let roll = 0;
    let twist = 0;
    let legL = 0;
    let legR = 0;
    let ankL = null; // null: keep the sole level under the leg's swing
    let ankR = null;

    if (this.mode === 'title') {
      // stands still, facing you (it breathes and its sunglasses glint)
      this.turn.rotation.y = approach(this.turn.rotation.y, 0, 8, dt);
      sy *= 1 + 0.018 * Math.sin(t * 2.4);
      bob = 0.03 * Math.sin(t * 2.4);
      legL = 0.06 * Math.sin(t * 1.2);
      legR = -legL;
      this.sweepClock += dt;
      const ph = this.sweepClock % 3.2;
      this.glasses.material.uniforms.uSweep.value = ph < 0.6 ? -1.25 + (ph / 0.6) * 2.4 : 9;
    } else {
      this.turn.rotation.y = approach(this.turn.rotation.y, 0, 8, dt);
    }

    if (this.mode === 'run' && !hit) {
      const grounded = !this.airborne && height <= 0.001;
      if (grounded && !this.sliding) this.phase += dt * (2.5 + 1.7 * sp) * TAU;
      const s = Math.sin(this.phase);
      if (grounded && !this.sliding && Math.sign(s) !== Math.sign(this.lastStride || 0)) this.footstep = s > 0 ? 1 : -1;
      this.lastStride = s;
      const amp = 0.78;
      if (this.sliding) {
        legL = legR = -1.25;
        ankL = ankR = 0.7; // soles forward, toes up
      } else if (!grounded) {
        legL = -0.75; legR = 0.5;
        ankL = 0.35; ankR = 0.1;
      } else {
        legL = -amp * s; legR = amp * s;
        bob = 0.11 * Math.abs(s);
        sy *= 1 - 0.07 * (1 - Math.abs(s)) ** 4;   // a little squash as each foot lands
        roll = 0.07 * s;
        twist = 0.12 * s;
      }
      lean = this.sliding ? -0.18 : 0.2 + 0.1 * Math.min(sp, 1) + 0.12 * Math.max(0, sp - 1);
      this.bank = approach(this.bank, clamp(-lateral * 0.045, -0.35, 0.35), 10, dt);
      roll += this.bank;

      if (this.flipDur > 0) {
        this.flipT += dt;
        const p = clamp(this.flipT / this.flipDur, 0, 1);
        this.flipAngle = TAU * easeInOut(p);
      } else {
        this.flipAngle = 0;
      }
    } else {
      this.flipAngle = 0;
    }

    if (this.mode === 'idle' && !hit) {
      sy *= 1 + 0.015 * Math.sin(t * 2.2);
    }

    /* Slide: the star squashes flat */
    sy *= 1 - 0.5 * this.slideAmt;
    const sxz = 1 / Math.pow(Math.max(sy, 0.3), 0.45);
    this.squash.scale.set(sxz, sy, sxz);

    /* Hit: spin out, hop, tilt back, wobble */
    if (hit) {
      this.hitT += dt;
      const h = this.hitT;
      this.pivot.rotation.y = this.spinFrom + this.spinTotal * (1 - Math.exp(-2.6 * h));
      this.hopV -= 14 * dt;
      this.hopY = Math.max(0, this.hopY + this.hopV * dt);
      if (this.hopY === 0 && this.hopV < 0) this.hopV = 0;
      lean = -0.3 * clamp(h / 0.35, 0, 1);
      roll = 0.28 * Math.sin(h * 7) * Math.exp(-1.2 * h);
      legL = -0.55; legR = -0.3;
      ankL = 0.3; ankR = 0.2;
      const a = h * 9;
      this.pupils.forEach((p, i) => {
        const dir = i === 0 ? 1 : -1;
        p.position.set(
          p.userData.home.x + Math.cos(a * dir) * 0.04,
          p.userData.home.y + Math.sin(a * dir) * 0.04,
          p.userData.home.z,
        );
      });
    } else {
      this.pivot.rotation.y = approach(this.pivot.rotation.y, 0, 10, dt);
      this.hopY = 0;
    }

    this.air.position.y = height + this.hopY;
    this.lean.rotation.x = approach(this.lean.rotation.x, lean, 12, dt);
    this.pivot.rotation.x = this.flipAngle || 0;
    this.pivot.rotation.z = approach(this.pivot.rotation.z, roll, 14, dt);
    this.figure.rotation.y = approach(this.figure.rotation.y, twist, 14, dt);
    this.body.position.y = BODY_Y + bob;
    const legRate = this.mode === 'run' && !this.airborne && !this.sliding && !hit ? 40 : 14;
    this.legs[0].rotation.x = approach(this.legs[0].rotation.x, legL, legRate, dt);
    this.legs[1].rotation.x = approach(this.legs[1].rotation.x, legR, legRate, dt);
    /* Ankles: by default the boot stays nearly level as the leg swings, and the
       heel lifts as the foot pushes off behind. */
    const level = (hipAngle) => -0.75 * hipAngle + 0.45 * Math.max(0, hipAngle);
    const aL = ankL ?? level(this.legs[0].rotation.x);
    const aR = ankR ?? level(this.legs[1].rotation.x);
    this.ankles[0].rotation.x = approach(this.ankles[0].rotation.x, aL, legRate, dt);
    this.ankles[1].rotation.x = approach(this.ankles[1].rotation.x, aR, legRate, dt);

    /* Floor shadow shrinks and fades as the star rises */
    const lift = this.air.position.y;
    const k = 1 / (1 + lift * 0.45);
    this.shadow.scale.set(k * (1 + 0.25 * this.slideAmt), 1, k * 0.8);
    this.shadow.material.opacity = 0.3 * k;

    this.updateGlasses(dt);
  }

  updateGlasses(dt) {
    const f = this.fly;
    if (!f || f.resting) return;
    const g = this.glasses;
    f.v.y -= 14 * f.k * dt;
    g.position.addScaledVector(f.v, dt);
    g.rotation.x += f.w.x * dt;
    g.rotation.y += f.w.y * dt;
    g.rotation.z += f.w.z * dt;
    const floor = (this.debrisParent ? 0 : this.root.position.y) + 0.05 * f.k;
    if (g.position.y < floor) {
      g.position.y = floor;
      f.v.y *= -0.3;
      f.v.x *= 0.5; f.v.z *= 0.5;
      f.w.multiplyScalar(0.35);
      if (Math.abs(f.v.y) < 0.6 * f.k) {
        f.resting = true;
        g.rotation.set(-Math.PI / 2, 0, g.rotation.z);
      }
    }
  }

  /** Disposes geometry and materials. */
  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
  }
}
