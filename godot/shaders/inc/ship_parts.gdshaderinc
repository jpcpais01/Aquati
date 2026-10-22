// The body of ship_parts.gdshader and ship_parts_dmg.gdshader (with DAMAGE
// defined: the scorch and breaches of ship_damage.gdshaderinc, and the parts
// of a spar shot away dropped from the mesh).

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/ship_common.gdshaderinc"

/// lamplight paint is HDR: its colour times this
uniform float glow_gain = 5.0;

varying vec3 v_world;
varying vec3 v_obj;
#ifdef DAMAGE
#include "res://shaders/inc/ship_damage.gdshaderinc"
#endif

void vertex() {
#ifdef DAMAGE
	// a spar gone overboard: its triangles fold to a point and draw nothing
	if (spar_gone(COLOR.a, false)) {
		VERTEX = vec3(0.0);
	}
#endif
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_obj = VERTEX;
}

void fragment() {
	// the paint's alpha byte: kind (in quarters) x 16 + spar (MeshKit.code)
	int kind = int(floor(COLOR.a * 255.0 + 0.25)) >> 4;
	vec3 col = srgb_to_linear(COLOR.rgb);
	float rope = kind == 1 ? 1.0 : 0.0;
	float iron = kind == 2 ? 1.0 : 0.0;
	float glass = kind == 3 ? 1.0 : 0.0;
	float gilt = kind == 4 ? 1.0 : 0.0;
	float wood = 1.0 - rope - iron - glass - gilt;
	// a whisper of grain along the timber, so a spar isn't a plastic rod
	float g = sin(v_obj.y * 9.0 + sin(v_obj.x * 3.0 + v_obj.z * 2.0) * 3.0) * 0.5 + 0.5;
	col *= 1.0 - wood * 0.06 * g;
	vec3 glow = col * glass * glow_gain;
	col *= 1.0 - glass;
	float metal = iron * 0.75 + gilt * 0.8;
	float rough = wood * 0.66 + rope * 0.9 + iron * 0.32 + gilt * 0.3 + glass * 0.15;
#ifdef DAMAGE
	bool drop;
	// the hold's floor (kind 5) is never shot through
	glow += hull_damage(v_obj, true, kind != 5, col, rough, metal, drop);
	if (drop) {
		discard;
	}
#endif
	ALBEDO = col;
	METALLIC = metal;
	ROUGHNESS = rough;
	SPECULAR = 0.5 * (1.0 - glass);
	EMISSION = glow;
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
