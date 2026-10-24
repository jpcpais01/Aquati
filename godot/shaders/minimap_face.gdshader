// The round minimap as the web's #minimap shows its canvas: a disc with a
// soft drop shadow under it and a shade inside its rim, drawn in one quad a
// little bigger than the disc (the shadow spills past it). The canvas is the
// minimap's own viewport, redrawn a few times a second (src/ui/minimap.gd).
shader_type canvas_item;

uniform sampler2D map : repeat_disable, filter_linear;
/// The quad drawn, and the disc's centre and radius in it, in HUD units.
uniform vec2 quad = vec2(200.0, 200.0);
uniform vec2 centre = vec2(100.0, 100.0);
uniform float radius = 86.0;
/// The drop shadow: colour, then (y offset, blur); the shade inside: colour, blur.
uniform vec4 c_shadow = vec4(0.0, 0.031, 0.055, 0.35);
uniform vec2 shadow = vec2(26.0, 63.0);
uniform vec4 c_inset = vec4(0.0, 0.0, 0.0, 0.35);
uniform float inset = 55.0;

vec4 over(vec4 dst, vec3 rgb, float a) {
	float oa = a + dst.a * (1.0 - a);
	return vec4((rgb * a + dst.rgb * dst.a * (1.0 - a)) / max(oa, 1e-5), oa);
}

// a CSS box-shadow's gaussian edge (blur radius b) at signed distance d
float soft(float d, float b) {
	return 1.0 - smoothstep(-b * 1.05, b * 1.05, d);
}

void fragment() {
	vec2 p = UV * quad - centre;
	float d = length(p) - radius;
	float aa = max(fwidth(d), 1e-3);
	float body = clamp(0.5 - d / aa, 0.0, 1.0);
	vec4 col = vec4(0.0);
	float ds = length(p - vec2(0.0, shadow.x)) - radius;
	col = over(col, c_shadow.rgb, c_shadow.a * soft(ds, shadow.y) * (1.0 - body));
	vec3 m = texture(map, p / (2.0 * radius) + 0.5).rgb;
	m = mix(m, c_inset.rgb, c_inset.a * (1.0 - soft(d, inset)));
	col = over(col, m, body);
	COLOR = col;
}
