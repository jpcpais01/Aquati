// A paper-lantern boat (the web game's fx/lanternBoats.ts): the lantern glows
// through its paper, the folded hull catches the candle from above, and it
// all flickers with the flame; lit as it's set down, guttering at the end.
// UV.x how the part glows (LanternBoats.boat_mesh); the instance's COLOR its
// lantern's tint (rgb) and how brightly it burns (a).
shader_type spatial;
render_mode unshaded, cull_disabled, shadows_disabled;

#include "res://shaders/inc/atmos.gdshaderinc"

/// The web's candle under the port's grade.
uniform float gain = 0.55;

varying float v_glow;
varying vec4 v_tint;
varying float v_face;
varying float v_seed;
varying vec3 v_world;

void vertex() {
	vec3 wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	vec3 n = normalize(mat3(MODEL_MATRIX) * NORMAL);
	vec3 to_eye = CAMERA_POSITION_WORLD - wp;
	v_face = abs(dot(n, to_eye / max(length(to_eye), 1e-3)));
	v_glow = UV.x;
	v_tint = COLOR;
	v_seed = fract(MODEL_MATRIX[3].x * 0.137 + MODEL_MATRIX[3].z * 0.071);
	v_world = wp;
}

void fragment() {
	float flick = 0.86 + 0.14 * sin(TIME * 12.0 + v_seed * 70.0) * sin(TIME * 7.1 + v_seed * 23.0);
	float k = v_tint.a * flick;
	vec3 paper = vec3(0.92, 0.88, 0.8);
	vec3 lit = v_tint.rgb * v_glow * (0.5 + 1.8 * v_face * v_face) * 1.2 * k;
	lit += vec3(1.0, 0.7, 0.38) * step(0.5, v_glow) * pow(v_face, 6.0) * 0.8 * k;
	vec3 amb = light_tint * (0.04 + 0.3 * (1.0 - night)) + vec3(0.02);
	vec3 base = mix(vec3(0.06, 0.045, 0.03), paper, step(0.05, v_glow)) * amb;
	ALBEDO = base + lit * gain;
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
