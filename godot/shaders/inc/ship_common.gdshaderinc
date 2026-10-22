// Shared by the ship materials: a cheap hash and the air between the camera
// and the ship. (Needs atmos.gdshaderinc first.)

float hash11(float n) {
	return fract(sin(n * 127.1) * 43758.5453);
}

float hash21(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// A thin line of width w (in cells) at every whole number of x, antialiased
// by its own screen footprint so distant seams fade instead of shimmering.
float grid_line(float x, float w) {
	float f = abs(fract(x + 0.5) - 0.5);
	float fw = max(fwidth(x), 1e-4);
	float fade = 1.0 - smoothstep(0.35, 0.8, fw);
	return (1.0 - smoothstep(w - fw, w + fw, f)) * fade;
}

#include "res://shaders/inc/common.gdshaderinc"
