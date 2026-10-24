// The thread of powder smoke a cannonball leaves hanging. One strip per ball,
// written once when it leaves the barrel (the same instance data as its
// streak, see shots.gdshader): the strip spans the stretch of the flight
// whose smoke still hangs, from the oldest wisp to the ball, so every vertex
// is a point on the ball's arc at some moment. Each has drifted off on the
// breeze and risen for as long as it has hung there, widens and frays as it
// ages, and fades out at the tail. Nothing is updated per frame but the clock.
// Each shot lays its own: a shell's thin grey thread glowing off its fuse,
// red-hot iron's dark sooty one, chain's broad one off its whirling halves,
// and round shot the one of the vault trail it flies with.
//
// Mesh: VERTEX.x -1..1 across, VERTEX.y 0 (the oldest smoke) .. 1 (the ball).
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

#include "res://shaders/inc/atmos.gdshaderinc"

uniform float now = 0.0;
uniform float gravity = 14.0;
uniform sampler2D noise_tex : repeat_enable, filter_linear_mipmap;

// By kind (round, shell, fire, chain; grape lays none): the smoke's colour,
// its opacity, its width when laid and when old (m), how long it hangs (s),
// and the glow it carries close behind the ball.
const vec3 TINT[4] = { vec3(0.95, 0.94, 0.93), vec3(0.55, 0.52, 0.5), vec3(0.3, 0.27, 0.25), vec3(0.95, 0.94, 0.93) };
const float OPACITY[4] = { 0.42, 0.4, 0.52, 0.42 };
const vec2 WIDTH[4] = { vec2(0.3, 2.1), vec2(0.22, 1.6), vec2(0.4, 2.5), vec2(0.45, 2.4) };
const float LIFE[4] = { 1.9, 1.5, 2.1, 1.9 };
const vec3 GLOW[4] = { vec3(0.0), vec3(2.0, 1.0, 0.3), vec3(3.4, 1.3, 0.3), vec3(0.0) };
// Round shot's in each of the vault's trails (Cosmetics.TRAIL_STYLES; the
// rainbow's glow runs through every colour).
const vec3 TRAIL_TINT[10] = { vec3(0.95, 0.94, 0.93), vec3(1.1, 1.16, 1.2), vec3(0.32, 0.3, 0.29), vec3(0.72, 0.64, 0.58), vec3(0.9, 1.05, 1.25),
		vec3(1.15, 1.05, 0.9), vec3(0.75, 1.0, 0.88), vec3(1.0), vec3(0.85, 0.85, 1.05), vec3(0.62, 0.86, 0.76) };
const float TRAIL_OPACITY[10] = { 0.42, 0.32, 0.55, 0.3, 0.45, 0.32, 0.32, 0.26, 0.26, 0.36 };
const vec2 TRAIL_WIDTH[10] = { vec2(0.3, 2.1), vec2(0.25, 1.6), vec2(0.38, 2.7), vec2(0.26, 1.7), vec2(0.3, 2.0), vec2(0.34, 1.9),
		vec2(0.34, 1.9), vec2(0.3, 1.7), vec2(0.26, 1.6), vec2(0.3, 2.2) };
const float TRAIL_LIFE[10] = { 1.9, 1.2, 2.4, 1.4, 1.7, 1.5, 1.4, 1.4, 1.5, 2.0 };
const vec3 TRAIL_GLOW[10] = { vec3(0.0), vec3(0.0), vec3(0.0), vec3(2.6, 1.0, 0.25), vec3(0.5, 1.0, 1.6), vec3(3.0, 2.0, 0.6),
		vec3(0.5, 2.4, 1.3), vec3(1.6), vec3(1.6, 1.4, 2.6), vec3(0.3, 1.6, 0.9) };

varying float v_across;
varying float v_age;
varying float v_dist;
varying float v_seed;
varying float v_kind;
varying float v_style;
varying vec3 v_world;

void vertex() {
	int code = int(INSTANCE_CUSTOM.w + 0.5);
	int kind = clamp(code % 8, 0, 3);
	int style = clamp(code / 8, 0, 9);
	float life = kind == 0 ? TRAIL_LIFE[style] : LIFE[kind];
	float t_now = now - INSTANCE_CUSTOM.x;
	float t_head = min(t_now, INSTANCE_CUSTOM.y - INSTANCE_CUSTOM.x);
	float t_tail = max(0.0, t_now - life);
	if (t_now < 0.0 || t_head <= t_tail) {
		POSITION = vec4(2.0, 2.0, 2.0, 1.0);
	} else {
		vec3 p0 = MODEL_MATRIX[3].xyz;
		vec3 v0 = MODEL_MATRIX[0].xyz;
		// the moment of the flight this vertex was laid, and how long it has hung since
		float tv = mix(t_tail, t_head, VERTEX.y);
		float hung = t_now - tv;
		vec3 p = p0 + v0 * tv - vec3(0.0, 0.5 * gravity * tv * tv, 0.0);
		// drifting on the breeze and rising, more the longer it has hung
		float ride = hung < 0.6667 ? 0.75 * hung * hung : hung - 0.3333;
		float ride_rate = min(1.0, hung * 1.5);
		vec3 drift = vec3(wind.x * (1.2 + wind.z * 4.5), 0.25, wind.y * (1.2 + wind.z * 4.5));
		p += drift * ride;
		// the strip's own direction: the arc, less the drift's change along it
		vec3 tan = v0 - vec3(0.0, gravity * tv, 0.0) - drift * ride_rate;
		vec3 side = cross(tan, CAMERA_POSITION_WORLD - p);
		float sl = length(side);
		side = sl > 1e-5 ? side / sl : vec3(1.0, 0.0, 0.0);
		float age = clamp(hung / life, 0.0, 0.999);
		vec2 wd = kind == 0 ? TRAIL_WIDTH[style] : WIDTH[kind];
		float w = mix(wd.x, wd.y, sqrt(age));
		p += side * VERTEX.x * w * 0.5;
		v_across = VERTEX.x;
		v_age = age;
		v_dist = length(v0) * tv;
		v_seed = INSTANCE_CUSTOM.z;
		v_kind = float(kind);
		v_style = float(style);
		v_world = p;
		POSITION = PROJECTION_MATRIX * (VIEW_MATRIX * vec4(p, 1.0));
	}
}

void fragment() {
	int kind = clamp(int(v_kind + 0.5), 0, 3);
	int style = clamp(int(v_style + 0.5), 0, 9);
	float v = v_across;
	float age = v_age;
	float across = 1.0 - v * v;
	// the thread twists and frays: noise runs along the path and slowly churns
	float clock = now;
	vec2 nuv = vec2(v_dist * 0.07 - clock * 0.03, v * 0.28 + v_seed);
	float n1 = texture(noise_tex, nuv).g;
	float n2 = texture(noise_tex, nuv * vec2(2.6, 2.0) + vec2(clock * 0.02, 0.0)).a;
	float n = clamp((n1 - 0.5) * 2.4 + (n2 - 0.5) * 1.2 + 0.5, 0.0, 1.0);
	float dens = across * (0.55 + n * 0.9) - 0.18 - age * 0.55;
	float a = smoothstep(0.0, 0.4, dens);
	// eases in behind the ball, fades out at the tail
	a *= (1.0 - age) * (1.0 - age) * smoothstep(0.0, 0.035, age) * (kind == 0 ? TRAIL_OPACITY[style] : OPACITY[kind]);
	// the glow close behind the ball (a sputtering fuse, red-hot iron, a vault trail's)
	vec3 g = kind == 0 ? TRAIL_GLOW[style] : GLOW[kind];
	if (kind == 0 && style == 7) {
		g = clamp(abs(fract(v_dist * 0.025 - now * 0.25 + vec3(0.0, 2.0, 1.0) / 3.0) * 6.0 - 3.0) - 1.0, 0.0, 1.0) * 2.4;
	}
	float gk = pow(1.0 - age, 6.0) * across * across * smoothstep(0.0, 0.02, age);
	if (a < 0.003 && gk * (g.r + g.g + g.b) < 0.01) {
		discard;
	}
	float open = 1.0 - weather.x * 0.65;
	vec3 lit = light_tint * 0.72 + sun_color * 0.12 * open;
	vec4 fog = air_fog(v_world, CAMERA_POSITION_WORLD);
	float f = fog.a * 0.85;
	vec3 col = mix((kind == 0 ? TRAIL_TINT[style] : TINT[kind]) * lit, fog.rgb, f);
	ALBEDO = col * a + g * gk * (1.0 - f);
	ALPHA = a;
}
