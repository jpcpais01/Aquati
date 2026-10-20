// The captain's profile: every bit of progress that follows a player between
// devices (purse and vault, livery, saved designs, records, gifts, chosen
// ship), read from and written to this browser's own saves.
//
// Syncing is a three-way merge. Each device remembers the cloud copy it last
// agreed with (the "base"); whatever changed locally since then is replayed on
// top of whatever is in the cloud now. Gold and counts merge as deltas, so gold
// earned offline on a phone and gold spent on a laptop both survive; looks and
// equipment are last-writer-wins; collections only ever grow.
//
// Hand-painted flags are big PNG data URLs, so in the packed (cloud) form they
// become `ref:<hash>` and live in their own documents.

import { freshVault, GIFT_PREFIX, VAULT_KEY, VaultState } from '../ships/cosmetics';
import { freshParts, PARTS_KEY, PartsState, sanitizeParts } from '../ships/parts';
import { LOOK_KEY, MAX_SAVED, SAVED_KEY } from '../ships/look';
import { Records, RECORDS_KEY } from '../ui/wreck';
import { SHIP_KEY } from '../ui/ui';
import { BOUNTY_KEY, cleanLedger, Ledger, mergeLedger, readLedger } from '../game/bounty';

type Json = Record<string, unknown>;

export interface Design {
  id: string;
  name: string;
  look: Json;
}

export interface Profile {
  vault: VaultState | null;
  /** Upgrade parts found and each ship's refit. */
  parts: PartsState | null;
  look: Json | null;
  designs: Design[];
  records: Records | null;
  /** Gift key → gold it paid. */
  gifts: Record<string, number>;
  ship: string | null;
  /** Infamy and the Wanted Board's stamped posters. */
  bounty: Ledger | null;
}

/** Gifts saved before amounts were recorded. */
const LEGACY_GIFTS: Record<string, number> = { 'fleet-10k': 10000 };

const ZERO_RECORDS: Records = { voyages: 0, renown: 0, gold: 0, kills: 0, isles: 0, time: 0 };

// ------------------------------------------------------------------ this device

function readJson(k: string): unknown {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

function readVault(): VaultState | null {
  const r = readJson(VAULT_KEY);
  if (!isObj(r)) return null;
  const f = freshVault();
  const v = { ...f, ...r } as VaultState;
  v.purse = Math.max(0, Math.floor(Number(v.purse) || 0));
  v.pulls = Math.max(0, Math.floor(Number(v.pulls) || 0));
  if (!isObj(v.owned)) v.owned = f.owned;
  if (!isObj(v.equip)) v.equip = f.equip;
  if (!isObj(v.pity)) v.pity = f.pity;
  if (!Array.isArray(v.unseen)) v.unseen = [];
  if (typeof v.daily !== 'string') v.daily = '';
  return v;
}

export function readLocal(): Profile {
  const designs = readJson(SAVED_KEY);
  const records = readJson(RECORDS_KEY);
  const look = readJson(LOOK_KEY);
  const parts = readJson(PARTS_KEY);
  const gifts: Record<string, number> = {};
  let ship: string | null = null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(GIFT_PREFIX)) continue;
      const key = k.slice(GIFT_PREFIX.length);
      const n = Number(localStorage.getItem(k)) || 0;
      gifts[key] = n === 1 && LEGACY_GIFTS[key] ? LEGACY_GIFTS[key] : n;
    }
    ship = localStorage.getItem(SHIP_KEY);
  } catch {
    /* private mode: nothing saved here anyway */
  }
  return {
    vault: readVault(),
    parts: isObj(parts) ? sanitizeParts(parts) : null,
    look: isObj(look) ? look : null,
    designs: Array.isArray(designs) ? designs.filter((d): d is Design => isObj(d) && typeof d.id === 'string' && isObj(d.look)) : [],
    records: isObj(records) ? { ...ZERO_RECORDS, ...(records as Partial<Records>) } : null,
    gifts,
    ship,
    bounty: readLedger(),
  };
}

function setOrRemove(k: string, v: string | null) {
  if (v === null) localStorage.removeItem(k);
  else localStorage.setItem(k, v);
}

/** Overwrites this device's saves with a profile (paints must be resolved). */
export function writeLocal(p: Profile) {
  try {
    setOrRemove(VAULT_KEY, p.vault ? JSON.stringify(p.vault) : null);
    setOrRemove(PARTS_KEY, p.parts ? JSON.stringify(p.parts) : null);
    setOrRemove(LOOK_KEY, p.look ? JSON.stringify(p.look) : null);
    setOrRemove(SAVED_KEY, p.designs.length ? JSON.stringify(p.designs.slice(0, MAX_SAVED)) : null);
    setOrRemove(RECORDS_KEY, p.records ? JSON.stringify(p.records) : null);
    setOrRemove(SHIP_KEY, p.ship);
    setOrRemove(BOUNTY_KEY, p.bounty ? JSON.stringify(p.bounty) : null);
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(GIFT_PREFIX) && !(k.slice(GIFT_PREFIX.length) in p.gifts)) stale.push(k);
    }
    stale.forEach((k) => localStorage.removeItem(k));
    for (const [k, n] of Object.entries(p.gifts)) localStorage.setItem(GIFT_PREFIX + k, String(n));
  } catch {
    /* private mode or full: the game keeps its in-memory state */
  }
}

export const emptyProfile = (): Profile => ({ vault: null, parts: null, look: null, designs: [], records: null, gifts: {}, ship: null, bounty: null });

/** Back to a brand-new guest: what a sign-out leaves behind. */
export function resetLocal() {
  writeLocal(emptyProfile());
}

/** True when there is anything worth carrying into an account. */
export function hasProgress(p: Profile) {
  const v = p.vault;
  const f = freshVault();
  return !!(
    (v && (v.purse !== f.purse || v.pulls > 0 || Object.keys(v.owned).length > Object.keys(f.owned).length)) ||
    (p.parts && Object.keys(p.parts.owned).length) ||
    p.designs.length ||
    (p.records && p.records.voyages > 0) ||
    (p.bounty && p.bounty.infamy > 0) ||
    Object.keys(p.gifts).length
  );
}

// ------------------------------------------------------------------ paints

/** cyrb53, twice: a fast, stable 26-hex-digit content hash. */
function hash(s: string) {
  const h = (seed: number) => {
    let a = 0xdeadbeef ^ seed;
    let b = 0x41c6ce57 ^ seed;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      a = Math.imul(a ^ c, 2654435761);
      b = Math.imul(b ^ c, 1597334677);
    }
    a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
    b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
    return (4294967296 * (2097151 & b) + (a >>> 0)).toString(16).padStart(14, '0').slice(-13);
  };
  return h(0) + h(7919);
}

const REF = 'ref:';

function mapPaints(p: Profile, fn: (paint: string) => string): Profile {
  const out = structuredClone(p);
  const fix = (look: Json | null) => {
    const flag = look?.flag;
    if (isObj(flag) && typeof flag.paint === 'string' && flag.paint) flag.paint = fn(flag.paint);
  };
  fix(out.look);
  out.designs.forEach((d) => fix(d.look));
  return out;
}

/** Swaps painted flags for references; returns the paints by hash. */
export function pack(p: Profile) {
  const paints = new Map<string, string>();
  const packed = mapPaints(p, (paint) => {
    if (!paint.startsWith('data:')) return paint.startsWith(REF) ? paint : '';
    const h = hash(paint);
    paints.set(h, paint);
    return REF + h;
  });
  return { packed, paints };
}

/** Every paint a packed profile points at. */
export function paintRefs(p: Profile) {
  const out = new Set<string>();
  mapPaints(p, (paint) => {
    if (paint.startsWith(REF)) out.add(paint.slice(REF.length));
    return paint;
  });
  return out;
}

/** Packed profile with any paint we don't have blanked (it is fetched again next sync). */
export function dropMissing(p: Profile, have: Map<string, string>) {
  return mapPaints(p, (paint) => (paint.startsWith(REF) && !have.has(paint.slice(REF.length)) ? '' : paint));
}

export function unpack(p: Profile, paints: Map<string, string>): Profile {
  return mapPaints(p, (paint) => (paint.startsWith(REF) ? paints.get(paint.slice(REF.length)) ?? '' : paint));
}

// ------------------------------------------------------------------ merging

/** JSON with sorted keys, so equal data always compares equal. */
export function stable(v: unknown): string {
  return JSON.stringify(v, (_k, x) =>
    isObj(x)
      ? Object.keys(x)
          .sort()
          .reduce<Json>((o, k) => ((o[k] = x[k]), o), {})
      : x,
  );
}

const same = (a: unknown, b: unknown) => stable(a) === stable(b);

/** Last writer wins: ours if we changed it since the base, else theirs. */
function latest<T>(b: T | undefined, l: T, r: T, first: boolean): T {
  if (r === null || r === undefined) return l;
  if (first) return r;
  return same(l, b) ? r : l;
}

function mergeVault(b: VaultState | null, l: VaultState | null, r: VaultState | null, first: boolean, giftOverlap: number): VaultState | null {
  if (!l) return r;
  if (!r) return l;
  const B = b ?? freshVault();
  const out = structuredClone(r);
  out.purse = Math.max(0, r.purse + (l.purse - B.purse) - giftOverlap);
  for (const id of new Set([...Object.keys(l.owned), ...Object.keys(r.owned)])) {
    const n = (r.owned[id] ?? 0) + Math.max(0, (l.owned[id] ?? 0) - (B.owned[id] ?? 0));
    if (n > 0) out.owned[id] = n;
  }
  out.pulls = r.pulls + Math.max(0, l.pulls - B.pulls);
  out.pity = !first && l.pulls > B.pulls ? { ...l.pity } : { ...r.pity };
  out.daily = l.daily > r.daily ? l.daily : r.daily;
  out.equip = { ...latest(B.equip, l.equip, r.equip, first) };
  for (const k of ['skin', 'blast', 'trail'] as const) if (!out.owned[out.equip[k]]) out.equip[k] = r.equip[k];
  const removed = new Set(B.unseen.filter((id) => !l.unseen.includes(id)));
  const added = l.unseen.filter((id) => !B.unseen.includes(id));
  out.unseen = [...new Set([...r.unseen.filter((id) => !removed.has(id)), ...added])].slice(0, 64);
  return out;
}

function mergeParts(b: PartsState | null, l: PartsState | null, r: PartsState | null, first: boolean): PartsState | null {
  if (!l) return r;
  if (!r) return l;
  const B = b ?? freshParts();
  const out = structuredClone(r);
  // finds on either side are kept: counts merge as deltas, like the vault's
  for (const id of new Set([...Object.keys(l.owned), ...Object.keys(r.owned)])) {
    const n = (r.owned[id] ?? 0) + Math.max(0, (l.owned[id] ?? 0) - (B.owned[id] ?? 0));
    if (n > 0) out.owned[id] = n;
  }
  out.fit = structuredClone(latest(B.fit, l.fit, r.fit, first));
  const removed = new Set(B.unseen.filter((id) => !l.unseen.includes(id)));
  const added = l.unseen.filter((id) => !B.unseen.includes(id));
  out.unseen = [...new Set([...r.unseen.filter((id) => !removed.has(id)), ...added])];
  return sanitizeParts(out);
}

function mergeRecords(b: Records | null, l: Records | null, r: Records | null): Records | null {
  if (!l) return r;
  if (!r) return l;
  const B = b ?? ZERO_RECORDS;
  return {
    voyages: r.voyages + Math.max(0, l.voyages - B.voyages),
    renown: Math.max(l.renown, r.renown),
    gold: Math.max(l.gold, r.gold),
    kills: Math.max(l.kills, r.kills),
    isles: Math.max(l.isles, r.isles),
    time: Math.max(l.time, r.time),
  };
}

function mergeDesigns(b: Design[] | null, l: Design[], r: Design[]): Design[] {
  if (!b) {
    // first meeting: the account's designs, then this device's new ones
    const ids = new Set(r.map((d) => d.id));
    return [...r, ...l.filter((d) => !ids.has(d.id))].slice(0, MAX_SAVED);
  }
  const B = new Map(b.map((d) => [d.id, d]));
  const L = new Map(l.map((d) => [d.id, d]));
  const out: Design[] = [];
  // new here since the last sync go on top, the way the shipwright adds them
  for (const d of l) if (!B.has(d.id) && !r.some((x) => x.id === d.id)) out.push(d);
  for (const d of r) {
    const was = B.get(d.id);
    const mine = L.get(d.id);
    if (was && !mine) continue; // deleted here
    out.push(mine && was && !same(mine, was) ? mine : d);
  }
  return out.slice(0, MAX_SAVED);
}

/** base: the cloud copy this device last agreed with (null the first time). */
export function merge(base: Profile | null, local: Profile, remote: Profile): Profile {
  const first = !base;
  const B = base ?? emptyProfile();
  // a gift both sides claimed since the base would otherwise be paid twice
  let giftOverlap = 0;
  for (const [k, n] of Object.entries(local.gifts)) if (k in remote.gifts && !(k in B.gifts)) giftOverlap += n;
  const gifts = { ...remote.gifts };
  for (const [k, n] of Object.entries(local.gifts)) gifts[k] = Math.max(n, gifts[k] ?? 0);
  return {
    vault: mergeVault(B.vault, local.vault, remote.vault, first, giftOverlap),
    parts: mergeParts(B.parts, local.parts, remote.parts, first),
    look: latest(B.look, local.look, remote.look, first),
    designs: mergeDesigns(base ? B.designs : null, local.designs, remote.designs),
    records: mergeRecords(B.records, local.records, remote.records),
    gifts,
    ship: latest(B.ship, local.ship, remote.ship, first),
    bounty: mergeLedger(B.bounty ?? null, local.bounty ?? null, remote.bounty ?? null),
  };
}

export type Part = Exclude<keyof Profile, 'gifts'>;

/** Which parts differ, so the game reloads only what it must. */
export function changedParts(a: Profile, b: Profile): Set<Part> {
  const out = new Set<Part>();
  for (const k of ['vault', 'parts', 'look', 'designs', 'records', 'ship', 'bounty'] as const) if (!same(a[k] ?? null, b[k] ?? null)) out.add(k);
  return out;
}

/** Parses a cloud copy defensively: anything odd falls back to empty. */
export function parseProfile(raw: unknown): Profile | null {
  if (typeof raw !== 'string') return null;
  try {
    const p = JSON.parse(raw);
    if (!isObj(p)) return null;
    const e = emptyProfile();
    return {
      vault: isObj(p.vault) ? ({ ...freshVault(), ...p.vault } as VaultState) : null,
      parts: isObj(p.parts) ? sanitizeParts(p.parts) : null,
      look: isObj(p.look) ? p.look : null,
      designs: Array.isArray(p.designs) ? (p.designs as unknown[]).filter((d): d is Design => isObj(d) && typeof d.id === 'string' && isObj(d.look)) : e.designs,
      records: isObj(p.records) ? { ...ZERO_RECORDS, ...(p.records as Partial<Records>) } : null,
      gifts: isObj(p.gifts) ? Object.fromEntries(Object.entries(p.gifts).filter(([, n]) => Number.isFinite(n)) as [string, number][]) : {},
      ship: typeof p.ship === 'string' ? p.ship : null,
      bounty: cleanLedger(p.bounty),
    };
  } catch {
    return null;
  }
}
