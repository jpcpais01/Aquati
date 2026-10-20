// What the sea gives up: sixty kinds of plunder in five rarities, from casks
// of rum to the Crown of the Drowned King. Salvage and chests no longer pay
// out gold on the spot: their goods ride home in the ship's hold and are only
// worth something once a trading port's market buys them.

export type Rarity = 0 | 1 | 2 | 3 | 4;

export interface RarityStyle {
  name: string;
  /** UI colour. */
  css: string;
}

export const RARITIES: RarityStyle[] = [
  { name: 'Common', css: '#e3d9c2' },
  { name: 'Uncommon', css: '#7fe08e' },
  { name: 'Rare', css: '#6cc8ff' },
  { name: 'Epic', css: '#c48bff' },
  { name: 'Legendary', css: '#ffb52e' },
];

/** What the market files a good under; each port pays more for some than others. */
export type Category = 'spirits' | 'provisions' | 'cloth' | 'coin' | 'gems' | 'jewellery' | 'art' | 'relics';

export const CATEGORIES: Record<Category, string> = {
  spirits: 'Spirits',
  provisions: 'Provisions',
  cloth: 'Cloth',
  coin: 'Coin',
  gems: 'Gems',
  jewellery: 'Jewellery',
  art: 'Art',
  relics: 'Relics',
};

/** How a porter carries it ashore. */
export type Carry = 'crate' | 'barrel' | 'sack' | 'casket' | 'painting' | 'idol';

export type LootId =
  | 'rum' | 'pennies' | 'tobacco' | 'coffee' | 'calico' | 'sugar' | 'cheese' | 'conch'
  | 'silver' | 'spices' | 'wine' | 'silk' | 'scrimshaw' | 'sextant' | 'indigo'
  | 'doubloons' | 'pearls' | 'emeralds' | 'dagger' | 'portrait' | 'saffron'
  | 'ruby' | 'tiara' | 'chalice' | 'seascape' | 'astrolabe'
  | 'crown' | 'idol' | 'krakenPearl' | 'mask'
  | 'hardtack' | 'oranges' | 'saltfish' | 'coconuts' | 'rope' | 'cider' | 'cowries' | 'tankard'
  | 'tea' | 'cacao' | 'brandy' | 'lace' | 'spyglass' | 'coral' | 'pipe'
  | 'reserve' | 'ingots' | 'jade' | 'cameo' | 'musicBox' | 'chronometer'
  | 'diamond' | 'globe' | 'helm' | 'egg' | 'carpet'
  | 'trident' | 'bottleShip' | 'sceptre' | 'sunstone'
  | 'krakenInk' | 'krakenBeak';

export interface LootKind {
  id: LootId;
  name: string;
  rarity: Rarity;
  cat: Category;
  /** Fair price in gold before the port's mood. */
  price: number;
  /** Room it takes in the hold. */
  size: number;
  carry: Carry;
  blurb: string;
}

const K = (id: LootId, name: string, rarity: Rarity, cat: Category, price: number, size: number, carry: Carry, blurb: string): LootKind => ({
  id, name, rarity, cat, price, size, carry, blurb,
});

export const LOOT: Record<LootId, LootKind> = Object.fromEntries(
  [
    // common
    K('rum', 'Cask of Rum', 0, 'spirits', 30, 2, 'barrel', 'Dark, sweet and strong enough to strip paint.'),
    K('pennies', 'Copper Pennies', 0, 'coin', 14, 1, 'sack', 'A pouch of green-edged coppers.'),
    K('tobacco', 'Tobacco Leaf', 0, 'provisions', 22, 1, 'sack', 'Cured golden leaf, tied in fat bundles.'),
    K('coffee', 'Coffee Beans', 0, 'provisions', 20, 1, 'sack', 'Roasted beans that smell of a far shore.'),
    K('calico', 'Bolt of Calico', 0, 'cloth', 18, 1, 'crate', 'Cheerful printed cotton, by the yard.'),
    K('sugar', 'Sugar Loaves', 0, 'provisions', 16, 1, 'crate', 'Hard white cones wrapped in blue paper.'),
    K('cheese', 'Wheel of Cheese', 0, 'provisions', 15, 1, 'crate', 'A whole wheel. Somebody will miss it.'),
    K('conch', 'Pink Conch Shell', 0, 'relics', 12, 1, 'crate', 'Hold it to your ear and hear the reef.'),
    // uncommon
    K('silver', 'Pieces of Eight', 1, 'coin', 70, 1, 'casket', 'Silver reales, cut and stamped with a cross.'),
    K('spices', 'Chest of Spices', 1, 'provisions', 85, 1, 'crate', 'Cinnamon, clove and nutmeg in neat little drawers.'),
    K('wine', 'Vintage Claret', 1, 'spirits', 90, 2, 'crate', 'Wax-sealed bottles packed in straw.'),
    K('silk', 'Bolt of Silk', 1, 'cloth', 95, 1, 'crate', 'Shimmers teal one way and violet the other.'),
    K('scrimshaw', 'Scrimshaw Tusk', 1, 'art', 75, 1, 'casket', 'A whaling ship etched by a patient hand.'),
    K('sextant', 'Brass Sextant', 1, 'relics', 110, 1, 'casket', 'Still true to a hair. Navigators pay well.'),
    K('indigo', 'Indigo Dye', 1, 'cloth', 60, 1, 'sack', 'Cakes of the deepest blue money can buy.'),
    // rare
    K('doubloons', 'Gold Doubloons', 2, 'coin', 220, 1, 'casket', 'Heavy Spanish gold, warm in the hand.'),
    K('pearls', 'Pearl Strand', 2, 'jewellery', 260, 1, 'casket', 'Forty matched pearls on a silk cord.'),
    K('emeralds', 'Raw Emeralds', 2, 'gems', 300, 1, 'casket', 'Green fire straight out of the rock.'),
    K('dagger', 'Jewelled Dagger', 2, 'relics', 240, 1, 'casket', 'Too pretty to stab anyone with. Probably.'),
    K('portrait', 'Portrait of a Duchess', 2, 'art', 320, 2, 'painting', 'She looks unimpressed with your table manners.'),
    K('saffron', 'Jar of Saffron', 2, 'provisions', 180, 1, 'casket', 'Worth more than its weight in gold.'),
    // epic
    K('ruby', "Sultan's Ruby", 3, 'gems', 650, 1, 'casket', 'Big as a quail egg and red as a sunset.'),
    K('tiara', 'Sapphire Tiara', 3, 'jewellery', 720, 1, 'casket', 'Made for a princess who never got it.'),
    K('chalice', 'Golden Chalice', 3, 'relics', 560, 1, 'idol', 'Choose wisely. This one is the real one.'),
    K('seascape', 'Storm over Tortuga', 3, 'art', 880, 2, 'painting', 'An old master caught the squall just so.'),
    K('astrolabe', 'Gilded Astrolabe', 3, 'relics', 600, 1, 'casket', 'Maps the stars of a sky long gone.'),
    // legendary
    K('crown', 'Crown of the Drowned King', 4, 'jewellery', 2400, 1, 'casket', 'Still wet. Still waiting for its king.'),
    K('idol', 'Golden Idol', 4, 'relics', 2000, 2, 'idol', 'Solid gold, and very much cursed. Probably.'),
    K('krakenPearl', "Kraken's Pearl", 4, 'gems', 3200, 1, 'casket', 'It hums when the sea is angry.'),
    K('mask', 'Mask of El Dorado', 4, 'relics', 2800, 1, 'idol', 'The sun itself, beaten into a face.'),
    // ------------------------------------------------ the second manifest
    // common
    K('hardtack', "Ship's Biscuit", 0, 'provisions', 10, 1, 'crate', 'Hard enough to break a tooth. Knock out the weevils first.'),
    K('oranges', 'Crate of Oranges', 0, 'provisions', 19, 1, 'crate', 'Sunshine in a crate, and no scurvy aboard this month.'),
    K('saltfish', 'Salted Cod', 0, 'provisions', 13, 1, 'crate', 'Stiff as a board and twice as salty.'),
    K('coconuts', 'Green Coconuts', 0, 'provisions', 11, 1, 'sack', 'Sweet water inside, if you have a cutlass handy.'),
    K('rope', 'Coil of Hemp Rope', 0, 'cloth', 17, 1, 'crate', 'Forty fathoms of good tarred line. Every bosun wants it.'),
    K('cider', 'Jug of Cider', 0, 'spirits', 21, 1, 'barrel', 'Cloudy, sharp and pressed from orchard apples a world away.'),
    K('cowries', 'Cowrie Shells', 0, 'coin', 15, 1, 'sack', 'Glossy little shells that buy a meal on half the coasts out there.'),
    K('tankard', 'Pewter Tankard', 0, 'relics', 16, 1, 'crate', 'Dented from a hundred tavern brawls. Holds a full pint still.'),
    // uncommon
    K('tea', 'Lacquered Tea Caddy', 1, 'provisions', 80, 1, 'crate', 'Smoky black leaf in a red tin painted with cranes.'),
    K('cacao', 'Cacao Pods', 1, 'provisions', 65, 1, 'sack', 'Grind the beans with sugar and you have something divine.'),
    K('brandy', 'Decanter of Brandy', 1, 'spirits', 105, 1, 'crate', 'Cut crystal and old amber fire. Pour it slowly.'),
    K('lace', 'Corália Lace', 1, 'cloth', 92, 1, 'crate', 'Bobbin lace so fine the nuns of Sainte-Corália went blind making it.'),
    K('spyglass', 'Brass Spyglass', 1, 'relics', 120, 1, 'casket', 'Spots a sail before she spots you.'),
    K('coral', 'Red Coral Branch', 1, 'gems', 100, 1, 'casket', 'Blood-red coral from the deep reefs, polished to a gleam.'),
    K('pipe', 'Meerschaum Pipe', 1, 'art', 85, 1, 'casket', 'Its bowl is carved as a bearded old sea captain. He disapproves.'),
    // rare
    K('reserve', "Ronvliet Reserve, 1702", 2, 'spirits', 210, 1, 'crate', 'The distillery\'s finest year, dusty and wax-sealed. Drink it and weep.'),
    K('ingots', 'Silver Ingots', 2, 'coin', 250, 2, 'casket', 'Stamped bars from the mint at Aguadouro. Heavy as sin.'),
    K('jade', 'Jade Dragon', 2, 'art', 290, 1, 'idol', 'A coiled dragon carved from a single green stone.'),
    K('cameo', 'Cameo Brooch', 2, 'jewellery', 235, 1, 'casket', 'A lady in ivory profile on sardonyx, ringed with seed pearls.'),
    K('musicBox', 'Gilded Music Box', 2, 'art', 260, 1, 'casket', 'Wind it and a tiny ship sails round, playing a sailor\'s waltz.'),
    K('chronometer', 'Marine Chronometer', 2, 'relics', 340, 1, 'casket', 'Keeps true time at sea, so you always know your longitude.'),
    // epic
    K('diamond', 'Heart of Aguadouro', 3, 'gems', 820, 1, 'casket', 'A blue-white diamond the bankers swore was never stolen.'),
    K('globe', 'Celestial Globe', 3, 'relics', 640, 2, 'idol', 'Every star and constellation in gold on a sphere of night.'),
    K('helm', "Conquistador's Helm", 3, 'relics', 580, 2, 'idol', 'A crested steel morion with gold filigree, and a dent with a story.'),
    K('egg', 'Jewelled Egg', 3, 'jewellery', 760, 1, 'casket', 'Open it and a little golden swan unfolds its wings.'),
    K('carpet', "Sultan's Silk Carpet", 3, 'cloth', 620, 2, 'crate', 'Ten thousand knots to the hand. They say it once flew.'),
    // legendary
    K('trident', 'Trident of the Deep', 4, 'relics', 3000, 2, 'idol', 'Raise it and the waves bow. Or so the drowned sailors said.'),
    K('bottleShip', 'Golden Galleon in a Bottle', 4, 'art', 2600, 1, 'casket', 'A perfect galleon of solid gold. Some say she was full size once.'),
    K('sceptre', 'Sceptre of Sainte-Corália', 4, 'jewellery', 2500, 1, 'casket', 'The lost sceptre of the island queens, with a sapphire the size of a fist.'),
    K('sunstone', 'Sunstone of the Lost Fleet', 4, 'gems', 3100, 1, 'casket', 'It finds the sun through the thickest storm. The fleet that lost it never came home.'),
    // trophies: only the Kraken gives these up
    K('krakenInk', 'Vial of Kraken Ink', 3, 'relics', 950, 1, 'casket', 'Black as the deep. At night it writes by itself.'),
    K('krakenBeak', 'Beak of the Kraken', 4, 'relics', 3800, 2, 'idol', 'Sharp enough to bite through a keel. It has.'),
  ].map((k) => [k.id, k]),
) as Record<LootId, LootKind>;

export const LOOT_IDS = Object.keys(LOOT) as LootId[];
/** Trophies no chest or wreck ever rolls: you have to slay the Kraken for them. */
export const TROPHIES = new Set<LootId>(['krakenInk', 'krakenBeak']);
const BY_RARITY: LootId[][] = [0, 1, 2, 3, 4].map((r) => LOOT_IDS.filter((id) => LOOT[id].rarity === r && !TROPHIES.has(id)));

/** One good of the given rarity, cheaper ones a little more often. */
export function rollGood(r: Rarity, rnd = Math.random): LootId {
  const pool = BY_RARITY[r];
  let sum = 0;
  for (const id of pool) sum += 1 / Math.sqrt(LOOT[id].price);
  let x = rnd() * sum;
  for (const id of pool) {
    x -= 1 / Math.sqrt(LOOT[id].price);
    if (x <= 0) return id;
  }
  return pool[pool.length - 1];
}

/**
 * What a floating container holds. Its tier (0 barrel .. 4 legendary chest)
 * is its best good's rarity; the rest are a mixed lot a step or two below.
 */
export function rollContents(tier: Rarity, rnd = Math.random): LootId[] {
  const out: LootId[] = [rollGood(tier, rnd)];
  const extra = [rnd() < 0.3 ? 1 : 0, 1, 1 + (rnd() < 0.5 ? 1 : 0), 2, 2 + (rnd() < 0.5 ? 1 : 0)][tier];
  for (let i = 0; i < extra; i++) {
    const drop = rnd() < 0.6 ? 1 : 2;
    out.push(rollGood(Math.max(0, tier - drop) as Rarity, rnd));
  }
  return out;
}

// ------------------------------------------------------------------ the hold

export interface Stack {
  id: LootId;
  n: number;
}

export interface Stowed {
  /** Goods that made it into the hold. */
  kept: LootId[];
  /** Goods left floating for want of room. */
  left: LootId[];
  /** Cheaper goods tossed overboard to make room. */
  tossed: LootId[];
}

/** The ship's hold: limited room, so the finest goods push the humble ones overboard. */
export class Hold {
  private stacks = new Map<LootId, number>();
  onChange: () => void = () => {};

  constructor(public capacity: number) {}

  get used() {
    let u = 0;
    for (const [id, n] of this.stacks) u += LOOT[id].size * n;
    return u;
  }

  get count() {
    let c = 0;
    for (const n of this.stacks.values()) c += n;
    return c;
  }

  /** Fair value of everything aboard. */
  get worth() {
    let w = 0;
    for (const [id, n] of this.stacks) w += LOOT[id].price * n;
    return w;
  }

  /** Stacks, finest first. */
  list(): Stack[] {
    return [...this.stacks].map(([id, n]) => ({ id, n })).sort((a, b) => LOOT[b.id].price - LOOT[a.id].price || a.id.localeCompare(b.id));
  }

  has(id: LootId) {
    return this.stacks.get(id) ?? 0;
  }

  /** Stows goods, best first; if the hold is full the cheapest cargo per unit of room goes over the side. */
  stow(goods: LootId[]): Stowed {
    const res: Stowed = { kept: [], left: [], tossed: [] };
    const sorted = goods.slice().sort((a, b) => LOOT[b].price / LOOT[b].size - LOOT[a].price / LOOT[a].size);
    for (const id of sorted) {
      const k = LOOT[id];
      const density = k.price / k.size;
      // make room by tossing goods worth less per unit of room
      while (this.used + k.size > this.capacity) {
        let worst: LootId | null = null;
        let wd = Infinity;
        for (const sid of this.stacks.keys()) {
          const d = LOOT[sid].price / LOOT[sid].size;
          if (d < wd) {
            wd = d;
            worst = sid;
          }
        }
        if (!worst || wd >= density) break;
        this.take(worst, 1, false);
        res.tossed.push(worst);
      }
      if (this.used + k.size > this.capacity) {
        res.left.push(id);
        continue;
      }
      this.stacks.set(id, (this.stacks.get(id) ?? 0) + 1);
      res.kept.push(id);
    }
    this.onChange();
    return res;
  }

  /** Whether stowing these would keep at least one (tossing cheaper cargo if need be). */
  wouldKeep(goods: LootId[]) {
    const trial = new Hold(this.capacity);
    for (const [id, n] of this.stacks) trial.stacks.set(id, n);
    return trial.stow(goods).kept.length > 0;
  }

  take(id: LootId, n: number, notify = true) {
    const have = this.stacks.get(id) ?? 0;
    const k = Math.min(have, n);
    if (have - k <= 0) this.stacks.delete(id);
    else this.stacks.set(id, have - k);
    if (notify) this.onChange();
    return k;
  }

  clear() {
    this.stacks.clear();
    this.onChange();
  }
}

/** How much a hull of each class can carry, in units of room. */
export const HOLD_ROOM: Record<string, number> = { sloop: 10, brig: 16, galleon: 26 };

// ------------------------------------------------------------------ markets

export interface MarketTaste {
  /** What the port pays, per category, against the fair price. */
  mult: Partial<Record<Category, number>>;
  /** A line for the market's header. */
  tagline: string;
}

/** A trading port's market: its tastes, plus prices that drift a little with the days. */
export class Market {
  private phase: Record<LootId, number>;

  constructor(readonly taste: MarketTaste, seed: number) {
    let s = seed * 9301 + 49297;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    this.phase = Object.fromEntries(LOOT_IDS.map((id) => [id, rnd() * Math.PI * 2])) as Record<LootId, number>;
  }

  /** Price per item right now (game time in seconds). */
  price(id: LootId, t: number) {
    const k = LOOT[id];
    const p = this.phase[id];
    // a slow drift over a few minutes plus a gentle day-to-day wobble
    const drift = 1 + 0.09 * Math.sin(t / 140 + p) + 0.04 * Math.sin(t / 37 + p * 2.3);
    return Math.max(1, Math.round(k.price * (this.taste.mult[k.cat] ?? 1) * drift));
  }

  /** Price against the fair price, -1..1 (0 = fair). */
  trend(id: LootId, t: number) {
    return this.price(id, t) / LOOT[id].price - 1;
  }
}
