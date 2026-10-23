// The world-locked tile that the rain and the spindrift wrap round the view
// (src/fx/zoom_box.gd): a particle keeps the tile it was born into for its
// whole cycle, so a zoom never moves it in flight. Each particle's seeds come
// from its own number in the buffer.
#ifndef FX_TILE_INC
#define FX_TILE_INC

/// the tile's half size and height (m), the one before it, and when it changed (the particles' clock)
uniform vec2 box = vec2(120.0, 80.0);
uniform vec2 box_prev = vec2(120.0, 80.0);
uniform float box_at = -1e9;

// the tile a particle on cycle n (of length cyc, offset by its seed) was born into
vec2 born_box(float n, float cyc, float seed) {
	return (n - seed) * cyc < box_at ? box_prev : box;
}

// four random numbers 0..1 for particle i (a PCG hash)
vec4 seed4(int i) {
	uvec4 v = uvec4(uint(i), uint(i) * 747796405u + 2891336453u, 0x9e3779b9u, 0x85ebca6bu);
	v = v * 1664525u + 1013904223u;
	v.x += v.y * v.w;
	v.y += v.z * v.x;
	v.z += v.x * v.y;
	v.w += v.y * v.z;
	v = v ^ (v >> uvec4(16u));
	v.x += v.y * v.w;
	v.y += v.z * v.x;
	v.z += v.x * v.y;
	v.w += v.y * v.z;
	return vec4(v) * (1.0 / 4294967295.0);
}

#endif
