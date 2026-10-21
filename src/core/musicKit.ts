// The voyage band's instruments, synthesised offline once (in a worker) the
// first time a song is wanted: nylon guitar and upright bass by plucked-string
// waveguides, steel pan, marimba and kalimba by modal synthesis, and a crate
// of hand percussion. Each note in a song then costs one buffer playback,
// pitched from the nearest of a few recorded roots. The sustained voices
// (whistle, fiddle, accordion, strings) are played live in ./voyageMusic.

export const KIT_SR = 32000;

export type Tonal = 'gtr' | 'pan' | 'mar' | 'kal' | 'bass';
export type Drum = 'bod' | 'bodHi' | 'conga' | 'congaLo' | 'shk' | 'clave' | 'kick';
export type KitKind = Tonal | Drum | 'verb';

/** The pitches (midi) each tonal instrument is sampled at; a note plays from the nearest. */
export const KIT_ROOTS: Record<Tonal, number[]> = {
  gtr: [40, 45, 50, 55, 60, 65, 70, 75],
  pan: [60, 65, 70, 75, 80, 85],
  mar: [45, 52, 59, 66, 73, 80],
  kal: [60, 67, 74, 81],
  bass: [28, 33, 38, 43, 48],
};
/** Variants per drum (alternated so a groove never machine-guns one sample). */
export const DRUM_VARIANTS: Record<Drum, number> = { bod: 2, bodHi: 2, conga: 2, congaLo: 1, shk: 3, clave: 1, kick: 1 };

type Rand = () => number;

function rng(seed: number): Rand {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Topology-preserving state-variable filter. */
class SVF {
  lp = 0;
  bp = 0;
  hp = 0;
  private ic1 = 0;
  private ic2 = 0;
  private k = 1;
  private a1 = 0;
  private a2 = 0;
  private a3 = 0;
  constructor(
    private sr: number,
    fc = 1000,
    q = 0.707,
  ) {
    this.set(fc, q);
  }
  set(fc: number, q = 0.707) {
    const g = Math.tan((Math.PI * Math.min(fc, this.sr * 0.45)) / this.sr);
    this.k = 1 / q;
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }
  run(x: number) {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.lp = v2;
    this.bp = v1;
    this.hp = x - this.k * v1 - v2;
  }
}

const TAU = Math.PI * 2;
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function finish(a: Float32Array, sr: number, peak = 0.9, tail = 0.12) {
  let p = 0;
  for (let i = 0; i < a.length; i++) p = Math.max(p, Math.abs(a[i]));
  const s = p > 0 ? peak / p : 0;
  const n = Math.min(a.length, Math.floor(sr * tail));
  for (let i = 0; i < a.length; i++) a[i] *= s;
  for (let i = 0; i < n; i++) a[a.length - 1 - i] *= i / n;
  return a;
}

/**
 * A plucked string (extended Karplus-Strong): a noise burst shaped by where
 * the finger plucks, circulating in a tuned delay line whose loss filter
 * eats the highs a little more on every pass, so it rings bright and mellows,
 * then a hollow body (two air and wood resonances) colours it.
 */
function pluck(sr: number, midi: number, seed: number, o: { dur: number; t60: number; tone: number; pos: number; body: [number, number, number][]; sub?: number }) {
  const r = rng(seed);
  const f = hz(midi);
  const n = Math.floor(sr * o.dur);
  const out = new Float32Array(n);
  const P = sr / f;
  const N = Math.max(2, Math.floor(P - 0.5));
  const frac = P - 0.5 - N;
  const C = (1 - frac) / (1 + frac);
  const line = new Float32Array(N);
  // excitation: darker for a soft fingertip, with the pluck point's comb notch
  const ex = new SVF(sr, Math.min(f * o.tone, 9000), 0.6);
  const raw = new Float32Array(N);
  for (let i = 0; i < N * 2; i++) {
    ex.run(r() * 2 - 1);
    if (i >= N) raw[i - N] = ex.lp;
  }
  const off = Math.max(1, Math.round(N * o.pos));
  let mean = 0;
  for (let i = 0; i < N; i++) {
    line[i] = raw[i] - raw[(i + off) % N];
    mean += line[i];
  }
  mean /= N;
  for (let i = 0; i < N; i++) line[i] -= mean;
  const rho = Math.pow(10, -3 / (f * o.t60));
  const body = o.body.map(([fc, q]) => new SVF(sr, fc, q));
  let idx = 0;
  let last = 0;
  let apX = 0;
  let apY = 0;
  for (let i = 0; i < n; i++) {
    const x = line[idx];
    const y = rho * (0.5 * x + 0.5 * last);
    last = x;
    const ap = C * y + apX - C * apY;
    apX = y;
    apY = ap;
    line[idx] = ap;
    idx = idx + 1 === N ? 0 : idx + 1;
    let s = x;
    for (let b = 0; b < body.length; b++) {
      body[b].run(x);
      s += body[b].bp * o.body[b][2];
    }
    out[i] = s;
  }
  // a little extra fundamental: the weight under a thumb or a bass string
  if (o.sub) {
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      out[i] += Math.sin(TAU * f * t) * o.sub * (1 - Math.exp(-t / 0.004)) * Math.exp(-t / (o.t60 * 0.22));
    }
  }
  return out;
}

/** Struck idiophones: a sum of decaying partials plus the mallet's thump. */
function modal(
  sr: number,
  midi: number,
  seed: number,
  dur: number,
  partials: [ratio: number, amp: number, tau: number, swell?: number][],
  mallet: { amp: number; cut: number; tau: number },
  bend = 0,
) {
  const r = rng(seed);
  const f = hz(midi);
  const n = Math.floor(sr * dur);
  const out = new Float32Array(n);
  for (const [ratio, amp, tau, swell] of partials) {
    const fp = f * ratio;
    if (fp > sr * 0.45) continue;
    let ph = r() * TAU;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const fNow = fp * (1 + bend * Math.exp(-t / 0.018));
      ph += (TAU * fNow) / sr;
      const env = (1 - Math.exp(-t / 0.0015)) * Math.exp(-t / tau) * (swell ? 1 - Math.exp(-t / swell) * 0.85 : 1);
      out[i] += Math.sin(ph) * amp * env;
    }
  }
  const lp = new SVF(sr, mallet.cut, 0.7);
  const m = Math.min(n, Math.floor(sr * mallet.tau * 8));
  for (let i = 0; i < m; i++) {
    lp.run(r() * 2 - 1);
    out[i] += lp.lp * mallet.amp * Math.exp(-i / sr / mallet.tau);
  }
  return out;
}

function guitar(sr: number, m: number, seed: number) {
  const lo = (m - 40) / 35;
  return finish(
    pluck(sr, m, seed, {
      dur: 2.6 - lo * 0.8,
      t60: 5 - lo * 3,
      tone: 9 - lo * 4,
      pos: 0.13,
      body: [
        [104, 3.5, 0.55],
        [212, 2.6, 0.32],
        [2600, 0.9, 0.12],
      ],
      sub: 0.15,
    }),
    sr,
  );
}

function upright(sr: number, m: number, seed: number) {
  return finish(
    pluck(sr, m, seed, {
      dur: 1.9,
      t60: 3.2,
      tone: 3.2,
      pos: 0.22,
      body: [
        [72, 2.2, 0.6],
        [150, 2, 0.3],
      ],
      sub: 0.9,
    }),
    sr,
  );
}

function steelPan(sr: number, m: number, seed: number) {
  const k = Math.pow(2, -(m - 60) / 24);
  return finish(
    modal(
      sr,
      m,
      seed,
      2.4 * k + 0.5,
      [
        [1, 1, 1.15 * k],
        [1.0034, 0.42, 0.95 * k],
        [2.002, 0.62, 0.62 * k, 0.03],
        [3.006, 0.24, 0.32 * k, 0.02],
        [4.03, 0.08, 0.16 * k],
        [5.08, 0.035, 0.09 * k],
      ],
      { amp: 0.22, cut: 1400, tau: 0.006 },
    ),
    sr,
  );
}

function marimba(sr: number, m: number, seed: number) {
  const k = Math.pow(2, -(m - 60) / 30);
  return finish(
    modal(
      sr,
      m,
      seed,
      1.3 * k + 0.4,
      [
        [1, 1, 0.75 * k],
        [3.93, 0.32, 0.11 * k],
        [9.2, 0.1, 0.035],
      ],
      { amp: 0.16, cut: 2600, tau: 0.004 },
    ),
    sr,
  );
}

function kalimba(sr: number, m: number, seed: number) {
  const k = Math.pow(2, -(m - 60) / 24);
  return finish(
    modal(
      sr,
      m,
      seed,
      2.4 * k + 0.6,
      [
        [1, 1, 1.6 * k],
        [2.0, 0.05, 0.4 * k],
        [5.92, 0.28, 0.1],
        [9.6, 0.06, 0.03],
      ],
      { amp: 0.12, cut: 4200, tau: 0.002 },
      0.006,
    ),
    sr,
  );
}

/** A pitched skin: a sine thump sagging in pitch plus a band of slap noise. */
function skin(sr: number, seed: number, o: { f0: number; f1: number; drop: number; tau: number; dur: number; noise: number; band: number; q: number; ntau: number; over?: number }) {
  const r = rng(seed);
  const n = Math.floor(sr * o.dur);
  const out = new Float32Array(n);
  const bp = new SVF(sr, o.band, o.q);
  let ph = 0;
  let ph2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = o.f1 + (o.f0 - o.f1) * Math.exp(-t / o.drop);
    ph += (TAU * f) / sr;
    ph2 += (TAU * f * 1.59) / sr;
    const env = (1 - Math.exp(-t / 0.0012)) * Math.exp(-t / o.tau);
    bp.run(r() * 2 - 1);
    out[i] = Math.sin(ph) * env + Math.sin(ph2) * env * Math.exp(-t / (o.tau * 0.35)) * (o.over ?? 0) + bp.bp * o.noise * Math.exp(-t / o.ntau);
  }
  return finish(out, sr, 0.9, 0.02);
}

function shaker(sr: number, seed: number) {
  const r = rng(seed);
  const n = Math.floor(sr * 0.16);
  const out = new Float32Array(n);
  const bp = new SVF(sr, 6800 + r() * 1200, 1.1);
  const hp = new SVF(sr, 3000, 0.7);
  const rise = 0.01 + r() * 0.008;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    // beads: a grainy, not smooth, hiss
    const grain = r() < 0.35 ? r() * 2 - 1 : (r() * 2 - 1) * 0.25;
    bp.run(grain);
    hp.run(bp.bp);
    out[i] = hp.hp * Math.min(1, t / rise) * Math.exp(-Math.max(0, t - rise) / 0.035);
  }
  return finish(out, sr, 0.9, 0.02);
}

function clave(sr: number, seed: number) {
  return finish(
    modal(
      sr,
      91,
      seed,
      0.18,
      [
        [1, 1, 0.045],
        [2.7, 0.25, 0.012],
      ],
      { amp: 0.25, cut: 5000, tau: 0.0015 },
    ),
    sr,
    0.9,
    0.02,
  );
}

/** A warm, dark hall for the band: diffuse, decorrelated left and right, the highs dying first. */
function musicHall(sr: number, seed: number): Float32Array[] {
  const n = Math.floor(sr * 2.2);
  const chans: Float32Array[] = [];
  for (let c = 0; c < 2; c++) {
    const r = rng(seed + c * 131);
    const a = new Float32Array(n);
    let z = 0;
    let coef = 0;
    const pre = 0.018 + c * 0.004;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if ((i & 31) === 0) coef = Math.exp((-TAU * (1100 + 7000 * Math.exp(-t / 0.35))) / sr);
      z = (1 - coef) * (r() * 2 - 1) + coef * z;
      const on = t < pre ? 0 : 1 - Math.exp(-(t - pre) / 0.05);
      a[i] = z * on * Math.exp(-t / 0.5);
    }
    // a few early reflections off the walls
    for (let k = 0; k < 7; k++) {
      const at = Math.floor((0.011 + r() * 0.07) * sr);
      a[at] += (r() < 0.5 ? -1 : 1) * (0.5 - k * 0.05);
    }
    chans.push(a);
  }
  // set by energy, not peak: a steady note comes back from the hall a little under what went in
  for (const a of chans) {
    let e = 0;
    for (let i = 0; i < n; i++) e += a[i] * a[i];
    const g = 0.8 / Math.sqrt(e);
    for (let i = 0; i < n; i++) a[i] *= g;
    const f = Math.floor(sr * 0.3);
    for (let i = 0; i < f; i++) a[n - 1 - i] *= i / f;
  }
  return chans;
}

export interface KitJob {
  kind: KitKind;
  index: number;
  /** The buffer's sample rate: KIT_SR, except the reverb, which must match the context. */
  sr: number;
  render: () => Float32Array[];
}

/** Every sample the band needs, the guitar and the hall first (every song uses them). */
export function kitJobs(ctxRate: number): KitJob[] {
  const sr = KIT_SR;
  const jobs: KitJob[] = [];
  jobs.push({ kind: 'verb', index: 0, sr: ctxRate, render: () => musicHall(ctxRate, 7) });
  KIT_ROOTS.gtr.forEach((m, i) => jobs.push({ kind: 'gtr', index: i, sr, render: () => [guitar(sr, m, 100 + i)] }));
  KIT_ROOTS.bass.forEach((m, i) => jobs.push({ kind: 'bass', index: i, sr, render: () => [upright(sr, m, 200 + i)] }));
  KIT_ROOTS.pan.forEach((m, i) => jobs.push({ kind: 'pan', index: i, sr, render: () => [steelPan(sr, m, 300 + i)] }));
  KIT_ROOTS.mar.forEach((m, i) => jobs.push({ kind: 'mar', index: i, sr, render: () => [marimba(sr, m, 400 + i)] }));
  KIT_ROOTS.kal.forEach((m, i) => jobs.push({ kind: 'kal', index: i, sr, render: () => [kalimba(sr, m, 500 + i)] }));
  const drum = (kind: Drum, make: (v: number) => Float32Array) => {
    for (let v = 0; v < DRUM_VARIANTS[kind]; v++) jobs.push({ kind, index: v, sr, render: () => [make(v)] });
  };
  drum('bod', (v) => skin(sr, 600 + v, { f0: 120, f1: 68 - v * 4, drop: 0.035, tau: 0.17, dur: 0.6, noise: 0.35, band: 520, q: 1.1, ntau: 0.03, over: 0.25 }));
  drum('bodHi', (v) => skin(sr, 610 + v, { f0: 260, f1: 180 + v * 12, drop: 0.012, tau: 0.05, dur: 0.25, noise: 0.5, band: 1600, q: 1.3, ntau: 0.015 }));
  drum('conga', (v) => skin(sr, 620 + v, { f0: 380, f1: 318 + v * 18, drop: 0.01, tau: 0.13, dur: 0.45, noise: 0.45, band: 2400, q: 1.6, ntau: 0.008, over: 0.3 }));
  drum('congaLo', (v) => skin(sr, 630 + v, { f0: 250, f1: 205, drop: 0.012, tau: 0.2, dur: 0.6, noise: 0.3, band: 1500, q: 1.4, ntau: 0.01, over: 0.25 }));
  drum('shk', (v) => shaker(sr, 640 + v));
  drum('clave', (v) => clave(sr, 650 + v));
  drum('kick', (v) => skin(sr, 660 + v, { f0: 95, f1: 50, drop: 0.04, tau: 0.22, dur: 0.6, noise: 0.08, band: 300, q: 0.8, ntau: 0.01 }));
  return jobs;
}
