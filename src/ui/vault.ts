import './vault.css';
import {
  ALL, EPIC_PITY, HARD_PITY, Item, KIND_NAMES, ODDS, POOL, PULL_COST, PullResult, Rarity, RARITIES, SKINS, TEN_COST, VaultStore, CosmeticKind,
} from '../ships/cosmetics';
import { itemCanvas } from './swatch';

// The Treasure Vault. The chest itself is a real 3D chest out on the sea
// beside your ship (see game/vaultStage); this is everything drawn over it:
// the purse, the buttons, the cards that fly out of the chest's mouth, and
// the showcase where your ship tries on what you found.

export interface VaultSounds {
  click(): void;
  rumble(level: number): void;
  burst(tier: number): void;
  flip(tier: number): void;
  coin(): void;
}

export type VaultShot = 'home' | 'charge' | 'burst' | 'cards';

/** What the overlay asks of the 3D stage. */
export interface VaultStageLink {
  charge(tier: number): void;
  burst(tier: number): void;
  pulse(tier: number): void;
  settle(): void;
  focus(shot: VaultShot): void;
  /** Dress your ship in an item to show it off, or null to put her back as she was. */
  preview(it: Item | null): void;
  /** The chest's mouth on screen (CSS px). */
  chestPoint(): { x: number; y: number };
}

type View = 'home' | 'opening' | 'reveal' | 'show' | 'coll';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

const fmt = (n: number) => n.toLocaleString('en-US');
const gems = (r: number) => `<span class="vc-gems">${'<i></i>'.repeat(r + 1)}</span>`;

const LOCK = '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const ARROW_L = '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>';
const ARROW_R = '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>';

/** The back of every card: a gilded compass rose on deep-sea lacquer. */
const CARD_BACK = `<svg viewBox="0 0 120 168" aria-hidden="true">
  <defs>
    <linearGradient id="vcGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b5"/><stop offset=".5" stop-color="#e9b552"/><stop offset="1" stop-color="#9c6418"/></linearGradient>
  </defs>
  <g fill="none" stroke="url(#vcGold)" stroke-linecap="round">
    <rect x="7" y="7" width="106" height="154" rx="9" stroke-width="1.6"/>
    <rect x="12" y="12" width="96" height="144" rx="6" stroke-width=".8" stroke-dasharray="2 3" opacity=".7"/>
    <circle cx="60" cy="84" r="34" stroke-width="1.4"/>
    <circle cx="60" cy="84" r="27" stroke-width=".7" opacity=".7"/>
    <circle cx="60" cy="84" r="44" stroke-width=".6" opacity=".45"/>
    ${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M60 ${84 - (a % 90 ? 30 : 41)} L${a % 90 ? 62.5 : 64} 84 L60 ${84 + 4} L${a % 90 ? 57.5 : 56} 84 Z" transform="rotate(${a} 60 84)" fill="url(#vcGold)" fill-opacity="${a % 90 ? 0.45 : 0.9}" stroke-width=".6"/>`).join('')}
    <circle cx="60" cy="84" r="4" fill="url(#vcGold)"/>
    ${[[20, 20], [100, 20], [20, 148], [100, 148]].map(([x, y]) => `<path d="M${x - 5} ${y} L${x} ${y - 5} L${x + 5} ${y} L${x} ${y + 5} Z" fill="url(#vcGold)" stroke-width=".5"/>`).join('')}
  </g>
</svg>`;

interface Mote {
  x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; kind: 0 | 2; rot: number; spin: number;
}

/** Full-screen 2D sparks and coins over the cards. */
class Sparkles {
  readonly c = el('canvas', 'vt-fx');
  private g = this.c.getContext('2d')!;
  private ms: Mote[] = [];
  private dpr = 1;
  private last = 0;
  private running = false;

  resize() {
    this.dpr = Math.min(devicePixelRatio || 1, 1.5);
    this.c.width = Math.round(innerWidth * this.dpr);
    this.c.height = Math.round(innerHeight * this.dpr);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.resize();
    this.last = performance.now();
    const tick = () => {
      if (!this.running) return;
      this.frame();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    this.ms.length = 0;
    this.g.clearRect(0, 0, this.c.width, this.c.height);
  }

  burst(x: number, y: number, color: string, n: number, coins = 0, speed = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (120 + Math.random() * 480) * speed;
      this.ms.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, life: 0, max: 0.5 + Math.random() * 0.8, size: 1.4 + Math.random() * 2.8, color, kind: 0, rot: 0, spin: 0 });
    }
    for (let i = 0; i < coins; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
      const sp = 300 + Math.random() * 520;
      this.ms.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 1.3 + Math.random() * 0.7, size: 5 + Math.random() * 4, color: '#f6c766', kind: 2, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 18 });
    }
  }

  private frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const g = this.g;
    const d = this.dpr;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    if (!this.ms.length) return;
    g.globalCompositeOperation = 'lighter';
    for (let i = this.ms.length - 1; i >= 0; i--) {
      const m = this.ms[i];
      m.life += dt;
      if (m.life >= m.max) {
        this.ms.splice(i, 1);
        continue;
      }
      const t = m.life / m.max;
      if (m.kind === 0) {
        m.vx *= Math.exp(-2.4 * dt);
        m.vy = m.vy * Math.exp(-2.4 * dt) + 260 * dt;
      } else {
        m.vy += 900 * dt;
        m.rot += m.spin * dt;
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      const a = 1 - t * t;
      if (m.kind === 2) {
        g.globalCompositeOperation = 'source-over';
        g.save();
        g.translate(m.x, m.y);
        g.scale(Math.cos(m.rot), 1);
        const cg = g.createRadialGradient(-m.size * 0.3, -m.size * 0.3, 0, 0, 0, m.size);
        cg.addColorStop(0, '#fff6cf');
        cg.addColorStop(0.5, '#f1c35c');
        cg.addColorStop(1, '#a86b1c');
        g.globalAlpha = a;
        g.fillStyle = cg;
        g.beginPath();
        g.arc(0, 0, m.size, 0, 6.283);
        g.fill();
        g.restore();
        g.globalCompositeOperation = 'lighter';
        continue;
      }
      g.globalAlpha = a;
      g.fillStyle = m.color;
      g.beginPath();
      g.arc(m.x, m.y, m.size * (1 - t * 0.6), 0, 6.283);
      g.fill();
      if (m.size > 3) {
        g.fillRect(m.x - m.size * 3, m.y - 0.6, m.size * 6, 1.2);
        g.fillRect(m.x - 0.6, m.y - m.size * 3, 1.2, m.size * 6);
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
}

type CardEl = HTMLElement & { result?: PullResult; item: Item };

export class Vault {
  readonly root = el('div', 'vt hidden');
  onClose: () => void = () => {};
  onEquip: (it: Item) => void = () => {};
  sounds: VaultSounds = { click() {}, rumble() {}, burst() {}, flip() {}, coin() {} };
  stage: VaultStageLink = { charge() {}, burst() {}, pulse() {}, settle() {}, focus() {}, preview() {}, chestPoint: () => ({ x: innerWidth / 2, y: innerHeight / 2 }) };
  private fx = new Sparkles();
  private view: View = 'home';
  private purseEl = el('b');
  private dock = el('aside', 'vt-dock');
  private hot = el('button', 'vt-hot');
  private hotLabel = el('div', 'vt-hot-label');
  private skipEl = el('div', 'vt-skip', 'Tap to skip');
  private reveal = el('section', 'vt-reveal');
  private cards = el('div', 'vt-cards');
  private revealFoot = el('footer', 'vt-reveal-foot');
  private show = el('section', 'vt-show');
  private coll = el('section', 'vt-coll');
  private odds = el('div', 'vt-sheet hidden');
  private flash = el('div', 'vt-flash');
  private pityEl = el('div', 'vt-pity');
  private buyOne = el('button', 'btn vt-buy-one');
  private buyTen = el('button', 'btn gold vt-buy-ten');
  private collBtn = el('button', 'vt-link');
  private busy = false;
  private skip = false;
  private skipWait: (() => void) | null = null;
  private lastN: 1 | 10 = 1;
  private collKind: CosmeticKind = 'skin';
  private results: PullResult[] = [];
  private showList: Item[] = [];
  private showIdx = 0;
  private showFrom: 'reveal' | 'coll' = 'reveal';
  private hotSeen = false;

  constructor(readonly store: VaultStore) {
    this.root.id = 'vault';
    const head = el('header', 'vt-head');
    const back = el('button', 'sw-back vt-back', '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>');
    back.title = 'Back';
    back.addEventListener('click', (e) => {
      e.stopPropagation();
      this.back();
    });
    const titles = el('div', 'vt-titles', '<small class="vt-kicker">Pearls of the deep</small><h1>Treasure Vault</h1>');
    const purse = el('div', 'vt-purse');
    purse.title = 'Your gold. Every coin you win at sea lands here.';
    purse.append(el('span', 'vt-coin'), this.purseEl);
    head.append(back, titles, purse);

    // home: the buttons, docked beside the chest
    this.buyOne.addEventListener('click', () => this.buy(1));
    this.buyTen.addEventListener('click', () => this.buy(10));
    const buys = el('div', 'vt-buys');
    buys.append(this.buyOne, this.buyTen);
    const links = el('div', 'vt-links');
    this.collBtn.addEventListener('click', () => this.showCollection());
    const oddsBtn = el('button', 'vt-link', 'Odds &amp; rules');
    oddsBtn.addEventListener('click', () => this.showOdds(true));
    links.append(this.collBtn, oddsBtn);
    this.dock.append(el('div', 'vt-dock-kicker', 'Sea chest'), this.pityEl, buys, links);

    // the chest out on the water is the big button
    this.hot.setAttribute('aria-label', 'Open the chest');
    this.hot.addEventListener('click', () => {
      if (!this.busy) this.buy(1);
    });

    this.reveal.append(this.cards, this.revealFoot);
    this.root.append(el('div', 'vt-shade'), this.hot, this.hotLabel, this.fx.c, head, this.dock, this.reveal, this.show, this.coll, this.skipEl, this.odds, this.flash);
    document.body.appendChild(this.root);

    // tap anywhere during the opening to get straight to the cards
    this.root.addEventListener('pointerdown', () => {
      if (this.busy) this.fastForward();
    });
    addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        this.back();
      } else if (e.key === ' ' && this.busy) {
        e.preventDefault();
        this.fastForward();
      } else if (this.view === 'show' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) this.step(e.key === 'ArrowLeft' ? -1 : 1);
    });
    addEventListener('resize', () => this.isOpen && this.fx.resize());
    store.subscribe(() => this.sync());
    this.sync();
    this.setView('home');
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }

  open() {
    this.root.classList.remove('hidden');
    this.fx.start();
    this.hotSeen = false;
    this.showHome();
    this.sync();
  }

  close() {
    this.root.classList.add('hidden');
    this.fx.stop();
    this.cards.innerHTML = '';
    this.show.innerHTML = '';
    this.coll.innerHTML = '';
    this.busy = false;
  }

  /**
   * The part of the screen the 3D scene should be framed into (CSS px), clear
   * of whichever panel is up.
   */
  freeRect() {
    const W = innerWidth;
    const H = innerHeight;
    const r = { left: 0, top: 0, right: W, bottom: H };
    const panel = this.view === 'home' ? this.dock : this.view === 'show' ? this.show.querySelector<HTMLElement>('.vt-show-panel') : null;
    if (!panel) return r;
    const b = panel.getBoundingClientRect();
    if (!b.width) return r;
    if (b.left > W * 0.45) r.right = b.left;
    else if (b.right < W * 0.55) r.left = b.right;
    else if (b.top > H * 0.35) r.bottom = b.top;
    return r;
  }

  /** The chest's outline on screen, from the stage; the tap target follows it. */
  placeChest(rect: { x: number; y: number; w: number; h: number } | null) {
    const on = !!rect && this.view === 'home' && rect.w > 8;
    this.hot.classList.toggle('on', on);
    this.hotLabel.classList.toggle('on', on && this.store.canAfford(1));
    if (!on) return;
    const pad = 12;
    this.hot.style.transform = `translate(${rect!.x - pad}px, ${rect!.y - pad}px)`;
    this.hot.style.width = `${rect!.w + pad * 2}px`;
    this.hot.style.height = `${rect!.h + pad * 2}px`;
    this.hotLabel.style.transform = `translate(${rect!.x + rect!.w / 2}px, ${rect!.y - 14}px)`;
    if (!this.hotSeen) {
      this.hotSeen = true;
      this.hotLabel.classList.add('enter');
    }
  }

  private setView(v: View) {
    this.view = v;
    this.root.dataset.view = v;
  }

  private back() {
    if (this.busy) {
      this.fastForward();
      return;
    }
    this.sounds.click();
    if (!this.odds.classList.contains('hidden')) this.showOdds(false);
    else if (this.view === 'show') this.leaveShow();
    else if (this.view === 'coll' || this.view === 'reveal') this.showHome();
    else this.onClose();
  }

  // ---------------------------------------------------------------- home

  private showHome() {
    this.setView('home');
    this.cards.innerHTML = '';
    this.show.innerHTML = '';
    this.coll.innerHTML = '';
    this.odds.classList.add('hidden');
    this.stage.preview(null);
    this.stage.settle();
    this.stage.focus('home');
    this.root.style.removeProperty('--rc');
  }

  private sync() {
    const s = this.store;
    this.purseEl.textContent = fmt(s.purse);
    const p = s.pity;
    const k = (HARD_PITY - p.legendary) / HARD_PITY;
    this.pityEl.innerHTML = `
      <div class="vt-pity-row"><span>Legendary within</span><b>${p.legendary} open${p.legendary === 1 ? '' : 's'}</b></div>
      <div class="vt-meter"><i style="width:${(k * 100).toFixed(1)}%"></i></div>
      <div class="vt-pity-row sub"><span>Epic or better within</span><b>${p.epic}</b></div>`;
    const free = s.freeReady;
    this.buyOne.innerHTML = free
      ? '<span class="vt-bl">Open ×1</span><span class="vt-free">Free today</span>'
      : `<span class="vt-bl">Open ×1</span><span class="vt-cost"><i class="vt-coin"></i>${fmt(PULL_COST)}</span>`;
    this.buyOne.classList.toggle('free', free);
    this.buyTen.innerHTML = `<span class="vt-bl">Open ×10</span><span class="vt-cost"><i class="vt-coin"></i>${fmt(TEN_COST)}</span><em>Epic inside</em>`;
    this.buyOne.disabled = !s.canAfford(1);
    this.buyTen.disabled = !s.canAfford(10);
    this.collBtn.innerHTML = `Collection <b>${s.collected()}/${POOL.length}</b>`;
    this.hotLabel.innerHTML = s.canAfford(1) ? `<div class="vt-pill">${free ? '<b>Free chest</b><span>Tap to open</span>' : '<b>Tap to open</b>'}</div>` : '';
    this.root.querySelectorAll<HTMLButtonElement>('[data-equip]').forEach((b) => this.syncEquip(b));
  }

  // ---------------------------------------------------------------- opening

  private buy(n: 1 | 10) {
    if (this.busy) return;
    const res = this.store.pull(n);
    if (!res) {
      this.sounds.click();
      const b = n === 10 ? this.buyTen : this.buyOne;
      b.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 260 });
      return;
    }
    this.lastN = n;
    void this.play(res);
  }

  private wait(ms: number) {
    if (this.skip) return Promise.resolve();
    return new Promise<void>((r) => {
      const t = setTimeout(() => {
        this.skipWait = null;
        r();
      }, ms);
      this.skipWait = () => {
        clearTimeout(t);
        this.skipWait = null;
        r();
      };
    });
  }

  private fastForward() {
    this.skip = true;
    this.skipWait?.();
  }

  private tint(t: number) {
    this.root.style.setProperty('--rc', RARITIES[t].css);
    this.root.style.setProperty('--rd', RARITIES[t].deep);
  }

  private async play(res: PullResult[]) {
    this.busy = true;
    this.skip = false;
    this.cards.innerHTML = '';
    this.show.innerHTML = '';
    this.coll.innerHTML = '';
    this.setView('opening');
    this.stage.preview(null);
    const top = Math.max(...res.map((r) => r.item.rarity)) as Rarity;
    // the chest wakes and its light climbs through the rarities inside
    this.stage.settle();
    this.stage.focus('charge');
    this.tint(0);
    this.stage.charge(0);
    this.sounds.rumble(0);
    await this.wait(950);
    for (let t = 1; t <= top; t++) {
      if (this.skip) break;
      this.tint(t);
      this.stage.charge(t);
      this.sounds.rumble(t);
      this.pulse(t, false);
      await this.wait(t === 3 ? 1150 : 850);
    }
    // burst open
    this.tint(top);
    this.stage.focus('burst');
    this.stage.burst(top);
    this.sounds.burst(top);
    this.pulse(top, true);
    const p = this.stage.chestPoint();
    this.fx.burst(p.x, p.y, RARITIES[top].css, 30 + top * 20, 0, 0.8);
    await this.wait(top === 3 ? 1800 : top === 2 ? 1400 : 1100);
    this.skip = false;
    this.busy = false;
    this.stage.focus('cards');
    this.deal(res);
  }

  private pulse(tier: number, big: boolean) {
    const p = this.stage.chestPoint();
    this.flash.style.setProperty('--fx', `${p.x}px`);
    this.flash.style.setProperty('--fy', `${p.y}px`);
    this.flash.classList.remove('on', 'big');
    void this.flash.offsetWidth;
    this.flash.classList.add('on');
    if (big) this.flash.classList.add('big');
    if (big && tier === 3) {
      this.root.classList.remove('quake');
      void this.root.offsetWidth;
      this.root.classList.add('quake');
    }
  }

  // ---------------------------------------------------------------- cards

  private deal(res: PullResult[]) {
    this.results = res;
    this.setView('reveal');
    this.cards.innerHTML = '';
    this.cards.dataset.n = String(res.length);
    const els = res.map((r) => this.card(r.item, { result: r }));
    els.forEach((c) => this.cards.appendChild(c));
    // fly out of the chest's mouth into place
    const from = this.stage.chestPoint();
    els.forEach((c, i) => {
      const b = c.getBoundingClientRect();
      const dx = from.x - (b.left + b.width / 2);
      const dy = from.y - (b.top + b.height / 2);
      const spin = (i % 2 ? 1 : -1) * (14 + (i % 3) * 8);
      c.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(0.12) rotate(${spin}deg)`, opacity: 0 },
          { opacity: 1, offset: 0.18 },
          { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 60}px) scale(0.8) rotate(${-spin * 0.4}deg)`, offset: 0.55 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 760, delay: 80 + i * 85, easing: 'cubic-bezier(.25,.8,.3,1.05)', fill: 'backwards' },
      );
    });
    this.renderRevealFoot();
    // a single card turns itself over once it lands, then shows itself off
    if (res.length === 1) {
      setTimeout(() => {
        if (this.view !== 'reveal' || !els[0].isConnected) return;
        this.flip(els[0]);
        setTimeout(() => {
          if (this.view === 'reveal' && els[0].isConnected) this.openShow([res[0].item], 0, 'reveal');
        }, res[0].item.rarity >= 2 ? 1500 : 1100);
      }, 950);
    }
  }

  /** A card. Revealed cards (and every collection card) are open; draws are face down. */
  private card(it: Item, o: { result?: PullResult; open?: boolean; mini?: boolean; locked?: boolean } = {}): CardEl {
    const R = RARITIES[it.rarity];
    const c = el('div', `vc r${it.rarity}` + (o.open ? ' open' : '') + (o.mini ? ' mini' : '') + (o.locked ? ' locked' : '')) as unknown as CardEl;
    c.item = it;
    c.result = o.result;
    c.style.setProperty('--rc', R.css);
    c.style.setProperty('--rd', R.deep);
    const tilt = el('div', 'vc-tilt');
    const inner = el('div', 'vc-in');
    if (!o.open) {
      const back = el('div', 'vc-face vc-back', `<div class="vc-back-art">${CARD_BACK}</div><i class="vc-sheen"></i>`);
      inner.appendChild(back);
    }
    const front = el('div', 'vc-face vc-front');
    const frame = el('div', 'vc-frame');
    const art = el('div', 'vc-art');
    art.appendChild(itemCanvas(it, o.mini ? 150 : 200, o.mini ? 150 : 200, '', 'card'));
    if (o.locked) art.appendChild(el('span', 'vc-lock', LOCK));
    const plate = el('div', 'vc-plate', `<small>${KIND_NAMES[it.kind]}</small><b>${it.name}</b><span class="vc-rar">${gems(it.rarity)}${R.name}</span>`);
    frame.append(art, plate, el('i', 'vc-foil'), el('i', 'vc-glare'));
    front.appendChild(frame);
    if (o.result) front.appendChild(el('span', 'vc-badge ' + (o.result.fresh ? 'new' : 'dup'), o.result.fresh ? 'New' : `+${fmt(o.result.refund)} gold`));
    else if (!o.locked && this.store.count(it.id) > 1) front.appendChild(el('span', 'vc-badge dup', `×${this.store.count(it.id)}`));
    if (!o.locked && this.store.equipped[it.kind] === it.id) front.appendChild(el('span', 'vc-badge eq', 'Equipped'));
    inner.appendChild(front);
    tilt.appendChild(inner);
    c.appendChild(tilt);
    this.tilt(c, tilt);
    c.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.busy) return;
      if (!c.classList.contains('open')) this.flip(c);
      else if (this.view === 'reveal') {
        this.sounds.click();
        const list = this.results.map((r) => r.item);
        this.openShow(list, this.results.findIndex((r) => r === c.result), 'reveal');
      } else if (this.view === 'coll') {
        this.sounds.click();
        const list = [...this.coll.querySelectorAll<CardEl>('.vc')].map((x) => x.item);
        this.openShow(list, list.indexOf(it), 'coll');
      }
    });
    return c;
  }

  /** The card leans toward the pointer, and its foil catches the light where you point. */
  private tilt(c: HTMLElement, t: HTMLElement) {
    if (matchMedia('(hover: none)').matches) return;
    c.addEventListener('pointermove', (e) => {
      const b = c.getBoundingClientRect();
      const x = (e.clientX - b.left) / b.width;
      const y = (e.clientY - b.top) / b.height;
      t.style.setProperty('--rx', `${((0.5 - y) * 16).toFixed(2)}deg`);
      t.style.setProperty('--ry', `${((x - 0.5) * 18).toFixed(2)}deg`);
      c.style.setProperty('--mx', x.toFixed(3));
      c.style.setProperty('--my', y.toFixed(3));
      c.classList.add('hover');
    });
    c.addEventListener('pointerleave', () => {
      t.style.removeProperty('--rx');
      t.style.removeProperty('--ry');
      c.classList.remove('hover');
    });
  }

  private flip(c: CardEl) {
    if (c.classList.contains('open')) return;
    const r = c.result;
    const tier = c.item.rarity;
    c.classList.add('open', 'pop');
    this.sounds.flip(tier);
    this.stage.pulse(tier);
    const b = c.getBoundingClientRect();
    this.fx.burst(b.left + b.width / 2, b.top + b.height / 2, RARITIES[tier].css, 14 + tier * 14, tier >= 2 ? tier * 5 : 0, 0.7 + tier * 0.15);
    if (r && !r.fresh) setTimeout(() => this.sounds.coin(), 240);
    if (tier === 3) {
      this.tint(3);
      this.pulse(3, true);
    }
    this.renderRevealFoot();
  }

  private renderRevealFoot() {
    const f = this.revealFoot;
    f.innerHTML = '';
    const hidden = [...this.cards.querySelectorAll<CardEl>('.vc:not(.open)')];
    if (hidden.length) {
      if (this.results.length > 1) {
        const all = el('button', 'btn vt-all', 'Reveal all');
        all.addEventListener('click', (e) => {
          e.stopPropagation();
          this.sounds.click();
          // the rarest last, for the drum roll
          hidden
            .sort((a, b) => a.item.rarity - b.item.rarity)
            .forEach((c, i) => setTimeout(() => this.flip(c), i * 140 + (c.item.rarity === 3 ? 380 : 0)));
        });
        f.appendChild(all);
      }
      return;
    }
    if (this.results.length > 1) f.appendChild(el('div', 'vt-reveal-tip', 'Tap a card to see it on your ship'));
    const row = el('div', 'vt-reveal-row');
    const again = el('button', 'btn gold vt-again', this.lastN === 10 ? `Open ×10 · <i class="vt-coin"></i>${fmt(TEN_COST)}` : this.store.freeReady ? 'Open again · Free' : `Open again · <i class="vt-coin"></i>${fmt(PULL_COST)}`);
    again.disabled = !this.store.canAfford(this.lastN);
    again.addEventListener('click', (e) => {
      e.stopPropagation();
      this.buy(this.lastN);
    });
    const done = el('button', 'btn vt-done', 'Done');
    done.addEventListener('click', (e) => {
      e.stopPropagation();
      this.sounds.click();
      this.showHome();
    });
    row.append(done, again);
    f.appendChild(row);
  }

  // ---------------------------------------------------------------- showcase

  private openShow(list: Item[], i: number, from: 'reveal' | 'coll') {
    this.showList = list;
    this.showIdx = Math.max(0, i);
    this.showFrom = from;
    this.setView('show');
    this.renderShow();
  }

  private step(d: number) {
    if (this.showList.length < 2) return;
    this.sounds.click();
    this.showIdx = (this.showIdx + d + this.showList.length) % this.showList.length;
    this.renderShow();
  }

  private renderShow() {
    const it = this.showList[this.showIdx];
    const R = RARITIES[it.rarity];
    const owned = this.store.owns(it.id);
    const res = this.showFrom === 'reveal' ? this.results.find((r) => r.item === it) : undefined;
    this.show.innerHTML = '';
    this.root.style.setProperty('--rc', R.css);
    this.root.style.setProperty('--rd', R.deep);
    const panel = el('div', 'vt-show-panel');
    const card = this.card(it, { open: true, result: res, locked: !owned });
    card.classList.add('big');
    const info = el('div', 'vt-show-info');
    const what = it.kind === 'skin' ? 'Your ship is wearing it now' : it.kind === 'blast' ? 'Watch your broadside: this is the blast' : 'Watch the shots fly: this is the trail';
    info.innerHTML = `<small class="vt-show-kind" style="color:${R.css}">${R.name} · ${KIND_NAMES[it.kind]}${it.rarity === 3 && it.kind === 'skin' ? ' · Animated' : ''}</small><h2>${it.name}</h2><p>${it.blurb}</p><p class="vt-show-live"><i></i>${what}</p>`;
    const acts = el('div', 'vt-show-acts');
    if (owned) {
      const eq = el('button', 'btn gold vt-equip');
      eq.dataset.equip = it.id;
      this.syncEquip(eq);
      eq.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.store.equipped[it.kind] === it.id) return;
        this.sounds.click();
        this.store.equip(it.id);
        this.onEquip(it);
        this.renderShow();
      });
      acts.appendChild(eq);
    } else {
      acts.appendChild(el('div', 'vt-show-locked', `${LOCK}<span>Not found yet. It waits in the chest.</span>`));
    }
    const back = el('button', 'btn vt-show-back', this.showFrom === 'reveal' ? 'Back to cards' : 'Back to collection');
    back.addEventListener('click', (e) => {
      e.stopPropagation();
      this.sounds.click();
      this.leaveShow();
    });
    acts.appendChild(back);
    info.appendChild(acts);
    if (this.showList.length > 1) {
      const nav = el('div', 'vt-show-nav');
      const prev = el('button', 'vt-arrow', ARROW_L);
      const next = el('button', 'vt-arrow', ARROW_R);
      prev.title = 'Previous';
      next.title = 'Next';
      prev.addEventListener('click', (e) => {
        e.stopPropagation();
        this.step(-1);
      });
      next.addEventListener('click', (e) => {
        e.stopPropagation();
        this.step(1);
      });
      nav.append(prev, el('span', '', `${this.showIdx + 1} / ${this.showList.length}`), next);
      info.appendChild(nav);
    }
    panel.append(card, info);
    this.show.appendChild(panel);
    card.animate([{ transform: 'translateY(16px) scale(0.94)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,.9,.25,1)' });
    this.stage.preview(it);
  }

  private leaveShow() {
    this.stage.preview(null);
    if (this.showFrom === 'reveal') {
      this.setView('reveal');
      this.stage.focus('cards');
      // equip badges may have moved
      this.cards.querySelectorAll<CardEl>('.vc').forEach((c) => {
        const eq = c.querySelector('.vc-badge.eq');
        const on = this.store.equipped[c.item.kind] === c.item.id;
        if (on && !eq) c.querySelector('.vc-front')!.appendChild(el('span', 'vc-badge eq', 'Equipped'));
        else if (!on && eq) eq.remove();
      });
    } else {
      this.setView('coll');
      this.renderCollection();
      this.stage.focus('home');
    }
    this.show.innerHTML = '';
  }

  private syncEquip(b: HTMLButtonElement) {
    const id = b.dataset.equip!;
    const it = ALL.find((x) => x.id === id);
    if (!it) return;
    const on = this.store.equipped[it.kind] === id;
    b.textContent = on ? 'Equipped' : 'Equip';
    b.classList.toggle('on', on);
  }

  // ---------------------------------------------------------------- collection

  private showCollection() {
    this.sounds.click();
    this.setView('coll');
    this.renderCollection();
  }

  private renderCollection() {
    const s = this.store;
    const c = this.coll;
    c.innerHTML = '';
    const sheet = el('div', 'vt-coll-sheet');
    const top = el('div', 'vt-coll-top');
    const k = s.collected() / POOL.length;
    top.innerHTML = `<div class="vt-coll-count"><b>${s.collected()}</b> of ${POOL.length} found<small>Tap any card to try it on your ship</small></div><div class="vt-meter"><i style="width:${(k * 100).toFixed(1)}%"></i></div>`;
    const tabs = el('nav', 'vt-tabs');
    for (const kind of ['skin', 'blast', 'trail'] as CosmeticKind[]) {
      const items = POOL.filter((i) => i.kind === kind);
      const own = items.filter((i) => s.owns(i.id)).length;
      const b = el('button', 'vt-tab' + (kind === this.collKind ? ' sel' : ''), `${KIND_NAMES[kind]}s <small>${own}/${items.length}</small>`);
      b.addEventListener('click', () => {
        this.sounds.click();
        this.collKind = kind;
        this.renderCollection();
      });
      tabs.appendChild(b);
    }
    top.appendChild(tabs);
    const grid = el('div', 'vt-grid');
    const items = ALL.filter((i) => i.kind === this.collKind).sort((a, b) => (a.base ? -1 : b.base ? 1 : b.rarity - a.rarity));
    for (const it of items) grid.appendChild(this.card(it, { open: true, mini: true, locked: !s.owns(it.id) }));
    sheet.append(top, grid);
    c.appendChild(sheet);
  }

  private showOdds(on: boolean) {
    if (!on) {
      this.odds.classList.add('hidden');
      return;
    }
    this.sounds.click();
    const count = (r: number) => POOL.filter((i) => i.rarity === r).length;
    const rows = ([3, 2, 1, 0] as Rarity[])
      .map((r) => `<tr class="r${r}" style="--rc:${RARITIES[r].css}"><td><i></i>${RARITIES[r].name}</td><td>${(ODDS[r] * 100).toFixed(1)}%</td><td>${count(r)} items</td><td>+${fmt(RARITIES[r].refund)}</td></tr>`)
      .join('');
    this.odds.innerHTML = `<div class="vt-sheet-card">
      <h2>Odds &amp; rules</h2>
      <table><thead><tr><th>Rarity</th><th>Chance</th><th>Pool</th><th>Duplicate</th></tr></thead><tbody>${rows}</tbody></table>
      <ul>
        <li>A <b>Legendary</b> is certain within ${HARD_PITY} opens, and the odds climb every open after 35.</li>
        <li>An <b>Epic or better</b> turns up at least once every ${EPIC_PITY} opens, and every ×10 holds one.</li>
        <li>Items you don't own yet are three times as likely as ones you do.</li>
        <li>Duplicates pay back gold. One chest a day is free.</li>
        <li>${SKINS.filter((x) => x.rarity === 3).length} legendary skins are alive: they move, and they glow after dark.</li>
      </ul>
      <button class="btn gold vt-ok">Got it</button></div>`;
    this.odds.querySelector('.vt-ok')!.addEventListener('click', () => this.back());
    this.odds.addEventListener('click', (e) => e.target === this.odds && this.back(), { once: true });
    this.odds.classList.remove('hidden');
  }
}
