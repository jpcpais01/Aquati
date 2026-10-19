import * as THREE from 'three';
import { PATCH_NOTES } from '../data/patchNotes';
import { SHIP_CLASSES, ShipClassId } from '../ships/shipTypes';
import { Ship } from '../ships/ship';
import { RARITY } from '../game/loot';
import { HOLD_ROOM } from '../game/treasure';
import { Terrain, WORLD_SIZE, Island } from '../world/terrain';
import { SeaChart, ChartScene, portMark } from './chart';
import { compassBezel, crest, ICONS, STAT_ICONS, STAT_LABELS, icon, shipSilhouette } from './art';
import { loadSettings, saveSettings, Settings, VolumeKey } from './settings';
import { WreckReport, WreckScreen } from './wreck';
import { AMMO, AMMO_ORDER, AmmoId, AmmoStock } from '../game/ammo';
import { ammoIcon } from './ammoArt';
export type { VoyageEvent, WreckReport } from './wreck';

const NOTES_SEEN_KEY = 'aquati.notesSeen';
const TIPS = [
  'Charting the archipelago…',
  'Sail across the wind for the best speed',
  'Your guns fire to the sides: warm light around a foe means fire',
  'Salvage floats to you: sail close to collect it',
  'Every isle you chart pays a bounty',
  'Chain shot shreds sails, grape cuts down gun crews, fire burns on',
  'Gusts darken the water: chase them for a burst of speed',
];

export interface VoyageInfo {
  gold: number;
  kills: number;
  isles: number;
  time: number;
  ship?: string;
  cls?: ShipClassId;
}

/** Cards that sit over the menus and close on Esc or a tap outside; later ones stack on top. */
const OVERLAYS = ['notes', 'controls', 'settings', 'graphics'];

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class UI {
  readonly menu = $('menu');
  readonly hud = $('hud');
  private loading = $('loading');
  private loadBar = $('load-bar');
  private windDeg = 0;
  private windScale = -1;
  private toasts = $('toasts');
  private floaters = $('floaters');
  private bars = $('bars');
  private mapCanvas = $<HTMLCanvasElement>('minimap');
  private map = this.mapCanvas.getContext('2d')!;
  private mapImage: HTMLCanvasElement | null = null;
  readonly chart = new SeaChart($<HTMLCanvasElement>('chart-canvas'));
  private chartPlayer: Ship | null = null;
  private barEls = new Map<number, HTMLDivElement>();
  private floaterPool: { el: HTMLDivElement; t: number; life: number; x: number; y: number; vy: number }[] = [];
  selected: ShipClassId = 'brig';
  onSelect: (id: ShipClassId) => void = () => {};
  onSail: () => void = () => {};
  onResume: () => void = () => {};
  onQuit: () => void = () => {};
  onAgain: () => void = () => {};
  /** Farewell screen: sail the same ship again, or skip the sinking cinematic. */
  onRetry: () => void = () => {};
  onSkip: () => void = () => {};
  onTally: (i: number, best: boolean) => void = () => {};
  private wreck = new WreckScreen();
  onSound: (on: boolean) => void = () => {};
  onPause: () => void = () => {};
  onMap: (open: boolean) => void = () => {};
  /** Photo mode, from the pause menu or the HUD's camera button. */
  onPhoto: () => void = () => {};
  onClick: () => void = () => {};
  /** Live settings changed (sound, music, shake…); the game applies what it owns. */
  onSettings: (s: Settings) => void = () => {};
  readonly settings: Settings = loadSettings();
  private get soundOn() {
    return this.settings.sound;
  }

  private tipTimer = 0;
  private hudCache = new Map<string, string>();
  /** The shot rack: a slot per kind of shot on the HUD, a chip per kind in the touch fan. */
  onAmmo: (id: AmmoId) => void = () => {};
  private rack = $('ammo-rack');
  private fan = $('ammo-fan');
  private ammoBtn = $('t-ammo');
  private ammoSlots = new Map<AmmoId, HTMLElement>();
  private fanChips = new Map<AmmoId, HTMLElement>();
  private tagT = 0;
  private fanT = 0;
  private menuKeys = (e: KeyboardEvent) => this.onMenuKey(e);

  constructor() {
    document.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
      el.innerHTML = icon(ICONS[el.dataset.icon as keyof typeof ICONS]);
    });
    document.querySelectorAll('.crest-slot').forEach((el) => (el.innerHTML = crest()));
    $('map-bezel').innerHTML = compassBezel();
    this.startTips();
    this.buildShipPicker();
    this.buildRack();
    this.syncSound();
    this.markNotes();
    $('btn-sail').addEventListener('click', () => {
      this.onClick();
      this.onSail();
    });
    const openNotes = () => {
      this.onClick();
      this.renderNotes();
      this.openOverlay('notes');
      try {
        localStorage.setItem(NOTES_SEEN_KEY, PATCH_NOTES[0]?.hour ?? '');
      } catch {
        /* private mode: the dot just stays */
      }
      this.markNotes();
    };
    const openControls = () => {
      this.onClick();
      this.openOverlay('controls');
    };
    const openSettings = () => {
      this.onClick();
      this.renderSettings();
      this.openOverlay('settings');
    };
    $('btn-settings').addEventListener('click', openSettings);
    $('btn-settings2').addEventListener('click', openSettings);
    $('btn-chart').addEventListener('click', () => {
      this.onClick();
      this.onResume();
      this.onMap(true);
    });
    this.applySettings();
    this.listNav($('pause-list'));
    $('btn-notes').addEventListener('click', openNotes);
    $('btn-notes2').addEventListener('click', openNotes);
    $('btn-controls').addEventListener('click', openControls);
    $('btn-controls2').addEventListener('click', openControls);
    document.querySelectorAll('[data-close]').forEach((b) =>
      b.addEventListener('click', () => {
        this.onClick();
        this.closeOverlay((b.closest('.screen') as HTMLElement).id);
      }),
    );
    // tap the dimmed sea around a notes / controls / settings sheet to close it
    for (const id of OVERLAYS) {
      $(id).addEventListener('click', (e) => {
        if (e.target === e.currentTarget) this.closeOverlay(id);
      });
    }
    const toggleSound = () => {
      this.setSetting('sound', !this.settings.sound);
      this.onClick();
    };
    $('btn-sound').addEventListener('click', toggleSound);
    $('btn-refresh').addEventListener('click', () => {
      this.onClick();
      this.refreshGame();
    });
    $('btn-resume').addEventListener('click', () => {
      this.onClick();
      this.onResume();
    });
    // leaving loses the voyage, so the first press only arms it
    let quitArmed = 0;
    $('btn-quit').addEventListener('click', () => {
      this.onClick();
      const b = $('btn-quit');
      if (!b.classList.contains('armed')) {
        b.classList.add('armed');
        $('quit-label').textContent = 'Press again to leave this voyage';
        clearTimeout(quitArmed);
        quitArmed = window.setTimeout(() => this.disarmQuit(), 3200);
        return;
      }
      this.disarmQuit();
      this.onQuit();
    });
    this.wreck.onRetry = () => {
      this.onClick();
      this.onRetry();
    };
    this.wreck.onAgain = () => {
      this.onClick();
      this.onAgain();
    };
    this.wreck.onSkip = () => this.onSkip();
    this.wreck.onTally = (i, best) => this.onTally(i, best);
    $('btn-pause').addEventListener('click', (e) => {
      // drop focus so Space (fire) can't press it again
      (e.currentTarget as HTMLElement).blur();
      this.onPause();
    });
    $('btn-photo').addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).blur();
      this.onClick();
      this.onPhoto();
    });
    $('btn-photo2').addEventListener('click', () => {
      this.onClick();
      this.onPhoto();
    });
    this.mapCanvas.addEventListener('click', () => this.onMap(true));
    $('chart-close').addEventListener('click', () => this.onMap(false));
    $('chart-center').addEventListener('click', () => this.chartPlayer && this.chart.recenter(this.chartPlayer));
    // tapping the dimmed sea around the chart closes it too
    $('chart').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.onMap(false);
    });
    addEventListener('resize', () => {
      if (!$('chart').classList.contains('hidden')) this.chart.resize();
    });
    // capture phase, so Esc closes an open card before the game sees it as "pause"
    addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Escape') return;
        const open = OVERLAYS.slice()
          .reverse()
          .find((id) => !$(id).classList.contains('hidden'));
        if (!open) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        this.closeOverlay(open);
      },
      true,
    );
    addEventListener('keydown', this.menuKeys);
    for (let i = 0; i < 24; i++) {
      const el = document.createElement('div');
      el.className = 'floater';
      el.style.display = 'none';
      this.floaters.appendChild(el);
      this.floaterPool.push({ el, t: 0, life: 0, x: 0, y: 0, vy: 0 });
    }
  }

  private overlayReturn: HTMLElement | null = null;

  private openOverlay(id: string) {
    const el = $(id);
    if (!el.classList.contains('hidden')) return;
    this.overlayReturn = document.activeElement as HTMLElement | null;
    el.classList.remove('hidden');
    el.querySelector<HTMLElement>('[data-close]')?.focus({ preventScroll: true });
  }

  private closeOverlay(id: string) {
    const el = $(id);
    if (el.classList.contains('hidden')) return;
    el.classList.add('hidden');
    // hand focus back to whatever opened it (keeps pad / keyboard navigation flowing)
    if (this.overlayReturn?.isConnected && this.overlayReturn.offsetParent) this.overlayReturn.focus({ preventScroll: true });
    this.overlayReturn = null;
  }

  private overlayOpen() {
    return OVERLAYS.some((id) => !$(id).classList.contains('hidden'));
  }

  private disarmQuit() {
    $('btn-quit').classList.remove('armed');
    $('quit-label').textContent = 'Return to harbour';
  }

  /** Up / down arrows walk the buttons of a vertical menu, like a pad would. */
  private listNav(list: HTMLElement) {
    // the pointer drives the same highlight, so exactly one row is ever lit
    list.addEventListener('pointerover', (e) => {
      if ((e as PointerEvent).pointerType !== 'mouse') return;
      const b = (e.target as HTMLElement).closest('button');
      if (b && b !== document.activeElement) b.focus({ preventScroll: true });
    });
    list.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = [...list.querySelectorAll<HTMLElement>('button:not([disabled])')];
      const i = items.indexOf(document.activeElement as HTMLElement);
      const n = items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
      e.preventDefault();
      e.stopPropagation();
      n?.focus();
    });
  }

  // ------------------------------------------------------------- settings

  private setSetting<K extends keyof Settings>(k: K, v: Settings[K]) {
    if (this.settings[k] === v) return;
    this.settings[k] = v;
    saveSettings(this.settings);
    this.applySettings();
    if (k === 'sound') this.onSound(this.settings.sound);
    this.onSettings(this.settings);
    if (!$('settings').classList.contains('hidden')) this.renderSettings();
  }

  /** The bits the page owns: HUD size, the frame counter, the sound buttons. */
  private applySettings() {
    document.body.dataset.hud = this.settings.hud;
    document.body.classList.toggle('no-fps', !this.settings.fps);
    this.syncSound();
  }

  private renderSettings() {
    const s = this.settings;
    const body = $('settings-body');
    const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.key;
    const toggle = (k: 'sound' | 'music' | 'fps', label: string, desc: string) =>
      `<button class="set-row" data-key="${k}" role="switch" aria-checked="${s[k]}"><span class="set-txt"><b>${label}</b><small>${desc}</small></span><i class="switch${s[k] ? ' on' : ''}"></i></button>`;
    const seg = <K extends 'hud' | 'shake'>(k: K, label: string, desc: string, opts: [Settings[K], string][]) =>
      `<div class="set-row has-seg"><span class="set-txt"><b>${label}</b><small>${desc}</small></span><span class="seg" role="radiogroup">${opts
        .map(([v, t]) => `<button data-key="${k}" data-v="${v}" role="radio" aria-checked="${s[k] === v}" class="${s[k] === v ? 'sel' : ''}">${t}</button>`)
        .join('')}</span></div>`;
    const slider = (k: VolumeKey, label: string, desc: string) => {
      const pct = Math.round(s[k] * 100);
      return `<label class="set-row has-vol"><span class="set-txt"><b>${label}</b><small>${desc}</small></span><span class="vol"><input type="range" min="0" max="100" step="1" value="${pct}" data-vol="${k}" aria-label="${label}" style="--p:${pct}%"><output>${pct}</output></span></label>`;
    };
    body.innerHTML = `
      <section class="set-group"><h4>Sound</h4>
        ${toggle('sound', 'Sound', 'Every sound in the game')}
        ${slider('volMaster', 'Master volume', 'Everything at once')}
        ${slider('volMusic', 'Music', 'The harbour theme')}
        ${slider('volEffects', 'Effects', 'Cannons, splinters, thunder and the crew')}
        ${slider('volAmbience', 'Ambience', 'Surf, wind and rain')}
        ${toggle('music', 'Harbour music', 'The theme that plays on the home screen')}
      </section>
      <section class="set-group"><h4>Graphics</h4>
        <button class="set-row" id="set-gfx"><span class="set-txt"><b>Graphics</b><small>Presets, ray-traced light, shadows and resolution, tuned live</small></span><span class="set-go">${icon(ICONS.chev)}</span></button>
        ${toggle('fps', 'Frame counter', 'Show frames per second at the top of the screen. Tap it for the frame profiler')}
      </section>
      <section class="set-group"><h4>Interface</h4>
        ${seg('hud', 'HUD size', 'How big the in-game controls and readouts are', [
          ['compact', 'Compact'],
          ['standard', 'Standard'],
          ['large', 'Large'],
        ])}
        ${seg('shake', 'Camera shake', 'From cannon fire, rams and treasure', [
          ['full', 'Full'],
          ['gentle', 'Gentle'],
          ['off', 'Off'],
        ])}
      </section>`;
    body.querySelectorAll<HTMLElement>('[data-key]').forEach((b) =>
      b.addEventListener('click', () => {
        const k = b.dataset.key as keyof Settings;
        this.onClick();
        if (b.dataset.v !== undefined) this.setSetting(k, b.dataset.v as never);
        else this.setSetting(k, !this.settings[k] as never);
      }),
    );
    body.querySelectorAll<HTMLInputElement>('input[data-vol]').forEach((r) => {
      const k = r.dataset.vol as VolumeKey;
      // live while dragging, no re-render (that would drop the thumb); saved on release
      r.addEventListener('input', () => {
        const v = Number(r.value) / 100;
        this.settings[k] = v;
        r.style.setProperty('--p', `${r.value}%`);
        r.nextElementSibling!.textContent = r.value;
        this.onSettings(this.settings);
      });
      r.addEventListener('change', () => {
        saveSettings(this.settings);
        this.onClick();
      });
    });
    $('set-gfx').addEventListener('click', () => {
      // the graphics card clears the stage to show the sea, so it replaces this sheet
      this.closeOverlay('settings');
      $('btn-graphics').click();
    });
    if (focusKey) {
      const v = s[focusKey as keyof Settings];
      body.querySelector<HTMLElement>(`[data-key="${focusKey}"][data-v="${v}"], button.set-row[data-key="${focusKey}"]`)?.focus({ preventScroll: true });
    }
  }

  /** Menu shortcuts: arrows / A D / 1 2 3 pick a ship, Enter sets sail. */
  private onMenuKey(e: KeyboardEvent) {
    if (this.menu.classList.contains('hidden') || this.overlayOpen() || e.repeat) return;
    const ids = Object.keys(SHIP_CLASSES) as ShipClassId[];
    const i = ids.indexOf(this.selected);
    const k = e.key.toLowerCase();
    if (document.activeElement?.closest('.menu-tools, .dock-actions') && (k === 'enter' || k === ' ')) return;
    if (k === 'arrowleft' || k === 'a') this.select(ids[(i + ids.length - 1) % ids.length]);
    else if (k === 'arrowright' || k === 'd') this.select(ids[(i + 1) % ids.length]);
    else if (k >= '1' && k <= String(ids.length)) this.select(ids[+k - 1]);
    else if (k === 'enter') {
      e.preventDefault();
      $('btn-sail').click();
    }
  }

  /** Pull the newest build: check the service worker for an update, let it take over, then reload. */
  private async refreshGame() {
    const btn = $('btn-refresh');
    if (btn.classList.contains('busy')) return;
    btn.classList.add('busy');
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) {
        await reg.update();
        const sw = reg.installing ?? reg.waiting;
        if (sw) {
          await new Promise<void>((done) => {
            sw.addEventListener('statechange', () => sw.state === 'activated' && done());
            setTimeout(done, 8000);
          });
        }
      }
    } catch {
      /* offline or no service worker: a plain reload still helps */
    }
    location.reload();
  }

  private syncSound() {
    const html = icon(this.soundOn ? ICONS.soundOn : ICONS.soundOff);
    document.querySelectorAll<HTMLElement>('.sound-toggle').forEach((b) => {
      b.querySelector('.ti')!.innerHTML = html;
      b.classList.toggle('off', !this.soundOn);
      b.dataset.label = this.soundOn ? 'Sound on' : 'Sound off';
      b.setAttribute('aria-pressed', String(this.soundOn));
    });
  }

  private markNotes() {
    let seen = '';
    try {
      seen = localStorage.getItem(NOTES_SEEN_KEY) ?? '';
    } catch {
      /* ignore */
    }
    $('notes-dot').classList.toggle('hidden', !PATCH_NOTES.length || seen === PATCH_NOTES[0].hour);
    const tag = $('build-tag');
    tag.textContent = `v${__APP_VERSION__}`;
    if (__APP_COMMIT__) tag.insertAdjacentHTML('beforeend', `<em>${__APP_COMMIT__}</em>`);
    tag.title = `Version ${__APP_VERSION__}${__APP_COMMIT__ ? ` (build ${__APP_COMMIT__})` : ''}`;
  }

  private startTips() {
    let i = 0;
    this.tipTimer = window.setInterval(() => {
      const el = $('load-tip');
      i = (i + 1) % TIPS.length;
      el.classList.remove('tip-in');
      void el.offsetWidth;
      el.textContent = TIPS[i];
      el.classList.add('tip-in');
    }, 2400);
  }

  setTouch(on: boolean) {
    document.body.classList.toggle('is-touch', on);
  }

  progress(p: number) {
    this.loadBar.style.width = `${Math.round(p * 100)}%`;
  }

  hideLoading() {
    clearInterval(this.tipTimer);
    this.loading.classList.add('out');
    setTimeout(() => this.loading.classList.add('hidden'), 1000);
  }

  private buildShipPicker() {
    const host = $('ship-tabs');
    host.innerHTML = '';
    (Object.keys(SHIP_CLASSES) as ShipClassId[]).forEach((id, i) => {
      const c = SHIP_CLASSES[id];
      const tab = document.createElement('button');
      tab.className = 'ship-tab';
      tab.dataset.id = id;
      tab.setAttribute('role', 'tab');
      tab.style.setProperty('--art', `${[0.7, 0.86, 1][i] ?? 1}`);
      tab.innerHTML = `<span class="art">${shipSilhouette(c)}</span><span class="tab-name">${c.name}</span><kbd class="kd">${i + 1}</kbd>`;
      tab.addEventListener('click', () => this.select(id));
      host.appendChild(tab);
    });
    this.renderDetail(false);
  }

  private select(id: ShipClassId) {
    if (this.selected === id) return;
    this.selected = id;
    this.onClick();
    this.onSelect(id);
    this.renderDetail(true);
  }

  private renderDetail(animate: boolean) {
    const c = SHIP_CLASSES[this.selected];
    $('ship-tabs')
      .querySelectorAll<HTMLElement>('.ship-tab')
      .forEach((el) => {
        const on = el.dataset.id === this.selected;
        el.classList.toggle('sel', on);
        el.setAttribute('aria-selected', String(on));
      });
    const pips = (v: number) => {
      const n = Math.max(1, Math.round(v * 10));
      return Array.from({ length: 10 }, (_, k) => `<i class="${k < n ? 'on' : ''}" style="--k:${k}"></i>`).join('');
    };
    const ids = Object.keys(SHIP_CLASSES);
    $('dock-count').textContent = `${String(ids.indexOf(this.selected) + 1).padStart(2, '0')} / ${String(ids.length).padStart(2, '0')}`;
    const detail = $('ship-detail');
    detail.innerHTML = `
      <div class="detail-head">
        <div><small>The ${c.title}</small><h3>${c.name}</h3></div>
        <div class="facts"><span><b>${c.cannonsPerSide * 2}</b>guns</span><span><b>${c.hp}</b>hull</span><span><b>${c.reload.toFixed(1)}s</b>reload</span><span><b>${HOLD_ROOM[c.id] ?? 12}</b>hold</span></div>
      </div>
      <p class="blurb">${c.blurb}</p>
      <div class="stats">${STAT_LABELS.map(
        ([k, label]) => `<div class="stat" title="${label}">${icon(STAT_ICONS[k])}<span>${label}</span><div class="pips">${pips(c.stats[k as keyof typeof c.stats])}</div></div>`,
      ).join('')}</div>`;
    if (animate) {
      detail.classList.remove('swap');
      void detail.offsetWidth;
      detail.classList.add('swap');
    }
  }

  /**
   * Where the 3D preview ship should sit: the middle of whatever screen area
   * the menu leaves free, as a fraction of the viewport from its centre.
   */
  menuFraming(): { x: number; y: number; w: number; h: number } {
    const W = innerWidth;
    const H = innerHeight;
    const dock = $('dock').getBoundingClientRect();
    if (!dock.width) return { x: 0, y: 0, w: 1, h: 1 };
    const head = document.querySelector('.menu-head')!.getBoundingClientRect();
    if (dock.right < W * 0.6) {
      // side dock: the ship gets the space to its right, below the tool buttons
      const left = dock.right + 16;
      const top = Math.min(document.querySelector('.menu-tools')!.getBoundingClientRect().bottom + 8, H * 0.15);
      return { x: (left + W) / 2 / W - 0.5, y: (top + H) / 2 / H - 0.5, w: (W - left) / W, h: (H - top) / H };
    }
    // bottom dock: the ship gets the gap between the title and the dock
    const top = (head.top + head.bottom) / 2;
    return { x: 0, y: (top + dock.top) / 2 / H - 0.5, w: 1, h: (dock.top - top) / H };
  }


  private renderNotes() {
    const body = $('notes-body');
    body.innerHTML = PATCH_NOTES.map((g, i) => {
      const d = new Date(g.hour);
      const label = isNaN(d.getTime())
        ? g.hour
        : d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      return `<div class="group"><h4><span>${label}</span>${i === 0 ? '<em>Latest</em>' : ''}</h4>${g.entries
        .map((e) => `<div class="entry"><b>${e.title}</b><ul>${e.notes.map((n) => `<li>${n}</li>`).join('')}</ul></div>`)
        .join('')}</div>`;
    }).join('');
    body.scrollTop = 0;
  }

  showMenu(on: boolean) {
    this.menu.classList.toggle('hidden', !on);
  }

  showHud(on: boolean) {
    this.hud.classList.toggle('hidden', !on);
    if (on) this.hud.classList.remove('sunk');
    if (on) this.hudCache.clear();
    if (!on) {
      this.barEls.forEach((el) => el.remove());
      this.barEls.clear();
    }
  }

  showPause(on: boolean, info?: VoyageInfo) {
    $('pause').classList.toggle('hidden', !on);
    this.hud.classList.toggle('under', on);
    if (on && info) {
      $('pause-summary').innerHTML = this.summary(info);
      $('pause-ship').innerHTML = info.ship && info.cls ? `<span class="ps-art">${shipSilhouette(SHIP_CLASSES[info.cls])}</span><span><small>${SHIP_CLASSES[info.cls].name}</small><b>${info.ship}</b></span>` : '';
      $('pause-tip').textContent = TIPS[1 + Math.floor(Math.random() * (TIPS.length - 1))];
    }
    if (on) {
      this.disarmQuit();
      $('btn-resume').focus({ preventScroll: true });
    } else {
      OVERLAYS.forEach((id) => this.closeOverlay(id));
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
  }

  private summary(info: VoyageInfo) {
    const m = Math.floor(info.time / 60);
    const s = Math.floor(info.time % 60);
    const tile = (cls: string, v: string, label: string) => `<div><span class="${cls}"></span><b>${v}</b>${label}</div>`;
    return (
      tile('clock', `${m}:${s.toString().padStart(2, '0')}`, 'At sea') +
      tile('coin', `${info.gold}`, 'Gold') +
      tile('skull', `${info.kills}`, 'Sunk') +
      tile('isle', `${info.isles}`, 'Isles')
    );
  }

  showChart(on: boolean, player?: Ship) {
    $('chart').classList.toggle('hidden', !on);
    if (on && player) this.chart.open(player);
  }

  drawChart(sc: ChartScene) {
    this.chartPlayer = sc.player;
    $('chart-isles').textContent = `${sc.discovered.size} / ${sc.islands.length} isles charted`;
    this.chart.draw(sc);
  }

  /** She's lost: fade the HUD and letterbox the view while the camera follows her down. */
  beginWreck(r: WreckReport) {
    this.hud.classList.add('sunk');
    this.wreck.begin(r);
  }

  showDead(on: boolean, r?: WreckReport) {
    if (on && r) this.wreck.show(r);
    else if (!on) $('dead').classList.add('hidden');
  }

  endWreck() {
    this.wreck.end();
  }

  toast(kicker: string, title: string, life = 3.4) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.setProperty('--life', `${life}s`);
    el.innerHTML = `<small>${kicker}</small><b>${title}</b>`;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    setTimeout(() => el.remove(), (life + 0.7) * 1000);
  }

  /** A toast with a picture: a fine piece of plunder hauled aboard. */
  lootToast(art: string, rarity: number, kicker: string, title: string, life = 3.2) {
    const el = document.createElement('div');
    el.className = `toast loot-toast r-${rarity}`;
    el.style.setProperty('--life', `${life}s`);
    el.innerHTML = `${art}<span><small>${kicker}</small><b>${title}</b></span>`;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    setTimeout(() => el.remove(), (life + 0.7) * 1000);
  }

  /** Captain's view chrome: the toggle, walk hints, reticle and the touch spyglass. */
  setFpv(on: boolean) {
    this.hud.classList.toggle('fpv', on);
    const b = $('btn-view');
    b.classList.toggle('on', on);
    b.title = on ? "Bird's-eye view (V)" : "Captain's view (V)";
    b.innerHTML = `<span class="ti">${icon(ICONS[on ? 'bird' : 'eye'])}</span>`;
    this.setHelmPrompt('none');
    this.setLook(false, 0, false);
    this.setSpy(0);
    this.fpvHint = '';
  }

  private helmState = '';
  private fpvHint = '';
  private reticleSide = 9;
  private spyLevel = -1;

  /** 'take' when the wheel is in reach, 'leave' while holding it. */
  setHelmPrompt(state: 'none' | 'take' | 'leave') {
    if (state === this.helmState) return;
    this.helmState = state;
    const el = $('btn-helm');
    el.classList.toggle('on', state !== 'none');
    el.classList.toggle('held', state === 'leave');
    if (state !== 'none') $('helm-text').textContent = state === 'take' ? 'Take the helm' : 'Leave the helm';
    const hint = this.hud.querySelector('.helm .hint');
    if (hint) hint.textContent = this.hud.classList.contains('fpv') && state !== 'leave' ? 'WASD walk · arrows sail & helm' : 'W / S sails · A / D helm';
  }

  /** Reticle and the "click to look" nudge while walking the deck. */
  setLook(locked: boolean, side: number, ready: boolean) {
    const hint = locked ? 'locked' : 'free';
    if (hint !== this.fpvHint) {
      this.fpvHint = hint;
      $('fpv-hint').classList.toggle('on', !locked);
    }
    const key = side * 2 + (ready ? 1 : 0);
    if (key !== this.reticleSide) {
      this.reticleSide = key;
      const r = $('reticle');
      r.classList.toggle('side', side !== 0);
      r.classList.toggle('ready', side !== 0 && ready);
      $('reticle-side').textContent = side > 0 ? 'Port battery' : side < 0 ? 'Starboard battery' : '';
    }
  }

  setSpy(k: number) {
    const q = Math.round(k * 50) / 50;
    if (q === this.spyLevel) return;
    this.spyLevel = q;
    const el = $('spyglass');
    el.style.opacity = `${q}`;
    el.style.transform = `scale(${1.35 - q * 0.35})`;
    $('t-spy').classList.toggle('on', q > 0.5);
  }

  floater(text: string, x: number, y: number, kind: '' | 'bad' | 'loot' | 'rare' | 'epic' | 'legendary' | 'burn' | 'ablaze' | 'shredded' | 'crew' | 'ammo' = '') {
    const f = this.floaterPool.find((p) => p.t >= p.life) ?? this.floaterPool[0];
    f.el.textContent = text;
    f.el.className = 'floater' + (kind ? ' ' + kind : '');
    f.el.style.display = 'block';
    f.t = 0;
    f.life = kind === 'legendary' ? 2.4 : kind === 'epic' ? 1.9 : kind === 'rare' || kind === 'ablaze' || kind === 'shredded' || kind === 'crew' || kind === 'ammo' ? 1.6 : 1.3;
    f.x = x + (Math.random() - 0.5) * 24;
    f.y = y;
    f.vy = -48;
  }

  tickFloaters(dt: number) {
    for (const f of this.floaterPool) {
      if (f.t >= f.life) continue;
      f.t += dt;
      f.y += f.vy * dt;
      f.vy *= 0.97;
      const a = f.t < 0.15 ? f.t / 0.15 : 1 - Math.max(0, (f.t - (f.life - 0.6)) / 0.6);
      const sc = f.t < 0.12 ? 0.6 + f.t * 4 : 1.08 - Math.min(0.08, f.t * 0.2);
      f.el.style.transform = `translate(${f.x}px, ${f.y}px) translate(-50%, -50%) scale(${sc})`;
      f.el.style.opacity = `${Math.max(0, a)}`;
      if (f.t >= f.life) f.el.style.display = 'none';
    }
  }

  /** Writes a HUD value only when it changes; `bump` pops the chip when a count goes up. */
  /** The hold chip: room used of room aboard, bumping as plunder comes in. */
  setHold(used: number, cap: number) {
    this.hudSet('hud-hold', `${used}/${cap}`, true);
    $('hud-hold-chip').classList.toggle('full', used >= cap);
  }

  private hudSet(id: string, v: string, bump = false) {
    if (this.hudCache.get(id) === v) return;
    const prev = this.hudCache.get(id);
    this.hudCache.set(id, v);
    const el = $(id);
    el.textContent = v;
    if (bump && prev !== undefined && parseInt(v) > parseInt(prev)) {
      const chip = el.parentElement!;
      chip.classList.remove('bump');
      void chip.offsetWidth;
      chip.classList.add('bump');
    }
  }

  updateHud(p: Ship, isles: number, totalIsles: number) {
    if (this.hudCache.get('cls') !== p.cls.id) {
      this.hudCache.clear();
      this.hudCache.set('cls', p.cls.id);
      $('hud-art').innerHTML = shipSilhouette(p.cls);
    }
    this.hudSet('hud-title', p.name);
    this.hudSet('hud-class', p.cls.name);
    const frac = Math.max(0, p.hp / p.maxHp);
    const f = frac.toFixed(3);
    if (this.hudCache.get('hull') !== f) {
      const prev = parseFloat(this.hudCache.get('hull') ?? '1');
      this.hudCache.set('hull', f);
      const fill = $('hud-hull');
      fill.style.transform = `scaleX(${f})`;
      fill.classList.toggle('low', frac < 0.35);
      $('hud-hull-ghost').style.transform = `scaleX(${f})`;
      if (frac < prev - 0.001) {
        const panel = fill.closest('.ship-panel')!;
        panel.classList.remove('hit');
        void (panel as HTMLElement).offsetWidth;
        panel.classList.add('hit');
      }
    }
    const hp = `${Math.ceil(Math.max(0, p.hp))}`;
    if (this.hudCache.get('hp') !== hp + p.maxHp) {
      this.hudCache.set('hp', hp + p.maxHp);
      $('hud-hull-text').innerHTML = `<b>${hp}</b><small>/${p.maxHp}</small>`;
      $('hud-hull-text').classList.toggle('low', frac < 0.35);
    }
    this.hudSet('hud-gold', `${p.gold}`, true);
    this.hudSet('hud-kills', `${p.kills}`, true);
    this.hudSet('hud-isles', `${isles}/${totalIsles}`, true);
    this.hudSet('hud-speed', `${Math.round(Math.abs(p.speed) * 1.94)}`);
    const lvl = Math.round(p.sailTarget * 3);
    if (this.hudCache.get('sails') !== `${lvl}`) {
      this.hudCache.set('sails', `${lvl}`);
      const pips = $('hud-sails').children;
      for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('on', i < lvl);
    }
    // reload: the loaded shot's ring fills, its left half for port and right half for starboard
    const ring = (side: 'port' | 'starboard', touchId: string) => {
      const reload = p.reload[side];
      const k = Math.min(1, Math.max(0, 1 - reload / p.reloadFull[side]));
      const ks = k.toFixed(2);
      const ready = reload <= 0;
      const key = side === 'port' ? 'rl-p' : 'rl-s';
      if (this.hudCache.get(key) === ks + ready) return;
      this.hudCache.set(key, ks + ready);
      this.rack.style.setProperty(side === 'port' ? '--rp' : '--rs', ks);
      this.rack.classList.toggle(side === 'port' ? 'p-ready' : 's-ready', ready);
      const t = $(touchId);
      t.style.setProperty('--rl', ks);
      t.classList.toggle('ready', ready);
    };
    ring('port', 't-port');
    ring('starboard', 't-star');
  }

  // ------------------------------------------------------------- the shot rack

  private buildRack() {
    const pick = (id: AmmoId) => (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.onAmmo(id);
    };
    AMMO_ORDER.forEach((id, i) => {
      const a = AMMO[id];
      const slot = document.createElement('button');
      slot.className = 'slot';
      slot.dataset.ammo = id;
      slot.setAttribute('role', 'radio');
      slot.setAttribute('aria-label', a.name);
      slot.title = `${a.name} (${i + 1}): ${a.blurb}`;
      slot.style.setProperty('--ac', a.css);
      slot.innerHTML = `<span class="ball">${ammoIcon(id)}</span><kbd class="kd">${i + 1}</kbd><b class="n"></b><em class="gain"></em>`;
      slot.addEventListener('pointerdown', pick(id));
      slot.addEventListener('mouseenter', () => this.showTag(id, false));
      slot.addEventListener('mouseleave', () => this.hideTag());
      this.rack.appendChild(slot);
      this.ammoSlots.set(id, slot);

      const chip = document.createElement('button');
      chip.className = 'chip-a';
      chip.dataset.ammo = id;
      chip.style.setProperty('--i', `${i}`);
      chip.style.setProperty('--ac', a.css);
      chip.setAttribute('aria-label', a.name);
      chip.innerHTML = `${ammoIcon(id)}<b class="n"></b><small>${a.short}</small>`;
      chip.addEventListener('pointerdown', (e) => {
        pick(id)(e);
        this.setFan(false);
      });
      this.fan.appendChild(chip);
      this.fanChips.set(id, chip);
    });
    this.ammoBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.setFan(!this.fan.classList.contains('open'));
      navigator.vibrate?.(8);
    });
    this.ammoBtn.addEventListener('contextmenu', (e) => e.preventDefault());
    // a touch anywhere else folds the fan away
    window.addEventListener(
      'pointerdown',
      (e) => {
        const t = e.target as Node;
        if (this.fan.classList.contains('open') && !this.fan.contains(t) && !this.ammoBtn.contains(t)) this.setFan(false);
      },
      true,
    );
  }

  /** Touch: the fan of shot chips around the shot button. Closes itself after a few idle seconds. */
  setFan(open: boolean) {
    this.fan.classList.toggle('open', open);
    this.ammoBtn.classList.toggle('open', open);
    clearTimeout(this.fanT);
    if (open) this.fanT = window.setTimeout(() => this.setFan(false), 4000);
  }

  /** The loaded shot and what's left of each. */
  updateAmmo(sel: AmmoId, stock: AmmoStock) {
    const key = sel + AMMO_ORDER.map((id) => stock[id]).join(',');
    if (this.hudCache.get('ammo') === key) return;
    const prevSel = this.hudCache.get('ammo-sel');
    this.hudCache.set('ammo', key);
    this.hudCache.set('ammo-sel', sel);
    for (const id of AMMO_ORDER) {
      const n = stock[id];
      const txt = Number.isFinite(n) ? `${n}` : '∞';
      for (const el of [this.ammoSlots.get(id)!, this.fanChips.get(id)!]) {
        el.classList.toggle('on', id === sel);
        el.classList.toggle('empty', n <= 0);
        el.setAttribute('aria-checked', `${id === sel}`);
        (el.querySelector('.n') as HTMLElement).textContent = txt;
      }
    }
    this.rack.style.setProperty('--ac', AMMO[sel].css);
    const b = this.ammoBtn;
    b.style.setProperty('--ac', AMMO[sel].css);
    if (prevSel !== sel) (b.querySelector('.ab') as HTMLElement).innerHTML = ammoIcon(sel);
    const n = stock[sel];
    (b.querySelector('.ac') as HTMLElement).textContent = Number.isFinite(n) ? `${n}` : '';
    b.classList.toggle('special', sel !== 'round');
  }

  /** Just loaded a new kind: its name and what it does float over the rack for a moment. */
  showTag(id: AmmoId, flash = true) {
    const a = AMMO[id];
    const tag = $('ammo-tag');
    (tag.firstElementChild as HTMLElement).textContent = a.name;
    (tag.lastElementChild as HTMLElement).textContent = a.blurb.split('. ')[0].replace(/\.$/, '');
    tag.style.setProperty('--ac', a.css);
    tag.classList.add('show');
    clearTimeout(this.tagT);
    if (flash) {
      this.tagT = window.setTimeout(() => this.hideTag(), 2400);
      for (const el of [this.ammoSlots.get(id)!, this.ammoBtn]) {
        el.classList.remove('load');
        void el.offsetWidth;
        el.classList.add('load');
      }
    }
  }

  private hideTag() {
    clearTimeout(this.tagT);
    $('ammo-tag').classList.remove('show');
  }

  /** None of that shot left. */
  ammoDenied(id: AmmoId) {
    for (const el of [this.ammoSlots.get(id)!, this.fanChips.get(id)!]) {
      el.classList.remove('deny');
      void el.offsetWidth;
      el.classList.add('deny');
    }
  }

  /** Shot found in salvage: the slot bounces and a little "+n" rises off it. */
  ammoGain(id: AmmoId, n: number) {
    for (const el of [this.ammoSlots.get(id)!, this.ammoBtn]) {
      const g = el.querySelector('.gain') as HTMLElement | null;
      if (g) g.textContent = `+${n}`;
      el.classList.remove('gain-on');
      void el.offsetWidth;
      el.classList.add('gain-on');
    }
  }

  /** A side's badge warms while a foe sits in its loaded arc. */
  updateGunnery(sides: Record<'port' | 'starboard', { ready: boolean; target: unknown }>, auto: 'port' | 'starboard' | null) {
    const hotP = sides.port.ready && !!sides.port.target;
    const hotS = sides.starboard.ready && !!sides.starboard.target;
    const hotA = !!auto && sides[auto].ready && !!sides[auto].target;
    const key = `${+hotP}${+hotS}${+hotA}${auto ?? '-'}`;
    if (this.hudCache.get('guns') === key) return;
    this.hudCache.set('guns', key);
    this.rack.classList.toggle('p-hot', hotP);
    this.rack.classList.toggle('s-hot', hotS);
    $('t-port').classList.toggle('hot', hotP);
    $('t-star').classList.toggle('hot', hotS);
    // the big Fire button looses whichever side is outlined
    $('t-port').classList.toggle('aim', auto === 'port');
    $('t-star').classList.toggle('aim', auto === 'starboard');
    $('t-fire').classList.toggle('hot', hotA);
  }

  /** A broadside just finished reloading mid-fight. */
  gunsReady(side: 'port' | 'starboard') {
    const els: [HTMLElement, string][] = [[$(side === 'port' ? 't-port' : 't-star'), 'ping'], [this.rack, side === 'port' ? 'ping-p' : 'ping-s']];
    for (const [el, cls] of els) {
      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), 650);
    }
  }

  flashBroadside(side: 'port' | 'starboard') {
    const els: [HTMLElement, string][] = [[$(side === 'port' ? 't-port' : 't-star'), 'flash'], [this.rack, side === 'port' ? 'flash-p' : 'flash-s']];
    for (const [el, cls] of els) {
      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
    }
  }

  setWind(angle: number) {
    // screen: up = north (-z). Arrow svg points up by default.
    const deg = 180 - (angle * 180) / Math.PI;
    this.windDeg = deg;
    this.setGust(0);
  }

  /** The compass arrow puffs up a little while a gust is blowing through. */
  setGust(g: number) {
    const s = 1 + Math.min(g, 1.2) * 0.22;
    if (Math.abs(s - this.windScale) < 0.01) return;
    this.windScale = s;
    ($('hud-wind').firstElementChild as HTMLElement).style.transform = `rotate(${this.windDeg}deg) scale(${s.toFixed(3)})`;
  }

  private skyKey = '';
  private skyTagT = 0;
  /** Flashes a short label (the chosen weather) under the clock. */
  skyTag(text: string) {
    const el = $('hud-sky');
    el.dataset.tag = text;
    el.classList.remove('tag');
    void el.offsetWidth;
    el.classList.add('tag');
    clearTimeout(this.skyTagT);
    this.skyTagT = window.setTimeout(() => el.classList.remove('tag'), 1600);
  }
  /** Clock & weather badge beside the minimap. */
  setSky(hour: number, icon: string, label: string) {
    const m = Math.floor(((hour % 24) * 60) / 5) * 5;
    const text = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const key = text + icon + label;
    if (key === this.skyKey) return;
    this.skyKey = key;
    const el = $('hud-sky');
    const tag = el.classList.contains('tag');
    el.className = `sky ${icon}${hour < 5.5 || hour > 19.5 ? ' night' : ''}${tag ? ' tag' : ''}`;
    el.title = `${label} · ${text}`;
    $('hud-clock').textContent = text;
  }

  /** Floating health bars over enemies. */
  updateBars(ships: Ship[], player: Ship | null, camera: THREE.Camera, w: number, h: number) {
    const seen = new Set<number>();
    const v = new THREE.Vector3();
    for (const s of ships) {
      if (s === player || !s.alive) continue;
      v.set(s.pos.x, s.root.position.y + s.cls.masts[0].height * 0.55 + 4, s.pos.z).project(camera);
      if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) continue;
      seen.add(s.id);
      let el = this.barEls.get(s.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'ebar';
        el.innerHTML = `<i></i><span>${s.cls.name}</span><b class="fx"><u class="f"></u><u class="t"></u><u class="c"></u></b>`;
        this.bars.appendChild(el);
        this.barEls.set(s.id, el);
      }
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      el.style.transform = `translate(${x}px, ${y}px)`;
      (el.firstElementChild as HTMLElement).style.transform = `scaleX(${s.hp / s.maxHp})`;
      // what special shot has done to her: ablaze, sails shredded, crews thinned
      const st = `${+(s.afire > 0)}${+(s.torn > 0)}${+(s.crewHit > 0)}`;
      if (el.dataset.st !== st) {
        el.dataset.st = st;
        el.classList.toggle('afire', s.afire > 0);
        el.classList.toggle('torn', s.torn > 0);
        el.classList.toggle('crew', s.crewHit > 0);
      }
    }
    this.barEls.forEach((el, id) => {
      if (!seen.has(id)) {
        el.remove();
        this.barEls.delete(id);
      }
    });
  }

  // ------------------------------------------------------------- minimap

  buildMap(terrain: Terrain) {
    const res = 512;
    const c = document.createElement('canvas');
    c.width = c.height = res;
    const g = c.getContext('2d')!;
    const img = g.createImageData(res, res);
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const x = -WORLD_SIZE / 2 + (i + 0.5) * (WORLD_SIZE / res);
        const z = -WORLD_SIZE / 2 + (j + 0.5) * (WORLD_SIZE / res);
        const h = terrain.heightAt(x, z);
        let r: number, gg: number, b: number;
        if (h > 2.5) {
          const k = Math.min(1, (h - 2.5) / 40);
          r = 92 + k * 70;
          gg = 160 - k * 30;
          b = 74 + k * 40;
        } else if (h > 0) {
          r = 240;
          gg = 226;
          b = 186;
        } else {
          const k = Math.min(1, -h / 14);
          r = 70 - k * 56;
          gg = 205 - k * 120;
          b = 200 - k * 60;
        }
        const o = (j * res + i) * 4;
        img.data[o] = r;
        img.data[o + 1] = gg;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    this.mapImage = c;
    this.chart.setTerrain(terrain);
  }

  drawMap(player: Ship, ships: Ship[], loot: { x: number; z: number; tier?: number }[], islands: Island[], discovered: Set<string>, ports: { x: number; z: number }[] = []) {
    const g = this.map;
    const S = this.mapCanvas.width;
    const R = 420; // world metres from centre to edge
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    g.clip();
    if (this.mapImage) {
      const px = this.mapImage.width / WORLD_SIZE;
      const sx = (player.pos.x - R + WORLD_SIZE / 2) * px;
      const sz = (player.pos.z - R + WORLD_SIZE / 2) * px;
      g.imageSmoothingEnabled = true;
      g.drawImage(this.mapImage, sx, sz, R * 2 * px, R * 2 * px, 0, 0, S, S);
    }
    const toMap = (x: number, z: number): [number, number] => [((x - player.pos.x) / R) * (S / 2) + S / 2, ((z - player.pos.z) / R) * (S / 2) + S / 2];
    // undiscovered isles get a soft marker
    g.font = '600 18px Cinzel, serif';
    g.textAlign = 'center';
    for (const isl of islands) {
      const [x, y] = toMap(isl.x, isl.z);
      if (!discovered.has(isl.name)) {
        g.fillStyle = 'rgba(255, 241, 184, 0.9)';
        g.fillText('?', x, y + 6);
      }
    }
    for (const l of loot) {
      const [x, y] = toMap(l.x, l.z);
      const t = l.tier ?? 0;
      g.fillStyle = RARITY[t].css;
      g.beginPath();
      g.arc(x, y, t >= 3 ? 4.5 : t ? 3.5 : 2.6, 0, Math.PI * 2);
      g.fill();
    }
    // trading ports: in view where they are, else the nearest pinned to the rim to steer by
    let near: { x: number; z: number } | null = null;
    let nd = Infinity;
    let inView = false;
    for (const pt of ports) {
      const d = Math.hypot(pt.x - player.pos.x, pt.z - player.pos.z);
      if (d < R - 20) {
        portMark(g, ...toMap(pt.x, pt.z), 13);
        inView = true;
      } else if (d < nd) {
        nd = d;
        near = pt;
      }
    }
    if (near && !inView) {
      const a = Math.atan2(near.z - player.pos.z, near.x - player.pos.x);
      const rr = S / 2 - 18;
      g.globalAlpha = 0.9;
      portMark(g, S / 2 + Math.cos(a) * rr, S / 2 + Math.sin(a) * rr, 10);
      g.globalAlpha = 1;
    }
    const tri = (s: Ship, color: string, size: number) => {
      const [x, y] = toMap(s.pos.x, s.pos.z);
      g.save();
      g.translate(x, y);
      // heading: forward = (sin h, cos h) in (x, z); canvas y = z
      g.rotate(-s.heading + Math.PI);
      g.fillStyle = color;
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, -size);
      g.lineTo(size * 0.62, size * 0.8);
      g.lineTo(0, size * 0.45);
      g.lineTo(-size * 0.62, size * 0.8);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    };
    for (const s of ships) if (s !== player && s.alive) tri(s, '#ff6a55', 11);
    tri(player, '#ffffff', 14);
    g.restore();
    // bezel
    g.strokeStyle = 'rgba(255,240,210,0.25)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    g.stroke();
  }
}
