// Exports the web game's sailor (src/ships/crewModel.ts) for the Godot game,
// sculpted by the web game's own code, so both crews are the same people.
//
//   cd godot && node tools/crew/bake_crew.mjs   (after npm ci at the repo root)
//
// Bundles tools/crew/entry.ts with the web build's rolldown and runs it. The
// sculpt's joint pivots and face anchors are private to crewModel.ts, so the
// bundle exports them on the way through; the shader-only and simplifier
// modules it imports are stubbed out (nothing here renders). Writes
// art/crew.json and art/crew.bin (the levels of detail, see entry.ts) and
// shaders/inc/crew_rig.gdshaderinc (the anchors, for shaders/crew.gdshader).
// Run it again whenever the web game's sailor changes.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const { build } = await import(pathToFileURL(join(root, 'node_modules', 'rolldown', 'dist', 'index.mjs')).href);

const EXPOSE = [
  'SPINE', 'NECK', 'SH_X', 'SH_Y', 'EL_Y', 'HIP_X', 'HIP_Y', 'KNEE_Y', 'HX', 'KN_Y', 'FM_Y', 'PARROT', 'PART', 'BIT',
  'S_EYE', 'S_MOUTH', 'S_NOSE', 'S_EAR', 'S_CHIN_Y', 'S_JAW', 'bucketOf', 'OWN_MESH',
];
const STUBS = {
  // the material patcher and the simplifier worker: browser-only, and unused by the sculpt
  'render/environment': 'export const patchMaterial = (m) => m;',
  'render/lod': 'export const simplifiedLevels = async () => [];',
};

const tmp = mkdtempSync(join(tmpdir(), 'aquati-crew-'));
const bundle = join(tmp, 'entry.mjs');
try {
  await build({
    input: join(here, 'entry.ts'),
    platform: 'node',
    cwd: root,
    logLevel: 'warn',
    output: { file: bundle, format: 'esm' },
    plugins: [
      {
        name: 'crew-bake',
        load(id) {
          for (const [k, code] of Object.entries(STUBS)) if (id.replace(/\\/g, '/').endsWith(`src/${k}.ts`)) return code;
          return null;
        },
        transform(code, id) {
          if (!id.replace(/\\/g, '/').endsWith('src/ships/crewModel.ts')) return null;
          return `${code}\nexport { ${EXPOSE.join(', ')} };\n`;
        },
      },
    ],
  });
  execFileSync(process.execPath, [bundle, join(here, '..', '..')], { stdio: 'inherit', cwd: root });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
