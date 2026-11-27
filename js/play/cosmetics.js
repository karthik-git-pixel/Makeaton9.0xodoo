/**
 * Run-A-Ton · cosmetics.js
 * What the Sparkle Shop sells: things the star wears (one on its head, one on
 * its back), built in code like the star itself, and trails that stream off
 * it as it runs.
 *
 * The ids match supabase/sparkle-shop.sql, which holds the real prices and
 * does the buying. The prices here are only shown until the shop has loaded.
 *
 * Head items sit on the star's top point and back items on its back, in the
 * star's own units (mascot.js: 1 = half the star's width, front = +z). The
 * top point is wide and blunt: about 0.83 across at y 0.66, 0.62 at y 0.8,
 * tip at (0.03, 0.94); the body is about 0.45 thick there.
 */
import * as THREE from 'three';
import { toonMaterial, tintToonMaterial, outlineMaterial, mergeColored, weld, sparkleShape, shared, Particles } from './fx.js';

export const RARITY = {
  common: { label: 'Common' },
  rare: { label: 'Rare' },
  epic: { label: 'Epic' },
  legendary: { label: 'Legendary' },
};

/* What's for sale. slot: head | back | trail. */
export const ITEMS = [
  { id: 'party-hat', slot: 'head', name: 'Party Hat', price: 2000, rarity: 'common', blurb: 'For the 24th hour of the hackathon.' },
  { id: 'propeller', slot: 'head', name: 'Propeller Cap', price: 3500, rarity: 'common', blurb: 'Spins faster the faster you run.' },
  { id: 'headphones', slot: 'head', name: 'Focus Phones', price: 6000, rarity: 'rare', blurb: 'Deep work mode: on.' },
  { id: 'top-hat', slot: 'head', name: 'Top Hat', price: 9000, rarity: 'rare', blurb: 'Very serious. Very fancy.' },
  { id: 'grad-cap', slot: 'head', name: 'Grad Cap', price: 14000, rarity: 'epic', blurb: 'The tassel swings as you run.' },
  { id: 'crown', slot: 'head', name: 'Hack King Crown', price: 25000, rarity: 'epic', blurb: 'Rule the leaderboard.' },
  { id: 'halo', slot: 'head', name: 'Golden Halo', price: 50000, rarity: 'legendary', blurb: 'Zero bugs. Pure code.' },
  { id: 'backpack', slot: 'back', name: 'Hacker Backpack', price: 5000, rarity: 'rare', blurb: 'Laptop, charger, snacks.' },
  { id: 'cape', slot: 'back', name: 'Hero Cape', price: 18000, rarity: 'epic', blurb: 'Flies out behind you at full speed.' },
  { id: 'wings', slot: 'back', name: 'Angel Wings', price: 40000, rarity: 'legendary', blurb: 'They flap as you run.' },
  { id: 'stardust', slot: 'trail', name: 'Stardust', price: 2500, rarity: 'common', blurb: 'A stream of golden sparkles.' },
  { id: 'confetti', slot: 'trail', name: 'Confetti Pop', price: 5000, rarity: 'common', blurb: 'Every run is a celebration.' },
  { id: 'hearts', slot: 'trail', name: 'Heart Trail', price: 8000, rarity: 'rare', blurb: 'Run with love.' },
  { id: 'blaze', slot: 'trail', name: 'Blaze', price: 12000, rarity: 'rare', blurb: 'Too hot to catch.' },
  { id: 'glitch', slot: 'trail', name: 'Glitch', price: 20000, rarity: 'epic', blurb: 'Pixels breaking off behind you.' },
  { id: 'rainbow', slot: 'trail', name: 'Rainbow', price: 35000, rarity: 'legendary', blurb: 'The full spectrum, all the way.' },
];
export const itemById = (id) => ITEMS.find((i) => i.id === id) || null;

const TAU = Math.PI * 2;
const R = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const approach = (v, target, rate, dt) => v + (target - v) * (1 - Math.exp(-rate * dt));

/* ---------------------------------------------------------------------------
   Materials (shared by every item; made on first use)
   --------------------------------------------------------------------------- */
let M = null;
function mats() {
  if (M) return M;
  M = {
    // flat colours from the parts' vertex colours, in three bands
    tint: tintToonMaterial({ tint: 'char', t1: 0.62, t2: 0.02 }),
    gold: toonMaterial({ mid: '#FCC230', lit: '#FFF0A0', shade: '#D58B12', t1: 0.5, t2: -0.08 }),
    dark: toonMaterial({ mid: '#343A4A', lit: '#5E6780', shade: '#1B1E27', t1: 0.5, t2: -0.02 }),
    white: toonMaterial({ mid: '#F7F2EB', lit: '#FFFFFF', shade: '#DCCDBA', t1: 0.5, t2: -0.05 }),
    halo: toonMaterial({ mid: '#FFE15C', lit: '#FFFBD8', shade: '#FFB52E', t1: 0.35, t2: -0.35, glow: 0.85, halftone: 0 }),
    ink: outlineMaterial(0.028, 1.3),
  };
  return M;
}

/** A lathe from [radius, y] pairs (bottom to top), around the y axis. */
const lathe = (pts, seg = 36) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), seg);

/** A box with rounded edges, centred on the origin. */
function roundedBox(w, h, d, corner, bevel) {
  const x = w / 2 - bevel, y = h / 2 - bevel, c = Math.min(corner, x, y);
  const s = new THREE.Shape();
  s.moveTo(-x + c, -y);
  s.lineTo(x - c, -y);
  s.quadraticCurveTo(x, -y, x, -y + c);
  s.lineTo(x, y - c);
  s.quadraticCurveTo(x, y, x - c, y);
  s.lineTo(-x + c, y);
  s.quadraticCurveTo(-x, y, -x, y - c);
  s.lineTo(-x, -y + c);
  s.quadraticCurveTo(-x, -y, -x + c, -y);
  const depth = Math.max(0.001, d - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 8 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** A flat sparkle (the brand's four-point star) with a little depth, facing +z. */
function sparkleBadge(w, h, depth = 0.03) {
  const g = new THREE.ExtrudeGeometry(sparkleShape(w, h, Math.min(w, h) * 0.12), { depth, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.006, bevelSegments: 1, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/**
 * Parts -> one mesh per material (each with its ink outline). Parts:
 * { geometry, color } for the vertex-coloured material, or { geometry, mat }.
 */
function assemble(parts, { ink = true } = {}) {
  const group = new THREE.Group();
  const byMat = new Map();
  for (const p of parts) {
    const k = p.mat || 'tint';
    if (!byMat.has(k)) byMat.set(k, []);
    byMat.get(k).push(p);
  }
  for (const [k, list] of byMat) {
    const geo = mergeColored(list.map((p) => ({ geometry: p.geometry, color: p.color || '#FFFFFF' })));
    const mesh = new THREE.Mesh(geo, mats()[k]);
    if (ink) {
      // the outline from a welded copy: one normal per corner, so the line stays closed at hard edges
      const hull = new THREE.Mesh(weld(geo.clone(), 1e-4), mats().ink);
      hull.name = 'ink';
      mesh.add(hull);
    }
    group.add(mesh);
  }
  return group;
}

/* ---------------------------------------------------------------------------
   Head items. Each builder returns { group, update?(dt, s) }, where s is
   { t, speed (0..1.8 while running), running }.
   --------------------------------------------------------------------------- */
function partyHat() {
  const H = 0.6, RB = 0.31;
  const radius = (y) => RB * (1 - y / H) ** 0.9;
  const parts = [];
  const bands = 5;
  for (let b = 0; b < bands; b++) {
    const pts = [];
    for (let k = 0; k <= 4; k++) {
      const y = ((b + k / 4) / bands) * H;
      pts.push([radius(y), y]);
    }
    parts.push({ geometry: lathe(pts, 32), color: b % 2 ? '#FFE23A' : '#AD69FF' });
  }
  // a frilly white rim of little puffs
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    parts.push({ geometry: new THREE.IcosahedronGeometry(0.058, 1).translate(Math.sin(a) * RB, 0.01, Math.cos(a) * RB), color: '#FFFFFF' });
  }
  parts.push({ geometry: new THREE.IcosahedronGeometry(0.09, 2).translate(0, H + 0.03, 0), color: '#F57EB4' });
  const group = new THREE.Group();
  const hat = assemble(parts);
  group.add(hat);
  group.position.set(0.05, 0.73, 0.01);
  group.rotation.set(-0.06, 0, -0.17);
  return {
    group,
    update(dt, s) {
      // a little wobble, more while running
      hat.rotation.z = Math.sin(s.t * (s.running ? 9 : 2.2)) * (s.running ? 0.05 : 0.02);
    },
  };
}

function propellerCap() {
  const rx = 0.44, ry = 0.38, rz = 0.37;
  const parts = [];
  const cols = ['#FFE23A', '#4080FB', '#22AC5F', '#F57EB4'];
  for (let q = 0; q < 4; q++) {
    const s = new THREE.SphereGeometry(1, 12, 10, q * (Math.PI / 2) + Math.PI / 4, Math.PI / 2, 0, Math.PI / 2);
    s.scale(rx, ry, rz);
    parts.push({ geometry: s, color: cols[q] });
  }
  // band round the bottom
  parts.push({ geometry: lathe([[1, -0.005], [1.07, 0], [1.09, 0.045], [1.07, 0.09], [1, 0.095]], 44).scale(rx, 1, rz), color: '#FFFFFF' });
  // peak at the front, tipped down a little
  const peak = new THREE.CylinderGeometry(0.33, 0.33, 0.04, 28, 1, false, -1.0, 2.0);
  peak.scale(1, 1, 1.15).translate(0, 0.0, 0.12).rotateX(0.16);
  parts.push({ geometry: peak, color: '#4080FB' });
  // stem and button
  parts.push({ geometry: new THREE.CylinderGeometry(0.026, 0.03, 0.1, 10).translate(0, ry + 0.04, 0), color: '#FFE23A' });
  const cap = assemble(parts);

  const prop = new THREE.Group();
  prop.position.set(0, ry + 0.1, 0);
  const blade = (side, color) => {
    const b = new THREE.SphereGeometry(1, 16, 10);
    b.scale(0.2, 0.02, 0.07).rotateX(side * 0.35).translate(side * 0.2, 0, 0);
    return { geometry: b, color };
  };
  prop.add(assemble([
    blade(1, '#EF4225'), blade(-1, '#4080FB'),
    { geometry: new THREE.SphereGeometry(0.048, 14, 10), color: '#FFE23A' },
  ]));

  const group = new THREE.Group();
  group.add(cap, prop);
  group.position.set(0.04, 0.62, 0.0);
  group.rotation.set(-0.05, 0, -0.08);
  let spin = 4;
  return {
    group,
    update(dt, s) {
      spin = approach(spin, s.running ? 14 + 16 * s.speed : 4, 3, dt);
      prop.rotation.y += spin * dt;
    },
  };
}

function headphones() {
  const parts = [];
  // the band over the top point, with a soft pad on top
  parts.push({ geometry: new THREE.TorusGeometry(0.5, 0.042, 10, 44, Math.PI), color: '#343A4A' });
  parts.push({ geometry: new THREE.TorusGeometry(0.5, 0.062, 10, 20, 0.95).rotateZ(Math.PI / 2 - 0.475), color: '#F57EB4' });
  for (const s of [-1, 1]) {
    // a yoke down to each cup, the cup, a cushion against the star, a cap with a sparkle
    parts.push({ geometry: new THREE.CylinderGeometry(0.035, 0.035, 0.1, 10).translate(s * 0.5, -0.03, 0), color: '#343A4A' });
    parts.push({ geometry: new THREE.CylinderGeometry(0.19, 0.19, 0.13, 32).rotateZ(Math.PI / 2).translate(s * 0.53, -0.14, 0), color: '#AD69FF' });
    parts.push({ geometry: new THREE.TorusGeometry(0.14, 0.05, 10, 30).rotateY(Math.PI / 2).translate(s * 0.455, -0.14, 0), color: '#343A4A' });
    parts.push({ geometry: new THREE.CylinderGeometry(0.135, 0.15, 0.04, 32).rotateZ(Math.PI / 2).translate(s * 0.61, -0.14, 0), color: '#FFE23A' });
    parts.push({ geometry: sparkleBadge(0.15, 0.2, 0.02).rotateY(s * Math.PI / 2).translate(s * 0.635, -0.14, 0), color: '#FFFFFF' });
  }
  const group = assemble(parts);
  const holder = new THREE.Group();
  holder.add(group);
  holder.position.set(0.035, 0.66, -0.02);
  holder.rotation.set(-0.16, 0, -0.04);
  return {
    group: holder,
    update(dt, s) {
      // nodding along to the music
      group.rotation.z = Math.sin(s.t * (s.running ? 10 : 3)) * 0.025;
    },
  };
}

function topHat() {
  const parts = [];
  parts.push({ geometry: lathe([[0, -0.012], [0.44, -0.012], [0.47, 0.012], [0.455, 0.04], [0.33, 0.03]], 48), mat: 'dark' });
  parts.push({ geometry: lathe([[0.33, 0.03], [0.315, 0.2], [0.32, 0.42], [0.335, 0.52], [0.25, 0.525], [0, 0.525]], 48), mat: 'dark' });
  parts.push({ geometry: lathe([[0.332, 0.045], [0.345, 0.05], [0.338, 0.14], [0.322, 0.15]], 48), color: '#FFCC00' });
  parts.push({ geometry: sparkleBadge(0.13, 0.17, 0.025).translate(0, 0.095, 0.345), color: '#FFFFFF' });
  const group = new THREE.Group();
  group.add(assemble(parts));
  group.position.set(0.04, 0.8, 0.0);
  group.rotation.set(-0.08, 0, -0.13);
  return { group };
}

function gradCap() {
  const parts = [];
  parts.push({ geometry: lathe([[0, 0], [0.35, 0], [0.36, 0.03], [0.345, 0.18], [0, 0.18]], 40), mat: 'dark' });
  parts.push({ geometry: new THREE.BoxGeometry(1.0, 0.05, 1.0).translate(0, 0.2, 0), mat: 'dark' });
  parts.push({ geometry: new THREE.CylinderGeometry(0.06, 0.06, 0.035, 18).translate(0, 0.24, 0), mat: 'gold' });
  // the cord along the top to the front corner
  const corner = new THREE.Vector3(0.44, 0.235, 0.44);
  const cord = new THREE.CylinderGeometry(0.016, 0.016, Math.hypot(corner.x, corner.z) * 0.98, 6);
  cord.rotateZ(Math.PI / 2).rotateY(-Math.PI / 4).translate(corner.x / 2, 0.24, corner.z / 2);
  parts.push({ geometry: cord, mat: 'gold' });
  const cap = assemble(parts);

  // the tassel hangs from the corner and swings
  const tassel = new THREE.Group();
  tassel.position.copy(corner);
  tassel.add(assemble([
    { geometry: new THREE.CylinderGeometry(0.016, 0.016, 0.2, 6).translate(0, -0.1, 0), mat: 'gold' },
    { geometry: new THREE.SphereGeometry(0.035, 10, 8).translate(0, -0.2, 0), mat: 'gold' },
    { geometry: new THREE.CylinderGeometry(0.03, 0.06, 0.14, 12).translate(0, -0.29, 0), mat: 'gold' },
  ]));

  const group = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.add(cap, tassel);
  tilt.rotation.y = 0.2;
  group.add(tilt);
  group.position.set(0.04, 0.76, 0.0);
  group.rotation.set(-0.1, 0, -0.1);
  let swing = 0, swingV = 0;
  return {
    group,
    update(dt, s) {
      // a pendulum: blown back while running, swaying at rest
      const target = s.running ? -0.5 - 0.25 * Math.min(s.speed, 1) : 0;
      swingV += ((target - swing) * 40 - swingV * 4) * dt;
      swing += swingV * dt;
      tassel.rotation.x = swing + Math.sin(s.t * (s.running ? 11 : 2.4)) * (s.running ? 0.12 : 0.06);
      tassel.rotation.z = Math.sin(s.t * 1.7) * 0.08;
    },
  };
}

function crown() {
  const Rr = 0.38;
  const parts = [];
  parts.push({ geometry: lathe([[Rr - 0.035, 0], [Rr + 0.01, 0], [Rr + 0.03, 0.21], [Rr - 0.01, 0.21], [Rr - 0.035, 0]], 56), mat: 'gold' });
  // five points round the top, leaning out, a pearl on each
  const spike = new THREE.Shape();
  spike.moveTo(-0.12, 0);
  spike.quadraticCurveTo(-0.035, 0.07, 0, 0.2);
  spike.quadraticCurveTo(0.035, 0.07, 0.12, 0);
  spike.lineTo(-0.12, 0);
  const spikeGeo = new THREE.ExtrudeGeometry(spike, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 2, curveSegments: 8 });
  spikeGeo.translate(0, 0, -0.0175);
  const gems = ['#4080FB', '#EF4225', '#22AC5F', '#EF4225', '#22AC5F'];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + Math.PI / 5;
    const rr = Rr + 0.022;
    parts.push({ geometry: spikeGeo.clone().rotateX(0.14).rotateY(a).translate(Math.sin(a) * rr, 0.205, Math.cos(a) * rr), mat: 'gold' });
    const tip = new THREE.Vector3(0, 0.2 + 0.012, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.14).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    parts.push({ geometry: new THREE.SphereGeometry(0.045, 14, 10).translate(Math.sin(a) * rr + tip.x, 0.205 + tip.y + 0.02, Math.cos(a) * rr + tip.z), color: '#FFF8EE' });
    // a gem on the band under every gap (the front one is the big blue)
    const g = (i / 5) * TAU;
    const big = i === 0 ? 1.25 : 1;
    const gem = new THREE.SphereGeometry(1, 16, 12);
    gem.scale(0.055 * big, 0.068 * big, 0.03).rotateY(g).translate(Math.sin(g) * (Rr + 0.03), 0.105, Math.cos(g) * (Rr + 0.03));
    parts.push({ geometry: gem, color: gems[i] });
  }
  spikeGeo.dispose();
  const group = new THREE.Group();
  group.add(assemble(parts));
  group.position.set(0.04, 0.77, 0.0);
  group.rotation.set(-0.06, 0, -0.1);
  return { group };
}

function halo() {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.055, 16, 56), mats().halo);
  ring.add(new THREE.Mesh(weld(ring.geometry.clone(), 1e-4), outlineMaterial(0.016, 1, '#B87A00')));
  const tilt = new THREE.Group();
  tilt.rotation.x = Math.PI / 2 + 0.32; // front edge lower: seen from the top, as halos are
  tilt.add(ring);
  group.add(tilt);
  // three little sparkles riding round the ring
  const sparks = [];
  const sparkGeo = sparkleBadge(0.12, 0.16, 0.02);
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(sparkGeo, mats().halo);
    group.add(s);
    sparks.push(s);
  }
  group.position.set(0.04, 1.24, -0.02);
  return {
    group,
    update(dt, s) {
      const bob = Math.sin(s.t * 2.3) * 0.035;
      tilt.position.y = bob;
      tilt.rotation.z = Math.sin(s.t * 1.3) * 0.06;
      sparks.forEach((sp, i) => {
        const a = s.t * 1.2 + (i / 3) * TAU;
        const p = new THREE.Vector3(Math.cos(a) * 0.34, Math.sin(a) * 0.34, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), tilt.rotation.x);
        sp.position.set(p.x, p.y + bob + 0.02, p.z);
        sp.scale.setScalar(0.6 + 0.4 * Math.abs(Math.sin(s.t * 3 + i * 2)));
      });
    },
  };
}

/* ---------------------------------------------------------------------------
   Back items
   --------------------------------------------------------------------------- */
const BACK_Z = -0.27; // the star's back surface at its middle

function backpack() {
  const D = 0.3;
  const zc = BACK_Z - D / 2 + 0.02;
  const parts = [];
  parts.push({ geometry: roundedBox(0.74, 0.82, D, 0.16, 0.07).translate(0, -0.04, zc), color: '#4080FB' });
  // front pocket, its zip, and a sparkle patch
  parts.push({ geometry: roundedBox(0.54, 0.34, 0.11, 0.09, 0.035).translate(0, -0.2, zc - D / 2 - 0.02), color: '#FFE23A' });
  parts.push({ geometry: new THREE.BoxGeometry(0.44, 0.022, 0.015).translate(0, -0.075, zc - D / 2 - 0.078), color: '#343A4A' });
  parts.push({ geometry: sparkleBadge(0.16, 0.2, 0.03).rotateY(Math.PI).translate(0, -0.22, zc - D / 2 - 0.085), color: '#EF4225' });
  // the lid's zip and a carry loop on top
  parts.push({ geometry: new THREE.TorusGeometry(0.3, 0.012, 6, 28, Math.PI).translate(0, 0.08, zc - D / 2 + 0.005), color: '#343A4A' });
  parts.push({ geometry: new THREE.TorusGeometry(0.09, 0.026, 8, 18, Math.PI).translate(0, 0.37, zc), color: '#343A4A' });
  // straps up over the shoulders
  for (const s of [-1, 1]) {
    const strap = new THREE.TorusGeometry(0.16, 0.03, 8, 16, Math.PI * 0.75);
    strap.rotateY(Math.PI / 2).rotateX(-0.1).translate(s * 0.27, 0.27, BACK_Z + 0.02);
    parts.push({ geometry: strap, color: '#343A4A' });
  }
  const group = new THREE.Group();
  const pack = assemble(parts);
  group.add(pack);
  return {
    group,
    update(dt, s) {
      // bounces with the stride
      pack.position.y = s.running ? Math.abs(Math.sin(s.t * 9)) * 0.03 : 0;
      pack.rotation.x = s.running ? -0.06 : 0;
    },
  };
}

/** A cape: a thin closed sheet hung from the shoulders, moved every frame. */
function cape() {
  const NU = 13, NV = 13, T = 0.03, L = 1.3;
  const n = NU * NV;
  const pos = new Float32Array(n * 2 * 3);
  const col = new Float32Array(n * 2 * 3);
  const outer = new THREE.Color('#7A3CE2'), inner = new THREE.Color('#FFD23A');
  for (let i = 0; i < n; i++) {
    col.set([outer.r, outer.g, outer.b], i * 3);
    col.set([inner.r, inner.g, inner.b], (n + i) * 3);
  }
  const id = (u, v, side) => side * n + v * NU + u;
  const idx = [];
  for (let v = 0; v < NV - 1; v++) {
    for (let u = 0; u < NU - 1; u++) {
      const a = id(u, v, 0), b = id(u + 1, v, 0), c = id(u, v + 1, 0), d = id(u + 1, v + 1, 0);
      idx.push(a, b, c, b, d, c); // outer: faces away from the star
      const a2 = id(u, v, 1), b2 = id(u + 1, v, 1), c2 = id(u, v + 1, 1), d2 = id(u + 1, v + 1, 1);
      idx.push(a2, c2, b2, b2, c2, d2); // inner (lining): faces the star
    }
  }
  // close the edges, so the ink line goes all the way round
  const edge = (p, q) => { idx.push(id(...p, 0), id(...q, 0), id(...p, 1), id(...q, 0), id(...q, 1), id(...p, 1)); };
  for (let u = 0; u < NU - 1; u++) { edge([u + 1, 0], [u, 0]); edge([u, NV - 1], [u + 1, NV - 1]); }
  for (let v = 0; v < NV - 1; v++) { edge([0, v], [0, v + 1]); edge([NU - 1, v + 1], [NU - 1, v]); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, mats().tint);
  const hull = new THREE.Mesh(geo, mats().ink);
  mesh.add(hull);
  mesh.frustumCulled = false;
  hull.frustumCulled = false;

  // a yellow sparkle on the back of the cape (the side the camera sees in a run)
  const emblem = assemble([{ geometry: sparkleBadge(0.36, 0.46, 0.025), color: '#FFE23A' }]);
  const group = new THREE.Group();
  group.add(mesh, emblem);

  let lift = 0.1;
  const P = new THREE.Vector3(), Pu = new THREE.Vector3(), Pv = new THREE.Vector3(), N = new THREE.Vector3();
  function at(u, v, t, wave, out) {
    const s = 2 * u - 1;
    const a = lift * (0.45 + 0.55 * v);
    const len = L * v * (1 + 0.09 * (1 - s * s)); // a curved hem: longest in the middle
    const topZ = BACK_Z + 0.03 + 0.15 * s * s;   // hugs the back, round to the shoulders
    const x = s * (0.5 + 0.42 * Math.pow(v, 0.85)) + 0.04 * v * Math.sin(t * 5.3 + u * 5);
    let y = 0.5 - 0.05 * s * s - len * Math.cos(a);
    let z = topZ - len * Math.sin(a) - 0.12 * v;
    z += -0.08 * wave * Math.pow(v, 1.3) * Math.sin(t * (3 + 6 * wave) - v * 4.5 + u * 2.4);
    z += 0.055 * Math.sin(u * Math.PI * 4) * (0.15 + 0.85 * v); // folds
    y += 0.03 * wave * v * Math.sin(t * 7 + u * 3);
    return out.set(x, y, z);
  }
  function shape(t, wave) {
    for (let v = 0; v < NV; v++) {
      for (let u = 0; u < NU; u++) {
        const uu = u / (NU - 1), vv = v / (NV - 1);
        at(uu, vv, t, wave, P);
        const a = lift * (0.45 + 0.55 * vv);
        // the lining sits a sheet's thickness towards the star
        const k = id(u, v, 0) * 3, k2 = id(u, v, 1) * 3;
        pos[k] = P.x; pos[k + 1] = P.y; pos[k + 2] = P.z;
        pos[k2] = P.x; pos[k2 + 1] = P.y - T * Math.sin(a); pos[k2 + 2] = P.z + T * Math.cos(a);
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    // the emblem rides on the sheet, a little out from it
    const u0 = 0.5, v0 = 0.42;
    at(u0, v0, t, wave, P);
    at(u0 + 0.05, v0, t, wave, Pu).sub(P).normalize();
    at(u0, v0 - 0.05, t, wave, Pv).sub(P).normalize();
    N.crossVectors(Pu, Pv).normalize(); // towards the star (the emblem goes the other way, outside)
    const m = new THREE.Matrix4().makeBasis(Pu.clone().negate(), Pv, N.clone().negate());
    emblem.quaternion.setFromRotationMatrix(m);
    emblem.position.copy(P).addScaledVector(N, -0.02);
  }
  shape(0, 0.3);
  return {
    group,
    update(dt, s) {
      lift = approach(lift, s.running ? 0.35 + 0.55 * Math.min(s.speed, 1.2) : 0.1, 3, dt);
      shape(s.t, s.running ? 1 : 0.35);
    },
  };
}

function wings() {
  // a spread cartoon wing: a rounded top edge rising out to the tip, white
  // feathers hanging from it (longest at the tip), golden ones over their roots
  const feather = (w, h) => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(w, h * 0.1, w * 0.95, h * 0.78, 0, h);
    s.bezierCurveTo(-w * 0.95, h * 0.78, -w, h * 0.1, 0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 10 });
    g.translate(0, 0, -0.015);
    return g;
  };
  const edge = (t) => new THREE.Vector3(1.0 * t, 0.78 * Math.sin(t * Math.PI * 0.6) - 0.06 * t, 0);
  const one = () => {
    const parts = [];
    for (let i = 0; i < 8; i++) {
      const t = 0.1 + i * 0.125;
      const a = (-98 + i * 10.5) * (Math.PI / 180); // straight down at the root, out and down at the tip
      const p = edge(t);
      const g = feather(0.12, 0.4 + 0.058 * i).rotateZ(a - Math.PI / 2).translate(p.x, p.y, i * 0.006);
      parts.push({ geometry: g, mat: 'white' });
    }
    for (let i = 0; i < 6; i++) {
      const t = 0.08 + i * 0.16;
      const a = (-92 + i * 11) * (Math.PI / 180);
      const p = edge(t);
      const g = feather(0.11, 0.24 + 0.025 * i).rotateZ(a - Math.PI / 2).translate(p.x, p.y, -0.05 - i * 0.004);
      parts.push({ geometry: g, color: '#FFE38A' });
    }
    // the top edge: a soft rounded bar along the wing
    const curve = new THREE.CatmullRomCurve3([0, 0.2, 0.4, 0.6, 0.8, 1.0].map(edge));
    parts.push({ geometry: new THREE.TubeGeometry(curve, 24, 0.07, 10, false), mat: 'white' });
    parts.push({ geometry: new THREE.SphereGeometry(0.07, 12, 8).translate(edge(1).x, edge(1).y, 0), mat: 'white' });
    parts.push({ geometry: new THREE.SphereGeometry(0.11, 14, 10).scale(1, 1, 0.7), color: '#FFE38A' });
    return assemble(parts);
  };
  const group = new THREE.Group();
  const sides = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.add(one());
    pivot.position.set(s * 0.2, 0.36, BACK_Z - 0.06);
    pivot.scale.x = s; // the left wing is the mirror image
    group.add(pivot);
    return { pivot, s };
  });
  let beat = 0;
  return {
    group,
    update(dt, st) {
      beat += dt * (st.running ? 7.5 + 3 * Math.min(st.speed, 1) : 2.2);
      const amp = st.running ? 0.3 : 0.09;
      for (const { pivot, s } of sides) {
        // flapping up and down, swept a little back
        pivot.rotation.z = s * (0.04 + amp * Math.sin(beat));
        pivot.rotation.y = s * 0.22;
      }
    },
  };
}

const BUILD = {
  'party-hat': partyHat,
  propeller: propellerCap,
  headphones,
  'top-hat': topHat,
  'grad-cap': gradCap,
  crown,
  halo,
  backpack,
  cape,
  wings,
};

/** A fresh copy of a worn item ({ group, update? }), or null for a trail or an unknown id. */
export function buildItem(id) {
  const make = BUILD[id];
  if (!make) return null;
  const item = make();
  item.group.name = `item:${id}`;
  return item;
}

/* ---------------------------------------------------------------------------
   Outfit: what the star wears, on mascot.body
   --------------------------------------------------------------------------- */
export class Outfit {
  constructor(mascot) {
    this.mascot = mascot;
    this.worn = { head: null, back: null };   // { id, item }
    this.cache = new Map();                   // built items, kept for quick try-ons
    this.hidden = { head: false, back: false };
    this.t = 0;
  }

  /** Puts on id in its slot (null: take it off). */
  wear(slot, id) {
    const cur = this.worn[slot];
    if ((cur && cur.id) === (id || null)) return;
    if (cur) this.mascot.body.remove(cur.item.group);
    this.worn[slot] = null;
    if (!id || !BUILD[id]) return;
    let item = this.cache.get(id);
    if (!item) { item = buildItem(id); this.cache.set(id, item); }
    item.group.visible = !this.hidden[slot];
    this.mascot.body.add(item.group);
    this.worn[slot] = { id, item };
    if (item.update) item.update(0, { t: this.t, speed: 0, running: false });
  }

  /** Everything at once: { head, back } (trail is the Trail's). */
  set(look) {
    this.wear('head', look && look.head);
    this.wear('back', look && look.back);
  }

  /** Hidden for a while (the duck sits on the head; the rocket is strapped to the back). */
  hide(slot, on) {
    this.hidden[slot] = on;
    const w = this.worn[slot];
    if (w) w.item.group.visible = !on;
  }

  update(dt, { speed = 0, running = false } = {}) {
    this.t += dt;
    for (const slot of ['head', 'back']) {
      const w = this.worn[slot];
      if (w && w.item.update && w.item.group.visible) w.item.update(dt, { t: this.t, speed, running });
    }
  }
}

/* ---------------------------------------------------------------------------
   Trails
   o: where they start and which way is "behind":
   { x, y, z, bx, bz (unit, along the floor), v (how fast the world goes by),
     across: 'side' | 'up' (how the rainbow's bands are laid side by side) }
   --------------------------------------------------------------------------- */
const CONFETTI = ['#FCC230', '#EF4225', '#4080FB', '#AD69FF', '#F57EB4', '#22AC5F', '#FFE23A', '#FFFFFF'];
const RAINBOW = ['#FF4D4D', '#FF9F1C', '#FFE23A', '#3DDC84', '#4080FB', '#AD69FF'];

/** A point around the start, spread across (sideways to the run) and up. */
function around(o, side, up) {
  const s = R(-side, side);
  return { x: o.x - o.bz * s, y: o.y + R(-up, up), z: o.z + o.bx * s };
}
/** Carried back with the world (k of its speed), plus a little scatter. */
function drift(o, k, scatter = 0.4) {
  return { vx: o.bx * o.v * k + R(-scatter, scatter), vz: o.bz * o.v * k + R(-scatter, scatter) };
}

export const TRAILS = {
  stardust: {
    glow: true, rate: 42,
    make: (o) => ({ ...around(o, 0.22, 0.3), ...drift(o, 0.42), vy: R(-0.1, 0.6), color: pick(['#FFE23A', '#FFFFFF', '#FFD23F', '#FFE23A']), size: R(0.15, 0.27), life: R(0.4, 0.6), shape: 1, drag: 2, spin: R(-5, 5) }),
  },
  confetti: {
    glow: false, rate: 46,
    make: (o) => ({ ...around(o, 0.26, 0.26), ...drift(o, 0.38, 1.2), vy: R(0.9, 2.4), color: pick(CONFETTI), size: R(0.12, 0.17), life: R(0.55, 0.8), shape: 2, gravity: 6, drag: 1.3, spin: R(-12, 12) }),
  },
  hearts: {
    glow: false, rate: 22,
    make: (o) => ({ ...around(o, 0.24, 0.24), ...drift(o, 0.38, 0.35), vy: R(0.5, 1.2), color: pick(['#FF5FA2', '#F57EB4', '#FF3D6E', '#FF5FA2', '#FFFFFF']), size: R(0.22, 0.34), life: R(0.55, 0.75), shape: 3, drag: 1.1, angle: R(-0.35, 0.35), spin: R(-1, 1) }),
  },
  blaze: {
    glow: true, rate: 95,
    make: (o) => ({ ...around(o, 0.18, 0.24), ...drift(o, 0.42, 0.35), vy: R(0.6, 1.7), color: pick(['#FFE23A', '#FF8A3D', '#FF5A1F', '#FFC23D', '#FF8A3D', '#FF3B1F']), size: R(0.24, 0.4), grow: -0.7, life: R(0.22, 0.38), shape: 0, drag: 1.4, fade: 0.5 }),
  },
  glitch: {
    glow: true, rate: 58,
    make: (o) => {
      const p = around(o, 0.28, 0.32);
      const snap = (v) => Math.round(v / 0.08) * 0.08; // on a pixel grid
      return { x: snap(p.x), y: snap(p.y), z: p.z, ...drift(o, 0.32, 0), vy: 0, color: pick(['#4FF7FF', '#FF4FE0', '#FFFFFF', '#4FF7FF', '#FF4FE0', '#22AC5F']), size: R(0.1, 0.18), life: R(0.22, 0.46), shape: 4, angle: 0, fade: 0.15 };
    },
  },
  rainbow: {
    glow: true, rate: 10, ribbon: true,
    // the bands themselves come from Trail.emit(); these are the twinkles over them
    make: (o) => ({ ...around(o, 0.2, 0.22), ...drift(o, 0.44, 0.2), vy: R(0, 0.4), color: '#FFFFFF', size: R(0.14, 0.2), life: R(0.32, 0.48), shape: 1, spin: R(-4, 4), drag: 1 }),
  },
};

export class Trail {
  constructor(scene) {
    this.glow = new Particles(scene, { max: 260, glow: true });
    this.flat = new Particles(scene, { max: 160 });
    this.id = null;
    this.acc = 0;
    this.ribbonAcc = 0;
  }

  set(id) {
    this.id = id && TRAILS[id] ? id : null;
  }

  /** Lets the trail out for dt seconds from o (see above). */
  emit(dt, o) {
    const T = this.id && TRAILS[this.id];
    if (!T) return;
    const ps = T.glow ? this.glow : this.flat;
    this.acc += dt * T.rate;
    while (this.acc >= 1) { this.acc -= 1; ps.spawn(T.make(o)); }
    if (T.ribbon) {
      // six bands side by side (seen from behind in a run) or stacked (seen
      // from the side in the shop), laid down evenly so the ribbon has no gaps
      this.ribbonAcc += dt * 55;
      const side = o.across === 'side';
      const n = Math.floor(this.ribbonAcc);
      const speed = o.v * 0.44;
      for (let j = 0; j < n; j++) {
        // spread this frame's columns over the stretch the frame covered (no gaps on slow phones)
        const back = ((n - 1 - j) / Math.max(1, n)) * dt * speed;
        RAINBOW.forEach((color, k) => {
          const off = (2.5 - k) * 0.08;
          this.glow.spawn({
            x: o.x + (side ? off : 0) + o.bx * back, y: o.y + (side ? -0.15 : off), z: o.z + o.bz * back,
            vx: o.bx * speed, vy: 0, vz: o.bz * speed,
            color, size: 0.17, life: 0.5, shape: 0, fade: 0.55,
          });
        });
      }
      this.ribbonAcc -= n;
    }
  }

  update(dt) { this.glow.update(dt); this.flat.update(dt); }
  clear() { this.glow.clear(); this.flat.clear(); this.acc = 0; this.ribbonAcc = 0; }
  setView(h, fov, max) { this.glow.setView(h, fov, max); this.flat.setView(h, fov, max); }
  setBudget(f) { this.glow.setBudget(f); this.flat.setBudget(f); }
}

/* ---------------------------------------------------------------------------
   Shop pictures: each item drawn once, on its own, into a small image
   --------------------------------------------------------------------------- */
let thumb = null;
function thumbStage() {
  if (thumb) return thumb;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#000000', 1000, 2000); // same programs as the hall (fog on), no haze
  const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 50);
  const particles = { glow: new Particles(scene, { max: 80, glow: true }), flat: new Particles(scene, { max: 80 }) };
  thumb = { scene, camera, particles, rt: null, size: 0 };
  return thumb;
}

/** The best side to see each worn item from (yaw), for the pictures and the shop's turn. */
export const VIEW_YAW = { head: 0.45, back: Math.PI - 0.4, trail: -0.75 };

/**
 * Draws one item into a PNG data URL (transparent background), size x size
 * pixels. Rendered twice (on black, then on white) to recover the coverage,
 * since the cartoon materials keep notes for the glow in the alpha channel.
 */
export function renderIcon(renderer, id, size = 168) {
  const it = itemById(id);
  if (!it) return '';
  const S = size * 2; // drawn at twice the size, then scaled down: smooth edges
  const st = thumbStage();
  if (!st.rt || st.size !== S) {
    if (st.rt) st.rt.dispose();
    st.rt = new THREE.WebGLRenderTarget(S, S);
    st.rt.texture.colorSpace = THREE.SRGBColorSpace;
    st.size = S;
  }
  const { scene, camera } = st;
  const holder = new THREE.Group();
  scene.add(holder);
  let item = null;

  if (it.slot === 'trail') {
    // a swoosh of the trail's own pieces, from the lower left to the upper right
    const T = TRAILS[id];
    const ps = T.glow ? st.particles.glow : st.particles.flat;
    const o = { x: 0, y: 0, z: 0, bx: 0, bz: 1, v: 0 };
    const n = T.ribbon ? 0 : 16;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const p = T.make(o);
      ps.spawn({ ...p, x: -0.62 + u * 1.24 + R(-0.05, 0.05), y: -0.4 + Math.sin(u * 2.4) * 0.62 + R(-0.12, 0.12), z: 0, vx: 0, vy: 0, vz: 0, gravity: 0, life: 10, grow: 0, size: p.size * 2.5 * (0.55 + 0.45 * u) });
    }
    if (T.ribbon) {
      for (let i = 0; i < 40; i++) {
        const u = i / 39;
        RAINBOW.forEach((color, k) => ps.spawn({ x: -0.66 + u * 1.32, y: -0.32 + Math.sin(u * 2.6) * 0.52 + 0.27 - k * 0.11, z: 0, color, size: 0.25, life: 10, shape: 0 }));
      }
      for (let i = 0; i < 5; i++) ps.spawn({ x: R(-0.6, 0.6), y: R(-0.3, 0.5), z: 0.05, color: '#FFFFFF', size: R(0.2, 0.3), life: 10, shape: 1 });
    }
    st.particles.glow.update(0.08);
    st.particles.flat.update(0.08);
    st.particles.glow.setView(S, camera.fov, 512);
    st.particles.flat.setView(S, camera.fov, 512);
    camera.position.set(0, 0, 4.2);
    camera.lookAt(0, 0, 0);
  } else {
    item = buildItem(id);
    if (item.update) item.update(0, { t: 0.4, speed: 0, running: false });
    holder.add(item.group);
    holder.rotation.set(it.slot === 'head' ? 0.4 : 0.22, VIEW_YAW[it.slot], 0);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    const dist = (r / Math.sin((camera.fov * Math.PI) / 360)) * 0.9;
    camera.position.set(c.x, c.y, c.z + dist);
    camera.lookAt(c);
  }
  camera.updateProjectionMatrix();

  // draw it plain: no time-of-day tint, an outline in proportion to the picture
  const tint = shared.uCharTint.value.clone();
  const resY = shared.uResY.value;
  const inkW = mats().ink.uniforms.uWidth.value;
  shared.uCharTint.value.set(1, 1, 1);
  shared.uResY.value = S;
  mats().ink.uniforms.uWidth.value = inkW * 0.75;
  const prevTarget = renderer.getRenderTarget();
  const prevColor = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const read = (bg) => {
    renderer.setRenderTarget(st.rt);
    renderer.setClearColor(bg, 1);
    renderer.clear();
    renderer.render(scene, camera);
    const buf = new Uint8Array(S * S * 4);
    renderer.readRenderTargetPixels(st.rt, 0, 0, S, S, buf);
    return buf;
  };
  let black, white;
  try {
    black = read(0x000000);
    white = read(0xffffff);
  } finally {
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevColor, prevAlpha);
    shared.uCharTint.value.copy(tint);
    shared.uResY.value = resY;
    mats().ink.uniforms.uWidth.value = inkW;
    scene.remove(holder);
    st.particles.glow.clear();
    st.particles.flat.clear();
    if (item) disposeItem(item);
  }

  // coverage = 1 - (white - black); colour = black / coverage. Rows come bottom-up.
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const o = ((S - 1 - y) * S + x) * 4;
      const a = clamp(1 - ((white[i] - black[i]) + (white[i + 1] - black[i + 1]) + (white[i + 2] - black[i + 2])) / (3 * 255), 0, 1);
      img.data[o + 3] = Math.round(a * 255);
      if (a > 0.003) {
        img.data[o] = Math.min(255, black[i] / a);
        img.data[o + 1] = Math.min(255, black[i + 1] / a);
        img.data[o + 2] = Math.min(255, black[i + 2] / a);
      }
    }
  }
  g.putImageData(img, 0, 0);
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const g2 = out.getContext('2d');
  g2.imageSmoothingQuality = 'high';
  g2.drawImage(cv, 0, 0, size, size);
  return out.toDataURL('image/png');
}

/** Frees an item's own geometry (materials are shared and stay). */
function disposeItem(item) {
  item.group.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
}

