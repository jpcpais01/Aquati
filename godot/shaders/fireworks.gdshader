// Fireworks, flown entirely on the GPU (the web game's fx/fireworks.ts).
// Every star, rocket, spark, crackle and flash is written once into the
// MultiMesh the moment its rocket leaves the gun, and flies on here in
// closed form under drag and gravity: a sky full of stars costs the CPU
// nothing per frame.
//
// Each star is a camera-facing ribbon whose vertices are each evaluated at
// their own moment of the past, so a willow's trail really droops along the
// curve it flew and a fish's tail really wriggles.
//
// Instance packing (src/fx/firework_sky.gd):
//   MODEL_MATRIX[3].xyz  start position     MODEL_MATRIX[0].xyz  start velocity
//   MODEL_MATRIX[1].xyz  drag, gravity, mode + seed (fraction)
//   MODEL_MATRIX[2].xyz  amplitude (fish, tentacle), trail (s), size (m)
//   COLOR                start colour (HDR) rgb, end colour's r
//   INSTANCE_CUSTOM      birth, life, end colour's g and b
// The mesh is a strip: a tail cap (x -1), eight body columns along the
// flight (x 0..1) and a head cap (x 2), two rows across (y -1, 1).
// Modes: 0 plain, 1 glitter, 2 strobe, 3 fish, 4 flash, 5 pop, 6 hang
// (willow), 7 the rocket's head, 8 a tentacle.
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

#include "res://shaders/inc/atmos.gdshaderinc"

/// The fireworks' own clock (s), which firework_sky.gd keeps from growing large.
uniform float clock = 0.0;
/// One pixel's size at a metre's distance (the view's), so a far star is never thinner than a pixel and a half.
uniform float px = 0.001;
uniform float gain = 1.0;

varying vec3 v_col;
varying vec2 v_q;
varying float v_along;
varying float v_seed;
varying float v_glit;

float h11(float x) {
	return fract(sin(x * 78.233) * 43758.5453);
}

vec3 flight(vec3 p0, vec3 v0, float k, float g, float amp, float t, float mode, float seed) {
	k = max(k, 0.01);
	float e = exp(-k * t);
	float f = (1.0 - e) / k;
	float gk = g / k;
	vec3 p = p0 + vec3(v0.x * f, (v0.y + gk) * f - gk * t, v0.z * f);
	if ((mode > 2.5 && mode < 3.5) || mode > 7.5) {
		vec3 v = vec3(v0.x * e, (v0.y + gk) * e - gk, v0.z * e) + vec3(1e-3, 0.0, 0.0);
		vec3 fwd = normalize(v);
		vec3 side = cross(fwd, vec3(0.0, 1.0, 0.0));
		side = dot(side, side) > 1e-4 ? normalize(side) : vec3(1.0, 0.0, 0.0);
		vec3 up = cross(side, fwd);
		if (mode < 3.5) {
			// a fish's tail: a quick side-to-side swim that settles in once it's away
			p += side * sin(t * 15.0 + seed * 40.0) * amp * smoothstep(0.0, 0.3, t);
		} else {
			// an arm that curls wider the further it reaches
			float ph = t * 2.3 + seed * 6.2832;
			p += (side * sin(ph) + up * cos(ph) * 0.75) * amp * t;
		}
	}
	return p;
}

void vertex() {
	float age = clock - INSTANCE_CUSTOM.x;
	float life = INSTANCE_CUSTOM.y;
	if (age < 0.0 || age > life || life <= 0.0) {
		POSITION = vec4(2.0, 2.0, 2.0, 1.0);
	} else {
		vec3 p0 = MODEL_MATRIX[3].xyz;
		vec3 v0 = MODEL_MATRIX[0].xyz;
		float k = MODEL_MATRIX[1].x;
		float g = MODEL_MATRIX[1].y;
		float mode = floor(MODEL_MATRIX[1].z);
		float seed = fract(MODEL_MATRIX[1].z);
		float amp = MODEL_MATRIX[2].x;
		float tl = MODEL_MATRIX[2].y;
		float size = MODEL_MATRIX[2].z;
		vec3 c0 = COLOR.rgb;
		vec3 c1 = vec3(COLOR.a, INSTANCE_CUSTOM.zw);
		float t = age / life;
		float u = VERTEX.x;
		float body = clamp(u, 0.0, 1.0);
		float tau = max(age - tl * (1.0 - body), 0.0);
		vec3 p = flight(p0, v0, k, g, amp, tau, mode, seed);
		// which way it's travelling, on screen
		float dt = 0.02;
		vec3 pb = flight(p0, v0, k, g, amp, max(tau - dt, 0.0), mode, seed);
		vec3 pf = tau < dt ? flight(p0, v0, k, g, amp, tau + dt, mode, seed) : p;
		vec4 mv = VIEW_MATRIX * vec4(p, 1.0);
		vec2 d2 = (mat3(VIEW_MATRIX) * (pf - pb)).xy;
		float l2 = length(d2);
		vec2 dir = l2 > 1e-5 ? d2 / l2 : vec2(1.0, 0.0);

		// brightness through the star's life
		float env = 1.0 - smoothstep(0.6, 1.0, t);
		float bright = 1.0 + 1.4 * exp(-age * 9.0); // the instant of the break
		if (mode < 0.5) {
		} else if (mode < 1.5) {
			env *= 0.45 + 1.1 * step(0.45, h11(floor(age * 20.0) + seed * 97.0));
		} else if (mode < 2.5) {
			float blink = step(0.42, fract(age * 6.5 + seed * 13.0));
			env = (1.0 - smoothstep(0.85, 1.0, t)) * mix(1.0, blink * 1.7, smoothstep(0.22, 0.32, t));
		} else if (mode < 3.5) {
			env *= 0.85 + 0.3 * sin(age * 30.0 + seed * 20.0);
		} else if (mode < 4.5) {
			env = (1.0 - t) * (1.0 - t);
			bright = 1.0;
			size *= 0.55 + 0.9 * sqrt(t);
		} else if (mode < 5.5) {
			env = 1.0 - t;
			bright = 1.0;
			size *= 0.6 + 0.8 * t;
		} else if (mode < 6.5) {
			env = (1.0 - smoothstep(0.7, 1.0, t)) * (0.75 + 0.25 * (1.0 - t));
			env *= mix(1.0, 0.35 + 1.3 * step(0.5, h11(floor(age * 16.0) + seed * 61.0)), smoothstep(0.55, 0.8, t));
			bright = 1.0 + 0.8 * exp(-age * 6.0);
		} else if (mode < 7.5) {
			env = 0.85 + 0.3 * h11(floor(age * 30.0) + seed * 17.0);
			bright = 1.0;
		} else {
			env *= 0.8 + 0.2 * sin(age * 9.0 + seed * 10.0);
		}
		vec3 col = mix(c0, c1, smoothstep(0.15, 0.85, t));
		// the trail dims toward its tail; the head is the star itself
		float tail_k = u < 0.0 ? 0.0 : (u > 1.0 ? 1.0 : body);
		float fade = tl > 0.0 ? mix(0.1, 1.0, pow(tail_k, 1.4)) : 1.0;
		float w = size * (0.4 + 0.6 * tail_k) * (1.0 + 0.5 * exp(-age * 10.0));
		// never thinner than about a pixel and a half: further off, a star is dimmer, not thinner
		float w_min = px * -mv.z * 1.5;
		float thin = w < w_min ? (w * w) / (w_min * w_min) : 1.0;
		w = max(w, w_min);
		float vz = -mv.z;
		float fog = max(smoothstep(fog_range.x, fog_range.y, vz) * 0.85, (1.0 - exp(-vz * 0.0045)) * weather.w * 0.6);
		v_col = col * env * bright * fade * thin * (1.0 - fog) * gain;
		vec2 side_v = vec2(-dir.y, dir.x);
		mv.xy += side_v * VERTEX.y * w;
		v_q = vec2(0.0, VERTEX.y);
		if (u < 0.0) {
			mv.xy -= dir * w;
			v_q.x = -1.0;
		}
		if (u > 1.0) {
			mv.xy += dir * w;
			v_q.x = 1.0;
		}
		v_along = tail_k;
		v_seed = seed;
		v_glit = ((mode > 0.5 && mode < 1.5) || (mode > 5.5 && mode < 7.5)) ? 1.0 : 0.0;
		POSITION = PROJECTION_MATRIX * mv;
	}
}

void fragment() {
	float r = length(v_q);
	if (r >= 1.0) {
		discard;
	}
	float f = 1.0 - r;
	float glow = f * f;
	float core = glow * glow * glow;
	vec3 col = v_col * (glow * 0.5 + core * 1.7) + vec3(dot(v_col, vec3(0.3, 0.5, 0.2))) * core * 0.7;
	if (v_glit > 0.5 && v_along < 0.96) {
		// glitter: the trail breaks into sparks that wink on and off as it burns
		float h = fract(sin(floor(v_along * 24.0 + v_seed * 91.0 - clock * 11.0) * 78.233) * 43758.5453);
		col *= 0.2 + step(0.6, h) * 2.4;
	}
	if (max(col.r, max(col.g, col.b)) < 0.002) {
		discard;
	}
	// light of its own: added over whatever is behind it
	ALBEDO = col;
	ALPHA = 0.0;
}
