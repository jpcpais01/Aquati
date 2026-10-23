// Salvage afloat (Loot): barrels and treasure chests, a multimesh for each
// rarity. Each item is written once where it is reckoned from (and again only
// when a hull draws it in) and floated here: carried on the wind, bobbing,
// rolling and turning lazily, riding and leaning with the swell the ocean
// draws. A dropped item rises out of the sea, and one left too long settles
// back under. The vertex colour carries the paint (sRGB), its alpha byte the
// stuff it is made of (MeshKit.code): wood, iron, gilt, or lamplight for the
// gems and the hoard's gold.
//
// Instance packing (src/game/loot.gd), in place of a transform:
//   MODEL_MATRIX[3].xyz  where it is reckoned from (x, z) and how high it rides (y)
//   MODEL_MATRIX[0].xyz  its size, whether it drifts, whether it pulses (epic, legendary)
//   MODEL_MATRIX[1].xy   the phase of its bob and the way it turns (rad/s)
//   INSTANCE_CUSTOM.xy   when it was dropped (the sea's clock) and how long it keeps
shader_type spatial;
render_mode cull_back, skip_vertex_transform;

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/ship_common.gdshaderinc"
#include "res://shaders/inc/sea_height.gdshaderinc"
varying float lit_spec;
#define LIT_SPECULAR lit_spec
#include "res://shaders/inc/lit.gdshaderinc"

global uniform float sea_clock;
/// how far the wind has carried what floats since the loot began (m, x z)
uniform vec2 drift = vec2(0.0);
/// lamplight paint is HDR: its colour times this (Loot.GLOW_GAIN)
uniform float glow_gain = 3.0;

varying vec3 v_world;
varying vec3 v_obj;

// Rotation by Euler angles applied x, then y, then z (three.js 'XYZ').
mat3 euler_xyz(vec3 r) {
	vec3 c = cos(r);
	vec3 s = sin(r);
	mat3 rx = mat3(vec3(1.0, 0.0, 0.0), vec3(0.0, c.x, s.x), vec3(0.0, -s.x, c.x));
	mat3 ry = mat3(vec3(c.y, 0.0, -s.y), vec3(0.0, 1.0, 0.0), vec3(s.y, 0.0, c.y));
	mat3 rz = mat3(vec3(c.z, s.z, 0.0), vec3(-s.z, c.z, 0.0), vec3(0.0, 0.0, 1.0));
	return rx * ry * rz;
}

void vertex() {
	vec3 base = MODEL_MATRIX[3].xyz;
	vec3 look = MODEL_MATRIX[0].xyz;
	float ph = MODEL_MATRIX[1].x;
	float spin = MODEL_MATRIX[1].y;
	float age = sea_clock - INSTANCE_CUSTOM.x;
	age += age < 0.0 ? 4096.0 : 0.0;
	float life = INSTANCE_CUSTOM.y;
	vec2 xz = base.xz + drift * look.y;
	float bed = sea_floor(xz);
	vec2 slope;
	float h = sea_height(xz, bed, slope);
	// up out of the deep when it's dropped, back under at the end
	float rise = 1.0 - smoothstep(0.0, 1.2, age);
	float y = h + base.y - rise * rise * 1.5 - smoothstep(life - 4.0, life, age) * 1.6;
	float t = sea_clock;
	mat3 lean = euler_xyz(vec3(-slope.y, 0.0, slope.x) * 0.8);
	mat3 rot = lean * euler_xyz(vec3(sin(t * 1.3 + ph) * 0.18, ph + t * spin, cos(t * 1.1 + ph) * 0.15));
	float sc = look.x * (1.0 + look.z * 0.03 * sin(t * 3.0 + ph));
	vec3 w = vec3(xz.x, y, xz.y) + rot * (VERTEX * sc);
	v_world = w;
	v_obj = VERTEX;
	lit_cloud = cloud_shadow(w.xz);
	VERTEX = (VIEW_MATRIX * vec4(w, 1.0)).xyz;
	NORMAL = normalize(mat3(VIEW_MATRIX) * (rot * NORMAL));
}

void fragment() {
	// the paint's alpha byte: kind (in quarters) x 16 (MeshKit.code)
	int kind = int(floor(COLOR.a * 255.0 + 0.25)) >> 4;
	vec3 col = srgb_to_linear(COLOR.rgb);
	float iron = kind == 2 ? 1.0 : 0.0;
	float glass = kind == 3 ? 1.0 : 0.0;
	float gilt = kind == 4 ? 1.0 : 0.0;
	float wood = 1.0 - iron - glass - gilt;
	// a whisper of grain along the staves and the planks
	float g = sin(v_obj.x * 7.0 + sin(v_obj.y * 4.0 + v_obj.z * 3.0) * 2.0) * 0.5 + 0.5;
	col *= 1.0 - wood * 0.08 * g;
	ALBEDO = col * (1.0 - glass) * wet_dim();
	METALLIC = iron * 0.7 + gilt * 0.85;
	ROUGHNESS = (wood * 0.55 + iron * 0.34 + gilt * 0.26 + glass * 0.2) * wet_gloss();
	lit_spec = 0.5 * (1.0 - glass);
	SPECULAR = lit_spec;
	EMISSION = col * glass * glow_gain;
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
