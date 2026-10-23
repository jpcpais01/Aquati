// Renders a hand-built icon scene (icons/<name>.js) to scripts/icon/<name>[-flag].png
// Run: NODE_PATH=$(npm root -g) node scripts/icon/rig/render.mjs fair-winds fair-winds:safe   (then node scripts/make-icons.mjs)
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const pw = createRequire(import.meta.url)('playwright');
const root = dirname(fileURLToPath(import.meta.url));
const three = join(root, '../../../node_modules');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const b = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const arg of process.argv.slice(2)) {
  const [name, flag] = arg.split(':');
  const p = await b.newPage({ viewport: { width: 1100, height: 1100 } });
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(name, m.type(), m.text().slice(0, 300)); });
  p.on('pageerror', e => console.log(name, 'pageerror', e.message));
  await p.route('http://icons.local/**', r => {
    const u = new URL(r.request().url());
    const path = decodeURIComponent(u.pathname);
    const f = path.startsWith('/three/') ? join(three, path) : join(root, path);
    try { r.fulfill({ body: readFileSync(realpathSync(f)), contentType: types[extname(f)] || 'application/octet-stream' }); }
    catch { r.fulfill({ status: 404, body: 'nf' }); }
  });
  const t = Date.now();
  await p.goto(`http://icons.local/index.html?icon=${name}${flag ? '&' + flag : ''}`);
  await p.waitForFunction(() => window.__done || window.__err, null, { timeout: 300000 });
  const err = await p.evaluate(() => window.__err);
  if (err) { console.log(name, 'ERR', err); continue; }
  const data = await p.evaluate(() => window.__png);
  writeFileSync(join(root, '..', name + (flag ? '-' + flag : '') + '.png'), Buffer.from(data.split(',')[1], 'base64'));
  console.log(name, 'ok', Date.now() - t, 'ms');
  await p.close();
}
await b.close();
