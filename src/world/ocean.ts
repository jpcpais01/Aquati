import * as THREE from 'three';
import { GLSL_AERIAL, GLSL_ATMOS, globalUniforms } from '../render/environment';
import { getSharedTextures } from '../render/textures';
import { GLSL_WAVES, packWaves, Wave } from './waves';
import { WORLD_SIZE } from './terrain';
import { WakeField } from './wakeField';
import { GLSL_SURF, shoreUniforms } from './shore';
import { GLSL_VORTEX, VORTEX_N } from './vortex';

// The ocean: Gerstner swell on a camera-following, centre-dense grid, shaded
// with depth-aware Beer–Lambert absorption over the refracted scene, sky
// reflection, sun glitter, crest sub-surface glow, and foam: breaking surf,
// hull and waterline contact, whitecaps and ship wakes. The surf (see
// shore.ts) rolls in to every beach, stands up and spills into whitewater
// that thins into lace as its bubbles pop, picked up on the sand by the
// ground shader's swash. Ship wakes come from
// a live wave simulation (see WakeField): its height lifts the surface and
// bends the normals, and its foam breaks up into lace as it ages. Open water
// layers anti-tiled ripples, wind slicks and gust cat's paws over the swell,
// with slow macro noise drifting its colour so it never reads as a pattern.
// Reflections are ray traced in screen space: each pixel marches its
// reflected ray through the opaque depth buffer, so hulls, sails and island
// cliffs mirror in the water, rippling with the surface, over a sky fallback.
// The march runs in its own half-resolution pass (a second draw of the same
// surface, see `reflScene`); the full-resolution shading reads it back,
// wobbled by the fine ripples, so tracing costs a quarter of what it would.
// Weather reaches in too: rain pocks the surface with rings and splashes,
// storms darken and steepen the sea and streak it with wind-blown spume, and
// at night ship wakes and breaking surf glow with bioluminescence.

/**
 * The sea grid, denser near the middle, cut into TILES x TILES patches that
 * share one vertex buffer. Each patch has its own bounds (padded for the
 * swell), so the ones behind the camera are skipped like any other mesh
 * instead of being transformed and clipped every frame. The vertices are the
 * same as one whole grid's, so the seams are exact.
 */
const TILES = 8;
const SWELL_PAD = 12;
function buildGrid(segments: number, half: number): THREE.BufferGeometry[] {
  const n = segments + 1;
  const pos = new Float32Array(n * n * 3);
  const a = 0.26;
  const map = (u: number) => half * (a * u + (1 - a) * u * u * u);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const u = (i / segments) * 2 - 1;
      const v = (j / segments) * 2 - 1;
      const k = (j * n + i) * 3;
      pos[k] = map(u);
      pos[k + 1] = 0;
      pos[k + 2] = map(v);
    }
  }
  const position = new THREE.BufferAttribute(pos, 3);
  const cut = (t: number) => Math.round((t * segments) / TILES);
  const out: THREE.BufferGeometry[] = [];
  for (let tj = 0; tj < TILES; tj++) {
    for (let ti = 0; ti < TILES; ti++) {
      const i0 = cut(ti), i1 = cut(ti + 1), j0 = cut(tj), j1 = cut(tj + 1);
      const idx = new Uint32Array((i1 - i0) * (j1 - j0) * 6);
      let p = 0;
      for (let j = j0; j < j1; j++) {
        for (let i = i0; i < i1; i++) {
          const a0 = j * n + i;
          const b0 = a0 + 1;
          const c0 = a0 + n;
          const d0 = c0 + 1;
          idx[p++] = a0;
          idx[p++] = c0;
          idx[p++] = b0;
          idx[p++] = b0;
          idx[p++] = c0;
          idx[p++] = d0;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', position);
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      const x0 = pos[(j0 * n + i0) * 3], x1 = pos[(j0 * n + i1) * 3];
      const z0 = pos[(j0 * n + i0) * 3 + 2], z1 = pos[(j1 * n + i0) * 3 + 2];
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2), Math.hypot(x1 - x0, z1 - z0) / 2 + SWELL_PAD);
      out.push(g);
    }
  }
  return out;
}

/** The tiled grid as one object to move about. */
function gridMesh(tiles: THREE.BufferGeometry[], material: THREE.Material, order = 0): THREE.Group {
  const g = new THREE.Group();
  for (const geo of tiles) {
    const m = new THREE.Mesh(geo, material);
    m.renderOrder = order;
    g.add(m);
  }
  return g;
}

/** A coarse square apron from just inside the grid's rim out toward the horizon,
 *  so the sea runs all the way to the sky from the captain's eyes. */
function buildApron(inner: number, outer: number): THREE.BufferGeometry {
  const P = 64;
  const R = 7;
  const pos: number[] = [];
  for (let j = 0; j <= R; j++) {
    const r = inner * Math.pow(outer / inner, j / R);
    for (let k = 0; k < P; k++) {
      // walk the square's perimeter
      const u = (k / P) * 4;
      const side = Math.floor(u);
      const f = (u - side) * 2 - 1;
      const [x, z] = side === 0 ? [f, -1] : side === 1 ? [1, f] : side === 2 ? [-f, 1] : [-1, -f];
      pos.push(x * r, 0, z * r);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < R; j++) {
    for (let k = 0; k < P; k++) {
      const a = j * P + k;
      const b = j * P + ((k + 1) % P);
      const c = a + P;
      const d = b + P;
      idx.push(a, b, c, b, d, c);
    }
  }
  // face up, whichever way the perimeter winds
  const [ax, az, bx, bz, cx, cz] = [pos[0], pos[2], pos[3], pos[5], pos[P * 3], pos[P * 3 + 2]];
  if ((bz - az) * (cx - ax) - (bx - ax) * (cz - az) < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), outer * 1.5);
  return g;
}

const OCEAN_VERT = /* glsl */ `
  ${GLSL_WAVES}
  uniform float uTime;
  uniform sampler2D uNoiseTex;
  uniform sampler2D uHeightTex;
  uniform vec4 uWorldRect;
  uniform sampler2D uWakeTex;
  uniform vec4 uWakeRect;
  ${GLSL_SURF}
  ${GLSL_VORTEX}
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vCrest;
  varying float vTerrain;
  varying float vViewDist;
  varying vec4 vShore;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec2 huv = (wp.xz - uWorldRect.xy) * uWorldRect.w;
    float th = texture(uHeightTex, huv).r;
    vTerrain = th;
    float damp = clamp(-th / 8.0, 0.12, 1.0);
    // a maelstrom smooths the swell as it spins the water round, and draws
    // the surface down into its funnel (the CPU buoyancy reads the same shape)
    vec2 vxGrad;
    float vxDip = vortexDip(wp.xz, vxGrad);
    damp *= vortexCalm(wp.xz);
    vec3 n; float crest;
    vec3 off = gerstner(wp.xz, uTime, damp, length(wp.xz - cameraPosition.xz), n, crest);
    wp.xyz += off;
    wp.y -= vxDip;
    n.xz += vxGrad * n.y;
    // wake waves ride on top of the swell
    vec2 wuv = (wp.xz - uWakeRect.xy) * uWakeRect.w + 0.5;
    vec2 wb = min(wuv, 1.0 - wuv);
    float wIn = smoothstep(0.0, 0.04, min(wb.x, wb.y));
    wp.y += clamp(texture(uWakeTex, wuv).g, -0.9, 0.9) * wIn;
    // surf: breakers lift the water as they roll in over the shallows (the
    // sharp face and the foam come per pixel, in the fragment shader)
    vec4 sf = shoreField(wp.xz);
    float reach = mix(0.22, 1.0, sf.a) * (1.0 - smoothstep(12.0, 17.0, sf.r));
    float psi = surfPhase(wp.xz, sf.r);
    if (reach * (1.0 - smoothstep(4.5, 8.0, -th)) > 0.001) {
      float sth = fract(psi);
      vec3 sw = surfWave(wp.xz, floor(psi) + step(0.7, sth), max(-th, 0.0), reach);
      wp.y += sw.x * (surfShape(sth, 0.3) - 0.37);
    }
    vShore = vec4(psi, sf.gb, reach);
    vWorld = wp.xyz;
    vNormal = n;
    vCrest = crest;
    vec4 mv = viewMatrix * wp;
    vViewDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const GLSL_SCENE = /* glsl */ `
  uniform sampler2D uSceneColor;
  uniform sampler2D uSceneDepth;
  uniform vec2 uResolution;
  uniform vec2 uCamNearFar;
  float linearDepth(float d) {
    float n = uCamNearFar.x, f = uCamNearFar.y;
    return (n * f) / (f - d * (f - n));
  }`;

// The half-resolution reflection pass. It marches each reflected ray through
// the opaque depth buffer: steps bunch up near the surface, where reflections
// touch their objects, then a short bisection pins the hit down. Out comes
// the hit colour, premultiplied by its strength.
const REFL_FRAG = /* glsl */ `
  ${GLSL_ATMOS}
  ${GLSL_SCENE}
  uniform sampler2D uNormalTex;
  uniform mat4 uSSRProj;
  uniform vec4 uSSR;
  uniform vec2 uReflRes;
  // the ray-tracing pass's half-res linear depth (g), when it ran this frame:
  // a quarter of the texels of the full depth buffer, already linear
  uniform sampler2D uHalfZ;
  uniform float uHalfZOn;
  float sceneZ(vec2 uv) {
    return uHalfZOn > 0.5 ? texture(uHalfZ, uv).g : linearDepth(texture(uSceneDepth, uv).r);
  }
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vViewDist;

  vec4 traceReflection(vec3 wp, vec3 R) {
    vec3 vp = (viewMatrix * vec4(wp, 1.0)).xyz;
    vec3 vr = (viewMatrix * vec4(R, 0.0)).xyz;
    float prev = 0.0;
    for (int i = 0; i < SSR_STEPS; i++) {
      float s = (float(i) + 0.5) / float(SSR_STEPS);
      float dist = uSSR.x * s * s;
      vec3 q = vp + vr * dist;
      vec4 c = uSSRProj * vec4(q, 1.0);
      if (c.w <= 0.0) break;
      vec2 uv = c.xy / c.w * 0.5 + 0.5;
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break;
      float sz = sceneZ(uv);
      float dz = -q.z - sz;
      // the opaque buffer also holds what lies under the sea (keels,
      // the seabed); a ray above the water can't see those
      float wy = cameraPosition.y + (wp.y + R.y * dist - cameraPosition.y) * sz / max(-q.z, 1e-3);
      // never thinner than the step, or rays skip clean through sails
      float thick = max(uSSR.y + (-q.z) * uSSR.z, (dist - prev) * 1.5);
      if (dz > 0.0 && dz < thick && wy > -0.35) {
        float a = prev, b = dist;
        for (int k = 0; k < 4; k++) {
          float m = 0.5 * (a + b);
          vec3 qm = vp + vr * m;
          vec4 cm = uSSRProj * vec4(qm, 1.0);
          vec2 um = cm.xy / cm.w * 0.5 + 0.5;
          if (-qm.z - sceneZ(um) > 0.0) { b = m; uv = um; } else a = m;
        }
        vec2 e = min(uv, 1.0 - uv);
        float fade = smoothstep(0.0, 0.06, min(e.x, e.y)) * (1.0 - smoothstep(0.5, 1.0, b / uSSR.x));
        // ropes and stays are a pixel wide: rays hit them only here and
        // there, which reads as dotted noise. Keep hits on solid surfaces.
        float hz = sceneZ(uv);
        vec2 px = 2.0 / uResolution;
        float tol = 0.6 + hz * 0.01;
        float solid = step(abs(sceneZ(uv + vec2(px.x, 0.0)) - hz), tol)
          + step(abs(sceneZ(uv - vec2(px.x, 0.0)) - hz), tol)
          + step(abs(sceneZ(uv + vec2(0.0, px.y)) - hz), tol)
          + step(abs(sceneZ(uv - vec2(0.0, px.y)) - hz), tol);
        fade *= smoothstep(1.5, 3.5, solid);
        return vec4(texture(uSceneColor, uv).rgb, fade);
      }
      prev = dist;
    }
    return vec4(0.0);
  }

  void main() {
    // water hidden well behind an island or hull needs no reflection; a
    // little slack keeps the waterline valid for the full-res upsample
    vec2 suv = gl_FragCoord.xy / uReflRes;
    if (linearDepth(texture(uSceneDepth, suv).r) < linearDepth(gl_FragCoord.z) - 1.5) discard;
    // trace along the smooth swell so neighbouring pixels agree; the main
    // pass lets the fine ripples wobble the image instead of scattering rays
    float t = uTime;
    vec2 p = vWorld.xz;
    vec2 wdrift = uWindDrift;
    vec2 wpdrift = vec2(-wdrift.y, wdrift.x);
    vec2 r1 = texture(uNormalTex, mat2(0.825, -0.565, 0.565, 0.825) * p * 0.031 + wdrift * 0.021).xy * 2.0 - 1.0;
    vec2 r2 = texture(uNormalTex, mat2(-0.416, -0.909, 0.909, -0.416) * p * 0.067 + wpdrift * 0.017 + 0.37).xy * 2.0 - 1.0;
    vec2 rip = (r1 * mat2(0.825, -0.565, 0.565, 0.825)) * 0.8 + (r2 * mat2(-0.416, -0.909, 0.909, -0.416)) * 0.7;
    rip *= (0.6 + 0.4 * (1.0 - smoothstep(140.0, 520.0, vViewDist))) * (1.0 + uStorm * 0.9);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 Rs = reflect(-V, normalize(normalize(vNormal) + vec3(rip.x, 0.0, rip.y) * 0.08));
    Rs.y = abs(Rs.y);
    vec4 hit = traceReflection(vWorld, Rs);
    gl_FragColor = vec4(hit.rgb * hit.a, hit.a);
  }`;

// The surface from below. Looking up, light from the sky bends in through a
// bright circle overhead (Snell's window); past the critical angle the surface
// reflects the deep like a rippling mirror. Crests glint where the foam rides.
const UNDER_FRAG = /* glsl */ `
  ${GLSL_ATMOS}
  uniform sampler2D uNormalTex;
  uniform vec4 uBoil;
  uniform vec4 uUnder;
  uniform vec3 uUnderColor;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vCrest;
  varying float vTerrain;
  varying float vViewDist;
  void main() {
    float t = uTime;
    vec2 p = vWorld.xz;
    vec2 wdrift = uWindDrift;
    vec2 r1 = texture(uNormalTex, p * 0.043 + wdrift * 0.03).xy * 2.0 - 1.0;
    vec2 r2 = texture(uNormalTex, p * 0.11 - wdrift * 0.021 + 0.37).xy * 2.0 - 1.0;
    vec3 N = normalize(normalize(vNormal) + vec3(r1.x + r2.x * 0.6, 0.0, r1.y + r2.y * 0.6) * 0.2);
    vec3 V = normalize(vWorld - cameraPosition);
    float d = length(vWorld - cameraPosition);
    vec3 deep = uUnderColor;
    vec3 T = refract(V, -N, 1.333);
    vec3 col;
    if (dot(T, T) < 1e-4) {
      // total internal reflection: the deep, mirrored, rippling
      col = deep * (0.7 + 0.5 * abs(r1.x * r2.y));
    } else {
      T = normalize(T);
      float ct = clamp(dot(T, N), 0.0, 1.0);
      // transmission fades toward the rim of the window, where it flares
      float through = smoothstep(0.0, 0.45, ct);
      vec3 sky = skyColor(T) * 1.15 + uSunColor * pow(max(dot(T, uSunDir), 0.0), 160.0) * 2.5;
      col = mix(deep * 1.4 + sky * 0.35, sky, through);
      col += sky * 0.5 * (1.0 - smoothstep(0.0, 0.12, ct));
    }
    // foam on the crests, seen from beneath as soft bright patches
    col += vec3(0.75, 0.85, 0.88) * uLight * smoothstep(0.3, 0.85, vCrest) * 0.35;
    // where her air breaks the surface: a churning, frothing boil of white, seen from below
    if (uBoil.w > 0.0) {
      float bd = length(p - uBoil.xy) / uBoil.z;
      if (bd < 1.0) {
        vec4 fn = texture(uNoiseTex, p * 0.035 + vec2(t * 0.03, -t * 0.025));
        float fr = texture(uNoiseTex, p * 0.09 - vec2(t * 0.06, t * 0.04) + fn.rg * 0.4).b;
        float froth = smoothstep(0.45, 0.85, fn.g * 0.55 + fr * 0.55) * (1.0 - bd * bd) * uBoil.w;
        col = mix(col, vec3(0.86, 0.95, 1.0) * (uLight * 0.9 + 0.12), froth * 0.6);
      }
    }
    // the light comes down through the water to the eye
    col *= exp(-d * vec3(0.16, 0.05, 0.035) * 0.55);
    col = mix(col, deep, 1.0 - exp(-d / (uUnder.z * 1.6)));
    gl_FragColor = vec4(col, 1.0);
  }`;

export interface OceanOptions {
  segments: number;
  half: number;
  heightTex: THREE.Texture;
  wake: WakeField;
  quality: number; // 0 low, 1 high
}

export class Ocean {
  readonly mesh: THREE.Group;
  readonly material: THREE.ShaderMaterial;
  /** Far sea out to the horizon; only worth drawing when the horizon is in view. */
  readonly apron: THREE.Mesh;
  /**
   * The sea seen from beneath (the farewell follows your ship under): the same
   * swell, back faces only, as a bright rippling Snell's window onto the sky
   * that turns to a mirror of the deep beyond the critical angle. It lives in
   * the opaque scene, so everything above the waves hides behind it.
   */
  readonly underside: THREE.Group;
  private under = false;
  /** The same surface again, tracing reflections into a half-resolution buffer. */
  readonly reflScene = new THREE.Scene();
  private readonly reflMaterial: THREE.ShaderMaterial;
  private readonly reflMesh: THREE.Group;
  private readonly reflApron: THREE.Mesh;
  private snap: number;

  constructor(waves: Wave[], opts: OceanOptions) {
    const tex = getSharedTextures();
    const packed = packWaves(waves);
    this.snap = (opts.half * 0.26 * 2) / opts.segments;
    const uniforms = {
      ...globalUniforms,
      ...opts.wake.uniforms,
      ...shoreUniforms,
      uWaveA: { value: Array.from({ length: waves.length }, (_, i) => new THREE.Vector4().fromArray(packed.a, i * 4)) },
      uWaveB: { value: Array.from({ length: waves.length }, (_, i) => new THREE.Vector4().fromArray(packed.b, i * 4)) },
      uHeightTex: { value: opts.heightTex },
      // seen from beneath: air from a wreck breaking the surface (xz centre, radius m, strength 0..1)
      uBoil: { value: new THREE.Vector4(0, 0, 1, 0) },
      uWorldRect: { value: new THREE.Vector4(-WORLD_SIZE / 2, -WORLD_SIZE / 2, WORLD_SIZE, 1 / WORLD_SIZE) },
      uNormalTex: { value: tex.waterNormal },
      uSceneColor: { value: null as THREE.Texture | null },
      uSceneDepth: { value: null as THREE.Texture | null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uCamNearFar: { value: new THREE.Vector2(1, 1000) },
      uFogRange: globalUniforms.uFogRange,
      uFogColor: globalUniforms.uFogColor,
      uShadowMap: { value: null as THREE.Texture | null },
      uShadowMatrix: { value: new THREE.Matrix4() },
      uShadowTexel: { value: new THREE.Vector2(1 / 2048, 1 / 2048) },
      uSSRProj: { value: new THREE.Matrix4() },
      // max ray length (m), hit thickness base, thickness per metre of depth, mirror strength on calm water
      uSSR: { value: new THREE.Vector4(70, 1.6, 0.012, 0.16) },
      uRefl: { value: null as THREE.Texture | null },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms,
      defines: { HQ: opts.quality > 0 ? 1 : 0, SSR_STEPS: 0 },
      vertexShader: OCEAN_VERT,
      fragmentShader: /* glsl */ `
        ${GLSL_ATMOS}
        ${GLSL_SCENE}
        uniform sampler2D uNormalTex;
        uniform sampler2D uWakeTex;
        uniform sampler2D uHeightTex;
        uniform vec4 uWakeRect;
        uniform float uWakeTexel;
        uniform vec4 uWorldRect;
        uniform vec3 uFogColor;
        uniform vec2 uFogRange;
        uniform vec4 uKraken;
        uniform float uKrakenInk;
        uniform vec4 uVortex[${VORTEX_N}];
        uniform vec4 uWaveA[8];
        uniform vec4 uWaveB[8];
        ${GLSL_AERIAL}
        ${GLSL_SURF}
        varying vec3 vWorld;
        varying vec3 vNormal;
        varying float vCrest;
        varying float vTerrain;
        varying float vViewDist;
        varying vec4 vShore;
        #ifdef WATER_SHADOW
          uniform sampler2DShadow uShadowMap;
          uniform mat4 uShadowMatrix;
          uniform vec2 uShadowTexel;
          float waterShadow(vec3 wp) {
            vec4 sc = uShadowMatrix * vec4(wp, 1.0);
            vec3 p = sc.xyz / sc.w;
            if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
            float z = p.z - 0.0015;
            vec2 o = uShadowTexel * 1.6;
            float s = texture(uShadowMap, vec3(p.xy + vec2(-o.x, -o.y), z));
            s += texture(uShadowMap, vec3(p.xy + vec2(o.x, -o.y), z));
            s += texture(uShadowMap, vec3(p.xy + vec2(-o.x, o.y), z));
            s += texture(uShadowMap, vec3(p.xy + vec2(o.x, o.y), z));
            return s * 0.25;
          }
        #endif
        #if SSR_STEPS > 0
          uniform sampler2D uRefl;
          uniform vec4 uSSR;
        #endif

        // Raindrops: each cell of a jittered grid takes a drop now and then,
        // which throws a ring outward. Returns the surface slope (xy) and a
        // splash brightness (z). Two offset grids keep it from looking tiled.
        vec3 rainRipples(vec2 p, float t, float amount) {
          vec3 o = vec3(0.0);
          for (int l = 0; l < 2; l++) {
            float fl = float(l);
            vec2 q = p * (1.15 + fl * 0.5) + fl * vec2(0.37, 0.71);
            vec2 cell = floor(q);
            vec3 h = aqHash32(cell + fl * 31.7);
            float rate = 0.9 + h.z * 0.5;
            float tt = t * rate + h.x * 7.31 + h.y * 3.17;
            // only some cells are active in any one cycle, more as it pours
            vec3 h2 = aqHash32(cell + floor(tt) * 0.731);
            if (h2.x > amount) continue;
            float ph = fract(tt);
            vec2 d = fract(q) - (0.3 + h2.yz * 0.4);
            float r = length(d);
            float x = (r - ph * 0.42) * 26.0;
            float env = (1.0 - ph) * (1.0 - ph) * (1.0 - smoothstep(0.3, 0.5, r));
            float s = -sin(x) * exp(-x * x * 0.18) * env;
            o.xy += d / max(r, 1e-3) * s;
            o.z += smoothstep(0.14, 0.0, ph) * smoothstep(0.09, 0.0, r);
          }
          return o;
        }

        void main() {
          vec2 suv = gl_FragCoord.xy / uResolution;
          // manual depth test against the opaque pass (hulls, islands above the
          // surface), first thing, so hidden water costs next to nothing
          float sceneZ = linearDepth(texture(uSceneDepth, suv).r);
          float waterZ = linearDepth(gl_FragCoord.z);
          // ...except through a ghost ship: she leaves her opacity in the opaque
          // alpha (ghostGlsl), and the sea behind her shows through by the rest
          float ghostSee = 0.0;
          if (sceneZ < waterZ - 0.02) {
            float oa = texture(uSceneColor, suv).a;
            if (oa > 0.985) discard;
            ghostSee = 1.0 - oa;
            sceneZ = waterZ + 60.0;
          }
          float thick = max(sceneZ - waterZ, 0.0);
          float t = uTime;
          vec3 V = normalize(cameraPosition - vWorld);
          vec3 L = uSunDir;

          // ---- macro fields: very slow, very large noise that drifts the look of
          // the sea from place to place so no two stretches read alike.
          vec2 wdir = uWind.xy;
          vec2 wperp = vec2(-wdir.y, wdir.x);
          // the breeze's run so far (its heading integrated over time): textures
          // scroll along it, so they keep flowing smoothly as the wind comes round
          vec2 wdrift = uWindDrift;
          vec2 wpdrift = vec2(-wdrift.y, wdrift.x);
          vec4 mac = texture(uNoiseTex, vWorld.xz * 0.0021 + vec2(0.13, 0.71) + wdrift * 0.0004);
          vec4 mac2 = texture(uNoiseTex, vWorld.xz * 0.0053 + vec2(0.52, 0.27) - wpdrift * 0.0007);
          float detailFade = 1.0 - smoothstep(140.0, 520.0, vViewDist);

          // ---- ripples: four layers at unrelated scales and rotations, each
          // fading in and out under the macro noise. Their tiles never line up,
          // so the classic "repeating normal map" grid disappears.
          vec2 p = vWorld.xz;
          vec2 p1 = mat2(0.825, -0.565, 0.565, 0.825) * p;
          vec2 p2 = mat2(-0.416, -0.909, 0.909, -0.416) * p;
          vec2 p3 = mat2(0.276, 0.961, -0.961, 0.276) * p;
          vec2 r1 = texture(uNormalTex, p1 * 0.031 + wdrift * 0.021).xy * 2.0 - 1.0;
          vec2 r2 = texture(uNormalTex, p2 * 0.067 + wpdrift * 0.017 + 0.37).xy * 2.0 - 1.0;
          vec2 r3 = texture(uNormalTex, p3 * 0.149 - wdrift * 0.038 + 0.61).xy * 2.0 - 1.0;
          // rotate each sample back into world space so the slopes stay coherent
          r1 = r1 * mat2(0.825, -0.565, 0.565, 0.825);
          r2 = r2 * mat2(-0.416, -0.909, 0.909, -0.416);
          r3 = r3 * mat2(0.276, 0.961, -0.961, 0.276);
          vec2 rip = r1 * (0.45 + 0.75 * mac.r) + r2 * (0.4 + 0.6 * mac2.g) + r3 * (0.25 + 0.4 * (1.0 - mac.g)) * detailFade;
          #if HQ
            // (past the detail range it would be multiplied away: don't fetch it)
            if (detailFade > 0.0) {
              vec2 r4 = texture(uNormalTex, p * 0.331 + wpdrift * 0.061 + 0.19).xy * 2.0 - 1.0;
              rip += r4 * 0.22 * detailFade;
            }
          #endif
          rip *= (0.6 + 0.4 * detailFade) * (1.0 + uStorm * 0.9);

          // ---- wind slicks: long glassy streaks lying along the wind, where the
          // surface film calms the ripples. Read mostly in the sun glitter.
          vec2 sl = vec2(dot(p - uWindPivot, wdir) * 0.0042, dot(p - uWindPivot, wperp) * 0.034) + vec2(t * 0.0021, 0.0);
          float slickN = texture(uNoiseTex, sl).g * 0.75 + mac2.a * 0.35;
          float slick = smoothstep(0.6, 0.78, slickN) * 0.7;
          float calm = 1.0 - slick;

          // ---- cat's paws: gust puffs ruffle the surface into darker, matte,
          // finely sparkling patches. Two noise scales fray the puff into soft,
          // irregular fingers so it never reads as a stamped shape.
          float gust = gustAt(p);
          vec2 gustRip = vec2(0.0);
          if (gust > 0.002) {
            vec4 gn = texture(uNoiseTex, p * 0.017 - wdrift * 0.21);
            vec4 gn2 = texture(uNoiseTex, p * 0.053 - wdrift * 0.33 + 0.41);
            float rag = smoothstep(0.32, 0.78, gn.g * 0.65 + gn2.a * 0.35 + gust * 0.3 - 0.08);
            gust *= rag;
            if (detailFade > 0.0) {
              vec2 rg = texture(uNormalTex, p2 * 0.21 - wdrift * 0.09 + 0.23).xy * 2.0 - 1.0;
              vec2 rg2 = texture(uNoiseTex, p * 0.41 - wdrift * 0.17).xy - 0.5;
              gustRip = (rg * 0.8 + rg2 * 1.4) * gust * detailFade;
            }
            calm = mix(calm, 1.0, gust);
          }

          vec3 Ns = normalize(vNormal);
          // shading normal: swell + ripples. Glint normal adds the gust chop so
          // gusts sparkle without tilting the reflection toward the pale horizon.
          vec3 N = normalize(Ns + vec3(rip.x, 0.0, rip.y) * 0.36 * calm);

          // ---- rain: rings and splashes up close, a matt stippled sheen further out
          float rainSplash = 0.0;
          if (uRain > 0.01 && detailFade > 0.0) {
            vec3 rr = rainRipples(p, t, uRain);
            float rf = detailFade * detailFade;
            N = normalize(N + vec3(rr.x, 0.0, rr.y) * 0.5 * rf);
            rainSplash = rr.z * rf * uRain * (1.0 - 0.6 * uNight);
          }

          // ---- ship wakes: height-field normals so every V-arm and ring catches the light.
          // The lookup is domain-warped by two drifting noise scales so the arms wander,
          // kink and fray instead of reading as ruled lines.
          // Outside the wake field (it only covers the sea round the player)
          // every term below comes to zero: skip its nine texture reads. The
          // warp shifts the lookup ~2 m at most, hence the margin.
          vec4 wn = vec4(0.5);
          vec4 wn2 = vec4(0.5);
          vec4 wk = vec4(0.0);
          vec2 wGrad = vec2(0.0);
          float wIn = 0.0;
          float wakeH = 0.0;
          float wChop = 0.0;
          vec2 wuv0 = (vWorld.xz - uWakeRect.xy) * uWakeRect.w + 0.5;
          vec2 wb0 = min(wuv0, 1.0 - wuv0);
          if (min(wb0.x, wb0.y) > -3.0 * uWakeRect.w) {
            wn = texture(uNoiseTex, p * 0.031 + vec2(t * 0.013, -t * 0.009));
            wn2 = texture(uNoiseTex, p * 0.11 - vec2(t * 0.021, t * 0.017) + 0.37);
            vec2 wWarp = (wn.ga - 0.5) * 3.2 + (wn2.ga - 0.5) * 1.1;
            vec2 wuv = (vWorld.xz + wWarp - uWakeRect.xy) * uWakeRect.w + 0.5;
            wk = texture(uWakeTex, wuv);
            float wtx = uWakeTexel;
            wGrad = vec2(
              texture(uWakeTex, wuv + vec2(wtx, 0.0)).g - texture(uWakeTex, wuv - vec2(wtx, 0.0)).g,
              texture(uWakeTex, wuv + vec2(0.0, wtx)).g - texture(uWakeTex, wuv - vec2(0.0, wtx)).g
            ) / (2.0 * wtx * uWakeRect.z);
            vec2 wb = min(wuv, 1.0 - wuv);
            wIn = smoothstep(0.0, 0.04, min(wb.x, wb.y));
            // strength comes and goes in patches along the arms
            wGrad *= wIn * (0.45 + 0.9 * smoothstep(0.25, 0.75, wn.r * 0.7 + wn2.g * 0.45));
            wakeH = wk.g * wIn;
            // disturbed water is choppy, not glassy: roughen the ripples where the wake is busy
            wChop = clamp(length(wGrad) * 5.0 + wk.r * wIn * 0.6, 0.0, 1.4);
            vec2 wRip = (texture(uNormalTex, p * 0.29 - vec2(t * 0.07, -t * 0.05) + 0.61).xy * 2.0 - 1.0) + (wn2.rb - 0.5) * 1.2;
            N = normalize(N - vec3(wGrad.x, 0.0, wGrad.y) * 1.9 + vec3(wRip.x, 0.0, wRip.y) * 0.22 * wChop);
          }

          // ---- surf: the breaker under this pixel and the one rolling in behind it
          float fp = length(fwidth(p));
          float sDepth = max(-vTerrain, 0.0);
          float sth = fract(vShore.x);
          float sAge = sth * SURF_T; // seconds since the last crest went by
          float swf = 0.16;
          bool sFace = sth > 1.0 - swf;
          vec3 sPrev = vec3(0.0);
          vec3 sNext = vec3(0.0);
          if (vShore.w * (1.0 - smoothstep(4.5, 8.0, sDepth)) > 0.001) {
            float sn = floor(vShore.x);
            sPrev = surfWave(p, sn, sDepth, vShore.w);
            sNext = surfWave(p, sn + 1.0, sDepth, vShore.w);
            vec3 sCur = sFace ? sNext : sPrev;
            // the phase climbs 1 / (c T) per metre out to sea, c = sqrt(g d)
            vec2 sdir = vShore.yz / max(length(vShore.yz), 0.2);
            float sg = sCur.x * surfSlope(sth, swf) / (sqrt(9.81 * max(sDepth, 0.15)) * SURF_T);
            // a broken face is a rumpled tumble of water, not a clean slope
            sg *= 1.0 - sCur.y * 0.45;
            vec2 sGrad = sdir * clamp(sg, -0.8, 0.8);
            N = normalize(N - vec3(sGrad.x, 0.0, sGrad.y) * 1.6);
          }
          // ---- maelstroms: the sea winds round and down into a funnel. Spiral
          // arms of white water wind in toward the eye, swept round faster the
          // nearer they come, with long torn streaks of foam laid along the
          // flow; the walls ridge with the spin, and a ring of churn boils
          // round the black throat at its heart.
          float vxCover = 0.0;
          float vxFoamSum = 0.0;
          float vxDark = 0.0;
          float vxEye = 0.0;
          float vxMilk = 0.0;
          for (int i = 0; i < ${VORTEX_N}; i++) {
            vec4 v4 = uVortex[i];
            float k = abs(v4.w);
            if (k < 0.001) continue;
            vec2 q = p - v4.xy;
            float d = length(q);
            float u = d / v4.z;
            if (u > 1.15) continue;
            float dir = v4.w > 0.0 ? 1.0 : -1.0;
            float a = atan(q.y, q.x) * dir;
            float lr = log(d + 4.0);
            // trailing log-spiral arms: phase holds along a = -b ln r, turning with the water
            float armPh = 4.0 * a + 7.6 * lr - t * k * 1.1;
            float arm = sin(armPh);
            // the turn of the water at this radius (rad/s), as game/hazards.ts drives
            // the ships: a Rankine vortex, a solid core inside a swirl that falls away
            float om = k * 8.5 * (u < 0.17 ? u / 0.17 : pow(0.17 / max(u, 0.17), 0.62)) / max(d, 6.0);
            // torn streaks along the flow: noise sampled round the circle (seamless:
            // a whole number of tiles per turn), cross-faded between two phases so
            // the shear never winds itself into hair-thin lines
            vec2 qx = dFdx(q), qy = dFdy(q);
            float dd = max(d * d, 1e-3);
            vec2 gA = vec2(q.x * qx.y - q.y * qx.x, q.x * qy.y - q.y * qy.x) / dd * (4.0 / 6.2832);
            vec2 gR = vec2(dot(q, qx), dot(q, qy)) / max(d * (d + 4.0), 1e-3) * 3.2;
            float PER = 7.0;
            float f0 = fract(t / PER);
            float f1 = fract(t / PER + 0.5);
            float c0 = floor(t / PER);
            float c1 = floor(t / PER + 0.5);
            vec2 vuv = vec2(a / 6.2832 * 4.0, lr * 3.2);
            // explicit gradients: the angle jumps a whole tile at the seam, which
            // would otherwise drop that column of pixels to the coarsest mip
            vec2 gx = vec2(gA.x, gR.x), gy = vec2(gA.y, gR.y);
            float s0 = textureGrad(uNoiseTex, vuv - vec2(om * f0 * PER / 6.2832 * 4.0, 0.0) + vec2(0.37, 0.61) * c0, gx, gy).g;
            float s1 = textureGrad(uNoiseTex, vuv - vec2(om * f1 * PER / 6.2832 * 4.0, 0.0) + vec2(0.37, 0.61) * c1 + 0.5, gx, gy).g;
            float w0 = 1.0 - abs(f0 * 2.0 - 1.0);
            float streak = mix(s1, s0, w0);
            float band = (1.0 - smoothstep(0.5, 1.08, u)) * smoothstep(0.035, 0.16, u);
            // narrow arms that thicken as they wind in, braided with finer
            // filaments (a tighter spiral, faded out before it can shimmer at
            // range), and loose streaks torn off between them
            float inward = 1.0 - u;
            float armS = arm + (streak - 0.5) * 1.4;
            float filPh = armPh * 3.0 + streak * 3.5;
            float filAA = 1.0 - smoothstep(0.7, 1.8, fwidth(filPh));
            float fil = smoothstep(0.5, 0.95, sin(filPh)) * smoothstep(0.42, 0.75, streak + inward * 0.25) * filAA;
            float cov = band * k * (smoothstep(0.2 - inward * 0.45, 0.95, armS) * (0.28 + 0.62 * inward) + fil * (0.18 + 0.4 * inward) + smoothstep(0.62, 0.9, streak) * 0.2);
            // the churning collar round the throat
            float ring = exp(-pow((u - 0.115) / 0.045, 2.0)) * k;
            cov = max(cov, ring * (0.75 + 0.25 * streak));
            vxCover = max(vxCover, clamp(cov, 0.0, 0.97));
            // ridged walls: the arms stand up in low ridges, catching the light
            vec2 rdir = q / max(d, 1e-3);
            vec2 tdir = vec2(-rdir.y, rdir.x) * dir;
            float rel = cos(armPh) * band * k;
            N = normalize(N + vec3(rdir.x, 0.0, rdir.y) * rel * 0.16 + vec3(tdir.x, 0.0, tdir.y) * (streak - 0.5) * band * k * 0.12);
            vxDark = max(vxDark, k * (1.0 - smoothstep(0.0, 0.85, u)));
            vxEye = max(vxEye, k * (1.0 - smoothstep(0.03, 0.105, u)));
            // churned to milk where the walls steepen: water beaten full of air
            vxMilk = max(vxMilk, k * smoothstep(0.07, 0.14, u) * (1.0 - smoothstep(0.16, 0.5, u)) * (0.6 + 0.4 * streak));
          }
          vec3 Ng = normalize(N + vec3(gustRip.x, 0.0, gustRip.y) * 0.5);

          // ---- refraction with leak protection
          vec2 roff = N.xz * 0.045 * clamp(thick * 0.25, 0.0, 1.0) * (1.0 - smoothstep(200.0, 500.0, vViewDist));
          vec2 ruv = suv + roff;
          float sceneZr = linearDepth(texture(uSceneDepth, ruv).r);
          if (sceneZr < waterZ) { ruv = suv; sceneZr = sceneZ; }
          float thickR = max(sceneZr - waterZ, 0.0);
          vec3 refr = texture(uSceneColor, ruv).rgb;

          float cloud = cloudShadow(p);
          #ifdef WATER_SHADOW
            cloud *= mix(0.42, 1.0, waterShadow(vWorld));
          #endif
          float ndl = max(dot(N, L), 0.0);
          float NdV = max(dot(N, V), 0.0);

          // Beer–Lambert absorption + in-scattering (the "volume")
          float path = thickR;
          vec3 absorb = vec3(0.42, 0.098, 0.066);
          vec3 T = exp(-absorb * path);
          // open water drifts between deep sapphire and a slightly brighter cobalt
          vec3 scatterDeep = mix(vec3(0.004, 0.058, 0.16), vec3(0.007, 0.086, 0.19), smoothstep(0.3, 0.7, mac.r * 0.7 + mac2.g * 0.4));
          vec3 scatterShallow = vec3(0.035, 0.34, 0.37);
          // a storm churns the sea into a dark slate green
          scatterDeep = mix(scatterDeep, vec3(0.012, 0.05, 0.062), uStorm * 0.7);
          scatterShallow = mix(scatterShallow, vec3(0.05, 0.2, 0.2), uStorm * 0.55);
          vec3 scatter = mix(scatterShallow, scatterDeep, smoothstep(0.0, 13.0, path));
          // light travels further through the upper layer at oblique angles
          scatter *= 1.0 + (1.0 - NdV) * 0.4;
          // light reaching into the water: the hour and the weather tint it
          vec3 light = (0.55 + 0.45 * cloud) * (0.6 + 0.4 * max(L.y, 0.0)) * uLight;
          vec3 body = refr * T + scatter * light * (1.0 - T) * 1.35;

          // wave relief: troughs sink a touch darker, crests catch a faint
          // aquamarine glow where the sun shines through the thin water.
          // Broken up by the macro noise so it never traces the interference.
          float hgt = clamp(vWorld.y * 0.6 + 0.5, 0.0, 1.0);
          body *= 0.88 + 0.2 * hgt;
          // swell faces turned toward the sun read a shade brighter, sculpting
          // the long rollers without painting a pattern on them
          body *= 1.0 + clamp(dot(Ns.xz, normalize(L.xz)) * 1.1, -0.18, 0.18);
          float sssView = pow(max(dot(V, -L + vec3(0.0, 0.6, 0.0)), 0.0), 2.0);
          float sss = hgt * hgt * (0.3 + sssView) * (0.35 + 0.65 * mac2.r);
          body += vec3(0.02, 0.19, 0.22) * sss * 0.11 * light * (1.0 - T);
          // wake crests glow translucent turquoise, troughs sink a touch deeper
          body += vec3(0.04, 0.36, 0.34) * clamp(wakeH * 1.6, -0.25, 1.0) * (0.45 + sssView) * light * 0.5;
          // ruffled water under a gust scatters less light back up: darker, matte
          body *= 1.0 - gust * 0.18;
          // a breaker standing up in the shallows: its thin face glows turquoise
          // where the light shines through, the moment before the lip spills
          float sGlass = sNext.z * (1.0 - sNext.y * 0.7) * smoothstep(1.0 - swf - 0.12, 1.0, sth);
          body += vec3(0.05, 0.42, 0.38) * sGlass * (0.5 + sssView) * light * 0.55;
          // churned water behind a breaker is full of bubbles: milky aquamarine
          float sAer = sPrev.y * exp(-sAge * 0.4);
          body = mix(body, vec3(0.3, 0.56, 0.52) * light * (0.55 + 0.45 * cloud), sAer * 0.3);
          // under a grey sky the sea loses its blue and turns pewter
          body = mix(body, vec3(dot(body, vec3(0.2126, 0.7152, 0.0722))) * vec3(0.85, 1.0, 1.05), uCloudCover * uCloudCover * 0.4);

          // ---- the Kraken's maelstrom: the sea over it goes dark and begins to turn
          float krSpiral = 0.0;
          if (uKraken.w > 0.001) {
            vec2 kq = p - uKraken.xy;
            float kd = length(kq);
            float kr = kd / uKraken.z;
            float krIn = (1.0 - smoothstep(0.25, 1.25, kr)) * uKraken.w;
            if (krIn > 0.001) {
              float ka = atan(kq.y, kq.x);
              // arms of a log spiral winding in, turning faster toward the eye of it
              float arm = sin(ka * 3.0 + log(kd + 2.0) * 9.0 - t * (1.2 + 2.0 * uKraken.w) - 4.0 / (kr + 0.3));
              vec4 kn = texture(uNoiseTex, p * 0.045 + vec2(t * 0.02, -t * 0.015));
              krSpiral = smoothstep(0.35, 0.95, arm + (kn.g - 0.5) * 0.9) * krIn * smoothstep(0.05, 0.3, kr);
              body *= 1.0 - krIn * 0.6;
              // its ink: a violet-black stain spreading over the water
              body = mix(body, vec3(0.025, 0.004, 0.04) * light, clamp(uKrakenInk * krIn * 1.4, 0.0, 0.8));
            }
          }

          // the funnel's walls fall away into shadow, its throat into black water
          if (vxDark > 0.001) {
            body *= 1.0 - vxDark * 0.42;
            body = mix(body, vec3(0.13, 0.24, 0.25) * light, clamp(vxMilk * 0.5, 0.0, 0.45));
            body = mix(body, vec3(0.002, 0.018, 0.028) * light, clamp(vxEye, 0.0, 0.92));
          }

          // ---- reflection
          vec3 R = reflect(-V, N);
          R.y = abs(R.y);
          // far off, the sub-pixel facets of the chop tilt toward the viewer and
          // mirror a little higher, bluer sky than the glassy maths alone would,
          // so the sea darkens toward the horizon instead of turning milky
          R = normalize(R + vec3(0.0, 0.07 * smoothstep(30.0, 500.0, vViewDist), 0.0));
          vec3 refl = skyColor(R);
          float F = 0.02 + 0.98 * pow(max(1.0 - NdV, 0.0), 5.0);
          F = min(F * 1.1, 1.0);
          if (F > 0.04) {
            // the clouds overhead mirrored in the sea, the same ones whose shadows drift across it
            float cd;
            vec3 cc = cloudSampleLite(cloudUv(vWorld, R, AQ_CLOUD_ALT, cd));
            vec3 ccol = mix(cloudColor(cc, R), hazeColor(R), 1.0 - exp(-cd * 0.00011));
            refl = mix(refl, ccol, cc.x * smoothstep(0.0, 0.1, R.y));
          }
          refl *= (1.0 - gust * 0.22) * (1.0 - uRain * 0.18);
          #if SSR_STEPS > 0
          {
            // the traced reflection (half res, premultiplied), wobbled by the
            // ripples the trace leaves out
            vec4 hit = texture(uRefl, suv + (N.xz - Ns.xz) * 0.02);
            refl = refl * (1.0 - hit.a) + hit.rgb;
            // calm water near a hull mirrors it more than the bare Fresnel term
            // would let a top-down camera see
            F = mix(F, max(F, uSSR.w * (1.0 - gust * 0.6)), hit.a);
          }
          #endif

          // sun glitter: twinkling pinpoints, a tight sheen, and a broad soft
          // path of light that widens where the water is rougher.
          vec3 H = normalize(L + V);
          float nh = max(dot(Ng, H), 0.0);
          float twinkle = 1.0;
          #if HQ
            twinkle = 0.45 + 1.4 * smoothstep(0.45, 0.85, texture(uNoiseTex, p * 0.73 + vec2(t * 0.09, -t * 0.07)).a);
          #endif
          float sharpExp = mix(2600.0, 1400.0, gust);
          float spec = pow(nh, sharpExp) * 4.6 * twinkle * (1.0 + slick * 0.8) + pow(nh, 340.0) * 0.2;
          spec += pow(max(dot(Ns, H), 0.0), mix(60.0, 26.0, gust)) * 0.045;
          spec *= cloud * (1.0 - uRain * 0.55);
          // moonlight lays a softer, silvery path than the sun's dazzle
          spec *= 1.0 - uNight * 0.5;

          vec3 col = mix(body, refl, F) + uSunColor * spec * 0.55;

          // ---- foam
          vec4 nz = texture(uNoiseTex, vWorld.xz * 0.06 + vec2(t * 0.01, -t * 0.013));
          vec4 nz2 = texture(uNoiseTex, vWorld.xz * 0.15 - vec2(t * 0.017, t * 0.009));
          float lace = texture(uNoiseTex, vWorld.xz * 0.045 + vec2(t * 0.011, -t * 0.007)).b;
          float lace2 = texture(uNoiseTex, vWorld.xz * 0.027 - vec2(t * 0.008, t * 0.012)).g;
          // a standing web of bubble rafts, for the foam that has no age of its own
          float fv = foamField(p);
          float bubbles = foamCut(fv, 0.62, fp);
          // the vertical depth of water over whatever lies below (seabed, hull)
          vec3 camFwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
          float vThick = thick * max(V.y, 0.05) / max(dot(-V, camFwd), 0.05);
          // whitewater: a dense bore right behind each broken crest that leaves a
          // sheet of foam behind it, opening into lace as the bubbles pop
          float surfCover = sPrev.y * (exp(-sAge * 1.4) + 0.4 * exp(-sAge * 0.42));
          // the spilling lip on the face of a breaking wave
          surfCover = max(surfCover, sNext.y * smoothstep(1.0 - swf * 0.85, 1.0, sth));
          // stray rafts of old foam drifting about the surf zone between sets
          float sZone = max(sPrev.y, sNext.y * 0.7);
          surfCover = max(surfCover, sZone * 0.26 * smoothstep(0.35, 0.75, nz.g * 0.7 + nz2.a * 0.45));
          // a thin lacy rim where the water meets sand, rock or a hull
          // (beaches shelve so gently that a few centimetres span metres of sand)
          float rim = 1.0 - smoothstep(0.0, 0.07 + 0.08 * sZone, vThick);
          // hulls and boulders standing in the water churn a collar of foam
          float contact = (1.0 - smoothstep(0.0, 0.6, vThick)) * smoothstep(0.25, 0.6, sDepth - vThick);
          surfCover = max(surfCover, max(rim * 0.6, contact * 0.85));
          float surfFoam = foamCut(fv, clamp(surfCover, 0.0, 1.0), fp);
          // wake foam: a dense churned core that breaks up into lacy cells as it thins out
          float wf = clamp(wk.r * wIn, 0.0, 2.5);
          // through the same bubble web as the surf: a churned sheet that opens into holes,
          // thins to threads and snaps into flecks as the bubbles pop, never soft puffs
          float wCover = clamp(wf * (0.5 + 0.32 * wn2.r) + (wn.b - 0.5) * 0.12 * smoothstep(0.02, 0.3, wf), 0.0, 0.98);
          float wakeFoam = foamCut(fv, wCover, fp) * smoothstep(0.01, 0.06, wf);
          wakeFoam *= 0.7 + 0.3 * smoothstep(0.0, 0.6, wf);
          // whitecaps break only here and there, and more often where a gust blows
          float breaking = smoothstep(0.54 - uStorm * 0.34, 0.8 - uStorm * 0.22, texture(uNoiseTex, p * 0.0093 - wdrift * 0.017).g + gust * 0.35);
          float crestFoam = smoothstep(0.5 - uStorm * 0.22, 0.95, vCrest + nz2.g * 0.35) * breaking * (0.6 + uStorm * 0.3);
          // storm spume: long streaks of foam torn off the crests and laid down the wind
          float spume = 0.0;
          if (uStorm > 0.05) {
            vec2 sp = vec2(dot(p - uWindPivot, wdir) * 0.011, dot(p - uWindPivot, wperp) * 0.14) - vec2(t * 0.05, 0.0);
            float sn = texture(uNoiseTex, sp).g * 0.7 + texture(uNoiseTex, sp * 2.3 + 0.5).a * 0.3;
            spume = smoothstep(0.62, 0.8, sn) * uStorm * 0.55 * (0.4 + 0.6 * hgt);
          }
          float foam = surfFoam * (0.82 + 0.18 * clamp(surfCover, 0.0, 1.0));
          foam += wakeFoam * (0.8 + 0.2 * bubbles);
          // whitecaps break up softly; the cellular lace alone reads as polka dots on a big cap
          float capBreak = smoothstep(0.25, 0.8, nz.g * 0.7 + nz2.a * 0.5);
          foam += crestFoam * mix(capBreak, bubbles, 0.3);
          foam += spume * (0.5 + 0.5 * bubbles) + rainSplash * 0.7;
          // a maelstrom's arms, cut from the bubble web swept round with them
          float vxFoam = 0.0;
          if (vxCover > 0.002) {
            vxFoam = foamCut(fv, vxCover, fp) * 0.95;
            foam += vxFoam;
          }
          // the swell trips over an open-sea reef: each crest stands up and spills
          // white across the coral as it rolls over, then the foam thins to lace
          // until the next one comes (sailors know a reef by its breakers)
          float reefFoam = 0.0;
          vec2 rt = texture(uHeightTex, (p - uWorldRect.xy) * uWorldRect.w).rg;
          if (rt.g > 0.02) {
            float rDepth = max(-rt.r, 0.0);
            float shoal = rt.g * (1.0 - smoothstep(0.9, 3.6, rDepth));
            float th0 = uWaveA[0].z * dot(uWaveA[0].xy, p) - uWaveB[0].x * t + uWaveB[0].z;
            float th1 = uWaveA[1].z * dot(uWaveA[1].xy, p) - uWaveB[1].x * t + uWaveB[1].z;
            float swl = sin(th0) * 0.62 + sin(th1) * 0.38 + (nz.g - 0.5) * 0.55;
            float burst = smoothstep(0.32, 0.9, swl) * (1.0 - smoothstep(1.4, 3.6, rDepth) * 0.5);
            float trail = smoothstep(0.1, 0.85, sin(th0 + 0.9) + (nz2.a - 0.5) * 0.5) * 0.45;
            float rCover = shoal * (0.15 + 0.75 * burst + 0.3 * trail) * (0.75 + uStorm * 0.5 + uSurf.x * 0.3);
            reefFoam = foamCut(fv, clamp(rCover, 0.0, 0.95), fp);
            foam += reefFoam * 0.9;
          }
          foam += foamCut(fv, clamp(krSpiral, 0.0, 0.95), fp) * 0.9;
          foam = clamp(foam, 0.0, 1.0);
          vec3 foamCol = vec3(0.96, 0.98, 1.0) * (uSunColor * (0.25 + 0.75 * ndl) * cloud * 0.42 + uSkyZenith * 0.55);
          col = mix(col, foamCol, foam * 0.9);

          // ---- bioluminescence: on dark nights churned water glows blue-green
          if (uNight > 0.05) {
            float churn = wakeFoam * 0.9 * bubbles + surfFoam * 0.5 + krSpiral * 0.45 + vxFoam * 0.5 + reefFoam * 0.4
              + (crestFoam * 0.18 * capBreak + spume * 0.08) * (1.0 - 0.5 * uStorm);
            float spark = 0.55 + 0.9 * smoothstep(0.35, 0.9, texture(uNoiseTex, p * 0.37 + vec2(t * 0.05, -t * 0.04)).b);
            col += vec3(0.02, 0.42, 0.62) * churn * spark * uNight * 0.4;
          }

          // ---- atmospheric haze
          // the far sea lies under the haze a shade deeper and bluer than the
          // sky just above it, so the horizon stays a crisp line instead of
          // melting into one milky band (mist and a closing sky soften it)
          vec3 seaHaze = hazeColor(-V) * mix(vec3(1.0), vec3(0.8, 0.88, 0.97), (1.0 - uMist * 0.85) * (1.0 - uCloudCover * 0.45));
          col = mix(col, seaHaze, aerialAt(vViewDist, 0.0) * 0.88);

          gl_FragColor = ghostSee > 0.0 ? vec4(col * ghostSee, ghostSee) : vec4(col, 1.0);
        }`,
    });
    this.mesh = gridMesh(buildGrid(opts.segments, opts.half), this.material, -10);
    this.apron = new THREE.Mesh(buildApron(opts.half * 0.985, 3400), this.material);
    this.apron.frustumCulled = false;
    this.apron.renderOrder = -10;
    this.apron.visible = false;
    this.mesh.add(this.apron);

    // the reflection pass shares every uniform, so one update feeds both
    this.reflMaterial = new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uReflRes: { value: new THREE.Vector2(1, 1) }, uHalfZ: { value: null as THREE.Texture | null }, uHalfZOn: { value: 0 } },
      defines: { SSR_STEPS: 0 },
      vertexShader: OCEAN_VERT,
      fragmentShader: REFL_FRAG,
    });
    // at half the resolution it needs half the grid: the trace starts a few
    // centimetres off the true crest at most, well under the ripple wobble
    this.reflMesh = gridMesh(buildGrid(opts.segments >> 1, opts.half), this.reflMaterial);
    this.reflApron = new THREE.Mesh(this.apron.geometry, this.reflMaterial);
    this.reflApron.frustumCulled = false;
    this.reflApron.visible = false;
    this.reflMesh.add(this.reflApron);
    this.reflScene.add(this.reflMesh);

    // the same patches as the sea above, so it is culled the same way
    const tiles = this.mesh.children.filter((o) => o !== this.apron).map((o) => (o as THREE.Mesh).geometry);
    this.underside = gridMesh(
      tiles,
      new THREE.ShaderMaterial({
        uniforms: { ...uniforms },
        defines: { HQ: this.material.defines.HQ },
        side: THREE.BackSide,
        vertexShader: OCEAN_VERT,
        fragmentShader: UNDER_FRAG,
      }),
    );
    this.underside.visible = false;
  }

  /** Air breaking the surface over a wreck, as seen from beneath (strength 0 hides it). */
  setBoil(x: number, z: number, r: number, strength: number) {
    (this.material.uniforms.uBoil.value as THREE.Vector4).set(x, z, Math.max(r, 1), strength);
  }

  /** Swap the sea for its underside while the camera is below the waves. */
  setUnder(on: boolean) {
    if (on === this.under) return;
    this.under = on;
    this.mesh.visible = !on;
    this.reflMesh.visible = !on;
    this.underside.visible = on;
  }

  /** Pushes changed wave amplitudes / steepness (sea state) to the GPU. */
  setWaves(waves: Wave[]) {
    const a = this.material.uniforms.uWaveA.value as THREE.Vector4[];
    const b = this.material.uniforms.uWaveB.value as THREE.Vector4[];
    for (let i = 0; i < waves.length; i++) {
      const w = waves[i];
      a[i].set(w.dirX, w.dirZ, w.k, w.amp);
      b[i].y = w.q;
      b[i].z = w.phase;
    }
  }

  follow(x: number, z: number) {
    const s = this.snap * 4;
    this.mesh.position.set(Math.round(x / s) * s, 0, Math.round(z / s) * s);
    this.mesh.updateMatrixWorld();
    this.underside.position.copy(this.mesh.position);
    this.underside.updateMatrixWorld();
    this.reflMesh.position.copy(this.mesh.position);
    this.reflMesh.updateMatrixWorld();
  }

  enableShadows(light: THREE.DirectionalLight) {
    const sh = light.shadow;
    // shadow resolution can change in settings: rebind when the map is new
    if (!sh.map || !sh.map.depthTexture || this.material.uniforms.uShadowMap.value === sh.map.depthTexture) return;
    const u = this.material.uniforms;
    u.uShadowMap.value = sh.map.depthTexture;
    u.uShadowMatrix.value = sh.matrix;
    u.uShadowTexel.value.set(1 / sh.mapSize.x, 1 / sh.mapSize.y);
    if (!this.material.defines.WATER_SHADOW) {
      this.material.defines.WATER_SHADOW = 1;
      this.material.needsUpdate = true;
    }
  }

  /** Ray-traced reflection quality: 0 turns them off (sky only). */
  setReflections(steps: number) {
    if (this.material.defines.SSR_STEPS === steps) return;
    for (const m of [this.material, this.reflMaterial]) {
      m.defines.SSR_STEPS = steps;
      m.needsUpdate = true;
    }
  }

  /** Whether the half-resolution reflection pass has anything to do. */
  get reflecting() {
    return !this.under && (this.material.defines.SSR_STEPS as number) > 0;
  }

  /** Binds this frame's reflection buffer (and keeps the far sea in step with it). */
  setReflectionTarget(tex: THREE.Texture, w: number, h: number) {
    this.material.uniforms.uRefl.value = tex;
    this.reflMaterial.uniforms.uReflRes.value.set(w, h);
    this.reflApron.visible = this.apron.visible;
  }

  /** The ray-tracing pass's half-res depth for this frame's reflection trace (null: use the full depth buffer). */
  setHalfDepth(tex: THREE.Texture | null) {
    const u = this.reflMaterial.uniforms;
    u.uHalfZ.value = tex;
    u.uHalfZOn.value = tex ? 1 : 0;
  }

  setSceneTextures(color: THREE.Texture, depth: THREE.Texture, w: number, h: number, cam: THREE.PerspectiveCamera) {
    const u = this.material.uniforms;
    u.uSSRProj.value.copy(cam.projectionMatrix);
    u.uSceneColor.value = color;
    u.uSceneDepth.value = depth;
    u.uResolution.value.set(w, h);
    u.uCamNearFar.value.set(cam.near, cam.far);
  }
}
