// A town's paper lanterns on a feast night (the web game's festival.ts
// LANTERN_VS/FS). Each swings from its string, leant downwind and rocking
// on the gusts; each is lit in its turn as the lamplighter works down the
// quay; lit, its paper glows from inside, brightest where you look straight
// through it at the candle, the dark caps top and bottom catching nothing.
//
// The mesh (Festival.festoon): COLOR the paper's colour and whether this is
// paper (a); UV, UV2.x the lantern's hanging point (x, z; y); UV2.y its turn.
shader_type spatial;
render_mode unshaded, cull_disabled, shadows_disabled;

#include "res://shaders/inc/atmos.gdshaderinc"

/// How far tonight's lamplighting has got (0 .. 1.04).
uniform float lit = 0.0;
/// The wind in the town's frame (x, z) and its strength.
uniform vec3 sway = vec3(1.0, 0.0, 0.5);
/// The web's paper brightness under the port's grade.
uniform float gain = 0.55;

varying vec3 v_col;
varying float v_paper;
varying float v_face;
varying float v_on;
varying float v_seed;
varying vec3 v_world;

void vertex() {
	vec3 hang = vec3(UV.x, UV2.x, UV.y);
	float order = UV2.y;
	float seed = fract(order * 91.7 + hang.x * 0.371 + hang.z * 0.173);
	vec3 rel = VERTEX - hang;
	float rock = sin(TIME * (1.2 + seed * 0.8) + seed * 40.0);
	vec2 lean = sway.xy * sway.z * (0.16 + 0.12 * rock) + vec2(sin(TIME * 1.9 + seed * 17.0), cos(TIME * 1.6 + seed * 23.0)) * 0.05;
	rel.xz += lean * -rel.y;
	VERTEX = hang + rel;
	vec3 wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	vec3 n = normalize(mat3(MODEL_MATRIX) * NORMAL);
	vec3 to_eye = CAMERA_POSITION_WORLD - wp;
	float d = length(to_eye);
	v_face = abs(dot(n, to_eye / max(d, 1e-3)));
	v_on = smoothstep(order, order + 0.03, lit);
	v_col = COLOR.rgb;
	v_paper = COLOR.a;
	v_seed = seed;
	v_world = wp;
}

void fragment() {
	float flick = 0.9 + 0.1 * sin(TIME * 11.0 + v_seed * 60.0) * sin(TIME * 6.3 + v_seed * 31.0);
	float through = v_face * v_face;
	vec3 glow = v_col * v_paper * (0.45 + 1.9 * through) * flick;
	glow += vec3(1.0, 0.72, 0.4) * v_paper * through * through * through * 0.7 * flick;
	// unlit (and the caps): paper and lacquer in whatever light there is
	vec3 amb = light_tint * (0.05 + 0.25 * (1.0 - night)) + vec3(0.01);
	vec3 off = mix(vec3(0.05, 0.035, 0.025), v_col * 0.35, v_paper) * amb;
	vec3 c = mix(off, glow * gain + off * 0.3, v_on * v_paper);
	ALBEDO = c;
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
