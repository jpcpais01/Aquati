// ship_stern.gdshader for a ship that has been in a fight (see
// ship_damage.gdshaderinc), two-sided for a look into the hold, and with the
// cabin's lamps that go out when she's lost.
shader_type spatial;
render_mode cull_disabled;

#define DAMAGE
#include "res://shaders/inc/ship_stern.gdshaderinc"
