// Renders the app icon ("Fair Winds": a hand-built toy galleon scene, drawn by scripts/icon/rig)
// into every PWA / favicon size, the landing page icons and the Godot Android launcher icons.
// Run: NODE_PATH=$(npm root -g) node scripts/make-icons.mjs   (needs playwright + chromium + imagemagick)
// Re-render the art first with scripts/icon/rig/render.mjs if the scene changes.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const OUT = new URL('../public/icons/', import.meta.url).pathname;
const ROOT = new URL('../', import.meta.url).pathname;
const art = f => 'data:image/png;base64,' + readFileSync(new URL(`./icon/${f}`, import.meta.url)).toString('base64');
const full = art('fair-winds.png'); // the hero framing
const safe = art('fair-winds-safe.png'); // pulled back so masts and bowsprit survive a circle mask

// crop: [x, y, size] of the 1024² capture; round: iOS-style squircle with rim + gloss
const page = ({ size, crop, round, shot = full }) => {
  const [x, y, s] = crop;
  const k = size / s, r = size * 0.2227;
  return `<style>html,body{margin:0;background:transparent}
  .i{position:relative;width:${size}px;height:${size}px;overflow:hidden;${round ? `border-radius:${r}px` : ''}}
  .i img{position:absolute;left:${-x * k}px;top:${-y * k}px;width:${1024 * k}px;height:${1024 * k}px}
  .g{position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.12),rgba(255,255,255,0) 30%)}
  .r{position:absolute;inset:0;border-radius:${r}px;box-shadow:inset 0 0 0 ${Math.max(1, size / 205)}px rgba(255,255,255,.2)}</style>
  <div class="i"><img src="${shot}">${round ? '<div class="g"></div><div class="r"></div>' : ''}</div>`;
};

const ICON = [0, 0, 1024]; // the galleon fills the frame
const BLEED = [0, 0, 1024]; // maskable / adaptive: from the pulled-back render, she sits inside the safe zone
const TINY = [190, 150, 720]; // favicons: closer in so sails and hull still read at 16 px

const pw = createRequire(import.meta.url)('playwright');
const browser = await pw.chromium.launch();
const tab = await browser.newPage();
const shoot = async (opts, file, dir = OUT) => {
  await tab.setViewportSize({ width: opts.size, height: opts.size });
  await tab.setContent(page(opts));
  await tab.screenshot({ path: dir + file, omitBackground: true });
};
await shoot({ size: 512, crop: ICON, round: true }, 'icon-512.png');
await shoot({ size: 192, crop: ICON, round: true }, 'icon-192.png');
await shoot({ size: 512, crop: BLEED, shot: safe }, 'icon-maskable-512.png');
await shoot({ size: 192, crop: BLEED, shot: safe }, 'icon-maskable-192.png');
await shoot({ size: 180, crop: ICON }, 'apple-touch-icon.png');
await shoot({ size: 180, crop: ICON }, 'apple-touch-icon.png', ROOT + 'landing/');
await shoot({ size: 192, crop: ICON, round: true }, 'icon-192.png', ROOT + 'landing/');
// Godot Android: legacy + adaptive launcher (the foreground layer stays empty; the art is the background)
await shoot({ size: 512, crop: ICON, round: true }, 'icon.png', ROOT + 'godot/');
await shoot({ size: 192, crop: ICON, round: true }, 'icon-192.png', ROOT + 'godot/art/');
await shoot({ size: 432, crop: BLEED, shot: safe }, 'icon-adaptive-bg.png', ROOT + 'godot/art/');
await shoot({ size: 48, crop: TINY, round: true }, 'favicon-48.png');
await shoot({ size: 32, crop: TINY, round: true }, 'favicon-32.png');
await shoot({ size: 16, crop: TINY, round: true }, 'favicon-16.png');
await browser.close();
execFileSync('convert', ['favicon-16.png', 'favicon-32.png', 'favicon-48.png', '../favicon.ico'], { cwd: OUT });
execFileSync('cp', [ROOT + 'public/favicon.ico', ROOT + 'landing/favicon.ico']);
for (const f of ['favicon-16.png', 'favicon-48.png']) execFileSync('rm', [OUT + f]);
console.log('icons written to', OUT);
