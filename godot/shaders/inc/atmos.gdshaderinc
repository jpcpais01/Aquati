// The air: the sky's colour along a direction, the haze distant things sink
// into, and how much of it lies between the eye and a point. Shared by the
// sky, the sea and everything standing on it, so a reflection, the horizon
// and a far island all agree. The CPU side is src/world/atmosphere.gd.
//
// Light levels follow three.js' physical lights, which the look was tuned
// under: sun_color is the key light's irradiance (a clear noon is about 3.45),
// so a lit white surface reads sun_color / PI.

global uniform vec3 sun_dir;
global uniform vec3 sun_color;
global uniform vec3 sky_zenith;
global uniform vec3 sky_horizon;
global uniform vec3 fog_color;
/// x where the air starts to thicken (m), y where it has swallowed the view
global uniform vec2 fog_range;
/// warm forward-scattered glow round the sun (cool round the moon)
global uniform vec3 haze;
/// the hour's and the weather's tint on light reaching into the water and shade (1 at a clear noon)
global uniform vec3 light_tint;
global uniform float night;
/// x cloud cover, y rain, z storm, w mist
global uniform vec4 weather;

// The open sky along d: the keyframed zenith and horizon colours shaped the
// way real air scatters light. Deep blue overhead paling into a bright band of
// thick air at the horizon, a touch richer toward and away from the sun than
// at right angles to it, and a warm glow round the sun itself.
vec3 sky_color(vec3 d) {
	float h = clamp(d.y, -1.0, 1.0);
	float hp = max(h, 0.0);
	float mu = dot(d, sun_dir);
	float sd = max(mu, 0.0);
	// the pale band of thick air is narrow: by twenty degrees up it is mostly blue
	vec3 col = mix(sky_horizon, sky_zenith, (1.0 - exp(-hp * 7.0)) * 1.001);
	// overhead the blue deepens and saturates; the cloudier, the less of it
	float clear = 1.0 - weather.x * 0.75;
	col = mix(col, col * vec3(0.82, 0.92, 1.08), smoothstep(0.25, 0.9, hp) * clear * (1.0 - night));
	col *= 0.93 + 0.11 * mu * mu;
	col += sky_horizon * exp(-hp * 18.0) * 0.1;
	// a broad multiple-scattering wash, the aureole and a tight hot corona
	float s2 = sd * sd;
	float s5 = s2 * s2 * sd;
	col += haze * (s5 * 0.17 + pow(sd, 48.0 + night * 90.0) * 0.8 + pow(sd, 700.0 + night * 1800.0) * (2.4 - night * 1.8));
	// below the horizon: a deep sea tint, so reflections stay grounded
	col = mix(col, vec3(0.06, 0.2, 0.3) * light_tint, smoothstep(0.0, -0.25, h));
	return col;
}

// The colour of the air in front of something far off along d: the horizon
// haze, warm toward the sun and cooler away from it.
vec3 haze_color(vec3 d) {
	float mu = dot(normalize(vec3(d.x, max(d.y, 0.0) * 0.4, d.z) + vec3(0.0, 1e-4, 0.0)), sun_dir);
	float sd = max(mu, 0.0);
	float s2 = sd * sd;
	return fog_color * (0.94 + 0.08 * mu * mu) + haze * (s2 * s2 * sd * 0.26 + pow(sd, 40.0) * 0.3);
}

// How much of the haze lies between the eye and a point dist away at height y:
// nothing close by, then it thickens, thinnest up high so peaks stand out.
float aerial_at(float dist, float y) {
	float near = fog_range.x * 0.8;
	float r = max(dist - near, 0.0) / max(fog_range.y - near, 1.0);
	float a = 1.0 - exp(-r * r * 2.2 - r * 0.5);
	return a * mix(1.0, 0.72, smoothstep(12.0, 170.0, y));
}

// FOG for a surface at world point wp seen from the camera at eye.
vec4 air_fog(vec3 wp, vec3 eye) {
	vec3 d = wp - eye;
	float dist = length(d);
	return vec4(haze_color(d / max(dist, 1e-3)), aerial_at(dist, wp.y));
}
