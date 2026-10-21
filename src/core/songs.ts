// The voyage songs: five tunes for fair sailing between the islands, written
// out as melodies and chord charts and arranged for the ship's band. Each
// song builds a fresh, slightly humanised performance every time it plays
// (timing, touch, the odd ornament, a fill here, a rest there), so the same
// tune never quite repeats note for note. ./voyageMusic plays the result.

import type { Drum, Tonal } from './musicKit';

export type Mono = 'whistle' | 'fiddle' | 'accord' | 'flute';
export type Inst = Tonal | Drum | Mono | 'pad';

/** One note: start and length in seconds from the song's top, midi pitch, velocity 0..1. */
export interface Ev {
  t: number;
  i: Inst;
  m: number;
  d: number;
  v: number;
  /** A pad's chord. */
  ch?: number[];
  /** A grace note (an Irish "cut") flicked in just before the note. */
  g?: number;
}

export interface Song {
  name: string;
  /** How well it suits the day and the night, as weights for the rotation. */
  day: number;
  night: number;
  build: (r: () => number) => Ev[];
}

// ------------------------------------------------------------------ notation

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function pitch(name: string): number {
  const m = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

interface Note {
  u: number;
  len: number;
  m: number | null;
  cut: boolean;
}

/**
 * A melody, as "F#5:2 A5:1 | ~D5:6": note, octave and length in the song's
 * units (an eighth), rests as "r:2", a leading "~" for a cut, "|" between
 * bars. Every bar must add up, so a slip in the score fails loudly.
 */
export function phrase(s: string, barU: number): Note[] {
  const out: Note[] = [];
  let u = 0;
  s.split('|').forEach((bar, bi) => {
    let sum = 0;
    for (const tok of bar.trim().split(/\s+/)) {
      if (!tok) continue;
      const cut = tok.startsWith('~');
      const [name, l] = (cut ? tok.slice(1) : tok).split(':');
      const len = +l;
      if (!(len > 0)) throw new Error(`bad length in ${tok}`);
      out.push({ u: u + sum, len, m: name === 'r' ? null : pitch(name), cut });
      sum += len;
    }
    if (Math.abs(sum - barU) > 1e-6) throw new Error(`bar ${bi + 1} of "${s.slice(0, 24)}…" is ${sum}, not ${barU}`);
    u += barU;
  });
  return out;
}

const QUAL: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
  sus4: [0, 5, 7],
  '7sus': [0, 5, 7, 10],
  '6': [0, 4, 7, 9],
  add9: [0, 4, 7, 14],
};

export interface Chord {
  root: number;
  tones: number[];
  bass: number;
}

function chord(sym: string): Chord {
  const m = /^([A-G][#b]?)([a-z0-9]*)(?:\/([A-G][#b]?))?$/.exec(sym);
  if (!m || !(m[2] in QUAL)) throw new Error(`bad chord ${sym}`);
  const pc = (n: string) => (PC[n[0]] + (n[1] === '#' ? 1 : n[1] === 'b' ? -1 : 0) + 12) % 12;
  const root = pc(m[1]);
  return { root, tones: QUAL[m[2]], bass: m[3] ? pc(m[3]) : root };
}

interface Slot {
  u: number;
  len: number;
  c: Chord;
}

/** A chord chart, "D | G | Em A | D": a bar's chords share it evenly. */
export function chart(s: string, barU: number): Slot[] {
  const out: Slot[] = [];
  s.split('|').forEach((bar, bi) => {
    const syms = bar.trim().split(/\s+/);
    const len = barU / syms.length;
    syms.forEach((sym, k) => out.push({ u: bi * barU + k * len, len, c: chord(sym) }));
  });
  return out;
}

/** The chord's tones, n of them, stacked upward from the first at or above `lo`. */
function voice(c: Chord, lo: number, n: number): number[] {
  const cand: number[] = [];
  for (let m = lo; cand.length < n && m < lo + 36; m++) {
    const iv = (((m - c.root) % 12) + 12) % 12;
    if (c.tones.some((t) => t % 12 === iv)) cand.push(m);
  }
  return cand;
}

/** The bass note in the octave from `lo`. */
const low = (c: Chord, lo: number) => lo + ((((c.bass - lo) % 12) + 12) % 12);
/** Its fifth above (or the chord's own fifth for a slash chord). */
const fifth = (c: Chord, lo: number) => low(c, lo) + (c.bass === c.root ? 7 : (((c.root + 7 - c.bass) % 12) + 12) % 12);

/** A scale's pitch classes from a tonic and a mode's steps. */
const scale = (tonic: number, steps: number[]) => steps.map((s) => (tonic + s) % 12);
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MINOR = [0, 2, 3, 5, 7, 8, 11]; // harmonic: the raised seventh of the E7

/** Moves a note by scale steps (−2: a third below), keeping to the key. */
function step(m: number, sc: number[], by: number): number {
  let n = m;
  let k = 0;
  const dir = Math.sign(by);
  while (k < Math.abs(by)) {
    n += dir;
    if (sc.includes(((n % 12) + 12) % 12)) k++;
    if (Math.abs(n - m) > 6) return m + (by < 0 ? -3 : 3);
  }
  return n;
}

const isTone = (m: number, c: Chord) => c.tones.some((t) => (((m - c.root) % 12) + 12) % 12 === t % 12);

/**
 * A harmony part under the tune, the way an arranger voices it: a chord tone
 * gets the next chord tone down (a third, or a fourth when that is what the
 * chord has); a passing note moves a third down the scale, unless that rubs
 * a semitone against the chord, when it too finds a chord tone.
 */
function under(m: number, c: Chord | undefined, sc: number[]): number {
  const third = step(m, sc, -2);
  if (!c) return third;
  const rubs = (x: number) => c.tones.some((t) => {
    const d = (((x - c.root - t) % 12) + 12) % 12;
    return d === 1 || d === 11;
  });
  if (!isTone(m, c) && !rubs(third)) return third;
  for (let x = m - 3; x >= m - 9; x--) if (isTone(x, c)) return x;
  return third;
}

// ------------------------------------------------------------------ the score

const DRUMS = new Set<Inst>(['bod', 'bodHi', 'conga', 'congaLo', 'shk', 'clave', 'kick']);
const MONO = new Set<Inst>(['whistle', 'fiddle', 'accord', 'flute']);

/**
 * Writes a performance: units to seconds through the groove (a jig's lilt, a
 * lazy swing) and the closing ritardando, with a player's small unevenness.
 */
class Score {
  ev: Ev[] = [];
  /** The cursor: the unit the next section starts on. */
  at = 0;
  private ritU = Infinity;
  private ritLen = 1;
  private ritSlow = 0;
  constructor(
    readonly spu: number,
    readonly barU: number,
    readonly r: () => number,
    private groove: number[] | null = null,
  ) {}

  /** Slows over the last `bars` bars from the cursor to (1 - slow) of the tempo. */
  rit(bars: number, slow = 0.3) {
    this.ritU = this.at;
    this.ritLen = bars * this.barU;
    this.ritSlow = slow;
  }

  time(u: number) {
    let w = u;
    const g = this.groove;
    if (g) {
      const n = g.length;
      const k = Math.floor(u / n);
      const x = u - k * n;
      const j = Math.floor(x);
      const a = g[j];
      const b = j + 1 < n ? g[j + 1] : n;
      w = k * n + a + (b - a) * (x - j);
    }
    if (w <= this.ritU) return w * this.spu;
    const s = this.ritSlow;
    const L = this.ritLen;
    const x = Math.min(w - this.ritU, L);
    let t = this.ritU - (L / s) * Math.log(1 - (s * x) / L);
    if (w - this.ritU > L) t += (w - this.ritU - L) / (1 - s);
    return t * this.spu;
  }

  note(i: Inst, u: number, m: number, len: number, v: number, extra?: Partial<Ev>) {
    const r = this.r;
    const jit = MONO.has(i) ? 0 : (r() - 0.5) * (DRUMS.has(i) ? 0.008 : 0.014);
    const t = Math.max(0, this.time(u) + jit);
    const d = Math.max(0.03, this.time(u + len) - this.time(u));
    this.ev.push({ t, i, m, d, v: Math.min(1, v * (0.9 + r() * 0.2)), ...extra });
  }

  /** A melody line from the cursor, transposed and in harmony if asked. */
  line(i: Inst, mel: Note[], v: number, o: { tr?: number; harm?: { sc: number[]; slots: Slot[] }; cuts?: number; from?: number; to?: number } = {}) {
    const from = (o.from ?? 0) * this.barU;
    const to = (o.to ?? Infinity) * this.barU;
    for (const n of mel) {
      if (n.m === null || n.u < from || n.u >= to) continue;
      let m = n.m + (o.tr ?? 0);
      if (o.harm) m = under(m, o.harm.slots.find((sl) => n.u >= sl.u - 1e-6 && n.u < sl.u + sl.len)?.c, o.harm.sc);
      // a long note leans in, and players dress the odd one with a cut
      const vv = v * (n.len >= 3 ? 1.05 : n.u % this.barU === 0 ? 1 : 0.9);
      const cut = (n.cut || (o.cuts ?? 0) > this.r()) && n.len >= 2 && i !== 'accord';
      this.note(i, this.at + n.u, m, n.len, vv, cut ? { g: m + (m % 12 === 4 || m % 12 === 11 ? 1 : 2) } : undefined);
    }
  }

  pad(slots: Slot[], lo: number, n: number, v: number) {
    for (const s of slots) this.note('pad', this.at + s.u, 0, s.len, v, { ch: voice(s.c, lo, n) });
  }

  strum(u: number, notes: number[], len: number, v: number, up = false) {
    const ord = up ? [...notes].reverse() : notes;
    // a strum rakes the strings 10-20 ms apart
    ord.forEach((m, k) => this.note('gtr', u + (k * (0.011 + this.r() * 0.007)) / this.spu, m, len, v * (up ? 0.8 : 1) * (1 - k * 0.06)));
  }

  /** Bars in a chart, from the cursor. */
  bars(slots: Slot[]) {
    return Math.round((slots[slots.length - 1].u + slots[slots.length - 1].len) / this.barU);
  }

  advance(slots: Slot[]) {
    this.at += this.bars(slots) * this.barU;
  }

  done(): Ev[] {
    return this.ev.sort((a, b) => a.t - b.t);
  }
}

// ------------------------------------------------------------------ 1 · Fair Winds
// A lilting 6/8 ballad in D for a steady breeze: fingerpicked guitar, a tin
// whistle that sings the tune, the fiddle answering, a soft bodhrán heartbeat.

function fairWinds(r: () => number): Ev[] {
  const s = new Score(60 / 63 / 3, 6, r, [0, 1.1, 2.04]);
  const KEY = scale(2, MAJOR);
  const INTRO = chart('D | G | D | A', 6);
  const A = chart('D | G | D | A | D | G | Em A | D', 6);
  const B = chart('Bm | G | D | A | Bm | G | Em | A7', 6);
  const CODA = chart('D | G | A7 | D | D', 6);
  const melA = phrase('A4:2 D5:1 F#5:2 E5:1 | D5:2 B4:1 ~G4:3 | A4:2 D5:1 F#5:2 A5:1 | G5:3 E5:3 | F#5:2 A5:1 B5:2 A5:1 | G5:2 F#5:1 E5:2 D5:1 | E5:2 F#5:1 E5:2 C#5:1 | ~D5:6', 6);
  const melA2 = phrase('A4:2 D5:1 F#5:2 E5:1 | D5:2 B4:1 ~G4:3 | A4:2 D5:1 F#5:2 A5:1 | G5:3 E5:3 | F#5:2 A5:1 B5:2 A5:1 | G5:2 F#5:1 E5:2 D5:1 | E5:2 F#5:1 G5:1 F#5:1 E5:1 | ~D5:6', 6);
  const melB = phrase('B5:2 A5:1 F#5:2 D5:1 | E5:2 G5:1 ~B5:3 | A5:2 F#5:1 D5:2 F#5:1 | E5:3 C#5:1 D5:1 E5:1 | F#5:2 D5:1 B4:2 D5:1 | G5:2 B5:1 D6:2 B5:1 | B5:2 G5:1 E5:2 G5:1 | A5:2 G5:1 ~E5:3', 6);
  const melC = phrase('F#5:3 A5:3 | B5:2 A5:1 ~G5:3 | E5:3 C#5:3 | D5:6 | r:6', 6);

  /** Fingerpicking: bass, then up and down the chord in eighths. */
  const pick = (slots: Slot[], v: number) => {
    for (const sl of slots) {
      const b = low(sl.c, 40);
      const up = voice(sl.c, b + 5, 3);
      const pat = sl.len >= 6 ? [b, up[0], up[1], up[2], up[1], up[0]] : [b, up[0], up[1]];
      pat.forEach((m, k) => s.note('gtr', s.at + sl.u + k, m, k ? 2 : 3, k ? v * 0.62 : v));
    }
  };
  const bass = (slots: Slot[], v: number) => {
    for (const sl of slots) {
      s.note('bass', s.at + sl.u, low(sl.c, 33), Math.min(sl.len, 3), v);
      if (sl.len >= 6) s.note('bass', s.at + sl.u + 3, fifth(sl.c, 33), 3, v * 0.75);
    }
  };
  const drum = (bars: number, v: number) => {
    for (let b = 0; b < bars; b++) {
      const u = s.at + b * 6;
      s.note('bod', u, 0, 1, v);
      s.note('bodHi', u + 2, 0, 1, v * 0.35);
      s.note('bod', u + 3, 0, 1, v * 0.62);
      s.note('bodHi', u + 5, 0, 1, v * 0.3);
      if (r() < 0.3) s.note('bodHi', u + 4, 0, 1, v * 0.2);
      if (b % 8 === 7) for (let k = 0; k < 3; k++) s.note('bodHi', u + 3 + k, 0, 1, v * (0.3 + k * 0.1));
    }
  };

  pick(INTRO, 0.6);
  s.advance(INTRO);
  // A: the whistle alone over the guitar and bass
  pick(A, 0.55);
  bass(A, 0.6);
  s.line('whistle', melA, 0.8, { cuts: 0.15 });
  s.advance(A);
  // A again: the fiddle a third under, the bodhrán comes in
  pick(A, 0.55);
  bass(A, 0.62);
  drum(8, 0.5);
  s.line('whistle', melA2, 0.82, { cuts: 0.2 });
  s.line('fiddle', melA2, 0.5, { harm: { sc: KEY, slots: A } });
  s.advance(A);
  // B: the fiddle takes the tune up high, strings beneath
  for (let k = 0; k < 2; k++) {
    pick(B, 0.5);
    bass(B, 0.64);
    drum(8, 0.55);
    s.pad(B, 55, 4, 0.55 + k * 0.15);
    s.line('fiddle', melB, 0.75);
    if (k) s.line('whistle', melB, 0.55, { harm: { sc: KEY, slots: B } });
    s.advance(B);
  }
  // A, everyone: the fiddle under the whistle an octave down
  pick(A, 0.55);
  bass(A, 0.64);
  drum(8, 0.58);
  s.pad(A, 57, 4, 0.5);
  s.line('whistle', melA2, 0.85, { cuts: 0.25 });
  s.line('fiddle', melA2, 0.55, { tr: -12 });
  s.advance(A);
  // the coda, easing in to the last chord
  s.rit(5, 0.32);
  pick(chart('D | G | A7 | D', 6), 0.5);
  bass(CODA, 0.6);
  s.line('whistle', melC, 0.75);
  s.line('fiddle', melC, 0.45, { harm: { sc: KEY, slots: CODA } });
  s.pad(chart('D | G | A7', 6), 55, 4, 0.45);
  s.note('pad', s.at + 18, 0, 12, 0.55, { ch: [50, 57, 62, 66, 69] });
  s.strum(s.at + 24, [38, 45, 50, 54, 57, 62], 6, 0.55);
  s.note('bod', s.at + 24, 0, 1, 0.45);
  return s.done();
}

// ------------------------------------------------------------------ 2 · Coral Lagoon
// A sunny calypso in F: steel pan on the tune, guitar chops, a bouncing bass,
// congas, shaker and clave, marimba weaving under it.

function coralLagoon(r: () => number): Ev[] {
  const s = new Score(60 / 108 / 2, 8, r, [0, 1.06]);
  const KEY = scale(5, MAJOR);
  const INTRO = chart('F | Bb | C7 | F', 8);
  const A = chart('F | Bb | C7 | F | F | Bb | C7 | F', 8);
  const B = chart('Dm | Gm | C7 | F | Dm | Bb | G7 | C7', 8);
  const melA = phrase('r:1 C5:1 F5:1 A5:1 r:1 G5:1 A5:2 | Bb5:1 A5:1 G5:1 F5:2 D5:1 F5:2 | E5:2 G5:1 Bb5:2 A5:1 G5:2 | F5:3 C5:1 r:2 C5:1 D5:1 | F5:1 F5:1 A5:1 C6:2 A5:1 F5:2 | D6:2 C6:1 Bb5:2 G5:1 F5:1 G5:1 | A5:1 G5:1 E5:1 C5:2 E5:1 G5:1 Bb5:1 | A5:2 F5:4 r:2', 8);
  const melB = phrase('D6:2 A5:1 F5:2 A5:1 D6:1 C6:1 | Bb5:3 G5:1 D5:2 G5:1 A5:1 | Bb5:2 A5:1 G5:2 E5:1 C5:2 | F5:1 A5:1 C6:3 r:1 C6:1 D6:1 | D6:2 F6:1 E6:2 D6:1 A5:2 | Bb5:2 D6:1 C6:2 Bb5:1 A5:1 G5:1 | B5:2 D6:1 F6:2 D6:1 B5:2 | C6:3 Bb5:1 G5:2 E5:2', 8);
  const melT = phrase('D6:2 C6:2 Bb5:2 G5:2 | F5:4 r:4 | r:8', 8);

  const chops = (slots: Slot[], v: number) => {
    for (const sl of slots) {
      const ch = voice(sl.c, 53, 4);
      for (const [k, up, a, len] of [[0, false, 1, 1.4], [1, true, 0.45, 0.6], [3, true, 0.75, 0.6], [5, true, 0.7, 0.6], [6, false, 0.6, 0.8], [7, true, 0.6, 0.6]] as const) {
        if (k >= sl.len) continue;
        s.strum(s.at + sl.u + k, ch, len, v * a, up);
      }
    }
  };
  const bass = (slots: Slot[], v: number) => {
    slots.forEach((sl, n) => {
      const root = low(sl.c, 33);
      const next = slots[n + 1] ? low(slots[n + 1].c, 33) : root;
      s.note('bass', s.at + sl.u, root, 1.5, v);
      s.note('bass', s.at + sl.u + 1.5, root, 1, v * 0.55);
      s.note('bass', s.at + sl.u + 3, fifth(sl.c, 33), 1, v * 0.8);
      s.note('bass', s.at + sl.u + 4, root + 12, 1.5, v * 0.75);
      s.note('bass', s.at + sl.u + 6, fifth(sl.c, 33), 1, v * 0.7);
      // walk into the next chord by a step
      s.note('bass', s.at + sl.u + 7, next + (next > root ? -1 : next < root ? 1 : 7), 1, v * 0.6);
    });
  };
  const groove = (bars: number, v: number, clave: boolean) => {
    for (let b = 0; b < bars; b++) {
      const u = s.at + b * 8;
      for (let k = 0; k < 8; k++) s.note('shk', u + k, 0, 0.5, v * (k % 2 ? 0.75 : 0.4));
      if (r() < 0.5) s.note('shk', u + 6.5, 0, 0.5, v * 0.3);
      s.note('kick', u, 0, 1, v * 0.8);
      s.note('kick', u + 4, 0, 1, v * 0.65);
      s.note('conga', u + 2, 0, 1, v * 0.6);
      s.note('conga', u + 1, 0, 1, v * 0.25);
      s.note('congaLo', u + 3, 0, 1, v * 0.7);
      s.note('conga', u + 6, 0, 1, v * 0.6);
      s.note('congaLo', u + 7, 0, 1, v * 0.7);
      if (b % 4 === 3) for (let k = 0; k < 4; k++) s.note(k % 2 ? 'congaLo' : 'conga', u + 6 + k * 0.5, 0, 0.5, v * (0.4 + k * 0.1));
      // son clave, three against two across each pair of bars
      if (clave) for (const k of b % 2 ? [2, 4] : [0, 3, 6]) s.note('clave', u + k, 0, 0.5, v * 0.55);
    }
  };
  const riff = (slots: Slot[], v: number) => {
    for (const sl of slots) {
      const t = voice(sl.c, 65, 4);
      [0, 1, 2, 3, 2, 1, 2, 3].forEach((j, k) => k < sl.len && r() > 0.12 && s.note('mar', s.at + sl.u + k, t[j], 1, v * (k % 2 ? 0.7 : 1)));
    }
  };

  chops(INTRO, 0.5);
  bass(INTRO, 0.6);
  groove(4, 0.5, false);
  riff(INTRO, 0.55);
  s.advance(INTRO);
  const verse = (mel: Note[], slots: Slot[], o: { harm?: boolean; clave?: boolean; riff?: boolean; pad?: boolean; low?: boolean; breakdown?: boolean }) => {
    if (!o.breakdown) chops(slots, 0.4);
    else chops(slots.slice(4), 0.4);
    bass(slots, 0.62);
    groove(8, 0.55, !!o.clave);
    s.line('pan', mel, 0.75);
    if (o.harm) s.line('mar', mel, 0.45, { harm: { sc: KEY, slots }, tr: -12 });
    if (o.low) s.line('mar', mel, 0.5, { tr: -12 });
    if (o.riff) riff(slots, 0.4);
    if (o.pad) s.pad(slots, 57, 3, 0.4);
    s.advance(slots);
  };
  verse(melA, A, {});
  verse(melA, A, { harm: true, clave: true });
  verse(melB, B, { riff: true, pad: true, clave: true });
  verse(melA, A, { breakdown: true, riff: true });
  verse(melB, B, { low: true, pad: true, clave: true });
  verse(melA, A, { harm: true, clave: true, pad: true });
  // the tag, a last hit and the shaker trailing off
  const TAG = chart('Bb C7 | F | F', 8);
  s.rit(3, 0.25);
  chops(TAG.slice(0, 2), 0.5);
  bass(TAG.slice(0, 2), 0.6);
  groove(1, 0.5, false);
  s.line('pan', melT, 0.8);
  s.line('mar', melT, 0.45, { harm: { sc: KEY, slots: TAG }, tr: -12 });
  s.strum(s.at + 8, [41, 48, 53, 57, 60, 65], 8, 0.6);
  s.note('pan', s.at + 8, 77, 6, 0.65);
  s.note('mar', s.at + 8, 53, 4, 0.5);
  s.note('bass', s.at + 8, 41, 4, 0.7);
  s.note('kick', s.at + 8, 0, 1, 0.5);
  s.note('conga', s.at + 8, 0, 1, 0.5);
  return s.done();
}

// ------------------------------------------------------------------ 3 · Lantern Waltz
// A bittersweet tavern waltz in A minor for dusk on the water: accordion with
// a fiddle descant, oom-pah-pah guitar, a bass that leans on every "one".

function lanternWaltz(r: () => number): Ev[] {
  const s = new Score(60 / 96 / 2, 6, r);
  const KEY = scale(9, MINOR);
  const INTRO = chart('Am | Am | Dm | E7', 6);
  const A = chart('Am | Am | Dm | Dm | G | G | C | E7 | Am | Am | Dm | Dm | F | E7 | Am | Am', 6);
  const B = chart('C | G | Am | Em | F | C | Dm | G7 | C | G | Am | Em | F | G | C | E7', 6);
  const CODA = chart('Dm | E7 | Am | Am', 6);
  const melA = phrase('E5:4 C5:2 | A4:2 B4:2 C5:2 | D5:4 F5:2 | A5:4 G5:1 F5:1 | G5:4 F5:2 | D5:2 B4:2 D5:2 | E5:4 G5:2 | G#5:2 E5:2 D5:2 | A5:4 E5:2 | C6:4 B5:1 A5:1 | F5:4 A5:2 | D6:4 C6:1 B5:1 | C6:2 A5:2 F5:2 | E5:2 G#5:2 B5:2 | A5:6 | r:4 E5:2', 6);
  const melB = phrase('E5:2 G5:2 C6:2 | B5:4 G5:2 | A5:2 C6:2 E6:2 | B5:4 G5:2 | A5:4 F5:2 | G5:4 E5:2 | F5:2 E5:2 D5:2 | G5:4 F5:2 | E5:2 G5:2 C6:2 | D6:4 B5:2 | C6:4 A5:2 | B5:2 G5:2 E5:2 | F5:2 A5:2 C6:2 | B5:4 D6:2 | C6:6 | B5:2 G#5:2 E5:2', 6);
  const melC = phrase('F5:4 D5:2 | E5:2 G#5:2 B5:2 | A5:6 | r:6', 6);

  const oompah = (slots: Slot[], v: number) => {
    slots.forEach((sl, n) => {
      const b = n % 2 ? fifth(sl.c, 40) : low(sl.c, 40);
      s.note('gtr', s.at + sl.u, b > 52 ? b - 12 : b, 2, v);
      const ch = voice(sl.c, 55, 3);
      s.strum(s.at + sl.u + 2, ch, 1.3, v * 0.55);
      s.strum(s.at + sl.u + 4, ch, 1.3, v * 0.45, r() < 0.3);
    });
  };
  const bass = (slots: Slot[], v: number) => slots.forEach((sl) => s.note('bass', s.at + sl.u, low(sl.c, 33), 2.5, v));
  const brush = (bars: number, v: number) => {
    for (let b = 0; b < bars; b++) {
      s.note('shk', s.at + b * 6 + 2, 0, 1, v);
      s.note('shk', s.at + b * 6 + 4, 0, 1, v * 0.8);
    }
  };

  oompah(INTRO, 0.5);
  s.advance(INTRO);
  oompah(A, 0.45);
  bass(A, 0.55);
  s.line('accord', melA, 0.75, { tr: -12 });
  s.advance(A);
  oompah(B, 0.45);
  bass(B, 0.6);
  brush(16, 0.7);
  s.pad(B, 55, 3, 0.45);
  s.line('accord', melB, 0.75, { tr: -12 });
  s.line('fiddle', melB, 0.42, { harm: { sc: KEY, slots: B } });
  s.advance(B);
  // the fiddle sings it now, the accordion a third under
  oompah(A, 0.45);
  bass(A, 0.58);
  s.pad(A, 52, 3, 0.4);
  s.line('fiddle', melA, 0.7);
  s.line('accord', melA, 0.5, { tr: -12, harm: { sc: KEY, slots: A } });
  s.advance(A);
  oompah(B, 0.48);
  bass(B, 0.62);
  brush(16, 0.8);
  s.pad(B, 55, 4, 0.55);
  s.line('accord', melB, 0.8, { tr: -12 });
  s.line('fiddle', melB, 0.55);
  s.advance(B);
  s.rit(4, 0.35);
  oompah(CODA.slice(0, 2), 0.5);
  bass(CODA.slice(0, 3), 0.55);
  s.line('accord', melC, 0.7, { tr: -12 });
  s.line('fiddle', melC, 0.45, { harm: { sc: KEY, slots: CODA } });
  s.strum(s.at + 12, [45, 52, 57, 60, 64, 69], 10, 0.5);
  s.note('pad', s.at + 12, 0, 12, 0.5, { ch: [57, 60, 64, 69] });
  return s.done();
}

// ------------------------------------------------------------------ 4 · The Corsair's Jig
// A rollicking jig in E dorian for a running sea: fiddle and whistle in
// unison, a driving bodhrán, guitar chops, and a drone like pipes.

function corsairsJig(r: () => number): Ev[] {
  const s = new Score(60 / 96 / 3, 6, r, [0, 1.12, 2.05]);
  const KEY = scale(4, DORIAN);
  const A = chart('Em | D | Em | A | Em | D | G A | Em', 6);
  const B = chart('G | A | Bm | A | G | D | G A | Em', 6);
  const BREAK = chart('Em | D | Em | D', 6);
  const melA = phrase('E5:1 B4:1 E5:1 G5:1 F#5:1 E5:1 | F#5:1 D5:1 F#5:1 A5:1 G5:1 F#5:1 | G5:1 E5:1 G5:1 ~B5:2 A5:1 | A5:2 E5:1 C#5:2 E5:1 | E5:1 B4:1 E5:1 G5:1 F#5:1 E5:1 | D5:1 A4:1 D5:1 ~F#5:2 E5:1 | D5:1 B4:1 G4:1 A4:1 B4:1 C#5:1 | E5:2 B4:1 ~E5:3', 6);
  const melB = phrase('B5:1 G5:1 B5:1 ~D6:2 B5:1 | C#6:1 A5:1 C#6:1 E6:2 C#6:1 | D6:1 C#6:1 B5:1 F#5:1 B5:1 D6:1 | C#6:1 B5:1 A5:1 ~E5:2 A5:1 | B5:1 G5:1 B5:1 D6:1 C#6:1 B5:1 | A5:1 F#5:1 A5:1 ~D6:2 A5:1 | B5:1 G5:1 E5:1 A5:1 C#6:1 E6:1 | E6:2 B5:1 ~E5:3', 6);
  const melEnd = phrase('B4:1 E5:1 G5:1 B5:3 | E5:3 r:3', 6);

  const chop = (slots: Slot[], v: number) => {
    for (const sl of slots) {
      const ch = [low(sl.c, 40), ...voice(sl.c, 52, 4)];
      for (const [k, up, a] of [[0, false, 1], [2, true, 0.5], [3, false, 0.8], [5, true, 0.5]] as const) if (k < sl.len) s.strum(s.at + sl.u + k, ch, 1, v * a, up);
    }
  };
  const bass = (slots: Slot[], v: number) => {
    for (const sl of slots) {
      s.note('bass', s.at + sl.u, low(sl.c, 33), 2, v);
      if (sl.len >= 6) s.note('bass', s.at + sl.u + 3, fifth(sl.c, 33), 2, v * 0.75);
    }
  };
  const drum = (bars: number, v: number, fills = true) => {
    for (let b = 0; b < bars; b++) {
      const u = s.at + b * 6;
      const lift = b % 2 ? 0.92 : 1;
      s.note('bod', u, 0, 1, v * lift);
      s.note('bodHi', u + 1, 0, 1, v * 0.28);
      s.note('bodHi', u + 2, 0, 1, v * 0.4);
      s.note('bod', u + 3, 0, 1, v * 0.7);
      s.note('bodHi', u + 4, 0, 1, v * 0.28);
      s.note('bodHi', u + 5, 0, 1, v * 0.45);
      if (r() < 0.25) s.note('bodHi', u + 5.5, 0, 0.5, v * 0.25);
      if (fills && b % 8 === 7) {
        s.note('bod', u + 4, 0, 1, v * 0.6);
        s.note('bod', u + 5, 0, 1, v * 0.75);
      }
    }
  };
  const drone = (slots: Slot[], v: number) => s.note('pad', s.at, 0, s.bars(slots) * 6, v, { ch: [40, 47, 52] });
  const tune = (mel: Note[], slots: Slot[], parts: { fiddle?: number; whistle?: number; harmW?: boolean; harmF?: boolean; drone?: boolean }) => {
    chop(slots, 0.36);
    bass(slots, 0.62);
    drum(8, 0.62);
    if (parts.fiddle) s.line('fiddle', mel, parts.fiddle, parts.harmF ? { harm: { sc: KEY, slots } } : {});
    if (parts.whistle) s.line('whistle', mel, parts.whistle, parts.harmW ? { harm: { sc: KEY, slots }, cuts: 0 } : { cuts: 0.15 });
    if (parts.drone) drone(slots, 0.5);
    s.advance(slots);
  };

  // two bars of the drum and the guitar to count it in
  const IN = chart('Em | Em', 6);
  chop(IN, 0.4);
  drum(2, 0.6, false);
  s.advance(IN);
  tune(melA, A, { fiddle: 0.72 });
  tune(melA, A, { fiddle: 0.66, whistle: 0.7 });
  tune(melB, B, { fiddle: 0.7, whistle: 0.7 });
  tune(melB, B, { fiddle: 0.72, whistle: 0.55, harmW: true, drone: true });
  // the break: drum and strings, the ship heeling over
  chop(BREAK, 0.36);
  bass(BREAK, 0.6);
  drum(4, 0.7);
  drone(BREAK, 0.55);
  s.advance(BREAK);
  tune(melA, A, { whistle: 0.75, fiddle: 0.5, harmF: true });
  tune(melA, A, { whistle: 0.75, fiddle: 0.66 });
  tune(melB, B, { fiddle: 0.74, whistle: 0.7, drone: true });
  tune(melA, A, { fiddle: 0.74, whistle: 0.72, drone: true });
  // and out, on a stamp
  const END = chart('Em | Em', 6);
  s.rit(2, 0.2);
  s.line('fiddle', melEnd, 0.75);
  s.line('whistle', melEnd, 0.7);
  chop(END.slice(0, 1), 0.5);
  drum(1, 0.62, false);
  s.strum(s.at + 6, [40, 47, 52, 55, 59, 64], 4, 0.6);
  s.note('bass', s.at + 6, 40, 3, 0.7);
  s.note('bod', s.at + 6, 0, 1, 0.8);
  return s.done();
}

// ------------------------------------------------------------------ 5 · Siesta Isles
// A drowsy, sun-warmed lullaby in G, with a lydian shimmer: kalimba ripples,
// a low wooden flute, marimba softly underneath, the slowest of swings.

function siestaIsles(r: () => number): Ev[] {
  const s = new Score(60 / 72 / 2, 8, r, [0, 1.1]);
  const KEY = scale(7, MAJOR);
  const A = chart('Gmaj7 | A/G | Bm7 | Em9 | Cmaj7 | Bm7 | Am7 | D7sus', 8);
  const B = chart('Em7 | Cmaj7 | G | D/F# | Em7 | Cmaj7 | Am7 | D7sus D', 8);
  const CODA = chart('Gmaj7 | Cmaj7 | Am7 D7sus | Gmaj9', 8);
  const melA = phrase('B5:3 A5:1 B5:2 D6:2 | C#6:4 A5:2 E5:2 | F#5:3 E5:1 D5:2 F#5:2 | G5:6 r:2 | E5:3 G5:1 B5:4 | A5:2 B5:1 A5:1 F#5:4 | E5:3 G5:1 C6:2 B5:2 | A5:6 r:2', 8);
  const melB = phrase('G5:2 B5:2 D6:4 | E6:3 D6:1 B5:4 | D6:2 B5:2 G5:2 A5:2 | F#5:4 E5:2 D5:2 | E5:2 G5:2 B5:4 | C6:2 B5:2 G5:2 E5:2 | E5:4 G5:2 A5:2 | A5:4 F#5:4', 8);
  const melC = phrase('B5:3 A5:1 B5:2 D6:2 | E6:4 D6:2 B5:2 | C6:2 B5:2 A5:2 F#5:2 | G5:8', 8);

  const ripple = (slots: Slot[], v: number) => {
    for (const sl of slots) {
      const t = voice(sl.c, 62, 5);
      [0, 2, 1, 3, 2, 4, 3, 1].forEach((j, k) => {
        if (k >= sl.len || r() < 0.14) return;
        s.note('kal', s.at + sl.u + k, t[j], 2, v * (k % 2 ? 0.7 : 1));
        if (r() < 0.12) s.note('kal', s.at + sl.u + k + 0.5, t[Math.min(4, j + 1)], 1, v * 0.5);
      });
    }
  };
  const roots = (slots: Slot[], v: number) => {
    for (const sl of slots) {
      s.note('mar', s.at + sl.u, low(sl.c, 40), 4, v);
      if (sl.len >= 8) s.note('mar', s.at + sl.u + 4, fifth(sl.c, 40), 4, v * 0.7);
    }
  };
  const pick = (slots: Slot[], v: number) => {
    for (const sl of slots) {
      const b = low(sl.c, 40);
      const up = voice(sl.c, b + 7, 4);
      [b, up[1], up[2], up[3], up[0], up[2], up[1], up[3]].forEach((m, k) => k < sl.len && s.note('gtr', s.at + sl.u + k, m, 3, v * (k ? 0.55 : 0.9)));
    }
  };
  const hush = (bars: number, v: number, kick: boolean) => {
    for (let b = 0; b < bars; b++) {
      for (let k = 1; k < 8; k += 2) s.note('shk', s.at + b * 8 + k, 0, 1, v * (k === 3 || k === 7 ? 1 : 0.7));
      if (kick) s.note('kick', s.at + b * 8, 0, 1, v * 1.6);
    }
  };

  const INTRO = chart('Gmaj7 | A/G | Bm7 | Em9', 8);
  ripple(INTRO, 0.5);
  s.pad(INTRO, 55, 4, 0.5);
  s.advance(INTRO);
  ripple(A, 0.42);
  roots(A, 0.5);
  s.pad(A, 55, 4, 0.5);
  s.line('flute', melA, 0.75, { tr: -12 });
  s.advance(A);
  ripple(B, 0.42);
  roots(B, 0.5);
  hush(8, 0.32, false);
  s.pad(B, 55, 4, 0.5);
  s.line('flute', melB, 0.75, { tr: -12 });
  s.advance(B);
  // the kalimba sings it like a music box, the flute a tenth below
  pick(A, 0.42);
  roots(A, 0.52);
  hush(8, 0.36, true);
  s.pad(A, 55, 3, 0.4);
  s.line('kal', melA, 0.72);
  s.line('flute', melA, 0.6, { tr: -12, harm: { sc: KEY, slots: A } });
  s.advance(A);
  pick(B, 0.42);
  ripple(B, 0.3);
  roots(B, 0.52);
  hush(8, 0.36, true);
  s.pad(B, 55, 4, 0.55);
  s.line('flute', melB, 0.8, { tr: -12 });
  s.line('kal', melB, 0.45, { harm: { sc: KEY, slots: B } });
  s.advance(B);
  s.rit(4, 0.38);
  ripple(CODA.slice(0, 3), 0.4);
  roots(CODA, 0.5);
  s.pad(CODA.slice(0, 3), 55, 4, 0.5);
  s.line('flute', melC, 0.72, { tr: -12 });
  s.note('pad', s.at + 24, 0, 10, 0.55, { ch: [55, 62, 66, 69, 71] });
  // the last chord rolled slowly up the tines
  [67, 71, 74, 78, 81].forEach((m, k) => s.note('kal', s.at + 24 + k * 0.5, m, 6, 0.45));
  return s.done();
}

export const SONGS: Song[] = [
  { name: 'Fair Winds', day: 1, night: 0.7, build: fairWinds },
  { name: 'Coral Lagoon', day: 1, night: 0.25, build: coralLagoon },
  { name: 'Lantern Waltz', day: 0.55, night: 1, build: lanternWaltz },
  { name: "The Corsair's Jig", day: 0.9, night: 0.5, build: corsairsJig },
  { name: 'Siesta Isles', day: 0.6, night: 1, build: siestaIsles },
];
