// Wreckage afloat (Debris): planks, barrels and crates, one multimesh each.
//
// A piece in the air, settling into the water, sunk below it or cast up on a
// beach is placed by the CPU (its INSTANCE_CUSTOM.z is negative). A piece
// adrift carries its own clock instead (INSTANCE_CUSTOM: the way it still
// has on beyond the wind's drift, when it went adrift on the sea's clock,
// and the life it has left; its transform the rest pose about where the
// drift began) and is floated here: carried by the wind, its own way
// bleeding off, bobbing and turning lazily, riding and tilting with the
// swell the ocean draws, and once waterlogged settling lower until it
// slips under. So a sea strewn with hundreds of planks asks nothing of the
// CPU but the few that are flying.
shader_type spatial;
render_mode cull_back, world_vertex_coords;

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/ship_common.gdshaderinc"
#include "res://shaders/inc/sea_height.gdshaderinc"

global uniform float sea_clock;
/// how far the wind has carried what floats since the debris began (m, x z)
uniform vec2 drift = vec2(0.0);

varying vec3 v_world;

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
	vec4 cu = INSTANCE_CUSTOM;
	if (cu.z >= 0.0) {
		vec3 base = MODEL_MATRIX[3].xyz;
		float age = sea_clock - cu.z;
		age += age < 0.0 ? 4096.0 : 0.0;
		vec2 xz = base.xz + drift + cu.xy * ((1.0 - exp(-0.9 * age)) * 1.11111);
		// a slow bob and roll, each piece out of step with the next (its phase rides in the colour's alpha)
		float bob = sea_clock + COLOR.a * 10.0;
		mat3 wob = euler_xyz(vec3(sin(bob * 1.3) * 0.12, sin(bob * 0.21) * 0.25, cos(bob * 1.1) * 0.12));
		float bed = sea_floor(xz);
		vec2 slope;
		float h = sea_height(xz, bed, slope);
		// waterlogged at the end of its life: lower and lower, then gone
		float sink = max(0.0, age - cu.w) * 0.35;
		float y = max(h + base.y - sink, bed + 0.08);
		vec3 local = wob * (VERTEX - base);
		// lying along the swell: sheared by its slope
		local.y += dot(slope, local.xz);
		VERTEX = vec3(xz.x, y, xz.y) + local;
		vec3 n = wob * NORMAL;
		NORMAL = normalize(vec3(n.x - slope.x * n.y, n.y, n.z - slope.y * n.y));
	}
	v_world = VERTEX;
}

void fragment() {
	ALBEDO = srgb_to_linear(COLOR.rgb);
	ROUGHNESS = 0.78;
	SPECULAR = 0.4;
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
