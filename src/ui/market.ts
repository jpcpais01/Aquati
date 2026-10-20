import './market.css';
import { CATEGORIES, Hold, LOOT, LootId, Market, RARITIES } from '../game/treasure';
import { icon, ICONS } from './art';
import { lootIcon } from './lootArt';
import { Part, PART_RARITIES, SLOT_NAMES, statLines } from '../ships/parts';
import { partIcon } from './partArt';
import { shipSilhouette } from './art';
import { SHIP_CLASSES, ShipClassId } from '../ships/shipTypes';
import { FLEET_MAX, HireOffer } from '../game/fleet';

// The trading port's market: your hold laid out on the counter with today's
// prices, a Sell button on every lot, the chandlery for repairs and fresh
// shot, and the gold flying into your purse. A side panel on wide screens and
// a bottom sheet on phones, leaving the quay (and the porters) in view.

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const HAMMER = '<path d="M14.5 4.5 19.5 9.5 17 12l-5-5zM12 7 4 15a2 2 0 0 0 0 2.8l.2.2a2 2 0 0 0 2.8 0L15 10"/>';
const SHOT = '<circle cx="9" cy="14" r="5"/><circle cx="16.5" cy="9" r="3.5"/><path d="M7.4 12.2a2 2 0 0 1 2-1.1"/>';

export interface Services {
  /** Gold to mend the hull fully (0 = nothing to mend). */
  repair: number;
  /** Hull points that buys. */
  repairHp: number;
  /** Gold to fill the shot rack (0 = already full). */
  shot: number;
  /** Broadsides of special shot that buys. */
  shotN: number;
}

/** One of your escorts, as the harbour master sees her. */
export interface FleetMember {
  id: string;
  name: string;
  cls: ShipClassId;
  master: string;
  prize: boolean;
  hp: number;
  kills: number;
}

/** The harbour master's counter: who sails with you, and who's for hire today. */
export interface FleetCounter {
  roster: FleetMember[];
  offers: HireOffer[];
  purse: number;
}

/** A part on the port shipwright's counter. */
export interface PartOffer {
  part: Part;
  owned: boolean;
}

export class MarketUI {
  readonly root: HTMLElement;
  private list: HTMLElement;
  private purse: HTMLElement;
  private sellAll: HTMLButtonElement;
  private room: HTMLElement;
  private svcRepair: HTMLButtonElement;
  private svcShot: HTMLButtonElement;
  private hold: Hold | null = null;
  private market: Market | null = null;
  private gold = 0;
  private shown = 0;
  private time = 0;
  private priceT = 0;
  private services: Services = { repair: 0, repairHp: 0, shot: 0, shotN: 0 };
  private dock: HTMLButtonElement;
  private dockState = '';
  isOpen = false;
  onSell: (id: LootId) => void = () => {};
  onSellAll: () => void = () => {};
  onRepair: () => void = () => {};
  onShot: () => void = () => {};
  onLeave: () => void = () => {};
  onDock: () => void = () => {};
  onClick: () => void = () => {};
  onBuyPart: (id: string) => void = () => {};
  onHire: (id: string) => void = () => {};
  onPayOff: (id: string) => void = () => {};
  private partList: HTMLElement;
  private fleetList: HTMLElement;
  private fleetPurse: HTMLElement;
  private fleetRoom: HTMLElement;
  private body: HTMLElement;
  private partPurse: HTMLElement;

  constructor() {
    const r = (this.root = document.createElement('div'));
    r.id = 'market';
    r.className = 'market hidden';
    r.innerHTML = `
      <div class="mk-card">
        <header class="mk-head">
          <div class="mk-crest">${icon(ICONS.anchor)}</div>
          <div class="mk-title"><small>Trading port</small><h2 class="mk-name"></h2><p class="mk-tag"></p></div>
          <div class="mk-purse" title="Your gold"><span class="coin"></span><b>0</b></div>
        </header>
        <div class="mk-body">
        <div class="mk-label"><span>Your hold</span><span class="mk-room"></span></div>
        <ul class="mk-list"></ul>
        <button class="btn primary big mk-all"><span class="mk-all-l">Sell everything</span><span class="mk-all-v"><span class="coin"></span><b>0</b></span></button>
        <div class="mk-label"><span>Chandlery</span></div>
        <div class="mk-yard">
          <button class="mk-svc" data-k="repair">${icon(HAMMER)}<span><b>Repair the hull</b><small></small></span><em><span class="coin"></span><i></i></em></button>
          <button class="mk-svc" data-k="shot">${icon(SHOT)}<span><b>Restock the shot</b><small></small></span><em><span class="coin"></span><i></i></em></button>
        </div>
        <div class="mk-label"><span>Shipwright</span><span class="mk-wpurse" title="Your purse"></span></div>
        <ul class="mk-parts"></ul>
        <p class="mk-pnote">Paid from your purse. New parts are fitted at the Shipwright before your next voyage.</p>
        <div class="mk-label"><span>Harbour master</span><span class="mk-froom"></span><span class="mk-fpurse" title="Your purse"></span></div>
        <ul class="mk-parts mk-fleet"></ul>
        <p class="mk-pnote">Escorts sail in formation on your quarters and take your orders (G). They sail with you every voyage until they are sunk.</p>
        </div>
        <footer class="mk-foot"><button class="btn mk-leave">${icon(ICONS.flag)}<span>Cast off</span><kbd class="kd">Esc</kbd></button></footer>
      </div>`;
    document.body.appendChild(r);
    this.list = r.querySelector('.mk-list')!;
    this.purse = r.querySelector('.mk-purse b')!;
    this.sellAll = r.querySelector('.mk-all')!;
    this.room = r.querySelector('.mk-room')!;
    this.svcRepair = r.querySelector('[data-k="repair"]')!;
    this.svcShot = r.querySelector('[data-k="shot"]')!;
    this.partList = r.querySelector('.mk-parts')!;
    this.partPurse = r.querySelector('.mk-wpurse')!;
    this.fleetList = r.querySelector('.mk-fleet')!;
    this.fleetPurse = r.querySelector('.mk-fpurse')!;
    this.fleetRoom = r.querySelector('.mk-froom')!;
    this.body = r.querySelector('.mk-body')!;
    this.body.addEventListener('scroll', () => this.edges(), { passive: true });
    // the body's own box and every list in it: content growing changes what's left to scroll
    const ro = new ResizeObserver(() => this.edges());
    ro.observe(this.body);
    for (const el of [this.list, this.partList, this.fleetList]) ro.observe(el);
    this.fleetList.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!b || b.disabled) return;
      e.stopPropagation();
      this.onClick();
      if (b.classList.contains('mk-hire')) this.onHire(b.dataset.id!);
      else if (b.classList.contains('mk-off')) {
        // paying off a ship is for good: the first tap asks, the second does it
        if (!b.classList.contains('sure')) {
          b.classList.add('sure');
          b.textContent = 'Sure?';
          setTimeout(() => {
            if (!b.isConnected) return;
            b.classList.remove('sure');
            b.textContent = 'Pay off';
          }, 2600);
          return;
        }
        this.onPayOff(b.dataset.id!);
      }
    });
    this.partList.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.mk-buy');
      if (!b || b.disabled) return;
      e.stopPropagation();
      this.onClick();
      this.onBuyPart(b.dataset.id!);
    });
    const tap = (el: HTMLElement, fn: () => void) =>
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onClick();
        fn();
      });
    tap(this.sellAll, () => this.onSellAll());
    tap(this.svcRepair, () => this.onRepair());
    tap(this.svcShot, () => this.onShot());
    tap(r.querySelector('.mk-leave')!, () => this.onLeave());
    this.list.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.mk-sell');
      if (!b) return;
      e.stopPropagation();
      this.onClick();
      this.onSell(b.dataset.id as LootId);
    });
    addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        this.onLeave();
      } else if (e.key === 'Enter' && !e.repeat) {
        e.preventDefault();
        this.onSellAll();
      }
    });

    // the "come alongside" pill over the HUD
    const d = (this.dock = document.createElement('button'));
    d.className = 'dock-prompt';
    d.id = 'dock-prompt';
    d.innerHTML = `<kbd class="kd">F</kbd><span class="dp-t"><b></b><small></small></span>`;
    d.addEventListener('click', (e) => {
      e.stopPropagation();
      if (d.classList.contains('ok')) this.onDock();
    });
    document.getElementById('hud')!.appendChild(d);
  }

  /** The prompt as you come in: null hides it. */
  setDock(s: { name: string; ok: boolean; why: string } | null) {
    const key = s ? `${s.name}|${s.ok}|${s.why}` : '';
    if (key === this.dockState) return;
    this.dockState = key;
    const d = this.dock;
    d.classList.toggle('on', !!s);
    if (!s) return;
    d.classList.toggle('ok', s.ok);
    d.querySelector('b')!.textContent = s.ok ? `Dock at ${s.name}` : s.name;
    d.querySelector('small')!.textContent = s.why;
  }

  open(name: string, tagline: string, market: Market, hold: Hold, gold: number, t: number) {
    this.market = market;
    this.hold = hold;
    this.gold = this.shown = gold;
    this.time = t;
    this.root.querySelector('.mk-name')!.textContent = name;
    this.root.querySelector('.mk-tag')!.textContent = tagline;
    this.purse.textContent = fmt(gold);
    this.render();
    this.body.scrollTop = 0;
    this.root.classList.remove('hidden', 'out');
    void this.root.offsetWidth;
    this.root.classList.add('in');
    this.isOpen = true;
  }

  close() {
    this.isOpen = false;
    this.root.classList.remove('in');
    this.root.classList.add('hidden');
  }

  /** Fades the scroll body's edges only where there is more to scroll to. */
  private edges() {
    const b = this.body;
    const more = b.scrollHeight - b.clientHeight;
    b.classList.toggle('more-up', b.scrollTop > 2);
    b.classList.toggle('more-down', more > 2 && b.scrollTop < more - 2);
  }

  /** Where the panel sits, so the camera can keep the ship in the space it leaves. */
  panelRect() {
    const c = this.root.querySelector('.mk-card') as HTMLElement;
    return this.isOpen ? c.getBoundingClientRect() : new DOMRect();
  }

  setServices(s: Services) {
    this.services = s;
    const set = (b: HTMLButtonElement, cost: number, line: string, none: string) => {
      b.querySelector('small')!.textContent = cost ? line : none;
      b.querySelector('i')!.textContent = cost ? fmt(cost) : '—';
      b.disabled = !cost || cost > this.gold;
      b.classList.toggle('done', !cost);
    };
    set(this.svcRepair, s.repair, `Patch ${fmt(s.repairHp)} hull`, 'Sound as a bell');
    set(this.svcShot, s.shot, `${s.shotN} broadsides of special shot`, 'The racks are full');
  }

  /** The shipwright's counter: today's parts, and whether the purse stretches to them. */
  setParts(offers: PartOffer[], purse: number, bought?: string) {
    this.partPurse.innerHTML = `<span class="coin"></span>${fmt(purse)}`;
    this.partList.innerHTML = offers
      .map(({ part: p, owned }) => {
        const R = PART_RARITIES[p.tier];
        const lines = statLines(p.stats)
          .slice(0, 3)
          .map((l) => `<span class="${l.bad ? 'bad' : ''}">${l.text}</span>`)
          .join('');
        const can = !owned && purse >= R.price;
        return `<li class="mk-row mk-prow t${p.tier}${bought === p.id ? ' just' : ''}" style="--rc:${R.css}">
          <i class="mk-ico">${partIcon(p, 'loot-ico')}</i>
          <div class="mk-what"><b>${esc(p.name)}</b><small><em>${R.name}</em> · ${SLOT_NAMES[p.slot]}</small><div class="mk-pst">${lines}</div></div>
          <button class="mk-buy" data-id="${p.id}"${can ? '' : ' disabled'}>${owned ? 'Owned' : `<span class="coin"></span>${fmt(R.price)}`}</button>
        </li>`;
      })
      .join('');
  }

  /** The harbour master's counter: your escorts' hulls, and today's ships for hire. */
  setFleet(f: FleetCounter, signed?: string) {
    this.fleetPurse.innerHTML = `<span class="coin"></span>${fmt(f.purse)}`;
    this.fleetRoom.textContent = `${f.roster.length} / ${FLEET_MAX} escorts`;
    const full = f.roster.length >= FLEET_MAX;
    const mine = f.roster
      .map((m) => {
        const k = Math.max(0, Math.min(1, m.hp));
        return `<li class="mk-row mk-prow mk-frow${m.prize ? ' prize' : ''}${signed === m.id ? ' just' : ''}" style="--rc:#5ee3d4">
          <i class="mk-ico">${shipSilhouette(SHIP_CLASSES[m.cls])}</i>
          <div class="mk-what"><b>${esc(m.name)}</b><small><em>${m.prize ? 'Prize' : 'Hired'}</em> · ${SHIP_CLASSES[m.cls].name}${m.master ? ` · ${esc(m.master)}` : ''}${m.kills ? ` · ${m.kills} sunk` : ''}</small><span class="mk-fhull"><i class="${k < 0.35 ? 'low' : ''}" style="transform:scaleX(${k.toFixed(3)})"></i></span></div>
          <button class="mk-buy mk-off" data-id="${esc(m.id)}">Pay off</button>
        </li>`;
      })
      .join('');
    const offers = f.offers
      .filter((o) => !f.roster.some((m) => m.id === o.id))
      .map((o) => {
        const c = SHIP_CLASSES[o.cls];
        const can = !full && f.purse >= o.price;
        return `<li class="mk-row mk-prow mk-frow" style="--rc:#f4c765">
          <i class="mk-ico">${shipSilhouette(c)}</i>
          <div class="mk-what"><b>The ${esc(o.name)}</b><small><em>${c.name}</em> · Captain ${esc(o.master)}</small><span class="mk-trait">“${esc(o.trait)}”</span></div>
          <button class="mk-buy mk-hire" data-id="${esc(o.id)}"${can ? '' : ' disabled'}>${full ? 'Fleet full' : `Hire <span class="coin"></span>${fmt(o.price)}`}</button>
        </li>`;
      })
      .join('');
    this.fleetList.innerHTML = mine + (offers || (full ? '' : '<li class="mk-empty"><p><small>No more ships for hire here today.</small></p></li>'));
  }

  setGold(g: number) {
    this.gold = g;
    this.setServices(this.services);
  }

  /** A lot sold: its row flies coins into the purse and folds away. */
  sold(id: LootId, value: number) {
    const row = this.list.querySelector<HTMLElement>(`[data-id="${id}"]`);
    if (row) {
      this.coins(row, Math.min(9, 3 + Math.floor(Math.log2(1 + value / 40))));
      row.classList.add('gone');
    }
    setTimeout(() => this.render(), row ? 380 : 0);
  }

  soldAll(value: number) {
    const rows = [...this.list.querySelectorAll<HTMLElement>('.mk-row')];
    rows.forEach((r, i) => {
      setTimeout(() => {
        this.coins(r, 4);
        r.classList.add('gone');
      }, i * 70);
    });
    this.coins(this.sellAll, Math.min(14, 6 + Math.floor(Math.log2(1 + value / 200))));
    setTimeout(() => this.render(), rows.length * 70 + 380);
  }

  private coins(from: HTMLElement, n: number) {
    const a = from.getBoundingClientRect();
    const b = this.purse.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const c = document.createElement('span');
      c.className = 'coin mk-fly';
      document.body.appendChild(c);
      const x0 = a.left + a.width * (0.3 + Math.random() * 0.5);
      const y0 = a.top + a.height / 2;
      const x1 = b.left + 6;
      const y1 = b.top + b.height / 2;
      const lift = -60 - Math.random() * 60;
      c.animate(
        [
          { transform: `translate(${x0}px, ${y0}px) scale(0.6)`, opacity: 0 },
          { transform: `translate(${(x0 + x1) / 2 + (Math.random() - 0.5) * 60}px, ${Math.min(y0, y1) + lift}px) scale(1.15)`, opacity: 1, offset: 0.45 },
          { transform: `translate(${x1}px, ${y1}px) scale(0.7)`, opacity: 0.9 },
        ],
        { duration: 650 + Math.random() * 250, delay: i * 45, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'both' },
      ).onfinish = () => c.remove();
    }
    setTimeout(() => {
      const p = this.purse.parentElement!;
      p.classList.remove('bump');
      void p.offsetWidth;
      p.classList.add('bump');
    }, 600);
  }

  private render() {
    const hold = this.hold;
    const m = this.market;
    if (!hold || !m) return;
    const items = hold.list();
    this.room.textContent = `${hold.used} / ${hold.capacity} room`;
    if (!items.length) {
      this.list.innerHTML = `<li class="mk-empty">${icon(ICONS.anchor)}<p><b>The hold is empty</b><small>Sink pirates and sail through their wreckage, then bring the plunder here to sell.</small></p></li>`;
    } else {
      this.list.innerHTML = items
        .map(({ id, n }) => {
          const k = LOOT[id];
          return `<li class="mk-row r-${k.rarity}" data-id="${id}">
            <i class="mk-ico">${lootIcon(id)}</i>
            <div class="mk-what"><b>${esc(k.name)}${n > 1 ? `<span class="mk-n">×${n}</span>` : ''}</b><small><em>${RARITIES[k.rarity].name}</em> · ${CATEGORIES[k.cat]}</small></div>
            <div class="mk-price"><b></b><small></small></div>
            <button class="mk-sell" data-id="${id}">Sell</button>
          </li>`;
        })
        .join('');
    }
    this.sellAll.disabled = !items.length;
    this.prices(true);
  }

  /** Today's prices on every row; they drift while you watch. */
  private prices(force = false) {
    const hold = this.hold;
    const m = this.market;
    if (!hold || !m) return;
    let total = 0;
    for (const { id, n } of hold.list()) {
      const p = m.price(id, this.time);
      total += p * n;
      const row = this.list.querySelector<HTMLElement>(`.mk-row[data-id="${id}"]`);
      if (!row) continue;
      const b = row.querySelector('.mk-price b')!;
      const was = b.textContent;
      const now = fmt(p * n);
      if (was === now && !force) continue;
      b.textContent = now;
      const tr = m.trend(id, this.time);
      const s = row.querySelector('.mk-price small')!;
      s.textContent = `${n > 1 ? `${fmt(p)} each · ` : ''}${tr >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(tr * 100))}%`;
      s.className = Math.abs(tr) < 0.03 ? 'even' : tr > 0 ? 'up' : 'down';
      if (!force && was) {
        b.classList.remove('tick');
        void (b as HTMLElement).offsetWidth;
        b.classList.add('tick');
      }
    }
    this.sellAll.querySelector('.mk-all-v b')!.textContent = fmt(total);
  }

  /** Counts the purse up, and refreshes the prices once a second. */
  tick(dt: number, t: number) {
    if (!this.isOpen) return;
    this.time = t;
    if (this.shown !== this.gold) {
      const d = this.gold - this.shown;
      this.shown = Math.abs(d) < 1 ? this.gold : this.shown + d * Math.min(1, dt * 6);
      this.purse.textContent = fmt(this.shown);
    }
    this.priceT += dt;
    if (this.priceT > 1) {
      this.priceT = 0;
      this.prices();
    }
  }
}

/** A peek into the hold from the HUD chip: what's aboard and roughly what it's worth. */
export function holdPeek(hold: Hold): string {
  const items = hold.list();
  if (!items.length) return `<p class="hp-empty">Nothing aboard yet. Chests and wreckage fill the hold; trading ports buy it.</p>`;
  return `<ul>${items
    .map(({ id, n }) => {
      const k = LOOT[id];
      return `<li class="r-${k.rarity}"><i>${lootIcon(id)}</i><span>${esc(k.name)}</span><b>${n > 1 ? `×${n}` : ''}</b></li>`;
    })
    .join('')}</ul><p class="hp-worth"><span class="coin"></span>Worth about <b>${fmt(hold.worth)}</b> at market</p>`;
}
