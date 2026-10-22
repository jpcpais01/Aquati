// Everything on a ship that isn't skin, deck or canvas: spars, rails, wales,
// guns and their carriages, ironwork, gilding and lamps, all in one mesh. The
// vertex colour carries the paint (sRGB), its alpha the stuff it's made of:
//   0 wood, 0.25 rope, 0.5 iron and bronze, 0.75 lamplight, 1 gilt.
shader_type spatial;
render_mode cull_back;

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/ship_common.gdshaderinc"

/// lamplight paint is HDR: its colour times this
uniform float glow_gain = 5.0;

varying vec3 v_world;
varying vec3 v_obj;

void vertex() {
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	v_obj = VERTEX;
}

void fragment() {
	float kind = COLOR.a;
	vec3 col = srgb_to_linear(COLOR.rgb);
	float rope = 1.0 - smoothstep(0.1, 0.2, abs(kind - 0.25));
	float iron = 1.0 - smoothstep(0.1, 0.2, abs(kind - 0.5));
	float glass = 1.0 - smoothstep(0.1, 0.2, abs(kind - 0.75));
	float gilt = smoothstep(0.85, 0.95, kind);
	float wood = clamp(1.0 - rope - iron - glass - gilt, 0.0, 1.0);
	// a whisper of grain along the timber, so a spar isn't a plastic rod
	float g = sin(v_obj.y * 9.0 + sin(v_obj.x * 3.0 + v_obj.z * 2.0) * 3.0) * 0.5 + 0.5;
	col *= 1.0 - wood * 0.06 * g;
	ALBEDO = col * (1.0 - glass);
	METALLIC = iron * 0.75 + gilt * 0.8;
	ROUGHNESS = wood * 0.66 + rope * 0.9 + iron * 0.32 + gilt * 0.3 + glass * 0.15;
	SPECULAR = 0.5 * (1.0 - glass);
	EMISSION = col * glass * glow_gain;
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
