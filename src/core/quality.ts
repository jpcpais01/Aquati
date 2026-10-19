// Device tiering + runtime dynamic resolution. The tier picks feature
// levels once; the resolution scaler reacts to real frame times on the
// player's device and trades pixels for a steady frame.

export interface QualityProfile {
  tier: 0 | 1 | 2;
  maxDpr: number;
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
  if (url === 'low') tier = 0;
  if (url === 'med') tier = 1;
  if (url === 'high') tier = 2;
  const maxSamples = renderer.capabilities.maxSamples || 0;
  const P: QualityProfile[] = [
    { tier: 0, maxDpr: 1.25, msaa: 0, shadowSize: 1024, oceanSegments: 150, bloomLevels: 4, wakeRes: 256, vegetation: 0.55, terrainLod: 2, particles: 0.5, tiltShift: false, physicalHull: false },
    { tier: 1, maxDpr: 1.75, msaa: Math.min(4, maxSamples), shadowSize: 2048, oceanSegments: 210, bloomLevels: 5, wakeRes: 384, vegetation: 0.8, terrainLod: 1, particles: 0.8, tiltShift: true, physicalHull: true },
    { tier: 2, maxDpr: 2, msaa: Math.min(4, maxSamples), shadowSize: 2048, oceanSegments: 280, bloomLevels: 6, wakeRes: 512, vegetation: 1, terrainLod: 1, particles: 1, tiltShift: true, physicalHull: true },
  ];
  return P[tier];
}

export class ResolutionScaler {
  scale = 1;
  private acc = 0;
  private samples: number[] = [];
  private cooldown = 2;
  private avg = 16;
  private calm = 0;

  /**
   * Returns true when the render scale changed. A change rebuilds every render
   * target, itself a hitch, so it reacts to the typical (median) frame of each
   * window, never to one-off spikes like a ship breaking up, and only creeps
   * back up after a run of calm windows.
   */
  sample(dt: number): boolean {
    this.avg += (dt * 1000 - this.avg) * 0.05;
    this.acc += dt;
    this.samples.push(dt * 1000);
    this.cooldown -= dt;
    if (this.cooldown > 0 || this.acc < 1.5) return false;
    const sorted = this.samples.sort((a, b) => a - b);
    const ms = sorted[sorted.length >> 1];
    this.acc = 0;
    this.samples = [];
    let next = this.scale;
    if (ms > 21) {
      next = Math.max(0.55, this.scale - 0.1);
      this.calm = 0;
    } else if (ms < 14.5 && this.scale < 1) {
      if (++this.calm >= 3) next = Math.min(1, this.scale + 0.05);
    } else this.calm = 0;
    if (next !== this.scale) {
      this.scale = next;
      this.calm = 0;
      this.cooldown = 2.5;
      return true;
    }
    return false;
  }

  get frameMs() {
    return this.avg;
  }
}
