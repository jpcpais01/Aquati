import './kraken.css';

// The Kraken's chrome: its health across the top of the screen, the title card
// when it rises, warnings over arms about to fall, the struggle when it has
// her in its grip, and the victory card. All of it lives inside #hud, is built
// once up front and only has classes and transforms touched while it runs.

const SIGIL = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6c-3.4 0-5.8 2.6-5.8 5.8 0 2 .9 3.4 2 4.4-1.6 1.4-3.6 2.2-5.4 2 .9 1.6 3.4 2 5.2 1-.6 1.8-2 3.4-3.8 4 1.8.8 4.2 0 5.4-1.8.4 1.6.2 3.2-.6 4.4 1.8-.2 3-2 3-4 0 2 1.2 3.8 3 4-.8-1.2-1-2.8-.6-4.4 1.2 1.8 3.6 2.6 5.4 1.8-1.8-.6-3.2-2.2-3.8-4 1.8 1 4.3.6 5.2-1-1.8.2-3.8-.6-5.4-2 1.1-1 2-2.4 2-4.4 0-3.2-2.4-5.8-5.8-5.8z" fill="currentColor"/><circle cx="9.6" cy="8.6" r="1.1" fill="#0b0414"/><circle cx="14.4" cy="8.6" r="1.1" fill="#0b0414"/></svg>`;

const WARN = 6;

export interface KrakenReward {
  /** An SVG icon (loot art) or '' for the gold coin. */
  art: string;
  label: string;
  /** 0..4 rarity for the glow, -1 for gold. */
  rarity: number;
}

export class KrakenHud {
  private bar: HTMLElement;
  private fill: HTMLElement;
  private ghost: HTMLElement;
  private hint: HTMLElement;
  private title: HTMLElement;
  private win: HTMLElement;
  private grab: HTMLElement;
  private grip: HTMLElement;
  private vig: HTMLElement;
  private warns: HTMLElement[] = [];
  private shown = false;
  private hp = -1;
  private stage = -1;
  private hintText = '';
  private grabOn = false;
  private gripQ = -1;
  private warnOn: boolean[] = [];
  private timers: number[] = [];

  constructor(private hud: HTMLElement) {
    const root = document.createElement('div');
    root.className = 'kr';
    root.innerHTML = `
      <div class="kr-vig"></div>
      <div class="kr-bar" role="status" aria-live="polite">
        <div class="kr-top"><span class="kr-sig">${SIGIL}</span><b>The Kraken</b><small>Terror of the Deep</small></div>
        <div class="kr-hp"><i class="kr-ghost"></i><i class="kr-fill"></i><em style="left:33%"></em><em style="left:66%"></em></div>
        <div class="kr-hint"></div>
      </div>
      <div class="kr-title" aria-hidden="true">
        <small>From the deep it rises</small>
        <h2>${[...'THE KRAKEN'].map((c, i) => (c === ' ' ? '<span class="sp"> </span>' : `<span style="--i:${i}">${c}</span>`)).join('')}</h2>
        <div class="kr-rule"><i></i>${SIGIL}<i></i></div>
        <p>Sever its arms · Strike the eye</p>
      </div>
      <div class="kr-grab">
        <b>Seized!</b>
        <small>Pour shot into the arm, or crowd on sail and tear free</small>
        <div class="kr-grip"><i></i></div>
      </div>
      <div class="kr-win" aria-live="polite">
        <small>Victory</small>
        <h2>The Kraken is slain</h2>
        <div class="kr-rewards"></div>
        <p>Its hoard is rising from the deep. Haul it aboard.</p>
      </div>
      ${Array.from({ length: WARN }, () => '<div class="kr-warn"><i></i><b>!</b></div>').join('')}`;
    hud.appendChild(root);
    const q = (s: string) => root.querySelector(s) as HTMLElement;
    this.bar = q('.kr-bar');
    this.fill = q('.kr-fill');
    this.ghost = q('.kr-ghost');
    this.hint = q('.kr-hint');
    this.title = q('.kr-title');
    this.win = q('.kr-win');
    this.grab = q('.kr-grab');
    this.grip = q('.kr-grip i');
    this.vig = q('.kr-vig');
    this.warns = [...root.querySelectorAll<HTMLElement>('.kr-warn')];
    this.warnOn = this.warns.map(() => false);
  }

  /** The boss bar (and the toasts stepping down out of its way). */
  show(on: boolean) {
    if (on === this.shown) return;
    this.shown = on;
    this.bar.classList.toggle('on', on);
    this.hud.classList.toggle('kr-on', on);
    if (on) {
      this.hp = -1;
      this.stage = -1;
    } else {
      this.setGrab(null);
      this.warnings([], 0);
      this.vig.classList.remove('on', 'grab');
    }
  }

  setHp(frac: number, stage: number) {
    const q = Math.round(frac * 400) / 400;
    if (q !== this.hp) {
      const hurt = q < this.hp;
      this.hp = q;
      this.fill.style.transform = `scaleX(${q})`;
      this.ghost.style.transform = `scaleX(${q})`;
      if (hurt) {
        this.bar.classList.remove('hit');
        void this.bar.offsetWidth;
        this.bar.classList.add('hit');
      }
    }
    if (stage !== this.stage) {
      this.stage = stage;
      this.bar.dataset.stage = `${stage}`;
      this.vig.classList.toggle('on', stage >= 2);
    }
  }

  setHint(text: string, hot = false) {
    if (text === this.hintText) return;
    this.hintText = text;
    this.hint.textContent = text;
    this.hint.classList.toggle('hot', hot);
  }

  /** The name card as it rises. */
  rise() {
    this.replay(this.title, 5200);
  }

  victory(rewards: KrakenReward[]) {
    this.win.querySelector('.kr-rewards')!.innerHTML = rewards
      .map((r, i) => `<div class="kr-rw r${r.rarity}" style="--i:${i}">${r.art || '<span class="coin"></span>'}<span>${r.label}</span></div>`)
      .join('');
    this.replay(this.win, 8200);
  }

  /** Held fast: the struggle prompt, with how near she is to tearing free. */
  setGrab(k: number | null) {
    const on = k !== null;
    if (on !== this.grabOn) {
      this.grabOn = on;
      this.grab.classList.toggle('on', on);
      this.vig.classList.toggle('grab', on);
      this.gripQ = -1;
    }
    if (on) {
      const q = Math.round(k! * 100) / 100;
      if (q !== this.gripQ) {
        this.gripQ = q;
        this.grip.style.transform = `scaleX(${q})`;
      }
    }
  }

  /** Markers over arms about to come down, in screen pixels. */
  warnings(pts: { x: number; y: number }[], n: number) {
    for (let i = 0; i < WARN; i++) {
      const on = i < n;
      const el = this.warns[i];
      if (on !== this.warnOn[i]) {
        this.warnOn[i] = on;
        el.classList.toggle('on', on);
      }
      if (on) el.style.transform = `translate3d(${pts[i].x.toFixed(1)}px, ${pts[i].y.toFixed(1)}px, 0)`;
    }
  }

  /** Everything off at once (a new voyage, the farewell). */
  clear() {
    this.show(false);
    for (const t of this.timers) clearTimeout(t);
    this.timers.length = 0;
    this.title.classList.remove('on');
    this.win.classList.remove('on');
  }

  private replay(el: HTMLElement, life: number) {
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    this.timers.push(window.setTimeout(() => el.classList.remove('on'), life));
  }
}
