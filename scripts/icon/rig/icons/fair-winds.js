// App icon · Fair Winds: a toy galleon heeling hard through a chunky glossy sea, sun blazing behind its sails
import { THREE, R, mat, deform, makeEnv, key, castAll, radial, glint, cloud, linear, vcolor, rays } from '../rig.js';
import { ship, rng, palm } from '../kit.js';

const sm = THREE.MathUtils.smoothstep;
const C = h => new THREE.Color(h);

// chunky toy swell: a few sharpened crests running diagonally
function seaH(x, z) {
  const w = (dx, dz, k, a, ph, sharp) => { const t = (x * dx + z * dz) * k + ph; const s = 0.5 + 0.5 * Math.sin(t); return a * (Math.pow(s, sharp) - 0.3); };
  return w(0.8, 0.6, 1.6, 0.26, 0.2, 2.2) + w(-0.3, 1, 2.3, 0.12, 1.7, 2) + w(1, -0.2, 3.4, 0.05, 0.4, 1.5);
}

// Variations (render with fair-winds:v=<name>); no v = the shipped icon, untouched
const VARIANTS = {
  plus: {},
  golden: { golden: true },
  hero: { hero: true },
  isle: { isle: true },
  badge: { badge: true },
};

// a soft four-point star for sea glitter
function starTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  glint(x, 64, 64, 62, '#fff', 1, 0.16);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export default async function ({ renderer, safe = false, v }) {
  const V = v ? { up: true, ...VARIANTS[v] } : {};
  const scene = new THREE.Scene();
  const isleAt = new THREE.Vector2(-3.6, -5.0);
  const isleD = (x, z) => Math.hypot(x - isleAt.x, z - isleAt.y);
  // the island's shallows calm the swell around it
  const H = V.isle ? (x, z) => seaH(x, z) * (0.25 + 0.75 * sm(isleD(x, z), 1.3, 3.2)) : seaH;

  if (V.golden) {
    scene.environment = makeEnv(renderer, { top: '#ffe6c4', mid: '#e98a6a', bot: '#0e2f5e', boxes: [{ w: 16, h: 8, pos: [-10, 6, -14], color: '#ffd08a', i: 3 }, { w: 10, h: 6, pos: [12, 6, 12], color: '#bcd8ff', i: 1.2 }] });
    scene.add(new THREE.HemisphereLight('#ffd9b0', '#1d3f78', 0.55));
    key(scene, { pos: [-3, 3.2, -5], i: 3.8, size: 3.2, color: '#ffb366' });
    const fill = new THREE.DirectionalLight('#a9c9ff', 0.9); fill.position.set(4, 3, 6); scene.add(fill);
  } else {
    scene.environment = makeEnv(renderer, { top: '#ffffff', mid: '#aee8fb', bot: '#0d5f8e', boxes: [{ w: 16, h: 10, pos: [-10, 14, -12], color: '#fff3dc', i: 6 }, { w: 10, h: 6, pos: [12, 6, 12], color: '#ffffff', i: 2 }] });
    scene.add(new THREE.HemisphereLight('#cfeaff', '#1f6f9e', 0.6));
    key(scene, { pos: [-3, 5, -5], i: 3.4, size: 3.2, color: '#ffe8c0' });
    const fill = new THREE.DirectionalLight('#dff4ff', 1.1); fill.position.set(4, 3, 6); scene.add(fill);
  }

  const seaG = new THREE.PlaneGeometry(40, 40, 400, 400); seaG.rotateX(-Math.PI / 2);
  deform(seaG, p => { p.y = H(p.x, p.z); });
  const pal = V.golden ? ['#0a1d4a', '#16488a', '#3a9cc0', '#ffc47a', '#fff1d8']
    : V.up ? ['#04245e', '#0a5eaa', '#17b6d8', '#9ff6f0', '#ffffff']
    : ['#052a66', '#0a62aa', '#1fb3d6', '#8ff2f0', '#ffffff'];
  const trough = C(pal[0]), mid = C(pal[1]), crest = C(pal[2]), lip = C(pal[3]), foamC = C(pal[4]), shoal = C('#38e2d2'), sand = C('#bff7e8');
  vcolor(seaG, p => {
    const h = p.y;
    // lacy foam along the crests: the threshold wanders a little so foam breaks into streaks
    const n = V.up ? 0.035 * Math.sin(p.x * 7.3 + p.z * 3.1) * Math.sin(p.x * 2.7 - p.z * 8.9) : 0;
    const c = trough.clone().lerp(mid, sm(h, -0.08, 0.04)).lerp(crest, sm(h, 0.06, 0.2));
    c.lerp(lip, sm(h + n, 0.2, 0.25) * 0.8).lerp(foamC, sm(h + n, 0.25, 0.29) * 0.9);
    if (V.isle) { const d = isleD(p.x, p.z); c.lerp(shoal, 1 - sm(d, 1.4, 3.2)).lerp(sand, 1 - sm(d, 1.2, 1.5)); }
    return c;
  });
  const sea = new THREE.Mesh(seaG, mat('#ffffff', { vertexColors: true, roughness: 0.09, clearcoat: 0, envMapIntensity: 0.18, specularIntensity: 0.4, emissive: V.golden ? '#3a2a4a' : '#06507a', emissiveIntensity: 0.2 }));
  sea.receiveShadow = true; scene.add(sea);
  scene.fog = new THREE.Fog(V.golden ? '#ffc996' : V.badge ? '#9fe6ee' : '#bfeeff', 12, 30);

  const sun = (x, n) => {
    const c = n / 2; x.save(); x.translate(c, c * 1.0); x.scale(1.25, 1.25);
    x.fillStyle = '#f2a51c';
    for (let i = 0; i < 12; i++) { x.rotate(Math.PI / 6); x.beginPath(); x.moveTo(-26, -118); x.quadraticCurveTo(0, -200, 26, -118); x.fill(); }
    const g = x.createRadialGradient(-20, -20, 10, 0, 0, 115); g.addColorStop(0, '#ffd34a'); g.addColorStop(1, '#f08a12');
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, 108, 0, 7); x.fill();
    x.strokeStyle = '#c4570c'; x.lineWidth = 8; x.stroke();
    x.fillStyle = '#c4570c'; x.beginPath(); x.arc(-36, -18, 12, 0, 7); x.arc(36, -18, 12, 0, 7); x.fill();
    x.lineWidth = 10; x.lineCap = 'round'; x.beginPath(); x.arc(0, 4, 52, 0.35, Math.PI - 0.35); x.stroke();
    x.restore();
  };
  const s = V.up
    ? ship({ L: 1.6, Wd: 0.48, Hh: 0.33, billow: 0.24, hullC: '#86401a', stripe: '#14c2c4', flag: '#14c2c4', trim: '#ffc53a', emblem: sun, emblemAt: [0, 0], seams: 0.12, sailShade: 0.2, sailGlow: V.golden ? 0.3 : 0.14, pennants: ['#e8402c', '#14c2c4'] })
    : ship({ L: 1.6, Wd: 0.48, Hh: 0.33, billow: 0.18, hullC: '#7a3a18', stripe: '#1fb2b6', flag: '#1fb2b6', emblem: sun, emblemAt: [0, 0] });
  s.rotation.order = 'YXZ'; s.rotation.set(0.0, -0.85, V.hero ? 0.24 : 0.17);
  const sx = 0.0, sz = 0.0; s.position.set(sx, H(sx, sz) - 0.03, sz);
  castAll(s); scene.add(s);

  if (V.isle) {
    // a little sand cay with two palms, sitting in its own turquoise shallows
    const cay = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), mat('#ffffff', { vertexColors: true, roughness: 0.8, clearcoat: 0.15 }));
    vcolor(cay.geometry, p => C('#ffe7a8').lerp(C('#f5c873'), sm(p.y, 0.2, 0.9)).lerp(C('#4fbf4a'), sm(p.y, 0.72, 0.85) * 0.85));
    cay.scale.set(1.3, 0.3, 0.9); cay.position.set(isleAt.x, -0.08, isleAt.y); scene.add(cay);
    const p1 = palm({ height: 1, lean: [0.3, 0.05], scale: 0.95, seed: 4 }); p1.position.set(isleAt.x - 0.2, 0.12, isleAt.y); scene.add(p1);
    const p2 = palm({ height: 0.8, lean: [-0.3, 0.1], scale: 0.8, seed: 9 }); p2.position.set(isleAt.x + 0.35, 0.09, isleAt.y + 0.1); scene.add(p2);
    castAll(cay); castAll(p1); castAll(p2);
  }

  if (V.up) {
    // glitter: little stars resting on the sea where the sun reflects; the ship hides the ones behind it
    const tex = starTex(), gr = rng(23);
    const sunDir = V.golden ? new THREE.Vector2(-0.55, -1) : new THREE.Vector2(-0.6, -1);
    for (let i = 0; i < (V.golden ? 70 : 34); i++) {
      const t = gr(), along = 1.2 + t * 9, off = (gr() - 0.5) * (0.6 + along * (V.golden ? 0.22 : 0.4));
      const x = sunDir.x * along + off, z = sunDir.y * along;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: V.golden ? '#ffe2a8' : '#ffffff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 + gr() * 0.45, toneMapped: false, fog: false }));
      const sz = (0.05 + gr() * 0.1) * (0.6 + along * 0.12);
      sp.scale.set(sz, sz, 1); sp.position.set(x, H(x, z) + 0.03, z); scene.add(sp);
    }
    // and a sprinkle of sparkles riding the near crests
    for (let i = 0, n = 0; i < 4000 && n < 40; i++) {
      const x = -2.2 + gr() * 4.6, z = -2.5 + gr() * 4.2, h = H(x, z);
      if (h < 0.13) continue; n++;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: V.golden ? '#ffe2a8' : '#ffffff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 + gr() * 0.5, toneMapped: false, fog: false }));
      const sz = 0.03 + gr() * 0.06; sp.scale.set(sz, sz, 1); sp.position.set(x, h + 0.02, z); scene.add(sp);
    }
  }

  const bow = new THREE.Vector3(0.78, 0.1, 0).applyEuler(s.rotation).add(s.position);
  const fwd = new THREE.Vector3(1, 0, 0).applyEuler(s.rotation), side = new THREE.Vector3(0, 0, 1).applyEuler(s.rotation);
  const camera = new THREE.PerspectiveCamera(V.hero ? 35 : 32, 1, 0.1, 80);
  if (V.hero) { camera.position.set(0.85, 0.2, 2.6); camera.lookAt(0.03, 0.86, 0); }
  else { camera.position.set(0.95, 0.42, 3.35); camera.lookAt(-0.05, 0.82, 0); }
  // safe framing for maskable / adaptive launcher icons: pull back so masts and bowsprit sit inside the circle
  if (safe) { const aim = new THREE.Vector3(0.1, 0.8, 0); camera.position.sub(aim).multiplyScalar(V.hero ? 1.6 : 1.38).add(aim); camera.position.y += 0.1; camera.lookAt(aim); }

  const proj = p => { const q = p.clone().project(camera); return [(q.x * 0.5 + 0.5) * R, (0.5 - q.y * 0.5) * R]; };
  const sunXY = V.golden ? [R * 0.27, R * 0.34] : V.badge ? [R * 0.4, R * 0.3] : [R * 0.24, R * 0.2];
  const bg = ctx => {
    if (V.golden) {
      ctx.fillStyle = linear(ctx, 0, 0, 0, R * 0.56, [[0, '#2b3d9a'], [0.45, '#c2638a'], [0.75, '#ff9a55'], [1, '#ffd79a']]); ctx.fillRect(0, 0, R, R);
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      radial(ctx, ...sunXY, R * 0.75, [[0, 'rgba(255,250,220,1)'], [0.07, 'rgba(255,236,170,1)'], [0.25, 'rgba(255,170,90,.55)'], [1, 'rgba(255,140,80,0)']]);
      ctx.restore();
      cloud(ctx, R * 0.82, R * 0.17, 1.5, '#ffd9b8', '#e07a7a', 0.9);
      cloud(ctx, R * 0.98, R * 0.36, 1.0, '#ffd0a8', '#d8708a', 0.75);
      cloud(ctx, R * 0.04, R * 0.12, 0.9, '#ffe0c0', '#e88a80', 0.6);
      return;
    }
    if (V.badge) {
      ctx.fillStyle = linear(ctx, 0, 0, 0, R * 0.6, [[0, '#0a4f9e'], [0.6, '#1590c8'], [1, '#7fe0f0']]); ctx.fillRect(0, 0, R, R);
      ctx.save(); ctx.globalAlpha = 0.13; rays(ctx, ...sunXY, 20, '#ffffff', 0.05); ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      radial(ctx, ...sunXY, R * 0.62, [[0, 'rgba(255,240,190,.9)'], [0.4, 'rgba(255,220,150,.25)'], [1, 'rgba(255,220,150,0)']]);
      ctx.restore();
      // the big toy sun behind the sails
      const [x, y] = sunXY, r = R * 0.2;
      ctx.save(); ctx.fillStyle = 'rgba(255,214,90,.35)'; ctx.beginPath(); ctx.arc(x, y, r * 1.18, 0, 7); ctx.fill();
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
      g.addColorStop(0, '#fff3b0'); g.addColorStop(0.55, '#ffcf3a'); g.addColorStop(1, '#f59a14');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.restore();
      cloud(ctx, R * 0.86, R * 0.5, 1.2, '#ffffff', '#d6edff', 0.85);
      cloud(ctx, R * 0.06, R * 0.5, 1.0, '#ffffff', '#d6edff', 0.7);
      return;
    }
    ctx.fillStyle = linear(ctx, 0, 0, 0, R * 0.62, [[0, '#0f46a8'], [0.55, '#3f9fe6'], [1, '#a6e4ff']]); ctx.fillRect(0, 0, R, R);
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    radial(ctx, R * 0.24, R * 0.2, R * 0.7, [[0, 'rgba(255,250,225,1)'], [0.08, 'rgba(255,244,200,.95)'], [0.3, 'rgba(255,230,170,.35)'], [1, 'rgba(255,230,170,0)']]);
    ctx.restore();
    if (V.up) { ctx.save(); ctx.globalAlpha = 0.07; rays(ctx, R * 0.24, R * 0.2, 16, '#fff6d8', 0.1); ctx.restore(); }
    if (V.isle) { cloud(ctx, R * 0.84, R * 0.15, 1.4, '#ffffff', '#d6edff', 0.92); cloud(ctx, R * 0.06, R * 0.3, 0.8, '#ffffff', '#d6edff', 0.6); return; }
    cloud(ctx, R * 0.82, R * 0.16, 1.5, '#ffffff', '#d6edff', 0.92);
    cloud(ctx, R * 0.96, R * 0.38, 1.0, '#ffffff', '#d6edff', 0.75);
    cloud(ctx, R * 0.08, R * 0.44, 1.1, '#ffffff', '#d6edff', 0.6);
  };
  const wakeC = V.golden ? '255,236,205' : '255,255,255';
  const under = ctx => {
    // wake: foam ribbons trailing both sides, drawn under the hull
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const sgn of [1, -1]) for (const [w, a, blur] of [[46, 0.35, 14], [18, 0.85, 2]]) {
      ctx.filter = `blur(${blur}px)`; ctx.strokeStyle = `rgba(${wakeC},${a})`;
      for (let seg = 0; seg < 18; seg++) {
        const t0 = seg / 18, t1 = (seg + 1) / 18;
        const P = t => { const fx = 0.78 - t * 3.6; const p = s.position.clone().addScaledVector(fwd, fx).addScaledVector(side, sgn * (0.2 + Math.max(0, -fx + 0.3) * 0.32)); p.y = H(p.x, p.z) + 0.01; return proj(p); };
        const [x0, y0] = P(t0), [x1, y1] = P(t1);
        ctx.lineWidth = w * (1 - t0 * 0.75); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
    }
    ctx.restore();
  };
  const sprayK = V.hero ? 1.45 : 1;
  const over = ctx => {
    // bow spray: a bright burst and a fan of droplets thrown off the cutwater
    const [bx, by] = proj(bow);
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    radial(ctx, bx, by, 220 * sprayK, [[0, `rgba(${wakeC},.95)`], [0.4, 'rgba(230,250,255,.5)'], [1, 'rgba(230,250,255,0)']]);
    ctx.restore();
    if (V.up) {
      // a curling sheet of spray peeling off the bow, then the droplets
      ctx.save(); ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const k = i / 6, rad = (90 + k * 150) * sprayK;
        ctx.filter = `blur(${2 + k * 5}px)`; ctx.strokeStyle = `rgba(${wakeC},${0.85 - k * 0.55})`; ctx.lineWidth = (26 - k * 16) * sprayK;
        ctx.beginPath(); ctx.arc(bx + rad * 0.55, by + 10, rad, Math.PI * (1.05 + k * 0.04), Math.PI * (1.42 - k * 0.04)); ctx.stroke();
      }
      ctx.restore();
    }
    const rr = rng(5);
    ctx.save();
    for (let i = 0; i < (V.up ? 120 : 90); i++) {
      const a = -Math.PI * (0.15 + rr() * 0.75), d = (30 + rr() * 260) * sprayK, sz = (3 + rr() * 16 * (1 - d / (320 * sprayK))) * (V.up ? 1.1 : 1);
      const x = bx + Math.cos(a) * d * 1.1 + 30, y = by + Math.sin(a) * d * 0.7 + d * d * 0.0012 / sprayK;
      const g = ctx.createRadialGradient(x - sz * 0.3, y - sz * 0.3, 0, x, y, sz);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.7, `rgba(${V.golden ? '255,240,215' : '235,252,255'},.9)`); g.addColorStop(1, 'rgba(200,240,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, sz, 0, 7); ctx.fill();
    }
    ctx.filter = 'blur(6px)'; ctx.fillStyle = `rgba(${wakeC},.9)`;
    ctx.beginPath(); ctx.ellipse(bx + 10, by + 6, 120 * sprayK, 36 * sprayK, -0.2, 0, 7); ctx.fill();
    ctx.restore();
    if (!V.badge) glint(ctx, ...sunXY, V.golden ? 190 : 150, '#fff', 0.95);
    glint(ctx, R * 0.7, R * 0.78, 50, '#fff', 0.7);
    glint(ctx, R * 0.15, R * 0.82, 40, '#fff', 0.6);
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = linear(ctx, 0, R * 0.78, 0, R, [[0, 'rgba(255,255,255,1)'], [1, V.golden ? 'rgba(130,110,175,1)' : 'rgba(90,140,200,1)']]); ctx.fillRect(0, R * 0.78, R, R * 0.22);
    radial(ctx, R * 0.5, R * 0.45, R * 0.8, [[0.62, 'rgba(255,255,255,1)'], [1, V.golden ? 'rgba(170,130,170,1)' : 'rgba(130,155,195,1)']]);
    ctx.restore();
  };
  return { scene, camera, bg, under: V.up ? under : undefined, over, envI: 0.5, grade: V.up ? 'saturate(1.18) contrast(1.04)' : 'saturate(1.12)', bloom: { a: V.golden ? 0.38 : 0.3, blur: 40, f: 'brightness(1) contrast(2)' } };
}
