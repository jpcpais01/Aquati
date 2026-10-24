// A waypoint raised at sea (the web's src/game/waypoints.ts): a thin pillar
// of light standing on its spot, a needle-thin white-hot core in a soft
// sheath of the pin's colour with motes drifting up it and a slow pulse
// climbing it, and round its foot three ripples rolling out on the swell, a
// crisp ring and a pool of light. A new pin's light falls from the sky, a
// bright head leading it down, and splashes; a pin lifted dissolves upward
// from the sea, and one reached flares as it goes. Added to the scene's light,
// a light still glowing after dark, just not blindingly.
//
// Instance packing (src/game/waypoints.gd):
//   MODEL_MATRIX[3].xyz  the pin's foot (x, the ground under it or the sea's level, z)
//   COLOR                its colour (linear HDR) and how faded (a)
//   INSTANCE_CUSTOM      its age (s), a seed, the flare (reached), the dissolve 0..1
// The mesh: the ring, a grid (VERTEX.y 0, x and z -1..1) laid on the swell,
// and the pillar (y 1, x -0.5..0.5 across, z 0..1 up).
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

#include "res://shaders/inc/sea_height.gdshaderinc"

const float PILLAR = 165.0;
const float DROP = 1.1;

global uniform float sea_clock;
global uniform vec3 light_tint;

varying vec3 v_col;
varying vec2 v_uv;
varying float v_beam;
varying vec4 v_info;
varying float v_depth;

float sq(float v) {
	return v * v;
}

void vertex() {
	vec3 c = MODEL_MATRIX[3].xyz;
	v_info = INSTANCE_CUSTOM;
	v_col = COLOR.rgb * COLOR.a * (0.5 + 0.5 * clamp(dot(light_tint, vec3(0.3333)), 0.0, 1.0));
	vec3 w;
	if (VERTEX.y < 0.5) {
		// the ring: flat on the swell, breathing
		float breathe = 1.0 + 0.04 * sin(v_info.x * 1.9 + v_info.y * 20.0);
		float size = (11.0 + v_info.z * 10.0) * breathe;
		vec2 p = c.xz + VERTEX.xz * size;
		// on the swell at sea; ashore, on the ground it stands on
		vec2 slope;
		float sea = sea_height(p, sea_floor(p), slope);
		w = vec3(p.x, (c.y > 0.0 ? max(c.y, sea) : sea) + 0.14, p.y);
		v_uv = VERTEX.xz;
		v_beam = 0.0;
	} else {
		// the pillar: upright, turned to face the camera, and widening with
		// distance so it never thins to a flickering sub-pixel line
		vec3 to_cam = CAMERA_POSITION_WORLD - c;
		float dist = length(to_cam);
		to_cam.y = 0.0;
		vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), to_cam + vec3(1e-4, 0.0, 0.0)));
		float wd = max(2.2, dist * 0.0085) * (1.0 + v_info.z * 1.6);
		w = c + right * VERTEX.x * wd + vec3(0.0, VERTEX.z * PILLAR - 0.8, 0.0);
		v_uv = vec2(VERTEX.x + 0.5, VERTEX.z);
		v_beam = 1.0;
	}
	vec4 view = VIEW_MATRIX * vec4(w, 1.0);
	v_depth = -view.z;
	POSITION = COLOR.a <= 0.0 ? vec4(2.0, 2.0, 2.0, 1.0) : PROJECTION_MATRIX * view;
}

void fragment() {
	float age = v_info.x;
	float seed = v_info.y;
	float flare = v_info.z;
	float gone = v_info.w;
	float t = sea_clock + seed * 50.0;
	vec3 col;
	if (v_beam > 0.5) {
		float x = v_uv.x * 2.0 - 1.0;
		float y = v_uv.y;
		float m = y * PILLAR;
		// a needle-thin white-hot core inside a soft coloured sheath
		float core = exp(-x * x * 70.0);
		float sheath = exp(-x * x * 7.0) * 0.28;
		// motes of light drifting up the column
		float motes = smoothstep(0.82, 1.0, sin(m * 0.42 - t * 2.4)) * smoothstep(0.7, 1.0, sin(m * 0.13 + t * 0.7 + seed * 9.0));
		motes *= exp(-x * x * 16.0) * 0.9;
		// a slow pulse that climbs the whole pillar every few seconds
		float ph = fract(t * 0.085);
		float pulse = exp(-sq((y - ph) * 18.0)) * (1.0 - ph);
		float fall = pow(max(1.0 - y, 0.0), 1.5) * smoothstep(0.0, 0.004, y);
		float foot = exp(-m * 0.28) * exp(-x * x * 2.5) * 0.9;
		vec3 white = vec3(1.0, 0.97, 0.9);
		col = v_col * (sheath * (1.0 + pulse * 0.8) + motes + foot) + white * core * (0.55 + pulse * 0.9);
		col *= fall;
		// dropped in: the light falls from the sky, a bright head leading it down
		float grow = clamp(age / DROP, 0.0, 1.0);
		float front = sq(1.0 - grow);
		col *= smoothstep(front - 0.01, front + 0.01, y);
		col += (v_col + white) * exp(-sq((y - front) * 45.0)) * exp(-x * x * 6.0) * (1.0 - grow) * 2.0;
		// lifted: dissolves upwards from the sea
		col *= smoothstep(gone * 1.05 - 0.05, gone * 1.05, y);
		// thinned out right under the camera so it never hazes the view
		col *= smoothstep(4.0, 26.0, v_depth) * (1.0 + flare * 1.5);
	} else {
		float r = length(v_uv);
		if (r > 1.0) {
			discard;
		}
		// three ripples rolling outwards, a crisp inner ring and a pool of light
		float rip = 0.0;
		for (int i = 0; i < 3; i++) {
			float p = fract(t * 0.3 + float(i) / 3.0);
			rip += exp(-sq((r - p) * 16.0)) * sq(1.0 - p);
		}
		float ring = exp(-sq((r - 0.2) * 34.0));
		float pool = pow(1.0 - r, 4.0);
		// the splash as the light lands
		float sp = clamp((age - DROP * 0.8) / 1.2, 0.0, 1.0);
		float splash = exp(-sq((r - sp) * 12.0)) * (1.0 - sp) * step(0.001, sp) * 1.6;
		float grow = smoothstep(DROP * 0.7, DROP * 1.1, age);
		col = v_col * ((rip * 0.45 + ring * 0.5 + pool * 0.3) * grow + splash) * (1.0 - gone);
		col *= 1.0 - smoothstep(0.85, 1.0, r);
	}
	if (max(col.r, max(col.g, col.b)) < 0.002) {
		discard;
	}
	ALBEDO = col;
	ALPHA = 0.0;
}
