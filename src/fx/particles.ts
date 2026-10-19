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
  kind: number; // 0 soft, 1 smoke, 2 spark/streak, 3 chunk, 4 air bubble
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
  private aVel: Float32Array;
  private geo: THREE.InstancedBufferGeometry;
  private attrPos: THREE.InstancedBufferAttribute;
  private attrCol: THREE.InstancedBufferAttribute;
  private attrMisc: THREE.InstancedBufferAttribute;
  private attrVel: THREE.InstancedBufferAttribute;

  constructor(private cap: number, additive: boolean, uniforms: Record<string, THREE.IUniform>) {
    for (let i = 0; i < cap; i++) {
      this.ps.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 0, s0: 0, s1: 0, r0: 0, g0: 0, b0: 0, r1: 0, g1: 0, b1: 0, a: 0, drag: 0, grav: 0, rot: 0, spin: 0, kind: 0, fadeIn: 0 });
    }
    this.aPos = new Float32Array(cap * 3);
    this.aCol = new Float32Array(cap * 4);
    this.aMisc = new Float32Array(cap * 4);
    this.aVel = new Float32Array(cap * 3);
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
    this.attrVel = new THREE.InstancedBufferAttribute(this.aVel, 3).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aVel', this.attrVel);
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
        attribute vec3 aVel; // world velocity incl. the breeze (smoke only)
        varying vec4 vCol; varying vec2 vUv; varying vec2 vUvV; varying vec2 vNuv; varying float vKind; varying float vAge; varying float vSeed; varying float vViewZ;
        varying vec3 vSunV; varying vec3 vViewDir;
        void main() {
          vCol = aCol; vUv = position.xy * 2.0; vKind = floor(aMisc.z); vAge = fract(aMisc.z); vSeed = aMisc.w;
          vec4 mv = viewMatrix * vec4(aPos, 1.0);
          float c = cos(aMisc.y), s = sin(aMisc.y);
          vec2 q = position.xy * aMisc.x;
          vec2 qr;
          if (vKind > 0.5 && vKind < 1.5) {
            // smoke shears out along its motion on screen: the jet streams, the drift smears downwind
            vec2 v2 = (viewMatrix * vec4(aVel, 0.0)).xy;
            float sp = length(v2);
            vec2 ax = sp > 1e-3 ? v2 / sp : vec2(1.0, 0.0);
            float st = 1.0 + min(sp * 0.16, 1.5);
            vec2 sq = vec2(q.x * st, q.y / sqrt(st));
            qr = ax * sq.x + vec2(-ax.y, ax.x) * sq.y;
            // the noise pattern spins on its own and is dragged along the flow, so wisps peel off downstream
            vec2 u = position.xy * 2.0;
            vNuv = vec2(c * u.x - s * u.y, s * u.x + c * u.y) * vec2(1.0, 1.0 + (st - 1.0) * 0.6) - vec2(vAge * 0.35 * st, 0.0);
          } else {
            qr = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
            vNuv = position.xy * 2.0;
          }
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
        uniform vec4 uUnder; uniform vec3 uUnderColor;
        varying vec4 vCol; varying vec2 vUv; varying vec2 vUvV; varying vec2 vNuv; varying float vKind; varying float vAge; varying float vSeed; varying float vViewZ;
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
            // real smoke, not a ball: domain-warped fbm eroded by age into torn wisps and filaments.
            // Young smoke is dense and billowy (worley cauliflower), old smoke thins into curling strands.
            vec2 drift = vec2(uTime * 0.021, -uTime * 0.014);
            vec2 base = vNuv * 0.2 + vec2(vSeed * 3.1, vSeed * 5.3);
            vec2 warp = texture(uNoiseTex, base * 0.6 + drift).rg - 0.5;
            vec2 wuv = base + warp * (0.28 + vAge * 0.35);
            float n1 = texture(uNoiseTex, wuv).g;
            float n2 = texture(uNoiseTex, wuv * 2.4 - drift * 1.7).a;
            float cell = 1.0 - texture(uNoiseTex, wuv * 1.3 + drift).b;
            float fbm = n1 * 0.6 + n2 * 0.4;
            float billow = mix(cell * 0.55 + fbm * 0.45, fbm, smoothstep(0.0, 0.45, vAge));
            billow = clamp((billow - 0.5) * 2.4 + 0.5, 0.0, 1.0); // the baked fbm hugs 0.5: stretch its contrast
            float ridge = clamp(1.0 - abs(n2 - 0.5) * 5.0, 0.0, 1.0);
            float fall = 1.0 - smoothstep(0.1, 1.0, r);
            float dens = billow * fall * 2.3 - (0.32 + vAge * 0.38);
            a = smoothstep(0.0, 0.3 + (1.0 - vAge) * 0.25, dens);
            a *= mix(1.0, 0.35 + ridge * 0.9, vAge * 0.8); // ageing smoke frays into strands
            float thick = clamp(dens * 2.2, 0.0, 1.0);
            // soft normal from the noise relief (a little of the dome so it still turns to the light)
            vec3 nrm = normalize(vec3(vUvV * 0.35 + (vec2(n1, cell) - 0.5) * 1.6, 0.75));
            float wrap = clamp(dot(nrm, vSunV) * 0.55 + 0.45, 0.0, 1.0);
            float shade = 1.0 - (1.0 - wrap) * (0.5 - vAge * 0.25);
            shade *= 1.0 - thick * (0.3 - vAge * 0.2); // dense cores absorb light
            float open = 1.0 - uCloudCover * 0.65;
            vec3 sun = uSunColor * 0.15 * wrap * open;
            // silver lining: thin edges glow when you look toward the light
            float back = max(dot(-vViewDir, -vSunV), 0.0);
            float fwd = back * back; fwd *= fwd;
            vec3 rim = uSunColor * uHaze * (fwd * 0.6 * (1.0 - thick * 0.8)) * open;
            float sky = 0.84 + nrm.y * 0.16; // brighter on top, from the sky dome
            lit = lit * (0.68 * shade * sky) + sun + rim;
          } else if (vKind < 2.5) {
            a = pow(max(1.0 - r, 0.0), 3.0) * 1.6;
          } else if (vKind > 3.5) {
            // an air bubble: a bright silvery rim, a clear middle and a glint up top
            a = smoothstep(0.62, 0.86, r) * (1.0 - smoothstep(0.88, 1.0, r)) + 0.12;
            a += smoothstep(0.32, 0.0, length(vUv - vec2(-0.32, 0.36))) * 0.9;
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
            if (uUnder.x > 0.5) col = mix(col * vec3(0.55, 0.9, 1.0), uUnderColor, 1.0 - exp(-vViewZ / uUnder.z));
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
    const V = this.aVel;
    for (let i = 0; i < this.cap; i++) {
      const p = this.ps[i];
      if (p.life >= p.max) continue;
      p.life += dt;
      if (p.life >= p.max) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k; p.vz *= k;
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      let ex = p.vx, ey = p.vy, ez = p.vz;
      if (p.kind === 1) {
        // smoke rides the breeze once its own push dies down, with a lazy curl
        const rideK = Math.min(1, p.life * 1.5);
        const ride = rideK * windDt;
        const ph = p.rot * 3.1 + p.life * 0.9;
        p.x += windX * ride + Math.sin(ph) * 0.25 * dt;
        p.z += windZ * ride + Math.cos(ph * 1.3) * 0.25 * dt;
        ex += windX * rideK; ez += windZ * rideK;
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
      V[n * 3] = ex; V[n * 3 + 1] = ey; V[n * 3 + 2] = ez;
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
      this.attrVel.clearUpdateRanges();
      this.attrVel.addUpdateRange(0, n * 3);
      this.attrVel.needsUpdate = true;
    }
  }
}


/** Streak look per shot trail: tint rgb, mode (0 powder, 1 glow, 2 rainbow), length (s of flight), width (m). */
const STREAKS: Record<string, [number, number, number, number, number, number]> = {
  powder: [0, 0, 0, 0, 0.075, 0.42],
  spray: [0, 0, 0, 0, 0.075, 0.42],
  soot: [0, 0, 0, 0, 0.075, 0.42],
  ember: [2.6, 1.0, 0.25, 1, 0.1, 0.44],
  frost: [0.9, 1.8, 2.6, 1, 0.12, 0.44],
  comet: [3.0, 2.0, 0.6, 1, 0.17, 0.62],
  ghost: [0.6, 2.6, 1.4, 1, 0.13, 0.5],
  rainbow: [1, 1, 1, 2, 0.2, 0.58],
  starfall: [2.2, 2.0, 3.2, 1, 0.16, 0.5],
  // shot types
  fuse: [2.4, 1.3, 0.45, 1, 0.09, 0.36],
  fire: [3.4, 1.3, 0.32, 1, 0.22, 0.7],
  chain: [0, 0, 0, 0, 0.05, 0.62],
  grape: [0, 0, 0, 0, 0.045, 0.13],
  // the chain itself, slung between two half-balls: solid iron, no glow
  link: [0.045, 0.045, 0.05, 3, 0, 0.07],
};

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
  private aStyle: Float32Array;
  private geo: THREE.InstancedBufferGeometry;
  private attrHead: THREE.InstancedBufferAttribute;
  private attrTail: THREE.InstancedBufferAttribute;
  private attrStyle: THREE.InstancedBufferAttribute;

  constructor(private cap: number, uniforms: Record<string, THREE.IUniform>) {
    this.aHead = new Float32Array(cap * 4);
    this.aTail = new Float32Array(cap * 4);
    this.aStyle = new Float32Array(cap * 4);
    this.geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.attrHead = new THREE.InstancedBufferAttribute(this.aHead, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrTail = new THREE.InstancedBufferAttribute(this.aTail, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrStyle = new THREE.InstancedBufferAttribute(this.aStyle, 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aHead', this.attrHead); // xyz, width
    this.geo.setAttribute('aTail', this.attrTail); // xyz, strength
    this.geo.setAttribute('aStyle', this.attrStyle); // tint rgb, mode (0 powder, 1 tinted glow, 2 rainbow)
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      premultipliedAlpha: true,
      blending: THREE.NormalBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aHead; attribute vec4 aTail; attribute vec4 aStyle;
        varying vec2 vUv; varying float vStr; varying float vViewZ; varying vec4 vStyle;
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
          vStyle = aStyle;
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vViewZ = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uLight; uniform float uFlash; uniform float uNight; uniform vec3 uFogColor; uniform vec2 uFogRange; uniform float uTime;
        varying vec2 vUv; varying float vStr; varying float vViewZ; varying vec4 vStyle;
        void main() {
          float across = 1.0 - vUv.y * vUv.y;
          float t = vUv.x;
          float fog = smoothstep(uFogRange.x, uFogRange.y, vViewZ) * 0.85;
          if (vStyle.w > 2.5) {
            // solid iron (chain shot's chain): an opaque, softly edged strip
            float a = smoothstep(1.0, 0.55, abs(vUv.y)) * vStr;
            if (a < 0.01) discard;
            vec3 col = mix(vStyle.rgb * (uLight + uFlash * 0.8) * (0.7 + 0.6 * across), uFogColor, fog);
            gl_FragColor = vec4(col * a, a);
          } else if (vStyle.w < 0.5) {
            float a = across * t * t * (0.38 + 0.25 * t) * vStr;
            if (a < 0.003) discard;
            // hot core right behind the ball, fading into a pale wake
            float core = pow(max(across, 0.0), 6.0) * smoothstep(0.55, 1.0, t);
            vec3 wake = vec3(0.98, 0.97, 0.95) * (uLight + uFlash * 0.8);
            vec3 glow = vec3(3.2, 1.5, 0.45) * core * (0.25 + uNight * 0.9) * vStr;
            vec3 col = mix(wake * a, uFogColor * a, fog) + glow * (1.0 - fog);
            gl_FragColor = vec4(col, a);
          } else {
            // vault trails: a coloured glowing ribbon (or every colour at once)
            float a = across * pow(t, 1.4) * vStr;
            if (a < 0.003) discard;
            vec3 tint = vStyle.rgb;
            if (vStyle.w > 1.5) tint = clamp(abs(fract(t * 1.4 - uTime * 1.6 + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0) * 2.6 + 0.2;
            float core = pow(max(across, 0.0), 5.0) * smoothstep(0.35, 1.0, t);
            vec3 col = tint * (a * 0.6 + core * 1.7) * (1.0 + uNight * 0.6) * (1.0 - fog);
            gl_FragColor = vec4(col, a * 0.32);
          }
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 15;
  }

  begin() { this.n = 0; }

  /** A fixed segment from `tail` to `head` (the chain between chain-shot halves). */
  addSeg(head: THREE.Vector3, tail: THREE.Vector3, style: string, strength = 1) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    const st = STREAKS[style] ?? STREAKS.powder;
    const H = this.aHead, T = this.aTail, S = this.aStyle;
    H[i * 4] = head.x; H[i * 4 + 1] = head.y; H[i * 4 + 2] = head.z; H[i * 4 + 3] = st[5];
    T[i * 4] = tail.x; T[i * 4 + 1] = tail.y; T[i * 4 + 2] = tail.z; T[i * 4 + 3] = strength;
    S[i * 4] = st[0]; S[i * 4 + 1] = st[1]; S[i * 4 + 2] = st[2]; S[i * 4 + 3] = st[3];
  }

  /** A ball at `pos` moving at `vel`, `age` seconds after it left the barrel. */
  add(pos: THREE.Vector3, vel: THREE.Vector3, age: number, style = 'powder') {
    if (this.n >= this.cap) return;
    const i = this.n++;
    const st = STREAKS[style] ?? STREAKS.powder;
    // grows out of the muzzle, then a fixed slice of the flight path
    const len = Math.min(age, st[4]);
    const H = this.aHead, T = this.aTail, S = this.aStyle;
    H[i * 4] = pos.x; H[i * 4 + 1] = pos.y; H[i * 4 + 2] = pos.z; H[i * 4 + 3] = st[5];
    S[i * 4] = st[0]; S[i * 4 + 1] = st[1]; S[i * 4 + 2] = st[2]; S[i * 4 + 3] = st[3];
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
    this.attrStyle.clearUpdateRanges();
    this.attrStyle.addUpdateRange(0, n * 4);
    this.attrStyle.needsUpdate = true;
  }
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const _a = new THREE.Vector3();
/** A bright, fully saturated colour for hue h (0..1). */
const hue = (h: number): [number, number, number] => {
  const f = (n: number) => Math.min(1, Math.max(0, Math.abs((((h + n) % 1) + 1) % 1 * 6 - 3) - 1));
  return [f(0), f(2 / 3), f(1 / 3)];
};

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
    uUnder: globalUniforms.uUnder,
    uUnderColor: globalUniforms.uUnderColor,
    uMist: globalUniforms.uMist,
    uRain: globalUniforms.uRain,
    uTime: globalUniforms.uTime,
    uNight: globalUniforms.uNight,
  };

  constructor(scale = 1) {
    this.alpha = new Pool(Math.floor(2600 * scale), false, this.uniforms);
    this.add = new Pool(Math.floor(1400 * scale), true, this.uniforms);
    this.streaks = new Streaks(640, this.uniforms);
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

  /** A gun going off: flash, sparks and smoke in the look of a vault muzzle blast. */
  muzzle(pos: THREE.Vector3, dir: THREE.Vector3, carry: THREE.Vector3, style = 'powder') {
    switch (style) {
      case 'seasalt':
        this.flash(pos, 2.8, [9, 9.4, 10], [3, 3.6, 4.4]);
        this.sparks(pos, dir, carry, 6, [7, 7.5, 8], [2.5, 3, 3.6]);
        this.smoke(pos, dir, carry, { tint: [1.12, 1.14, 1.16], jet: 9, bank: 6, wisps: 0, alpha: 1.15 });
        for (let i = 0; i < 10; i++) {
          const sp = rand(6, 14);
          this.emit({
            x: pos.x, y: pos.y, z: pos.z, vx: dir.x * sp + rand(-2, 2) + carry.x, vy: rand(1, 5), vz: dir.z * sp + rand(-2, 2) + carry.z,
            life: rand(0.6, 1.1), size: rand(0.1, 0.2), sizeEnd: 0.08, color: [1.4, 1.5, 1.55], alpha: 0.9, grav: 12, drag: 1.2, kind: 0, fadeIn: 0.01,
          });
        }
        break;
      case 'soot':
        this.flash(pos, 3.0, [9, 4.6, 1.3], [3.5, 1.0, 0.2]);
        this.sparks(pos, dir, carry, 7, [7, 3, 0.8], [2, 0.5, 0.1]);
        this.smoke(pos, dir, carry, { tint: [0.4, 0.37, 0.35], jet: 9, bank: 5, wisps: 6, alpha: 1.25 });
        break;
      case 'ember':
        this.flash(pos, 3.0, [10, 5.2, 1.6], [4, 1.2, 0.2]);
        this.sparks(pos, dir, carry, 6, [8, 3.6, 0.9], [2.4, 0.5, 0.06]);
        this.embers(pos, dir, carry, 26, 1);
        this.smoke(pos, dir, carry, { tint: [1.08, 0.98, 0.88], jet: 7, bank: 3, wisps: 2 });
        break;
      case 'ring': {
        this.flash(pos, 2.4, [9, 6, 2.6], [4, 1.4, 0.3]);
        // a vortex ring rolling out of the gunport, widening as it goes
        const side = _a.set(-dir.z, 0, dir.x).normalize();
        const n = 26;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const cx = Math.cos(a), cy = Math.sin(a);
          const rx = side.x * cx, ry = cy, rz = side.z * cx;
          const sp = rand(7.5, 8.5);
          this.emit({
            x: pos.x + dir.x * 1.1 + rx * 0.35, y: pos.y + ry * 0.35, z: pos.z + dir.z * 1.1 + rz * 0.35,
            vx: dir.x * sp + rx * 2.6 + carry.x * 0.7, vy: ry * 2.6 + 0.35, vz: dir.z * sp + rz * 2.6 + carry.z * 0.7,
            life: rand(2.6, 3.2), size: 0.7, sizeEnd: rand(2.0, 2.4), color: [1.12, 1.12, 1.14], colorEnd: [1.05, 1.06, 1.1],
            alpha: 0.78, drag: 1.25, grav: -0.12, spin: rand(-0.3, 0.3), kind: 1, fadeIn: 0.03,
          });
        }
        this.smoke(pos, dir, carry, { tint: [1, 1, 1], jet: 3, bank: 2, wisps: 0, alpha: 0.7 });
        break;
      }
      case 'azure':
        this.flash(pos, 3.0, [3, 6.5, 11], [0.5, 1.6, 4.5]);
        this.sparks(pos, dir, carry, 12, [2.5, 6, 10], [0.4, 1.4, 4], 2);
        for (let i = 0; i < 9; i++) {
          const sp = rand(6, 16);
          this.emit({
            x: pos.x, y: pos.y, z: pos.z, vx: dir.x * sp + rand(-1, 1) + carry.x, vy: rand(-0.2, 1), vz: dir.z * sp + rand(-1, 1) + carry.z,
            life: rand(0.25, 0.45), size: rand(0.6, 1.0), sizeEnd: rand(1.6, 2.4), color: [2, 4.6, 9], colorEnd: [0.3, 0.7, 2.4], drag: 4, kind: 0, fadeIn: 0.001,
          }, true);
        }
        this.smoke(pos, dir, carry, { tint: [0.84, 0.94, 1.18], jet: 8, bank: 3, wisps: 0 });
        break;
      case 'confetti': {
        this.flash(pos, 2.2, [9, 8, 5], [4, 2.6, 1]);
        const C: [number, number, number][] = [[1.5, 0.35, 0.75], [1.5, 1.2, 0.2], [0.25, 1.2, 1.5], [0.6, 1.4, 0.3], [1.5, 0.6, 0.15], [0.9, 0.45, 1.5], [1.6, 1.6, 1.6]];
        for (let i = 0; i < 46; i++) {
          const sp = rand(5, 15);
          this.emit({
            x: pos.x + dir.x * 0.5, y: pos.y, z: pos.z + dir.z * 0.5,
            vx: dir.x * sp + rand(-4, 4) + carry.x, vy: rand(2, 9), vz: dir.z * sp + rand(-4, 4) + carry.z,
            life: rand(2.4, 4.0), size: rand(0.13, 0.22), color: C[i % C.length], alpha: 1, grav: 2.4, drag: 1.9, spin: rand(-12, 12), kind: 3, fadeIn: 0.001,
          });
        }
        for (let i = 0; i < 14; i++) {
          const sp = rand(4, 12);
          this.emit({
            x: pos.x, y: pos.y, z: pos.z, vx: dir.x * sp + rand(-3, 3) + carry.x, vy: rand(1, 6), vz: dir.z * sp + rand(-3, 3) + carry.z,
            life: rand(0.5, 1.0), size: rand(0.2, 0.35), sizeEnd: 0.05, color: [7, 5.5, 2], colorEnd: [3, 1.6, 0.4], drag: 2, grav: 2, kind: 2, fadeIn: 0.01,
          }, true);
        }
        this.smoke(pos, dir, carry, { tint: [1.08, 1.06, 1.1], jet: 4, bank: 2, wisps: 0, alpha: 0.8 });
        break;
      }
      case 'dragon':
        this.flash(pos, 3.8, [12, 7, 2.2], [4, 1.2, 0.2]);
        // a roaring cone of fire, white-hot at the mouth
        for (let i = 0; i < 38; i++) {
          const sp = rand(12, 30);
          const spread = sp * 0.12;
          const hot = i < 10;
          this.emit({
            x: pos.x, y: pos.y, z: pos.z,
            vx: dir.x * sp + rand(-spread, spread) + carry.x, vy: rand(-spread, spread) * 0.6 + 0.6, vz: dir.z * sp + rand(-spread, spread) + carry.z,
            life: rand(0.35, 0.7) * (hot ? 0.7 : 1), size: rand(0.6, 1.0), sizeEnd: rand(2.2, 3.4), color: hot ? [12, 9, 4] : [10, 4.6, 1.1], colorEnd: [3, 0.55, 0.06],
            drag: 2.6, grav: -2.5, spin: rand(-2, 2), kind: 0, fadeIn: 0.001,
          }, true);
        }
        this.embers(pos, dir, carry, 20, 1.3);
        this.smoke(pos, dir, carry, { tint: [0.34, 0.31, 0.3], jet: 8, bank: 4, wisps: 3, alpha: 1.1 });
        break;
      case 'thunder': {
        this.flash(pos, 3.4, [8, 8.5, 13], [3, 2, 9]);
        // crackling arcs flung every way, mostly forward
        for (let i = 0; i < 18; i++) {
          const sp = rand(18, 42);
          const f = rand(0.2, 1);
          this.emit({
            x: pos.x, y: pos.y, z: pos.z,
            vx: dir.x * sp * f + rand(-1, 1) * sp * 0.6 + carry.x, vy: rand(-0.5, 1) * sp * 0.4, vz: dir.z * sp * f + rand(-1, 1) * sp * 0.6 + carry.z,
            life: rand(0.12, 0.3), size: rand(0.18, 0.3), sizeEnd: 0.05, color: [7, 7, 14], colorEnd: [3, 1.5, 9], drag: 8, kind: 2, fadeIn: 0.001,
          }, true);
        }
        // a flat violet shock ring racing out over the water
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          this.emit({
            x: pos.x + dir.x * 1.5, y: pos.y - 0.3, z: pos.z + dir.z * 1.5, vx: Math.cos(a) * 15 + carry.x, vy: 0, vz: Math.sin(a) * 15 + carry.z,
            life: 0.32, size: 0.9, sizeEnd: 1.8, color: [2.2, 1.8, 5.5], colorEnd: [0.6, 0.4, 2.2], drag: 3.2, kind: 0, fadeIn: 0.001,
          }, true);
        }
        this.smoke(pos, dir, carry, { tint: [1.02, 1.0, 1.1], jet: 7, bank: 3, wisps: 0 });
        break;
      }
      default:
        this.flash(pos, 2.6, [9, 6, 2.6], [4, 1.4, 0.3]);
        this.sparks(pos, dir, carry, 5, [6, 3.2, 1.0], [2, 0.5, 0.1]);
        this.smoke(pos, dir, carry, {});
    }
  }

  private flash(pos: THREE.Vector3, size: number, c0: [number, number, number], c1: [number, number, number]) {
    this.emit({ x: pos.x, y: pos.y, z: pos.z, life: 0.12, size, sizeEnd: size * 1.6, color: c0, colorEnd: c1, kind: 0, fadeIn: 0.001 }, true);
  }

  private sparks(pos: THREE.Vector3, dir: THREE.Vector3, carry: THREE.Vector3, n: number, c0: [number, number, number], c1: [number, number, number], kind = 0) {
    for (let i = 0; i < n; i++) {
      const sp = rand(10, 22);
      this.emit({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * sp + rand(-2, 2) + carry.x, vy: dir.y * sp + rand(-1, 2), vz: dir.z * sp + rand(-2, 2) + carry.z,
        life: rand(0.1, 0.22), size: kind === 2 ? rand(0.2, 0.32) : rand(0.8, 1.6), sizeEnd: kind === 2 ? 0.05 : 0.3, color: c0, colorEnd: c1, drag: 6, kind, fadeIn: 0.001,
      }, true);
    }
  }

  /** Glowing embers that arc out and fall to the sea. */
  private embers(pos: THREE.Vector3, dir: THREE.Vector3, carry: THREE.Vector3, n: number, reach: number) {
    for (let i = 0; i < n; i++) {
      const sp = rand(5, 15) * reach;
      this.emit({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * sp + rand(-3, 3) + carry.x, vy: rand(2, 9), vz: dir.z * sp + rand(-3, 3) + carry.z,
        life: rand(1.0, 2.2), size: rand(0.14, 0.28), sizeEnd: 0.05, color: [7, 3.2, 0.7], colorEnd: [2.4, 0.4, 0.04], grav: 8, drag: 0.7, kind: 2, fadeIn: 0.01,
      }, true);
    }
  }

  /**
   * The three layers of gun smoke: a fast dense jet out along the barrel, a
   * slow bank that hangs by the gunport, and dark powder wisps from the flash.
   */
  private smoke(pos: THREE.Vector3, dir: THREE.Vector3, carry: THREE.Vector3, o: { tint?: [number, number, number]; jet?: number; bank?: number; wisps?: number; alpha?: number }) {
    const [tr, tg, tb] = o.tint ?? [1, 1, 1];
    const al = o.alpha ?? 1;
    const rain = globalUniforms.uRain.value;
    const thin = 1 - rain * 0.3; // rain knocks the smoke down sooner
    for (let i = 0; i < (o.jet ?? 8); i++) {
      const sp = rand(5, 16);
      const g = rand(0.74, 0.9);
      this.emit({
        x: pos.x + dir.x * 0.6, y: pos.y, z: pos.z + dir.z * 0.6,
        vx: dir.x * sp + rand(-1.4, 1.4) + carry.x * 0.6, vy: rand(0.1, 1.4), vz: dir.z * sp + rand(-1.4, 1.4) + carry.z * 0.6,
        life: rand(2.4, 4.0) * thin, size: rand(1.0, 1.7), sizeEnd: rand(5.5, 8.5), color: [g * 1.1 * tr, g * 1.08 * tg, g * 1.05 * tb], colorEnd: [g * 1.02 * tr, g * 1.02 * tg, g * 1.04 * tb],
        alpha: Math.min(1, rand(0.5, 0.72) * al), drag: 2.0, grav: -0.3, spin: rand(-0.35, 0.35), kind: 1, fadeIn: 0.04,
      });
    }
    for (let i = 0; i < (o.bank ?? 4); i++) {
      const sp = rand(1.5, 4);
      const g = rand(0.82, 0.95);
      this.emit({
        x: pos.x + dir.x * 1.2 + rand(-0.6, 0.6), y: pos.y + rand(-0.2, 0.5), z: pos.z + dir.z * 1.2 + rand(-0.6, 0.6),
        vx: dir.x * sp + carry.x * 0.8, vy: rand(0.3, 0.9), vz: dir.z * sp + carry.z * 0.8,
        life: rand(4.5, 6.5) * thin, size: rand(2.2, 3.2), sizeEnd: rand(9, 13), color: [g * tr, g * tg, g * 1.02 * tb], colorEnd: [g * 1.04 * tr, g * 1.04 * tg, g * 1.07 * tb],
        alpha: Math.min(1, rand(0.28, 0.4) * al), drag: 1.2, grav: -0.18, spin: rand(-0.15, 0.15), kind: 1, fadeIn: 0.25,
      });
    }
    for (let i = 0; i < (o.wisps ?? 3); i++) {
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

  /** What a ball leaves hanging behind it, in the look of a vault shot trail. Called every few hundredths of a second. */
  trail(pos: THREE.Vector3, young: number, style = 'powder', vel?: THREE.Vector3) {
    const j = () => rand(-0.08, 0.08);
    switch (style) {
      case 'spray':
        this.emit({ x: pos.x + j(), y: pos.y + j(), z: pos.z + j(), vy: 0.2, life: rand(0.7, 1.0), size: 0.25, sizeEnd: rand(1.0, 1.4), color: [1.15, 1.2, 1.24], alpha: 0.14 + young * 0.12, drag: 1, kind: 1, fadeIn: 0.04 });
        this.emit({ x: pos.x + j(), y: pos.y + j(), z: pos.z + j(), vx: rand(-1, 1), vy: rand(0, 1.5), vz: rand(-1, 1), life: rand(0.4, 0.7), size: rand(0.08, 0.14), sizeEnd: 0.05, color: [1.4, 1.5, 1.55], alpha: 0.85, grav: 9, kind: 0, fadeIn: 0.01 });
        break;
      case 'soot':
        this.emit({ x: pos.x + j(), y: pos.y + j(), z: pos.z + j(), vy: 0.3, life: rand(1.6, 2.3), size: 0.4, sizeEnd: rand(2.0, 2.8), color: [0.32, 0.3, 0.29], colorEnd: [0.5, 0.48, 0.47], alpha: 0.26 + young * 0.18, drag: 1, spin: rand(-0.5, 0.5), kind: 1, fadeIn: 0.05 });
        break;
      case 'ember':
        this.emit({ x: pos.x + j(), y: pos.y + j(), z: pos.z + j(), vx: rand(-0.8, 0.8), vy: rand(-0.5, 1.2), vz: rand(-0.8, 0.8), life: rand(0.5, 1.0), size: rand(0.14, 0.24), sizeEnd: 0.04, color: [7, 3, 0.6], colorEnd: [2, 0.3, 0.02], grav: 5, drag: 0.6, kind: 2, fadeIn: 0.01 }, true);
        if (Math.random() < 0.5) this.emit({ x: pos.x, y: pos.y, z: pos.z, vy: 0.3, life: rand(0.9, 1.3), size: 0.3, sizeEnd: 1.4, color: [0.7, 0.62, 0.56], alpha: 0.12, drag: 1, kind: 1, fadeIn: 0.05 });
        break;
      case 'frost':
        this.emit({ x: pos.x + j(), y: pos.y + j(), z: pos.z + j(), vy: 0.15, life: rand(1.0, 1.5), size: 0.3, sizeEnd: rand(1.3, 1.8), color: [0.9, 1.05, 1.25], alpha: 0.2 + young * 0.14, drag: 1, spin: rand(-0.4, 0.4), kind: 1, fadeIn: 0.05 });
        if (Math.random() < 0.7) this.emit({ x: pos.x + j() * 3, y: pos.y + j() * 3, z: pos.z + j() * 3, vx: rand(-0.4, 0.4), vy: rand(-0.6, 0.2), vz: rand(-0.4, 0.4), life: rand(0.6, 1.1), size: rand(0.12, 0.2), sizeEnd: 0.03, color: [3, 5, 7], colorEnd: [1, 2.4, 4], kind: 2, fadeIn: 0.05 }, true);
        break;
      case 'comet':
        this.emit({ x: pos.x, y: pos.y, z: pos.z, life: rand(0.4, 0.6), size: 0.6, sizeEnd: 0.12, color: [6, 4, 1.2], colorEnd: [2, 0.8, 0.1], kind: 0, fadeIn: 0.001 }, true);
        if (Math.random() < 0.6) this.emit({ x: pos.x + j() * 2, y: pos.y + j() * 2, z: pos.z + j() * 2, vx: rand(-0.6, 0.6), vy: rand(-0.4, 0.6), vz: rand(-0.6, 0.6), life: rand(0.7, 1.2), size: rand(0.14, 0.24), sizeEnd: 0.03, color: [7, 5, 1.6], colorEnd: [3, 1.4, 0.2], grav: 1.5, kind: 2, fadeIn: 0.01 }, true);
        this.emit({ x: pos.x, y: pos.y, z: pos.z, vy: 0.2, life: rand(1.0, 1.4), size: 0.3, sizeEnd: 1.5, color: [1.15, 1.05, 0.9], alpha: 0.1 + young * 0.1, drag: 1, kind: 1, fadeIn: 0.05 });
        break;
      case 'ghost': {
        const ph = performance.now() * 0.006;
        this.emit({ x: pos.x + Math.sin(ph) * 0.2, y: pos.y + Math.cos(ph * 1.3) * 0.2, z: pos.z, vx: rand(-0.4, 0.4), vy: rand(0.4, 1.2), vz: rand(-0.4, 0.4), life: rand(0.6, 1.0), size: 0.45, sizeEnd: 1.3, color: [1.5, 5, 3], colorEnd: [0.15, 1.1, 0.6], spin: rand(-1, 1), kind: 0, fadeIn: 0.05 }, true);
        if (Math.random() < 0.4) this.emit({ x: pos.x, y: pos.y, z: pos.z, vy: 0.3, life: rand(1.0, 1.4), size: 0.3, sizeEnd: 1.6, color: [0.75, 1.0, 0.88], alpha: 0.12, drag: 1, kind: 1, fadeIn: 0.05 });
        break;
      }
      case 'rainbow': {
        const h = (performance.now() * 0.0007) % 1;
        const [r, g, b] = hue(h + rand(-0.04, 0.04));
        this.emit({ x: pos.x + j(), y: pos.y + j(), z: pos.z + j(), life: rand(0.5, 0.8), size: 0.42, sizeEnd: 0.1, color: [r * 4, g * 4, b * 4], colorEnd: [r * 1.2, g * 1.2, b * 1.2], kind: 0, fadeIn: 0.001 }, true);
        if (Math.random() < 0.7) {
          const [r2, g2, b2] = hue(Math.random());
          this.emit({ x: pos.x + j() * 3, y: pos.y + j() * 3, z: pos.z + j() * 3, vx: rand(-0.8, 0.8), vy: rand(-0.3, 0.9), vz: rand(-0.8, 0.8), life: rand(0.7, 1.3), size: rand(0.14, 0.24), sizeEnd: 0.03, color: [r2 * 5, g2 * 5, b2 * 5], colorEnd: [r2, g2, b2], grav: 1, kind: 2, fadeIn: 0.01 }, true);
        }
        break;
      }
      case 'fuse':
        // a lit fuse sputtering on the shell, and a thin thread of powder smoke
        this.emit({ x: pos.x + j(), y: pos.y + j(), z: pos.z + j(), vx: rand(-1.5, 1.5), vy: rand(-0.5, 2), vz: rand(-1.5, 1.5), life: rand(0.18, 0.4), size: rand(0.12, 0.2), sizeEnd: 0.03, color: [8, 5, 1.6], colorEnd: [3, 1, 0.1], grav: 6, drag: 1, kind: 2, fadeIn: 0.001 }, true);
        this.emit({ x: pos.x + j(), y: pos.y + j(), z: pos.z + j(), vy: 0.25, life: rand(0.9, 1.3), size: 0.22, sizeEnd: rand(1.0, 1.4), color: [0.55, 0.52, 0.5], alpha: 0.18 + young * 0.14, drag: 1, spin: rand(-0.5, 0.5), kind: 1, fadeIn: 0.05 });
        break;
      case 'fire':
        // red-hot iron: a flame streaming off the ball, embers and a ribbon of dark smoke
        this.emit({ x: pos.x + j(), y: pos.y + j(), z: pos.z + j(), vy: rand(0.5, 1.5), life: rand(0.3, 0.5), size: rand(0.55, 0.75), sizeEnd: 0.15, color: [9, 3.8, 0.9], colorEnd: [2.6, 0.45, 0.05], spin: rand(-3, 3), kind: 0, fadeIn: 0.001 }, true);
        if (Math.random() < 0.55) this.emit({ x: pos.x + j() * 2, y: pos.y + j() * 2, z: pos.z + j() * 2, vx: rand(-0.8, 0.8), vy: rand(0, 1.6), vz: rand(-0.8, 0.8), life: rand(0.5, 1.0), size: rand(0.14, 0.24), sizeEnd: 0.04, color: [8, 3.4, 0.7], colorEnd: [2, 0.3, 0.02], grav: 4, drag: 0.6, kind: 2, fadeIn: 0.01 }, true);
        if (Math.random() < 0.6) this.emit({ x: pos.x, y: pos.y, z: pos.z, vy: 0.5, life: rand(1.4, 2.0), size: 0.35, sizeEnd: rand(1.8, 2.4), color: [0.3, 0.27, 0.25], colorEnd: [0.46, 0.44, 0.43], alpha: 0.2 + young * 0.18, drag: 1, spin: rand(-0.6, 0.6), kind: 1, fadeIn: 0.06 });
        break;
      case 'starfall':
        this.emit({ x: pos.x + j() * 2, y: pos.y + j() * 2, z: pos.z + j() * 2, vx: rand(-0.3, 0.3) - (vel?.x ?? 0) * 0.02, vy: rand(-0.4, 0.2), vz: rand(-0.3, 0.3) - (vel?.z ?? 0) * 0.02, life: rand(1.3, 2.2), size: rand(0.2, 0.34), sizeEnd: 0.06, color: Math.random() < 0.5 ? [6, 6, 7.5] : [4.5, 3.2, 8], colorEnd: [1.6, 1.2, 3], grav: 0.5, drag: 1, kind: 2, fadeIn: 0.02 }, true);
        if (Math.random() < 0.5) this.emit({ x: pos.x, y: pos.y, z: pos.z, life: rand(0.3, 0.5), size: 0.5, sizeEnd: 0.1, color: [3, 2.6, 5.5], colorEnd: [0.8, 0.5, 2], kind: 0, fadeIn: 0.001 }, true);
        break;
      default:
        this.emit({
          x: pos.x + j(), y: pos.y + j(), z: pos.z + j(), vy: 0.25,
          life: rand(1.1, 1.6), size: 0.3, sizeEnd: rand(1.4, 2.0), color: [0.95, 0.94, 0.93], alpha: 0.16 + young * 0.18, drag: 1, spin: rand(-0.5, 0.5), kind: 1, fadeIn: 0.05,
        });
    }
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

  // ------------------------------------------------------------- shot types

  /** What a special load adds to the gun's own (vault) blast. */
  ammoMuzzle(pos: THREE.Vector3, dir: THREE.Vector3, carry: THREE.Vector3, ammo: string) {
    switch (ammo) {
      case 'shell':
        // the fuse catches as the shell leaves: a spit of bright sparks
        this.sparks(pos, dir, carry, 7, [9, 6, 2], [3, 1, 0.15], 2);
        break;
      case 'fire':
        // red-hot shot: a gout of flame and a spray of embers out of the gunport
        for (let i = 0; i < 12; i++) {
          const sp = rand(8, 20);
          this.emit({
            x: pos.x, y: pos.y, z: pos.z, vx: dir.x * sp + rand(-1.5, 1.5) + carry.x, vy: rand(0, 1.5), vz: dir.z * sp + rand(-1.5, 1.5) + carry.z,
            life: rand(0.25, 0.5), size: rand(0.5, 0.9), sizeEnd: rand(1.6, 2.4), color: [10, 4.4, 1], colorEnd: [2.6, 0.4, 0.04], drag: 3, grav: -2, spin: rand(-2, 2), kind: 0, fadeIn: 0.001,
          }, true);
        }
        this.embers(pos, dir, carry, 18, 1.1);
        break;
      case 'chain':
        // iron grinding on iron as the chain whips out
        this.sparks(pos, dir, carry, 5, [6, 6, 6.5], [1.6, 1.6, 2], 2);
        break;
      case 'grape': {
        // a wide cone: the bag bursts at the muzzle
        for (let i = 0; i < 14; i++) {
          const sp = rand(14, 30);
          this.emit({
            x: pos.x, y: pos.y, z: pos.z, vx: dir.x * sp + rand(-5, 5) + carry.x, vy: rand(-1, 3), vz: dir.z * sp + rand(-5, 5) + carry.z,
            life: rand(0.12, 0.26), size: rand(0.16, 0.26), sizeEnd: 0.04, color: [7, 5, 2.4], colorEnd: [2, 0.8, 0.2], drag: 5, kind: 2, fadeIn: 0.001,
          }, true);
        }
        for (let i = 0; i < 5; i++) {
          const sp = rand(6, 14);
          this.emit({
            x: pos.x + dir.x, y: pos.y, z: pos.z + dir.z, vx: dir.x * sp + rand(-3, 3) + carry.x, vy: rand(0, 1.2), vz: dir.z * sp + rand(-3, 3) + carry.z,
            life: rand(1.6, 2.6), size: rand(0.8, 1.2), sizeEnd: rand(4, 6), color: [0.88, 0.87, 0.85], alpha: 0.5, drag: 2.4, grav: -0.2, spin: rand(-0.4, 0.4), kind: 1, fadeIn: 0.03,
          });
        }
        break;
      }
    }
  }

  /** An explosive shell bursting: fireball, shrapnel, a pall of smoke, and a tall column of sea if it burst in the water. */
  shellBurst(pos: THREE.Vector3, water: boolean, scale = 1) {
    const s = scale;
    this.emit({ x: pos.x, y: pos.y + 0.5, z: pos.z, life: 0.16, size: 6 * s, sizeEnd: 11 * s, color: [14, 9, 4], colorEnd: [4, 1.4, 0.3], kind: 0, fadeIn: 0.001 }, true);
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(2, 9) * s;
      this.emit({
        x: pos.x, y: pos.y + 0.6, z: pos.z, vx: Math.cos(a) * sp, vy: rand(2, 10) * s, vz: Math.sin(a) * sp,
        life: rand(0.35, 0.75), size: rand(1.2, 2.2) * s, sizeEnd: rand(2.5, 3.6) * s, color: [10, 4.2, 1.1], colorEnd: [2.2, 0.35, 0.04], drag: 3, grav: -1, spin: rand(-2, 2), kind: 0, fadeIn: 0.001,
      }, true);
    }
    // shrapnel: white-hot streaks flung out low and fast
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(14, 34);
      this.emit({
        x: pos.x, y: pos.y + 0.5, z: pos.z, vx: Math.cos(a) * sp, vy: rand(1, 12), vz: Math.sin(a) * sp,
        life: rand(0.25, 0.6), size: rand(0.18, 0.3), sizeEnd: 0.04, color: [9, 7, 3.6], colorEnd: [3, 1, 0.2], grav: 10, drag: 2.2, kind: 2, fadeIn: 0.001,
      }, true);
    }
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(4, 12);
      const br = rand(0.25, 0.5);
      this.emit({
        x: pos.x, y: pos.y + 0.5, z: pos.z, vx: Math.cos(a) * sp, vy: rand(5, 14), vz: Math.sin(a) * sp,
        life: rand(1, 1.8), size: rand(0.15, 0.35), color: [br, br * 0.9, br * 0.8], grav: 18, drag: 0.3, spin: rand(-14, 14), kind: 3, fadeIn: 0.001,
      });
    }
    // a black-brown pall that rolls up and hangs
    for (let i = 0; i < 9; i++) {
      this.emit({
        x: pos.x + rand(-1, 1), y: pos.y + rand(0.5, 2), z: pos.z + rand(-1, 1), vx: rand(-1.6, 1.6), vy: rand(1.5, 4), vz: rand(-1.6, 1.6),
        life: rand(2.6, 4.5), size: 2.2 * s, sizeEnd: rand(7, 10) * s, color: [0.2, 0.18, 0.17], colorEnd: [0.48, 0.46, 0.45], alpha: 0.62, drag: 0.9, grav: -0.35, spin: rand(-0.4, 0.4), kind: 1, fadeIn: 0.06,
      });
    }
    if (water) {
      // the sea thrown up in a white column around the blast
      this.splash(pos, 1.5);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        this.emit({
          x: pos.x, y: pos.y + 0.2, z: pos.z, vx: Math.cos(a) * 9, vy: rand(1, 3), vz: Math.sin(a) * 9,
          life: rand(0.8, 1.2), size: 1.4, sizeEnd: 3.4, color: [1.3, 1.36, 1.4], alpha: 0.5, drag: 2.4, grav: 2, kind: 1, fadeIn: 0.01,
        });
      }
    }
  }

  /** Fire shot striking home: a burst of flame that catches and climbs. */
  fireHit(pos: THREE.Vector3) {
    this.emit({ x: pos.x, y: pos.y, z: pos.z, life: 0.2, size: 4, sizeEnd: 6, color: [10, 4.5, 1.2], colorEnd: [3, 0.6, 0.06], kind: 0, fadeIn: 0.001 }, true);
    for (let i = 0; i < 14; i++) {
      this.emit({
        x: pos.x + rand(-0.6, 0.6), y: pos.y + rand(-0.2, 0.4), z: pos.z + rand(-0.6, 0.6), vx: rand(-1.5, 1.5), vy: rand(2.5, 6), vz: rand(-1.5, 1.5),
        life: rand(0.4, 0.8), size: rand(0.8, 1.5), sizeEnd: 0.3, color: [9, 3.8, 0.9], colorEnd: [3, 0.5, 0.06], spin: rand(-2, 2), drag: 1, kind: 0, fadeIn: 0.02,
      }, true);
    }
    for (let i = 0; i < 16; i++) {
      this.emit({
        x: pos.x, y: pos.y, z: pos.z, vx: rand(-7, 7), vy: rand(2, 9), vz: rand(-7, 7),
        life: rand(0.8, 1.6), size: rand(0.14, 0.26), sizeEnd: 0.04, color: [8, 3.4, 0.7], colorEnd: [2.4, 0.4, 0.04], grav: 9, drag: 0.7, kind: 2, fadeIn: 0.01,
      }, true);
    }
  }

  /** Hot iron into the sea: a hissing gout of steam. */
  steam(pos: THREE.Vector3) {
    this.splash(pos, 0.6);
    for (let i = 0; i < 9; i++) {
      this.emit({
        x: pos.x + rand(-0.5, 0.5), y: pos.y + 0.3, z: pos.z + rand(-0.5, 0.5), vx: rand(-0.8, 0.8), vy: rand(2, 5), vz: rand(-0.8, 0.8),
        life: rand(1.4, 2.4), size: 0.8, sizeEnd: rand(3.5, 5), color: [1.32, 1.34, 1.36], alpha: 0.42, drag: 1.4, grav: -0.8, spin: rand(-0.6, 0.6), kind: 1, fadeIn: 0.04,
      });
    }
  }

  /** A grape-shot ball striking a deck: a puff of splinters, not a breach. */
  pelletHit(pos: THREE.Vector3) {
    this.emit({ x: pos.x, y: pos.y, z: pos.z, life: 0.08, size: 0.9, sizeEnd: 1.4, color: [7, 4.2, 1.6], colorEnd: [2, 0.6, 0.1], kind: 0, fadeIn: 0.001 }, true);
    for (let i = 0; i < 4; i++) {
      const br = rand(0.55, 0.9);
      this.emit({
        x: pos.x, y: pos.y, z: pos.z, vx: rand(-4, 4), vy: rand(2, 7), vz: rand(-4, 4),
        life: rand(0.6, 1.1), size: rand(0.08, 0.2), color: [0.55 * br, 0.36 * br, 0.2 * br], grav: 18, drag: 0.4, spin: rand(-14, 14), kind: 3, fadeIn: 0.001,
      });
    }
  }

  /** Chain shot through the rigging: canvas torn to ribbons, cordage and splinters whirling away. */
  shreds(pos: THREE.Vector3, vel: THREE.Vector3, sail: [number, number, number]) {
    for (let i = 0; i < 18; i++) {
      this.emit({
        x: pos.x + rand(-1.2, 1.2), y: pos.y + rand(-1, 1), z: pos.z + rand(-1.2, 1.2), vx: vel.x * 0.06 + rand(-3, 3), vy: rand(-0.5, 3), vz: vel.z * 0.06 + rand(-3, 3),
        life: rand(1.6, 3), size: rand(0.18, 0.45), color: sail, grav: 2.2, drag: 2.4, spin: rand(-9, 9), kind: 3, fadeIn: 0.001,
      });
    }
    for (let i = 0; i < 6; i++) {
      this.emit({
        x: pos.x, y: pos.y, z: pos.z, vx: vel.x * 0.05 + rand(-4, 4), vy: rand(0, 4), vz: vel.z * 0.05 + rand(-4, 4),
        life: rand(1, 1.8), size: rand(0.1, 0.18), color: [0.3, 0.22, 0.14], grav: 9, drag: 1, spin: rand(-12, 12), kind: 3, fadeIn: 0.001,
      });
    }
    this.emit({ x: pos.x, y: pos.y, z: pos.z, vx: vel.x * 0.04, vz: vel.z * 0.04, life: 1.4, size: 1, sizeEnd: 3.4, color: sail, alpha: 0.3, drag: 2, kind: 1 });
    for (let i = 0; i < 4; i++) {
      this.emit({
        x: pos.x, y: pos.y, z: pos.z, vx: rand(-8, 8), vy: rand(-2, 6), vz: rand(-8, 8),
        life: rand(0.15, 0.3), size: rand(0.16, 0.24), sizeEnd: 0.04, color: [6, 6, 6.5], colorEnd: [1.5, 1.5, 2], drag: 4, kind: 2, fadeIn: 0.001,
      }, true);
    }
  }

  setScene(depth: THREE.Texture, w: number, h: number, cam: THREE.PerspectiveCamera) {
    this.uniforms.uSceneDepth.value = depth;
    this.uniforms.uResolution.value.set(w, h);
    this.uniforms.uCamNearFar.value.set(cam.near, cam.far);
  }
}
