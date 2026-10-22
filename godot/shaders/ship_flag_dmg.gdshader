// ship_flag.gdshader for a ship that has been in a fight: her colours torn
// and burnt (see ship_damage.gdshaderinc).
shader_type spatial;
render_mode cull_disabled;

#define DAMAGE
#include "res://shaders/inc/ship_flag.gdshaderinc"
