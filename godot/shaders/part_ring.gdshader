// The ring of turning light round a mythic part on the Shipwright's Refit
// tab (the web's conic-gradient spun by sw-spin): cyan, violet, rose and
// gold chasing round a rounded square, a full turn every four seconds.
shader_type canvas_item;

/// The item's size, and the ring's outer and inner edges as rounded boxes
/// (half-size, corner radius) about its middle, in HUD units.
uniform vec2 quad = vec2(64.0);
uniform vec3 outer = vec3(29.0, 29.0, 17.0);
uniform vec3 inner = vec3(26.0, 26.0, 14.0);
uniform float soft = 0.5;

const vec3 C[5] = { vec3(0.498, 0.91, 1.0), vec3(0.776, 0.608, 1.0), vec3(1.0, 0.373, 0.62), vec3(1.0, 0.827, 0.416), vec3(0.498, 0.91, 1.0) };

float sd_box(vec2 p, vec2 hb, float r) {
	vec2 q = abs(p) - hb + r;
	return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void fragment() {
	vec2 p = (UV - 0.5) * quad;
	float aa = max(fwidth(p.x), 1e-3) + soft;
	float a = clamp(0.5 - sd_box(p, outer.xy, outer.z) / aa, 0.0, 1.0) * clamp(0.5 + sd_box(p, inner.xy, inner.z) / aa, 0.0, 1.0);
	// clockwise from straight up, as CSS turns a conic gradient
	float t = fract(atan(p.x, -p.y) / TAU - TIME * 0.25) * 4.0;
	int i = int(t);
	COLOR = vec4(mix(C[i], C[min(i + 1, 4)], t - float(i)), a);
}
