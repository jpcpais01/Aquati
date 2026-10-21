import * as THREE from 'three';
import { realMoonPhase } from '../render/nightSky';
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
//
// And now and then something rarer: a mirror calm (mostly at dawn), a very hot
// noon out on the high seas whose shimmer conjures mirages, and ember rain
// wherever the wind carries a restless volcano's ash (an overlay on whatever
// weather is about, see ashTo).

export type WeatherKind = 'clear' | 'fair' | 'cloudy' | 'mist' | 'rain' | 'storm' | 'calm' | 'hot' | 'embers';

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
    name: 'Clear', cover: 0.2, rain: 0, storm: 0, fog: 0, wind: 0.72, dur: [150, 280],
    next: [['fair', 0.55], ['cloudy', 0.3], ['mist', 0.15]],
    arrive: ['Clear skies', 'The clouds break apart'],
  },
  fair: {
    name: 'Fair', cover: 0.34, rain: 0, storm: 0, fog: 0, wind: 0.8, dur: [140, 260],
    next: [['clear', 0.35], ['cloudy', 0.45], ['rain', 0.15], ['mist', 0.05]],
  },
  cloudy: {
    name: 'Cloudy', cover: 0.66, rain: 0, storm: 0.05, fog: 0.12, wind: 0.88, dur: [100, 190],
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
  // never in the chain's own lists: rolled once a dawn / night / spell of the
  // day (see rollRare), the wind dies and the sea goes to glass
  calm: {
    name: 'Mirror calm', cover: 0.26, rain: 0, storm: 0, fog: 0.14, wind: 0.12, dur: [170, 270],
    next: [['clear', 0.45], ['fair', 0.4], ['mist', 0.15]],
    arrive: ['Mirror calm', 'The wind dies away and the sea turns to glass'],
  },
  // only at noon on the high seas (one noon in twenty)
  hot: {
    name: 'Very hot', cover: 0.03, rain: 0, storm: 0, fog: 0.12, wind: 0.5, dur: [150, 230],
    next: [['clear', 0.6], ['fair', 0.4]],
    arrive: ['Very hot', 'The sun blazes down, the air shimmers and the lookout starts seeing things'],
  },
  // picked by hand (or ?wx=embers); out at sea it comes from a volcano's plume instead
  embers: {
    name: 'Ember rain', cover: 0.5, rain: 0, storm: 0, fog: 0.16, wind: 0.85, dur: [120, 200],
    next: [['cloudy', 0.5], ['fair', 0.5]],
    arrive: ['Ember rain', 'Warm ash and glowing embers drift down on the wind'],
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
  { s: -0.4, zen: [0.006, 0.011, 0.03], hor: [0.017, 0.028, 0.056], fog: [0.015, 0.025, 0.048] },
  { s: -0.16, zen: [0.008, 0.018, 0.05], hor: [0.04, 0.05, 0.1], fog: [0.034, 0.045, 0.085] },
  { s: -0.05, zen: [0.06, 0.05, 0.15], hor: [0.34, 0.2, 0.2], fog: [0.2, 0.15, 0.17] },
  { s: 0.03, zen: [0.2, 0.15, 0.32], hor: [0.95, 0.52, 0.3], fog: [0.72, 0.48, 0.38] },
  { s: 0.16, zen: [0.15, 0.26, 0.56], hor: [0.78, 0.72, 0.66], fog: [0.64, 0.64, 0.68] },
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

/** Clear-noon sun intensity. */
const SUN_I = 3.45;

const PEAK = (40 * Math.PI) / 180; // sun's highest elevation
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

/**
 * How fast the clock runs at a given time of day: the golden hours and the
 * twilight linger, the deep night passes a little quicker.
 */
function pace(day: number): number {
  const sy = Math.sin(PEAK) * Math.sin((day - 0.25) * Math.PI * 2);
  const twilight = 1 - smooth(0.04, 0.24, Math.abs(sy + 0.05));
  const night = smooth(-0.05, -0.3, sy);
  return 1 - 0.55 * twilight + 0.4 * night;
}
// normalise so a whole day still takes DAY_LENGTH
const PACE_NORM = (() => {
  let t = 0;
  const n = 2000;
  for (let i = 0; i < n; i++) t += 1 / pace(i / n) / n;
  return t;
})();

// the sky turns about the axis of the sun's daily circle: the stars wheel
// round its pole through the night, rising and setting just as the sun does
const POLE = new THREE.Vector3().crossVectors(celestial(0, new THREE.Vector3()), celestial(Math.PI / 2, new THREE.Vector3())).normalize();
/** Due east on the horizon, where the sun comes up. */
const EAST = celestial(0, new THREE.Vector3());
const _rot = new THREE.Matrix4();
const _t = new THREE.Vector3();

const pick = <T>(opts: [T, number][]): T => {
  const sum = opts.reduce((a, o) => a + o[1], 0);
  let r = Math.random() * sum;
  for (const o of opts) if ((r -= o[1]) <= 0) return o[0];
  return opts[opts.length - 1][0];
};

const MODE_KEY = 'aquati.weather';
const TIME_KEY = 'aquati.time';

export const TIMES = {
  dawn: { name: 'Dawn', hour: 6.3 },
  noon: { name: 'Noon', hour: 12.5 },
  golden: { name: 'Golden hour', hour: 17.7 },
  dusk: { name: 'Dusk', hour: 19.3 },
  night: { name: 'Night', hour: 23 },
};
export type TimeMode = keyof typeof TIMES | 'auto';

export interface AtmosSnapshot {
  day: number;
  kind: WeatherKind;
  cover: number;
  rain: number;
  storm: number;
  fog: number;
  wind: number;
  wet: number;
  sea: number;
  calm: number;
  heat: number;
  ash: number;
}

/** The prevailing wind: the heading the weather keeps bringing it back toward. */
export const WIND_HOME = 1.25;

const POINTS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
/** Eight-point compass name of the quarter a wind with this heading blows from (map up = north = -z). */
export function compass(angle: number) {
  const from = -angle; // bearing of the source, clockwise from north
  const i = Math.round(from / (Math.PI / 4));
  return POINTS[((i % 8) + 8) % 8];
}

export class Atmosphere {
  /** Fraction of the solar day: 0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset. */
  day = 0.36;
  kind: WeatherKind = 'clear';
  private stateT = 0;
  private stateDur = 0;
  private locked = false;
  /** 'auto' lets the weather turn on its own; a kind holds it there. */
  mode: WeatherKind | 'auto' = 'auto';
  /** Keeps the current weather from moving on (a storm holds while the Kraken is up). */
  hold = false;
  /**
   * Which waters' weather comes next: the Fortunate Isles', the misty isles'
   * (sea mist at any hour, more rain) or the high seas' (fair and settled).
   */
  climate: 'home' | 'mist' | 'open' = 'home';
  /** Speeds up the blend for a moment after the player picks the weather by hand. */
  private rush = 0;
  /** 'auto' lets the day run; any other hour holds the clock there. */
  timeMode: TimeMode = 'auto';

  // eased weather parameters
  cover = WEATHER.clear.cover;
  rain = 0;
  storm = 0;
  fog = 0;
  wind = WEATHER.clear.wind;
  wet = 0;
  sea = 0; // 0 calm .. ~1.3 storm swell (lags the storm)
  /** 0 .. 1 a mirror calm: the swell all but gone, the sea a looking glass. */
  calm = 0;
  /** 0 .. 1 a very hot noon: bleached sky, shimmering air, mirages. */
  heat = 0;
  /** 0 .. 1 ash and embers in the air, the sky gone red. */
  ash = 0;
  /** Ash the volcanoes' plumes put in the air round the ship (set by the game, 0 .. 1). */
  ashTo = 0;
  /** How brightly the sea-spark blooms glow tonight (0 by day, see world/seaGlow.ts). */
  glow = 0;
  /** The stretch of the day the last rare-weather roll was for, and the next weather it picked. */
  private period = '';
  private rare: WeatherKind | null = null;

  // wind heading: the bearing the wind blows toward (x = sin, z = cos). Never
  // wrapped, so it eases (and the HUD arrow turns) the short way round.
  windAngle = WIND_HOME;
  /** Where the wind is settling to; it swings round to this over half a minute or so. */
  windTo = WIND_HOME;
  private veerT = 0;
  private veerDur = 100 + Math.random() * 120;
  private shiftNote = -1;

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
  /** Sun shafts: the lit haze colour (rgb, 0 none) and the glow lit haze adds on its own (w). */
  readonly shaftAir = new THREE.Vector4(0, 0, 0, 0.12);
  /** Colour of the beams swaying down through the shallows. */
  readonly shaftSea = new THREE.Vector3();
  /** Haze extinction at sea level (1/m), thicker on a misty morning; and how dark its shaded columns read. */
  readonly shaftHaze = new THREE.Vector2(0.0014, 3);
  /** The grade by the hour: split-tone tints for shade and light, and saturation. */
  readonly gradeLo = new THREE.Vector3(0.94, 1.02, 1.06);
  readonly gradeHi = new THREE.Vector3(1.05, 1.0, 0.94);
  gradeSat = 1.12;
  /** How hard the frame's corners fall away: a storm closes in round the ship. */
  vignette = 0.55;
  /**
   * Weather lying on the water (see veilAt in GLSL): density at sea level
   * (1/m), height scale (m), patchiness, drift speed (m/s).
   */
  readonly veil = new THREE.Vector4(0, 20, 0, 0);
  /** Called when the weather turns, with a short title and a line of flavour. */
  onChange: (kind: WeatherKind, title: string, line: string) => void = () => {};
  /** Called as a marked wind shift gets under way, with a title and a line naming where it now blows from. */
  onWindShift: (title: string, line: string) => void = () => {};

  /** The moon's phase, 0 new .. 0.5 full: tonight's real moon, then a step on every night of play. */
  moonPhase = realMoonPhase();
  /** How lit the moon's disc is, 0 new .. 1 full. */
  moonLit = 1;

  private dayRef: number;
  private tmp = new THREE.Vector3();

  constructor() {
    this.stateDur = 120 + Math.random() * 80; // the first change comes a couple of minutes in
    // light level of a clear noon, which unlit effects are normalised against
    const z = new THREE.Vector3();
    const h = new THREE.Vector3();
    samplePalette(0.85, z, h, this.tmp);
    this.dayRef = lum(h) * 0.55 + lum(z) * 0.45 + SUN_I * 0.85 * 0.22 * 0.93;

    const q = new URLSearchParams(location.search);
    const hr = parseFloat(q.get('hour') ?? '');
    let savedT: string | null = null;
    try {
      savedT = localStorage.getItem(TIME_KEY);
    } catch {}
    if (Number.isFinite(hr)) this.day = (((hr / 24) % 1) + 1) % 1;
    else if (savedT && savedT in TIMES) {
      this.timeMode = savedT as TimeMode;
      this.day = TIMES[this.timeMode as Exclude<TimeMode, 'auto'>].hour / 24;
    }
    const wx = q.get('wx') as WeatherKind | null;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(MODE_KEY);
    } catch {}
    if (wx && wx in WEATHER) {
      this.setWeather(wx, true);
      this.locked = true;
      this.mode = wx;
    } else if (saved && saved in WEATHER) {
      this.mode = saved as WeatherKind;
      this.setWeather(this.mode, true);
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
      this.calm = kind === 'calm' ? 1 : 0;
      this.heat = kind === 'hot' ? 1 : 0;
      this.ash = kind === 'embers' ? 1 : 0;
    }
  }

  /**
   * Sends the wind round to a new heading, up to `span` radians either way.
   * It wanders about its prevailing direction rather than drifting off for good.
   * Shifts big enough to notice are announced `note` seconds later.
   */
  private shiftWind(span: number, note: number) {
    this.veerT = 0;
    this.veerDur = (90 + Math.random() * 150) * (1 - this.storm * 0.55);
    const off = this.windTo - WIND_HOME;
    let dir = Math.random() < 0.5 ? -1 : 1;
    if (Math.abs(off) > 1.2 && Math.random() < 0.8) dir = -Math.sign(off);
    const turn = dir * span * (0.45 + Math.random() * 0.55);
    this.windTo += turn;
    if (Math.abs(turn) > 0.3) this.shiftNote = note;
  }

  /** Picks the weather by hand ('auto' hands it back to nature) and blends to it quickly. */
  setMode(m: WeatherKind | 'auto') {
    this.mode = m;
    this.locked = m !== 'auto';
    if (m !== 'auto') this.setWeather(m);
    if (m === 'storm') this.shiftWind(1.2, 4);
    else this.stateDur = Math.min(this.stateDur, this.stateT + 60 + Math.random() * 60);
    this.rush = 1;
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {}
  }

  /** Everything photo mode may change, so leaving it puts the sky back exactly as it was. */
  snapshot(): AtmosSnapshot {
    return {
      day: this.day, kind: this.kind, cover: this.cover, rain: this.rain, storm: this.storm, fog: this.fog, wind: this.wind, wet: this.wet, sea: this.sea,
      calm: this.calm, heat: this.heat, ash: this.ash,
    };
  }

  restore(s: AtmosSnapshot) {
    Object.assign(this, s);
    this.update(0);
  }

  /**
   * Photo mode's sky: a clock time and, unless null (the sky as it was), a
   * weather settled in at once. The sea keeps the swell it had, since the
   * frozen ships still float on those waves.
   */
  preview(base: AtmosSnapshot, hour: number, kind: WeatherKind | null) {
    this.day = (((hour / 24) % 1) + 1) % 1;
    const d = kind ? WEATHER[kind] : null;
    this.kind = kind ?? base.kind;
    this.cover = d ? d.cover : base.cover;
    this.rain = d ? d.rain : base.rain;
    this.storm = d ? d.storm : base.storm;
    this.fog = d ? d.fog : base.fog;
    this.wind = d ? d.wind : base.wind;
    this.wet = d ? Math.min(1, d.rain * 1.6) : base.wet;
    this.sea = base.sea;
    this.calm = d ? (kind === 'calm' ? 1 : 0) : base.calm;
    this.heat = d ? (kind === 'hot' ? 1 : 0) : base.heat;
    this.ash = d ? (kind === 'embers' ? 1 : 0) : base.ash;
    this.update(0);
  }

  /** A guest's sky in a shared sea: the host's clock, weather and wind (see net/coop.ts). */
  private following = false;
  private followRun = true;

  /** Keeps to the host's sky: the clock eased (or set, if far off), the weather turned, the wind sent round. */
  follow(day: number, kind: WeatherKind, windTo: number, run: boolean) {
    this.following = true;
    this.followRun = run;
    const dd = ((day - this.day + 1.5) % 1) - 0.5;
    this.day = Math.abs(dd) > 0.02 ? day : (this.day + dd * 0.5 + 1) % 1;
    if (kind !== this.kind && kind in WEATHER) {
      this.setWeather(kind);
      const a = WEATHER[kind].arrive;
      if (a) this.onChange(kind, a[0], a[1]);
    }
    if (Number.isFinite(windTo)) this.windTo = windTo;
  }

  /** The guest sails alone again: their own sky. */
  unfollow() {
    this.following = false;
  }

  /** Holds the clock at a chosen hour ('auto' lets the day run again). */
  setTimeMode(m: TimeMode) {
    this.timeMode = m;
    try {
      localStorage.setItem(TIME_KEY, m);
    } catch {}
  }

  private seaTarget() {
    return this.storm * 1.05 + this.rain * 0.12 + (this.wind - 0.8) * 0.35;
  }

  private nextWeather() {
    const h = this.hour;
    const dawn = h > 3.5 && h < 9;
    const c = this.climate;
    const opts = WEATHER[this.kind].next.map(([k, w]) => {
      if (k === 'mist') w *= c === 'mist' ? (dawn ? 5 : 2.2) : dawn ? 4 : 0.15;
      if (c === 'mist' && (k === 'rain' || k === 'cloudy')) w *= 1.4;
      if (c === 'open') w *= k === 'storm' ? 0.2 : k === 'rain' ? 0.35 : k === 'cloudy' ? 0.7 : k === 'mist' ? 0.5 : 1.6;
      return [k, w] as [WeatherKind, number];
    });
    // (a scorching noon that the ship sailed back in among the islands from, or that came too late, is off)
    if (this.rare === 'hot' && (this.climate !== 'open' || this.period !== 'noon')) this.rare = null;
    const k = this.rare ?? pick(opts);
    this.rare = null;
    this.setWeather(k);
    // a change of weather brings the wind round with it: hardest into a storm
    this.shiftWind(k === 'storm' ? 1.7 : k === 'rain' ? 1.15 : k === 'mist' || k === 'calm' ? 0.4 : 0.8, 6);
    const a = WEATHER[k].arrive;
    if (a) this.onChange(k, a[0], a[1]);
  }

  /**
   * The rare weathers, rolled once as each stretch of the day begins: a
   * mirror calm comes with one dawn in five, one night in ten and one spell of
   * the day in twenty; a very hot noon only out on the high seas, one in twenty.
   * A hit brings the weather round to it within half a minute or so.
   */
  private rollRare(per: string) {
    if (this.locked || this.following) return;
    if (per === 'noon' && this.climate === 'open' && Math.random() < 0.05) this.rare = 'hot';
    else if (this.kind !== 'storm' && Math.random() < (per === 'dawn' ? 0.2 : per === 'night' ? 0.1 : 0.05)) this.rare = 'calm';
    else return;
    this.hasten(4 + Math.random() * 22);
  }

  /** Brings the next turn of the weather within `s` seconds (out onto the calm of the high seas). */
  hasten(s: number) {
    this.stateDur = Math.min(this.stateDur, this.stateT + s);
  }

  update(dt: number) {
    // ---------------------------------------------------------- clock
    const was = this.day;
    if (this.following) {
      if (this.followRun) this.day = (this.day + (dt / DAY_LENGTH) * pace(this.day) * PACE_NORM) % 1;
    } else if (this.timeMode === 'auto') this.day = (this.day + (dt / DAY_LENGTH) * pace(this.day) * PACE_NORM) % 1;
    else {
      // sweep forward to the chosen hour, so the sun travels there rather than jumping
      const to = TIMES[this.timeMode].hour / 24;
      const left = (to - this.day + 1) % 1;
      if (left > 1e-4) this.day = (this.day + Math.min(left, Math.max(left * 0.9, 0.02) * dt)) % 1;
    }

    // the moon waxes and wanes an eighth of its month each day that passes (any way the clock moves forward)
    let dd = this.day - was;
    if (dd < 0) dd += 1;
    if (dt > 0 && dd < 0.5) this.moonPhase = (this.moonPhase + dd / 8) % 1;

    // ---------------------------------------------------------- weather
    const hr = this.hour;
    const per = hr >= 4.8 && hr < 8.5 ? 'dawn' : hr >= 11 && hr < 14 ? 'noon' : hr >= 20.5 || hr < 4.8 ? 'night' : hr < 11 ? 'morning' : 'afternoon';
    if (per !== this.period) {
      this.period = per;
      if (dt > 0) this.rollRare(per);
    }
    // the great heat only lasts the noon, and only out where no land cools the air
    if (this.kind === 'hot' && !this.locked && (per !== 'noon' || this.climate !== 'open')) this.hasten(20);
    this.stateT += dt;
    if (!this.locked && !this.hold && !this.following && this.stateT > this.stateDur) this.nextWeather();
    const d = WEATHER[this.kind];
    // a hand-picked change rolls in over a few seconds instead of half a minute
    this.rush = Math.max(0, this.rush - dt / 12);
    const fast = 1 + this.rush * 7;
    const ease = (cur: number, to: number, tau: number) => cur + (to - cur) * (1 - Math.exp((-dt * fast) / tau));
    this.cover = ease(this.cover, d.cover, 22);
    // rain waits for the clouds to thicken, and stops ahead of them clearing
    this.rain = ease(this.rain, d.rain * smooth(0.6, 0.9, this.cover), 14);
    this.storm = ease(this.storm, d.storm * smooth(0.75, 0.98, this.cover), 26);
    this.fog = ease(this.fog, d.fog, 25);
    this.wind = ease(this.wind, d.wind, 18);
    this.sea = ease(this.sea, this.seaTarget(), 32);
    this.calm = ease(this.calm, this.kind === 'calm' ? 1 : 0, 20);
    this.heat = ease(this.heat, this.kind === 'hot' ? 1 : 0, 22);
    // rain washes the ash out of the air
    this.ash = ease(this.ash, Math.max(this.kind === 'embers' ? 1 : 0, this.ashTo) * (1 - 0.7 * this.rain), 9);

    // ---------------------------------------------------------- wind heading
    // now and then the breeze veers or backs; squalls shove it about more often
    this.veerT += dt;
    if (this.veerT > this.veerDur && !this.following) this.shiftWind(0.35 + this.storm * 0.6 + this.rain * 0.2, 0);
    // swing round to the new heading: a slow start and settle, never faster than a few degrees a second
    const left = this.windTo - this.windAngle;
    const maxRate = (0.045 + this.storm * 0.05) * fast;
    this.windAngle += Math.sign(left) * Math.min(Math.abs(left) * (1 - Math.exp((-dt * fast) / 14)), maxRate * dt);
    if (this.shiftNote >= 0 && (this.shiftNote -= dt) < 0) {
      const veer = this.windTo < this.windAngle; // bearing turning clockwise on the compass
      this.onWindShift(veer ? 'The wind veers' : 'The wind backs', `Now blowing from the ${compass(this.windTo)}`);
    }
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
      const I = SUN_I * sunVis * clouded * (1 + 0.14 * this.heat);
      this.keyColor.set(r * I, gg * I, b * I);
    } else {
      this.keyDir.copy(this.moonDir);
      // a thin moon lights the sea less (never so little the night can't be sailed)
      const I = 0.62 * moonVis * clouded * (0.72 + 0.28 * this.moonLit);
      this.keyColor.set(0.55 * I, 0.68 * I, 1.0 * I);
    }
    // through a pall of ash the light comes dim and coppery
    if (this.ash > 0.001) {
      const a = this.ash;
      this.keyColor.set(this.keyColor.x * (1 - 0.3 * a), this.keyColor.y * (1 - 0.5 * a), this.keyColor.z * (1 - 0.66 * a));
    }

    // ---------------------------------------------------------- sky & fog
    samplePalette(sy, this.zenith, this.horizon, this.fogColor);
    // the open sky between the clouds stays blue: the dome draws the clouds
    // themselves, so only a closing deck greys the whole sky over
    const c = smooth(0.45, 1.0, this.cover) * 0.94;
    if (c > 0.001) {
      const L = lum(this.horizon);
      const dim = 1 - 0.6 * this.storm;
      // an overcast sky is a flat grey that keeps a little of the hour's tint;
      // a storm's is a colder, deeper slate blue
      const st = this.storm;
      const gr = 0.8 - 0.08 * st;
      const gg = 0.85 - 0.02 * st;
      const gb = 0.93 + 0.04 * st;
      const ov = (dst: THREE.Vector3, k: number) => {
        const l = L * k * dim;
        const tint = 0.18 * (1 - 0.65 * st);
        dst.set(
          dst.x * tint + l * gr * (1 - tint),
          dst.y * tint + l * gg * (1 - tint),
          dst.z * tint + l * gb * (1 - tint),
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
    // a scorching noon bleaches the horizon to a white-hot glare under a deep blue crown
    if (this.heat > 0.001) {
      const k = this.heat * sunVis;
      const L = lum(this.horizon) * 1.22;
      this.horizon.lerp(this.tmp.set(L * 1.02, L * 0.97, L * 0.86), k * 0.6);
      this.fogColor.lerp(this.tmp.set(L * 0.97, L * 0.94, L * 0.86), k * 0.55);
      this.zenith.multiply(this.tmp.set(1 - 0.12 * k, 1 - 0.02 * k, 1 + 0.06 * k));
    }
    // ash: the sky goes rust and smoulder, and after dark the pall glows a dull red from below
    if (this.ash > 0.001) {
      const a = this.ash * 0.8;
      const Lh = lum(this.horizon);
      const Lz = lum(this.zenith);
      const glow = this.night * 0.06;
      this.horizon.lerp(this.tmp.set(Lh * 1.5 + glow, Lh * 0.7 + glow * 0.28, Lh * 0.42 + glow * 0.1), a);
      this.fogColor.lerp(this.tmp.set(Lh * 1.3 + glow * 0.8, Lh * 0.68 + glow * 0.2, Lh * 0.48 + glow * 0.08), a);
      this.zenith.lerp(this.tmp.set(Lz * 1.05 + glow * 0.4, Lz * 0.6 + glow * 0.1, Lz * 0.52), a * 0.85);
    }
    // mist glows with whatever light there is
    if (this.fog > 0.01) this.fogColor.lerp(this.tmp.copy(this.horizon).multiplyScalar(1.02), this.fog * 0.5);
    // the far air thickens a little; the weather on the water itself is the veil below
    const fogAmt = Math.max(this.fog, this.ash * 0.3);
    this.fogRange.set(380 * (1 - 0.55 * fogAmt), 1500 * (1 - 0.5 * fogAmt));
    // Low weather on the sea. Sea mist lies in shallow banks with clear water
    // between them, drifting slowly; rain hangs in tall curtains that sweep by
    // on the wind; a storm's are darker, denser and quicker still.
    const mistK = smooth(0.4, 0.9, this.fog) * (1 - this.rain);
    const rainK = this.rain;
    const lowK = 0.1 * smooth(0.45, 1, this.cover);
    // ash hangs in drifting smoky banks; a hot noon in a thin shimmering haze on the water
    const ashK = this.ash * 0.6;
    const heatK = this.heat * 0.25;
    const veilSum = mistK + rainK + lowK + ashK + heatK + 1e-4;
    this.veil.set(
      mistK * 0.012 + rainK * 0.0026 + this.storm * 0.0012 + lowK * 0.004 + ashK * 0.0022 + heatK * 0.0016,
      (mistK * 15 + rainK * 58 + lowK * 40 + ashK * 50 + heatK * 9) / veilSum,
      0.4 + 0.58 * ((mistK + ashK * 0.6) / veilSum),
      1.2 + this.wind * 2.5 + this.storm * 7,
    );

    // ---------------------------------------------------------- exposure & ambient
    // a grey day is lifted a little; a storm is let fall darker and moodier
    this.exposure = (1 + 1.3 * this.night) * (1 + 0.16 * this.cover) * (1 - 0.1 * this.storm * (1 - this.night)) * (1 + 0.05 * this.heat);
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
    u.uMist.value = this.fog;
    u.uVeil.value.copy(this.veil);
    // the sea-spark blooms light up on a dark night (a gale breaks them up)
    this.glow = smooth(0.3, 0.85, this.night) * (1 - 0.7 * this.storm);
    u.uSpecial.value.set(this.calm, this.glow, this.heat, this.ash);
    this.updateLook(sy, sunVis);
    const hazeK = 1 - 0.85 * this.cover;
    if (sy > -0.03) {
      const g = smooth(0.0, 0.3, sy);
      u.uHaze.value.set(1, 0.55 + 0.25 * g - 0.25 * this.ash, 0.25 + 0.3 * g - 0.2 * this.ash).multiplyScalar(sunVis * hazeK * (1 + 0.9 * this.heat));
    } else {
      u.uHaze.value.set(0.3, 0.38, 0.55).multiplyScalar(0.3 * moonVis * hazeK * (0.35 + 0.65 * this.moonLit));
    }
    this.updateNightSky(sy, clouded);
  }

  /** The star sphere's turn, and the moon: where it stands, how much shows, its phase. */
  private updateNightSky(sy: number, clouded: number) {
    const u = globalUniforms;
    // the stars keep pace with the sun, so the same stars rise at the same hour every night
    const phi = (this.day - 0.25) * Math.PI * 2;
    u.uStarRot.value.setFromMatrix4(_rot.makeRotationAxis(POLE, -phi));
    // the phase as the angle sun-moon-us: 0 full, pi new
    const a = Math.abs(1 - 2 * this.moonPhase) * Math.PI;
    this.moonLit = (1 + Math.cos(a)) / 2;
    // the lit limb faces the sun below the horizon: west of a waxing evening
    // moon, east of a waning morning one
    const m = this.moonDir;
    _t.copy(EAST).multiplyScalar(this.moonPhase < 0.5 ? -1 : 1);
    _t.y -= 0.6;
    _t.addScaledVector(m, -_t.dot(m)).normalize();
    u.uMoonLight.value.set(-m.x * Math.cos(a) + _t.x * Math.sin(a), -m.y * Math.cos(a) + _t.y * Math.sin(a), -m.z * Math.cos(a) + _t.z * Math.sin(a), this.moonLit);
    // it comes out as the sun goes down, a pale ghost in the dusk, and hides behind a closing sky
    const show = smooth(0.08, -0.08, sy) * smooth(-0.02, 0.08, m.y) * (0.25 + 0.75 * clouded);
    u.uMoon.value.set(m.x, m.y, m.z, show);
  }

  /** Sun shafts and the grade, from the hour and the weather. */
  private updateLook(sy: number, sunVis: number) {
    const k = this.keyColor;
    // beams want gaps: a few puffs on a clear day give a few, a broken sky the
    // most, a closed grey deck none. Mist thickens the air they show in.
    const broken = 0.35 + 0.65 * smooth(0.05, 0.4, this.cover) * smooth(0.95, 0.62, this.cover);
    const open = (1 - this.storm * 0.85) * (1 - this.rain * 0.5);
    const lowSun = 1 + 0.6 * smooth(0.45, 0.08, sy) * sunVis; // long golden shafts at either end of the day
    const amt = broken * open * lowSun * (sy > -0.03 ? 0.6 : 0.5);
    // the haze glows a little warmer than the light itself: it scatters the
    // sun's red end forward (cool and faint by moonlight)
    this.shaftAir.set(k.x * amt * 1.06, k.y * amt, k.z * amt * 0.9, 0.05);
    this.shaftHaze.set(0.0014 * (1 + this.fog * 2.5 + this.wet * 0.5 + this.ash * 2), 10 * amt);
    // in the shallows: sunlight through clear water, killed by a grey sky
    const sea = (1 - smooth(0.55, 0.95, this.cover)) * (1 - this.storm);
    this.shaftSea.set(k.x * 0.36, k.y * 0.84, k.z * 0.8).multiplyScalar(sea * (sy > -0.03 ? 1 : 0.6));

    // the grade: crisp at noon, honeyed with violet shade at the golden hours,
    // cool and blue after dark, flat and grey under a storm
    const golden = smooth(-0.06, 0.04, sy) * smooth(0.36, 0.1, sy) * sunVis;
    const dusk = smooth(0.06, -0.12, sy) * (1 - this.night * 0.5);
    const grey = Math.max(this.storm * 0.85, smooth(0.45, 1, this.cover) * 0.55, this.rain * 0.5, this.fog * 0.3);
    const lo = this.gradeLo.set(0.94, 1.02, 1.06);
    const hi = this.gradeHi.set(1.05, 1.0, 0.94);
    let sat = 1.12;
    lo.lerp(_lo.set(0.93, 0.95, 1.1), golden);
    hi.lerp(_hi.set(1.12, 1.0, 0.84), golden);
    sat += golden * 0.08;
    lo.lerp(_lo.set(0.9, 0.97, 1.12), Math.max(dusk, this.night));
    hi.lerp(_hi.set(0.97, 1.0, 1.06), Math.max(dusk, this.night));
    sat -= this.night * 0.05;
    lo.lerp(_lo.set(0.97, 1.0, 1.03), grey);
    hi.lerp(_hi.set(1.0, 1.0, 0.99), grey);
    sat -= grey * 0.16;
    // a storm's shade goes cold teal and its lights steely: moody, not merely grey
    lo.lerp(_lo.set(0.9, 1.0, 1.07), this.storm * (1 - this.night * 0.6));
    hi.lerp(_hi.set(0.98, 1.0, 1.02), this.storm);
    // mist softens the light into a pearly glow
    lo.lerp(_lo.set(0.98, 1.0, 1.04), this.fog * (1 - this.rain) * 0.6);
    hi.lerp(_hi.set(1.06, 1.02, 0.97), this.fog * (1 - this.rain) * golden * 0.8);
    // a scorching noon: blown, honeyed highlights and a little colour burnt out of it
    hi.lerp(_hi.set(1.1, 1.02, 0.86), this.heat * 0.7);
    lo.lerp(_lo.set(1.0, 0.99, 0.98), this.heat * 0.5);
    sat -= this.heat * 0.05;
    // ash: smouldering copper light, plum-brown shade
    lo.lerp(_lo.set(0.98, 0.9, 0.93), this.ash * 0.7);
    hi.lerp(_hi.set(1.15, 0.95, 0.78), this.ash * 0.75);
    // a glassy calm: soft pastel light
    sat += this.calm * 0.04;
    this.gradeSat = sat;
    this.vignette = 0.55 + this.storm * 0.4 + this.rain * 0.12 + this.fog * 0.1 + this.ash * 0.14;
  }
}

const _lo = new THREE.Vector3();
const _hi = new THREE.Vector3();
