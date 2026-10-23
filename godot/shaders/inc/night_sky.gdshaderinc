// The night sky the captain sees from the deck (the web game's
// render/nightSky.ts): thousands of pin-sharp stars in every brightness and
// colour, twinkling hardest low down where they shine through the thickest
// air, the Milky Way's dusty river arching over, the odd shooting star, and a
// real moon in its phase, with seas, rayed craters and earthshine on its dark
// limb. The whole starry sphere wheels slowly about the pole as the night
// goes on (star_rot, turned with the sun by src/world/atmosphere.gd). Only
// the sky dome draws this; the sea mirrors the bright stars alone
// (star_field, atmos.gdshaderinc).
#ifndef NIGHT_SKY_INC
#define NIGHT_SKY_INC

#include "res://shaders/inc/atmos.gdshaderinc"

/// xyz where the moon stands, w how much of it shows (0 by day)
global uniform vec4 moon;
/// xyz toward the sun as the moon sees it, w how much of the disc is lit
global uniform vec4 moon_light;
/// The near side of the moon (art/moon.png, the web game's own): R albedo,
/// G and B the slopes of its relief, in disc coordinates (x right, y up).
uniform sampler2D moon_tex : filter_linear_mipmap, repeat_disable;

/// The moon's angular radius (rad): a touch grander than life, so its seas and craters read.
const float MOON_R = 0.045;
/// The galactic pole on the star sphere, and toward the galaxy's core (in its plane).
const vec3 GAL_N = vec3(0.42, 0.55, -0.72);
const vec3 GAL_C = vec3(0.86, -0.08, 0.44);

// The colour of a star from a 0..1 roll: mostly white and blue-white, some
// yellow like the sun, a few orange giants and the odd red one.
vec3 star_tint(float t) {
	vec3 c = mix(vec3(0.66, 0.78, 1.0), vec3(1.0, 0.98, 0.96), smoothstep(0.0, 0.35, t));
	c = mix(c, vec3(1.0, 0.9, 0.7), smoothstep(0.55, 0.78, t));
	return mix(c, vec3(1.0, 0.68, 0.45), smoothstep(0.86, 0.97, t));
}

// One layer of stars over the celestial sphere: a 3D grid of cells, at most
// one star per cell, drawn as a point a pixel or so across (pix: one pixel, in
// radians) however near or far the lens zooms. A cell only owns a star whose
// own direction falls well inside it, so none is ever clipped at a cell wall.
// dens: the share of cells holding a star; pw: how rare the bright ones are.
vec3 star_layer(vec3 ds, float scale, float dens, float pw, float gain, float pix, float twk, float seed) {
	vec3 c = floor(ds * scale);
	vec3 h = hash33(c + seed);
	if (h.x > dens) {
		return vec3(0.0);
	}
	vec3 h2 = hash33(c * 1.71 + seed + 41.7);
	vec3 sd = normalize(c + 0.2 + 0.6 * h2);
	vec3 f = sd * scale - c;
	if (min(min(f.x, f.y), f.z) < 0.18 || max(max(f.x, f.y), f.z) > 0.82) {
		return vec3(0.0);
	}
	float a = length(ds - sd) / pix;
	float b = pow(h.y, pw) * gain;
	// stars wink and shimmer: two beating flickers, each star at its own pace
	b *= 1.0 + twk * sin(TIME * (2.3 + h2.x * 5.0) + h2.y * 40.0) * sin(TIME * (1.1 + h2.z * 3.3) + h.z * 30.0);
	// a pixel-wide point, and a soft glow round the bright ones
	float core = exp(-a * a * 0.9);
	float g = max(1.0 - a * 0.4, 0.0);
	float glow = g * g * g * 0.12 * smoothstep(0.4, 1.4, b);
	return star_tint(h.z) * b * (core + glow);
}

// The noise texture laid over the star sphere from three sides, so it has no seams.
float tri_noise(vec3 p, float s, vec3 w) {
	return texture(cloud_noise, p.yz * s).g * w.x + texture(cloud_noise, p.zx * s + 0.37).g * w.y + texture(cloud_noise, p.xy * s + 0.71).g * w.z;
}

// The Milky Way: a broad, uneven river of faint light with the dark dust
// lanes splitting its heart, brightest toward the galaxy's core. x its glow,
// y how much it crowds the faint stars in.
vec2 milky_way(vec3 ds) {
	vec3 gn = normalize(GAL_N);
	float lat = dot(ds, gn);
	float core = pow(max(dot(ds, normalize(GAL_C - gn * dot(GAL_C, gn))), 0.0), 3.0);
	float wide = 0.17 + core * 0.12;
	float band = exp(-lat * lat / (wide * wide));
	if (band < 0.01) {
		return vec2(0.0);
	}
	vec3 w = ds * ds;
	w *= w;
	w /= w.x + w.y + w.z;
	float clouds_n = tri_noise(ds, 0.55, w) * 0.6 + tri_noise(ds, 1.5, w) * 0.4;
	float dust = tri_noise(ds, 1.7, w);
	// the Great Rift: dark lanes along the middle, heaviest toward the core
	float rq = (lat + 0.025) / (wide * 0.32);
	float rift = exp(-rq * rq) * smoothstep(0.42, 0.68, dust) * (0.45 + core * 0.5);
	float glow = band * smoothstep(0.15, 0.9, clouds_n) * (0.45 + core * 1.4) * (1.0 - rift * 0.85);
	return vec2(glow, band * smoothstep(0.3, 0.75, clouds_n));
}

// Now and then a shooting star scratches across the sky: a white-green head
// with a warm fading train. Two independent streams, a few a minute in all.
vec3 shooting_star(vec3 d, float pix, float period, float seed) {
	float slot = floor(TIME / period);
	vec3 h = hash33(vec3(slot, seed, 3.7));
	if (h.x > 0.5) {
		return vec3(0.0);
	}
	float dur = 0.45 + h.z * 0.75;
	float t = TIME - slot * period - h.y * (period - dur);
	if (t < 0.0 || t > dur) {
		return vec3(0.0);
	}
	vec3 h2 = hash33(vec3(slot, seed + 7.1, 11.9));
	float az = h2.x * 6.2832;
	float el = 0.2 + h2.y * 0.6;
	vec3 s = vec3(cos(el) * cos(az), sin(el), cos(el) * sin(az));
	if (dot(d, s) < 0.85) {
		return vec3(0.0);
	}
	vec3 e1 = normalize(cross(vec3(0.0, 1.0, 0.0), s));
	vec3 e2 = cross(s, e1);
	// always falling, at any slant
	float beta = -0.35 - h2.z * 2.4;
	vec3 v = e1 * cos(beta) + e2 * sin(beta);
	vec3 n = cross(s, v);
	float L = 0.14 + h.y * 0.22;
	float p = t / dur;
	float head = L * p;
	float along = atan(dot(d, v), dot(d, s));
	float across = dot(d, n) / pix;
	float tail = min(head, 0.05 + L * 0.35);
	float k = (along - (head - tail)) / max(tail, 1e-4);
	if (k < 0.0 || k > 1.0 + 3.0 * pix / max(tail, 1e-4)) {
		return vec3(0.0);
	}
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
vec4 moon_disc(vec3 d, float pix) {
	vec3 f = moon.xyz;
	if (moon.w <= 0.0 || dot(d, f) < 0.995) {
		return vec4(0.0);
	}
	vec3 r = normalize(cross(f, vec3(0.0, 1.0, 0.0)));
	vec3 u = cross(r, f);
	vec2 p = vec2(dot(d, r), dot(d, u)) / MOON_R;
	float rl = length(p);
	float aa = pix / MOON_R;
	float cov = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, rl);
	if (cov <= 0.0) {
		return vec4(0.0);
	}
	vec2 pc = p / max(rl, 1.0);
	float z = sqrt(max(1.0 - dot(pc, pc), 0.0));
	vec4 t = texture(moon_tex, pc * 0.5 + 0.5);
	vec3 nrm = r * pc.x + u * pc.y - f * z;
	vec3 nb = normalize(nrm - (r * (t.g * 2.0 - 1.0) + u * (t.b * 2.0 - 1.0)) * 0.6);
	vec3 L = moon_light.xyz;
	float mu0 = max(dot(nb, L), 0.0);
	float lit = mu0 / (mu0 + max(dot(nb, -f), 0.05)) * 2.0;
	// the terminator is not a hard line: low sun across the rough ground
	lit *= smoothstep(-0.02, 0.1, dot(nrm, L) + (t.r - 0.55) * 0.1);
	float albedo = t.r;
	vec3 col = vec3(1.0, 0.96, 0.9) * albedo * albedo * lit * 0.95;
	// earthshine: the sunlit earth faintly lights the moon's night side (strongest under a thin crescent)
	float dark_side = 1.0 - moon_light.w;
	col += vec3(0.55, 0.65, 0.85) * albedo * 0.025 * dark_side * dark_side * (1.0 - smoothstep(-0.05, 0.05, dot(nrm, L)));
	// low over the sea it shines dimmer and warmer, through the thick air
	col *= mix(vec3(1.0, 0.72, 0.45), vec3(1.0), smoothstep(0.02, 0.3, f.y));
	return vec4(col * moon.w, cov * moon.w);
}

// Everything above the clouds: stars, galaxy and meteors (bg: the sky behind,
// whose glow drowns the faint stars near the moon and in the twilight).
vec3 night_sky(vec3 d, float pix, vec3 bg) {
	if (night < 0.01 || d.y <= 0.0) {
		return vec3(0.0);
	}
	vec3 ds = star_rot * d;
	float alt = d.y;
	// they show against a dark sky, and drown in moonlit or twilit air
	float lum = dot(bg, vec3(0.2126, 0.7152, 0.0722));
	float dark = 0.022 / (0.022 + max(lum - 0.012, 0.0) * 2.2);
	// and fade into the thick air along the horizon
	float air = smoothstep(0.0, 0.2, alt) * (0.55 + 0.45 * smoothstep(0.1, 0.5, alt));
	float k = night * night * dark * air * (1.0 - weather.x * 0.6) * (1.0 - weather.w * 0.85);
	if (k < 0.002) {
		return vec3(0.0);
	}
	// low stars scintillate hard through the thick air; high ones barely
	float twk = 0.18 + 0.6 * (1.0 - smoothstep(0.05, 0.6, alt));
	vec2 mw = milky_way(ds);
	// the bright stars of the constellations, then the dust of faint ones, crowding into the Milky Way
	vec3 col = star_layer(ds, 70.0, 0.26, 14.0, 3.2, pix, twk, 0.0);
	col += star_layer(ds, 150.0, 0.16 + mw.y * 0.4, 5.0, 0.13, pix, twk * 0.6, 17.0);
	col += star_layer(ds, 260.0, mw.y * 0.6, 2.0, 0.045, pix, 0.0, 53.0);
	col += mix(vec3(0.55, 0.62, 0.9), vec3(0.92, 0.86, 0.78), smoothstep(0.3, 1.2, mw.x)) * mw.x * 0.05;
	col *= k;
	col += (shooting_star(d, pix, 9.0, 1.0) + shooting_star(d, pix, 13.0, 5.0)) * k * (0.5 + 0.5 * dark);
	return col;
}

#endif
