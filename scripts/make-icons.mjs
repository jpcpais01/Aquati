// Renders the Aquati app icon (hand-built SVG) into every PWA / favicon size.
// Run: NODE_PATH=$(npm root -g) node scripts/make-icons.mjs   (needs playwright + chromium)
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const OUT = new URL('../public/icons/', import.meta.url).pathname;

// Billowing square sail hung from a yard at (cx, top), `w` wide, `h` tall.
const sail = (cx, top, w, h, belly = 26) => {
  const l = cx - w / 2, r = cx + w / 2, b = top + h;
  return `<path d="M${l} ${top} Q${cx} ${top - 6} ${r} ${top}
    Q${r + 14} ${top + h * 0.5} ${r + 8} ${b} Q${cx} ${b + belly} ${l - 8} ${b}
    Q${l - 14} ${top + h * 0.5} ${l} ${top}Z" fill="url(#sail)" stroke="#b89c6c" stroke-width="3" stroke-linejoin="round"/>
  <path d="M${l - 6} ${b - h * 0.32} Q${cx} ${b - h * 0.32 + belly} ${r + 10} ${b - h * 0.32} L${r + 8} ${b} Q${cx} ${b + belly} ${l - 8} ${b}Z" fill="#c9a874" opacity=".28"/>
  <path d="M${l + w * 0.18} ${top + 8} Q${l + w * 0.1} ${top + h * 0.55} ${l + w * 0.2} ${b - 4}" stroke="#fff" stroke-width="${w * 0.06}" stroke-linecap="round" fill="none" opacity=".55"/>
  <rect x="${l - 10}" y="${top - 7}" width="${w + 20}" height="10" rx="5" fill="#4a2a16"/>`;
};

const palm = (x, y, s, lean) => `<g transform="translate(${x} ${y}) scale(${s}) rotate(${lean})">
  <path d="M0 0 Q6 -60 22 -118" stroke="#6b4425" stroke-width="9" stroke-linecap="round" fill="none"/>
  <g fill="#1f8a5a" transform="translate(22 -118)">
    <path d="M0 0 Q-40 -26 -78 4 Q-40 -12 0 0Z"/><path d="M0 0 Q40 -30 82 0 Q40 -14 0 0Z"/>
    <path d="M0 0 Q-24 -46 -56 -50 Q-22 -32 0 0Z" fill="#2fae6e"/><path d="M0 0 Q26 -48 60 -46 Q24 -30 0 0Z" fill="#2fae6e"/>
    <path d="M0 0 Q-34 6 -54 40 Q-26 14 0 0Z" fill="#17734a"/><path d="M0 0 Q36 8 58 38 Q28 14 0 0Z" fill="#17734a"/>
    <circle r="7" fill="#5a3a1e"/>
  </g></g>`;

// Gun ports along the hull side.
const ports = Array.from({ length: 8 }, (_, i) => {
  const x = 440 + i * 44, y = 742 - Math.sin((i / 7) * Math.PI) * 4 - (i > 5 ? (i - 5) * 6 : 0);
  return `<rect x="${x}" y="${y}" width="24" height="18" rx="4" fill="#e8b85a"/><rect x="${x + 3}" y="${y + 3}" width="18" height="12" rx="2.5" fill="#1d0f08"/>`;
}).join('');

const scene = `
  <!-- sky -->
  <rect x="-300" y="-300" width="1624" height="912" fill="url(#sky)"/>
  <circle cx="830" cy="400" r="330" fill="url(#halo)"/>
  <g fill="#fff" opacity=".85">
    <path d="M70 250 Q80 200 135 210 Q160 165 215 185 Q260 170 275 215 Q320 215 315 250Z"/>
    <path d="M600 150 Q612 118 650 124 Q672 96 708 112 Q740 104 748 134 Q776 136 772 158Z" opacity=".7"/>
  </g>
  <circle cx="830" cy="400" r="92" fill="url(#sun)"/>
  <g stroke="#173a4a" stroke-width="5" stroke-linecap="round" fill="none" opacity=".75">
    <path d="M372 300 q14 -12 26 0 q12 -12 26 0"/><path d="M450 350 q10 -8 19 0 q9 -8 19 0"/>
  </g>
  <!-- far isle -->
  <path d="M880 604 Q930 560 990 575 Q1060 560 1330 604Z" fill="#4f9fa0" opacity=".75"/>
  <!-- sea -->
  <rect x="-300" y="600" width="1624" height="724" fill="url(#sea)"/>
  <ellipse cx="830" cy="700" rx="70" ry="110" fill="url(#glint)"/>
  <g stroke="#fff4cf" stroke-linecap="round" opacity=".8">
    <path d="M790 628h80M804 652h52M782 680h96M812 712h40M796 748h70" stroke-width="5"/>
  </g>
  <!-- island -->
  <g>
    <path d="M-300 612 Q-60 600 40 560 Q120 470 230 500 Q300 520 340 596 Q370 606 400 612Z" fill="url(#hill)"/>
    <path d="M60 545 Q130 488 200 512 Q150 506 100 548Z" fill="#7fd08a" opacity=".55"/>
    <path d="M-300 612 Q100 590 410 612 Q300 630 -300 632Z" fill="#f4dca2"/>
    <path d="M-300 630 Q100 616 420 614 Q320 640 -300 646Z" fill="#7fe3d6" opacity=".7"/>
    ${palm(120, 528, 1.0, -8)}${palm(205, 512, 0.85, 10)}${palm(290, 560, 0.7, 4)}
  </g>
  <!-- ship shadow / reflection -->
  <ellipse cx="575" cy="822" rx="330" ry="34" fill="#053246" opacity=".45"/>
  <!-- ship -->
  <g>
    <g stroke="#2b1b10" stroke-width="2.5" opacity=".55" fill="none">
      <path d="M560 172 L320 628M560 172 L900 606M720 236 L905 604M400 290 L300 628"/>
    </g>
    <rect x="394" y="270" width="12" height="400" rx="5" fill="#4a2c18"/>
    <rect x="554" y="160" width="14" height="530" rx="6" fill="#4a2c18"/>
    <rect x="714" y="224" width="13" height="460" rx="6" fill="#4a2c18"/>
    <!-- mizzen lateen + topsail -->
    <path d="M400 300 L404 618 L300 624 Q330 470 400 300Z" fill="url(#sail)" stroke="#b89c6c" stroke-width="3" stroke-linejoin="round"/>
    ${sail(400, 330, 120, 90, 18)}
    <!-- main -->
    ${sail(561, 214, 196, 112, 20)}${sail(561, 346, 238, 132, 26)}${sail(561, 498, 262, 120, 30)}
    <!-- jibs -->
    <path d="M722 252 L902 606 L744 572Z" fill="url(#sail2)" stroke="#b89c6c" stroke-width="3" stroke-linejoin="round"/>
    <path d="M722 300 L862 640 L736 640Z" fill="url(#sail)" stroke="#b89c6c" stroke-width="3" stroke-linejoin="round" opacity=".96"/>
    <!-- fore -->
    ${sail(720, 270, 168, 100, 18)}${sail(720, 388, 206, 120, 24)}${sail(720, 526, 222, 104, 26)}
    <!-- crow's nest + flags -->
    <rect x="540" y="196" width="42" height="12" rx="5" fill="#4a2c18"/>
    <path d="M567 162 Q600 150 628 166 Q608 172 640 184 Q600 190 567 182Z" fill="url(#flag)"/>
    <path d="M727 226 Q752 218 772 230 Q752 238 727 240Z" fill="#e8b85a"/>
    <path d="M406 272 Q428 264 446 276 Q428 284 406 286Z" fill="#e8b85a"/>
    <!-- bowsprit -->
    <path d="M840 676 L930 598" stroke="#4a2c18" stroke-width="11" stroke-linecap="round"/>
    <!-- hull -->
    <path d="M286 626 L382 634 L388 664 Q560 704 852 668 Q842 744 790 790 Q700 820 470 818 Q350 812 316 730 Z" fill="url(#hull)"/>
    <path d="M284 624 L382 632 L388 662 Q560 702 852 666 L856 682 Q560 722 386 680 L380 648 L290 644Z" fill="url(#gold)"/>
    <path d="M318 724 Q560 792 806 762" stroke="url(#gold)" stroke-width="9" fill="none" stroke-linecap="round"/>
    ${ports}
    <!-- stern gallery -->
    <path d="M290 646 L380 650 L386 700 L304 690Z" fill="#3b2012"/>
    <g fill="#ffd36e"><rect x="304" y="656" width="16" height="22" rx="4"/><rect x="328" y="658" width="16" height="22" rx="4"/><rect x="352" y="660" width="16" height="22" rx="4"/></g>
    <path d="M300 702 Q340 730 384 712" stroke="url(#gold)" stroke-width="6" fill="none"/>
    <circle cx="300" cy="624" r="9" fill="#ffd36e"/><circle cx="300" cy="624" r="22" fill="#ffd36e" opacity=".25"/>
    <!-- figurehead -->
    <path d="M846 668 Q872 676 870 702 Q858 690 842 690Z" fill="url(#gold)"/>
    <!-- rim light on hull top -->
    <path d="M392 668 Q560 706 848 672" stroke="#ffe7a6" stroke-width="3" fill="none" opacity=".7"/>
  </g>
  <!-- reflection streaks -->
  <g stroke="#0a4f68" stroke-linecap="round" opacity=".35"><path d="M360 846h120M520 858h170M410 872h90M600 880h110" stroke-width="7"/></g>
  <!-- waterline foam + bow wave + wake -->
  <path d="M312 786 Q330 800 352 794 Q372 808 396 800 Q420 814 446 806 Q474 818 502 810 Q532 820 562 812 Q594 822 624 812 Q656 820 686 808 Q716 816 742 802 Q770 806 790 790 Q776 818 740 824 Q620 842 470 836 Q350 830 312 786Z" fill="#effbf8"/>
  <path d="M800 782 Q842 756 872 772 Q906 786 916 818 Q894 806 880 816 Q868 800 846 808 Q830 796 798 804Z" fill="#fff"/>
  <circle cx="902" cy="770" r="7" fill="#fff"/><circle cx="922" cy="790" r="5" fill="#fff"/><circle cx="886" cy="752" r="4" fill="#fff"/>
  <path d="M316 800 Q200 812 60 852 Q200 838 330 822Z" fill="#dff7f4" opacity=".8"/>
  <path d="M300 826 Q180 852 20 912 Q170 876 320 840Z" fill="#dff7f4" opacity=".45"/>
  <g fill="#fffbe8"><path d="M200 700 l6 -18 6 18 18 6 -18 6 -6 18 -6 -18 -18 -6Z" opacity=".9"/><path d="M930 690 l4 -12 4 12 12 4 -12 4 -4 12 -4 -12 -12 -4Z"/><path d="M110 760 l4 -11 4 11 11 4 -11 4 -4 11 -4 -11 -11 -4Z" opacity=".7"/></g
>
  <!-- foreground swell -->
  <path d="M-300 905 Q60 860 300 900 T760 896 T1324 890 L1324 1324 L-300 1324Z" fill="url(#swell)"/>
  <path d="M-300 905 Q60 860 300 900 T760 896 T1324 890" stroke="#a8f0ea" stroke-width="7" fill="none" opacity=".55"/>
  <g fill="#c8fbf5" opacity=".5"><ellipse cx="150" cy="960" rx="60" ry="6"/><ellipse cx="620" cy="980" rx="90" ry="7"/><ellipse cx="880" cy="950" rx="50" ry="5"/></g>
`;

const defs = `<defs>
  <linearGradient id="sky" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="612">
    <stop offset="0" stop-color="#1b6f9c"/><stop offset=".5" stop-color="#4cb4d2"/><stop offset=".86" stop-color="#bfe8dc"/><stop offset="1" stop-color="#ffe6ae"/></linearGradient>
  <radialGradient id="halo"><stop offset="0" stop-color="#fff3c2" stop-opacity=".95"/><stop offset=".35" stop-color="#ffe09a" stop-opacity=".45"/><stop offset="1" stop-color="#ffe09a" stop-opacity="0"/></radialGradient>
  <radialGradient id="sun"><stop offset="0" stop-color="#fffef4"/><stop offset=".7" stop-color="#fff0b8"/><stop offset="1" stop-color="#ffd772"/></radialGradient>
  <linearGradient id="sea" gradientUnits="userSpaceOnUse" x1="0" y1="600" x2="0" y2="1024">
    <stop offset="0" stop-color="#56d6cf"/><stop offset=".35" stop-color="#1ca9b4"/><stop offset="1" stop-color="#0a5f80"/></linearGradient>
  <linearGradient id="swell" gradientUnits="userSpaceOnUse" x1="0" y1="880" x2="0" y2="1100">
    <stop offset="0" stop-color="#1497a6"/><stop offset="1" stop-color="#063f5c"/></linearGradient>
  <radialGradient id="glint" cy=".1" r=".9"><stop offset="0" stop-color="#fff6d0" stop-opacity=".8"/><stop offset="1" stop-color="#fff6d0" stop-opacity="0"/></radialGradient>
  <linearGradient id="hill" gradientUnits="userSpaceOnUse" x1="0" y1="480" x2="0" y2="612">
    <stop offset="0" stop-color="#46b96e"/><stop offset="1" stop-color="#1b7a52"/></linearGradient>
  <linearGradient id="sail" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffdf6"/><stop offset=".6" stop-color="#f5ead2"/><stop offset="1" stop-color="#dcc79e"/></linearGradient>
  <linearGradient id="sail2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff8e4"/><stop offset="1" stop-color="#e6cf9e"/></linearGradient>
  <linearGradient id="hull" gradientUnits="userSpaceOnUse" x1="0" y1="640" x2="0" y2="820">
    <stop offset="0" stop-color="#9a5e33"/><stop offset=".55" stop-color="#6a3b1f"/><stop offset="1" stop-color="#3a1f10"/></linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2c4"/><stop offset=".5" stop-color="#efc463"/><stop offset="1" stop-color="#b98227"/></linearGradient>
  <linearGradient id="flag" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e2453a"/><stop offset="1" stop-color="#a8221f"/></linearGradient>
  <radialGradient id="vig" cx=".5" cy=".45" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#021a28" stop-opacity=".45"/></radialGradient>
  <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <clipPath id="round"><rect width="1024" height="1024" rx="228"/></clipPath>
</defs>`;

// scale < 1 keeps the ship inside the maskable safe zone; the backdrop is oversized so it still bleeds.
const build = ({ scale = 1, round = false }) => {
  const t = (1 - scale) * 512;
  const body = `<g transform="translate(${t} ${t}) scale(${scale})">${scene}</g>
  <rect width="1024" height="1024" fill="url(#vig)"/>`;
  const framed = round
    ? `<g clip-path="url(#round)">${body}<rect width="1024" height="1024" fill="url(#gloss)"/></g>
  <rect x="3" y="3" width="1018" height="1018" rx="225" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="6"/>`
    : body;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${defs}${framed}</svg>`;
};

const variants = {
  any: build({ round: true }),
  full: build({}),
  mask: build({ scale: 0.86 }),
};
writeFileSync(OUT + 'icon.svg', variants.any.replace(/\n\s*/g, ' '));

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
await shoot(variants.any, 48, 'favicon-48.png');
await shoot(variants.any, 32, 'favicon-32.png');
await shoot(variants.any, 16, 'favicon-16.png');
await browser.close();
execFileSync('convert', ['favicon-16.png', 'favicon-32.png', 'favicon-48.png', '../favicon.ico'], { cwd: OUT });
for (const f of ['favicon-16.png', 'favicon-48.png']) execFileSync('rm', [OUT + f]);
console.log('icons written to', OUT);
