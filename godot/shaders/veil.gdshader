// The veil between scenes (src/ui/veil.gd), as the web draws its #sw-veil: a
// radial wash of the deep sea, lightest a little above the middle, and how
// far it has come over the screen.
shader_type canvas_item;

uniform float alpha = 0.0;

const vec3 MID = vec3(19.0, 90.0, 106.0) / 255.0;
const vec3 HALF = vec3(11.0, 53.0, 70.0) / 255.0;
const vec3 RIM = vec3(6.0, 28.0, 39.0) / 255.0;

void fragment() {
	// CSS's ellipse at 50% 45% out to the farthest corner
	float d = length((UV - vec2(0.5, 0.45)) / vec2(0.7071, 0.7778));
	vec3 c = d < 0.5 ? mix(MID, HALF, d / 0.5) : mix(HALF, RIM, clamp((d - 0.5) / 0.5, 0.0, 1.0));
	// a whisper of noise: a gradient this dark and this wide bands on 8 bits
	c += (fract(sin(dot(FRAGCOORD.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
	COLOR = vec4(c, alpha);
}
