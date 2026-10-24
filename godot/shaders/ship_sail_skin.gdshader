// ship_sail.gdshader for your own ship, which can wear a Treasure Vault skin
// (see ship_skin.gdshaderinc): the same, with the skin over her paint.
shader_type spatial;
render_mode cull_disabled;

#define SKIN
#include "res://shaders/inc/ship_sail.gdshaderinc"
