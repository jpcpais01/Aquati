import * as THREE from 'three';

// Screen-space ray tracing for the opaque world. WebGL has no hardware ray
// tracing, so rays are marched through the depth buffer instead: the same
// idea games use for SSAO, SSGI and contact shadows, all in one half-res pass.
//
//   trace (half res, 2 targets)
//     A: one-bounce colour (rgb) + ambient occlusion (a)
//        cosine-distributed rays around the depth-rebuilt normal; a ray that
//        ducks behind nearer geometry is occluded, and that geometry's colour
//        is light bounced onto us (warm sand under a hull, green under palms)
//     B: sun loss (r) + linear depth (g)
//        a ray marched toward the sun: whatever it slips behind casts a crisp
//        contact shadow the shadow map is too coarse to resolve (crew, guns,
//        rigging, rocks on sand). Only applied where the shadow map says lit,
//        so the two never double up.
//   denoise (half res): depth-aware box over the 4x4 noise tile
//   apply (in the final pass): depth-aware 2x2 upsample, see GLSL_SS_APPLY

const FS_VERT = /* glsl */ `
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const COMMON = /* glsl */ `
precision highp float;
uniform sampler2D uDepth;
uniform vec2 uNearFar;
uniform mat4 uInvProj;
float linZ(float d) {
  float n = uNearFar.x, f = uNearFar.y;
  return (n * f) / (f - d * (f - n));
}
vec3 viewPos(vec2 uv, float d) {
  vec4 p = uInvProj * vec4(vec3(uv, d) * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
float bayer4(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  const float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[i.x + i.y * 4] + 0.5) / 16.0;
}
float bayer2(vec2 p) {
  ivec2 i = ivec2(mod(p, 2.0));
  return (float(i.x * 2 + i.y * 3 - i.x * i.y * 4) + 0.5) / 4.0;
}
`;

const TRACE_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D uColor;
uniform vec2 uFullTexel;
uniform mat4 uProj;
uniform mat4 uInvView;
uniform vec3 uSunView;
uniform vec4 uAo;   // radius base, radius per metre of depth, bias base, bias per metre
uniform vec4 uCs;   // length base, length per metre, thickness base, thickness per metre
#if CS_STEPS > 0
uniform sampler2DShadow uShadowMap;
uniform mat4 uShadowMatrix;
uniform vec2 uShadowTexel;
uniform float uHasShadow;
#endif
in vec2 vUv;
layout(location = 0) out highp vec4 oA;
layout(location = 1) out highp vec4 oB;

vec2 project(vec3 v) {
  vec4 c = uProj * vec4(v, 1.0);
  return c.xy / c.w * 0.5 + 0.5;
}
bool offscreen(vec2 uv) { return uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0; }

void main() {
  // Work on one real full-res pixel per half-res pixel. The half-res centre
  // falls exactly on the corner between four full-res pixels, and nearest
  // sampling there rounds one way on some rows and the other way on others:
  // P and its neighbours then come from mismatched pixels, the rebuilt normal
  // flips row by row, and the sun march paints horizontal lines.
  vec2 t = uFullTexel;
  ivec2 lim = textureSize(uDepth, 0) - 1;
  ivec2 pc = min(ivec2(gl_FragCoord.xy) * 2, lim);
  vec2 uv = (vec2(pc) + 0.5) * t;
  float d = texelFetch(uDepth, pc, 0).r;
  if (d >= 0.99999) { oA = vec4(0.0, 0.0, 0.0, 1.0); oB = vec4(0.0, 1e4, 0.0, 1.0); return; }
  vec3 P = viewPos(uv, d);
  float z = -P.z;

  // normal from depth: per axis, take whichever neighbour sits on the same
  // surface (smaller step) so silhouettes don't smear the normal
  ivec2 ir = min(pc + ivec2(1, 0), lim), il = max(pc - ivec2(1, 0), ivec2(0));
  ivec2 iu = min(pc + ivec2(0, 1), lim), id = max(pc - ivec2(0, 1), ivec2(0));
  vec3 Pr = viewPos((vec2(ir) + 0.5) * t, texelFetch(uDepth, ir, 0).r);
  vec3 Pl = viewPos((vec2(il) + 0.5) * t, texelFetch(uDepth, il, 0).r);
  vec3 Pu = viewPos((vec2(iu) + 0.5) * t, texelFetch(uDepth, iu, 0).r);
  vec3 Pd = viewPos((vec2(id) + 0.5) * t, texelFetch(uDepth, id, 0).r);
  vec3 dx = abs(Pr.z - P.z) < abs(P.z - Pl.z) ? Pr - P : P - Pl;
  vec3 dy = abs(Pu.z - P.z) < abs(P.z - Pd.z) ? Pu - P : P - Pd;
  vec3 N = normalize(cross(dx, dy));

  float noise = bayer4(gl_FragCoord.xy);

  // ---- ambient occlusion + one bounce
  float ao = 1.0;
  vec3 gi = vec3(0.0);
#if AO_SAMPLES > 0
  {
    float r = uAo.x + z * uAo.y;
    float bias = uAo.z + z * uAo.w;
    vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
    vec3 T = normalize(cross(up, N));
    vec3 B = cross(N, T);
    float occ = 0.0;
    for (int i = 0; i < AO_SAMPLES; i++) {
      float fi = (float(i) + 0.5) / float(AO_SAMPLES);
      float phi = (float(i) * 0.618034 + noise) * 6.2831853;
      // cosine-weighted direction, lengths spread toward the centre
      float sr = sqrt(fi);
      vec3 dir = T * (cos(phi) * sr) + B * (sin(phi) * sr) + N * sqrt(1.0 - fi);
      float h = fract(float(i) * 0.7548777 + noise * 0.37 + 0.13);
      vec3 S = P + dir * r * mix(0.12, 1.0, h * h);
      vec2 suv = project(S);
      if (offscreen(suv)) continue;
      float dq = textureLod(uDepth, suv, 0.0).r;
      if (dq >= 0.99999) continue;
      vec3 Q = viewPos(suv, dq);
      // Q is nearer the eye than the sample: the ray ducked behind something
      float hidden = step(bias, Q.z - S.z);
      float inRange = smoothstep(0.0, 1.0, r / max(abs(P.z - Q.z), 1e-3));
      float o = hidden * inRange;
      occ += o;
  #if GI
      gi += textureLod(uColor, suv, 0.0).rgb * o;
  #endif
    }
    ao = 1.0 - occ / float(AO_SAMPLES);
    gi /= float(AO_SAMPLES);
  }
#endif

  // ---- ray-marched sun shadows
  float loss = 0.0;
#if CS_STEPS > 0
  float ndl = dot(N, uSunView);
  // contact shadows are for the small things up close the shadow map can't
  // resolve; far off, the map covers it and a depth-buffer march over a few
  // pixels of foliage only sparkles and crawls as the view moves
  float near = 1.0 - smoothstep(90.0, 220.0, z);
  // ...and for surfaces that face the camera: on one seen edge-on (a sail
  // turned away, the seabed or the sea's underside at a glance) each pixel row
  // jumps in depth, so a march along it hits and misses row by row and paints
  // horizontal lines. The shadow map has those surfaces covered anyway.
  near *= smoothstep(0.12, 0.3, dot(N, normalize(-P)));
  if (ndl > 0.0 && near > 0.0) {
    float len = uCs.x + z * uCs.y;
    // 2x2 jitter so the denoiser can keep these crisp
    float j = bayer2(gl_FragCoord.xy);
    vec3 start = P + N * (0.03 + z * 0.0012);
    float occl = 0.0;
    for (int i = 0; i < CS_STEPS; i++) {
      float s = (float(i) + j) / float(CS_STEPS);
      vec3 R = start + uSunView * (len * s * s);
      vec2 ruv = project(R);
      if (offscreen(ruv)) break;
      float dq = textureLod(uDepth, ruv, 0.0).r;
      if (dq >= 0.99999) continue;
      float zr = -R.z;
      float dz = zr - linZ(dq);
      if (dz > 0.02 + zr * 0.0012 && dz < uCs.z + zr * uCs.w) {
        vec2 e = min(ruv, 1.0 - ruv);
        occl = smoothstep(0.0, 0.04, min(e.x, e.y)) * (1.0 - s * s * 0.5);
        break;
      }
    }
    float lit = 1.0;
    if (uHasShadow > 0.5 && occl > 0.0) {
      vec3 Nw = mat3(uInvView) * N;
      vec4 sc = uShadowMatrix * vec4((uInvView * vec4(P, 1.0)).xyz + Nw * 0.08, 1.0);
      vec3 sp = sc.xyz / sc.w;
      if (!offscreen(sp.xy) && sp.z <= 1.0) {
        vec2 o = uShadowTexel;
        float rz = sp.z - 0.0008;
        lit = 0.25 * (texture(uShadowMap, vec3(sp.xy + vec2(-o.x, -o.y), rz)) + texture(uShadowMap, vec3(sp.xy + vec2(o.x, -o.y), rz))
          + texture(uShadowMap, vec3(sp.xy + vec2(-o.x, o.y), rz)) + texture(uShadowMap, vec3(sp.xy + vec2(o.x, o.y), rz)));
      }
    }
    loss = occl * lit * smoothstep(0.0, 0.25, ndl) * near;
  }
#endif

  oA = vec4(gi, ao);
  oB = vec4(loss, z, 0.0, 1.0);
}`;

const DENOISE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uA;
uniform sampler2D uB;
uniform vec2 uTexel;
in vec2 vUv;
layout(location = 0) out highp vec4 oA;
layout(location = 1) out highp vec4 oB;
void main() {
  vec4 c = texture(uB, vUv);
  float z0 = c.g;
  if (z0 > 9e3) { oA = vec4(0.0, 0.0, 0.0, 1.0); oB = c; return; }
  // depth tolerance grows with how steeply the surface recedes per texel, so a
  // slanted plane still averages across rows instead of keeping each row's
  // own noise (one-sided steps per axis, so silhouettes stay sharp)
  float zu = texture(uB, vUv + vec2(0.0, uTexel.y)).g;
  float zd = texture(uB, vUv - vec2(0.0, uTexel.y)).g;
  float zr = texture(uB, vUv + vec2(uTexel.x, 0.0)).g;
  float zl = texture(uB, vUv - vec2(uTexel.x, 0.0)).g;
  float slope = max(min(abs(zu - z0), abs(z0 - zd)), min(abs(zr - z0), abs(z0 - zl)));
  float k = 1.0 / (z0 * 0.012 + 0.05 + slope * 2.5);
  vec4 sa = vec4(0.0);
  float wa = 0.0;
  float ss = 0.0;
  float ws = 0.0;
  // 4x4 window: exactly one period of the trace noise
  for (int y = -2; y <= 1; y++) {
    for (int x = -2; x <= 1; x++) {
      vec2 uv = vUv + vec2(float(x), float(y)) * uTexel;
      vec4 b = texture(uB, uv);
      float w = exp(-abs(b.g - z0) * k);
      sa += texture(uA, uv) * w;
      wa += w;
      // shadows only take the inner 2x2, they should stay sharp
      if (x >= -1 && x <= 0 && y >= -1 && y <= 0) { ss += b.r * w; ws += w; }
    }
  }
  oA = sa / max(wa, 1e-4);
  oB = vec4(ss / max(ws, 1e-4), z0, 0.0, 1.0);
}`;

/** Included by the pipeline's final pass. Expects uDepth / linZ from the host. */
export const GLSL_SS_APPLY = /* glsl */ `
uniform sampler2D uSSA;
uniform sampler2D uSSB;
uniform vec2 uSSTexel;
uniform vec3 uSSStrength; // ao, bounce, sun loss
uniform vec3 uShadowTint;
uniform sampler2D uSceneDepth;
uniform vec2 uSSNearFar;
float ssLinZ(float d) {
  float n = uSSNearFar.x, f = uSSNearFar.y;
  return (n * f) / (f - d * (f - n));
}
vec3 applySS(vec3 col, vec2 uv) {
  float d = texture2D(uSceneDepth, uv).r;
  if (d >= 0.99999) return col;
  float z = ssLinZ(d);
  // depth-aware 2x2 upsample from the half-res result
  vec2 hp = uv / uSSTexel - 0.5;
  vec2 f = fract(hp);
  vec2 base = (floor(hp) + 0.5) * uSSTexel;
  vec4 A = vec4(0.0);
  float S = 0.0;
  float W = 0.0;
  float k = 1.0 / (z * 0.01 + 0.05);
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      vec2 tuv = base + vec2(float(i), float(j)) * uSSTexel;
      vec4 b = texture2D(uSSB, tuv);
      float bw = (i == 0 ? 1.0 - f.x : f.x) * (j == 0 ? 1.0 - f.y : f.y);
      float w = bw * exp(-abs(b.g - z) * k) + 1e-5;
      A += texture2D(uSSA, tuv) * w;
      S += b.r * w;
      W += w;
    }
  }
  A /= W;
  S /= W;
  vec3 gi = A.rgb;
  col *= mix(1.0, A.a, uSSStrength.x);
  col *= mix(vec3(1.0), uShadowTint, S * uSSStrength.z);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col += gi * (col / (l + 0.6)) * uSSStrength.y;
  return col;
}
`;

export interface TraceConfig {
  ao: boolean;
  gi: boolean;
  shadows: boolean;
  aoSamples: number;
  shadowSteps: number;
}

function mrtMaterial(frag: string, uniforms: Record<string, THREE.IUniform>, defines: Record<string, number> = {}) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: FS_VERT,
    fragmentShader: frag,
    uniforms,
    defines,
    depthTest: false,
    depthWrite: false,
  });
}

export class ScreenSpaceLighting {
  private trace: THREE.ShaderMaterial;
  private denoise: THREE.ShaderMaterial;
  private raw: THREE.WebGLRenderTarget | null = null;
  private clean: THREE.WebGLRenderTarget | null = null;
  private quad: THREE.Mesh;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private sunView = new THREE.Vector3();
  config: TraceConfig = { ao: true, gi: false, shadows: true, aoSamples: 8, shadowSteps: 12 };
  width = 0;
  height = 0;

  constructor() {
    this.trace = mrtMaterial(
      TRACE_FRAG,
      {
        uDepth: { value: null },
        uColor: { value: null },
        uNearFar: { value: new THREE.Vector2(1, 1000) },
        uFullTexel: { value: new THREE.Vector2() },
        uProj: { value: new THREE.Matrix4() },
        uInvProj: { value: new THREE.Matrix4() },
        uInvView: { value: new THREE.Matrix4() },
        uSunView: { value: new THREE.Vector3(0, 1, 0) },
        uAo: { value: new THREE.Vector4(1.6, 0.012, 0.03, 0.0015) },
        uCs: { value: new THREE.Vector4(3.5, 0.03, 0.45, 0.012) },
        uShadowMap: { value: null },
        uShadowMatrix: { value: new THREE.Matrix4() },
        uShadowTexel: { value: new THREE.Vector2(1 / 2048, 1 / 2048) },
        uHasShadow: { value: 0 },
      },
      { AO_SAMPLES: 8, GI: 0, CS_STEPS: 12 },
    );
    this.denoise = mrtMaterial(DENOISE_FRAG, { uA: { value: null }, uB: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.trace);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  get enabled() {
    return this.config.ao || this.config.shadows;
  }

  configure(c: TraceConfig) {
    this.config = c;
    const def = this.trace.defines as Record<string, number>;
    const ao = c.ao || c.gi ? c.aoSamples : 0;
    const gi = c.gi ? 1 : 0;
    const cs = c.shadows ? c.shadowSteps : 0;
    if (def.AO_SAMPLES !== ao || def.GI !== gi || def.CS_STEPS !== cs) {
      def.AO_SAMPLES = ao;
      def.GI = gi;
      def.CS_STEPS = cs;
      this.trace.needsUpdate = true;
    }
  }

  setSize(fullW: number, fullH: number) {
    const w = Math.max(1, fullW >> 1);
    const h = Math.max(1, fullH >> 1);
    if (w === this.width && h === this.height && this.raw) return;
    this.width = w;
    this.height = h;
    this.raw?.dispose();
    this.clean?.dispose();
    const opts = { type: THREE.HalfFloatType, count: 2, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
    this.raw = new THREE.WebGLRenderTarget(w, h, opts);
    this.clean = new THREE.WebGLRenderTarget(w, h, opts);
  }

  /** Denoised results: [bounce + AO, sun loss + depth]. */
  get textures(): [THREE.Texture, THREE.Texture] | null {
    return this.clean ? [this.clean.textures[0], this.clean.textures[1]] : null;
  }

  render(renderer: THREE.WebGLRenderer, color: THREE.Texture, depth: THREE.Texture, fullW: number, fullH: number, camera: THREE.PerspectiveCamera, sun: THREE.DirectionalLight, sunDir: THREE.Vector3) {
    this.setSize(fullW, fullH);
    const u = this.trace.uniforms;
    u.uDepth.value = depth;
    u.uColor.value = color;
    u.uNearFar.value.set(camera.near, camera.far);
    u.uFullTexel.value.set(1 / fullW, 1 / fullH);
    u.uProj.value.copy(camera.projectionMatrix);
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uInvView.value.copy(camera.matrixWorld);
    this.sunView.copy(sunDir).transformDirection(camera.matrixWorldInverse);
    u.uSunView.value.copy(this.sunView);
    const sh = sun.shadow;
    const ready = sun.castShadow && !!sh.map?.depthTexture;
    u.uHasShadow.value = ready ? 1 : 0;
    if (ready) {
      u.uShadowMap.value = sh.map!.depthTexture;
      u.uShadowMatrix.value.copy(sh.matrix);
      u.uShadowTexel.value.set(1 / sh.mapSize.x, 1 / sh.mapSize.y);
    }

    this.quad.material = this.trace;
    renderer.setRenderTarget(this.raw);
    renderer.render(this.scene, this.cam);

    const du = this.denoise.uniforms;
    du.uA.value = this.raw!.textures[0];
    du.uB.value = this.raw!.textures[1];
    du.uTexel.value.set(1 / this.width, 1 / this.height);
    this.quad.material = this.denoise;
    renderer.setRenderTarget(this.clean);
    renderer.render(this.scene, this.cam);
  }

  dispose() {
    this.raw?.dispose();
    this.clean?.dispose();
    this.trace.dispose();
    this.denoise.dispose();
  }
}
