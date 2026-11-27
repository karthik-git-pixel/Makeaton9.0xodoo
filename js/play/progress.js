/**
 * Run-A-Ton · progress.js
 * How an endless run unfolds with distance. Everything here is a function of
 * metres run, so the spawner (which works ~80 m ahead) and the game agree.
 *
 *   speed       rises quickly at first, then keeps climbing slowly all run
 *   levels      every few hundred metres (each a little longer than the last);
 *               each raises the score multiplier and may bring in something new
 *   difficulty  0..1, sets how close together the rows come
 *   day         the hall goes round the hackathon's day: afternoon, dusk, the
 *               dead of night, dawn, demo time, and back to afternoon
 *   events      short themed stretches (a bug swarm, a board meeting...)
 */

/* Speed in m/s: v0 at the start, approaching vmax. It climbs fast (about
   22 m/s at 500 m, 27 at 1 km, 33 at 2 km, 37 at 3 km, 39 at 5 km): nearly
   double within the first minute, then it keeps edging up. Obstacle spacing
   is in seconds, so a faster run gives as long between moves; things are
   fully in view 72 m ahead, about 1.8 s at top speed. */
export const SPEED = { v0: 15, vmax: 40, scale: 1500, ref: 24 };
export const speedAt = (distance) => SPEED.v0 + (SPEED.vmax - SPEED.v0) * (1 - Math.exp(-Math.max(0, distance) / SPEED.scale));

/* MAD SPEED: survive MAD.at seconds (about 1.4 km, at ~30 m/s) and the run goes
   mad. Once the rows already laid out are passed, the speed climbs over
   MAD.ramp metres (a clear run-up, about 3 s) to MAD.v, then keeps edging up
   towards MAD.vTop. Rows keep their rhythm (their spacing is in seconds, with
   a slightly higher floor), and things appear further down the aisle (MAD.ahead
   instead of 82 m), so there are still about 1.5 s to read what's coming: hard,
   but a quick player can keep going. The server's speed check
   (supabase/leaderboard-v2.sql, run_problem) knows these numbers. */
export const MAD = { at: 60, ramp: 120, breather: 45, v: 50, vTop: 56, scale: 3000, ahead: 96, gapFloor: 0.45 };
/** 0 before mad speed starts at `from` metres (Infinity: not yet), 1 once it's fully mad. */
export const madAt = (distance, from = Infinity) => (distance > from ? Math.min(1, (distance - from) / MAD.ramp) : 0);
/** The run's speed at `distance`, mad speed included once it has started at `from`. */
export function runSpeedAt(distance, from = Infinity) {
  const base = speedAt(distance);
  if (!(distance > from)) return base;
  const k = madAt(distance, from);
  const mad = MAD.v + (MAD.vTop - MAD.v) * (1 - Math.exp(-(distance - from) / MAD.scale));
  return base + (mad - base) * k * k * (3 - 2 * k);
}

/* Levels: level 2 at 250 m, then each level is 100 m longer than the one before
   (250, 350, 450...). At first a level takes about 20 s, later about 30 s. */
export function levelStart(level) {
  const n = level - 1;
  return n <= 0 ? 0 : 250 * n + 50 * n * (n - 1);
}
export function levelAt(distance) {
  let L = 1;
  while (levelStart(L + 1) <= distance) L++;
  return L;
}
export const MAX_MULTIPLIER = 10;
export const multiplierFor = (level) => Math.min(level, MAX_MULTIPLIER);

/* 0 at the start, 1 from 1 km on (about 45 s in): the run gets hard fast. */
export const difficultyAt = (distance) => Math.min(1, Math.max(0, distance) / 1000) ** 0.7;
/* After that the rows keep closing in: 0 at 1 km, 1 from 4 km on. */
export const lateAt = (distance) => Math.min(1, Math.max(0, distance - 1000) / 3000);

/* What appears from which level (level 2 at 250 m, 3 at 600, 4 at 1050, 5 at
   1600): every kind of obstacle is in by about 1.6 km. 'rollingChair' is a
   chair that rolls at you. */
export const UNLOCK = {
  beetle: 1, chair: 1, board: 1, coffee: 1, shield: 1,
  firefly: 2, hurdle: 2, magnet: 2,
  ant: 3, standee: 3, duck: 3, pizza: 3, rocket: 3,
  roly: 4, rollingChair: 4, hopper: 4,
  stack: 5,
};

/* The day: hours 0..25 over DAY_M metres, then round again (24-25 is the
   hall going back from demo time to the next afternoon). */
export const DAY_M = 2400;
export const DAY_HOURS = 25;
export const dayHourAt = (distance) => (((Math.max(0, distance) / DAY_M) * DAY_HOURS) % DAY_HOURS);
export const PHASES = [
  { from: 0, name: 'Afternoon' },
  { from: 6, name: 'Dusk' },
  { from: 11, name: 'Dead of night' },
  { from: 18, name: 'Dawn' },
  { from: 21.8, name: 'Demo time' },
  { from: 24.3, name: 'Afternoon' },
];
export const phaseAt = (hour) => PHASES.reduce((p, q) => (hour >= q.from ? q : p), PHASES[0]);

/* Events: short themed stretches from level 3 on, every 25-40 s or so.
   allow: the obstacles that may appear (sparkle rush: none at all).
   bonus: points (times the multiplier) for getting through it. */
export const EVENTS = {
  swarm: { text: 'BUG SWARM!', level: 3, seconds: 9, bonus: 500, weight: 1.2, allow: ['beetle', 'firefly', 'ant', 'roly', 'hopper', 'stack'] },
  meeting: { text: 'BOARD MEETING!', level: 3, seconds: 8, bonus: 400, weight: 1, allow: ['board', 'hurdle', 'standee'] },
  stampede: { text: 'CHAIR STAMPEDE!', level: 4, seconds: 7, bonus: 400, weight: 0.9, allow: ['chair', 'stack'] },
  rush: { text: 'SPARKLE RUSH!', level: 3, seconds: 5, bonus: 0, weight: 0.7, allow: [] },
};

/* What each thing is called, and the tip shown the first couple of times it
   comes down the aisle. */
export const CATALOG = {
  beetle: { tag: 'New bug', name: 'Syntax Error', hint: 'Sits in your lane. Jump it!', color: '#22AC5F' },
  firefly: { tag: 'New bug', name: 'Null Pointer', hint: 'Flies at head height. Slide under!', color: '#AD69FF' },
  ant: { tag: 'New bug', name: 'Race Condition', hint: 'Dashes across the aisle. Time a jump!', color: '#FF8A3D' },
  roly: { tag: 'New bug', name: 'Infinite Loop', hint: 'Rolls straight at you. Jump it!', color: '#AD69FF' },
  hopper: { tag: 'New bug', name: 'Off-By-One', hint: 'Looks at a lane, then hops into it!', color: '#4080FB' },
  stack: { tag: 'New bug', name: 'Stack Overflow', hint: 'Too tall to jump. Switch lanes!', color: '#F57EB4' },
  chair: { tag: 'Watch out', name: 'Office chair', hint: 'Switch lanes. Some roll at you!', color: '#4080FB' },
  board: { tag: 'Make-A-Ton', name: 'Hanging board', hint: 'Swipe down to slide under!', color: '#283046' },
  hurdle: { tag: 'Make-A-Ton', name: 'Floor sign', hint: "It's low. Jump it!", color: '#EF4225' },
  standee: { tag: 'Make-A-Ton', name: 'Standee', hint: 'Blocks two lanes. Switch!', color: '#FCC230' },
  coffee: { tag: 'Power-up', name: 'Coffee rush', hint: 'Sprint and smash through everything!', color: '#EF4225' },
  shield: { tag: 'Power-up', name: 'Firewall', hint: 'Blocks the next hit.', color: '#4080FB' },
  magnet: { tag: 'Power-up', name: 'Wi-Fi magnet', hint: 'Pulls in every sparkle nearby.', color: '#AD69FF' },
  duck: { tag: 'Power-up', name: 'Rubber duck', hint: 'Debug mode: run through bugs to squash them!', color: '#FCC230' },
  pizza: { tag: 'Power-up', name: 'Pizza', hint: 'Double points for a while.', color: '#FF8A3D' },
  rocket: { tag: 'Power-up', name: 'Ship it!', hint: 'Fly over everything.', color: '#EF4225' },
};
