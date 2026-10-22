// The sea's height under a point, for what floats on it (debris.gdshader):
// the same eight Gerstner trains the ocean draws, damped over the shallows by
// the same seabed, and faded wherever the ocean's own lattice can't carry
// them (out with distance, and where its cells stretch toward the horizon),
// with the horizontal pinch inverted the way Waves.height_at does it on the
// CPU, so a plank rides the very crest the eye sees.

uniform vec4 wave_a[8];
uniform vec4 wave_b[8];
/// the ocean's lattice (Ocean.follow): x core half-extent (m), y warp
/// coefficient, z cell size (m); and the point it is centred on
uniform vec4 grid_warp = vec4(66.0, 0.18, 1.5, 0.0);
uniform vec2 grid_origin = vec2(0.0);
/// where the swell fades out from (the camera, as the ocean's does)
uniform vec3 eye = vec3(0.0);
/// The archipelago's floor (Region.height_tex): r its height (m).
uniform sampler2D seabed_tex : repeat_disable, filter_linear;
uniform vec4 seabed_rect = vec4(-1000.0, -1000.0, 2000.0, 0.0005);
uniform float has_seabed = 0.0;

// The ground under world point x (m): the seabed, or deep water off the map.
float sea_floor(vec2 x) {
	return has_seabed > 0.5 ? textureLod(seabed_tex, (x - seabed_rect.xy) * seabed_rect.w, 0.0).r : -200.0;
}

// How far apart the ocean's vertices stand at world point x (m, each axis):
// its warp c + e + a e^3 inverted with two Newton steps from above.
vec2 lattice_span(vec2 x) {
	vec2 d = max(abs(x - grid_origin) - grid_warp.x, 0.0);
	float a = max(grid_warp.y, 1e-6);
	vec2 e = min(d, pow(d / a, vec2(1.0 / 3.0)));
	for (int it = 0; it < 2; it++) {
		e -= (e + a * e * e * e - d) / (1.0 + 3.0 * a * e * e);
	}
	return (1.0 + 3.0 * a * e * e) * grid_warp.z;
}

// The water's height at world point x, and its slope there (dy/dx, dy/dz).
float sea_height(vec2 x, float bed, out vec2 slope) {
	float damp = clamp(-bed / 8.0, 0.12, 1.0);
	vec2 span = lattice_span(x);
	float dist = length(x - eye.xz);
	float A[8];
	for (int i = 0; i < 8; i++) {
		vec4 a = wave_a[i];
		float lambda = 6.28319 / a.z;
		float carry = smoothstep(2.8, 4.0, lambda / max(length(span * a.xy), 1e-3));
		A[i] = a.w * damp * (1.0 - smoothstep(14.0, 28.0, dist / lambda)) * carry;
	}
	vec2 p = x;
	for (int it = 0; it < 2; it++) {
		vec2 o = vec2(0.0);
		for (int i = 0; i < 8; i++) {
			vec4 a = wave_a[i];
			o += a.xy * (cos(a.z * dot(a.xy, p) + wave_b[i].z) * wave_b[i].y * A[i]);
		}
		p = x - o;
	}
	float y = 0.0;
	vec2 g = vec2(0.0);
	for (int i = 0; i < 8; i++) {
		vec4 a = wave_a[i];
		float th = a.z * dot(a.xy, p) + wave_b[i].z;
		y += A[i] * sin(th);
		g += a.xy * (a.z * A[i] * cos(th));
	}
	slope = g;
	return y;
}
