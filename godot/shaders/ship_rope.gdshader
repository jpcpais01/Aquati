// Rigging as camera-facing ribbons, shaded as round rope. Up close a ribbon
// is the rope's true width; far off it never thins below a pixel and fades
// with the share of the pixel the rope really covers, so the rig neither
// shimmers nor vanishes and one mesh serves every distance.
// Each vertex: VERTEX on the rope's axis, CUSTOM0 = (direction along the
// rope, radius), UV.x = -1 / +1 for the two edges, COLOR = sRGB paint.
shader_type spatial;
render_mode cull_disabled, world_vertex_coords, depth_draw_opaque;

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/ship_common.gdshaderinc"

varying vec3 v_world;
varying vec3 v_side;
varying vec3 v_facing;
varying float v_s;
varying float v_cover;

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
	v_side = side;
	v_facing = normalize(to_eye - t * dot(to_eye, t));
	v_s = UV.x;
}

void fragment() {
	float s = clamp(v_s, -1.0, 1.0);
	vec3 n = v_facing * sqrt(max(1.0 - s * s, 0.0)) + v_side * s;
	NORMAL = normalize((VIEW_MATRIX * vec4(n, 0.0)).xyz);
	ALBEDO = srgb_to_linear(COLOR.rgb);
	ROUGHNESS = 0.88;
	SPECULAR = 0.3;
	ALPHA = v_cover;
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
