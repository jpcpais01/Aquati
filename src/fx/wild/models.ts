import * as THREE from 'three';
import {
  Sculpt, Paint, V3, C3, TubeRing, hex, mix3, mul3, flat,
  BODY, LEG, TAIL, WING, SPEC_A, SPEC_B, AX_X, AX_Y, AX_Z, TUCK_A,
} from './rig';
import { smoothstep } from '../../core/noise';

// The fifteen island beasts, sculpted. Each is built nose to +z, standing on
// y = 0, at life size in metres (the game scales them up a touch to read from
// the deck). Every part is tagged with the joint that moves it (see rig.ts),
// and every vertex carries two colourings, so one mesh dresses a whole
// species: buck and doe, scarlet and blue-and-gold, sow and striped piglet.

const M = (p: V3, s: number): V3 => [p[0] * s, p[1], p[2]];
const ring = (p: V3, rx: number, ry = rx): TubeRing => ({ p, rx, ry });
const W = [0.9, 0.9, 0.88] as C3;
const EYE: Paint = flat(hex(0x0c0a08));
/** A weight that ramps from 0 at `a` to 1 at `b` along one axis. */
const ramp = (axis: 0 | 1 | 2, a: number, b: number) => (p: THREE.Vector3) => smoothstep(a, b, axis === 0 ? Math.abs(p.x) : axis === 1 ? p.y : p.z);

/** A weight that ramps from 0 at `a` to 1 at `b`, measured along the line between them (a neck bends evenly through its thickness). */
const along = (a: V3, b: V3, lo = 0, hi = 1) => {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const l2 = d.lengthSq();
  return (p: THREE.Vector3) => smoothstep(lo, hi, ((p.x - a[0]) * d.x + (p.y - a[1]) * d.y + (p.z - a[2]) * d.z) / l2);
};

/** A leg: hip, then joints down to the foot. */
function leg(s: Sculpt, rings: TubeRing[], phase: number, paint: Paint, axis = AX_X, sides = 6) {
  s.set({ part: LEG, z: phase, f: axis, piv: rings[0].p });
  s.tube(rings, paint, sides, 0.3, 0.45);
}

/** Painted by height: hooves and lower legs darker than the coat above. */
const shin = (coat: C3, low: C3, altCoat: C3 = coat, altLow: C3 = low, knee = 0.25, hoof = 0.05, hoofC: C3 = hex(0x2a2420)): Paint => (p) => {
  if (p.y < hoof) return [hoofC, hoofC];
  const k = smoothstep(knee, knee * 0.5, p.y);
  return [mix3(coat, low, k), mix3(altCoat, altLow, k)];
};

// ---------------------------------------------------------------- goat

export function goatGeometry(): THREE.BufferGeometry {
  const s = new Sculpt([0, 0.68, 0.3]);
  const brown = hex(0x8a5632);
  const tan = hex(0xc7a173);
  const dark = hex(0x3e2a1c);
  const white = hex(0xece6d8);
  const cream = hex(0xd8ccb4);
  // A: a brown goat with a dark dorsal stripe; B: a white one with a tan face
  const coat: Paint = (p, n) => {
    const stripe = n.y > 0.82 && Math.abs(p.x) < 0.05 ? 1 : 0;
    const k = smoothstep(-0.4, 0.3, n.y);
    return [stripe ? dark : mix3(tan, brown, k), mix3(cream, white, k)];
  };
  s.set({ part: BODY }).tube([
    ring([0, 0.74, -0.52], 0.07, 0.08), ring([0, 0.73, -0.44], 0.16, 0.2), ring([0, 0.7, -0.22], 0.2, 0.26),
    ring([0, 0.7, 0.06], 0.21, 0.27), ring([0, 0.74, 0.28], 0.18, 0.24), ring([0, 0.8, 0.4], 0.12, 0.15),
  ], coat, 10, 0.5, 0.4);
  // neck: bends from the chest, the head following it all the way
  const neckW = along([0, 0.8, 0.34], [0, 1.07, 0.52], 0.05, 1);
  s.set({ part: BODY, hw: neckW }).tube([ring([0, 0.8, 0.34], 0.09, 0.1), ring([0, 0.96, 0.46], 0.075, 0.08), ring([0, 1.07, 0.52], 0.06, 0.065)], coat, 8, 0.2, 0.2);
  const face: Paint = (p, n) => {
    const muzzle = smoothstep(0.66, 0.76, p.z);
    return [mix3(mix3(tan, brown, smoothstep(-0.3, 0.4, n.y)), dark, muzzle * 0.6), mix3(tan, hex(0x9a6a40), muzzle * 0.7)];
  };
  s.set({ part: BODY, hw: 1 }).tube([ring([0, 1.12, 0.5], 0.065, 0.07), ring([0, 1.11, 0.6], 0.058, 0.064), ring([0, 1.04, 0.72], 0.042, 0.046), ring([0, 1.0, 0.77], 0.03, 0.032)], face, 8, 0.6, 0.7);
  s.blob([0, 1.0, 0.71], [0.022, 0.03, 0.03], flat(dark, hex(0x6a4a30)), 6, 4); // beard
  s.tube([ring([0, 0.99, 0.7], 0.018), ring([0, 0.9, 0.68], 0.006)], flat(dark, hex(0x6a4a30)), 5, 0.2, 0.6);
  for (const sd of [1, -1]) {
    s.set({ part: BODY, hw: 1 }).blob(M([0.056, 1.13, 0.6], sd), [0.014, 0.014, 0.014], flat(hex(0xb8902a)), 6, 4);
    s.blob(M([0.064, 1.135, 0.603], sd), [0.007, 0.009, 0.007], EYE, 5, 3);
    // horns sweep up and back
    s.tube([ring(M([0.035, 1.17, 0.55], sd), 0.022), ring(M([0.05, 1.25, 0.52], sd), 0.018), ring(M([0.07, 1.31, 0.44], sd), 0.012), ring(M([0.09, 1.3, 0.36], sd), 0.005)], flat(hex(0x5a5048), hex(0x8a7a64)), 6, 0.2, 0.5);
    // ears flick out sideways
    s.set({ part: SPEC_A, f: sd, piv: M([0.05, 1.13, 0.55], sd), hw: 1 });
    s.slab([M([0.05, 1.14, 0.56], sd), M([0.15, 1.12, 0.54], sd), M([0.17, 1.1, 0.5], sd), M([0.06, 1.11, 0.52], sd)], 0.012, face, flat(hex(0xd8a890)), [0, 1, 0]);
  }
  const lg = shin(brown, dark, white, cream, 0.3, 0.05);
  for (const sd of [1, -1]) {
    leg(s, [ring(M([0.1, 0.66, 0.3], sd), 0.07), ring(M([0.1, 0.32, 0.32], sd), 0.048), ring(M([0.1, 0.07, 0.31], sd), 0.036), ring(M([0.1, 0.0, 0.33], sd), 0.038)], sd > 0 ? Math.PI / 2 : Math.PI * 1.5, lg);
    leg(s, [ring(M([0.11, 0.68, -0.36], sd), 0.085), ring(M([0.11, 0.34, -0.44], sd), 0.05), ring(M([0.1, 0.07, -0.38], sd), 0.036), ring(M([0.1, 0.0, -0.36], sd), 0.038)], sd > 0 ? 0 : Math.PI, lg);
  }
  s.set({ part: TAIL, piv: [0, 0.84, -0.48] }).tube([ring([0, 0.84, -0.48], 0.035), ring([0, 0.92, -0.54], 0.03), ring([0, 0.97, -0.53], 0.012)], flat(dark, cream), 6, 0.3, 0.6);
  return s.geometry();
}

// ---------------------------------------------------------------- deer

export function deerGeometry(stag: boolean): THREE.BufferGeometry {
  const s = new Sculpt([0, 0.82, 0.32]);
  const red = hex(0x9a5a30);
  const belly = hex(0xe9dcc6);
  const dark = hex(0x3a2418);
  // A: summer red coat; B: a dappled fawn
  const coat: Paint = (p, n) => {
    const k = smoothstep(-0.45, 0.15, n.y);
    const a = mix3(belly, red, k);
    const spot = n.y > 0.1 && Math.sin(p.x * 61 + p.z * 13) * Math.sin(p.z * 57 - p.y * 31) > 0.55 && Math.abs(p.x) > 0.04;
    return [a, spot ? hex(0xf2e6d0) : mix3(belly, hex(0xa8683a), k)];
  };
  s.set({ part: BODY }).tube([
    ring([0, 0.88, -0.48], 0.06, 0.07), ring([0, 0.9, -0.4], 0.15, 0.17), ring([0, 0.88, -0.16], 0.17, 0.2),
    ring([0, 0.89, 0.1], 0.17, 0.21), ring([0, 0.93, 0.3], 0.14, 0.18), ring([0, 0.99, 0.4], 0.09, 0.12),
  ], coat, 10, 0.5, 0.4);
  s.set({ part: BODY, hw: along([0, 0.98, 0.36], [0, 1.3, 0.52], -0.15, 1) }).tube([ring([0, 0.98, 0.36], 0.08, 0.1), ring([0, 1.14, 0.46], 0.065, 0.075), ring([0, 1.3, 0.52], 0.055, 0.06)], coat, 8, 0.2, 0.2);
  const face: Paint = (p, n) => {
    const nose = smoothstep(0.75, 0.8, p.z);
    const c = mix3(mix3(belly, red, smoothstep(-0.4, 0.3, n.y)), dark, nose);
    return [c, c];
  };
  s.set({ part: BODY, hw: 1 }).tube([ring([0, 1.34, 0.49], 0.06, 0.065), ring([0, 1.32, 0.6], 0.052, 0.058), ring([0, 1.24, 0.73], 0.032, 0.036), ring([0, 1.21, 0.78], 0.024, 0.026)], face, 8, 0.6, 0.8);
  for (const sd of [1, -1]) {
    s.set({ part: BODY, hw: 1 }).blob(M([0.05, 1.35, 0.6], sd), [0.013, 0.015, 0.016], EYE, 6, 4);
    s.set({ part: SPEC_A, f: sd, piv: M([0.04, 1.38, 0.5], sd), hw: 1 });
    s.slab([M([0.04, 1.38, 0.51], sd), M([0.1, 1.47, 0.49], sd), M([0.15, 1.52, 0.47], sd), M([0.15, 1.48, 0.45], sd), M([0.07, 1.4, 0.48], sd)], 0.012, face, flat(hex(0xe0b8a8)), [0, 0, 1]);
    if (stag) {
      // a young stag's first branched antlers
      const bone = flat(hex(0xc8b490));
      const a: V3 = M([0.03, 1.4, 0.53], sd);
      const b: V3 = M([0.1, 1.55, 0.5], sd);
      const c: V3 = M([0.14, 1.72, 0.44], sd);
      s.set({ part: BODY, hw: 1 }).tube([ring(a, 0.02), ring(b, 0.016), ring(c, 0.01), ring(M([0.15, 1.8, 0.4], sd), 0.004)], bone, 5, 0.2, 0.5);
      s.tube([ring(b, 0.012), ring(M([0.12, 1.64, 0.6], sd), 0.007), ring(M([0.13, 1.68, 0.64], sd), 0.003)], bone, 5, 0.2, 0.5);
      s.tube([ring(c, 0.01), ring(M([0.2, 1.8, 0.48], sd), 0.003)], bone, 5, 0.2, 0.5);
    }
  }
  const lg = shin(red, hex(0x6a3a20), hex(0xa8683a), hex(0x6a3a20), 0.35, 0.05, hex(0x1e1814));
  for (const sd of [1, -1]) {
    leg(s, [ring(M([0.09, 0.82, 0.3], sd), 0.05), ring(M([0.09, 0.42, 0.32], sd), 0.03), ring(M([0.09, 0.06, 0.31], sd), 0.022), ring(M([0.09, 0.0, 0.33], sd), 0.024)], sd > 0 ? Math.PI / 2 : Math.PI * 1.5, lg);
    leg(s, [ring(M([0.1, 0.84, -0.34], sd), 0.075), ring(M([0.1, 0.44, -0.46], sd), 0.035), ring(M([0.09, 0.06, -0.38], sd), 0.022), ring(M([0.09, 0.0, -0.36], sd), 0.024)], sd > 0 ? 0 : Math.PI, lg);
  }
  // the white flag under the tail
  const flag: Paint = (_p, n) => (n.y > 0.2 ? [red, hex(0xa8683a)] : [W, W]);
  s.set({ part: TAIL, piv: [0, 0.95, -0.48] }).tube([ring([0, 0.95, -0.48], 0.045, 0.03), ring([0, 0.88, -0.55], 0.04, 0.025), ring([0, 0.81, -0.58], 0.015)], flag, 6, 0.3, 0.6);
  return s.geometry();
}

// ---------------------------------------------------------------- boar

export function boarGeometry(): THREE.BufferGeometry {
  const s = new Sculpt([0, 0.5, 0.32]);
  const bristle = hex(0x6a5646);
  const grey = hex(0x846e5a);
  const rufous = hex(0x9a6238);
  const stripe = hex(0xe0c89a);
  // A: a bristly sow; B: a piglet in its humbug stripes
  const coat: Paint = (p, n) => {
    const k = smoothstep(-0.3, 0.8, n.y);
    const mane = n.y > 0.85 ? 0.6 : 0;
    const band = p.z < 0.4 && n.y < 0.85 && Math.cos(Math.atan2(n.y, Math.abs(n.x)) * 5) > 0.2;
    return [mix3(mix3(grey, bristle, k), hex(0x3a2e24), mane), band ? stripe : mix3(hex(0xc89a68), rufous, k)];
  };
  s.set({ part: BODY }).tube([
    ring([0, 0.5, -0.52], 0.1, 0.12), ring([0, 0.52, -0.42], 0.19, 0.22), ring([0, 0.55, -0.12], 0.22, 0.26),
    ring([0, 0.59, 0.16], 0.22, 0.28), ring([0, 0.57, 0.34], 0.18, 0.23), ring([0, 0.53, 0.44], 0.13, 0.17),
  ], coat, 10, 0.5, 0.3);
  const snout = hex(0x9a7a6a);
  const head: Paint = (p, n) => {
    const c = coat(p, n, 0);
    const k = smoothstep(0.72, 0.8, p.z);
    return [mix3(c[0], snout, k), mix3(c[1], hex(0xc89a8a), k)];
  };
  s.set({ part: BODY, hw: 1 }).tube([ring([0, 0.56, 0.38], 0.15, 0.17), ring([0, 0.5, 0.55], 0.12, 0.13), ring([0, 0.41, 0.71], 0.07, 0.068), ring([0, 0.37, 0.8], 0.058, 0.052)], head, 9, 0.2, 0.15);
  s.blob([0, 0.37, 0.815], [0.05, 0.045, 0.012], flat(hex(0x6a4a44), hex(0xa06a64)), 8, 3); // the snout's disc
  for (const sd of [1, -1]) {
    s.set({ part: BODY, hw: 1 }).blob(M([0.075, 0.55, 0.56], sd), [0.01, 0.012, 0.012], EYE, 5, 3);
    s.tube([ring(M([0.055, 0.37, 0.72], sd), 0.012), ring(M([0.075, 0.42, 0.75], sd), 0.008), ring(M([0.07, 0.45, 0.74], sd), 0.002)], flat(hex(0xe8dcc0), hex(0x9a7a6a)), 5, 0.2, 0.5);
    s.set({ part: SPEC_A, f: sd, piv: M([0.07, 0.66, 0.42], sd), hw: 1 });
    s.slab([M([0.06, 0.66, 0.43], sd), M([0.12, 0.77, 0.38], sd), M([0.14, 0.66, 0.37], sd)], 0.014, flat(bristle, rufous), flat(hex(0x7a5a4a)), [0, 0, 1]);
  }
  const lg = shin(grey, bristle, rufous, hex(0x6a4228), 0.2, 0.04, hex(0x1a1410));
  for (const sd of [1, -1]) {
    leg(s, [ring(M([0.1, 0.45, 0.28], sd), 0.065), ring(M([0.1, 0.2, 0.3], sd), 0.038), ring(M([0.1, 0.0, 0.31], sd), 0.032)], sd > 0 ? Math.PI / 2 : Math.PI * 1.5, lg);
    leg(s, [ring(M([0.11, 0.46, -0.34], sd), 0.08), ring(M([0.11, 0.24, -0.41], sd), 0.04), ring(M([0.11, 0.0, -0.36], sd), 0.032)], sd > 0 ? 0 : Math.PI, lg);
  }
  s.set({ part: TAIL, piv: [0, 0.56, -0.52], w: ramp(2, -0.52, -0.6) }).tube([ring([0, 0.56, -0.52], 0.016), ring([0, 0.46, -0.58], 0.012), ring([0, 0.37, -0.57], 0.02)], flat(bristle, rufous), 5, 0.3, 0.8);
  return s.geometry();
}

// ---------------------------------------------------------------- capuchin

export function monkeyGeometry(): THREE.BufferGeometry {
  const s = new Sculpt([0, 0.38, 0.18]);
  s.lift = -0.05;
  const fur = hex(0x4a3424);
  const cream = hex(0xead6b2);
  const gold = hex(0x9a7444);
  const pale = hex(0xf2e2c4);
  const body: Paint = (p, n) => {
    // the cream mantle over the shoulders and throat
    const mantle = p.z > 0.1 && (n.y < 0.2 || n.z > 0.5) ? 1 : 0;
    return [mantle ? cream : fur, mantle ? pale : gold];
  };
  s.set({ part: BODY }).tube([ring([0, 0.33, -0.21], 0.08), ring([0, 0.34, -0.12], 0.12, 0.115), ring([0, 0.36, 0.04], 0.125, 0.125), ring([0, 0.38, 0.15], 0.105, 0.11), ring([0, 0.4, 0.22], 0.07, 0.075)], body, 9, 0.5, 0.3);
  const face: Paint = (_p, n) => {
    const cap = n.y > 0.55 ? 1 : 0;
    const front = n.z > 0.35 && !cap;
    return [cap ? hex(0x1e1610) : front ? cream : fur, cap ? hex(0x5a4228) : front ? pale : gold];
  };
  s.set({ part: BODY, hw: 1 }).blob([0, 0.47, 0.28], [0.07, 0.074, 0.068], face, 10, 7);
  s.blob([0, 0.44, 0.335], [0.036, 0.03, 0.03], flat(hex(0xd8a888), hex(0xe8c0a0)), 7, 4);
  for (const sd of [1, -1]) {
    s.blob(M([0.066, 0.48, 0.27], sd), [0.012, 0.022, 0.02], flat(hex(0xc89a80)), 5, 3);
    s.blob(M([0.025, 0.47, 0.335], sd), [0.009, 0.009, 0.006], EYE, 5, 3);
  }
  const limb: Paint = flat(fur, gold);
  s.lift = 0;
  for (const sd of [1, -1]) {
    leg(s, [ring(M([0.08, 0.32, 0.15], sd), 0.048), ring(M([0.09, 0.16, 0.19], sd), 0.037), ring(M([0.085, 0.0, 0.17], sd), 0.032)], sd > 0 ? Math.PI / 2 : Math.PI * 1.5, limb);
    leg(s, [ring(M([0.08, 0.28, -0.15], sd), 0.06), ring(M([0.1, 0.15, -0.07], sd), 0.044), ring(M([0.085, 0.0, -0.14], sd), 0.034)], sd > 0 ? 0 : Math.PI, limb);
  }
  s.lift = -0.05;
  // the long tail, curling at the tip
  s.set({ part: TAIL, piv: [0, 0.36, -0.2], w: ramp(2, -0.18, -0.75) }).tube([
    ring([0, 0.36, -0.2], 0.03), ring([0, 0.4, -0.34], 0.026), ring([0, 0.47, -0.5], 0.022), ring([0, 0.54, -0.63], 0.019),
    ring([0, 0.56, -0.74], 0.016), ring([0, 0.5, -0.8], 0.014), ring([0, 0.45, -0.76], 0.012),
  ], limb, 6, 0.3, 0.8);
  return s.geometry();
}

// ---------------------------------------------------------------- macaw

export function macawGeometry(): THREE.BufferGeometry {
  const s = new Sculpt([0, 0.24, 0.1]);
  s.lift = -0.07;
  const red = hex(0xd21c16);
  const yellow = hex(0xf4c014);
  const blue = hex(0x1c48c8);
  const gold = hex(0xf2b014);
  const sky = hex(0x1a6ad8);
  const body: Paint = (_p, n) => [red, n.y > -0.15 ? sky : gold];
  s.set({ part: BODY }).blob([0, 0.22, 0], [0.065, 0.07, 0.15], body, 9, 7);
  const face: Paint = (p, n) => {
    const patch = Math.abs(n.x) > 0.45 && p.z > 0.16;
    const brow = n.y > 0.5 && p.z > 0.18;
    return [patch ? W : red, patch ? W : brow ? hex(0x3a9a40) : n.y < -0.3 ? gold : sky];
  };
  s.set({ part: BODY, hw: 1 }).blob([0, 0.275, 0.165], [0.05, 0.056, 0.058], face, 9, 6);
  s.tube([ring([0, 0.285, 0.205], 0.026, 0.028), ring([0, 0.272, 0.245], 0.02, 0.024), ring([0, 0.235, 0.258], 0.008), ring([0, 0.215, 0.248], 0.003)], flat(hex(0xe8dcc8), hex(0x202020)), 6, 0.2, 0.4);
  s.tube([ring([0, 0.248, 0.2], 0.02, 0.016), ring([0, 0.238, 0.228], 0.012, 0.01)], flat(hex(0x1a1a1a)), 5, 0.2, 0.5);
  for (const sd of [1, -1]) s.blob(M([0.042, 0.285, 0.185], sd), [0.007, 0.008, 0.008], flat(hex(0xe8e0c0)), 5, 3);
  // the long tail streams behind
  s.set({ part: TAIL, piv: [0, 0.21, -0.12], w: ramp(2, -0.1, -0.5) }).tube([ring([0, 0.215, -0.12], 0.04, 0.014), ring([0, 0.2, -0.3], 0.03, 0.01), ring([0, 0.19, -0.48], 0.012, 0.006)], (p) => [p.z < -0.38 ? blue : red, p.z < -0.3 ? hex(0x2a4ac0) : sky], 6, 0.3, 0.8);
  for (const sd of [1, -1]) {
    // red coverts, a band of yellow, blue flight feathers (or blue over gold)
    const top: Paint = (p) => {
      const x = Math.abs(p.x);
      return [x < 0.17 ? red : x < 0.25 ? yellow : blue, x < 0.28 ? sky : blue];
    };
    const under: Paint = (p) => [Math.abs(p.x) < 0.2 ? red : hex(0x8a3a5a), gold];
    s.set({ part: WING, f: sd, piv: M([0.05, 0.245, 0.04], sd), w: ramp(0, 0.06, 0.47) });
    s.slab([
      M([0.05, 0.245, 0.08], sd), M([0.2, 0.25, 0.07], sd), M([0.36, 0.245, 0.02], sd), M([0.47, 0.24, -0.06], sd),
      M([0.42, 0.24, -0.11], sd), M([0.3, 0.245, -0.11], sd), M([0.15, 0.245, -0.09], sd), M([0.05, 0.245, -0.06], sd),
    ], 0.012, top, under, [0, 1, 0]);
    s.lift = 0;
    leg(s, [ring(M([0.03, 0.1, 0.03], sd), 0.016), ring(M([0.03, 0.04, 0.05], sd), 0.012), ring(M([0.03, 0.0, 0.07], sd), 0.01)], sd > 0 ? 0 : Math.PI, flat(hex(0x5a5a5a)));
    s.lift = -0.07;
  }
  return s.geometry();
}

// ---------------------------------------------------------------- pelican

export function pelicanGeometry(): THREE.BufferGeometry {
  const s = new Sculpt([0, 0.62, 0.22]);
  s.lift = -0.2;
  const grey = hex(0x8a8278);
  const silver = hex(0xb4ada2);
  const brown = hex(0x8a7462);
  const body: Paint = (_p, n) => [n.y > 0.2 ? silver : grey, n.y > 0.2 ? hex(0x8a7a66) : brown];
  s.set({ part: BODY }).blob([0, 0.55, 0], [0.17, 0.16, 0.36], body, 10, 7);
  s.tube([ring([0, 0.56, -0.28], 0.1, 0.06), ring([0, 0.55, -0.44], 0.05, 0.02)], flat(hex(0x4a423a)), 6, 0.3, 0.5);
  const neck: Paint = (_p, n) => [n.z < -0.2 ? hex(0x5a3424) : hex(0xf0ead8), brown];
  s.set({ part: BODY, hw: along([0, 0.62, 0.24], [0, 0.9, 0.27]) }).tube([ring([0, 0.62, 0.24], 0.065), ring([0, 0.74, 0.29], 0.055), ring([0, 0.84, 0.25], 0.05), ring([0, 0.9, 0.27], 0.05)], neck, 8, 0.2, 0.2);
  s.set({ part: BODY, hw: 1 }).blob([0, 0.92, 0.3], [0.052, 0.056, 0.075], flat(hex(0xf2e6b8), hex(0x8a7058)), 8, 5);
  for (const sd of [1, -1]) s.blob(M([0.042, 0.935, 0.34], sd), [0.008, 0.008, 0.008], flat(hex(0xd8d0a0)), 5, 3);
  s.tube([ring([0, 0.925, 0.36], 0.03, 0.018), ring([0, 0.89, 0.58], 0.026, 0.013), ring([0, 0.865, 0.72], 0.02, 0.012), ring([0, 0.85, 0.745], 0.006)], flat(hex(0x9a8a72)), 7, 0.2, 0.5);
  // the pouch opens downward from the bill
  s.set({ part: SPEC_A, f: 0, piv: [0, 0.9, 0.36], hw: 1 }).tube([ring([0, 0.89, 0.37], 0.026, 0.016), ring([0, 0.85, 0.52], 0.028, 0.032), ring([0, 0.86, 0.69], 0.014, 0.01)], flat(hex(0x4a3e34)), 7, 0.2, 0.5);
  const feet = flat(hex(0x2a2826));
  for (const sd of [1, -1]) {
    s.lift = 0;
    leg(s, [ring(M([0.07, 0.27, -0.05], sd), 0.04), ring(M([0.07, 0.12, 0.0], sd), 0.028), ring(M([0.07, 0.02, 0.05], sd), 0.024)], sd > 0 ? 0 : Math.PI, feet);
    s.slab([M([0.07, 0.008, 0.03], sd), M([0.14, 0.008, 0.16], sd), M([0.07, 0.008, 0.19], sd), M([0.0, 0.008, 0.16], sd)], 0.01, feet, feet, [0, 1, 0]);
    s.lift = -0.2;
    const top: Paint = (p) => {
      const x = Math.abs(p.x);
      const tip = x > 0.7 || p.z < -0.15 ? 1 : 0;
      return [tip ? hex(0x2e2620) : silver, tip ? hex(0x3a2e24) : hex(0x8a7a66)];
    };
    s.set({ part: WING, f: sd, piv: M([0.12, 0.62, 0.1], sd), w: ramp(0, 0.14, 1.0) });
    s.slab([
      M([0.12, 0.62, 0.16], sd), M([0.45, 0.63, 0.17], sd), M([0.8, 0.62, 0.1], sd), M([1.02, 0.61, 0.0], sd),
      M([0.98, 0.61, -0.08], sd), M([0.8, 0.61, -0.14], sd), M([0.5, 0.62, -0.2], sd), M([0.2, 0.62, -0.2], sd), M([0.12, 0.62, -0.14], sd),
    ], 0.016, top, flat(grey, brown), [0, 1, 0]);
  }
  return s.geometry();
}

// ---------------------------------------------------------------- blue-footed booby

export function boobyGeometry(): THREE.BufferGeometry {
  const s = new Sculpt([0, 0.5, 0.15]);
  s.lift = -0.18;
  const brown = hex(0x8a6a52);
  const white = hex(0xf2efe8);
  const streak = hex(0xd6c8b0);
  const foot = hex(0x1aa8e0);
  const body: Paint = (_p, n) => (n.y > 0.15 ? [brown, hex(0x5a4434)] : [white, hex(0xd8d0c4)]);
  s.set({ part: BODY }).blob([0, 0.42, 0], [0.11, 0.12, 0.24], body, 9, 7);
  s.set({ part: TAIL, piv: [0, 0.42, -0.2] }).tube([ring([0, 0.42, -0.2], 0.05, 0.02), ring([0, 0.4, -0.37], 0.006, 0.004)], flat(brown), 6, 0.3, 0.5);
  const head: Paint = (p) => {
    const k = Math.sin(p.y * 160 + p.x * 40) > 0.4 ? 0.82 : 1;
    return [mul3(streak, k), mul3(hex(0x9a8a74), k)];
  };
  s.set({ part: BODY, hw: ramp(1, 0.5, 0.66) }).tube([ring([0, 0.5, 0.16], 0.055), ring([0, 0.6, 0.18], 0.045), ring([0, 0.67, 0.18], 0.045)], head, 8, 0.2, 0.2);
  s.set({ part: BODY, hw: 1 }).blob([0, 0.7, 0.2], [0.045, 0.05, 0.06], head, 8, 5);
  s.tube([ring([0, 0.705, 0.25], 0.024, 0.022), ring([0, 0.69, 0.33], 0.01), ring([0, 0.68, 0.37], 0.003)], flat(hex(0x7a8a9a)), 6, 0.2, 0.4);
  for (const sd of [1, -1]) s.blob(M([0.035, 0.715, 0.235], sd), [0.007, 0.008, 0.008], flat(hex(0xf0ecc0)), 5, 3);
  const feet = flat(foot, hex(0x6aa0c0));
  for (const sd of [1, -1]) {
    s.lift = 0;
    leg(s, [ring(M([0.05, 0.16, 0.02], sd), 0.03), ring(M([0.055, 0.07, 0.05], sd), 0.022), ring(M([0.055, 0.015, 0.05], sd), 0.02)], sd > 0 ? 0 : Math.PI, feet);
    s.set({ part: LEG, z: sd > 0 ? 0 : Math.PI, f: AX_X, piv: M([0.05, 0.16, 0.02], sd) });
    s.slab([M([0.055, 0.008, 0.02], sd), M([0.13, 0.008, 0.15], sd), M([0.06, 0.008, 0.2], sd), M([-0.005, 0.008, 0.15], sd)], 0.012, feet, feet, [0, 1, 0]);
    s.lift = -0.18;
    s.set({ part: WING, f: sd, piv: M([0.09, 0.48, 0.08], sd), w: ramp(0, 0.1, 0.75) });
    s.slab([
      M([0.09, 0.48, 0.12], sd), M([0.35, 0.49, 0.11], sd), M([0.6, 0.48, 0.03], sd), M([0.76, 0.47, -0.06], sd),
      M([0.6, 0.47, -0.1], sd), M([0.3, 0.48, -0.13], sd), M([0.09, 0.48, -0.1], sd),
    ], 0.014, flat(brown), flat(hex(0xd8d0c8), hex(0x8a7a6a)), [0, 1, 0]);
  }
  return s.geometry();
}

// ---------------------------------------------------------------- flamingo

export function flamingoGeometry(): THREE.BufferGeometry {
  const s = new Sculpt([0, 1.0, 0.2]);
  const pink = hex(0xf7a0b0);
  const coral = hex(0xf07080);
  const ash = hex(0xddd4d0);
  const legC = flat(hex(0xe8687a), hex(0x9a8a88));
  s.set({ part: BODY }).blob([0, 0.98, 0], [0.13, 0.13, 0.25], (_p, n) => [n.y > 0.4 ? coral : pink, n.y > 0.4 ? hex(0xc8bab4) : ash], 9, 7);
  s.tube([ring([0, 0.99, -0.2], 0.07, 0.05), ring([0, 0.96, -0.33], 0.02, 0.01)], flat(hex(0x1e1a1a), hex(0x4a4444)), 6, 0.3, 0.5);
  // the S of the neck, bending from its root in the chest
  s.set({ part: BODY, hw: ramp(1, 1.0, 1.6) }).tube([
    ring([0, 1.02, 0.18], 0.05), ring([0, 1.12, 0.24], 0.036), ring([0, 1.25, 0.25], 0.03), ring([0, 1.38, 0.21], 0.028),
    ring([0, 1.5, 0.2], 0.028), ring([0, 1.6, 0.23], 0.03), ring([0, 1.64, 0.27], 0.033),
  ], flat(pink, ash), 7, 0.2, 0.2);
  s.set({ part: BODY, hw: 1 }).blob([0, 1.66, 0.3], [0.035, 0.04, 0.05], flat(pink, ash), 8, 5);
  for (const sd of [1, -1]) s.blob(M([0.03, 1.675, 0.31], sd), [0.007, 0.007, 0.007], flat(hex(0xf0d020)), 5, 3);
  s.tube([ring([0, 1.67, 0.34], 0.02, 0.022), ring([0, 1.655, 0.4], 0.018, 0.02), ring([0, 1.6, 0.43], 0.014), ring([0, 1.55, 0.42], 0.007)], (p) => (p.y < 1.62 ? [hex(0x141010), hex(0x141010)] : [hex(0xf0c4c4), hex(0xb8b0b0)]), 6, 0.2, 0.5);
  for (const sd of [1, -1]) {
    // the right leg folds up into the feathers for the one-legged rest
    leg(s, [ring(M([0.05, 0.92, 0.0], sd), 0.022), ring(M([0.05, 0.5, -0.04], sd), 0.017), ring(M([0.05, 0.04, 0.0], sd), 0.012), ring(M([0.05, 0.0, 0.05], sd), 0.012)], sd > 0 ? 0 : Math.PI, legC, AX_X + (sd < 0 ? TUCK_A : 0), 5);
    s.set({ part: LEG, z: sd > 0 ? 0 : Math.PI, f: AX_X + (sd < 0 ? TUCK_A : 0), piv: M([0.05, 0.92, 0.0], sd) });
    s.slab([M([0.05, 0.006, 0.02], sd), M([0.09, 0.006, 0.11], sd), M([0.05, 0.006, 0.13], sd), M([0.01, 0.006, 0.11], sd)], 0.008, legC, legC, [0, 1, 0]);
    const top: Paint = (p) => {
      const x = Math.abs(p.x);
      const black = x > 0.55 || (p.z < -0.08 && x > 0.25);
      return [black ? hex(0x161212) : coral, black ? hex(0x3a3434) : hex(0xd8ccc8)];
    };
    s.set({ part: WING, f: sd, piv: M([0.1, 1.02, 0.1], sd), w: ramp(0, 0.12, 0.85) });
    s.slab([M([0.1, 1.02, 0.14], sd), M([0.4, 1.03, 0.13], sd), M([0.7, 1.02, 0.05], sd), M([0.86, 1.02, -0.05], sd), M([0.7, 1.02, -0.12], sd), M([0.4, 1.02, -0.15], sd), M([0.1, 1.02, -0.12], sd)], 0.014, top, flat(pink, ash), [0, 1, 0]);
  }
  return s.geometry();
}

// ---------------------------------------------------------------- egret / heron

export function egretGeometry(): THREE.BufferGeometry {
  const s = new Sculpt([0, 0.75, 0.14]);
  // A: a great egret, snow white; B: a slate-grey heron with a white neck
  const slate = hex(0xa2acb6);
  const body: Paint = (_p, n) => [W, n.y > -0.2 ? slate : hex(0xd0d6dc)];
  s.set({ part: BODY }).blob([0, 0.72, 0], [0.09, 0.1, 0.2], body, 9, 6);
  s.tube([ring([0, 0.72, -0.18], 0.05, 0.03), ring([0, 0.7, -0.3], 0.008)], flat(W, slate), 6, 0.3, 0.5);
  s.set({ part: BODY, hw: ramp(1, 0.76, 1.15) }).tube([
    ring([0, 0.75, 0.14], 0.04), ring([0, 0.85, 0.2], 0.03), ring([0, 0.95, 0.17], 0.024), ring([0, 1.03, 0.1], 0.022),
    ring([0, 1.1, 0.1], 0.022), ring([0, 1.16, 0.15], 0.024),
  ], flat(W, hex(0xe8e8e4)), 7, 0.2, 0.2);
  s.set({ part: BODY, hw: 1 }).blob([0, 1.18, 0.18], [0.028, 0.032, 0.045], (_p, n) => [W, n.y > 0.6 ? hex(0x34383c) : W], 8, 5);
  for (const sd of [1, -1]) s.blob(M([0.022, 1.188, 0.2], sd), [0.006, 0.006, 0.006], flat(hex(0xf0d030)), 5, 3);
  s.tube([ring([0, 1.18, 0.215], 0.013, 0.014), ring([0, 1.175, 0.3], 0.006), ring([0, 1.17, 0.37], 0.0015)], flat(hex(0xf2c018), hex(0xd8a020)), 6, 0.2, 0.6);
  const legC = flat(hex(0x1e1e1c), hex(0x5a5040));
  for (const sd of [1, -1]) {
    leg(s, [ring(M([0.04, 0.66, 0.0], sd), 0.02), ring(M([0.04, 0.36, -0.03], sd), 0.013), ring(M([0.04, 0.02, 0.01], sd), 0.01)], sd > 0 ? 0 : Math.PI, legC, AX_X, 5);
    s.set({ part: LEG, z: sd > 0 ? 0 : Math.PI, f: AX_X, piv: M([0.04, 0.66, 0.0], sd) });
    s.slab([M([0.04, 0.005, -0.04], sd), M([0.09, 0.005, 0.1], sd), M([0.04, 0.005, 0.14], sd), M([0.0, 0.005, 0.1], sd)], 0.008, legC, legC, [0, 1, 0]);
    s.set({ part: WING, f: sd, piv: M([0.08, 0.76, 0.06], sd), w: ramp(0, 0.1, 0.8) });
    s.slab([M([0.08, 0.76, 0.1], sd), M([0.35, 0.77, 0.1], sd), M([0.65, 0.76, 0.03], sd), M([0.8, 0.76, -0.06], sd), M([0.65, 0.76, -0.12], sd), M([0.35, 0.76, -0.14], sd), M([0.08, 0.76, -0.1], sd)], 0.012, body, flat(W, hex(0xb8c0c8)), [0, 1, 0]);
  }
  return s.geometry();
}

// ---------------------------------------------------------------- iguana

export function iguanaGeometry(): THREE.BufferGeometry {
  const s = new Sculpt([0, 0.16, 0.24]);
  const green = hex(0x5c9a38);
  const belly = hex(0xa8c878);
  const band = hex(0x2a4a20);
  const rust = hex(0xb07038);
  const grey = hex(0x6e6a5c);
  const skin: Paint = (p, n) => {
    const k = smoothstep(-0.5, 0.3, n.y);
    const banded = p.z < -0.35 && ((-p.z * 7) % 1) < 0.38;
    const scales = Math.sin(p.x * 220) * Math.sin(p.z * 210) > 0.7 ? 0.9 : 1;
    return [mul3(banded ? band : mix3(belly, green, k), scales), mul3(banded ? hex(0x4a3a2a) : mix3(grey, rust, k), scales)];
  };
  s.set({ part: BODY }).tube([ring([0, 0.13, -0.26], 0.06, 0.055), ring([0, 0.15, -0.12], 0.09, 0.075), ring([0, 0.16, 0.05], 0.095, 0.08), ring([0, 0.16, 0.18], 0.075, 0.07), ring([0, 0.17, 0.26], 0.055, 0.058)], skin, 9, 0.2, 0.2);
  s.set({ part: BODY, hw: 1 }).tube([ring([0, 0.185, 0.28], 0.05, 0.052), ring([0, 0.185, 0.36], 0.045, 0.042), ring([0, 0.165, 0.44], 0.03, 0.028), ring([0, 0.155, 0.47], 0.015)], skin, 8, 0.2, 0.6);
  for (const sd of [1, -1]) {
    s.blob(M([0.045, 0.165, 0.31], sd), [0.016, 0.02, 0.02], flat(hex(0xc8d8a0), hex(0xd8c8a8)), 6, 4);
    s.blob(M([0.035, 0.205, 0.37], sd), [0.009, 0.009, 0.01], flat(hex(0x8a5a20)), 5, 3);
  }
  // the dewlap fans out under the throat: pale green, scaled, its edge saw-toothed in darker skin
  const dewlap: Paint = (p) => {
    const edge = p.y < 0.085 ? 1 : 0;
    return [edge ? hex(0x6a9a40) : mix3(hex(0xc8e098), hex(0xe8d088), smoothstep(0.14, 0.08, p.y)), edge ? hex(0x8a6a40) : hex(0xd8b890)];
  };
  s.set({ part: SPEC_A, f: 0, piv: [0, 0.145, 0.38], hw: 1 }).slab([[0, 0.145, 0.38], [0, 0.145, 0.27], [0, 0.07, 0.29], [0, 0.065, 0.35]], 0.008, dewlap, dewlap, [1, 0, 0]);
  // a crest of spines down the back
  const spine = flat(hex(0x7aaa50), hex(0x8a7a5a));
  for (let i = 0; i < 9; i++) {
    const z = 0.26 - i * 0.055;
    const y = 0.17 + 0.07 + (i < 3 ? 0.012 : 0);
    s.set({ part: i > 4 ? TAIL : BODY, piv: [0, 0.13, -0.22], w: i > 4 ? 0.05 : 1, hw: i < 1 ? 1 : 0 }).slab([[0, y - 0.04, z + 0.02], [0, y + (i < 4 ? 0.035 : 0.02), z - 0.005], [0, y - 0.04, z - 0.03]], 0.006, spine, spine, [1, 0, 0]);
  }
  s.set({ part: TAIL, piv: [0, 0.13, -0.22], w: ramp(2, -0.2, -1.05) }).tube([
    ring([0, 0.13, -0.22], 0.055, 0.05), ring([0, 0.11, -0.45], 0.04), ring([0, 0.08, -0.7], 0.026), ring([0, 0.05, -0.95], 0.013), ring([0, 0.03, -1.12], 0.005),
  ], skin, 7, 0.2, 0.6);
  for (const sd of [1, -1]) {
    leg(s, [ring(M([0.07, 0.13, 0.15], sd), 0.038), ring(M([0.15, 0.12, 0.18], sd), 0.028), ring(M([0.19, 0.0, 0.22], sd), 0.02)], sd > 0 ? 0 : Math.PI, skin, AX_Y);
    leg(s, [ring(M([0.07, 0.12, -0.16], sd), 0.045), ring(M([0.17, 0.1, -0.13], sd), 0.032), ring(M([0.2, 0.0, -0.22], sd), 0.021)], sd > 0 ? Math.PI : 0, skin, AX_Y);
  }
  return s.geometry();
}

// ---------------------------------------------------------------- giant tortoise

export function tortoiseGeometry(): THREE.BufferGeometry {
  const s = new Sculpt([0, 0.3, 0.42]);
  const shellD = hex(0x544a3c);
  const shellL = hex(0x9a8a68);
  const skinC = hex(0x948c7e);
  // scutes: paler centres ringed with darker growth lines
  const shell: Paint = (p) => {
    const u = p.x * 8.5;
    const v = p.z * 7 + (Math.floor(u + 0.5) % 2) * 0.5;
    const du = u - Math.round(u);
    const dv = v - Math.round(v);
    const r = Math.hypot(du, dv * 0.9);
    const k = smoothstep(0.5, 0.15, r) * (0.75 + 0.25 * Math.cos(r * 30));
    return [mix3(shellD, shellL, k), mix3(hex(0x6a5a40), hex(0xb0a070), k)];
  };
  s.set({ part: BODY }).blob([0, 0.36, 0], [0.42, 0.3, 0.52], shell, 14, 9);
  s.blob([0, 0.27, 0], [0.45, 0.08, 0.55], flat(hex(0x463e32), hex(0x5a4e3a)), 14, 4);
  const skin: Paint = (p) => (Math.sin(p.x * 120) * Math.sin(p.z * 110 + p.y * 90) > 0.6 ? [mul3(skinC, 0.85), mul3(skinC, 0.95)] : [skinC, mul3(skinC, 1.1)]);
  // the neck draws back into the shell (aRig.z = 1: the head joint's draw-back)
  s.set({ part: BODY, z: 1, hw: ramp(2, 0.3, 0.7) }).tube([ring([0, 0.3, 0.32], 0.1), ring([0, 0.32, 0.5], 0.085), ring([0, 0.38, 0.64], 0.072), ring([0, 0.44, 0.72], 0.065)], skin, 8, 0.2, 0.2);
  s.set({ part: BODY, z: 1, hw: 1 }).blob([0, 0.47, 0.8], [0.07, 0.065, 0.1], skin, 9, 6);
  for (const sd of [1, -1]) s.blob(M([0.055, 0.49, 0.83], sd), [0.011, 0.012, 0.012], EYE, 5, 3);
  s.tube([ring([0, 0.44, 0.86], 0.045, 0.012), ring([0, 0.44, 0.9], 0.02, 0.008)], flat(hex(0x2a2620)), 6, 0.2, 0.5);
  for (const sd of [1, -1]) {
    leg(s, [ring(M([0.3, 0.26, 0.32], sd), 0.1), ring(M([0.36, 0.12, 0.38], sd), 0.09), ring(M([0.36, 0.0, 0.38], sd), 0.095)], sd > 0 ? Math.PI / 2 : Math.PI * 1.5, skin, AX_X, 7);
    leg(s, [ring(M([0.28, 0.24, -0.32], sd), 0.1), ring(M([0.32, 0.1, -0.36], sd), 0.095), ring(M([0.32, 0.0, -0.36], sd), 0.1)], sd > 0 ? 0 : Math.PI, skin, AX_X, 7);
  }
  s.set({ part: TAIL, piv: [0, 0.22, -0.48] }).tube([ring([0, 0.22, -0.48], 0.04), ring([0, 0.14, -0.6], 0.008)], skin, 5, 0.3, 0.5);
  return s.geometry();
}

// ---------------------------------------------------------------- sea lion

export function sealGeometry(): THREE.BufferGeometry {
  const s = new Sculpt([0, 0.36, 0.4]);
  const wet = hex(0x6a5444);
  const belly = hex(0x94785e);
  const tan = hex(0x9a8060);
  const sand = hex(0xc0a888);
  const coat: Paint = (_p, n) => {
    const k = smoothstep(-0.5, 0.3, n.y);
    return [mix3(belly, wet, k), mix3(sand, tan, k)];
  };
  s.set({ part: BODY }).tube([
    ring([0, 0.17, -0.95], 0.06, 0.05), ring([0, 0.2, -0.8], 0.15, 0.12), ring([0, 0.25, -0.45], 0.26, 0.22),
    ring([0, 0.3, -0.05], 0.3, 0.27), ring([0, 0.33, 0.25], 0.27, 0.27), ring([0, 0.36, 0.42], 0.2, 0.22),
  ], coat, 11, 0.4, 0.3);
  s.set({ part: BODY, hw: along([0, 0.38, 0.46], [0, 0.53, 0.68]) }).tube([ring([0, 0.38, 0.46], 0.17, 0.18), ring([0, 0.47, 0.6], 0.12, 0.125), ring([0, 0.53, 0.68], 0.105, 0.105)], coat, 9, 0.2, 0.2);
  s.set({ part: BODY, hw: 1 }).blob([0, 0.56, 0.73], [0.1, 0.1, 0.12], coat, 10, 7);
  s.blob([0, 0.53, 0.84], [0.06, 0.05, 0.06], coat, 8, 5);
  s.blob([0, 0.545, 0.895], [0.022, 0.016, 0.012], flat(hex(0x141210)), 6, 3);
  for (const sd of [1, -1]) {
    s.blob(M([0.06, 0.6, 0.8], sd), [0.016, 0.018, 0.016], EYE, 6, 4);
    s.blob(M([0.085, 0.6, 0.72], sd), [0.008, 0.016, 0.01], coat, 5, 3);
  }
  const flip: Paint = flat(hex(0x463a30), hex(0x7a6650));
  for (const sd of [1, -1]) {
    // fore flippers prop the chest up; hind flippers turn forward under the hips to walk
    s.set({ part: LEG, z: sd > 0 ? 0 : Math.PI, f: AX_X, piv: M([0.22, 0.3, 0.32], sd) });
    s.tube([ring(M([0.2, 0.3, 0.32], sd), 0.07, 0.08), ring(M([0.29, 0.13, 0.38], sd), 0.05, 0.035)], coat, 7, 0.2, 0.2);
    s.slab([M([0.26, 0.15, 0.36], sd), M([0.4, 0.01, 0.42], sd), M([0.46, 0.01, 0.56], sd), M([0.4, 0.01, 0.6], sd), M([0.3, 0.1, 0.46], sd)], 0.02, flip, flip, [0, 1, 0]);
    s.set({ part: LEG, z: sd > 0 ? Math.PI : 0, f: AX_X, piv: M([0.09, 0.18, -0.86], sd) });
    s.slab([M([0.07, 0.17, -0.86], sd), M([0.26, 0.02, -1.15], sd), M([0.2, 0.02, -1.26], sd), M([0.1, 0.02, -1.22], sd), M([0.03, 0.12, -0.95], sd)], 0.018, flip, flip, [0, 1, 0]);
  }
  return s.geometry();
}

// ---------------------------------------------------------------- land crab

export function crabGeometry(): THREE.BufferGeometry {
  const s = new Sculpt();
  const red = hex(0xd8401a);
  const under = hex(0xf0a070);
  const sand = hex(0xd8c49a);
  const pale = hex(0xf2e6c8);
  const shellP: Paint = (_p, n) => (n.y > -0.2 ? [red, sand] : [under, pale]);
  s.set({ part: BODY }).blob([0, 0.075, 0], [0.1, 0.036, 0.075], shellP, 12, 6);
  const limb: Paint = flat(hex(0xe0582a), hex(0xe0cfa8));
  for (const sd of [1, -1]) {
    // eyes up on their stalks
    s.set({ part: SPEC_B, f: 0, piv: M([0.03, 0.095, 0.06], sd) });
    s.tube([ring(M([0.03, 0.095, 0.06], sd), 0.007), ring(M([0.035, 0.13, 0.066], sd), 0.006)], limb, 5, 0.2, 0.2);
    s.blob(M([0.035, 0.137, 0.067], sd), [0.011, 0.011, 0.011], EYE, 6, 4);
    // claws raise for the threat, and pick at the sand
    s.set({ part: SPEC_A, f: 0, piv: M([0.07, 0.065, 0.06], sd) });
    s.tube([ring(M([0.07, 0.065, 0.06], sd), 0.014), ring(M([0.105, 0.07, 0.1], sd), 0.014), ring(M([0.12, 0.07, 0.13], sd), 0.016)], limb, 6, 0.3, 0.3);
    s.blob(M([0.125, 0.07, 0.16], sd), [0.022, 0.017, 0.035], shellP, 7, 5);
    s.tube([ring(M([0.115, 0.07, 0.185], sd), 0.008), ring(M([0.11, 0.072, 0.215], sd), 0.003)], flat(hex(0xf0e0c8)), 4, 0.2, 0.4);
    for (let i = 0; i < 4; i++) {
      const z = 0.04 - i * 0.032;
      leg(s, [ring(M([0.08, 0.065, z], sd), 0.012), ring(M([0.14, 0.095, z * 1.3], sd), 0.011), ring(M([0.18, 0.0, z * 1.55 - 0.01], sd), 0.005)], i * Math.PI * 0.5 + (sd > 0 ? 0 : Math.PI), limb, AX_Z, 5);
    }
  }
  return s.geometry();
}

// ---------------------------------------------------------------- butterfly

export function butterflyGeometry(): THREE.BufferGeometry {
  const s = new Sculpt();
  const morpho = hex(0x2a8aff);
  const edge = hex(0x0c1220);
  const orange = hex(0xf08a18);
  const vein = hex(0x1a1008);
  const top: Paint = (p) => {
    const r = Math.hypot(p.x, p.z * 1.2);
    const rim = r > 0.058;
    const veined = !rim && Math.abs(Math.sin(Math.atan2(p.z, Math.abs(p.x)) * 9)) < 0.12;
    return [rim ? edge : mix3(morpho, hex(0x60c0ff), smoothstep(0.05, 0.02, r) * 0.5), rim || veined ? vein : orange];
  };
  const under: Paint = (p) => {
    const eye = Math.hypot(Math.abs(p.x) - 0.04, p.z + 0.012) < 0.01;
    return [eye ? hex(0xe8c070) : hex(0x6a5030), eye ? hex(0x2a2a2a) : hex(0xc88a40)];
  };
  s.set({ part: BODY }).tube([ring([0, 0, -0.035], 0.004), ring([0, 0, 0.0], 0.007), ring([0, 0.002, 0.025], 0.006)], flat(hex(0x1a1410)), 5, 0.5, 0.5);
  s.blob([0, 0.003, 0.033], [0.006, 0.006, 0.006], flat(hex(0x1a1410)), 5, 3);
  for (const sd of [1, -1]) {
    s.tube([ring(M([0.003, 0.006, 0.036], sd), 0.0012), ring(M([0.014, 0.018, 0.062], sd), 0.001), ring(M([0.016, 0.02, 0.066], sd), 0.0022)], flat(hex(0x1a1410)), 3, 0.2, 0.3);
    s.set({ part: WING, f: sd, piv: M([0.003, 0, 0], sd), w: 0 });
    s.slab([M([0.003, 0, 0.012], sd), M([0.05, 0, 0.032], sd), M([0.076, 0, 0.014], sd), M([0.066, 0, -0.012], sd), M([0.003, 0, -0.004], sd)], 0.002, top, under, [0, 1, 0]);
    s.slab([M([0.003, 0, -0.002], sd), M([0.055, 0, -0.018], sd), M([0.052, 0, -0.048], sd), M([0.022, 0, -0.058], sd), M([0.003, 0, -0.026], sd)], 0.002, top, under, [0, 1, 0]);
  }
  return s.geometry();
}

// ---------------------------------------------------------------- hummingbird

export function hummingbirdGeometry(): THREE.BufferGeometry {
  const s = new Sculpt([0, 0.005, 0.03]);
  const emerald = hex(0x22b050);
  const violet = hex(0x5a3ae0);
  const body: Paint = (p, n) => {
    const throat = n.y < -0.1 && p.z > 0.01;
    const belly = n.y < -0.3;
    return [throat ? hex(0xe0183a) : belly ? hex(0xd8dcd0) : emerald, throat ? hex(0x20d8c8) : belly ? hex(0xc8c8d8) : violet];
  };
  s.set({ part: BODY }).blob([0, 0, 0], [0.017, 0.018, 0.04], body, 8, 6);
  s.set({ part: BODY, hw: 1 }).blob([0, 0.012, 0.042], [0.014, 0.015, 0.016], body, 8, 5);
  for (const sd of [1, -1]) s.blob(M([0.011, 0.016, 0.05], sd), [0.004, 0.004, 0.004], EYE, 4, 3);
  s.tube([ring([0, 0.012, 0.056], 0.003), ring([0, 0.008, 0.11], 0.0008)], flat(hex(0x141414)), 4, 0.2, 0.3);
  s.set({ part: TAIL, piv: [0, 0, -0.035] }).slab([[0, 0.002, -0.032], [0.018, 0.0, -0.07], [0, 0.0, -0.075], [-0.018, 0.0, -0.07]], 0.003, flat(hex(0x1a4a2a), hex(0x2a2060)), flat(hex(0x2a2a2a)), [0, 1, 0]);
  const wing = flat(hex(0x3a4442), hex(0x3a3a48));
  for (const sd of [1, -1]) {
    s.set({ part: WING, f: sd, piv: M([0.01, 0.012, 0.01], sd), w: 0 });
    s.slab([M([0.01, 0.012, 0.014], sd), M([0.04, 0.014, 0.008], sd), M([0.066, 0.014, -0.004], sd), M([0.062, 0.014, -0.014], sd), M([0.01, 0.012, -0.008], sd)], 0.002, wing, wing, [0, 1, 0]);
  }
  return s.geometry();
}

/** Every species' meshes, in Wildlife's species order (see wildlife.ts SPECIES). */
export function wildGeometries(): THREE.BufferGeometry[][] {
  return [
    [goatGeometry()],
    [deerGeometry(false), deerGeometry(true)],
    [boarGeometry()],
    [monkeyGeometry()],
    [macawGeometry()],
    [pelicanGeometry()],
    [boobyGeometry()],
    [flamingoGeometry()],
    [egretGeometry()],
    [iguanaGeometry()],
    [tortoiseGeometry()],
    [sealGeometry()],
    [crabGeometry()],
    [butterflyGeometry()],
    [hummingbirdGeometry()],
  ];
}

