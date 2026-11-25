/**
 * Run-A-Ton · post.js
 * Full-screen effects that make the 3D look like a printed comic:
 *   - halftone dots in the shaded band of cartoon materials
 *   - glow on screens, neon, sparkles, coffee and the shield only
 *   - a colour grade for each time of day, a vignette, subtle paper grain
 *   - during the coffee boost: comic speed lines at the edges and a slight
 *     colour fringe
 *
 * Edges are smoothed with a light FXAA in the final pass: much cheaper on
 * phones than a multisampled buffer. The scene is drawn once; materials leave a
 * note in alpha (see fx.js): 1 plain, 0.5..1 shaded band, below 0.5 glowing.
 * Glowing pixels are pulled out at a quarter of the size, blurred, and added
 * back in the final pass. Cost: one scene draw + 4 small full-screen passes.
 * The low quality level skips all of this and draws straight to the screen.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/* Glowing pixels only, at a quarter of the size (4 taps, each a 2x2 average). */
const EXTRACT_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uTexel;
varying vec2 vUv;
vec3 glowAt(vec2 uv) {
  vec4 s = texture2D(tScene, uv);
  float g = clamp((0.5 - s.a) * 2.0, 0.0, 1.0);
  return s.rgb * g;
}
void main() {
  vec3 c = glowAt(vUv + uTexel * vec2(-1.0, -1.0)) + glowAt(vUv + uTexel * vec2(1.0, -1.0))
         + glowAt(vUv + uTexel * vec2(-1.0, 1.0)) + glowAt(vUv + uTexel * vec2(1.0, 1.0));
  gl_FragColor = vec4(c * 0.25, 1.0);
}`;

/* Separable blur, 9 taps folded into 5 bilinear reads. */
const BLUR_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.227;
  c += texture2D(tSrc, vUv + uDir * 1.385).rgb * 0.316;
  c += texture2D(tSrc, vUv - uDir * 1.385).rgb * 0.316;
  c += texture2D(tSrc, vUv + uDir * 3.231).rgb * 0.070;
  c += texture2D(tSrc, vUv - uDir * 3.231).rgb * 0.070;
  gl_FragColor = vec4(c, 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tGlow;
uniform vec2 uRes;
uniform float uPx;          // device pixels per CSS pixel
uniform float uGlowAmount;
uniform float uHalftone;
uniform vec3 uInk;
uniform float uSat;
uniform float uContrast;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform float uVignette;
uniform vec3 uVignetteColor;
uniform float uGrain;
uniform float uBoost;
uniform float uTime;
uniform float uFxaa;
uniform vec2 uTexel;
varying vec2 vUv;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
/* FXAA (the light, console-style version): smooths jagged edges along their direction */
vec3 fxaa(vec2 uv, vec3 rgbM) {
  vec3 rgbNW = texture2D(tScene, uv + vec2(-1.0, -1.0) * uTexel).rgb;
  vec3 rgbNE = texture2D(tScene, uv + vec2(1.0, -1.0) * uTexel).rgb;
  vec3 rgbSW = texture2D(tScene, uv + vec2(-1.0, 1.0) * uTexel).rgb;
  vec3 rgbSE = texture2D(tScene, uv + vec2(1.0, 1.0) * uTexel).rgb;
  float lNW = luma(rgbNW), lNE = luma(rgbNE), lSW = luma(rgbSW), lSE = luma(rgbSE), lM = luma(rgbM);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.03, lMax * 0.12)) return rgbM;
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), -6.0, 6.0) * uTexel;
  vec3 a = 0.5 * (texture2D(tScene, uv - dir / 6.0).rgb + texture2D(tScene, uv + dir / 6.0).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tScene, uv - dir * 0.5).rgb + texture2D(tScene, uv + dir * 0.5).rgb);
  float lB = luma(b);
  return (lB < lMin || lB > lMax) ? a : b;
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 uv = vUv;
  vec4 s = texture2D(tScene, uv);
  vec3 col = uFxaa > 0.5 ? fxaa(uv, s.rgb) : s.rgb;
  // Coffee boost: a slight colour fringe towards the edges
  if (uBoost > 0.001) {
    vec2 d = (uv - 0.5) * 0.010 * uBoost;
    col.r = texture2D(tScene, uv + d).r;
    col.b = texture2D(tScene, uv - d).b;
  }
  col += texture2D(tGlow, uv).rgb * uGlowAmount;
  col = toSRGB(col);

  // Halftone: ink dots in the shaded band, bigger where it's darker
  float shade = s.a >= 0.5 ? clamp((1.0 - s.a) * 2.0, 0.0, 1.0) : 0.0;
  if (shade > 0.0 && uHalftone > 0.0) {
    float cell = 5.0 * uPx;
    vec2 p = mat2(0.7071, -0.7071, 0.7071, 0.7071) * gl_FragCoord.xy / cell;
    vec2 f = fract(p) - 0.5;
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float r = 0.5 * sqrt(shade) * mix(1.0, 0.75, lum);
    float aa = 1.2 / cell;
    float dots = 1.0 - smoothstep(r - aa, r + aa, length(f));
    col = mix(col, col * uInk, dots * uHalftone);
  }

  // Grade for the time of day: saturation, contrast, split toning
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  col = (col - 0.5) * uContrast + 0.5;
  col *= mix(uShadowTint, uHighTint, smoothstep(0.05, 0.95, l));

  // Vignette
  vec2 q = uv - 0.5;
  q.x *= uRes.x / uRes.y;
  float v = smoothstep(0.42, 1.05, length(q) * 1.4);
  col = mix(col, col * uVignetteColor, v * uVignette);

  // Coffee boost: comic speed lines streaming out at the edges
  if (uBoost > 0.001) {
    float ang = atan(q.y, q.x);
    float id = floor(ang * 30.0);
    float line = step(0.55, hash(vec2(id, 7.0))) * (1.0 - smoothstep(0.25, 0.5, abs(fract(ang * 30.0) - 0.5)));
    float rr = length(q);
    float dash = smoothstep(0.2, 0.6, fract(rr * 4.0 - uTime * 2.6 + hash(vec2(id, 3.0))));
    float m = smoothstep(0.34, 0.62, rr) * line * dash * uBoost;
    col = mix(col, vec3(1.0), m * 0.6);
  }

  // Paper grain: fixed to the page (it doesn't crawl), very light
  float g = hash(floor(gl_FragCoord.xy / (1.5 * uPx))) - 0.5;
  float fibre = hash(floor(gl_FragCoord.xy / (9.0 * uPx))) - 0.5;
  col += (g * 0.8 + fibre * 0.5) * uGrain;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

/* Grade by game hour, blended in between (sRGB multipliers). */
const GRADE_KEYS = [
  { h: 0, sat: 1.08, contrast: 1.04, shadow: [0.97, 0.9, 0.84], high: [1.04, 1.0, 0.93], ink: [0.42, 0.3, 0.24], glow: 0.55, vignette: 0.28, vcol: [0.55, 0.36, 0.2] },
  { h: 5, sat: 1.12, contrast: 1.05, shadow: [0.95, 0.86, 0.82], high: [1.07, 0.99, 0.88], ink: [0.42, 0.28, 0.24], glow: 0.7, vignette: 0.3, vcol: [0.55, 0.3, 0.2] },
  { h: 8, sat: 1.12, contrast: 1.06, shadow: [0.88, 0.8, 0.98], high: [1.08, 0.96, 0.88], ink: [0.32, 0.24, 0.4], glow: 1.0, vignette: 0.34, vcol: [0.4, 0.22, 0.4] },
  { h: 13, sat: 0.96, contrast: 1.08, shadow: [0.8, 0.84, 1.1], high: [0.98, 0.98, 1.08], ink: [0.22, 0.24, 0.45], glow: 1.45, vignette: 0.42, vcol: [0.12, 0.12, 0.35] },
  { h: 17, sat: 0.98, contrast: 1.08, shadow: [0.82, 0.82, 1.08], high: [1.0, 0.97, 1.06], ink: [0.25, 0.22, 0.45], glow: 1.35, vignette: 0.4, vcol: [0.16, 0.12, 0.35] },
  { h: 19.5, sat: 1.1, contrast: 1.05, shadow: [0.96, 0.86, 0.96], high: [1.08, 1.0, 0.92], ink: [0.42, 0.26, 0.36], glow: 0.9, vignette: 0.3, vcol: [0.5, 0.25, 0.35] },
  { h: 22.5, sat: 1.16, contrast: 1.07, shadow: [0.88, 0.8, 1.06], high: [1.06, 1.0, 1.02], ink: [0.3, 0.2, 0.42], glow: 1.3, vignette: 0.36, vcol: [0.25, 0.1, 0.35] },
  { h: 24, sat: 1.16, contrast: 1.07, shadow: [0.88, 0.8, 1.06], high: [1.06, 1.0, 1.02], ink: [0.3, 0.2, 0.42], glow: 1.3, vignette: 0.36, vcol: [0.25, 0.1, 0.35] },
  // the day loops: back to the afternoon's grade
  { h: 25, sat: 1.08, contrast: 1.04, shadow: [0.97, 0.9, 0.84], high: [1.04, 1.0, 0.93], ink: [0.42, 0.3, 0.24], glow: 0.55, vignette: 0.28, vcol: [0.55, 0.36, 0.2] },
];

export class PostFX {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {object} o
   * @param {number} o.samples MSAA samples for the scene buffer (0, 2 or 4)
   */
  constructor(renderer, { samples = 4 } = {}) {
    this.renderer = renderer;
    this.samples = samples;
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(tri);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    this.main = this.makeMain(1, 1);
    const small = { depthBuffer: false, type: THREE.UnsignedByteType };
    this.glowA = new THREE.WebGLRenderTarget(1, 1, small);
    this.glowB = new THREE.WebGLRenderTarget(1, 1, small);

    const mat = (fragmentShader, uniforms) => new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false,
    });
    this.extract = mat(EXTRACT_FRAG, { tScene: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.blur = mat(BLUR_FRAG, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.composite = mat(COMPOSITE_FRAG, {
      tScene: { value: null }, tGlow: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uPx: { value: 1 },
      uGlowAmount: { value: 1 }, uHalftone: { value: 0.35 }, uInk: { value: new THREE.Color() },
      uSat: { value: 1 }, uContrast: { value: 1 }, uShadowTint: { value: new THREE.Color() }, uHighTint: { value: new THREE.Color() },
      uVignette: { value: 0.3 }, uVignetteColor: { value: new THREE.Color() }, uGrain: { value: 0.03 },
      uBoost: { value: 0 }, uTime: { value: 0 }, uFxaa: { value: 1 }, uTexel: { value: new THREE.Vector2() },
    });
    this.glowOn = true;
    this.halftoneOn = true;
    this.width = 1;
    this.height = 1;
  }

  makeMain(w, h) {
    const rt = new THREE.WebGLRenderTarget(w, h, {
      samples: this.samples, type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace, depthBuffer: true, stencilBuffer: false,
    });
    rt.texture.generateMipmaps = false;
    return rt;
  }

  /** Effects that the quality level allows. */
  configure({ samples, glow, halftone, fxaa = true }) {
    this.glowOn = glow;
    this.halftoneOn = halftone;
    this.composite.uniforms.uFxaa.value = fxaa ? 1 : 0;
    if (samples !== this.samples) {
      this.samples = samples;
      this.main.dispose();
      this.main = this.makeMain(this.width, this.height);
    }
  }

  /** Drawing-buffer size in device pixels, and device pixels per CSS pixel. */
  setSize(width, height, pixelRatio) {
    this.width = width;
    this.height = height;
    this.main.setSize(width, height);
    const gw = Math.max(1, Math.round(width / 4));
    const gh = Math.max(1, Math.round(height / 4));
    this.glowA.setSize(gw, gh);
    this.glowB.setSize(gw, gh);
    this.composite.uniforms.uRes.value.set(width, height);
    this.composite.uniforms.uPx.value = pixelRatio;
    this.extract.uniforms.uTexel.value.set(1 / width, 1 / height);
    this.composite.uniforms.uTexel.value.set(1 / width, 1 / height);
    this.gw = gw;
    this.gh = gh;
  }

  /** Grade for a game hour (0..25; 24-25 eases back into the afternoon). */
  setTime(hours) {
    const h = Math.max(0, Math.min(25, hours));
    let i = 0;
    while (i < GRADE_KEYS.length - 2 && h >= GRADE_KEYS[i + 1].h) i++;
    const a = GRADE_KEYS[i];
    const b = GRADE_KEYS[i + 1];
    const t0 = Math.max(0, Math.min(1, (h - a.h) / (b.h - a.h)));
    const t = t0 * t0 * (3 - 2 * t0);
    const lerp = (x, y) => x + (y - x) * t;
    const U = this.composite.uniforms;
    U.uSat.value = lerp(a.sat, b.sat);
    U.uContrast.value = lerp(a.contrast, b.contrast);
    U.uShadowTint.value.setRGB(...a.shadow.map((v, k) => lerp(v, b.shadow[k])));
    U.uHighTint.value.setRGB(...a.high.map((v, k) => lerp(v, b.high[k])));
    U.uInk.value.setRGB(...a.ink.map((v, k) => lerp(v, b.ink[k])));
    U.uVignetteColor.value.setRGB(...a.vcol.map((v, k) => lerp(v, b.vcol[k])));
    U.uVignette.value = lerp(a.vignette, b.vignette);
    this.glowAmount = lerp(a.glow, b.glow);
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * @param {object} o
   * @param {number} o.boost coffee boost 0..1 (speed lines + fringe)
   * @param {number} o.time  seconds, for the speed lines
   */
  render(scene, camera, { boost = 0, time = 0 } = {}) {
    const r = this.renderer;
    r.setRenderTarget(this.main);
    r.render(scene, camera);
    const U = this.composite.uniforms;
    if (this.glowOn) {
      this.extract.uniforms.tScene.value = this.main.texture;
      this.pass(this.extract, this.glowA);
      this.blur.uniforms.tSrc.value = this.glowA.texture;
      this.blur.uniforms.uDir.value.set(1 / this.gw, 0);
      this.pass(this.blur, this.glowB);
      this.blur.uniforms.tSrc.value = this.glowB.texture;
      this.blur.uniforms.uDir.value.set(0, 1 / this.gh);
      this.pass(this.blur, this.glowA);
    }
    U.tScene.value = this.main.texture;
    U.tGlow.value = this.glowA.texture;
    U.uGlowAmount.value = this.glowOn ? this.glowAmount ?? 1 : 0;
    U.uHalftone.value = this.halftoneOn ? 0.38 : 0;
    U.uBoost.value = boost;
    U.uTime.value = time;
    this.pass(this.composite, null);
  }

  dispose() {
    this.main.dispose();
    this.glowA.dispose();
    this.glowB.dispose();
  }
}
