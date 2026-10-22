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

// An ellipse's distance, near enough for an antialiased edge.
float sd_ellipse(vec2 p, vec2 r) {
	return (length(p / r) - 1.0) * min(r.x, r.y);
}

float sd_box(vec2 p, vec2 b, float r) {
	vec2 q = abs(p) - b + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float sd_segment(vec2 p, vec2 a, vec2 b) {
	vec2 pa = p - a;
	vec2 ba = b - a;
	return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

// The skull: a domed cranium over a jaw with cheekbones, eye sockets, a nose
// and the gaps between the teeth cut out of it.
float emblem_skull(vec2 p) {
	float d = sd_ellipse(p - vec2(0.0, -0.14), vec2(0.64, 0.58));
	d = min(d, sd_box(p - vec2(0.0, 0.41), vec2(0.38, 0.21), 0.14));
	d = min(d, sd_ellipse(vec2(abs(p.x), p.y) - vec2(0.42, 0.14), vec2(0.16, 0.14)));
	// the eye sockets, each tilted out a little
	vec2 e = vec2(abs(p.x), p.y) - vec2(0.25, -0.06);
	float c = cos(0.2);
	float s = sin(0.2);
	e = vec2(c * e.x + s * e.y, -s * e.x + c * e.y);
	float hole = sd_ellipse(e, vec2(0.18, 0.2));
	// the nose: a little triangle point up
	vec2 n = vec2(abs(p.x), p.y - 0.13);
	hole = min(hole, max(n.y - 0.17, (n.x * 0.17 - n.y * 0.09) / length(vec2(0.17, 0.09))));
	// teeth: three gaps down the jaw and the line between the rows
	vec2 t = vec2(p.x - clamp(round(p.x / 0.19), -1.0, 1.0) * 0.19, p.y - 0.53);
	hole = min(hole, sd_box(t, vec2(0.03, 0.11), 0.0));
	hole = min(hole, sd_box(p - vec2(0.0, 0.42), vec2(0.36, 0.02), 0.0));
	return max(d, -hole);
}

// One bone: a shaft with two round knuckles at each end.
float sd_bone(vec2 p, vec2 a, vec2 b) {
	vec2 n = normalize(vec2(a.y - b.y, b.x - a.x)) * 0.085;
	float d = sd_segment(p, a, b) - 0.075;
	d = min(d, min(length(p - a - n), length(p - a + n)) - 0.115);
	return min(d, min(length(p - b - n), length(p - b + n)) - 0.115);
}

// The skull over its crossed bones, with a thin halo cut between them so a
// one-colour emblem still reads.
float emblem_skull_bones(vec2 p) {
	float skull = emblem_skull((p - vec2(0.0, -0.2)) / 0.72) * 0.72;
	float bones = min(sd_bone(p, vec2(-0.78, -0.1), vec2(0.78, 0.86)), sd_bone(p, vec2(0.78, -0.1), vec2(-0.78, 0.86)));
	return min(skull, max(bones, -(skull - 0.065)));
}

// Emblem by kind: 1 the sun, 2 the skull and crossed bones.
float emblem_at(int kind, vec2 p) {
	if (kind == 1) {
		return emblem_sun(p);
	}
	if (kind == 2) {
		return emblem_skull_bones(p);
	}
	return 1e3;
}
