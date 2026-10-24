// Value noise for the procedural cloth and paint (the web game's skH, skH2,
// skN and skFbm): the vault's skins (ship_skin.gdshaderinc) and her refit's
// sails (ship_sail.gdshaderinc) both draw with it.
#ifndef SKIN_NOISE
#define SKIN_NOISE

float sk_h(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

vec2 sk_h2(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.xx + p3.yz) * p3.zy);
}

float sk_n(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(sk_h(i), sk_h(i + vec2(1.0, 0.0)), u.x), mix(sk_h(i + vec2(0.0, 1.0)), sk_h(i + vec2(1.0, 1.0)), u.x), u.y);
}

float sk_fbm(vec2 p) {
	float s = 0.0;
	float a = 0.5;
	for (int i = 0; i < 4; i++) {
		s += a * sk_n(p);
		p = mat2(vec2(1.6, 1.2), vec2(-1.2, 1.6)) * p + vec2(1.7, 9.2);
		a *= 0.5;
	}
	return s;
}

#endif
