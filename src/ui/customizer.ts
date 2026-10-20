import './customizer.css';
import {
  BACKINGS, drawFlag, emblemThumb, EMBLEMS, FlagDesign, flagThumb, PATTERNS, paintSource, preloadPaint, seedPaint, setLivePaint, SHAPES,
} from '../ships/heraldry';
import {
  DEFAULT_LOOK, HULL_PARTS, HullLook, loadDesigns, MAX_SAVED, PALETTES, PRESETS, randomLook, randomShipName, SAIL_PATTERNS, SailPattern, sameDesign,
  SavedDesign, saveDesigns, sameStyle, ShipLook,
} from '../ships/look';
import { ALL, CosmeticKind, Item, KIND_NAMES, RARITIES, VaultStore } from '../ships/cosmetics';
import { itemCanvas } from './swatch';
import { Part, PART_RARITIES, PARTS, PartSlot, PartStore, refitBars, SLOT_NAMES, SLOTS, statLines } from '../ships/parts';
import { SHIP_CLASSES, ShipClassId } from '../ships/shipTypes';
import { partIcon, standardIcon } from './partArt';

// The shipwright's panel: flag, sails, hull and presets, with a living flag
// preview you can paint on. Changes stream out through onChange so the ship
// moored in the harbour updates as you go.

export type SwTab = 'flag' | 'sails' | 'hull' | 'refit' | 'skins' | 'cannons' | 'presets';
export type SwChange = 'flag' | 'paint' | 'sail' | 'hull' | 'name' | 'all';

const LIVE = 'live';
const PAINT_W = 384;
const PAINT_H = 238;

const ICONS: Record<SwTab, string> = {
  flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4" /><path d="M5 4h12l-2.5 4L17 12H5" /></svg>',
  sails: '<svg viewBox="0 0 24 24"><path d="M12 3v17" /><path d="M12 4c4 3 6 8 6 13h-6" /><path d="M11 6c-3 3-5 7-5 11h5" /><path d="M4 20h16" /></svg>',
  hull: '<svg viewBox="0 0 24 24"><path d="M3 13h18l-2.5 6h-13z" /><path d="M7 13V9h7v4" /><path d="M10 9V5" /></svg>',
  skins: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2 0-1.5-1.2-1.6-1.2-2.8 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4c0-4.2-4-7.5-9-7.5z" /><circle cx="7.5" cy="11" r="1.2" /><circle cx="10" cy="7" r="1.2" /><circle cx="15" cy="7.5" r="1.2" /></svg>',
  cannons: '<svg viewBox="0 0 24 24"><path d="M3 12.5l13-4 1.5 4.5-13 4z" /><circle cx="8" cy="18" r="2.5" /><path d="M18.5 9.5l2.5-1M19 12.5l2.5.5M17.5 7l1-2.5" /></svg>',
  presets: '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z" /></svg>',
  refit: '<svg viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L4 16.8V20h3.2l5.3-5.3a4 4 0 0 0 5.2-5.4l-2.4 2.4-2.6-.6-.6-2.6z" /></svg>',
};

const TAB_NAMES: Record<SwTab, string> = { flag: 'Flag', sails: 'Sails', hull: 'Hull', refit: 'Refit', skins: 'Skins', cannons: 'Guns', presets: 'Presets' };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

function sailThumb(pattern: SailPattern, cloth: string, accent: string, w = 54, h = 58): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const path = () => {
    g.beginPath();
    g.moveTo(w * 0.12, h * 0.08);
    g.quadraticCurveTo(w * 0.5, h * 0.16, w * 0.88, h * 0.08);
    g.quadraticCurveTo(w * 0.98, h * 0.5, w * 0.92, h * 0.92);
    g.quadraticCurveTo(w * 0.5, h * 0.8, w * 0.08, h * 0.92);
    g.quadraticCurveTo(w * 0.02, h * 0.5, w * 0.12, h * 0.08);
    g.closePath();
  };
  g.save();
  path();
  g.clip();
  g.fillStyle = cloth;
  g.fillRect(0, 0, w, h);
  g.fillStyle = accent;
  switch (pattern) {
    case 'stripes':
      for (let i = 1; i < 9; i += 2) g.fillRect((i / 9) * w, 0, w / 9, h);
      break;
    case 'band':
      g.fillRect(0, h * 0.58, w, h * 0.2);
      break;
    case 'border':
      g.lineWidth = w * 0.18;
      g.strokeStyle = accent;
      path();
      g.stroke();
      break;
    case 'cross':
      g.fillRect(w * 0.43, 0, w * 0.14, h);
      g.fillRect(0, h * 0.42, w, h * 0.14);
      break;
    case 'diagonal':
      g.beginPath();
      g.moveTo(0, h * 0.35);
      g.lineTo(w * 0.65, h);
      g.lineTo(0, h);
      g.fill();
      break;
    default:
      break;
  }
  g.restore();
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 1.5;
  path();
  g.stroke();
  return c;
}

export class Customizer {
  readonly root = el('div', 'sw hidden');
  onChange: (look: ShipLook, what: SwChange) => void = () => {};
  onDone: () => void = () => {};
  onTab: (tab: SwTab, sub?: string) => void = () => {};
  onClick: () => void = () => {};
  /** A vault item was put on (or taken off, back to the basics). */
  onEquip: (it: Item) => void = () => {};
  onVault: () => void = () => {};
  onTestFire: () => void = () => {};
  /** A part bolted on (or, with null, the standard fit put back) on the ship at the berth. */
  onFit: (slot: PartSlot, id: string | null) => void = () => {};
  /** Where a part can be bought today, if anywhere. */
  whereSold: (id: string) => string | null = () => null;
  private vault: VaultStore | null = null;
  private parts: PartStore | null = null;
  private cls: ShipClassId = 'sloop';
  /** The part the refit tab is showing details for, per slot. */
  private picked: Partial<Record<PartSlot, string>> = {};
  private look: ShipLook = structuredClone(DEFAULT_LOOK);
  private tab: SwTab = 'flag';
  private hullPart: keyof HullLook = 'topsides';
  private panel = el('section', 'sw-panel');
  private body = el('div', 'sw-body');
  private place = el('small', 'sw-kicker');
  private stage = el('div', 'sw-stage');
  private flagCanvas = el('canvas', 'sw-flag');
  private flagImg = document.createElement('canvas');
  private flagDirty = true;
  private t = 0;
  // painting
  private painting = false;
  private paint: HTMLCanvasElement | null = null;
  private undo: ImageData[] = [];
  private brush = { size: 12, color: '#f3ecdc', erase: false };
  private stroke: { x: number; y: number } | null = null;
  private paintBar = el('div', 'sw-paintbar');
  private syncSave = () => {};
  private paintBtn = el('button', 'sw-chip sw-paint-toggle', '<span>✎</span> Paint');

  constructor() {
    this.root.id = 'shipwright';
    const head = el('header', 'sw-head');
    const back = el('button', 'sw-back', '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>');
    back.title = 'Back to harbour';
    back.addEventListener('click', () => this.done());
    const titles = el('div', 'sw-titles');
    titles.append(this.place, el('h1', '', 'Shipwright'));
    head.append(back, titles);

    const tabs = el('nav', 'sw-tabs');
    (['flag', 'sails', 'hull', 'refit', 'skins', 'cannons', 'presets'] as SwTab[]).forEach((id) => {
      const b = el('button', 'sw-tab', `${ICONS[id]}<span>${TAB_NAMES[id]}</span><i class="sw-new"></i>`);
      b.dataset.tab = id;
      b.addEventListener('click', () => {
        if (this.tab === id) return;
        this.onClick();
        this.setTab(id);
      });
      tabs.appendChild(b);
    });

    const foot = el('footer', 'sw-foot');
    const dice = el('button', 'btn sw-dice', '<span class="sw-die">⚄</span> Surprise me');
    dice.addEventListener('click', () => {
      this.onClick();
      this.commitPaint();
      this.look = randomLook(this.look.name);
      dice.querySelector('.sw-die')!.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 450, easing: 'ease-out' });
      this.changed('all');
      this.render();
    });
    const ok = el('button', 'btn gold sw-done', 'Done');
    ok.addEventListener('click', () => this.done());
    foot.append(dice, ok);

    this.panel.append(tabs, this.body, foot);
    const hint = el('div', 'sw-hint', 'Drag to look around · Scroll to zoom');
    this.root.append(head, this.panel, hint);
    document.body.appendChild(this.root);

    // living flag preview
    this.stage.append(this.flagCanvas, this.paintBtn, this.paintBar);
    this.paintBtn.addEventListener('click', () => {
      this.onClick();
      if (this.painting) this.commitPaint();
      else this.startPaint();
      this.renderPaintBar();
    });
    this.flagCanvas.addEventListener('pointerdown', (e) => this.paintDown(e));
    this.flagCanvas.addEventListener('pointermove', (e) => this.paintMove(e));
    const up = () => {
      if (this.stroke) {
        this.stroke = null;
        this.changed('paint');
      }
    };
    this.flagCanvas.addEventListener('pointerup', up);
    this.flagCanvas.addEventListener('pointercancel', up);
    addEventListener('keydown', (e) => {
      if (this.root.classList.contains('hidden')) return;
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) this.done();
      if (this.painting && (e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) this.popUndo();
    });
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }

  /** Hooks up the player's vault collection for the Skins and Guns tabs. */
  setVault(v: VaultStore) {
    this.vault = v;
    v.subscribe(() => this.markNew());
    this.markNew();
  }

  /** Hooks up the parts locker for the Refit tab. */
  setParts(p: PartStore) {
    this.parts = p;
    p.subscribe(() => this.markNew());
    this.markNew();
  }

  /** Re-renders the cosmetics tabs (after the vault adds something). */
  refresh() {
    if (this.isOpen && (this.tab === 'skins' || this.tab === 'cannons' || this.tab === 'refit')) this.rerender();
    this.markNew();
  }

  private markNew() {
    this.root.querySelector('.sw-tab[data-tab="refit"]')?.classList.toggle('has-new', !!this.parts?.unseen.length);
    const u = this.vault?.unseen ?? [];
    const has = (k: CosmeticKind[]) => u.some((id) => k.includes(ALL.find((i) => i.id === id)?.kind as CosmeticKind));
    this.root.querySelector('.sw-tab[data-tab="skins"]')?.classList.toggle('has-new', has(['skin']));
    this.root.querySelector('.sw-tab[data-tab="cannons"]')?.classList.toggle('has-new', has(['blast', 'trail']));
  }

  /** The panel's box, so the camera can frame the ship beside it. */
  panelRect() {
    return this.panel.getBoundingClientRect();
  }

  open(look: ShipLook, place: string, cls: ShipClassId = this.cls) {
    this.cls = cls;
    this.look = structuredClone(look);
    this.place.textContent = place;
    this.root.classList.remove('hidden');
    this.flagDirty = true;
    this.render();
    this.onTab(this.tab);
  }

  close() {
    this.commitPaint();
    this.root.classList.add('hidden');
  }

  private done() {
    this.onClick();
    this.commitPaint();
    this.onDone();
  }

  private setTab(id: SwTab) {
    if (this.painting) this.commitPaint();
    this.tab = id;
    this.render();
    this.body.scrollTop = 0;
    this.onTab(id, id === 'hull' ? this.hullPart : undefined);
  }

  private changed(what: SwChange) {
    if (what !== 'name' && what !== 'hull') this.flagDirty = true;
    this.onChange(this.look, what);
  }

  // ---------------------------------------------------------------- building blocks

  private section(title: string, extra?: HTMLElement) {
    const s = el('div', 'sw-sec');
    const h = el('h3', '', title);
    if (extra) h.appendChild(extra);
    s.appendChild(h);
    this.body.appendChild(s);
    return s;
  }

  private swatches(host: HTMLElement, palette: string[], value: string, set: (v: string) => void, what: SwChange) {
    const row = el('div', 'sw-swatches');
    const all = palette.includes(value.toLowerCase()) ? palette : [...palette, value];
    for (const c of all) {
      const b = el('button', 'sw-swatch' + (c.toLowerCase() === value.toLowerCase() ? ' sel' : ''));
      b.style.setProperty('--c', c);
      b.title = c;
      b.addEventListener('click', () => {
        this.onClick();
        set(c);
        row.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        this.changed(what);
        this.refreshThumbs();
      });
      row.appendChild(b);
    }
    // any colour at all
    const lab = el('label', 'sw-swatch sw-custom');
    lab.title = 'Any colour';
    const inp = el('input');
    inp.type = 'color';
    inp.value = value;
    let raf = 0;
    inp.addEventListener('input', () => {
      set(inp.value);
      row.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel'));
      lab.classList.add('sel');
      lab.style.setProperty('--c', inp.value);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        this.changed(what);
        this.refreshThumbs();
      });
    });
    lab.appendChild(inp);
    row.appendChild(lab);
    host.appendChild(row);
  }

  private grid<T extends string>(host: HTMLElement, items: { id: T; name: string }[], value: T, thumb: (id: T) => HTMLCanvasElement, set: (v: T) => void, what: SwChange, cls = '') {
    const g = el('div', 'sw-grid ' + cls);
    for (const it of items) {
      const b = el('button', 'sw-tile' + (it.id === value ? ' sel' : ''));
      b.dataset.id = it.id;
      b.title = it.name;
      b.appendChild(thumb(it.id));
      const cap = el('span', '', it.name);
      b.appendChild(cap);
      b.addEventListener('click', () => {
        this.onClick();
        set(it.id);
        g.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        this.changed(what);
        this.refreshThumbs();
      });
      g.appendChild(b);
    }
    (g as HTMLElement & { thumb?: (id: string) => HTMLCanvasElement }).thumb = thumb as (id: string) => HTMLCanvasElement;
    host.appendChild(g);
    return g;
  }

  /** Redraws picker thumbnails so they always preview the current colours. */
  private refreshThumbs() {
    this.body.querySelectorAll('.sw-grid').forEach((g) => {
      const thumb = (g as HTMLElement & { thumb?: (id: string) => HTMLCanvasElement }).thumb;
      if (!thumb) return;
      g.querySelectorAll<HTMLElement>('.sw-tile').forEach((b) => {
        const old = b.querySelector('canvas');
        if (old) old.replaceWith(thumb(b.dataset.id!));
      });
    });
    this.body.querySelectorAll<HTMLElement>('.sw-part').forEach((b) => b.style.setProperty('--c', this.look.hull[b.dataset.id as keyof HullLook]));
  }

  // ---------------------------------------------------------------- tabs

  private render() {
    this.root.querySelectorAll<HTMLElement>('.sw-tab').forEach((b) => b.classList.toggle('sel', b.dataset.tab === this.tab));
    this.body.innerHTML = '';
    this.body.dataset.tab = this.tab;
    if (this.tab === 'flag') this.renderFlag();
    else if (this.tab === 'sails') this.renderSails();
    else if (this.tab === 'hull') this.renderHull();
    else if (this.tab === 'refit') this.renderRefit();
    else if (this.tab === 'skins') this.renderCosmetics(['skin']);
    else if (this.tab === 'cannons') this.renderCosmetics(['blast', 'trail']);
    else this.renderPresets();
  }

  private renderFlag() {
    const f = this.look.flag;
    this.body.appendChild(this.stage);
    this.renderPaintBar();
    const fd = (patch: Partial<FlagDesign>): FlagDesign => ({ ...this.look.flag, ...patch });
    this.grid(this.section('Shape'), SHAPES, f.shape, (id) => flagThumb(fd({ shape: id, paint: '' }), 64, 40), (v) => (this.look.flag.shape = v), 'flag', 'sw-grid-4');
    this.swatches(this.section('Field'), PALETTES.flag, f.bg, (v) => (this.look.flag.bg = v), 'flag');
    this.grid(this.section('Pattern'), PATTERNS, f.pattern, (id) => flagThumb(fd({ pattern: id, emblem: 'none', backing: 'none', paint: '', shape: 'square' }), 56, 35), (v) => (this.look.flag.pattern = v), 'flag', 'sw-grid-5');
    this.swatches(this.section('Pattern colour'), PALETTES.flag, f.patternColor, (v) => (this.look.flag.patternColor = v), 'flag');
    this.grid(this.section('Emblem'), EMBLEMS, f.emblem, (id) => emblemThumb(id, 'none', this.look.flag.emblemColor, this.look.flag.bg, 56), (v) => (this.look.flag.emblem = v), 'flag', 'sw-grid-4 sw-icons');
    this.grid(this.section('Behind it'), BACKINGS, f.backing, (id) => emblemThumb(this.look.flag.emblem, id, this.look.flag.emblemColor, this.look.flag.bg, 56), (v) => (this.look.flag.backing = v), 'flag', 'sw-grid-3 sw-icons');
    this.swatches(this.section('Emblem colour'), PALETTES.flag, f.emblemColor, (v) => (this.look.flag.emblemColor = v), 'flag');
    const size = this.section('Emblem size');
    const r = el('input', 'sw-range');
    r.type = 'range';
    r.min = '0.6';
    r.max = '1.4';
    r.step = '0.02';
    r.value = String(f.emblemScale);
    let raf = 0;
    r.addEventListener('input', () => {
      this.look.flag.emblemScale = parseFloat(r.value);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => this.changed('flag'));
    });
    size.appendChild(r);
  }

  private renderSails() {
    const s = this.look.sail;
    this.swatches(this.section('Sailcloth'), PALETTES.sail, s.cloth, (v) => (this.look.sail.cloth = v), 'sail');
    this.grid(this.section('Pattern'), SAIL_PATTERNS, s.pattern, (id) => sailThumb(id, this.look.sail.cloth, this.look.sail.accent), (v) => (this.look.sail.pattern = v), 'sail', 'sw-grid-3 sw-sails');
    this.swatches(this.section('Accent colour'), PALETTES.sail, s.accent, (v) => (this.look.sail.accent = v), 'sail');
    const mark = this.section('Emblem on the mainsail');
    const seg = el('div', 'sw-seg');
    for (const [v, label] of [[true, 'Show it'], [false, 'Plain']] as [boolean, string][]) {
      const b = el('button', s.mark === v ? 'sel' : '', label);
      b.addEventListener('click', () => {
        this.onClick();
        this.look.sail.mark = v;
        seg.querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x === b));
        this.changed('sail');
      });
      seg.appendChild(b);
    }
    mark.appendChild(seg);
    if (this.look.flag.emblem === 'none') mark.appendChild(el('p', 'sw-note', 'Your flag has no emblem yet. Pick one on the Flag tab.'));
    this.swatches(this.section('Emblem colour'), PALETTES.sail, s.markColor, (v) => (this.look.sail.markColor = v), 'sail');
  }

  private renderHull() {
    const parts = el('div', 'sw-parts');
    const sw = el('div');
    const show = () => {
      sw.innerHTML = '';
      const def = HULL_PARTS.find((p) => p.id === this.hullPart)!;
      this.swatches(sw, PALETTES[def.palette], this.look.hull[this.hullPart], (v) => (this.look.hull[this.hullPart] = v), 'hull');
    };
    for (const p of HULL_PARTS) {
      const b = el('button', 'sw-part' + (p.id === this.hullPart ? ' sel' : ''), `<i></i><span>${p.name}</span>`);
      b.dataset.id = p.id;
      b.style.setProperty('--c', this.look.hull[p.id]);
      b.addEventListener('click', () => {
        this.onClick();
        this.hullPart = p.id;
        parts.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        show();
        this.onTab('hull', p.id);
      });
      parts.appendChild(b);
    }
    this.section('Paintwork').appendChild(parts);
    const sec = this.section('Colour');
    sec.appendChild(sw);
    show();
  }

  /** Vault cosmetics: every item of these kinds, the ones you own ready to wear. */
  private renderCosmetics(kinds: CosmeticKind[]) {
    const v = this.vault;
    if (!v) return;
    const banner = el('button', 'sw-vault');
    banner.innerHTML = `<span class="sw-vault-chest"></span><span class="sw-vault-text"><b>Treasure Vault</b><small>${v.collected()} of ${ALL.filter((i) => !i.base).length} found · new ${kinds[0] === 'skin' ? 'skins' : 'cannon effects'} inside</small></span><span class="sw-vault-purse"><i></i>${v.purse.toLocaleString('en-US')}</span>`;
    banner.addEventListener('click', () => {
      this.onClick();
      this.onVault();
    });
    this.body.appendChild(banner);
    if (kinds[0] !== 'skin') {
      const fire = el('button', 'btn gold sw-fire', '<svg viewBox="0 0 24 24"><path d="M3 12.5l13-4 1.5 4.5-13 4z" /><circle cx="8" cy="18" r="2.5" /><path d="M18.5 9.5l2.5-1M19 12.5l2.5.5M17.5 7l1-2.5" /></svg><span>Test fire a broadside</span>');
      let cool = 0;
      fire.addEventListener('click', () => {
        if (cool) return;
        this.onTestFire();
        fire.classList.add('cool');
        cool = window.setTimeout(() => {
          cool = 0;
          fire.classList.remove('cool');
        }, 1600);
      });
      this.body.appendChild(fire);
    }
    for (const kind of kinds) {
      const items = ALL.filter((i) => i.kind === kind).sort((a, b) => {
        const oa = v.owns(a.id) ? 0 : 1;
        const ob = v.owns(b.id) ? 0 : 1;
        return a.base ? -1 : b.base ? 1 : oa - ob || b.rarity - a.rarity;
      });
      const own = items.filter((i) => v.owns(i.id)).length;
      const sec = this.section(`${KIND_NAMES[kind]}s`, el('small', 'sw-count', `${own}/${items.length}`));
      const grid = el('div', 'sw-cos');
      for (const it of items) {
        const owned = v.owns(it.id);
        const on = v.equipped[kind] === it.id;
        const b = el('button', 'sw-cos-card' + (on ? ' sel' : '') + (owned ? '' : ' locked'));
        b.style.setProperty('--rc', RARITIES[it.rarity].css);
        b.title = owned ? it.blurb : `${it.blurb} Find it in the Treasure Vault.`;
        b.appendChild(itemCanvas(it, 168, 110));
        const isNew = v.unseen.includes(it.id);
        b.appendChild(el('span', 'sw-cos-info', `<b>${it.name}</b><small>${it.base ? 'Standard' : RARITIES[it.rarity].name}</small>`));
        if (!owned) b.appendChild(el('span', 'sw-cos-lock', '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'));
        if (isNew) b.appendChild(el('span', 'sw-cos-new', 'New'));
        b.addEventListener('click', () => {
          this.onClick();
          if (!owned) {
            this.onVault();
            return;
          }
          if (v.equipped[kind] === it.id) return;
          v.equip(it.id);
          grid.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel'));
          b.classList.add('sel');
          this.onEquip(it);
        });
        grid.appendChild(b);
      }
      sec.appendChild(grid);
    }
    // what you came to look at is no longer new
    for (const k of kinds) v.markSeen(k);
  }

  /**
   * The refit: what each ship has bolted on, slot by slot, as a track from
   * the standard fitting up through the five rarities. Tap a part you own to
   * fit it (the ship at the berth is rebuilt with it); tap one you don't to
   * see what it does and where to find it.
   */
  private renderRefit() {
    const ps = this.parts;
    if (!ps) return;
    const cls = SHIP_CLASSES[this.cls];
    const fit = ps.loadout(this.cls);
    // her figures, the refit's share picked out in gold
    const head = this.section(`The ${cls.name}'s refit`, el('small', 'sw-count', `${ps.collected()}/${PARTS.length} parts found`));
    const base = cls.stats;
    const now = refitBars(cls, fit);
    const bars = el('div', 'sw-rbars');
    for (const [k, label] of [['speed', 'Speed'], ['agility', 'Agility'], ['armour', 'Armour'], ['hull', 'Hull'], ['firepower', 'Firepower']] as const) {
      const b0 = Math.min(1, base[k]);
      const b1 = Math.min(1.25, now[k]);
      const row = el('div', 'sw-rbar' + (b1 > b0 + 0.004 ? ' up' : b1 < b0 - 0.004 ? ' down' : ''));
      row.innerHTML = `<span>${label}</span><i><b style="width:${(Math.min(b0, b1) / 1.25) * 100}%"></b><em style="left:${(Math.min(b0, b1) / 1.25) * 100}%;width:${(Math.abs(b1 - b0) / 1.25) * 100}%"></em></i>`;
      bars.appendChild(row);
    }
    head.appendChild(bars);
    for (const slot of SLOTS) {
      const parts = PARTS.filter((p) => p.slot === slot).sort((a, b) => a.tier - b.tier);
      const own = parts.filter((p) => ps.owns(p.id)).length;
      const on = fit[slot];
      const sec = this.section(SLOT_NAMES[slot], el('small', 'sw-count', `${own}/${parts.length}`));
      const track = el('div', 'sw-track');
      const info = el('div', 'sw-pinfo');
      const show = (p: Part | null) => {
        info.innerHTML = '';
        info.style.setProperty('--rc', p ? PART_RARITIES[p.tier].css : 'rgba(234,242,245,0.5)');
        if (!p) {
          info.innerHTML = `<small>Standard fit</small><b>Shipwright's ${SLOT_NAMES[slot].toLowerCase()}</b><p>What she was built with. Find upgrades in chests and wrecks at sea, or buy them from the shipwright at a trading port.</p>`;
          return;
        }
        const owned = ps.owns(p.id);
        const where = owned ? null : this.whereSold(p.id);
        const lines = statLines(p.stats)
          .map((l) => `<span class="${l.bad ? 'bad' : ''}">${l.text}</span>`)
          .join('');
        info.innerHTML = `<small>${PART_RARITIES[p.tier].name} · ${SLOT_NAMES[slot]}</small><b>${p.name}</b><p>${p.blurb}</p><div class="sw-pstats">${lines}</div>${
          owned ? (fit[slot] === p.id ? '<em class="on">Fitted</em>' : '') : `<em class="find">${where ? `For sale today at ${where}` : 'Not found yet · chests, wrecks and port shipwrights'}</em>`
        }`;
      };
      const nodes: HTMLButtonElement[] = [];
      const select = (b: HTMLButtonElement) => nodes.forEach((x) => x.classList.toggle('sel', x === b));
      const std = el('button', 'sw-node std' + (!on ? ' sel' : ''), `${standardIcon(slot)}<span>Standard</span>`);
      std.style.setProperty('--rc', 'rgba(234,242,245,0.55)');
      std.addEventListener('click', () => {
        this.onClick();
        this.picked[slot] = '';
        show(null);
        this.onTab('refit', slot);
        if (!ps.equipped(this.cls, slot)) return;
        ps.equip(this.cls, slot, null);
        select(std);
        this.onFit(slot, null);
        this.refreshBars();
      });
      nodes.push(std);
      track.appendChild(std);
      for (const p of parts) {
        const owned = ps.owns(p.id);
        const R = PART_RARITIES[p.tier];
        const b = el('button', `sw-node t${p.tier}` + (on === p.id ? ' sel' : '') + (owned ? ' owned' : ' locked') + (ps.unseen.includes(p.id) ? ' new' : ''));
        b.style.setProperty('--rc', R.css);
        b.style.setProperty('--rd', R.deep);
        b.title = p.name;
        b.innerHTML = `<i class="sw-node-art">${partIcon(p)}</i><span>${R.name}</span>${owned ? '' : '<i class="sw-node-lock"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></i>'}`;
        b.addEventListener('click', () => {
          this.onClick();
          this.picked[slot] = p.id;
          b.classList.remove('new');
          this.onTab('refit', slot);
          if (owned && ps.equipped(this.cls, slot) !== p.id) {
            ps.equip(this.cls, slot, p.id);
            select(b);
            this.onFit(slot, p.id);
            this.refreshBars();
            b.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(.3,1.6,.5,1)' });
          }
          show(p);
          info.animate([{ opacity: 0.4, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
        });
        nodes.push(b);
        track.appendChild(b);
      }
      sec.append(track, info);
      const pick = this.picked[slot];
      show(pick === '' ? null : PARTS.find((p) => p.id === (pick ?? on)) ?? null);
    }
    // what you came to look at is no longer new
    ps.markSeen();
  }

  /** Redraws the refit's stat bars after a change. */
  private refreshBars() {
    const ps = this.parts;
    if (!ps || this.tab !== 'refit') return;
    const cls = SHIP_CLASSES[this.cls];
    const now = refitBars(cls, ps.loadout(this.cls));
    const keys = ['speed', 'agility', 'armour', 'hull', 'firepower'] as const;
    this.body.querySelectorAll<HTMLElement>('.sw-rbar').forEach((row, i) => {
      const b0 = Math.min(1, cls.stats[keys[i]]);
      const b1 = Math.min(1.25, now[keys[i]]);
      row.className = 'sw-rbar' + (b1 > b0 + 0.004 ? ' up' : b1 < b0 - 0.004 ? ' down' : '');
      (row.querySelector('b') as HTMLElement).style.width = `${(Math.min(b0, b1) / 1.25) * 100}%`;
      const em = row.querySelector('em') as HTMLElement;
      em.style.left = `${(Math.min(b0, b1) / 1.25) * 100}%`;
      em.style.width = `${(Math.abs(b1 - b0) / 1.25) * 100}%`;
    });
  }

  private renderPresets() {
    const name = this.section('Ship\'s name');
    const row = el('div', 'sw-name');
    const inp = el('input');
    inp.type = 'text';
    inp.maxLength = 24;
    inp.placeholder = 'Name your ship';
    inp.value = this.look.name;
    inp.spellcheck = false;
    inp.addEventListener('input', () => {
      this.look.name = inp.value.replace(/[<>]/g, '').slice(0, 24);
      this.changed('name');
      this.syncSave();
    });
    const dice = el('button', 'sw-chip', '⚄');
    dice.title = 'A random name';
    dice.addEventListener('click', () => {
      this.onClick();
      inp.value = this.look.name = randomShipName();
      this.changed('name');
      this.syncSave();
    });
    row.append(inp, dice);
    name.appendChild(row);
    this.renderDesigns();
    const list = el('div', 'sw-presets');
    for (const p of PRESETS) {
      const b = this.presetCard(p.look, p.name, sameStyle(p.look, this.look) ? 'sel' : '');
      b.addEventListener('click', () => {
        this.onClick();
        this.commitPaint();
        this.look = { ...structuredClone(p.look), name: this.look.name };
        this.changed('all');
        // re-render so the save card and the highlights follow the new look
        this.rerender();
      });
      list.appendChild(b);
    }
    this.section('Famous colours').appendChild(list);
  }

  /** A preset card: flag thumbnail, name and the main colours. */
  private presetCard(look: Omit<ShipLook, 'name'>, name: string, cls = '') {
    const b = el('button', 'sw-preset' + (cls ? ' ' + cls : ''));
    const thumb = flagThumb(look.flag, 84, 52);
    b.appendChild(thumb);
    // a hand-painted flag decodes in the background; redraw the thumbnail once it has
    if (look.flag.paint && !paintSource(look.flag.paint)) {
      void preloadPaint(look.flag.paint).then(() => thumb.replaceWith(flagThumb(look.flag, 84, 52)));
    }
    const info = el('div');
    info.appendChild(el('b', '', name));
    const dots = el('span', 'sw-dots');
    for (const c of [look.hull.topsides, look.hull.planks, look.sail.cloth, look.sail.accent, look.hull.gilding]) {
      const d = el('i');
      d.style.background = c;
      dots.appendChild(d);
    }
    info.appendChild(dots);
    b.appendChild(info);
    return b;
  }

  /** The player's own saved designs, with a card to save the current one. */
  private renderDesigns() {
    const designs = loadDesigns();
    const list = el('div', 'sw-presets');
    const full = designs.length >= MAX_SAVED;
    const add = el('button', 'sw-preset sw-save');
    // renaming the ship can turn a saved design into a new one, so this follows the name field
    this.syncSave = () => {
      const saved = designs.some((d) => sameDesign(d.look, this.look));
      add.innerHTML = saved
        ? '<span class="sw-plus">✓</span><b>Saved</b><small>This design is in your collection</small>'
        : full
          ? `<span class="sw-plus">⚓</span><b>Hold is full</b><small>Delete a design to save more (max ${MAX_SAVED})</small>`
          : '<span class="sw-plus">+</span><b>Save this design</b><small>Keep it to sail with later</small>';
      add.disabled = saved || full;
    };
    this.syncSave();
    add.addEventListener('click', () => {
      this.onClick();
      this.commitPaint();
      const look = structuredClone(this.look);
      // a second design for the same ship becomes "Sea Biscuit II", and so on
      const base = look.name.trim() || 'Design';
      const taken = new Set(designs.map((d) => d.name));
      const numerals = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X', ' XI', ' XII', ' XIII'];
      const name = numerals.map((n) => base + n).find((n) => !taken.has(n)) ?? base;
      const next: SavedDesign[] = [{ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, look }, ...designs];
      if (!saveDesigns(next)) {
        add.innerHTML = '<span class="sw-plus">!</span><b>Couldn\'t save</b><small>Your browser is out of room for saved designs</small>';
        return;
      }
      this.rerender();
    });
    list.appendChild(add);

    for (const d of designs) {
      const card = this.presetCard(d.look, d.name, sameDesign(d.look, this.look) ? 'sel' : '');
      const del = el('span', 'sw-del', '×');
      del.title = 'Delete this design';
      del.setAttribute('role', 'button');
      let armed = 0;
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onClick();
        // first tap arms, second tap deletes
        if (!armed) {
          card.classList.add('arm');
          del.textContent = 'Delete?';
          armed = window.setTimeout(() => {
            armed = 0;
            card.classList.remove('arm');
            del.textContent = '×';
          }, 4000);
          return;
        }
        clearTimeout(armed);
        saveDesigns(loadDesigns().filter((x) => x.id !== d.id));
        this.rerender();
      });
      card.appendChild(del);
      card.addEventListener('click', () => {
        this.onClick();
        this.commitPaint();
        this.look = structuredClone(d.look);
        this.changed('all');
        this.rerender();
      });
      list.appendChild(card);
    }
    this.section('Your designs').appendChild(list);
  }

  /** Re-renders the open tab without jumping the scroll position. */
  private rerender() {
    const top = this.body.scrollTop;
    this.render();
    this.body.scrollTop = top;
  }

  // ---------------------------------------------------------------- painting

  private renderPaintBar() {
    this.stage.classList.toggle('painting', this.painting);
    this.paintBtn.innerHTML = this.painting ? '<span>✓</span> Done painting' : '<span>✎</span> Paint';
    const bar = this.paintBar;
    bar.innerHTML = '';
    if (!this.painting) return;
    const f = this.look.flag;
    const cols = [...new Set([f.emblemColor, f.patternColor, '#141212', '#f3ecdc', '#b8262b', '#f2c45a', '#1fa3a0', '#2f7d3a'])];
    for (const c of cols) {
      const b = el('button', 'sw-swatch small' + (!this.brush.erase && c === this.brush.color ? ' sel' : ''));
      b.style.setProperty('--c', c);
      b.addEventListener('click', () => {
        this.brush.color = c;
        this.brush.erase = false;
        this.renderPaintBar();
      });
      bar.appendChild(b);
    }
    const tool = (label: string, title: string, on: boolean, fn: () => void) => {
      const b = el('button', 'sw-tool' + (on ? ' sel' : ''), label);
      b.title = title;
      b.addEventListener('click', () => {
        fn();
        this.renderPaintBar();
      });
      bar.appendChild(b);
    };
    for (const [s, n] of [[6, 'S'], [12, 'M'], [24, 'L']] as [number, string][]) tool(`<i style="--s:${s / 2.4}px"></i>`, `Brush ${n}`, this.brush.size === s, () => (this.brush.size = s));
    tool('⌫', 'Eraser', this.brush.erase, () => (this.brush.erase = !this.brush.erase));
    tool('↶', 'Undo', false, () => this.popUndo());
    tool('✕', 'Clear', false, () => {
      if (!this.paint) return;
      this.pushUndo();
      this.paint.getContext('2d')!.clearRect(0, 0, PAINT_W, PAINT_H);
      this.changed('paint');
    });
  }

  private startPaint() {
    const c = document.createElement('canvas');
    c.width = PAINT_W;
    c.height = PAINT_H;
    const old = paintSource(this.look.flag.paint);
    if (old) c.getContext('2d')!.drawImage(old, 0, 0, PAINT_W, PAINT_H);
    this.paint = c;
    this.undo = [];
    this.painting = true;
    setLivePaint(LIVE, c);
    this.look.flag.paint = LIVE;
    this.brush.color = this.look.flag.emblemColor;
    this.flagDirty = true;
  }

  /** Bakes the live paint layer into a saved PNG. */
  private commitPaint() {
    if (!this.painting || !this.paint) return;
    this.painting = false;
    const c = this.paint;
    const d = c.getContext('2d')!.getImageData(0, 0, PAINT_W, PAINT_H).data;
    let any = false;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] > 8) {
        any = true;
        break;
      }
    }
    let key = '';
    if (any) {
      key = c.toDataURL('image/png');
      seedPaint(key, c);
    }
    setLivePaint(LIVE, null);
    this.look.flag.paint = key;
    this.paint = null;
    this.changed('flag');
    this.renderPaintBar();
  }

  private pushUndo() {
    if (!this.paint) return;
    this.undo.push(this.paint.getContext('2d')!.getImageData(0, 0, PAINT_W, PAINT_H));
    if (this.undo.length > 20) this.undo.shift();
  }

  private popUndo() {
    const img = this.undo.pop();
    if (!img || !this.paint) return;
    this.paint.getContext('2d')!.putImageData(img, 0, 0);
    this.changed('paint');
  }

  private toPaint(e: PointerEvent) {
    const r = this.flagCanvas.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    // the flag occupies the preview box minus the pole margin
    const m = this.flagBox(r.width, r.height);
    return { x: ((fx * r.width - m.x) / m.w) * PAINT_W, y: ((fy * r.height - m.y) / m.h) * PAINT_H };
  }

  private paintDown(e: PointerEvent) {
    if (!this.painting || !this.paint) return;
    e.preventDefault();
    this.flagCanvas.setPointerCapture(e.pointerId);
    this.pushUndo();
    this.stroke = this.toPaint(e);
    this.dab(this.stroke, this.stroke);
  }

  private paintMove(e: PointerEvent) {
    if (!this.stroke || !this.paint) return;
    const p = this.toPaint(e);
    this.dab(this.stroke, p);
    this.stroke = p;
  }

  private dab(a: { x: number; y: number }, b: { x: number; y: number }) {
    const g = this.paint!.getContext('2d')!;
    g.save();
    g.globalCompositeOperation = this.brush.erase ? 'destination-out' : 'source-over';
    g.strokeStyle = this.brush.color;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = this.brush.size * (PAINT_W / 256);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x + 0.01, b.y);
    g.stroke();
    g.restore();
    this.flagDirty = true;
    cancelAnimationFrame(this.paintRaf);
    this.paintRaf = requestAnimationFrame(() => this.onChange(this.look, 'paint'));
  }

  private paintRaf = 0;

  // ---------------------------------------------------------------- preview

  private flagBox(w: number, h: number) {
    const fw = w * 0.82;
    const fh = fw * 0.62;
    const s = Math.min(1, (h * 0.86) / fh);
    return { x: w * 0.12, y: (h - fh * s) / 2 - h * 0.02, w: fw * s, h: fh * s };
  }

  /** Animates the flag preview; call every frame while open. */
  tick(dt: number) {
    if (!this.isOpen || this.tab !== 'flag') return;
    this.t += dt;
    const cv = this.flagCanvas;
    const r = cv.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = Math.round(r.width * dpr);
    const H = Math.round(r.height * dpr);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
      this.flagDirty = true;
    }
    const box = this.flagBox(W, H);
    if (this.flagDirty) {
      this.flagDirty = false;
      this.flagImg.width = Math.round(box.w);
      this.flagImg.height = Math.round(box.h);
      drawFlag(this.flagImg.getContext('2d')!, this.flagImg.width, this.flagImg.height, this.look.flag);
    }
    const g = cv.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    // pole
    const px = box.x - 4 * dpr;
    const grad = g.createLinearGradient(px - 4 * dpr, 0, px + 4 * dpr, 0);
    grad.addColorStop(0, '#5a3d26');
    grad.addColorStop(0.5, '#a8794c');
    grad.addColorStop(1, '#4a2e18');
    g.fillStyle = grad;
    g.fillRect(px - 3 * dpr, box.y - 14 * dpr, 6 * dpr, H - box.y + 10 * dpr);
    g.fillStyle = '#efc463';
    g.beginPath();
    g.arc(px, box.y - 16 * dpr, 6 * dpr, 0, Math.PI * 2);
    g.fill();
    const img = this.flagImg;
    if (this.painting) {
      g.drawImage(img, box.x, box.y, box.w, box.h);
      g.strokeStyle = 'rgba(255,240,210,0.35)';
      g.setLineDash([6 * dpr, 6 * dpr]);
      g.strokeRect(box.x - 1, box.y - 1, box.w + 2, box.h + 2);
      g.setLineDash([]);
      return;
    }
    // waving: vertical strips displaced and shaded by a travelling wave
    const strips = Math.max(24, Math.round(box.w / (3 * dpr)));
    const sw = box.w / strips;
    const amp = box.h * 0.07;
    for (let i = 0; i < strips; i++) {
      const u = i / strips;
      const ph = this.t * 3.2 - u * 7.5;
      const dy = Math.sin(ph) * amp * u + Math.sin(this.t * 1.7 - u * 4) * amp * 0.25 * u;
      const sx = (u * img.width) | 0;
      const sww = Math.ceil(img.width / strips) + 1;
      g.drawImage(img, sx, 0, sww, img.height, box.x + i * sw, box.y + dy, sw + 1, box.h);
      const shade = Math.cos(ph) * u;
      if (Math.abs(shade) > 0.02) {
        g.fillStyle = shade > 0 ? `rgba(255,250,235,${shade * 0.16})` : `rgba(0,0,0,${-shade * 0.24})`;
        g.globalCompositeOperation = 'source-atop';
        g.fillRect(box.x + i * sw, box.y + dy - 2, sw + 1, box.h + 4);
        g.globalCompositeOperation = 'source-over';
      }
    }
  }
}
