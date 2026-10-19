// Synthesized soundscape: no audio files, all WebAudio.
// Surf + wind beds, plus a bank of combat sounds rendered at startup by
// ./sfx (cannon blasts per caliber, recoil, impacts, explosions) played
// through distance delay, air absorption and an island-echo reverb.

import { BankKind, bankJobs, CALIBERS } from './sfx';

const SPEED_OF_SOUND = 343;

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
const pick = <T>(a: T[]): T | undefined => a[(Math.random() * a.length) | 0];

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private surfGain!: GainNode;
  private windGain!: GainNode;
  private gust = 0;
  private duckGain!: GainNode;
  private reverb!: ConvolverNode;
  private reverbIn!: GainNode;
  private voices = 0;
  private bank: Record<Exclude<BankKind, 'reverb'>, AudioBuffer[]> = {
    cannon: [],
    recoil: [],
    wood: [],
    water: [],
    earth: [],
    whoosh: [],
    blast: [],
  };
  muted = false;

  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    // bus glue: fast enough to catch a broadside, slow enough to keep the crack
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 8;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    this.master.connect(comp).connect(ctx.destination);

    this.reverbIn = ctx.createGain();
    this.reverb = ctx.createConvolver();
    const wet = ctx.createGain();
    wet.gain.value = 0.75;
    this.reverbIn.connect(this.reverb).connect(wet).connect(this.master);
    this.duckGain = ctx.createGain();
    this.duckGain.connect(this.master);

    const len = ctx.sampleRate * 3;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    // pinkish noise
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.029591;
      b1 = 0.985 * b1 + w * 0.032534;
      b2 = 0.95 * b2 + w * 0.048056;
      d[i] = (b0 + b1 + b2 + w * 0.05) * 1.6;
    }

    // surf bed: lowpassed noise with a slow swell LFO
    const surf = ctx.createBufferSource();
    surf.buffer = this.noise;
    surf.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    this.surfGain = ctx.createGain();
    this.surfGain.gain.value = 0.22;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.09;
    lfo.connect(lfoG).connect(this.surfGain.gain);
    surf.connect(lp).connect(this.surfGain).connect(this.duckGain);
    surf.start();
    lfo.start();

    const wind = ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    wind.playbackRate.value = 0.7;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.05;
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.07;
    const lfo2G = ctx.createGain();
    lfo2G.gain.value = 300;
    lfo2.connect(lfo2G).connect(bp.frequency);
    wind.connect(bp).connect(this.windGain).connect(this.duckGain);
    wind.start(0, 1.3);
    lfo2.start();

    this.buildBank();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  /** Gusts rolling over the listener swell the wind bed. */
  setGust(g: number) {
    this.gust = g;
  }

  /** Speed-driven bed intensity. */
  setSailing(speed01: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.04 + speed01 * 0.08 + this.gust * 0.06, t, 0.5);
    this.surfGain.gain.setTargetAtTime(0.2 + speed01 * 0.12, t, 0.5);
  }

  private voice(vol: number, pan: number): [AudioContext, GainNode] | null {
    if (!this.ctx || this.muted) return null;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p).connect(this.master);
    } else g.connect(this.master);
    return [this.ctx, g];
  }

  /** Render the sample bank in a worker (or a piece per tick as a fallback) so starting never hitches. */
  private buildBank() {
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const store = (kind: BankKind, index: number, data: Float32Array[]) => {
      const b = ctx.createBuffer(data.length, data[0].length, sr);
      data.forEach((d, c) => b.getChannelData(c).set(d));
      if (kind === 'reverb') this.reverb.buffer = b;
      else this.bank[kind][index] = b;
    };
    const inline = () => {
      const jobs = bankJobs(sr);
      const next = () => {
        const j = jobs.shift();
        if (!j) return;
        store(j.kind, j.index, j.render());
        setTimeout(next, 0);
      };
      next();
    };
    try {
      const w = new Worker(new URL('./sfxWorker.ts', import.meta.url), { type: 'module' });
      let got = 0;
      const total = bankJobs(sr).length;
      w.onmessage = (e: MessageEvent<{ kind: BankKind; index: number; data: Float32Array[] }>) => {
        store(e.data.kind, e.data.index, e.data.data);
        if (++got === total) w.terminate();
      };
      w.onerror = () => {
        w.terminate();
        if (!got) inline();
      };
      w.postMessage({ sr });
    } catch {
      inline();
    }
  }

  /**
   * Play a bank sample out in the world. Sound travels at ~343 m/s, so a
   * distant broadside flashes first and booms a beat later; the air eats the
   * highs over distance, and far sounds arrive mostly as echo off the isles.
   */
  private emit(buf: AudioBuffer | undefined, o: { vol: number; pan: number; dist: number; rate?: number; wet?: number; delay?: number; panTo?: number }) {
    const ctx = this.ctx;
    if (!ctx || this.muted || !buf || o.vol < 0.01) return -1;
    if (this.voices > 48 && o.vol < 0.4) return -1;
    const at = ctx.currentTime + Math.min(o.dist / SPEED_OF_SOUND, 1.1) + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = o.rate ?? 1;
    const air = ctx.createBiquadFilter();
    air.type = 'lowpass';
    air.frequency.value = Math.max(900, 17000 * Math.exp(-o.dist / 115));
    air.Q.value = 0.5;
    const dry = ctx.createGain();
    dry.gain.value = o.vol;
    src.connect(air).connect(dry);
    let pan: StereoPannerNode | null = null;
    if (ctx.createStereoPanner) {
      pan = ctx.createStereoPanner();
      pan.pan.setValueAtTime(clamp1(o.pan), at);
      if (o.panTo !== undefined) pan.pan.linearRampToValueAtTime(clamp1(o.panTo), at + buf.duration / src.playbackRate.value);
      dry.connect(pan).connect(this.master);
    } else dry.connect(this.master);
    let send: GainNode | null = null;
    const wet = (o.wet ?? 0.4) * Math.pow(o.vol, 0.4);
    if (wet > 0.005) {
      send = ctx.createGain();
      send.gain.value = wet;
      air.connect(send).connect(this.reverbIn);
    }
    src.start(at);
    this.voices++;
    src.onended = () => {
      this.voices--;
      src.disconnect();
      air.disconnect();
      dry.disconnect();
      pan?.disconnect();
      send?.disconnect();
    };
    return at;
  }

  /** Close, heavy sounds momentarily push the sea and wind down, like your ears do. */
  private duck(at: number, depth: number) {
    const g = this.duckGain.gain;
    const now = this.ctx!.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.setValueAtTime(g.value, at);
    g.linearRampToValueAtTime(Math.min(g.value, 1 - depth), at + 0.02);
    g.setTargetAtTime(1, at + 0.12, 0.8);
  }

  /** One gun firing. `cal` 0 = light gun (sloop) .. 1 = heavy gun (galleon). */
  cannon(vol: number, pan: number, dist = 0, cal = 0.5) {
    const c = Math.round(Math.max(0, Math.min(1, cal)) * (CALIBERS - 1));
    const buf = this.bank.cannon[c * 2 + ((Math.random() * 2) | 0)];
    const at = this.emit(buf, { vol: vol * 0.62, pan, dist, rate: 0.93 + Math.random() * 0.12, wet: 0.55 });
    if (at < 0) return;
    if (dist < 30) {
      // your own gun deck: carriages slamming back on their tackle
      this.emit(pick(this.bank.recoil), { vol: vol * 0.3, pan: pan * 0.6, dist, rate: 0.9 + Math.random() * 0.2, wet: 0.15, delay: 0.02 + Math.random() * 0.04 });
      this.duck(at, 0.5);
    } else if (vol > 0.45) this.duck(at, 0.25);
  }

  /** A ship's magazine going up. */
  explosion(vol: number, pan: number, dist = 0) {
    const at = this.emit(pick(this.bank.blast), { vol: vol * 0.95, pan, dist, rate: 0.92 + Math.random() * 0.1, wet: 0.7 });
    if (at >= 0) this.duck(at, dist < 40 ? 0.7 : 0.35);
  }

  /** An enemy ball tearing past the listener, sweeping from one side to the other. */
  whoosh(vol: number, pan: number, panTo: number) {
    this.emit(pick(this.bank.whoosh), { vol: vol * 0.42, pan, panTo, dist: 0, rate: 0.85 + Math.random() * 0.3, wet: 0.1 });
  }

  splash(vol: number, pan: number, dist = 0) {
    this.emit(pick(this.bank.water), { vol: vol * 0.5, pan, dist, rate: 0.85 + Math.random() * 0.3, wet: 0.3 });
  }

  hit(vol: number, pan: number, dist = 0) {
    this.emit(pick(this.bank.wood), { vol: vol * 0.7, pan, dist, rate: 0.88 + Math.random() * 0.24, wet: 0.35 });
  }

  /** Shot ploughing into a beach or hillside. */
  thud(vol: number, pan: number, dist = 0) {
    this.emit(pick(this.bank.earth), { vol: vol * 0.45, pan, dist, rate: 0.85 + Math.random() * 0.3, wet: 0.3 });
  }

  chime() {
    const v = this.voice(0.25, 0);
    if (!v) return;
    const [ctx, out] = v;
    const notes = [659.25, 830.61, 987.77, 1318.5];
    notes.forEach((fr, i) => {
      const t = ctx.currentTime + i * 0.09;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = fr;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 1.3);
    });
  }

  coin() {
    const v = this.voice(0.18, 0);
    if (!v) return;
    const [ctx, out] = v;
    [1046.5, 1568].forEach((fr, i) => {
      const t = ctx.currentTime + i * 0.07;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = fr;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.4);
    });
  }

  click() {
    const v = this.voice(0.12, 0);
    if (!v) return;
    const [ctx, out] = v;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(500, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.1);
  }
}
