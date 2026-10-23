// An archipelago painted as a little illustrated chart for the sea picker,
// as the web's seaPick.ts paints it: turquoise shallows into a deep ink-blue
// with a ring of surf where the sea meets the sand, the isles' shadows on
// the shallows and a ripple across the open water; warm sand and soft,
// toy-like hillsides lit from the north-west under an inked coastline; and
// over Las Brumas, its fog. Drawn once into a texture (src/ui/sea_pick.gd)
// straight from the seabed you'll sail, so it always matches it.
shader_type canvas_item;
render_mode blend_disabled;

uniform sampler2D height_tex : repeat_disable, filter_linear;
/// The seabed's square: corner x, corner z, size, 1 / size (Region.height_rect()).
uniform vec4 height_rect = vec4(-1024.0, -1024.0, 2048.0, 0.00048828125);
/// The chart's corner (x, z, world metres) and its metres per art pixel, and
/// its size in art pixels (the web paints it 520 x 300).
uniform vec3 frame = vec3(0.0, 0.0, 4.0);
uniform vec2 art = vec2(520.0, 300.0);
/// The land's palette: sand, low and high green, rock and the peaks.
uniform vec3 sand = vec3(0.965, 0.894, 0.714);
uniform vec3 low = vec3(0.486, 0.769, 0.361);
uniform vec3 mid = vec3(0.227, 0.573, 0.298);
uniform vec3 rock = vec3(0.588, 0.518, 0.439);
uniform vec3 peak = vec3(0.839, 0.8, 0.729);
/// Fog banks (art pixels: x, y, radius); none for sunlit seas.
uniform int fogs = 0;
uniform vec3 fog[26];

const vec3 SURF = vec3(196.0, 255.0, 246.0) / 255.0;
const vec3 SHALLOW = vec3(104.0, 232.0, 218.0) / 255.0;
const vec3 LAGOON = vec3(38.0, 186.0, 190.0) / 255.0;
const vec3 DEEP = vec3(16.0, 104.0, 148.0) / 255.0;
const vec3 ABYSS = vec3(8.0, 50.0, 92.0) / 255.0;
const vec3 SHADE = vec3(10.0, 60.0, 80.0) / 255.0;
const vec3 INK = vec3(120.0, 100.0, 70.0) / 255.0;
const vec3 MIST = vec3(236.0, 244.0, 244.0) / 255.0;

// the ground's height (m) at art pixel ij (continuous: a pixel's middle is i + 0.5)
float at(vec2 ij) {
	vec2 w = frame.xy + clamp(ij, vec2(0.5), art - 0.5) * frame.z;
	return textureLod(height_tex, (w - height_rect.xy) * height_rect.w, 0.0).r;
}

void fragment() {
	vec2 ij = UV * art;
	float h = at(ij);
	vec3 col;
	if (h <= 0.0) {
		float d = -h;
		col = d < 2.5 ? mix(SHALLOW, LAGOON, smoothstep(0.0, 2.5, d)) : (d < 12.0 ? mix(LAGOON, DEEP, smoothstep(2.5, 12.0, d)) : mix(DEEP, ABYSS, smoothstep(12.0, 40.0, d)));
		// a ring of surf where the sea meets the sand
		col = mix(col, SURF, (1.0 - smoothstep(0.0, 1.1, d)) * 0.75);
		// the isle's soft shadow on the shallows, a few metres to the south-east
		float sh = max(1.0, round(9.0 / frame.z));
		float sx = at(ij - vec2(sh));
		if (sx > 0.5) {
			col = mix(col, SHADE, 0.22 * smoothstep(0.5, 6.0, sx));
		}
		// a gentle ripple across the open water
		vec2 p = ij - 0.5;
		float rip = sin(p.x * 0.31 + sin(p.y * 0.11) * 3.0) * sin(p.y * 0.23 + p.x * 0.05);
		col *= 1.0 + rip * 0.035 * smoothstep(1.0, 8.0, d);
	} else {
		// hillshade lit from the north-west, soft like a painted toy
		float e = at(ij + vec2(1.0, 0.0));
		float w = at(ij - vec2(1.0, 0.0));
		float s = at(ij + vec2(0.0, 1.0));
		float n = at(ij - vec2(0.0, 1.0));
		float dx = (e - w) / (2.0 * frame.z);
		float dz = (s - n) / (2.0 * frame.z);
		float lit = clamp(1.0 - (dx + dz) * 0.42, 0.62, 1.28);
		vec3 base = h < 1.3 ? sand : mix(low, mid, smoothstep(2.0, 24.0, h));
		if (h >= 1.3) {
			base = mix(base, rock, smoothstep(26.0, 50.0, h));
			base = mix(base, peak, smoothstep(52.0, 80.0, h));
			if (h < 2.2) {
				base = mix(sand, base, smoothstep(1.3, 2.2, h));
			}
		}
		col = base * lit;
		// an inked coastline, light as a pencil
		if (min(min(e, w), min(s, n)) <= 0.0) {
			col = mix(col, INK, 0.35);
		}
	}
	col = clamp(col, 0.0, 1.0);
	// the mist isles sit in their fog
	for (int k = 0; k < fogs; k++) {
		float a = 0.32 * clamp(1.0 - length(ij - fog[k].xy) / fog[k].z, 0.0, 1.0);
		col = mix(col, MIST, a);
	}
	COLOR = vec4(col, 1.0);
}
