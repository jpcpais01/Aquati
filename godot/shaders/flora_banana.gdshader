// Bananas: broad, thin leaves that flap in the wind (see inc/flora_body.gdshaderinc).
shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_schlick_ggx;

#define FLORA_SWAY 0.02
#define FLORA_FOLIAGE
#define FLORA_ROUGH 0.62
#include "res://shaders/inc/flora_body.gdshaderinc"
