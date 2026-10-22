// ship_rope.gdshader for a ship that has lost a spar: the ropes that were
// made fast to it are gone (see ship_damage.gdshaderinc).
shader_type spatial;
render_mode cull_disabled, world_vertex_coords, depth_draw_opaque;

#define DAMAGE
#include "res://shaders/inc/ship_rope.gdshaderinc"
