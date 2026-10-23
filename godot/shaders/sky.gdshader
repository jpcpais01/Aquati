// The sky dome: the scattering sky of shaders/inc/atmos.gdshaderinc, high
// cirrus on fair days, the bellies of the cumulus overhead (whose shadows are
// the very ones drifting across the sea and the islands), a hot
// limb-darkened sun hidden by any cloud, and a horizon that melts into the
// far, hazed sea; by night the stars, the Milky Way, the odd shooting star
// and the moon in its phase (night_sky.gdshaderinc), shining through the
// gaps in the clouds. The sea mirrors the very same sky_color(), so the two
// always agree.
//
// The radiance pass (ambient and reflections for ships and islands) is the
// clear air alone: the key light stands in for the sun's disc there, the
// weather's grey is in the palette already, and a flash of lightning is the
// environment's own (Atmosphere.apply), never caught and held in the map.
shader_type sky;

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/night_sky.gdshaderinc"

/// Bumped by the game to have the radiance map redrawn as the hour turns
/// (the sky reads the hour from shader globals, which don't mark it dirty).
uniform float revision = 0.0;

// The cumulus overhead, seen from below as their flat bellies: grey and
// dense in the core, glowing at the thin rims where the sun gets through,
// with the sunlit crowns of the tall ones peeping past the rims.
vec4 deck(vec3 ro, vec3 d, vec3 hz) {
	float lo = clouds.z;
	float H = clouds.w;
	float db;
	float dt;
	vec2 uv_b = cloud_uv(ro, d, CLOUD_ALT, db);
	vec2 uv_t = cloud_uv(ro, d, CLOUD_ALT + H * 0.6, dt);
	float fine = texture(cloud_noise, uv_b * 3.1 + vec2(0.29, 0.83)).g;
	float n_b = cloud_field(uv_b) + (fine - 0.5) * 0.14;
	float k_b = heap_k(n_b, lo);
	// only the taller cores reach the crown slice, so it is narrower
	float k_t = heap_k(cloud_field(uv_t), lo + 0.1);
	// how much cloud stands between the belly and the sun
	vec2 ls = sun_dir.xz / max(sun_dir.y, 0.12);
	float k_s = heap_k(cloud_field(uv_b + ls * (CLOUD_UV * 140.0)), lo);
	float mu = dot(d, sun_dir);
	float m2 = max(mu, 0.0) * max(mu, 0.0);
	float fwd = m2 * m2 * m2;
	vec3 sky_amb = mix(sky_horizon, sky_zenith, 0.5) * 0.95 + light_tint * 0.1;
	vec3 sea_amb = vec3(0.1, 0.16, 0.2) * light_tint + sky_amb * 0.42;
	float dim = 1.0 - weather.z * 0.5 - weather.y * 0.12;
	float through = exp(-(k_b + k_s) * 2.2);
	vec3 belly = (sea_amb * (1.15 - k_b * 0.3) + sun_color * (through * (0.16 + fwd * 1.1) + 0.05)) * dim;
	// a closed deck still has its rolls: thicker under the heavy ones, thinner between
	belly *= 1.0 - smoothstep(lo + 0.3, lo + 1.1, n_b) * 0.6 * smoothstep(0.6, 1.0, weather.x);
	vec3 crown = (sky_amb + sun_color * (0.52 + fwd * 0.3)) * dim;
	float dark = 1.0 - night * 0.55;
	belly = mix(belly * dark, hz, 1.0 - exp(-db * 0.000042));
	crown = mix(crown * dark, hz, 1.0 - exp(-dt * 0.000042));
	belly += FLASH * sky_fx.y * 0.7;
	// by moonlight the thin rims of the clouds drifting before the moon burn silver
	float m14 = m2 * m2 * m2 * m2 * m2 * m2 * m2;
	belly += sun_color * m14 * (1.0 - smoothstep(0.0, 0.45, k_b)) * 3.5 * night * (1.0 - weather.x * 0.6);
	float fade = smoothstep(0.0, 0.06, d.y);
	float a_t = smoothstep(0.0, 0.15, k_t) * fade * (1.0 - smoothstep(0.6, 0.95, weather.x));
	float a_b = smoothstep(0.0, 0.16, k_b) * fade;
	vec3 col = mix(crown, belly, a_b);
	return vec4(col, 1.0 - (1.0 - a_t) * (1.0 - a_b));
}

void sky() {
	vec3 d = EYEDIR;
	float h = d.y;
	vec3 hz = haze_air(d, AT_CUBEMAP_PASS ? 0.0 : sky_fx.y);
	vec3 col;
	if (AT_CUBEMAP_PASS) {
		col = sky_air(vec3(d.x, max(h, 0.0), d.z), 0.0);
	} else {
		col = sky_color(vec3(d.x, max(h, 0.0), d.z));
		// above the clouds: the stars, the galaxy and the moon, each star a
		// pixel across however far the lens zooms (pix: one pixel, in radians)
		float pix = length(fwidth(d)) * 0.75;
		vec3 stars = night_sky(d, pix, col);
		vec4 mn = moon_disc(d, pix);
		stars = stars * (1.0 - mn.a) + mn.rgb;
		// the faint airglow banding the horizon on the darkest nights
		stars += vec3(0.006, 0.011, 0.007) * night * exp(-max(h, 0.0) * 14.0) * (1.0 - weather.x);
		float cover = 0.0;
		if (h > 0.0) {
			vec3 eye = POSITION;
			// high cirrus: faint streaks combed out along the wind, here and there, in fair weather
			float dc;
			vec2 uv_c = cloud_uv(eye, d, 2600.0, dc) * 0.3;
			vec2 wd = normalize(wind.xy + vec2(1e-4));
			vec2 cs = vec2(dot(uv_c, wd) * 0.3, dot(uv_c, vec2(-wd.y, wd.x)) * 1.6);
			float ci = texture(cloud_noise, cs + clouds.xy * 0.4).g;
			float patchy = smoothstep(0.5, 0.75, texture(cloud_noise, uv_c * 0.35 + 0.5).r);
			float cirrus = smoothstep(0.55, 0.85, ci) * patchy * (1.0 - smoothstep(0.3, 0.7, weather.x)) * smoothstep(0.04, 0.35, h);
			col += stars * (1.0 - cirrus * 0.6);
			float sd6 = pow(max(dot(d, sun_dir), 0.0), 6.0);
			col = mix(col, light_tint * 0.95 + sun_color * 0.1 * (0.6 + sd6), cirrus * 0.3 * (1.0 - night * 0.6));
			vec4 cu = deck(eye, d, hz);
			col = mix(col, cu.rgb, cu.a);
			cover = cu.a;
		}
		// the key light itself by day: a hot disc with a darkened limb, hidden
		// behind any cloud (once the key is the moon, the moon above stands in for it)
		float sd = max(dot(d, sun_dir), 0.0);
		float disc = smoothstep(0.99955, 0.99975, sd);
		float limb = 0.55 + 0.45 * smoothstep(0.99955, 0.99992, sd);
		float sun_key = step(dot(sun_dir, moon.xyz), 0.9999);
		col += sun_color * disc * limb * 7.0 * (1.0 - cover) * (1.0 - weather.w * 0.7) * (1.0 - night) * sun_key;
	}
	// low mist swallows the lower sky; the horizon melts into the far, hazed water
	col = mix(col, hz, weather.w * 0.75 * (1.0 - smoothstep(0.0, 0.5, h)));
	col = mix(col, hz, (1.0 - smoothstep(-0.015, 0.07, h)) * 0.9);
	COLOR = col + vec3(revision * 0.0);
}
