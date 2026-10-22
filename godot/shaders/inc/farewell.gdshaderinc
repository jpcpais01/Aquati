// The farewell's veil over the whole screen, in one pass: the red bruise of
// the blow that sinks her, and once she's gone the drowned backdrop behind
// the card, the sunlight slanting down through the water in five slow,
// breathing shafts, and the light pooled behind the title (the web game's
// #cine::before, #dead, .wk-rays and .wk-head::before). Shared by
// farewell.gdshader and farewell_drown.gdshader. src/ui/wreck_screen.gd.

/// The size drawn (units), and CSS pixels in units.
uniform vec2 size = vec2(1600.0, 720.0);
uniform float px = 1.85;
/// The bruise (0..1) and the card's backdrop (0..1).
uniform float hurt = 0.0;
uniform float card = 0.0;
/// The light pooled behind the title: its centre and radii (units).
uniform vec4 pool = vec4(800.0, 90.0, 550.0, 150.0);

vec4 over(vec4 dst, vec3 rgb, float a) {
	float oa = a + dst.a * (1.0 - a);
	return vec4((rgb * a + dst.rgb * dst.a * (1.0 - a)) / max(oa, 1e-5), oa);
}

// one shaft: its left edge (share of the width), width, lean (degrees), and its breath's period and offset
float shaft(vec2 p, float left, float w, float lean, float dur, float lag) {
	float k = 0.5 - 0.5 * cos(TAU * fract((TIME + lag) / dur));
	float h = size.y * 0.92;
	vec2 o = vec2(left * size.x + w * 0.5, -size.y * 0.12);
	float a = radians(lean);
	vec2 v = p - o;
	// undo its lean about the top, then its sway and swell
	vec2 l = vec2(cos(a) * v.x + sin(a) * v.y, -sin(a) * v.x + cos(a) * v.y);
	l.x = (l.x - mix(-12.0, 14.0, k) * px) / mix(0.8, 1.15, k);
	vec2 e = vec2(l.x / (w * 0.5), (l.y - h * 0.5) / (h * 0.5));
	float inside = 1.0 - smoothstep(0.82, 1.0, dot(e, e));
	float y = clamp(l.y / h, 0.0, 1.0);
	float g = y < 0.45 ? mix(0.2, 0.08, y / 0.45) : mix(0.08, 0.0, clamp((y - 0.45) / 0.4, 0.0, 1.0));
	return inside * g * mix(0.25, 1.0, k);
}

vec4 farewell(vec4 col, vec2 uv) {
	vec2 p = uv * size;
	if (card > 0.0) {
		// the drowned sea behind the card: clear near the middle, dark toward the corners
		float e = length((uv - vec2(0.5, 0.4)) / vec2(0.95, 0.75));
		vec4 b = e < 0.62 ? mix(vec4(0.004, 0.055, 0.078, 0.12), vec4(0.004, 0.047, 0.071, 0.42), e / 0.62)
				: mix(vec4(0.004, 0.047, 0.071, 0.42), vec4(0.0, 0.027, 0.043, 0.8), clamp((e - 0.62) / 0.38, 0.0, 1.0));
		col = over(col, b.rgb, b.a * card);
		// sunlight down through the water
		float wide = clamp(size.x * 0.07, 40.0 * px, 110.0 * px);
		float s = shaft(p, 0.14, wide, 16.0, 9.0, 1.0);
		s += shaft(p, 0.33, clamp(size.x * 0.03, 20.0 * px, 46.0 * px), 13.0, 7.0, 4.0);
		s += shaft(p, 0.51, wide, 11.0, 11.0, 6.0);
		s += shaft(p, 0.68, clamp(size.x * 0.04, 26.0 * px, 60.0 * px), 9.0, 8.0, 2.5);
		s += shaft(p, 0.84, wide, 7.0, 10.0, 7.5);
		col = over(col, vec3(0.6, 0.93, 0.88), min(s, 0.6) * card);
		// and pooled behind the title
		float r = length((p - pool.xy) / pool.zw);
		vec4 pc = r < 0.55 ? mix(vec4(0.471, 0.941, 0.882, 0.2), vec4(0.235, 0.745, 0.745, 0.07), r / 0.55)
				: vec4(0.235, 0.745, 0.745, mix(0.07, 0.0, clamp((r - 0.55) / 0.2, 0.0, 1.0)));
		col = over(col, pc.rgb, pc.a * card);
	}
	if (hurt > 0.0) {
		float d = length((uv - 0.5) / vec2(0.75, 0.7));
		col = over(col, vec3(0.588, 0.094, 0.047), 0.5 * clamp((d - 0.45) / 0.55, 0.0, 1.0) * hurt);
	}
	return col;
}
