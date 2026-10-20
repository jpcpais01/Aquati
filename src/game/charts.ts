import { progressSaved } from '../core/progress';

// The archipelagos you've sailed into. Until you have, Las Brumas is only a
// rumour on the chart: a faint outline in the mist past the edge of the known
// sea. Synced with the rest of the world's progress (see cloud/profile.ts),
// and wiped with it on a world reset.

export const CHARTS_KEY = 'aquati.charts.v1';

export interface ChartSave {
  /** Archipelago id → when you first sailed into it (ms since 1970). */
  seen: Record<string, number>;
}

export const freshCharts = (): ChartSave => ({ seen: {} });

export function cleanCharts(r: unknown): ChartSave | null {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const seen: Record<string, number> = {};
  const s = (r as Record<string, unknown>).seen;
  if (s && typeof s === 'object' && !Array.isArray(s)) {
    for (const [k, v] of Object.entries(s)) if (Number.isFinite(Number(v))) seen[k] = Math.max(0, Math.floor(Number(v)));
  }
  return { seen };
}

export function readCharts(): ChartSave | null {
  try {
    const v = localStorage.getItem(CHARTS_KEY);
    return v ? cleanCharts(JSON.parse(v)) : null;
  } catch {
    return null;
  }
}

/** Charted anywhere stays charted, from the first time either device saw it. */
export function mergeCharts(l: ChartSave | null, r: ChartSave | null): ChartSave | null {
  if (!l) return r;
  if (!r) return l;
  const seen = { ...r.seen };
  for (const [k, t] of Object.entries(l.seen)) seen[k] = Math.min(t, seen[k] ?? Infinity);
  return { seen };
}

export class ChartStore {
  state: ChartSave = readCharts() ?? freshCharts();

  reload() {
    this.state = readCharts() ?? freshCharts();
  }

  has(id: string) {
    return id in this.state.seen;
  }

  /** Charts an archipelago; true the first time. */
  mark(id: string) {
    if (this.has(id)) return false;
    this.state.seen[id] = Date.now();
    this.save();
    return true;
  }

  wipe() {
    this.state = freshCharts();
    this.save();
  }

  private save() {
    try {
      localStorage.setItem(CHARTS_KEY, JSON.stringify(this.state));
    } catch {
      /* private mode: charted for the session */
    }
    progressSaved();
  }
}
