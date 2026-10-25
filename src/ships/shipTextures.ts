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

/**
 * Turns a grey height canvas (mid grey = flat) into a tangent-space normal
 * map. Canvas rows run down while texture v runs up, hence the flipped dy.
 */
function heightToNormal(src: HTMLCanvasElement, strength: number, repeat = false): THREE.CanvasTexture {
  const W = src.width;
  const H = src.height;
  const [c, g] = canvas(W, H);
  const img = g.createImageData(W, H);
  normalPixels(src, strength, repeat, img.data);
  g.putImageData(img, 0, 0);
  return toTex(c, false, repeat);
}

function normalPixels(src: HTMLCanvasElement, strength: number, repeat: boolean, o: Uint8ClampedArray | Uint8Array, flip = false) {
  const W = src.width;
  const H = src.height;
  const h = src.getContext('2d')!.getImageData(0, 0, W, H).data;
  const at = (x: number, y: number) => {
    if (repeat) {
      x = (x + W) % W;
      y = (y + H) % H;
    } else {
      x = Math.min(W - 1, Math.max(0, x));
      y = Math.min(H - 1, Math.max(0, y));
    }
    return h[(y * W + x) * 4] / 255;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const nx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const ny = (at(x, y + 1) - at(x, y - 1)) * strength;
      const il = 1 / Math.hypot(nx, ny, 1);
      const i = ((flip ? H - 1 - y : y) * W + x) * 4;
      o[i] = (nx * il * 0.5 + 0.5) * 255;
      o[i + 1] = (ny * il * 0.5 + 0.5) * 255;
      o[i + 2] = (il * 0.5 + 0.5) * 255;
      o[i + 3] = 255;
    }
  }
}

/**
 * A relief map that also carries a mask in its alpha: where a vault skin may
 * paint the hull. Raw pixels (not a canvas) so the alpha can't premultiply
 * the normals away.
 */
function heightToNormalMasked(src: HTMLCanvasElement, mask: HTMLCanvasElement, strength: number): THREE.DataTexture {
  const W = src.width;
  const H = src.height;
  const o = new Uint8Array(W * H * 4);
  // texture rows run up from v = 0, canvas rows down from the top
  normalPixels(src, strength, false, o, true);
  const m = mask.getContext('2d')!.getImageData(0, 0, W, H).data;
  for (let y = 0; y < H; y++) {
    const row = (H - 1 - y) * W;
    for (let x = 0; x < W; x++) o[(row + x) * 4 + 3] = m[(y * W + x) * 4];
  }
  const t = new THREE.DataTexture(o, W, H, THREE.RGBAFormat);
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

const grey = (v: number) => {
  const k = Math.round(Math.min(1, Math.max(0, v)) * 255);
  return `rgb(${k},${k},${k})`;
};

function shade(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return '#' + c.getHexString();
}

/** Planks with grain, painted bands and gunports. u: stern->bow, v: keel->rail. */
export function hullTexture(livery: Livery, ports: { u: number; v: number; w: number; h: number }[], lengthM: number, seed = 1): THREE.CanvasTexture {
  return hullTextures(livery, ports, lengthM, seed).map;
}

/** The painted planking and a matching relief map: caulked seams, butt joints, treenails and recessed ports. */
export function hullTextures(
  livery: Livery,
  ports: { u: number; v: number; w: number; h: number }[],
  lengthM: number,
  seed = 1,
  haunt = false,
): { map: THREE.CanvasTexture; normal: THREE.Texture; glow?: THREE.CanvasTexture } {
  const W = 1024;
  const H = 512;
  const [c, g] = canvas(W, H);
  const [hc, hg] = canvas(W, H);
  const rnd = mulberry32(seed);
  const vy = (v: number) => H - v * H; // canvas y for texture v
  hg.fillStyle = grey(0.55);
  hg.fillRect(0, 0, W, H);
  // a haunted hull's ghost-light: it seeps out of her seams and butt joints
  // above the waterline (none in the wale, the gilding or her bottom) and
  // pours out of her gunports
  const [gc, gg] = haunt ? canvas(W, H) : [null, null];
  if (gg) {
    gg.fillStyle = '#000';
    gg.fillRect(0, 0, W, H);
  }
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
      // each plank sits a hair proud or shy of its neighbours, crowned in the middle
      const lift = 0.52 + rnd() * 0.1;
      const grd = hg.createLinearGradient(0, y0, 0, y0 + ph);
      grd.addColorStop(0, grey(lift - 0.1));
      grd.addColorStop(0.5, grey(lift + 0.04));
      grd.addColorStop(1, grey(lift - 0.12));
      hg.fillStyle = grd;
      hg.fillRect(x, y0, len, ph);
      // grain streaks
      g.globalAlpha = 0.18;
      hg.globalAlpha = 0.35;
      for (let s = 0; s < 3; s++) {
        const gy = y0 + rnd() * ph;
        g.fillStyle = shade(livery.hull, 0.7);
        g.fillRect(x, gy, len, 1);
        hg.fillStyle = grey(lift - 0.12);
        hg.fillRect(x, gy, len, 1);
      }
      g.globalAlpha = 1;
      hg.globalAlpha = 1;
      g.fillStyle = shade(livery.hull, 0.55);
      g.fillRect(x, y0, 2, ph); // butt joint
      if (gg) {
        gg.fillStyle = `rgba(255,255,255,${0.18 + rnd() * 0.3})`;
        gg.fillRect(x, y0, 2, ph);
      }
      hg.fillStyle = grey(0.18);
      hg.fillRect(x, y0, 2, ph);
      // treenails at each butt
      hg.fillStyle = grey(0.3);
      for (const ty of [0.3, 0.7]) {
        hg.fillRect(x + 5, y0 + ph * ty - 1, 2, 2);
        hg.fillRect(x + len - 7, y0 + ph * ty - 1, 2, 2);
      }
      x += len;
    }
    g.fillStyle = shade(livery.hull, 0.5);
    g.fillRect(0, y0, W, 1.5); // seam
    if (gg) {
      // brighter in patches, as if the light behind her timbers comes and goes
      for (let x = 0; x < W; x += 64) {
        gg.fillStyle = `rgba(255,255,255,${rnd() < 0.45 ? 0.02 : 0.08 + rnd() * 0.22})`;
        gg.fillRect(x, y0 - 0.5, 64, 2);
      }
    }
    hg.fillStyle = grey(0.12);
    hg.fillRect(0, y0 - 0.5, W, 2.5);
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
  // gold pinstripe above the wale, a hairline of shadow under it
  band(0.708, 0.716, livery.trim);
  band(0.7, 0.705, shade(livery.wale, 0.6), 0.6);
  // the copper-coloured bottom shows faint sheathing plates
  g.globalAlpha = 0.12;
  g.fillStyle = '#000';
  for (let x = 0; x < W; x += 22) g.fillRect(x, vy(0.285), 1, vy(0) - vy(0.285));
  g.globalAlpha = 1;
  // gunports: a gilded frame, a dark recess and a lit sill
  for (const p of ports) {
    const x = p.u * W;
    const y = vy(p.v);
    const pw = p.w * W;
    const ph = p.h * H;
    g.fillStyle = shade(livery.trim, 0.85);
    g.fillRect(x - pw / 2 - 3, y - ph / 2 - 3, pw + 6, ph + 6);
    g.fillStyle = '#120c09';
    g.fillRect(x - pw / 2, y - ph / 2, pw, ph);
    g.fillStyle = shade(livery.trim, 1.15);
    g.fillRect(x - pw / 2 - 3, y + ph / 2, pw + 6, 2);
    hg.fillStyle = grey(0.85);
    hg.fillRect(x - pw / 2 - 4, y - ph / 2 - 4, pw + 8, ph + 8);
    hg.fillStyle = grey(0.08);
    hg.fillRect(x - pw / 2, y - ph / 2, pw, ph);
  }
  if (gg && gc) {
    // the glow keeps off the bottom, the wale and the rail's gilding
    gg.fillStyle = '#000';
    gg.fillRect(0, vy(0.42), W, H - vy(0.42));
    gg.fillRect(0, vy(0.72), W, vy(0.655) - vy(0.72));
    gg.fillRect(0, 0, W, vy(0.935));
    for (const p of ports) {
      const x = p.u * W;
      const y = vy(p.v);
      const pw = p.w * W;
      const ph = p.h * H;
      const pg = gg.createRadialGradient(x, y, 0, x, y, Math.max(pw, ph) * 0.7);
      pg.addColorStop(0, 'rgba(255,255,255,1)');
      pg.addColorStop(1, 'rgba(255,255,255,0.35)');
      gg.fillStyle = pg;
      gg.fillRect(x - pw / 2, y - ph / 2, pw, ph);
    }
  }
  // soft grime near the waterline
  const grad = g.createLinearGradient(0, vy(0.42), 0, vy(0.3));
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(20,30,20,0.25)');
  g.fillStyle = grad;
  g.fillRect(0, vy(0.42), W, vy(0.3) - vy(0.42));
  // a faint weathered streak under each port and scupper
  for (const p of ports) {
    const x = p.u * W;
    const y = vy(p.v) + (p.h * H) / 2 + 2;
    const sg = g.createLinearGradient(0, y, 0, y + H * 0.12);
    sg.addColorStop(0, 'rgba(10,8,6,0.22)');
    sg.addColorStop(1, 'rgba(10,8,6,0)');
    g.fillStyle = sg;
    g.fillRect(x - 3, y, 6, H * 0.12);
  }
  // where a vault skin may paint: the planking and the topsides, never the
  // bottom, the boot top, the wale, the gilding or a gunport
  const [mc, mg] = canvas(W, H);
  mg.fillStyle = '#000';
  mg.fillRect(0, 0, W, H);
  mg.fillStyle = '#fff';
  mg.fillRect(0, vy(0.655), W, vy(0.318) - vy(0.655));
  mg.fillRect(0, vy(0.93), W, vy(0.716) - vy(0.93));
  mg.fillStyle = '#000';
  for (const p of ports) {
    const pw = p.w * W;
    const ph = p.h * H;
    mg.fillRect(p.u * W - pw / 2 - 6, vy(p.v) - ph / 2 - 6, pw + 12, ph + 12);
  }
  return { map: toTex(c), normal: heightToNormalMasked(hc, mc, 3.2), glow: gc ? toTex(gc) : undefined };
}

export function deckTexture(seed = 3): THREE.CanvasTexture {
  return deckTextures(seed).map;
}

/** Scrubbed deck planking with tarred seams, plus its relief. */
export function deckTextures(seed = 3): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const S = 512;
  const [c, g] = canvas(S, S);
  const [hc, hg] = canvas(S, S);
  const rnd = mulberry32(seed);
  g.fillStyle = '#c9a06b';
  g.fillRect(0, 0, S, S);
  hg.fillStyle = grey(0.55);
  hg.fillRect(0, 0, S, S);
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
      const lift = 0.5 + rnd() * 0.12;
      const grd = hg.createLinearGradient(x0, 0, x0 + w, 0);
      grd.addColorStop(0, grey(lift - 0.08));
      grd.addColorStop(0.5, grey(lift + 0.04));
      grd.addColorStop(1, grey(lift - 0.08));
      hg.fillStyle = grd;
      hg.fillRect(x0, y, w, len);
      g.globalAlpha = 0.15;
      g.fillStyle = '#7a5530';
      hg.globalAlpha = 0.3;
      hg.fillStyle = grey(lift - 0.15);
      for (let s = 0; s < 4; s++) {
        const gx = x0 + rnd() * w;
        g.fillRect(gx, y, 1, len);
        hg.fillRect(gx, y, 1, len);
      }
      g.globalAlpha = 1;
      hg.globalAlpha = 1;
      // a few darker knots
      if (rnd() < 0.35) {
        const kx = x0 + w * (0.25 + rnd() * 0.5);
        const ky = y + len * rnd();
        g.globalAlpha = 0.35;
        g.fillStyle = '#6e4a28';
        g.beginPath();
        g.ellipse(kx, ky, 2.5, 5, 0, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }
      g.fillStyle = '#6e4a28';
      g.fillRect(x0, y, w, 2);
      hg.fillStyle = grey(0.2);
      hg.fillRect(x0, y, w, 2);
      // treenails
      g.fillStyle = '#5a3a1e';
      g.fillRect(x0 + w * 0.3, y + 6, 2, 2);
      g.fillRect(x0 + w * 0.7, y + 6, 2, 2);
      hg.fillStyle = grey(0.32);
      hg.fillRect(x0 + w * 0.3, y + 6, 2, 2);
      hg.fillRect(x0 + w * 0.7, y + 6, 2, 2);
      y += len;
    }
    g.fillStyle = '#4e331b';
    g.fillRect(x0, 0, 2, S); // caulking
    hg.fillStyle = grey(0.1);
    hg.fillRect(x0 - 0.5, 0, 3, S);
  }
  // salt-bleached and sun-worn patches
  for (let i = 0; i < 18; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 30 + rnd() * 70;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    const light = rnd() < 0.6;
    rg.addColorStop(0, light ? 'rgba(255,240,215,0.1)' : 'rgba(60,40,20,0.08)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
  }
  return { map: toTex(c, true, true), normal: heightToNormal(hc, 2.6, true) };
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
  const S = 512;
  const [c, g] = surface(target, S, S);
  const rnd = mulberry32(seed);
  const accent = livery.sailAccent ?? livery.sailSeam;
  g.fillStyle = livery.sail;
  g.fillRect(0, 0, S, S);
  // vertical cloths, each a slightly different bolt of canvas
  const cloths = 9;
  const pattern = livery.sailPattern ?? 'plain';
  for (let i = 0; i < cloths; i++) {
    const x0 = (i / cloths) * S;
    const base = pattern === 'stripes' && i % 2 === 1 ? accent : livery.sail;
    g.fillStyle = shade(base, 0.95 + rnd() * 0.08);
    g.fillRect(x0, 0, S / cloths + 1, S);
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
  // double-stitched seams between the cloths
  g.fillStyle = livery.sailSeam;
  for (let i = 0; i < cloths; i++) {
    const x0 = (i / cloths) * S;
    g.globalAlpha = 0.85;
    g.fillRect(x0, 0, 2.5, S);
    g.globalAlpha = 0.3;
    g.fillRect(x0 + 5, 0, 1, S);
  }
  g.globalAlpha = 1;
  // reef bands with their rows of reef points
  for (const [f, wgt] of [
    [0.14, 6],
    [0.28, 4],
  ] as const) {
    g.fillStyle = livery.sailSeam;
    g.fillRect(0, S * f, S, wgt);
    g.fillStyle = shade(livery.sailSeam, 0.7);
    for (let x = S / 24; x < S; x += S / 12) {
      g.beginPath();
      g.roundRect(x - 1.5, S * f - 7, 3, 14 + wgt, 1.5);
      g.fill();
    }
  }
  // reinforcing patches at the head earings and clews
  g.fillStyle = shade(livery.sail, 0.9);
  for (const [x, y, sx, sy] of [
    [0, 0, 1, 1],
    [S, 0, -1, 1],
    [0, S, 1, -1],
    [S, S, -1, -1],
  ]) {
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + sx * S * 0.16, y);
    g.lineTo(x, y + sy * S * 0.16);
    g.closePath();
    g.fill();
  }
  // a broad tabling along the foot
  g.fillStyle = shade(livery.sail, 0.92);
  g.fillRect(0, S - 22, S, 22);
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
  g.lineWidth = 8;
  g.strokeRect(4, 4, S - 8, S - 8);
  if (livery.haunt) rags(c, g, S, rnd, !!mark, mark?.color ?? livery.emblemColor);
  if (target) {
    target.needsUpdate = true;
    return target;
  }
  return toTex(c);
}

/**
 * A haunted ship's sails are rags: the foot hangs in tatters, the leeches are
 * torn in, holes are burnt through the cloth (never through the emblem), and
 * every torn edge is singed dark and smoulders with ghost-fire. The holes are
 * cut out of the canvas's alpha (the sail material tests it); the fire and the
 * emblem are drawn again in a glow map hung on the texture (userData.glow).
 */
function rags(c: HTMLCanvasElement, g: CanvasRenderingContext2D, S: number, rnd: () => number, emblem: boolean, ink: string) {
  const [ec, eg] = canvas(S, S);
  eg.fillStyle = '#000';
  eg.fillRect(0, 0, S, S);
  const cuts: Path2D[] = [];
  const ragged = (pts: [number, number][]) => {
    const p = new Path2D();
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
    p.closePath();
    cuts.push(p);
  };
  // the foot in tatters: long tongues of cloth between ragged bites
  for (let x = -S * 0.02; x < S; ) {
    const w = S * (0.06 + rnd() * 0.1);
    const deep = S * (0.07 + rnd() * 0.22) * (rnd() < 0.25 ? 1.7 : 1);
    const pts: [number, number][] = [[x, S + 4]];
    const n = 4 + Math.floor(rnd() * 3);
    for (let k = 1; k < n; k++) {
      const f = k / n;
      pts.push([x + w * f + (rnd() - 0.5) * w * 0.3, S - deep * Math.sin(f * Math.PI) * (0.6 + rnd() * 0.5)]);
    }
    pts.push([x + w, S + 4]);
    ragged(pts);
    x += w + S * (0.02 + rnd() * 0.06);
  }
  // the leeches torn in, low down
  for (const side of [0, 1]) {
    for (let i = 0; i < 2; i++) {
      const y = S * (0.45 + rnd() * 0.4);
      const h = S * (0.05 + rnd() * 0.08);
      const d = S * (0.05 + rnd() * 0.1);
      const x0 = side ? S + 4 : -4;
      const sx = side ? -1 : 1;
      ragged([[x0, y - h], [x0 + sx * d * (0.5 + rnd() * 0.5), y - h * 0.3], [x0 + sx * d, y + (rnd() - 0.5) * h], [x0 + sx * d * 0.4, y + h * 0.6], [x0, y + h]]);
    }
  }
  // shot and rot: holes through the cloth, clear of the emblem
  for (let i = 0, tries = 0; i < 5 && tries < 40; tries++) {
    const x = S * (0.1 + rnd() * 0.8);
    const y = S * (0.15 + rnd() * 0.6);
    if (emblem && Math.hypot(x - S / 2, y - S / 2) < S * 0.33) continue;
    const r = S * (0.025 + rnd() * 0.05);
    const pts: [number, number][] = [];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const rr = r * (0.55 + rnd() * 0.75);
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 1.2]);
    }
    ragged(pts);
    i++;
  }
  // singed edges, ghost-fire licking along them, then the holes themselves
  g.save();
  g.lineJoin = 'round';
  g.strokeStyle = '#141015';
  g.lineWidth = 14;
  for (const p of cuts) g.stroke(p);
  eg.lineJoin = 'round';
  eg.strokeStyle = 'rgba(80,255,170,0.55)';
  eg.lineWidth = 14;
  for (const p of cuts) eg.stroke(p);
  eg.strokeStyle = 'rgba(190,255,225,0.9)';
  eg.lineWidth = 5;
  for (const p of cuts) eg.stroke(p);
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = '#000';
  for (const p of cuts) g.fill(p);
  g.restore();
  eg.fillStyle = '#000';
  for (const p of cuts) eg.fill(p);
  // the emblem burns with ghost-light too
  if (emblem) {
    eg.globalCompositeOperation = 'lighter';
    drawEmblem(eg, S / 2, S * 0.5, S * 0.56, 'skull', 'bones', ink);
  }
  (c as HTMLCanvasElement & { aqGlow?: HTMLCanvasElement }).aqGlow = ec;
}

/** The glow map a haunted sail texture carries (see rags), as a texture of its own. */
export function ragGlow(map: THREE.Texture): THREE.CanvasTexture | null {
  const c = map.image as HTMLCanvasElement & { aqGlow?: HTMLCanvasElement };
  if (!c?.aqGlow) return null;
  if (!map.userData.glow) map.userData.glow = toTex(c.aqGlow);
  return map.userData.glow as THREE.CanvasTexture;
}

let sailNormalTex: THREE.CanvasTexture | null = null;
/** Livery-independent canvas relief: raised seams, reef bands and the bolt rope. */
export function sailNormalTexture(): THREE.CanvasTexture {
  if (sailNormalTex) return sailNormalTex;
  const S = 256;
  const [hc, hg] = canvas(S, S);
  hg.fillStyle = grey(0.5);
  hg.fillRect(0, 0, S, S);
  const cloths = 9;
  for (let i = 0; i < cloths; i++) {
    const x0 = (i / cloths) * S;
    // each cloth bellies a little between its seams
    const grd = hg.createLinearGradient(x0, 0, x0 + S / cloths, 0);
    grd.addColorStop(0, grey(0.42));
    grd.addColorStop(0.5, grey(0.56));
    grd.addColorStop(1, grey(0.42));
    hg.fillStyle = grd;
    hg.fillRect(x0, 0, S / cloths, S);
    hg.fillStyle = grey(0.8);
    hg.fillRect(x0 - 1, 0, 2.5, S);
  }
  hg.fillStyle = grey(0.82);
  hg.fillRect(0, S * 0.14, S, 3);
  hg.fillRect(0, S * 0.28, S, 2);
  hg.fillStyle = grey(0.62);
  hg.fillRect(0, S - 11, S, 11);
  hg.strokeStyle = grey(0.95);
  hg.lineWidth = 4;
  hg.strokeRect(2, 2, S - 4, S - 4);
  sailNormalTex = heightToNormal(hc, 2.2);
  return sailNormalTex;
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
