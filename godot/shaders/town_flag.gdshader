// A trading port's flag over its harbour office, in the town's colours (a
// row of art/town_flags.png, baked by tools/bake_signs.mjs), waving harder
// toward the fly and as the breeze freshens; the cloth lit through from
// behind like a ship's. UV.x runs from the hoist (0) out to the fly (1), and
// UV.y down the town's row of the atlas; the flag is 3.2 m on the fly.
shader_type spatial;
render_mode cull_disabled, shadows_disabled;

#include "res://shaders/inc/atmos.gdshaderinc"
#define LIT_SPECULAR 0.3
#define LIT_BACKLIGHT
#include "res://shaders/inc/lit.gdshaderinc"

uniform sampler2D atlas : source_color, filter_linear_mipmap_anisotropic;

varying vec3 v_world;

void vertex() {
	float a = UV.x;
	float k = 0.6 + wind.z * 0.8;
	float ph = TIME * 7.0 - a * 9.0;
	VERTEX.z += sin(ph) * 0.18 * a * k;
	VERTEX.y += sin(TIME * 5.0 - a * 6.0) * 0.06 * a;
	// the cloth's slope along the fly (per metre), for its normal
	float dz = (sin(ph) - cos(ph) * 9.0 * a) * 0.18 * k / 3.2;
	NORMAL = normalize(vec3(-dz, 0.0, 1.0));
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	lit_cloud = cloud_shadow(v_world.xz);
}

void fragment() {
	vec3 col = texture(atlas, UV).rgb;
	// the sleeve darker where the flag is bent round its halyard
	col *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.06, UV.x));
	ALBEDO = col * wet_dim();
	ROUGHNESS = 0.8 * wet_gloss();
	SPECULAR = 0.3;
	BACKLIGHT = col * 0.3;
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
