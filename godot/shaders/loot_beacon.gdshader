// A chest's beacon, so you can spot it from afar (Loot): a glow of its
// rarity's colour pooled on the swell round it, a ring of light pulsing
// through it and, round the finest, rays turning slowly; and over the rare
// and finer ones a shaft of light rising off the water, rippling upward. Its
// light comes in as the chest rises and goes as it settles under. Added to
// the scene's light.
//
// Instance packing (src/game/loot.gd):
//   MODEL_MATRIX[3].xyz  where the chest is reckoned from (x, z), whether it drifts (y)
//   MODEL_MATRIX[0].xyz  its rarity's glow (linear HDR)
//   MODEL_MATRIX[1].xyz  the halo's radius (m), the beam's height (m), the chest's phase
//   INSTANCE_CUSTOM.xy   when it was dropped (the sea's clock) and how long it keeps
// The mesh: the halo, a grid (VERTEX.y 0, x and z -1..1) laid on the swell,
// and the beam (y 1, x -0.5..0.5 across, z 0..1 up).
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/sea_height.gdshaderinc"

global uniform float sea_clock;
/// how far the wind has carried what floats since the loot began (m, x z)
uniform vec2 drift = vec2(0.0);

varying vec3 v_col;
varying vec2 v_uv;
varying float v_beam;
varying float v_seed;
varying float v_size;
varying vec3 v_world;

void vertex() {
	vec3 base = MODEL_MATRIX[3].xyz;
	vec3 glow = MODEL_MATRIX[0].xyz;
	float halo = MODEL_MATRIX[1].x;
	float beam = MODEL_MATRIX[1].y;
	float ph = MODEL_MATRIX[1].z;
	float age = sea_clock - INSTANCE_CUSTOM.x;
	age += age < 0.0 ? 4096.0 : 0.0;
	float life = INSTANCE_CUSTOM.y;
	vec2 xz = base.xz + drift * base.y;
	float fade = clamp(min(age * 1.5, (life - age) / 4.0), 0.0, 1.0);
	float t = sea_clock;
	float seed = fract(ph * 0.618);
	v_seed = seed;
	v_size = halo;
	vec2 slope;
	vec3 w;
	if (VERTEX.y < 0.5) {
		// the halo: a pool of light on the swell, breathing
		float pulse = 1.0 + 0.06 * sin(t * 2.4 + seed * 30.0);
		vec2 p = xz + VERTEX.xz * halo * pulse;
		w = vec3(p.x, sea_height(p, sea_floor(p), slope) + 0.12, p.y);
		v_uv = VERTEX.xz;
		v_col = glow * fade * 0.3;
		v_beam = 0.0;
	} else {
		// the beam: upright, turned to face the camera, its foot under the water
		vec3 c = vec3(xz.x, sea_height(xz, sea_floor(xz), slope), xz.y);
		vec3 to_cam = CAMERA_POSITION_WORLD - c;
		to_cam.y = 0.0;
		vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), to_cam + vec3(1e-4, 0.0, 0.0)));
		w = c + right * VERTEX.x * (0.55 + beam * 0.07) + vec3(0.0, VERTEX.z * beam - 0.6, 0.0);
		v_uv = vec2(VERTEX.x + 0.5, VERTEX.z);
		v_col = glow * fade * (0.85 + 0.15 * sin(t * 4.0 + ph * 3.0));
		v_beam = 1.0;
	}
	v_world = w;
	if (fade <= 0.0 || (VERTEX.y > 0.5 && beam <= 0.0)) {
		POSITION = vec4(2.0, 2.0, 2.0, 1.0);
	} else {
		POSITION = PROJECTION_MATRIX * (VIEW_MATRIX * vec4(w, 1.0));
	}
}

void fragment() {
	float t = sea_clock;
	float a;
	if (v_beam > 0.5) {
		float x = v_uv.x * 2.0 - 1.0;
		float y = v_uv.y;
		float core = exp(-x * x * 18.0);
		float soft = exp(-x * x * 3.5) * 0.35;
		float rise = 0.75 + 0.25 * sin(y * 14.0 - t * 3.2 + v_seed * 20.0);
		float fall = pow(max(1.0 - y, 0.0), 1.7) * smoothstep(0.0, 0.06, y);
		a = (core + soft) * fall * rise * 0.55;
	} else {
		vec2 q = v_uv;
		float r = length(q);
		if (r > 1.0) {
			discard;
		}
		float rd = (r - 0.62 - 0.05 * sin(t * 2.0 + v_seed * 9.0)) * 9.0;
		float ring = exp(-rd * rd) * 0.7;
		float pool = pow(1.0 - r, 3.0) * 0.6;
		float ang = atan(q.y, q.x + 1e-5);
		float rays = pow(max(0.0, sin(ang * 6.0 + t * 0.7 + v_seed * 6.0)), 6.0) * (1.0 - r) * 0.7 * smoothstep(2.5, 3.8, v_size);
		a = (ring + pool + rays) * (1.0 - smoothstep(0.85, 1.0, r));
	}
	// far off, a little of it is lost in the haze
	a *= 1.0 - air_fog(v_world, CAMERA_POSITION_WORLD).a * 0.6;
	if (a < 0.002) {
		discard;
	}
	ALBEDO = v_col * a;
	ALPHA = 0.0;
}
