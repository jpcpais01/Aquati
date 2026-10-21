// A ship's flag: the livery's field and emblem with a whisper of weave and a
// darker hoist sleeve, waving harder toward the fly. UV.x runs from the hoist
// (0) out to the fly (1), UV.y down from the top.
shader_type spatial;
render_mode cull_disabled;

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/heraldry.gdshaderinc"

uniform vec3 c_field : source_color = vec3(0.122, 0.639, 0.627);
uniform vec3 c_emblem : source_color = vec3(0.949, 0.769, 0.353);
uniform int emblem_kind = 1;
/// height over length
uniform float aspect = 0.62;
/// how hard it streams (wind)
instance uniform float flag_wind = 1.0;

varying vec3 v_world;

void vertex() {
	float a = UV.x;
	float t = TIME * (0.7 + 0.3 * flag_wind);
	VERTEX.z += sin(t * 7.0 - a * 9.0) * 0.18 * a * flag_wind;
	VERTEX.y += sin(t * 5.0 - a * 6.0) * 0.06 * a;
	// the cloth's slope for its normal
	float dz = cos(t * 7.0 - a * 9.0) * (-9.0) * 0.18 * a + sin(t * 7.0 - a * 9.0) * 0.18;
	NORMAL = normalize(vec3(-dz * flag_wind * 0.35, 0.0, 1.0));
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec3 col = c_field;
	vec2 p = vec2((UV.x - 0.5) / aspect, UV.y - 0.5) / 0.323;
	col = mix(col, c_emblem, emblem_cover(emblem_at(emblem_kind, p)));
	// weave, and the sleeve darker where the flag is bent round its halyard
	float rows = UV.y * 48.0;
	col *= 1.0 - 0.05 * (1.0 - smoothstep(0.2, 0.5, abs(fract(rows) - 0.5))) * (1.0 - smoothstep(0.3, 0.9, fwidth(rows)));
	col *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.06, UV.x));
	ALBEDO = col;
	ROUGHNESS = 0.8;
	SPECULAR = 0.3;
	BACKLIGHT = col * 0.3;
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
