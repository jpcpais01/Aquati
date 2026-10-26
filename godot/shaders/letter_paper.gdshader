// A letter come aboard, drawn whole in one quad round it: old paper with
// torn sides, browned toward its edges, mottled and foxed, a tide mark where
// the sea got in round the cork, a little curl along its top and the rest of
// it still rolled up at its foot (the roll travelling down as it opens, and
// back up as it is put away), and its shadow on the sea. src/ui/letter_card.gd.
shader_type canvas_item;

/// The sheet's width and its full height, opened (HUD units).
uniform vec2 sheet = vec2(300.0, 400.0);
/// How far down it has opened: the roll's centre.
uniform float open_h = 0.0;
uniform float roll_r = 10.0;
uniform float curl_r = 4.0;
/// HUD units per CSS px.
uniform float k = 1.0;
uniform float seed = 0.0;
uniform vec4 c_heart : source_color = vec4(0.953, 0.894, 0.753, 1.0);
uniform vec4 c_edge : source_color = vec4(0.839, 0.718, 0.490, 1.0);

varying vec2 pos;

void vertex() {
	pos = VERTEX;
}

float hash(float n) {
	return fract(sin(n) * 43758.5453);
}

float hash2(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise1(float x) {
	float i = floor(x);
	float f = fract(x);
	f = f * f * (3.0 - 2.0 * f);
	return mix(hash(i + seed * 13.0), hash(i + 1.0 + seed * 13.0), f);
}

float noise2(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = hash2(i);
	float b = hash2(i + vec2(1.0, 0.0));
	float c = hash2(i + vec2(0.0, 1.0));
	float d = hash2(i + vec2(1.0, 1.0));
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec4 over(vec4 dst, vec3 rgb, float a) {
	float oa = a + dst.a * (1.0 - a);
	return vec4((rgb * a + dst.rgb * dst.a * (1.0 - a)) / max(oa, 1e-5), oa);
}

// the torn sides: how far in from each edge the paper starts at height y
float tear_l(float y) {
	return (noise1(y * 0.11 / k) * 0.65 + noise1(y * 0.37 / k + 7.0) * 0.35) * 3.4 * k;
}

float tear_r(float y) {
	return sheet.x - (noise1(y * 0.12 / k + 31.0) * 0.65 + noise1(y * 0.41 / k + 17.0) * 0.35) * 3.4 * k;
}

float band(float x, float a, float b, float aa) {
	return smoothstep(a - aa, a + aa, x) * (1.0 - smoothstep(b - aa, b + aa, x));
}

void fragment() {
	vec2 p = pos;
	float w = sheet.x;
	float h = open_h;
	float R = roll_r;
	float aa = max(fwidth(p.x), 0.001) * 0.7;
	vec4 col = vec4(0.0);
	// its shadow on the sea, soft and a little below
	{
		vec2 c = vec2(w * 0.5, (h + R - curl_r) * 0.5 + 9.0 * k);
		vec2 he = vec2(w * 0.5 - 3.0 * k, (h + R + curl_r) * 0.5);
		vec2 q = abs(p - c) - he;
		float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
		col = over(col, vec3(0.0, 0.03, 0.06), (1.0 - smoothstep(-12.0 * k, 16.0 * k, d)) * 0.3);
	}
	float xl = tear_l(p.y);
	float xr = tear_r(p.y);
	float inx = band(p.x, xl, xr, aa);
	// the opened paper
	float sa = inx * band(p.y, 0.0, h, aa);
	if (sa > 0.0) {
		float e = min(min(p.x - xl, xr - p.x), min(p.y + 8.0 * k, h - p.y + 24.0 * k));
		vec3 c = mix(c_edge.rgb, c_heart.rgb, smoothstep(0.0, 52.0 * k, e));
		// mottled, with the grain of its fibres
		float m = noise2(p / (40.0 * k) + seed * 5.0) * 0.6 + noise2(p / (13.0 * k) - seed * 3.0) * 0.4;
		c *= 0.935 + 0.1 * m;
		c *= 0.972 + 0.045 * noise2(vec2(p.x / (1.5 * k), p.y / (8.0 * k)) + seed * 9.0);
		// foxing
		for (int i = 0; i < 4; i++) {
			float fi = float(i);
			vec2 sc = vec2(hash(seed * 7.1 + fi * 1.7), hash(seed * 11.3 + fi * 3.1)) * sheet;
			float r = (5.0 + 15.0 * hash(seed * 3.7 + fi)) * k;
			float s = 1.0 - smoothstep(r * 0.2, r, length(p - sc));
			c = mix(c, c * vec3(0.84, 0.72, 0.55), s * 0.32);
		}
		// the tide mark, a dried ring with the stain inside it
		float tr = length(p - vec2(w * 0.86, -0.05 * w)) - w * 0.24;
		c = mix(c, vec3(0.55, 0.37, 0.16), exp(-pow(tr / (1.5 * k), 2.0)) * 0.24 + (tr < 0.0 ? 0.05 : 0.0));
		// in the shade of the roll, and of the curl along its top
		c *= 1.0 - smoothstep(h - R - 14.0 * k, h - R * 0.6, p.y) * 0.2;
		c *= 1.0 - (1.0 - smoothstep(curl_r, curl_r + 9.0 * k, p.y)) * 0.13;
		col = over(col, c, sa);
	}
	// the curl along its top: a thin tube, lit from above
	{
		float ny = p.y / curl_r;
		float a = inx * (1.0 - smoothstep(1.0 - aa / curl_r, 1.0 + aa / curl_r, abs(ny)));
		float nz = sqrt(max(0.0, 1.0 - ny * ny));
		vec3 c = mix(c_edge.rgb * 0.62, c_heart.rgb * 1.05, clamp(nz * 0.7 - ny * 0.5, 0.0, 1.0));
		col = over(col, c, a);
	}
	// the rest of it, still rolled up
	{
		float ny = (p.y - h) / R;
		float l0 = tear_l(h) - 0.6 * k;
		float r0 = tear_r(h) + 0.6 * k;
		float a = band(p.x, l0, r0, aa) * (1.0 - smoothstep(1.0 - aa / R, 1.0 + aa / R, abs(ny)));
		float nz = sqrt(max(0.0, 1.0 - ny * ny));
		vec3 c = mix(c_edge.rgb * 0.5, c_heart.rgb * 1.05, clamp(nz * 0.78 - ny * 0.42, 0.0, 1.0));
		// a glint along it, the layers wound inside showing at its ends
		c += vec3(1.0, 0.97, 0.88) * pow(clamp(1.0 - abs(ny + 0.42) * 3.5, 0.0, 1.0), 2.0) * 0.13;
		float ends = smoothstep(0.0, 6.0 * k, p.x - l0) * smoothstep(0.0, 6.0 * k, r0 - p.x);
		c *= 0.8 + 0.2 * ends;
		c *= 1.0 - 0.06 * (1.0 - ends) * (0.5 + 0.5 * sin(length(vec2(ny * R, 0.0)) * 2.2 / k));
		col = over(col, c, a);
	}
	COLOR = vec4(col.rgb, col.a * COLOR.a);
}
