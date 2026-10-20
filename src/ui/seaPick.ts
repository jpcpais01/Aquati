import './seaPick.css';
import type { RegionId } from '../world/regions';

// "Where shall we sail?": the card picker between Set Sail and the voyage.
// One card per archipelago, each with a little painted chart of its isles,
// made from the live terrain the first time it's needed (so it always matches
// the sea you'll actually sail). One tap on a card weighs anchor there.

export const START_SEA_KEY = 'aquati.startSea';

export function readStartSea(): RegionId {
  try {
    return localStorage.getItem(START_SEA_KEY) === 'brumas' ? 'brumas' : 'home';
  } catch {
    return 'home';
  }
}

function saveStartSea(id: RegionId) {
  try {
    localStorage.setItem(START_SEA_KEY, id);
  } catch {
    /* private mode */
  }
}

export interface SeaCard {
  id: RegionId;
  name: string;
  motto: string;
  vibe: string;
  /** Short facts under the vibe line. */
  chips: string[];
  /** Islands' centres and radii (for framing the painted chart). */
  isles: { x: number; z: number; r: number }[];
  /** Where you'll weigh anchor, in world metres (the pin on the chart). */
  berth: { x: number; z: number };
  style: 'home' | 'brumas';
}

const ART_W = 520;
const ART_H = 300;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// the painted palette: turquoise shallows into a deep ink-blue, warm sand,
// soft toy-like hillsides (the mist isles in jade under pale limestone)
const SEA = {
  surf: [196, 255, 246],
  shallow: [104, 232, 218],
  lagoon: [38, 186, 190],
  deep: [16, 104, 148],
  abyss: [8, 50, 92],
};
const LAND = {
  home: { sand: [246, 228, 182], low: [124, 196, 92], mid: [58, 146, 76], rock: [150, 132, 112], peak: [214, 204, 186] },
  brumas: { sand: [236, 228, 210], low: [92, 176, 132], mid: [44, 128, 104], rock: [196, 204, 190], peak: [236, 240, 230] },
};

/** Frames a card's isles in the art's aspect (world rect: x0, z0, metres per pixel). */
function frame(card: SeaCard) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const i of card.isles) {
    x0 = Math.min(x0, i.x - i.r);
    x1 = Math.max(x1, i.x + i.r);
    z0 = Math.min(z0, i.z - i.r);
    z1 = Math.max(z1, i.z + i.r);
  }
  for (const p of [card.berth]) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    z0 = Math.min(z0, p.z);
    z1 = Math.max(z1, p.z);
  }
  const pad = 90;
  const w = x1 - x0 + pad * 2;
  const h = z1 - z0 + pad * 2;
  const mpp = Math.max(w / ART_W, h / ART_H);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  return { x0: cx - (ART_W * mpp) / 2, z0: cz - (ART_H * mpp) / 2, mpp };
}

/** Paints one archipelago as a little illustrated chart. */
function paint(card: SeaCard, heightAt: (x: number, z: number) => number) {
  const f = frame(card);
  const W = ART_W;
  const H = ART_H;
  const hs = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) hs[j * W + i] = heightAt(f.x0 + (i + 0.5) * f.mpp, f.z0 + (j + 0.5) * f.mpp);
  const at = (i: number, j: number) => hs[Math.min(H - 1, Math.max(0, j)) * W + Math.min(W - 1, Math.max(0, i))];
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const pal = LAND[card.style];
  // the land's shadow falls on the water to the south-east, a few metres' worth
  const sh = Math.max(1, Math.round(9 / f.mpp));
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const h = at(i, j);
      let col: number[];
      if (h <= 0) {
        const d = -h;
        col = d < 2.5 ? mix(SEA.shallow, SEA.lagoon, smooth(0, 2.5, d)) : d < 12 ? mix(SEA.lagoon, SEA.deep, smooth(2.5, 12, d)) : mix(SEA.deep, SEA.abyss, smooth(12, 40, d));
        // a ring of surf where the sea meets the sand
        col = mix(col, SEA.surf, (1 - smooth(0, 1.1, d)) * 0.75);
        // a soft shadow of the isle on the shallows
        const sx = at(i - sh, j - sh);
        if (sx > 0.5) col = mix(col, [10, 60, 80], 0.22 * smooth(0.5, 6, sx));
        // a gentle ripple across the open water
        const rip = Math.sin(i * 0.31 + Math.sin(j * 0.11) * 3) * Math.sin(j * 0.23 + i * 0.05);
        const k = 1 + rip * 0.035 * smooth(1, 8, d);
        col = [col[0] * k, col[1] * k, col[2] * k];
      } else {
        // hillshade lit from the north-west, soft like a painted toy
        const dx = (at(i + 1, j) - at(i - 1, j)) / (2 * f.mpp);
        const dz = (at(i, j + 1) - at(i, j - 1)) / (2 * f.mpp);
        const lit = Math.max(0.62, Math.min(1.28, 1 - (dx + dz) * 0.42));
        let base = h < 1.3 ? pal.sand : mix(pal.low, pal.mid, smooth(2, 24, h));
        if (h >= 1.3) base = mix(base, pal.rock, smooth(26, 50, h));
        if (h >= 1.3) base = mix(base, pal.peak, smooth(52, 80, h));
        if (h < 2.2 && h >= 1.3) base = mix(pal.sand, base, smooth(1.3, 2.2, h));
        col = [base[0] * lit, base[1] * lit, base[2] * lit];
        // an inked coastline, light as a pencil
        if (at(i + 1, j) <= 0 || at(i - 1, j) <= 0 || at(i, j + 1) <= 0 || at(i, j - 1) <= 0) col = mix(col, [120, 100, 70], 0.35);
      }
      const o = (j * W + i) * 4;
      img.data[o] = col[0];
      img.data[o + 1] = col[1];
      img.data[o + 2] = col[2];
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // the mist isles sit in their fog
  if (card.style === 'brumas') {
    let seed = 4111;
    const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let n = 0; n < 26; n++) {
      const x = rnd() * W;
      const y = rnd() * H;
      const r = 30 + rnd() * 70;
      const fog = g.createRadialGradient(x, y, 0, x, y, r);
      fog.addColorStop(0, 'rgba(236, 244, 244, 0.32)');
      fog.addColorStop(1, 'rgba(236, 244, 244, 0)');
      g.fillStyle = fog;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  const px = ((card.berth.x - f.x0) / f.mpp / W) * 100;
  const py = ((card.berth.z - f.z0) / f.mpp / H) * 100;
  return { url: c.toDataURL('image/jpeg', 0.9), pin: [px, py] as [number, number] };
}

const ANCHOR = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V20M7 11h10M4.5 13.5c0 4 3.4 6.5 7.5 6.5s7.5-2.5 7.5-6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

export class SeaPick {
  private el = document.createElement('div');
  private art = new Map<RegionId, { url: string; pin: [number, number] }>();
  private choose: ((id: RegionId) => void) | null = null;
  private cancel: (() => void) | null = null;
  private busy = false;
  onClick: () => void = () => {};

  constructor() {
    this.el.id = 'seapick';
    this.el.className = 'hidden';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Choose where to set sail');
    document.body.appendChild(this.el);
    addEventListener('keydown', (e) => this.onKey(e), true);
  }

  get isOpen() {
    return !this.el.classList.contains('hidden');
  }

  /** Paints the charts ahead of time (cheap, but best done before the first tap). */
  prepare(cards: SeaCard[], heightAt: (x: number, z: number) => number) {
    for (const c of cards) if (!this.art.has(c.id)) this.art.set(c.id, paint(c, heightAt));
  }

  open(cards: SeaCard[], heightAt: (x: number, z: number) => number, choose: (id: RegionId) => void, cancel: () => void) {
    this.prepare(cards, heightAt);
    this.choose = choose;
    this.cancel = cancel;
    this.busy = false;
    const def = readStartSea();
    const remembered = (() => {
      try {
        return localStorage.getItem(START_SEA_KEY) !== null;
      } catch {
        return false;
      }
    })();
    this.el.innerHTML = `
      <div class="sp-head">
        <div class="sp-kicker">Choose your waters</div>
        <h2 class="sp-title">Where shall we sail?</h2>
      </div>
      <div class="sp-cards">${cards
        .map((c, n) => {
          const a = this.art.get(c.id)!;
          const isDef = c.id === def;
          const tag = isDef ? (remembered ? 'Last voyage' : 'Start here') : '';
          return `<button class="sp-card sp-${c.style}${isDef ? ' def' : ''}" data-sea="${c.id}" style="--d:${n * 0.08}s" aria-label="Set sail in ${c.name}, ${c.motto}">
            <span class="sp-art" style="background-image:url(${a.url})">
              <span class="sp-mist"></span>
              <span class="sp-pin" style="--px:${a.pin[0].toFixed(1)};--py:${a.pin[1].toFixed(1)}"><i></i>${ANCHOR}</span>
              ${tag ? `<span class="sp-tag">${tag}</span>` : ''}
              <kbd class="sp-key">${n + 1}</kbd>
            </span>
            <span class="sp-body">
              <span class="sp-name">${c.name}</span>
              <span class="sp-motto">${c.motto}</span>
              <span class="sp-vibe">${c.vibe}</span>
              <span class="sp-chips">${c.chips.map((t) => `<span${t.startsWith('+') ? ' class="gold"' : ''}>${t}</span>`).join('')}</span>
              <span class="sp-go">Set sail here</span>
            </span>
          </button>`;
        })
        .join('')}</div>
      <button class="sp-back" data-back>Back to harbour <kbd>Esc</kbd></button>`;
    this.el.querySelectorAll<HTMLButtonElement>('.sp-card').forEach((b) => b.addEventListener('click', () => this.pick(b.dataset.sea as RegionId)));
    this.el.querySelector('[data-back]')!.addEventListener('click', () => this.close(true));
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.close(true);
    });
    this.el.classList.remove('hidden', 'chosen');
    this.el.querySelector<HTMLElement>('.sp-card.def')?.focus({ preventScroll: true });
  }

  private pick(id: RegionId) {
    if (this.busy || !this.choose) return;
    this.busy = true;
    this.onClick();
    saveStartSea(id);
    this.el.classList.add('chosen');
    this.el.querySelector(`[data-sea="${id}"]`)?.classList.add('picked');
    const go = this.choose;
    // a beat for the chosen card to glow, then away
    setTimeout(() => {
      this.el.classList.add('hidden');
      go(id);
    }, 260);
  }

  close(back: boolean) {
    if (!this.isOpen || this.busy) return;
    this.el.classList.add('hidden');
    if (back) {
      this.onClick();
      this.cancel?.();
    }
  }

  private onKey(e: KeyboardEvent) {
    if (!this.isOpen || e.repeat) return;
    const k = e.key.toLowerCase();
    // Enter on the Back button is the Back button's
    if ((k === 'enter' || k === ' ') && (document.activeElement as HTMLElement | null)?.matches('[data-back]')) return;
    const btns = [...this.el.querySelectorAll<HTMLButtonElement>('.sp-card')];
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    let used = true;
    if (k === 'escape') this.close(true);
    else if (k >= '1' && k <= String(btns.length)) this.pick(btns[+k - 1].dataset.sea as RegionId);
    else if (k === 'arrowleft' || k === 'arrowup' || k === 'a' || k === 'w') btns[(Math.max(0, i) + btns.length - 1) % btns.length]?.focus();
    else if (k === 'arrowright' || k === 'arrowdown' || k === 'd' || k === 's') btns[(i + 1) % btns.length]?.focus();
    else if (k === 'enter' || k === ' ') {
      const b = i >= 0 ? btns[i] : this.el.querySelector<HTMLButtonElement>('.sp-card.def');
      if (b) this.pick(b.dataset.sea as RegionId);
      else used = false;
    } else used = false;
    if (used) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }
}
