// Palms and tree ferns: fronds lit on both sides, ringed, fibrous stems up close (see inc/flora_body.gdshaderinc).
shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_schlick_ggx;

#define FLORA_SWAY 0.0028
#define FLORA_FOLIAGE
#define FLORA_BARK 2
#define FLORA_ROUGH 0.7
#include "res://shaders/inc/flora_body.gdshaderinc"
