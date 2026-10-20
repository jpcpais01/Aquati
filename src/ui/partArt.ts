// Little portraits of every upgrade part, for the Shipwright's refit track,
// the port shipwright's counter and the "part found" toasts. SVG on a 40×40
// grid, in the colours the part really is on the ship; the mythic ones glow.

import type { Part } from '../ships/parts';

type Stop = [number, string];
let uid = 0;

const grad = (id: string, s: Stop[], x2 = 0, y2 = 1) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${s.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
const radial = (id: string, s: [number, string, number][]) =>
  `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.5">${s.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</radialGradient>`;

const GOLD: Stop[] = [[0, '#fff3b8'], [0.4, '#f2c24c'], [1, '#9a6110']];
const BRONZE: Stop[] = [[0, '#ffd9a6'], [0.45, '#c08241'], [1, '#6a3a12']];
const IRON: Stop[] = [[0, '#8b939e'], [0.5, '#3c424b'], [1, '#191c21']];
const BLUED: Stop[] = [[0, '#a9bde6'], [0.5, '#3d5590'], [1, '#141f3f']];
const OBSID: Stop[] = [[0, '#55506a'], [0.5, '#1d1a26'], [1, '#08070c']];
const PEARL: Stop[] = [[0, '#ffffff'], [0.5, '#e4e1f0'], [1, '#9d98b8']];
const OAK: Stop[] = [[0, '#d39a5a'], [0.5, '#8d5a2e'], [1, '#4a2c14']];
const CANVAS: Stop[] = [[0, '#fffaf0'], [1, '#d8ccb0']];

const GLOW_C = '#7fe8ff';
const GLOW_V = '#c69bff';

/** A soft bloom behind the mythic pieces. */
const aura = (k: string, c: string) => `${radial(`pa-au${k}`, [[0, c, 0.75], [0.45, c, 0.25], [1, c, 0]])}`;

function draw(p: Part, k: string): string {
  const u = (n: string) => `url(#pa-${n}${k})`;
  const key = p.id.split(':')[1];
  const defs: string[] = [];
  const g = (n: string, s: Stop[], x2 = 0, y2 = 1) => defs.push(grad(`pa-${n}${k}`, s, x2, y2));
  let body = '';
  switch (key) {
    // ------------------------------------------------ hull plating
    case 'strakes':
      g('oak', OAK);
      body = `<path d="M5 15h30l-3.5 15H8.5z" fill="${u('oak')}" stroke="#3a220e" stroke-width="1"/>
        <path d="M5.8 19.5h28.4M7 24.5h26" stroke="#5a3616" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M5.8 19.5h28.4M7 24.5h26" stroke="#c48a4c" stroke-width="0.8" stroke-linecap="round" opacity="0.7"/>
        <path d="M12 9v6M28 9v6" stroke="#8c7150" stroke-width="1"/>
        <rect x="9" y="13" width="6" height="9" rx="3" fill="#b89366" stroke="#5a4426" stroke-width="0.8"/>
        <rect x="25" y="13" width="6" height="9" rx="3" fill="#b89366" stroke="#5a4426" stroke-width="0.8"/>
        <path d="M9 16h6M9 19h6M25 16h6M25 19h6" stroke="#2a1f16" stroke-width="0.9"/>`;
      break;
    case 'iron':
      g('oak', OAK);
      g('ir', IRON, 1, 0);
      body = `<path d="M5 13h30l-3.5 17H8.5z" fill="${u('oak')}" stroke="#3a220e" stroke-width="1"/>
        <path d="M4.5 12.5h31" stroke="${u('ir')}" stroke-width="2.6" stroke-linecap="round"/>
        ${[10, 16.5, 23.5, 30].map((x) => `<path d="M${x} 13.5L${x - (x - 20) * 0.08} 29.5" stroke="${u('ir')}" stroke-width="2.4"/>${[17, 21, 25].map((y) => `<circle cx="${x - (x - 20) * 0.08 * ((y - 13) / 16)}" cy="${y}" r="0.75" fill="#aab2bc"/>`).join('')}`).join('')}
        <path d="M7.5 27h25" stroke="${u('ir')}" stroke-width="1.8"/>`;
      break;
    case 'pavisade':
      g('br', BRONZE, 1, 1);
      body = `<path d="M3 27h34l-2 6H5z" fill="#6b4524"/><path d="M3 22h34v5H3z" fill="#4a2f18"/>
        ${[[9, '#1f8a8a'], [20, '#f5efe1'], [31, '#1f8a8a']].map(([x, c]) => `<circle cx="${x}" cy="20" r="6.6" fill="${c}" stroke="${u('br')}" stroke-width="1.8"/><circle cx="${x}" cy="20" r="2.2" fill="${u('br')}"/><circle cx="${x}" cy="20" r="4.4" fill="none" stroke="#000" stroke-opacity="0.15" stroke-width="0.6"/>`).join('')}
        <path d="M30 31l8 -1.5-8-1.5z" fill="${u('br')}"/>`;
      break;
    case 'dragonscale':
      g('gd', GOLD, 1, 1);
      body = `<path d="M6 14h28l-3 17H9z" fill="#7a4a0c"/>
        ${[0, 1, 2].map((r) => Array.from({ length: 6 - (r % 2) }, (_, i) => { const x = 9 + i * 4.6 + (r % 2) * 2.3; const y = 17 + r * 4.4; return `<path d="M${x - 2.6} ${y}a2.6 3 0 0 0 5.2 0z" fill="${u('gd')}" stroke="#7a4a06" stroke-width="0.5"/>`; }).join('')).join('')}
        ${[8, 14, 20, 26, 32].map((x) => `<path d="M${x - 1.6} 14l${-1.2} -6.5l${4} 6.5z" fill="${u('gd')}" stroke="#7a4a06" stroke-width="0.5" stroke-linejoin="round"/>`).join('')}`;
      break;
    case 'aegis':
      g('ob', OBSID, 1, 1);
      defs.push(aura(k, GLOW_C));
      body = `<circle cx="20" cy="20" r="19" fill="url(#pa-au${k})"/>
        <path d="M6 19h28l-3 12H9z" fill="${u('ob')}" stroke="${GLOW_C}" stroke-width="0.8"/>
        <path d="M13 19v12M20 19v12M27 19v12M7.5 25h25" stroke="${GLOW_C}" stroke-width="0.7" opacity="0.9"/>
        <path d="M5.5 18.5h29" stroke="${GLOW_V}" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M20 3.5l7.4 4.3v8.5L20 20.6l-7.4-4.3V7.8z" fill="none" stroke="${GLOW_C}" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M20 7.5l3.6 6.2h-7.2z" fill="none" stroke="${GLOW_V}" stroke-width="0.9" stroke-linejoin="round"/>
        <circle cx="20" cy="12" r="1.2" fill="#fff"/>`;
      break;
    // ------------------------------------------------ sails
    case 'storm':
      g('cv', CANVAS);
      body = `<path d="M20 4v32" stroke="#5a3a20" stroke-width="1.6"/><path d="M7 7h26" stroke="#5a3a20" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M8 8q12 2 24 0q2 11 0 22q-12-2-24 0q-2-11 0-22z" fill="${u('cv')}" stroke="#a89878" stroke-width="1.6"/>
        ${[13, 17, 21].map((y) => `<path d="M8.5 ${y}q11.5 1.4 23 0" fill="none" stroke="#8a7a5a" stroke-width="0.6"/>${Array.from({ length: 8 }, (_, i) => `<circle cx="${10 + i * 2.9}" cy="${y + 0.9}" r="0.55" fill="#6a5a3a"/>`).join('')}`).join('')}
        <path d="M8 26l5 4M32 26l-5 4" stroke="#a89878" stroke-width="1.2"/>`;
      break;
    case 'clipper':
      g('cv', [[0, '#ffffff'], [1, '#e8e2d2']]);
      body = `<path d="M20 4v32" stroke="#5a3a20" stroke-width="1.6"/><path d="M7 7h26" stroke="#5a3a20" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M8 8q12 2 24 0q2 11 0 22q-12-2-24 0q-2-11 0-22z" fill="${u('cv')}" stroke="#8c1418" stroke-width="2.2"/>
        <path d="M10 10.2q10 1.6 20 0q1.6 9.8 0 17.8q-10-1.6-20 0q-1.6-8 0-17.8z" fill="none" stroke="#e4b44a" stroke-width="0.6"/>
        <path d="M14 8.5v20M20 8.8v20M26 8.5v20" stroke="#d9d0bc" stroke-width="0.5"/>
        <path d="M20 4l6 -1.6v3.2z" fill="#d4a84e"/>`;
      break;
    case 'batwing':
      body = `<path d="M8 6l-2 30" stroke="#5a3a20" stroke-width="1.6"/>
        <path d="M8 6q16 -2 26 6q-2 10 -4 22q-12-1-22 -1z" fill="#ead9b4" stroke="#1e2430" stroke-width="1.8" stroke-linejoin="round"/>
        ${[11, 16, 21, 26, 31].map((y, i) => `<path d="M${8 - i * 0.2} ${y - 1}q11 ${-2 + i * 0.6} ${23 - i * 0.6} ${-1 + i * 0.2}" fill="none" stroke="#5a3d1a" stroke-width="1.1"/>`).join('')}
        <path d="M9 9q10 -1 18 2" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="0.7"/>`;
      break;
    case 'phoenix':
      g('cv', CANVAS);
      g('gd', GOLD, 1, 1);
      body = `<path d="M20 4v32" stroke="#5a3a20" stroke-width="1.6"/><path d="M7 7h26" stroke="#5a3a20" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M8 8q12 2 24 0q2 11 0 22q-12-2-24 0q-2-11 0-22z" fill="${u('cv')}" stroke="${u('gd')}" stroke-width="1.8"/>
        ${Array.from({ length: 9 }, (_, i) => { const a = -2.1 + (i / 8) * 4.2; return `<path d="M20 21L${(20 + Math.sin(a) * 10).toFixed(1)} ${(21 - Math.cos(a) * 9).toFixed(1)}" stroke="${u('gd')}" stroke-width="1.1" stroke-linecap="round"/>`; }).join('')}
        <path d="M13 21a7 7 0 0 1 14 0" fill="none" stroke="${u('gd')}" stroke-width="0.8"/>
        <ellipse cx="20" cy="21.5" rx="2.2" ry="2.8" fill="${u('gd')}"/>
        <path d="M11 29q2-5 4-1q2-6 5-1q3-5 5 1q2-4 4 1z" fill="#e2632a" opacity="0.85"/>`;
      break;
    case 'aether':
      defs.push(aura(k, GLOW_V));
      body = `<circle cx="20" cy="20" r="19" fill="url(#pa-au${k})"/>
        <path d="M20 4v32" stroke="#2a2340" stroke-width="1.6"/><path d="M7 7h26" stroke="#2a2340" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M8 8q12 2 24 0q2 11 0 22q-12-2-24 0q-2-11 0-22z" fill="#14102e" stroke="${GLOW_C}" stroke-width="1.4"/>
        <path d="M10 14q5 -3 9 1t10 -1M10 21q6 -3 10 1t10 0M11 27q5 -2 9 0t9 -1" fill="none" stroke="${GLOW_C}" stroke-width="0.9" stroke-linecap="round"/>
        <path d="M12 18q4 2 7 0" fill="none" stroke="${GLOW_V}" stroke-width="0.8"/>
        ${[[14, 11], [27, 17], [17, 24], [26, 26], [23, 12]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.7" fill="#fff"/>`).join('')}
        <path d="M33 2.5l1.8 3.2-1.8 3.2-1.8-3.2z" fill="${GLOW_V}"/><path d="M5 1.5l1.3 2.4L5 6.3 3.7 3.9z" fill="${GLOW_C}"/>`;
      break;
    // ------------------------------------------------ guns
    case 'bronze':
      g('br', BRONZE);
      body = `<circle cx="13" cy="29" r="5" fill="#3e2a1a" stroke="#1e140c" stroke-width="1"/><circle cx="13" cy="29" r="1.6" fill="#6a4a2a"/>
        <path d="M5 23.5l25-9.5 2.6 6.4-25.4 8z" fill="${u('br')}" stroke="#5a3010" stroke-width="0.8" stroke-linejoin="round"/>
        <path d="M30 13.5l3.5-1.3 2.6 6.4-3.5 1.4z" fill="${u('br')}" stroke="#5a3010" stroke-width="0.8"/>
        ${[11, 16, 21, 26].map((x) => `<path d="M${x} ${23.6 - (x - 5) * 0.37}l1.2 3.2" stroke="#7a4a1a" stroke-width="1.3"/>`).join('')}
        <circle cx="4.5" cy="26" r="1.8" fill="${u('br')}"/>`;
      break;
    case 'culverin':
      g('bl', BLUED);
      body = `<circle cx="11" cy="30" r="4.5" fill="#3e2a1a" stroke="#1e140c" stroke-width="1"/>
        <path d="M3 26l32-11.5 1.8 4.2-32.2 10.6z" fill="${u('bl')}" stroke="#101830" stroke-width="0.8" stroke-linejoin="round"/>
        ${[7, 14, 22, 30, 35].map((x) => `<path d="M${x} ${26 - (x - 3) * 0.36}l1 2.6" stroke="#d4a84e" stroke-width="1.3"/>`).join('')}
        <path d="M14 21.5a2 2 0 0 1 3.6-1.3M18 20a2 2 0 0 1 3.6-1.3" fill="none" stroke="#d4a84e" stroke-width="0.9"/>`;
      break;
    case 'bombard':
      g('ir', IRON);
      g('gd', GOLD);
      body = `<circle cx="13" cy="30" r="5" fill="#3e2a1a" stroke="#1e140c" stroke-width="1"/>
        <path d="M5 22l20-6 5 10-19 6.5z" fill="${u('ir')}" stroke="#0e0f12" stroke-width="0.8" stroke-linejoin="round"/>
        <path d="M25 16l7-4.5 5.5 12-7 2.5z" fill="${u('ir')}" stroke="#0e0f12" stroke-width="0.8" stroke-linejoin="round"/>
        ${[10, 16, 22].map((x) => `<path d="M${x} ${22 - (x - 5) * 0.3}l2.3 5" stroke="${u('gd')}" stroke-width="1.6"/>`).join('')}
        <path d="M32 11.5l1.2-2.4.8 2.2M34.4 16.6l2.4-1.4-.4 2.4M36.4 21.4l2.6.2-1.6 1.8" fill="${u('gd')}" stroke="${u('gd')}" stroke-width="1"/>`;
      break;
    case 'dragonmaw':
      g('gd', GOLD, 1, 1);
      body = `<circle cx="11" cy="30" r="4.5" fill="#3e2a1a" stroke="#1e140c" stroke-width="1"/>
        <path d="M3 25l18-7 3 6.5-18 6z" fill="${u('gd')}" stroke="#7a4a06" stroke-width="0.8" stroke-linejoin="round"/>
        <path d="M20 17q8-6 15-3l1 3.5-6 1.5 5 2-1.5 3.5q-7 1-11.5-1z" fill="${u('gd')}" stroke="#7a4a06" stroke-width="0.8" stroke-linejoin="round"/>
        <path d="M24 15.5q-1-5-5-7q4 0 7 5" fill="${u('gd')}" stroke="#7a4a06" stroke-width="0.6"/>
        <path d="M30 18.5l5.5 1" stroke="#3a1a04" stroke-width="1.4"/>
        <circle cx="27.2" cy="16.2" r="1.3" fill="#ff5a12"/><circle cx="27.2" cy="16.2" r="2.6" fill="#ff5a12" opacity="0.3"/>`;
      break;
    case 'starfire':
      g('ob', OBSID);
      defs.push(aura(k, GLOW_C));
      body = `<circle cx="22" cy="18" r="17" fill="url(#pa-au${k})"/>
        <circle cx="10" cy="31" r="4.2" fill="#2a2540" stroke="#0d0b16" stroke-width="1"/>
        <path d="M4 26l31-11.5 1.2 2.6-31.2 11.4z" fill="${u('ob')}"/>
        ${[11, 17, 23, 29].map((x, i) => `<ellipse cx="${x}" cy="${23.4 - (x - 4) * 0.37}" rx="1.4" ry="${4 - i * 0.4}" transform="rotate(-20 ${x} ${23.4 - (x - 4) * 0.37})" fill="none" stroke="${i === 3 ? GLOW_V : GLOW_C}" stroke-width="1.3"/>`).join('')}
        <path d="M3 24.5l-2.2 2.6 2.6 1.8 1.2-3.2z" fill="${GLOW_V}"/>
        <circle cx="36" cy="15.6" r="1.6" fill="#fff"/><circle cx="36" cy="15.6" r="3.2" fill="${GLOW_C}" opacity="0.4"/>`;
      break;
    // ------------------------------------------------ figureheads
    case 'lion':
      body = `${Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2; return `<path d="M20 20L${(20 + Math.cos(a) * 15).toFixed(1)} ${(20 + Math.sin(a) * 15).toFixed(1)}" stroke="#8f5a24" stroke-width="5.5" stroke-linecap="round"/>`; }).join('')}
        <circle cx="20" cy="20" r="9.5" fill="#d0a45a" stroke="#6a4218" stroke-width="0.8"/>
        <ellipse cx="20" cy="24" rx="5" ry="3.6" fill="#e2bc78"/>
        <path d="M18 22.5h4l-2 2z" fill="#3a2618"/><path d="M20 24.5v1.6M17.5 26.6q2.5 1.4 5 0" stroke="#3a2618" stroke-width="0.8" fill="none"/>
        <circle cx="16.4" cy="18.4" r="1.1" fill="#3a2618"/><circle cx="23.6" cy="18.4" r="1.1" fill="#3a2618"/>
        <path d="M14.5 16.4q2-1.2 3.6 0M21.9 16.4q1.6-1.2 3.6 0" stroke="#8f5a24" stroke-width="0.9" fill="none"/>`;
      break;
    case 'eagle':
      body = `<path d="M4 30q4-16 15-14l-2 8z" fill="#5b3b22" stroke="#2a180a" stroke-width="0.7"/><path d="M36 30q-4-16-15-14l2 8z" fill="#5b3b22" stroke="#2a180a" stroke-width="0.7"/>
        ${[8, 12, 28, 32].map((x) => `<path d="M${x} 29l${x < 20 ? 2 : -2} -8" stroke="#3a2414" stroke-width="0.8"/>`).join('')}
        <path d="M14 30q6-16 12 0z" fill="#5b3b22"/>
        <circle cx="20" cy="13" r="6" fill="#f1ece0" stroke="#9a9080" stroke-width="0.6"/>
        <path d="M24 12.5q5 .5 4.5 4.8q-1.5-1.6-4.2-1.4z" fill="#e3a92b" stroke="#8a5a0a" stroke-width="0.5"/>
        <circle cx="21.6" cy="11.8" r="1" fill="#1a120a"/>
        <circle cx="20" cy="32" r="3.2" fill="#f2c24c" stroke="#9a6110" stroke-width="0.6"/>`;
      break;
    case 'kraken':
      g('gd', GOLD, 1, 1);
      body = `${[-1, 1].map((s) => `<path d="M${20 + s * 4} 20q${s * 8} 2 ${s * 9} 9q${-s * 1} 4 ${-s * 5} 2" fill="none" stroke="${u('gd')}" stroke-width="2.4" stroke-linecap="round"/><path d="M${20 + s * 2} 22q${s * 3} 6 ${s * 1} 12q${-s * 3} 1 ${-s * 3} -2" fill="none" stroke="${u('gd')}" stroke-width="2" stroke-linecap="round"/>`).join('')}
        <path d="M20 22q-1 7 0 13" stroke="${u('gd')}" stroke-width="2" stroke-linecap="round"/>
        <path d="M12 16q0-12 8-12t8 12q0 6-8 6t-8-6z" fill="${u('gd')}" stroke="#7a4a06" stroke-width="0.8"/>
        <circle cx="16.4" cy="16.5" r="2.2" fill="#fff6d6"/><circle cx="23.6" cy="16.5" r="2.2" fill="#fff6d6"/>
        <circle cx="16.8" cy="16.8" r="1.1" fill="#8a1420"/><circle cx="23.2" cy="16.8" r="1.1" fill="#8a1420"/>`;
      break;
    case 'dragon':
      g('gd', GOLD, 1, 1);
      body = `<path d="M6 36q-2-14 8-20q6-3 10-1" fill="none" stroke="${u('gd')}" stroke-width="5" stroke-linecap="round"/>
        <path d="M14 15q8-8 18-5l5 4-5 2 4 3-4 2q-9 2-16-1z" fill="${u('gd')}" stroke="#7a4a06" stroke-width="0.8" stroke-linejoin="round"/>
        <path d="M18 12q-3-6-9-8q6 1 11 6M22 11q0-6-3-9q4 3 5 8" fill="${u('gd')}" stroke="#7a4a06" stroke-width="0.6"/>
        <path d="M28 18.5l8 .8" stroke="#3a1a04" stroke-width="1.2"/>
        <path d="M33 16.5l1 2M30.5 16.8l.8 1.8" stroke="#fff" stroke-width="0.6"/>
        <circle cx="23" cy="13.6" r="1.4" fill="#ff5a12"/><circle cx="23" cy="13.6" r="2.8" fill="#ff5a12" opacity="0.3"/>
        ${[[8, 30], [7, 25], [9, 20]].map(([x, y]) => `<path d="M${x} ${y}l-3.5-1.5 3 3z" fill="${u('gd')}"/>`).join('')}`;
      break;
    case 'seraph':
      g('pl', PEARL);
      defs.push(aura(k, GLOW_C));
      body = `<circle cx="20" cy="18" r="18" fill="url(#pa-au${k})"/>
        ${[-1, 1].map((s) => Array.from({ length: 5 }, (_, i) => { const a = -0.6 + i * 0.42; const x = 20 + s * Math.cos(a) * 15; const y = 18 + Math.sin(a) * 13; return `<path d="M${20 + s * 2} 18L${(x).toFixed(1)} ${(y).toFixed(1)}" stroke="${i % 2 ? GLOW_V : GLOW_C}" stroke-width="2.2" stroke-linecap="round"/>`; }).join('')).join('')}
        <path d="M16 36q-1-10 2-16h4q3 6 2 16z" fill="${u('pl')}" stroke="#8a86a4" stroke-width="0.6"/>
        <circle cx="20" cy="15.5" r="3.6" fill="${u('pl')}" stroke="#8a86a4" stroke-width="0.6"/>
        <ellipse cx="20" cy="9.5" rx="5.4" ry="1.7" fill="none" stroke="#fff" stroke-width="1.3"/>
        <ellipse cx="20" cy="9.5" rx="7" ry="2.4" fill="none" stroke="${GLOW_C}" stroke-width="0.6" opacity="0.7"/>`;
      break;
  }
  return `<defs>${defs.join('')}</defs>${body}`;
}

/** An SVG portrait of a part (a fresh id namespace each call, so many can share a page). */
export function partIcon(p: Part, cls = 'part-ico'): string {
  const k = `-${++uid}`;
  return `<svg class="${cls}" viewBox="0 0 40 40" aria-hidden="true">${draw(p, k)}</svg>`;
}

/** The empty slot: what she carries with no upgrade fitted. */
export function standardIcon(slot: Part['slot'], cls = 'part-ico'): string {
  const d = {
    hull: '<path d="M5 15h30l-3.5 15H8.5z" fill="#7a4b2a" stroke="#3a220e" stroke-width="1"/><path d="M6 21h28" stroke="#21160f" stroke-width="2"/>',
    sails: '<path d="M20 4v32" stroke="#5a3a20" stroke-width="1.6"/><path d="M8 8q12 2 24 0q2 11 0 22q-12-2-24 0q-2-11 0-22z" fill="#f4ead4" stroke="#bfb39a" stroke-width="1.2"/>',
    guns: '<circle cx="13" cy="29" r="5" fill="#3e2a1a"/><path d="M5 23.5l25-9.5 2.6 6.4-25.4 8z" fill="#3c424b" stroke="#191c21" stroke-width="0.8"/>',
    figure: '<path d="M16 34q-2-10 1-17h6q3 7 1 17z" fill="#e2b552"/><circle cx="20" cy="13" r="4" fill="#e2b552"/><path d="M17 9q3-3 6 0" stroke="#e2b552" stroke-width="2" fill="none"/>',
  }[slot];
  return `<svg class="${cls}" viewBox="0 0 40 40" aria-hidden="true">${d}</svg>`;
}
