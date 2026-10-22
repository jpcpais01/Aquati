// The body of ship_deck.gdshader and ship_deck_dmg.gdshader (with DAMAGE
// defined: see ship_damage.gdshaderinc).

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/ship_common.gdshaderinc"

uniform vec3 c_plank : source_color = vec3(0.79, 0.63, 0.42);
uniform vec3 c_tar : source_color = vec3(0.16, 0.11, 0.07);

varying vec3 v_world;
#ifdef DAMAGE
#include "res://shaders/inc/ship_damage.gdshaderinc"
varying vec3 v_obj;
#endif

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
#ifdef DAMAGE
	v_obj = VERTEX;
#endif
}

void fragment() {
	// planks a quarter metre wide, laid in lengths of three to five metres
	float across = UV.x / 0.24;
	float col_i = floor(across);
	float plen = 3.0 + hash11(col_i * 1.7) * 2.0;
	float along = (UV.y + hash11(col_i) * 7.0) / plen;
	float pid = floor(along);
	vec3 col = c_plank * (0.84 + hash21(vec2(col_i, pid)) * 0.26);
	// grain and the odd darker board
	float grain = sin(UV.y * 11.0 + hash11(col_i + pid) * 20.0 + sin(UV.y * 1.3 + col_i) * 3.0) * 0.5 + 0.5;
	col *= 0.95 + 0.07 * grain;
	col *= 1.0 - 0.12 * step(0.93, hash21(vec2(pid, col_i * 3.0)));
	float seam = grid_line(across, 0.05);
	float butt = grid_line(along, 0.012 / plen * 3.0) * (1.0 - seam);
	col = mix(col, c_tar, seam * 0.85 + butt * 0.6);
	// treenails at each butt
	vec2 tn = vec2(fract(across), fract(along) * plen);
	float nail = (1.0 - smoothstep(0.035, 0.05, length(vec2(abs(tn.x - 0.5) - 0.25, min(tn.y, plen - tn.y) - 0.09)))) * (1.0 - smoothstep(0.3, 0.7, fwidth(across)));
	col *= 1.0 - nail * 0.4;
	float rough = 0.78;
#ifdef DAMAGE
	float metal = 0.0;
	bool drop;
	EMISSION = hull_damage(v_obj, FRONT_FACING, true, col, rough, metal, drop);
	if (drop) {
		discard;
	}
#endif
	ALBEDO = col;
	ROUGHNESS = rough;
	NORMAL = bump(NORMAL, VERTEX, -(seam + butt * 0.6) * 0.006);
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
