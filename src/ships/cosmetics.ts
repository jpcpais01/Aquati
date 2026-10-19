// Special cosmetics won from the Treasure Vault: hull skins (procedural paint
// jobs that run in the ship's own shaders, the legendary ones alive and
// glowing), muzzle blasts and shot trails. The catalogue, the odds and the
// player's collection (kept in this browser) all live here.

export type Rarity = 0 | 1 | 2 | 3;
export type CosmeticKind = 'skin' | 'blast' | 'trail';

export interface RarityInfo {
  id: string;
  name: string;
  css: string;
  /** A second, deeper tone for gradients. */
  deep: string;
  /** Gold handed back for a duplicate. */
  refund: number;
}

export const RARITIES: RarityInfo[] = [
  { id: 'common', name: 'Common', css: '#9fe8d8', deep: '#2b8f86', refund: 40 },
  { id: 'rare', name: 'Rare', css: '#6cc8ff', deep: '#1f6fd1', refund: 100 },
  { id: 'epic', name: 'Epic', css: '#c48bff', deep: '#7a35d6', refund: 300 },
  { id: 'legendary', name: 'Legendary', css: '#ffbe3d', deep: '#e0701a', refund: 1000 },
];

export interface Cosmetic {
  id: string;
  kind: CosmeticKind;
  name: string;
  rarity: Rarity;
  blurb: string;
  /** Owned from the start and never in the vault. */
  base?: boolean;
}

export interface SkinItem extends Cosmetic {
  kind: 'skin';
  /** Pattern id in GLSL_SKIN (0 = your own paintwork). */
  pattern: number;
  colors: [string, string, string];
  /** How much of the bare sailcloth takes the pattern (0..1). */
  sail: number;
  /** Emissive strength for the glowing ones. */
  glow: number;
  animated?: boolean;
}

export interface FxItem extends Cosmetic {
  kind: 'blast' | 'trail';
  /** Recipe id understood by fx/particles.ts and the previews. */
  style: string;
  /** Two colours that sum it up, for chips and card frames. */
  tint: [string, string];
}

export type Item = SkinItem | FxItem;

const skin = (id: string, name: string, rarity: Rarity, pattern: number, colors: [string, string, string], blurb: string, o: Partial<SkinItem> = {}): SkinItem => ({
  id: 'skin:' + id,
  kind: 'skin',
  name,
  rarity,
  pattern,
  colors,
  blurb,
  sail: 1,
  glow: 0,
  ...o,
});

const fx = (kind: 'blast' | 'trail', id: string, name: string, rarity: Rarity, tint: [string, string], blurb: string, base = false): FxItem => ({
  id: `${kind}:${id}`,
  kind,
  name,
  rarity,
  style: id,
  tint,
  blurb,
  base,
});

export const SKINS: SkinItem[] = [
  skin('none', 'Your Paintwork', 0, 0, ['#1f8a8a', '#f4ead4', '#e2b552'], 'The colours you chose at the Shipwright, nothing more.', { base: true }),
  // common
  skin('harbour', 'Harbour Stripes', 0, 1, ['#1d3f73', '#f5efe1', '#c4402f'], 'Navy and cream bands with a scarlet pinstripe, as smart as a harbourmaster\'s coat.'),
  skin('harlequin', 'Harlequin', 0, 2, ['#1f8a8a', '#f3ecdc', '#d9a441'], 'Teal and ivory diamonds, every seam picked out in gold leaf.'),
  skin('scales', 'Fish Scale', 0, 3, ['#2f6b47', '#86c99c', '#eaf3d2'], 'Overlapping green scales, painted by a bosun with a lot of patience.'),
  skin('polka', 'Coral Polka', 0, 4, ['#e46f4b', '#fbf3e4', '#b33a2c'], 'Cream spots on coral red. Nobody fears it. Everybody remembers it.'),
  // rare
  skin('tiger', 'Tiger Shark', 1, 5, ['#e8792f', '#1d1714', '#f4dcb5'], 'Wild black stripes over burnt orange, with a pale belly at the waterline.'),
  skin('camo', 'Reef Camo', 1, 6, ['#4f7a5a', '#a7b98a', '#2c3b33'], 'Kelp, sand and shadow. Vanish against any shoal.', { sail: 0.85 }),
  skin('chevron', 'Sunset Chevron', 1, 7, ['#f2b347', '#e4573d', '#6b2f86'], 'Bold arrows in the colours of the last hour of the day.'),
  skin('tartan', 'Highland Tartan', 1, 8, ['#1d4f3a', '#9c2a2a', '#f2c45a'], 'A woven clan plaid of forest green and crimson, threaded with gold.'),
  skin('marble', 'Carrara Marble', 1, 9, ['#ece8e1', '#8f8c88', '#d4a94a'], 'Polished white stone veined in grey and gold. Absurdly heavy. Floats anyway.', { sail: 0.5 }),
  // epic
  skin('kintsugi', 'Kintsugi Lacquer', 2, 10, ['#0d0c0f', '#2a1f3a', '#f0c35a'], 'Mirror-black lacquer, every old battle scar mended in molten gold.'),
  skin('kraken', 'Kraken Ink', 2, 11, ['#1a0f2e', '#7b2a8c', '#3fd1c4'], 'Swirls of violet ink that slowly churn, as if something below is still stirring.', { animated: true }),
  skin('damask', 'Royal Damask', 2, 12, ['#7a1424', '#e8b84f', '#f6dfa0'], 'Crimson velvet stamped with gilded rosettes, fit for an admiral of the crown.'),
  skin('mermaid', 'Mermaid Scales', 2, 13, ['#0f5c63', '#3fb7b0', '#f3f0ff'], 'Pearlescent scales that shift from teal to violet as she turns in the light.'),
  // legendary: alive, and glowing after dark
  skin('molten', 'Molten Core', 3, 14, ['#1a1412', '#ff5a12', '#ffd56a'], 'Black basalt split by rivers of lava that pulse and flow along her flanks.', { glow: 1, animated: true }),
  skin('aurora', 'Aurora Borealis', 3, 15, ['#07122b', '#38ff9c', '#b46bff'], 'Curtains of northern light ripple across a midnight hull and every sail.', { glow: 1, animated: true }),
  skin('starlit', 'Starlit Voyage', 3, 16, ['#0b1033', '#5b2fa3', '#ff6fb5'], 'A drifting nebula full of twinkling stars. Sail the night sky itself.', { glow: 1, animated: true }),
  skin('ghostfire', 'Ghostfire', 3, 17, ['#0c1f1d', '#39ffb0', '#d8fff0'], 'Spectral green flames lick up from the waterline and never burn a plank.', { glow: 1, animated: true }),
  skin('tide', 'Living Tide', 3, 18, ['#06263d', '#3ff0ff', '#c8fff9'], 'Rippling caustics and a bioluminescent swell that rolls from bow to stern.', { glow: 1, animated: true }),
];

export const BLASTS: FxItem[] = [
  fx('blast', 'powder', 'Classic Powder', 0, ['#ffd9a0', '#d8d4cc'], 'An honest flash and a great bank of white smoke.', true),
  fx('blast', 'seasalt', 'Sea Salt Burst', 0, ['#ffffff', '#cfe9f2'], 'A crisp white flash and clean, bright smoke that hangs like sea fog.'),
  fx('blast', 'soot', 'Blackpowder Fury', 0, ['#ff9a3d', '#3b3633'], 'Cheap powder, double charge: a dirty orange flash and a wall of black soot.'),
  fx('blast', 'ember', 'Ember Burst', 1, ['#ffb347', '#ff5a1f'], 'A shower of glowing embers that arc out over the water and hiss as they land.'),
  fx('blast', 'ring', 'Smoke Ring', 1, ['#ffffff', '#bcd4dc'], 'Every gun blows a perfect, widening smoke ring. Pure showmanship.'),
  fx('blast', 'azure', 'Azure Flame', 2, ['#7fe3ff', '#2f6bff'], 'Copper salts in the charge: an ice-blue flash, cyan sparks and pale blue smoke.'),
  fx('blast', 'confetti', 'Carnival Salute', 2, ['#ff6fb5', '#ffd23f'], 'Fires a cloud of festival confetti with every broadside. Morale soars.'),
  fx('blast', 'dragon', 'Dragon\'s Breath', 3, ['#ffcf4a', '#ff3d12'], 'A roaring cone of fire from every gunport, then a slow rain of embers.'),
  fx('blast', 'thunder', 'Thunderclap', 3, ['#e6ecff', '#9b7bff'], 'A violet-white flash, crackling arcs and a shockwave that ripples across the sea.'),
];

export const TRAILS: FxItem[] = [
  fx('trail', 'powder', 'Powder Wake', 0, ['#f2f0ec', '#ffb760'], 'A thin wake of powder smoke with a hot spark at the ball.', true),
  fx('trail', 'spray', 'Sea Spray', 0, ['#e9fbff', '#9ad8ea'], 'The ball drags a fine mist of salt spray behind it.'),
  fx('trail', 'soot', 'Sooty Wake', 0, ['#5a5450', '#2c2826'], 'A thick, dirty smoke line that hangs over the water.'),
  fx('trail', 'ember', 'Ember Tail', 1, ['#ffb347', '#ff4d12'], 'Burning embers fall from the shot all the way to its mark.'),
  fx('trail', 'frost', 'Frost Wisp', 1, ['#c9f4ff', '#5cc8ff'], 'An icy blue streak trailing glittering frost.'),
  fx('trail', 'comet', 'Golden Comet', 2, ['#ffe08a', '#ff9f1c'], 'A long golden tail with glowing motes, like a comet in broad daylight.'),
  fx('trail', 'ghost', 'Ghostlight', 2, ['#9dffd6', '#22d67e'], 'Green spectral wisps that coil and fade behind every ball.'),
  fx('trail', 'rainbow', 'Rainbow Ribbon', 3, ['#ff5f6d', '#5fd0ff'], 'A shimmering ribbon of every colour, with sparkles that drift away.'),
  fx('trail', 'starfall', 'Starfall', 3, ['#ffffff', '#b38cff'], 'A white-violet streak shedding twinkling stars that linger in the air.'),
];

export const ALL: Item[] = [...SKINS, ...BLASTS, ...TRAILS];
const BY_ID = new Map<string, Item>(ALL.map((i) => [i.id, i]));
export const POOL = ALL.filter((i) => !i.base);
export const BASE = { skin: 'skin:none', blast: 'blast:powder', trail: 'trail:powder' } as const;

export const item = (id: string) => BY_ID.get(id);
export const skinItem = (id: string) => (BY_ID.get(id)?.kind === 'skin' ? (BY_ID.get(id) as SkinItem) : (BY_ID.get(BASE.skin) as SkinItem));
export const fxItem = (id: string) => BY_ID.get(id) as FxItem | undefined;

export const KIND_NAMES: Record<CosmeticKind, string> = { skin: 'Hull skin', blast: 'Muzzle blast', trail: 'Shot trail' };

// ------------------------------------------------------------------ odds

export const PULL_COST = 300;
export const TEN_COST = 2700;
export const START_PURSE = 1500;
/** Chances before pity kicks in. */
export const ODDS: Record<Rarity, number> = { 3: 0.025, 2: 0.095, 1: 0.28, 0: 0.6 };
/** A legendary is certain by this many opens; the odds climb from SOFT_PITY on. */
export const HARD_PITY = 50;
export const SOFT_PITY = 35;
/** An epic or better at least once every this many opens. */
export const EPIC_PITY = 10;

export interface PullResult {
  item: Item;
  fresh: boolean;
  refund: number;
}

export interface Equipped {
  skin: string;
  blast: string;
  trail: string;
}

interface VaultState {
  purse: number;
  owned: Record<string, number>;
  equip: Equipped;
  pity: { leg: number; epic: number };
  pulls: number;
  /** Day (YYYY-MM-DD) the daily free open was last used. */
  daily: string;
  /** Won but not yet looked at in the Shipwright. */
  unseen: string[];
}

const KEY = 'aquati.vault.v1';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function fresh(): VaultState {
  return {
    purse: START_PURSE,
    owned: { [BASE.skin]: 1, [BASE.blast]: 1, [BASE.trail]: 1 },
    equip: { ...BASE },
    pity: { leg: 0, epic: 0 },
    pulls: 0,
    daily: '',
    unseen: [],
  };
}

function load(): VaultState {
  const s = fresh();
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!r || typeof r !== 'object') return s;
    if (Number.isFinite(r.purse)) s.purse = Math.max(0, Math.floor(r.purse));
    if (r.owned && typeof r.owned === 'object') for (const [k, v] of Object.entries(r.owned)) if (BY_ID.has(k) && Number.isFinite(v)) s.owned[k] = Math.max(1, Math.floor(v as number));
    if (r.equip && typeof r.equip === 'object') {
      for (const k of ['skin', 'blast', 'trail'] as const) {
        const id = r.equip[k];
        if (typeof id === 'string' && BY_ID.get(id)?.kind === k && s.owned[id]) s.equip[k] = id;
      }
    }
    if (r.pity && typeof r.pity === 'object') {
      s.pity.leg = Math.min(HARD_PITY - 1, Math.max(0, Math.floor(r.pity.leg) || 0));
      s.pity.epic = Math.min(EPIC_PITY - 1, Math.max(0, Math.floor(r.pity.epic) || 0));
    }
    if (Number.isFinite(r.pulls)) s.pulls = Math.max(0, Math.floor(r.pulls));
    if (typeof r.daily === 'string') s.daily = r.daily.slice(0, 10);
    if (Array.isArray(r.unseen)) s.unseen = r.unseen.filter((id: unknown) => typeof id === 'string' && BY_ID.has(id as string)).slice(0, 64);
  } catch {
    // private mode or a mangled save: start a fresh vault
  }
  return s;
}

/** The player's purse and collection. Everything is saved the moment it changes. */
export class VaultStore {
  private s = load();
  /** Fires on any change (purse, collection, equipment). */
  private subs = new Set<() => void>();

  get purse() {
    return this.s.purse;
  }
  get equipped(): Readonly<Equipped> {
    return this.s.equip;
  }
  get pity() {
    return { legendary: HARD_PITY - this.s.pity.leg, epic: EPIC_PITY - this.s.pity.epic };
  }
  get totalPulls() {
    return this.s.pulls;
  }
  get freeReady() {
    return this.s.daily !== today();
  }
  get unseen(): readonly string[] {
    return this.s.unseen;
  }

  owns(id: string) {
    return !!this.s.owned[id];
  }

  count(id: string) {
    return this.s.owned[id] ?? 0;
  }

  /** How many of the vault's items you hold. */
  collected() {
    return POOL.filter((i) => this.s.owned[i.id]).length;
  }

  subscribe(fn: () => void) {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.s));
    } catch {
      // the vault still works for this session
    }
    this.subs.forEach((f) => f());
  }

  earn(gold: number) {
    if (gold <= 0) return;
    this.s.purse += Math.round(gold);
    this.save();
  }

  equip(id: string) {
    const it = BY_ID.get(id);
    if (!it || !this.s.owned[id]) return false;
    this.s.equip[it.kind] = id;
    this.save();
    return true;
  }

  markSeen(kind?: CosmeticKind) {
    const before = this.s.unseen.length;
    this.s.unseen = kind ? this.s.unseen.filter((id) => BY_ID.get(id)?.kind !== kind) : [];
    if (this.s.unseen.length !== before) this.save();
  }

  canAfford(n: 1 | 10) {
    if (n === 1 && this.freeReady) return true;
    return this.s.purse >= (n === 1 ? PULL_COST : TEN_COST);
  }

  /** Opens the chest n times. Returns null if the purse is short. */
  pull(n: 1 | 10): PullResult[] | null {
    if (!this.canAfford(n)) return null;
    if (n === 1 && this.freeReady) this.s.daily = today();
    else this.s.purse -= n === 1 ? PULL_COST : TEN_COST;
    const rarities: Rarity[] = [];
    for (let i = 0; i < n; i++) rarities.push(this.roll());
    // a full ten always holds at least one epic
    if (n === 10 && !rarities.some((r) => r >= 2)) {
      rarities[rarities.length - 1] = 2;
      this.s.pity.epic = 0;
    }
    const out = rarities.map((r) => this.grant(r));
    this.s.pulls += n;
    this.save();
    return out;
  }

  private roll(): Rarity {
    const p = this.s.pity;
    p.leg++;
    p.epic++;
    const leg = p.leg >= HARD_PITY ? 1 : ODDS[3] + Math.max(0, p.leg - SOFT_PITY) * 0.06;
    const r = Math.random();
    let out: Rarity;
    if (r < leg) out = 3;
    else if (p.epic >= EPIC_PITY || r < leg + ODDS[2]) out = 2;
    else if (r < leg + ODDS[2] + ODDS[1]) out = 1;
    else out = 0;
    if (out === 3) p.leg = p.epic = 0;
    else if (out === 2) p.epic = 0;
    return out;
  }

  private grant(r: Rarity): PullResult {
    const pool = POOL.filter((i) => i.rarity === r);
    // the vault favours what you don't have yet
    const w = pool.map((i) => (this.s.owned[i.id] ? 1 : 3));
    let x = Math.random() * w.reduce((a, b) => a + b, 0);
    let it = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) {
      x -= w[i];
      if (x <= 0) {
        it = pool[i];
        break;
      }
    }
    const isNew = !this.s.owned[it.id];
    this.s.owned[it.id] = (this.s.owned[it.id] ?? 0) + 1;
    const refund = isNew ? 0 : RARITIES[r].refund;
    this.s.purse += refund;
    if (isNew && !this.s.unseen.includes(it.id)) this.s.unseen.push(it.id);
    return { item: it, fresh: isNew, refund };
  }
}
