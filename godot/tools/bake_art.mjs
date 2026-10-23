// Bakes the web game's drawn plunder and shot (src/ui/lootArt.ts and
// src/ui/ammoArt.ts, generated SVG) into art/plunder.json, which the Godot
// HUD rasterizes at the screen's density (see src/ui/icons.gd):
//
//   cd godot && node --experimental-strip-types tools/bake_art.mjs
//
// Each entry is the SVG's inner markup on its 40-unit grid, with the web's
// per-copy gradient ids put back to their plain names.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..', '..', 'src');
const { lootIcon } = await import(join(web, 'ui', 'lootArt.ts'));
const { ammoIcon } = await import(join(web, 'ui', 'ammoArt.ts'));

// the goods, in the order the web's manifest lists them
const manifest = readFileSync(join(web, 'game', 'treasure.ts'), 'utf8');
const ids = [...manifest.matchAll(/^\s*K\('(\w+)'/gm)].map((m) => m[1]);
const shot = ['round', 'shell', 'fire', 'chain', 'grape'];

// The engine's rasterizer has no pattern fills: a patterned cloth is painted
// in its ground colour instead.
const unpattern = (svg) => {
  for (const m of svg.matchAll(/<pattern id="([^"]+)"[^>]*>(.*?)<\/pattern>/g)) {
    const ground = /<rect[^>]*fill="([^"]+)"/.exec(m[2]);
    svg = svg.replace(m[0], '').replaceAll(`url(#${m[1]})`, ground ? ground[1] : '#888');
  }
  return svg;
};

const inner = (svg) =>
  unpattern(
    svg
      .replace(/^<svg[^>]*>/, '')
      .replace(/<\/svg>$/, '')
      .replace(/\b(aq[la]-[A-Za-z0-9]+)-\d+\b/g, '$1')
      .replace(/\s*\n\s*/g, ''),
  );

const out = { view: [0, 0, 40, 40], loot: {}, shot: {} };
for (const id of ids) out.loot[id] = inner(lootIcon(id));
for (const id of shot) out.shot[id] = inner(ammoIcon(id));
writeFileSync(join(here, '..', 'art', 'plunder.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`art/plunder.json: ${ids.length} goods, ${shot.length} kinds of shot`);
