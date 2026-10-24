// The Shipwright's stage flag (src/ui/flag_stage.gd): her flag as designed,
// flying from its pole as the web's living preview flies it (a travelling
// wave down the fly, the cloth lit as it rolls toward the light and shaded as
// it rolls away, a whisper of weave and a darker sleeve at the hoist), or
// held flat for the brush with its layer over it. Drawn over a rect a little
// taller than the flag, so the wave has room.
shader_type canvas_item;

uniform sampler2D flag_tex : filter_linear_mipmap, repeat_disable;
/// The brush's layer (its colour premultiplied: a SubViewport drawn over
/// nothing), over the flag while painting.
uniform sampler2D paint_tex : filter_linear, repeat_disable, hint_default_transparent;
uniform bool painting = false;
/// The rect drawn (units), and the flag's box in it (x, y, w, h).
uniform vec2 rect = vec2(100.0, 100.0);
uniform vec4 box = vec4(0.0, 0.0, 100.0, 62.0);
uniform float t = 0.0;
/// 1 flying, 0 held flat.
uniform float wave = 1.0;

void fragment() {
	vec2 p = UV * rect;
	float u = (p.x - box.x) / box.z;
	float amp = box.w * 0.07 * wave;
	float ph = t * 3.2 - u * 7.5;
	float dy = sin(ph) * amp * u + sin(t * 1.7 - u * 4.0) * amp * 0.25 * u;
	float v = (p.y - box.y - dy) / box.w;
	vec2 fuv = clamp(vec2(u, v), vec2(0.0), vec2(1.0));
	vec4 f = texture(flag_tex, fuv);
	if (painting) {
		vec4 q = texture(paint_tex, fuv);
		f.rgb = mix(f.rgb, q.rgb / max(q.a, 1e-4), q.a);
	}
	// a whisper of weave (48 threads down her), and the darker sleeve at the hoist
	float rows = v * 48.0;
	f.rgb *= 1.0 - 0.05 * (1.0 - smoothstep(0.0, fwidth(rows) * 1.2, fract(rows)));
	f.rgb *= 1.0 - 0.35 * clamp(1.0 - u / 0.06, 0.0, 1.0);
	// lit as the cloth rolls toward the light, shaded as it rolls away
	float shade = cos(ph) * u * wave;
	f.rgb = shade > 0.0 ? mix(f.rgb, vec3(1.0, 0.98, 0.922), shade * 0.16) : mix(f.rgb, vec3(0.0), -shade * 0.24);
	// her edges, smooth as she waves
	vec2 e = min(vec2(u, v), vec2(1.0) - vec2(u, v)) / max(fwidth(vec2(u, v)), vec2(1e-5));
	f.a *= clamp(min(e.x, e.y) + 0.5, 0.0, 1.0);
	COLOR = f;
}
