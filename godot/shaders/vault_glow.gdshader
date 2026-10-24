// The Treasure Vault's glare (vault_light.gdshaderinc, kind 2): a glow with
// star spikes and a lens streak, a quad facing the camera nudged toward it
// (or back, behind the shut chest, to backlight it), drawn over everything
// as light in the lens is.
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, depth_test_disabled, cull_disabled, shadows_disabled, fog_disabled;

#include "res://shaders/inc/vault_light.gdshaderinc"

void vertex() {
	vec4 mv = VIEW_MATRIX * vec4(MODEL_MATRIX[3].xyz, 1.0);
	mv.xyz += normalize(-mv.xyz) * k.w;
	mv.xy += VERTEX.xy * k.x;
	v_q = VERTEX.xy;
	POSITION = PROJECTION_MATRIX * mv;
}

void fragment() {
	float a = vault_light(TIME);
	if (a < 0.002) {
		discard;
	}
	ALBEDO = color * a;
	ALPHA = 0.0;
}
