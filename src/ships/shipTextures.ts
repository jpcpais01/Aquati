import * as THREE from 'three';
import { mulberry32 } from '../core/noise';
import { Livery } from './shipTypes';

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

function drawSkull(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) {
  g.fillStyle = color;
  g.strokeStyle = color;
  // crossed bones
  g.lineWidth = s * 0.16;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx - s * 0.9, cy + s * 0.2);
  g.lineTo(cx + s * 0.9, cy + s * 1.1);
  g.moveTo(cx + s * 0.9, cy + s * 0.2);
  g.lineTo(cx - s * 0.9, cy + s * 1.1);
  g.stroke();
  // skull
  g.beginPath();
  g.ellipse(cx, cy - s * 0.1, s * 0.6, s * 0.55, 0, 0, Math.PI * 2);
  g.fill();
  g.fillRect(cx - s * 0.32, cy + s * 0.2, s * 0.64, s * 0.35);
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.ellipse(cx - s * 0.22, cy - s * 0.08, s * 0.15, s * 0.17, 0, 0, Math.PI * 2);
  g.ellipse(cx + s * 0.22, cy - s * 0.08, s * 0.15, s * 0.17, 0, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'source-over';
}

function drawSun(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) {
  g.fillStyle = color;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a - 0.12) * s * 0.55, cy + Math.sin(a - 0.12) * s * 0.55);
    g.lineTo(cx + Math.cos(a) * s * 1.05, cy + Math.sin(a) * s * 1.05);
    g.lineTo(cx + Math.cos(a + 0.12) * s * 0.55, cy + Math.sin(a + 0.12) * s * 0.55);
    g.fill();
  }
  g.beginPath();
  g.arc(cx, cy, s * 0.52, 0, Math.PI * 2);
  g.fill();
  // wave across the sun
  g.strokeStyle = '#1f8a8a';
  g.lineWidth = s * 0.14;
  g.beginPath();
  for (let i = 0; i <= 20; i++) {
    const x = cx - s * 0.75 + (i / 20) * s * 1.5;
    const y = cy + s * 0.12 + Math.sin(i * 0.65) * s * 0.12;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
}

export function sailTexture(livery: Livery, emblem: boolean, seed = 5): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas(S, S);
  const rnd = mulberry32(seed);
  g.fillStyle = livery.sail;
  g.fillRect(0, 0, S, S);
  // vertical cloths
  const cloths = 9;
  for (let i = 0; i < cloths; i++) {
    g.fillStyle = shade(livery.sail, 0.95 + rnd() * 0.08);
    g.fillRect((i / cloths) * S, 0, S / cloths, S);
    g.fillStyle = livery.sailSeam;
    g.fillRect((i / cloths) * S, 0, 1.5, S);
  }
  // reef bands
  g.fillStyle = livery.sailSeam;
  g.fillRect(0, S * 0.14, S, 3);
  g.fillRect(0, S * 0.28, S, 2);
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
  if (emblem) {
    if (livery.emblem === 'skull') drawSkull(g, S / 2, S * 0.45, S * 0.24, livery.emblemColor);
    else if (livery.emblem === 'sun') drawSun(g, S / 2, S * 0.5, S * 0.22, livery.emblemColor);
  }
  return toTex(c);
}

export function flagTexture(livery: Livery): THREE.CanvasTexture {
  const [c, g] = canvas(128, 32);
  g.fillStyle = livery.flag;
  g.fillRect(0, 0, 128, 32);
  g.fillStyle = livery.flag2;
  g.fillRect(0, 13, 128, 6);
  if (livery.emblem === 'skull') drawSkull(g, 22, 13, 9, livery.flag2);
  return toTex(c);
}
