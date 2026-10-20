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

// ------------------------------------------------- the second manifest's kit

// A square ship's biscuit with its docking holes, lying a little askew.
const bisc = (x: number, y: number, w: number, rot: number) => {
  const h = w / 2;
  let holes = '';
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) holes += `<circle cx="${n(i * w * 0.27)}" cy="${n(j * w * 0.27)}" r="0.55"/>`;
  return `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="${-h}" y="${n(-h + 1.5)}" width="${w}" height="${w}" rx="2.2" fill="#8e5e26"/><rect x="${-h}" y="${-h}" width="${w}" height="${w}" rx="2.2" fill="${u('hb')}" ${sk('#7a4c1c', 0.45)}/><rect x="${n(-h + 1)}" y="${n(-h + 1)}" width="${w - 2}" height="${w - 2}" rx="1.6" ${ol('#fff2c8', 0.5)} opacity="0.45"/><g fill="#9a6428">${holes}</g></g>`;
};

const orange = (x: number, y: number, r: number, leaf = false) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${u('or')}" ${sk('#a8440a', 0.4)}/><g fill="#c8580e" opacity="0.4"><circle cx="${n(x + r * 0.3)}" cy="${n(y + r * 0.2)}" r="0.3"/><circle cx="${n(x - r * 0.2)}" cy="${n(y + r * 0.45)}" r="0.3"/><circle cx="${n(x + r * 0.5)}" cy="${n(y - r * 0.15)}" r="0.25"/></g>${shine(x - r * 0.4, y - r * 0.42, r * 0.28, 0.55)}${leaf ? `<path d="M${x} ${n(y - r + 0.4)}q1.8-2.8 4.6-2q-1.2 2.8-4.6 2z" fill="#3a9a3a" ${sk('#1a5a1a', 0.35)}/><path d="M${x} ${n(y - r + 0.4)}l-.4-1.4" ${sk('#5a3a14', 0.6)}${RC}/>` : `<circle cx="${n(x + r * 0.1)}" cy="${n(y - r * 0.82)}" r="0.45" fill="#5a7a1a"/>`}`;

// A cowrie: its spotted back, or flipped to show the toothed slit.
const cowrie = (x: number, y: number, rot: number, s: number, belly = false) =>
  `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><ellipse cy="0.7" rx="4.4" ry="3" fill="#7a5226" opacity="0.6"/><ellipse rx="4.4" ry="3" fill="${u(belly ? 'cwb' : 'cw')}" ${sk('#8a5a2a', 0.35)}/>${
    belly
      ? `<path d="M-3.4 0.2Q0 -0.6 3.4 0.2" ${ol('#5a3410', 0.6)}${RC}/><path d="M-2.4 -0.5v.7M-1.2 -0.6v.7M0 -0.6v.7M1.2 -0.6v.7M2.4 -0.5v.7M-2 0.6v.6M-0.7 0.6v.6M0.7 0.6v.6M2 0.6v.6" ${sk('#a07a4a', 0.35)}/>`
      : `<g fill="#a8682a" opacity="0.55"><circle cx="-1.6" cy="-0.6" r="0.5"/><circle cx="0.6" cy="-1.2" r="0.4"/><circle cx="1.8" cy="0.4" r="0.45"/><circle cx="-0.4" cy="0.9" r="0.35"/><circle cx="-2.6" cy="0.6" r="0.3"/></g><path d="M-4 0.3Q0 2.6 4 0.3" ${ol('#e8c890', 0.5)} opacity="0.7"/>`
  }<ellipse cx="-1.4" cy="-1.3" rx="1.5" ry="0.6" fill="#fff" opacity="0.75" transform="rotate(-12 -1.4 -1.3)"/></g>`;

// A stamped bar of silver, front, top and right faces.
const ingot = (x: number, y: number, w: number) => {
  const h = 4.4, t = 1.6, dx = 2.6, dy = -2.4;
  const P = (pts: number[]) => pts.map(n).join(' ');
  return `<polygon points="${P([x + w, y, x + w + dx, y + dy, x + w - t + dx, y - h + dy, x + w - t, y - h])}" fill="#5e6874" ${sk('#2e3640', 0.4)}${LJ}/><polygon points="${P([x + t, y - h, x + w - t, y - h, x + w - t + dx, y - h + dy, x + t + dx, y - h + dy])}" fill="${u('ig')}" ${sk('#2e3640', 0.4)}${LJ}/><polygon points="${P([x, y, x + w, y, x + w - t, y - h, x + t, y - h])}" fill="${u('if')}" ${sk('#2e3640', 0.45)}${LJ}/><ellipse cx="${n(x + w / 2 + dx / 2)}" cy="${n(y - h + dy / 2)}" rx="2" ry="0.8" ${ol('#6a7682', 0.45)}/><path d="M${n(x + t + 0.6)} ${n(y - h + 0.6)}H${n(x + w - t - 0.6)}" ${sk('#fff', 0.5)} opacity="0.8"/>`;
};

// A quaver for the music box.
const note = (x: number, y: number, s: number, c: string) =>
  `<g transform="translate(${x} ${y}) scale(${s})" fill="${c}"><ellipse cx="0" cy="0" rx="1.5" ry="1.1" transform="rotate(-20)"/><path d="M1.2 -0.3V-6.4q2.4 1 2.6 3.2q-.8-1.4-2-1.6V-0.3z"/></g>`;

// The Heart of Aguadouro, face up: a heart-cut brilliant, lit from the upper left.
const heart = (() => {
  const N = 28, cx = 20, cy = 18.4, S = 0.86;
  const at = (k: number, sc: number) => {
    const t = (k / N) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3, y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    return [cx + x * S * sc, cy + y * S * sc + (1 - sc) * 1.2];
  };
  const tone = (a: number, b: number[], lift: number) => {
    // brightness by how much the facet faces the light, up and to the left
    const mx = (a + b[0]) / 2 - cx, my = b[1] - cy;
    const f = Math.max(0, Math.min(1, 0.5 - (mx * 0.6 + my * 0.8) / 22 + lift));
    const c = [[10, 40, 110], [80, 150, 230], [190, 230, 255], [255, 255, 255]];
    const i = Math.min(2, Math.floor(f * 3)), k = f * 3 - i;
    return `rgb(${c[i].map((v, j) => Math.round(v + (c[i + 1][j] - v) * k)).join(',')})`;
  };
  let out = '';
  const outer = Array.from({ length: N }, (_, k) => at(k, 1)), inner = Array.from({ length: N }, (_, k) => at(k, 0.55));
  for (let k = 0; k < N; k++) {
    const k2 = (k + 1) % N;
    const [a, b, c, d] = [outer[k], outer[k2], inner[k2], inner[k]];
    out += `<polygon points="${[a, b, c, d].map((p) => p.map(n).join(' ')).join(' ')}" fill="${tone(a[0], a, k % 2 ? 0.12 : -0.12)}"/>`;
    out += `<polygon points="${[d, c, [cx, cy + 1]].map((p) => p.map(n).join(' ')).join(' ')}" fill="${tone(d[0], d, k % 2 ? 0.2 : 0.02)}" opacity="0.9"/>`;
  }
  const rim = outer.map((p) => p.map(n).join(' ')).join(' ');
  return `${out}<polygon points="${inner.map((p) => p.map(n).join(' ')).join(' ')}" fill="#dff2ff" opacity="0.35"/><polygon points="${rim}" ${ol('#0a2a6a', 0.6)}${LJ}/><polygon points="${rim}" ${ol('#eaf6ff', 0.3)} opacity="0.7"${LJ}/>`;
})();

const PEARL: Stop[] = [[0, '#ffffff'], [0.55, '#f2ece4'], [1, '#a8a0b0']];
const JADE: Stop[] = [[0, '#d8ffd6'], [0.35, '#6ad08a'], [0.75, '#228a54'], [1, '#0a4a2c']];
const WOOD: Stop[] = [[0, '#b0683a'], [0.55, '#743818'], [1, '#3e1a08']];

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

  // ================================================ the second manifest
  // ---------------------------------------------------------------- common
  hardtack: `<defs>${lin('hb', [[0, '#fbe6b0'], [0.55, '#e2b46a'], [1, '#b8803c']], 1, 1)}</defs>
  ${shadow(20, 34.6, 15, 2.2)}
  ${bisc(13, 26, 12, -9)}${bisc(27, 27.4, 11.4, 12)}${bisc(19.6, 17.6, 12.4, 5)}
  <g fill="#d8a85a"><circle cx="7" cy="34" r="0.7"/><circle cx="33.6" cy="34.2" r="0.6"/><circle cx="31.4" cy="35" r="0.4"/></g>
  <g transform="translate(23.4 13.4) rotate(-30)"><ellipse rx="1.3" ry="0.75" fill="#4a2a12"/><circle cx="1.3" r="0.5" fill="#4a2a12"/><path d="M1.6 -0.2l1.1-.5" ${sk('#4a2a12', 0.3)}${RC}/><path d="M-0.6 0.7l-.3.6M0.3 0.7l.1.7M-0.6 -0.7l-.3-.6M0.3 -0.7l.1-.7" ${sk('#4a2a12', 0.25)}/></g>
  ${shine(15.6, 13.4, 1.2, 0.4)}`,

  oranges: `<defs>${rad('or', [[0, '#ffd88a'], [0.45, '#ff9a1e'], [1, '#c8520a']], 0.38, 0.32, 0.8)}${lin('ow', [[0, '#e2b070'], [1, '#9a6430']])}</defs>
  ${shadow(20, 35, 16, 2.2)}
  <path d="M6.8 20.4H33.2L32.2 33.6H7.8z" fill="#5a3412"/>
  ${orange(11.6, 19.4, 4.2)}${orange(28.4, 19.6, 4.2)}${orange(17, 17.4, 4.4)}${orange(23.4, 17, 4.4, true)}${orange(20, 21, 4)}
  <path d="M6.4 22.4H33.6L33 26.6H7z" fill="${u('ow')}" ${sk('#5a3412', 0.5)}${LJ}/>
  <path d="M7.2 27.6H32.8L32.2 33.6H7.8z" fill="${u('ow')}" ${sk('#5a3412', 0.5)}${LJ}/>
  <path d="M7.4 23.6H32.6M8 28.8H32" ${sk('#f6d4a0', 0.5)} opacity="0.6"/>
  <g fill="#4a2a0e"><circle cx="9.4" cy="24.4" r="0.45"/><circle cx="30.6" cy="24.4" r="0.45"/><circle cx="9.8" cy="30.6" r="0.45"/><circle cx="30.2" cy="30.6" r="0.45"/></g>
  <path d="M15.4 29.4h9.2v2.8h-9.2z" fill="#f2e2b8" opacity="0.85"/><circle cx="20" cy="30.8" r="1" fill="#f58a1a"/>
  ${orange(33.2, 32.4, 3.4, true)}`,

  saltfish: `<defs>${lin('sf', [[0, '#f6efe0'], [0.5, '#d8c8a8'], [1, '#9a8462']], 0.2, 1)}${lin('sf2', [[0, '#e0d2b2'], [1, '#8a7452']], 0.2, 1)}</defs>
  ${shadow(20, 35, 15, 2.2)}
  <g transform="translate(21 26.4) rotate(4) scale(0.92)" ${sk('#6a5434', 0.5)}${LJ}>
    <path d="M14 0Q8 -6.5 -2 -6Q-9 -5 -12 -1.5L-16 -6L-15 0L-16 6L-12 1.5Q-9 5 -2 6Q8 6.5 14 0z" fill="${u('sf2')}"/>
    <path d="M6 -5Q4 0 6 5" fill="none"/><circle cx="9.6" cy="-1.4" r="0.9" fill="#3a2a14" stroke="none"/>
  </g>
  <g transform="translate(19.4 16.6) rotate(-14)" ${sk('#6a5434', 0.5)}${LJ}>
    <path d="M14 0Q8 -6.5 -2 -6Q-9 -5 -12 -1.5L-16 -6L-15 0L-16 6L-12 1.5Q-9 5 -2 6Q8 6.5 14 0z" fill="${u('sf')}"/>
    <path d="M-2 -6Q1 -8.6 4.6 -6.2M-1 6Q1.6 8 4 6" fill="#c8b48e"/>
    <path d="M6 -5Q4 0 6 5" fill="none"/>
    <path d="M-10 0H5" fill="none" stroke="#b8a27a" stroke-dasharray="1 1"/>
    <circle cx="9.6" cy="-1.4" r="1" fill="#3a2a14" stroke="none"/><circle cx="9.3" cy="-1.7" r="0.3" fill="#fff" stroke="none"/>
  </g>
  <g fill="#fff">${Array.from({ length: 14 }, () => `<rect x="${n(8 + rnd() * 22)}" y="${n(13 + rnd() * 16)}" width="0.7" height="0.7" opacity="${n(0.5 + rnd() * 0.5)}"/>`).join('')}</g>
  <g fill="#fff" ${sk('#c8d4dc', 0.25)}><rect x="27" y="32.4" width="1.6" height="1.6" transform="rotate(20 27.8 33.2)"/><rect x="30" y="33.4" width="1.2" height="1.2"/><rect x="9" y="33" width="1.3" height="1.3" transform="rotate(-15 9.6 33.6)"/></g>
  ${shine(20.4, 12.4, 1.4, 0.45)}`,

  coconuts: `<defs>${rad('cg', [[0, '#c8f08a'], [0.5, '#6aaa3a'], [1, '#2a5a16']], 0.36, 0.3, 0.8)}${rad('cbr', [[0, '#c89060'], [0.6, '#7a4a22'], [1, '#3a1e0a']], 0.38, 0.3, 0.8)}${lin('cfl', [[0, '#ffffff'], [1, '#e8e0cc']])}</defs>
  ${shadow(20, 35, 16, 2.2)}
  <circle cx="13.6" cy="22.4" r="8.4" fill="${u('cg')}" ${sk('#1e4a10', 0.5)}/>
  <path d="M8 18Q13.6 14.4 19.4 18" ${ol('#a8d870', 0.6)} opacity="0.5"/>
  <circle cx="13.6" cy="14.6" r="1.6" fill="#8a6a2a" ${sk('#4a3410', 0.35)}/>
  <circle cx="27.2" cy="21.6" r="7.4" fill="${u('cg')}" ${sk('#1e4a10', 0.5)}/>
  <circle cx="28" cy="14.8" r="1.4" fill="#8a6a2a" ${sk('#4a3410', 0.35)}/>
  ${shine(10, 18.6, 2.2, 0.4)}${shine(24.4, 18, 1.8, 0.35)}
  <path d="M14.4 28.6Q15.4 35.4 22.4 35.4Q29.4 35.4 30.4 28.6z" fill="${u('cbr')}" ${sk('#2a1406', 0.5)}/>
  <path d="M17 31.4l1.2 1M21 32.4l.4 1.4M25.6 32l-.6 1.2M28 30.6l-1 .8" ${sk('#c8a070', 0.4)} opacity="0.7"/>
  <ellipse cx="22.4" cy="28.6" rx="8" ry="2.4" fill="${u('cfl')}" ${sk('#5a3410', 0.5)}/>
  <ellipse cx="22.4" cy="28.8" rx="6" ry="1.5" fill="#e6eef0"/><ellipse cx="21.4" cy="28.5" rx="2.6" ry="0.5" fill="#fff" opacity="0.9"/>`,

  rope: `<defs>${lin('rr', [[0, '#e8c27a'], [1, '#9a6a2a']])}</defs>
  ${shadow(20, 34.4, 16, 2.4)}
  ${[0, 1].map((L) => [14.4, 11.2, 8, 4.8].map((R) => `<ellipse cx="20" cy="${26 - L * 3.2}" rx="${R}" ry="${n(R * 0.48)}" ${ol('#4a2e0e', 3.6)}/><ellipse cx="20" cy="${26 - L * 3.2}" rx="${R}" ry="${n(R * 0.48)}" ${ol(u('rr'), 2.6)}/><ellipse cx="20" cy="${26 - L * 3.2}" rx="${R}" ry="${n(R * 0.48)}" ${ol('#fbe2a8', 1.2)} stroke-dasharray="0.9 1.3" opacity="${L ? 0.85 : 0.5}"/>`).join('')).join('')}
  <ellipse cx="20" cy="22.8" rx="2.6" ry="1.2" fill="#2a1804"/>
  <path d="M5.6 26Q4 31 9.6 32.6T22 33.4Q28 34 33.6 31.8" ${ol('#4a2e0e', 3.6)}${RC}/>
  <path d="M5.6 26Q4 31 9.6 32.6T22 33.4Q28 34 33.6 31.8" ${ol(u('rr'), 2.6)}${RC}/>
  <path d="M5.6 26Q4 31 9.6 32.6T22 33.4Q28 34 33.6 31.8" ${ol('#fbe2a8', 1.2)} stroke-dasharray="0.9 1.3"/>
  <path d="M33.6 31.8l2.6-1.6M33.8 32.4l2.8-.2M33.4 31.2l2-2.4" ${ol('#c8984e', 0.6)}${RC}/>
  <path d="M10 18.4Q20 15.6 30 18.4" ${ol('#fff', 0.7)} opacity="0.4"${RC}/>`,

  cider: `<defs>${lin('jc', [[0, '#fbf2dc'], [0.5, '#e8d6ae'], [1, '#a8906a']], 1, 0)}${lin('jg', [[0, '#c8783a'], [0.5, '#8a4a1c'], [1, '#4a2208']], 1, 0)}${rad('ap', [[0, '#ffb0a0'], [0.45, '#e2322a'], [1, '#7a0a0e']], 0.36, 0.3, 0.8)}${rad('ag2', [[0, '#f0ffb0'], [0.5, '#9ad040'], [1, '#4a7a10']], 0.36, 0.3, 0.8)}</defs>
  ${shadow(19, 35, 15, 2.2)}
  <path d="M24.4 13Q31.4 12.4 30.6 18.4Q30 22.4 25.6 23.6" ${ol('#4a2208', 3.6)}${RC}/><path d="M24.4 13Q31.4 12.4 30.6 18.4Q30 22.4 25.6 23.6" ${ol(u('jg'), 2.4)}${RC}/>
  <path d="M14.4 8H21.6V11Q28 14 28 23Q28 32 24 34H12Q8 32 8 23Q8 14 14.4 11z" fill="${u('jc')}" ${sk('#5a4426', 0.55)}${LJ}/>
  <path d="M14.4 8H21.6V11Q25.6 12.8 27 16.6Q25 18.6 23.4 17.2Q21.6 19.8 19.6 17.6Q17.4 19.4 15.6 17.4Q13 19.2 11.4 17.2Q10.2 18.2 9 17.4Q10.4 12.8 14.4 11z" fill="${u('jg')}" ${sk('#3a1a06', 0.5)}${LJ}/>
  <path d="M12.6 25.4l2.6 3.6M15.2 25.4l-2.6 3.6M17.6 25.4l2.6 3.6M20.2 25.4l-2.6 3.6" ${sk('#6a3a14', 0.8)}${RC}/>
  <rect x="14.6" y="5" width="6.8" height="3.6" rx="1" fill="#c8a06a" ${sk('#5a3a14', 0.45)}/>
  <rect x="10" y="17.6" width="1.4" height="12.6" rx="0.7" fill="#fff" opacity="0.5"/>${shine(15.6, 12.4, 1.1, 0.45)}
  <circle cx="33" cy="31.4" r="3.8" fill="${u('ap')}" ${sk('#5a0408', 0.4)}/><path d="M33 27.8q.2-1.6 1-2.2" ${sk('#5a3a14', 0.6)}${RC}/>${shine(31.6, 30, 0.9, 0.6)}
  <circle cx="26.8" cy="32.8" r="2.8" fill="${u('ag2')}" ${sk('#3a5a08', 0.4)}/><path d="M26.8 30.2l-.2-1.2" ${sk('#5a3a14', 0.5)}${RC}/>`,

  cowries: `<defs>${rad('cw', [[0, '#fffaf0'], [0.5, '#f0d8a8'], [1, '#b8864a']], 0.4, 0.3, 0.8)}${rad('cwb', [[0, '#ffffff'], [0.6, '#f6ead2'], [1, '#c8a878']], 0.4, 0.3, 0.8)}${rad('cp2', [[0, '#d8b080'], [0.55, '#9a6a3a'], [1, '#4a2a12']], 0.4, 0.35, 0.8)}</defs>
  ${shadow(20, 35, 16, 2.2)}
  <path d="M27.4 31Q34 31 34.2 25Q34.4 19 30 14.6L26.6 11.8Q24 10.6 22.4 12.4L20.4 15Q16.6 21.4 18.6 27Q21 31 27.4 31z" fill="${u('cp2')}" ${sk('#3a1e0a', 0.5)}/>
  <path d="M22.6 12.6Q25.4 15 27.4 12.2" ${ol('#e8c890', 1.2)}${RC}/>
  <path d="M21 20Q26 22 32 18.6" ${ol('#5a3410', 0.5)} opacity="0.5"/>
  ${cowrie(24, 13.4, 10, 0.75)}${cowrie(28.6, 14.4, -20, 0.7, true)}
  ${cowrie(9.6, 31.4, -12, 1)}${cowrie(18.8, 32.2, 8, 1, true)}${cowrie(28.4, 33, -6, 0.9)}${cowrie(13.6, 25.6, 24, 0.95)}${cowrie(6.6, 25, -40, 0.8, true)}${cowrie(34.4, 31.4, 30, 0.75)}
  <path d="M10 20Q13 17 16.6 18.6" ${ol('#c8a06a', 0.6)} stroke-dasharray="1 0.8"/>`,

  tankard: `<defs>${lin('pw', [[0, '#e8ecef'], [0.35, '#a8b0b8'], [0.8, '#6a737c'], [1, '#3e454c']], 1, 0)}${lin('pl2', [[0, '#d0d6dc'], [1, '#6a737c']])}${rad('fm', [[0, '#ffffff'], [0.7, '#fff6e2'], [1, '#e8d8b0']], 0.4, 0.3, 0.8)}</defs>
  ${shadow(19, 35, 14, 2.2)}
  <path d="M26.6 15Q34.4 14.4 33.4 22.4Q32.6 28.4 26.4 29.4" ${ol('#2e343a', 4)}${RC}/><path d="M26.6 15Q34.4 14.4 33.4 22.4Q32.6 28.4 26.4 29.4" ${ol(u('pw'), 2.6)}${RC}/>
  <path d="M8.6 13.6H27.4L28.4 32.6Q18 35.4 7.6 32.6z" fill="${u('pw')}" ${sk('#2e343a', 0.55)}${LJ}/>
  <path d="M8.4 17.4Q18 19 27.6 17.4M7.8 29.4Q18 31.6 28.2 29.4" ${ol('#3e454c', 1.1)} opacity="0.7"/>
  <path d="M8.4 16.8Q18 18.4 27.6 16.8M7.8 28.8Q18 31 28.2 28.8" ${ol('#f2f4f6', 0.5)} opacity="0.6"/>
  <path d="M19.6 22.4q1.6 1.4 1 3.4" ${ol('#3e454c', 0.8)}${RC}/><path d="M20.4 22.2q1.4 1.2.8 3" ${ol('#fff', 0.5)} opacity="0.6"${RC}/>
  <rect x="10" y="18.6" width="1.6" height="10" rx="0.8" fill="#fff" opacity="0.6"/>
  <path d="M8 14.4Q7.2 10.4 11 10.2Q11.8 7.4 15 8.4Q17 6 20 7.6Q23.4 6.4 24.8 9.2Q28.8 9.4 28 14Q26 13.4 26 15.4Q25.6 18.6 24.4 15.2Q18 15.8 8 14.4z" fill="${u('fm')}" ${sk('#c8b07a', 0.4)}/>
  <ellipse cx="18" cy="13.6" rx="9.6" ry="1.6" fill="#fff" opacity="0.4"/>
  <path d="M26.4 13.4L30 5.6Q31 4.4 32.6 5.2L33.4 7Q30.4 10.6 27.8 14.6z" fill="${u('pl2')}" ${sk('#2e343a', 0.5)}${LJ}/>
  <circle cx="27.4" cy="14" r="1.2" fill="#8a929a" ${sk('#2e343a', 0.4)}/>
  <circle cx="13" cy="11" r="0.8" fill="#fff"/><circle cx="21.4" cy="9.4" r="0.6" fill="#fff"/>`,

  // -------------------------------------------------------------- uncommon
  tea: `<defs>${lin('tr', [[0, '#e8484a'], [0.6, '#a81a22'], [1, '#5a080e']], 1, 0.4)}${lin('tsd', [[0, '#8a1018'], [1, '#3a0408']])}${rad('tgd', GOLD)}${lin('tcp', [[0, '#ffffff'], [1, '#c8d4e2']], 1, 0)}</defs>
  ${shadow(19, 35, 15, 2.2)}
  <path d="M24 13.6L29.4 10V30L24 33.6z" fill="${u('tsd')}" ${sk('#2a0206', 0.5)}${LJ}/>
  <path d="M7 13.6L12.4 10H29.4L24 13.6z" fill="#c82a30" ${sk('#2a0206', 0.5)}${LJ}/>
  <rect x="7" y="13.6" width="17" height="20" fill="${u('tr')}" ${sk('#2a0206', 0.55)}/>
  <path d="M7 17.6H24M24 17.6L29.4 14" ${ol('#e8b040', 0.9)}/>
  <path d="M7 31.4H24L29.4 27.8" ${ol('#e8b040', 0.7)}/>
  <circle cx="18.8" cy="22.6" r="2.6" fill="#ffc83a" opacity="0.9"/>
  <path d="M9.8 28.4Q12 24.6 15.4 23.4Q14 21 15 19.6M15.4 23.4Q19 22.4 21.8 24.6M15.4 23.4L11.4 20.4M13 25.2L12.4 29.2M13.8 25L15.4 28.8" ${ol(u('tgd'), 0.9)}${RC}${LJ}/>
  <circle cx="15" cy="19.4" r="0.7" fill="#ffd84a"/><path d="M15.6 19.3l1.4-.2" ${sk('#ffd84a', 0.6)}${RC}/>
  <path d="M8.4 15V30.6" ${sk('#fff', 0.9)} opacity="0.35"${RC}/>
  <path d="M30.4 26.4H36L35.2 32Q33.2 34 31.2 32z" fill="${u('tcp')}" ${sk('#5a6a80', 0.45)}${LJ}/>
  <ellipse cx="33.2" cy="26.4" rx="2.8" ry="0.8" fill="#8a5a1a" ${sk('#5a6a80', 0.4)}/>
  <path d="M30.6 28.4Q33.2 29.4 35.8 28.4" ${ol('#3a6ad8', 0.5)}/>
  <path d="M32.4 24.6q-.8-1.4.2-2.6t.2-2.6M34.2 24.4q-.6-1.2.2-2.2" ${ol('#fff', 0.5)} opacity="0.55"${RC}/>
  <path d="M30.8 34.6l1.6-.8M28.6 35l.8.6" ${sk('#4a5a1a', 0.8)}${RC}/>`,

  cacao: `<defs>${lin('cpd', [[0, '#ffd04a'], [0.45, '#f08a1a'], [1, '#a83a10']], 1, 0.6)}${lin('cpd2', [[0, '#e8682a'], [0.5, '#b8301a'], [1, '#5a1206']], 1, 0.6)}${rad('cbe', [[0, '#b07a54'], [0.6, '#6a3a1e'], [1, '#2e1408']], 0.38, 0.3, 0.8)}</defs>
  ${shadow(20, 35, 16, 2.2)}
  <g transform="translate(13.2 18.6) rotate(-28)" ${sk('#5a1e06', 0.5)}${LJ}>
    <path d="M0 -13Q8 -9 8 0Q8 9 0 13Q-8 9 -8 0Q-8 -9 0 -13z" fill="${u('cpd2')}"/>
    <path d="M0 -12.6Q-3 0 0 12.6M0 -12.6Q3 0 0 12.6M-4.6 -9.4Q-6.6 0 -4.6 9.4M4.6 -9.4Q6.6 0 4.6 9.4" fill="none" opacity="0.5"/>
    <path d="M0 -13l-.6-2.6" stroke="#5a3a14" stroke-width="1.2"${RC}/>
  </g>
  <g transform="translate(25.4 22.6) rotate(22)" ${sk('#5a2a06', 0.5)}${LJ}>
    <path d="M0 -12Q8 -8.4 8 0Q8 8.4 0 12Q-8 8.4 -8 0Q-8 -8.4 0 -12z" fill="${u('cpd')}"/>
    <path d="M-5.6 -7.6Q-1.6 -10 4 -8.6Q7 -4 6.8 2Q4 6 -1.6 7.4Q-6 4 -6.8 -1.4z" fill="#f6ecd8"/>
    <g fill="#fffaf0" stroke="#c8b48e" stroke-width="0.3">${[[-2.6, -5], [1.6, -5.6], [-4, -1], [0, -1.4], [3.8, -1.8], [-2.4, 3], [1.8, 2.6], [4.4, 1.6]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.9" ry="1.5"/>`).join('')}</g>
    <path d="M-5.6 -7.6Q-1.6 -10 4 -8.6Q7 -4 6.8 2Q4 6 -1.6 7.4Q-6 4 -6.8 -1.4z" fill="none" stroke="#a84a14" stroke-width="0.8"/>
  </g>
  <g transform="translate(9 32) rotate(-20)"><ellipse rx="2.2" ry="1.3" fill="${u('cbe')}"/><path d="M-1.6 0Q0 -0.5 1.6 0" ${ol('#2a1004', 0.35)}/></g>
  <g transform="translate(14.4 33.4) rotate(15)"><ellipse rx="2.2" ry="1.3" fill="${u('cbe')}"/><path d="M-1.6 0Q0 -0.5 1.6 0" ${ol('#2a1004', 0.35)}/></g>
  ${shine(9.6, 11, 1.8, 0.4)}${shine(21.6, 13.4, 1.2, 0.45)}`,

  brandy: `<defs>${lin('bgl', [[0, '#ffffff', 0.7], [0.35, '#d8eef6', 0.15], [1, '#8ab0c0', 0.5]], 1, 0)}${lin('bam', [[0, '#ffc864'], [0.5, '#d8781a'], [1, '#7a3006']], 1, 0.4)}</defs>
  ${shadow(18, 35, 15, 2.2)}
  <path d="M8 20Q8 15.6 12.4 14.6V11.4H19.6V14.6Q24 15.6 24 20V31.6Q24 33.8 21.6 33.8H10.4Q8 33.8 8 31.6z" fill="#d8eef6" opacity="0.25"/>
  <path d="M8.8 22.4H23.2V31.4Q23.2 33 21.6 33H10.4Q8.8 33 8.8 31.4z" fill="${u('bam')}"/>
  <path d="M8.8 22.4H23.2" ${sk('#ffe6a8', 0.7)}/>
  <path d="M8 20Q8 15.6 12.4 14.6V11.4H19.6V14.6Q24 15.6 24 20V31.6Q24 33.8 21.6 33.8H10.4Q8 33.8 8 31.6z" fill="${u('bgl')}" ${sk('#4a6a7a', 0.55)}${LJ}/>
  <path d="M12 18.6V32.6M16 18V33M20 18.6V32.6M8.4 26.6H23.6" ${ol('#fff', 0.5)} opacity="0.5"/>
  <path d="M8.6 20.4L12.4 17.6M23.4 20.4L19.6 17.6" ${ol('#4a6a7a', 0.4)} opacity="0.6"/>
  <rect x="11.6" y="9.8" width="8.8" height="1.8" rx="0.8" fill="#e8f6fa" ${sk('#4a6a7a', 0.45)}/>
  ${facets([['16,2.4 19.6,5 18.6,9.8 13.4,9.8 12.4,5', '#e8f8ff'], ['16,2.4 19.6,5 16,6.4', '#ffffff'], ['16,6.4 19.6,5 18.6,9.8', '#a8d0e0'], ['12.4,5 16,6.4 13.4,9.8', '#c8e6f2']], '#4a6a7a')}
  <rect x="9.4" y="20" width="1.4" height="11" rx="0.7" fill="#fff" opacity="0.7"/>
  <path d="M27 21.6Q26 27.6 30.6 28.6Q35.2 27.6 34.2 21.6z" fill="#d8eef6" opacity="0.3" ${sk('#4a6a7a', 0.5)}/>
  <path d="M26.8 24.6Q30.6 25.6 34.4 24.6Q34 28 30.6 28.6Q27.2 28 26.8 24.6z" fill="${u('bam')}"/>
  <path d="M30.6 28.6V33.2M27.8 33.6Q30.6 32.4 33.4 33.6" ${ol('#4a6a7a', 0.7)}${RC}/>
  <path d="M27.8 22.6Q27.6 25 28.6 26.6" ${ol('#fff', 0.6)} opacity="0.8"${RC}/>
  ${spark(25, 9, 1.6)}`,

  lace: `<defs>${lin('lw', [[0, '#d8a46a'], [1, '#7a4a22']], 1, 0)}</defs>
  ${shadow(19, 34, 16, 2.4)}
  <g transform="translate(19 20) scale(1 0.78)">
    <circle r="15.4" fill="#000" opacity="0.18" cy="1.6"/>
    <g fill="#fffaf0" ${sk('#c8b896', 0.3)}>${Array.from({ length: 22 }, (_, i) => {
      const a = (i / 22) * Math.PI * 2;
      return `<circle cx="${n(Math.cos(a) * 13.4)}" cy="${n(Math.sin(a) * 13.4)}" r="2.3"/>`;
    }).join('')}</g>
    <circle r="13.4" fill="#fffaf0"/>
    <circle r="12.2" ${ol('#c8b896', 0.4)} stroke-dasharray="0.6 0.6"/>
    <g fill="#b8a888">${Array.from({ length: 22 }, (_, i) => {
      const a = (i / 22) * Math.PI * 2;
      return `<circle cx="${n(Math.cos(a) * 14)}" cy="${n(Math.sin(a) * 14)}" r="0.7"/>`;
    }).join('')}${Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      return `<ellipse cx="${n(Math.cos(a) * 9.4)}" cy="${n(Math.sin(a) * 9.4)}" rx="1.5" ry="0.75" transform="rotate(${n((a * 180) / Math.PI)} ${n(Math.cos(a) * 9.4)} ${n(Math.sin(a) * 9.4)})"/>`;
    }).join('')}${Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      return `<circle cx="${n(Math.cos(a) * 6)}" cy="${n(Math.sin(a) * 6)}" r="0.9"/>`;
    }).join('')}</g>
    <g ${ol('#c8b896', 0.5)}><circle r="7.4"/><circle r="11"/></g>
    <g fill="#fffaf0" ${sk('#b8a888', 0.4)}>${Array.from({ length: 6 }, (_, i) => `<ellipse cy="-2.4" rx="1.3" ry="2.4" transform="rotate(${i * 60})"/>`).join('')}<circle r="1.2" fill="#f0e2c4"/></g>
  </g>
  <g ${sk('#3a1e08', 0.4)}>
    <g transform="translate(30 27) rotate(-35)"><rect x="-0.8" y="-8" width="1.6" height="16" rx="0.8" fill="${u('lw')}"/><ellipse cy="5" rx="1.5" ry="1.9" fill="${u('lw')}"/><ellipse cy="-2" rx="1.2" ry="1.2" fill="#f0e2c4"/><circle cy="9" r="1" fill="#c8303a"/></g>
    <g transform="translate(33.4 27.6) rotate(-15)"><rect x="-0.8" y="-8" width="1.6" height="16" rx="0.8" fill="${u('lw')}"/><ellipse cy="5" rx="1.5" ry="1.9" fill="${u('lw')}"/><ellipse cy="-2" rx="1.2" ry="1.2" fill="#f0e2c4"/><circle cy="9" r="1" fill="#2a6ad8"/></g>
  </g>
  <path d="M28.4 20.6Q24 16 21 18.6M31.6 20Q30 15 24.6 15" ${ol('#f6ecd6', 0.4)}/>`,

  spyglass: `<defs>${lin('sb2', [[0, '#fff2b8'], [0.4, '#dcaa44'], [1, '#6a4410']])}${lin('sl2', [[0, '#a85a32'], [0.5, '#6a2e14'], [1, '#2e1006']])}${rad('slens', [[0, '#e8f8ff'], [0.5, '#5aa8d8'], [1, '#0a3a6a']], 0.35, 0.35, 0.8)}</defs>
  ${shadow(20, 34.6, 15, 2)}
  <g transform="translate(20 20.4) rotate(-32)" ${sk('#3a2406', 0.5)}${LJ}>
    <rect x="-17.2" y="-4.2" width="14.6" height="8.4" rx="1" fill="${u('sl2')}"/>
    <path d="M-15 -4.2v8.4M-12.6 -4.2v8.4M-10.2 -4.2v8.4M-7.8 -4.2v8.4" stroke="#2e1006" stroke-width="0.4" opacity="0.6"/>
    <rect x="-18.6" y="-4.8" width="2.8" height="9.6" rx="0.8" fill="${u('sb2')}"/>
    <rect x="-3.4" y="-4.6" width="2" height="9.2" rx="0.6" fill="${u('sb2')}"/>
    <rect x="-1.4" y="-3.2" width="9.4" height="6.4" rx="0.6" fill="${u('sb2')}"/>
    <rect x="7.4" y="-3.6" width="1.6" height="7.2" rx="0.5" fill="${u('sb2')}"/>
    <rect x="9" y="-2.5" width="6.4" height="5" rx="0.5" fill="${u('sb2')}"/>
    <rect x="15" y="-2.9" width="1.4" height="5.8" rx="0.5" fill="${u('sb2')}"/>
    <rect x="16.4" y="-1.8" width="2.4" height="3.6" rx="1" fill="#3a2406"/>
    <path d="M-1 -2.2H7.6M9.4 -1.6H15M-18 -3.8H-16.4" stroke="#fff" stroke-width="0.7" opacity="0.75"${RC}/>
    <ellipse cx="-18.6" cy="0" rx="1.6" ry="4.4" fill="${u('slens')}"/>
  </g>
  ${shine(5.6, 27.6, 0.8, 0.85)}${spark(6.8, 22.6, 1.6, '#e8f8ff')}`,

  coral: `<defs>${lin('crl', [[0, '#ff9a8a'], [0.4, '#f0303a'], [1, '#8a0a1a']], 0.6, 1)}${rad('crk', [[0, '#e8dcc0'], [0.6, '#a8987a'], [1, '#5a4e3a']], 0.4, 0.3, 0.9)}</defs>
  ${shadow(20, 35, 13, 2.2)}
  ${[
    [[20, 33], [19.4, 26], [16, 19], [12, 13], [10.6, 7.6]],
    [[19.6, 27], [23, 21], [26.6, 15.4], [27, 9]],
    [[16.8, 20.4], [20.4, 15], [20.6, 8.6]],
    [[13.4, 15], [8, 13.6], [5.6, 10]],
    [[24.4, 19], [30, 18], [33, 14]],
    [[19.4, 28.6], [13.4, 25], [8.6, 22.6]],
    [[22.4, 25.6], [28.4, 25.4], [32, 23]],
    [[26, 16.4], [22.8, 11.6]],
  ].map((p, i) => tube(p, i ? (i < 3 ? 3.6 : 2.6) : 5.2, 1.2).d).map((d) => `<path d="${d}" fill="${u('crl')}" ${sk('#5a0410', 0.45)}${LJ}/>`).join('')}
  <g fill="#ffb8b0">${[[10.6, 7.6], [27, 9], [20.6, 8.6], [5.6, 10], [33, 14], [8.6, 22.6], [32, 23], [22.8, 11.6]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.8"/>`).join('')}</g>
  <path d="M18.8 31L18.4 25.4L15.4 19.2" ${ol('#ffc8c0', 0.7)} opacity="0.7"${RC}/>
  <path d="M12 34.4Q13 30 20 30.6Q27 30 28 34.4Q20 36 12 34.4z" fill="${u('crk')}" ${sk('#3a3424', 0.45)}/>
  ${spark(31, 6, 1.8)}${spark(6, 28, 1.3)}`,

  pipe: `<defs>${rad('mm', [[0, '#fffaf0'], [0.55, '#f2dcb4'], [1, '#b8864e']], 0.36, 0.3, 0.85)}${lin('mam', [[0, '#ffd27a'], [0.5, '#d8861a'], [1, '#7a3a06']])}${lin('mst', [[0, '#5a3a1e'], [1, '#2a1406']])}</defs>
  ${shadow(20, 35, 15, 2)}
  <path d="M18 28.6Q26 29.4 31.4 23.6" ${ol('#1a0c04', 3.6)}${RC}/><path d="M18 28.6Q26 29.4 31.4 23.6" ${ol(u('mst'), 2.4)}${RC}/>
  <path d="M30.6 24.4L35.6 19.4" ${ol('#5a2a04', 3)}${RC}/><path d="M30.6 24.4L35.6 19.4" ${ol(u('mam'), 2)}${RC}/>
  <path d="M30.8 24.2l1 1" ${sk('#d8b060', 1)}/>
  <path d="M7.4 20Q6.4 30 13.6 31.6Q20.8 32 20.4 22.4z" fill="${u('mm')}" ${sk('#7a5430', 0.5)}${LJ}/>
  <path d="M8.4 25.4Q9.4 27.4 8.6 30M10.6 27Q11.6 29.6 10.8 31.4M13.4 27.6Q14 30 13.6 31.6M16.4 27Q17 29.4 16.6 31.2M19 25.4Q19.6 27.6 19 30" ${ol('#c8a070', 0.6)}${RC}/>
  <ellipse cx="13.8" cy="19.6" rx="6.6" ry="6.8" fill="${u('mm')}" ${sk('#7a5430', 0.5)}/>
  <path d="M10.8 24.2Q13.8 22.2 16.8 24.2Q13.8 23.4 10.8 24.2z" fill="#d8b888" ${sk('#7a5430', 0.4)}/>
  <path d="M10.4 19.4q1.2-.8 2.4 0M15 19.4q1.2-.8 2.4 0" ${ol('#5a3a1e', 0.6)}${RC}/>
  <path d="M13.8 19.4q.8 1.8-.4 2.6" ${ol('#a87a4a', 0.6)}${RC}/>
  <path d="M5.4 14.6Q8 8.6 13.8 10.4Q19.6 8.6 22.4 14.6Q18 13.4 13.8 14.4Q9.6 13.4 5.4 14.6z" fill="${u('mm')}" ${sk('#7a5430', 0.5)}${LJ}/>
  <ellipse cx="13.8" cy="10.8" rx="4" ry="1.3" fill="#3a1c08" ${sk('#7a5430', 0.4)}/>
  <circle cx="13.8" cy="12.6" r="0.9" fill="#e8b84a"/>
  <path d="M13.2 9.4Q11.4 6.6 13.6 5T13.4 1.4M15 9Q16.8 7 15.4 5" ${ol('#e6eef2', 0.7)} opacity="0.6"${RC}/>
  ${shine(10.4, 16.6, 1.2, 0.55)}`,

  // ------------------------------------------------------------------ rare
  reserve: `<defs>${lin('rv', [[0, '#5a4a2a'], [0.3, '#2a1e0e'], [0.75, '#120a04'], [1, '#050200']], 1, 0)}${lin('rwx', [[0, '#ff6050'], [0.5, '#b8141e'], [1, '#5a040a']], 1, 0)}${lin('rlb', [[0, '#f8ecc8'], [1, '#d8c08a']])}${rad('rgd', GOLD)}</defs>
  ${shadow(20, 35.4, 13, 2)}
  <path d="M12.6 33.6V19Q12.6 14.6 17.2 13.2V7H22.8V13.2Q27.4 14.6 27.4 19V33.6Q20 35.6 12.6 33.6z" fill="${u('rv')}" ${sk('#000', 0.5)}${LJ}/>
  <path d="M16.8 2.4H23.2V8.6Q23.6 10.6 22.8 12.4Q22.2 10.6 21.6 12Q21 10 20.2 13Q19.4 10.4 18.6 11.6Q18 10.2 17.2 12.8Q16.4 10.6 16.8 8.6z" fill="${u('rwx')}" ${sk('#3a0206', 0.45)}${LJ}/>
  <ellipse cx="20" cy="2.6" rx="3.2" ry="0.9" fill="#d8303a"/><circle cx="20" cy="2.6" r="1.1" fill="#8a0a14"/>
  <rect x="13.8" y="20.6" width="12.4" height="9.4" rx="0.8" fill="${u('rlb')}" ${sk('#6a4a14', 0.45)}/>
  <rect x="14.6" y="21.4" width="10.8" height="7.8" rx="0.5" ${ol(u('rgd'), 0.7)}/>
  <path d="M17 23.4q3-1.6 6 0" ${ol('#7a1a14', 0.7)}${RC}/>
  <text x="20" y="27.8" text-anchor="middle" font-family="Georgia,serif" font-size="3.6" font-weight="700" fill="#5a2a0a">1702</text>
  <path d="M13.6 32h12.8" ${sk('#e8c060', 0.8)}/>
  <rect x="14" y="16" width="1.3" height="16" rx="0.65" fill="#fff" opacity="0.28"/>
  <g fill="#d8c8a8" opacity="0.4">${Array.from({ length: 16 }, () => `<circle cx="${n(13.6 + rnd() * 12.8)}" cy="${n(14 + rnd() * 6 + (rnd() > 0.5 ? 12 : 0))}" r="${n(0.2 + rnd() * 0.3)}"/>`).join('')}</g>
  <path d="M22.8 13.6L27.6 18.2M22.8 13.6L26 19.6M22.8 13.6L24.6 18.6M24 14.8Q25.4 15.4 25.6 16.8M25.2 16.2Q26.4 16.8 26.6 18.2" ${ol('#f4f4f4', 0.25)} opacity="0.7"/>
  <path d="M31 27.4Q30.6 33 33 33.6Q35.4 33 35 27.4z" fill="#e8f2f6" opacity="0.3" ${sk('#5a6a70', 0.4)}/><path d="M30.9 30.2Q33 31 35.1 30.2Q34.6 33.2 33 33.6Q31.4 33.2 30.9 30.2z" fill="#6a2a10"/>
  <path d="M33 33.6v1.4M31.6 35.2h2.8" ${ol('#5a6a70', 0.5)}${RC}/>
  ${spark(31, 8, 2.2)}${spark(7.4, 16, 1.4)}`,

  ingots: `<defs>${lin('if', SILV, 0.4, 1)}${lin('ig', [[0, '#ffffff'], [1, '#b8c2cc']], 1, 0)}</defs>
  ${shadow(20, 34.8, 16, 2.4)}
  ${ingot(3.4, 32.6, 15.6)}${ingot(19.4, 32.6, 15.6)}${ingot(11.4, 27, 15.6)}
  ${spark(32, 10, 2.6)}${spark(6.4, 12, 1.6)}${spark(26, 22.4, 1.2)}`,

  jade: `<defs>${rad('jd', JADE, 0.35, 0.3, 0.85)}${lin('jw', WOOD)}${lin('jt', [[0, '#ff6a5a'], [1, '#8a0a14']])}</defs>
  ${shadow(20, 35.6, 13, 2)}
  <path d="M8 31.6H32L30.6 34.4H9.4z" fill="${u('jw')}" ${sk('#1e0c04', 0.45)}${LJ}/>
  <path d="M10 34.4V36M30 34.4V36" ${sk('#3e1a08', 1.4)}${RC}/>
  <path d="M9.4 31.6Q20 29.6 30.6 31.6" ${ol('#d89a6a', 0.5)} opacity="0.6"/>
  ${(() => {
    const pts = Array.from({ length: 9 }, (_, i) => {
      const a = (-60 + i * 33) * (Math.PI / 180);
      return [20 + Math.cos(a) * 9.6, 19.6 + Math.sin(a) * 9.6];
    });
    const t = tube(pts, 7.6, 2.4);
    const scales = t.c.filter((_, i) => i % 3 === 1 && i > 3).map(([x, y, nx, ny, w]) => `<path d="M${n(x + nx * w * 0.7)} ${n(y + ny * w * 0.7)}Q${n(x)} ${n(y)} ${n(x - nx * w * 0.7)} ${n(y - ny * w * 0.7)}" ${ol('#0e5a34', 0.45)} opacity="0.55"/>`).join('');
    return `<path d="${t.d}" fill="${u('jd')}" ${sk('#0a3a20', 0.5)}${LJ}/>${scales}`;
  })()}
  <path d="M22.6 9.4L25 5.6 25.6 9.6 28.4 7 27.4 11.2" fill="${u('jd')}" ${sk('#0a3a20', 0.45)}${LJ}/>
  <ellipse cx="25" cy="12.8" rx="5.2" ry="4.2" fill="${u('jd')}" ${sk('#0a3a20', 0.5)} transform="rotate(30 25 12.8)"/>
  <path d="M27.4 16.2Q30.6 17.4 31.4 15.4Q30.4 13.6 28.8 14" fill="${u('jd')}" ${sk('#0a3a20', 0.45)}${LJ}/>
  <circle cx="25.8" cy="12.2" r="1.3" fill="#e8ffe8" ${sk('#0a3a20', 0.4)}/><circle cx="26" cy="12.3" r="0.55" fill="#0a3a20"/>
  <path d="M30 15.4Q33.6 16.6 34.4 20M29.4 16.8Q31.4 19 31 21.6" ${ol('#2a8a54', 0.6)}${RC}/>
  <path d="M10 14.6Q8.4 17.6 8.8 21.4" ${ol('#e8fff0', 0.9)} opacity="0.65"${RC}/>
  <path d="M15 27.6Q14.6 30 15.2 31.4" ${ol('#c8202a', 0.8)}/><path d="M14 31.2h2.4l.8 3.4h-4z" fill="${u('jt')}"/><circle cx="15.2" cy="31" r="0.8" fill="#e8b040"/>
  ${spark(8, 8, 1.8)}${spark(33, 27, 1.3)}`,

  cameo: `<defs>${rad('cmg', GOLD, 0.35, 0.3, 0.85)}${rad('cmb', [[0, '#f0a060'], [0.6, '#b8521e'], [1, '#5a1e08']], 0.42, 0.36, 0.75)}${rad('cmp', PEARL, 0.35, 0.3, 0.8)}${lin('cmw', [[0, '#ffffff'], [1, '#ecdcc8']], 1, 1)}<clipPath id="aql-cmc"><ellipse cx="20" cy="18.6" rx="8.6" ry="10.8"/></clipPath></defs>
  ${shadow(20, 36.4, 10, 1.6)}
  <ellipse cx="20" cy="18.6" rx="12.6" ry="14.8" fill="${u('cmg')}" ${sk('#6a3a04', 0.6)}/>
  <g fill="${u('cmp')}" ${sk('#8a8090', 0.2)}>${Array.from({ length: 26 }, (_, i) => {
    const a = (i / 26) * Math.PI * 2;
    return `<circle cx="${n(20 + Math.cos(a) * 11)}" cy="${n(18.6 + Math.sin(a) * 13.1)}" r="1.05"/>`;
  }).join('')}</g>
  <ellipse cx="20" cy="18.6" rx="9.4" ry="11.6" fill="${u('cmg')}" ${sk('#6a3a04', 0.4)}/>
  <ellipse cx="20" cy="18.6" rx="8.6" ry="10.8" fill="${u('cmb')}"/>
  <g clip-path="${u('cmc')}">
    <path d="M14.6 30C15 26.6 14.6 24.6 13.8 22.8C11.6 20.4 11.4 14.2 14.6 11.4C17.6 9 22.4 9.4 24 12.4C24.8 13.8 24.6 15 25 16.2L26.4 18.6L25.2 19.2C25.4 20 25.6 20.4 25 20.8C25.4 21.6 25 22.4 24 22.6C23.2 23 22.8 24.2 23 25.8C24.4 27.4 26.4 28.6 28 30z" fill="${u('cmw')}"/>
    <path d="M24 12.6C22.6 9.4 17.6 8.6 14.6 11.2C11.6 13.8 11.8 19.6 14 22.4C15.6 21.6 16.6 20 16.8 18.2C18.6 17 20.4 14.2 24 12.6z" fill="#efe2cc" ${sk('#d0bc9c', 0.35)}/>
    <circle cx="14.6" cy="12.6" r="2.8" fill="#efe2cc" ${sk('#d0bc9c', 0.35)}/>
    <path d="M13 12.2q1.6-1.4 3.4-.4M12.8 14.4q2-.6 3.6.6M17.6 10.6q2.6-.6 4.6 1M14.4 18q1.6-.2 2.4-1.6M13.6 20.6q1.6-.2 2.6-1.4M18 13.4q1.6-.4 2.8.4" ${ol('#c8b08e', 0.45)}${RC}/>
    <path d="M22.6 16q.8-.4 1.4 0" ${ol('#c8b08e', 0.45)}${RC}/>
    <path d="M10.4 30.2Q14 27.6 20 28.4T29.6 30.2" ${ol('#fff', 1.6)}/>
  </g>
  <ellipse cx="20" cy="18.6" rx="8.6" ry="10.8" ${ol('#3a1004', 0.5)}/>
  <circle cx="20" cy="3.4" r="1.6" ${ol(u('cmg'), 1)}/>
  <path d="M20 33.4v1.6" ${sk('#a87a20', 0.7)}/><ellipse cx="20" cy="36.4" rx="1.3" ry="1.7" fill="${u('cmp')}"/>
  ${shine(12.6, 9.6, 1.4, 0.65)}${spark(33.4, 6.4, 2)}${spark(6.6, 30, 1.4)}`,

  musicBox: `<defs>${lin('mbg', [[0, '#fff1aa'], [0.45, '#e2aa32'], [1, '#7a4a08']])}${lin('mbl', [[0, '#c8902a'], [1, '#5a3404']], 0, 1)}${lin('mbv', [[0, '#c8283a'], [1, '#5a0a14']])}${rad('mbs', GOLD)}</defs>
  ${shadow(20, 35.4, 15, 2)}
  <path d="M8.6 20.6L11.6 6.4H28.4L31.4 20.6z" fill="${u('mbl')}" ${sk('#4a2a04', 0.5)}${LJ}/>
  <path d="M10.4 19.2L12.8 8H27.2L29.6 19.2z" fill="#a8cce0" ${sk('#6a4a10', 0.4)}${LJ}/>
  <path d="M14 10L13 15M16.2 9.4L15.6 12" ${ol('#fff', 0.8)} opacity="0.8"${RC}/>
  <path d="M6.6 22.6L9 20.2H31L33.4 22.6z" fill="${u('mbv')}" ${sk('#3a0408', 0.45)}${LJ}/>
  <ellipse cx="20" cy="21.4" rx="5.4" ry="1.2" fill="${u('mbs')}" ${sk('#6a3a04', 0.4)}/>
  <path d="M16.6 20.2Q20 22 23.6 20.2L23 18.8H17.2z" fill="#4a2a10"/>
  <path d="M20.2 18.8V10.6M18.4 18.4V12.6" ${sk('#4a2a10', 0.5)}/>
  <path d="M20.6 11Q24 14 20.6 18.2zM18 12.8Q15.4 15.4 18 18.2z" fill="#fffaf0" ${sk('#a88a5a', 0.3)}/>
  <path d="M20.2 10.6l2-.8-2-.6" fill="#c8283a"/>
  <rect x="6.6" y="22.6" width="26.8" height="11.2" rx="0.8" fill="${u('mbg')}" ${sk('#5a3404', 0.55)}/>
  <rect x="8.4" y="24.2" width="23.2" height="8" rx="0.5" ${ol('#7a4a08', 0.5)}/>
  <path d="M11 30.4Q13 25 16.6 28T20 26Q22 29 24.6 27.4T29 30.4" ${ol('#fff4c0', 0.7)}${RC}/>
  <circle cx="20" cy="28.2" r="1.4" fill="#2a6ad8" ${sk('#5a3404', 0.4)}/>
  <path d="M33.4 27.4h2" ${sk('#5a3404', 1.4)}${RC}/><path d="M35.6 25.2v4.4Q37.4 29.6 37.4 27.4T35.6 25.2z" fill="${u('mbs')}" ${sk('#5a3404', 0.4)}/>
  ${note(5.6, 13, 0.9, '#ffe6a0')}${note(33.4, 10, 0.75, '#fff2c8')}${note(4, 22, 0.6, '#ffe6a0')}
  ${shine(10, 24.6, 1, 0.6)}${spark(36, 16, 1.4)}`,

  chronometer: `<defs>${lin('chw', WOOD, 1, 0.6)}${rad('chb', [[0, '#fff3c0'], [0.45, '#deb04e'], [1, '#7c5416']], 0.4, 0.3, 0.9)}${rad('chd', [[0, '#ffffff'], [0.7, '#f6f2e8'], [1, '#c8c0ae']], 0.4, 0.35, 0.8)}</defs>
  ${shadow(20, 35.6, 16, 2)}
  <path d="M6.6 21.4L8.6 5.4H31.4L33.4 21.4z" fill="${u('chw')}" ${sk('#1e0a02', 0.5)}${LJ}/>
  <path d="M10.4 18.6L11.8 8.4H28.2L29.6 18.6z" fill="#8a4422" ${sk('#3a1606', 0.4)}${LJ}/>
  <rect x="15.6" y="10.6" width="8.8" height="3.6" rx="0.5" fill="${u('chb')}" ${sk('#5a3a06', 0.4)}/>
  <path d="M17 12.4h6" ${sk('#6a4410', 0.4)} stroke-dasharray="1 0.6"/>
  <path d="M5 23.6L6.6 21.4H33.4L35 23.6z" fill="#2e1206" ${sk('#1e0a02', 0.45)}${LJ}/>
  <rect x="5" y="23.6" width="30" height="10.4" rx="0.8" fill="${u('chw')}" ${sk('#1e0a02', 0.55)}/>
  <path d="M5.4 24h29.2" ${sk('#d8925a', 0.6)} opacity="0.7"/>
  <g fill="${u('chb')}" ${sk('#5a3a06', 0.3)}><path d="M5 23.6h3.4v1.2h-2.2v2h-1.2z"/><path d="M35 23.6h-3.4v1.2h2.2v2h1.2z"/><path d="M5 34h3.4v-1.2h-2.2v-2h-1.2z"/><path d="M35 34h-3.4v-1.2h2.2v-2h1.2z"/></g>
  <ellipse cx="20" cy="22.6" rx="12.4" ry="5.6" fill="${u('chb')}" ${sk('#5a3a06', 0.5)}/>
  <ellipse cx="20" cy="22.4" rx="10.6" ry="4.6" fill="${u('chd')}" ${sk('#5a3a06', 0.4)}/>
  <g ${sk('#2a2a3a', 0.4)}>${Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return `<path d="M${n(20 + Math.cos(a) * 9.4)} ${n(22.4 + Math.sin(a) * 4)}L${n(20 + Math.cos(a) * 8.2)} ${n(22.4 + Math.sin(a) * 3.5)}"/>`;
  }).join('')}</g>
  <ellipse cx="20" cy="24.4" rx="2.2" ry="1" ${ol('#2a2a3a', 0.35)}/>
  <path d="M20 22.4L16.4 20.6M20 22.4L25.6 21" ${sk('#1a2a6a', 0.7)}${RC}/>
  <circle cx="20" cy="22.4" r="0.6" fill="#1a2a6a"/>
  <path d="M12 20.8Q16 18.6 22 18.4" ${ol('#fff', 0.8)} opacity="0.8"${RC}/>
  ${spark(33, 9, 1.8)}`,

  // ------------------------------------------------------------------ epic
  diamond: `<defs>${rad('dmg', [[0, '#bfe8ff', 0.7], [0.55, '#6ac0ff', 0.2], [1, '#6ac0ff', 0]], 0.5, 0.5, 0.5)}${rad('dmc', GOLD)}</defs>
  <circle cx="20" cy="19" r="19" fill="${u('dmg')}"/>
  ${shadow(20, 36.4, 10, 1.6, 0.3)}
  ${heart}
  <path d="M10.2 10.4Q12.4 7.4 15.6 8" ${ol('#fff', 1)} opacity="0.85"${RC}/>
  ${spark(14, 13, 2.2)}${spark(33.6, 6, 2.6)}${spark(5.4, 28, 1.6)}${spark(27.4, 24, 1.4, '#e8f6ff')}`,

  globe: `<defs>${rad('gn', [[0, '#4a6ad0'], [0.55, '#1a2a7a'], [1, '#060a2a']], 0.36, 0.3, 0.8)}${rad('ggd', GOLD, 0.35, 0.3, 0.85)}${lin('gw', WOOD)}</defs>
  ${shadow(20, 36, 12, 1.9)}
  <path d="M12 35.4Q12.4 31.4 20 31Q27.6 31.4 28 35.4z" fill="${u('ggd')}" ${sk('#6a3a04', 0.5)}/>
  <path d="M18.6 31.4L19.2 27.6H20.8L21.4 31.4z" fill="${u('ggd')}" ${sk('#6a3a04', 0.45)}/>
  <ellipse cx="20" cy="27.4" rx="5" ry="1.4" fill="${u('ggd')}" ${sk('#6a3a04', 0.45)}/>
  <circle cx="20" cy="16.4" r="11.4" fill="${u('gn')}" ${sk('#04061a', 0.55)}/>
  <path d="M8.8 18.8Q20 11 31.2 14" ${ol('#e2aa32', 1.6)} opacity="0.85"/>
  <path d="M8.8 18.8Q20 11 31.2 14" ${ol('#7a4a08', 0.5)} stroke-dasharray="0.6 0.9"/>
  <g ${ol('#8aa8ff', 0.4)} opacity="0.55"><path d="M12.4 9.6L15.6 12.4 18.4 10.4 22 12.6M14.6 20.8L18 23.4 21.6 21.4 24.4 24M24.6 8.2L27.4 10.8 25.6 13.6"/></g>
  <g fill="#ffe7a0">${[[12.4, 9.6, 0.8], [15.6, 12.4, 0.6], [18.4, 10.4, 0.7], [22, 12.6, 0.8], [14.6, 20.8, 0.6], [18, 23.4, 0.8], [21.6, 21.4, 0.6], [24.4, 24, 0.7], [24.6, 8.2, 0.6], [27.4, 10.8, 0.8], [25.6, 13.6, 0.5]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>
  <g fill="#fff" opacity="0.7">${Array.from({ length: 14 }, () => `<circle cx="${n(11 + rnd() * 18)}" cy="${n(7.4 + rnd() * 18)}" r="0.25"/>`).join('')}</g>
  ${spark(27, 19.4, 1.4, '#ffe7a0')}${spark(11.6, 15.4, 1.1, '#ffe7a0')}
  <path d="M20 3.6A12.8 12.8 0 0 1 20 29.2" ${ol('#5a3404', 2.4)}/><path d="M20 3.6A12.8 12.8 0 0 1 20 29.2" ${ol(u('ggd'), 1.6)}/>
  <g fill="#7a4a08">${Array.from({ length: 9 }, (_, i) => {
    const a = -Math.PI / 2 + ((i + 0.5) / 9) * Math.PI;
    return `<circle cx="${n(20 + Math.cos(a) * 12.8)}" cy="${n(16.4 + Math.sin(a) * 12.8)}" r="0.3"/>`;
  }).join('')}</g>
  <circle cx="20" cy="3.6" r="1.1" fill="${u('ggd')}" ${sk('#5a3404', 0.4)}/>
  ${shine(14.6, 10.4, 2.6, 0.35)}${spark(34, 5, 2)}${spark(5, 27, 1.4)}`,

  helm: `<defs>${lin('hs', [[0, '#ffffff'], [0.35, '#c8d2dc'], [0.75, '#7a8694'], [1, '#3e4652']], 0.8, 1)}${lin('hs2', [[0, '#e8eef2'], [0.5, '#9aa6b2'], [1, '#4a5460']], 1, 0.4)}${rad('hgd', GOLD)}${lin('hpl', [[0, '#ff7a6a'], [1, '#a0101e']])}</defs>
  ${shadow(20, 35.4, 15, 2)}
  <path d="M10.4 22.6Q4.6 14.6 6.4 7.4Q9 12 12.4 14.8Q9.6 9.4 11.6 4.6Q14 10.4 16.6 13" fill="${u('hpl')}" ${sk('#5a0408', 0.45)}${LJ}/>
  <path d="M7 9.4Q8 15.6 11.4 19.8M11.8 6.6Q12.4 11 15 13.4" ${ol('#ffb0a0', 0.5)} opacity="0.7"${RC}/>
  <path d="M13.2 16.6Q13.8 5 20.4 4Q27 5 27.4 16.4Q24 14.4 20 14.4Q16.4 14.4 13.2 16.6z" fill="${u('hs2')}" ${sk('#2a3038', 0.55)}${LJ}/>
  <path d="M8.8 25.6Q8 14.6 20 14.2Q32 14.6 31.2 25.6z" fill="${u('hs')}" ${sk('#2a3038', 0.55)}${LJ}/>
  <path d="M13 16.8Q20 12.8 27.6 16.6" ${ol('#6a3a04', 1.8)}${RC}/><path d="M13 16.8Q20 12.8 27.6 16.6" ${ol(u('hgd'), 1.1)}${RC}/>
  <path d="M15.4 12.6Q16.4 6.6 20.4 5.8" ${ol('#fff', 0.8)} opacity="0.7"${RC}/><path d="M13.4 16Q14 5.4 20.4 4.4Q26.8 5.4 27.2 15.8" ${ol('#e2aa32', 0.6)}/>
  <path d="M12 23Q13 19.4 16.4 18.4Q15.2 20.6 17.4 21.6Q19 19.4 22 20Q20.6 22 23 23.4Q25.6 20.8 28.2 22.2" ${ol(u('hgd'), 0.9)}${RC}/>
  <path d="M3.4 22.6Q6.4 28.4 20 28.6Q33.6 28.4 36.6 22.6Q35.4 30.4 20 31.6Q4.6 30.4 3.4 22.6z" fill="${u('hs')}" ${sk('#2a3038', 0.55)}${LJ}/>
  <path d="M5.6 25.6Q10 29.6 20 29.8Q30 29.6 34.4 25.6" ${ol('#e2aa32', 0.8)}/>
  <g fill="${u('hgd')}" ${sk('#6a3a04', 0.25)}>${[7.6, 11.4, 15.6, 20, 24.4, 28.6, 32.4].map((x) => `<circle cx="${x}" cy="${n(27.4 + 2.2 * Math.sin(((x - 3.4) / 33.2) * Math.PI))}" r="0.6"/>`).join('')}</g>
  <path d="M24.8 18.8q1.8 1 1.6 3" ${ol('#2a3038', 0.8)}${RC}/><path d="M25.4 18.4q1.6 1 1.4 2.8" ${ol('#fff', 0.5)} opacity="0.8"${RC}/>
  <path d="M11.6 22Q11.6 17.6 15 16.2" ${ol('#fff', 1)} opacity="0.8"${RC}/>
  ${spark(33, 8.4, 2)}${spark(6.4, 33, 1.4)}`,

  egg: `<defs>${rad('ege', [[0, '#ffd0dc'], [0.4, '#f0507a'], [0.8, '#a8143a'], [1, '#5a041a']], 0.36, 0.3, 0.8)}${rad('egd', GOLD, 0.35, 0.3, 0.85)}${rad('egp', PEARL, 0.35, 0.3, 0.8)}${rad('egs', SAPH, 0.35, 0.3, 0.8)}<clipPath id="aql-egc"><path d="M20 4C27.6 4 30.6 15 30.6 21C30.6 27.4 25.8 30.8 20 30.8C14.2 30.8 9.4 27.4 9.4 21C9.4 15 12.4 4 20 4z"/></clipPath></defs>
  ${shadow(20, 36, 10, 1.6)}
  <path d="M14 36L16.6 29.6M26 36L23.4 29.6M20 36.2V30.6" ${ol('#6a3a04', 2)}${RC}/><path d="M14 36L16.6 29.6M26 36L23.4 29.6M20 36.2V30.6" ${ol(u('egd'), 1.2)}${RC}/>
  <path d="M20 4C27.6 4 30.6 15 30.6 21C30.6 27.4 25.8 30.8 20 30.8C14.2 30.8 9.4 27.4 9.4 21C9.4 15 12.4 4 20 4z" fill="${u('ege')}"/>
  <g clip-path="${u('egc')}">
    <g ${ol('#ff9ab4', 0.3)} opacity="0.6">${Array.from({ length: 9 }, (_, i) => `<path d="M${8 + i * 3} 4Q${10 + i * 3} 18 ${8 + i * 3} 32"/>`).join('')}</g>
    <g ${ol(u('egd'), 0.9)}>${Array.from({ length: 6 }, (_, i) => `<path d="M${2 + i * 6} 2L${22 + i * 6} 34M${38 - i * 6} 2L${18 - i * 6} 34"/>`).join('')}</g>
    <g fill="${u('egp')}">${[[20, 10.6], [14, 20.2], [26, 20.2], [20, 29.6], [16.8, 15.4], [23.2, 15.4], [16.8, 25], [23.2, 25]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.85"/>`).join('')}</g>
    <path d="M8 18.6Q20 21.6 32 18.6L32 21.4Q20 24.4 8 21.4z" fill="${u('egd')}" ${sk('#6a3a04', 0.35)}/>
    <g fill="${u('egs')}">${[11.6, 16, 20, 24, 28.4].map((x) => `<circle cx="${x}" cy="${n(20.4 + (1 - ((x - 20) / 12) ** 2) * 1.4)}" r="0.9"/>`).join('')}</g>
  </g>
  <path d="M20 4C27.6 4 30.6 15 30.6 21C30.6 27.4 25.8 30.8 20 30.8C14.2 30.8 9.4 27.4 9.4 21C9.4 15 12.4 4 20 4z" ${ol('#3a0210', 0.55)}/>
  <circle cx="20" cy="4" r="1.6" fill="${u('egs')}" ${sk('#6a3a04', 0.45)}/><path d="M18.4 5.2Q20 6.4 21.6 5.2" ${ol(u('egd'), 0.9)}/>
  <ellipse cx="15.6" cy="11.6" rx="1.8" ry="3.4" fill="#fff" opacity="0.5" transform="rotate(20 15.6 11.6)"/>
  ${spark(33, 9, 2.2)}${spark(6, 15, 1.5)}${spark(31.6, 30, 1.3)}`,

  carpet: `<defs>${lin('cr1', [[0, '#d83a3a'], [1, '#8a141e']])}${lin('crr', [[0, '#e85a4a'], [0.4, '#b8202a'], [1, '#5a0810']])}<clipPath id="aql-crc"><rect width="30" height="22" rx="0.6"/></clipPath></defs>
  ${shadow(20, 35, 17, 2)}
  <g transform="translate(9 14.4) matrix(1 0 -0.42 0.88 0 0)">
    <rect width="30" height="22" rx="0.6" fill="${u('cr1')}" ${sk('#3a0408', 0.6)}/>
    <g clip-path="${u('crc')}">
      <rect x="1.6" y="1.6" width="26.8" height="18.8" ${ol('#1a2a6a', 2.2)}/>
      <rect x="1.6" y="1.6" width="26.8" height="18.8" ${ol('#f2c04a', 0.5)} stroke-dasharray="1.2 0.8"/>
      <rect x="3.8" y="3.8" width="22.4" height="14.4" ${ol('#f2c04a', 0.5)}/>
      <path d="M15 4.6L24.4 11L15 17.4L5.6 11z" fill="#1a2a6a" ${sk('#f2c04a', 0.6)}/>
      <path d="M15 7.2L20.4 11L15 14.8L9.6 11z" fill="#f2c04a"/>
      <path d="M15 8.8L17.8 11L15 13.2L12.2 11z" fill="#d83a3a"/>
      <g fill="#f2c04a">${[[5.6, 5.6], [24.4, 5.6], [5.6, 16.4], [24.4, 16.4]].map(([x, y]) => `<path d="M${x} ${y - 1.4}l1.4 1.4-1.4 1.4-1.4-1.4z"/>`).join('')}</g>
    </g>
    <path d="M1 22v1.6M3 22v1.6M5 22v1.6M7 22v1.6M9 22v1.6M11 22v1.6M13 22v1.6M15 22v1.6M17 22v1.6M19 22v1.6M21 22v1.6M23 22v1.6M25 22v1.6M27 22v1.6M29 22v1.6" ${sk('#f6ecd6', 0.7)}${RC}/>
  </g>
  <rect x="9.6" y="9.6" width="28" height="7.4" rx="3.7" fill="${u('crr')}" ${sk('#3a0408', 0.55)}/>
  <path d="M12 11.4H35M12 15.2H35" ${ol('#f2c04a', 0.6)} stroke-dasharray="1.4 1"/>
  <path d="M13 13.3H34" ${ol('#1a2a6a', 1.2)}/>
  <ellipse cx="9.6" cy="13.3" rx="2.4" ry="3.7" fill="#a8202a" ${sk('#3a0408', 0.5)}/>
  <path d="M9.6 13.3m-.6 0a.6 .9 0 1 1 1.2 .2a1.3 1.8 0 1 1-2.4-.4a2 2.8 0 1 1 3.4 1" ${ol('#f2c04a', 0.45)}/>
  <path d="M11 10.6H36" ${sk('#fff', 0.6)} opacity="0.4"${RC}/>
  ${spark(34, 5, 2)}${spark(5, 10, 1.4)}`,

  // ------------------------------------------------------------- legendary
  trident: `${halo('#ffd86a', '#4ad8e8')}<defs>${rad('tdg', GOLD, 0.36, 0.25, 0.9)}${lin('tdl', [[0, '#fff3b4'], [0.4, '#e8b030'], [1, '#7a4806']], 1, 0)}${rad('tdj', [[0, '#e8fffc'], [0.45, '#3ad8d0'], [1, '#0a5a6a']], 0.35, 0.3, 0.8)}</defs>
  ${shadow(20, 36.4, 10, 1.6, 0.3)}
  <g transform="rotate(14 20 20)" ${sk('#5a3204', 0.5)}${LJ}>
    <rect x="18.8" y="16" width="2.4" height="21" rx="1" fill="${u('tdl')}"/>
    <path d="M18.8 26l2.4 1.4M18.8 28l2.4 1.4M18.8 30l2.4 1.4" stroke="#7a4806" stroke-width="0.5"/>
    <path d="M11 6L12.6 2.4 14.2 6 13.6 6V12Q13.6 15.4 20 15.4Q26.4 15.4 26.4 12V6L25.8 6 27.4 2.4 29 6 28.4 6V12.6Q28.4 18.6 20 18.6Q11.6 18.6 11.6 12.6V6z" fill="${u('tdg')}"/>
    <path d="M18.6 15.4V3.6L17.4 3.6 20 -1.6 22.6 3.6 21.4 3.6V15.4z" fill="${u('tdg')}"/>
    <path d="M13.6 8.6l-1.8 1.2M26.4 8.6l1.8 1.2M18.6 7.4l-1.6 1.2M21.4 7.4l1.6 1.2" stroke-width="0.8"${RC}/>
    <circle cx="20" cy="17" r="2.6" fill="${u('tdj')}" stroke="#5a3204"/>
    <path d="M14.6 13.6Q17 16.4 20 16.4" fill="none" stroke="#fff4b0" stroke-width="0.6" opacity="0.8"/>
  </g>
  <path d="M8.4 31.4Q9.4 26 15 26.6Q12 28 13.6 30.4Q15.6 32.6 20.6 31.4Q26.6 30 31 32.4Q26.4 35.8 18.6 35.2Q10.4 34.8 8.4 31.4z" fill="#3ad8d0" opacity="0.85" ${sk('#0a5a6a', 0.45)}/>
  <path d="M10.4 31.6Q13 34 19 33.6" ${ol('#e8fffc', 0.7)} opacity="0.9"${RC}/>
  <g fill="#e8fffc"><circle cx="31.4" cy="28.6" r="0.7"/><circle cx="33.4" cy="30.4" r="0.5"/><circle cx="7.6" cy="27.4" r="0.6"/></g>
  ${shine(14, 6.6, 0.8, 0.8)}${spark(34, 6, 2.6)}${spark(5.4, 10, 1.8, '#e8fffc')}`,

  bottleShip: `${halo('#ffd86a', '#5ac8ff')}<defs>${lin('bsg', [[0, '#ffffff', 0.55], [0.4, '#d8f2ff', 0.12], [1, '#7ab8d8', 0.45]], 0, 1)}${rad('bsd', GOLD, 0.36, 0.25, 0.9)}${lin('bsw', WOOD)}${lin('bss', [[0, '#5ac8e8'], [1, '#0a4a7a']])}</defs>
  ${shadow(20, 35.6, 15, 1.9, 0.3)}
  <path d="M5 33.4H33V35.2H5z" fill="${u('bsw')}" ${sk('#1e0c04', 0.4)}/>
  <path d="M9 33.4Q9 29.4 12 28.6H14Q17 29.4 17 33.4zM23 33.4Q23 29.4 26 28.6H28Q31 29.4 31 33.4z" fill="${u('bsw')}" ${sk('#1e0c04', 0.4)}/>
  <rect x="4.4" y="11.6" width="25.2" height="18.4" rx="8.4" fill="#d8f2ff" opacity="0.18"/>
  <path d="M5.6 25Q12 22.6 18 24.6T28.6 24.4V26Q28 29.4 22 29.4H12Q6.2 29.4 5.4 26z" fill="${u('bss')}"/>
  <path d="M6 25Q12 23 18 25T28.4 24.8" ${ol('#e8fbff', 0.5)} opacity="0.8"/>
  <g ${sk('#6a3a04', 0.4)}${LJ}>
    <path d="M9 22.4H26.6L24.4 26H11.4z" fill="${u('bsd')}"/>
    <path d="M24.4 22.4L27.6 20.4L26.6 22.4z" fill="${u('bsd')}"/>
    <path d="M12.6 22.4V12.4M17.6 22.4V10.6M22.4 22.4V13" stroke="#6a3a04" stroke-width="0.6"/>
    <path d="M10.6 13.4Q12.6 14.6 14.6 13.4V20.6Q12.6 21.6 10.6 20.6z M15.4 11.6Q17.6 12.8 19.8 11.6V20.4Q17.6 21.4 15.4 20.4z M20.6 14Q22.4 15 24.2 14V20.4Q22.4 21.2 20.6 20.4z" fill="#fff6d8"/>
    <path d="M17.6 10.6l2-.7-2-.6" fill="#c8283a"/>
  </g>
  <path d="M10.2 23.8h14.6" ${sk('#fff4b0', 0.5)} opacity="0.8"/>
  <path d="M4.4 20.8A8.4 8.4 0 0 1 12.8 11.6H21.2A8.4 8.4 0 0 1 29.6 18V18.4H34.4V23.2H29.6A8.4 8.4 0 0 1 21.2 30H12.8A8.4 8.4 0 0 1 4.4 20.8z" fill="${u('bsg')}" ${sk('#4a7a92', 0.55)}${LJ}/>
  <rect x="34" y="18" width="3.4" height="5.6" rx="0.8" fill="#c8a06a" ${sk('#5a3a14', 0.45)}/>
  <path d="M8 15.4Q12 12.6 20 12.8" ${ol('#fff', 1.2)} opacity="0.85"${RC}/>
  <path d="M30.4 19.4h3.4" ${ol('#fff', 0.6)} opacity="0.7"${RC}/>
  ${spark(34.6, 9, 2.4)}${spark(5.6, 7.4, 1.6)}${spark(15, 18, 1.1)}`,

  sceptre: `${halo('#7ab8ff', '#ffc84a')}<defs>${rad('scg', GOLD, 0.36, 0.25, 0.9)}${lin('scl', [[0, '#fff3b4'], [0.4, '#e8b030'], [1, '#7a4806']], 1, 0)}${rad('scs', [[0, '#e0f2ff'], [0.3, '#6ab0ff'], [0.7, '#1a48c8'], [1, '#08164a']], 0.36, 0.32, 0.75)}${rad('scr', RUBY, 0.35, 0.3, 0.8)}${rad('scp', PEARL, 0.35, 0.3, 0.8)}</defs>
  ${shadow(20, 36.4, 11, 1.6, 0.3)}
  <g transform="rotate(32 20 20)" ${sk('#5a3204', 0.5)}${LJ}>
    <rect x="18.7" y="15" width="2.6" height="20" rx="1" fill="${u('scl')}"/>
    <ellipse cx="20" cy="21" rx="2.4" ry="1" fill="${u('scg')}"/><ellipse cx="20" cy="28" rx="2.2" ry="0.9" fill="${u('scg')}"/>
    <circle cx="20" cy="24.6" r="1" fill="${u('scr')}"/><circle cx="20" cy="31.4" r="0.9" fill="${u('scr')}"/>
    <circle cx="20" cy="36" r="1.8" fill="${u('scg')}"/>
    <path d="M15.6 15.6Q20 18.4 24.4 15.6L23 13.4H17z" fill="${u('scg')}"/>
    <circle cx="20" cy="8.8" r="5.4" fill="${u('scs')}" stroke="#08164a"/>
    <path d="M15.4 11.4Q16.6 15 20 15.4Q23.4 15 24.6 11.4M14.8 8.4Q15 4 17.6 3.6M25.2 8.4Q25 4 22.4 3.6M20 3.4V14.2" fill="none" stroke="#e8b030" stroke-width="0.9"/>
    <path d="M20 3.4V0.2M18.6 1.4H21.4" fill="none" stroke="${u('scg')}" stroke-width="1.2"${RC}/>
    <circle cx="20" cy="3.4" r="1" fill="${u('scp')}" stroke-width="0.3"/>
    <ellipse cx="17.8" cy="6.8" rx="1.3" ry="1.8" fill="#fff" opacity="0.6" stroke="none" transform="rotate(30 17.8 6.8)"/>
  </g>
  <g fill="${u('scp')}"><circle cx="11.4" cy="14.6" r="0.9"/><circle cx="13.6" cy="17.4" r="0.8"/></g>
  ${spark(34, 6, 2.6)}${spark(6, 26, 1.8)}${spark(33, 27.6, 1.4)}`,

  sunstone: `${halo('#ffb83a', '#ff6a2a')}<defs>${rad('ssc', [[0, '#fffbe0'], [0.3, '#ffd86a'], [0.7, '#ff8a1a'], [1, '#a83a06']], 0.5, 0.45, 0.6)}${rad('ssb', [[0, '#fff3c0'], [0.45, '#deb04e'], [1, '#7c5416']], 0.4, 0.3, 0.9)}</defs>
  ${shadow(20, 36.4, 11, 1.7, 0.3)}
  <ellipse cx="20" cy="33" rx="10.6" ry="3" fill="${u('ssb')}" ${sk('#5a3a06', 0.5)}/>
  <ellipse cx="20" cy="32.6" rx="8.6" ry="2.2" fill="#3a2406"/>
  <path d="M20 30.6l1 1.8-1 1.8-1-1.8zM14.4 32.6l3.6-.6v1.2zM25.6 32.6l-3.6-.6v1.2z" fill="#e8b84a"/>
  ${facets([
    ['20,2.4 27.6,10.6 20,13.4', '#fff2b8'], ['20,2.4 12.4,10.6 20,13.4', '#ffd25a'],
    ['12.4,10.6 20,13.4 20,24.4 12.4,21.4', '#ff9a24'], ['27.6,10.6 20,13.4 20,24.4 27.6,21.4', '#ffbe4a'],
    ['12.4,21.4 20,24.4 20,30.4', '#d8620e'], ['27.6,21.4 20,24.4 20,30.4', '#b84a08'],
  ], '#7a2a04')}
  <circle cx="20" cy="17.4" r="5.4" fill="${u('ssc')}" opacity="0.9"/>
  <g ${sk('#fffbe0', 0.6)}${RC} opacity="0.95">${Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return `<path d="M${n(20 + Math.cos(a) * 2.6)} ${n(17.4 + Math.sin(a) * 2.6)}L${n(20 + Math.cos(a) * 4.2)} ${n(17.4 + Math.sin(a) * 4.2)}"/>`;
  }).join('')}</g>
  <circle cx="20" cy="17.4" r="1.9" fill="#fffbe0"/>
  <path d="M14.2 11.6L18.6 4.6" ${ol('#fff', 0.8)} opacity="0.85"${RC}/>
  <polygon points="20,2.4 27.6,10.6 27.6,21.4 20,30.4 12.4,21.4 12.4,10.6" ${ol('#5a1e02', 0.6)}${LJ}/>
  ${spark(33.6, 6, 2.6)}${spark(5.4, 12, 1.8)}${spark(32, 25, 1.4)}${spark(8.4, 26.4, 1.2, '#fffbe0')}`,

  krakenInk: `${halo('#8a6aff', '#2ae0c8')}<defs>${rad('kig', [[0, '#ffffff', 0.55], [0.5, '#bfe6ff', 0.18], [1, '#6aa8d8', 0.35]], 0.34, 0.3, 0.8)}${lin('kik', [[0, '#4a2470'], [0.5, '#22093a'], [1, '#0a0212']])}${lin('kic', [[0, '#ecc28e'], [1, '#8a5a2a']])}${lin('kiw', [[0, '#c23a6a'], [1, '#5a0a2a']])}</defs>
  ${shadow(20, 36.4, 9.4, 1.8, 0.3)}
  <path d="M10.3 23.4Q15 21.6 20 23T29.7 23.4Q30 24.2 30 25A10 10 0 0 1 10 25Q10 24.2 10.3 23.4z" fill="${u('kik')}"/>
  <path d="M13 28.6Q16.4 24.6 20.6 27.4T27.4 26.4" ${ol('#7a5aff', 0.7)} opacity="0.7"${RC}/>
  <path d="M14.6 31.4Q19 29.2 22.4 31.2" ${ol('#2ae0c8', 0.6)} opacity="0.6"${RC}/>
  <g fill="#7affea"><circle cx="15.4" cy="26" r="0.55"/><circle cx="24.6" cy="29.6" r="0.45"/><circle cx="21" cy="25" r="0.35"/><circle cx="18" cy="32" r="0.4"/></g>
  <path d="M17 7V14.6Q10 17.4 10 25A10 10 0 0 0 30 25Q30 17.4 23 14.6V7z" fill="${u('kig')}" ${sk('#d8f0ff', 0.7)}${LJ}/>
  <path d="M12.6 21.4Q11.8 24 12.4 27" ${ol('#fff', 1.1)} opacity="0.75"${RC}/>
  <path d="M18.4 8.6V13.4" ${ol('#fff', 0.8)} opacity="0.6"${RC}/>
  <rect x="16.4" y="6.4" width="7.2" height="2.2" rx="0.8" fill="${u('kiw')}" ${sk('#3a0418', 0.4)}/>
  <path d="M16.8 8.6q-.4 2 .6 2.6M23.2 8.6q.6 1.6-.4 3" ${ol('#8a1a44', 0.9)}${RC}/>
  <rect x="17.2" y="2.4" width="5.6" height="4.4" rx="1" fill="${u('kic')}" ${sk('#5a3410', 0.45)}/>
  <path d="M22.6 3.4Q26.6 2.4 27.4 5.4T30.6 7.6" ${ol('#2a0c3a', 1.4)}${RC}/>
  <circle cx="30.6" cy="7.6" r="0.6" fill="#2a0c3a"/>
  <path d="M23 9.6l5.6 2-1.4 4-5.6-2z" fill="#f2e2b8" ${sk('#8a6a3a', 0.35)}${LJ}/>
  <path d="M23.4 11.8l3.4 1.2M23 13l2.4.8" ${sk('#8a6a3a', 0.35)}${RC}/>
  ${shine(14.4, 19.6, 1.4, 0.6)}${spark(34, 18, 2.2, '#e8fffc')}${spark(5.6, 13, 1.6)}${spark(33.4, 31, 1.3)}`,

  krakenBeak: `${halo('#ffb52e', '#c84a8a')}<defs>${lin('kbu', [[0, '#8a6a74'], [0.35, '#4a2a3a'], [1, '#100410']], 0.7, 1)}${lin('kbl', [[0, '#5a3a48'], [1, '#0c0208']], 0.4, 1)}${rad('kbg', GOLD, 0.35, 0.3, 0.85)}${rad('kbj', [[0, '#d8fff8'], [0.45, '#2ad0c0'], [1, '#08505a']], 0.35, 0.3, 0.8)}</defs>
  ${shadow(20, 36, 13.4, 1.9, 0.3)}
  <path d="M9 22.6Q14.4 20.2 22 21.2Q27.6 22.2 28.8 25.4Q26.6 30.6 20 31.4Q12.6 31.8 8.8 27z" fill="${u('kbl')}" ${sk('#080006', 0.5)}${LJ}/>
  <path d="M11 27.4Q16 29.2 23.6 27.2" ${ol('#a07a8a', 0.6)} opacity="0.5"${RC}/>
  <path d="M7.4 18.6Q9 8.4 20.4 6.8Q31 6 34.2 14Q35.8 19.6 32.4 26.4Q31.4 21.2 28.2 18.8Q22 15.8 14 19.4Q10 20.8 7.4 18.6z" fill="${u('kbu')}" ${sk('#080006', 0.55)}${LJ}/>
  <path d="M10.6 14.4Q19.6 8.6 30.6 12.6" ${ol('#d8b8c4', 0.8)} opacity="0.55"${RC}/>
  <path d="M30.6 15.6Q33 19.4 32.4 24" ${ol('#d8b8c4', 0.6)} opacity="0.4"${RC}/>
  <path d="M13 21.2Q20.6 17.8 27.6 19.8" ${ol('#000', 0.6)} opacity="0.5"${RC}/>
  <ellipse cx="7.8" cy="22.6" rx="3" ry="6" fill="${u('kbg')}" ${sk('#6a3a04', 0.55)}/>
  <path d="M6.2 17.6Q8.6 22.6 6.2 27.6" ${ol('#7a4a06', 0.5)} opacity="0.7"/>
  <circle cx="8.2" cy="22.6" r="1.4" fill="${u('kbj')}" ${sk('#6a3a04', 0.35)}/>
  <path d="M5.6 27.8Q4 31 5.4 34" ${ol('#a0182a', 1)}${RC}/>
  <path d="M4.4 33.4h2.2l.6 3.2h-3.4z" fill="#c8283a" ${sk('#5a0812', 0.35)}${LJ}/>
  ${shine(18, 9.8, 1.8, 0.55)}${spark(35.4, 30, 2.4)}${spark(31, 4.4, 1.8)}${spark(4.4, 9, 1.4)}`,
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
