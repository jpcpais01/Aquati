// ship_rope_dmg.gdshader for the Hollow Jack crossed into the spirit world
// (Haunt's Phantom Run): her wounds as they were, thinned to a ghost (see
// ship_phantom.gdshaderinc), two-sided so her far side shows through her.
shader_type spatial;
render_mode cull_disabled, world_vertex_coords, depth_draw_opaque;

#define DAMAGE
#define PHANTOM
#include "res://shaders/inc/ship_rope.gdshaderinc"
