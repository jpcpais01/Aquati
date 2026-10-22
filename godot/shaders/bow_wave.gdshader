// The bow wave: a curling sheet of white water that climbs the stem where the
// hull shoulders the sea aside, peels back along both bows and lands on the
// surface as a ribbon of lace. Its shape lives here and scales with speed
// (keep bow_sheet() in step with BowWave.sheet_reach()); its whitewater is the
// same bubble web as the sea's foam.
//
// Each vertex sits on the hull's waterline: UV = (s along the hull from the
// stem, v across the sheet), UV2 = (side, seed), NORMAL.xz = the way the sheet
// flares out.
shader_type spatial;
render_mode unshaded, blend_premul_alpha, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

#include "res://shaders/inc/atmos.gdshaderinc"

uniform sampler2D foam_tex : repeat_enable, filter_linear_mipmap;
uniform float beam = 6.2;
/// 0 .. ~1.2 with speed
instance uniform float amp = 0.0;
/// how far the water has streamed past (m), for the foam's flow
instance uniform float flow = 0.0;

varying vec3 v_world;
varying vec2 v_sv;
varying float v_reach;
varying float v_env;

vec3 bow_sheet(float s, float v, float seed, vec2 dir, float a, float b, float t, out float env, out float reach) {
	float k = sqrt(b / 6.2);
	// climbs the stem, peaks a little aft of it, and subsides toward the shoulder
	env = smoothstep(0.0, 0.1, s) * (1.0 - smoothstep(0.18, 1.0, s) * 0.85);
	// the crest heaves and flickers as the bow meets each swell
	float flick = 1.0 + 0.16 * sin(t * 6.3 + seed) * sin(t * 2.7 + seed * 1.7) + 0.08 * sin(t * 13.0 + seed * 3.0);
	float h = (0.18 + 0.7 * a) * k * env * flick;
	reach = (0.25 + 1.9 * pow(s, 0.8)) * (0.35 + 0.65 * min(a, 1.2)) * k;
	// across: rises off the hull, rolls over into a curling lip, then runs out flat onto the sea
	float lip = sin(PI * clamp(v * 1.25, 0.0, 1.0));
	float y = h * pow(1.0 - v, 1.4) * (1.0 + 0.45 * lip) + h * 0.06;
	float out_ = reach * v + h * 0.35 * lip * smoothstep(0.15, 0.6, v);
	return vec3(dir.x * out_, y, dir.y * out_);
}

void vertex() {
	float env;
	float reach;
	VERTEX += bow_sheet(UV.x, UV.y, UV2.y, NORMAL.xz, amp, beam, TIME, env, reach);
	v_env = env;
	v_reach = reach;
	v_sv = UV;
	v_world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	float s = v_sv.x;
	float v = v_sv.y;
	// the whitewater streams aft along the hull as fast as she sails, and spreads outward
	vec2 fuv = vec2((1.0 - s) * 1.25 + flow * 0.12, v * v_reach * 0.13 + s * 0.4);
	float web = texture(foam_tex, fuv).r * 0.72 + texture(foam_tex, fuv * vec2(1.7, 1.4) + vec2(0.31, 0.57) + vec2(flow * 0.07, 0.0)).b * 0.28;
	// solid white where it tumbles over the crest, opening into lace as it runs out and aft
	float cover = (0.98 - v * 0.62) * (0.55 + 0.45 * v_env) - s * 0.25;
	float w = 0.09 + fwidth(web) * 0.6;
	float foam = smoothstep(1.0 - cover - w, 1.0 - cover + w, web);
	// the glassy face under the foam: a thin turquoise film catching the light
	vec3 n = normalize(cross(dFdx(v_world), dFdy(v_world)));
	n = n.y < 0.0 ? -n : n;
	float ndl = max(dot(n, sun_dir), 0.0);
	vec3 light = sun_color * (0.25 + 0.75 * ndl) * 0.42 + sky_zenith * 0.8;
	vec3 foam_col = vec3(0.96, 0.98, 1.0) * light;
	vec3 face_col = vec3(0.06, 0.34, 0.36) * light * 0.9 + sun_color * pow(ndl, 24.0) * 0.12;
	float face = 0.42 * (1.0 - v * 0.6) * v_env;
	float edge = smoothstep(0.0, 0.05, s) * (1.0 - smoothstep(0.75, 1.0, s)) * (1.0 - smoothstep(0.82, 1.0, v));
	float a = max(foam * 0.96, face) * edge * smoothstep(0.02, 0.12, amp);
	if (a < 0.004) {
		discard;
	}
	vec3 col = mix(face_col, foam_col, foam);
	vec4 fog = air_fog(v_world, CAMERA_POSITION_WORLD);
	col = mix(col, fog.rgb, fog.a);
	ALBEDO = col * a;
	ALPHA = a;
}
