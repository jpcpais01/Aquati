// Renders the Shores of Fortune app icon (hand-built SVG) into every PWA / favicon size.
// A galleon in silhouette crossing a golden-hour sun over a turquoise sea: the dark ship
// on the gold disc is the shape that has to survive down to a 16px favicon.
// Run: NODE_PATH=$(npm root -g) node scripts/make-icons.mjs   (needs playwright + chromium)
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const OUT = new URL('../public/icons/', import.meta.url).pathname;
const HORIZON = 655;
const SUN = { x: 512, y: 452, r: 258 };

// Deterministic jitter so every run draws the same glitter.
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// Billowing square sail hung from a yard at (cx, top), `w` wide, `h` tall.
const sail = (cx, top, w, h, belly = 20) => {
  const l = cx - w / 2, r = cx + w / 2, b = top + h;
  return `<path class="sl" d="M${l} ${top} Q${cx} ${top - 6} ${r} ${top}
    Q${r + 13} ${top + h * 0.5} ${r + 7} ${b} Q${cx} ${b + belly} ${l - 7} ${b}
    Q${l - 13} ${top + h * 0.5} ${l} ${top}Z"/>
  <path d="M${r + 7} ${b} Q${cx} ${b + belly} ${l - 7} ${b}" class="rim"/>
  <rect x="${l - 9}" y="${top - 6}" width="${w + 18}" height="9" rx="4.5" class="spar"/>`;
};

const ship = (small) => {
  const ports = small ? '' : Array.from({ length: 7 }, (_, i) => {
    const x = 432 + i * 40, y = 650 - Math.sin((i / 6) * Math.PI) * 5 - i * 1.2;
    return `<rect x="${x}" y="${y}" width="15" height="11" rx="3"/>`;
  }).join('');
  return `
  <!-- reflection -->
  <path d="M330 700 Q520 724 740 696 Q700 760 520 770 Q380 764 330 700Z" fill="#051c2e" opacity=".35"/>
  <!-- masts -->
  <g class="spar">
    <rect x="395" y="330" width="11" height="300" rx="5"/>
    <rect x="514" y="196" width="13" height="430" rx="6"/>
    <rect x="636" y="246" width="12" height="370" rx="6"/>
  </g>
  <!-- bowsprit -->
  <path d="M740 592 L878 516" stroke="#0a1d2f" stroke-width="13" stroke-linecap="round"/>
  ${small ? '' : `<g stroke="#0a1d2f" stroke-width="3" fill="none" opacity=".9">
    <path d="M520 200 L878 516M642 250 L330 572M520 200 L330 560"/>
  </g>`}
  <!-- jibs -->
  <path class="sl" d="M648 268 L860 520 L722 546 Q700 400 648 268Z"/>
  <path class="sl" d="M650 330 L812 556 L712 566 Q690 450 650 330Z"/>
  <!-- mizzen -->
  <path class="sl" d="M404 438 L406 566 L314 562 Q344 496 404 438Z"/>
  ${sail(400, 372, 104, 60, 16)}
  <!-- main -->
  ${sail(520, 232, 150, 76)}
  ${sail(520, 324, 196, 98)}
  ${sail(520, 440, 236, 116, 24)}
  <!-- fore -->
  ${sail(642, 282, 130, 66)}
  ${sail(642, 366, 168, 88)}
  ${sail(642, 470, 204, 102, 22)}
  <!-- crow's nest + colours -->
  <rect x="502" y="268" width="38" height="11" rx="4" class="spar"/>
  <path d="M526 198 Q566 186 600 200 Q586 206 618 216 Q574 224 526 214Z" fill="url(#flag)"/>
  <path d="M647 248 Q668 242 684 252 Q668 258 647 260Z" fill="#e8483c"/>
  <!-- hull -->
  <path d="M316 560 L392 566 L398 600 Q540 630 690 606 L700 582 L750 580 L784 600
    Q772 662 734 700 Q520 728 352 708 Q322 660 316 560Z" fill="url(#hull)"/>
  <path d="M316 560 L392 566 L398 600 Q540 630 690 606 L700 582 L750 580 L784 600"
    class="gold" stroke-width="${small ? 10 : 7}"/>
  ${small ? '' : `<path d="M330 640 Q540 676 768 636" class="gold" stroke-width="5" opacity=".85"/>
  <g fill="#ffcf6b">${ports}</g>
  <g fill="#ffd77e"><rect x="330" y="582" width="12" height="17" rx="3"/><rect x="350" y="584" width="12" height="17" rx="3"/><rect x="370" y="586" width="12" height="17" rx="3"/></g>
  <circle cx="318" cy="552" r="8" fill="#ffe08a"/><circle cx="318" cy="552" r="22" fill="#ffd36e" opacity=".3"/>
  <path d="M784 600 Q806 604 808 626 Q796 618 780 620Z" fill="url(#gold)"/>`}
  <!-- bow wave + wake -->
  <path d="M340 700 Q380 714 420 706 Q470 720 520 712 Q580 724 640 708 Q690 714 730 694
    Q760 690 772 672 Q800 676 820 700 Q840 716 862 714 Q836 732 790 728 Q700 744 560 742 Q420 738 340 700Z" fill="#effcf8"/>
  <path d="M346 706 Q220 720 92 770 Q230 748 360 724Z" fill="#dff7f2" opacity=".7"/>
  ${small ? '' : `<circle cx="846" cy="690" r="7" fill="#fff"/><circle cx="866" cy="704" r="5" fill="#fff"/><circle cx="832" cy="676" r="4" fill="#fff"/>`}`;
};

// Sun path on the water: broken dashes that widen and fade toward the viewer.
const glitter = () => Array.from({ length: 18 }, (_, i) => {
  const y = HORIZON + 8 + i * 13 + i * i * 0.75;
  const span = 90 + i * 20;
  const h = 4 + i * 0.45;
  let out = '', x = SUN.x - span / 2 + (rnd() - 0.5) * 30;
  while (x < SUN.x + span / 2) {
    const w = 14 + rnd() * (30 + i * 4);
    if (rnd() > 0.22) out += `<rect x="${x.toFixed(1)}" y="${(y + (rnd() - 0.5) * 4).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(h / 2).toFixed(1)}" opacity="${(1 - i * 0.045).toFixed(2)}"/>`;
    x += w + 6 + rnd() * 18;
  }
  return out;
}).join('');

const palmTop = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M0 0 Q4 -30 14 -58" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path d="M14 -58 Q-14 -76 -40 -54 Q-12 -64 14 -58Q36 -80 62 -60 Q38 -66 14 -58Q-6 -54 -24 -30 Q0 -50 14 -58Q34 -54 48 -30 Q30 -50 14 -58Z"/></g>`;

const scene = (small) => `
  <rect x="-300" y="-300" width="1624" height="${HORIZON + 300}" fill="url(#sky)"/>
  <circle cx="${SUN.x}" cy="${SUN.y}" r="540" fill="url(#halo)"/>
  ${small ? '' : `<circle cx="${SUN.x}" cy="${SUN.y}" r="${SUN.r + 22}" fill="none" stroke="#ffe1a0" stroke-width="4" opacity=".4"/>
  <circle cx="${SUN.x}" cy="${SUN.y}" r="${SUN.r + 46}" fill="none" stroke="#ffe1a0" stroke-width="2.5" opacity=".18"/>`}
  <circle cx="${SUN.x}" cy="${SUN.y}" r="${SUN.r}" fill="url(#sun)"/>
  ${small ? '' : `<g stroke="#0d2a40" stroke-width="7" stroke-linecap="round" fill="none" opacity=".85">
    <path d="M168 272 q18 -16 34 0 q16 -16 34 0"/><path d="M226 330 q12 -10 23 0 q11 -10 23 0"/><path d="M820 214 q14 -12 27 0 q13 -12 27 0"/>
  </g>
  <g fill="#1f5262" color="#1f5262" opacity=".9">
    <path d="M-40 ${HORIZON + 2} Q40 600 120 606 Q180 586 236 618 Q270 630 300 ${HORIZON + 2}Z"/>
    ${palmTop(96, 610, 0.9)}${palmTop(150, 596, 1.05)}${palmTop(200, 604, 0.8)}
    <path d="M780 ${HORIZON + 2} Q850 626 920 624 Q980 612 1060 ${HORIZON + 2}Z" opacity=".75"/>
  </g>`}
  <rect x="-300" y="${HORIZON}" width="1624" height="${1324 - HORIZON}" fill="url(#sea)"/>
  <rect x="-300" y="${HORIZON}" width="1624" height="6" fill="#ffe7a8" opacity=".55"/>
  ${small ? '' : `<g stroke="#0a5573" stroke-width="5" stroke-linecap="round" fill="none" opacity=".45">
    <path d="M40 760 q40 -10 80 0M150 812 q50 -12 100 0M770 776 q44 -10 88 0M860 836 q50 -12 100 0M70 868 q40 -8 80 0"/></g>`}
  <g fill="#ffe7a8">${small ? `<rect x="392" y="${HORIZON + 14}" width="240" height="14" rx="7" opacity=".8"/>` : glitter()}</g>
  ${ship(small)}
  <!-- foreground swell -->
  <path d="M-300 900 Q40 850 300 888 T780 880 T1324 870 L1324 1324 L-300 1324Z" fill="url(#swell)"/>
  <path d="M-300 900 Q40 850 300 888 T780 880 T1324 870" stroke="#9eeee4" stroke-width="${small ? 12 : 7}" fill="none" opacity=".6"/>
  ${small ? '' : `<g fill="#c8fbf5" opacity=".45"><ellipse cx="170" cy="950" rx="64" ry="6"/><ellipse cx="640" cy="972" rx="96" ry="7"/><ellipse cx="900" cy="940" rx="54" ry="5"/></g>`}`;

const defs = (small) => `<defs>
  <style>
    .sl{fill:url(#canvas);stroke:#ffd98a;stroke-width:${small ? 9 : 4.5};stroke-linejoin:round}
    .rim{fill:none;stroke:#ffe3a0;stroke-width:${small ? 0 : 3};opacity:.55}
    .spar{fill:#0a1d2f}
    .gold{fill:none;stroke:url(#gold);stroke-linecap:round;stroke-linejoin:round}
  </style>
  <linearGradient id="sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${HORIZON}">
    <stop offset="0" stop-color="#0a2a4c"/><stop offset=".38" stop-color="#14607e"/>
    <stop offset=".66" stop-color="#4fa6a2"/><stop offset=".86" stop-color="#e9c584"/><stop offset="1" stop-color="#ffdc98"/></linearGradient>
  <radialGradient id="halo" gradientUnits="userSpaceOnUse" cx="${SUN.x}" cy="${SUN.y}" r="540">
    <stop offset=".4" stop-color="#ffd27a" stop-opacity=".6"/><stop offset=".7" stop-color="#ffb860" stop-opacity=".18"/><stop offset="1" stop-color="#ffb860" stop-opacity="0"/></radialGradient>
  <radialGradient id="sun" gradientUnits="userSpaceOnUse" cx="${SUN.x}" cy="${SUN.y - 40}" r="${SUN.r + 40}">
    <stop offset="0" stop-color="#fffdf0"/><stop offset=".4" stop-color="#ffeeb0"/><stop offset=".78" stop-color="#ffc95e"/><stop offset="1" stop-color="#f39a3e"/></radialGradient>
  <linearGradient id="sea" gradientUnits="userSpaceOnUse" x1="0" y1="${HORIZON}" x2="0" y2="1024">
    <stop offset="0" stop-color="#4ccbbd"/><stop offset=".25" stop-color="#1c9ba8"/><stop offset=".65" stop-color="#0c5f80"/><stop offset="1" stop-color="#062f4c"/></linearGradient>
  <linearGradient id="swell" gradientUnits="userSpaceOnUse" x1="0" y1="860" x2="0" y2="1100">
    <stop offset="0" stop-color="#138fa0"/><stop offset="1" stop-color="#042c47"/></linearGradient>
  <linearGradient id="canvas" gradientUnits="userSpaceOnUse" x1="0" y1="200" x2="0" y2="600">
    <stop offset="0" stop-color="#16324a"/><stop offset="1" stop-color="#0c2236"/></linearGradient>
  <linearGradient id="hull" gradientUnits="userSpaceOnUse" x1="0" y1="560" x2="0" y2="720">
    <stop offset="0" stop-color="#14283c"/><stop offset="1" stop-color="#06121e"/></linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2c4"/><stop offset=".5" stop-color="#f2c460"/><stop offset="1" stop-color="#c08a2a"/></linearGradient>
  <linearGradient id="flag" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f0503f"/><stop offset="1" stop-color="#b02622"/></linearGradient>
  <linearGradient id="bevel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4d2"/><stop offset=".45" stop-color="#f3c565"/><stop offset="1" stop-color="#c88f2e"/></linearGradient>
  <radialGradient id="vig" cx=".5" cy=".46" r=".74"><stop offset=".62" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#021a28" stop-opacity=".5"/></radialGradient>
  <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <clipPath id="round"><rect width="1024" height="1024" rx="228"/></clipPath>
</defs>`;

// scale < 1 pulls the art toward the centre (maskable safe zone); the backdrop is oversized so it still bleeds.
const build = ({ scale = 1, round = false, small = false }) => {
  const t = 512 - scale * 512 + (small ? 18 : 0);
  const body = `<g transform="translate(${t} ${t}) scale(${scale})">${scene(small)}</g>
  <rect width="1024" height="1024" fill="url(#vig)"/>`;
  const framed = round
    ? `<g clip-path="url(#round)">${body}<rect width="1024" height="1024" fill="url(#gloss)"/></g>
  <rect x="6" y="6" width="1012" height="1012" rx="222" fill="none" stroke="url(#bevel)" stroke-opacity=".8" stroke-width="${small ? 22 : 9}"/>`
    : body;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${defs(small)}${framed}</svg>`;
};

const variants = {
  any: build({ round: true }),
  full: build({}),
  mask: build({ scale: 0.9 }),
  // Favicon sizes: no hairlines, thicker rims, ship pushed in a little closer.
  tiny: build({ round: true, small: true, scale: 1.14 }),
};
writeFileSync(OUT + 'icon.svg', variants.any.replace(/\n\s*/g, ' '));
if (process.argv.includes('--svg-only')) {
  for (const [k, v] of Object.entries(variants)) writeFileSync(`/tmp/icon-${k}.svg`, v);
  process.exit(0);
}

const pw = createRequire(import.meta.url)('playwright');
const browser = await pw.chromium.launch();
const page = await browser.newPage();
const shoot = async (svg, size, file) => {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: OUT + file, omitBackground: true });
};
await shoot(variants.any, 512, 'icon-512.png');
await shoot(variants.any, 192, 'icon-192.png');
await shoot(variants.mask, 512, 'icon-maskable-512.png');
await shoot(variants.mask, 192, 'icon-maskable-192.png');
await shoot(variants.full, 180, 'apple-touch-icon.png');
await shoot(variants.tiny, 48, 'favicon-48.png');
await shoot(variants.tiny, 32, 'favicon-32.png');
await shoot(variants.tiny, 16, 'favicon-16.png');
await browser.close();
execFileSync('convert', ['favicon-16.png', 'favicon-32.png', 'favicon-48.png', '../favicon.ico'], { cwd: OUT });
for (const f of ['favicon-16.png', 'favicon-48.png']) execFileSync('rm', [OUT + f]);
console.log('icons written to', OUT);
