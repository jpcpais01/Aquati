// ship_sail_dmg.gdshader for your own ship, which can wear a Treasure Vault
// skin (see ship_skin.gdshaderinc): her wounds over the skin.
shader_type spatial;
render_mode cull_disabled, shadows_disabled;

#define DAMAGE
#define SKIN
#include "res://shaders/inc/ship_sail.gdshaderinc"
