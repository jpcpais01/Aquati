// Puerto Marézia's quay (src/port/home_port.gd): the trading ports' planking
// (UV in metres of the quay's own frame), and after dark the light of its
// five lanterns pooled on the boards round their posts (see
// ship_deck.gdshaderinc).
shader_type spatial;
render_mode cull_back;

// the lanterns' footprints (HomePort.LANTERNS, each 0.6 m seaward of its post)
const vec2 TOWN_LAMPS[5] = { vec2(-10.5, -0.5), vec2(9.5, -0.5), vec2(24.2, -7.6), vec2(-31.0, -7.9), vec2(12.6, -9.0) };
#define TOWN_POOLS TOWN_LAMPS
#include "res://shaders/inc/ship_deck.gdshaderinc"
