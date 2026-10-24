// The Treasure Vault's column of light and its god rays (vault_light.gdshaderinc,
// kinds 0 and 1): standing in the scene, hidden behind what stands before them.
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

#include "res://shaders/inc/vault_light.gdshaderinc"

void vertex() {
	vec3 c = MODEL_MATRIX[3].xyz;
	vec3 w;
	if (kind == 0) {
		// a column that turns to face the camera, standing upright (a 1 x 1 quad)
		vec3 to_cam = CAMERA_POSITION_WORLD - c;
		to_cam.y = 0.0;
		vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), to_cam + vec3(1e-4, 0.0, 0.0)));
		w = c + right * VERTEX.x * k.x + vec3(0.0, (VERTEX.y + 0.5) * k.y, 0.0);
		v_q = vec2(VERTEX.x, VERTEX.y + 0.5);
	} else {
		// the cone, its foot in the chest's mouth (a cylinder centred on its middle)
		vec3 p = VERTEX + vec3(0.0, k.y * 0.5, 0.0);
		v_ang = atan(p.z, p.x);
		v_h = p.y / k.y;
		w = (MODEL_MATRIX * vec4(p, 1.0)).xyz;
	}
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
