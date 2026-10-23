// One archipelago engraved for the sea chart, as the web's SeaChart.build
// draws it: its hills hillshaded from the north-west like an old engraved
// chart (and for Las Brumas jade jungle under pale limestone towers), sand
// round them, an inked coastline, the shallows deepening to the shelf with
// faint depth contours, and the square's deep edge melting into the open sea
// round it. Drawn once into a texture (src/ui/chart_art.gd), a pixel for
// every two metres, straight from the seabed you sail.
shader_type canvas_item;
render_mode blend_disabled;

uniform sampler2D height_tex : repeat_disable, filter_linear;
/// The archipelago's height field as Region.height_rect() gives it.
uniform vec4 height_rect = vec4(-1025.0, -1025.0, 2050.0, 0.000487804878);
/// The square's corner (x, z, world metres), its metres across and its pixels across.
uniform vec2 corner = vec2(-1024.0, -1024.0);
uniform float size = 2048.0;
uniform float res = 1024.0;
/// Las Brumas' mist isles.
uniform bool mist = false;

// the ground's height (m) at pixel ij, held to the square's edge
float at(vec2 ij) {
	vec2 w = corner + (clamp(ij, vec2(0.0), vec2(res - 1.0)) + 0.5) * (size / res);
	return textureLod(height_tex, (w - height_rect.xy) * height_rect.w, 0.0).r;
}

void fragment() {
	vec2 ij = floor(UV * res);
	float step = size / res;
	float h = at(ij);
	float e = at(ij + vec2(1.0, 0.0));
	float w = at(ij - vec2(1.0, 0.0));
	float s = at(ij + vec2(0.0, 1.0));
	float n = at(ij - vec2(0.0, 1.0));
	// hillshade, lit from the north-west
	float shade = clamp(1.0 - ((e - w) / (2.0 * step) + (s - n) / (2.0 * step)) * 0.55, 0.55, 1.25);
	vec3 c;
	if (h > 1.2) {
		float k = min(1.0, (h - 1.2) / 45.0);
		float rock = max(0.0, (h - 30.0) / 30.0);
		c = vec3(110.0 + k * 60.0 + rock * 40.0, 158.0 - k * 22.0 + rock * 20.0, 86.0 + k * 20.0 + rock * 50.0) * shade;
		if (mist) {
			// the mist isles: jade jungle, pale limestone towers
			float lime = clamp((h - 18.0) / 40.0, 0.0, 1.0);
			c = vec3(96.0 + lime * 120.0, 150.0 + lime * 66.0, 104.0 + lime * 100.0) * shade;
		}
	} else if (h > 0.0) {
		c = mist ? vec3(240.0, 214.0, 200.0) : vec3(238.0, 222.0, 178.0);
	} else {
		float k = min(1.0, -h / 16.0);
		c = vec3(92.0 - k * k * 62.0, 214.0 - k * 118.0, 206.0 - k * 70.0);
		// faint depth contours
		if (h < -1.0 && fract(-h / 4.0) < 0.06) {
			c += vec3(14.0, 16.0, 16.0);
		}
	}
	// the inked coastline
	if (h > 0.0 && (e <= 0.0 || w <= 0.0 || s <= 0.0 || n <= 0.0)) {
		c = vec3(92.0, 70.0, 46.0);
	}
	// the deep edge of the square melts into the open sea round it
	float r = length(ij + 0.5 - res * 0.5);
	float a = 1.0 - clamp((r - res * 0.42) / (res * 0.08), 0.0, 1.0);
	COLOR = vec4(clamp(c, 0.0, 255.0) / 255.0, a);
}
