// A health bar, drawn whole in one quad with clean round ends at any size:
// a dark sunken track, the pale ghost of what was just lost easing down after
// the fill, the fill's gradient with a soft glow of its own colour, a
// hairline rim and the plank seams every tenth; a ship set ablaze, her fill
// smoulders, a run of fire colours sliding along it. Your hull bar and the
// bars over enemy ships (src/ui/hull_bar.gd).
shader_type canvas_item;

uniform float fill = 1.0;
uniform float ghost = 1.0;
uniform vec4 c_left : source_color = vec4(0.133, 0.722, 0.678, 1.0);
uniform vec4 c_right : source_color = vec4(0.561, 0.949, 0.843, 1.0);
uniform vec4 c_track : source_color = vec4(0.0, 0.0, 0.0, 0.36);
uniform vec4 c_ghost : source_color = vec4(1.0, 0.941, 0.839, 0.6);
uniform vec4 c_rim : source_color = vec4(1.0, 1.0, 1.0, 0.0);
/// The size drawn (px), to keep the round ends and the rim a pixel wide.
uniform vec2 size = vec2(120.0, 5.0);
uniform float seams = 1.0;
/// Brightens the fill (the low-hull pulse).
uniform float flare = 0.0;
/// 0..1: the fill smoulders (she's ablaze).
uniform float smoulder = 0.0;

// the smoulder's colours, round in a loop
const vec3 EMBER[4] = { vec3(0.847, 0.251, 0.184), vec3(1.0, 0.702, 0.278), vec3(1.0, 0.416, 0.239), vec3(1.0, 0.824, 0.478) };

// coverage of a capsule from x0 to x1 (px) across the bar's height
float capsule(vec2 p, float x0, float x1, float r) {
	float x = clamp(p.x, x0 + r, max(x1 - r, x0 + r));
	float d = length(p - vec2(x, size.y * 0.5)) - r;
	return clamp(0.5 - d, 0.0, 1.0);
}

void fragment() {
	vec2 p = UV * size;
	float r = size.y * 0.5;
	float track = capsule(p, 0.0, size.x, r);
	vec4 col = c_track;
	col.a *= track;
	// the ghost and the fill, clipped to the track as CSS overflow does
	float g = capsule(p, 0.0, size.x * clamp(ghost, 0.0, 1.0), r) * step(0.001, ghost);
	col = mix(col, vec4(c_ghost.rgb, 1.0), c_ghost.a * g);
	float f = capsule(p, 0.0, size.x * clamp(fill, 0.0, 1.0), r) * step(0.001, fill);
	vec3 fc = mix(c_left.rgb, c_right.rgb, UV.x) * (1.0 + flare * 0.35);
	if (smoulder > 0.0) {
		// two bars' length of embers, sliding left a full run every 0.9 s
		float u = fract(UV.x * 0.5 + TIME / 0.9) * 4.0;
		int i = int(u);
		fc = mix(fc, mix(EMBER[i], EMBER[(i + 1) % 4], u - float(i)), smoulder);
	}
	// inset shade along the top of the track, a light catch along the fill's top
	fc *= 0.92 + 0.16 * smoothstep(size.y, 0.0, p.y);
	col.rgb = mix(col.rgb, fc, f);
	col.a = max(col.a, f);
	if (seams > 0.5) {
		float s = fract(UV.x * 10.0);
		float seam = (1.0 - smoothstep(0.0, 1.0 / size.x * 10.0, 1.0 - s)) * step(0.05, UV.x) * step(UV.x, 0.95);
		col.rgb = mix(col.rgb, vec3(0.016, 0.07, 0.1), seam * 0.45 * track);
	}
	// a hairline rim round the track
	float rim = clamp(1.0 - abs(length(p - vec2(clamp(p.x, r, size.x - r), r)) - r + 0.5), 0.0, 1.0);
	col = mix(col, vec4(c_rim.rgb, 1.0), c_rim.a * rim * track);
	col.a = max(col.a, c_rim.a * rim);
	COLOR = col;
}
