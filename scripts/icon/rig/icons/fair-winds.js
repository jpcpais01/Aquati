// App icon · Fair Winds: a toy galleon heeling hard through a chunky glossy sea, sun blazing behind its sails
import { THREE, R, mat, deform, makeEnv, key, castAll, radial, glint, cloud, linear, vcolor } from '../rig.js';
import { ship, rng } from '../kit.js';

const sm = THREE.MathUtils.smoothstep;
const C = h => new THREE.Color(h);

// chunky toy swell: a few sharpened crests running diagonally
function seaH(x, z) {
  const w = (dx, dz, k, a, ph, sharp) => { const t = (x * dx + z * dz) * k + ph; const s = 0.5 + 0.5 * Math.sin(t); return a * (Math.pow(s, sharp) - 0.3); };
  return w(0.8, 0.6, 1.6, 0.26, 0.2, 2.2) + w(-0.3, 1, 2.3, 0.12, 1.7, 2) + w(1, -0.2, 3.4, 0.05, 0.4, 1.5);
}

export default async function ({ renderer, safe = false }) {
  const scene = new THREE.Scene();
  scene.environment = makeEnv(renderer, { top: '#ffffff', mid: '#aee8fb', bot: '#0d5f8e', boxes: [{ w: 16, h: 10, pos: [-10, 14, -12], color: '#fff3dc', i: 6 }, { w: 10, h: 6, pos: [12, 6, 12], color: '#ffffff', i: 2 }] });
  scene.add(new THREE.HemisphereLight('#cfeaff', '#1f6f9e', 0.6));
  key(scene, { pos: [-3, 5, -5], i: 3.4, size: 3.2, color: '#ffe8c0' });
  const fill = new THREE.DirectionalLight('#dff4ff', 1.1); fill.position.set(4, 3, 6); scene.add(fill);
  

  const seaG = new THREE.PlaneGeometry(40, 40, 400, 400); seaG.rotateX(-Math.PI / 2);
  deform(seaG, v => { v.y = seaH(v.x, v.z); });
  const trough = C('#052a66'), mid = C('#0a62aa'), crest = C('#1fb3d6'), foamC = C('#ffffff');
  vcolor(seaG, v => { const h = v.y; const c = trough.clone().lerp(mid, sm(h, -0.08, 0.04)).lerp(crest, sm(h, 0.06, 0.2)); return c.lerp(C('#8ff2f0'), sm(h, 0.2, 0.25) * 0.8).lerp(foamC, sm(h, 0.25, 0.29) * 0.9); });
  const sea = new THREE.Mesh(seaG, mat('#ffffff', { vertexColors: true, roughness: 0.09, clearcoat: 0, envMapIntensity: 0.18, specularIntensity: 0.4, emissive: '#06507a', emissiveIntensity: 0.2 }));
  sea.receiveShadow = true; scene.add(sea);
  scene.fog = new THREE.Fog('#bfeeff', 12, 30);

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
  const s = ship({ L: 1.6, Wd: 0.48, Hh: 0.33, billow: 0.18, hullC: '#7a3a18', stripe: '#1fb2b6', flag: '#1fb2b6', emblem: sun, emblemAt: [0, 0] });
  s.rotation.order = 'YXZ'; s.rotation.set(0.0, -0.85, 0.17);
  const sx = 0.0, sz = 0.0; s.position.set(sx, seaH(sx, sz) - 0.03, sz);
  castAll(s); scene.add(s);

  // bow spray, wake foam and flecks
  const foamM = mat('#ffffff', { roughness: 0.3, clearcoat: 0.8, emissive: '#bfefff', emissiveIntensity: 0.1 });
  const ball = new THREE.SphereGeometry(1, 20, 14);
  const wakeM = new THREE.MeshStandardMaterial({ color: '#e8fbff', transparent: true, opacity: 0.7, roughness: 0.5 });
  const r = rng(17);
  const bow = new THREE.Vector3(0.78, 0.1, 0).applyEuler(s.rotation).add(s.position);
  const fwd = new THREE.Vector3(1, 0, 0).applyEuler(s.rotation), side = new THREE.Vector3(0, 0, 1).applyEuler(s.rotation);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
  camera.position.set(0.95, 0.42, 3.35); camera.lookAt(-0.05, 0.82, 0);
  // safe framing for maskable / adaptive launcher icons: pull back so masts and bowsprit sit inside the circle
  if (safe) { const aim = new THREE.Vector3(0.1, 0.8, 0); camera.position.sub(aim).multiplyScalar(1.38).add(aim); camera.position.y += 0.1; camera.lookAt(aim); }

  const bg = ctx => {
    ctx.fillStyle = linear(ctx, 0, 0, 0, R * 0.62, [[0, '#0f46a8'], [0.55, '#3f9fe6'], [1, '#a6e4ff']]); ctx.fillRect(0, 0, R, R);
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    radial(ctx, R * 0.24, R * 0.2, R * 0.7, [[0, 'rgba(255,250,225,1)'], [0.08, 'rgba(255,244,200,.95)'], [0.3, 'rgba(255,230,170,.35)'], [1, 'rgba(255,230,170,0)']]);
    ctx.restore();
    cloud(ctx, R * 0.82, R * 0.16, 1.5, '#ffffff', '#d6edff', 0.92);
    cloud(ctx, R * 0.96, R * 0.38, 1.0, '#ffffff', '#d6edff', 0.75);
    cloud(ctx, R * 0.08, R * 0.44, 1.1, '#ffffff', '#d6edff', 0.6);
  };
  const proj = v => { const p = v.clone().project(camera); return [(p.x * 0.5 + 0.5) * R, (0.5 - p.y * 0.5) * R]; };
  const wl = (fx, sgn) => { const p = s.position.clone().addScaledVector(fwd, fx).addScaledVector(side, sgn * 0.25 * Math.max(0.15, Math.cos(Math.max(0, fx) * 1.8))); p.y = seaH(p.x, p.z) + 0.02; return p; };
  const under = ctx => {
    // wake: foam ribbons trailing both sides, drawn under the hull
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const sgn of [1, -1]) for (const [w, a, blur] of [[46, 0.35, 14], [18, 0.85, 2]]) {
      ctx.filter = `blur(${blur}px)`; ctx.strokeStyle = `rgba(255,255,255,${a})`;
      for (let seg = 0; seg < 18; seg++) {
        const t0 = seg / 18, t1 = (seg + 1) / 18;
        const P = t => { const fx = 0.78 - t * 3.6; const p = s.position.clone().addScaledVector(fwd, fx).addScaledVector(side, sgn * (0.2 + Math.max(0, -fx + 0.3) * 0.32)); p.y = seaH(p.x, p.z) + 0.01; return proj(p); };
        const [x0, y0] = P(t0), [x1, y1] = P(t1);
        ctx.lineWidth = w * (1 - t0 * 0.75); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
    }
    ctx.restore();
  };
  const over = ctx => {
    // bow spray: a bright burst and a fan of droplets thrown off the cutwater
    const [bx, by] = proj(bow);
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    radial(ctx, bx, by, 220, [[0, 'rgba(255,255,255,.95)'], [0.4, 'rgba(230,250,255,.5)'], [1, 'rgba(230,250,255,0)']]);
    ctx.restore();
    const rr = rng(5);
    ctx.save();
    for (let i = 0; i < 90; i++) {
      const a = -Math.PI * (0.15 + rr() * 0.75), d = 30 + rr() * 260, sz = 3 + rr() * 16 * (1 - d / 320);
      const x = bx + Math.cos(a) * d * 1.1 + 30, y = by + Math.sin(a) * d * 0.7 + d * d * 0.0012;
      const g = ctx.createRadialGradient(x - sz * 0.3, y - sz * 0.3, 0, x, y, sz);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.7, 'rgba(235,252,255,.9)'); g.addColorStop(1, 'rgba(200,240,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, sz, 0, 7); ctx.fill();
    }
    ctx.filter = 'blur(6px)'; ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.ellipse(bx + 10, by + 6, 120, 36, -0.2, 0, 7); ctx.fill();
    ctx.restore();
    glint(ctx, R * 0.24, R * 0.2, 150, '#fff', 0.95);
    glint(ctx, R * 0.7, R * 0.78, 50, '#fff', 0.7);
    glint(ctx, R * 0.15, R * 0.82, 40, '#fff', 0.6);
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = linear(ctx, 0, R * 0.78, 0, R, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(90,140,200,1)']]); ctx.fillRect(0, R * 0.78, R, R * 0.22);
    radial(ctx, R * 0.5, R * 0.45, R * 0.8, [[0.62, 'rgba(255,255,255,1)'], [1, 'rgba(130,155,195,1)']]);
    ctx.restore();
  };
  return { scene, camera, bg, over, envI: 0.5, grade: 'saturate(1.12)', bloom: { a: 0.3, blur: 40, f: 'brightness(1) contrast(2)' } };
}
