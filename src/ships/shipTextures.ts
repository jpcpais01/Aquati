import * as THREE from 'three';
import { mulberry32 } from '../core/noise';
import { Livery } from './shipTypes';
import { BackingId, drawEmblem, drawFlag, EmblemId, FlagDesign } from './heraldry';

// Hand-painted-looking ship textures drawn on canvas at startup.

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTex(c: HTMLCanvasElement, srgb = true, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function shade(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return '#' + c.getHexString();
}

/** Planks with grain, painted bands and gunports. u: stern->bow, v: keel->rail. */
export function hullTexture(livery: Livery, ports: { u: number; v: number; w: number; h: number }[], lengthM: number, seed = 1): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  const [c, g] = canvas(W, H);
  const rnd = mulberry32(seed);
  const vy = (v: number) => H - v * H; // canvas y for texture v
  // base planking
  g.fillStyle = livery.hull;
  g.fillRect(0, 0, W, H);
  const plankRows = 26;
  for (let r = 0; r < plankRows; r++) {
    const y0 = (r / plankRows) * H;
    const ph = H / plankRows;
    let x = -rnd() * 200;
    while (x < W) {
      const len = (4 + rnd() * 3) * (W / lengthM);
      g.fillStyle = shade(livery.hull, 0.86 + rnd() * 0.24);
      g.fillRect(x, y0, len, ph);
      // grain streaks
      g.globalAlpha = 0.18;
      for (let s = 0; s < 3; s++) {
        g.fillStyle = shade(livery.hull, 0.7);
        g.fillRect(x, y0 + rnd() * ph, len, 1);
      }
      g.globalAlpha = 1;
      g.fillStyle = shade(livery.hull, 0.55);
      g.fillRect(x, y0, 2, ph); // butt joint
      x += len;
    }
    g.fillStyle = shade(livery.hull, 0.5);
    g.fillRect(0, y0, W, 1.5); // seam
  }
  const band = (v0: number, v1: number, color: string, alpha = 1) => {
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.fillRect(0, vy(v1), W, vy(v0) - vy(v1));
    g.globalAlpha = 1;
  };
  // painted strakes keep the plank seams showing through via multiply-ish alpha
  band(0, 0.285, livery.bottom, 0.93);
  band(0.285, 0.315, livery.boot);
  band(0.66, 0.705, livery.wale);
  band(0.705, 0.935, livery.strake, 0.94);
  band(0.935, 0.955, livery.trim);
  band(0.955, 1.0, shade(livery.wale, 1.3));
  // seam lines over paint
  g.globalAlpha = 0.22;
  g.fillStyle = '#000';
  for (let r = 0; r < plankRows; r++) g.fillRect(0, (r / plankRows) * H, W, 1);
  g.globalAlpha = 1;
  // gold pinstripe above the wale
  band(0.708, 0.716, livery.trim);
  // gunports
  for (const p of ports) {
    const x = p.u * W;
    const y = vy(p.v);
    const pw = p.w * W;
    const ph = p.h * H;
    g.fillStyle = shade(livery.trim, 0.85);
    g.fillRect(x - pw / 2 - 3, y - ph / 2 - 3, pw + 6, ph + 6);
    g.fillStyle = '#120c09';
    g.fillRect(x - pw / 2, y - ph / 2, pw, ph);
  }
  // soft grime near the waterline
  const grad = g.createLinearGradient(0, vy(0.42), 0, vy(0.3));
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(20,30,20,0.25)');
  g.fillStyle = grad;
  g.fillRect(0, vy(0.42), W, vy(0.3) - vy(0.42));
  return toTex(c);
}

export function deckTexture(seed = 3): THREE.CanvasTexture {
  const S = 512;
  const [c, g] = canvas(S, S);
  const rnd = mulberry32(seed);
  g.fillStyle = '#c9a06b';
  g.fillRect(0, 0, S, S);
  const cols = 16;
  for (let i = 0; i < cols; i++) {
    const x0 = (i / cols) * S;
    const w = S / cols;
    let y = -rnd() * 300;
    while (y < S) {
      const len = 120 + rnd() * 220;
      const f = 0.86 + rnd() * 0.22;
      g.fillStyle = shade('#c9a06b', f);
      g.fillRect(x0, y, w, len);
      g.globalAlpha = 0.15;
      g.fillStyle = '#7a5530';
      for (let s = 0; s < 4; s++) g.fillRect(x0 + rnd() * w, y, 1, len);
      g.globalAlpha = 1;
      g.fillStyle = '#6e4a28';
      g.fillRect(x0, y, w, 2);
      // treenails
      g.fillStyle = '#5a3a1e';
      g.fillRect(x0 + w * 0.3, y + 6, 2, 2);
      g.fillRect(x0 + w * 0.7, y + 6, 2, 2);
      y += len;
    }
    g.fillStyle = '#4e331b';
    g.fillRect(x0, 0, 2, S); // caulking
  }
  return toTex(c, true, true);
}

export function sternTexture(livery: Livery, rows: number): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const W = 256;
  const H = 256;
  const [c, g] = canvas(W, H);
  const [ce, ge] = canvas(W, H);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, W, H);
  g.fillStyle = livery.hull;
  g.fillRect(0, 0, W, H);
  g.fillStyle = livery.bottom;
  g.fillRect(0, H * 0.72, W, H * 0.28);
  g.fillStyle = livery.boot;
  g.fillRect(0, H * 0.69, W, H * 0.03);
  g.fillStyle = livery.strake;
  g.fillRect(0, 0, W, H * 0.42);
  g.fillStyle = livery.trim;
  g.fillRect(0, H * 0.42, W, 5);
  g.fillRect(0, 0, W, 6);
  const winRows = Math.max(1, rows);
  for (let r = 0; r < winRows; r++) {
    const y = H * 0.07 + r * H * 0.15;
    const n = 4;
    for (let i = 0; i < n; i++) {
      const x = W * 0.2 + (i / (n - 1)) * W * 0.6;
      const ww = W * 0.1;
      const wh = H * 0.1;
      g.fillStyle = livery.trim;
      g.beginPath();
      g.roundRect(x - ww / 2 - 4, y - 4, ww + 8, wh + 8, 6);
      g.fill();
      g.fillStyle = '#ffd88a';
      g.beginPath();
      g.roundRect(x - ww / 2, y, ww, wh, 4);
      g.fill();
      g.fillStyle = shade(livery.trim, 0.6);
      g.fillRect(x - 1, y, 2, wh);
      g.fillRect(x - ww / 2, y + wh / 2 - 1, ww, 2);
      ge.fillStyle = '#ffb648';
      ge.beginPath();
      ge.roundRect(x - ww / 2, y, ww, wh, 4);
      ge.fill();
    }
  }
  return { map: toTex(c), emissive: toTex(ce) };
}

function surface(target: THREE.CanvasTexture | undefined, w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  if (target) {
    const c = target.image as HTMLCanvasElement;
    return [c, c.getContext('2d')!];
  }
  return canvas(w, h);
}

function legacyMark(livery: Livery): { emblem: EmblemId; backing: BackingId; color: string } | null {
  if (livery.sailMark !== undefined) return livery.sailMark;
  if (livery.emblem === 'skull') return { emblem: 'skull', backing: 'bones', color: livery.emblemColor };
  if (livery.emblem === 'sun') return { emblem: 'sun', backing: 'none', color: livery.emblemColor };
  return null;
}

/** Sail cloth with cloths, reef bands, an optional accent pattern and emblem. Redraws into `target` if given. */
export function sailTexture(livery: Livery, emblem: boolean, seed = 5, target?: THREE.CanvasTexture): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = surface(target, S, S);
  const rnd = mulberry32(seed);
  const accent = livery.sailAccent ?? livery.sailSeam;
  g.fillStyle = livery.sail;
  g.fillRect(0, 0, S, S);
  // vertical cloths
  const cloths = 9;
  const pattern = livery.sailPattern ?? 'plain';
  for (let i = 0; i < cloths; i++) {
    const base = pattern === 'stripes' && i % 2 === 1 ? accent : livery.sail;
    g.fillStyle = shade(base, 0.95 + rnd() * 0.08);
    g.fillRect((i / cloths) * S, 0, S / cloths + 1, S);
  }
  g.fillStyle = accent;
  switch (pattern) {
    case 'band':
      g.fillRect(0, S * 0.6, S, S * 0.2);
      break;
    case 'border': {
      const b = S * 0.085;
      g.fillRect(0, 0, S, b);
      g.fillRect(0, S - b, S, b);
      g.fillRect(0, 0, b, S);
      g.fillRect(S - b, 0, b, S);
      break;
    }
    case 'cross':
      g.fillRect(S * 0.43, 0, S * 0.14, S);
      g.fillRect(0, S * 0.42, S, S * 0.14);
      break;
    case 'diagonal':
      g.beginPath();
      g.moveTo(0, S * 0.35);
      g.lineTo(S * 0.65, S);
      g.lineTo(0, S);
      g.closePath();
      g.fill();
      break;
    default:
      break;
  }
  g.fillStyle = livery.sailSeam;
  g.globalAlpha = 0.85;
  for (let i = 0; i < cloths; i++) g.fillRect((i / cloths) * S, 0, 1.5, S);
  g.globalAlpha = 1;
  // reef bands
  g.fillStyle = livery.sailSeam;
  g.fillRect(0, S * 0.14, S, 3);
  g.fillRect(0, S * 0.28, S, 2);
  const mark = emblem ? legacyMark(livery) : null;
  if (mark) drawEmblem(g, S / 2, S * 0.5, S * 0.56, mark.emblem, mark.backing, mark.color);
  // weathering toward the foot
  const grad = g.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(60,45,20,0.16)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  // bolt rope edge
  g.strokeStyle = shade(livery.sailSeam, 0.8);
  g.lineWidth = 4;
  g.strokeRect(2, 2, S - 4, S - 4);
  if (target) {
    target.needsUpdate = true;
    return target;
  }
  return toTex(c);
}

/** The flag design a livery flies (pirate liveries get a classic jolly roger). */
export function liveryFlag(livery: Livery): FlagDesign {
  if (livery.flagDesign) return livery.flagDesign;
  const skull = livery.emblem === 'skull';
  return {
    shape: skull ? 'tattered' : 'square',
    bg: livery.flag,
    pattern: 'plain',
    patternColor: livery.flag2,
    emblem: skull ? 'skull' : livery.emblem === 'sun' ? 'sun' : 'none',
    emblemColor: livery.flag2,
    backing: skull ? 'bones' : 'none',
    emblemScale: 0.95,
    paint: '',
  };
}

export const FLAG_ASPECT = 0.62;

/** Full flag with its fly-edge cut out in alpha. Redraws into `target` if given. */
export function flagTexture(livery: Livery, target?: THREE.CanvasTexture): THREE.CanvasTexture {
  const W = 256;
  const H = Math.round(W * FLAG_ASPECT);
  const [c, g] = surface(target, W, H);
  drawFlag(g, W, H, liveryFlag(livery));
  if (target) {
    target.needsUpdate = true;
    return target;
  }
  const t = toTex(c);
  t.anisotropy = 4;
  return t;
}
