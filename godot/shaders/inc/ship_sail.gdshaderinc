// The body of ship_sail.gdshader and ship_sail_dmg.gdshader (with DAMAGE
// defined: canvas torn and burnt, see ship_damage.gdshaderinc), and of their
// SKIN variants (your own ship's: her bare canvas wears her vault skin).

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/ship_common.gdshaderinc"
#define LIT_SPECULAR 0.35
#define LIT_BACKLIGHT
#include "res://shaders/inc/lit.gdshaderinc"
#ifdef PHANTOM
#include "res://shaders/inc/ship_phantom.gdshaderinc"
#endif

uniform vec3 c_sail : source_color = vec3(0.957, 0.918, 0.831);
uniform vec3 c_seam : source_color = vec3(0.851, 0.788, 0.659);
uniform vec3 c_emblem : source_color = vec3(0.843, 0.608, 0.18);
/// the accent the canvas is patterned in, and the pattern: 0 plain, 1 stripes,
/// 2 band, 3 border, 4 cross, 5 diagonal (ShipLook.SAIL_PATTERNS)
uniform vec3 c_accent : source_color = vec3(0.851, 0.788, 0.659);
uniform int sail_pattern = 0;
/// the mark the mainsails carry (white where it inks), as Heraldry draws it:
/// an emblem 0.56 of the sail across, the texture spanning 1.1 of its
/// half-width either side of its middle
uniform bool mark_on = false;
uniform sampler2D mark_tex : filter_linear_mipmap, repeat_disable, hint_default_black;

/// how full the canvas draws (wind on the sail x how much is set)
instance uniform float sail_fill = 1.0;
/// which way it bellies (the lee side) and how far: -1 .. 1
instance uniform float sail_depth = 1.0;
instance uniform float sail_phase = 0.0;
/// the cloth of her refit (Parts' sails): x its tier + 1 (0 plain canvas),
/// y where in its drift it starts
instance uniform vec2 sail_part = vec2(0.0);

// UV2.x: how deep the sail bellies at full draw (m), UV2.y: 1 if it bears the emblem
varying vec3 v_world;
varying float v_emblem;
#ifdef DAMAGE
#include "res://shaders/inc/ship_damage.gdshaderinc"
#endif
#ifdef SKIN
#include "res://shaders/inc/ship_skin.gdshaderinc"
#endif

void vertex() {
	float bx = sin(UV.x * PI);
	float by = sin(UV.y * PI * 0.92 + 0.12);
	float flutter = sin(TIME * 6.0 + UV.x * 7.0 + UV.y * 5.0 + sail_phase) * 0.04 * (1.0 - sail_fill * 0.7);
	VERTEX.z += (bx * by * (0.25 + sail_fill) + flutter) * sail_depth * UV2.x;
	float k = (0.25 + sail_fill) * 0.55 * sail_depth;
	float dzdu = cos(UV.x * PI) * sin(UV.y * 2.89 + 0.12);
	float dzdv = sin(UV.x * PI) * cos(UV.y * 2.89 + 0.12);
	NORMAL = normalize(vec3(-dzdu * k, -dzdv * k * 0.6, 1.0));
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	lit_cloud = cloud_shadow(v_world.xz);
	v_emblem = UV2.y;
}

// a vertical band [a, b] in u, antialiased
float vband(float x, float a, float b) {
	float fw = max(fwidth(x), 1e-5);
	return clamp((x - a) / fw + 0.5, 0.0, 1.0) * clamp((b - x) / fw + 0.5, 0.0, 1.0);
}

// ------------------------------------------------------------------ refit cloth
// The web game's GLSL_PART_SAIL: one branch per part, picked by sail_part.x,
// so changing her sails never compiles anything.

#include "res://shaders/inc/skin_noise.gdshaderinc"

// lines every `period` along x, `w` wide, antialiased
float ps_line(float x, float period, float w) {
	float d = abs(fract(x / period + 0.5) - 0.5) * period;
	return 1.0 - smoothstep(w, w + fwidth(x) * 1.5, d);
}

// one line at x = at
float ps_at(float x, float at, float w) {
	return 1.0 - smoothstep(w, w + fwidth(x) * 1.5, abs(x - at));
}

// uv is the sail's own (x across, y up from the foot); `cloth` masks the bare
// canvas, so the mark and the accent stay on top. Adds the cloth's own light
// to emis, and where it's metal thread (amt) how metal and how rough.
void sail_part_paint(float id, vec2 uv, float t, float cloth, inout vec3 col, inout vec3 emis, inout float metal, inout float rough, inout float amt) {
	float u = uv.x;
	// 0 at the yard .. 1 at the foot
	float v = 1.0 - uv.y;
	float edge = min(min(u, 1.0 - u), min(v, 1.0 - v));
	vec3 gold = vec3(1.0, 0.7, 0.26);
	if (id < 1.5) {
		// storm canvas: doubled tablings, seamed cloths, three reef bands and patched clews
		float tab = 1.0 - smoothstep(0.045, 0.052, edge);
		col *= mix(1.0, 0.84, tab);
		col *= 1.0 - ps_line(u, 1.0 / 9.0, 0.0015) * 0.16;
		float clew = 1.0 - smoothstep(0.15, 0.16, (1.0 - v) + min(u, 1.0 - u));
		col *= mix(1.0, 0.88, clew);
		for (int i = 0; i < 3; i++) {
			float r = 0.17 + float(i) * 0.13;
			col *= 1.0 - ps_at(v, r, 0.002) * 0.3;
			vec2 d = vec2((fract(u * 22.0) - 0.5) / 22.0 * 1.4, v - r - 0.008);
			col *= 1.0 - (1.0 - smoothstep(0.004, 0.0065, length(d))) * 0.55;
		}
	} else if (id < 2.5) {
		// clipper cloth: bright, tight-woven, bound in crimson with a gilt pinstripe
		col *= mix(1.0, 1.07, cloth);
		col *= 1.0 - ps_line(u, 1.0 / 12.0, 0.001) * 0.08;
		float bind = 1.0 - smoothstep(0.032, 0.038, edge);
		col = mix(col, vec3(0.42, 0.04, 0.05), bind);
		float pin = ps_at(edge, 0.05, 0.0035);
		col = mix(col, gold, pin);
		metal = mix(metal, 0.8, pin);
		rough = mix(rough, 0.35, pin);
		amt = max(amt, pin);
	} else if (id < 3.5) {
		// batwing battens: bamboo ribs across the cloth, a fan of tinted panels, scalloped dark edges
		float k = v * 7.0;
		float rib = ps_at(fract(k + 0.5) - 0.5, 0.0, 0.035);
		float panel = fract(k);
		col *= mix(0.84, 1.04, sin(panel * PI));
		col *= mix(1.0, 0.9, mod(floor(k), 2.0));
		float scallop = 0.035 + 0.02 * sin(panel * PI);
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
		float rays = ps_line(a, 0.2618, 0.022);
		float tiers = ps_line(r, 0.09, 0.004);
		float body = 1.0 - smoothstep(0.055, 0.062, length(vec2(p.x * 1.4, p.y + 0.02)));
		float head = 1.0 - smoothstep(0.03, 0.036, length(vec2(p.x, p.y + 0.11)));
		float fl = sk_fbm(vec2(u * 7.0, v * 3.0 - t * 0.6));
		float lick = v + fl * 0.32 - 0.12 * sin(u * 18.0 + t);
		float flame = smoothstep(0.62, 0.66, lick) * smoothstep(0.98, 0.9, v);
		float flame_edge = flame * (1.0 - smoothstep(0.62, 0.7, lick - 0.05));
		float border = (1.0 - smoothstep(0.026, 0.031, edge)) + ps_at(edge, 0.045, 0.003) + ps_at(edge, 0.038, 0.0018) * ps_line(u + v, 0.02, 0.004);
		float g = clamp(fan * max(rays, tiers) + body + head + border + flame_edge, 0.0, 1.0);
		col = mix(col, mix(col, vec3(0.86, 0.32, 0.08), 0.55), flame * cloth);
		col = mix(col, gold * mix(0.85, 1.1, fl), g);
		emis += gold * (g * 0.35 + flame_edge * 0.4) * vec3(1.0, 0.75, 0.45);
		metal = mix(metal, 0.9, g);
		rough = mix(rough, 0.28, g);
		amt = max(amt, g);
	} else {
		// aether sails: veins of storm light run through indigo cloth, stars wink in it, the edges burn
		vec3 deep = mix(vec3(0.03, 0.025, 0.1), vec3(0.11, 0.05, 0.2), v);
		col = mix(col, deep, 0.9 * cloth + 0.45 * (1.0 - cloth));
		vec2 q = vec2(u * 2.2, v * 2.6 - t * 0.05);
		q += 0.35 * vec2(sk_fbm(q * 1.1 + vec2(0.0, t * 0.08)), sk_fbm(q * 1.1 + vec2(5.2, -t * 0.06)));
		float rid = 0.0;
		float amp = 0.62;
		vec2 qq = q * 1.4;
		for (int i = 0; i < 3; i++) {
			float r = 1.0 - abs(2.0 * sk_n(qq) - 1.0);
			rid += amp * r * r * r * r * r * r;
			qq = qq * 2.03 + vec2(1.7, -t * 0.16);
			amp *= 0.55;
		}
		float line = smoothstep(0.34, 0.62 + fwidth(rid) * 2.0, rid);
		vec3 cyan = vec3(0.16, 0.75, 1.5);
		vec3 violet = vec3(0.8, 0.25, 1.5);
		vec3 lc = mix(cyan, violet, smoothstep(0.35, 0.7, sk_n(q * 0.9 + 3.0)));
		float pulse = 0.7 + 0.3 * sin(t * 1.9 - v * 6.0 + u * 2.0);
		emis += lc * line * pulse * 1.3;
		col = mix(col, lc * 0.25, line * 0.6);
		vec2 cell = floor(uv * vec2(24.0, 28.0));
		float h = sk_h(cell);
		vec2 sp = fract(uv * vec2(24.0, 28.0)) - 0.5 - (sk_h2(cell) - 0.5) * 0.6;
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

void fragment() {
	// canvas coordinates, y down from the head as the web game painted it
	vec2 c = vec2(UV.x, 1.0 - UV.y);
	float px = 1.0 / 512.0;
	float cloth = floor(c.x * 9.0);
	float cx = fract(c.x * 9.0) / 9.0;
	// every other cloth in the accent for stripes, each a slightly different bolt
	float stripe = sail_pattern == 1 && mod(cloth, 2.0) > 0.5 ? 1.0 : 0.0;
	vec3 base = mix(c_sail, c_accent, stripe);
	vec3 col = base * (0.95 + hash11(cloth * 3.7 + 1.0) * 0.08);
	// the accent's pattern, under the seams and the reef bands as the web paints it
	float acc = 0.0;
	if (sail_pattern == 2) {
		acc = vband(c.y, 0.6, 0.8);
	} else if (sail_pattern == 3) {
		acc = 1.0 - vband(c.x, 0.085, 0.915) * vband(c.y, 0.085, 0.915);
	} else if (sail_pattern == 4) {
		acc = max(vband(c.x, 0.43, 0.57), vband(c.y, 0.42, 0.56));
	} else if (sail_pattern == 5) {
		float d = c.y - 0.35 - c.x;
		acc = clamp(d / max(fwidth(d), 1e-5) + 0.5, 0.0, 1.0);
	}
	col = mix(col, c_accent, acc);
	// double-stitched seams between the cloths
	col = mix(col, c_seam, vband(cx, -1.0, 2.5 * px) * 0.85);
	col = mix(col, c_seam, vband(cx, 5.0 * px, 6.0 * px) * 0.3);
	// reef bands and their rows of reef points
	float reef_a = vband(c.y, 0.14, 0.14 + 6.0 * px);
	float reef_b = vband(c.y, 0.28, 0.28 + 4.0 * px);
	col = mix(col, c_seam, max(reef_a, reef_b));
	float pts_x = abs(fract(c.x * 12.0 - 0.5) - 0.5) / 12.0;
	float point_row = max(vband(c.y, 0.14 - 7.0 * px, 0.14 + 13.0 * px), vband(c.y, 0.28 - 7.0 * px, 0.28 + 11.0 * px));
	col = mix(col, c_seam * 0.7, vband(pts_x, -1.0, 1.5 * px) * point_row);
	// reinforcing patches at the head earings and clews
	vec2 e = min(c, 1.0 - c);
	col = mix(col, c_sail * 0.9, clamp((0.16 - (e.x + e.y)) / max(fwidth(e.x + e.y), 1e-5) + 0.5, 0.0, 1.0));
	// a broad tabling along the foot
	col = mix(col, c_sail * 0.92, vband(c.y, 1.0 - 22.0 * px, 2.0));
	// the mark
	float ink = 0.0;
	if (mark_on && v_emblem > 0.5) {
		ink = texture(mark_tex, (c - vec2(0.5)) / (0.28 * 2.2) + vec2(0.5)).r;
		col = mix(col, c_emblem, ink);
	}
	// weathering toward the foot, then the bolt rope round the edge
	col = mix(col, vec3(0.235, 0.176, 0.078), 0.16 * c.y);
	float edge = min(e.x, e.y);
	col = mix(col, c_seam * 0.8, vband(edge, -1.0, 8.0 * px));
	float metal = 0.0;
	float rough = 0.92;
#ifdef SKIN
	vec3 skin_glow = vec3(0.0);
	if (skin_id > 0) {
		// her vault skin wherever the canvas still shows its own colour (the
		// web's test, so her mark and an accent in another colour stay on
		// top), shaded as the cloth was: seams, reefs and weathering show
		vec3 r = col / max(c_sail, vec3(0.02));
		float mean = (r.r + r.g + r.b) / 3.0;
		float spread = (max(r.r, max(r.g, r.b)) - min(r.r, min(r.g, r.b))) / max(mean, 0.05);
		float mask = (1.0 - smoothstep(0.1, 0.24, spread)) * smoothstep(0.5, 0.66, mean) * (1.0 - smoothstep(1.3, 1.5, mean)) * skin_p.y;
		vec3 se = vec3(0.0);
		float sm = 0.0;
		float sr = 0.5;
		vec3 sc = aq_skin(vec2(UV.x * 6.0, (1.0 - UV.y) * 7.0), abs(dot(normalize(NORMAL), VIEW)), TIME, 1.0, se, sm, sr);
		col = mix(col, sc * clamp(mean, 0.6, 1.1), mask);
		metal = sm * mask;
		rough = mix(rough, sr, mask);
		skin_glow = se * mask * (0.55 + night * 0.9);
	}
#endif
	// her refit's cloth over it all, where the bare canvas shows
	vec3 pc_emis = vec3(0.0);
	float pc_metal = 0.0;
	float pc_rough = 0.5;
	float pc_amt = 0.0;
	if (sail_part.x > 0.5) {
		float bare = (1.0 - max(acc, stripe)) * (1.0 - ink);
		sail_part_paint(sail_part.x, UV, TIME + sail_part.y, bare, col, pc_emis, pc_metal, pc_rough, pc_amt);
		// a glowing cloth comes alive after dark
		pc_emis *= 0.6 + night * 0.9;
	}

	// raised seams, reef bands and bolt rope; each cloth bellies a little
	float fade = 1.0 - smoothstep(0.004, 0.012, fwidth(c.x));
	float h = (1.0 - abs(cx * 9.0 * 2.0 - 1.0)) * 0.14;
	h += vband(cx, -1.0, 2.5 * px) * 0.3 + max(reef_a, reef_b) * 0.32;
	h += vband(c.y, 1.0 - 11.0 / 256.0, 2.0) * 0.12 + vband(edge, -1.0, 4.0 / 256.0) * 0.45;
	NORMAL = bump(NORMAL, VERTEX, h * 0.02 * fade);

	EMISSION = pc_emis;
#ifdef SKIN
	EMISSION = skin_light(EMISSION + skin_glow, 1.25);
#endif
#ifdef DAMAGE
	bool drop;
	EMISSION += canvas_damage(UV, sail_phase, col, drop);
	if (drop) {
		discard;
	}
#endif
	ALBEDO = col * wet_dim();
	METALLIC = mix(metal, pc_metal, pc_amt);
	ROUGHNESS = mix(rough, pc_rough, pc_amt) * wet_gloss();
	SPECULAR = 0.35;
	// sunlight glows through the canvas from behind
	BACKLIGHT = col * 0.32;
#ifdef PHANTOM
	phantom_apply(FRAGCOORD.xy, NORMAL, VIEW, (INV_VIEW_MATRIX * vec4(VERTEX, 1.0)).xyz, ALBEDO, EMISSION);
#endif
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
