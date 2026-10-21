// The ship's band: plays the voyage songs (./songs) while nothing grander has
// the stage, one after another with a stretch of open sea between them.
// Plucked and struck notes are single buffer playbacks from ./musicKit; the
// whistle, fiddle, accordion and flute are each one live voice per song,
// gliding from note to note as a player would; the strings are short-lived
// swells per chord. Every channel sends into one shared hall. Nothing runs
// between songs, and the timer stops when the band is told to rest.
// Where the browser can, the band plays from tape: each song is rendered a
// few bars ahead off the audio thread (./prerender), so a phone's real-time
// mixer only plays a stereo stream instead of dozens of live oscillators,
// filters and the hall's convolution, which is what made it crackle.

import { DRUM_VARIANTS, KIT_ROOTS, KIT_SR, KitKind, Tonal } from './musicKit';
import { canPrerender, ChunkSource, ChunkStream } from './prerender';
import { Ev, Inst, Mono, SONGS } from './songs';

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const LOOKAHEAD = 1.2;

/** Each instrument's place in the mix: level, stereo position, how much hall. */
const CH: Record<Inst, { lvl: number; pan: number; send: number }> = {
  gtr: { lvl: 0.55, pan: -0.28, send: 0.22 },
  bass: { lvl: 0.32, pan: 0, send: 0.04 },
  pan: { lvl: 0.27, pan: 0.08, send: 0.32 },
  mar: { lvl: 0.3, pan: 0.3, send: 0.26 },
  kal: { lvl: 0.24, pan: -0.18, send: 0.42 },
  bod: { lvl: 0.5, pan: 0.04, send: 0.1 },
  bodHi: { lvl: 0.24, pan: 0.1, send: 0.1 },
  conga: { lvl: 0.2, pan: -0.38, send: 0.14 },
  congaLo: { lvl: 0.24, pan: -0.3, send: 0.14 },
  shk: { lvl: 0.11, pan: 0.42, send: 0.14 },
  clave: { lvl: 0.1, pan: 0.28, send: 0.3 },
  kick: { lvl: 0.42, pan: 0, send: 0.03 },
  whistle: { lvl: 0.12, pan: -0.12, send: 0.38 },
  fiddle: { lvl: 0.14, pan: 0.22, send: 0.38 },
  accord: { lvl: 0.42, pan: 0.06, send: 0.3 },
  flute: { lvl: 0.13, pan: -0.06, send: 0.48 },
  pad: { lvl: 0.04, pan: 0, send: 0.5 },
};

/** The live voices' timbres and touch. */
const VOICE: Record<Mono, { harm: number[]; oscs: number[]; atk: number; rel: number; glide: number; vib: [rate: number, cents: number, delay: number]; breath: number; lp: number; peaks?: [number, number, number][] }> = {
  // tin whistle: nearly pure, hollow, a puff of breath on each note
  whistle: { harm: [1, 0.16, 0.05, 0.025, 0.01], oscs: [0], atk: 0.012, rel: 0.03, glide: 0.01, vib: [5.6, 14, 0.2], breath: 0.06, lp: 7000 },
  // a low wooden flute: rounder, breathier, a slower, wider vibrato
  flute: { harm: [1, 0.22, 0.07, 0.03], oscs: [0], atk: 0.035, rel: 0.09, glide: 0.018, vib: [4.8, 17, 0.28], breath: 0.1, lp: 5000 },
  // fiddle: a bowed saw-like tone through the body's resonances, two players a hair apart
  fiddle: {
    harm: Array.from({ length: 24 }, (_, k) => 1 / Math.pow(k + 1, 1.15)),
    oscs: [-4, 4],
    atk: 0.04,
    rel: 0.07,
    glide: 0.014,
    vib: [5.8, 20, 0.16],
    breath: 0.02,
    lp: 5200,
    peaks: [
      [460, 1.2, 3],
      [2800, 1.4, 5],
    ],
  },
  // accordion: buzzing reeds tuned a few cents apart, the musette's shimmer
  accord: { harm: [1, 0.8, 0.62, 0.5, 0.42, 0.33, 0.27, 0.2, 0.16, 0.12, 0.09, 0.07, 0.05, 0.04], oscs: [-8, 0, 8], atk: 0.022, rel: 0.05, glide: 0.003, vib: [0, 0, 0], breath: 0, lp: 3200 },
};

interface Strip {
  in: GainNode;
}

/** Where a song plays: the live band, or one stretch of tape being rendered. */
interface Stage {
  readonly ctx: BaseAudioContext;
  readonly out: AudioNode;
  readonly verbIn: AudioNode;
  readonly kit: Partial<Record<Exclude<KitKind, 'verb'>, AudioBuffer[]>>;
  readonly noise: AudioBuffer;
}

/** One live melodic voice for the length of a song. */
class Voice {
  private oscs: OscillatorNode[] = [];
  private amp: GainNode;
  private vib: OscillatorNode | null = null;
  private vibG: GainNode | null = null;
  private breathG: GainNode | null = null;
  private breathF: BiquadFilterNode | null = null;
  private breathSrc: AudioBufferSourceNode | null = null;
  private spec: (typeof VOICE)[Mono];
  private fresh = true;

  constructor(ctx: BaseAudioContext, kind: Mono, out: AudioNode, noise: AudioBuffer, t0: number) {
    const sp = (this.spec = VOICE[kind]);
    this.amp = ctx.createGain();
    this.amp.gain.value = 0;
    let tail: AudioNode = this.amp;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = sp.lp;
    tail.connect(lp);
    tail = lp;
    for (const [f, q, db] of sp.peaks ?? []) {
      const pk = ctx.createBiquadFilter();
      pk.type = 'peaking';
      pk.frequency.value = f;
      pk.Q.value = q;
      pk.gain.value = db;
      tail.connect(pk);
      tail = pk;
    }
    tail.connect(out);
    const real = new Float32Array(sp.harm.length + 1);
    const imag = new Float32Array(sp.harm.length + 1);
    sp.harm.forEach((a, k) => (imag[k + 1] = a));
    const wave = ctx.createPeriodicWave(real, imag);
    if (sp.vib[0] > 0) {
      this.vib = ctx.createOscillator();
      this.vib.frequency.value = sp.vib[0];
      this.vibG = ctx.createGain();
      this.vibG.gain.value = 0;
      this.vib.connect(this.vibG);
      this.vib.start(t0);
    }
    for (const det of sp.oscs) {
      const o = ctx.createOscillator();
      o.setPeriodicWave(wave);
      o.detune.value = det;
      o.frequency.value = 440;
      if (this.vibG) this.vibG.connect(o.detune);
      const g = ctx.createGain();
      g.gain.value = 1 / sp.oscs.length;
      o.connect(g).connect(this.amp);
      o.start(t0);
      this.oscs.push(o);
    }
    if (sp.breath > 0) {
      const n = ctx.createBufferSource();
      n.buffer = noise;
      n.loop = true;
      this.breathF = ctx.createBiquadFilter();
      this.breathF.type = 'bandpass';
      this.breathF.Q.value = 1.3;
      this.breathG = ctx.createGain();
      this.breathG.gain.value = 0;
      n.connect(this.breathF).connect(this.breathG).connect(lp);
      n.start(t0, Math.random() * 2);
      this.breathSrc = n;
    }
  }

  note(e: Ev) {
    const sp = this.spec;
    const at = e.t;
    const f = hz(e.m);
    for (const o of this.oscs) {
      if (this.fresh) o.frequency.setValueAtTime(f, at);
      else if (e.g !== undefined) {
        // the cut: a flick of the finger to the note above, gone in a breath
        o.frequency.setValueAtTime(hz(e.g), at);
        o.frequency.setValueAtTime(f, at + 0.035);
      } else o.frequency.setTargetAtTime(f, at, sp.glide);
    }
    this.fresh = false;
    const a = this.amp.gain;
    const v = e.v;
    a.setTargetAtTime(v, at, sp.atk);
    // long notes swell a touch, as breath and bow settle in
    if (e.d > 0.6) a.setTargetAtTime(v * 1.08, at + 0.15, e.d * 0.4);
    const end = at + Math.max(0.05, e.d - Math.min(0.05, e.d * 0.12));
    a.setTargetAtTime(0, end, sp.rel);
    if (this.vibG) {
      const g = this.vibG.gain;
      g.setTargetAtTime(0, at, 0.03);
      if (e.d > 0.35) g.setTargetAtTime(sp.vib[1], at + sp.vib[2], 0.22);
    }
    if (this.breathG && this.breathF) {
      this.breathF.frequency.setValueAtTime(Math.min(f * 2, 9000), at);
      const b = this.breathG.gain;
      b.setTargetAtTime(v * sp.breath * 1.6, at, 0.008);
      b.setTargetAtTime(v * sp.breath * 0.35, at + 0.05, 0.05);
      b.setTargetAtTime(0, end, sp.rel);
    }
  }

  stop(at: number) {
    for (const o of this.oscs) o.stop(at);
    this.vib?.stop(at);
    this.breathSrc?.stop(at);
  }
}

/** A song being played: its notes still to come and the nodes they play through. */
export class Playing {
  readonly end: number;
  private i = 0;
  private strips = new Map<Inst, Strip>();
  private voices = new Map<Mono, Voice>();
  private dry: GainNode;
  private wet: GainNode;
  /** Which take of a drum comes next, so the same hit never repeats twice running. */
  alt = 0;
  private padL: GainNode | null = null;
  private padR: GainNode | null = null;
  stopped = false;

  constructor(
    private band: Stage,
    readonly index: number,
    private ev: Ev[],
    readonly t0: number,
  ) {
    const ctx = band.ctx;
    const last = ev[ev.length - 1];
    let end = 0;
    for (const e of ev) end = Math.max(end, e.t + e.d);
    this.end = t0 + Math.max(end, last.t) + 2.5;
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.dry.connect(band.out);
    this.wet.connect(band.verbIn);
    for (const e of ev) e.t += t0;
  }

  private strip(i: Inst): Strip {
    let s = this.strips.get(i);
    if (s) return s;
    const ctx = this.band.ctx;
    const c = CH[i];
    const g = ctx.createGain();
    g.gain.value = c.lvl;
    const send = ctx.createGain();
    send.gain.value = c.send;
    if (ctx.createStereoPanner && c.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = c.pan;
      g.connect(p).connect(this.dry);
      p.connect(send);
    } else {
      g.connect(this.dry);
      g.connect(send);
    }
    send.connect(this.wet);
    s = { in: g };
    this.strips.set(i, s);
    return s;
  }

  /** Schedules every note that starts before `until`. Notes already past are dropped. */
  pump(until: number) {
    if (this.stopped) return;
    const now = this.band.ctx.currentTime;
    const ev = this.ev;
    while (this.i < ev.length && ev[this.i].t < until) {
      const e = ev[this.i++];
      if (e.t < now - 0.02) continue;
      this.play(e);
    }
  }

  private play(e: Ev) {
    const i = e.i;
    if (i === 'whistle' || i === 'fiddle' || i === 'accord' || i === 'flute') {
      let v = this.voices.get(i);
      if (!v) {
        v = new Voice(this.band.ctx, i, this.strip(i).in, this.band.noise, Math.max(this.band.ctx.currentTime, e.t - 0.1));
        this.voices.set(i, v);
      }
      v.note(e);
    } else if (i === 'pad') this.pad(e);
    else if (i === 'pan' && e.d > 0.5) {
      // a pan player holds a long note by rolling it on two sticks
      const n = Math.floor((e.d - 0.05) / 0.072);
      // (each stroke is hushed by the next but one, so a roll never piles up voices)
      this.sample(i, e.t, e.m, e.v, n > 2 ? 0.16 : 0);
      for (let k = 1; k < n; k++) this.sample(i, e.t + k * 0.072 + (Math.random() - 0.5) * 0.008, e.m, e.v * (k % 2 ? 0.5 : 0.62) * (1 - (k / n) * 0.3), k < n - 1 ? 0.16 : 0);
    } else this.sample(i, e.t, e.m, e.v, i === 'gtr' || i === 'bass' ? e.d : 0);
  }

  private sample(i: Inst, at: number, m: number, v: number, damp: number) {
    const ctx = this.band.ctx;
    let buf: AudioBuffer | undefined;
    let rate = 1;
    if (i in KIT_ROOTS) {
      const roots = KIT_ROOTS[i as Tonal];
      let best = 0;
      for (let k = 1; k < roots.length; k++) if (Math.abs(roots[k] - m) < Math.abs(roots[best] - m)) best = k;
      buf = this.band.kit[i as Tonal]?.[best];
      rate = Math.pow(2, (m - roots[best]) / 12);
    } else {
      const n = DRUM_VARIANTS[i as keyof typeof DRUM_VARIANTS];
      buf = this.band.kit[i as Exclude<KitKind, 'verb' | Tonal>]?.[this.alt++ % n];
      rate = 0.985 + Math.random() * 0.03;
    }
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = v;
    src.connect(g).connect(this.strip(i).in);
    let stop = at + buf.duration / rate;
    if (damp > 0 && at + damp < stop) {
      // a finger comes down on the string
      g.gain.setValueAtTime(v, at + damp);
      g.gain.setTargetAtTime(0, at + damp, i === 'gtr' ? 0.11 : 0.07);
      stop = Math.min(stop, at + damp + 0.8);
    }
    src.start(at);
    src.stop(stop);
  }

  /** A string-section swell under one chord, its two desks spread left and right. */
  private pad(e: Ev) {
    const ctx = this.band.ctx;
    if (!this.padL || !this.padR) {
      const strip = this.strip('pad').in;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1500;
      lp.Q.value = 0.4;
      lp.connect(strip);
      this.padL = ctx.createGain();
      this.padR = ctx.createGain();
      if (ctx.createStereoPanner) {
        const pl = ctx.createStereoPanner();
        const pr = ctx.createStereoPanner();
        pl.pan.value = -0.6;
        pr.pan.value = 0.6;
        this.padL.connect(pl).connect(lp);
        this.padR.connect(pr).connect(lp);
      } else {
        this.padL.connect(lp);
        this.padR.connect(lp);
      }
    }
    const at = e.t;
    const atk = Math.min(1.4, e.d * 0.45);
    const rel = 1.6;
    const env = (out: GainNode) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(e.v, at + atk);
      g.gain.setValueAtTime(e.v, at + e.d);
      g.gain.linearRampToValueAtTime(0, at + e.d + rel);
      g.connect(out);
      return g;
    };
    const gl = env(this.padL);
    const gr = env(this.padR);
    for (const m of e.ch ?? []) {
      for (const [det, out] of [[-7, gl], [7, gr]] as const) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(m);
        o.detune.value = det + (Math.random() - 0.5) * 4;
        o.connect(out);
        o.start(at);
        o.stop(at + e.d + rel + 0.05);
      }
    }
  }

  /** Fades the song away from `at` and lets it go. */
  fade(at: number, len: number) {
    this.stopped = true;
    for (const g of [this.dry.gain, this.wet.gain]) {
      g.cancelScheduledValues(at);
      g.setValueAtTime(g.value, at);
      g.linearRampToValueAtTime(0, at + len);
    }
    this.release(at + len + 0.2);
  }

  /** Stops the live voices at `at` and drops the song's nodes once its tail has rung out. */
  release(at: number) {
    this.stopped = true;
    for (const v of this.voices.values()) v.stop(at);
    const ms = Math.max(0, (at - this.band.ctx.currentTime) * 1000) + 3500;
    if (typeof window !== 'undefined')
      window.setTimeout(() => {
        this.dry.disconnect();
        this.wet.disconnect();
      }, ms);
  }
}

/** A song cut into stretches of tape: the notes starting in each, rendered with their ring-out. */
export class BandTape implements ChunkSource {
  private i = 0;
  private alt = 0;

  constructor(
    private band: VoyageMusic,
    private index: number,
    private ev: Ev[],
  ) {}

  span(from: number, to: number) {
    const ev = this.ev;
    let j = this.i;
    let end = 0;
    for (; j < ev.length && ev[j].t < to; j++) end = Math.max(end, ev[j].t - from + ev[j].d);
    return { len: j > this.i ? Math.max(to - from, end) + this.band.ringOut : 0, more: j < ev.length };
  }

  render(ctx: OfflineAudioContext, dest: AudioNode, from: number, to: number) {
    const ev = this.ev;
    const part: Ev[] = [];
    while (this.i < ev.length && ev[this.i].t < to) {
      const e = ev[this.i++];
      part.push({ ...e, t: e.t - from });
    }
    const p = new Playing(this.band.tapeStage(ctx, dest), this.index, part, 0);
    p.alt = this.alt;
    p.pump(Infinity);
    this.alt = p.alt;
  }
}

export class VoyageMusic {
  readonly kit: Partial<Record<Exclude<KitKind, 'verb'>, AudioBuffer[]>> = {};
  readonly verbIn: GainNode;
  private verb: ConvolverNode;
  private verbBuf: AudioBuffer | null = null;
  /** Playing from tape (rendered ahead), or live. */
  private tape: boolean;
  /** The hall's sample rate: the tape's when taped (the kit's own rate), else the context's. */
  readonly verbRate: number;
  private longest = 2.6;
  private got = 0;
  private cur: Playing | ChunkStream | null = null;
  private wanted = false;
  private night = 0;
  private nextAt = 0;
  private last = -1;
  private bag: number[] = [];
  private timer = 0;
  private needed: number;

  /** Where the songs play into: the band's bus, through its low cut. */
  readonly out: AudioNode;

  constructor(
    readonly ctx: BaseAudioContext,
    private bus: AudioNode,
    readonly noise: AudioBuffer,
    jobs: number,
  ) {
    this.needed = jobs;
    this.tape = typeof window !== 'undefined' && !('startRendering' in ctx) && canPrerender(KIT_SR);
    this.verbRate = this.tape ? KIT_SR : ctx.sampleRate;
    // nothing below the bass's lowest string: rumble only muddies the sea and pumps the mix's compressor
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 62;
    hp.Q.value = 0.6;
    hp.connect(bus);
    this.out = hp;
    this.verbIn = ctx.createGain();
    this.verb = ctx.createConvolver();
    this.verb.normalize = false;
    this.verbIn.connect(this.verb).connect(hp);
  }

  get ready() {
    return this.got >= this.needed;
  }

  /** A rendered sample (or the hall) arriving from the kit. */
  store(kind: KitKind, index: number, buf: AudioBuffer) {
    if (kind === 'verb') {
      this.verbBuf = buf;
      if (!this.tape) this.verb.buffer = buf;
    } else {
      (this.kit[kind] ??= [])[index] = buf;
      this.longest = Math.max(this.longest, buf.duration);
    }
    this.got++;
  }

  /** Longest a note rings past its written end: a sample played down to its nearest root (or a pad's release), then the hall. */
  get ringOut() {
    return Math.max(this.longest * 1.12, 1.7) + (this.verbBuf?.duration ?? 2.2) + 0.1;
  }

  /** A fresh hall and low cut inside an offline render, for one stretch of tape. */
  tapeStage(ctx: OfflineAudioContext, dest: AudioNode): Stage {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 62;
    hp.Q.value = 0.6;
    hp.connect(dest);
    const verbIn = ctx.createGain();
    const verb = ctx.createConvolver();
    verb.normalize = false;
    verb.buffer = this.verbBuf;
    verbIn.connect(verb).connect(hp);
    return { ctx, out: hp, verbIn, kit: this.kit, noise: this.noise };
  }

  /** Whether the band should play (nothing grander sounding), and how dark it is (0 day .. 1 night). */
  want(on: boolean, night: number) {
    this.night = night;
    if (on === this.wanted) return;
    this.wanted = on;
    const now = this.ctx.currentTime;
    // back from a storm or the open sea: a breath of quiet, then a new song
    if (on) this.nextAt = Math.max(this.nextAt, now + (this.last < 0 ? 5 : 4 + Math.random() * 4));
    if (!this.timer && typeof window !== 'undefined') this.timer = window.setInterval(() => this.tick(), 200);
  }

  private tick() {
    const now = this.ctx.currentTime;
    const cur = this.cur;
    if (!this.wanted) {
      if (cur) {
        cur.fade(now, 3.5);
        this.cur = null;
      }
      clearInterval(this.timer);
      this.timer = 0;
      return;
    }
    if (cur) {
      cur.pump(now + LOOKAHEAD);
      if (cur instanceof ChunkStream && cur.failed) this.tape = false;
      if (now > cur.end) {
        cur.release(now);
        this.cur = null;
        // the sea has its turn between songs
        this.nextAt = now + 22 + Math.random() * 28;
      }
      return;
    }
    if (this.ready && now >= this.nextAt) this.cur = this.play(this.pick(), now + 0.15);
  }

  /** The next song: every one before any repeats, leaning toward those that suit the hour. */
  private pick() {
    if (!this.bag.length) this.bag = SONGS.map((_, k) => k).filter((k) => k !== this.last);
    const w = this.bag.map((k) => {
      const s = SONGS[k];
      return 0.15 + s.day * (1 - this.night) + s.night * this.night;
    });
    let x = Math.random() * w.reduce((a, b) => a + b, 0);
    let j = 0;
    while (j < w.length - 1 && (x -= w[j]) > 0) j++;
    const k = this.bag.splice(j, 1)[0];
    this.last = k;
    return k;
  }

  /** Starts song `index` at `at`; returns it so a caller (the offline preview) can pump it. */
  play(index: number, at: number) {
    let ev: Ev[];
    try {
      ev = SONGS[index].build(Math.random);
    } catch (err) {
      console.warn('[aquati] song failed to build:', SONGS[index].name, err);
      ev = [];
    }
    if (!ev.length) {
      this.nextAt = at + 30;
      return null;
    }
    if (this.tape)
      return new ChunkStream(this.ctx, this.bus, new BandTape(this, index, ev), { sr: KIT_SR, chunk: 8, lead: 5, startAt: at });
    return new Playing(this, index, ev, at);
  }
}
