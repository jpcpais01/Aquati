// Player options, kept in localStorage. The quality tier is read once at boot
// (see core/quality.ts), everything else applies live.

export type QualityPref = 'auto' | 'low' | 'med' | 'high';
export type HudSize = 'compact' | 'standard' | 'large';
export type ShakePref = 'full' | 'gentle' | 'off';

export interface Settings {
  sound: boolean;
  music: boolean;
  quality: QualityPref;
  fps: boolean;
  hud: HudSize;
  shake: ShakePref;
}

const KEY = 'aquati.settings';
export const QUALITY_KEY = 'aquati.quality';

const DEFAULTS: Settings = { sound: true, music: true, quality: 'auto', fps: true, hud: 'standard', shake: 'full' };

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    return { ...DEFAULTS, ...raw, quality: (localStorage.getItem(QUALITY_KEY) as QualityPref | null) ?? 'auto' };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings) {
  try {
    const { quality, ...rest } = s;
    localStorage.setItem(KEY, JSON.stringify(rest));
    if (quality === 'auto') localStorage.removeItem(QUALITY_KEY);
    else localStorage.setItem(QUALITY_KEY, quality);
  } catch {
    /* private mode: settings last for this visit */
  }
}

export const SHAKE_SCALE: Record<ShakePref, number> = { full: 1, gentle: 0.4, off: 0 };
