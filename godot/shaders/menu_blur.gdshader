// A menu's backdrop that frosts the scene behind it (the web's backdrop-filter
// blur and saturate), with the gradients laid over it: the pause screen and
// the sheets. The screen's mip chain is a gaussian pyramid, so a tent of a
// few taps a few levels down is a soft, wide blur for next to nothing.
shader_type canvas_item;

#include "res://shaders/inc/menu_layers.gdshaderinc"

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
/// The blur's mip level, and the colour's saturation (1 as it was).
uniform float lod = 3.5;
uniform float saturate = 1.12;

void fragment() {
	vec2 px = SCREEN_PIXEL_SIZE * exp2(lod);
	vec3 c = textureLod(screen_tex, SCREEN_UV, lod).rgb * 0.4;
	c += textureLod(screen_tex, SCREEN_UV + vec2(px.x, px.y) * 0.75, lod).rgb * 0.15;
	c += textureLod(screen_tex, SCREEN_UV + vec2(-px.x, px.y) * 0.75, lod).rgb * 0.15;
	c += textureLod(screen_tex, SCREEN_UV + vec2(px.x, -px.y) * 0.75, lod).rgb * 0.15;
	c += textureLod(screen_tex, SCREEN_UV + vec2(-px.x, -px.y) * 0.75, lod).rgb * 0.15;
	float grey = dot(c, vec3(0.2126, 0.7152, 0.0722));
	c = max(mix(vec3(grey), c, saturate), 0.0);
	vec4 col = menu_layers(vec4(c, 1.0), UV);
	COLOR = vec4(col.rgb, fade);
}
