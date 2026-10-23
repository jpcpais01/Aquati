// Rain (src/fx/rain.gd): a buffer of drop quads animated entirely here.
// Each drop has a fixed random slot in a world-locked tile wrapped round the
// view, so drops stay put in the world while she sails through them. It
// falls, slants with the wind and is drawn out into a fine streak along its
// velocity (about what a camera's shutter would smear); most then burst on
// the swell into a little ring and crown of spray, riding the very waves the
// ocean draws. The drops gather into the same drifting curtains as the rain's
// haze (veil_patch), so showers sweep across the sea in sheets instead of
// hanging as an even hatching. Drops past the count drawn fold to a point.
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled, world_vertex_coords;

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/sea_height.gdshaderinc"
#include "res://shaders/inc/fx_tile.gdshaderinc"

/// Share of each drop's cycle spent falling; the rest is its splash.
const float FALL = 0.86;

/// the drops' clock (s), how many are drawn, and the rain's weight (0..1)
uniform float now = 0.0;
uniform int drops = 0;
uniform float amount = 0.0;
/// the tile's middle (the camera's target, x and z)
uniform vec2 center = vec2(0.0);
/// the wind's push on a falling drop (m/s, x and z), and the drops' size
uniform vec2 fall = vec2(0.0);
uniform float scale = 1.0;

varying vec3 v_r;
varying float v_a;
varying float v_dist;

void vertex() {
	int id = VERTEX_ID / 4;
	int ci = VERTEX_ID % 4;
	if (id >= drops) {
		// folded to a point: nothing to draw (writing POSITION would take over every vertex)
		VERTEX = vec3(0.0, -1e4, 0.0);
	} else {
		vec2 corner = vec2((ci & 1) == 1 ? 1.0 : -1.0, float(ci >> 1));
		vec4 seed = seed4(id);
		// a fixed cycle keeps every drop's phase steady while the tile grows
		// and shrinks with the zoom; on screen the speed looks the same
		float cyc = 1.45 + seed.w * 0.4;
		float t = now + seed.z * cyc;
		float k = fract(t / cyc);
		float n = floor(t / cyc);
		vec2 bx = born_box(n, cyc, seed.z);
		float B = bx.x * 2.0;
		float H = bx.y;
		// 0 the cloud base .. 1 the sea
		float kf = min(k / FALL, 1.0);
		vec2 drift = fall * kf * cyc * FALL;
		// a fresh slot in the tile every fall
		vec2 p0 = fract(seed.xy + vec2(0.6180339, 0.4142135) * n) * B + drift;
		vec2 rel = mod(p0 - center + B * 0.5, B) - B * 0.5;
		vec2 xz = center + rel;
		// thinned out toward the tile's edges, gathered into the drifting curtains
		vec2 e = abs(rel) / (B * 0.5);
		float edge = 1.0 - smoothstep(0.7, 1.0, max(e.x, e.y));
		float curtain = smoothstep(0.25, 1.35, veil_patch(xz));
		vec3 cam = CAMERA_POSITION_WORLD;
		vec3 p;
		if (k < FALL) {
			vec3 head = vec3(xz.x, H * (1.0 - kf), xz.y);
			vec3 vel = vec3(fall.x, -H / (cyc * FALL), fall.y);
			float speed = length(vel);
			vec3 dir = vel / speed;
			float dist = length(cam - head);
			// the smear of a fast shutter, never shorter than a few pixels
			float len = max(speed * 0.03, dist * 0.005) * (0.8 + seed.w * 0.5) * scale;
			p = head - dir * len * corner.y;
			// (straight down the view a drop is end-on: any side will do)
			vec3 side = cross(dir, normalize(cam - p));
			side = dot(side, side) > 1e-6 ? normalize(side) : vec3(1.0, 0.0, 0.0);
			p += side * corner.x * max(0.016, dist * 0.0009);
			v_r = vec3(corner.x, corner.y, -1.0);
			v_a = edge * smoothstep(0.0, 0.08, kf) * (0.5 + seed.w * 0.5) * curtain;
		} else {
			// the splash: a ring and a crown of droplets thrown up off the swell
			// (not every drop: rain falls into the troughs and the foam too)
			float s = (k - FALL) / (1.0 - FALL);
			vec2 slope;
			vec3 c = vec3(xz.x, sea_height(xz, sea_floor(xz), slope) + 0.12, xz.y);
			float dist = length(cam - c);
			float r = (0.18 + 0.45 * s) * (0.7 + seed.x * 0.6) * max(1.0, dist * 0.0052) * scale;
			// laid flat on the water, as the ring is
			vec2 q = vec2(corner.x, corner.y * 2.0 - 1.0);
			p = c + vec3(q.x, 0.0, q.y) * r;
			v_r = vec3(q, s);
			v_a = edge * step(0.42, seed.y) * curtain * (0.6 + 0.4 * amount);
		}
		v_dist = length(p - cam);
		VERTEX = p;
	}
}

void fragment() {
	// lit by the sky: pale silver by day, near-invisible at night until lightning
	vec3 lit = light_tint * 0.9 + 0.04 + vec3(0.9, 0.95, 1.1) * sky_fx.y * 1.6;
	float a;
	vec3 col;
	if (v_r.z < 0.0) {
		// a fine streak, brightest just behind the drop
		float x = v_r.x;
		a = v_a * (1.0 - x * x) * (0.5 + 0.5 * (1.0 - v_r.y)) * (0.22 + 0.12 * amount);
		col = vec3(0.8, 0.86, 0.94) * lit;
	} else {
		// the ring spreads and thins; the crown is a few bright flecks at the start
		float s = v_r.z;
		float r = length(v_r.xy);
		float w = (r - (0.3 + 0.62 * s)) / (0.09 + 0.06 * s);
		float ring = exp(-w * w);
		float crown = smoothstep(0.42, 0.0, r) * smoothstep(0.45, 0.0, s);
		a = v_a * (ring * 0.4 + crown * 0.9) * (1.0 - s) * (1.0 - s);
		col = vec3(0.92, 0.96, 1.0) * lit;
	}
	if (a < 0.003) {
		discard;
	}
	col = mix(col, fog_color, smoothstep(fog_range.x, fog_range.y, v_dist) * 0.7);
	ALBEDO = col * a;
	ALPHA = a;
}
