import { savedTier } from './settings';

// Device tiering + runtime dynamic resolution. The tier picks feature
// levels once; the resolution scaler reacts to real frame times on the
// player's device and trades pixels for a steady frame.

export interface QualityProfile {
  tier: 0 | 1 | 2;
  mobile: boolean;
  maxDpr: number;
  /** Most pixels the 3D view renders at full scale; past it the pixel ratio comes down. */
  maxPixels: number;
  msaa: number;
  shadowSize: number;
  oceanSegments: number;
  bloomLevels: number;
  wakeRes: number;
  vegetation: number;
  terrainLod: number;
  particles: number;
  tiltShift: boolean;
  physicalHull: boolean;
}

export function detectQuality(renderer: { capabilities: { maxSamples: number } }): QualityProfile {
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8;
  const url = new URLSearchParams(location.search).get('q');
  let tier: 0 | 1 | 2 = mobile ? (cores >= 6 && mem >= 4 ? 1 : 0) : cores >= 4 ? 2 : 1;
  // a preset picked in Graphics settings decides world detail from the next launch
  tier = savedTier() ?? tier;
  if (url === 'low') tier = 0;
  if (url === 'med') tier = 1;
  if (url === 'high') tier = 2;
  const maxSamples = renderer.capabilities.maxSamples || 0;
  // Pixel ratio is the multiplier on every per-pixel cost (the sea, soft
  // shadows, the traced light, post). Past ~1.5 the extra pixels are hard to
  // see after the final pass's sharpen, so the 3D view stops there and also
  // keeps under a pixel budget (a 4K or retina screen at full ratio would ask
  // for 6-8 million shaded pixels a frame); the HUD is HTML and stays sharp.
  const P: QualityProfile[] = [
    { tier: 0, mobile, maxDpr: 1.25, maxPixels: 0.9e6, msaa: 0, shadowSize: 1024, oceanSegments: 150, bloomLevels: 4, wakeRes: 256, vegetation: 0.55, terrainLod: 2, particles: 0.5, tiltShift: false, physicalHull: false },
    { tier: 1, mobile, maxDpr: 1.5, maxPixels: mobile ? 1.25e6 : 2.1e6, msaa: Math.min(mobile ? 2 : 4, maxSamples), shadowSize: 2048, oceanSegments: 210, bloomLevels: 5, wakeRes: 384, vegetation: 0.8, terrainLod: 1, particles: 0.8, tiltShift: true, physicalHull: true },
    { tier: 2, mobile, maxDpr: 1.5, maxPixels: mobile ? 1.6e6 : 2.6e6, msaa: Math.min(mobile ? 2 : 4, maxSamples), shadowSize: 2048, oceanSegments: 280, bloomLevels: 6, wakeRes: 512, vegetation: 1, terrainLod: 1, particles: 1, tiltShift: true, physicalHull: true },
  ];
  return P[tier];
}

/** Common display refresh intervals (ms), fastest first. */
const REFRESH = [1000 / 165, 1000 / 144, 1000 / 120, 1000 / 90, 1000 / 75, 1000 / 60, 1000 / 50, 1000 / 30];

/**
 * Dynamic resolution aimed at the display's own refresh rate: 120 Hz screens
 * get 120 fps, 60 Hz ones 60. Frames arrive on vsync, so a frame that misses
 * its slot shows up as a doubled interval; the scaler counts those misses per
 * window and trades pixels for a steady cadence.
 *
 * Only frames short of their slot because of the GPU are its business: when
 * the CPU's own work per frame already fills the slot, fewer pixels won't help
 * and it holds still rather than blurring the picture for nothing.
 */
export class ResolutionScaler {
  scale = 1;
  /** A fixed render scale from settings; 0 lets the scaler drive it. */
  fixed = 0;
  /** Windows spent at the lowest scale and still missing frames on the GPU. */
  pressure = 0;
  /** The display's frame interval (ms), learnt from the fastest steady frames. */
  slotMs = 1000 / 60;
  private acc = 0;
  private frames = 0;
  private misses = 0;
  private cpuSum = 0;
  private samples: number[] = [];
  private cooldown = 2;
  private avg = 16;
  private calm = 0;
  /** A scale that proved too much recently, and how long it stays off limits. */
  private ceiling = 1;
  private ceilingT = 0;
  private raisedAt = -1;
  private fastest: number[] = [];

  /**
   * `dt` is the interval since the last frame, `cpuMs` the main thread's work
   * in the previous one. Returns true when the render scale changed; a change
   * rebuilds every render target, itself a hitch, so it moves in steps after
   * whole windows, never on a one-off spike like a ship breaking up.
   */
  sample(dt: number, cpuMs = 0): boolean {
    const ms = dt * 1000;
    this.avg += (ms - this.avg) * 0.05;
    this.acc += dt;
    this.frames++;
    this.cpuSum += cpuMs;
    this.samples.push(ms);
    if (ms > this.slotMs * 1.45) this.misses++;
    this.cooldown -= dt;
    this.ceilingT -= dt;
    if (this.ceilingT <= 0) this.ceiling = 1;
    if (this.acc < 1) return false;
    this.learnRefresh();
    const missRate = this.misses / this.frames;
    const cpuBound = this.cpuSum / this.frames > this.slotMs * 0.8;
    this.acc = 0;
    this.frames = 0;
    this.misses = 0;
    this.cpuSum = 0;
    this.samples.length = 0;
    if (this.fixed) {
      const changed = this.scale !== this.fixed;
      this.scale = this.fixed;
      return changed;
    }
    if (this.cooldown > 0) return false;
    const slow = missRate > 0.1 && !cpuBound;
    this.pressure = slow && this.scale <= 0.56 ? this.pressure + 1 : 0;
    let next = this.scale;
    if (slow) {
      // the step just taken up is what broke the cadence: stay under it a while
      if (this.raisedAt >= 0) {
        this.ceiling = this.scale - 0.01;
        this.ceilingT = 45;
      }
      next = Math.max(0.55, this.scale - (missRate > 0.35 ? 0.12 : 0.07));
      this.calm = 0;
    } else if (missRate < 0.02 && this.scale < Math.min(1, this.ceiling)) {
      if (++this.calm >= 4) next = Math.min(1, this.ceiling, this.scale + 0.05);
    } else this.calm = 0;
    this.raisedAt = -1;
    if (next !== this.scale) {
      if (next > this.scale) this.raisedAt = 0;
      this.scale = Math.round(next * 100) / 100;
      this.calm = 0;
      this.cooldown = 2.5;
      return true;
    }
    return false;
  }

  /**
   * The display's slot is about the shortest interval it ever delivers: take
   * a low percentile of each window (ignoring stray early callbacks) and snap
   * it to a known rate. It only ever speeds up, so a slow patch can't talk the
   * scaler into aiming for 30.
   */
  private learnRefresh() {
    const s = this.samples.sort((a, b) => a - b);
    if (s.length < 20) return;
    const lo = s[Math.floor(s.length * 0.1)];
    this.fastest.push(lo);
    if (this.fastest.length > 5) this.fastest.shift();
    const best = Math.min(...this.fastest);
    let slot = REFRESH[REFRESH.length - 1];
    for (const r of REFRESH) {
      if (best <= r * 1.08) {
        slot = r;
        break;
      }
    }
    if (slot < this.slotMs) this.slotMs = slot;
  }

  get frameMs() {
    return this.avg;
  }
}
