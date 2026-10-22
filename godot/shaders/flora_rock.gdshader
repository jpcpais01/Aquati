// Boulders, in the island's own stone (see inc/flora_body.gdshaderinc).
shader_type spatial;
render_mode cull_back, diffuse_lambert, specular_schlick_ggx;

#define FLORA_ROUGH 0.78
#include "res://shaders/inc/flora_body.gdshaderinc"
