import './customizer.css';
import {
  BACKINGS, drawFlag, emblemThumb, EMBLEMS, FlagDesign, flagThumb, PATTERNS, paintSource, preloadPaint, seedPaint, setLivePaint, SHAPES,
} from '../ships/heraldry';
import {
  DEFAULT_LOOK, HULL_PARTS, HullLook, loadDesigns, MAX_SAVED, PALETTES, PRESETS, randomLook, randomShipName, SAIL_PATTERNS, SailPattern, sameDesign,
  SavedDesign, saveDesigns, sameStyle, ShipLook,
} from '../ships/look';

// The shipwright's panel: flag, sails, hull and presets, with a living flag
// preview you can paint on. Changes stream out through onChange so the ship
// moored in the harbour updates as you go.

export type SwTab = 'flag' | 'sails' | 'hull' | 'presets';
export type SwChange = 'flag' | 'paint' | 'sail' | 'hull' | 'name' | 'all';

const LIVE = 'live';
const PAINT_W = 384;
const PAINT_H = 238;

const ICONS: Record<SwTab, string> = {
  flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4" /><path d="M5 4h12l-2.5 4L17 12H5" /></svg>',
  sails: '<svg viewBox="0 0 24 24"><path d="M12 3v17" /><path d="M12 4c4 3 6 8 6 13h-6" /><path d="M11 6c-3 3-5 7-5 11h5" /><path d="M4 20h16" /></svg>',
  hull: '<svg viewBox="0 0 24 24"><path d="M3 13h18l-2.5 6h-13z" /><path d="M7 13V9h7v4" /><path d="M10 9V5" /></svg>',
  presets: '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z" /></svg>',
};

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
    (['flag', 'sails', 'hull', 'presets'] as SwTab[]).forEach((id) => {
      const b = el('button', 'sw-tab', `${ICONS[id]}<span>${id[0].toUpperCase() + id.slice(1)}</span>`);
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

  /** The panel's box, so the camera can frame the ship beside it. */
  panelRect() {
    return this.panel.getBoundingClientRect();
  }

  open(look: ShipLook, place: string) {
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
