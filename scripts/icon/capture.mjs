// Captures icon shots with the real game: `npm run build && npx vite preview --port 4173`, then
// `node scripts/icon/capture.mjs shots.json` — one SwiftShader boot, many shots [{out, setup, simSec, pre, sim, steps, dt, pose}].
// The icon was shot with pre "{const a=SAZ()+1.2;AT(a,6,a+1.57)}", sim 10, pose "P(g.player,0.3,64,1.42,0,42)" at hour 15.4, fair.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const pw = createRequire('/opt/node22/lib/node_modules/')('playwright');
const cfg = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const size = cfg.size ?? 1024;
const b = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
p.on('pageerror', e => console.log('ERR', e.message));
p.on('console', m => { if (m.text().startsWith('[cap]')) console.log(m.text()); });
await p.goto(`http://localhost:4173/?debug&q=high&${cfg.query ?? ''}`, { timeout: 300000 });
await p.waitForFunction(() => window.aquati && window.aquati.preview, null, { timeout: 400000, polling: 1000 });
await p.evaluate(cfg.boot ?? `aquati.startVoyage('home')`);
await p.waitForFunction(() => !aquati.warming && aquati.world && aquati.world.time > 2.5, null, { timeout: 600000, polling: 1000 }).catch(e => console.log('wait', e.message));
await p.addStyleTag({ content: 'body *{visibility:hidden!important}' });
await p.evaluate(`aquati.renderer.domElement.style.setProperty('visibility','visible','important'); aquati.player.damage=()=>{}; window.P=(s,ah,D,E,H,fov)=>{const r=aquati.rig;const h=s.heading+ah;r.mode='port';r.shotFov=fov;r.shotLook.set(s.pos.x,(s.pos.y||0)+H,s.pos.z);r.shotPos.set(s.pos.x+Math.sin(h)*D*Math.cos(E),(s.pos.y||0)+H+Math.sin(E)*D,s.pos.z+Math.cos(h)*D*Math.cos(E));r.snapShot();}; window.SAZ=()=>Math.atan2(aquati.atmos.sunDir.x,aquati.atmos.sunDir.z); window.ISL=aquati.terrain.islands.filter(i=>i.style!=='karst'&&(i.kind==='lush'||i.kind==='atoll')).sort((a,b)=>Math.hypot(a.x-aquati.player.pos.x,a.z-aquati.player.pos.z)-Math.hypot(b.x-aquati.player.pos.x,b.z-aquati.player.pos.z))[0]; window.AT=(az,off,hd)=>{const s=aquati.player;s.place(ISL.x+Math.sin(az)*(ISL.r+off),ISL.z+Math.cos(az)*(ISL.r+off),hd);s.speed=s.cls.maxSpeed*0.6;}; console.log('[cap] ready', aquati.player.cls.id)`);
for (const s of cfg.shots) {
  const t0 = Date.now();
  await p.evaluate(`aquati.renderer.setAnimationLoop(t=>aquati.frame(t)); (async()=>{const g=aquati; ${s.setup ?? ''}})()`);
  if (s.simSec) await p.waitForTimeout(s.simSec * 1000);
  await p.evaluate(`(() => { const g = aquati; g.renderer.setAnimationLoop(null); ${s.pre ?? ''}; for (let i = 0; i < ${s.sim ?? 0}; i++) { ${s.during ?? ''}; g.update(0.05, 0.05); }
    for (let i = 0; i < ${s.steps ?? 6}; i++) { ${s.pose ?? ''}; g.update(${s.dt ?? 0.016}, ${s.dt ?? 0.016}); ${s.pose ?? ''}; g.render(${s.dt ?? 0.016}); } })()`);
  await p.screenshot({ path: s.out, timeout: 300000 });
  console.log('saved', s.out, (Date.now() - t0) / 1000 + 's');
}
await b.close();
