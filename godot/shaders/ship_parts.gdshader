// Everything on a ship that isn't skin, deck or canvas: spars, rails, wales,
// guns and their carriages, ironwork, gilding and lamps, all in one mesh. The
// vertex colour carries the paint (sRGB), its alpha byte the stuff it's made
// of (wood, rope, iron and bronze, lamplight, gilt) and the spar it stands on
// (see MeshKit.code).
shader_type spatial;
render_mode cull_back;

#include "res://shaders/inc/ship_parts.gdshaderinc"
