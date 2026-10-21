import './peace.css';
import { icon, ICONS } from './art';
import { replay } from './replay';

// Peaceful seas on the HUD: no badge over the sea, just the minimap's light.
// A soft blue-white halo glows behind the chart while nobody in these waters
// has cause to fight you; once you've given them one it turns ember red, a
// little crossed-blades tag on the rim counts who has taken up arms, and the
// glow itself burns down as tempers cool (see game/peace.ts).

export class PeaceHud {
  private el: HTMLElement;
  private ico: HTMLElement;
  private lbl: HTMLElement;
  private key = '';
  private fight: boolean | null = null;
  private cool = -1;

  constructor(map: HTMLElement) {
    const el = document.createElement('div');
    el.className = 'peace';
    el.id = 'hud-peace';
    el.innerHTML = `<span class="pc-halo"></span><span class="pc-tag"><span class="pc-ico"></span><b class="pc-lbl"></b></span>`;
    map.prepend(el);
    this.el = el;
    this.ico = el.querySelector('.pc-ico')!;
    this.lbl = el.querySelector('.pc-lbl')!;
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
      this.lbl.textContent = fight ? String(war) : '';
      this.el.title = fight ? `${war} ${war === 1 ? 'enemy has' : 'enemies have'} taken up arms against you. Sail clear and tempers cool` : 'Peaceful seas: nobody fires unless you fire first';
    }
    const c = Math.round(Math.max(0, Math.min(1, cool)) * 200) / 200;
    if (on && war && c !== this.cool) {
      this.cool = c;
      this.el.style.setProperty('--cool', String(c));
    }
  }
}
