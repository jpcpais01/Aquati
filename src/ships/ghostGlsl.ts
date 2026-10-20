// Ghost ships: injected into a ship's own patched materials (see patchMaterial
// `ghost`), so a phantom hull keeps every trick a living one has (damage
// holes, billowing sails, waving flags) and only its look changes.
//
//  - the timber drains to a cold, ashen sea-green and goes half see-through:
//    the shader writes its opacity into the opaque pass's alpha, and the sea
//    behind the hull reads it and shows through (see ocean.ts, GHOST_SEE)
//  - edges glow: a fresnel rim of spectral green, brightest after dark
//  - rot: ragged holes drift slowly across planks and canvas, their edges
//    burning green; sails are mostly holes
//  - ectoplasm: faint bands of light crawl up the hull
//  - presence (uGhost.x) sweeps the rot over the whole ship, so she
//    materialises out of the mist, and dissolves the same way when sunk
//
// uGhost: x presence 0..1, y flare (struck), z seed, w unused.

/** The ghostly green every phantom effect shares (linear). */
export const GHOST_GREEN: [number, number, number] = [0.3, 1.0, 0.66];

export const GLSL_GHOST_VERTEX = /* glsl */ `
#ifdef AQ_GHOST
  {
    // a slow spectral shimmer: the whole ship wavers like heat haze
    float ghW = sin(uTime * 1.3 + transformed.y * 0.9 + transformed.z * 0.25);
    transformed.x += ghW * 0.035;
    transformed.y += sin(uTime * 0.9 + transformed.z * 0.4 + transformed.x) * 0.03;
  }
#endif
`;

export const GLSL_GHOST_FRAGMENT_PARS = /* glsl */ `
#ifdef AQ_GHOST
uniform vec4 uGhost;
#endif
`;

// after the damage chunk: aqDl is the fragment in hull-root space
export const GLSL_GHOST_COLOR = /* glsl */ `
#ifdef AQ_GHOST
  vec3 ghEmis = vec3(0.0);
  float ghEdge = 0.0;
  {
    #ifdef AQ_DAMAGE
      vec3 gp = aqDl;
    #else
      vec3 gp = vAqWorld;
    #endif
    float t = uTime;
    vec2 sd = vec2(uGhost.z * 0.37, uGhost.z * 0.61);
    // rot, read on all three planes so every surface (planks, deck, canvas) gets it
    float n = (texture(uNoiseTex, gp.zy * 0.085 + sd + vec2(t * 0.011, -t * 0.017)).g
      + texture(uNoiseTex, gp.xy * 0.11 + sd.yx - vec2(t * 0.013, t * 0.009)).g
      + texture(uNoiseTex, gp.xz * 0.095 + sd + vec2(-t * 0.008, t * 0.012)).a) / 3.0;
    n += (texture(uNoiseTex, gp.zy * 0.41 + gp.x * 0.07 + sd).g - 0.5) * 0.14;
    #if defined(AQ_SAIL) || defined(AQ_FLAG)
      float thr = 0.36;
    #else
      float thr = 0.235;
    #endif
    // materialising and dissolving: the rot floods the ship, from the trucks down
    float pres = clamp(uGhost.x, 0.0, 1.0);
    thr += (1.0 - pres) * (0.75 + clamp(gp.y * 0.012, 0.0, 0.35));
    if (n < thr) discard;
    ghEdge = 1.0 - smoothstep(thr, thr + 0.045, n);
    // the timber drained of life: ashen sea-green, the grain still faintly there
    float lum = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
    diffuseColor.rgb = vec3(lum) * vec3(0.3, 0.7, 0.52) * 0.62 + vec3(0.004, 0.02, 0.012);
    vec3 G = vec3(${GHOST_GREEN.join(', ')});
    // ectoplasm crawling up the planking in slow bands
    float band = sin(gp.y * 1.3 - t * 1.4 + n * 9.0 + gp.z * 0.08);
    ghEmis = G * (ghEdge * 2.6 + smoothstep(0.8, 1.0, band) * 0.14);
  }
#endif
`;

export const GLSL_GHOST_EMISSIVE = /* glsl */ `
#ifdef AQ_GHOST
  float ghA;
  {
    float rim = 1.0 - abs(dot(normal, normalize(vViewPosition)));
    float r3 = rim * rim * rim;
    vec3 G = vec3(${GHOST_GREEN.join(', ')});
    // by day it takes more of its own light to read green against the bright sea
    float day = 1.0 - uNight;
    float flare = uGhost.y;
    totalEmissiveRadiance += (ghEmis + G * (0.015 + day * 0.1 + r3 * (0.72 + day * 0.4) + flare * 0.8)) * clamp(uGhost.x * 1.4, 0.0, 1.0);
    // opaque at the silhouette and the burning edges, see-through across the faces
    // (a little more of her by day, or she'd vanish into the glitter)
    ghA = clamp(0.28 + day * 0.24 + r3 * 0.7 + ghEdge * 0.6 + flare * 0.3, 0.0, 1.0) * smoothstep(0.0, 0.35, uGhost.x);
    #if defined(AQ_SAIL) || defined(AQ_FLAG)
      ghA *= 0.82;
    #endif
  }
#endif
`;

export const GLSL_GHOST_ALPHA = /* glsl */ `
#ifdef AQ_GHOST
  // read by the sea behind her: < 1 lets the water show through (never 0, which is "nothing here")
  gl_FragColor.a = max(ghA, 0.02);
#endif
`;
