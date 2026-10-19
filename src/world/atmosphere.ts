import * as THREE from 'three';
import { globalUniforms } from '../render/environment';

// The sky over the archipelago: a full day/night cycle and a living weather
// system, both resolved into the handful of shared uniforms every shader
// already reads (sun direction & colour, sky gradient, fog, cloud cover).
//
// Day: the sun rises in the east, arcs high through the north and sets in the
// west; once it is well down the key light hands over to the moon, so the same
// lighting, glitter and shadow code paints moonlight at night. Sky, fog and
// light colours come from keyframes on the sun's elevation (night, blue hour,
// dusk, sunset, golden hour, day).
//
// Weather: a small Markov chain of states (clear, fair, cloudy, mist, rain,
// storm). Each state only sets targets; every parameter eases toward its own
// target at its own pace, so clouds gather first, then the rain, and the sea
// takes longest of all to build and to settle.

export type WeatherKind = 'clear' | 'fair' | 'cloudy' | 'mist' | 'rain' | 'storm';

interface WeatherDef {
  name: string;
  cover: number;
  rain: number;
  storm: number;
  fog: number;
  wind: number;
  dur: [number, number];
  next: [WeatherKind, number][];
  arrive?: [string, string];
}

export const WEATHER: Record<WeatherKind, WeatherDef> = {
  clear: {
    name: 'Clear', cover: 0.16, rain: 0, storm: 0, fog: 0, wind: 0.72, dur: [150, 280],
    next: [['fair', 0.55], ['cloudy', 0.3], ['mist', 0.15]],
    arrive: ['Clear skies', 'The clouds break apart'],
  },
  fair: {
    name: 'Fair', cover: 0.34, rain: 0, storm: 0, fog: 0, wind: 0.8, dur: [140, 260],
    next: [['clear', 0.35], ['cloudy', 0.45], ['rain', 0.15], ['mist', 0.05]],
  },
  cloudy: {
    name: 'Cloudy', cover: 0.78, rain: 0, storm: 0.05, fog: 0.12, wind: 0.88, dur: [100, 190],
    next: [['fair', 0.35], ['rain', 0.42], ['storm', 0.13], ['clear', 0.1]],
    arrive: ['Clouds gathering', 'The sky turns grey'],
  },
  mist: {
    name: 'Mist', cover: 0.5, rain: 0, storm: 0, fog: 0.9, wind: 0.36, dur: [80, 150],
    next: [['clear', 0.5], ['fair', 0.5]],
    arrive: ['Sea mist', 'A thick mist rolls over the water'],
  },
  rain: {
    name: 'Rain', cover: 0.93, rain: 0.62, storm: 0.18, fog: 0.38, wind: 0.98, dur: [90, 170],
    next: [['cloudy', 0.45], ['storm', 0.35], ['fair', 0.2]],
    arrive: ['Rain', 'Rain sweeps across the islands'],
  },
  storm: {
    name: 'Storm', cover: 1, rain: 1, storm: 1, fog: 0.62, wind: 1.28, dur: [90, 160],
    next: [['rain', 0.7], ['cloudy', 0.3]],
    arrive: ['Storm', 'Thunder rolls in and the seas are building'],
  },
};

/** One full day, in seconds of play. */
export const DAY_LENGTH = 20 * 60;

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const lum = (c: THREE.Vector3) => c.x * 0.2126 + c.y * 0.7152 + c.z * 0.0722;

// palette keyframes, keyed on the sun's height (dir.y)
interface Key {
  s: number;
  zen: [number, number, number];
  hor: [number, number, number];
  fog: [number, number, number];
}
const PALETTE: Key[] = [
  { s: -0.4, zen: [0.0035, 0.0065, 0.018], hor: [0.011, 0.018, 0.036], fog: [0.01, 0.017, 0.032] },
  { s: -0.16, zen: [0.006, 0.014, 0.042], hor: [0.035, 0.045, 0.09], fog: [0.03, 0.04, 0.075] },
  { s: -0.05, zen: [0.022, 0.055, 0.16], hor: [0.34, 0.2, 0.2], fog: [0.2, 0.15, 0.17] },
  { s: 0.03, zen: [0.06, 0.15, 0.38], hor: [0.95, 0.52, 0.3], fog: [0.72, 0.48, 0.38] },
  { s: 0.16, zen: [0.1, 0.27, 0.64], hor: [0.78, 0.72, 0.66], fog: [0.64, 0.64, 0.68] },
  { s: 0.42, zen: [0.11, 0.33, 0.78], hor: [0.63, 0.8, 0.94], fog: [0.55, 0.73, 0.86] },
];

function samplePalette(s: number, zen: THREE.Vector3, hor: THREE.Vector3, fog: THREE.Vector3) {
  const P = PALETTE;
  let i = 0;
  while (i < P.length - 2 && s > P[i + 1].s) i++;
  const a = P[i];
  const b = P[i + 1];
  const t = smooth(a.s, b.s, s);
  zen.set(a.zen[0] + (b.zen[0] - a.zen[0]) * t, a.zen[1] + (b.zen[1] - a.zen[1]) * t, a.zen[2] + (b.zen[2] - a.zen[2]) * t);
  hor.set(a.hor[0] + (b.hor[0] - a.hor[0]) * t, a.hor[1] + (b.hor[1] - a.hor[1]) * t, a.hor[2] + (b.hor[2] - a.hor[2]) * t);
  fog.set(a.fog[0] + (b.fog[0] - a.fog[0]) * t, a.fog[1] + (b.fog[1] - a.fog[1]) * t, a.fog[2] + (b.fog[2] - a.fog[2]) * t);
}

const PEAK = (62 * Math.PI) / 180; // sun's highest elevation
const YAW = 0.5; // swings noon toward the north-west, the way the islands were lit before

function celestial(phi: number, out: THREE.Vector3): THREE.Vector3 {
  // circle through east (phi 0) / overhead-north (phi pi/2) / west (phi pi)
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const x = c;
  const y = Math.sin(PEAK) * s;
  const z = -Math.cos(PEAK) * s;
  return out.set(x * Math.cos(YAW) + z * Math.sin(YAW), y, -x * Math.sin(YAW) + z * Math.cos(YAW)).normalize();
}

const pick = <T>(opts: [T, number][]): T => {
  const sum = opts.reduce((a, o) => a + o[1], 0);
  let r = Math.random() * sum;
  for (const o of opts) if ((r -= o[1]) <= 0) return o[0];
  return opts[opts.length - 1][0];
};

export class Atmosphere {
  /** Fraction of the solar day: 0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset. */
  day = 0.36;
  kind: WeatherKind = 'clear';
  private stateT = 0;
  private stateDur = 0;
  private locked = false;

  // eased weather parameters
  cover = WEATHER.clear.cover;
  rain = 0;
  storm = 0;
  fog = 0;
  wind = WEATHER.clear.wind;
  wet = 0;
  sea = 0; // 0 calm .. ~1.3 storm swell (lags the storm)

  readonly sunDir = new THREE.Vector3();
  readonly moonDir = new THREE.Vector3();
  /** Direction & colour (intensity baked in) of whichever body lights the scene. */
  readonly keyDir = new THREE.Vector3();
  readonly keyColor = new THREE.Vector3();
  readonly zenith = new THREE.Vector3();
  readonly horizon = new THREE.Vector3();
  readonly fogColor = new THREE.Vector3();
  readonly fogRange = new THREE.Vector2(380, 1500);
  night = 0;
  exposure = 1;
  /** Called when the weather turns, with a short title and a line of flavour. */
  onChange: (kind: WeatherKind, title: string, line: string) => void = () => {};

  private dayRef: number;
  private tmp = new THREE.Vector3();

  constructor() {
    this.stateDur = 120 + Math.random() * 80; // the first change comes a couple of minutes in
    // light level of a clear noon, which unlit effects are normalised against
    const z = new THREE.Vector3();
    const h = new THREE.Vector3();
    samplePalette(0.85, z, h, this.tmp);
    this.dayRef = lum(h) * 0.55 + lum(z) * 0.45 + 3.1 * 0.85 * 0.22 * 0.93;

    const q = new URLSearchParams(location.search);
    const hr = parseFloat(q.get('hour') ?? '');
    if (Number.isFinite(hr)) this.day = (((hr / 24) % 1) + 1) % 1;
    const wx = q.get('wx') as WeatherKind | null;
    if (wx && wx in WEATHER) {
      this.setWeather(wx, true);
      this.locked = true;
    }
    this.update(0);
  }

  /** Clock time as hours 0..24. */
  get hour() {
    return this.day * 24;
  }

  setWeather(kind: WeatherKind, instant = false) {
    const d = WEATHER[kind];
    this.kind = kind;
    this.stateT = 0;
    this.stateDur = d.dur[0] + Math.random() * (d.dur[1] - d.dur[0]);
    if (instant) {
      this.cover = d.cover;
      this.rain = d.rain;
      this.storm = d.storm;
      this.fog = d.fog;
      this.wind = d.wind;
      this.wet = Math.min(1, d.rain * 1.6);
      this.sea = this.seaTarget();
    }
  }

  private seaTarget() {
    return this.storm * 1.05 + this.rain * 0.12 + (this.wind - 0.8) * 0.35;
  }

  private nextWeather() {
    const h = this.hour;
    const dawn = h > 3.5 && h < 9;
    const opts = WEATHER[this.kind].next.map(([k, w]) => [k, k === 'mist' ? (dawn ? w * 4 : w * 0.15) : w] as [WeatherKind, number]);
    const k = pick(opts);
    this.setWeather(k);
    const a = WEATHER[k].arrive;
    if (a) this.onChange(k, a[0], a[1]);
  }

  update(dt: number) {
    // ---------------------------------------------------------- clock
    // nights pass a little quicker than days; the whole cycle still takes DAY_LENGTH
    const nightPace = smooth(0.0, -0.2, this.sunDir.y || 0.3);
    this.day = (this.day + (dt / DAY_LENGTH) * (0.9 + 0.42 * nightPace) * 0.955) % 1;

    // ---------------------------------------------------------- weather
    this.stateT += dt;
    if (!this.locked && this.stateT > this.stateDur) this.nextWeather();
    const d = WEATHER[this.kind];
    const ease = (cur: number, to: number, tau: number) => cur + (to - cur) * (1 - Math.exp(-dt / tau));
    this.cover = ease(this.cover, d.cover, 22);
    // rain waits for the clouds to thicken, and stops ahead of them clearing
    this.rain = ease(this.rain, d.rain * smooth(0.6, 0.9, this.cover), 14);
    this.storm = ease(this.storm, d.storm * smooth(0.75, 0.98, this.cover), 26);
    this.fog = ease(this.fog, d.fog, 25);
    this.wind = ease(this.wind, d.wind, 18);
    this.sea = ease(this.sea, this.seaTarget(), 32);
    const wetTo = Math.min(1, this.rain * 1.8);
    this.wet = wetTo > this.wet ? ease(this.wet, wetTo, 7) : ease(this.wet, wetTo, 75); // dries slowly

    // ---------------------------------------------------------- sun & moon
    const phi = (this.day - 0.25) * Math.PI * 2;
    celestial(phi, this.sunDir);
    celestial(phi + Math.PI, this.moonDir);
    this.moonDir.y = Math.abs(this.moonDir.y) * 0.85 + 0.05; // the moon rides a little lower
    this.moonDir.normalize();
    const sy = this.sunDir.y;
    this.night = smooth(0.0, -0.2, sy);

    const sunVis = smooth(-0.03, 0.1, sy);
    const moonVis = smooth(-0.03, -0.14, sy) * smooth(-0.02, 0.12, this.moonDir.y);
    // cloud dims the direct light; a storm deck nearly kills it
    const clouded = (1 - 0.62 * Math.pow(this.cover, 1.5)) * (1 - 0.35 * this.storm);
    if (sy > -0.03) {
      this.keyDir.copy(this.sunDir);
      // sunset red -> golden -> white noon
      const g = smooth(0.0, 0.16, sy);
      const w = smooth(0.12, 0.45, sy);
      const r = 1.0;
      const gg = 0.42 + g * 0.3 + w * 0.18;
      const b = 0.16 + g * 0.29 + w * 0.31;
      const I = 3.1 * sunVis * clouded;
      this.keyColor.set(r * I, gg * I, b * I);
    } else {
      this.keyDir.copy(this.moonDir);
      const I = 0.62 * moonVis * clouded;
      this.keyColor.set(0.55 * I, 0.68 * I, 1.0 * I);
    }

    // ---------------------------------------------------------- sky & fog
    samplePalette(sy, this.zenith, this.horizon, this.fogColor);
    const c = Math.pow(this.cover, 1.25) * 0.94;
    if (c > 0.001) {
      const L = lum(this.horizon);
      const dim = 1 - 0.55 * this.storm;
      // an overcast sky is a flat grey that keeps a little of the hour's tint
      const ov = (dst: THREE.Vector3, k: number) => {
        const l = L * k * dim;
        const tint = 0.18;
        dst.set(
          dst.x * tint + l * 0.8 * (1 - tint),
          dst.y * tint + l * 0.85 * (1 - tint),
          dst.z * tint + l * 0.93 * (1 - tint),
        );
      };
      const z = this.tmp.copy(this.zenith);
      ov(z, 0.78);
      this.zenith.lerp(z, c);
      const h = this.tmp.copy(this.horizon);
      ov(h, 0.86);
      this.horizon.lerp(h, c);
      const f = this.tmp.copy(this.fogColor);
      ov(f, 0.92);
      this.fogColor.lerp(f, c);
    }
    // mist glows with whatever light there is
    if (this.fog > 0.01) this.fogColor.lerp(this.tmp.copy(this.horizon).multiplyScalar(1.02), this.fog * 0.5);
    const fogAmt = this.fog;
    this.fogRange.set(380 * (1 - 0.62 * fogAmt), 1500 * (1 - 0.56 * fogAmt));

    // ---------------------------------------------------------- exposure & ambient
    this.exposure = (1 + 1.15 * this.night) * (1 + 0.16 * this.cover) * (1 + 0.12 * this.storm);
    const key = Math.max(this.keyDir.y, 0) * 0.22;
    const ref = this.dayRef;
    const tintR = (this.horizon.x * 0.55 + this.zenith.x * 0.45 + this.keyColor.x * key) / ref;
    const tintG = (this.horizon.y * 0.55 + this.zenith.y * 0.45 + this.keyColor.y * key) / ref;
    const tintB = (this.horizon.z * 0.55 + this.zenith.z * 0.45 + this.keyColor.z * key) / ref;

    // ---------------------------------------------------------- uniforms
    const u = globalUniforms;
    u.uSunDir.value.copy(this.keyDir);
    u.uSunColor.value.copy(this.keyColor);
    u.uSkyZenith.value.copy(this.zenith);
    u.uSkyHorizon.value.copy(this.horizon);
    u.uFogColor.value.copy(this.fogColor);
    u.uFogRange.value.copy(this.fogRange);
    u.uLight.value.set(Math.min(tintR, 1.3), Math.min(tintG, 1.3), Math.min(tintB, 1.3));
    u.uNight.value = this.night;
    u.uCloudCover.value = this.cover;
    u.uRain.value = this.rain;
    u.uStorm.value = this.storm;
    u.uWet.value = this.wet;
    const hazeK = 1 - 0.85 * this.cover;
    if (sy > -0.03) {
      const g = smooth(0.0, 0.3, sy);
      u.uHaze.value.set(1, 0.55 + 0.25 * g, 0.25 + 0.3 * g).multiplyScalar(sunVis * hazeK);
    } else {
      u.uHaze.value.set(0.3, 0.38, 0.55).multiplyScalar(0.35 * moonVis * hazeK);
    }
  }
}
