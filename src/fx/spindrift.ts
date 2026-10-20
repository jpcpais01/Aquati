import * as THREE from 'three';
import { globalUniforms, GLSL_GUST } from '../render/environment';
import { GLSL_WAVES } from '../world/waves';

// Spindrift: in a blow the wind tears the tops off the breaking crests and
// flings them downwind as sheets of spray. One static buffer of sheets,
// animated entirely on the GPU like the rain: each sheet owns a slot in a
// world-locked tile around the view and, once per cycle, a fresh spot in it.
// It only bursts if the swell there was cresting the moment it was born
// (the same Gerstner waves the ocean draws), more readily under a gust, so
// the spray leaps off the caps you can see. Then it streams away down the
// wind, rising, spreading and fraying into streaks until it is gone.

export class Spindrift {
  readonly mesh: THREE.Mesh;
  private geo = new THREE.BufferGeometry();
  readonly uniforms = {
    uCenter: { value: new THREE.Vector3() },
    uBox: { value: 120 }, // half size of the tile (m)
    uAmount: { value: 0 },
    uSpeed: { value: 14 },
    uSceneDepth: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCamNearFar: { value: new THREE.Vector2(1, 1000) },
  };

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
        corner.set([k & 1 ? 1 : -1, k & 2 ? 1 : -1], (i * 4 + k) * 2);
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
        uWaveA: waves.uWaveA,
        uWaveB: waves.uWaveB,
        uTime: g.uTime,
        uLight: g.uLight,
        uSunColor: g.uSunColor,
        uFlash: g.uFlash,
        uFogColor: g.uFogColor,
        uFogRange: g.uFogRange,
        uNoiseTex: g.uNoiseTex,
        uWind: g.uWind,
        uWindDrift: g.uWindDrift,
        uWindPivot: g.uWindPivot,
        uGusts: g.uGusts,
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      premultipliedAlpha: true,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        uniform vec3 uCenter; uniform float uBox; uniform float uAmount; uniform float uSpeed; uniform float uTime;
        ${GLSL_GUST}
        ${GLSL_WAVES}
        attribute vec4 aSeed; attribute vec2 aCorner;
        varying vec3 vR; varying float vA; varying float vSeed; varying float vViewZ;
        void main() {
          float B = uBox * 2.0;
          float cyc = 2.2 + aSeed.w * 1.5;
          float t = uTime + aSeed.z * cyc;
          float k = fract(t / cyc);
          float n = floor(t / cyc);
          vec2 p0 = fract(aSeed.xy + vec2(0.6180339, 0.4142135) * n) * B;
          vec2 rel = mod(p0 - uCenter.xz + B * 0.5, B) - B * 0.5;
          vec2 birth = uCenter.xz + rel;
          // was the sea cresting here when this sheet was born?
          vec3 nrm; float crest;
          float camD = length(cameraPosition.xz - birth);
          vec3 o = gerstner(birth, uTime - k * cyc, 1.0, camD, nrm, crest);
          float gust = gustAt(birth);
          float str = smoothstep(0.14 - gust * 0.1, 0.4, crest + (aSeed.y - 0.5) * 0.2) * uAmount * (0.75 + gust * 0.5);
          vec2 e = abs(rel) / uBox;
          str *= 1.0 - smoothstep(0.7, 1.0, max(e.x, e.y));
          if (str < 0.01) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
          }
          vec2 wd = uWind.xy;
          // it leaps off the crest, then the wind takes it: fast at first, slowing as it spreads
          float sp = uSpeed * (0.75 + aSeed.x * 0.5);
          float run = sp * cyc * k * (1.0 - 0.4 * k);
          vec2 c = birth + o.xz + wd * run;
          float lift = (1.2 + aSeed.y * 1.6) * sin(3.14159 * min(k * 1.6, 1.0)) * (1.0 - 0.45 * k);
          vec3 ctr = vec3(c.x, max(o.y, 0.0) + 0.4 + lift, c.y);
          float L = mix(2.0, 11.0 + aSeed.w * 8.0, sqrt(k));
          float W = mix(0.9, 3.4 + aSeed.x * 2.2, k);
          vec3 ax = vec3(wd.x, 0.0, wd.y);
          // a ribbon along the wind, turned to face the eye about that axis
          vec3 side = cross(ax, normalize(cameraPosition - ctr));
          side = dot(side, side) > 1e-6 ? normalize(side) : vec3(-wd.y, 0.0, wd.x);
          vec3 p = ctr + ax * aCorner.x * L * 0.5 + side * aCorner.y * W * 0.5;
          vR = vec3(aCorner, k);
          vSeed = aSeed.z;
          vA = str * smoothstep(0.0, 0.1, k) * (1.0 - smoothstep(0.35, 1.0, k));
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vViewZ = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uSceneDepth; uniform vec2 uResolution; uniform vec2 uCamNearFar;
        uniform sampler2D uNoiseTex;
        uniform vec3 uLight; uniform vec3 uSunColor; uniform float uFlash;
        uniform vec3 uFogColor; uniform vec2 uFogRange;
        varying vec3 vR; varying float vA; varying float vSeed; varying float vViewZ;
        float linearDepth(float d) { float n = uCamNearFar.x, f = uCamNearFar.y; return (n * f) / (f - d * (f - n)); }
        void main() {
          float k = vR.z;
          // a soft spindle, its head (downwind end) densest
          float x = vR.x;
          float y = vR.y;
          float body = (1.0 - y * y) * smoothstep(1.0, 0.55, abs(x)) * (0.55 + 0.45 * smoothstep(-1.0, 0.6, x));
          // torn into streaks along the wind, fraying as it ages
          vec2 nu = vec2(x * 0.3 - k * 0.25 + vSeed * 7.13, y * 0.75 + vSeed * 3.71);
          float n1 = texture(uNoiseTex, nu).g;
          float n2 = texture(uNoiseTex, nu * vec2(1.7, 2.2) + 0.37).a;
          float dens = body * (n1 * 0.65 + n2 * 0.55) - (0.3 + k * 0.26);
          float a = smoothstep(0.0, 0.38, dens) * vA;
          vec2 suv = gl_FragCoord.xy / uResolution;
          float sz = linearDepth(texture(uSceneDepth, suv).r);
          a *= clamp((sz - vViewZ) * 0.5, 0.0, 1.0);
          if (a < 0.003) discard;
          vec3 col = vec3(0.9, 0.95, 1.0) * (uLight * 0.95 + 0.03) + uSunColor * 0.04 + vec3(0.6, 0.66, 0.9) * uFlash;
          col = mix(col, uFogColor, smoothstep(uFogRange.x, uFogRange.y, vViewZ) * 0.7);
          a *= 0.85;
          gl_FragColor = vec4(col * a, a);
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 13;
    this.mesh.visible = false;
  }

  /** amount: 0 none .. 1 a full gale. */
  update(amount: number, cx: number, cz: number, camDist: number, wind: number) {
    const on = amount > 0.01;
    this.mesh.visible = on;
    this.geo.setDrawRange(0, on ? Math.ceil(this.count * Math.min(1, amount * 1.4)) * 6 : 0);
    const u = this.uniforms;
    u.uAmount.value = Math.min(1, amount);
    u.uCenter.value.set(cx, 0, cz);
    u.uBox.value = THREE.MathUtils.clamp(camDist * 0.8, 50, 230);
    u.uSpeed.value = 8 + wind * 7;
  }

  setScene(depth: THREE.Texture, w: number, h: number, cam: THREE.PerspectiveCamera) {
    this.uniforms.uSceneDepth.value = depth;
    this.uniforms.uResolution.value.set(w, h);
    this.uniforms.uCamNearFar.value.set(cam.near, cam.far);
  }
}
