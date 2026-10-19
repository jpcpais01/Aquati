// Player options outside graphics (those live in core/settings.ts), kept in
// localStorage and applied live.

export type HudSize = 'compact' | 'standard' | 'large';
export type ShakePref = 'full' | 'gentle' | 'off';

export interface Settings {
  sound: boolean;
  music: boolean;
  fps: boolean;
  hud: HudSize;
  shake: ShakePref;
}

const KEY = 'aquati.settings';

const DEFAULTS: Settings = { sound: true, music: true, fps: true, hud: 'standard', shake: 'full' };

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: settings last for this visit */
  }
}

export const SHAKE_SCALE: Record<ShakePref, number> = { full: 1, gentle: 0.4, off: 0 };
