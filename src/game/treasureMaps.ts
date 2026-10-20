import { progressSaved } from '../core/progress';

// Treasure maps. A map comes torn in three pieces, found in sea chests and in
// the cutthroats' camps. The first piece fixes where it leads (an X on one of
// the islands); the third completes it, and the X goes on the chart. Dig there
// and the next map starts afresh. Kept between voyages and synced to the
// captain's account.

export const MAPS_KEY = 'aquati.maps.v1';

export interface MapState {
  /** Pieces held, as bits: 1, 2 and 4 are the left, middle and right thirds. */
  pieces: number;
  /** Fixes the X (and how the parchment is torn); 0 before the first piece. */
  seed: number;
  isle: string;
  x: number;
  z: number;
  /** Treasures dug up, ever. */
  dug: number;
}

export const ALL_PIECES = 7;

export const freshMaps = (): MapState => ({ pieces: 0, seed: 0, isle: '', x: 0, z: 0, dug: 0 });

/** Tidies a saved map (from this device or the cloud). */
export function cleanMaps(r: unknown): MapState | null {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const o = r as Record<string, unknown>;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    pieces: Math.max(0, Math.min(ALL_PIECES, Math.floor(n(o.pieces)))),
    seed: Math.floor(n(o.seed)),
    isle: typeof o.isle === 'string' ? o.isle : '',
    x: n(o.x),
    z: n(o.z),
    dug: Math.max(0, Math.floor(n(o.dug))),
  };
}

export function readMaps(): MapState | null {
  try {
    const v = localStorage.getItem(MAPS_KEY);
    return v ? cleanMaps(JSON.parse(v)) : null;
  } catch {
    return null;
  }
}

export const pieceCount = (bits: number) => (bits & 1) + ((bits >> 1) & 1) + ((bits >> 2) & 1);

export interface DigTarget {
  isle: string;
  x: number;
  z: number;
}

export class TreasureMaps {
  state: MapState = readMaps() ?? freshMaps();

  /** The cloud brought another device's map. */
  reload() {
    this.state = readMaps() ?? freshMaps();
  }

  get count() {
    return pieceCount(this.state.pieces);
  }

  get complete() {
    return this.state.pieces === ALL_PIECES && !!this.state.isle;
  }

  /** Where the X is, once the map is whole. */
  get target(): DigTarget | null {
    const s = this.state;
    return this.complete ? { isle: s.isle, x: s.x, z: s.z } : null;
  }

  /**
   * A torn piece found: one of the missing thirds. The first piece of a map
   * picks its X (`site` turns a seed into a spot). Returns the piece's index, or
   * -1 if the map is already whole.
   */
  addPiece(site: (seed: number) => DigTarget | null): number {
    const s = this.state;
    if (s.pieces === ALL_PIECES) return -1;
    if (!s.pieces || !s.isle) {
      let t: DigTarget | null = null;
      for (let i = 0; i < 6 && !t; i++) {
        s.seed = 1 + Math.floor(Math.random() * 2 ** 30);
        t = site(s.seed);
      }
      if (!t) return -1;
      s.isle = t.isle;
      s.x = Math.round(t.x * 10) / 10;
      s.z = Math.round(t.z * 10) / 10;
    }
    const missing = [0, 1, 2].filter((i) => !(s.pieces & (1 << i)));
    const i = missing[Math.floor(Math.random() * missing.length)];
    s.pieces |= 1 << i;
    this.save();
    return i;
  }

  /** The chest is up: this map is spent, and the next starts blank. */
  consume() {
    const dug = this.state.dug + 1;
    this.state = { ...freshMaps(), dug };
    this.save();
  }

  private save() {
    try {
      localStorage.setItem(MAPS_KEY, JSON.stringify(this.state));
    } catch {
      /* private mode: the map lasts the session */
    }
    progressSaved();
  }
}
