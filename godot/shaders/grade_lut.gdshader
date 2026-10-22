// Paints the colour grade into a 32x32x32 lookup table laid out as 32 slices
// side by side (see src/render/grade.gd). The environment's linear tonemapper
// hands it sRGB(scene light x exposure / 2); this undoes that encoding and
// runs the web game's own grade: split-tone, its colour-keeping tone curve,
// saturation and vibrance, and a contrast S-curve on the display values. A
// soft shoulder stretches the top of the range (a phone's colour buffer holds
// no more than 2) so a glint is white.
shader_type canvas_item;
render_mode unshaded, blend_disabled;

uniform vec3 split_lo = vec3(0.9, 1.0, 1.1);
uniform vec3 split_hi = vec3(1.06, 1.0, 0.92);
uniform float sat = 1.05;
uniform float contrast = 0.24;
uniform float vibrance = 0.3;

const float N = 32.0;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 to_linear(vec3 c) {
	return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, lessThan(c, vec3(0.04045)));
}

vec3 to_srgb(vec3 c) {
	return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, c * 12.92, lessThan(c, vec3(0.0031308)));
}

vec3 aces(vec3 x) {
	const float a = 2.51;
	const float b = 0.03;
	const float c = 2.43;
	const float d = 0.59;
	const float e = 0.14;
	return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// Run on each channel alone, ACES squeezes a bright colour's channels
// together: a blue sky or a turquoise lagoon comes out pale and milky. So the
// midtones mostly take the curve on their brightness and keep their hue,
// handing back to the per-channel curve toward the highlights, so the sun,
// the foam and the glints still burn out to white the way film does.
vec3 tonemap(vec3 x) {
	vec3 pc = aces(x);
	float L = dot(x, LUMA);
	vec3 hp = x * (aces(vec3(L)).r / max(L, 1e-5));
	// a channel pushed past white spills into the others instead of clipping to a hue
	float over = max(max(hp.r, max(hp.g, hp.b)) - 1.0, 0.0);
	hp = min(hp + over * 0.6, vec3(1.0));
	return mix(pc, hp, 0.62 * (1.0 - smoothstep(0.7, 3.5, L)));
}

void fragment() {
	vec2 px = floor(FRAGCOORD.xy);
	vec3 u = (vec3(mod(px.x, N), px.y, floor(px.x / N)) + 0.5) / N;
	vec3 col = to_linear(u) * 2.0;
	// the shoulder: untouched up to 1.2, then stretched so 2 lands near white
	float m = max(col.r, max(col.g, col.b));
	float e = max(m - 1.2, 0.0);
	col *= (m + 3.9 * e * e) / max(m, 1e-4);

	// gentle split-tone grade: sky-blue shade, warm light
	float lum = dot(col, LUMA);
	col = mix(col, col * split_lo, (1.0 - smoothstep(0.0, 0.6, lum)) * 0.35);
	col = mix(col, col * split_hi, smoothstep(0.5, 2.0, lum) * 0.3);
	col = tonemap(col);
	// saturation lift for that sun-drenched toy palette, and vibrance on top:
	// the duller a colour, the more it is lifted, so the sand and the sails
	// stay clean while the sea, the sky and the palms come alive
	float l2 = dot(col, LUMA);
	col = mix(vec3(l2), col, sat);
	float chroma = max(col.r, max(col.g, col.b)) - min(col.r, min(col.g, col.b));
	col = max(mix(vec3(l2), col, 1.0 + vibrance * (1.0 - smoothstep(0.0, 0.6, chroma))), 0.0);
	col = to_srgb(clamp(col, 0.0, 1.0));
	// contrast as the eye sees it: an S-curve on the display values about their
	// middle grey deepens the shade and lifts the light, so the picture has
	// depth instead of sitting in a soft, even haze
	col = mix(col, col * col * (3.0 - 2.0 * col), contrast);
	COLOR = vec4(col, 1.0);
}
