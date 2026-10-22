// The lock glow: lantern light pooled on the water round a hull your loaded
// guns are laid on. A soft halo shaped to the ship (a superellipse round her
// waterline), rippling as if caught on moving water. No lines, no glyphs.
// The plane rides at her waterline; each vertex is drawn a little toward the
// eye along its own ray (same place on screen, nearer in depth), so the swell
// never cuts the light while her hull still hides what lies behind it.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

#include "res://shaders/inc/atmos.gdshaderinc"

uniform float strength = 0.0;
/// The hull's half-beam and half-length with a margin (m), and the plane's half-size (m).
uniform vec2 half_hull = vec2(3.0, 10.0);
uniform float plane = 20.0;
uniform float clock = 0.0;

varying vec2 v_p;

void vertex() {
	v_p = VERTEX.xz;
	vec4 mv = MODELVIEW_MATRIX * vec4(VERTEX, 1.0);
	float d = length(mv.xyz);
	mv.xyz *= max(0.0, 1.0 - 1.2 / max(d, 1e-3));
	POSITION = PROJECTION_MATRIX * mv;
}

void fragment() {
	vec2 m = v_p * plane;
	// distance outside the rounded hull outline, in metres
	vec2 q = abs(m) / half_hull;
	float d = pow(pow(q.x, 2.4) + pow(q.y, 2.4), 1.0 / 2.4);
	float out_ = max(d - 1.0, 0.0) * min(half_hull.x, half_hull.y) * 1.6;
	float halo = exp(-out_ * 0.32) * smoothstep(0.55, 1.0, d);
	// light caught on moving water: soft rings drifting outward, broken by a slow swirl
	float a = atan(m.y, m.x);
	float rip = 0.72 + 0.28 * sin(out_ * 1.7 - clock * 2.2 + sin(a * 3.0 + clock * 0.7) * 1.2);
	float breathe = 0.85 + 0.15 * sin(clock * 2.1);
	float v = halo * rip * breathe * (1.0 - smoothstep(0.82, 1.0, length(v_p)));
	vec3 col = mix(vec3(1.0, 0.62, 0.22), vec3(1.0, 0.7, 0.35), night) * (0.42 - 0.12 * night);
	ALBEDO = col * v * strength;
}
