// The farewell's veil over the sea as it is (shaders/inc/farewell.gdshaderinc):
// the bruise of the blow, the card's backdrop and its shafts of light. While
// the view drowns, farewell_drown.gdshader takes over. src/ui/wreck_screen.gd.
shader_type canvas_item;

#include "res://shaders/inc/farewell.gdshaderinc"

void fragment() {
	COLOR = farewell(vec4(0.0), UV);
}
