import * as THREE from 'three';
import { getSharedTextures } from '../render/textures';
import { WORLD_SIZE } from './terrain';

// A camera-centred, world-aligned water-disturbance canvas that scrolls with
// the camera. Two things live in it:
//  R    foam density: ships and splashes paint it, it diffuses and fades, and
//       breaking wake crests feed it, so foam lines peel off along the V-arms.
//  G, B wake height and vertical velocity: a damped 2D wave equation, stepped
//       semi-implicitly (velocity, then height) so increments stay large next
//       to the stored values and half-float precision holds even at 144 Hz. Hulls push a
//       moving pressure pattern into it and the simulation itself grows the
//       bow and stern V-waves (a Mach cone at ~Kelvin's 19.5° at cruising
//       speed), the transverse swell behind, and rings from cannon splashes.
//       Waves slow down in the shallows, bend round islands and stop at the
//       beach. The ocean reads it for displacement, normals and foam.

const MAX_STAMPS = 320;
const WAVE_SPEED = 4; // m/s in deep water
const VEL_DAMP = 0.18; // 1/s
const HEIGHT_DECAY = 0.12; // 1/s, keeps long-lived dimples from building up
const FOAM_HALF_LIFE = 1.9; // s

export class WakeField {
  readonly size: number; // world metres covered
  readonly res: number;
  readonly center = new THREE.Vector2();
  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  private simScene = new THREE.Scene();
  private stampScene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1);
  private simMat: THREE.ShaderMaterial;
  private stampGeo: THREE.InstancedBufferGeometry;
  private stampData: Float32Array; // x, z, radius, strength
  private stampKind: Float32Array; // 0 foam blob, 1 foam ring, 2 height, 3 velocity
  private stampCount = 0;
  private lastCenter = new THREE.Vector2();
  readonly uniforms = {
    uWakeTex: { value: null as THREE.Texture | null },
    uWakeRect: { value: new THREE.Vector4() }, // centerX, centerZ, size, 1/size
    uWakeTexel: { value: 0 },
  };

  constructor(res = 512, size = 300) {
    this.res = res;
    this.size = size;
    this.uniforms.uWakeTexel.value = 1 / res;
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rtA = new THREE.WebGLRenderTarget(res, res, opts);
    this.rtB = new THREE.WebGLRenderTarget(res, res, opts);

    // stand-in until the islands are known: open, deep water everywhere
    const deep = new THREE.DataTexture(new Uint16Array([THREE.DataUtils.toHalfFloat(-100)]), 1, 1, THREE.RedFormat, THREE.HalfFloatType);
    deep.needsUpdate = true;

    this.simMat = new THREE.ShaderMaterial({
      uniforms: {
        uPrev: { value: null },
        uShift: { value: new THREE.Vector2() },
        uTexel: { value: 1 / res },
        uFoamDecay: { value: 0.98 },
        uFoamGain: { value: 0 },
        uDt: { value: 1 / 60 },
        uK: { value: 0 },
        uVelDamp: { value: 1 },
        uRect: this.uniforms.uWakeRect,
        uHeightTex: { value: deep as THREE.Texture },
        uWorldRect: { value: new THREE.Vector4(-WORLD_SIZE / 2, -WORLD_SIZE / 2, WORLD_SIZE, 1 / WORLD_SIZE) },
        uNoise: { value: getSharedTextures().noise as THREE.Texture },
        uSimTime: { value: 0 },
      },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uPrev; uniform sampler2D uHeightTex; uniform sampler2D uNoise; uniform float uSimTime;
        uniform vec2 uShift; uniform float uTexel;
        uniform float uFoamDecay; uniform float uFoamGain;
        uniform float uDt; uniform float uK; uniform float uVelDamp;
        uniform vec4 uRect; uniform vec4 uWorldRect;
        varying vec2 vUv;
        vec4 tap(vec2 uv) {
          vec4 c = texture2D(uPrev, uv);
          // outside the canvas the water is still
          return c * step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        }
        void main(){
          vec2 uv = vUv + uShift;
          float t = uTexel;
          vec4 c = tap(uv);
          vec4 e = tap(uv + vec2(t, 0.0));
          vec4 w = tap(uv - vec2(t, 0.0));
          vec4 n = tap(uv + vec2(0.0, t));
          vec4 s = tap(uv - vec2(0.0, t));

          // water depth here: waves slow in the shallows and die on the sand
          vec2 world = uRect.xy + (vUv - 0.5) * uRect.z;
          float depth = -texture2D(uHeightTex, (world - uWorldRect.xy) * uWorldRect.w).r;
          float speed2 = clamp(depth / 6.0, 0.04, 1.0);
          // turbulence: wave speed wanders patch to patch, so crests bend and kink
          // instead of running dead straight, and foam drifts with slow eddies
          vec4 tn = texture2D(uNoise, world * 0.021 + vec2(uSimTime * 0.011, -uSimTime * 0.008));
          vec4 tn2 = texture2D(uNoise, world * 0.067 - vec2(uSimTime * 0.019, uSimTime * 0.014) + 0.53);
          speed2 *= 0.62 + 0.62 * (tn.g * 0.6 + tn2.a * 0.4);
          float wet = smoothstep(0.05, 0.7, depth);

          float h = c.g;
          float lap = e.g + w.g + n.g + s.g - 4.0 * h;
          float v = (c.b + uK * speed2 * lap - ${HEIGHT_DECAY.toFixed(3)} * h * uDt) * uVelDamp;

          // soft sponge on the border so waves leave instead of bouncing back
          vec2 b = min(vUv, 1.0 - vUv);
          float sponge = mix(0.9, 1.0, smoothstep(0.0, 0.08, min(b.x, b.y)));
          float keep = sponge * wet;
          v *= keep;
          float hn = (h + v * uDt) * keep;

          // foam: gentle spread, fade, and fresh foam where wake crests break
          vec2 drift = (tn2.rb - 0.5) * t * 1.6;
          float fc = tap(uv + drift).r;
          float f = (fc * 0.6 + (e.r + w.r + n.r + s.r) * 0.1) * uFoamDecay;
          // only some stretches of a crest break into white
          f += smoothstep(0.08, 0.3, hn) * uFoamGain * smoothstep(0.3, 0.7, tn.b * 0.6 + tn2.g * 0.6);
          f = min(f, 3.0);

          gl_FragColor = vec4(f, hn, v, 0.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.simMat);
    quad.frustumCulled = false;
    this.simScene.add(quad);

    this.stampGeo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    this.stampGeo.index = base.index;
    this.stampGeo.setAttribute('position', base.getAttribute('position'));
    this.stampGeo.setAttribute('uv', base.getAttribute('uv'));
    this.stampData = new Float32Array(MAX_STAMPS * 4);
    this.stampKind = new Float32Array(MAX_STAMPS);
    this.stampGeo.setAttribute('aStamp', new THREE.InstancedBufferAttribute(this.stampData, 4).setUsage(THREE.DynamicDrawUsage));
    this.stampGeo.setAttribute('aKind', new THREE.InstancedBufferAttribute(this.stampKind, 1).setUsage(THREE.DynamicDrawUsage));
    const stampMat = new THREE.ShaderMaterial({
      uniforms: { uRect: this.uniforms.uWakeRect },
      vertexShader: /* glsl */ `
        attribute vec4 aStamp; attribute float aKind;
        uniform vec4 uRect;
        varying vec2 vUv; varying float vStrength; varying float vKind;
        void main(){
          vUv = uv * 2.0 - 1.0; vStrength = aStamp.w; vKind = aKind;
          vec2 w = aStamp.xy + position.xy * aStamp.z * 2.0;
          vec2 p = (w - uRect.xy) * uRect.w; // -0.5..0.5
          gl_Position = vec4(p * 2.0, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying float vStrength; varying float vKind;
        void main(){
          float d = length(vUv);
          float blob = 1.0 - smoothstep(0.0, 1.0, d);
          blob *= blob;
          float ring = smoothstep(0.62, 0.85, d) * (1.0 - smoothstep(0.85, 1.0, d));
          float v = (vKind > 0.5 && vKind < 1.5 ? ring : blob) * vStrength;
          // foam adds to R; splash craters (signed) to the height in G, hull pressure to the velocity in B
          gl_FragColor = vKind > 2.5 ? vec4(0.0, 0.0, v, 0.0) : vKind > 1.5 ? vec4(0.0, v, 0.0, 0.0) : vec4(v, 0.0, 0.0, 0.0);
        }`,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    const stamps = new THREE.Mesh(this.stampGeo, stampMat);
    stamps.frustumCulled = false;
    this.stampScene.add(stamps);
    this.uniforms.uWakeTex.value = this.rtA.texture;
  }

  /** Lets waves feel the sea floor: slower in shallows, stopped by land. */
  setTerrain(heightTex: THREE.Texture) {
    this.simMat.uniforms.uHeightTex.value = heightTex;
  }

  private add(x: number, z: number, radius: number, strength: number, kind: number) {
    if (this.stampCount >= MAX_STAMPS) return;
    const i = this.stampCount++;
    this.stampData[i * 4] = x;
    this.stampData[i * 4 + 1] = z;
    this.stampData[i * 4 + 2] = radius;
    this.stampData[i * 4 + 3] = strength;
    this.stampKind[i] = kind;
  }

  /** Paints foam (a soft blob, or a ring). */
  stamp(x: number, z: number, radius: number, strength: number, ring = false) {
    this.add(x, z, radius, strength, ring ? 1 : 0);
  }

  /** Displaces the water surface by `amount` metres at the centre: a splash crater, a sudden heave. */
  push(x: number, z: number, radius: number, amount: number) {
    this.add(x, z, radius, amount, 2);
  }

  /** Accelerates the surface: `amount` is force × dt in m/s, so a moving hull's pressure is frame-rate independent. */
  press(x: number, z: number, radius: number, amount: number) {
    this.add(x, z, radius, amount, 3);
  }

  update(renderer: THREE.WebGLRenderer, focusX: number, focusZ: number, dt: number) {
    const texel = this.size / this.res;
    // snap to texels so scrolling never smears the foam
    const cx = Math.round(focusX / texel) * texel;
    const cz = Math.round(focusZ / texel) * texel;
    const u = this.simMat.uniforms;
    u.uShift.value.set((cx - this.lastCenter.x) / this.size, (cz - this.lastCenter.y) / this.size);
    this.lastCenter.set(cx, cz);
    this.center.set(cx, cz);
    this.uniforms.uWakeRect.value.set(cx, cz, this.size, 1 / this.size);

    // the step is clamped so a hitch can't push the wave equation past its stability limit
    const h = Math.min(Math.max(dt, 1 / 480), 1 / 20);
    u.uDt.value = h;
    u.uK.value = (WAVE_SPEED / texel) ** 2 * h;
    u.uVelDamp.value = Math.exp(-VEL_DAMP * h);
    u.uFoamDecay.value = Math.pow(0.5, h / FOAM_HALF_LIFE);
    u.uFoamGain.value = h * 2.2;
    u.uPrev.value = this.rtA.texture;
    u.uSimTime.value += h;

    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.rtB);
    renderer.render(this.simScene, this.cam);
    if (this.stampCount > 0) {
      this.stampGeo.instanceCount = this.stampCount;
      (this.stampGeo.getAttribute('aStamp') as THREE.InstancedBufferAttribute).needsUpdate = true;
      (this.stampGeo.getAttribute('aKind') as THREE.InstancedBufferAttribute).needsUpdate = true;
      renderer.render(this.stampScene, this.cam);
    }
    renderer.setRenderTarget(null);
    renderer.autoClear = prevAutoClear;
    this.stampCount = 0;
    const t = this.rtA;
    this.rtA = this.rtB;
    this.rtB = t;
    this.uniforms.uWakeTex.value = this.rtA.texture;
  }
}
