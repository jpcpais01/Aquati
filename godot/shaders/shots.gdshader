// Cannonballs: an iron ball and the hot streak of air it drags behind it.
// Each ball is written once when it leaves the barrel (where, how fast, when)
// and flies on here in closed form under gravity, so a broadside costs one
// buffer write and nothing per frame afterwards; the CPU walks the same arc to
// find what it hits and writes the moment it stops.
//
// Instance packing (src/game/shots.gd):
//   MODEL_MATRIX[3].xyz  muzzle position     MODEL_MATRIX[0].xyz  launch velocity
//   INSTANCE_CUSTOM      launch time, time it stops, seed
// The mesh is two quads: the streak (VERTEX.z 0: x along the flight, tail to
// head, y across) and the ball (VERTEX.z 1), a billboard drawn as a sphere.
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

#include "res://shaders/inc/atmos.gdshaderinc"

/// The shots' own clock (s), which shots.gd keeps from growing large.
uniform float now = 0.0;
uniform float gravity = 14.0;
/// Seconds of flight the streak trails behind the ball, and its width (m).
uniform float streak_time = 0.075;
uniform float streak_width = 0.42;
uniform float ball_radius = 0.2;

varying vec2 v_uv;
varying float v_ball;
varying float v_str;
varying vec3 v_world;

void vertex() {
	float t = now - INSTANCE_CUSTOM.x;
	float stop = INSTANCE_CUSTOM.y - INSTANCE_CUSTOM.x;
	if (t < 0.0 || t >= stop) {
		POSITION = vec4(2.0, 2.0, 2.0, 1.0);
	} else {
		vec3 p0 = MODEL_MATRIX[3].xyz;
		vec3 v0 = MODEL_MATRIX[0].xyz;
		vec3 head = p0 + v0 * t - vec3(0.0, 0.5 * gravity * t * t, 0.0);
		vec3 vel = v0 - vec3(0.0, gravity * t, 0.0);
		vec3 w;
		v_ball = VERTEX.z;
		if (VERTEX.z > 0.5) {
			// the ball: a little camera-facing card, shaded as a sphere
			vec3 right = normalize(INV_VIEW_MATRIX[0].xyz);
			vec3 up = normalize(INV_VIEW_MATRIX[1].xyz);
			w = head + (right * VERTEX.x + up * VERTEX.y) * ball_radius * 2.0;
			v_uv = VERTEX.xy * 2.0;
		} else {
			// grows out of the muzzle, then a fixed slice of the flight path
			vec3 tail = head - vel * min(t, streak_time);
			float along = VERTEX.x + 0.5;
			w = mix(tail, head, along);
			vec3 axis = head - tail + vec3(1e-5);
			vec3 side = cross(axis, CAMERA_POSITION_WORLD - w);
			float sl = length(side);
			side = sl > 1e-5 ? side / sl : vec3(1.0, 0.0, 0.0);
			// thicker toward the ball, a hair past it so the head is rounded
			w += side * VERTEX.y * streak_width * (0.45 + 0.55 * along);
			w += normalize(axis) * streak_width * 0.5 * step(0.99, along);
			v_uv = vec2(along, VERTEX.y * 2.0);
		}
		// fades as the shot slows and drops
		v_str = max(0.35, 1.0 - t * 0.18);
		v_world = w;
		POSITION = PROJECTION_MATRIX * (VIEW_MATRIX * vec4(w, 1.0));
	}
}

void fragment() {
	vec4 fog = air_fog(v_world, CAMERA_POSITION_WORLD);
	float f = fog.a * 0.85;
	if (v_ball > 0.5) {
		// dark iron with a hard little highlight off the sun
		float r2 = dot(v_uv, v_uv);
		if (r2 > 1.0) {
			discard;
		}
		vec3 n = vec3(v_uv.x, v_uv.y, sqrt(1.0 - r2));
		vec3 sun_v = normalize((VIEW_MATRIX * vec4(sun_dir, 0.0)).xyz);
		float diff = max(dot(n, sun_v), 0.0);
		float spec = pow(max(dot(reflect(-sun_v, n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0);
		vec3 col = vec3(0.05, 0.05, 0.055) * light_tint * (0.55 + 0.45 * n.y) + sun_color * (diff * 0.03 + spec * 0.35);
		float a = 1.0 - smoothstep(0.82, 1.0, r2);
		ALBEDO = mix(col, fog.rgb, f) * a;
		ALPHA = a;
	} else {
		float across = 1.0 - v_uv.y * v_uv.y;
		float t = v_uv.x;
		float a = across * t * t * (0.38 + 0.25 * t) * v_str;
		if (a < 0.003) {
			discard;
		}
		// a hot core right behind the ball, fading into a pale wake
		float core = pow(max(across, 0.0), 6.0) * smoothstep(0.55, 1.0, t);
		vec3 wake = vec3(0.98, 0.97, 0.95) * light_tint;
		vec3 glow = vec3(3.2, 1.5, 0.45) * core * (0.25 + night * 0.9) * v_str;
		ALBEDO = mix(wake, fog.rgb, f) * a + glow * (1.0 - f);
		ALPHA = a;
	}
}
