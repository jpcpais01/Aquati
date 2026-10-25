// Bakes the cutthroats' colours (the web game's jollyRoger in
// src/shore/kit.ts: a grinning skull over crossed cutlasses, frayed at the
// fly) into art/jolly_roger.png, drawn in a browser canvas the way the web
// draws it at load:
//
//   cd godot && node tools/bake_roger.mjs
//
// (Playwright's Chromium does the drawing: put the playwright package on
// NODE_PATH if it isn't installed here.) The drawing is lifted straight out
// of the web's source, so the two games fly the same flag.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const { chromium } = createRequire(import.meta.url)('playwright');

const src = readFileSync(join(root, '..', 'src', 'shore', 'kit.ts'), 'utf8');
const a = src.indexOf('function jollyRoger()');
const b = src.indexOf('const t = new THREE.CanvasTexture(c);', a);
if (a < 0 || b < 0) throw new Error('jollyRoger not found in src/shore/kit.ts');
// the body up to the texture: it leaves its canvas in `c`
// (TypeScript's non-null marks are all it has that a browser won't run)
const body = src.slice(src.indexOf('{', a) + 1, b).replace(/\)!/g, ')');

const browser = await chromium.launch();
const page = await browser.newPage();
const url = await page.evaluate((code) => {
  const TAU = Math.PI * 2;
  // (the frayed fly is drawn with Math.random: a fixed seed keeps the bake steady)
  let s = 7;
  Math.random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const c = new Function('TAU', `${code}; return c;`)(TAU);
  return c.toDataURL('image/png');
}, body);
await browser.close();
writeFileSync(join(root, 'art', 'jolly_roger.png'), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
console.log('art/jolly_roger.png');
