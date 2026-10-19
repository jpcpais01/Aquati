import * as THREE from 'three';
import { GLSL_ATMOS, globalUniforms } from '../render/environment';
import { getSharedTextures } from '../render/textures';
import { GLSL_WAVES, packWaves, Wave } from './waves';
import { WORLD_SIZE } from './terrain';
import { WakeField } from './wakeField';

// The ocean: Gerstner swell on a camera-following, centre-dense grid, shaded
// with depth-aware Beer–Lambert absorption over the refracted scene, sky
// reflection, sun glitter, crest sub-surface glow, and three kinds of foam
// (shoreline surf bands, hull contact, and ship wakes). Ship wakes come from
// a live wave simulation (see WakeField): its height lifts the surface and
// bends the normals, and its foam breaks up into lace as it ages. Open water
// layers anti-tiled ripples, wind slicks and gust cat's paws over the swell,
// with slow macro noise drifting its colour so it never reads as a pattern.
// Reflections are ray traced in screen space: each pixel marches its
// reflected ray through the opaque depth buffer, so hulls, sails and island
// cliffs mirror in the water, rippling with the surface, over a sky fallback.

function buildGrid(segments: number, half: number): THREE.BufferGeometry {
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
  const idx = new Uint32Array(segments * segments * 6);
  let p = 0;
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
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
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), half * 2);
  return g;
}

export interface OceanOptions {
  segments: number;
  half: number;
  heightTex: THREE.Texture;
  wake: WakeField;
  quality: number; // 0 low, 1 high
}

export class Ocean {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private snap: number;

  constructor(waves: Wave[], opts: OceanOptions) {
    const tex = getSharedTextures();
    const packed = packWaves(waves);
    this.snap = (opts.half * 0.26 * 2) / opts.segments;
    const uniforms = {
      ...globalUniforms,
      ...opts.wake.uniforms,
      uWaveA: { value: Array.from({ length: waves.length }, (_, i) => new THREE.Vector4().fromArray(packed.a, i * 4)) },
      uWaveB: { value: Array.from({ length: waves.length }, (_, i) => new THREE.Vector4().fromArray(packed.b, i * 4)) },
      uHeightTex: { value: opts.heightTex },
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
    };
    this.material = new THREE.ShaderMaterial({
      uniforms,
      defines: { HQ: opts.quality > 0 ? 1 : 0, SSR_STEPS: 0 },
      vertexShader: /* glsl */ `
        ${GLSL_WAVES}
        uniform float uTime;
        uniform sampler2D uHeightTex;
        uniform vec4 uWorldRect;
        uniform sampler2D uWakeTex;
        uniform vec4 uWakeRect;
        varying vec3 vWorld;
        varying vec3 vNormal;
        varying float vCrest;
        varying float vTerrain;
        varying float vViewDist;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vec2 huv = (wp.xz - uWorldRect.xy) * uWorldRect.w;
          float th = texture(uHeightTex, huv).r;
          vTerrain = th;
          float damp = clamp(-th / 8.0, 0.12, 1.0);
          vec3 n; float crest;
          vec3 off = gerstner(wp.xz, uTime, damp, length(wp.xz - cameraPosition.xz), n, crest);
          wp.xyz += off;
          // wake waves ride on top of the swell
          vec2 wuv = (wp.xz - uWakeRect.xy) * uWakeRect.w + 0.5;
          vec2 wb = min(wuv, 1.0 - wuv);
          float wIn = smoothstep(0.0, 0.04, min(wb.x, wb.y));
          wp.y += clamp(texture(uWakeTex, wuv).g, -0.9, 0.9) * wIn;
          vWorld = wp.xyz;
          vNormal = n;
          vCrest = crest;
          vec4 mv = viewMatrix * wp;
          vViewDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        ${GLSL_ATMOS}
        uniform sampler2D uNormalTex;
        uniform sampler2D uSceneColor;
        uniform sampler2D uSceneDepth;
        uniform sampler2D uWakeTex;
        uniform sampler2D uHeightTex;
        uniform vec4 uWakeRect;
        uniform float uWakeTexel;
        uniform vec4 uWorldRect;
        uniform vec2 uResolution;
        uniform vec2 uCamNearFar;
        uniform vec3 uFogColor;
        uniform vec2 uFogRange;
        varying vec3 vWorld;
        varying vec3 vNormal;
        varying float vCrest;
        varying float vTerrain;
        varying float vViewDist;
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

        float linearDepth(float d) {
          float n = uCamNearFar.x, f = uCamNearFar.y;
          return (n * f) / (f - d * (f - n));
        }

        #if SSR_STEPS > 0
          uniform mat4 uSSRProj;
          uniform vec4 uSSR;
          // March the reflected ray through the opaque depth buffer. Steps
          // bunch up near the surface, where reflections touch their objects,
          // then a short bisection pins the hit down.
          vec4 traceReflection(vec3 wp, vec3 R, float jitter, vec2 wobble) {
            vec3 vp = (viewMatrix * vec4(wp, 1.0)).xyz;
            vec3 vr = (viewMatrix * vec4(R, 0.0)).xyz;
            float prev = 0.0;
            for (int i = 0; i < SSR_STEPS; i++) {
              float s = (float(i) + jitter) / float(SSR_STEPS);
              float dist = uSSR.x * s * s;
              vec3 q = vp + vr * dist;
              vec4 c = uSSRProj * vec4(q, 1.0);
              if (c.w <= 0.0) break;
              vec2 uv = c.xy / c.w * 0.5 + 0.5;
              if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break;
              float sz = linearDepth(texture(uSceneDepth, uv).r);
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
                  if (-qm.z - linearDepth(texture(uSceneDepth, um).r) > 0.0) { b = m; uv = um; } else a = m;
                }
                vec2 e = min(uv, 1.0 - uv);
                float fade = smoothstep(0.0, 0.06, min(e.x, e.y)) * (1.0 - smoothstep(0.5, 1.0, b / uSSR.x));
                // ropes and stays are a pixel wide: rays hit them only here and
                // there, which reads as dotted noise. Keep hits on solid surfaces.
                float hz = linearDepth(texture(uSceneDepth, uv).r);
                vec2 px = 2.0 / uResolution;
                float tol = 0.6 + hz * 0.01;
                float solid = step(abs(linearDepth(texture(uSceneDepth, uv + vec2(px.x, 0.0)).r) - hz), tol)
                  + step(abs(linearDepth(texture(uSceneDepth, uv - vec2(px.x, 0.0)).r) - hz), tol)
                  + step(abs(linearDepth(texture(uSceneDepth, uv + vec2(0.0, px.y)).r) - hz), tol)
                  + step(abs(linearDepth(texture(uSceneDepth, uv - vec2(0.0, px.y)).r) - hz), tol);
                fade *= smoothstep(1.5, 3.5, solid);
                return vec4(texture(uSceneColor, clamp(uv + wobble, 0.0, 1.0)).rgb, fade);
              }
              prev = dist;
            }
            return vec4(0.0);
          }
        #endif

        void main() {
          vec2 suv = gl_FragCoord.xy / uResolution;
          float t = uTime;
          vec3 V = normalize(cameraPosition - vWorld);
          vec3 L = uSunDir;

          // ---- macro fields: very slow, very large noise that drifts the look of
          // the sea from place to place so no two stretches read alike.
          vec2 wdir = uWind.xy;
          vec2 wperp = vec2(-wdir.y, wdir.x);
          vec4 mac = texture(uNoiseTex, vWorld.xz * 0.0021 + vec2(0.13, 0.71) + wdir * t * 0.0004);
          vec4 mac2 = texture(uNoiseTex, vWorld.xz * 0.0053 + vec2(0.52, 0.27) - wperp * t * 0.0007);
          float detailFade = 1.0 - smoothstep(140.0, 520.0, vViewDist);

          // ---- ripples: four layers at unrelated scales and rotations, each
          // fading in and out under the macro noise. Their tiles never line up,
          // so the classic "repeating normal map" grid disappears.
          vec2 p = vWorld.xz;
          vec2 p1 = mat2(0.825, -0.565, 0.565, 0.825) * p;
          vec2 p2 = mat2(-0.416, -0.909, 0.909, -0.416) * p;
          vec2 p3 = mat2(0.276, 0.961, -0.961, 0.276) * p;
          vec2 r1 = texture(uNormalTex, p1 * 0.031 + wdir * t * 0.021).xy * 2.0 - 1.0;
          vec2 r2 = texture(uNormalTex, p2 * 0.067 + wperp * t * 0.017 + 0.37).xy * 2.0 - 1.0;
          vec2 r3 = texture(uNormalTex, p3 * 0.149 - wdir * t * 0.038 + 0.61).xy * 2.0 - 1.0;
          // rotate each sample back into world space so the slopes stay coherent
          r1 = r1 * mat2(0.825, -0.565, 0.565, 0.825);
          r2 = r2 * mat2(-0.416, -0.909, 0.909, -0.416);
          r3 = r3 * mat2(0.276, 0.961, -0.961, 0.276);
          vec2 rip = r1 * (0.45 + 0.75 * mac.r) + r2 * (0.4 + 0.6 * mac2.g) + r3 * (0.25 + 0.4 * (1.0 - mac.g)) * detailFade;
          #if HQ
            vec2 r4 = texture(uNormalTex, p * 0.331 + wperp * t * 0.061 + 0.19).xy * 2.0 - 1.0;
            rip += r4 * 0.22 * detailFade;
          #endif
          rip *= 0.6 + 0.4 * detailFade;

          // ---- wind slicks: long glassy streaks lying along the wind, where the
          // surface film calms the ripples. Read mostly in the sun glitter.
          vec2 sl = vec2(dot(p, wdir) * 0.0042, dot(p, wperp) * 0.034) + vec2(t * 0.0021, 0.0);
          float slickN = texture(uNoiseTex, sl).g * 0.75 + mac2.a * 0.35;
          float slick = smoothstep(0.6, 0.78, slickN) * 0.7;
          float calm = 1.0 - slick;

          // ---- cat's paws: gust puffs ruffle the surface into darker, matte,
          // finely sparkling patches. Two noise scales fray the puff into soft,
          // irregular fingers so it never reads as a stamped shape.
          float gust = gustAt(p);
          vec2 gustRip = vec2(0.0);
          if (gust > 0.002) {
            vec4 gn = texture(uNoiseTex, p * 0.017 - wdir * t * 0.21);
            vec4 gn2 = texture(uNoiseTex, p * 0.053 - wdir * t * 0.33 + 0.41);
            float rag = smoothstep(0.32, 0.78, gn.g * 0.65 + gn2.a * 0.35 + gust * 0.3 - 0.08);
            gust *= rag;
            vec2 rg = texture(uNormalTex, p2 * 0.21 - wdir * t * 0.09 + 0.23).xy * 2.0 - 1.0;
            vec2 rg2 = texture(uNoiseTex, p * 0.41 - wdir * t * 0.17).xy - 0.5;
            gustRip = (rg * 0.8 + rg2 * 1.4) * gust * detailFade;
            calm = mix(calm, 1.0, gust);
          }

          vec3 Ns = normalize(vNormal);
          // shading normal: swell + ripples. Glint normal adds the gust chop so
          // gusts sparkle without tilting the reflection toward the pale horizon.
          vec3 N = normalize(Ns + vec3(rip.x, 0.0, rip.y) * 0.36 * calm);

          // ---- ship wakes: height-field normals so every V-arm and ring catches the light.
          // The lookup is domain-warped by two drifting noise scales so the arms wander,
          // kink and fray instead of reading as ruled lines.
          vec4 wn = texture(uNoiseTex, p * 0.031 + vec2(t * 0.013, -t * 0.009));
          vec4 wn2 = texture(uNoiseTex, p * 0.11 - vec2(t * 0.021, t * 0.017) + 0.37);
          vec2 wWarp = (wn.ga - 0.5) * 3.2 + (wn2.ga - 0.5) * 1.1;
          vec2 wuv = (vWorld.xz + wWarp - uWakeRect.xy) * uWakeRect.w + 0.5;
          vec4 wk = texture(uWakeTex, wuv);
          float wtx = uWakeTexel;
          vec2 wGrad = vec2(
            texture(uWakeTex, wuv + vec2(wtx, 0.0)).g - texture(uWakeTex, wuv - vec2(wtx, 0.0)).g,
            texture(uWakeTex, wuv + vec2(0.0, wtx)).g - texture(uWakeTex, wuv - vec2(0.0, wtx)).g
          ) / (2.0 * wtx * uWakeRect.z);
          vec2 wb = min(wuv, 1.0 - wuv);
          float wIn = smoothstep(0.0, 0.04, min(wb.x, wb.y));
          // strength comes and goes in patches along the arms
          wGrad *= wIn * (0.45 + 0.9 * smoothstep(0.25, 0.75, wn.r * 0.7 + wn2.g * 0.45));
          float wakeH = wk.g * wIn;
          // disturbed water is choppy, not glassy: roughen the ripples where the wake is busy
          float wChop = clamp(length(wGrad) * 5.0 + wk.r * wIn * 0.6, 0.0, 1.4);
          vec2 wRip = (texture(uNormalTex, p * 0.29 - vec2(t * 0.07, -t * 0.05) + 0.61).xy * 2.0 - 1.0) + (wn2.rb - 0.5) * 1.2;
          N = normalize(N - vec3(wGrad.x, 0.0, wGrad.y) * 1.9 + vec3(wRip.x, 0.0, wRip.y) * 0.22 * wChop);
          vec3 Ng = normalize(N + vec3(gustRip.x, 0.0, gustRip.y) * 0.5);

          // ---- depth through the water column
          float sceneZ = linearDepth(texture(uSceneDepth, suv).r);
          float waterZ = linearDepth(gl_FragCoord.z);
          // manual depth test against the opaque pass (hulls, islands above the surface)
          if (sceneZ < waterZ - 0.02) discard;
          float thick = max(sceneZ - waterZ, 0.0);

          // refraction with leak protection
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
          vec3 scatter = mix(scatterShallow, scatterDeep, smoothstep(0.0, 13.0, path));
          // light travels further through the upper layer at oblique angles
          scatter *= 1.0 + (1.0 - NdV) * 0.4;
          float light = (0.55 + 0.45 * cloud) * (0.6 + 0.4 * L.y);
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

          // ---- reflection
          vec3 R = reflect(-V, N);
          R.y = abs(R.y);
          vec3 refl = skyColor(R) * (1.0 - gust * 0.22);
          float F = 0.02 + 0.98 * pow(max(1.0 - NdV, 0.0), 5.0);
          F = min(F * 1.1, 1.0);
          #if SSR_STEPS > 0
          {
            // trace along the smooth swell so neighbouring pixels agree, then
            // let the ripples wobble the image instead of scattering the rays
            vec3 Rs = reflect(-V, normalize(Ns + vec3(rip.x, 0.0, rip.y) * 0.08));
            Rs.y = abs(Rs.y);
            vec4 hit = traceReflection(vWorld, Rs, 0.5, (N.xz - Ns.xz) * 0.02);
            refl = mix(refl, hit.rgb, hit.a);
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
          spec *= cloud;

          vec3 col = mix(body, refl, F) + uSunColor * spec * 0.55;

          // ---- foam
          vec4 nz = texture(uNoiseTex, vWorld.xz * 0.06 + vec2(t * 0.01, -t * 0.013));
          vec4 nz2 = texture(uNoiseTex, vWorld.xz * 0.15 - vec2(t * 0.017, t * 0.009));
          float lace = texture(uNoiseTex, vWorld.xz * 0.045 + vec2(t * 0.011, -t * 0.007)).b;
          float lace2 = texture(uNoiseTex, vWorld.xz * 0.027 - vec2(t * 0.008, t * 0.012)).g;
          float bubbles = smoothstep(0.3, 0.72, lace * 0.75 + lace2 * 0.55 - 0.08);
          float colDepth = max(vWorld.y - vTerrain, 0.0);
          float bands = sin(colDepth * 3.0 - t * 1.5 + nz.g * 6.0) * 0.5 + 0.5;
          float shore = (1.0 - smoothstep(0.2, 2.2, colDepth)) * smoothstep(0.55, 0.95, bands) * 0.8;
          float edge = 1.0 - smoothstep(0.02, 0.4, colDepth);
          float contact = (1.0 - smoothstep(0.0, 0.9, thick)) * step(-1.0, vTerrain) ;
          contact = max(contact, (1.0 - smoothstep(0.0, 0.6, thick)) * 0.8);
          // wake foam: a dense churned core that breaks up into lacy cells as it thins out
          float wf = clamp(wk.r * wIn, 0.0, 2.5);
          float pat = lace * 0.55 + lace2 * 0.45 + (nz2.r - 0.5) * 0.3 + (wn.b - 0.5) * 0.35;
          float thr = 0.9 - wf * (0.48 + 0.3 * wn2.r);
          float wakeFoam = smoothstep(thr - 0.09, thr + 0.07, pat) * smoothstep(0.015, 0.1, wf);
          wakeFoam = max(wakeFoam, smoothstep(0.9, 1.7, wf));
          wakeFoam *= 0.55 + 0.45 * smoothstep(0.0, 0.7, wf);
          // whitecaps break only here and there, and more often where a gust blows
          float breaking = smoothstep(0.54, 0.8, texture(uNoiseTex, p * 0.0093 - wdir * t * 0.017).g + gust * 0.35);
          float crestFoam = smoothstep(0.5, 0.95, vCrest + nz2.g * 0.35) * breaking * 0.6;
          float foam = clamp(shore + contact * 0.85, 0.0, 1.0) * bubbles + edge * (0.55 + 0.45 * bubbles);
          foam += wakeFoam * (0.8 + 0.2 * bubbles);
          foam += crestFoam * bubbles;
          foam = clamp(foam, 0.0, 1.0);
          vec3 foamCol = vec3(0.96, 0.98, 1.0) * (uSunColor * (0.25 + 0.75 * ndl) * cloud * 0.42 + uSkyZenith * 0.55);
          col = mix(col, foamCol, foam * 0.88);

          // ---- atmospheric haze
          float fog = smoothstep(uFogRange.x, uFogRange.y, vViewDist);
          col = mix(col, uFogColor, fog * 0.85);

          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(buildGrid(opts.segments, opts.half), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  follow(x: number, z: number) {
    const s = this.snap * 4;
    this.mesh.position.set(Math.round(x / s) * s, 0, Math.round(z / s) * s);
    this.mesh.updateMatrixWorld();
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
    this.material.defines.SSR_STEPS = steps;
    this.material.needsUpdate = true;
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
