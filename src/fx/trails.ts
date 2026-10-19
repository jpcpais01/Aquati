import * as THREE from 'three';
import { globalUniforms } from '../render/environment';

// Continuous smoke ribbons left hanging behind cannonballs. Each ball lays
// down points along its flight path; the points age, widen, drift on the wind
// and fade, and are drawn as one camera-facing strip per shot, so the wake
// reads as a single unbroken thread of smoke at any frame rate. One draw call.

const PTS = 64; // points per ribbon (ring buffer)
const SPACING = 1.6; // metres between laid points

/** smoke rgb, alpha, width at birth, width when old, life (s), glow rgb, rainbow (0/1) */
type RibbonStyle = [number, number, number, number, number, number, number, number, number, number, number];
const STYLES: Record<string, RibbonStyle> = {
  powder: [0.95, 0.94, 0.93, 0.42, 0.3, 2.1, 1.9, 0, 0, 0, 0],
  spray: [1.1, 1.16, 1.2, 0.32, 0.25, 1.6, 1.2, 0, 0, 0, 0],
  soot: [0.32, 0.3, 0.29, 0.55, 0.38, 2.7, 2.4, 0, 0, 0, 0],
  ember: [0.72, 0.64, 0.58, 0.3, 0.26, 1.7, 1.4, 2.6, 1.0, 0.25, 0],
  frost: [0.9, 1.05, 1.25, 0.45, 0.3, 2.0, 1.7, 0.5, 1.0, 1.6, 0],
  comet: [1.15, 1.05, 0.9, 0.32, 0.34, 1.9, 1.5, 3.0, 2.0, 0.6, 0],
  ghost: [0.75, 1.0, 0.88, 0.32, 0.34, 1.9, 1.4, 0.5, 2.4, 1.3, 0],
  rainbow: [1, 1, 1, 0.26, 0.3, 1.7, 1.4, 1.6, 1.6, 1.6, 1],
  starfall: [0.85, 0.85, 1.05, 0.26, 0.26, 1.6, 1.5, 1.6, 1.4, 2.6, 0],
  fuse: [0.55, 0.52, 0.5, 0.4, 0.22, 1.6, 1.5, 2.0, 1.0, 0.3, 0],
  fire: [0.3, 0.27, 0.25, 0.52, 0.4, 2.5, 2.1, 3.4, 1.3, 0.3, 0],
  chain: [0.95, 0.94, 0.93, 0.42, 0.45, 2.4, 1.9, 0, 0, 0, 0],
};

class Ribbon {
  px = new Float32Array(PTS);
  py = new Float32Array(PTS);
  pz = new Float32Array(PTS);
  pt = new Float32Array(PTS); // birth time
  pd = new Float32Array(PTS); // distance along the flight path
  start = 0;
  count = 0;
  attached = false;
  inUse = false;
  hx = 0; hy = 0; hz = 0; // live head (the ball itself)
  dist = 0;
  seed = 0;
  st: RibbonStyle = STYLES.powder;
  young = 1;
  released = 0;

  last() { return (this.start + this.count - 1) % PTS; }

  lay(x: number, y: number, z: number, t: number) {
    if (this.count === PTS) { this.start = (this.start + 1) % PTS; this.count--; }
    const i = (this.start + this.count) % PTS;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z; this.pt[i] = t; this.pd[i] = this.dist;
    this.count++;
  }
}

export class Ribbons {
  readonly mesh: THREE.Mesh;
  private rs: Ribbon[] = [];
  private time = 0;
  private geo: THREE.BufferGeometry;
  private aPos: Float32Array;
  private aTan: Float32Array;
  private aData: Float32Array;
  private aTint: Float32Array;
  private aGlow: Float32Array;
  private aWid: Float32Array;
  private idx: Uint16Array;
  private attrs: THREE.BufferAttribute[];
  private index: THREE.BufferAttribute;

  constructor(private cap: number, uniforms: Record<string, THREE.IUniform>) {
    for (let i = 0; i < cap; i++) this.rs.push(new Ribbon());
    const verts = cap * (PTS + 1) * 2;
    this.aPos = new Float32Array(verts * 3);
    this.aTan = new Float32Array(verts * 3);
    this.aData = new Float32Array(verts * 4);
    this.aTint = new Float32Array(verts * 4);
    this.aGlow = new Float32Array(verts * 4);
    this.aWid = new Float32Array(verts * 2);
    this.idx = new Uint16Array(cap * PTS * 6);
    this.geo = new THREE.BufferGeometry();
    const mk = (arr: Float32Array, n: number) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    this.attrs = [mk(this.aPos, 3), mk(this.aTan, 3), mk(this.aData, 4), mk(this.aTint, 4), mk(this.aGlow, 4), mk(this.aWid, 2)];
    ['position', 'aTan', 'aData', 'aTint', 'aGlow', 'aWid'].forEach((n, i) => this.geo.setAttribute(n, this.attrs[i]));
    this.index = new THREE.BufferAttribute(this.idx, 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setIndex(this.index);
    this.geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      premultipliedAlpha: true,
      blending: THREE.NormalBlending,
      vertexShader: /* glsl */ `
        attribute vec3 aTan; attribute vec4 aData; attribute vec4 aTint; attribute vec4 aGlow; attribute vec2 aWid;
        varying vec4 vData; varying vec4 vTint; varying vec4 vGlow; varying float vViewZ;
        void main() {
          vData = aData; vTint = aTint; vGlow = aGlow;
          vec3 side = cross(aTan, cameraPosition - position);
          float sl = length(side);
          side = sl > 1e-5 ? side / sl : vec3(1.0, 0.0, 0.0);
          float w = mix(aWid.x, aWid.y, sqrt(aData.y));
          vec4 mv = viewMatrix * vec4(position + side * aData.x * w * 0.5, 1.0);
          vViewZ = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uNoiseTex; uniform sampler2D uSceneDepth; uniform vec2 uResolution; uniform vec2 uCamNearFar;
        uniform vec3 uLight; uniform float uFlash; uniform vec3 uSunColor; uniform float uCloudCover;
        uniform vec3 uFogColor; uniform vec2 uFogRange; uniform float uTime;
        varying vec4 vData; varying vec4 vTint; varying vec4 vGlow; varying float vViewZ;
        float linearDepth(float d) { float n = uCamNearFar.x, f = uCamNearFar.y; return (n * f) / (f - d * (f - n)); }
        vec3 hue(float h) { return clamp(abs(fract(h + vec3(0.0, 2.0, 1.0) / 3.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }
        void main() {
          float v = vData.x, age = vData.y, d = vData.z;
          float across = 1.0 - v * v;
          // the thread twists and frays: noise runs along the path and slowly churns
          vec2 nuv = vec2(d * 0.07 - uTime * 0.03, v * 0.28 + vData.w);
          float n1 = texture(uNoiseTex, nuv).g;
          float n2 = texture(uNoiseTex, nuv * vec2(2.6, 2.0) + vec2(uTime * 0.02, 0.0)).a;
          float n = clamp((n1 - 0.5) * 2.4 + (n2 - 0.5) * 1.2 + 0.5, 0.0, 1.0);
          float dens = across * (0.55 + n * 0.9) - 0.18 - age * 0.55;
          float a = smoothstep(0.0, 0.4, dens);
          a *= (1.0 - age) * (1.0 - age) * smoothstep(0.0, 0.035, age); // eases in behind the ball, fades out at the tail
          vec2 suv = gl_FragCoord.xy / uResolution;
          a *= clamp((linearDepth(texture(uSceneDepth, suv).r) - vViewZ) * 0.6, 0.0, 1.0);
          a *= vTint.a;
          vec3 g = vGlow.w > 0.5 ? hue(d * 0.025 - uTime * 0.25) * 2.4 : vGlow.rgb;
          float gk = pow(1.0 - age, 6.0) * across * across * smoothstep(0.0, 0.02, age);
          if (a < 0.003 && gk * dot(g, vec3(1.0)) < 0.01) discard;
          float open = 1.0 - uCloudCover * 0.65;
          vec3 lit = (uLight + uFlash * 0.8) * 0.72 + uSunColor * 0.12 * open;
          vec3 col = vTint.rgb * lit;
          float fog = smoothstep(uFogRange.x, uFogRange.y, vViewZ) * 0.85;
          col = mix(col, uFogColor, fog);
          gl_FragColor = vec4(col * a + g * gk * (1.0 - fog), a);
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
  }

  /** A new ribbon for a ball leaving the barrel at `pos`; -1 if the style lays no smoke. */
  start(pos: THREE.Vector3, style: string, young = 1): number {
    const st = STYLES[style] ?? STYLES.powder;
    let pick = -1, oldest = Infinity;
    for (let i = 0; i < this.cap; i++) {
      const r = this.rs[i];
      if (!r.inUse) { pick = i; break; }
      if (!r.attached && r.released < oldest) { oldest = r.released; pick = i; }
    }
    if (pick < 0) return -1;
    const r = this.rs[pick];
    r.inUse = true; r.attached = true; r.start = 0; r.count = 0; r.dist = 0;
    r.st = st; r.young = young; r.seed = Math.random();
    r.hx = pos.x; r.hy = pos.y; r.hz = pos.z;
    r.lay(pos.x, pos.y, pos.z, this.time);
    return pick;
  }

  /** The ball moved: lay evenly spaced points along the segment since the last one. */
  follow(id: number, pos: THREE.Vector3) {
    const r = this.rs[id];
    if (!r || !r.attached) return;
    const li = r.last();
    let lx = r.px[li], ly = r.py[li], lz = r.pz[li];
    const dx = pos.x - lx, dy = pos.y - ly, dz = pos.z - lz;
    const len = Math.hypot(dx, dy, dz);
    if (len >= SPACING) {
      // sub-frame interpolation: even spacing whatever the frame rate
      const steps = Math.min(Math.floor(len / SPACING), 12);
      const t0 = r.pt[li], dtSeg = this.time - t0;
      for (let k = 1; k <= steps; k++) {
        const f = (k * SPACING) / len;
        r.dist += SPACING;
        r.lay(lx + dx * f, ly + dy * f, lz + dz * f, t0 + dtSeg * f);
      }
    }
    r.hx = pos.x; r.hy = pos.y; r.hz = pos.z;
  }

  /** The ball is gone: the smoke it left keeps hanging until it fades. */
  release(id: number) {
    const r = this.rs[id];
    if (!r || !r.attached) return;
    const li = r.last();
    const dl = Math.hypot(r.hx - r.px[li], r.hy - r.py[li], r.hz - r.pz[li]);
    if (dl > 0.05) { r.dist += dl; r.lay(r.hx, r.hy, r.hz, this.time); }
    r.attached = false;
    r.released = this.time;
  }

  clear() {
    for (const r of this.rs) { r.inUse = false; r.attached = false; r.count = 0; }
    this.geo.setDrawRange(0, 0);
  }

  update(dt: number) {
    this.time += dt;
    const now = this.time;
    const w = globalUniforms.uWind.value;
    const windSpeed = 1.2 + w.z * 4.5;
    const wx = w.x * windSpeed * dt, wz = w.y * windSpeed * dt;
    let v = 0, ii = 0;
    const P = this.aPos, T = this.aTan, D = this.aData, C = this.aTint, G = this.aGlow, W = this.aWid, I = this.idx;
    for (const r of this.rs) {
      if (!r.inUse) continue;
      const st = r.st, life = st[6];
      // expire the oldest points
      while (r.count > 0 && now - r.pt[r.start] >= life) { r.start = (r.start + 1) % PTS; r.count--; }
      if (r.count === 0 && !r.attached) { r.inUse = false; continue; }
      // drift on the breeze and rise a little, more as each point ages
      for (let k = 0; k < r.count; k++) {
        const i = (r.start + k) % PTS;
        const ride = Math.min(1, (now - r.pt[i]) * 1.5);
        r.px[i] += wx * ride; r.pz[i] += wz * ride; r.py[i] += 0.25 * dt * ride;
      }
      const n = r.count + (r.attached ? 1 : 0);
      if (n < 2) continue;
      const base = v;
      const alpha = st[3] * (0.65 + r.young * 0.35);
      for (let k = 0; k < n; k++) {
        const head = r.attached && k === n - 1;
        const i = (r.start + k) % PTS;
        const x = head ? r.hx : r.px[i], y = head ? r.hy : r.py[i], z = head ? r.hz : r.pz[i];
        const age = head ? 0 : Math.min(0.999, (now - r.pt[i]) / life);
        const d = head ? r.dist + Math.hypot(r.hx - r.px[r.last()], r.hy - r.py[r.last()], r.hz - r.pz[r.last()]) : r.pd[i];
        // tangent from neighbours
        const ka = Math.max(0, k - 1), kb = Math.min(n - 1, k + 1);
        const ia = (r.start + ka) % PTS, ib = (r.start + kb) % PTS;
        const ax = r.attached && ka === n - 1 ? r.hx : r.px[ia], ay = r.attached && ka === n - 1 ? r.hy : r.py[ia], az = r.attached && ka === n - 1 ? r.hz : r.pz[ia];
        const bx = r.attached && kb === n - 1 ? r.hx : r.px[ib], by = r.attached && kb === n - 1 ? r.hy : r.py[ib], bz = r.attached && kb === n - 1 ? r.hz : r.pz[ib];
        for (let s = 0; s < 2; s++) {
          const o = v + s;
          P[o * 3] = x; P[o * 3 + 1] = y; P[o * 3 + 2] = z;
          T[o * 3] = bx - ax; T[o * 3 + 1] = by - ay; T[o * 3 + 2] = bz - az;
          D[o * 4] = s === 0 ? -1 : 1; D[o * 4 + 1] = age; D[o * 4 + 2] = d; D[o * 4 + 3] = r.seed;
          C[o * 4] = st[0]; C[o * 4 + 1] = st[1]; C[o * 4 + 2] = st[2]; C[o * 4 + 3] = alpha;
          G[o * 4] = st[7]; G[o * 4 + 1] = st[8]; G[o * 4 + 2] = st[9]; G[o * 4 + 3] = st[10];
          W[o * 2] = st[4]; W[o * 2 + 1] = st[5];
        }
        v += 2;
      }
      for (let k = 0; k < n - 1; k++) {
        const a = base + k * 2;
        I[ii++] = a; I[ii++] = a + 1; I[ii++] = a + 2;
        I[ii++] = a + 1; I[ii++] = a + 3; I[ii++] = a + 2;
      }
    }
    this.geo.setDrawRange(0, ii);
    if (ii === 0) return;
    const sizes = [3, 3, 4, 4, 4, 2];
    this.attrs.forEach((at, k) => {
      at.clearUpdateRanges();
      at.addUpdateRange(0, v * sizes[k]);
      at.needsUpdate = true;
    });
    this.index.clearUpdateRanges();
    this.index.addUpdateRange(0, ii);
    this.index.needsUpdate = true;
  }
}
