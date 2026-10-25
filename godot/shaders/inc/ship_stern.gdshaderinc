// The body of ship_stern.gdshader and ship_stern_dmg.gdshader (with DAMAGE
// defined: see ship_damage.gdshaderinc).

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/ship_common.gdshaderinc"
#include "res://shaders/inc/lit.gdshaderinc"
#ifdef PHANTOM
#include "res://shaders/inc/ship_phantom.gdshaderinc"
#endif

uniform vec3 c_hull : source_color = vec3(0.48, 0.29, 0.16);
uniform vec3 c_bottom : source_color = vec3(0.7, 0.23, 0.17);
uniform vec3 c_boot : source_color = vec3(0.96, 0.94, 0.88);
uniform vec3 c_strake : source_color = vec3(0.12, 0.54, 0.54);
uniform vec3 c_trim : source_color = vec3(0.89, 0.71, 0.32);
uniform int rows = 1;
/// the great cabin's lamplight through its panes, and the glass by day
uniform vec3 pane_glow = vec3(1.4, 0.5, 0.079);
uniform vec3 pane_glass : source_color = vec3(1.0, 0.847, 0.541);

varying vec3 v_world;
#ifdef DAMAGE
#include "res://shaders/inc/ship_damage.gdshaderinc"
/// the great cabin's lamps: out (0) once she's lost
uniform float lit = 1.0;
varying vec3 v_obj;
#endif

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	lit_cloud = cloud_shadow(v_world.xz);
#ifdef DAMAGE
	v_obj = VERTEX;
#endif
}

float box(vec2 p, vec2 half_size, float r) {
	vec2 q = abs(p) - half_size + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void fragment() {
	vec2 c = vec2(UV.x, 1.0 - UV.y);
	float px = 1.0 / 256.0;
	float fw = max(fwidth(c.y), 1e-5);
	vec3 col = c_hull;
	col = mix(col, c_bottom, smoothstep(0.72 - fw, 0.72 + fw, c.y));
	col = mix(col, c_boot, smoothstep(0.69 - fw, 0.69 + fw, c.y) * (1.0 - smoothstep(0.72 - fw, 0.72 + fw, c.y)));
	col = mix(col, c_strake, 1.0 - smoothstep(0.42 - fw, 0.42 + fw, c.y));
	float trim = max(1.0 - smoothstep(6.0 * px - fw, 6.0 * px + fw, c.y), smoothstep(0.42 - fw, 0.42 + fw, c.y) * (1.0 - smoothstep(0.42 + 5.0 * px - fw, 0.42 + 5.0 * px + fw, c.y)));
	col = mix(col, c_trim, trim);
	float metal = trim * 0.6;
	vec3 glow = vec3(0.0);
	for (int r = 0; r < 3; r++) {
		if (r >= rows) {
			break;
		}
		float y = 0.07 + float(r) * 0.15 + 0.05;
		for (int i = 0; i < 4; i++) {
			vec2 p = c - vec2(0.2 + float(i) / 3.0 * 0.6, y);
			float frame = box(p, vec2(0.05 + 4.0 * px, 0.05 + 4.0 * px), 6.0 * px);
			float pane = box(p, vec2(0.05), 4.0 * px);
			float af = max(fwidth(frame), 1e-5);
			float in_frame = clamp(0.5 - frame / af, 0.0, 1.0);
			float in_pane = clamp(0.5 - pane / af, 0.0, 1.0);
			col = mix(col, c_trim, in_frame);
			metal = mix(metal, 0.6, in_frame);
			// mullions
			float mull = max(1.0 - smoothstep(px, px + af, abs(p.x)), 1.0 - smoothstep(px, px + af, abs(p.y)));
			vec3 glass = mix(pane_glass, c_trim * 0.6, mull);
			col = mix(col, glass, in_pane);
			glow += pane_glow * in_pane * (1.0 - mull);
			metal = mix(metal, 0.0, in_pane);
		}
	}
	// lit windows are lamps: held through the night (the night grade opens the
	// exposure up more than twice, and would blow them into white blots)
	glow *= mix(1.0, 0.6, smoothstep(0.05, 0.8, night));
	float rough = 0.5;
#ifdef DAMAGE
	bool drop;
	vec3 ember = hull_damage(v_obj, FRONT_FACING, true, col, rough, metal, drop);
	if (drop) {
		discard;
	}
	glow = glow * lit * (FRONT_FACING ? 1.0 : 0.0) + ember;
#endif
	ALBEDO = col * wet_dim();
	METALLIC = metal;
	ROUGHNESS = rough * wet_gloss();
	EMISSION = glow;
#ifdef PHANTOM
	phantom_apply(FRAGCOORD.xy, NORMAL, VIEW, (INV_VIEW_MATRIX * vec4(VERTEX, 1.0)).xyz, ALBEDO, EMISSION);
#endif
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
