// The body of ship_sail.gdshader and ship_sail_dmg.gdshader (with DAMAGE
// defined: canvas torn and burnt, see ship_damage.gdshaderinc).

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/ship_common.gdshaderinc"
#define LIT_SPECULAR 0.35
#define LIT_BACKLIGHT
#include "res://shaders/inc/lit.gdshaderinc"

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

// UV2.x: how deep the sail bellies at full draw (m), UV2.y: 1 if it bears the emblem
varying vec3 v_world;
varying float v_emblem;
#ifdef DAMAGE
#include "res://shaders/inc/ship_damage.gdshaderinc"
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

void fragment() {
	// canvas coordinates, y down from the head as the web game painted it
	vec2 c = vec2(UV.x, 1.0 - UV.y);
	float px = 1.0 / 512.0;
	float cloth = floor(c.x * 9.0);
	float cx = fract(c.x * 9.0) / 9.0;
	// every other cloth in the accent for stripes, each a slightly different bolt
	vec3 base = sail_pattern == 1 && mod(cloth, 2.0) > 0.5 ? c_accent : c_sail;
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
	if (mark_on && v_emblem > 0.5) {
		col = mix(col, c_emblem, texture(mark_tex, (c - vec2(0.5)) / (0.28 * 2.2) + vec2(0.5)).r);
	}
	// weathering toward the foot, then the bolt rope round the edge
	col = mix(col, vec3(0.235, 0.176, 0.078), 0.16 * c.y);
	float edge = min(e.x, e.y);
	col = mix(col, c_seam * 0.8, vband(edge, -1.0, 8.0 * px));

	// raised seams, reef bands and bolt rope; each cloth bellies a little
	float fade = 1.0 - smoothstep(0.004, 0.012, fwidth(c.x));
	float h = (1.0 - abs(cx * 9.0 * 2.0 - 1.0)) * 0.14;
	h += vband(cx, -1.0, 2.5 * px) * 0.3 + max(reef_a, reef_b) * 0.32;
	h += vband(c.y, 1.0 - 11.0 / 256.0, 2.0) * 0.12 + vband(edge, -1.0, 4.0 / 256.0) * 0.45;
	NORMAL = bump(NORMAL, VERTEX, h * 0.02 * fade);

#ifdef DAMAGE
	bool drop;
	EMISSION = canvas_damage(UV, sail_phase, col, drop);
	if (drop) {
		discard;
	}
#endif
	ALBEDO = col * wet_dim();
	ROUGHNESS = 0.92 * wet_gloss();
	SPECULAR = 0.35;
	// sunlight glows through the canvas from behind
	BACKLIGHT = col * 0.32;
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
