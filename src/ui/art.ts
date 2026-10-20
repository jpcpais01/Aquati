// Small hand-built SVG art for the menus: ship silhouettes drawn straight from
// each class's real proportions, stat glyphs and a few ornaments.

import { ShipClass } from '../ships/shipTypes';

const f = (n: number) => +n.toFixed(2);

/**
 * Side profile of a ship class, bow to the right, built from the same hull,
 * castle, mast and rig numbers the 3D model uses, so the sloop really reads
 * as a sloop and the galleon towers over it.
 */
export function shipSilhouette(c: ShipClass): string {
  const L = c.length;
  const fb = c.freeboard + c.bulwark * 0.6;
  const sheer = (t: number) => (t < 0.5 ? c.sheerStern * ((0.5 - t) / 0.5) ** 2 : c.sheerBow * ((t - 0.5) / 0.5) ** 2);
  const deck = (t: number) => fb + sheer(t);
  const draft = c.draft * 0.75;
  // svg y grows downwards; flip once here
  const P = (x: number, y: number) => `${f(x)} ${f(-y)}`;

  // ----- hull outline: stern → castles → sheer → bow stem → keel → transom
  const d: string[] = [];
  const sc = c.sternCastle;
  const fc = c.foreCastle;
  d.push(`M${P(-0.25, deck(0) + (sc ? sc.h : 0) + 0.15)}`);
  if (sc) {
    d.push(`L${P(sc.t * L, deck(sc.t) + sc.h)}`, `L${P(sc.t * L + 0.25, deck(sc.t))}`);
  }
  const steps = 10;
  const t0 = sc ? sc.t : 0;
  const t1 = fc ? fc.t : 1;
  for (let i = 1; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps;
    d.push(`L${P(t * L, deck(t))}`);
  }
  if (fc) d.push(`L${P(fc.t * L - 0.25, deck(fc.t) + fc.h)}`, `L${P(L, deck(1) + fc.h)}`);
  // bow stem sweeps forward and down into the forefoot
  d.push(`Q${P(L * 0.99, deck(1) * 0.2)} ${P(L * 0.86, -draft)}`);
  d.push(`L${P(L * 0.1, -draft)}`);
  d.push(`Q${P(0.1, -draft * 0.6)} ${P(0.35, 0.4)}`);
  d.push('Z');
  const hull = `<path class="h" d="${d.join(' ')}"/>`;
  // a bright wale stripe and gun ports
  const wale = Array.from({ length: 11 }, (_, i) => {
    const t = 0.03 + i * 0.09;
    return `${i ? 'L' : 'M'}${P(t * L, deck(t) - fb * 0.42)}`;
  }).join(' ');
  let ports = '';
  for (let i = 0; i < c.cannonsPerSide; i++) {
    const t = c.cannonSpan[0] + ((c.cannonSpan[1] - c.cannonSpan[0]) * i) / Math.max(1, c.cannonsPerSide - 1);
    ports += `<rect class="p" x="${f(t * L - 0.32)}" y="${f(-(deck(t) - fb * 0.62))}" width="0.64" height="0.55" rx="0.12"/>`;
  }

  // ----- rigging
  let sails = '';
  let spars = '';
  const bowY = deck(1) + (fc ? fc.h : 0);
  const sprit: [number, number] = [L + c.bowsprit * 0.92, bowY + c.bowsprit * 0.32];
  spars += `<path class="m" d="M${P(L - 1, bowY - 0.2)} L${P(...sprit)}"/>`;
  const fore = c.masts.reduce((a, m) => (m.t > a.t ? m : a), c.masts[0]);
  const main = c.masts.reduce((a, m) => (m.height > a.height ? m : a), c.masts[0]);
  if (c.jib) {
    const mx = fore.t * L;
    const top = deck(fore.t) + fore.height * 0.78;
    sails += `<path class="s" d="M${P(mx + 0.3, top)} Q${P((mx + sprit[0]) / 2 + 0.6, (top + sprit[1]) / 2 + 0.6)} ${P(sprit[0] - 0.4, sprit[1] + 0.1)} L${P(L - 0.2, bowY + 1.2)} Z"/>`;
  }
  for (const m of c.masts) {
    const x = m.t * L;
    const base = deck(m.t);
    const top = base + m.height;
    spars += `<path class="m" d="M${P(x, base - 0.5)} L${P(x, top)}"/>`;
    if (m.rig === 'square') {
      const y0 = base + m.height * 0.2;
      const y1 = base + m.height * 0.92;
      const h = (y1 - y0) / m.tiers;
      for (let k = 0; k < m.tiers; k++) {
        const lo = y0 + h * k + 0.25;
        const hi = y0 + h * (k + 1) - 0.25;
        const wl = L * 0.15 * (1 - k * 0.16);
        const wh = wl * 0.86;
        // a gentle belly on the leading and trailing edges
        sails += `<path class="s" d="M${P(x - wh, hi)} L${P(x + wh, hi)} Q${P(x + wl + 0.7, (lo + hi) / 2)} ${P(x + wl, lo)} L${P(x - wl, lo)} Q${P(x - wl - 0.35, (lo + hi) / 2)} ${P(x - wh, hi)} Z"/>`;
        spars += `<path class="y" d="M${P(x - wh - 0.4, hi + 0.15)} L${P(x + wh + 0.4, hi + 0.15)}"/>`;
      }
      if (m.top) spars += `<path class="y" d="M${P(x - 0.8, y0 + h * Math.min(1, m.tiers - 1) + 0.1)} L${P(x + 0.8, y0 + h * Math.min(1, m.tiers - 1) + 0.1)}"/>`;
    } else if (m.rig === 'gaff') {
      const boom = base + 1.6;
      const peak = base + m.height * 0.86;
      const reach = L * 0.42;
      sails += `<path class="s" d="M${P(x - 0.2, peak - 0.6)} L${P(x - reach * 0.78, peak + 0.4)} Q${P(x - reach * 0.78, (peak + boom) / 2)} ${P(x - reach, boom)} L${P(x - 0.2, boom)} Z"/>`;
      spars += `<path class="y" d="M${P(x, boom)} L${P(x - reach - 0.4, boom - 0.2)}"/><path class="y" d="M${P(x, peak - 0.6)} L${P(x - reach * 0.82, peak + 0.5)}"/>`;
    } else {
      const lo = base + 1.8;
      const hi = base + m.height * 0.95;
      sails += `<path class="s" d="M${P(x + L * 0.07, lo + 1.2)} L${P(x - L * 0.15, hi)} Q${P(x - L * 0.11, (lo + hi) / 2)} ${P(x - L * 0.13, lo)} Z"/>`;
      spars += `<path class="y" d="M${P(x + L * 0.08, lo + 1)} L${P(x - L * 0.16, hi + 0.3)}"/>`;
    }
  }
  // a pennant streams from the tallest masthead
  const px = main.t * L;
  const py = deck(main.t) + main.height;
  const flag = `<path class="f" d="M${P(px, py)} Q${P(px - 1.6, py - 0.2)} ${P(px - 3.4, py - 0.55)} L${P(px, py - 1.3)} Z"/>`;

  // fit the viewBox to the drawing
  const maxTop = Math.max(...c.masts.map((m) => deck(m.t) + m.height)) + 0.6;
  const minX = -(c.masts.some((m) => m.rig === 'gaff') ? Math.max(0, L * 0.42 - L * c.masts[0].t) + 1.2 : 1.2);
  const maxX = sprit[0] + 0.8;
  const vb = `${f(minX)} ${f(-maxTop)} ${f(maxX - minX)} ${f(maxTop + draft + 0.6)}`;
  return `<svg class="ship-art" viewBox="${vb}" preserveAspectRatio="xMidYMax meet" aria-hidden="true">${sails}${spars}${hull}<path class="w" d="${wale}"/>${ports}${flag}</svg>`;
}

/** Tiny line glyphs for the ship stats. */
export const STAT_ICONS: Record<string, string> = {
  speed: '<path d="M3 8h9a3 3 0 1 0-3-3M3 12h14a3 3 0 1 1-3 3M3 16h6"/>',
  agility:
    '<circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="1.6"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5.3 5.3l2.8 2.8M15.9 15.9l2.8 2.8M18.7 5.3l-2.8 2.8M8.1 15.9l-2.8 2.8"/>',
  armour: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8 7.5 9.5 4.3-1.5 7.5-4.9 7.5-9.5V6z"/><path d="M12 7v10"/>',
  hull: '<path d="M2.5 10h19l-2.5 6.5a3 3 0 0 1-2.8 1.9H7.8A3 3 0 0 1 5 16.4z"/><path d="M4 13.2h16M12 4v6M12 4.5l5 4"/>',
  firepower: '<circle cx="9" cy="14" r="5.5"/><path d="M13 10l3.5-3.5M17 4.5l.8-1.5M19.5 7l1.5-.8M18.5 5.5l2-2"/>',
};

export const STAT_LABELS: [keyof typeof STAT_ICONS, string][] = [
  ['speed', 'Speed'],
  ['agility', 'Agility'],
  ['armour', 'Armour'],
  ['hull', 'Hull'],
  ['firepower', 'Firepower'],
];

export const icon = (inner: string, cls = 'ico') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const ICONS = {
  anchor: '<circle cx="12" cy="5" r="2.2"/><path d="M12 7.2V21M8 10.5h8M4.5 13.5c0 4 3.4 7.5 7.5 7.5s7.5-3.5 7.5-7.5M2.8 15.3l1.7-1.8 1.9 1.6M21.2 15.3l-1.7-1.8-1.9 1.6"/>',
  soundOn: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.5a8 8 0 0 1 0 11"/>',
  soundOff: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  scroll: '<path d="M7 4h11a2 2 0 0 1 2 2v1h-4M7 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7M7 4a2 2 0 0 1 2 2v12M11 9h4M11 12.5h4M11 16h2.5"/>',
  keys: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7.5 14h9"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  chev: '<path d="m9 5 7 7-7 7"/>',
  chevL: '<path d="m15 5-7 7 7 7"/>',
  cannon:
    '<path d="M3 9.6 15.6 7.2a1 1 0 0 1 1.1.8l.7 3.6a1 1 0 0 1-.8 1.2L4 15.2z" fill="currentColor" fill-opacity=".9"/><path d="M17.6 7.6l2.6-.5.8 4-2.6.5"/><circle cx="8.5" cy="16.2" r="3.3" fill="rgba(4,18,26,.6)"/><circle cx="8.5" cy="16.2" r=".8"/><path d="M13 19.5h7"/>',
  pause: '<path d="M9 5.5v13M15 5.5v13"/>',
  wheel: STAT_ICONS.agility,
  harbour: '<path d="M3 20h18M5 20V10l7-5 7 5v10M9.5 20v-5h5v5"/>',
  hourglass: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>',
  eye: '<path d="M2.5 12s3.6-6.5 9.5-6.5S21.5 12 21.5 12s-3.6 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3.1"/>',
  bird: '<path d="M3 13.5c3-1 5.5-4 9-4s6 3 9 4M8.5 10.8 12 15l3.5-4.2"/>',
  spyglass: '<path d="m3.5 15.5 13-7.2 1.9 3.4-13 7.2zM16.5 8.3l1.6-.9 1.9 3.4-1.6.9M6.6 13.8l1.9 3.4"/>',
  sliders: '<path d="M4 7h9M18 7h2M4 17h3M12 17h8"/><circle cx="15.5" cy="7" r="2.4"/><circle cx="9.5" cy="17" r="2.4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/><circle cx="12" cy="12" r="6.6"/>',
  map: '<path d="M3 6.5 8.5 4l7 2.5L21 4v13.5L15.5 20l-7-2.5L3 20z"/><path d="M8.5 4v13.5M15.5 6.5V20"/>',
  target: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.2"/><path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
  wind: '<path d="M3 8.5h11a3 3 0 1 0-3-3M3 12.5h16a3 3 0 1 1-3 3M3 16.5h7"/>',
  camera: '<path d="M3.5 8.5a2 2 0 0 1 2-2h2.2l1.5-2h5.6l1.5 2h2.2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.8" r="3.6"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.6A9.6 9.6 0 0 1 12 5.5c5.9 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.7M6.6 6.7C4 8.4 2.5 12 2.5 12s3.6 6.5 9.5 6.5a9 9 0 0 0 4.3-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  orbit: '<circle cx="12" cy="12" r="2.6"/><ellipse cx="12" cy="12" rx="9.5" ry="4.2"/><path d="M19.6 9.4l1.4-1.6.4 2.1"/>',
  fly: '<path d="M2.5 13.5 21 5l-5.5 15-3.4-6.6z"/><path d="M12.1 13.4 21 5"/>',
  grid: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>',
  focus: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><circle cx="12" cy="12" r="2.8"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4.5 19.5h15"/>',
  cutlass: '<path d="M5 19c6-3 11.5-9 14.5-15.5C14 6 8.5 11 6.6 16.4"/><path d="M3.5 15.5l5 5M4.6 20.3l-1.4 1.4"/>',
  pistol: '<path d="M3 8.5h16.5V12H11l-1.2 1.4.6 1.6-1.7 4.5H5.4l1.7-6.2L3 12z"/><path d="M10.2 12.4c.6 1.4 1.8 1.7 2.6.8M18 8.5V7"/>',
  boat: '<path d="M2.5 12.5h19l-2.6 5a2.4 2.4 0 0 1-2.1 1.3H7.2a2.4 2.4 0 0 1-2.1-1.3z"/><path d="M8 12.5 5.5 6M16 12.5l2.5-6.5"/>',
};

let crestN = 0;
/** Compass-rose crest; each copy gets its own gradient id so hidden copies don't break visible ones. */
export const crest = () => {
  const id = `crest-g${crestN++}`;
  return `<svg class="crest" viewBox="0 0 64 64" aria-hidden="true">
  <defs><linearGradient id="crest-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2c4"/><stop offset=".55" stop-color="#efc463"/><stop offset="1" stop-color="#b98227"/></linearGradient></defs>
  <circle cx="32" cy="32" r="27" fill="none" stroke="url(#crest-g)" stroke-width="1.6" opacity=".85"/>
  <circle cx="32" cy="32" r="22.5" fill="none" stroke="url(#crest-g)" stroke-width=".8" stroke-dasharray="1.2 3.2" opacity=".8"/>
  <g class="crest-rose">
    <path d="M32 6 36 28 32 32 28 28Z M32 58 28 36 32 32 36 36Z M6 32 28 28 32 32 28 36Z M58 32 36 36 32 32 36 28Z" fill="url(#crest-g)"/>
    <path d="M32 6 32 32 28 28Z M32 58 32 32 36 36Z M6 32 32 32 28 36Z M58 32 32 32 36 28Z" fill="#8a5a17" opacity=".45"/>
    <path d="M32 16 34 30 32 32 30 30Z M32 48 30 34 32 32 34 34Z M16 32 30 30 32 32 30 34Z M48 32 34 34 32 32 34 30Z" fill="url(#crest-g)" opacity=".7" transform="rotate(45 32 32)"/>
  </g>
  <circle cx="32" cy="32" r="2.4" fill="#0b3546" stroke="url(#crest-g)" stroke-width="1.2"/>
</svg>`.replace(/crest-g/g, id);
};

/** Compass bezel for the round minimap: a fine ring, ticks every 15°, cardinal letters and a gold north pip. */
export function compassBezel(): string {
  let ticks = '';
  for (let i = 0; i < 24; i++) {
    if (i % 6 === 0) continue;
    const a = (i / 24) * Math.PI * 2;
    const r0 = i % 3 === 0 ? 90 : 93;
    const x0 = 100 + Math.sin(a) * r0;
    const y0 = 100 - Math.cos(a) * r0;
    const x1 = 100 + Math.sin(a) * 96.5;
    const y1 = 100 - Math.cos(a) * 96.5;
    ticks += `<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}"/>`;
  }
  const letter = (t: string, x: number, y: number) => `<text x="${x}" y="${y}">${t}</text>`;
  return `<defs><linearGradient id="bz-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4cc"/><stop offset="1" stop-color="#e9b24a"/></linearGradient></defs>
    <circle class="bz-ring" cx="100" cy="100" r="98.5"/>
    <circle class="bz-inner" cx="100" cy="100" r="88"/>
    <g class="bz-ticks">${ticks}</g>
    <g class="bz-letters">${letter('E', 186, 104.5)}${letter('S', 100, 190.5)}${letter('W', 14, 104.5)}</g>
    <path class="bz-north" d="M100 3 L108.5 17 L100 13.5 L91.5 17 Z"/>`;
}
