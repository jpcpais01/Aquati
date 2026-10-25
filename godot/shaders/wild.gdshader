// The island beasts (see Wildlife and WildSculpt): every species one
// instanced mesh per cut, posed here on the GPU from a dozen numbers each
// (a row of wild_pose), in the light pass and the shadow pass alike. A leg
// swings through the gait with a knee lift (or folds up under the belly, or
// trails behind in flight), the tail wags and lifts, the wings fold back along
// the flanks or beat with the hand lagging the arm, the two spare joints work
// a jaw, an ear, a dewlap or a raised claw, and the head turns the neck by the
// weight each vertex carries. The web game's wildPose (src/fx/wild/rig.ts).
shader_type spatial;
render_mode cull_back;

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/lit.gdshaderinc"

/// per beast drawn this frame: (gait phase, stride, head pitch, head yaw),
/// (wingbeat phase, wingbeat, wing fold, tail wag), (special A, special B,
/// legs tucked, shade: 2 + shade wears the second colouring)
uniform highp sampler2D wild_pose : filter_nearest, repeat_disable;

varying vec3 v_col;
varying vec3 v_world;

vec3 w_rot_x(vec3 p, vec3 o, float a) { p -= o; float c = cos(a), s = sin(a); return o + vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
vec3 w_rot_y(vec3 p, vec3 o, float a) { p -= o; float c = cos(a), s = sin(a); return o + vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 w_rot_z(vec3 p, vec3 o, float a) { p -= o; float c = cos(a), s = sin(a); return o + vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }

// k = 1 poses a point, k = 0 a normal (pivots collapse to the origin, shifts vanish)
vec3 wild_posed(vec3 p, float k, vec4 rig, vec3 piv, vec4 hd, vec4 pa, vec4 pb, vec4 pc) {
	float part = rig.x;
	float w = rig.y;
	vec3 o = piv * k;
	if (part > 1.5 && part < 2.5) {
		// a leg swings through the gait; the foot lifts as it comes forward
		float ph = pa.x + rig.z;
		float a = sin(ph) * pa.y;
		float ax = mod(rig.w, 4.0);
		// tucked: folded up under the belly (lying down) or trailed behind (in flight)
		p = o + (p - o) * mix(1.0, 0.45, pc.z);
		a = mix(a, 1.35, pc.z);
		if (rig.w > 3.5) {
			// drawn up into the belly feathers
			p = o + (p - o) * mix(1.0, 0.3, pc.x);
			a = mix(a, 1.6, pc.x);
		}
		float lift = max(0.0, cos(ph)) * pa.y * 0.55 * (1.0 - pc.z) * max(0.0, piv.y - p.y) * k;
		if (ax < 0.5) p = w_rot_x(p, o, a);
		else if (ax < 1.5) p = w_rot_z(p, o, a * sign(piv.x + 1e-4));
		else p = w_rot_y(p, o, a * sign(piv.x + 1e-4));
		p.y += lift;
	} else if (part > 2.5 && part < 3.5) {
		p = w_rot_y(p, o, pb.w * w);
		p = w_rot_x(p, o, pc.y * w);
	} else if (part > 3.5 && part < 4.5) {
		// a wing folds back along the flank (span drawn in, swept back) or beats, the hand lagging
		float side = rig.w;
		float fold = pb.z;
		vec3 d = p - o;
		d.x *= mix(1.0, 0.42, fold);
		d.y *= mix(1.0, 0.6, fold);
		p = o + d;
		p = w_rot_y(p, o, side * fold * 1.45);
		p = w_rot_z(p, o, -side * fold * 0.12);
		float beat = sin(pb.x - w * 0.8) * pb.y * (1.0 + 0.35 * w) + 0.08 * (1.0 - fold) + pc.y;
		p = w_rot_z(p, o, side * beat * (1.0 - fold * 0.85));
	} else if (part > 4.5) {
		float s = part < 5.5 ? pc.x : pc.y;
		if (abs(rig.w) < 0.5) p = w_rot_x(p, o, s * w);
		else p = w_rot_z(p, o, s * w * rig.w);
	}
	if (hd.w > 0.0) {
		vec3 h = hd.xyz * k;
		if (part < 4.5) p.z -= pc.x * rig.z * hd.w * k;
		p = w_rot_x(p, h, pa.z * hd.w);
		p = w_rot_y(p, h, pa.w * hd.w);
	}
	return p;
}

void vertex() {
	int row = int(INSTANCE_CUSTOM.x + 0.5);
	vec4 pa = texelFetch(wild_pose, ivec2(0, row), 0);
	vec4 pb = texelFetch(wild_pose, ivec2(1, row), 0);
	vec4 pc = texelFetch(wild_pose, ivec2(2, row), 0);
	vec4 rig = vec4(CUSTOM1.z, CUSTOM1.w, CUSTOM2.x, CUSTOM2.y);
	vec3 piv = CUSTOM3.xyz;
	vec4 hd = vec4(UV.x, UV.y, UV2.x, CUSTOM2.z);
	vec3 p = wild_posed(VERTEX, 1.0, rig, piv, hd, pa, pb, pc);
	NORMAL = normalize(wild_posed(NORMAL, 0.0, rig, piv, hd, pa, pb, pc));
	VERTEX = p;
	// the shade, and which of the two colourings this one wears
	vec3 alt = vec3(CUSTOM0.a, CUSTOM1.x, CUSTOM1.y);
	v_col = pc.w > 1.9 ? alt * (pc.w - 2.0) : CUSTOM0.rgb * pc.w;
	v_world = (MODEL_MATRIX * vec4(p, 1.0)).xyz;
	lit_cloud = cloud_shadow(v_world.xz);
}

void fragment() {
	ALBEDO = v_col * wet_dim();
	ROUGHNESS = 0.78 * wet_gloss();
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
