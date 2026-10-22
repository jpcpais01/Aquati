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
