import * as THREE from 'three';
import { globalUniforms, GLSL_VEIL_PATCH } from '../render/environment';

// Ember rain: one static buffer of quads, animated entirely on the GPU, like
// the rain. Most are flakes of grey ash, tumbling and fluttering down so they
// wink as they turn edge-on; about one in four is an ember still alight,
// glowing orange-gold and flickering, cooling to a dull red as it sinks and
// going out before it meets the sea. Every one has a fixed slot in a
// world-locked tile wrapped round the view and drifts on with the wind's own
// run (uWindDrift), so the fall never jumps when the wind changes. They gather
// in the same drifting banks as the ash haze (veilPatch). More ash in the air
// just draws more of the buffer.

const HALF = 140; // half the tile's width (m)
const HEIGHT = 58;

export class Embers {
  readonly mesh: THREE.Mesh;
  private geo = new THREE.BufferGeometry();
  readonly uniforms = {
    uCenter: { value: new THREE.Vector3() },
    uAmount: { value: 0 },
    uSceneDepth: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCamNearFar: { value: new THREE.Vector2(1, 1000) },
  };

  constructor(private count: number) {
    const seeds = new Float32Array(count * 4 * 4);
    const corner = new Float32Array(count * 4 * 2);
    const idx = new Uint32Array(count * 6);
    for (let i = 0; i < count; i++) {
      // embers spread evenly through the buffer, so a light fall still has a few
      const s = [Math.random(), (i * 0.618034) % 1, Math.random(), Math.random()];
      for (let k = 0; k < 4; k++) {
        seeds.set(s, (i * 4 + k) * 4);
        corner.set([k & 1 ? 1 : -1, k >> 1 ? 1 : -1], (i * 4 + k) * 2);
      }
      const o = i * 4;
      idx.set([o, o + 1, o + 2, o + 1, o + 3, o + 2], i * 6);
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 4 * 3), 3));
    this.geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    this.geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo.setDrawRange(0, 0);
    const g = globalUniforms;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        ...this.uniforms,
        uTime: g.uTime,
        uLight: g.uLight,
        uNight: g.uNight,
        uFogColor: g.uFogColor,
        uFogRange: g.uFogRange,
        uNoiseTex: g.uNoiseTex,
        uWindDrift: g.uWindDrift,
        uWind: g.uWind,
        uVeil: g.uVeil,
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      premultipliedAlpha: true,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        uniform vec3 uCenter; uniform float uTime; uniform float uAmount;
        uniform sampler2D uNoiseTex; uniform vec2 uWindDrift; uniform vec3 uWind; uniform vec4 uVeil;
        ${GLSL_VEIL_PATCH}
        attribute vec4 aSeed; attribute vec2 aCorner;
        varying vec3 vC; varying float vA; varying float vViewZ;
        void main() {
          float ember = step(aSeed.y, 0.26);
          // ash drifts down slowly; a live ember, a little heavier, quicker
          float speed = mix(1.3 + aSeed.w * 0.9, 2.2 + aSeed.w * 0.8, ember);
          float cyc = ${HEIGHT.toFixed(1)} / speed;
          float t = uTime + aSeed.z * cyc;
          float k = fract(t / cyc);
          float n = floor(t / cyc);
          float B = ${(HALF * 2).toFixed(1)};
          // carried along on the wind's own run, and fluttering about it
          vec2 run = uWindDrift * (1.6 + uWind.z * 1.4);
          float ph = aSeed.x * 37.0 + aSeed.z * 11.0;
          vec2 flutter = vec2(sin(t * 0.9 + ph), cos(t * 0.7 + ph * 1.3)) * (1.2 - ember * 0.6);
          vec2 p0 = fract(aSeed.xy * vec2(1.0, 7.31) + vec2(0.6180339, 0.4142135) * n) * B + run + flutter;
          vec2 rel = mod(p0 - uCenter.xz + B * 0.5, B) - B * 0.5;
          vec2 xz = uCenter.xz + rel;
          vec2 e = abs(rel) / (B * 0.5);
          float edge = 1.0 - smoothstep(0.65, 1.0, max(e.x, e.y));
          float bank = smoothstep(0.15, 1.2, veilPatch(xz)) * 0.75 + 0.25;
          vec3 c = vec3(xz.x, ${HEIGHT.toFixed(1)} * (1.0 - k) + sin(t * 1.3 + ph) * 0.4, xz.y);
          float dist = length(cameraPosition - c);
          // never smaller than a pixel or so, however far the view pulls out
          float size = mix(0.09 + aSeed.x * 0.08, 0.07, ember);
          size = max(size, dist * mix(0.0011, 0.0016, ember));
          vec3 toCam = normalize(cameraPosition - c);
          vec3 side = normalize(cross(toCam, abs(toCam.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
          vec3 up = cross(side, toCam);
          // a flake turns as it falls: it narrows edge-on, and winks
          float turn = ember > 0.5 ? 1.0 : abs(sin(t * (1.6 + aSeed.w * 2.0) + ph));
          vec3 p = c + (side * aCorner.x * (0.35 + 0.65 * turn) + up * aCorner.y) * size * mix(1.0, 2.6, ember);
          vC = vec3(aCorner, ember);
          // the ember cools as it sinks: bright gold high up, a dull red low down
          float heat = ember * (1.0 - smoothstep(0.55, 0.92, k)) * (0.65 + 0.35 * sin(t * (9.0 + aSeed.w * 7.0) + ph));
          vA = edge * bank * smoothstep(0.0, 0.05, k) * (1.0 - smoothstep(0.93, 1.0, k)) * mix(0.35 + 0.4 * turn, heat, ember);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vViewZ = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uSceneDepth; uniform vec2 uResolution; uniform vec2 uCamNearFar;
        uniform vec3 uLight; uniform float uNight; uniform float uAmount;
        uniform vec3 uFogColor; uniform vec2 uFogRange;
        varying vec3 vC; varying float vA; varying float vViewZ;
        float linearDepth(float d) { float n = uCamNearFar.x, f = uCamNearFar.y; return (n * f) / (f - d * (f - n)); }
        void main() {
          float r = length(vC.xy);
          float a;
          vec3 col;
          if (vC.z > 0.5) {
            // a hot core in a soft halo; it lights itself
            float core = smoothstep(0.42, 0.0, r);
            float halo = exp(-r * r * 5.0) * 0.5;
            a = (core + halo) * vA;
            col = mix(vec3(2.6, 0.55, 0.08), vec3(5.0, 2.6, 0.7), core) * (1.0 + uNight * 0.6);
            a *= 0.55;
            // glow: barely any cover, all light
            vec2 suv = gl_FragCoord.xy / uResolution;
            a *= clamp((linearDepth(texture(uSceneDepth, suv).r) - vViewZ) * 0.5, 0.0, 1.0);
            if (a < 0.003) discard;
            gl_FragColor = vec4(col * a, a * 0.15);
            return;
          }
          // a flake of ash: soft-edged and a little ragged, lit by the sky
          a = smoothstep(1.0, 0.45, r + sin(atan(vC.y, vC.x) * 3.0 + vA * 9.0) * 0.12) * vA * 0.8;
          col = vec3(0.34, 0.32, 0.3) * (uLight * 0.85 + 0.05);
          vec2 suv = gl_FragCoord.xy / uResolution;
          a *= clamp((linearDepth(texture(uSceneDepth, suv).r) - vViewZ) * 0.5, 0.0, 1.0);
          if (a < 0.003) discard;
          col = mix(col, uFogColor, smoothstep(uFogRange.x, uFogRange.y, vViewZ) * 0.6);
          gl_FragColor = vec4(col * a, a);
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 14;
    this.mesh.visible = false;
  }

  update(amount: number, cx: number, cz: number) {
    const n = Math.floor(this.count * Math.min(1, amount * 1.15));
    this.mesh.visible = n > 0;
    this.geo.setDrawRange(0, n * 6);
    this.uniforms.uAmount.value = amount;
    this.uniforms.uCenter.value.set(cx, 0, cz);
  }

  setScene(depth: THREE.Texture, w: number, h: number, cam: THREE.PerspectiveCamera) {
    this.uniforms.uSceneDepth.value = depth;
    this.uniforms.uResolution.value.set(w, h);
    this.uniforms.uCamNearFar.value.set(cam.near, cam.far);
  }
}
