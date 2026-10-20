import './hazard.css';

// The sea's dangers on the HUD: a pill under the top of the screen while a
// maelstrom or a reef has your attention. Amber when one lies ahead, coral
// red and pulsing once it has hold of you, aqua when your keel clears the
// coral. A gauge shows how hard the maelstrom grips (or how much water is over
// the coral against what you draw), and an arrow points the way out.
// Built once inside #hud; only classes, text and a few style values change.

export const SPIRAL = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12.2c.9-.1 1.4-.9 1.2-1.7-.3-1.1-1.6-1.6-2.7-1.2-1.6.6-2.2 2.5-1.6 4 .8 2 3.3 2.8 5.2 1.9 2.5-1.1 3.4-4.2 2.3-6.6-1.4-3-5.1-4.1-8-2.7C4.9 7.6 3.7 12 5.4 15.4c2 4 7.1 5.4 11 3.4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`;
export const CORAL = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22v-6.5M12 15.5c0-2.4-1.6-3.6-3.4-4.4M12 15.5c.1-2.6 1.5-4.4 3.6-5.3M8.6 11.1c-.6-1.8-.3-3.6.6-5M8.6 11.1C6.8 10.4 5 10.6 3.6 11.6M15.6 10.2c.4-1.9 0-3.9-1-5.4M15.6 10.2c1.6-.9 3.4-.9 4.8 0M9.2 6.1l-.4-2.4M14.6 4.8l.6-2.3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M3 22h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".55"/></svg>`;
const ARROW = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 18.5 12H14v8.5h-4V12H5.5z" fill="currentColor"/></svg>`;

export interface HazardView {
  kind: 'vortex' | 'reef';
  level: 'info' | 'warn' | 'danger';
  title: string;
  sub: string;
  /** 0..1: the maelstrom's grip, or the coral's reach toward your keel. */
  gauge: number;
  /** Seconds per turn of the spiral (vortex), faster the nearer the eye. */
  spin?: number;
  /** Screen angle of the way out (radians, 0 = up, clockwise), or null for none. */
  arrow: number | null;
}

export class HazardHud {
  private root: HTMLElement;
  private ico: HTMLElement;
  private titleEl: HTMLElement;
  private subEl: HTMLElement;
  private ring: SVGCircleElement;
  private arrowEl: HTMLElement;
  private shown = false;
  private key = '';
  private gauge = -1;
  private arrow = 99;

  constructor(private hud: HTMLElement) {
    const root = document.createElement('div');
    root.className = 'hz';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.innerHTML = `
      <div class="hz-ico"><span></span><svg class="hz-ring" viewBox="0 0 40 40" aria-hidden="true"><circle class="bg" cx="20" cy="20" r="17"/><circle class="fg" cx="20" cy="20" r="17"/></svg></div>
      <div class="hz-txt"><b></b><small></small></div>
      <div class="hz-arrow">${ARROW}</div>`;
    hud.appendChild(root);
    this.root = root;
    this.ico = root.querySelector('.hz-ico span') as HTMLElement;
    this.titleEl = root.querySelector('.hz-txt b') as HTMLElement;
    this.subEl = root.querySelector('.hz-txt small') as HTMLElement;
    this.ring = root.querySelector('.hz-ring .fg') as SVGCircleElement;
    this.arrowEl = root.querySelector('.hz-arrow') as HTMLElement;
  }

  set(v: HazardView | null) {
    const on = !!v;
    if (on !== this.shown) {
      this.shown = on;
      this.root.classList.toggle('on', on);
      this.hud.classList.toggle('hz-on', on);
    }
    if (!v) return;
    const key = `${v.kind}|${v.level}|${v.title}|${v.sub}`;
    if (key !== this.key) {
      const was = this.key.split('|');
      this.key = key;
      if (was[0] !== v.kind) this.ico.innerHTML = v.kind === 'vortex' ? SPIRAL : CORAL;
      this.root.dataset.kind = v.kind;
      this.root.dataset.level = v.level;
      this.titleEl.textContent = v.title;
      this.subEl.textContent = v.sub;
      // stepping up to danger: the pill gives a jolt
      if (v.level === 'danger' && was[1] !== 'danger') {
        this.root.classList.remove('jolt');
        void this.root.offsetWidth;
        this.root.classList.add('jolt');
      }
    }
    const g = Math.round(Math.max(0, Math.min(1, v.gauge)) * 100) / 100;
    if (g !== this.gauge) {
      this.gauge = g;
      // r = 17: the ring is 106.8 long
      this.ring.style.strokeDashoffset = `${(1 - g) * 106.8}`;
    }
    if (v.spin) this.root.style.setProperty('--hz-spin', `${v.spin.toFixed(2)}s`);
    const a = v.arrow === null ? 99 : Math.round((v.arrow * 180) / Math.PI / 2) * 2;
    if (a !== this.arrow) {
      this.arrow = a;
      this.arrowEl.classList.toggle('on', v.arrow !== null);
      if (v.arrow !== null) this.arrowEl.style.transform = `rotate(${a}deg)`;
    }
  }
}
