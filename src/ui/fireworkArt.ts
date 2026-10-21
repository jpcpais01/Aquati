// Little portraits of each firework for the rack, the picker and the
// pyrotechnist's stall: the shape of the burst itself, in its own colours, on
// a soft glow. SVG so they stay crisp at any size.

import { FIREWORKS, FireworkId } from '../game/fireworks';

const f = (n: number) => +n.toFixed(2);
const pol = (r: number, a: number, cx = 20, cy = 20): [number, number] => [f(cx + Math.cos(a) * r), f(cy + Math.sin(a) * r)];
const dot = (x: number, y: number, r: number, c: string, o = 1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"${o < 1 ? ` opacity="${o}"` : ''}/>`;

/** A ring of n dots at radius r. */
const dots = (n: number, r: number, size: number, c: string, rot = 0, o = 1) => {
  let s = '';
  for (let i = 0; i < n; i++) {
    const [x, y] = pol(r, rot + (i / n) * Math.PI * 2);
    s += dot(x, y, size, c, o);
  }
  return s;
};

/** Rays from r0 to r1 with a bright tip. */
const rays = (n: number, r0: number, r1: number, c: string, tip: string, w = 1.1, rot = 0) => {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const [x0, y0] = pol(r0, a);
    const [x1, y1] = pol(r1, a);
    s += `<path d="M${x0} ${y0}L${x1} ${y1}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" opacity="0.8"/>${dot(x1, y1, w * 0.95, tip)}`;
  }
  return s;
};

/** A twinkle: a four-pointed star. */
const twinkle = (x: number, y: number, r: number, c: string) =>
  `<path d="M${x} ${f(y - r)}Q${f(x + r * 0.18)} ${f(y - r * 0.18)} ${f(x + r)} ${y}Q${f(x + r * 0.18)} ${f(y + r * 0.18)} ${x} ${f(y + r)}Q${f(x - r * 0.18)} ${f(y + r * 0.18)} ${f(x - r)} ${y}Q${f(x - r * 0.18)} ${f(y - r * 0.18)} ${x} ${f(y - r)}z" fill="${c}"/>`;

function glyph(id: FireworkId): string {
  const { css: a, css2: b } = FIREWORKS[id];
  switch (id) {
    case 'peony':
      return dots(18, 13, 1.5, a) + dots(12, 8.5, 1.3, b, 0.26) + dots(6, 4, 1.1, '#fff4e6', 0.5) + dot(20, 20, 1.6, '#fff');
    case 'chrysanthemum':
      return rays(20, 3.5, 14, a, b, 0.95) + dot(20, 20, 2.4, '#fff8e0');
    case 'willow': {
      let s = '';
      for (let i = 0; i < 9; i++) {
        const ang = -Math.PI * 0.92 + (i / 8) * Math.PI * 0.84;
        const [x1, y1] = pol(9, ang);
        const dx = Math.cos(ang) * 4;
        s += `<path d="M20 19Q${f(x1 + dx * 0.4)} ${f(y1 - 3)} ${f(x1 + dx)} ${f(y1 + 6)}T${f(x1 + dx * 1.2)} ${f(y1 + 17)}" stroke="${i % 2 ? b : a}" stroke-width="1.05" fill="none" stroke-linecap="round" opacity="0.9"/>`;
      }
      return s + dot(20, 19, 2, '#fff2c8');
    }
    case 'palm': {
      let s = `<path d="M20 38V20" stroke="${b}" stroke-width="1.6" stroke-dasharray="1.4 1.3" stroke-linecap="round"/>`;
      for (let i = 0; i < 7; i++) {
        const ang = -Math.PI / 2 + (i - 3) * 0.52;
        const [x1, y1] = pol(13, ang, 20, 18);
        const [xm, ym] = pol(8, ang - 0.1 * Math.sign(i - 3 || 1), 20, 15);
        s += `<path d="M20 19Q${xm} ${ym} ${x1} ${f(y1 + 6)}" stroke="${a}" stroke-width="1.9" fill="none" stroke-linecap="round"/>${dot(x1, f(y1 + 6), 1.2, b)}`;
      }
      return s + dot(20, 19, 2, '#fffbe0');
    }
    case 'ring':
      return (
        `<ellipse cx="20" cy="20" rx="14" ry="7" fill="none" stroke="${a}" stroke-width="1.6" stroke-dasharray="0.1 3.1" stroke-linecap="round" transform="rotate(-24 20 20)"/>` +
        `<ellipse cx="20" cy="20" rx="12" ry="5.5" fill="none" stroke="${b}" stroke-width="1.6" stroke-dasharray="0.1 3" stroke-linecap="round" transform="rotate(38 20 20)"/>` +
        dot(20, 20, 1.8, '#fff')
      );
    case 'crossette': {
      let s = '';
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + 0.3;
        const [x1, y1] = pol(11, ang);
        const [x0, y0] = pol(3, ang);
        s += `<path d="M${x0} ${y0}L${x1} ${y1}" stroke="${a}" stroke-width="1.1" stroke-linecap="round" opacity="0.8"/>`;
        for (let q = 0; q < 4; q++) {
          const [x2, y2] = pol(3.6, ang + Math.PI / 4 + (q * Math.PI) / 2, x1, y1);
          s += `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${b}" stroke-width="0.9" stroke-linecap="round"/>${dot(x2, y2, 0.8, b)}`;
        }
      }
      return s + dot(20, 20, 1.7, '#fff');
    }
    case 'strobe':
      return (
        twinkle(20, 20, 7, '#fff') +
        twinkle(9, 12, 3.6, a) +
        twinkle(31, 11, 3, b) +
        twinkle(30, 29, 4, a) +
        twinkle(10, 29, 2.8, b) +
        dots(8, 12.5, 0.9, a, 0.4, 0.7)
      );
    case 'crackle': {
      let s = dots(10, 9, 1.6, a, 0.2) + dot(20, 20, 2, '#fff3cf');
      for (let i = 0; i < 10; i++) {
        const [x, y] = pol(14.5, 0.2 + (i / 10) * Math.PI * 2);
        s += twinkle(x, y, 2.3, i % 2 ? b : '#fffbe8');
      }
      return s;
    }
    case 'fish': {
      let s = '';
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + 0.25;
        const [x1, y1] = pol(13, ang);
        const [xa, ya] = pol(6, ang + 0.45);
        const [xb, yb] = pol(9.5, ang - 0.4);
        const c = i % 2 ? b : a;
        s += `<path d="M20 20C${xa} ${ya} ${xb} ${yb} ${x1} ${y1}" stroke="${c}" stroke-width="1.15" fill="none" stroke-linecap="round" opacity="0.85"/>${dot(x1, y1, 1.7, c)}`;
      }
      return s + dot(20, 20, 1.5, '#fff');
    }
    case 'saturn':
      return (
        `<radialGradient id="aqf-sat" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#fff"/><stop offset="0.35" stop-color="${a}"/><stop offset="1" stop-color="${a}" stop-opacity="0.25"/></radialGradient>` +
        `<circle cx="20" cy="20" r="7.5" fill="url(#aqf-sat)"/>` +
        `<ellipse cx="20" cy="20" rx="15" ry="4.6" fill="none" stroke="${b}" stroke-width="1.7" stroke-dasharray="0.1 2.6" stroke-linecap="round" transform="rotate(-18 20 20)"/>`
      );
    case 'kraken': {
      let s = '';
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + 0.2;
        const [x1, y1] = pol(9, ang);
        const [x2, y2] = pol(14, ang + 0.55);
        const [x3, y3] = pol(11.5, ang + 1.0);
        s += `<path d="M20 20Q${x1} ${y1} ${x2} ${y2}T${x3} ${y3}" stroke="${i % 2 ? b : a}" stroke-width="1.6" fill="none" stroke-linecap="round"/>${dot(x3, y3, 0.9, '#eafff6')}`;
      }
      return s + `<circle cx="20" cy="20" r="4.4" fill="${a}" opacity="0.85"/>` + dot(18.6, 19.2, 1, '#ffe27a') + dot(21.4, 19.2, 1, '#ffe27a');
    }
    case 'roger':
      return (
        `<path d="M8 31 32 22M8 22 32 31" stroke="#efe7d6" stroke-width="2.4" stroke-linecap="round"/>` +
        dot(8, 22, 1.6, '#efe7d6') + dot(32, 31, 1.6, '#efe7d6') + dot(8, 31, 1.6, '#efe7d6') + dot(32, 22, 1.6, '#efe7d6') +
        `<path d="M20 5.5c-6 0-9.5 4-9.5 9 0 3 1.4 5 3.2 6.2V25h12.6v-4.3c1.8-1.2 3.2-3.2 3.2-6.2 0-5-3.5-9-9.5-9z" fill="${a}"/>` +
        `<circle cx="16.3" cy="14.8" r="2.4" fill="${b}"/><circle cx="23.7" cy="14.8" r="2.4" fill="${b}"/>` +
        `<path d="M20 17.6l-1.3 2.4h2.6z" fill="#1b1d2a"/>` +
        `<path d="M15.6 22.4v2.2M18.5 22.4v2.2M21.5 22.4v2.2M24.4 22.4v2.2" stroke="#1b1d2a" stroke-width="0.9"/>`
      );
    case 'fortune':
      return (
        dots(14, 15, 1.1, b, 0.1, 0.85) +
        `<path d="M9 25 7.5 13l6.5 5 6-8.5 6 8.5 6.5-5L31 25z" fill="${a}" stroke="#fff3c0" stroke-width="0.8" stroke-linejoin="round"/>` +
        `<rect x="9" y="25.5" width="22" height="3.6" rx="1.2" fill="${a}"/>` +
        dot(7.5, 12.5, 1.6, '#fff6d0') + dot(20, 9.2, 1.8, '#fff6d0') + dot(32.5, 12.5, 1.6, '#fff6d0') +
        dot(20, 20, 1.7, b) + dot(14, 21.5, 1.2, '#7be0ff') + dot(26, 21.5, 1.2, '#7be08a') +
        `<ellipse cx="13" cy="34" rx="3" ry="1.4" fill="${a}"/><ellipse cx="27" cy="35" rx="3" ry="1.4" fill="${a}"/><ellipse cx="20" cy="36.2" rx="2.6" ry="1.2" fill="#fff0a8"/>`
      );
  }
}

let uid = 0;

/** A firework's portrait. Each copy gets its own gradient ids (see ammoIcon). */
export function fireworkIcon(id: FireworkId): string {
  const k = `-${++uid}`;
  const { css } = FIREWORKS[id];
  const show = FIREWORKS[id].tier === 2;
  const body = glyph(id).replace(/(id="|url\(#)(aqf-[a-z]+)/g, `$1$2${k}`);
  return `<svg class="fw-ico${show ? ' show' : ''}" viewBox="0 0 40 40" aria-hidden="true"><defs><radialGradient id="aqf-glow${k}"><stop offset="0" stop-color="${css}" stop-opacity="0.55"/><stop offset="0.55" stop-color="${css}" stop-opacity="0.14"/><stop offset="1" stop-color="${css}" stop-opacity="0"/></radialGradient></defs><circle cx="20" cy="20" r="19" fill="url(#aqf-glow${k})"/>${body}</svg>`;
}
