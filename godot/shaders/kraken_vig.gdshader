// The sea's edge closing in while the Kraken rages, and redder and tighter
// while it has her in its grip (the web's .kr-vig): an elliptical radial
// gradient over the whole screen, farthest-corner sized as CSS draws it.
shader_type canvas_item;

/// how much shows (0..1), and how far toward the grip's crimson (0..1)
uniform float alpha = 0.0;
uniform float grab = 0.0;

void fragment() {
	// an ellipse reaching the corners: UV's distance from the middle, over a corner's
	float r = length((UV - 0.5) * 2.0) / sqrt(2.0);
	float s0 = mix(0.52, 0.46, grab);
	float s1 = mix(0.82, 0.78, grab);
	vec4 mid = mix(vec4(40.0, 0.0, 50.0, 0.42 * 255.0), vec4(90.0, 0.0, 40.0, 0.42 * 255.0), grab) / 255.0;
	vec4 rim = mix(vec4(14.0, 0.0, 22.0, 0.75 * 255.0), vec4(30.0, 0.0, 14.0, 0.8 * 255.0), grab) / 255.0;
	// clear to s0, the mid colour by s1, the rim's at the corners
	vec4 c = r < s1 ? vec4(mid.rgb, mid.a * clamp((r - s0) / (s1 - s0), 0.0, 1.0)) : mix(mid, rim, clamp((r - s1) / (1.0 - s1), 0.0, 1.0));
	COLOR = vec4(c.rgb, c.a * alpha);
}
