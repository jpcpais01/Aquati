// The round minimap's sea and land, as the web paints its little region
// images (src/ui/ui.ts mapOf): the open ocean's deep blue, lighter over the
// shelf to turquoise shallows, then sand and green hills that pale as they
// climb, straight from the seabed you sail (every archipelago's height field).
// Drawn into the minimap's own canvas with its marks a few times a second
// (src/ui/minimap.gd), the coasts smoothed over a pixel.
shader_type canvas_item;
render_mode blend_disabled;

uniform sampler2D height_a : repeat_disable, filter_linear;
uniform sampler2D height_b : repeat_disable, filter_linear;
/// Each archipelago's height field as Region.height_rect() gives it (corner
/// x, corner z, size, 1 / size); w <= 0: none.
uniform vec4 rect_a = vec4(0.0, 0.0, 1.0, 0.0);
uniform vec4 rect_b = vec4(0.0, 0.0, 1.0, 0.0);
/// What the canvas shows: its centre (x, z, world metres) and the metres across it.
uniform vec3 view = vec3(0.0, 0.0, 840.0);

const vec3 SAND = vec3(240.0, 226.0, 186.0) / 255.0;

// the ground's height (m) at w; the open ocean's level floor (deep enough to
// be its deep blue, 14 85 140) where no archipelago holds it
float ground(vec2 w) {
	vec2 a = (w - rect_a.xy) * rect_a.w;
	if (rect_a.w > 0.0 && a.x >= 0.0 && a.y >= 0.0 && a.x <= 1.0 && a.y <= 1.0) {
		return textureLod(height_a, a, 0.0).r;
	}
	vec2 b = (w - rect_b.xy) * rect_b.w;
	if (rect_b.w > 0.0 && b.x >= 0.0 && b.y >= 0.0 && b.x <= 1.0 && b.y <= 1.0) {
		return textureLod(height_b, b, 0.0).r;
	}
	return -17.0;
}

void fragment() {
	float h = ground(view.xy + (UV - 0.5) * view.z);
	float fw = max(fwidth(h), 1e-3) * 0.5;
	float k = min(1.0, -min(h, 0.0) / 14.0);
	vec3 water = vec3(70.0 - k * 56.0, 205.0 - k * 120.0, 200.0 - k * 60.0) / 255.0;
	float g = min(1.0, (max(h, 2.5) - 2.5) / 40.0);
	vec3 land = vec3(92.0 + g * 70.0, 160.0 - g * 30.0, 74.0 + g * 40.0) / 255.0;
	vec3 col = mix(water, SAND, smoothstep(-fw, fw, h));
	col = mix(col, land, smoothstep(2.5 - fw, 2.5 + fw, h));
	COLOR = vec4(col, 1.0);
}
