// The Treasure Vault's hull skins (the web game's src/ships/skinGlsl.ts):
// procedural paint jobs, pure maths and no textures, worn by her hull, her
// painted woodwork and her canvas (the SKIN variants of the ship shaders)
// and drawn on the Shipwright's cards (skin_card.gdshader), so a card always
// shows what she'll wear. Every skin is one branch of aq_skin() picked by
// skin_id, all in the one compiled shader: putting one on is a change of
// uniforms and never compiles anything mid-voyage.
//
// p is in metres on the hull (along her, up from the waterline) and a
// stretched sail-space on canvas.

/// Which skin (Cosmetics' pattern; 0 her own paintwork), its three colours,
/// and x its glow, y how much of the bare canvas takes it, w a seed.
uniform int skin_id = 0;
uniform vec3 skin_a : source_color = vec3(0.12, 0.54, 0.54);
uniform vec3 skin_b : source_color = vec3(0.96, 0.92, 0.83);
uniform vec3 skin_c : source_color = vec3(0.89, 0.71, 0.32);
uniform vec4 skin_p = vec4(0.0, 1.0, 0.0, 0.0);

#include "res://shaders/inc/skin_noise.gdshaderinc"

// x: distance to the nearest point, y: the gap to the second (0 on a cell's edge), z: the cell's id
vec3 sk_vor(vec2 p, float t) {
	vec2 n = floor(p);
	vec2 f = fract(p);
	float d1 = 8.0;
	float d2 = 8.0;
	float id = 0.0;
	for (int j = -1; j <= 1; j++) {
		for (int i = -1; i <= 1; i++) {
			vec2 g = vec2(float(i), float(j));
			vec2 o = sk_h2(n + g);
			o = 0.5 + 0.45 * sin(t + 6.2831 * o);
			vec2 r = g + o - f;
			float d = dot(r, r);
			if (d < d1) {
				d2 = d1;
				d1 = d;
				id = sk_h(n + g);
			} else if (d < d2) {
				d2 = d;
			}
		}
	}
	d1 = sqrt(d1);
	return vec3(d1, sqrt(d2) - d1, id);
}

vec3 sk_hue(float h) {
	return clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
}

// overlapping fish scales: x radial 0..1 within the scale, y the scale's id
vec2 sk_scales(vec2 s) {
	float row = floor(s.y);
	for (int k = 1; k >= 0; k--) {
		float r = row + float(k);
		float x = s.x + 0.5 * mod(r, 2.0);
		vec2 c = vec2(floor(x) + 0.5, r);
		float d = length(vec2(x - c.x, (s.y - c.y) * 1.08)) / 0.74;
		if (d < 1.0) {
			return vec2(d, sk_h(c + r * 7.0));
		}
	}
	return vec2(1.0, 0.0);
}

// tiny twinkling stars on a grid of cells
float sk_stars(vec2 p, float density, float t) {
	vec2 c = floor(p);
	vec2 h = sk_h2(c);
	vec2 pos = 0.2 + 0.6 * h;
	float d = length(fract(p) - pos);
	float on = step(1.0 - density, sk_h(c + 3.1));
	float tw = 0.55 + 0.45 * sin(t * (1.5 + h.y * 3.5) + h.x * 40.0);
	float core = max(0.0, 1.0 - d * 9.0);
	return on * core * core * tw;
}

// The albedo of skin skin_id at p. ndv: how square on it's seen (1 head on);
// t: time; sail: 1 on canvas. Adds its glow to emis and sets metal and rough.
vec3 aq_skin(vec2 p, float ndv, float t, float sail, inout vec3 emis, inout float metal, inout float rough) {
	int id = skin_id;
	vec3 A = skin_a;
	vec3 B = skin_b;
	vec3 C = skin_c;
#ifdef SKIN_CARD
	// a 2D canvas takes its colours as written: the card works in linear
	A = pow(A, vec3(2.2));
	B = pow(B, vec3(2.2));
	C = pow(C, vec3(2.2));
#endif
	vec2 fw = fwidth(p);
	float aa = max(max(fw.x, fw.y), 1e-4);
	float glow = skin_p.x;
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
		vec2 q = mat2(vec2(0.7071, 0.7071), vec2(-0.7071, 0.7071)) * p * 1.15;
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
		// fish and mermaid scales
		vec2 sc = sk_scales(p * vec2(2.0, 2.3));
		float g = sc.x;
		float rim = smoothstep(0.82, 0.94, g);
		if (id == 3) {
			col = mix(B, A, g * g);
			col = mix(col, C, rim * 0.85);
			rough = 0.4;
		} else {
			float hue = 0.46 + (sc.y - 0.5) * 0.08 + fres * 0.32 + sin(p.x * 0.4 + p.y * 0.7) * 0.04;
			vec3 iri = sk_hue(hue) * 0.75 + 0.15;
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
		float warp = sk_fbm(p * vec2(0.3, 0.7)) * 3.0;
		float s = sin(p.x * 2.3 + warp * 2.2 + p.y * 0.6);
		float taper = 0.55 + 0.45 * sk_n(p * vec2(0.9, 0.5) + 3.0);
		float stripe = smoothstep(0.5, 0.5 + aa * 6.0 + 0.04, s * taper);
		col = mix(base, B, stripe);
		rough = 0.48;
	} else if (id == 6) {
		// reef camo
		float n1 = sk_fbm(p * 0.42 + skin_p.w);
		float n2 = sk_fbm(p * 0.8 + 7.3);
		float n3 = sk_fbm(p * 1.3 - 3.1);
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
		float w = sk_fbm(p * 0.55 + skin_p.w) * 6.0;
		float v = abs(sin(p.x * 0.7 + p.y * 0.45 + w));
		float vein = 1.0 - smoothstep(0.0, 0.14 + aa * 4.0, v);
		float v2 = abs(sin(p.x * 1.3 - p.y * 0.8 + w * 1.4 + 1.3));
		float goldv = 1.0 - smoothstep(0.0, 0.035 + aa * 3.0, v2);
		col = A * (0.94 + 0.06 * sk_n(p * 3.0));
		col = mix(col, B, vein * 0.75);
		col = mix(col, C, goldv * 0.9);
		metal = goldv * 0.85;
		rough = mix(0.16, 0.3, goldv);
	} else if (id == 10) {
		// kintsugi: black lacquer, its cracks mended in gold
		vec2 q = p * 0.75 + vec2(sk_fbm(p * 0.8), sk_fbm(p * 0.8 + 5.0)) * 0.6;
		vec3 v = sk_vor(q, 0.0);
		float gold = 1.0 - smoothstep(0.03, 0.06 + aa * 3.0, v.y);
		col = mix(A, B, v.z * 0.35 + sk_n(p * 1.7) * 0.15);
		col = mix(col, C, gold);
		metal = gold;
		rough = mix(0.1, 0.24, gold);
		emis += C * gold * 0.05;
	} else if (id == 11) {
		// kraken ink: slowly churning warped swirls
		vec2 q = p * 0.33;
		float s = t * 0.035;
		vec2 w = vec2(sk_fbm(q + vec2(s, 0.0)), sk_fbm(q + vec2(5.2, 1.3) - s));
		float f = sk_fbm(q + w * 2.4);
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
		vec3 v = sk_vor(q, t * 0.55);
		float crack = 1.0 - smoothstep(0.0, 0.11, v.y);
		float flow = 0.5 + 0.5 * sin(t * 2.1 - p.x * 0.8 + v.z * 6.28);
		float heat = crack * (0.5 + 0.5 * flow);
		col = A * (0.8 + 0.5 * sk_n(p * 2.6)) * (1.0 - crack * 0.6);
		col = mix(col, B * 0.4, crack * 0.6);
		emis += (mix(B, C, heat * heat) * heat * 2.6 + B * (1.0 - v.x) * 0.1 * flow) * glow;
		rough = 0.85;
	} else if (id == 15) {
		// aurora: rippling curtains over a starry midnight
		float x = p.x * 0.32 + t * 0.05;
		float cur = sk_fbm(vec2(x * 2.0, t * 0.12));
		float h = p.y * 0.42 - (0.25 + 0.3 * sin(x * 3.1 + t * 0.35) + 0.45 * cur) - sail * 0.8;
		float band = exp(-h * h * 9.0) + 0.45 * exp(-(h + 0.45) * (h + 0.45) * 22.0);
		float rays = 0.55 + 0.45 * sin(p.x * 8.0 + sk_n(vec2(p.x * 2.5, t * 0.6)) * 5.0);
		vec3 ac = mix(B, C, smoothstep(-0.25, 0.55, h + 0.15 * sin(t * 0.25 + p.x * 0.5)));
		col = mix(A, ac * 0.35, band * 0.6);
		emis += ac * band * rays * 1.6 * glow;
		emis += vec3(0.85, 0.9, 1.0) * sk_stars(p * 5.0, 0.12, t) * 1.6 * glow;
		rough = 0.55;
	} else if (id == 16) {
		// starlit voyage: a drifting nebula and twinkling stars
		vec2 q = p * 0.45 + vec2(t * 0.025, t * 0.006);
		float n = sk_fbm(q * 1.3);
		float n2 = sk_fbm(q * 2.6 + 4.0);
		vec3 neb = mix(A, B, smoothstep(0.3, 0.78, n));
		neb = mix(neb, C, smoothstep(0.55, 0.88, n2) * 0.7);
		col = neb * 0.7;
		emis += neb * n * n * n * 0.9 * glow;
		float st = sk_stars(p * 6.0 + vec2(t * 0.15, 0.0), 0.16, t) + sk_stars(p * 2.2 + 11.0, 0.08, t * 0.7) * 1.6;
		emis += vec3(1.0, 0.95, 0.88) * st * 2.4 * glow;
		rough = 0.45;
	} else if (id == 17) {
		// ghostfire: spectral flames rising from the waterline
		vec2 q = vec2(p.x * 1.1, p.y * 0.95 - t * 1.5);
		float n = sk_fbm(q * 1.3);
		float n2 = sk_n(q * 3.2 + 2.0);
		float hgt = clamp(p.y * (sail > 0.5 ? 0.14 : 0.33) + 0.3, 0.0, 1.0);
		float fl = smoothstep(0.38, 0.86, n * 1.15 + n2 * 0.25 - hgt * 0.55 + 0.12);
		float flicker = 0.85 + 0.15 * sin(t * 13.0 + p.x * 2.0);
		col = mix(A, B * 0.3, fl);
		emis += mix(B, C, fl * fl) * fl * 2.2 * flicker * glow;
		emis += B * 0.05 * glow;
		rough = 0.5;
	} else if (id == 18) {
		// living tide: caustic light and a glowing swell from bow to stern
		vec3 v1 = sk_vor(p * 0.85 + vec2(t * 0.14, t * 0.05), t * 0.8);
		vec3 v2 = sk_vor(p * 1.25 - vec2(t * 0.09, -t * 0.07) + 3.0, t * 0.6);
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

// No bloom on a phone: a glow past the grade's shoulder burns white, so a
// skin's light is kept below it with its hue whole (PartModels.GLOW_PEAK).
vec3 skin_light(vec3 e, float peak) {
	float m = max(e.r, max(e.g, e.b));
	return m > peak ? e * (peak / m) : e;
}
