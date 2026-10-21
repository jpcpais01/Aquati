import type { CallKind } from '../fx/wild/wildlife';

// The island beasts' voices, synthesised on the spot like the gulls': a
// goat's quavering bleat, a deer's alarm snort, the sow's grunts and her
// piglets' squeals, capuchin chatter and screams, the macaw's raucous
// squawk, flamingos' goose-like honking, the heron's croak, a sea lion's
// barking, a tortoise's hiss, the booby's whistle, crab clicks and the
// hummingbird's tiny chip. Each is a voice or two through a formant filter,
// shaped in pitch and loudness; `pitch` lifts the young ones' voices.

type Noise = (at: number, dur: number, rate?: number) => AudioBufferSourceNode;

export function wildCall(ctx: AudioContext, out: AudioNode, noise: Noise, kind: CallKind, n: number, pitch: number) {
  const t0 = ctx.currentTime + Math.random() * 0.06;
  const nodes: AudioNode[] = [];
  const keep = <T extends AudioNode>(node: T) => {
    nodes.push(node);
    return node;
  };
  const filter = (type: BiquadFilterType, f: number, q = 1) => {
    const b = keep(ctx.createBiquadFilter());
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  };
  /** An envelope: up in `att`, held, and away by `len`. */
  const env = (t: number, len: number, peak: number, att = 0.015) => {
    const g = keep(ctx.createGain());
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + att);
    g.gain.setValueAtTime(peak, t + Math.max(att, len * 0.55));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    return g;
  };
  /** A voice gliding through `f` (Hz at 0, middle, end), with an optional quaver (rate Hz, depth share). */
  const voice = (type: OscillatorType, t: number, len: number, f: [number, number, number], dest: AudioNode, peak: number, wob = 0, depth = 0) => {
    const o = keep(ctx.createOscillator());
    o.type = type;
    o.frequency.setValueAtTime(f[0] * pitch, t);
    o.frequency.exponentialRampToValueAtTime(f[1] * pitch, t + len * 0.35);
    o.frequency.exponentialRampToValueAtTime(f[2] * pitch, t + len);
    if (wob) {
      const lfo = keep(ctx.createOscillator());
      lfo.frequency.value = wob;
      const lg = keep(ctx.createGain());
      lg.gain.value = f[0] * pitch * depth;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + len + 0.02);
    }
    o.connect(env(t, len, peak)).connect(dest);
    o.start(t);
    o.stop(t + len + 0.02);
  };
  const hiss = (t: number, len: number, dest: AudioNode, peak: number, rate = 1, att = 0.01) => {
    const s = keep(noise(t, len + 0.02, rate));
    s.connect(env(t, len, peak, att)).connect(dest);
  };
  let end = t0;
  const R = (a: number, b: number) => a + Math.random() * (b - a);
  switch (kind) {
    case 'bleat':
    case 'kid': {
      // "maa-a-a": a reedy voice with the goat's quaver through an open-mouthed formant
      const kid = kind === 'kid';
      const f = filter('bandpass', kid ? 1500 : 1100, 1.4);
      f.connect(filter('lowpass', 2800)).connect(out);
      const len = kid ? R(0.35, 0.5) : R(0.55, 0.8);
      const b = kid ? R(520, 600) : R(300, 360);
      voice('sawtooth', t0, len, [b, b * 1.06, b * 0.9], f, 0.5, kid ? 8.5 : 6.5, 0.12);
      end = t0 + len;
      break;
    }
    case 'snort': {
      // a blast of breath through the nose
      const f = filter('bandpass', R(600, 900), 0.9);
      f.connect(out);
      for (let i = 0; i < n; i++) {
        const t = t0 + i * 0.32;
        hiss(t, 0.2, f, 0.9, 0.7 * pitch, 0.008);
        end = t + 0.22;
      }
      break;
    }
    case 'grunt': {
      const f = filter('lowpass', 520, 2);
      f.connect(out);
      for (let i = 0; i < n; i++) {
        const t = t0 + i * R(0.2, 0.3);
        const b = R(85, 110);
        voice('sawtooth', t, 0.13, [b * 1.1, b, b * 0.85], f, 0.7, 30, 0.2);
        hiss(t, 0.1, f, 0.3, 0.5);
        end = t + 0.15;
      }
      break;
    }
    case 'squeal': {
      const f = filter('bandpass', 1500, 2);
      f.connect(out);
      for (let i = 0; i < n; i++) {
        const t = t0 + i * 0.42;
        voice('sawtooth', t, R(0.3, 0.42), [R(800, 950), R(1250, 1400), R(900, 1050)], f, 0.45, 42, 0.05);
        end = t + 0.45;
      }
      break;
    }
    case 'chatter': {
      // quick twittering chirps
      const f = filter('bandpass', 1800, 1.2);
      f.connect(out);
      for (let i = 0; i < n; i++) {
        const t = t0 + i * R(0.06, 0.09);
        const b = R(1100, 1500);
        voice('triangle', t, 0.055, [b, b * 1.5, b * 1.2], f, 0.6);
        end = t + 0.07;
      }
      break;
    }
    case 'screech': {
      const f = filter('bandpass', 2400, 2.5);
      f.connect(out);
      for (let i = 0; i < n; i++) {
        const t = t0 + i * 0.5;
        voice('sawtooth', t, 0.42, [R(1500, 1700), R(2200, 2500), 1500], f, 0.5, 55, 0.04);
        hiss(t, 0.35, f, 0.25, 1.2);
        end = t + 0.45;
      }
      break;
    }
    case 'squawk': {
      // the macaw's raucous, grating cry: two voices beating against each other
      const f = filter('bandpass', 1500, 1.1);
      f.connect(filter('highpass', 500)).connect(out);
      for (let i = 0; i < n; i++) {
        const t = t0 + i * R(0.38, 0.5);
        const b = R(560, 680);
        voice('sawtooth', t, 0.32, [b, b * 1.45, b * 0.85], f, 0.45, 72, 0.18);
        voice('square', t, 0.3, [b * 1.02, b * 1.4, b * 0.8], f, 0.18);
        hiss(t, 0.26, f, 0.2, 1.4);
        end = t + 0.34;
      }
      break;
    }
    case 'honk': {
      // flamingos gabble like geese
      const f = filter('bandpass', 950, 3.5);
      f.connect(out);
      const f2 = filter('bandpass', 2300, 4);
      f2.connect(out);
      for (let i = 0; i < n; i++) {
        const t = t0 + i * R(0.18, 0.26);
        const b = R(460, 540) * (i % 2 ? 0.9 : 1);
        voice('sawtooth', t, 0.16, [b, b * 1.05, b * 0.88], f, 0.6);
        voice('sawtooth', t, 0.16, [b, b * 1.05, b * 0.88], f2, 0.2);
        end = t + 0.18;
      }
      break;
    }
    case 'croak': {
      // the heron's harsh "frahnk"
      const f = filter('bandpass', 620, 2);
      f.connect(out);
      for (let i = 0; i < n; i++) {
        const t = t0 + i * 0.5;
        voice('sawtooth', t, 0.38, [190, 170, 130], f, 0.75, 27, 0.35);
        end = t + 0.4;
      }
      break;
    }
    case 'bark': {
      const f = filter('bandpass', 760, 1.4);
      f.connect(out);
      for (let i = 0; i < n; i++) {
        const t = t0 + i * R(0.32, 0.42);
        const b = R(280, 330);
        voice('sawtooth', t, 0.2, [b, b * 1.1, b * 0.7], f, 0.8, 35, 0.1);
        hiss(t, 0.14, f, 0.35, 0.6);
        end = t + 0.22;
      }
      break;
    }
    case 'hiss': {
      const f = filter('highpass', 2200, 0.7);
      f.connect(out);
      hiss(t0, R(0.5, 0.75), f, 0.6, 1, 0.06);
      end = t0 + 0.8;
      break;
    }
    case 'whistle': {
      const f = filter('lowpass', 4000);
      f.connect(out);
      for (let i = 0; i < n; i++) {
        const t = t0 + i * 0.55;
        voice('sine', t, 0.45, [1700, 2500, 2000], f, 0.5, 9, 0.015);
        end = t + 0.47;
      }
      break;
    }
    case 'click': {
      const f = filter('bandpass', 4200, 3);
      f.connect(out);
      for (let i = 0; i < n * 2; i++) {
        const t = t0 + i * R(0.025, 0.05);
        hiss(t, 0.006, f, 0.9, 2, 0.001);
        end = t + 0.01;
      }
      break;
    }
    case 'chip': {
      const f = filter('highpass', 3000);
      f.connect(out);
      for (let i = 0; i < n; i++) {
        const t = t0 + i * 0.08;
        voice('sine', t, 0.035, [5400, 5000, 4600], f, 0.45);
        end = t + 0.04;
      }
      break;
    }
    case 'clack': {
      // horn on horn: a hard, hollow knock
      const f = filter('bandpass', 1250, 3);
      f.connect(out);
      hiss(t0, 0.05, f, 1, 0.8, 0.002);
      hiss(t0 + 0.06, 0.04, f, 0.5, 0.9, 0.002);
      voice('sine', t0, 0.09, [210, 170, 120], out, 0.5);
      end = t0 + 0.12;
      break;
    }
  }
  setTimeout(() => {
    for (const nd of nodes) nd.disconnect();
  }, (end - ctx.currentTime) * 1000 + 300);
}
