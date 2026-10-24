// ship_parts.gdshader for your own ship, which can wear a Treasure Vault skin
// (see ship_skin.gdshaderinc): the same, with the skin over her paint.
shader_type spatial;
render_mode cull_back;

#define SKIN
#include "res://shaders/inc/ship_parts.gdshaderinc"
