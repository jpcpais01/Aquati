import * as THREE from 'three';
import { globalUniforms, GLSL_VEIL_PATCH } from '../render/environment';
import { GLSL_WAVES } from '../world/waves';
import { GLSL_ZOOM_BOX, ZoomBox } from './zoomBox';

// Rain as one static buffer of drop quads, animated entirely on the GPU.
// Each drop has a fixed random slot in a world-locked tile that wraps around
// the camera target, so drops stay put in the world while you sail through
// them. It falls, slants with the wind and is drawn out into a fine streak
// along its velocity (about what a camera's shutter would smear); most drops
// then burst on the swell into a little ring and crown of spray, riding the
// very waves the ocean draws. The drops gather into the same drifting
// curtains as the rain haze (veilPatch), so showers sweep across the sea in
// sheets instead of hanging as an even hatching. Drops are hidden by hulls
// and islands through the opaque depth buffer and by the sea through the
// water pass's own depth. Heavier rain just draws more of the buffer, so a
// drizzle costs a fraction of a storm.

/** Share of each drop's cycle spent falling; the rest is its splash. */
const FALL = 0.86;

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
  /** The tile resizes only between drops' lives (cycles run up to 1.85 s). */
  private zoomBox = new ZoomBox(1.9);
  private wantBox = new THREE.Vector2();

  constructor(
    private count: number,
    waves: { uWaveA: THREE.IUniform; uWaveB: THREE.IUniform },
  ) {
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
      uniforms: {
        ...this.uniforms,
        uBoxPrev: this.zoomBox.uBoxPrev,
        uBoxAt: this.zoomBox.uBoxAt,
        uWaveA: waves.uWaveA,
        uWaveB: waves.uWaveB,
        uTime: g.uTime,
        uLight: g.uLight,
        uFlash: g.uFlash,
        uFogColor: g.uFogColor,
        uFogRange: g.uFogRange,
        uNoiseTex: g.uNoiseTex,
        uWindDrift: g.uWindDrift,
        uVeil: g.uVeil,
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      premultipliedAlpha: true,
      // the quads face whichever way the maths turns them: draw both sides
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        uniform vec3 uCenter; uniform vec2 uBox; uniform vec3 uFall; uniform float uScale; uniform float uTime;
        uniform float uAmount;
        uniform sampler2D uNoiseTex; uniform vec2 uWindDrift; uniform vec4 uVeil;
        ${GLSL_VEIL_PATCH}
        ${GLSL_WAVES}
        ${GLSL_ZOOM_BOX}
        attribute vec4 aSeed; attribute vec2 aCorner;
        varying vec3 vR; varying float vA; varying float vViewZ;
        void main() {
          // a fixed cycle keeps every drop's phase steady while the box grows
          // and shrinks with the zoom; on screen the speed looks the same
          float cyc = 1.45 + aSeed.w * 0.4;
          float t = uTime + aSeed.z * cyc;
          float k = fract(t / cyc);
          float n = floor(t / cyc);
          // ...and each drop keeps the box it was born in, so a zoom never moves it mid-fall
          vec2 box = bornBox(uBox, n, cyc, aSeed.z);
          float B = box.x * 2.0;
          float H = box.y;
          float kf = min(k / ${FALL.toFixed(2)}, 1.0); // 0 cloud base .. 1 the sea
          vec2 drift = uFall.xz * kf * cyc * ${FALL.toFixed(2)};
          // world-locked tile of drops wrapped around the view; a fresh slot every fall
          vec2 p0 = fract(aSeed.xy + vec2(0.6180339, 0.4142135) * n) * B + drift;
          vec2 rel = mod(p0 - uCenter.xz + B * 0.5, B) - B * 0.5;
          vec2 xz = uCenter.xz + rel;
          // thin out at the edges of the tile; gather into the drifting curtains
          vec2 e = abs(rel) / (B * 0.5);
          float edge = 1.0 - smoothstep(0.7, 1.0, max(e.x, e.y));
          float curtain = smoothstep(0.25, 1.35, veilPatch(xz));
          vec3 p;
          if (k < ${FALL.toFixed(2)}) {
            vec3 head = vec3(xz.x, H * (1.0 - kf), xz.y);
            vec3 vel = vec3(uFall.x, -H / (cyc * ${FALL.toFixed(2)}), uFall.z);
            float speed = length(vel);
            vec3 dir = vel / speed;
            float dist = length(cameraPosition - head);
            // the smear of a fast shutter, never shorter than a few pixels
            float len = max(speed * 0.03, dist * 0.005) * (0.8 + aSeed.w * 0.5) * uScale;
            p = head - dir * len * aCorner.y;
            // (straight down the view a drop is end-on: any side will do)
            vec3 side = cross(dir, normalize(cameraPosition - p));
            side = dot(side, side) > 1e-6 ? normalize(side) : vec3(1.0, 0.0, 0.0);
            p += side * aCorner.x * max(0.016, dist * 0.0009);
            vR = vec3(aCorner.x, aCorner.y, -1.0);
            vA = edge * smoothstep(0.0, 0.08, kf) * (0.5 + aSeed.w * 0.5) * curtain;
          } else {
            // the splash: a ring and a crown of droplets thrown up off the swell
            // (not every drop: rain falls into the troughs and the foam too)
            float s = (k - ${FALL.toFixed(2)}) / ${(1 - FALL).toFixed(2)};
            vec3 nrm; float crest;
            float dist0 = length(cameraPosition.xz - xz);
            vec3 o = gerstner(xz, uTime, 1.0, dist0, nrm, crest);
            vec3 c = vec3(xz.x + o.x, o.y + 0.12, xz.y + o.z);
            float dist = length(cameraPosition - c);
            float r = (0.18 + 0.45 * s) * (0.7 + aSeed.x * 0.6) * max(1.0, dist * 0.0052) * uScale;
            // laid flat on the water, as the ring is
            vec2 q = vec2(aCorner.x, aCorner.y * 2.0 - 1.0);
            p = c + vec3(q.x, 0.0, q.y) * r;
            vR = vec3(q, s);
            vA = edge * step(0.42, aSeed.y) * curtain * (0.6 + 0.4 * uAmount);
          }
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vViewZ = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uSceneDepth; uniform vec2 uResolution; uniform vec2 uCamNearFar;
        uniform vec3 uLight; uniform float uFlash; uniform float uAmount;
        uniform vec3 uFogColor; uniform vec2 uFogRange;
        varying vec3 vR; varying float vA; varying float vViewZ;
        float linearDepth(float d) { float n = uCamNearFar.x, f = uCamNearFar.y; return (n * f) / (f - d * (f - n)); }
        void main() {
          float a;
          vec3 col;
          // lit by the sky: pale silver by day, near-invisible at night until lightning
          vec3 lit = uLight * 0.9 + 0.04 + vec3(0.9, 0.95, 1.1) * uFlash * 1.6;
          if (vR.z < 0.0) {
            // a fine streak, brightest just behind the drop
            float x = vR.x;
            a = vA * (1.0 - x * x) * (0.5 + 0.5 * (1.0 - vR.y)) * (0.22 + 0.12 * uAmount);
            col = vec3(0.8, 0.86, 0.94) * lit;
          } else {
            // the ring spreads and thins; the crown is a few bright flecks at the start
            float s = vR.z;
            float r = length(vR.xy);
            float ring = exp(-pow((r - (0.3 + 0.62 * s)) / (0.09 + 0.06 * s), 2.0));
            float crown = smoothstep(0.42, 0.0, r) * smoothstep(0.45, 0.0, s);
            a = vA * (ring * 0.4 + crown * 0.9) * (1.0 - s) * (1.0 - s);
            col = vec3(0.92, 0.96, 1.0) * lit;
          }
          vec2 suv = gl_FragCoord.xy / uResolution;
          float sz = linearDepth(texture(uSceneDepth, suv).r);
          a *= clamp((sz - vViewZ) * 0.5, 0.0, 1.0);
          if (a < 0.003) discard;
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
    // tall enough that the nearest drops stream right past the lens
    this.wantBox.set(THREE.MathUtils.clamp(camDist * 0.8, 50, 230), THREE.MathUtils.clamp(camDist * 0.62, 30, 160));
    this.zoomBox.update(u.uBox.value, this.wantBox, globalUniforms.uTime.value);
    const slant = 3 + wind * 7;
    u.uFall.value.set(windX * slant, 0, windZ * slant);
    u.uScale.value = 1 + amount * 0.3;
  }

  setScene(depth: THREE.Texture, w: number, h: number, cam: THREE.PerspectiveCamera) {
    this.uniforms.uSceneDepth.value = depth;
    this.uniforms.uResolution.value.set(w, h);
    this.uniforms.uCamNearFar.value.set(cam.near, cam.far);
  }
}
