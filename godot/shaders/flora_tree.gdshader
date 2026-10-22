// Broadleaf trees: crowns of leaf clusters on fissured, mossy trunks (see inc/flora_body.gdshaderinc).
shader_type spatial;
render_mode cull_back, diffuse_lambert, specular_schlick_ggx;

#define FLORA_SWAY 0.0018
#define FLORA_FOLIAGE
#define FLORA_BARK 1
#define FLORA_LEAVES
#define FLORA_ROUGH 0.8
#include "res://shaders/inc/flora_body.gdshaderinc"
