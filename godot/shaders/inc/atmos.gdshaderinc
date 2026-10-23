// The air: the sky's colour along a direction, the haze distant things sink
// into, and how much of it lies between the eye and a point; the cloud deck
// whose shadows drift over the sea and the islands and which the sea
// mirrors; and the weather lying low on the water (sea mist, curtains of
// rain). Shared by the sky, the sea and everything standing on it, so a
// reflection, a shadow, the horizon and a far island all agree. The CPU side
// is src/world/atmosphere.gd.
//
// Light levels follow three.js' physical lights, which the look was tuned
// under: sun_color is the key light's irradiance (a clear noon is about 3.8),
// so a lit white surface reads sun_color / PI.
#ifndef ATMOS_INC
#define ATMOS_INC

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
/// x, y the direction the wind blows toward (x, z), z its strength (0 calm .. 1 a stiff breeze)
global uniform vec4 wind;
/// how far the air has carried a cloud or a ripple (m), for patterns that drift downwind
global uniform vec2 wind_drift;
/// the noise every cloud, curtain of rain and bank of mist is drawn from (art/noise.png)
global uniform sampler2D cloud_noise : filter_linear_mipmap, repeat_enable;
/// the cloud deck: xy how far it has drifted (cloud-field uv), z the field's
/// threshold for the cover (cloud_lo), w how tall its heaps stand (m)
global uniform vec4 clouds;
/// x how wet everything is (lags the rain), y the lightning's flash, z a
/// mirror calm (0..1), w a scorching noon's heat (0..1)
global uniform vec4 sky_fx;
/// the weather lying low on the water (veil_at): x its density at sea level
/// (1/m), y its height scale (m), z how patchy it lies (0 an even sheet .. 1
/// banks with clear water between), w how fast its patches drift (m/s)
global uniform vec4 veil;
/// a lightning strike lighting the sea round it: xy where (x, z), z its reach (m), w its light
global uniform vec4 strike;

/// the cloud deck's flat base (m), and its field's uv per metre of ground
const float CLOUD_ALT = 700.0;
const float CLOUD_UV = 0.0011;
/// lightning's colour, lighting the deck, the rain and the murk from inside
const vec3 FLASH = vec3(0.62, 0.7, 0.95);

// The open sky along d: the keyframed zenith and horizon colours shaped the
// way real air scatters light. Deep blue overhead paling into a bright band of
// thick air at the horizon, a touch richer toward and away from the sun than
// at right angles to it, and a warm glow round the sun itself. (sky_air
// leaves out lightning's flash: the sky's radiance map, redrawn now and then,
// must never catch one and hold it.)
vec3 sky_air(vec3 d, float flash) {
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
	// lightning lights the whole cloud deck from inside
	col += FLASH * flash * (0.5 + 0.5 * hp);
	// below the horizon: a deep sea tint, so reflections stay grounded
	col = mix(col, vec3(0.06, 0.2, 0.3) * light_tint, smoothstep(0.0, -0.25, h));
	return col;
}

vec3 sky_color(vec3 d) {
	return sky_air(d, sky_fx.y);
}

// The colour of the air in front of something far off along d: the horizon
// haze, warm toward the sun and cooler away from it (and lit by a flash).
vec3 haze_air(vec3 d, float flash) {
	float mu = dot(normalize(vec3(d.x, max(d.y, 0.0) * 0.4, d.z) + vec3(0.0, 1e-4, 0.0)), sun_dir);
	float sd = max(mu, 0.0);
	float s2 = sd * sd;
	return fog_color * (0.94 + 0.08 * mu * mu) + haze * (s2 * s2 * sd * 0.26 + pow(sd, 40.0) * 0.3)
			+ FLASH * flash * 0.3;
}

vec3 haze_color(vec3 d) {
	return haze_air(d, sky_fx.y);
}

// How much of the haze lies between the eye and a point dist away at height y:
// nothing close by, then it thickens, thinnest up high so peaks stand out.
float aerial_at(float dist, float y) {
	float near = fog_range.x * 0.8;
	float r = max(dist - near, 0.0) / max(fog_range.y - near, 1.0);
	float a = 1.0 - exp(-r * r * 2.2 - r * 0.5);
	return a * mix(1.0, 0.72, smoothstep(12.0, 170.0, y));
}

// ---- the cloud deck: one noise field shared by the sky, its reflection in
// the sea and the shadows drifting across the water and the islands. Fair
// weather cumulus sit the way they really do: weather systems a couple of
// kilometres across that gather clouds in some quarters and leave wide blue
// gaps in others, one rounded heap per cell (about 600 m apart), and billows
// that lump each heap into cauliflower. Above clouds.z there is cloud; how far
// above sets how high it heaps.
float cloud_field(vec2 uv) {
	float sys = texture(cloud_noise, uv * 0.13 + vec2(0.61, 0.17)).r;
	float cell = 1.0 - texture(cloud_noise, uv * 0.11 + vec2(0.13, 0.57)).b;
	float bil = texture(cloud_noise, uv * 0.83 + vec2(0.37, 0.71)).r;
	return cell * 0.5 + (sys - 0.5) * 1.6 + (bil - 0.5) * 0.55 + 0.25;
}

// 0 at a cloud's rim .. 1 at its core
float heap_k(float n, float lo) {
	return clamp((n - lo) * 3.3, 0.0, 1.0);
}

// where the deck above ground point xz casts its shadow from
vec2 cloud_ground_uv(vec2 xz) {
	return (xz - sun_dir.xz / max(sun_dir.y, 0.2) * CLOUD_ALT) * CLOUD_UV + clouds.xy;
}

// the field's uv where a ray from p along d meets the deck at altitude alt
// (dist: how far along the ray)
vec2 cloud_uv(vec3 p, vec3 d, float alt, out float dist) {
	dist = (alt - p.y) / max(d.y, 0.012);
	return cloud_ground_uv(p.xz + d.xz * dist);
}

// the deck where a reflected ray meets its base: x coverage, y thickness, z sunlight
vec3 cloud_sample_lite(vec2 uv) {
	float lo = clouds.z;
	float dn = cloud_field(uv);
	return vec3(smoothstep(lo, lo + 0.06, dn), smoothstep(lo, lo + 0.2 + weather.x * 0.2, dn), 0.6);
}

// Lit cloud seen along d, for the sea's mirror: sunny where thin, sinking to
// a blue-grey belly lit only by the sky where thick; toward the sun the whole
// deck takes a silver forward-scattered rim.
vec3 cloud_color(vec3 c, vec3 d) {
	float mu = dot(d, sun_dir);
	float m2 = max(mu, 0.0) * max(mu, 0.0);
	float fwd = m2 * m2 * m2 * m2;
	vec3 sky = mix(sky_horizon, sky_zenith, 0.4) * 0.55 + light_tint * 0.32;
	vec3 amb = sky * (1.05 - c.y * (0.5 + weather.z * 0.25));
	float tr = c.z * exp(-c.y * 2.0);
	vec3 sun = sun_color * tr * (0.3 + 0.22 * max(mu, 0.0) + fwd * 1.1);
	// moonlit cloud is a dim silver-grey against the night, never a glowing sheet
	return (amb + sun) * (1.0 - night * 0.55) + FLASH * sky_fx.y * 0.6;
}

// How much of the sun gets through the deck over ground point xz: the very
// field the sky draws, so every shadow belongs to a cloud above; crisp at the
// rim, deepest under the tall cores. A few puffs on a clear day, a solid
// deck in a storm.
float cloud_shadow(vec2 xz) {
	float lo = clouds.z;
	float n = cloud_field(xz * CLOUD_UV + clouds.xy);
	return 1.0 - smoothstep(lo - 0.01, lo + 0.05, n) * (0.34 + 0.18 * smoothstep(lo, lo + 0.25, n));
}

// ---- weather lying low on the water: banks of sea mist, curtains of rain.
// Where it lies thick and where it opens up (the rain draws its curtains from
// this too, so the drops fall where the murk is).
float veil_patch(vec2 xz) {
	vec2 d = wind_drift * veil.w;
	float n = texture(cloud_noise, xz * 0.0013 - d * 0.0013 + vec2(0.31, 0.77)).r * 0.6
			+ texture(cloud_noise, xz * 0.0047 - d * 0.0047 * 1.3 + vec2(0.71, 0.13)).g * 0.4;
	// the noise hugs 0.5: stretch it into banks and gaps
	float bank = smoothstep(0.34, 0.68, n);
	return mix(1.0, bank * 1.75 + 0.06, veil.z);
}

// How much of the light from wp the low weather hides from the eye. Its
// density falls away with height, so from up high you look down through it
// (a veil over the sea, thinner over the masts) and from the deck you look
// into it; and it lies in drifting patches, so the view sails in and out of
// banks with clear water between instead of sinking into one even wall.
float veil_at(vec3 wp, vec3 eye) {
	if (veil.x <= 0.0) {
		return 0.0;
	}
	float H = veil.y;
	float yc = max(eye.y, 0.0);
	float yp = max(wp.y, 0.0);
	float dy = yc - yp;
	// the mean of exp(-y / H) along the ray
	float e = abs(dy) > 0.05 ? H * (exp(-yp / H) - exp(-yc / H)) / dy : exp(-yp / H);
	float tau = veil.x * length(wp - eye) * e * veil_patch(wp.xz);
	return 1.0 - exp(-tau);
}

// FOG for a surface at world point wp seen from the camera at eye: the air,
// and the low weather on the water.
vec4 air_fog(vec3 wp, vec3 eye) {
	vec3 d = wp - eye;
	float dist = length(d);
	float a = aerial_at(dist, wp.y);
	float v = veil_at(wp, eye);
	return vec4(haze_color(d / max(dist, 1e-3)), 1.0 - (1.0 - a) * (1.0 - v));
}

#endif
