// ship_hull.gdshader for a ship that has been in a fight: her breaches,
// patches, scorch and a wreck's break line (see ship_damage.gdshaderinc), and
// two-sided, so a breach looks into the dark hold.
shader_type spatial;
render_mode cull_disabled;

#define DAMAGE
#include "res://shaders/inc/ship_hull.gdshaderinc"
