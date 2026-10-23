// A menu's backdrop over the live scene: the CSS gradients the web lays
// under its harbour and its sea picker (shaders/inc/menu_layers.gdshaderinc).
shader_type canvas_item;

#include "res://shaders/inc/menu_layers.gdshaderinc"

void fragment() {
	vec4 col = menu_layers(vec4(0.0), UV);
	COLOR = vec4(col.rgb, col.a * fade);
}
