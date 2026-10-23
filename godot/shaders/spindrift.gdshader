// Spindrift (src/fx/spindrift.gd): in a blow the wind tears the tops off the
// breaking crests and flings them downwind as sheets of spray. A buffer of
// sheet quads animated entirely here, like the rain: each sheet has a slot
// in a world-locked tile round the view and, once a cycle, a fresh spot in
// it. It only bursts if the swell there was cresting the moment it was born
// (the very trains the ocean draws), more readily under a gust, so the spray
// leaps off the caps you can see; then it streams away down the wind,
// rising, spreading and fraying into streaks until it is gone. Sheets past
// the count drawn, and those born in a trough, fold to a point.
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled, world_vertex_coords;

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/wind.gdshaderinc"
#include "res://shaders/inc/fx_tile.gdshaderinc"

/// The swell's trains (Waves.packed_a, packed_b).
uniform vec4 wave_a[8];
uniform vec4 wave_b[8];
/// the sheets' clock (s), how many are drawn, and the blow (0..1)
uniform float now = 0.0;
uniform int sheets = 0;
uniform float amount = 0.0;
/// the tile's middle (the camera's target, x and z)
uniform vec2 center = vec2(0.0);
/// how fast the wind carries the spray off (m/s)
uniform float speed = 14.0;

varying vec3 v_r;
varying float v_a;
varying float v_seed;
varying float v_dist;

void vertex() {
	int id = VERTEX_ID / 4;
	int ci = VERTEX_ID % 4;
	vec3 cam = CAMERA_POSITION_WORLD;
	vec3 p = vec3(0.0, -1e4, 0.0);
	v_r = vec3(0.0);
	v_a = 0.0;
	v_seed = 0.0;
	if (id < sheets) {
		vec2 corner = vec2((ci & 1) == 1 ? 1.0 : -1.0, (ci & 2) == 2 ? 1.0 : -1.0);
		vec4 seed = seed4(id);
		float cyc = 2.2 + seed.w * 1.5;
		float t = now + seed.z * cyc;
		float k = fract(t / cyc);
		float n = floor(t / cyc);
		// the tile as it was when this sheet was born, so a zoom never moves it mid-flight
		float bx = born_box(n, cyc, seed.z).x;
		float B = bx * 2.0;
		vec2 p0 = fract(seed.xy + vec2(0.6180339, 0.4142135) * n) * B;
		vec2 rel = mod(p0 - center + B * 0.5, B) - B * 0.5;
		vec2 birth = center + rel;
		// was the sea cresting here when it was born? (each train's phase runs
		// down with time: back then it stood omega x the sheet's age higher)
		float age = k * cyc;
		float cam_d = length(cam.xz - birth);
		vec3 o = vec3(0.0);
		float crest = 0.0;
		for (int i = 0; i < 8; i++) {
			vec4 a = wave_a[i];
			vec4 b = wave_b[i];
			float A = a.w * (1.0 - smoothstep(14.0, 28.0, cam_d * a.z * 0.15915));
			float th = a.z * dot(a.xy, birth) + b.z + b.x * age;
			float s = sin(th);
			float co = cos(th);
			o += vec3(a.x * co * b.y * A, A * s, a.y * co * b.y * A);
			crest += b.y * a.z * A * s;
		}
		float gust = gust_at(birth);
		float str = smoothstep(0.14 - gust * 0.1, 0.4, crest + (seed.y - 0.5) * 0.2) * amount * (0.75 + gust * 0.5);
		vec2 e = abs(rel) / bx;
		str *= 1.0 - smoothstep(0.7, 1.0, max(e.x, e.y));
		if (str >= 0.01) {
			vec2 wd = wind.xy;
			// it leaps off the crest, then the wind takes it: fast at first, slowing as it spreads
			float sp = speed * (0.75 + seed.x * 0.5);
			float run = sp * cyc * k * (1.0 - 0.4 * k);
			vec2 c = birth + o.xz + wd * run;
			float lift = (1.2 + seed.y * 1.6) * sin(PI * min(k * 1.6, 1.0)) * (1.0 - 0.45 * k);
			vec3 ctr = vec3(c.x, max(o.y, 0.0) + 0.4 + lift, c.y);
			float L = mix(2.0, 11.0 + seed.w * 8.0, sqrt(k));
			float W = mix(0.9, 3.4 + seed.x * 2.2, k);
			vec3 ax = vec3(wd.x, 0.0, wd.y);
			// a ribbon along the wind, turned to face the eye about that axis
			vec3 side = cross(ax, normalize(cam - ctr));
			side = dot(side, side) > 1e-6 ? normalize(side) : vec3(-wd.y, 0.0, wd.x);
			p = ctr + ax * corner.x * L * 0.5 + side * corner.y * W * 0.5;
			v_r = vec3(corner, k);
			v_seed = seed.z;
			v_a = str * smoothstep(0.0, 0.1, k) * (1.0 - smoothstep(0.35, 1.0, k));
		}
	}
	v_dist = length(p - cam);
	VERTEX = p;
}

void fragment() {
	float k = v_r.z;
	// a soft spindle, densest at its head (the downwind end)
	float x = v_r.x;
	float y = v_r.y;
	float body = (1.0 - y * y) * smoothstep(1.0, 0.55, abs(x)) * (0.55 + 0.45 * smoothstep(-1.0, 0.6, x));
	// torn into streaks along the wind, fraying as it ages
	vec2 nu = vec2(x * 0.3 - k * 0.25 + v_seed * 7.13, y * 0.75 + v_seed * 3.71);
	float n1 = texture(cloud_noise, nu).g;
	float n2 = texture(cloud_noise, nu * vec2(1.7, 2.2) + 0.37).a;
	float dens = body * (n1 * 0.65 + n2 * 0.55) - (0.3 + k * 0.26);
	float a = smoothstep(0.0, 0.38, dens) * v_a * 0.85;
	if (a < 0.003) {
		discard;
	}
	vec3 col = vec3(0.9, 0.95, 1.0) * (light_tint * 0.95 + 0.03) + sun_color * 0.04 + vec3(0.6, 0.66, 0.9) * sky_fx.y;
	col = mix(col, fog_color, smoothstep(fog_range.x, fog_range.y, v_dist) * 0.7);
	ALBEDO = col * a;
	ALPHA = a;
}
