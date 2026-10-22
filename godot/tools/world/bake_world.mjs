// Exports the world for the Godot game from the web game's own generator
// (src/world/terrain.ts and friends), so both games sail the same seas.
//
//   cd godot && node tools/world/bake_world.mjs   (after npm ci at the repo root)
//
// Bundles tools/world/entry.ts with the web build's rolldown and runs it; the
// files land in godot/world/ and the tiling textures in godot/art/ (see
// entry.ts for what each holds). Run it again whenever the web game's
// islands, reefs, sites or plants change.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const { build } = await import(pathToFileURL(join(root, 'node_modules', 'rolldown', 'dist', 'index.mjs')).href);

const tmp = mkdtempSync(join(tmpdir(), 'aquati-world-'));
const bundle = join(tmp, 'entry.mjs');
try {
  await build({
    input: join(here, 'entry.ts'),
    platform: 'node',
    cwd: root,
    logLevel: 'warn',
    output: { file: bundle, format: 'esm' },
  });
  const t0 = Date.now();
  execFileSync(process.execPath, [bundle, join(here, '..', '..', 'world')], { stdio: 'inherit', cwd: root });
  console.log(`baked in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
