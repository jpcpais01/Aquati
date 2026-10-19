import * as THREE from 'three';

// Storm lightning. Two kinds of event, like the real thing:
//   - cloud-to-sea strikes: a forked, jagged channel grown by midpoint
//     displacement, flickering through several return strokes, with a burst
//     of light where it meets the water;
//   - sheet lightning: the cloud deck glowing from inside, no visible channel,
//     far off with a long low rumble.
// Both feed one `flash` level that the sky, the sea's reflections, the
// environment light and the final grade all brighten with.

const MAX_VERTS = 1400;

interface Stroke {
  at: number;
  amp: number;
}

export interface Strike {
  x: number;
  z: number;
  bolt: boolean;
  power: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Lightning {
  readonly mesh: THREE.Mesh;
  flash = 0;
  private boltGlow = 0;
  private geo = new THREE.BufferGeometry();
  private pos = new Float32Array(MAX_VERTS * 3);
  private rib = new Float32Array(MAX_VERTS * 2); // across, brightness
  private attrPos: THREE.BufferAttribute;
  private attrRib: THREE.BufferAttribute;
  private timer = 9;
  private t = 0;
  private strokes: Stroke[] = [];
  private boltStrokes = false;
  private uBolt = { value: 0 };
  readonly uniforms = {
    uSceneDepth: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCamNearFar: { value: new THREE.Vector2(1, 1000) },
  };

  constructor() {
    this.attrPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.attrRib = new THREE.BufferAttribute(this.rib, 2).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.attrPos);
    this.geo.setAttribute('aRib', this.attrRib);
    this.geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uBolt: this.uBolt },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      premultipliedAlpha: true,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec2 aRib; varying vec2 vRib; varying float vViewZ;
        void main() {
          vRib = aRib;
          vec4 mv = viewMatrix * vec4(position, 1.0);
          vViewZ = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uBolt; uniform sampler2D uSceneDepth; uniform vec2 uResolution; uniform vec2 uCamNearFar;
        varying vec2 vRib; varying float vViewZ;
        float linearDepth(float d) { float n = uCamNearFar.x, f = uCamNearFar.y; return (n * f) / (f - d * (f - n)); }
        void main() {
          float x = abs(vRib.x);
          // white-hot core inside a violet-blue glow
          float core = smoothstep(0.35, 0.0, x);
          float glow = (1.0 - x) * (1.0 - x);
          vec2 suv = gl_FragCoord.xy / uResolution;
          if (linearDepth(texture(uSceneDepth, suv).r) < vViewZ) discard;
          vec3 c = vec3(6.0, 6.5, 8.0) * core + vec3(0.9, 1.0, 2.2) * glow;
          gl_FragColor = vec4(c * vRib.y * uBolt, 0.0);
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 22;
  }

  /** Advances the storm's lightning. Returns a strike when one starts this frame. */
  update(dt: number, storm: number, cx: number, cz: number, cam: THREE.Camera): Strike | null {
    this.t += dt;
    // flash envelope: each return stroke jumps up and decays fast
    let f = 0;
    for (const s of this.strokes) if (this.t >= s.at) f += s.amp * Math.exp(-(this.t - s.at) * 16);
    if (this.strokes.length && this.t > this.strokes[this.strokes.length - 1].at + 0.6) this.strokes.length = 0;
    this.flash = f;
    this.boltGlow = this.boltStrokes ? f : 0;
    this.uBolt.value = Math.min(this.boltGlow, 1.4);
    if (this.boltGlow < 0.01) this.geo.setDrawRange(0, 0);

    if (storm < 0.3 || dt === 0) {
      this.timer = Math.max(this.timer, 4);
      return null;
    }
    this.timer -= dt * storm;
    if (this.timer > 0) return null;
    // a storm at full strength flashes every few seconds
    this.timer = rand(3, 13);
    const bolt = Math.random() < 0.55;
    // strikes favour the far side of the view, where the channel stays on screen
    const a = -Math.PI / 2 + rand(-1.2, 1.2);
    const d = bolt ? rand(170, 560) : rand(500, 1400);
    const x = cx + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d;
    const power = rand(0.6, 1);
    this.strokes = [];
    const n = bolt ? 2 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 2);
    let at = this.t;
    for (let i = 0; i < n; i++) {
      this.strokes.push({ at, amp: (bolt ? 1 : 0.45) * power * (i === 0 ? 1 : rand(0.45, 0.9)) });
      at += rand(0.05, 0.16);
    }
    this.boltStrokes = bolt;
    if (bolt) this.build(x, z, cam);
    return { x, z, bolt, power };
  }

  /** Grows a forked channel from the cloud base down to the sea at (x, z). */
  private build(x: number, z: number, cam: THREE.Camera) {
    const top = rand(330, 420);
    const main = this.channel(x + rand(-60, 60), top, z + rand(-60, 60), x, 0, z, 7, 0.55);
    const lines: { pts: number[]; w: number; b: number }[] = [{ pts: main, w: 2.2, b: 1 }];
    const branches = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < branches; i++) {
      const k = Math.floor(rand(0.12, 0.6) * (main.length / 3)) * 3;
      const sx = main[k], sy = main[k + 1], sz = main[k + 2];
      const len = sy * rand(0.25, 0.55);
      const ang = Math.random() * Math.PI * 2;
      const pts = this.channel(sx, sy, sz, sx + Math.cos(ang) * len * 0.7, sy - len, sz + Math.sin(ang) * len * 0.7, 5, 0.5);
      lines.push({ pts, w: 1.0, b: 0.55 });
    }
    let v = 0;
    const cp = cam.position;
    const P = this.pos;
    const R = this.rib;
    const idx: number[] = [];
    for (const l of lines) {
      const n = l.pts.length / 3;
      if (v + n * 2 > MAX_VERTS) break;
      const base = v;
      for (let i = 0; i < n; i++) {
        const o = i * 3;
        const i0 = Math.max(0, i - 1) * 3;
        const i1 = Math.min(n - 1, i + 1) * 3;
        const tx = l.pts[i1] - l.pts[i0], ty = l.pts[i1 + 1] - l.pts[i0 + 1], tz = l.pts[i1 + 2] - l.pts[i0 + 2];
        const vx = l.pts[o] - cp.x, vy = l.pts[o + 1] - cp.y, vz = l.pts[o + 2] - cp.z;
        let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx;
        const sl = Math.hypot(sx, sy, sz) || 1;
        const dist = Math.hypot(vx, vy, vz);
        // a few pixels wide whatever the range, thinning toward the tips
        const w = l.w * Math.max(1, dist * 0.004) * (0.55 + 0.45 * (1 - i / n));
        sx = (sx / sl) * w; sy = (sy / sl) * w; sz = (sz / sl) * w;
        P.set([l.pts[o] - sx, l.pts[o + 1] - sy, l.pts[o + 2] - sz, l.pts[o] + sx, l.pts[o + 1] + sy, l.pts[o + 2] + sz], v * 3);
        const b = l.b * (l === lines[0] ? 1 : 1 - (i / n) * 0.7);
        R.set([-1, b, 1, b], v * 2);
        if (i < n - 1) {
          const a = base + i * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
        v += 2;
      }
    }
    this.geo.setIndex(idx);
    this.geo.setDrawRange(0, idx.length);
    this.attrPos.needsUpdate = true;
    this.attrRib.needsUpdate = true;
  }

  /** Jagged path by recursive midpoint displacement (2^depth segments). */
  private channel(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, depth: number, rough: number): number[] {
    let pts = [x0, y0, z0, x1, y1, z1];
    let amp = Math.hypot(x1 - x0, y1 - y0, z1 - z0) * 0.18;
    for (let d = 0; d < depth; d++) {
      const out: number[] = [];
      for (let i = 0; i < pts.length - 3; i += 3) {
        const ax = pts[i], ay = pts[i + 1], az = pts[i + 2];
        const bx = pts[i + 3], by = pts[i + 4], bz = pts[i + 5];
        out.push(ax, ay, az);
        out.push((ax + bx) / 2 + rand(-amp, amp), (ay + by) / 2 + rand(-amp, amp) * 0.25, (az + bz) / 2 + rand(-amp, amp));
      }
      out.push(pts[pts.length - 3], pts[pts.length - 2], pts[pts.length - 1]);
      pts = out;
      amp *= rough;
    }
    return pts;
  }

  setScene(depth: THREE.Texture, w: number, h: number, cam: THREE.PerspectiveCamera) {
    this.uniforms.uSceneDepth.value = depth;
    this.uniforms.uResolution.value.set(w, h);
    this.uniforms.uCamNearFar.value.set(cam.near, cam.far);
  }
}
