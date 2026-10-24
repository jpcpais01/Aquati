// The body of ship_flag.gdshader and ship_flag_dmg.gdshader (with DAMAGE
// defined: the colours shot to rags, see ship_damage.gdshaderinc).

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/common.gdshaderinc"
#define LIT_SPECULAR 0.3
#define LIT_BACKLIGHT
#include "res://shaders/inc/lit.gdshaderinc"

/// the flag as Heraldry draws it: field, pattern, emblem and the hand-painted
/// layer, its shape cut from the fly in alpha
uniform sampler2D flag_tex : source_color, filter_linear_mipmap, repeat_disable;
/// while the Shipwright's brush is at work: its layer (premultiplied, as its
/// canvas keeps it) over a flag drawn without it
uniform bool painting = false;
uniform sampler2D paint_tex : filter_linear, repeat_disable, hint_default_transparent;
/// how hard it streams (wind)
instance uniform float flag_wind = 1.0;

varying vec3 v_world;
#ifdef DAMAGE
#include "res://shaders/inc/ship_damage.gdshaderinc"
#endif

void vertex() {
	float a = UV.x;
	float t = TIME * (0.7 + 0.3 * flag_wind);
	VERTEX.z += sin(t * 7.0 - a * 9.0) * 0.18 * a * flag_wind;
	VERTEX.y += sin(t * 5.0 - a * 6.0) * 0.06 * a;
	// the cloth's slope for its normal
	float dz = cos(t * 7.0 - a * 9.0) * (-9.0) * 0.18 * a + sin(t * 7.0 - a * 9.0) * 0.18;
	NORMAL = normalize(vec3(-dz * flag_wind * 0.35, 0.0, 1.0));
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	lit_cloud = cloud_shadow(v_world.xz);
}

void fragment() {
	vec4 f = texture(flag_tex, UV);
	if (f.a < 0.5) {
		discard;
	}
	vec3 col = f.rgb;
	if (painting) {
		vec4 p = texture(paint_tex, UV);
		if (p.a > 0.004) {
			col = mix(col, srgb_to_linear(p.rgb / p.a), p.a);
		}
	}
	// weave, and the sleeve darker where the flag is bent round its halyard
	float rows = UV.y * 48.0;
	col *= 1.0 - 0.05 * (1.0 - smoothstep(0.2, 0.5, abs(fract(rows) - 0.5))) * (1.0 - smoothstep(0.3, 0.9, fwidth(rows)));
	col *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.06, UV.x));
#ifdef DAMAGE
	bool drop;
	EMISSION = canvas_damage(UV, 0.0, col, drop);
	if (drop) {
		discard;
	}
#endif
	ALBEDO = col * wet_dim();
	ROUGHNESS = 0.8 * wet_gloss();
	SPECULAR = 0.3;
	BACKLIGHT = col * 0.3;
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
