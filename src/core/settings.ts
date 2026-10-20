// Player graphics settings: a preset plus per-feature overrides, saved to
// localStorage. "Auto" follows the device tier picked at start-up and lets
// the frame-time governor scale resolution (and, as a last resort, step the
// preset down). Everything here applies live except world detail, which
// shapes geometry built while loading and so takes effect on the next launch.

export type PresetId = 'auto' | 'low' | 'medium' | 'high' | 'ultra';
export type Level = 'low' | 'medium' | 'high' | 'ultra';

export interface GraphicsSettings {
  preset: PresetId | 'custom';
  /** 0 = automatic dynamic resolution, otherwise a fixed render scale. */
  resolution: number;
  antialias: boolean;
  shadowRes: 1024 | 2048 | 4096;
  softShadows: boolean;
  rtShadows: boolean;
  rtAO: boolean;
  rtGI: boolean;
  rtReflections: boolean;
  bloom: boolean;
  tiltShift: boolean;
  /** Sunbeams through the haze under the clouds and down through the shallows. */
  lightShafts: boolean;
}

/** How many rays / steps each ray-traced effect gets at a level. */
export interface TraceBudget {
  aoSamples: number;
  shadowSteps: number;
  ssrSteps: number;
  shaftSteps: number;
}

export const LEVELS: Level[] = ['low', 'medium', 'high', 'ultra'];

const PRESETS: Record<Level, Omit<GraphicsSettings, 'preset' | 'resolution'>> = {
  low: { antialias: false, shadowRes: 1024, softShadows: false, rtShadows: false, rtAO: false, rtGI: false, rtReflections: false, bloom: true, tiltShift: false, lightShafts: false },
  medium: { antialias: true, shadowRes: 2048, softShadows: false, rtShadows: true, rtAO: true, rtGI: false, rtReflections: true, bloom: true, tiltShift: true, lightShafts: true },
  high: { antialias: true, shadowRes: 2048, softShadows: true, rtShadows: true, rtAO: true, rtGI: true, rtReflections: true, bloom: true, tiltShift: true, lightShafts: true },
  ultra: { antialias: true, shadowRes: 4096, softShadows: true, rtShadows: true, rtAO: true, rtGI: true, rtReflections: true, bloom: true, tiltShift: true, lightShafts: true },
};

const BUDGETS: Record<Level, TraceBudget> = {
  low: { aoSamples: 6, shadowSteps: 8, ssrSteps: 8, shaftSteps: 6 },
  medium: { aoSamples: 8, shadowSteps: 12, ssrSteps: 10, shaftSteps: 8 },
  high: { aoSamples: 10, shadowSteps: 16, ssrSteps: 14, shaftSteps: 12 },
  ultra: { aoSamples: 16, shadowSteps: 24, ssrSteps: 22, shaftSteps: 16 },
};

const KEY = 'aquati.graphics';
const TIER_LEVEL: Level[] = ['low', 'medium', 'high'];

export function presetValues(level: Level): GraphicsSettings {
  return { preset: level, resolution: 0, ...PRESETS[level] };
}

/** Saved choice, read before the world is built (it picks world detail). */
export function loadSettings(): GraphicsSettings | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<GraphicsSettings>;
    if (!s || typeof s !== 'object' || !s.preset) return null;
    const base = presetValues(s.preset === 'auto' || s.preset === 'custom' ? 'high' : (s.preset as Level));
    return { ...base, ...s } as GraphicsSettings;
  } catch {
    return null;
  }
}

export function saveSettings(s: GraphicsSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: settings last for this visit only */
  }
}

/** The world-detail tier a saved preset asks for, or null to detect it. */
export function savedTier(): 0 | 1 | 2 | null {
  const s = loadSettings();
  if (!s || s.preset === 'auto' || s.preset === 'custom') return null;
  return s.preset === 'low' ? 0 : s.preset === 'medium' ? 1 : 2;
}

/**
 * Live settings store. `autoLevel` is what "Auto" currently resolves to: the
 * device tier at start, lowered by the governor if frames stay too slow.
 */
export class Settings {
  value: GraphicsSettings;
  autoLevel: Level;
  private listeners: ((s: GraphicsSettings) => void)[] = [];

  constructor(tier: 0 | 1 | 2) {
    this.autoLevel = TIER_LEVEL[tier];
    const saved = loadSettings();
    if (saved && saved.preset !== 'auto') this.value = saved;
    else this.value = { ...presetValues(this.autoLevel), preset: 'auto', resolution: saved?.resolution ?? 0 };
  }

  /** The level the trace budgets come from. */
  get level(): Level {
    const p = this.value.preset;
    if (p === 'auto') return this.autoLevel;
    if (p === 'custom') return this.value.rtGI ? 'high' : this.value.rtAO ? 'medium' : 'low';
    return p;
  }

  get budget(): TraceBudget {
    return BUDGETS[this.level];
  }

  onChange(fn: (s: GraphicsSettings) => void) {
    this.listeners.push(fn);
  }

  setPreset(p: PresetId) {
    const resolution = this.value.resolution;
    this.value = p === 'auto' ? { ...presetValues(this.autoLevel), preset: 'auto', resolution } : { ...presetValues(p), resolution };
    this.commit();
  }

  set<K extends keyof GraphicsSettings>(key: K, v: GraphicsSettings[K]) {
    if (this.value[key] === v) return;
    this.value = { ...this.value, [key]: v };
    if (key !== 'resolution' && key !== 'preset') {
      // a hand-tuned feature turns the preset into "custom" unless it
      // happens to land exactly on one
      const match = LEVELS.find((l) => sameFeatures(this.value, presetValues(l)));
      const autoMatch = sameFeatures(this.value, presetValues(this.autoLevel));
      this.value.preset = autoMatch && this.value.preset === 'auto' ? 'auto' : (match ?? 'custom');
    }
    this.commit();
  }

  /** The governor's last resort in Auto: drop one level. Returns false at the floor. */
  stepDown(): boolean {
    if (this.value.preset !== 'auto') return false;
    const i = LEVELS.indexOf(this.autoLevel);
    if (i <= 0) return false;
    this.autoLevel = LEVELS[i - 1];
    this.value = { ...presetValues(this.autoLevel), preset: 'auto', resolution: this.value.resolution };
    this.emit();
    return true;
  }

  private commit() {
    saveSettings(this.value);
    this.emit();
  }

  private emit() {
    for (const fn of this.listeners) fn(this.value);
  }
}

function sameFeatures(a: GraphicsSettings, b: GraphicsSettings) {
  return (Object.keys(PRESETS.low) as (keyof typeof PRESETS.low)[]).every((k) => a[k] === b[k]);
}
