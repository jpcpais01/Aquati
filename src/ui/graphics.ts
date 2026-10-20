import './graphics.css';
import { GraphicsSettings, Level, PresetId, Settings } from '../core/settings';
import { icon } from './art';

// The Graphics card, opened from the harbour and from the pause menu. Every
// change applies live over the scene behind it (the backdrop stays clear
// enough to see), and the footer reads out frame rate and render scale so
// players can feel what each option costs on their own device.

export const GFX_ICON =
  '<circle cx="12" cy="12" r="3.6"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>';

const I = {
  mirror: '<path d="M3 13h18"/><path d="M7 13V7.5L10.5 4l3.5 3.5V13"/><path d="M7 15.5v1.5M10.5 15.5v4M14 15.5v1.5" opacity=".55"/>',
  contact: '<path d="M8 4v11"/><path d="M5 15h6"/><path d="M11 15l7 4H6z" fill="currentColor" stroke="none" opacity=".45"/><path d="M11 15l7 4"/>',
  ao: '<path d="M4 20V8l8-4 8 4v12"/><path d="M4 20l8-5 8 5" opacity=".55"/><path d="M12 15V4"/>',
  bounce: '<circle cx="17" cy="6" r="2.4"/><path d="M15 8 9 16l-4-6"/><path d="M3 20h18"/>',
  soft: '<path d="M6 4v10"/><path d="M6 14l10 5" stroke-width="3" opacity=".25"/><path d="M6 14l10 5"/><path d="M3 20h18"/>',
  shadow: '<circle cx="9" cy="9" r="4.5"/><path d="M12.2 12.2 19 19" stroke-width="3" opacity=".35"/>',
  aa: '<path d="M5 19 12 5l7 14"/><path d="M8 13h8"/>',
  bloom: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.5" opacity=".45"/><circle cx="12" cy="12" r="9.5" opacity=".2"/>',
  tilt: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M3 14h18" opacity=".45"/>',
  rays: '<circle cx="12" cy="4.5" r="2.2"/><path d="M9.5 8 5 20M12 8.5V20M14.5 8 19 20" opacity=".55"/><path d="M3 20h18"/>',
  res: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>',
};

const PRESETS: { id: PresetId; name: string; pips: number }[] = [
  { id: 'auto', name: 'Auto', pips: 0 },
  { id: 'low', name: 'Low', pips: 1 },
  { id: 'medium', name: 'Medium', pips: 2 },
  { id: 'high', name: 'High', pips: 3 },
  { id: 'ultra', name: 'Ultra', pips: 4 },
];

const LEVEL_NAME: Record<Level, string> = { low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra' };

type Toggle = { key: keyof GraphicsSettings; name: string; desc: string; ico: string };

const RAY: Toggle[] = [
  { key: 'rtReflections', name: 'Reflections', desc: 'Hulls, sails and cliffs mirrored in the sea', ico: I.mirror },
  { key: 'rtShadows', name: 'Contact shadows', desc: 'Crisp shade wherever things touch', ico: I.contact },
  { key: 'rtAO', name: 'Ambient occlusion', desc: 'Soft shade in creases, decks and coves', ico: I.ao },
  { key: 'rtGI', name: 'Bounce light', desc: 'Sunlight bouncing colour onto nearby surfaces', ico: I.bounce },
];

const $ = (id: string) => document.getElementById(id)!;

export class GraphicsPanel {
  private root = $('graphics');
  private body = $('gfx-body');
  private stats: HTMLElement | null = null;
  private statTimer = 0;

  constructor(
    private settings: Settings,
    private click: () => void,
    private readout: () => { fps: number; scale: number; maxShadow: number },
  ) {
    for (const id of ['btn-graphics', 'btn-graphics2']) {
      const b = document.getElementById(id);
      if (!b) continue;
      b.querySelector('.ti')!.innerHTML = icon(GFX_ICON);
      b.addEventListener('click', () => this.open());
    }
    this.body.addEventListener('click', (e) => this.onClick(e));
    settings.onChange(() => this.isOpen() && this.render());
    // the card closes through the shared overlay plumbing in UI; stop the
    // live readout when that happens
    new MutationObserver(() => {
      const open = this.isOpen();
      // clear the stage while tuning: the menu (or pause card) steps aside so
      // the live scene shows every change
      document.body.classList.toggle('gfx-open', open);
      if (!open) clearInterval(this.statTimer);
    }).observe(this.root, { attributes: true, attributeFilter: ['class'] });
  }

  private isOpen() {
    return !this.root.classList.contains('hidden');
  }

  open() {
    this.click();
    this.render();
    this.root.classList.remove('hidden');
    clearInterval(this.statTimer);
    this.statTimer = window.setInterval(() => this.tickStats(), 500);
    this.tickStats();
  }

  private onClick(e: Event) {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-preset],[data-toggle],[data-set]');
    if (!t || (t as HTMLButtonElement).disabled) return;
    this.click();
    const s = this.settings;
    if (t.dataset.preset) s.setPreset(t.dataset.preset as PresetId);
    else if (t.dataset.toggle) {
      const k = t.dataset.toggle as keyof GraphicsSettings;
      s.set(k, !s.value[k] as never);
    } else if (t.dataset.set) {
      const [k, v] = t.dataset.set.split('=');
      s.set(k as keyof GraphicsSettings, Number(v) as never);
    }
  }

  private render() {
    const s = this.settings.value;
    const { maxShadow } = this.readout();
    const presetTiles = PRESETS.map((p) => {
      const on = s.preset === p.id;
      const sub = p.id === 'auto' ? LEVEL_NAME[this.settings.autoLevel] : '';
      const pips = p.id === 'auto' ? `<span class="gfx-auto">${sub}</span>` : `<span class="gfx-pips">${[1, 2, 3, 4].map((k) => `<i class="${k <= p.pips ? 'on' : ''}"></i>`).join('')}</span>`;
      return `<button class="gfx-preset${on ? ' sel' : ''}" data-preset="${p.id}" aria-pressed="${on}"><b>${p.name}</b>${pips}</button>`;
    }).join('');
    const toggle = (t: Toggle) => {
      const on = !!s[t.key];
      return `<button class="gfx-row" data-toggle="${t.key}" role="switch" aria-checked="${on}">
        <span class="gfx-ico">${icon(t.ico)}</span>
        <span class="gfx-text"><b>${t.name}</b><small>${t.desc}</small></span>
        <span class="gfx-switch${on ? ' on' : ''}"><i></i></span>
      </button>`;
    };
    const seg = (key: keyof GraphicsSettings, opts: [number, string][], disabled: (v: number) => boolean = () => false) =>
      `<span class="gfx-seg">${opts
        .map(([v, label]) => `<button data-set="${key}=${v}" class="${s[key] === v ? 'sel' : ''}"${disabled(v) ? ' disabled' : ''}>${label}</button>`)
        .join('')}</span>`;

    this.body.innerHTML = `
      <div class="gfx-presets">${presetTiles}</div>
      <div class="gfx-custom${s.preset === 'custom' ? '' : ' hidden'}">Custom settings</div>
      <section class="gfx-group">
        <h4>Ray tracing <span class="gfx-badge">screen-space</span></h4>
        ${RAY.map(toggle).join('')}
      </section>
      <section class="gfx-group">
        <h4>Shadows</h4>
        <div class="gfx-row static">
          <span class="gfx-ico">${icon(I.shadow)}</span>
          <span class="gfx-text"><b>Shadow detail</b><small>Sharper edges cost memory</small></span>
          ${seg('shadowRes', [[1024, '1K'], [2048, '2K'], [4096, '4K']], (v) => v > maxShadow)}
        </div>
        ${toggle({ key: 'softShadows', name: 'Soft shadows', desc: 'Sharp at the foot, soft at the masthead', ico: I.soft })}
      </section>
      <section class="gfx-group">
        <h4>Image</h4>
        <div class="gfx-row static">
          <span class="gfx-ico">${icon(I.res)}</span>
          <span class="gfx-text"><b>Resolution</b><small>Auto trades pixels for a steady frame</small></span>
          ${seg('resolution', [[0, 'Auto'], [0.5, '50%'], [0.75, '75%'], [1, '100%']])}
        </div>
        ${toggle({ key: 'antialias', name: 'Anti-aliasing', desc: 'Smooth edges on rigging and hulls', ico: I.aa })}
        ${toggle({ key: 'bloom', name: 'Bloom', desc: 'Sun glare and glowing lanterns', ico: I.bloom })}
        ${toggle({ key: 'lightShafts', name: 'Sun shafts', desc: 'Beams through gaps in the clouds and the shallows', ico: I.rays })}
        ${toggle({ key: 'tiltShift', name: 'Tilt-shift', desc: 'Miniature-style focus blur', ico: I.tilt })}
      </section>
      <footer class="gfx-foot"><span id="gfx-stats"></span><span>Presets also set world detail from the next launch</span></footer>`;
    this.stats = this.body.querySelector('#gfx-stats');
    this.tickStats();
  }

  private tickStats() {
    if (!this.stats) return;
    const r = this.readout();
    this.stats.innerHTML = `<b>${Math.round(r.fps)}</b> FPS · <b>${Math.round(r.scale * 100)}%</b> resolution`;
  }
}
