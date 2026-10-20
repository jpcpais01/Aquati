import * as THREE from 'three';
import type { Profiler } from '../core/profiler';
import { GLSL_SS_APPLY, ScreenSpaceLighting, TraceConfig } from './screenSpace';
import { getSharedTextures } from './textures';

// Frame graph:
//   1. opaque scene  -> rtOpaque (HDR colour + depth texture, MSAA)
//   2. screen-space ray tracing over rtOpaque -> AO, bounce light, contact
//      shadows (half res, see screenSpace.ts), lit into the opaque colour below
//   3. ocean reflections -> rtRefl (half res: each water pixel marches its
//      reflected ray through rtOpaque's depth, see ocean.ts)
//   4. water + fx    -> rtWater  (premultiplied HDR over transparent, own depth)
//      (the ocean reads rtOpaque colour/depth for refraction and thickness,
//      and rtRefl for the traced reflections)
//   5. combine at half res -> dual-filter bloom chain
//   6. final: combine + traced light + adaptive sharpen + bloom + edge tilt-shift + grade + ACES -> screen

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function fsMaterial(frag: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
}

export interface PipelineSettings {
  msaa: number;
  bloomLevels: number;
  tiltShift: boolean;
}

/** Photo mode's look, fed straight into the final pass. */
export interface PhotoLook {
  saturation: number;
  contrast: number;
  fade: number;
  grain: number;
  vignette: number;
  tint: [number, number, number];
  mono: [number, number, number];
  monoAmount: number;
  /** View depth (m) held sharp, and how fast the blur grows away from it (0 = no depth of field). */
  focus: number;
  aperture: number;
  /** Sea level, standing in for the water's missing depth. */
  waterY: number;
}

const SS_UNIFORMS = () => ({
  uSSA: { value: null as THREE.Texture | null },
  uSSB: { value: null as THREE.Texture | null },
  uSSTexel: { value: new THREE.Vector2() },
  uSSStrength: { value: new THREE.Vector3(1, 0.9, 0.62) },
  uShadowTint: { value: new THREE.Vector3(0.3, 0.38, 0.52) },
  uSceneDepth: { value: null as THREE.Texture | null },
  uSSNearFar: { value: new THREE.Vector2(1, 1000) },
});

export class Pipeline {
  rtOpaque!: THREE.WebGLRenderTarget;
  rtWater!: THREE.WebGLRenderTarget;
  /** Half-resolution traced ocean reflections (premultiplied). */
  rtRefl!: THREE.WebGLRenderTarget;
  /** The ocean's reflection pass this frame, or null when reflections are off. */
  refl: THREE.Scene | null = null;
  /** Called before the reflection pass with the ray-tracing pass's half-res depth, or null when it didn't run. */
  onRefl: ((halfDepth: THREE.Texture | null) => void) | null = null;
  private rtHalf!: THREE.WebGLRenderTarget;
  private bloomRTs: THREE.WebGLRenderTarget[] = [];
  private quad: THREE.Mesh;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private combineMat: THREE.ShaderMaterial;
  private downMat: THREE.ShaderMaterial;
  private upMat: THREE.ShaderMaterial;
  private finalMat: THREE.ShaderMaterial;
  width = 1;
  height = 1;
  readonly settings: PipelineSettings;
  exposure = 1.0;
  /** Screen-space ray tracing (AO, bounce light, contact shadows). */
  readonly ss = new ScreenSpaceLighting();
  private ssOn = false;
  sun: THREE.DirectionalLight | null = null;
  sunDir = new THREE.Vector3(0, 1, 0);
  /** Times each pass when the frame profiler is open. */
  prof: Profiler | null = null;

  constructor(private renderer: THREE.WebGLRenderer, settings: PipelineSettings) {
    this.settings = settings;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    this.combineMat = fsMaterial(
      /* glsl */ `
      uniform sampler2D uOpaque; uniform sampler2D uWater; uniform vec2 uTexel;
      varying vec2 vUv;
      #if SS
      ${GLSL_SS_APPLY}
      #endif
      void main() {
        // 4-tap box at half res (each tap bilinear over 2x2)
        vec2 o = uTexel * 0.5;
        vec2 t0 = vUv + vec2(-o.x, -o.y), t1 = vUv + vec2(o.x, -o.y), t2 = vUv + vec2(-o.x, o.y), t3 = vUv + vec2(o.x, o.y);
        vec3 op = (texture2D(uOpaque, t0).rgb + texture2D(uOpaque, t1).rgb + texture2D(uOpaque, t2).rgb + texture2D(uOpaque, t3).rgb) * 0.25;
        vec4 w = (texture2D(uWater, t0) + texture2D(uWater, t1) + texture2D(uWater, t2) + texture2D(uWater, t3)) * 0.25;
        #if SS
          // bloom only needs the gist: light the averaged opaque colour once
          if (w.a < 0.999) op = applySS(op, vUv);
        #endif
        vec3 c = op * (1.0 - w.a) + w.rgb;
        // scrub NaN/Inf so one bad pixel can't get smeared into a black block by the bloom chain
        c = (c.r + c.g + c.b) < 1e4 ? max(c, 0.0) : vec3(0.0);
        gl_FragColor = vec4(c, 1.0);
      }`,
      { uOpaque: { value: null }, uWater: { value: null }, uTexel: { value: new THREE.Vector2() }, ...SS_UNIFORMS() },
    );
    this.combineMat.defines.SS = 0;

    this.downMat = fsMaterial(
      /* glsl */ `
      uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uThreshold; uniform float uFirst;
      varying vec2 vUv;
      vec3 pre(vec3 c) {
        if (uFirst < 0.5) return c;
        float br = max(c.r, max(c.g, c.b));
        float soft = clamp(br - uThreshold + 0.5, 0.0, 1.0);
        soft = soft * soft * 0.5;
        float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
        return c * contrib;
      }
      void main() {
        vec2 o = uTexel;
        vec3 c = texture2D(uSrc, vUv).rgb * 4.0;
        c += texture2D(uSrc, vUv + vec2(-o.x, -o.y)).rgb;
        c += texture2D(uSrc, vUv + vec2(o.x, -o.y)).rgb;
        c += texture2D(uSrc, vUv + vec2(-o.x, o.y)).rgb;
        c += texture2D(uSrc, vUv + vec2(o.x, o.y)).rgb;
        gl_FragColor = vec4(pre(c / 8.0), 1.0);
      }`,
      { uSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.25 }, uFirst: { value: 0 } },
    );

    this.upMat = fsMaterial(
      /* glsl */ `
      uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uWeight;
      varying vec2 vUv;
      void main() {
        vec2 o = uTexel;
        vec3 c = texture2D(uSrc, vUv + vec2(-o.x * 2.0, 0.0)).rgb;
        c += texture2D(uSrc, vUv + vec2(-o.x, o.y)).rgb * 2.0;
        c += texture2D(uSrc, vUv + vec2(0.0, o.y * 2.0)).rgb;
        c += texture2D(uSrc, vUv + vec2(o.x, o.y)).rgb * 2.0;
        c += texture2D(uSrc, vUv + vec2(o.x * 2.0, 0.0)).rgb;
        c += texture2D(uSrc, vUv + vec2(o.x, -o.y)).rgb * 2.0;
        c += texture2D(uSrc, vUv + vec2(0.0, -o.y * 2.0)).rgb;
        c += texture2D(uSrc, vUv + vec2(-o.x, -o.y)).rgb * 2.0;
        gl_FragColor = vec4(c / 12.0 * uWeight, 1.0);
      }`,
      { uSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uWeight: { value: 1 } },
    );
    this.upMat.blending = THREE.AdditiveBlending;
    this.upMat.transparent = true;

    this.finalMat = fsMaterial(
      /* glsl */ `
      uniform sampler2D uOpaque; uniform sampler2D uWater; uniform sampler2D uHalf; uniform sampler2D uBloom;
      uniform vec2 uHalfTexel; uniform float uExposure; uniform float uBloomStrength; uniform float uTilt;
      uniform float uTime; uniform float uVignette; uniform float uFlash; uniform vec3 uFlashColor; uniform float uLightning;
      uniform vec2 uTexel; uniform float uSharpen; uniform float uDepth; uniform float uDesat;
      // photo mode: depth of field and a film look, uniforms only (see PhotoLook)
      uniform float uPhoto; uniform vec4 uPGrade; uniform vec3 uPTint; uniform vec4 uPMono; uniform float uPVig;
      uniform vec4 uDof; uniform sampler2D uDofDepth; uniform vec2 uDofNearFar; uniform mat4 uInvProj; uniform mat3 uCamRot; uniform float uCamY;
      // beneath the waves: the eye (xyz) and the surface over it (w), the sun's light bent down through it, its colour
      uniform vec4 uEye; uniform vec3 uSunRay; uniform vec3 uShaftColor; uniform sampler2D uCausticTex;
      varying vec2 vUv;
      #if SS
      ${GLSL_SS_APPLY}
      #endif

      vec3 aces(vec3 x) {
        // Narkowicz fit, slightly toe-lifted for a soft, bright palette
        const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
        return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
      }
      vec3 toSRGB(vec3 c) {
        return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
      }
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

      vec3 comb(vec2 uv) {
        vec4 w = texture2D(uWater, uv);
        return texture2D(uOpaque, uv).rgb * (1.0 - w.a) + w.rgb;
      }

      void main() {
        // beneath the waves the whole picture swims
        vec2 uv = vUv;
        if (uDepth > 0.0) {
          uv += vec2(sin(vUv.y * 17.0 + uTime * 1.3) + sin(vUv.y * 31.0 - uTime * 0.9) * 0.5,
                     cos(vUv.x * 13.0 + uTime * 1.1)) * 0.0028 * uDepth;
        }
        vec3 col = comb(uv);

        // contrast-adaptive sharpen: restores crisp texture after MSAA resolve
        // and dynamic-resolution upscaling; clamped to the neighbourhood so it
        // never rings or halos.
        if (uSharpen > 0.0) {
          vec3 n = comb(uv + vec2(0.0, uTexel.y));
          vec3 s = comb(uv - vec2(0.0, uTexel.y));
          vec3 e = comb(uv + vec2(uTexel.x, 0.0));
          vec3 wv = comb(uv - vec2(uTexel.x, 0.0));
          vec3 mn = min(col, min(min(n, s), min(e, wv)));
          vec3 mx = max(col, max(max(n, s), max(e, wv)));
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          float contrast = dot(mx - mn, vec3(0.2126, 0.7152, 0.0722)) / (l + 0.25);
          float k = uSharpen * (1.0 - smoothstep(0.4, 1.2, contrast));
          col = clamp(col + (col * 4.0 - n - s - e - wv) * k, mn, mx);
        }

        #if SS
        {
          // traced light goes on after sharpening (whose clamp would undo
          // it) and only where the opaque world shows through the water
          float wa = texture2D(uWater, vUv).a;
          if (wa < 0.999) {
            vec3 o = texture2D(uOpaque, vUv).rgb;
            #if defined(SS_DEBUG) && SS_DEBUG == 4
              if (vUv.x > 0.5)
            #endif
            col += (applySS(o, vUv) - o) * (1.0 - wa);
          }
        }
        #endif
        #if defined(SS_DEBUG) && SS_DEBUG < 4
          // ?ssdebug=1 ao, 2 bounce, 3 sun loss: raw half-res buffers; 4: split before/after
          { vec4 da = texture2D(uSSA, vUv); vec4 db = texture2D(uSSB, vUv);
            gl_FragColor = vec4(SS_DEBUG == 1 ? vec3(da.a) : SS_DEBUG == 2 ? da.rgb : vec3(1.0 - db.r), 1.0); return; }
        #endif

        // whisper of diorama tilt-shift, only at the very top & bottom edges
        // (and the soft focus of deep water once the camera follows a wreck down)
        {
          float band = uTilt > 0.0 ? smoothstep(0.3, 0.56, abs(vUv.y - 0.48)) * uTilt : 0.0;
          band = max(band, uDepth * 0.85);
          if (band > 0.001) {
            vec2 o = uHalfTexel * (1.0 + uDepth * 2.0);
            vec3 b = texture2D(uHalf, uv).rgb * 0.36
              + (texture2D(uHalf, uv + vec2(o.x, o.y)).rgb + texture2D(uHalf, uv + vec2(-o.x, o.y)).rgb
              +  texture2D(uHalf, uv + vec2(o.x, -o.y)).rgb + texture2D(uHalf, uv + vec2(-o.x, -o.y)).rgb) * 0.16;
            col = mix(col, b, band);
          }
        }

        // photo mode depth of field: a golden-angle disc gathered from the
        // half-res image, its radius set by how far each pixel sits from the
        // focal plane. The open sea has no opaque depth of its own (the opaque
        // pass sees the seabed through it), so the water plane stands in.
        if (uDof.w > 0.0) {
          float dz = texture2D(uDofDepth, vUv).r;
          float n = uDofNearFar.x, f = uDofNearFar.y;
          float d = (n * f) / (f - (f - n) * dz);
          vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
          vec3 rv = normalize(vp.xyz / vp.w);
          vec3 rw = uCamRot * rv;
          if (rw.y < -1e-4) d = min(d, uCamY / -rw.y * -rv.z);
          float coc = clamp(abs(d - uDof.x) / max(d, 1e-3) * uDof.y, 0.0, 1.0);
          if (coc > 0.015) {
            float r = coc * uDof.z;
            vec3 acc = vec3(0.0);
            for (int i = 0; i < 24; i++) {
              float fi = float(i) + 0.5;
              float a = fi * 2.39996;
              acc += texture2D(uHalf, uv + vec2(cos(a), sin(a)) * sqrt(fi / 24.0) * r * uTexel).rgb;
            }
            col = mix(col, acc / 24.0, smoothstep(0.015, 0.18, coc));
          }
        }

        vec3 bloom = texture2D(uBloom, vUv).rgb;
        col += bloom * uBloomStrength;
        col += uFlashColor * uFlash;
        // lightning: the whole world blinks cold and bright
        col = col * (1.0 + uLightning * 1.6) + vec3(0.55, 0.62, 0.85) * uLightning * 0.06;
        col *= uExposure;

        // lost to the depths: reds drown first, the light thins to a green-blue
        // gloom brightening toward the surface, and sun shafts sway down through it
        if (uDepth > 0.0) {
          float yUp = vUv.y;
          float shafts = 0.0;
          float phase = 1.0;
          if (uEye.y < uEye.w) {
            // the camera is under: everything is laid out in the world, not on the screen.
            // The view ray, and how far it runs before it meets the hull, the sand or the surface
            vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
            vec3 rv = normalize(vp.xyz / vp.w);
            vec3 rw = uCamRot * rv;
            float dz = texture2D(uDofDepth, vUv).r;
            float zn = uDofNearFar.x, zf = uDofNearFar.y;
            float vd = (zn * zf) / (zf - (zf - zn) * dz);
            float far = min(vd / max(-rv.z, 1e-3), 70.0);
            // looking up is looking toward the light; down, into the dark
            yUp = clamp(rw.y * 0.55 + 0.5, 0.0, 1.0);
            // god rays: the very caustics that dance on the sand, gathered along the
            // view ray. Each step looks back up the bent sun ray to where its light
            // came through the surface, so the beams stand still in the water as the
            // camera moves, and sway with the waves overhead. A fixed dither per
            // pixel hides the steps (whole texture periods per 100 s of uTime, so the wrap never jumps).
            float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
            vec2 lean = uSunRay.xz / min(uSunRay.y, -0.2);
            float acc = 0.0;
            for (int i = 0; i < 8; i++) {
              float t = far * (float(i) + jit) * 0.125;
              vec3 P = uEye.xyz + rw * t;
              float dd = max(uEye.w - P.y, 0.0);
              vec2 cuv = (P.xz + lean * dd) * 0.03;
              float c1 = texture2D(uCausticTex, cuv + vec2(uTime * 0.01, uTime * 0.01), 2.0).r;
              float c2 = texture2D(uCausticTex, cuv * 1.37 + vec2(-uTime * 0.01, uTime * 0.02) + 0.5, 2.0).r;
              float c = max(c1 * c2 * 3.2 - 0.18, 0.0) + max(c1 + c2 - 1.0, 0.0) * 1.5;
              acc += c * exp(-dd * 0.032 - t * 0.02);
            }
            shafts = acc * 0.125 * smoothstep(0.0, 3.0, uEye.w - uEye.y + 3.0);
            // the water scatters light mostly onward: brightest looking toward the sun
            float toSun = max(dot(rw, -uSunRay), 0.0);
            phase = 0.55 + 2.2 * pow(toSun, 5.0) + 0.6 * toSun;
          }
          vec3 abyss = mix(vec3(0.004, 0.03, 0.05), vec3(0.05, 0.3, 0.34), yUp * yUp);
          vec3 seen = col * vec3(0.18, 0.62, 0.74) + abyss;
          // the gloom builds with depth
          col = mix(col, seen * 0.55, uDepth);
          float on = min(uDepth * 3.0, 1.0);
          if (uEye.y < uEye.w) {
            col += uShaftColor * shafts * phase * on;
          } else {
            // the camera stayed above (a reef): sun shafts sway down the screen
            float sx = vUv.x + (1.0 - yUp) * 0.22;
            float rays = sin(sx * 21.0 + uTime * 0.35) * sin(sx * 34.0 - uTime * 0.27) * sin(sx * 9.0 + uTime * 0.13);
            rays = max(rays, 0.0);
            rays *= rays * smoothstep(0.05, 1.0, yUp);
            float cz = sin(vUv.x * 40.0 + sin(vUv.y * 23.0 + uTime) * 2.0 + uTime * 0.8) * sin(vUv.y * 37.0 - uTime * 0.6);
            col += vec3(0.32, 0.72, 0.68) * (rays * 0.42 + max(cz, 0.0) * smoothstep(0.6, 1.0, yUp) * 0.12) * on;
          }
        }

        // gentle split-tone grade: teal shadows, warm highlights
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(col, col * vec3(0.94, 1.02, 1.06), (1.0 - smoothstep(0.0, 0.6, lum)) * 0.35);
        col = mix(col, col * vec3(1.05, 1.0, 0.94), smoothstep(0.5, 2.0, lum) * 0.3);

        col = aces(col);
        // a gentle S-curve: deeper shade and cleaner highlights, so a hazy
        // distance still has punch instead of going milky
        col = mix(col, col * col * (3.0 - 2.0 * col), 0.14);
        // saturation lift for that sun-drenched toy palette
        float l2 = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(l2), col, 1.12 - uDesat);

        // photo mode filter: white balance, saturation, contrast, a toned
        // monochrome and lifted, faded blacks
        if (uPhoto > 0.5) {
          col *= uPTint;
          float pl = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(vec3(pl), col, uPGrade.x);
          col = clamp((col - 0.42) * uPGrade.y + 0.42, 0.0, 1.0);
          col = mix(col, min(vec3(pl) * uPMono.rgb, 1.0), uPMono.a);
          col = col * (1.0 - uPGrade.z * 0.32) + vec3(0.11, 0.1, 0.12) * uPGrade.z;
        }

        vec2 vc = vUv - 0.5;
        col *= 1.0 - dot(vc, vc) * (uVignette + uDesat * 1.1 + uDepth * 0.9 + uPVig);

        col = toSRGB(clamp(col, 0.0, 1.0));
        col += (hash(vUv * 1000.0 + uTime) - 0.5) / 255.0; // dither
        if (uPGrade.w > 0.0) col += (hash(gl_FragCoord.xy * 0.913 + 17.0) + hash(gl_FragCoord.yx * 0.71 + 3.0) - 1.0) * uPGrade.w;
        gl_FragColor = vec4(col, 1.0);
      }`,
      {
        uOpaque: { value: null },
        uWater: { value: null },
        uHalf: { value: null },
        uBloom: { value: null },
        uHalfTexel: { value: new THREE.Vector2() },
        uTexel: { value: new THREE.Vector2() },
        uSharpen: { value: 0.12 },
        uExposure: { value: 1 },
        uBloomStrength: { value: 0.32 },
        uTilt: { value: 1 },
        uTime: { value: 0 },
        uVignette: { value: 0.55 },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color(1, 0.6, 0.3) },
        uLightning: { value: 0 },
        uDepth: { value: 0 },
        uDesat: { value: 0 },
        uPhoto: { value: 0 },
        uPGrade: { value: new THREE.Vector4(1, 1, 0, 0) },
        uPTint: { value: new THREE.Vector3(1, 1, 1) },
        uPMono: { value: new THREE.Vector4(1, 1, 1, 0) },
        uPVig: { value: 0 },
        uDof: { value: new THREE.Vector4(50, 0, 0, 0) },
        uDofDepth: { value: null },
        uDofNearFar: { value: new THREE.Vector2(1, 1000) },
        uInvProj: { value: new THREE.Matrix4() },
        uCamRot: { value: new THREE.Matrix3() },
        uCamY: { value: 10 },
        uEye: { value: new THREE.Vector4(0, 10, 0, 0) },
        uSunRay: { value: new THREE.Vector3(0, -1, 0) },
        uShaftColor: { value: new THREE.Vector3() },
        uCausticTex: { value: getSharedTextures().caustics as THREE.Texture },
        ...SS_UNIFORMS(),
      },
    );
    this.finalMat.defines.SS = 0;
    const dbg = Number(new URLSearchParams(location.search).get('ssdebug'));
    if (dbg) this.finalMat.defines.SS_DEBUG = dbg;
  }

  /** Live graphics changes. Targets are rebuilt only when MSAA or bloom depth change. */
  configure(next: PipelineSettings, trace: TraceConfig) {
    const rebuild = next.msaa !== this.settings.msaa || next.bloomLevels !== this.settings.bloomLevels;
    Object.assign(this.settings, next);
    if (rebuild && this.rtOpaque) {
      const w = this.width;
      const h = this.height;
      this.width = 0;
      this.setSize(w, h);
    }
    this.ss.configure(trace);
    const on = this.ss.enabled;
    if (on !== this.ssOn) {
      this.ssOn = on;
      for (const m of [this.combineMat, this.finalMat]) {
        m.defines.SS = on ? 1 : 0;
        m.needsUpdate = true;
      }
    }
    for (const m of [this.combineMat, this.finalMat]) {
      const st = m.uniforms.uSSStrength.value as THREE.Vector3;
      st.set(trace.ao ? 1 : 0, trace.gi ? 0.9 : 0, trace.shadows ? 0.62 : 0);
    }
  }

  setSize(w: number, h: number) {
    w = Math.max(2, Math.floor(w));
    h = Math.max(2, Math.floor(h));
    if (w === this.width && h === this.height && this.rtOpaque) return;
    this.width = w;
    this.height = h;
    this.rtOpaque?.dispose();
    this.rtWater?.dispose();
    this.rtRefl?.dispose();
    this.rtHalf?.dispose();
    this.bloomRTs.forEach((r) => r.dispose());
    const depthTex = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    depthTex.format = THREE.DepthFormat;
    this.rtOpaque = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      samples: this.settings.msaa,
      depthTexture: depthTex,
      depthBuffer: true,
    });
    // no MSAA here: the sea clips itself against the world per pixel (its own
    // depth test against rtOpaque), so extra samples only ever smoothed a few
    // spray particles while doubling the pass's memory traffic and adding a resolve
    this.rtWater = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: true });
    const lin = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    let bw = Math.max(1, w >> 1);
    let bh = Math.max(1, h >> 1);
    this.rtHalf = new THREE.WebGLRenderTarget(bw, bh, lin);
    // its own depth: steep crests fold over, and the nearer face must win
    this.rtRefl = new THREE.WebGLRenderTarget(bw, bh, { ...lin, depthBuffer: true });
    this.bloomRTs = [];
    for (let i = 0; i < this.settings.bloomLevels; i++) {
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
      this.bloomRTs.push(new THREE.WebGLRenderTarget(bw, bh, lin));
    }
  }

  private blit(mat: THREE.Material, target: THREE.WebGLRenderTarget | null, clear = true) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    if (clear) this.renderer.clear(true, false, false);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  render(opaque: THREE.Scene, water: THREE.Scene, camera: THREE.Camera, time: number) {
    const r = this.renderer;
    const P = this.prof;
    P?.begin('World (islands, ships)', 'render', true);
    r.autoClear = false;
    r.setClearColor(this.clearColor, 1);
    r.setRenderTarget(this.rtOpaque);
    r.clear(true, true, false);
    r.render(opaque, camera);
    P?.end(true);

    if (this.ssOn && this.sun) {
      P?.begin('Ray tracing (AO, GI, contact)', 'render', true);
      const cam = camera as THREE.PerspectiveCamera;
      this.ss.render(r, this.rtOpaque.texture, this.rtOpaque.depthTexture!, this.width, this.height, cam, this.sun, this.sunDir);
      const [a, b] = this.ss.textures!;
      for (const m of [this.combineMat, this.finalMat]) {
        const u = m.uniforms;
        u.uSSA.value = a;
        u.uSSB.value = b;
        u.uSSTexel.value.set(1 / this.ss.width, 1 / this.ss.height);
        u.uSceneDepth.value = this.rtOpaque.depthTexture;
        u.uSSNearFar.value.set(cam.near, cam.far);
      }
      P?.end(true);
    }

    if (this.refl) {
      P?.begin('Water reflections (half res)', 'ocean', true);
      this.onRefl?.(this.ssOn && this.sun ? this.ss.textures![1] : null);
      r.setRenderTarget(this.rtRefl);
      r.setClearColor(0x000000, 0);
      r.clear(true, true, false);
      r.render(this.refl, camera);
      P?.end(true);
    }

    P?.begin('Water & FX', 'ocean', true);
    r.setRenderTarget(this.rtWater);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.render(water, camera);
    P?.end(true);

    P?.begin('Bloom', 'render', true);
    // half-res combine
    const cu = this.combineMat.uniforms;
    cu.uOpaque.value = this.rtOpaque.texture;
    cu.uWater.value = this.rtWater.texture;
    cu.uTexel.value.set(1 / this.width, 1 / this.height);
    this.blit(this.combineMat, this.rtHalf);

    // bloom down
    const du = this.downMat.uniforms;
    let src = this.rtHalf;
    for (let i = 0; i < this.bloomRTs.length; i++) {
      du.uSrc.value = src.texture;
      du.uTexel.value.set(1 / src.width, 1 / src.height);
      du.uFirst.value = i === 0 ? 1 : 0;
      this.blit(this.downMat, this.bloomRTs[i]);
      src = this.bloomRTs[i];
    }
    // bloom up (additive)
    const uu = this.upMat.uniforms;
    for (let i = this.bloomRTs.length - 1; i > 0; i--) {
      const from = this.bloomRTs[i];
      uu.uSrc.value = from.texture;
      uu.uTexel.value.set(0.5 / from.width, 0.5 / from.height);
      uu.uWeight.value = 0.85;
      this.blit(this.upMat, this.bloomRTs[i - 1], false);
    }

    P?.end(true);

    P?.begin('Final grade & sharpen', 'render', true);
    const fu = this.finalMat.uniforms;
    fu.uOpaque.value = this.rtOpaque.texture;
    fu.uWater.value = this.rtWater.texture;
    fu.uHalf.value = this.rtHalf.texture;
    fu.uBloom.value = this.bloomRTs[0]?.texture ?? this.rtHalf.texture;
    fu.uBloomStrength.value = this.bloomRTs.length ? 0.3 : 0;
    fu.uHalfTexel.value.set(1 / this.rtHalf.width, 1 / this.rtHalf.height);
    fu.uTexel.value.set(1 / this.width, 1 / this.height);
    fu.uSharpen.value = this.sharpen;
    fu.uExposure.value = this.exposure;
    fu.uTilt.value = this.settings.tiltShift ? this.tilt : 0;
    fu.uTime.value = time % 100;
    const ph = this.photo;
    fu.uPhoto.value = ph ? 1 : 0;
    fu.uPVig.value = ph ? ph.vignette : 0;
    fu.uPGrade.value.set(ph ? ph.saturation : 1, ph ? ph.contrast : 1, ph ? ph.fade : 0, ph ? ph.grain : 0);
    if (ph) {
      fu.uPTint.value.fromArray(ph.tint);
      fu.uPMono.value.set(ph.mono[0], ph.mono[1], ph.mono[2], ph.monoAmount);
    }
    const dof = ph && ph.aperture > 0;
    fu.uDof.value.set(ph ? ph.focus : 50, ph ? ph.aperture : 0, this.height * 0.018, dof ? 1 : 0);
    const cam = camera as THREE.PerspectiveCamera;
    const eye = fu.uEye.value as THREE.Vector4;
    eye.set(cam.position.x, cam.position.y, cam.position.z, this.under ? this.under.surf : -1e9);
    if (dof || this.under) {
      fu.uDofDepth.value = this.rtOpaque.depthTexture;
      fu.uDofNearFar.value.set(cam.near, cam.far);
      fu.uInvProj.value.copy(cam.projectionMatrixInverse);
      fu.uCamRot.value.setFromMatrix4(cam.matrixWorld);
    }
    if (dof) fu.uCamY.value = cam.position.y - ph.waterY;
    if (this.under) {
      fu.uSunRay.value.copy(this.under.ray);
      fu.uShaftColor.value.copy(this.under.color);
    }
    this.blit(this.finalMat, null);
    P?.end(true);
  }

  tilt = 1;
  /** Photo mode's lens and filter, or null in play. Uniforms only: the same program draws it. */
  photo: PhotoLook | null = null;
  /** What shows where nothing is drawn (the deep sea colour; the water itself when the camera is under). */
  readonly clearColor = new THREE.Color(0x0b2a3a);
  /**
   * How far beneath the waves the picture is (0 above .. 1 drowned): drowns the
   * reds, swims the image, blurs it and lets sun shafts through. A uniform only,
   * so the same compiled program draws it: no new shader mid-game.
   */
  set depth(v: number) {
    this.finalMat.uniforms.uDepth.value = v;
  }
  /**
   * The camera is beneath the waves (or null): the surface over it, the sun's
   * light bent down through it and the colour of its shafts. Uniforms only.
   */
  under: { surf: number; ray: THREE.Vector3; color: THREE.Vector3 } | null = null;
  /** Drains colour and deepens the vignette for a sombre beat (0 none .. 1 grey). */
  set desat(v: number) {
    this.finalMat.uniforms.uDesat.value = v;
  }
  /** Lightning brightness this frame (0 none). */
  set lightning(v: number) {
    this.finalMat.uniforms.uLightning.value = v;
  }
  /** Sharpen strength; raised by the caller when rendering below native resolution. */
  sharpen = 0.12;
  flash(strength: number) {
    this.finalMat.uniforms.uFlash.value = Math.max(this.finalMat.uniforms.uFlash.value, strength);
  }
  decayFlash(dt: number) {
    this.finalMat.uniforms.uFlash.value *= Math.exp(-dt * 9);
  }
}
