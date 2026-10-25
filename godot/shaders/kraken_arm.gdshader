// The Kraken's arms (the web's fx/krakenModel.ts): one tube per arm, every
// vertex placed here from a spine of 33 points the game poses each frame and
// writes to a small float texture (kr_spine: position and girth, then the
// side the suckers face, per point; then a row's last two texels hold its hit
// flash, band phase, arousal and pallor, and its length), so an arm can rear,
// whip down, coil round a hull and thrash with nothing but that texture
// uploaded. The skin is painted per pixel: a crimson back over a pale belly,
// chromatophore mottling, dark bands rippling down a roused arm, two
// staggered rows of suckers with raised rims, and photophores that glow in
// the dark of the storm.
//
// CUSTOM0: v along (0 root .. 1 tip), angle round (0 = the sucker side), arm
// CUSTOM1: radius (m), d radius / d length, suckers counted from the root
shader_type spatial;
render_mode cull_back;

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/lit.gdshaderinc"
#include "res://shaders/inc/kraken_skin.gdshaderinc"

uniform highp sampler2D kr_spine : filter_nearest, repeat_disable;

// v, angle, sucker count, metres along
varying vec4 v_kr;
// hit flash, band phase, arousal, pallor
varying flat vec4 v_krp;
varying float v_rad;
varying vec3 v_world;

void vertex() {
	int arm = int(CUSTOM0.z + 0.5);
	float s = CUSTOM0.x * 32.0;
	int i = int(min(floor(s), 31.0));
	float f = s - float(i);
	vec4 A = texelFetch(kr_spine, ivec2(max(i - 1, 0) * 2, arm), 0);
	vec4 B = texelFetch(kr_spine, ivec2(i * 2, arm), 0);
	vec4 C = texelFetch(kr_spine, ivec2((i + 1) * 2, arm), 0);
	vec4 D = texelFetch(kr_spine, ivec2(min(i + 2, 32) * 2, arm), 0);
	float f2 = f * f;
	float f3 = f2 * f;
	// Catmull-Rom through the spine
	vec3 c1 = -A.xyz + C.xyz;
	vec3 c2 = 2.0 * A.xyz - 5.0 * B.xyz + 4.0 * C.xyz - D.xyz;
	vec3 c3 = -A.xyz + 3.0 * B.xyz - 3.0 * C.xyz + D.xyz;
	vec3 p = B.xyz + 0.5 * (c1 * f + c2 * f2 + c3 * f3);
	vec3 dp = 0.5 * (c1 + 2.0 * c2 * f + 3.0 * c3 * f2);
	vec3 T = normalize(dp + vec3(0.0, 1e-5, 0.0));
	vec3 N = mix(texelFetch(kr_spine, ivec2(i * 2 + 1, arm), 0).xyz, texelFetch(kr_spine, ivec2((i + 1) * 2 + 1, arm), 0).xyz, f);
	N = normalize(N - T * dot(N, T) + vec3(1e-5, 0.0, 0.0));
	vec3 Bn = cross(T, N);
	float sc = mix(B.w, C.w, f);
	float r = CUSTOM1.x * sc;
	float ca = cos(CUSTOM0.y);
	float sa = sin(CUSTOM0.y);
	// the sucker side is a little flatter than the back
	float fl = 1.0 - 0.16 * pow(max(ca, 0.0), 3.0);
	VERTEX = p + (N * ca * fl + Bn * sa) * r;
	NORMAL = normalize(N * ca / fl + Bn * sa - T * CUSTOM1.y * sc);
	vec4 P1 = texelFetch(kr_spine, ivec2(66, arm), 0);
	vec4 P2 = texelFetch(kr_spine, ivec2(67, arm), 0);
	v_kr = vec4(CUSTOM0.x, CUSTOM0.y, CUSTOM1.z, CUSTOM0.x * P2.x);
	v_krp = P1;
	v_rad = r;
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	lit_cloud = cloud_shadow(v_world.xz);
}

// sucker rims (raised), cups (sunken) and a height, in sucker-spacing units
vec3 kr_suckers(vec2 q) {
	float a = q.y;
	float rim = 0.0;
	float cup = 0.0;
	float h = 0.0;
	if (abs(a) < 1.05) {
		for (int k = 0; k < 2; k++) {
			float side = k == 0 ? -1.0 : 1.0;
			float cu = fract(q.x + (k == 0 ? 0.0 : 0.5)) - 0.5;
			float cv = (a - side * 0.42) / 0.95;
			float d = length(vec2(cu, cv));
			float rr = smoothstep(0.41, 0.33, d);
			float cc = smoothstep(0.27, 0.13, d);
			rim = max(rim, rr * (1.0 - cc));
			cup = max(cup, cc);
			h = max(h, rr * (1.0 - cc * 1.35) + smoothstep(0.32, 0.38, d) * smoothstep(0.46, 0.38, d) * 0.15);
		}
	}
	return vec3(rim, cup, h);
}

// seam-free noise round the arm: two lookups whose seams sit on opposite sides
vec4 kr_noise(float along, float a, float rad, vec2 sc) {
	float a2 = a < 0.0 ? a + 6.2832 : a;
	vec4 n1 = texture(cloud_noise, vec2(along, a * rad) * sc);
	vec4 n2 = texture(cloud_noise, vec2(along, a2 * rad) * sc + 0.31);
	return mix(n1, n2, smoothstep(1.4, 2.2, abs(a)));
}

float kr_height(vec2 q, float along, float rad) {
	vec3 s = kr_suckers(q);
	float pap = kr_noise(along, q.y, rad, vec2(0.42, 0.5)).g;
	float back = smoothstep(0.2, -0.6, cos(q.y));
	return (s.z * 0.11 + pap * 0.05 * (0.4 + back)) * rad;
}

void fragment() {
	float a = v_kr.y;
	float ca = cos(a);
	float rad = max(v_rad, 0.05);
	float belly = smoothstep(0.05, 0.8, ca);
	float back = smoothstep(0.2, -0.75, ca);
	vec3 col = kr_palette(back, belly);
	vec4 n = kr_noise(v_kr.w, a, rad, vec2(0.085, 0.11));
	vec4 n2 = kr_noise(v_kr.w, a, rad, vec2(0.33, 0.39));
	// chromatophores: dark blotches over a fine reticulated net
	float mott = smoothstep(0.48, 0.74, n.r * 0.7 + n2.g * 0.5);
	col *= mix(1.0, 0.42, mott * (1.0 - belly * 0.85));
	col *= 0.84 + 0.32 * n2.b;
	// a roused arm ripples with dark bands running down to the tip
	float band = smoothstep(0.25, 0.95, sin(v_kr.w * 0.42 - TIME * 6.5 + v_krp.y));
	col *= 1.0 - v_krp.z * 0.6 * band * (1.0 - belly * 0.7);
	col = mix(col, vec3(0.5, 0.03, 0.03), v_krp.z * 0.25 * back);
	// suckers
	vec3 s = kr_suckers(vec2(v_kr.z, a));
	col = mix(col, vec3(0.92, 0.66, 0.58), s.x * 0.85);
	col = mix(col, vec3(0.38, 0.12, 0.13), s.y * 0.8);
	float rough = mix(0.26 + n2.a * 0.12, 0.42, s.x);
	// photophores along both flanks of the back
	float lamp = 0.0;
	for (int k = 0; k < 2; k++) {
		float side = k == 0 ? -1.0 : 1.0;
		float u = v_kr.w / max(rad * 1.7, 0.4);
		float cu = fract(u + (k == 0 ? 0.0 : 0.5)) - 0.5;
		float cv = (a - side * 2.05) * rad / max(rad * 1.7, 0.4);
		lamp = max(lamp, smoothstep(0.17, 0.04, length(vec2(cu, cv))));
	}
	vec3 em = kr_glow(lamp * (1.0 - v_krp.w), v_kr.w * 0.35);
	// struck: the flesh blanches white-hot for a moment
	em += vec3(1.3, 0.55, 0.45) * v_krp.x * 0.5 * (0.4 + back);
	// dying: the colour drains out of it
	col = mix(col, vec3(0.6, 0.53, 0.52) * (0.8 + 0.2 * n2.b), v_krp.w * 0.85);
	// bump: finite differences along the screen (crisp sucker rims, no blockiness)
	vec2 q = vec2(v_kr.z, a);
	vec2 dqx = dFdx(q);
	vec2 dqy = dFdy(q);
	dqx.y -= 6.2832 * floor(dqx.y / 6.2832 + 0.5);
	dqy.y -= 6.2832 * floor(dqy.y / 6.2832 + 0.5);
	float dax = dFdx(v_kr.w);
	float day = dFdy(v_kr.w);
	float h0 = kr_height(q, v_kr.w, rad);
	vec2 dh = vec2(kr_height(q + dqx, v_kr.w + dax, rad) - h0, kr_height(q + dqy, v_kr.w + day, rad) - h0);
	vec3 nrm = kr_perturb(VERTEX, normalize(NORMAL), dh, FRONT_FACING ? 1.0 : -1.0);
	em += kr_through(col, nrm, VIEW_MATRIX);
	ALBEDO = col * wet_dim();
	ROUGHNESS = rough * wet_gloss();
	NORMAL = nrm;
	EMISSION = em;
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
