// The renown medal on the farewell card, drawn whole in one quad: its drop
// shadow and (once the renown lands) a gold glow, the dark disc, the ring
// filling gold toward the next rank with round ends, and the crest in it,
// its compass rose slowly turning. src/ui/wreck_screen.gd.
shader_type canvas_item;

/// The quad drawn round the medal, its radius, and CSS pixels in units.
uniform vec2 quad = vec2(300.0, 300.0);
uniform float radius = 60.0;
uniform float u = 1.0;
/// The ring's share filled (0..1), how far the medal has landed (0..1), and
/// 1 for a new best (a brighter glow).
uniform float fill = 0.0;
uniform float landed = 0.0;
uniform float best = 0.0;
/// The crest's still ring and dial, and its rose, each drawn over the
/// crest's square; and how far the rose has turned (radians).
uniform sampler2D crest : filter_linear_mipmap, repeat_disable;
uniform sampler2D rose : filter_linear_mipmap, repeat_disable;
uniform float crest_half = 40.0;
uniform float turn = 0.0;

const vec3 GOLD = vec3(0.957, 0.78, 0.396);

vec4 over(vec4 dst, vec3 rgb, float a) {
	float oa = a + dst.a * (1.0 - a);
	return vec4((rgb * a + dst.rgb * dst.a * (1.0 - a)) / max(oa, 1e-5), oa);
}

float soft(float d, float b) {
	return 1.0 - smoothstep(-b * 1.05, b * 1.05, d);
}

void fragment() {
	float R = radius;
	vec2 q = UV * quad - quad * 0.5;
	float d = length(q) - R;
	float aa = max(fwidth(d), 1e-3);
	float body = clamp(0.5 - d / aa, 0.0, 1.0);
	float outside = 1.0 - body;
	vec4 col = vec4(0.0);
	col = over(col, vec3(0.0), 0.35 * soft(length(q - vec2(0.0, 12.0 * u)) - R, 40.0 * u) * outside);
	col = over(col, GOLD, landed * mix(0.28, 0.5, best) * soft(d, mix(44.0, 70.0, best) * u) * outside);
	// the disc, lit a little above its middle
	float g = length(q - vec2(0.0, -0.24 * R)) / (1.593 * R);
	vec4 dc = mix(vec4(0.118, 0.353, 0.408, 0.6), vec4(0.016, 0.086, 0.125, 0.9), clamp(g / 0.7, 0.0, 1.0));
	col = over(col, dc.rgb, dc.a * body);
	// a hairline just inside the rim, gold once landed
	vec4 rim = mix(vec4(1.0, 1.0, 1.0, 0.06), vec4(GOLD, mix(0.25, 0.5, best)), landed);
	col = over(col, rim.rgb, rim.a * body * clamp(0.5 + (d + u) / aa, 0.0, 1.0));
	// the ring: its faint track, and the gold run clockwise from the top with round ends
	float rr = 0.9 * R;
	float hw = 0.0417 * R;
	float rd = abs(length(q) - rr) - hw;
	col = over(col, vec3(1.0), 0.09 * clamp(0.5 - rd / aa, 0.0, 1.0));
	if (fill > 0.001) {
		float a01 = fract(atan(q.x, -q.y) / TAU + 1.0);
		float f = clamp(fill, 0.0, 1.0);
		float bd = rd;
		if (a01 > f) {
			vec2 e = vec2(sin(f * TAU), -cos(f * TAU)) * rr;
			bd = min(length(q - vec2(0.0, -rr)), length(q - e)) - hw;
		}
		col = over(col, GOLD, clamp(0.5 - bd / aa, 0.0, 1.0));
	}
	// the crest: its still ring with a soft shadow, the rose turning in a glow of dark
	vec2 cu = q / (crest_half * 2.0) + 0.5;
	if (cu.x > -0.1 && cu.x < 1.1 && cu.y > -0.1 && cu.y < 1.1) {
		float sh = textureLod(crest, cu - vec2(0.0, 4.0 * u / (crest_half * 2.0)), 3.0).a;
		col = over(col, vec3(0.0), 0.35 * sh);
		vec4 cr = texture(crest, cu);
		col = over(col, cr.rgb, cr.a);
		float c = cos(turn);
		float s = sin(turn);
		vec2 ru = mat2(vec2(c, -s), vec2(s, c)) * (cu - 0.5) + 0.5;
		float rs = textureLod(rose, ru, 2.5).a;
		col = over(col, vec3(0.0), 0.4 * rs);
		vec4 ro = texture(rose, ru);
		col = over(col, ro.rgb, ro.a);
	}
	COLOR = col;
}
