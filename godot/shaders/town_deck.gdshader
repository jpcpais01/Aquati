// A trading port's quay: the ships' scrubbed planking (UV in metres of the
// town's own frame, x along the shore and z out to sea, so the planks run
// out to the berth), and after dark the light of its four lanterns pooled on
// the boards round their posts (see ship_deck.gdshaderinc).
shader_type spatial;
render_mode cull_back;

// the lanterns' footprints (TradePort.LANTERNS, each 0.6 m seaward of its post)
const vec2 TOWN_LAMPS[4] = { vec2(-25.0, -0.3), vec2(-11.0, -0.3), vec2(7.6, -0.3), vec2(24.0, -6.9) };
#define TOWN_POOLS TOWN_LAMPS
#include "res://shaders/inc/ship_deck.gdshaderinc"
