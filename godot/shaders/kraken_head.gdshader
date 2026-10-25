// The Kraken's head (the web's fx/krakenModel.ts): a bulbous mantle with
// brow ridges, a siphon and two great eyes, each a gold iris split by a
// horizontal slit pupil, wet and glowing, under heavy lids that blink and
// shut as it dies. The mantle swells and empties as it breathes.
shader_type spatial;
render_mode cull_back;

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/lit.gdshaderinc"
#include "res://shaders/inc/kraken_skin.gdshaderinc"

/// breath, arousal, pallor, hit flash
uniform vec4 kr_head = vec4(0.0);
/// eye centre (x mirrored), radius
uniform vec4 kr_eye = vec4(3.7, -0.9, 3.9, 1.35);
/// look x, y, lid open, pupil dilation
uniform vec4 kr_gaze = vec4(0.0, 0.0, 1.0, 0.3);

varying vec3 v_o;
varying vec3 v_world;

void vertex() {
	v_o = VERTEX;
	// the mantle swells and empties as it breathes
	VERTEX += NORMAL * kr_head.x * smoothstep(-1.0, 7.0, VERTEX.y) * 0.55;
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	lit_cloud = cloud_shadow(v_world.xz);
}

float kr_head_h(vec3 o) {
	vec4 n = texture(cloud_noise, o.xy * 0.13 + o.z * 0.07);
	vec4 n2 = texture(cloud_noise, o.zy * 0.29 + o.x * 0.05 + 0.4);
	// warty papillae and the creases of the mantle
	float ridge = 1.0 - abs(n.g * 2.0 - 1.0);
	return n2.r * 0.07 + smoothstep(0.75, 1.0, ridge) * 0.06 + n.a * 0.04;
}

void fragment() {
	vec3 o = v_o;
	vec3 dir = normalize(o - vec3(0.0, -2.0, 0.0));
	float up = clamp(dir.y * 0.8 + 0.3 - dir.z * 0.35, 0.0, 1.0);
	float belly = smoothstep(0.1, 0.75, dir.z * 0.8 - dir.y * 0.9 - 0.15);
	vec3 col = kr_palette(up, belly);
	vec4 n = texture(cloud_noise, o.xy * 0.07 + o.z * 0.031);
	vec4 n2 = texture(cloud_noise, o.zy * 0.21 + o.x * 0.043 + 0.17);
	float mott = smoothstep(0.47, 0.74, n.r * 0.7 + n2.g * 0.5);
	col *= mix(1.0, 0.4, mott * (1.0 - belly * 0.8));
	col *= 0.84 + 0.32 * n2.b;
	// veins branching over the mantle
	float vein = 1.0 - smoothstep(0.0, 0.035, abs(n2.r - 0.5));
	col = mix(col, vec3(0.3, 0.02, 0.05), vein * 0.45 * up);
	float band = smoothstep(0.3, 0.95, sin(o.y * 0.55 + TIME * 5.0 + n.g * 3.0));
	col *= 1.0 - kr_head.y * 0.45 * band * up;
	col = mix(col, vec3(0.55, 0.03, 0.03), kr_head.y * 0.25 * up);
	float rough = 0.28 + n2.a * 0.14;
	vec3 em = vec3(0.0);

	// the eyes
	float sx = o.x < 0.0 ? -1.0 : 1.0;
	vec3 ec = vec3(kr_eye.x * sx, kr_eye.y, kr_eye.z);
	vec3 q = o - ec;
	float qd = length(q);
	vec3 F = normalize(vec3(sx * 0.78, 0.06, 0.62));
	vec3 qn = q / max(qd, 1e-3);
	float cd = dot(qn, F);
	float lamp = 0.0;
	if (qd < kr_eye.w * 1.6 && cd > 0.0) {
		vec3 U = normalize(cross(vec3(0.0, 1.0, 0.0), F)) * sx;
		vec3 W = cross(F, U) * sx;
		vec2 e = vec2(dot(qn, U), dot(qn, W));
		float rr = length(e);
		// lids: a heavy brow of skin above, a softer fold below
		float open = kr_gaze.z;
		float lid_top = mix(-0.08, 0.66, open) - e.x * e.x * 0.6;
		float lid_bot = mix(-0.04, -0.7, open) + e.x * e.x * 0.5;
		float lid = smoothstep(lid_top - 0.03, lid_top + 0.03, e.y) + smoothstep(lid_bot + 0.03, lid_bot - 0.03, e.y);
		float ball = smoothstep(0.8, 0.74, rr) * (1.0 - clamp(lid, 0.0, 1.0));
		vec2 g = e - kr_gaze.xy * 0.16;
		float gr = length(g);
		float iris = smoothstep(0.6, 0.56, gr);
		float ang = atan(g.y, g.x);
		float fib = texture(cloud_noise, vec2(ang * 0.32, gr * 0.9)).g;
		vec3 iris_col = mix(vec3(1.0, 0.62, 0.08), vec3(1.0, 0.86, 0.32), smoothstep(0.1, 0.55, gr) * fib);
		iris_col *= 0.55 + 0.6 * fib;
		float limbal = smoothstep(0.42, 0.6, gr);
		iris_col = mix(iris_col, vec3(0.45, 0.12, 0.02), limbal * 0.7);
		// a horizontal slit pupil that widens as it rouses or tires
		float dil = kr_gaze.w;
		float pup = smoothstep(1.0, 0.85, length(vec2(g.x / (0.38 + dil * 0.06), g.y / (0.05 + dil * 0.17))));
		vec3 eye_col = mix(vec3(0.02, 0.02, 0.025), iris_col, iris);
		eye_col = mix(eye_col, vec3(0.0), pup);
		float glow = (0.9 + night * 2.2 + weather.z * 1.2) * (1.0 + kr_head.y * 0.8) * (1.0 - kr_head.z * 0.9);
		em += iris_col * iris * (1.0 - pup) * ball * glow * 0.9;
		col = mix(col, eye_col, ball);
		rough = mix(rough, 0.05, ball);
		// a ring of little lamps round the socket
		float ring = abs(rr - 0.98);
		float dots = smoothstep(0.55, 0.95, sin(atan(e.y, e.x) * 9.0));
		lamp = smoothstep(0.07, 0.0, ring) * dots * smoothstep(0.0, 0.2, cd);
	}
	// photophores in a line down each side of the mantle
	vec2 pl = vec2(o.y * 0.55, (abs(o.x) - (3.4 + o.y * 0.12)) * 1.6);
	float pc = length(vec2(fract(pl.x) - 0.5, pl.y));
	lamp = max(lamp, smoothstep(0.2, 0.05, pc) * step(-1.0, o.y) * step(o.y, 9.5) * step(0.0, -o.z + 2.0));
	em += kr_glow(lamp * (1.0 - kr_head.z), o.y);
	em += vec3(1.3, 0.55, 0.45) * kr_head.w * 0.4;
	col = mix(col, vec3(0.6, 0.53, 0.52) * (0.8 + 0.2 * n2.b), kr_head.z * 0.85);
	// relief from finite differences of the skin's height
	vec3 ox = dFdx(o);
	vec3 oy = dFdy(o);
	float h0 = kr_head_h(o);
	vec2 dh = vec2(kr_head_h(o + ox) - h0, kr_head_h(o + oy) - h0);
	vec3 nrm = kr_perturb(VERTEX, normalize(NORMAL), dh, FRONT_FACING ? 1.0 : -1.0);
	em += kr_through(col, nrm, VIEW_MATRIX);
	ALBEDO = col * wet_dim();
	ROUGHNESS = rough * wet_gloss();
	NORMAL = nrm;
	EMISSION = em;
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
