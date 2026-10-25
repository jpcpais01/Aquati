// Photo mode's film look over the finished frame (the web's PhotoLook in the
// final pass): saturation and contrast, a lifted fade, a tint, a toned
// monochrome, a vignette and grain. Only drawn while photo mode is open.
shader_type canvas_item;
render_mode unshaded;

uniform sampler2D screen: hint_screen_texture, filter_linear;
uniform float saturation = 1.0;
uniform float contrast = 1.0;
uniform float fade = 0.0;
uniform float grain = 0.0;
uniform float vignette = 0.0;
uniform vec3 tint = vec3(1.0);
uniform vec3 mono = vec3(1.0);
uniform float mono_amount = 0.0;
uniform float seed = 0.0;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(12.9898, 78.233)) + seed) * 43758.5453);
}

void fragment() {
	vec3 c = texture(screen, SCREEN_UV).rgb;
	float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
	c = mix(vec3(l), c, saturation);
	c = (c - 0.5) * contrast + 0.5;
	c *= tint;
	float m = dot(clamp(c, 0.0, 1.0), vec3(0.2126, 0.7152, 0.0722));
	c = mix(c, m * mono, mono_amount);
	// faded: the blacks lifted toward a warm grey
	c = mix(c, vec3(0.16, 0.15, 0.14) + c * 0.82, fade);
	vec2 q = SCREEN_UV - 0.5;
	q.x *= SCREEN_PIXEL_SIZE.y / SCREEN_PIXEL_SIZE.x;
	float v = smoothstep(0.25, 0.95, length(q) * 1.15);
	c *= 1.0 - vignette * v * 0.85;
	c += (hash(FRAGCOORD.xy) - 0.5) * grain * 2.0;
	COLOR = vec4(clamp(c, 0.0, 1.0), 1.0);
}
