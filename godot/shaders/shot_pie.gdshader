// The touch shot pie (src/ui/shot_pie.gd), drawn whole in one quad round
// the shot button: eight slices of glass round a hub, a kind of shot in
// each of the upper five and an empty rack in each of the lower three. The
// slice under the finger stands out, tinted and glowing in its shot's
// colour, the loaded one is ringed in white, and a kind with none left is
// dimmed. Each slice blooms out from the hub on its own beat. Soft steps of
// the distance to each slice, painted back to front as
// shaders/shot_disc.gdshader paints its discs.
shader_type canvas_item;

/// The quad drawn round the pie (HUD units, the pie at its centre), the
/// hub the slices start from, their outer edge, the gap between them, their
/// rounded corners and how far the slice under the finger stands out.
uniform vec2 quad = vec2(400.0, 400.0);
uniform float hub = 51.0;
uniform float outer = 161.0;
uniform float gap = 4.6;
uniform float corner = 9.0;
uniform float pop = 9.0;
/// The dark pool under the pie, 0..1 as it opens.
uniform float pool = 0.0;
/// Per slice, clockwise from the top: its shot's colour (alpha 0: an empty
/// rack), its bloom (0 folded .. 1 open, overshooting on the way), and eased
/// 0..1: under the finger, loaded, none left.
uniform vec4 ac[8];
uniform float grow[8];
uniform float hot[8];
uniform float sel[8];
uniform float dim[8];
uniform vec4 c_glass = vec4(0.063, 0.157, 0.212, 0.86);
uniform vec4 c_foot = vec4(0.024, 0.078, 0.118, 0.94);

const float SLICE = PI / 4.0;

// paints rgb at coverage a over dst (straight alpha)
vec4 over(vec4 dst, vec3 rgb, float a) {
	float oa = a + dst.a * (1.0 - a);
	return vec4((rgb * a + dst.rgb * dst.a * (1.0 - a)) / max(oa, 1e-5), oa);
}

// a CSS box-shadow's gaussian edge (blur radius b) at signed distance d
float soft(float d, float b) {
	return 1.0 - smoothstep(-b * 1.05, b * 1.05, d);
}

// a CSS radial gradient between two colours (premultiplied, as CSS mixes)
vec4 grad(vec4 a, vec4 b, float t) {
	vec4 p = mix(vec4(a.rgb * a.a, a.a), vec4(b.rgb * b.a, b.a), clamp(t, 0.0, 1.0));
	return vec4(p.rgb / max(p.a, 1e-5), p.a);
}

// signed distance to slice i (negative inside): an annular sector between
// its inner and outer radius, its sides drawn in by half the gap, its
// corners rounded; r and a the point's radius and bearing (0 up, clockwise)
float slice_d(int i, float r, float a, out float r0, out float r1) {
	float h = hot[i];
	r0 = hub + pop * h;
	r1 = hub + (outer - hub) * grow[i] + pop * h;
	float da = mod(a - float(i) * SLICE + PI, TAU) - PI;
	float side = gap * 0.5 - r * sin(SLICE * 0.5 - abs(da));
	vec2 e = vec2(max(r0 - r, r - r1), side) + corner;
	return length(max(e, 0.0)) + min(max(e.x, e.y), 0.0) - corner;
}

void fragment() {
	vec2 q = UV * quad - quad * 0.5;
	float r = length(q);
	// a pixel's width in HUD units: every distance here is in them (taken
	// once, as a slice's own distance jumps where the slices looked at change)
	float aa = max(fwidth(r), 1e-3);
	// bearing from the top, clockwise (the quad's y runs down)
	float a = atan(q.x, -q.y);
	vec4 col = vec4(0.0);
	// a soft dark pool under the whole pie, so the glass reads over a bright sea
	col = over(col, vec3(0.0, 0.031, 0.055), 0.34 * pool * soft(r - outer - 4.0, 30.0));
	// only this slice and its neighbours reach this point
	int i0 = int(floor(a / SLICE + 0.5));
	// first what lies outside the slices: the glow of the one under the
	// finger and the loaded one's white ring...
	for (int k = -1; k <= 1; k++) {
		int i = (i0 + k + 16) % 8;
		float g = grow[i];
		if (g < 0.002) {
			continue;
		}
		float r0;
		float r1;
		float d = slice_d(i, r, a, r0, r1);
		float outside = clamp(0.5 + d / aa, 0.0, 1.0);
		float fade = smoothstep(0.0, 0.4, g);
		col = over(col, ac[i].rgb, 0.6 * hot[i] * soft(d, 16.0) * outside * fade);
		col = over(col, vec3(1.0), sel[i] * clamp(0.5 - (d - 2.0) / aa, 0.0, 1.0) * outside * fade);
	}
	// ...then the glass
	for (int k = -1; k <= 1; k++) {
		int i = (i0 + k + 16) % 8;
		float g = grow[i];
		if (g < 0.002) {
			continue;
		}
		float r0;
		float r1;
		float d = slice_d(i, r, a, r0, r1);
		float body = clamp(0.5 - d / aa, 0.0, 1.0);
		if (body <= 0.0) {
			continue;
		}
		float fade = smoothstep(0.0, 0.4, g);
		float h = hot[i];
		float empty = 1.0 - ac[i].a;
		// the shot's colour lit across the middle of the slice, darker to either edge
		float t = abs(clamp((r - r0) / max(r1 - r0, 1.0), 0.0, 1.0) - 0.42) * 1.7;
		vec4 c0 = grad(c_glass, vec4(ac[i].rgb, 1.0), mix(0.16, 0.42, h) * (1.0 - empty));
		vec4 gl = grad(c0, c_foot, t);
		float alpha = gl.a * mix(1.0, 0.82, empty) * mix(1.0, 0.72, dim[i]) * fade;
		col = over(col, gl.rgb, alpha * body);
		// a hairline of light along the edge, brighter on the slice under the finger
		col = over(col, vec3(1.0), (0.11 + 0.3 * h) * (1.0 - empty * 0.4) * fade * body * clamp(0.5 + (d + 1.2) / aa, 0.0, 1.0));
		// an empty rack: a dashed ring where its shot would sit
		if (empty > 0.5) {
			float ang = float(i) * SLICE;
			vec2 c = vec2(sin(ang), -cos(ang)) * (r0 + (r1 - r0) * 0.5);
			vec2 p = q - c;
			float ring = abs(length(p) - hub * 0.36) - 0.9;
			float dash = step(0.5, fract(atan(p.x, p.y) / TAU * 14.0));
			col = over(col, vec3(1.0), 0.2 * fade * dash * body * clamp(0.5 - ring / aa, 0.0, 1.0));
		}
	}
	COLOR = col;
}
