// Soundscape: surf + wind beds, plus a bank of combat sounds rendered at startup by
// ./sfx (cannon blasts per caliber, recoil, impacts, explosions) played
// through distance delay, air absorption and an island-echo reverb.
// The harbour theme is the one recorded file: streamed, never decoded whole.

import { BankKind, bankJobs, CALIBERS } from './sfx';
import { renderThunder } from './thunder';

const SPEED_OF_SOUND = 343;
const AMBIENCE_LEVEL = 0.35;
const MUSIC_URL = '/music/sunset-archipelago.mp3';
const MUSIC_VOL = 0.55;

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
const pick = <T>(a: T[]): T | undefined => a[(Math.random() * a.length) | 0];

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
  private duckGain!: GainNode;
  private reverb!: ConvolverNode;
  private reverbIn!: GainNode;
  /** Muffles the whole mix when the camera follows a wreck under. */
  private muffle!: BiquadFilterNode;
  private deep: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private voices = 0;
  private bank: Record<Exclude<BankKind, 'reverb'>, AudioBuffer[]> = {
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
  };
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

  /** Changing the shot: a ball of the new kind rolling into the gunner's hands and a click of the rack. */
  ammoSwap(kind: number) {
    const v = this.voice(0.22, 0);
    if (!v) return;
    const [ctx, out] = v;
    const t = ctx.currentTime;
    // the iron ball's knock, lower for heavier loads
    const o = ctx.createOscillator();
    o.type = 'triangle';
    const f = [118, 96, 132, 150, 210][kind] ?? 118;
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

  hit(vol: number, pan: number, dist = 0) {
    this.emit(pick(this.bank.wood), { vol: vol * 0.8, pan, dist, rate: 0.8 + Math.random() * 0.14, wet: 0.45 });
  }

  /** Hulls colliding or a keel grinding onto rock. `force` 0 = a nudge .. 1 = a full-speed ram. */
  crunch(vol: number, pan: number, dist = 0, force = 1) {
    const f = Math.max(0, Math.min(1, force));
    const at = this.emit(pick(this.bank.crunch), { vol: vol * (0.35 + 0.55 * f), pan, dist, rate: 1.12 - f * 0.22 + Math.random() * 0.08, wet: 0.45 });
    if (at >= 0 && dist < 40 && f > 0.4) this.duck(at, 0.3 * f);
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
}
