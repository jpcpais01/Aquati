import { progressSaved } from '../core/progress';
import { LINE_SHIPS, SHIP_CLASSES, type ShipClassId } from './shipTypes';

// The event ships: special ships, not of the line, each a kind of her own
// (any size, any shape, her own colours and a power of her own), that sail in
// for a season of the year. While an event is on its ships join the
// harbour's picker in a tab that glows in the event's colours; pick one while
// it's on and she's yours to keep, in the picker for good after the season
// ends (claimed, saved with the rest of your progress).

export interface ShipEvent {
  name: string;
  ships: ShipClassId[];
  /** The days it runs, [month, day], both inclusive, the same days every year. */
  from: [number, number];
  to: [number, number];
  /** The tab's glow, a second glow, and the ink its words are set in. */
  glow: string;
  glow2: string;
  ink: string;
}

export const EVENTS: Record<string, ShipEvent> = {
  // All Hallows' Eve: the Hollow Jack sails out of the mist
  hallowtide: { name: 'Hallowtide', ships: ['revenant'], from: [10, 17], to: [11, 8], glow: '#ff8a1e', glow2: '#8dffc4', ink: '#ffc27a' },
};

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `?events=on|off` holds every season open or shut whatever the date (for testing). */
function forced(): boolean | null {
  try {
    const v = new URLSearchParams(location.search).get('events');
    return v === 'on' ? true : v === 'off' ? false : null;
  } catch {
    return null;
  }
}

/** The event a ship sails in for (null for a ship of the line). */
export function eventOf(id: ShipClassId): (ShipEvent & { id: string }) | null {
  const key = SHIP_CLASSES[id].event;
  return key && EVENTS[key] ? { ...EVENTS[key], id: key } : null;
}

/** Whether an event is on at a moment. */
export function eventOn(id: string, when = new Date()): boolean {
  const f = forced();
  if (f !== null) return f;
  const e = EVENTS[id];
  if (!e) return false;
  const md = (when.getMonth() + 1) * 100 + when.getDate();
  const a = e.from[0] * 100 + e.from[1];
  const b = e.to[0] * 100 + e.to[1];
  return a <= b ? md >= a && md <= b : md >= a || md <= b;
}

/** Whether a ship's season is on, so she can be picked (and claimed). */
export function shipOn(id: ShipClassId, when = new Date()) {
  const e = eventOf(id);
  return !!e && eventOn(e.id, when);
}

/** The last day of an event's season, as "8 Nov". */
export function lastDay(id: string) {
  const e = EVENTS[id];
  return e ? `${e.to[1]} ${MONTHS[e.to[0]]}` : '';
}

// ------------------------------------------------------------------ yours to keep

export const CLAIMED_KEY = 'aquati.claimed';

export function cleanClaimed(raw: unknown): ShipClassId[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter((id): id is ShipClassId => typeof id === 'string' && id in SHIP_CLASSES && !!SHIP_CLASSES[id as ShipClassId].event);
}

export function readClaimed(): ShipClassId[] | null {
  try {
    const raw = localStorage.getItem(CLAIMED_KEY);
    return raw ? cleanClaimed(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Claimed on either side stays claimed. */
export function mergeClaimed(a: ShipClassId[] | null, b: ShipClassId[] | null): ShipClassId[] | null {
  if (!a && !b) return null;
  return [...new Set([...(a ?? []), ...(b ?? [])])];
}

/** Whether she's yours for good. */
export function claimed(id: ShipClassId) {
  return !!readClaimed()?.includes(id);
}

/** Sailing her in her season makes her yours. True if she's only just been claimed. */
export function claim(id: ShipClassId): boolean {
  if (!SHIP_CLASSES[id].event || claimed(id) || !shipOn(id)) return false;
  try {
    localStorage.setItem(CLAIMED_KEY, JSON.stringify([...(readClaimed() ?? []), id]));
    progressSaved();
  } catch {
    /* private mode: hers for this visit */
  }
  return true;
}

/** Whether she can be sailed: a ship of the line, one claimed, or one whose event is on. */
export function sailable(id: ShipClassId) {
  return !SHIP_CLASSES[id].event || claimed(id) || shipOn(id);
}

/** The harbour's ships, in order: the line, then each event ship you may sail. */
export function harbourShips(): ShipClassId[] {
  const out = [...LINE_SHIPS];
  for (const e of Object.values(EVENTS)) for (const s of e.ships) if (sailable(s)) out.push(s);
  return out;
}
