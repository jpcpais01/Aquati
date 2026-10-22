// The lost ship's porthole on the farewell plaque, drawn whole in one quad:
// brass rings and a drop shadow outside, the glass lit from above inside, her
// silhouette heeled over and settling by the stern, the sea she's sinking
// into over her lower half, and a few bubbles rising; all clipped to the
// glass as the web's overflow: hidden does. src/ui/wreck_screen.gd.
shader_type canvas_item;

/// The quad drawn round the porthole, its radius, and CSS pixels in units.
uniform vec2 quad = vec2(200.0, 200.0);
uniform float radius = 40.0;
uniform float u = 1.0;
/// Her silhouette, and its width over its height.
uniform sampler2D ship : filter_linear, repeat_disable;
uniform float aspect = 1.6;

vec4 over(vec4 dst, vec3 rgb, float a) {
	float oa = a + dst.a * (1.0 - a);
	return vec4((rgb * a + dst.rgb * dst.a * (1.0 - a)) / max(oa, 1e-5), oa);
}

float soft(float d, float b) {
	return 1.0 - smoothstep(-b * 1.05, b * 1.05, d);
}

mat2 rot(float a) {
	return mat2(vec2(cos(a), sin(a)), vec2(-sin(a), cos(a)));
}

void fragment() {
	float R = radius;
	vec2 q = UV * quad - quad * 0.5;
	float d = length(q) - R;
	float aa = max(fwidth(d), 1e-3);
	float body = clamp(0.5 - d / aa, 0.0, 1.0);
	float outside = 1.0 - body;
	vec4 col = vec4(0.0);
	// the drop shadow under all, then the brass: a gold hairline, dark iron, pale and bright brass
	col = over(col, vec3(0.0), 0.45 * soft(length(q - vec2(0.0, 14.0 * u)) - R, 34.0 * u) * outside);
	col = over(col, vec3(0.839, 0.667, 0.322), 0.35 * clamp(0.5 - (d - 8.0 * u) / aa, 0.0, 1.0) * outside);
	col = over(col, vec3(0.039, 0.11, 0.149), 0.9 * clamp(0.5 - (d - 7.0 * u) / aa, 0.0, 1.0) * outside);
	col = over(col, vec3(1.0, 0.894, 0.627), 0.55 * clamp(0.5 - (d - 4.0 * u) / aa, 0.0, 1.0) * outside);
	col = over(col, vec3(0.753, 0.541, 0.173), clamp(0.5 - (d - 3.0 * u) / aa, 0.0, 1.0) * outside);
	// the glass, lit from high up; dark round its rim
	float g = length(q - vec2(0.0, -0.64 * R)) / (1.92 * R);
	vec4 gc = g < 0.45 ? mix(vec4(0.588, 0.941, 0.894, 0.55), vec4(0.118, 0.471, 0.518, 0.6), g / 0.45)
			: mix(vec4(0.118, 0.471, 0.518, 0.6), vec4(0.012, 0.102, 0.149, 0.95), clamp((g - 0.45) / 0.4, 0.0, 1.0));
	col = over(col, gc.rgb, gc.a * body);
	col = over(col, vec3(0.0, 0.039, 0.063), 0.75 * soft(-d, 22.0 * u) * body);
	// her silhouette, heeled over and settling by the stern, rocking slowly
	float ph = 0.5 - 0.5 * cos(TAU * TIME / 7.0);
	float W = 1.68 * R;
	float H = W / aspect;
	vec2 o = vec2(-0.84 * R, 0.4 * R - H);
	vec2 pv = o + vec2(0.5 * W, 0.85 * H);
	vec2 lp = pv + rot(-radians(mix(-13.0, -17.0, ph))) * (q - pv - vec2(0.0, mix(0.04, 0.12, ph) * H));
	vec2 suv = (lp - o) / vec2(W, H);
	if (suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0) {
		vec4 sc = texture(ship, suv);
		col = over(col, sc.rgb, sc.a * body);
	}
	// the sea over her lower half, and its bright skin
	float sy = 0.12 * R;
	float sea = clamp(0.5 + (q.y - sy) / aa, 0.0, 1.0) * body;
	vec4 sc = mix(vec4(0.235, 0.706, 0.706, 0.55), vec4(0.02, 0.157, 0.212, 0.92), clamp((q.y - sy) / (0.88 * R), 0.0, 1.0));
	col = over(col, sc.rgb, sc.a * sea);
	float skin = clamp(0.5 + (q.y - sy + u) / aa, 0.0, 1.0) * clamp(0.5 - (q.y - sy) / aa, 0.0, 1.0);
	col = over(col, vec3(0.824, 1.0, 0.973), 0.65 * skin * body);
	// three bubbles, each a ring of light, rising off her
	for (int i = 0; i < 3; i++) {
		float fi = float(i);
		float dur = i == 1 ? 2.6 : 3.2;
		float ph2 = fract((TIME + fi * 1.1) / dur);
		float s = (i == 0 ? 5.0 : (i == 1 ? 3.0 : 4.0)) * u;
		vec2 off = ph2 < 0.5 ? mix(vec2(0.0), vec2(3.0, -22.0), ph2 / 0.5) : mix(vec2(3.0, -22.0), vec2(-2.0, -46.0), (ph2 - 0.5) / 0.5);
		float a = ph2 < 0.15 ? ph2 / 0.15 : 1.0 - (ph2 - 0.15) / 0.85;
		float lx = i == 0 ? 0.42 : (i == 1 ? 0.58 : 0.5);
		vec2 c = vec2(-R + lx * 2.0 * R + s * 0.5, 0.4 * R - s * 0.5) + off * u;
		float db = length(q - c) - s * 0.5;
		float ring = clamp(0.5 - db / aa, 0.0, 1.0) * clamp(0.5 + (db + u) / aa, 0.0, 1.0);
		col = over(col, vec3(0.863, 1.0, 0.98), 0.75 * ring * a * body);
	}
	COLOR = col;
}
