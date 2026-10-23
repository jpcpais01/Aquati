// A sea picker card's window onto its painted chart (shaders/sea_chart.gdshader),
// as the web's .sp-art draws it: the chart's middle band, sunlight dancing
// across the Fortunate Isles' lagoons or the mist drifting over Las Brumas,
// a soft fade from the chart into the card with a vignette round it, and the
// card's rounded corners along its top. src/ui/sea_pick.gd.
shader_type canvas_item;

/// The window's size (units), its top corners' radius, and how much taller
/// the chart is than the window (it shows the chart's middle).
uniform vec2 box = vec2(548.0, 218.0);
uniform float radius = 30.0;
uniform float crop = 1.45;
/// 0 the sun's glint across the lagoons, 1 the drifting mist.
uniform int style = 0;

const vec3 GLINT = vec3(1.0, 0.98, 0.863);
const vec3 MIST = vec3(0.91, 0.949, 0.957);

// a CSS ellipse's fill at p: rgba at its middle fading to nothing at its rim
float blob(vec2 p, vec2 c, vec2 r) {
	return clamp(1.0 - length((p - c) / r), 0.0, 1.0);
}

void fragment() {
	vec2 p = UV * box;
	vec3 c = texture(TEXTURE, vec2(UV.x, 0.5 + (UV.y - 0.5) / crop)).rgb;
	float W = box.x;
	float H = box.y;
	if (style == 0) {
		// a 115 degree band of warm light across an overlay 180% the window's
		// size, swept from 45% off to its left to 45% off to its right in the
		// middle 60% of every 5.5 s, screen-blended
		float ph = fract(TIME / 5.5);
		float k = clamp((ph - 0.2) / 0.6, 0.0, 1.0);
		k = k * k * (3.0 - 2.0 * k);
		float tx = mix(-0.81, 0.81, k) * W;
		vec2 dir = vec2(0.9063, 0.4226);
		float len = 1.8 * (W * 0.9063 + H * 0.4226);
		float t = dot(p - vec2(0.5 * W + tx, 0.5 * H), dir) / len + 0.5;
		float a = 0.2 * clamp(1.0 - abs(t - 0.5) / 0.1, 0.0, 1.0);
		c += a * GLINT * (1.0 - c);
	} else {
		// three banks of mist on an overlay 220% x 140% the window's size,
		// drifting 22% of its width to and fro over 16 s
		float ph = fract(TIME / 32.0) * 2.0;
		float u = ph < 1.0 ? ph : 2.0 - ph;
		vec2 o = vec2(-0.6 * W + u * 0.22 * 2.2 * W, -0.2 * H);
		vec2 s = vec2(2.2 * W, 1.4 * H);
		c = mix(c, MIST, 0.42 * blob(p, o + s * vec2(0.2, 0.3), s * vec2(0.22, 0.3)));
		c = mix(c, MIST, 0.36 * blob(p, o + s * vec2(0.55, 0.7), s * vec2(0.26, 0.26)));
		c = mix(c, MIST, 0.4 * blob(p, o + s * vec2(0.82, 0.36), s * vec2(0.2, 0.24)));
	}
	// a vignette round the chart, and a soft fade from it into the card
	float v = clamp((length((UV - vec2(0.5, 0.4)) / vec2(0.8, 0.9)) - 0.6) / 0.4, 0.0, 1.0);
	c = mix(c, vec3(0.0, 0.039, 0.078), 0.35 * v);
	c = mix(c, vec3(0.031, 0.086, 0.125), 0.92 * clamp((UV.y - 0.55) / 0.45, 0.0, 1.0));
	// the card's rounded corners along the top
	vec2 q = vec2(min(p.x, W - p.x), p.y);
	float edge = 1.0;
	if (q.x < radius && q.y < radius) {
		float d = length(vec2(radius) - q) - radius;
		edge = clamp(0.5 - d / max(fwidth(d), 1e-3), 0.0, 1.0);
	}
	COLOR = vec4(c, edge);
}
