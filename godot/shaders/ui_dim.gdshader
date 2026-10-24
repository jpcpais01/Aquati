// A picture greyed and darkened (the web's filter: grayscale() brightness()):
// a ship part not yet found, on the Shipwright's Refit tab.
shader_type canvas_item;

uniform float grey = 0.9;
uniform float bright = 0.45;

void fragment() {
	vec4 c = texture(TEXTURE, UV) * COLOR;
	float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
	COLOR = vec4(mix(c.rgb, vec3(l), grey) * bright, c.a);
}
