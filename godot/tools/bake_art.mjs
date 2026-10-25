// Bakes the web game's drawn plunder, shot and ship parts (src/ui/lootArt.ts,
// src/ui/ammoArt.ts and src/ui/partArt.ts, generated SVG) into
// art/plunder.json, which the Godot HUD rasterizes at the screen's density
// (see src/ui/icons.gd):
//
//   cd godot && node --experimental-strip-types --import ./tools/ts_resolve.mjs tools/bake_art.mjs
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
const { partIcon, standardIcon } = await import(join(web, 'ui', 'partArt.ts'));
const { fireworkIcon } = await import(join(web, 'ui', 'fireworkArt.ts'));
const { FW_ORDER } = await import(join(web, 'game', 'fireworks.ts'));

// the goods, in the order the web's manifest lists them
const manifest = readFileSync(join(web, 'game', 'treasure.ts'), 'utf8');
const ids = [...manifest.matchAll(/^\s*K\('(\w+)'/gm)].map((m) => m[1]);
const shot = ['round', 'shell', 'fire', 'chain', 'grape', 'firework'];
// the ship parts, as the web's catalogue lists them (slot:key), and the standard fit of each slot
const catalogue = readFileSync(join(web, 'ships', 'parts.ts'), 'utf8');
const parts = [...catalogue.matchAll(/^\s*P\('(\w+)', \d, '(\w+)'/gm)].map((m) => `${m[1]}:${m[2]}`);
const slots = ['hull', 'sails', 'guns', 'figure'];
if (parts.length !== 20) throw new Error(`found ${parts.length} ship parts, expected 20`);

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
      .replace(/\b(aq[laf]-[A-Za-z0-9]+)-\d+\b/g, '$1')
      .replace(/\b(pa-[A-Za-z0-9]+)-\d+\b/g, '$1')
      .replace(/\s*\n\s*/g, ''),
  );

const out = { view: [0, 0, 40, 40], loot: {}, shot: {}, parts: {}, fireworks: {} };
for (const id of ids) out.loot[id] = inner(lootIcon(id));
for (const id of shot) out.shot[id] = inner(ammoIcon(id));
for (const id of parts) out.parts[id] = inner(partIcon({ id }));
for (const id of FW_ORDER) out.fireworks[id] = inner(fireworkIcon(id));
for (const slot of slots) out.parts[`standard:${slot}`] = inner(standardIcon(slot));
writeFileSync(join(here, '..', 'art', 'plunder.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`art/plunder.json: ${ids.length} goods, ${shot.length} kinds of shot, ${parts.length} ship parts, ${FW_ORDER.length} fireworks`);
