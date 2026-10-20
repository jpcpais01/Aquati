import './wreck.css';
import { RARITY } from '../game/loot';
import { SHIP_CLASSES, ShipClassId } from '../ships/shipTypes';
import { crest, icon, ICONS } from './art';
import { progressSaved } from '../core/progress';

// "Lost to the Depths": the farewell when your ship goes down. A letterboxed
// caption while the camera follows her under, then the voyage laid out over the
// drowned sea: your renown and rank, the tally (with records), the ship's log,
// and the way back up. No backdrop blur anywhere: the sea under it is already
// blurred by the underwater grade, for free.

export interface VoyageEvent {
  t: number;
  kind: 'kill' | 'chest' | 'isle' | 'trade' | 'bounty' | 'ghost' | 'fleet' | 'fort';
  text: string;
  detail: string;
}

export interface WreckReport {
  ship: string;
  cls: ShipClassId;
  time: number;
  gold: number;
  kills: number;
  isles: number;
  islesTotal: number;
  shots: number;
  hits: number;
  dealt: number;
  chests: number;
  /** Best chest rarity opened (-1 none). */
  best: number;
  miles: number;
  cause: 'shot' | 'rammed' | 'aground' | 'kraken' | 'fort' | 'reef' | 'maelstrom';
  killer?: string;
  killerCls?: ShipClassId;
  /** The named captain who sent her down, if a hunter did. */
  hunter?: string;
  /** Named captains sunk this voyage. */
  bounties?: number;
  /** "off Isla Verde", or null in open water. */
  where: string | null;
  events: VoyageEvent[];
}

export interface Records {
  voyages: number;
  renown: number;
  gold: number;
  kills: number;
  isles: number;
  time: number;
}

export const RECORDS_KEY = 'aquati.records';

const RANKS: [number, string, string][] = [
  [0, 'Bilge Rat', 'Swabbed more decks than foes.'],
  [150, 'Powder Monkey', 'Kept the guns fed, mostly.'],
  [400, 'Deckhand', 'Found your sea legs.'],
  [800, 'Buccaneer', 'The taverns know your name.'],
  [1400, 'Corsair', 'Merchants trim their sails at your flag.'],
  [2200, 'Sea Wolf', 'Pirates count their guns when you appear.'],
  [3300, 'Dread Captain', 'Mothers warn their children of you.'],
  [4800, 'Terror of the Isles', 'Whole flotillas turn tail.'],
  [7000, 'Legend of the Archipelago', 'They will sing of this voyage.'],
];

const $ = (id: string) => document.getElementById(id)!;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const clock = (t: number) => `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, '0')}`;

function duration(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  if (m === 0) return s < 5 ? 'mere moments' : `${s} seconds`;
  return `${m} minute${m === 1 ? '' : 's'}${s ? ` ${s}s` : ''}`;
}

export const renown = (r: WreckReport) => Math.round(r.gold + r.kills * 120 + r.isles * 90 + r.time / 5);

function rankOf(score: number) {
  let i = 0;
  while (i + 1 < RANKS.length && score >= RANKS[i + 1][0]) i++;
  return i;
}

export function loadRecords(): Records {
  try {
    const r = JSON.parse(localStorage.getItem(RECORDS_KEY) || 'null');
    if (r && typeof r === 'object') return { voyages: 0, renown: 0, gold: 0, kills: 0, isles: 0, time: 0, ...r };
  } catch {
    /* private mode or junk: start fresh */
  }
  return { voyages: 0, renown: 0, gold: 0, kills: 0, isles: 0, time: 0 };
}

function causeLine(r: WreckReport) {
  const k = r.hunter && r.killer ? `${esc(r.hunter)} in the <span class="nm">${esc(r.killer)}</span>` : r.killer ? `the <span class="nm">${esc(r.killer)}</span>` : 'pirates';
  if (r.cause === 'aground') return 'Holed on the reef';
  if (r.cause === 'reef') return `Torn open on the coral of <span class="nm">${esc(r.killer ?? 'the reef')}</span>`;
  if (r.cause === 'maelstrom') return `Swallowed by <span class="nm">${esc(r.killer ?? 'the maelstrom')}</span>`;
  if (r.cause === 'kraken') return 'Dragged under by <span class="nm">the Kraken</span>';
  if (r.cause === 'fort') return `Sunk by the guns of <span class="nm">${esc(r.killer ?? 'a fort')}</span>`;
  if (r.cause === 'rammed') return `Rammed by ${k}`;
  return `Sunk by ${k}`;
}

/** The parting words: the most fitting line for how the voyage went, a little at random. */
function quip(r: WreckReport) {
  const fits: string[] = [];
  const mine = SHIP_CLASSES[r.cls].name.toLowerCase();
  if (r.time < 90) fits.push('Barely out of the harbour. The gulls will talk about this one.');
  if (r.kills === 0 && r.time >= 90) fits.push('Not a single prize taken. The sea keeps no score, but the tavern does.');
  if (r.kills >= 5) fits.push(`${r.kills} ships went to the bottom before her. Davy Jones owes you a drink.`);
  if (r.gold >= 1500) fits.push('Her hold went down heavy with gold. Some lucky diver will thank you.');
  if (r.isles >= r.islesTotal) fits.push('Every isle charted. Your maps will outlive your ship.');
  if (r.best >= 4) fits.push('A legendary chest, and now the sea has it back.');
  if (r.cause === 'aground') fits.push("The reef doesn't care how fast you were sailing.");
  if (r.cause === 'rammed') fits.push('Close quarters. Very close quarters.');
  if (r.cause === 'reef') {
    fits.push('The breakers were telling you. Coral never shouts twice.', 'A sloop would have floated over it. Just saying.');
    if (r.cls === 'galleon') fits.push('Two and a half fathoms of keel over one fathom of coral. The arithmetic was always going to win.');
  }
  if (r.cause === 'maelstrom') {
    fits.length = 0;
    fits.push(
      'Round and round and down. The sea keeps what it takes.',
      'Sail with the wind, the old hands say. Out, never across.',
      'The whirlpool turns on without you, patient as ever.',
    );
  }
  if (r.cause === 'fort') fits.push('Never trade broadsides with a stone wall. It has all day.', 'The fort is still standing. The fort is always still standing.');
  if (r.cause === 'kraken') {
    fits.length = 0;
    fits.push(
      'The old sailors were right. Something lives down there.',
      'Eight arms, one ship. The sums were never in your favour.',
      'The Kraken sleeps again, and your ship sleeps with it.',
    );
  }
  if (r.killerCls === 'galleon' && r.cls === 'sloop') fits.push('A sloop against a galleon. Brave. Briefly.');
  if (r.killerCls === 'sloop' && r.cls === 'galleon') fits.push(`Brought down by a sloop. Nobody needs to know, ${mine} captain.`);
  if (r.hunter) fits.push(`${r.hunter} will dine out on this for a year. Your poster comes down; theirs stays up.`);
  if ((r.bounties ?? 0) >= 2) fits.push(`${r.bounties} of the Brethren's named captains went down before you did. The Crown will miss you.`);
  else if (r.bounties === 1) fits.push('One named captain sunk. A poster on the wall, stamped in red, with your name on the claim.');
  if (r.shots > 20 && r.hits / Math.max(1, r.shots) < 0.15) fits.push('The gunners swear the sea moved.');
  if (!fits.length) {
    fits.push(
      'Dead men tell no tales.',
      'The sea gives, and the sea takes.',
      'Fair winds, captain. Wherever she rests.',
      'Every captain goes down with a story. This was yours.',
      'She fought to the last plank.',
    );
  }
  return fits[(Math.random() * fits.length) | 0];
}

const KIND_ICON: Record<VoyageEvent['kind'], string> = { kill: 'skull', chest: 'coin', isle: 'isle', trade: 'coin', bounty: 'skull', ghost: 'skull', fleet: 'isle', fort: 'isle' };

export class WreckScreen {
  private cine = $('cine');
  private dead = $('dead');
  private raf = 0;
  private armedAt = 0;
  onRetry: () => void = () => {};
  onAgain: () => void = () => {};
  onSkip: () => void = () => {};
  onTally: (i: number, best: boolean) => void = () => {};

  constructor() {
    const bubbles = $('wk-bubbles');
    for (let i = 0; i < 16; i++) {
      const b = document.createElement('i');
      const s = 3 + Math.random() * 9;
      b.style.cssText = `left:${(Math.random() * 100).toFixed(1)}%;width:${s.toFixed(1)}px;height:${s.toFixed(1)}px;--d:${(5 + Math.random() * 7).toFixed(2)}s;--w:${(Math.random() * 2 - 1).toFixed(2)};animation-delay:-${(Math.random() * 10).toFixed(2)}s`;
      bubbles.appendChild(b);
    }
    $('wk-crest').innerHTML = crest();
    const skip = (e: Event) => {
      if (this.cine.classList.contains('hidden') || !this.dead.classList.contains('hidden')) return;
      e.preventDefault();
      this.cine.classList.add('skipped');
      this.onSkip();
    };
    this.cine.addEventListener('pointerdown', skip);
    const act = (fn: () => void) => () => {
      if (performance.now() < this.armedAt) return;
      fn();
    };
    $('btn-retry').addEventListener('click', act(() => this.onRetry()));
    $('btn-again').addEventListener('click', act(() => this.onAgain()));
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (!this.dead.classList.contains('hidden')) {
        if (performance.now() < this.armedAt) return;
        const k = e.key;
        if (k === 'Enter' && !(document.activeElement instanceof HTMLButtonElement)) {
          e.preventDefault();
          this.onRetry();
        } else if (k === 'Escape' || k.toLowerCase() === 'h') {
          e.preventDefault();
          this.onAgain();
        }
      } else if (!this.cine.classList.contains('hidden') && (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape')) skip(e);
    });
  }

  /** The moment she's lost: letterbox the view and caption it. */
  begin(r: WreckReport) {
    const c = SHIP_CLASSES[r.cls];
    $('cine-name').textContent = r.ship;
    $('cine-cls').textContent = c.name;
    $('cine-cause').innerHTML = causeLine(r);
    this.cine.classList.remove('hidden', 'skipped', 'out');
    void this.cine.offsetWidth;
    this.cine.classList.add('on');
  }

  end() {
    cancelAnimationFrame(this.raf);
    this.cine.classList.add('hidden');
    this.cine.classList.remove('on', 'out');
    this.dead.classList.add('hidden');
  }

  /** The farewell card over the drowned sea. */
  show(r: WreckReport) {
    this.cine.classList.add('out');
    const recs = loadRecords();
    const score = renown(r);
    const first = recs.voyages === 0;
    const beat = (v: number, best: number) => !first && v > best && v > 0;
    const best = {
      renown: beat(score, recs.renown),
      gold: beat(r.gold, recs.gold),
      kills: beat(r.kills, recs.kills),
      isles: beat(r.isles, recs.isles),
      time: beat(r.time, recs.time),
    };
    try {
      localStorage.setItem(
        RECORDS_KEY,
        JSON.stringify({
          voyages: recs.voyages + 1,
          renown: Math.max(recs.renown, score),
          gold: Math.max(recs.gold, r.gold),
          kills: Math.max(recs.kills, r.kills),
          isles: Math.max(recs.isles, r.isles),
          time: Math.max(recs.time, r.time),
        }),
      );
      progressSaved();
    } catch {
      /* private mode: no records kept */
    }

    // title: each letter sinks into place
    $('wk-title').innerHTML = 'Lost to the Depths'
      .split(' ')
      .map((w, wi) => `<span class="w">${[...w].map((ch, i) => `<span style="--i:${wi * 4 + i}">${ch}</span>`).join('')}</span>`)
      .join(' ');
    const where = r.where ? esc(r.where) : 'in open water';
    $('wk-epitaph').innerHTML =
      r.cause === 'aground'
        ? `The <span class="nm">${esc(r.ship)}</span> ran aground ${where} after ${duration(r.time)} at sea.`
        : r.cause === 'kraken'
        ? `The <span class="nm">${esc(r.ship)}</span> was pulled into the deep ${where} after ${duration(r.time)} at sea.`
        : r.cause === 'maelstrom'
        ? `The <span class="nm">${esc(r.ship)}</span> was drawn down the maelstrom's throat after ${duration(r.time)} at sea.`
        : r.cause === 'reef'
        ? `The <span class="nm">${esc(r.ship)}</span> struck the coral and broke her back after ${duration(r.time)} at sea.`
        : `The <span class="nm">${esc(r.ship)}</span> went down ${where} after ${duration(r.time)} at sea.`;
    $('wk-quip').textContent = `“${quip(r)}”`;
    $('wk-cause').innerHTML = causeLine(r);

    // renown & rank
    const ri = rankOf(score);
    const [lo, name, line] = RANKS[ri];
    const next = RANKS[ri + 1];
    const prog = next ? (score - lo) / (next[0] - lo) : 1;
    $('wk-rank-name').textContent = name;
    $('wk-rank-line').textContent = line;
    $('wk-rank-next').innerHTML = next ? `<b>${(next[0] - score).toLocaleString()}</b> renown to ${next[1]}` : 'The highest rank on these seas';
    const medal = $('wk-medal');
    medal.style.setProperty('--p', prog.toFixed(3));
    medal.classList.toggle('best', best.renown);
    $('wk-score').textContent = '0';
    $('wk-score-best').classList.toggle('hidden', !best.renown);

    // the tally
    const tile = (i: number, cls: string, label: string, tag: boolean) =>
      `<div class="wk-tile${tag ? ' best' : ''}" style="--i:${i}"><span class="${cls}"></span><b data-n="${i}">0</b><small>${label}</small>${tag ? '<em>New best</em>' : ''}</div>`;
    $('wk-tiles').innerHTML =
      tile(0, 'clock', 'At sea', best.time) + tile(1, 'coin', 'Gold', best.gold) + tile(2, 'skull', 'Sunk', best.kills) + tile(3, 'isle', `Isles of ${r.islesTotal}`, best.isles);
    const rate = r.shots ? Math.min(100, Math.round((r.hits / r.shots) * 100)) : 0;
    const minor = (i: number, ic: keyof typeof ICONS, label: string, v: string, sub: string) =>
      `<div class="wk-minor-row" style="--i:${i}">${icon(ICONS[ic])}<span>${label}</span><b>${v}</b><small>${sub}</small></div>`;
    const chest = r.best >= 1 ? RARITY[r.best] : null;
    $('wk-minor').innerHTML =
      minor(0, 'target', 'Accuracy', r.shots ? `${rate}%` : '–', r.shots ? `${r.hits} of ${r.shots} shots` : 'no shots fired') +
      minor(1, 'cannon', 'Damage dealt', r.dealt.toLocaleString(), r.kills ? `${Math.round(r.dealt / r.kills).toLocaleString()} per prize` : 'hull points') +
      minor(2, 'anchor', 'Treasure', `${r.chests}`, chest ? `best: <i style="color:${chest.css}">${chest.name}</i>` : 'chests opened') +
      minor(3, 'wind', 'Sailed', `${r.miles.toFixed(1)}`, 'sea miles');

    // the ship's log: the last few things worth writing down, and the end
    const ev = r.events.slice(-5);
    const rows = ev.map(
      (e, i) =>
        `<li style="--i:${i}" class="k-${e.kind}"><time>${clock(e.t)}</time><span class="${KIND_ICON[e.kind]}"></span><div><b>${esc(e.text)}</b><small>${esc(e.detail)}</small></div></li>`,
    );
    if (!ev.length) rows.push(`<li class="quiet" style="--i:0"><div><small>A quiet voyage. Nothing worth writing down.</small></div></li>`);
    rows.push(`<li class="k-lost" style="--i:${ev.length + 1}"><time>${clock(r.time)}</time><span class="skull"></span><div><b>Lost with all hands</b><small>${causeLine(r)}</small></div></li>`);
    $('wk-log').innerHTML = rows.join('');
    $('wk-log-more').textContent = r.events.length > ev.length ? `${r.events.length - ev.length} earlier entries` : '';

    this.dead.classList.remove('hidden');
    // replay the entrance
    this.dead.classList.remove('go');
    void this.dead.offsetWidth;
    this.dead.classList.add('go');
    // a moment's grace so a tap that skipped the cinematic can't press a button
    this.armedAt = performance.now() + 900;
    this.countUp(r, score, best);
  }

  /** Numbers roll up one after another, each landing with a soft note. */
  private countUp(r: WreckReport, score: number, best: { gold: boolean; kills: boolean; isles: boolean; time: boolean; renown: boolean }) {
    cancelAnimationFrame(this.raf);
    const els = [...this.dead.querySelectorAll<HTMLElement>('.wk-tile b')];
    const scoreEl = $('wk-score');
    const t0 = performance.now() + 700;
    const vals = [r.time, r.gold, r.kills, r.isles];
    const flags = [best.time, best.gold, best.kills, best.isles];
    const fmt = (i: number, v: number) => (i === 0 ? clock(v) : Math.round(v).toLocaleString());
    const landed = new Set<number>();
    const ease = (x: number) => 1 - Math.pow(1 - x, 3);
    const step = () => {
      const now = performance.now();
      let busy = false;
      els.forEach((el, i) => {
        const k = Math.min(1, Math.max(0, (now - t0 - i * 260) / 900));
        if (k < 1) busy = true;
        el.textContent = fmt(i, vals[i] * ease(k));
        if (k >= 1 && !landed.has(i)) {
          landed.add(i);
          el.parentElement!.classList.add('landed');
          this.onTally(i, flags[i]);
        }
      });
      const ks = Math.min(1, Math.max(0, (now - t0 - 300) / 2000));
      if (ks < 1) busy = true;
      scoreEl.textContent = Math.round(score * ease(ks)).toLocaleString();
      if (ks >= 1 && !landed.has(9)) {
        landed.add(9);
        $('wk-medal').classList.add('landed');
        this.onTally(5, best.renown);
      }
      if (busy) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
}
