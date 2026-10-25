// Renders every sound the Android game plays with the web game's own code, in
// the browser's OfflineAudioContext, so both games sound the same: the sample
// bank (src/core/sfx.ts), the thunder (src/core/thunder.ts), the one-shots the
// web plays from live oscillators (src/core/audio.ts), the noise its sea, wind
// and rain beds are filtered from, the quay's own loops, the voyage band's songs
// (src/core/voyageMusic.ts) and the high seas' theme, as a seamless loop.
// Run through tools/audio/bake_audio.mjs, which writes the files.
//
// Each sound comes back peak-normalised as 16-bit WAV, with the gain that
// puts it back at the web's level (godot/audio/sounds.json keeps it).

import {
  cannonBlast,
  chainRip,
  coinPour,
  crackleHail,
  creak,
  crowdMurmur,
  earthImpact,
  fireCrackle,
  goldClink,
  grapeHail,
  gunRecoil,
  harbourLap,
  hullCrunch,
  igniteWhoomp,
  ironClunk,
  magazineBlast,
  mallet,
  purseDrop,
  rocketLaunch,
  shellBoom,
  shellBurst,
  shotWhoosh,
  splitPops,
  steamHiss,
  waterImpact,
  willowSizzle,
  woodImpact,
} from '../../../src/core/sfx';
import { renderThunder } from '../../../src/core/thunder';
import { ARRIVAL, Audio, FLOURISH } from '../../../src/core/audio';
import { ChunkSource, ChunkStream } from '../../../src/core/prerender';
import { kitJobs } from '../../../src/core/musicKit';
import { Playing, VoyageMusic } from '../../../src/core/voyageMusic';
import { SONGS } from '../../../src/core/songs';

/** The bank and the one-shots: plenty for a phone's speaker or a pair of earbuds. */
const SR = 32000;
/** The high seas' theme is soft and dark: the web renders it this low too. */
const SEA_SR = 24000;
/** Bars of the high seas' theme in the loop: four turns of its sixteen-bar chord cycle (four minutes). */
const SEA_BARS = 64;
const SEA_BAR = (60 / 64) * 4;
/** Peak a sound is normalised to. */
const PEAK = 0.89;

interface Job {
  name: string;
  sr: number;
  /** Long, rare sounds (and the music) are kept as Ogg Vorbis; the rest as WAV, which a phone mixes for free. */
  ogg?: boolean;
  render: () => Promise<Float32Array[]> | Float32Array[];
  /** Keep the length as rendered (a loop), rather than trimming the silence off its tail. */
  exact?: boolean;
  /** Song metadata for the rotation. */
  meta?: Record<string, unknown>;
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The web's pink noise (Audio.start), `len` seconds of it, looping without a seam. */
function pink(len: number, sr: number): Float32Array {
  const n = Math.floor(len * sr);
  const d = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0;
  // twice round: the second pass starts from the state the first one ended in, so the loop has no seam
  for (let pass = 0; pass < 2; pass++) {
    const r = mulberry(7);
    for (let i = 0; i < n; i++) {
      const w = r() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.029591;
      b1 = 0.985 * b1 + w * 0.032534;
      b2 = 0.95 * b2 + w * 0.048056;
      d[i] = (b0 + b1 + b2 + w * 0.05) * 1.6;
    }
  }
  return d;
}

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const b = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
  b.getChannelData(0).set(pink(3, ctx.sampleRate));
  return b;
}

/**
 * One of the web's live one-shots, played into an offline context: an Audio
 * whose voices all lead straight to the output (no panning, no echo: the
 * game pans it and sends it to its own echo) and whose bank samples are left
 * out (the game plays them alongside, from the bank).
 */
async function oneShot(sr: number, len: number, play: (a: any) => void): Promise<Float32Array[]> {
  const oc = new OfflineAudioContext(1, Math.ceil(len * sr), sr);
  const a: any = new Audio();
  const bus = oc.createGain();
  bus.connect(oc.destination);
  a.ctx = oc;
  a.master = a.sfxBus = a.ambBus = bus;
  a.reverbIn = oc.createGain();
  a.muffle = oc.createBiquadFilter();
  a.duckGain = oc.createGain();
  a.noise = noiseBuffer(oc);
  a.muted = false;
  a.voice = (vol: number) => {
    const g = oc.createGain();
    g.gain.value = vol;
    g.connect(bus);
    return [oc, g];
  };
  a.emit = () => -1;
  play(a);
  const buf = await oc.startRendering();
  return [buf.getChannelData(0)];
}

/** One of the voyage band's songs, start to finish, its hall and all; `meta.end` is when its last note is done (Playing.end), where the rotation's gap begins. */
async function song(index: number, meta: Record<string, unknown>): Promise<Float32Array[]> {
  // an offline band plays live (not from tape), its hall at the render's own rate
  const ev = SONGS[index].build(Math.random);
  const kit = kitJobs(SR).map((j) => ({ j, data: j.render() }));
  // as long as the song (Playing.end) and its ring-out (VoyageMusic.ringOut)
  let end = 0;
  for (const e of ev) end = Math.max(end, e.t + e.d);
  let longest = 2.6;
  for (const { j, data } of kit) if (j.kind !== 'verb') longest = Math.max(longest, data[0].length / j.sr);
  const verbLen = kit.find(({ j }) => j.kind === 'verb')!.data[0].length / SR;
  const len = 0.1 + Math.max(end, ev[ev.length - 1].t) + 2.5 + Math.max(longest * 1.12, 1.7) + verbLen + 0.1;
  meta.end = +(0.1 + Math.max(end, ev[ev.length - 1].t) + 2.5).toFixed(3);
  const oc = new OfflineAudioContext(2, Math.ceil(len * SR), SR);
  const band = new VoyageMusic(oc, oc.destination, noiseBuffer(oc), kit.length);
  for (const { j, data } of kit) {
    const b = oc.createBuffer(data.length, data[0].length, j.sr);
    data.forEach((d, c) => b.getChannelData(c).set(d));
    band.store(j.kind, j.index, b);
  }
  new Playing(band, index, ev, 0.1).pump(Infinity);
  const buf = await oc.startRendering();
  return [buf.getChannelData(0), buf.getChannelData(1)];
}

/**
 * The high seas' theme: the web's own score (Audio.highSeas), taken off the
 * tape it streams from and rendered SEA_BARS bars long in one pass, then
 * folded into a seamless loop: the ring-out past the last bar lands on the
 * first, as it does when the cycle comes round again.
 */
async function seaTheme(): Promise<Float32Array[]> {
  let tape: ChunkSource | null = null;
  const pump = ChunkStream.prototype.pump;
  ChunkStream.prototype.pump = function (this: { src: ChunkSource }) {
    tape = this.src;
  };
  const live = new AudioContext();
  const a: any = new Audio();
  a.ctx = live;
  a.master = live.createGain();
  a.noise = noiseBuffer(live);
  a.musicEnabled = true;
  a.highSeas(true);
  clearInterval(a.seaSong.timer);
  ChunkStream.prototype.pump = pump;
  await live.close();
  if (!tape) throw new Error('the high seas theme never reached its tape');
  const src = tape as ChunkSource;
  const to = SEA_BARS * SEA_BAR;
  const { len } = src.span(0, to);
  const oc = new OfflineAudioContext(2, Math.ceil(len * SEA_SR), SEA_SR);
  src.render(oc, oc.destination, 0, to);
  const buf = await oc.startRendering();
  // the tape's lead-in (a harp note may start a hair before its bar), then the bars
  const pre = Math.round(0.05 * SEA_SR);
  const n = Math.round(to * SEA_SR);
  const out: Float32Array[] = [];
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    const loop = new Float32Array(n);
    for (let i = 0; i < n; i++) loop[i] = d[pre + i];
    // what rings on past the last bar sounds over the first bars again
    for (let i = pre + n; i < d.length; i++) loop[(i - pre) % n] += d[i];
    // and what came in early on the first bar comes in early on the next time round
    for (let i = 0; i < pre; i++) loop[n - pre + i] += d[i];
    out.push(loop);
  }
  return out;
}

const jobs: Job[] = [];
const bank = (name: string, n: number, make: (v: number) => Float32Array) => {
  for (let v = 0; v < n; v++) jobs.push({ name: `${name}_${v}`, sr: SR, render: () => [make(v)] });
};

// ------------------------------------------------------------------ the bank (the web's bankJobs seeds)
for (let c = 0; c < 3; c++) bank(`cannon${c}`, 2, (v) => cannonBlast(SR, c / 2, 101 + c * 17 + v * 5));
bank('recoil', 3, (v) => gunRecoil(SR, 301 + v));
bank('wood', 3, (v) => woodImpact(SR, 401 + v));
bank('water', 3, (v) => waterImpact(SR, 501 + v));
bank('earth', 1, () => earthImpact(SR, 601));
bank('whoosh', 2, (v) => shotWhoosh(SR, 701 + v));
bank('crunch', 2, (v) => hullCrunch(SR, 901 + v));
bank('blast', 2, (v) => magazineBlast(SR, 801 + v));
bank('shell', 2, (v) => shellBurst(SR, 1001 + v));
bank('ignite', 1, () => igniteWhoomp(SR, 1101));
bank('steam', 1, () => steamHiss(SR, 1201));
bank('grape', 2, (v) => grapeHail(SR, 1301 + v));
bank('chain', 2, (v) => chainRip(SR, 1401 + v));
bank('flames', 1, () => fireCrackle(SR, 1501));
bank('coin', 6, (v) => goldClink(SR, 1601 + v));
// the port: gold poured out (a handful, a fortune), a purse thumped down, the
// lines (two hawsers, then the pilings' timber), the yard's mallet and its shot
// set down in the racks; the water among the pilings and the quay's hubbub, as loops
bank('pour0', 1, () => coinPour(SR, 1701, 0.6));
bank('pour1', 1, () => coinPour(SR, 1702, 1.5));
bank('purse', 2, (v) => purseDrop(SR, 1801 + v));
for (let c = 0; c < 3; c++) bank(`creak${c}`, 1, () => creak(SR, 1901 + c, c < 2));
bank('mallet', 2, (v) => mallet(SR, 2001 + v));
bank('clunk', 2, (v) => ironClunk(SR, 2101 + v));
// fireworks: rockets (two plain, one whistling), bursts (two shells, then a
// showpiece's heavier charge), crackle, a willow's hanging hiss, a crossette's split
for (let v = 0; v < 3; v++) jobs.push({ name: v < 2 ? `rocket_${v}` : 'whistle_0', sr: SR, render: () => [rocketLaunch(SR, 2401 + v, v === 2)] });
for (let v = 0; v < 3; v++) jobs.push({ name: v < 2 ? `fw_boom_${v}` : 'fw_big_0', sr: SR, render: () => [shellBoom(SR, 2501 + v, v === 2)] });
for (let v = 0; v < 2; v++) jobs.push({ name: `fw_crackle_${v}`, sr: SR, render: () => [crackleHail(SR, 2601 + v)] });
jobs.push({ name: 'fw_sizzle_0', sr: SR, render: () => [willowSizzle(SR, 2701)] });
jobs.push({ name: 'fw_pop_0', sr: SR, render: () => [splitPops(SR, 2801)] });
jobs.push({ name: 'lap_0', sr: SR, exact: true, render: () => [harbourLap(SR, 2201)] });
jobs.push({ name: 'murmur_0', sr: SR, exact: true, render: () => [crowdMurmur(SR, 2301)] });

// ------------------------------------------------------------------ thunder: near peals open with the crack, far ones only roll
// (a far one is nothing but a low rumble, so a low rate holds all of it)
for (const [name, near, seeds, sr] of [['thunder_near', true, [1, 3], 22050], ['thunder_far', false, [2, 4], 11025]] as const)
  seeds.forEach((s, v) => jobs.push({ name: `${name}_${v}`, sr, ogg: true, render: () => renderThunder(sr, near, s) }));

// ------------------------------------------------------------------ the one-shots
const shot = (name: string, n: number, len: number, play: (a: any, v: number) => void, o: { sr?: number; ogg?: boolean } = {}) => {
  const sr = o.sr ?? SR;
  for (let v = 0; v < n; v++) jobs.push({ name: `${name}_${v}`, sr, ogg: o.ogg, render: () => oneShot(sr, len, (a) => play(a, v)) });
};
shot('click', 1, 0.15, (a) => a.click());
shot('chime', 1, 1.6, (a) => a.chime());
for (let t = 1; t <= 4; t++) shot(`treasure${t}`, 1, 3.0, (a) => a.treasure(t));
shot('guns_ready', 1, 0.7, (a) => a.gunsReady(0));
// the Treasure Vault: the chest's rumble as its light climbs each rarity, its
// lid bursting open (the game adds the treasure run), a card turning over
for (let l = 0; l < 4; l++) shot(`vault_rumble${l}`, 1, 1.1, (a) => a.vaultRumble(l));
shot('vault_burst', 1, 1.1, (a) => {
  a.treasure = () => {};
  a.vaultBurst(3);
});
shot('card_flip', 1, 0.3, (a) => {
  a.treasure = () => {};
  a.cardFlip(0);
});
for (let k = 0; k < 6; k++) shot(`ammo${k}`, 1, 0.22, (a) => a.ammoSwap(k));
shot('founder', 1, 12.5, (a) => a.founder(), { sr: 16000, ogg: true });
shot('groan', 3, 3.8, (a) => a.groan(), { sr: 16000, ogg: true });
// a pocket of air of three sizes (small, as a hull settles; large, as she goes)
[0.6, 1.0, 1.5].forEach((size, i) => shot(`air${i}`, 1, 0.9, (a) => a.airPocket(size, 1, 0), { sr: 16000 }));
// the bubbles that rise past as the camera follows her under
shot('bubbles', 1, 2.7, (a) => {
  for (let i = 0; i < 9; i++) a.bubble(0.02 + i * 0.22 + Math.random() * 0.3);
}, { sr: 16000 });
for (let i = 0; i < 6; i++) {
  shot(`tally${i}`, 1, 1.0, (a) => a.tally(i, false));
  shot(`tally_best${i}`, 1, 1.0, (a) => a.tally(i, true));
}
// coral under the keel: the grinding rasp and groan of timber, light and hard
[0.4, 1.0].forEach((k, i) => shot(`scrape${i}`, 1, 0.95, (a) => a.scrape(1, 0, 0, k, false)));
// the port: one stroke of its bell (the game rings it), the squeezebox on the
// quay (the hornpipe for coming alongside, the flourish for a fortune), the
// bosun's pipe for casting off, the quay's cheer (four voices or six), its gulls
shot('bell', 1, 2.6, (a) => a.bell(1, 1));
shot('squeeze_arrival', 1, 2.4, (a) => a.squeezebox(ARRIVAL, 0.14, 0.13));
shot('squeeze_flourish', 1, 1.1, (a) => a.squeezebox(FLOURISH, 0.13, 0.25));
shot('bosun_pipe', 1, 1.5, (a) => a.bosunPipe());
for (const n of [4, 6]) shot(`cheer${n}`, 2, 1.4, (a) => a.shout(1, 0, 0, true, n));
// (a gull pans itself: here it plays straight out, as every voice does)
for (let n = 1; n <= 3; n++)
  shot(`gull${n}`, 2, 1.3, (a) => {
    a.ctx.createStereoPanner = undefined;
    a.gull(1, 0, n);
  });

// ashore: a footfall in dry sand, in the wet (the walk's middle pace), on
// planks or stone, and a jump's push-off and landings (in sand, in the
// shallows, on something hard)
shot('sand_step', 3, 0.3, (a) => a.sandStep(0.5, false));
shot('wet_step', 2, 0.4, (a) => a.sandStep(0.5, true));
shot('foot_step', 2, 0.3, (a) => a.footstep(0.5));
shot('hop_up', 2, 0.3, (a) => a.hop(true, 0, false, false));
shot('hop_sand', 2, 0.6, (a) => a.hop(false, 0.6, false, false));
shot('hop_wet', 1, 0.7, (a) => a.hop(false, 0.6, true, false));
shot('hop_hard', 1, 0.6, (a) => a.hop(false, 0.6, false, true));
// the fight ashore: steel ringing on steel, a blade through the air, a blow
// landing (and a heavy one), the flintlock, and a camp's war cry of three
// voices or five
shot('clash', 3, 1.0, (a) => a.clash(1, 0, 0));
shot('swish', 3, 0.3, (a) => a.swish(1, 0));
shot('thwack', 3, 0.3, (a) => a.thwack(1, 0, 0, false));
shot('thwack_heavy', 2, 0.3, (a) => a.thwack(1, 0, 0, true));
shot('pistol', 2, 0.6, (a) => a.pistol(1, 0, 0));
for (const n of [3, 5]) shot(`war_cry${n}`, 2, 1.3, (a) => a.shout(1, 0, 0, false, n));

// ------------------------------------------------------------------ the sea's own sound: the noise its beds are cut from
jobs.push({ name: 'noise_0', sr: SR, exact: true, render: () => [pink(7.3, SR)] });

// ------------------------------------------------------------------ music
SONGS.forEach((s, i) => {
  const meta: Record<string, unknown> = { title: s.name, day: s.day, night: s.night };
  jobs.push({ name: `song${i}`, sr: SR, ogg: true, render: () => song(i, meta), meta });
});
jobs.push({ name: 'high_seas', sr: SEA_SR, ogg: true, exact: true, render: seaTheme, meta: { title: 'The High Seas', loop: true } });

/** A finished sound: 16-bit PCM in a WAV file, as base64, and how loud it really is. */
function wav(chans: Float32Array[], sr: number, exact: boolean) {
  let peak = 0;
  for (const c of chans) for (let i = 0; i < c.length; i++) peak = Math.max(peak, Math.abs(c[i]));
  let n = chans[0].length;
  if (!exact && peak > 0) {
    // the tail trimmed where it falls below hearing
    const floor = peak * 1e-4;
    while (n > 1 && chans.every((c) => Math.abs(c[n - 1]) < floor)) n--;
    n = Math.min(chans[0].length, n + Math.floor(sr * 0.01));
  }
  const g = peak > 0 ? PEAK / peak : 1;
  const ch = chans.length;
  const bytes = new ArrayBuffer(44 + n * ch * 2);
  const dv = new DataView(bytes);
  const str = (o: number, s: string) => [...s].forEach((c, k) => dv.setUint8(o + k, c.charCodeAt(0)));
  str(0, 'RIFF');
  dv.setUint32(4, 36 + n * ch * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, ch, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * ch * 2, true);
  dv.setUint16(32, ch * 2, true);
  dv.setUint16(34, 16, true);
  str(36, 'data');
  dv.setUint32(40, n * ch * 2, true);
  const fade = exact ? 0 : Math.min(n, Math.floor(sr * 0.008));
  for (let i = 0; i < n; i++) {
    const f = i >= n - fade ? (n - 1 - i) / fade : 1;
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i] * g * f));
      dv.setInt16(44 + (i * ch + c) * 2, Math.round(v * 32767), true);
    }
  }
  let bin = '';
  const u8 = new Uint8Array(bytes);
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return { wav: btoa(bin), gain: peak > 0 ? 1 / g : 0, seconds: n / sr, channels: ch };
}

(window as any).aquatiBake = {
  list: () => jobs.map((j) => j.name),
  async render(name: string) {
    const j = jobs.find((x) => x.name === name);
    if (!j) throw new Error(`no such sound: ${name}`);
    // every take the same each bake
    let h = 0;
    for (const c of name) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
    Math.random = mulberry(h);
    const chans = await j.render();
    return { ...wav(chans, j.sr, !!j.exact), sr: j.sr, ogg: !!j.ogg, music: !!j.meta, meta: j.meta ?? {} };
  },
};
