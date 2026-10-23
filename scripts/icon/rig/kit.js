// Shared toy props: palms, chest, little ships, foam
import { THREE, mat, goldMat, deform, lathe, varTube, vcolor } from './rig.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function rng(seed = 1) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

// a palm frond: V-folded ribbon along a drooping arc, with serrated leaflet edge
export function frond(len, width, droop, yaw, pitch, cA = '#2f9a3a', cB = '#8be05a') {
  const N = 28, pos = [], col = [], idx = [];
  const ca = new THREE.Color(cA), cb = new THREE.Color(cB), c = new THREE.Color();
  const dir = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const h = len * (Math.sin(pitch) * t - droop * t * t);
    const fwd = len * Math.cos(pitch) * t * (1 - 0.15 * t);
    const center = dir.clone().multiplyScalar(fwd).add(new THREE.Vector3(0, h, 0));
    let w = width * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.7) * (1 - 0.35 * t);
    const ser = 0.72 + 0.28 * Math.abs(Math.sin(t * 46));
    const we = w * (i > 1 ? ser : 1);
    const L = center.clone().addScaledVector(side, -we).add(new THREE.Vector3(0, -we * 0.55, 0));
    const Rr = center.clone().addScaledVector(side, we).add(new THREE.Vector3(0, -we * 0.55, 0));
    const C = center.clone().add(new THREE.Vector3(0, w * 0.12, 0));
    pos.push(L.x, L.y, L.z, C.x, C.y, C.z, Rr.x, Rr.y, Rr.z);
    c.copy(ca).lerp(cb, Math.pow(t, 0.8));
    const ce = c.clone().multiplyScalar(0.82);
    col.push(ce.r, ce.g, ce.b, c.r, c.g, c.b, ce.r, ce.g, ce.b);
    if (i < N) { const a = i * 3, b = a + 3; idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function palm({ height = 1, lean = [0.25, 0.1], fronds = 8, scale = 1, seed = 3, leafA, leafB } = {}) {
  const r = rng(seed);
  const g = new THREE.Group();
  const top = [lean[0] * height, height, lean[1] * height];
  const pts = [[0, 0, 0], [top[0] * 0.15, height * 0.35, top[2] * 0.15], [top[0] * 0.55, height * 0.72, top[2] * 0.55], top];
  const trunkG = varTube(pts, t => (0.065 - 0.025 * t) * (1 + 0.16 * Math.pow(Math.abs(Math.sin(t * 15 * Math.PI)), 0.5)), 90, 14);
  vcolor(trunkG, v => new THREE.Color('#a8743f').lerp(new THREE.Color('#d9a86a'), Math.min(1, v.y / height)));
  const trunk = new THREE.Mesh(trunkG, mat('#ffffff', { vertexColors: true, roughness: 0.75, clearcoat: 0.1 }));
  g.add(trunk);
  const leafM = mat('#ffffff', { vertexColors: true, roughness: 0.55, clearcoat: 0.35, side: THREE.DoubleSide, sheen: 0.4, sheenColor: '#d8ffb0' });
  const crown = new THREE.Group(); crown.position.set(...top); g.add(crown);
  for (let i = 0; i < fronds; i++) {
    const yaw = i / fronds * Math.PI * 2 + r() * 0.4;
    const f = new THREE.Mesh(frond(0.62 + r() * 0.18, 0.11, 0.9 + r() * 0.35, yaw, 0.55 + r() * 0.3, leafA, leafB), leafM);
    crown.add(f);
  }
  const nut = mat('#6b4320', { roughness: 0.45, clearcoat: 0.5 });
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.4; const s = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), nut); s.position.set(Math.cos(a) * 0.05, -0.05, Math.sin(a) * 0.05); crown.add(s); }
  g.scale.setScalar(scale);
  return g;
}

function plankTex(base, dark, n, vertical = true) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < n; i++) {
    const g = x.createLinearGradient(0, 0, vertical ? 256 / n : 0, vertical ? 0 : 256 / n);
    g.addColorStop(0, 'rgba(255,255,255,.08)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.18)');
    x.save(); vertical ? x.translate(i * 256 / n, 0) : x.translate(0, i * 256 / n); x.fillStyle = g; x.fillRect(0, 0, vertical ? 256 / n : 256, vertical ? 256 : 256 / n);
    x.fillStyle = dark; vertical ? x.fillRect(0, 0, 3, 256) : x.fillRect(0, 0, 256, 3); x.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function chest({ open = 1.95, glow = true } = {}) {
  const g = new THREE.Group();
  const wood = mat('#ffffff', { map: plankTex('#8a4519', '#3a1606', 4, false), roughness: 0.5, clearcoat: 0.5 });
  const woodL = mat('#ffffff', { map: plankTex('#8a4519', '#3a1606', 5, true), roughness: 0.5, clearcoat: 0.5, side: THREE.DoubleSide });
  const inner = mat('#3a1606', { roughness: 0.8, side: THREE.DoubleSide });
  const goldM = goldMat('#ffbf3a', { roughness: 0.22 });
  const W = 0.5, H = 0.28, D = 0.34, rb = 0.03;
  const box = new THREE.Mesh(new RoundedBoxGeometry(W, H, D, 4, rb), wood); box.position.y = H / 2; g.add(box);
  const inside = new THREE.Mesh(new THREE.BoxGeometry(W - 0.05, 0.01, D - 0.05), inner); inside.position.y = H - 0.004; g.add(inside);
  // gold corner straps and bands
  for (const x of [-W * 0.3, W * 0.3]) { const b = new THREE.Mesh(new RoundedBoxGeometry(0.05, H + 0.016, D + 0.018, 2, 0.008), goldM); b.position.set(x, H / 2, 0); g.add(b); }
  for (const x of [-1, 1]) for (const z of [-1, 1]) { const c = new THREE.Mesh(new RoundedBoxGeometry(0.06, H * 0.36, 0.06, 2, 0.01), goldM); c.position.set(x * (W / 2 - 0.022), H * 0.2, z * (D / 2 - 0.022)); g.add(c); }
  const rimB = new THREE.Mesh(new RoundedBoxGeometry(W + 0.02, 0.035, D + 0.02, 2, 0.01), goldM); rimB.position.y = H - 0.015; g.add(rimB);
  const lock = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.11, 0.03, 2, 0.01), goldM); lock.position.set(0, H - 0.06, D / 2 + 0.012); g.add(lock);
  const kh = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 12).rotateX(Math.PI / 2), inner); kh.position.set(0, H - 0.055, D / 2 + 0.03); g.add(kh);
  // lid: half drum hinged at the back edge
  const lidPivot = new THREE.Group(); lidPivot.position.set(0, H, -D / 2); g.add(lidPivot);
  const drum = (r, len, m) => { const gg = new THREE.CylinderGeometry(r, r, len, 32, 1, false, 0, Math.PI); gg.rotateZ(Math.PI / 2); const mm = new THREE.Mesh(gg, m); mm.rotation.x = 0; return mm; };
  const lidHolder = new THREE.Group(); lidHolder.position.set(0, 0, D / 2); lidPivot.add(lidHolder);
  const lid = drum(D / 2, W, woodL); lidHolder.add(lid);
  const capM = mat('#7a3c15', { roughness: 0.5, clearcoat: 0.4, side: THREE.DoubleSide });
  for (const x of [-W / 2, W / 2]) { const cap = new THREE.Mesh(new THREE.CircleGeometry(D / 2, 32, 0, Math.PI), capM); cap.rotation.y = Math.PI / 2; cap.position.x = x; lidHolder.add(cap); }
  for (const x of [-W * 0.3, W * 0.3]) { const b = drum(D / 2 + 0.01, 0.05, goldM); b.position.x = x; lidHolder.add(b); }
  lidPivot.rotation.x = -open;
  // heaped treasure spilling over
  const coinM = goldMat('#ffc23c', { roughness: 0.2, emissive: glow ? '#ff9d00' : '#000', emissiveIntensity: glow ? 0.5 : 0 });
  const heap = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), coinM);
  heap.scale.set(W * 0.47, 0.11, D * 0.45); heap.position.y = H - 0.01; g.add(heap);
  const r = rng(11), cg = new THREE.CylinderGeometry(0.036, 0.036, 0.011, 20);
  for (let i = 0; i < 34; i++) {
    const m = new THREE.Mesh(cg, coinM); const a = r() * 6.28, rr = Math.sqrt(r());
    m.position.set(Math.cos(a) * rr * W * 0.43, H + 0.015 + (1 - rr * rr) * 0.1, Math.sin(a) * rr * D * 0.4);
    m.rotation.set((r() - 0.5) * 1.4, r(), (r() - 0.5) * 1.4); g.add(m);
  }
  for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(cg, coinM); m.position.set((r() - 0.5) * W * 1.1, 0.008 + (i % 3) * 0.011, D / 2 + 0.06 + r() * 0.12); m.rotation.set(r() * 0.2, r(), r() * 0.2); g.add(m); }
  const gem = (c, x, y, z, s = 1) => { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.045 * s, 0), mat(c, { roughness: 0.05, clearcoat: 1, emissive: c, emissiveIntensity: 0.4, flatShading: true })); m.position.set(x, y, z); m.scale.y = 1.3; m.rotation.set(0.3, 0.5, 0.2); g.add(m); };
  gem('#ff2e63', -0.1, H + 0.11, 0.03, 1.2); gem('#20e3a0', 0.11, H + 0.1, -0.04); gem('#3a7bff', 0.03, H + 0.13, 0.07);
  // pearl string over the front edge
  const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([-0.16 + t * 0.2, H + 0.04 - Math.sin(t * Math.PI) * 0.12 + 0.02, D / 2 + 0.01 + Math.sin(t * Math.PI) * 0.03]); }
  const pearlM = mat('#fff8f0', { roughness: 0.15, clearcoat: 1, sheen: 1, sheenColor: '#ffd8f0' });
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
  for (let i = 0; i <= 14; i++) { const p = curve.getPointAt(i / 14); const m = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), pearlM); m.position.copy(p); g.add(m); }
  if (glow) { const pl = new THREE.PointLight('#ffc76a', 2.5, 1.6, 1.5); pl.position.set(0, H + 0.25, 0.05); g.add(pl); }
  return g;
}

// soft toy galleon/sloop, lofted from U-shaped stations with a painted band texture
export function ship({ L = 1.4, Wd = 0.42, Hh = 0.3, hullC = '#7a3e1c', stripe = '#1fb2b6', trim = '#ffc33d', bottomC = '#a3321f', sailC = '#fbecd0', flag = '#1fb2b6', masts = [[0.3, 1.1, 3], [-0.02, 1.3, 3], [-0.36, 0.95, 2]], billow = 0.13, castle = 0.2, ports = 5, jib = true, rig = true, sailW = 1.0, emblem = null, emblemAt = [1, 0], sink = 0 } = {}) {
  const g = new THREE.Group();
  const halfW = x => Wd / 2 * Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, x), 2.3)), 0.62) * (1 - 0.16 * Math.pow(Math.max(0, -x), 3));
  const top = x => Hh * 0.5 + 0.09 * Math.pow(Math.max(0, x), 2.4) + castle * THREE.MathUtils.smoothstep(-x, 0.35, 0.62);
  const bot = x => -Hh * 0.5 + 0.13 * Math.pow(Math.max(0, x), 2) + 0.07 * Math.pow(Math.max(0, -x), 2);
  const E = 0.8, SE = 0.55;
  // band texture: rows are theta, columns run stern->bow
  const tc = document.createElement('canvas'); tc.width = 1024; tc.height = 1024; const tx = tc.getContext('2d');
  const band = h => (h < 0.035 ? trim : h < 0.16 ? stripe : h < 0.2 ? trim : h < 0.68 ? hullC : h < 0.71 ? '#2a1408' : bottomC);
  for (let row = 0; row < 1024; row++) {
    const th = (row / 1023 - 0.5) * Math.PI, h = Math.pow(Math.abs(Math.cos(th)), E);
    tx.fillStyle = band(h); tx.fillRect(0, row, 1024, 1);
  }
  // planking lines
  tx.globalAlpha = 0.18; tx.fillStyle = '#000';
  for (const hh of [0.3, 0.4, 0.5, 0.6]) for (const sg of [1, -1]) { const th = Math.acos(Math.pow(hh, 1 / E)) * sg; const row = (th / Math.PI + 0.5) * 1023; tx.fillRect(0, row - 1, 1024, 2); }
  tx.globalAlpha = 1;
  // gun ports with gold frames, both sides
  for (let i = 0; i < ports; i++) {
    const x = -0.5 + i * (1.1 / Math.max(1, ports - 1)) * 0.9, col = (x + 1) / 2 * 1024;
    for (const sg of [1, -1]) {
      const r0 = (Math.acos(Math.pow(0.27, 1 / E)) * sg / Math.PI + 0.5) * 1023, r1 = (Math.acos(Math.pow(0.47, 1 / E)) * sg / Math.PI + 0.5) * 1023;
      const y0 = Math.min(r0, r1), hgt = Math.abs(r1 - r0), w = 30;
      tx.fillStyle = trim; tx.beginPath(); tx.roundRect(col - w / 2 - 6, y0 - 6, w + 12, hgt + 12, 6); tx.fill();
      tx.fillStyle = '#1c0d05'; tx.beginPath(); tx.roundRect(col - w / 2, y0, w, hgt, 4); tx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(tc); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const NX = 72, NT = 48, pos = [], uv = [], idx = [];
  for (let i = 0; i <= NX; i++) {
    const x = -1 + 2 * i / NX;
    for (let j = 0; j <= NT; j++) {
      const th = (j / NT - 0.5) * Math.PI, w = halfW(x), tp = top(x), bt = bot(x);
      const z = w * Math.sign(Math.sin(th)) * Math.pow(Math.abs(Math.sin(th)), SE);
      const y = tp - (tp - bt) * Math.pow(Math.abs(Math.cos(th)), E);
      pos.push(x * L / 2 + (x > 0.7 ? (y - bt) * (x - 0.7) * 0.5 : 0), y, z); uv.push((x + 1) / 2, 1 - j / NT);
    }
  }
  for (let i = 0; i < NX; i++) for (let j = 0; j < NT; j++) { const a = i * (NT + 1) + j, b = a + NT + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  hg.setIndex(idx); hg.computeVertexNormals();
  const hullM = mat('#ffffff', { map: tex, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.2, side: THREE.DoubleSide });
  g.add(new THREE.Mesh(hg, hullM));
  // transom
  const ts = new THREE.Shape(), xs = -1;
  for (let j = 0; j <= NT; j++) { const th = (j / NT - 0.5) * Math.PI, w = halfW(xs), tp = top(xs), bt = bot(xs); const z = w * Math.sign(Math.sin(th)) * Math.pow(Math.abs(Math.sin(th)), SE), y = tp - (tp - bt) * Math.pow(Math.abs(Math.cos(th)), E); j ? ts.lineTo(z, y) : ts.moveTo(z, y); }
  const tr = new THREE.Mesh(new THREE.ShapeGeometry(ts, 24), mat(hullC, { roughness: 0.45, clearcoat: 0.6, side: THREE.DoubleSide }));
  tr.rotation.y = -Math.PI / 2; tr.position.x = -L / 2; g.add(tr);
  const trimM = goldMat(trim, { roughness: 0.28 });
  const glassM = mat('#ffd98a', { emissive: '#ffb347', emissiveIntensity: 0.9, roughness: 0.2 });
  for (const z of [-0.1, 0, 0.1].map(k => k * Wd / 0.42)) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.075, 0.06), trimM); f.position.set(-L / 2 - 0.004, top(-1) - 0.08, z); g.add(f);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.055, 0.042), glassM); gl.position.copy(f.position); gl.position.x -= 0.002; g.add(gl);
  }
  // deck following the sheer
  const dp = [], di = [], dn = 40;
  for (let i = 0; i <= dn; i++) { const x = -0.995 + 1.99 * i / dn, w = halfW(x) * 0.94, y = top(x) - 0.03; dp.push(x * L / 2, y, -w, x * L / 2, y, w); if (i < dn) { const a = i * 2; di.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3)); dg.setIndex(di); dg.computeVertexNormals();
  g.add(new THREE.Mesh(dg, mat('#d8a160', { roughness: 0.7, clearcoat: 0.2, side: THREE.DoubleSide })));
  // gold rails along both gunwales and across the stern
  for (const sg of [1, -1]) {
    const pts = []; for (let i = 0; i <= 40; i++) { const x = -1 + i / 40 * 1.995; const y = top(x); pts.push([x * L / 2 + (x > 0.7 ? (y - bot(x)) * (x - 0.7) * 0.5 : 0), y, sg * halfW(x)]); }
    g.add(new THREE.Mesh(varTube(pts, () => 0.012, 80, 8), trimM));
  }
  g.add(new THREE.Mesh(varTube([[-L / 2, top(-1), -halfW(-1)], [-L / 2 - 0.005, top(-1) + 0.004, 0], [-L / 2, top(-1), halfW(-1)]], () => 0.012, 20, 8), trimM));
  const spar = mat('#5a3115', { roughness: 0.55, clearcoat: 0.3 });
  // bowsprit
  const bx = L / 2 + 0.02, by = top(1) - 0.02;
  const bsLen = L * 0.38, bsAng = 0.32;
  const bs = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, bsLen, 10), spar);
  bs.rotation.z = -(Math.PI / 2 - bsAng); bs.position.set(bx + Math.cos(bsAng) * bsLen / 2 - 0.05, by + Math.sin(bsAng) * bsLen / 2, 0); g.add(bs);
  const bsTip = new THREE.Vector3(bx + Math.cos(bsAng) * bsLen - 0.05, by + Math.sin(bsAng) * bsLen, 0);
  // canvas: panel seams + a soft darker foot, so the cloth reads as cloth
  const paintSail = (ex, n) => {
    ex.fillStyle = sailC; ex.fillRect(0, 0, n, n);
    ex.globalAlpha = 0.09; ex.fillStyle = '#6a4a20';
    for (let i = 1; i < 6; i++) ex.fillRect(i * n / 6 - 2, 0, 4, n);
    const gr = ex.createLinearGradient(0, 0, 0, n); gr.addColorStop(0, 'rgba(120,80,30,0)'); gr.addColorStop(1, 'rgba(120,80,30,.6)');
    ex.globalAlpha = 0.35; ex.fillStyle = gr; ex.fillRect(0, 0, n, n); ex.globalAlpha = 1;
  };
  const sc0 = document.createElement('canvas'); sc0.width = sc0.height = 256; paintSail(sc0.getContext('2d'), 256);
  const sTex = new THREE.CanvasTexture(sc0); sTex.colorSpace = THREE.SRGBColorSpace;
  const sailM = mat('#ffffff', { map: sTex, roughness: 0.75, clearcoat: 0, side: THREE.DoubleSide, emissive: '#ffe2b0', emissiveIntensity: 0.06 });
  const ropeM = mat('#3a2412', { roughness: 0.8 });
  const rope = (a, b, r = 0.0045) => g.add(new THREE.Mesh(varTube([a.toArray ? a.toArray() : a, b.toArray ? b.toArray() : b], () => r, 2, 5), ropeM));
  const mastTops = [];
  let mi = -1;
  for (const [mx, mh, ns] of masts) {
    mi++;
    const xm = mx * L, base = top(mx * 2 / 1) * 0 + top(mx * 2) - 0.03;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.024, mh, 12), spar); m.position.set(xm, base + mh / 2, 0); g.add(m);
    const tp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.03, 14), spar); tp.position.set(xm, base + mh * 0.58, 0); g.add(tp);
    mastTops.push(new THREE.Vector3(xm, base + mh - 0.02, 0));
    for (let k = 0; k < ns; k++) {
      const f0 = 0.16 + k * 0.27, hh = mh * (0.25 - k * 0.02), y0 = base + mh * f0;
      const ww = Wd * (2.15 - k * 0.42) * sailW, ww2 = ww * 0.86;
      const pg = new THREE.PlaneGeometry(1, 1, 18, 14);
      deform(pg, v => {
        const u = v.x * 2, w = v.y + 0.5; // u -1..1 across, w 0 foot .. 1 head
        const wid = ww + (ww2 - ww) * w;
        v.x = u * wid / 2;
        v.y = w * hh + (1 - w) * 0.035 * u * u - (w > 0.98 ? 0 : 0);
        v.z = billow * (1 - u * u) * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, w * 1.1 + 0.1))) * (1.1 - 0.3 * w);
      });
      pg.rotateY(Math.PI / 2);
      let sMat = sailM;
      if (emblem && mi === emblemAt[0] && k === emblemAt[1]) {
        const ec = document.createElement('canvas'); ec.width = ec.height = 512; const ex = ec.getContext('2d');
        paintSail(ex, 512); emblem(ex, 512);
        const et = new THREE.CanvasTexture(ec); et.colorSpace = THREE.SRGBColorSpace; et.anisotropy = 8;
        sMat = sailM.clone(); sMat.map = et; sMat.color.set('#ffffff');
      }
      const sm = new THREE.Mesh(pg, sMat); sm.position.set(xm + 0.03, y0, 0); g.add(sm);
      const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, ww2 * 1.12, 8), spar); yard.rotation.x = Math.PI / 2; yard.position.set(xm + 0.02, y0 + hh, 0); g.add(yard);
    }
  }
  // jib from the foremast to the bowsprit
  const fore = masts.reduce((a, b) => (b[0] > a[0] ? b : a));
  if (jib) {
    const ft = mastTops[masts.indexOf(fore)];
    const A = new THREE.Vector3(ft.x, ft.y - fore[1] * 0.2, 0), B = bsTip.clone(), C = new THREE.Vector3(L / 2 - 0.02, top(1) + 0.03, 0);
    const N = 14, p = [], ix = [];
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N - i; j++) {
      const a = i / N, b = j / N, c = 1 - a - b;
      const q = A.clone().multiplyScalar(c).addScaledVector(B, a).addScaledVector(C, b);
      q.z += billow * 2.2 * a * b * c * 4;
      p.push(q.x, q.y, q.z);
    }
    let k = 0; const row = []; for (let i = 0; i <= N; i++) { row.push(k); k += N - i + 1; }
    for (let i = 0; i < N; i++) for (let j = 0; j < N - i; j++) { const a = row[i] + j, b = row[i + 1] + j; ix.push(a, b, a + 1); if (j < N - i - 1) ix.push(a + 1, b, b + 1); }
    const jg = new THREE.BufferGeometry(); jg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); jg.setIndex(ix); jg.computeVertexNormals();
    g.add(new THREE.Mesh(jg, sailM));
  }
  if (rig) {
    for (let i = 0; i < mastTops.length; i++) {
      const t = mastTops[i];
      for (const sg of [1, -1]) rope(t, [t.x - 0.06, top(t.x / L * 2) + 0.005, sg * halfW(t.x / L * 2) * 0.98], 0.0035);
      if (i < mastTops.length - 1) rope(t, mastTops[i + 1]);
    }
    rope(mastTops[masts.indexOf(fore)], bsTip);
    const aft = mastTops[masts.indexOf(masts.reduce((a, b) => (b[0] < a[0] ? b : a)))];
    rope(aft, [-L / 2, top(-1) + 0.01, 0]);
  }
  // flag on the tallest mast
  const ti = masts.indexOf(masts.reduce((a, b) => (b[1] > a[1] ? b : a)));
  const fg = new THREE.PlaneGeometry(0.24, 0.1, 14, 3);
  deform(fg, v => { const u = (v.x + 0.12) / 0.24; v.z = Math.sin(u * 5.5) * 0.022 * u; v.y *= 1 - u * 0.5; });
  fg.translate(0.12, 0, 0);
  const fl = new THREE.Mesh(fg, mat(flag, { roughness: 0.6, side: THREE.DoubleSide, sheen: 0.6 }));
  fl.position.copy(mastTops[ti]); fl.position.y -= 0.03; fl.rotation.y = Math.PI; g.add(fl);
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.028, 14, 10), glassM); lantern.position.set(-L / 2 + 0.03, top(-1) + 0.07, 0); g.add(lantern);
  g.userData.top = top; g.userData.halfW = halfW;
  return g;
}
