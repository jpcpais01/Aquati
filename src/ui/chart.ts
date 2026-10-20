// Full-screen sea chart: a hand-inked overview of the whole archipelago with
// pan (drag), zoom (wheel / pinch) and live markers for the player, nearby
// pirates, salvage and every isle, named once discovered. Tap the sea to drop
// a waypoint; tap a pin to lift it.

import { RARITY } from '../game/loot';
import { Ship } from '../ships/ship';
import { Terrain, WORLD_SIZE, Island } from '../world/terrain';
import type { Seas } from '../world/seas';
import { EDGE_R, HIGH_SEAS_R, nearestRegion, Region, REGIONS } from '../world/regions';
import { PIN_COLORS } from '../game/waypoints';

const SPYGLASS = 650; // pirates are only charted within this range of you
/** The whole known sea: every archipelago's square, and the high seas between. */
const SEA = {
  x0: Math.min(...REGIONS.map((r) => r.x)) - EDGE_R,
  x1: Math.max(...REGIONS.map((r) => r.x)) + EDGE_R,
  z0: Math.min(...REGIONS.map((r) => r.z)) - EDGE_R,
  z1: Math.max(...REGIONS.map((r) => r.z)) + EDGE_R,
};
const SEA_W = SEA.x1 - SEA.x0;
const SEA_H = SEA.z1 - SEA.z0;
/** As close as one archipelago could be looked at before, whatever the sea's size. */
const MAX_ZOOM = (6 * Math.max(SEA_W, SEA_H)) / WORLD_SIZE;
/** The open water between the archipelagos, as the chart names it. */
export const HIGH_SEAS_NAME = 'Mar Sereno';

/** Which archipelago's waters a point lies in (null out on the high seas). */
function regionAt(x: number, z: number): Region | null {
  const { region, dist } = nearestRegion(x, z);
  return dist < HIGH_SEAS_R ? region : null;
}

/** A trading port on a map: a gilt disc with a pair of scales. */
export function portMark(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.save();
  g.translate(x, y);
  g.shadowColor = 'rgba(255, 196, 80, 0.8)';
  g.shadowBlur = r;
  g.fillStyle = '#f4c255';
  g.strokeStyle = 'rgba(40, 22, 6, 0.85)';
  g.lineWidth = Math.max(1.5, r * 0.2);
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
  g.stroke();
  // scales: post, beam and two pans
  const k = r / 10;
  g.strokeStyle = '#4a2a0c';
  g.lineWidth = 1.6 * k;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, -5.5 * k);
  g.lineTo(0, 5.5 * k);
  g.moveTo(-4 * k, 5.5 * k);
  g.lineTo(4 * k, 5.5 * k);
  g.moveTo(-5.5 * k, -3.5 * k);
  g.lineTo(5.5 * k, -3.5 * k);
  g.stroke();
  g.fillStyle = '#4a2a0c';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * 5.5 * k - 3 * k, 0.5 * k);
    g.lineTo(s * 5.5 * k + 3 * k, 0.5 * k);
    g.lineTo(s * 5.5 * k, -3.5 * k);
    g.closePath();
    g.fill();
  }
  g.restore();
}

/** A fort on a map: a little crenellated tower, coral red while the Brethren hold it, aqua once it's yours. */
export function fortMark(g: CanvasRenderingContext2D, x: number, y: number, r: number, ours: boolean, quiet = false) {
  g.save();
  g.translate(x, y);
  const k = r / 10;
  const fill = ours ? '#5ee3d4' : quiet ? '#c9a98a' : '#ff8a6a';
  g.shadowColor = ours ? 'rgba(94, 227, 212, 0.8)' : 'rgba(255, 120, 80, 0.7)';
  g.shadowBlur = r * 0.9;
  g.fillStyle = fill;
  g.strokeStyle = 'rgba(20, 10, 4, 0.85)';
  g.lineWidth = Math.max(1.4, 1.6 * k);
  g.lineJoin = 'round';
  g.beginPath();
  // walls with three merlons, and an arched gate
  g.moveTo(-8 * k, 8 * k);
  g.lineTo(-8 * k, -4 * k);
  for (const [a, b] of [[-8, -4.6], [-1.7, 1.7], [4.6, 8]]) {
    g.lineTo(a * k, -8 * k);
    g.lineTo(b * k, -8 * k);
    g.lineTo(b * k, -4 * k);
  }
  g.lineTo(8 * k, 8 * k);
  g.lineTo(2.4 * k, 8 * k);
  g.arc(0, 8 * k, 2.4 * k, 0, Math.PI, true);
  g.closePath();
  g.fill();
  g.shadowBlur = 0;
  g.stroke();
  g.restore();
}

/**
 * A maelstrom on a map: an inked spiral winding in, turned by `turn` (radians)
 * so it slowly wheels on the live maps.
 */
export function vortexMark(g: CanvasRenderingContext2D, x: number, y: number, r: number, turn = 0, dir: 1 | -1 = 1) {
  g.save();
  g.translate(x, y);
  g.rotate(turn * dir);
  g.scale(dir, 1);
  g.lineCap = 'round';
  for (const [w, c] of [[r * 0.42, 'rgba(8, 20, 28, 0.7)'], [r * 0.2, '#ff9a7a']] as const) {
    g.strokeStyle = c;
    g.lineWidth = Math.max(1.2, w);
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const a = t * Math.PI * 4.2;
      const rr = r * (0.08 + 0.92 * t);
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (i) g.lineTo(px, py);
      else g.moveTo(px, py);
    }
    g.stroke();
  }
  g.fillStyle = '#1a0a08';
  g.beginPath();
  g.arc(0, 0, Math.max(1.5, r * 0.14), 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** A reef on a map: the old chartmakers' danger mark, a cross ringed with dots. */
export function reefMark(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.save();
  g.translate(x, y);
  g.lineCap = 'round';
  for (const [w, c] of [[r * 0.36, 'rgba(8, 20, 28, 0.7)'], [r * 0.17, '#ffb38a']] as const) {
    g.strokeStyle = c;
    g.lineWidth = Math.max(1.1, w);
    g.beginPath();
    g.moveTo(-r * 0.55, 0);
    g.lineTo(r * 0.55, 0);
    g.moveTo(0, -r * 0.55);
    g.lineTo(0, r * 0.55);
    g.stroke();
  }
  g.fillStyle = '#ffb38a';
  g.strokeStyle = 'rgba(8, 20, 28, 0.6)';
  g.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    g.beginPath();
    g.arc(Math.cos(a) * r, Math.sin(a) * r, Math.max(1, r * 0.12), 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  g.restore();
}

/** A sea hazard as the maps show it. */
export interface HazardMark {
  kind: 'vortex' | 'reef';
  name: string;
  x: number;
  z: number;
  /** Its reach (m): a maelstrom's pull, or how far the reef spreads. */
  r: number;
  dir: 1 | -1;
}

/** A treasure map's X, in red ink with a dark outline. */
export function xMark(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.save();
  g.lineCap = 'round';
  for (const [w, c] of [[r * 0.75, 'rgba(20, 8, 4, 0.7)'], [r * 0.42, '#e8432f']] as const) {
    g.strokeStyle = c;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x - r, y - r);
    g.lineTo(x + r, y + r);
    g.moveTo(x + r, y - r);
    g.lineTo(x - r, y + r);
    g.stroke();
  }
  g.restore();
}

export interface ChartScene {
  player: Ship;
  ships: Ship[];
  loot: { x: number; z: number; tier?: number }[];
  islands: Island[];
  discovered: Set<string>;
  /** Trading ports, always marked: sailors know where the markets are. */
  ports?: { x: number; z: number; name: string }[];
  /** Waypoints dropped by the captain. */
  pins?: { x: number; z: number; hue: number; age: number }[];
  /** A whole treasure map's X. */
  treasure?: { x: number; z: number } | null;
  /** The island forts, and whose they are. */
  forts?: { x: number; z: number; name: string; ours: boolean; quiet: boolean }[];
  /** Maelstroms and open-sea reefs: every captain knows the old tales of where they lie. */
  hazards?: HazardMark[];
  /** The archipelagos you've sailed into; the rest are only rumours in the mist. */
  charted?: Set<string>;
  windX: number;
  windZ: number;
  time: number;
}

/** A waypoint on a map: a glowing teardrop pin standing on its spot. */
export function pinMark(g: CanvasRenderingContext2D, x: number, y: number, r: number, css: string, label = '') {
  g.save();
  g.translate(x, y);
  // the spot itself, a soft glowing dot under the pin
  g.shadowColor = css;
  g.shadowBlur = r * 1.4;
  g.fillStyle = css;
  g.beginPath();
  g.ellipse(0, 0, r * 0.38, r * 0.2, 0, 0, Math.PI * 2);
  g.fill();
  // teardrop head standing above it
  const hy = -r * 1.55;
  g.beginPath();
  g.moveTo(0, -r * 0.05);
  g.bezierCurveTo(-r * 0.25, -r * 0.55, -r * 0.82, -r * 0.95, -r * 0.82, hy);
  g.arc(0, hy, r * 0.82, Math.PI, 0);
  g.bezierCurveTo(r * 0.82, -r * 0.95, r * 0.25, -r * 0.55, 0, -r * 0.05);
  g.closePath();
  g.fill();
  g.shadowBlur = 0;
  g.lineWidth = Math.max(1.2, r * 0.16);
  g.strokeStyle = 'rgba(20, 14, 6, 0.75)';
  g.stroke();
  g.fillStyle = 'rgba(20, 14, 6, 0.82)';
  g.font = `700 ${Math.round(r * 1.05)}px Inter, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (label) g.fillText(label, 0, hy + r * 0.05);
  else {
    g.beginPath();
    g.arc(0, hy, r * 0.3, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** Distance as a sailor reads it: metres up close, kilometres beyond. */
export function fmtDist(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

export class SeaChart {
  private g: CanvasRenderingContext2D;
  /** Each archipelago's engraved chart, keyed by its id. */
  private images = new Map<string, HTMLCanvasElement>();
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
  private seas: Seas | null = null;
  private multi = false;
  private tapT = 0;
  /** A tap on the chart (not a drag, pinch or double-click): world spot and the world radius of a fingertip. */
  onTap: (x: number, z: number, pick: number) => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d')!;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      if (!this.pointers.size) this.multi = false;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.dragged = 0;
      if (this.pointers.size === 2) {
        this.pinchD = this.pinchDist();
        this.multi = true;
      }
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
    // a tap waits a beat, so a double-click can zoom instead of dropping a pin
    canvas.addEventListener('click', (e) => {
      if (this.wasDrag || this.multi) return;
      clearTimeout(this.tapT);
      const [x, z] = this.toWorld(e.clientX, e.clientY);
      const pick = (e.pointerType === 'touch' ? 26 : 16) / this.scale();
      this.tapT = window.setTimeout(() => this.onTap(x, z, pick), 230);
    });
    canvas.addEventListener('dblclick', (e) => {
      clearTimeout(this.tapT);
      this.zoomAt(2, e.clientX, e.clientY);
    });
  }

  private toWorld(clientX: number, clientY: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    const s = this.scale();
    return [this.cx + (clientX - r.left - this.W / 2) / s, this.cz + (clientY - r.top - this.H / 2) / s];
  }

  setTerrain(t: Seas) {
    this.seas = t;
    this.images.clear();
  }

  /** Open on the waters you're in (as close as one archipelago used to fill it), centred on the player. */
  open(player: Ship) {
    this.resize();
    // out on the high seas there's nothing near to show: open on the whole sea
    const open = !regionAt(player.pos.x, player.pos.z);
    this.zoom = open ? 1 : Math.min(MAX_ZOOM, (1.35 * Math.min(this.W, this.H)) / WORLD_SIZE / (this.fit() / 0.96));
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
    return Math.min(this.W / SEA_W, this.H / SEA_H) * 0.96;
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
    const mx = (SEA.x0 + SEA.x1) / 2;
    const mz = (SEA.z0 + SEA.z1) / 2;
    this.cx = ex + pad >= SEA_W / 2 ? mx : Math.min(SEA.x1 - ex + pad, Math.max(SEA.x0 + ex - pad, this.cx));
    this.cz = ez + pad >= SEA_H / 2 ? mz : Math.min(SEA.z1 - ez + pad, Math.max(SEA.z0 + ez - pad, this.cz));
  }

  // ------------------------------------------------------------- base image

  /** Engraves one archipelago's square (its first look on the chart, then kept). */
  private build(t: Terrain, mist: boolean) {
    const res = 1024;
    const step = WORLD_SIZE / res;
    const hs = new Float32Array(res * res);
    for (let j = 0; j < res; j++)
      for (let i = 0; i < res; i++) hs[j * res + i] = t.heightAt(t.x0 + (i + 0.5) * step, t.z0 + (j + 0.5) * step);
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
          if (mist) {
            // the mist isles: jade jungle, pale limestone towers
            const lime = Math.min(1, Math.max(0, (h - 18) / 40));
            r = (96 + lime * 120) * shade;
            gg = (150 + lime * 66) * shade;
            b = (104 + lime * 100) * shade;
          }
        } else if (h > 0) {
          r = mist ? 240 : 238;
          gg = mist ? 214 : 222;
          b = mist ? 200 : 178;
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
    // the deep edge of the square melts into the open sea round it
    const fade = g.createRadialGradient(res / 2, res / 2, res * 0.42, res / 2, res / 2, res * 0.5);
    fade.addColorStop(0, 'rgba(10, 52, 70, 0)');
    fade.addColorStop(1, 'rgba(10, 52, 70, 1)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = fade;
    g.fillRect(0, 0, res, res);
    g.globalCompositeOperation = 'source-over';
    return c;
  }

  // ------------------------------------------------------------------ draw

  draw(sc: ChartScene) {
    const g = this.g;
    const W = this.W;
    const H = this.H;
    const s = this.scale();
    const toS = (x: number, z: number): [number, number] => [(x - this.cx) * s + W / 2, (z - this.cz) * s + H / 2];
    const charted = (r: Region | null) => !r || r.id === 'home' || !sc.charted || sc.charted.has(r.id);
    // is a point somewhere the chart can show (not inside a rumoured archipelago)?
    const shown = (x: number, z: number) => charted(regionAt(x, z));
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#0a3446';
    g.fillRect(0, 0, W, H);

    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    for (const t of this.seas?.regions ?? []) {
      const region = nearestRegion(t.ox, t.oz).region;
      const [x0, y0] = toS(t.x0, t.z0);
      const size = WORLD_SIZE * s;
      if (x0 > W || y0 > H || x0 + size < 0 || y0 + size < 0) continue;
      let img = this.images.get(region.id);
      if (!img) this.images.set(region.id, (img = this.build(t, t.style === 'brumas')));
      if (charted(region)) {
        g.drawImage(img, x0, y0, size, size);
        continue;
      }
      // a rumour: a faint outline under drifting mist, and the old tale of it
      g.globalAlpha = 0.22;
      g.drawImage(img, x0, y0, size, size);
      g.globalAlpha = 1;
      const [mx, my] = toS(region.x, region.z);
      const fog = g.createRadialGradient(mx, my, 0, mx, my, size * 0.5);
      fog.addColorStop(0, 'rgba(206, 222, 226, 0.34)');
      fog.addColorStop(0.7, 'rgba(180, 204, 212, 0.16)');
      fog.addColorStop(1, 'rgba(180, 204, 212, 0)');
      g.fillStyle = fog;
      g.fillRect(x0, y0, size, size);
    }

    // graticule: finer as you zoom in
    const grid = s * 1024 < 90 ? 2048 : s * 256 < 40 ? 1024 : 256;
    g.strokeStyle = 'rgba(255, 244, 214, 0.13)';
    g.lineWidth = 1;
    g.beginPath();
    for (let v = Math.ceil(SEA.x0 / grid) * grid; v <= SEA.x1; v += grid) {
      const [ax, ay] = toS(v, SEA.z0);
      const [, by] = toS(v, SEA.z1);
      g.moveTo(ax, ay);
      g.lineTo(ax, by);
    }
    for (let v = Math.ceil(SEA.z0 / grid) * grid; v <= SEA.z1; v += grid) {
      const [cx, cy] = toS(SEA.x0, v);
      const [dx] = toS(SEA.x1, v);
      g.moveTo(cx, cy);
      g.lineTo(dx, cy);
    }
    g.stroke();

    this.drawSeaNames(g, toS, s, sc, charted);
    // zoomed out to the whole sea, only the archipelagos are named: their isles,
    // towns and dangers shrink to marks
    const detail = this.farness(s) < 0.5;

    // salvage
    for (const l of sc.loot) {
      const [x, y] = toS(l.x, l.z);
      const t = l.tier ?? 0;
      g.fillStyle = g.shadowColor = RARITY[t].css;
      g.shadowBlur = t >= 3 ? 14 : 8;
      g.beginPath();
      g.arc(x, y, t >= 3 ? 5 : t ? 4 : 3, 0, Math.PI * 2);
      g.fill();
    }
    g.shadowBlur = 0;

    // isles
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const isl of sc.islands) {
      if (!shown(isl.x, isl.z) || !detail) continue;
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

    // trading ports
    g.font = '600 12px Cinzel, Georgia, serif';
    for (const pt of sc.ports ?? []) {
      if (!shown(pt.x, pt.z)) continue;
      const [x, y] = toS(pt.x, pt.z);
      portMark(g, x, y, detail ? 9 : 5);
      if (!detail) continue;
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(8, 30, 40, 0.8)';
      g.strokeText(pt.name, x, y - 18);
      g.fillStyle = '#ffd77a';
      g.fillText(pt.name, x, y - 18);
    }

    // the forts, named (every captain knows where the Brethren's guns are)
    g.font = '600 12px Cinzel, Georgia, serif';
    for (const f of sc.forts ?? []) {
      if (!shown(f.x, f.z)) continue;
      const [x, y] = toS(f.x, f.z);
      fortMark(g, x, y, detail ? 9 : 5, f.ours, f.quiet);
      if (!detail) continue;
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(8, 30, 40, 0.8)';
      g.strokeText(f.name, x, y - 18);
      g.fillStyle = f.ours ? '#9ff3e8' : '#ffb59a';
      g.fillText(f.name, x, y - 18);
    }

    // the sea's dangers, inked in coral red: a maelstrom's pull dashed round its
    // spiral, a reef's danger mark, each with its name in italic
    for (const hz of sc.hazards ?? []) {
      if (!shown(hz.x, hz.z) || !detail) continue;
      const [x, y] = toS(hz.x, hz.z);
      const rr = hz.r * s;
      g.font = 'italic 600 12px Georgia, serif';
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(8, 30, 40, 0.8)';
      if (hz.kind === 'vortex') {
        g.save();
        g.setLineDash([5, 5]);
        g.lineDashOffset = -sc.time * 6 * hz.dir;
        g.strokeStyle = 'rgba(255, 140, 110, 0.55)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(x, y, rr, 0, Math.PI * 2);
        g.stroke();
        g.restore();
        vortexMark(g, x, y, Math.max(9, Math.min(26, rr * 0.45)), sc.time * 0.6, hz.dir);
        g.lineWidth = 4;
        g.strokeStyle = 'rgba(8, 30, 40, 0.8)';
        const ly = y + Math.max(rr, 14) + 14;
        g.strokeText(hz.name, x, ly);
        g.fillStyle = '#ffb59a';
        g.fillText(hz.name, x, ly);
      } else {
        reefMark(g, x, y, 7);
        g.strokeText(hz.name, x, y - 17);
        g.fillStyle = '#ffc9a6';
        g.fillText(hz.name, x, y - 17);
      }
    }

    if (sc.treasure) {
      const [x, y] = toS(sc.treasure.x, sc.treasure.z);
      xMark(g, x, y, 10);
      g.font = 'italic 600 13px Georgia, serif';
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(8, 30, 40, 0.8)';
      g.strokeText('X marks the spot', x, y - 20);
      g.fillStyle = '#ffb59f';
      g.fillText('X marks the spot', x, y - 20);
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
      // your escorts: always on the chart, named, with a faint line back to the flagship
      if (sh.team === 'player') {
        const [ex, ey] = toS(sh.pos.x, sh.pos.z);
        g.strokeStyle = 'rgba(94, 227, 212, 0.35)';
        g.lineWidth = 1.2;
        g.setLineDash([2, 4]);
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(ex, ey);
        g.stroke();
        g.setLineDash([]);
        tri(sh, '#5ee3d4', 11);
        g.font = '700 11.5px Cinzel, Georgia, serif';
        g.textAlign = 'center';
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(2, 24, 26, 0.85)';
        g.strokeText(sh.name, ex, ey + 21);
        g.fillStyle = '#c8fff4';
        g.fillText(sh.name, ex, ey + 21);
        continue;
      }
      if (sh.prize) continue;
      // the Brethren make sure you know where their hunters are
      if (sh.hunter) {
        const [hx, hy] = toS(sh.pos.x, sh.pos.z);
        const hp = (sc.time * 0.6) % 1;
        g.strokeStyle = `rgba(255, 90, 60, ${0.85 * (1 - hp)})`;
        g.lineWidth = 2.5;
        g.beginPath();
        g.arc(hx, hy, 12 + hp * 26, 0, Math.PI * 2);
        g.stroke();
        tri(sh, '#ffcf7a', 13);
        g.font = '700 13px Cinzel, Georgia, serif';
        g.textAlign = 'center';
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(40, 6, 4, 0.85)';
        g.strokeText(sh.name, hx, hy - 20);
        g.fillStyle = '#ffd8c8';
        g.fillText(sh.name, hx, hy - 20);
        continue;
      }
      if (Math.hypot(sh.pos.x - p.pos.x, sh.pos.z - p.pos.z) > SPYGLASS) continue;
      tri(sh, sh.ghost ? '#7dffc4' : '#ff6a55', 10);
    }

    // you are here
    const pulse = (sc.time * 0.8) % 1;
    g.strokeStyle = `rgba(255, 255, 255, ${0.7 * (1 - pulse)})`;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(px, py, 10 + pulse * 22, 0, Math.PI * 2);
    g.stroke();
    tri(p, '#ffffff', 14);

    // waypoints: a dotted course from the ship, the pin and its distance
    const pins = sc.pins ?? [];
    if (pins.length) {
      g.lineWidth = 1.6;
      g.setLineDash([2, 6]);
      g.lineCap = 'round';
      for (const pin of pins) {
        const [x, y] = toS(pin.x, pin.z);
        g.strokeStyle = PIN_COLORS[pin.hue].css;
        g.globalAlpha = 0.7;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(x, y);
        g.stroke();
      }
      g.setLineDash([]);
      g.globalAlpha = 1;
      g.font = '600 11.5px Inter, system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'top';
      pins.forEach((pin, i) => {
        const [x, y] = toS(pin.x, pin.z);
        const css = PIN_COLORS[pin.hue].css;
        // dropped pins land with a little bounce
        const k = Math.min(1, pin.age / 0.45);
        const drop = (1 - k) * (1 - k) * 26 - Math.sin(k * Math.PI) * 3;
        const ring = (sc.time * 0.6 + i * 0.3) % 1;
        g.strokeStyle = css;
        g.globalAlpha = 0.6 * (1 - ring);
        g.lineWidth = 1.5;
        g.beginPath();
        g.ellipse(x, y, 6 + ring * 16, (6 + ring * 16) * 0.5, 0, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
        pinMark(g, x, y - drop, 10, css, `${i + 1}`);
        const t = fmtDist(Math.hypot(pin.x - p.pos.x, pin.z - p.pos.z));
        g.lineWidth = 3.5;
        g.strokeStyle = 'rgba(8, 30, 40, 0.8)';
        g.strokeText(t, x, y + 7);
        g.fillStyle = css;
        g.fillText(t, x, y + 7);
      });
    }

    this.drawRose(g, W - 58, H - 58, 40, sc.windX, sc.windZ);
    this.drawScale(g, 18, H - 22, s);
  }

  /**
   * The archipelagos' names, large, once you've zoomed out far enough to see
   * more than one; and the lane across the high seas between them, dotted like
   * an old sailing route.
   */
  private drawSeaNames(
    g: CanvasRenderingContext2D,
    toS: (x: number, z: number) => [number, number],
    s: number,
    sc: ChartScene,
    charted: (r: Region) => boolean,
  ) {
    const far = this.farness(s);
    if (far <= 0.02) return;
    g.save();
    g.globalAlpha = far;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // the lane: from the Fortunate Isles' edge to Las Brumas', bowed a little like a real course
    const [a, b] = REGIONS;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const L = Math.hypot(dx, dz);
    const ux = dx / L;
    const uz = dz / L;
    const [sx, sy] = toS(a.x + ux * 1150, a.z + uz * 1150);
    const [ex, ey] = toS(b.x - ux * 1150, b.z - uz * 1150);
    const [qx, qy] = toS((a.x + b.x) / 2 - uz * 520, (a.z + b.z) / 2 + ux * 520);
    g.setLineDash([3, 9]);
    g.lineDashOffset = -sc.time * 4;
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255, 236, 190, 0.45)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(sx, sy);
    g.quadraticCurveTo(qx, qy, ex, ey);
    g.stroke();
    g.setLineDash([]);
    // the high seas' name, along the lane
    const mx = 0.25 * sx + 0.5 * qx + 0.25 * ex;
    const my = 0.25 * sy + 0.5 * qy + 0.25 * ey;
    g.save();
    g.translate(mx, my);
    g.rotate(Math.atan2(ey - sy, ex - sx));
    g.font = 'italic 600 15px Georgia, serif';
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(8, 30, 40, 0.7)';
    g.strokeText(`${HIGH_SEAS_NAME}`, 0, -14);
    g.fillStyle = 'rgba(190, 236, 240, 0.9)';
    g.fillText(`${HIGH_SEAS_NAME}`, 0, -14);
    g.font = 'italic 500 11px Georgia, serif';
    g.strokeText('the high seas · calm water, dolphins', 0, 6);
    g.fillStyle = 'rgba(190, 236, 240, 0.7)';
    g.fillText('the high seas · calm water, dolphins', 0, 6);
    g.restore();
    for (const r of REGIONS) {
      const [x, y] = toS(r.x, r.z - 1120);
      const known = charted(r);
      g.font = '700 22px Cinzel, Georgia, serif';
      g.lineWidth = 5;
      g.strokeStyle = 'rgba(8, 30, 40, 0.75)';
      g.strokeText(r.name, x, y);
      g.fillStyle = known ? '#ffe7a8' : 'rgba(225, 236, 238, 0.75)';
      g.fillText(r.name, x, y);
      g.font = 'italic 500 12px Georgia, serif';
      const sub = known ? r.motto : 'Uncharted · only sailors\' tales';
      g.lineWidth = 4;
      g.strokeText(sub, x, y + 20);
      g.fillStyle = known ? 'rgba(255, 236, 190, 0.8)' : 'rgba(225, 236, 238, 0.65)';
      g.fillText(sub, x, y + 20);
    }
    g.restore();
  }

  /** 0 while one archipelago fills the chart .. 1 once it has shrunk to a corner of the whole sea. */
  private farness(s: number) {
    return Math.min(1, Math.max(0, (0.5 - (s * 1024) / Math.min(this.W, this.H)) / 0.2));
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
    const metres = [100, 200, 500, 1000, 2000].find((m) => m * s > 60) ?? 2000;
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
    g.fillText(metres < 1000 ? `${metres} m` : `${metres / 1000} km`, x + 2, y - 6);
  }
}
