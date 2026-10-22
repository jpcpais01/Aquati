// The sky dome: the scattering sky of shaders/inc/atmos.gdshaderinc, a hot
// limb-darkened sun, and a horizon that melts into the far, hazed sea. The
// sea mirrors the very same sky_color(), so the two always agree.
//
// The radiance pass (ambient and reflections for ships and islands) leaves
// the sun's disc out: the key light itself stands in for it there.
shader_type sky;

#include "res://shaders/inc/atmos.gdshaderinc"

/// Bumped by the game to have the radiance map redrawn as the hour turns
/// (the sky reads the hour from shader globals, which don't mark it dirty).
uniform float revision = 0.0;

void sky() {
	vec3 d = EYEDIR;
	float h = d.y;
	vec3 col = sky_color(vec3(d.x, max(h, 0.0), d.z));
	if (!AT_CUBEMAP_PASS) {
		// the key light itself by day: a hot disc with a darkened limb
		float sd = max(dot(d, sun_dir), 0.0);
		float disc = smoothstep(0.99955, 0.99975, sd);
		float limb = 0.55 + 0.45 * smoothstep(0.99955, 0.99992, sd);
		col += sun_color * disc * limb * 7.0 * (1.0 - weather.w * 0.7) * (1.0 - night);
	}
	// low mist swallows the lower sky; the horizon melts into the far, hazed water
	vec3 hz = haze_color(d);
	col = mix(col, hz, weather.w * 0.75 * (1.0 - smoothstep(0.0, 0.5, h)));
	col = mix(col, hz, (1.0 - smoothstep(-0.015, 0.07, h)) * 0.9);
	COLOR = col + vec3(revision * 0.0);
}
