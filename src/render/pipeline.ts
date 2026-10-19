import * as THREE from 'three';
import { GLSL_SS_APPLY, ScreenSpaceLighting, TraceConfig } from './screenSpace';

// Frame graph:
//   1. opaque scene  -> rtOpaque (HDR colour + depth texture, MSAA)
//   2. screen-space ray tracing over rtOpaque -> AO, bounce light, contact
//      shadows (half res, see screenSpace.ts), lit into the opaque colour below
//   3. water + fx    -> rtWater  (premultiplied HDR over transparent, own depth)
//      (the ocean reads rtOpaque colour/depth for refraction, thickness and
//      ray-traced reflections)
//   4. combine at half res -> dual-filter bloom chain
//   5. final: combine + bloom + tilt-shift + grade + ACES -> screen

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
  /** Screen-space ray tracing; null input sun means it is off. */
  readonly ss = new ScreenSpaceLighting();
  private ssOn = false;
  sun: THREE.DirectionalLight | null = null;
  sunDir = new THREE.Vector3(0, 1, 0);

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
      uniform float uTime; uniform float uVignette; uniform float uFlash; uniform vec3 uFlashColor;
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

      void main() {
        vec4 w = texture2D(uWater, vUv);
        vec3 col = texture2D(uOpaque, vUv).rgb;
        #if SS
          // only where the opaque world shows through: under open water it's moot
          #if defined(SS_DEBUG) && SS_DEBUG == 4
            if (vUv.x > 0.5 && w.a < 0.999) col = applySS(col, vUv);
          #else
            if (w.a < 0.999) col = applySS(col, vUv);
          #endif
        #endif
        #if defined(SS_DEBUG) && SS_DEBUG < 4
          // ?ssdebug=1 ao, 2 bounce, 3 sun loss: raw half-res buffers; 4: split before/after
          { vec4 da = texture2D(uSSA, vUv); vec4 db = texture2D(uSSB, vUv);
            gl_FragColor = vec4(SS_DEBUG == 1 ? vec3(da.a) : SS_DEBUG == 2 ? da.rgb : vec3(1.0 - db.r), 1.0); return; }
        #endif
        col = col * (1.0 - w.a) + w.rgb;

        // diorama tilt-shift: blur toward the top & bottom of the frame
        if (uTilt > 0.0) {
          float band = smoothstep(0.18, 0.5, abs(vUv.y - 0.47)) * uTilt;
          if (band > 0.001) {
            vec2 o = uHalfTexel * 1.5;
            vec3 b = texture2D(uHalf, vUv).rgb * 0.36
              + (texture2D(uHalf, vUv + vec2(o.x, o.y)).rgb + texture2D(uHalf, vUv + vec2(-o.x, o.y)).rgb
              +  texture2D(uHalf, vUv + vec2(o.x, -o.y)).rgb + texture2D(uHalf, vUv + vec2(-o.x, -o.y)).rgb) * 0.16;
            col = mix(col, b, band);
          }
        }

        vec3 bloom = texture2D(uBloom, vUv).rgb;
        col += bloom * uBloomStrength;
        col += uFlashColor * uFlash;
        col *= uExposure;

        // gentle split-tone grade: teal shadows, warm highlights
        float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(col, col * vec3(0.94, 1.02, 1.06), (1.0 - smoothstep(0.0, 0.6, lum)) * 0.35);
        col = mix(col, col * vec3(1.05, 1.0, 0.94), smoothstep(0.5, 2.0, lum) * 0.3);

        col = aces(col);
        // saturation lift for that sun-drenched toy palette
        float l2 = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(l2), col, 1.12);

        vec2 vc = vUv - 0.5;
        col *= 1.0 - dot(vc, vc) * uVignette;

        col = toSRGB(clamp(col, 0.0, 1.0));
        col += (hash(vUv * 1000.0 + uTime) - 0.5) / 255.0; // dither
        gl_FragColor = vec4(col, 1.0);
      }`,
      {
        uOpaque: { value: null },
        uWater: { value: null },
        uHalf: { value: null },
        uBloom: { value: null },
        uHalfTexel: { value: new THREE.Vector2() },
        uExposure: { value: 1 },
        uBloomStrength: { value: 0.32 },
        uTilt: { value: 1 },
        uTime: { value: 0 },
        uVignette: { value: 0.55 },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color(1, 0.6, 0.3) },
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
    // with no bounce light the strength term just zeroes out
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
    this.rtWater = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.settings.msaa, depthBuffer: true });
    const lin = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    let bw = Math.max(1, w >> 1);
    let bh = Math.max(1, h >> 1);
    this.rtHalf = new THREE.WebGLRenderTarget(bw, bh, lin);
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
    r.autoClear = false;
    r.setClearColor(0x0b2a3a, 1);
    r.setRenderTarget(this.rtOpaque);
    r.clear(true, true, false);
    r.render(opaque, camera);

    if (this.ssOn && this.sun) {
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
    }

    r.setRenderTarget(this.rtWater);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.render(water, camera);

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

    const fu = this.finalMat.uniforms;
    fu.uOpaque.value = this.rtOpaque.texture;
    fu.uWater.value = this.rtWater.texture;
    fu.uHalf.value = this.rtHalf.texture;
    fu.uBloom.value = this.bloomRTs[0]?.texture ?? this.rtHalf.texture;
    fu.uBloomStrength.value = this.bloomRTs.length ? 0.3 : 0;
    fu.uHalfTexel.value.set(1 / this.rtHalf.width, 1 / this.rtHalf.height);
    fu.uExposure.value = this.exposure;
    fu.uTilt.value = this.settings.tiltShift ? this.tilt : 0;
    fu.uTime.value = time % 100;
    this.blit(this.finalMat, null);
  }

  tilt = 1;
  flash(strength: number) {
    this.finalMat.uniforms.uFlash.value = Math.max(this.finalMat.uniforms.uFlash.value, strength);
  }
  decayFlash(dt: number) {
    this.finalMat.uniforms.uFlash.value *= Math.exp(-dt * 9);
  }
}
