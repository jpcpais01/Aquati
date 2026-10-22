// A ship's planked and painted skin, drawn procedurally from the hull's own
// coordinates: UV.x runs stern (0) to stem (1), UV.y is the painted row
// (0 keel .. 0.3 waterline .. 0.705 wale .. 1 rail; see HullShape.tex_v).
// Caulked plank seams and butts with a little relief, the bottom paint with
// faint sheathing plates, the boot-top, wale, strake and gilt pinstripes,
// framed gunports, grime at the waterline, and a varnished clearcoat.
shader_type spatial;
render_mode cull_back;

#include "res://shaders/inc/ship_hull.gdshaderinc"
