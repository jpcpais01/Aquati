// The glow round a ship's lights after dark. The web game's bloom spreads a
// lamp's light into the air round it; a phone has no bloom to spare, so each
// lantern and each window of the great cabin wears its own: a soft card
// turned to the eye, a hot heart with a warm fall-off, breathing with the
// flame. Close to, it is about the light's own size; far off it keeps a few
// pixels across, so a ship in the dark still shows her lights. A window only
// shines out aft, through its glass. It all comes on with the night and goes
// in the haze. Lit by nothing; added to the scene's light.
//
// The mesh (ShipModel._halo_mesh): four vertices per light, all at its
// centre; UV the card's corner (-1..1), UV2.x the light's size and UV2.y its
// seed, COLOR.r how bright it is and COLOR.g whether it is a window.
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

#include "res://shaders/inc/atmos.gdshaderinc"

/// a lantern's light, and the great cabin's (linear)
uniform vec3 lantern = vec3(1.0, 0.62, 0.27);
uniform vec3 window = vec3(1.0, 0.42, 0.08);

varying vec2 v_uv;
varying vec3 v_col;

void vertex() {
	vec3 c = (MODELVIEW_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float dist = length(c);
	vec3 w = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float seed = UV2.y;
	float breath = 0.93 + 0.07 * sin(TIME * 8.3 + seed * 9.0) * sin(TIME * 5.1 + seed * 4.0);
	float a = smoothstep(0.05, 0.8, night) * (1.0 - air_fog(w, CAMERA_POSITION_WORLD).a) * breath * COLOR.r;
	bool pane = COLOR.g > 0.5;
	if (pane) {
		// edge-on, a window hardly shows
		vec3 out_aft = normalize((MODELVIEW_MATRIX * vec4(0.0, 0.0, -1.0, 0.0)).xyz);
		a *= smoothstep(0.05, 0.6, dot(out_aft, -c / max(dist, 1e-3)));
	}
	v_col = (pane ? window : lantern) * a;
	v_uv = UV;
	if (a < 0.004 || dist < 0.3) {
		// by day (or with the eye in the lamp) the card folds out of sight
		POSITION = vec4(2.0, 2.0, 2.0, 1.0);
	} else {
		float r = 0.35 * UV2.x + dist * 0.0035;
		// drawn a little nearer the eye than the light, so its own cap and the rail behind don't cut it
		vec3 p = c + normalize(-c) * min(r, dist * 0.5) + vec3(UV * r, 0.0);
		POSITION = PROJECTION_MATRIX * vec4(p, 1.0);
	}
}

void fragment() {
	float r2 = dot(v_uv, v_uv);
	if (r2 >= 1.0) {
		discard;
	}
	float a = exp(-r2 * 12.0) * 0.32 + exp(-r2 * 3.0) * 0.07;
	a *= 1.0 - smoothstep(0.55, 1.0, r2);
	ALBEDO = v_col * a;
	ALPHA = 0.0;
}
