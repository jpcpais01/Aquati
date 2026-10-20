import './peace.css';
import { icon, ICONS } from './art';
import { replay } from './replay';

// Peaceful seas on the HUD: a dove while nobody in these waters has cause to
// fight you, crossed blades and a count once you've given them one, with a
// thin wick that burns down as tempers cool (see game/peace.ts).

export class PeaceHud {
  private el: HTMLElement;
  private ico: HTMLElement;
  private lbl: HTMLElement;
  private wick: HTMLElement;
  private key = '';
  private fight: boolean | null = null;
  private cool = -1;

  constructor(after: HTMLElement) {
    const el = document.createElement('div');
    el.className = 'peace';
    el.id = 'hud-peace';
    el.innerHTML = `<span class="pc-ico"></span><b class="pc-lbl"></b><i class="pc-wick"></i>`;
    after.insertAdjacentElement('afterend', el);
    this.el = el;
    this.ico = el.querySelector('.pc-ico')!;
    this.lbl = el.querySelector('.pc-lbl')!;
    this.wick = el.querySelector('.pc-wick')!;
  }

  /**
   * `on` peaceful seas; `war` how many ships and forts have taken up arms
   * against you; `cool` 1..0 how fresh the quarrel still is.
   */
  set(on: boolean, war: number, cool: number) {
    const k = !on ? 'off' : war ? `w${war}` : 'calm';
    if (k !== this.key) {
      this.key = k;
      this.el.classList.toggle('on', on);
      const fight = on && war > 0;
      this.el.classList.toggle('war', fight);
      if (fight !== this.fight) {
        const first = this.fight === null;
        this.fight = fight;
        this.ico.innerHTML = icon(fight ? ICONS.swords : ICONS.dove);
        // the change of mood itself catches the eye
        if (!first && on) replay(this.el, 'flip');
      }
      this.lbl.innerHTML = fight ? `Provoked <span>· ${war}</span>` : 'Peaceful seas';
      this.el.title = fight ? `${war} ${war === 1 ? 'enemy has' : 'enemies have'} taken up arms against you. Sail clear and tempers cool` : 'Peaceful seas: nobody fires unless you fire first';
    }
    const c = Math.round(Math.max(0, Math.min(1, cool)) * 200) / 200;
    if (on && war && c !== this.cool) {
      this.cool = c;
      this.wick.style.transform = `scaleX(${c})`;
    }
  }
}
