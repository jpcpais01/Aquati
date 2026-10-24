// The Treasure Vault's shockwave (vault_light.gdshaderinc, kind 3): a ring of
// light racing out across the water from the chest, laid on the very swell
// the ocean draws (sea_height.gdshaderinc) so the waves never cut it.
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

#include "res://shaders/inc/sea_height.gdshaderinc"
#include "res://shaders/inc/vault_light.gdshaderinc"

void vertex() {
	vec3 c = MODEL_MATRIX[3].xyz;
	vec2 p = c.xz + VERTEX.xz * k.x;
	vec2 slope;
	vec3 w = vec3(p.x, sea_height(p, sea_floor(p), slope) + 0.1, p.y);
	v_q = VERTEX.xz;
	POSITION = PROJECTION_MATRIX * (VIEW_MATRIX * vec4(w, 1.0));
}

void fragment() {
	float a = vault_light(TIME);
	if (a < 0.002) {
		discard;
	}
	ALBEDO = color * a;
	ALPHA = 0.0;
}
