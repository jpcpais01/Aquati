// Soundscape: surf + wind beds, plus a bank of combat sounds rendered at startup by
// ./sfx (cannon blasts per caliber, recoil, impacts, explosions) played
// through distance delay, air absorption and an island-echo reverb.
// The harbour theme is the one recorded file: streamed, never decoded whole.

import { BankKind, bankJobs, CALIBERS } from './sfx';
import { renderThunder } from './thunder';

const SPEED_OF_SOUND = 343;
/** Most bank samples sounding at once; past this a big battle only piles crackle onto the audio thread. */
const MAX_VOICES = 64;
const AMBIENCE_LEVEL = 0.35;
const MUSIC_URL = '/music/sunset-archipelago.mp3';
const MUSIC_VOL = 0.55;

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
const pick = <T>(a: T[]): T | undefined => a[(Math.random() * a.length) | 0];

/** A jaunty hornpipe phrase in D for coming alongside: [midi, beat, beats], tune over oom-pah. */
const ARRIVAL: [number, number, number][] = [
  [69, 0, 1], [74, 1, 1], [74, 2, 1], [78, 3, 1], [76, 4, 1], [74, 5, 1],
  [76, 6, 1], [72, 7, 1], [69, 8, 1], [71, 9, 1], [73, 10, 1], [74, 11, 3],
  [50, 0, 1.5], [54, 1.5, 1], [57, 1.5, 1], [45, 3, 1.5], [54, 4.5, 1], [57, 4.5, 1],
  [48, 6, 1.5], [52, 7.5, 1], [55, 7.5, 1], [45, 9, 1.5], [55, 10.5, 1], [57, 10.5, 1], [50, 11, 3], [54, 11, 3], [57, 11, 3],
];
/** A quick squeezebox run up to a ringing chord, for a fortune changing hands. */
const FLOURISH: [number, number, number][] = [
  [74, 0, 1], [78, 1, 1], [81, 2, 1], [86, 3, 3], [50, 3, 3], [57, 3, 3], [62, 3, 3],
];

/** A feast-night reel: bars of [midi, eighths] over a chord root per bar, oom-pah on the quarters. */
function reel(bars: [number, number][][], roots: number[]) {
  const notes: [number, number, number][] = [];
  bars.forEach((bar, b) => {
    let at = b * 8;
    for (const [m, len] of bar) {
      notes.push([m, at, len * 0.92]);
      at += len;
    }
    // the left hand: root on the one and the three, a major chord on the off-beats
    const r = roots[b];
    const third = r % 12 === 4 || r % 12 === 11 ? 3 : 4; // E and B minor, the rest major
    for (const q of [0, 4]) notes.push([r - 12 + (q ? 7 : 0), b * 8 + q, 1.5]);
    for (const q of [2, 6]) for (const iv of [third, 7]) notes.push([r - 12 + iv + 12, b * 8 + q, 1.4]);
  });
  return { notes, eighths: bars.length * 8 };
}

/** The town band's book: reels in D and G and a hornpipe in E minor, played round and round. */
const REELS = [
  reel(
    [
      [[74, 1], [78, 1], [81, 1], [78, 1], [74, 1], [78, 1], [81, 1], [78, 1]],
      [[79, 1], [83, 1], [81, 1], [78, 1], [76, 1], [74, 1], [76, 1], [78, 1]],
      [[74, 1], [78, 1], [81, 1], [78, 1], [86, 1], [81, 1], [78, 1], [81, 1]],
      [[79, 1], [76, 1], [73, 1], [76, 1], [74, 4]],
    ],
    [62, 67, 62, 57],
  ),
  reel(
    [
      [[83, 1], [81, 1], [79, 1], [81, 1], [83, 1], [86, 1], [83, 1], [81, 1]],
      [[79, 1], [81, 1], [83, 1], [79, 1], [76, 1], [78, 1], [79, 1], [76, 1]],
      [[74, 1], [76, 1], [78, 1], [81, 1], [86, 1], [85, 1], [83, 1], [81, 1]],
      [[83, 1], [79, 1], [76, 1], [73, 1], [74, 4]],
    ],
    [67, 64, 62, 57],
  ),
  reel(
    [
      [[76, 1], [79, 1], [83, 1], [79, 1], [76, 1], [79, 1], [83, 1], [88, 1]],
      [[86, 1], [83, 1], [81, 1], [78, 1], [74, 1], [78, 1], [81, 1], [83, 1]],
      [[76, 1], [79, 1], [83, 1], [79, 1], [81, 1], [78, 1], [74, 1], [78, 1]],
      [[79, 1], [78, 1], [76, 1], [75, 1], [76, 4]],
    ],
    [64, 62, 64, 59],
  ),
  reel(
    [
      [[81, 2], [78, 1], [81, 1], [86, 2], [81, 1], [78, 1]],
      [[79, 1], [78, 1], [76, 1], [78, 1], [79, 2], [83, 2]],
      [[81, 2], [78, 1], [81, 1], [86, 1], [85, 1], [83, 1], [81, 1]],
      [[79, 1], [76, 1], [78, 1], [76, 1], [74, 4]],
    ],
    [62, 67, 62, 57],
  ),
];

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private musicBus: GainNode | null = null;
  /** Player volume sliders, 0..1. */
  private vol = { master: 1, music: 1, effects: 1, ambience: 1 };
  private noise!: AudioBuffer;
  private surfGain!: GainNode;
  private windGain!: GainNode;
  private rainGain!: GainNode;
  private roarGain!: GainNode;
  private wx = { rain: 0, storm: 0, wind: 0.8 };
  private thunderNear: AudioBuffer[] = [];
  private thunderFar: AudioBuffer[] = [];
  private thunderQueued = false;
  private gust = 0;
  /** The maelstrom's roar: a looping bed built the first time one is in earshot. */
  private vortexBed: { gain: GainNode; pan: StereoPannerNode | null; howl: GainNode; howlF: BiquadFilterNode } | null = null;
  private duckGain!: GainNode;
  private reverb!: ConvolverNode;
  private reverbIn!: GainNode;
  /** Muffles the whole mix when the camera follows a wreck under. */
  private muffle!: BiquadFilterNode;
  private deep: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private voices = 0;
  private bank: Record<Exclude<BankKind, 'reverb'>, AudioBuffer[]> = {
    rocket: [],
    fwBoom: [],
    fwCrackle: [],
    fwSizzle: [],
    fwPop: [],
    cannon: [],
    recoil: [],
    wood: [],
    water: [],
    earth: [],
    whoosh: [],
    blast: [],
    crunch: [],
    shell: [],
    ignite: [],
    steam: [],
    grape: [],
    chain: [],
    flames: [],
    coin: [],
    pour: [],
    purse: [],
    creak: [],
    mallet: [],
    clunk: [],
    lap: [],
    murmur: [],
  };
  /** The quay's loops and the timer that peppers them with creaks, gulls and hammering. */
  private quay: { gain: GainNode; srcs: AudioBufferSourceNode[]; timer: number } | null = null;
  private music: HTMLAudioElement | null = null;
  private musicGain: GainNode | null = null;
  private musicWanted = false;
  private musicStop = 0;
  muted = false;

  constructor() {
    document.addEventListener('visibilitychange', () => this.syncMusic());
  }

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
    this.master.gain.value = this.muted ? 0 : 0.8 * this.vol.master;
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.vol.effects;
    this.sfxBus.connect(this.master);
    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = this.vol.ambience;
    this.ambBus.connect(this.master);
    // bus glue: fast enough to catch a broadside, slow enough to keep the crack
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 8;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 22000;
    this.muffle.Q.value = 0.5;
    this.master.connect(this.muffle).connect(comp).connect(ctx.destination);

    this.reverbIn = ctx.createGain();
    this.reverb = ctx.createConvolver();
    const wet = ctx.createGain();
    wet.gain.value = 0.75;
    this.reverbIn.connect(this.reverb).connect(wet).connect(this.sfxBus);
    this.duckGain = ctx.createGain();
    // sea + wind sit well under the guns and music: a bed, not a wall
    const bed = ctx.createGain();
    bed.gain.value = AMBIENCE_LEVEL;
    this.duckGain.connect(bed).connect(this.ambBus);

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

    // rain: hiss of drops on the sea and the deck, plus a low roar in a downpour
    const rain = ctx.createBufferSource();
    rain.buffer = this.noise;
    rain.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1400;
    const rlp = ctx.createBiquadFilter();
    rlp.type = 'lowpass';
    rlp.frequency.value = 9000;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rain.connect(hp).connect(rlp).connect(this.rainGain).connect(this.duckGain);
    rain.start(0, 0.7);
    const roar = ctx.createBufferSource();
    roar.buffer = this.noise;
    roar.loop = true;
    roar.playbackRate.value = 0.55;
    const roarLp = ctx.createBiquadFilter();
    roarLp.type = 'lowpass';
    roarLp.frequency.value = 380;
    this.roarGain = ctx.createGain();
    this.roarGain.gain.value = 0;
    roar.connect(roarLp).connect(this.roarGain).connect(this.duckGain);
    roar.start(0, 2.1);

    this.buildBank();
  }

  /** Settings switch for the harbour theme, separate from the master mute. */
  musicEnabled = true;

  setMusicEnabled(on: boolean) {
    this.musicEnabled = on;
    this.syncMusic(0.6);
    this.syncBoss();
    this.syncSea();
  }

  /** Volume sliders (0..1 each). Music skips the effects compressor, so it takes master directly. */
  setVolumes(v: { master: number; music: number; effects: number; ambience: number }) {
    // squared: sliders feel even to the ear instead of all happening at the top
    const sq = (x: number) => Math.max(0, Math.min(1, x)) ** 2;
    v = { master: sq(v.master), music: sq(v.music), effects: sq(v.effects), ambience: sq(v.ambience) };
    this.vol = v;
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8 * v.master, t, 0.04);
    this.sfxBus.gain.setTargetAtTime(v.effects, t, 0.04);
    this.ambBus.gain.setTargetAtTime(v.ambience, t, 0.04);
    this.musicBus?.gain.setTargetAtTime(v.music * v.master, t, 0.04);
    if (this.music && !this.musicGain) this.syncMusic(0.1);
    this.syncBoss();
    this.syncSea();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8 * this.vol.master, this.ctx.currentTime, 0.05);
    this.syncMusic(0.25);
  }

  /**
   * Harbour theme on or off. It only sounds once start() has run inside a user
   * gesture; until then the wish is remembered. Off fades out like a ship
   * leaving the quay, then the stream pauses so it costs nothing at sea.
   */
  setMusic(on: boolean, restart = false) {
    if (restart && on && !this.musicWanted && this.music) this.music.currentTime = 0;
    if (on === this.musicWanted && (!on || (this.music && !this.music.paused))) return;
    this.musicWanted = on;
    this.syncMusic(on ? 1.6 : 2.4);
  }

  private syncMusic(fade = 0.6) {
    const ctx = this.ctx;
    if (!ctx) return;
    const audible = this.musicWanted && this.musicEnabled && !this.muted && !document.hidden;
    if (!this.music) {
      if (!audible) return;
      const el = new window.Audio();
      el.src = MUSIC_URL;
      el.loop = true;
      el.preload = 'auto';
      this.music = el;
      try {
        // route through WebAudio so fades work on iOS, where element.volume is read-only
        this.musicGain = ctx.createGain();
        this.musicGain.gain.value = 0;
        this.musicBus = ctx.createGain();
        this.musicBus.gain.value = this.vol.music * this.vol.master;
        ctx.createMediaElementSource(el).connect(this.musicGain).connect(this.musicBus).connect(ctx.destination);
      } catch {
        this.musicGain = null;
        el.volume = 0;
      }
    }
    const el = this.music;
    const target = audible ? MUSIC_VOL * (this.musicGain ? 1 : this.vol.music * this.vol.master) : 0;
    clearTimeout(this.musicStop);
    if (audible && el.paused) void el.play().catch(() => {});
    if (this.musicGain) {
      const g = this.musicGain.gain;
      const t = ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(target, t + fade);
    } else {
      // fallback: step element.volume where it is writable
      const from = el.volume;
      const t0 = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / (fade * 1000));
        el.volume = from + (target - from) * k;
        if (k < 1) requestAnimationFrame(step);
      };
      step();
    }
    if (!audible) this.musicStop = window.setTimeout(() => el.pause(), fade * 1000 + 100);
  }

  /** Gusts rolling over the listener swell the wind bed. */
  setGust(g: number) {
    this.gust = g;
  }

  /** Speed-driven bed intensity. */
  setSailing(speed01: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const w = this.wx;
    const blow = Math.max(0, w.wind - 0.8);
    this.windGain.gain.setTargetAtTime(0.04 + speed01 * 0.08 + this.gust * 0.06 + blow * 0.2 + w.storm * 0.07, t, 0.5);
    this.surfGain.gain.setTargetAtTime(0.2 + speed01 * 0.12 + w.storm * 0.14, t, 0.5);
  }

  /** Weather beds: rain hiss & roar, a howling wind and heavier surf in a storm. */
  setWeather(rain: number, storm: number, wind: number) {
    this.wx.rain = rain;
    this.wx.storm = storm;
    this.wx.wind = wind;
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.rainGain.gain.setTargetAtTime(rain * 0.13, t, 0.6);
      this.roarGain.gain.setTargetAtTime(rain * rain * 0.12 + storm * 0.1, t, 0.8);
    }
    if (storm > 0.1 && !this.thunderQueued && this.ctx) {
      // render the thunder bank a piece per tick, well before the first strike
      this.thunderQueued = true;
      const ctx = this.ctx;
      const jobs: [boolean, number][] = [[true, 1], [false, 2], [true, 3], [false, 4]];
      const next = () => {
        const j = jobs.shift();
        if (!j) return;
        const data = renderThunder(ctx.sampleRate, j[0], j[1]);
        const b = ctx.createBuffer(2, data[0].length, ctx.sampleRate);
        b.getChannelData(0).set(data[0]);
        b.getChannelData(1).set(data[1]);
        (j[0] ? this.thunderNear : this.thunderFar).push(b);
        setTimeout(next, 30);
      };
      setTimeout(next, 0);
    }
  }

  /** Thunder from a strike `dist` metres away: it arrives late, and far peals are dull and long. */
  thunder(vol: number, pan: number, dist: number) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const near = dist < 700;
    const buf = pick(near ? this.thunderNear : this.thunderFar) ?? pick(this.thunderNear) ?? pick(this.thunderFar);
    if (!buf) return;
    const at = ctx.currentTime + dist / SPEED_OF_SOUND;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (near ? 0.9 : 0.75) + Math.random() * 0.15;
    const air = ctx.createBiquadFilter();
    air.type = 'lowpass';
    air.frequency.value = Math.max(260, 9000 * Math.exp(-dist / 260));
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(air).connect(g);
    let p: StereoPannerNode | null = null;
    if (ctx.createStereoPanner) {
      p = ctx.createStereoPanner();
      p.pan.value = clamp1(pan);
      g.connect(p).connect(this.sfxBus);
    } else g.connect(this.sfxBus);
    const send = ctx.createGain();
    send.gain.value = 0.5;
    air.connect(send).connect(this.reverbIn);
    src.start(at);
    if (near && vol > 0.5) this.duck(at, 0.3);
    src.onended = () => {
      src.disconnect();
      air.disconnect();
      g.disconnect();
      p?.disconnect();
      send.disconnect();
    };
  }

  private voice(vol: number, pan: number): [AudioContext, GainNode] | null {
    if (!this.ctx || this.muted) return null;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p).connect(this.sfxBus);
    } else g.connect(this.sfxBus);
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
    // a crowded mix drops the faint and far first, and never grows past what a weak device can mix
    if (this.voices >= MAX_VOICES || (this.voices > 40 && o.vol < 0.4)) return -1;
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
      dry.connect(pan).connect(this.sfxBus);
    } else dry.connect(this.sfxBus);
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

  private wraithAt = 0;

  /**
   * Wraith-fire leaving a phantom's gun: a hollow, falling howl with a
   * shimmer on top, like wind across the mouth of a jar. Synthesised; one per
   * ripple of the broadside at most, so a volley is a chorus, not a swarm.
   */
  wraith(vol: number, pan: number, dist = 0) {
    if (vol < 0.03) return;
    const v = this.voice(vol * 0.5, pan);
    if (!v) return;
    const [ctx, out] = v;
    const now = ctx.currentTime;
    if (now - this.wraithAt < 0.12) {
      out.disconnect();
      return;
    }
    this.wraithAt = now;
    const at = now + Math.min(dist / SPEED_OF_SOUND, 1.1);
    const send = ctx.createGain();
    send.gain.value = 0.7;
    out.connect(send).connect(this.reverbIn);
    const f = 300 + Math.random() * 90;
    for (const [mul, gain, type] of [[1, 0.32, 'triangle'], [1.505, 0.16, 'sine'], [2.01, 0.08, 'sine']] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f * mul * 1.35, at);
      o.frequency.exponentialRampToValueAtTime(f * mul * 0.55, at + 0.9);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 6 + Math.random() * 2;
      const lg = ctx.createGain();
      lg.gain.value = f * mul * 0.025;
      lfo.connect(lg).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(gain, at + 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, at + 1.0);
      o.connect(g).connect(out);
      o.start(at);
      lfo.start(at);
      o.stop(at + 1.05);
      lfo.stop(at + 1.05);
    }
  }

  /**
   * A ghost ship sighted: a far-off, wordless choir that swells out of the
   * sea and drifts down a semitone before it dies away.
   */
  ghostWail(vol = 0.35, pan = 0) {
    const v = this.voice(vol, pan);
    if (!v) return;
    const [ctx, out] = v;
    const t = ctx.currentTime;
    const send = ctx.createGain();
    send.gain.value = 1.2;
    out.connect(send).connect(this.reverbIn);
    // a minor chord of hollow "ooh" voices, each through a vowel formant
    for (const semi of [0, 3, 7, 12]) {
      for (const det of [-6, 5]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        const f = 196 * Math.pow(2, semi / 12);
        o.frequency.setValueAtTime(f, t);
        o.frequency.linearRampToValueAtTime(f * 0.944, t + 4.2);
        o.detune.value = det + Math.random() * 4;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 4.6 + Math.random() * 1.2;
        const lg = ctx.createGain();
        lg.gain.value = f * 0.012;
        lfo.connect(lg).connect(o.frequency);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 420 + Math.random() * 60;
        bp.Q.value = 6;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.09, t + 1.6 + Math.random() * 0.5);
        g.gain.setTargetAtTime(0.0001, t + 2.8, 0.7);
        o.connect(bp).connect(g).connect(out);
        o.start(t);
        lfo.start(t);
        o.stop(t + 5.5);
        lfo.stop(t + 5.5);
      }
    }
  }

  /**
   * A fallen pirate's ghost slipping free: one small hollow "woo-oo" that swoops
   * up and sighs back down, with a glassy twinkle on top. Each one pitched a
   * little differently, so a whole crew going up sounds like a choir of them.
   */
  spirit(vol: number, pan: number, dist = 0) {
    const v = this.voice(Math.min(1, vol), pan);
    if (!v) return;
    const [ctx, out] = v;
    const t = ctx.currentTime + Math.min(dist / SPEED_OF_SOUND, 0.8);
    const send = ctx.createGain();
    send.gain.value = 1.4;
    out.connect(send).connect(this.reverbIn);
    const f = 330 * Math.pow(2, (Math.floor(Math.random() * 6) * 2) / 12);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f * 0.75, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.42);
    o.frequency.exponentialRampToValueAtTime(f * 1.06, t + 1.25);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2 + Math.random() * 1.4;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(f * 0.03, t + 0.6);
    lfo.connect(lg).connect(o.frequency);
    // an "oo" formant
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 620;
    bp.Q.value = 2.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.3);
    g.gain.setTargetAtTime(0.0001, t + 0.85, 0.28);
    o.connect(bp).connect(g).connect(out);
    o.start(t);
    lfo.start(t);
    o.stop(t + 2.2);
    lfo.stop(t + 2.2);
    for (const [fr, d] of [[f * 4, 0.1], [f * 6, 0.22]] as const) {
      const s = ctx.createOscillator();
      s.type = 'sine';
      s.frequency.value = fr;
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.0001, t + d);
      sg.gain.linearRampToValueAtTime(0.07, t + d + 0.02);
      sg.gain.exponentialRampToValueAtTime(0.0005, t + d + 0.9);
      s.connect(sg).connect(out);
      s.start(t + d);
      s.stop(t + d + 1);
    }
  }

  /** A ghost ship laid to rest: a rising chord that opens out and fades like breath on glass. */
  exorcise(vol: number, pan: number, dist = 0) {
    const v = this.voice(Math.min(1, vol * 0.8), pan);
    if (!v) return;
    const [ctx, out] = v;
    const t = ctx.currentTime + Math.min(dist / SPEED_OF_SOUND, 1.1);
    const send = ctx.createGain();
    send.gain.value = 1.1;
    out.connect(send).connect(this.reverbIn);
    for (const [semi, d] of [[0, 0], [7, 0.12], [12, 0.24], [16, 0.36], [19, 0.5]] as const) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      const f = 220 * Math.pow(2, semi / 12);
      o.frequency.setValueAtTime(f * 0.94, t + d);
      o.frequency.exponentialRampToValueAtTime(f * 1.06, t + d + 2.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.linearRampToValueAtTime(0.14, t + d + 0.25);
      g.gain.exponentialRampToValueAtTime(0.001, t + d + 2.8);
      o.connect(g).connect(out);
      o.start(t + d);
      o.stop(t + d + 2.9);
    }
    // a low rush of air as the shroud falls away
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'bandpass';
    lp.frequency.setValueAtTime(260, t);
    lp.frequency.exponentialRampToValueAtTime(1800, t + 2);
    lp.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(0.35, t + 0.3);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 2.1);
    n.connect(lp).connect(ng).connect(out);
    n.start(t);
    n.stop(t + 2.2);
  }


  /**
   * A herring gull calling, synthesised on the spot: each note a nasal, raspy
   * "kyow" that leaps up then falls away; several in a row make the laughing call.
   */
  gull(vol: number, pan: number, notes = 1, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || this.muted || vol < 0.01) return;
    const out = ctx.createGain();
    out.gain.value = Math.min(1, vol) * 0.2;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = clamp1(pan);
      out.connect(panner).connect(this.ambBus);
    } else out.connect(this.ambBus);
    // a nasal formant over a sawtooth voice, with the throat's rasp as fast vibrato
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2100 + Math.random() * 500;
    bp.Q.value = 2.2;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 600;
    bp.connect(hp).connect(out);
    const voice = 0.85 + Math.random() * 0.3;
    const t0 = ctx.currentTime + delay;
    const gap = 0.27 + Math.random() * 0.08;
    let end = t0;
    for (let i = 0; i < notes; i++) {
      const t = t0 + i * gap;
      const len = (i === 0 && notes > 1 ? 0.34 : 0.24) + Math.random() * 0.05;
      const f = voice * (1 - i * 0.04);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(900 * f, t);
      o.frequency.linearRampToValueAtTime(1550 * f, t + len * 0.22);
      o.frequency.exponentialRampToValueAtTime(720 * f, t + len);
      const rasp = ctx.createOscillator();
      rasp.frequency.value = 34 + Math.random() * 12;
      const raspAmt = ctx.createGain();
      raspAmt.gain.value = 55 * f;
      rasp.connect(raspAmt).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1, t + 0.025);
      g.gain.setValueAtTime(1, t + len * 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(bp);
      o.start(t);
      rasp.start(t);
      o.stop(t + len + 0.02);
      rasp.stop(t + len + 0.02);
      o.onended = () => {
        o.disconnect();
        rasp.disconnect();
        raspAmt.disconnect();
        g.disconnect();
      };
      end = t + len + 0.05;
    }
    // let the filter chain go once the last note has died away
    setTimeout(() => {
      bp.disconnect();
      hp.disconnect();
      out.disconnect();
      panner?.disconnect();
    }, (end - ctx.currentTime) * 1000 + 200);
  }

  /** A ship's magazine going up. */
  explosion(vol: number, pan: number, dist = 0) {
    const at = this.emit(pick(this.bank.blast), { vol: vol * 0.95, pan, dist, rate: 0.92 + Math.random() * 0.1, wet: 0.7 });
    if (at >= 0) this.duck(at, dist < 40 ? 0.7 : 0.35);
  }

  /** An enemy ball tearing past the listener, sweeping from one side to the other. `pitch` < 1 for heavier, slower shot. */
  whoosh(vol: number, pan: number, panTo: number, pitch = 1) {
    this.emit(pick(this.bank.whoosh), { vol: vol * 0.42, pan, panTo, dist: 0, rate: (0.85 + Math.random() * 0.3) * pitch, wet: 0.1 });
  }

  /** An explosive shell bursting. */
  shell(vol: number, pan: number, dist = 0) {
    const at = this.emit(pick(this.bank.shell), { vol: vol * 0.85, pan, dist, rate: 0.94 + Math.random() * 0.12, wet: 0.65 });
    if (at >= 0) this.duck(at, dist < 40 ? 0.45 : 0.2);
  }

  /** Fire shot catching on a hull. */
  ignite(vol: number, pan: number, dist = 0) {
    this.emit(pick(this.bank.ignite), { vol: vol * 0.7, pan, dist, rate: 0.9 + Math.random() * 0.2, wet: 0.35 });
  }

  /** Hot iron hissing into the sea. */
  sizzle(vol: number, pan: number, dist = 0) {
    this.emit(pick(this.bank.steam), { vol: vol * 0.38, pan, dist, rate: 0.85 + Math.random() * 0.3, wet: 0.25 });
  }

  /** Grape shot raking a deck. */
  grape(vol: number, pan: number, dist = 0) {
    this.emit(pick(this.bank.grape), { vol: vol * 0.75, pan, dist, rate: 0.9 + Math.random() * 0.2, wet: 0.35 });
  }

  /** Chain shot tearing through rigging. */
  chain(vol: number, pan: number, dist = 0) {
    this.emit(pick(this.bank.chain), { vol: vol * 0.7, pan, dist, rate: 0.9 + Math.random() * 0.2, wet: 0.35 });
  }

  /** A ship burning: the roar and crackle of flames on her deck. */
  flames(vol: number, pan: number, dist = 0) {
    this.emit(pick(this.bank.flames), { vol: vol * 0.32, pan, dist, rate: 0.85 + Math.random() * 0.3, wet: 0.3 });
  }

  /**
   * Fireworks: a rocket going up, a shell breaking overhead (a showpiece's
   * heavier double charge), crackle, a willow's hanging hiss or a crossette's
   * split. Bursts arrive late across the water like any far bang.
   */
  firework(kind: 'launch' | 'whistle' | 'burst' | 'big' | 'crackle' | 'pop' | 'sizzle', vol: number, pan: number, dist = 0) {
    const b = this.bank;
    switch (kind) {
      case 'launch':
        this.emit(b.rocket[(Math.random() * 2) | 0], { vol: vol * 0.42, pan, dist, rate: 0.9 + Math.random() * 0.25, wet: 0.25 });
        break;
      case 'whistle':
        this.emit(b.rocket[2], { vol: vol * 0.5, pan, dist, rate: 0.92 + Math.random() * 0.16, wet: 0.35 });
        break;
      case 'burst': {
        const at = this.emit(b.fwBoom[(Math.random() * 2) | 0], { vol: vol * 0.7, pan, dist, rate: 0.85 + Math.random() * 0.3, wet: 0.75 });
        if (at >= 0 && vol > 0.6) this.duck(at, 0.2);
        break;
      }
      case 'big': {
        const at = this.emit(b.fwBoom[2], { vol: vol * 0.85, pan, dist, rate: 0.9 + Math.random() * 0.1, wet: 0.85 });
        if (at >= 0) this.duck(at, 0.35);
        break;
      }
      case 'crackle':
        this.emit(b.fwCrackle[(Math.random() * 2) | 0], { vol: vol * 0.5, pan, dist, rate: 0.9 + Math.random() * 0.2, wet: 0.55 });
        break;
      case 'pop':
        this.emit(b.fwPop[0], { vol: vol * 0.55, pan, dist, rate: 0.9 + Math.random() * 0.25, wet: 0.5 });
        break;
      case 'sizzle':
        this.emit(b.fwSizzle[0], { vol: vol * 0.35, pan, dist, rate: 0.9 + Math.random() * 0.2, wet: 0.4 });
        break;
    }
  }

  /** Changing the shot: a ball of the new kind rolling into the gunner's hands and a click of the rack. */
  ammoSwap(kind: number) {
    const v = this.voice(0.22, 0);
    if (!v) return;
    const [ctx, out] = v;
    const t = ctx.currentTime;
    // the iron ball's knock, lower for heavier loads
    const o = ctx.createOscillator();
    o.type = 'triangle';
    const f = [118, 96, 132, 150, 210, 260][kind] ?? 118;
    o.frequency.setValueAtTime(f * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.18);
    // a short metallic click from the rack
    const c = ctx.createOscillator();
    c.type = 'square';
    c.frequency.value = 2400 + kind * 260;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.0001, t + 0.05);
    cg.gain.exponentialRampToValueAtTime(0.12, t + 0.052);
    cg.gain.exponentialRampToValueAtTime(0.0005, t + 0.085);
    c.connect(cg).connect(out);
    c.start(t + 0.05);
    c.stop(t + 0.1);
  }

  splash(vol: number, pan: number, dist = 0) {
    this.emit(pick(this.bank.water), { vol: vol * 0.5, pan, dist, rate: 0.85 + Math.random() * 0.3, wet: 0.3 });
  }

  /**
   * A dolphin slipping back in: a bright little "plip" (a quick rising
   * bubble tone) over a short airy fizz of spray. Small and clean, nothing
   * like the deep thump of a ball striking the sea.
   */
  dolphinSplash(vol: number, pan: number, dist = 0) {
    const v = this.voice(vol * Math.min(1, 90 / (90 + dist)), pan);
    if (!v) return;
    const [ctx, out] = v;
    const t = ctx.currentTime + Math.min(dist / SPEED_OF_SOUND, 0.6);
    const f0 = 700 + Math.random() * 300;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 2.6, t + 0.07);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.32, t + 0.008);
    og.gain.exponentialRampToValueAtTime(0.0005, t + 0.11);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.13);
    // a second, higher droplet just after
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    const f1 = f0 * 1.5;
    o2.frequency.setValueAtTime(f1, t + 0.05);
    o2.frequency.exponentialRampToValueAtTime(f1 * 2.2, t + 0.1);
    const og2 = ctx.createGain();
    og2.gain.setValueAtTime(0.0001, t + 0.05);
    og2.gain.exponentialRampToValueAtTime(0.14, t + 0.056);
    og2.gain.exponentialRampToValueAtTime(0.0005, t + 0.13);
    o2.connect(og2).connect(out);
    o2.start(t + 0.05);
    o2.stop(t + 0.15);
    // the spray: high, airy and short
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2600;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(0.16, t + 0.012);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    src.connect(hp).connect(ng).connect(out);
    src.start(t, Math.random());
    src.stop(t + 0.24);
  }

  hit(vol: number, pan: number, dist = 0) {
    this.emit(pick(this.bank.wood), { vol: vol * 0.8, pan, dist, rate: 0.8 + Math.random() * 0.14, wet: 0.45 });
  }

  /** Hulls colliding or a keel grinding onto rock. `force` 0 = a nudge .. 1 = a full-speed ram. */
  crunch(vol: number, pan: number, dist = 0, force = 1) {
    const f = Math.max(0, Math.min(1, force));
    const at = this.emit(pick(this.bank.crunch), { vol: vol * (0.35 + 0.55 * f), pan, dist, rate: 1.12 - f * 0.22 + Math.random() * 0.08, wet: 0.45 });
    if (at >= 0 && dist < 40 && f > 0.4) this.duck(at, 0.3 * f);
  }

  /**
   * A keel grinding over coral: splintering timber under a long dry rasp of
   * coral on planking, juddering as she lurches over each head. `strike` is
   * the first blow, run onto the reef at speed.
   */
  scrape(vol: number, pan: number, dist = 0, k = 1, strike = false) {
    this.emit(pick(this.bank.crunch), { vol: vol * (strike ? 0.75 : 0.22 + 0.3 * k), pan, dist, rate: (strike ? 0.78 : 0.6) + Math.random() * 0.12, wet: 0.35 });
    if (strike) this.emit(pick(this.bank.wood), { vol: vol * 0.6, pan, dist, rate: 0.62 + Math.random() * 0.1, wet: 0.4, delay: 0.06 });
    const v = this.voice(vol * Math.min(1, 140 / (140 + dist)) * (0.35 + 0.4 * k), pan);
    if (!v) return;
    const [ctx, out] = v;
    const t = ctx.currentTime + Math.min(dist / SPEED_OF_SOUND, 1.1);
    const len = 0.5 + Math.random() * 0.25;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.7 + Math.random() * 0.25;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(900 + k * 600, t);
    bp.frequency.exponentialRampToValueAtTime(420 + k * 200, t + len);
    bp.Q.value = 1.4;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.55, t + 0.04);
    env.gain.exponentialRampToValueAtTime(0.001, t + len);
    // the judder: a ragged sawtooth tremolo as she bumps from head to head
    const trem = ctx.createGain();
    trem.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.type = 'sawtooth';
    lfo.frequency.value = 14 + Math.random() * 12;
    const lg = ctx.createGain();
    lg.gain.value = 0.4;
    lfo.connect(lg).connect(trem.gain);
    src.connect(bp).connect(trem).connect(env).connect(out);
    src.start(t, Math.random() * 2);
    src.stop(t + len + 0.05);
    lfo.start(t);
    lfo.stop(t + len + 0.05);
    // a low groan of strained timber under it all
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f = 58 + Math.random() * 24;
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * 0.7, t + len);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(0.22 * k, t + 0.08);
    og.gain.exponentialRampToValueAtTime(0.001, t + len + 0.1);
    o.connect(lp).connect(og).connect(out);
    o.start(t);
    o.stop(t + len + 0.15);
  }

  /** The leadsman's warning: two quick strokes of the ship's bell, then a third (shoal water ahead). */
  shoalBell() {
    const v = this.voice(0.2, 0);
    if (!v) return;
    const [ctx, out] = v;
    [0, 0.2, 0.62].forEach((dt, k) => {
      const t = ctx.currentTime + dt;
      [[1318.5, 1], [2637, 0.35], [3520, 0.18], [1975.5, 0.22]].forEach(([fr, a]) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = fr;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime((k === 2 ? 0.42 : 0.5) * a, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.1 - a * 0.3);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + 1.2);
      });
    });
  }

  /**
   * The maelstrom's voice, set every frame: a deep rolling roar of water
   * pouring round and down, with a hollow howl from the throat that climbs as
   * you're drawn nearer. `vol` 0 silences it (the loop keeps running, muted).
   */
  setMaelstrom(vol: number, pan: number, near: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.vortexBed) {
      if (vol < 0.01) return;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      let panner: StereoPannerNode | null = null;
      if (ctx.createStereoPanner) {
        panner = ctx.createStereoPanner();
        gain.connect(panner).connect(this.ambBus);
      } else gain.connect(this.ambBus);
      // the roar: slow, heavy, lowpassed noise breathing on two unrelated LFOs
      const roar = ctx.createBufferSource();
      roar.buffer = this.noise;
      roar.loop = true;
      roar.playbackRate.value = 0.42;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 260;
      lp.Q.value = 0.9;
      const rg = ctx.createGain();
      rg.gain.value = 0.9;
      const l1 = ctx.createOscillator();
      l1.frequency.value = 0.23;
      const l1g = ctx.createGain();
      l1g.gain.value = 0.25;
      l1.connect(l1g).connect(rg.gain);
      const l2 = ctx.createOscillator();
      l2.frequency.value = 0.071;
      const l2g = ctx.createGain();
      l2g.gain.value = 90;
      l2.connect(l2g).connect(lp.frequency);
      roar.connect(lp).connect(rg).connect(gain);
      // the throat's howl: a resonant band swept by how close you are
      const howlSrc = ctx.createBufferSource();
      howlSrc.buffer = this.noise;
      howlSrc.loop = true;
      howlSrc.playbackRate.value = 0.9;
      const howlF = ctx.createBiquadFilter();
      howlF.type = 'bandpass';
      howlF.frequency.value = 220;
      howlF.Q.value = 7;
      const howl = ctx.createGain();
      howl.gain.value = 0;
      const l3 = ctx.createOscillator();
      l3.frequency.value = 0.37;
      const l3g = ctx.createGain();
      l3g.gain.value = 40;
      l3.connect(l3g).connect(howlF.frequency);
      howlSrc.connect(howlF).connect(howl).connect(gain);
      roar.start(0, 0.4);
      howlSrc.start(0, 1.7);
      l1.start();
      l2.start();
      l3.start();
      this.vortexBed = { gain, pan: panner, howl, howlF };
    }
    const b = this.vortexBed;
    const t = ctx.currentTime;
    b.gain.gain.setTargetAtTime(Math.min(1, vol) * 0.55, t, 0.4);
    b.pan?.pan.setTargetAtTime(Math.max(-0.85, Math.min(0.85, pan)), t, 0.3);
    b.howl.gain.setTargetAtTime(near * near * 0.9, t, 0.5);
    b.howlF.frequency.setTargetAtTime(160 + near * 260, t, 0.6);
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

  /** A gold doubloon flipped onto the counter: a heavy, warm chink and its bounces. */
  coin(delay = 0, vol = 0.5) {
    this.emit(pick(this.bank.coin), { vol, pan: (Math.random() - 0.5) * 0.3, dist: 0, rate: 0.93 + Math.random() * 0.14, wet: 0.18, delay });
  }

  /** Counting gold out onto the table, one piece after another. */
  private countOut(n: number, delay = 0, vol = 0.42) {
    let t = delay;
    for (let i = 0; i < n; i++) {
      this.coin(t, vol * (0.8 + Math.random() * 0.3));
      t += 0.1 + Math.random() * 0.07;
    }
    return t;
  }

  /** A tap on the merchant's oak counter: the market's buttons. */
  knock() {
    if (this.emit(pick(this.bank.mallet), { vol: 0.13, pan: 0, dist: 0, rate: 1.5 + Math.random() * 0.25, wet: 0.05 }) < 0) this.click();
  }

  /** Chest pickup: a coin clink plus a rising arpeggio that grows with rarity. */
  treasure(tier: number) {
    this.coin();
    const v = this.voice(0.14 + tier * 0.04, 0);
    if (!v) return;
    const [ctx, out] = v;
    // C major climbing higher and longer for finer chests; legendary ends on a shimmering chord
    const runs = [[], [784, 1046.5], [784, 987.8, 1318.5], [659.3, 784, 987.8, 1318.5, 1568], [523.3, 659.3, 784, 1046.5, 1318.5, 1568, 2093]];
    const notes = runs[tier] ?? [];
    const step = 0.075;
    notes.forEach((fr, i) => {
      const t = ctx.currentTime + 0.05 + i * step;
      const o = ctx.createOscillator();
      o.type = tier >= 3 ? 'triangle' : 'sine';
      o.frequency.value = fr;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.45, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.6 + tier * 0.15);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.9 + tier * 0.15);
    });
    if (tier === 4) {
      const t = ctx.currentTime + 0.05 + notes.length * step;
      [1046.5, 1318.5, 1568, 2093].forEach((fr) => {
        for (const det of [-6, 6]) {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = fr;
          o.detune.value = det;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.16, t + 0.04);
          g.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
          o.connect(g).connect(out);
          o.start(t);
          o.stop(t + 2.3);
        }
      });
    }
  }

  /** The harbour bell on the quay: a bronze strike with inharmonic partials, rung `n` times. */
  bell(n = 2, vol = 0.22) {
    const v = this.voice(vol, 0);
    if (!v) return;
    const [ctx, out] = v;
    for (let k = 0; k < n; k++) {
      const t = ctx.currentTime + k * 0.62;
      [[523.3, 1], [1046.5, 0.5], [1260, 0.32], [1570, 0.22], [2095, 0.12]].forEach(([fr, a]) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = fr;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.5 * a, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.001, t + 2.4 - a * 0.6);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + 2.5);
      });
    }
  }

  /**
   * A named hunter sets out after you: a war horn blown somewhere over the
   * horizon (two long, low, wavering blasts through the island echo) over a
   * slow pair of war drums.
   */
  horn() {
    const v = this.voice(0.34, 0);
    if (!v) return;
    const [ctx, out] = v;
    out.connect(this.reverbIn);
    const t0 = ctx.currentTime + 0.05;
    [[0, 2.1, 98], [2.5, 2.9, 92.5]].forEach(([at, len, f]) => {
      const t = t0 + at;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 2.2;
      lp.frequency.setValueAtTime(260, t);
      lp.frequency.linearRampToValueAtTime(900, t + 0.5);
      lp.frequency.linearRampToValueAtTime(520, t + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.35);
      g.gain.setValueAtTime(0.5, t + len - 0.6);
      g.gain.exponentialRampToValueAtTime(0.001, t + len + 0.4);
      // a breathy wobble, as a horn blown by lungs rather than a reed
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.2;
      const lg = ctx.createGain();
      lg.gain.value = 1.6;
      lfo.connect(lg);
      for (const [mul, det, a] of [[1, -7, 1], [1, 6, 0.8], [2, 3, 0.35], [0.5, 0, 0.45]]) {
        const o = ctx.createOscillator();
        o.type = mul === 0.5 ? 'triangle' : 'sawtooth';
        o.frequency.setValueAtTime(f * mul * 0.94, t);
        o.frequency.exponentialRampToValueAtTime(f * mul, t + 0.25);
        o.frequency.setValueAtTime(f * mul, t + len - 0.3);
        o.frequency.exponentialRampToValueAtTime(f * mul * 0.9, t + len + 0.4);
        o.detune.value = det;
        lg.connect(o.detune);
        const og = ctx.createGain();
        og.gain.value = a * 0.3;
        o.connect(og).connect(lp);
        o.start(t);
        o.stop(t + len + 0.5);
      }
      lfo.start(t);
      lfo.stop(t + len + 0.5);
      lp.connect(g).connect(out);
    });
    this.drums(t0 + 0.1, [0, 0.55, 2.6, 3.15, 3.5], 0.9);
  }

  /** Deep war drums: a skin thump with a pitch drop and a little slap of noise, at each beat. */
  private drums(t0: number, beats: number[], vol = 1) {
    const v = this.voice(0.4 * vol, 0);
    if (!v) return;
    const [ctx, out] = v;
    out.connect(this.reverbIn);
    beats.forEach((b, i) => {
      const t = t0 + b;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(i % 2 ? 74 : 62, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.32);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.75);
      const n = ctx.createBufferSource();
      n.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 220;
      bp.Q.value = 1.4;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.35, t);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      n.connect(bp).connect(ng).connect(out);
      n.start(t, Math.random() * 1.5, 0.15);
    });
  }

  /** The wanted level rises: one heavy drum and a tolling bell, ominous and short. */
  wanted(level: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.drums(ctx.currentTime + 0.02, level >= 4 ? [0, 0.22, 0.6] : [0, 0.5], 0.8);
    this.bell(1, 0.1 + level * 0.02);
  }

  /** A named captain sunk and the Crown's bounty claimed: a brassy fanfare, then the purse pours over. */
  bounty() {
    const v = this.voice(0.24, 0);
    if (!v) return;
    const [ctx, out] = v;
    out.connect(this.reverbIn);
    const t0 = ctx.currentTime + 0.05;
    // G C E G . . E G-C' : a herald's call, warm saw brass through a closing filter
    const line: [number, number, number][] = [[392, 0, 0.16], [523.3, 0.16, 0.16], [659.3, 0.32, 0.16], [784, 0.48, 0.5], [659.3, 1.02, 0.14], [784, 1.16, 0.14], [1046.5, 1.3, 1.4]];
    for (const [f, at, len] of line) {
      const t = t0 + at;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(900, t);
      lp.frequency.linearRampToValueAtTime(3200, t + 0.06);
      lp.frequency.exponentialRampToValueAtTime(1300, t + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.42, t + 0.03);
      g.gain.setValueAtTime(0.42, t + Math.max(0.04, len - 0.08));
      g.gain.exponentialRampToValueAtTime(0.001, t + len + (len > 1 ? 0.9 : 0.12));
      for (const det of [-8, 8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + len + 1);
      }
      lp.connect(g).connect(out);
    }
    this.drums(t0 + 1.28, [0], 0.7);
    setTimeout(() => this.sale(2400), 1300);
  }

  /**
   * A sale. A few pieces are counted out by hand; a fair sum lands as a
   * purse thumped on the counter and poured out; a fortune gets a second
   * purse, a squeezebox flourish and the whole quay roaring.
   */
  sale(value: number, best = 0) {
    if (value < 120) {
      const end = this.countOut(3 + Math.min(3, Math.floor(value / 30)));
      this.emit(this.bank.pour[0], { vol: 0.28, pan: 0, dist: 0, rate: 1.1, wet: 0.15, delay: end - 0.05 });
      return;
    }
    const big = value >= 600;
    this.emit(pick(this.bank.purse), { vol: 0.62, pan: -0.1, dist: 0, rate: 0.95 + Math.random() * 0.1, wet: 0.2 });
    this.emit(this.bank.pour[big ? 1 : 0], { vol: big ? 0.55 : 0.45, pan: 0.05, dist: 0, rate: 0.96 + Math.random() * 0.08, wet: 0.22, delay: 0.16 });
    if (big) this.emit(pick(this.bank.purse), { vol: 0.5, pan: 0.15, dist: 0, rate: 0.88, wet: 0.2, delay: 0.55 });
    this.coin(big ? 1.6 : 0.85, 0.4);
    if (value >= 1500 || best >= 3) {
      this.squeezebox(FLOURISH, 0.13, 0.25);
      this.shout(0.9, 0.2, 25, true, 6);
    }
  }

  /** Paying the chandler: gold counted out, then the yard gets to work. */
  purchase(kind: 'repair' | 'shot') {
    const end = this.countOut(kind === 'repair' ? 4 : 3);
    for (let i = 0; i < 3; i++) {
      const d = end + 0.15 + i * (kind === 'repair' ? 0.32 : 0.26) + Math.random() * 0.05;
      if (kind === 'repair') this.emit(pick(this.bank.mallet), { vol: 0.32 - i * 0.05, pan: 0.35, dist: 14, rate: 0.9 + Math.random() * 0.15, wet: 0.35, delay: d });
      else this.emit(pick(this.bank.clunk), { vol: 0.4 - i * 0.06, pan: -0.3, dist: 10, rate: 0.92 + Math.random() * 0.12, wet: 0.3, delay: d });
    }
  }

  /**
   * A concertina: two free reeds tuned a hair apart (that wet "musette"
   * beating), buzzing through the box's wooden resonance, with the bellows
   * breathing behind each note. Notes are [midi, start beat, beats].
   */
  squeezebox(tune: [number, number, number][], beat: number, vol: number, delay = 0, to: AudioNode | null = null) {
    const v = to ? this.sub(vol, to) : this.voice(vol, 0);
    if (!v) return;
    const [ctx, out] = v;
    if (!to) out.connect(this.reverbIn);
    const body = ctx.createBiquadFilter();
    body.type = 'lowpass';
    body.frequency.value = 2600;
    body.Q.value = 0.8;
    const honk = ctx.createBiquadFilter();
    honk.type = 'peaking';
    honk.frequency.value = 1150;
    honk.Q.value = 1.4;
    honk.gain.value = 6;
    body.connect(honk).connect(out);
    const t0 = ctx.currentTime + delay;
    let end = t0;
    for (const [midi, at, len] of tune) {
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      const t = t0 + at * beat;
      const d = len * beat;
      const g = ctx.createGain();
      const lvl = midi < 55 ? 0.22 : 0.3;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(lvl, t + 0.025);
      g.gain.setValueAtTime(lvl, t + d * 0.6);
      g.gain.exponentialRampToValueAtTime(lvl * 0.7, t + d * 0.92);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.05);
      g.connect(body);
      for (const [type, det, a] of [['sawtooth', -9, 0.5], ['sawtooth', 9, 0.5], ['square', 0, 0.22]] as const) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        o.detune.value = det;
        const og = ctx.createGain();
        og.gain.value = a;
        o.connect(og).connect(g);
        o.start(t);
        o.stop(t + d + 0.08);
        o.onended = () => {
          o.disconnect();
          og.disconnect();
        };
      }
      end = Math.max(end, t + d + 0.1);
    }
    setTimeout(() => {
      body.disconnect();
      honk.disconnect();
      out.disconnect();
    }, (end - ctx.currentTime) * 1000 + 1500);
  }

  /**
   * A bar or two of the town band on a feast night, heard from `dist` metres
   * off: the squeezebox on the tune with its oom-pah, a bodhrán on the beat
   * and a tambourine shaking the off-beats, all thinning out over the water.
   * Returns how long the phrase lasts (s), so the next follows on the beat.
   */
  festivalTune(i: number, vol: number, pan: number, dist: number) {
    const tune = REELS[((i % REELS.length) + REELS.length) % REELS.length];
    const beat = 0.165;
    const len = tune.eighths * beat;
    const ctx = this.ctx;
    if (!ctx || this.muted || vol < 0.01) return len;
    const out = ctx.createGain();
    out.gain.value = 1;
    const air = ctx.createBiquadFilter();
    air.type = 'lowpass';
    air.frequency.value = Math.max(700, 16000 * Math.exp(-dist / 90));
    air.Q.value = 0.5;
    out.connect(air);
    let pn: StereoPannerNode | null = null;
    if (ctx.createStereoPanner) {
      pn = ctx.createStereoPanner();
      pn.pan.value = clamp1(pan) * 0.8;
      air.connect(pn).connect(this.sfxBus);
    } else air.connect(this.sfxBus);
    const send = ctx.createGain();
    send.gain.value = 0.25 + Math.min(0.5, dist / 300);
    air.connect(send).connect(this.reverbIn);
    const t0 = 0.04;
    this.squeezebox(tune.notes, beat, vol, t0, out);
    // bodhrán and tambourine
    const start = ctx.currentTime + t0;
    for (let k = 0; k < tune.eighths; k++) {
      const t = start + k * beat;
      if (k % 2 === 0) {
        const accent = k % 8 === 0;
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(accent ? 125 : 108, t);
        o.frequency.exponentialRampToValueAtTime(52, t + 0.15);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol * (accent ? 1.6 : 1.05), t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + 0.24);
        o.onended = () => {
          o.disconnect();
          g.disconnect();
        };
      }
      const n = ctx.createBufferSource();
      n.buffer = this.noise;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 6200;
      const ng = ctx.createGain();
      const lvl = vol * (k % 2 ? 0.55 : 0.3);
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(lvl, t + 0.004);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + (k % 2 ? 0.09 : 0.05));
      n.connect(hp).connect(ng).connect(out);
      n.start(t, Math.random() * 1.5, 0.12);
      n.onended = () => {
        n.disconnect();
        hp.disconnect();
        ng.disconnect();
      };
    }
    setTimeout(() => {
      out.disconnect();
      air.disconnect();
      pn?.disconnect();
      send.disconnect();
    }, (len + 2.5) * 1000);
    return len;
  }

  /** A gain into a given node (a group of sounds sharing one filter and pan). */
  private sub(vol: number, to: AudioNode): [AudioContext, GainNode] | null {
    if (!this.ctx || this.muted) return null;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    g.connect(to);
    return [this.ctx, g];
  }

  /**
   * A fleet order piped across the water, each with its own call: two notes
   * rising for "form on me", a quick triple for "attack", a long note falling
   * away for "hold position".
   */
  fleetSignal(kind: 'follow' | 'attack' | 'hold') {
    const v = this.voice(0.075, 0);
    if (!v) return;
    const [ctx, out] = v;
    out.connect(this.reverbIn);
    const t = ctx.currentTime + 0.02;
    const notes: [number, number, number, number][] =
      kind === 'attack'
        ? [[0, 0.1, 2350, 2350], [0.14, 0.1, 2350, 2350], [0.28, 0.36, 2400, 2750]]
        : kind === 'hold'
          ? [[0, 0.34, 2500, 2500], [0.38, 0.55, 2300, 1650]]
          : [[0, 0.22, 1750, 1800], [0.27, 0.45, 2300, 2500]];
    let end = 0;
    for (const [at, len, f0, f1] of notes) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0 * 0.93, t + at);
      o.frequency.exponentialRampToValueAtTime(f0, t + at + 0.04);
      o.frequency.exponentialRampToValueAtTime(f1, t + at + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(0.7, t + at + 0.03);
      g.gain.setValueAtTime(0.7, t + at + len - 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + len);
      o.connect(g).connect(out);
      o.start(t + at);
      o.stop(t + at + len + 0.05);
      o.onended = () => {
        o.disconnect();
        g.disconnect();
      };
      end = Math.max(end, at + len);
    }
    setTimeout(() => out.disconnect(), (end + 2.5) * 1000);
  }

  /** The bosun's call: a shrill pipe swooping up, trilling, and falling away: "all hands, cast off!". */
  bosunPipe() {
    const v = this.voice(0.09, 0);
    if (!v) return;
    const [ctx, out] = v;
    out.connect(this.reverbIn);
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1650, t);
    o.frequency.exponentialRampToValueAtTime(2550, t + 0.28);
    o.frequency.setValueAtTime(2550, t + 0.95);
    o.frequency.exponentialRampToValueAtTime(1900, t + 1.35);
    // the piper's "rolling" trill, finger fluttering over the buoy
    const trill = ctx.createOscillator();
    trill.frequency.value = 13;
    const td = ctx.createGain();
    td.gain.setValueAtTime(0, t);
    td.gain.setValueAtTime(0, t + 0.35);
    td.gain.linearRampToValueAtTime(140, t + 0.45);
    td.gain.setValueAtTime(140, t + 0.9);
    td.gain.linearRampToValueAtTime(0, t + 0.98);
    trill.connect(td).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.8, t + 0.05);
    g.gain.setValueAtTime(0.8, t + 1.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    // breath through the pipe
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 2;
    const ng = ctx.createGain();
    ng.gain.value = 0.25;
    o.connect(g);
    n.connect(bp).connect(ng).connect(g);
    g.connect(out);
    o.start(t);
    trill.start(t);
    n.start(t, Math.random() * 2);
    o.stop(t + 1.45);
    trill.stop(t + 1.45);
    n.stop(t + 1.45);
    o.onended = () => {
      o.disconnect();
      trill.disconnect();
      td.disconnect();
      n.disconnect();
      bp.disconnect();
      ng.disconnect();
      g.disconnect();
      out.disconnect();
    };
  }

  /** Coming alongside: the hull nudges the fenders, the lines creak taut, and somebody on the quay strikes up a tune. */
  portArrive() {
    this.emit(pick(this.bank.mallet), { vol: 0.5, pan: 0.2, dist: 6, rate: 0.42, wet: 0.35 });
    this.emit(pick(this.bank.earth), { vol: 0.2, pan: 0.2, dist: 6, rate: 0.7, wet: 0.3, delay: 0.03 });
    this.emit(this.bank.creak[0], { vol: 0.3, pan: -0.4, dist: 8, rate: 0.95, wet: 0.3, delay: 0.35 });
    this.emit(this.bank.creak[1], { vol: 0.24, pan: 0.45, dist: 10, rate: 1.05, wet: 0.3, delay: 0.9 });
    this.squeezebox(ARRIVAL, 0.14, 0.13, 0.9);
    this.harbour(true);
  }

  /** Casting off: the bosun pipes, the lines come in and the timbers ease. */
  portDepart() {
    this.bosunPipe();
    this.emit(this.bank.creak[2], { vol: 0.3, pan: 0.3, dist: 8, rate: 0.9, wet: 0.35, delay: 0.5 });
    this.emit(this.bank.creak[0], { vol: 0.22, pan: -0.3, dist: 8, rate: 1.1, wet: 0.3, delay: 1.1 });
    this.shout(0.6, 0, 15, true, 4);
  }

  /** The quay's own soundscape while you're tied up: water among the pilings, hubbub, creaks, gulls, the yard. */
  harbour(on: boolean) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (!on) {
      const q = this.quay;
      if (!q) return;
      this.quay = null;
      clearInterval(q.timer);
      q.gain.gain.cancelScheduledValues(now);
      q.gain.gain.setTargetAtTime(0, now, 0.5);
      setTimeout(() => {
        for (const s of q.srcs) s.stop();
        q.gain.disconnect();
      }, 3000);
      return;
    }
    if (this.quay) return;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + 2.5);
    gain.connect(this.duckGain);
    const srcs: AudioBufferSourceNode[] = [];
    for (const [buf, v, rate] of [[this.bank.lap[0], 0.9, 1], [this.bank.murmur[0], 0.3, 1]] as const) {
      if (!buf) continue;
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = v;
      s.connect(g).connect(gain);
      s.start(now, Math.random() * buf.duration);
      s.onended = () => {
        s.disconnect();
        g.disconnect();
      };
      srcs.push(s);
    }
    const side = () => (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.6);
    const timer = window.setInterval(() => {
      if (this.muted || ctx.state !== 'running') return;
      const r = Math.random();
      if (r < 0.14) this.emit(pick(this.bank.creak), { vol: 0.1 + Math.random() * 0.1, pan: side(), dist: 15 + Math.random() * 30, rate: 0.85 + Math.random() * 0.3, wet: 0.4 });
      else if (r < 0.2) this.gull(0.35 + Math.random() * 0.3, side(), 1 + ((Math.random() * 3) | 0));
      else if (r < 0.24) {
        // a shipwright across the yard, hard at a plank
        const p = side();
        for (let i = 0, n = 3 + ((Math.random() * 4) | 0); i < n; i++) this.emit(pick(this.bank.mallet), { vol: 0.07, pan: p, dist: 70, rate: 0.95 + Math.random() * 0.1, wet: 0.6, delay: i * 0.38 });
      } else if (r < 0.26) this.emit(pick(this.bank.clunk), { vol: 0.08, pan: side(), dist: 40, rate: 0.8, wet: 0.5 });
      else if (r < 0.28) this.coin(0, 0.08);
    }, 900);
    this.quay = { gain, srcs, timer };
  }

  /** A side's guns run out again: two dull knocks from the gun deck and a small bright bell. */
  gunsReady(pan: number) {
    const v = this.voice(0.2, pan);
    if (!v) return;
    const [ctx, out] = v;
    [0, 0.12].forEach((dt, i) => {
      const t = ctx.currentTime + dt;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(i ? 200 : 150, t);
      o.frequency.exponentialRampToValueAtTime(i ? 120 : 92, t + 0.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.9, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.17);
    });
    const t = ctx.currentTime + 0.13;
    const b = ctx.createOscillator();
    b.type = 'sine';
    b.frequency.value = 1568;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0, t);
    bg.gain.linearRampToValueAtTime(0.12, t + 0.01);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    b.connect(bg).connect(out);
    b.start(t);
    b.stop(t + 0.55);
  }

  /** A boot on deck planking: a soft woody knock, now and then a creak of the boards. */
  footstep(k: number) {
    const v = this.voice(0.11 + k * 0.08, (Math.random() - 0.5) * 0.15);
    if (!v || !this.noise) return;
    const [ctx, out] = v;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 260 + Math.random() * 140 + k * 120;
    bp.Q.value = 1.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.11 + k * 0.04);
    src.connect(bp).connect(g).connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + 0.2);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(120 + Math.random() * 30, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.08);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.5, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.12);
    if (Math.random() < 0.12) {
      // the planking answers with a short creak
      const c = ctx.createOscillator();
      c.type = 'sawtooth';
      const f = 180 + Math.random() * 120;
      c.frequency.setValueAtTime(f, t + 0.05);
      c.frequency.linearRampToValueAtTime(f * (0.8 + Math.random() * 0.5), t + 0.32);
      const lp = ctx.createBiquadFilter();
      lp.type = 'bandpass';
      lp.frequency.value = 900;
      lp.Q.value = 6;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0, t + 0.05);
      cg.gain.linearRampToValueAtTime(0.06, t + 0.12);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
      c.connect(lp).connect(cg).connect(out);
      c.start(t + 0.05);
      c.stop(t + 0.36);
    }
  }

  /** A grappling hook whirled and let fly: the rope hums round, then hisses out over the water. */
  grapple(vol: number, pan: number, dist = 0) {
    const v = this.voice(Math.min(0.35, vol * 0.3) * Math.exp(-dist / 150), pan);
    if (!v || !this.noise) return;
    const [ctx, out] = v;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3;
    bp.frequency.value = 600;
    // two whirls overhead, then the throw
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    for (let i = 0; i < 2; i++) {
      const a = t + i * 0.22;
      bp.frequency.setValueAtTime(420, a);
      bp.frequency.exponentialRampToValueAtTime(1300, a + 0.11);
      bp.frequency.exponentialRampToValueAtTime(480, a + 0.22);
      g.gain.linearRampToValueAtTime(0.5, a + 0.1);
      g.gain.linearRampToValueAtTime(0.12, a + 0.21);
    }
    const th = t + 0.44;
    bp.frequency.setValueAtTime(900, th);
    bp.frequency.exponentialRampToValueAtTime(2600, th + 0.12);
    bp.frequency.exponentialRampToValueAtTime(700, th + 0.6);
    g.gain.linearRampToValueAtTime(1, th + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, th + 0.65);
    src.connect(bp).connect(g).connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(th + 0.7);
  }

  /** Iron prongs biting into a rail: a hard clank, a splintering knock and the line snapping taut. */
  hookBite(vol: number, pan: number, dist = 0) {
    const v = this.voice(Math.min(0.45, vol * 0.4) * Math.exp(-dist / 160), pan);
    if (!v || !this.noise) return;
    const [ctx, out] = v;
    const t = ctx.currentTime;
    const base = 900 + Math.random() * 300;
    [1, 1.71, 2.62].forEach((m, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = base * m;
      const g = ctx.createGain();
      g.gain.setValueAtTime([0.4, 0.22, 0.12][i], t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.22 - i * 0.04);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.25);
    });
    // the wood
    const k = ctx.createOscillator();
    k.frequency.setValueAtTime(190, t);
    k.frequency.exponentialRampToValueAtTime(80, t + 0.09);
    const kg = ctx.createGain();
    kg.gain.setValueAtTime(0.7, t);
    kg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    k.connect(kg).connect(out);
    k.start(t);
    k.stop(t + 0.14);
    // the line twanging tight
    const tw = ctx.createOscillator();
    tw.type = 'sawtooth';
    tw.frequency.setValueAtTime(70, t + 0.08);
    tw.frequency.exponentialRampToValueAtTime(130, t + 0.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0, t + 0.08);
    tg.gain.linearRampToValueAtTime(0.25, t + 0.1);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    tw.connect(lp).connect(tg).connect(out);
    tw.start(t + 0.08);
    tw.stop(t + 0.4);
  }

  /** Two hulls hauled together: a deep wooden boom, then the timbers grinding and groaning against each other. */
  hullsMeet(vol: number, pan: number) {
    this.emit(pick(this.bank.crunch), { vol: vol * 0.45, pan, dist: 6, rate: 0.7, wet: 0.5 });
    this.emit(pick(this.bank.wood), { vol: vol * 0.8, pan, dist: 4, rate: 0.6, wet: 0.5, delay: 0.02 });
    this.emit(this.bank.creak[0], { vol: vol * 0.45, pan: pan - 0.2, dist: 5, rate: 0.75, wet: 0.4, delay: 0.3 });
    this.emit(this.bank.creak[2], { vol: vol * 0.38, pan: pan + 0.2, dist: 5, rate: 0.68, wet: 0.4, delay: 0.85 });
    const v = this.voice(Math.min(0.6, vol * 0.5), pan);
    if (!v) return;
    const [ctx, out] = v;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(62, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.62);
  }

  /** A boot in dry sand (a soft hiss and crunch), or a splash through the shallows when `wet`. */
  sandStep(k: number, wet = false) {
    const v = this.voice((wet ? 0.12 : 0.08) + k * 0.06, (Math.random() - 0.5) * 0.2);
    if (!v || !this.noise) return;
    const [ctx, out] = v;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = wet ? 'lowpass' : 'bandpass';
    bp.frequency.setValueAtTime(wet ? 1400 : 1800 + Math.random() * 900, t);
    if (wet) bp.frequency.exponentialRampToValueAtTime(500, t + 0.22);
    bp.Q.value = wet ? 0.8 : 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + (wet ? 0.02 : 0.012));
    g.gain.exponentialRampToValueAtTime(0.001, t + (wet ? 0.28 : 0.13 + k * 0.05));
    src.connect(bp).connect(g).connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + 0.32);
  }

  /**
   * A jump. Up: the push-off scuffs the ground and a short breath goes out.
   * Down (k: how hard, 0..1): a dull thump through the legs, then the ground
   * answers: a crunch of sand, a slap of water, or a knock on planks or stone.
   */
  hop(up: boolean, k: number, wet: boolean, hard: boolean) {
    const v = this.voice(up ? 0.12 : 0.2 + k * 0.14, (Math.random() - 0.5) * 0.12);
    if (!v || !this.noise) return;
    const [ctx, out] = v;
    const t = ctx.currentTime;
    const burst = (at: number, type: BiquadFilterType, f0: number, f1: number, q: number, len: number, gain: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(f0, at);
      f.frequency.exponentialRampToValueAtTime(f1, at + len);
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(gain, at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, at + len);
      src.connect(f).connect(g).connect(out);
      src.start(at, Math.random() * 1.5);
      src.stop(at + len + 0.02);
    };
    if (up) {
      // the push-off, and a breath: a short, breathy "hup"
      burst(t, 'bandpass', hard ? 500 : 1900, hard ? 300 : 900, 1, 0.09, 0.8);
      burst(t + 0.02, 'bandpass', 1300, 700, 2.5, 0.16, 0.35);
      return;
    }
    // the body's weight: a low thump, deeper the harder you come down
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(95 + Math.random() * 15 - k * 20, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.14);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.9, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.16 + k * 0.06);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.24);
    if (wet) {
      // a slap and a fall of drops
      burst(t, 'lowpass', 1800, 450, 0.8, 0.32, 1.1);
      burst(t + 0.09, 'bandpass', 2600, 1500, 1.4, 0.22, 0.35);
    } else if (hard) {
      // boots on planks or rock: a knock, then a short creak or scrape
      burst(t, 'bandpass', 420 + Math.random() * 120, 220, 2.2, 0.11, 1);
      burst(t + 0.035, 'bandpass', 900, 500, 1.6, 0.08, 0.4);
    } else {
      // both feet into the sand, a beat apart, and the grains settling
      burst(t, 'bandpass', 1900 + Math.random() * 600, 1100, 0.9, 0.15 + k * 0.05, 1);
      burst(t + 0.04, 'bandpass', 1600 + Math.random() * 600, 900, 0.9, 0.13, 0.7);
      burst(t + 0.08, 'highpass', 3200, 2400, 0.7, 0.25, 0.18);
    }
  }

  /** A spade biting into sand: a crunching scrape, then the hiss of the spadeful thrown aside. */
  dig(vol: number, pan: number, dist = 0) {
    const v = this.voice(Math.min(0.4, vol * 0.3) * Math.exp(-dist / 120), pan);
    if (!v || !this.noise) return;
    const [ctx, out] = v;
    const t = ctx.currentTime;
    const bite = ctx.createBufferSource();
    bite.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    bite.connect(bp).connect(g).connect(out);
    bite.start(t, Math.random() * 1.5);
    bite.stop(t + 0.22);
    // the throw: a softer, longer spray a beat later
    const spray = ctx.createBufferSource();
    spray.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0, t + 0.28);
    sg.gain.linearRampToValueAtTime(0.45, t + 0.33);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.62);
    spray.connect(hp).connect(sg).connect(out);
    spray.start(t + 0.28, Math.random() * 1.5);
    spray.stop(t + 0.66);
  }

  /** The spade strikes something under the sand: a hollow wooden knock with an iron ring to it. */
  spadeKnock(vol: number, pan: number) {
    const v = this.voice(Math.min(0.6, vol * 0.55), pan);
    if (!v) return;
    const [ctx, out] = v;
    const t = ctx.currentTime;
    for (const [f, a, d] of [[190, 0.9, 0.22], [410, 0.45, 0.16], [1370, 0.2, 0.5], [2210, 0.12, 0.4]] as const) {
      const o = ctx.createOscillator();
      o.type = f > 1000 ? 'sine' : 'triangle';
      o.frequency.setValueAtTime(f * 1.04, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      const g = ctx.createGain();
      g.gain.setValueAtTime(a, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + d + 0.05);
    }
  }

  /** Steel on steel: a bright ring with a hard scrape at the front. */
  clash(vol: number, pan: number, dist = 0) {
    const v = this.voice(Math.min(0.5, vol * 0.42) * Math.exp(-dist / 160), pan);
    if (!v || !this.noise) return;
    const [ctx, out] = v;
    const t = ctx.currentTime;
    const base = 1900 + Math.random() * 500;
    [1, 1.47, 2.09, 2.78, 3.6].forEach((m, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = base * m * (1 + (Math.random() - 0.5) * 0.01);
      const g = ctx.createGain();
      const a = [0.5, 0.36, 0.26, 0.16, 0.1][i];
      g.gain.setValueAtTime(a, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.9 - i * 0.14);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 1);
    });
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3200;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.9, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    src.connect(hp).connect(ng).connect(out);
    src.start(t, Math.random());
    src.stop(t + 0.1);
  }

  /** A blade cutting the air. */
  swish(vol: number, pan: number) {
    const v = this.voice(vol * 0.2, pan);
    if (!v || !this.noise) return;
    const [ctx, out] = v;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.exponentialRampToValueAtTime(3200, t + 0.09);
    bp.frequency.exponentialRampToValueAtTime(1100, t + 0.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 0.07);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    src.connect(bp).connect(g).connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + 0.25);
  }

  /** A blow landing on someone: a dull thwack and a grunt of breath. */
  thwack(vol: number, pan: number, dist = 0, heavy = false) {
    const v = this.voice(Math.min(0.6, vol * (heavy ? 0.55 : 0.4)) * Math.exp(-dist / 140), pan);
    if (!v || !this.noise) return;
    const [ctx, out] = v;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(heavy ? 140 : 180, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.9, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.18);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = heavy ? 900 : 1300;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.8, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    src.connect(lp).connect(ng).connect(out);
    src.start(t, Math.random());
    src.stop(t + 0.12);
    // the breath knocked out of them: a short voiced "hff"
    const vox = ctx.createOscillator();
    vox.type = 'sawtooth';
    const f0 = 120 + Math.random() * 90;
    vox.frequency.setValueAtTime(f0 * 1.25, t + 0.02);
    vox.frequency.exponentialRampToValueAtTime(f0 * 0.85, t + 0.2);
    const fm = ctx.createBiquadFilter();
    fm.type = 'bandpass';
    fm.frequency.value = 650 + Math.random() * 300;
    fm.Q.value = 3;
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, t + 0.02);
    vg.gain.linearRampToValueAtTime(0.22, t + 0.05);
    vg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    vox.connect(fm).connect(vg).connect(out);
    vox.start(t + 0.02);
    vox.stop(t + 0.25);
  }

  /** A flintlock: the pan's hiss, then a sharp crack and its echo off the hills. */
  pistol(vol: number, pan: number, dist = 0) {
    const v = this.voice(Math.min(0.75, vol * 0.7) * Math.exp(-dist / 260), pan);
    if (!v || !this.noise) return;
    const [ctx, out] = v;
    const t = ctx.currentTime;
    out.connect(this.reverbIn);
    const fizz = ctx.createBufferSource();
    fizz.buffer = this.noise;
    const fh = ctx.createBiquadFilter();
    fh.type = 'highpass';
    fh.frequency.value = 4000;
    const fg = ctx.createGain();
    fg.gain.setValueAtTime(0.18, t);
    fg.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    fizz.connect(fh).connect(fg).connect(out);
    fizz.start(t, Math.random());
    fizz.stop(t + 0.07);
    const b = t + 0.05;
    const crack = ctx.createBufferSource();
    crack.buffer = this.noise;
    const cl = ctx.createBiquadFilter();
    cl.type = 'lowpass';
    cl.frequency.setValueAtTime(6000, b);
    cl.frequency.exponentialRampToValueAtTime(400, b + 0.3);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(1, b);
    cg.gain.exponentialRampToValueAtTime(0.001, b + 0.45);
    crack.connect(cl).connect(cg).connect(out);
    crack.start(b, Math.random());
    crack.stop(b + 0.5);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(160, b);
    o.frequency.exponentialRampToValueAtTime(40, b + 0.2);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.9, b);
    og.gain.exponentialRampToValueAtTime(0.001, b + 0.25);
    o.connect(og).connect(out);
    o.start(b);
    o.stop(b + 0.27);
  }

  /** Voices raised together: a war cry from a cutthroat camp, or the landing party's cheer. */
  shout(vol: number, pan: number, dist = 0, cheer = false, n = 3) {
    const v = this.voice(Math.min(0.4, vol * 0.3) * Math.exp(-dist / 200), pan);
    if (!v) return;
    const [ctx, out] = v;
    out.connect(this.reverbIn);
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + i * 0.07 + Math.random() * 0.06;
      const len = 0.45 + Math.random() * 0.35;
      const f0 = (cheer ? 150 : 110) + Math.random() * 70;
      const src = ctx.createOscillator();
      src.type = 'sawtooth';
      // a cheer climbs ("huzzah!"), a war cry falls ("yaaarr")
      src.frequency.setValueAtTime(f0 * (cheer ? 0.9 : 1.2), t);
      src.frequency.linearRampToValueAtTime(f0 * (cheer ? 1.35 : 0.85), t + len);
      const vib = ctx.createOscillator();
      vib.frequency.value = 5 + Math.random() * 2;
      const vd = ctx.createGain();
      vd.gain.value = f0 * 0.03;
      vib.connect(vd).connect(src.frequency);
      const mix = ctx.createGain();
      mix.gain.setValueAtTime(0, t);
      mix.gain.linearRampToValueAtTime(0.5, t + 0.05);
      mix.gain.setValueAtTime(0.5, t + len * 0.7);
      mix.gain.exponentialRampToValueAtTime(0.001, t + len);
      // two vowel formants: "ah" opening to "r"
      for (const [fa, fb, q] of [[750, cheer ? 950 : 600, 6], [1150, cheer ? 1500 : 1300, 8]]) {
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = q;
        f.frequency.setValueAtTime(fa, t);
        f.frequency.linearRampToValueAtTime(fb, t + len);
        src.connect(f).connect(mix);
      }
      mix.connect(out);
      src.start(t);
      vib.start(t);
      src.stop(t + len + 0.05);
      vib.stop(t + len + 0.05);
    }
  }

  /**
   * Your ship is lost: a deep blow through the keel, then a slow, low minor
   * chord that swells and hangs in the reverb like a tolling bell.
   */
  founder() {
    const v = this.voice(0.9, 0);
    if (!v) return;
    const [ctx, out] = v;
    const t = ctx.currentTime;
    out.connect(this.reverbIn);
    // the blow: a falling sub thump under a dark rumble of noise
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(62, t);
    o.frequency.exponentialRampToValueAtTime(26, t + 1.8);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.9, t + 0.02);
    og.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 2.3);
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const nl = ctx.createBiquadFilter();
    nl.type = 'lowpass';
    nl.frequency.setValueAtTime(700, t);
    nl.frequency.exponentialRampToValueAtTime(90, t + 2.5);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 2.8);
    n.connect(nl).connect(ng).connect(out);
    n.start(t);
    n.stop(t + 3);
    // the lament: A minor, voiced low, each note blooming a beat after the last
    const chord = [110, 130.81, 164.81, 220, 261.63];
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(380, t + 0.4);
    lp.frequency.linearRampToValueAtTime(1300, t + 3.5);
    lp.frequency.linearRampToValueAtTime(500, t + 9);
    lp.connect(out);
    chord.forEach((f, i) => {
      const at = t + 0.35 + i * 0.32;
      for (const det of [-4, 4]) {
        const so = ctx.createOscillator();
        so.type = i < 2 ? 'sawtooth' : 'triangle';
        so.frequency.value = f;
        so.detune.value = det;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.linearRampToValueAtTime(0.055 - i * 0.006, at + 1.6);
        g.gain.setTargetAtTime(0.0001, at + 3.6, 1.8);
        so.connect(g).connect(lp);
        so.start(at);
        so.stop(at + 12);
      }
    });
  }

  /** The final plunge: timbers groaning under the strain as she goes by the stern. */
  groan() {
    const v = this.voice(0.5, 0);
    if (!v) return;
    const [ctx, out] = v;
    const t = ctx.currentTime;
    out.connect(this.reverbIn);
    for (let i = 0; i < 3; i++) {
      const at = t + i * 0.7 + Math.random() * 0.3;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const f = 70 + Math.random() * 40;
      o.frequency.setValueAtTime(f, at);
      o.frequency.linearRampToValueAtTime(f * (0.55 + Math.random() * 0.2), at + 1.6);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 380 + Math.random() * 220;
      bp.Q.value = 5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(0.32, at + 0.35);
      g.gain.exponentialRampToValueAtTime(0.001, at + 1.8);
      o.connect(bp).connect(g).connect(out);
      o.start(at);
      o.stop(at + 1.9);
    }
  }

  /**
   * Beneath the waves: the mix closes in to a muffled murmur over a deep,
   * slowly breathing drone, with the odd bubble rising past.
   */
  submerge(on: boolean) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.muffle.frequency.cancelScheduledValues(t);
    this.muffle.frequency.setTargetAtTime(on ? 360 : 22000, t, on ? 0.45 : 0.15);
    if (on && !this.deep) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 160;
      lp.Q.value = 3;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.09;
      const lg = ctx.createGain();
      lg.gain.value = 60;
      lfo.connect(lg).connect(lp.frequency);
      lfo.start(t);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.5, t + 2.5);
      // after the muffle, so the drone keeps its weight
      src.connect(lp).connect(gain).connect(this.muffle);
      src.start(t);
      src.onended = () => lfo.stop();
      this.deep = { src, gain };
      for (let i = 0; i < 9; i++) this.bubble(t + 0.2 + i * 0.22 + Math.random() * 0.3);
    } else if (!on && this.deep) {
      const d = this.deep;
      d.gain.gain.setTargetAtTime(0, t, 0.12);
      d.src.stop(t + 0.6);
      this.deep = null;
    }
  }

  /** A pocket of air bursting out of a sunken hull: a deep, round glug or two, then a fizz of small bubbles. */
  airPocket(size: number, vol: number, pan: number) {
    const v = this.voice(0.32 * vol * Math.min(1.4, size), pan);
    if (!v) return;
    const [ctx, out] = v;
    const t = ctx.currentTime;
    for (let i = 0; i < (size > 1 ? 3 : 2); i++) {
      const at = t + i * (0.07 + Math.random() * 0.08);
      const o = ctx.createOscillator();
      const f = (70 + Math.random() * 55) / Math.sqrt(Math.max(size, 0.3));
      o.frequency.setValueAtTime(f, at);
      o.frequency.exponentialRampToValueAtTime(f * 2.2, at + 0.18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.75, at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.26);
      o.connect(g).connect(out);
      o.start(at);
      o.stop(at + 0.28);
    }
    for (let i = 0; i < 4; i++) this.bubble(t + 0.12 + Math.random() * 0.5);
  }

  private bubble(at: number) {
    const v = this.voice(0.16, (Math.random() - 0.5) * 0.8);
    if (!v) return;
    const [ctx, out] = v;
    const o = ctx.createOscillator();
    const f = 280 + Math.random() * 380;
    o.frequency.setValueAtTime(f, at);
    o.frequency.exponentialRampToValueAtTime(f * 2.4, at + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.5, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.09);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + 0.1);
  }

  /** A tally tile landing on the farewell screen; brighter for a new record. */
  tally(i: number, best = false) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    // straight out, around the underwater muffle: this is the interface talking
    const out = ctx.createGain();
    out.gain.value = best ? 0.13 : 0.08;
    out.connect(ctx.destination);
    const t = ctx.currentTime;
    const notes = [392, 440, 523.25, 587.33, 659.25, 783.99];
    const o = ctx.createOscillator();
    o.type = best ? 'triangle' : 'sine';
    o.frequency.value = notes[i % notes.length] * (best ? 2 : 1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + (best ? 0.9 : 0.35));
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 1);
  }

  /** The vault chest straining at its lock: a low knock and a rising shimmer, brighter for each rarity. */
  vaultRumble(level: number) {
    const v = this.voice(0.22 + level * 0.05, 0);
    if (!v) return;
    const [ctx, out] = v;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180 + level * 60;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.9, t + 0.05);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    n.connect(lp).connect(ng).connect(out);
    n.start(t, Math.random() * 2);
    n.stop(t + 0.8);
    const base = [392, 523.25, 659.25, 783.99][level] ?? 392;
    [1, 1.5, 2].forEach((m, i) => {
      const o = ctx.createOscillator();
      o.type = level >= 2 ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(base * m * 0.94, t + i * 0.06);
      o.frequency.exponentialRampToValueAtTime(base * m, t + i * 0.06 + 0.25);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + i * 0.06);
      g.gain.linearRampToValueAtTime(0.18, t + i * 0.06 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.7);
      o.connect(g).connect(out);
      o.start(t + i * 0.06);
      o.stop(t + i * 0.06 + 0.75);
    });
  }

  /** The lid bursts open: a whoosh and a chord that swells with the best find inside. */
  vaultBurst(tier: number) {
    const v = this.voice(0.3, 0);
    if (!v) return;
    const [ctx, out] = v;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(3200, t + 0.35);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.7, t + 0.08);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    n.connect(bp).connect(ng).connect(out);
    n.start(t, Math.random() * 2);
    n.stop(t + 1);
    this.treasure(Math.min(4, tier + 1));
  }

  /** A card turning over. */
  cardFlip(tier: number) {
    const v = this.voice(0.16, 0);
    if (!v) return;
    const [ctx, out] = v;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.6, t + 0.02);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    n.connect(hp).connect(ng).connect(out);
    n.start(t, Math.random() * 2);
    n.stop(t + 0.2);
    if (tier >= 1) this.treasure(tier + 1);
  }

  /** Old parchment unrolled (or rolled away): a dry, crackling rustle. */
  parchment(vol = 1) {
    const v = this.voice(0.32 * vol, 0);
    if (!v || !this.noise) return;
    const [ctx, out] = v;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const bp = ctx.createBiquadFilter();
    bp.type = 'peaking';
    bp.frequency.value = 4200;
    bp.gain.value = 6;
    const g = ctx.createGain();
    // a crackle: the paper catches and lets go in little bursts
    g.gain.setValueAtTime(0, t);
    let at = t;
    for (let i = 0; i < 9; i++) {
      const a = (0.25 + Math.random() * 0.75) * (1 - i / 11);
      g.gain.linearRampToValueAtTime(a, at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.04 + Math.random() * 0.08, at + 0.03 + Math.random() * 0.03);
      at += 0.028 + Math.random() * 0.05;
    }
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.12);
    src.connect(hp).connect(bp).connect(g).connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(at + 0.15);
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
  /** A camera shutter: the blades snap open, then shut. */
  shutter() {
    const v = this.voice(0.2, 0);
    if (!v) return;
    const [ctx, out] = v;
    const t0 = ctx.currentTime;
    for (const [dt, f, g0] of [[0, 3800, 0.7], [0.075, 2600, 0.55]] as const) {
      const t = t0 + dt;
      const n = ctx.createBufferSource();
      n.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.4;
      bp.frequency.value = f;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(g0, t + 0.004);
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      n.connect(bp).connect(ng).connect(out);
      n.start(t, Math.random() * 2);
      n.stop(t + 0.06);
    }
  }

  // ------------------------------------------------------------------ the Kraken

  /** A synth voice routed through the reverb as well, arriving late from far off. */
  private bigVoice(vol: number, pan: number, dist: number, delay = 0): [AudioContext, GainNode, number] | null {
    const v = this.voice(Math.min(1.2, vol), pan);
    if (!v) return null;
    const [ctx, out] = v;
    const send = ctx.createGain();
    send.gain.value = 0.55;
    out.connect(send).connect(this.reverbIn);
    return [ctx, out, ctx.currentTime + delay + Math.min(dist / SPEED_OF_SOUND, 1.1)];
  }

  private noiseSrc(ctx: AudioContext, at: number, dur: number, rate = 1) {
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    n.playbackRate.value = rate;
    n.start(at, Math.random() * 1.5);
    n.stop(at + dur);
    return n;
  }

  /**
   * The Kraken's roar: a vast, wet bellow. Detuned saws growl through a vocal
   * formant that opens and closes, a rasping fry of filtered noise rides on
   * top and a sub-bass sits under it all, washed out across the sea.
   */
  krakenRoar(vol: number, pan: number, dist = 0, delay = 0, rage = 0, len = 3.2, low = 1) {
    const v = this.bigVoice(vol * 0.85, pan, dist, delay);
    if (!v) return;
    const [ctx, out, t] = v;
    const dur = len;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 0.3);
    env.gain.linearRampToValueAtTime(0.75, t + dur * 0.55);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    env.connect(out);
    const form = ctx.createBiquadFilter();
    form.type = 'bandpass';
    form.Q.value = 1.8;
    form.frequency.setValueAtTime(200, t);
    form.frequency.linearRampToValueAtTime(640 + rage * 120, t + 0.55);
    form.frequency.linearRampToValueAtTime(380, t + dur * 0.6);
    form.frequency.linearRampToValueAtTime(150, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1500;
    form.connect(lp).connect(env);
    const f0 = (44 + rage * 7) * low;
    const vib = ctx.createOscillator();
    vib.frequency.value = 6.2;
    const vg = ctx.createGain();
    vg.gain.value = f0 * 0.05;
    vib.connect(vg);
    vib.start(t);
    vib.stop(t + dur);
    for (const det of [-0.012, 0, 0.009, 0.5]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const f = f0 * (1 + det);
      o.frequency.setValueAtTime(f * 0.75, t);
      o.frequency.exponentialRampToValueAtTime(f * 1.25, t + 0.45);
      o.frequency.exponentialRampToValueAtTime(f, t + dur * 0.6);
      o.frequency.exponentialRampToValueAtTime(f * 0.62, t + dur);
      vg.connect(o.frequency);
      const g = ctx.createGain();
      g.gain.value = det === 0.5 ? 0.25 : 0.42;
      o.connect(g).connect(form);
      o.start(t);
      o.stop(t + dur);
    }
    // the rasp: noise chopped by a low buzz, like air forced through a throat
    const n = this.noiseSrc(ctx, t, dur, 0.8);
    const nb = ctx.createBiquadFilter();
    nb.type = 'bandpass';
    nb.frequency.value = 850;
    nb.Q.value = 1.2;
    const am = ctx.createGain();
    am.gain.value = 0.5;
    const fry = ctx.createOscillator();
    fry.type = 'square';
    fry.frequency.value = 29;
    const fg = ctx.createGain();
    fg.gain.value = 0.5;
    fry.connect(fg).connect(am.gain);
    fry.start(t);
    fry.stop(t + dur);
    n.connect(nb).connect(am).connect(env);
    // and the sub, felt more than heard
    const sub = ctx.createOscillator();
    sub.frequency.setValueAtTime(34 * low, t);
    sub.frequency.exponentialRampToValueAtTime(24 * low, t + dur);
    const sg = ctx.createGain();
    sg.gain.value = 0.7;
    sub.connect(sg).connect(env);
    sub.start(t);
    sub.stop(t + dur);
    this.duck(t, 0.4);
  }

  /** An arm whipping down across the sea: a crack of water and a deep, rolling boom. */
  krakenSlam(vol: number, pan: number, dist = 0) {
    const v = Math.max(vol, 0.35);
    const at = this.emit(pick(this.bank.blast), { vol: v * 0.7, pan, dist, rate: 0.48 + Math.random() * 0.06, wet: 0.8 });
    this.emit(pick(this.bank.water), { vol: v * 0.95, pan, dist, rate: 0.5 + Math.random() * 0.1, wet: 0.6 });
    this.emit(pick(this.bank.water), { vol: v * 0.7, pan: pan * 0.6, dist, rate: 0.72, wet: 0.5, delay: 0.06 });
    const b = this.bigVoice(v * 0.9, pan, dist);
    if (b) {
      const [ctx, out, t] = b;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(64, t);
      o.frequency.exponentialRampToValueAtTime(21, t + 1.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.95, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 1.35);
    }
    if (at >= 0) this.duck(at, dist < 60 ? 0.6 : 0.3);
  }

  /** Something vast breaking the surface: a heavy rush of water over a low rumble. */
  krakenRise(vol: number, pan: number, dist = 0, size = 1) {
    const v = Math.max(vol, 0.3) * size;
    this.emit(pick(this.bank.water), { vol: v * 0.8, pan, dist, rate: 0.42 / size, wet: 0.6 });
    this.emit(pick(this.bank.water), { vol: v * 0.55, pan, dist, rate: 0.6 / size, wet: 0.5, delay: 0.12 });
    const b = this.bigVoice(v * 0.7, pan, dist);
    if (!b) return;
    const [ctx, out, t] = b;
    const n = this.noiseSrc(ctx, t, 2.2, 0.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.1);
    n.connect(lp).connect(g).connect(out);
  }

  /** An arm rearing or lashing through the air: a heavy, slow swoosh. */
  krakenWhip(vol: number, pan: number, dist = 0, k = 1) {
    this.emit(pick(this.bank.whoosh), { vol: Math.max(vol, 0.3) * 0.7 * k, pan, panTo: -pan, dist, rate: 0.38 + Math.random() * 0.08, wet: 0.3 });
  }

  /** Shot into its flesh: a wet, meaty slap. */
  krakenFlesh(vol: number, pan: number, dist = 0) {
    this.emit(pick(this.bank.water), { vol: vol * 0.45, pan, dist, rate: 1.5 + Math.random() * 0.3, wet: 0.3 });
    const v = this.voice(vol * 0.5, pan);
    if (!v) return;
    const [ctx, out] = v;
    const t = ctx.currentTime + Math.min(dist / SPEED_OF_SOUND, 1.1);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.8, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.2);
  }

  /** Pain: a low moan from a beaten arm, or a piercing shriek when it's shot in the eye. */
  krakenHurt(vol: number, pan: number, dist = 0, shriek = false) {
    const v = this.bigVoice(Math.max(vol, 0.35) * (shriek ? 0.55 : 0.6), pan, dist);
    if (!v) return;
    const [ctx, out, t] = v;
    const dur = shriek ? 1.1 : 1.6;
    const f = shriek ? 380 : 120;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = shriek ? 1500 : 520;
    bp.Q.value = 2.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    bp.connect(g).connect(out);
    const vib = ctx.createOscillator();
    vib.frequency.value = shriek ? 11 : 5;
    const vg = ctx.createGain();
    vg.gain.value = f * 0.04;
    vib.connect(vg);
    vib.start(t);
    vib.stop(t + dur);
    for (const det of [0, 0.013]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * (1 + det), t);
      o.frequency.exponentialRampToValueAtTime(f * 1.45 * (1 + det), t + dur * 0.25);
      o.frequency.exponentialRampToValueAtTime(f * 0.6, t + dur);
      vg.connect(o.frequency);
      o.connect(bp);
      o.start(t);
      o.stop(t + dur);
    }
  }

  /** Its death: a long, falling howl, then the brass of a victory swelling over the sea. */
  krakenDeath(vol: number, pan: number, dist = 0) {
    this.krakenRoar(vol, pan, dist, 0, 1, 5.5, 0.85);
    this.krakenHurt(vol, pan, dist, true);
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime + 4.2;
    const out = ctx.createGain();
    out.gain.value = 0.5;
    out.connect(this.bossOut());
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.linearRampToValueAtTime(2600, t + 1.2);
    lp.frequency.linearRampToValueAtTime(900, t + 6);
    lp.connect(out);
    // D major, rising: a fanfare's last chord
    const notes = [73.42, 146.83, 185, 220, 293.66, 369.99];
    notes.forEach((f, i) => {
      const at = t + i * 0.09;
      for (const det of [-5, 5]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.07 - i * 0.006, at + 0.25);
        g.gain.setTargetAtTime(0.0001, at + 2.4, 1.2);
        o.connect(g).connect(lp);
        o.start(at);
        o.stop(at + 7);
      }
    });
    // and two great timpani strokes under it
    for (const [dt, f] of [[0, 55], [0.42, 73.4]] as const) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(f * 1.6, t + dt);
      o.frequency.exponentialRampToValueAtTime(f, t + dt + 0.08);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.exponentialRampToValueAtTime(0.6, t + dt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + dt + 1.6);
      o.connect(g).connect(out);
      o.start(t + dt);
      o.stop(t + dt + 1.7);
    }
  }

  /** The omen: the sea's sounds sink under a swelling drone and a slow, huge heartbeat, with bubbles rising. */
  krakenOmen(len: number) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0.55;
    out.connect(this.bossOut());
    const n = this.noiseSrc(ctx, t, len + 1.5, 0.35);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(90, t);
    lp.frequency.linearRampToValueAtTime(260, t + len);
    lp.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + len * 0.8);
    g.gain.exponentialRampToValueAtTime(0.001, t + len + 1.4);
    n.connect(lp).connect(g).connect(out);
    for (let k = 0; k * 1.25 < len; k++) {
      const at = t + 0.8 + k * Math.max(0.55, 1.4 - k * 0.09);
      if (at > t + len) break;
      for (const [dt, f] of [[0, 52], [0.24, 44]] as const) {
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(f * 1.4, at + dt);
        o.frequency.exponentialRampToValueAtTime(f * 0.7, at + dt + 0.3);
        const hg = ctx.createGain();
        hg.gain.setValueAtTime(0.0001, at + dt);
        hg.gain.exponentialRampToValueAtTime(0.25 + k * 0.05, at + dt + 0.02);
        hg.gain.exponentialRampToValueAtTime(0.001, at + dt + 0.45);
        o.connect(hg).connect(out);
        o.start(at + dt);
        o.stop(at + dt + 0.5);
      }
    }
    for (let i = 0; i < 14; i++) this.bubble(t + Math.random() * len);
  }

  // the battle music: a drone, dissonant tremolo strings and war drums, louder with each stage
  private bossBus: GainNode | null = null;
  private boss: { nodes: AudioScheduledSourceNode[]; gain: GainNode; strings: GainNode; timer: number; next: number; beat: number } | null = null;
  private bossStage = 0;

  private bossOut() {
    const ctx = this.ctx!;
    if (!this.bossBus) {
      this.bossBus = ctx.createGain();
      this.bossBus.connect(this.master);
      this.syncBoss();
    }
    return this.bossBus;
  }

  private syncBoss() {
    if (!this.ctx || !this.bossBus) return;
    this.bossBus.gain.setTargetAtTime(this.musicEnabled ? this.vol.music * 1.25 : 0, this.ctx.currentTime, 0.1);
  }

  /** Starts, raises (stage 0..2) or stops the Kraken's battle music. */
  krakenMusic(on: boolean, stage = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.bossStage = stage;
    if (!on) {
      const b = this.boss;
      if (!b) return;
      this.boss = null;
      clearInterval(b.timer);
      b.gain.gain.setTargetAtTime(0, t, 0.9);
      for (const n of b.nodes) n.stop(t + 4);
      return;
    }
    if (this.boss) {
      this.boss.strings.gain.setTargetAtTime(0.012 + stage * 0.012, t, 1.5);
      return;
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + 2.5);
    gain.connect(this.bossOut());
    const nodes: AudioScheduledSourceNode[] = [];
    // the drone: A and E, deep, breathing through a slowly moving filter
    const dl = ctx.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 260;
    dl.Q.value = 3;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lg = ctx.createGain();
    lg.gain.value = 120;
    lfo.connect(lg).connect(dl.frequency);
    nodes.push(lfo);
    const dg = ctx.createGain();
    dg.gain.value = 0.11;
    dl.connect(dg).connect(gain);
    for (const [f, det] of [[55, -6], [55, 6], [82.41, 0], [41.2, 0]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(dl);
      nodes.push(o);
    }
    // the strings: a trembling minor second high above, the dread in it
    const strings = ctx.createGain();
    strings.gain.value = 0.012 + stage * 0.012;
    const sl = ctx.createBiquadFilter();
    sl.type = 'lowpass';
    sl.frequency.value = 1700;
    const trem = ctx.createGain();
    trem.gain.value = 0.6;
    const tl = ctx.createOscillator();
    tl.frequency.value = 9;
    const tg = ctx.createGain();
    tg.gain.value = 0.4;
    tl.connect(tg).connect(trem.gain);
    nodes.push(tl);
    sl.connect(trem).connect(strings).connect(gain);
    for (const f of [220, 233.08, 329.63, 440]) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(sl);
        nodes.push(o);
      }
    }
    for (const n of nodes) n.start(t);
    // war drums, scheduled a little ahead on a timer
    const b = { nodes, gain, strings, timer: 0, next: t + 0.4, beat: 0 };
    const spb = 60 / 96;
    const drum = (at: number, f: number, v: number) => {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(f * 1.8, at);
      o.frequency.exponentialRampToValueAtTime(f, at + 0.05);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(v, at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.55);
      o.connect(g).connect(gain);
      o.start(at);
      o.stop(at + 0.6);
      // the skin's slap
      const n = this.noiseSrc(ctx, at, 0.08, 1.4);
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 1200;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(v * 0.25, at);
      ng.gain.exponentialRampToValueAtTime(0.001, at + 0.07);
      n.connect(hp).connect(ng).connect(gain);
    };
    b.timer = window.setInterval(() => {
      const now = ctx.currentTime;
      while (b.next < now + 0.5) {
        const i = b.beat % 16;
        const st = this.bossStage;
        // a heavy four, a pickup into each bar, and more and more of it as it rages
        if (i % 4 === 0) drum(b.next, 52, 0.55);
        if (i === 14 || i === 15) drum(b.next, 70, 0.35);
        if (st >= 1 && (i === 6 || i === 10)) drum(b.next, 64, 0.32);
        if (st >= 2 && i % 2 === 1) drum(b.next, 92, 0.18);
        b.next += spb / 2;
        b.beat++;
      }
    }, 120);
    this.boss = b;
  }

  // ---------------------------------------------------------------- the high seas
  // A calm theme for the open ocean, played live: a slow, warm pad breathing
  // through Dmaj9, Bm11, Gmaj7#11 and A6sus, a deep sine under each chord, a
  // harp picking lazily over the chord tones and, now and then, a soft
  // ocarina line from the pentatonic, all washed in a long, cross-fed echo
  // like light on the swell. It fades in when you leave the islands behind and
  // drifts away as land comes up over the horizon.
  private seaBus: GainNode | null = null;
  private seaSong: { gain: GainNode; wet: GainNode; dry: GainNode; timer: number; next: number; bar: number; nodes: AudioScheduledSourceNode[] } | null = null;

  private syncSea() {
    if (!this.ctx || !this.seaBus) return;
    this.seaBus.gain.setTargetAtTime(this.musicEnabled ? this.vol.music * 0.95 : 0, this.ctx.currentTime, 0.1);
  }

  /** The high seas' theme on or off (it fades either way). */
  highSeas(on: boolean) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (!on) {
      const sg = this.seaSong;
      if (!sg) return;
      this.seaSong = null;
      sg.gain.gain.cancelScheduledValues(t);
      sg.gain.gain.setTargetAtTime(0, t, 1.6);
      window.setTimeout(() => {
        clearInterval(sg.timer);
        for (const n of sg.nodes) n.stop();
        sg.gain.disconnect();
      }, 9000);
      return;
    }
    if (this.seaSong) return;
    if (!this.seaBus) {
      this.seaBus = ctx.createGain();
      this.seaBus.connect(this.master);
      this.syncSea();
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + 6);
    gain.connect(this.seaBus);
    // the echo: two delays feeding each other through a dark filter, panned apart
    const dry = ctx.createGain();
    dry.gain.value = 0.8;
    dry.connect(gain);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    const nodes: AudioScheduledSourceNode[] = [];
    const dl = ctx.createDelay(2);
    const dr = ctx.createDelay(2);
    dl.delayTime.value = 0.61;
    dr.delayTime.value = 0.83;
    const fb = ctx.createBiquadFilter();
    fb.type = 'lowpass';
    fb.frequency.value = 2400;
    const fbl = ctx.createGain();
    const fbr = ctx.createGain();
    fbl.gain.value = 0.48;
    fbr.gain.value = 0.46;
    const pl = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const pr = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    wet.connect(fb);
    fb.connect(dl);
    fb.connect(dr);
    dl.connect(fbr).connect(dr);
    dr.connect(fbl).connect(dl);
    if (pl && pr) {
      pl.pan.value = -0.7;
      pr.pan.value = 0.7;
      dl.connect(pl).connect(gain);
      dr.connect(pr).connect(gain);
    } else {
      dl.connect(gain);
      dr.connect(gain);
    }
    const sg = { gain, wet, dry, timer: 0, next: t + 0.3, bar: 0, nodes };
    const BAR = (60 / 64) * 4;
    const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
    // chord voicings (midi), and the root under each
    const CHORDS: [number[], number][] = [
      [[62, 66, 69, 73, 76], 38], // Dmaj9
      [[59, 62, 66, 69, 76], 35], // Bm11
      [[55, 59, 62, 66, 73], 43], // Gmaj7#11
      [[57, 61, 64, 66, 71], 45], // A6sus (add9)
      [[62, 66, 69, 73, 76], 38],
      [[54, 61, 64, 69, 73], 42], // F#m7
      [[55, 62, 66, 71, 74], 43], // Gmaj7
      [[57, 62, 64, 69, 71], 45], // Asus4
    ];
    const PENTA = [69, 71, 73, 76, 78, 81, 83, 85];
    const pad = (at: number, notes: number[], len: number) => {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(700, at);
      lp.frequency.linearRampToValueAtTime(1500, at + len * 0.5);
      lp.frequency.linearRampToValueAtTime(800, at + len + 2.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(0.05, at + 2.2);
      g.gain.setValueAtTime(0.05, at + len - 0.4);
      g.gain.linearRampToValueAtTime(0.0001, at + len + 3);
      lp.connect(g);
      g.connect(dry);
      g.connect(wet);
      for (const m of notes) {
        for (const det of [-6, 5]) {
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = hz(m);
          o.detune.value = det + (Math.random() - 0.5) * 3;
          o.connect(lp);
          o.start(at);
          o.stop(at + len + 3.2);
        }
      }
    };
    const bass = (at: number, m: number, len: number) => {
      const o = ctx.createOscillator();
      o.frequency.value = hz(m);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(0.11, at + 0.9);
      g.gain.exponentialRampToValueAtTime(0.02, at + len);
      g.gain.linearRampToValueAtTime(0.0001, at + len + 1.5);
      o.connect(g).connect(dry);
      o.start(at);
      o.stop(at + len + 1.6);
    };
    // a plucked harp string: a bright attack that mellows as it rings
    const harp = (at: number, m: number, v: number) => {
      const f = hz(m);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(v, at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0008, at + 2.6);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(f * 6, at);
      lp.frequency.exponentialRampToValueAtTime(f * 1.5, at + 1.2);
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (pan) pan.pan.value = (Math.random() - 0.5) * 0.8;
      lp.connect(g);
      (pan ? g.connect(pan) : g).connect(dry);
      (pan ?? g).connect(wet);
      for (const [mul, k] of [[1, 1], [2, 0.35], [3, 0.12]] as const) {
        const o = ctx.createOscillator();
        o.type = mul === 1 ? 'triangle' : 'sine';
        o.frequency.value = f * mul;
        const og = ctx.createGain();
        og.gain.value = k;
        o.connect(og).connect(lp);
        o.start(at);
        o.stop(at + 2.7);
      }
    };
    // a breathy ocarina: a sine with a soft vibrato and a puff of air at the start
    const ocarina = (at: number, m: number, len: number) => {
      const o = ctx.createOscillator();
      o.frequency.value = hz(m);
      const vib = ctx.createOscillator();
      vib.frequency.value = 5.2;
      const vg = ctx.createGain();
      vg.gain.setValueAtTime(0, at);
      vg.gain.linearRampToValueAtTime(hz(m) * 0.006, at + len * 0.6);
      vib.connect(vg).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(0.045, at + 0.18);
      g.gain.setValueAtTime(0.04, at + len - 0.2);
      g.gain.linearRampToValueAtTime(0.0001, at + len + 0.5);
      o.connect(g);
      g.connect(dry);
      g.connect(wet);
      o.start(at);
      o.stop(at + len + 0.6);
      vib.start(at);
      vib.stop(at + len + 0.6);
      const n = this.noiseSrc(ctx, at, 0.25, 1);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = hz(m) * 2;
      bp.Q.value = 2;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.012, at);
      ng.gain.exponentialRampToValueAtTime(0.0005, at + 0.22);
      n.connect(bp).connect(ng).connect(wet);
    };
    let lastMel = 73;
    sg.timer = window.setInterval(() => {
      const now = ctx.currentTime;
      while (sg.next < now + 1.5) {
        const at = sg.next;
        const ci = Math.floor(sg.bar / 2) % CHORDS.length;
        const [notes, root] = CHORDS[ci];
        if (sg.bar % 2 === 0) {
          pad(at, notes, BAR * 2);
          bass(at, root, BAR * 2);
        }
        // the harp: eighth notes over the chord, rising and falling, often resting
        const tones = [...notes, ...notes.map((n) => n + 12)].sort((a, b) => a - b);
        for (let e = 0; e < 8; e++) {
          if (Math.random() > (e % 2 ? 0.38 : 0.62)) continue;
          const k = Math.floor((Math.sin((sg.bar * 8 + e) * 0.7) * 0.5 + 0.5) * (tones.length - 1));
          harp(at + e * (BAR / 8) + (Math.random() - 0.5) * 0.02, tones[k], 0.05 + Math.random() * 0.03);
        }
        // the ocarina sings a little phrase every few bars
        if (sg.bar % 4 === 1 && Math.random() < 0.75) {
          let beat = 0;
          const len = 2 + Math.floor(Math.random() * 3);
          for (let i = 0; i < len; i++) {
            const step = Math.round((Math.random() - 0.5) * 3);
            const j = Math.max(0, Math.min(PENTA.length - 1, PENTA.indexOf(lastMel) + step));
            lastMel = PENTA[j < 0 ? 2 : j];
            const d = (BAR / 4) * (i === len - 1 ? 3 : 1 + Math.floor(Math.random() * 2));
            ocarina(at + beat, lastMel, d * 0.95);
            beat += d;
          }
        }
        sg.next += BAR;
        sg.bar++;
      }
    }, 200);
    this.seaSong = sg;
  }

  /** A dolphin calls: a rising, warbling whistle, or a quick burst of clicks. */
  dolphin(vol: number, pan: number, whistle: boolean) {
    const ctx = this.ctx;
    if (!ctx || vol < 0.02) return;
    const t = ctx.currentTime + Math.random() * 0.05;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) p.pan.value = clamp1(pan);
    const out = ctx.createGain();
    out.gain.value = vol;
    (p ? out.connect(p) : out).connect(this.ambBus);
    if (whistle) {
      const o = ctx.createOscillator();
      const f0 = 2600 + Math.random() * 1600;
      const len = 0.35 + Math.random() * 0.5;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * (1.35 + Math.random() * 0.5), t + len * 0.45);
      o.frequency.exponentialRampToValueAtTime(f0 * (0.9 + Math.random() * 0.3), t + len);
      const vib = ctx.createOscillator();
      vib.frequency.value = 9 + Math.random() * 8;
      const vg = ctx.createGain();
      vg.gain.value = f0 * 0.03;
      vib.connect(vg).connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.04);
      g.gain.setValueAtTime(0.05, t + len * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + len + 0.05);
      vib.start(t);
      vib.stop(t + len + 0.05);
    } else {
      const n = 6 + Math.floor(Math.random() * 10);
      const gap = 0.018 + Math.random() * 0.03;
      for (let i = 0; i < n; i++) {
        const at = t + i * gap * (1 - i * 0.02);
        const s = this.noiseSrc(ctx, at, 0.012, 2);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 3800 + Math.random() * 1400;
        bp.Q.value = 6;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.09, at);
        g.gain.exponentialRampToValueAtTime(0.001, at + 0.011);
        s.connect(bp).connect(g).connect(out);
      }
    }
  }
}
