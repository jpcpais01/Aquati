// The body of ship_rope.gdshader and ship_rope_dmg.gdshader (with DAMAGE
// defined: ropes made fast to a spar that's been shot away drop out).

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/ship_common.gdshaderinc"
#define LIT_SPECULAR 0.3
#include "res://shaders/inc/lit.gdshaderinc"
#ifdef PHANTOM
#include "res://shaders/inc/ship_phantom.gdshaderinc"
#endif
#ifdef GHOST
#include "res://shaders/inc/ship_ghost.gdshaderinc"
#endif

varying vec3 v_world;
varying vec3 v_side;
varying vec3 v_facing;
varying float v_s;
varying float v_cover;
#ifdef DAMAGE
#include "res://shaders/inc/ship_damage.gdshaderinc"
#endif

void vertex() {
	vec3 t = normalize(mat3(MODEL_MATRIX) * CUSTOM0.xyz);
	vec3 to_eye = CAMERA_POSITION_WORLD - VERTEX;
	float dist = max(length(to_eye), 1e-3);
	vec3 side = normalize(cross(t, to_eye) + vec3(1e-6, 0.0, 0.0));
	// the world size of one pixel at this distance
	float px = 2.0 * dist / (PROJECTION_MATRIX[1][1] * VIEWPORT_SIZE.y);
	float r = CUSTOM0.w;
	float half_w = max(r, px * 0.55);
	v_cover = clamp(r / half_w * 1.15, 0.0, 1.0);
	VERTEX += side * UV.x * half_w;
	v_world = VERTEX;
	lit_cloud = cloud_shadow(v_world.xz);
	v_side = side;
	v_facing = normalize(to_eye - t * dot(to_eye, t));
	v_s = UV.x;
#ifdef DAMAGE
	// made fast to a spar that's gone: slack, and gone with it
	if (spar_gone(COLOR.a, true)) {
		VERTEX = vec3(0.0);
	}
#endif
}

void fragment() {
	float s = clamp(v_s, -1.0, 1.0);
	vec3 n = v_facing * sqrt(max(1.0 - s * s, 0.0)) + v_side * s;
	NORMAL = normalize((VIEW_MATRIX * vec4(n, 0.0)).xyz);
	ALBEDO = srgb_to_linear(COLOR.rgb) * wet_dim();
	ROUGHNESS = 0.88 * wet_gloss();
	SPECULAR = 0.3;
	ALPHA = v_cover;
#ifdef PHANTOM
	phantom_apply(FRAGCOORD.xy, NORMAL, VIEW, (INV_VIEW_MATRIX * vec4(VERTEX, 1.0)).xyz, ALBEDO, EMISSION);
#endif
#ifdef GHOST
	ghost_apply(FRAGCOORD.xy, NORMAL, VIEW, (INV_VIEW_MATRIX * vec4(VERTEX, 1.0)).xyz, MODEL_MATRIX, 0.235, 1.0, ALBEDO, EMISSION);
#endif
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
