// The loading screen's shade over its scene, as the web's .load-scenes::after
// layers it: a dark pool behind the name, a shade across the top and a
// deeper one along the foot, and the corners vignetted. All one ink, so the
// three layers fold into one alpha.
shader_type canvas_item;

void fragment() {
	vec2 p = UV - 0.5;
	// radial-gradient(ellipse 60% 45% at 50% 46%, ink .55, transparent 75%)
	float pool = 0.55 * (1.0 - smoothstep(0.0, 0.75, length((UV - vec2(0.5, 0.46)) / vec2(0.6, 0.45))));
	// linear-gradient(to bottom, ink .25, transparent 30%, transparent 60%, ink .7)
	float y = UV.y;
	float band = y < 0.3 ? 0.25 * (1.0 - y / 0.3) : (y > 0.6 ? 0.7 * (y - 0.6) / 0.4 : 0.0);
	// radial-gradient(ellipse at center, transparent 55%, ink .6): out to the corners
	float r = length(p / vec2(0.7071));
	float vig = 0.6 * clamp((r - 0.55) / 0.45, 0.0, 1.0);
	float a = 1.0 - (1.0 - pool) * (1.0 - band) * (1.0 - vig);
	COLOR = vec4(4.0 / 255.0, 20.0 / 255.0, 29.0 / 255.0, a);
}
