// The sea chart's frame and the frosted world round it (the web game's
// #chart.screen.dim and .chart-frame): the world blurred and saturated a
// touch under a radial shade, the frame's deep shadow cast on it, and over
// the chart the frame's inset shade, its hairline of light along the top and
// its border. Drawn twice from src/ui/sea_chart.gd: under the chart over the
// whole screen (the frosted world and the shadow), and over the chart on
// the frame itself (the shade, the light and the border, and in the rounded
// corners the square chart would poke into, the frosted world again).
shader_type canvas_item;

#include "res://shaders/inc/menu_layers.gdshaderinc"

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
/// The blur's mip level, and the colour's saturation (1 as it was).
uniform float lod = 3.5;
uniform float saturate = 1.15;
/// Over the chart, on the frame's own quad (else under it, over the whole screen).
uniform bool chrome = false;
/// This quad's size, and the frame in it (top-left, size) with its corner
/// radius, in HUD units.
uniform vec2 quad = vec2(1280.0, 720.0);
uniform vec2 at = vec2(0.0);
uniform vec2 box = vec2(1280.0, 720.0);
uniform float radius = 37.0;
/// How far the frame has come in (its opacity; the frosted world has `fade`).
uniform float alpha = 1.0;
/// The frame's drop shadow: colour, then (y offset, blur).
uniform vec4 c_shadow = vec4(0.0, 0.0, 0.0, 0.5);
uniform vec2 shadow = vec2(74.0, 203.0);
/// The shade round its inside edge (box-shadow inset 0 0 blur): colour, blur.
uniform vec4 c_inset = vec4(0.016, 0.071, 0.102, 0.6);
uniform float inset = 166.0;
/// The hairline of light inset along its top (alpha, height), and its border.
uniform float hi = 0.12;
uniform float hi_px = 1.85;
uniform vec4 c_border = vec4(1.0, 1.0, 1.0, 0.2);
uniform float border = 1.85;

vec4 over(vec4 dst, vec3 rgb, float a) {
	float oa = a + dst.a * (1.0 - a);
	return vec4((rgb * a + dst.rgb * dst.a * (1.0 - a)) / max(oa, 1e-5), oa);
}

// a CSS box-shadow's gaussian edge (blur radius b) at signed distance d
float soft(float d, float b) {
	return 1.0 - smoothstep(-b * 1.05, b * 1.05, d);
}

float sd_box(vec2 p, vec2 hb, float r) {
	vec2 q = abs(p) - hb + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void fragment() {
	vec2 hb = box * 0.5;
	vec2 p = UV * quad - at - hb;
	float r = min(radius, min(hb.x, hb.y));
	float d = sd_box(p, hb, r);
	float aa = max(fwidth(d), 1e-3);
	float body = clamp(0.5 - d / aa, 0.0, 1.0);
	// the world behind, frosted and shaded
	vec2 px = SCREEN_PIXEL_SIZE * exp2(lod);
	vec3 c = textureLod(screen_tex, SCREEN_UV, lod).rgb * 0.4;
	c += textureLod(screen_tex, SCREEN_UV + vec2(px.x, px.y) * 0.75, lod).rgb * 0.15;
	c += textureLod(screen_tex, SCREEN_UV + vec2(-px.x, px.y) * 0.75, lod).rgb * 0.15;
	c += textureLod(screen_tex, SCREEN_UV + vec2(px.x, -px.y) * 0.75, lod).rgb * 0.15;
	c += textureLod(screen_tex, SCREEN_UV + vec2(-px.x, -px.y) * 0.75, lod).rgb * 0.15;
	float grey = dot(c, vec3(0.2126, 0.7152, 0.0722));
	c = max(mix(vec3(grey), c, saturate), 0.0);
	vec3 back = menu_layers(vec4(c, 1.0), SCREEN_UV).rgb;
	// the frame's shadow on it
	float ds = sd_box(p - vec2(0.0, shadow.x), hb, r);
	back = mix(back, c_shadow.rgb, c_shadow.a * soft(ds, shadow.y) * (1.0 - body) * alpha);
	if (!chrome) {
		COLOR = vec4(back, fade);
	} else {
		// over the chart: the shade inside its edge, the light along its top, the border
		vec4 deco = vec4(0.0);
		deco = over(deco, c_inset.rgb, c_inset.a * soft(-d, inset));
		deco = over(deco, vec3(1.0), hi * clamp(0.5 + sd_box(p - vec2(0.0, hi_px), hb, r) / aa, 0.0, 1.0));
		deco = over(deco, c_border.rgb, c_border.a * clamp(0.5 + (d + border) / aa, 0.0, 1.0));
		deco.a *= alpha;
		// and past its rounded corners, the frosted world as under it
		COLOR = mix(vec4(back, fade), deco, body);
	}
}
