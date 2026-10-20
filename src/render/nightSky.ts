import * as THREE from 'three';
import { mulberry32 } from '../core/noise';

// The night sky the captain sees from the deck: thousands of pin-sharp stars
// in every brightness and colour, twinkling hardest low down where they shine
// through the thickest air, the Milky Way's dusty river arching over, the odd
// shooting star, and a real moon in its phase, with seas, rayed craters and
// earthshine on its dark limb. The whole starry sphere wheels slowly about the
// pole as the night goes on (atmosphere.ts turns it with the sun).

/** The moon's angular radius (rad): a touch grander than life, so its seas and craters read. */
export const MOON_R = 0.045;

/**
 * The near side of the moon, painted once at startup: a 256² map in disc
 * coordinates (x right, y up, as seen from the deck). R albedo, G/B the slope
 * of its relief (so craters stand out along the terminator), A unused.
 * Seas and the great rayed craters sit about where they really are.
 */
export function createMoonTexture(size = 256): THREE.DataTexture {
  const rnd = mulberry32(1969);
  const N = size * size;
  const alb = new Float32Array(N);
  const hgt = new Float32Array(N);
  const P = new Float32Array(N * 3); // each texel's point on the sphere (0 off the disc)
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = ((i + 0.5) / size) * 2 - 1;
      const y = ((j + 0.5) / size) * 2 - 1;
      const r2 = x * x + y * y;
      const k = j * size + i;
      const z = Math.sqrt(Math.max(1 - Math.min(r2, 1), 0));
      const s = 1 / Math.sqrt(x * x + y * y + z * z);
      P[k * 3] = x * s;
      P[k * 3 + 1] = y * s;
      P[k * 3 + 2] = z * s;
    }
  }
  // a little value noise on the sphere, for the frayed shores of the seas and the highlands' mottling
  const lat = new Float32Array(32 * 32 * 32).map(() => rnd());
  const vn = (x: number, y: number, z: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const fx = x - xi, fy = y - yi, fz = z - zi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
    const x0 = (xi & 31) << 10, x1 = ((xi + 1) & 31) << 10;
    const y0 = (yi & 31) << 5, y1 = ((yi + 1) & 31) << 5;
    const z0 = zi & 31, z1 = (zi + 1) & 31;
    const a = lat[x0 + y0 + z0] + (lat[x1 + y0 + z0] - lat[x0 + y0 + z0]) * sx;
    const b = lat[x0 + y1 + z0] + (lat[x1 + y1 + z0] - lat[x0 + y1 + z0]) * sx;
    const c = lat[x0 + y0 + z1] + (lat[x1 + y0 + z1] - lat[x0 + y0 + z1]) * sx;
    const d = lat[x0 + y1 + z1] + (lat[x1 + y1 + z1] - lat[x0 + y1 + z1]) * sx;
    const e = a + (b - a) * sy;
    return e + (c + (d - c) * sy - e) * sz;
  };
  const fbm = (x: number, y: number, z: number, o: number) => {
    let f = 0, a = 0.5, s = 1;
    for (let n = 0; n < o; n++) {
      f += vn(x * s + 11.3, y * s + 7.1, z * s + 3.7) * a;
      s *= 2.03;
      a *= 0.5;
    }
    return f;
  };
  const toSphere = (x: number, y: number): [number, number, number] => {
    const z = Math.sqrt(Math.max(1 - x * x - y * y, 0));
    return [x, y, z];
  };

  // ---- highlands and seas
  // [x, y, rx, ry, depth]: the maria about where they sit on the real near side
  const MARIA: [number, number, number, number, number][] = [
    [-0.58, 0.12, 0.3, 0.46, 1], // Oceanus Procellarum
    [-0.3, 0.44, 0.27, 0.22, 1], // Imbrium
    [0.17, 0.44, 0.15, 0.15, 1], // Serenitatis
    [0.36, 0.16, 0.2, 0.17, 1], // Tranquillitatis
    [0.73, 0.32, 0.1, 0.12, 1.05], // Crisium
    [0.6, -0.12, 0.13, 0.17, 0.85], // Fecunditatis
    [0.4, -0.28, 0.09, 0.09, 0.85], // Nectaris
    [-0.2, -0.36, 0.17, 0.15, 0.8], // Nubium
    [-0.57, -0.38, 0.08, 0.08, 0.9], // Humorum
    [-0.05, 0.73, 0.38, 0.07, 0.75], // Frigoris
    [0.04, 0.22, 0.09, 0.08, 0.8], // Vaporum
    [-0.1, 0.0, 0.1, 0.09, 0.6], // Sinus Medii, Insularum
  ];
  for (let k = 0; k < N; k++) {
    const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2];
    const j = Math.floor(k / size);
    const xd = ((k - j * size + 0.5) / size) * 2 - 1;
    const yd = ((j + 0.5) / size) * 2 - 1;
    // (beyond the limb only the edge texels' filtering ever reads it)
    if (xd * xd + yd * yd > 1.08) {
      alb[k] = 0.6;
      continue;
    }
    const n = fbm(x * 5, y * 5, z * 5, 4);
    let sea = 0;
    for (const [mx, my, rx, ry, dp] of MARIA) {
      const ex = (x - mx) / rx, ey = (y - my) / ry;
      const d = Math.sqrt(ex * ex + ey * ey) + (n - 0.5) * 1.4;
      sea = Math.max(sea, smooth(1.0, 0.6, d) * dp);
    }
    sea = Math.min(sea, 1);
    const m = fbm(x * 12, y * 12, z * 12, 2) - 0.5;
    const hl = 0.8 + m * 0.25;
    // the seas are mottled, darkest in their hearts
    const ma = 0.42 + m * 0.22 + (n - 0.5) * 0.1 - sea * 0.06;
    alb[k] = hl + (ma - hl) * sea;
    // the seas are flat lava plains; the highlands roll
    hgt[k] = (n - 0.5 + m * 0.5) * 0.04 * (1 - sea * 0.8);
  }

  // ---- craters: bowls with raised rims, the young ones bright and rayed
  const stamp = (cx: number, cy: number, cr: number, depth: number, rim: number, bright: number, rays: number) => {
    const [ax, ay, az] = toSphere(cx, cy);
    const cosR = Math.cos(cr * (rays > 0 ? 9 : 1.6));
    const ray: [number, number, number][] = [];
    for (let i = 0; i < rays; i++) ray.push([rnd() * Math.PI * 2, 0.012 + rnd() * 0.02, 0.4 + rnd() * 0.6]);
    // tangent frame at the centre, for the rays' bearings
    const t1 = norm3(az, 0, -ax);
    const t2: [number, number, number] = [ay * t1[2] - az * t1[1], az * t1[0] - ax * t1[2], ax * t1[1] - ay * t1[0]];
    const reach = Math.sin(Math.min(cr * (rays > 0 ? 9 : 1.6), 1.5));
    const i0 = Math.max(0, Math.floor(((cx - reach) * 0.5 + 0.5) * size));
    const i1 = Math.min(size - 1, Math.ceil(((cx + reach) * 0.5 + 0.5) * size));
    const j0 = Math.max(0, Math.floor(((cy - reach) * 0.5 + 0.5) * size));
    const j1 = Math.min(size - 1, Math.ceil(((cy + reach) * 0.5 + 0.5) * size));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * size + i;
        const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2];
        const c = x * ax + y * ay + z * az;
        if (c < cosR) continue;
        const d = Math.acos(Math.min(c, 1)) / cr; // distance in crater radii
        if (d < 1.6) {
          const bowl = d < 1 ? -(1 - d * d) * depth : 0;
          const ridge = Math.exp(-((d - 1) * (d - 1)) / 0.045) * rim;
          hgt[k] += bowl + ridge;
          // bright fresh rims and ejecta, a darker floor
          alb[k] += (Math.exp(-((d - 1.05) * (d - 1.05)) / 0.08) * 0.12 + Math.exp(-d * d * 0.8) * 0.05) * bright - (d < 0.8 ? 0.03 : 0);
        }
        if (rays > 0 && d > 0.8) {
          // ray streaks splashed out across the face
          const px = x * t1[0] + y * t1[1] + z * t1[2];
          const py = x * t2[0] + y * t2[1] + z * t2[2];
          const ang = Math.atan2(py, px);
          let g = 0;
          for (const [ra, rw, rl] of ray) {
            let da = Math.abs(ang - ra);
            if (da > Math.PI) da = Math.PI * 2 - da;
            g = Math.max(g, Math.exp(-(da * da) / (rw * rw)) * Math.exp(-d / (9 * rl)));
          }
          alb[k] += g * 0.16 * bright * smooth(0.8, 1.6, d);
          alb[k] += Math.exp(-d / 2.2) * 0.07 * bright;
        }
      }
    }
  };
  // the field of everyday craters, many small and a few great walled plains
  for (let n = 0; n < 420; n++) {
    let x = 0, y = 0;
    do {
      x = rnd() * 2 - 1;
      y = rnd() * 2 - 1;
    } while (x * x + y * y > 0.96);
    const r = 0.006 + Math.pow(rnd(), 4.5) * 0.07;
    // fewer on the young seas
    const k = Math.min(size - 1, Math.floor((y * 0.5 + 0.5) * size)) * size + Math.min(size - 1, Math.floor((x * 0.5 + 0.5) * size));
    if (alb[k] < 0.5 && rnd() < 0.7) continue;
    stamp(x, y, r, 0.6 * r, 0.25 * r, 0.25 + rnd() * 0.6, 0);
  }
  // the famous ones: Tycho and Copernicus with their great rays, Kepler, bright Aristarchus, Plato's dark floor
  stamp(-0.14, -0.7, 0.03, 0.022, 0.009, 1.6, 26);
  stamp(-0.31, 0.17, 0.032, 0.022, 0.009, 1.2, 18);
  stamp(-0.6, 0.12, 0.015, 0.01, 0.004, 1.1, 12);
  stamp(-0.71, 0.39, 0.011, 0.008, 0.003, 2.2, 6);
  stamp(-0.1, 0.8, 0.03, 0.006, 0.008, -0.8, 0);
  stamp(0.08, -0.52, 0.045, 0.02, 0.01, 0.4, 0); // the highland walled plains
  stamp(0.62, -0.5, 0.04, 0.018, 0.009, 0.4, 0);

  const data = new Uint8Array(N * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const k = j * size + i;
      const hx = hgt[j * size + Math.min(i + 1, size - 1)] - hgt[j * size + Math.max(i - 1, 0)];
      const hy = hgt[Math.min(j + 1, size - 1) * size + i] - hgt[Math.max(j - 1, 0) * size + i];
      // slopes per texel, scaled to roughly unit range for the steepest crater walls
      const g = size * 0.06;
      data[k * 4] = Math.round(Math.min(1, Math.max(0, alb[k])) * 255);
      data[k * 4 + 1] = Math.round(Math.min(1, Math.max(0, 0.5 + hx * g)) * 255);
      data[k * 4 + 2] = Math.round(Math.min(1, Math.max(0, 0.5 + hy * g)) * 255);
      data[k * 4 + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function smooth(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function norm3(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

/**
 * The moon's phase on a given date, 0 new .. 0.5 full .. 1 new again, from
 * the mean synodic month and a known new moon (6 Jan 2000, 18:14 UT). The
 * game starts each voyage under tonight's real moon.
 */
export function realMoonPhase(ms = Date.now()) {
  const days = (ms - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;
  return (((days / 29.530588853) % 1) + 1) % 1;
}

/**
 * GLSL for the dome only (sky.ts): the full night sky. Needs GLSL_ATMOS
 * (uTime, uNight, uNoiseTex, uStarRot, aqHash33) before it.
 */
export const GLSL_NIGHT_SKY = /* glsl */ `
uniform vec4 uMoon;       // xyz where the moon stands, w how much of it shows (0 by day)
uniform vec4 uMoonLight;  // xyz toward the sun as the moon sees it, w how much of the disc is lit
uniform sampler2D uMoonTex;
const float AQ_MOON_R = ${MOON_R.toFixed(4)};

// The colour of a star from a 0..1 roll: mostly white and blue-white, some
// yellow like the sun, a few orange giants and the odd red one.
vec3 starTint(float t) {
  vec3 c = mix(vec3(0.66, 0.78, 1.0), vec3(1.0, 0.98, 0.96), smoothstep(0.0, 0.35, t));
  c = mix(c, vec3(1.0, 0.9, 0.7), smoothstep(0.55, 0.78, t));
  c = mix(c, vec3(1.0, 0.68, 0.45), smoothstep(0.86, 0.97, t));
  return c;
}

// One layer of stars over the celestial sphere: a 3D grid of cells, at most one
// star per cell, drawn as a point a pixel or so across (pix = one pixel, in
// radians), however near or far the camera zooms. A cell only owns a star whose
// own direction falls well inside it, so none is ever clipped at a cell wall.
// dens: the share of cells holding a star; pw: how rare the bright ones are.
vec3 starLayer(vec3 ds, float scale, float dens, float pw, float gain, float pix, float twk, float seed) {
  vec3 q = ds * scale;
  vec3 c = floor(q);
  vec3 h = aqHash33(c + seed);
  if (h.x > dens) return vec3(0.0);
  vec3 h2 = aqHash33(c * 1.71 + seed + 41.7);
  vec3 sd = normalize(c + 0.2 + 0.6 * h2);
  vec3 f = sd * scale - c;
  if (min(min(f.x, f.y), f.z) < 0.18 || max(max(f.x, f.y), f.z) > 0.82) return vec3(0.0);
  float a = length(ds - sd) / pix;
  float b = pow(h.y, pw) * gain;
  // stars wink and shimmer: two beating flickers, each star at its own pace
  float w = sin(uTime * (2.3 + h2.x * 5.0) + h2.y * 40.0) * sin(uTime * (1.1 + h2.z * 3.3) + h.z * 30.0);
  b *= 1.0 + twk * w;
  // a pixel-wide point, and a soft glow round the bright ones for the bloom to catch
  float core = exp(-a * a * 0.9);
  float glow = pow(max(1.0 - a * 0.4, 0.0), 3.0) * 0.12 * smoothstep(0.4, 1.4, b);
  return starTint(h.z) * b * (core + glow);
}

// The Milky Way: a broad, uneven river of faint light with the dark dust
// lanes splitting its heart, brightest toward the galaxy's core. Sampled
// triplanar off the noise texture on the star sphere, so it has no seams.
float aqTri(vec3 p, float s, vec3 w) {
  return texture(uNoiseTex, p.yz * s).g * w.x + texture(uNoiseTex, p.zx * s + 0.37).g * w.y + texture(uNoiseTex, p.xy * s + 0.71).g * w.z;
}
const vec3 AQ_GAL_N = vec3(0.42, 0.55, -0.72);  // the galactic pole, on the star sphere
const vec3 AQ_GAL_C = vec3(0.86, -0.08, 0.44);  // toward its core (in the plane)
// x glow, y how much it crowds the faint stars in
vec2 milkyWay(vec3 ds) {
  vec3 gn = normalize(AQ_GAL_N);
  float lat = dot(ds, gn);
  float core = pow(max(dot(ds, normalize(AQ_GAL_C - gn * dot(AQ_GAL_C, gn))), 0.0), 3.0);
  float wide = 0.17 + core * 0.12;
  float band = exp(-lat * lat / (wide * wide));
  if (band < 0.01) return vec2(0.0);
  vec3 w = pow(abs(ds), vec3(4.0));
  w /= w.x + w.y + w.z;
  float clouds = aqTri(ds, 0.55, w) * 0.6 + aqTri(ds, 1.5, w) * 0.4;
  float dust = aqTri(ds, 1.7, w);
  // the Great Rift: dark lanes along the middle, heaviest toward the core
  float rift = exp(-pow((lat + 0.025) / (wide * 0.32), 2.0)) * smoothstep(0.42, 0.68, dust) * (0.45 + core * 0.5);
  float glow = band * smoothstep(0.15, 0.9, clouds) * (0.45 + core * 1.4) * (1.0 - rift * 0.85);
  return vec2(glow, band * smoothstep(0.3, 0.75, clouds));
}

// Now and then a shooting star scratches across the sky: a white-green head
// with a warm fading train. Two independent streams, a few a minute in all.
vec3 shootingStar(vec3 d, float pix, float period, float seed) {
  float slot = floor(uTime / period);
  vec3 h = aqHash33(vec3(slot, seed, 3.7));
  if (h.x > 0.5) return vec3(0.0);
  float dur = 0.45 + h.z * 0.75;
  float t = uTime - slot * period - h.y * (period - dur);
  if (t < 0.0 || t > dur) return vec3(0.0);
  vec3 h2 = aqHash33(vec3(slot, seed + 7.1, 11.9));
  float az = h2.x * 6.2832;
  float el = 0.2 + h2.y * 0.6;
  vec3 s = vec3(cos(el) * cos(az), sin(el), cos(el) * sin(az));
  if (dot(d, s) < 0.85) return vec3(0.0);
  vec3 e1 = normalize(cross(vec3(0.0, 1.0, 0.0), s));
  vec3 e2 = cross(s, e1);
  float beta = -0.35 - h2.z * 2.4; // always falling, at any slant
  vec3 v = e1 * cos(beta) + e2 * sin(beta);
  vec3 n = cross(s, v);
  float L = 0.14 + h.y * 0.22;
  float p = t / dur;
  float head = L * p;
  float along = atan(dot(d, v), dot(d, s));
  float across = dot(d, n) / pix;
  float tail = min(head, 0.05 + L * 0.35);
  float k = (along - (head - tail)) / max(tail, 1e-4);
  if (k < 0.0 || k > 1.0 + 3.0 * pix / max(tail, 1e-4)) return vec3(0.0);
  float life = sin(3.1416 * p);
  float trail = exp(-across * across * (1.6 - k * 0.8)) * k * k * step(k, 1.0);
  float hd = (along - head) / pix;
  float spark = exp(-(hd * hd + across * across) * 0.5);
  vec3 col = mix(vec3(1.0, 0.62, 0.38), vec3(0.8, 1.0, 0.9), k);
  return col * (trail * 1.6 + spark * 3.5) * life;
}

// The moon: its seas and craters, its phase, the terminator rough with
// crater shadows, earthshine faintly lighting the dark side. Lommel-Seeliger
// light, as dusty regolith really does: a full moon is flat and bright right
// out to its limb. rgb, a its coverage of the sky behind.
vec4 moonDisc(vec3 d, float pix) {
  vec3 f = uMoon.xyz;
  if (uMoon.w <= 0.0 || dot(d, f) < 0.995) return vec4(0.0);
  vec3 r = normalize(cross(f, vec3(0.0, 1.0, 0.0)));
  vec3 u = cross(r, f);
  vec2 p = vec2(dot(d, r), dot(d, u)) / AQ_MOON_R;
  float rl = length(p);
  float aa = pix / AQ_MOON_R;
  float cov = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, rl);
  if (cov <= 0.0) return vec4(0.0);
  vec2 pc = p / max(rl, 1.0);
  float z = sqrt(max(1.0 - dot(pc, pc), 0.0));
  vec4 t = texture(uMoonTex, pc * 0.5 + 0.5);
  vec3 nrm = r * pc.x + u * pc.y - f * z;
  vec3 nb = normalize(nrm - (r * (t.g * 2.0 - 1.0) + u * (t.b * 2.0 - 1.0)) * 0.6);
  vec3 L = uMoonLight.xyz;
  float mu0 = max(dot(nb, L), 0.0);
  float lit = mu0 / (mu0 + max(dot(nb, -f), 0.05)) * 2.0;
  // the terminator is not a hard line: low sun across the rough ground
  lit *= smoothstep(-0.02, 0.1, dot(nrm, L) + (t.r - 0.55) * 0.1);
  float albedo = t.r;
  vec3 col = vec3(1.0, 0.96, 0.9) * albedo * albedo * lit * 0.95;
  // earthshine: the sunlit earth faintly lights the moon's night side (strongest under a thin crescent)
  col += vec3(0.55, 0.65, 0.85) * albedo * 0.025 * (1.0 - uMoonLight.w) * (1.0 - uMoonLight.w) * (1.0 - smoothstep(-0.05, 0.05, dot(nrm, L)));
  // low over the sea it shines dimmer and warmer, through the thick air
  col *= mix(vec3(1.0, 0.72, 0.45), vec3(1.0), smoothstep(0.02, 0.3, f.y));
  return vec4(col * uMoon.w, cov * uMoon.w);
}

// Everything above the clouds: stars, galaxy and meteors (bg: the sky behind,
// whose glow drowns the faint stars near the moon and in the twilight).
vec3 nightSky(vec3 d, float pix, vec3 bg) {
  if (uNight < 0.01 || d.y <= 0.0) return vec3(0.0);
  vec3 ds = uStarRot * d;
  float alt = d.y;
  // they show against a dark sky, and drown in moonlit or twilit air
  float lum = dot(bg, vec3(0.2126, 0.7152, 0.0722));
  float dark = 0.022 / (0.022 + max(lum - 0.012, 0.0) * 2.2);
  // and fade into the thick air along the horizon
  float air = smoothstep(0.0, 0.2, alt) * (0.55 + 0.45 * smoothstep(0.1, 0.5, alt));
  float k = uNight * uNight * dark * air * (1.0 - uCloudCover * 0.6) * (1.0 - uMist * 0.85);
  if (k < 0.002) return vec3(0.0);
  // low stars scintillate hard through the thick air; high ones barely
  float twk = 0.18 + 0.6 * (1.0 - smoothstep(0.05, 0.6, alt));
  vec2 mw = milkyWay(ds);
  vec3 col = vec3(0.0);
  // the bright stars of the constellations, then the dust of faint ones, crowding into the Milky Way
  col += starLayer(ds, 70.0, 0.26, 14.0, 3.2, pix, twk, 0.0);
  col += starLayer(ds, 150.0, 0.16 + mw.y * 0.4, 5.0, 0.13, pix, twk * 0.6, 17.0);
  col += starLayer(ds, 260.0, mw.y * 0.6, 2.0, 0.045, pix, 0.0, 53.0);
  col += mix(vec3(0.55, 0.62, 0.9), vec3(0.92, 0.86, 0.78), smoothstep(0.3, 1.2, mw.x)) * mw.x * 0.05;
  col *= k;
  col += (shootingStar(d, pix, 9.0, 1.0) + shootingStar(d, pix, 13.0, 5.0)) * k * (0.5 + 0.5 * dark);
  return col;
}
`;
