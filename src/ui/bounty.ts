import './bounty.css';
import { SHIP_CLASSES } from '../ships/shipTypes';
import { CAPTAINS, Face, Ledger, NamedCaptain, REPUTE, REPUTE_BONUS, reputeRank, wantedProgress, WANTED_AT } from '../game/bounty';
import { replay } from './replay';

// The bounty side of the HUD and harbour: the Brethren's wanted posters
// (engraved portraits drawn here as SVG), the Wanted Board that collects them,
// the voyage's wanted meter, the pointer to whoever is hunting you, and the
// banners for a hunter setting out and a bounty claimed.

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

// ------------------------------------------------------------------ portraits

const INK = '#2b1a0d';
const HAIR = '#6a472a';
const SKIN = '#efd9ae';
const SKIN2 = '#d3b17f';
const COAT = '#3b2717';
let uid = 0;

const BROWS: Record<number, [string, string]> = {
  0: ['M39 50.5 L46 51', 'M54 51 L61 50.5'],
  1: ['M38.5 48.6 L46 52', 'M54 52 L61.5 48.6'],
  [-1]: ['M38.5 51 Q42.5 47.6 46 50.4', 'M54 50.4 Q57.5 47.6 61.5 51'],
};
const MOUTHS: Record<number, string> = {
  0: 'M45 70 Q50 70.8 55 70',
  1: 'M45 70.2 Q51 71.8 56 68.4',
  [-1]: 'M44.5 71 Q50 68.2 55.5 71',
};

/** An engraved bust in the style of a printed notice. `unknown` draws a shadowed silhouette. */
export function portrait(f: Face, unknown = false): string {
  const n = ++uid;
  const hatch = `ph${n}`;
  const dots = `pd${n}`;
  const p: string[] = [];
  const defs = `<defs>
    <pattern id="${hatch}" width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><path d="M0 0V2.2" stroke="${INK}" stroke-width=".75" opacity=".6"/></pattern>
    <pattern id="${dots}" width="1.8" height="1.8" patternUnits="userSpaceOnUse"><circle cx=".9" cy=".9" r=".42" fill="${INK}" opacity=".55"/></pattern>
  </defs>`;
  if (unknown) {
    const sil = '#3a2a1b';
    return `<svg viewBox="0 0 100 110" aria-hidden="true">${defs}
      <path d="M6 110C10 94 24 88 38 86h24c14 2 28 8 32 24z" fill="${sil}"/>
      <path d="M43 72v16h14V72z" fill="${sil}"/>
      <ellipse cx="50" cy="56" rx="17" ry="21" fill="${sil}"/>
      <path d="M18 42c12 4 22-12 32-12s20 16 32 12c-6-8-16-20-32-20S24 34 18 42z" fill="${sil}"/>
      <text x="50" y="66" text-anchor="middle" font-family="Cinzel, Georgia, serif" font-weight="700" font-size="22" fill="#d9c08c" opacity=".85">?</text>
    </svg>`;
  }
  // hair behind the head
  if (f.hair === 'long') p.push(`<path d="M31.5 52C28 72 31 92 24 106h52c-7-14-4-34-7.5-54z" fill="${HAIR}"/><path d="M33 60c-1 16 0 30-5 42M67 60c1 16 0 30 5 42" stroke="${INK}" stroke-width=".6" opacity=".5" fill="none"/>`);
  if (f.hair === 'braids')
    p.push(
      `<path d="M33 58q-4 22 0 42M67 58q4 22 0 42" stroke="${HAIR}" stroke-width="7" stroke-linecap="round" fill="none"/><path d="M30 66l6 3M30 74l6 3M30 82l6 3M30 90l6 3M64 69l6-3M64 77l6-3M64 85l6-3M64 93l6-3" stroke="${INK}" stroke-width=".7" opacity=".55"/><circle cx="33" cy="101" r="2" fill="#a8322a"/><circle cx="67" cy="101" r="2" fill="#a8322a"/>`,
    );
  if (f.hair === 'curls') for (const [x, y] of [[32, 50], [30, 60], [31.5, 70], [68, 50], [70, 60], [68.5, 70], [36, 41], [64, 41]]) p.push(`<circle cx="${x}" cy="${y}" r="6" fill="${HAIR}"/><circle cx="${x}" cy="${y}" r="6" fill="url(#${hatch})" opacity=".35"/>`);
  if (f.hair === 'tied') p.push(`<path d="M64 62q11 9 7 30" stroke="${HAIR}" stroke-width="6.5" stroke-linecap="round" fill="none"/><path d="M64.5 64l4-1" stroke="#a8322a" stroke-width="2.2"/>`);
  // coat, lapels, shirt
  p.push(
    `<path d="M6 110C10 94 24 88 38 86h24c14 2 28 8 32 24z" fill="${COAT}"/>`,
    `<path d="M62 88c12 2 24 8 28 22H66z" fill="url(#${hatch})"/>`,
    `<path d="M38 86l12 18 12-18h-5l-7 10-7-10z" fill="#7a5232"/>`,
    `<path d="M43 86l7 10 7-10z" fill="#e8d6ac"/>`,
    `<circle cx="50" cy="103" r="1.2" fill="#c9962e"/><circle cx="50" cy="108" r="1.2" fill="#c9962e"/>`,
    `<path d="M43 72v16h14V72z" fill="${SKIN2}"/>`,
    `<ellipse cx="33" cy="58" rx="3.3" ry="5" fill="${SKIN2}"/><ellipse cx="67" cy="58" rx="3.3" ry="5" fill="${SKIN2}"/>`,
    `<ellipse cx="50" cy="56" rx="17" ry="21" fill="${SKIN}" stroke="${INK}" stroke-width=".7"/>`,
    // the shadow side, hatched like an engraving
    `<path d="M50 35c12 0 17 11 17 21 0 14-7 21-17 21 8-7 10-17 8-29-1-6-4-11-8-13z" fill="url(#${hatch})"/>`,
  );
  // fringe over the forehead
  if (f.hair !== 'bald' && f.hat !== 'hood') p.push(`<path d="M33 50c1-14 11-18 17-18 8 0 17 5 17 18-5-8-11-10-17-10s-12 3-17 10z" fill="${HAIR}"/>`);
  if (f.hair === 'bald') p.push(`<path d="M41 39q6-3 12-1" stroke="#fff6e0" stroke-width="1.6" stroke-linecap="round" opacity=".7" fill="none"/>`);
  // the face
  const [bl, br] = BROWS[f.brow] ?? BROWS[0];
  p.push(
    `<path d="${bl}" stroke="${INK}" stroke-width="1.9" stroke-linecap="round"/><path d="${br}" stroke="${INK}" stroke-width="1.9" stroke-linecap="round"/>`,
    `<ellipse cx="42.5" cy="55.4" rx="2.5" ry="1.35" fill="${INK}"/><ellipse cx="57.5" cy="55.4" rx="2.5" ry="1.35" fill="${INK}"/>`,
    `<circle cx="43.3" cy="55" r=".45" fill="#fff4dc"/><circle cx="58.3" cy="55" r=".45" fill="#fff4dc"/>`,
    `<path d="M50 55.5l-2.6 8.6q2.6 1.6 5.2 0" stroke="${INK}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  );
  // beards
  const b = f.beard;
  if (b === 'stubble') p.push(`<path d="M34 60c1 14 8 19 16 19s15-5 16-19c-3 10-9 13-16 13s-13-3-16-13z" fill="url(#${dots})"/>`);
  if (b === 'full') p.push(`<path d="M33 57c0 22 9 33 17 35 8-2 17-13 17-35-3 10-9 14-17 14s-14-4-17-14z" fill="${HAIR}"/><path d="M51 70c6 0 10 6 9 14" stroke="${INK}" stroke-width=".6" opacity=".5" fill="none"/>`);
  if (b === 'goatee') p.push(`<path d="M46.5 72.5q3.5 10 7 0-3.5 1.6-7 0z" fill="${HAIR}"/>`);
  if (b === 'forked') p.push(`<path d="M37.5 64c2 14 6 22 9.5 30l3-10 3 10c3.5-8 7.5-16 9.5-30-4 6-8 8-12.5 8s-8.5-2-12.5-8z" fill="${HAIR}"/>`);
  if (b === 'mutton') p.push(`<path d="M33.5 50c-1 13 2 20 10 19.5q6.5-3.5 13 0c8 .5 11-6.5 10-19.5h-3c-.5 9-3 12.5-7.5 12.5q-6-2.5-12.5 0C39 62.5 37 59 36.5 50z" fill="${HAIR}"/>`);
  if (b !== 'none' && b !== 'stubble') p.push(`<path d="M42.5 68.2q7.5-4.4 15 0-7.5 1.6-15 0z" fill="${HAIR}" stroke="${INK}" stroke-width=".5"/>`);
  p.push(`<path d="${MOUTHS[f.mouth] ?? MOUTHS[0]}" stroke="${INK}" stroke-width="1.4" stroke-linecap="round" fill="none"/>`);
  if (f.scar) p.push(`<path d="M58.5 46l5 14" stroke="#8a2a1e" stroke-width="1.3" stroke-linecap="round"/><path d="M59 49.5l2.4-.9M60.2 53l2.4-.9M61.4 56.5l2.4-.9" stroke="#8a2a1e" stroke-width=".8"/>`);
  if (f.patch === 'l') p.push(`<path d="M33.5 51.5L67 44.5" stroke="${INK}" stroke-width="1.1"/><ellipse cx="42.5" cy="55.6" rx="4.4" ry="3.7" fill="${INK}"/>`);
  if (f.patch === 'r') p.push(`<path d="M66.5 51.5L33 44.5" stroke="${INK}" stroke-width="1.1"/><ellipse cx="57.5" cy="55.6" rx="4.4" ry="3.7" fill="${INK}"/>`);
  if (f.earring) p.push(`<circle cx="33" cy="64.6" r="2" stroke="#d9a441" stroke-width="1.3" fill="none"/>`);
  // hats
  const plume = (x: number, y: number) => `<path d="M${x} ${y}c10-12 22-12 27-19-3 12-13 17-25 21z" fill="#ece3d1" stroke="${INK}" stroke-width=".6"/><path d="M${x + 2} ${y - 1}c8-7 16-10 23-16" stroke="${INK}" stroke-width=".5" opacity=".6" fill="none"/>`;
  if (f.hat === 'tricorn') {
    if (f.plume) p.push(plume(58, 28));
    p.push(
      `<path d="M17 43c12 4 23-13 33-13s21 17 33 13c-6-9-16-21-33-21S23 34 17 43z" fill="${INK}"/>`,
      `<path d="M17 43c12 4 23-13 33-13s21 17 33 13" stroke="#c9a25a" stroke-width="1.3" fill="none"/>`,
      `<path d="M30 31q20-9 40 0" stroke="#6b5136" stroke-width=".7" fill="none"/>`,
    );
  }
  if (f.hat === 'bicorne') {
    if (f.plume) p.push(plume(52, 24));
    p.push(
      `<path d="M13 41c14 0 22-19 37-21 15 2 23 21 37 21-6 4-22 6-37 4-15 2-31 0-37-4z" fill="${INK}"/>`,
      `<path d="M13 41c14 0 22-19 37-21 15 2 23 21 37 21" stroke="#c9a25a" stroke-width="1.1" fill="none"/>`,
      `<circle cx="61" cy="35" r="3.2" fill="#b33a2c" stroke="#e8c070" stroke-width=".8"/>`,
    );
  }
  if (f.hat === 'bandana')
    p.push(
      `<path d="M32.5 47c0-12 8-17 17.5-17s17.5 5 17.5 17c-6-5-12-7-17.5-7s-11.5 2-17.5 7z" fill="#a8322a"/>`,
      `<path d="M66 44l11 5-4 4zM66 45.5l8 12.5h-5z" fill="#8e2922"/>`,
      `<circle cx="42" cy="37" r="1" fill="#f0e2c0"/><circle cx="50" cy="34" r="1" fill="#f0e2c0"/><circle cx="58" cy="37" r="1" fill="#f0e2c0"/><circle cx="46" cy="41" r="1" fill="#f0e2c0"/><circle cx="55" cy="41" r="1" fill="#f0e2c0"/>`,
    );
  if (f.hat === 'hood')
    p.push(
      `<path d="M25 106c-3-36 2-72 25-80 23 8 28 44 25 80h-9c1-26-2-56-16-60-14 4-17 34-16 60z" fill="#3c3d36"/>`,
      `<path d="M66 106c1-26-2-56-16-60 13-2 22 30 25 60z" fill="url(#${hatch})"/>`,
    );
  if (f.hat === 'cap')
    p.push(`<path d="M33 47c-1-14 9-20 17-20s18 6 17 20z" fill="#465564"/><path d="M32 44h36v4.5H32z" fill="#33404c"/><circle cx="50" cy="26.5" r="2.4" fill="#33404c"/>`);
  return `<svg viewBox="0 0 100 110" aria-hidden="true">${defs}${p.join('')}</svg>`;
}

// ------------------------------------------------------------------ posters

const skulls = (n: number, of = 5) => `<span class="wp-tier" aria-label="Tier ${n}">${Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;

type PosterState = 'unknown' | 'large' | 'sunk';

function poster(c: NamedCaptain, st: PosterState, l: Ledger, bonus: number) {
  const cls = SHIP_CLASSES[c.cls].name;
  const known = st !== 'unknown';
  const times = l.sunk[c.id] ?? 0;
  const when = l.first[c.id] ? new Date(l.first[c.id]).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  return `<article class="wp s-${st}" style="--tilt:${(((c.id.charCodeAt(0) * 7 + c.id.length * 13) % 9) - 4) * 0.35}deg">
    <i class="wp-nail"></i>
    <header><b>Wanted</b><small>Dead or drowned</small></header>
    <div class="wp-face">${portrait(c.face, !known)}</div>
    <h3>${known ? esc(c.name) : 'Unknown captain'}</h3>
    <em>${known ? `“${esc(c.epithet)}”` : 'Not yet sighted'}</em>
    <p class="wp-ship">${known ? `${cls} · <span>${esc(c.ship)}</span>` : `A ${cls.toLowerCase()} of the Brethren`}</p>
    ${skulls(c.tier)}
    <div class="wp-reward"><small>Reward</small><b>${fmt(c.bounty * bonus)}</b><span>gold</span></div>
    ${known ? `<p class="wp-trait">${esc(c.trait)}</p>` : '<p class="wp-trait">Raise your wanted level to draw them out.</p>'}
    ${st === 'sunk' ? `<div class="wp-stamp"><b>Sunk</b><small>${times > 1 ? `${times} times · first ` : ''}${when}</small></div>` : st === 'large' ? '<div class="wp-large">At large</div>' : ''}
  </article>`;
}

/** The Wanted Board in the harbour: your infamy, and every named captain's notice. */
export class BountyBoard {
  private body = $('bounties-body');

  render(l: Ledger) {
    const rank = reputeRank(l.infamy);
    const [at, title, line] = REPUTE[rank];
    const next = REPUTE[rank + 1];
    const bonus = 1 + rank * REPUTE_BONUS;
    const prog = next ? (l.infamy - at) / (next[0] - at) : 1;
    const sunk = CAPTAINS.filter((c) => l.sunk[c.id]).length;
    const posters = CAPTAINS.map((c) => poster(c, l.sunk[c.id] ? 'sunk' : l.seen.includes(c.id) ? 'large' : 'unknown', l, bonus)).join('');
    this.body.innerHTML = `
      <section class="bb-head">
        <div class="bb-rank">
          <div class="bb-seal">${skulls(Math.min(5, Math.max(l.best, 0)))}</div>
          <div>
            <small>Your infamy among the Brethren</small>
            <h3>${title}</h3>
            <p>${line}</p>
          </div>
        </div>
        <div class="bb-bar" role="progressbar" aria-valuenow="${l.infamy}" aria-valuemax="${next ? next[0] : l.infamy}"><i style="transform:scaleX(${Math.min(1, prog).toFixed(3)})"></i></div>
        <div class="bb-next">${next ? `<b>${fmt(l.infamy)}</b> / ${fmt(next[0])} infamy · next: <span>${next[1]}</span>` : `<b>${fmt(l.infamy)}</b> infamy · the highest rank there is`}</div>
        <div class="bb-stats">
          <div><b>+${Math.round((bonus - 1) * 100)}%</b><span>Crown bounty bonus</span></div>
          <div><b>${sunk}<small>/${CAPTAINS.length}</small></b><span>Captains sunk</span></div>
          <div><b>${fmt(l.claimed)}</b><span>Bounty gold</span></div>
          <div><b>${l.best}<small>/5</small></b><span>Most wanted</span></div>
        </div>
        <p class="bb-how">Every pirate you sink raises your wanted level for the voyage. At each new skull the Brethren send a named captain after you: tougher, faster and sharper-eyed than any crew, with a Crown bounty to match. Your lifetime infamy raises every bounty the Crown pays.</p>
      </section>
      <section class="bb-wall">${posters}</section>`;
  }
}

// ------------------------------------------------------------------ the HUD

/** The voyage's wanted meter under the purse, and the pointer to whoever hunts you. */
export class WantedHud {
  private root = $('hud-wanted');
  private pips = [...this.root.querySelectorAll<HTMLElement>('.wn-pips i')];
  private hunt = $('hud-hunt');
  private mark = $('hunt-mark');
  private markTxt = this.mark.querySelector('b')!;
  private arrow = this.mark.querySelector<HTMLElement>('.hm-arrow')!;
  private last = '';
  private huntKey = '';
  private shown = false;

  reset() {
    this.last = '';
    this.huntKey = '';
    this.root.classList.remove('on', 'hot', 'bump');
    this.hunt.textContent = '';
    this.setMark(false);
  }

  update(pts: number, level: number, hunter: { name: string; dist: number } | null) {
    const p = wantedProgress(pts);
    const key = `${level}|${p.toFixed(2)}`;
    if (key !== this.last) {
      const grew = this.last && Number(this.last.split('|')[0]) < level;
      this.last = key;
      this.root.classList.toggle('on', pts > 0);
      this.root.classList.toggle('hot', level >= 3);
      this.pips.forEach((el, i) => {
        el.classList.toggle('lit', i < level);
        el.style.setProperty('--p', i === level ? p.toFixed(3) : i < level ? '1' : '0');
      });
      this.root.title = level < WANTED_AT.length ? `Infamy ${pts} · next skull at ${WANTED_AT[level]}` : `Infamy ${pts} · most wanted`;
      if (grew) {
        replay(this.root, 'bump');
      }
    }
    const hk = hunter ? `${hunter.name}|${Math.round(hunter.dist / 10)}` : '';
    if (hk !== this.huntKey) {
      this.huntKey = hk;
      this.hunt.innerHTML = hunter ? `${esc(hunter.name)} <span>${Math.round(hunter.dist)} m</span>` : '';
      this.root.classList.toggle('hunted', !!hunter);
    }
  }

  /** Points at the hunter from the edge of the screen while she's out of sight. */
  point(sx: number, sy: number, inFront: boolean, dist: number, name: string, w: number, h: number) {
    const m = 46;
    const onScreen = inFront && sx > m && sx < w - m && sy > m && sy < h - m;
    if (onScreen) return this.setMark(false);
    // direction from the middle of the screen; behind the camera the projection mirrors
    let dx = sx - w / 2;
    let dy = sy - h / 2;
    if (!inFront) {
      dx = -dx;
      dy = -dy;
    }
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const hw = w / 2 - m - 12;
    const hh = h / 2 - m - 30;
    const k = Math.min(hw / Math.max(1e-3, Math.abs(dx)), hh / Math.max(1e-3, Math.abs(dy)));
    const x = w / 2 + dx * k;
    const y = h / 2 + dy * k;
    this.setMark(true);
    this.mark.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    this.arrow.style.transform = `rotate(${Math.atan2(dy, dx).toFixed(3)}rad)`;
    const t = `${name} · ${Math.round(dist)} m`;
    if (this.markTxt.textContent !== t) this.markTxt.textContent = t;
  }

  hideMark() {
    this.setMark(false);
  }

  private setMark(on: boolean) {
    if (on === this.shown) return;
    this.shown = on;
    this.mark.classList.toggle('on', on);
  }
}

// ------------------------------------------------------------------ banners

/** The big notices: a hunter sets out after you, or her bounty is yours. */
export class BountyBanner {
  private el = $('bounty-banner');
  private timer = 0;

  private show(html: string, kind: string, life: number) {
    clearTimeout(this.timer);
    const el = this.el;
    el.className = el.classList.contains('on') ? `on ${kind}` : kind;
    el.innerHTML = html;
    replay(el, 'on');
    this.timer = window.setTimeout(() => el.classList.remove('on'), life * 1000);
  }

  hunt(c: NamedCaptain, bounty: number) {
    this.show(
      `<div class="bn-face">${portrait(c.face)}</div>
       <div class="bn-txt">
         <small>A price on your head</small>
         <b>${esc(c.epithet)}</b>
         <span class="bn-ship">${SHIP_CLASSES[c.cls].name} · ${esc(c.ship)} ${skulls(c.tier)}</span>
         <q>${esc(c.taunt)}</q>
         <span class="bn-reward"><i class="coin"></i>${fmt(bounty)} gold bounty</span>
       </div>`,
      'hunt',
      7,
    );
  }

  claimed(c: NamedCaptain, gold: number, infamy: number) {
    this.show(
      `<div class="bn-face">${portrait(c.face)}<div class="bn-stamp">Sunk</div></div>
       <div class="bn-txt">
         <small>Bounty claimed</small>
         <b>${esc(c.epithet)}</b>
         <span class="bn-ship">The ${esc(c.ship)} is on the bottom</span>
         <span class="bn-reward big"><i class="coin"></i>+${fmt(gold)} gold</span>
         <span class="bn-inf">Infamy +${infamy}</span>
       </div>`,
      'claimed',
      6.5,
    );
  }

  clear() {
    clearTimeout(this.timer);
    this.el.className = '';
  }
}
