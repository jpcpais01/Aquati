import * as THREE from 'three';
import { globalUniforms } from '../render/environment';
import { smoothstep } from '../core/noise';
import type { FireworkId } from '../game/fireworks';

// Feast nights. Every trading port keeps its own feast, one night in three,
// and on the full moon every port in the isles keeps one at once. From dusk
// the quay is strung with paper lanterns that light one after another, the
// townsfolk dance, the band strikes up, paper-lantern boats are set down on
// the water to drift out to sea, and through the middle of the night the
// lighthouse sends fireworks up over the harbour, with a grand finale at
// midnight. This file holds the calendar and the lantern strings; the show
// itself is run by `Festivals` (fireworks, lantern boats, the band).

export interface Feast {
  /** The feast's own name, as the town calls it. */
  name: string;
  /** A line of flavour for the toast and the market. */
  line: string;
  /** Paper colours for the lanterns (sRGB hex). */
  colors: number[];
  /** The shells the town likes best. */
  shells: FireworkId[];
}

/** One feast per trading port, in TRADE_SPECS order. */
export const FEASTS: Feast[] = [
  { name: 'The Spice Feast', line: 'Saffron lanterns and pepper-red rockets over the harbour', colors: [0xff7a2a, 0xffc34d, 0xe8342a, 0xff9a5a, 0xfff0c8], shells: ['palm', 'chrysanthemum', 'crackle', 'peony'] },
  { name: 'Gold Night', line: 'The counting house lights the whole quay in gold', colors: [0xffd263, 0xfff0c0, 0xffb347, 0x7fb0ff, 0xffe9a0], shells: ['willow', 'peony', 'ring', 'strobe'] },
  { name: 'Night of the Coral Saints', line: 'Pink lanterns and paper boats for the coral saints', colors: [0xff8fa8, 0xffc4d0, 0x5fe0d0, 0xfff0e0, 0xff6f91], shells: ['fish', 'ring', 'peony', 'saturn'] },
  { name: 'The Rum Harvest', line: 'The new rum is tapped and the town dances till dawn', colors: [0xffa040, 0x8ad060, 0xffd060, 0xff6a3a, 0xfff0c8], shells: ['crackle', 'palm', 'crossette', 'willow'] },
  { name: 'The Drizzle Lanterns', line: 'Tea-house lanterns glowing through the mist', colors: [0xff8fb0, 0xfff2e0, 0x9fe0c0, 0xffb070, 0xd9a0ff], shells: ['willow', 'strobe', 'ring', 'chrysanthemum'] },
  { name: 'The Jade Moon', line: 'Jade lanterns float out to sea for luck', colors: [0x60f0a0, 0xc0ffd8, 0xffd080, 0x40d0c0, 0xfff0c8], shells: ['saturn', 'fish', 'crossette', 'ring'] },
];

export const FULL_MOON = { name: 'The Full Moon Fair', line: 'Every port in the isles lights its lanterns tonight' };

/** Which ports (by index) keep their feast on night n: each its own every third night, and all of them on the full moon. */
export function feastPorts(night: number, ports: number, fullMoon: boolean) {
  const out: number[] = [];
  for (let i = 0; i < ports; i++) if (fullMoon || (night + i) % 3 === 0) out.push(i);
  return out;
}

/** How far a feast night has got at an hour: lanterns going up through dusk, out before dawn. */
export function feastLevel(hour: number) {
  return hour >= 12 ? smoothstep(18.9, 19.9, hour) : 1 - smoothstep(3.6, 4.6, hour);
}

/** Whether the night's moon is full (phase 0 new .. 0.5 full), judged at midnight. */
export function moonIsFull(phase: number, day: number) {
  // the phase steps an eighth of the month a day: look ahead to the coming midnight
  const ahead = (((1 - day) % 1) + 1) % 1;
  const p = (phase + ahead / 8) % 1;
  return Math.abs(p - 0.5) < 1 / 16;
}

// ------------------------------------------------------------------ lantern strings

/** A string of lanterns from a to b, sagging by `sag` in the middle. */
export interface Span {
  a: THREE.Vector3;
  b: THREE.Vector3;
  sag: number;
}

/** The shape of one paper lantern (a round chōchin): dark caps top and bottom, glowing paper between. */
const PROFILE: [number, number, number][] = [
  [0.02, 0.21, 0],
  [0.09, 0.185, 0],
  [0.165, 0.1, 1],
  [0.18, -0.03, 1],
  [0.13, -0.15, 1],
  [0.05, -0.2, 0],
];
const SEG = 6;
/** Room on the string per lantern (m). */
const PITCH = 1.3;

function sagAt(s: Span, t: number, out: THREE.Vector3) {
  return out.lerpVectors(s.a, s.b, t).setY(s.a.y + (s.b.y - s.a.y) * t - s.sag * 4 * t * (1 - t));
}

/**
 * Every lantern on every string in one geometry, and the cords they hang
 * from as line segments. Each vertex knows its lantern's hanging point (so
 * the shader can swing it on the wind) and its place in the lighting order.
 */
export function festoonGeometry(spans: Span[], colors: number[], seed: number) {
  const lathe = new THREE.LatheGeometry(
    PROFILE.map(([r, y]) => new THREE.Vector2(r, y)),
    SEG,
  );
  const tp = lathe.getAttribute('position');
  const tn = lathe.getAttribute('normal');
  const ti = lathe.index!;
  // which profile point each lathe vertex came from: lathe lays them out segment by segment
  const paperOf = (v: number) => PROFILE[v % PROFILE.length][2];
  let rnd = seed * 9301 + 49297;
  const r01 = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280);
  const cols = colors.map((h) => new THREE.Color(h).convertSRGBToLinear());
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const hang: number[] = [];
  const paper: number[] = [];
  const idx: number[] = [];
  const cords: number[] = [];
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const total = spans.length;
  let n = 0;
  spans.forEach((s, si) => {
    const len = s.a.distanceTo(s.b);
    // the cord
    for (let k = 0; k < 12; k++) {
      sagAt(s, k / 12, p);
      sagAt(s, (k + 1) / 12, q);
      cords.push(p.x, p.y, p.z, q.x, q.y, q.z);
    }
    const count = Math.max(1, Math.floor(len / PITCH));
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5) / count;
      sagAt(s, t, p);
      const c = cols[(k + si * 2 + n) % cols.length];
      const big = 0.85 + r01() * 0.3;
      const turn = r01() * Math.PI;
      // lit along each string in turn, a lamplighter working down the quay
      const order = Math.min(0.97, ((si + t) / total) * 0.9 + r01() * 0.05);
      const base = pos.length / 3;
      const cs = Math.cos(turn);
      const sn = Math.sin(turn);
      for (let v = 0; v < tp.count; v++) {
        const x = tp.getX(v) * big;
        const y = tp.getY(v) * big - 0.24 * big;
        const z = tp.getZ(v) * big;
        pos.push(p.x + x * cs - z * sn, p.y + y, p.z + x * sn + z * cs);
        nor.push(tn.getX(v) * cs - tn.getZ(v) * sn, tn.getY(v), tn.getX(v) * sn + tn.getZ(v) * cs);
        col.push(c.r, c.g, c.b);
        hang.push(p.x, p.y, p.z, order);
        paper.push(paperOf(v));
      }
      for (let i = 0; i < ti.count; i++) idx.push(base + ti.getX(i));
      n++;
    }
  });
  lathe.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aHang', new THREE.Float32BufferAttribute(hang, 4));
  g.setAttribute('aPaper', new THREE.Float32BufferAttribute(paper, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  // the sphere grows a little for the swing
  if (g.boundingSphere) g.boundingSphere.radius += 1;
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(cords, 3));
  lg.computeBoundingSphere();
  return { lanterns: g, cords: lg, count: n };
}

const LANTERN_VS = /* glsl */ `
  attribute vec4 aHang; // hanging point (port frame), w = its turn to be lit
  attribute float aPaper;
  uniform float uTime; uniform float uLit; uniform vec3 uSway;
  uniform vec2 uFogRange; uniform float uMist;
  varying vec3 vCol; varying float vPaper; varying float vFace; varying float vOn; varying float vSeed; varying float vFog;
  void main() {
    float seed = fract(aHang.w * 91.7 + aHang.x * 0.371 + aHang.z * 0.173);
    vec3 rel = position - aHang.xyz;
    // each one swings from its string: leant downwind, rocking on the gusts
    float rock = sin(uTime * (1.2 + seed * 0.8) + seed * 40.0);
    vec2 lean = uSway.xy * uSway.z * (0.16 + 0.12 * rock) + vec2(sin(uTime * 1.9 + seed * 17.0), cos(uTime * 1.6 + seed * 23.0)) * 0.05;
    rel.xz += lean * -rel.y;
    vec4 wp = modelMatrix * vec4(aHang.xyz + rel, 1.0);
    vec3 n = normalize(mat3(modelMatrix) * normal);
    vec3 toEye = cameraPosition - wp.xyz;
    float d = length(toEye);
    vFace = abs(dot(n, toEye / d));
    vOn = smoothstep(aHang.w, aHang.w + 0.03, uLit);
    vCol = color; vPaper = aPaper; vSeed = seed;
    vFog = max(smoothstep(uFogRange.x, uFogRange.y, d) * 0.85, (1.0 - exp(-d * 0.0045)) * uMist * 0.6);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

const LANTERN_FS = /* glsl */ `
  uniform float uTime; uniform vec3 uLight;
  varying vec3 vCol; varying float vPaper; varying float vFace; varying float vOn; varying float vSeed; varying float vFog;
  void main() {
    float flick = 0.9 + 0.1 * sin(uTime * 11.0 + vSeed * 60.0) * sin(uTime * 6.3 + vSeed * 31.0);
    // paper lit from inside: you see the most light where you look straight
    // through it, a candle's hot heart in the middle, the rim falling off
    float through = vFace * vFace;
    vec3 lit = vCol * vPaper * (0.45 + 1.9 * through) * 3.0 * flick;
    lit += vec3(1.0, 0.72, 0.4) * vPaper * through * through * through * 2.2 * flick;
    // unlit (and the caps): paper and lacquer in whatever light there is
    vec3 off = mix(vec3(0.05, 0.035, 0.025), vCol * 0.35, vPaper) * uLight;
    vec3 c = mix(off, lit + off * 0.3, vOn * vPaper);
    c *= 1.0 - vFog;
    gl_FragColor = vec4(c, 1.0);
  }`;

/** A town's lantern material: one each so every town lights at its own pace (they all share one program). */
export function lanternMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: globalUniforms.uTime,
      uLight: globalUniforms.uLight,
      uFogRange: globalUniforms.uFogRange,
      uMist: globalUniforms.uMist,
      uLit: { value: 0 },
      uSway: { value: new THREE.Vector3(1, 0, 0.5) },
    },
    vertexColors: true,
    vertexShader: LANTERN_VS,
    fragmentShader: LANTERN_FS,
  });
}

// ------------------------------------------------------------------ the feast nights themselves

type Port = import('./tradePort').TradePort;
type Fw = import('../fx/fireworks').Fireworks;
type Boats = import('../fx/lanternBoats').LanternBoats;
type Sound = import('../core/audio').Audio;
type Sea = import('../game/world').World;

/** Fireworks over the harbour from this hour until a couple of hours after midnight. */
const SHOW_FROM = 20.4;
const SHOW_TO = 2.2;
/** How far off a town's show (rockets, lantern boats) is still put on. */
const SHOW_REACH = 1100;
const BOATS_REACH = 700;
const BAND_REACH = 340;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length) % a.length];
const ZERO = new THREE.Vector3();

/** What a feast night's news says: which towns, whose feast, and when. */
export interface FeastNews {
  towns: string[];
  feast: string;
  line: string;
  full: boolean;
  when: 'now' | 'tonight';
}

/**
 * Runs every feast: counts the nights, picks tonight's towns, lights them
 * up at dusk and puts them out before dawn, and for whichever towns are in
 * sight puts on the show: rockets from the lighthouse (a grand finale at
 * midnight), lantern boats set down on the water, the band.
 */
export class Festivals {
  /** Nights since the voyage began (the count moves on at noon). */
  night = 0;
  fullMoon = false;
  private tonight = new Set<number>();
  private lastDay = -1;
  private lastHour = 12;
  private dusk = false;
  private next: number[];
  private boatT: number[];
  private tints: THREE.Color[][];
  private queue: { at: number; port: Port; ids: FireworkId[]; spot: number }[] = [];
  private tune = 0;
  private bandLeft = 0;
  private v = new THREE.Vector3();
  private dir = new THREE.Vector3();
  /** The lanterns going up somewhere tonight: the towns, and whether it's the full-moon fair. */
  onDusk: (ports: Port[], full: boolean) => void = () => {};
  /** A town roaring at its finale. */
  onCheer: (port: Port) => void = () => {};

  constructor(
    private readonly ports: Port[],
    private readonly fw: Fw,
    private readonly boats: Boats,
    private readonly audio: Sound,
  ) {
    this.next = ports.map(() => 0);
    this.boatT = ports.map(() => Math.random() * 3);
    this.tints = ports.map((p) => p.feast.colors.map((h) => new THREE.Color(h).convertSRGBToLinear()));
    ports.forEach((p, i) => {
      p.onLantern = (at) => this.boats.launch(at.x, at.z, p.site.nx, p.site.nz, pick(this.tints[i]));
    });
  }

  /** A new voyage: the count starts again and every town is dark. */
  reset() {
    this.night = 0;
    this.lastDay = -1;
    this.dusk = false;
    this.queue.length = 0;
    for (const p of this.ports) {
      p.festive = 0;
      p.market.bonus = 1;
    }
  }

  private plan(day: number, phase: number) {
    this.fullMoon = moonIsFull(phase, day);
    this.tonight = new Set(feastPorts(this.night, this.ports.length, this.fullMoon));
  }

  /** Whether a town keeps its feast tonight. */
  keeps(port: Port) {
    return this.tonight.has(this.ports.indexOf(port));
  }

  /** The next feast night's news (tonight's, or the one under way). */
  news(day: number, phase: number): FeastNews | null {
    const hour = day * 24;
    let set = [...this.tonight];
    let full = this.fullMoon;
    const now = feastLevel(hour) > 0.02;
    // a morning's news is of the coming night, which the count reaches at noon
    if (!now && hour < 12) {
      full = moonIsFull(phase, day);
      set = feastPorts(this.night + 1, this.ports.length, full);
    }
    if (!set.length) return null;
    const towns = set.map((i) => this.ports[i]);
    return {
      towns: towns.map((p) => p.name),
      feast: full ? FULL_MOON.name : towns[0].feast.name,
      line: full ? FULL_MOON.line : towns[0].feast.line,
      full,
      when: now ? 'now' : 'tonight',
    };
  }

  update(dt: number, realDt: number, world: Sea, day: number, phase: number, cam: THREE.Vector3, active: boolean) {
    // the count of nights moves on at noon
    if (this.lastDay < 0) this.plan(day, phase);
    else if (this.lastDay < 0.5 && day >= 0.5 && day - this.lastDay < 0.25) {
      this.night++;
      this.plan(day, phase);
    }
    this.lastDay = day;
    const hour = day * 24;
    const midnight = this.lastHour > 23 && hour < 1;
    this.lastHour = hour;
    const level = feastLevel(hour);
    const dusk = level > 0.02 && this.tonight.size > 0;
    if (dusk && !this.dusk && active) this.onDusk([...this.tonight].map((i) => this.ports[i]), this.fullMoon);
    this.dusk = dusk;

    const showing = hour >= SHOW_FROM || hour < SHOW_TO;
    let glow: Port | null = null;
    let gd = Infinity;
    let band: Port | null = null;
    let bd = Infinity;
    for (const [i, p] of this.ports.entries()) {
      const want = this.tonight.has(i) ? level : 0;
      if (dt > 0) p.festive += (want - p.festive) * (1 - Math.exp(-0.9 * dt));
      if (Math.abs(want - p.festive) < 0.002) p.festive = want;
      p.market.bonus = p.festive > 0.5 ? 1.15 : 1;
      if (p.festive < 0.05) continue;
      const d = Math.hypot(cam.x - p.x, cam.z - p.z);
      if (d < gd) {
        gd = d;
        glow = p;
      }
      if (p.festive > 0.5 && d < bd) {
        bd = d;
        band = p;
      }
      if (dt <= 0 || d > SHOW_REACH) continue;
      // rockets off the lighthouse every few seconds, and the finale on the stroke of midnight
      if (p.festive > 0.6 && showing && world.time >= this.next[i]) {
        this.next[i] = world.time + rand(4.5, 10);
        const n = 1 + Math.floor(Math.random() * 3);
        const id = pick(p.feast.shells);
        this.volley(p, Array.from({ length: n }, () => (Math.random() < 0.25 ? pick(p.feast.shells) : id)), Math.random() < 0.6 ? 0 : 1);
      }
      if (midnight && p.festive > 0.6) this.finale(p, world.time);
      // lantern boats: the fisherman sets most down off the end, the rest go in all along the quay
      if (p.festive > 0.7 && d < BOATS_REACH && (this.boatT[i] -= dt) <= 0) {
        this.boatT[i] = rand(2.4, 4.8);
        if (this.boats.full) continue;
        if (Math.random() < 0.45) p.release();
        else {
          // clear of a ship lying alongside
          const x = p.moored ? (Math.random() < 0.5 ? rand(-27.5, -25) : rand(21, 27.5)) : rand(-27.5, 27.5);
          const at = p.toWorld(x, 0, 1.2, this.v);
          this.boats.launch(at.x, at.z, p.site.nx, p.site.nz, pick(this.tints[i]));
        }
      }
    }
    for (let k = this.queue.length - 1; k >= 0; k--) {
      const q = this.queue[k];
      if (q.at > world.time) continue;
      this.queue.splice(k, 1);
      if (q.ids.length) this.volley(q.port, q.ids, q.spot);
      else this.onCheer(q.port);
    }

    // the nearest lit town's glow on its quay and the water before it
    if (glow && gd < 800) {
      const k = glow.festive * (1 - smoothstep(500, 800, gd));
      this.fw.glow(glow.glowAt(this.v), [1, 0.6, 0.3], 0.45 * k);
    } else this.fw.glow(null);

    // the band, heard across the water
    if (band && bd < BAND_REACH && dt > 0) {
      this.bandLeft -= realDt;
      if (this.bandLeft <= 0) {
        const [vol, pan, d] = world.soundAt(band.glowAt(this.v));
        this.bandLeft = this.audio.festivalTune(this.tune++, vol * 0.24 * band.festive, pan, d) - 0.01;
      }
    } else if (!band || bd >= BAND_REACH) this.bandLeft = 0;
  }

  private volley(p: Port, ids: FireworkId[], spot: number) {
    const from = p.launchSpot(spot, new THREE.Vector3());
    const n = ids.length;
    ids.forEach((id, k) => {
      // out over the harbour, fanned a little either side
      const a = (n > 1 ? k / (n - 1) - 0.5 : 0) * 0.5 + rand(-0.2, 0.2) + (spot ? 0.35 : -0.35);
      const c = Math.cos(a);
      const s = Math.sin(a);
      this.dir.set(p.site.nx * c - p.site.nz * s, 0, p.site.nx * s + p.site.nz * c);
      this.fw.launch(id, from, this.dir, ZERO, k, n);
    });
    p.rocket(1.9);
  }

  /** Midnight: the sky over the harbour thrown wide open. */
  private finale(p: Port, now: number) {
    const sh = p.feast.shells;
    const plan: [number, FireworkId[], number][] = [
      [0, ['peony', 'peony', 'peony'], 0],
      [1.2, ['chrysanthemum', 'chrysanthemum', 'chrysanthemum'], 1],
      [2.6, [sh[0], 'ring', sh[1]], 0],
      [4.2, ['crackle', 'crackle', 'crackle', 'crackle'], 1],
      [6.4, ['fortune', 'fortune', 'fortune'], 0],
      [9.4, ['willow', 'willow', 'willow', 'willow', 'willow'], 1],
      [10.6, [sh[2], sh[3], sh[2]], 0],
    ];
    for (const [at, ids, spot] of plan) this.queue.push({ at: now + at, port: p, ids, spot });
    this.queue.push({ at: now + 8.6, port: p, ids: [], spot: 0 });
    this.queue.push({ at: now + 13, port: p, ids: [], spot: 0 });
  }
}
