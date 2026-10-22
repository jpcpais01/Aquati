// ship_parts.gdshader for a ship that has been in a fight: scorch, breaches
// and a wreck's break line (see ship_damage.gdshaderinc), and the parts of
// any spar shot away left out.
shader_type spatial;
render_mode cull_back;

#define DAMAGE
#include "res://shaders/inc/ship_parts.gdshaderinc"
