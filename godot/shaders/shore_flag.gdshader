// A cutthroat camp's colours (art/jolly_roger.png, baked by
// tools/bake_roger.mjs) on its pole, flying downwind: the cloth waves harder
// toward the frayed fly and as the breeze freshens, and is lit through from
// behind. UV.x runs from the hoist (0) out to the fly (1); the flag is 1.7 m
// on the fly (a fort flies a bigger one, scaled up whole).
shader_type spatial;
render_mode cull_disabled, shadows_disabled;

#include "res://shaders/inc/atmos.gdshaderinc"
#define LIT_SPECULAR 0.3
#define LIT_BACKLIGHT
#include "res://shaders/inc/lit.gdshaderinc"

uniform sampler2D roger : source_color, filter_linear_mipmap_anisotropic;

varying vec3 v_world;

void vertex() {
	float a = UV.x;
	float k = 0.6 + wind.z * 0.8;
	float ph = TIME * 7.5 - a * 8.0;
	VERTEX.z += sin(ph) * 0.12 * a * k;
	VERTEX.y += sin(TIME * 5.0 - a * 6.0) * 0.04 * a;
	float dz = (sin(ph) - cos(ph) * 8.0 * a) * 0.12 * k / 1.7;
	NORMAL = normalize(vec3(-dz, 0.0, 1.0));
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	lit_cloud = cloud_shadow(v_world.xz);
}

void fragment() {
	vec4 t = texture(roger, UV);
	if (t.a < 0.5) {
		discard;
	}
	vec3 col = t.rgb * (1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.05, UV.x)));
	ALBEDO = col * wet_dim();
	ROUGHNESS = 0.8 * wet_gloss();
	SPECULAR = 0.3;
	BACKLIGHT = col * 0.3;
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
