// Emblems painted on canvas as distance fields (negative inside), in emblem
// units: radius 1 is half the emblem's size, y runs down as on the web
// game's canvases. Coverage is antialiased by each pixel's footprint.

float emblem_cover(float d) {
	return clamp(0.5 - d / max(fwidth(d), 1e-4), 0.0, 1.0);
}

// The sun: a disc in twelve rays, long and short, with a rolling sea cut
// across its lower half.
float emblem_sun(vec2 p) {
	float d = length(p) - 0.52;
	float sector = 6.28318531 / 12.0;
	float k = round(atan(p.y, p.x) / sector);
	float a = -k * sector;
	vec2 q = vec2(p.x * cos(a) - p.y * sin(a), p.x * sin(a) + p.y * cos(a));
	float r = mod(k, 2.0) > 0.5 ? 0.86 : 1.0;
	float s = 0.0648 / (r - 0.4958);
	float tri = max((abs(q.y) - s * (r - q.x)) / sqrt(1.0 + s * s), 0.45 - q.x);
	d = min(d, tri);
	// the wave, a round-capped stroke 0.11 wide
	float x = clamp(p.x, -0.42, 0.42);
	float ph = (x + 0.42) / 0.84 * 24.0 * 0.62;
	float y = 0.14 + sin(ph) * 0.08;
	float slope = cos(ph) * 0.08 * 0.62 * 24.0 / 0.84;
	float cut = abs(p.x) > 0.42 ? length(p - vec2(x, y)) : abs(p.y - y) / sqrt(1.0 + slope * slope);
	return max(d, -(cut - 0.055));
}

// Emblem by kind: 1 sun (more to come with the pirates).
float emblem_at(int kind, vec2 p) {
	if (kind == 1) {
		return emblem_sun(p);
	}
	return 1e3;
}
