// The Shipwright's colours (src/ui/shipwright.gd, src/ui/colour_pop.gd):
// the "any colour" swatch (the web's conic rainbow, with the colour picked
// in its middle once it's chosen), and the picker's saturation and value
// square and its hue strip, each with rounded corners.
shader_type canvas_item;

/// 0 the square (saturation across, value down), 1 the hue strip (down),
/// 2 the rainbow swatch.
uniform int mode = 0;
uniform float hue = 0.0;
uniform vec2 rect = vec2(100.0, 100.0);
uniform float radius = 8.0;
/// The swatch's colour picked, and how far out it reaches (a share of the
/// radius; 0: none yet).
uniform vec4 picked = vec4(1.0);
uniform float centre = 0.0;

vec3 hsv(float h, float s, float v) {
	vec3 k = clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
	return v * mix(vec3(1.0), k, s);
}

float sd_box(vec2 p, vec2 hb, float r) {
	vec2 q = abs(p) - hb + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void fragment() {
	vec2 p = UV * rect;
	vec4 out_col;
	if (mode == 2) {
		// conic-gradient(from 0deg, #f05a5a, #f5c542, #6fd36a, #3fc3e0, #6a6af0, #e05ae0, #f05a5a)
		vec2 c = p - rect * 0.5;
		float r = min(rect.x, rect.y) * 0.5;
		float d = length(c);
		float a = fract(atan(c.x, -c.y) / 6.2831853) * 6.0;
		vec3 stops[7] = vec3[7](vec3(0.941, 0.353, 0.353), vec3(0.961, 0.773, 0.259), vec3(0.435, 0.827, 0.416),
				vec3(0.247, 0.765, 0.878), vec3(0.416, 0.416, 0.941), vec3(0.878, 0.353, 0.878), vec3(0.941, 0.353, 0.353));
		int i = int(floor(a));
		vec3 col = mix(stops[i], stops[i + 1], a - float(i));
		float aa = max(fwidth(d), 1e-3);
		if (centre > 0.0) {
			col = mix(col, picked.rgb, clamp((r * centre - d) / aa + 0.5, 0.0, 1.0));
		}
		out_col = vec4(col, clamp((r - d) / aa + 0.5, 0.0, 1.0));
	} else {
		vec3 col = mode == 0 ? hsv(hue, UV.x, 1.0 - UV.y) : hsv(UV.y, 1.0, 1.0);
		float d = sd_box(p - rect * 0.5, rect * 0.5, radius);
		out_col = vec4(col, clamp(0.5 - d / max(fwidth(d), 1e-3), 0.0, 1.0));
	}
	COLOR = out_col;
}
