// The thread of powder smoke a cannonball leaves hanging. One strip per ball,
// written once when it leaves the barrel (the same instance data as its
// streak, see shots.gdshader): the strip spans the stretch of the flight
// whose smoke still hangs, from the oldest wisp to the ball, so every vertex
// is a point on the ball's arc at some moment. Each has drifted off on the
// breeze and risen for as long as it has hung there, widens and frays as it
// ages, and fades out at the tail. Nothing is updated per frame but the clock.
//
// Mesh: VERTEX.x -1..1 across, VERTEX.y 0 (the oldest smoke) .. 1 (the ball).
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

#include "res://shaders/inc/atmos.gdshaderinc"

/// x, y the direction the wind blows toward (x, z), z its strength
global uniform vec4 wind;

uniform float now = 0.0;
uniform float gravity = 14.0;
uniform sampler2D noise_tex : repeat_enable, filter_linear_mipmap;
/// How long the smoke hangs (s), its width when laid and when old (m), its opacity.
uniform float life = 1.9;
uniform vec2 width = vec2(0.3, 2.1);
uniform float opacity = 0.42;
uniform vec3 tint = vec3(0.95, 0.94, 0.93);

varying float v_across;
varying float v_age;
varying float v_dist;
varying float v_seed;
varying vec3 v_world;

void vertex() {
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
		float w = mix(width.x, width.y, sqrt(age));
		p += side * VERTEX.x * w * 0.5;
		v_across = VERTEX.x;
		v_age = age;
		v_dist = length(v0) * tv;
		v_seed = INSTANCE_CUSTOM.z;
		v_world = p;
		POSITION = PROJECTION_MATRIX * (VIEW_MATRIX * vec4(p, 1.0));
	}
}

void fragment() {
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
	a *= (1.0 - age) * (1.0 - age) * smoothstep(0.0, 0.035, age) * opacity;
	if (a < 0.003) {
		discard;
	}
	float open = 1.0 - weather.x * 0.65;
	vec3 lit = light_tint * 0.72 + sun_color * 0.12 * open;
	vec4 fog = air_fog(v_world, CAMERA_POSITION_WORLD);
	vec3 col = mix(tint * lit, fog.rgb, fog.a * 0.85);
	ALBEDO = col * a;
	ALPHA = a;
}
