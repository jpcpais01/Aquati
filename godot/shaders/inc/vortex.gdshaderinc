// A maelstrom's water on the GPU: the GLSL twin of src/world/vortex.gd, so the
// funnel you see is the funnel the buoyancy rides. Each slot is a global
// (Hazards.sync): x, z, radius, strength * direction; an empty one has
// strength 0.

global uniform vec4 vortex_0;
global uniform vec4 vortex_1;
global uniform vec4 vortex_2;
global uniform vec4 vortex_3;

#define VORTEX_BOWL 8.0
#define VORTEX_THROAT 30.0
#define VORTEX_C2 0.0144
// height of the spiral ridges that wind down the walls (m, too small to steer a hull)
#define VORTEX_RIDGE 0.75

vec4 vortex_slot(int i) {
	return i == 0 ? vortex_0 : (i == 1 ? vortex_1 : (i == 2 ? vortex_2 : vortex_3));
}

// The funnel's height at p (m, negative = drawn down) and its gradient, with
// the spiral ridges winding down its walls, turning with the water at time t.
float vortex_one(vec4 v, vec2 p, float t, bool ridges, out vec2 grad) {
	grad = vec2(0.0);
	float k = abs(v.w);
	if (k < 0.001) {
		return 0.0;
	}
	vec2 q = p - v.xy;
	float d = max(length(q), 0.01);
	float u = d / v.z;
	if (u >= 1.0) {
		return 0.0;
	}
	float s = sqrt(v.z / 100.0) * k;
	float f = 1.0 - u;
	float g = 1.0 - u * u;
	float c = VORTEX_C2 / (u * u + VORTEX_C2);
	float h = -s * (VORTEX_BOWL * f * f + VORTEX_THROAT * c * g * g);
	// d h / d u, then down the radius
	float dc = -2.0 * u * c * c / VORTEX_C2;
	float dh = -s * (-2.0 * VORTEX_BOWL * f + VORTEX_THROAT * (dc * g * g - 4.0 * u * c * g));
	vec2 rd = q / d;
	grad = rd * dh / v.z;
	if (ridges) {
		// trailing log-spiral arms (the same phase the foam is laid along)
		float dir = v.w > 0.0 ? 1.0 : -1.0;
		float ph = 4.0 * atan(q.y, q.x) * dir + 7.6 * log(d + 4.0) - t * k * 1.1;
		float band = smoothstep(0.08, 0.3, u) * (1.0 - smoothstep(0.55, 1.0, u));
		float amp = VORTEX_RIDGE * s * band;
		h += amp * sin(ph);
		vec2 dph = 4.0 * dir * vec2(-q.y, q.x) / (d * d) + 7.6 * rd / (d + 4.0);
		grad += amp * cos(ph) * dph;
	}
	return h;
}

float vortex_height(vec2 p, float t, bool ridges, out vec2 grad) {
	float h = 0.0;
	grad = vec2(0.0);
	for (int i = 0; i < 4; i++) {
		vec2 g;
		h += vortex_one(vortex_slot(i), p, t, ridges, g);
		grad += g;
	}
	return h;
}

// How much of the swell survives at p: the turning water smooths it out.
float vortex_calm(vec2 p) {
	float c = 1.0;
	for (int i = 0; i < 4; i++) {
		vec4 v = vortex_slot(i);
		float k = abs(v.w);
		if (k < 0.001) {
			continue;
		}
		float u = length(p - v.xy) / v.z;
		c *= 1.0 - min(0.8, 0.65 * k) * (1.0 - smoothstep(0.3, 1.0, u));
	}
	return c;
}

// > 0 inside a live maelstrom's rim (where its own ring mesh draws the sea):
// 1 - distance in radii from the nearest eye.
float vortex_cut(vec2 p) {
	float c = -1.0;
	for (int i = 0; i < 4; i++) {
		vec4 v = vortex_slot(i);
		if (abs(v.w) < 0.001) {
			continue;
		}
		c = max(c, 1.0 - length(p - v.xy) / v.z);
	}
	return c;
}

// The nearest live maelstrom to p (strength 0 when none is near).
vec4 vortex_near(vec2 p) {
	vec4 best = vec4(0.0, 0.0, 1.0, 0.0);
	float bu = 1e9;
	for (int i = 0; i < 4; i++) {
		vec4 v = vortex_slot(i);
		if (abs(v.w) < 0.001) {
			continue;
		}
		float u = length(p - v.xy) / v.z;
		if (u < bu) {
			bu = u;
			best = v;
		}
	}
	return best;
}
