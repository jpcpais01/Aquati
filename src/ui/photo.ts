import './photo.css';
import * as THREE from 'three';
import { ICONS, icon } from './art';
import { PhotoCamera } from '../game/photoCam';
import type { PhotoLook } from '../render/pipeline';
import { WEATHER, WeatherKind } from '../world/atmosphere';

// Photo mode: the voyage holds its breath, every bit of HUD steps aside and a
// free camera roams the frozen scene. A side card (a bottom sheet on phones)
// sets the lens, the sky and a film look; one tap on the scene hides even
// that; the shutter saves a PNG, or hands it to the share sheet on a phone.
// Everything it changes on screen is a uniform of the final pass, so opening
// it never compiles a shader.

interface Filter {
  id: string;
  name: string;
  sat: number;
  con: number;
  fade: number;
  grain: number;
  vig: number;
  tint: [number, number, number];
  mono: [number, number, number];
  monoAmt: number;
  /** The chip's little preview swatch. */
  sw: string;
}

const FILTERS: Filter[] = [
  { id: 'natural', name: 'Natural', sat: 1, con: 1, fade: 0, grain: 0, vig: 0, tint: [1, 1, 1], mono: [1, 1, 1], monoAmt: 0, sw: 'linear-gradient(135deg,#5ee3d4,#2b8fc4 55%,#f4c765)' },
  { id: 'vivid', name: 'Vivid', sat: 1.32, con: 1.12, fade: 0, grain: 0, vig: 0.12, tint: [1.01, 1, 0.99], mono: [1, 1, 1], monoAmt: 0, sw: 'linear-gradient(135deg,#00f0d0,#0070ff 55%,#ffb300)' },
  { id: 'golden', name: 'Golden', sat: 1.12, con: 1.06, fade: 0.06, grain: 0, vig: 0.18, tint: [1.1, 1, 0.82], mono: [1, 1, 1], monoAmt: 0, sw: 'linear-gradient(135deg,#ffd27a,#f08a3c 60%,#8a4b2a)' },
  { id: 'lagoon', name: 'Lagoon', sat: 1.18, con: 1.04, fade: 0.04, grain: 0, vig: 0.1, tint: [0.9, 1.04, 1.07], mono: [1, 1, 1], monoAmt: 0, sw: 'linear-gradient(135deg,#bff7ef,#27c7c0 50%,#0b5d79)' },
  { id: 'moonlit', name: 'Moonlit', sat: 0.72, con: 1.1, fade: 0.08, grain: 0.012, vig: 0.3, tint: [0.8, 0.93, 1.18], mono: [1, 1, 1], monoAmt: 0, sw: 'linear-gradient(135deg,#c9dcff,#4a6ea8 55%,#0d1830)' },
  { id: 'film', name: 'Faded film', sat: 0.86, con: 0.94, fade: 0.32, grain: 0.03, vig: 0.22, tint: [1.05, 1, 0.92], mono: [1, 1, 1], monoAmt: 0, sw: 'linear-gradient(135deg,#efe1c6,#9cb7a8 55%,#6b5a52)' },
  { id: 'noir', name: 'Noir', sat: 1, con: 1.34, fade: 0, grain: 0.03, vig: 0.42, tint: [1, 1, 1], mono: [1, 1, 1], monoAmt: 1, sw: 'linear-gradient(135deg,#f2f2f2,#6d6d6d 55%,#0c0c0c)' },
  { id: 'chart', name: 'Old chart', sat: 1, con: 1.08, fade: 0.2, grain: 0.035, vig: 0.4, tint: [1, 1, 1], mono: [1.12, 0.95, 0.72], monoAmt: 1, sw: 'linear-gradient(135deg,#f6e6c2,#b58a52 55%,#4a2f17)' },
];

const FRAMES: [string, string, number][] = [
  ['free', 'Full', 0],
  ['16:9', '16:9', 16 / 9],
  ['3:2', '3:2', 1.5],
  ['1:1', '1:1', 1],
  ['4:5', '4:5', 0.8],
  ['9:16', '9:16', 9 / 16],
  ['cine', 'Cinema', 2.39],
];

const WEATHERS: (WeatherKind | 'asis')[] = ['asis', 'clear', 'fair', 'cloudy', 'mist', 'rain', 'storm', 'calm', 'hot', 'embers'];

type Tab = 'camera' | 'scene' | 'lens' | 'filter';
const TABS: [Tab, string][] = [
  ['camera', 'Camera'],
  ['scene', 'Sky'],
  ['lens', 'Lens'],
  ['filter', 'Filter'],
];

/** Focus slider: 0 auto, otherwise 2 m .. 800 m on a log scale. */
const focusToSlider = (m: number) => Math.round(Math.max(1, (Math.log(m / 2) / Math.log(400)) * 100));
const sliderToFocus = (v: number) => 2 * Math.pow(400, v / 100);

const clockText = (h: number) => {
  const m = Math.round(h * 60) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

interface Range {
  input: HTMLInputElement;
  set(v: number): void;
}

const _v = new THREE.Vector3();

export class PhotoMode {
  readonly cam = new PhotoCamera();
  active = false;
  /** Where the shot came from: the pause menu, or straight from the helm. */
  fromPause = false;
  hour = 12;
  weather: WeatherKind | null = null;
  dof = 0;
  /** Manual focus distance in metres, or 0 to focus on whatever sits mid-frame. */
  focus = 0;
  /** Eased auto-focus distance, kept by the game. */
  autoFocus = 60;
  exposure = 0;
  private filter = FILTERS[0];
  private strength = 1;
  private vignette = 0;
  private grain = 0;
  private frame = 0;
  private grid = false;
  private tab: Tab = 'camera';
  private bare = false;

  onScene: (hour: number, weather: WeatherKind | null) => void = () => {};
  onCapture: () => void = () => {};
  onClose: () => void = () => {};
  onClick: () => void = () => {};
  /** View depth (m) of whatever sits under a screen point, in NDC; null if only sky. */
  pickAt: (x: number, y: number) => number | null = () => null;

  private root: HTMLElement;
  private frameEl: HTMLElement;
  private body: HTMLElement;
  private savedEl: HTMLElement;
  private ranges: Record<string, Range> = {};
  private keys = new Set<string>();
  private ptrs = new Map<number, { x: number; y: number }>();
  private down = { x: 0, y: 0, t: 0, moved: false, button: 0 };
  private lastTap = { x: 0, y: 0, t: 0 };
  private tapTimer = 0;
  private savedTimer = 0;
  private savedUrl = '';

  constructor(private canvas: HTMLCanvasElement) {
    const root = document.createElement('div');
    root.id = 'photo';
    root.className = 'hidden';
    root.innerHTML = `
      <div class="ph-frame"><div class="ph-grid"><i></i><i></i><i></i><i></i></div></div>
      <div class="ph-chrome">
        <header class="ph-top">
          <div class="ph-title">
            <div class="kicker">${icon(ICONS.camera)}Photo mode</div>
            <div class="ph-hint kd">Drag to orbit · <kbd>Right drag</kbd> pan · <kbd>Wheel</kbd> zoom · <kbd>WASD</kbd> <kbd>Q</kbd><kbd>E</kbd> move · <kbd>[</kbd><kbd>]</kbd> roll · double-click to focus</div>
            <div class="ph-hint touch-only">Drag to orbit · two fingers pan and zoom · double-tap to focus · tap to hide</div>
          </div>
          <div class="ph-tools">
            <button class="round-btn" data-act="hide" title="Hide controls (H)" aria-label="Hide controls">${icon(ICONS.eyeOff)}</button>
            <button class="round-btn" data-act="close" title="Leave photo mode (Esc)" aria-label="Leave photo mode">${icon(ICONS.close)}</button>
          </div>
        </header>
        <aside class="ph-card">
          <nav class="seg ph-tabs" role="tablist">${TABS.map(([id, n]) => `<button role="tab" data-tab="${id}">${n}</button>`).join('')}</nav>
          <div class="ph-body"></div>
        </aside>
        <footer class="ph-foot">
          <div class="seg ph-mode" role="radiogroup" aria-label="Camera">
            <button data-mode="orbit" title="Orbit round a point">${icon(ICONS.orbit)}<span>Orbit</span></button>
            <button data-mode="fly" title="Fly freely (F)">${icon(ICONS.fly)}<span>Fly</span></button>
          </div>
          <button class="ph-shutter" data-act="shot" title="Take photo (Space)" aria-label="Take photo"><i></i>${icon(ICONS.camera)}</button>
          <div class="ph-foot-r">
            <button class="round-btn" data-act="reset" title="Reset camera (R)" aria-label="Reset camera">${icon(ICONS.refresh)}</button>
          </div>
        </footer>
      </div>
      <div class="ph-flash"></div>
      <div class="ph-saved" aria-live="polite"><img alt="" /><span><b></b><small></small></span></div>`;
    document.body.appendChild(root);
    this.root = root;
    this.frameEl = root.querySelector('.ph-frame')!;
    this.body = root.querySelector('.ph-body')!;
    this.savedEl = root.querySelector('.ph-saved')!;

    root.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        this.onClick();
        this.showTab(b.dataset.tab as Tab);
      }),
    );
    root.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => {
        this.onClick();
        this.setMode(b.dataset.mode as 'orbit' | 'fly');
      }),
    );
    root.querySelectorAll<HTMLElement>('[data-act]').forEach((b) =>
      b.addEventListener('click', (e) => {
        (e.currentTarget as HTMLElement).blur();
        const a = b.dataset.act;
        if (a === 'shot') this.onCapture();
        else {
          this.onClick();
          if (a === 'hide') this.setBare(true);
          else if (a === 'close') this.onClose();
          else if (a === 'reset') this.cam.reset();
        }
      }),
    );

    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onUp(e, true));
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.active) return;
        e.preventDefault();
        const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
        this.cam.zoom(Math.exp(Math.max(-240, Math.min(240, px)) * 0.0016));
      },
      { passive: false },
    );
    addEventListener('keydown', (e) => this.onKey(e));
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('resize', () => this.active && this.layoutFrame());
  }

  // ------------------------------------------------------------------ open & close

  open(cam: THREE.PerspectiveCamera, anchor: THREE.Vector3, hour: number, fromPause: boolean) {
    this.active = true;
    this.fromPause = fromPause;
    this.cam.anchor.copy(anchor);
    this.cam.mode = 'orbit';
    this.cam.begin(cam, anchor.y);
    this.hour = hour;
    this.weather = null;
    this.focus = 0;
    this.autoFocus = this.cam.shownDist;
    this.keys.clear();
    this.ptrs.clear();
    this.setBare(false);
    this.root.classList.remove('hidden');
    this.showTab(this.tab);
    this.syncMode();
    this.layoutFrame();
  }

  close() {
    this.active = false;
    this.root.classList.add('hidden');
    this.hideSaved();
    clearTimeout(this.tapTimer);
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  // ------------------------------------------------------------------ per frame

  update(dt: number, cam: THREE.PerspectiveCamera) {
    const k = this.keys;
    const x = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0) + (k.has('arrowright') ? 1 : 0) - (k.has('arrowleft') ? 1 : 0);
    const z = (k.has('w') ? 1 : 0) - (k.has('s') ? 1 : 0) + (k.has('arrowup') ? 1 : 0) - (k.has('arrowdown') ? 1 : 0);
    const y = (k.has('e') ? 1 : 0) - (k.has('q') ? 1 : 0);
    this.cam.move(dt, Math.sign(x), y, Math.sign(z), k.has('shift'));
    const r = (k.has(']') ? 1 : 0) - (k.has('[') ? 1 : 0);
    if (r) {
      this.cam.roll = Math.max(-45, Math.min(45, this.cam.roll + r * 40 * dt));
      this.ranges.roll?.set(this.cam.roll);
    }
    this.cam.update(dt, cam);
  }

  /** The lens and film look for the final pass. */
  look(waterY: number): PhotoLook {
    const f = this.filter;
    const s = this.strength;
    const mix = (a: number, b: number) => a + (b - a) * s;
    return {
      saturation: mix(1, f.sat),
      contrast: mix(1, f.con),
      fade: f.fade * s,
      grain: f.grain * s + this.grain * 0.09,
      vignette: f.vig * s + this.vignette * 1.1,
      tint: [mix(1, f.tint[0]), mix(1, f.tint[1]), mix(1, f.tint[2])],
      mono: f.mono,
      monoAmount: f.monoAmt * s,
      focus: this.focus || this.autoFocus,
      aperture: this.dof > 0 ? Math.pow(this.dof, 1.4) * 5 : 0,
      waterY,
    };
  }

  /** The shot's crop as fractions of the screen (the frame ratio's window). */
  crop() {
    const W = innerWidth;
    const H = innerHeight;
    const A = FRAMES[this.frame][2];
    if (!A) return { x: 0, y: 0, w: 1, h: 1 };
    if (A > W / H) {
      const h = W / A / H;
      return { x: 0, y: (1 - h) / 2, w: 1, h };
    }
    const w = (H * A) / W;
    return { x: (1 - w) / 2, y: 0, w, h: 1 };
  }

  // ------------------------------------------------------------------ feedback

  /** The shutter fires: a white blink, then the shot slides in as a thumbnail. */
  flash() {
    const f = this.root.querySelector<HTMLElement>('.ph-flash')!;
    f.classList.remove('on');
    void f.offsetWidth;
    f.classList.add('on');
  }

  saved(blob: Blob, title: string, line: string) {
    this.hideSaved();
    this.savedUrl = URL.createObjectURL(blob);
    const el = this.savedEl;
    el.querySelector('img')!.src = this.savedUrl;
    el.querySelector('b')!.textContent = title;
    el.querySelector('small')!.textContent = line;
    el.classList.add('on');
    this.savedTimer = window.setTimeout(() => this.hideSaved(), 4200);
  }

  private hideSaved() {
    clearTimeout(this.savedTimer);
    this.savedEl.classList.remove('on');
    const url = this.savedUrl;
    this.savedUrl = '';
    // let the thumbnail finish sliding away before its image goes
    if (url) setTimeout(() => URL.revokeObjectURL(url), 600);
  }

  // ------------------------------------------------------------------ card

  private setBare(on: boolean) {
    this.bare = on;
    this.root.classList.toggle('bare', on);
  }

  private setMode(m: 'orbit' | 'fly') {
    this.cam.mode = m;
    this.syncMode();
  }

  private syncMode() {
    this.root.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) => {
      const on = b.dataset.mode === this.cam.mode;
      b.classList.toggle('sel', on);
      b.setAttribute('aria-checked', String(on));
    });
  }

  private layoutFrame() {
    const c = this.crop();
    const s = this.frameEl.style;
    s.setProperty('--fx', `${c.x * 100}%`);
    s.setProperty('--fy', `${c.y * 100}%`);
    this.frameEl.classList.toggle('cropped', c.w < 1 || c.h < 1);
    this.frameEl.classList.toggle('grid', this.grid);
  }

  private showTab(t: Tab) {
    this.tab = t;
    this.root.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => {
      b.classList.toggle('sel', b.dataset.tab === t);
      b.setAttribute('aria-selected', String(b.dataset.tab === t));
    });
    this.ranges = {};
    const b = this.body;
    b.innerHTML = '';
    if (t === 'camera') {
      this.range('fov', 'Field of view', 15, 100, 1, this.cam.fov, (v) => `${Math.round(v)}°`, (v) => (this.cam.fov = v));
      this.range('roll', 'Roll', -45, 45, 0.5, this.cam.roll, (v) => `${v > 0 ? '+' : ''}${Math.round(v)}°`, (v) => (this.cam.roll = Math.abs(v) < 1.2 ? 0 : v));
      this.chips(
        'Frame',
        FRAMES.map(([, n], i) => ({ id: String(i), label: n })),
        String(this.frame),
        (id) => {
          this.frame = +id;
          this.layoutFrame();
        },
      );
      this.chips('Guides', [{ id: 'grid', label: `${icon(ICONS.grid)}Thirds grid` }], this.grid ? 'grid' : '', () => {
        this.grid = !this.grid;
        this.layoutFrame();
        return this.grid ? 'grid' : '';
      });
    } else if (t === 'scene') {
      this.range('hour', 'Time of day', 0, 24, 0.05, this.hour, clockText, (v) => {
        this.hour = v;
        this.onScene(this.hour, this.weather);
      });
      this.chips(
        'Weather',
        WEATHERS.map((w) => ({ id: w, label: w === 'asis' ? 'As it was' : WEATHER[w].name })),
        this.weather ?? 'asis',
        (id) => {
          this.weather = id === 'asis' ? null : (id as WeatherKind);
          this.onScene(this.hour, this.weather);
        },
      );
      this.note('The sea keeps its swell, so every ship stays afloat on it.');
    } else if (t === 'lens') {
      this.range('dof', 'Depth of field', 0, 1, 0.01, this.dof, (v) => (v <= 0 ? 'Off' : `f/${(22 - v * 20.6).toFixed(1)}`), (v) => (this.dof = v));
      this.range(
        'focus',
        'Focus',
        0,
        100,
        1,
        this.focus ? focusToSlider(this.focus) : 0,
        (v) => (v <= 0 ? 'Auto' : `${Math.round(sliderToFocus(v))} m`),
        (v) => (this.focus = v <= 0 ? 0 : sliderToFocus(v)),
      );
      this.range('ev', 'Exposure', -2, 2, 0.05, this.exposure, (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} EV`, (v) => (this.exposure = Math.abs(v) < 0.08 ? 0 : v));
      this.note(this.isTouch() ? 'Double-tap the scene to focus on that spot.' : 'Double-click the scene to focus on that spot.');
    } else {
      const g = document.createElement('div');
      g.className = 'ph-filters';
      for (const f of FILTERS) {
        const btn = document.createElement('button');
        btn.className = 'ph-filter';
        btn.classList.toggle('sel', f === this.filter);
        btn.innerHTML = `<i style="background:${f.sw}"></i><span>${f.name}</span>`;
        btn.addEventListener('click', () => {
          this.onClick();
          this.filter = f;
          g.querySelectorAll('.ph-filter').forEach((x) => x.classList.toggle('sel', x === btn));
        });
        g.appendChild(btn);
      }
      b.appendChild(g);
      this.range('strength', 'Strength', 0, 1, 0.01, this.strength, (v) => `${Math.round(v * 100)}%`, (v) => (this.strength = v));
      this.range('vig', 'Vignette', -0.5, 1, 0.01, this.vignette, (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`, (v) => (this.vignette = Math.abs(v) < 0.03 ? 0 : v));
      this.range('grain', 'Film grain', 0, 1, 0.01, this.grain, (v) => `${Math.round(v * 100)}`, (v) => (this.grain = v));
    }
  }

  private isTouch() {
    return document.body.classList.contains('is-touch');
  }

  private range(key: string, label: string, min: number, max: number, step: number, value: number, fmt: (v: number) => string, on: (v: number) => void) {
    const row = document.createElement('label');
    row.className = 'ph-row';
    row.innerHTML = `<span class="ph-l">${label}</span><output></output><input type="range" min="${min}" max="${max}" step="${step}" />`;
    const input = row.querySelector('input')!;
    const out = row.querySelector('output')!;
    const paint = (v: number) => {
      out.textContent = fmt(v);
      input.style.setProperty('--p', `${((v - min) / (max - min)) * 100}%`);
    };
    input.value = String(value);
    paint(value);
    input.addEventListener('input', () => {
      const v = +input.value;
      paint(v);
      on(v);
    });
    // a double-tap on the label puts the slider back to its neutral value
    row.querySelector('.ph-l')!.addEventListener('dblclick', () => {
      const n = key === 'fov' ? this.cam.homeFov : key === 'strength' ? 1 : key === 'hour' ? value : Math.max(min, 0);
      input.value = String(n);
      paint(n);
      on(n);
    });
    this.body.appendChild(row);
    this.ranges[key] = {
      input,
      set: (v) => {
        input.value = String(v);
        paint(v);
      },
    };
  }

  /** A row of pills; `on` returns the new selection when it differs from the id tapped (toggles). */
  private chips(label: string, items: { id: string; label: string }[], sel: string, on: (id: string) => string | void) {
    const box = document.createElement('div');
    box.className = 'ph-chips';
    box.innerHTML = `<span class="ph-l">${label}</span><div></div>`;
    const row = box.querySelector('div')!;
    const mark = (id: string) => row.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('sel', b.dataset.id === id));
    for (const it of items) {
      const b = document.createElement('button');
      b.className = 'ph-chip';
      b.dataset.id = it.id;
      b.innerHTML = it.label;
      b.addEventListener('click', () => {
        this.onClick();
        const r = on(it.id);
        mark(typeof r === 'string' ? r : it.id);
      });
      row.appendChild(b);
    }
    mark(sel);
    this.body.appendChild(box);
  }

  private note(text: string) {
    const p = document.createElement('p');
    p.className = 'ph-note';
    p.textContent = text;
    this.body.appendChild(p);
  }

  // ------------------------------------------------------------------ input

  private onKey(e: KeyboardEvent) {
    if (!this.active) return;
    const k = e.key.toLowerCase();
    const inField = (e.target as HTMLElement | null)?.tagName === 'INPUT';
    if (k === 'escape' || k === 'p') {
      e.preventDefault();
      this.onClose();
      return;
    }
    if (k === ' ' || k === 'enter') {
      e.preventDefault();
      if (!e.repeat) this.onCapture();
      return;
    }
    // arrow keys belong to a focused slider
    if (inField && k.startsWith('arrow')) return;
    if (e.repeat) return;
    if (k === 'h') this.setBare(!this.bare);
    else if (k === 'f') this.setMode(this.cam.mode === 'orbit' ? 'fly' : 'orbit');
    else if (k === 'r') this.cam.reset();
    this.keys.add(k);
    if (k.startsWith('arrow')) e.preventDefault();
  }

  private onDown(e: PointerEvent) {
    if (!this.active) return;
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.ptrs.size === 1) this.down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, button: e.button };
    else this.down.moved = true;
  }

  private onMove(e: PointerEvent) {
    if (!this.active) return;
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (this.ptrs.size >= 2) {
      // pinch zooms, the pair's midpoint pans
      const [a, b] = [...this.ptrs.values()];
      const d0 = Math.hypot(a.x - b.x, a.y - b.y);
      const mx0 = (a.x + b.x) / 2;
      const my0 = (a.y + b.y) / 2;
      p.x = e.clientX;
      p.y = e.clientY;
      const d1 = Math.hypot(a.x - b.x, a.y - b.y);
      if (d0 > 8 && d1 > 8) this.cam.zoom(d0 / d1);
      this.cam.pan((a.x + b.x) / 2 - mx0, (a.y + b.y) / 2 - my0, innerHeight);
      return;
    }
    p.x = e.clientX;
    p.y = e.clientY;
    if (!this.down.moved && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 7) this.down.moved = true;
    if (!this.down.moved) return;
    const panning = e.pointerType === 'mouse' && (this.down.button === 1 || this.down.button === 2 || e.shiftKey);
    if (panning) this.cam.pan(dx, dy, innerHeight);
    else this.cam.rotate(dx, dy);
  }

  private onUp(e: PointerEvent, cancel = false) {
    if (!this.ptrs.delete(e.pointerId) || this.ptrs.size || cancel) return;
    const d = this.down;
    if (d.moved || performance.now() - d.t > 380) return;
    this.tap(e.clientX, e.clientY);
  }

  /** One tap shows or hides the controls; two quick taps focus the lens there. */
  private tap(x: number, y: number) {
    const now = performance.now();
    const l = this.lastTap;
    if (now - l.t < 320 && Math.hypot(x - l.x, y - l.y) < 36) {
      clearTimeout(this.tapTimer);
      l.t = 0;
      this.focusAt(x, y);
      return;
    }
    l.x = x;
    l.y = y;
    l.t = now;
    clearTimeout(this.tapTimer);
    this.tapTimer = window.setTimeout(() => this.setBare(!this.bare), 300);
  }

  private focusAt(x: number, y: number) {
    const d = this.pickAt((x / innerWidth) * 2 - 1, 1 - (y / innerHeight) * 2);
    if (d === null) return;
    this.focus = Math.max(2, Math.min(800, d));
    if (!this.dof) {
      // focusing says you want the blur: open the lens up a little
      this.dof = 0.45;
      this.ranges.dof?.set(this.dof);
    }
    this.ranges.focus?.set(focusToSlider(this.focus));
    this.ping(x, y);
  }

  /** A focus ring blooms where the lens locked on. */
  private ping(x: number, y: number) {
    const r = document.createElement('div');
    r.className = 'ph-ping';
    r.style.left = `${x}px`;
    r.style.top = `${y}px`;
    r.innerHTML = icon(ICONS.focus);
    this.root.appendChild(r);
    setTimeout(() => r.remove(), 900);
  }

  /** World-space ray through a screen point (NDC), for picking. */
  static ray(cam: THREE.PerspectiveCamera, x: number, y: number, dir: THREE.Vector3) {
    return dir.copy(_v.set(x, y, 0.5)).unproject(cam).sub(cam.position).normalize();
  }
}
