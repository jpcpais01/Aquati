import * as THREE from 'three';
import { PATCH_NOTES } from '../data/patchNotes';
import { SHIP_CLASSES, ShipClassId } from '../ships/shipTypes';
import { Ship } from '../ships/ship';
import { RARITY } from '../game/loot';
import { Terrain, WORLD_SIZE, Island } from '../world/terrain';
import { SeaChart, ChartScene } from './chart';
import { crest, ICONS, STAT_ICONS, STAT_LABELS, icon, shipSilhouette } from './art';

const NOTES_SEEN_KEY = 'aquati.notesSeen';
/** Cards that sit over the menus and close on Esc or a tap outside. */
const OVERLAYS = ['notes', 'controls', 'graphics'];
const TIPS = [
  'Charting the archipelago…',
  'Sail across the wind for the best speed',
  'Rake a foe from the side your guns face',
  'Salvage floats to you: sail close to collect it',
  'Every isle you chart pays a bounty',
  'Gusts darken the water: chase them for a burst of speed',
];

export interface VoyageInfo {
  gold: number;
  kills: number;
  isles: number;
  time: number;
}

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
  onSound: (on: boolean) => void = () => {};
  onPause: () => void = () => {};
  onMap: (open: boolean) => void = () => {};
  onClick: () => void = () => {};
  private soundOn = true;

  private tipTimer = 0;
  private menuKeys = (e: KeyboardEvent) => this.onMenuKey(e);

  constructor() {
    document.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
      el.innerHTML = icon(ICONS[el.dataset.icon as keyof typeof ICONS]);
    });
    document.querySelectorAll('.crest-slot').forEach((el) => (el.innerHTML = crest()));
    this.startTips();
    this.buildShipPicker();
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
    // tap the dimmed sea around a notes / controls card to close it
    for (const id of OVERLAYS) {
      $(id).addEventListener('click', (e) => {
        if (e.target === e.currentTarget) this.closeOverlay(id);
      });
    }
    const toggleSound = () => {
      this.soundOn = !this.soundOn;
      this.syncSound();
      this.onSound(this.soundOn);
      this.onClick();
    };
    $('btn-sound').addEventListener('click', toggleSound);
    $('btn-refresh').addEventListener('click', () => {
      this.onClick();
      this.refreshGame();
    });
    $('btn-sound2').addEventListener('click', toggleSound);
    $('btn-resume').addEventListener('click', () => {
      this.onClick();
      this.onResume();
    });
    $('btn-quit').addEventListener('click', () => {
      this.onClick();
      this.onQuit();
    });
    $('btn-again').addEventListener('click', () => {
      this.onClick();
      this.onAgain();
    });
    $('btn-pause').addEventListener('click', () => this.onPause());
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
        const open = OVERLAYS.find((id) => !$(id).classList.contains('hidden'));
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

  private openOverlay(id: string) {
    $(id).classList.remove('hidden');
  }

  private closeOverlay(id: string) {
    $(id).classList.add('hidden');
  }

  private overlayOpen() {
    return OVERLAYS.some((id) => !$(id).classList.contains('hidden'));
  }

  /** Menu shortcuts: arrows / A D / 1 2 3 pick a ship, Enter sets sail. */
  private onMenuKey(e: KeyboardEvent) {
    if (this.menu.classList.contains('hidden') || this.overlayOpen() || e.repeat) return;
    const ids = Object.keys(SHIP_CLASSES) as ShipClassId[];
    const i = ids.indexOf(this.selected);
    const k = e.key.toLowerCase();
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
      b.title = this.soundOn ? 'Sound on' : 'Sound off';
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
    const detail = $('ship-detail');
    detail.innerHTML = `
      <div class="detail-head">
        <div><small>The ${c.title}</small><h3>${c.name}</h3></div>
        <div class="facts"><span><b>${c.cannonsPerSide * 2}</b>guns</span><span><b>${c.hp}</b>hull</span><span><b>${c.reload.toFixed(1)}s</b>reload</span></div>
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
  menuFraming(): { x: number; y: number } {
    const W = innerWidth;
    const H = innerHeight;
    const dock = $('dock').getBoundingClientRect();
    if (!dock.width) return { x: 0, y: 0 };
    if (dock.right < W * 0.6) {
      // side dock: centre the ship in the space to its right
      return { x: (dock.right + W) / 2 / W - 0.5, y: 0.04 };
    }
    // bottom dock: lift the ship into the gap between the title and the dock
    const head = document.querySelector('.menu-head')!.getBoundingClientRect();
    return { x: 0, y: (head.bottom + dock.top) / 2 / H - 0.5 };
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
    if (!on) {
      this.barEls.forEach((el) => el.remove());
      this.barEls.clear();
    }
  }

  showPause(on: boolean, info?: VoyageInfo) {
    $('pause').classList.toggle('hidden', !on);
    if (on && info) $('pause-summary').innerHTML = this.summary(info);
    if (!on) OVERLAYS.forEach((id) => this.closeOverlay(id));
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

  showDead(on: boolean, info?: VoyageInfo & { ship: string; cls: ShipClassId }) {
    $('dead').classList.toggle('hidden', !on);
    if (on && info) {
      const m = Math.floor(info.time / 60);
      const s = Math.floor(info.time % 60);
      $('dead-sub').textContent = `The ${info.ship} slipped beneath the waves after ${m}m ${s.toString().padStart(2, '0')}s at sea.`;
      $('dead-summary').innerHTML = this.summary(info);
      $('wreck-ship').innerHTML = shipSilhouette(SHIP_CLASSES[info.cls]);
      // restart the sinking animation
      const scene = $('wreck-scene');
      scene.classList.remove('go');
      void scene.offsetWidth;
      scene.classList.add('go');
    }
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

  floater(text: string, x: number, y: number, kind: '' | 'bad' | 'loot' | 'rare' | 'epic' | 'legendary' = '') {
    const f = this.floaterPool.find((p) => p.t >= p.life) ?? this.floaterPool[0];
    f.el.textContent = text;
    f.el.className = 'floater' + (kind ? ' ' + kind : '');
    f.el.style.display = 'block';
    f.t = 0;
    f.life = kind === 'legendary' ? 2.4 : kind === 'epic' ? 1.9 : kind === 'rare' ? 1.6 : 1.3;
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

  updateHud(p: Ship, isles: number, totalIsles: number) {
    $('hud-title').textContent = p.name;
    $('hud-class').textContent = p.cls.name;
    const frac = p.hp / p.maxHp;
    const fill = $('hud-hull');
    fill.style.transform = `scaleX(${frac})`;
    fill.classList.toggle('low', frac < 0.35);
    $('hud-hull-text').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    $('hud-gold').textContent = `${p.gold}`;
    $('hud-kills').textContent = `${p.kills}`;
    $('hud-isles').textContent = `${isles}/${totalIsles}`;
    $('hud-speed').textContent = `${Math.round(Math.abs(p.speed) * 1.94)}`;
    const pips = $('hud-sails').children;
    const lvl = Math.round(p.sailTarget * 3);
    for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('on', i < lvl);
    const ring = (id: string, reload: number) => {
      const el = $(id);
      const k = 1 - reload / p.cls.reload;
      (el.querySelector('circle.p') as SVGCircleElement).style.strokeDashoffset = `${106.8 * (1 - k)}`;
      el.classList.toggle('ready', reload <= 0);
    };
    ring('bs-port', p.reload.port);
    ring('bs-star', p.reload.starboard);
  }

  flashBroadside(side: 'port' | 'starboard') {
    const el = $(side === 'port' ? 'bs-port' : 'bs-star');
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
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
        el.innerHTML = `<i></i><span>${s.cls.name}</span>`;
        this.bars.appendChild(el);
        this.barEls.set(s.id, el);
      }
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      el.style.transform = `translate(${x}px, ${y}px)`;
      (el.firstElementChild as HTMLElement).style.transform = `scaleX(${s.hp / s.maxHp})`;
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

  drawMap(player: Ship, ships: Ship[], loot: { x: number; z: number; tier?: number }[], islands: Island[], discovered: Set<string>) {
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
