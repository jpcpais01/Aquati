// The open sea engraved for the sea chart, as the web's SeaChart.buildOpenSea
// draws it: shelf teal round each archipelago deepening to a midnight abyss
// over rolling banks and the long shoal under the lane, the sea floor's
// relief lit from the north-west, fine pale isobaths, the long swell rolling
// in from the east-north-east in patches, the Sereno current's warmer ribbon
// streaked down the lane, and past the edge of the known sea darker water,
// hatched like unsurveyed parts, under a fine double rule; a whisper of paper
// grain over it all. Drawn once into a texture (src/ui/chart_art.gd); the
// noise is the web's own, bit for bit, so its soundings land where its depths say.
shader_type canvas_item;
render_mode blend_disabled;

/// The engraving's corner (x, z, world metres) and its metres per pixel.
uniform vec3 frame = vec3(-1700.0, -4500.0, 9.765625);
/// Its pixels across and down.
uniform vec2 px = vec2(1024.0, 635.0);
/// The two archipelagos' hearts.
uniform vec2 home = vec2(0.0, 0.0);
uniform vec2 away = vec2(6600.0, -2800.0);
/// The shoal under the lane, and the lane itself as a polyline.
uniform vec2 bank = vec2(0.0);
uniform vec2 lane[13];
/// How far round the archipelagos and the lane the known sea reaches (m).
uniform float edge_r = 1700.0;

uint mix32(int i, int j) {
	uint n = uint(i) * 374761393u + uint(j) * 668265263u;
	n = (n ^ (n >> 13u)) * 1274126177u;
	return n ^ (n >> 16u);
}

// a cheap smooth value noise on a unit lattice, 0..1 (the web's vnoise)
float vnoise(float x, float z) {
	float xf = floor(x);
	float zf = floor(z);
	int xi = int(xf);
	int zi = int(zf);
	float fx = x - xf;
	float fz = z - zf;
	float u = fx * fx * (3.0 - 2.0 * fx);
	float v = fz * fz * (3.0 - 2.0 * fz);
	float h00 = float(mix32(xi, zi)) / 4294967295.0;
	float h10 = float(mix32(xi + 1, zi)) / 4294967295.0;
	float h01 = float(mix32(xi, zi + 1)) / 4294967295.0;
	float h11 = float(mix32(xi + 1, zi + 1)) / 4294967295.0;
	float a = h00 + (h10 - h00) * u;
	float b = h01 + (h11 - h01) * u;
	return a + (b - a) * v;
}

float near_dist(vec2 p) {
	return min(length(p - home), length(p - away));
}

// how deep the open sea runs: 0 on an archipelago's shelf .. 1 in the abyss
float sea_depth(vec2 p) {
	float shelf = clamp((near_dist(p) - 1050.0) / 1500.0, 0.0, 1.0);
	float sh = shelf * shelf * (3.0 - 2.0 * shelf);
	float n = vnoise(p.x / 1500.0, p.y / 1500.0) * 0.6 + vnoise(p.x / 610.0 + 17.0, p.y / 610.0 - 9.0) * 0.28 + vnoise(p.x / 260.0 - 4.0, p.y / 260.0 + 31.0) * 0.12;
	vec2 bk = (p - bank) / vec2(520.0, 300.0);
	float bnk = exp(-dot(bk, bk)) * 0.55;
	return clamp(sh * (0.8 + (n - 0.5) * 0.8) - bnk * sh + (1.0 - sh) * 0.02, 0.0, 1.0);
}

// how far past the edge of the known sea (negative inside)
float sea_edge(vec2 p) {
	vec2 d = away - home;
	float t = clamp(dot(p - home, d) / dot(d, d), 0.0, 1.0);
	return length(p - home - d * t) - edge_r;
}

float lane_dist(vec2 p) {
	float best = 1e12;
	for (int k = 0; k < 12; k++) {
		vec2 a = lane[k];
		vec2 d = lane[k + 1] - a;
		float t = clamp(dot(p - a, d) / dot(d, d), 0.0, 1.0);
		vec2 e = p - a - d * t;
		best = min(best, dot(e, e));
	}
	return sqrt(best);
}

vec2 world(vec2 ij) {
	return frame.xy + (clamp(ij, vec2(0.0), px - 1.0) + 0.5) * frame.z;
}

void fragment() {
	vec2 ij = floor(UV * px);
	vec2 p = world(ij);
	float d = sea_depth(p);
	// shelf teal (as the archipelagos' own deep edge) .. midnight abyss
	float k1 = min(1.0, d * 1.7);
	float k2 = max(0.0, (d - 0.55) / 0.45);
	vec3 c = vec3(28.0 - k1 * 15.0 - k2 * 7.0, 94.0 - k1 * 34.0 - k2 * 26.0, 132.0 - k1 * 42.0 - k2 * 34.0);
	// the sea floor's relief, lit from the north-west
	float gx = sea_depth(world(ij + vec2(1.0, 0.0))) - sea_depth(world(ij - vec2(1.0, 0.0)));
	float gz = sea_depth(world(ij + vec2(0.0, 1.0))) - sea_depth(world(ij - vec2(0.0, 1.0)));
	c *= 1.0 + clamp((gx + gz) * 14.0, -0.12, 0.12);
	// isobaths: fine pale lines of even width, wherever the depth crosses a step
	float gm = length(vec2(gx, gz)) * 0.5 * 5.0;
	if (gm > 1e-5 && d > 0.04) {
		float v = d * 5.0;
		float rv = floor(v + 0.5);
		float off = abs(v - rv) / gm;
		if (off < 0.9) {
			float ink = (1.0 - off / 0.9) * (mod(rv, 2.0) > 0.5 ? 0.08 : 0.16);
			c += (vec3(150.0, 214.0, 224.0) - c) * ink;
		}
	}
	// the long swell rolling in from the east-north-east, in patches
	float cw = vnoise(p.x / 190.0, p.y / 190.0) * 7.0;
	float sw = sin((p.x * 0.83 + p.y * 0.55) / 21.0 + cw);
	if (sw > 0.0) {
		float s2 = sw * sw;
		float patch = clamp((vnoise(p.x / 460.0 + 3.0, p.y / 460.0 - 7.0) - 0.4) * 3.0, 0.0, 1.0);
		c += vec3(120.0, 170.0, 180.0) * (s2 * s2 * s2 * patch * (0.05 + d * 0.06));
	}
	// the Sereno current: a warmer teal ribbon down the lane, streaked with its set
	float e = sea_edge(p);
	float ld = e + edge_r < 1250.0 ? lane_dist(p) : 5000.0;
	if (ld < 900.0) {
		float rib = exp(-(ld / 330.0) * (ld / 330.0));
		float st = sin(ld / 15.0 + cw * 0.3) * 0.5 + 0.5;
		float st2 = st * st;
		float streak = st2 * st2 * st2 * st2 * st2 * rib * 0.25;
		c += (vec3(34.0, 108.0, 122.0) - c) * rib * 0.38 + vec3(30.0, 60.0, 60.0) * streak;
	}
	// past the edge of the known sea: darker water, hatched like unsurveyed parts
	if (e > -160.0) {
		float o = min(1.0, (e + 160.0) / 420.0);
		float oo = o * o * (3.0 - 2.0 * o);
		c += (vec3(5.0, 24.0, 38.0) - c) * oo * 0.86;
		if (fract((p.x - p.y) / 38.0) < 0.16) {
			c += vec3(5.0, 12.0, 15.0) * oo;
		}
		// a fine double rule along the edge itself
		float rule = max(0.0, 1.0 - abs(e) / (frame.z * 0.7)) * 0.3 + max(0.0, 1.0 - abs(e - 34.0) / (frame.z * 0.6)) * 0.16;
		c += (vec3(210.0, 226.0, 214.0) - c) * rule;
	}
	// a whisper of paper grain
	uint g = (uint(int(ij.x)) * 7919u + uint(int(ij.y)) * 104729u) * 2654435761u;
	c += (float(g >> 24u) / 255.0 - 0.5) * 3.0;
	COLOR = vec4(clamp(c, 0.0, 255.0) / 255.0, 1.0);
}
