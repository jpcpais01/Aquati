import './treasureMap.css';
import * as THREE from 'three';
import { mulberry32 } from '../core/noise';
import { icon, ICONS } from './art';
import { fmtDist } from './chart';
import type { MapState } from '../game/treasureMaps';
import { pieceCount } from '../game/treasureMaps';
import type { Island } from '../world/terrain';

// The treasure map: an island drawn in ink and watercolour on old parchment,
// torn in three. The pieces you hold are laid together a little askew (a new
// one slides into place the first time you look), the ones you lack leave a
// ghost; each piece read gives up one line of the riddle, and once whole the
// red X glows and the HUD chip points the way there.

type HeightFn = (x: number, z: number) => number;

/** The sheet's drawing space; it's painted at Q times that so it stays crisp on phones. */
const S = 560;
const Q = 2;
const RES = 168;
const SEEN_KEY = 'aquati.maps.seen';

const OCT = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
/** The compass word for a heading on the world (north is -z, as on the chart). */
export const octant = (dx: number, dz: number) => OCT[(Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) + 8) % 8];

const ROMAN = ['I', 'II', 'III'];

/** A torn scrap of parchment (the chip's slots and the flying piece). */
const SCRAP = '<svg viewBox="0 0 10 16" class="scrap"><path d="M1.2 .8 9 .4 8.1 2.6 9.3 4.4 8.2 6.5 9.4 8.6 8.3 10.9 9.2 13 8.4 15.5 .7 15.2 1.6 12.8.6 10.2 1.5 7.8.5 5.3 1.4 3.2z"/></svg>';
/** A wax seal with an X pressed into it. */
const SEAL = '<svg viewBox="0 0 24 24" class="seal"><path d="M12 1.6 14.2 3l2.6-.2 1.1 2.4 2.3 1.2-.3 2.6 1.4 2.2-1.4 2.2.3 2.6-2.3 1.2-1.1 2.4-2.6-.2L12 22.4 9.8 21l-2.6.2-1.1-2.4-2.3-1.2.3-2.6L2.7 12l1.4-2.2-.3-2.6 2.3-1.2 1.1-2.4 2.6.2z"/><path class="sx" d="m8.6 8.6 6.8 6.8m0-6.8-6.8 6.8"/></svg>';
const NEEDLE = '<svg viewBox="0 0 24 24" class="needle"><path class="n" d="M12 2.5 15 12H9z"/><path class="s" d="M9 12h6l-3 9.5z"/><circle cx="12" cy="12" r="1.6"/></svg>';

/** The whole map, untorn, plus what the riddle says. */
interface Art {
  c: HTMLCanvasElement;
  /** The X on the sheet. */
  x: number;
  y: number;
  clues: string[];
}

/** How each piece lies on the table. */
interface Piece {
  path: Path2D;
  tears: [number, number][][];
  m: DOMMatrix;
  cx: number;
}

export class TreasureMapUI {
  /** The HUD chip: opens the map. */
  onOpen: () => void = () => {};
  onClose: () => void = () => {};
  /** A coin landing in the purse (the treasure reveal's shower). */
  onCoin: () => void = () => {};
  private root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private chip: HTMLButtonElement;
  private kick: HTMLElement;
  private slots: HTMLElement[];
  private art: Art | null = null;
  private artKey = '';
  private pieces: Piece[] = [];
  private piecesKey = '';
  private chipKey = '';
  private navKey = '';
  /** Slots held back while their piece is still flying to the chip. */
  private flying = 0;
  private anim = 0;
  private spentT = 0;
  private gauge: HTMLElement;
  private digKey = '';
  private strokes = -1;
  isOpen = false;

  constructor() {
    const r = (this.root = document.createElement('div'));
    r.id = 'tmap';
    r.className = 'screen dim hidden';
    r.innerHTML = `
      <div class="tm-card">
        <div class="tm-sheet">
          <canvas class="tm-canvas" width="${S * Q}" height="${S * Q}"></canvas>
          <i class="tm-x"></i>
        </div>
        <aside class="tm-side">
          <div class="tm-head">
            <small class="tm-kick">Treasure map</small>
            <b class="tm-title"></b>
            <button class="round-btn tm-close" title="Close (Esc)" aria-label="Close"><span class="ti">${icon('<path d="M6 6l12 12M18 6 6 18"/>')}</span></button>
          </div>
          <div class="tm-pieces">${[0, 1, 2].map((i) => `<span class="tm-p" data-i="${i}">${SCRAP}</span>`).join('')}<small class="tm-count"></small></div>
          <ol class="tm-clues">${ROMAN.map((n) => `<li><i>${n}</i><span></span></li>`).join('')}</ol>
          <div class="tm-where"><span class="tm-needle">${NEEDLE}</span><span class="tm-wt"><b></b><small></small></span></div>
        </aside>
      </div>`;
    document.body.appendChild(r);
    this.canvas = r.querySelector('canvas')!;
    r.querySelector('.tm-close')!.addEventListener('click', () => this.onClose());
    r.addEventListener('pointerdown', (e) => {
      if (e.target === r) this.onClose();
    });

    const c = (this.chip = document.createElement('button'));
    c.className = 'map-chip';
    c.title = 'Treasure map (T)';
    c.setAttribute('aria-label', 'Treasure map');
    c.innerHTML =
      `<kbd class="kd mc-key">T</kbd><span class="mc-disc"><span class="tm-ico">${icon(ICONS.scroll)}</span><span class="mc-dir"><i></i></span>` +
      `<span class="mc-spade">${icon(ICONS.spade)}</span><span class="mc-seal">${SEAL}</span></span>` +
      `<span class="mc-txt"><small class="mc-kick">Treasure map</small><span class="mc-row">` +
      `<span class="mc-slots">${[0, 1, 2].map(() => `<i>${SCRAP}</i>`).join('')}</span><b></b></span></span>` +
      ``;
    c.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onOpen();
    });
    this.slots = [...c.querySelectorAll<HTMLElement>('.mc-slots i')];
    this.kick = c.querySelector('.mc-kick')!;
    // it rides in the helm console, after the shot rack
    document.querySelector('#hud .bottom')!.appendChild(c);

    const d = (this.gauge = document.createElement('div'));
    d.className = 'dig-gauge';
    d.innerHTML = `<span class="dg-ico">${icon(ICONS.spade)}</span><span class="dg-body"><span class="dg-top"><b></b><small></small></span><span class="dg-bar"><i></i><em></em></span></span>`;
    document.getElementById('hud')!.appendChild(d);
  }

  // ---------------------------------------------------------------- the dig

  /** The dig gauge: how deep the hole's got, a kick on every spadeful, and the heave when the spade finds wood. */
  setDig(v: { k: number; hands: number; strokes: number; heave: boolean } | null) {
    const g = this.gauge;
    const key = v ? `${v.heave ? 'h' : Math.round(v.k * 100)}|${v.hands}` : '';
    if (v && v.strokes !== this.strokes) {
      if (this.strokes >= 0 && !v.heave) {
        g.classList.remove('stroke');
        void g.offsetWidth;
        g.classList.add('stroke');
      }
      this.strokes = v.strokes;
    }
    if (key === this.digKey) return;
    this.digKey = key;
    g.classList.toggle('on', !!v);
    if (!v) {
      this.strokes = -1;
      return;
    }
    g.classList.toggle('heave', v.heave);
    g.querySelector('b')!.textContent = v.heave ? 'Heave!' : 'Digging';
    g.querySelector('small')!.textContent = v.heave ? 'The spade struck wood' : `${(v.k * 6).toFixed(1)} of 6 ft · ${v.hands} spade${v.hands === 1 ? '' : 's'}`;
    g.querySelector<HTMLElement>('.dg-bar i')!.style.clipPath = `inset(0 ${(1 - (v.heave ? 1 : Math.max(0.03, v.k))) * 100}% 0 0 round 99px)`;
  }

  // ---------------------------------------------------------------- the HUD chip

  /**
   * The chip: hidden until the first piece; three torn slots fill as pieces
   * come in, and once the map is whole a wax seal, an arrow that points to the
   * X across the screen and how far it is. `from` is the ship (or the captain
   * ashore), `x` the X in the world.
   */
  setChip(m: MapState, from?: { x: number; z: number } | null, x?: { x: number; y: number; z: number } | null, camera?: THREE.Camera) {
    const n = pieceCount(m.pieces);
    const shown = m.pieces & ~this.flying;
    const key = `${shown}|${n}`;
    if (key !== this.chipKey) {
      const was = this.chipKey;
      this.chipKey = key;
      const whole = n === 3 && !this.flying;
      // the map's spent (the chest is up): the chip burns away before it goes
      if (was && !n && was.endsWith('|3')) {
        this.chip.classList.add('spent');
        this.spentT = window.setTimeout(() => {
          this.chip.classList.remove('spent', 'on', 'whole', 'near');
          this.chipKey = '';
        }, 1500);
        return;
      }
      clearTimeout(this.spentT);
      this.chip.classList.remove('spent');
      this.chip.classList.toggle('on', n > 0);
      this.chip.classList.toggle('whole', whole);
      this.slots.forEach((s, i) => s.classList.toggle('have', !!(shown & (1 << i))));
      if (!whole) {
        this.chip.classList.remove('near');
        this.chip.querySelector('b')!.textContent = `${pieceCount(shown)}/3`;
        this.kick.textContent = pieceCount(shown) === 2 ? 'One piece to go' : 'Treasure map';
      }
      this.navKey = '';
      const before = +(was.split('|')[0] || 0);
      if (was && pieceCount(shown) > pieceCount(before)) {
        this.chip.classList.remove('bump');
        void this.chip.offsetWidth;
        this.chip.classList.add('bump');
        const i = [0, 1, 2].find((k) => shown & (1 << k) && !(before & (1 << k)));
        if (i !== undefined) {
          const s = this.slots[i];
          s.classList.remove('pop');
          void s.offsetWidth;
          s.classList.add('pop');
        }
      }
    }
    if (n < 3 || this.flying || !from || !x || !camera) return;
    // the way to the X, as the screen sees it
    _a.set(from.x, x.y, from.z).project(camera);
    _b.set(x.x, x.y, x.z).project(camera);
    let dx = _b.x - _a.x;
    let dy = _b.y - _a.y;
    if (_b.z > 1) {
      dx = -dx;
      dy = -dy;
    }
    const ang = Math.atan2(dx * innerWidth, dy * innerHeight);
    const d = Math.hypot(x.x - from.x, x.z - from.z);
    const near = d < 28;
    const nk = `${Math.round(ang * 18)}|${near ? 'n' : fmtDist(d)}`;
    if (nk === this.navKey) return;
    this.navKey = nk;
    this.chip.classList.toggle('near', near);
    this.chip.querySelector<HTMLElement>('.mc-dir i')!.style.transform = `rotate(${ang}rad)`;
    this.chip.querySelector('b')!.textContent = near ? 'Dig here' : fmtDist(d);
    this.kick.textContent = near ? 'X marks the spot' : 'To the X';
  }

  /**
   * A torn piece found: a scrap of parchment tumbles from where it turned up
   * (screen x, y) into its slot on the chip, and the slot fills as it lands.
   */
  flyPiece(i: number, x: number | null, y: number | null) {
    const slot = this.slots[i];
    this.chip.classList.add('on');
    const r = slot.getBoundingClientRect();
    if (!r.width || this.chip.offsetParent === null) return;
    const sx = x ?? innerWidth * 0.5;
    const sy = y ?? innerHeight * 0.42;
    const tx = r.left + r.width / 2;
    const ty = r.top + r.height / 2;
    const f = document.createElement('div');
    f.className = 'tm-fly';
    f.innerHTML = SCRAP;
    document.body.appendChild(f);
    this.flying |= 1 << i;
    this.chipKey = '';
    const mx = (sx + tx) / 2 + (tx < sx ? -1 : 1) * 40;
    const my = Math.min(sy, ty) - 80;
    const spin = (Math.random() < 0.5 ? -1 : 1) * (300 + Math.random() * 160);
    const a = f.animate(
      [
        { transform: `translate(${sx}px, ${sy}px) translate(-50%, -50%) scale(0.4) rotate(0deg)`, opacity: 0 },
        { transform: `translate(${sx}px, ${sy - 30}px) translate(-50%, -50%) scale(1.5) rotate(${spin * 0.15}deg)`, opacity: 1, offset: 0.22 },
        { transform: `translate(${mx}px, ${my}px) translate(-50%, -50%) scale(1.15) rotate(${spin * 0.6}deg)`, offset: 0.6 },
        { transform: `translate(${tx}px, ${ty}px) translate(-50%, -50%) scale(0.45) rotate(${spin}deg)`, opacity: 1 },
      ],
      { duration: 1150, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' },
    );
    a.onfinish = () => {
      f.remove();
      this.flying &= ~(1 << i);
      // (unless the map's already spent and the chip is burning away)
      if (!this.chip.classList.contains('spent')) this.chipKey = '';
    };
  }

  /**
   * The chest is up: a card of what it held under the toasts, and a shower of
   * doubloons from the hole (screen x, y) into the purse.
   */
  reveal(v: { isle: string; gold: number; items: { art: string; rarity: number; name: string }[]; x: number | null; y: number | null }) {
    const host = document.getElementById('toasts');
    if (host) {
      const el = document.createElement('div');
      el.className = 'toast tm-haul';
      el.style.setProperty('--life', '5.6s');
      el.innerHTML =
        `<span class="th-chest">${CHEST}</span><span class="th-t"><small>Buried treasure</small><b></b>` +
        `<span class="th-row"><span class="th-gold"><i class="coin"></i><em>+0</em></span>${v.items
          .slice(0, 4)
          .map((it) => `<span class="th-it r-${it.rarity}" title="">${it.art}</span>`)
          .join('')}</span></span>`;
      el.querySelector('b')!.textContent = v.isle;
      el.querySelectorAll<HTMLElement>('.th-it').forEach((s, k) => (s.title = v.items[k].name));
      host.appendChild(el);
      while (host.children.length > 3) host.firstElementChild?.remove();
      setTimeout(() => el.remove(), 6300);
      // the gold counts up as it lands
      const em = el.querySelector('em')!;
      const t0 = performance.now();
      const tick = () => {
        const k = Math.min(1, (performance.now() - t0 - 350) / 1300);
        em.textContent = `+${Math.round(v.gold * (k <= 0 ? 0 : 1 - (1 - k) ** 3))}`;
        if (k < 1 && el.isConnected) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    // doubloons arc from the hole to the purse
    const purse = document.querySelector('#hud .stats-row .coin')?.getBoundingClientRect();
    if (v.x === null || v.y === null || !purse || !purse.width) return;
    const tx = purse.left + purse.width / 2;
    const ty = purse.top + purse.height / 2;
    for (let k = 0; k < 14; k++) {
      const c = document.createElement('i');
      c.className = 'coin tm-coin';
      document.body.appendChild(c);
      const sx = v.x + (Math.random() - 0.5) * 30;
      const sy = v.y + (Math.random() - 0.5) * 16;
      const ux = sx + (Math.random() - 0.5) * 180;
      const uy = sy - 70 - Math.random() * 90;
      const delay = 120 + k * 55;
      const a = c.animate(
        [
          { transform: `translate(${sx}px, ${sy}px) translate(-50%, -50%) scale(0.3) rotateY(0deg)`, opacity: 0 },
          { transform: `translate(${ux}px, ${uy}px) translate(-50%, -50%) scale(1.6) rotateY(540deg)`, opacity: 1, offset: 0.38 },
          { transform: `translate(${tx}px, ${ty}px) translate(-50%, -50%) scale(0.8) rotateY(1080deg)`, opacity: 1 },
        ],
        { duration: 900 + Math.random() * 250, delay, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'backwards' },
      );
      a.onfinish = () => {
        c.remove();
        if (k % 3 === 0) this.onCoin();
        if (k === 13) {
          const chip = document.querySelector('#hud .stats-row .coin')?.closest('.chip');
          chip?.classList.remove('bump');
          void (chip as HTMLElement | undefined)?.offsetWidth;
          chip?.classList.add('bump');
        }
      };
    }
  }

  // ---------------------------------------------------------------- the map itself

  /**
   * Unrolls the map. `island` is where the X lies (null before the first
   * piece), `from` where the captain stands, for the "how far" line.
   */
  show(on: boolean, m?: MapState, island?: Island | null, heightAt?: HeightFn, from?: { x: number; z: number } | null) {
    this.isOpen = on;
    this.root.classList.toggle('hidden', !on);
    cancelAnimationFrame(this.anim);
    if (!on || !m) return;
    const n = pieceCount(m.pieces);
    const whole = n === 3;
    const isl = island ?? null;
    const name = isl?.name || m.isle;
    const r = this.root;
    r.classList.toggle('whole', whole);
    r.classList.toggle('none', !n);
    r.querySelector('.tm-kick')!.textContent = whole ? 'X marks the spot' : 'Treasure map';
    r.querySelector('.tm-title')!.textContent = !n ? 'No map yet' : whole ? name : 'A torn map';
    r.querySelector('.tm-count')!.textContent = `${n} of 3`;
    r.querySelectorAll<HTMLElement>('.tm-p').forEach((p, i) => p.classList.toggle('have', !!(m.pieces & (1 << i))));

    if (!document.fonts.check('700 24px Cinzel')) {
      document.fonts.load('700 24px Cinzel').then(() => {
        if (!this.isOpen) return;
        this.artKey = '';
        this.show(true, m, island, heightAt, from);
      }, () => {});
    }
    const ok = !!m.pieces && !!isl && !!heightAt;
    if (ok) {
      const key = `${m.seed}|${m.x}|${m.z}|${isl.x}|${isl.z}`;
      if (key !== this.artKey || !this.art) {
        this.art = drawArt(m, isl, heightAt);
        this.artKey = key;
      }
    }
    const clues = ok ? this.art!.clues : [];
    r.querySelectorAll<HTMLElement>('.tm-clues li').forEach((li, i) => {
      const read = i < n && !!clues[i];
      li.classList.toggle('read', read);
      li.querySelector('span')!.textContent = read ? clues[i] : i < n ? '…' : 'Torn away with a missing piece';
    });
    const wb = r.querySelector('.tm-wt b')!;
    const ws = r.querySelector('.tm-wt small')!;
    const needle = r.querySelector<HTMLElement>('.tm-needle')!;
    if (whole && from) {
      const dx = m.x - from.x;
      const dz = m.z - from.z;
      const d = Math.hypot(dx, dz);
      needle.style.transform = `rotate(${Math.atan2(dx, -dz)}rad)`;
      wb.textContent = d < 28 ? "You're standing almost on it" : `${fmtDist(d)} ${octant(dx, dz)} of you`;
      ws.textContent = 'Go ashore there and dig where the sticks cross.';
    } else {
      needle.style.transform = '';
      wb.textContent = n ? `${3 - n} more piece${n === 2 ? '' : 's'} to find` : 'Find a torn piece first';
      ws.textContent = 'Torn pieces turn up in sea chests and in cutthroat camps.';
    }

    // a piece you haven't looked at yet slides into place
    let seen = 0;
    try {
      const [s, b] = (localStorage.getItem(SEEN_KEY) ?? '').split(':');
      if (+s === m.seed) seen = +b || 0;
      localStorage.setItem(SEEN_KEY, `${m.seed}:${m.pieces}`);
    } catch {
      /* private mode: every look's a first look */
    }
    const fresh = ok ? m.pieces & ~seen : 0;
    if (!ok) {
      this.blank();
      this.placeX(m, false);
      return;
    }
    this.layout(m);
    this.placeX(m, false);
    if (!fresh) {
      this.compose(m, 0, 1);
      this.placeX(m, true);
      return;
    }
    const t0 = performance.now();
    const step = () => {
      const t = (performance.now() - t0) / 820;
      this.compose(m, fresh, Math.min(1, t));
      if (t < 1 && this.isOpen) this.anim = requestAnimationFrame(step);
      else this.placeX(m, true);
    };
    this.compose(m, fresh, 0);
    this.anim = requestAnimationFrame(step);
  }

  /** The red X's glow, laid over the sheet where the X really is (once its piece is in hand). */
  private placeX(m: MapState, on: boolean) {
    const el = this.root.querySelector<HTMLElement>('.tm-x')!;
    const a = this.art;
    const g = this.canvas.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const p = a && this.pieces.find((q, i) => m.pieces & (1 << i) && g.isPointInPath(q.path, a.x, a.y));
    el.classList.toggle('on', on && !!p);
    if (!a || !p) return;
    const pt = p.m.transformPoint(new DOMPoint(a.x, a.y));
    el.style.left = `${(pt.x / S) * 100}%`;
    el.style.top = `${(pt.y / S) * 100}%`;
  }

  /** Where the tears fall and how each piece lies (fixed by the map's seed). */
  private layout(m: MapState) {
    const key = `${m.seed}`;
    if (key === this.piecesKey) return;
    this.piecesKey = key;
    const rnd = mulberry32(m.seed + 3);
    const cuts = [0, S / 3 + (rnd() - 0.5) * 40, (2 * S) / 3 + (rnd() - 0.5) * 40, S];
    const tear = (x: number, seed: number) => {
      const r = mulberry32(seed);
      const pts: [number, number][] = [];
      const ph = r() * 9;
      for (let y = 8; y <= S - 8; y += 4.5) pts.push([x + Math.sin(y * 0.045 + ph) * 6 + (r() - 0.5) * 7 + (r() < 0.12 ? (r() - 0.5) * 9 : 0), y]);
      pts[pts.length - 1][1] = S - 8;
      return pts;
    };
    const deckle = (x0: number, y0: number, x1: number, y1: number, seed: number) => {
      const r = mulberry32(seed);
      const pts: [number, number][] = [];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const nx = -(y1 - y0) / len;
      const ny = (x1 - x0) / len;
      const n = Math.max(2, Math.round(len / 9));
      for (let k = 1; k < n; k++) {
        const t = k / n;
        const o = (r() - 0.5) * 2.6;
        pts.push([x0 + (x1 - x0) * t + nx * o, y0 + (y1 - y0) * t + ny * o]);
      }
      return pts;
    };
    const edges = [null, tear(cuts[1], m.seed + 11), tear(cuts[2], m.seed + 29), null];
    const E = 8;
    this.pieces = [0, 1, 2].map((i) => {
      const L = edges[i] ?? [[E, E], ...deckle(E, E, E, S - E, m.seed + 41), [E, S - E]];
      const R = edges[i + 1] ?? [[S - E, E], ...deckle(S - E, E, S - E, S - E, m.seed + 43), [S - E, S - E]];
      const bl = L[L.length - 1];
      const br = R[R.length - 1];
      const tl = L[0];
      const tr = R[0];
      const path = new Path2D();
      L.forEach(([x, y], k) => (k ? path.lineTo(x, y) : path.moveTo(x, y)));
      deckle(bl[0], bl[1], br[0], br[1], m.seed + 50 + i).forEach(([x, y]) => path.lineTo(x, y));
      R.slice().reverse().forEach(([x, y]) => path.lineTo(x, y));
      deckle(tr[0], tr[1], tl[0], tl[1], m.seed + 60 + i).forEach(([x, y]) => path.lineTo(x, y));
      path.closePath();
      const tears = [edges[i], edges[i + 1]].filter(Boolean) as [number, number][][];
      // each piece lies a touch askew
      const a = (rnd() - 0.5) * 2.2;
      const mat = new DOMMatrix()
        .translate(S / 2, S / 2)
        .rotate(a)
        .translate(-S / 2 + (rnd() - 0.5) * 5 + (i - 1) * 1.5, -S / 2 + (rnd() - 0.5) * 6);
      return { path, tears, m: mat, cx: (cuts[i] + cuts[i + 1]) / 2 };
    });
  }

  /** Lays the pieces on the table; the `fresh` ones are `t` of the way into place. */
  private compose(m: MapState, fresh: number, t: number) {
    const g = this.canvas.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, S * Q, S * Q);
    const art = this.art!.c;
    // the ghosts of the missing pieces first, the held ones over them
    const order = [0, 1, 2].sort((a, b) => +!!(m.pieces & (1 << a)) - +!!(m.pieces & (1 << b)) || +!!(fresh & (1 << a)) - +!!(fresh & (1 << b)));
    let k = 0;
    for (const i of order) {
      const p = this.pieces[i];
      const have = !!(m.pieces & (1 << i));
      g.setTransform(Q, 0, 0, Q, 0, 0);
      if (!have) {
        g.transform(p.m.a, p.m.b, p.m.c, p.m.d, p.m.e, p.m.f);
        this.ghost(g, p);
        continue;
      }
      let alpha = 1;
      if (fresh & (1 << i)) {
        // a stagger, then a swoop in from above with a little settle
        const u = Math.max(0, Math.min(1, t * 1.25 - k++ * 0.2));
        const e = u >= 1 ? 1 : 1 - Math.pow(2, -9 * u) * Math.cos(u * 7.5);
        const off = 1 - e;
        g.translate(p.cx + off * (i === 0 ? -60 : i === 2 ? 60 : 0), S / 2 - off * 150);
        g.rotate(off * (i === 1 ? -0.35 : 0.3));
        g.scale(1 + off * 0.18, 1 + off * 0.18);
        g.translate(-p.cx, -S / 2);
        alpha = Math.min(1, u * 3);
      }
      g.transform(p.m.a, p.m.b, p.m.c, p.m.d, p.m.e, p.m.f);
      g.globalAlpha = alpha;
      g.shadowColor = 'rgba(0, 0, 0, 0.5)';
      g.shadowBlur = 22 * Q;
      g.shadowOffsetY = 9 * Q;
      g.fillStyle = '#d8bf88';
      g.fill(p.path);
      g.shadowColor = 'transparent';
      g.save();
      g.clip(p.path);
      g.drawImage(art, 0, 0, S, S);
      // a scorched rim round the outside, a darker stain along each tear
      g.lineWidth = 5;
      g.strokeStyle = 'rgba(86, 48, 16, 0.42)';
      g.stroke(p.path);
      g.lineWidth = 7;
      g.strokeStyle = 'rgba(110, 70, 28, 0.2)';
      for (const tr of p.tears) poly(g, tr);
      g.restore();
      // the torn fibres: a pale, ragged fringe
      g.lineWidth = 1.4;
      g.strokeStyle = 'rgba(252, 243, 220, 0.92)';
      for (const tr of p.tears) poly(g, tr);
      g.globalAlpha = 1;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** A piece you haven't got: its outline, a wax "?" and where they turn up. */
  private ghost(g: CanvasRenderingContext2D, p: Piece) {
    g.save();
    g.setLineDash([6, 6]);
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(255, 232, 186, 0.4)';
    g.stroke(p.path);
    g.setLineDash([]);
    g.fillStyle = 'rgba(255, 232, 186, 0.045)';
    g.fill(p.path);
    g.clip(p.path);
    g.strokeStyle = 'rgba(255, 232, 186, 0.06)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = -S; x < S * 2; x += 13) {
      g.moveTo(x, 0);
      g.lineTo(x + S * 0.6, S);
    }
    g.stroke();
    g.restore();
    const cx = p.cx;
    const cy = S / 2;
    g.save();
    g.setLineDash([3, 4]);
    g.lineWidth = 1.4;
    g.strokeStyle = 'rgba(244, 199, 101, 0.55)';
    g.beginPath();
    g.arc(cx, cy - 8, 22, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(244, 199, 101, 0.75)';
    g.font = '700 24px Cinzel, Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('?', cx, cy - 7);
    g.font = '700 10px Inter, system-ui, sans-serif';
    g.fillStyle = 'rgba(255, 232, 186, 0.6)';
    spaced(g, 'MISSING', cx, cy + 32, 2.4);
    g.restore();
  }

  private blank() {
    const g = this.canvas.getContext('2d')!;
    g.setTransform(Q, 0, 0, Q, 0, 0);
    g.clearRect(0, 0, S, S);
    this.layout({ seed: 7 } as MapState);
    this.piecesKey = '';
    for (const p of this.pieces) {
      g.save();
      g.transform(p.m.a, p.m.b, p.m.c, p.m.d, p.m.e, p.m.f);
      this.ghost(g, p);
      g.restore();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** A little brass-bound chest, open, gold heaped inside. */
const CHEST =
  '<svg viewBox="0 0 40 34"><defs><linearGradient id="thw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a5683a"/><stop offset="1" stop-color="#5e3418"/></linearGradient>' +
  '<radialGradient id="thg" cx=".5" cy=".7" r=".6"><stop offset="0" stop-color="#fff3c0"/><stop offset=".55" stop-color="#f4c765"/><stop offset="1" stop-color="#b9821f"/></radialGradient></defs>' +
  '<path d="M6 9.5 9 2.5h22l3 7z" fill="url(#thw)" stroke="#2b1607" stroke-width="1.2"/>' +
  '<ellipse cx="20" cy="13" rx="14" ry="5" fill="url(#thg)"/><circle cx="14" cy="11.5" r="2" fill="#ffe9a0"/><circle cx="24" cy="10.8" r="2.2" fill="#ffe08a"/><circle cx="19" cy="9.8" r="1.8" fill="#fff3c0"/>' +
  '<path d="M5 13h30v16.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" fill="url(#thw)" stroke="#2b1607" stroke-width="1.2"/>' +
  '<path d="M5 18.5h30M12 13v18.5M28 13v18.5" stroke="#e6b450" stroke-width="1.6"/><rect x="17.5" y="17" width="5" height="6" rx="1" fill="#f4c765" stroke="#2b1607" stroke-width=".8"/></svg>';

/** Strokes an open polyline. */
function poly(g: CanvasRenderingContext2D, pts: [number, number][]) {
  g.beginPath();
  pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
}

/** Letter-spaced text, centred on x. */
function spaced(g: CanvasRenderingContext2D, s: string, x: number, y: number, sp: number) {
  const w = [...s].reduce((a, ch) => a + g.measureText(ch).width + sp, -sp);
  let at = x - w / 2;
  const align = g.textAlign;
  g.textAlign = 'left';
  for (const ch of s) {
    g.fillText(ch, at, y);
    at += g.measureText(ch).width + sp;
  }
  g.textAlign = align;
}

// ------------------------------------------------------------------ the art

/** Contour segments through a height grid at `level` (marching squares), in sheet space. */
function contour(hs: Float32Array, N: number, level: number, cell: number): number[] {
  const out: number[] = [];
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const a = hs[j * N + i];
      const b = hs[j * N + i + 1];
      const c = hs[(j + 1) * N + i + 1];
      const d = hs[(j + 1) * N + i];
      const idx = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const T = () => [(i + (level - a) / (b - a)) * cell, j * cell];
      const R = () => [(i + 1) * cell, (j + (level - b) / (c - b)) * cell];
      const B = () => [(i + (level - d) / (c - d)) * cell, (j + 1) * cell];
      const L = () => [i * cell, (j + (level - a) / (d - a)) * cell];
      const seg = (p: number[], q: number[]) => out.push(p[0], p[1], q[0], q[1]);
      switch (idx) {
        case 1: case 14: seg(L(), B()); break;
        case 2: case 13: seg(B(), R()); break;
        case 3: case 12: seg(L(), R()); break;
        case 4: case 11: seg(T(), R()); break;
        case 6: case 9: seg(T(), B()); break;
        case 7: case 8: seg(L(), T()); break;
        case 5: seg(L(), T()); seg(B(), R()); break;
        case 10: seg(T(), R()); seg(L(), B()); break;
      }
    }
  }
  return out;
}

/** A hand's tremble: a smooth wobble that matches where segments meet. */
const wob = (x: number, y: number): [number, number] => [x + Math.sin(y * 0.09 + x * 0.031) * 0.8, y + Math.cos(x * 0.083 - y * 0.027) * 0.8];

function strokeSegs(g: CanvasRenderingContext2D, segs: number[]) {
  g.beginPath();
  for (let k = 0; k < segs.length; k += 4) {
    const [x0, y0] = wob(segs[k], segs[k + 1]);
    const [x1, y1] = wob(segs[k + 2], segs[k + 3]);
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
  }
  g.stroke();
}

/** The whole map, untorn: ink and watercolour on parchment, and the riddle that goes with it. */
function drawArt(m: MapState, isl: Island, heightAt: HeightFn): Art {
  const c = document.createElement('canvas');
  c.width = c.height = S * Q;
  const g = c.getContext('2d')!;
  g.scale(Q, Q);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const rnd = mulberry32(m.seed);
  // frame the isle, nudged so the X never sits dead centre
  const span = Math.max(240, isl.r * 2.7 * Math.max(1, isl.stretch));
  const cx = isl.x * 0.75 + m.x * 0.25;
  const cz = isl.z * 0.75 + m.z * 0.25;
  const toPx = (x: number, z: number): [number, number] => [((x - cx) / span + 0.5) * S, ((z - cz) / span + 0.5) * S];
  const toW = (px: number, py: number): [number, number] => [cx + (px / S - 0.5) * span, cz + (py / S - 0.5) * span];

  // the land, sampled from the terrain on a grid of nodes
  const N = RES + 1;
  const cell = S / RES;
  const hs = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) hs[j * N + i] = heightAt(cx + (i / RES - 0.5) * span, cz + (j / RES - 0.5) * span);
  const hAt = (x: number, y: number) => {
    const fx = Math.max(0, Math.min(RES - 0.001, x / cell));
    const fy = Math.max(0, Math.min(RES - 0.001, y / cell));
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fx - i;
    const v = fy - j;
    const k = j * N + i;
    return (hs[k] * (1 - u) + hs[k + 1] * u) * (1 - v) + (hs[k + N] * (1 - u) + hs[k + N + 1] * u) * v;
  };
  const [xx, xy] = toPx(m.x, m.z);

  // ---- parchment: warm, blotched, fibrous
  const grad = g.createRadialGradient(S * 0.46, S * 0.44, S * 0.1, S / 2, S / 2, S * 0.78);
  grad.addColorStop(0, '#f3e4bf');
  grad.addColorStop(0.6, '#e6cf9c');
  grad.addColorStop(1, '#b89159');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 10 + rnd() * 60;
    const b = g.createRadialGradient(x, y, 0, x, y, r);
    b.addColorStop(0, `rgba(130, 86, 34, ${0.03 + rnd() * 0.06})`);
    b.addColorStop(1, 'rgba(130, 86, 34, 0)');
    g.fillStyle = b;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.lineWidth = 0.6;
  g.strokeStyle = 'rgba(120, 82, 36, 0.07)';
  g.beginPath();
  for (let i = 0; i < 1500; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const a = (rnd() - 0.5) * 0.9;
    const l = 2 + rnd() * 7;
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
  }
  g.stroke();
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(150, 92, 38, ${0.06 + rnd() * 0.12})`;
    g.beginPath();
    g.arc(rnd() * S, rnd() * S, 0.6 + rnd() * 2.2, 0, Math.PI * 2);
    g.fill();
  }

  // ---- where the ornaments go: the most open water in the corners
  const water = (x: number, y: number) => {
    let w = 0;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      for (const r of [0, 24, 48]) if (hAt(x + Math.cos(a) * r, y + Math.sin(a) * r) < -1.5) w++;
    }
    return w;
  };
  const corners: [number, number][] = [
    [86, S - 92],
    [S - 86, S - 92],
    [86, 150],
    [S - 86, 150],
  ];
  const score = corners.map(([x, y]) => water(x, y));
  const rose = score[0] >= score[1] ? 0 : 1;
  const rest = [0, 1, 2, 3].filter((k) => k !== rose).sort((a, b) => score[b] - score[a]);
  const [rx, ry] = corners[rose];
  const beast = score[rest[0]] > 40 ? corners[rest[0]] : null;

  // ---- rhumb lines out of the rose, as on a sailing master's chart
  g.lineWidth = 0.7;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    g.strokeStyle = k % 4 === 0 ? 'rgba(120, 66, 30, 0.2)' : k % 2 === 0 ? 'rgba(120, 66, 30, 0.13)' : 'rgba(150, 50, 40, 0.1)';
    g.beginPath();
    g.moveTo(rx + Math.cos(a) * 40, ry + Math.sin(a) * 40);
    g.lineTo(rx + Math.cos(a) * 900, ry + Math.sin(a) * 900);
    g.stroke();
  }

  // ---- watercolour: a sea-green wash hugging the coast, the land in sand and sage
  const WR = RES * 2;
  const wash = document.createElement('canvas');
  wash.width = wash.height = WR;
  const wg = wash.getContext('2d')!;
  const id = wg.createImageData(WR, WR);
  for (let j = 0; j < WR; j++) {
    for (let i = 0; i < WR; i++) {
      const h = hAt(((i + 0.5) / WR) * S, ((j + 0.5) / WR) * S);
      const o = (j * WR + i) * 4;
      let r: number, gg: number, b: number, a: number;
      if (h > 0) {
        if (h < 1.3) [r, gg, b, a] = [240, 222, 172, 0.75];
        else {
          const t = Math.min(1, (h - 1.3) / 16);
          r = 186 - t * 30;
          gg = 182 - t * 52;
          b = 118 - t * 30;
          a = 0.55 + t * 0.1;
        }
      } else {
        r = 92;
        gg = 156;
        b = 150;
        a = 0.5 * Math.exp(h / 3.4);
      }
      id.data[o] = r;
      id.data[o + 1] = gg;
      id.data[o + 2] = b;
      id.data[o + 3] = a * 255;
    }
  }
  wg.putImageData(id, 0, 0);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(wash, 0, 0, S, S);

  // ---- ink: water-lines echoing the coast, the coast itself, the hills' contours
  const waterlines: [number, number][] = [
    [-0.7, 0.5],
    [-1.7, 0.36],
    [-2.9, 0.26],
    [-4.4, 0.18],
    [-6.4, 0.12],
  ];
  g.lineWidth = 0.85;
  for (const [lv, a] of waterlines) {
    g.strokeStyle = `rgba(44, 72, 70, ${a})`;
    strokeSegs(g, contour(hs, N, lv, cell));
  }
  g.lineWidth = 0.8;
  g.strokeStyle = 'rgba(112, 72, 32, 0.3)';
  for (const lv of [5, 10, 15, 20, 26]) strokeSegs(g, contour(hs, N, lv, cell));
  // beach stipple
  g.fillStyle = 'rgba(100, 66, 30, 0.42)';
  for (let k = 0; k < 900; k++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const h = hAt(x, y);
    if (h <= 0.05 || h > 1.1) continue;
    g.fillRect(x, y, 0.9, 0.9);
  }
  const coast = contour(hs, N, 0, cell);
  g.lineWidth = 4.5;
  g.strokeStyle = 'rgba(70, 40, 14, 0.16)';
  strokeSegs(g, coast);
  g.lineWidth = 1.8;
  g.strokeStyle = 'rgba(50, 28, 10, 0.9)';
  strokeSegs(g, coast);

  // ---- the sea: little ink waves
  g.strokeStyle = 'rgba(54, 40, 20, 0.5)';
  g.lineWidth = 1.1;
  for (let k = 0; k < 90; k++) {
    const x = rnd() * S;
    const y = rnd() * S;
    if (hAt(x, y) > -4.5 || hAt(x + 14, y) > -4.5 || hAt(x - 14, y) > -4.5 || Math.hypot(x - rx, y - ry) < 52) continue;
    g.beginPath();
    g.moveTo(x - 6, y);
    g.quadraticCurveTo(x - 3, y - 3.5, x, y);
    g.quadraticCurveTo(x + 3, y - 3.5, x + 6, y);
    g.stroke();
  }

  // ---- hills: shaded humps on the high ground
  const hills: [number, number, number][] = [];
  for (let k = 0; k < 500 && hills.length < 9; k++) {
    const x = 30 + rnd() * (S - 60);
    const y = 30 + rnd() * (S - 60);
    const h = hAt(x, y);
    if (h < 9 || hills.some(([hx, hy]) => Math.hypot(hx - x, hy - y) < 34) || Math.hypot(x - xx, y - xy) < 30) continue;
    hills.push([x, y, h]);
  }
  hills.sort((a, b) => a[1] - b[1]);
  for (const [x, y, h] of hills) {
    const w = 16 + Math.min(16, h * 0.55);
    const hh = w * 0.55;
    g.beginPath();
    g.moveTo(x - w / 2, y);
    g.bezierCurveTo(x - w * 0.3, y - hh * 0.9, x - w * 0.1, y - hh * 1.25, x + w * 0.05, y - hh);
    g.bezierCurveTo(x + w * 0.2, y - hh * 0.8, x + w * 0.35, y - hh * 0.5, x + w / 2, y);
    g.fillStyle = 'rgba(228, 208, 158, 0.85)';
    g.fill();
    g.lineWidth = 1.3;
    g.strokeStyle = 'rgba(56, 34, 12, 0.85)';
    g.stroke();
    // shading down the lee side
    g.lineWidth = 0.8;
    g.beginPath();
    for (let s = 0; s < 5; s++) {
      const t = 0.25 + s * 0.15;
      const px = x + w * 0.05 + (w * 0.45) * t;
      const py = y - hh * (1 - t) * 0.95;
      g.moveTo(px, py + 1);
      g.lineTo(px - 2.5, Math.min(y - 1, py + hh * 0.45));
    }
    g.stroke();
  }

  // ---- the way in: from the nearest beach to the X
  let best: [number, number] | null = null;
  for (let k = 1; k < 48 && !best; k++) {
    for (let a = 0; a < 32; a++) {
      const r = k * 5;
      const ang = (a / 32) * Math.PI * 2;
      const x = xx + Math.cos(ang) * r;
      const y = xy + Math.sin(ang) * r;
      if (hAt(x, y) < 0) {
        best = [x - Math.cos(ang) * 6, y - Math.sin(ang) * 6];
        break;
      }
    }
  }

  // ---- palms on the low ground (none on the X)
  for (let k = 0; k < 170; k++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const h = hAt(x, y);
    if (h < 0.9 || h > 8.5 || Math.hypot(x - xx, y - xy) < 24 || hills.some(([hx, hy]) => Math.hypot(hx - x, hy - y) < 18)) continue;
    palm(g, x, y, 0.85 + rnd() * 0.45, rnd() < 0.5 ? -1 : 1);
  }

  const clues: string[] = [];
  if (best) {
    const [bx, by] = best;
    const mx = (bx + xx) / 2 + (rnd() - 0.5) * 40;
    const my = (by + xy) / 2 + (rnd() - 0.5) * 40;
    // dashes along the curve, like footsteps
    g.strokeStyle = 'rgba(64, 36, 14, 0.85)';
    g.lineWidth = 1.8;
    g.beginPath();
    const at = (t: number): [number, number] => [(1 - t) * (1 - t) * bx + 2 * (1 - t) * t * mx + t * t * xx, (1 - t) * (1 - t) * by + 2 * (1 - t) * t * my + t * t * xy];
    let len = 0;
    let prev = at(0);
    const pts: [number, number, number][] = [[prev[0], prev[1], 0]];
    for (let s = 1; s <= 80; s++) {
      const p = at(s / 80);
      len += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      pts.push([p[0], p[1], len]);
      prev = p;
    }
    for (let d = 0; d < len - 16; d += 9) {
      const p0 = pts.find((p) => p[2] >= d)!;
      const p1 = pts.find((p) => p[2] >= d + 4) ?? p0;
      g.moveTo(p0[0], p0[1]);
      g.lineTo(p1[0], p1[1]);
    }
    g.stroke();
    // an anchor where the boat comes in
    const [ox, oy] = [bx + (bx - xx) / Math.max(1, Math.hypot(bx - xx, by - xy)) * 14, by + (by - xy) / Math.max(1, Math.hypot(bx - xx, by - xy)) * 14];
    anchor(g, ox, oy);
    // the riddle
    const [wx, wz] = toW(bx, by);
    const paces = Math.max(10, Math.round(Math.hypot(m.x - wx, m.z - wz) / 0.8 / 5) * 5);
    const hx = heightAt(m.x, m.z);
    clues.push(`Land on the ${octant(wx - isl.x, wz - isl.z)} shore`);
    clues.push(`Walk ${paces} paces ${octant(m.x - wx, m.z - wz)}`);
    clues.push(`Dig ${hx < 1.6 ? 'in the sand above the tide' : hx < 7 ? 'among the palms' : 'up on the high ground'}, where the sticks cross`);
    // "so many paces" along the trail, kept upright (a short trail says it in the riddle alone)
    const mid = at(0.5);
    if (len > 64) {
      const d = at(0.56);
      let ang = Math.atan2(d[1] - mid[1], d[0] - mid[0]);
      if (ang > Math.PI / 2) ang -= Math.PI;
      if (ang < -Math.PI / 2) ang += Math.PI;
      g.save();
      g.translate(mid[0], mid[1]);
      g.rotate(ang);
      g.font = 'italic 600 11.5px Georgia, serif';
      g.textAlign = 'center';
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(240, 224, 180, 0.8)';
      g.strokeText(`${paces} paces`, 0, -7);
      g.fillStyle = 'rgba(60, 34, 12, 0.9)';
      g.fillText(`${paces} paces`, 0, -7);
      g.restore();
    }
  } else {
    clues.push('Land where you can', `Find the crossed sticks`, 'Dig where they lie');
  }

  // ---- the X, in red ink, ringed
  g.save();
  g.translate(xx, xy);
  g.strokeStyle = 'rgba(150, 30, 20, 0.75)';
  g.lineWidth = 1.4;
  g.beginPath();
  g.ellipse(0, 0, 19, 16, -0.3, 0.3, Math.PI * 2 + 0.1);
  g.stroke();
  const brush = (x0: number, y0: number, x1: number, y1: number) => {
    g.lineWidth = 6;
    g.strokeStyle = '#9b2015';
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo((x0 + x1) / 2 + 1.5, (y0 + y1) / 2 - 1, x1, y1);
    g.stroke();
    g.lineWidth = 2;
    g.strokeStyle = '#6e120b';
    g.beginPath();
    g.moveTo(x0 + 1, y0 + 1);
    g.quadraticCurveTo((x0 + x1) / 2 + 2, (y0 + y1) / 2, x1 + 0.5, y1 + 1);
    g.stroke();
  };
  brush(-10, -11, 11, 10);
  brush(10, -11, -11, 11);
  // a drip or two
  g.fillStyle = '#8c1b12';
  g.fillRect(10.2, 10, 1.6, 5);
  g.beginPath();
  g.arc(11, 15.5, 1.4, 0, Math.PI * 2);
  g.fill();
  g.fillRect(-12, 11, 1.4, 3);
  g.restore();

  // ---- the ornaments: compass rose, a sea serpent, a scale of paces
  compass(g, rx, ry, 40);
  if (beast) serpent(g, beast[0], beast[1] + 10, rnd);
  scaleBar(g, rose === 0 ? S - 150 : 44, S - 40, span);

  // ---- the isle's name on a ribbon
  ribbon(g, isl.name || m.isle, S / 2, 50);

  // ---- age: a coffee ring, a fold, scorched edges
  const ringX = 110 + rnd() * (S - 220);
  const ringY = 110 + rnd() * (S - 220);
  const rr = 30 + rnd() * 14;
  for (let k = 0; k < 4; k++) {
    g.strokeStyle = `rgba(120, 70, 24, ${0.05 + rnd() * 0.06})`;
    g.lineWidth = 1 + rnd() * 2.5;
    g.beginPath();
    g.arc(ringX + (rnd() - 0.5) * 2, ringY + (rnd() - 0.5) * 2, rr + (rnd() - 0.5) * 3, rnd() * 6, rnd() * 6 + 4 + rnd() * 2);
    g.stroke();
  }
  const fy = S * 0.5 + (rnd() - 0.5) * 30;
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(255, 248, 228, 0.3)';
  g.beginPath();
  g.moveTo(0, fy);
  g.lineTo(S, fy + 3);
  g.stroke();
  g.strokeStyle = 'rgba(96, 62, 26, 0.16)';
  g.beginPath();
  g.moveTo(0, fy + 1.4);
  g.lineTo(S, fy + 4.4);
  g.stroke();
  const vig = g.createRadialGradient(S / 2, S / 2, S * 0.36, S / 2, S / 2, S * 0.74);
  vig.addColorStop(0, 'rgba(90, 52, 16, 0)');
  vig.addColorStop(1, 'rgba(90, 52, 16, 0.42)');
  g.fillStyle = vig;
  g.fillRect(0, 0, S, S);
  for (const [x0, y0, x1, y1] of [
    [0, 0, 26, 0],
    [S, 0, S - 26, 0],
    [0, 0, 0, 26],
    [0, S, 0, S - 26],
  ]) {
    const e = g.createLinearGradient(x0, y0, x1, y1);
    e.addColorStop(0, 'rgba(78, 42, 12, 0.4)');
    e.addColorStop(1, 'rgba(78, 42, 12, 0)');
    g.fillStyle = e;
    g.fillRect(0, 0, S, S);
  }
  return { c, x: xx, y: xy, clues };
}

function palm(g: CanvasRenderingContext2D, x: number, y: number, s: number, lean: number) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.fillStyle = 'rgba(70, 50, 20, 0.16)';
  g.beginPath();
  g.ellipse(1.5, 6.5, 4.5, 1.4, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(46, 34, 14, 0.85)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(0, 6.5);
  g.quadraticCurveTo(lean * 2.4, 2, lean * 1.4, -3);
  g.stroke();
  g.lineWidth = 0.95;
  g.fillStyle = 'rgba(90, 104, 52, 0.55)';
  const tx = lean * 1.4;
  const ty = -3;
  for (const a of [-2.5, -1.7, -0.75, 0.75, 1.7, 2.5]) {
    const ex = tx + Math.sin(a) * 6;
    const ey = ty - Math.cos(a) * 3.5 + Math.abs(Math.sin(a)) * 3;
    g.beginPath();
    g.moveTo(tx, ty);
    g.quadraticCurveTo(tx + Math.sin(a) * 3.6, ty - Math.cos(a) * 4 - 1.2, ex, ey);
    g.quadraticCurveTo(tx + Math.sin(a) * 2.6, ty - Math.cos(a) * 2.2, tx, ty);
    g.fill();
    g.stroke();
  }
  g.restore();
}

function anchor(g: CanvasRenderingContext2D, x: number, y: number) {
  g.save();
  g.translate(x, y);
  g.strokeStyle = 'rgba(52, 30, 12, 0.85)';
  g.lineWidth = 1.3;
  g.beginPath();
  g.arc(0, -6, 1.8, 0, Math.PI * 2);
  g.moveTo(0, -4.2);
  g.lineTo(0, 5);
  g.moveTo(-3, -2);
  g.lineTo(3, -2);
  g.moveTo(-5, 1.5);
  g.quadraticCurveTo(-4, 5.5, 0, 5.5);
  g.quadraticCurveTo(4, 5.5, 5, 1.5);
  g.stroke();
  g.restore();
}

function compass(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.save();
  g.translate(x, y);
  const ink = 'rgba(56, 32, 12, 0.85)';
  g.strokeStyle = ink;
  g.lineWidth = 1;
  g.beginPath();
  g.arc(0, 0, r * 0.72, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(0, 0, r * 0.8, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2;
    const r0 = r * (k % 4 === 0 ? 0.64 : 0.69);
    g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    g.lineTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
  }
  g.stroke();
  // eight points: the long ones north, east, south and west, each half in shadow
  for (const long of [false, true]) {
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + (long ? 0 : Math.PI / 4);
      const L = long ? r : r * 0.6;
      const w = long ? r * 0.15 : r * 0.12;
      g.save();
      g.rotate(a);
      g.beginPath();
      g.moveTo(0, -L);
      g.lineTo(w, -w);
      g.lineTo(0, 0);
      g.closePath();
      g.fillStyle = long && k === 0 ? 'rgba(150, 32, 22, 0.9)' : ink;
      g.fill();
      g.beginPath();
      g.moveTo(0, -L);
      g.lineTo(-w, -w);
      g.lineTo(0, 0);
      g.closePath();
      g.fillStyle = 'rgba(244, 230, 196, 0.95)';
      g.fill();
      g.lineWidth = 0.9;
      g.strokeStyle = ink;
      g.stroke();
      g.restore();
    }
  }
  g.fillStyle = ink;
  g.beginPath();
  g.arc(0, 0, 2.2, 0, Math.PI * 2);
  g.fill();
  g.font = '700 13px Cinzel, Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillText('N', 0, -r - 5);
  g.restore();
}

/** Here be serpents: a coiled back breaking the swell, ink on the open sea. */
function serpent(g: CanvasRenderingContext2D, x: number, y: number, rnd: () => number) {
  g.save();
  g.translate(x, y);
  const flip = rnd() < 0.5 ? -1 : 1;
  g.scale(flip, 1);
  const tube = (draw: () => void) => {
    g.lineWidth = 4.2;
    g.strokeStyle = 'rgba(48, 30, 12, 0.85)';
    g.beginPath();
    draw();
    g.stroke();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(122, 140, 98, 0.9)';
    g.beginPath();
    draw();
    g.stroke();
  };
  // the humps
  for (const [hx, r] of [
    [-10, 7],
    [8, 8],
    [26, 6],
  ]) tube(() => g.arc(hx, 0, r, Math.PI, 0));
  // the tail, curling
  tube(() => {
    g.moveTo(32, 0);
    g.quadraticCurveTo(40, -9, 44, -4);
    g.quadraticCurveTo(46, 0, 42, -1);
  });
  // the neck and head
  tube(() => {
    g.moveTo(-17, 0);
    g.quadraticCurveTo(-22, -14, -30, -15);
  });
  g.fillStyle = 'rgba(122, 140, 98, 0.95)';
  g.strokeStyle = 'rgba(48, 30, 12, 0.9)';
  g.lineWidth = 1.1;
  g.beginPath();
  g.ellipse(-32, -15.5, 5.2, 3.2, -0.2, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = 'rgba(48, 30, 12, 0.95)';
  g.beginPath();
  g.arc(-33, -16.5, 0.9, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(150, 32, 22, 0.85)';
  g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(-37, -15);
  g.lineTo(-41, -14);
  g.moveTo(-41, -14);
  g.lineTo(-43, -15.5);
  g.moveTo(-41, -14);
  g.lineTo(-43, -12.5);
  g.stroke();
  // fins along the back
  g.fillStyle = 'rgba(48, 30, 12, 0.8)';
  for (const fx of [-10, 8, 26]) {
    g.beginPath();
    g.moveTo(fx - 2, -6.5);
    g.lineTo(fx, -11);
    g.lineTo(fx + 2, -6.5);
    g.fill();
  }
  // the swell it breaks
  g.strokeStyle = 'rgba(44, 72, 70, 0.55)';
  g.lineWidth = 1;
  g.beginPath();
  for (const wx of [-24, -1, 17, 35]) {
    g.moveTo(wx - 4, 2);
    g.quadraticCurveTo(wx, 4.5, wx + 4, 2);
  }
  g.stroke();
  g.restore();
}

function scaleBar(g: CanvasRenderingContext2D, x: number, y: number, span: number) {
  const pxPerPace = (S / span) * 0.8;
  const paces = [25, 50, 100, 200].find((p) => p * pxPerPace >= 60) ?? 200;
  const w = paces * pxPerPace;
  g.save();
  g.translate(x, y);
  g.strokeStyle = 'rgba(56, 32, 12, 0.8)';
  g.lineWidth = 0.9;
  g.strokeRect(0, 0, w, 4);
  for (let k = 0; k < 4; k++) if (k % 2 === 0) {
    g.fillStyle = 'rgba(56, 32, 12, 0.75)';
    g.fillRect((k * w) / 4, 0, w / 4, 4);
  }
  g.fillStyle = 'rgba(56, 32, 12, 0.85)';
  g.font = 'italic 600 10px Georgia, serif';
  g.textAlign = 'center';
  g.fillText(`${paces} paces`, w / 2, 16);
  g.restore();
}

/** A furled ribbon with a name on it. */
function ribbon(g: CanvasRenderingContext2D, name: string, x: number, y: number) {
  g.save();
  let fs = 23;
  g.font = `700 ${fs}px Cinzel, Georgia, serif`;
  let tw = g.measureText(name).width;
  while (tw > 330 && fs > 13) {
    fs -= 1;
    g.font = `700 ${fs}px Cinzel, Georgia, serif`;
    tw = g.measureText(name).width;
  }
  const w = tw + 56;
  const h = 32;
  const l = x - w / 2;
  const r = x + w / 2;
  const sag = 6;
  // the tails, tucked behind
  g.fillStyle = '#c9ab70';
  g.strokeStyle = 'rgba(56, 32, 12, 0.85)';
  g.lineWidth = 1.1;
  for (const s of [-1, 1]) {
    const ex = s < 0 ? l : r;
    g.beginPath();
    g.moveTo(ex - s * 8, y - h / 2 + 8);
    g.lineTo(ex + s * 22, y - h / 2 + 8);
    g.lineTo(ex + s * 13, y + 4 + 4);
    g.lineTo(ex + s * 22, y + h / 2 + 8);
    g.lineTo(ex - s * 8, y + h / 2 + 8);
    g.closePath();
    g.fill();
    g.stroke();
  }
  // the band, sagging a touch in the middle
  const band = new Path2D();
  band.moveTo(l, y - h / 2);
  band.quadraticCurveTo(x, y - h / 2 + sag * 2, r, y - h / 2);
  band.lineTo(r, y + h / 2);
  band.quadraticCurveTo(x, y + h / 2 + sag * 2, l, y + h / 2);
  band.closePath();
  const bg = g.createLinearGradient(0, y - h / 2, 0, y + h / 2 + sag);
  bg.addColorStop(0, '#f3e3bb');
  bg.addColorStop(1, '#d9bc82');
  g.fillStyle = bg;
  g.fill(band);
  g.stroke(band);
  g.fillStyle = 'rgba(56, 32, 12, 0.9)';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name, x, y + sag * 0.9 + 1);
  g.font = 'italic 500 12.5px Georgia, serif';
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(240, 225, 186, 0.85)';
  g.strokeText('Here lies the plunder', x, y + h / 2 + sag + 17);
  g.fillStyle = 'rgba(70, 40, 14, 0.9)';
  g.fillText('Here lies the plunder', x, y + h / 2 + sag + 17);
  g.restore();
}
