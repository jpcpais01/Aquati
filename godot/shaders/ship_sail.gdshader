// Sailcloth: nine cloths of slightly different bolts, double-stitched seams,
// two reef bands with their points, patches at the corners, a broad tabling
// along the foot, the bolt rope round the edge, the livery's emblem and a
// little weathering toward the foot, all painted from UV (x across, y up from
// the foot). The sail bellies with the wind and flutters when it spills.
// It takes no shadows, as on the web: thin, two-sided and always moving, the
// cloth shadowed itself in flickering blocks.
shader_type spatial;
render_mode cull_disabled, shadows_disabled;

#include "res://shaders/inc/ship_sail.gdshaderinc"
