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

/**
 * Round shot smashing into a hull: the crack of planking giving way, a heavy
 * dull "thunk" of oak taking the blow (noise through wide, heavily damped
 * resonances, so it reads as wood, not as a struck bell), a burst of
 * splinters snapping, then loose debris clattering onto the deck.
 */
export function woodImpact(sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * 1.0);
  const out = new Float32Array(n);
  const crackHp = new SVF(sr, 1100, 0.6);
  const crackBp = new SVF(sr, 1700 + r() * 800, 0.9);
  const body = new SVF(sr, 230, 0.6);
  const res = [150, 270, 470, 820].map((f) => new SVF(sr, f * (0.85 + r() * 0.3), 3.2));
  const resAmp = [1, 0.8, 0.55, 0.35];
  for (let i = 0; i < Math.floor(0.4 * sr); i++) {
    const t = i / sr;
    const w = r() * 2 - 1;
    const att = 1 - Math.exp(-t / 0.0002);
    crackHp.run(w);
    crackBp.run(w);
    body.run(w);
    // timbers: a short noise blow through damped resonances
    const hitEnv = att * Math.exp(-t / 0.018);
    let wood = 0;
    for (let m = 0; m < res.length; m++) {
      res[m].run(w * hitEnv);
      wood += res[m].bp * resAmp[m];
    }
    out[i] +=
      crackHp.hp * att * Math.exp(-t / 0.005) * 1.4 +
      crackBp.bp * att * Math.exp(-t / 0.016) * 1.6 +
      wood * 3.2 +
      body.lp * (1 - Math.exp(-t / 0.002)) * Math.exp(-t / 0.05) * 3.5;
  }
  // splinters: a dense, irregular crackle of fibres snapping
  noiseGrains(out, sr, r, { count: 140, t0: 0.004, spread: 0.32, skew: 2.2, fLo: 1100, fHi: 7000, q: 1.3, durLo: 0.0007, durHi: 0.005, amp: 2.4, env: (t) => Math.exp(-t / 0.13) });
  // a few bigger boards cracking
  noiseGrains(out, sr, r, { count: 7, t0: 0.02, spread: 0.22, skew: 1.6, fLo: 500, fHi: 1800, q: 1.2, durLo: 0.006, durHi: 0.018, amp: 1.8 });
  // chunks clattering down on deck
  const knocks = 3 + Math.floor(r() * 3);
  for (let k = 0; k < knocks; k++) {
    const t0 = 0.16 + ((k + r()) / knocks) * 0.6;
    const a = (0.7 + r() * 0.8) * Math.exp(-(t0 - 0.16) / 0.45);
    noiseGrains(out, sr, r, { count: 1, t0, spread: 0, skew: 1, fLo: 380, fHi: 1300, q: 2.2, durLo: 0.008, durHi: 0.02, amp: a * 1.6 });
    noiseGrains(out, sr, r, { count: 3, t0, spread: 0.03, skew: 1, fLo: 1500, fHi: 5000, q: 1.2, durLo: 0.0008, durHi: 0.003, amp: a });
  }
  fadeTail(out, sr);
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
export function seaReverb(sr: number, seed: number): [Float32Array, Float32Array] {
  const n = Math.floor(sr * 3.2);
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

export type BankKind = 'reverb' | 'cannon' | 'recoil' | 'wood' | 'water' | 'earth' | 'whoosh' | 'blast' | 'crunch';
export const CALIBERS = 3;

/** Everything the game plays, cheapest/most needed first. Cannon index = caliber * 2 + variant. */
export function bankJobs(sr: number): { kind: BankKind; index: number; render: () => Float32Array[] }[] {
  const jobs: { kind: BankKind; index: number; render: () => Float32Array[] }[] = [];
  for (let c = 0; c < CALIBERS; c++)
    for (let v = 0; v < 2; v++) jobs.push({ kind: 'cannon', index: c * 2 + v, render: () => [cannonBlast(sr, c / (CALIBERS - 1), 101 + c * 17 + v * 5)] });
  jobs.push({ kind: 'reverb', index: 0, render: () => seaReverb(sr, 11) });
  for (let v = 0; v < 3; v++) jobs.push({ kind: 'recoil', index: v, render: () => [gunRecoil(sr, 301 + v)] });
  for (let v = 0; v < 3; v++) jobs.push({ kind: 'wood', index: v, render: () => [woodImpact(sr, 401 + v)] });
  for (let v = 0; v < 3; v++) jobs.push({ kind: 'water', index: v, render: () => [waterImpact(sr, 501 + v)] });
  jobs.push({ kind: 'earth', index: 0, render: () => [earthImpact(sr, 601)] });
  for (let v = 0; v < 2; v++) jobs.push({ kind: 'whoosh', index: v, render: () => [shotWhoosh(sr, 701 + v)] });
  for (let v = 0; v < 2; v++) jobs.push({ kind: 'crunch', index: v, render: () => [hullCrunch(sr, 901 + v)] });
  for (let v = 0; v < 2; v++) jobs.push({ kind: 'blast', index: v, render: () => [magazineBlast(sr, 801 + v)] });
  return jobs;
}
