// Bakes the Android game's sounds and music from the web game's own audio
// code (see tools/audio/entry.ts for what each one is):
//
//   cd godot && node tools/audio/bake_audio.mjs [name ...]   (after npm ci at the repo root)
//
// Bundles entry.ts with the web build's rolldown, renders every sound in
// headless Chromium's OfflineAudioContext (through Playwright: the
// `playwright` or `playwright-core` package, installed or global, with its
// Chromium) and writes godot/audio/sfx/*.wav, godot/audio/music/*.ogg (with
// ffmpeg's libvorbis) and godot/audio/sounds.json: the level each one is
// played at, which are stereo, and for a song its title, its leaning to day
// or night and when its last note is done. Names given bake only those (the
// manifest keeps the rest), and songs added to the manifest by hand are
// always kept. Run it again whenever the web game's sounds or songs change.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const out = join(here, '..', '..', 'audio');
/** Vorbis quality for the music (about 64-80 kbit/s at its rates) and for the long sounds kept as Ogg. */
const OGG_MUSIC = '2';
const OGG_SFX = '4';

function playwright() {
  const req = createRequire(import.meta.url);
  const tries = ['playwright', 'playwright-core'];
  try {
    const g = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    tries.push(...['playwright', 'playwright-core'].map((p) => join(g, p)));
  } catch {
    // no npm on the path: only local installs
  }
  for (const id of tries) {
    try {
      return req(id);
    } catch {
      // try the next
    }
  }
  throw new Error('Playwright not found: `npm i --no-save playwright-core` (or install playwright globally) and its Chromium');
}

const { build } = await import(pathToFileURL(join(root, 'node_modules', 'rolldown', 'dist', 'index.mjs')).href);
const tmp = mkdtempSync(join(tmpdir(), 'aquati-audio-'));
const bundle = join(tmp, 'entry.js');
const only = process.argv.slice(2);
const manifestPath = join(out, 'sounds.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { sfx: {}, music: {} };
try {
  await build({
    input: join(here, 'entry.ts'),
    platform: 'browser',
    cwd: root,
    logLevel: 'warn',
    // (the web's workers are never started here: their import.meta can go)
    onLog(level, log, handler) {
      if (log.code !== 'EMPTY_IMPORT_META') handler(level, log);
    },
    output: { file: bundle, format: 'iife' },
  });
  const { chromium } = playwright();
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log('  page:', m.text());
  });
  page.on('pageerror', (e) => console.log('  page error:', e.message));
  await page.setContent('<!doctype html><title>bake</title>');
  await page.addScriptTag({ content: readFileSync(bundle, 'utf8') });
  const names = await page.evaluate(() => window.aquatiBake.list());
  const todo = only.length ? names.filter((n) => only.includes(n)) : names;
  mkdirSync(join(out, 'sfx'), { recursive: true });
  mkdirSync(join(out, 'music'), { recursive: true });
  // a fresh bake drops the old levels (a song added by hand, not baked here,
  // stays in the rotation); a partial one keeps them
  if (!only.length) {
    manifest.sfx = {};
    for (const n of names) delete manifest.music[n];
  }
  let bytes = 0;
  for (const name of todo) {
    const t0 = Date.now();
    const r = await page.evaluate((n) => window.aquatiBake.render(n), name);
    const data = Buffer.from(r.wav, 'base64');
    const file = join(out, r.music ? 'music' : 'sfx', `${name}.${r.ogg ? 'ogg' : 'wav'}`);
    if (r.ogg) {
      const wav = join(tmp, `${name}.wav`);
      writeFileSync(wav, data);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libvorbis', '-q:a', r.music ? OGG_MUSIC : OGG_SFX, '-map_metadata', '-1', file]);
    } else writeFileSync(file, data);
    if (r.music) manifest.music[name] = { ...r.meta, gain: +r.gain.toFixed(5), seconds: +r.seconds.toFixed(3) };
    else {
      // takes of one sound share its name: cannon0_0, cannon0_1, ...
      const m = /^(.*)_(\d+)$/.exec(name);
      const [key, v] = m ? [m[1], +m[2]] : [name, 0];
      const e = (manifest.sfx[key] ??= { ext: r.ogg ? 'ogg' : 'wav', gain: [] });
      e.ext = r.ogg ? 'ogg' : 'wav';
      e.gain[v] = +r.gain.toFixed(5);
      // a stereo take (thunder) is panned as a balance, not as a point
      if (r.channels === 2) e.stereo = true;
    }
    const size = readFileSync(file).length;
    bytes += size;
    console.log(`${name.padEnd(16)} ${r.seconds.toFixed(2).padStart(7)} s ${r.channels === 2 ? 'stereo' : 'mono  '} ${(r.sr / 1000).toFixed(1).padStart(4)} kHz ${r.ogg ? 'ogg' : 'wav'} ${(size / 1024).toFixed(0).padStart(6)} KB  gain ${r.gain.toFixed(4)}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  await browser.close();
  const sorted = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  writeFileSync(manifestPath, JSON.stringify({ sfx: sorted(manifest.sfx), music: sorted(manifest.music) }, null, 1) + '\n');
  console.log(`${todo.length} sounds, ${(bytes / 1048576).toFixed(2)} MB`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
