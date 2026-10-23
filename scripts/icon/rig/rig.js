// Icon rig: hand-built toy 3D scene + painted 2D background/overlays, composited at 2048 and downsampled to 1024.
import * as THREE from 'three';
export { THREE };

export const R = 2048;

export const envs = {};
// gold always reflects a warm studio so it never turns green under a blue sky
export function goldMat(color = '#ffbf3a', o = {}) {
  return new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: 0.24, envMap: envs.gold, ...o });
}
export function mat(color, o = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.35, ...o });
}

// move every vertex through fn(v: Vector3, i) and refresh normals
export function deform(geo, fn) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); fn(v, i); p.setXYZ(i, v.x, v.y, v.z); }
  p.needsUpdate = true; geo.computeVertexNormals(); return geo;
}

export function lathe(pts, segs = 96) {
  if (pts[0][1] > pts[pts.length - 1][1]) pts = [...pts].reverse(); // three wants the profile bottom-up for outward faces
  return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), segs);
}

// tube whose radius follows rFn(t); points are [x,y,z]
export function varTube(pts, rFn, tSegs = 64, rSegs = 16, closed = false) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
  const fr = curve.computeFrenetFrames(tSegs, closed);
  const pos = [], idx = [], uv = [];
  for (let i = 0; i <= tSegs; i++) {
    const t = i / tSegs, c = curve.getPointAt(t), r = rFn(t);
    const N = fr.normals[i], B = fr.binormals[i];
    for (let j = 0; j <= rSegs; j++) {
      const a = j / rSegs * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a);
      pos.push(c.x + r * (cs * N.x + sn * B.x), c.y + r * (cs * N.y + sn * B.y), c.z + r * (cs * N.z + sn * B.z));
      uv.push(t, j / rSegs);
    }
  }
  for (let i = 0; i < tSegs; i++) for (let j = 0; j < rSegs; j++) {
    const a = i * (rSegs + 1) + j, b = a + rSegs + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  g.userData.curve = curve;
  return g;
}

// colour every vertex from fn(v) -> THREE.Color
export function vcolor(geo, fn) {
  const p = geo.attributes.position, v = new THREE.Vector3(), c = [];
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = fn(v, i); c.push(k.r, k.g, k.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  return geo;
}

// environment for reflections: gradient dome + bright softboxes
export function makeEnv(renderer, { top = '#fff4dc', mid = '#9be8ff', bot = '#0d5a7a', boxes = [] } = {}) {
  const s = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { t: { value: new THREE.Color(top) }, m: { value: new THREE.Color(mid) }, b: { value: new THREE.Color(bot) } },
    vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 t,m,b; varying vec3 d; void main(){ float y=d.y; vec3 c = y>0. ? mix(m,t,pow(y,.6)) : mix(m,b,pow(-y,.5)); gl_FragColor=vec4(c,1.); }',
  }));
  s.add(dome);
  for (const bx of boxes) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(bx.w, bx.h), new THREE.MeshBasicMaterial({ color: new THREE.Color(bx.color || '#fff').multiplyScalar(bx.i ?? 4), side: THREE.DoubleSide }));
    m.position.set(...bx.pos); m.lookAt(0, 0, 0); s.add(m);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.02);
  return rt.texture;
}

export function key(scene, { pos = [-4, 7, 5], color = '#fff1d6', i = 2.6, shadow = true, size = 4, bias = -0.0004, radius = 6, map = 2048 } = {}) {
  const l = new THREE.DirectionalLight(color, i);
  l.position.set(...pos);
  if (shadow) {
    l.castShadow = true; l.shadow.mapSize.set(map, map);
    const c = l.shadow.camera; c.left = c.bottom = -size; c.right = c.top = size; c.near = 0.1; c.far = 40;
    l.shadow.bias = bias; l.shadow.normalBias = 0.02; l.shadow.radius = radius;
  }
  scene.add(l); return l;
}

export function castAll(o) { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); }

// --- 2D painting helpers (all coordinates in R space) ---
export function radial(ctx, x, y, r, stops) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g; ctx.fillRect(0, 0, R, R);
}
export function linear(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
export function rays(ctx, x, y, n, color, rot = 0, len = R * 1.5, duty = 0.5) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = a0 + Math.PI * 2 / n * duty;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, len, a0, a1); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
// four-pointed glint
export function glint(ctx, x, y, r, color = '#fff', a = 1, thin = 0.13) {
  ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.55);
  g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, 7); ctx.fill();
  ctx.fillStyle = color; ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a0 = i * Math.PI / 2;
    ctx.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
    ctx.quadraticCurveTo(0, 0, Math.cos(a0 + Math.PI / 2) * r * thin * 0 + Math.cos(a0 + Math.PI / 4) * r * thin, Math.sin(a0 + Math.PI / 4) * r * thin);
    ctx.quadraticCurveTo(0, 0, Math.cos(a0 + Math.PI / 2) * r, Math.sin(a0 + Math.PI / 2) * r);
  }
  ctx.closePath(); ctx.fill(); ctx.restore();
}
export function cloud(ctx, x, y, s, top = '#ffffff', bot = '#cfeaff', a = 1) {
  ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(s, s);
  const g = ctx.createLinearGradient(0, -90, 0, 40); g.addColorStop(0, top); g.addColorStop(1, bot);
  ctx.fillStyle = g; ctx.beginPath();
  for (const [cx, cy, r] of [[-120, 10, 50], [-60, -25, 70], [20, -50, 85], [100, -15, 62], [150, 15, 42]]) { ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, 7); }
  ctx.rect(-120, 0, 270, 57); ctx.fill(); ctx.restore();
}

export async function run(name, opts = {}) {
  const mod = await import(`./icons/${name}.js`);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(R, R, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  envs.gold = makeEnv(renderer, { top: '#fff3d6', mid: '#c97a22', bot: '#3a1a04', boxes: [{ w: 14, h: 10, pos: [-14, 16, 14], color: '#fff3dc', i: 6 }, { w: 3, h: 22, pos: [20, 4, 8], color: '#ffffff', i: 4 }, { w: 26, h: 5, pos: [0, -14, 16], color: '#ffb347', i: 1.4 }, { w: 10, h: 10, pos: [6, 10, -18], color: '#fff0c0', i: 5 }, { w: 6, h: 6, pos: [-6, -2, 20], color: '#ffe4a0', i: 2.2 }] });
  const def = await mod.default({ renderer, THREE, ...opts });
  if (def.exposure) renderer.toneMappingExposure = def.exposure;
  if (def.envI !== undefined) def.scene.environmentIntensity = def.envI;
  renderer.render(def.scene, def.camera);
  // composite
  const c = document.createElement('canvas'); c.width = c.height = R;
  const ctx = c.getContext('2d');
  def.bg?.(ctx);
  const layers = def.layers || [{ scene: def.scene, camera: def.camera }];
  for (let li = 0; li < layers.length; li++) {
    if (li > 0) { renderer.clear(); renderer.render(layers[li].scene, layers[li].camera); }
    def.under?.(ctx, li);
    ctx.save(); if (def.grade) ctx.filter = def.grade; ctx.drawImage(renderer.domElement, 0, 0); ctx.restore();
    const b = def.bloom ?? { a: 0.35, blur: 40, f: 'brightness(1.1) contrast(1.6)' };
    if (b) { ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = b.a; ctx.filter = `blur(${b.blur}px) ${b.f}`; ctx.drawImage(renderer.domElement, 0, 0); ctx.restore(); }
  }
  def.over?.(ctx);
  const out = document.createElement('canvas'); out.width = out.height = 1024;
  const o = out.getContext('2d'); o.imageSmoothingQuality = 'high'; o.drawImage(c, 0, 0, 1024, 1024);
  document.body.appendChild(out);
  window.__png = out.toDataURL('image/png');
}
