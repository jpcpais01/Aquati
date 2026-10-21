// Paints the colour grade into a 32x32x32 lookup table laid out as 32 slices
// side by side (see src/render/grade.gd). The environment's linear tonemapper
// hands it sRGB(scene light x exposure / 2); this undoes that encoding and
// runs the web game's own grade: split-tone, the Narkowicz ACES fit, a gentle
// S-curve and a saturation lift. A soft shoulder stretches the top of the
// range (a phone's colour buffer holds no more than 2) so a glint is white.
shader_type canvas_item;
render_mode unshaded, blend_disabled;

uniform vec3 split_lo = vec3(0.94, 1.02, 1.06);
uniform vec3 split_hi = vec3(1.05, 1.0, 0.94);
uniform float sat = 1.12;

const float N = 32.0;

vec3 to_linear(vec3 c) {
	return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, lessThan(c, vec3(0.04045)));
}

vec3 to_srgb(vec3 c) {
	return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, c * 12.92, lessThan(c, vec3(0.0031308)));
}

vec3 aces(vec3 x) {
	const float a = 2.51;
	const float b = 0.03;
	const float c = 2.43;
	const float d = 0.59;
	const float e = 0.14;
	return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void fragment() {
	vec2 px = floor(FRAGCOORD.xy);
	vec3 u = (vec3(mod(px.x, N), px.y, floor(px.x / N)) + 0.5) / N;
	vec3 col = to_linear(u) * 2.0;
	// the shoulder: untouched up to 1.2, then stretched so 2 lands near white
	float m = max(col.r, max(col.g, col.b));
	float e = max(m - 1.2, 0.0);
	col *= (m + 3.9 * e * e) / max(m, 1e-4);

	// gentle split-tone grade: teal shadows, warm highlights
	float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
	col = mix(col, col * split_lo, (1.0 - smoothstep(0.0, 0.6, lum)) * 0.35);
	col = mix(col, col * split_hi, smoothstep(0.5, 2.0, lum) * 0.3);
	col = aces(col);
	// deeper shade and cleaner highlights, so a hazy distance still has punch
	col = mix(col, col * col * (3.0 - 2.0 * col), 0.14);
	// saturation lift for that sun-drenched toy palette
	float l2 = dot(col, vec3(0.2126, 0.7152, 0.0722));
	col = mix(vec3(l2), col, sat);
	COLOR = vec4(to_srgb(clamp(col, 0.0, 1.0)), 1.0);
}
