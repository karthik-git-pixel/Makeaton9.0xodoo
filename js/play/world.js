/**
 * Run-A-Ton · world.js
 * The hackathon hall (after assets/timeline/panel-6.png): an arched hall with
 * balconies, rows of tables with laptops either side of a centre aisle, hanging
 * lamps, side banners, and the demo stage with a big screen at the end.
 *
 * Built once from reusable pieces drawn as instances. Everything in the hall
 * repeats every PERIOD metres, so scrolling is just moving one group by
 * (distance mod PERIOD): no per-frame matrix updates. The stage is fixed at
 * the end of the aisle and hides whatever lies behind it.
 *
 * Units are metres. The player runs towards -z; lanes are along x.
 */
import * as THREE from 'three';
import {
  tintToonMaterial, toonMaterial, mergeColored, shared, uniform, makeGlowing, keepNote,
  outlineMaterial, instancedOutline,
} from './fx.js';

export const LANE_W = 1.7;
export const LANES = [-LANE_W, 0, LANE_W];

export const HALL = {
  period: 24,       // everything in the hall repeats every 24 m
  bay: 6,           // pillar spacing
  zNear: 12,        // hall pieces from just behind the camera...
  zFar: -126,       // ...to past the stage (covers any scroll offset)
  stageZ: -100,     // front of the stage wall
  wallX: 10.4,
  aisleHalf: 2.75,
  vaultY: 9,        // where the vault springs from the walls
};

const C = {
  floor: '#B98E5E',
  carpet: '#39466A',
  seam: '#52618C',
  tape: '#FFE23A',
  wood: '#C99A62',
  metal: '#4B515C',
  laptop: '#9AA3B0',
  screen: '#D6E9FF',
  chair: '#2F3644',
  stone: '#DCCAA6',
  stoneDark: '#B8A47E',
  wall: '#CDB991',
  window: '#FFE2A8',
  vault: '#8E8576',
  rib: '#BFAE8A',
  lamp: '#2D3138',
  bulb: '#FFF3C4',
  ink: '#0C0E0F',
  purple: '#7B4FC2',
  stage: '#5A3A2A',
  bigScreen: '#CFE6FF',
  blue: '#4080FB',
  red: '#EF4225',
};

const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/* ---------------------------------------------------------------------------
   Time of day. Key colours by game hour, blended in between:
     0-6   warm golden afternoon light through the windows
     6-12  dusk: laptop screens switch on
     12-18 dead of night: deep blue and purple, dimmer
     18-22 dawn: pink and gold
     22-24 stage lights (demo time)
     24-25 back to the next afternoon (the run is endless: the day loops)
   fog: haze and background; env: tint on the hall; char: lighter tint on the
   star, obstacles and pickups; window: the sky; screen: laptop screens.
   --------------------------------------------------------------------------- */
const TIME_KEYS = [
  { h: 0, fog: '#EFD9AF', env: '#FFF6E6', char: '#FFFFFF', window: '#FFE7A8', screen: '#7E8B9C', big: '#CFE6FF' },
  { h: 5, fog: '#F2C98F', env: '#FFE7C2', char: '#FFF8EE', window: '#FFCF74', screen: '#7E8B9C', big: '#CFE6FF' },
  { h: 7, fog: '#DB8E7C', env: '#E8B9A8', char: '#F8E6E0', window: '#FF8F6B', screen: '#C7E6FF', big: '#D9ECFF' },
  { h: 10, fog: '#7C5281', env: '#B99AB9', char: '#ECDDED', window: '#6F4B8F', screen: '#CFE9FF', big: '#D9ECFF' },
  { h: 13, fog: '#1F2149', env: '#6F74B6', char: '#BCC0EC', window: '#19214A', screen: '#BFE3FF', big: '#BFE3FF' },
  { h: 17, fog: '#2B2652', env: '#7B76B6', char: '#C4C0EC', window: '#2A2559', screen: '#BFE3FF', big: '#BFE3FF' },
  { h: 19, fog: '#E2A0B4', env: '#E9B6C5', char: '#F8E4EC', window: '#FFB9C7', screen: '#CFE9FF', big: '#D9ECFF' },
  { h: 21, fog: '#F1C592', env: '#F6DBBE', char: '#FFF5EC', window: '#FFE09E', screen: '#CFE9FF', big: '#E3F1FF' },
  { h: 22.5, fog: '#3B2350', env: '#A48BC6', char: '#FFFFFF', window: '#3A2A5E', screen: '#D9EEFF', big: '#FFFFFF' },
  { h: 24, fog: '#3B2350', env: '#A48BC6', char: '#FFFFFF', window: '#3A2A5E', screen: '#D9EEFF', big: '#FFFFFF' },
  { h: 25, fog: '#EFD9AF', env: '#FFF6E6', char: '#FFFFFF', window: '#FFE7A8', screen: '#7E8B9C', big: '#CFE6FF' },
].map((k) => {
  const o = { h: k.h };
  for (const key of Object.keys(k)) if (key !== 'h') o[key] = new THREE.Color(k[key]);
  return o;
});
const TIME_FIELDS = ['fog', 'env', 'char', 'window', 'screen', 'big'];
/* Light through the windows: gold afternoon, orange sunset, pink-gold dawn */
const BEAM_A = new THREE.Color('#FFD98A');
const BEAM_B = new THREE.Color('#FF9A5C');
const BEAM_C = new THREE.Color('#FFB6B0');

/** One InstancedMesh from a list of placements: { x, y, z, rx, ry, rz, s|sx|sy|sz, color }. */
function instanced(geometry, material, items, name) {
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const o = new THREE.Object3D();
  const c = new THREE.Color();
  items.forEach((it, i) => {
    o.position.set(it.x || 0, it.y || 0, it.z || 0);
    o.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
    const s = it.s ?? 1;
    o.scale.set(it.sx ?? s, it.sy ?? s, it.sz ?? s);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    mesh.setColorAt(i, c.set(it.color || '#FFFFFF'));
  });
  mesh.frustumCulled = false; // it spans the whole hall anyway
  mesh.name = name;
  return mesh;
}

/** Positions along z for a repeating piece, covering the hall's span. */
function along(step, offset = 0) {
  const out = [];
  for (let z = HALL.zNear - offset; z >= HALL.zFar; z -= step) out.push(z);
  return out;
}

/* ---------------------------------------------------------------------------
   Canvas textures (made once, small)
   --------------------------------------------------------------------------- */
function canvasTexture(w, h, draw, { repeat = null, srgb = true } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Wood planks, one tile = 2 m x 2 m. */
function floorTexture(anisotropy) {
  const t = canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = C.floor;
    g.fillRect(0, 0, w, h);
    const tones = ['#B4895A', '#BF9464', '#B08455', '#C49A69'];
    for (let i = 0; i < 4; i++) {
      g.fillStyle = tones[i];
      g.fillRect(i * 32, 0, 32, h);
      g.fillStyle = 'rgba(60,35,15,0.35)';
      g.fillRect(i * 32, 0, 2, h);
      g.fillRect(i * 32, ((i * 53) % h), 32, 2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  return t;
}

/** A symbol banner from the stage in the reference (blue with "</>", red with "{ }"). */
function symbolBanner(symbol, color) {
  return canvasTexture(128, 384, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#FFFFFF';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = 'bold 56px ui-monospace, Menlo, Consolas, monospace';
    g.fillText(symbol, w / 2, h * 0.42);
  });
}

/** The stage's big screen: deep blue with the real logo (drawn in when it loads). */
function logoScreenTexture() {
  const draw = (g, w, h, logo) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#2A3E8F');
    grad.addColorStop(1, '#15204F');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 2);
    if (logo) {
      const lw = w * 0.78;
      const lh = (lw * logo.height) / logo.width;
      g.drawImage(logo, (w - lw) / 2, (h - lh) / 2, lw, lh);
    }
  };
  const t = canvasTexture(1024, 576, (g, w, h) => draw(g, w, h, null));
  const img = new Image();
  img.onload = () => { draw(t.image.getContext('2d'), t.image.width, t.image.height, img); t.needsUpdate = true; };
  img.src = 'assets/play/logo-640.webp';
  return t;
}

/* ---------------------------------------------------------------------------
   The hall
   --------------------------------------------------------------------------- */
export class World {
  /**
   * @param {THREE.Scene} scene
   * @param {object} opts
   * @param {object} opts.quality  quality settings (rows of tables, anisotropy)
   * @param {number} opts.anisotropy
   */
  constructor(scene, { quality, anisotropy = 1 }) {
    this.scene = scene;
    this.quality = quality;
    this.anisotropy = anisotropy;
    this.hall = new THREE.Group();   // the repeating part: scrolls
    this.hall.name = 'hall';
    this.fixed = new THREE.Group();  // the stage: fixed at the end
    this.fixed.name = 'stage';
    scene.add(this.hall, this.fixed);

    this.tint = tintToonMaterial();
    // How strongly each kind of light glows (set by the time of day)
    this.glow = {
      screens: uniform(0), windows: uniform(0), bulbs: uniform(0), big: uniform(0.5), neon: uniform(0),
    };
    this.lights = { beams: 0, stage: 0, cheer: 0, neon: 0 };
    this.build();
    this.collectTintables();
    // The hall's pieces never move relative to their group: skip their per-frame matrix updates
    for (const root of [this.hall, this.fixed]) {
      root.traverse((o) => { if (o !== root) { o.updateMatrix(); o.matrixAutoUpdate = false; } });
    }
    this.palette = {};
    for (const f of TIME_FIELDS) this.palette[f] = new THREE.Color();
    this.lastHour = -1;
  }

  /** Plain (unlit) materials in the hall that take the time-of-day tint. */
  collectTintables() {
    const skip = new Set([this.windows.material, this.screens.material, this.bigScreen.material, this.bulbs.material]);
    this.tintables = [];
    const seen = new Set();
    for (const root of [this.hall, this.fixed]) {
      root.traverse((o) => {
        const m = o.material;
        if (!o.isMesh || !m || !m.isMeshBasicMaterial || skip.has(m) || seen.has(m)) return;
        seen.add(m);
        this.tintables.push({ material: m, base: m.color.clone() });
      });
    }
  }

  /**
   * Sets the light and colour for a game hour (0..25, where 24-25 eases back
   * into the next afternoon): fog and background, the tints on everything,
   * the windows' sky and the laptop screens.
   */
  setTime(hours) {
    const h = Math.max(0, Math.min(25, hours));
    if (Math.abs(h - this.lastHour) < 0.005) return;
    this.lastHour = h;
    let i = 0;
    while (i < TIME_KEYS.length - 2 && h >= TIME_KEYS[i + 1].h) i++;
    const a = TIME_KEYS[i];
    const b = TIME_KEYS[i + 1];
    const t = Math.max(0, Math.min(1, (h - a.h) / (b.h - a.h)));
    const k = t * t * (3 - 2 * t);
    const P = this.palette;
    for (const f of TIME_FIELDS) P[f].lerpColors(a[f], b[f], k);
    this.scene.fog.color.copy(P.fog);
    if (this.scene.background && this.scene.background.isColor) this.scene.background.copy(P.fog);
    shared.uEnvTint.value.copy(P.env);
    shared.uCharTint.value.copy(P.char);
    for (const { material, base } of this.tintables) material.color.copy(base).multiply(P.env);
    this.windows.material.color.copy(P.window);
    this.screens.material.color.copy(P.screen);
    this.bigScreen.material.color.copy(P.big);

    /* Lights by the hour */
    const ss = (a0, a1, x) => { const u = Math.max(0, Math.min(1, (x - a0) / (a1 - a0))); return u * u * (3 - 2 * u); };
    const G = this.glow;
    const back = ss(24, 25, h);                                               // the next afternoon arriving
    G.screens.value = 0.9 * ss(5.5, 7, h) * (1 - back);                       // laptops light up at dusk
    G.bulbs.value = (ss(8.5, 11, h) * (1 - ss(20, 21.5, h)) + 0.6 * ss(22, 22.6, h)) * (1 - back);
    G.windows.value = 0.45 * (1 - ss(4.5, 7.5, h)) + 0.5 * ss(4.5, 6.5, h) * (1 - ss(7, 9, h)) + 0.55 * ss(18.3, 19.5, h) * (1 - ss(21, 22.2, h)) + 0.45 * back;
    G.big.value = 0.45 + (0.35 * ss(8, 12, h) + 0.2 * ss(22, 22.5, h)) * (1 - back);
    // Neon signs switch on at 06:00 with a couple of slow flickers (well under 3 a second), off again next afternoon
    let neon = ss(6, 6.05, h) * (1 - ss(24.2, 24.6, h));
    if (h > 6 && h < 6.3) neon *= (h > 6.1 && h < 6.14) || (h > 6.2 && h < 6.23) ? 0.15 : 1;
    G.neon.value = neon;
    this.lights.neon = neon;
    if (this.neon) this.neon.material.uniforms.uOn.value = neon;
    // Light through the windows: gold afternoon, orange sunset, pink-gold dawn
    const beamA = 0.55 * (1 - ss(5, 7.5, h)) + 0.55 * ss(24.3, 25, h);
    const beamB = 0.5 * ss(5, 6.5, h) * (1 - ss(7, 8.5, h));
    const beamC = 0.55 * ss(18.4, 19.4, h) * (1 - ss(21.2, 22.2, h));
    this.lights.beams = beamA + beamB + beamC;
    if (this.beams) {
      const u = this.beams.material.uniforms;
      u.uStrength.value = this.lights.beams;
      const c = u.uColor.value.setRGB(0, 0, 0);
      c.r = BEAM_A.r * beamA + BEAM_B.r * beamB + BEAM_C.r * beamC;
      c.g = BEAM_A.g * beamA + BEAM_B.g * beamB + BEAM_C.g * beamC;
      c.b = BEAM_A.b * beamA + BEAM_B.b * beamB + BEAM_C.b * beamC;
      c.multiplyScalar(1 / Math.max(0.001, this.lights.beams));
      this.beams.visible = this.beamsAllowed && this.lights.beams > 0.01;
    }
    this.bulbs.material.color.setHex(G.bulbs.value > 0.05 ? 0xFFE7A0 : 0xCFC7B4);
    // Demo time: stage lights and a cheering crowd (until the next afternoon)
    this.lights.stage = ss(21.6, 22.4, h) * (1 - ss(23.8, 24.5, h));
    this.lights.cheer = ss(21.8, 22.5, h) * (1 - ss(23.7, 24.2, h));
    if (this.stageLights) {
      this.stageLights.visible = this.lights.stage > 0.01;
      this.stageLights.material.uniforms.uStrength.value = this.lights.stage;
    }
    if (this.crowd) this.crowd.material.uniforms.uCheer.value = this.lights.cheer;
  }

  /** Per-frame motion that doesn't depend on the scroll: stage lights sweep. */
  animate(time) {
    if (this.stageLights && this.stageLights.visible) {
      const o = this.tmp || (this.tmp = new THREE.Object3D());
      this.stageLightAims.forEach((aim, i) => {
        o.position.copy(aim.from);
        const sweep = Math.sin(time * 0.9 + i * 1.7) * 0.35;
        o.rotation.set(-1.32 + 0.08 * Math.sin(time * 0.6 + i), 0, aim.yaw + sweep);
        o.updateMatrix();
        this.stageLights.setMatrixAt(i, o.matrix);
      });
      this.stageLights.instanceMatrix.needsUpdate = true;
    }
  }

  /** What the quality level allows: light beams, outlines on the furniture, crowd size. */
  applyQuality(level) {
    this.beamsAllowed = !!level.beams;
    if (this.beams) this.beams.visible = this.beamsAllowed && this.lights.beams > 0.01;
    for (const h of this.hallHulls || []) h.visible = !!level.hallOutlines;
    if (this.crowd) this.crowd.count = Math.floor(this.crowdTotal * (level.crowd ?? 1));
  }

  build() {
    const H = HALL;
    const tint = this.tint;
    const hall = this.hall;
    const span = H.zNear - H.zFar;
    const midZ = (H.zNear + H.zFar) / 2;

    /* Floor: wood, with a carpet runner down the aisle and tape lane lines */
    const floorTex = floorTexture(this.anisotropy);
    floorTex.repeat.set((H.wallX * 2) / 2, span / 2);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(H.wallX * 2, span).rotateX(-Math.PI / 2).translate(0, 0, midZ),
      new THREE.MeshBasicMaterial({ map: floorTex, fog: true }),
    );
    floor.name = 'floor';
    hall.add(floor);

    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(H.aisleHalf * 2, span).rotateX(-Math.PI / 2).translate(0, 0.004, midZ),
      new THREE.MeshBasicMaterial({ color: C.carpet, fog: true }),
    );
    carpet.name = 'carpet';
    hall.add(carpet);

    // Lane seams in the carpet, and gaffer tape along its edges
    const lines = [];
    for (const x of [-LANE_W / 2, LANE_W / 2]) lines.push({ x, y: 0.007, z: midZ, sx: 0.06, color: C.seam });
    for (const x of [-H.aisleHalf, H.aisleHalf]) lines.push({ x, y: 0.008, z: midZ, sx: 0.12, color: C.tape });
    hall.add(instanced(new THREE.PlaneGeometry(1, span).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ fog: true }), lines, 'laneLines'));

    /* Tables run along the aisle, with laptops on both long edges and chairs */
    const rows = this.quality.tableRows >= 2 ? [4.1, 6.7] : [4.1];
    const tableLen = 2.6;
    const tableGeo = mergeColored([
      { geometry: box(1.0, 0.07, tableLen, 0, 0.75, 0), color: C.wood },
      { geometry: box(0.9, 0.7, 0.06, 0, 0.37, tableLen / 2 - 0.15), color: C.metal },
      { geometry: box(0.9, 0.7, 0.06, 0, 0.37, -tableLen / 2 + 0.15), color: C.metal },
    ]);
    const laptopGeo = mergeColored([
      { geometry: box(0.36, 0.025, 0.26, 0, 0.8, 0.0), color: C.laptop },
      { geometry: box(0.36, 0.24, 0.02, 0, 0.93, -0.14).rotateX(0), color: C.laptop },
    ]);
    const screenGeo = new THREE.PlaneGeometry(0.31, 0.2).translate(0, 0.93, -0.128);
    const chairGeo = mergeColored([
      { geometry: box(0.46, 0.07, 0.46, 0, 0.47, 0), color: C.chair },
      { geometry: box(0.46, 0.5, 0.06, 0, 0.78, -0.22), color: C.chair },
      { geometry: box(0.08, 0.44, 0.08, 0, 0.22, 0), color: C.metal },
    ]);
    const tables = [];
    const laptops = [];
    const chairs = [];
    const laptopTints = ['#FFFFFF', '#D9DDE3', '#B8C0CC', '#E9E4DA'];
    let n = 0;
    for (const side of [-1, 1]) {
      for (const x of rows) {
        for (const z of along(3)) {
          const tx = side * x;
          tables.push({ x: tx, z, color: '#FFFFFF' });
          for (const dz of [-0.62, 0.62]) {
            for (const face of [-1, 1]) { // laptops face out from both long edges
              n++;
              laptops.push({ x: tx + face * 0.22, z: z + dz, ry: face > 0 ? Math.PI / 2 : -Math.PI / 2, color: laptopTints[n % 4] });
              chairs.push({ x: tx + face * 0.85, z: z + dz + ((n * 37) % 7) * 0.03 - 0.1, ry: face > 0 ? -Math.PI / 2 + ((n % 5) - 2) * 0.12 : Math.PI / 2 + ((n % 3) - 1) * 0.15, color: '#FFFFFF' });
            }
          }
        }
      }
    }
    hall.add(instanced(tableGeo, tint, tables, 'tables'));
    hall.add(instanced(laptopGeo, tint, laptops, 'laptops'));
    this.screens = instanced(screenGeo, makeGlowing(new THREE.MeshBasicMaterial({ color: C.screen, fog: true }), this.glow.screens), laptops.map((l) => ({ ...l, color: '#FFFFFF' })), 'screens');
    hall.add(this.screens);
    hall.add(instanced(chairGeo, tint, chairs, 'chairs'));

    /* Side architecture: pillars, arches below and above the balcony, walls */
    const pillarX = H.wallX - 1.0;
    const pillars = [];
    for (const z of along(H.bay)) for (const s of [-1, 1]) pillars.push({ x: s * pillarX, y: 0, z, color: C.stone });
    hall.add(instanced(box(0.9, H.vaultY, 0.9, 0, H.vaultY / 2, 0), tint, pillars, 'pillars'));

    const archGeo = new THREE.TorusGeometry(2.55, 0.28, 5, 14, Math.PI).rotateY(Math.PI / 2);
    const arches = [];
    for (const z of along(H.bay, H.bay / 2)) {
      for (const s of [-1, 1]) {
        arches.push({ x: s * pillarX, y: 2.0, z, color: C.stone });   // ground floor
        arches.push({ x: s * pillarX, y: 6.4, z, sy: 0.9, color: C.stone }); // balcony level
      }
    }
    hall.add(instanced(archGeo, tint, arches, 'arches'));

    const slabs = [];
    const rails = [];
    for (const z of along(H.bay, H.bay / 2)) {
      for (const s of [-1, 1]) {
        slabs.push({ x: s * (pillarX - 0.4), y: 4.55, z, color: C.stoneDark });
        rails.push({ x: s * (pillarX - 1.25), y: 5.05, z, color: C.stone });
      }
    }
    hall.add(instanced(box(1.8, 0.35, H.bay), tint, slabs, 'balconies'));
    hall.add(instanced(box(0.12, 0.75, H.bay - 0.1), tint, rails, 'railings'));

    const wallGeo = new THREE.PlaneGeometry(span, H.vaultY).translate(0, H.vaultY / 2, 0);
    const walls = [
      { x: -H.wallX, z: midZ, ry: Math.PI / 2, color: C.wall },
      { x: H.wallX, z: midZ, ry: -Math.PI / 2, color: C.wall },
    ];
    hall.add(instanced(wallGeo, tint, walls, 'walls'));

    const windows = [];
    for (const z of along(H.bay, H.bay / 2)) {
      for (const s of [-1, 1]) windows.push({ x: s * (H.wallX - 0.02), y: 6.7, z, ry: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
    }
    this.windows = instanced(new THREE.PlaneGeometry(2.2, 3.2), makeGlowing(new THREE.MeshBasicMaterial({ color: C.window, fog: true }), this.glow.windows), windows, 'windows');
    hall.add(this.windows);

    /* Vault overhead, with ribs every bay and lamps hanging from it */
    const vaultR = H.wallX;
    const vault = new THREE.Mesh(
      new THREE.CylinderGeometry(vaultR, vaultR, span, 28, 1, true, -Math.PI / 2, Math.PI)
        .rotateX(-Math.PI / 2).translate(0, H.vaultY, midZ),
      toonMaterial({ mid: C.vault, shade: '#6F685D', lit: '#A39985', t1: 0.6, t2: -0.6, tint: 'env', halftone: 0.5 }),
    );
    vault.material.side = THREE.BackSide;
    vault.name = 'vault';
    hall.add(vault);

    const ribs = along(H.bay).map((z) => ({ y: H.vaultY, z, color: C.rib }));
    hall.add(instanced(new THREE.TorusGeometry(vaultR - 0.15, 0.22, 5, 28, Math.PI), tint, ribs, 'ribs'));

    const lampGeo = mergeColored([
      { geometry: new THREE.CylinderGeometry(0.02, 0.02, 7, 4).translate(0, 3.5, 0), color: C.lamp },
      { geometry: new THREE.ConeGeometry(0.45, 0.35, 12, 1, true).translate(0, 0.0, 0), color: C.lamp },
    ]);
    const lamps = [];
    for (const z of along(12, 3)) for (const s of [-1, 1]) lamps.push({ x: s * 3.6, y: 11.2, z });
    hall.add(instanced(lampGeo, tint, lamps, 'lamps'));
    // Bulbs glow at night
    this.bulbs = instanced(new THREE.SphereGeometry(0.17, 10, 6).translate(0, -0.12, 0),
      makeGlowing(new THREE.MeshBasicMaterial({ color: '#CFC7B4', fog: true }), this.glow.bulbs), lamps, 'bulbs');
    hall.add(this.bulbs);

    // (No white DEVELOPERS' TEAMS / MENTORS boards on the side walls: removed at the user's request.)

    this.buildNeon(pillarX);
    this.buildBeams();
    this.buildCrowd(chairs, pillarX);
    this.buildStage();
    this.buildStageLights();
    this.buildHallOutlines();
  }

  /**
   * Neon signs on the pillars, facing the aisle: "</>", "{ }", the sparkle and
   * MAKE-A-TON. Dark glass by day; they switch on at dusk.
   */
  buildNeon(pillarX) {
    const W = 512, Hh = 128;
    const cv = document.createElement('canvas');
    cv.width = W * 2;
    cv.height = Hh * 2;
    const g = cv.getContext('2d');
    const frames = [
      { color: '#4FC8FF', draw: (x, y) => { g.font = 'bold 92px ui-monospace, Menlo, Consolas, monospace'; g.fillText('</>', x, y); g.strokeText('</>', x, y); } },
      { color: '#FF5FB4', draw: (x, y) => { g.font = 'bold 92px ui-monospace, Menlo, Consolas, monospace'; g.fillText('{ }', x, y); g.strokeText('{ }', x, y); } },
      { color: '#FFE23A', draw: (x, y) => {
        g.beginPath();
        const r = 46, p = 7;
        g.moveTo(x, y - r); g.quadraticCurveTo(x + p, y - p, x + r * 0.75, y); g.quadraticCurveTo(x + p, y + p, x, y + r);
        g.quadraticCurveTo(x - p, y + p, x - r * 0.75, y); g.quadraticCurveTo(x - p, y - p, x, y - r);
        g.stroke();
      } },
      { color: '#FF6A3D', draw: (x, y) => { g.font = '84px Bangers, Impact, sans-serif'; g.strokeText('MAKE-A-TON', x, y); } },
    ];
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    frames.forEach((f, i) => {
      const ox = (i % 2) * W, oy = Math.floor(i / 2) * Hh;
      g.fillStyle = '#17122A';
      g.beginPath();
      g.roundRect(ox + 10, oy + 10, W - 20, Hh - 20, 22);
      g.fill();
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.shadowColor = f.color;
      g.shadowBlur = 22;
      g.strokeStyle = f.color;
      g.fillStyle = 'rgba(0,0,0,0)';
      g.lineWidth = 9;
      f.draw(ox + W / 2, oy + Hh / 2 + 4);
      g.shadowBlur = 0;
      g.strokeStyle = '#FFFFFF';
      g.lineWidth = 3;
      f.draw(ox + W / 2, oy + Hh / 2 + 4);
    });
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 2;
    const geo = new THREE.PlaneGeometry(2.4, 0.6);
    const items = [];
    let k = 0;
    for (const z of along(12, 1.5)) {
      const s = k % 2 ? 1 : -1;
      items.push({ x: s * (pillarX - 0.48), y: 6.2, z, ry: s > 0 ? -Math.PI / 2 + 0.4 : Math.PI / 2 - 0.4, frame: k % 4 });
      k++;
    }
    geo.setAttribute('aFrame', new THREE.InstancedBufferAttribute(new Float32Array(items.map((i) => i.frame)), 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, uOn: { value: 0 }, uTint: shared.uEnvTint, fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 }, fogDensity: { value: 0 } },
      vertexShader: /* glsl */ `
        #include <common>
        #include <fog_pars_vertex>
        attribute float aFrame;
        varying vec2 vUv;
        void main() {
          vUv = vec2((uv.x + mod(aFrame, 2.0)) / 2.0, (uv.y + 1.0 - floor(aFrame / 2.0)) / 2.0);
          #include <begin_vertex>
          #include <project_vertex>
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform float uOn;
        uniform vec3 uTint;
        #include <fog_pars_fragment>
        varying vec2 vUv;
        void main() {
          vec4 t = texture2D(map, vUv);
          if (t.a < 0.4) discard;
          float tube = smoothstep(0.3, 0.85, max(t.r, max(t.g, t.b)));
          vec3 off = mix(vec3(0.09, 0.08, 0.16), vec3(0.42, 0.42, 0.5), tube) * uTint;
          vec3 c = mix(off, t.rgb, uOn);
          gl_FragColor = vec4(c, uOn * tube > 0.02 ? 0.5 - 0.5 * uOn * tube : 1.0);
          #include <fog_fragment>
          #include <colorspace_fragment>
        }`,
      fog: true,
    });
    this.neon = instanced(geo, mat, items, 'neon');
    this.hall.add(this.neon);
  }

  /** Light streaming through the windows onto the floor (additive, soft). */
  buildBeams() {
    // One shaft, built for the left wall; the right side is a mirrored instance
    const top = HALL.wallX - 0.1;
    const pos = [
      -top, 8.3, -1.0, -top, 8.3, 1.0, -3.4, 0.02, 1.4 + 2.5, -3.4, 0.02, -1.4 + 2.5,
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const items = [];
    for (const z of along(12, 3)) for (const s of [-1, 1]) items.push({ z, sx: s });
    const mat = keepNote(new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#FFD98A') }, uStrength: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vDepth;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uStrength;
        varying vec2 vUv;
        varying float vDepth;
        void main() {
          float a = uStrength * (0.25 + 0.75 * pow(vUv.y, 0.7)) * pow(sin(3.14159 * vUv.x), 0.7)
                  * (1.0 - smoothstep(35.0, 90.0, vDepth)) * smoothstep(2.0, 9.0, vDepth);
          gl_FragColor = vec4(uColor, a);
          #include <colorspace_fragment>
        }`,
      side: THREE.DoubleSide,
    }), true);
    this.beams = instanced(geo, mat, items, 'lightBeams');
    this.beams.renderOrder = 4;
    this.beams.visible = false;
    this.beamsAllowed = true;
    this.hall.add(this.beams);
  }

  /**
   * The crowd: generic flat cut-outs seen from behind (no real or recognisable
   * people), seated at the tables and standing on the balconies. They bob
   * gently; at demo time the standing ones cheer with their arms up.
   */
  buildCrowd(chairs, pillarX) {
    const FW = 128, FH = 256;
    const cv = document.createElement('canvas');
    cv.width = FW * 4;
    cv.height = FH;
    const g = cv.getContext('2d');
    g.lineJoin = 'round';
    g.lineCap = 'round';
    const body = '#FF0000', head = '#00FF00';
    const draw = (i, fn) => { g.save(); g.translate(i * FW, 0); fn(); g.restore(); };
    const shape = (path, fill) => { g.fillStyle = fill; path(); g.fill(); g.lineWidth = 7; g.strokeStyle = '#000000'; path(); g.stroke(); };
    const torso = (top, bottom, w) => () => { g.beginPath(); g.roundRect(64 - w / 2, top, w, bottom - top, [26, 26, 8, 8]); };
    const headAt = (y, r) => () => { g.beginPath(); g.arc(64, y, r, 0, Math.PI * 2); };
    const arm = (x0, y0, x1, y1) => () => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); };
    // 0: seated, seen from behind (shoulders and head above the chair back)
    draw(0, () => { shape(torso(118, 250, 92), body); shape(headAt(86, 30), head); });
    // 1: standing
    draw(1, () => { shape(torso(78, 250, 70), body); shape(headAt(48, 26), head); });
    // 2, 3: cheering, arms up
    for (const [i, l, r] of [[2, [22, 10], [106, 10]], [3, [30, 30], [100, 4]]]) {
      draw(i, () => {
        for (const [x, y] of [l, r]) {
          g.lineWidth = 22; g.strokeStyle = '#000000'; arm(x < 64 ? 40 : 88, 96, x, y)(); g.stroke();
          g.lineWidth = 14; g.strokeStyle = body; arm(x < 64 ? 40 : 88, 96, x, y)(); g.stroke();
        }
        shape(torso(78, 250, 70), body); shape(headAt(48, 26), head);
      });
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.NoColorSpace; // the colours are masks, not colours

    const shirts = ['#4080FB', '#EF4225', '#22AC5F', '#AD69FF', '#F57EB4', '#FCC230', '#2B303B', '#F2E3D0', '#5B6575', '#1E7A8C'];
    const hairs = ['#1A1412', '#2B1D14', '#3A2718', '#121212', '#4A3322', '#6B4A2E'];
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const items = [];
    // seated: some of the chairs on the inner rows
    for (const ch of chairs) {
      if (Math.abs(ch.x) > 5.4 || rand() > 0.62) continue;
      items.push({ x: ch.x, y: 0.4, z: ch.z, sx: 0.62, sy: 1.0, frame: 0 });
    }
    // standing on the balconies, behind the railings
    for (let z = HALL.zNear; z > HALL.zFar; z -= 0.9) {
      for (const s of [-1, 1]) if (rand() < 0.55) items.push({ x: s * (pillarX - 0.85 + rand() * 0.3), y: 4.73, z: z + rand() * 0.4, sx: 0.55, sy: 1.05, frame: 1 });
    }
    // shuffle so a smaller crowd (lower quality) thins out evenly
    for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
    const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    geo.setAttribute('aFrame', new THREE.InstancedBufferAttribute(new Float32Array(items.map((i) => i.frame)), 1));
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(items.map(() => rand())), 1));
    const hair = new THREE.Color();
    geo.setAttribute('aHair', new THREE.InstancedBufferAttribute(new Float32Array(items.flatMap(() => hair.set(hairs[Math.floor(rand() * hairs.length)]).toArray())), 3));
    for (const it of items) it.color = shirts[Math.floor(rand() * shirts.length)];
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: tex }, uTime: shared.uTime, uCheer: { value: 0 }, uTint: shared.uEnvTint,
        fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 }, fogDensity: { value: 0 },
      },
      vertexShader: /* glsl */ `
        #include <common>
        #include <fog_pars_vertex>
        attribute float aFrame;
        attribute float aPhase;
        attribute vec3 aHair;
        uniform float uTime;
        uniform float uCheer;
        varying vec2 vUv;
        varying vec3 vShirt;
        varying vec3 vHair;
        void main() {
          float standing = step(0.5, aFrame);
          float cheer = standing * uCheer;
          float frame = aFrame;
          if (cheer > 0.5) frame = 2.0 + step(0.5, fract(uTime * 1.6 + aPhase));
          vUv = vec2((uv.x + frame) / 4.0, uv.y);
          vec3 transformed = position;
          float t = uTime * (2.2 + 3.5 * cheer) + aPhase * 6.2832;
          transformed.y += standing > 0.5 ? mix(0.02, 0.14, cheer) * abs(sin(t)) : 0.012 * sin(t * 1.6);
          vShirt = instanceColor;
          vHair = aHair;
          #include <project_vertex>
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform vec3 uTint;
        #include <fog_pars_fragment>
        varying vec2 vUv;
        varying vec3 vShirt;
        varying vec3 vHair;
        void main() {
          vec4 t = texture2D(map, vUv);
          if (t.a < 0.5) discard;
          vec3 c = (t.r * vShirt + t.g * vHair) * uTint;
          gl_FragColor = vec4(c, 1.0);
          #include <fog_fragment>
          #include <colorspace_fragment>
        }`,
      fog: true,
    });
    this.crowd = instanced(geo, mat, items, 'crowd');
    this.crowdTotal = items.length;
    this.hall.add(this.crowd);
  }

  /** Demo time: four coloured spotlights sweeping from above the stage. */
  buildStageLights() {
    const len = 36;
    const geo = new THREE.CylinderGeometry(0.25, 4.6, len, 18, 1, true).translate(0, -len / 2, 0);
    const v = geo.attributes.position;
    const along = new Float32Array(v.count);
    for (let i = 0; i < v.count; i++) along[i] = -v.getY(i) / len; // 0 at the lamp, 1 at the far end
    geo.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
    const z0 = HALL.stageZ;
    const colors = ['#F57EB4', '#4080FB', '#FFE23A', '#AD69FF'];
    this.stageLightAims = [-6, -2, 2, 6].map((x) => ({ from: new THREE.Vector3(x, 11.2, z0 + 1), yaw: -x * 0.03 }));
    const mat = keepNote(new THREE.ShaderMaterial({
      uniforms: { uStrength: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float aAlong;
        varying float vAlong;
        varying vec3 vColor;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vAlong = aAlong;
          vColor = instanceColor;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uStrength;
        varying float vAlong;
        varying vec3 vColor;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
          float a = uStrength * 0.75 * (0.35 + 0.65 * edge) * pow(1.0 - vAlong, 1.3) * smoothstep(0.0, 0.04, vAlong);
          gl_FragColor = vec4(vColor, a);
          #include <colorspace_fragment>
        }`,
      side: THREE.DoubleSide,
    }), true);
    this.stageLights = new THREE.InstancedMesh(geo, mat, 4);
    const c = new THREE.Color();
    colors.forEach((col, i) => this.stageLights.setColorAt(i, c.set(col)));
    this.stageLights.frustumCulled = false;
    this.stageLights.visible = false;
    this.stageLights.renderOrder = 4;
    this.stageLights.name = 'stageLights';
    this.fixed.add(this.stageLights);
    this.animate(0);
  }

  /** Ink outlines on the furniture and stonework (high quality only). */
  buildHallOutlines() {
    const ink = outlineMaterial(0.028, 1.0);
    const names = new Set(['tables', 'laptops', 'chairs', 'pillars', 'arches', 'balconies', 'railings', 'lamps']);
    this.hallHulls = [];
    for (const m of [...this.hall.children]) {
      if (!m.isInstancedMesh || !names.has(m.name)) continue;
      const hull = instancedOutline(m, ink);
      this.hall.add(hull);
      this.hallHulls.push(hull);
    }
  }

  /** The demo stage at the end of the aisle, with the big screen and a symbol banner either side. */
  buildStage() {
    const H = HALL;
    const g = this.fixed;
    const z0 = H.stageZ;
    const tint = this.tint;
    const OPEN_W = 8;    // half-width of the proscenium opening
    const OPEN_H = 10;
    const parts = [];
    // Proscenium wall, full width and height of the hall, with an opening for the stage
    const wallH = H.vaultY + H.wallX;
    const sideW = H.wallX - OPEN_W;
    parts.push({ geometry: box(H.wallX * 2, wallH - OPEN_H, 0.6, 0, OPEN_H + (wallH - OPEN_H) / 2, z0), color: C.wall });
    parts.push({ geometry: box(sideW, OPEN_H, 0.6, -(OPEN_W + sideW / 2), OPEN_H / 2, z0), color: C.wall });
    parts.push({ geometry: box(sideW, OPEN_H, 0.6, OPEN_W + sideW / 2, OPEN_H / 2, z0), color: C.wall });
    // Stage platform and back wall
    parts.push({ geometry: box(OPEN_W * 2, 1.2, 8, 0, 0.6, z0 - 4), color: C.stage });
    parts.push({ geometry: box(OPEN_W * 2, OPEN_H, 0.4, 0, OPEN_H / 2, z0 - 8), color: '#2B2238' });
    // Curtains
    parts.push({ geometry: box(2.6, OPEN_H, 0.5, -(OPEN_W - 1.3), OPEN_H / 2, z0 - 0.6), color: C.purple });
    parts.push({ geometry: box(2.6, OPEN_H, 0.5, OPEN_W - 1.3, OPEN_H / 2, z0 - 0.6), color: C.purple });
    parts.push({ geometry: box(OPEN_W * 2, 1.5, 0.5, 0, OPEN_H - 0.75, z0 - 0.6), color: C.purple });
    // Steps up to the stage
    parts.push({ geometry: box(5, 0.4, 0.9, 0, 0.2, z0 + 1.0), color: C.stage });
    parts.push({ geometry: box(5, 0.8, 0.9, 0, 0.4, z0 + 0.1), color: C.stage });
    const stage = new THREE.Mesh(mergeColored(parts), tint);
    stage.name = 'stageSet';
    g.add(stage);

    // The big screen shows the real Make-A-Ton 9.0 logo
    this.bigScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(10.5, 5.9),
      makeGlowing(new THREE.MeshBasicMaterial({ map: logoScreenTexture(), color: C.bigScreen, fog: true }), this.glow.big),
    );
    this.bigScreen.position.set(0, 5.4, z0 - 7.75);
    g.add(this.bigScreen);

    // The two symbol banners either side of the stage (no sign over it)
    const blue = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 4.5), new THREE.MeshBasicMaterial({ map: symbolBanner('</>', C.blue), fog: true }));
    blue.position.set(-9.2, 6.4, z0 + 0.35);
    const red = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 4.5), new THREE.MeshBasicMaterial({ map: symbolBanner('{ }', C.red), fog: true }));
    red.position.set(9.2, 6.4, z0 + 0.35);
    g.add(blue, red);
  }

  /** Scroll the hall: distance in metres run so far. */
  update(distance) {
    this.hall.position.z = distance % HALL.period;
  }
}
