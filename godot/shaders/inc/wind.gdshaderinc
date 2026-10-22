// The breeze over the islands: its heading and strength (shader globals,
// from src/world/wind.gd) and the gusts rolling across the ground, which the
// grass bends to and the plants lean from. Same maths as Wind.gust_at().
#ifndef WIND_INC
#define WIND_INC

/// x, y the direction the wind blows toward (x, z), z its strength (0 calm .. 1 a stiff breeze)
global uniform vec4 wind;
/// how far the air has carried a cloud or a ripple (m), for patterns that drift downwind
global uniform vec2 wind_drift;
/// the gust puffs: centre x, z (m), radius (m), strength (Wind.packed)
uniform vec4 gusts[8];

// Sum of soft, wind-stretched puffs.
float gust_at(vec2 p) {
	float s = 0.0;
	vec2 wd = wind.xy;
	for (int i = 0; i < 8; i++) {
		vec4 g = gusts[i];
		if (g.w <= 0.0) {
			continue;
		}
		vec2 d = p - g.xy;
		float a = dot(d, wd) / 1.8;
		float b = dot(d, vec2(-wd.y, wd.x));
		float r = max(1.0 - (a * a + b * b) / (g.z * g.z), 0.0);
		s += g.w * r * r;
	}
	return min(s, 1.4);
}

#endif
