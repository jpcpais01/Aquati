// The figurehead catalogue, and the standard gilded mermaid. The part
// figures are in beasts.ts; what they share is in kit.ts.

import { add, lerp, lerp3, mul, norm, Scene, type V3 } from './sdf.ts';
import { GILT, GILT_DEEP, GILT_PALE, ladyFace, scales, strands, type Jewel, type Piece } from './kit.ts';
import { BEASTS } from './beasts.ts';

// ------------------------------------------------------------------ mermaid

function mermaidBody(s: Scene) {
  const g = GILT;
  const deep = GILT_DEEP;
  const pale = GILT_PALE;
  // torso: pelvis, a narrow waist, ribcage and shoulders, carved soft
  s.ellipsoid([0, 0.31, 0], [0.15, 0.11, 0.115], g, 0.0);
  s.ellipsoid([0, 0.46, 0.0], [0.108, 0.12, 0.086], g, 0.07);
  s.ellipsoid([0, 0.62, 0.0], [0.13, 0.12, 0.095], g, 0.07);
  for (const sx of [-1, 1]) s.ellipsoid([sx * 0.058, 0.655, 0.068], [0.062, 0.058, 0.05], g, 0.035);
  s.ellipsoid([0, 0.765, -0.012], [0.165, 0.058, 0.08], g, 0.06);
  for (const sx of [-1, 1]) s.sphere([sx * 0.152, 0.765, -0.008], 0.052, g, 0.04);
  // collarbones, navel, the line of the spine
  for (const sx of [-1, 1]) s.cone([sx * 0.025, 0.8, 0.06], [sx * 0.12, 0.79, 0.035], 0.012, 0.01, g, 0.02);
  s.sphere([0, 0.46, 0.088], 0.008, deep, 0.006, true);
  s.tube([[0, 0.45, -0.09], [0, 0.6, -0.1], [0, 0.75, -0.085]], { r: () => 0.012 }, deep, 0.02, true);
  // neck (the head piece sits over its top)
  s.cone([0, 0.79, 0.0], [0, 0.99, 0.025], 0.052, 0.045, g, 0.04);

  // a sash of pearls across her breast: the strand is carved, the pearls added in the game
  s.tube([[0.15, 0.8, 0.04], [0.08, 0.73, 0.115], [0.0, 0.66, 0.135], [-0.08, 0.6, 0.12], [-0.15, 0.55, 0.06]], { r: () => 0.016, relief: (_u, _a, l) => -0.006 * Math.pow(Math.abs(Math.sin(l * 90)), 2) }, pale, 0.012);

  // hips flow into the tail under a girdle of broad overlapping scales
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const out: V3 = [Math.sin(a), 0, Math.cos(a) * 0.78];
    const c: V3 = [Math.sin(a) * 0.15, 0.235, Math.cos(a) * 0.118];
    s.ellipsoid(c, [0.05, 0.075, 0.018], i % 2 ? pale : g, 0.012, [norm([Math.cos(a), 0, -Math.sin(a)]), norm([out[0] * 0.25, 1, out[2] * 0.25]), norm(out)]);
  }
  s.torus([0, 0.29, 0], [0, 1, 0], 0.142, 0.016, pale, 0.012);
  // the tail, scaled, down the front of the knee to a fluke spread across the cutwater
  const tail: V3[] = [[0, 0.3, 0.0], [0, 0.12, 0.05], [0, -0.1, 0.065], [0, -0.32, 0.04], [0, -0.48, 0.0], [0, -0.58, -0.05]];
  const tr = (u: number) => lerp(0.15, 0.04, Math.pow(u, 0.75));
  s.tube(tail, { r: tr, flat: 0.86, flatN: [1, 0, 0], relief: scales(0.062, 0.0055, tr), samples: 48 }, g, 0.05);
  // a ridge of fin down the back of the tail
  s.tube([[0, 0.05, -0.085], [0, -0.15, -0.075], [0, -0.35, -0.085], [0, -0.5, -0.09]], { r: (u) => lerp(0.022, 0.012, u), flat: 0.45, flatN: [1, 0, 0] }, deep, 0.03);
  // ship-up and ship-ahead in this frame, for a figure leaning about 1 rad
  const up: V3 = [0, 0.54, -0.84];
  const ahead: V3 = [0, 0.84, 0.54];
  for (const sx of [-1, 1]) {
    // side fins half way down, swept back along the knee
    s.blade([sx * 0.075, -0.26, 0.03], [sx * 0.22, -0.4, -0.08], 0.06, 0.02, [sx * 0.3, 0.2, 1], deep, 0.025, -0.015, 0.008);
    // the fluke: two broad lobes spread flat either side of the cutwater, tips curled up
    const fe: V3 = [0, -0.6, -0.06];
    const tip = add(add(fe, [sx * 0.3, 0, 0]), add(mul(up, 0.06), mul(ahead, -0.07)));
    s.blade(fe, tip, 0.13, 0.026, up, g, 0.035, 0.05, 0.01);
    for (let r = 0; r < 4; r++) {
      const f = 0.3 + r * 0.17;
      const end = add(add(fe, [sx * 0.3 * f, 0, 0]), add(mul(up, 0.06 * f + 0.012), mul(ahead, -0.07 * f + (r - 1.5) * 0.045)));
      s.tube([add(fe, [sx * 0.03, 0, 0]), end], { r: (u) => lerp(0.011, 0.006, u) }, deep, 0.012);
    }
  }

  // hair streaming back over her shoulders in long waved locks, fanned across her back
  for (let i = 0; i < 11; i++) {
    const u = i / 10;
    const a = lerp(-1.25, 1.25, u);
    const sx = Math.sin(a);
    const w = (i % 3 - 1) * 0.022;
    const len = 0.85 + 0.15 * Math.cos(u * 7);
    const pts: V3[] = [
      [sx * 0.07, 1.1, -0.08],
      [sx * 0.12, 1.0, -0.13],
      [sx * 0.155 + w, 0.88 - Math.abs(sx) * 0.05, -0.145],
      [sx * 0.175 - w, 0.77 - Math.abs(sx) * 0.04, -0.14],
      [sx * 0.17 + w, 0.62 * len + 0.08, -0.13],
      [sx * 0.14 - w * 0.5, 0.5 * len + 0.08, -0.115],
    ];
    s.tube(pts, { r: (t) => lerp(0.036, 0.012, Math.pow(t, 0.9)), flat: 0.55, flatN: [sx * 0.6, 0, -1], relief: strands(4, 0.005, 25), samples: 40 }, i % 2 ? deep : g, 0.014);
  }

  // right arm raised ahead holding up the pearl; left arm swept back, hand on her hip
  const arm = (pts: V3[]) => s.tube(pts, { r: (t) => (t < 0.45 ? lerp(0.046, 0.034, t / 0.45) : lerp(0.037, 0.026, (t - 0.45) / 0.55)), samples: 30 }, g, 0.03);
  const sh: V3 = [-0.152, 0.77, -0.008];
  const elbow: V3 = [-0.24, 0.92, 0.08];
  const wrist: V3 = [-0.2, 1.11, 0.2];
  arm([sh, [-0.21, 0.85, 0.03], elbow, [-0.23, 1.02, 0.14], wrist]);
  s.ellipsoid([-0.185, 1.145, 0.215], [0.03, 0.042, 0.022], g, 0.02, [norm([0.2, 0, 1]), norm([0.1, 1, 0.1]), norm([-1, 0.1, 0.2])]);
  for (let f = 0; f < 4; f++) {
    const base: V3 = [-0.205 + f * 0.016, 1.175, 0.225];
    s.tube([base, add(base, [0.004, 0.03, 0.02]), add(base, [0.008, 0.045, 0.045])], { r: (t) => lerp(0.0095, 0.007, t) }, g, 0.008);
  }
  s.tube([[-0.155, 1.15, 0.2], [-0.14, 1.18, 0.24], [-0.15, 1.2, 0.265]], { r: () => 0.009 }, g, 0.01);
  const lsh: V3 = [0.152, 0.77, -0.008];
  arm([lsh, [0.22, 0.68, -0.02], [0.235, 0.56, -0.05], [0.2, 0.44, -0.02], [0.16, 0.37, 0.04]]);
  s.ellipsoid([0.15, 0.345, 0.06], [0.028, 0.045, 0.02], g, 0.02, [norm([1, 0, 0.3]), norm([0, 1, 0]), norm([-0.3, 0, 1])]);
}

function mermaidHead(s: Scene) {
  const g = GILT;
  const deep = GILT_DEEP;
  const pale = GILT_PALE;
  ladyFace(s, g, deep, pale);
  // hair: parted at the crown, swept back over the ears in grooved waves
  s.ellipsoid([0, 0.045, -0.035], [0.095, 0.085, 0.09], g, 0.02);
  for (let i = 0; i < 6; i++) {
    for (const sx of [-1, 1]) {
      const f = i / 5;
      const pts: V3[] = [
        [sx * 0.012, 0.105, 0.04 - f * 0.08],
        [sx * (0.07 + f * 0.01), 0.075 - f * 0.02, 0.045 - f * 0.1],
        [sx * 0.098, -0.0 - f * 0.03, -0.02 - f * 0.08],
        [sx * 0.09, -0.08 - f * 0.02, -0.08 - f * 0.05],
        [sx * 0.07, -0.13, -0.14 - f * 0.03],
      ];
      s.tube(pts, { r: (t) => lerp(0.02, 0.026, t), flat: 0.55, flatN: [sx, 0.4, -0.2], relief: strands(3, 0.004, 30) }, f > 0.5 ? deep : g, 0.015);
    }
  }
  // a crown of seven points (pearls go on their tips in the game)
  s.torus([0, 0.092, -0.008], [0, 1, 0.12], 0.082, 0.013, pale, 0.01);
  s.torus([0, 0.112, -0.006], [0, 1, 0.12], 0.084, 0.008, g, 0.008);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const base: V3 = [Math.sin(a) * 0.084, 0.1, Math.cos(a) * 0.084 - 0.006];
    const tip: V3 = add(base, [Math.sin(a) * 0.02, 0.07, Math.cos(a) * 0.02]);
    s.cone(base, tip, 0.022, 0.005, g, 0.012);
  }
}


/** The tips of the mermaid's crown, in her head frame (pearls). */
export function mermaidCrownTips(): V3[] {
  return Array.from({ length: 7 }, (_, i) => {
    const a = (i / 7) * Math.PI * 2;
    return [Math.sin(a) * 0.104, 0.175, Math.cos(a) * 0.104 - 0.006] as V3;
  });
}

/** The pearl held up in her right hand, and the pearls strung on her sash. */
function mermaidBodyJewels(): Jewel[] {
  const sash: V3[] = [[0.15, 0.8, 0.04], [0.08, 0.73, 0.115], [0.0, 0.66, 0.135], [-0.08, 0.6, 0.12], [-0.15, 0.55, 0.06]];
  const out: Jewel[] = [{ at: [-0.172, 1.25, 0.25], r: 0.06, kind: 'pearl' }];
  for (let i = 0; i < sash.length - 1; i++) {
    for (const t of [0.25, 0.75]) {
      const p = lerp3(sash[i], sash[i + 1], t);
      out.push({ at: [p[0] * 1.06, p[1], p[2] + 0.016], r: 0.017, kind: 'pearl' });
    }
  }
  return out;
}

// ------------------------------------------------------------------ catalogue

export const MERMAID_HEAD: V3 = [0, 1.06, 0.03];

export const FIGURES: Record<string, Piece[]> = {
  mermaid: [
    { name: 'body', bucket: 'trim', frame: { kind: 'body' }, cell: 0.005, tris: 8000, error: 0.004, build: mermaidBody, jewels: mermaidBodyJewels() },
    { name: 'head', bucket: 'trim', frame: { kind: 'head', at: MERMAID_HEAD, tilt: 0.12 }, cell: 0.0032, tris: 1800, error: 0.0025, build: mermaidHead, jewels: mermaidCrownTips().map((at) => ({ at, r: 0.015, kind: 'pearl' })) },
  ],
  ...BEASTS,
};
