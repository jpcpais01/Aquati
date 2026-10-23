// A trading port's painted boards: the town's name over the harbour office
// and on the board over the quay, its landmark's and the warehouse's, gilt
// letters on dark wood, all from one atlas (art/town_signs.png, baked by
// tools/bake_signs.mjs); each board's UV picks its row.
shader_type spatial;
render_mode cull_back;

#include "res://shaders/inc/atmos.gdshaderinc"
#define LIT_SPECULAR 0.3
#include "res://shaders/inc/lit.gdshaderinc"

uniform sampler2D atlas : source_color, filter_linear_mipmap_anisotropic;

varying vec3 v_world;

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	lit_cloud = cloud_shadow(v_world.xz);
}

void fragment() {
	ALBEDO = texture(atlas, UV).rgb * wet_dim();
	ROUGHNESS = 0.7 * wet_gloss();
	SPECULAR = 0.3;
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
