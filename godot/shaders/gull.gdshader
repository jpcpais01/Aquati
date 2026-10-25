// Herring gulls (src/fx/birds.gd): one sculpted bird, instanced, skinned
// here from eight numbers each in the light pass and the shadow pass alike.
// The shoulders and wrists flap with a lagging hand that sweeps back on the
// upstroke, the wings fold back along the flanks when it lands, the tail fans
// out to brake, the legs drop from under the belly and the head turns and
// nods. The web game's gull rig (src/fx/birds.ts).
//
// Per vertex: CUSTOM0 = colour, and 1 on a leg, -1 on the tail; CUSTOM1.xyz =
// where it lies with the wings folded; CUSTOM2 = shoulder, wrist and head
// weights. Per gull: COLOR = (flap phase, flap, fold, legs down),
// INSTANCE_CUSTOM = (dihedral, head yaw, tail spread, head pitch).
shader_type spatial;
render_mode cull_back;

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/lit.gdshaderinc"

varying vec3 v_col;
varying vec3 v_world;

vec3 g_rot_x(vec3 p, vec3 o, float a) { p -= o; float c = cos(a), s = sin(a); return o + vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
vec3 g_rot_y(vec3 p, vec3 o, float a) { p -= o; float c = cos(a), s = sin(a); return o + vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 g_rot_z(vec3 p, vec3 o, float a) { p -= o; float c = cos(a), s = sin(a); return o + vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }

// k = 1 poses a point, k = 0 a normal (pivots collapse to the origin)
vec3 gull_pose(vec3 rest, vec3 folded, float k, vec4 rig, vec4 wa, vec4 wb) {
	vec3 p = rig.w > 0.5 ? mix(folded, rest, wa.w) : mix(rest, folded, wa.z);
	float side = rest.x >= 0.0 ? 1.0 : -1.0;
	float open = 1.0 - wa.z;
	float ph = wa.x;
	float amp = wa.y * open;
	float dih = wb.x * open;
	if (rig.y > 0.0) {
		// the hand lags the arm and sweeps back on the upstroke
		float a2 = (-dih * 0.8 + sin(ph - 0.9) * amp * 0.6) * rig.y;
		float sweep = max(0.0, cos(ph + 0.3)) * amp * 0.45 * rig.y;
		vec3 w = vec3(side * 0.4, 0.035, 0.14) * k;
		p = g_rot_z(p, w, a2 * side);
		p = g_rot_y(p, w, sweep * side);
	}
	if (rig.x > 0.0) {
		float a1 = (dih + sin(ph) * amp) * rig.x;
		p = g_rot_z(p, vec3(side * 0.05, 0.035, 0.02) * k, a1 * side);
	}
	if (rig.z > 0.0) {
		vec3 n = vec3(0.0, 0.05, 0.2) * k;
		p = g_rot_x(p, n, wb.w * rig.z);
		p = g_rot_y(p, n, wb.y * rig.z);
	}
	if (rig.w < -0.5) {
		float t = clamp((-0.2 - rest.z) / 0.19, 0.0, 1.0);
		p.x *= mix(1.0, 1.0 + wb.z * 1.3 * t, k);
		p = g_rot_x(p, vec3(0.0, 0.02, -0.2) * k, -wb.z * 0.35);
	}
	return p;
}

void vertex() {
	vec4 rig = vec4(CUSTOM2.xyz, CUSTOM0.w);
	vec4 wa = COLOR;
	vec4 wb = INSTANCE_CUSTOM;
	vec3 p = gull_pose(VERTEX, CUSTOM1.xyz, 1.0, rig, wa, wb);
	NORMAL = normalize(gull_pose(NORMAL, NORMAL, 0.0, rig, wa, wb));
	VERTEX = p;
	v_col = CUSTOM0.rgb;
	v_world = (MODEL_MATRIX * vec4(p, 1.0)).xyz;
	lit_cloud = cloud_shadow(v_world.xz);
}

void fragment() {
	ALBEDO = v_col * wet_dim();
	ROUGHNESS = 0.72 * wet_gloss();
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
