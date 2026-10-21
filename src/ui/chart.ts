// Full-screen sea chart: a hand-inked overview of the whole archipelago with
// pan (drag), zoom (wheel / pinch) and live markers for the player, nearby
// pirates, salvage and every isle, named once discovered. Tap the sea to drop
// a waypoint; tap a pin to lift it.

import { RARITY } from '../game/loot';
import { Ship } from '../ships/ship';
import { Terrain, WORLD_SIZE, Island } from '../world/terrain';
import type { Seas } from '../world/seas';
import { EDGE_R, HIGH_SEAS_R, nearestRegion, Region, REGIONS, seaEdge } from '../world/regions';
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

/** The sailing lane across the high seas: start, bow and end of a quadratic curve (world metres). */
function laneCurve(off = 0) {
  const [a, b] = REGIONS;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const L = Math.hypot(dx, dz);
  const ux = dx / L;
  const uz = dz / L;
  // the perpendicular, pointing south of the lane
  const px = -uz;
  const pz = ux;
  return {
    x0: a.x + ux * 1150 + px * off,
    z0: a.z + uz * 1150 + pz * off,
    qx: (a.x + b.x) / 2 + px * (520 + off * 1.15),
    qz: (a.z + b.z) / 2 + pz * (520 + off * 1.15),
    x1: b.x - ux * 1150 + px * off,
    z1: b.z - uz * 1150 + pz * off,
    ux,
    uz,
    px,
    pz,
  };
}

/** Where the open sea's great compass rose sits: in the empty water south of the lane. */
const ROSE = (() => {
  const l = laneCurve();
  const mx = 0.25 * l.x0 + 0.5 * l.qx + 0.25 * l.x1;
  const mz = 0.25 * l.z0 + 0.5 * l.qz + 0.25 * l.z1;
  return { x: mx + l.px * 1050 + l.ux * 250, z: mz + l.pz * 1050 + l.uz * 250, r: 300 };
})();

/** A cheap smooth value noise on a unit lattice, 0..1. */
function vnoise(x: number, z: number) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const h = (i: number, j: number) => {
    let n = (i * 374761393 + j * 668265263) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = h(xi, zi) + (h(xi + 1, zi) - h(xi, zi)) * u;
  const b = h(xi, zi + 1) + (h(xi + 1, zi + 1) - h(xi, zi + 1)) * u;
  return a + (b - a) * v;
}

/**
 * How deep the open sea runs at (x, z): 0 on an archipelago's shelf .. 1 in the
 * abyss, with rolling banks and a long shoal, the Banco del Sereno, under the lane.
 */
function seaDepth(x: number, z: number) {
  const d = nearestRegion(x, z).dist;
  const shelf = Math.min(1, Math.max(0, (d - 1050) / 1500));
  const sh = shelf * shelf * (3 - 2 * shelf);
  const n = vnoise(x / 1500, z / 1500) * 0.6 + vnoise(x / 610 + 17, z / 610 - 9) * 0.28 + vnoise(x / 260 - 4, z / 260 + 31) * 0.12;
  const bk = Math.hypot((x - BANK.x) / 520, (z - BANK.z) / 300);
  const bank = Math.exp(-bk * bk) * 0.55;
  return Math.min(1, Math.max(0, sh * (0.8 + (n - 0.5) * 0.8) - bank * sh + (1 - sh) * 0.02));
}

/** The shoal under the lane, a little east of half-way. */
const BANK = (() => {
  const l = laneCurve();
  const t = 0.72;
  const x = (1 - t) * (1 - t) * l.x0 + 2 * (1 - t) * t * l.qx + t * t * l.x1;
  const z = (1 - t) * (1 - t) * l.z0 + 2 * (1 - t) * t * l.qz + t * t * l.z1;
  return { x: x - l.px * 120, z: z - l.pz * 120 };
})();

/** A trading port on a map: a gilt disc with a pair of scales. */
export function portMark(g: CanvasRenderingContext2D, x: number, y: number, r: number, festive = false) {
  g.save();
  g.translate(x, y);
  if (festive) {
    // a feast night: a ring of little lanterns round the medallion, softly glowing
    const cols = ['#ff7a5a', '#ffd263', '#ff8fb0', '#7fe0c0', '#ffb347', '#c8a0ff'];
    const n = 8;
    const rr = r * 1.55;
    const spin = (performance.now() / 4000) % (Math.PI * 2);
    g.shadowBlur = r * 0.8;
    for (let i = 0; i < n; i++) {
      const a = spin + (i / n) * Math.PI * 2;
      g.fillStyle = cols[i % cols.length];
      g.shadowColor = cols[i % cols.length];
      g.beginPath();
      g.ellipse(Math.cos(a) * rr, Math.sin(a) * rr, Math.max(1.4, r * 0.2), Math.max(1.8, r * 0.26), 0, 0, Math.PI * 2);
      g.fill();
    }
  }
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
  ports?: { x: number; z: number; name: string; festive?: boolean }[];
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
  /** The open sea round and between the archipelagos, engraved once. */
  private openSea: HTMLCanvasElement | null = null;
  private seaJob = this.buildOpenSea();
  /** Depth soundings scattered over the open sea, in fathoms. */
  private soundings: { x: number; z: number; f: number }[] = [];
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
    // engrave the open sea in the background, a slice per tick
    const work = () => {
      if (this.openSea) return;
      const r = this.seaJob.next();
      if (r.done) this.openSea = r.value;
      else setTimeout(work, 16);
    };
    setTimeout(work, 1500);
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

  /**
   * Engraves the open sea once: depth shading off each archipelago's shelf into
   * the abyss, isobaths, a long swell, the Sereno current's ribbon down the lane
   * and the hatched dark past the edge of the known sea. Cheap to draw after.
   */
  /**
   * The engraving as a job, a few rows at a time: started behind the loading
   * screen so the chart opens without a stall (finished at once if it's opened sooner).
   */
  private *buildOpenSea(): Generator<void, HTMLCanvasElement> {
    const w = 1024;
    const h = Math.round((w * SEA_H) / SEA_W);
    const step = SEA_W / w;
    // the smooth fields on a coarse grid (every Q pixels), smoothly sampled per pixel
    const Q = 2;
    const cw = Math.ceil(w / Q) + 2;
    const ch = Math.ceil(h / Q) + 2;
    const cD = new Float32Array(cw * ch);
    const cE = new Float32Array(cw * ch);
    const cL = new Float32Array(cw * ch);
    const cW = new Float32Array(cw * ch);
    const cP = new Float32Array(cw * ch);
    // the lane as a polyline, for the current's ribbon
    const l = laneCurve();
    const lane: number[] = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      lane.push((1 - t) * (1 - t) * l.x0 + 2 * (1 - t) * t * l.qx + t * t * l.x1, (1 - t) * (1 - t) * l.z0 + 2 * (1 - t) * t * l.qz + t * t * l.z1);
    }
    const laneDist = (x: number, z: number) => {
      let best = Infinity;
      for (let k = 0; k < lane.length - 2; k += 2) {
        const ax = lane[k];
        const az = lane[k + 1];
        const dx = lane[k + 2] - ax;
        const dz = lane[k + 3] - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
        const ex = x - ax - dx * t;
        const ez = z - az - dz * t;
        best = Math.min(best, ex * ex + ez * ez);
      }
      return Math.sqrt(best);
    };
    let t0 = performance.now();
    const due = () => performance.now() - t0 > 5;
    for (let j = 0; j < ch; j++) {
      for (let i = 0; i < cw; i++) {
        const x = SEA.x0 + (i * Q) * step;
        const z = SEA.z0 + (j * Q) * step;
        const o = j * cw + i;
        cD[o] = seaDepth(x, z);
        const e = (cE[o] = seaEdge(x, z));
        cL[o] = e + EDGE_R < 1250 ? laneDist(x, z) : 5000;
        cW[o] = vnoise(x / 190, z / 190) * 7;
        cP[o] = Math.max(0, Math.min(1, (vnoise(x / 460 + 3, z / 460 - 7) - 0.4) * 3));
      }
      if (due()) {
        yield;
        t0 = performance.now();
      }
    }
    const sample = (f: Float32Array, i: number, j: number) => {
      const fx = (i + 0.5) / Q;
      const fz = (j + 0.5) / Q;
      const ix = Math.floor(fx);
      const iz = Math.floor(fz);
      const u = fx - ix;
      const v = fz - iz;
      const o = iz * cw + ix;
      const a = f[o] + (f[o + 1] - f[o]) * u;
      const b = f[o + cw] + (f[o + cw + 1] - f[o + cw]) * u;
      return a + (b - a) * v;
    };
    const D = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) D[j * w + i] = sample(cD, i, j);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    const img = g.createImageData(w, h);
    const at = (i: number, j: number) => D[Math.min(h - 1, Math.max(0, j)) * w + Math.min(w - 1, Math.max(0, i))];
    const ISO = 5; // isobaths per unit of depth
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const x = SEA.x0 + (i + 0.5) * step;
        const z = SEA.z0 + (j + 0.5) * step;
        const d = D[j * w + i];
        // shelf teal (as the archipelagos' own deep edge) .. midnight abyss
        const k1 = Math.min(1, d * 1.7);
        const k2 = Math.max(0, (d - 0.55) / 0.45);
        let r = 28 - k1 * 15 - k2 * 7;
        let gg = 94 - k1 * 34 - k2 * 26;
        let b = 132 - k1 * 42 - k2 * 34;
        // the sea floor's relief, lit from the north-west
        const gx = at(i + 1, j) - at(i - 1, j);
        const gz = at(i, j + 1) - at(i, j - 1);
        const shade = 1 + Math.max(-0.12, Math.min(0.12, (gx + gz) * 14));
        r *= shade;
        gg *= shade;
        b *= shade;
        // isobaths: fine pale lines of even width, wherever the depth crosses a step
        const gm = Math.hypot(gx, gz) * 0.5 * ISO;
        if (gm > 1e-5 && d > 0.04) {
          const v = d * ISO;
          const px = Math.abs(v - Math.round(v)) / gm;
          if (px < 0.9) {
            const ink = (1 - px / 0.9) * (Math.round(v) % 2 ? 0.08 : 0.16);
            r += (150 - r) * ink;
            gg += (214 - gg) * ink;
            b += (224 - b) * ink;
          }
        }
        // the long swell rolling in from the east-north-east, in patches
        const sw = Math.sin((x * 0.83 + z * 0.55) / 21 + sample(cW, i, j));
        if (sw > 0) {
          const s2 = sw * sw;
          const crest = s2 * s2 * s2 * sample(cP, i, j) * (0.05 + d * 0.06);
          r += 120 * crest;
          gg += 170 * crest;
          b += 180 * crest;
        }
        // the Sereno current: a warmer teal ribbon down the lane, streaked with its set
        const ld = sample(cL, i, j);
        if (ld < 900) {
          const rib = Math.exp(-((ld / 330) ** 2));
          const st = Math.sin(ld / 15 + sample(cW, i, j) * 0.3) * 0.5 + 0.5;
          const st2 = st * st;
          const streak = st2 * st2 * st2 * st2 * st2 * rib * 0.25;
          r += (34 - r) * rib * 0.38 + 30 * streak;
          gg += (108 - gg) * rib * 0.38 + 60 * streak;
          b += (122 - b) * rib * 0.38 + 60 * streak;
        }
        // past the edge of the known sea: darker water, hatched like unsurveyed parts
        const e = sample(cE, i, j);
        if (e > -160) {
          const o = Math.min(1, (e + 160) / 420);
          const oo = o * o * (3 - 2 * o);
          r += (5 - r) * oo * 0.86;
          gg += (24 - gg) * oo * 0.86;
          b += (38 - b) * oo * 0.86;
          const hatch = (((x - z) / 38) % 1 + 1) % 1;
          if (hatch < 0.16) {
            r += 5 * oo;
            gg += 12 * oo;
            b += 15 * oo;
          }
          // a fine double rule along the edge itself
          const rule = Math.max(0, 1 - Math.abs(e) / (step * 0.7)) * 0.3 + Math.max(0, 1 - Math.abs(e - 34) / (step * 0.6)) * 0.16;
          r += (210 - r) * rule;
          gg += (226 - gg) * rule;
          b += (214 - b) * rule;
        }
        // a whisper of paper grain
        const grain = ((Math.imul(i * 7919 + j * 104729, 2654435761) >>> 24) / 255 - 0.5) * 3;
        const o = (j * w + i) * 4;
        img.data[o] = r + grain;
        img.data[o + 1] = gg + grain;
        img.data[o + 2] = b + grain;
        img.data[o + 3] = 255;
      }
      if (due()) {
        yield;
        t0 = performance.now();
      }
    }
    g.putImageData(img, 0, 0);
    // soundings, in fathoms, where a leadsman might have dropped a line
    this.soundings = [];
    let seed = 90210;
    const rnd = () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 4294967296;
    for (let n = 0; n < 900 && this.soundings.length < 110; n++) {
      const x = SEA.x0 + rnd() * SEA_W;
      const z = SEA.z0 + rnd() * SEA_H;
      if (nearestRegion(x, z).dist < 1200 || seaEdge(x, z) > -90) continue;
      if (this.soundings.some((p) => Math.hypot(p.x - x, p.z - z) < 520)) continue;
      const d = seaDepth(x, z);
      this.soundings.push({ x, z, f: Math.round(20 + d * d * 1500) });
    }
    return c;
  }

  /** The open sea's engraving, finishing the job at once if it isn't done yet. */
  private seaImage() {
    if (!this.openSea) {
      let r = this.seaJob.next();
      while (!r.done) r = this.seaJob.next();
      this.openSea = r.value;
    }
    return this.openSea;
  }

  /** The open sea under the archipelagos: depths, the rhumb lines of the great rose, soundings, the current. */
  private drawOpenSea(g: CanvasRenderingContext2D, toS: (x: number, z: number) => [number, number], s: number, sc: ChartScene) {
    const [x0, y0] = toS(SEA.x0, SEA.z0);
    g.drawImage(this.seaImage(), x0, y0, SEA_W * s, SEA_H * s);
    const far = this.farness(s);
    g.save();
    g.beginPath();
    g.rect(x0, y0, SEA_W * s, SEA_H * s);
    g.clip();

    // the rhumb lines: the 32 winds of the great rose, run out across the whole sea
    const [rx, ry] = toS(ROSE.x, ROSE.z);
    const reach = Math.hypot(SEA_W, SEA_H) * s;
    const winds = ['rgba(255, 232, 178, 0.17)', 'rgba(140, 222, 196, 0.12)', 'rgba(242, 160, 136, 0.1)'];
    for (const [tier, color] of winds.entries()) {
      g.strokeStyle = color;
      g.lineWidth = tier ? 0.8 : 1.1;
      g.beginPath();
      for (let k = 0; k < 32; k++) {
        const kt = k % 4 === 0 ? 0 : k % 2 === 0 ? 1 : 2;
        if (kt !== tier) continue;
        const a = (k / 32) * Math.PI * 2;
        g.moveTo(rx + Math.sin(a) * ROSE.r * s * 1.05, ry - Math.cos(a) * ROSE.r * s * 1.05);
        g.lineTo(rx + Math.sin(a) * reach, ry - Math.cos(a) * reach);
      }
      g.stroke();
    }
    this.drawSeaRose(g, rx, ry, ROSE.r * s);

    // the Sereno current and its counter-set, flowing either side of the lane
    const flow = 0.4 + 0.6 * far;
    g.lineCap = 'round';
    for (const [off, dir] of [
      [330, 1],
      [-360, -1],
    ] as const) {
      const c = laneCurve(off);
      const [ax, ay] = toS(c.x0, c.z0);
      const [qx, qy] = toS(c.qx, c.qz);
      const [bx, by] = toS(c.x1, c.z1);
      g.setLineDash([2, 7]);
      g.lineDashOffset = -sc.time * 6 * dir;
      g.strokeStyle = `rgba(150, 232, 236, ${0.22 * flow})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(ax, ay);
      g.quadraticCurveTo(qx, qy, bx, by);
      g.stroke();
      g.setLineDash([]);
      // drifting chevrons showing the set
      g.strokeStyle = `rgba(170, 240, 240, ${0.55 * flow})`;
      g.lineWidth = 1.4;
      const N = 7;
      g.beginPath();
      for (let n = 0; n < N; n++) {
        const t0 = (((n + 0.5) / N + sc.time * 0.006 * dir) % 1 + 1) % 1;
        const t = 0.06 + t0 * 0.88;
        const px = (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * qx + t * t * bx;
        const py = (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * qy + t * t * by;
        let tx = 2 * (1 - t) * (qx - ax) + 2 * t * (bx - qx);
        let ty = 2 * (1 - t) * (qy - ay) + 2 * t * (by - qy);
        const tl = Math.hypot(tx, ty) || 1;
        tx = (tx / tl) * dir;
        ty = (ty / tl) * dir;
        const a = 5;
        g.moveTo(px - tx * a - ty * a * 0.8, py - ty * a + tx * a * 0.8);
        g.lineTo(px, py);
        g.lineTo(px - tx * a + ty * a * 0.8, py - ty * a - tx * a * 0.8);
      }
      g.stroke();
    }

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // soundings
    g.font = 'italic 500 9px Georgia, serif';
    g.fillStyle = 'rgba(200, 228, 232, 0.36)';
    for (const p of this.soundings) {
      const [x, y] = toS(p.x, p.z);
      if (x < -20 || y < -20 || x > this.W + 20 || y > this.H + 20) continue;
      g.fillText(String(p.f), x, y);
    }
    // the named waters of the open sea
    const lane = laneCurve();
    const ang = Math.atan2(lane.z1 - lane.z0, lane.x1 - lane.x0);
    const label = (x: number, z: number, text: string, font: string, color: string, rot = ang) => {
      const [sx, sy] = toS(x, z);
      g.save();
      g.translate(sx, sy);
      g.rotate(rot);
      g.font = font;
      g.fillStyle = color;
      g.fillText(text, 0, 0);
      g.restore();
    };
    const [bx, by] = toS(BANK.x, BANK.z);
    g.strokeStyle = 'rgba(200, 236, 236, 0.3)';
    g.lineWidth = 1;
    g.setLineDash([1.5, 3]);
    g.beginPath();
    g.ellipse(bx, by, 380 * s, 210 * s, ang, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    label(BANK.x - lane.px * 290, BANK.z - lane.pz * 290, 'Banco del Sereno', 'italic 600 11px Georgia, serif', `rgba(205, 238, 238, ${0.35 + 0.4 * far})`);
    const cs = laneCurve(330);
    label(
      0.25 * cs.x0 + 0.5 * cs.qx + 0.25 * cs.x1 + lane.px * 120,
      0.25 * cs.z0 + 0.5 * cs.qz + 0.25 * cs.z1 + lane.pz * 120,
      'Corriente del Sereno  ⟶',
      'italic 500 10px Georgia, serif',
      `rgba(170, 236, 238, ${0.3 + 0.4 * far})`,
    );
    const mx = (REGIONS[0].x + REGIONS[1].x) / 2;
    const mz = (REGIONS[0].z + REGIONS[1].z) / 2;
    for (const side of [-1, 1]) {
      label(
        mx + lane.px * side * (EDGE_R + 230),
        mz + lane.pz * side * (EDGE_R + 230),
        'Beyond, the swell turns every keel back',
        'italic 500 12px Georgia, serif',
        'rgba(170, 204, 214, 0.4)',
      );
    }
    g.restore();
  }

  /** The open sea's great compass rose, inked in gilt and sea-green, an old portolan's flourish. */
  private drawSeaRose(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
    if (r < 6 || x < -r * 1.3 || y < -r * 1.3 || x > this.W + r * 1.3 || y > this.H + r * 1.3) return;
    g.save();
    g.translate(x, y);
    // rings, with a tick for every one of the 32 winds
    g.strokeStyle = 'rgba(255, 232, 178, 0.42)';
    g.lineWidth = Math.max(0.8, r * 0.012);
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = Math.max(0.6, r * 0.006);
    g.beginPath();
    g.arc(0, 0, r * 0.9, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    for (let k = 0; k < 128; k++) {
      const a = (k / 128) * Math.PI * 2;
      const t = k % 4 === 0 ? 0.86 : 0.94;
      g.moveTo(Math.sin(a) * r * t, -Math.cos(a) * r * t);
      g.lineTo(Math.sin(a) * r * 0.99, -Math.cos(a) * r * 0.99);
    }
    g.stroke();
    // the star: long cardinals, the half-winds behind, each point lit on one flank
    const point = (a: number, len: number, wid: number, lit: string, dark: string) => {
      const sx = Math.sin(a);
      const cy = -Math.cos(a);
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      g.fillStyle = lit;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(sx * len, cy * len);
      g.lineTo(nx * wid, ny * wid);
      g.closePath();
      g.fill();
      g.fillStyle = dark;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(sx * len, cy * len);
      g.lineTo(-nx * wid, -ny * wid);
      g.closePath();
      g.fill();
    };
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      point(a, r * 0.58, r * 0.07, 'rgba(140, 214, 190, 0.5)', 'rgba(30, 80, 84, 0.6)');
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      point(a, r * 0.66, r * 0.1, 'rgba(232, 236, 222, 0.55)', 'rgba(36, 66, 80, 0.65)');
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      point(a, k === 0 ? r * 0.9 : r * 0.84, r * 0.13, 'rgba(246, 206, 112, 0.75)', 'rgba(120, 82, 34, 0.75)');
    }
    g.fillStyle = 'rgba(246, 206, 112, 0.85)';
    g.beginPath();
    g.arc(0, 0, r * 0.04, 0, Math.PI * 2);
    g.fill();
    // a fleur-ish crown on north, and the cardinal letters
    if (r > 22) {
      g.font = `700 ${Math.round(Math.min(26, r * 0.13))}px Cinzel, Georgia, serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = 'rgba(255, 226, 150, 0.8)';
      const L = r * 1.1;
      g.fillText('N', 0, -L);
      g.fillStyle = 'rgba(232, 236, 222, 0.55)';
      g.fillText('S', 0, L);
      g.fillText('E', L, 0);
      g.fillText('W', -L, 0);
    }
    g.restore();
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
    g.fillStyle = '#05182a';
    g.fillRect(0, 0, W, H);

    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    this.drawOpenSea(g, toS, s, sc);
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
    g.strokeStyle = 'rgba(255, 244, 214, 0.07)';
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
      portMark(g, x, y, detail ? 9 : 5, pt.festive);
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
        // a crewmate's flagship: gold, under her captain's name
        if (sh.captain) {
          tri(sh, '#ffd36a', 13);
          g.font = '700 11.5px Cinzel, Georgia, serif';
          g.textAlign = 'center';
          g.lineWidth = 3;
          g.strokeStyle = 'rgba(26, 18, 2, 0.85)';
          g.strokeText(sh.captain, ex, ey + 22);
          g.fillStyle = '#ffe7a8';
          g.fillText(sh.captain, ex, ey + 22);
          continue;
        }
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
      tri(sh, sh.calm ? (sh.ghost ? '#c8f5e2' : '#f2ece0') : sh.ghost ? '#7dffc4' : '#ff6a55', 10);
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
    const lane = laneCurve();
    const [sx, sy] = toS(lane.x0, lane.z0);
    const [ex, ey] = toS(lane.x1, lane.z1);
    const [qx, qy] = toS(lane.qx, lane.qz);
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
    g.strokeText('the high seas · calm water, dolphins, whales', 0, 6);
    g.fillStyle = 'rgba(190, 236, 240, 0.7)';
    g.fillText('the high seas · calm water, dolphins, whales', 0, 6);
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
