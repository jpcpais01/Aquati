// ship_deck_dmg.gdshader for the Hollow Jack crossed into the spirit world
// (Haunt's Phantom Run): her wounds as they were, thinned to a ghost (see
// ship_phantom.gdshaderinc), two-sided so her far side shows through her.
shader_type spatial;
render_mode cull_disabled;

#define DAMAGE
#define PHANTOM
#include "res://shaders/inc/ship_deck.gdshaderinc"
