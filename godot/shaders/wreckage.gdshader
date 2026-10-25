// Shipwreck survivors' wreckage (Survivors): a broken yard or a hatch cover,
// each placed by the CPU as it rides the swell. The vertex colour carries the
// paint (sRGB), its alpha byte the stuff it is made of (MeshKit.code): wood,
// rope or iron.
shader_type spatial;
render_mode cull_back;

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/ship_common.gdshaderinc"
#include "res://shaders/inc/lit.gdshaderinc"

varying vec3 v_world;
varying vec3 v_obj;

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_obj = VERTEX;
	lit_cloud = cloud_shadow(v_world.xz);
}

void fragment() {
	int kind = int(floor(COLOR.a * 255.0 + 0.25)) >> 4;
	vec3 col = srgb_to_linear(COLOR.rgb);
	float iron = kind == 2 ? 1.0 : 0.0;
	// a whisper of grain, and the sea-soaked wood darker at the waterline
	float g = sin(v_obj.x * 7.0 + sin(v_obj.y * 4.0 + v_obj.z * 3.0) * 2.0) * 0.5 + 0.5;
	col *= (1.0 - (1.0 - iron) * 0.08 * g) * 0.82;
	ALBEDO = col * wet_dim();
	METALLIC = iron * 0.6;
	ROUGHNESS = mix(0.78, 0.4, iron) * wet_gloss();
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
