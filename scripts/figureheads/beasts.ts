// The figurehead parts: lion, eagle, kraken, dragon and seraph. Same frames
// and units as the mermaid (see kit.ts): the body upright facing +z with the
// knee behind it, heads in their own frames, wings and flung arms in ship
// axes from an anchor so they spread out over the bows whatever the lean.

import { add, cross, hex, lerp, lerp3, mixC, mul, norm, spline, sub, type Scene, type V3 } from './sdf.ts';
import { curl, feather, ladyFace, scales, strands, type Jewel, type Piece } from './kit.ts';

const X: V3 = [1, 0, 0];
const Y: V3 = [0, 1, 0];
const Z: V3 = [0, 0, 1];
const mirror = (p: V3, sx: number): V3 => [p[0] * sx, p[1], p[2]];

// ------------------------------------------------------------------ lion

const FUR = hex(0xc48a3c);
const FUR_LIGHT = hex(0xd9aa5e);
const MANE = hex(0x8f5a24);
const MANE_DARK = hex(0x6a3c17);
const DARK = hex(0x2e1d12);
const IVORY = hex(0xf3ead6);
const MOUTH = hex(0x5a1a12);
const GOLD = hex(0xe8b649);
const PALE_GOLD = hex(0xf6d98a);
const AMBER = hex(0xc98a2a);

/** Common: a carved oak lion, painted, forepaws on a gilded shield, his tail curled down the knee. */
function lionBody(s: Scene) {
  // chest, barrel and haunches, crouched along the knee
  s.ellipsoid([0, 0.6, 0.03], [0.2, 0.23, 0.17], FUR, 0);
  s.ellipsoid([0, 0.34, -0.05], [0.16, 0.22, 0.14], FUR, 0.08);
  for (const sx of [-1, 1]) {
    s.ellipsoid([sx * 0.13, 0.08, -0.08], [0.1, 0.17, 0.13], FUR, 0.07);
    s.sphere([sx * 0.15, 0.68, 0.06], 0.09, FUR, 0.06);
    // forelegs reaching down to the shield, paws curled over its rim
    s.tube([[sx * 0.15, 0.68, 0.08], [sx * 0.19, 0.55, 0.16], [sx * 0.17, 0.42, 0.22], [sx * 0.15, 0.34, 0.26]], { r: (u) => lerp(0.075, 0.05, u) }, FUR, 0.04);
    s.ellipsoid([sx * 0.15, 0.31, 0.29], [0.06, 0.04, 0.065], FUR_LIGHT, 0.02);
    for (let t = -1; t <= 1; t++) {
      const toe: V3 = [sx * 0.15 + t * 0.032, 0.3, 0.335];
      s.sphere(toe, 0.022, FUR_LIGHT, 0.012);
      s.cone(add(toe, [0, -0.01, 0.01]), add(toe, [0, -0.05, 0.018]), 0.008, 0.002, IVORY, 0.004);
    }
    // hind legs folded down the knee
    s.tube([[sx * 0.14, 0.05, -0.02], [sx * 0.16, -0.12, 0.04], [sx * 0.13, -0.3, 0.02]], { r: (u) => lerp(0.08, 0.045, u) }, FUR, 0.04);
    s.ellipsoid([sx * 0.13, -0.34, 0.05], [0.05, 0.035, 0.07], FUR_LIGHT, 0.02);
    for (let t = -1; t <= 1; t++) s.sphere([sx * 0.13 + t * 0.026, -0.355, 0.11], 0.018, FUR_LIGHT, 0.01);
  }
  // a ruff of mane over his shoulders and down his chest
  for (let i = 0; i < 13; i++) {
    const a = lerp(-1.6, 1.6, i / 12);
    const root: V3 = [Math.sin(a) * 0.14, 0.86, Math.cos(a) * 0.08];
    const tip: V3 = [Math.sin(a) * 0.24, 0.62 - Math.abs(Math.sin(a)) * 0.05, Math.cos(a) * 0.17 - 0.02];
    const mid = add(lerp3(root, tip, 0.5), [Math.sin(a) * 0.04, 0, Math.cos(a) * 0.05]);
    s.tube([root, mid, tip, add(tip, [0, -0.03, 0.03])], { r: (u) => lerp(0.05, 0.012, u), flat: 0.6, flatN: [Math.sin(a), 0, Math.cos(a)], relief: strands(3, 0.006, 20) }, i % 2 ? MANE : MANE_DARK, 0.025);
  }
  // the tail: down the back of the knee and curled round, a tuft at its tip
  const tail: V3[] = [[0, 0.12, -0.17], [0, -0.1, -0.2], [0, -0.32, -0.14], ...curl([0, -0.44, -0.06], Z, Y, 0.09, 0.8, Math.PI, 0.6, 6).slice(1)];
  s.tube(tail, { r: (u) => lerp(0.035, 0.02, u) }, FUR, 0.03);
  s.ellipsoid(tail[tail.length - 1], [0.04, 0.06, 0.04], MANE_DARK, 0.02);
}

function lionShield(s: Scene) {
  // a gilded oval with a raised rim, a boss and an anchor carved in relief, tipped up to face ahead
  const N = norm([0, 0.5, 0.87]);
  const U = cross(N, X);
  const c: V3 = [0, 0.05, 0.36];
  const P = (u: number, v: number, w = 0): V3 => add(c, add(add(mul(X, u), mul(U, v)), mul(N, w)));
  s.ellipsoid(c, [0.19, 0.25, 0.035], GOLD, 0, [X, U, N]);
  const rim: V3[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    rim.push(P(Math.sin(a) * 0.185, Math.cos(a) * 0.245, 0.012));
  }
  s.tube(rim, { r: () => 0.02, samples: 72 }, PALE_GOLD, 0.01);
  s.sphere(P(0, 0.02, 0.03), 0.045, PALE_GOLD, 0.015);
  // the anchor: shank, stock, ring, arms and flukes
  s.cone(P(0, 0.17, 0.03), P(0, -0.15, 0.03), 0.013, 0.013, AMBER, 0.006);
  s.cone(P(-0.07, 0.13, 0.03), P(0.07, 0.13, 0.03), 0.011, 0.011, AMBER, 0.006);
  s.torus(P(0, 0.2, 0.03), N, 0.025, 0.008, AMBER, 0.004);
  const arm: V3[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = lerp(-1.3, 1.3, i / 8);
    arm.push(P(Math.sin(a) * 0.11, -0.06 - Math.cos(a) * 0.09, 0.03));
  }
  s.tube(arm, { r: () => 0.012 }, AMBER, 0.006);
  for (const sx of [-1, 1]) {
    const end = arm[sx < 0 ? 0 : 8];
    s.cone(end, add(end, add(mul(X, sx * 0.02), mul(U, 0.04))), 0.02, 0.004, AMBER, 0.006);
  }
}

function lionHead(s: Scene) {
  // skull, broad muzzle and whisker pads, the bridge of the nose
  s.ellipsoid([0, 0.02, 0], [0.14, 0.13, 0.14], FUR, 0);
  s.ellipsoid([0, -0.045, 0.14], [0.095, 0.07, 0.1], FUR_LIGHT, 0.04);
  for (const sx of [-1, 1]) s.sphere([sx * 0.045, -0.06, 0.19], 0.045, FUR_LIGHT, 0.03);
  s.cone([0, 0.06, 0.1], [0, 0.0, 0.2], 0.045, 0.035, FUR, 0.03);
  s.ellipsoid([0, -0.005, 0.228], [0.038, 0.024, 0.024], DARK, 0.008);
  // a heavy brow over amber eyes
  for (const sx of [-1, 1]) {
    s.ellipsoid([sx * 0.062, 0.072, 0.115], [0.06, 0.024, 0.04], FUR, 0.025);
    s.ellipsoid([sx * 0.064, 0.04, 0.13], [0.03, 0.02, 0.02], DARK, 0.01, undefined, true);
    s.sphere([sx * 0.064, 0.038, 0.122], 0.021, hex(0xe7b13a), 0.004);
    s.sphere([sx * 0.066, 0.038, 0.141], 0.009, DARK, 0.002);
    // ears half buried in the mane
    s.ellipsoid([sx * 0.105, 0.115, -0.01], [0.04, 0.045, 0.02], FUR, 0.02);
  }
  // the mouth open in a roar: a dark hollow, fangs above and below, a lolling tongue
  s.ellipsoid([0, -0.165, 0.11], [0.075, 0.035, 0.085], FUR, 0.03);
  s.ellipsoid([0, -0.12, 0.18], [0.07, 0.04, 0.07], MOUTH, 0.012, undefined, true);
  s.ellipsoid([0, -0.14, 0.15], [0.04, 0.012, 0.05], hex(0xb5524a), 0.01);
  for (const sx of [-1, 1]) {
    s.cone([sx * 0.042, -0.09, 0.205], [sx * 0.045, -0.145, 0.21], 0.012, 0.002, IVORY, 0.004);
    s.cone([sx * 0.036, -0.17, 0.19], [sx * 0.038, -0.125, 0.198], 0.01, 0.002, IVORY, 0.004);
  }
  // the mane: three rings of flame-shaped locks round the face, the outer ones longest
  for (const [ring, n, rr, back, len] of [[0, 14, 0.13, -0.02, 0.1], [1, 16, 0.155, -0.07, 0.14], [2, 18, 0.175, -0.13, 0.17]] as number[][]) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.37;
      const d = norm([Math.cos(a), Math.sin(a) * 1.05, -0.45 - ring * 0.15]);
      const side: V3 = [-Math.sin(a), Math.cos(a), 0];
      const root: V3 = [Math.cos(a) * rr, Math.sin(a) * rr - 0.02, back];
      const mid = add(add(root, mul(d, len * 0.55)), mul(side, 0.025));
      const tip = add(add(root, mul(d, len)), add(mul(side, -0.01), [0, -0.025, -0.02]));
      s.tube([root, mid, tip], { r: (u) => lerp(0.042, 0.008, Math.pow(u, 0.9)), flat: 0.55, flatN: norm(cross(side, d)), relief: strands(3, 0.006, 30) }, (i + ring) % 3 ? MANE : MANE_DARK, 0.022);
    }
  }
}

// ------------------------------------------------------------------ eagle

const BROWN = hex(0x5b3b22);
const BROWN_DEEP = hex(0x3a2414);
const TAWNY = hex(0x7a5230);
const WHITE = hex(0xf1ece0);
const BEAK = hex(0xe3a92b);

/** Rare: a sea eagle, white head and hooked gold beak, talons on a gilded orb, wings flung wide and back. */
function eagleBody(s: Scene) {
  // body and breast, feathered in overlapping rows
  const body: V3[] = [[0, -0.02, -0.05], [0, 0.2, 0.0], [0, 0.48, 0.02], [0, 0.72, 0.0], [0, 0.9, -0.01]];
  const br = (u: number) => lerp(0.15, 0.11, u) + Math.sin(u * Math.PI) * 0.075;
  s.tube(body, { r: br, flat: 0.9, flatN: X, relief: scales(0.065, 0.006, br), samples: 40 }, BROWN, 0);
  s.ellipsoid([0, 0.5, 0.11], [0.15, 0.25, 0.1], TAWNY, 0.06);
  // a ruff of white feathers up the neck
  const neck: V3[] = [[0, 0.8, -0.02], [0, 0.92, 0.0], [0, 1.02, 0.05]];
  s.tube(neck, { r: (u) => lerp(0.12, 0.1, u), relief: scales(0.035, 0.006, () => 0.11) }, WHITE, 0.04);
  // legs in feathered breeches, talons gripping the orb (set in the game)
  for (const sx of [-1, 1]) {
    s.ellipsoid([sx * 0.1, 0.2, 0.06], [0.07, 0.11, 0.08], BROWN_DEEP, 0.04);
    s.tube([[sx * 0.1, 0.14, 0.09], [sx * 0.1, 0.06, 0.15]], { r: () => 0.026 }, BEAK, 0.02);
    for (let t = -1; t <= 1; t++) {
      const x = sx * 0.1 + t * 0.035;
      s.tube([[x, 0.05, 0.16], [x * 1.05, 0.0, 0.27], [x * 0.95, -0.06, 0.31], [x * 0.8, -0.12, 0.31]], { r: (u) => lerp(0.02, 0.012, u) }, BEAK, 0.01);
      s.cone([x * 0.8, -0.12, 0.31], [x * 0.7, -0.17, 0.29], 0.011, 0.002, DARK, 0.004);
    }
    // the hind talon round the back of the orb
    s.tube([[sx * 0.1, 0.05, 0.14], [sx * 0.08, -0.02, 0.05], [sx * 0.06, -0.08, 0.02]], { r: (u) => lerp(0.02, 0.012, u) }, BEAK, 0.01);
  }
  // tail feathers fanned down the knee
  for (let i = -3; i <= 3; i++) {
    const a: V3 = [i * 0.03, 0.02, -0.1];
    feather(s, a, add(a, [i * 0.055, -0.52, -0.1]), 0.1, norm([0, 0.2, 1]), i % 2 ? BROWN : WHITE, 0.012);
  }
}

function eagleHead(s: Scene) {
  s.ellipsoid([0, 0, 0], [0.11, 0.115, 0.14], WHITE, 0);
  s.ellipsoid([0, -0.04, -0.07], [0.1, 0.1, 0.1], WHITE, 0.05);
  // hackles: a few feathers lifting off the back of the head
  for (let i = -2; i <= 2; i++) s.blade([i * 0.035, 0.03, -0.1], [i * 0.06, -0.02, -0.22], 0.035, 0.014, norm([0, 1, -0.3]), WHITE, 0.02);
  // a fierce brow over amber eyes
  for (const sx of [-1, 1]) {
    s.ellipsoid([sx * 0.058, 0.052, 0.085], [0.055, 0.02, 0.055], WHITE, 0.02, [norm([1, sx * -0.35, 0]), norm([sx * 0.35, 1, 0]), Z]);
    s.ellipsoid([sx * 0.07, 0.022, 0.1], [0.026, 0.022, 0.02], DARK, 0.008, undefined, true);
    s.sphere([sx * 0.07, 0.022, 0.093], 0.022, hex(0xf0b020), 0.003);
    s.sphere([sx * 0.074, 0.022, 0.111], 0.011, DARK, 0.002);
  }
  // the hooked beak: a cere at its root, the upper bill curving down over a smaller lower one
  s.ellipsoid([0, 0.0, 0.13], [0.052, 0.045, 0.05], BEAK, 0.02);
  s.tube([[0, 0.015, 0.13], [0, 0.02, 0.22], [0, -0.025, 0.3], [0, -0.09, 0.3]], { r: (u) => lerp(0.048, 0.008, Math.pow(u, 0.8)), flat: 0.72, flatN: X }, BEAK, 0.015);
  s.tube([[0, -0.04, 0.14], [0, -0.05, 0.2], [0, -0.055, 0.25]], { r: (u) => lerp(0.032, 0.01, u), flat: 0.72, flatN: X }, BEAK, 0.012);
  s.tube([[-0.05, -0.03, 0.15], [0, -0.035, 0.26], [0.05, -0.03, 0.15]], { r: () => 0.005 }, DARK, 0.002, true);
  for (const sx of [-1, 1]) s.sphere([sx * 0.02, 0.025, 0.17], 0.007, DARK, 0.002, true);
}

/** Both wings, in ship axes from between the shoulders. */
function eagleWings(s: Scene) {
  for (const sx of [-1, 1]) {
    const root: V3 = [sx * 0.17, 0, 0];
    const elbow: V3 = [sx * 0.48, 0.2, -0.12];
    const wrist: V3 = [sx * 0.78, 0.28, -0.02];
    s.sphere(root, 0.09, BROWN, 0.04);
    s.tube([root, elbow, wrist], { r: (u) => lerp(0.08, 0.045, u), flat: 0.7, flatN: Y }, BROWN, 0.04);
    const arm = spline([root, elbow, wrist], 12);
    const at = (u: number) => arm[Math.round(u * 12)];
    // secondaries hanging back from the arm, two rows of coverts over them
    for (let f = 0; f < 10; f++) {
      const u = 0.06 + (f / 9) * 0.9;
      const a = at(u);
      const dir = norm([sx * lerp(0.1, 0.35, u), -0.05, -1]);
      feather(s, add(a, [0, -0.01, 0]), add(a, mul(dir, lerp(0.42, 0.56, u))), 0.13, Y, f % 2 ? BROWN : BROWN_DEEP, 0.011, BROWN_DEEP);
      feather(s, add(a, [0, 0.022, 0.01]), add(add(a, mul(dir, lerp(0.24, 0.3, u))), [0, 0.03, 0]), 0.12, Y, TAWNY, 0.011, BROWN);
      feather(s, add(a, [0, 0.04, 0.02]), add(add(a, mul(dir, lerp(0.12, 0.15, u))), [0, 0.045, 0]), 0.1, Y, BROWN, 0.011);
    }
    // primaries fanned from the wrist, fingered at their tips
    for (let f = 0; f < 7; f++) {
      const u = f / 6;
      const dir = norm([sx * lerp(1, 0.55, u), lerp(0.18, 0, u), lerp(0.25, -1, u)]);
      feather(s, add(wrist, mul(dir, -0.05)), add(wrist, mul(dir, lerp(0.62, 0.7, Math.sin(u * Math.PI)))), 0.11, Y, BROWN_DEEP, 0.011, DARK);
    }
  }
}

// ------------------------------------------------------------------ kraken

/** Epic: a golden kraken wrapped round the knee, its arms coiling down the cutwater and out along the bows. */
function suckers(s: Scene, pts: V3[], r: (u: number) => number, side: V3, from = 0.12, to = 0.85, n = 8) {
  const P = spline(pts, 40);
  for (let k = 0; k < n; k++) {
    const u = lerp(from, to, k / (n - 1));
    const i = Math.round(u * 40);
    const t = norm(sub(P[Math.min(40, i + 1)], P[Math.max(0, i - 1)]));
    const out = norm(sub(side, mul(t, side[0] * t[0] + side[1] * t[1] + side[2] * t[2])));
    const c = add(P[i], mul(out, r(u) * 0.8));
    s.sphere(c, r(u) * 0.5, PALE_GOLD, r(u) * 0.15);
    s.sphere(add(c, mul(out, r(u) * 0.38)), r(u) * 0.27, AMBER, 0.004, true);
  }
}

function krakenBody(s: Scene) {
  // the mantle: a great ridged body thrust forward over the cutwater, fins at its tip
  const mantle: V3[] = [[0, 0.36, 0.0], [0, 0.55, 0.0], [0, 0.78, -0.02], [0, 0.98, -0.04], [0, 1.14, -0.02]];
  const mr = (u: number) => lerp(0.2, 0.03, Math.pow(u, 1.6)) + Math.sin(Math.min(1, u * 2.2) * Math.PI * 0.5) * 0.07;
  s.tube(mantle, { r: mr, flat: 0.9, flatN: X, relief: (u, a) => -0.02 * Math.pow(0.5 + 0.5 * Math.cos(a * 5), 6) * Math.min(1, u * 3), samples: 40 }, GOLD, 0);
  for (const sx of [-1, 1]) {
    s.blade([sx * 0.1, 0.92, -0.05], [sx * 0.33, 1.02, -0.12], 0.1, 0.024, norm([0, 0.3, 1]), PALE_GOLD, 0.03, 0, 0.008);
    // great eyes under heavy lids
    const e: V3 = [sx * 0.2, 0.5, 0.11];
    const look = norm([sx * 0.6, 0, 1]);
    s.sphere(e, 0.1, PALE_GOLD, 0.03);
    s.ellipsoid(add(e, [0, 0.045, -0.01]), [0.115, 0.07, 0.11], GOLD, 0.012);
    s.ellipsoid(add(e, [0, -0.06, -0.01]), [0.105, 0.035, 0.1], GOLD, 0.012);
    s.torus(add(e, mul(look, 0.035)), look, 0.098, 0.016, AMBER, 0.01);
  }
  // the arms that wrap the knee: two curl forward over the cutwater, two down its cheeks, two down its front
  const arms: V3[][] = [];
  const sides: V3[] = [];
  for (const sx of [-1, 1]) {
    arms.push([[sx * 0.1, 0.45, 0.1], [sx * 0.2, 0.26, 0.24], [sx * 0.22, 0.04, 0.24], ...curl([sx * 0.22, -0.08, 0.1], Z, Y, 0.14, 0.8, Math.PI * 0.5, 0.85, 8)]);
    sides.push([0, 0, 1]);
    arms.push([[sx * 0.14, 0.42, -0.06], [sx * 0.2, 0.18, -0.18], [sx * 0.18, -0.15, -0.22], [sx * 0.2, -0.4, -0.26], ...curl([sx * 0.26, -0.52, -0.16], [sx, 0, 0], Y, 0.1, 0.8, Math.PI, 0.8, 7)]);
    sides.push([sx, 0, 0]);
    arms.push([[sx * 0.06, 0.4, 0.06], [sx * 0.07, 0.15, 0.13], [sx * 0.05, -0.15, 0.1], [sx * 0.03, -0.4, 0.06], ...curl([sx * 0.02, -0.52, 0.14], [sx, 0, 0], Y, 0.11, 0.8, Math.PI * 0.5, 0.75, 7)]);
    sides.push([0, 0, 1]);
  }
  const ar = (u: number) => lerp(0.085, 0.015, Math.pow(u, 0.7));
  arms.forEach((pts, i) => {
    s.tube(pts, { r: ar, samples: 48 }, i % 2 ? GOLD : mixC(GOLD, PALE_GOLD, 0.4), 0.05);
    suckers(s, pts, ar, sides[i]);
  });
}

/** The two arms flung out along each bow, in ship axes from the mantle's root. */
function krakenReach(s: Scene) {
  const ar = (u: number) => lerp(0.08, 0.014, Math.pow(u, 0.7));
  for (const sx of [-1, 1]) {
    const pts: V3[] = [[sx * 0.14, 0.04, 0.0], [sx * 0.45, -0.1, -0.15], [sx * 0.62, -0.25, -0.45], [sx * 0.62, -0.32, -0.8], ...curl([sx * 0.52, -0.26, -0.98], Y, [0, 0, -1], 0.13, 0.8, Math.PI, 0.9, 8)];
    s.tube(pts, { r: ar, samples: 56 }, GOLD, 0.04);
    suckers(s, pts, ar, [0, -1, 0], 0.15, 0.9, 10);
  }
}

// ------------------------------------------------------------------ dragon

const CRIMSON = hex(0x8a2018);
const CRIMSON_DEEP = hex(0x5e130e);
const BONE = hex(0xeceaf4);

/** Legendary: a horned golden dragon reaching out over the waves, jaws open, eyes like coals, wings half spread. */
const DRAGON_NECK: V3[] = [[0, -0.35, -0.1], [0, -0.05, 0.02], [0, 0.3, 0.0], [0, 0.68, -0.02], [0, 1.0, 0.12], [0, 1.16, 0.3]];

function dragonBody(s: Scene) {
  const nr = (u: number) => lerp(0.22, 0.12, u);
  s.tube(DRAGON_NECK, { r: nr, flat: 0.9, flatN: X, relief: scales(0.05, 0.008, nr), samples: 56 }, GOLD, 0);
  const P = spline(DRAGON_NECK, 50);
  // belly plates down the front, spines down the back
  for (let i = 0; i < 13; i++) {
    const u = 0.08 + i * 0.065;
    const k = Math.round(u * 50);
    const t = norm(sub(P[k + 1], P[k - 1]));
    const front = norm(cross(X, t));
    s.ellipsoid(add(P[k], mul(front, nr(u) * 0.72)), [nr(u) * 0.78, 0.034, nr(u) * 0.36], PALE_GOLD, 0.012, [X, t, front]);
  }
  for (let i = 1; i < 13; i++) {
    const u = i / 13.5;
    const k = Math.round(u * 50);
    const t = norm(sub(P[k + 1], P[k - 1]));
    const back = norm(cross(t, X));
    const base = add(P[k], mul(back, nr(u) * 0.8));
    s.cone(base, add(base, add(mul(back, 0.16 - u * 0.06), mul(t, -0.08))), 0.045, 0.004, PALE_GOLD, 0.02);
  }
  for (const sx of [-1, 1]) {
    // forelegs clawing the knee
    s.tube([[sx * 0.15, 0.32, 0.04], [sx * 0.25, 0.14, 0.15], [sx * 0.19, -0.04, 0.2]], { r: (u) => lerp(0.07, 0.05, u) }, GOLD, 0.04);
    s.ellipsoid([sx * 0.19, -0.06, 0.22], [0.055, 0.035, 0.06], GOLD, 0.02);
    for (let t = -1; t <= 1; t++) {
      const b: V3 = [sx * 0.19 + t * 0.035, -0.07, 0.26];
      s.cone(b, add(b, [0, -0.07, 0.03]), 0.016, 0.002, BONE, 0.006);
    }
  }
  // the tail coils down the knee
  const tail: V3[] = [[0, -0.35, -0.1], [0, -0.52, -0.06], ...curl([0, -0.6, 0.1], norm([0, 0.2, -1]), Y, 0.14, 0.8, Math.PI * 0.5, 1.0, 10).slice(1)];
  s.tube(tail, { r: (u) => lerp(0.11, 0.018, u), relief: scales(0.04, 0.006, (u) => lerp(0.11, 0.018, u)) }, GOLD, 0.05);
}

function dragonHead(s: Scene) {
  // skull, long snout, the lower jaw dropped open
  s.ellipsoid([0, 0, 0], [0.14, 0.12, 0.17], GOLD, 0);
  s.ellipsoid([0, 0.0, 0.22], [0.09, 0.052, 0.19], GOLD, 0.06);
  s.ellipsoid([0, -0.1, 0.17], [0.075, 0.03, 0.16], GOLD, 0.03, [X, norm([0, 1, 0.38]), norm([0, -0.38, 1])]);
  // the mouth: a red hollow between the jaws, fangs along both
  s.ellipsoid([0, -0.06, 0.22], [0.065, 0.03, 0.15], CRIMSON_DEEP, 0.01, [X, norm([0, 1, 0.2]), norm([0, -0.2, 1])], true);
  for (const sx of [-1, 1]) {
    for (const z of [0.14, 0.22, 0.3, 0.37]) s.cone([sx * 0.06 * (1 - (z - 0.14)), -0.04, z], [sx * 0.058 * (1 - (z - 0.14)), -0.085, z + 0.005], 0.011, 0.002, BONE, 0.004);
    for (const z of [0.12, 0.2, 0.27]) s.cone([sx * 0.055, -0.115 - z * 0.25, z], [sx * 0.053, -0.075 - z * 0.25, z + 0.01], 0.01, 0.002, BONE, 0.004);
    // brow ridges over the eyes, swept-back horns, frills at the jaw
    s.ellipsoid([sx * 0.07, 0.07, 0.07], [0.055, 0.022, 0.07], PALE_GOLD, 0.02);
    s.ellipsoid([sx * 0.078, 0.045, 0.11], [0.03, 0.02, 0.025], DARK, 0.008, undefined, true);
    s.tube([[sx * 0.07, 0.08, -0.04], [sx * 0.13, 0.19, -0.18], [sx * 0.12, 0.24, -0.38], [sx * 0.06, 0.19, -0.52]], { r: (u) => lerp(0.042, 0.006, u), relief: (u, a) => -0.006 * Math.pow(Math.abs(Math.sin(u * 40)), 4) * (1 + 0 * a) }, PALE_GOLD, 0.02);
    s.tube([[sx * 0.1, 0.0, -0.06], [sx * 0.2, 0.02, -0.18], [sx * 0.25, -0.04, -0.3]], { r: (u) => lerp(0.028, 0.005, u) }, GOLD, 0.015);
    s.blade([sx * 0.11, -0.06, -0.02], [sx * 0.22, -0.14, -0.14], 0.06, 0.016, [sx, 0, 0.3], PALE_GOLD, 0.015, 0, 0.006);
    // whiskers trailing from the snout
    s.tube([[sx * 0.06, -0.02, 0.33], [sx * 0.14, -0.06, 0.3], [sx * 0.2, -0.14, 0.18], [sx * 0.22, -0.24, 0.06]], { r: (u) => lerp(0.012, 0.005, u) }, PALE_GOLD, 0.008);
    s.sphere([sx * 0.03, 0.03, 0.385], 0.012, DARK, 0.004, true);
  }
}

const DRAGON_WING_AT: V3 = [0, 0.5, -0.06];

/** The wings' finger bones and membranes, in ship axes from between the shoulders. */
function dragonWing(sx: number) {
  const root: V3 = [sx * 0.22, 0, 0];
  const dirs: V3[] = [[sx * 0.7, 0.9, -0.1], [sx * 1.1, 0.45, -0.35], [sx * 1.0, 0.1, -0.85], [sx * 0.45, -0.05, -1.05]];
  const tips = dirs.map((d, i) => add(root, mul(norm(d), [0.95, 1.05, 0.95, 0.7][i])));
  return { root, tips };
}

function dragonWingBones(s: Scene) {
  for (const sx of [-1, 1]) {
    const { root, tips } = dragonWing(sx);
    s.sphere(root, 0.07, GOLD, 0.03);
    for (const tp of tips) {
      const mid = add(lerp3(root, tp, 0.45), [0, 0.08, 0]);
      s.tube([root, mid, tp], { r: (u) => lerp(0.05, 0.014, u) }, GOLD, 0.02);
      s.cone(tp, add(tp, mul(norm(sub(tp, mid)), 0.1)), 0.02, 0.003, BONE, 0.008);
    }
  }
}

function dragonWingWebs(s: Scene) {
  for (const sx of [-1, 1]) {
    const { root, tips } = dragonWing(sx);
    for (let i = 0; i < tips.length - 1; i++) {
      const b = add(lerp3(root, tips[i], 0.45), [0, 0.08, 0]);
      const c = add(lerp3(root, tips[i + 1], 0.45), [0, 0.08, 0]);
      // the membrane sags between two fingers: an inner sheet and an outer one, the trailing edge scalloped
      s.sheet(add(root, [0, 0.03, 0]), add(b, [0, -0.015, 0]), add(c, [0, -0.015, 0]), 0.012, i % 2 ? CRIMSON : CRIMSON_DEEP, 0.01);
      s.sheet(add(b, [0, -0.015, 0]), add(tips[i], [0, -0.012, 0]), add(tips[i + 1], [0, -0.012, 0]), 0.012, i % 2 ? CRIMSON : CRIMSON_DEEP, 0.01);
      s.sheet(add(b, [0, -0.015, 0]), add(c, [0, -0.015, 0]), add(tips[i + 1], [0, -0.012, 0]), 0.012, i % 2 ? CRIMSON : CRIMSON_DEEP, 0.01);
      const e = lerp3(tips[i], tips[i + 1], 0.5);
      const span = Math.hypot(...sub(tips[i], tips[i + 1]));
      s.sphere(lerp3(e, root, -0.25), span * 0.42, CRIMSON_DEEP, 0.02, true);
    }
  }
}

// ------------------------------------------------------------------ seraph

const PEARL = hex(0xeceaf4);
const SILVER = hex(0xc5cad6);
const BLUED = hex(0x34466e);

/** Mythic: a pearl seraph holding up a star, crystal wings raised and spread, a turning halo of light. */
function seraphBody(s: Scene) {
  // robes from the breast down into a long trailing hem down the knee, folded
  const robe: V3[] = [[0, 0.78, 0.0], [0, 0.5, 0.01], [0, 0.2, 0.02], [0, -0.06, 0.03], [0, -0.3, 0.0], [0, -0.5, -0.05], [0, -0.62, 0.05], [0, -0.6, 0.18]];
  const rr = (u: number) => (u < 0.12 ? lerp(0.15, 0.14, u / 0.12) : u < 0.3 ? lerp(0.14, 0.2, (u - 0.12) / 0.18) : lerp(0.2, 0.04, Math.pow((u - 0.3) / 0.7, 0.9)));
  s.tube(robe, { r: rr, flat: 0.82, flatN: X, relief: (u, a, l) => -0.016 * Math.pow(0.5 + 0.5 * Math.cos(a * 7 + l * 3), 2) * Math.min(1, u * 4), samples: 56 }, PEARL, 0);
  // bodice and shoulders, a golden girdle
  s.ellipsoid([0, 0.66, 0.0], [0.15, 0.15, 0.11], PEARL, 0.06);
  for (const sx of [-1, 1]) s.sphere([sx * 0.15, 0.8, -0.005], 0.055, PEARL, 0.04);
  s.ellipsoid([0, 0.8, -0.005], [0.17, 0.05, 0.085], PEARL, 0.05);
  const belt: V3[] = [];
  for (let i = 0; i <= 20; i++) belt.push([Math.sin((i / 20) * Math.PI * 2) * 0.124, 0.52, Math.cos((i / 20) * Math.PI * 2) * 0.15]);
  s.tube(belt, { r: () => 0.018, samples: 60 }, GOLD, 0.01);
  s.tube([[0.05, 0.51, 0.13], [0.06, 0.38, 0.16], [0.05, 0.22, 0.18]], { r: (u) => lerp(0.016, 0.01, u) }, GOLD, 0.01);
  s.cone([0, 0.8, 0.0], [0, 0.99, 0.02], 0.05, 0.045, PEARL, 0.04);
  // arms raised forward, cupping the star; long sleeves hanging from them
  for (const sx of [-1, 1]) {
    const pts: V3[] = [[sx * 0.15, 0.8, 0], [sx * 0.22, 0.9, 0.12], [sx * 0.2, 0.98, 0.24], [sx * 0.1, 1.06, 0.36]];
    s.tube(pts, { r: (u) => lerp(0.045, 0.028, u) }, PEARL, 0.03);
    s.ellipsoid([sx * 0.075, 1.09, 0.4], [0.026, 0.04, 0.02], PEARL, 0.015, [norm([1, 0, -sx * 0.8]), Y, norm([sx * 0.8, 0, 1])]);
    s.tube([[sx * 0.2, 0.93, 0.16], [sx * 0.25, 0.82, 0.2], [sx * 0.24, 0.7, 0.18]], { r: (u) => lerp(0.05, 0.075, u), flat: 0.45, flatN: [sx, 0, 0.4], relief: strands(4, 0.006) }, SILVER, 0.03);
  }
}

function seraphHead(s: Scene) {
  ladyFace(s, PEARL, mixC(PEARL, BLUED, 0.35), hex(0xffffff));
  // silver hair from a centre parting, long locks down her back
  s.ellipsoid([0, 0.045, -0.035], [0.095, 0.085, 0.09], SILVER, 0.02);
  for (let i = 0; i < 9; i++) {
    const a = lerp(-1.2, 1.2, i / 8);
    const sa = Math.sin(a);
    s.tube([[sa * 0.04, 0.1, 0.03], [sa * 0.095, 0.06, -0.04], [sa * 0.12, -0.04, -0.12], [sa * 0.15, -0.22, -0.17], [sa * 0.16, -0.4, -0.15]], { r: (t) => lerp(0.028, 0.014, t), flat: 0.55, flatN: [sa, 0.2, -1], relief: strands(3, 0.004, 25) }, i % 2 ? SILVER : PEARL, 0.015);
  }
  // a fillet of gold across her brow
  s.torus([0, 0.085, -0.02], norm([0, 1, -0.3]), 0.1, 0.009, GOLD, 0.006);
}

const SERAPH_WING_AT: V3 = [0, 0.78, -0.14];
const SERAPH_ROWS: [number, number, number][] = [[0, 10, 1.1], [1, 8, 0.7], [2, 6, 0.42]];
const shardDir = (sx: number, row: number, u: number) => norm([sx * lerp(0.45, 1.0, u) * (1 - row * 0.1), lerp(1.0, 0.2, u), lerp(-0.35, -0.75, u)]);
const shardLen = (u: number, k: number) => (0.55 + Math.sin(u * Math.PI) * 0.45 + (1 - u) * 0.4) * k;

/** Wings of crystal: three rows of shards from the shoulder blades, raised and spread (ship axes). */
function seraphWings(s: Scene) {
  for (const sx of [-1, 1]) {
    const root: V3 = [sx * 0.13, 0, 0];
    s.sphere(root, 0.06, SILVER, 0.03);
    for (const [row, n, k] of SERAPH_ROWS) {
      for (let f = 0; f < n; f++) {
        const u = f / (n - 1);
        const dir = shardDir(sx, row, u);
        const a = add(root, [0, -row * 0.03, row * 0.03]);
        const col = row === 2 ? SILVER : row === 1 ? BLUED : f % 2 ? PEARL : SILVER;
        s.blade(a, add(a, mul(dir, shardLen(u, k))), row ? 0.085 : 0.065, 0.026, norm(cross(dir, [sx, 0, 0])), col, 0.01, 0, 0.01);
      }
    }
  }
}

function seraphWingJewels(): Jewel[] {
  const out: Jewel[] = [];
  for (const sx of [-1, 1]) {
    const n = SERAPH_ROWS[0][1];
    for (let f = 0; f < n; f++) {
      const u = f / (n - 1);
      out.push({ at: add([sx * 0.13, 0, 0], mul(shardDir(sx, 0, u), shardLen(u, SERAPH_ROWS[0][2]))), r: 0.032, kind: f % 2 ? 'star' : 'aether' });
    }
  }
  return out;
}

// ------------------------------------------------------------------ catalogue

const both = (f: (sx: number) => Jewel[]) => [...f(-1), ...f(1)];

export const BEASTS: Record<string, Piece[]> = {
  lion: [
    { name: 'body', bucket: 'wood', frame: { kind: 'body' }, cell: 0.0055, tris: 6000, error: 0.004, build: lionBody },
    { name: 'shield', bucket: 'iron', frame: { kind: 'body' }, cell: 0.004, tris: 1400, error: 0.003, build: lionShield },
    { name: 'head', bucket: 'wood', frame: { kind: 'head', at: [0, 1.0, 0.06], tilt: 0 }, cell: 0.0042, tris: 4200, error: 0.0035, build: lionHead },
  ],
  eagle: [
    { name: 'body', bucket: 'wood', frame: { kind: 'body' }, cell: 0.0055, tris: 5000, error: 0.004, build: eagleBody, jewels: [{ at: [0, -0.1, 0.16], r: 0.14, kind: 'gold' }] },
    { name: 'head', bucket: 'wood', frame: { kind: 'head', at: [0, 1.05, 0.08], tilt: 0 }, cell: 0.0035, tris: 2200, error: 0.003, build: eagleHead },
    { name: 'wings', bucket: 'wood', frame: { kind: 'ship', at: [0, 0.72, -0.08] }, cell: 0.0065, tris: 6500, error: 0.005, build: eagleWings },
  ],
  kraken: [
    { name: 'body', bucket: 'iron', frame: { kind: 'body' }, cell: 0.0055, tris: 8000, error: 0.004, build: krakenBody, jewels: both((sx) => [{ at: [sx * 0.255, 0.5, 0.19], r: 0.045, kind: 'ruby' }]) },
    { name: 'reach', bucket: 'iron', frame: { kind: 'ship', at: [0, 0.45, 0] }, cell: 0.006, tris: 4000, error: 0.004, build: krakenReach },
  ],
  dragon: [
    { name: 'body', bucket: 'iron', frame: { kind: 'body' }, cell: 0.0055, tris: 7000, error: 0.004, build: dragonBody },
    { name: 'head', bucket: 'iron', frame: { kind: 'head', at: [0, 1.2, 0.36], tilt: -0.3 }, cell: 0.004, tris: 4000, error: 0.003, build: dragonHead, jewels: both((sx) => [{ at: [sx * 0.08, 0.045, 0.112], r: 0.024, kind: 'ember' }, { at: [sx * 0.03, 0.03, 0.39], r: 0.011, kind: 'ember' }]) },
    { name: 'bones', bucket: 'iron', frame: { kind: 'ship', at: DRAGON_WING_AT }, cell: 0.006, tris: 2200, error: 0.004, build: dragonWingBones },
    { name: 'webs', bucket: 'wood', frame: { kind: 'ship', at: DRAGON_WING_AT }, cell: 0.006, tris: 2000, error: 0.004, build: dragonWingWebs },
  ],
  seraph: [
    { name: 'body', bucket: 'iron', frame: { kind: 'body' }, cell: 0.0055, tris: 6000, error: 0.004, build: seraphBody },
    { name: 'head', bucket: 'iron', frame: { kind: 'head', at: [0, 1.07, 0.03], tilt: -0.45 }, cell: 0.0032, tris: 2200, error: 0.0025, build: seraphHead, jewels: both((sx) => [{ at: [sx * 0.032, 0.01, 0.1], r: 0.008, kind: 'aether' }]) },
    { name: 'wings', bucket: 'iron', frame: { kind: 'ship', at: SERAPH_WING_AT }, cell: 0.0065, tris: 4500, error: 0.005, build: seraphWings, jewels: seraphWingJewels() },
  ],
};
