// The words of a letter come aboard, inking themselves in as you read: line
// by line, left to right, the newest strokes still wet and dark. One per
// text block of src/ui/letter_card.gd, `ink` counted in its own lines.
shader_type canvas_item;

/// How far the pen has got: lines written, and the share of the next.
uniform float ink = 1000.0;
uniform float line_h = 20.0;
uniform float width = 200.0;

varying vec2 pos;

void vertex() {
	pos = VERTEX;
}

void fragment() {
	float u = floor(pos.y / line_h) + clamp(pos.x / width, 0.0, 1.0);
	float a = 1.0 - smoothstep(ink - 0.07, ink, u);
	float wet = smoothstep(ink - 0.45, ink - 0.04, u);
	COLOR = vec4(COLOR.rgb * (1.0 - 0.35 * wet), COLOR.a * a);
}
