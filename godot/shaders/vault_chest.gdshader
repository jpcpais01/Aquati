// The Treasure Vault's great chest (VaultStage): planked mahogany banded and
// studded in gold, its lid, the gem in its lock and the hoard heaped inside,
// each a mesh of its own placed by the stage. Paint as MeshKit lays it: the
// vertex colour (sRGB), its alpha byte the stuff (MeshKit.code): wood, iron,
// lamplight (the gem, the hoard's gold) or gilt. Lamplight is HDR: its
// colour times glow_gain, tinted by glow (the gem takes the rarity's colour,
// the hoard brightens as the lid swings up).
shader_type spatial;
render_mode cull_back;

#include "res://shaders/inc/common.gdshaderinc"
#include "res://shaders/inc/atmos.gdshaderinc"
varying float lit_spec;
#define LIT_SPECULAR lit_spec
#include "res://shaders/inc/lit.gdshaderinc"

uniform float glow_gain = 3.0;
/// The lamplight's tint (linear; 1 is its own paint).
uniform vec3 glow = vec3(1.0);

varying vec3 v_world;
varying vec3 v_obj;

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_obj = VERTEX;
	lit_cloud = cloud_shadow(v_world.xz);
}

void fragment() {
	// the paint's alpha byte: kind (in quarters) x 16 (MeshKit.code)
	int kind = int(floor(COLOR.a * 255.0 + 0.25)) >> 4;
	vec3 col = srgb_to_linear(COLOR.rgb);
	float iron = kind == 2 ? 1.0 : 0.0;
	float lamp = kind == 3 ? 1.0 : 0.0;
	float gilt = kind == 4 ? 1.0 : 0.0;
	float wood = 1.0 - iron - lamp - gilt;
	// grain along the planks
	float g = sin(v_obj.x * 9.0 + sin(v_obj.y * 5.0 + v_obj.z * 4.0) * 2.0) * 0.5 + 0.5;
	col *= 1.0 - wood * 0.1 * g;
	ALBEDO = col * (1.0 - lamp) * wet_dim();
	// (the web's gilt is 0.9 metal under a warm sky map; under this sky a
	// mirror that bright takes on the sea's blue and goes olive, so it's
	// held a little short of metal and keeps a warm sheen of its own)
	METALLIC = iron * 0.7 + gilt * 0.55;
	ROUGHNESS = (wood * 0.62 + iron * 0.34 + gilt * 0.3 + lamp * 0.2) * wet_gloss();
	lit_spec = 0.5 * (1.0 - lamp);
	SPECULAR = lit_spec;
	EMISSION = col * lamp * glow_gain * glow + col * gilt * 0.18;
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
