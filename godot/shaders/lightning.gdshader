// A lightning bolt's channel (src/fx/lightning.gd): a ribbon turned to the
// eye, white-hot down its core inside a violet-blue glow, flickering with
// each return stroke. UV.x runs across the ribbon (-1 .. 1), UV.y is how
// bright it burns there (the branches fade toward their tips).
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

/// the channel's glow this frame (0 dark .. 1.4)
uniform float bolt = 0.0;

void fragment() {
	float x = abs(UV.x);
	float core = smoothstep(0.35, 0.0, x);
	float glow = (1.0 - x) * (1.0 - x);
	ALBEDO = (vec3(6.0, 6.5, 8.0) * core + vec3(0.9, 1.0, 2.2) * glow) * UV.y * bolt;
}
