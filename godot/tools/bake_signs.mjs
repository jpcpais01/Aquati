// Bakes the trading ports' painted signs and town flags (the web game's
// signAtlas and flagAtlas in src/port/tradePort.ts) into art/town_signs.png
// and art/town_flags.png, and Puerto Marézia's three painted boards and the
// glyphs its musician and its sleeper give off (signAtlas and glyphTexture in
// src/port/port.ts) into art/home_signs.png and art/home_glyphs.png, drawn in
// a browser canvas with the game's own Cinzel, the way the web draws them at
// load:
//
//   cd godot && node tools/bake_signs.mjs
//
// (Playwright's Chromium does the drawing: put the playwright package on
// NODE_PATH if it isn't installed here.) The towns' names and colours are
// read from the web's TRADE_SPECS. A name too long for its board is set a
// size smaller to fit, where the web's canvas would run it off both ends.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const { chromium } = createRequire(import.meta.url)('playwright');

// the specs, straight out of the web's source
const src = readFileSync(join(root, '..', 'src', 'port', 'tradePort.ts'), 'utf8');
const block = src.slice(src.indexOf('export const TRADE_SPECS'), src.indexOf('// ------------------------------------------------------------------ shared art'));
const specs = [...block.matchAll(/name: '([^']+)',[\s\S]*?house: '((?:[^'\\]|\\.)+)',[\s\S]*?trim: (0x[0-9a-f]+),[\s\S]*?flag: \[(0x[0-9a-f]+), (0x[0-9a-f]+), (0x[0-9a-f]+)\]/g)].map((m) => ({
  name: m[1],
  house: m[2].replace(/\\'/g, "'"),
  trim: parseInt(m[3], 16),
  flag: [parseInt(m[4], 16), parseInt(m[5], 16), parseInt(m[6], 16)],
}));
if (specs.length !== 6) throw new Error(`found ${specs.length} trade specs, expected 6`);
// and the home port's boards
const home = readFileSync(join(root, '..', 'src', 'port', 'port.ts'), 'utf8');
const rows = [...(home.match(/const SIGN_ROWS = \[([^\]]+)\]/) ?? ['', ''])[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
if (rows.length !== 3) throw new Error(`found ${rows.length} home port boards, expected 3`);

const font = readFileSync(join(root, 'fonts', 'cinzel-700.woff2')).toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<style>@font-face { font-family: Cinzel; font-weight: 700; src: url(data:font/woff2;base64,${font}) format('woff2'); }</style><div style="font: 700 20px Cinzel">Aquati</div>`);
await page.evaluate(() => document.fonts.ready);
const out = await page.evaluate((specs) => {
  const SIGN_W = 512;
  const SIGN_H = 96;
  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
  const signs = document.createElement('canvas');
  signs.width = SIGN_W;
  signs.height = SIGN_H * specs.length * 3;
  const g = signs.getContext('2d');
  specs.forEach((sp, i) => {
    [sp.name, sp.house, 'Warehouse'].forEach((text, k) => {
      const y = (i * 3 + k) * SIGN_H;
      const grad = g.createLinearGradient(0, y, 0, y + SIGN_H);
      grad.addColorStop(0, k === 0 ? '#2a1a10' : '#6d4628');
      grad.addColorStop(1, k === 0 ? '#120b06' : '#4a2e18');
      g.fillStyle = grad;
      g.fillRect(0, y, SIGN_W, SIGN_H);
      g.strokeStyle = k === 0 ? hex(sp.trim === 0xe2b552 ? 0xffd263 : 0xe2b552) : '#e2b552';
      g.lineWidth = 5;
      g.strokeRect(6, y + 6, SIGN_W - 12, SIGN_H - 12);
      const caps = text.toUpperCase();
      let size = text.length > 15 ? 40 : 50;
      g.font = `700 ${size}px Cinzel`;
      const room = SIGN_W - 44;
      const w = g.measureText(caps).width;
      if (w > room) {
        size = Math.floor((size * room) / w);
        g.font = `700 ${size}px Cinzel`;
      }
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(30,16,6,0.8)';
      g.strokeText(caps, SIGN_W / 2, y + SIGN_H / 2 + 3);
      g.fillStyle = k === 0 ? '#ffe39a' : '#f7e2a8';
      g.fillText(caps, SIGN_W / 2, y + SIGN_H / 2 + 3);
    });
  });
  const flags = document.createElement('canvas');
  flags.width = 256;
  flags.height = 160 * specs.length;
  const f = flags.getContext('2d');
  specs.forEach((sp, i) => {
    const y = i * 160;
    const [a, b, d] = sp.flag;
    f.fillStyle = hex(a);
    f.fillRect(0, y, 256, 160);
    f.fillStyle = hex(d);
    f.fillRect(0, y + 56, 256, 48);
    f.fillStyle = hex(b);
    f.fillRect(0, y + 66, 256, 28);
    f.beginPath();
    f.arc(78, y + 80, 34, 0, Math.PI * 2);
    f.fillStyle = '#f2c45a';
    f.fill();
    f.lineWidth = 6;
    f.strokeStyle = '#8a5a12';
    f.stroke();
    f.font = '700 38px Cinzel';
    f.textAlign = 'center';
    f.textBaseline = 'middle';
    f.fillStyle = '#8a5a12';
    f.fillText(sp.name[0], 78, y + 82);
  });
  return [signs.toDataURL('image/png'), flags.toDataURL('image/png')];
}, specs);
const homeOut = await page.evaluate((rows) => {
  // the web's signAtlas, its three boards (the fourth row, the loft's wall
  // of flags, the game draws from the famous colours' own flags)
  const W = 512;
  const RH = 96;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = RH * rows.length;
  const g = c.getContext('2d');
  rows.forEach((text, r) => {
    const y = r * RH;
    const grad = g.createLinearGradient(0, y, 0, y + RH);
    grad.addColorStop(0, '#6d4628');
    grad.addColorStop(1, '#4a2e18');
    g.fillStyle = grad;
    g.fillRect(0, y, W, RH);
    g.globalAlpha = 0.18;
    g.fillStyle = '#000';
    for (let i = 1; i < 4; i++) g.fillRect(0, y + (i * RH) / 4, W, 2);
    g.globalAlpha = 1;
    g.strokeStyle = '#e2b552';
    g.lineWidth = 5;
    g.strokeRect(6, y + 6, W - 12, RH - 12);
    g.font = '700 50px Cinzel, Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(30,16,6,0.8)';
    g.strokeText(text.toUpperCase(), W / 2, y + RH / 2 + 3);
    g.fillStyle = '#f7e2a8';
    g.fillText(text.toUpperCase(), W / 2, y + RH / 2 + 3);
  });
  // the web's glyphTexture: a note and a snore, side by side
  const gl = document.createElement('canvas');
  gl.width = 128;
  gl.height = 64;
  const q = gl.getContext('2d');
  [['\u266a', '#ffe6a6'], ['z', '#e8f4ff']].forEach(([ch, color], i) => {
    q.font = '700 54px Georgia, serif';
    q.textAlign = 'center';
    q.textBaseline = 'middle';
    q.lineWidth = 7;
    q.strokeStyle = 'rgba(20,12,6,0.85)';
    q.strokeText(ch, 32 + i * 64, 34);
    q.fillStyle = color;
    q.fillText(ch, 32 + i * 64, 34);
  });
  return [c.toDataURL('image/png'), gl.toDataURL('image/png')];
}, rows);
await browser.close();
const png = (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
writeFileSync(join(root, 'art', 'town_signs.png'), png(out[0]));
writeFileSync(join(root, 'art', 'town_flags.png'), png(out[1]));
writeFileSync(join(root, 'art', 'home_signs.png'), png(homeOut[0]));
writeFileSync(join(root, 'art', 'home_glyphs.png'), png(homeOut[1]));
console.log(`art/town_signs.png and art/town_flags.png: ${specs.map((s) => s.name).join(', ')}`);
console.log(`art/home_signs.png: ${rows.join(', ')}; art/home_glyphs.png`);
