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
// bends the normals, and its foam breaks up into lace as it ages.

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
    };
    this.material = new THREE.ShaderMaterial({
      uniforms,
      defines: { HQ: opts.quality > 0 ? 1 : 0 },
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
          vec3 off = gerstner(wp.xz, uTime, damp, n, crest);
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
        uniform vec3 uWind;
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

        void main() {
          vec2 suv = gl_FragCoord.xy / uResolution;
          float t = uTime;
          vec3 V = normalize(cameraPosition - vWorld);
          vec3 L = uSunDir;

          // ---- normals: analytic swell + two scrolling ripple layers
          vec3 N = normalize(vNormal);
          vec2 wdir = uWind.xy;
          vec2 uv1 = vWorld.xz * 0.043 + wdir * t * 0.028;
          vec2 uv2 = vWorld.xz * 0.097 + vec2(-wdir.y, wdir.x) * t * 0.021 + 0.37;
          vec2 r1 = texture(uNormalTex, uv1).xy * 2.0 - 1.0;
          vec2 r2 = texture(uNormalTex, uv2).xy * 2.0 - 1.0;
          float detailFade = 1.0 - smoothstep(140.0, 520.0, vViewDist);
          vec2 rip = (r1 * 0.9 + r2 * 0.6) * (0.55 + 0.45 * detailFade);
          #if HQ
            vec2 uv3 = vWorld.xz * 0.23 - wdir * t * 0.05;
            rip += (texture(uNormalTex, uv3).xy * 2.0 - 1.0) * 0.35 * detailFade;
          #endif
          N = normalize(N + vec3(rip.x, 0.0, rip.y) * 0.4);

          // ---- ship wakes: height-field normals so every V-arm and ring catches the light
          vec2 wuv = (vWorld.xz - uWakeRect.xy) * uWakeRect.w + 0.5;
          vec4 wk = texture(uWakeTex, wuv);
          float wtx = uWakeTexel;
          vec2 wGrad = vec2(
            texture(uWakeTex, wuv + vec2(wtx, 0.0)).g - texture(uWakeTex, wuv - vec2(wtx, 0.0)).g,
            texture(uWakeTex, wuv + vec2(0.0, wtx)).g - texture(uWakeTex, wuv - vec2(0.0, wtx)).g
          ) / (2.0 * wtx * uWakeRect.z);
          vec2 wb = min(wuv, 1.0 - wuv);
          float wIn = smoothstep(0.0, 0.04, min(wb.x, wb.y));
          wGrad *= wIn;
          float wakeH = wk.g * wIn;
          N = normalize(N - vec3(wGrad.x, 0.0, wGrad.y) * 2.3);

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

          float cloud = cloudShadow(vWorld.xz);
          #ifdef WATER_SHADOW
            cloud *= mix(0.42, 1.0, waterShadow(vWorld));
          #endif
          float ndl = max(dot(N, L), 0.0);

          // Beer–Lambert absorption + in-scattering (the "volume")
          float path = thickR * 1.0;
          vec3 absorb = vec3(0.40, 0.095, 0.068);
          vec3 T = exp(-absorb * path);
          vec3 scatterDeep = vec3(0.006, 0.085, 0.17);
          vec3 scatterShallow = vec3(0.04, 0.32, 0.36);
          vec3 scatter = mix(scatterShallow, scatterDeep, smoothstep(0.0, 14.0, path));
          float light = (0.55 + 0.45 * cloud) * (0.6 + 0.4 * L.y);
          vec3 body = refr * T + scatter * light * (1.0 - T) * 1.35;

          // sub-surface glow on crests facing away from the sun
          float sssView = pow(max(dot(V, -L + vec3(0.0, 0.6, 0.0)), 0.0), 2.0);
          float sss = clamp(vCrest * 0.9 + (vWorld.y - 0.1) * 0.55, 0.0, 1.0) * (0.4 + sssView);
          body += vec3(0.05, 0.42, 0.36) * sss * 0.32 * light;
          // wake crests glow translucent turquoise, troughs sink a touch deeper
          body += vec3(0.04, 0.36, 0.34) * clamp(wakeH * 1.6, -0.25, 1.0) * (0.45 + sssView) * light * 0.5;

          // ---- reflection
          vec3 R = reflect(-V, N);
          R.y = abs(R.y);
          vec3 refl = skyColor(R);
          float NdV = max(dot(N, V), 0.0);
          float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
          F = min(F * 1.1, 1.0);

          // sun glitter: sharp sparkles + soft sheen
          vec3 H = normalize(L + V);
          float nh = max(dot(N, H), 0.0);
          float spec = pow(nh, 2200.0) * 5.0 + pow(nh, 320.0) * 0.28;
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
          float pat = lace * 0.55 + lace2 * 0.45 + (nz2.r - 0.5) * 0.3;
          float thr = 0.9 - wf * 0.62;
          float wakeFoam = smoothstep(thr - 0.09, thr + 0.07, pat) * smoothstep(0.015, 0.1, wf);
          wakeFoam = max(wakeFoam, smoothstep(0.9, 1.7, wf));
          wakeFoam *= 0.55 + 0.45 * smoothstep(0.0, 0.7, wf);
          float crestFoam = smoothstep(0.55, 1.05, vCrest + nz2.g * 0.35) * 0.55;
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
    if (!sh.map || !sh.map.depthTexture || this.material.defines.WATER_SHADOW) return;
    const u = this.material.uniforms;
    u.uShadowMap.value = sh.map.depthTexture;
    u.uShadowMatrix.value = sh.matrix;
    u.uShadowTexel.value.set(1 / sh.mapSize.x, 1 / sh.mapSize.y);
    this.material.defines.WATER_SHADOW = 1;
    this.material.needsUpdate = true;
  }

  setSceneTextures(color: THREE.Texture, depth: THREE.Texture, w: number, h: number, cam: THREE.PerspectiveCamera) {
    const u = this.material.uniforms;
    u.uSceneColor.value = color;
    u.uSceneDepth.value = depth;
    u.uResolution.value.set(w, h);
    u.uCamNearFar.value.set(cam.near, cam.far);
  }
}
