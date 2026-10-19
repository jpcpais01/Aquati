// Battle damage, injected into every patched ship material (see patchMaterial).
// Everything is evaluated in ship-local space (uDmgInv maps world -> hull
// root), so holes, scorch and the wreck's break line stay glued to the timber
// however the ship pitches, rolls or splits in two.
//
//  - holes: jagged cannonball breaches that cut clean through the planking,
//    ringed by splintered raw wood, a soot halo and embers that cool off
//  - patches: holes your crew has boarded over with fresh planks
//  - wear: soot streaks and scorch spreading across the whole hull
//  - split: the wreck's jagged break line (each half discards the other)
//  - canvas: sails and flags tear into ragged, burnt-edged holes

export const DAMAGE_MAX_HOLES = 24;

export const GLSL_DAMAGE_VERTEX_PARS = /* glsl */ `
#if defined(AQ_DAMAGE) && defined(AQ_SAIL)
varying float vAqSeed;
#endif
`;

export const GLSL_DAMAGE_VERTEX = /* glsl */ `
#if defined(AQ_DAMAGE) && defined(AQ_SAIL)
  vAqSeed = aBillow * 3.71;
#endif
`;

export const GLSL_DAMAGE_FRAGMENT_PARS = /* glsl */ `
#ifdef AQ_DAMAGE
#define AQ_MAX_HOLES ${DAMAGE_MAX_HOLES}
uniform mat4 uDmgInv;
uniform vec4 uDmgHoles[AQ_MAX_HOLES];    // local centre xyz, radius (negative = patched)
uniform vec4 uDmgHoleInfo[AQ_MAX_HOLES]; // outward side (+1 port / -1 starboard), hold floor y, seed, birth time
uniform int uDmgCount;
uniform vec4 uDmgSplit;                  // break z, kept side (+1 bow / -1 stern / 0 whole), jag, burn
uniform vec4 uDmgState;                  // hull wear, fire, seed, canvas wear
#ifdef AQ_SAIL
varying float vAqSeed;
#endif
#endif
`;

export const GLSL_DAMAGE_FRAGMENT = /* glsl */ `
#ifdef AQ_DAMAGE
  float aqDmgRough = 0.0;
  vec3 aqDmgEmber = vec3(0.0);
  vec3 aqDl = (uDmgInv * vec4(vAqWorld, 1.0)).xyz;
#if defined(AQ_SAIL) || defined(AQ_FLAG)
  {
    float sw = uDmgState.w;
    if (sw > 0.002) {
      #ifdef USE_MAP
        vec2 tuv = vMapUv;
      #else
        vec2 tuv = aqDl.xy * 0.08;
      #endif
      #ifdef AQ_SAIL
        tuv += vec2(vAqSeed * 0.37, vAqSeed * 0.61);
      #endif
      tuv += uDmgState.z;
      float n = texture(uNoiseTex, tuv * vec2(0.42, 0.6)).g * 0.72 + texture(uNoiseTex, tuv * vec2(1.1, 1.5)).a * 0.28;
      float e = n - (1.0 - sw * 0.5);
      if (e > 0.0) discard;
      float burnt = smoothstep(-0.045, 0.0, e);
      diffuseColor.rgb *= (1.0 - burnt * 0.82) * (1.0 - sw * 0.22 * texture(uNoiseTex, tuv * 0.25).r);
      aqDmgEmber = vec3(2.4, 0.8, 0.15) * smoothstep(-0.012, 0.0, e) * uDmgState.y;
    }
  }
#else
  {
    // the wreck's break line: each half keeps its own side of a ragged seam
    float aqSeam = 1e3;
    if (uDmgSplit.y != 0.0) {
      float jag = (texture(uNoiseTex, aqDl.xy * vec2(0.09, 0.14) + uDmgState.z).g - 0.5) * uDmgSplit.z
                + (texture(uNoiseTex, aqDl.xy * vec2(0.05, 0.4)).a - 0.5) * 1.1;
      aqSeam = (aqDl.z - uDmgSplit.x - jag) * uDmgSplit.y;
      if (aqSeam < 0.0) discard;
    }
    float aqHole = 0.0, aqCut = 0.0, aqRim = 0.0, aqSoot = 0.0, aqPatch = 0.0, aqPatchLine = 0.0, aqHeat = 0.0;
    for (int i = 0; i < AQ_MAX_HOLES; i++) {
      if (i >= uDmgCount) break;
      vec4 h = uDmgHoles[i];
      vec3 d = aqDl - h.xyz;
      float R = abs(h.w);
      float d2 = dot(d, d);
      if (d2 > R * R * 5.0) continue;
      vec4 info = uDmgHoleInfo[i];
      // only the struck side of the hull (and what's right behind it)
      if (d.x * info.x < -R * 0.9) continue;
      if (h.w < 0.0) {
        // boarded over with fresh planks
        vec2 pq = abs(vec2(d.z, d.y)) / vec2(R * 1.15, R * 0.85);
        float inside = 1.0 - step(1.0, max(pq.x, pq.y));
        float pl = fract((aqDl.y + info.z) / 0.19);
        float gap = smoothstep(0.0, 0.1, pl) * smoothstep(1.0, 0.9, pl);
        float edge = smoothstep(0.86, 0.96, max(pq.x, pq.y));
        aqPatch = max(aqPatch, inside);
        aqPatchLine = max(aqPatchLine, inside * max(1.0 - gap, edge));
        continue;
      }
      vec2 q = vec2(d.z, d.y) / R;
      float n = texture(uNoiseTex, q * 0.2 + info.z).g;
      float n2 = texture(uNoiseTex, q * vec2(0.05, 0.3) + info.z * 1.7).a;
      float r = sqrt(d2) / R;
      float rr = r + (n - 0.5) * 0.9 + (n2 - 0.5) * 0.55;
      float hole = 1.0 - step(0.5, rr);
      aqHole = max(aqHole, hole);
      aqCut = max(aqCut, hole * step(info.y, aqDl.y));
      aqRim = max(aqRim, 1.0 - smoothstep(0.5, 0.82, rr));
      aqSoot = max(aqSoot, 1.0 - smoothstep(0.45, 1.9, r + (n - 0.5) * 0.8));
      float age = uTime - info.w;
      aqHeat = max(aqHeat, (1.0 - smoothstep(0.48, 0.95, rr)) * (exp(-age * 0.5) + uDmgState.y * 0.3));
    }
    #ifdef AQ_DMG_CUT
      if (aqCut > 0.5 && gl_FrontFacing) discard;
    #else
      aqCut = 0.0;
    #endif
    if (!gl_FrontFacing) {
      // looking into the hold through a breach: dark, damp timber
      float hn = texture(uNoiseTex, aqDl.zy * vec2(0.3, 2.2)).a;
      diffuseColor.rgb = vec3(0.075, 0.052, 0.034) * (0.7 + hn * 0.6);
      aqDmgRough = 1.0;
    } else {
      float wear = uDmgState.x;
      if (wear > 0.002) {
        float wn = texture(uNoiseTex, aqDl.zy * vec2(0.035, 0.07) + uDmgState.z).g * 0.7 + texture(uNoiseTex, aqDl.zy * 0.11).a * 0.3;
        aqSoot = max(aqSoot, smoothstep(0.98 - wear * 0.5, 1.06 - wear * 0.5, wn) * min(1.0, wear * 1.5) * 0.85);
      }
      aqSoot = max(aqSoot, 1.0 - smoothstep(0.0, 1.6, aqSeam));
      aqRim = max(aqRim, 1.0 - smoothstep(0.0, 0.32, aqSeam));
      aqHeat = max(aqHeat, (1.0 - smoothstep(0.0, 0.5, aqSeam)) * uDmgSplit.w);
      vec3 fresh = vec3(0.74, 0.55, 0.34) * (0.82 + 0.3 * texture(uNoiseTex, aqDl.zy * vec2(0.2, 2.6)).a);
      diffuseColor.rgb = mix(diffuseColor.rgb, fresh * (1.0 - aqPatchLine * 0.72), aqPatch);
      vec3 raw = vec3(0.7, 0.52, 0.33) * (0.7 + 0.6 * texture(uNoiseTex, aqDl.zy * vec2(0.25, 3.0)).a);
      diffuseColor.rgb *= 1.0 - aqSoot * 0.84;
      diffuseColor.rgb = mix(diffuseColor.rgb, raw * mix(1.0, 0.3, aqSoot * aqSoot), aqRim * (1.0 - aqHole));
      // breaches that can't open (below the hold floor, or iron) are dark, sooty pits
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025, 0.02, 0.016), aqHole * (1.0 - aqCut));
      aqDmgRough = max(aqRim, aqSoot * 0.85);
      float flick = 0.62 + 0.38 * sin(uTime * 9.0 + aqDl.z * 3.1 + aqDl.y * 4.7) * sin(uTime * 5.3 + aqDl.y * 2.0);
      aqDmgEmber = vec3(2.6, 0.75, 0.12) * aqHeat * aqHeat * flick * (1.0 - aqCut);
    }
  }
#endif
#endif
`;

export const GLSL_DAMAGE_SURFACE = /* glsl */ `
#ifdef AQ_DAMAGE
  roughnessFactor = mix(roughnessFactor, 1.0, aqDmgRough);
  metalnessFactor *= 1.0 - aqDmgRough;
#endif
`;

export const GLSL_DAMAGE_EMISSIVE = /* glsl */ `
#ifdef AQ_DAMAGE
  totalEmissiveRadiance += aqDmgEmber;
#endif
`;
