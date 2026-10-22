// The view drowned once she's gone, as the web game grades it when the camera
// stays above a wreck on a reef: the picture swims and blurs, reds drown first
// and the light thins to a green-blue gloom brightening toward the surface,
// sun shafts sway down the screen and caustics play near the top; then the
// farewell's veil over it (shaders/inc/farewell.gdshaderinc), all in one
// pass. src/ui/wreck_screen.gd.
shader_type canvas_item;

#include "res://shaders/inc/farewell.gdshaderinc"

uniform sampler2D screen : hint_screen_texture, filter_linear_mipmap;
/// 0 above .. 1 drowned.
uniform float depth = 0.0;

void fragment() {
	vec2 uv = SCREEN_UV;
	float t = TIME;
	// up is up here, as on the web
	float yv = 1.0 - uv.y;
	vec2 sw = uv + vec2(sin(yv * 17.0 + t * 1.3) + sin(yv * 31.0 - t * 0.9) * 0.5, cos(uv.x * 13.0 + t * 1.1)) * 0.0028 * depth;
	// deep water's soft focus
	vec3 c = textureLod(screen, sw, depth * 2.2).rgb;
	c = c * c;
	vec3 abyss = mix(vec3(0.004, 0.03, 0.05), vec3(0.05, 0.3, 0.34), yv * yv);
	vec3 seen = c * vec3(0.18, 0.62, 0.74) + abyss;
	c = mix(c, seen * 0.55, depth);
	float on = min(depth * 3.0, 1.0);
	float sx = uv.x + (1.0 - yv) * 0.22;
	float rays = max(sin(sx * 21.0 + t * 0.35) * sin(sx * 34.0 - t * 0.27) * sin(sx * 9.0 + t * 0.13), 0.0);
	rays *= rays * smoothstep(0.05, 1.0, yv);
	float cz = sin(uv.x * 40.0 + sin(yv * 23.0 + t) * 2.0 + t * 0.8) * sin(yv * 37.0 - t * 0.6);
	c += vec3(0.32, 0.72, 0.68) * (rays * 0.42 + max(cz, 0.0) * smoothstep(0.6, 1.0, yv) * 0.12) * on;
	vec2 vc = uv - 0.5;
	c *= 1.0 - dot(vc, vc) * depth * 0.9;
	COLOR = farewell(vec4(sqrt(max(c, 0.0)), 1.0), UV);
}
