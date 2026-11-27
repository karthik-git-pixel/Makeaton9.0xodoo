/**
 * Run-A-Ton · fx.js
 * Cartoon shading shared by everything drawn in 3D:
 *   - toonMaterial(): flat shading in 3 bands of light (lit / mid / shade),
 *     with the brand colours painted in exactly (no tone mapping, no lights).
 *   - outlineMaterial() + addOutline(): the black ink line, drawn as a
 *     slightly larger back-facing copy of a mesh (an "inverted hull").
 *   - Geometry helpers: SVG path -> THREE.Shape, welding for smooth normals,
 *     merging coloured parts into one draw call.
 * The light is fixed relative to the camera (upper left, towards the viewer),
 * so every object keeps the look of the printed art from any angle: lit on
 * the upper left, the shaded colour along the lower right.
 */
import * as THREE from 'three';

/* Shared uniforms: one object, referenced by every material. */
export const shared = {
  uLightDir: { value: new THREE.Vector3(-0.45, 0.7, 0.55).normalize() }, // view space
  uResY: { value: 800 }, // drawing-buffer height in pixels, for the outline's minimum width
  uTime: { value: 0 },   // seconds, for shimmer effects
  /* Time-of-day tints, multiplied into every cartoon material: the hall gets
     the full grade, the characters a lighter one so they always read. */
  uEnvTint: { value: new THREE.Color(1, 1, 1) },
  uCharTint: { value: new THREE.Color(1, 1, 1) },
};
const WHITE = { value: new THREE.Color(1, 1, 1) };

export function setResolution(heightPx) {
  shared.uResY.value = Math.max(1, heightPx);
}

const TOON_VERT = /* glsl */ `
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
varying vec3 vViewNormal;
#if defined(GLITCH) || defined(FLAP)
  uniform float uTime;
#endif
#ifdef GLITCH
  attribute float aFlag;
  varying float vFlag;
  varying vec3 vObj;
#endif
#ifdef FLAP
  attribute float aWing;   // -1 left wing / leg, +1 right, 0 body
  uniform vec4 uFlap;      // pivot x, pivot y, amplitude (rad), beats per second
  uniform float uFlapBias; // resting angle, as a fraction of the amplitude
#endif
#ifdef LAMP
  attribute float aLamp;
  varying float vLamp;
#endif
void main() {
  #include <color_vertex>
  #ifdef FLAP
    // wings (or legs) beat about a pivot on the body's long axis, mirrored left/right
    float wa = aWing * uFlap.z * (uFlapBias + sin(uTime * uFlap.w * 6.2832 + float(gl_InstanceID) * 2.1));
    float wc = cos(wa), ws = sin(wa);
  #endif
  #include <beginnormal_vertex>
  #ifdef FLAP
    if (aWing != 0.0) objectNormal.xy = vec2(wc * objectNormal.x - ws * objectNormal.y, ws * objectNormal.x + wc * objectNormal.y);
  #endif
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #ifdef FLAP
    if (aWing != 0.0) {
      vec2 pv = vec2(aWing * uFlap.x, uFlap.y);
      vec2 q = transformed.xy - pv;
      transformed.xy = pv + vec2(wc * q.x - ws * q.y, ws * q.x + wc * q.y);
    }
  #endif
  #ifdef LAMP
    vLamp = aLamp;
  #endif
  #ifdef GLITCH
    vFlag = aFlag;
    vObj = position;
    // now and then a slice of the shell slips sideways, like a bad frame
    float band = floor(position.y * 14.0);
    float slip = step(0.93, fract(sin(band * 12.9898 + floor(uTime * 9.0) * 78.233 + float(gl_InstanceID) * 3.1) * 43758.5453));
    transformed.x += slip * aFlag * 0.05;
  #endif
  #include <project_vertex>
  #include <fog_vertex>
  vViewNormal = normalize(transformedNormal);
}`;

const TOON_FRAG = /* glsl */ `
uniform vec3 uLit;
uniform vec3 uMid;
uniform vec3 uShade;
uniform vec3 uLightDir;
uniform vec3 uTint;
uniform float uT1;
uniform float uT2;
uniform float uGlow;      // 0..1: this material glows (post effects read it from alpha)
uniform float uHalftone;  // 0..1: halftone dots in the shaded band
#include <color_pars_fragment>
#include <fog_pars_fragment>
varying vec3 vViewNormal;
#ifdef GLITCH
  uniform float uTime;
  varying float vFlag;
  varying vec3 vObj;
  float hash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
#endif
#ifdef LAMP
  uniform float uLamp;     // how strongly the lamp parts glow (0..1)
  varying float vLamp;
#endif
void main() {
  vec3 n = normalize(vViewNormal);
  float d = dot(n, uLightDir);
  float aa = fwidth(d) * 0.8 + 1e-4;           // soft by one pixel: crisp, not jagged
  float lit = smoothstep(uT1 - aa, uT1 + aa, d);
  float mid = smoothstep(uT2 - aa, uT2 + aa, d);
  vec3 c = mix(uShade, mix(uMid, uLit, lit), mid);
  #ifdef USE_COLOR
    c *= vColor;
    #ifdef LAMP
      c = mix(c, vColor, step(0.5, vLamp));     // a lamp is flat and bright, never shaded
    #endif
  #endif
  #ifdef GLITCH
    // pixel shimmer: square cells of the shell flash cyan, magenta or white
    vec3 cell = floor(vObj * 16.0);
    float h = hash3(cell + floor(uTime * 11.0));
    vec3 g = h > 0.975 ? vec3(1.0) : (h > 0.95 ? vec3(0.31, 0.97, 1.0) : vec3(1.0, 0.31, 0.88));
    c = mix(c, g, step(0.925, h) * vFlag);
  #endif
  c *= uTint;
  // Alpha carries a note for the post effects: 1 = plain, 0.5..1 = shaded band
  // (halftone dots, none in the distance), below 0.5 = glowing.
  float note = 1.0 - 0.5 * (1.0 - mid) * uHalftone;
  #ifdef USE_FOG
    note = mix(note, 1.0, smoothstep(fogNear * 0.6, fogFar * 0.5, vFogDepth));
  #endif
  note = uGlow > 0.0 ? 0.5 - 0.5 * uGlow : note;
  #ifdef LAMP
    if (vLamp > 0.5) note = uLamp > 0.0 ? 0.5 - 0.5 * uLamp : 1.0;
  #endif
  gl_FragColor = vec4(c, note);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

/* Fog uniforms the renderer fills in from scene.fog (fog is mixed before the
   sRGB conversion, so the far haze matches the fog colour exactly). */
const fogUniforms = () => ({
  fogDensity: { value: 0 },
  fogNear: { value: 1 },
  fogFar: { value: 1000 },
  fogColor: { value: new THREE.Color(0xffffff) },
});

/**
 * Flat cartoon material in 3 bands.
 * @param {object} o
 * @param {string|number} o.mid   main colour (most of the surface)
 * @param {string|number} o.shade colour of the shaded underside
 * @param {string|number} [o.lit] colour of the band facing the light (defaults to mid)
 * @param {number} [o.t1] threshold for the lit band (dot of normal and light)
 * @param {number} [o.t2] threshold for the shaded band
 * @param {'env'|'char'|'none'} [o.tint] which time-of-day tint applies
 * @param {boolean} [o.glitch] pixel shimmer where the geometry's aFlag is 1
 * @param {object} [o.flap] parts with aWing = ±1 beat like wings:
 *        { pivot: [x, y], amp: radians, rate: beats per second, bias }
 * @param {object|number} [o.lamp] parts with aLamp = 1 are flat and glow this much (a shared uniform or a number)
 */
export function toonMaterial({ mid, shade, lit = mid, t1 = 0.72, t2 = 0.02, vertexColors = false, fog = true, tint = 'char', glitch = false, glow = 0, halftone = 1, flap = null, lamp = null }) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...fogUniforms(),
      uLit: { value: new THREE.Color(lit) },
      uMid: { value: new THREE.Color(mid) },
      uShade: { value: new THREE.Color(shade) },
      uLightDir: shared.uLightDir,
      uTint: tint === 'env' ? shared.uEnvTint : tint === 'char' ? shared.uCharTint : WHITE,
      uTime: shared.uTime,
      uT1: { value: t1 },
      uT2: { value: t2 },
      uGlow: glow && glow.isUniform ? glow : { value: glow },
      uHalftone: { value: halftone },
      uFlap: { value: new THREE.Vector4(flap?.pivot?.[0] ?? 0, flap?.pivot?.[1] ?? 0, flap?.amp ?? 0, flap?.rate ?? 0) },
      uFlapBias: { value: flap?.bias ?? 0 },
      uLamp: lamp && lamp.isUniform ? lamp : { value: lamp ?? 0 },
    },
    vertexShader: TOON_VERT,
    fragmentShader: TOON_FRAG,
    vertexColors,
    fog,
  });
  const defines = {};
  if (glitch) defines.GLITCH = '';
  if (flap) defines.FLAP = '';
  if (lamp !== null) defines.LAMP = '';
  m.defines = defines;
  return m;
}

/**
 * Cartoon material whose colour comes from vertex or instance colours: the
 * three bands are white / light grey / grey, multiplied by the colour. Used
 * for instanced scenery, where each instance has its own tint.
 */
export function tintToonMaterial({ shade = 0.74, mid = 0.92, t1 = 0.72, t2 = 0.05, tint = 'env', glitch = false, glow = 0, halftone = 1, flap = null, lamp = null } = {}) {
  const grey = (v) => new THREE.Color().setRGB(v, v, v, THREE.SRGBColorSpace);
  return toonMaterial({ lit: grey(1), mid: grey(mid), shade: grey(shade), t1, t2, vertexColors: true, tint, glitch, glow, halftone, flap, lamp });
}

/* A shared uniform object that several materials can point at (e.g. one glow level). */
export const uniform = (value) => ({ value, isUniform: true });

/**
 * Makes a plain (MeshBasic) material glow by `glow` (a shared uniform, 0..1):
 * it writes the glow note into alpha for the post effects.
 */
export function makeGlowing(material, glow) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlow = glow;
    shader.fragmentShader = `uniform float uGlow;\n${shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      '#include <dithering_fragment>\n  gl_FragColor.a = uGlow > 0.0 ? 0.5 - 0.5 * uGlow : 1.0;',
    )}`;
  };
  material.customProgramCacheKey = () => 'glowing';
  return material;
}

/** Blending for see-through things: colour blends as usual, the alpha note is left alone. */
export function keepNote(material, additive = false) {
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.SrcAlphaFactor;
  material.blendDst = additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = THREE.ZeroFactor;
  material.blendDstAlpha = THREE.OneFactor;
  material.transparent = true;
  material.depthWrite = false;
  return material;
}

/**
 * Blending for small see-through things that glow (sparkle bursts, shards):
 * every pixel they cover is marked as glowing (alpha note 0). Only for small
 * things: a partial note would read as "shaded band" and get halftone dots.
 */
export function glowNote(material, additive = false) {
  keepNote(material, additive);
  material.blendDstAlpha = THREE.ZeroFactor;
  return material;
}

const OUTLINE_VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform float uWidth;   // in world units at scale 1
uniform float uMinPx;   // never thinner than this many pixels
uniform float uResY;
void main() {
  vec3 objectNormal = normal;
  #ifdef USE_INSTANCING
    objectNormal = mat3(instanceMatrix) * objectNormal;
  #endif
  vec3 n = normalize(normalMatrix * objectNormal);
  #include <begin_vertex>
  #include <project_vertex>
  float pxSize = 2.0 * max(-mvPosition.z, 0.01) / (projectionMatrix[1][1] * uResY);
  float w = max(uWidth, uMinPx * pxSize);
  mvPosition.xyz += n * w;
  mvPosition.z -= w * 0.5;                       // tuck behind so it never covers the fill
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const OUTLINE_FRAG = /* glsl */ `
uniform vec3 uColor;
#include <fog_pars_fragment>
void main() {
  gl_FragColor = vec4(uColor, 1.0);
  #include <fog_fragment>
  #include <colorspace_fragment>
}`;

const INK = '#0C0E0F';

/** Ink outline material: draws back faces pushed out along the normal. */
export function outlineMaterial(width = 0.07, minPx = 1.5, color = INK) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...fogUniforms(),
      uWidth: { value: width },
      uMinPx: { value: minPx },
      uResY: shared.uResY,
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: OUTLINE_VERT,
    fragmentShader: OUTLINE_FRAG,
    side: THREE.BackSide,
    fog: true,
  });
}

/**
 * Ink outline for an InstancedMesh: a second InstancedMesh that shares the
 * instance matrices, drawn from a welded copy of the geometry (smooth normals,
 * so the line doesn't split at hard corners). Keep `hull.count` in step.
 * `shape` (optional) is the geometry to outline instead of the mesh's own,
 * e.g. a bug without its beating wings, which would leave the line behind.
 */
export function instancedOutline(mesh, material, shape = null) {
  const geo = weld((shape || mesh.geometry).clone(), 1e-4);
  if (shape) shape.dispose();
  const hull = new THREE.InstancedMesh(geo, material, mesh.instanceMatrix.count);
  hull.instanceMatrix = mesh.instanceMatrix;
  hull.count = mesh.count;
  hull.frustumCulled = false;
  hull.name = mesh.name + ':outline';
  mesh.userData.hull = hull;
  return hull;
}

/** Adds the outline copy as a child of `mesh` (shares its geometry, so it costs no memory). */
export function addOutline(mesh, material) {
  const hull = new THREE.Mesh(mesh.geometry, material);
  hull.name = (mesh.name || 'mesh') + ':outline';
  hull.renderOrder = mesh.renderOrder;
  mesh.add(hull);
  return hull;
}

/** Unlit flat colour (sunglasses, smile, eyes): uses vertex colours. */
export function inkMaterial() {
  return new THREE.MeshBasicMaterial({ vertexColors: true });
}

/* ---------------------------------------------------------------------------
   Geometry helpers
   --------------------------------------------------------------------------- */

/**
 * Parses an absolute SVG path (M, L, H, V, C, Q, Z) into THREE.Shapes.
 * `map(x, y)` converts SVG coordinates to model units and returns [x, y].
 */
export function pathToShapes(d, map) {
  const tokens = d.match(/[MLHVCQZmlhvcqz]|-?\d*\.?\d+(?:e-?\d+)?/g);
  const shapes = [];
  let shape = null;
  let i = 0;
  let cx = 0;
  let cy = 0;
  let cmd = '';
  const num = () => parseFloat(tokens[i++]);
  const pt = (x, y) => map(x, y);
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[A-Za-z]/.test(t)) {
      cmd = t;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        if (shape) shape.closePath();
        continue;
      }
    }
    switch (cmd) {
      case 'M': {
        cx = num(); cy = num();
        shape = new THREE.Shape();
        shapes.push(shape);
        shape.moveTo(...pt(cx, cy));
        cmd = 'L';
        break;
      }
      case 'L': cx = num(); cy = num(); shape.lineTo(...pt(cx, cy)); break;
      case 'H': cx = num(); shape.lineTo(...pt(cx, cy)); break;
      case 'V': cy = num(); shape.lineTo(...pt(cx, cy)); break;
      case 'C': {
        const x1 = num(), y1 = num(), x2 = num(), y2 = num();
        cx = num(); cy = num();
        shape.bezierCurveTo(...pt(x1, y1), ...pt(x2, y2), ...pt(cx, cy));
        break;
      }
      case 'Q': {
        const x1 = num(), y1 = num();
        cx = num(); cy = num();
        shape.quadraticCurveTo(...pt(x1, y1), ...pt(cx, cy));
        break;
      }
      default:
        throw new Error('pathToShapes: unsupported command ' + cmd);
    }
  }
  return shapes;
}

/**
 * The brand's 4-point sparkle (the one beside the mascot): an upright star
 * with pinched, curved sides. w, h: full width and height; pinch: how close
 * the curves pull to the centre (smaller = thinner points).
 */
export function sparkleShape(w = 0.4, h = 0.56, pinch = 0.06) {
  const x = w / 2, y = h / 2, p = pinch;
  const s = new THREE.Shape();
  s.moveTo(0, y);
  s.quadraticCurveTo(p, p, x, 0);
  s.quadraticCurveTo(p, -p, 0, -y);
  s.quadraticCurveTo(-p, -p, -x, 0);
  s.quadraticCurveTo(-p, p, 0, y);
  return s;
}

/**
 * Welds vertices that share a position and recomputes smooth normals.
 * The outline needs one normal per corner, or it splits open at hard edges.
 * Keeps only the position attribute.
 */
export function weld(geometry, tolerance = 1e-4) {
  const src = geometry.attributes.position;
  const srcIndex = geometry.index ? geometry.index.array : null;
  const count = srcIndex ? srcIndex.length : src.count;
  const map = new Map();
  const positions = [];
  const index = [];
  const inv = 1 / tolerance;
  for (let k = 0; k < count; k++) {
    const v = srcIndex ? srcIndex[k] : k;
    const x = src.getX(v), y = src.getY(v), z = src.getZ(v);
    const key = Math.round(x * inv) + ',' + Math.round(y * inv) + ',' + Math.round(z * inv);
    let id = map.get(key);
    if (id === undefined) {
      id = positions.length / 3;
      positions.push(x, y, z);
      map.set(key, id);
    }
    index.push(id);
  }
  const clean = [];
  for (let k = 0; k < index.length; k += 3) {
    const a = index[k], b = index[k + 1], c = index[k + 2];
    if (a !== b && b !== c && a !== c) clean.push(a, b, c);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  out.setIndex(clean);
  out.computeVertexNormals();
  geometry.dispose();
  return out;
}

/**
 * Splits triangles until no edge is longer than maxEdge (longest edge first,
 * winding kept). Flat decals need this before they are bent onto a curved
 * surface, or their big triangles cut through the bulge. Keeps positions only.
 */
export function subdivide(geometry, maxEdge) {
  const src = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = src.attributes.position.array;
  const out = [];
  const max2 = maxEdge * maxEdge;
  const d2 = (t, i, j) => (t[i] - t[j]) ** 2 + (t[i + 1] - t[j + 1]) ** 2 + (t[i + 2] - t[j + 2]) ** 2;
  const mid = (t, i, j) => [(t[i] + t[j]) / 2, (t[i + 1] + t[j + 1]) / 2, (t[i + 2] + t[j + 2]) / 2];
  const stack = [];
  for (let i = 0; i < p.length; i += 9) {
    stack.push(Array.prototype.slice.call(p, i, i + 9));
    while (stack.length) {
      const t = stack.pop();
      const e0 = d2(t, 0, 3), e1 = d2(t, 3, 6), e2 = d2(t, 6, 0);
      const m = Math.max(e0, e1, e2);
      if (m <= max2) { out.push(...t); continue; }
      const a = t.slice(0, 3), b = t.slice(3, 6), c = t.slice(6, 9);
      if (m === e0) { const q = mid(t, 0, 3); stack.push([...a, ...q, ...c], [...q, ...b, ...c]); }
      else if (m === e1) { const q = mid(t, 3, 6); stack.push([...a, ...b, ...q], [...a, ...q, ...c]); }
      else { const q = mid(t, 6, 0); stack.push([...a, ...b, ...q], [...q, ...b, ...c]); }
    }
  }
  if (src !== geometry) src.dispose();
  geometry.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return g;
}

/**
 * Merges geometries into one, painting each with a flat vertex colour.
 * parts: [{ geometry, color, flag?, wing?, lamp? }]. Output has position,
 * normal, color, index, and one float per vertex for each of these that any
 * part sets: aFlag (glitch shimmer), aWing (-1/+1 beats like a wing),
 * aLamp (glows).
 */
const PART_ATTRIBUTES = { flag: 'aFlag', wing: 'aWing', lamp: 'aLamp' };
export function mergeColored(parts) {
  const pos = [];
  const nor = [];
  const col = [];
  const idx = [];
  const c = new THREE.Color();
  let base = 0;
  const used = Object.keys(PART_ATTRIBUTES).filter((k) => parts.some((p) => p[k]));
  const extra = Object.fromEntries(used.map((k) => [k, []]));
  for (const part of parts) {
    const { geometry: g, color } = part;
    if (!g.attributes.normal) g.computeVertexNormals();
    c.set(color);
    const p = g.attributes.position;
    const n = g.attributes.normal;
    for (let v = 0; v < p.count; v++) {
      pos.push(p.getX(v), p.getY(v), p.getZ(v));
      nor.push(n.getX(v), n.getY(v), n.getZ(v));
      col.push(c.r, c.g, c.b);
      for (const k of used) extra[k].push(part[k] || 0);
    }
    if (g.index) for (let k = 0; k < g.index.count; k++) idx.push(base + g.index.getX(k));
    else for (let k = 0; k < p.count; k++) idx.push(base + k);
    base += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  for (const k of used) out.setAttribute(PART_ATTRIBUTES[k], new THREE.Float32BufferAttribute(extra[k], 1));
  out.setIndex(idx);
  return out;
}

/** Soft round floor shadow: a small radial-gradient texture, made once. */
let blobTexture = null;
export function blobShadowTexture() {
  if (blobTexture) return blobTexture;
  const size = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(12,14,15,1)');
  grad.addColorStop(0.45, 'rgba(12,14,15,0.75)');
  grad.addColorStop(1, 'rgba(12,14,15,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  blobTexture = new THREE.CanvasTexture(cv);
  blobTexture.colorSpace = THREE.SRGBColorSpace;
  return blobTexture;
}

/** A flat soft shadow that lies on the floor (y = 0) under an object. */
export function makeBlobShadow(radius = 1, opacity = 0.3) {
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: blobShadowTexture(),
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = 0.01;
  m.renderOrder = -1;
  m.name = 'blobShadow';
  return m;
}

/* ---------------------------------------------------------------------------
   Comic text popups in 3D, always facing the camera
   --------------------------------------------------------------------------- */
const INK_HEX = '#0C0E0F';
const TAPE_HEX = '#FFE23A';

/** A jagged starburst, the speech bubble of the reference panel (COMPILE!, BUG BASH!). */
function burstPath(g, cx, cy, rx, ry, spikes, seed) {
  g.beginPath();
  for (let i = 0; i <= spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const k = i % 2 === 0 ? 1 : 0.8 + 0.06 * Math.sin(i * 7.1 + seed);
    const x = cx + Math.cos(a) * rx * k;
    const y = cy + Math.sin(a) * ry * k;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}

function popupTexture(text, style) {
  const font = (px) => `${px}px Bangers, Impact, "Arial Black", sans-serif`;
  const cv = document.createElement('canvas');
  const g = cv.getContext('2d');
  const size = 100; // px; the sprite's size on screen is set separately (there are ~25 of these, cached)
  g.font = font(size);
  const tw = Math.ceil(g.measureText(text).width);
  if (style === 'burst') {
    cv.width = tw + 200;
    cv.height = size + 170;
  } else {
    cv.width = tw + 60;
    cv.height = size + 60;
  }
  const w = cv.width, h = cv.height;
  g.font = font(size);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  if (style === 'burst') {
    burstPath(g, w / 2, h / 2, w / 2 - 10, h / 2 - 10, 14, text.length);
    g.fillStyle = '#FFFFFF';
    g.fill();
    g.lineWidth = 9;
    g.strokeStyle = INK_HEX;
    g.stroke();
    g.fillStyle = INK_HEX;
    g.fillText(text, w / 2, h / 2 + 6);
  } else {
    g.lineWidth = 22;
    g.strokeStyle = INK_HEX;
    g.fillStyle = INK_HEX;
    g.strokeText(text, w / 2 + 6, h / 2 + 9); // offset ink shadow
    g.fillText(text, w / 2 + 6, h / 2 + 9);
    g.strokeText(text, w / 2, h / 2 + 3);
    g.fillStyle = TAPE_HEX;
    g.fillText(text, w / 2, h / 2 + 3);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return { texture: t, aspect: w / h };
}

export class ComicPopups {
  constructor(scene, { max = 4, reducedMotion = false } = {}) {
    this.cache = new Map();
    this.reduced = reducedMotion;
    this.items = [];
    for (let i = 0; i < max; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false }));
      s.visible = false;
      s.renderOrder = 1000;
      scene.add(s);
      this.items.push({ sprite: s, t: 0, life: 0 });
    }
  }

  texture(text, style) {
    const key = style + ':' + text;
    if (!this.cache.has(key)) this.cache.set(key, popupTexture(text, style));
    return this.cache.get(key);
  }

  /**
   * @param {string} text
   * @param {object} o
   * @param {THREE.Vector3} o.position world position
   * @param {'shout'|'burst'} [o.style]
   * @param {number} [o.size] height in metres
   * @param {number} [o.life] seconds
   */
  show(text, { position, style = 'shout', size = 0.9, life = 1.1, rise = 0.5, tilt = -0.08 }) {
    // a free sprite, or else the one closest to finishing
    const it = this.items.find((x) => !x.sprite.visible)
      || this.items.reduce((a, b) => (b.t / b.life > a.t / a.life ? b : a));
    const { texture, aspect } = this.texture(text, style);
    const s = it.sprite;
    s.material.map = texture;
    s.material.rotation = tilt;
    s.material.opacity = 1;
    s.material.needsUpdate = true;
    s.position.copy(position);
    s.visible = true;
    Object.assign(it, { t: 0, life, size, aspect, rise, base: position.clone() });
    return it;
  }

  update(dt) {
    for (const it of this.items) {
      if (!it.sprite.visible) continue;
      it.t += dt;
      const p = it.t / it.life;
      if (p >= 1) { it.sprite.visible = false; continue; }
      // pop in with a little overshoot, hold, then fade
      const a = Math.min(it.t / 0.16, 1);
      const pop = this.reduced ? a : a < 1 ? 1 + 2.7 * (a - 1) ** 3 + 1.7 * (a - 1) ** 2 : 1;
      const k = it.size * Math.max(0.01, pop);
      it.sprite.scale.set(k * it.aspect, k, 1);
      it.sprite.position.set(it.base.x, it.base.y + it.rise * p, it.base.z);
      it.sprite.material.opacity = p > 0.75 ? 1 - (p - 0.75) / 0.25 : 1;
    }
  }

  clear() {
    for (const it of this.items) it.sprite.visible = false;
  }
}

/* ---------------------------------------------------------------------------
   Coffee shield: a soft bubble, bright at its rim
   --------------------------------------------------------------------------- */
export function shieldMaterial(color = '#FFE23A') {
  return keepNote(new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 }, uTime: shared.uTime },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float rim = smoothstep(0.45, 0.95, f);
        float bands = 0.5 + 0.5 * sin(f * 18.0 - uTime * 4.0);
        float a = (0.08 + rim * 0.75 + rim * bands * 0.15) * uOpacity;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  }));
}

/* ---------------------------------------------------------------------------
   Particles: one point cloud per blend kind, drawn in a single call.
   Shapes: 0 soft puff (dust, steam), 1 four-point sparkle, 2 confetti/shard,
   3 heart, 4 square pixel (the last two for the shop's trails).
   --------------------------------------------------------------------------- */
const PARTICLE_VERT = /* glsl */ `
attribute float aSize;
attribute float aAngle;
attribute float aShape;
attribute float aAlpha;   // (colour comes from three's own 'color' attribute)
uniform float uScale;
uniform float uMaxSize;
varying vec3 vColor;
varying float vAngle;
varying float vShape;
varying float vAlpha;
void main() {
  vColor = color;
  vAngle = aAngle;
  vShape = aShape;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(uMaxSize, aSize * uScale / max(0.2, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;
const PARTICLE_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAngle;
varying float vShape;
varying float vAlpha;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float c = cos(vAngle), s = sin(vAngle);
  p = mat2(c, -s, s, c) * p;
  float a;
  if (vShape < 0.5) {
    a = smoothstep(1.0, 0.25, length(p));
  } else if (vShape < 1.5) {
    vec2 q = abs(p);
    a = smoothstep(1.0, 0.82, pow(q.x, 0.5) + pow(q.y, 0.5));
  } else if (vShape < 2.5) {
    vec2 q = abs(p);
    a = (1.0 - smoothstep(0.78, 0.86, q.x)) * (1.0 - smoothstep(0.42, 0.5, q.y));
  } else if (vShape < 3.5) {
    // a heart (Inigo Quilez's distance), point up
    vec2 h = vec2(abs(p.x), -p.y) * 0.66 + vec2(0.0, 0.55);
    float d = h.y + h.x > 1.0
      ? length(h - vec2(0.25, 0.75)) - 0.35355
      : sqrt(min(dot(h - vec2(0.0, 1.0), h - vec2(0.0, 1.0)), dot(h - 0.5 * max(h.x + h.y, 0.0), h - 0.5 * max(h.x + h.y, 0.0)))) * sign(h.x - h.y);
    a = 1.0 - smoothstep(-0.03, 0.02, d);
  } else {
    // a square pixel, hard edged
    vec2 q = abs(p);
    a = (1.0 - smoothstep(0.74, 0.8, q.x)) * (1.0 - smoothstep(0.74, 0.8, q.y));
  }
  a *= vAlpha;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vColor, a);
  #include <colorspace_fragment>
}`;

export class Particles {
  /**
   * @param {THREE.Scene} scene
   * @param {object} o
   * @param {number} o.max   most particles alive at once
   * @param {boolean} o.glow whether they glow (sparkle bursts, shards)
   */
  constructor(scene, { max = 300, glow = false } = {}) {
    this.max = max;
    this.limit = max;
    this.list = [];
    this.free = [];
    const g = new THREE.BufferGeometry();
    this.attr = {
      position: new THREE.BufferAttribute(new Float32Array(max * 3), 3),
      color: new THREE.BufferAttribute(new Float32Array(max * 3), 3),
      aSize: new THREE.BufferAttribute(new Float32Array(max), 1),
      aAngle: new THREE.BufferAttribute(new Float32Array(max), 1),
      aShape: new THREE.BufferAttribute(new Float32Array(max), 1),
      aAlpha: new THREE.BufferAttribute(new Float32Array(max), 1),
    };
    for (const [k, v] of Object.entries(this.attr)) { v.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, v); }
    g.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 }, uMaxSize: { value: 256 } },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      vertexColors: true,
    });
    if (glow) glowNote(mat); else keepNote(mat);
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.points.name = glow ? 'particles:glow' : 'particles';
    scene.add(this.points);
    this.color = new THREE.Color();
  }

  /** Pixels per metre at distance 1 (call on resize) and the GPU's largest point size. */
  setView(heightPx, fovDeg, maxPointSize = 256) {
    this.points.material.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.points.material.uniforms.uMaxSize.value = maxPointSize;
  }

  /** How many may be alive (quality level scales it). */
  setBudget(fraction) {
    this.limit = Math.max(16, Math.floor(this.max * fraction));
  }

  /**
   * p: { x, y, z, vx, vy, vz, color, size, life, shape, gravity, drag, spin, grow, angle }
   */
  spawn(p) {
    if (this.list.length >= this.limit) return;
    const o = this.free.pop() || {};
    o.x = p.x; o.y = p.y; o.z = p.z;
    o.vx = p.vx || 0; o.vy = p.vy || 0; o.vz = p.vz || 0;
    this.color.set(p.color || '#FFFFFF');
    o.r = this.color.r; o.g = this.color.g; o.b = this.color.b;
    o.size = p.size || 0.2;
    o.life = p.life || 1;
    o.t = 0;
    o.shape = p.shape || 0;
    o.gravity = p.gravity || 0;
    o.drag = p.drag || 0;
    o.spin = p.spin || 0;
    o.grow = p.grow || 0;
    o.angle = p.angle ?? Math.random() * Math.PI * 2;
    o.fade = p.fade ?? 0.4;
    this.list.push(o);
  }

  update(dt) {
    const A = this.attr;
    let n = 0;
    const keep = [];
    for (const o of this.list) {
      o.t += dt;
      if (o.t >= o.life) { this.free.push(o); continue; }
      o.vy -= o.gravity * dt;
      if (o.drag) { const k = Math.exp(-o.drag * dt); o.vx *= k; o.vy *= k; o.vz *= k; }
      o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
      o.angle += o.spin * dt;
      const u = o.t / o.life;
      const alpha = Math.min(1, o.t / 0.06) * (u > 1 - o.fade ? (1 - u) / o.fade : 1);
      A.position.array[n * 3] = o.x; A.position.array[n * 3 + 1] = o.y; A.position.array[n * 3 + 2] = o.z;
      A.color.array[n * 3] = o.r; A.color.array[n * 3 + 1] = o.g; A.color.array[n * 3 + 2] = o.b;
      A.aSize.array[n] = o.size * (1 + o.grow * u);
      A.aAngle.array[n] = o.angle;
      A.aShape.array[n] = o.shape;
      A.aAlpha.array[n] = alpha;
      keep.push(o);
      n++;
    }
    this.list = keep;
    for (const k in A) { A[k].needsUpdate = true; A[k].clearUpdateRanges(); A[k].addUpdateRange(0, n * A[k].itemSize); }
    this.points.geometry.setDrawRange(0, n);
  }

  clear() {
    for (const o of this.list) this.free.push(o);
    this.list = [];
    this.points.geometry.setDrawRange(0, 0);
  }
}
