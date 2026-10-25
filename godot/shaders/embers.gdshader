// Ember rain (src/fx/embers.gd): one static buffer of quads, animated
// entirely here, like the rain. Most are flakes of grey ash, tumbling and
// fluttering down so they wink as they turn edge-on; about one in four is an
// ember still alight, glowing orange-gold and flickering, cooling to a dull
// red as it sinks and going out before it meets the sea. Every one has a
// fixed slot in a world-locked tile wrapped round the view and drifts on with
// the wind's own run (wind_drift), so the fall never jumps when the wind
// changes. They gather in the same drifting banks as the ash haze
// (veil_patch). More ash in the air just draws more of the buffer.
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled, world_vertex_coords;

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/fx_tile.gdshaderinc"

/// Half the tile's width, and the height the flakes fall from (m).
const float HALF = 140.0;
const float HEIGHT = 58.0;

/// the flakes' clock (s), how many are drawn, and the ash in the air (0..1)
uniform float now = 0.0;
uniform int flakes = 0;
uniform float amount = 0.0;
/// the tile's middle (the camera's target, x and z)
uniform vec2 center = vec2(0.0);

varying vec3 v_c;
varying float v_a;
varying float v_dist;

void vertex() {
	int id = VERTEX_ID / 4;
	int ci = VERTEX_ID % 4;
	if (id >= flakes) {
		VERTEX = vec3(0.0, -1e4, 0.0);
	} else {
		vec2 corner = vec2((ci & 1) == 1 ? 1.0 : -1.0, (ci >> 1) == 1 ? 1.0 : -1.0);
		vec4 seed = seed4(id);
		// embers spread evenly through the buffer, so a light fall still has a few
		seed.y = fract(float(id) * 0.618034);
		float ember = step(seed.y, 0.26);
		// ash drifts down slowly; a live ember, a little heavier, quicker
		float speed = mix(1.3 + seed.w * 0.9, 2.2 + seed.w * 0.8, ember);
		float cyc = HEIGHT / speed;
		float t = now + seed.z * cyc;
		float k = fract(t / cyc);
		float n = floor(t / cyc);
		float B = HALF * 2.0;
		// carried along on the wind's own run, and fluttering about it
		vec2 run = wind_drift * (1.6 + wind.z * 1.4);
		float ph = seed.x * 37.0 + seed.z * 11.0;
		vec2 flutter = vec2(sin(t * 0.9 + ph), cos(t * 0.7 + ph * 1.3)) * (1.2 - ember * 0.6);
		vec2 p0 = fract(seed.xy * vec2(1.0, 7.31) + vec2(0.6180339, 0.4142135) * n) * B + run + flutter;
		vec2 rel = mod(p0 - center + B * 0.5, B) - B * 0.5;
		vec2 xz = center + rel;
		vec2 e = abs(rel) / (B * 0.5);
		float edge = 1.0 - smoothstep(0.65, 1.0, max(e.x, e.y));
		float bank = smoothstep(0.15, 1.2, veil_patch(xz)) * 0.75 + 0.25;
		vec3 c = vec3(xz.x, HEIGHT * (1.0 - k) + sin(t * 1.3 + ph) * 0.4, xz.y);
		vec3 cam = CAMERA_POSITION_WORLD;
		float dist = length(cam - c);
		// never smaller than a pixel or so, however far the view pulls out
		float size = mix(0.09 + seed.x * 0.08, 0.07, ember);
		size = max(size, dist * mix(0.0024, 0.0022, ember));
		vec3 to_cam = normalize(cam - c);
		vec3 side = normalize(cross(to_cam, abs(to_cam.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
		vec3 up = cross(side, to_cam);
		// a flake turns as it falls: it narrows edge-on, and winks
		float turn = ember > 0.5 ? 1.0 : abs(sin(t * (1.6 + seed.w * 2.0) + ph));
		vec3 p = c + (side * corner.x * (0.35 + 0.65 * turn) + up * corner.y) * size * mix(1.0, 2.6, ember);
		v_c = vec3(corner, ember);
		// the ember cools as it sinks: bright gold high up, a dull red low down
		float heat = ember * (1.0 - smoothstep(0.55, 0.92, k)) * (0.65 + 0.35 * sin(t * (9.0 + seed.w * 7.0) + ph));
		v_a = edge * bank * smoothstep(0.0, 0.05, k) * (1.0 - smoothstep(0.93, 1.0, k)) * mix(0.35 + 0.4 * turn, heat, ember);
		v_dist = length(p - cam);
		VERTEX = p;
	}
}

void fragment() {
	float r = length(v_c.xy);
	float a;
	vec3 col;
	if (v_c.z > 0.5) {
		// a hot core in a soft halo; it lights itself, and barely covers anything
		float core = smoothstep(0.42, 0.0, r);
		float halo = exp(-r * r * 5.0) * 0.5;
		a = (core + halo) * v_a * 0.55;
		col = mix(vec3(2.6, 0.55, 0.08), vec3(5.0, 2.6, 0.7), core) * mix(2.0, 1.6, night);
		if (a < 0.003) {
			discard;
		}
		ALBEDO = col * a;
		ALPHA = a * 0.15;
	} else {
		// a flake of ash: soft-edged and a little ragged, lit by the sky
		a = smoothstep(1.0, 0.45, r + sin(atan(v_c.y, v_c.x) * 3.0 + v_a * 9.0) * 0.12) * v_a * 0.8;
		col = vec3(0.55, 0.53, 0.5) * (light_tint * 0.85 + 0.05);
		if (a < 0.003) {
			discard;
		}
		col = mix(col, fog_color, smoothstep(fog_range.x, fog_range.y, v_dist) * 0.6);
		ALBEDO = col * a;
		ALPHA = a;
	}
}
