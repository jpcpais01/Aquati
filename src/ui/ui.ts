import * as THREE from 'three';
import { PATCH_NOTES } from '../data/patchNotes';
import { SHIP_CLASSES, ShipClassId } from '../ships/shipTypes';
import { Ship } from '../ships/ship';
import { RARITY } from '../game/loot';
import { Terrain, WORLD_SIZE, Island } from '../world/terrain';
import { SeaChart, ChartScene } from './chart';

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

  constructor() {
    this.buildCards();
    $('btn-sail').addEventListener('click', () => {
      this.onClick();
      this.onSail();
    });
    const openNotes = () => {
      this.onClick();
      this.renderNotes();
      $('notes').classList.remove('hidden');
    };
    const openControls = () => {
      this.onClick();
      $('controls').classList.remove('hidden');
    };
    $('btn-notes').addEventListener('click', openNotes);
    $('btn-notes2').addEventListener('click', openNotes);
    $('btn-controls').addEventListener('click', openControls);
    $('btn-controls2').addEventListener('click', openControls);
    document.querySelectorAll('[data-close]').forEach((b) =>
      b.addEventListener('click', () => {
        this.onClick();
        (b.closest('.screen') as HTMLElement).classList.add('hidden');
      }),
    );
    $('btn-sound').addEventListener('click', () => {
      this.soundOn = !this.soundOn;
      $('btn-sound').textContent = `Sound: ${this.soundOn ? 'on' : 'off'}`;
      this.onSound(this.soundOn);
      this.onClick();
    });
    $('btn-resume').addEventListener('click', () => this.onResume());
    $('btn-quit').addEventListener('click', () => this.onQuit());
    $('btn-again').addEventListener('click', () => this.onAgain());
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
    for (let i = 0; i < 24; i++) {
      const el = document.createElement('div');
      el.className = 'floater';
      el.style.display = 'none';
      this.floaters.appendChild(el);
      this.floaterPool.push({ el, t: 0, life: 0, x: 0, y: 0, vy: 0 });
    }
  }

  setTouch(on: boolean) {
    document.body.classList.toggle('is-touch', on);
  }

  progress(p: number) {
    this.loadBar.style.width = `${Math.round(p * 100)}%`;
  }

  hideLoading() {
    this.loading.classList.add('out');
    setTimeout(() => this.loading.classList.add('hidden'), 1000);
  }

  private buildCards() {
    const host = $('ship-cards');
    host.innerHTML = '';
    (Object.keys(SHIP_CLASSES) as ShipClassId[]).forEach((id) => {
      const c = SHIP_CLASSES[id];
      const card = document.createElement('button');
      card.className = 'ship-card' + (id === this.selected ? ' sel' : '');
      card.dataset.id = id;
      const stat = (label: string, v: number) => `<div class="stat"><span>${label}</span><div class="track"><i style="width:${Math.round(v * 100)}%"></i></div></div>`;
      card.innerHTML = `
        <h3>${c.name}<small>${c.title}</small></h3>
        <p>${c.blurb}</p>
        ${stat('Speed', c.stats.speed)}
        ${stat('Agility', c.stats.agility)}
        ${stat('Armour', c.stats.armour)}
        ${stat('Hull', c.stats.hull)}
        ${stat('Firepower', c.stats.firepower)}
        <div class="guns"><span><b>${c.cannonsPerSide * 2}</b> guns</span><span><b>${c.masts.length}</b> mast${c.masts.length > 1 ? 's' : ''}</span><span><b>${c.reload.toFixed(1)}s</b> reload</span></div>`;
      card.addEventListener('click', () => {
        if (this.selected === id) return;
        this.selected = id;
        host.querySelectorAll('.ship-card').forEach((el) => el.classList.toggle('sel', (el as HTMLElement).dataset.id === id));
        this.onClick();
        this.onSelect(id);
      });
      host.appendChild(card);
    });
  }

  private renderNotes() {
    const body = $('notes-body');
    body.innerHTML = PATCH_NOTES.map((g) => {
      const d = new Date(g.hour);
      const label = isNaN(d.getTime())
        ? g.hour
        : d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      return `<div class="group"><h4>${label}</h4>${g.entries
        .map((e) => `<div class="entry"><b>${e.title}</b><ul>${e.notes.map((n) => `<li>${n}</li>`).join('')}</ul></div>`)
        .join('')}</div>`;
    }).join('');
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

  showPause(on: boolean) {
    $('pause').classList.toggle('hidden', !on);
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

  showDead(on: boolean, info?: { gold: number; kills: number; isles: number; time: number; ship: string }) {
    $('dead').classList.toggle('hidden', !on);
    if (on && info) {
      const m = Math.floor(info.time / 60);
      const s = Math.floor(info.time % 60);
      $('dead-sub').textContent = `The ${info.ship} slipped beneath the waves after ${m}m ${s.toString().padStart(2, '0')}s at sea.`;
      $('dead-summary').innerHTML = `<div><b>${info.gold}</b>Gold</div><div><b>${info.kills}</b>Sunk</div><div><b>${info.isles}</b>Islands</div>`;
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

  private skyKey = '';
  /** Clock & weather badge beside the minimap. */
  setSky(hour: number, icon: string, label: string) {
    const m = Math.floor(((hour % 24) * 60) / 5) * 5;
    const text = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const key = text + icon + label;
    if (key === this.skyKey) return;
    this.skyKey = key;
    const el = $('hud-sky');
    el.className = `sky ${icon}${hour < 5.5 || hour > 19.5 ? ' night' : ''}`;
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
