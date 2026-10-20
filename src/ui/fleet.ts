import './fleet.css';
import { icon, ICONS, shipSilhouette } from './art';
import { SHIP_CLASSES, ShipClassId } from '../ships/shipTypes';
import { Order, ORDER_INFO, ORDERS } from '../game/fleet';
import { replay } from './replay';

// The fleet on the HUD: under your own ship's panel, a slim card for each
// escort (her silhouette, name, what she's doing and her hull) and the three
// signal flags you can run up: form on me, attack my target, hold position.

export const FLEET_ICONS: Record<Order, string> = {
  // a vee of hulls: the flagship leading, two astern
  follow: '<path d="M12 3.2 14.6 9H9.4z"/><path d="M5.6 12.4 8 17.6H3.2zM18.4 12.4l2.4 5.2h-4.8z"/><path d="M12 11v9" stroke-dasharray="1.6 2.2"/>',
  attack: '<path d="M4 4l10.5 10.5M20 4 9.5 14.5"/><path d="M6.6 16.1l1.3 1.3M17.4 16.1l-1.3 1.3M3.2 20.8l3.6-3.6M20.8 20.8l-3.6-3.6"/>',
  hold: ICONS.anchor,
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface EscortRow {
  id: number;
  name: string;
  cls: ShipClassId;
  /** A taken prize (her own paint) rather than a ship in your colours. */
  prize: boolean;
  hp: number;
  max: number;
  status: string;
  fighting: boolean;
}

interface RowEl {
  el: HTMLElement;
  fill: HTMLElement;
  status: HTMLElement;
  key: string;
}

export class FleetHud {
  readonly root: HTMLElement;
  onOrder: (o: Order) => void = () => {};
  private list: HTMLElement;
  private rows = new Map<number, RowEl>();
  private btns: Record<Order, HTMLButtonElement>;
  private order: Order = 'follow';
  private shown = false;

  constructor() {
    const r = (this.root = document.createElement('div'));
    r.className = 'panel fleet-panel';
    r.innerHTML =
      `<div class="fl-head"><small>Your fleet</small><kbd class="kd">G</kbd></div><div class="fl-rows"></div>` +
      `<div class="fl-orders" role="radiogroup" aria-label="Fleet orders">${ORDERS.map(
        (o) => `<button class="fl-o" data-o="${o}" role="radio" title="${ORDER_INFO[o].name}: ${ORDER_INFO[o].line}">${icon(FLEET_ICONS[o])}<span>${ORDER_INFO[o].short}</span></button>`,
      ).join('')}</div>`;
    this.list = r.querySelector('.fl-rows')!;
    this.btns = Object.fromEntries(ORDERS.map((o) => [o, r.querySelector<HTMLButtonElement>(`[data-o="${o}"]`)!])) as Record<Order, HTMLButtonElement>;
    for (const o of ORDERS) {
      this.btns[o].addEventListener('click', (e) => {
        e.stopPropagation();
        this.onOrder(o);
      });
      // a tap on the order strip must never steer the ship or fire the guns underneath
      this.btns[o].addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    document.getElementById('hud')!.querySelector('.status')!.appendChild(r);
    this.setOrder('follow', false);
  }

  show(on: boolean) {
    if (on === this.shown) return;
    this.shown = on;
    this.root.classList.toggle('on', on);
  }

  /** Lights the order the fleet is under; `flash` plays the signal going up. */
  setOrder(o: Order, flash = true) {
    this.order = o;
    for (const k of ORDERS) {
      const b = this.btns[k];
      b.classList.toggle('on', k === o);
      b.setAttribute('aria-checked', String(k === o));
    }
    if (!flash) return;
    const b = this.btns[o];
    replay(b, 'sig');
  }

  get current() {
    return this.order;
  }

  setRows(rows: EscortRow[]) {
    const seen = new Set<number>();
    for (const r of rows) {
      seen.add(r.id);
      let row = this.rows.get(r.id);
      if (!row) {
        const el = document.createElement('div');
        el.className = `fl-row${r.prize ? ' prize' : ''}`;
        el.innerHTML =
          `<div class="fl-art hud-ship">${shipSilhouette(SHIP_CLASSES[r.cls])}</div>` +
          `<div class="fl-mid"><div class="fl-name"><b>${esc(r.name)}</b><small>${SHIP_CLASSES[r.cls].name}</small></div>` +
          `<div class="fl-st"></div><div class="hull fl-hull"><div class="hull-fill"></div></div></div>`;
        this.list.appendChild(el);
        row = { el, fill: el.querySelector('.hull-fill')!, status: el.querySelector('.fl-st')!, key: '' };
        this.rows.set(r.id, row);
        el.classList.add('join');
      }
      const frac = Math.max(0, r.hp / r.max);
      const key = `${frac.toFixed(3)}|${r.status}|${r.fighting}`;
      if (key === row.key) continue;
      const prev = row.key ? parseFloat(row.key) : 1;
      row.key = key;
      row.fill.style.transform = `scaleX(${frac.toFixed(3)})`;
      row.fill.classList.toggle('low', frac < 0.35);
      row.status.textContent = r.status;
      row.el.classList.toggle('fighting', r.fighting);
      if (frac < prev - 0.002) {
        replay(row.el, 'hit');
      }
    }
    for (const [id, row] of this.rows) {
      if (seen.has(id)) continue;
      row.el.remove();
      this.rows.delete(id);
    }
  }

  clear() {
    this.setRows([]);
    this.show(false);
  }
}
