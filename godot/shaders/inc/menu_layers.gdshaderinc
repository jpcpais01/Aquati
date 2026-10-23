// The menus' backdrops as the web game's CSS layers them: a shade across
// from the left, shades down from the top and up from the foot, and an
// elliptical radial on top of them all, each a colour and its alphas. Shared
// by shaders/menu_shade.gdshader and shaders/menu_blur.gdshader.

/// Across from the left: alpha a.x at the edge, a.y at s.x, a.z from s.y on.
uniform vec3 lr_rgb = vec3(0.008, 0.055, 0.086);
uniform vec3 lr_a = vec3(0.0);
uniform vec2 lr_s = vec2(0.24, 0.4);
/// Down from the top and up from the foot: alpha at the edge, gone at the stop.
uniform vec3 top_rgb = vec3(0.008, 0.063, 0.102);
uniform float top_a = 0.0;
uniform float top_s = 0.2;
uniform vec3 foot_rgb = vec3(0.008, 0.063, 0.102);
uniform float foot_a = 0.0;
uniform float foot_s = 0.28;
/// An ellipse round (rad.xy) with radii rad.zw (shares of the screen), from
/// rad_in at its middle to rad_out at its rim and beyond.
uniform vec4 rad = vec4(0.5, 0.5, 1.0, 1.0);
uniform vec4 rad_in = vec4(0.0);
uniform vec4 rad_out = vec4(0.0);
/// The whole backdrop's opacity (it fades in).
uniform float fade = 1.0;

vec4 layer_over(vec4 dst, vec3 rgb, float a) {
	float oa = a + dst.a * (1.0 - a);
	return vec4((rgb * a + dst.rgb * dst.a * (1.0 - a)) / max(oa, 1e-5), oa);
}

vec4 menu_layers(vec4 col, vec2 uv) {
	if (foot_a > 0.0) {
		col = layer_over(col, foot_rgb, foot_a * clamp(1.0 - (1.0 - uv.y) / foot_s, 0.0, 1.0));
	}
	if (top_a > 0.0) {
		col = layer_over(col, top_rgb, top_a * clamp(1.0 - uv.y / top_s, 0.0, 1.0));
	}
	if (lr_a.x + lr_a.y + lr_a.z > 0.0) {
		float x = uv.x;
		float a = x < lr_s.x ? mix(lr_a.x, lr_a.y, x / lr_s.x) : (x < lr_s.y ? mix(lr_a.y, lr_a.z, (x - lr_s.x) / (lr_s.y - lr_s.x)) : lr_a.z);
		col = layer_over(col, lr_rgb, a);
	}
	if (rad_in.a + rad_out.a > 0.0) {
		float d = clamp(length((uv - rad.xy) / rad.zw), 0.0, 1.0);
		vec4 c = mix(rad_in, rad_out, d);
		col = layer_over(col, c.rgb, c.a);
	}
	return col;
}
