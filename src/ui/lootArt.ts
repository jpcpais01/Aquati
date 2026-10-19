// Little portraits of every kind of plunder for the hold, the wreck and the
// market: drawn as SVG so they stay crisp at any HUD size.

import type { LootId } from '../game/treasure';

type Stop = [number, string, number?];
const n = (v: number) => +v.toFixed(2);
const st = (s: Stop[]) =>
  s.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`).join('');
const rad = (id: string, s: Stop[], cx = 0.36, cy = 0.32, r = 0.75) =>
  `<radialGradient id="aql-${id}" cx="${cx}" cy="${cy}" r="${r}">${st(s)}</radialGradient>`;
const lin = (id: string, s: Stop[], x2 = 0, y2 = 1) =>
  `<linearGradient id="aql-${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${st(s)}</linearGradient>`;
const u = (id: string) => `url(#aql-${id})`;
const sk = (c: string, w: number) => `stroke="${c}" stroke-width="${w}"`;
const ol = (c: string, w: number) => `fill="none" ${sk(c, w)}`;
const RC = ' stroke-linecap="round"';
const LJ = ' stroke-linejoin="round"';

const shadow = (cx: number, cy: number, rx: number, ry = 2.2, o = 0.25) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000" opacity="${o}"/>`;
const shine = (cx: number, cy: number, r: number, o = 0.55) =>
  `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(r)}" ry="${n(r * 0.7)}" fill="#fff" opacity="${o}" transform="rotate(-30 ${n(cx)} ${n(cy)})"/>`;
const spark = (x: number, y: number, s: number, c = '#fff') =>
  `<path d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}z" fill="${c}"/>`;

// Palettes shared by several pieces.
const GOLD: Stop[] = [[0, '#fff7c8'], [0.35, '#ffd447'], [0.75, '#c98a12'], [1, '#7a4a06']];
const SILV: Stop[] = [[0, '#ffffff'], [0.4, '#d8dee4'], [0.8, '#8c98a4'], [1, '#56616c']];
const COPP: Stop[] = [[0, '#ffdcb4'], [0.4, '#e2894a'], [0.8, '#9c4a1c'], [1, '#5e2a0e']];
const RUBY: Stop[] = [[0, '#ffc0c8'], [0.4, '#f0283e'], [1, '#6a0412']];
const SAPH: Stop[] = [[0, '#d4ecff'], [0.4, '#2e7cf0'], [1, '#0a1a5a']];
const EMER: Stop[] = [[0, '#c8ffd8'], [0.4, '#22c26a'], [1, '#064a24']];
const FRAME: Stop[] = [[0, '#fff1aa'], [0.4, '#e2aa32'], [1, '#7a4a08']];

// Coins: lying flat (with a rim), stacked, or standing face-on.
const flat = (x: number, y: number, rx: number, ry: number, face: string, edge: string) =>
  `<path d="M${n(x - rx)} ${n(y)}v1.4a${rx} ${ry} 0 0 0 ${n(2 * rx)} 0v-1.4z" fill="${edge}"/><ellipse cx="${n(x)}" cy="${n(y)}" rx="${rx}" ry="${ry}" fill="${face}"/><ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(rx * 0.7)}" ry="${n(ry * 0.68)}" ${ol(edge, 0.45)} opacity="0.5"/>`;
const stack = (x: number, y: number, k: number, rx: number, ry: number, face: string, edge: string) =>
  Array.from({ length: k }, (_, i) => flat(x + (i % 2 ? 0.35 : 0), y - i * 1.8, rx, ry, face, edge)).join('');
const coin = (x: number, y: number, r: number, face: string, edge: string, stamp = '') =>
  `<circle cx="${x + 0.9}" cy="${y + 0.6}" r="${r}" fill="${edge}"/><circle cx="${x}" cy="${y}" r="${r}" fill="${face}"/><circle cx="${x}" cy="${y}" r="${n(r * 0.76)}" ${ol(edge, 0.6)} opacity="0.55"/>${stamp}${shine(x - r * 0.42, y - r * 0.44, r * 0.26)}`;
const cross = (x: number, y: number, s: number, c: string, w = 1.1) =>
  `<path d="M${x} ${n(y - s)}v${n(2 * s)}M${n(x - s)} ${y}h${n(2 * s)}M${n(x - s * 0.35)} ${n(y - s)}h${n(s * 0.7)}M${n(x - s * 0.35)} ${n(y + s)}h${n(s * 0.7)}M${n(x - s)} ${n(y - s * 0.35)}v${n(s * 0.7)}M${n(x + s)} ${n(y - s * 0.35)}v${n(s * 0.7)}" stroke="${c}" stroke-width="${w}"${RC} fill="none"/>`;
const dots = (x: number, y: number, r: number, k: number, d: number, c: string) =>
  Array.from({ length: k }, (_, i) => {
  const a = (i / k) * Math.PI * 2;
  return `<circle cx="${n(x + Math.cos(a) * r)}" cy="${n(y + Math.sin(a) * r)}" r="${d}" fill="${c}"/>`;
  }).join('');

// A faceted gem in profile, as a list of [polygon, colour] facets.
const facets = (f: [string, string][], line: string) =>
  f.map(([p, c]) => `<polygon points="${p}" fill="${c}" ${sk(line, 0.35)}${LJ}/>`).join('');

// Legendary pieces sit in a radiant halo with soft rays behind them.
const halo = (c: string, c2 = c) =>
  `<defs><radialGradient id="aql-halo" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff" stop-opacity="0.95"/><stop offset="0.3" stop-color="${c}" stop-opacity="0.75"/><stop offset="0.7" stop-color="${c2}" stop-opacity="0.22"/><stop offset="1" stop-color="${c2}" stop-opacity="0"/></radialGradient></defs><g fill="${c}" opacity="0.28">${Array.from({ length: 8 }, (_, i) => `<path d="M20 19L17.6 0.5h4.8z" transform="rotate(${i * 45 + 22.5} 20 19)"/>`).join('')}</g><circle cx="20" cy="19" r="19.5" fill="url(#aql-halo)"/>`;

let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const bean = (x: number, y: number, r: number) =>
  `<g transform="translate(${x} ${y}) rotate(${r})"><ellipse rx="2" ry="1.35" fill="url(#aql-cbn)"/><path d="M-1.5 0.25Q0 -0.75 1.5 0.25" ${ol('#1a0a02', 0.45)}/></g>`;

const leaf = (rot: number, L: number, W: number, g: string) =>
  `<g transform="translate(20 33.5) rotate(${rot})"><path d="M0 0C${-W} ${n(-L * 0.3)} ${n(-W * 0.9)} ${n(-L * 0.75)} 0 ${-L}C${n(W * 0.9)} ${n(-L * 0.75)} ${W} ${n(-L * 0.3)} 0 0z" fill="${u(g)}" ${sk('#4a2608', 0.45)}/><path d="M0 -1V${n(-L * 0.93)}M0 ${n(-L * 0.35)}l${n(-W * 0.55)} ${n(-L * 0.12)}M0 ${n(-L * 0.35)}l${n(W * 0.55)} ${n(-L * 0.12)}M0 ${n(-L * 0.6)}l${n(-W * 0.45)} ${n(-L * 0.1)}M0 ${n(-L * 0.6)}l${n(W * 0.45)} ${n(-L * 0.1)}" ${ol('#f6d48a', 0.5)} opacity="0.65"/></g>`;

const loaf = (x: number, tip: number, base: number, hw: number) => {
  const yp = tip + (base - tip) * 0.48;
  const hp = 0.8 + (hw - 0.8) * ((yp - tip) / (base - tip));
  let zig = '';
  for (let i = 1; i <= 8; i++) zig += ` ${n(x - hp + (2 * hp * i) / 8)} ${n(yp + (i % 2 ? 1 : 0))}`;
  return `<path d="M${x - 0.8} ${tip + 0.6}Q${x} ${tip - 0.7} ${x + 0.8} ${tip + 0.6}L${x + hw} ${base}Q${x} ${base + 2.6} ${x - hw} ${base}z" fill="url(#aql-sw)"/><path d="M${n(x - hp)} ${n(yp)}L${zig}L${x + hw} ${base}Q${x} ${base + 2.6} ${x - hw} ${base}z" fill="url(#aql-sp)"/><path d="M${n(x - hw * 0.86)} ${n(base - 4)}Q${x} ${n(base - 2.4)} ${n(x + hw * 0.86)} ${n(base - 4)}" ${ol('#f3e2b4', 0.7)}/>${shine(x - 0.9, tip + 4.5, 0.9, 0.7)}`;
};

const bottle = (x: number, rot: number) =>
  `<g transform="translate(${x} 33) rotate(${rot})"><path d="M-4.5 0V-13C-4.5 -16 -1.6 -16.6 -1.4 -19V-24H1.4V-19C1.6 -16.6 4.5 -16 4.5 -13V0Q0 1.4 -4.5 0z" fill="url(#aql-wg)" ${sk('#04140a', 0.4)}/><path d="M-2 -23.6V-27.4Q0 -28.4 2 -27.4V-23.6l-.4 1.8-.5-1-.5 1.6-.6-1.4-.5.8z" fill="url(#aql-wx)"/><rect x="-3.7" y="-10.6" width="7.4" height="5.4" rx="0.6" fill="#f2e2b8"/><path d="M-2.4 -8.8h4.8M-1.8 -7h3.6" ${sk('#8a2a1e', 0.55)}/><rect x="-3.5" y="-15" width="1.1" height="13" rx="0.55" fill="#fff" opacity="0.3"/><rect x="-1.1" y="-22.8" width="0.6" height="5" rx="0.3" fill="#fff" opacity="0.35"/></g>`;

const crystal = (x: number, y: number, rot: number, w: number, h: number, t: number) => {
  const a = -w / 2, b = -w / 4, c = w / 4, d = w / 2, m = n(w * 0.12);
  const P = (pts: number[]) => pts.map(n).join(' ');
  return `<g transform="translate(${x} ${y}) rotate(${rot})">${facets([
  [P([a, 0, a, -h, b, -h + m, b, m]), '#5fdc8e'],
  [P([b, m, b, -h + m, c, -h + m, c, m]), '#1fa456'],
  [P([c, m, c, -h + m, d, -h, d, 0]), '#0b6332'],
  [P([a, -h, 0, -h - t, b, -h + m]), '#b6ffd0'],
  [P([b, -h + m, 0, -h - t, c, -h + m]), '#4fd884'],
  [P([c, -h + m, 0, -h - t, d, -h]), '#178c48'],
  ], '#063d1e')}<path d="M${n(a + 0.5)} ${n(-h + 1)}V-1" ${sk('#fff', 0.6)} opacity="0.6"/></g>`;
};

const stick = (x: number, y: number, rot: number, len: number) =>
  `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-1.25" y="${-len}" width="2.5" height="${len}" rx="0.5" fill="url(#aql-cn)" ${sk('#5a2a0e', 0.35)}/><ellipse cy="${-len}" rx="1.25" ry="0.6" fill="#e8a878"/><path d="M-0.5 ${-len}a0.55 0.42 0 1 1 1 0" ${ol('#7a3a14', 0.35)}/></g>`;

const cube = (x: number, y: number, s: number) =>
  `<path d="M${x} ${y}h${s}l${s * 0.4} ${-s * 0.35}h${-s}z" fill="#5d6cf0"/><path d="M${x} ${y}h${s}v${s}h${-s}z" fill="#1f2b98"/><path d="M${x + s} ${y}l${s * 0.4} ${-s * 0.35}v${s}l${-s * 0.4} ${s * 0.35}z" fill="#0d1460"/><circle cx="${x + s * 0.3}" cy="${y + s * 0.4}" r="0.35" fill="#8a96ff" opacity="0.7"/><circle cx="${x + s * 0.7}" cy="${y + s * 0.7}" r="0.3" fill="#8a96ff" opacity="0.6"/>`;

// A tapering tube along a Catmull-Rom spline through pts: its outline, and its centre line.
const tube = (pts: number[][], w0: number, w1: number) => {
  const c: number[][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
  const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
  for (let s = 0; s < 6; s++) {
    const t = s / 6, t2 = t * t, t3 = t2 * t;
    c.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3)));
  }
  }
  c.push(pts[pts.length - 1]);
  const L: string[] = [], R: string[] = [], N: number[][] = [];
  c.forEach(([x, y], i) => {
  const [ax, ay] = c[Math.max(i - 1, 0)], [bx, by] = c[Math.min(i + 1, c.length - 1)];
  const d = Math.hypot(bx - ax, by - ay) || 1, w = (w0 + (w1 - w0) * (i / (c.length - 1))) / 2;
  const nx = -(by - ay) / d, ny = (bx - ax) / d;
  N.push([x, y, nx, ny, w]);
  L.push(`${n(x + nx * w)} ${n(y + ny * w)}`);
  R.push(`${n(x - nx * w)} ${n(y - ny * w)}`);
  });
  return { d: `M${L.join('L')}L${R.reverse().join('L')}z`, c: N };
};

const kraken = (() => {
  const { d, c } = tube([[0.6, 38.6], [8, 31.6], [17, 29.6], [25.4, 27.2], [30.8, 21], [31.8, 13.2], [29, 7.8], [24.8, 8.2], [23.8, 11.8], [26.4, 13.4]], 7.4, 0.9);
  const suck = c.filter((_, i) => i % 4 === 2 && i < 44).map(([x, y, nx, ny, w]) => {
  const s = (19.6 - x) * nx + (16.4 - y) * ny > 0 ? 1 : -1;
  return `<circle cx="${n(x + nx * w * 0.5 * s)}" cy="${n(y + ny * w * 0.5 * s)}" r="${n(Math.max(w * 0.3, 0.4))}"/>`;
  });
  return `<path d="${d}" fill="url(#aql-kt)" ${sk('#16041a', 0.5)}${LJ}/><g fill="#f4bcdc" ${sk('#6a2a5a', 0.3)}>${suck.join('')}</g>`;
})();

// Pearls threaded along a cubic bezier, spaced bead to bead.
const strand = (p: number[], r: number) => {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = p;
  const at = (t: number) => {
  const s = 1 - t;
  return [s * s * s * x0 + 3 * s * s * t * x1 + 3 * s * t * t * x2 + t * t * t * x3, s * s * s * y0 + 3 * s * s * t * y1 + 3 * s * t * t * y2 + t * t * t * y3];
  };
  let out = '', [px, py] = at(0), acc = 2 * r;
  for (let i = 1; i <= 200; i++) {
  const [qx, qy] = at(i / 200);
  acc += Math.hypot(qx - px, qy - py);
  [px, py] = [qx, qy];
  if (acc >= 2 * r * 0.98) {
    acc = 0;
    out += `<circle cx="${n(qx)}" cy="${n(qy)}" r="${r}" fill="url(#aql-pl)"/><circle cx="${n(qx - r * 0.35)}" cy="${n(qy - r * 0.38)}" r="${n(r * 0.3)}" fill="#fff" opacity="0.9"/>`;
  }
  }
  return out;
};

const ART: Record<LootId, string> = {
  // ---------------------------------------------------------------- common
  rum: `<defs>${lin('rb', [[0, '#dca060'], [0.45, '#9a5a2a'], [1, '#4a250e']])}${rad('rf', [[0, '#f4cc94'], [0.6, '#c48450'], [1, '#7a4620']], 0.42, 0.4, 0.7)}${lin('rh', [[0, '#9aa2ac'], [0.5, '#40464c'], [1, '#1c1f22']])}${rad('rd', [[0, '#ffe7a8'], [0.6, '#e8901a'], [1, '#8a3a06']], 0.35, 0.35, 0.8)}</defs>
  ${shadow(19, 34.6, 15, 2.4)}
  <path d="M4.5 13.6Q16 9 27 13v18q-11 4-22.5-.4q-1.8-8.5 0-17z" fill="${u('rb')}" ${sk('#3a1c08', 0.5)}/>
  <path d="M5.4 18.4q10.8-2 21.6-1.2M5 23.3h22M5.4 28.4q10.8 1.6 21.6 1.4" ${ol('#3a1c08', 0.5)} opacity="0.55"/>
  <path d="M8.6 11.9q3.8 10.1 0 20.6M19.4 10.9q3.8 11.1 0 22.4" ${ol(u('rh'), 2.1)}/>
  <ellipse cx="27" cy="22" rx="4.5" ry="9.1" fill="${u('rf')}" ${sk('#2a2e33', 1.7)}/>
  <ellipse cx="27" cy="22" rx="2.6" ry="5.6" ${ol('#8a5226', 0.5)}/>
  <path d="M26.4 21h6.4v2.4h-6.4z" fill="#7a4420"/><path d="M31.4 23h2v2.6h-2z" fill="#5e3216"/>
  <path d="M29.2 21v-3M27.6 17.8h3.2" ${sk('#5e3216', 1.2)}${RC}/>
  <path d="M26.6 21.4h6" ${sk('#c88a54', 0.5)}/>
  <path d="M32.4 27.2q1.5 2.1 1.5 2.9a1.5 1.5 0 0 1-3 0q0-.8 1.5-2.9z" fill="${u('rd')}"/>
  ${shine(12, 13.6, 2.2, 0.4)}${shine(25.6, 17, 1.2, 0.45)}`,

  pennies: `<defs>${rad('cp', COPP)}${rad('pp', [[0, '#cc9866'], [0.55, '#8a5a30'], [1, '#4a2a12']], 0.4, 0.35, 0.8)}</defs>
  ${shadow(20, 34.6, 16, 2.3)}
  <path d="M9.6 12.6c-5 4-6.6 11-4.6 15.6 2 4 12.4 4.4 15 .4 2.6-4.4 1-11.8-4-16z" fill="${u('pp')}" ${sk('#3a1e0a', 0.5)}/>
  <path d="M9.4 12.8c-2-2-1.6-4.6.6-4.8 1-.1 1.6 1 2.6.4 1-.6 2-.6 2.8.4 1.8-1 3.4.6 2.4 2.6-.5 1.1-1.3 1.6-2 1.8z" fill="#a6764a" ${sk('#3a1e0a', 0.5)}/>
  <path d="M9.2 12.7q3.4 1.6 6.8-.1" ${ol('#ecd092', 1.4)}${RC}/>
  <path d="M15.8 12.8q2.2 2.4 1.2 5.8M15.8 12.8q3.6 1 4.6 3.8" ${ol('#ecd092', 0.9)}${RC}/>
  ${shine(8.6, 18, 2, 0.3)}
  ${stack(27, 31, 5, 7, 2.6, u('cp'), '#6a2e10')}
  ${coin(13.4, 28.6, 5, u('cp'), '#6a2e10', `<circle cx="13.4" cy="28.6" r="1.4" ${ol('#7a3410', 0.8)}/>`)}
  ${flat(5.4, 33.4, 2.8, 1.1, u('cp'), '#6a2e10')}`,

  tobacco: `<defs>${lin('tl1', [[0, '#f2c066'], [0.5, '#c07a30'], [1, '#7a4618']], 1, 0)}${lin('tl3', [[0, '#ffd27a'], [0.5, '#d89a44'], [1, '#9a5a20']], 1, 0)}${lin('tl2', [[0, '#c98a40'], [0.5, '#8e5222'], [1, '#55300f']], 1, 0)}</defs>
  ${shadow(20, 35, 10, 2)}
  ${leaf(-42, 22, 6, 'tl2')}${leaf(42, 21, 6, 'tl2')}${leaf(-20, 27, 7, 'tl1')}${leaf(21, 26, 7, 'tl1')}${leaf(0, 30.5, 7.5, 'tl3')}
  <path d="M16 28.2q4 2 8 0" ${ol('#7a5a2a', 2.6)}/>
  <path d="M16 28.2q4 2 8 0" ${ol('#ecd49a', 1.8)}/>
  <path d="M23.6 28.6q2.6 1.4 3 4.4M23.6 28.6q3.4-.4 5 1.6" ${ol('#ecd49a', 0.9)}${RC}/>
  ${shine(17.4, 12, 1.6, 0.4)}`,

  coffee: `<defs>${rad('cb', [[0, '#ecd09a'], [0.6, '#c49a5c'], [1, '#7e5a2c']], 0.4, 0.3, 0.85)}${rad('cbn', [[0, '#a8683a'], [0.6, '#5a2e14'], [1, '#2a1206']], 0.35, 0.3, 0.8)}</defs>
  ${shadow(20, 34.6, 16, 2.3)}
  <path d="M9.4 17C7 23 7 30 10.4 33.2Q20 35 29.6 33.2C33 30 33 23 30.6 17z" fill="${u('cb')}" ${sk('#6a4a22', 0.5)}/>
  <path d="M12.4 20v12.6M16.2 19.6v14M20 19.6v14.6M23.8 19.6v14M27.6 20v12.6M9 23.4q11 1.6 22 0M8.8 29q11.2 1.6 22.4 0" ${sk('#8a6434', 0.35)} opacity="0.45" fill="none"/>
  <path d="M8.8 25.2q11.2 2 22.4 0M8.8 27q11.2 2 22.4 0" ${ol('#b03a24', 0.9)} opacity="0.75"/>
  <ellipse cx="20" cy="17" rx="11.2" ry="3.7" fill="#dcbc80" ${sk('#7a5a2c', 0.5)}/>
  <path d="M10.4 17.2Q11.6 9 20 8.4Q28.4 9 29.6 17.2Q20 20.6 10.4 17.2z" fill="#3a1c0a"/>
  ${[[13.4, 15.6, 20], [17.2, 12.6, -30], [22, 11.6, 40], [26, 14.4, -10], [20, 15.4, 10], [16, 16.8, -50], [24, 17, 60], [19.8, 9.6, 0], [12.4, 17.4, 30], [27.6, 17.4, -20], [15.6, 10.8, 70], [24.4, 10.6, -60]].map(([x, y, r]) => bean(x, y, r)).join('')}
  ${bean(31.6, 34.2, 25)}${bean(35, 32.6, -40)}${bean(6.4, 34, 60)}
  ${shine(19, 9.4, 1.2, 0.35)}${shine(11.8, 21, 1.6, 0.3)}`,

  calico: `<defs><pattern id="aql-cal" width="3.4" height="3.4" patternUnits="userSpaceOnUse" patternTransform="rotate(20)"><rect width="3.4" height="3.4" fill="#d9363e"/><circle cx="1" cy="1" r="0.78" fill="#fff1d6"/><circle cx="2.7" cy="2.7" r="0.42" fill="#ffd36a"/></pattern>${lin('cs', [[0, '#fff', 0.5], [0.3, '#fff', 0], [0.65, '#000', 0], [1, '#000', 0.5]])}${lin('cf', [[0, '#000', 0.4], [0.35, '#000', 0.05], [1, '#000', 0.2]])}</defs>
  ${shadow(21, 34.8, 15, 2.2)}
  <path d="M11 21.5H30q2.6 5.4 5.8 10.6Q25 34.6 13.4 33.4Q12.6 27 11 21.5z" fill="${u('cal')}"/>
  <path d="M11 21.5H30q2.6 5.4 5.8 10.6Q25 34.6 13.4 33.4Q12.6 27 11 21.5z" fill="${u('cf')}" ${sk('#7a1418', 0.4)}/>
  <path d="M13.4 33.4Q25 34.6 35.8 32.1" ${ol('#fff1d6', 0.9)}/>
  <path d="M8 9H31a3.4 6.5 0 0 1 0 13H8z" fill="${u('cal')}"/>
  <path d="M8 9H31a3.4 6.5 0 0 1 0 13H8z" fill="${u('cs')}" ${sk('#7a1418', 0.4)}/>
  <ellipse cx="8" cy="15.5" rx="3.4" ry="6.5" fill="#f6e2c6" ${sk('#7a1418', 0.4)}/>
  <ellipse cx="8" cy="15.5" rx="2.5" ry="4.9" ${ol('#d9363e', 0.7)}/>
  <ellipse cx="8" cy="15.5" rx="1.6" ry="3.2" ${ol('#d9363e', 0.7)}/>
  <ellipse cx="8" cy="15.5" rx="0.8" ry="1.6" fill="#7a4a22"/>
  ${shine(18, 11.4, 1.8, 0.4)}`,

  sugar: `<defs>${lin('sw', [[0, '#ffffff'], [0.55, '#eef0f6'], [1, '#aab2c4']], 1, 0)}${lin('sp', [[0, '#6a9aec'], [0.5, '#2a56b0'], [1, '#102664']], 1, 0)}</defs>
  ${shadow(20, 34.8, 14, 2.2)}
  ${loaf(14, 4.6, 31, 7)}${loaf(26, 10, 33.6, 6.2)}`,

  cheese: `<defs>${rad('ct', [[0, '#fff3a8'], [0.6, '#ffd23a'], [1, '#e09a12']], 0.45, 0.4, 0.8)}${lin('cw', [[0, '#ee5040'], [0.6, '#b81e22'], [1, '#7a0e12']])}</defs>
  ${shadow(20, 33.6, 16, 2.4)}
  <path d="M34 18L34 27A14 6 0 0 1 28 31.9L28 22.9A14 6 0 0 0 34 18Z" fill="${u('cw')}" ${sk('#5a0a0c', 0.4)}/>
  <path d="M6 18L6 27A14 6 0 0 0 12 31.9L12 22.9A14 6 0 0 1 6 18Z" fill="${u('cw')}" ${sk('#5a0a0c', 0.4)}/>
  <path d="M20 18L12 22.9V31.9L20 27z" fill="#f2cf52"/><path d="M20 18L28 22.9V31.9L20 27z" fill="#ffe788"/>
  <g fill="#d39a22"><ellipse cx="15" cy="25.2" rx="1.2" ry="0.9"/><ellipse cx="17.6" cy="28.4" rx="0.9" ry="0.7"/><ellipse cx="14" cy="29.6" rx="0.7" ry="0.6"/><ellipse cx="24.4" cy="24.8" rx="1.1" ry="0.9"/><ellipse cx="25.6" cy="29" rx="0.9" ry="0.7"/><ellipse cx="22.4" cy="28" rx="0.7" ry="0.6"/></g>
  <path d="M20 18L28 22.9A14 6 0 1 0 12 22.9Z" fill="${u('ct')}" ${sk('#b07208', 0.4)}/>
  <path d="M12 22.9L20 18 28 22.9" ${ol('#fff6c4', 0.5)}/>
  ${shine(13, 15.6, 2.2, 0.5)}`,

  conch: `<defs>${rad('kp', [[0, '#fff2f5'], [0.35, '#ffb6c8'], [0.75, '#f06c92'], [1, '#b83a62']], 0.45, 0.4, 0.75)}${lin('ks', [[0, '#fff8ec'], [0.6, '#f2d6b4'], [1, '#c4946a']], 1, 0.6)}</defs>
  ${shadow(20, 34.8, 14, 2.2)}
  <g transform="translate(18.6 20.4) rotate(-40) scale(0.9)" ${sk('#9a6a44', 0.55)}${LJ}>
    <path d="M-8 -6L-1 -21.4Q0 -22.4 1 -21.4L8 -6z" fill="${u('ks')}"/>
    <path d="M-6.4 -9.6Q0 -7.2 6.4 -9.6M-4.5 -13.6Q0 -11.8 4.5 -13.6M-2.7 -17.4Q0 -16.2 2.7 -17.4" fill="none" stroke="#b07a4a"/>
    <path d="M-12.4 -6C-14.4 3 -8.4 11 -1.6 17.6L0.4 22 2.6 17.4C9.2 10 13.4 3 12.4 -6 6 -10 -6 -10 -12.4 -6z" fill="${u('ks')}"/>
    <path d="M-12.6 0Q0 3.4 12.4 0M-10.2 7Q-2 9.8 8.6 7" ${ol('#c48650', 1.1)} opacity="0.6"/>
    ${[[-10.4, -6.4], [-5.6, -8.6], [-0.6, -9.2], [4.4, -8.8], [9.4, -7]].map(([x, y]) => `<path d="M${x - 1.6} ${y + 1}L${x} ${y - 2.8}L${x + 1.6} ${y + 1}z" fill="#fff4e2"/>`).join('')}
    <path d="M1.2 -8C11.4 -10.6 19.4 -2.4 16.2 7.2 14 13.4 7.2 17 1.6 19 4.8 10 4.4 1 1.2 -8z" fill="${u('kp')}" stroke="#a83a5e"/>
    <path d="M4.2 -4C9.2 -3.4 11.6 3 9.6 9.2 8.2 12.8 5.6 15.2 3.6 16.4" ${ol('#c83c68', 1.2)} opacity="0.6"${RC}/>
  </g>
  ${shine(25.6, 12.6, 1.9, 0.75)}${shine(9.2, 12.8, 1, 0.55)}`,

  // -------------------------------------------------------------- uncommon
  silver: `<defs>${rad('sv', SILV)}${rad('sb', [[0, '#d65a70'], [0.6, '#8a1e30'], [1, '#4a0a16']], 0.4, 0.3, 0.85)}</defs>
  ${shadow(20, 34.4, 16, 2.4)}
  <path d="M8.2 15.6C3 19.6 3 28.8 7.8 31.8 11.6 33.8 19.2 33.6 21.8 30.6 25.4 26.6 23.6 19 19.8 15.6z" fill="${u('sb')}" ${sk('#3a0610', 0.5)}/>
  <path d="M10.4 21q-1.4 5 .2 10.4M15.6 21.4q1 5-.4 10.6" ${ol('#5a0a1a', 0.5)} opacity="0.5"/>
  <ellipse cx="14" cy="15.4" rx="6.4" ry="2.3" fill="#2a0410"/>
  ${flat(11.4, 14.2, 2.6, 1, u('sv'), '#4c5560')}${flat(16.4, 14, 2.6, 1, u('sv'), '#4c5560')}${flat(13.8, 12.6, 2.6, 1, u('sv'), '#4c5560')}
  <path d="M7.4 15.2Q14 19 20.6 15.2L20.8 16.8Q14 21 7.2 16.8z" fill="#b8405a" ${sk('#3a0610', 0.45)}/>
  <path d="M8 18.8Q14 22 20.2 18.8" ${ol('#f0c86a', 1.3)}${RC}/>
  <path d="M17.4 20.4q1.2 2.6 0 5.2M17.4 20.4q2.6 1.6 3 4.4" ${ol('#f0c86a', 0.8)}${RC}/>
  ${shine(8.6, 22, 1.8, 0.3)}
  ${flat(33.4, 32.2, 3.4, 1.3, u('sv'), '#4c5560')}${flat(15.6, 33.2, 3.6, 1.4, u('sv'), '#4c5560')}
  ${coin(27.4, 25.6, 6.6, u('sv'), '#4c5560', cross(27.4, 25.6, 3, '#5a6672', 1.2))}`,

  spices: `<defs>${lin('bw', [[0, '#c27e42'], [1, '#6a3a16']])}${lin('bl', [[0, '#4a2610'], [1, '#8a5228']])}${rad('s1', [[0, '#ff9468'], [0.6, '#d8341e'], [1, '#8a1608']], 0.4, 0.3, 0.8)}${rad('s2', [[0, '#ffe68a'], [0.6, '#f5a020'], [1, '#b0600a']], 0.4, 0.3, 0.8)}${rad('s3', [[0, '#cc9058'], [0.6, '#8a5428'], [1, '#4e2a10']], 0.4, 0.3, 0.8)}${lin('cn', [[0, '#e0925a'], [0.5, '#a8582a'], [1, '#6a3012']], 1, 0)}</defs>
  ${shadow(20, 35, 16, 2.2)}
  <path d="M8.6 15L10 4.4H30L31.4 15z" fill="${u('bl')}" ${sk('#2a1406', 0.6)}/>
  <path d="M11.4 6.4H28.6L29.6 13.4H10.4z" ${ol('#c88a54', 0.5)} opacity="0.6"/>
  <path d="M5.4 21.6L8.6 15H31.4L34.6 21.6z" fill="#2a1406"/>
  <path d="M6 21.8Q6.9 19.0 8.4 18.2Q9.4 17.2 10.5 17.4Q11.7 17.3 12.4 18.2Q13.9 18.8 14.6 21.8z" fill="${u('s1')}"/><path d="M14.4 21.8Q15.5 18.2 17.5 17.4Q18.9 16.4 20.2 16.6Q21.8 16.5 22.7 17.4Q24.7 18.0 25.6 21.8z" fill="${u('s2')}"/><path d="M25.4 21.8Q26.3 19.0 27.8 18.2Q28.8 17.2 29.9 17.4Q31.1 17.3 31.8 18.2Q33.3 18.8 34 21.8z" fill="${u('s3')}"/>
  <g fill="#3a1206" opacity="0.45">${Array.from({ length: 26 }, () => `<circle cx="${n(7 + rnd() * 26)}" cy="${n(18.6 + rnd() * 3)}" r="0.32"/>`).join('')}</g><g fill="#fff" opacity="0.5">${Array.from({ length: 12 }, () => `<circle cx="${n(7.4 + rnd() * 25)}" cy="${n(18.4 + rnd() * 2.6)}" r="0.28"/>`).join('')}</g>
  ${stick(28.4, 21, 18, 14)}${stick(31, 21.4, 30, 12)}
  <path d="M15.2 15L14.2 21.6M24.8 15L25.8 21.6" ${sk('#6a3a16', 0.8)}/>
  <rect x="5.4" y="21.6" width="29.2" height="12" rx="0.8" fill="${u('bw')}" ${sk('#2a1406', 0.6)}/>
  <path d="M6.4 25.4h27.2M6.4 29.6h27.2" ${sk('#4a2408', 0.4)} opacity="0.5"/>
  <path d="M5.6 21.8h28.8" ${sk('#eab078', 0.8)}/>
  <g fill="#e8b84a" ${sk('#7a5212', 0.3)}><path d="M5.4 21.6h3v1.2h-1.8v1.8h-1.2z"/><path d="M34.6 21.6h-3v1.2h1.8v1.8h1.2z"/><path d="M5.4 33.6h3v-1.2h-1.8v-1.8h-1.2z"/><path d="M34.6 33.6h-3v-1.2h1.8v-1.8h1.2z"/><rect x="18.4" y="21.4" width="3.2" height="4.6" rx="0.6"/></g>
  <circle cx="20" cy="23.4" r="0.6" fill="#3a2006"/><path d="M20 23.6v1.4" ${sk('#3a2006', 0.5)}/>
  `,

  wine: `<defs>${lin('wg', [[0, '#62a874'], [0.25, '#2c6a3c'], [0.7, '#123a20'], [1, '#071a0e']], 1, 0)}${lin('wx', [[0, '#ff7060'], [0.5, '#c41e26'], [1, '#6a0810']], 1, 0)}</defs>
  ${shadow(20, 35, 15, 2.2)}
  ${bottle(14, -12)}${bottle(25.6, 11)}
  <path d="M4.4 33.6Q6 27.4 12 28.2 20 26 28 28.2 34 27.4 35.6 33.6Q20 36.4 4.4 33.6z" fill="#c99a3a"/>
  <g${RC} stroke-width="0.7">${Array.from({ length: 22 }, () => {
    const x = 6 + rnd() * 28, y = 28 + rnd() * 5.5, a = (rnd() - 0.5) * 1.4, l = 3 + rnd() * 4;
    return `<path d="M${n(x)} ${n(y)}l${n(Math.cos(a) * l)} ${n(Math.sin(a) * l)}" stroke="${['#f6d670', '#d9a83a', '#fff0a8', '#b8862a'][Math.floor(rnd() * 4)]}"/>`;
  }).join('')}</g>`,

  silk: `<defs>${lin('sk', [[0, '#7cf2e4'], [0.3, '#1fb0b8'], [0.65, '#5a3aa8'], [1, '#2a1260']])}${lin('sh', [[0, '#fff', 0], [0.26, '#fff', 0.8], [0.42, '#fff', 0], [1, '#fff', 0]])}${lin('sr', [[0, '#3ad6d0'], [0.45, '#7a5ae0'], [1, '#2a1070']], 1, 0.6)}</defs>
  ${shadow(21, 34.8, 15, 2.2)}
  <path d="M11 18.6H30C34.6 21.6 30.4 24.8 33.8 28 35.6 29.8 36.4 31.6 35.4 33.6 27 35.6 19.6 34.8 12.6 33.6 15.6 30.2 11.4 27.4 13.4 23.8 14.2 22 12 20 11 18.6z" fill="${u('sr')}" ${sk('#20105a', 0.45)}/>
  <path d="M16.4 20.6C19.6 24 15.2 27.4 18.6 31M22.4 20.6C26.4 24 21.8 27.6 25.6 32M28 20.4C31.6 23.6 28 27 31.6 30.6" ${ol('#2a1070', 0.9)} opacity="0.4"${RC}/>
  <path d="M17.6 20.6C20.8 24 16.4 27.4 19.8 31M23.6 20.6C27.6 24 23 27.6 26.8 32M29.2 20.4C32.4 23.4 29.4 26.4 32.6 30" ${ol('#fff', 0.8)} opacity="0.65"${RC}/>
  <path d="M8 7H30a3.4 6.2 0 0 1 0 12.4H8z" fill="${u('sk')}"/>
  <path d="M8 7H30a3.4 6.2 0 0 1 0 12.4H8z" fill="${u('sh')}" ${sk('#20105a', 0.4)}/>
  <ellipse cx="8" cy="13.2" rx="3.4" ry="6.2" fill="#a4ece8" ${sk('#20105a', 0.4)}/>
  <ellipse cx="8" cy="13.2" rx="2.5" ry="4.6" ${ol('#6a44c0', 0.7)}/>
  <ellipse cx="8" cy="13.2" rx="1.6" ry="3" ${ol('#1fb0b8', 0.7)}/>
  <ellipse cx="8" cy="13.2" rx="0.8" ry="1.5" fill="#7a4a22"/>
  ${spark(30, 4.6, 1.8)}${spark(36, 24, 1.3)}`,

  scrimshaw: `<defs>${lin('iv', [[0, '#fffbf0'], [0.5, '#f0e2c0'], [1, '#bc9c6c']], 0.3, 1)}</defs>
  ${shadow(20, 34.6, 15, 2.1)}
  <path d="M3.6 25C8.6 35.6 28.4 35.8 36.4 9.4 36.8 8.2 37.6 8.4 37.4 9.8 35.4 19.6 28.4 23.6 20.4 23.6 13.6 23.6 9 21 6.8 15z" fill="${u('iv')}" ${sk('#8a6a3e', 0.55)}${LJ}/>
  <ellipse cx="5.2" cy="20" rx="1.8" ry="5.1" fill="#d6be8e" ${sk('#8a6a3e', 0.5)} transform="rotate(-17 5.2 20)"/>
  <ellipse cx="5.2" cy="20" rx="0.9" ry="2.8" fill="#b89a6a" transform="rotate(-17 5.2 20)"/>
  <g ${sk('#2e1e10', 0.5)}${RC}${LJ}>
    <path d="M11.6 29.4q6.4 1.6 12.8-.6l-1.8 2.2q-4.8 1.4-9.2.4z" fill="#2e1e10"/>
    <path d="M15.6 29.6V23.2M20.4 29.2V24.2M15.6 23.2l1.8.6-1.8.6" fill="none"/>
    <path d="M13.4 24.4h4.4l-.4 2h-3.6zM13.2 26.8h4.8l-.4 2h-4zM18.4 25h4l-.4 1.8h-3.2zM18.2 27.2h4.4l-.4 1.6h-3.6zM20.8 24.6l4 4h-4z" fill="#2e1e10" fill-opacity="0.22"/>
    <path d="M9.6 32.2q1.4-.8 2.8 0t2.8 0 2.8 0 2.8 0 2.8-.4" fill="none"/>
  </g>
  <path d="M28.6 20.8C32.6 17.6 35 13.6 36.4 10.6" ${ol('#fff', 0.9)} opacity="0.75"${RC}/>
  ${shine(9.6, 25.6, 1, 0.5)}`,

  sextant: `<defs>${rad('br', [[0, '#fff3c0'], [0.45, '#deb04e'], [1, '#7c5416']], 0.4, 0.3, 0.9)}${lin('bt', [[0, '#fff0b0'], [0.4, '#d6a440'], [1, '#6a4410']])}</defs>
  ${shadow(20, 35, 14, 2)}
  <path d="M20 6.4L9.2 27.4M20 6.4L30.8 27.4" ${sk('#6a4410', 3.4)}${RC}/>
  <path d="M20 6.4L9.2 27.4M20 6.4L30.8 27.4" ${sk(u('bt'), 2.2)}${RC}/>
  <path d="M8 30.2A24 24 0 0 0 32 30.2" ${ol('#6a4410', 4.6)}${RC}/>
  <path d="M8 30.2A24 24 0 0 0 32 30.2" ${ol('#f0cc6a', 3.2)}${RC}/>
  <g ${sk('#6a4410', 0.4)}>${Array.from({ length: 13 }, (_, i) => {
    const a = ((60 + i * 5) * Math.PI) / 180, r1 = 22.6, r2 = i % 2 ? 23.6 : 24.4;
    return `<path d="M${n(20 + Math.cos(a) * r1)} ${n(6.4 + Math.sin(a) * r1 + 0.4)}L${n(20 + Math.cos(a) * r2)} ${n(6.4 + Math.sin(a) * r2 + 0.4)}"/>`;
  }).join('')}</g>
  <path d="M20 6.4L15 31" ${sk('#4a2e08', 2.2)}${RC}/><path d="M20 6.4L15 31" ${sk('#fff0b0', 1)}${RC}/>
  <rect x="13.6" y="29.8" width="3.2" height="2.6" rx="0.6" fill="${u('br')}" ${sk('#4a2e08', 0.4)}/>
  <rect x="10.6" y="13.4" width="17" height="3.4" rx="1.2" fill="${u('bt')}" ${sk('#4a2e08', 0.5)}/>
  <rect x="8.8" y="12.8" width="2.4" height="4.6" rx="0.6" fill="#8a6018" ${sk('#4a2e08', 0.4)}/>
  <path d="M12.6 14.2h13" ${sk('#fff', 0.6)} opacity="0.7"/>
  <rect x="17.4" y="3.2" width="4.6" height="3.2" rx="0.4" fill="#9fd8f0" ${sk('#4a2e08', 0.5)} transform="rotate(-20 19.7 4.8)"/>
  <rect x="11.6" y="19.4" width="3.2" height="2.8" rx="0.4" fill="#9fd8f0" ${sk('#4a2e08', 0.5)}/>
  <circle cx="20" cy="6.4" r="1.7" fill="${u('br')}" ${sk('#4a2e08', 0.5)}/>
  ${shine(18.6, 4.2, 0.9, 0.8)}${shine(12.4, 20.2, 0.7, 0.8)}`,

  indigo: `<defs>${lin('ig', [[0, '#e6f4fa', 0.7], [0.4, '#a6cce0', 0.25], [1, '#5a8aa8', 0.55]], 1, 0)}${lin('id', [[0, '#5a6cf0'], [0.5, '#1e2a9a'], [1, '#0a0e48']], 1, 0)}${rad('ck', [[0, '#e8b47a'], [1, '#8a5228']], 0.4, 0.3, 0.8)}</defs>
  ${shadow(20, 34.8, 16, 2.2)}
  <path d="M8.6 15.4Q8.4 12.6 11.6 12.2V9.6H19.4V12.2Q22.6 12.6 22.4 15.4V31.4Q22.4 33.6 20 33.6H11Q8.6 33.6 8.6 31.4z" fill="#cfe4ee" opacity="0.35"/>
  <path d="M9.4 18.6Q15.5 20 21.6 18.6V31.2Q21.6 32.8 19.8 32.8H11.2Q9.4 32.8 9.4 31.2z" fill="${u('id')}"/>
  <path d="M9.4 18.6Q15.5 20 21.6 18.6Q15.5 17.4 9.4 18.6z" fill="#6a7af4"/>
  <path d="M8.6 15.4Q8.4 12.6 11.6 12.2V9.6H19.4V12.2Q22.6 12.6 22.4 15.4V31.4Q22.4 33.6 20 33.6H11Q8.6 33.6 8.6 31.4z" fill="${u('ig')}" ${sk('#3a5a72', 0.55)}/>
  <path d="M11 5.6H20L19.4 10.2H11.6z" fill="${u('ck')}" ${sk('#5a3214', 0.5)}/>
  <path d="M11.2 11.4Q15.5 12.6 19.8 11.4" ${ol('#e8d09a', 1)}/>
  <rect x="10.6" y="22.4" width="9.8" height="5.4" rx="0.5" fill="#f2e4c0" ${sk('#8a6a3a', 0.4)}/>
  <path d="M12.2 24.2h6.6M12.8 26h5.4" ${sk('#2a3a9a', 0.6)}/>
  <rect x="9.8" y="14.4" width="1.2" height="16" rx="0.6" fill="#fff" opacity="0.55"/>
  ${cube(24.4, 25.6, 6.6)}${cube(27, 21.2, 4.6)}`,

  // ------------------------------------------------------------------ rare
  doubloons: `<defs>${rad('gd', GOLD)}</defs>
  ${shadow(20, 34.6, 16, 2.4)}
  ${stack(12.6, 31, 6, 7, 2.6, u('gd'), '#7a4a06')}
  ${coin(26, 23.4, 8.4, u('gd'), '#7a4a06', `${cross(26, 23.4, 3.6, '#9a6408', 1.3)}${dots(26, 23.4, 7, 16, 0.38, '#a8700c')}`)}
  ${flat(33.4, 33.2, 3.8, 1.5, u('gd'), '#7a4a06')}
  ${spark(32.6, 9.6, 2.8)}${spark(7, 13.6, 1.8)}${spark(20.6, 30.4, 1.3)}`,

  pearls: `<defs>${rad('pl', [[0, '#ffffff'], [0.5, '#f6f0e8'], [0.85, '#cdc4d6'], [1, '#8a8496']], 0.35, 0.3, 0.8)}${rad('pg', GOLD)}</defs>
  ${shadow(20, 35.2, 12, 2)}
  ${strand([20, 6.2, 9, 11.4, 10, 27, 20, 27], 1.75)}${strand([20, 6.2, 31, 11.4, 30, 27, 20, 27], 1.75)}
  ${strand([20, 6.2, 3.4, 11.6, 5.2, 33.4, 20, 33.4], 2.25)}${strand([20, 6.2, 36.6, 11.6, 34.8, 33.4, 20, 33.4], 2.25)}
  <path d="M17.4 5.2Q20 3 22.6 5.2L21.4 8.4H18.6z" fill="${u('pg')}" ${sk('#7a4a06', 0.5)}/>
  <circle cx="20" cy="2.6" r="1.4" ${ol('#c98a12', 0.8)}/>
  ${spark(33, 18, 1.8)}`,

  emeralds: `<defs>${rad('er', [[0, '#a8a090'], [0.6, '#6a6252'], [1, '#3a342a']], 0.4, 0.2, 0.9)}</defs>
  ${shadow(20, 34.6, 15, 2.2)}
  ${crystal(12, 31, -28, 6.4, 11.6, 3.6)}${crystal(28.4, 31, 26, 6.8, 12.6, 3.8)}${crystal(20, 30.6, 0, 8.6, 16.4, 4.6)}
  ${crystal(15.6, 32.4, -10, 4.4, 5.4, 2.4)}${crystal(25.4, 32.6, 14, 4.2, 5, 2.2)}
  <path d="M5 33.2Q7 29.4 11.6 30.4 15.6 28.6 20 30 25 28.6 28.6 30.4 33.6 29.4 35.4 33.2Q20 36.6 5 33.2z" fill="${u('er')}" ${sk('#2a241c', 0.5)}/>
  ${spark(26, 7.6, 2.4)}${spark(8.4, 17, 1.5)}`,

  dagger: `<defs>${lin('db', [[0, '#ffffff'], [0.48, '#cfd8e0'], [0.52, '#8a96a4'], [1, '#56626e']], 1, 0)}${rad('dg', GOLD)}${rad('dr', RUBY, 0.35, 0.3, 0.8)}${rad('dbl', SAPH, 0.35, 0.3, 0.8)}</defs>
  ${shadow(20, 35.4, 14, 1.9)}
  <g transform="translate(20.4 19.4) rotate(45) scale(1.14)">
    <path d="M0 -17.6L3.1 -4V2.2H-3.1V-4z" fill="${u('db')}" ${sk('#3a4450', 0.45)}${LJ}/>
    <path d="M0 -14.4V1" ${sk('#5a6672', 0.5)} opacity="0.6"/>
    <rect x="-1.7" y="4" width="3.4" height="7.6" rx="0.8" fill="#6a1a1e" ${sk('#2a0608', 0.4)}/>
    <path d="M-1.7 5.2l3.4 1.4M-1.7 7.2l3.4 1.4M-1.7 9.2l3.4 1.4" ${sk('#f0c050', 0.55)}/>
    <path d="M-8.4 1.4Q-9.6 3.2-7.6 4.2Q-4 3.4 0 4.6 4 3.4 7.6 4.2Q9.6 3.2 8.4 1.4Q4 2.8 0 1.8-4 2.8-8.4 1.4z" fill="${u('dg')}" ${sk('#6a3a04', 0.45)}/>
    <circle cx="-8.4" cy="2.8" r="1" fill="${u('dbl')}"/><circle cx="8.4" cy="2.8" r="1" fill="${u('dbl')}"/>
    <ellipse cx="0" cy="3.2" rx="1.6" ry="1.9" fill="${u('dr')}" ${sk('#6a3a04', 0.4)}/>
    <circle cx="0" cy="13.6" r="2.7" fill="${u('dg')}" ${sk('#6a3a04', 0.45)}/>
    <circle cx="0" cy="13.6" r="1.4" fill="${u('dbl')}"/>
    <path d="M-1.3 -12V-1" ${sk('#fff', 0.7)} opacity="0.8"${RC}/>
  </g>
  ${spark(30, 7, 2)}`,

  portrait: `<defs>${lin('fg', FRAME, 1, 1)}${rad('pb', [[0, '#eeb258'], [0.6, '#a8601e'], [1, '#4a2208']], 0.5, 0.35, 0.75)}${lin('dr', [[0, '#3c2c5c'], [1, '#100820']])}<clipPath id="aql-pc"><ellipse cx="20" cy="19.6" rx="8.4" ry="11.8"/></clipPath></defs>
  ${shadow(20, 36.6, 12, 1.8)}
  <rect x="7" y="3" width="26" height="33" rx="1.6" fill="${u('fg')}" ${sk('#5a3404', 0.6)}/>
  <rect x="9.4" y="5.4" width="21.2" height="28.2" rx="0.8" fill="#8a5a12"/>
  <ellipse cx="20" cy="19.6" rx="9.4" ry="12.8" fill="${u('fg')}"/>
  <g clip-path="${u('pc')}">
    <rect x="10" y="7" width="20" height="26" fill="${u('pb')}"/>
    <ellipse cx="20" cy="16.2" rx="4.6" ry="5.2" fill="#3a2010"/>
    <rect x="18.8" y="19" width="2.4" height="5" fill="#eac4a0"/>
    <path d="M10 33C11 26.4 15 24.4 20 24.8 25 24.4 29 26.4 30 33z" fill="${u('dr')}"/>
    <path d="M16.2 24.7Q20 29 23.8 24.7Q20 23.4 16.2 24.7z" fill="#f2d0b0"/>
    <ellipse cx="20" cy="17" rx="3" ry="3.7" fill="#f6d8bc"/>
    <path d="M16.8 16.4Q17.2 12.4 20 12.4 22.8 12.4 23.2 16.4 22.4 14 20 13.8 17.6 14 16.8 16.4z" fill="#3a2010"/>
    <circle cx="20" cy="11.4" r="2.2" fill="#3a2010"/>
    <circle cx="18.6" cy="18.6" r="0.6" fill="#f0a090" opacity="0.6"/><circle cx="21.4" cy="18.6" r="0.6" fill="#f0a090" opacity="0.6"/>
    <path d="M17.6 25.6Q20 27.2 22.4 25.6" ${sk('#fff', 0.7)} stroke-dasharray="0.5 0.5" fill="none"/>
  </g>
  <ellipse cx="20" cy="19.6" rx="8.4" ry="11.8" ${ol('#5a3404', 0.5)}/>
  <g fill="#fff3b8" ${sk('#7a4a08', 0.3)}><circle cx="8.8" cy="4.8" r="1.2"/><circle cx="31.2" cy="4.8" r="1.2"/><circle cx="8.8" cy="34.2" r="1.2"/><circle cx="31.2" cy="34.2" r="1.2"/></g>
  ${shine(11.6, 8.6, 1.6, 0.55)}`,

  saffron: `<defs>${lin('sg', [[0, '#eaf6f8', 0.6], [0.35, '#c0dce4', 0.05], [1, '#7aa0b0', 0.35]], 1, 0)}${rad('sl', GOLD)}${rad('cr', [[0, '#e8c8ff'], [0.6, '#9a5ad8'], [1, '#4a1a8a']], 0.4, 0.3, 0.9)}</defs>
  ${shadow(19, 34.8, 16, 2.2)}
  <rect x="5.6" y="14.6" width="16" height="19" rx="3.4" fill="#d8eaf0" opacity="0.35"/>
  <path d="M6.6 22Q13.6 20.6 20.6 22V30.6Q20.6 32.8 18.4 32.8H8.8Q6.6 32.8 6.6 30.6z" fill="#b8280e"/>
  <g stroke-width="0.7" fill="none"${RC}>${Array.from({ length: 16 }, () => {
    const x = 7.6 + rnd() * 11.6, y = 22 + rnd() * 9.6, a = rnd() * Math.PI;
    return `<path d="M${n(x)} ${n(y)}q${n(Math.cos(a) * 1.4)} ${n(-1)} ${n(Math.cos(a) * 2.8)} ${n(Math.sin(a) * 1.6)}" stroke="${rnd() > 0.5 ? '#ff8c2a' : '#e8361a'}"/>`;
  }).join('')}</g>
  <rect x="5.6" y="14.6" width="16" height="19" rx="3.4" fill="${u('sg')}" ${sk('#4a6a78', 0.55)}/>
  <rect x="5" y="10.6" width="17.2" height="4.6" rx="1.2" fill="${u('sl')}" ${sk('#6a3a04', 0.5)}/>
  <path d="M6 12.4h15.2" ${sk('#7a4a06', 0.4)} opacity="0.6"/>
  <rect x="7" y="16.6" width="1.3" height="14" rx="0.65" fill="#fff" opacity="0.6"/>
  <path d="M30 34V24" ${sk('#3a8a3a', 1.1)}/><path d="M30 33Q27 28 26.4 25M30 33Q33.4 29 34 26" ${ol('#5ab04a', 0.8)}/>
  <path d="M30 24.8C26 24.6 25.2 19.6 26.6 15.6 28 17.6 29 15 30 13 31 15 32 17.6 33.4 15.6 34.8 19.6 34 24.6 30 24.8z" fill="${u('cr')}" ${sk('#3a1270', 0.45)}/>
  <path d="M30 22.4L28.4 13.4M30 22.4L30.6 12.4M30 22.4L32 13.2" ${sk('#e8381a', 0.8)}${RC}/>
  <path d="M24.2 33.6q2-1.6 4 .2M33 34.4q1.6-1.4 3.4-.4" ${ol('#d8361a', 0.7)}${RC}/>
  ${shine(27.6, 17.6, 0.9, 0.55)}${shine(9.4, 12, 1.2, 0.6)}`,

  // ------------------------------------------------------------------ epic
  ruby: `<defs>${rad('rg', [[0, '#ff4a6a', 0.6], [0.6, '#ff2a4a', 0.18], [1, '#ff2a4a', 0]], 0.5, 0.5, 0.5)}</defs>
  <circle cx="20" cy="19" r="19" fill="${u('rg')}"/>
  ${shadow(20, 36.2, 10, 1.6, 0.3)}
  ${facets([
    ['4,15 12,8 12,15', '#ff8a9c'], ['12,8 17.3,8 12,15', '#ff5c76'], ['17.3,8 12,15 20,15', '#e8324e'], ['17.3,8 22.7,8 20,15', '#ff6f86'],
    ['22.7,8 20,15 28,15', '#d42240'], ['22.7,8 28,8 28,15', '#c41634'], ['28,8 36,15 28,15', '#a80c26'],
    ['4,15 12,15 20,34.6', '#e02a48'], ['12,15 20,15 20,34.6', '#b0102c'], ['20,15 28,15 20,34.6', '#8a0820'], ['28,15 36,15 20,34.6', '#5a0414'],
  ], '#ff9aaa')}
  <polygon points="4,15 12,8 28,8 36,15 20,34.6" ${ol('#4a0210', 0.7)}${LJ}/>
  <polygon points="7.4,14.2 12.4,9.8 12.4,14.2" fill="#fff" opacity="0.65"/>
  <path d="M9 17.6L16.4 28" ${sk('#fff', 0.8)} opacity="0.45"${RC}/>
  ${spark(32.6, 5.4, 2.6)}${spark(5.6, 25, 1.6)}${spark(26, 22, 1.2)}`,

  tiara: `<defs>${rad('ts', SILV, 0.4, 0.2, 0.9)}${lin('tg', [[0, '#fff3b4'], [0.5, '#e8b030'], [1, '#8a5a08']])}${rad('tb', [[0, '#dcefff'], [0.35, '#5aa2ff'], [0.75, '#1a48c8'], [1, '#0a1a5a']], 0.4, 0.35, 0.75)}</defs>
  ${shadow(20, 35.6, 14, 2)}
  <path d="M5 27.4Q7.6 23 9.8 17.6Q11.2 22 13.6 23.2Q15.2 16 16.6 11.4Q18 15.6 18.6 17.4Q16.6 9.6 20 4.6Q23.4 9.6 21.4 17.4Q22 15.6 23.4 11.4Q24.8 16 26.4 23.2Q28.8 22 30.2 17.6Q32.4 23 35 27.4Q20 34 5 27.4z" fill="${u('ts')}" ${sk('#4a5562', 0.55)}${LJ}/>
  <path d="M8.6 25.6Q11 21.6 13.8 25.6M15 25.6Q16.4 19 18 25.6M22 25.6Q23.6 19 25 25.6M26.2 25.6Q29 21.6 31.4 25.6" ${ol('#8a96a4', 0.6)}/>
  <path d="M4.6 27Q20 34.4 35.4 27L35.6 29.8Q20 37.6 4.4 29.8z" fill="${u('tg')}" ${sk('#6a4206', 0.5)}/>
  <path d="M20 8.6Q22.6 11.6 20 16.2Q17.4 11.6 20 8.6z" fill="${u('tb')}" ${sk('#0a1a5a', 0.4)}/>
  <circle cx="16.6" cy="17.6" r="1.7" fill="${u('tb')}" ${sk('#0a1a5a', 0.35)}/><circle cx="23.4" cy="17.6" r="1.7" fill="${u('tb')}" ${sk('#0a1a5a', 0.35)}/>
  <circle cx="10.4" cy="22.4" r="1.3" fill="${u('tb')}"/><circle cx="29.6" cy="22.4" r="1.3" fill="${u('tb')}"/>
  <ellipse cx="20" cy="31.4" rx="2" ry="1.4" fill="${u('tb')}" ${sk('#0a1a5a', 0.35)}/>
  <g fill="#fff"><circle cx="20" cy="4.6" r="1"/><circle cx="16.6" cy="11.4" r="0.8"/><circle cx="23.4" cy="11.4" r="0.8"/><circle cx="9.8" cy="17.6" r="0.75"/><circle cx="30.2" cy="17.6" r="0.75"/><circle cx="13.6" cy="30.4" r="0.6"/><circle cx="26.4" cy="30.4" r="0.6"/><circle cx="8.4" cy="28.8" r="0.5"/><circle cx="31.6" cy="28.8" r="0.5"/></g>
  ${shine(19.2, 11, 0.8, 0.85)}${spark(33, 9.6, 2)}${spark(6.4, 11.6, 1.4)}`,

  chalice: `<defs>${rad('cg', GOLD, 0.32, 0.3, 0.85)}${lin('ci', [[0, '#6a3e04'], [1, '#e0a838']])}${rad('cr', RUBY, 0.35, 0.3, 0.8)}${rad('ce', EMER, 0.35, 0.3, 0.8)}${rad('cs', SAPH, 0.35, 0.3, 0.8)}</defs>
  ${shadow(20, 35, 11, 2)}
  <path d="M11.4 33.4Q11.8 30.2 18 29.4H22Q28.2 30.2 28.6 33.4Q20 35.8 11.4 33.4z" fill="${u('cg')}" ${sk('#6a3e04', 0.5)}/>
  <path d="M18.2 21.6H21.8L21 29.8H19z" fill="${u('cg')}" ${sk('#6a3e04', 0.5)}/>
  <ellipse cx="20" cy="25.6" rx="3" ry="1.9" fill="${u('cg')}" ${sk('#6a3e04', 0.5)}/>
  <path d="M7.4 7.4H32.6C32.6 17 27.6 22.6 20 22.6S7.4 17 7.4 7.4z" fill="${u('cg')}" ${sk('#6a3e04', 0.55)}/>
  <ellipse cx="20" cy="7.4" rx="12.6" ry="2.7" fill="${u('ci')}" ${sk('#fff1a8', 0.7)}/>
  <path d="M8 11.8Q20 15.4 32 11.8M10 17.4Q20 20 30 17.4" ${ol('#9a6408', 0.6)}/>
  <ellipse cx="20" cy="14.6" rx="2.3" ry="2.7" fill="${u('cr')}" ${sk('#6a3e04', 0.4)}/>
  <circle cx="13.2" cy="13.6" r="1.6" fill="${u('ce')}" ${sk('#6a3e04', 0.35)}/><circle cx="26.8" cy="13.6" r="1.6" fill="${u('cs')}" ${sk('#6a3e04', 0.35)}/>
  <g fill="#fff8e0"><circle cx="16.4" cy="14.6" r="0.55"/><circle cx="23.6" cy="14.6" r="0.55"/><circle cx="10.2" cy="12.8" r="0.5"/><circle cx="29.8" cy="12.8" r="0.5"/></g>
  ${shine(11.6, 14, 1.8, 0.6)}${spark(33.4, 22, 2)}${spark(6.6, 26, 1.4)}`,

  seascape: `<defs>${lin('fg', FRAME, 1, 1)}${lin('sky', [[0, '#232c40'], [0.6, '#56667a'], [1, '#93a2a6']])}${lin('sea', [[0, '#2e7478'], [1, '#0c2a30']])}<clipPath id="aql-sc"><rect x="6.6" y="10.6" width="26.8" height="18.8"/></clipPath></defs>
  ${shadow(20, 35.4, 15, 1.8)}
  <rect x="3" y="7" width="34" height="26" rx="1.6" fill="${u('fg')}" ${sk('#5a3404', 0.6)}/>
  <rect x="5.4" y="9.4" width="29.2" height="21.2" rx="0.6" fill="#7a4a08"/>
  <g clip-path="${u('sc')}">
    <rect x="6.6" y="10.6" width="26.8" height="18.8" fill="${u('sky')}"/>
    <ellipse cx="12" cy="12" rx="8" ry="3" fill="#1a2030"/><ellipse cx="27" cy="11.4" rx="9" ry="3.2" fill="#1c2232"/><ellipse cx="20" cy="13.4" rx="6" ry="2" fill="#2a3244"/>
    <path d="M26.4 12.4L24.4 16.8h2l-1.6 4.4 4-5.4h-2.2l1.6-3.4z" fill="#fff2a0"/>
    <path d="M6.6 24Q10 21 13 23.4T19.4 23 26 22.4 33.4 22.6V29.4H6.6z" fill="${u('sea')}"/>
    <g transform="rotate(-14 17 22)"><path d="M12.6 22.4H21.6L20 25H14z" fill="#3a2010"/><path d="M15 22.4V14.6M18.6 22.4V15.8" ${sk('#3a2010', 0.6)}/><path d="M15.2 15.2Q17.4 17.6 15.2 21.4zM18.8 16.4Q20.8 18.6 18.8 21.6z" fill="#e8dcc0"/></g>
    <path d="M6.6 27.4Q9 24.6 12 26.6T18 26.2 24 25.4 30 26 33.4 25.6V29.4H6.6z" fill="#14444a"/>
    <path d="M8.4 26.4q1.6-1.4 3.2-.2M22 25.4q1.6-1.4 3.4-.2M15.8 23.6q1.2-1 2.6-.2M27.4 22.8q1.4-1 3 0" ${ol('#e8f6f4', 0.6)}${RC}/>
  </g>
  <g fill="#fff3b8" ${sk('#7a4a08', 0.3)}><circle cx="4.6" cy="8.6" r="1.1"/><circle cx="35.4" cy="8.6" r="1.1"/><circle cx="4.6" cy="31.4" r="1.1"/><circle cx="35.4" cy="31.4" r="1.1"/><circle cx="20" cy="8.2" r="0.8"/><circle cx="20" cy="31.8" r="0.8"/></g>
  ${shine(7.4, 8.8, 1.4, 0.6)}`,

  astrolabe: `<defs>${rad('ag', GOLD, 0.34, 0.3, 0.85)}${rad('ai', [[0, '#f4d070'], [0.7, '#c08420'], [1, '#8a5a0c']], 0.5, 0.45, 0.6)}</defs>
  ${shadow(20, 36.4, 12, 1.9)}
  <circle cx="20" cy="5.2" r="2.5" ${ol('#7a4a06', 2)}/><circle cx="20" cy="5.2" r="2.5" ${ol('#f2c650', 1.1)}/>
  <path d="M15.6 10.6Q16.6 6.8 20 7Q23.4 6.8 24.4 10.6z" fill="${u('ag')}" ${sk('#6a3e04', 0.5)}/>
  <circle cx="20" cy="22" r="13.2" fill="${u('ag')}" ${sk('#6a3e04', 0.6)}/>
  <g ${sk('#7a4a06', 0.4)}>${Array.from({ length: 36 }, (_, i) => {
    const a = (i * 10 * Math.PI) / 180, r2 = i % 3 ? 12.4 : 11.4;
    return `<path d="M${n(20 + Math.cos(a) * 10.8)} ${n(22 + Math.sin(a) * 10.8)}L${n(20 + Math.cos(a) * r2)} ${n(22 + Math.sin(a) * r2)}"/>`;
  }).join('')}</g>
  <circle cx="20" cy="22" r="10.6" fill="${u('ai')}" ${sk('#7a4a06', 0.4)}/>
  <g ${ol('#8a5a0c', 0.4)}><circle cx="20" cy="23.4" r="6"/><circle cx="20" cy="25" r="3.2"/><path d="M9.4 22h21.2M20 11.4v21.2"/></g>
  <circle cx="20" cy="20.4" r="6.8" ${ol('#fff2b0', 1.1)}/>
  <g fill="#fff2b0"><path d="M14 15l2.4 1.4-1 .9z"/><path d="M26.6 14.6l-1.6 2.4-.8-1.2z"/><path d="M27.6 26.4l-2.6-.6.8-1.1z"/><path d="M12.4 25.6l2.6-.4-.6 1.2z"/></g>
  <path d="M6 22.6L20 21.2 34 21.4 20 22.8z" fill="#fff2b0" ${sk('#6a3e04', 0.45)} transform="rotate(-35 20 22)"/>
  <circle cx="20" cy="22" r="1.5" fill="${u('ag')}" ${sk('#6a3e04', 0.5)}/>
  ${shine(12.4, 14.4, 1.8, 0.6)}${spark(34, 8, 2)}`,

  // ------------------------------------------------------------- legendary
  crown: `${halo('#ffd86a', '#ffb43a')}<defs>${rad('kg', GOLD, 0.36, 0.25, 0.9)}${lin('kb', [[0, '#ffe680'], [0.5, '#d89a1a'], [1, '#7a4806']])}${rad('kr', RUBY, 0.35, 0.3, 0.8)}${rad('ke', EMER, 0.35, 0.3, 0.8)}${rad('ks', SAPH, 0.35, 0.3, 0.8)}${rad('kp', [[0, '#ffffff'], [0.6, '#f0ece4'], [1, '#a8a0b0']], 0.35, 0.3, 0.8)}</defs>
  ${shadow(20, 34.6, 14, 2.1, 0.3)}
  <path d="M7 30.4L5.4 15 9.6 20.6 12.6 11.8 16.2 19 20 8 23.8 19 27.4 11.8 30.4 20.6 34.6 15 33 30.4Q20 33.4 7 30.4z" fill="${u('kg')}" ${sk('#6a3a04', 0.6)}${LJ}/>
  <path d="M7.6 23.6L9.6 20.6M12.6 14.4V22M20 11v10M27.4 14.4V22M32.4 23.6L30.4 20.6" ${sk('#fff4b0', 0.6)} opacity="0.7"/>
  <path d="M6.6 25.2Q20 28.4 33.4 25.2L33 30.4Q20 33.4 7 30.4z" fill="${u('kb')}" ${sk('#6a3a04', 0.5)}/>
  <ellipse cx="20" cy="28.6" rx="2.3" ry="2" fill="${u('kr')}" ${sk('#6a3a04', 0.4)}/>
  <circle cx="13" cy="28" r="1.5" fill="${u('ks')}" ${sk('#6a3a04', 0.35)}/><circle cx="27" cy="28" r="1.5" fill="${u('ke')}" ${sk('#6a3a04', 0.35)}/>
  <circle cx="20" cy="18.4" r="1.6" fill="${u('kr')}"/>
  <g fill="${u('kp')}"><circle cx="5.4" cy="14.4" r="1.5"/><circle cx="12.6" cy="11" r="1.5"/><circle cx="20" cy="7" r="1.8"/><circle cx="27.4" cy="11" r="1.5"/><circle cx="34.6" cy="14.4" r="1.5"/></g>
  <path d="M12.8 12.6Q10 16 11.6 19.4T9.6 25.4Q8.6 28.6 10.4 31.6" ${ol('#2a8a46', 1.5)}${RC}/>
  <path d="M11.6 19.4q-2.4-.4-3 1.6M10 25q2.2.4 2.6 2.4" ${ol('#3aa85a', 1)}${RC}/>
  <path d="M31 30.6V26.6M31 27.8l-2-2.2M31 28.6l2.2-2.6M29 25.6v-1.4M33.2 26v-1.6" ${ol('#ff6a72', 1.1)}${RC}/>
  <g fill="#e8eef0" opacity="0.85"><circle cx="16" cy="29.6" r="0.5"/><circle cx="24.4" cy="30" r="0.45"/><circle cx="23.6" cy="21.6" r="0.4"/></g>
  ${shine(17.6, 13.6, 1.3, 0.75)}${spark(34.4, 5.6, 2.6)}${spark(4.6, 6.4, 1.8)}${spark(36, 24, 1.4)}`,

  idol: `${halo('#ffd25a', '#ff9a2a')}<defs>${rad('ig', GOLD, 0.34, 0.25, 0.9)}${lin('ib', [[0, '#ffe680'], [0.5, '#d89a1a'], [1, '#7a4806']])}${rad('ij', [[0, '#d0ffe0'], [0.45, '#2ec27a'], [1, '#0a5a34']], 0.35, 0.3, 0.8)}</defs>
  ${shadow(20, 35.6, 13, 2, 0.3)}
  <rect x="8.4" y="30.4" width="23.2" height="4.6" rx="0.8" fill="${u('ib')}" ${sk('#5a3204', 0.5)}/>
  <path d="M9.4 32.6h21.2" ${sk('#5a3204', 0.4)} opacity="0.6"/>
  <path d="M9.8 30.6Q9.8 25.2 14 24.8H26Q30.2 25.2 30.2 30.6z" fill="${u('ig')}" ${sk('#5a3204', 0.5)}/>
  <path d="M14 26L15.2 19H24.8L26 26z" fill="${u('ig')}" ${sk('#5a3204', 0.5)}/>
  <path d="M15 19.6Q11.4 21.4 12 26.6M25 19.6Q28.6 21.4 28 26.6" ${ol('#5a3204', 2.4)}${RC}/>
  <path d="M15 19.6Q11.4 21.4 12 26.6M25 19.6Q28.6 21.4 28 26.6" ${ol('#f0bc3a', 1.5)}${RC}/>
  <ellipse cx="12.6" cy="27.4" rx="2.2" ry="1.5" fill="${u('ig')}" ${sk('#5a3204', 0.45)}/><ellipse cx="27.4" cy="27.4" rx="2.2" ry="1.5" fill="${u('ig')}" ${sk('#5a3204', 0.45)}/>
  <circle cx="20" cy="22.4" r="1.5" fill="${u('ij')}" ${sk('#5a3204', 0.4)}/>
  <path d="M9 9.6L10.8 3.8 14 7.4 17 3 20 6.4 23 3 26 7.4 29.2 3.8 31 9.6z" fill="${u('ig')}" ${sk('#5a3204', 0.5)}${LJ}/>
  <rect x="10.4" y="8" width="19.2" height="12.4" rx="2.2" fill="${u('ig')}" ${sk('#5a3204', 0.55)}/>
  <rect x="9.4" y="8.2" width="21.2" height="2.6" rx="0.6" fill="${u('ib')}" ${sk('#5a3204', 0.4)}/>
  <g fill="${u('ij')}"><circle cx="13" cy="9.5" r="0.7"/><circle cx="20" cy="9.5" r="0.8"/><circle cx="27" cy="9.5" r="0.7"/></g>
  <circle cx="9.2" cy="15" r="2.1" fill="${u('ig')}" ${sk('#5a3204', 0.45)}/><circle cx="30.8" cy="15" r="2.1" fill="${u('ig')}" ${sk('#5a3204', 0.45)}/>
  <circle cx="9.2" cy="15" r="0.9" fill="${u('ij')}"/><circle cx="30.8" cy="15" r="0.9" fill="${u('ij')}"/>
  <path d="M13.8 12.6H18.2V15.6H13.8zM21.8 12.6H26.2V15.6H21.8z" fill="#5a3204"/>
  <ellipse cx="16" cy="14.1" rx="1.9" ry="1.3" fill="${u('ij')}"/><ellipse cx="24" cy="14.1" rx="1.9" ry="1.3" fill="${u('ij')}"/>
  <circle cx="15.4" cy="13.6" r="0.45" fill="#fff"/><circle cx="23.4" cy="13.6" r="0.45" fill="#fff"/>
  <path d="M20 14.4v2.4" ${sk('#8a5a0c', 0.6)}/>
  <rect x="16.4" y="17.2" width="7.2" height="2" rx="0.5" fill="#5a3204"/><path d="M18.2 17.2v2M20 17.2v2M21.8 17.2v2" ${sk('#f6d870', 0.45)}/>
  ${shine(13.4, 10.6, 1.2, 0.6)}${spark(35, 6.4, 2.4)}${spark(4.4, 22, 1.6)}${spark(34.6, 27, 1.3)}`,

  krakenPearl: `${halo('#c89aff', '#4ae0d8')}<defs>${rad('kpp', [[0, '#ffffff'], [0.3, '#f6eeff'], [0.62, '#cbb0f2'], [0.86, '#7a70d8'], [1, '#3a8ab0']], 0.38, 0.32, 0.72)}${lin('kpi', [[0, '#7affea', 0.5], [0.5, '#fff', 0], [1, '#e07aff', 0.55]], 1, 1)}${lin('kt', [[0, '#8a3478'], [0.55, '#4e1a50'], [1, '#22082a']], 0.6, 1)}</defs>
  ${shadow(20, 36, 13, 1.9, 0.3)}
  <circle cx="19.6" cy="16.4" r="10.4" fill="${u('kpp')}"/>
  <circle cx="19.6" cy="16.4" r="10.4" fill="${u('kpi')}"/>
  <circle cx="19.6" cy="16.4" r="10.4" ${ol('#fff', 0.5)} opacity="0.6"/>
  ${kraken}
  ${shine(15.6, 11.6, 2.8, 0.8)}
  ${spark(34.4, 6, 2.6)}${spark(5, 8.4, 1.8, '#e8fffc')}${spark(35, 28, 1.4)}`,

  mask: `${halo('#ffd86a', '#ffa83a')}<defs>${rad('mg', GOLD, 0.4, 0.32, 0.8)}${lin('mr', [[0, '#fff2a0'], [1, '#c07a0e']])}${rad('mt', [[0, '#c8fff6'], [0.5, '#2cc8c0'], [1, '#0a6a72']], 0.35, 0.3, 0.8)}</defs>
  ${shadow(20, 36.6, 10, 1.6, 0.3)}
  <g ${sk('#6a3a04', 0.45)}${LJ}>${Array.from({ length: 16 }, (_, i) => {
    const L = i % 2 ? 15.4 : 18.4, w = i % 2 ? 2.4 : 3;
    return `<path d="M${20 - w} 19L20 ${n(19 - L)}L${20 + w} 19z" fill="url(#aql-mr)" transform="rotate(${i * 22.5} 20 19)"/>`;
  }).join('')}</g>
  <ellipse cx="20" cy="19.4" rx="10" ry="11.4" fill="${u('mg')}" ${sk('#6a3a04', 0.6)}/>
  <path d="M11.4 13.6Q20 9.4 28.6 13.6" ${ol(u('mt'), 2)}${RC}/>
  <g fill="${u('mt')}" ${sk('#0a4a50', 0.3)}><circle cx="20" cy="9.4" r="1.3"/><circle cx="12.6" cy="23.6" r="1.1"/><circle cx="27.4" cy="23.6" r="1.1"/></g>
  <path d="M12.6 17.6Q15.6 14.6 18.4 17.6Q15.6 19.8 12.6 17.6zM21.6 17.6Q24.4 14.6 27.4 17.6Q24.4 19.8 21.6 17.6z" fill="#2a1404" ${sk(u('mt'), 1)}/>
  <path d="M20 16.2V23.4M18.4 23.6Q20 24.6 21.6 23.6" ${ol('#8a5408', 0.8)}${RC}/>
  <path d="M16.4 26.6Q20 28.8 23.6 26.6Q20 26 16.4 26.6z" fill="#2a1404" ${sk('#8a5408', 0.4)}/>
  <path d="M14.6 29.6l.8 1.6M20 30.8v1.6M25.4 29.6l-.8 1.6" ${sk('#8a5408', 0.6)}${RC}/>
  ${shine(14.2, 12.4, 1.6, 0.65)}${spark(35, 5, 2.4)}${spark(5, 33, 1.6)}`,
};

let uid = 0;

/**
 * Each copy gets its own gradient ids: a gradient defined inside a hidden
 * copy would otherwise blank out every other copy on the page.
 */
export function lootIcon(id: LootId, cls = 'loot-ico'): string {
  const k = `-${++uid}`;
  return `<svg class="${cls}" viewBox="0 0 40 40" aria-hidden="true">${ART[id].replace(/(id="|url\(#)(aql-[A-Za-z0-9]+)/g, `$1$2${k}`)}</svg>`;
}
