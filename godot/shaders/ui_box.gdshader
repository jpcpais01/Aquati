// A rounded glass panel or a gold button, drawn whole in one quad round it
// as the web game's CSS paints a box: its drop shadow and glow outside, the
// gradient fill, the inset hairlines along the top and foot, a glint that
// sweeps across now and then, and the border. src/ui/wreck_screen.gd.
shader_type canvas_item;

/// The quad drawn, and the box in it (top-left, size), in HUD units.
uniform vec2 quad = vec2(200.0, 100.0);
uniform vec2 at = vec2(0.0, 0.0);
uniform vec2 box = vec2(200.0, 100.0);
uniform float radius = 20.0;
/// The fill, top to foot through `mid` (mid < 0: two stops).
uniform vec4 c_top = vec4(0.063, 0.165, 0.22, 0.64);
uniform vec4 c_mid = vec4(0.0);
uniform vec4 c_foot = vec4(0.02, 0.075, 0.11, 0.78);
uniform float mid = -1.0;
/// A radial fill instead (z > 0): c_top at the centre (x, y) fading to c_foot
/// at radial_stop of the ellipse's radii (z, w), all as shares of the box.
uniform vec4 radial = vec4(0.0);
uniform float radial_stop = 1.0;
uniform vec4 c_border = vec4(1.0, 1.0, 1.0, 0.11);
uniform float border = 1.0;
/// A hard ring round the outside (box-shadow 0 0 0 ring), its width.
uniform vec4 c_ring = vec4(0.0);
uniform float ring = 0.0;
/// The drop shadow: colour, then (y offset, blur).
uniform vec4 c_shadow = vec4(0.0, 0.031, 0.055, 0.38);
uniform vec2 shadow = vec2(18.0, 50.0);
/// A glow round the box (box-shadow 0 0 blur), its blur.
uniform vec4 c_glow = vec4(0.0);
uniform float glow = 0.0;
/// The inset hairline of light along the top, and a shade along the foot (its height).
uniform float hi = 0.09;
uniform float hi_px = 1.0;
uniform vec4 c_lo = vec4(0.0);
uniform float lo_px = 0.0;
/// 0..1 through the glint's sweep, < 0 none: a band `sheen_w` of the box
/// wide, from `sheen_span.x` to `sheen_span.y` band widths across, at most
/// `sheen_a` bright (the farewell's; Set Sail's is narrower and brighter).
uniform float sheen = -1.0;
uniform float sheen_w = 0.46;
uniform vec2 sheen_span = vec2(-1.2, 3.3);
uniform float sheen_a = 0.55;

vec4 over(vec4 dst, vec3 rgb, float a) {
	float oa = a + dst.a * (1.0 - a);
	return vec4((rgb * a + dst.rgb * dst.a * (1.0 - a)) / max(oa, 1e-5), oa);
}

// a CSS box-shadow's gaussian edge (blur radius b) at signed distance d
float soft(float d, float b) {
	return 1.0 - smoothstep(-b * 1.05, b * 1.05, d);
}

float sd_box(vec2 p, vec2 hb, float r) {
	vec2 q = abs(p) - hb + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void fragment() {
	vec2 hb = box * 0.5;
	vec2 p = UV * quad - at - hb;
	float r = min(radius, min(hb.x, hb.y));
	float d = sd_box(p, hb, r);
	float aa = max(fwidth(d), 1e-3);
	float body = clamp(0.5 - d / aa, 0.0, 1.0);
	float outside = 1.0 - body;
	vec4 col = vec4(0.0);
	if (c_shadow.a > 0.0) {
		float ds = sd_box(p - vec2(0.0, shadow.x), hb, r);
		col = over(col, c_shadow.rgb, c_shadow.a * soft(ds, shadow.y) * outside);
	}
	if (glow > 0.0 && c_glow.a > 0.0) {
		col = over(col, c_glow.rgb, c_glow.a * soft(d, glow) * outside);
	}
	if (ring > 0.0) {
		col = over(col, c_ring.rgb, c_ring.a * outside * clamp(0.5 - (d - ring) / aa, 0.0, 1.0));
	}
	float v = clamp((p.y + hb.y) / box.y, 0.0, 1.0);
	vec4 f = mid < 0.0 ? mix(c_top, c_foot, v) : (v < mid ? mix(c_top, c_mid, v / mid) : mix(c_mid, c_foot, (v - mid) / (1.0 - mid)));
	if (radial.z > 0.0) {
		vec2 q = ((p + hb) / box - radial.xy) / radial.zw;
		f = mix(c_top, c_foot, clamp(length(q) / radial_stop, 0.0, 1.0));
	}
	col = over(col, f.rgb, f.a * body);
	// inset 0 1px 0: the box less itself moved down a pixel; the foot's shade the same way up
	col = over(col, vec3(1.0), hi * body * clamp(0.5 + sd_box(p - vec2(0.0, hi_px), hb, r) / aa, 0.0, 1.0));
	if (lo_px > 0.0) {
		col = over(col, c_lo.rgb, c_lo.a * body * clamp(0.5 + sd_box(p + vec2(0.0, lo_px), hb, r) / aa, 0.0, 1.0));
	}
	if (sheen >= 0.0) {
		// a skewed band sweeping from well off its left to past its right
		float bw = box.x * sheen_w;
		float x = p.x + hb.x + p.y * 0.325 - mix(sheen_span.x, sheen_span.y, sheen) * bw;
		float k = clamp(x / bw, 0.0, 1.0);
		float g = 1.0 - abs(k * 2.0 - 1.0);
		col = over(col, vec3(1.0), sheen_a * g * step(0.0, x) * step(x, bw) * body);
	}
	if (border > 0.0) {
		col = over(col, c_border.rgb, c_border.a * body * clamp(0.5 + (d + border) / aa, 0.0, 1.0));
	}
	COLOR = col;
}
