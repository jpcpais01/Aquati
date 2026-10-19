import * as THREE from 'three';
import { getSharedTextures } from '../render/textures';
import { globalUniforms } from '../render/environment';

// CPU-simulated, GPU-instanced billboard particles. Two pools: alpha
// (premultiplied: smoke, spray, splinters) and additive (fire, flashes,
// sparks). Soft-depth fade against the opaque scene keeps intersections clean.

interface P {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  s0: number; s1: number;
  r0: number; g0: number; b0: number;
  r1: number; g1: number; b1: number;
  a: number;
  drag: number;
  grav: number;
  rot: number; spin: number;
  kind: number; // 0 soft, 1 smoke, 2 spark/streak, 3 chunk
  fadeIn: number;
}

export interface Emit {
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  life: number;
  size: number;
  sizeEnd?: number;
  color: [number, number, number];
  colorEnd?: [number, number, number];
  alpha?: number;
  drag?: number;
  grav?: number;
  spin?: number;
  kind?: number;
  fadeIn?: number;
}

class Pool {
  readonly mesh: THREE.Mesh;
  private ps: P[] = [];
  private next = 0;
  private aPos: Float32Array;
  private aCol: Float32Array;
  private aMisc: Float32Array;
  private geo: THREE.InstancedBufferGeometry;
  private attrPos: THREE.InstancedBufferAttribute;
  private attrCol: THREE.InstancedBufferAttribute;
  private attrMisc: THREE.InstancedBufferAttribute;

  constructor(private cap: number, additive: boolean, uniforms: Record<string, THREE.IUniform>) {
    for (let i = 0; i < cap; i++) {
      this.ps.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 0, s0: 0, s1: 0, r0: 0, g0: 0, b0: 0, r1: 0, g1: 0, b1: 0, a: 0, drag: 0, grav: 0, rot: 0, spin: 0, kind: 0, fadeIn: 0 });
    }
    this.aPos = new Float32Array(cap * 3);
    this.aCol = new Float32Array(cap * 4);
    this.aMisc = new Float32Array(cap * 4);
    this.geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.attrPos = new THREE.InstancedBufferAttribute(this.aPos, 3).setUsage(THREE.DynamicDrawUsage);
    this.attrCol = new THREE.InstancedBufferAttribute(this.aCol, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrMisc = new THREE.InstancedBufferAttribute(this.aMisc, 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aPos', this.attrPos);
    this.geo.setAttribute('aCol', this.attrCol);
    this.geo.setAttribute('aMisc', this.attrMisc);
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      premultipliedAlpha: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      defines: { ADDITIVE: additive ? 1 : 0 },
      vertexShader: /* glsl */ `
        uniform vec3 uSunDir;
        attribute vec3 aPos; attribute vec4 aCol; attribute vec4 aMisc; // size, rot, kind + age, seed
        varying vec4 vCol; varying vec2 vUv; varying vec2 vUvV; varying float vKind; varying float vAge; varying float vSeed; varying float vViewZ;
        varying vec3 vSunV; varying vec3 vViewDir;
        void main() {
          vCol = aCol; vUv = position.xy * 2.0; vKind = floor(aMisc.z); vAge = fract(aMisc.z); vSeed = aMisc.w;
          vec4 mv = viewMatrix * vec4(aPos, 1.0);
          float c = cos(aMisc.y), s = sin(aMisc.y);
          vec2 q = position.xy * aMisc.x;
          vec2 qr = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
          vUvV = qr / max(aMisc.x, 1e-4) * 2.0; // billboard uv in view space, for the puff's fake normal
          mv.xy += qr;
          vViewZ = -mv.z;
          vViewDir = normalize(mv.xyz);
          vSunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uNoiseTex; uniform sampler2D uSceneDepth; uniform vec2 uResolution; uniform vec2 uCamNearFar;
        uniform vec3 uLight; uniform float uFlash; uniform vec3 uSunColor; uniform vec3 uHaze; uniform float uCloudCover;
        uniform vec3 uFogColor; uniform vec2 uFogRange; uniform float uMist; uniform float uRain; uniform float uTime;
        varying vec4 vCol; varying vec2 vUv; varying vec2 vUvV; varying float vKind; varying float vAge; varying float vSeed; varying float vViewZ;
        varying vec3 vSunV; varying vec3 vViewDir;
        float linearDepth(float d) { float n = uCamNearFar.x, f = uCamNearFar.y; return (n * f) / (f - d * (f - n)); }
        void main() {
          float r = length(vUv);
          if (r > 1.0) discard;
          float a;
          vec3 lit = uLight + uFlash * 0.8;
          if (vKind < 0.5) {
            a = pow(1.0 - r, 1.6);
          } else if (vKind < 1.5) {
            // volumetric puff: two noise octaves that slowly churn and erode as the smoke ages
            vec2 drift = vec2(uTime * 0.018, -uTime * 0.012);
            vec2 nuv = vUv * 0.22 + vec2(vSeed, vSeed * 1.7) + drift;
            float n1 = texture(uNoiseTex, nuv).g;
            float n2 = texture(uNoiseTex, nuv * 2.7 - drift * 2.0).a;
            float n = n1 * 0.68 + n2 * 0.32;
            float body = (1.0 - r * r) * (0.5 + n * 1.0) - 0.14 - vAge * 0.22;
            a = smoothstep(0.0, 0.5 - vAge * 0.18, body);
            // fake sphere normal, dented by the noise, lit by the sun or moon
            vec3 nrm = normalize(vec3(vUvV * 0.85 + (vec2(n1, n2) - 0.5) * 0.9, sqrt(max(1.0 - r * r, 0.0)) + 0.25));
            float wrap = clamp(dot(nrm, vSunV) * 0.6 + 0.4, 0.0, 1.0);
            float shade = 1.0 - (1.0 - wrap) * (0.55 - vAge * 0.25); // young dense smoke shows deeper shadow
            float open = 1.0 - uCloudCover * 0.65;
            vec3 sun = uSunColor * 0.16 * wrap * open;
            // silver lining: thin edges glow when you look toward the light
            float back = max(dot(-vViewDir, -vSunV), 0.0);
            float fwd = back * back; fwd *= fwd;
            vec3 rim = uSunColor * uHaze * (fwd * 0.55 * (1.0 - a * 0.7)) * open;
            float sky = 0.82 + nrm.y * 0.18; // brighter on top, from the sky dome
            lit = lit * (0.66 * shade * sky) + sun + rim;
          } else if (vKind < 2.5) {
            a = pow(max(1.0 - r, 0.0), 3.0) * 1.6;
          } else {
            a = 1.0 - smoothstep(0.55, 0.8, r);
          }
          vec2 suv = gl_FragCoord.xy / uResolution;
          float sz = linearDepth(texture(uSceneDepth, suv).r);
          a *= clamp((sz - vViewZ) * 0.6, 0.0, 1.0);
          a *= vCol.a;
          if (a < 0.003) discard;
          #if ADDITIVE
            gl_FragColor = vec4(vCol.rgb * a, 0.0);
          #else
            // smoke and spray are lit by the sky: warm at sunset, dim blue at night, sunk into mist and rain haze
            vec3 col = vCol.rgb * lit;
            float fog = max(smoothstep(uFogRange.x, uFogRange.y, vViewZ) * 0.85, (1.0 - exp(-vViewZ * 0.0045)) * (uMist * 0.7 + uRain * 0.15));
            col = mix(col, uFogColor, fog);
            gl_FragColor = vec4(col * a, a);
          #endif
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 20 : 10;
  }

  spawn(e: Emit) {
    const p = this.ps[this.next];
    this.next = (this.next + 1) % this.cap;
    p.x = e.x; p.y = e.y; p.z = e.z;
    p.vx = e.vx ?? 0; p.vy = e.vy ?? 0; p.vz = e.vz ?? 0;
    p.life = 0; p.max = e.life;
    p.s0 = e.size; p.s1 = e.sizeEnd ?? e.size;
    p.r0 = e.color[0]; p.g0 = e.color[1]; p.b0 = e.color[2];
    const ce = e.colorEnd ?? e.color;
    p.r1 = ce[0]; p.g1 = ce[1]; p.b1 = ce[2];
    p.a = e.alpha ?? 1;
    p.drag = e.drag ?? 0;
    p.grav = e.grav ?? 0;
    p.rot = Math.random() * Math.PI * 2;
    p.spin = e.spin ?? 0;
    p.kind = e.kind ?? 0;
    p.fadeIn = e.fadeIn ?? 0.08;
  }

  update(dt: number) {
    let n = 0;
    const w = globalUniforms.uWind.value;
    const windSpeed = 1.2 + w.z * 4.5;
    const windX = w.x * windSpeed, windZ = w.y * windSpeed, windDt = dt;
    const P = this.aPos;
    const Cc = this.aCol;
    const M = this.aMisc;
    for (let i = 0; i < this.cap; i++) {
      const p = this.ps[i];
      if (p.life >= p.max) continue;
      p.life += dt;
      if (p.life >= p.max) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k; p.vz *= k;
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.kind === 1) {
        // smoke rides the breeze once its own push dies down, with a lazy curl
        const ride = Math.min(1, p.life * 1.5) * windDt;
        const ph = p.rot * 3.1 + p.life * 0.9;
        p.x += windX * ride + Math.sin(ph) * 0.25 * dt;
        p.z += windZ * ride + Math.cos(ph * 1.3) * 0.25 * dt;
      }
      p.rot += p.spin * dt;
      const t = p.life / p.max;
      const fin = Math.min(1, p.life / Math.max(p.fadeIn, 1e-3));
      const fout = 1 - t * t;
      P[n * 3] = p.x; P[n * 3 + 1] = p.y; P[n * 3 + 2] = p.z;
      Cc[n * 4] = p.r0 + (p.r1 - p.r0) * t;
      Cc[n * 4 + 1] = p.g0 + (p.g1 - p.g0) * t;
      Cc[n * 4 + 2] = p.b0 + (p.b1 - p.b0) * t;
      Cc[n * 4 + 3] = p.a * fin * fout;
      M[n * 4] = p.s0 + (p.s1 - p.s0) * Math.sqrt(t);
      M[n * 4 + 1] = p.rot;
      M[n * 4 + 2] = p.kind + t * 0.99;
      M[n * 4 + 3] = (i * 0.618) % 1;
      n++;
    }
    this.geo.instanceCount = n;
    if (n > 0) {
      this.attrPos.clearUpdateRanges();
      this.attrPos.addUpdateRange(0, n * 3);
      this.attrPos.needsUpdate = true;
      this.attrCol.clearUpdateRanges();
      this.attrCol.addUpdateRange(0, n * 4);
      this.attrCol.needsUpdate = true;
      this.attrMisc.clearUpdateRanges();
      this.attrMisc.addUpdateRange(0, n * 4);
      this.attrMisc.needsUpdate = true;
    }
  }
}


/**
 * Cannonball streaks: one camera-facing ribbon per ball in flight, stretched
 * back along its velocity. A pale air-wake with a hot core near the ball, so a
 * shot reads at a glance by day and glows faintly at night. One draw call.
 */
class Streaks {
  readonly mesh: THREE.Mesh;
  private n = 0;
  private aHead: Float32Array;
  private aTail: Float32Array;
  private geo: THREE.InstancedBufferGeometry;
  private attrHead: THREE.InstancedBufferAttribute;
  private attrTail: THREE.InstancedBufferAttribute;

  constructor(private cap: number, uniforms: Record<string, THREE.IUniform>) {
    this.aHead = new Float32Array(cap * 4);
    this.aTail = new Float32Array(cap * 4);
    this.geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.attrHead = new THREE.InstancedBufferAttribute(this.aHead, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrTail = new THREE.InstancedBufferAttribute(this.aTail, 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aHead', this.attrHead); // xyz, width
    this.geo.setAttribute('aTail', this.attrTail); // xyz, strength
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      premultipliedAlpha: true,
      blending: THREE.NormalBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aHead; attribute vec4 aTail;
        varying vec2 vUv; varying float vStr; varying float vViewZ;
        void main() {
          float along = position.x + 0.5; // 0 tail .. 1 head
          vec3 w = mix(aTail.xyz, aHead.xyz, along);
          vec3 axis = aHead.xyz - aTail.xyz;
          vec3 side = cross(axis, cameraPosition - w);
          float sl = length(side);
          side = sl > 1e-5 ? side / sl : vec3(1.0, 0.0, 0.0);
          // thicker toward the ball, a hair past it so the head is rounded
          w += side * position.y * aHead.w * (0.45 + 0.55 * along);
          w += normalize(axis + vec3(1e-5)) * aHead.w * 0.5 * step(0.99, along);
          vUv = vec2(along, position.y * 2.0);
          vStr = aTail.w;
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vViewZ = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uLight; uniform float uFlash; uniform float uNight; uniform vec3 uFogColor; uniform vec2 uFogRange;
        varying vec2 vUv; varying float vStr; varying float vViewZ;
        void main() {
          float across = 1.0 - vUv.y * vUv.y;
          float t = vUv.x;
          float a = across * t * t * (0.38 + 0.25 * t) * vStr;
          if (a < 0.003) discard;
          // hot core right behind the ball, fading into a pale wake
          float core = pow(max(across, 0.0), 6.0) * smoothstep(0.55, 1.0, t);
          vec3 wake = vec3(0.98, 0.97, 0.95) * (uLight + uFlash * 0.8);
          vec3 glow = vec3(3.2, 1.5, 0.45) * core * (0.25 + uNight * 0.9) * vStr;
          float fog = smoothstep(uFogRange.x, uFogRange.y, vViewZ) * 0.85;
          vec3 col = mix(wake * a, uFogColor * a, fog) + glow * (1.0 - fog);
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 15;
  }

  begin() { this.n = 0; }

  /** A ball at `pos` moving at `vel`, `age` seconds after it left the barrel. */
  add(pos: THREE.Vector3, vel: THREE.Vector3, age: number) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    // grows out of the muzzle, then a fixed slice of the flight path
    const len = Math.min(age, 0.075);
    const H = this.aHead, T = this.aTail;
    H[i * 4] = pos.x; H[i * 4 + 1] = pos.y; H[i * 4 + 2] = pos.z; H[i * 4 + 3] = 0.42;
    T[i * 4] = pos.x - vel.x * len; T[i * 4 + 1] = pos.y - vel.y * len; T[i * 4 + 2] = pos.z - vel.z * len;
    T[i * 4 + 3] = Math.max(0.35, 1 - age * 0.18); // fades as the shot slows and drops
  }

  end() {
    const n = this.n;
    this.geo.instanceCount = n;
    if (n === 0) return;
    this.attrHead.clearUpdateRanges();
    this.attrHead.addUpdateRange(0, n * 4);
    this.attrHead.needsUpdate = true;
    this.attrTail.clearUpdateRanges();
    this.attrTail.addUpdateRange(0, n * 4);
    this.attrTail.needsUpdate = true;
  }
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Particles {
  readonly group = new THREE.Group();
  private alpha: Pool;
  private add: Pool;
  readonly streaks: Streaks;
  readonly uniforms = {
    uNoiseTex: { value: getSharedTextures().noise as THREE.Texture },
    uSceneDepth: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCamNearFar: { value: new THREE.Vector2(1, 1000) },
    uLight: globalUniforms.uLight,
    uFlash: globalUniforms.uFlash,
    uSunDir: globalUniforms.uSunDir,
    uSunColor: globalUniforms.uSunColor,
    uHaze: globalUniforms.uHaze,
    uCloudCover: globalUniforms.uCloudCover,
    uFogColor: globalUniforms.uFogColor,
    uFogRange: globalUniforms.uFogRange,
    uMist: globalUniforms.uMist,
    uRain: globalUniforms.uRain,
    uTime: globalUniforms.uTime,
    uNight: globalUniforms.uNight,
  };

  constructor(scale = 1) {
    this.alpha = new Pool(Math.floor(2600 * scale), false, this.uniforms);
    this.add = new Pool(Math.floor(1400 * scale), true, this.uniforms);
    this.streaks = new Streaks(256, this.uniforms);
    this.group.add(this.alpha.mesh, this.streaks.mesh, this.add.mesh);
  }

  update(dt: number) {
    this.alpha.update(dt);
    this.add.update(dt);
  }

  emit(e: Emit, additive = false) {
    (additive ? this.add : this.alpha).spawn(e);
  }

  // ------------------------------------------------------------- recipes

  muzzle(pos: THREE.Vector3, dir: THREE.Vector3, carry: THREE.Vector3) {
    // flash core
    this.emit({ x: pos.x, y: pos.y, z: pos.z, life: 0.12, size: 2.6, sizeEnd: 4.2, color: [9, 6, 2.6], colorEnd: [4, 1.4, 0.3], kind: 0, fadeIn: 0.001 }, true);
    for (let i = 0; i < 5; i++) {
      const sp = rand(10, 22);
      this.emit({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * sp + rand(-2, 2) + carry.x, vy: dir.y * sp + rand(-1, 2), vz: dir.z * sp + rand(-2, 2) + carry.z,
        life: rand(0.1, 0.22), size: rand(0.8, 1.6), sizeEnd: 0.3, color: [6, 3.2, 1.0], colorEnd: [2, 0.5, 0.1], drag: 6, kind: 0, fadeIn: 0.001,
      }, true);
    }
    // billowing smoke: a fast dense jet that rolls out along the barrel...
    const rain = globalUniforms.uRain.value;
    const thin = 1 - rain * 0.3; // rain knocks the smoke down sooner
    for (let i = 0; i < 8; i++) {
      const sp = rand(5, 16);
      const g = rand(0.74, 0.9);
      this.emit({
        x: pos.x + dir.x * 0.6, y: pos.y, z: pos.z + dir.z * 0.6,
        vx: dir.x * sp + rand(-1.4, 1.4) + carry.x * 0.6, vy: rand(0.1, 1.4), vz: dir.z * sp + rand(-1.4, 1.4) + carry.z * 0.6,
        life: rand(2.4, 4.0) * thin, size: rand(1.0, 1.7), sizeEnd: rand(5.5, 8.5), color: [g * 1.1, g * 1.08, g * 1.05], colorEnd: [g * 1.02, g * 1.02, g * 1.04],
        alpha: rand(0.5, 0.72), drag: 2.0, grav: -0.3, spin: rand(-0.35, 0.35), kind: 1, fadeIn: 0.04,
      });
    }
    // ...a slow bank that hangs by the gunport and spreads wide on the breeze...
    for (let i = 0; i < 4; i++) {
      const sp = rand(1.5, 4);
      const g = rand(0.82, 0.95);
      this.emit({
        x: pos.x + dir.x * 1.2 + rand(-0.6, 0.6), y: pos.y + rand(-0.2, 0.5), z: pos.z + dir.z * 1.2 + rand(-0.6, 0.6),
        vx: dir.x * sp + carry.x * 0.8, vy: rand(0.3, 0.9), vz: dir.z * sp + carry.z * 0.8,
        life: rand(4.5, 6.5) * thin, size: rand(2.2, 3.2), sizeEnd: rand(9, 13), color: [g, g, g * 1.02], colorEnd: [g * 1.04, g * 1.04, g * 1.07],
        alpha: rand(0.28, 0.4), drag: 1.2, grav: -0.18, spin: rand(-0.15, 0.15), kind: 1, fadeIn: 0.25,
      });
    }
    // ...and dark powder wisps flung out of the flash
    for (let i = 0; i < 3; i++) {
      const sp = rand(14, 24);
      this.emit({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * sp + rand(-3, 3) + carry.x, vy: rand(-0.5, 2), vz: dir.z * sp + rand(-3, 3) + carry.z,
        life: rand(0.9, 1.5), size: rand(0.5, 0.8), sizeEnd: rand(2.5, 3.5), color: [0.36, 0.33, 0.3], colorEnd: [0.7, 0.68, 0.66],
        alpha: rand(0.5, 0.7), drag: 4.5, grav: -0.2, spin: rand(-1, 1), kind: 1, fadeIn: 0.01,
      });
    }
  }

  splash(pos: THREE.Vector3, scale = 1) {
    for (let i = 0; i < 22 * scale; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rand(0.5, 3.2);
      this.emit({
        x: pos.x + Math.cos(a) * 0.3, y: pos.y + 0.1, z: pos.z + Math.sin(a) * 0.3,
        vx: Math.cos(a) * r, vy: rand(7, 15) * scale, vz: Math.sin(a) * r,
        life: rand(0.8, 1.4), size: rand(0.35, 0.8), sizeEnd: 0.25, color: [1.3, 1.4, 1.45], alpha: 0.95, grav: 16, drag: 0.6, kind: 0, fadeIn: 0.01,
      });
    }
    // central column + mist
    for (let i = 0; i < 4; i++) {
      this.emit({
        x: pos.x, y: pos.y + 0.3 + i * 0.6, z: pos.z, vy: rand(4, 9) * scale,
        life: rand(0.7, 1.0), size: 1.0 * scale, sizeEnd: 2.4 * scale, color: [1.3, 1.38, 1.42], alpha: 0.7, grav: 9, drag: 1.2, kind: 1,
      });
    }
    for (let i = 0; i < 5; i++) {
      this.emit({
        x: pos.x + rand(-1, 1), y: pos.y + 0.4, z: pos.z + rand(-1, 1), vx: rand(-1, 1), vy: rand(0.5, 1.5), vz: rand(-1, 1),
        life: rand(1.4, 2.4), size: 1.4 * scale, sizeEnd: 4.5 * scale, color: [1.2, 1.28, 1.32], alpha: 0.35, drag: 1.5, kind: 1,
      });
    }
  }

  woodHit(pos: THREE.Vector3, normal: THREE.Vector3) {
    this.emit({ x: pos.x, y: pos.y, z: pos.z, life: 0.16, size: 3.2, sizeEnd: 4.5, color: [8, 4.5, 1.6], colorEnd: [3, 0.8, 0.2], fadeIn: 0.001 }, true);
    for (let i = 0; i < 16; i++) {
      const sp = rand(4, 13);
      const br = rand(0.55, 0.9);
      this.emit({
        x: pos.x, y: pos.y, z: pos.z,
        vx: normal.x * sp + rand(-4, 4), vy: rand(3, 11), vz: normal.z * sp + rand(-4, 4),
        life: rand(0.9, 1.7), size: rand(0.18, 0.42), color: [0.55 * br, 0.36 * br, 0.2 * br], grav: 18, drag: 0.4, spin: rand(-14, 14), kind: 3, fadeIn: 0.001,
      });
    }
    for (let i = 0; i < 7; i++) {
      this.emit({
        x: pos.x, y: pos.y, z: pos.z, vx: normal.x * rand(1, 4) + rand(-1, 1), vy: rand(0.5, 2.5), vz: normal.z * rand(1, 4) + rand(-1, 1),
        life: rand(1.5, 2.6), size: 1.2, sizeEnd: rand(4, 6), color: [0.42, 0.4, 0.38], colorEnd: [0.62, 0.6, 0.58], alpha: 0.6, drag: 1.3, grav: -0.6, kind: 1,
      });
    }
    for (let i = 0; i < 8; i++) {
      this.emit({
        x: pos.x, y: pos.y, z: pos.z, vx: rand(-9, 9), vy: rand(2, 10), vz: rand(-9, 9),
        life: rand(0.3, 0.7), size: rand(0.12, 0.25), color: [8, 4, 1.2], colorEnd: [3, 0.6, 0.1], grav: 14, kind: 2, fadeIn: 0.001,
      }, true);
    }
  }

  sandHit(pos: THREE.Vector3) {
    for (let i = 0; i < 10; i++) {
      this.emit({
        x: pos.x, y: pos.y, z: pos.z, vx: rand(-4, 4), vy: rand(2, 8), vz: rand(-4, 4),
        life: rand(1, 2), size: 1, sizeEnd: rand(3, 5), color: [1.0, 0.9, 0.7], alpha: 0.55, drag: 1.6, grav: 2, kind: 1,
      });
    }
  }

  flame(pos: THREE.Vector3, intensity = 1) {
    this.emit({
      x: pos.x + rand(-0.5, 0.5), y: pos.y + rand(0, 0.4), z: pos.z + rand(-0.5, 0.5), vx: rand(-0.4, 0.4), vy: rand(2, 4.5), vz: rand(-0.4, 0.4),
      life: rand(0.45, 0.8), size: rand(0.9, 1.6) * intensity, sizeEnd: 0.3, color: [7, 3.2, 0.8], colorEnd: [3, 0.5, 0.08], spin: rand(-2, 2), kind: 0, fadeIn: 0.05,
    }, true);
    if (Math.random() < 0.55) {
      this.emit({
        x: pos.x + rand(-0.4, 0.4), y: pos.y + 1.2, z: pos.z + rand(-0.4, 0.4), vx: rand(-0.3, 0.3), vy: rand(2.5, 4.5), vz: rand(-0.3, 0.3),
        life: rand(2.5, 4.5), size: 1.3 * intensity, sizeEnd: rand(5, 8) * intensity, color: [0.22, 0.2, 0.19], colorEnd: [0.45, 0.44, 0.43], alpha: 0.55, drag: 0.35, grav: -0.3, spin: rand(-0.5, 0.5), kind: 1, fadeIn: 0.2,
      });
    }
  }

  explosion(pos: THREE.Vector3, scale = 1) {
    this.emit({ x: pos.x, y: pos.y + 1, z: pos.z, life: 0.35, size: 9 * scale, sizeEnd: 16 * scale, color: [12, 6, 2], colorEnd: [3, 0.8, 0.15], fadeIn: 0.001 }, true);
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(3, 12) * scale;
      this.emit({
        x: pos.x, y: pos.y + 1, z: pos.z, vx: Math.cos(a) * sp, vy: rand(3, 14) * scale, vz: Math.sin(a) * sp,
        life: rand(0.5, 1.1), size: rand(1.4, 2.8) * scale, sizeEnd: 0.5, color: [8, 3.4, 0.9], colorEnd: [2.2, 0.4, 0.05], drag: 2.2, grav: 3, kind: 0, fadeIn: 0.001,
      }, true);
    }
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(5, 18) * scale;
      const br = rand(0.4, 0.8);
      this.emit({
        x: pos.x, y: pos.y + 1, z: pos.z, vx: Math.cos(a) * sp, vy: rand(6, 20), vz: Math.sin(a) * sp,
        life: rand(1.2, 2.4), size: rand(0.3, 0.8), color: [0.5 * br, 0.34 * br, 0.2 * br], grav: 18, drag: 0.3, spin: rand(-12, 12), kind: 3, fadeIn: 0.001,
      });
    }
    for (let i = 0; i < 16; i++) {
      this.emit({
        x: pos.x + rand(-2, 2), y: pos.y + rand(1, 3), z: pos.z + rand(-2, 2), vx: rand(-2, 2), vy: rand(1.5, 5), vz: rand(-2, 2),
        life: rand(3, 6), size: 3 * scale, sizeEnd: rand(10, 16) * scale, color: [0.2, 0.19, 0.18], colorEnd: [0.5, 0.49, 0.48], alpha: 0.6, drag: 0.8, grav: -0.4, spin: rand(-0.3, 0.3), kind: 1, fadeIn: 0.1,
      });
    }
  }

  /** Thin powder wake left hanging where a ball has passed; it curls away on the wind. */
  trail(pos: THREE.Vector3, young: number) {
    this.emit({
      x: pos.x + rand(-0.08, 0.08), y: pos.y + rand(-0.08, 0.08), z: pos.z + rand(-0.08, 0.08), vy: 0.25,
      life: rand(1.1, 1.6), size: 0.3, sizeEnd: rand(1.4, 2.0), color: [0.95, 0.94, 0.93], alpha: 0.16 + young * 0.18, drag: 1, spin: rand(-0.5, 0.5), kind: 1, fadeIn: 0.05,
    });
  }

  sparkle(pos: THREE.Vector3, tint?: [number, number, number], scale = 1) {
    const c: [number, number, number] = tint ? [tint[0] * 2.2, tint[1] * 2.2, tint[2] * 2.2] : [6, 4.6, 1.6];
    this.emit({ x: pos.x + rand(-0.8, 0.8) * scale, y: pos.y + rand(0.2, 1.4) * scale, z: pos.z + rand(-0.8, 0.8) * scale, vy: 0.8 * scale, life: rand(0.5, 0.9), size: rand(0.3, 0.6) * scale, sizeEnd: 0.05, color: c, kind: 2, fadeIn: 0.1 }, true);
  }

  /** Treasure pickup: a flash, a fountain of coins and a ring of rarity-coloured sparks. */
  treasure(pos: THREE.Vector3, tint: [number, number, number], tier: number) {
    const big = 0.6 + tier * 0.35;
    const t = (k: number): [number, number, number] => [tint[0] * k, tint[1] * k, tint[2] * k];
    this.emit({ x: pos.x, y: pos.y + 0.8, z: pos.z, life: 0.35 + tier * 0.08, size: 2 * big, sizeEnd: 6 * big, color: t(2.4), colorEnd: t(0.4), kind: 0, fadeIn: 0.001 }, true);
    // gold coins tumbling up and back down
    for (let i = 0; i < 8 + tier * 8; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(1, 3.5) * big;
      this.emit({
        x: pos.x, y: pos.y + 0.6, z: pos.z, vx: Math.cos(a) * r, vy: rand(6, 11) * Math.sqrt(big), vz: Math.sin(a) * r,
        life: rand(0.8, 1.3), size: rand(0.16, 0.26), color: [5.5, 3.8, 1.1], colorEnd: [3, 1.6, 0.3], grav: 16, drag: 0.4, spin: rand(-14, 14), kind: 3, fadeIn: 0.001,
      }, true);
    }
    // ring of rarity sparks racing outward across the water
    const ring = 10 + tier * 8;
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2 + rand(-0.1, 0.1), sp = rand(5, 8) * big;
      this.emit({
        x: pos.x, y: pos.y + 0.4, z: pos.z, vx: Math.cos(a) * sp, vy: rand(0.5, 2), vz: Math.sin(a) * sp,
        life: rand(0.5, 0.8), size: rand(0.25, 0.45), sizeEnd: 0.05, color: t(3), colorEnd: t(0.8), drag: 2.4, kind: 2, fadeIn: 0.001,
      }, true);
    }
    // epic and legendary: a pillar of motes spiralling up to the sky
    if (tier >= 3) {
      for (let i = 0; i < tier * 10; i++) {
        const a = i * 0.7, r = rand(0.4, 1.4);
        this.emit({
          x: pos.x + Math.cos(a) * r, y: pos.y + rand(0, 2), z: pos.z + Math.sin(a) * r, vx: -Math.sin(a) * 1.5, vy: rand(5, 12), vz: Math.cos(a) * 1.5,
          life: rand(0.9, 1.6), size: rand(0.25, 0.5), sizeEnd: 0.05, color: t(2.6), colorEnd: [1.5, 1.2, 0.5], drag: 0.6, kind: 2, fadeIn: 0.02,
        }, true);
      }
    }
  }

  setScene(depth: THREE.Texture, w: number, h: number, cam: THREE.PerspectiveCamera) {
    this.uniforms.uSceneDepth.value = depth;
    this.uniforms.uResolution.value.set(w, h);
    this.uniforms.uCamNearFar.value.set(cam.near, cam.far);
  }
}
