// Pieces of the sea shared by the ocean and anything that shows water.

// Sea foam that breaks up the way the real thing does: cover (0..1) is how
// much of the surface it hides. As cover falls the dark holes open, the web
// thins to threads, and the threads snap into drifting flecks. fp is the
// pixel footprint in metres, so distant foam softens to an even veil.
// foam_field samples the web once; foam_cut thresholds it, so one lookup can
// serve several kinds of foam.
float foam_field(vec2 xz, float t, sampler2D foam_tex) {
	vec2 uv = xz * 0.0625;
	float v = texture(foam_tex, uv + vec2(t * 0.0021, -t * 0.0013)).r;
	float v2 = texture(foam_tex, uv * 0.61 + vec2(0.37, 0.71) - vec2(t * 0.0011, t * 0.0017)).b;
	return v * 0.78 + v2 * 0.22;
}

float foam_cut(float v, float cover, float fp) {
	float w = clamp(0.07 + fp * 0.35, 0.07, 0.5);
	return smoothstep(1.0 - cover - w, 1.0 - cover + w, v);
}

// The sea floor's own colour where light reaches it: pale sand rippled by the
// swell, darker drifts of weed and coral further out, and the caustic web of
// sunlight dancing over it (brightest in the shallows, sharpest at noon).
vec3 seabed_color(vec2 xz, float h, float depth, float t, sampler2D noise_tex, sampler2D caustic_tex, vec3 L) {
	vec4 n = texture(noise_tex, xz * 0.013);
	vec4 n2 = texture(noise_tex, xz * 0.071 + 0.37);
	vec3 sand = vec3(0.83, 0.74, 0.55) * (0.88 + 0.2 * n2.a);
	// sand ripples laid across the swell
	float ripple = sin(dot(xz, vec2(0.83, 0.56)) * 2.6 + n.g * 6.0) * 0.5 + 0.5;
	sand *= 0.94 + 0.08 * ripple;
	vec3 weed = vec3(0.25, 0.36, 0.2);
	vec3 coral = vec3(0.62, 0.45, 0.4);
	float deep = smoothstep(3.0, 10.0, depth);
	float patch = smoothstep(0.52, 0.72, n.r * 0.7 + n2.g * 0.45);
	vec3 col = mix(sand, mix(weed, coral, smoothstep(0.4, 0.7, n.b)), patch * (0.25 + 0.6 * deep));
	// caustics: two drifting webs multiplied, so the bright lines writhe
	vec2 cuv = xz * 0.11;
	float c1 = texture(caustic_tex, cuv + vec2(t * 0.021, t * 0.013)).r;
	float c2 = texture(caustic_tex, cuv * 0.83 + vec2(-t * 0.017, t * 0.023) + 0.5).r;
	float caustic = min(c1, c2) * 2.2 * (1.0 - smoothstep(1.0, 9.0, depth)) * smoothstep(0.05, 0.4, L.y);
	return col * (1.0 + caustic);
}
