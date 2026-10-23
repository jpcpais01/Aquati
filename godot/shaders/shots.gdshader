// Shot in flight: the iron and the streak of hot air it drags behind it.
// Each ball is written once when it leaves the barrel (where, how fast, when,
// what it is) and flies on here in closed form under gravity, so a broadside
// costs one buffer write and nothing per frame afterwards; the CPU walks the
// same arc to find what it hits and writes the moment it stops.
//
// Instance packing (src/game/shots.gd):
//   MODEL_MATRIX[3].xyz  muzzle position     MODEL_MATRIX[0].xyz  launch velocity
//   INSTANCE_CUSTOM      launch time, time it stops, seed, kind (Ammo)
// The mesh is four quads: the streak (VERTEX.z 0: x along the flight, tail
// to head, y across), the ball (z 1, a billboard drawn as a sphere), and for
// chain shot only its second half-ball (z 2) and the chain slung between
// the two (z 3), cartwheeling square to the flight.
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

#include "res://shaders/inc/atmos.gdshaderinc"

/// The shots' own clock (s), which shots.gd keeps from growing large.
uniform float now = 0.0;
uniform float gravity = 14.0;
uniform float ball_radius = 0.2;

// By kind: round, shell, fire, chain, grape. The streak's tint and look
// (0 a pale air-wake, 1 a glowing tail, the fuse's or the red-hot iron's),
// how many seconds of flight it trails and its width (m); the ball's size
// (times a round shot's) and its iron.
const vec3 STREAK_TINT[5] = { vec3(0.0), vec3(2.4, 1.3, 0.45), vec3(3.4, 1.3, 0.32), vec3(0.0), vec3(0.0) };
const float STREAK_GLOW[5] = { 0.0, 1.0, 1.0, 0.0, 0.0 };
const float STREAK_TIME[5] = { 0.075, 0.09, 0.22, 0.05, 0.045 };
const float STREAK_WIDTH[5] = { 0.42, 0.36, 0.7, 0.62, 0.13 };
const float BALL_SIZE[5] = { 1.0, 1.12, 1.0, 0.8, 0.42 };
const vec3 IRON[5] = { vec3(0.05, 0.05, 0.055), vec3(0.075, 0.062, 0.052), vec3(0.3, 0.05, 0.012), vec3(0.068, 0.074, 0.084), vec3(0.11, 0.11, 0.115) };
/// The chain between chain shot's halves: dark iron, and its width (m).
const vec3 LINK_IRON = vec3(0.045, 0.045, 0.05);
const float LINK_WIDTH = 0.07;

varying vec2 v_uv;
/// 0 the streak, 1 a ball, 3 the chain.
varying float v_part;
varying float v_kind;
varying float v_str;
varying float v_flick;
varying vec3 v_world;

/// A strip from `a` to `b`, `width` across, turned to face the camera.
vec3 strip(vec3 a, vec3 b, float along, float across, float width, vec3 cam) {
	vec3 w = mix(a, b, along);
	vec3 side = cross(b - a + vec3(1e-5), cam - w);
	float sl = length(side);
	side = sl > 1e-5 ? side / sl : vec3(1.0, 0.0, 0.0);
	return w + side * across * width;
}

void vertex() {
	float t = now - INSTANCE_CUSTOM.x;
	float stop = INSTANCE_CUSTOM.y - INSTANCE_CUSTOM.x;
	int kind = clamp(int(INSTANCE_CUSTOM.w + 0.5), 0, 4);
	float part = VERTEX.z;
	// the second half-ball and the chain are chain shot's alone
	if (t < 0.0 || t >= stop || (part > 1.5 && kind != 3)) {
		POSITION = vec4(2.0, 2.0, 2.0, 1.0);
	} else {
		vec3 p0 = MODEL_MATRIX[3].xyz;
		vec3 v0 = MODEL_MATRIX[0].xyz;
		vec3 head = p0 + v0 * t - vec3(0.0, 0.5 * gravity * t * t, 0.0);
		vec3 vel = v0 - vec3(0.0, gravity * t, 0.0);
		float seed = INSTANCE_CUSTOM.z;
		// chain shot: two half-balls cartwheeling about the line of flight,
		// the chain paying out to its length as they leave the muzzle
		vec3 half_a = head;
		vec3 half_b = head;
		if (kind == 3) {
			vec3 side = normalize(vec3(-vel.z, 0.0, vel.x) + vec3(1e-5, 0.0, 0.0));
			vec3 up = normalize(cross(side, vel));
			float ang = seed * TAU + t * 26.0;
			float r = 0.55 + min(1.0, t * 6.0) * 0.35;
			vec3 off = (side * cos(ang) + up * sin(ang)) * r;
			half_a = head + off;
			half_b = head - off;
		}
		vec3 w;
		v_part = part > 2.5 ? 3.0 : (part > 0.5 ? 1.0 : 0.0);
		if (part > 2.5) {
			w = strip(half_b, half_a, VERTEX.x + 0.5, VERTEX.y, LINK_WIDTH, CAMERA_POSITION_WORLD);
			v_uv = vec2(VERTEX.x + 0.5, VERTEX.y * 2.0);
		} else if (part > 0.5) {
			// a ball: a little camera-facing card, shaded as a sphere
			vec3 c = part > 1.5 ? half_b : half_a;
			vec3 right = normalize(INV_VIEW_MATRIX[0].xyz);
			vec3 up = normalize(INV_VIEW_MATRIX[1].xyz);
			w = c + (right * VERTEX.x + up * VERTEX.y) * ball_radius * 2.0 * BALL_SIZE[kind];
			v_uv = VERTEX.xy * 2.0;
		} else {
			// grows out of the muzzle, then a fixed slice of the flight path,
			// thicker toward the ball, a hair past it so the head is rounded
			float sw = STREAK_WIDTH[kind];
			vec3 tail = head - vel * min(t, STREAK_TIME[kind]);
			float along = VERTEX.x + 0.5;
			w = strip(tail, head, along, VERTEX.y, sw * (0.45 + 0.55 * along), CAMERA_POSITION_WORLD);
			w += normalize(head - tail + vec3(1e-5)) * sw * 0.5 * step(0.99, along);
			v_uv = vec2(along, VERTEX.y * 2.0);
		}
		v_kind = float(kind);
		// fades as the shot slows and drops
		v_str = max(0.35, 1.0 - t * 0.18);
		// red-hot iron flickers as it cools in the air
		v_flick = 1.0 + 0.35 * sin(t * 40.0 + seed * 9.0);
		v_world = w;
		POSITION = PROJECTION_MATRIX * (VIEW_MATRIX * vec4(w, 1.0));
	}
}

void fragment() {
	vec4 fog = air_fog(v_world, CAMERA_POSITION_WORLD);
	float f = fog.a * 0.85;
	int kind = clamp(int(v_kind + 0.5), 0, 4);
	float across = 1.0 - v_uv.y * v_uv.y;
	if (v_part > 2.5) {
		// the chain: an opaque, softly edged strip of iron
		float a = smoothstep(1.0, 0.55, abs(v_uv.y)) * v_str;
		if (a < 0.01) {
			discard;
		}
		vec3 col = LINK_IRON * light_tint * (0.7 + 0.6 * across);
		ALBEDO = mix(col, fog.rgb, f) * a;
		ALPHA = a;
	} else if (v_part > 0.5) {
		float r2 = dot(v_uv, v_uv);
		if (r2 > 1.0) {
			discard;
		}
		vec3 n = vec3(v_uv.x, v_uv.y, sqrt(1.0 - r2));
		float a = 1.0 - smoothstep(0.82, 1.0, r2);
		if (kind == 2) {
			// red-hot iron: white-orange where it faces you, a dull crust at the rim
			vec3 hot = mix(vec3(0.7, 0.07, 0.01), vec3(4.2, 1.5, 0.35), n.z * n.z) * v_flick;
			ALBEDO = mix(hot, fog.rgb, f * 0.6) * a;
		} else {
			// dark iron with a hard little highlight off the sun
			vec3 sun_v = normalize((VIEW_MATRIX * vec4(sun_dir, 0.0)).xyz);
			float diff = max(dot(n, sun_v), 0.0);
			float spec = pow(max(dot(reflect(-sun_v, n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0);
			vec3 col = IRON[kind] * light_tint * (0.55 + 0.45 * n.y) + sun_color * (diff * 0.03 + spec * 0.35);
			ALBEDO = mix(col, fog.rgb, f) * a;
		}
		ALPHA = a;
	} else if (STREAK_GLOW[kind] > 0.5) {
		// a glowing tail: the fuse's sparks, the heat off red-hot iron
		float t = v_uv.x;
		float a = across * pow(t, 1.4) * v_str;
		if (a < 0.003) {
			discard;
		}
		float core = pow(max(across, 0.0), 5.0) * smoothstep(0.35, 1.0, t);
		vec3 tint = STREAK_TINT[kind] * (kind == 2 ? v_flick : 1.0);
		ALBEDO = tint * (a * 0.6 + core * 1.7) * (1.0 + night * 0.6) * (1.0 - f);
		ALPHA = a * 0.32;
	} else {
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
