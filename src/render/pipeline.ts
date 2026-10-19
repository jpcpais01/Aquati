import * as THREE from 'three';

// Frame graph:
//   1. opaque scene  -> rtOpaque (HDR colour + depth texture, MSAA)
//   2. water + fx    -> rtWater  (premultiplied HDR over transparent, own depth)
//      (the ocean reads rtOpaque colour/depth for refraction and thickness)
//   3. combine at half res -> dual-filter bloom chain
//   4. final: combine + adaptive sharpen + bloom + edge tilt-shift + grade + ACES -> screen

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

  constructor(private renderer: THREE.WebGLRenderer, settings: PipelineSettings) {
    this.settings = settings;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    this.combineMat = fsMaterial(
      /* glsl */ `
      uniform sampler2D uOpaque; uniform sampler2D uWater; uniform vec2 uTexel;
      varying vec2 vUv;
      vec3 comb(vec2 uv) {
        vec4 w = texture2D(uWater, uv);
        return texture2D(uOpaque, uv).rgb * (1.0 - w.a) + w.rgb;
      }
      void main() {
        // 4-tap box at half res (each tap bilinear over 2x2)
        vec2 o = uTexel * 0.5;
        vec3 c = comb(vUv + vec2(-o.x, -o.y)) + comb(vUv + vec2(o.x, -o.y)) + comb(vUv + vec2(-o.x, o.y)) + comb(vUv + vec2(o.x, o.y));
        c *= 0.25;
        // scrub NaN/Inf so one bad pixel can't get smeared into a black block by the bloom chain
        c = (c.r + c.g + c.b) < 1e4 ? max(c, 0.0) : vec3(0.0);
        gl_FragColor = vec4(c, 1.0);
      }`,
      { uOpaque: { value: null }, uWater: { value: null }, uTexel: { value: new THREE.Vector2() } },
    );

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
      uniform vec2 uTexel; uniform float uSharpen;
      varying vec2 vUv;

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
        vec3 col = comb(vUv);

        // contrast-adaptive sharpen: restores crisp texture after MSAA resolve
        // and dynamic-resolution upscaling; clamped to the neighbourhood so it
        // never rings or halos.
        if (uSharpen > 0.0) {
          vec3 n = comb(vUv + vec2(0.0, uTexel.y));
          vec3 s = comb(vUv - vec2(0.0, uTexel.y));
          vec3 e = comb(vUv + vec2(uTexel.x, 0.0));
          vec3 wv = comb(vUv - vec2(uTexel.x, 0.0));
          vec3 mn = min(col, min(min(n, s), min(e, wv)));
          vec3 mx = max(col, max(max(n, s), max(e, wv)));
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          float contrast = dot(mx - mn, vec3(0.2126, 0.7152, 0.0722)) / (l + 0.25);
          float k = uSharpen * (1.0 - smoothstep(0.4, 1.2, contrast));
          col = clamp(col + (col * 4.0 - n - s - e - wv) * k, mn, mx);
        }

        // whisper of diorama tilt-shift, only at the very top & bottom edges
        if (uTilt > 0.0) {
          float band = smoothstep(0.3, 0.56, abs(vUv.y - 0.48)) * uTilt;
          if (band > 0.001) {
            vec2 o = uHalfTexel;
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
        uTexel: { value: new THREE.Vector2() },
        uSharpen: { value: 0.12 },
        uExposure: { value: 1 },
        uBloomStrength: { value: 0.32 },
        uTilt: { value: 1 },
        uTime: { value: 0 },
        uVignette: { value: 0.55 },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color(1, 0.6, 0.3) },
      },
    );
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
    fu.uTexel.value.set(1 / this.width, 1 / this.height);
    fu.uSharpen.value = this.sharpen;
    fu.uExposure.value = this.exposure;
    fu.uTilt.value = this.settings.tiltShift ? this.tilt : 0;
    fu.uTime.value = time % 100;
    this.blit(this.finalMat, null);
  }

  tilt = 1;
  /** Sharpen strength; raised by the caller when rendering below native resolution. */
  sharpen = 0.12;
  flash(strength: number) {
    this.finalMat.uniforms.uFlash.value = Math.max(this.finalMat.uniforms.uFlash.value, strength);
  }
  decayFlash(dt: number) {
    this.finalMat.uniforms.uFlash.value *= Math.exp(-dt * 9);
  }
}
