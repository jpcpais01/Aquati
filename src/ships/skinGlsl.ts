// Procedural hull skins, shared by the ship shaders (patched into the hull,
// painted woodwork and sails) and the little previews in the Vault and the
// Shipwright, so a card always shows exactly what the ship will wear.
//
// Every skin is one branch of a single function picked by a uniform, so all
// of them live in the same compiled program: equipping one is a uniform
// change and can never stall a frame on a shader compile.
//
// p is in metres on the hull (along the ship, up from the waterline) and a
// stretched sail-space on canvas. Pure maths, no textures.

export const GLSL_SKIN = /* glsl */ `
uniform float uSkin;
uniform vec3 uSkinA;
uniform vec3 uSkinB;
uniform vec3 uSkinC;
uniform vec4 uSkinP; // x glow, y sail amount, z -, w seed

float skH(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 skH2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float skN(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(skH(i), skH(i + vec2(1.0, 0.0)), u.x), mix(skH(i + vec2(0.0, 1.0)), skH(i + vec2(1.0, 1.0)), u.x), u.y);
}

float skFbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * skN(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}

// x: distance to the nearest point, y: gap to the second (0 on a cell edge), z: cell id
vec3 skVor(vec2 p, float t) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  float id = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = skH2(n + g);
      o = 0.5 + 0.45 * sin(t + 6.2831 * o);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = skH(n + g);
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  d1 = sqrt(d1);
  return vec3(d1, sqrt(d2) - d1, id);
}

vec3 skHue(float h) {
  return clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
}

// overlapping fish scales: x radial 0..1 within the scale, y scale id
vec2 skScales(vec2 s) {
  float row = floor(s.y);
  vec2 best = vec2(1.0, 0.0);
  for (int k = 1; k >= 0; k--) {
    float r = row + float(k);
    float x = s.x + 0.5 * mod(r, 2.0);
    vec2 c = vec2(floor(x) + 0.5, r);
    float d = length(vec2(x - c.x, (s.y - c.y) * 1.08)) / 0.74;
    if (d < 1.0) return vec2(d, skH(c + r * 7.0));
  }
  return best;
}

// tiny twinkling stars on a grid of cells
float skStars(vec2 p, float density, float t) {
  vec2 c = floor(p);
  vec2 h = skH2(c);
  vec2 pos = 0.2 + 0.6 * h;
  float d = length(fract(p) - pos);
  float on = step(1.0 - density, skH(c + 3.1));
  float tw = 0.55 + 0.45 * sin(t * (1.5 + h.y * 3.5) + h.x * 40.0);
  float core = max(0.0, 1.0 - d * 9.0);
  return on * core * core * tw;
}

// Albedo of skin uSkin at p. ndv: facing ratio (1 head on). t: time.
// sail: 1 on canvas. Adds glow to emis and may set metal / rough.
vec3 aqSkin(vec2 p, float ndv, float t, float sail, inout vec3 emis, inout float metal, inout float rough) {
  int id = int(uSkin + 0.5);
  vec3 A = uSkinA;
  vec3 B = uSkinB;
  vec3 C = uSkinC;
  vec2 fw = fwidth(p);
  float aa = max(max(fw.x, fw.y), 1e-4);
  float glow = uSkinP.x;
  float fres = 1.0 - ndv;
  vec3 col = A;
  metal = 0.0;
  rough = 0.5;

  if (id == 1) {
    // harbour stripes: bands with a pinstripe on every seam
    float y = p.y * 1.35;
    float tri = abs(fract(y) - 0.5) * 2.0;
    float w = aa * 1.35 * 2.0;
    col = mix(A, B, smoothstep(0.5 - w, 0.5 + w, tri));
    float pin = 1.0 - smoothstep(0.035, 0.035 + w, abs(tri - 0.5));
    col = mix(col, C, pin);
    rough = 0.42;
  } else if (id == 2) {
    // harlequin diamonds with gilded seams
    vec2 q = mat2(0.7071, 0.7071, -0.7071, 0.7071) * p * 1.15;
    vec2 cell = floor(q);
    float k = mod(cell.x + cell.y, 2.0);
    col = mix(A, B, k);
    vec2 d = abs(fract(q + 0.5) - 0.5);
    float line = min(d.x, d.y);
    float lw = aa * 1.6;
    float gold = 1.0 - smoothstep(0.028, 0.028 + lw, line);
    col = mix(col, C, gold);
    metal = gold * 0.9;
    rough = mix(0.45, 0.28, gold);
  } else if (id == 3 || id == 13) {
    // fish / mermaid scales
    vec2 sc = skScales(p * vec2(2.0, 2.3));
    float g = sc.x;
    float rim = smoothstep(0.82, 0.94, g);
    if (id == 3) {
      col = mix(B, A, g * g);
      col = mix(col, C, rim * 0.85);
      rough = 0.4;
    } else {
      float hue = 0.46 + (sc.y - 0.5) * 0.08 + fres * 0.32 + sin(p.x * 0.4 + p.y * 0.7) * 0.04;
      vec3 iri = skHue(hue) * 0.75 + 0.15;
      col = mix(mix(iri, B, 0.35), A, g * g * 0.8);
      col = mix(col, C, rim * 0.9);
      metal = 0.55 * (1.0 - rim);
      rough = 0.22;
      emis += iri * fres * fres * 0.12;
    }
  } else if (id == 4) {
    // coral polka: staggered spots with a fine ring
    vec2 s = p * 1.55;
    s.x += 0.5 * mod(floor(s.y), 2.0);
    float d = length(fract(s) - 0.5);
    float w = aa * 1.55;
    col = mix(A, B, 1.0 - smoothstep(0.22, 0.22 + w, d));
    col = mix(col, C, (1.0 - smoothstep(0.035, 0.035 + w, abs(d - 0.3))) * 0.9);
    rough = 0.45;
  } else if (id == 5) {
    // tiger shark: wavy tapered stripes over a pale belly
    vec3 base = mix(C, A, smoothstep(-0.4, 1.3, p.y));
    float warp = skFbm(p * vec2(0.3, 0.7)) * 3.0;
    float s = sin(p.x * 2.3 + warp * 2.2 + p.y * 0.6);
    float taper = 0.55 + 0.45 * skN(p * vec2(0.9, 0.5) + 3.0);
    float stripe = smoothstep(0.5, 0.5 + aa * 6.0 + 0.04, s * taper);
    col = mix(base, B, stripe);
    rough = 0.48;
  } else if (id == 6) {
    // reef camo
    float n1 = skFbm(p * 0.42 + uSkinP.w);
    float n2 = skFbm(p * 0.8 + 7.3);
    float n3 = skFbm(p * 1.3 - 3.1);
    float e = 0.012 + aa * 0.6;
    col = A;
    col = mix(col, B, smoothstep(0.52 - e, 0.52 + e, n1));
    col = mix(col, C, smoothstep(0.58 - e, 0.58 + e, n2));
    col = mix(col, A * 0.55, smoothstep(0.62 - e, 0.62 + e, n3) * 0.9);
    rough = 0.75;
  } else if (id == 7) {
    // sunset chevrons
    float v = p.y * 1.1 + abs(fract(p.x * 0.22) - 0.5) * 2.4;
    float band = floor(v);
    float f = fract(v);
    float k0 = mod(band, 3.0);
    float k1 = mod(band + 1.0, 3.0);
    vec3 c0 = k0 < 0.5 ? A : (k0 < 1.5 ? B : C);
    vec3 c1 = k1 < 0.5 ? A : (k1 < 1.5 ? B : C);
    float w = aa * 3.0;
    col = mix(c0, c1, smoothstep(1.0 - w, 1.0, f));
    col *= 0.86 + 0.14 * smoothstep(0.0, 0.5, f);
    rough = 0.4;
  } else if (id == 8) {
    // highland tartan: crossing bands, a fine gold thread and a twill weave
    vec2 q = p * 1.1;
    vec2 fq = fract(q);
    float bx = smoothstep(0.08, 0.08 + aa * 2.0, fq.x) * (1.0 - smoothstep(0.38, 0.38 + aa * 2.0, fq.x));
    float by = smoothstep(0.08, 0.08 + aa * 2.0, fq.y) * (1.0 - smoothstep(0.38, 0.38 + aa * 2.0, fq.y));
    col = A;
    col = mix(col, B, max(bx, by) * 0.85);
    col = mix(col, B * 0.6, bx * by * 0.7);
    vec2 th = abs(fq - 0.68);
    float thread = 1.0 - smoothstep(0.012, 0.012 + aa * 2.0, min(th.x, th.y));
    col = mix(col, C, thread * 0.9);
    float twill = sin((p.x + p.y) * 70.0) * (1.0 - smoothstep(0.004, 0.02, aa));
    col *= 0.93 + 0.07 * twill;
    rough = 0.82;
  } else if (id == 9) {
    // carrara marble
    float w = skFbm(p * 0.55 + uSkinP.w) * 6.0;
    float v = abs(sin(p.x * 0.7 + p.y * 0.45 + w));
    float vein = 1.0 - smoothstep(0.0, 0.14 + aa * 4.0, v);
    float v2 = abs(sin(p.x * 1.3 - p.y * 0.8 + w * 1.4 + 1.3));
    float goldv = 1.0 - smoothstep(0.0, 0.035 + aa * 3.0, v2);
    col = A * (0.94 + 0.06 * skN(p * 3.0));
    col = mix(col, B, vein * 0.75);
    col = mix(col, C, goldv * 0.9);
    metal = goldv * 0.85;
    rough = mix(0.16, 0.3, goldv);
  } else if (id == 10) {
    // kintsugi: black lacquer, cracks mended in gold
    vec2 q = p * 0.75 + vec2(skFbm(p * 0.8), skFbm(p * 0.8 + 5.0)) * 0.6;
    vec3 v = skVor(q, 0.0);
    float gold = 1.0 - smoothstep(0.03, 0.06 + aa * 3.0, v.y);
    col = mix(A, B, v.z * 0.35 + skN(p * 1.7) * 0.15);
    col = mix(col, C, gold);
    metal = gold;
    rough = mix(0.1, 0.24, gold);
    emis += C * gold * 0.05;
  } else if (id == 11) {
    // kraken ink: slowly churning warped swirls
    vec2 q = p * 0.33;
    float s = t * 0.035;
    vec2 w = vec2(skFbm(q + vec2(s, 0.0)), skFbm(q + vec2(5.2, 1.3) - s));
    float f = skFbm(q + w * 2.4);
    col = mix(A, B, smoothstep(0.35, 0.72, f));
    col = mix(col, C, smoothstep(0.6, 0.85, f) * 0.85);
    col += C * fres * fres * fres * 0.25;
    rough = 0.3;
    metal = 0.15;
  } else if (id == 12) {
    // royal damask: gilded rosettes on crimson velvet
    vec2 s = p * 0.85;
    s.x += 0.5 * mod(floor(s.y), 2.0);
    vec2 q = fract(s) - 0.5;
    float r = length(q);
    float a = atan(q.y, q.x);
    float petal = r - (0.2 + 0.09 * cos(a * 6.0));
    float w = aa * 1.6;
    float orn = 1.0 - smoothstep(-w, w, petal);
    orn *= smoothstep(0.045, 0.045 + w, abs(petal + 0.06)) * 0.6 + 0.4;
    orn = max(orn, 1.0 - smoothstep(0.018, 0.018 + w, abs(r - 0.35)));
    orn = max(orn, 1.0 - smoothstep(0.05, 0.05 + w, r));
    vec2 dq = abs(q);
    float lattice = 1.0 - smoothstep(0.012, 0.012 + w, abs(dq.x + dq.y - 0.5));
    orn = max(orn, lattice * 0.8);
    col = A * (0.85 + 0.25 * fres);
    col = mix(col, mix(B, C, 0.25 + 0.5 * (1.0 - r * 2.0)), orn);
    metal = orn * 0.9;
    rough = mix(0.7, 0.3, orn);
  } else if (id == 14) {
    // molten core: basalt plates split by flowing lava
    vec2 q = p * 0.62 + vec2(0.0, -t * 0.04);
    vec3 v = skVor(q, t * 0.55);
    float crack = 1.0 - smoothstep(0.0, 0.11, v.y);
    float flow = 0.5 + 0.5 * sin(t * 2.1 - p.x * 0.8 + v.z * 6.28);
    float heat = crack * (0.5 + 0.5 * flow);
    col = A * (0.8 + 0.5 * skN(p * 2.6)) * (1.0 - crack * 0.6);
    col = mix(col, B * 0.4, crack * 0.6);
    emis += (mix(B, C, heat * heat) * heat * 2.6 + B * (1.0 - v.x) * 0.1 * flow) * glow;
    rough = 0.85;
  } else if (id == 15) {
    // aurora: rippling curtains over a starry midnight
    float x = p.x * 0.32 + t * 0.05;
    float cur = skFbm(vec2(x * 2.0, t * 0.12));
    float h = p.y * 0.42 - (0.25 + 0.3 * sin(x * 3.1 + t * 0.35) + 0.45 * cur) - sail * 0.8;
    float band = exp(-h * h * 9.0) + 0.45 * exp(-(h + 0.45) * (h + 0.45) * 22.0);
    float rays = 0.55 + 0.45 * sin(p.x * 8.0 + skN(vec2(p.x * 2.5, t * 0.6)) * 5.0);
    vec3 ac = mix(B, C, smoothstep(-0.25, 0.55, h + 0.15 * sin(t * 0.25 + p.x * 0.5)));
    col = mix(A, ac * 0.35, band * 0.6);
    emis += ac * band * rays * 1.6 * glow;
    emis += vec3(0.85, 0.9, 1.0) * skStars(p * 5.0, 0.12, t) * 1.6 * glow;
    rough = 0.55;
  } else if (id == 16) {
    // starlit voyage: drifting nebula and twinkling stars
    vec2 q = p * 0.45 + vec2(t * 0.025, t * 0.006);
    float n = skFbm(q * 1.3);
    float n2 = skFbm(q * 2.6 + 4.0);
    vec3 neb = mix(A, B, smoothstep(0.3, 0.78, n));
    neb = mix(neb, C, smoothstep(0.55, 0.88, n2) * 0.7);
    col = neb * 0.7;
    emis += neb * n * n * n * 0.9 * glow;
    float st = skStars(p * 6.0 + vec2(t * 0.15, 0.0), 0.16, t) + skStars(p * 2.2 + 11.0, 0.08, t * 0.7) * 1.6;
    emis += vec3(1.0, 0.95, 0.88) * st * 2.4 * glow;
    rough = 0.45;
  } else if (id == 17) {
    // ghostfire: spectral flames rising from the waterline
    vec2 q = vec2(p.x * 1.1, p.y * 0.95 - t * 1.5);
    float n = skFbm(q * 1.3);
    float n2 = skN(q * 3.2 + 2.0);
    float hgt = clamp(p.y * (sail > 0.5 ? 0.14 : 0.33) + 0.3, 0.0, 1.0);
    float fl = smoothstep(0.38, 0.86, n * 1.15 + n2 * 0.25 - hgt * 0.55 + 0.12);
    float flicker = 0.85 + 0.15 * sin(t * 13.0 + p.x * 2.0);
    col = mix(A, B * 0.3, fl);
    emis += mix(B, C, fl * fl) * fl * 2.2 * flicker * glow;
    emis += B * 0.05 * glow;
    rough = 0.5;
  } else if (id == 18) {
    // living tide: caustic light and a glowing swell from bow to stern
    vec3 v1 = skVor(p * 0.85 + vec2(t * 0.14, t * 0.05), t * 0.8);
    vec3 v2 = skVor(p * 1.25 - vec2(t * 0.09, -t * 0.07) + 3.0, t * 0.6);
    float c1 = 1.0 - smoothstep(0.0, 0.16, v1.y);
    float c2 = 1.0 - smoothstep(0.0, 0.13, v2.y);
    float c = c1 * c1 + c2 * c2 * 0.7;
    float sw = 0.5 + 0.5 * sin(p.x * 0.55 - t * 1.8 + sin(p.y * 1.2 + t * 0.4) * 0.8);
    sw = sw * sw * sw * sw * sw;
    col = mix(A, B * 0.45, c * 0.35 + smoothstep(-0.5, 4.0, p.y) * 0.15);
    emis += (B * c * 0.75 + C * sw * 1.4) * glow;
    rough = 0.3;
    metal = 0.1;
  }
  return col;
}
`;

// Upgrade sails: the cloth of a refitted rig, over whatever skin she wears.
// One branch per part, picked by uPartSail.x (0 is plain canvas), like the
// skins above, so changing sails never compiles anything. uv is the sail's
// own (x across, y up from the foot); `cloth` masks the bare canvas so
// emblems and accent stripes stay on top.
export const GLSL_PART_SAIL = /* glsl */ `
uniform vec4 uPartSail;

float psLine(float x, float period, float w) {
  float d = abs(fract(x / period + 0.5) - 0.5) * period;
  return 1.0 - smoothstep(w, w + fwidth(x) * 1.5, d);
}

float psAt(float x, float at, float w) {
  return 1.0 - smoothstep(w, w + fwidth(x) * 1.5, abs(x - at));
}

void aqSailPart(vec2 uv, float t, float cloth, inout vec3 col, inout vec3 emis, inout float metal, inout float rough, inout float amt) {
  float id = uPartSail.x;
  float u = uv.x;
  float v = 1.0 - uv.y; // 0 at the yard .. 1 at the foot
  float edge = min(min(u, 1.0 - u), min(v, 1.0 - v));
  vec3 gold = vec3(1.0, 0.7, 0.26);
  if (id < 1.5) {
    // storm canvas: doubled tablings, seamed cloths, three reef bands and patched clews
    float tab = 1.0 - smoothstep(0.045, 0.052, edge);
    col *= mix(1.0, 0.84, tab);
    col *= 1.0 - psLine(u, 1.0 / 9.0, 0.0015) * 0.16;
    float clew = 1.0 - smoothstep(0.15, 0.16, (1.0 - v) + min(u, 1.0 - u));
    col *= mix(1.0, 0.88, clew);
    for (int i = 0; i < 3; i++) {
      float r = 0.17 + float(i) * 0.13;
      col *= 1.0 - psAt(v, r, 0.002) * 0.3;
      vec2 d = vec2((fract(u * 22.0) - 0.5) / 22.0 * 1.4, v - r - 0.008);
      col *= 1.0 - (1.0 - smoothstep(0.004, 0.0065, length(d))) * 0.55;
    }
  } else if (id < 2.5) {
    // clipper cloth: bright, tight-woven, bound in crimson with a gilt pinstripe
    col *= mix(1.0, 1.07, cloth);
    col *= 1.0 - psLine(u, 1.0 / 12.0, 0.001) * 0.08;
    float bind = 1.0 - smoothstep(0.032, 0.038, edge);
    col = mix(col, vec3(0.42, 0.04, 0.05), bind);
    float pin = psAt(edge, 0.05, 0.0035);
    col = mix(col, gold, pin);
    metal = mix(metal, 0.8, pin);
    rough = mix(rough, 0.35, pin);
    amt = max(amt, pin);
  } else if (id < 3.5) {
    // batwing battens: bamboo ribs across the cloth, a fan of tinted panels, scalloped dark edges
    float k = v * 7.0;
    float rib = psAt(fract(k + 0.5) - 0.5, 0.0, 0.035);
    float panel = fract(k);
    col *= mix(0.84, 1.04, sin(panel * 3.14159));
    col *= mix(1.0, 0.9, mod(floor(k), 2.0));
    float scallop = 0.035 + 0.02 * sin(panel * 3.14159);
    float rim = 1.0 - smoothstep(scallop, scallop + 0.006, min(u, 1.0 - u));
    col = mix(col, vec3(0.1, 0.12, 0.17), rim * 0.85);
    col = mix(col, vec3(0.3, 0.2, 0.09), rib * step(0.02, v) * step(v, 0.98));
  } else if (id < 4.5) {
    // phoenix canvas: a gilded phoenix spreading its plumes, flames rising from the foot, an embroidered border
    vec2 p = vec2((u - 0.5) * 1.5, v - 0.56);
    float a = atan(p.x, -p.y);
    float r = length(p);
    float reach = 0.34 + 0.07 * cos(a * 7.0) + 0.05 * sin(t * 0.8 + a * 3.0) * 0.3;
    float fan = (1.0 - smoothstep(reach, reach + 0.008, r)) * smoothstep(0.06, 0.07, r) * (1.0 - smoothstep(2.25, 2.4, abs(a)));
    float rays = psLine(a, 0.2618, 0.022);
    float tiers = psLine(r, 0.09, 0.004);
    float body = 1.0 - smoothstep(0.055, 0.062, length(vec2(p.x * 1.4, p.y + 0.02)));
    float head = 1.0 - smoothstep(0.03, 0.036, length(vec2(p.x, p.y + 0.11)));
    float fl = skFbm(vec2(u * 7.0, v * 3.0 - t * 0.6));
    float flame = smoothstep(0.62, 0.66, v + fl * 0.32 - 0.12 * sin(u * 18.0 + t)) * smoothstep(0.98, 0.9, v);
    float flameEdge = flame * (1.0 - smoothstep(0.62, 0.7, v + fl * 0.32 - 0.12 * sin(u * 18.0 + t) - 0.05));
    float border = (1.0 - smoothstep(0.026, 0.031, edge)) + psAt(edge, 0.045, 0.003) + psAt(edge, 0.038, 0.0018) * psLine(u + v, 0.02, 0.004);
    float g = clamp(fan * max(rays, tiers) + body + head + border + flameEdge, 0.0, 1.0);
    col = mix(col, mix(col, vec3(0.86, 0.32, 0.08), 0.55), flame * cloth);
    col = mix(col, gold * mix(0.85, 1.1, fl), g);
    emis += gold * (g * 0.35 + flameEdge * 0.4) * vec3(1.0, 0.75, 0.45);
    metal = mix(metal, 0.9, g);
    rough = mix(rough, 0.28, g);
    amt = max(amt, g);
  } else {
    // aether sails: veins of storm light run through indigo cloth, stars wink in it, the edges burn
    vec3 deep = mix(vec3(0.03, 0.025, 0.1), vec3(0.11, 0.05, 0.2), v);
    col = mix(col, deep, 0.9 * cloth + 0.45 * (1.0 - cloth));
    vec2 q = vec2(u * 2.2, v * 2.6 - t * 0.05);
    q += 0.35 * vec2(skFbm(q * 1.1 + vec2(0.0, t * 0.08)), skFbm(q * 1.1 + vec2(5.2, -t * 0.06)));
    float rid = 0.0;
    float amp = 0.62;
    vec2 qq = q * 1.4;
    for (int i = 0; i < 3; i++) {
      float r = 1.0 - abs(2.0 * skN(qq) - 1.0);
      rid += amp * r * r * r * r * r * r;
      qq = qq * 2.03 + vec2(1.7, -t * 0.16);
      amp *= 0.55;
    }
    float line = smoothstep(0.34, 0.62 + fwidth(rid) * 2.0, rid);
    vec3 cyan = vec3(0.16, 0.75, 1.5);
    vec3 violet = vec3(0.8, 0.25, 1.5);
    vec3 lc = mix(cyan, violet, smoothstep(0.35, 0.7, skN(q * 0.9 + 3.0)));
    float pulse = 0.7 + 0.3 * sin(t * 1.9 - v * 6.0 + u * 2.0);
    emis += lc * line * pulse * 1.3;
    col = mix(col, lc * 0.25, line * 0.6);
    vec2 cell = floor(uv * vec2(24.0, 28.0));
    float h = skH(cell);
    vec2 sp = fract(uv * vec2(24.0, 28.0)) - 0.5 - (skH2(cell) - 0.5) * 0.6;
    float star = step(0.9, h) * (1.0 - smoothstep(0.03, 0.1, length(sp)));
    float tw = sin(t * 2.6 + h * 60.0);
    emis += vec3(1.1, 1.15, 1.5) * star * (0.35 + 0.65 * tw * tw);
    float rim = 1.0 - smoothstep(0.0, 0.045, edge);
    emis += cyan * rim * rim * 1.2;
    col = mix(col, cyan * 0.25, rim);
    amt = max(amt, cloth * 0.5);
    metal = 0.0;
    rough = 0.85;
  }
}
`;
