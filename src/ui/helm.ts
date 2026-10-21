import './helm.css';
import { fmtDist } from './chart';

// The helmsman on the HUD, and the little card the sea chart opens over
// whatever you tap on it.
//
// HelmHud: a pill low in the middle of the screen while he has the wheel: a
// ship's wheel that turns as he puts the helm over, where she's bound, how
// far and how long, how she's sailing, a thread of gold filling as the course
// falls behind her, and a button to take the helm back. Built once inside
// #hud; only text, a class and two style values change.
//
// ChartCard: the place you tapped on the chart, named, with "Sail there" (or
// "Stop sailing" if she's already bound there) and, for a waypoint, "Lift pin".

/** A ship's wheel: rim, hub and eight spokes running out to their handles. */
export const WHEEL = `<svg viewBox="0 0 32 32" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round">
<circle cx="16" cy="16" r="9" stroke-width="2.2"/><circle cx="16" cy="16" r="2.6" stroke-width="2"/>
<path stroke-width="1.7" d="M16 2.2v11.2M16 18.6v11.2M2.2 16h11.2M18.6 16h11.2M6.2 6.2l7.9 7.9M17.9 17.9l7.9 7.9M25.8 6.2l-7.9 7.9M14.1 17.9l-7.9 7.9"/>
</g></svg>`;
const SAIL = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5v15M12 3.5c3.6 2.6 6 6.6 6.6 11.5H12M11 5.5C8.4 8 7 11.3 6.8 15H11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 18.5h17l-1.8 2.2a2 2 0 0 1-1.5.8H6.8a2 2 0 0 1-1.5-.8z" fill="currentColor"/></svg>`;
const X = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;
const PIN_OFF = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6-5.6-6-10.5a6 6 0 0 1 12 0C18 15.4 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.5 8.5l5 5M14.5 8.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** "~3 min", "~40 s", or a dash while she's barely moving. */
export function fmtEta(s: number) {
  if (s < 0) return '';
  if (s < 50) return `~${Math.max(10, Math.round(s / 10) * 10)} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `~${m} min` : `~${Math.floor(m / 60)} h ${m % 60} min`;
}

export interface HelmHudView {
  name: string;
  left: number;
  done: number;
  eta: number;
  how: string;
  arrived: boolean;
}

export class HelmHud {
  private root: HTMLElement;
  private wheel: HTMLElement;
  private kick: HTMLElement;
  private nameEl: HTMLElement;
  private dist: HTMLElement;
  private howEl: HTMLElement;
  private bar: HTMLElement;
  private shown = false;
  private key = '';
  private spin = 0;
  private deg = 99;
  private doneV = -1;
  onCancel: () => void = () => {};

  constructor(private hud: HTMLElement) {
    const root = document.createElement('div');
    root.className = 'helm-ap';
    root.setAttribute('role', 'status');
    root.innerHTML = `
      <div class="ap-wheel"><span>${WHEEL}</span></div>
      <div class="ap-txt"><small><span class="ap-kick">Sailing to</span></small><b><span class="ap-name"></span><em class="ap-dist"></em></b><i class="ap-how"></i></div>
      <button class="ap-x" type="button" title="Take the helm" aria-label="Take the helm">${X}</button>
      <div class="ap-bar"><i></i></div>`;
    hud.appendChild(root);
    this.root = root;
    this.wheel = root.querySelector('.ap-wheel span') as HTMLElement;
    this.kick = root.querySelector('.ap-kick') as HTMLElement;
    this.nameEl = root.querySelector('.ap-name') as HTMLElement;
    this.dist = root.querySelector('.ap-dist') as HTMLElement;
    this.howEl = root.querySelector('.ap-how') as HTMLElement;
    this.bar = root.querySelector('.ap-bar i') as HTMLElement;
    const x = root.querySelector('.ap-x') as HTMLElement;
    // the pill sits over the sea: keep its taps off the helm and the guns
    for (const ev of ['pointerdown', 'touchstart', 'mousedown'] as const) x.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onCancel();
    });
  }

  /** `rudder` turns the wheel: the helmsman's hands on the spokes. */
  set(v: HelmHudView | null, rudder = 0, dt = 0) {
    const on = !!v;
    if (on !== this.shown) {
      this.shown = on;
      this.root.classList.toggle('on', on);
      this.hud.classList.toggle('ap-on', on);
      if (on) this.doneV = -1;
    }
    if (!v) return;
    const dist = v.arrived ? '' : `${fmtDist(v.left)}${v.eta >= 0 ? ` · ${fmtEta(v.eta)}` : ''}`;
    const key = `${v.arrived}|${v.name}|${dist}|${v.how}`;
    if (key !== this.key) {
      const was = this.key.startsWith('true');
      this.key = key;
      this.kick.textContent = v.arrived ? 'Arrived' : 'Sailing to';
      this.nameEl.textContent = v.name;
      this.dist.textContent = dist;
      this.howEl.textContent = v.how;
      this.root.classList.toggle('done', v.arrived);
      if (v.arrived && !was) {
        this.root.classList.remove('flare');
        void this.root.offsetWidth;
        this.root.classList.add('flare');
      }
    }
    // the wheel spins the way he puts the helm, and drifts back as she steadies
    this.spin += (-rudder * 130 - this.spin) * Math.min(1, dt * 3);
    const deg = Math.round(this.spin * 2) / 2;
    if (deg !== this.deg) {
      this.deg = deg;
      this.wheel.style.transform = `rotate(${deg}deg)`;
    }
    const d = Math.round(v.done * 400) / 400;
    if (d !== this.doneV) {
      this.doneV = d;
      this.bar.style.transform = `scaleX(${d.toFixed(4)})`;
    }
  }
}

export interface ChartCardInfo {
  kicker: string;
  name: string;
  sub: string;
  /** A warning line in coral (a hostile fort's guns), if any. */
  warn?: string;
  /** CSS colour of the mark (a pin's own colour), for the card's accent. */
  accent?: string;
  /** A waypoint: offer to lift it. */
  pin: boolean;
  /** She's already bound here: offer to stop instead. */
  bound: boolean;
}

export class ChartCard {
  private root: HTMLElement;
  private kick: HTMLElement;
  private nameEl: HTMLElement;
  private subEl: HTMLElement;
  private warnEl: HTMLElement;
  private go: HTMLButtonElement;
  private lift: HTMLButtonElement;
  private open = false;
  private x = -1;
  private y = -1;
  private cw = 220;
  private ch = 120;
  onSail: () => void = () => {};
  onStop: () => void = () => {};
  onLift: () => void = () => {};
  onClose: () => void = () => {};
  private bound = false;

  constructor(frame: HTMLElement) {
    const root = document.createElement('div');
    root.className = 'chart-card';
    root.innerHTML = `
      <button class="cc-x" type="button" aria-label="Close">${X}</button>
      <small class="cc-kick"></small>
      <b class="cc-name"></b>
      <span class="cc-sub"></span>
      <span class="cc-warn"></span>
      <div class="cc-row">
        <button class="cc-go" type="button"><span class="cc-ico">${SAIL}</span><span class="cc-go-t">Sail there</span></button>
        <button class="cc-lift" type="button" title="Lift this pin">${PIN_OFF}<span>Lift pin</span></button>
      </div>`;
    frame.appendChild(root);
    this.root = root;
    this.kick = root.querySelector('.cc-kick') as HTMLElement;
    this.nameEl = root.querySelector('.cc-name') as HTMLElement;
    this.subEl = root.querySelector('.cc-sub') as HTMLElement;
    this.warnEl = root.querySelector('.cc-warn') as HTMLElement;
    this.go = root.querySelector('.cc-go') as HTMLButtonElement;
    this.lift = root.querySelector('.cc-lift') as HTMLButtonElement;
    // taps on the card never reach the chart under it (no pin dropped through it)
    for (const ev of ['pointerdown', 'pointerup', 'click', 'dblclick', 'wheel'] as const) root.addEventListener(ev, (e) => e.stopPropagation());
    this.go.addEventListener('click', () => (this.bound ? this.onStop() : this.onSail()));
    this.lift.addEventListener('click', () => this.onLift());
    (root.querySelector('.cc-x') as HTMLElement).addEventListener('click', () => this.onClose());
  }

  get isOpen() {
    return this.open;
  }

  show(info: ChartCardInfo) {
    this.kick.textContent = info.kicker;
    this.nameEl.textContent = info.name;
    this.subEl.innerHTML = esc(info.sub);
    this.warnEl.textContent = info.warn ?? '';
    this.root.style.setProperty('--cc', info.accent ?? '#f4c765');
    this.lift.hidden = !info.pin;
    this.setBound(info.bound);
    this.x = this.y = -1;
    if (!this.open) {
      this.open = true;
      this.root.classList.remove('on');
      void this.root.offsetWidth;
      this.root.classList.add('on');
    } else {
      // a new place: the card hops over to it
      this.root.classList.remove('hop');
      void this.root.offsetWidth;
      this.root.classList.add('hop');
    }
    // measured once per showing, not every frame it's placed
    this.cw = this.root.offsetWidth || 220;
    this.ch = this.root.offsetHeight || 120;
  }

  /** Just the distance line, as she sails on with the chart open. */
  setSub(sub: string) {
    if (this.subEl.textContent !== sub) this.subEl.textContent = sub;
  }

  setBound(b: boolean) {
    this.bound = b;
    this.root.classList.toggle('bound', b);
    (this.go.querySelector('.cc-go-t') as HTMLElement).textContent = b ? 'Stop sailing' : 'Sail there';
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('on', 'hop');
  }

  /** Stands the card over its mark: (x, y) in the chart's CSS pixels, inside a frame `w` by `h`. */
  place(x: number, y: number, w: number, h: number) {
    if (!this.open) return;
    const cw = this.cw;
    const ch = this.ch;
    // above the mark when there's room, else below it; never off the frame's edges
    const below = y - ch - 34 < 64;
    const px = Math.round(clampN(x - cw / 2, 10, w - cw - 10));
    const py = Math.round(clampN(below ? y + 26 : y - ch - 30, 10, h - ch - 10));
    if (px === this.x && py === this.y) return;
    this.x = px;
    this.y = py;
    this.root.style.left = `${px}px`;
    this.root.style.top = `${py}px`;
    this.root.style.setProperty('--tail', `${clampN(x - px, 18, cw - 18).toFixed(0)}px`);
    this.root.classList.toggle('below', below);
  }
}

const clampN = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
