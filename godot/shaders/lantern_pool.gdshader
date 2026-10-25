// The candlelight a lantern boat lays on the water round it (the web game's
// lantern pools): a soft wide glow and a brighter heart, added over the sea.
// The instance's COLOR is its warmed tint (rgb) and how brightly it burns (a).
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

#include "res://shaders/inc/atmos.gdshaderinc"

uniform float gain = 0.6;

varying vec4 v_tint;
varying vec3 v_world;

void vertex() {
	v_tint = COLOR;
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 q = UV * 2.0 - 1.0;
	float r2 = dot(q, q);
	if (r2 > 1.0) {
		discard;
	}
	float a = (exp(-r2 * 4.5) * 0.16 + exp(-r2 * 28.0) * 0.22) * v_tint.a * gain;
	a *= 1.0 - air_fog(v_world, CAMERA_POSITION_WORLD).a;
	ALBEDO = v_tint.rgb * a;
}
