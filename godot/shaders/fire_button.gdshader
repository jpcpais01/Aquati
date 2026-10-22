// A gun button on the touch pad, drawn whole in one quad round it: the web
// game's glass Port and Stbd buttons with their reload rings, and the big
// gold Fire. Every shadow, glow and ring is a soft step of the distance to
// the button's disc, painted back to front as the CSS stacks them (outer
// shadows only outside the disc, as a browser clips them). src/ui/fire_pad.gd.
shader_type canvas_item;

/// The quad drawn round the button, and the button's radius (HUD units).
uniform vec2 quad = vec2(190.0, 190.0);
uniform float radius = 46.5;
/// 1: the gold Fire button.
uniform float gold = 0.0;
/// Side buttons: reload 0 just fired .. 1 run out; ready, aim and hot ease 0..1.
uniform float reload = 1.0;
uniform float ready = 1.0;
uniform float aim = 0.0;
uniform float hot = 0.0;
/// 0..1 through the warm ring that bursts off a side as its guns run out
/// again mid-fight (0: none), and through the coral flush of a press while
/// they're still loading.
uniform float ping = 0.0;
uniform float flash = 0.0;

const vec3 GOLD = vec3(0.957, 0.78, 0.396);

// paints rgb at coverage a over dst (straight alpha)
vec4 over(vec4 dst, vec3 rgb, float a) {
	float oa = a + dst.a * (1.0 - a);
	return vec4((rgb * a + dst.rgb * dst.a * (1.0 - a)) / max(oa, 1e-5), oa);
}

// a CSS box-shadow's gaussian edge (blur radius b) at signed distance d
float soft(float d, float b) {
	return 1.0 - smoothstep(-b * 1.05, b * 1.05, d);
}

void fragment() {
	vec2 q = UV * quad - quad * 0.5;
	float r = radius;
	float d = length(q) - r;
	float aa = max(fwidth(d), 1e-3);
	float body = clamp(0.5 - d / aa, 0.0, 1.0);
	float outside = 1.0 - body;
	vec4 col = vec4(0.0);
	if (gold > 0.5) {
		// warm: a 7px gold halo; the 4px dark collar over it; the drop glow over both
		col = over(col, GOLD, 0.3 * hot * clamp(0.5 - (d - 7.0) / aa, 0.0, 1.0) * outside);
		col = over(col, vec3(0.024, 0.078, 0.118), 0.42 * clamp(0.5 - (d - 4.0) / aa, 0.0, 1.0) * outside);
		float ds = length(q - vec2(0.0, 12.0)) - r;
		col = over(col, vec3(0.957, 0.706, 0.275), mix(0.38, 0.5, hot) * soft(ds, 32.0) * outside);
		// a sunlit gold boss, lit from high on its face
		float t = length(q - vec2(0.0, -0.44 * r)) / (1.753 * r);
		vec3 bc = t < 0.52 ? mix(vec3(1.0, 0.957, 0.812), GOLD, t / 0.52) : mix(GOLD, vec3(0.831, 0.584, 0.184), (t - 0.52) / 0.48);
		col = over(col, bc, body);
		// a bright lip along the top inside the rim, a shade along the bottom
		col = over(col, vec3(1.0), 0.6 * body * clamp(0.5 + (length(q - vec2(0.0, 2.0)) - r) / aa, 0.0, 1.0));
		col = over(col, vec3(0.549, 0.353, 0.078), 0.3 * body * clamp(0.5 + (length(q + vec2(0.0, 3.0)) - r) / aa, 0.0, 1.0));
	} else {
		// its drop shadow, or (hot) a gold glow round the rim instead
		float ds = length(q - vec2(0.0, 8.0)) - r;
		col = over(col, vec3(0.0, 0.031, 0.055), 0.3 * (1.0 - hot) * soft(ds, 22.0) * outside);
		col = over(col, GOLD, 0.4 * hot * soft(d, 12.0) * outside);
		// guns run out again: a warm ring bursting off the rim
		if (ping > 0.0) {
			float e = 1.0 - (1.0 - ping) * (1.0 - ping);
			col = over(col, vec3(1.0, 0.863, 0.549), 0.8 * (1.0 - e) * clamp(0.5 - (d - 16.0 * e) / aa, 0.0, 1.0) * outside);
		}
		// glass, darkening downward; it flushes coral at a press while the guns load
		float v = clamp((q.y + r) / (2.0 * r), 0.0, 1.0);
		vec4 glass = mix(vec4(0.063, 0.157, 0.212, 0.76), vec4(0.024, 0.078, 0.118, 0.88), v);
		glass = mix(glass, vec4(1.0, 0.459, 0.388, 0.32), smoothstep(0.0, 1.0, sin(clamp(flash, 0.0, 1.0) * PI)));
		col = over(col, glass.rgb, glass.a * body);
		// a hairline of light just inside the top
		col = over(col, vec3(1.0), 0.09 * (1.0 - hot) * body * clamp(0.5 + (length(q - vec2(0.0, 1.0)) - r) / aa, 0.0, 1.0));
		// the rim: a hairline, gold while the big Fire would loose this side
		vec4 rc = mix(vec4(1.0, 1.0, 1.0, 0.11), vec4(GOLD, 0.8), aim);
		col = over(col, rc.rgb, rc.a * body * clamp(0.5 + (d + 1.0) / aa, 0.0, 1.0));
		// run out: the reload ring glows gold
		float ring_out = clamp(0.5 + (d - 3.0) / aa, 0.0, 1.0);
		col = over(col, GOLD, 0.6 * ready * soft(d - 3.0, 12.0) * ring_out);
		// the reload ring just outside the rim: aqua sweeping round clockwise from
		// the top as the guns load, all gold once they're run out
		float ring = clamp(0.5 + d / aa, 0.0, 1.0) * (1.0 - ring_out);
		float a01 = fract(atan(q.x, -q.y) / TAU + 1.0);
		float swept = clamp(0.5 + (reload - a01) * TAU * length(q) / aa, 0.0, 1.0);
		vec4 rl = mix(vec4(1.0, 1.0, 1.0, 0.1), vec4(0.369, 0.89, 0.831, 1.0), swept);
		rl = mix(rl, vec4(GOLD, 1.0), ready);
		col = over(col, rl.rgb, rl.a * ring);
	}
	COLOR = col;
}
