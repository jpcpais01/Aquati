// A round of shot on the HUD, drawn whole in one quad round it as the web
// game's CSS paints it (src/ui/shot_disc.gd): the touch shot button, glass
// tinted with the shot's colour; and the balls of the desktop shot rack,
// the loaded one ringed by its two reload halves (port the left half,
// starboard the right, each sweeping up from the foot as her guns load,
// white when they're run out, gold with a foe in that side's arc).
// Shadows, glows and rings are soft steps of the distance to the disc,
// painted back to front as CSS stacks them.
shader_type canvas_item;

/// The quad drawn round the disc, and the disc's radius (HUD units).
uniform vec2 quad = vec2(120.0, 120.0);
uniform float radius = 23.0;
/// The shot's colour.
uniform vec4 ac : source_color = vec4(0.851, 0.886, 0.902, 1.0);
/// 0 the glass of a button or a chip, 1 a ball in the rack.
uniform float style = 0.0;
/// Glass: how much of the shot's colour tints it, its glass and foot
/// (rgba), its edge, and its drop shadow's strength.
uniform float tint = 0.18;
uniform vec4 c_glass = vec4(0.063, 0.157, 0.212, 0.86);
uniform vec4 c_foot = vec4(0.024, 0.078, 0.118, 0.94);
uniform vec4 c_edge = vec4(1.0, 1.0, 1.0, 0.11);
uniform float drop = 0.35;
/// Glass, eased 0..1: chosen (a white ring and the shot's glow) and open
/// (the focus ring).
uniform float sel = 0.0;
uniform float focus = 0.0;
/// The rack, eased 0..1: loaded (tinted, its reload halves showing) and
/// under the mouse.
uniform float lit = 0.0;
uniform float hover = 0.0;
/// The reload halves (port, starboard): how far loaded, whether run out and
/// whether hot, eased 0..1; and 0..1 through a coral flush (pressed while
/// loading) and a bright ping (run out again mid-fight), 0 none.
uniform vec2 rl = vec2(1.0);
uniform vec2 rdy = vec2(1.0);
uniform vec2 hot = vec2(0.0);
uniform vec2 flash = vec2(0.0);
uniform vec2 ping = vec2(0.0);
/// The halves' ring: how far outside the ball, and its width.
uniform float ring_out = 5.5;
uniform float ring_w = 3.8;

const vec3 GOLD = vec3(0.957, 0.78, 0.396);
const vec3 AQUA = vec3(0.369, 0.89, 0.831);
const vec3 CORAL = vec3(1.0, 0.459, 0.388);
const float HALF = 178.0 / 180.0 * PI;

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

// one reload half of the ring, from the foot round its side (sgn -1 left, +1 right)
vec4 half_ring(vec4 col, vec2 q, float sgn, float fill, float ready, float h, float fl, float pg, float aa) {
	float R = radius + ring_out;
	float len = length(q);
	float band = abs(len - (R - ring_w * 0.5)) - ring_w * 0.5;
	float on_side = sgn * q.x >= 0.0 ? 1.0 : 0.0;
	float phi = atan(sgn * q.x, q.y);
	// the swept share lit, the rest a faint track, a hair of a gap at the top
	float arc_px = max(len, 1.0);
	float swept = clamp(0.5 + (fill * HALF - phi) * arc_px / aa, 0.0, 1.0);
	float track = clamp(0.5 + (HALF - phi) * arc_px / aa, 0.0, 1.0);
	float cover = clamp(0.5 - band / aa, 0.0, 1.0) * on_side;
	vec3 c = mix(AQUA, vec3(1.0), ready);
	c = mix(c, GOLD, h * ready);
	// the coral flush peaks 40% through
	float fk = fl > 0.0 ? (fl < 0.4 ? fl / 0.4 : (1.0 - fl) / 0.6) : 0.0;
	fk = smoothstep(0.0, 1.0, fk);
	c = mix(c, CORAL, fk);
	// the ping: twice as bright, easing back
	float pk = pg > 0.0 ? 1.0 - pg : 0.0;
	pk *= pk;
	c *= 1.0 + pk;
	// the glows: gold when hot, coral in the flush, warm off the ping
	float g = soft(band, 4.0) * (1.0 - cover) * swept * on_side;
	col = over(col, GOLD, 0.9 * h * ready * g * (1.0 - fk));
	col = over(col, CORAL, 0.95 * fk * soft(band, 6.0) * (1.0 - cover) * swept * on_side);
	col = over(col, vec3(1.0, 0.902, 0.627), pk * soft(band - 8.0 * (1.0 - pk), 8.0) * (1.0 - cover) * swept * on_side);
	col = over(col, vec3(1.0), 0.14 * cover * track * (1.0 - swept));
	col = over(col, min(c, vec3(1.0)), cover * swept);
	return col;
}

void fragment() {
	vec2 q = UV * quad - quad * 0.5;
	float r = radius;
	float d = length(q) - r;
	float aa = max(fwidth(d), 1e-3);
	float body = clamp(0.5 - d / aa, 0.0, 1.0);
	float outside = 1.0 - body;
	vec4 col = vec4(0.0);
	if (style < 0.5) {
		// open: the focus ring (a soft aqua glow, a faint 6 wide ring, a white 2)
		col = over(col, vec3(0.627, 0.941, 1.0), 0.28 * focus * soft(length(q - vec2(0.0, 10.0)) - r, 36.0) * outside);
		col = over(col, vec3(1.0), 0.14 * focus * clamp(0.5 - (d - 6.0) / aa, 0.0, 1.0) * outside);
		col = over(col, vec3(1.0), 0.95 * focus * clamp(0.5 - (d - 2.0) / aa, 0.0, 1.0) * outside);
		// chosen: the shot's glow and a white ring; else the drop shadow
		float plain = (1.0 - sel) * (1.0 - focus);
		col = over(col, vec3(0.0, 0.031, 0.055), drop * plain * soft(length(q - vec2(0.0, 8.0)) - r, 22.0) * outside);
		col = over(col, ac.rgb, 0.55 * sel * soft(d, 18.0) * outside);
		col = over(col, vec3(1.0), sel * clamp(0.5 - (d - 2.0) / aa, 0.0, 1.0) * outside);
		// the glass, its colour lit from a little above the middle
		vec4 c0 = grad(c_glass, vec4(ac.rgb, 1.0), tint);
		float t = length(q - vec2(0.0, -0.2 * r)) / (1.1715 * r);
		vec4 g = grad(c0, c_foot, t);
		col = over(col, g.rgb, g.a * body);
		// a hairline of light just inside the top, and the edge
		col = over(col, vec3(1.0), 0.09 * plain * body * clamp(0.5 + (length(q - vec2(0.0, 1.0)) - r) / aa, 0.0, 1.0));
		col = over(col, c_edge.rgb, c_edge.a * (1.0 - sel) * body * clamp(0.5 + (d + 1.0) / aa, 0.0, 1.0));
	} else {
		// the rack: a faint glass ball, warmer under the mouse, tinted when loaded
		vec4 off = grad(vec4(1.0, 1.0, 1.0, 0.16), vec4(1.0, 1.0, 1.0, 0.03), length(q - vec2(0.0, -0.24 * r)) / (1.115 * r));
		vec4 hv = grad(vec4(1.0, 1.0, 1.0, 0.14), vec4(0.0, 0.0, 0.0, 0.12), length(q - vec2(0.0, -0.2 * r)) / (1.562 * r));
		vec4 on = grad(vec4(ac.rgb, 0.3), vec4(0.016, 0.063, 0.094, 0.4), length(q - vec2(0.0, -0.1 * r)) / (1.07 * r));
		vec4 g = mix(mix(off, hv, hover * (1.0 - lit)), on, lit);
		col = over(col, g.rgb, g.a * body);
		col = over(col, vec3(1.0), 0.09 * (1.0 - lit) * body * clamp(0.5 + (d + 1.0) / aa, 0.0, 1.0));
		if (lit > 0.001) {
			vec4 rc = vec4(0.0);
			rc = half_ring(rc, q, -1.0, rl.x, rdy.x, hot.x, flash.x, ping.x, aa);
			rc = half_ring(rc, q, 1.0, rl.y, rdy.y, hot.y, flash.y, ping.y, aa);
			col = over(col, rc.rgb, rc.a * lit);
		}
	}
	COLOR = col;
}
