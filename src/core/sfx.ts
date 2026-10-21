// Offline sound design. Every effect is synthesised sample by sample into a
// plain Float32Array once at startup, so it can be far richer than a live
// WebAudio node graph (shock-wave pulses, saturation, modal wood, crackle),
// yet each shot in game costs a single buffer playback.

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

/** Topology-preserving state-variable filter: cheap, stable under sweeps. */
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

function peakNorm(a: Float32Array, to = 1) {
  let p = 0;
  for (let i = 0; i < a.length; i++) p = Math.max(p, Math.abs(a[i]));
  if (p > 0) {
    const s = to / p;
    for (let i = 0; i < a.length; i++) a[i] *= s;
  }
  return a;
}

function mix(dst: Float32Array, src: Float32Array, gain: number, offset = 0) {
  const n = Math.min(src.length, dst.length - offset);
  for (let i = 0; i < n; i++) dst[offset + i] += src[i] * gain;
}

function fadeTail(a: Float32Array, sr: number, sec = 0.08) {
  const n = Math.min(a.length, Math.floor(sr * sec));
  for (let i = 0; i < n; i++) a[a.length - 1 - i] *= i / n;
}

/** Soft saturation, normalised so a full-scale input stays full-scale. */
function saturate(a: Float32Array, drive: number) {
  const k = 1 / Math.tanh(drive);
  for (let i = 0; i < a.length; i++) a[i] = Math.tanh(a[i] * drive) * k;
}

/** Sparse transient grit: tiny resonant clicks, densest at the start. */
function crackle(
  dst: Float32Array,
  sr: number,
  r: Rand,
  count: number,
  t0: number,
  spread: number,
  fLo: number,
  fHi: number,
  amp: number,
) {
  for (let k = 0; k < count; k++) {
    const t = t0 + Math.pow(r(), 2.2) * spread;
    const start = Math.floor(t * sr);
    const f = fLo + (fHi - fLo) * r();
    const dec = 0.0008 + r() * 0.003;
    const a = amp * (0.25 + 0.75 * r()) * Math.exp(-(t - t0) / (spread * 0.45));
    const len = Math.floor(dec * 6 * sr);
    const ph = r() * TAU;
    for (let i = 0; i < len && start + i < dst.length; i++) {
      const tt = i / sr;
      dst[start + i] += Math.sin(ph + TAU * f * tt) * Math.exp(-tt / dec) * a * (r() * 0.6 + 0.7);
    }
  }
}

/** Damped modal resonator bank (wood, iron), excited by a short noise tap. */
function modal(dst: Float32Array, sr: number, r: Rand, freqs: number[], decays: number[], amps: number[], offset = 0) {
  for (let m = 0; m < freqs.length; m++) {
    const f = freqs[m] * (0.94 + r() * 0.12);
    const dec = decays[m];
    const ph = r() * TAU;
    const len = Math.min(dst.length - offset, Math.floor(dec * 7 * sr));
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      dst[offset + i] += Math.sin(ph + TAU * f * t) * Math.exp(-t / dec) * (1 - Math.exp(-t / 0.0008)) * amps[m];
    }
  }
}

/**
 * Black-powder muzzle blast. `cal` 0 = light 6-pounder, 1 = heavy 32-pounder;
 * values above 1 make something bigger than any gun (a magazine going up).
 *
 * Layers: a Friedlander shock pulse + noise crack (the supersonic "bang"),
 * a pitch-dropping chest thump and a sweeping fireball roar (saturated so the
 * low end grows harmonics phone speakers can actually play), a lumpy rolling
 * rumble and a sputter of burning powder grains.
 */
export function cannonBlast(sr: number, cal: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * (2.3 + cal * 0.7));
  // ---- crack: shock pulse + hard broadband burst
  const crack = new Float32Array(Math.floor(sr * 0.09));
  const td = 0.0035 + cal * 0.004;
  const hp = new SVF(sr, 1600 - cal * 500, 0.6);
  const crackDec = 0.0045 + cal * 0.003;
  for (let i = 0; i < crack.length; i++) {
    const t = i / sr;
    const fr = (1 - t / td) * Math.exp((-2.4 * t) / td);
    hp.run(r() * 2 - 1);
    const env = (1 - Math.exp(-t / 0.00025)) * (Math.exp(-t / crackDec) + 0.12 * Math.exp(-t / 0.025));
    crack[i] = fr * 0.6 + hp.hp * env;
  }
  peakNorm(crack);

  // ---- thump: sine with fast pitch drop + a detuned overtone
  const thump = new Float32Array(n);
  const f0 = 96 - cal * 32;
  const f1 = 38 - cal * 9;
  const tdec = 0.2 + cal * 0.16;
  let ph = 0;
  let ph2 = r() * TAU;
  for (let i = 0; i < Math.min(n, Math.floor(tdec * 9 * sr)); i++) {
    const t = i / sr;
    const f = f1 + (f0 - f1) * Math.exp(-t / 0.065);
    ph += (TAU * f) / sr;
    ph2 += (TAU * f * 2.07) / sr;
    const env = (1 - Math.exp(-t / 0.0022)) * Math.exp(-t / tdec);
    thump[i] = (Math.sin(ph) + 0.32 * Math.sin(ph2) * Math.exp(-t / 0.07)) * env;
  }
  peakNorm(thump);

  // ---- fireball roar: noise through a lowpass sweeping down from bright to dark
  const roar = new Float32Array(n);
  const body = new SVF(sr, 3000, 0.85);
  const tailT = 0.32 + cal * 0.25;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if ((i & 15) === 0) body.set(190 - cal * 50 + (3400 - cal * 1400) * Math.exp(-t / 0.055) + 520 * Math.exp(-t / 0.28), 0.85);
    body.run(r() * 2 - 1);
    const env = (1 - Math.exp(-t / 0.0012)) * (0.72 * Math.exp(-t / 0.075) + 0.28 * Math.exp(-t / tailT));
    roar[i] = body.lp * env;
  }
  peakNorm(roar);

  // ---- boom: the broad mid-low "body" that small speakers still carry
  const boom = new Float32Array(n);
  const bb = new SVF(sr, 300 - cal * 90, 1.1);
  const boomT = 0.14 + cal * 0.1;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    bb.run(r() * 2 - 1);
    boom[i] = bb.bp * (1 - Math.exp(-t / 0.003)) * Math.exp(-t / boomT);
  }
  peakNorm(boom);

  // ---- rolling rumble: dark noise, lumpy slow amplitude like thunder
  const rumble = new Float32Array(n);
  const rl = new SVF(sr, 240 + (1 - Math.min(cal, 1)) * 130, 0.65);
  const grit = new SVF(sr, 850, 0.5);
  const mf = [1.7 + r() * 1.5, 3.1 + r() * 2.5, 6 + r() * 4];
  const mp = [r() * TAU, r() * TAU, r() * TAU];
  const rDec = 0.65 + cal * 0.5;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const w = r() * 2 - 1;
    rl.run(w);
    grit.run(w);
    const lump = 1 + 0.45 * Math.sin(TAU * mf[0] * t + mp[0]) + 0.3 * Math.sin(TAU * mf[1] * t + mp[1]) + 0.2 * Math.sin(TAU * mf[2] * t + mp[2]);
    const env = (1 - Math.exp(-t / 0.04)) * Math.exp(-t / rDec);
    rumble[i] = (rl.lp + grit.lp * 0.18) * env * lump;
  }
  peakNorm(rumble);

  // ---- low bus, saturated for weight
  const low = new Float32Array(n);
  mix(low, thump, 0.62);
  mix(low, roar, 0.9);
  mix(low, boom, 0.85);
  mix(low, rumble, 0.22);
  peakNorm(low);
  saturate(low, 2.3);

  const out = new Float32Array(n);
  mix(out, low, 0.9);
  mix(out, crack, 0.7);
  const grains = new Float32Array(n);
  crackle(grains, sr, r, Math.floor(26 + cal * 30), 0.012, 0.32 + cal * 0.2, 1800, 6500, 1);
  mix(out, grains, 0.14);
  fadeTail(out, sr);
  return peakNorm(out, 0.95);
}

/**
 * The gun carriage slamming back on its trucks: a wooden knock, the iron
 * wheels rumbling over deck planks as it slows, then the breeching rope
 * snapping taut with a creak.
 */
export function gunRecoil(sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * 0.85);
  const out = new Float32Array(n);
  modal(out, sr, r, [88, 161, 247, 392, 618], [0.11, 0.075, 0.055, 0.035, 0.022], [1, 0.7, 0.5, 0.35, 0.22]);
  // trucks rolling over plank seams, slowing down
  const lp = new SVF(sr, 520, 0.8);
  let bump = 0;
  const stop = 0.34 + r() * 0.08;
  for (let i = 0; i < Math.floor(stop * sr); i++) {
    const t = i / sr;
    bump += (TAU * Math.max(5, 26 - 55 * t)) / sr;
    lp.run(r() * 2 - 1);
    const b = Math.pow(Math.abs(Math.sin(bump)), 10);
    out[i] += lp.lp * (0.25 + b * 1.6) * (1 - t / stop) * 5;
  }
  // breeching rope snaps taut
  const at = Math.floor((stop + 0.01) * sr);
  modal(out, sr, r, [64, 131, 205], [0.07, 0.045, 0.03], [0.6, 0.35, 0.2], at);
  const bp = new SVF(sr, 950 + r() * 300, 7);
  for (let i = 0; i < Math.floor(0.16 * sr) && at + i < n; i++) {
    const t = i / sr;
    bp.run(r() * 2 - 1);
    const saw = ((t * (52 + r() * 3)) % 1) * 2 - 1;
    out[at + i] += bp.bp * (0.6 + 0.4 * saw) * (1 - Math.exp(-t / 0.008)) * Math.exp(-t / 0.05) * 1.1;
  }
  fadeTail(out, sr);
  return peakNorm(out, 0.9);
}

/** A ship's powder magazine going up: one huge blast, kegs cooking off, debris raining down. */
export function magazineBlast(sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * 4.0);
  const out = new Float32Array(n);
  mix(out, cannonBlast(sr, 1.75, seed * 7 + 1), 1);
  const kegs = 2 + Math.floor(r() * 2);
  for (let k = 0; k < kegs; k++) {
    const at = Math.floor((0.28 + r() * 1.1) * sr);
    mix(out, cannonBlast(sr, 0.35 + r() * 0.4, seed * 13 + k), 0.28 + r() * 0.2, at);
  }
  // splintering timbers and flying debris
  noiseGrains(out, sr, r, { count: 260, t0: 0.03, spread: 1.9, skew: 2.2, fLo: 700, fHi: 6000, q: 1.2, durLo: 0.001, durHi: 0.008, amp: 0.9, env: (t) => Math.exp(-t / 0.8) });
  // wreckage splashing back down
  const bp = new SVF(sr, 1400, 0.9);
  for (let k = 0; k < 10; k++) {
    const at = Math.floor((1.0 + Math.pow(r(), 0.8) * 2.6) * sr);
    const a = 0.025 + r() * 0.045;
    const len = Math.floor(0.3 * sr);
    for (let i = 0; i < len && at + i < n; i++) {
      const t = i / sr;
      bp.run(r() * 2 - 1);
      out[at + i] += bp.bp * a * (1 - Math.exp(-t / 0.025)) * Math.exp(-t / 0.1) * 6;
    }
  }
  fadeTail(out, sr, 0.2);
  return peakNorm(out, 0.97);
}

/** Round shot tearing past overhead: doppler-dropping, ragged air rip. Peaks at 0.22s. */
export function shotWhoosh(sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * 0.9);
  const out = new Float32Array(n);
  const bp = new SVF(sr, 2000, 1.4);
  const lp = new SVF(sr, 300, 0.7);
  const peak = 0.22;
  const rf = 34 + r() * 14;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if ((i & 15) === 0) bp.set(650 + 2100 / (1 + Math.exp((t - peak) / 0.045)), 1.4);
    const w = r() * 2 - 1;
    bp.run(w);
    lp.run(w);
    const u = (t - peak) / (t < peak ? 0.085 : 0.17);
    const env = Math.exp(-u * u);
    const rip = 1 + 0.55 * Math.sin(TAU * rf * t + Math.sin(t * 23) * 2);
    out[i] = (bp.bp * rip + lp.lp * 0.9) * env;
  }
  fadeTail(out, sr);
  return peakNorm(out, 0.9);
}

/**
 * Granular noise: many tiny bursts of band-limited noise. Unlike sine clicks
 * these have no pitch, so en masse they read as spray, fizz or splinters.
 */
function noiseGrains(
  dst: Float32Array,
  sr: number,
  r: Rand,
  o: { count: number; t0: number; spread: number; skew: number; fLo: number; fHi: number; q: number; durLo: number; durHi: number; amp: number; env?: (t: number) => number },
) {
  const f = new SVF(sr);
  for (let k = 0; k < o.count; k++) {
    const t = o.t0 + Math.pow(r(), o.skew) * o.spread;
    const start = Math.floor(t * sr);
    f.set(o.fLo * Math.pow(o.fHi / o.fLo, r()), o.q);
    const dur = o.durLo + (o.durHi - o.durLo) * r() * r();
    const a = o.amp * (0.2 + 0.8 * r()) * (o.env ? o.env(t) : 1);
    const len = Math.floor(dur * 5 * sr);
    for (let i = 0; i < len && start + i < dst.length; i++) {
      const tt = i / sr;
      f.run(r() * 2 - 1);
      dst[start + i] += f.bp * (1 - Math.exp(-tt / 0.00025)) * Math.exp(-tt / dur) * a;
    }
  }
}

/** Smooth random amplitude flutter (values ~0.4..1.6), changing every `step` seconds. */
function flutter(r: Rand, sr: number, n: number, step: number, depth: number) {
  const out = new Float32Array(n);
  const hop = Math.max(1, Math.floor(step * sr));
  let a = 1 + (r() * 2 - 1) * depth;
  let b = 1 + (r() * 2 - 1) * depth;
  for (let i = 0; i < n; i++) {
    const k = i % hop;
    if (k === 0 && i) {
      a = b;
      b = 1 + (r() * 2 - 1) * depth;
    }
    const u = k / hop;
    out[i] = a + (b - a) * u * u * (3 - 2 * u);
  }
  return out;
}

/**
 * Heavy ball into the sea, built only from shaped noise (no tones, so it never
 * sounds synthetic): a hard slap on the surface, a dull underwater "whump",
 * the hiss of the column of water bursting up, then a long shower of spray
 * and droplets pattering back down onto the swell.
 */
export function waterImpact(sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * 1.7);
  const out = new Float32Array(n);
  const slapHp = new SVF(sr, 900, 0.6);
  const plop = new SVF(sr, 420, 0.7);
  const whump = new SVF(sr, 150, 0.6);
  const column = new SVF(sr, 6000, 0.6);
  const hiss = new SVF(sr, 2600, 0.6);
  const fl = flutter(r, sr, n, 0.012, 0.45);
  const fall = 0.32 + r() * 0.08; // when the column starts collapsing
  const rain = (t: number) => (t < fall ? Math.pow(t / fall, 2) : Math.exp(-(t - fall) / 0.38));
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const w = r() * 2 - 1;
    slapHp.run(w);
    plop.run(w);
    whump.run(w);
    if ((i & 15) === 0) column.set(1300 + 6000 * Math.exp(-t / 0.22), 0.6);
    column.run(w);
    hiss.run(w);
    const att = 1 - Math.exp(-t / 0.0003);
    out[i] =
      // the slap: hard, short, bright
      slapHp.hp * att * Math.exp(-t / 0.0045) * 1.3 +
      plop.lp * att * Math.exp(-t / 0.014) * 2.2 +
      // the whump of the cavity collapsing under the surface
      whump.lp * (1 - Math.exp(-t / 0.004)) * Math.exp(-t / 0.075) * 6 +
      // the column bursting upward
      column.lp * (1 - Math.exp(-t / 0.02)) * Math.exp(-t / 0.3) * fl[i] * 0.9 +
      // steady hiss of the shower coming back down
      hiss.hp * rain(t) * 0.22;
  }
  // individual droplets and gouts slapping the water as the column falls
  noiseGrains(out, sr, r, { count: 520, t0: 0.08, spread: 1.4, skew: 1.5, fLo: 900, fHi: 7500, q: 1.1, durLo: 0.0015, durHi: 0.012, amp: 0.55, env: rain });
  noiseGrains(out, sr, r, { count: 26, t0: 0.25, spread: 0.9, skew: 1.3, fLo: 300, fHi: 1200, q: 0.9, durLo: 0.008, durHi: 0.03, amp: 0.6, env: rain });
  fadeTail(out, sr, 0.15);
  return peakNorm(out, 0.92);
}

/** Feedback comb with a damped loop: turns a noise burst into a hollow, boxy wooden resonance. */
function comb(x: Float32Array, sr: number, freq: number, fb: number, damp: number) {
  const d = Math.max(1, Math.round(sr / freq));
  const y = new Float32Array(x.length);
  let z = 0;
  for (let i = 0; i < x.length; i++) {
    z = (i >= d ? y[i - d] : 0) * (1 - damp) + z * damp;
    y[i] = x[i] + fb * z;
  }
  return y;
}

/** One brittle fracture: a needle-sharp pulse and a bright, very short burst of noise. */
function snap(dst: Float32Array, sr: number, r: Rand, t0: number, amp: number, fLo: number, fHi: number, dec: number) {
  const start = Math.floor(t0 * sr);
  const f = new SVF(sr, fLo * Math.pow(fHi / fLo, r()), 0.7);
  const td = 0.0003 + r() * 0.0004;
  const len = Math.floor(dec * 6 * sr);
  for (let i = 0; i < len && start + i < dst.length; i++) {
    const t = i / sr;
    f.run(r() * 2 - 1);
    const pulse = t < td * 4 ? (1 - t / td) * Math.exp((-2.4 * t) / td) : 0;
    dst[start + i] += (pulse * 0.8 + f.bp * 2.2 * Math.exp(-t / dec)) * amp;
  }
}

/**
 * Round shot smashing into a great oak hull. Built around the weight of the
 * structure: a heavy, splitting CRACK, the rip of thick planking tearing,
 * the whole hull booming like a vast wooden drum (low inharmonic combs and
 * resonances that ring for a beat), a slow, deep creak of frames and knees
 * flexing under the blow, splinters, then chunks thudding onto the deck.
 */
export function woodImpact(sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * 1.6);

  // ---- the crack: heavy and split, with real body below the snap
  const crack = new Float32Array(Math.floor(sr * 0.12));
  const hp = new SVF(sr, 1200, 0.6);
  const bp = new SVF(sr, 1300 + r() * 700, 0.8);
  const mid = new SVF(sr, 520 + r() * 200, 1.1);
  for (let i = 0; i < crack.length; i++) {
    const t = i / sr;
    const w = r() * 2 - 1;
    hp.run(w);
    bp.run(w);
    mid.run(w);
    const td = 0.0012;
    const pulse = (1 - t / td) * Math.exp((-2.4 * t) / td);
    crack[i] = pulse * 0.9 + hp.hp * Math.exp(-t / 0.003) + bp.bp * Math.exp(-t / 0.014) * 2.6 + mid.bp * Math.exp(-t / 0.03) * 2.4;
  }
  peakNorm(crack);

  // ---- the tear: thick fibres failing in a long, irregular rip, then the plank giving way
  const tear = new Float32Array(n);
  let t = 0.004;
  const cracks = 14 + Math.floor(r() * 8);
  for (let k = 0; k < cracks; k++) {
    t += 0.004 + r() * 0.014 * (1 + k / 6);
    snap(tear, sr, r, t, (0.35 + 0.65 * r()) * Math.exp(-k / 11), 600, 3800, 0.002 + r() * 0.005);
  }
  const gives = 2 + Math.floor(r() * 3);
  for (let k = 0; k < gives; k++) snap(tear, sr, r, 0.09 + r() * 0.4, 0.5 + r() * 0.45, 380, 2200, 0.005 + r() * 0.009);
  peakNorm(tear);

  // ---- splinters
  const splinters = new Float32Array(n);
  noiseGrains(splinters, sr, r, { count: 320, t0: 0.004, spread: 0.75, skew: 1.9, fLo: 1300, fHi: 7500, q: 1.0, durLo: 0.0005, durHi: 0.004, amp: 1, env: (tt) => Math.exp(-tt / 0.22) });
  peakNorm(splinters);

  // ---- the hull booming: a vast wooden drum
  const kn = Math.floor(sr * 0.9);
  const kick = new Float32Array(kn);
  const lp = new SVF(sr, 500, 0.7);
  const sub = new SVF(sr, 75, 0.7);
  const subL = new Float32Array(kn);
  const modes = [58, 83, 121, 167, 236].map((f) => new SVF(sr, f * (0.92 + r() * 0.16), 7));
  const modeAmp = [1, 0.85, 0.6, 0.4, 0.25];
  const body = new Float32Array(kn);
  for (let i = 0; i < kn; i++) {
    const tt = i / sr;
    const w = r() * 2 - 1;
    lp.run(w);
    sub.run(w);
    const ex = lp.lp * (1 - Math.exp(-tt / 0.0008)) * Math.exp(-tt / 0.012);
    kick[i] = ex;
    let y = 0;
    for (let m = 0; m < modes.length; m++) {
      modes[m].run(ex);
      y += modes[m].bp * modeAmp[m];
    }
    body[i] = y;
    subL[i] = sub.lp * (1 - Math.exp(-tt / 0.004)) * Math.exp(-tt / 0.2);
  }
  const boom = new Float32Array(kn);
  mix(boom, peakNorm(comb(kick, sr, 54 + r() * 10, 0.78, 0.62)), 1);
  mix(boom, peakNorm(comb(kick, sr, 79 + r() * 14, 0.72, 0.6)), 0.75);
  mix(boom, peakNorm(comb(kick, sr, 131 + r() * 24, 0.6, 0.5)), 0.45);
  mix(boom, peakNorm(body), 0.9);
  mix(boom, peakNorm(subL), 0.7);
  peakNorm(boom);

  // ---- the frames creaking: slow stick-slip through deep, wide timber resonances
  const groan = new Float32Array(n);
  const res = [118, 196, 310, 470, 690].map((f) => new SVF(sr, f * (0.9 + r() * 0.2), 4.5));
  const resAmp = [1, 0.85, 0.6, 0.4, 0.22];
  const g0 = Math.floor((0.08 + r() * 0.05) * sr);
  const gLen = 0.85 + r() * 0.35;
  let ph = 0;
  for (let i = 0; i < Math.floor(gLen * sr) && g0 + i < n; i++) {
    const tt = i / sr;
    ph += (34 - 20 * Math.min(1, tt / gLen) + Math.sin(tt * 7 + seed) * 4) / sr;
    let x = (r() * 2 - 1) * 0.05;
    if (ph >= 1) {
      ph -= 1;
      x += 0.6 + r() * 0.7;
    }
    const env = Math.min(1, tt / 0.12, (gLen - tt) / 0.2) * Math.exp(-tt / (gLen * 0.45));
    let y = 0;
    for (let m = 0; m < res.length; m++) {
      res[m].run(x * env);
      y += res[m].bp * resAmp[m];
    }
    groan[g0 + i] = y;
  }
  peakNorm(groan);

  // ---- heavy chunks thudding onto the deck
  const debris = new Float32Array(n);
  const knocks = 3 + Math.floor(r() * 3);
  for (let k = 0; k < knocks; k++) {
    const t0 = 0.22 + ((k + r()) / knocks) * 0.85;
    const a = (0.5 + r() * 0.5) * Math.exp(-(t0 - 0.22) / 0.6);
    const burst = new Float32Array(Math.floor(sr * 0.09));
    const f = new SVF(sr, 1600, 0.7);
    for (let i = 0; i < burst.length; i++) {
      f.run(r() * 2 - 1);
      burst[i] = f.lp * Math.exp(-i / sr / 0.002);
    }
    mix(debris, peakNorm(comb(burst, sr, 190 + r() * 260, 0.65, 0.35)), a, Math.floor(t0 * sr));
    noiseGrains(debris, sr, r, { count: 4, t0, spread: 0.04, skew: 1, fLo: 1500, fHi: 5000, q: 1.1, durLo: 0.0006, durHi: 0.0025, amp: a * 0.5 });
  }
  peakNorm(debris);

  const out = new Float32Array(n);
  mix(out, crack, 0.95);
  mix(out, tear, 0.7);
  mix(out, splinters, 0.36);
  mix(out, boom, 0.95);
  mix(out, groan, 0.3);
  mix(out, debris, 0.22);
  peakNorm(out);
  saturate(out, 1.7);
  fadeTail(out, sr, 0.15);
  return peakNorm(out, 0.92);
}

/** Ball burying itself in sand or earth: a dull thud and a scatter of grit. */
export function earthImpact(sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * 0.8);
  const out = new Float32Array(n);
  const lp = new SVF(sr, 650, 0.7);
  const low = new SVF(sr, 120, 0.6);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const w = r() * 2 - 1;
    lp.run(w);
    low.run(w);
    out[i] =
      low.lp * (1 - Math.exp(-t / 0.003)) * Math.exp(-t / 0.1) * 9 +
      lp.lp * (1 - Math.exp(-t / 0.001)) * Math.exp(-t / 0.05) * 7;
  }
  // sand and pebbles thrown up, pattering back down
  noiseGrains(out, sr, r, { count: 120, t0: 0.03, spread: 0.6, skew: 1.6, fLo: 900, fHi: 5000, q: 1.1, durLo: 0.0008, durHi: 0.005, amp: 0.5, env: (t) => Math.exp(-t / 0.3) });
  fadeTail(out, sr);
  return peakNorm(out, 0.9);
}

/**
 * Stereo impulse response for open sea among islands: almost no early
 * reflections (it's outdoors), a darkening diffuse tail, and a handful of
 * discrete slap-back echoes off distant cliffs that make a broadside roll.
 */
export function seaReverb(sr: number, seed: number, len = 3.2): [Float32Array, Float32Array] {
  const n = Math.floor(sr * len);
  const chans: Float32Array[] = [];
  for (let c = 0; c < 2; c++) {
    const r = rng(seed + c * 977);
    const a = new Float32Array(n);
    let z = 0;
    let coef = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if ((i & 31) === 0) coef = Math.exp((-TAU * (380 + 6500 * Math.exp(-t / 0.45))) / sr);
      z = (1 - coef) * (r() * 2 - 1) + coef * z;
      const onset = t < 0.012 ? 0 : 1 - Math.exp(-(t - 0.012) / 0.03);
      a[i] = z * onset * Math.exp(-t / 0.62) * 0.55;
    }
    const echoes = 6 + Math.floor(r() * 3);
    for (let k = 0; k < echoes; k++) {
      const te = 0.09 + Math.pow(r(), 1.25) * 1.7;
      const amp = 0.9 * Math.exp(-te / 1.0) * (0.45 + 0.55 * r());
      const width = 0.018 + te * 0.05;
      const cut = Math.exp((-TAU * (300 + 2600 * Math.exp(-te / 0.55))) / sr);
      const start = Math.floor(te * sr);
      let e = 0;
      for (let i = 0; i < Math.floor(width * 6 * sr) && start + i < n; i++) {
        const t = i / sr;
        e = (1 - cut) * (r() * 2 - 1) + cut * e;
        a[start + i] += e * amp * (1 - Math.exp(-t / 0.003)) * Math.exp(-t / width) * 2.2;
      }
    }
    fadeTail(a, sr, 0.3);
    chans.push(a);
  }
  return [chans[0], chans[1]];
}

/**
 * Two hulls grinding together: a deep hollow boom as the timbers meet, the
 * long groan of planking dragging past planking (stick-slip pulses driving
 * the hull's wide resonances, sagging in pitch as the ships part), and a
 * spray of strakes and rail splintering along the seam.
 */
export function hullCrunch(sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * 1.7);
  const out = new Float32Array(n);
  const boom = new SVF(sr, 95, 0.7);
  const knock = new SVF(sr, 320, 0.8);
  for (let i = 0; i < Math.floor(0.6 * sr); i++) {
    const t = i / sr;
    const w = r() * 2 - 1;
    boom.run(w);
    knock.run(w);
    const att = 1 - Math.exp(-t / 0.0015);
    out[i] += boom.lp * att * Math.exp(-t / 0.16) * 11 + knock.bp * att * Math.exp(-t / 0.035) * 5;
  }
  // the groan: friction catching and releasing, ringing the hull like a cello body
  const res = [210, 380, 610, 980].map((f) => new SVF(sr, f * (0.9 + r() * 0.2), 4.5));
  const resAmp = [1, 0.75, 0.5, 0.3];
  const len = Math.floor(1.45 * sr);
  const start = Math.floor(0.03 * sr);
  let ph = 0;
  for (let i = 0; i < len && start + i < n; i++) {
    const t = i / sr;
    const rate = 46 - 30 * Math.min(1, t / 1.1) + Math.sin(t * 9 + seed) * 4;
    ph += rate / sr;
    let x = 0;
    if (ph >= 1) {
      ph -= 1;
      x = (r() * 0.6 + 0.7) * (r() < 0.15 ? 2.2 : 1);
    }
    x += (r() * 2 - 1) * 0.05;
    const env = Math.min(1, t / 0.06) * Math.exp(-t / 0.5);
    let y = 0;
    for (let m = 0; m < res.length; m++) {
      res[m].run(x * env);
      y += res[m].bp * resAmp[m];
    }
    out[start + i] += y * 2.6;
  }
  // splinters and cracking strakes along the seam
  noiseGrains(out, sr, r, { count: 180, t0: 0.01, spread: 0.9, skew: 1.8, fLo: 1000, fHi: 6500, q: 1.3, durLo: 0.0007, durHi: 0.005, amp: 1.8, env: (t) => Math.exp(-t / 0.35) });
  noiseGrains(out, sr, r, { count: 9, t0: 0.03, spread: 0.6, skew: 1.4, fLo: 420, fHi: 1600, q: 1.2, durLo: 0.008, durHi: 0.024, amp: 2.2 });
  saturate(out, 1.6);
  fadeTail(out, sr, 0.2);
  return peakNorm(out, 0.92);
}

// ------------------------------------------------------------------ shot types

/**
 * An explosive shell bursting: a needle-sharp detonation crack (much harder
 * than a gun's push of powder), a short chesty boom, shrapnel whining away
 * and iron fragments pinging off timber.
 */
export function shellBurst(sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * 2.6);
  const out = new Float32Array(n);
  mix(out, cannonBlast(sr, 1.05, seed * 3 + 7), 0.85);
  // the detonation itself: a brittle, bright crack on top of the boom
  snap(out, sr, r, 0, 1.4, 2500, 7000, 0.006);
  snap(out, sr, r, 0.004, 0.9, 1200, 3500, 0.012);
  // shrapnel: thin whines, each falling in pitch as it flies off
  for (let k = 0; k < 6; k++) {
    const t0 = 0.02 + r() * 0.12;
    const start = Math.floor(t0 * sr);
    const f0 = 2600 + r() * 2600;
    const dur = 0.18 + r() * 0.25;
    const len = Math.floor(dur * sr);
    const a = 0.05 + r() * 0.05;
    let ph = 0;
    for (let i = 0; i < len && start + i < n; i++) {
      const t = i / sr;
      ph += (TAU * f0 * (1 - 0.45 * t / dur)) / sr;
      out[start + i] += Math.sin(ph) * a * Math.sin((Math.PI * t) / dur) * (0.7 + 0.3 * r());
    }
  }
  // fragments rattling into wood and water
  noiseGrains(out, sr, r, { count: 140, t0: 0.03, spread: 0.9, skew: 1.6, fLo: 1400, fHi: 8000, q: 1.4, durLo: 0.0008, durHi: 0.005, amp: 0.7, env: (t) => Math.exp(-t / 0.4) });
  modal(out, sr, r, [3100, 4700, 6900], [0.03, 0.02, 0.012], [0.08, 0.05, 0.03], Math.floor(0.09 * sr));
  saturate(out, 1.4);
  fadeTail(out, sr, 0.2);
  return peakNorm(out, 0.95);
}

/** Fire shot catching: a soft, deep "fwoomp" of flame sucking in air, then the crackle of it taking hold. */
export function igniteWhoomp(sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * 1.5);
  const out = new Float32Array(n);
  const lp = new SVF(sr, 200, 0.9);
  const body = new SVF(sr, 120, 0.7);
  const fl = flutter(r, sr, n, 0.03, 0.5);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    if ((i & 15) === 0) lp.set(180 + 1900 * (t < 0.09 ? t / 0.09 : Math.exp(-(t - 0.09) / 0.18)), 0.9);
    const w = r() * 2 - 1;
    lp.run(w);
    body.run(w);
    const env = t < 0.07 ? Math.pow(t / 0.07, 1.6) : Math.exp(-(t - 0.07) / 0.32);
    out[i] = (lp.lp * 2.2 + body.lp * 3.5) * env * fl[i];
  }
  crackle(out, sr, r, 160, 0.06, 1.2, 900, 4200, 0.35);
  saturate(out, 1.8);
  fadeTail(out, sr, 0.2);
  return peakNorm(out, 0.9);
}

/** Red-hot iron into the sea: a fierce hiss of steam that fades into fizzing. */
export function steamHiss(sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * 1.3);
  const out = new Float32Array(n);
  const hp = new SVF(sr, 3200, 0.6);
  const bp = new SVF(sr, 6500, 1.2);
  const fl = flutter(r, sr, n, 0.008, 0.6);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const w = r() * 2 - 1;
    hp.run(w);
    bp.run(w);
    const env = (1 - Math.exp(-t / 0.012)) * Math.exp(-t / 0.42);
    out[i] = (hp.hp * 0.8 + bp.bp * 1.2) * env * fl[i];
  }
  noiseGrains(out, sr, r, { count: 220, t0: 0.05, spread: 1.1, skew: 1.3, fLo: 2000, fHi: 9000, q: 1.6, durLo: 0.0005, durHi: 0.003, amp: 0.35, env: (t) => Math.exp(-t / 0.5) });
  fadeTail(out, sr, 0.15);
  return peakNorm(out, 0.8);
}

/** Grape shot raking a deck: a hard hail of small balls into planking, rails and iron. */
export function grapeHail(sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * 0.9);
  const out = new Float32Array(n);
  for (let k = 0; k < 16; k++) snap(out, sr, r, Math.pow(r(), 1.6) * 0.28, 0.35 + r() * 0.4, 900, 4200, 0.008 + r() * 0.01);
  noiseGrains(out, sr, r, { count: 90, t0: 0, spread: 0.45, skew: 1.5, fLo: 1500, fHi: 7000, q: 1.3, durLo: 0.0008, durHi: 0.004, amp: 1.2, env: (t) => Math.exp(-t / 0.25) });
  // a few balls ringing off iron fittings
  for (let k = 0; k < 3; k++) modal(out, sr, r, [2400 + r() * 1800, 5200 + r() * 1500], [0.04, 0.02], [0.05, 0.03], Math.floor(r() * 0.25 * sr));
  // the timbers answering with a dull knock
  modal(out, sr, r, [160, 240], [0.05, 0.035], [0.25, 0.15], Math.floor(0.01 * sr));
  saturate(out, 1.3);
  fadeTail(out, sr, 0.12);
  return peakNorm(out, 0.88);
}

/** Chain shot through the rigging: canvas ripping, the chain clattering and cordage snapping. */
export function chainRip(sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * 1.0);
  const out = new Float32Array(n);
  const bp = new SVF(sr, 1800, 1.1);
  const lo = new SVF(sr, 500, 0.8);
  const rip = flutter(r, sr, n, 0.0035, 0.95);
  const len = 0.42;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const w = r() * 2 - 1;
    bp.run(w);
    lo.run(w);
    const env = t < len ? (1 - Math.exp(-t / 0.006)) * (1 - 0.6 * t / len) : Math.exp(-(t - len) / 0.05) * 0.4;
    out[i] = (bp.bp * 1.4 + lo.lp * 0.8) * env * rip[i] * rip[i];
  }
  // iron links clashing as the chain whips round
  for (let k = 0; k < 7; k++) modal(out, sr, r, [1900 + r() * 900, 3300 + r() * 1200, 5600 + r() * 1400], [0.05, 0.03, 0.015], [0.09, 0.06, 0.03], Math.floor(Math.pow(r(), 1.3) * 0.5 * sr));
  // a line parting
  snap(out, sr, r, 0.12 + r() * 0.15, 0.7, 700, 2400, 0.015);
  fadeTail(out, sr, 0.1);
  return peakNorm(out, 0.85);
}

/** Timber burning: the roar of the flames and a spit of crackles. */
export function fireCrackle(sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * 1.8);
  const out = new Float32Array(n);
  const lp = new SVF(sr, 260, 0.7);
  const fl = flutter(r, sr, n, 0.06, 0.55);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    lp.run(r() * 2 - 1);
    const env = Math.min(1, t / 0.25) * Math.min(1, (n / sr - t) / 0.4);
    out[i] = lp.lp * 3 * env * fl[i];
  }
  crackle(out, sr, r, 120, 0, 1.7, 700, 3600, 0.4);
  for (let k = 0; k < 4; k++) snap(out, sr, r, 0.1 + r() * 1.4, 0.35 + r() * 0.3, 600, 2600, 0.01);
  saturate(out, 1.5);
  return peakNorm(out, 0.8);
}

// ---------------------------------------------------------------- fireworks

/**
 * A rocket leaving its tube: the fuse catches with a soft pop and the charge
 * roars up into a hiss that thins and rises as it climbs away. The whistling
 * kind screams up a long rising glide instead.
 */
export function rocketLaunch(sr: number, seed: number, whistle: boolean): Float32Array {
  const r = rng(seed);
  const dur = whistle ? 1.9 : 1.6;
  const n = Math.floor(sr * dur);
  const out = new Float32Array(n);
  const bp = new SVF(sr, 1200, 1.1);
  const hp = new SVF(sr, 4000, 0.7);
  const fl = flutter(r, sr, n, 0.012, 0.45);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const k = t / dur;
    if ((i & 15) === 0) bp.set(700 + 3800 * k * k, 1.1);
    const w = r() * 2 - 1;
    bp.run(w);
    hp.run(w);
    const env = (1 - Math.exp(-t / 0.03)) * Math.pow(1 - k, 1.6);
    out[i] = (bp.bp * 1.3 + hp.hp * 0.35) * env * fl[i];
    if (whistle) {
      // the whistle: a narrow glide from a hoot to a shriek, wavering as the rocket spins
      const f = 850 + 2300 * Math.pow(k, 0.8) + Math.sin(t * 38) * 40;
      ph += (TAU * f) / sr;
      const we = Math.min(1, t / 0.08) * (1 - smoothK(k, 0.82, 1));
      out[i] += (Math.sin(ph) + 0.25 * Math.sin(ph * 2) + 0.08 * Math.sin(ph * 3)) * we * 0.55;
    }
  }
  // the fuse catching
  snap(out, sr, r, 0.002, 0.6, 900, 2600, 0.012);
  noiseGrains(out, sr, r, { count: 40, t0: 0, spread: 0.35, skew: 1.4, fLo: 2000, fHi: 8000, q: 1.2, durLo: 0.0005, durHi: 0.003, amp: 0.35, env: (t) => Math.exp(-t / 0.3) });
  fadeTail(out, sr, 0.2);
  return peakNorm(out, whistle ? 0.85 : 0.75);
}

const smoothK = (x: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * A shell breaking high overhead: the crack of the bursting charge, a round
 * thump that rolls across the water, and the faint fizz of the stars burning
 * as they spread. `big` is a showpiece's heavier double-charge.
 */
export function shellBoom(sr: number, seed: number, big: boolean): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * (big ? 3.6 : 2.8));
  const out = new Float32Array(n);
  mix(out, cannonBlast(sr, big ? 1.15 : 0.7, seed * 5 + 3), big ? 0.75 : 0.55);
  // the bursting charge: brittle, papery and bright on top of the thump
  snap(out, sr, r, 0, 1.6, 2400, 7600, 0.005);
  snap(out, sr, r, 0.003, 1.0, 900, 3000, 0.012);
  if (big) snap(out, sr, r, 0.06, 0.9, 1400, 5000, 0.01);
  // the stars burning as they fly: a soft fizz that swells and dies away
  const hp = new SVF(sr, 5200, 0.6);
  const fl = flutter(r, sr, n, 0.02, 0.5);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    hp.run(r() * 2 - 1);
    const env = (1 - Math.exp(-t / 0.12)) * Math.exp(-t / (big ? 1.2 : 0.8));
    out[i] += hp.hp * env * fl[i] * 0.12;
  }
  saturate(out, 1.3);
  fadeTail(out, sr, 0.3);
  return peakNorm(out, 0.92);
}

/** Dragon's eggs hatching: a long, irregular hail of sharp little pops. */
export function crackleHail(sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * 1.8);
  const out = new Float32Array(n);
  for (let k = 0; k < 110; k++) {
    const t = Math.pow(r(), 1.3) * 1.25;
    snap(out, sr, r, t, 0.25 + r() * 0.6, 1600, 7000, 0.003 + r() * 0.004);
  }
  crackle(out, sr, r, 160, 0, 1.4, 2400, 8000, 0.3);
  fadeTail(out, sr, 0.2);
  return peakNorm(out, 0.85);
}

/** A willow's long golden fall: a soft, glittering hiss that hangs in the air. */
export function willowSizzle(sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * 2.8);
  const out = new Float32Array(n);
  const bp = new SVF(sr, 6000, 0.9);
  const fl = flutter(r, sr, n, 0.03, 0.6);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    bp.run(r() * 2 - 1);
    const env = Math.min(1, t / 0.4) * Math.exp(-t / 1.1);
    out[i] = bp.bp * env * fl[i];
  }
  noiseGrains(out, sr, r, { count: 180, t0: 0.1, spread: 2.4, skew: 1.2, fLo: 3000, fHi: 9000, q: 1.6, durLo: 0.0004, durHi: 0.002, amp: 0.4, env: (t) => Math.exp(-t / 1.4) });
  fadeTail(out, sr, 0.3);
  return peakNorm(out, 0.7);
}

/** Crossette comets splitting: a ragged handful of pops almost at once. */
export function splitPops(sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * 0.7);
  const out = new Float32Array(n);
  for (let k = 0; k < 9; k++) snap(out, sr, r, r() * 0.16, 0.6 + r() * 0.5, 1200, 5200, 0.008 + r() * 0.006);
  modal(out, sr, r, [180, 260], [0.05, 0.03], [0.3, 0.15], 0);
  saturate(out, 1.2);
  fadeTail(out, sr, 0.15);
  return peakNorm(out, 0.85);
}

// ---------------------------------------------------------------- the port

/**
 * One gold coin struck. A coin rings like a tiny free disc: inharmonic plate
 * modes (not a musical note), each split in two by the coin's wobble so it
 * shimmers. Gold is heavy and soft, so it sits lower and dies sooner than a
 * silver ping: a warm, buttery "chink" rather than a bell.
 */
function strike(dst: Float32Array, sr: number, r: Rand, t0: number, f0: number, amp: number, ring: number, bright = 1) {
  const start = Math.floor(t0 * sr);
  if (start >= dst.length || amp < 0.002) return;
  const ratio = [1, 1.73, 2.33, 3.9, 4.12, 5.93];
  const gain = [1, 0.5, 0.72, 0.34 * bright, 0.28 * bright, 0.14 * bright];
  const dec = [1, 0.62, 0.55, 0.3, 0.27, 0.16];
  for (let m = 0; m < ratio.length; m++) {
    const f = f0 * ratio[m] * (0.985 + r() * 0.03);
    if (f > sr * 0.45) continue;
    const d = ring * dec[m];
    const split = 1 + (0.002 + r() * 0.004);
    const ph = r() * TAU;
    const len = Math.min(dst.length - start, Math.floor(d * 6 * sr));
    const a = amp * gain[m] * (0.7 + r() * 0.6);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const e = Math.exp(-t / d) * (1 - Math.exp(-t / 0.00015));
      dst[start + i] += (Math.sin(ph + TAU * f * t) + 0.7 * Math.sin(ph * 1.3 + TAU * f * split * t)) * e * a;
    }
  }
  // the tick of metal meeting metal
  const hp = new SVF(sr, 6500, 0.8);
  const cl = Math.min(dst.length - start, Math.floor(0.004 * sr));
  for (let i = 0; i < cl; i++) {
    hp.run(r() * 2 - 1);
    dst[start + i] += hp.hp * Math.exp(-i / sr / 0.0007) * amp * 0.9 * bright;
  }
}

/**
 * A single doubloon tossed onto the counter: the strike, a couple of bounces,
 * and on some the coin rolling onto its rim and spinning down (the gaps
 * between chinks shrinking to a rattle before it lies flat).
 */
export function goldClink(sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * 1.1);
  const out = new Float32Array(n);
  const f0 = 2100 + r() * 1100;
  let t = 0.002;
  let a = 1;
  let gap = 0.05 + r() * 0.03;
  const bounces = 2 + Math.floor(r() * 3);
  for (let k = 0; k <= bounces; k++) {
    strike(out, sr, r, t, f0 * (1 + (r() - 0.5) * 0.02), a, k ? 0.07 : 0.16, k ? 0.6 : 1);
    t += gap;
    gap *= 0.62;
    a *= 0.42;
  }
  if (seed % 2) {
    // spinning down on its rim
    let g = 0.045;
    let sa = 0.35;
    for (let s = t + 0.04; s < 0.95 && g > 0.0035; s += g) {
      strike(out, sr, r, s, f0 * 0.97, sa, 0.03, 0.4);
      g *= 0.9;
      sa *= 0.965;
    }
  }
  fadeTail(out, sr, 0.1);
  return peakNorm(out, 0.85);
}

/** A double handful of gold sliding onto the pile: chinks, slither and the heavy ones landing last. */
export function coinPour(sr: number, seed: number, dur: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * (dur + 0.6));
  const out = new Float32Array(n);
  const count = Math.floor(55 * dur + 10);
  for (let k = 0; k < count; k++) {
    // dense at first, thinning out as the last coins trickle off the top
    const u = Math.pow(r(), 1.5);
    const t = 0.01 + u * dur;
    const a = (0.25 + 0.75 * r()) * (0.45 + 0.55 * Math.exp(-u * 1.4));
    strike(out, sr, r, t, 2300 + r() * 2600, a, 0.025 + r() * 0.06, 0.5 + r() * 0.5);
  }
  // the slither of coins grinding over coins
  noiseGrains(out, sr, r, { count: Math.floor(260 * dur), t0: 0.01, spread: dur, skew: 1.4, fLo: 3500, fHi: 11000, q: 1.6, durLo: 0.0005, durHi: 0.003, amp: 0.25 });
  // a few heavy pieces settling
  for (let k = 0; k < 3; k++) strike(out, sr, r, dur * (0.7 + r() * 0.35), 1900 + r() * 500, 0.6, 0.12);
  fadeTail(out, sr, 0.15);
  return peakNorm(out, 0.85);
}

/** A fat leather purse of gold dropped on an oak counter: thump, leather slap, and a muffled crunch of coin inside. */
export function purseDrop(sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * 0.7);
  const out = new Float32Array(n);
  // the counter taking the weight
  const ex = new Float32Array(Math.floor(sr * 0.02));
  const lp = new SVF(sr, 900, 0.7);
  for (let i = 0; i < ex.length; i++) {
    lp.run(r() * 2 - 1);
    ex[i] = lp.lp * Math.exp(-i / sr / 0.004);
  }
  mix(out, peakNorm(comb(ex, sr, 150 + r() * 40, 0.7, 0.45)), 0.9);
  modal(out, sr, r, [118, 245, 410, 690], [0.07, 0.05, 0.03, 0.018], [0.9, 0.6, 0.35, 0.2]);
  // leather slapping down
  const bp = new SVF(sr, 1100 + r() * 400, 0.9);
  for (let i = 0; i < Math.floor(sr * 0.06); i++) {
    bp.run(r() * 2 - 1);
    out[i] += bp.bp * Math.exp(-i / sr / 0.012) * 1.4;
  }
  // the coins inside, heard through the leather
  const coins = new Float32Array(n);
  for (let k = 0; k < 34; k++) strike(coins, sr, r, 0.003 + Math.pow(r(), 2) * 0.16, 1800 + r() * 2000, 0.3 + r() * 0.7, 0.02 + r() * 0.03, 0.6);
  const m = new SVF(sr, 2600, 0.7);
  for (let i = 0; i < n; i++) {
    m.run(coins[i]);
    coins[i] = m.lp;
  }
  mix(out, peakNorm(coins), 0.55);
  fadeTail(out, sr, 0.12);
  saturate(out, 1.3);
  return peakNorm(out, 0.85);
}

/**
 * A mooring line or a timber taking strain: stick-slip friction through hemp
 * and oak resonances. `rope` is the tighter, higher "eeerk" of a hawser on a
 * bollard; otherwise the slow groan of the quay's pilings.
 */
export function creak(sr: number, seed: number, rope: boolean): Float32Array {
  const r = rng(seed);
  const len = (rope ? 0.55 : 0.9) + r() * 0.5;
  const n = Math.floor(sr * (len + 0.3));
  const out = new Float32Array(n);
  const res = (rope ? [520, 860, 1350, 2050, 2900] : [190, 310, 520, 800, 1180]).map((f) => new SVF(sr, f * (0.9 + r() * 0.2), rope ? 7 : 5));
  const resAmp = [1, 0.8, 0.55, 0.35, 0.2];
  const base = rope ? 70 + r() * 50 : 22 + r() * 14;
  const bend = rope ? 1.9 : 1.6;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const u = Math.min(1, t / len);
    // the pulse rate climbs as the strain builds, then lets go
    ph += (base * (1 + (bend - 1) * Math.sin(u * Math.PI)) * (1 + Math.sin(t * 9 + seed) * 0.06)) / sr;
    let x = (r() * 2 - 1) * 0.04;
    if (ph >= 1) {
      ph -= 1;
      x += 0.5 + r() * 0.8;
    }
    const env = t < len ? Math.min(1, t / 0.08, (len - t) / 0.12) : 0;
    let y = 0;
    for (let m = 0; m < res.length; m++) {
      res[m].run(x * env);
      y += res[m].bp * resAmp[m];
    }
    out[i] = y;
  }
  fadeTail(out, sr, 0.1);
  return peakNorm(out, 0.8);
}

/** A shipwright's mallet on a plank (or, slowed down, a hull nudging the fenders). */
export function mallet(sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * 0.4);
  const out = new Float32Array(n);
  snap(out, sr, r, 0, 0.5, 1500, 4000, 0.002);
  modal(out, sr, r, [360, 840, 1480, 2300], [0.06, 0.035, 0.02, 0.012], [1, 0.6, 0.35, 0.18]);
  const ex = new Float32Array(Math.floor(sr * 0.012));
  for (let i = 0; i < ex.length; i++) ex[i] = (r() * 2 - 1) * Math.exp(-i / sr / 0.002);
  mix(out, peakNorm(comb(ex, sr, 210 + r() * 60, 0.6, 0.4)), 0.4);
  fadeTail(out, sr, 0.08);
  return peakNorm(out, 0.85);
}

/** Round shot set down into a crate of its fellows: iron on iron, the box's thud, a short roll. */
export function ironClunk(sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * 0.8);
  const out = new Float32Array(n);
  modal(out, sr, r, [480, 1310, 2560, 3900], [0.1, 0.05, 0.03, 0.018], [0.7, 0.5, 0.32, 0.18]);
  modal(out, sr, r, [105, 190, 330], [0.08, 0.05, 0.03], [1, 0.6, 0.3]);
  snap(out, sr, r, 0, 0.35, 900, 3000, 0.003);
  const lp = new SVF(sr, 420, 0.8);
  const fl = flutter(r, sr, n, 0.02, 0.8);
  for (let i = Math.floor(sr * 0.08); i < n; i++) {
    const t = i / sr - 0.08;
    lp.run(r() * 2 - 1);
    out[i] += lp.lp * fl[i] * Math.min(1, t / 0.03) * Math.exp(-t / 0.18) * 0.9;
  }
  fadeTail(out, sr, 0.1);
  return peakNorm(out, 0.85);
}

/** Folds a rendered tail back onto the start so a buffer loops with no seam. */
function wrap(a: Float32Array, n: number) {
  const out = a.slice(0, n);
  for (let i = n; i < a.length; i++) out[i % n] += a[i];
  return out;
}

/** Harbour water slapping and plocking among the pilings under the quay (seamless loop). */
export function harbourLap(sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const loop = Math.floor(sr * 5);
  const a = new Float32Array(loop + sr);
  const wash = new SVF(sr, 320, 0.6);
  const fl = flutter(r, sr, loop, 0.35, 0.5);
  for (let i = 0; i < loop; i++) {
    wash.run(r() * 2 - 1);
    a[i] += wash.lp * fl[i] * 0.35;
  }
  for (let t = r() * 0.3; t < 5; t += 0.35 + r() * 0.7) {
    const s = Math.floor(t * sr);
    const bp = new SVF(sr, 280 + r() * 520, 1.3);
    const amp = 0.4 + r() * 0.6;
    const len = Math.floor(sr * 0.35);
    for (let i = 0; i < len; i++) {
      const tt = i / sr;
      bp.run(r() * 2 - 1);
      a[s + i] += bp.bp * (1 - Math.exp(-tt / 0.012)) * Math.exp(-tt / 0.07) * amp * 2.2;
    }
    if (r() < 0.55) {
      // the hollow "plock" of a wavelet into the gap behind a piling
      const f = 170 + r() * 190;
      const pa = 0.3 + r() * 0.4;
      for (let i = 0; i < Math.floor(sr * 0.12); i++) {
        const tt = i / sr;
        a[s + i] += Math.sin(TAU * f * tt * (1 + tt * 6)) * Math.exp(-tt / 0.025) * (1 - Math.exp(-tt / 0.002)) * pa;
      }
    }
  }
  return peakNorm(wrap(a, loop), 0.8);
}

/**
 * The quay's hubbub: a dozen distant voices haggling, each a glottal buzz
 * through shifting vowel formants in irregular phrases, blurred by distance
 * into a lively murmur with no words to catch (seamless loop).
 */
export function crowdMurmur(sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const dur = 6;
  const loop = Math.floor(sr * dur);
  const a = new Float32Array(loop + sr * 2);
  const vowels = [[730, 1090], [530, 1840], [270, 2290], [570, 840], [300, 870], [640, 1190], [490, 1350]];
  for (let v = 0; v < 12; v++) {
    const f0 = (r() < 0.6 ? 95 + r() * 60 : 180 + r() * 70);
    const f1 = new SVF(sr, 700, 5);
    const f2 = new SVF(sr, 1200, 7);
    const g = (0.5 + r() * 0.5) * (r() < 0.3 ? 1.5 : 1);
    let t = r() * 1.5;
    let ph = 0;
    while (t < dur) {
      // a phrase of a few syllables, then a breath
      const syl = 3 + Math.floor(r() * 7);
      const rise = (r() - 0.5) * 0.3;
      for (let k = 0; k < syl; k++) {
        const sl = 0.09 + r() * 0.15;
        const vw = vowels[(r() * vowels.length) | 0];
        f1.set(vw[0] * (0.9 + r() * 0.2), 5);
        f2.set(vw[1] * (0.9 + r() * 0.2), 7);
        const s = Math.floor(t * sr);
        const pitch = f0 * (1 + rise * (k / syl) + (r() - 0.5) * 0.12);
        for (let i = 0; i < Math.floor(sl * sr); i++) {
          const tt = i / sr;
          ph += pitch / sr;
          let x = (r() * 2 - 1) * 0.08;
          if (ph >= 1) {
            ph -= 1;
            x += 1;
          }
          const env = Math.sin(Math.PI * Math.min(1, tt / sl));
          f1.run(x * env);
          f2.run(x * env);
          a[s + i] += (f1.bp + f2.bp * 0.6) * g;
        }
        t += sl + r() * 0.03;
      }
      t += 0.2 + r() * 0.9;
    }
  }
  // distance: the highs go, the room around the quay stays
  const lp = new SVF(sr, 1700, 0.6);
  const hp = new SVF(sr, 140, 0.6);
  for (let i = 0; i < a.length; i++) {
    lp.run(a[i]);
    hp.run(lp.lp);
    a[i] = hp.hp;
  }
  return peakNorm(wrap(a, loop), 0.8);
}

export type BankKind =
  | 'reverb' | 'cannon' | 'recoil' | 'wood' | 'water' | 'earth' | 'whoosh' | 'blast' | 'crunch' | 'shell' | 'ignite' | 'steam' | 'grape' | 'chain' | 'flames'
  | 'coin' | 'pour' | 'purse' | 'creak' | 'mallet' | 'clunk' | 'lap' | 'murmur'
  | 'rocket' | 'fwBoom' | 'fwCrackle' | 'fwSizzle' | 'fwPop';
export const CALIBERS = 3;

/** Everything the game plays, cheapest/most needed first. Cannon index = caliber * 2 + variant. */
export function bankJobs(sr: number, lite = false): { kind: BankKind; index: number; render: () => Float32Array[] }[] {
  const jobs: { kind: BankKind; index: number; render: () => Float32Array[] }[] = [];
  for (let c = 0; c < CALIBERS; c++)
    for (let v = 0; v < 2; v++) jobs.push({ kind: 'cannon', index: c * 2 + v, render: () => [cannonBlast(sr, c / (CALIBERS - 1), 101 + c * 17 + v * 5)] });
  // phones get a shorter tail: the convolution's cost grows with it, and the last second is -25 dB
  jobs.push({ kind: 'reverb', index: 0, render: () => seaReverb(sr, 11, lite ? 2.2 : 3.2) });
  for (let v = 0; v < 3; v++) jobs.push({ kind: 'recoil', index: v, render: () => [gunRecoil(sr, 301 + v)] });
  for (let v = 0; v < 3; v++) jobs.push({ kind: 'wood', index: v, render: () => [woodImpact(sr, 401 + v)] });
  for (let v = 0; v < 3; v++) jobs.push({ kind: 'water', index: v, render: () => [waterImpact(sr, 501 + v)] });
  jobs.push({ kind: 'earth', index: 0, render: () => [earthImpact(sr, 601)] });
  for (let v = 0; v < 2; v++) jobs.push({ kind: 'whoosh', index: v, render: () => [shotWhoosh(sr, 701 + v)] });
  for (let v = 0; v < 2; v++) jobs.push({ kind: 'crunch', index: v, render: () => [hullCrunch(sr, 901 + v)] });
  for (let v = 0; v < 2; v++) jobs.push({ kind: 'blast', index: v, render: () => [magazineBlast(sr, 801 + v)] });
  for (let v = 0; v < 2; v++) jobs.push({ kind: 'shell', index: v, render: () => [shellBurst(sr, 1001 + v)] });
  jobs.push({ kind: 'ignite', index: 0, render: () => [igniteWhoomp(sr, 1101)] });
  jobs.push({ kind: 'steam', index: 0, render: () => [steamHiss(sr, 1201)] });
  for (let v = 0; v < 2; v++) jobs.push({ kind: 'grape', index: v, render: () => [grapeHail(sr, 1301 + v)] });
  for (let v = 0; v < 2; v++) jobs.push({ kind: 'chain', index: v, render: () => [chainRip(sr, 1401 + v)] });
  jobs.push({ kind: 'flames', index: 0, render: () => [fireCrackle(sr, 1501)] });
  // the port: gold, rope, timber and the quay's own noise
  for (let v = 0; v < 6; v++) jobs.push({ kind: 'coin', index: v, render: () => [goldClink(sr, 1601 + v)] });
  for (let v = 0; v < 2; v++) jobs.push({ kind: 'pour', index: v, render: () => [coinPour(sr, 1701 + v, v ? 1.5 : 0.6)] });
  for (let v = 0; v < 2; v++) jobs.push({ kind: 'purse', index: v, render: () => [purseDrop(sr, 1801 + v)] });
  for (let v = 0; v < 3; v++) jobs.push({ kind: 'creak', index: v, render: () => [creak(sr, 1901 + v, v < 2)] });
  for (let v = 0; v < 2; v++) jobs.push({ kind: 'mallet', index: v, render: () => [mallet(sr, 2001 + v)] });
  for (let v = 0; v < 2; v++) jobs.push({ kind: 'clunk', index: v, render: () => [ironClunk(sr, 2101 + v)] });
  jobs.push({ kind: 'lap', index: 0, render: () => [harbourLap(sr, 2201)] });
  jobs.push({ kind: 'murmur', index: 0, render: () => [crowdMurmur(sr, 2301)] });
  // fireworks: rockets (index 0-1 plain, 2 whistling), bursts (2 shells, then a showpiece), crackle, willow, crossette
  for (let v = 0; v < 3; v++) jobs.push({ kind: 'rocket', index: v, render: () => [rocketLaunch(sr, 2401 + v, v === 2)] });
  for (let v = 0; v < 3; v++) jobs.push({ kind: 'fwBoom', index: v, render: () => [shellBoom(sr, 2501 + v, v === 2)] });
  for (let v = 0; v < 2; v++) jobs.push({ kind: 'fwCrackle', index: v, render: () => [crackleHail(sr, 2601 + v)] });
  jobs.push({ kind: 'fwSizzle', index: 0, render: () => [willowSizzle(sr, 2701)] });
  jobs.push({ kind: 'fwPop', index: 0, render: () => [splitPops(sr, 2801)] });
  return jobs;
}
