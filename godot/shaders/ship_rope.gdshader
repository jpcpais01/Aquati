// Rigging as camera-facing ribbons, shaded as round rope. Up close a ribbon
// is the rope's true width; far off it never thins below a pixel and fades
// with the share of the pixel the rope really covers, so the rig neither
// shimmers nor vanishes and one mesh serves every distance.
// Each vertex: VERTEX on the rope's axis, CUSTOM0 = (direction along the
// rope, radius), UV.x = -1 / +1 for the two edges, COLOR = sRGB paint.
shader_type spatial;
render_mode cull_disabled, world_vertex_coords, depth_draw_opaque;

#include "res://shaders/inc/ship_rope.gdshaderinc"
