import * as THREE from 'three';
import { mulberry32, Simplex2, smoothstep } from '../core/noise';
import { GLSL_AERIAL, GLSL_ATMOS, globalUniforms } from '../render/environment';
import type { Island } from './terrain';

// Little fair-weather cumulus drifting low over the archipelago, the kind you
// only look down on once the camera climbs high above the fleet.
//
// Each cloud is a heap of soft spherical puffs: a big crown in the middle,
// smaller billows round it, all sitting on one flat base. A puff is a single
// camera-facing quad that shades itself as a ball of vapour: its thickness
// along the view gives a soft edge, the depth of cloud between each point and
// the sun gives a lit crown and a cool shaded flank (plus a dose of light that
// scatters round inside), worley noise erodes the rim into cauliflower
// billows, and the other puffs of the same cloud shade it too (worked out on
// the CPU, one ray per puff). Bellies pick up the turquoise of the lagoons.
//
// Clouds live on a jittered grid that drifts with the wind. Whether a cell
// holds one, and how big it has grown, follows the weather, a slow patchy
// field that wanders on its own (some stretches of sea stay clear, others
// fill up) and the islands, which breed clouds over their warm slopes. A
// cloud forms core-first and frays away from its edges, so nothing pops.
//
// They cast real shadows: every puff is splatted into a small top-down map
// along the sun, which `cloudShadow()` reads for the sea, the islands and the
// ships. So zoomed in, under the clouds, their shadows already drift over the
// water; climb above them and the clouds that cast them come into view.

/** Grid cell (m) a cloud may claim, and how far it may stray from its centre. */
const CELL = 86;
const JITTER = 30;
/** Cloud base altitude (m) and how much it varies. */
const BASE = 92;
const BASE_VAR = 16;
/** Half-width (m) of the shadow map around the view. */
const SH_HALF = 340;
const SH_RES = 256;
/** Clouds farther than this from the view centre fade out (m). */
const REACH = 430;

interface Puff {
  x: number; // offset from the cloud centre
  y: number; // height above the cloud base
  z: number;
  r: number;
  th: number; // growth stage it appears at (0 core .. ~0.7 outer billows)
  seed: number;
}

interface CloudDef {
  jx: number;
  jz: number;
  th: number;
  base: number;
  rot: number;
  puffs: Puff[] | null;
  top: number;
}

function buildPuffs(rnd: () => number, few: boolean): { puffs: Puff[]; top: number } {
  const L = 24 + rnd() * 32; // length of the footprint
  const W = L * (0.5 + rnd() * 0.3);
  const H = L * (0.28 + rnd() * 0.24); // how high the crown heaps above the base
  const r0 = L * (0.26 + rnd() * 0.06);
  const puffs: Puff[] = [{ x: 0, y: Math.max(r0 * 0.55, H * 0.55), z: 0, r: r0, th: 0, seed: rnd() }];
  const n = few ? 4 + Math.floor(rnd() * 3) : 7 + Math.floor(rnd() * 6);
  for (let i = 0; i < n; i++) {
    // spread round the footprint ellipse, a little evenly so there are no bald patches
    const a = ((i + rnd() * 0.7) / n) * Math.PI * 2;
    const rho = 0.35 + rnd() * 0.6;
    const x = Math.cos(a) * rho * L * 0.5;
    const z = Math.sin(a) * rho * W * 0.5;
    const r = r0 * (1 - 0.5 * rho) * (0.72 + rnd() * 0.4);
    // taller toward the middle; never below the flat base
    const y = Math.max(r * 0.5, (1 - rho) * (1 - rho) * H * 0.9 + r * 0.45 + rnd() * r * 0.25);
    puffs.push({ x, y, z, r, th: rho * 0.55 + rnd() * 0.12, seed: rnd() });
  }
  // a stray wisp or two at the rim, the last to form and the first to go
  const wisps = few ? 1 : 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < wisps; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = r0 * (0.3 + rnd() * 0.2);
    puffs.push({ x: Math.cos(a) * L * 0.62, y: rr * 0.6, z: Math.sin(a) * W * 0.62, r: rr, th: 0.62 + rnd() * 0.12, seed: rnd() });
  }
  let top = 0;
  for (const p of puffs) top = Math.max(top, p.y + p.r);
  return { puffs, top };
}

const _m = new THREE.Matrix4();
const _f = new THREE.Frustum();
const _s = new THREE.Sphere();
const _v = new THREE.Vector3();

export class LowClouds {
  /** The clouds themselves, drawn in the water & fx pass. */
  readonly mesh: THREE.Mesh;
  /** The shadow splats, drawn into `shadowRT` (kept in its own scene). */
  readonly shadowScene = new THREE.Scene();
  // mipmapped: the sun shafts read it blurred by how far apart their steps land
  readonly shadowRT = new THREE.WebGLRenderTarget(SH_RES, SH_RES, { depthBuffer: false, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true });
  private shadowCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private shadowMesh: THREE.Mesh;

  private geo: THREE.InstancedBufferGeometry;
  private aPuff: THREE.InstancedBufferAttribute;
  private aLight: THREE.InstancedBufferAttribute;
  private aCloud: THREE.InstancedBufferAttribute;
  private sgeo: THREE.InstancedBufferGeometry;
  private sPuff: THREE.InstancedBufferAttribute;
  private maxVis: number;
  private maxShadow: number;

  readonly uniforms = {
    uSceneDepth: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCamNearFar: { value: new THREE.Vector2(1, 1000) },
    uFocus: { value: new THREE.Vector3(0, 0, 0) }, // px x, y, and how much (0..1) the ship there is kept clear
    uGrey: { value: 0 },
    uCloudTime: { value: 0 },
    uDrift: { value: new THREE.Vector2() }, // how far the wind has carried the clouds (m)
  };
  private shUniforms = {
    uCentre: { value: new THREE.Vector3() }, // xz centre, 1 / half-width
    uToSun: { value: new THREE.Vector3(0, 1, 0) },
  };

  private cells = new Map<number, CloudDef>();
  private patch = new Simplex2(4417);
  private drift = new THREE.Vector2();
  private time = 0;
  private few: boolean;
  private shadowLive = false;
  /** How far the clouds are thinning over the player's ship right now (eases toward `clear`). */
  private focusW = 1;
  /** Set while the loading screen's warm-up draw runs: both batches draw (empty) so their shaders compile. */
  warm = false;
  private order: number[] = [];

  // scratch for the visible puffs, sorted far to near each frame
  private vis: Float32Array;
  private visKey: Float32Array;

  constructor(private islands: Island[], tier: number) {
    this.few = tier === 0;
    this.maxVis = tier === 0 ? 200 : 480;
    this.maxShadow = tier === 0 ? 900 : 2000;
    this.vis = new Float32Array(this.maxVis * 12);
    this.visKey = new Float32Array(this.maxVis);

    // ---------------------------------------------------------------- clouds
    const quad = new THREE.PlaneGeometry(2, 2);
    const geo = (this.geo = new THREE.InstancedBufferGeometry());
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    this.aPuff = new THREE.InstancedBufferAttribute(new Float32Array(this.maxVis * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aLight = new THREE.InstancedBufferAttribute(new Float32Array(this.maxVis * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aCloud = new THREE.InstancedBufferAttribute(new Float32Array(this.maxVis * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPuff', this.aPuff);
    geo.setAttribute('aLight', this.aLight);
    geo.setAttribute('aCloud', this.aCloud);
    geo.instanceCount = 0;

    const mat = new THREE.ShaderMaterial({
      uniforms: { ...globalUniforms, ...this.uniforms },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      premultipliedAlpha: true,
      vertexShader: /* glsl */ `
        uniform vec3 uSunDir;
        attribute vec4 aPuff;   // centre, radius
        attribute vec4 aLight;  // sunlight through the rest of the cloud, opacity, seed, spare
        attribute vec4 aCloud;  // base altitude, crown altitude
        varying vec2 vUv;
        varying vec3 vC;
        varying vec3 vR;
        varying vec3 vU;
        varying vec3 vF;
        varying vec3 vL;
        varying vec4 vLight;
        varying vec2 vCloud;
        varying float vRad;
        varying float vViewZ;
        void main() {
          vec3 c = aPuff.xyz;
          float r = aPuff.w;
          // a quad square to the line of sight through the puff's centre
          vec3 f = normalize(cameraPosition - c);
          vec3 up = abs(f.y) > 0.98 ? vec3(0.0, 0.0, -1.0) : vec3(0.0, 1.0, 0.0);
          vec3 rt = normalize(cross(up, f));
          vec3 u = cross(f, rt);
          vec3 p = c + (rt * position.x + u * position.y) * r;
          vUv = position.xy;
          vC = c;
          vR = rt;
          vU = u;
          vF = f;
          // the sun in the puff's own frame
          vL = vec3(dot(uSunDir, rt), dot(uSunDir, u), dot(uSunDir, f));
          vLight = aLight;
          vCloud = aCloud.xy;
          vRad = r;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vViewZ = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uFogColor;
        uniform vec2 uFogRange;
        ${GLSL_ATMOS}
        ${GLSL_AERIAL}
        uniform sampler2D uSceneDepth;
        uniform vec2 uResolution;
        uniform vec2 uCamNearFar;
        uniform vec3 uFocus;
        uniform float uGrey;
        uniform float uCloudTime;
        uniform vec2 uDrift;
        varying vec2 vUv;
        varying vec3 vC;
        varying vec3 vR;
        varying vec3 vU;
        varying vec3 vF;
        varying vec3 vL;
        varying vec4 vLight;
        varying vec2 vCloud;
        varying float vRad;
        varying float vViewZ;
        float linearDepth(float d) { float n = uCamNearFar.x, f = uCamNearFar.y; return (n * f) / (f - d * (f - n)); }
        void main() {
          float r2 = dot(vUv, vUv);
          if (r2 >= 1.0) discard;
          float zf = sqrt(1.0 - r2);
          // the front of the ball, in the world
          vec3 nrm = vR * vUv.x + vU * vUv.y + vF * zf;
          vec3 P = vC + nrm * vRad;
          // billows: worley cells eroding the rim, finer ones and a wisp of fbm on
          // top, boiling slowly. Read on the puff's own disc, pushed a little
          // toward us where the ball bulges (so the billows slide with parallax
          // as the camera moves, yet never streak round the rim), and in the
          // cloud's own frame: they ride the wind with it instead of the wind
          // dragging the pattern through the cloud.
          vec3 D = vC + (vR * vUv.x + vU * vUv.y + vF * zf * 0.4) * vRad;
          D.xz -= uDrift;
          vec2 q = (D.xz + vec2(D.y * 0.6, -D.y * 0.4)) * 0.019 + vLight.z * 37.0;
          float t = uCloudTime;
          vec2 s1 = vec2(t * 0.0009, -t * 0.0006);
          float wor = texture(uNoiseTex, q + s1).b;
          float wor2 = texture(uNoiseTex, q * 2.1 + vec2(-t * 0.0014, t * 0.001) + 0.61).b;
          float fb = texture(uNoiseTex, q * 3.7 + vec2(t * 0.0017, t * 0.0013) + 0.37).g;
          float billow = smoothstep(0.18, 0.82, wor * 0.5 + wor2 * 0.3 + fb * 0.2);
          // the same big billows a step toward the sun: where that step climbs,
          // this spot lies in the lee of a lump and falls into its shade
          vec3 sd = vR * vL.x + vU * vL.y;
          float worS = texture(uNoiseTex, q + s1 + normalize(sd.xz + 1e-4) * 0.045).b;
          float selfSh = clamp(0.62 + (wor - worS) * 3.2, 0.25, 1.15);
          // the rim is eaten back by the billows: lumpy, never a clean circle
          float shape = (1.0 - sqrt(r2)) * 1.3 - (1.0 - billow) * 0.52 + 0.1;
          // a soft, feathered edge, and thinner vapour in the hollows between billows
          float a = smoothstep(0.0, 0.5, shape) * (1.0 - exp(-zf * 4.0)) * mix(0.78, 1.0, billow) * vLight.y;
          // the ships stay in view: a cloud thins out where it would hide the one you sail
          if (uFocus.z > 0.0) {
            float fd = length(gl_FragCoord.xy - uFocus.xy) / uResolution.y;
            a *= mix(1.0, mix(0.22, 1.0, smoothstep(0.07, 0.2, fd)), uFocus.z);
          }
          // soft where it meets a peak (or the photo camera tucks one behind an island)
          vec2 suv = gl_FragCoord.xy / uResolution;
          float sz = linearDepth(texture(uSceneDepth, suv).r);
          a *= clamp((sz - vViewZ) / (vRad * 0.6), 0.0, 1.0);
          if (a < 0.004) discard;

          // ---- light. Distance (in radii) from the middle of the ball, along
          // the sun, out to its surface: the vapour the light crosses to get here
          // (taken a little in from the face we see, where most of the light we get scatters)
          vec3 m = vec3(vUv, zf * 0.55);
          float b = dot(m, vL);
          float tSun = -b + sqrt(max(b * b - dot(m, m) + 1.0, 0.0));
          float dens = 2.6 + uGrey * 1.4;
          float through = vLight.x;
          float Ts = exp(-tSun * dens) * through;
          // light that scatters round inside: the shaded side never goes black
          float Tms = exp(-tSun * dens * 0.22) * (0.2 + 0.5 * through) * 0.4;
          // a dark rim where the ball turns from the sun (the "powder" crevices
          // that let one billow read against the next)
          float powder = 1.0 - exp(-zf * 2.6) * 0.42;
          vec3 V = normalize(P - cameraPosition);
          float mu = dot(V, uSunDir);
          float phase = 0.82 + 0.35 * mu * mu + pow(max(mu, 0.0), 10.0) * 2.2;
          float albedo = 1.0 - uGrey * 0.58;
          // and the plain fact of facing the sun or not
          float lam = 0.45 + 0.55 * smoothstep(-0.6, 0.9, dot(nrm, uSunDir));
          vec3 sun = uSunColor * (Ts * powder * selfSh + Tms) * lam * phase * 0.38;
          // a silver lining: the thin edge that faces the sun glows, more so against the light
          float edge = (1.0 - zf) * (1.0 - zf);
          float rim = edge * smoothstep(0.0, 0.8, dot(vUv, vL.xy)) * (0.35 + 0.65 * through) * (0.6 + 0.9 * max(mu, 0.0));
          sun += uSunColor * rim * 0.32 * (1.0 - uGrey * 0.7);
          // sky from above, the sea's turquoise glow from below
          float hf = clamp((P.y - vCloud.x) / max(vCloud.y - vCloud.x, 1.0), 0.0, 1.0);
          vec3 sky = mix(uSkyHorizon, uSkyZenith, 0.65) * 0.4 + uLight * 0.1;
          vec3 sea = vec3(0.07, 0.26, 0.3) * (uLight * 0.85 + 0.03);
          // and the crevices between billows see less of the sky
          vec3 amb = mix(sea, sky, smoothstep(-0.7, 0.8, nrm.y)) * mix(0.5, 1.05, hf) * mix(0.6, 1.0, zf) * mix(0.72, 1.06, billow);
          vec3 col = (sun + amb) * albedo;
          col *= 1.0 - uNight * 0.68;
          col += vec3(0.62, 0.7, 0.95) * uFlash * (0.5 + hf * 0.5);
          // sinking into the air (and the mist) like everything else
          vec3 vd = P - cameraPosition;
          col = mix(col, hazeColor(normalize(vd)), aerialAt(length(vd), P.y));
          gl_FragColor = vec4(col * a, a);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20; // above the rain, the spray and the sea
    this.mesh.name = 'Clouds';
    this.mesh.visible = false;

    // ---------------------------------------------------------------- shadows
    const sgeo = (this.sgeo = new THREE.InstancedBufferGeometry());
    sgeo.index = quad.index;
    sgeo.setAttribute('position', quad.getAttribute('position'));
    this.sPuff = new THREE.InstancedBufferAttribute(new Float32Array(this.maxShadow * 4), 4).setUsage(THREE.DynamicDrawUsage);
    sgeo.setAttribute('aPuff', this.sPuff);
    sgeo.instanceCount = 0;
    const smat = new THREE.ShaderMaterial({
      uniforms: this.shUniforms,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.MaxEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      vertexShader: /* glsl */ `
        uniform vec3 uCentre;
        uniform vec3 uToSun;
        attribute vec4 aPuff; // xz ground centre of the shadow, radius, strength
        varying vec2 vUv;
        varying float vK;
        void main() {
          // a ball's shadow on the sea: stretched along the sun's bearing by its slant
          vec2 al = normalize(uToSun.xz + vec2(1e-5, 0.0));
          vec2 sd = vec2(-al.y, al.x);
          float r = aPuff.z * 1.25;
          vec2 p = aPuff.xy + al * position.x * r / uToSun.y + sd * position.y * r;
          vUv = position.xy;
          vK = aPuff.w;
          gl_Position = vec4((p - uCentre.xy) * uCentre.z, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying float vK;
        void main() {
          float d = dot(vUv, vUv);
          float s = (1.0 - smoothstep(0.12, 1.0, d)) * vK;
          gl_FragColor = vec4(s, s, s, s);
        }`,
    });
    this.shadowMesh = new THREE.Mesh(sgeo, smat);
    this.shadowMesh.frustumCulled = false;
    this.shadowScene.add(this.shadowMesh);

    globalUniforms.uLowCloudTex.value = this.shadowRT.texture;
  }

  setScene(depth: THREE.Texture, w: number, h: number, cam: THREE.PerspectiveCamera) {
    this.uniforms.uSceneDepth.value = depth;
    this.uniforms.uResolution.value.set(w, h);
    this.uniforms.uCamNearFar.value.set(cam.near, cam.far);
  }

  /** How strongly a cell grows a cloud right now (0 none .. 1 full). */
  private want(x: number, z: number, density: number): number {
    const p = 0.5 + 0.5 * this.patch.noise(x / 1150 + this.time * 0.0017, z / 1150 - this.time * 0.0013);
    let isle = 0;
    for (const i of this.islands) {
      // most islands are far off: a box test spares the square root
      const far = i.r * 1.1 + 170;
      if (Math.abs(x - i.x) >= far || Math.abs(z - i.z) >= far) continue;
      const d = Math.hypot(x - i.x, z - i.z);
      const k = smoothstep(i.r * 1.1 + 170, i.r * 0.4, d) * (i.kind === 'atoll' ? 0.55 : 1);
      if (k > isle) isle = k;
    }
    return density * 0.95 + (p - 0.5) * 1.05 + isle * 0.42 * (0.4 + density);
  }

  private cell(i: number, j: number): CloudDef {
    const key = (i + 32768) * 65536 + (j + 32768);
    let c = this.cells.get(key);
    if (!c) {
      if (this.cells.size > 4000) this.cells.clear();
      const rnd = mulberry32(Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ 0x5eed);
      c = { jx: (rnd() - 0.5) * 2 * JITTER, jz: (rnd() - 0.5) * 2 * JITTER, th: rnd(), base: BASE + rnd() * BASE_VAR, rot: rnd() * Math.PI, puffs: null, top: 0 };
      this.cells.set(key, c);
    }
    return c;
  }

  private ensurePuffs(c: CloudDef, i: number, j: number) {
    if (c.puffs) return c.puffs;
    const rnd = mulberry32(Math.imul(i, 83492791) ^ Math.imul(j, 2654435761) ^ 0xc10d);
    const b = buildPuffs(rnd, this.few);
    // turn the heap to its own bearing
    const cs = Math.cos(c.rot);
    const sn = Math.sin(c.rot);
    for (const p of b.puffs) {
      const x = p.x * cs - p.z * sn;
      p.z = p.x * sn + p.z * cs;
      p.x = x;
    }
    c.puffs = b.puffs;
    c.top = b.top;
    return c.puffs;
  }

  /**
   * Drifts and grows the clouds, then gathers the ones in view (sorted for
   * blending) and every shadow that lands near the view.
   * `focus` is the ship to keep clear of cloud, or null; `clear` false lets
   * the clouds sail over her as they would anything else (it eases over a
   * couple of seconds, so the hole never pops in or out).
   */
  update(
    dt: number,
    cam: THREE.PerspectiveCamera,
    target: THREE.Vector3,
    toSun: THREE.Vector3,
    w: { cover: number; rain: number; storm: number; fog: number; wind: number },
    windX: number,
    windZ: number,
    focus: THREE.Vector3 | null,
    clear = true,
  ) {
    this.time += dt;
    this.uniforms.uCloudTime.value = this.time;
    const sp = 2 + w.wind * 3.4;
    this.drift.x += windX * sp * dt;
    this.drift.y += windZ * sp * dt;
    this.uniforms.uDrift.value.copy(this.drift);

    // how cloudy the low sky is: a few lonely puffs when clear, a fair-weather
    // field, a crowd in a grey sky; rain and mist thin them into the murk
    const density = (0.08 + smoothstep(0.12, 0.55, w.cover) * 0.52) * (1 - w.fog * 0.5) * (1 - w.rain * 0.12);
    const grow = 0.85 + w.cover * 0.35;
    const grey = Math.min(0.85, w.storm * 0.75 + w.rain * 0.35 + smoothstep(0.5, 1, w.cover) * 0.15);
    this.uniforms.uGrey.value = grey;

    cam.updateMatrixWorld();
    _m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _f.setFromProjectionMatrix(_m);
    const camY = cam.position.y;

    // light comes from the sun no flatter than the shadow map's own slant
    const ly = Math.max(toSun.y, 0.22);
    const kx = toSun.x / ly;
    const kz = toSun.z / ly;

    // shadow map: world-fixed texels around the view, so shadows don't crawl
    const texel = (SH_HALF * 2) / SH_RES;
    const cx = Math.round(target.x / texel) * texel;
    const cz = Math.round(target.z / texel) * texel;
    // cells that can either be seen or throw a shadow into the map
    const sunOff = (BASE + 40) * 1;
    const ox = kx * sunOff;
    const oz = kz * sunOff;
    const pad = 80;
    const x0 = Math.min(target.x - REACH, cx + ox - SH_HALF) - pad - this.drift.x;
    const x1 = Math.max(target.x + REACH, cx + ox + SH_HALF) + pad - this.drift.x;
    const z0 = Math.min(target.z - REACH, cz + oz - SH_HALF) - pad - this.drift.y;
    const z1 = Math.max(target.z + REACH, cz + oz + SH_HALF) + pad - this.drift.y;
    const i0 = Math.floor(x0 / CELL);
    const i1 = Math.floor(x1 / CELL);
    const j0 = Math.floor(z0 / CELL);
    const j1 = Math.floor(z1 / CELL);

    const sp4 = this.sPuff.array as Float32Array;
    let ns = 0;
    let nv = 0;
    const vis = this.vis;
    const maxV = this.maxVis;
    const maxS = this.maxShadow;
    const t = this.time;

    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const c = this.cell(i, j);
        const wx = (i + 0.5) * CELL + c.jx + this.drift.x;
        const wz = (j + 0.5) * CELL + c.jz + this.drift.y;
        const g = smoothstep(c.th, c.th + 0.24, this.want(wx, wz, density));
        if (g <= 0.01) continue;
        const puffs = this.ensurePuffs(c, i, j);
        // a young cloud is a small, tight heap; it spreads as it grows
        const gs = grow * (0.55 + 0.45 * g);
        const base = c.base;
        const top = base + c.top * grow;
        // seen at all? only from well above, never from under or inside it
        const dT = Math.hypot(wx - target.x, wz - target.z);
        const far = 1 - smoothstep(REACH * 0.72, REACH, dT);
        let seen = smoothstep(top + 20, top + 62, camY) * far;
        if (seen > 0.004) {
          _s.center.set(wx, base + c.top * 0.5, wz);
          _s.radius = 60;
          if (!_f.intersectsSphere(_s)) seen = 0;
        }
        const first = nv;
        for (const p of puffs) {
          const k = smoothstep(p.th, p.th + 0.32, g);
          if (k <= 0.01) continue;
          const r = p.r * gs * (0.3 + 0.7 * k) * (1 + 0.04 * Math.sin(t * 0.07 + p.seed * 40));
          const px = wx + p.x * gs;
          const py = base + p.y * gs;
          const pz = wz + p.z * gs;
          // its shadow on the sea, along the sun
          if (ns < maxS) {
            const o = ns * 4;
            sp4[o] = px - kx * py;
            sp4[o + 1] = pz - kz * py;
            sp4[o + 2] = r;
            sp4[o + 3] = Math.min(1, k * 1.2) * (0.75 + 0.25 * Math.min(1, r / 14));
            ns++;
          }
          if (seen > 0.004 && nv < maxV) {
            const o = nv * 12;
            vis[o] = px;
            vis[o + 1] = py;
            vis[o + 2] = pz;
            vis[o + 3] = r;
            vis[o + 4] = 1; // sunlight through the rest of the cloud (below)
            vis[o + 5] = Math.min(1, k * 1.4) * seen;
            vis[o + 6] = p.seed;
            vis[o + 7] = 0;
            vis[o + 8] = base;
            vis[o + 9] = top;
            nv++;
          }
        }
        // the cloud shades itself: one ray per puff toward the sun through the others
        for (let a = first; a < nv; a++) {
          const oa = a * 12;
          // from the puff's sunward face: the outer billows catch the light first
          const ra = vis[oa + 3] * 0.75;
          const ax = vis[oa] + toSun.x * ra;
          const ay = vis[oa + 1] + toSun.y * ra;
          const az = vis[oa + 2] + toSun.z * ra;
          let tau = 0;
          for (let b = first; b < nv; b++) {
            if (b === a) continue;
            const ob = b * 12;
            const dx = vis[ob] - ax;
            const dy = vis[ob + 1] - ay;
            const dz = vis[ob + 2] - az;
            const along = dx * toSun.x + dy * toSun.y + dz * toSun.z;
            if (along <= 0) continue;
            const rb = vis[ob + 3];
            const d2 = dx * dx + dy * dy + dz * dz - along * along;
            if (d2 >= rb * rb) continue;
            tau += 2 * Math.sqrt(rb * rb - d2) * Math.min(1, vis[ob + 5] * 1.5);
          }
          vis[oa + 4] = Math.max(0.15, Math.exp(-tau * 0.05));
        }
      }
    }

    // ---- the visible puffs, far to near
    const key = this.visKey;
    const cp = cam.position;
    for (let n = 0; n < nv; n++) {
      const o = n * 12;
      _v.set(vis[o] - cp.x, vis[o + 1] - cp.y, vis[o + 2] - cp.z);
      key[n] = _v.lengthSq();
    }
    const order = this.order;
    order.length = nv;
    for (let n = 0; n < nv; n++) order[n] = n;
    order.sort((a, b) => key[b] - key[a]);
    const P4 = this.aPuff.array as Float32Array;
    const L4 = this.aLight.array as Float32Array;
    const C4 = this.aCloud.array as Float32Array;
    for (let n = 0; n < nv; n++) {
      const o = order[n] * 12;
      const d = n * 4;
      P4[d] = vis[o];
      P4[d + 1] = vis[o + 1];
      P4[d + 2] = vis[o + 2];
      P4[d + 3] = vis[o + 3];
      L4[d] = vis[o + 4];
      L4[d + 1] = vis[o + 5];
      L4[d + 2] = vis[o + 6];
      L4[d + 3] = vis[o + 7];
      C4[d] = vis[o + 8];
      C4[d + 1] = vis[o + 9];
    }
    this.geo.instanceCount = nv;
    this.mesh.visible = nv > 0;
    if (this.warm) {
      this.geo.instanceCount = Math.max(1, nv);
      this.mesh.visible = true;
    }
    if (nv > 0) {
      this.aPuff.addUpdateRange(0, nv * 4);
      this.aLight.addUpdateRange(0, nv * 4);
      this.aCloud.addUpdateRange(0, nv * 4);
      this.aPuff.needsUpdate = true;
      this.aLight.needsUpdate = true;
      this.aCloud.needsUpdate = true;
    }

    // keep the ship you sail in sight
    const fu = this.uniforms.uFocus.value;
    this.focusW += ((clear ? 1 : 0) - this.focusW) * (1 - Math.exp(-dt * 1.6));
    fu.z = 0;
    if (focus && nv > 0 && this.focusW > 0.005) {
      _v.copy(focus).project(cam);
      if (_v.z < 1 && Math.abs(_v.x) < 1.2 && Math.abs(_v.y) < 1.2) {
        const res = this.uniforms.uResolution.value;
        fu.set((_v.x * 0.5 + 0.5) * res.x, (_v.y * 0.5 + 0.5) * res.y, this.focusW);
      }
    }

    // ---- shadows
    this.sgeo.instanceCount = this.warm ? Math.max(1, ns) : ns;
    if (ns > 0) {
      this.sPuff.addUpdateRange(0, ns * 4);
      this.sPuff.needsUpdate = true;
    }
    this.shUniforms.uCentre.value.set(cx, cz, 1 / SH_HALF);
    this.shUniforms.uToSun.value.set(toSun.x, ly, toSun.z);
    const xf = globalUniforms.uLowCloudXf.value;
    xf.set(cx, cz, 1 / (SH_HALF * 2), ns > 0 ? 0.8 * (1 - w.storm * 0.4) : 0);
  }

  /** Splats this frame's cloud shadows into the map the world's materials read. */
  renderShadow(renderer: THREE.WebGLRenderer) {
    const n = this.sgeo.instanceCount;
    if (n === 0 && !this.shadowLive) return;
    const prev = renderer.getRenderTarget();
    const clear = renderer.getClearAlpha();
    const cc = renderer.getClearColor(_c);
    renderer.setRenderTarget(this.shadowRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    if (n > 0) renderer.render(this.shadowScene, this.shadowCam);
    renderer.setClearColor(cc, clear);
    renderer.setRenderTarget(prev);
    this.shadowLive = n > 0;
  }
}

const _c = new THREE.Color();
