// The body of ship_parts.gdshader and ship_parts_dmg.gdshader (with DAMAGE
// defined: the scorch and breaches of ship_damage.gdshaderinc, and the parts
// of a spar shot away dropped from the mesh), and of their SKIN variants
// (your own ship's: her painted woodwork, kind 6, wears her vault skin).

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/ship_common.gdshaderinc"
varying float lit_spec;
#define LIT_SPECULAR lit_spec
#include "res://shaders/inc/lit.gdshaderinc"

/// lamplight paint is HDR: its colour times this
uniform float glow_gain = 5.0;
/// gold leaf that shines a little of its own (a trading port's domes and
/// bells, the web's gold emissive); none on a ship
uniform vec3 gilt_glow = vec3(0.0);

varying vec3 v_world;
varying vec3 v_obj;
#ifdef DAMAGE
#include "res://shaders/inc/ship_damage.gdshaderinc"
#endif
#ifdef SKIN
#include "res://shaders/inc/ship_skin.gdshaderinc"
varying vec3 v_skin_n;
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
	lit_cloud = cloud_shadow(v_world.xz);
#ifdef SKIN
	v_skin_n = NORMAL;
#endif
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
	if (glass > 0.0) {
		// a lamp holds its own brightness through the night (the night grade
		// opens the exposure up more than twice): a hot heart where the eye
		// looks straight into the glass, the rim falling away, and it breathes
		// like a flame (the web game's render/lamps.ts)
		float face = abs(dot(normalize(NORMAL), VIEW));
		float heart = mix(0.5, 1.08, face * face);
		float seed = dot(v_obj, vec3(0.83, 1.31, 0.57));
		float breath = 0.94 + 0.06 * sin(TIME * 8.3 + seed * 9.0) * sin(TIME * 5.1 + seed * 4.0);
		glow *= mix(1.0, 0.42 * heart * breath, smoothstep(0.05, 0.8, night));
	}
	col *= 1.0 - glass;
	float metal = iron * 0.75 + gilt * 0.8;
	float rough = wood * 0.66 + rope * 0.9 + iron * 0.32 + gilt * 0.3 + glass * 0.15;
#ifdef SKIN
	if (skin_id > 0 && kind == 6) {
		// painted woodwork (her inner bulwarks, a pavisade's shields), laid on
		// whichever way the face looks most
		vec3 sn = abs(normalize(v_skin_n));
		vec2 sp = sn.y > max(sn.x, sn.z) ? v_obj.zx : (sn.x >= sn.z ? v_obj.zy : v_obj.xy);
		vec3 se = vec3(0.0);
		col = aq_skin(sp, abs(dot(normalize(NORMAL), VIEW)), TIME, 0.0, se, metal, rough);
		glow += skin_light(se * (0.55 + night * 0.9), 1.25);
	}
#endif
#ifdef DAMAGE
	bool drop;
	// the hold's floor (kind 5) is never shot through
	glow += hull_damage(v_obj, true, kind != 5, col, rough, metal, drop);
	if (drop) {
		discard;
	}
#endif
	ALBEDO = col * wet_dim();
	METALLIC = metal;
	ROUGHNESS = rough * wet_gloss();
	lit_spec = 0.5 * (1.0 - glass);
	SPECULAR = lit_spec;
	EMISSION = glow + gilt * gilt_glow;
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
