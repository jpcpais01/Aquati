// ship_sail.gdshader for a ship that has been in a fight: her canvas torn
// into ragged, burnt-edged rags (see ship_damage.gdshaderinc).
shader_type spatial;
render_mode cull_disabled;

#define DAMAGE
#include "res://shaders/inc/ship_sail.gdshaderinc"
