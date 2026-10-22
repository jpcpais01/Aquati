// The body of ship_flag.gdshader and ship_flag_dmg.gdshader (with DAMAGE
// defined: the colours shot to rags, see ship_damage.gdshaderinc).

#include "res://shaders/inc/atmos.gdshaderinc"
#include "res://shaders/inc/heraldry.gdshaderinc"

uniform vec3 c_field : source_color = vec3(0.122, 0.639, 0.627);
uniform vec3 c_emblem : source_color = vec3(0.949, 0.769, 0.353);
uniform int emblem_kind = 1;
/// height over length
uniform float aspect = 0.62;
/// a pirate's rag: a ragged fly, a frayed corner and shot holes
uniform bool tattered = false;
/// how hard it streams (wind)
instance uniform float flag_wind = 1.0;

varying vec3 v_world;
#ifdef DAMAGE
#include "res://shaders/inc/ship_damage.gdshaderinc"
#endif

float flag_hash(float n) {
	return fract(sin(n * 12.9898 + 4.1414) * 43758.5453);
}

// The fly edge where a tattered flag is torn: a jagged line a little in from
// the end, now and then bitten deeper.
float fly_edge(float row) {
	float x = 0.86 + flag_hash(row) * 0.13;
	return x - (flag_hash(row + 31.7) < 0.18 ? 0.08 : 0.0);
}

// Inside a torn shot hole, ragged round its rim; c and r in flag heights.
bool in_hole(vec2 uv, vec2 c, float r, float seed) {
	vec2 d = vec2((uv.x - c.x) / aspect, uv.y - c.y);
	float a = atan(d.y, d.x);
	float rim = r * (1.0 + 0.22 * sin(a * 4.0 + seed) + 0.12 * sin(a * 7.0 + seed * 2.3));
	return length(d) < rim;
}

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
	if (tattered) {
		float rows = UV.y / 0.075;
		float k = floor(rows);
		float edge = mix(fly_edge(k), fly_edge(k + 1.0), fract(rows));
		float corner = 0.94 + 0.06 * (UV.x < 0.62 ? (0.62 - UV.x) / 0.07 : (UV.x - 0.62) / 0.08);
		if (UV.x > edge || UV.y > corner || in_hole(UV, vec2(0.66, 0.24), 0.045, 1.0) || in_hole(UV, vec2(0.78, 0.7), 0.035, 2.7) || in_hole(UV, vec2(0.36, 0.84), 0.028, 4.2)) {
			discard;
		}
	}
	vec3 col = c_field;
	vec2 p = vec2((UV.x - 0.5) / aspect, UV.y - 0.5) / 0.323;
	col = mix(col, c_emblem, emblem_cover(emblem_at(emblem_kind, p)));
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
	ALBEDO = col;
	ROUGHNESS = 0.8;
	SPECULAR = 0.3;
	BACKLIGHT = col * 0.3;
	FOG = air_fog(v_world, CAMERA_POSITION_WORLD);
}
