// Shrubs and flowering bushes (see inc/flora_body.gdshaderinc).
shader_type spatial;
render_mode cull_back, diffuse_lambert, specular_schlick_ggx;

#define FLORA_FOLIAGE
#define FLORA_LEAVES
#define FLORA_ROUGH 0.82
#include "res://shaders/inc/flora_body.gdshaderinc"
