// Procedural thunder, rendered once into buffers.
// A near strike opens with the ripping crackle of the channel (a burst of
// sharp, ever-closer transients), then the long rumble: brown noise kept low
// and rolled around by a handful of overlapping swells as the sound of the
// whole channel arrives from different distances. A far strike is only the
// rumble, darker and slower.

export function renderThunder(sr: number, near: boolean, seed: number): Float32Array[] {
  let s = seed * 9301 + 49297;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s & 0xffff) / 0xffff;
  };
  const len = Math.floor(sr * (near ? 7.5 : 9));
  const L = new Float32Array(len);
  const R = new Float32Array(len);

  // rumble envelope: overlapping rolls
  const rolls: { at: number; w: number; a: number }[] = [];
  const nRolls = near ? 7 : 5;
  for (let i = 0; i < nRolls; i++) {
    rolls.push({ at: (near ? 0.15 : 0.6) + rnd() * (near ? 4 : 5.5), w: 0.35 + rnd() * (near ? 0.9 : 1.6), a: 0.4 + rnd() * 0.6 });
  }
  const cut = near ? 0.03 : 0.016; // one-pole lowpass coefficient (~200 / ~110 Hz)
  let bL = 0, bR = 0, lpL = 0, lpR = 0, lp2L = 0, lp2R = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    let env = 0;
    for (const r of rolls) {
      const d = (t - r.at) / r.w;
      env += r.a * (d < 0 ? Math.exp(-d * d * 6) : Math.exp(-d * 1.4));
    }
    env *= Math.min(1, t * (near ? 30 : 2)) * Math.exp(-t / (near ? 3.2 : 4));
    // brown noise, slightly decorrelated per channel
    bL = (bL + (rnd() * 2 - 1) * 0.06) * 0.997;
    bR = (bR + (rnd() * 2 - 1) * 0.06) * 0.997;
    lpL += (bL - lpL) * cut;
    lpR += (bR - lpR) * cut;
    lp2L += (lpL - lp2L) * cut * 2;
    lp2R += (lpR - lp2R) * cut * 2;
    L[i] = lp2L * env * 7;
    R[i] = lp2R * env * 7;
  }

  if (near) {
    // the crack: dozens of sharp, filtered snaps tumbling over each other
    const n = 40 + Math.floor(rnd() * 30);
    for (let k = 0; k < n; k++) {
      const at = Math.pow(rnd(), 1.8) * 0.75;
      const amp = (0.25 + rnd() * 0.75) * (1 - at * 0.9);
      const dur = Math.floor(sr * (0.004 + rnd() * 0.02));
      const start = Math.floor(at * sr);
      const pan = rnd();
      let hp = 0, prev = 0;
      for (let j = 0; j < dur && start + j < len; j++) {
        const w = rnd() * 2 - 1;
        hp = 0.82 * (hp + w - prev);
        prev = w;
        const e = Math.exp(-j / (dur * 0.3));
        const v = hp * e * amp * 0.7;
        L[start + j] += v * (1 - pan * 0.6);
        R[start + j] += v * (0.4 + pan * 0.6);
      }
    }
  }

  // normalise
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = peak > 0 ? 0.9 / peak : 1;
  for (let i = 0; i < len; i++) {
    L[i] *= g;
    R[i] *= g;
  }
  return [L, R];
}
