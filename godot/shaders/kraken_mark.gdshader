// Where the Kraken's blow will land (the web's fx/krakenModel.ts marks): a
// crimson shimmer laid on the sea. A strip along an arm's length where it
// will whip down, quickening and brightening as the blow comes; a pulsing
// ring round her hull as an arm coils for her. One instanced quad each,
// INSTANCE_CUSTOM: alpha, kind (0 strip, 1 ring), seed, urgency. Like the
// gunnery's lantern glow, each vertex is drawn a little toward the eye along
// its own ray so the swell never cuts it while a hull still hides it.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

#include "res://shaders/inc/atmos.gdshaderinc"

varying vec2 v_p;
varying vec4 v_mk;

void vertex() {
	v_p = VERTEX.xz;
	v_mk = INSTANCE_CUSTOM;
	vec4 mv = MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
	float d = length(mv.xyz);
	mv.xyz *= max(0.0, 1.0 - 1.5 / max(d, 1e-3));
	POSITION = PROJECTION_MATRIX * mv;
}

void fragment() {
	float a;
	if (v_mk.y < 0.5) {
		// the strip: along x -0.5..0.5 from the root, across z -0.5..0.5
		float u = v_p.x + 0.5;
		float w = v_p.y * 2.0;
		float body = exp(-w * w * 3.2) * smoothstep(0.0, 0.12, u) * smoothstep(1.0, 0.82, u);
		float edge = exp(-pow((abs(w) - 0.72) * 7.0, 2.0)) * smoothstep(0.0, 0.2, u) * smoothstep(1.0, 0.9, u);
		float run = 0.55 + 0.45 * sin(u * 34.0 - TIME * (9.0 + v_mk.w * 10.0) + v_mk.z * 6.0);
		a = (body * 0.35 * run + edge * 0.55) * (0.6 + 0.4 * v_mk.w);
	} else {
		// the ring: a pulsing circle where something vast is about to break the surface
		float r = length(v_p) * 2.0;
		float rd = (r - 0.8 - 0.06 * sin(TIME * 5.0)) * 10.0;
		a = exp(-rd * rd) * 0.7 + (1.0 - smoothstep(0.0, 0.85, r)) * 0.12 * (0.5 + 0.5 * sin(TIME * 7.0 - r * 9.0));
	}
	a *= v_mk.x;
	if (a < 0.002) {
		discard;
	}
	ALBEDO = vec3(1.9, 0.16, 0.08) * (1.0 - night * 0.45) * a;
}
