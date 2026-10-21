// The web game's vignette, laid over the finished frame: it darkened linear
// light by 1 - r^2 * strength, which over sRGB is the same factor to the
// power 1 / 2.2.
shader_type canvas_item;

uniform float strength = 0.55;

void fragment() {
	vec2 vc = UV - 0.5;
	float f = max(1.0 - dot(vc, vc) * strength, 0.0);
	COLOR = vec4(0.0, 0.0, 0.0, 1.0 - pow(f, 1.0 / 2.2));
}
