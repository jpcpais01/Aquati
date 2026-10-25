// ship_stern_dmg.gdshader for a ghost ship (Livery "ghost"): her wounds as any
// ship's, in the ghost's look (see ship_ghost.gdshaderinc).
shader_type spatial;
render_mode cull_disabled;

#define DAMAGE
#define GHOST
#include "res://shaders/inc/ship_stern.gdshaderinc"
