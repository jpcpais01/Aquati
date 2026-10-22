// Driftwood (see inc/flora_body.gdshaderinc).
shader_type spatial;
render_mode cull_back, diffuse_lambert, specular_schlick_ggx;

#define FLORA_ROUGH 0.9
#include "res://shaders/inc/flora_body.gdshaderinc"
