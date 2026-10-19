import * as THREE from 'three';

// A small camera-centred, world-aligned foam canvas. Ships paint their wakes
// and cannonballs paint splash rings; each frame the canvas scrolls with the
// camera, diffuses a touch and fades. The ocean shader reads it as foam.

const MAX_STAMPS = 160;

export class WakeField {
  readonly size: number; // world metres covered
  readonly res: number;
  readonly center = new THREE.Vector2();
  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  private fadeScene = new THREE.Scene();
  private stampScene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1);
  private fadeMat: THREE.ShaderMaterial;
  private stampGeo: THREE.InstancedBufferGeometry;
  private stampData: Float32Array; // x, z, radius, strength
  private stampKind: Float32Array; // 0 blob, 1 ring
  private stampCount = 0;
  private lastCenter = new THREE.Vector2();
  readonly uniforms = {
    uWakeTex: { value: null as THREE.Texture | null },
    uWakeRect: { value: new THREE.Vector4() }, // centerX, centerZ, size, 1/size
  };

  constructor(res = 512, size = 300) {
    this.res = res;
    this.size = size;
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rtA = new THREE.WebGLRenderTarget(res, res, opts);
    this.rtB = new THREE.WebGLRenderTarget(res, res, opts);

    this.fadeMat = new THREE.ShaderMaterial({
      uniforms: {
        uPrev: { value: null },
        uShift: { value: new THREE.Vector2() },
        uTexel: { value: 1 / res },
        uDecay: { value: 0.98 },
      },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uPrev; uniform vec2 uShift; uniform float uTexel; uniform float uDecay;
        varying vec2 vUv;
        void main(){
          vec2 uv = vUv + uShift;
          float t = uTexel * 0.85;
          vec4 c = texture2D(uPrev, uv) * 0.6
            + (texture2D(uPrev, uv + vec2(t, 0.0)) + texture2D(uPrev, uv - vec2(t, 0.0))
            +  texture2D(uPrev, uv + vec2(0.0, t)) + texture2D(uPrev, uv - vec2(0.0, t))) * 0.1;
          float edge = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
          gl_FragColor = c * uDecay * edge;
        }`,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.fadeMat);
    quad.frustumCulled = false;
    this.fadeScene.add(quad);

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
          float v = mix(blob, ring, vKind) * vStrength;
          gl_FragColor = vec4(v, v * 0.5, 0.0, v);
        }`,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    const stamps = new THREE.Mesh(this.stampGeo, stampMat);
    stamps.frustumCulled = false;
    this.stampScene.add(stamps);
    this.uniforms.uWakeTex.value = this.rtA.texture;
  }

  stamp(x: number, z: number, radius: number, strength: number, ring = false) {
    if (this.stampCount >= MAX_STAMPS) return;
    const i = this.stampCount++;
    this.stampData[i * 4] = x;
    this.stampData[i * 4 + 1] = z;
    this.stampData[i * 4 + 2] = radius;
    this.stampData[i * 4 + 3] = strength;
    this.stampKind[i] = ring ? 1 : 0;
  }

  update(renderer: THREE.WebGLRenderer, focusX: number, focusZ: number, dt: number) {
    const texel = this.size / this.res;
    // snap to texels so scrolling never smears the foam
    const cx = Math.round(focusX / texel) * texel;
    const cz = Math.round(focusZ / texel) * texel;
    const shift = new THREE.Vector2((cx - this.lastCenter.x) / this.size, (cz - this.lastCenter.y) / this.size);
    this.lastCenter.set(cx, cz);
    this.center.set(cx, cz);
    this.uniforms.uWakeRect.value.set(cx, cz, this.size, 1 / this.size);

    this.fadeMat.uniforms.uPrev.value = this.rtA.texture;
    this.fadeMat.uniforms.uShift.value.copy(shift);
    this.fadeMat.uniforms.uDecay.value = Math.pow(0.55, dt); // ~half-life 1.2s
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.rtB);
    renderer.render(this.fadeScene, this.cam);
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
