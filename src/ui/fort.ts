import './fort.css';
import { replay } from './replay';

// A fort's chrome: a stone-and-brass bar across the top of the screen while
// you're within sight of one (its name, a pip for each gun lit or smashed,
// the garrison and what to do next), and the title card when it falls to you.
// Built once inside #hud; only classes and text change while it runs.

/** A little round tower with a garita and a flag. */
export const TOWER = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 22V10h2V7.5h2V10h2V7.5h2V10h2V7.5h2V10h2v12h-5v-4.2a2 2 0 0 0-4 0V22z" fill="currentColor"/><path d="M12 7.4V1.8" stroke="currentColor" stroke-width="1.2"/><path d="M12.4 2h5l-1.4 1.6 1.4 1.6h-5z" fill="currentColor"/></svg>`;
const GUN = `<svg viewBox="0 0 24 14" aria-hidden="true"><path d="M2 5.2 17.6 3.4c.8-.1 1.4.5 1.4 1.2v.4h2.2v4h-2.2v.4c0 .7-.6 1.3-1.4 1.2L2 8.8a1.6 1.6 0 0 1-1.4-1.6v-.4c0-.8.6-1.5 1.4-1.6z" fill="currentColor"/><circle cx="7" cy="10.4" r="2.6" fill="currentColor" opacity=".75"/><circle cx="7" cy="10.4" r="1" fill="#120c06"/></svg>`;

export interface FortView {
  name: string;
  ours: boolean;
  /** One per gun: true while it can still fire. */
  guns: boolean[];
  /** Soldiers still standing in the garrison (−1: none to fight). */
  garrison: number;
  hint: string;
  /** Pulse the hint (the next step is yours to take). */
  hot: boolean;
}

export class FortHud {
  private bar: HTMLElement;
  private nameEl: HTMLElement;
  private sub: HTMLElement;
  private pips: HTMLElement;
  private garr: HTMLElement;
  private hintEl: HTMLElement;
  private card: HTMLElement;
  private shown = false;
  private key = '';
  private timer = 0;

  constructor(private hud: HTMLElement) {
    const root = document.createElement('div');
    root.className = 'ft';
    root.innerHTML = `
      <div class="ft-bar" role="status" aria-live="polite">
        <div class="ft-top"><span class="ft-sig">${TOWER}</span><b></b><small></small></div>
        <div class="ft-row"><div class="ft-guns"></div><div class="ft-garr"></div></div>
        <div class="ft-hint"></div>
      </div>
      <div class="ft-card" aria-live="polite">
        <small>The fort is yours</small>
        <h2></h2>
        <div class="ft-rule"><i></i>${TOWER}<i></i></div>
        <p></p>
      </div>`;
    hud.appendChild(root);
    const q = (s: string) => root.querySelector(s) as HTMLElement;
    this.bar = q('.ft-bar');
    this.nameEl = q('.ft-top b');
    this.sub = q('.ft-top small');
    this.pips = q('.ft-guns');
    this.garr = q('.ft-garr');
    this.hintEl = q('.ft-hint');
    this.card = q('.ft-card');
  }

  show(on: boolean) {
    if (on === this.shown) return;
    this.shown = on;
    this.bar.classList.toggle('on', on);
    this.hud.classList.toggle('ft-on', on);
  }

  set(v: FortView) {
    const key = `${v.name}|${v.ours}|${v.guns.join()}|${v.garrison}|${v.hint}|${v.hot}`;
    if (key === this.key) return;
    const wasGuns = this.key.split('|')[2];
    this.key = key;
    this.nameEl.textContent = v.name;
    this.sub.textContent = v.ours ? 'Your fort' : 'Brethren stronghold';
    this.bar.classList.toggle('ours', v.ours);
    if (this.pips.children.length !== v.guns.length) this.pips.innerHTML = v.guns.map(() => `<i>${GUN}</i>`).join('');
    v.guns.forEach((live, i) => this.pips.children[i].classList.toggle('dead', !live));
    // a gun just fell silent: the bar shudders
    if (wasGuns && wasGuns !== v.guns.join()) {
      replay(this.bar, 'hit');
    }
    this.garr.textContent = v.ours ? 'Guns cover you' : v.garrison >= 0 ? `Garrison ${v.garrison}` : '';
    this.hintEl.textContent = v.hint;
    this.hintEl.classList.toggle('hot', v.hot);
  }

  /** The title card: the fort's name in stone capitals and what it gives you. */
  taken(name: string, line: string) {
    this.card.querySelector('h2')!.innerHTML = [...name.toUpperCase()].map((c, i) => (c === ' ' ? '<span class="sp"> </span>' : `<span style="--i:${i}">${c}</span>`)).join('');
    this.card.querySelector('p')!.textContent = line;
    replay(this.card, 'on');
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.card.classList.remove('on'), 6200);
  }

  clear() {
    this.show(false);
    this.card.classList.remove('on');
    this.key = '';
  }
}
