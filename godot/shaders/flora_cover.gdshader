// Ground cover: grass tufts, dune grass, ferns and wildflowers, which bend
// hardest in the wind and shrink away with distance (see inc/flora_body.gdshaderinc).
shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_schlick_ggx;

#define FLORA_SWAY 0.12
#define FLORA_FOLIAGE
#define FLORA_FADE 300.0
#define FLORA_ROUGH 0.86
#include "res://shaders/inc/flora_body.gdshaderinc"
