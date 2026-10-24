// The squeezebox player's notes and the sleeper's snores over Puerto
// Marézia's quay (the web's glyph sprites): a card turned square to the eye,
// as big as its node is scaled, with a glyph from art/home_glyphs.png (the
// note on the left half, the z on the right) cut out sharp, lit by nothing
// and in the air's haze.
shader_type spatial;
render_mode unshaded, cull_disabled, shadows_disabled;

#include "res://shaders/inc/atmos.gdshaderinc"

uniform sampler2D glyphs : source_color, filter_linear_mipmap, repeat_disable;
/// which glyph: 0 the note, 1 the z
instance uniform float glyph = 0.0;

varying vec3 v_world;

void vertex() {
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
	float s = length(MODEL_MATRIX[0].xyz);
	MODELVIEW_MATRIX = MODELVIEW_MATRIX * mat4(vec4(s, 0.0, 0.0, 0.0), vec4(0.0, s, 0.0, 0.0), vec4(0.0, 0.0, s, 0.0), vec4(0.0, 0.0, 0.0, 1.0));
	MODELVIEW_NORMAL_MATRIX = mat3(MODELVIEW_MATRIX);
	UV = vec2((UV.x + glyph) * 0.5, UV.y);
	v_world = MODEL_MATRIX[3].xyz;
}

void fragment() {
	vec4 g = texture(glyphs, UV);
	ALBEDO = g.rgb;
	ALPHA = g.a;
	ALPHA_SCISSOR_THRESHOLD = 0.4;
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
