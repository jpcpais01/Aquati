// The transom: the livery's bands carried round the stern, and a row (or
// rows) of the great cabin's windows glowing with lamplight. UV.x across
// (0.5 on the centre line), UV.y up from the keel.
shader_type spatial;
render_mode cull_back;

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/ship_common.gdshaderinc"

uniform vec3 c_hull : source_color = vec3(0.48, 0.29, 0.16);
uniform vec3 c_bottom : source_color = vec3(0.7, 0.23, 0.17);
uniform vec3 c_boot : source_color = vec3(0.96, 0.94, 0.88);
uniform vec3 c_strake : source_color = vec3(0.12, 0.54, 0.54);
uniform vec3 c_trim : source_color = vec3(0.89, 0.71, 0.32);
uniform int rows = 1;

varying vec3 v_world;

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
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
			vec3 glass = mix(vec3(1.0, 0.847, 0.541), c_trim * 0.6, mull);
			col = mix(col, glass, in_pane);
			glow += vec3(1.4, 0.5, 0.079) * in_pane * (1.0 - mull);
			metal = mix(metal, 0.0, in_pane);
		}
	}
	ALBEDO = col;
	METALLIC = metal;
	ROUGHNESS = 0.5;
	EMISSION = glow;
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
