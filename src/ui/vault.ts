import './vault.css';
import {
  ALL, EPIC_PITY, HARD_PITY, Item, KIND_NAMES, ODDS, POOL, PULL_COST, PullResult, Rarity, RARITIES, SKINS, TEN_COST, VaultStore, CosmeticKind,
} from '../ships/cosmetics';
import { itemCanvas } from './swatch';

// The Treasure Vault: an old sea chest that spits out skins and cannon
// effects. Opening one is a little show: the chest rumbles, its seam of light
// climbs through the rarities you are about to get, the lid bursts open and
// the cards fly out face down for you to turn over.

export interface VaultSounds {
  click(): void;
  rumble(level: number): void;
  burst(tier: number): void;
  flip(tier: number): void;
  coin(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

const fmt = (n: number) => n.toLocaleString('en-US');
const stars = (r: number) => '◆'.repeat(r + 1);

const LID_SVG = `<svg viewBox="0 0 240 104" aria-hidden="true">
  <defs>
    <linearGradient id="vtLidWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a4f2a"/><stop offset="0.55" stop-color="#5e3218"/><stop offset="1" stop-color="#3a1d0e"/></linearGradient>
    <linearGradient id="vtGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b5"/><stop offset="0.45" stop-color="#f1c35c"/><stop offset="1" stop-color="#a86b1c"/></linearGradient>
    <linearGradient id="vtGoldV" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a86b1c"/><stop offset="0.5" stop-color="#ffe9a6"/><stop offset="1" stop-color="#a86b1c"/></linearGradient>
  </defs>
  <path d="M14 100 C14 34 60 8 120 8 C180 8 226 34 226 100 Z" fill="url(#vtLidWood)"/>
  <path d="M30 100 C32 46 70 22 120 21 C170 22 208 46 210 100" fill="none" stroke="#2a130a" stroke-opacity=".35" stroke-width="2"/>
  <path d="M60 100 C62 58 86 34 120 33 C154 34 178 58 180 100" fill="none" stroke="#2a130a" stroke-opacity=".3" stroke-width="2"/>
  <path d="M14 100 C14 34 60 8 120 8 C180 8 226 34 226 100" fill="none" stroke="url(#vtGold)" stroke-width="7"/>
  <rect x="38" y="20" width="16" height="84" rx="4" fill="url(#vtGoldV)" transform="rotate(-24 46 60)"/>
  <rect x="186" y="20" width="16" height="84" rx="4" fill="url(#vtGoldV)" transform="rotate(24 194 60)"/>
  <rect x="110" y="6" width="20" height="98" rx="5" fill="url(#vtGoldV)"/>
  <g fill="#fff3c4">${[30, 52, 74, 96, 144, 166, 188, 210].map((x) => `<circle cx="${x}" cy="${x < 120 ? 96 - (120 - x) * 0.05 : 96 - (x - 120) * 0.05}" r="2.6"/>`).join('')}</g>
  <rect x="8" y="94" width="224" height="10" rx="4" fill="url(#vtGold)"/>
</svg>`;

const BASE_SVG = `<svg viewBox="0 0 240 120" aria-hidden="true">
  <defs>
    <linearGradient id="vtBaseWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a4424"/><stop offset="1" stop-color="#341a0c"/></linearGradient>
    <radialGradient id="vtGem" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#ffffff"/><stop offset="0.35" stop-color="var(--rc)"/><stop offset="1" stop-color="var(--rd)"/></radialGradient>
  </defs>
  <rect x="12" y="0" width="216" height="112" rx="10" fill="url(#vtBaseWood)"/>
  <g stroke="#2a130a" stroke-opacity=".35" stroke-width="2">${[26, 52, 78].map((y) => `<line x1="14" y1="${y}" x2="226" y2="${y}"/>`).join('')}</g>
  <rect x="12" y="0" width="216" height="112" rx="10" fill="none" stroke="url(#vtGold)" stroke-width="6"/>
  <rect x="38" y="0" width="16" height="112" rx="3" fill="url(#vtGoldV)"/>
  <rect x="186" y="0" width="16" height="112" rx="3" fill="url(#vtGoldV)"/>
  <rect x="8" y="98" width="224" height="14" rx="5" fill="url(#vtGold)"/>
  <g fill="#fff3c4">${[22, 64, 86, 154, 176, 218].map((x) => `<circle cx="${x}" cy="9" r="2.6"/><circle cx="${x}" cy="88" r="2.6"/>`).join('')}</g>
  <path d="M96 -2 h48 v44 q0 22 -24 30 q-24 -8 -24 -30 z" fill="url(#vtGold)" stroke="#8a5514" stroke-width="2"/>
  <circle class="vt-gem" cx="120" cy="26" r="11" fill="url(#vtGem)"/>
  <path d="M117 40 h6 l2 16 h-10 z" fill="#2a130a"/>
</svg>`;

const CARD_BACK = `<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
  <circle cx="50" cy="50" r="30" opacity=".55"/><circle cx="50" cy="50" r="38" opacity=".25"/>
  <path d="M50 14 L56 44 L86 50 L56 56 L50 86 L44 56 L14 50 L44 44 Z" fill="currentColor" fill-opacity=".14"/>
  <path d="M50 30 v40 M36 58 q14 14 28 0 M44 34 h12" opacity=".9"/></g></svg>`;

interface Mote {
  x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; kind: 0 | 1 | 2; rot: number; spin: number;
}

/** Full-screen 2D sparkle layer behind and over the cards. */
class Sparkles {
  readonly c = el('canvas', 'vt-fx');
  private g = this.c.getContext('2d')!;
  private ms: Mote[] = [];
  private amb = 0;
  private dpr = 1;
  private last = 0;
  running = false;

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
  }

  /** A burst of sparks (and coins for the good ones) at a screen point. */
  burst(x: number, y: number, color: string, n: number, coins = 0, speed = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (120 + Math.random() * 520) * speed;
      this.ms.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, life: 0, max: 0.6 + Math.random() * 0.9, size: 1.5 + Math.random() * 3, color, kind: 0, rot: 0, spin: 0 });
    }
    for (let i = 0; i < coins; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
      const sp = 300 + Math.random() * 600;
      this.ms.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 1.4 + Math.random() * 0.8, size: 5 + Math.random() * 4, color: '#f6c766', kind: 2, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 18 });
    }
  }

  private frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const W = innerWidth;
    const H = innerHeight;
    // pearls of light drifting up through the dark, as if under the sea
    this.amb += dt;
    while (this.amb > 0.12) {
      this.amb -= 0.12;
      this.ms.push({ x: Math.random() * W, y: H + 10, vx: (Math.random() - 0.5) * 10, vy: -(20 + Math.random() * 40), life: 0, max: 6 + Math.random() * 6, size: 0.8 + Math.random() * 2.2, color: Math.random() < 0.3 ? '#ffe7a8' : '#9fe8f0', kind: 1, rot: Math.random() * 6, spin: 0 });
    }
    const g = this.g;
    const d = this.dpr;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, W, H);
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
      } else if (m.kind === 2) {
        m.vy += 900 * dt;
        m.rot += m.spin * dt;
      } else {
        m.x += Math.sin(m.life * 1.3 + m.rot) * 8 * dt;
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      const a = m.kind === 1 ? Math.sin(t * Math.PI) * 0.55 : 1 - t * t;
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
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'lighter';
        continue;
      }
      g.globalAlpha = a;
      g.fillStyle = m.color;
      g.beginPath();
      g.arc(m.x, m.y, m.size * (m.kind === 0 ? 1 - t * 0.6 : 1), 0, 6.283);
      g.fill();
      if (m.kind === 0 && m.size > 3) {
        // a little four-point glint on the bigger sparks
        g.fillRect(m.x - m.size * 3, m.y - 0.6, m.size * 6, 1.2);
        g.fillRect(m.x - 0.6, m.y - m.size * 3, 1.2, m.size * 6);
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
}

export class Vault {
  readonly root = el('div', 'vt hidden');
  onClose: () => void = () => {};
  onEquip: (it: Item) => void = () => {};
  sounds: VaultSounds = { click() {}, rumble() {}, burst() {}, flip() {}, coin() {} };
  private fx = new Sparkles();
  private purseEl = el('b');
  private home = el('section', 'vt-home');
  private reveal = el('section', 'vt-reveal hidden');
  private coll = el('section', 'vt-coll hidden');
  private odds = el('div', 'vt-sheet hidden');
  private cards = el('div', 'vt-cards');
  private chest = el('div', 'vt-chest');
  private altar = el('div', 'vt-altar');
  private flash = el('div', 'vt-flash');
  private pityEl = el('div', 'vt-pity');
  private buyOne = el('button', 'btn vt-buy-one');
  private buyTen = el('button', 'btn gold vt-buy-ten');
  private collBtn = el('button', 'vt-link');
  private feature = el('aside', 'vt-feature');
  private revealFoot = el('footer', 'vt-reveal-foot');
  private busy = false;
  private skip = false;
  private skipWait: (() => void) | null = null;
  private lastN: 1 | 10 = 1;
  private collKind: CosmeticKind = 'skin';
  private featIdx = 0;
  private featTimer = 0;

  constructor(readonly store: VaultStore) {
    this.root.id = 'vault';
    const head = el('header', 'vt-head');
    const back = el('button', 'sw-back vt-back', '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>');
    back.title = 'Back';
    back.addEventListener('click', () => this.back());
    const titles = el('div', 'vt-titles', '<small class="vt-kicker">Pearls of the deep</small><h1>Treasure Vault</h1>');
    const purse = el('div', 'vt-purse');
    purse.title = 'Your gold. Every coin you win at sea lands here.';
    purse.append(el('span', 'vt-coin'), this.purseEl);
    head.append(back, titles, purse);

    // the chest on its altar
    const rays = el('div', 'vt-rays');
    const halo = el('div', 'vt-halo');
    this.chest.append(el('div', 'vt-lid', LID_SVG), el('div', 'vt-seam'), el('div', 'vt-base', BASE_SVG));
    this.altar.append(halo, rays, this.chest, el('div', 'vt-plinth'), el('div', 'vt-hint', 'Tap the chest to open it'));
    this.chest.addEventListener('click', () => {
      if (!this.busy) this.buy(1);
    });

    const panel = el('div', 'vt-panel');
    this.buyOne.addEventListener('click', () => this.buy(1));
    this.buyTen.addEventListener('click', () => this.buy(10));
    const buys = el('div', 'vt-buys');
    buys.append(this.buyOne, this.buyTen);
    const links = el('div', 'vt-links');
    this.collBtn.addEventListener('click', () => this.showCollection());
    const oddsBtn = el('button', 'vt-link', 'Odds & rules');
    oddsBtn.addEventListener('click', () => this.showOdds(true));
    links.append(this.collBtn, oddsBtn);
    panel.append(this.pityEl, buys, links);
    this.home.append(this.feature, this.altar, panel);

    // the reveal
    this.reveal.append(this.cards, this.revealFoot);

    this.root.append(this.fx.c, el('div', 'vt-bg'), head, this.home, this.reveal, this.coll, this.odds, this.flash);
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
      } else if (e.key === ' ' && this.busy) this.fastForward();
    });
    addEventListener('resize', () => this.isOpen && this.fx.resize());
    store.subscribe(() => this.sync());
    this.sync();
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }

  open() {
    this.root.classList.remove('hidden');
    this.showHome();
    this.fx.start();
    this.sync();
    this.renderFeature();
    clearInterval(this.featTimer);
    this.featTimer = window.setInterval(() => {
      this.featIdx++;
      this.renderFeature();
    }, 4200);
  }

  close() {
    this.root.classList.add('hidden');
    this.fx.stop();
    clearInterval(this.featTimer);
    this.cards.innerHTML = '';
  }

  private back() {
    if (this.busy) {
      this.fastForward();
      return;
    }
    this.sounds.click();
    if (!this.odds.classList.contains('hidden')) this.showOdds(false);
    else if (!this.coll.classList.contains('hidden') || !this.reveal.classList.contains('hidden')) this.showHome();
    else this.onClose();
  }

  // ---------------------------------------------------------------- home

  private showHome() {
    this.home.classList.remove('hidden');
    this.reveal.classList.add('hidden');
    this.coll.classList.add('hidden');
    this.odds.classList.add('hidden');
    this.root.dataset.view = 'home';
    this.chest.className = 'vt-chest';
    this.altar.style.removeProperty('--rc');
    this.cards.innerHTML = '';
  }

  private sync() {
    const s = this.store;
    this.purseEl.textContent = fmt(s.purse);
    const p = s.pity;
    const k = (HARD_PITY - p.legendary) / HARD_PITY;
    this.pityEl.innerHTML = `
      <div class="vt-pity-row"><span>Legendary guaranteed within</span><b>${p.legendary} open${p.legendary === 1 ? '' : 's'}</b></div>
      <div class="vt-meter"><i style="width:${(k * 100).toFixed(1)}%"></i></div>
      <div class="vt-pity-row sub"><span>Epic or better within</span><b>${p.epic}</b></div>`;
    const free = s.freeReady;
    this.buyOne.innerHTML = free
      ? '<span class="vt-bl">Open ×1</span><span class="vt-free">Free today</span>'
      : `<span class="vt-bl">Open ×1</span><span class="vt-cost"><i class="vt-coin"></i>${fmt(PULL_COST)}</span>`;
    this.buyOne.classList.toggle('free', free);
    this.buyTen.innerHTML = `<span class="vt-bl">Open ×10</span><span class="vt-cost"><i class="vt-coin"></i>${fmt(TEN_COST)}</span><em>−10%</em>`;
    this.buyOne.disabled = !s.canAfford(1);
    this.buyTen.disabled = !s.canAfford(10);
    this.collBtn.innerHTML = `Collection <b>${s.collected()}/${POOL.length}</b>`;
    this.root.querySelector('.vt-hint')!.textContent = s.canAfford(1) ? (free ? 'Your free daily chest is waiting' : 'Tap the chest to open it') : 'Win gold at sea to open more chests';
  }

  /** The showcase: every legendary in turn, alive on its card. */
  private renderFeature() {
    const legs = ALL.filter((i) => i.rarity === 3);
    const it = legs[this.featIdx % legs.length];
    this.feature.innerHTML = '';
    const card = el('div', 'vt-feat-card');
    card.style.setProperty('--rc', RARITIES[3].css);
    card.style.setProperty('--rd', RARITIES[3].deep);
    card.appendChild(itemCanvas(it, 260, 170, 'vt-feat-art'));
    const info = el('div', 'vt-feat-info', `<small>Featured legendary · ${KIND_NAMES[it.kind]}</small><b>${it.name}</b><p>${it.blurb}</p>`);
    card.appendChild(info);
    if (this.store.owns(it.id)) card.appendChild(el('span', 'vt-owned', 'In your collection'));
    const dots = el('div', 'vt-dots');
    legs.forEach((_, i) => {
      const d = el('i', i === this.featIdx % legs.length ? 'on' : '');
      dots.appendChild(d);
    });
    this.feature.append(el('div', 'vt-feat-kicker', 'Legendary · animated'), card, dots);
  }

  // ---------------------------------------------------------------- opening

  private buy(n: 1 | 10) {
    if (this.busy) return;
    const res = this.store.pull(n);
    if (!res) {
      this.sounds.click();
      this.buyTen.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 260 });
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

  private setTier(t: number) {
    this.altar.style.setProperty('--rc', RARITIES[t].css);
    this.altar.style.setProperty('--rd', RARITIES[t].deep);
    this.root.style.setProperty('--rc', RARITIES[t].css);
    this.chest.dataset.tier = String(t);
  }

  private async play(res: PullResult[]) {
    this.busy = true;
    this.skip = false;
    this.root.classList.add('busy');
    this.showHome();
    const top = Math.max(...res.map((r) => r.item.rarity)) as Rarity;
    const rect = () => this.chest.getBoundingClientRect();
    // the chest wakes: a seam of light that climbs through the rarities
    this.setTier(0);
    this.chest.className = 'vt-chest shake s0';
    this.sounds.rumble(0);
    await this.wait(750);
    for (let t = 1; t <= top; t++) {
      if (this.skip) break;
      this.setTier(t);
      this.chest.className = `vt-chest shake s${t}`;
      this.sounds.rumble(t);
      const r = rect();
      this.fx.burst(r.left + r.width / 2, r.top + r.height * 0.42, RARITIES[t].css, 14 + t * 6, 0, 0.6);
      this.pulse(t);
      await this.wait(t === 3 ? 950 : 700);
    }
    // burst open
    this.setTier(top);
    this.chest.className = 'vt-chest open';
    this.sounds.burst(top);
    const r = rect();
    this.fx.burst(r.left + r.width / 2, r.top + r.height * 0.4, RARITIES[top].css, 40 + top * 30, 8 + top * 10, 1.1);
    this.pulse(top, true);
    await this.wait(top === 3 ? 900 : 620);
    this.deal(res);
    this.busy = false;
    this.skip = false;
    this.root.classList.remove('busy');
  }

  private pulse(tier: number, big = false) {
    this.flash.style.setProperty('--rc', RARITIES[tier].css);
    this.flash.classList.remove('on', 'big');
    void this.flash.offsetWidth;
    this.flash.classList.add('on');
    if (big || tier === 3) this.flash.classList.add('big');
  }

  // ---------------------------------------------------------------- cards

  private deal(res: PullResult[]) {
    this.home.classList.add('hidden');
    this.reveal.classList.remove('hidden');
    this.root.dataset.view = 'reveal';
    this.cards.innerHTML = '';
    this.cards.dataset.n = String(res.length);
    const els = res.map((r) => this.card(r));
    els.forEach((c) => this.cards.appendChild(c));
    // fly out of the chest's mouth into place
    const from = { x: innerWidth / 2, y: innerHeight * 0.45 };
    els.forEach((c, i) => {
      const b = c.getBoundingClientRect();
      const dx = from.x - (b.left + b.width / 2);
      const dy = from.y - (b.top + b.height / 2);
      c.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(0.2) rotate(${(i % 2 ? 1 : -1) * 25}deg)`, opacity: 0 },
          { opacity: 1, offset: 0.3 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 620, delay: i * 70, easing: 'cubic-bezier(.2,.9,.25,1.1)', fill: 'backwards' },
      );
    });
    this.renderRevealFoot();
    // a single card turns itself over once it lands
    if (res.length === 1) setTimeout(() => this.flip(els[0]), 760);
  }

  private card(r: PullResult): HTMLElement {
    const it = r.item;
    const R = RARITIES[it.rarity];
    const c = el('div', `vt-card r${it.rarity}`);
    c.style.setProperty('--rc', R.css);
    c.style.setProperty('--rd', R.deep);
    const inner = el('div', 'vt-card-in');
    const back = el('div', 'vt-face vt-back', `<div class="vt-back-art">${CARD_BACK}</div><span class="vt-tap">Tap to reveal</span>`);
    const front = el('div', 'vt-face vt-front');
    this.fillFront(front, it, r);
    inner.append(back, front);
    c.appendChild(inner);
    c.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!c.classList.contains('open')) this.flip(c);
    });
    (c as HTMLElement & { result?: PullResult }).result = r;
    return c;
  }

  private fillFront(front: HTMLElement, it: Item, r?: PullResult, locked = false) {
    const R = RARITIES[it.rarity];
    front.innerHTML = '';
    const art = el('div', 'vt-art');
    art.appendChild(itemCanvas(it, 220, 150));
    if (locked) art.appendChild(el('span', 'vt-lock', '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'));
    front.appendChild(art);
    const info = el('div', 'vt-info');
    info.innerHTML = `<small class="vt-kind">${KIND_NAMES[it.kind]}</small><b class="vt-name">${it.name}</b><span class="vt-rar"><i>${stars(it.rarity)}</i>${R.name}</span>`;
    front.appendChild(info);
    if (r) front.appendChild(el('span', 'vt-badge ' + (r.fresh ? 'new' : 'dup'), r.fresh ? 'New' : `Owned · +${fmt(r.refund)}`));
    if (!locked) {
      const eq = el('button', 'vt-equip');
      const sync = () => {
        const on = this.store.equipped[it.kind] === it.id;
        eq.textContent = on ? 'Equipped' : 'Equip';
        eq.classList.toggle('on', on);
      };
      sync();
      eq.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.store.equipped[it.kind] === it.id) return;
        this.sounds.click();
        this.store.equip(it.id);
        this.onEquip(it);
        this.root.querySelectorAll<HTMLElement>('.vt-equip').forEach((b) => (b as HTMLElement & { sync?: () => void }).sync?.());
      });
      (eq as HTMLElement & { sync?: () => void }).sync = sync;
      front.appendChild(eq);
    }
  }

  private flip(c: HTMLElement) {
    if (c.classList.contains('open')) return;
    const r = (c as HTMLElement & { result?: PullResult }).result!;
    const tier = r.item.rarity;
    c.classList.add('open');
    this.sounds.flip(tier);
    const b = c.getBoundingClientRect();
    this.fx.burst(b.left + b.width / 2, b.top + b.height / 2, RARITIES[tier].css, 16 + tier * 14, tier >= 2 ? tier * 4 : 0, 0.7 + tier * 0.15);
    if (!r.fresh) this.sounds.coin();
    if (tier === 3) {
      this.pulse(3, true);
      this.root.classList.remove('legend');
      void this.root.offsetWidth;
      this.root.classList.add('legend');
      setTimeout(() => this.root.classList.remove('legend'), 1600);
    }
    this.renderRevealFoot();
  }

  private renderRevealFoot() {
    const f = this.revealFoot;
    f.innerHTML = '';
    const hidden = [...this.cards.querySelectorAll('.vt-card:not(.open)')] as HTMLElement[];
    if (hidden.length) {
      const all = el('button', 'btn vt-all', hidden.length > 1 ? 'Reveal all' : 'Reveal');
      all.addEventListener('click', () => {
        this.sounds.click();
        hidden.forEach((c, i) => setTimeout(() => this.flip(c), i * 110));
      });
      f.appendChild(all);
      return;
    }
    const again = el('button', 'btn gold vt-again', this.lastN === 10 ? `Open ×10 again · ${fmt(TEN_COST)}` : this.store.freeReady ? 'Open again · Free' : `Open again · ${fmt(PULL_COST)}`);
    again.disabled = !this.store.canAfford(this.lastN);
    again.addEventListener('click', () => this.buy(this.lastN));
    const done = el('button', 'btn vt-done', 'Done');
    done.addEventListener('click', () => {
      this.sounds.click();
      this.showHome();
    });
    f.append(done, again);
  }

  // ---------------------------------------------------------------- collection

  private showCollection() {
    this.sounds.click();
    this.home.classList.add('hidden');
    this.coll.classList.remove('hidden');
    this.root.dataset.view = 'collection';
    this.renderCollection();
  }

  private renderCollection() {
    const s = this.store;
    const c = this.coll;
    c.innerHTML = '';
    const top = el('div', 'vt-coll-top');
    const k = s.collected() / POOL.length;
    top.innerHTML = `<div class="vt-coll-count"><b>${s.collected()}</b> of ${POOL.length} found</div><div class="vt-meter"><i style="width:${(k * 100).toFixed(1)}%"></i></div>`;
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
    for (const it of items) {
      const owned = s.owns(it.id);
      const card = el('div', `vt-card open mini r${it.rarity}` + (owned ? '' : ' locked'));
      card.style.setProperty('--rc', RARITIES[it.rarity].css);
      card.style.setProperty('--rd', RARITIES[it.rarity].deep);
      const inner = el('div', 'vt-card-in');
      const front = el('div', 'vt-face vt-front');
      this.fillFront(front, it, undefined, !owned);
      if (s.count(it.id) > 1) front.appendChild(el('span', 'vt-badge dup', `×${s.count(it.id)}`));
      inner.appendChild(front);
      card.appendChild(inner);
      card.title = it.blurb;
      grid.appendChild(card);
    }
    c.append(top, grid);
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
