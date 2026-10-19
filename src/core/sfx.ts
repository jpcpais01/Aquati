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
  crackle(out, sr, r, 170, 0.03, 1.9, 900, 5200, 0.22);
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

/** Heavy ball into the sea: slap, deep cavity "thoomp", plume roar, bubbles, then water raining back. */
export function waterImpact(sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * 1.5);
  const out = new Float32Array(n);
  const hp = new SVF(sr, 700, 0.7);
  const plume = new SVF(sr, 2500, 0.75);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const w = r() * 2 - 1;
    hp.run(w);
    if ((i & 15) === 0) plume.set(900 + 1800 * Math.exp(-t / 0.14), 0.75);
    plume.run(w);
    ph += (TAU * (55 + 135 * Math.exp(-t / 0.035))) / sr;
    out[i] =
      hp.hp * (1 - Math.exp(-t / 0.0004)) * Math.exp(-t / 0.006) * 0.9 +
      Math.sin(ph) * (1 - Math.exp(-t / 0.004)) * Math.exp(-t / 0.085) * 0.85 +
      plume.bp * (1 - Math.exp(-t / 0.018)) * Math.exp(-t / 0.24) * 2.4;
  }
  // bubbles: little rising chirps
  for (let k = 0; k < 7; k++) {
    const at = Math.floor((0.04 + r() * 0.4) * sr);
    const f0 = 350 + r() * 500;
    let bph = 0;
    for (let i = 0; i < Math.floor(0.05 * sr) && at + i < n; i++) {
      const t = i / sr;
      bph += (TAU * f0 * (1 + t * 14)) / sr;
      out[at + i] += Math.sin(bph) * Math.exp(-t / 0.012) * 0.12 * (0.4 + r() * 0.6);
    }
  }
  // the column of water falling back
  const rain = new Float32Array(n);
  crackle(rain, sr, r, 110, 0.18, 1.1, 1400, 5200, 1);
  mix(out, rain, 0.28);
  fadeTail(out, sr);
  return peakNorm(out, 0.92);
}

/** Shot smashing into a hull: crack, deep timber knock, splinters and a groan of strained wood. */
export function woodImpact(sr: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = Math.floor(sr * 0.95);
  const out = new Float32Array(n);
  const hp = new SVF(sr, 1300, 0.7);
  for (let i = 0; i < Math.floor(0.05 * sr); i++) {
    const t = i / sr;
    hp.run(r() * 2 - 1);
    out[i] += hp.hp * (1 - Math.exp(-t / 0.0003)) * Math.exp(-t / 0.0055) * 1.6;
  }
  modal(out, sr, r, [104, 182, 271, 418, 655, 980], [0.09, 0.06, 0.045, 0.03, 0.02, 0.012], [1, 0.75, 0.55, 0.4, 0.3, 0.2]);
  crackle(out, sr, r, 55, 0.006, 0.38, 1500, 7000, 0.45);
  // a groan of strained timbers
  const bp = new SVF(sr, 420, 4);
  let ph = 0;
  const f = 62 + r() * 18;
  for (let i = Math.floor(0.04 * sr); i < Math.floor(0.6 * sr); i++) {
    const t = i / sr;
    ph += (TAU * f * (1 + 0.04 * Math.sin(t * 17))) / sr;
    bp.run(((ph / TAU) % 1) * 2 - 1);
    const u = (t - 0.22) / 0.14;
    out[i] += bp.bp * Math.exp(-u * u) * 0.5;
  }
  // loose debris clattering on deck
  for (let k = 0; k < 4; k++) {
    const at = Math.floor((0.25 + r() * 0.5) * sr);
    modal(out, sr, r, [240 + r() * 300, 520 + r() * 500, 1300 + r() * 900], [0.009, 0.006, 0.004], [0.1, 0.07, 0.05], at);
    crackle(out, sr, r, 4, at / sr, 0.02, 1500, 4000, 0.06);
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
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    lp.run(r() * 2 - 1);
    ph += (TAU * (42 + 48 * Math.exp(-t / 0.05))) / sr;
    out[i] =
      Math.sin(ph) * (1 - Math.exp(-t / 0.003)) * Math.exp(-t / 0.11) +
      lp.lp * (1 - Math.exp(-t / 0.001)) * Math.exp(-t / 0.05) * 7;
  }
  crackle(out, sr, r, 70, 0.03, 0.55, 1200, 4500, 0.2);
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

export type BankKind = 'reverb' | 'cannon' | 'recoil' | 'wood' | 'water' | 'earth' | 'whoosh' | 'blast';
export const CALIBERS = 3;

/** Everything the game plays, cheapest/most needed first. Cannon index = caliber * 2 + variant. */
export function bankJobs(sr: number): { kind: BankKind; index: number; render: () => Float32Array[] }[] {
  const jobs: { kind: BankKind; index: number; render: () => Float32Array[] }[] = [];
  for (let c = 0; c < CALIBERS; c++)
    for (let v = 0; v < 2; v++) jobs.push({ kind: 'cannon', index: c * 2 + v, render: () => [cannonBlast(sr, c / (CALIBERS - 1), 101 + c * 17 + v * 5)] });
  jobs.push({ kind: 'reverb', index: 0, render: () => seaReverb(sr, 11) });
  for (let v = 0; v < 3; v++) jobs.push({ kind: 'recoil', index: v, render: () => [gunRecoil(sr, 301 + v)] });
  for (let v = 0; v < 2; v++) jobs.push({ kind: 'wood', index: v, render: () => [woodImpact(sr, 401 + v)] });
  for (let v = 0; v < 2; v++) jobs.push({ kind: 'water', index: v, render: () => [waterImpact(sr, 501 + v)] });
  jobs.push({ kind: 'earth', index: 0, render: () => [earthImpact(sr, 601)] });
  for (let v = 0; v < 2; v++) jobs.push({ kind: 'whoosh', index: v, render: () => [shotWhoosh(sr, 701 + v)] });
  for (let v = 0; v < 2; v++) jobs.push({ kind: 'blast', index: v, render: () => [magazineBlast(sr, 801 + v)] });
  return jobs;
}
