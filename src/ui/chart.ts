// Full-screen sea chart: a hand-inked overview of the whole archipelago with
// pan (drag), zoom (wheel / pinch) and live markers for the player, nearby
// pirates, salvage and every isle, named once discovered.

import { Ship } from '../ships/ship';
import { Terrain, WORLD_SIZE, Island } from '../world/terrain';

const HALF = WORLD_SIZE / 2;
const SPYGLASS = 650; // pirates are only charted within this range of you
const MAX_ZOOM = 6;

export interface ChartScene {
  player: Ship;
  ships: Ship[];
  loot: { x: number; z: number }[];
  islands: Island[];
  discovered: Set<string>;
  windX: number;
  windZ: number;
  time: number;
}

export class SeaChart {
  private g: CanvasRenderingContext2D;
  private image: HTMLCanvasElement | null = null;
  private dpr = 1;
  private W = 1;
  private H = 1;
  // view: world centre and zoom (1 = whole world fits)
  private cx = 0;
  private cz = 0;
  private zoom = 1;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchD = 0;
  private dragged = 0;
  private terrain: Terrain | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d')!;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.dragged = 0;
      if (this.pointers.size === 2) this.pinchD = this.pinchDist();
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size === 1) {
        const s = this.scale();
        this.cx -= dx / s;
        this.cz -= dy / s;
        this.dragged += Math.abs(dx) + Math.abs(dy);
      } else if (this.pointers.size === 2) {
        const d = this.pinchDist();
        const [a, b] = Array.from(this.pointers.values());
        if (this.pinchD > 0) this.zoomAt(d / this.pinchD, (a.x + b.x) / 2, (a.y + b.y) / 2);
        this.pinchD = d;
      }
      this.clampView();
    });
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      this.pinchD = this.pointers.size === 2 ? this.pinchDist() : 0;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
      },
      { passive: false },
    );
    canvas.addEventListener('dblclick', (e) => this.zoomAt(2, e.clientX, e.clientY));
  }

  setTerrain(t: Terrain) {
    this.terrain = t;
    this.image = null;
  }

  /** Open fitted to the whole world, but nudged towards the player. */
  open(player: Ship) {
    this.resize();
    this.zoom = 1.35;
    this.cx = player.pos.x;
    this.cz = player.pos.z;
    this.clampView();
  }

  recenter(player: Ship) {
    this.cx = player.pos.x;
    this.cz = player.pos.z;
    this.clampView();
  }

  /** True while the last gesture was a drag rather than a tap. */
  get wasDrag() {
    return this.dragged > 6;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.W = Math.max(1, r.width);
    this.H = Math.max(1, r.height);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.clampView();
  }

  private pinchDist() {
    const [a, b] = Array.from(this.pointers.values());
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private fit() {
    return (Math.min(this.W, this.H) / WORLD_SIZE) * 0.96;
  }

  private scale() {
    return this.fit() * this.zoom;
  }

  private zoomAt(f: number, clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    const mx = clientX - r.left - this.W / 2;
    const my = clientY - r.top - this.H / 2;
    const s0 = this.scale();
    const wx = this.cx + mx / s0;
    const wz = this.cz + my / s0;
    this.zoom = Math.min(MAX_ZOOM, Math.max(1, this.zoom * f));
    const s1 = this.scale();
    this.cx = wx - mx / s1;
    this.cz = wz - my / s1;
    this.clampView();
  }

  private clampView() {
    const s = this.scale();
    const ex = this.W / 2 / s;
    const ez = this.H / 2 / s;
    const pad = 40 / s;
    this.cx = ex + pad >= HALF ? 0 : Math.min(HALF - ex + pad, Math.max(-HALF + ex - pad, this.cx));
    this.cz = ez + pad >= HALF ? 0 : Math.min(HALF - ez + pad, Math.max(-HALF + ez - pad, this.cz));
  }

  // ------------------------------------------------------------- base image

  private build() {
    const t = this.terrain!;
    const res = 1024;
    const step = WORLD_SIZE / res;
    const hs = new Float32Array(res * res);
    for (let j = 0; j < res; j++)
      for (let i = 0; i < res; i++) hs[j * res + i] = t.heightAt(-HALF + (i + 0.5) * step, -HALF + (j + 0.5) * step);
    const c = document.createElement('canvas');
    c.width = c.height = res;
    const g = c.getContext('2d')!;
    const img = g.createImageData(res, res);
    const H = (i: number, j: number) => hs[Math.min(res - 1, Math.max(0, j)) * res + Math.min(res - 1, Math.max(0, i))];
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const h = hs[j * res + i];
        // hillshade, lit from the north-west like an old engraved chart
        const dx = (H(i + 1, j) - H(i - 1, j)) / (2 * step);
        const dz = (H(i, j + 1) - H(i, j - 1)) / (2 * step);
        const shade = Math.max(0.55, Math.min(1.25, 1 - (dx + dz) * 0.55));
        let r: number, gg: number, b: number;
        if (h > 1.2) {
          const k = Math.min(1, (h - 1.2) / 45);
          const rock = Math.max(0, (h - 30) / 30);
          r = (110 + k * 60 + rock * 40) * shade;
          gg = (158 - k * 22 + rock * 20) * shade;
          b = (86 + k * 20 + rock * 50) * shade;
        } else if (h > 0) {
          r = 238;
          gg = 222;
          b = 178;
        } else {
          const k = Math.min(1, -h / 16);
          const kk = k * k;
          r = 92 - kk * 62;
          gg = 214 - k * 118;
          b = 206 - k * 70;
          // faint depth contours
          const band = (-h / 4) % 1;
          if (h < -1 && band < 0.06) {
            r += 14;
            gg += 16;
            b += 16;
          }
        }
        // inked coastline
        if (h > 0 && (H(i + 1, j) <= 0 || H(i - 1, j) <= 0 || H(i, j + 1) <= 0 || H(i, j - 1) <= 0)) {
          r = 92;
          gg = 70;
          b = 46;
        }
        const o = (j * res + i) * 4;
        img.data[o] = r;
        img.data[o + 1] = gg;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    this.image = c;
  }

  // ------------------------------------------------------------------ draw

  draw(sc: ChartScene) {
    if (!this.image && this.terrain) this.build();
    const g = this.g;
    const W = this.W;
    const H = this.H;
    const s = this.scale();
    const toS = (x: number, z: number): [number, number] => [(x - this.cx) * s + W / 2, (z - this.cz) * s + H / 2];
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#0a3446';
    g.fillRect(0, 0, W, H);

    if (this.image) {
      const [x0, y0] = toS(-HALF, -HALF);
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(this.image, x0, y0, WORLD_SIZE * s, WORLD_SIZE * s);
    }

    // graticule
    g.strokeStyle = 'rgba(255, 244, 214, 0.13)';
    g.lineWidth = 1;
    g.beginPath();
    for (let v = -HALF; v <= HALF; v += 256) {
      const [ax, ay] = toS(v, -HALF);
      const [, by] = toS(v, HALF);
      g.moveTo(ax, ay);
      g.lineTo(ax, by);
      const [cx, cy] = toS(-HALF, v);
      const [dx] = toS(HALF, v);
      g.moveTo(cx, cy);
      g.lineTo(dx, cy);
    }
    g.stroke();

    // salvage
    g.fillStyle = '#ffe08a';
    g.shadowColor = 'rgba(255, 210, 110, 0.9)';
    g.shadowBlur = 8;
    for (const l of sc.loot) {
      const [x, y] = toS(l.x, l.z);
      g.beginPath();
      g.arc(x, y, 3.5, 0, Math.PI * 2);
      g.fill();
    }
    g.shadowBlur = 0;

    // isles
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const isl of sc.islands) {
      const [x, y] = toS(isl.x, isl.z);
      const known = sc.discovered.has(isl.name);
      const ly = y + Math.max(14, isl.r * s * 0.55 + 12);
      if (known) {
        g.font = `600 ${Math.round(Math.min(18, 12 + this.zoom * 1.2))}px Cinzel, Georgia, serif`;
        g.lineWidth = 4;
        g.strokeStyle = 'rgba(8, 30, 40, 0.75)';
        g.strokeText(isl.name, x, ly);
        g.fillStyle = '#fff1c8';
        g.fillText(isl.name, x, ly);
      } else {
        g.font = '700 20px Cinzel, Georgia, serif';
        g.lineWidth = 4;
        g.strokeStyle = 'rgba(8, 30, 40, 0.7)';
        g.strokeText('?', x, y);
        g.fillStyle = 'rgba(255, 241, 184, 0.95)';
        g.fillText('?', x, y);
        g.font = '500 11px Inter, system-ui, sans-serif';
        g.strokeText('Uncharted', x, ly);
        g.fillStyle = 'rgba(255, 241, 200, 0.7)';
        g.fillText('Uncharted', x, ly);
      }
    }

    const p = sc.player;
    const tri = (sh: Ship, color: string, size: number) => {
      const [x, y] = toS(sh.pos.x, sh.pos.z);
      g.save();
      g.translate(x, y);
      g.rotate(-sh.heading + Math.PI);
      g.fillStyle = color;
      g.strokeStyle = 'rgba(0,0,0,0.55)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, -size);
      g.lineTo(size * 0.62, size * 0.8);
      g.lineTo(0, size * 0.45);
      g.lineTo(-size * 0.62, size * 0.8);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    };

    // spyglass range + pirates inside it
    const [px, py] = toS(p.pos.x, p.pos.z);
    g.setLineDash([4, 6]);
    g.strokeStyle = 'rgba(255, 244, 214, 0.28)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(px, py, SPYGLASS * s, 0, Math.PI * 2);
    g.stroke();
    // heading line
    g.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(px + Math.sin(p.heading) * 160 * s, py + Math.cos(p.heading) * 160 * s);
    g.stroke();
    g.setLineDash([]);
    for (const sh of sc.ships) {
      if (sh === p || !sh.alive) continue;
      if (Math.hypot(sh.pos.x - p.pos.x, sh.pos.z - p.pos.z) > SPYGLASS) continue;
      tri(sh, '#ff6a55', 10);
    }

    // you are here
    const pulse = (sc.time * 0.8) % 1;
    g.strokeStyle = `rgba(255, 255, 255, ${0.7 * (1 - pulse)})`;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(px, py, 10 + pulse * 22, 0, Math.PI * 2);
    g.stroke();
    tri(p, '#ffffff', 14);

    this.drawRose(g, W - 58, H - 58, 40, sc.windX, sc.windZ);
    this.drawScale(g, 18, H - 22, s);
  }

  private drawRose(g: CanvasRenderingContext2D, x: number, y: number, r: number, wx: number, wz: number) {
    g.save();
    g.translate(x, y);
    g.fillStyle = 'rgba(8, 26, 36, 0.55)';
    g.beginPath();
    g.arc(0, 0, r + 6, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 4; i++) {
      g.rotate(Math.PI / 2);
      g.fillStyle = i === 3 ? '#efc463' : 'rgba(255, 241, 214, 0.85)';
      g.beginPath();
      g.moveTo(0, -r);
      g.lineTo(5, 0);
      g.lineTo(-5, 0);
      g.closePath();
      g.fill();
    }
    g.font = '700 11px Cinzel, Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#efc463';
    g.fillText('N', 0, -r - 16);
    // wind arrow
    const a = Math.atan2(wx, wz);
    g.rotate(-a + Math.PI);
    g.strokeStyle = '#7fe3f0';
    g.fillStyle = '#7fe3f0';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, r * 0.7);
    g.lineTo(0, -r * 0.55);
    g.stroke();
    g.beginPath();
    g.moveTo(0, -r * 0.75);
    g.lineTo(5, -r * 0.5);
    g.lineTo(-5, -r * 0.5);
    g.closePath();
    g.fill();
    g.restore();
  }

  private drawScale(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
    const metres = s * 200 > 140 ? 100 : s * 200 > 60 ? 200 : 500;
    const len = metres * s;
    g.strokeStyle = 'rgba(255, 241, 214, 0.85)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, y - 4);
    g.lineTo(x, y);
    g.lineTo(x + len, y);
    g.lineTo(x + len, y - 4);
    g.stroke();
    g.font = '500 11px Inter, system-ui, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'bottom';
    g.fillStyle = 'rgba(255, 241, 214, 0.85)';
    g.fillText(`${metres} m`, x + 2, y - 6);
  }
}
