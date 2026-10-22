// Text painted with a vertical gradient through its line, as the web game
// clips a CSS gradient to the glyphs (background-clip: text): the gold of a
// ship's name and the renown, and "Lost to the Depths" lit from above.
// The gradient runs over `height` units from `top` in the item's own space,
// so it rides with each letter as it moves. src/ui/wreck_screen.gd.
shader_type canvas_item;

uniform vec4 c0 = vec4(1.0, 0.918, 0.69, 1.0);
uniform vec4 c1 = vec4(0.965, 0.78, 0.4, 1.0);
uniform vec4 c2 = vec4(0.878, 0.643, 0.263, 1.0);
uniform vec4 c3 = vec4(0.878, 0.643, 0.263, 1.0);
/// Where c1 and c2 sit (0..1 down the line).
uniform vec2 stops = vec2(0.52, 1.0);
uniform float top = 0.0;
uniform float height = 40.0;

varying float k;

void vertex() {
	k = (VERTEX.y - top) / height;
}

void fragment() {
	float t = clamp(k, 0.0, 1.0);
	vec4 g = t < stops.x ? mix(c0, c1, t / stops.x) : (t < stops.y ? mix(c1, c2, (t - stops.x) / (stops.y - stops.x)) : mix(c2, c3, (t - stops.y) / max(1.0 - stops.y, 1e-4)));
	COLOR = vec4(g.rgb, g.a * texture(TEXTURE, UV).a * COLOR.a);
}
