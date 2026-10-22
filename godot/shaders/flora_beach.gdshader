// The beach's litter: starfish, shells and fallen coconuts (see inc/flora_body.gdshaderinc).
shader_type spatial;
render_mode cull_back, diffuse_lambert, specular_schlick_ggx;

#define FLORA_FADE 200.0
#define FLORA_ROUGH 0.6
#include "res://shaders/inc/flora_body.gdshaderinc"
