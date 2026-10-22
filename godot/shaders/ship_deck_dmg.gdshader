// ship_deck.gdshader for a ship that has been in a fight (see
// ship_damage.gdshaderinc): two-sided, its underside the dark deckhead seen
// from the hold.
shader_type spatial;
render_mode cull_disabled;

#define DAMAGE
#include "res://shaders/inc/ship_deck.gdshaderinc"
