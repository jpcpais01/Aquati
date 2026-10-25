// A mirage on a scorching noon (src/fx/mirage.gd): a little island that
// isn't there, floating on a band of shimmering sky over its own upside-down
// image. It breathes (towering up and squashing down), its layers of air
// slide past each other, it shimmers in rising bands, its edges run with a
// pearly rainbow, and a ship sailing into it parts it like a curtain.
// COLOR.r is the part (0 sand, .25 trunk, .5 frond, .75 column, 1 gilt),
// COLOR.g 1 for the inverted image.
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

#include "res://shaders/inc/atmos.gdshaderinc"

/// x how much of it shows, y how hard its air swims, z how far it has risen, w its seed
uniform vec4 mir = vec4(0.0);
/// the ship sailing through it (x, z), and the radius it parts round her (m)
uniform vec3 part_at = vec3(0.0, 0.0, 1.0);
uniform float now = 0.0;

varying vec3 v_n;
varying vec3 v_world;
varying float v_part;
varying float v_flip;
varying float v_h;

void vertex() {
	vec3 p = VERTEX;
	float s = mir.w;
	// it breathes: towering up and squashing down in slow, uneven heaves
	float stretch = 1.0 + 0.26 * sin(now * 0.55 + s) + 0.12 * sin(now * 1.6 + p.x * 4.0 + s * 2.0);
	p.y *= stretch * mir.z;
	// layers of hot air slide past each other, more the higher they lie
	float lay = 0.25 + p.y * 1.4;
	p.x += sin(p.y * 15.0 - now * 3.1 + s) * 0.028 * lay * mir.y;
	p.z += cos(p.y * 11.0 - now * 2.6 + s * 1.7) * 0.02 * lay * mir.y;
	v_h = p.y;
	vec3 n = NORMAL;
	v_flip = COLOR.g;
	if (v_flip > 0.5) {
		p.y = -p.y * 0.62;
		n.y = -n.y;
	}
	// the whole vision floats on a band of shimmering sky
	p.y += 0.5 * mir.z + 0.03;
	v_world = (MODEL_MATRIX * vec4(p, 1.0)).xyz;
	v_n = normalize(mat3(MODEL_MATRIX) * n);
	v_part = COLOR.r * 4.0;
	VERTEX = p;
}

void fragment() {
	vec3 base = v_part < 0.5 ? vec3(0.96, 0.84, 0.64)
		: v_part < 1.5 ? vec3(0.78, 0.62, 0.5)
		: v_part < 2.5 ? vec3(0.42, 0.86, 0.68)
		: v_part < 3.5 ? vec3(1.0, 0.97, 0.94) : vec3(1.0, 0.82, 0.45);
	vec3 N = normalize(v_n) * (FRONT_FACING ? 1.0 : -1.0);
	vec3 V = normalize(CAMERA_POSITION_WORLD - v_world);
	float lit = 0.62 + 0.38 * max(dot(N, sun_dir), 0.0);
	// washed out with the hot sky, as a thing seen through miles of air
	// (the sky's hue, not its glare: a bleached noon horizon would burn it white)
	vec3 hz = sky_horizon / max(max(sky_horizon.r, sky_horizon.g), max(sky_horizon.b, 1e-3)) * 0.8;
	vec3 col = mix(base * lit * 0.85, hz, 0.28 + 0.2 * v_flip);
	// its edges run with a pearly rainbow
	float fr = 1.0 - abs(dot(N, V));
	vec3 pearl = 0.5 + 0.5 * cos(6.2832 * (fr * 0.8 + v_h * 0.6 + now * 0.07 + vec3(0.0, 0.33, 0.67)));
	col += pearl * fr * fr * 0.35;
	col *= light_tint;
	// it shimmers in rising bands, and frays away at the top and the bottom
	vec4 nz = texture(cloud_noise, v_world.xz * 0.05 + vec2(0.0, now * 0.03));
	float band = 0.5 + 0.5 * sin(v_world.y * 1.1 - now * 4.2 + nz.r * 6.0);
	float a = mix(0.3, 1.0, band) * (v_flip > 0.5 ? 0.42 : 0.72);
	// the sand fades to nothing at its rim, so it lies on the sea as a glow, not a lid
	if (v_part < 0.5) {
		a *= smoothstep(0.0, 0.14, v_h) * 0.55;
	}
	a *= smoothstep(0.15, 0.55, nz.g + (1.0 - abs(v_h) * 1.1) * 0.5);
	// the seam where the island meets its own image glows with the sky
	col += hz * exp(-abs(v_h) * 9.0) * 0.35 * light_tint;
	// a ship sailing in parts it like a curtain
	float d_ship = length(v_world.xz - part_at.xy);
	a *= smoothstep(part_at.z * 0.25, part_at.z, d_ship + (nz.b - 0.5) * part_at.z * 0.6);
	a *= mir.x;
	if (a < 0.004) {
		discard;
	}
	ALBEDO = col * a;
	ALPHA = a;
}
