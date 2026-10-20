import './shore.css';
import * as THREE from 'three';
import { icon, ICONS, STAT_ICONS } from './art';
import { FLEET_ICONS } from './fleet';

// The HUD ashore: the landing party's health in place of the hull, the
// "row back" / "open the chest" pill, bars over the cutthroats you're
// fighting, and on touch a cutlass button with the pistol riding beside it.

export interface PartyRow {
  name: string;
  hp: number;
  max: number;
  down: boolean;
}

/** The pill's message: `key` picks its icon. */
export type PromptView = { key: string; title: string; sub: string; ok: boolean } | null;

export interface FoeBar {
  id: number;
  x: number;
  y: number;
  z: number;
  hp: number;
  max: number;
  boss: boolean;
  /** What the bar says ('' for the camp's defaults). */
  label?: string;
}

/** A boarded ship's fate, put to the captain once her crew strikes. */
export interface PrizeView {
  name: string;
  /** What her strongbox gave up. */
  haul: string;
  prize: string;
  scuttle: string;
  /** What signing her into your fleet means (or why she can't). */
  fleet: string;
  fleetOk: boolean;
}

const $ = (id: string) => document.getElementById(id)!;
const _v = new THREE.Vector3();

export class ShoreHud {
  /** A tap on the prompt pill. */
  onInteract: () => void = () => {};
  /** A pick on the prize card. */
  onPrize: (k: 'prize' | 'scuttle' | 'fleet') => void = () => {};
  private prizeCard: HTMLElement;
  readonly strike: HTMLButtonElement;
  readonly pistol: HTMLButtonElement;
  private hud = $('hud');
  private panel: HTMLElement;
  private rows: { el: HTMLElement; bar: HTMLElement; key: string }[] = [];
  private prompt: HTMLButtonElement;
  private promptKey = '';
  private bars = $('bars');
  private barEls = new Map<number, HTMLElement>();
  private pistolKey = '';
  private hint: HTMLElement;

  constructor() {
    const p = (this.panel = document.createElement('div'));
    p.className = 'panel party-panel';
    p.innerHTML = '<div class="pp-head"><small>Landing party</small><span class="pp-isle"></span></div><div class="pp-rows"></div>';
    $('hud').querySelector('.status')!.insertBefore(p, $('hud').querySelector('.stats-row'));

    const d = (this.prompt = document.createElement('button'));
    d.className = 'dock-prompt shore-prompt';
    d.innerHTML = `<kbd class="kd">F</kbd><span class="dp-ico"></span><span class="dp-t"><b></b><small></small></span>`;
    d.addEventListener('click', (e) => {
      e.stopPropagation();
      if (d.classList.contains('ok')) this.onInteract();
    });
    this.hud.appendChild(d);

    const c = (this.prizeCard = document.createElement('div'));
    c.className = 'prize-card';
    c.innerHTML =
      `<div class="pc-flag">${icon(ICONS.flag)}</div><small class="pc-kick">She strikes her colours</small><b class="pc-name"></b><p class="pc-haul"></p>` +
      `<div class="pc-acts"><button class="pc-a fleet" data-k="fleet"><kbd class="kd">3</kbd><span>${icon(FLEET_ICONS.follow)}</span><span class="pc-t"><b>Sign her into your fleet</b><small class="pc-f"></small></span></button>` +
      `<button class="pc-a gold" data-k="prize"><kbd class="kd">1</kbd><span>${icon(ICONS.harbour)}</span><span class="pc-t"><b>Take her as a prize</b><small class="pc-p"></small></span></button>` +
      `<button class="pc-a" data-k="scuttle"><kbd class="kd">2</kbd><span>${icon(STAT_ICONS.firepower)}</span><span class="pc-t"><b>Scuttle her</b><small class="pc-s"></small></span></button></div>`;
    c.querySelectorAll<HTMLButtonElement>('.pc-a').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!b.disabled) this.onPrize(b.dataset.k as 'prize' | 'scuttle' | 'fleet');
      }),
    );
    this.hud.appendChild(c);

    const h = (this.hint = document.createElement('div'));
    h.className = 'shore-hint kd';
    h.innerHTML = '<kbd>WASD</kbd> walk · <kbd>Shift</kbd> run · <kbd>Space</kbd> or click: cutlass · <kbd>Q</kbd> pistol · <kbd>F</kbd> act';
    this.hud.appendChild(h);

    const pad = document.createElement('div');
    pad.className = 'shore-pad';
    pad.innerHTML =
      `<button class="fbtn side" id="t-pistol"><i class="rl"></i><span class="ti">${icon(ICONS.pistol)}</span><small>Pistol</small></button>` +
      `<button class="fbtn main" id="t-strike"><span class="ti">${icon(ICONS.cutlass)}</span><small>Strike</small></button>`;
    $('touch').appendChild(pad);
    this.strike = pad.querySelector('#t-strike')!;
    this.pistol = pad.querySelector('#t-pistol')!;
  }

  show(on: boolean, isle = '', head = 'Landing party') {
    this.hud.classList.toggle('ashore', on);
    this.panel.querySelector('.pp-isle')!.textContent = isle;
    this.panel.querySelector('.pp-head small')!.textContent = head;
    if (!on) this.showPrize(null);
    if (!on) {
      this.setPrompt(null);
      this.clearBars();
      this.hint.classList.remove('gone');
    } else {
      // the key hint fades once you've had a while to read it
      this.hint.classList.remove('gone');
      setTimeout(() => this.hint.classList.add('gone'), 14000);
    }
  }

  setParty(rows: PartyRow[]) {
    const host = this.panel.querySelector('.pp-rows')!;
    while (this.rows.length < rows.length) {
      const el = document.createElement('div');
      el.className = 'pm';
      el.innerHTML = '<span class="pm-n"></span><div class="pm-bar"><i></i></div><span class="pm-s"></span>';
      host.appendChild(el);
      this.rows.push({ el, bar: el.querySelector('i')!, key: '' });
    }
    rows.forEach((r, i) => {
      const row = this.rows[i];
      const f = Math.max(0, r.hp / r.max);
      const key = `${r.name}|${Math.round(f * 60)}|${r.down}`;
      if (key === row.key) return;
      const was = row.key;
      row.key = key;
      row.el.classList.toggle('cap', i === 0);
      row.el.classList.toggle('ko', r.down);
      row.el.classList.toggle('low', !r.down && f < 0.34);
      row.el.querySelector('.pm-n')!.textContent = r.name;
      row.el.querySelector('.pm-s')!.textContent = r.down ? (i === 0 ? 'Down' : 'Out cold') : i === 0 ? `${Math.ceil(r.hp)}` : '';
      row.bar.style.transform = `scaleX(${f})`;
      if (was && parseInt(was.split('|')[1]) > Math.round(f * 60)) {
        row.el.classList.remove('hit');
        void row.el.offsetWidth;
        row.el.classList.add('hit');
      }
    });
    this.rows.forEach((r, i) => (r.el.style.display = i < rows.length ? '' : 'none'));
  }

  setPrompt(p: PromptView) {
    const key = p ? `${p.key}|${p.title}|${p.sub}|${p.ok}` : '';
    if (key === this.promptKey) return;
    this.promptKey = key;
    const d = this.prompt;
    d.classList.toggle('on', !!p);
    if (!p) return;
    d.classList.toggle('ok', p.ok);
    d.querySelector('b')!.textContent = p.title;
    d.querySelector('small')!.textContent = p.sub;
    d.querySelector('.dp-ico')!.innerHTML = icon(p.key === 'retreat' ? STAT_ICONS.hull : ICONS[p.key === 'boat' || p.key === 'land' ? 'boat' : p.key === 'fight' ? 'cutlass' : p.key === 'dig' ? 'spade' : p.key === 'board' ? 'grapnel' : 'anchor']);
    d.classList.toggle('board', p.key === 'board');
  }

  /** Puts a boarded ship's fate to you (null takes the card away). */
  showPrize(v: PrizeView | null) {
    const c = this.prizeCard;
    c.classList.toggle('on', !!v);
    if (!v) return;
    c.querySelector('.pc-name')!.textContent = `The ${v.name} is yours`;
    c.querySelector('.pc-haul')!.textContent = v.haul;
    c.querySelector('.pc-p')!.textContent = v.prize;
    c.querySelector('.pc-s')!.textContent = v.scuttle;
    c.querySelector('.pc-f')!.textContent = v.fleet;
    (c.querySelector('.pc-a.fleet') as HTMLButtonElement).disabled = !v.fleetOk;
  }

  /** The pistol's reload ring: 0 just fired .. 1 loaded. */
  setPistol(k: number) {
    const q = Math.round(k * 40) / 40;
    const key = `${q}`;
    if (key === this.pistolKey) return;
    this.pistolKey = key;
    this.pistol.style.setProperty('--rl', key);
    this.pistol.classList.toggle('ready', q >= 1);
  }

  updateBars(foes: FoeBar[], camera: THREE.Camera, w: number, h: number) {
    const seen = new Set<number>();
    for (const f of foes) {
      _v.set(f.x, f.y, f.z).project(camera);
      if (_v.z > 1 || _v.x < -1.1 || _v.x > 1.1 || _v.y < -1.1 || _v.y > 1.1) continue;
      seen.add(f.id);
      let el = this.barEls.get(f.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'ebar foe-bar' + (f.boss ? ' boss' : '');
        el.innerHTML = '<i></i><span></span>';
        el.querySelector('span')!.textContent = f.label || (f.boss ? 'Captain of the camp' : 'Cutthroat');
        this.bars.appendChild(el);
        this.barEls.set(f.id, el);
      }
      el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * w}px, ${(-_v.y * 0.5 + 0.5) * h}px)`;
      (el.firstElementChild as HTMLElement).style.transform = `scaleX(${Math.max(0, f.hp / f.max)})`;
    }
    this.barEls.forEach((el, id) => {
      if (seen.has(id)) return;
      el.remove();
      this.barEls.delete(id);
    });
  }

  clearBars() {
    this.barEls.forEach((el) => el.remove());
    this.barEls.clear();
  }
}
