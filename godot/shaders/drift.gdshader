// What the open sea carries (Drift): mats of driftwood and kelp, the crabs
// riding them, and messages in bottles. Each is placed by the CPU (there are
// only ever a handful). The vertex colour carries the paint (sRGB), its alpha
// byte the stuff it is made of (MeshKit.code): wood and weed, a crab's
// shell, glass, or the sun caught along the bottle's window.
shader_type spatial;
render_mode cull_disabled;

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/common.gdshaderinc"
varying float lit_spec;
#define LIT_SPECULAR lit_spec
#include "res://shaders/inc/lit.gdshaderinc"

/// the sun on the glass is HDR: its colour times this
uniform float glow_gain = 1.6;

varying vec3 v_world;

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	lit_cloud = cloud_shadow(v_world.xz);
}

void fragment() {
	// the paint's alpha byte: kind (in quarters) x 16 (MeshKit.code)
	int kind = int(floor(COLOR.a * 255.0 + 0.25)) >> 4;
	vec3 col = srgb_to_linear(COLOR.rgb);
	float shell = kind == 1 ? 1.0 : 0.0;
	float glass = kind == 2 ? 1.0 : 0.0;
	float glow = kind == 3 ? 1.0 : 0.0;
	float wood = 1.0 - shell - glass - glow;
	ALBEDO = col * (1.0 - glow) * wet_dim();
	METALLIC = glass * 0.1;
	ROUGHNESS = (wood * 0.82 + shell * 0.45 + glass * 0.08 + glow) * wet_gloss();
	lit_spec = 0.5 * (1.0 - glow);
	SPECULAR = lit_spec;
	EMISSION = col * glow * glow_gain * (1.0 - night * 0.7);
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
