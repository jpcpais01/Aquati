// Renders the app icon ("Reef from Above": the brig over a reef, captured by the game's own
// engine with scripts/icon/capture.mjs) into every PWA / favicon size.
// Run: NODE_PATH=$(npm root -g) node scripts/make-icons.mjs   (needs playwright + chromium + imagemagick)
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const OUT = new URL('../public/icons/', import.meta.url).pathname;
const SRC = new URL('./icon/reef-from-above.png', import.meta.url).pathname;
const shot = 'data:image/png;base64,' + readFileSync(SRC).toString('base64');

// crop: [x, y, size] of the 1024² capture; round: iOS-style squircle with rim + gloss
const page = ({ size, crop, round }) => {
  const [x, y, s] = crop;
  const k = size / s, r = size * 0.2227;
  return `<style>html,body{margin:0;background:transparent}
  .i{position:relative;width:${size}px;height:${size}px;overflow:hidden;${round ? `border-radius:${r}px` : ''}}
  .i img{position:absolute;left:${-x * k}px;top:${-y * k}px;width:${1024 * k}px;height:${1024 * k}px;filter:saturate(1.18) contrast(1.06) brightness(1.03)}
  .v{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,transparent 58%,rgba(2,22,36,.42) 100%)}
  .g{position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.16),rgba(255,255,255,0) 36%)}
  .r{position:absolute;inset:0;border-radius:${r}px;box-shadow:inset 0 0 0 ${Math.max(1, size / 205)}px rgba(255,255,255,.2)}</style>
  <div class="i"><img src="${shot}"><div class="v"></div>${round ? '<div class="g"></div><div class="r"></div>' : ''}</div>`;
};

const ICON = [90, 70, 880]; // the brig fills the frame
const BLEED = [0, 0, 1024]; // maskable: launchers crop to a circle, so keep her inside the safe zone
const TINY = [200, 150, 660]; // favicons: closer in so the hull still reads at 16 px

const pw = createRequire(import.meta.url)('playwright');
const browser = await pw.chromium.launch();
const tab = await browser.newPage();
const shoot = async (opts, file) => {
  await tab.setViewportSize({ width: opts.size, height: opts.size });
  await tab.setContent(page(opts));
  await tab.screenshot({ path: OUT + file, omitBackground: true });
};
await shoot({ size: 512, crop: ICON, round: true }, 'icon-512.png');
await shoot({ size: 192, crop: ICON, round: true }, 'icon-192.png');
await shoot({ size: 512, crop: BLEED }, 'icon-maskable-512.png');
await shoot({ size: 192, crop: BLEED }, 'icon-maskable-192.png');
await shoot({ size: 180, crop: ICON }, 'apple-touch-icon.png');
await shoot({ size: 48, crop: TINY, round: true }, 'favicon-48.png');
await shoot({ size: 32, crop: TINY, round: true }, 'favicon-32.png');
await shoot({ size: 16, crop: TINY, round: true }, 'favicon-16.png');
await browser.close();
execFileSync('convert', ['favicon-16.png', 'favicon-32.png', 'favicon-48.png', '../favicon.ico'], { cwd: OUT });
for (const f of ['favicon-16.png', 'favicon-48.png']) execFileSync('rm', [OUT + f]);
console.log('icons written to', OUT);
