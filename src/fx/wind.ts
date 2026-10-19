import * as THREE from 'three';
import { globalUniforms, GUST_STRETCH, MAX_GUSTS } from '../render/environment';

// Wind you can actually see. Instead of everything wobbling on a global sine,
// discrete gust puffs spawn upwind of the camera and roll across the world:
//   - the ocean shader roughens into dark "cat's paw" patches under them,
//   - palms and trees get shoved over as a puff passes and spring back,
//   - sails fill harder and a ship picks up a touch of speed,
//   - little white air wisps ride inside the strongest puffs, curling and
//     now and then looping before they unravel.
// One CPU-side field feeds all of it, so every effect agrees on where the gust is.

interface Gust {
  x: number;
  z: number;
  age: number;
  life: number;
  radius: number;
  str: number;
  speed: number;
  amp: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export class WindField {
  private gusts: Gust[] = [];
  private cx = 0;
  private cz = 0;
  private reach = 160;
  private wx: number;
  private wz: number;
  /** Weather scale on gust strength (1 = a normal breezy day). */
  intensity = 1;

  constructor(dirX: number, dirZ: number, count: number) {
    this.wx = dirX;
    this.wz = dirZ;
    for (let i = 0; i < count; i++) this.gusts.push(this.spawn(true));
  }

  private spawn(scatter: boolean): Gust {
    const radius = rand(16, 34);
    const speed = rand(9, 15);
    // start just upwind of the view and travel across it
    const along = scatter ? rand(-1.1, 0.9) : rand(-1.35, -1.05);
    const across = rand(-1, 1);
    const r = this.reach;
    const g: Gust = {
      x: this.cx + this.wx * along * r - this.wz * across * r,
      z: this.cz + this.wz * along * r + this.wx * across * r,
      age: 0,
      life: (r * 2.4) / speed,
      radius,
      str: rand(0.55, 1.05),
      speed,
      amp: 0,
    };
    if (scatter) g.age = rand(0, g.life * 0.6);
    return g;
  }

  update(dt: number, cx: number, cz: number, reach: number) {
    this.cx = cx;
    this.cz = cz;
    this.reach = reach;
    const u = globalUniforms.uGusts.value;
    for (let i = 0; i < this.gusts.length; i++) {
      let g = this.gusts[i];
      g.age += dt;
      g.x += this.wx * g.speed * dt;
      g.z += this.wz * g.speed * dt;
      // respawn once spent, or once the camera has left it far behind
      const dx = g.x - cx;
      const dz = g.z - cz;
      if (g.age > g.life || dx * dx + dz * dz > reach * reach * 4) g = this.gusts[i] = this.spawn(false);
      // swell in, hold, die away; plus a slow internal pulse
      const env = smooth(0, 2.2, g.age) * (1 - smooth(g.life - 3, g.life, g.age));
      g.amp = g.str * this.intensity * env * (0.8 + 0.2 * Math.sin(g.age * 1.7 + i));
      u[i].set(g.x, g.z, g.radius, g.amp);
    }
    for (let i = this.gusts.length; i < MAX_GUSTS; i++) u[i].w = 0;
  }

  /** Gust intensity at a point (0 calm .. ~1.4). Mirrors gustAt() in GLSL. */
  at(x: number, z: number): number {
    let s = 0;
    const k = 1 / GUST_STRETCH;
    for (const g of this.gusts) {
      if (g.amp <= 0) continue;
      const dx = x - g.x;
      const dz = z - g.z;
      const a = (dx * this.wx + dz * this.wz) * k;
      const b = -dx * this.wz + dz * this.wx;
      const r = Math.max(1 - (a * a + b * b) / (g.radius * g.radius), 0);
      s += g.amp * r * r;
    }
    return Math.min(s, 1.4);
  }

  /** A random point inside a strong gust near the given centre, or null. */
  pickInside(cx: number, cz: number, reach: number, out: THREE.Vector3): Gust | null {
    let best: Gust | null = null;
    let tries = 0;
    while (tries++ < 4) {
      const g = this.gusts[Math.floor(Math.random() * this.gusts.length)];
      if (g.amp < 0.35) continue;
      const dx = g.x - cx;
      const dz = g.z - cz;
      if (dx * dx + dz * dz > reach * reach) continue;
      best = g;
      break;
    }
    if (!best) return null;
    const a = rand(-1, 1) * best.radius * GUST_STRETCH * 0.6;
    const b = rand(-1, 1) * best.radius * 0.6;
    out.set(best.x + this.wx * a - this.wz * b, 0, best.z + this.wz * a + this.wx * b);
    return best;
  }
}

// ----------------------------------------------------------------- wisps

const SEGS = 40; // points along each ribbon
const TRAIL = 1.5; // seconds of path the ribbon covers

interface Wisp {
  ox: number;
  oy: number;
  oz: number;
  t: number;
  life: number;
  speed: number;
  wig: number; // side-to-side amplitude
  wigF: number;
  wigP: number;
  bob: number;
  loopAt: number; // time the loop starts (or > life for none)
  loopDur: number;
  loopR: number;
  loopTilt: number;
  width: number;
  alpha: number;
}

export class WindWisps {
  readonly mesh: THREE.Mesh;
  private wisps: Wisp[] = [];
  private pos: Float32Array;
  private uvA: Float32Array;
  private attrPos: THREE.BufferAttribute;
  private attrUv: THREE.BufferAttribute;
  private geo = new THREE.BufferGeometry();
  private spawnT = 0;
  private tmp = new THREE.Vector3();
  private pts = new Float32Array(SEGS * 3);
  readonly uniforms = {
    uSceneDepth: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCamNearFar: { value: new THREE.Vector2(1, 1000) },
  };

  constructor(private field: WindField, private max: number, private heightAt: (x: number, z: number) => number) {
    const verts = max * SEGS * 2;
    this.pos = new Float32Array(verts * 3);
    this.uvA = new Float32Array(verts * 3); // along, across, alpha
    const idx: number[] = [];
    for (let w = 0; w < max; w++) {
      const o = w * SEGS * 2;
      for (let i = 0; i < SEGS - 1; i++) {
        const a = o + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    this.attrPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.attrUv = new THREE.BufferAttribute(this.uvA, 3).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.attrPos);
    this.geo.setAttribute('aRib', this.attrUv);
    this.geo.setIndex(idx);
    this.geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uFogColor: globalUniforms.uFogColor, uFogRange: globalUniforms.uFogRange, uLight: globalUniforms.uLight },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      premultipliedAlpha: true,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec3 aRib;
        varying vec3 vRib; varying float vViewZ;
        void main() {
          vRib = aRib;
          vec4 mv = viewMatrix * vec4(position, 1.0);
          vViewZ = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uSceneDepth; uniform vec2 uResolution; uniform vec2 uCamNearFar;
        uniform vec3 uFogColor; uniform vec2 uFogRange; uniform vec3 uLight;
        varying vec3 vRib; varying float vViewZ;
        float linearDepth(float d) { float n = uCamNearFar.x, f = uCamNearFar.y; return (n * f) / (f - d * (f - n)); }
        void main() {
          // soft core across the ribbon, brighter toward the leading end
          float x = abs(vRib.y);
          float a = (1.0 - x) * (1.0 - x) * vRib.z;
          vec2 suv = gl_FragCoord.xy / uResolution;
          float sz = linearDepth(texture(uSceneDepth, suv).r);
          a *= clamp((sz - vViewZ) * 0.5, 0.0, 1.0);
          if (a < 0.004) discard;
          vec3 col = mix(vec3(1.25, 1.3, 1.34) * uLight, uFogColor, smoothstep(uFogRange.x, uFogRange.y, vViewZ) * 0.8);
          gl_FragColor = vec4(col * a, a);
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
  }

  private spawn(cx: number, cz: number, reach: number) {
    const g = this.field.pickInside(cx, cz, reach, this.tmp);
    if (!g) return;
    const ground = this.heightAt(this.tmp.x, this.tmp.z);
    const life = rand(1.6, 2.6);
    const loops = Math.random() < 0.35;
    this.wisps.push({
      ox: this.tmp.x,
      oy: Math.max(ground, 0) + rand(1.5, 5),
      oz: this.tmp.z,
      t: 0,
      life,
      speed: g.speed * rand(1.7, 2.3),
      wig: rand(0.6, 1.8),
      wigF: rand(0.9, 1.7),
      wigP: rand(0, Math.PI * 2),
      bob: rand(0.2, 0.6),
      loopAt: loops ? rand(0.4, life - 0.9) : 1e9,
      loopDur: rand(0.5, 0.75),
      loopR: rand(2.4, 4.2),
      loopTilt: rand(0.2, 0.7) * (Math.random() < 0.5 ? -1 : 1),
      width: rand(0.8, 1.15),
      alpha: rand(0.4, 0.6) * Math.min(1, g.amp * 1.4),
    });
  }

  /** Path of a wisp at local time t, written to out (x,y,z). */
  private path(w: Wisp, t: number, wx: number, wz: number, out: Float32Array, o: number) {
    const fwd = w.speed * t;
    const side = Math.sin(t * w.wigF + w.wigP) * w.wig + Math.sin(t * w.wigF * 2.3 + w.wigP * 1.7) * w.wig * 0.3;
    let up = Math.sin(t * 1.9 + w.wigP) * w.bob;
    let la = 0;
    let lb = 0;
    const lt = (t - w.loopAt) / w.loopDur;
    if (lt > 0) {
      // a full circle in a tilted plane; spins faster than the drift so it truly loops
      const th = Math.PI * 2 * smooth(0, 1, lt);
      la = Math.sin(th) * w.loopR;
      lb = (1 - Math.cos(th)) * w.loopR;
    }
    const sideTot = side + lb * Math.cos(w.loopTilt);
    up += lb * Math.abs(Math.sin(w.loopTilt));
    const f = fwd + la;
    out[o] = w.ox + wx * f - wz * sideTot;
    out[o + 1] = w.oy + up;
    out[o + 2] = w.oz + wz * f + wx * sideTot;
  }

  update(dt: number, cx: number, cz: number, reach: number, cam: THREE.Camera, wx: number, wz: number) {
    this.spawnT += dt;
    const rate = 2.6;
    while (this.spawnT > 1 / rate) {
      this.spawnT -= 1 / rate;
      if (this.wisps.length < this.max) this.spawn(cx, cz, reach);
    }

    const cp = cam.position;
    let n = 0;
    const P = this.pos;
    const U = this.uvA;
    const pts = this.pts;
    for (let k = this.wisps.length - 1; k >= 0; k--) {
      const w = this.wisps[k];
      w.t += dt;
      if (w.t > w.life + TRAIL) {
        this.wisps.splice(k, 1);
        continue;
      }
      // head runs ahead for the first part of its life, then the tail catches up
      const head = Math.min(w.t, w.life);
      const tail = Math.max(0, w.t - TRAIL);
      const span = head - tail;
      if (span < 0.02) continue;
      for (let i = 0; i < SEGS; i++) this.path(w, tail + (span * i) / (SEGS - 1), wx, wz, pts, i * 3);
      const fin = smooth(0, 0.25, w.t);
      const fout = 1 - smooth(w.life - 0.4, w.life + TRAIL, w.t);
      const dist = Math.hypot(pts[(SEGS - 1) * 3] - cp.x, pts[(SEGS - 1) * 3 + 1] - cp.y, pts[(SEGS - 1) * 3 + 2] - cp.z);
      // stay a couple of pixels wide whatever the zoom
      const hw = Math.max(0.05, dist * 0.0009) * w.width;
      const base = n * SEGS * 2;
      for (let i = 0; i < SEGS; i++) {
        const o = i * 3;
        const i0 = Math.max(0, i - 1) * 3;
        const i1 = Math.min(SEGS - 1, i + 1) * 3;
        const tx = pts[i1] - pts[i0];
        const ty = pts[i1 + 1] - pts[i0 + 1];
        const tz = pts[i1 + 2] - pts[i0 + 2];
        // side vector = tangent x view direction
        const vx = pts[o] - cp.x;
        const vy = pts[o + 1] - cp.y;
        const vz = pts[o + 2] - cp.z;
        let sx = ty * vz - tz * vy;
        let sy = tz * vx - tx * vz;
        let sz = tx * vy - ty * vx;
        const sl = Math.hypot(sx, sy, sz) || 1;
        const s = i / (SEGS - 1); // 0 tail .. 1 head
        const taper = Math.sin(Math.PI * Math.pow(s, 0.75));
        const width = hw * (0.1 + 0.9 * taper);
        sx = (sx / sl) * width;
        sy = (sy / sl) * width;
        sz = (sz / sl) * width;
        const a = w.alpha * fin * fout * Math.pow(s, 0.8) * smooth(1, 0.9, s);
        const v = (base + i * 2) * 3;
        P[v] = pts[o] - sx;
        P[v + 1] = pts[o + 1] - sy;
        P[v + 2] = pts[o + 2] - sz;
        P[v + 3] = pts[o] + sx;
        P[v + 4] = pts[o + 1] + sy;
        P[v + 5] = pts[o + 2] + sz;
        U[v] = s;
        U[v + 1] = -1;
        U[v + 2] = a;
        U[v + 3] = s;
        U[v + 4] = 1;
        U[v + 5] = a;
      }
      n++;
    }
    this.geo.setDrawRange(0, n * (SEGS - 1) * 6);
    if (n > 0) {
      this.attrPos.clearUpdateRanges();
      this.attrPos.addUpdateRange(0, n * SEGS * 6);
      this.attrPos.needsUpdate = true;
      this.attrUv.clearUpdateRanges();
      this.attrUv.addUpdateRange(0, n * SEGS * 6);
      this.attrUv.needsUpdate = true;
    }
  }

  setScene(depth: THREE.Texture, w: number, h: number, cam: THREE.PerspectiveCamera) {
    this.uniforms.uSceneDepth.value = depth;
    this.uniforms.uResolution.value.set(w, h);
    this.uniforms.uCamNearFar.value.set(cam.near, cam.far);
  }
}
