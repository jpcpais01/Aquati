import { FxItem, RARITIES } from '../ships/cosmetics';

// Little looping vignettes for cannon cosmetics: a gun fires its muzzle blast,
// or a ball flies across the card trailing its shot trail. 2D canvas, a
// handful of particles each, so a whole collection of them stays cheap.

type RGB = [number, number, number];

interface Q {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number;
  s0: number; s1: number;
  c0: RGB; c1: RGB;
  a: number;
  add: boolean;
  drag: number; grav: number;
  shape: 0 | 1 | 2 | 3; // soft glow, smoke puff, spark, chip
  rot: number; spin: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const hue = (h: number): RGB => {
  const f = (n: number) => Math.min(1, Math.max(0, Math.abs(((((h + n) % 1) + 1) % 1) * 6 - 3) - 1));
  return [f(0) * 255, f(2 / 3) * 255, f(1 / 3) * 255];
};
const CONFETTI: RGB[] = [[255, 90, 170], [255, 210, 60], [70, 210, 255], [140, 230, 80], [255, 140, 40], [180, 110, 255]];

class Sim {
  qs: Q[] = [];
  bolts: { pts: [number, number][]; life: number }[] = [];
  add(q: Partial<Q> & { x: number; y: number }) {
    if (this.qs.length > 260) this.qs.shift();
    this.qs.push({ vx: 0, vy: 0, life: 0, max: 1, s0: 4, s1: 4, c0: [255, 255, 255], c1: [255, 255, 255], a: 1, add: false, drag: 0, grav: 0, shape: 0, rot: Math.random() * 6.28, spin: 0, ...q } as Q);
  }
  step(dt: number) {
    for (let i = this.qs.length - 1; i >= 0; i--) {
      const q = this.qs[i];
      q.life += dt;
      if (q.life >= q.max) {
        this.qs.splice(i, 1);
        continue;
      }
      const k = Math.exp(-q.drag * dt);
      q.vx *= k;
      q.vy *= k;
      q.vy += q.grav * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.rot += q.spin * dt;
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) if ((this.bolts[i].life -= dt) <= 0) this.bolts.splice(i, 1);
  }
  draw(g: CanvasRenderingContext2D, k: number) {
    for (const pass of [false, true]) {
      g.globalCompositeOperation = pass ? 'lighter' : 'source-over';
      for (const q of this.qs) {
        if (q.add !== pass) continue;
        const t = q.life / q.max;
        const c = q.c0.map((v, i) => Math.round(v + (q.c1[i] - v) * t));
        const fin = Math.min(1, q.life / 0.05);
        const a = q.a * fin * (1 - t * t);
        const s = (q.s0 + (q.s1 - q.s0) * Math.sqrt(t)) * k;
        if (a <= 0.01 || s <= 0.1) continue;
        if (q.shape === 3) {
          g.save();
          g.translate(q.x * k, q.y * k);
          g.rotate(q.rot);
          g.scale(1, Math.cos(q.rot * 1.7));
          g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`;
          g.fillRect(-s, -s * 0.6, s * 2, s * 1.2);
          g.restore();
          continue;
        }
        if (q.shape === 2) {
          g.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`;
          g.beginPath();
          g.arc(q.x * k, q.y * k, s, 0, 6.283);
          g.fill();
          continue;
        }
        const gr = g.createRadialGradient(q.x * k, q.y * k, 0, q.x * k, q.y * k, s);
        const edge = q.shape === 1 ? 0.55 : 0.0;
        gr.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a})`);
        gr.addColorStop(0.5, `rgba(${c[0]},${c[1]},${c[2]},${a * (q.shape === 1 ? 0.8 : 0.35)})`);
        gr.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},${edge * 0})`);
        g.fillStyle = gr;
        g.beginPath();
        g.arc(q.x * k, q.y * k, s, 0, 6.283);
        g.fill();
      }
    }
    g.globalCompositeOperation = 'lighter';
    for (const b of this.bolts) {
      g.strokeStyle = `rgba(200,190,255,${Math.min(1, b.life * 8)})`;
      g.lineWidth = 2 * k;
      g.beginPath();
      b.pts.forEach(([x, y], i) => (i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k)));
      g.stroke();
      g.strokeStyle = `rgba(255,255,255,${Math.min(1, b.life * 10)})`;
      g.lineWidth = 0.8 * k;
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
  }
}

// --------------------------------------------------------------- blasts (gun at x=34,y=62 firing right)

function smoke(sim: Sim, x: number, y: number, tint: RGB, n = 6, alpha = 0.55) {
  for (let i = 0; i < n; i++) {
    const g = rand(0.85, 1);
    sim.add({ x, y, vx: rand(20, 90), vy: rand(-14, 4), max: rand(1.6, 2.6), s0: rand(4, 6), s1: rand(16, 24), c0: [tint[0] * g, tint[1] * g, tint[2] * g], c1: tint, a: alpha, drag: 1.8, grav: -6, shape: 1 });
  }
}

function flash(sim: Sim, x: number, y: number, c: RGB, s = 14) {
  sim.add({ x, y, max: 0.16, s0: s, s1: s * 1.6, c0: c, c1: [c[0] * 0.5, c[1] * 0.3, c[2] * 0.2], add: true });
}

function sparks(sim: Sim, x: number, y: number, c: RGB, n: number, spread = 40) {
  for (let i = 0; i < n; i++) sim.add({ x, y, vx: rand(80, 200), vy: rand(-spread, spread), max: rand(0.15, 0.35), s0: rand(1.4, 2.2), s1: 0.4, c0: c, c1: [c[0] * 0.6, c[1] * 0.3, c[2] * 0.2], add: true, drag: 5, shape: 2 });
}

const BLAST: Record<string, (s: Sim, x: number, y: number) => void> = {
  powder: (s, x, y) => {
    flash(s, x, y, [255, 214, 140]);
    sparks(s, x, y, [255, 190, 90], 6);
    smoke(s, x, y, [232, 228, 220]);
  },
  seasalt: (s, x, y) => {
    flash(s, x, y, [255, 255, 255], 16);
    sparks(s, x, y, [235, 245, 255], 6);
    smoke(s, x, y, [252, 252, 255], 8, 0.7);
    for (let i = 0; i < 8; i++) s.add({ x, y, vx: rand(40, 120), vy: rand(-50, -10), max: rand(0.6, 1), s0: 1.3, s1: 0.8, c0: [230, 248, 255], c1: [200, 230, 245], grav: 160, shape: 2 });
  },
  soot: (s, x, y) => {
    flash(s, x, y, [255, 150, 60]);
    sparks(s, x, y, [255, 140, 50], 7);
    smoke(s, x, y, [60, 55, 52], 8, 0.8);
  },
  ember: (s, x, y) => {
    flash(s, x, y, [255, 170, 80]);
    for (let i = 0; i < 20; i++) s.add({ x, y, vx: rand(40, 150), vy: rand(-110, -20), max: rand(0.9, 1.6), s0: rand(1.4, 2.2), s1: 0.5, c0: [255, 190, 90], c1: [255, 70, 20], add: true, grav: 140, drag: 0.6, shape: 2 });
    smoke(s, x, y, [235, 215, 195], 4, 0.45);
  },
  ring: (s, x, y) => {
    flash(s, x, y, [255, 214, 140], 11);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      s.add({ x: x + 6, y: y + Math.sin(a) * 4, vx: 70 + Math.cos(a) * 10, vy: Math.sin(a) * 30, max: 2.2, s0: 3, s1: 6, c0: [250, 250, 252], c1: [235, 240, 245], a: 0.75, drag: 1.1, shape: 1 });
    }
  },
  azure: (s, x, y) => {
    flash(s, x, y, [140, 220, 255], 16);
    sparks(s, x, y, [120, 230, 255], 12, 60);
    for (let i = 0; i < 6; i++) s.add({ x, y, vx: rand(60, 150), vy: rand(-12, 12), max: rand(0.25, 0.4), s0: 5, s1: 11, c0: [90, 170, 255], c1: [30, 60, 200], add: true, drag: 4 });
    smoke(s, x, y, [205, 228, 255], 5, 0.5);
  },
  confetti: (s, x, y) => {
    flash(s, x, y, [255, 240, 200], 10);
    for (let i = 0; i < 36; i++) s.add({ x, y, vx: rand(40, 170), vy: rand(-120, 0), max: rand(1.6, 2.6), s0: rand(1.8, 2.6), s1: rand(1.8, 2.6), c0: CONFETTI[i % 6], c1: CONFETTI[i % 6], grav: 60, drag: 2, spin: rand(-10, 10), shape: 3 });
    smoke(s, x, y, [248, 246, 250], 3, 0.4);
  },
  dragon: (s, x, y) => {
    flash(s, x, y, [255, 220, 120], 18);
    for (let i = 0; i < 34; i++) {
      const hot = i < 8;
      s.add({ x, y, vx: rand(120, 300), vy: rand(-28, 28), max: rand(0.3, 0.6), s0: rand(4, 6), s1: rand(12, 18), c0: hot ? [255, 245, 200] : [255, 160, 50], c1: [200, 40, 10], add: true, drag: 3, grav: -40 });
    }
    for (let i = 0; i < 12; i++) s.add({ x: x + rand(30, 90), y, vx: rand(20, 80), vy: rand(-60, 0), max: rand(1, 1.6), s0: 1.8, s1: 0.4, c0: [255, 180, 80], c1: [255, 60, 10], add: true, grav: 120, shape: 2 });
    smoke(s, x + 30, y, [70, 62, 58], 6, 0.6);
  },
  thunder: (s, x, y) => {
    flash(s, x, y, [235, 230, 255], 20);
    for (let b = 0; b < 3; b++) {
      const pts: [number, number][] = [[x, y]];
      let px = x, py = y;
      const ang = rand(-0.7, 0.7);
      for (let i = 0; i < 7; i++) {
        px += Math.cos(ang) * rand(10, 20);
        py += Math.sin(ang) * rand(8, 16) + rand(-9, 9);
        pts.push([px, py]);
      }
      s.bolts.push({ pts, life: 0.22 });
    }
    sparks(s, x, y, [200, 180, 255], 14, 90);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      s.add({ x: x + 10, y: y + 12, vx: Math.cos(a) * 120, vy: Math.sin(a) * 18, max: 0.35, s0: 4, s1: 7, c0: [170, 140, 255], c1: [60, 30, 160], add: true, drag: 3 });
    }
    smoke(s, x, y, [240, 238, 252], 5, 0.45);
  },
};

// --------------------------------------------------------------- trails

const TRAIL: Record<string, { streak: RGB | 'rainbow' | null; emit: (s: Sim, x: number, y: number, t: number) => void }> = {
  powder: { streak: null, emit: (s, x, y) => s.add({ x, y, vy: -6, max: 1.1, s0: 1.5, s1: 7, c0: [240, 238, 234], c1: [235, 235, 235], a: 0.35, drag: 1, shape: 1 }) },
  spray: {
    streak: null,
    emit: (s, x, y) => {
      s.add({ x, y, vy: -4, max: 0.8, s0: 1.5, s1: 6, c0: [240, 252, 255], c1: [220, 240, 250], a: 0.32, shape: 1 });
      s.add({ x, y, vx: rand(-20, 20), vy: rand(-20, 0), max: 0.6, s0: 1, s1: 0.6, c0: [240, 252, 255], c1: [190, 230, 245], grav: 120, shape: 2 });
    },
  },
  soot: { streak: null, emit: (s, x, y) => s.add({ x, y, vy: -6, max: 1.5, s0: 2, s1: 9, c0: [70, 64, 60], c1: [110, 105, 102], a: 0.5, drag: 1, shape: 1 }) },
  ember: { streak: [255, 140, 50], emit: (s, x, y) => s.add({ x, y, vx: rand(-15, 15), vy: rand(-10, 10), max: rand(0.5, 0.9), s0: 1.6, s1: 0.4, c0: [255, 190, 90], c1: [255, 60, 10], add: true, grav: 80, shape: 2 }) },
  frost: {
    streak: [140, 220, 255],
    emit: (s, x, y) => {
      s.add({ x, y, vy: -3, max: 1.1, s0: 1.5, s1: 6, c0: [225, 245, 255], c1: [200, 235, 255], a: 0.35, shape: 1 });
      if (Math.random() < 0.7) s.add({ x: x + rand(-4, 4), y: y + rand(-4, 4), vx: rand(-8, 8), vy: rand(-4, 12), max: rand(0.6, 1), s0: 1.5, s1: 0.3, c0: [210, 245, 255], c1: [90, 180, 255], add: true, shape: 2 });
    },
  },
  comet: {
    streak: [255, 200, 90],
    emit: (s, x, y) => {
      s.add({ x, y, max: 0.5, s0: 5, s1: 1, c0: [255, 220, 120], c1: [255, 120, 20], add: true });
      if (Math.random() < 0.6) s.add({ x: x + rand(-3, 3), y: y + rand(-3, 3), vx: rand(-10, 10), vy: rand(-6, 10), max: rand(0.6, 1.1), s0: 1.6, s1: 0.3, c0: [255, 230, 140], c1: [255, 140, 30], add: true, shape: 2 });
    },
  },
  ghost: {
    streak: [110, 255, 180],
    emit: (s, x, y, t) => s.add({ x: x + Math.sin(t * 9) * 3, y: y + Math.cos(t * 11) * 3, vx: rand(-6, 6), vy: rand(-20, -6), max: rand(0.6, 0.9), s0: 3, s1: 8, c0: [120, 255, 190], c1: [10, 120, 70], add: true }),
  },
  rainbow: {
    streak: 'rainbow',
    emit: (s, x, y, t) => {
      const c = hue(t * 0.7);
      s.add({ x, y, max: 0.6, s0: 4, s1: 1, c0: c, c1: c.map((v) => v * 0.4) as RGB, add: true });
      if (Math.random() < 0.7) {
        const c2 = hue(Math.random());
        s.add({ x: x + rand(-4, 4), y: y + rand(-4, 4), vx: rand(-14, 14), vy: rand(-8, 14), max: rand(0.7, 1.2), s0: 1.7, s1: 0.3, c0: c2, c1: c2, add: true, shape: 2 });
      }
    },
  },
  starfall: {
    streak: [210, 190, 255],
    emit: (s, x, y) => {
      const v = Math.random() < 0.5;
      s.add({ x: x + rand(-5, 5), y: y + rand(-5, 5), vx: rand(-4, 4), vy: rand(2, 10), max: rand(1.2, 2), s0: rand(1.6, 2.4), s1: 0.4, c0: v ? [255, 255, 255] : [200, 160, 255], c1: [140, 110, 255], add: true, shape: 2 });
    },
  },
};

function drawGun(g: CanvasRenderingContext2D, k: number, x: number, y: number, recoil: number) {
  g.save();
  g.translate((x - 22 - recoil * 6) * k, y * k);
  // carriage
  g.fillStyle = '#5a3a22';
  g.beginPath();
  g.roundRect(-4 * k, 3 * k, 22 * k, 8 * k, 2 * k);
  g.fill();
  g.fillStyle = '#2e1d12';
  for (const wx of [0, 14]) {
    g.beginPath();
    g.arc(wx * k, 12 * k, 4 * k, 0, 6.283);
    g.fill();
  }
  // barrel
  const bg = g.createLinearGradient(0, -5 * k, 0, 5 * k);
  bg.addColorStop(0, '#6b6f78');
  bg.addColorStop(0.5, '#2a2c31');
  bg.addColorStop(1, '#141519');
  g.fillStyle = bg;
  g.beginPath();
  g.moveTo(-6 * k, -5 * k);
  g.lineTo(22 * k, -3.6 * k);
  g.lineTo(22 * k, 3.6 * k);
  g.lineTo(-6 * k, 5 * k);
  g.closePath();
  g.fill();
  g.fillStyle = '#d8a54a';
  g.fillRect(20 * k, -4.2 * k, 3 * k, 8.4 * k);
  g.fillRect(4 * k, -4.8 * k, 2 * k, 9.6 * k);
  g.restore();
}

/** Returns a per-frame painter for an fx item's card art. */
export function drawFx(c: HTMLCanvasElement, it: FxItem, card = false): (t: number) => void {
  const g = c.getContext('2d')!;
  const sim = new Sim();
  const R = RARITIES[it.rarity];
  let last = -1;
  let next = 0.3;
  let ballT = -1;
  let recoil = 0;
  const trailFx = it.kind === 'trail' ? TRAIL[it.style] ?? TRAIL.powder : null;
  const blastFx = it.kind === 'blast' ? BLAST[it.style] ?? BLAST.powder : null;
  const hist: [number, number][] = [];
  return (t: number) => {
    // design space is 200 x 120, scaled to the canvas; a card zooms in on the gun
    const k = c.width / (card ? 150 : 200);
    const H = c.height / k;
    const dt = last < 0 ? 0 : Math.min(0.05, t - last);
    last = t;
    next -= dt;
    const gx = card ? 34 : 40, gy = H * (card ? 0.6 : 0.56);
    if (next <= 0) {
      next = it.kind === 'blast' ? 2.1 : 2.4;
      recoil = 1;
      if (blastFx) blastFx(sim, gx, gy);
      else {
        BLAST.powder(sim, gx, gy);
        ballT = 0;
        hist.length = 0;
      }
    }
    recoil = Math.max(0, recoil - dt * 4);
    sim.step(dt);
    g.clearRect(0, 0, c.width, c.height);
    if (card) {
      // a dusk sky over a dark sea, lit by the rarity's colour
      const sky = g.createLinearGradient(0, 0, 0, c.height);
      sky.addColorStop(0, '#061522');
      sky.addColorStop(0.6, R.deep + '99');
      sky.addColorStop(0.74, '#0b2c3c');
      sky.addColorStop(1, '#03101a');
      g.fillStyle = sky;
      g.fillRect(0, 0, c.width, c.height);
      const glow = g.createRadialGradient(c.width * 0.72, H * 0.66 * k, 0, c.width * 0.72, H * 0.66 * k, c.width * 0.6);
      glow.addColorStop(0, R.css + '66');
      glow.addColorStop(1, R.css + '00');
      g.fillStyle = glow;
      g.fillRect(0, 0, c.width, c.height);
      // horizon and a few swell lines
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(0, H * 0.72 * k, c.width, Math.max(1, 0.6 * k));
      g.strokeStyle = 'rgba(160,220,240,0.12)';
      g.lineWidth = Math.max(1, 0.8 * k);
      for (let i = 0; i < 4; i++) {
        const y = (H * 0.78 + i * i * 2.4 + i * 2) * k;
        const ph = t * (0.6 + i * 0.2) + i * 1.7;
        g.beginPath();
        for (let x = 0; x <= 150; x += 6) g.lineTo(x * k, y + Math.sin(x * 0.09 + ph) * (0.8 + i * 0.5) * k);
        g.stroke();
      }
    } else {
      const bg = g.createRadialGradient(c.width * 0.5, c.height * 0.5, 0, c.width * 0.5, c.height * 0.5, c.width * 0.7);
      bg.addColorStop(0, R.deep + '55');
      bg.addColorStop(1, '#04121c00');
      g.fillStyle = bg;
      g.fillRect(0, 0, c.width, c.height);
      // a strip of sea for the shots to fly over
      const sea = g.createLinearGradient(0, H * 0.8 * k, 0, c.height);
      sea.addColorStop(0, 'rgba(30,120,150,0.55)');
      sea.addColorStop(1, 'rgba(6,34,52,0.9)');
      g.fillStyle = sea;
      g.fillRect(0, H * 0.8 * k, c.width, c.height);
    }
    // ball in flight
    if (trailFx && ballT >= 0) {
      ballT += dt;
      const bx = gx + ballT * 150;
      const by = gy - ballT * 70 + ballT * ballT * 55;
      if (bx > (card ? 165 : 215) || by > H) ballT = -1;
      else {
        hist.push([bx, by]);
        if (hist.length > 14) hist.shift();
        trailFx.emit(sim, bx, by, t);
        if (Math.random() < 0.5) trailFx.emit(sim, bx - 2, by + 1, t + 0.05);
        const st = trailFx.streak;
        if (st && hist.length > 1) {
          g.globalCompositeOperation = 'lighter';
          g.lineCap = 'round';
          for (let i = 1; i < hist.length; i++) {
            const f = i / hist.length;
            const col = st === 'rainbow' ? hue(t * 1.2 - f * 0.8) : st;
            g.strokeStyle = `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${f * 0.9})`;
            g.lineWidth = (1 + f * 3.5) * k;
            g.beginPath();
            g.moveTo(hist[i - 1][0] * k, hist[i - 1][1] * k);
            g.lineTo(hist[i][0] * k, hist[i][1] * k);
            g.stroke();
          }
          g.globalCompositeOperation = 'source-over';
        }
      }
    }
    sim.draw(g, k);
    if (trailFx && ballT >= 0 && hist.length) {
      const [bx, by] = hist[hist.length - 1];
      g.fillStyle = '#1c1d20';
      g.beginPath();
      g.arc(bx * k, by * k, 2.6 * k, 0, 6.283);
      g.fill();
    }
    drawGun(g, k, gx, gy, recoil);
  };
}
