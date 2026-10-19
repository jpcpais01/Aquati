import * as THREE from 'three';
import { globalUniforms } from '../render/environment';

// Rain as one static buffer of streak quads, animated entirely on the GPU.
// Each drop has a fixed random slot in a world-locked tile that wraps around
// the camera target, so drops stay put in the world while you sail through
// them. It falls, slants with the wind and is stretched into a streak along
// its velocity; drops are hidden by hulls and islands through the opaque
// depth buffer and by the sea through the water pass's own depth. Heavier
// rain just draws more of the buffer, so a drizzle costs a fraction of a storm.

export class Rain {
  readonly mesh: THREE.Mesh;
  private geo = new THREE.BufferGeometry();
  readonly uniforms = {
    uCenter: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector2(120, 80) }, // half size, height
    uFall: { value: new THREE.Vector3() }, // wind drift (m/s); the fall itself is set by the box
    uScale: { value: 1 },
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
      const s = [Math.random(), Math.random(), Math.random(), Math.random()];
      for (let k = 0; k < 4; k++) {
        seeds.set(s, (i * 4 + k) * 4);
        corner.set([k & 1 ? 1 : -1, k >> 1], (i * 4 + k) * 2);
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
      uniforms: { ...this.uniforms, uTime: g.uTime, uLight: g.uLight, uFlash: g.uFlash, uFogColor: g.uFogColor, uFogRange: g.uFogRange },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      premultipliedAlpha: true,
      vertexShader: /* glsl */ `
        uniform vec3 uCenter; uniform vec2 uBox; uniform vec3 uFall; uniform float uScale; uniform float uTime;
        attribute vec4 aSeed; attribute vec2 aCorner;
        varying float vA; varying float vAcross; varying float vViewZ;
        void main() {
          float B = uBox.x * 2.0;
          float H = uBox.y;
          // a fixed fall time keeps every drop's phase steady while the box
          // grows and shrinks with the zoom; on screen the speed looks the same
          float cyc = 1.45 + aSeed.w * 0.4;
          float t = uTime + aSeed.z * cyc;
          float k = fract(t / cyc);              // 0 top .. 1 sea
          float n = floor(t / cyc);
          vec2 drift = uFall.xz * k * cyc;
          // world-locked tile of drops wrapped around the view; a fresh slot every fall
          vec2 p0 = fract(aSeed.xy + vec2(0.6180339, 0.4142135) * n) * B + drift;
          vec2 rel = mod(p0 - uCenter.xz + B * 0.5, B) - B * 0.5;
          vec3 head = vec3(uCenter.x + rel.x, H * (1.0 - k), uCenter.z + rel.y);
          vec3 vel = vec3(uFall.x, -H / cyc, uFall.z);
          vec3 dir = normalize(vel);
          float dist = length(cameraPosition - head);
          float len = (0.9 + aSeed.w * 0.7) * max(1.0, dist * 0.012) * uScale;
          vec3 p = head - dir * len * aCorner.y;
          vec3 side = normalize(cross(dir, cameraPosition - p));
          p += side * aCorner.x * max(0.025, dist * 0.0011);
          // thin out at the edges of the tile and right under the cloud base
          vec2 e = abs(rel) / (B * 0.5);
          float edge = 1.0 - smoothstep(0.7, 1.0, max(e.x, e.y));
          vA = edge * smoothstep(0.0, 0.08, k) * (0.55 + aSeed.w * 0.45);
          vAcross = aCorner.x;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vViewZ = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uSceneDepth; uniform vec2 uResolution; uniform vec2 uCamNearFar;
        uniform vec3 uLight; uniform float uFlash; uniform float uAmount;
        uniform vec3 uFogColor; uniform vec2 uFogRange;
        varying float vA; varying float vAcross; varying float vViewZ;
        float linearDepth(float d) { float n = uCamNearFar.x, f = uCamNearFar.y; return (n * f) / (f - d * (f - n)); }
        void main() {
          float a = vA * (1.0 - vAcross * vAcross) * (0.22 + 0.14 * uAmount);
          vec2 suv = gl_FragCoord.xy / uResolution;
          float sz = linearDepth(texture(uSceneDepth, suv).r);
          a *= clamp((sz - vViewZ) * 0.5, 0.0, 1.0);
          if (a < 0.003) discard;
          // lit by the sky: pale grey by day, near-invisible at night until lightning
          vec3 col = vec3(0.78, 0.84, 0.92) * (uLight * 0.9 + 0.04) + vec3(0.9, 0.95, 1.1) * uFlash * 1.6;
          col = mix(col, uFogColor, smoothstep(uFogRange.x, uFogRange.y, vViewZ) * 0.7);
          gl_FragColor = vec4(col * a, a);
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 14;
    this.mesh.visible = false;
  }

  update(amount: number, cx: number, cz: number, camDist: number, windX: number, windZ: number, wind: number) {
    const n = Math.floor(this.count * Math.min(1, amount * 1.1));
    this.mesh.visible = n > 0;
    this.geo.setDrawRange(0, n * 6);
    const u = this.uniforms;
    u.uAmount.value = amount;
    u.uCenter.value.set(cx, 0, cz);
    u.uBox.value.set(THREE.MathUtils.clamp(camDist * 0.8, 50, 230), THREE.MathUtils.clamp(camDist * 0.45, 30, 110));
    const slant = 3 + wind * 7;
    u.uFall.value.set(windX * slant, 0, windZ * slant);
    u.uScale.value = 1 + amount * 0.4;
  }

  setScene(depth: THREE.Texture, w: number, h: number, cam: THREE.PerspectiveCamera) {
    this.uniforms.uSceneDepth.value = depth;
    this.uniforms.uResolution.value.set(w, h);
    this.uniforms.uCamNearFar.value.set(cam.near, cam.far);
  }
}
