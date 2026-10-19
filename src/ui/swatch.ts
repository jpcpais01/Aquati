import { GLSL_SKIN } from '../ships/skinGlsl';
import { FxItem, Item, RARITIES, SkinItem } from '../ships/cosmetics';
import { drawFx } from './fxPreview';

// Living card art for the Vault and the Shipwright. Skins are rendered with
// the very GLSL the ship wears (one small WebGL2 context of their own, set up
// the first time a card needs it, never during play) and composed onto a
// little ship; cannon effects play a looping 2D vignette. One shared loop
// redraws only the cards that move and are on screen.

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
${GLSL_SKIN}
uniform vec2 uRes;
uniform float uTime;
uniform float uMode;
uniform vec4 uView;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float sail = uMode;
  vec2 p = sail > 0.5 ? vec2(uv.x * 6.0, uv.y * 7.0) : vec2(uv.x * uView.z + uView.x, uv.y * uView.w + uView.y);
  // a hull side rounds away toward the keel; a sail bellies out in the middle
  float bend = sail > 0.5 ? sin(uv.x * 3.1416) : smoothstep(-0.1, 0.9, uv.y);
  float ndv = 0.35 + 0.65 * bend;
  vec3 emis = vec3(0.0);
  float metal = 0.0;
  float rough = 0.5;
  vec3 alb = aqSkin(p, ndv, uTime, sail, emis, metal, rough);
  float light = 0.55 + 0.45 * bend;
  vec3 col = alb * light * mix(1.0, 0.55, metal);
  // a soft sky reflection band, sharper on gloss and metal
  float band = exp(-pow((uv.y - 0.72) * (3.0 + (1.0 - rough) * 9.0), 2.0));
  col += mix(vec3(0.05), alb * 1.4, metal) * band * (1.0 - rough) * 0.9;
  col += emis * 1.1;
  col = 1.0 - exp(-col * 1.35);
  fragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`;

const srgbToLinear = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
};

class SkinPainter {
  readonly canvas = document.createElement('canvas');
  private gl: WebGL2RenderingContext | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private failed = false;

  constructor() {
    this.canvas.width = 320;
    this.canvas.height = 200;
  }

  private init() {
    if (this.gl || this.failed) return !!this.gl;
    try {
      const gl = this.canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false, powerPreference: 'low-power' });
      if (!gl) throw new Error('no webgl2');
      const sh = (type: number, src: string) => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
        return s;
      };
      const prog = gl.createProgram()!;
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.bindAttribLocation(prog, 0, 'aPos');
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      for (const n of ['uSkin', 'uSkinA', 'uSkinB', 'uSkinC', 'uSkinP', 'uRes', 'uTime', 'uMode', 'uView']) this.loc[n] = gl.getUniformLocation(prog, n);
      this.gl = gl;
      return true;
    } catch (e) {
      console.warn('Skin previews fall back to flat colour:', e);
      this.failed = true;
      return false;
    }
  }

  /** Renders a patch of the skin; returns the source rect on this.canvas, or null without WebGL2. */
  paint(skin: SkinItem, w: number, h: number, mode: 0 | 1, t: number, view = [0, -0.5, 14, 3.8]): [number, number, number, number] | null {
    if (!this.init()) return null;
    const gl = this.gl!;
    w = Math.min(w, this.canvas.width) | 0;
    h = Math.min(h, this.canvas.height) | 0;
    gl.viewport(0, 0, w, h);
    gl.uniform1f(this.loc.uSkin, skin.pattern);
    gl.uniform3fv(this.loc.uSkinA, srgbToLinear(skin.colors[0]));
    gl.uniform3fv(this.loc.uSkinB, srgbToLinear(skin.colors[1]));
    gl.uniform3fv(this.loc.uSkinC, srgbToLinear(skin.colors[2]));
    gl.uniform4f(this.loc.uSkinP, Math.max(skin.glow, 0.6), skin.sail, 0, (skin.pattern * 7.31) % 10);
    gl.uniform2f(this.loc.uRes, w, h);
    gl.uniform1f(this.loc.uTime, t);
    gl.uniform1f(this.loc.uMode, mode);
    gl.uniform4f(this.loc.uView, view[0], view[1], view[2], view[3]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return [0, this.canvas.height - h, w, h];
  }
}

const painter = new SkinPainter();
const stills = new Map<string, HTMLCanvasElement>();

/** The skin over a w×h patch: a cached still for the ones that don't move. */
function skinImage(skin: SkinItem, w: number, h: number, mode: 0 | 1, t: number, view?: number[]): [CanvasImageSource, number, number, number, number] | null {
  const key = `${skin.id}|${w}|${h}|${mode}|${view ?? ''}`;
  const still = skin.animated ? null : stills.get(key);
  if (still) return [still, 0, 0, still.width, still.height];
  const r = painter.paint(skin, w, h, mode, t, view);
  if (!r) return null;
  if (skin.animated) return [painter.canvas, ...r];
  const c = document.createElement('canvas');
  c.width = r[2];
  c.height = r[3];
  c.getContext('2d')!.drawImage(painter.canvas, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
  stills.set(key, c);
  return [c, 0, 0, c.width, c.height];
}

// ------------------------------------------------------------------ ship card art

function hullPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  // stern on the left, a raked bow on the right, a gentle sheer along the top
  g.beginPath();
  g.moveTo(x + w * 0.04, y + h * 0.06);
  g.quadraticCurveTo(x + w * 0.5, y + h * 0.2, x + w * 0.86, y);
  g.quadraticCurveTo(x + w * 0.97, y + h * 0.02, x + w, y - h * 0.06);
  g.quadraticCurveTo(x + w * 0.93, y + h * 0.62, x + w * 0.8, y + h);
  g.lineTo(x + w * 0.12, y + h);
  g.quadraticCurveTo(x + w * 0.02, y + h * 0.7, x + w * 0.04, y + h * 0.06);
  g.closePath();
}

function sailPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(x + w / 2, y + h * 0.08, x + w, y);
  g.quadraticCurveTo(x + w * 1.06, y + h * 0.55, x + w * 0.96, y + h);
  g.quadraticCurveTo(x + w / 2, y + h * 0.86, x + w * 0.04, y + h);
  g.quadraticCurveTo(x - w * 0.06, y + h * 0.55, x, y);
  g.closePath();
}

/** Draws a skin on a little ship: one bellied sail above a hull riding a calm sea. */
export function drawSkinCard(c: HTMLCanvasElement, skin: SkinItem, t: number) {
  const g = c.getContext('2d')!;
  const W = c.width;
  const H = c.height;
  const R = RARITIES[skin.rarity];
  g.clearRect(0, 0, W, H);
  // backdrop: deep water glow in the rarity's colour
  const bg = g.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, W * 0.75);
  bg.addColorStop(0, R.deep + '66');
  bg.addColorStop(1, '#04121c00');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  const hx = W * 0.08, hw = W * 0.84;
  const hy = H * 0.6, hh = H * 0.26;
  const sx = W * 0.3, sw = W * 0.4, sy = H * 0.08, sh = H * 0.46;
  // mast
  g.fillStyle = '#4a2e18';
  g.fillRect(W * 0.5 - 2, sy - H * 0.05, 4, hy - sy + H * 0.06);
  g.fillRect(sx - W * 0.02, sy - 2, sw + W * 0.04, 4);

  const plain = skin.pattern === 0 || skin.sail < 0.3;
  const sr = plain ? null : skinImage(skin, Math.round(sw), Math.round(sh), 1, t);
  g.save();
  sailPath(g, sx, sy, sw, sh);
  g.clip();
  if (sr) g.drawImage(sr[0], sr[1], sr[2], sr[3], sr[4], sx, sy, sw, sh);
  else {
    g.fillStyle = '#f1e7d0';
    g.fillRect(sx, sy, sw, sh);
  }
  // cloth seams and a soft belly shade
  g.globalAlpha = 0.16;
  g.fillStyle = '#000';
  for (let i = 1; i < 6; i++) g.fillRect(sx + (sw * i) / 6, sy, 1, sh);
  g.globalAlpha = 1;
  const sg = g.createLinearGradient(sx, 0, sx + sw, 0);
  sg.addColorStop(0, 'rgba(0,0,0,0.28)');
  sg.addColorStop(0.45, 'rgba(255,255,255,0.08)');
  sg.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = sg;
  g.fillRect(sx, sy, sw, sh);
  g.restore();

  // hull
  const hr = skin.pattern === 0 ? null : skinImage(skin, Math.round(hw), Math.round(hh), 0, t);
  g.save();
  hullPath(g, hx, hy, hw, hh);
  g.clip();
  if (hr) g.drawImage(hr[0], hr[1], hr[2], hr[3], hr[4], hx, hy - hh * 0.08, hw, hh * 1.08);
  else {
    g.fillStyle = skin.colors[0];
    g.fillRect(hx, hy - hh * 0.1, hw, hh * 1.1);
  }
  // wale and gunports
  g.fillStyle = 'rgba(30,18,10,0.85)';
  g.fillRect(hx, hy + hh * 0.5, hw, hh * 0.09);
  g.fillStyle = '#e2b552';
  g.fillRect(hx, hy + hh * 0.48, hw, hh * 0.025);
  for (let i = 0; i < 5; i++) {
    const px = hx + hw * (0.24 + i * 0.12);
    const py = hy + hh * 0.22;
    g.fillStyle = '#d8a54a';
    g.fillRect(px - 1.5, py - 1.5, hw * 0.05 + 3, hh * 0.16 + 3);
    g.fillStyle = '#120c09';
    g.fillRect(px, py, hw * 0.05, hh * 0.16);
  }
  // boot top and bottom paint under the wale
  g.fillStyle = '#f5efe1';
  g.fillRect(hx, hy + hh * 0.8, hw, hh * 0.05);
  g.fillStyle = '#3a1f17';
  g.fillRect(hx, hy + hh * 0.85, hw, hh * 0.3);
  // round it: light from above, shade toward the keel
  const shade = g.createLinearGradient(0, hy, 0, hy + hh);
  shade.addColorStop(0, 'rgba(255,255,255,0.18)');
  shade.addColorStop(0.35, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.42)');
  g.fillStyle = shade;
  g.fillRect(hx, hy - hh * 0.1, hw, hh * 1.2);
  g.restore();
  // gilded rail
  g.strokeStyle = '#efc463';
  g.lineWidth = Math.max(1.5, H * 0.014);
  g.beginPath();
  g.moveTo(hx + hw * 0.04, hy + hh * 0.06);
  g.quadraticCurveTo(hx + hw * 0.5, hy + hh * 0.2, hx + hw * 0.86, hy);
  g.quadraticCurveTo(hx + hw * 0.97, hy + hh * 0.02, hx + hw, hy - hh * 0.06);
  g.stroke();
  // the sea she sits in
  const sea = g.createLinearGradient(0, hy + hh * 0.75, 0, H);
  sea.addColorStop(0, 'rgba(40,150,170,0.0)');
  sea.addColorStop(0.3, 'rgba(30,120,150,0.75)');
  sea.addColorStop(1, 'rgba(8,40,60,0.95)');
  g.fillStyle = sea;
  g.beginPath();
  g.moveTo(0, hy + hh * 0.8);
  for (let x = 0; x <= W; x += 6) g.lineTo(x, hy + hh * 0.8 + Math.sin(x * 0.08 + t * 1.6) * H * 0.012);
  g.lineTo(W, H);
  g.lineTo(0, H);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(220,250,255,0.5)';
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x <= W; x += 6) g[x ? 'lineTo' : 'moveTo'](x, hy + hh * 0.8 + Math.sin(x * 0.08 + t * 1.6) * H * 0.012);
  g.stroke();
}

/**
 * Card art for a skin: the paintwork itself, full bleed, like a swatch of
 * lacquered planking, with a ship's silhouette riding over it.
 */
export function drawSkinFabric(c: HTMLCanvasElement, skin: SkinItem, t: number) {
  const g = c.getContext('2d')!;
  const W = c.width;
  const H = c.height;
  const R = RARITIES[skin.rarity];
  const r = skin.pattern ? skinImage(skin, Math.min(W, 320), Math.min(H, 200), 0, t, [0, 0, 4.2, 4.2 * (H / W)]) : null;
  if (r) g.drawImage(r[0], r[1], r[2], r[3], r[4], 0, 0, W, H);
  else {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, skin.colors[0]);
    bg.addColorStop(1, skin.colors[1]);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
  }
  // planking seams, so it reads as a hull and not a tablecloth
  g.globalAlpha = 0.14;
  g.fillStyle = '#000';
  for (let i = 1; i < 7; i++) g.fillRect(0, (H * i) / 7, W, Math.max(1, H * 0.006));
  g.globalAlpha = 1;
  // light from above, rounding away into shade
  const sh = g.createLinearGradient(0, 0, 0, H);
  sh.addColorStop(0, 'rgba(255,255,255,0.22)');
  sh.addColorStop(0.3, 'rgba(255,255,255,0)');
  sh.addColorStop(0.62, 'rgba(0,0,0,0.05)');
  sh.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = sh;
  g.fillRect(0, 0, W, H);
  // a slow glint sweeping across the lacquer
  const gx = ((t * 0.18) % 1.6 - 0.3) * W;
  const gl = g.createLinearGradient(gx - W * 0.25, 0, gx + W * 0.25, H * 0.4);
  gl.addColorStop(0, 'rgba(255,255,255,0)');
  gl.addColorStop(0.5, 'rgba(255,255,255,0.16)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gl;
  g.fillRect(0, 0, W, H);
  // a ship's silhouette riding the bottom edge, in the rarity's light
  const s = W / 200;
  g.save();
  g.translate(W * 0.5, H * 0.94);
  g.scale(s, s);
  g.fillStyle = 'rgba(4, 14, 22, 0.72)';
  g.beginPath();
  g.moveTo(-70, -16);
  g.quadraticCurveTo(0, -8, 64, -22);
  g.quadraticCurveTo(58, -2, 48, 8);
  g.lineTo(-58, 8);
  g.quadraticCurveTo(-70, 0, -70, -16);
  g.fill();
  g.fillRect(-2, -78, 4, 62);
  g.fillRect(-36, -62, 4, 46);
  g.beginPath();
  g.moveTo(-26, -70);
  g.quadraticCurveTo(-6, -58, -24, -22);
  g.lineTo(26, -22);
  g.quadraticCurveTo(10, -50, 26, -70);
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(-54, -56);
  g.quadraticCurveTo(-38, -44, -52, -24);
  g.lineTo(-40, -24);
  g.lineTo(-40, -56);
  g.closePath();
  g.fill();
  g.restore();
  const glow = g.createRadialGradient(W * 0.5, H, 0, W * 0.5, H, W * 0.7);
  glow.addColorStop(0, R.css + '55');
  glow.addColorStop(1, R.css + '00');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
}

/** A flat patch of the skin (for chips and the showcase background). */
export function drawSkinPatch(c: HTMLCanvasElement, skin: SkinItem, t: number, mode: 0 | 1 = 0) {
  const g = c.getContext('2d')!;
  const r = skin.pattern ? skinImage(skin, c.width, c.height, mode, t, [0, 0, 8, 8 * (c.height / c.width)]) : null;
  if (r) g.drawImage(r[0], r[1], r[2], r[3], r[4], 0, 0, c.width, c.height);
  else {
    g.fillStyle = skin.colors[0];
    g.fillRect(0, 0, c.width, c.height);
  }
}

// ------------------------------------------------------------------ live previews

interface Live {
  c: HTMLCanvasElement;
  draw: (t: number) => void;
  animated: boolean;
  visible: boolean;
  seen: boolean;
  drawn: boolean;
}

const lives = new Set<Live>();
const byCanvas = new WeakMap<Element, Live>();
let raf = 0;
let frame = 0;
const io =
  typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver((es) => {
        for (const e of es) {
          const l = byCanvas.get(e.target);
          if (l) l.visible = e.isIntersecting;
        }
      })
    : null;

function loop() {
  raf = 0;
  frame++;
  const t = performance.now() / 1000;
  for (const l of lives) {
    if (!l.c.isConnected) {
      if (l.seen) {
        lives.delete(l);
        io?.unobserve(l.c);
      }
      continue;
    }
    l.seen = true;
    if (!l.visible) continue;
    if (!l.drawn || (l.animated && frame % 2 === 0)) {
      l.draw(t);
      l.drawn = true;
    }
  }
  if (lives.size) raf = requestAnimationFrame(loop);
}

/** A canvas showing an item: animated while on screen, dropped once it leaves the page. */
export function itemCanvas(it: Item, w: number, h: number, cls = '', art: 'ship' | 'card' = 'ship'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  if (cls) c.className = cls;
  let draw: (t: number) => void;
  let animated: boolean;
  if (it.kind === 'skin') {
    draw = art === 'card' ? (t) => drawSkinFabric(c, it, t) : (t) => drawSkinCard(c, it, t);
    animated = true; // the sea always moves; animated skins move too
  } else {
    const fx = it as FxItem;
    const sim = drawFx(c, fx, art === 'card');
    draw = (t) => sim(t);
    animated = true;
  }
  const l: Live = { c, draw, animated, visible: !io, seen: false, drawn: false };
  lives.add(l);
  byCanvas.set(c, l);
  io?.observe(c);
  if (!raf) raf = requestAnimationFrame(loop);
  return c;
}
