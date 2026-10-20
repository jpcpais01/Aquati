import './treasureMap.css';
import { mulberry32 } from '../core/noise';
import { icon } from './art';
import type { MapState } from '../game/treasureMaps';
import { pieceCount } from '../game/treasureMaps';
import type { Island } from '../world/terrain';

// The treasure map: an island drawn in ink on old parchment, torn in three.
// The pieces you hold are laid together (a little askew), the ones you lack
// leave a gap; once whole, the island is named and the red X shows the spot.

const S = 560;
const RES = 200;

const SCROLL = '<path d="M6 4.5h11.5a2 2 0 0 1 2 2V17M6 4.5a2 2 0 0 0-2 2v1.5h4M6 4.5a2 2 0 0 1 2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.5-.7M10 9.5l4 4M14 9.5l-4 4"/>';

export class TreasureMapUI {
  /** The HUD chip: opens the map. */
  onOpen: () => void = () => {};
  onClose: () => void = () => {};
  private root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private chip: HTMLButtonElement;
  private art: HTMLCanvasElement | null = null;
  private artKey = '';
  private chipKey = '';
  isOpen = false;

  constructor() {
    const r = (this.root = document.createElement('div'));
    r.id = 'tmap';
    r.className = 'screen dim hidden';
    r.innerHTML = `
      <div class="tm-card">
        <button class="round-btn tm-close" title="Close (Esc)" aria-label="Close"><span class="ti">${icon('<path d="M6 6l12 12M18 6 6 18"/>')}</span></button>
        <canvas class="tm-canvas" width="${S}" height="${S}"></canvas>
        <div class="tm-foot"><b class="tm-title"></b><span class="tm-sub"></span></div>
      </div>`;
    document.body.appendChild(r);
    this.canvas = r.querySelector('canvas')!;
    r.querySelector('.tm-close')!.addEventListener('click', () => this.onClose());
    r.addEventListener('pointerdown', (e) => {
      if (e.target === r) this.onClose();
    });

    const c = (this.chip = document.createElement('button'));
    c.className = 'chip map-chip';
    c.title = 'Treasure map (T)';
    c.innerHTML = `<span class="tm-ico">${icon(SCROLL)}</span><b>0/3</b>`;
    c.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onOpen();
    });
    document.querySelector('#hud .stats-row')!.appendChild(c);
  }

  /** The chip: hidden until the first piece, "X" once the map is whole. */
  setChip(m: MapState) {
    const n = pieceCount(m.pieces);
    const key = `${n}`;
    if (key === this.chipKey) return;
    const was = this.chipKey;
    this.chipKey = key;
    this.chip.classList.toggle('on', n > 0);
    this.chip.classList.toggle('whole', n === 3);
    this.chip.querySelector('b')!.textContent = n === 3 ? 'X' : `${n}/3`;
    if (was && +was < n) {
      this.chip.classList.remove('bump');
      void this.chip.offsetWidth;
      this.chip.classList.add('bump');
    }
  }

  show(on: boolean, m?: MapState, island?: Island | null, heightAt?: (x: number, z: number) => number) {
    this.isOpen = on;
    this.root.classList.toggle('hidden', !on);
    if (!on || !m) return;
    const n = pieceCount(m.pieces);
    const whole = n === 3;
    this.root.querySelector('.tm-title')!.textContent = !n ? 'No map yet' : whole ? `X marks the spot on ${m.isle}` : `${n} of 3 pieces`;
    this.root.querySelector('.tm-sub')!.textContent = !n
      ? 'Torn map pieces turn up in sea chests and in cutthroat camps.'
      : whole
        ? 'Sail there, go ashore with F and look for the crossed sticks. Dig where they lie.'
        : 'The other pieces turn up in sea chests and cutthroat camps.';
    this.draw(m, island ?? null, heightAt);
  }

  private draw(m: MapState, isl: Island | null, heightAt?: (x: number, z: number) => number) {
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, S, S);
    if (!m.pieces || !isl || !heightAt) {
      this.blank(g);
      return;
    }
    const key = `${m.seed}|${m.isle}`;
    if (key !== this.artKey || !this.art) {
      this.art = drawArt(m, isl, heightAt);
      this.artKey = key;
    }
    const rnd = mulberry32(m.seed + 3);
    const cuts = [0, S / 3 + (rnd() - 0.5) * 40, (2 * S) / 3 + (rnd() - 0.5) * 40, S];
    const tear = (x: number, seed: number) => {
      const r = mulberry32(seed);
      const pts: [number, number][] = [];
      for (let y = 0; y <= S; y += 14) pts.push([x + (r() - 0.5) * 16, y]);
      return pts;
    };
    const edges = [null, tear(cuts[1], m.seed + 11), tear(cuts[2], m.seed + 29), null];
    for (let i = 0; i < 3; i++) {
      const have = !!(m.pieces & (1 << i));
      g.save();
      // each piece lies a touch askew
      const a = (rnd() - 0.5) * 0.035;
      g.translate(S / 2, S / 2);
      g.rotate(a);
      g.translate(-S / 2 + (rnd() - 0.5) * 6, -S / 2 + (rnd() - 0.5) * 6);
      g.beginPath();
      const L = edges[i];
      const R = edges[i + 1];
      if (L) L.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
      else {
        g.moveTo(10, 0);
        g.lineTo(10, S);
      }
      if (R) R.slice().reverse().forEach(([x, y]) => g.lineTo(x, y));
      else {
        g.lineTo(S - 10, S);
        g.lineTo(S - 10, 0);
      }
      g.closePath();
      if (have) {
        g.shadowColor = 'rgba(0, 0, 0, 0.45)';
        g.shadowBlur = 18;
        g.shadowOffsetY = 6;
        g.fillStyle = '#d9c08a';
        g.fill();
        g.shadowColor = 'transparent';
        g.clip();
        g.drawImage(this.art, 0, 0);
        // a scorched, darkened rim along each torn edge
        g.lineWidth = 7;
        g.strokeStyle = 'rgba(92, 58, 22, 0.35)';
        g.stroke();
      } else {
        g.setLineDash([7, 7]);
        g.lineWidth = 2;
        g.strokeStyle = 'rgba(255, 236, 196, 0.35)';
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = 'rgba(255, 236, 196, 0.05)';
        g.fill();
        const cx = (cuts[i] + cuts[i + 1]) / 2;
        g.fillStyle = 'rgba(255, 236, 196, 0.55)';
        g.font = '600 15px Inter, system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText('Missing', cx, S / 2);
      }
      g.restore();
    }
  }

  private blank(g: CanvasRenderingContext2D) {
    g.setLineDash([8, 8]);
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255, 236, 196, 0.35)';
    g.strokeRect(14, 14, S - 28, S - 28);
    g.setLineDash([]);
  }
}

/** The whole map, untorn: ink on parchment. */
function drawArt(m: MapState, isl: Island, heightAt: (x: number, z: number) => number) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const rnd = mulberry32(m.seed);
  // frame the isle, nudged so the X never sits dead centre
  const span = Math.max(240, isl.r * 2.7 * Math.max(1, isl.stretch));
  const cx = isl.x * 0.75 + m.x * 0.25;
  const cz = isl.z * 0.75 + m.z * 0.25;
  const toPx = (x: number, z: number): [number, number] => [((x - cx) / span + 0.5) * S, ((z - cz) / span + 0.5) * S];

  // parchment: warm, blotched, darker at the edges
  const grad = g.createRadialGradient(S / 2, S / 2, S * 0.15, S / 2, S / 2, S * 0.75);
  grad.addColorStop(0, '#efdcae');
  grad.addColorStop(0.7, '#dcc08a');
  grad.addColorStop(1, '#a9814a');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 8 + rnd() * 50;
    const b = g.createRadialGradient(x, y, 0, x, y, r);
    b.addColorStop(0, `rgba(120, 80, 30, ${0.04 + rnd() * 0.07})`);
    b.addColorStop(1, 'rgba(120, 80, 30, 0)');
    g.fillStyle = b;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // the land, sampled from the terrain
  const hs = new Float32Array(RES * RES);
  for (let j = 0; j < RES; j++) {
    for (let i = 0; i < RES; i++) {
      const x = cx + ((i + 0.5) / RES - 0.5) * span;
      const z = cz + ((j + 0.5) / RES - 0.5) * span;
      hs[j * RES + i] = heightAt(x, z);
    }
  }
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  const px = S / RES;
  const H = (i: number, j: number) => hs[Math.max(0, Math.min(RES - 1, j)) * RES + Math.max(0, Math.min(RES - 1, i))];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = Math.floor(x / px);
      const j = Math.floor(y / px);
      const h = H(i, j);
      const o = (y * S + x) * 4;
      let mul = 1;
      let ink = 0;
      if (h > 0) {
        mul = 1.06 + Math.min(0.12, h * 0.006);
        // hills: hachures, denser up high
        if (h > 7 && (x + y * 0.6) % Math.max(3, 9 - h * 0.25) < 1) ink = 0.32;
        // coastline
        if (H(i - 1, j) <= 0 || H(i + 1, j) <= 0 || H(i, j - 1) <= 0 || H(i, j + 1) <= 0) ink = 0.85;
      } else if (h > -3) {
        // the shallows: a faint wash and a dotted second line offshore
        mul = 0.94;
        if ((H(i - 1, j) <= -3 || H(i + 1, j) <= -3 || H(i, j - 1) <= -3 || H(i, j + 1) <= -3) && (x + y) % 4 < 1.5) ink = 0.35;
      } else mul = 0.9;
      d[o] = Math.min(255, d[o] * mul * (1 - ink) + 40 * ink);
      d[o + 1] = Math.min(255, d[o + 1] * mul * (1 - ink) + 26 * ink);
      d[o + 2] = Math.min(255, d[o + 2] * mul * (1 - ink) + 12 * ink);
    }
  }
  g.putImageData(img, 0, 0);

  g.strokeStyle = 'rgba(60, 38, 16, 0.55)';
  g.lineWidth = 1.4;
  g.lineCap = 'round';
  // the sea: little ink waves
  for (let k = 0; k < 70; k++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const i = Math.floor(x / px);
    const j = Math.floor(y / px);
    if (H(i, j) > -4 || H(i + 3, j) > -4 || H(i - 3, j) > -4) continue;
    g.beginPath();
    g.moveTo(x - 7, y);
    g.quadraticCurveTo(x - 3.5, y - 4, x, y);
    g.quadraticCurveTo(x + 3.5, y - 4, x + 7, y);
    g.stroke();
  }
  // palms on the low ground (none on the X)
  const [xx, xy] = toPx(m.x, m.z);
  g.strokeStyle = 'rgba(52, 40, 18, 0.7)';
  for (let k = 0; k < 140; k++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const h = H(Math.floor(x / px), Math.floor(y / px));
    if (h < 0.8 || h > 9 || Math.hypot(x - xx, y - xy) < 26) continue;
    g.beginPath();
    g.moveTo(x, y + 6);
    g.quadraticCurveTo(x + 1.5, y + 2, x, y - 2);
    for (const a of [-2.4, -1.6, -0.8, 0.8, 1.6, 2.4]) {
      g.moveTo(x, y - 2);
      g.quadraticCurveTo(x + Math.sin(a) * 3, y - 2 - Math.cos(a) * 3, x + Math.sin(a) * 5, y - 1);
    }
    g.stroke();
  }

  // the way in: a dotted trail from the nearest beach to the X
  let best: [number, number] | null = null;
  for (let k = 0; k < 32 && !best; k++) {
    for (let a = 0; a < 24; a++) {
      const r = 6 + k * 6;
      const ang = (a / 24) * Math.PI * 2;
      const x = xx + Math.cos(ang) * r;
      const y = xy + Math.sin(ang) * r;
      if (H(Math.floor(x / px), Math.floor(y / px)) < 0) {
        best = [x, y];
        break;
      }
    }
  }
  if (best) {
    g.setLineDash([3, 6]);
    g.strokeStyle = 'rgba(70, 40, 16, 0.75)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(best[0], best[1]);
    const mx = (best[0] + xx) / 2 + (rnd() - 0.5) * 30;
    const my = (best[1] + xy) / 2 + (rnd() - 0.5) * 30;
    g.quadraticCurveTo(mx, my, xx, xy);
    g.stroke();
    g.setLineDash([]);
  }
  // the X itself, in red ink
  g.strokeStyle = '#a1231a';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(xx - 11, xy - 11);
  g.lineTo(xx + 11, xy + 11);
  g.moveTo(xx + 11, xy - 11);
  g.lineTo(xx - 11, xy + 11);
  g.stroke();

  // compass rose and the isle's name in a cartouche
  compass(g, S - 74, S - 78, 40);
  g.font = '700 26px Cinzel, Georgia, serif';
  g.textAlign = 'center';
  g.fillStyle = 'rgba(58, 34, 12, 0.85)';
  g.fillText(m.isle, S / 2, 52);
  g.font = 'italic 500 14px Georgia, serif';
  g.fillText('Here lies the plunder', S / 2, 74);
  return c;
}

function compass(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.save();
  g.translate(x, y);
  g.strokeStyle = 'rgba(58, 34, 12, 0.75)';
  g.fillStyle = 'rgba(58, 34, 12, 0.75)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 4; i++) {
    g.rotate(Math.PI / 2);
    g.beginPath();
    g.moveTo(0, -r);
    g.lineTo(r * 0.14, 0);
    g.lineTo(-r * 0.14, 0);
    g.closePath();
    if (i === 3) g.fill();
    else g.stroke();
  }
  g.font = '700 13px Cinzel, Georgia, serif';
  g.textAlign = 'center';
  g.fillText('N', 0, -r - 5);
  g.restore();
}
